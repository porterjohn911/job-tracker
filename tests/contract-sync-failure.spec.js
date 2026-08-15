// A rejected contract write must be loud.
//
// Reproduces a bug found in production: a contract was created, appeared, and
// then vanished with nothing said.
//
// The cause was a stale Firebase rules deploy. The rules reject unknown fields
// at every level, so a client writing a field the deployed rules did not know
// about (visitsThrough, added after the rules were last published) had its
// whole write denied. Firebase applies writes optimistically, so the contract
// rendered, the server rejected it, the revert arrived, and the sync listener
// overwrote S.contracts with server truth.
//
// None of that was visible, because the write sat inside a swallowed
// try/catch copied from saveCustomer. That is survivable for a customer record.
// A contract turns into invoices, so a save that did not save has to say so.

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
  await page.waitForFunction(() => typeof window.ctSaveContract === 'function');
  await page.evaluate(() => {
    S.contracts = {}; S.jobs = {}; S.ctDetail = null; S.ctSearch = ''; S._ctWired = false;
    ctSaveContractsLocal();
  });
}

// A DB whose writes are refused the way Firebase refuses them.
const DENY = `
  DB = {
    child: () => ({
      set: () => Promise.reject(Object.assign(new Error('permission_denied at /wfs/contracts'), { code: 'PERMISSION_DENIED' })),
      remove: () => Promise.reject(Object.assign(new Error('permission_denied at /wfs/contracts'), { code: 'PERMISSION_DENIED' })),
      on: () => {},
    }),
  };
`;

test.describe('a denied write', () => {
  test('throws instead of reporting success', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async (deny) => {
      eval(deny);
      let threw = false;
      try {
        await ctSaveContract({ id: 'ct_a', name: 'Dock care', status: 'active', startDate: '2026-01-01' });
      } catch (e) { threw = true; }
      return { threw };
    }, DENY);
    expect(r.threw).toBe(true);
  });

  // The message that sends someone to the right place. "Could not save" alone
  // starts a hunt through the app; this names the actual cause.
  test('names the likely cause when Firebase refuses permission', async ({ page }) => {
    await load(page);
    const toastText = await page.evaluate(async (deny) => {
      eval(deny);
      try { await ctSaveContract({ id: 'ct_a', name: 'Dock care', status: 'active', startDate: '2026-01-01' }); } catch (e) {}
      return (document.querySelector('.toast') || {}).textContent || '';
    }, DENY);
    expect(toastText).toContain('rules may not be deployed');
  });

  test('a non-permission failure still reports, in general terms', async ({ page }) => {
    await load(page);
    const toastText = await page.evaluate(async () => {
      DB = { child: () => ({ set: () => Promise.reject(new Error('network down')), on: () => {} }) };
      try { await ctSaveContract({ id: 'ct_a', name: 'Dock care', status: 'active', startDate: '2026-01-01' }); } catch (e) {}
      return (document.querySelector('.toast') || {}).textContent || '';
    });
    expect(toastText).toContain('Could not save contract');
  });

  test('deleting reports its failure too', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async (deny) => {
      await ctSaveContract({ id: 'ct_a', name: 'Dock care', status: 'active', startDate: '2026-01-01' });
      eval(deny);
      let threw = false;
      try { await ctDeleteContract('ct_a'); } catch (e) { threw = true; }
      return { threw, toast: (document.querySelector('.toast') || {}).textContent || '' };
    }, DENY);
    expect(r.threw).toBe(true);
    expect(r.toast).toContain('rules may not be deployed');
  });
});

test.describe('the editor', () => {
  // Closing on a failed save is what produced "it saved and then disappeared":
  // the modal shuts, the contract shows for a moment, and the sync listener
  // then reverts it. Staying open keeps the work and matches what happened.
  test('stays open and keeps the typed work when the save is refused', async ({ page }) => {
    await load(page);
    await page.evaluate(() => { S.view = 'contracts'; render(); });
    await page.click('#btn-ct-add');
    await page.fill('#ct-name', 'Monthly dock maintenance');
    await page.selectOption('#ct-visit-freq', 'monthly');
    await page.evaluate((deny) => { eval(deny); }, DENY);
    await page.click('#ct-save');
    const r = await page.evaluate(() => ({
      open: !!document.getElementById('ct-bd'),
      name: document.getElementById('ct-name').value,
      freq: document.getElementById('ct-visit-freq').value,
      toast: (document.querySelector('.toast') || {}).textContent || '',
      claimedSuccess: ((document.querySelector('.toast') || {}).textContent || '').includes('saved'),
    }));
    expect(r.open).toBe(true);
    expect(r.name).toBe('Monthly dock maintenance');
    expect(r.freq).toBe('monthly');
    expect(r.toast).toContain('rules may not be deployed');
    expect(r.claimedSuccess).toBe(false);
  });

  test('a successful save still closes and confirms', async ({ page }) => {
    await load(page);
    await page.evaluate(() => { S.view = 'contracts'; render(); });
    await page.click('#btn-ct-add');
    await page.fill('#ct-name', 'Monthly dock maintenance');
    await page.click('#ct-save');
    const r = await page.evaluate(() => ({
      open: !!document.getElementById('ct-bd'),
      count: ctContractList().length,
      toast: (document.querySelector('.toast') || {}).textContent || '',
    }));
    expect(r.open).toBe(false);
    expect(r.count).toBe(1);
    expect(r.toast).toContain('Contract saved');
  });
});

test.describe('offline still works', () => {
  test('with no DB at all, saving succeeds against the local cache', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async () => {
      DB = null;
      const saved = await ctSaveContract({ id: 'ct_a', name: 'Offline', status: 'active', startDate: '2026-01-01' });
      S.contracts = {};
      return { saved: !!saved, reloaded: Object.keys(ctLoadContractsLocal()) };
    });
    expect(r.saved).toBe(true);
    expect(r.reloaded).toEqual(['ct_a']);
  });
});

test.describe('the field that caused it', () => {
  // Every contract writes visitsThrough, even when empty, so stale rules reject
  // every save rather than only ones with a paid-through date. That is why the
  // symptom was "every time", not "sometimes".
  test('visitsThrough is written on every contract, empty or not', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const bare = ctNormalizeContract({ id: 'ct_a', name: 'No dates' });
      const withDate = ctNormalizeContract({ id: 'ct_b', name: 'Paid', visitsThrough: '2026-12-01' });
      return {
        bareHasKey: Object.prototype.hasOwnProperty.call(bare, 'visitsThrough'),
        bareValue: bare.visitsThrough,
        withValue: withDate.visitsThrough,
      };
    });
    expect(r.bareHasKey).toBe(true);
    expect(r.bareValue).toBe('');
    expect(r.withValue).toBe('2026-12-01');
  });

  test('the deployed rules must permit it — this is the check that would have caught it', async () => {
    const { readFileSync } = require('fs');
    const { join } = require('path');
    const rules = JSON.parse(readFileSync(join(__dirname, '..', 'database.rules.json'), 'utf8')).rules;
    const contract = rules['$company'].contracts.$contractId;
    // Unknown fields are rejected, so any field the client writes needs a rule.
    expect(contract.$other['.validate']).toBe(false);
    expect(contract.visitsThrough).toBeTruthy();
  });
});
