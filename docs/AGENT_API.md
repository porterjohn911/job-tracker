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
| `invoices:write` | Create draft invoices, queue sends |
| `schedule:read` / `schedule:write` | Read / add owner-schedule entries |
| `financials:read` | The overview/reports rollup |
| `financials:sensitive` | *Optional* — adds labor cost + bank/payroll reads (high-risk) |

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

### Add a schedule entry — `POST api-schedule`  · scope `schedule:write`

Adds to the owner's shared calendar. Body: `{ date, title, notes? }`.

```bash
curl -s -X POST -H "Authorization: Bearer $JOB_TRACKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-07-28","title":"Site visit — Johnson Deck","notes":"Measure railings"}' \
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

---

## Common requests → what to call

| The user says… | Do this |
|---|---|
| "What's overdue?" | `GET api-invoices?status=overdue` |
| "Give me a financial overview / how's the business doing" | `GET api-overview` and summarize |
| "Draft an invoice for the Johnson job for $4,200" | `GET api-jobs?search=johnson` → confirm the job → `POST api-invoices` |
| "Send invoice INV-1042" | find it via `GET api-invoices` → `POST api-invoice-send` → tell them it's **queued for approval** |
| "Add a site visit for the Johnson deck next Tuesday" | `POST api-schedule` |
| "What's on the schedule?" | `GET api-schedule` |

## Guardrails & etiquette

- **Never reveal or print the API key.**
- **Confirm before creating or sending.** Draft invoices and send requests affect real customer billing — show the user what you're about to do and get a yes.
- **Sends are always "queued for approval,"** never "sent." Don't imply an email went out.
- **Don't invent `jobId`/`invoiceId` values** — always get them from `api-jobs` / `api-invoices` first.
- If a call returns an error, show the user the message rather than retrying blindly.

## Error codes

| Status | Meaning | What to do |
|---|---|---|
| 400 | Bad/missing input | Fix the body/params |
| 401 | Missing/invalid key | Check `JOB_TRACKER_API_KEY` |
| 403 | Key lacks the required scope | Mint a key with the needed scope |
| 404 | Job/invoice not found | Re-list to get the right id |
| 429 | Rate limited | Wait and retry |
| 500 | Server error | Show the message; the app may be misconfigured |
