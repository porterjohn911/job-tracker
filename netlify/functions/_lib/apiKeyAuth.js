// Shared auth helpers for the agent API surface (see AGENT_API_DESIGN.md).
//
// Two kinds of caller:
//   1. An AGENT presenting a secret API key ("sk_live_...") in the
//      Authorization header. Validated by authenticateApiKey().
//   2. An OWNER managing keys from the settings UI, presenting a Firebase ID
//      token. Validated by verifyOwner().
//
// Keys are stored under /api_keys/{sha256(rawKey)} so lookup is O(1) and the
// raw key never has to be stored — only its hash. The node key IS the hash;
// the hash is one-way, so exposing it to an authenticated owner (as an id for
// revocation) is safe.

const crypto = require('crypto');
const { db, auth } = require('./firebaseAdmin');

// ── Scopes ──────────────────────────────────────────────────────────
// The full vocabulary. v1 keys are typically minted with the first three.
const SCOPES = [
  'invoices:read',
  'invoices:write',
  'schedule:read',
  'schedule:write',
  'financials:read',
  'financials:sensitive',
];

const KEY_PREFIX = 'sk_live_';
const RANDOM_BYTES = 32;

// ── CORS ────────────────────────────────────────────────────────────
// Agents call server-to-server (no browser Origin), but the owner key-admin
// UI calls from the site. Lock down with ALLOWED_ORIGINS when set.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(origin) {
  const h = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    Vary: 'Origin',
  };
  if (!ALLOWED_ORIGINS.length) {
    h['Access-Control-Allow-Origin'] = '*';
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
  }
  return h;
}

function jsonResponder(origin) {
  const headers = corsHeaders(origin);
  return (statusCode, obj) => ({ statusCode, headers, body: JSON.stringify(obj) });
}

// ── Key generation / hashing ────────────────────────────────────────
function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// base62 keeps the key copy-paste friendly (no +/= from base64).
function base62(buf) {
  const ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let out = '';
  for (const byte of buf) out += ALPHA[byte % 62];
  return out;
}

// Returns { raw, hash, prefix }. `raw` is shown to the owner exactly once.
function generateKey() {
  const raw = KEY_PREFIX + base62(crypto.randomBytes(RANDOM_BYTES));
  return { raw, hash: sha256(raw), prefix: raw.slice(0, 12) };
}

function parseBearer(event) {
  const h = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

// ── Best-effort in-memory rate limit (per key, per warm container) ──
// Same defense-in-depth caveat as send-invoice.js: Netlify containers are
// ephemeral, so this only throttles bursts on a warm container. A durable
// RTDB-backed counter arrives with the write endpoints (Phase 2).
const RATE = new Map();
const RATE_MAX = 60;
const RATE_WINDOW_MS = 60 * 1000;
function rateLimited(id) {
  const now = Date.now();
  const hits = (RATE.get(id) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) {
    RATE.set(id, hits);
    return true;
  }
  hits.push(now);
  RATE.set(id, hits);
  return false;
}

// ── Agent key authentication ────────────────────────────────────────
// Validates the presented key and required scope. On success returns
// { key: {...record, id} }. On failure returns { error: {statusCode, message} }.
async function authenticateApiKey(event, requiredScope) {
  const raw = parseBearer(event);
  if (!raw || !raw.startsWith(KEY_PREFIX)) {
    return { error: { statusCode: 401, message: 'Missing or malformed API key' } };
  }
  const hash = sha256(raw);
  let ref;
  try {
    ref = db().ref('api_keys/' + hash);
  } catch (e) {
    console.error('[api] Admin SDK init failed:', e.message);
    return { error: { statusCode: 500, message: 'Server not configured: ' + e.message } };
  }
  let snap;
  try {
    snap = await ref.get();
  } catch (e) {
    console.error('[api] key lookup failed:', e.message);
    return { error: { statusCode: 500, message: 'Key lookup failed: ' + e.message } };
  }
  if (!snap.exists()) {
    return { error: { statusCode: 401, message: 'Invalid API key' } };
  }
  const rec = snap.val() || {};
  if (rec.revoked) {
    return { error: { statusCode: 403, message: 'This API key has been revoked' } };
  }
  if (rec.expiresAt && Date.now() > rec.expiresAt) {
    return { error: { statusCode: 403, message: 'This API key has expired' } };
  }
  const scopes = Array.isArray(rec.scopes) ? rec.scopes : [];
  if (requiredScope && !scopes.includes(requiredScope)) {
    return { error: { statusCode: 403, message: 'API key lacks required scope: ' + requiredScope } };
  }
  if (rateLimited(hash)) {
    return { error: { statusCode: 429, message: 'Rate limit exceeded — slow down' } };
  }
  // Best-effort last-used stamp; never block the request on it.
  db().ref('api_keys/' + hash + '/lastUsedAt').set(Date.now()).catch(() => {});
  return { key: { ...rec, id: hash } };
}

// ── Owner authentication (for the key-management endpoint) ──────────
// Verifies a Firebase ID token and confirms the caller is an approved OWNER
// in /users/{uid}. Returns { uid, user } or { error }.
async function verifyOwner(event) {
  const token = parseBearer(event);
  if (!token) return { error: { statusCode: 401, message: 'Sign in as an owner to manage API keys' } };

  // Distinct failure modes so the cause is visible instead of a catch-all:
  //   500 -> the server (Admin SDK / service account) isn't configured
  //   401 -> the Firebase ID token itself was rejected (often a project mismatch)
  let adminAuth;
  try {
    adminAuth = auth();
  } catch (e) {
    console.error('[api-keys] Admin SDK init failed:', e.message);
    return { error: { statusCode: 500, message: 'Server not configured: ' + e.message } };
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch (e) {
    console.error('[api-keys] verifyIdToken failed:', e.message);
    return { error: { statusCode: 401, message: 'Sign-in token rejected: ' + (e.message || 'invalid token') } };
  }

  let rec;
  try {
    const snap = await db().ref('users/' + decoded.uid).get();
    rec = snap.val();
  } catch (e) {
    console.error('[api-keys] user lookup failed:', e.message);
    return { error: { statusCode: 500, message: 'User lookup failed: ' + e.message } };
  }
  if (!rec || rec.role !== 'owner') {
    return { error: { statusCode: 403, message: 'Only owners can manage API keys' } };
  }
  return { uid: decoded.uid, user: rec };
}

module.exports = {
  SCOPES,
  KEY_PREFIX,
  corsHeaders,
  jsonResponder,
  sha256,
  generateKey,
  parseBearer,
  authenticateApiKey,
  verifyOwner,
};
