# Agent API Keys & Automation — Design Doc

**Status:** Phase 1 built (review); later phases still planned
**Branch:** `claude/agent-api-key-invoicing-i3zyzl`
**Goal:** Let an AI agent access the app with a scoped, revocable API key so it can send invoices, help schedule, and organize financials — safely.

> The point of this doc is to agree on the shape. **Phase 1** (§10) is now implemented in this branch; everything from Phase 2 on is still just a plan. Open questions from the first review are resolved below.

### Decisions locked in (first review)

1. **Admin SDK** for server-side data access (not a bot-user). ✅
2. **Approve-before-send** for invoices — a human okays every send. ✅
3. **Pilot company: `wfs`** (Waterfront). ✅
4. **Financials stay read-only** in v1 (`financials:read` only; no `sensitive`). ✅
5. **No QuickBooks** integration for now — email-PDF is enough. ✅

---

## 1. What we're actually building

Today the app has **no server-side API** to hang an agent off of. It's a static single-page app (`index.html` + `src/app/**`) that talks directly to Firebase from the browser, plus one Netlify function (`netlify/functions/send-invoice.js`) that emails invoice PDFs. All real security lives in `database.rules.json`, and every rule is written around a signed-in human's `auth.uid` and their role at `/users/{uid}`. There is no concept of a machine identity anywhere.

So this project is really **two pieces**:

1. **An API surface** — a small set of serverless endpoints, authenticated by a secret API key *we* generate, that perform actions server-side against Firebase (this is the "Option C" work).
2. **An agent** — a program with a Claude brain that decides *what* to do and calls those endpoints as its tools. It runs on Anthropic's infrastructure (Managed Agents), not ours.

Two separate credentials are involved and must not be confused:

| Credential | What it is | Where it lives |
|---|---|---|
| **App API key** (`sk_live_…`) | The secret we generate; lets the agent into *this app* | Server-side / a managed vault — **never** the browser, never a prompt |
| **Anthropic API key** | Powers the agent's Claude brain | Anthropic account config |

> ⚠️ Note: the `apiKey` string already in the repo (`netlify/functions/app-config.js`, `send-invoice.js`) is the **Firebase Web API key** — a *public* project identifier, not a secret. We are **not** reusing it for agent auth. The agent key is a brand-new secret with its own lifecycle.

---

## 2. Current architecture (what we build on)

| Concern | Today | Relevance to this design |
|---|---|---|
| Frontend | Vanilla JS SPA, `src/app/**` | Add a small "API keys" settings panel |
| Backend | 1 Netlify function (`send-invoice.js`) | Same pattern; add more functions |
| Data | Firebase Realtime Database, namespaced per company (`wfs/`, `mhs/`, `nlr/`) | Agent keys scope to **one** company namespace |
| Auth | Firebase Auth (email/pw) + roles `worker`/`manager`/`owner` at `/users/{uid}` | Agent keys map onto the same role/scope model |
| Rules | `database.rules.json` gates every read/write on `auth != null` + role/company | Endpoints use the Admin SDK server-side; scopes enforced in code |
| Invoicing | `send-invoice.js` builds PDF + emails via SMTP; requires a Firebase ID token + approved role | ~90% of "send invoices" already exists |
| Financials | Job costing, receipts, time→labor, `transactions` (owner-only), `payrates` (owner/manager-only) | Read-heavy; `transactions`/`payrates` are the sensitive tier |
| Scheduling | `owner_schedule` node (owner/manager) | Agent reads/writes schedule entries |

Key fact for scoping: **the financial nodes are already tiered** — `transactions` (bank) is owner-only and `payrates` is owner/manager-only in the rules. That tiering becomes our natural scope ladder.

---

## 3. Design principles

1. **Least privilege by default.** A key does the narrowest thing it was created for. An "invoices" key cannot read payroll.
2. **The secret never reaches the browser or a prompt.** It lives server-side / in a managed vault, injected at call time.
3. **Everything is revocable and audited.** We store only a hash of each key; every agent write is logged; deleting the hash instantly kills the key.
4. **Money-moving actions are gated at first.** v1 confirms before sending invoices and keeps financials read-only. We loosen this only once trusted.
5. **Reuse the existing model.** Scopes map onto the `worker`/`manager`/`owner` + company-namespace system already in the code, not a parallel one.

---

## 4. The API-key data model

New Realtime Database node, **not** namespaced per company (keys are a global admin concern). It is **default-deny in `database.rules.json`** — the browser can never read or write it; only the Admin SDK (server-side) touches it.

**Implementation refinement (built):** each key is stored under `/api_keys/{sha256(rawKey)}` — the SHA-256 hash *is* the node key. This makes lookup O(1) (no scan, no index) and means the raw key is never stored. The hash is one-way, so it's safe to hand back to an authenticated owner as the `id` used for revocation.

```
/api_keys/{sha256(rawKey)}
  ├─ prefix:      "sk_live_a1b2"               // first 12 chars, for display
  ├─ label:       "Invoicing agent"           // human-set name
  ├─ company:     "wfs"                        // company id the key is scoped to
  ├─ ns:          "wfs"                        // resolved DB namespace (from /companies/{id}/ns)
  ├─ scopes:      ["invoices:read"]
  ├─ createdBy:   "<uid of the owner who minted it>"
  ├─ createdAt:   1737200000000
  ├─ lastUsedAt:  1737300000000               // best-effort stamp on each call
  ├─ expiresAt:   null                        // optional hard expiry
  └─ revoked:     false
```

**Raw key format:** `sk_live_` + 32 random bytes (base62). Shown to the owner **exactly once** at creation; only the hash is stored. If they lose it, they mint a new one.

### Scope vocabulary (proposed)

| Scope | Grants | Sensitivity |
|---|---|---|
| `invoices:read` | List/read invoices & estimates | low |
| `invoices:write` | Create/update invoices; send (subject to gate) | medium |
| `schedule:read` | Read `owner_schedule` | low |
| `schedule:write` | Create/update schedule entries | medium |
| `financials:read` | Read jobs, receipts, job-costing, time summaries | medium |
| `financials:sensitive` | Read `transactions` (bank) and `payrates` | **high** |

v1 keys would typically get `invoices:write` + `schedule:write` + `financials:read`. `financials:sensitive` is opt-in and off by default.

---

## 5. The endpoints

New Netlify functions under `netlify/functions/`, same style as `send-invoice.js`. Each one:

1. Reads `Authorization: Bearer sk_live_…`.
2. Hashes the presented key, looks it up in `/api_keys`, checks `revoked`/`expiresAt`.
3. Verifies the requested action is allowed by the key's `scopes` and `company`.
4. Performs the action **server-side via the Firebase Admin SDK** (bypassing browser rules, but constrained by our own scope checks).
5. Updates `lastUsedAt` and writes an entry to that company's `activity` node.

Proposed surface (v1):

| Endpoint | Method | Scope required | Notes |
|---|---|---|---|
| `/api/jobs` (`api-jobs`) | GET | `invoices:read` | List/search jobs + ids (to invoice or report on) |
| `/api/invoices` | GET | `invoices:read` | List/filter invoices (e.g. overdue) |
| `/api/invoices` | POST | `invoices:write` | Create an invoice/estimate |
| `/api/invoices/send` | POST | `invoices:write` | Send — reuses `send-invoice.js` internals; **gated** (§7) |
| `/api/schedule` | GET | `schedule:read` | Read schedule entries |
| `/api/schedule` | POST | `schedule:write` | Create/update a schedule entry |
| `/api/overview` (`api-overview`) | GET | `financials:read` | Owner-level rollups: pipeline, A/R + overdue, estimates, expenses by category, hours (labor **cost** only with `financials:sensitive`) |
| `/api/keys` | GET/POST/DELETE | owner session (not an API key) | Mint/list/revoke keys from the UI |

> `/api/keys` is managed by a signed-in **owner** through the settings UI (§8), not by an agent key — an agent should never be able to mint more keys.

### Shared auth middleware

A single `netlify/functions/_lib/apiKeyAuth.js` helper that every endpoint calls first — mirrors the token-verification shape already in `send-invoice.js`, but for API keys. Returns `{ keyRecord }` or an error (`401` unknown, `403` scope/company mismatch, `429` rate-limited).

### The Firebase Admin SDK question

Endpoints need to read/write Firebase server-side. Two ways:

- **(A) Firebase Admin SDK** with a service account (stored as a Netlify env var, e.g. `FIREBASE_SERVICE_ACCOUNT`). Full DB access; our scope checks are the guardrail. Cleanest.
- **(B) A dedicated "bot" Firebase Auth user**, and the function acts as that user through existing rules. No new secret-management, automatically constrained by the rules — but ID tokens expire hourly and it's more moving parts.

**Recommendation: (A) Admin SDK**, because the whole point of Option C is that *our code* is the authorization layer. (This is the one new server secret to manage carefully.)

---

## 6. How the agent connects — MCP + Managed Agents

The agent runs as a **Managed Agent** (Anthropic hosts the loop; we don't run a server). It reaches our endpoints through a thin **MCP server** that wraps them as tools.

```
Cron fires (8 AM) ──▶ Managed Agent session (Claude Opus 4.8)
      │
      ├─ reasons: "check overdue invoices"
      ├─ calls MCP tool list_overdue()  ──▶ /api/invoices?status=overdue ──▶ Firebase (Admin SDK)
      ├─ calls send_invoice(id)         ──▶ /api/invoices/send          ──▶ existing send-invoice logic
      └─ writes a run record we can review
```

- The MCP server exposes tools like `list_overdue`, `create_invoice`, `send_invoice`, `add_schedule_entry`, `get_financial_summary`.
- The **app API key lives in a vault** Anthropic manages and injects at egress — it is *never visible to the agent's sandbox*, so even a misbehaving/compromised agent prompt can't read or exfiltrate it.
- The agent's brain is `claude-opus-4-8`.

Two trigger modes:

- **Scheduled** (a Managed Agents "deployment" on a cron) — e.g. "every morning, email reminders for invoices >14 days overdue and send me a summary."
- **On-demand** (a session you message) — e.g. "invoice the Johnson job for $4,200 and schedule the follow-up next Tuesday." Can be wired to a chat box or Slack later.

> Optional add-ons (not required for v1): the agent could also use the **QuickBooks** MCP (real accounting invoices), **Google Calendar** MCP (mirror schedule to a real calendar), and **Gmail** MCP. These are independent of our app's own data and can be layered in later.

---

## 7. Guardrails on money-moving actions

For v1 (**built** in Phase 2 as an in-app approval queue):

- **Send-invoice is confirm-before-send.** The agent's `send_invoice` call does **not** email — it records a **pending send** under `{ns}/pending_sends`. An owner reviews the queue in **Settings → Agent send requests** and either **Review & send** (which opens the app's normal send composer — the owner's existing Gmail/PDF path — so the actual email always goes through the proven, owner-driven flow) or **Dismiss** (marks it rejected). The agent can never email on its own.
- `pending_sends` is server-only (Admin SDK) in the rules; the owner UI reads/writes it through the owner-authed `api-pending-sends` endpoint.
- Alternative mechanisms considered but not used: emailing the owner a summary link, or Managed Agents' `always_ask` pause (Phase 3 could add that on top).
- **Financials are read-only** in v1 (`financials:read` only). `financials:sensitive` (bank + payroll) is **not** granted to the first agent.
- **Per-key rate limits** on the endpoints (extend the best-effort limiter already in `send-invoice.js`, ideally backed by a small RTDB counter so it's not per-container).

We loosen these deliberately, one at a time, once the agent has a track record.

---

## 8. Settings UI (owner-only)

A small panel in the existing settings modal (`src/app/settings/**`), visible only to `owner` role:

- **Generate key** → choose label, company, and scopes → shows the raw `sk_live_…` **once** with a copy button and a "you won't see this again" warning.
- **List keys** → label, prefix, company, scopes, last-used, created-by. No raw secret ever shown again.
- **Revoke** → one click deletes the hash; the key stops working immediately.

Mirrors the existing access-management UI patterns in `src/app/access/01-access-control.js`.

---

## 9. Security summary

- Store **only the hash** of each key; raw key shown once.
- Key lives **server-side / in a vault**, never the browser, never a prompt, never in memory the agent can read.
- **Scope narrowly**; `financials:sensitive` off by default.
- **Audit** every agent write into the company `activity` node; track `lastUsedAt`.
- **Instant revocation** by deleting the hash.
- **Gate** invoice-sending and keep financials read-only in v1.
- The new server secret (Firebase service account) is the one high-value credential to protect — Netlify env var, never committed.

---

## 10. Proposed rollout

| Phase | Deliverable | Outcome |
|---|---|---|
| **0. This doc** | Agree on scopes, endpoints, gating | ✅ Shared plan + decisions locked |
| **1. Auth + one endpoint** ✅ **built** | Admin SDK init + `apiKeyAuth.js` + `api-invoices.js` (read) + `/api_keys` deny rule + owner "Manage API keys" UI | Real key you can mint from Settings and use to read invoices, read-only |
| **2. Write endpoints** ✅ **built** | `create_invoice` (POST `api-invoices`), `add_schedule_entry` (`api-schedule`), `send_invoice` queued for approval (`api-invoice-send`), owner approval endpoint + UI (`api-pending-sends`, "Agent send requests") | Agent can draft invoices & schedule; sends are queued and only go out when an owner approves |
| **3. Scheduled weekly report** ✅ **built** | Netlify Scheduled Function `weekly-report.js` (Fridays) → computes the breakdown via the Admin SDK (no agent key), adds a Claude-written summary, emails it, and stores a weekly snapshot for week-over-week deltas | A financial report + breakdown lands in the owner's inbox every Friday, automatically |
| **3b. MCP + Managed Agent** *(optional/future)* | MCP wrapper + a Managed-Agent cron deployment | For a more autonomous/conversational agent doing varied tasks — not needed for the scheduled report |
| **4. Loosen gates** | later: `financials:sensitive` + auto-send once trusted | Full organize-financials story |

Each phase is independently shippable and reviewable.

---

## 11. Open questions — resolved

All six from the first review are now decided (see the Decisions box at the top):

1. **Scope ladder** — keeping the six scopes in §4 as-is.
2. **Admin SDK vs bot-user** → **Admin SDK** (service account in Netlify env `FIREBASE_SERVICE_ACCOUNT`).
3. **Invoice-send gate** → **approve-before-send** (built in Phase 2).
4. **Pilot company** → **`wfs`**.
5. **Financials in v1** → **read-only**.
6. **QuickBooks** → **not now**.

## 12. Setup needed to run Phase 1

Before an owner can mint a key, one Netlify env var must be set (Site config → Environment variables):

- **`FIREBASE_SERVICE_ACCOUNT`** — the service-account JSON (Firebase console → Project settings → Service accounts → *Generate new private key*), pasted as a single-line string.
- `FIREBASE_DB_URL` — optional; defaults to the project's public RTDB URL.
- `ALLOWED_ORIGINS` — optional; comma-separated site origins to lock CORS down to (recommended once live).

`firebase-admin` is added to `package.json` and marked `external_node_modules` in `netlify.toml` so Netlify installs it at runtime rather than bundling it. Until `FIREBASE_SERVICE_ACCOUNT` is set, the key endpoints return a clear "not configured" error and nothing else changes in the app.

### Extra env vars for the weekly report (Phase 3)

The Friday `weekly-report` scheduled function reuses `FIREBASE_SERVICE_ACCOUNT` for data (no agent key needed). To email it, also set:

- **`REPORT_TO`** — recipient email (required to actually send).
- **`SMTP_USER` / `SMTP_PASS`** — SMTP creds (same ones `send-invoice` uses; e.g. a Gmail App Password). Required to send.
- **`ANTHROPIC_API_KEY`** — enables the Claude-written narrative summary (optional; omit → numbers only).
- **`REPORT_COMPANY`** — company id to report on (default `wfs`); **`REPORT_FROM`** — optional From address (defaults to `SMTP_USER`).

Schedule is `netlify.toml` → `[functions."weekly-report"] schedule = "0 13 * * 5"` (Fridays 13:00 UTC; cron is UTC — adjust for your timezone). Missing `REPORT_TO`/SMTP → the function computes and logs but sends nothing (no crash).
