// Sample data for trying the maintenance features out.
//
// The scenario has to exercise every state that was built, or it is not worth
// loading: an account that is clearly profitable, one that is not, one that has
// already stopped scheduling, a retainer, and one that was never paid for. If
// every number reads zero it demonstrates nothing.
//
// The other half of these cases is removal. Sample data that cannot be cleanly
// taken out of a real company is worse than no sample data at all.

const { expect, test } = require('@playwright/test');
const { stubExternals } = require('./_stubs');

async function load(page) {
  await stubExternals(page);
  await page.addInitScript(() => {
    localStorage.setItem('jt_company', 'wfs');
    localStorage.setItem('jt_companies', JSON.stringify({
      wfs: { id: 'wfs', ns: 'wfs', label: 'Waterfront Solutions', active: true, type: 'maintenance' },
    }));
  });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.ctLoadSampleData === 'function');
  await page.evaluate(() => {
    S.contracts = {}; S.jobs = {}; S.customers = {}; S.timeEntries = {}; S.payRates = {};
    S.members = []; S.ctDetail = null; S.ctRoute = null; S.ctSearch = '';
    S._ctWired = false; ctSaveContractsLocal();
  });
}

const seed = (page) => page.evaluate(() => ctLoadSampleData());

test.describe('the scenario', () => {
  test('covers every state the features were built for', async ({ page }) => {
    await load(page);
    await seed(page);
    const r = await page.evaluate(() => {
      const byId = id => ctGetContract(ctSampleId('ct', id));
      const state = id => ctRenewalState(byId(id), Date.now()).level;
      return {
        count: ctContractList().length,
        healthy: state('healthy'),
        soon: state('soon'),
        lapsed: state('lapsed'),
        retainer: state('retainer'),
        unpaid: state('unpaid'),
        retainerHasVisits: !!byId('retainer').visits,
        unpaidIssues: ctContractIssues(byId('unpaid')).join(' | '),
      };
    });
    expect(r.count).toBe(5);
    expect(r.healthy).toBe('ok');
    expect(r.soon).toBe('soon');
    expect(r.lapsed).toBe('urgent');
    // A retainer has no visits, so it is never chased about them.
    expect(r.retainer).toBe('none');
    expect(r.retainerHasVisits).toBe(false);
    expect(r.unpaid).toBe('urgent');
    expect(r.unpaidIssues).toContain('none are paid for yet');
  });

  test('the renewal board and its KPI are populated', async ({ page }) => {
    await load(page);
    await seed(page);
    const r = await page.evaluate(() => {
      document.getElementById('content').innerHTML = renderContracts();
      return {
        rows: ctNeedsRenewal(Date.now()).map(x => x.state.level),
        html: document.getElementById('content').innerHTML,
      };
    });
    expect(r.rows).toContain('urgent');
    expect(r.rows).toContain('soon');
    expect(r.html).toContain('Needs Renewing');
    expect(r.html).toContain('STOPPED');
  });

  // Numbers that all read zero demonstrate nothing, so the loader logs hours,
  // materials and part payments.
  test('margins are real, and one account is visibly better than another', async ({ page }) => {
    await load(page);
    await seed(page);
    const r = await page.evaluate(() => {
      const m = id => ctContractCosting(ctGetContract(ctSampleId('ct', id)));
      return { healthy: m('healthy'), soon: m('soon') };
    });
    expect(r.healthy.revenue).toBeGreaterThan(0);
    expect(r.healthy.labor).toBeGreaterThan(0);
    expect(r.healthy.materials).toBeGreaterThan(0);
    expect(r.healthy.outstanding).toBeGreaterThan(0);
    expect(r.healthy.margin).toBeGreaterThan(0);
    // Weekly crews against quarterly billing is the shape that loses money, and
    // the sample should show it rather than making everything look fine.
    expect(r.soon.margin).toBeLessThan(r.healthy.margin);
  });

  test('visits carry checklists, some ticked and some not', async ({ page }) => {
    await load(page);
    await seed(page);
    const r = await page.evaluate(() => {
      const jobs = ctContractJobs(ctSampleId('ct', 'healthy'));
      return {
        haveTasks: jobs.every(j => (j.tasks || []).length > 0),
        anyFullyDone: jobs.some(j => j.tasks.length && j.tasks.every(t => t.done)),
        anyPartlyDone: jobs.some(j => j.tasks.some(t => t.done) && j.tasks.some(t => !t.done)),
        anyUntouched: jobs.some(j => j.tasks.every(t => !t.done)),
        haveDoneBy: jobs.some(j => j.tasks.some(t => t.done && t.doneBy)),
      };
    });
    expect(r.haveTasks).toBe(true);
    expect(r.anyFullyDone).toBe(true);
    expect(r.anyPartlyDone).toBe(true);
    expect(r.anyUntouched).toBe(true);
    expect(r.haveDoneBy).toBe(true);
  });

  test('today has a route, including a job that is not a contract visit', async ({ page }) => {
    await load(page);
    await seed(page);
    const r = await page.evaluate(() => {
      const stops = ctRouteJobs(ctDateKey(new Date()));
      return {
        count: stops.length,
        assigned: stops.filter(j => j.assigned).length,
        withAddress: stops.filter(j => j.address).length,
        hasOneOff: stops.some(j => !j.contractId),
      };
    });
    expect(r.count).toBeGreaterThanOrEqual(2);
    expect(r.assigned).toBeGreaterThan(0);
    expect(r.withAddress).toBeGreaterThan(0);
    expect(r.hasOneOff).toBe(true);
  });

  test('the Generate button still has something to do afterwards', async ({ page }) => {
    await load(page);
    await seed(page);
    const r = await page.evaluate(() => {
      const totals = ctPendingTotals(ctPendingWork(Date.now()));
      return { totals, html: renderContracts() };
    });
    // Both states matter: history to look at, and pending work to try the
    // preview against.
    expect(r.totals.visits + r.totals.invoices).toBeGreaterThan(0);
    expect(r.html).toContain('btn-ct-generate');
  });

  test('invoices exist, are drafts or paid, and none were sent', async ({ page }) => {
    await load(page);
    await seed(page);
    const statuses = await page.evaluate(() => {
      const invs = ['healthy', 'retainer', 'lapsed'].flatMap(id => ctContractInvoices(ctSampleId('ct', id)));
      return { total: invs.length, statuses: [...new Set(invs.map(i => i.status))].sort() };
    });
    expect(statuses.total).toBeGreaterThan(0);
    expect(statuses.statuses).not.toContain('sent');
  });

  test('everything created is recognisably sample data', async ({ page }) => {
    await load(page);
    await seed(page);
    const r = await page.evaluate(() => ({
      contracts: ctContractList().every(c => c.name.startsWith('Sample —')),
      customers: Object.values(S.customers).every(c => c.name.startsWith('Sample —')),
      // Visit jobs carry random ids from the generator; they are sample data
      // because their contract is.
      jobs: Object.values(S.jobs).every(ctIsSampleJob),
      visitJobsFoundByContract: Object.values(S.jobs).some(j => !ctIsSampleId(j.id) && ctIsSampleId(j.contractId)),
      members: S.members.every(m => m.startsWith('Sample —')),
    }));
    expect(r.contracts).toBe(true);
    expect(r.customers).toBe(true);
    expect(r.jobs).toBe(true);
    expect(r.visitJobsFoundByContract).toBe(true);
    expect(r.members).toBe(true);
  });
});

test.describe('removing it', () => {
  test('takes out everything it made and nothing else', async ({ page }) => {
    await load(page);
    // A real contract, a real job, a real customer and a real crew member,
    // created alongside the sample data.
    await page.evaluate(async () => {
      await ctSaveContract({ id: 'ct_mine', name: 'My real contract', status: 'active', startDate: '2026-01-01', billing: { freq: 'monthly', amount: 100 } });
      await writeJob({ id: 'j_mine', name: 'My real job', status: 'active', tasks: [], photos: [], invoices: [] });
      await saveCustomer({ id: 'cus_mine', name: 'My real customer' });
      S.members = (S.members || []).concat(['Real Person']);
      S.payRates['Real Person'] = 60;
      await writeTimeEntry({ id: 't_mine', member: 'Real Person', job: 'j_mine', start: 1, end: 2 });
    });
    await seed(page);
    const before = await page.evaluate(() => ({
      contracts: ctContractList().length,
      // The loader must not have generated anything against the real contract:
      // that would raise draft invoices for a live customer without the
      // preview and confirm that exists to prevent exactly that.
      realAgreementJob: !!S.jobs[ctBillingJobId({ id: 'ct_mine' })],
      realContractJobs: Object.values(S.jobs).filter(j => j.contractId === 'ct_mine').length,
    }));
    expect(before.contracts).toBe(6);
    expect(before.realAgreementJob).toBe(false);
    expect(before.realContractJobs).toBe(0);

    const after = await page.evaluate(async () => {
      const removed = await ctRemoveSampleData();
      return {
        removed,
        contracts: ctContractList().map(c => c.id),
        jobs: Object.keys(S.jobs),
        customers: Object.keys(S.customers),
        members: S.members,
        rates: Object.keys(S.payRates),
        time: Object.keys(S.timeEntries),
        hasSample: ctHasSampleData(),
      };
    });
    expect(after.contracts).toEqual(['ct_mine']);
    expect(after.jobs).toEqual(['j_mine']);
    expect(after.customers).toEqual(['cus_mine']);
    expect(after.members).toEqual(['Real Person']);
    expect(after.rates).toEqual(['Real Person']);
    expect(after.time).toEqual(['t_mine']);
    expect(after.hasSample).toBe(false);
    expect(after.removed.contracts).toBe(5);
    expect(after.removed.jobs).toBeGreaterThan(0);
  });

  test('a second removal is a harmless no-op', async ({ page }) => {
    await load(page);
    await seed(page);
    const r = await page.evaluate(async () => {
      await ctRemoveSampleData();
      const second = await ctRemoveSampleData();
      return { second, hasSample: ctHasSampleData() };
    });
    expect(r.second).toEqual({ contracts: 0, jobs: 0, customers: 0 });
    expect(r.hasSample).toBe(false);
  });

  test('loading twice does not double up', async ({ page }) => {
    await load(page);
    await seed(page);
    const r = await page.evaluate(async () => {
      const first = Object.keys(S.jobs).length;
      await ctLoadSampleData();
      return { first, second: Object.keys(S.jobs).length, contracts: ctContractList().length };
    });
    // Fixed ids and the period keys make a reload idempotent rather than
    // additive, so an accidental second press is survivable.
    expect(r.contracts).toBe(5);
    expect(r.second).toBe(r.first);
  });
});

test.describe('the buttons', () => {
  test('the offer appears only on an empty tab, and loading works end to end', async ({ page }) => {
    await load(page);
    await page.evaluate(() => { S.view = 'contracts'; render(); });
    expect(await page.evaluate(() => !!document.getElementById('btn-ct-sample'))).toBe(true);

    page.on('dialog', d => d.accept());
    await page.click('#btn-ct-sample');
    await page.waitForFunction(() => ctContractList().length === 5);
    const r = await page.evaluate(() => ({
      offer: !!document.getElementById('btn-ct-sample'),
      remove: !!document.getElementById('btn-ct-sample-rm'),
      html: document.getElementById('content').innerHTML,
    }));
    // Once there are contracts the offer is gone; the way out appears instead.
    expect(r.offer).toBe(false);
    expect(r.remove).toBe(true);
    expect(r.html).toContain('Sample — Monthly dock maintenance');
  });

  test('the remove link is absent when there is no sample data', async ({ page }) => {
    await load(page);
    await page.evaluate(async () => {
      await ctSaveContract({ id: 'ct_mine', name: 'My real contract', status: 'active', startDate: '2026-01-01', billing: { freq: 'monthly', amount: 100 } });
      S.view = 'contracts'; render();
    });
    expect(await page.evaluate(() => !!document.getElementById('btn-ct-sample-rm'))).toBe(false);
    // And the offer is gone too, because the tab is no longer empty.
    expect(await page.evaluate(() => !!document.getElementById('btn-ct-sample'))).toBe(false);
  });
});

test.describe('project work is untouched', () => {
  test('a project company has no sample loader at all', async ({ page }) => {
    await stubExternals(page);
    await page.addInitScript(() => localStorage.setItem('jt_company', 'wfs'));
    await page.goto('/');
    await page.waitForFunction(() => typeof window.renderJobs === 'function');
    const r = await page.evaluate(() => {
      S.view = 'jobs'; render();
      return {
        enabled: ctEnabled(),
        button: !!document.getElementById('btn-ct-sample'),
        jobs: Object.keys(S.jobs).length,
        rendered: document.getElementById('content').innerHTML.length > 0,
      };
    });
    expect(r.enabled).toBe(false);
    expect(r.button).toBe(false);
    expect(r.jobs).toBe(0);
    expect(r.rendered).toBe(true);
  });
});
