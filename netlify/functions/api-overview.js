// Agent-facing OVERVIEW / reports endpoint (see AGENT_API_DESIGN.md §5).
//
//   GET /.netlify/functions/api-overview
//   Authorization: Bearer sk_live_...
//   Requires scope: financials:read
//
// Returns the owner-level rollups the app's dashboard / reports / job-costing
// views show, for the key's company namespace. Labor COST needs pay rates
// (sensitive) — included only when the key also has financials:sensitive.
// The aggregation lives in _lib/reports.js, shared with the weekly report.

const { db } = require('./_lib/firebaseAdmin');
const { corsHeaders, jsonResponder, authenticateApiKey } = require('./_lib/apiKeyAuth');
const { computeOverview } = require('./_lib/reports');

exports.handler = async (event) => {
  const origin = event.headers && (event.headers.origin || event.headers.Origin);
  const json = jsonResponder(origin);

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(origin), body: '{}' };
  if (event.httpMethod !== 'GET') return json(405, { error: 'GET only' });

  try {
    const authed = await authenticateApiKey(event, 'financials:read');
    if (authed.error) return json(authed.error.statusCode, { error: authed.error.message });

    const ns = authed.key.ns || authed.key.company;
    if (!ns) return json(500, { error: 'Key is not bound to a company' });
    const scopes = Array.isArray(authed.key.scopes) ? authed.key.scopes : [];
    const canSeeCost = scopes.includes('financials:sensitive');

    const overview = await computeOverview(db(), ns, canSeeCost);
    return json(200, { company: authed.key.company, generatedAt: new Date().toISOString(), ...overview });
  } catch (e) {
    console.error('[api-overview] unhandled:', e && e.stack ? e.stack : e);
    return json(500, { error: 'Unexpected server error: ' + ((e && e.message) || 'unknown') });
  }
};
