# Scaling notes — 5 → 25 → 100 employees

A plain-language assessment of how this app handles growth, and what to change
if the team gets bigger. Nothing here is urgent at the current size; it's a
reference to decide from later.

> TL;DR — The app is well-matched to a small team today. The thing that
> decides how it scales is **how it loads data**, not the product features.
> A modest data-layer tune-up carries it to ~25 people; going to ~100 needs
> deliberate re-architecture of the same layer. Auth, photo storage, and the
> role/company model already scale fine.

---

## The one mechanism that decides everything

The app loads data with **whole-collection realtime listeners and no
pagination**. Each listener re-downloads the *entire* collection to *every*
connected device on *any* change, and most then re-render the whole screen.

From `src/app/02-state-utils-data.js` (`initFB`):

```js
DB.child('jobs').on('value', … render())   // ALL jobs, on every job edit
DB.child('activity').on('value', …)        // ALL activity, on every new log line
DB.child('time').on('value', … render())   // ALL time entries, on every clock in/out
// … + members, timeoff, referrals, payrates, transactions
```

Facts about the current code:

- **No queries or pagination anywhere** — no `limitToLast`, `orderByChild`,
  `startAt`/`endAt`. Every read is a full-node `.on('value')`.
- **No `.indexOn`** in `database.rules.json` (needed before any scalable query).
- **`render()` is a full re-render** — it rebuilds the active view's HTML and
  re-attaches handlers on every remote change.
- **Owner/manager views aggregate every company's jobs in memory**
  (`ownerList()` / `flatMap(x => x.jobs)` in `src/app/views/01-owner-dashboard.js`),
  so the owner's device is always the heaviest client.
- **Local cache is localStorage (~5 MB practical cap).** Photos/receipts/docs
  are moved to Firebase Storage and stripped from the local cache when sync is
  on, but jobs/activity/time JSON still accumulates there.

**The key insight:** cost is driven by **(total accumulated records) ×
(how often anyone changes anything)** — not by employee count directly —
because every change makes every device re-download and re-draw the full set.

---

## Now — 5 employees ✅ Runs great

Small data (hundreds of jobs; low thousands of activity/time rows), infrequent
concurrent edits. Whole-node reloads are small and re-renders are instant.
Local cache sits well under ~5 MB with photos in the cloud.

**Action: none. The architecture fits this size well.**

---

## ~25 employees ⚠️ Usable, but the seams start to show

- **Activity & time grow fastest and churn most.** Every action logs an
  activity row; every shift logs time — roughly **hundreds of new rows/day** at
  this size. Each new row makes every device re-download the *entire*
  activity/time history and re-render. This is the first thing you'll feel:
  background data churn and occasional UI jank, worst on phones and worst on the
  **owner/manager** view (it loads all three companies at once).
- **Jobs volume climbs** (more crews → more concurrent jobs + more history),
  making the full-jobs reload heavier.
- **Local cache creeps toward the ceiling** (richer records across more jobs can
  reach 1–3 MB) — not failing, but heading there.

**Verdict:** still works; this is the point to land the Tier-1 tune-up below.
"Needs a tune-up," not "broken."

---

## ~100 employees ❌ The current data model doesn't hold

- The whole-collection pattern is now the dominant cost. Activity/time can be
  **tens to hundreds of thousands of rows**, re-downloaded on **every** new
  entry, with 100 people generating entries continuously. Expect heavy
  bandwidth, battery drain, laggy UI, and slow startup.
- **localStorage's ~5 MB cap is exceeded** → "storage full" warnings, cache
  thrashing, degraded offline behavior.
- The **owner dashboard's all-company in-memory aggregation** grows with total
  data and becomes a bottleneck on the owner's device specifically.

**Verdict:** needs deliberate re-architecture of the data layer — not a config
tweak. (The product/UI itself does not need a rewrite.)

---

## What to change, in priority order

### Tier 1 — do around 25 people (biggest wins, moderate effort)

1. **Stop loading whole history nodes.** Switch `activity` and `time` to bounded
   queries — `orderByChild('time').limitToLast(N)` (e.g. last 200–500) for the
   live view, load older on demand. Removes the sharpest cliff.
2. **Debounce & scope re-renders.** Coalesce bursts of remote updates
   (debounce the listener-driven `render()`), and only re-render the active
   view. Kills most jank without a rewrite.
3. **Add `.indexOn`** in `database.rules.json` for queried fields
   (`time`, `created`, `status`, dates) so queries stay fast.

### Tier 2 — before/around 100 people (structural)

4. **Lazy-load jobs.** Load active/recent jobs by default; fetch
   closed/archived only when opened or searched, instead of the whole tree.
5. **Move the local cache from localStorage to IndexedDB** (hundreds of MB vs
   ~5 MB) so offline caching stops hitting the wall.
6. **Server-side rollups for the owner dashboard** (Cloud Function / gateway)
   so the owner device doesn't download every company's raw data to show totals.
7. **Archive old activity/time** to a cold node so the hot path stays small.

### Tier 3 — if 100+ is the firm plan (long-term)

8. **Evaluate migrating Realtime Database → Firestore.** Firestore's model is
   query-and-paginate-what-you-need with IndexedDB offline persistence built in
   — a much better fit for large, growing, multi-user datasets than RTDB's
   whole-node `.on('value')`. Significant migration; only worth it if 100+ is a
   firm direction, but it's the natural endgame.

---

## What already scales fine (leave alone)

- **Firebase Authentication** — 100 logins is trivial for it.
- **Firebase Storage for photos/receipts/docs** — scales to gigabytes; the app
  already offloads blobs there and keeps only short URLs.
- **Role / company model** (worker / manager / owner, per-company partitioning)
  — functionally fine at any of these sizes; workers only load their own
  company's data.

---

## Bottom line

- **5 → 25:** fundamentally fine; land the Tier-1 tune-up (bounded activity/time
  queries, debounced renders, indexes) and it stays smooth and cheap.
- **25 → 100:** the "download everything, re-render everything" model runs out of
  road; add Tier 2 (lazy jobs, IndexedDB cache, server-side owner rollups), and
  seriously evaluate Firestore.
- The work is confined to the **data-loading layer**, which is well-isolated —
  not a product rewrite.

*Prepared as a reference. No code changes are implied by this document.*
