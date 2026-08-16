// Home for a maintenance company, and the command palette that reaches it.
//
// Two things carry the weight here. The first is that a project company's Home
// must be untouched — this is the only change in the whole contracts feature
// that reaches into shared render code, so the branch is tested from both
// sides. The second is that Home answers the morning questions rather than
// showing a count of generated visits.

const { expect, test } = require('@playwright/test');
const { stubExternals } = require('./_stubs');

const NOW = new Date(2026, 5, 15).getTime(); // Mon 15 Jun 2026

async function boot(page, type) {
  await stubExternals(page);
  await page.addInitScript((t) => {
    localStorage.setItem('jt_company', 'co');
    localStorage.setItem('jt_companies', JSON.stringify({
      co: { id: 'co', ns: 'co', label: 'Test Co', active: true, type: t },
    }));
  }, type);
  await page.goto('/');
  await page.waitForFunction(() => typeof window.render === 'function');
  await page.evaluate(() => {
    S.contracts = {}; S.jobs = {}; S.customers = {}; S.timeEntries = {}; S.payRates = {};
    S.members = []; S.ctDetail = null; S.ctRoute = null; S.ctRevenue = false; S.ctBills = false;
    S._ctWired = false;
    if (typeof ctSaveContractsLocal === 'function') ctSaveContractsLocal();
  });
}

// A contract with visits today and an unsent draft, so Home has all three
// answers to give.
async function seed(page, over) {
  await page.evaluate(async (a) => {
    await saveCustomer({ id: 'cus_1', name: 'Whitaker Marina', email: 'ap@whitaker.example' });
    await ctSaveContract(Object.assign({
      id: 'ct_a', name: 'Dock maintenance', status: 'active', startDate: '2026-01-15',
      customerId: 'cus_1', visits: { freq: 'monthly' }, visitsThrough: '2027-01-15',
      billing: { freq: 'monthly', amount: 600 },
      checklist: [{ id: 'ck1', text: 'Check anodes' }, { id: 'ck2', text: 'Photos' }],
    }, a.over || {}));
    await ctRunGeneration(ctPendingWork(a.now), { now: a.now });
  }, { over, now: NOW });
}

test.describe('project work is untouched', () => {
  // The one line of shared render code this feature adds is an early return in
  // renderDashboard(). A project company must never take it.
  test('a project company still gets the project dashboard', async ({ page }) => {
    await boot(page, 'project');
    const r = await page.evaluate(() => {
      S.jobs = { j1: { id: 'j1', name: 'Deck build', status: 'active', value: 9000, invoices: [], tasks: [], photos: [] } };
      S.view = 'dashboard';
      render();
      const c = document.getElementById('content');
      return { html: c.innerHTML, enabled: ctEnabled() };
    });
    expect(r.enabled).toBe(false);
    expect(r.html).toContain('Active Jobs');
    expect(r.html).toContain('Job Value');
    expect(r.html).not.toContain('ct-home-date');
  });

  test('renderDashboard returns the project markup unchanged for a project company', async ({ page }) => {
    await boot(page, 'project');
    const html = await page.evaluate(() => renderDashboard());
    expect(html).toContain('Active Jobs');
    expect(html).toContain('Outstanding');
    expect(html).not.toContain('ct-home');
  });
});

test.describe('Home for a maintenance company', () => {
  test('leads with the day, not with a job count', async ({ page }) => {
    await boot(page, 'maintenance');
    await seed(page);
    const html = await page.evaluate(n => ctHome(n), NOW);
    expect(html).toContain('Today');
    // The project numbers that meant nothing here are gone.
    expect(html).not.toContain('Job Value');
    expect(html).not.toContain('in pipeline');
  });

  test('the route card counts today\'s stops and lists them', async ({ page }) => {
    await boot(page, 'maintenance');
    // Anchored to the 20th so none of the contract's own visits land on the
    // 15th by coincidence — the count under test is the two moved here.
    await seed(page, { startDate: '2026-01-20', visitsThrough: '2027-01-20' });
    // Put two visits on today.
    await page.evaluate(async (n) => {
      const jobs = ctContractJobs('ct_a').slice(0, 2);
      const today = ctDateKey(ctStartOfDay(n));
      for (const j of jobs) { j.startDate = today; j.dueDate = today; j.assigned = 'Dale'; await writeJob(j); }
    }, NOW);
    const r = await page.evaluate(n => ({ st: ctHomeState(n), html: ctHome(n) }), NOW);
    expect(r.st.stops).toHaveLength(2);
    expect(r.html).toContain('2 stops');
    expect(r.html).toContain('Dale');
    expect(r.html).toContain('Open the day route');
  });

  test('an empty day says when the next work is', async ({ page }) => {
    await boot(page, 'maintenance');
    await seed(page);
    await page.evaluate(async (n) => {
      // Everything on a known future date, nothing today.
      const jobs = ctContractJobs('ct_a');
      for (const j of jobs) { j.startDate = '2026-06-18'; j.dueDate = '2026-06-18'; await writeJob(j); }
    }, NOW);
    const html = await page.evaluate(n => ctHome(n), NOW);
    expect(html).toContain('Nothing booked');
    expect(html).toContain('Next work is');
    expect(html).toContain('Thursday');
  });

  test('a tile only appears when it has something to say', async ({ page }) => {
    await boot(page, 'maintenance');
    await seed(page);
    // Fully prepaid, nothing generated beyond what exists, nothing to bill yet
    // beyond the drafts generation made.
    const html = await page.evaluate(n => ctHome(n), NOW);
    // Renewal is far away, so no renewal tile.
    expect(html).not.toContain('Needs renewing');
    // Generation raised drafts, so there IS something to bill.
    expect(html).toContain('To bill');
  });

  test('a lapsing contract raises the renewal tile, marked urgent', async ({ page }) => {
    await boot(page, 'maintenance');
    await seed(page, { visitsThrough: '2026-05-01' });
    const html = await page.evaluate(n => ctHome(n), NOW);
    expect(html).toContain('Needs renewing');
    expect(html).toContain('ct-home-tile urgent');
    expect(html).toContain('$600.00 a month');
  });

  test('the money strip shows MRR and outstanding', async ({ page }) => {
    await boot(page, 'maintenance');
    await seed(page, { billing: { freq: 'quarterly', amount: 1800 } });
    const r = await page.evaluate(n => ({ money: ctHomeMoney(), html: ctHome(n) }), NOW);
    expect(r.money.mrr).toBe(600);
    expect(r.html).toContain('Monthly recurring');
    expect(r.html).toContain('Outstanding');
  });

  // The revenue page builds a labour index and prices every contract. Home
  // redraws on every render, so it must not do that work.
  test('Home does not run the full revenue roll-up', async ({ page }) => {
    await boot(page, 'maintenance');
    await seed(page);
    const called = await page.evaluate((n) => {
      let hit = 0;
      const real = window.ctPricingActual;
      window.ctPricingActual = function () { hit++; return real.apply(null, arguments); };
      ctHome(n);
      window.ctPricingActual = real;
      return hit;
    }, NOW);
    expect(called).toBe(0);
  });

  test('a company with no contracts is pointed at Contracts rather than shown zeroes', async ({ page }) => {
    await boot(page, 'maintenance');
    const html = await page.evaluate(n => ctHome(n), NOW);
    expect(html).toContain('No contracts yet');
    expect(html).toContain('Go to Contracts');
    expect(html).not.toContain('$0.00');
  });
});

test.describe('the tiles go somewhere', () => {
  test('the route card opens the day route', async ({ page }) => {
    await boot(page, 'maintenance');
    await seed(page);
    await page.evaluate(() => { S.view = 'dashboard'; render(); });
    await page.click('[data-home-go="route"]');
    const s = await page.evaluate(() => ({ view: S.view, route: S.ctRoute }));
    expect(s.view).toBe('contracts');
    expect(s.route).toBe(new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0'));
  });

  test('the bill tile opens the bill run', async ({ page }) => {
    await boot(page, 'maintenance');
    await seed(page);
    await page.evaluate(() => { S.view = 'dashboard'; render(); });
    await page.click('[data-home-go="bills"]');
    const s = await page.evaluate(() => ({ view: S.view, bills: S.ctBills }));
    expect(s.view).toBe('contracts');
    expect(s.bills).toBe(true);
  });

  test('the money strip opens the revenue book', async ({ page }) => {
    await boot(page, 'maintenance');
    await seed(page);
    await page.evaluate(() => { S.view = 'dashboard'; render(); });
    await page.click('[data-home-go="revenue"]');
    const s = await page.evaluate(() => ({ view: S.view, rev: S.ctRevenue }));
    expect(s.view).toBe('contracts');
    expect(s.rev).toBe(true);
  });

  // Every destination clears the others, or a tap lands on whichever sub-view
  // was open last rather than the one that was pressed.
  test('opening one sub-view clears the rest', async ({ page }) => {
    await boot(page, 'maintenance');
    await seed(page);
    await page.evaluate(() => { S.ctRevenue = true; S.ctDetail = 'ct_a'; S.view = 'dashboard'; render(); });
    await page.click('[data-home-go="bills"]');
    const s = await page.evaluate(() => ({ rev: S.ctRevenue, detail: S.ctDetail, bills: S.ctBills }));
    expect(s.rev).toBe(false);
    expect(s.detail).toBeNull();
    expect(s.bills).toBe(true);
  });
});

test.describe('the command palette knows about contracts', () => {
  test('offers the contracts screens by name', async ({ page }) => {
    await boot(page, 'maintenance');
    await seed(page);
    const names = await page.evaluate(() => cmdItems().map(i => i.name));
    expect(names).toContain('Go to Contracts');
    expect(names).toContain("Today's Route");
    expect(names).toContain('Bill Run');
    expect(names).toContain('Recurring Revenue');
    expect(names).toContain('New Contract');
  });

  test('every contract is reachable by name, like a job', async ({ page }) => {
    await boot(page, 'maintenance');
    await seed(page);
    const item = await page.evaluate(() => {
      const i = cmdItems().find(x => x.name === 'Dock maintenance');
      return i ? { name: i.name, sub: i.sub } : null;
    });
    expect(item).not.toBeNull();
    expect(item.sub).toContain('Whitaker Marina');
    expect(item.sub).toContain('monthly visits');
  });

  test('running a contract item opens its account page', async ({ page }) => {
    await boot(page, 'maintenance');
    await seed(page);
    const s = await page.evaluate(() => {
      cmdItems().find(x => x.name === 'Dock maintenance').run();
      return { view: S.view, detail: S.ctDetail };
    });
    expect(s.view).toBe('contracts');
    expect(s.detail).toBe('ct_a');
  });

  test('it is searchable, not just present', async ({ page }) => {
    await boot(page, 'maintenance');
    await seed(page);
    const hits = await page.evaluate(() => cmdFilter('route').map(i => i.name));
    expect(hits).toContain("Today's Route");
  });

  // A project company has no contracts view, so offering to navigate there
  // would be a dead end.
  test('a project company is offered none of it', async ({ page }) => {
    await boot(page, 'project');
    const names = await page.evaluate(() => cmdItems().map(i => i.name));
    expect(names).not.toContain('Go to Contracts');
    expect(names).not.toContain('Bill Run');
    // And the project entries are all still there.
    expect(names).toContain('New Job');
    expect(names).toContain('Go to Jobs');
  });
});
