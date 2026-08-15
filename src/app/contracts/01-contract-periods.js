// Recurring contracts — period math and idempotency keys.
//
// Pure logic: no DOM, no Firebase, no app state. tests/contract-periods.spec.js
// loads it into a blank page for that reason — nothing here needs the app.
//
// A contract carries two INDEPENDENT schedules:
//
//   visits  — generates a job per period (a maintenance call, an inspection)
//   billing — generates an invoice per period (monthly, annual, whatever)
//
// They never reference each other. A contract can have weekly visits billed
// once a year, or billing with no visits at all (a retainer), or visits with
// no billing (work covered by some other agreement).
//
// Every occurrence gets a deterministic key — "ct_9f2:v:2026-09-07". Generation
// asks "does anything already carry this key?" and skips if so, which is what
// makes it safe to run twice, from two devices, or after a failed sync. Nothing
// here writes anything; callers decide what to do with the periods returned.
//
// All names are prefixed `ct` because the app's scripts share one global scope.

// ── Date helpers ────────────────────────────────────────────────────────────
// Calendar arithmetic only — never milliseconds. Adding 7*24*60*60*1000 to a
// timestamp shifts by an hour across a DST boundary and can land on the wrong
// calendar day; new Date(y, m, d + 7) cannot.

function ctPad2(n) { return String(n).padStart(2, '0'); }

// 'YYYY-MM-DD' in local time. (Date#toISOString would convert to UTC first and
// report the previous day for anyone west of Greenwich.)
function ctDateKey(d) {
  return d.getFullYear() + '-' + ctPad2(d.getMonth() + 1) + '-' + ctPad2(d.getDate());
}

function ctDaysInMonth(year, monthIdx) {
  return new Date(year, monthIdx + 1, 0).getDate();
}

// Parse 'YYYY-MM-DD' as a LOCAL midnight date. new Date('2026-09-07') parses as
// UTC midnight, which is the previous day in every western timezone.
function ctParseDate(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
  if (typeof v === 'number' && isFinite(v)) { const d = new Date(v); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function ctStartOfDay(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function ctAddDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

// ── Schedule normalization ──────────────────────────────────────────────────
// Every frequency reduces to a unit plus a step, so one loop covers them all.

const CT_FREQ = {
  weekly:    { unit: 'week',  base: 1 },
  biweekly:  { unit: 'week',  base: 2 },
  monthly:   { unit: 'month', base: 1 },
  quarterly: { unit: 'month', base: 3 },
  annual:    { unit: 'month', base: 12 },
};

// Returns {unit, step} or null when the schedule is absent/unusable. A null
// schedule is a legitimate state — it means this contract does not do that
// thing — so callers treat null as "no periods", never as an error.
function ctNormalizeSchedule(schedule) {
  if (!schedule) return null;
  const freq = CT_FREQ[String(schedule.freq || '').toLowerCase()];
  if (!freq) return null;
  const raw = schedule.interval == null ? 1 : Number(schedule.interval);
  const interval = Number.isInteger(raw) && raw >= 1 ? raw : 1;
  return { unit: freq.unit, step: freq.base * interval };
}

// ── Occurrence dates ────────────────────────────────────────────────────────

// The date of occurrence `n` (0-based), counting from the contract's start.
//
// Month-based schedules step from the ORIGINAL anchor day every time rather
// than from the previously clamped date. A contract starting Jan 31 yields
// Jan 31 → Feb 28 → Mar 31, not Jan 31 → Feb 28 → Mar 28. Stepping from the
// clamped date walks a month-end contract backwards off the end of the month.
function ctOccurrenceDate(startDate, norm, n) {
  const start = ctParseDate(startDate);
  if (!start || !norm || !Number.isInteger(n) || n < 0) return null;
  if (norm.unit === 'week') return ctAddDays(start, 7 * norm.step * n);
  const anchorDay = start.getDate();
  const target = new Date(start.getFullYear(), start.getMonth() + norm.step * n, 1);
  const day = Math.min(anchorDay, ctDaysInMonth(target.getFullYear(), target.getMonth()));
  return new Date(target.getFullYear(), target.getMonth(), day);
}

// ── Idempotency keys ────────────────────────────────────────────────────────
// "<contractId>:<kind>:<YYYY-MM-DD>". The occurrence date is unique within a
// contract for every frequency, so the date alone distinguishes periods without
// needing separate month/week key formats.

const CT_KINDS = { visit: 'v', billing: 'b' };

function ctPeriodKey(contractId, kind, date) {
  const k = CT_KINDS[kind];
  const id = String(contractId || '');
  const d = ctParseDate(date);
  if (!k || !id || !d) return '';
  return id + ':' + k + ':' + ctDateKey(d);
}

// ── Contract state ──────────────────────────────────────────────────────────

// Only active contracts generate. Paused keeps its history and resumes later;
// ended is closed for good. Anything unrecognized is treated as not active —
// generation is the side that writes, so it fails closed.
function ctIsActive(contract, atTs) {
  if (!contract || contract.status !== 'active') return false;
  const at = ctStartOfDay(atTs == null ? Date.now() : atTs);
  const start = ctParseDate(contract.startDate);
  if (start && at < start) return false;
  const end = ctParseDate(contract.endDate);
  if (end && at > end) return false;
  return true;
}

// ── Due periods ─────────────────────────────────────────────────────────────

// Every occurrence falling on or before a limit, bounded by the contract's own
// end date.
//
// `bound` is either a NUMBER of days ahead of today, or an absolute date
// ('YYYY-MM-DD' or a Date) to stop at. The two kinds want different answers:
//
//   billing passes 0 — you do not raise an invoice for a period that has not
//   started yet.
//
//   visits pass the contract's visitsThrough date, because a visit exists only
//   because someone paid for it. See ctVisitLimit().
//
// Returns [{index, date, dateKey, key}] oldest first.
function ctDuePeriods(contract, kind, nowTs, bound) {
  if (!contract || !CT_KINDS[kind]) return [];
  if (!ctIsActive(contract, nowTs)) return [];

  const norm = ctNormalizeSchedule(kind === 'visit' ? contract.visits : contract.billing);
  if (!norm) return [];

  const start = ctParseDate(contract.startDate);
  if (!start) return [];

  const today = ctStartOfDay(nowTs == null ? Date.now() : nowTs);
  let limit;
  if (typeof bound === 'string' || bound instanceof Date) {
    // An absolute limit is used verbatim, including when it is in the past. A
    // paid-through date that has already passed still means those visits were
    // paid for and should exist; it does not mean generate up to today.
    limit = ctParseDate(bound);
    if (!limit) return [];
  } else {
    const days = Number.isFinite(Number(bound)) ? Math.max(0, Math.floor(Number(bound))) : 0;
    limit = ctAddDays(today, days);
  }
  const end = ctParseDate(contract.endDate);

  const out = [];
  // Generous ceiling: weekly for ~40 years. The loop breaks on the date bound;
  // this only stops a malformed schedule from spinning forever.
  const MAX = 2000;
  for (let n = 0; n < MAX; n++) {
    const date = ctOccurrenceDate(contract.startDate, norm, n);
    if (!date) break;
    if (date > limit) break;
    if (end && date > end) break;
    out.push({
      index: n,
      date: date,
      dateKey: ctDateKey(date),
      key: ctPeriodKey(contract.id, kind, date),
    });
  }
  return out;
}

// The periods that still need creating: due, minus anything already carrying
// the key. `existingKeys` is any Set/Array/object of periodKey strings already
// present on the company's jobs or invoices.
//
// This is the whole idempotency guarantee. Running generation twice returns an
// empty list the second time, so no customer is ever billed twice for a period
// and no visit is ever duplicated on the schedule.
function ctMissingPeriods(duePeriods, existingKeys) {
  const have = ctKeySet(existingKeys);
  return (duePeriods || []).filter(p => p && p.key && !have.has(p.key));
}

function ctKeySet(keys) {
  if (keys instanceof Set) return keys;
  if (Array.isArray(keys)) return new Set(keys.filter(Boolean).map(String));
  if (keys && typeof keys === 'object') return new Set(Object.values(keys).filter(Boolean).map(String));
  return new Set();
}

// Collect the period keys already used by a set of records (jobs or invoices).
// Records without a periodKey — everything that exists today — are ignored.
function ctExistingKeys(records) {
  const out = new Set();
  const list = Array.isArray(records) ? records : Object.values(records || {});
  list.forEach(r => { if (r && r.periodKey) out.add(String(r.periodKey)); });
  return out;
}

// ── Add-ons ─────────────────────────────────────────────────────────────────

// One-off billable items hanging off a contract — an extra callout, a part, a
// job outside the agreement — invoiced whenever the next billing run happens
// or on demand, rather than on any schedule.
//
// An add-on is "pending" until it carries a billedInvoiceId. Stamping that
// field is what makes the sweep idempotent: a billed add-on is never picked up
// again, by the same rule that a used periodKey is never generated again.
function ctPendingAddons(contract) {
  const raw = (contract && contract.addons) || {};
  const list = Array.isArray(raw) ? raw : Object.values(raw);
  return list
    .filter(a => a && a.id && !a.billedInvoiceId)
    .filter(a => Number(a.amount) || (a.desc || '').trim())
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.id).localeCompare(String(b.id)));
}

function ctAddonsTotal(addons) {
  return (addons || []).reduce((sum, a) => sum + (Number(a && a.amount) || 0), 0);
}

// ── How far visits are scheduled ────────────────────────────────────────────

// Visits are created because a customer paid for them, not because a rolling
// window moved. `visitsThrough` is the date their prepayment covers, entered
// per contract, and it is the only thing that lets a visit be scheduled ahead.
//
// Returns '' when nothing is paid for, and '' means NO visits are generated at
// all — not even overdue ones. Unpaid work does not belong on the calendar, and
// a contract that has run past what was paid should stop scheduling until
// someone renews it rather than quietly keep booking crews.
//
// Renewal is just pushing this date out: already-created visits keep their
// period keys, so extending it adds only the new ones.
function ctVisitLimit(contract) {
  return (contract && ctParseDate(contract.visitsThrough)) ? ctDateKey(ctParseDate(contract.visitsThrough)) : '';
}

// Visits that fall on or before the paid-through date. Empty when unpaid.
function ctVisitPeriods(contract, nowTs) {
  const limit = ctVisitLimit(contract);
  return limit ? ctDuePeriods(contract, 'visit', nowTs, limit) : [];
}

// ── Planning ────────────────────────────────────────────────────────────────

// What a generation run WOULD create for one contract. Pure: it reads state and
// returns a plan. The caller shows this to the user and only writes on confirm.
function ctPlan(contract, opts) {
  const o = opts || {};
  const now = o.now == null ? Date.now() : o.now;

  const visits = ctMissingPeriods(ctVisitPeriods(contract, now), o.existingJobKeys);
  const billing = ctMissingPeriods(ctDuePeriods(contract, 'billing', now, 0), o.existingInvoiceKeys);
  const addons = ctPendingAddons(contract);

  return {
    contractId: (contract && contract.id) || '',
    visits: visits,
    billing: billing,
    addons: addons,
    addonsTotal: ctAddonsTotal(addons),
    paidThrough: ctVisitLimit(contract),
    isEmpty: !visits.length && !billing.length && !addons.length,
  };
}

// Node/CommonJS export for direct unit testing. In the browser these are plain
// globals like the rest of the app, so this block is inert there.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ctDateKey, ctDaysInMonth, ctParseDate, ctAddDays,
    ctNormalizeSchedule, ctOccurrenceDate, ctPeriodKey, ctIsActive,
    ctDuePeriods, ctMissingPeriods, ctExistingKeys, ctVisitLimit, ctVisitPeriods,
    ctPendingAddons, ctAddonsTotal, ctPlan,
  };
}
