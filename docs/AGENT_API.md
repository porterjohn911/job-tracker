# Job Tracker — Agent API Cheat-Sheet

This document tells an AI agent (Claude Cowork, Claude Code, or any script) how to
operate the Job Tracker app through its HTTP API. Read it before making calls.

## TL;DR for the agent

- Authenticate every request with `Authorization: Bearer $JOB_TRACKER_API_KEY`.
- Base URL for every endpoint: `$JOB_TRACKER_URL/.netlify/functions/<name>`.
- You **cannot email anything directly**. Sending an invoice only *queues it for the owner's approval*. Always tell the user "queued for your approval," never "sent."
- Financial data is **read-only**. You can draft invoices and queue sends, but you can't mark things paid, edit pay rates, or touch bank data.
- When you're unsure which job/invoice the user means, **list first** (`api-jobs`, `api-invoices`) and confirm before acting.

## Setup (one time, by the human)

Store these as **environment secrets** in your agent environment — never paste the key into a prompt, file, or chat:

| Variable | Value |
|---|---|
| `JOB_TRACKER_API_KEY` | The `sk_live_…` key generated in the app (Settings → Manage API keys) |
| `JOB_TRACKER_URL` | The site origin, e.g. `https://your-site.netlify.app` |

The key must be minted with the **scopes** the tasks need:

| Scope | Enables |
|---|---|
| `invoices:read` | List jobs & invoices, read overview reports |
| `invoices:write` | Create draft invoices, queue sends for approval |
| `invoices:send` | **Directly email** invoices/estimates to customers (high-risk) |
| `schedule:read` / `schedule:write` | Read / add / edit owner-schedule entries |
| `financials:read` | The overview/reports rollup |
| `financials:sensitive` | *Optional* — adds labor cost + bank/payroll/transaction reads (high-risk) |
| `financials:write` | Recategorize / edit bank transactions (high-risk) |
| `jobs:write` | Create & update jobs (stage, status, value, customer, …) |
| `expenses:write` | Log expenses / receipts |
| `time:write` | Log time entries |
| `delete` | Delete jobs, invoices/estimates, schedule entries (high-risk) |

Read-only insight tools: `get_receivables` (who owes money) and `get_job_profit` (per-job P&L) use `invoices:read` / `financials:read`. Creating an estimate is `create_invoice` with `kind: "estimate"` (`invoices:write`).

Recording a payment on an invoice uses `invoices:write`. Deletes and updates are logged to the company activity feed, and the agent should confirm before deleting.

## Conventions

- All responses are JSON.
- Dates are `YYYY-MM-DD`.
- Money is a plain number (dollars).
- On error you get `{ "error": "<message>" }` with an HTTP status (see the bottom).

---

## Endpoints

### List jobs — `GET api-jobs`  · scope `invoices:read`

Discover jobs and their `id`s (needed to create or send invoices).

Query params (optional): `status` (`lead|active|hold|lost|complete`), `stage`, `search` (matches name / customer / address), `limit` (≤500).

```bash
curl -s -H "Authorization: Bearer $JOB_TRACKER_API_KEY" \
  "$JOB_TRACKER_URL/.netlify/functions/api-jobs?search=johnson"
```

```json
{ "company": "wfs", "count": 1, "total": 1, "jobs": [
  { "id": "job_abc", "name": "Johnson Deck", "stage": "In Progress", "status": "active",
    "value": 4200, "address": "1 Bay St",
    "customer": { "name": "Johnson", "email": "j@x.com", "phone": "" },
    "invoiceCount": 1, "outstanding": 600 } ] }
```

### List invoices — `GET api-invoices`  · scope `invoices:read`

Query params (optional): `status` (`draft|sent|paid|overdue`), `limit` (≤500).

```bash
curl -s -H "Authorization: Bearer $JOB_TRACKER_API_KEY" \
  "$JOB_TRACKER_URL/.netlify/functions/api-invoices?status=overdue"
```

Each invoice includes `id`, `number`, `status`, `date`, `dueDate`, `total`, `paid`, `balance`, and `job` + `customer` context. Use the invoice `id` + `job.id` to send it.

### Create a draft invoice — `POST api-invoices`  · scope `invoices:write`

Creates a **draft** on a job. Does not send anything. Get `jobId` from `api-jobs`.

Body: `{ jobId, items: [{ desc, qty, rate }], taxRate?, date?, dueDate?, notes?, terms? }`

```bash
curl -s -X POST -H "Authorization: Bearer $JOB_TRACKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jobId":"job_abc","items":[{"desc":"Deck rebuild","qty":1,"rate":4200}],"taxRate":0,"dueDate":"2026-08-15"}' \
  "$JOB_TRACKER_URL/.netlify/functions/api-invoices"
```

Returns the created invoice (`number` is auto-assigned, `status:"draft"`).

### Queue an invoice to send — `POST api-invoice-send`  · scope `invoices:write`

**This does not email.** It records a pending request; an owner approves it in the app (Settings → Agent send requests), which opens their normal send screen.

Body: `{ jobId, invoiceId, to?, subject?, message?, kind? }` (`kind` = `invoice` default or `estimate`).

```bash
curl -s -X POST -H "Authorization: Bearer $JOB_TRACKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jobId":"job_abc","invoiceId":"inv_123"}' \
  "$JOB_TRACKER_URL/.netlify/functions/api-invoice-send"
```

```json
{ "queued": true, "status": "pending", "id": "…",
  "message": "Send request queued for owner approval — it will not be emailed until an owner approves it." }
```

Report this back to the user as **queued for approval**, not sent.

### Read the schedule — `GET api-schedule`  · scope `schedule:read`

```bash
curl -s -H "Authorization: Bearer $JOB_TRACKER_API_KEY" \
  "$JOB_TRACKER_URL/.netlify/functions/api-schedule"
```

### Add a schedule entry / time block — `POST api-schedule`  · scope `schedule:write`

Adds to the owner's shared calendar. To draw a real **time block** (a colored block on the day/week grid, not just an all-day chip), include `start` and `end` — clock times like `"8am"`, `"4pm"`, or `"16:00"`.

Body: `{ date | dates[], start?, end?, type?, title?, desc?, assignee?, jobId?, notes? }`

- `type` — what the block is: `onsite` (default, on-site job hours), `meeting`, `estimating`, `delivering`, `admin`.
- `dates[]` — create the **same block on many days** in one call (e.g. 8–4 every weekday). Use instead of `date`.
- `assignee` — **the owner/person the block is for; this sets its color.** Each distinct name gets its own stable color, so always use the same spelling for the same owner.
- `assignees[]` — **two or more people sharing a block** (e.g. both owners on the same job). Shared blocks render in a distinct third color. You can also write this as `assignee:"John & Mike"`.
- Omit `start`/`end` for an untimed all-day entry (the old behavior).

```bash
# One 8am–4pm on-site block:
curl -s -X POST -H "Authorization: Bearer $JOB_TRACKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-07-28","start":"8am","end":"4pm","type":"onsite","assignee":"John"}' \
  "$JOB_TRACKER_URL/.netlify/functions/api-schedule"

# Same block, all week (one call):
curl -s -X POST -H "Authorization: Bearer $JOB_TRACKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"dates":["2026-07-27","2026-07-28","2026-07-29","2026-07-30","2026-07-31"],"start":"8:00","end":"16:00","type":"onsite"}' \
  "$JOB_TRACKER_URL/.netlify/functions/api-schedule"
```

### Overview / reports — `GET api-overview`  · scope `financials:read`

Owner-level rollups for the company.

```bash
curl -s -H "Authorization: Bearer $JOB_TRACKER_API_KEY" \
  "$JOB_TRACKER_URL/.netlify/functions/api-overview"
```

```json
{ "company": "wfs", "generatedAt": "…",
  "jobs": { "total": 12, "byStage": { "In Progress": 3, … }, "byStatus": { "active": 8, … }, "pipelineValue": 84000 },
  "receivables": { "invoiceCount": 20, "invoicedTotal": 61000, "paidTotal": 47000, "outstanding": 14000, "overdueCount": 3, "overdueAmount": 5200 },
  "estimates": { "count": 5, "value": 22000 },
  "expenses": { "total": 9100, "byCategory": { "Materials": 6000, … } },
  "labor": { "totalHours": 140.5, "activeTimers": 1, "cost": 5620, "costAvailable": true } }
```

`labor.cost` is `null` unless the key has `financials:sensitive`.

### List bank transactions — `GET api-transactions`  · scope `financials:sensitive`

Imported bank/card lines. `amount` is negative for money out (expenses), positive for money in (income). `category` is one of: `Income, Materials, Fuel / Travel, Subcontractor, Equipment, Payroll, Office / Admin, Insurance, Taxes / Fees, Bank / Transfer, Other`.

Query params (optional): `category`, `uncategorized=true` (only "Other"), `search` (description text), `from`/`to` (`YYYY-MM-DD`, inclusive), `limit` (≤1000).

```bash
curl -s -H "Authorization: Bearer $JOB_TRACKER_API_KEY" \
  "$JOB_TRACKER_URL/.netlify/functions/api-transactions?search=home%20depot"
```

```json
{ "company": "wfs", "categories": ["Income", "Materials", …], "count": 2, "total": 2, "transactions": [
  { "id": "b_…", "date": "2026-07-10", "description": "HOME DEPOT #4123", "amount": -284.19,
    "direction": "out", "category": "Other", "jobId": "", "job": "" } ] }
```

### Recategorize a transaction — `PATCH api-transactions`  · scope `financials:write`

Change a transaction's `category` (validated against the list above) and/or link it to a job. Get `transactionId` from the list call.

Body: `{ transactionId, category?, jobId? }` — pass `jobId:""` to unlink. At least one of `category`/`jobId` is required.

```bash
curl -s -X PATCH -H "Authorization: Bearer $JOB_TRACKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"transactionId":"b_123","category":"Materials"}' \
  "$JOB_TRACKER_URL/.netlify/functions/api-transactions"
```

Every recategorization is written to the company activity feed. Confirm the change with the user first.

---

## Common requests → what to call

| The user says… | Do this |
|---|---|
| "What's overdue?" | `GET api-invoices?status=overdue` |
| "Give me a financial overview / how's the business doing" | `GET api-overview` and summarize |
| "Categorize my bank transactions / put the Home Depot charges under Materials" | `GET api-transactions?uncategorized=true` (or `search=…`) → confirm → `PATCH api-transactions` per item |
| "Draft an invoice for the Johnson job for $4,200" | `GET api-jobs?search=johnson` → confirm the job → `POST api-invoices` |
| "Send invoice INV-1042" | find it via `GET api-invoices` → `POST api-invoice-send` → tell them it's **queued for approval** |
| "Add a site visit for the Johnson deck next Tuesday" | `POST api-schedule` with `start`/`end` |
| "Block me on-site 8–4 every day this week" | `POST api-schedule` with `dates:[…]`, `start:"8am"`, `end:"4pm"`, `type:"onsite"` (one call) |
| "What's on the schedule?" | `GET api-schedule` |

## Guardrails & etiquette

- **Never reveal or print the API key.**
- **Confirm before creating or sending.** Draft invoices and send requests affect real customer billing — show the user what you're about to do and get a yes.
- **Sends are always "queued for approval,"** never "sent." Don't imply an email went out.
- **Don't invent `jobId`/`invoiceId` values** — always get them from `api-jobs` / `api-invoices` first.
- If a call returns an error, show the user the message rather than retrying blindly.

## MCP connector (recommended for Claude Cowork / Claude Desktop)

Instead of calling the endpoints via curl, connect the built-in **MCP server** so the agent gets these as native, typed tools (`list_jobs`, `list_invoices`, `get_overview`, `create_invoice`, `queue_invoice_send`, `send_invoice`, `list_schedule`, `add_schedule_entry`, `list_transactions`, `categorize_transaction`, plus the update/delete/create/logging tools).

- **Server URL:** `$JOB_TRACKER_URL/.netlify/functions/mcp`
- **Auth:** your API key as a **Bearer token** in the connector's auth field. If the connector can't set a header, append the key to the URL instead: `…/mcp?key=sk_live_…`

The key's scopes still bound what the tools can do, and `queue_invoice_send` still only **queues** for owner approval. Add it in Claude as a custom/remote connector, then in a Cowork session the tools appear automatically — no cheat-sheet needed.

## Error codes

| Status | Meaning | What to do |
|---|---|---|
| 400 | Bad/missing input | Fix the body/params |
| 401 | Missing/invalid key | Check `JOB_TRACKER_API_KEY` |
| 403 | Key lacks the required scope | Mint a key with the needed scope |
| 404 | Job/invoice not found | Re-list to get the right id |
| 429 | Rate limited | Wait and retry |
| 500 | Server error | Show the message; the app may be misconfigured |
