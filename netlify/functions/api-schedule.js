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

  try {
    if (event.httpMethod === 'GET') return await list(event, json);
    if (event.httpMethod === 'POST') return await add(event, json);
    if (event.httpMethod === 'PATCH') return await update(event, json);
    if (event.httpMethod === 'DELETE') return await remove(event, json);
    return json(405, { error: 'GET, POST, PATCH, or DELETE' });
  } catch (e) {
    console.error('[api-schedule] unhandled:', e && e.stack ? e.stack : e);
    return json(500, { error: 'Unexpected server error: ' + ((e && e.message) || 'unknown') });
  }
};

async function update(event, json) {
  const authed = await authenticateApiKey(event, 'schedule:write');
  if (authed.error) return json(authed.error.statusCode, { error: authed.error.message });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad request' }); }
  const id = String(body.id || '').trim();
  if (!id) return json(400, { error: 'id is required' });

  let entry;
  try { entry = (await db().ref('owner_schedule/' + id).get()).val(); } catch (e) { return json(500, { error: 'Read failed: ' + e.message }); }
  if (!entry) return json(404, { error: 'No schedule entry with id ' + id });

  const updates = {};
  for (const f of ['date', 'title', 'notes']) if (body[f] !== undefined) updates[f] = String(body[f]);
  if (!Object.keys(updates).length) return json(400, { error: 'Nothing to update — provide date, title, or notes' });

  try { await db().ref('owner_schedule/' + id).update(updates); }
  catch (e) { return json(500, { error: 'Update failed: ' + e.message }); }
  return json(200, { ok: true, id, updated: Object.keys(updates) });
}

async function remove(event, json) {
  const authed = await authenticateApiKey(event, 'delete');
  if (authed.error) return json(authed.error.statusCode, { error: authed.error.message });

  const p = event.queryStringParameters || {};
  const id = String(p.id || '').trim();
  if (!id) return json(400, { error: 'id is required' });

  let entry;
  try { entry = (await db().ref('owner_schedule/' + id).get()).val(); } catch (e) { return json(500, { error: 'Read failed: ' + e.message }); }
  if (!entry) return json(404, { error: 'No schedule entry with id ' + id });

  try { await db().ref('owner_schedule/' + id).remove(); }
  catch (e) { return json(500, { error: 'Delete failed: ' + e.message }); }
  return json(200, { ok: true, deleted: 'schedule_entry', id, title: entry.title || '' });
}

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
