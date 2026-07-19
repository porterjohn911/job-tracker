// MCP server for Job Tracker (see AGENT_API_DESIGN.md / docs/AGENT_API.md).
//
// Exposes the agent REST endpoints as native MCP tools so a client like Claude
// Cowork gets typed tools instead of ad-hoc curl. Speaks MCP's JSON-RPC 2.0
// over Streamable HTTP at:
//
//   POST $SITE/.netlify/functions/mcp
//
// Auth: the caller's Job Tracker API key. Provide it either as
//   Authorization: Bearer sk_live_...      (preferred — set in the connector)
//   or  ?key=sk_live_...                    (URL fallback if the client can't set headers)
// The key is forwarded verbatim to the REST endpoints, which enforce scopes.
// This function holds no secrets and does no data access itself.

const SERVER_INFO = { name: 'job-tracker', version: '1.0.0' };
const DEFAULT_PROTOCOL = '2025-06-18';

// Tool catalog. Each maps to one REST endpoint. Descriptions are prescriptive
// about WHEN to call, which improves tool selection.
const TOOLS = [
  {
    name: 'list_jobs',
    description: "List or search jobs and their IDs. Call this FIRST when the user names a job or customer — you need the job's id to create or send an invoice, or to report on it.",
    kind: 'GET', path: '/.netlify/functions/api-jobs',
    inputSchema: { type: 'object', properties: {
      status: { type: 'string', description: 'lead | active | hold | lost | complete' },
      stage: { type: 'string', description: 'pipeline stage, e.g. "In Progress"' },
      search: { type: 'string', description: 'match on job name, customer, or address' },
      limit: { type: 'integer', description: 'max rows (default 100, max 500)' },
    } },
  },
  {
    name: 'list_invoices',
    description: 'List invoices with their status and balance. Use to find overdue invoices, or an invoiceId to send. Optionally filter by status.',
    kind: 'GET', path: '/.netlify/functions/api-invoices',
    inputSchema: { type: 'object', properties: {
      status: { type: 'string', description: 'draft | sent | paid | overdue' },
      limit: { type: 'integer', description: 'max rows (default 100, max 500)' },
    } },
  },
  {
    name: 'get_overview',
    description: "Get the owner-level financial overview: job pipeline, A/R (invoiced/paid/outstanding), overdue totals, estimates, expenses by category, and hours. Call this for 'how's the business', a financial summary, or report requests.",
    kind: 'GET', path: '/.netlify/functions/api-overview',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'create_invoice',
    description: 'Create a DRAFT invoice (or estimate) on a job. Does NOT send anything. Set kind:"estimate" for an estimate. Get jobId from list_jobs first, and confirm the line items and amounts with the user before creating.',
    kind: 'POST', path: '/.netlify/functions/api-invoices',
    inputSchema: { type: 'object', properties: {
      jobId: { type: 'string', description: 'id from list_jobs' },
      items: { type: 'array', description: 'line items', items: { type: 'object', properties: {
        desc: { type: 'string' }, qty: { type: 'number' }, rate: { type: 'number' },
      }, required: ['desc'] } },
      kind: { type: 'string', description: 'invoice (default) or estimate' },
      taxRate: { type: 'number', description: 'percent, e.g. 8.25' },
      date: { type: 'string', description: 'YYYY-MM-DD (defaults to today)' },
      dueDate: { type: 'string', description: 'YYYY-MM-DD' },
      notes: { type: 'string' }, terms: { type: 'string' },
    }, required: ['jobId', 'items'] },
  },
  {
    name: 'queue_invoice_send',
    description: "Queue an invoice to be sent to the customer. This does NOT email it — it creates a request that an OWNER must approve in the app. Always report the result to the user as 'queued for approval', never as 'sent'.",
    kind: 'POST', path: '/.netlify/functions/api-invoice-send',
    inputSchema: { type: 'object', properties: {
      jobId: { type: 'string' }, invoiceId: { type: 'string' },
      to: { type: 'string', description: 'recipient email (defaults to the job customer)' },
      subject: { type: 'string' }, message: { type: 'string' },
      kind: { type: 'string', description: 'invoice (default) or estimate' },
    }, required: ['jobId', 'invoiceId'] },
  },
  {
    name: 'list_schedule',
    description: "List entries on the owner's shared schedule.",
    kind: 'GET', path: '/.netlify/functions/api-schedule',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'add_schedule_entry',
    description: "Add an entry to the owner's shared schedule (site visits, follow-ups, etc.).",
    kind: 'POST', path: '/.netlify/functions/api-schedule',
    inputSchema: { type: 'object', properties: {
      date: { type: 'string', description: 'YYYY-MM-DD' },
      title: { type: 'string' },
      notes: { type: 'string' },
    }, required: ['date', 'title'] },
  },

  // ── Update / manage (Phase 4) ───────────────────────────────────────
  {
    name: 'update_job',
    description: "Update an existing job — move its pipeline stage (e.g. to 'Complete' or 'In Progress'), change status, value, customer details, etc. Get jobId from list_jobs. Only include the fields you want to change.",
    kind: 'PATCH', path: '/.netlify/functions/api-jobs',
    inputSchema: { type: 'object', properties: {
      jobId: { type: 'string' },
      stage: { type: 'string', description: 'Lead | Estimate | Approved | Scheduled | In Progress | Punch List | Complete' },
      status: { type: 'string', description: 'lead | active | hold | lost | complete' },
      value: { type: 'number' },
      name: { type: 'string' }, address: { type: 'string' },
      customerName: { type: 'string' }, customerEmail: { type: 'string' }, customerPhone: { type: 'string' },
      description: { type: 'string' }, leadSource: { type: 'string' },
    }, required: ['jobId'] },
  },
  {
    name: 'record_payment',
    description: 'Record a payment on an invoice. Provide amount to add a partial payment; omit amount to mark the invoice fully paid. Get jobId + invoiceId from list_invoices / list_jobs.',
    kind: 'PATCH', path: '/.netlify/functions/api-invoices',
    inputSchema: { type: 'object', properties: {
      jobId: { type: 'string' }, invoiceId: { type: 'string' },
      amount: { type: 'number', description: 'payment amount to add; omit to mark fully paid' },
    }, required: ['jobId', 'invoiceId'] },
  },
  {
    name: 'update_schedule_entry',
    description: 'Edit or reschedule an existing owner schedule entry. Get its id from list_schedule. Only include fields to change.',
    kind: 'PATCH', path: '/.netlify/functions/api-schedule',
    inputSchema: { type: 'object', properties: {
      id: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' },
      title: { type: 'string' }, notes: { type: 'string' },
    }, required: ['id'] },
  },

  // ── Delete (Phase 4) — needs the 'delete' scope. Confirm with the user first. ──
  {
    name: 'delete_schedule_entry',
    description: 'Permanently delete an owner schedule entry by id (from list_schedule). Ask the user to confirm before deleting.',
    kind: 'DELETE', path: '/.netlify/functions/api-schedule',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'delete_invoice',
    description: 'Permanently delete an invoice or estimate from a job. Get jobId + invoiceId from list_invoices / list_jobs. This removes a financial record — ALWAYS confirm with the user first.',
    kind: 'DELETE', path: '/.netlify/functions/api-invoices',
    inputSchema: { type: 'object', properties: {
      jobId: { type: 'string' }, invoiceId: { type: 'string' },
      kind: { type: 'string', description: 'invoice (default) or estimate' },
    }, required: ['jobId', 'invoiceId'] },
  },
  {
    name: 'delete_job',
    description: 'Permanently delete an entire job and everything on it (invoices, estimates, photos, receipts). This is destructive and cannot be undone — ALWAYS confirm explicitly with the user before calling. Get jobId from list_jobs.',
    kind: 'DELETE', path: '/.netlify/functions/api-jobs',
    inputSchema: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] },
  },

  // ── Capture new work (Phase 4 part 2) ───────────────────────────────
  {
    name: 'create_job',
    description: 'Create a new job or lead from a description (e.g. a phone call). Only name is required; defaults to stage "Lead" / status "lead".',
    kind: 'POST', path: '/.netlify/functions/api-jobs',
    inputSchema: { type: 'object', properties: {
      name: { type: 'string' },
      customerName: { type: 'string' }, customerEmail: { type: 'string' }, customerPhone: { type: 'string' },
      address: { type: 'string' }, value: { type: 'number' },
      stage: { type: 'string' }, status: { type: 'string' },
      leadSource: { type: 'string' }, description: { type: 'string' },
    }, required: ['name'] },
  },

  // ── Money insights & logging (Phase 4 part 2) ───────────────────────
  {
    name: 'get_receivables',
    description: 'Answer "who owes me money?" — outstanding invoice balances grouped by customer, largest first, with overdue flags.',
    kind: 'GET', path: '/.netlify/functions/api-receivables',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_job_profit',
    description: 'Profit/loss for one job: invoiced, collected, expenses, labor hours, and profit (revenue − expenses − labor cost). Get jobId from list_jobs.',
    kind: 'GET', path: '/.netlify/functions/api-job-profit',
    inputSchema: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] },
  },
  {
    name: 'log_expense',
    description: 'Log an expense/receipt. Attach to a job with jobId, or omit it for an overhead expense. Category is one of the app\'s categories (defaults to Other).',
    kind: 'POST', path: '/.netlify/functions/api-expenses',
    inputSchema: { type: 'object', properties: {
      amount: { type: 'number' }, jobId: { type: 'string' },
      category: { type: 'string', description: 'Materials | Tools / Equipment | Fuel / Travel | Subcontractor | Permits / Fees | Labor | Meals | Other' },
      note: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' },
    }, required: ['amount'] },
  },
  {
    name: 'log_time',
    description: 'Log time for a worker. Provide member + hours (with optional date and jobId), e.g. "clock Mike 6 hours on the block wall job".',
    kind: 'POST', path: '/.netlify/functions/api-time',
    inputSchema: { type: 'object', properties: {
      member: { type: 'string' }, hours: { type: 'number' },
      jobId: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' },
    }, required: ['member', 'hours'] },
  },
];

function baseUrl(event) {
  const fromEnv = process.env.URL || process.env.DEPLOY_PRIME_URL;
  const host = event.headers && (event.headers.host || event.headers.Host);
  return (fromEnv || (host ? 'https://' + host : '')).replace(/\/+$/, '');
}

// Proxy a tool call to its REST endpoint, forwarding the caller's auth.
async function callEndpoint(event, tool, args, auth) {
  const url = baseUrl(event) + tool.path;
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = auth;
  let full = url;
  const opts = { method: tool.kind, headers };
  // GET/DELETE carry args in the query string; POST/PATCH in a JSON body.
  if (tool.kind === 'GET' || tool.kind === 'DELETE') {
    const qs = new URLSearchParams();
    for (const k of Object.keys(args || {})) {
      const v = args[k];
      if (v != null && v !== '') qs.set(k, String(v));
    }
    const q = qs.toString();
    if (q) full = url + '?' + q;
  } else {
    opts.body = JSON.stringify(args || {});
  }
  const r = await fetch(full, opts);
  let data;
  try { data = await r.json(); } catch (e) { data = { error: 'Non-JSON response (' + r.status + ')' }; }
  return { ok: r.ok, data };
}

const reply = (id, result) => ({ jsonrpc: '2.0', id, result });
const replyError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

async function handleRpc(msg, event, auth) {
  const { id, method, params } = msg || {};
  const isNotification = id === undefined || id === null;

  switch (method) {
    case 'initialize':
      return reply(id, {
        protocolVersion: (params && params.protocolVersion) || DEFAULT_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      });
    case 'tools/list':
      return reply(id, { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
    case 'tools/call': {
      const t = TOOLS.find((x) => x.name === (params && params.name));
      if (!t) return replyError(id, -32602, 'Unknown tool: ' + (params && params.name));
      try {
        const { ok, data } = await callEndpoint(event, t, (params && params.arguments) || {}, auth);
        return reply(id, { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], isError: !ok });
      } catch (e) {
        return reply(id, { content: [{ type: 'text', text: 'Tool call failed: ' + (e.message || 'error') }], isError: true });
      }
    }
    case 'ping':
      return reply(id, {});
    default:
      // notifications/* and anything else with no id need no response
      if (isNotification) return null;
      return replyError(id, -32601, 'Method not found: ' + method);
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  // No server-initiated SSE stream — the spec allows 405 on GET.
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { ...CORS, Allow: 'POST, OPTIONS' }, body: JSON.stringify({ error: 'Use POST (MCP JSON-RPC).' }) };
  }

  let auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  const key = event.queryStringParameters && event.queryStringParameters.key;
  if (!auth && key) auth = 'Bearer ' + key;

  let payload;
  try { payload = JSON.parse(event.body || ''); } catch (e) {
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify(replyError(null, -32700, 'Parse error')) };
  }

  const batch = Array.isArray(payload);
  const msgs = batch ? payload : [payload];
  const responses = [];
  for (const m of msgs) {
    const res = await handleRpc(m, event, auth);
    if (res) responses.push(res);
  }

  // Notifications-only -> 202 with no body.
  if (!responses.length) return { statusCode: 202, headers: CORS, body: '' };

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(batch ? responses : responses[0]),
  };
};
