// The recurring revenue book.
//
// A book of weekly, quarterly and annual agreements has no comparable numbers
// in it until they are all normalized to a month, and every way of doing that
// arithmetic wrong flatters the total. These cases lean on the flattering
// mistakes: a four-week month, add-ons counted as recurring, margin computed by
// dividing a partial cost by the whole book, a paused contract counted as live,
// and a truncated chart baseline.

const { expect, test } = require('@playwright/test');
const { stubExternals } = require('./_stubs');

// Mid-month so month arithmetic never lands on a boundary by luck.
const NOW = new Date(2026, 5, 15).getTime(); // 15 Jun 2026

async function load(page) {
  await stubExternals(page);
  await page.addInitScript(() => {
    localStorage.setItem('jt_company', 'wfs');
    localStorage.setItem('jt_companies', JSON.stringify({
      wfs: { id: 'wfs', ns: 'wfs', label: 'Waterfront Solutions', active: true, type: 'maintenance' },
    }));
  });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.ctRevenueBook === 'function');
  await page.evaluate(() => {
    S.contracts = {}; S.jobs = {}; S.customers = {}; S.timeEntries = {}; S.payRates = {};
    S.members = []; S.ctDetail = null; S.ctRoute = null; S.ctRevenue = false; S.ctSearch = '';
    S._ctWired = false;
    ctSaveContractsLocal();
  });
}

async function put(page, contracts, customers) {
  await page.evaluate(async (a) => {
    for (const c of a.customers || []) await saveCustomer(c);
    for (const c of a.contracts) await ctSaveContract(c);
  }, { contracts, customers: customers || [] });
}

const live = over => Object.assign({
  id: 'ct_x', name: 'Contract', status: 'active', startDate: '2026-01-01',
  visits: { freq: 'monthly' }, visitsThrough: '2027-01-01',
  billing: { freq: 'monthly', amount: 600 },
}, over);

test.describe('normalizing to a month', () => {
  // The four-week month is the classic way a recurring book overstates itself.
  // $100 weekly is $433.33 a month, not $400.
  test('a weekly contract is worth 52/12 of its amount, not four weeks', async ({ page }) => {
    await load(page);
    const v = await page.evaluate(() => ctMonthlyValue({ billing: { freq: 'weekly', amount: 100 } }));
    expect(v).toBeCloseTo(433.333, 2);
    expect(v).not.toBeCloseTo(400, 1);
  });

  test('every frequency lands on the same monthly footing', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => ({
      biweekly: ctMonthlyValue({ billing: { freq: 'biweekly', amount: 200 } }),
      monthly: ctMonthlyValue({ billing: { freq: 'monthly', amount: 650 } }),
      quarterly: ctMonthlyValue({ billing: { freq: 'quarterly', amount: 1800 } }),
      annual: ctMonthlyValue({ billing: { freq: 'annual', amount: 2400 } }),
      everyTwoMonths: ctMonthlyValue({ billing: { freq: 'monthly', interval: 2, amount: 400 } }),
    }));
    expect(r.biweekly).toBeCloseTo(433.333, 2);
    expect(r.monthly).toBe(650);
    expect(r.quarterly).toBe(600);
    expect(r.annual).toBe(200);
    expect(r.everyTwoMonths).toBe(200);
  });

  test('no billing schedule is worth nothing, not NaN', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => [
      ctMonthlyValue({ billing: null }),
      ctMonthlyValue({}),
      ctMonthlyValue(null),
      ctMonthlyValue({ billing: { freq: 'monthly' } }),
    ]);
    expect(r).toEqual([0, 0, 0, 0]);
  });
});

test.describe('the book', () => {
  test('adds only active contracts, and keeps paused ones aside', async ({ page }) => {
    await load(page);
    await put(page, [
      live({ id: 'ct_a', billing: { freq: 'monthly', amount: 650 } }),
      live({ id: 'ct_b', billing: { freq: 'quarterly', amount: 1800 } }),
      live({ id: 'ct_c', status: 'paused', billing: { freq: 'monthly', amount: 500 } }),
      live({ id: 'ct_d', status: 'ended', billing: { freq: 'monthly', amount: 900 } }),
    ]);
    const b = await page.evaluate(n => ctRevenueBook(n), NOW);
    expect(b.mrr).toBeCloseTo(1250, 5);
    expect(b.arr).toBeCloseTo(15000, 5);
    expect(b.activeCount).toBe(2);
    expect(b.pausedMrr).toBe(500);
    expect(b.pausedCount).toBe(1);
  });

  // Counting a one-off callout as recurring is how a book gets valued on
  // revenue that will not be there next year.
  test('add-ons are counted, and kept out of the recurring figure', async ({ page }) => {
    await load(page);
    await put(page, [live({
      id: 'ct_a',
      addons: {
        ad_1: { id: 'ad_1', desc: 'Storm callout', amount: 450, date: '2026-05-02' },
        ad_2: { id: 'ad_2', desc: 'Old one', amount: 999, date: '2024-01-02' },
      },
    })]);
    const b = await page.evaluate(n => ctRevenueBook(n), NOW);
    expect(b.mrr).toBe(600);
    expect(b.addons12).toBe(450);
    expect(b.arr).toBe(7200);
  });
});

test.describe('book margin', () => {
  test('is computed over the priced slice only, and says how much that is', async ({ page }) => {
    await load(page);
    await put(page, [
      // Priced: 2h at $50 = $100 a visit, monthly visits = $100/mo of cost
      // against $600 of revenue.
      live({ id: 'ct_a', pricing: { hoursPerVisit: 2, crewRate: 50, driveMinutes: 0, materialsPerVisit: 0, targetMargin: 40 } }),
      // Unpriced, same revenue.
      live({ id: 'ct_b', pricing: null }),
    ]);
    const b = await page.evaluate(n => ctRevenueBook(n), NOW);
    expect(b.mrr).toBe(1200);
    expect(b.costedMrr).toBe(600);
    expect(b.uncostedMrr).toBe(600);
    expect(b.coverage).toBeCloseTo(50, 5);
    expect(b.cost).toBeCloseTo(100, 5);
    // (600 - 100) / 600, NOT (1200 - 100) / 1200 — dividing a half-book cost by
    // the whole book's revenue would report 92% and invent margin out of
    // contracts nobody has priced.
    expect(b.margin).toBeCloseTo(83.333, 2);
    expect(b.margin).not.toBeCloseTo(91.667, 1);
  });

  test('an entirely unpriced book has no margin rather than a perfect one', async ({ page }) => {
    await load(page);
    await put(page, [live({ id: 'ct_a', pricing: null })]);
    const b = await page.evaluate(n => ctRevenueBook(n), NOW);
    expect(b.margin).toBeNull();
    expect(b.coverage).toBe(0);
  });

  // The estimate is what someone hoped; enough logged visits are what happened.
  test('actuals replace the estimate once there are three measured visits', async ({ page }) => {
    await load(page);
    await put(page, [live({ id: 'ct_a', startDate: '2026-01-01', visitsThrough: '2026-06-01',
      pricing: { hoursPerVisit: 2, crewRate: 50, driveMinutes: 0, materialsPerVisit: 0, targetMargin: 40 } })]);
    await page.evaluate(async (n) => { await ctRunGeneration(ctPendingWork(n), { now: n }); }, NOW);

    const before = await page.evaluate(n => ctRevenueBook(n), NOW);
    expect(before.rows[0].basis).toBe('estimate');
    expect(before.cost).toBeCloseTo(100, 5);

    // Three visits at 4h and $50/hr = $200 a visit.
    await page.evaluate(() => {
      const jobs = ctContractJobs('ct_a');
      S.members = ['Dale']; S.payRates = { Dale: 50 };
      const e = {};
      for (let i = 0; i < 3; i++) e['t' + i] = { id: 't' + i, member: 'Dale', job: jobs[i].id, start: 1, end: 1 + 4 * 3600000 };
      S.timeEntries = e;
    });
    const after = await page.evaluate(n => ctRevenueBook(n), NOW);
    expect(after.rows[0].basis).toBe('actual');
    expect(after.cost).toBeCloseTo(200, 5);
  });

  test('two measured visits are too thin to displace the estimate', async ({ page }) => {
    await load(page);
    await put(page, [live({ id: 'ct_a', startDate: '2026-01-01', visitsThrough: '2026-06-01',
      pricing: { hoursPerVisit: 2, crewRate: 50, driveMinutes: 0, materialsPerVisit: 0, targetMargin: 40 } })]);
    await page.evaluate(async (n) => { await ctRunGeneration(ctPendingWork(n), { now: n }); }, NOW);
    await page.evaluate(() => {
      const jobs = ctContractJobs('ct_a');
      S.members = ['Dale']; S.payRates = { Dale: 50 };
      S.timeEntries = {
        t0: { id: 't0', member: 'Dale', job: jobs[0].id, start: 1, end: 1 + 9 * 3600000 },
        t1: { id: 't1', member: 'Dale', job: jobs[1].id, start: 1, end: 1 + 9 * 3600000 },
      };
    });
    const b = await page.evaluate(n => ctRevenueBook(n), NOW);
    expect(b.rows[0].basis).toBe('estimate');
    expect(b.cost).toBeCloseTo(100, 5);
  });

  // The index exists so a book roll-up does not rescan every time entry once
  // per job. It must agree with the function it replaces, exactly.
  test('the labour index agrees with jobLaborStats', async ({ page }) => {
    await load(page);
    await put(page, [live({ id: 'ct_a', startDate: '2026-01-01', visitsThrough: '2026-06-01' })]);
    await page.evaluate(async (n) => { await ctRunGeneration(ctPendingWork(n), { now: n }); }, NOW);
    const r = await page.evaluate(() => {
      const jobs = ctContractJobs('ct_a');
      S.members = ['Dale', 'Rick']; S.payRates = { Dale: 50, Rick: 40 };
      S.timeEntries = {
        t0: { id: 't0', member: 'Dale', job: jobs[0].id, start: 1, end: 1 + 3 * 3600000 },
        t1: { id: 't1', member: 'Rick', job: jobs[0].id, start: 1, end: 1 + 2 * 3600000 },
        t2: { id: 't2', member: 'Dale', job: jobs[1].id, start: 1, end: 1 + 1.5 * 3600000 },
      };
      const index = ctLaborIndex();
      return jobs.slice(0, 3).map(j => ({
        direct: jobLaborStats(j.id),
        indexed: index[j.id] || { hours: 0, cost: 0 },
      }));
    });
    r.forEach(({ direct, indexed }) => {
      expect(indexed.hours).toBeCloseTo(direct.hours, 6);
      expect(indexed.cost).toBeCloseTo(direct.cost, 6);
    });
    expect(r[0].direct.cost).toBeCloseTo(230, 5);
  });
});

test.describe('churn risk', () => {
  // Visits stop at the prepaid date; billing does not. A contract in that state
  // is invoicing for work nobody is doing, and the customer notices first.
  test('a lapsed contract that is still billing is called out as its own thing', async ({ page }) => {
    await load(page);
    await put(page, [live({ id: 'ct_a', visitsThrough: '2026-04-01' })]);
    const b = await page.evaluate(n => ctRevenueBook(n), NOW);
    expect(b.atRisk).toHaveLength(1);
    expect(b.atRisk[0].risk.level).toBe('billing-unworked');
    expect(b.atRisk[0].risk.reason).toContain('still billing');
    expect(b.billingUnworked).toHaveLength(1);
    expect(b.atRiskMrr).toBe(600);
  });

  test('prepayment running out soon is a warning, not an alarm', async ({ page }) => {
    await load(page);
    await put(page, [live({ id: 'ct_a', visitsThrough: '2026-07-05' })]);
    const b = await page.evaluate(n => ctRevenueBook(n), NOW);
    expect(b.atRisk[0].risk.level).toBe('soon');
    expect(b.atRisk[0].risk.reason).toContain('run out in 20 days');
  });

  test('an agreement ending inside 60 days is at risk even when fully prepaid', async ({ page }) => {
    await load(page);
    await put(page, [live({ id: 'ct_a', visitsThrough: '2026-07-20', endDate: '2026-07-20' })]);
    const b = await page.evaluate(n => ctRevenueBook(n), NOW);
    expect(b.atRisk[0].risk.level).toBe('soon');
    expect(b.atRisk[0].risk.reason).toContain('Agreement ends');
  });

  test('a healthy contract is not on the list', async ({ page }) => {
    await load(page);
    await put(page, [live({ id: 'ct_a', visitsThrough: '2027-06-01' })]);
    const b = await page.evaluate(n => ctRevenueBook(n), NOW);
    expect(b.atRisk).toHaveLength(0);
    expect(b.atRiskMrr).toBe(0);
  });

  test('worst first, then largest — the list is a work queue', async ({ page }) => {
    await load(page);
    await put(page, [
      live({ id: 'ct_small', visitsThrough: '2026-04-01', billing: { freq: 'monthly', amount: 100 } }),
      live({ id: 'ct_big', visitsThrough: '2026-04-01', billing: { freq: 'monthly', amount: 900 } }),
      live({ id: 'ct_soon', visitsThrough: '2026-07-05', billing: { freq: 'monthly', amount: 5000 } }),
    ]);
    const b = await page.evaluate(n => ctRevenueBook(n), NOW);
    expect(b.atRisk.map(r => r.contract.id)).toEqual(['ct_big', 'ct_small', 'ct_soon']);
  });
});

test.describe('concentration', () => {
  test('groups by customer, largest share first', async ({ page }) => {
    await load(page);
    await put(page, [
      live({ id: 'ct_a', customerId: 'cus_1', billing: { freq: 'monthly', amount: 600 } }),
      live({ id: 'ct_b', customerId: 'cus_1', billing: { freq: 'monthly', amount: 300 } }),
      live({ id: 'ct_c', customerId: 'cus_2', billing: { freq: 'monthly', amount: 100 } }),
    ], [
      { id: 'cus_1', name: 'Whitaker Marina' },
      { id: 'cus_2', name: 'Cedar Point' },
    ]);
    const b = await page.evaluate(n => ctRevenueBook(n), NOW);
    expect(b.byCustomer[0].name).toBe('Whitaker Marina');
    expect(b.byCustomer[0].mrr).toBe(900);
    expect(b.byCustomer[0].count).toBe(2);
    expect(b.byCustomer[0].share).toBeCloseTo(90, 5);
    expect(b.byCustomer[1].share).toBeCloseTo(10, 5);
  });

  test('a contract with no customer is grouped, not dropped', async ({ page }) => {
    await load(page);
    await put(page, [live({ id: 'ct_a', customerId: '' })]);
    const b = await page.evaluate(n => ctRevenueBook(n), NOW);
    expect(b.byCustomer).toHaveLength(1);
    expect(b.byCustomer[0].name).toBe('No customer set');
    expect(b.byCustomer[0].mrr).toBe(600);
  });
});

test.describe('the trend', () => {
  test('returns one bucket per month, oldest first, ending this month', async ({ page }) => {
    await load(page);
    await put(page, [live({ id: 'ct_a', startDate: '2026-01-01' })]);
    const h = await page.evaluate(n => ctMrrHistory(n, 12), NOW);
    expect(h).toHaveLength(12);
    expect(h[0].key).toBe('2025-07');
    expect(h[11].key).toBe('2026-06');
  });

  test('a contract counts from the month it started, not before', async ({ page }) => {
    await load(page);
    await put(page, [live({ id: 'ct_a', startDate: '2026-03-10', billing: { freq: 'monthly', amount: 500 } })]);
    const h = await page.evaluate(n => ctMrrHistory(n, 12), NOW);
    const by = Object.fromEntries(h.map(m => [m.key, m.mrr]));
    expect(by['2026-02']).toBe(0);
    expect(by['2026-03']).toBe(500);
    expect(by['2026-06']).toBe(500);
  });

  test('an ended contract stops counting after its end date', async ({ page }) => {
    await load(page);
    await put(page, [live({ id: 'ct_a', status: 'ended', startDate: '2026-01-01', endDate: '2026-03-31',
      billing: { freq: 'monthly', amount: 500 } })]);
    const h = await page.evaluate(n => ctMrrHistory(n, 12), NOW);
    const by = Object.fromEntries(h.map(m => [m.key, m.mrr]));
    expect(by['2026-03']).toBe(500);
    expect(by['2026-04']).toBe(0);
  });

  // Paused is a fact about today with no history behind it. Placing it on past
  // months would be inventing data; placing it on none is honest.
  test('paused contracts are left out of the trend entirely', async ({ page }) => {
    await load(page);
    await put(page, [live({ id: 'ct_a', status: 'paused', startDate: '2026-01-01' })]);
    const h = await page.evaluate(n => ctMrrHistory(n, 12), NOW);
    expect(h.every(m => m.mrr === 0)).toBe(true);
  });

  test('the last bucket matches the book\'s current MRR', async ({ page }) => {
    await load(page);
    await put(page, [
      live({ id: 'ct_a', startDate: '2026-01-01', billing: { freq: 'quarterly', amount: 1800 } }),
      live({ id: 'ct_b', startDate: '2026-02-01', billing: { freq: 'weekly', amount: 100 } }),
    ]);
    const r = await page.evaluate(n => {
      const h = ctMrrHistory(n, 12);
      return { last: h[h.length - 1].mrr, mrr: ctRevenueBook(n).mrr };
    }, NOW);
    expect(r.last).toBeCloseTo(r.mrr, 6);
  });
});

test.describe('the chart', () => {
  // A truncated baseline on a revenue chart overstates growth, which is the one
  // thing this chart must not do.
  test('bars are measured from zero, so double the revenue is double the bar', async ({ page }) => {
    await load(page);
    const heights = await page.evaluate(() => {
      const svg = ctMrrChart([
        { label: 'Apr', year: 2026, mrr: 500, count: 1 },
        { label: 'May', year: 2026, mrr: 1000, count: 2 },
      ]);
      const el = document.createElement('div');
      el.innerHTML = svg;
      return [...el.querySelectorAll('path')].map(p => {
        const d = p.getAttribute('d');
        // Baseline is where the path opens; the first quadratic's control point
        // sits at the true top of the bar, before the corner radius.
        const base = Number(d.match(/^M[\d.]+,([\d.]+)/)[1]);
        const top = Number(d.match(/Q[\d.]+,([\d.]+)/)[1]);
        return base - top;
      });
    });
    // Heights are measured off the path, not asserted from the input, so a
    // scale change that broke proportionality would be caught.
    expect(heights[1] / heights[0]).toBeCloseTo(2, 1);
  });

  test('every bar carries its exact figure as a tooltip', async ({ page }) => {
    await load(page);
    const titles = await page.evaluate(() => {
      const el = document.createElement('div');
      el.innerHTML = ctMrrChart([{ label: 'Apr', year: 2026, mrr: 1250, count: 3 }]);
      return [...el.querySelectorAll('title')].map(t => t.textContent);
    });
    expect(titles).toEqual(['Apr 2026 — $1,250.00 across 3 contracts']);
  });

  test('a month with nothing gets a hairline, not a missing bar', async ({ page }) => {
    await load(page);
    const classes = await page.evaluate(() => {
      const el = document.createElement('div');
      el.innerHTML = ctMrrChart([
        { label: 'Apr', year: 2026, mrr: 0, count: 0 },
        { label: 'May', year: 2026, mrr: 900, count: 1 },
      ]);
      return [...el.querySelectorAll('path')].map(p => p.getAttribute('class'));
    });
    expect(classes).toEqual(['ct-rev-bar-zero', 'ct-rev-bar']);
  });

  // One series carrying magnitude needs no legend — but it does need a text
  // description, because a screen reader gets nothing from twelve paths.
  test('the chart describes itself for a screen reader', async ({ page }) => {
    await load(page);
    const label = await page.evaluate(() => {
      const el = document.createElement('div');
      el.innerHTML = ctMrrChart([{ label: 'Apr', year: 2026, mrr: 1250, count: 3 }]);
      return el.querySelector('svg').getAttribute('aria-label');
    });
    expect(label).toContain('monthly recurring revenue');
    expect(label).toContain('$1,250.00');
  });

  test('bar paths close flat on the baseline', async ({ page }) => {
    await load(page);
    const d = await page.evaluate(() => ctRevBarPath(0, 10, 20, 30, 4));
    // Starts at the base, rounds only the top two corners, returns to the base.
    expect(d.startsWith('M0,40')).toBe(true);
    expect((d.match(/Q/g) || []).length).toBe(2);
    expect(d.endsWith('Z')).toBe(true);
  });

  test('a radius never exceeds the bar it is rounding', async ({ page }) => {
    await load(page);
    const d = await page.evaluate(() => ctRevBarPath(0, 99, 20, 1, 4));
    expect(d).not.toContain('NaN');
    expect(d).toContain('Q');
  });
});

test.describe('the page', () => {
  test('leads with MRR and the growth on last month', async ({ page }) => {
    await load(page);
    await put(page, [
      live({ id: 'ct_a', startDate: '2026-01-01', billing: { freq: 'monthly', amount: 600 } }),
      live({ id: 'ct_b', startDate: '2026-06-01', billing: { freq: 'monthly', amount: 600 } }),
    ]);
    const html = await page.evaluate(n => renderRevenue(n), NOW);
    expect(html).toContain('Monthly Recurring');
    expect(html).toContain('$1,200.00');
    expect(html).toContain('Annual Run Rate');
    // $600 last month to $1,200 this month.
    expect(html).toContain('+100% on last month');
  });

  test('says plainly that the trend is not a billing history', async ({ page }) => {
    await load(page);
    await put(page, [live({ id: 'ct_a' })]);
    const html = await page.evaluate(n => renderRevenue(n), NOW);
    expect(html).toContain('not what was invoiced');
  });

  test('warns when one customer carries most of the book', async ({ page }) => {
    await load(page);
    await put(page, [
      live({ id: 'ct_a', customerId: 'cus_1', billing: { freq: 'monthly', amount: 900 } }),
      live({ id: 'ct_b', customerId: 'cus_2', billing: { freq: 'monthly', amount: 100 } }),
    ], [{ id: 'cus_1', name: 'Whitaker Marina' }, { id: 'cus_2', name: 'Cedar Point' }]);
    const html = await page.evaluate(n => renderRevenue(n), NOW);
    expect(html).toContain('90% of the recurring book');
    expect(html).toContain('$900.00 a month');
  });

  test('the billing-for-stopped-work banner names the fix', async ({ page }) => {
    await load(page);
    await put(page, [live({ id: 'ct_a', visitsThrough: '2026-04-01' })]);
    const html = await page.evaluate(n => renderRevenue(n), NOW);
    expect(html).toContain('Billing for work that stopped');
    expect(html).toContain('Visits paid through');
  });

  test('states how much of the book has no cost estimate', async ({ page }) => {
    await load(page);
    await put(page, [
      live({ id: 'ct_a', pricing: { hoursPerVisit: 2, crewRate: 50, driveMinutes: 0, materialsPerVisit: 0, targetMargin: 40 } }),
      live({ id: 'ct_b', pricing: null }),
    ]);
    const html = await page.evaluate(n => renderRevenue(n), NOW);
    expect(html).toContain('Not yet priced');
    expect(html).toContain('covers 50% of revenue');
  });

  test('an empty book explains itself rather than showing zeroes', async ({ page }) => {
    await load(page);
    const html = await page.evaluate(n => renderRevenue(n), NOW);
    expect(html).toContain('No active contract is billing yet');
    expect(html).not.toContain('Annual Run Rate');
  });
});

test.describe('routing', () => {
  test('the Revenue button opens the book and comes back', async ({ page }) => {
    await load(page);
    await put(page, [live({ id: 'ct_a' })]);
    await page.click('.nav-btn[data-view="contracts"]');
    await page.click('#btn-ct-revenue');
    await expect(page.locator('text=Monthly Recurring')).toBeVisible();
    await page.click('[data-ct-rev-back]');
    await expect(page.locator('#btn-ct-add')).toBeVisible();
  });

  // Opening a contract from the at-risk list must land in the normal flow, or
  // the account page's "All contracts" button lies about where it goes.
  test('opening a contract from the book clears the book', async ({ page }) => {
    await load(page);
    await put(page, [live({ id: 'ct_a', visitsThrough: '2026-04-01' })]);
    await page.click('.nav-btn[data-view="contracts"]');
    await page.click('#btn-ct-revenue');
    await page.click('[data-ct="ct_a"]');
    const state = await page.evaluate(() => ({ rev: S.ctRevenue, detail: S.ctDetail }));
    expect(state.rev).toBe(false);
    expect(state.detail).toBe('ct_a');
  });
});

test.describe('project work is untouched', () => {
  test('a project company gets no revenue book and still renders', async ({ page }) => {
    await stubExternals(page);
    await page.addInitScript(() => {
      localStorage.setItem('jt_company', 'mhs');
      localStorage.setItem('jt_companies', JSON.stringify({
        mhs: { id: 'mhs', ns: 'mhs', label: 'MHS', active: true, type: 'project' },
      }));
    });
    await page.goto('/');
    await page.waitForFunction(() => typeof window.ctRevenueBook === 'function');
    const r = await page.evaluate(() => ({
      enabled: ctEnabled(),
      button: !!document.getElementById('btn-ct-revenue'),
      errors: window.__errs || 0,
    }));
    expect(r.enabled).toBe(false);
    expect(r.button).toBe(false);
  });
});

test.describe('concentration is a finding, not arithmetic', () => {
  // With three customers an even split is 33% each. Colouring a 31% share as a
  // risk turns "you have three customers" into an alarm.
  test('a share near the even split is not flagged', async ({ page }) => {
    await load(page);
    await put(page, [
      live({ id: 'ct_a', customerId: 'cus_1', billing: { freq: 'monthly', amount: 350 } }),
      live({ id: 'ct_b', customerId: 'cus_2', billing: { freq: 'monthly', amount: 330 } }),
      live({ id: 'ct_c', customerId: 'cus_3', billing: { freq: 'monthly', amount: 320 } }),
    ], [{ id: 'cus_1', name: 'A' }, { id: 'cus_2', name: 'B' }, { id: 'cus_3', name: 'C' }]);
    const html = await page.evaluate(n => renderRevenue(n), NOW);
    expect(html).not.toContain('of the recurring book');
    expect(html).not.toContain('ct-rev-fill wide');
  });

  // Only ever the largest. A runner-up above the line is not the account whose
  // loss the warning is about.
  test('only the top customer is highlighted, never a runner-up', async ({ page }) => {
    await load(page);
    await put(page, [
      live({ id: 'ct_a', customerId: 'cus_1', billing: { freq: 'monthly', amount: 550 } }),
      live({ id: 'ct_b', customerId: 'cus_2', billing: { freq: 'monthly', amount: 450 } }),
    ], [{ id: 'cus_1', name: 'Big' }, { id: 'cus_2', name: 'Nearly as big' }]);
    const html = await page.evaluate(n => renderRevenue(n), NOW);
    expect((html.match(/ct-rev-fill wide/g) || []).length).toBe(1);
    expect(html).toContain('Big is 55% of the recurring book');
  });
});

test('month labels are anchored on the most recent month', async ({ page }) => {
  await load(page);
  const shown = await page.evaluate(() => {
    const h = [];
    for (let i = 0; i < 12; i++) h.push({ label: 'M' + i, year: 2026, mrr: 100, count: 1 });
    const el = document.createElement('div');
    el.innerHTML = ctMrrChart(h);
    return [...el.querySelectorAll('text')].map(t => t.textContent);
  });
  // The current month always carries a label, and no two labels sit adjacent.
  expect(shown).toContain('M11');
  expect(shown).toEqual(['M1', 'M3', 'M5', 'M7', 'M9', 'M11']);
});
