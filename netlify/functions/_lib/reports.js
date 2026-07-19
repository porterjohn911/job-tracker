// Shared financial rollup logic, used by both the api-overview endpoint and
// the weekly-report scheduled function so their numbers can never drift.
// All formulas mirror src/app/02-state-utils-data.js.

const STAGES = ['Lead', 'Estimate', 'Approved', 'Scheduled', 'In Progress', 'Punch List', 'Complete'];
const JOB_STATUS_VALUES = ['lead', 'active', 'hold', 'lost', 'complete'];
const RECEIPT_CATS = ['Materials', 'Tools / Equipment', 'Fuel / Travel', 'Subcontractor', 'Permits / Fees', 'Labor', 'Meals', 'Other'];

function num(v) { return Number(v || 0); }
function round2(n) { return Math.round(n * 100) / 100; }

function invoiceTotals(inv) {
  const items = inv.items || [];
  const sub = items.reduce((s, i) => s + num(i.qty) * num(i.rate), 0);
  const total = sub + sub * (num(inv.taxRate) / 100);
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
  const c = invoiceTotals(inv);
  if (c.total > 0 && c.balance <= 0.005) return 'paid';
  if (inv.status === 'sent') {
    const d = daysUntil(inv.dueDate);
    if (d !== null && d < 0) return 'overdue';
    return 'sent';
  }
  return inv.status || 'draft';
}

// Reads a company's data and returns the owner-level rollups. `db` is the
// firebase-admin database instance (getDatabase(app)); `canSeeCost` gates labor
// cost (needs pay rates). Returns the same shape the api-overview endpoint uses.
async function computeOverview(db, ns, canSeeCost) {
  const reads = [
    db.ref(ns + '/jobs').get(),
    db.ref(ns + '/receipts').get(),
    db.ref(ns + '/time').get(),
  ];
  if (canSeeCost) reads.push(db.ref(ns + '/payrates').get());
  const snaps = await Promise.all(reads);
  const jobs = snaps[0].val() || {};
  const overheadReceipts = snaps[1].val() || {};
  const timeEntries = snaps[2].val() || {};
  const payRates = canSeeCost ? (snaps[3].val() || {}) : {};

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

  let invoicedTotal = 0, paidTotal = 0, outstanding = 0, overdueAmount = 0;
  let invoiceCount = 0, overdueCount = 0, estimateCount = 0, estimateValue = 0;
  for (const id of jobIds) {
    const j = jobs[id] || {};
    for (const inv of (Array.isArray(j.invoices) ? j.invoices : [])) {
      const c = invoiceTotals(inv);
      invoiceCount++;
      invoicedTotal += c.total;
      paidTotal += c.paid;
      outstanding += Math.max(0, c.balance);
      if (invoiceStatus(inv) === 'overdue') { overdueCount++; overdueAmount += Math.max(0, c.balance); }
    }
    for (const est of (Array.isArray(j.estimates) ? j.estimates : [])) {
      estimateCount++;
      estimateValue += invoiceTotals(est).total;
    }
  }

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

  let totalMs = 0, activeTimers = 0, laborCost = 0;
  for (const tid of Object.keys(timeEntries)) {
    const t = timeEntries[tid] || {};
    const dur = Math.max(0, (t.end || Date.now()) - num(t.start));
    totalMs += dur;
    if (!t.end) activeTimers++;
    if (canSeeCost) laborCost += (dur / 3600000) * num(payRates[t.member]);
  }

  const round2map = (m) => { const o = {}; for (const k of Object.keys(m)) o[k] = round2(m[k]); return o; };

  return {
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
      costAvailable: !!canSeeCost,
    },
  };
}

// Overdue invoices + biggest outstanding jobs, for the email detail. Reads jobs.
async function computeReportDetail(db, ns) {
  const jobs = (await db.ref(ns + '/jobs').get()).val() || {};
  const overdue = [];
  const outstandingByJob = [];
  for (const id of Object.keys(jobs)) {
    const j = jobs[id] || {};
    let jobOutstanding = 0;
    for (const inv of (Array.isArray(j.invoices) ? j.invoices : [])) {
      const c = invoiceTotals(inv);
      jobOutstanding += Math.max(0, c.balance);
      if (invoiceStatus(inv) === 'overdue') {
        overdue.push({
          number: inv.number || '', jobName: j.name || '', customer: j.customerName || '',
          balance: round2(Math.max(0, c.balance)), dueDate: inv.dueDate || '',
        });
      }
    }
    if (jobOutstanding > 0.005) {
      outstandingByJob.push({ jobName: j.name || '', customer: j.customerName || '', outstanding: round2(jobOutstanding) });
    }
  }
  overdue.sort((a, b) => b.balance - a.balance);
  outstandingByJob.sort((a, b) => b.outstanding - a.outstanding);
  return { overdue, topOutstanding: outstandingByJob.slice(0, 5) };
}

module.exports = { computeOverview, computeReportDetail };
