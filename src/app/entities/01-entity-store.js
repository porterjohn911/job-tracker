// Managed entities — the record, and the data layer around it.
//
// A managed entity is a business GMM runs. It is not a customer: a customer
// buys work, an entity IS the operation, and the money flowing between them is
// a management fee rather than an invoice for a job done.
//
// The record is deliberately thin. Everything about what GMM DOES for an
// entity — the bookkeeping, the compliance dates, the payroll — will hang off
// this later; what has to exist first is the roster itself and the fee basis,
// because every one of those pieces needs to know which entities exist and how
// each one pays.
//
// ── The link ────────────────────────────────────────────────────────────────
//
// An entity either points at a company already in this app or stands alone.
// Both are first-class. A linked entity can eventually have its fee computed
// from its own real numbers; a standalone one is a business GMM runs whose
// books live elsewhere, and its figures are entered.
//
// ── Failing closed ──────────────────────────────────────────────────────────
//
// Follows 02-contract-store.js exactly: normalization fails into a state that
// bills nothing rather than one that bills wrongly, and writes go through a
// reporting helper that rethrows. A swallowed rejection here would be invisible
// AND self-erasing — Firebase applies optimistically, the server rejects, and
// the listener overwrites state with server truth, so the record appears and
// then vanishes with nothing said. That is how contracts were lost once
// already.
//
// Requires 00-entity-gate.js.

const ME_STATUSES = ['active', 'paused', 'ended'];
const ME_FEE_BASES = ['flat', 'percent', 'costplus', 'hourly'];
const ME_PERCENT_OF = ['invoiced', 'collected'];

function meNewId() { return 'me_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }

function meStr(v, max) {
  const s = String(v == null ? '' : v).trim();
  return max ? s.slice(0, max) : s;
}

function meNum(v, max) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(Math.min(n, max) * 100) / 100;
}

function meDate(v) {
  const d = typeof ctParseDate === 'function' ? ctParseDate(v) : null;
  return d && typeof ctDateKey === 'function' ? ctDateKey(d) : '';
}

// The fee arrangement, whatever shape it takes.
//
// All four shapes are stored on the same object rather than in a union, so
// switching an entity from flat to percentage does not lose what was typed
// under the other basis. Someone comparing "what would this be at 6%?" against
// "what would this be at $2,500?" should be able to flip back and forth.
//
// The basis decides which fields are READ; the rest are simply carried.
function meNormFee(raw) {
  const src = raw || {};
  const basis = ME_FEE_BASES.indexOf(String(src.basis || '').toLowerCase()) >= 0
    ? String(src.basis).toLowerCase()
    : 'flat';
  const freq = (typeof ctNormalizeSchedule === 'function' && ctNormalizeSchedule({ freq: src.freq, interval: src.interval }))
    ? String(src.freq).toLowerCase()
    : 'monthly';
  const interval = Number.isInteger(Number(src.interval)) && Number(src.interval) >= 1 ? Number(src.interval) : 1;

  // A percentage is bounded well below 100: a management fee at or above the
  // entity's whole revenue is a typo, not an arrangement.
  const pct = (() => {
    const n = Math.round(Number(src.percent) * 100) / 100;
    return Number.isFinite(n) && n > 0 && n < 50 ? n : 0;
  })();
  const markup = (() => {
    const n = Math.round(Number(src.markup) * 100) / 100;
    return Number.isFinite(n) && n > 0 && n < 500 ? n : 0;
  })();

  return {
    basis: basis,
    // flat
    amount: meNum(src.amount, 1000000),
    freq: freq,
    interval: interval,
    // percentage of the entity's own revenue
    percent: pct,
    percentOf: ME_PERCENT_OF.indexOf(String(src.percentOf || '').toLowerCase()) >= 0
      ? String(src.percentOf).toLowerCase() : 'collected',
    // A floor and a cap are how nearly every percentage arrangement is really
    // written — "6% or $2,000, whichever is greater". Zero means unset.
    floor: meNum(src.floor, 1000000),
    cap: meNum(src.cap, 1000000),
    // cost plus a markup on what the entity actually costs GMM
    markup: markup,
    // hourly against management time logged for the entity
    rate: meNum(src.rate, 10000),
  };
}

// Normalize from any source — a form, localStorage, or a Firebase snapshot of
// unknown shape. Null only when there is no usable id.
//
// Status fails closed the same way a contract's does: anything unrecognized,
// and anything self-contradictory, lands on 'paused'.
function meNormalize(raw, id) {
  const src = raw || {};
  const eid = meStr(src.id || id, 64);
  if (!eid) return null;

  const startDate = meDate(src.startDate);
  const endDate = meDate(src.endDate);
  const contradictory = !!(startDate && endDate && endDate < startDate);

  let status = meStr(src.status).toLowerCase();
  if (ME_STATUSES.indexOf(status) < 0) status = 'paused';
  if (contradictory) status = 'paused';

  return {
    id: eid,
    name: meStr(src.name, 120),
    // The company in this app this entity IS, or '' when it stands alone.
    companyId: meStr(src.companyId, 24),
    status: status,
    startDate: startDate,
    endDate: endDate,
    contactName: meStr(src.contactName, 120),
    contactEmail: meStr(src.contactEmail, 160),
    contactPhone: meStr(src.contactPhone, 40),
    fee: meNormFee(src.fee),
    notes: meStr(src.notes, 2000),
    created: Number(src.created || 0) || 0,
    updatedAt: Number(src.updatedAt || 0) || 0,
    updatedBy: meStr(src.updatedBy, 80),
  };
}

// Reasons this entity will not do what its author expects. Surfaced on the card
// and in the editor, the same way a contract's issues are.
function meIssues(raw) {
  const e = meNormalize(raw);
  if (!e) return ['This entity has no ID.'];
  const out = [];
  if (!e.name) out.push('No name — it will be hard to find.');
  if (!e.startDate) out.push('No start date, so nothing can be billed from a period.');

  const f = e.fee;
  if (f.basis === 'flat' && !f.amount) out.push('Flat fee with no amount — this entity bills nothing.');
  if (f.basis === 'percent' && !f.percent) out.push('Percentage fee with no percentage set.');
  if (f.basis === 'percent' && !e.companyId) out.push('A percentage fee needs the entity linked to a company in this app, or there is no revenue to take a percentage of.');
  if (f.basis === 'costplus' && !f.markup) out.push('Cost-plus with no markup — the fee would be exactly cost.');
  if (f.basis === 'hourly' && !f.rate) out.push('Hourly fee with no rate set.');
  if (f.floor && f.cap && f.floor > f.cap) out.push('The floor is above the cap, so the cap can never apply.');

  const s = meDate(raw && raw.startDate), en = meDate(raw && raw.endDate);
  if (s && en && en < s) out.push('End date is before the start date — held as paused.');
  return out;
}

function meNewEntity(over) {
  const now = Date.now();
  return meNormalize(Object.assign({
    id: meNewId(),
    name: '',
    companyId: '',
    // Paused until someone has looked at it and said otherwise, exactly like a
    // new contract. An entity begins billing on purpose, never by default.
    status: 'paused',
    startDate: typeof ctDateKey === 'function' ? ctDateKey(new Date(now)) : '',
    fee: { basis: 'flat', freq: 'monthly', interval: 1 },
    created: now,
  }, over || {}));
}

// ── Local cache ─────────────────────────────────────────────────────────────

function meLsKey() { return typeof LS === 'function' ? LS('entities') : 'jt_entities'; }

function meLoadLocal() {
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem(meLsKey()) || '{}') || {}; } catch (e) { raw = {}; }
  const out = {};
  Object.entries(raw).forEach(([id, rec]) => { const n = meNormalize(rec, id); if (n) out[n.id] = n; });
  if (typeof S !== 'undefined') S.entities = out;
  return out;
}

function meSaveLocal() {
  try { localStorage.setItem(meLsKey(), JSON.stringify((typeof S !== 'undefined' && S.entities) || {})); } catch (e) {}
}

function meWireData() {
  if (typeof S === 'undefined') return false;
  if (S._meWired) return true;
  if (!S.entities) meLoadLocal();
  if (typeof DB === 'undefined' || !DB) return false;
  S._meWired = true;
  try {
    DB.child('entities').on('value', s => {
      const raw = s.val() || {};
      const out = {};
      Object.entries(raw).forEach(([id, rec]) => { const n = meNormalize(rec, id); if (n) out[n.id] = n; });
      S.entities = out;
      meSaveLocal();
      if (S.view === 'entities' && typeof render === 'function') render();
    });
  } catch (e) { S._meWired = false; return false; }
  return true;
}

// ── Reads ───────────────────────────────────────────────────────────────────

function meAll() { return (typeof S !== 'undefined' && S.entities) || {}; }

function meGet(id) { return meAll()[String(id || '')] || null; }

function meList() {
  const rank = { active: 0, paused: 1, ended: 2 };
  return Object.values(meAll()).sort((a, b) =>
    (rank[a.status] - rank[b.status]) || String(a.name || '').localeCompare(String(b.name || '')));
}

// The label of the app company an entity is linked to, or '' when it stands
// alone or points at a company that no longer exists.
function meLinkedLabel(companyId) {
  if (!companyId) return '';
  const co = (typeof COMPANIES !== 'undefined' && COMPANIES && COMPANIES[companyId]) || null;
  return co ? (co.label || companyId) : '';
}

// A link that points at nothing is worth saying out loud — the fee silently
// stops computing and the entity looks fine.
function meLinkBroken(entity) {
  return !!(entity && entity.companyId && !meLinkedLabel(entity.companyId));
}

// ── Writes ──────────────────────────────────────────────────────────────────

// Reports and rethrows. Same reasoning as ctWriteContract: an entity carries a
// fee, so a write that fails silently is money that quietly stops being billed.
async function meWrite(path, value, mode) {
  try {
    if (mode === 'remove') await removeDB(path);
    else await writeDB(path, value);
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (typeof toast === 'function') {
      toast(/permission/i.test(msg)
        ? 'Firebase rejected this entity — the entities rules may not be deployed yet'
        : 'Could not save that entity: ' + msg, '');
    }
    throw e;
  }
}

async function meSave(raw) {
  const rec = meNormalize(raw);
  if (!rec) return null;
  rec.updatedAt = Date.now();
  rec.updatedBy = (typeof S !== 'undefined' && S.user) || '';
  if (!rec.created) rec.created = rec.updatedAt;

  if (typeof S !== 'undefined') { S.entities = S.entities || {}; S.entities[rec.id] = rec; }
  meSaveLocal();

  await meWrite('entities/' + rec.id, rec, 'set');
  if (typeof logAct === 'function') { try { await logAct('saved managed entity', rec.name || ''); } catch (e) {} }
  return rec;
}

async function meDelete(id) {
  const key = String(id || '');
  if (!key) return false;
  const rec = meGet(key);
  if (typeof S !== 'undefined' && S.entities) delete S.entities[key];
  meSaveLocal();
  await meWrite('entities/' + key, null, 'remove');
  if (typeof logAct === 'function') { try { await logAct('removed managed entity', (rec && rec.name) || key); } catch (e) {} }
  return true;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ME_STATUSES, ME_FEE_BASES, ME_PERCENT_OF,
    meNewId, meNormFee, meNormalize, meIssues, meNewEntity,
    meLoadLocal, meSaveLocal, meWireData,
    meAll, meGet, meList, meLinkedLabel, meLinkBroken,
    meSave, meDelete,
  };
}
