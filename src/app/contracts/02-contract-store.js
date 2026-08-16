// Recurring contracts — record normalization and the data layer.
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
function ctNewCheckId() { return 'ck_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }

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

// The scope of work, defined once on the contract and copied onto every visit
// it generates. Order is meaningful — it is the order the crew works in — so
// this stays an array rather than the keyed map used for add-ons.
function ctNormChecklist(raw) {
  const list = Array.isArray(raw) ? raw : Object.values(raw || {});
  return list
    .map(it => ({ id: ctStr(it && it.id, 64) || ctNewCheckId(), text: ctStr(it && it.text, 200) }))
    .filter(it => it.text)
    .slice(0, 60);
}

// What the contract was priced on. Kept as the assumptions rather than a
// single number, because "we lost money" is only actionable with "because we
// assumed 2.5 hours and it takes 3.4".
//
// Absent is a legitimate state — a contract priced by instinct still works,
// it just cannot be checked. Zeroes are not treated as "unpriced": someone
// may genuinely have no materials, so the estimate counts as present once any
// field is set.
function ctNormPricing(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const num = (v, max) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(Math.min(n, max) * 100) / 100;
  };
  const out = {
    hoursPerVisit: num(raw.hoursPerVisit, 24),
    crewRate: num(raw.crewRate, 1000),
    driveMinutes: num(raw.driveMinutes, 600),
    materialsPerVisit: num(raw.materialsPerVisit, 100000),
    // A target of 0 is meaningless as a goal, so an unset or nonsense value
    // falls back to something conventional rather than suggesting cost price.
    // Rounded BEFORE the bounds check, not after: 94.99 rounds to 95.0, which
    // the Firebase rule rejects, and a rejected write is how contracts vanish.
    targetMargin: (() => {
      const n = Math.round(Number(raw.targetMargin) * 10) / 10;
      return Number.isFinite(n) && n > 0 && n < 95 ? n : 40;
    })(),
  };
  const priced = out.hoursPerVisit || out.crewRate || out.driveMinutes || out.materialsPerVisit;
  return priced ? out : null;
}

// The customer-facing agreement attached to a contract.
//
// Deliberately separate from `pricing`. Pricing is what a visit COSTS US —
// crew rate, hours, target margin — and it must never reach a customer. The
// proposal is what the customer is buying and what they pay. Keeping them in
// different fields is the first half of making that leak impossible; the
// document builder never reading contract.pricing is the other half.
//
// Null means no proposal has been drafted, which is the normal state for a
// contract someone typed straight in.
function ctNormProposal(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const stamp = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };
  const out = {
    number: ctStr(raw.number, 32),
    date: ctNormDate(raw.date),
    validUntil: ctNormDate(raw.validUntil),
    intro: ctStr(raw.intro, 1000),
    exclusions: ctStr(raw.exclusions, 2000),
    terms: ctStr(raw.terms, 4000),
    sentAt: stamp(raw.sentAt),
    acceptedAt: stamp(raw.acceptedAt),
    acceptedBy: ctStr(raw.acceptedBy, 120),
    declinedAt: stamp(raw.declinedAt),
  };
  // A proposal exists once it has a number or anyone has written anything into
  // it. An untouched block normalizes away rather than parking an empty
  // document on every contract that was opened and saved.
  const real = out.number || out.intro || out.exclusions || out.terms || out.sentAt || out.acceptedAt;
  return real ? out : null;
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
    // How far the customer has prepaid. Visits are only ever scheduled up to
    // this date — see ctVisitLimit(). Empty means nothing is paid for, so no
    // visits get created at all.
    visitsThrough: ctNormDate(src.visitsThrough),
    visits: ctNormSchedule(src.visits),
    // What a crew does on each visit. Copied onto generated jobs as tasks.
    checklist: ctNormChecklist(src.checklist),
    // The assumptions this contract was priced on, so actuals can be checked
    // against them. Null means it was priced by instinct.
    pricing: ctNormPricing(src.pricing),
    // What the customer was shown and agreed to. Never carries cost data.
    proposal: ctNormProposal(src.proposal),
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
  // A visit schedule with nothing paid for is the quiet failure this field
  // exists to prevent: the contract looks scheduled but books nobody.
  if (c.visits && !c.visitsThrough) issues.push('Visits are scheduled but none are paid for yet — set how far ahead the customer has paid.');
  if (c.visits && c.visitsThrough && c.startDate && c.visitsThrough < c.startDate) issues.push('Paid through a date before the contract starts, so no visits fall inside it.');
  // A visit with no checklist arrives as a name and a date. Whoever opens it on
  // a dock has nothing telling them what the job is.
  if (c.visits && !c.checklist.length) issues.push('No checklist — generated visits will not say what work to do.');
  // Without an estimate there is nothing to compare actual hours against, and
  // a fixed price is locked in for a year before anyone finds out.
  //
  // Only worth saying where recurring WORK is being billed at a fixed price. A
  // retainer has no visits whose hours could run away, so nagging it for an
  // hours estimate would be noise attached to the word "wrong".
  if (c.billing && c.visits && !c.pricing) issues.push('No pricing estimate — there is nothing to check the real hours against.');
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

  // Writes go through writeDB, which reports failures and rethrows, rather than
  // a swallowed try/catch.
  //
  // A swallowed rejection here is invisible AND self-erasing: Firebase applies
  // the write optimistically so the contract renders, then the server rejects
  // it, reverts, and the sync listener overwrites S.contracts with server
  // truth. The contract appears and then vanishes with nothing said. That is
  // survivable for a customer record; a contract turns into invoices.
  await ctWriteContract('contracts/' + rec.id, rec, 'set');
  if (typeof logAct === 'function') { try { await logAct('saved contract', rec.name || ''); } catch (e) {} }
  return rec;
}

// One place for contract writes, so every one of them reports the same way.
// Throws on failure; callers surface it rather than pretending the save worked.
async function ctWriteContract(path, value, mode) {
  if (typeof DB === 'undefined' || !DB) return true;
  try {
    if (mode === 'remove') await DB.child(path).remove();
    else await DB.child(path).set(value);
    return true;
  } catch (e) {
    // A permission denial on this node almost always means one thing, and the
    // generic "could not save" sends people hunting in the wrong place.
    const denied = /permission[_ ]denied/i.test(String((e && e.code) || (e && e.message) || ''));
    if (typeof toast === 'function') {
      toast(denied
        ? 'Firebase rejected this contract — the contracts rules may not be deployed yet'
        : 'Could not save contract to team sync', '');
    }
    if (typeof syncStatus === 'function') { try { syncStatus('err', 'Team sync save failed'); } catch (_) {} }
    console.error('Contract save failed for ' + path, e);
    throw e;
  }
}

async function ctDeleteContract(id) {
  const cid = ctStr(id, 64);
  if (!cid) return false;
  const rec = (typeof S !== 'undefined' && S.contracts && S.contracts[cid]) || null;
  if (typeof S !== 'undefined' && S.contracts) delete S.contracts[cid];
  ctSaveContractsLocal();
  await ctWriteContract('contracts/' + cid, null, 'remove');
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
    ctNewId, ctNewAddonId, ctNewCheckId, ctNormChecklist, ctNormPricing, ctNormProposal, ctNormalizeContract, ctContractIssues, ctNewContract,
    ctLoadContractsLocal, ctSaveContractsLocal, ctWireContractsData,
    ctSaveContract, ctDeleteContract, ctSetContractStatus,
    ctAddAddon, ctStampAddon, ctUnstampAddon,
    ctAllContracts, ctGetContract, ctContractList, ctContractsForCustomer, ctPlanAll,
  };
}
