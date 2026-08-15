// Contract records: normalization, the local cache, sync, and writes.
//
// index.html now loads the contract scripts, so these no longer inject them —
// re-injecting would re-execute the files and throw on the redeclared top-level
// consts. Booting the shell is enough, and it exercises the store against the
// app's real LS() company namespacing, S state and DB ref.
//
// The emphasis is on failing closed. A contract is the only record in this app
// that raises invoices by itself, so the cases below lean on what happens when
// a record is corrupt, contradictory, or hand-edited: it must land somewhere
// that generates nothing, never somewhere that bills someone.

const { expect, test } = require('@playwright/test');
const { stubExternals } = require('./_stubs');

async function load(page) {
  await stubExternals(page);
  await page.addInitScript(() => localStorage.setItem('jt_company', 'wfs'));
  await page.goto('/');
  await page.waitForFunction(() => typeof window.ctSaveContract === 'function');
  // Start every test from an empty store regardless of what the shell cached.
  await page.evaluate(() => { S.contracts = {}; S._ctWired = false; ctSaveContractsLocal(); });
}

test.describe('normalization fails closed', () => {
  test('an unrecognized status is held as paused, never active', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => ({
      typo: ctNormalizeContract({ id: 'c1', status: 'activ', startDate: '2026-01-01' }).status,
      empty: ctNormalizeContract({ id: 'c1', startDate: '2026-01-01' }).status,
      junk: ctNormalizeContract({ id: 'c1', status: { evil: true }, startDate: '2026-01-01' }).status,
      real: ctNormalizeContract({ id: 'c1', status: 'active', startDate: '2026-01-01' }).status,
      cased: ctNormalizeContract({ id: 'c1', status: 'ACTIVE', startDate: '2026-01-01' }).status,
    }));
    expect(r.typo).toBe('paused');
    expect(r.empty).toBe('paused');
    expect(r.junk).toBe('paused');
    expect(r.real).toBe('active');
    expect(r.cased).toBe('active');
  });

  // Silently dropping a bad end date would leave the contract billing forever,
  // so a contradictory record is parked instead.
  test('a contract ending before it starts is forced to paused', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const c = ctNormalizeContract({
        id: 'c1', status: 'active', startDate: '2026-06-01', endDate: '2026-01-01',
        billing: { freq: 'monthly', amount: 500 },
      });
      return { status: c.status, endDate: c.endDate, due: ctDuePeriods(c, 'billing', Date.now(), 0).length };
    });
    expect(r.status).toBe('paused');
    expect(r.endDate).toBe('2026-01-01');
    expect(r.due).toBe(0);
  });

  test('a corrupt record cannot reach a generating state', async ({ page }) => {
    await load(page);
    const due = await page.evaluate(() => {
      const junk = {
        id: 'c1', status: 'active', startDate: 'not-a-date',
        billing: { freq: 'whenever', amount: 'lots' },
        visits: 'weekly-ish',
      };
      const c = ctNormalizeContract(junk);
      return {
        billing: ctDuePeriods(c, 'billing', Date.now(), 0).length,
        visits: ctDuePeriods(c, 'visit', Date.now(), 60).length,
        billingField: c.billing, visitsField: c.visits, start: c.startDate,
      };
    });
    expect(due.billing).toBe(0);
    expect(due.visits).toBe(0);
    expect(due.billingField).toBeNull();
    expect(due.visitsField).toBeNull();
    expect(due.start).toBe('');
  });

  test('records with no id are rejected outright', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => [
      ctNormalizeContract(null), ctNormalizeContract({}), ctNormalizeContract({ id: '   ' }),
    ]);
    expect(r).toEqual([null, null, null]);
  });

  test('amounts are coerced to non-negative numbers', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => ['12.345', -50, 'free', null, Infinity, 1e3].map(v =>
      ctNormalizeContract({ id: 'c1', billing: { freq: 'monthly', amount: v } }).billing.amount));
    expect(r).toEqual([12.35, 0, 0, 0, 0, 1000]);
  });

  test('a valid contract survives a normalize round trip unchanged', async ({ page }) => {
    await load(page);
    const same = await page.evaluate(() => {
      const once = ctNormalizeContract({
        id: 'c1', name: 'Dock maintenance', customerId: 'cus_1', status: 'active',
        startDate: '2026-01-15', endDate: '2027-01-15',
        visits: { freq: 'monthly', interval: 1 },
        billing: { freq: 'annual', amount: 2400, items: [{ desc: 'Annual agreement', qty: 1, rate: 2400 }] },
        addons: { a1: { id: 'a1', desc: 'Callout', amount: 200, date: '2026-03-02' } },
      });
      return JSON.stringify(once) === JSON.stringify(ctNormalizeContract(once));
    });
    expect(same).toBe(true);
  });
});

test.describe('issues surfaced to the user', () => {
  test('a contract that does nothing says so', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => ({
      empty: ctContractIssues({ id: 'c1' }),
      noAmount: ctContractIssues({ id: 'c1', name: 'X', startDate: '2026-01-01', billing: { freq: 'monthly' } }),
      badStatus: ctContractIssues({ id: 'c1', name: 'X', status: 'activ', startDate: '2026-01-01', visits: { freq: 'weekly' } }),
      fine: ctContractIssues({
        id: 'c1', name: 'Dock care', status: 'active', startDate: '2026-01-01',
        billing: { freq: 'monthly', amount: 300 },
      }),
    }));
    expect(r.empty.join(' ')).toContain('does nothing');
    expect(r.noAmount.join(' ')).toContain('no amount');
    expect(r.badStatus.join(' ')).toContain('held as paused');
    expect(r.fine).toEqual([]);
  });
});

test.describe('new contracts', () => {
  test('start paused, so nothing bills before someone has looked at it', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const c = ctNewContract();
      return { status: c.status, hasId: /^ct_/.test(c.id), hasStart: !!c.startDate, due: ctDuePeriods(c, 'billing', Date.now(), 0).length };
    });
    expect(r.status).toBe('paused');
    expect(r.hasId).toBe(true);
    expect(r.hasStart).toBe(true);
    expect(r.due).toBe(0);
  });

  test('ids are unique across rapid creation', async ({ page }) => {
    await load(page);
    const unique = await page.evaluate(() => new Set(Array.from({ length: 200 }, () => ctNewId())).size);
    expect(unique).toBe(200);
  });
});

test.describe('local cache', () => {
  test('round-trips through the company-namespaced key', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async () => {
      await ctSaveContract({ id: 'ct_a', name: 'Marina sweep', status: 'active', startDate: '2026-01-01', billing: { freq: 'monthly', amount: 400 } });
      const key = LS('contracts');
      const rawHasIt = (localStorage.getItem(key) || '').indexOf('Marina sweep') > -1;
      S.contracts = {};
      const reloaded = ctLoadContractsLocal();
      return { key, rawHasIt, name: reloaded.ct_a && reloaded.ct_a.name, count: Object.keys(reloaded).length };
    });
    expect(r.key).toContain('contracts');
    expect(r.rawHasIt).toBe(true);
    expect(r.name).toBe('Marina sweep');
    expect(r.count).toBe(1);
  });

  test('a corrupt cache yields an empty store rather than throwing', async ({ page }) => {
    await load(page);
    const count = await page.evaluate(() => {
      localStorage.setItem(LS('contracts'), '{not json');
      return Object.keys(ctLoadContractsLocal()).length;
    });
    expect(count).toBe(0);
  });

  // The map key is the canonical id in both the cache and Firebase, so a record
  // whose id field went missing is recovered under its key rather than dropped.
  // What comes back is inert — paused, no schedules — so recovering it can never
  // resurrect something into a billing state.
  test('a record missing its id field is recovered from its key, inert', async ({ page }) => {
    await load(page);
    const r = await page.evaluate((now) => {
      localStorage.setItem(LS('contracts'), JSON.stringify({
        ct_ok: { id: 'ct_ok', name: 'Fine', status: 'active', startDate: '2026-01-01', billing: { freq: 'monthly', amount: 10 } },
        ct_hurt: { name: 'Lost its id', status: 'active', startDate: '2026-01-01' },
        ct_junk: { nope: true },
      }));
      const all = ctLoadContractsLocal();
      return {
        keys: Object.keys(all).sort(),
        recoveredId: all.ct_hurt && all.ct_hurt.id,
        recoveredName: all.ct_hurt && all.ct_hurt.name,
        junkStatus: all.ct_junk && all.ct_junk.status,
        junkGenerates: ctPlan(all.ct_junk, { now }).isEmpty,
        okGenerates: ctPlan(all.ct_ok, { now }).billing.length,
      };
    }, new Date(2026, 2, 15).getTime());
    expect(r.keys).toEqual(['ct_hurt', 'ct_junk', 'ct_ok']);
    expect(r.recoveredId).toBe('ct_hurt');
    expect(r.recoveredName).toBe('Lost its id');
    expect(r.junkStatus).toBe('paused');
    expect(r.junkGenerates).toBe(true);
    expect(r.okGenerates).toBe(3);
  });

  test('entries with no id and no key to recover from are dropped', async ({ page }) => {
    await load(page);
    const n = await page.evaluate(() => ctNormAddons([{ desc: 'no id' }, { id: 'a1', desc: 'ok' }]));
    expect(Object.keys(n)).toEqual(['a1']);
  });
});

test.describe('firebase sync', () => {
  test('incoming snapshots are normalized, so hand-edited data cannot bill', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      let handler = null;
      DB = { child: (p) => ({ path: p, on: (evt, cb) => { handler = cb; } }) };
      const wired = ctWireContractsData();
      handler({ val: () => ({
        ct_good: { id: 'ct_good', name: 'Good', status: 'active', startDate: '2026-01-01', billing: { freq: 'monthly', amount: 100 } },
        ct_bad: { id: 'ct_bad', name: 'Typo', status: 'actve', startDate: '2026-01-01', billing: { freq: 'monthly', amount: 100 } },
        ct_none: { nothing: true },
      }) });
      return {
        wired,
        ids: Object.keys(S.contracts).sort(),
        goodStatus: S.contracts.ct_good.status,
        badStatus: S.contracts.ct_bad.status,
        // Junk survives under its key but lands inert, which is the point: a
        // hand-edited node cannot arrive in a state that raises invoices.
        noneStatus: S.contracts.ct_none.status,
        noneBills: ctPlan(S.contracts.ct_none, { now: Date.now() }).isEmpty,
        badBills: ctPlan(S.contracts.ct_bad, { now: Date.now() }).isEmpty,
        goodBills: ctPlan(S.contracts.ct_good, { now: Date.now() }).billing.length > 0,
        cached: (localStorage.getItem(LS('contracts')) || '').indexOf('ct_good') > -1,
      };
    });
    expect(r.wired).toBe(true);
    expect(r.ids).toEqual(['ct_bad', 'ct_good', 'ct_none']);
    expect(r.goodStatus).toBe('active');
    expect(r.badStatus).toBe('paused');
    expect(r.noneStatus).toBe('paused');
    expect(r.noneBills).toBe(true);
    expect(r.badBills).toBe(true);
    expect(r.goodBills).toBe(true);
    expect(r.cached).toBe(true);
  });

  test('the listener attaches once, not on every visit to the tab', async ({ page }) => {
    await load(page);
    const attaches = await page.evaluate(() => {
      let n = 0;
      DB = { child: () => ({ on: () => { n++; } }) };
      ctWireContractsData(); ctWireContractsData(); ctWireContractsData();
      return n;
    });
    expect(attaches).toBe(1);
  });

  test('with no DB the store still works from cache', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async () => {
      DB = null;
      const saved = await ctSaveContract({ id: 'ct_x', name: 'Offline', status: 'active', startDate: '2026-01-01' });
      return { wired: ctWireContractsData(), saved: !!saved, inState: !!S.contracts.ct_x };
    });
    expect(r.wired).toBe(false);
    expect(r.saved).toBe(true);
    expect(r.inState).toBe(true);
  });
});

test.describe('writes', () => {
  test('saving stamps timestamps and preserves the original created date', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async () => {
      const first = await ctSaveContract({ id: 'ct_a', name: 'One', startDate: '2026-01-01' });
      const created = first.created;
      const second = await ctSaveContract(Object.assign({}, first, { name: 'Two' }));
      return { created, secondCreated: second.created, name: second.name, hasUpdated: second.updatedAt >= created };
    });
    expect(r.secondCreated).toBe(r.created);
    expect(r.name).toBe('Two');
    expect(r.hasUpdated).toBe(true);
  });

  test('writes reach the DB path scoped to the company', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async () => {
      const writes = [];
      DB = { child: (p) => ({ set: (v) => { writes.push({ path: p, id: v.id }); return Promise.resolve(); }, remove: () => { writes.push({ path: p, removed: true }); return Promise.resolve(); }, on: () => {} }) };
      await ctSaveContract({ id: 'ct_a', name: 'A', startDate: '2026-01-01' });
      await ctDeleteContract('ct_a');
      return writes;
    });
    expect(r[0]).toEqual({ path: 'contracts/ct_a', id: 'ct_a' });
    expect(r[1]).toEqual({ path: 'contracts/ct_a', removed: true });
  });

  test('pausing stops generation while keeping the record', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async (now) => {
      await ctSaveContract({ id: 'ct_a', name: 'A', status: 'active', startDate: '2026-01-01', billing: { freq: 'monthly', amount: 100 } });
      const before = ctPlan(ctGetContract('ct_a'), { now }).billing.length;
      await ctSetContractStatus('ct_a', 'paused');
      const after = ctPlan(ctGetContract('ct_a'), { now }).billing.length;
      const bogus = await ctSetContractStatus('ct_a', 'deleted');
      return { before, after, stillThere: !!ctGetContract('ct_a'), bogus, status: ctGetContract('ct_a').status };
    }, new Date(2026, 2, 15).getTime());
    expect(r.before).toBe(3);
    expect(r.after).toBe(0);
    expect(r.stillThere).toBe(true);
    expect(r.bogus).toBeNull();
    expect(r.status).toBe('paused');
  });

  test('deleting an unknown id is a no-op, not a crash', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async () => ({
      empty: await ctDeleteContract(''),
      missing: await ctDeleteContract('ct_nope'),
    }));
    expect(r.empty).toBe(false);
    expect(r.missing).toBe(true);
  });
});

test.describe('add-ons', () => {
  test('new add-ons are always unbilled, even if the caller says otherwise', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async () => {
      await ctSaveContract({ id: 'ct_a', name: 'A', status: 'active', startDate: '2026-01-01' });
      const a = await ctAddAddon('ct_a', { desc: 'Emergency callout', amount: 450, date: '2026-02-11', billedInvoiceId: 'i_forged' });
      return { billed: a.billedInvoiceId, pending: ctPendingAddons(ctGetContract('ct_a')).length };
    });
    expect(r.billed).toBeNull();
    expect(r.pending).toBe(1);
  });

  // The stamp is what stops the next run re-billing the same add-on, so
  // overwriting one would quietly re-open something already charged.
  test('an add-on cannot be stamped twice', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async () => {
      await ctSaveContract({ id: 'ct_a', name: 'A', status: 'active', startDate: '2026-01-01' });
      const a = await ctAddAddon('ct_a', { desc: 'Callout', amount: 450 });
      const first = await ctStampAddon('ct_a', a.id, 'inv_1');
      const second = await ctStampAddon('ct_a', a.id, 'inv_2');
      return {
        first: first.billedInvoiceId,
        second,
        stillFirst: ctGetContract('ct_a').addons[a.id].billedInvoiceId,
        pending: ctPendingAddons(ctGetContract('ct_a')).length,
      };
    });
    expect(r.first).toBe('inv_1');
    expect(r.second).toBeNull();
    expect(r.stillFirst).toBe('inv_1');
    expect(r.pending).toBe(0);
  });

  test('unstamping returns an add-on to the next run, for a voided invoice', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async () => {
      await ctSaveContract({ id: 'ct_a', name: 'A', status: 'active', startDate: '2026-01-01' });
      const a = await ctAddAddon('ct_a', { desc: 'Callout', amount: 450 });
      await ctStampAddon('ct_a', a.id, 'inv_1');
      const un = await ctUnstampAddon('ct_a', a.id);
      const again = await ctUnstampAddon('ct_a', a.id);
      return { un: un.billedInvoiceId, again, pending: ctPendingAddons(ctGetContract('ct_a')).length };
    });
    expect(r.un).toBeNull();
    expect(r.again).toBeNull();
    expect(r.pending).toBe(1);
  });

  test('stamping needs a real contract, add-on and invoice', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async () => {
      await ctSaveContract({ id: 'ct_a', name: 'A', status: 'active', startDate: '2026-01-01' });
      const a = await ctAddAddon('ct_a', { desc: 'Callout', amount: 100 });
      return {
        noContract: await ctStampAddon('ct_nope', a.id, 'inv_1'),
        noAddon: await ctStampAddon('ct_a', 'ad_nope', 'inv_1'),
        noInvoice: await ctStampAddon('ct_a', a.id, ''),
      };
    });
    expect(r.noContract).toBeNull();
    expect(r.noAddon).toBeNull();
    expect(r.noInvoice).toBeNull();
  });
});

test.describe('reads', () => {
  test('the list puts active first, then sorts by name', async ({ page }) => {
    await load(page);
    const names = await page.evaluate(async () => {
      await ctSaveContract({ id: 'ct_1', name: 'Zeta', status: 'active', startDate: '2026-01-01' });
      await ctSaveContract({ id: 'ct_2', name: 'Alpha', status: 'ended', startDate: '2026-01-01' });
      await ctSaveContract({ id: 'ct_3', name: 'Beta', status: 'active', startDate: '2026-01-01' });
      await ctSaveContract({ id: 'ct_4', name: 'Gamma', status: 'paused', startDate: '2026-01-01' });
      return ctContractList().map(c => c.name);
    });
    expect(names).toEqual(['Beta', 'Zeta', 'Gamma', 'Alpha']);
  });

  test('contracts can be found by customer', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async () => {
      await ctSaveContract({ id: 'ct_1', name: 'A', customerId: 'cus_1', startDate: '2026-01-01' });
      await ctSaveContract({ id: 'ct_2', name: 'B', customerId: 'cus_2', startDate: '2026-01-01' });
      await ctSaveContract({ id: 'ct_3', name: 'C', customerId: 'cus_1', startDate: '2026-01-01' });
      return { one: ctContractsForCustomer('cus_1').map(c => c.name), none: ctContractsForCustomer('').length };
    });
    expect(r.one).toEqual(['A', 'C']);
    expect(r.none).toBe(0);
  });

  test('planning across all contracts skips the ones with nothing to do', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async (now) => {
      await ctSaveContract({ id: 'ct_1', name: 'Billing', status: 'active', startDate: '2026-01-01', billing: { freq: 'monthly', amount: 100 } });
      await ctSaveContract({ id: 'ct_2', name: 'Paused', status: 'paused', startDate: '2026-01-01', billing: { freq: 'monthly', amount: 100 } });
      await ctSaveContract({ id: 'ct_3', name: 'Idle', status: 'active', startDate: '2026-01-01' });
      const plans = ctPlanAll({ now });
      return { ids: plans.map(p => p.contractId), billing: plans[0] && plans[0].billing.length };
    }, new Date(2026, 2, 15).getTime());
    expect(r.ids).toEqual(['ct_1']);
    expect(r.billing).toBe(3);
  });
});

test.describe('the shell still works with the code loaded', () => {
  test('a project company boots normally and syncs no contracts', async ({ page }) => {
    await stubExternals(page);
    await page.addInitScript(() => localStorage.setItem('jt_company', 'wfs'));
    await page.goto('/');
    await page.waitForFunction(() => typeof window.renderJobs === 'function');
    const r = await page.evaluate(() => ({
      appAlive: typeof window.renderJobs === 'function' && typeof window.buildInvoiceEmailHTML === 'function',
      type: ACTIVE_CO.type,
      enabled: ctEnabled(),
      // The listener must not attach for a company that does not use contracts:
      // the Firebase rules gate that node, so it would only earn a denial.
      wired: !!S._ctWired,
    }));
    expect(r.appAlive).toBe(true);
    expect(r.type).toBe('project');
    expect(r.enabled).toBe(false);
    expect(r.wired).toBe(false);
  });
});
