// Agent-facing JOB LIST endpoint (see AGENT_API_DESIGN.md §5).
//
//   GET /.netlify/functions/api-jobs
//   Authorization: Bearer sk_live_...
//   Requires scope: invoices:read
//
// Lets an agent discover jobs (and their ids) so it can create/send invoices
// against them or report on them. Read-only.
//
// Query params (all optional):
//   status = lead|active|hold|lost|complete   (filter by job status)
//   stage  = Lead|Estimate|Approved|...        (filter by pipeline stage)
//   search = case-insensitive match on job name / customer name / address
//   limit  = max rows (default 100, max 500)

const { db } = require('./_lib/firebaseAdmin');
const { corsHeaders, jsonResponder, authenticateApiKey } = require('./_lib/apiKeyAuth');

function num(v) { return Number(v || 0); }

// A/R for one job, mirroring calcInvoice() in the client.
function jobAR(job) {
  let count = 0, outstanding = 0;
  for (const inv of (Array.isArray(job.invoices) ? job.invoices : [])) {
    count++;
    const items = inv.items || [];
    const sub = items.reduce((s, i) => s + num(i.qty) * num(i.rate), 0);
    const total = sub + sub * (num(inv.taxRate) / 100);
    outstanding += Math.max(0, total - num(inv.paid));
  }
  return { invoiceCount: count, outstanding: Math.round(outstanding * 100) / 100 };
}

exports.handler = async (event) => {
  const origin = event.headers && (event.headers.origin || event.headers.Origin);
  const json = jsonResponder(origin);

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(origin), body: '{}' };
  if (event.httpMethod !== 'GET') return json(405, { error: 'GET only' });

  try {
    return await list(event, json);
  } catch (e) {
    console.error('[api-jobs] unhandled:', e && e.stack ? e.stack : e);
    return json(500, { error: 'Unexpected server error: ' + ((e && e.message) || 'unknown') });
  }
};

async function list(event, json) {
  const authed = await authenticateApiKey(event, 'invoices:read');
  if (authed.error) return json(authed.error.statusCode, { error: authed.error.message });

  const ns = authed.key.ns || authed.key.company;
  if (!ns) return json(500, { error: 'Key is not bound to a company' });

  const params = event.queryStringParameters || {};
  const wantStatus = params.status ? String(params.status).toLowerCase() : null;
  const wantStage = params.stage ? String(params.stage).toLowerCase() : null;
  const search = params.search ? String(params.search).toLowerCase().trim() : null;
  let limit = parseInt(params.limit, 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = 100;
  limit = Math.min(limit, 500);

  let jobs;
  try {
    const snap = await db().ref(ns + '/jobs').get();
    jobs = snap.val() || {};
  } catch (e) {
    return json(500, { error: 'Could not read jobs: ' + e.message });
  }

  const out = [];
  for (const id of Object.keys(jobs)) {
    const j = jobs[id] || {};
    if (wantStatus && String(j.status || '').toLowerCase() !== wantStatus) continue;
    if (wantStage && String(j.stage || '').toLowerCase() !== wantStage) continue;
    if (search) {
      const hay = [j.name, j.customerName, j.address, j.billingAddress].map((x) => String(x || '').toLowerCase()).join(' ');
      if (!hay.includes(search)) continue;
    }
    const ar = jobAR(j);
    out.push({
      id,
      name: j.name || '',
      stage: j.stage || '',
      status: j.status || '',
      value: num(j.value),
      address: j.address || '',
      customer: { name: j.customerName || '', email: j.customerEmail || '', phone: j.customerPhone || '' },
      invoiceCount: ar.invoiceCount,
      outstanding: ar.outstanding,
    });
  }

  out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const total = out.length;
  return json(200, { company: authed.key.company, count: Math.min(total, limit), total, jobs: out.slice(0, limit) });
}
