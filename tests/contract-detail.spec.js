// The contract account page.
//
// The two questions a maintenance business asks daily are "is this account
// making money" and "when does it lapse", and neither could be answered before
// this view existed. These cases lean on the ways an account page misleads:
// showing a margin that is really "we have not billed yet", hiding a lapse that
// has silently stopped the crews, or rolling up the wrong jobs.

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
  await page.waitForFunction(() => typeof window.renderContractDetail === 'function');
  await page.evaluate(() => {
    S.contracts = {}; S.jobs = {}; S.customers = {}; S.ctDetail = null; S.ctSearch = '';
    S.timeEntries = {}; S.payRates = {}; S.receipts = {}; S._ctWired = false;
    ctSaveContractsLocal();
  });
}

const base = {
  id: 'ct_a', name: 'Dock maintenance', status: 'active', startDate: '2026-01-01',
  visits: { freq: 'monthly' }, visitsThrough: '2026-06-01',
  billing: { freq: 'monthly', amount: 500 },
};

async function seedAndGenerate(page, over) {
  await page.evaluate(async (args) => {
    await ctSaveContract(Object.assign({}, args.base, args.over || {}));
    await ctRunGeneration(ctPendingWork(args.now), { now: args.now });
  }, { base, over, now: MARCH });
}

const detail = (page, id) => page.evaluate((args) =>
  renderContractDetail(args.id || 'ct_a', args.now), { id, now: MARCH });

test.describe('rolling up the account', () => {
  test('gathers only this contract\'s visits, excluding the Agreement job', async ({ page }) => {
    await load(page);
    await seedAndGenerate(page);
    // A second contract and a hand-made job must not bleed into the roll-up.
    await page.evaluate(async (now) => {
      await ctSaveContract({ id: 'ct_other', name: 'Other', status: 'active', startDate: '2026-01-01', visits: { freq: 'monthly' }, visitsThrough: '2026-06-01' });
      await ctRunGeneration(ctPendingWork(now), { now });
      await writeJob({ id: 'j_manual', name: 'One-off repair', status: 'active', invoices: [], photos: [] });
    }, MARCH);
    const r = await page.evaluate(() => ({
      mine: ctContractJobs('ct_a').map(j => j.name),
      hasAgreement: ctContractJobs('ct_a').some(j => j.id === ctBillingJobId({ id: 'ct_a' })),
      invoices: ctContractInvoices('ct_a').length,
      otherInvoices: ctContractInvoices('ct_other').length,
    }));
    expect(r.mine).toEqual([
      'Dock maintenance — Jan 2026', 'Dock maintenance — Feb 2026', 'Dock maintenance — Mar 2026',
      'Dock maintenance — Apr 2026', 'Dock maintenance — May 2026', 'Dock maintenance — Jun 2026',
    ]);
    // The Agreement job holds invoices; it is not a visit.
    expect(r.hasAgreement).toBe(false);
    expect(r.invoices).toBe(3);
    expect(r.otherInvoices).toBe(0);
  });

  // Per-job costing cannot answer this: every visit has cost and no revenue,
  // the Agreement job has all the revenue and no cost. Only the account total
  // is meaningful.
  test('adds revenue and cost across the whole account', async ({ page }) => {
    await load(page);
    await seedAndGenerate(page);
    const r = await page.evaluate(() => {
      const jobs = ctContractJobs('ct_a');
      // Two hours of labour at $50 on the first visit, plus a receipt.
      S.members = ['Dale'];
      S.payRates = { Dale: 50 };
      S.timeEntries = { t1: { id: 't1', member: 'Dale', job: jobs[0].id, start: 1, end: 1 + 2 * 3600000 } };
      // receiptTotal() reads receipts off the job, the same way job costing does.
      jobs[1].receipts = [{ id: 'r1', amount: 120, category: 'Materials' }];
      jobs[2].costs = 80;
      return ctContractCosting(ctGetContract('ct_a'));
    });
    expect(r.revenue).toBe(1500);
    expect(r.labor).toBe(100);
    expect(r.materials).toBe(120);
    expect(r.other).toBe(80);
    expect(r.cost).toBe(300);
    expect(r.profit).toBe(1200);
    expect(r.margin).toBeCloseTo(80, 5);
    expect(r.visitCount).toBe(6);
    expect(r.invoiceCount).toBe(3);
  });

  test('reports what is still outstanding', async ({ page }) => {
    await load(page);
    await seedAndGenerate(page);
    const r = await page.evaluate(() => {
      const job = S.jobs[ctBillingJobId({ id: 'ct_a' })];
      job.invoices[0].paid = 500;
      return ctContractCosting(ctGetContract('ct_a'));
    });
    expect(r.revenue).toBe(1500);
    expect(r.collected).toBe(500);
    expect(r.outstanding).toBe(1000);
  });
});

test.describe('margin', () => {
  // "-100%" on an account that simply has not been invoiced yet trains people
  // to ignore the number, so it is left unstated instead.
  test('is unstated rather than catastrophic before anything is billed', async ({ page }) => {
    await load(page);
    await seedAndGenerate(page, { billing: null });
    const r = await page.evaluate(() => {
      const jobs = ctContractJobs('ct_a');
      S.members = ['Dale']; S.payRates = { Dale: 50 };
      S.timeEntries = { t1: { id: 't1', member: 'Dale', job: jobs[0].id, start: 1, end: 1 + 4 * 3600000 } };
      const m = ctContractCosting(ctGetContract('ct_a'));
      return { margin: m.margin, cost: m.cost, revenue: m.revenue, flagged: m.hasCostWithoutRevenue, html: renderContractDetail('ct_a') };
    });
    expect(r.margin).toBeNull();
    expect(r.cost).toBe(200);
    expect(r.revenue).toBe(0);
    expect(r.flagged).toBe(true);
    expect(r.html).toContain('—');
    expect(r.html).toContain('spent, nothing billed');
  });

  test('a loss-making account reads as one', async ({ page }) => {
    await load(page);
    await seedAndGenerate(page, { billing: { freq: 'annual', amount: 300 } });
    const html = await page.evaluate(() => {
      const jobs = ctContractJobs('ct_a');
      S.members = ['Dale']; S.payRates = { Dale: 50 };
      S.timeEntries = { t1: { id: 't1', member: 'Dale', job: jobs[0].id, start: 1, end: 1 + 20 * 3600000 } };
      return renderContractDetail('ct_a');
    });
    // $300 billed against $1,000 of labour.
    expect(html).toContain('-233%');
    expect(html).toContain('var(--orange)');
  });

  test('the cost breakdown says why, not just how much', async ({ page }) => {
    await load(page);
    await seedAndGenerate(page);
    const html = await page.evaluate(() => {
      const jobs = ctContractJobs('ct_a');
      S.members = ['Dale']; S.payRates = { Dale: 50 };
      S.timeEntries = { t1: { id: 't1', member: 'Dale', job: jobs[0].id, start: 1, end: 1 + 3 * 3600000 } };
      jobs[0].receipts = [{ id: 'r1', amount: 45, category: 'Materials' }];
      return renderContractDetail('ct_a');
    });
    expect(html).toContain('$150.00 labour');
    expect(html).toContain('$45.00 materials');
  });
});

test.describe('renewal', () => {
  test('a healthy contract shows days remaining and no banner', async ({ page }) => {
    await load(page);
    await seedAndGenerate(page, { visitsThrough: '2026-12-01' });
    const r = await page.evaluate((now) => {
      const state = ctRenewalState(ctGetContract('ct_a'), now);
      return { level: state.level, days: state.paidDays, html: renderContractDetail('ct_a', now) };
    }, MARCH);
    expect(r.level).toBe('ok');
    expect(r.days).toBe(261);
    expect(r.html).toContain('261 days');
    expect(r.html).not.toContain('Needs renewing');
  });

  // Visits stop when prepayment runs out, by design. Without this the crews
  // simply stop being booked and nothing says so.
  test('a lapsed contract is called out loudly', async ({ page }) => {
    await load(page);
    await seedAndGenerate(page, { visitsThrough: '2026-02-01' });
    const r = await page.evaluate((now) => {
      const state = ctRenewalState(ctGetContract('ct_a'), now);
      return { level: state.level, message: state.message, html: renderContractDetail('ct_a', now) };
    }, MARCH);
    expect(r.level).toBe('urgent');
    expect(r.message).toContain('42 days ago');
    expect(r.html).toContain('Needs renewing');
    expect(r.html).toContain('Visits paid through');
  });

  test('an approaching lapse warns before it happens', async ({ page }) => {
    await load(page);
    await seedAndGenerate(page, { visitsThrough: '2026-04-01' });
    const r = await page.evaluate((now) => {
      const s = ctRenewalState(ctGetContract('ct_a'), now);
      return { level: s.level, message: s.message, html: renderContractDetail('ct_a', now) };
    }, MARCH);
    expect(r.level).toBe('soon');
    expect(r.message).toContain('17 days');
    expect(r.html).toContain('Renewal coming up');
  });

  test('a contract with no prepayment recorded is urgent', async ({ page }) => {
    await load(page);
    await seedAndGenerate(page, { visitsThrough: '' });
    const r = await page.evaluate((now) => ctRenewalState(ctGetContract('ct_a'), now), MARCH);
    expect(r.level).toBe('urgent');
    expect(r.message).toContain('No visits are paid for');
  });

  test('an agreement ending soon warns even when visits are paid up', async ({ page }) => {
    await load(page);
    await seedAndGenerate(page, { visitsThrough: '2026-12-01', endDate: '2026-04-20' });
    const r = await page.evaluate((now) => ctRenewalState(ctGetContract('ct_a'), now), MARCH);
    expect(r.level).toBe('soon');
    expect(r.message).toContain('agreement ends in 36 days');
  });

  test('a billing-only contract is not nagged about visits', async ({ page }) => {
    await load(page);
    await seedAndGenerate(page, { visits: null, visitsThrough: '' });
    const r = await page.evaluate((now) => ({
      level: ctRenewalState(ctGetContract('ct_a'), now).level,
      html: renderContractDetail('ct_a', now),
    }), MARCH);
    expect(r.level).toBe('none');
    expect(r.html).toContain('no visit schedule');
    expect(r.html).not.toContain('Needs renewing');
  });
});

test.describe('the page', () => {
  test('lists visits with what was logged against each', async ({ page }) => {
    await load(page);
    await seedAndGenerate(page);
    const html = await page.evaluate(() => {
      const jobs = ctContractJobs('ct_a');
      S.members = ['Dale']; S.payRates = { Dale: 50 };
      S.timeEntries = { t1: { id: 't1', member: 'Dale', job: jobs[0].id, start: 1, end: 1 + 2 * 3600000 } };
      return renderContractDetail('ct_a');
    });
    expect(html).toContain('Dock maintenance — Jan 2026');
    expect(html).toContain('2.0h');
    expect(html).toContain('$100.00 labour');
    // A past visit with nothing logged should say so rather than look complete.
    expect(html).toContain('nothing logged');
  });

  test('lists invoices with their balance', async ({ page }) => {
    await load(page);
    await seedAndGenerate(page);
    const html = await page.evaluate(() => {
      S.jobs[ctBillingJobId({ id: 'ct_a' })].invoices[0].paid = 500;
      return renderContractDetail('ct_a');
    });
    expect(html).toContain('$500.00');
    expect(html).toContain('paid');
    expect(html).toContain('due');
  });

  test('an empty contract explains what to do next', async ({ page }) => {
    await load(page);
    await page.evaluate(async (c) => { await ctSaveContract(c); }, base);
    const html = await detail(page);
    expect(html).toContain('No visits created yet');
    expect(html).toContain('Generate');
    expect(html).toContain('No invoices raised yet');
  });

  test('a deleted contract does not blow up the view', async ({ page }) => {
    await load(page);
    const html = await page.evaluate(() => renderContractDetail('ct_gone'));
    expect(html).toContain('no longer exists');
  });

  test('untrusted names are escaped', async ({ page }) => {
    await load(page);
    await page.evaluate(async () => {
      await ctSaveContract({ id: 'ct_x', name: '<img src=x onerror=alert(1)>', status: 'paused', startDate: '2026-01-01' });
      document.getElementById('content').innerHTML = renderContractDetail('ct_x');
    });
    const imgs = await page.evaluate(() => document.querySelectorAll('#content img').length);
    expect(imgs).toBe(0);
  });
});

test.describe('navigation', () => {
  test('a card opens the account page, and back returns to the list', async ({ page }) => {
    await load(page);
    await seedAndGenerate(page);
    await page.evaluate(() => { S.view = 'contracts'; render(); });
    await page.click('[data-ct="ct_a"]');
    let r = await page.evaluate(() => ({
      detail: S.ctDetail,
      html: document.getElementById('content').innerHTML,
    }));
    expect(r.detail).toBe('ct_a');
    expect(r.html).toContain('Renewal');
    expect(r.html).toContain('All contracts');

    await page.click('[data-ct-back]');
    r = await page.evaluate(() => ({ detail: S.ctDetail, html: document.getElementById('content').innerHTML }));
    expect(r.detail).toBeNull();
    expect(r.html).toContain('Add Contract');
  });

  test('Edit opens the editor from the account page', async ({ page }) => {
    await load(page);
    await seedAndGenerate(page);
    await page.evaluate(() => { S.view = 'contracts'; render(); });
    await page.click('[data-ct="ct_a"]');
    await page.click('#btn-ct-edit');
    const name = await page.evaluate(() => document.getElementById('ct-name').value);
    expect(name).toBe('Dock maintenance');
  });

  test('deleting from the account page returns to the list', async ({ page }) => {
    await load(page);
    await seedAndGenerate(page);
    await page.evaluate(() => { S.view = 'contracts'; render(); });
    page.on('dialog', d => d.accept());
    await page.click('[data-ct="ct_a"]');
    await page.click('#btn-ct-edit');
    await page.click('#ct-del');
    const r = await page.evaluate(() => ({ detail: S.ctDetail, html: document.getElementById('content').innerHTML }));
    expect(r.detail).toBeNull();
    expect(r.html).toContain('Add Contract');
  });

  test('a visit row opens that job through the app\'s own handler', async ({ page }) => {
    await load(page);
    await seedAndGenerate(page);
    await page.evaluate(() => { S.view = 'contracts'; render(); });
    await page.click('[data-ct="ct_a"]');
    await page.click('[data-open]');
    const r = await page.evaluate(() => ({ view: S.view, detail: S.detail }));
    expect(r.view).toBe('jobs');
    expect(r.detail).toBeTruthy();
  });
});

test.describe('project work is untouched', () => {
  test('a project company sees no contracts and its views still render', async ({ page }) => {
    await stubExternals(page);
    await page.addInitScript(() => localStorage.setItem('jt_company', 'wfs'));
    await page.goto('/');
    await page.waitForFunction(() => typeof window.renderJobs === 'function');
    const r = await page.evaluate(() => {
      const out = {};
      ['dashboard', 'jobs', 'customers', 'schedule', 'invoices'].forEach(v => {
        S.view = v; render();
        out[v] = document.getElementById('content').innerHTML.length > 0;
      });
      return { views: out, enabled: ctEnabled(), ctDetail: S.ctDetail };
    });
    expect(Object.values(r.views).every(Boolean)).toBe(true);
    expect(r.enabled).toBe(false);
    expect(r.ctDetail).toBeFalsy();
  });
});
