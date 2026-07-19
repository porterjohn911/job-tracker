// Agent-facing expense/receipt logging (see AGENT_API_DESIGN.md).
//
//   POST /.netlify/functions/api-expenses    (scope expenses:write)
//   Authorization: Bearer sk_live_...
//   body: { amount, jobId?, category?, note?, date? }
//
// With jobId -> appends to that job's receipts[]. Without -> a standalone
// overhead receipt under {ns}/receipts. Category is validated against the app's
// list (defaults to "Other").

const { db } = require('./_lib/firebaseAdmin');
const { corsHeaders, jsonResponder, authenticateApiKey } = require('./_lib/apiKeyAuth');

const RECEIPT_CATS = ['Materials', 'Tools / Equipment', 'Fuel / Travel', 'Subcontractor', 'Permits / Fees', 'Labor', 'Meals', 'Other'];
function num(v) { return Number(v || 0); }
function todayKey() { return new Date().toISOString().slice(0, 10); }

exports.handler = async (event) => {
  const origin = event.headers && (event.headers.origin || event.headers.Origin);
  const json = jsonResponder(origin);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(origin), body: '{}' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });

  try {
    const authed = await authenticateApiKey(event, 'expenses:write');
    if (authed.error) return json(authed.error.statusCode, { error: authed.error.message });
    const ns = authed.key.ns || authed.key.company;
    if (!ns) return json(500, { error: 'Key is not bound to a company' });

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad request' }); }
    const amount = num(body.amount);
    if (!amount) return json(400, { error: 'amount is required (non-zero)' });
    const category = RECEIPT_CATS.includes(body.category) ? body.category : 'Other';
    const receipt = {
      id: 'rcpt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      amount: Math.round(amount * 100) / 100,
      category,
      date: (body.date && String(body.date)) || todayKey(),
      note: body.note ? String(body.note) : '',
    };

    const jobId = String(body.jobId || '').trim();
    if (jobId) {
      let job;
      try { job = (await db().ref(ns + '/jobs/' + jobId).get()).val(); } catch (e) { return json(500, { error: 'Read failed: ' + e.message }); }
      if (!job) return json(404, { error: 'No job with id ' + jobId });
      const arr = Array.isArray(job.receipts) ? job.receipts.slice() : [];
      arr.push(receipt);
      try { await db().ref(ns + '/jobs/' + jobId + '/receipts').set(arr); }
      catch (e) { return json(500, { error: 'Save failed: ' + e.message }); }
      db().ref(ns + '/activity').push({
        user: 'Agent · ' + (authed.key.label || authed.key.prefix || 'API key'),
        action: 'logged a ' + category + ' expense (' + receipt.amount + ') for', job: job.name || '', jobId, time: Date.now(),
      }).catch(() => {});
      return json(201, { ok: true, receipt, jobId });
    }

    // Overhead (not tied to a job).
    try { await db().ref(ns + '/receipts/' + receipt.id).set(receipt); }
    catch (e) { return json(500, { error: 'Save failed: ' + e.message }); }
    return json(201, { ok: true, receipt, overhead: true });
  } catch (e) {
    console.error('[api-expenses] unhandled:', e && e.stack ? e.stack : e);
    return json(500, { error: 'Unexpected server error: ' + ((e && e.message) || 'unknown') });
  }
};
