// What happens when something goes wrong.
//
// Before this file the answer was: nothing. There was no window.onerror and no
// unhandledrejection handler anywhere in the app, so a thrown exception left
// the screen exactly as it was — measured byte-for-byte identical — with no
// message. Someone taps Jobs, nothing happens, they tap again, nothing happens.
// The app is not broken in a way they can see, report, or recover from, and
// "it did nothing and said nothing" is the most unpolished thing software can
// do.
//
// There is a lot of ground for that to happen on: nearly three hundred places
// that do `$('some-id').onclick = …` with no null check, any one of which
// throws and kills the rest of the function it is in. That is not a list to
// fix one by one — it is a reason to make failure visible and contained.
//
// So this file does three things:
//
//   SEES it     — global handlers catch what nothing was catching.
//   SHOWS it    — a banner the user can read, dismiss, and screenshot.
//   CONTAINS it — jtTry() keeps one failing area from taking the rest down,
//                 so a broken view still leaves a working nav.
//
// Loaded first, before any other app script, so it is already listening while
// the rest of the app boots.

// ── Reporting ───────────────────────────────────────────────────────────────

// Repeats are counted rather than stacked. A throw inside render() fires on
// every redraw, and twenty identical banners is its own kind of broken.
const JT_ERRORS = { seen: {}, last: null, count: 0 };

function jtErrorText(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  return String(err.message || err) || 'Unknown error';
}

function jtReportError(err, where) {
  const msg = jtErrorText(err);
  const key = (where || '') + '|' + msg;
  JT_ERRORS.seen[key] = (JT_ERRORS.seen[key] || 0) + 1;
  JT_ERRORS.count++;
  JT_ERRORS.last = { msg: msg, where: where || '', at: Date.now(), n: JT_ERRORS.seen[key] };
  // Still goes to the console with its stack — this replaces silence for the
  // user, not the tools someone debugging would reach for.
  try { console.error('[' + (where || 'app') + ']', err); } catch (e) {}
  jtShowErrorBanner();
  return JT_ERRORS.last;
}

// ── The banner ──────────────────────────────────────────────────────────────

// Deliberately says the work is safe, because that is the first thing anyone
// wants to know and it is true: writes go to localStorage first and Firebase
// second, and a failed cloud write already raises its own message.
//
// Details are one tap away rather than hidden, because the realistic support
// path here is a crew member screenshotting the screen and sending it on.
function jtShowErrorBanner() {
  if (typeof document === 'undefined' || !document.body) return;
  let el = document.getElementById('jt-err');
  if (!el) {
    el = document.createElement('div');
    el.id = 'jt-err';
    el.setAttribute('role', 'alert');
    document.body.appendChild(el);
  }
  const e = JT_ERRORS.last || { msg: '', where: '' };
  el.innerHTML = `
    <div class="jt-err-row">
      <div class="jt-err-main">
        <div class="jt-err-title">Something went wrong${JT_ERRORS.count > 1 ? ' (' + JT_ERRORS.count + ')' : ''}</div>
        <div class="jt-err-sub">Your work is saved. Reloading usually clears it.</div>
      </div>
      <button class="jt-err-btn" id="jt-err-reload">Reload</button>
      <button class="jt-err-x" id="jt-err-close" aria-label="Dismiss">×</button>
    </div>
    <button class="jt-err-more" id="jt-err-toggle">Details</button>
    <pre class="jt-err-detail" id="jt-err-detail" hidden>${jtEscape(e.where + ' — ' + e.msg)}</pre>`;

  const byId = id => document.getElementById(id);
  const close = byId('jt-err-close');
  if (close) close.onclick = () => { el.remove(); };
  const reload = byId('jt-err-reload');
  if (reload) reload.onclick = () => { try { location.reload(); } catch (x) {} };
  const toggle = byId('jt-err-toggle');
  if (toggle) toggle.onclick = () => {
    const d = byId('jt-err-detail');
    if (d) d.hidden = !d.hidden;
  };
}

// Its own escaper rather than the app's esc(): this file loads before
// everything, and the one thing that must never throw is the error reporter.
function jtEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Containment ─────────────────────────────────────────────────────────────

// Run something and report rather than propagate. Returns a fallback on
// failure, so a caller can carry on with the next thing.
//
// This is what turns "one broken area breaks everything after it" into "one
// broken area is broken". attachHandlers() runs eight attach functions in a
// row; without this, a throw in the first leaves the other seven unwired and
// most of the app inert with nothing said.
function jtTry(fn, where, fallback) {
  try {
    return fn();
  } catch (e) {
    jtReportError(e, where);
    return fallback;
  }
}

// Assign a handler to an element that might not be there.
//
// Assignment, not addEventListener, on purpose: handlers are rebound on every
// render, and accumulating listeners on the elements that persist outside
// #content would fire them two, three, ten times per press.
function onId(id, event, fn) {
  const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
  if (!el) return false;
  el['on' + event] = fn;
  return true;
}

// What a view that failed to render shows in its place. In-place rather than
// full-screen so the nav above it still works and the person can go somewhere
// else instead of being stuck.
function jtViewErrorHTML(view, err) {
  return `<div class="tt-empty" style="padding:36px 18px;text-align:center">
    <p style="font-size:14px;color:var(--text-2);margin-bottom:6px">This screen could not be drawn.</p>
    <p style="font-size:12.5px;color:var(--text-3);line-height:1.6">Your work is saved. Try another tab, or reload the app.</p>
    <pre style="margin-top:14px;font-size:11px;color:var(--text-3);white-space:pre-wrap;text-align:left">${jtEscape(String(view || '') + ' — ' + jtErrorText(err))}</pre>
  </div>`;
}

// ── Global handlers ─────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  window.addEventListener('error', ev => {
    // Failed <script>/<img> loads arrive here too and are not app exceptions;
    // they have no `error` object and a target that is not the window.
    if (ev && ev.target && ev.target !== window) return;
    jtReportError((ev && ev.error) || (ev && ev.message), 'uncaught');
  });
  window.addEventListener('unhandledrejection', ev => {
    jtReportError((ev && ev.reason) || 'Unhandled promise rejection', 'promise');
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    JT_ERRORS, jtErrorText, jtReportError, jtShowErrorBanner, jtEscape,
    jtTry, onId, jtViewErrorHTML,
  };
}
