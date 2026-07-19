// Agent-facing time logging (see AGENT_API_DESIGN.md).
//
//   POST /.netlify/functions/api-time    (scope time:write)
//   Authorization: Bearer sk_live_...
//   body: { member, hours, jobId?, date? }        (log N hours)
//     or:  { member, start, end, jobId? }          (explicit ms timestamps)
//
// Writes a time entry under {ns}/time. The app's schema requires { id, member,
// start(number) }; end is optional (an open entry = active timer). When `hours`
// is given, start/end are computed from `date` (or now).

const { db } = require('./_lib/firebaseAdmin');
const { corsHeaders, jsonResponder, authenticateApiKey } = require('./_lib/apiKeyAuth');

function num(v) { return Number(v || 0); }

exports.handler = async (event) => {
  const origin = event.headers && (event.headers.origin || event.headers.Origin);
  const json = jsonResponder(origin);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(origin), body: '{}' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });

  try {
    const authed = await authenticateApiKey(event, 'time:write');
    if (authed.error) return json(authed.error.statusCode, { error: authed.error.message });
    const ns = authed.key.ns || authed.key.company;
    if (!ns) return json(500, { error: 'Key is not bound to a company' });

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad request' }); }
    const member = String(body.member || '').trim();
    if (!member) return json(400, { error: 'member is required' });

    let start, end;
    if (body.start != null) {
      start = num(body.start);
      end = body.end != null ? num(body.end) : undefined;
    } else if (body.hours != null) {
      const hours = num(body.hours);
      if (hours <= 0) return json(400, { error: 'hours must be > 0' });
      // Anchor the block at 08:00 on the given date (or now) so it lands on the day.
      const base = body.date ? new Date(String(body.date) + 'T08:00:00') : new Date();
      if (isNaN(base.getTime())) return json(400, { error: 'invalid date (use YYYY-MM-DD)' });
      start = base.getTime();
      end = start + hours * 3600000;
    } else {
      return json(400, { error: 'provide hours (with optional date) or explicit start/end timestamps' });
    }

    const entry = { id: 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), member, start };
    if (end != null) entry.end = end;
    const jobId = String(body.jobId || '').trim();
    if (jobId) entry.job = jobId;

    try { await db().ref(ns + '/time/' + entry.id).set(entry); }
    catch (e) { return json(500, { error: 'Save failed: ' + e.message }); }

    const hoursLogged = end != null ? Math.round(((end - start) / 3600000) * 100) / 100 : null;
    db().ref(ns + '/activity').push({
      user: 'Agent · ' + (authed.key.label || authed.key.prefix || 'API key'),
      action: 'logged ' + (hoursLogged != null ? hoursLogged + ' hrs' : 'time') + ' for ' + member, job: '', time: Date.now(),
    }).catch(() => {});

    return json(201, { ok: true, entry, hours: hoursLogged });
  } catch (e) {
    console.error('[api-time] unhandled:', e && e.stack ? e.stack : e);
    return json(500, { error: 'Unexpected server error: ' + ((e && e.message) || 'unknown') });
  }
};
