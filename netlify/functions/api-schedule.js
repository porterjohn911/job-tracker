// Agent-facing schedule endpoint (see AGENT_API_DESIGN.md §5, Phase 2).
//
//   GET    /.netlify/functions/api-schedule   -> list entries   (scope schedule:read)
//   POST   /.netlify/functions/api-schedule   -> add an entry    (scope schedule:write)
//   PATCH  /.netlify/functions/api-schedule   -> edit an entry    (scope schedule:write)
//   DELETE /.netlify/functions/api-schedule   -> remove an entry  (scope delete)
//   Authorization: Bearer sk_live_...
//
// Entries live in the global /owner_schedule node (the owner's shared calendar),
// the SAME node/shape the owner view reads. To draw a real TIME BLOCK the calendar
// needs startMin/endMin (minutes past midnight) plus a type; entries without a
// time render as a bare all-day chip. This endpoint accepts friendly clock times
// ("8am", "16:00") and converts them. Shape required by database.rules.json:
// { id, date, title }.

const { db } = require('./_lib/firebaseAdmin');
const { corsHeaders, jsonResponder, authenticateApiKey } = require('./_lib/apiKeyAuth');

// Mirror of oschTypeLabel() in the client (src/app/views/01-owner-dashboard.js).
const TYPE_LABELS = { onsite: 'On site', meeting: 'Meeting', estimating: 'Estimating', delivering: 'Delivering materials', admin: 'Admin work' };
function typeLabel(t) { return TYPE_LABELS[t] || 'On site'; }

// Resolve a friendly type name/label to a canonical key; default 'onsite'.
function canonicalType(input) {
  if (input == null || String(input).trim() === '') return 'onsite';
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
  const want = norm(input);
  for (const k of Object.keys(TYPE_LABELS)) {
    if (norm(k) === want || norm(TYPE_LABELS[k]) === want) return k;
  }
  if (want === 'onsite' || want === 'jobsite' || want === 'field') return 'onsite';
  return null; // caller decides whether to 400
}

// Parse a clock time to minutes past midnight. Accepts "8", "8:30", "08:00",
// "8am", "4:30 PM", "16:00". Returns null if unparseable.
function clockToMin(v) {
  if (v == null || String(v).trim() === '') return null;
  const s = String(v).trim().toLowerCase();
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mm = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3];
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

// Explicit minutes (0..1439) or, failing that, a clock string.
function resolveMin(minField, clockField) {
  if (minField != null && minField !== '') {
    const n = Number(minField);
    if (Number.isFinite(n) && n >= 0 && n < 1440) return Math.round(n);
  }
  return clockToMin(clockField);
}

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
  if (body.date !== undefined) updates.date = String(body.date);
  if (body.title !== undefined) updates.title = String(body.title);
  if (body.desc !== undefined) updates.desc = String(body.desc);
  if (body.notes !== undefined) updates.notes = String(body.notes);
  if (body.assignee !== undefined) updates.assignee = String(body.assignee);

  if (body.type !== undefined) {
    const t = canonicalType(body.type);
    if (!t) return json(400, { error: 'Unknown type. Use one of: ' + Object.keys(TYPE_LABELS).join(', ') });
    updates.type = t;
  }
  if (body.start !== undefined || body.startMin !== undefined) {
    const sm = resolveMin(body.startMin, body.start);
    if (sm == null) return json(400, { error: 'Could not parse start time (use "8am" / "16:00")' });
    updates.startMin = sm;
  }
  if (body.end !== undefined || body.endMin !== undefined) {
    const em = resolveMin(body.endMin, body.end);
    if (em == null) return json(400, { error: 'Could not parse end time (use "4pm" / "16:00")' });
    updates.endMin = em;
  }
  const finalStart = updates.startMin != null ? updates.startMin : entry.startMin;
  const finalEnd = updates.endMin != null ? updates.endMin : entry.endMin;
  if (finalStart != null && finalEnd != null && finalEnd <= finalStart) {
    return json(400, { error: 'End time must be after start time' });
  }
  // Keep title in sync if the type changed but no explicit title was ever set.
  if (updates.type && body.title === undefined && (!entry.title || entry.title === typeLabel(entry.type))) {
    updates.title = updates.desc || typeLabel(updates.type);
  }
  if (!Object.keys(updates).length) return json(400, { error: 'Nothing to update — provide date, title, type, start, end, assignee, or notes' });

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

  const p = event.queryStringParameters || {};
  const from = p.from ? String(p.from) : '';
  const to = p.to ? String(p.to) : '';

  const entries = Object.keys(all)
    .map((id) => {
      const e = all[id] || {};
      return {
        id,
        date: e.date || '',
        title: e.title || '',
        type: e.type || '',
        typeLabel: e.type ? typeLabel(e.type) : '',
        startMin: e.startMin != null ? e.startMin : null,
        endMin: e.endMin != null ? e.endMin : null,
        time: e.startMin != null ? hhmm(e.startMin) + (e.endMin != null ? '–' + hhmm(e.endMin) : '') : '',
        assignee: e.assignee || '',
        desc: e.desc || '',
        notes: e.notes || '',
        jobId: e.jobId || '',
        company: e.company || '',
      };
    })
    .filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || (a.startMin || 0) - (b.startMin || 0));

  return json(200, { count: entries.length, entries });
}

function hhmm(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// Build one owner-calendar event from the shared fields for a given date.
// idx salts the id so a multi-date loop within the same millisecond can't collide.
function buildEntry(date, f, authed, idx) {
  const id = 'oev_' + Date.now() + '_' + (idx || 0) + '_' + Math.random().toString(36).slice(2, 6);
  const entry = {
    id,
    date,
    type: f.type,
    title: f.title || f.desc || typeLabel(f.type),
    company: authed.key.company || '',
    by: 'Agent · ' + (authed.key.label || authed.key.prefix || 'API key'),
    created: Date.now(),
  };
  if (f.desc) entry.desc = f.desc;
  if (f.notes) entry.notes = f.notes;
  if (f.assignee) entry.assignee = f.assignee;
  if (f.jobId) entry.jobId = f.jobId;
  if (f.startMin != null) entry.startMin = f.startMin;
  if (f.endMin != null) entry.endMin = f.endMin;
  return entry;
}

async function add(event, json) {
  const authed = await authenticateApiKey(event, 'schedule:write');
  if (authed.error) return json(authed.error.statusCode, { error: authed.error.message });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad request' }); }

  // One date, or many (dates:[]) — e.g. "8–4 every day this week".
  let dates = [];
  if (Array.isArray(body.dates) && body.dates.length) dates = body.dates.map((d) => String(d).trim()).filter(Boolean);
  else if (body.date) dates = [String(body.date).trim()];
  if (!dates.length) return json(400, { error: 'date (YYYY-MM-DD) or dates[] is required' });
  const badDate = dates.find((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d));
  if (badDate) return json(400, { error: 'Bad date "' + badDate + '" — use YYYY-MM-DD' });

  const type = canonicalType(body.type);
  if (type === null) return json(400, { error: 'Unknown type. Use one of: ' + Object.keys(TYPE_LABELS).join(', ') });

  // Times are optional (untimed = all-day chip), but if given they must parse
  // and be ordered. A start without an end defaults to a 1-hour block.
  let startMin = resolveMin(body.startMin, body.start);
  let endMin = resolveMin(body.endMin, body.end);
  if ((body.start != null && body.start !== '' || body.startMin != null) && startMin == null) {
    return json(400, { error: 'Could not parse start time (use "8am" / "16:00")' });
  }
  if ((body.end != null && body.end !== '' || body.endMin != null) && endMin == null) {
    return json(400, { error: 'Could not parse end time (use "4pm" / "16:00")' });
  }
  if (startMin != null && endMin == null) endMin = Math.min(startMin + 60, 1439);
  if (startMin != null && endMin != null && endMin <= startMin) {
    return json(400, { error: 'End time must be after start time' });
  }

  const title = body.title ? String(body.title).trim() : '';
  if (!title && !body.desc && startMin == null) {
    // With no title, no desc, and no time, there's nothing meaningful to show.
    return json(400, { error: 'Provide a title/desc, or a start time (with a type like "onsite")' });
  }

  const fields = {
    type,
    title,
    desc: body.desc ? String(body.desc).trim() : '',
    notes: body.notes ? String(body.notes).trim() : '',
    assignee: body.assignee ? String(body.assignee).trim() : '',
    jobId: body.jobId ? String(body.jobId).trim() : '',
    startMin, endMin,
  };

  const created = [];
  try {
    for (let i = 0; i < dates.length; i++) {
      const entry = buildEntry(dates[i], fields, authed, i);
      await db().ref('owner_schedule/' + entry.id).set(entry);
      created.push(entry);
    }
  } catch (e) {
    return json(500, { error: 'Could not save entry: ' + e.message });
  }

  if (created.length === 1) return json(201, { entry: created[0] });
  return json(201, { count: created.length, entries: created });
}
