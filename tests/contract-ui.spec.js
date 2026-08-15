// The Contracts view and its editor.
//
// index.html now loads the contract scripts, so these no longer inject them —
// re-injecting would re-execute the files and throw on the redeclared top-level
// consts. The view is still rendered by calling renderContracts() directly so
// each case can pin a fixed date; contract-gate.spec.js covers the real router.
//
// Beyond checking that things render, these lean on the two ways a contracts
// UI misleads someone: showing a contract as running when it will silently
// generate nothing, and making already-billed money look unbilled.

const { expect, test } = require('@playwright/test');
const { stubExternals } = require('./_stubs');

const MARCH = new Date(2026, 2, 15).getTime();

async function load(page) {
  await stubExternals(page);
  await page.addInitScript(() => localStorage.setItem('jt_company', 'wfs'));
  await page.goto('/');
  await page.waitForFunction(() => typeof window.renderContracts === 'function');
  await page.evaluate(() => { S.contracts = {}; S.ctSearch = ''; S._ctWired = false; ctSaveContractsLocal(); });
}

// Render the view into the real content area so handlers can be wired against it.
async function mount(page, nowTs) {
  await page.evaluate((now) => {
    document.getElementById('content').innerHTML = renderContracts(now);
    attachContractHandlers();
  }, nowTs);
}

async function seed(page, contracts) {
  await page.evaluate(async (list) => {
    for (const c of list) await ctSaveContract(c);
  }, contracts);
}

test.describe('labels', () => {
  test('frequencies read naturally at every interval', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => [
      ctFreqLabel({ freq: 'weekly' }),
      ctFreqLabel({ freq: 'weekly', interval: 3 }),
      ctFreqLabel({ freq: 'monthly' }),
      ctFreqLabel({ freq: 'quarterly' }),
      ctFreqLabel({ freq: 'annual' }),
      ctFreqLabel({ freq: 'monthly', interval: 2 }),
      ctFreqLabel(null),
      ctFreqLabel({ freq: 'whenever' }),
    ]);
    expect(r).toEqual(['Weekly', 'Every 3 weeks', 'Monthly', 'Quarterly', 'Annually', 'Every 2 months', '', '']);
  });

  test('the next date is the next one ahead, not one already passed', async ({ page }) => {
    await load(page);
    const r = await page.evaluate((now) => {
      const c = ctNormalizeContract({ id: 'c1', status: 'active', startDate: '2026-01-01', billing: { freq: 'monthly' }, visits: { freq: 'weekly' }, visitsThrough: '2026-12-31' });
      return {
        bill: ctDateKey(ctNextDate(c, 'billing', now)),
        visit: ctDateKey(ctNextDate(c, 'visit', now)),
        paused: ctNextDate(ctNormalizeContract({ id: 'c2', status: 'paused', startDate: '2026-01-01', billing: { freq: 'monthly' } }), 'billing', now),
        expired: ctNextDate(ctNormalizeContract({ id: 'c3', status: 'active', startDate: '2026-01-01', endDate: '2026-02-01', billing: { freq: 'monthly' } }), 'billing', now),
        noSchedule: ctNextDate(c, 'nonsense', now),
      };
    }, MARCH);
    expect(r.bill).toBe('2026-04-01');
    expect(r.visit).toBe('2026-03-19');
    expect(r.paused).toBeNull();
    expect(r.expired).toBeNull();
    expect(r.noSchedule).toBeNull();
  });

  test('upcoming counts the window ahead, not overdue history', async ({ page }) => {
    await load(page);
    const r = await page.evaluate((now) => {
      const c = ctNormalizeContract({ id: 'c1', status: 'active', startDate: '2026-01-01', visits: { freq: 'weekly' }, visitsThrough: '2026-04-14' });
      return {
        // Weekly from Jan 1 to the Apr 14 horizon is 15 occurrences, but only
        // Mar 19 / Mar 26 / Apr 2 / Apr 9 are still ahead on Mar 15.
        due: ctDuePeriods(c, 'visit', now, 30).length,
        upcoming: ctUpcoming(c, 'visit', now, 30).map(p => p.dateKey),
      };
    }, MARCH);
    expect(r.due).toBe(15);
    expect(r.upcoming).toEqual(['2026-03-19', '2026-03-26', '2026-04-02', '2026-04-09']);
  });
});

test.describe('the view', () => {
  test('the empty state explains what a contract is', async ({ page }) => {
    await load(page);
    await mount(page, MARCH);
    const html = await page.evaluate(() => document.getElementById('content').innerHTML);
    expect(html).toContain('No contracts yet');
    expect(html).toContain('start paused');
    expect(html).toContain('btn-ct-add');
  });

  test('cards show schedule, next dates and status', async ({ page }) => {
    await load(page);
    await seed(page, [{
      id: 'ct_a', name: 'Dock maintenance', status: 'active', startDate: '2026-01-01',
      visits: { freq: 'monthly' }, visitsThrough: '2027-01-01', billing: { freq: 'annual', amount: 2400 },
    }]);
    await mount(page, MARCH);
    const html = await page.evaluate(() => document.getElementById('content').innerHTML);
    expect(html).toContain('Dock maintenance');
    expect(html).toContain('monthly visits');
    expect(html).toContain('billed annually');
    expect(html).toContain('Next visit');
    expect(html).toContain('Active');
  });

  test('KPIs count active contracts, visits due and unbilled add-ons', async ({ page }) => {
    await load(page);
    await seed(page, [
      { id: 'ct_a', name: 'A', status: 'active', startDate: '2026-01-01', visits: { freq: 'weekly' }, visitsThrough: '2026-12-31' },
      { id: 'ct_b', name: 'B', status: 'paused', startDate: '2026-01-01', visits: { freq: 'weekly' }, visitsThrough: '2026-12-31' },
    ]);
    await page.evaluate(async () => {
      await ctAddAddon('ct_a', { desc: 'Callout', amount: 450 });
      const billed = await ctAddAddon('ct_a', { desc: 'Part', amount: 1000 });
      await ctStampAddon('ct_a', billed.id, 'inv_9');
    });
    await mount(page, MARCH);
    const r = await page.evaluate(() => ({
      values: [...document.querySelectorAll('#content .kpi-value')].map(el => el.textContent.trim()),
      subs: [...document.querySelectorAll('#content .kpi-sub')].map(el => el.textContent.trim()),
    }));
    // One active of two. Four weekly visits still ahead in the next 30 days —
    // the paused contract contributes none. Only the unbilled add-on counts
    // toward what is owed; the $1,000 already billed must not.
    expect(r.values).toEqual(['1', '4', '$450.00']);
    expect(r.subs[0]).toBe('of 2 contracts');
    expect(r.subs[2]).toBe('1 item');
  });

  // A contract that looks Active but generates nothing is the failure most
  // likely to go unnoticed, so the card says so without needing a click.
  test('a contract that will not generate is flagged on its card', async ({ page }) => {
    await load(page);
    await seed(page, [
      { id: 'ct_a', name: 'Does nothing', status: 'active', startDate: '2026-01-01' },
      { id: 'ct_b', name: 'Bills nothing', status: 'active', startDate: '2026-01-01', billing: { freq: 'monthly' } },
    ]);
    await mount(page, MARCH);
    const html = await page.evaluate(() => document.getElementById('content').innerHTML);
    expect(html).toContain('⚠');
    expect(html).toContain('does nothing');
    expect(html).toContain('no amount');
  });

  test('pending add-ons are called out, billed ones are not', async ({ page }) => {
    await load(page);
    await seed(page, [{ id: 'ct_a', name: 'A', status: 'active', startDate: '2026-01-01', billing: { freq: 'monthly', amount: 100 } }]);
    await page.evaluate(async () => {
      const a = await ctAddAddon('ct_a', { desc: 'Billed already', amount: 999 });
      await ctStampAddon('ct_a', a.id, 'inv_1');
    });
    await mount(page, MARCH);
    let html = await page.evaluate(() => document.getElementById('content').innerHTML);
    expect(html).not.toContain('unbilled add-on');

    await page.evaluate(async () => { await ctAddAddon('ct_a', { desc: 'New', amount: 75 }); });
    await mount(page, MARCH);
    html = await page.evaluate(() => document.getElementById('content').innerHTML);
    expect(html).toContain('1 unbilled add-on');
    expect(html).toContain('$75.00');
  });

  test('search filters by name and customer', async ({ page }) => {
    await load(page);
    await page.evaluate(async () => {
      S.customers = { cus_1: { id: 'cus_1', name: 'Whitaker Marina' } };
      await ctSaveContract({ id: 'ct_a', name: 'Dock care', customerId: 'cus_1', startDate: '2026-01-01' });
      await ctSaveContract({ id: 'ct_b', name: 'Seawall watch', startDate: '2026-01-01' });
    });
    const r = await page.evaluate((now) => {
      const byName = (S.ctSearch = 'seawall', renderContracts(now));
      const byCustomer = (S.ctSearch = 'whitaker', renderContracts(now));
      const none = (S.ctSearch = 'zzzz', renderContracts(now));
      S.ctSearch = '';
      return {
        nameHas: byName.includes('Seawall watch') && !byName.includes('Dock care'),
        custHas: byCustomer.includes('Dock care') && !byCustomer.includes('Seawall watch'),
        noneMsg: none.includes('No contracts match'),
      };
    }, MARCH);
    expect(r.nameHas).toBe(true);
    expect(r.custHas).toBe(true);
    expect(r.noneMsg).toBe(true);
  });

  test('untrusted text is escaped, not injected', async ({ page }) => {
    await load(page);
    await seed(page, [{ id: 'ct_a', name: '<img src=x onerror=alert(1)>', status: 'paused', startDate: '2026-01-01' }]);
    await mount(page, MARCH);
    const r = await page.evaluate(() => ({
      imgs: document.querySelectorAll('#content img').length,
      escaped: document.getElementById('content').innerHTML.includes('&lt;img'),
    }));
    expect(r.imgs).toBe(0);
    expect(r.escaped).toBe(true);
  });
});

test.describe('the editor', () => {
  test('opens blank for a new contract, paused', async ({ page }) => {
    await load(page);
    await mount(page, MARCH);
    await page.click('#btn-ct-add');
    const r = await page.evaluate(() => ({
      title: document.querySelector('.modal-title').textContent,
      status: document.getElementById('ct-status').value,
      name: document.getElementById('ct-name').value,
      hasDelete: !!document.getElementById('ct-del'),
      hasAddons: !!document.getElementById('ct-addon-add'),
    }));
    expect(r.title).toBe('New Contract');
    expect(r.status).toBe('paused');
    expect(r.name).toBe('');
    // No delete or add-ons until it exists.
    expect(r.hasDelete).toBe(false);
    expect(r.hasAddons).toBe(false);
  });

  test('a card opens its contract prefilled', async ({ page }) => {
    await load(page);
    await seed(page, [{
      id: 'ct_a', name: 'Dock care', status: 'active', startDate: '2026-01-05', endDate: '2027-01-05',
      visits: { freq: 'monthly', interval: 2 }, billing: { freq: 'annual', amount: 2400 },
    }]);
    await mount(page, MARCH);
    await page.click('[data-ct="ct_a"]');
    const r = await page.evaluate(() => ({
      title: document.querySelector('.modal-title').textContent,
      name: document.getElementById('ct-name').value,
      status: document.getElementById('ct-status').value,
      start: document.getElementById('ct-start').value,
      end: document.getElementById('ct-end').value,
      visitFreq: document.getElementById('ct-visit-freq').value,
      visitInterval: document.getElementById('ct-visit-interval').value,
      billFreq: document.getElementById('ct-bill-freq').value,
      billAmount: document.getElementById('ct-bill-amount').value,
      hasDelete: !!document.getElementById('ct-del'),
    }));
    expect(r).toEqual({
      title: 'Edit Contract', name: 'Dock care', status: 'active',
      start: '2026-01-05', end: '2027-01-05',
      visitFreq: 'monthly', visitInterval: '2', billFreq: 'annual', billAmount: '2400',
      hasDelete: true,
    });
  });

  test('saving writes what was typed and closes', async ({ page }) => {
    await load(page);
    await mount(page, MARCH);
    await page.click('#btn-ct-add');
    await page.fill('#ct-name', 'Quarterly pressure wash');
    await page.selectOption('#ct-visit-freq', 'quarterly');
    await page.selectOption('#ct-bill-freq', 'monthly');
    await page.fill('#ct-bill-amount', '250');
    await page.fill('#ct-start', '2026-02-01');
    await page.selectOption('#ct-status', 'active');
    await page.click('#ct-save');
    const r = await page.evaluate(() => {
      const c = ctContractList()[0];
      return {
        open: !!document.getElementById('ct-bd'),
        name: c.name, status: c.status, start: c.startDate,
        visits: c.visits, billing: { freq: c.billing.freq, amount: c.billing.amount },
      };
    });
    expect(r.open).toBe(false);
    expect(r.name).toBe('Quarterly pressure wash');
    expect(r.status).toBe('active');
    expect(r.start).toBe('2026-02-01');
    expect(r.visits).toEqual({ freq: 'quarterly', interval: 1 });
    expect(r.billing).toEqual({ freq: 'monthly', amount: 250 });
  });

  test('a contract with no name is refused', async ({ page }) => {
    await load(page);
    await mount(page, MARCH);
    await page.click('#btn-ct-add');
    await page.click('#ct-save');
    const r = await page.evaluate(() => ({ open: !!document.getElementById('ct-bd'), count: ctContractList().length }));
    expect(r.open).toBe(true);
    expect(r.count).toBe(0);
  });

  // Normalization parks a contradictory contract. The editor has to say so —
  // walking away believing it is running is exactly how a period gets missed.
  test('asking for active on a contradictory contract says it was held', async ({ page }) => {
    await load(page);
    await mount(page, MARCH);
    await page.click('#btn-ct-add');
    await page.fill('#ct-name', 'Backwards');
    await page.fill('#ct-start', '2026-06-01');
    await page.fill('#ct-end', '2026-01-01');
    await page.selectOption('#ct-status', 'active');
    await page.click('#ct-save');
    const r = await page.evaluate(() => ({
      status: ctContractList()[0].status,
      toast: (document.querySelector('.toast') || {}).textContent || '',
    }));
    expect(r.status).toBe('paused');
    expect(r.toast).toContain('held as paused');
  });

  test('the issue banner appears for a contract that does nothing', async ({ page }) => {
    await load(page);
    await seed(page, [{ id: 'ct_a', name: 'Idle', status: 'active', startDate: '2026-01-01' }]);
    await mount(page, MARCH);
    await page.click('[data-ct="ct_a"]');
    const text = await page.evaluate(() => document.querySelector('.modal-body').textContent);
    expect(text).toContain('will not do what you expect');
    expect(text).toContain('does nothing');
  });

  test('add-ons can be added and removed, but billed ones cannot', async ({ page }) => {
    await load(page);
    await seed(page, [{ id: 'ct_a', name: 'A', status: 'active', startDate: '2026-01-01', billing: { freq: 'monthly', amount: 100 } }]);
    await mount(page, MARCH);
    await page.click('[data-ct="ct_a"]');

    await page.fill('#ct-addon-desc', 'Emergency callout');
    await page.fill('#ct-addon-amount', '450');
    await page.click('#ct-addon-add');
    let r = await page.evaluate(() => ({
      pending: ctPendingAddons(ctGetContract('ct_a')).length,
      removable: document.querySelectorAll('[data-ct-addon-rm]').length,
    }));
    expect(r.pending).toBe(1);
    expect(r.removable).toBe(1);

    // Once billed, the Remove button is gone and the invoice is shown instead.
    await page.evaluate(async () => {
      const a = ctPendingAddons(ctGetContract('ct_a'))[0];
      await ctStampAddon('ct_a', a.id, 'inv_42');
      openContractForm(ctGetContract('ct_a'));
    });
    r = await page.evaluate(() => ({
      removable: document.querySelectorAll('[data-ct-addon-rm]').length,
      shows: document.querySelector('.modal-body').textContent.includes('billed on inv_42'),
    }));
    expect(r.removable).toBe(0);
    expect(r.shows).toBe(true);
  });

  test('deleting removes the contract after confirmation', async ({ page }) => {
    await load(page);
    await seed(page, [{ id: 'ct_a', name: 'Going away', status: 'paused', startDate: '2026-01-01' }]);
    await mount(page, MARCH);
    page.on('dialog', d => d.accept());
    await page.click('[data-ct="ct_a"]');
    await page.click('#ct-del');
    const count = await page.evaluate(() => ctContractList().length);
    expect(count).toBe(0);
  });

  test('cancel and backdrop close without saving', async ({ page }) => {
    await load(page);
    await mount(page, MARCH);
    await page.click('#btn-ct-add');
    await page.fill('#ct-name', 'Never saved');
    await page.click('#ct-cancel');
    const r = await page.evaluate(() => ({ open: !!document.getElementById('ct-bd'), count: ctContractList().length }));
    expect(r.open).toBe(false);
    expect(r.count).toBe(0);
  });
});
