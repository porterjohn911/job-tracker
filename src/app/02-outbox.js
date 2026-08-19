// Saves that have not reached the server yet.
//
// The problem this exists to solve, measured rather than assumed:
//
//   1. Firebase's set() resolves only when the SERVER acknowledges. With no
//      signal it never resolves — so `await writeJob(j)` never returns, and
//      every save handler in the app is shaped `await write…; toast(); close()`.
//      Measured: press Add Job in a dead zone and the modal sits there open
//      with no message, forever. Press it again — because nothing happened —
//      and you get two jobs, since `mode === 'add'` mints a fresh uid() per
//      click.
//
//   2. The Firebase web SDK keeps its pending writes in MEMORY. Close the tab
//      in that dead zone and the queued write is gone. localStorage still has
//      the edit, but nothing marks it as unsent, so the next sync overwrites
//      it with server truth. Measured: a note written offline is silently and
//      permanently lost across a reload.
//
// So a save can no longer mean "the server has it". It means "this device has
// it, and it is written down that the server does not". That second half is
// what this file is: a durable record, in localStorage, of what still owes a
// trip to the server — survives a reload, drains on reconnect, and shows an
// honest count in the sync bar in the meantime.
//
// Contracts and entities deliberately do NOT come through here. They keep
// awaiting their writes and throwing loudly (ctWriteContract / meWrite),
// because they are office actions rather than dock actions and their loud
// failure path is newly built and working.

// Flip to false and every writer falls back to the old awaited path, byte for
// byte. The escape hatch for a change that touches every save in the app.
let OUTBOX_ON = true;

// path -> { value, label, op, at }. Keyed by path on purpose: twenty edits to
// one job while offline collapse into one write, because the last value is the
// truth and replaying the steps between costs bandwidth to reach the same
// place.
let OUTBOX = {};
let OUTBOX_SENDING = false;

// Every send is raced against this. Without it the first offline send sits on
// a promise that never settles, OUTBOX_SENDING stays true for the life of the
// page, and the queue never drains again — a worse failure than the one this
// file exists to fix, and the reason the timeout is not optional.
//
// A timed-out send is treated as undelivered, not as failed: the entry keeps
// its place and a later pass retries it. If the original write does land after
// all, the retry is a set() of the same value to the same path, so it costs a
// round trip and changes nothing.
let OUTBOX_SEND_TIMEOUT = 15000;

// Identifies the current flush so a newer one can take over from a stalled
// older one — which is exactly what reconnecting should do.
let OUTBOX_RUN = 0;

// Entries above this are held in memory but never written to localStorage.
// A job carrying an inline base64 photo (the fallback when Storage is
// unreachable) can be megabytes, and the cache has ~5MB for everything.
//
// Skipping rather than stripping is deliberate. A stripped copy sent after a
// reload would overwrite the cloud's good record with a photo-less one — the
// fix causing its own data loss. Not persisting means that rare entry behaves
// exactly as it does today, and nothing is clobbered.
const OUTBOX_MAX_ENTRY = 256 * 1024;
const OUTBOX_MAX_ENTRIES = 200;

function outboxKey() { return LS('outbox'); }

function outboxLoad() {
  try { OUTBOX = JSON.parse(localStorage.getItem(outboxKey()) || '{}') || {}; }
  catch (e) { OUTBOX = {}; }
  if (!OUTBOX || typeof OUTBOX !== 'object') OUTBOX = {};
  return OUTBOX;
}

function outboxPersist() {
  const keep = {};
  Object.keys(OUTBOX).forEach(path => {
    const e = OUTBOX[path];
    let size = 0;
    try { size = JSON.stringify(e).length; } catch (x) { return; }
    if (size <= OUTBOX_MAX_ENTRY) keep[path] = e;
  });
  try { localStorage.setItem(outboxKey(), JSON.stringify(keep)); }
  catch (e) {
    // The cache is full. The in-memory outbox still works for this session;
    // what is lost is only surviving a reload, which is what it was before.
    if (typeof reportLocalSaveError === 'function') reportLocalSaveError('pending changes', e, false);
  }
}

function outboxCount() { return Object.keys(OUTBOX).length; }

function outboxPut(path, value, label, op) {
  if (!path) return;
  // Oldest-first eviction, and it says so rather than quietly dropping work.
  const keys = Object.keys(OUTBOX);
  if (keys.length >= OUTBOX_MAX_ENTRIES && !OUTBOX[path]) {
    const oldest = keys.sort((a, b) => (OUTBOX[a].at || 0) - (OUTBOX[b].at || 0))[0];
    delete OUTBOX[oldest];
    if (typeof toast === 'function') toast('Too many unsent changes — the oldest was dropped', '');
  }
  OUTBOX[path] = { value: value, label: label || 'data', op: op || 'set', at: Date.now() };
  outboxPersist();
  syncPendingUI();
}

function outboxDone(path) {
  delete OUTBOX[path];
  outboxPersist();
  syncPendingUI();
}

// Send what is queued. Never awaited by a caller — that is the entire point.
//
// The two failure kinds need opposite handling. A rules rejection will fail
// identically on every retry, so retrying is a loop that never ends and never
// says why; it is reported and dropped. Anything else is a delivery problem
// worth keeping for the next reconnect.
// One write, raced against the clock. Resolves with an outcome rather than
// rejecting, so a rejected write cannot escape as an unhandled rejection when
// the timeout wins the race.
function outboxSend(path, e) {
  let timer = null;
  const write = (e.op === 'remove') ? DB.child(path).remove() : DB.child(path).set(e.value);
  const settled = write.then(() => ({ ok: true }), err => ({ ok: false, err: err }));
  const timeout = new Promise(res => { timer = setTimeout(() => res({ ok: false, timedOut: true }), OUTBOX_SEND_TIMEOUT); });
  return Promise.race([settled, timeout]).then(r => { if (timer) clearTimeout(timer); return r; });
}

async function outboxFlush(force) {
  if (!OUTBOX_ON) return 0;
  if (OUTBOX_SENDING && !force) return 0;
  if (typeof DB === 'undefined' || !DB) return 0;
  // Claim the flush. Any older pass still waiting on a stalled write sees a
  // changed token and stands down instead of racing this one.
  const run = ++OUTBOX_RUN;
  OUTBOX_SENDING = true;
  let sent = 0;
  try {
    for (const path of Object.keys(OUTBOX)) {
      if (run !== OUTBOX_RUN) return sent;
      const e = OUTBOX[path];
      if (!e) continue;
      const r = await outboxSend(path, e);
      if (run !== OUTBOX_RUN) return sent;
      if (r.ok) { outboxDone(path); sent++; continue; }
      // No line right now. Everything keeps its place for the next pass.
      if (r.timedOut) break;
      const denied = /permission[_ ]denied/i.test(String((r.err && r.err.code) || (r.err && r.err.message) || ''));
      if (denied) {
        // Dropped first, then reported — otherwise the queue-count refresh
        // inside outboxDone overwrites the error the person needs to read.
        outboxDone(path);
        if (typeof showCloudSaveError === 'function') showCloudSaveError(e.label, r.err);
      }
      // Stop either way: if the connection is down, the rest fail the same.
      break;
    }
  } finally {
    if (run === OUTBOX_RUN) OUTBOX_SENDING = false;
  }
  return sent;
}

// What every converted writer calls instead of `await writeDB(...)`.
function cloudSave(path, value, label) {
  if (!OUTBOX_ON) return writeDB(path, value, label);
  outboxPut(path, value, label, 'set');
  outboxFlush();
  return Promise.resolve(true);
}

function cloudRemove(path, label) {
  if (!OUTBOX_ON) return removeDB(path, label);
  outboxPut(path, null, label, 'remove');
  outboxFlush();
  return Promise.resolve(true);
}

// ── The sync bar ────────────────────────────────────────────────────────────

// Before this the bar only ever said "Reconnecting…", and said nothing at all
// when the connection came back. Someone who saved in a dead zone had no way
// to tell whether their work had gone up.
function syncPendingUI() {
  if (typeof syncStatus !== 'function') return;
  const n = outboxCount();
  const online = (typeof SYNC !== 'undefined' && SYNC) ? SYNC.online !== false : true;
  if (typeof DB === 'undefined' || !DB) return;   // local-only mode owns its own message
  if (!online) syncStatus('err', n ? ('Offline · ' + n + ' waiting to sync') : 'Offline · working locally');
  else if (n) syncStatus('pulse', 'Saving ' + n + '…');
  else syncStatus('ok', 'Team sync live');
}

// ── Double-submit guard ─────────────────────────────────────────────────────

// The app already knew this pattern — PDF building and the Storage mover both
// disable their button and show progress. It was missing from every button
// that writes data, which is where it mattered most: a save that appeared to
// do nothing invited a second press, and a second press on the add path mints
// a new id and creates a duplicate record.
function guardBtn(id, fn) {
  const btn = (typeof document !== 'undefined') ? document.getElementById(id) : null;
  if (!btn) return false;
  if (btn.dataset && btn.dataset.busy) return false;
  if (btn.dataset) btn.dataset.busy = '1';
  const old = btn.textContent;
  const wasDisabled = btn.disabled;
  btn.disabled = true;
  btn.textContent = 'Saving…';
  const release = () => {
    if (btn.dataset) delete btn.dataset.busy;
    // The usual outcome is that the modal closed and the button is gone.
    if (typeof document !== 'undefined' && document.body && document.body.contains(btn)) {
      btn.disabled = wasDisabled;
      btn.textContent = old;
    }
  };
  Promise.resolve()
    .then(fn)
    .catch(e => { if (typeof jtReportError === 'function') jtReportError(e, 'save:' + id); })
    .then(release, release);
  return true;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    outboxLoad, outboxPersist, outboxCount, outboxPut, outboxDone, outboxFlush,
    cloudSave, cloudRemove, syncPendingUI, guardBtn,
  };
}
