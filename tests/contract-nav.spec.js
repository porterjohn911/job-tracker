// Folding the nav, and jumping around the account page.
//
// The nav belongs to the whole app, so the case that matters most here is the
// negative one: a project company's thirteen-tab bar must come out of this
// completely unchanged. Re-ordering someone's navigation while they are working
// is not a change to make on their behalf.

const { expect, test } = require('@playwright/test');
const { stubExternals } = require('./_stubs');

const NOW = new Date(2026, 5, 15).getTime();

async function boot(page, type) {
  await stubExternals(page);
  await page.setViewportSize({ width: 430, height: 850 });
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
    render();
  });
}

// What is actually on the bar, and whether it overflows the phone.
function navShape() {
  const nav = document.querySelector('.nav');
  const r = nav.getBoundingClientRect();
  const visible = [...nav.querySelectorAll('.nav-btn')].filter(b => b.style.display !== 'none');
  return {
    barW: Math.round(r.width),
    scrollW: Math.round(nav.scrollWidth),
    overflows: nav.scrollWidth > Math.ceil(r.width),
    labels: visible.map(b => b.dataset.view || b.id),
    more: !!document.getElementById('ct-nav-more'),
  };
}

test.describe('a project company keeps its nav exactly as it was', () => {
  test('no folding, no More button', async ({ page }) => {
    await boot(page, 'project');
    const n = await page.evaluate(navShape);
    expect(n.more).toBe(false);
    // Every tab it is allowed to see is still on the bar, in the original order.
    expect(n.labels).toContain('invoices');
    expect(n.labels).toContain('referrals');
    expect(n.labels).toContain('map');
    expect(n.labels).toContain('time');
    // Contracts is hidden for a project company, as it always was.
    expect(n.labels).not.toContain('contracts');
  });

  test('calling the folder directly still does nothing for them', async ({ page }) => {
    await boot(page, 'project');
    const n = await page.evaluate(() => { ctApplyNavOverflow(); return document.getElementById('ct-nav-more'); });
    expect(n).toBeNull();
  });
});

test.describe('a maintenance company gets a bar that fits', () => {
  test('the thirteen-tab overflow is gone', async ({ page }) => {
    await boot(page, 'maintenance');
    const n = await page.evaluate(navShape);
    expect(n.more).toBe(true);
    expect(n.overflows).toBe(false);
    expect(n.scrollW).toBeLessThanOrEqual(n.barW);
  });

  test('it keeps the screens a maintenance day is made of', async ({ page }) => {
    await boot(page, 'maintenance');
    const n = await page.evaluate(navShape);
    ['dashboard', 'contracts', 'schedule', 'jobs'].forEach(v =>
      expect(n.labels, v + ' should stay on the bar').toContain(v));
    expect(n.labels).toContain('ct-nav-more');
  });

  test('the rest are folded away, not deleted', async ({ page }) => {
    await boot(page, 'maintenance');
    const r = await page.evaluate(() => ({ hidden: ctNavOverflowViews(), sheet: ctNavSheetViews() }));
    expect(r.hidden).toContain('invoices');
    expect(r.hidden).toContain('referrals');
    expect(r.hidden).toContain('time');
    expect(r.hidden).toContain('customers');
    // Everything hidden that this user may open is offered in the sheet.
    expect(r.sheet).toContain('invoices');
    expect(r.sheet).toContain('time');
  });

  test('folding twice does not stack up More buttons', async ({ page }) => {
    await boot(page, 'maintenance');
    const count = await page.evaluate(() => {
      ctApplyNavOverflow(); ctApplyNavOverflow(); render();
      return document.querySelectorAll('#ct-nav-more').length;
    });
    expect(count).toBe(1);
  });
});

test.describe('the More sheet', () => {
  test('opens, lists the folded views, and navigates', async ({ page }) => {
    await boot(page, 'maintenance');
    await page.click('#ct-nav-more');
    await expect(page.locator('[data-ct-nav="invoices"]')).toBeVisible();
    await page.click('[data-ct-nav="invoices"]');
    const s = await page.evaluate(() => ({ view: S.view, open: !!document.querySelector('#ct-nav-bd') }));
    expect(s.view).toBe('invoices');
    expect(s.open).toBe(false);
  });

  // render() lights the active tab by data-view, which More does not have. Left
  // alone, standing on a folded view would leave the whole bar unlit.
  test('More lights up when the open view is one it holds', async ({ page }) => {
    await boot(page, 'maintenance');
    const onFolded = await page.evaluate(() => {
      S.view = 'time'; render();
      return document.getElementById('ct-nav-more').classList.contains('active');
    });
    expect(onFolded).toBe(true);

    const onPrimary = await page.evaluate(() => {
      S.view = 'contracts'; render();
      return document.getElementById('ct-nav-more').classList.contains('active');
    });
    expect(onPrimary).toBe(false);
  });

  // A worker who cannot see Bank gets a toast if the bar offers it. The sheet
  // should not offer it either.
  test('it does not offer a view the user cannot open', async ({ page }) => {
    await boot(page, 'maintenance');
    const views = await page.evaluate(() => {
      const real = window.canOpenView;
      window.canOpenView = v => v !== 'bank' && real(v);
      const out = ctNavSheetViews();
      window.canOpenView = real;
      return out;
    });
    expect(views).not.toContain('bank');
    expect(views).toContain('invoices');
  });

  // attachShellHandlers() binds an onclick to every .nav-btn, and More carries
  // that class so it looks like a tab. Left alone it replaces the sheet handler
  // on the next render with one that reads an absent data-view and navigates to
  // undefined — so the button silently stops working after the first redraw.
  test('More still opens the sheet after later renders', async ({ page }) => {
    await boot(page, 'maintenance');
    await page.evaluate(() => { render(); render(); });
    await page.click('#ct-nav-more');
    await expect(page.locator('[data-ct-nav="invoices"]')).toBeVisible();
    const view = await page.evaluate(() => S.view);
    expect(view).not.toBeUndefined();
  });

  test('labels and icons come off the real tabs, so they never disagree', async ({ page }) => {
    await boot(page, 'maintenance');
    const r = await page.evaluate(() => ({ label: ctNavLabel('invoices'), icon: ctNavIcon('invoices') }));
    expect(r.label.toLowerCase()).toContain('invoice');
    expect(r.icon).toContain('<svg');
  });
});

test.describe('section chips on the account page', () => {
  async function seed(page) {
    await page.evaluate(async (n) => {
      await saveCustomer({ id: 'cus_1', name: 'Whitaker Marina', email: 'a@b.com' });
      await ctSaveContract({
        id: 'ct_a', name: 'Dock maintenance', status: 'active', startDate: '2026-01-15',
        customerId: 'cus_1', visits: { freq: 'monthly' }, visitsThrough: '2027-01-15',
        billing: { freq: 'monthly', amount: 600 },
        checklist: [{ id: 'ck1', text: 'Check anodes' }],
      });
      await ctRunGeneration(ctPendingWork(n), { now: n });
      S.view = 'contracts'; S.ctDetail = 'ct_a'; render();
    }, NOW);
  }

  test('every chip points at a section that exists', async ({ page }) => {
    await boot(page, 'maintenance');
    await seed(page);
    const r = await page.evaluate(() => {
      const chips = [...document.querySelectorAll('[data-ct-jump]')];
      return chips.map(c => ({ label: c.textContent.trim(), target: !!document.getElementById(c.dataset.ctJump) }));
    });
    expect(r.length).toBe(5);
    expect(r.map(x => x.label)).toEqual(['Renewal', 'Proposal', 'Pricing', 'Visits', 'Invoices']);
    // A chip that scrolls to nothing is worse than no chip.
    r.forEach(x => expect(x.target, x.label + ' has no target').toBe(true));
  });

  // .content is a flex column, so a chip bar without flex:0 0 auto shrinks
  // against its taller siblings and renders as a row of empty pills.
  test('the chips are actually legible, not collapsed', async ({ page }) => {
    await boot(page, 'maintenance');
    await seed(page);
    const r = await page.evaluate(() => {
      const bar = document.querySelector('.ct-chips');
      const chip = document.querySelector('.ct-chip');
      return { barH: bar.getBoundingClientRect().height, chipH: chip.getBoundingClientRect().height, chipW: chip.getBoundingClientRect().width };
    });
    expect(r.barH).toBeGreaterThan(26);
    expect(r.chipH).toBeGreaterThan(24);
    expect(r.chipW).toBeGreaterThan(40);
  });

  test('tapping one scrolls the account page to it', async ({ page }) => {
    await boot(page, 'maintenance');
    await seed(page);
    const before = await page.evaluate(() => document.getElementById('content').scrollTop);
    expect(before).toBe(0);
    await page.click('[data-ct-jump="ct-sec-invoices"]');
    // The scroll is smooth, so measuring on the first frame past 100px catches
    // it mid-flight. Wait for two consecutive frames at the same offset.
    await page.waitForFunction(() => {
      const t = document.getElementById('content').scrollTop;
      const settled = window.__last === t && t > 100;
      window.__last = t;
      return settled;
    }, null, { timeout: 6000, polling: 120 });
    const after = await page.evaluate(() => {
      const box = document.getElementById('content');
      const el = document.getElementById('ct-sec-invoices');
      return {
        scrollTop: box.scrollTop,
        delta: el.getBoundingClientRect().top - box.getBoundingClientRect().top,
        viewH: box.clientHeight,
        atEnd: box.scrollTop + box.clientHeight >= box.scrollHeight - 2,
      };
    });
    expect(after.scrollTop).toBeGreaterThan(100);
    // The section is on screen and below the sticky bar rather than under it.
    // Invoices is the last section, so it can only come as far up as the end of
    // the page allows — "near the top, or the page is scrolled as far as it
    // goes" is the honest assertion.
    expect(after.delta).toBeGreaterThanOrEqual(0);
    expect(after.delta < 90 || after.atEnd, 'section should reach the top unless the page ran out').toBe(true);
    expect(after.delta).toBeLessThan(after.viewH);
  });

  test('the chip bar sticks to the top while the page scrolls', async ({ page }) => {
    await boot(page, 'maintenance');
    await seed(page);
    await page.click('[data-ct-jump="ct-sec-invoices"]');
    await page.waitForFunction(() => {
      const t = document.getElementById('content').scrollTop;
      const settled = window.__last === t && t > 100;
      window.__last = t;
      return settled;
    }, null, { timeout: 6000, polling: 120 });
    const visible = await page.evaluate(() => {
      const chips = document.querySelector('.ct-chips');
      const box = document.getElementById('content');
      const r = chips.getBoundingClientRect(), b = box.getBoundingClientRect();
      return r.top >= b.top - 1 && r.top < b.top + 40;
    });
    expect(visible).toBe(true);
  });

  test('the chips are not on the list, the route or the revenue book', async ({ page }) => {
    await boot(page, 'maintenance');
    await seed(page);
    const counts = await page.evaluate(() => {
      const n = () => document.querySelectorAll('[data-ct-jump]').length;
      const out = {};
      S.ctDetail = null; render(); out.list = n();
      S.ctRoute = ctDateKey(new Date()); render(); out.route = n();
      S.ctRoute = null; S.ctRevenue = true; render(); out.revenue = n();
      return out;
    });
    expect(counts).toEqual({ list: 0, route: 0, revenue: 0 });
  });
});
