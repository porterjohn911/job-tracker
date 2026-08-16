// The renewal board on the Contracts list.
//
// Visits stop when prepayment runs out. That is the safe behaviour, but it
// fails quietly — the crews simply stop being booked, and every card still
// reads "Active". The account page says so for one contract; this says it for
// all of them, so a lapse cannot hide in a list.
//
// Recurring businesses die of silent churn, so the cases below are about
// whether a lapse can go unnoticed, and whether the order is a usable work
// queue rather than an alphabetical list.

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
  await page.waitForFunction(() => typeof window.ctNeedsRenewal === 'function');
  await page.evaluate(() => {
    S.contracts = {}; S.jobs = {}; S.ctDetail = null; S.ctSearch = ''; S._ctWired = false;
    ctSaveContractsLocal();
  });
}

const visits = (over) => Object.assign({
  status: 'active', startDate: '2026-01-01', visits: { freq: 'monthly' },
}, over);

async function seed(page, list) {
  await page.evaluate(async (cs) => { for (const c of cs) await ctSaveContract(c); }, list);
}

test.describe('who needs renewing', () => {
  test('picks up lapsed and soon-to-lapse, leaves healthy ones alone', async ({ page }) => {
    await load(page);
    await seed(page, [
      visits({ id: 'ct_lapsed', name: 'Lapsed', visitsThrough: '2026-02-01' }),
      visits({ id: 'ct_soon', name: 'Soon', visitsThrough: '2026-04-01' }),
      visits({ id: 'ct_fine', name: 'Fine', visitsThrough: '2026-12-01' }),
      visits({ id: 'ct_never', name: 'Never paid', visitsThrough: '' }),
    ]);
    const r = await page.evaluate((now) => ctNeedsRenewal(now).map(x => ({ id: x.contract.id, level: x.state.level })), MARCH);
    expect(r.map(x => x.id)).toContain('ct_lapsed');
    expect(r.map(x => x.id)).toContain('ct_soon');
    expect(r.map(x => x.id)).toContain('ct_never');
    expect(r.map(x => x.id)).not.toContain('ct_fine');
    expect(r.find(x => x.id === 'ct_lapsed').level).toBe('urgent');
    expect(r.find(x => x.id === 'ct_soon').level).toBe('soon');
  });

  // The order is a work queue: what has already stopped, then what stops next.
  test('sorts stopped first, then by how soon', async ({ page }) => {
    await load(page);
    await seed(page, [
      visits({ id: 'ct_c', name: 'Soon 25d', visitsThrough: '2026-04-09' }),
      visits({ id: 'ct_a', name: 'Stopped long ago', visitsThrough: '2026-01-05' }),
      visits({ id: 'ct_d', name: 'Soon 5d', visitsThrough: '2026-03-20' }),
      visits({ id: 'ct_b', name: 'Stopped recently', visitsThrough: '2026-03-01' }),
    ]);
    const order = await page.evaluate((now) => ctNeedsRenewal(now).map(x => x.contract.name), MARCH);
    expect(order).toEqual(['Stopped long ago', 'Stopped recently', 'Soon 5d', 'Soon 25d']);
  });

  test('paused, ended and billing-only contracts are not chased', async ({ page }) => {
    await load(page);
    await seed(page, [
      visits({ id: 'ct_p', name: 'Paused', status: 'paused', visitsThrough: '2026-01-01' }),
      visits({ id: 'ct_e', name: 'Ended', status: 'ended', visitsThrough: '2026-01-01' }),
      { id: 'ct_r', name: 'Retainer', status: 'active', startDate: '2026-01-01', billing: { freq: 'monthly', amount: 500 } },
    ]);
    const r = await page.evaluate((now) => ctNeedsRenewal(now).length, MARCH);
    expect(r).toBe(0);
  });

  test('an agreement ending soon counts even when visits are paid up', async ({ page }) => {
    await load(page);
    await seed(page, [visits({ id: 'ct_a', name: 'Ending', visitsThrough: '2026-12-01', endDate: '2026-04-20' })]);
    const r = await page.evaluate((now) => ctNeedsRenewal(now).map(x => x.state.message), MARCH);
    expect(r[0]).toContain('agreement ends in 36 days');
  });
});

test.describe('the board', () => {
  test('appears above the cards and says what stopped', async ({ page }) => {
    await load(page);
    await seed(page, [
      visits({ id: 'ct_lapsed', name: 'Lapsed marina', visitsThrough: '2026-02-01' }),
      visits({ id: 'ct_fine', name: 'Healthy marina', visitsThrough: '2026-12-01' }),
    ]);
    const html = await page.evaluate((now) => renderContracts(now), MARCH);
    expect(html).toContain('Needs Renewing');
    expect(html).toContain('Lapsed marina');
    expect(html).toContain('STOPPED');
    expect(html).toContain('already stopped scheduling');
    // The board comes before the card list, because a lapse outranks browsing.
    expect(html.indexOf('Needs Renewing')).toBeLessThan(html.indexOf('Healthy marina'));
  });

  test('is absent entirely when every contract is healthy', async ({ page }) => {
    await load(page);
    await seed(page, [visits({ id: 'ct_a', name: 'Fine', visitsThrough: '2026-12-01' })]);
    const html = await page.evaluate((now) => renderContracts(now), MARCH);
    expect(html).not.toContain('Needs Renewing <span>');
    expect(html).toContain('Fine');
  });

  test('the KPI counts them, and reads green at zero', async ({ page }) => {
    await load(page);
    await seed(page, [
      visits({ id: 'ct_1', name: 'A', visitsThrough: '2026-02-01' }),
      visits({ id: 'ct_2', name: 'B', visitsThrough: '2026-04-01' }),
      visits({ id: 'ct_3', name: 'C', visitsThrough: '2026-12-01' }),
    ]);
    let r = await page.evaluate((now) => {
      document.getElementById('content').innerHTML = renderContracts(now);
      return {
        values: [...document.querySelectorAll('#content .kpi-value')].map(e => e.textContent.trim()),
        subs: [...document.querySelectorAll('#content .kpi-sub')].map(e => e.textContent.trim()),
      };
    }, MARCH);
    // Active / visits due / needs renewing / unbilled add-ons.
    expect(r.values[2]).toBe('2');
    expect(r.subs[2]).toBe('1 stopped scheduling');

    await page.evaluate(async () => {
      for (const c of ctContractList()) await ctSaveContract(Object.assign({}, c, { visitsThrough: '2026-12-01' }));
    });
    r = await page.evaluate((now) => {
      document.getElementById('content').innerHTML = renderContracts(now);
      return [...document.querySelectorAll('#content .kpi-value')].map(e => e.textContent.trim());
    }, MARCH);
    expect(r[2]).toBe('0');
  });

  test('a row opens that contract\'s account page', async ({ page }) => {
    await load(page);
    await seed(page, [visits({ id: 'ct_lapsed', name: 'Lapsed marina', visitsThrough: '2026-02-01' })]);
    await page.evaluate(() => { S.view = 'contracts'; render(); });
    await page.evaluate(() => document.querySelector('[data-ct="ct_lapsed"]').click());
    const r = await page.evaluate(() => ({
      detail: S.ctDetail,
      html: document.getElementById('content').innerHTML,
    }));
    expect(r.detail).toBe('ct_lapsed');
    expect(r.html).toContain('Needs renewing');
  });

  test('contract names in the board are escaped', async ({ page }) => {
    await load(page);
    await seed(page, [visits({ id: 'ct_x', name: '<img src=x onerror=alert(1)>', visitsThrough: '2026-02-01' })]);
    await page.evaluate((now) => { document.getElementById('content').innerHTML = renderContracts(now); }, MARCH);
    const imgs = await page.evaluate(() => document.querySelectorAll('#content img').length);
    expect(imgs).toBe(0);
  });
});
