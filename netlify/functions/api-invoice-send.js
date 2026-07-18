// Agent-facing invoice SEND request — approval-gated (see AGENT_API_DESIGN.md §7).
//
//   POST /.netlify/functions/api-invoice-send
//   Authorization: Bearer sk_live_...   (scope invoices:write)
//   body: { jobId, invoiceId, to?, subject?, message?, kind? }
//
// This does NOT email anything. It records a PENDING send request under
// {ns}/pending_sends/{id}. An owner then reviews it in the app and either
// approves (which opens the normal send composer and sends via their own
// Gmail/PDF path) or dismisses it. The agent can never send on its own.

const { db } = require('./_lib/firebaseAdmin');
const { corsHeaders, jsonResponder, authenticateApiKey } = require('./_lib/apiKeyAuth');

exports.handler = async (event) => {
  const origin = event.headers && (event.headers.origin || event.headers.Origin);
  const json = jsonResponder(origin);

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(origin), body: '{}' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });

  try {
    return await queue(event, json);
  } catch (e) {
    console.error('[api-invoice-send] unhandled:', e && e.stack ? e.stack : e);
    return json(500, { error: 'Unexpected server error: ' + ((e && e.message) || 'unknown') });
  }
};

async function queue(event, json) {
  const authed = await authenticateApiKey(event, 'invoices:write');
  if (authed.error) return json(authed.error.statusCode, { error: authed.error.message });

  const ns = authed.key.ns || authed.key.company;
  if (!ns) return json(500, { error: 'Key is not bound to a company' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad request' }); }

  const jobId = String(body.jobId || '').trim();
  const invoiceId = String(body.invoiceId || '').trim();
  if (!jobId || !invoiceId) return json(400, { error: 'jobId and invoiceId are required' });
  const kind = body.kind === 'estimate' ? 'estimate' : 'invoice';

  let job;
  try {
    const snap = await db().ref(ns + '/jobs/' + jobId).get();
    job = snap.val();
  } catch (e) {
    return json(500, { error: 'Could not read job: ' + e.message });
  }
  if (!job) return json(404, { error: 'No job with id ' + jobId });

  const list = kind === 'estimate' ? (job.estimates || []) : (job.invoices || []);
  const inv = (Array.isArray(list) ? list : []).find((i) => i && i.id === invoiceId);
  if (!inv) return json(404, { error: 'No ' + kind + ' with id ' + invoiceId + ' on that job' });

  const record = {
    jobId,
    invoiceId,
    kind,
    number: inv.number || '',
    to: (body.to ? String(body.to) : (job.customerEmail || '')),
    subject: body.subject ? String(body.subject) : '',
    message: body.message ? String(body.message) : '',
    customerName: job.customerName || '',
    jobName: job.name || '',
    requestedByLabel: authed.key.label || authed.key.prefix || 'API key',
    requestedByKey: authed.key.prefix || '',
    requestedAt: Date.now(),
    status: 'pending',
  };

  let id;
  try {
    const ref = db().ref(ns + '/pending_sends').push();
    id = ref.key;
    record.id = id;
    await ref.set(record);
  } catch (e) {
    return json(500, { error: 'Could not queue send: ' + e.message });
  }

  return json(201, {
    queued: true,
    status: 'pending',
    id,
    message: 'Send request queued for owner approval — it will not be emailed until an owner approves it.',
  });
}
