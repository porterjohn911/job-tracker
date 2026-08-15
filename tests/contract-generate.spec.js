// Turning contract plans into real jobs and invoices.
//
// This is the only part of the feature that creates records the rest of the app
// treats as real work and real money, so these cases lean hard on the ways that
// goes wrong: creating the same period twice, billing an add-on twice, sending
// something nobody approved, or producing a job the rest of the app cannot use.

const { expect, test } = require('@playwright/test');
const { stubExternals } = require('./_stubs');

const MARCH = new Date(2026, 2, 15).getTime();

async function load(page) {
  await stubExternals(page);
  await page.addInitScript(() => {
    localStorage.setItem('jt_company', 'wfs');
    localStorage.setItem('jt_companies', JSON.stringify({
      wfs: { id: 'wfs', ns: 'wfs', label: 'Waterfront Solutions', active: true, type: 'maintenance' },
    }));
  });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.ctRunGeneration === 'function');
  await page.evaluate(() => {
    S.contracts = {}; S.jobs = {}; S.customers = {}; S.ctSearch = ''; S._ctWired = false;
    ctSaveContractsLocal();
  });
}

// Seed a contract and return the full plan for it.
async function seed(page, contract) {
  return page.evaluate(async (c) => { await ctSaveContract(c); }, contract);
}

const monthlyVisits = {
  id: 'ct_a', name: 'Dock maintenance', status: 'active', startDate: '2026-01-01',
  visits: { freq: 'monthly' }, visitsThrough: '2026-04-01',
};

const monthlyBilling = {
  id: 'ct_b', name: 'Marina retainer', status: 'active', startDate: '2026-01-01',
  billing: { freq: 'monthly', amount: 500 },
};

test.describe('naming', () => {
  test('monthly work is named for its month, weekly for its date', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => ({
      monthly: ctGeneratedName({ name: 'Dock maintenance' }, '2026-09-01', { freq: 'monthly' }),
      quarterly: ctGeneratedName({ name: 'Seawall check' }, '2026-09-01', { freq: 'quarterly' }),
      annual: ctGeneratedName({ name: 'Survey' }, '2026-09-01', { freq: 'annual' }),
      // A month label would repeat four times a month and two visits would
      // share a name, so dense schedules get the day too.
      weekly: ctGeneratedName({ name: 'Marina sweep' }, '2026-09-07', { freq: 'weekly' }),
      biweekly: ctGeneratedName({ name: 'Marina sweep' }, '2026-09-07', { freq: 'biweekly' }),
      noName: ctGeneratedName({}, '2026-09-01', { freq: 'monthly' }),
    }));
    expect(r.monthly).toBe('Dock maintenance — Sep 2026');
    expect(r.quarterly).toBe('Seawall check — Sep 2026');
    expect(r.annual).toBe('Survey — Sep 2026');
    expect(r.weekly).toBe('Marina sweep — Sep 7, 2026');
    expect(r.biweekly).toBe('Marina sweep — Sep 7, 2026');
    expect(r.noName).toBe('Contract — Sep 2026');
  });

  test('weekly visits in one month get distinct names', async ({ page }) => {
    await load(page);
    const names = await page.evaluate((now) => {
      const c = ctNormalizeContract({ id: 'ct_w', name: 'Sweep', status: 'active', startDate: '2026-09-07', visits: { freq: 'weekly' }, visitsThrough: '2026-09-28' });
      return ctVisitPeriods(c, now).map(p => ctGeneratedName(c, p.date, c.visits));
    }, new Date(2026, 8, 7).getTime());
    expect(names).toEqual([
      'Sweep — Sep 7, 2026', 'Sweep — Sep 14, 2026', 'Sweep — Sep 21, 2026', 'Sweep — Sep 28, 2026',
    ]);
    expect(new Set(names).size).toBe(4);
  });
});

test.describe('generated visits', () => {
  test('create jobs the rest of the app can use', async ({ page }) => {
    await load(page);
    await page.evaluate(() => { S.customers = { cus_1: { id: 'cus_1', name: 'Whitaker Marina', phone: '555-0100', email: 'dale@example.com', address: '1120 Lakeshore Dr' } }; });
    await seed(page, Object.assign({}, monthlyVisits, { customerId: 'cus_1' }));
    const r = await page.evaluate(async (now) => {
      await ctRunGeneration(ctPendingWork(now), { now });
      const jobs = Object.values(S.jobs);
      const j = jobs[0];
      return {
        count: jobs.length,
        names: jobs.map(x => x.name).sort(),
        shape: {
          status: j.status, start: j.startDate, due: j.dueDate,
          customerName: j.customerName, address: j.address,
          arrays: ['notes', 'photos', 'tasks', 'dailyLogs', 'documents', 'comms'].every(k => Array.isArray(j[k])),
          contractId: j.contractId, hasPeriodKey: !!j.periodKey,
        },
        // The schedule reads jobs through jobDateRange; a generated visit must
        // land on the calendar like any other job.
        onCalendar: jobDateRange(j).length > 0,
      };
    }, MARCH);
    expect(r.count).toBe(4);
    expect(r.names).toEqual([
      'Dock maintenance — Apr 2026', 'Dock maintenance — Feb 2026',
      'Dock maintenance — Jan 2026', 'Dock maintenance — Mar 2026',
    ]);
    expect(r.shape.status).toBe('active');
    expect(r.shape.customerName).toBe('Whitaker Marina');
    expect(r.shape.address).toBe('1120 Lakeshore Dr');
    expect(r.shape.arrays).toBe(true);
    expect(r.shape.contractId).toBe('ct_a');
    expect(r.shape.hasPeriodKey).toBe(true);
    expect(r.onCalendar).toBe(true);
  });

  test('generated jobs show up in the normal jobs view', async ({ page }) => {
    await load(page);
    await seed(page, monthlyVisits);
    const html = await page.evaluate(async (now) => {
      await ctRunGeneration(ctPendingWork(now), { now });
      S.view = 'jobs'; render();
      return document.getElementById('content').innerHTML;
    }, MARCH);
    expect(html).toContain('Dock maintenance — Mar 2026');
  });
});

test.describe('generated billing', () => {
  test('invoices are drafts, never sent', async ({ page }) => {
    await load(page);
    await seed(page, monthlyBilling);
    const r = await page.evaluate(async (now) => {
      await ctRunGeneration(ctPendingWork(now), { now });
      const job = S.jobs[ctBillingJobId({ id: 'ct_b' })];
      return {
        invoices: job.invoices.length,
        statuses: [...new Set(job.invoices.map(i => i.status))],
        paid: [...new Set(job.invoices.map(i => i.paid))],
        numbers: job.invoices.map(i => i.number),
        dates: job.invoices.map(i => i.date),
        amounts: job.invoices.map(i => calcInvoice(i).total),
      };
    }, MARCH);
    expect(r.invoices).toBe(3);
    // A generated invoice is paperwork. A person still decides what gets sent.
    expect(r.statuses).toEqual(['draft']);
    expect(r.paid).toEqual([0]);
    expect(new Set(r.numbers).size).toBe(3);
    expect(r.dates).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
    expect(r.amounts).toEqual([500, 500, 500]);
  });

  test('one standing billing job per contract, with a derived id', async ({ page }) => {
    await load(page);
    await seed(page, monthlyBilling);
    const r = await page.evaluate(async (now) => {
      await ctRunGeneration(ctPendingWork(now), { now });
      const before = Object.keys(S.jobs).length;
      // A later run must reuse the same container, not open a second one.
      await ctSaveContract(Object.assign({}, ctGetContract('ct_b'), { billing: { freq: 'monthly', amount: 500 } }));
      await ctRunGeneration(ctPendingWork(new Date(2026, 4, 15).getTime()), { now });
      const job = S.jobs[ctBillingJobId({ id: 'ct_b' })];
      return { before, after: Object.keys(S.jobs).length, name: job.name, invoices: job.invoices.length };
    }, MARCH);
    expect(r.before).toBe(1);
    expect(r.after).toBe(1);
    expect(r.name).toBe('Marina retainer — Agreement');
    expect(r.invoices).toBe(5);
  });

  test('line items come from the contract when set', async ({ page }) => {
    await load(page);
    await seed(page, {
      id: 'ct_c', name: 'Full service', status: 'active', startDate: '2026-01-01',
      billing: { freq: 'annual', amount: 0, items: [{ desc: 'Annual agreement', qty: 1, rate: 2400 }, { desc: 'Dock light service', qty: 2, rate: 150 }] },
    });
    const r = await page.evaluate(async (now) => {
      await ctRunGeneration(ctPendingWork(now), { now });
      const inv = S.jobs[ctBillingJobId({ id: 'ct_c' })].invoices[0];
      return { items: inv.items.map(i => i.desc), total: calcInvoice(inv).total };
    }, MARCH);
    expect(r.items).toEqual(['Annual agreement', 'Dock light service']);
    expect(r.total).toBe(2700);
  });
});

test.describe('add-ons', () => {
  test('ride the first invoice of a run and are stamped with it', async ({ page }) => {
    await load(page);
    await seed(page, monthlyBilling);
    await page.evaluate(async () => {
      await ctAddAddon('ct_b', { desc: 'Emergency callout', amount: 450, date: '2026-02-11' });
      await ctAddAddon('ct_b', { desc: 'Replacement cleat', amount: 85, date: '2026-02-14' });
    });
    const r = await page.evaluate(async (now) => {
      await ctRunGeneration(ctPendingWork(now), { now });
      const job = S.jobs[ctBillingJobId({ id: 'ct_b' })];
      const addons = Object.values(ctGetContract('ct_b').addons);
      return {
        firstItems: job.invoices[0].items.map(i => i.desc),
        firstTotal: calcInvoice(job.invoices[0]).total,
        laterTotals: job.invoices.slice(1).map(i => calcInvoice(i).total),
        stamped: addons.map(a => a.billedInvoiceId),
        allOnFirst: addons.every(a => a.billedInvoiceId === job.invoices[0].id),
        pending: ctPendingAddons(ctGetContract('ct_b')).length,
      };
    }, MARCH);
    // One-offs, not something every period repeats.
    expect(r.firstItems).toEqual(['Marina retainer — Jan 2026', 'Emergency callout', 'Replacement cleat']);
    expect(r.firstTotal).toBe(1035);
    expect(r.laterTotals).toEqual([500, 500]);
    expect(r.stamped.every(Boolean)).toBe(true);
    expect(r.allOnFirst).toBe(true);
    expect(r.pending).toBe(0);
  });

  test('a second run does not bill them again', async ({ page }) => {
    await load(page);
    await seed(page, monthlyBilling);
    await page.evaluate(async () => { await ctAddAddon('ct_b', { desc: 'Callout', amount: 450 }); });
    const r = await page.evaluate(async (now) => {
      await ctRunGeneration(ctPendingWork(now), { now });
      const afterFirst = calcInvoice(S.jobs[ctBillingJobId({ id: 'ct_b' })].invoices[0]).total;
      const second = await ctRunGeneration(ctPendingWork(now), { now });
      const job = S.jobs[ctBillingJobId({ id: 'ct_b' })];
      return { afterFirst, secondInvoices: second.invoices, secondAddons: second.addons, totalInvoices: job.invoices.length };
    }, MARCH);
    expect(r.afterFirst).toBe(950);
    expect(r.secondInvoices).toBe(0);
    expect(r.secondAddons).toBe(0);
    expect(r.totalInvoices).toBe(3);
  });

  test('an add-on with no billing schedule to carry it is left pending and explained', async ({ page }) => {
    await load(page);
    await seed(page, monthlyVisits);
    await page.evaluate(async () => { await ctAddAddon('ct_a', { desc: 'Extra wash', amount: 200 }); });
    const r = await page.evaluate(async (now) => {
      const plans = ctPendingWork(now);
      const rows = ctPlanRows(plans);
      await ctRunGeneration(plans, { now });
      return { rows, stillPending: ctPendingAddons(ctGetContract('ct_a')).length };
    }, MARCH);
    expect(r.rows).toContain('no billing schedule');
    expect(r.stillPending).toBe(1);
  });
});

test.describe('idempotency', () => {
  test('running twice creates nothing the second time', async ({ page }) => {
    await load(page);
    await seed(page, monthlyVisits);
    await seed(page, monthlyBilling);
    const r = await page.evaluate(async (now) => {
      const first = await ctRunGeneration(ctPendingWork(now), { now });
      const jobsAfterFirst = Object.keys(S.jobs).length;
      const second = await ctRunGeneration(ctPendingWork(now), { now });
      return {
        first: { visits: first.visits, invoices: first.invoices },
        second: { visits: second.visits, invoices: second.invoices },
        jobsAfterFirst, jobsAfterSecond: Object.keys(S.jobs).length,
        pending: ctPendingWork(now).length,
      };
    }, MARCH);
    expect(r.first).toEqual({ visits: 4, invoices: 3 });
    expect(r.second).toEqual({ visits: 0, invoices: 0 });
    expect(r.jobsAfterFirst).toBe(r.jobsAfterSecond);
    expect(r.pending).toBe(0);
  });

  test('extending the paid-through date adds only the new visits', async ({ page }) => {
    await load(page);
    await seed(page, monthlyVisits);
    const r = await page.evaluate(async (now) => {
      await ctRunGeneration(ctPendingWork(now), { now });
      const before = Object.keys(S.jobs).length;
      await ctSaveContract(Object.assign({}, ctGetContract('ct_a'), { visitsThrough: '2026-07-01' }));
      const second = await ctRunGeneration(ctPendingWork(now), { now });
      const names = Object.values(S.jobs).map(j => j.name).sort();
      return { before, added: second.visits, total: Object.keys(S.jobs).length, unique: new Set(names).size };
    }, MARCH);
    expect(r.before).toBe(4);
    expect(r.added).toBe(3);
    expect(r.total).toBe(7);
    expect(r.unique).toBe(7);
  });

  // The reason the ordering in ctRunGeneration matters: a run that dies partway
  // must be resumable, not repeatable.
  test('a failed write leaves the rest still pending, and a retry finishes it', async ({ page }) => {
    await load(page);
    await seed(page, monthlyVisits);
    const r = await page.evaluate(async (now) => {
      const realWrite = window.writeJob;
      let calls = 0;
      window.writeJob = async (j) => { calls++; if (calls === 2) throw new Error('boom'); return realWrite(j); };
      const first = await ctRunGeneration(ctPendingWork(now), { now });
      window.writeJob = realWrite;
      const stillDue = ctPendingTotals(ctPendingWork(now));
      const second = await ctRunGeneration(ctPendingWork(now), { now });
      return {
        made: first.visits, errors: first.errors.length,
        stillDue: stillDue.visits, recovered: second.visits,
        finalJobs: Object.keys(S.jobs).length,
        uniqueNames: new Set(Object.values(S.jobs).map(j => j.name)).size,
      };
    }, MARCH);
    expect(r.made).toBe(3);
    expect(r.errors).toBe(1);
    expect(r.stillDue).toBe(1);
    expect(r.recovered).toBe(1);
    expect(r.finalJobs).toBe(4);
    // Nothing was created twice by the retry.
    expect(r.uniqueNames).toBe(4);
  });
});

test.describe('the preview', () => {
  test('states exactly what will be created, and nothing until confirmed', async ({ page }) => {
    await load(page);
    await seed(page, monthlyVisits);
    await seed(page, monthlyBilling);
    await page.evaluate((now) => { openGeneratePreview(now); }, MARCH);
    const r = await page.evaluate(() => ({
      title: document.querySelector('.modal-title').textContent,
      body: document.querySelector('.modal-body').textContent,
      button: document.getElementById('ctg-go').textContent,
      jobsSoFar: Object.keys(S.jobs).length,
    }));
    expect(r.title).toBe('Generate Due Work');
    expect(r.body).toContain('4 job');
    expect(r.body).toContain('3 invoice');
    expect(r.body).toContain('nothing is sent to anyone');
    expect(r.button).toContain('Create 7 records');
    // Opening the preview writes nothing.
    expect(r.jobsSoFar).toBe(0);
  });

  test('confirming creates the records', async ({ page }) => {
    await load(page);
    await seed(page, monthlyVisits);
    await page.evaluate((now) => { openGeneratePreview(now); }, MARCH);
    await page.click('#ctg-go');
    const r = await page.evaluate(() => ({
      open: !!document.getElementById('ctg-bd'),
      jobs: Object.keys(S.jobs).length,
      toast: (document.querySelector('.toast') || {}).textContent || '',
    }));
    expect(r.open).toBe(false);
    expect(r.jobs).toBe(4);
    expect(r.toast).toContain('4 jobs');
  });

  test('the wired button opens the preview', async ({ page }) => {
    await load(page);
    await seed(page, monthlyVisits);
    await page.evaluate((now) => { document.getElementById('content').innerHTML = renderContracts(now); attachContractHandlers(); }, MARCH);
    await page.click('#btn-ct-generate');
    const r = await page.evaluate(() => ({
      open: !!document.getElementById('ctg-bd'),
      jobs: Object.keys(S.jobs).length,
    }));
    expect(r.open).toBe(true);
    // Opening writes nothing, whatever date the button reads.
    expect(r.jobs).toBe(0);
  });

  test('cancelling creates nothing', async ({ page }) => {
    await load(page);
    await seed(page, monthlyVisits);
    await page.evaluate((now) => { openGeneratePreview(now); }, MARCH);
    await page.click('#ctg-cancel');
    const jobs = await page.evaluate(() => Object.keys(S.jobs).length);
    expect(jobs).toBe(0);
  });

  // A button that always offers to create records invites pressing it to find
  // out what happens, and this one writes real jobs and invoices.
  test('the button is absent when nothing is due', async ({ page }) => {
    await load(page);
    await seed(page, monthlyVisits);
    const r = await page.evaluate(async (now) => {
      const before = renderContracts(now).includes('btn-ct-generate');
      await ctRunGeneration(ctPendingWork(now), { now });
      return { before, after: renderContracts(now).includes('btn-ct-generate') };
    }, MARCH);
    expect(r.before).toBe(true);
    expect(r.after).toBe(false);
  });

  test('paused contracts and unpaid visits contribute nothing', async ({ page }) => {
    await load(page);
    await seed(page, Object.assign({}, monthlyVisits, { status: 'paused' }));
    await seed(page, { id: 'ct_u', name: 'Unpaid', status: 'active', startDate: '2026-01-01', visits: { freq: 'monthly' } });
    const r = await page.evaluate(async (now) => {
      const totals = ctPendingTotals(ctPendingWork(now));
      const run = await ctRunGeneration(ctPendingWork(now), { now });
      return { totals, created: run.visits + run.invoices, jobs: Object.keys(S.jobs).length };
    }, MARCH);
    expect(r.totals).toEqual({ visits: 0, invoices: 0, addons: 0 });
    expect(r.created).toBe(0);
    expect(r.jobs).toBe(0);
  });
});

test.describe('project companies are untouched', () => {
  test('no generate button, no contract code path', async ({ page }) => {
    await stubExternals(page);
    await page.addInitScript(() => localStorage.setItem('jt_company', 'wfs'));
    await page.goto('/');
    await page.waitForFunction(() => typeof window.renderJobs === 'function');
    const r = await page.evaluate(() => {
      S.view = 'jobs'; render();
      return {
        enabled: ctEnabled(),
        generateBtn: !!document.getElementById('btn-ct-generate'),
        jobs: Object.keys(S.jobs).length,
        jobsRender: document.getElementById('content').innerHTML.length > 0,
      };
    });
    expect(r.enabled).toBe(false);
    expect(r.generateBtn).toBe(false);
    expect(r.jobs).toBe(0);
    expect(r.jobsRender).toBe(true);
  });
});
