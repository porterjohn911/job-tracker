// Owner-facing management of queued (approval-gated) agent send requests.
//
//   GET  /.netlify/functions/api-pending-sends?company=wfs[&status=pending]
//   POST /.netlify/functions/api-pending-sends   { company, id, action }
//   Authorization: Bearer <Firebase ID token>   (owner only)
//
// The agent queues sends via api-invoice-send.js; the owner lists them here and
// marks each approved or rejected. The actual email is sent by the app's normal
// composer when the owner approves — this endpoint only records the decision.

const { db } = require('./_lib/firebaseAdmin');
const { corsHeaders, jsonResponder, verifyOwner } = require('./_lib/apiKeyAuth');

async function resolveNamespace(companyId) {
  try {
    const snap = await db().ref('companies/' + companyId + '/ns').get();
    if (snap.exists() && typeof snap.val() === 'string') return snap.val();
  } catch (e) { /* fall through */ }
  return companyId;
}

exports.handler = async (event) => {
  const origin = event.headers && (event.headers.origin || event.headers.Origin);
  const json = jsonResponder(origin);

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(origin), body: '{}' };

  try {
    const authed = await verifyOwner(event);
    if (authed.error) return json(authed.error.statusCode, { error: authed.error.message });

    if (event.httpMethod === 'GET') return await list(event, json);
    if (event.httpMethod === 'POST') return await resolve(event, json, authed.uid);
    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    console.error('[api-pending-sends] unhandled:', e && e.stack ? e.stack : e);
    return json(500, { error: 'Unexpected server error: ' + ((e && e.message) || 'unknown') });
  }
};

async function list(event, json) {
  const params = event.queryStringParameters || {};
  const company = String(params.company || '').trim();
  if (!company) return json(400, { error: 'company is required' });
  const wantStatus = params.status ? String(params.status).toLowerCase() : 'pending';

  const ns = await resolveNamespace(company);
  let all;
  try {
    const snap = await db().ref(ns + '/pending_sends').get();
    all = snap.val() || {};
  } catch (e) {
    return json(500, { error: 'Could not read pending sends: ' + e.message });
  }

  const sends = Object.keys(all)
    .map((id) => ({ id, ...all[id] }))
    .filter((s) => wantStatus === 'all' || (s.status || 'pending') === wantStatus)
    .sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0));

  return json(200, { company, count: sends.length, sends });
}

async function resolve(event, json, uid) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad request' }); }

  const company = String(body.company || '').trim();
  const id = String(body.id || '').trim();
  const action = String(body.action || '').trim();
  if (!company || !id) return json(400, { error: 'company and id are required' });
  if (action !== 'approved' && action !== 'rejected') {
    return json(400, { error: "action must be 'approved' or 'rejected'" });
  }

  const ns = await resolveNamespace(company);
  const ref = db().ref(ns + '/pending_sends/' + id);
  let existing;
  try {
    existing = (await ref.get()).val();
  } catch (e) {
    return json(500, { error: 'Could not read pending send: ' + e.message });
  }
  if (!existing) return json(404, { error: 'No pending send with that id' });

  try {
    await ref.update({ status: action, resolvedBy: uid, resolvedAt: Date.now() });
  } catch (e) {
    return json(500, { error: 'Could not update pending send: ' + e.message });
  }

  return json(200, { ok: true, id, status: action });
}
