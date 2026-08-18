# Known issues and friction points

A standing list, found by auditing the app in August 2026. Every item here was
**confirmed by measurement or by reading the code** — nothing is on this list on
suspicion. Each carries the evidence, so a future reader can re-check it rather
than take it on trust.

Ordered by severity: things that make the app tell you something untrue come
first, then revenue left on the table, then daily friction.

Status is one of: **open**, **in progress**, **fixed** (with the PR), or
**won't fix** (with the reason).

---

## Silent wrongness — the app records or reports something untrue

### 1. Two people can create the same invoice number — **open**

**Evidence.** `nextInvoiceNumber()` in `src/app/02-state-utils-data.js` scans
local state for the highest number seen and returns max + 1. Calling it twice in
a row returns `INV-1042` both times; two devices with the same synced state do
the same. There is no reservation and no uniqueness check on write.

**Impact.** Duplicate invoice numbers in the books, produced exactly when two
people are billing at once — month end. An accounting problem, not a UI one.

**Also affected by the same flaw:** `nextEstimateNumber()` and
`ctNewProposalNumber()` in `src/app/contracts/13-proposal.js`.

**Sketch of the fix.** A counter per sequence under `$company/counters/`,
incremented with a Firebase `transaction()` — atomic, so concurrent callers
serialise. Seed the counter from the highest number already in the data so it
never restarts below history. Reserve at SAVE rather than at modal open, so
abandoned drafts do not burn numbers. Offline, fall back to the local guess and
mark the invoice provisional so a duplicate can be spotted later.

### 2. Concurrent edits silently overwrite each other — **open**

**Evidence.** `writeJob()` does `writeDB('jobs/'+j.id, copy)`, which is
`DB.child(path).set(value)` — a whole-object replace. Jobs carry no `updatedAt`,
so there is nothing to compare versions with.

**Impact.** Dale ticks a checklist item while Rick adds a note to the same visit.
Whoever saves second writes their entire stale copy over the top, and the other
person's change is gone with nothing said. On a crew all touching the same visit
jobs, this happens regularly.

**Sketch of the fix.** Two stages. First, diff the job against the last-known
server copy and `update()` only the changed fields, so edits to *different*
fields merge instead of colliding. Second, stamp `updatedAt`/`updatedBy` on
write and warn — rather than silently clobber — when the server copy has moved
since the edit began. Longer term, notes/photos/tasks/dailyLogs want to be keyed
maps rather than arrays so concurrent appends merge naturally.

### 3. Two different customer models in one app — **open**

**Evidence.** Project jobs have **no `customerId`** — they carry `customerName`,
`customerEmail`, `customerPhone` and `billingAddress` as free text. The Customers
view (`src/app/views/07-customers.js`) groups jobs by normalised name string
(`normName(j.customerName)`) and collects contact details *from the jobs*.
Contracts and entities, by contrast, link by `customerId` and read the name from
the directory.

**Impact.** The same customer is retyped on every job. Fixing a phone number in
Customers leaves every existing job with the old one. "Whitaker Marina" and
"Whitaker Marina LLC" become two customers; renaming one splits their history.
The stale-email bug patched narrowly in the bill run was a symptom of this.

**Especially worth settling before the deployment split** — afterwards it is two
migrations instead of one, and it gets more expensive every month.

### 4. Deleting a customer orphans their contracts, silently — **open**

**Evidence.** `deleteCustomer()` removes the customer record and nothing else.
Contracts keep a `customerId` pointing at nothing; `ctCustomerName()` then
returns `''` and the contract shows nameless. The delete's failure is swallowed
in a bare `catch(e){}`, so a rejected delete looks successful until the next sync
brings the customer back.

**Sketch of the fix.** Warn before deleting a customer that has contracts or
jobs. Flag a broken customer link on the contract card the way the entity roster
already flags a broken company link. Report the delete failure instead of
swallowing it.

---

## Revenue left on the table

### 5. No capture for work found on site — **open**

Nothing in the app records "the ladder is rotten" while a crew member is
standing next to it. It depends on someone remembering that evening. For a
maintenance business this is usually the largest quiet revenue leak: you are
already on site, already trusted.

**Sketch.** A "Found work" action on a visit — photo, one line, urgency —
landing either as an add-on on the contract (which already bills) or as a quote
to send.

### 6. Clocking in is buried — **open**

**Evidence.** Clock in/out lives on the **Time** tab, which for a maintenance
company sits behind **More**. On the sample data the pricing panel reads
*"7 visits had no time logged and are left out of the average."*

**Impact.** Unlogged hours are invisible to the pricing estimate-vs-actual, the
account margin, and the labour cost in the revenue book. Those features are only
as honest as the hours behind them, and today they measure about half the visits.

**Sketch.** A Start/Stop button on the stop itself, in the day route and on the
visit job. One tap, no navigation.

### 7. No collections chase — **open**

The bill run closed the sending half. Chasing what is owed still means opening
each invoice. The revenue book knows the outstanding total but there is no
worklist.

**Sketch.** An overdue list sorted by age and amount, with one-tap reminders —
the mirror of the bill run, shortening the cash cycle rather than the paperwork.

---

## Daily friction

### 8. Creating a job asks 16 questions — **open**

**Evidence.** The new-job modal renders 16 inputs over 1044px, and none are
marked `required` in the markup — the asterisk on "Job name" is decoration.

**Sketch.** A quick-add — name, customer, date — with the full form kept for
when someone is sitting down.

### 9. No week view — **open**

The day route answers "where is the crew now". Nothing answers "who is where on
Thursday" except reading the month calendar one job at a time.

### 10. The jobs list has one search box — **open**

No filter by status, assignee or date. MHS already runs 27 active jobs; a
maintenance book generates roughly 240 visits a year.

### 11. Nothing is bulk-editable — **open**

Measured: zero checkboxes in any list view. Reassigning five visits when someone
calls in sick is five separate job opens. The bill run is the only bulk action in
the app and it proved the pattern works.

### 12. Photo capture opens the file picker, not the camera — **open**

`accept="image/*"` with no `capture` attribute, so a phone offers
Camera-or-Library every time. One attribute, and photos are what make visit
reports worth sending.

### 13. No quick receipt capture from a maintenance stop — **open**

Project companies get a prominent **Add receipt** on Home; the day route has no
equivalent. Materials feed the pricing actuals exactly as hours do.

### 14. No arrival notice to the customer — **open**

Visit reports go after the fact and invoices at the end. The cheap bit in
between — "on our way, about 20 minutes" — does not exist, and it is
disproportionately what customers remember.

### 15. Half-typed forms discard without a prompt — **open**

**Evidence.** Filling a job form and tapping the backdrop closes it and discards
the text with nothing asked. Escape does the same.

### 16. Offline gives no reassurance — **open**

Firebase queues writes and syncs them later, so data genuinely is not lost in a
dead zone. But the crew is shown "Reconnecting…" and no confirmation their hours
saved, which produces double entry or a re-drive.

---

## Checked and found healthy — do not spend money here

Recorded so nobody re-litigates these.

- **Dates are correct.** `fmtDate`/`daysUntil` append `T00:00:00` to force local
  midnight, avoiding the UTC off-by-one-day trap. Done deliberately.
- **Money behaves.** Totals are stored unrounded (e.g. `1402.086475`) but every
  display goes through `money2()` and every balance check uses a `0.005`
  tolerance. Worth rounding at the source one day; not a bug today.
- **Speed is fine.** 500 jobs render in 94ms, the dashboard in 4ms.
- **Storage is fine.** Well under the ~5MB localStorage limit, and base64 images
  are deliberately kept out of the local cache.
- **Escape closes modals**, and the sync bar is wired to Firebase's real
  `.info/connected` state.
- **Write failures are reported.** `writeDB`/`removeDB` call `showCloudSaveError`
  and rethrow rather than swallowing.
