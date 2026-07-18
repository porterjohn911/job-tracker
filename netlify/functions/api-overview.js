// Agent-facing OVERVIEW / reports endpoint (see AGENT_API_DESIGN.md §5).
//
//   GET /.netlify/functions/api-overview
//   Authorization: Bearer sk_live_...
//   Requires scope: financials:read
//
// Returns the owner-level rollups the app's dashboard / reports / job-costing
// views show, for the key's company namespace: job pipeline, A/R (invoiced /
// paid / outstanding / overdue), estimates, expenses by category, and logged
// hours. Labor COST (hours × pay rate) needs pay rates, which are sensitive —
// it is included only when the key also has scope financials:sensitive.
//
// All formulas mirror src/app/02-state-utils-data.js so numbers match the app.

const { db } = require('./_lib/firebaseAdmin');
const { corsHeaders, jsonResponder, authenticateApiKey } = require('./_lib/apiKeyAuth');

const STAGES = ['Lead', 'Estimate', 'Approved', 'Scheduled', 'In Progress', 'Punch List', 'Complete'];
const JOB_STATUS_VALUES = ['lead', 'active', 'hold', 'lost', 'complete'];
const RECEIPT_CATS = ['Materials', 'Tools / Equipment', 'Fuel / Travel', 'Subcontractor', 'Permits / Fees', 'Labor', 'Meals', 'Other'];

function num(v) { return Number(v || 0); }
function round2(n) { return Math.round(n * 100) / 100; }

function calcInvoice(inv) {
  const items = inv.items || [];
  const sub = items.reduce((s, i) => s + num(i.qty) * num(i.rate), 0);
  const tax = sub * (num(inv.taxRate) / 100);
  const total = sub + tax;
  const paid = num(inv.paid);
  return { total, paid, balance: total - paid };
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}
function invoiceStatus(inv) {
  const c = calcInvoice(inv);
  if (c.total > 0 && c.balance <= 0.005) return 'paid';
  if (inv.status === 'sent') {
    const d = daysUntil(inv.dueDate);
    if (d !== null && d < 0) return 'overdue';
    return 'sent';
  }
  return inv.status || 'draft';
}

exports.handler = async (event) => {
  const origin = event.headers && (event.headers.origin || event.headers.Origin);
  const json = jsonResponder(origin);

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(origin), body: '{}' };
  if (event.httpMethod !== 'GET') return json(405, { error: 'GET only' });

  try {
    return await overview(event, json);
  } catch (e) {
    console.error('[api-overview] unhandled:', e && e.stack ? e.stack : e);
    return json(500, { error: 'Unexpected server error: ' + ((e && e.message) || 'unknown') });
  }
};

async function overview(event, json) {
  const authed = await authenticateApiKey(event, 'financials:read');
  if (authed.error) return json(authed.error.statusCode, { error: authed.error.message });

  const ns = authed.key.ns || authed.key.company;
  if (!ns) return json(500, { error: 'Key is not bound to a company' });
  const scopes = Array.isArray(authed.key.scopes) ? authed.key.scopes : [];
  const canSeeCost = scopes.includes('financials:sensitive');

  // Read the nodes we need in parallel.
  let jobs = {}, overheadReceipts = {}, timeEntries = {}, payRates = {};
  try {
    const reads = [
      db().ref(ns + '/jobs').get(),
      db().ref(ns + '/receipts').get(),
      db().ref(ns + '/time').get(),
    ];
    if (canSeeCost) reads.push(db().ref(ns + '/payrates').get());
    const snaps = await Promise.all(reads);
    jobs = snaps[0].val() || {};
    overheadReceipts = snaps[1].val() || {};
    timeEntries = snaps[2].val() || {};
    if (canSeeCost) payRates = snaps[3].val() || {};
  } catch (e) {
    return json(500, { error: 'Could not read data: ' + e.message });
  }

  // ── Jobs ────────────────────────────────────────────────────────────
  const byStage = {}; STAGES.forEach((s) => { byStage[s] = 0; });
  const byStatus = {}; JOB_STATUS_VALUES.forEach((s) => { byStatus[s] = 0; });
  let pipelineValue = 0;
  const jobIds = Object.keys(jobs);
  for (const id of jobIds) {
    const j = jobs[id] || {};
    if (j.stage && byStage[j.stage] != null) byStage[j.stage]++;
    if (j.status && byStatus[j.status] != null) byStatus[j.status]++;
    pipelineValue += num(j.value);
  }

  // ── Invoices / A/R + estimates ──────────────────────────────────────
  let invoicedTotal = 0, paidTotal = 0, outstanding = 0, overdueAmount = 0;
  let invoiceCount = 0, overdueCount = 0, estimateCount = 0, estimateValue = 0;
  for (const id of jobIds) {
    const j = jobs[id] || {};
    for (const inv of (Array.isArray(j.invoices) ? j.invoices : [])) {
      const c = calcInvoice(inv);
      invoiceCount++;
      invoicedTotal += c.total;
      paidTotal += c.paid;
      outstanding += Math.max(0, c.balance);
      if (invoiceStatus(inv) === 'overdue') { overdueCount++; overdueAmount += Math.max(0, c.balance); }
    }
    for (const est of (Array.isArray(j.estimates) ? j.estimates : [])) {
      estimateCount++;
      estimateValue += calcInvoice(est).total;
    }
  }

  // ── Expenses: job receipts + standalone overhead receipts ───────────
  const expenseByCat = {}; RECEIPT_CATS.forEach((c) => { expenseByCat[c] = 0; });
  let expenseTotal = 0;
  const addReceipt = (r) => {
    const amt = num(r.amount);
    expenseTotal += amt;
    const cat = RECEIPT_CATS.includes(r.category) ? r.category : 'Other';
    expenseByCat[cat] += amt;
  };
  for (const id of jobIds) for (const r of ((jobs[id] || {}).receipts || [])) addReceipt(r);
  for (const rid of Object.keys(overheadReceipts)) addReceipt(overheadReceipts[rid] || {});

  // ── Time / labor ────────────────────────────────────────────────────
  let totalMs = 0, activeTimers = 0, laborCost = 0;
  for (const tid of Object.keys(timeEntries)) {
    const t = timeEntries[tid] || {};
    const dur = Math.max(0, (t.end || Date.now()) - num(t.start));
    totalMs += dur;
    if (!t.end) activeTimers++;
    if (canSeeCost) laborCost += (dur / 3600000) * num(payRates[t.member]);
  }

  const round2map = (m) => { const o = {}; for (const k of Object.keys(m)) o[k] = round2(m[k]); return o; };

  return json(200, {
    company: authed.key.company,
    generatedAt: new Date().toISOString(),
    jobs: { total: jobIds.length, byStage, byStatus, pipelineValue: round2(pipelineValue) },
    receivables: {
      invoiceCount,
      invoicedTotal: round2(invoicedTotal),
      paidTotal: round2(paidTotal),
      outstanding: round2(outstanding),
      overdueCount,
      overdueAmount: round2(overdueAmount),
    },
    estimates: { count: estimateCount, value: round2(estimateValue) },
    expenses: { total: round2(expenseTotal), byCategory: round2map(expenseByCat) },
    labor: {
      totalHours: round2(totalMs / 3600000),
      activeTimers,
      cost: canSeeCost ? round2(laborCost) : null,
      costAvailable: canSeeCost,
    },
  });
}
