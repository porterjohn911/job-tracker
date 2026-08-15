// Visits are scheduled only as far as the customer has paid.
//
// A visit exists because someone paid for it, not because a rolling window
// moved forward. Each contract carries visitsThrough — the date the customer's
// prepayment covers — and that date is the only thing that lets a visit be
// scheduled ahead. Renewal is pushing the date out; idempotency means the
// visits already created are not duplicated.
//
// The failure this guards against is booking crews for work nobody paid for,
// and its mirror: a contract that reads "Active" but silently stopped
// scheduling because the prepaid period quietly ran out.

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
  await page.waitForFunction(() => typeof window.renderContracts === 'function');
  await page.evaluate(() => { S.contracts = {}; S.ctSearch = ''; S._ctWired = false; ctSaveContractsLocal(); });
}

const monthly = (over) => Object.assign({
  id: 'ct_a', name: 'Dock maintenance', status: 'active',
  startDate: '2026-01-01', visits: { freq: 'monthly' },
}, over || {});

test.describe('nothing paid, nothing scheduled', () => {
  test('no paid-through date means no visits at all', async ({ page }) => {
    await load(page);
    const r = await page.evaluate((args) => {
      const c = ctNormalizeContract(args.c);
      return {
        limit: ctVisitLimit(c),
        periods: ctVisitPeriods(c, args.now).length,
        planned: ctPlan(c, { now: args.now }).visits.length,
      };
    }, { c: monthly(), now: MARCH });
    expect(r.limit).toBe('');
    expect(r.periods).toBe(0);
    expect(r.planned).toBe(0);
  });

  // Overdue visits are not an exception. If the prepaid period lapsed, the
  // contract stops scheduling rather than quietly catching up on unpaid work.
  test('overdue visits are not generated for an unpaid contract', async ({ page }) => {
    await load(page);
    const r = await page.evaluate((args) => {
      const c = ctNormalizeContract(args.c);
      return { billing: ctPlan(c, { now: args.now }).billing.length, visits: ctPlan(c, { now: args.now }).visits.length };
    }, { c: monthly({ billing: { freq: 'monthly', amount: 300 } }), now: MARCH });
    // Billing still catches up — that is independent and unchanged.
    expect(r.billing).toBe(3);
    expect(r.visits).toBe(0);
  });

  test('the issue is surfaced rather than left silent', async ({ page }) => {
    await load(page);
    const issues = await page.evaluate((c) => ctContractIssues(c).join(' | '), monthly());
    expect(issues).toContain('none are paid for yet');
  });
});

test.describe('paid through a date', () => {
  test('generates exactly the visits inside the paid period', async ({ page }) => {
    await load(page);
    const r = await page.evaluate((args) => {
      const c = ctNormalizeContract(args.c);
      return ctVisitPeriods(c, args.now).map(p => p.dateKey);
    }, { c: monthly({ visitsThrough: '2026-06-01' }), now: MARCH });
    expect(r).toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01']);
  });

  test('a year prepaid on a monthly contract is twelve visits', async ({ page }) => {
    await load(page);
    const n = await page.evaluate((args) => ctVisitPeriods(ctNormalizeContract(args.c), args.now).length,
      { c: monthly({ visitsThrough: '2026-12-01' }), now: MARCH });
    expect(n).toBe(12);
  });

  // A paid-through date in the past still owes those visits — the work was
  // bought. It must not be read as "generate up to today" either way.
  test('a lapsed date still covers the visits it paid for, and no more', async ({ page }) => {
    await load(page);
    const r = await page.evaluate((args) => {
      const c = ctNormalizeContract(args.c);
      return {
        keys: ctVisitPeriods(c, args.now).map(p => p.dateKey),
        next: ctNextDate(c, 'visit', args.now),
      };
    }, { c: monthly({ visitsThrough: '2026-02-01' }), now: MARCH });
    expect(r.keys).toEqual(['2026-01-01', '2026-02-01']);
    // Nothing ahead is promised once the prepaid period has run out.
    expect(r.next).toBeNull();
  });

  test('the contract end date still wins when it comes first', async ({ page }) => {
    await load(page);
    const keys = await page.evaluate((args) => ctVisitPeriods(ctNormalizeContract(args.c), args.now).map(p => p.dateKey),
      { c: monthly({ visitsThrough: '2026-12-01', endDate: '2026-04-15' }), now: MARCH });
    expect(keys).toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01']);
  });

  test('paying through a date before the first visit yields nothing, and says why', async ({ page }) => {
    await load(page);
    const r = await page.evaluate((args) => {
      const c = ctNormalizeContract(args.c);
      return { periods: ctVisitPeriods(c, args.now).length, issues: ctContractIssues(c).join(' | ') };
    }, { c: monthly({ startDate: '2026-06-01', visitsThrough: '2026-03-01' }), now: MARCH });
    expect(r.periods).toBe(0);
    expect(r.issues).toContain('before the contract starts');
  });
});

test.describe('renewal', () => {
  // The whole point of the period keys: extending the paid-through date must
  // add only the newly paid visits, never re-create the ones already scheduled.
  test('pushing the date out adds only the new visits', async ({ page }) => {
    await load(page);
    const r = await page.evaluate((args) => {
      const first = ctNormalizeContract(Object.assign({}, args.c, { visitsThrough: '2026-06-01' }));
      const planned = ctPlan(first, { now: args.now }).visits;
      // Pretend the run created them.
      const created = ctExistingKeys(planned.map(p => ({ periodKey: p.key })));

      const renewed = ctNormalizeContract(Object.assign({}, args.c, { visitsThrough: '2026-12-01' }));
      const after = ctPlan(renewed, { now: args.now, existingJobKeys: created });
      const rerun = ctPlan(first, { now: args.now, existingJobKeys: created });
      return { firstCount: planned.length, added: after.visits.map(p => p.dateKey), rerun: rerun.visits.length };
    }, { c: monthly(), now: MARCH });
    expect(r.firstCount).toBe(6);
    expect(r.added).toEqual(['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01']);
    expect(r.rerun).toBe(0);
  });

  test('shortening the date does not un-create anything, it just stops adding', async ({ page }) => {
    await load(page);
    const r = await page.evaluate((args) => {
      const full = ctNormalizeContract(Object.assign({}, args.c, { visitsThrough: '2026-12-01' }));
      const created = ctExistingKeys(ctPlan(full, { now: args.now }).visits.map(p => ({ periodKey: p.key })));
      const shortened = ctNormalizeContract(Object.assign({}, args.c, { visitsThrough: '2026-04-01' }));
      return ctPlan(shortened, { now: args.now, existingJobKeys: created }).visits.length;
    }, { c: monthly(), now: MARCH });
    expect(r).toBe(0);
  });
});

test.describe('what the user sees', () => {
  test('the card counts the visits remaining in the paid period', async ({ page }) => {
    await load(page);
    await page.evaluate(async (c) => { await ctSaveContract(c); }, monthly({ visitsThrough: '2026-08-01' }));
    const html = await page.evaluate((now) => renderContracts(now), MARCH);
    // Apr, May, Jun, Jul, Aug remain after Mar 15.
    expect(html).toContain('5 visits paid through');
  });

  test('a lapsed contract says renew instead of showing a next visit', async ({ page }) => {
    await load(page);
    await page.evaluate(async (c) => { await ctSaveContract(c); }, monthly({ visitsThrough: '2026-02-01' }));
    const html = await page.evaluate((now) => renderContracts(now), MARCH);
    expect(html).toContain('renew to keep scheduling');
    expect(html).not.toContain('Next visit');
  });

  test('the KPI only counts visits that will actually be created', async ({ page }) => {
    await load(page);
    await page.evaluate(async () => {
      await ctSaveContract({ id: 'ct_paid', name: 'Paid', status: 'active', startDate: '2026-01-01', visits: { freq: 'weekly' }, visitsThrough: '2026-12-01' });
      await ctSaveContract({ id: 'ct_unpaid', name: 'Unpaid', status: 'active', startDate: '2026-01-01', visits: { freq: 'weekly' } });
    });
    const values = await page.evaluate((now) => {
      document.getElementById('content').innerHTML = renderContracts(now);
      return [...document.querySelectorAll('#content .kpi-value')].map(el => el.textContent.trim());
    }, MARCH);
    // Four weekly visits ahead in 30 days, from the paid contract only.
    expect(values[1]).toBe('4');
  });

  test('the editor shows what a date buys before anything is saved', async ({ page }) => {
    await load(page);
    await page.evaluate(async (c) => { await ctSaveContract(c); }, monthly({ visitsThrough: '2026-06-01' }));
    await page.evaluate(() => { document.getElementById('content').innerHTML = renderContracts(); attachContractHandlers(); });
    await page.click('[data-ct="ct_a"]');
    const before = await page.evaluate(() => document.getElementById('ct-visits-count').textContent);
    expect(before).toContain('6 visits');
    expect(before).toContain('2026-01-01 through 2026-06-01');

    // Extending the date updates the count live, without saving.
    await page.fill('#ct-visits-through', '2026-12-01');
    await page.dispatchEvent('#ct-visits-through', 'change');
    const after = await page.evaluate(() => document.getElementById('ct-visits-count').textContent);
    expect(after).toContain('12 visits');
  });

  test('the field round-trips through save', async ({ page }) => {
    await load(page);
    await page.evaluate(() => { document.getElementById('content').innerHTML = renderContracts(); attachContractHandlers(); });
    await page.click('#btn-ct-add');
    await page.fill('#ct-name', 'Prepaid dock care');
    await page.selectOption('#ct-visit-freq', 'monthly');
    await page.fill('#ct-start', '2026-04-01');
    await page.fill('#ct-visits-through', '2027-03-01');
    await page.selectOption('#ct-status', 'active');
    await page.click('#ct-save');
    const r = await page.evaluate(() => {
      const c = ctContractList()[0];
      return { through: c.visitsThrough, count: ctVisitPeriods(c, new Date(2026, 3, 1).getTime()).length };
    });
    expect(r.through).toBe('2027-03-01');
    expect(r.count).toBe(12);
  });
});

test.describe('billing is unaffected', () => {
  test('a retainer with no visit schedule still bills', async ({ page }) => {
    await load(page);
    const r = await page.evaluate((now) => {
      const c = ctNormalizeContract({ id: 'ct_r', name: 'Retainer', status: 'active', startDate: '2026-01-01', billing: { freq: 'monthly', amount: 500 } });
      const plan = ctPlan(c, { now });
      return { billing: plan.billing.length, visits: plan.visits.length, paidThrough: plan.paidThrough };
    }, MARCH);
    expect(r.billing).toBe(3);
    expect(r.visits).toBe(0);
    expect(r.paidThrough).toBe('');
  });

  test('prepaid visits do not stop billing catching up', async ({ page }) => {
    await load(page);
    const r = await page.evaluate((args) => {
      const c = ctNormalizeContract(Object.assign({}, args.c, { visitsThrough: '2026-04-01', billing: { freq: 'monthly', amount: 300 } }));
      const plan = ctPlan(c, { now: args.now });
      return { visits: plan.visits.length, billing: plan.billing.length };
    }, { c: monthly(), now: MARCH });
    expect(r.visits).toBe(4);
    expect(r.billing).toBe(3);
  });
});
