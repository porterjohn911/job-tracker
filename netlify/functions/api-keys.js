// Owner-managed API key administration (see AGENT_API_DESIGN.md §8).
//
// This endpoint is NOT called by an agent key — it is called by a signed-in
// OWNER from the settings UI, presenting a Firebase ID token. It mints, lists,
// and revokes the secret keys that agents later use.
//
//   POST   -> mint a new key  { label, company, scopes[] }
//             returns the raw key ONCE (never stored, never shown again)
//   GET    -> list keys (sanitized: no raw key; hash returned as opaque id)
//   DELETE -> revoke a key     { id }   (id = the hash from the list)

const { db } = require('./_lib/firebaseAdmin');
const { SCOPES, corsHeaders, jsonResponder, generateKey, verifyOwner } = require('./_lib/apiKeyAuth');

// Resolve a company id to its Realtime Database namespace. Waterfront ('wfs')
// keeps its id as the namespace; other companies store `ns` under /companies.
async function resolveNamespace(companyId) {
  try {
    const snap = await db().ref('companies/' + companyId + '/ns').get();
    if (snap.exists() && typeof snap.val() === 'string') return snap.val();
  } catch (e) { /* fall through */ }
  return companyId;
}

// Strip secrets before returning a record to the UI. The hash is one-way, so
// it is safe to expose as the id used for revocation.
function sanitize(hash, rec) {
  return {
    id: hash,
    prefix: rec.prefix || '',
    label: rec.label || '',
    company: rec.company || '',
    ns: rec.ns || '',
    scopes: Array.isArray(rec.scopes) ? rec.scopes : [],
    createdAt: rec.createdAt || null,
    createdBy: rec.createdBy || '',
    lastUsedAt: rec.lastUsedAt || null,
    expiresAt: rec.expiresAt || null,
    revoked: !!rec.revoked,
  };
}

exports.handler = async (event) => {
  const origin = event.headers && (event.headers.origin || event.headers.Origin);
  const json = jsonResponder(origin);

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(origin), body: '{}' };

  try {
    return await handle(event, json);
  } catch (e) {
    // Last-resort guard: never let an unexpected throw become an opaque 502.
    console.error('[api-keys] unhandled:', e && e.stack ? e.stack : e);
    return json(500, { error: 'Unexpected server error: ' + ((e && e.message) || 'unknown') });
  }
};

async function handle(event, json) {
  const authed = await verifyOwner(event);
  if (authed.error) return json(authed.error.statusCode, { error: authed.error.message });

  // ── List ──────────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    let all;
    try {
      const snap = await db().ref('api_keys').get();
      all = snap.val() || {};
    } catch (e) {
      return json(500, { error: 'Could not read keys' });
    }
    const keys = Object.keys(all)
      .map((hash) => sanitize(hash, all[hash] || {}))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return json(200, { keys });
  }

  // ── Mint ──────────────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad request' }); }

    const label = String(body.label || '').trim();
    const company = String(body.company || '').trim();
    const scopes = Array.isArray(body.scopes) ? body.scopes.filter((s) => SCOPES.includes(s)) : [];

    if (!label) return json(400, { error: 'A label is required' });
    if (!company) return json(400, { error: 'A company is required' });
    if (!scopes.length) return json(400, { error: 'Select at least one scope' });

    const ns = await resolveNamespace(company);
    const { raw, hash, prefix } = generateKey();
    const record = {
      prefix,
      label,
      company,
      ns,
      scopes,
      createdBy: authed.uid,
      createdAt: Date.now(),
      lastUsedAt: null,
      expiresAt: null,
      revoked: false,
    };
    try {
      await db().ref('api_keys/' + hash).set(record);
    } catch (e) {
      return json(500, { error: 'Could not save key' });
    }
    // The raw key is returned exactly once. It is never stored.
    return json(201, { key: raw, record: sanitize(hash, record) });
  }

  // ── Revoke ────────────────────────────────────────────────────────
  if (event.httpMethod === 'DELETE') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad request' }); }
    const id = String(body.id || '').trim();
    if (!id) return json(400, { error: 'Missing key id' });
    try {
      await db().ref('api_keys/' + id).remove();
    } catch (e) {
      return json(500, { error: 'Could not revoke key' });
    }
    return json(200, { ok: true });
  }

  return json(405, { error: 'Method not allowed' });
};
