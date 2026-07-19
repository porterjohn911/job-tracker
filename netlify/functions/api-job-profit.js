// Agent-facing per-job profitability (see AGENT_API_DESIGN.md).
//
//   GET /.netlify/functions/api-job-profit?jobId=...   (scope financials:read)
//   Authorization: Bearer sk_live_...
//
// Returns revenue vs. costs for one job: invoiced, collected, expenses, labor
// hours, and profit. Labor COST (hours x pay rate) needs pay rates, which are
// sensitive — included only when the key also has financials:sensitive;
// otherwise profit excludes labor and says so.

const { db } = require('./_lib/firebaseAdmin');
const { corsHeaders, jsonResponder, authenticateApiKey } = require('./_lib/apiKeyAuth');

function num(v) { return Number(v || 0); }
function round2(n) { return Math.round(n * 100) / 100; }
function invTotals(inv) {
  const items = inv.items || [];
  const sub = items.reduce((s, i) => s + num(i.qty) * num(i.rate), 0);
  const total = sub + sub * (num(inv.taxRate) / 100);
  return { total, paid: num(inv.paid) };
}

exports.handler = async (event) => {
  const origin = event.headers && (event.headers.origin || event.headers.Origin);
  const json = jsonResponder(origin);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(origin), body: '{}' };
  if (event.httpMethod !== 'GET') return json(405, { error: 'GET only' });

  try {
    const authed = await authenticateApiKey(event, 'financials:read');
    if (authed.error) return json(authed.error.statusCode, { error: authed.error.message });
    const ns = authed.key.ns || authed.key.company;
    if (!ns) return json(500, { error: 'Key is not bound to a company' });
    const canSeeCost = (Array.isArray(authed.key.scopes) ? authed.key.scopes : []).includes('financials:sensitive');

    const jobId = String((event.queryStringParameters || {}).jobId || '').trim();
    if (!jobId) return json(400, { error: 'jobId is required' });

    let job, timeEntries, payRates = {};
    try {
      const reads = [db().ref(ns + '/jobs/' + jobId).get(), db().ref(ns + '/time').get()];
      if (canSeeCost) reads.push(db().ref(ns + '/payrates').get());
      const snaps = await Promise.all(reads);
      job = snaps[0].val();
      timeEntries = snaps[1].val() || {};
      if (canSeeCost) payRates = snaps[2].val() || {};
    } catch (e) { return json(500, { error: 'Read failed: ' + e.message }); }
    if (!job) return json(404, { error: 'No job with id ' + jobId });

    let invoiced = 0, collected = 0;
    for (const inv of (Array.isArray(job.invoices) ? job.invoices : [])) {
      const t = invTotals(inv); invoiced += t.total; collected += t.paid;
    }
    let expenses = 0;
    for (const r of (Array.isArray(job.receipts) ? job.receipts : [])) expenses += num(r.amount);

    let laborMs = 0, laborCost = 0;
    for (const tid of Object.keys(timeEntries)) {
      const t = timeEntries[tid] || {};
      if ((t.job || '') !== jobId) continue;
      const dur = Math.max(0, (t.end || Date.now()) - num(t.start));
      laborMs += dur;
      if (canSeeCost) laborCost += (dur / 3600000) * num(payRates[t.member]);
    }
    const laborHours = round2(laborMs / 3600000);

    const profit = canSeeCost
      ? round2(invoiced - expenses - laborCost)
      : round2(invoiced - expenses);

    return json(200, {
      company: authed.key.company,
      job: { id: jobId, name: job.name || '', stage: job.stage || '', status: job.status || '' },
      invoiced: round2(invoiced),
      collected: round2(collected),
      expenses: round2(expenses),
      laborHours,
      laborCost: canSeeCost ? round2(laborCost) : null,
      profit,
      profitExcludesLabor: !canSeeCost,
      note: canSeeCost ? 'profit = invoiced − expenses − labor cost' : 'profit = invoiced − expenses (labor cost needs financials:sensitive)',
    });
  } catch (e) {
    console.error('[api-job-profit] unhandled:', e && e.stack ? e.stack : e);
    return json(500, { error: 'Unexpected server error: ' + ((e && e.message) || 'unknown') });
  }
};
