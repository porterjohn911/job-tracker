// Agent-facing "who owes me money" — outstanding A/R grouped by customer.
//
//   GET /.netlify/functions/api-receivables    (scope invoices:read)
//   Authorization: Bearer sk_live_...
//
// Groups every invoice with a positive balance by customer and sorts by amount
// owed, so the agent can answer "who owes me money?" directly.

const { db } = require('./_lib/firebaseAdmin');
const { corsHeaders, jsonResponder, authenticateApiKey } = require('./_lib/apiKeyAuth');

function num(v) { return Number(v || 0); }
function round2(n) { return Math.round(n * 100) / 100; }
function balanceOf(inv) {
  const items = inv.items || [];
  const sub = items.reduce((s, i) => s + num(i.qty) * num(i.rate), 0);
  const total = sub + sub * (num(inv.taxRate) / 100);
  return total - num(inv.paid);
}
function isOverdue(inv) {
  if (inv.status !== 'sent' || !inv.dueDate) return false;
  const d = new Date(inv.dueDate);
  return !isNaN(d.getTime()) && d.getTime() < Date.now();
}

exports.handler = async (event) => {
  const origin = event.headers && (event.headers.origin || event.headers.Origin);
  const json = jsonResponder(origin);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(origin), body: '{}' };
  if (event.httpMethod !== 'GET') return json(405, { error: 'GET only' });

  try {
    const authed = await authenticateApiKey(event, 'invoices:read');
    if (authed.error) return json(authed.error.statusCode, { error: authed.error.message });
    const ns = authed.key.ns || authed.key.company;
    if (!ns) return json(500, { error: 'Key is not bound to a company' });

    let jobs;
    try { jobs = (await db().ref(ns + '/jobs').get()).val() || {}; }
    catch (e) { return json(500, { error: 'Read failed: ' + e.message }); }

    const byCustomer = {};
    let totalOutstanding = 0;
    for (const jobId of Object.keys(jobs)) {
      const j = jobs[jobId] || {};
      const cust = j.customerName || '(no customer)';
      for (const inv of (Array.isArray(j.invoices) ? j.invoices : [])) {
        const bal = balanceOf(inv);
        if (bal <= 0.005) continue;
        totalOutstanding += bal;
        const g = byCustomer[cust] || (byCustomer[cust] = { customer: cust, email: j.customerEmail || '', outstanding: 0, invoiceCount: 0, invoices: [] });
        g.outstanding += bal;
        g.invoiceCount++;
        g.invoices.push({ number: inv.number || '', jobName: j.name || '', balance: round2(bal), dueDate: inv.dueDate || '', overdue: isOverdue(inv) });
      }
    }

    const customers = Object.values(byCustomer)
      .map((g) => ({ ...g, outstanding: round2(g.outstanding) }))
      .sort((a, b) => b.outstanding - a.outstanding);

    return json(200, { company: authed.key.company, totalOutstanding: round2(totalOutstanding), customerCount: customers.length, customers });
  } catch (e) {
    console.error('[api-receivables] unhandled:', e && e.stack ? e.stack : e);
    return json(500, { error: 'Unexpected server error: ' + ((e && e.message) || 'unknown') });
  }
};
