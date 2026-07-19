// Agent-facing bank transactions: read financials + recategorize (see AGENT_API_DESIGN.md).
//
//   GET   /.netlify/functions/api-transactions              (scope financials:sensitive)
//   PATCH /.netlify/functions/api-transactions              (scope financials:write)
//   Authorization: Bearer sk_live_...
//
// Transactions are imported bank/card lines stored flat at {ns}/transactions/{id}:
//   { id, date, description, amount, category, jobId, source }
// amount < 0 = money out (expense), amount > 0 = money in (income). category is
// one of BANK_CATS (below). Reading bank data is owner-level sensitive, so GET
// requires financials:sensitive; changing a category mutates the books, so PATCH
// requires the separate financials:write scope.

const { db } = require('./_lib/firebaseAdmin');
const { corsHeaders, jsonResponder, authenticateApiKey } = require('./_lib/apiKeyAuth');

// Mirror of BANK_CATS in the client (src/app/06-referrals-time-bank.js).
const BANK_CATS = ['Income', 'Materials', 'Fuel / Travel', 'Subcontractor', 'Equipment', 'Payroll', 'Office / Admin', 'Insurance', 'Taxes / Fees', 'Bank / Transfer', 'Other'];

function num(v) { return Number(v || 0); }
function round2(n) { return Math.round(n * 100) / 100; }

// Case/space-insensitive match to a canonical BANK_CATS value; null if no match.
function canonicalCategory(input) {
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
  const want = norm(input);
  if (!want) return null;
  return BANK_CATS.find((c) => norm(c) === want) || null;
}

exports.handler = async (event) => {
  const origin = event.headers && (event.headers.origin || event.headers.Origin);
  const json = jsonResponder(origin);

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(origin), body: '{}' };
  try {
    if (event.httpMethod === 'GET') return await list(event, json);
    if (event.httpMethod === 'PATCH') return await categorize(event, json);
    return json(405, { error: 'GET or PATCH' });
  } catch (e) {
    console.error('[api-transactions] unhandled:', e && e.stack ? e.stack : e);
    return json(500, { error: 'Unexpected server error: ' + ((e && e.message) || 'unknown') });
  }
};

// GET — list transactions with optional filters. Reading bank data is sensitive.
async function list(event, json) {
  const authed = await authenticateApiKey(event, 'financials:sensitive');
  if (authed.error) return json(authed.error.statusCode, { error: authed.error.message });
  const ns = authed.key.ns || authed.key.company;
  if (!ns) return json(500, { error: 'Key is not bound to a company' });

  const p = event.queryStringParameters || {};
  const wantCat = p.category ? canonicalCategory(p.category) : null;
  const uncategorizedOnly = String(p.uncategorized || '') === 'true';
  const search = p.search ? String(p.search).toLowerCase().trim() : '';
  const from = p.from ? String(p.from) : '';   // YYYY-MM-DD inclusive
  const to = p.to ? String(p.to) : '';         // YYYY-MM-DD inclusive
  let limit = parseInt(p.limit, 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = 200;
  limit = Math.min(limit, 1000);

  let txns, jobs;
  try {
    const [tSnap, jSnap] = await Promise.all([
      db().ref(ns + '/transactions').get(),
      db().ref(ns + '/jobs').get(),
    ]);
    txns = tSnap.val() || {};
    jobs = jSnap.val() || {};
  } catch (e) { return json(500, { error: 'Could not read transactions: ' + e.message }); }

  const out = [];
  for (const id of Object.keys(txns)) {
    const t = txns[id] || {};
    const cat = t.category || 'Other';
    if (wantCat && cat !== wantCat) continue;
    if (uncategorizedOnly && cat !== 'Other') continue;
    if (from && String(t.date || '') < from) continue;
    if (to && String(t.date || '') > to) continue;
    if (search && !String(t.description || '').toLowerCase().includes(search)) continue;
    const amt = num(t.amount);
    out.push({
      id: t.id || id,
      date: t.date || '',
      description: t.description || '',
      amount: round2(amt),
      direction: amt < 0 ? 'out' : 'in',
      category: cat,
      jobId: t.jobId || '',
      job: t.jobId && jobs[t.jobId] ? (jobs[t.jobId].name || '') : '',
    });
  }

  out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const total = out.length;
  return json(200, {
    company: authed.key.company,
    categories: BANK_CATS,
    count: Math.min(total, limit),
    total,
    transactions: out.slice(0, limit),
  });
}

// PATCH — recategorize a transaction (and optionally link/unlink a job).
// Mutates a financial record, so it needs the dedicated financials:write scope.
async function categorize(event, json) {
  const authed = await authenticateApiKey(event, 'financials:write');
  if (authed.error) return json(authed.error.statusCode, { error: authed.error.message });
  const ns = authed.key.ns || authed.key.company;
  if (!ns) return json(500, { error: 'Key is not bound to a company' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad request' }); }
  const txId = String(body.transactionId || body.id || '').trim();
  if (!txId) return json(400, { error: 'transactionId is required' });

  const hasCategory = body.category != null && String(body.category).trim() !== '';
  const hasJob = Object.prototype.hasOwnProperty.call(body, 'jobId');
  if (!hasCategory && !hasJob) return json(400, { error: 'Provide category and/or jobId to change' });

  let category = null;
  if (hasCategory) {
    category = canonicalCategory(body.category);
    if (!category) return json(400, { error: 'Unknown category "' + body.category + '". Use one of: ' + BANK_CATS.join(', ') });
  }

  let tx;
  try { tx = (await db().ref(ns + '/transactions/' + txId).get()).val(); }
  catch (e) { return json(500, { error: 'Read failed: ' + e.message }); }
  if (!tx) return json(404, { error: 'No transaction with id ' + txId });

  const updates = {};
  if (hasCategory) updates.category = category;
  let jobName = '';
  if (hasJob) {
    const jobId = String(body.jobId || '').trim();
    if (jobId) {
      let job;
      try { job = (await db().ref(ns + '/jobs/' + jobId).get()).val(); }
      catch (e) { return json(500, { error: 'Read failed: ' + e.message }); }
      if (!job) return json(404, { error: 'No job with id ' + jobId + ' to link' });
      jobName = job.name || '';
      updates.jobId = jobId;
    } else {
      updates.jobId = '';   // explicit unlink
    }
  }

  try { await db().ref(ns + '/transactions/' + txId).update(updates); }
  catch (e) { return json(500, { error: 'Save failed: ' + e.message }); }

  const desc = (tx.description || '').slice(0, 40);
  const changed = [];
  if (hasCategory) changed.push('category → ' + category);
  if (hasJob) changed.push(updates.jobId ? 'linked to ' + (jobName || updates.jobId) : 'unlinked from job');
  db().ref(ns + '/activity').push({
    user: 'Agent · ' + (authed.key.label || authed.key.prefix || 'API key'),
    action: 'recategorized transaction "' + desc + '" (' + changed.join(', ') + ')',
    job: jobName, jobId: updates.jobId || '', time: Date.now(),
  }).catch(() => {});

  return json(200, {
    ok: true,
    transaction: {
      id: tx.id || txId,
      date: tx.date || '',
      description: tx.description || '',
      amount: round2(num(tx.amount)),
      category: hasCategory ? category : (tx.category || 'Other'),
      jobId: hasJob ? updates.jobId : (tx.jobId || ''),
    },
  });
}
