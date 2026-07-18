# Agent API Keys & Automation — Design Doc

**Status:** Draft for review (not yet built)
**Branch:** `claude/agent-api-key-invoicing-i3zyzl`
**Goal:** Let an AI agent access the app with a scoped, revocable API key so it can send invoices, help schedule, and organize financials — safely.

> This is a **plan to review**, not finished work. Nothing here is wired up yet. The point is to agree on the shape before writing code. Open questions are collected at the end.

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

New Realtime Database node, **not** namespaced per company (keys are a global admin concern), readable/writable by owners only via rules, but in practice only ever touched by the Admin SDK:

```
/api_keys/{keyId}
  ├─ hash:        "<sha-256 of the raw key>"   // NEVER store the raw key
  ├─ prefix:      "sk_live_a1b2"               // first ~8 chars, for display/identification
  ├─ label:       "Invoicing agent"           // human-set name
  ├─ company:     "mhs"                        // the namespace this key is scoped to
  ├─ scopes:      ["invoices:write", "schedule:write", "financials:read"]
  ├─ createdBy:   "<uid of the owner who minted it>"
  ├─ createdAt:   1737200000000
  ├─ lastUsedAt:  1737300000000               // updated on each call
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
| `/api/invoices` | GET | `invoices:read` | List/filter invoices (e.g. overdue) |
| `/api/invoices` | POST | `invoices:write` | Create an invoice/estimate |
| `/api/invoices/send` | POST | `invoices:write` | Send — reuses `send-invoice.js` internals; **gated** (§7) |
| `/api/schedule` | GET | `schedule:read` | Read schedule entries |
| `/api/schedule` | POST | `schedule:write` | Create/update a schedule entry |
| `/api/financials/summary` | GET | `financials:read` | Job costing / AR / receipts summary |
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

For v1:

- **Send-invoice is confirm-before-send.** The agent proposes; a human approves. Options:
  - (a) the agent emails *you* a summary and only sends after you reply/click, or
  - (b) Managed Agents' `always_ask` permission on the `send_invoice` tool, which pauses the session for your approval.
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
| **0. This doc** | Agree on scopes, endpoints, gating | Shared plan |
| **1. Auth + one endpoint** | `apiKeyAuth.js` + `/api/invoices` (read) + `/api_keys` schema + "Generate key" UI | Real key you can mint and test end-to-end, read-only |
| **2. Write endpoints** | `create_invoice`, `send_invoice` (gated), `add_schedule_entry` | Agent can act, with approval gate |
| **3. MCP + Managed Agent** | MCP wrapper + a scheduled deployment | "Every morning, chase overdue invoices" runs itself |
| **4. Financials + loosen gates** | `financials:read` summary; later `sensitive` + auto-send once trusted | Full organize-financials story |

Each phase is independently shippable and reviewable.

---

## 11. Open questions for you

1. **Scope ladder** — happy with the six scopes in §4, or do you want finer/coarser buckets?
2. **Admin SDK vs bot-user** (§5) — I recommend the Admin SDK service account. OK to introduce that one server secret?
3. **Invoice-send gate** (§7) — prefer (a) email-summary-then-approve, or (b) an in-session approval pause? (a) is simpler and works over email you already read.
4. **Which company first?** Keys scope to one namespace (`wfs`/`mhs`/`nlr`). Which do we pilot with?
5. **Financials in v1** — keep it strictly read-only to start? (My strong recommendation: yes.)
6. **QuickBooks** — do you want invoices to also flow into QuickBooks, or is email-PDF (today's behavior) enough for v1?
