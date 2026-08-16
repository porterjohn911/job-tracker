// Contract pricing — estimate versus actual.
//
// A fixed-price agreement is a bet that gets settled twelve times before anyone
// checks the score. These cases lean on the ways that check goes wrong: an
// unlogged visit averaged in as free, a markup quietly substituted for a
// margin, an anecdote presented as a measurement, and a reprice figure quoted
// off a schedule that cannot be annualized.

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
  await page.waitForFunction(() => typeof window.ctPricingVariance === 'function');
  await page.evaluate(() => {
    S.contracts = {}; S.jobs = {}; S.customers = {}; S.ctDetail = null; S.ctSearch = '';
    S.timeEntries = {}; S.payRates = {}; S.members = []; S._ctWired = false;
    ctSaveContractsLocal();
  });
}

// $500 a month, monthly visits, quoted at 2h on site + 30 min drive at $60/hr
// plus $40 of materials — $190 of cost a visit, $2,280 a year.
const base = {
  id: 'ct_a', name: 'Dock maintenance', status: 'active', startDate: '2026-01-01',
  visits: { freq: 'monthly' }, visitsThrough: '2026-06-01',
  billing: { freq: 'monthly', amount: 500 },
  pricing: { hoursPerVisit: 2, crewRate: 60, driveMinutes: 30, materialsPerVisit: 40, targetMargin: 40 },
};

async function seed(page, over) {
  await page.evaluate(async (args) => {
    await ctSaveContract(Object.assign({}, args.base, args.over || {}));
    await ctRunGeneration(ctPendingWork(args.now), { now: args.now });
  }, { base, over, now: MARCH });
}

// Log `hours` against the first `count` visits at $50/hr, with optional
// receipts on each.
async function logWork(page, count, hours, receipt) {
  await page.evaluate((a) => {
    const jobs = ctContractJobs('ct_a');
    S.members = ['Dale'];
    S.payRates = { Dale: 50 };
    const entries = {};
    for (let i = 0; i < a.count; i++) {
      entries['t' + i] = { id: 't' + i, member: 'Dale', job: jobs[i].id, start: 1, end: 1 + a.hours * 3600000 };
      if (a.receipt) jobs[i].receipts = [{ id: 'r' + i, amount: a.receipt, category: 'Materials' }];
    }
    S.timeEntries = entries;
  }, { count, hours, receipt: receipt || 0 });
}

test.describe('frequency arithmetic', () => {
  test('every frequency converts to a count per year', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => ({
      weekly: ctPerYear({ freq: 'weekly' }),
      biweekly: ctPerYear({ freq: 'biweekly' }),
      monthly: ctPerYear({ freq: 'monthly' }),
      quarterly: ctPerYear({ freq: 'quarterly' }),
      annual: ctPerYear({ freq: 'annual' }),
      everyThreeWeeks: ctPerYear({ freq: 'weekly', interval: 3 }),
      everyTwoMonths: ctPerYear({ freq: 'monthly', interval: 2 }),
    }));
    expect(r.weekly).toBe(52);
    expect(r.biweekly).toBe(26);
    expect(r.monthly).toBe(12);
    expect(r.quarterly).toBe(4);
    expect(r.annual).toBe(1);
    expect(r.everyThreeWeeks).toBeCloseTo(52 / 3, 5);
    expect(r.everyTwoMonths).toBe(6);
  });

  // Null and zero are different answers. Zero per year would make an annual
  // cost of $0 look like a real figure instead of an unanswerable question.
  test('no schedule is null, not zero', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => [ctPerYear(null), ctPerYear({}), ctPerYear({ freq: 'fortnightly' })]);
    expect(r).toEqual([null, null, null]);
  });
});

test.describe('the estimate', () => {
  test('costs drive time at the crew rate and prices for a true margin', async ({ page }) => {
    await load(page);
    await seed(page);
    const e = await page.evaluate(() => ctPricingEstimate(ctGetContract('ct_a')));
    expect(e.hoursPerVisit).toBeCloseTo(2.5, 5);
    expect(e.laborPerVisit).toBeCloseTo(150, 5);
    expect(e.costPerVisit).toBeCloseTo(190, 5);
    expect(e.costPerYear).toBeCloseTo(2280, 5);
    // cost / (1 - 0.40), NOT cost * 1.40. The markup answer is $3,192, which
    // is a 28.6% margin — nearly twelve points short of the target.
    expect(e.suggestedPerYear).toBeCloseTo(3800, 5);
    expect(e.suggestedPerBill).toBeCloseTo(316.667, 2);
    expect(e.billedPerYear).toBeCloseTo(6000, 5);
    expect(e.marginAtEstimate).toBeCloseTo(62, 5);
  });

  test('a contract nobody priced has no estimate', async ({ page }) => {
    await load(page);
    await seed(page, { pricing: null });
    const r = await page.evaluate(() => ({
      est: ctPricingEstimate(ctGetContract('ct_a')),
      verdict: ctPricingVariance(ctGetContract('ct_a')).verdict,
    }));
    expect(r.est).toBeNull();
    expect(r.verdict).toBe('unpriced');
  });

  // An all-zero block is what an untouched form produces. Storing it would give
  // every contract an estimate of nothing and a suggested price of $0.
  test('an empty estimate block normalizes away rather than becoming zeroes', async ({ page }) => {
    await load(page);
    await seed(page, { pricing: { hoursPerVisit: 0, crewRate: 0, driveMinutes: 0, materialsPerVisit: 0, targetMargin: 40 } });
    const p = await page.evaluate(() => ctGetContract('ct_a').pricing);
    expect(p).toBeNull();
  });

  test('nonsense values are clamped, not stored', async ({ page }) => {
    await load(page);
    await seed(page, { pricing: { hoursPerVisit: 900, crewRate: -50, driveMinutes: 'x', materialsPerVisit: 1e9, targetMargin: 400 } });
    const p = await page.evaluate(() => ctGetContract('ct_a').pricing);
    expect(p.hoursPerVisit).toBe(24);
    expect(p.crewRate).toBe(0);
    expect(p.driveMinutes).toBe(0);
    expect(p.materialsPerVisit).toBe(100000);
    // An out-of-range target falls back to something conventional rather than
    // to zero, which would suggest selling at cost.
    expect(p.targetMargin).toBe(40);
  });

  // The clamps exist to keep writes inside what the Firebase rules accept. A
  // value the normalizer passes but the rules reject is how a contract vanishes
  // on save, so the two ceilings are checked against each other.
  test('every clamped value lands inside the deployed rule bounds', async ({ page }) => {
    await load(page);
    await seed(page, { pricing: { hoursPerVisit: 99, crewRate: 99999, driveMinutes: 99999, materialsPerVisit: 1e12, targetMargin: 94.99 } });
    const p = await page.evaluate(() => ctGetContract('ct_a').pricing);
    expect(p.hoursPerVisit).toBeLessThanOrEqual(24);
    expect(p.crewRate).toBeLessThanOrEqual(1000);
    expect(p.driveMinutes).toBeLessThanOrEqual(600);
    expect(p.materialsPerVisit).toBeLessThanOrEqual(100000);
    // 94.99 rounds to 95.0, which the rule rejects — so it must not round up
    // into the value and then be stored.
    expect(p.targetMargin).toBeGreaterThan(0);
    expect(p.targetMargin).toBeLessThan(95);
  });
});

test.describe('the actuals', () => {
  test('averages only over visits with logged time', async ({ page }) => {
    await load(page);
    await seed(page);
    // Six visits generated; three worked at 3h with $50 of materials each.
    await logWork(page, 3, 3, 50);
    const a = await page.evaluate(() => ctPricingActual(ctGetContract('ct_a')));
    expect(a.visitCount).toBe(6);
    expect(a.measured).toBe(3);
    expect(a.unmeasured).toBe(3);
    expect(a.hours).toBeCloseTo(9, 5);
    expect(a.hoursPerVisit).toBeCloseTo(3, 5);
    expect(a.laborPerVisit).toBeCloseTo(150, 5);
    expect(a.materialsPerVisit).toBeCloseTo(50, 5);
    expect(a.costPerVisit).toBeCloseTo(200, 5);
    expect(a.effectiveRate).toBeCloseTo(50, 5);
  });

  // The bug this guards: dividing by all six visits gives $100 a visit and
  // makes an account that is barely breaking even look like it has room.
  test('an unlogged visit is unmeasured, not free', async ({ page }) => {
    await load(page);
    await seed(page);
    await logWork(page, 3, 3, 50);
    const a = await page.evaluate(() => ctPricingActual(ctGetContract('ct_a')));
    expect(a.costPerVisit).toBeCloseTo(200, 5);
    expect(a.costPerVisit).not.toBeCloseTo(100, 1);
  });

  // Materials bought on a visit nobody clocked would otherwise be divided by a
  // denominator that excludes the labour they came with, inflating cost/visit.
  test('materials on an unmeasured visit are reported, not averaged in', async ({ page }) => {
    await load(page);
    await seed(page);
    await logWork(page, 2, 2, 0);
    await page.evaluate(() => { ctContractJobs('ct_a')[5].receipts = [{ id: 'rx', amount: 600, category: 'Materials' }]; });
    const a = await page.evaluate(() => ctPricingActual(ctGetContract('ct_a')));
    expect(a.measured).toBe(2);
    expect(a.materialsPerVisit).toBe(0);
    expect(a.unmeasuredMaterials).toBeCloseTo(600, 5);
  });

  test('job-level costs count alongside receipts', async ({ page }) => {
    await load(page);
    await seed(page);
    await logWork(page, 1, 2, 30);
    await page.evaluate(() => { ctContractJobs('ct_a')[0].costs = 20; });
    const a = await page.evaluate(() => ctPricingActual(ctGetContract('ct_a')));
    expect(a.materialsPerVisit).toBeCloseTo(50, 5);
  });

  test('nothing logged leaves the averages unstated rather than zero', async ({ page }) => {
    await load(page);
    await seed(page);
    const a = await page.evaluate(() => ctPricingActual(ctGetContract('ct_a')));
    expect(a.measured).toBe(0);
    expect(a.costPerVisit).toBeNull();
    expect(a.hoursPerVisit).toBeNull();
    expect(a.thin).toBe(false);
  });

  test('a one-visit sample is flagged as thin', async ({ page }) => {
    await load(page);
    await seed(page);
    await logWork(page, 1, 5, 0);
    const r = await page.evaluate(() => ({
      thin: ctPricingActual(ctGetContract('ct_a')).thin,
      text: ctPricingVerdictText(ctPricingVariance(ctGetContract('ct_a'))),
    }));
    expect(r.thin).toBe(true);
    expect(r.text).toContain('too few to be sure');
  });
});

test.describe('the reprice number', () => {
  // The headline claim: real hours, target margin, what the bill should be.
  test('prices from actual cost at the contract\'s own target margin', async ({ page }) => {
    await load(page);
    await seed(page);
    // 3h at $50 plus $50 materials = $200 a visit, $2,400 a year.
    await logWork(page, 3, 3, 50);
    const v = await page.evaluate(() => ctPricingVariance(ctGetContract('ct_a')));
    expect(v.actualCostPerYear).toBeCloseTo(2400, 5);
    expect(v.neededPerYear).toBeCloseTo(4000, 5);      // 2400 / 0.60
    expect(v.neededPerBill).toBeCloseTo(333.333, 2);
    expect(v.billedPerBill).toBe(500);
    // Charging $500 against $200 of cost is a 60% margin — comfortably above
    // the 40% target, so the price is holding even though the hours ran over.
    expect(v.marginNow).toBeCloseTo(60, 5);
    expect(v.verdict).toBe('on-target');
  });

  test('hours running over is not by itself a verdict', async ({ page }) => {
    await load(page);
    await seed(page);
    await logWork(page, 3, 3, 50);
    const v = await page.evaluate(() => ctPricingVariance(ctGetContract('ct_a')));
    expect(v.hoursDelta).toBeCloseTo(0.5, 5);
    expect(v.hoursPct).toBeCloseTo(20, 5);
    expect(v.verdict).toBe('on-target');
  });

  test('an account below target says what it needs to be', async ({ page }) => {
    await load(page);
    await seed(page, { billing: { freq: 'monthly', amount: 250 } });
    // 5h at $50 plus $60 = $310 a visit, $3,720 a year, against $3,000 billed.
    await logWork(page, 4, 5, 60);
    const r = await page.evaluate(() => {
      const v = ctPricingVariance(ctGetContract('ct_a'));
      return { v, text: ctPricingVerdictText(v) };
    });
    expect(r.v.marginNow).toBeCloseTo(-24, 5);
    expect(r.v.verdict).toBe('losing');
    expect(r.v.neededPerYear).toBeCloseTo(6200, 5);
    expect(r.v.neededPerBill).toBeCloseTo(516.667, 2);
    expect(r.v.gapPerYear).toBeCloseTo(3200, 5);
    expect(r.text).toContain('losing money');
    expect(r.text).toContain('$516.67');
    expect(r.text).toContain('$250.00');
  });

  test('between break-even and target reads as under, not losing', async ({ page }) => {
    await load(page);
    // $200 a visit of cost against $250 billed is a 20% margin — profitable,
    // and still twenty points short of what this contract was sold on.
    await seed(page, { billing: { freq: 'monthly', amount: 250 } });
    await logWork(page, 3, 3, 50);
    const v = await page.evaluate(() => ctPricingVariance(ctGetContract('ct_a')));
    expect(v.marginNow).toBeCloseTo(20, 5);
    expect(v.verdict).toBe('under');
  });

  // Without a visit schedule a per-visit average cannot be annualized, and
  // inventing a frequency to fill the gap would put a made-up number in front
  // of someone about to renegotiate a price.
  test('no visit schedule means no reprice figure, and says so', async ({ page }) => {
    await load(page);
    await seed(page, { visits: null, visitsThrough: '' });
    await page.evaluate(async (now) => {
      // Hang a worked job off the contract by hand — nothing generates without
      // a visit schedule.
      await writeJob({ id: 'j_hand', name: 'Callout', status: 'active', contractId: 'ct_a', startDate: '2026-02-01', invoices: [], photos: [] });
      S.members = ['Dale']; S.payRates = { Dale: 50 };
      S.timeEntries = { t1: { id: 't1', member: 'Dale', job: 'j_hand', start: 1, end: 1 + 4 * 3600000 } };
      return now;
    }, MARCH);
    const r = await page.evaluate(() => {
      const v = ctPricingVariance(ctGetContract('ct_a'));
      return { canReprice: v.canReprice, needed: v.neededPerYear, text: ctPricingVerdictText(v) };
    });
    expect(r.canReprice).toBe(false);
    expect(r.needed).toBeNull();
    expect(r.text).toContain('Set a visit frequency');
  });

  test('nothing logged yet reports the estimate rather than a comparison', async ({ page }) => {
    await load(page);
    await seed(page);
    const r = await page.evaluate(() => {
      const v = ctPricingVariance(ctGetContract('ct_a'));
      return { verdict: v.verdict, text: ctPricingVerdictText(v) };
    });
    expect(r.verdict).toBe('unmeasured');
    expect(r.text).toContain('$190.00');
    expect(r.text).toContain('No time has been logged');
  });
});

test.describe('on the account page', () => {
  test('the pricing panel carries the reprice figure', async ({ page }) => {
    await load(page);
    await seed(page, { billing: { freq: 'monthly', amount: 250 } });
    await logWork(page, 4, 5, 60);
    const html = await page.evaluate(() => renderContractDetail('ct_a', new Date(2026, 2, 15).getTime()));
    expect(html).toContain('Pricing');
    expect(html).toContain('losing money');
    expect(html).toContain('$516.67');
    expect(html).toContain('Quoted');
    expect(html).toContain('Actual');
  });

  test('an unpriced contract is told what is missing', async ({ page }) => {
    await load(page);
    await seed(page, { pricing: null });
    const html = await page.evaluate(() => renderContractDetail('ct_a', new Date(2026, 2, 15).getTime()));
    expect(html).toContain('not priced');
    expect(html).toContain('crew rate');
  });

  test('unmeasured visits are declared, not hidden', async ({ page }) => {
    await load(page);
    await seed(page);
    await logWork(page, 2, 2, 0);
    const html = await page.evaluate(() => renderContractDetail('ct_a', new Date(2026, 2, 15).getTime()));
    expect(html).toContain('4 visits had no time logged');
  });

  test('the existing account roll-up is unchanged by the panel', async ({ page }) => {
    await load(page);
    await seed(page);
    await logWork(page, 3, 3, 50);
    const m = await page.evaluate(() => ctContractCosting(ctGetContract('ct_a')));
    expect(m.visitCount).toBe(6);
    expect(m.hours).toBeCloseTo(9, 5);
    expect(m.materials).toBeCloseTo(150, 5);
  });
});

test.describe('in the editor', () => {
  test('the estimate round-trips through the form', async ({ page }) => {
    await load(page);
    await seed(page);
    const p = await page.evaluate(() => {
      openContractForm(ctGetContract('ct_a'));
      document.getElementById('ct-price-hours').value = '3.5';
      document.getElementById('ct-price-rate').value = '72';
      document.getElementById('ct-price-drive').value = '45';
      document.getElementById('ct-price-materials').value = '85';
      document.getElementById('ct-price-margin').value = '35';
      return ctNormalizeContract(ctReadContractForm(ctGetContract('ct_a'))).pricing;
    });
    expect(p).toEqual({ hoursPerVisit: 3.5, crewRate: 72, driveMinutes: 45, materialsPerVisit: 85, targetMargin: 35 });
  });

  test('the hint quotes a price as the numbers are typed', async ({ page }) => {
    await load(page);
    await seed(page);
    const hint = await page.evaluate(async () => {
      openContractForm(ctGetContract('ct_a'));
      const el = document.getElementById('ct-price-rate');
      el.value = '100';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return document.getElementById('ct-price-hint').textContent;
    });
    // 2.5h at $100 plus $40 = $290 a visit; at 40% that is $483.33 a bill.
    expect(hint).toContain('$290.00');
    expect(hint).toContain('$483.33');
    expect(hint).toContain('$500.00');
  });

  test('saving an untouched new contract does not invent an estimate', async ({ page }) => {
    await load(page);
    const p = await page.evaluate(async () => {
      openContractForm(ctNewContract());
      document.getElementById('ct-name').value = 'Bare contract';
      const saved = await ctSaveContract(ctReadContractForm(ctNewContract()));
      return saved.pricing;
    });
    expect(p).toBeNull();
  });

  test('recurring work billed at a fixed price with no estimate is flagged', async ({ page }) => {
    await load(page);
    const issues = await page.evaluate(() => ctContractIssues({
      id: 'ct_z', status: 'active', startDate: '2026-01-01',
      visits: { freq: 'monthly' }, visitsThrough: '2026-12-01',
      billing: { freq: 'monthly', amount: 400 },
    }));
    expect(issues.join(' ')).toContain('No pricing estimate');
  });

  // A retainer has no visits whose hours could overrun, so it is not nagged.
  test('a retainer is not nagged for an hours estimate', async ({ page }) => {
    await load(page);
    const issues = await page.evaluate(() => ctContractIssues({
      id: 'ct_r', status: 'active', startDate: '2026-01-01', visits: null,
      billing: { freq: 'monthly', amount: 500 },
    }));
    expect(issues.join(' ')).not.toContain('No pricing estimate');
  });
});

test.describe('project work is untouched', () => {
  test('a project company gets no contracts tab and no pricing', async ({ page }) => {
    await stubExternals(page);
    await page.addInitScript(() => {
      localStorage.setItem('jt_company', 'mhs');
      localStorage.setItem('jt_companies', JSON.stringify({
        mhs: { id: 'mhs', ns: 'mhs', label: 'MHS', active: true, type: 'project' },
      }));
    });
    await page.goto('/');
    await page.waitForFunction(() => typeof window.ctPricingVariance === 'function');
    const r = await page.evaluate(() => ({
      shows: ctEnabled(),
      tab: !!document.querySelector('[data-tab="contracts"]'),
    }));
    expect(r.shows).toBe(false);
    expect(r.tab).toBe(false);
  });
});

test.describe('the healthy-account misread', () => {
  // "Price to hit 40%: $312" beside a $650 bill reads as advice to halve the
  // price. On an account already above target the same figure is a floor, and
  // the panel has to say so — this is the one misreading that costs money.
  test('an account above target is shown a floor, not a price to drop to', async ({ page }) => {
    await load(page);
    await seed(page);
    await logWork(page, 3, 3, 50);
    const html = await page.evaluate(() => renderContractDetail('ct_a', new Date(2026, 2, 15).getTime()));
    expect(html).toContain('Floor to hold 40%');
    expect(html).not.toContain('Price to hit 40%');
    expect(html).toContain('of headroom');
  });

  test('an account below target is still told the price to move to', async ({ page }) => {
    await load(page);
    await seed(page, { billing: { freq: 'monthly', amount: 250 } });
    await logWork(page, 4, 5, 60);
    const html = await page.evaluate(() => renderContractDetail('ct_a', new Date(2026, 2, 15).getTime()));
    expect(html).toContain('Price to hit 40%');
    expect(html).not.toContain('Floor to hold');
  });
});
