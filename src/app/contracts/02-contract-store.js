// Recurring contracts — record normalization and the data layer.
//
// NOT LOADED BY index.html. Like 01-contract-periods.js, this file is held out
// of the app's script list until the feature is finished; scripts/check-static.mjs
// fails the build if it appears there. The tests load it explicitly.
//
// The storage half deliberately mirrors views/07-customers.js — localStorage
// cache, a sync listener attached once from the feature's own tab, writes that
// go to state first and Firebase second behind a typeof guard. That module is
// the app's worked example of adding a top-level record type without touching
// anything else, so this one follows it rather than inventing a second pattern.
//
// The normalization half exists because a contract is the only record in this
// app that creates invoices on its own. Everything here fails CLOSED: anything
// unrecognized, contradictory, or malformed lands in a state that generates
// nothing rather than one that bills a customer. Under-billing is a
// conversation; double-billing is a lost customer.
//
// Requires 01-contract-periods.js (ctParseDate, ctDateKey, ctNormalizeSchedule).

// ── Identifiers ─────────────────────────────────────────────────────────────

function ctNewId() { return 'ct_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }
function ctNewAddonId() { return 'ad_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }

// ── Normalization ───────────────────────────────────────────────────────────

const CT_STATUSES = ['active', 'paused', 'ended'];
const CT_MAX_NAME = 120;

function ctStr(v, max) {
  const s = String(v == null ? '' : v).trim();
  return max ? s.slice(0, max) : s;
}

function ctMoney(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

// A date normalized to 'YYYY-MM-DD', or '' when absent/unparseable. Never throws
// — an unusable date simply means the contract cannot generate.
function ctNormDate(v) {
  const d = ctParseDate(v);
  return d ? ctDateKey(d) : '';
}

// Keep a schedule only if it reduces to something the period math understands.
// Anything else becomes null, which reads as "this contract does not do that".
function ctNormSchedule(raw) {
  if (!ctNormalizeSchedule(raw)) return null;
  const interval = Number(raw.interval);
  return {
    freq: String(raw.freq).toLowerCase(),
    interval: Number.isInteger(interval) && interval >= 1 ? interval : 1,
  };
}

function ctNormItems(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map(it => ({ desc: ctStr(it && it.desc, 200), qty: Number((it && it.qty) || 0) || 0, rate: ctMoney(it && it.rate) }))
    .filter(it => it.desc || it.qty || it.rate);
}

function ctNormAddon(raw, id) {
  const aid = ctStr((raw && raw.id) || id, 64);
  if (!aid) return null;
  return {
    id: aid,
    desc: ctStr(raw && raw.desc, 200),
    amount: ctMoney(raw && raw.amount),
    date: ctNormDate(raw && raw.date),
    // Presence of this field is what makes the add-on sweep idempotent, so it
    // is preserved verbatim and never inferred.
    billedInvoiceId: ctStr(raw && raw.billedInvoiceId, 64) || null,
    created: Number((raw && raw.created) || 0) || 0,
  };
}

function ctNormAddons(raw) {
  const out = {};
  const list = Array.isArray(raw) ? raw : Object.values(raw || {});
  list.forEach(a => { const n = ctNormAddon(a); if (n) out[n.id] = n; });
  return out;
}

// Normalize a contract from any source — a form, localStorage, or a Firebase
// snapshot that could be any shape at all. Returns null when there is no usable
// id; otherwise always returns a complete record.
//
// `id` is the map key the record was stored under, used when the body's own id
// field is missing. In both Firebase and the local cache the key IS the
// canonical id, so a record whose id field was lost is recovered rather than
// discarded. A body with nothing else usable still normalizes — into a paused,
// nameless, scheduleless contract that generates nothing and shows up in the
// list for someone to clean up, which beats silently dropping data.
//
// Status is the safety valve. An unrecognized status becomes 'paused', not
// 'active', and a self-contradictory contract (one that ends before it starts)
// is forced to 'paused' too. A contract cannot fall into a billing state by
// accident or corruption — reaching 'active' takes an explicit, valid record.
function ctNormalizeContract(raw, id) {
  const src = raw || {};
  const cid = ctStr(src.id || id, 64);
  if (!cid) return null;

  const startDate = ctNormDate(src.startDate);
  const endDate = ctNormDate(src.endDate);
  const contradictory = !!(startDate && endDate && endDate < startDate);

  let status = ctStr(src.status).toLowerCase();
  if (CT_STATUSES.indexOf(status) < 0) status = 'paused';
  if (contradictory) status = 'paused';

  const billingRaw = src.billing || null;

  return {
    id: cid,
    name: ctStr(src.name, CT_MAX_NAME),
    customerId: ctStr(src.customerId, 64),
    status: status,
    startDate: startDate,
    endDate: endDate,
    visits: ctNormSchedule(src.visits),
    billing: billingRaw && ctNormSchedule(billingRaw)
      ? Object.assign(ctNormSchedule(billingRaw), {
          amount: ctMoney(billingRaw.amount),
          items: ctNormItems(billingRaw.items),
        })
      : null,
    addons: ctNormAddons(src.addons),
    notes: ctStr(src.notes, 2000),
    created: Number(src.created || 0) || 0,
    updatedAt: Number(src.updatedAt || 0) || 0,
    updatedBy: ctStr(src.updatedBy, 80),
  };
}

// Human-readable reasons a contract will not generate what its author expects.
// Surfaced in the UI later; kept here so the rules live next to normalization
// rather than being reimplemented in a view.
function ctContractIssues(raw) {
  const c = ctNormalizeContract(raw);
  const issues = [];
  if (!c) return ['This contract has no ID.'];
  if (!c.name) issues.push('No name — it will be hard to find.');
  if (!c.startDate) issues.push('No valid start date, so nothing can be scheduled or billed.');
  if (!c.visits && !c.billing) issues.push('No visit schedule and no billing schedule — this contract does nothing.');
  if (c.billing && !c.billing.amount && !c.billing.items.length) issues.push('Billing is scheduled but has no amount or line items.');
  const rawStatus = ctStr(raw && raw.status).toLowerCase();
  if (rawStatus && CT_STATUSES.indexOf(rawStatus) < 0) issues.push('Unrecognized status "' + rawStatus + '" — held as paused.');
  const s = ctNormDate(raw && raw.startDate), e = ctNormDate(raw && raw.endDate);
  if (s && e && e < s) issues.push('End date is before the start date — held as paused.');
  return issues;
}

// A blank contract for the editor. Starts paused on purpose: a contract begins
// billing only once someone has looked at it and said so.
function ctNewContract(over) {
  const now = Date.now();
  return ctNormalizeContract(Object.assign({
    id: ctNewId(),
    name: '',
    customerId: '',
    status: 'paused',
    startDate: ctDateKey(new Date(now)),
    endDate: '',
    visits: null,
    billing: null,
    addons: {},
    created: now,
  }, over || {}));
}

// ── Local cache ─────────────────────────────────────────────────────────────
// LS() namespaces by company and environment, so each company's contracts stay
// in their own bucket exactly like jobs and customers.

function ctLsKey() { return typeof LS === 'function' ? LS('contracts') : 'jt_contracts'; }

function ctLoadContractsLocal() {
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem(ctLsKey()) || '{}') || {}; } catch (e) { raw = {}; }
  const out = {};
  Object.entries(raw).forEach(([id, rec]) => { const n = ctNormalizeContract(rec, id); if (n) out[n.id] = n; });
  if (typeof S !== 'undefined') S.contracts = out;
  return out;
}

function ctSaveContractsLocal() {
  try {
    const all = (typeof S !== 'undefined' && S.contracts) || {};
    localStorage.setItem(ctLsKey(), JSON.stringify(all));
    return true;
  } catch (e) { return false; }
}

// ── Firebase sync ───────────────────────────────────────────────────────────

// Attach the listener once, from within the feature's own tab, reusing the
// existing company-scoped DB ref — the same shape as wireCustomersData().
// Everything incoming is normalized, so a hand-edited or partially written
// node cannot put a malformed contract into a generating state.
function ctWireContractsData() {
  if (typeof S === 'undefined') return false;
  if (S._ctWired) return true;
  if (!S.contracts) ctLoadContractsLocal();
  if (typeof DB === 'undefined' || !DB) return false;
  S._ctWired = true;
  try {
    DB.child('contracts').on('value', s => {
      const raw = s.val() || {};
      const out = {};
      Object.entries(raw).forEach(([id, rec]) => { const n = ctNormalizeContract(rec, id); if (n) out[n.id] = n; });
      S.contracts = out;
      ctSaveContractsLocal();
      if (S.view === 'contracts' && typeof render === 'function') render();
    });
  } catch (e) { S._ctWired = false; return false; }
  return true;
}

// ── Writes ──────────────────────────────────────────────────────────────────

async function ctSaveContract(raw) {
  const rec = ctNormalizeContract(raw);
  if (!rec) return null;
  rec.updatedAt = Date.now();
  rec.updatedBy = (typeof S !== 'undefined' && S.user) || '';
  if (!rec.created) rec.created = rec.updatedAt;

  if (typeof S !== 'undefined') { S.contracts = S.contracts || {}; S.contracts[rec.id] = rec; }
  ctSaveContractsLocal();

  if (typeof DB !== 'undefined' && DB) {
    try { await DB.child('contracts/' + rec.id).set(rec); } catch (e) {}
  }
  if (typeof logAct === 'function') { try { await logAct('saved contract', rec.name || ''); } catch (e) {} }
  return rec;
}

async function ctDeleteContract(id) {
  const cid = ctStr(id, 64);
  if (!cid) return false;
  const rec = (typeof S !== 'undefined' && S.contracts && S.contracts[cid]) || null;
  if (typeof S !== 'undefined' && S.contracts) delete S.contracts[cid];
  ctSaveContractsLocal();
  if (typeof DB !== 'undefined' && DB) {
    try { await DB.child('contracts/' + cid).remove(); } catch (e) {}
  }
  if (typeof logAct === 'function') { try { await logAct('removed contract', (rec && rec.name) || ''); } catch (e) {} }
  return true;
}

// Pausing rather than deleting is the reversible option, and it is what the UI
// should offer first: history and add-ons survive, generation stops.
async function ctSetContractStatus(id, status) {
  const c = ctGetContract(id);
  if (!c) return null;
  if (CT_STATUSES.indexOf(status) < 0) return null;
  return ctSaveContract(Object.assign({}, c, { status: status }));
}

// ── Add-ons ─────────────────────────────────────────────────────────────────

async function ctAddAddon(contractId, addon) {
  const c = ctGetContract(contractId);
  if (!c) return null;
  const rec = ctNormAddon(Object.assign({ id: ctNewAddonId(), created: Date.now() }, addon || {}));
  if (!rec) return null;
  // A brand-new add-on is always unbilled, whatever the caller passed.
  rec.billedInvoiceId = null;
  const next = Object.assign({}, c, { addons: Object.assign({}, c.addons, { [rec.id]: rec }) });
  await ctSaveContract(next);
  return rec;
}

// Mark an add-on as billed by a specific invoice.
//
// Returns null if it was ALREADY billed rather than overwriting the stamp. That
// refusal is the whole point: the stamp is what stops the next billing run from
// sweeping the same add-on onto a second invoice, so a re-stamp would silently
// re-open something already charged.
async function ctStampAddon(contractId, addonId, invoiceId) {
  const c = ctGetContract(contractId);
  if (!c) return null;
  const aid = ctStr(addonId, 64), inv = ctStr(invoiceId, 64);
  if (!aid || !inv) return null;
  const addon = c.addons[aid];
  if (!addon || addon.billedInvoiceId) return null;
  const next = Object.assign({}, c, {
    addons: Object.assign({}, c.addons, { [aid]: Object.assign({}, addon, { billedInvoiceId: inv }) }),
  });
  await ctSaveContract(next);
  return next.addons[aid];
}

// Undo a stamp — for a voided invoice, so the add-on returns to the next run.
async function ctUnstampAddon(contractId, addonId) {
  const c = ctGetContract(contractId);
  if (!c) return null;
  const aid = ctStr(addonId, 64);
  const addon = aid && c.addons[aid];
  if (!addon || !addon.billedInvoiceId) return null;
  const next = Object.assign({}, c, {
    addons: Object.assign({}, c.addons, { [aid]: Object.assign({}, addon, { billedInvoiceId: null }) }),
  });
  await ctSaveContract(next);
  return next.addons[aid];
}

// ── Reads ───────────────────────────────────────────────────────────────────

function ctAllContracts() { return (typeof S !== 'undefined' && S.contracts) || {}; }

function ctGetContract(id) {
  const cid = ctStr(id, 64);
  return (cid && ctAllContracts()[cid]) || null;
}

// Active first, then by name — the order the list view wants.
function ctContractList() {
  const rank = { active: 0, paused: 1, ended: 2 };
  return Object.values(ctAllContracts()).sort((a, b) =>
    (rank[a.status] - rank[b.status]) ||
    (a.name || '').localeCompare(b.name || '') ||
    a.id.localeCompare(b.id));
}

function ctContractsForCustomer(customerId) {
  const cid = ctStr(customerId, 64);
  if (!cid) return [];
  return ctContractList().filter(c => c.customerId === cid);
}

// Everything a generation run would create across every contract. Pure — this
// reports, it does not write.
function ctPlanAll(opts) {
  const o = opts || {};
  return ctContractList()
    .map(c => ctPlan(c, o))
    .filter(p => !p.isEmpty);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ctNewId, ctNewAddonId, ctNormalizeContract, ctContractIssues, ctNewContract,
    ctLoadContractsLocal, ctSaveContractsLocal, ctWireContractsData,
    ctSaveContract, ctDeleteContract, ctSetContractStatus,
    ctAddAddon, ctStampAddon, ctUnstampAddon,
    ctAllContracts, ctGetContract, ctContractList, ctContractsForCustomer, ctPlanAll,
  };
}
