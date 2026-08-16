// Sample data for trying the maintenance features out.
//
// Setting up enough contracts, visits, logged hours and part-paid invoices to
// see whether margin, renewals and the day route actually read well is half an
// hour of typing. This does it in one press, and undoes it in one more.
//
// Everything it creates is identified by an id prefix rather than a flag on the
// record. Two reasons: removal can then be exact, and contracts reject unknown
// fields, so a `sample: true` flag would need another rules deploy. Given how
// the last one went, not needing one is worth a prefix.
//
// Dates are all relative to now, so the scenario reads the same whenever it is
// loaded — one account healthy, one lapsing shortly, one already stopped, one
// retainer, one that was never paid for.
//
// Requires 01-contract-periods.js through 07-day-route.js.

const CT_SAMPLE_PREFIX = 'sample_';
const ctSampleId = (kind, name) => kind + '_' + CT_SAMPLE_PREFIX + name;
const ctIsSampleId = id => String(id || '').indexOf('_' + CT_SAMPLE_PREFIX) > 0;

const CT_SAMPLE_MEMBERS = [
  { name: 'Sample — Dale', rate: 55 },
  { name: 'Sample — Rick', rate: 45 },
];

// Visit jobs are created by the real generator, which assigns random ids, so
// the prefix alone does not find them. They are sample data because the
// contract that produced them is — and identifying them that way is exact,
// where a prefix would leave every generated visit orphaned on removal.
function ctIsSampleJob(job) {
  if (!job) return false;
  return ctIsSampleId(job.id) || ctIsSampleId(job.contractId);
}

function ctSampleJobIds() {
  return Object.values((typeof S !== 'undefined' && S.jobs) || {})
    .filter(ctIsSampleJob)
    .map(j => j.id);
}

function ctHasSampleData() {
  return Object.keys(ctAllContracts()).some(ctIsSampleId) || ctSampleJobIds().length > 0;
}

// ── The scenario ────────────────────────────────────────────────────────────

// Month arithmetic that matches the period math: step from the anchor day and
// clamp, so a start date late in a month does not drift.
function ctSampleMonths(from, n) {
  const d = ctParseDate(from);
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return ctDateKey(new Date(target.getFullYear(), target.getMonth(),
    Math.min(d.getDate(), ctDaysInMonth(target.getFullYear(), target.getMonth()))));
}

function ctSampleScenario(nowTs) {
  const today = ctStartOfDay(nowTs == null ? Date.now() : nowTs);
  const key = ctDateKey(today);
  const days = n => ctDateKey(ctAddDays(today, n));

  const customers = [
    { id: ctSampleId('cus', 'whitaker'), name: 'Sample — Whitaker Marina', phone: '(865) 555-0142', email: 'sample.whitaker@example.com', address: '1120 Lakeshore Dr, Kingston TN' },
    { id: ctSampleId('cus', 'cedar'), name: 'Sample — Cedar Point Docks', phone: '(865) 555-0177', email: 'sample.cedar@example.com', address: '88 Cedar Point Rd, LaFollette TN' },
    { id: ctSampleId('cus', 'norris'), name: 'Sample — Norris Point HOA', phone: '(423) 555-0119', email: 'sample.norris@example.com', address: '5 Anchor Bay Ct, Caryville TN' },
  ];

  const dockList = [
    'Inspect anodes, replace if under half',
    'Tighten dock hardware and check bolts',
    'Check bumpers and cleats',
    'Before and after photos',
  ];
  const sweepList = ['Clear debris from slips', 'Pressure wash walkway', 'Photo of finished walkway'];
  const seawallList = ['Walk the seawall for cracks', 'Check drainage weep holes', 'Photo any movement'];

  const contracts = [
    // Healthy and clearly profitable — what a good account looks like.
    {
      id: ctSampleId('ct', 'healthy'), name: 'Sample — Monthly dock maintenance',
      customerId: customers[0].id, status: 'active',
      startDate: ctSampleMonths(key, -5),
      visits: { freq: 'monthly' }, visitsThrough: ctSampleMonths(key, 6),
      billing: { freq: 'monthly', amount: 650 }, checklist: dockList,
      notes: 'Sample data. Safe to delete.',
    },
    // Lapses in a fortnight, and runs thin on margin — weekly labour against
    // quarterly billing is the shape that quietly loses money.
    {
      id: ctSampleId('ct', 'soon'), name: 'Sample — Cedar Point weekly sweep',
      customerId: customers[1].id, status: 'active',
      startDate: days(-70),
      visits: { freq: 'weekly' }, visitsThrough: days(14),
      billing: { freq: 'quarterly', amount: 1800 }, checklist: sweepList,
      notes: 'Sample data. Safe to delete.',
    },
    // Already stopped scheduling. This is the one the renewal board exists for.
    {
      id: ctSampleId('ct', 'lapsed'), name: 'Sample — Seawall inspection',
      customerId: customers[2].id, status: 'active',
      startDate: ctSampleMonths(key, -9),
      visits: { freq: 'quarterly' }, visitsThrough: days(-24),
      billing: { freq: 'annual', amount: 2400 }, checklist: seawallList,
      notes: 'Sample data. Safe to delete.',
    },
    // Billing with no visits — a retainer, which must not be nagged for a
    // checklist or a paid-through date.
    {
      id: ctSampleId('ct', 'retainer'), name: 'Sample — Marina management retainer',
      customerId: customers[0].id, status: 'active',
      startDate: ctSampleMonths(key, -4),
      visits: null, visitsThrough: '',
      billing: { freq: 'monthly', amount: 500 }, checklist: [],
      notes: 'Sample data. Safe to delete.',
    },
    // Scheduled but never paid for, so it generates nothing and says why.
    {
      id: ctSampleId('ct', 'unpaid'), name: 'Sample — Lakeside quarterly check',
      customerId: customers[2].id, status: 'active',
      startDate: ctSampleMonths(key, -2),
      visits: { freq: 'quarterly' }, visitsThrough: '',
      billing: null, checklist: seawallList,
      notes: 'Sample data. Safe to delete.',
    },
  ].map(c => Object.assign({}, c, {
    checklist: (c.checklist || []).map((text, i) => ({ id: ctSampleId('ck', c.id.slice(-8) + '_' + i), text: text })),
  }));

  return { customers, contracts, today: key };
}

// ── Loading ─────────────────────────────────────────────────────────────────

async function ctLoadSampleData(nowTs) {
  const { customers, contracts, today } = ctSampleScenario(nowTs);
  const now = nowTs == null ? Date.now() : nowTs;

  for (const c of customers) {
    if (typeof saveCustomer === 'function') await saveCustomer(Object.assign({}, c));
  }

  // Crew with pay rates, so labour cost — and therefore margin — is real
  // rather than zero. Appended, never replacing anyone already set up.
  if (typeof S !== 'undefined') {
    S.members = S.members || [];
    S.payRates = S.payRates || {};
    CT_SAMPLE_MEMBERS.forEach(m => {
      if (S.members.indexOf(m.name) < 0) S.members.push(m.name);
      S.payRates[m.name] = m.rate;
    });
    if (typeof saveMembers === 'function') { try { await saveMembers(); } catch (e) {} }
    if (typeof savePayRates === 'function') { try { await savePayRates(); } catch (e) {} }
  }

  for (const c of contracts) await ctSaveContract(c);

  // Create the visits and invoices THESE contracts are owed, so there is
  // history to look at rather than five empty accounts.
  //
  // Filtered to the sample contracts deliberately. ctPendingWork() plans for
  // every contract in the company, so an unfiltered run would generate real
  // visits and real draft invoices against a customer's live agreement —
  // skipping the preview and confirm that exists precisely to stop that.
  const mine = ctPendingWork(now).filter(p => ctIsSampleId(p.contractId));
  await ctRunGeneration(mine, { now });

  await ctDressSampleHistory(now, today);

  // Leave one account with work still pending, so the Generate button has
  // something to do and both states are visible.
  const healthy = ctGetContract(ctSampleId('ct', 'healthy'));
  if (healthy) await ctSaveContract(Object.assign({}, healthy, { visitsThrough: ctSampleMonths(today, 9) }));

  return { customers: customers.length, contracts: contracts.length, jobs: ctSampleJobIds().length };
}

// Hours, receipts, ticked checklists, part-paid invoices, an unbilled add-on,
// and a few stops moved onto today. Without this the accounts are structurally
// complete but every number reads zero, which shows nothing.
async function ctDressSampleHistory(now, today) {
  const members = CT_SAMPLE_MEMBERS.map(m => m.name);

  const plans = [
    // Comfortable margin: a few hours a month against $650.
    { id: ctSampleId('ct', 'healthy'), hoursPerVisit: 2.5, materials: 60, tickAll: true },
    // Thin to negative: weekly crews against quarterly billing.
    { id: ctSampleId('ct', 'soon'), hoursPerVisit: 3.5, materials: 25, tickAll: false },
    { id: ctSampleId('ct', 'lapsed'), hoursPerVisit: 4, materials: 140, tickAll: true },
  ];

  let seq = 0;
  for (const plan of plans) {
    const jobs = ctContractJobs(plan.id).filter(j => (ctParseDate(j.startDate) || 0) < ctStartOfDay(now));
    for (const j of jobs) {
      const member = members[seq % members.length];
      const start = (ctParseDate(j.startDate) || new Date(now)).getTime() + 8 * 3600000;
      // writeTimeEntry is the app's own path: state, local cache, then the
      // time node. Writing S.timeEntries directly would look right on screen
      // and never reach the rest of the team.
      await writeTimeEntry({
        id: ctSampleId('t', String(seq)), member: member, job: j.id,
        start: start, end: start + plan.hoursPerVisit * 3600000,
      });
      j.receipts = [{ id: ctSampleId('r', String(seq)), amount: plan.materials, category: 'Materials', desc: 'Sample materials' }];
      // A finished visit has its checklist ticked; the most recent one is left
      // part done so "2/4" and "in progress" both appear somewhere.
      const lastOne = j === jobs[jobs.length - 1];
      (j.tasks || []).forEach((t, i) => {
        t.done = plan.tickAll ? (lastOne ? i < 2 : true) : i === 0;
        if (t.done) { t.doneTime = start + 3600000; t.doneBy = member; }
      });
      j.status = plan.tickAll && !lastOne ? 'complete' : 'active';
      if (j.status === 'complete') j.completedAt = start + plan.hoursPerVisit * 3600000;
      j.assigned = member;
      await writeJob(j);
      seq++;
    }
  }
  // Part-paid billing, so Outstanding is not zero.
  for (const id of [ctSampleId('ct', 'healthy'), ctSampleId('ct', 'retainer')]) {
    const job = S.jobs[ctBillingJobId({ id: id })];
    if (!job || !job.invoices) continue;
    job.invoices.forEach((inv, i) => {
      if (i < job.invoices.length - 2) { inv.paid = calcInvoice(inv).total; inv.status = 'paid'; }
    });
    await writeJob(job);
  }

  // One unbilled add-on, so the next Generate has something extra to carry.
  const soon = ctGetContract(ctSampleId('ct', 'soon'));
  if (soon) {
    await ctSaveContract(Object.assign({}, soon, {
      addons: Object.assign({}, soon.addons, {
        [ctSampleId('ad', 'callout')]: {
          id: ctSampleId('ad', 'callout'), desc: 'Sample — emergency callout after storm',
          amount: 450, date: ctDateKey(ctAddDays(ctStartOfDay(now), -6)), billedInvoiceId: null, created: now,
        },
      }),
    }));
  }

  // Put a few stops on today so the day route is not empty.
  const upcoming = [ctSampleId('ct', 'healthy'), ctSampleId('ct', 'soon')]
    .map(id => ctContractJobs(id).find(j => (ctParseDate(j.startDate) || 0) >= ctStartOfDay(now)))
    .filter(Boolean);
  for (let i = 0; i < upcoming.length; i++) {
    const j = upcoming[i];
    j.startDate = today; j.dueDate = today;
    j.assigned = members[i % members.length];
    j.status = 'active';
    await writeJob(j);
  }

  // A one-off booked between the contract visits, because a real day has one.
  await writeJob({
    id: ctSampleId('j', 'oneoff'), name: 'Sample — one-off ladder repair',
    status: 'active', stage: '', type: '', assigned: members[0],
    address: '204 Marina Way, Caryville TN', startDate: today, dueDate: today,
    value: '', description: 'Sample data. Safe to delete.',
    customerName: 'Sample — Cedar Point Docks', customerPhone: '', customerEmail: '',
    billingAddress: '', leadSource: '', progress: 0,
    notes: [], photos: [], tasks: [], dailyLogs: [], documents: [], comms: [],
    created: now, geocodeStatus: 'none',
  });
}

// ── Removing ────────────────────────────────────────────────────────────────

// Everything the loader made, and nothing else. Driven off the same id prefix,
// so a real contract created alongside it is never touched.
async function ctRemoveSampleData() {
  const removed = { contracts: 0, jobs: 0, customers: 0 };

  for (const id of Object.keys(ctAllContracts()).filter(ctIsSampleId)) {
    await ctDeleteContract(id);
    removed.contracts++;
  }

  // Collected before the loop, since deleting mutates S.jobs as we go.
  for (const id of ctSampleJobIds()) {
    if (typeof deleteJobDB === 'function') { try { await deleteJobDB(id); } catch (e) {} }
    delete S.jobs[id];
    removed.jobs++;
  }
  if (typeof LOCAL !== 'undefined' && LOCAL.saveJobs) { try { LOCAL.saveJobs(); } catch (e) {} }

  for (const id of Object.keys((S && S.timeEntries) || {}).filter(ctIsSampleId)) {
    if (typeof deleteTimeEntryDB === 'function') { try { await deleteTimeEntryDB(id); } catch (e) {} }
    else delete S.timeEntries[id];
  }

  for (const id of Object.keys((S && S.customers) || {}).filter(ctIsSampleId)) {
    if (typeof deleteCustomer === 'function') { try { await deleteCustomer(id); } catch (e) {} }
    removed.customers++;
  }

  if (S.members) {
    S.members = S.members.filter(m => CT_SAMPLE_MEMBERS.every(sm => sm.name !== m));
    CT_SAMPLE_MEMBERS.forEach(sm => { if (S.payRates) delete S.payRates[sm.name]; });
    if (typeof saveMembers === 'function') { try { await saveMembers(); } catch (e) {} }
    if (typeof savePayRates === 'function') { try { await savePayRates(); } catch (e) {} }
  }

  return removed;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CT_SAMPLE_PREFIX, ctSampleId, ctIsSampleId, ctIsSampleJob, ctSampleJobIds, ctHasSampleData,
    ctSampleScenario, ctLoadSampleData, ctRemoveSampleData,
  };
}
