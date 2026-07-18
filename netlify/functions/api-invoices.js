// Agent-facing invoice READ endpoint (see AGENT_API_DESIGN.md §5).
//
//   GET /.netlify/functions/api-invoices
//   Authorization: Bearer sk_live_...
//   Requires scope: invoices:read
//
// Query params (all optional):
//   status = draft | sent | paid | overdue   (filter)
//   limit  = max rows to return (default 100, max 500)
//
// Read-only. Invoices live on each job as job.invoices[]; this flattens them
// across the key's company namespace and returns them with light job context.
// This mirrors the client-side helpers in src/app/02-state-utils-data.js
// (calcInvoice / invoiceStatus) so statuses match what owners see in the app.

const { db } = require('./_lib/firebaseAdmin');
const { corsHeaders, jsonResponder, authenticateApiKey } = require('./_lib/apiKeyAuth');

function num(v) { return Number(v || 0); }

// Mirror of calcInvoice() in the client.
function calcInvoice(inv) {
  const items = inv.items || [];
  const sub = items.reduce((s, i) => s + num(i.qty) * num(i.rate), 0);
  const tax = sub * (num(inv.taxRate) / 100);
  const total = sub + tax;
  const paid = num(inv.paid);
  return { sub, tax, total, paid, balance: total - paid };
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

// Mirror of invoiceStatus() in the client.
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

  const authed = await authenticateApiKey(event, 'invoices:read');
  if (authed.error) return json(authed.error.statusCode, { error: authed.error.message });

  const ns = authed.key.ns || authed.key.company;
  if (!ns) return json(500, { error: 'Key is not bound to a company' });

  const params = (event.queryStringParameters || {});
  const wantStatus = params.status ? String(params.status).toLowerCase() : null;
  let limit = parseInt(params.limit, 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = 100;
  limit = Math.min(limit, 500);

  let jobs;
  try {
    const snap = await db().ref(ns + '/jobs').get();
    jobs = snap.val() || {};
  } catch (e) {
    return json(500, { error: 'Could not read invoices' });
  }

  const out = [];
  for (const jobId of Object.keys(jobs)) {
    const j = jobs[jobId] || {};
    const invs = Array.isArray(j.invoices) ? j.invoices : [];
    for (const inv of invs) {
      const c = calcInvoice(inv);
      const status = invoiceStatus(inv);
      if (wantStatus && status !== wantStatus) continue;
      out.push({
        id: inv.id || null,
        number: inv.number || '',
        status,
        date: inv.date || '',
        dueDate: inv.dueDate || '',
        total: Math.round(c.total * 100) / 100,
        paid: Math.round(c.paid * 100) / 100,
        balance: Math.round(c.balance * 100) / 100,
        job: { id: jobId, name: j.name || '' },
        customer: {
          name: j.customerName || '',
          email: j.customerEmail || '',
          phone: j.customerPhone || '',
        },
      });
    }
  }

  // Newest first by date, then cap.
  out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const total = out.length;
  const rows = out.slice(0, limit);

  return json(200, { company: authed.key.company, count: rows.length, total, invoices: rows });
};
