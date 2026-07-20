// Push fan-out endpoint — sends a Firebase Cloud Messaging (FCM) web-push
// message to a set of recipients when a note or daily-log entry is added.
//
// Trust model (matches the rest of the agent API surface):
//   • The caller is a signed-in app user presenting a Firebase ID token as a
//     Bearer token. We verify it via Google's REST endpoint (no
//     firebase-admin/auth, which pulls in the ESM-only `jose` dep and fails to
//     require() on Netlify's runtime — see apiKeyAuth.js).
//   • Recipients are resolved to device tokens SERVER-side by reading
//     ${ns}/push_tokens (written by each user's own browser under their uid,
//     enforced by database.rules.json). The browser never sees another user's
//     token.
//
// Body (JSON):
//   { ns, jobId, event:'note'|'log', title, body, url,
//     actor:<nameKey>, recipients:[<nameKey>...] }
//   nameKey = lowercase, non-alphanumerics collapsed to '-' (see the client's
//   pushNameKey()). Tokens carry the same nameKey so we match on it.
//
// Requires the same FIREBASE_SERVICE_ACCOUNT env var the other API endpoints
// use. FCM is included in that project — no extra credential.

const { db } = require('./_lib/firebaseAdmin');
const { corsHeaders, jsonResponder, parseBearer, verifyIdTokenRest } = require('./_lib/apiKeyAuth');

const NS_RE = /^[a-z0-9_-]{2,24}(_dev)?$/;
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

function clampStr(v, max) {
  return String(v == null ? '' : v).slice(0, max);
}

exports.handler = async (event) => {
  const origin = event.headers && (event.headers.origin || event.headers.Origin);
  const respond = jsonResponder(origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(origin), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return respond(405, { error: 'Method not allowed' });
  }

  // 1) Authenticate the caller (any signed-in user of this app).
  const token = parseBearer(event);
  let uid = null;
  try {
    uid = token ? await verifyIdTokenRest(token) : null;
  } catch (e) {
    uid = null;
  }
  if (!uid) return respond(401, { error: 'Sign-in required' });

  // 2) Parse + validate the payload.
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return respond(400, { error: 'Invalid JSON body' });
  }
  const ns = String(payload.ns || '');
  if (!NS_RE.test(ns)) return respond(400, { error: 'Invalid ns' });

  const actor = String(payload.actor || '');
  const recipients = Array.isArray(payload.recipients)
    ? [...new Set(payload.recipients.map((r) => String(r || '')).filter(Boolean))].filter((r) => r !== actor)
    : [];
  if (!recipients.length) return respond(200, { sent: 0, reason: 'no recipients' });

  const title = clampStr(payload.title, 100) || 'Job Tracker';
  const bodyText = clampStr(payload.body, 240);
  const url = clampStr(payload.url, 300) || '/';
  const jobId = clampStr(payload.jobId, 80);

  // 3) Resolve recipient nameKeys -> device tokens (server-side read).
  let database;
  try {
    database = db();
  } catch (e) {
    return respond(500, { error: 'Server not configured (database): ' + (e.message || '') });
  }

  let tokensNode;
  try {
    const snap = await database.ref(ns + '/push_tokens').get();
    tokensNode = snap.exists() ? snap.val() : {};
  } catch (e) {
    return respond(500, { error: 'Could not read push tokens: ' + (e.message || '') });
  }

  const want = new Set(recipients);
  // targets: [{ token, path }] so we can prune dead tokens after sending.
  const targets = [];
  const seenTokens = new Set();
  Object.entries(tokensNode || {}).forEach(([tokenUid, byHash]) => {
    Object.entries(byHash || {}).forEach(([hash, rec]) => {
      if (!rec || !rec.token) return;
      const key = String(rec.nameKey || '');
      if (!want.has(key) || key === actor) return;
      if (seenTokens.has(rec.token)) return;
      seenTokens.add(rec.token);
      targets.push({ token: rec.token, path: ns + '/push_tokens/' + tokenUid + '/' + hash });
    });
  });

  if (!targets.length) return respond(200, { sent: 0, reason: 'no registered devices' });

  // 4) Send via FCM. firebase-admin/messaging does NOT pull in jose, so it is
  // safe to require here (unlike firebase-admin/auth).
  let getMessaging;
  try {
    ({ getMessaging } = require('firebase-admin/messaging'));
  } catch (e) {
    return respond(500, { error: 'Messaging SDK unavailable: ' + (e.message || '') });
  }

  const message = {
    tokens: targets.map((t) => t.token),
    notification: { title, body: bodyText },
    data: { jobId, ns, url, event: String(payload.event || '') },
    webpush: {
      notification: { title, body: bodyText, tag: 'job-' + (jobId || ns) },
      fcmOptions: { link: url },
    },
  };

  let resp;
  try {
    resp = await getMessaging().sendEachForMulticast(message);
  } catch (e) {
    return respond(502, { error: 'FCM send failed: ' + (e.message || '') });
  }

  // 5) Prune tokens FCM reported as permanently invalid so they don't linger.
  const prune = [];
  resp.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error && r.error.code;
      if (DEAD_TOKEN_CODES.has(code)) prune.push(targets[i].path);
    }
  });
  await Promise.all(
    prune.map((p) => database.ref(p).remove().catch(() => {})),
  );

  return respond(200, {
    sent: resp.successCount,
    failed: resp.failureCount,
    pruned: prune.length,
  });
};
