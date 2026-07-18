// Agent-facing schedule endpoint (see AGENT_API_DESIGN.md §5, Phase 2).
//
//   GET  /.netlify/functions/api-schedule    -> list entries   (scope schedule:read)
//   POST /.netlify/functions/api-schedule    -> add an entry    (scope schedule:write)
//   Authorization: Bearer sk_live_...
//
// Entries live in the global /owner_schedule node (the owner's shared calendar).
// Shape required by database.rules.json: { id, date, title }. Entries the agent
// creates are tagged with the key's company for context.

const { db } = require('./_lib/firebaseAdmin');
const { corsHeaders, jsonResponder, authenticateApiKey } = require('./_lib/apiKeyAuth');

exports.handler = async (event) => {
  const origin = event.headers && (event.headers.origin || event.headers.Origin);
  const json = jsonResponder(origin);

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(origin), body: '{}' };
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') return json(405, { error: 'GET or POST only' });

  try {
    return event.httpMethod === 'POST' ? await add(event, json) : await list(event, json);
  } catch (e) {
    console.error('[api-schedule] unhandled:', e && e.stack ? e.stack : e);
    return json(500, { error: 'Unexpected server error: ' + ((e && e.message) || 'unknown') });
  }
};

async function list(event, json) {
  const authed = await authenticateApiKey(event, 'schedule:read');
  if (authed.error) return json(authed.error.statusCode, { error: authed.error.message });

  let all;
  try {
    const snap = await db().ref('owner_schedule').get();
    all = snap.val() || {};
  } catch (e) {
    return json(500, { error: 'Could not read schedule: ' + e.message });
  }

  const entries = Object.keys(all)
    .map((id) => {
      const e = all[id] || {};
      return { id, date: e.date || '', title: e.title || '', notes: e.notes || '', company: e.company || '' };
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return json(200, { count: entries.length, entries });
}

async function add(event, json) {
  const authed = await authenticateApiKey(event, 'schedule:write');
  if (authed.error) return json(authed.error.statusCode, { error: authed.error.message });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad request' }); }

  const date = String(body.date || '').trim();
  const title = String(body.title || '').trim();
  if (!date) return json(400, { error: 'date is required (YYYY-MM-DD)' });
  if (!title) return json(400, { error: 'title is required' });

  const id = 'sch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const entry = { id, date, title, company: authed.key.company || '' };
  if (body.notes) entry.notes = String(body.notes);

  try {
    await db().ref('owner_schedule/' + id).set(entry);
  } catch (e) {
    return json(500, { error: 'Could not save entry: ' + e.message });
  }

  return json(201, { entry });
}
