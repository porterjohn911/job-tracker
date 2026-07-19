// Agent-facing invoice endpoint (see AGENT_API_DESIGN.md §5, Phase 2).
//
//   GET  /.netlify/functions/api-invoices    -> list invoices  (scope invoices:read)
//   POST /.netlify/functions/api-invoices    -> create a draft  (scope invoices:write)
//   Authorization: Bearer sk_live_...
//
// GET query params (optional): status = draft|sent|paid|overdue, limit (<=500).
// POST body: { jobId, items:[{desc,qty,rate}], taxRate?, date?, dueDate?, notes?, terms? }
//
// Invoices live on each job as job.invoices[]. Creating one appends a draft and
// mirrors the shape produced by defaultInvoice() in the client. Sending is a
// separate, approval-gated endpoint (api-invoice-send.js) — creating never emails.

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

// Mirror of nextInvoiceNumber()/nextEstimateNumber() in the client — scan every
// job's docs of that kind and increment the max.
function nextNumber(jobs, kind) {
  const field = kind === 'estimate' ? 'estimates' : 'invoices';
  const prefix = kind === 'estimate' ? 'EST-' : 'INV-';
  let max = 1000;
  for (const jobId of Object.keys(jobs)) {
    const arr = (jobs[jobId] && jobs[jobId][field]) || [];
    for (const d of arr) {
      const m = String(d.number || '').match(/(\d+)/);
      if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
    }
  }
  return prefix + (max + 1);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

exports.handler = async (event) => {
  const origin = event.headers && (event.headers.origin || event.headers.Origin);
  const json = jsonResponder(origin);

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(origin), body: '{}' };
  try {
    if (event.httpMethod === 'GET') return await list(event, json);
    if (event.httpMethod === 'POST') return await create(event, json);
    if (event.httpMethod === 'PATCH') return await recordPayment(event, json);
    if (event.httpMethod === 'DELETE') return await remove(event, json);
    return json(405, { error: 'GET, POST, PATCH, or DELETE' });
  } catch (e) {
    console.error('[api-invoices] unhandled:', e && e.stack ? e.stack : e);
    return json(500, { error: 'Unexpected server error: ' + ((e && e.message) || 'unknown') });
  }
};

// Find the invoice/estimate + its index on a job. kind = 'invoice' | 'estimate'.
function findDoc(job, kind, docId) {
  const arr = Array.isArray(kind === 'estimate' ? job.estimates : job.invoices)
    ? (kind === 'estimate' ? job.estimates : job.invoices) : [];
  const idx = arr.findIndex((d) => d && d.id === docId);
  return { arr, idx };
}

// Record a payment against an invoice. amount adds to paid; omit amount to mark
// fully paid (paid = total).
async function recordPayment(event, json) {
  const authed = await authenticateApiKey(event, 'invoices:write');
  if (authed.error) return json(authed.error.statusCode, { error: authed.error.message });
  const ns = authed.key.ns || authed.key.company;
  if (!ns) return json(500, { error: 'Key is not bound to a company' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad request' }); }
  const jobId = String(body.jobId || '').trim();
  const invoiceId = String(body.invoiceId || '').trim();
  if (!jobId || !invoiceId) return json(400, { error: 'jobId and invoiceId are required' });

  let job;
  try { job = (await db().ref(ns + '/jobs/' + jobId).get()).val(); } catch (e) { return json(500, { error: 'Read failed: ' + e.message }); }
  if (!job) return json(404, { error: 'No job with id ' + jobId });
  const { arr, idx } = findDoc(job, 'invoice', invoiceId);
  if (idx < 0) return json(404, { error: 'No invoice with id ' + invoiceId + ' on that job' });

  const inv = arr[idx];
  const c = calcInvoice(inv);
  const addAmount = body.amount != null ? num(body.amount) : null;
  const newPaid = addAmount != null ? num(inv.paid) + addAmount : c.total;
  const paid = Math.round(newPaid * 100) / 100;
  arr[idx] = { ...inv, paid, status: paid >= c.total - 0.005 ? 'paid' : (inv.status || 'sent') };

  try { await db().ref(ns + '/jobs/' + jobId + '/invoices').set(arr); }
  catch (e) { return json(500, { error: 'Save failed: ' + e.message }); }

  db().ref(ns + '/activity').push({
    user: 'Agent · ' + (authed.key.label || authed.key.prefix || 'API key'),
    action: 'recorded payment on invoice ' + (inv.number || '') + ' for',
    job: job.name || '', jobId, time: Date.now(),
  }).catch(() => {});

  const nc = calcInvoice(arr[idx]);
  return json(200, { ok: true, invoiceId, number: inv.number || '', paid, balance: Math.round(nc.balance * 100) / 100, status: arr[idx].status });
}

async function remove(event, json) {
  const authed = await authenticateApiKey(event, 'delete');
  if (authed.error) return json(authed.error.statusCode, { error: authed.error.message });
  const ns = authed.key.ns || authed.key.company;
  if (!ns) return json(500, { error: 'Key is not bound to a company' });

  const p = event.queryStringParameters || {};
  const jobId = String(p.jobId || '').trim();
  const invoiceId = String(p.invoiceId || '').trim();
  const kind = p.kind === 'estimate' ? 'estimate' : 'invoice';
  if (!jobId || !invoiceId) return json(400, { error: 'jobId and invoiceId are required' });

  let job;
  try { job = (await db().ref(ns + '/jobs/' + jobId).get()).val(); } catch (e) { return json(500, { error: 'Read failed: ' + e.message }); }
  if (!job) return json(404, { error: 'No job with id ' + jobId });
  const { arr, idx } = findDoc(job, kind, invoiceId);
  if (idx < 0) return json(404, { error: 'No ' + kind + ' with id ' + invoiceId + ' on that job' });

  const doc = arr[idx];
  arr.splice(idx, 1);
  try { await db().ref(ns + '/jobs/' + jobId + '/' + (kind === 'estimate' ? 'estimates' : 'invoices')).set(arr); }
  catch (e) { return json(500, { error: 'Delete failed: ' + e.message }); }

  db().ref(ns + '/activity').push({
    user: 'Agent · ' + (authed.key.label || authed.key.prefix || 'API key'),
    action: 'DELETED ' + kind + ' ' + (doc.number || ''), job: job.name || '', jobId, time: Date.now(),
  }).catch(() => {});

  return json(200, { ok: true, deleted: kind, id: invoiceId, number: doc.number || '' });
}

async function list(event, json) {
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
    return json(500, { error: 'Could not read invoices: ' + e.message });
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
        customer: { name: j.customerName || '', email: j.customerEmail || '', phone: j.customerPhone || '' },
      });
    }
  }

  out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const total = out.length;
  return json(200, { company: authed.key.company, count: Math.min(total, limit), total, invoices: out.slice(0, limit) });
}

async function create(event, json) {
  const authed = await authenticateApiKey(event, 'invoices:write');
  if (authed.error) return json(authed.error.statusCode, { error: authed.error.message });

  const ns = authed.key.ns || authed.key.company;
  if (!ns) return json(500, { error: 'Key is not bound to a company' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad request' }); }

  const jobId = String(body.jobId || '').trim();
  if (!jobId) return json(400, { error: 'jobId is required' });

  const items = Array.isArray(body.items) ? body.items : null;
  if (!items || !items.length) return json(400, { error: 'items[] is required (at least one line)' });
  const cleanItems = [];
  for (const it of items) {
    if (!it || typeof it.desc !== 'string' || !it.desc.trim()) {
      return json(400, { error: 'each item needs a non-empty desc' });
    }
    cleanItems.push({ desc: it.desc.trim(), qty: num(it.qty) || 1, rate: num(it.rate) });
  }

  let jobs;
  try {
    const snap = await db().ref(ns + '/jobs').get();
    jobs = snap.val() || {};
  } catch (e) {
    return json(500, { error: 'Could not read jobs: ' + e.message });
  }
  const job = jobs[jobId];
  if (!job) return json(404, { error: 'No job with id ' + jobId });

  const kind = body.kind === 'estimate' ? 'estimate' : 'invoice';
  const field = kind === 'estimate' ? 'estimates' : 'invoices';
  const invoice = {
    id: (kind === 'estimate' ? 'est_' : 'inv_') + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    number: nextNumber(jobs, kind),
    date: (body.date && String(body.date)) || todayKey(),
    dueDate: (body.dueDate && String(body.dueDate)) || '',
    items: cleanItems,
    taxRate: body.taxRate == null ? '' : num(body.taxRate),
    notes: body.notes ? String(body.notes) : '',
    terms: body.terms ? String(body.terms) : '',
    deposit: 0,
    paid: 0,
    status: 'draft',
  };

  const arr = Array.isArray(job[field]) ? job[field].slice() : [];
  arr.push(invoice);

  try {
    await db().ref(ns + '/jobs/' + jobId + '/' + field).set(arr);
  } catch (e) {
    return json(500, { error: 'Could not save ' + kind + ': ' + e.message });
  }

  // Audit trail (same activity feed owners already see).
  db().ref(ns + '/activity').push({
    user: 'Agent · ' + (authed.key.label || authed.key.prefix || 'API key'),
    action: 'created draft ' + kind + ' ' + invoice.number + ' for',
    job: job.name || '',
    jobId,
    time: Date.now(),
  }).catch(() => {});

  const c = calcInvoice(invoice);
  return json(201, {
    company: authed.key.company,
    invoice: {
      id: invoice.id, number: invoice.number, status: 'draft',
      date: invoice.date, dueDate: invoice.dueDate,
      total: Math.round(c.total * 100) / 100,
      job: { id: jobId, name: job.name || '' },
    },
  });
}
