// Period math for recurring contracts.
//
// The file under test is NOT loaded by index.html — it is injected into a blank
// page here. That is deliberate twice over: the running app cannot be affected
// by code it never fetches, and loading it with no shell around it proves it
// depends on nothing (no DOM, no Firebase, no app state).
//
// The cases below are weighted toward the ways recurring billing goes wrong in
// production rather than the happy path: month-end contracts walking backwards
// off the end of short months, weekly contracts drifting across a daylight
// saving boundary, and — the one that costs you a customer — a generation run
// that fires twice and bills the period twice.

const { expect, test } = require('@playwright/test');

const SRC = 'src/app/contracts/01-contract-periods.js';

async function load(page) {
  await page.goto('about:blank');
  await page.addScriptTag({ path: SRC });
  await page.waitForFunction(() => typeof window.ctDuePeriods === 'function');
}

// A contract with only the fields the period math reads.
function contract(over) {
  return Object.assign({
    id: 'ct_test', name: 'Test contract', status: 'active',
    startDate: '2026-01-01', endDate: '', visits: null, billing: null, addons: {},
  }, over || {});
}

// Local-midnight timestamp, so tests never depend on the runner's timezone.
const AT = (y, m, d) => new Date(y, m - 1, d).getTime();

test.describe('occurrence dates', () => {
  test('weekly steps seven calendar days', async ({ page }) => {
    await load(page);
    const keys = await page.evaluate(() => {
      const norm = ctNormalizeSchedule({ freq: 'weekly' });
      return [0, 1, 2, 3].map(n => ctDateKey(ctOccurrenceDate('2026-01-01', norm, n)));
    });
    expect(keys).toEqual(['2026-01-01', '2026-01-08', '2026-01-15', '2026-01-22']);
  });

  test('interval multiplies the base frequency', async ({ page }) => {
    await load(page);
    const keys = await page.evaluate(() => {
      const norm = ctNormalizeSchedule({ freq: 'weekly', interval: 2 });
      return [0, 1, 2].map(n => ctDateKey(ctOccurrenceDate('2026-01-01', norm, n)));
    });
    expect(keys).toEqual(['2026-01-01', '2026-01-15', '2026-01-29']);
  });

  test('quarterly and annual step in months', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => ({
      quarterly: [0, 1, 2, 3].map(n => ctDateKey(ctOccurrenceDate('2026-01-15', ctNormalizeSchedule({ freq: 'quarterly' }), n))),
      annual: [0, 1, 2].map(n => ctDateKey(ctOccurrenceDate('2026-03-01', ctNormalizeSchedule({ freq: 'annual' }), n))),
    }));
    expect(r.quarterly).toEqual(['2026-01-15', '2026-04-15', '2026-07-15', '2026-10-15']);
    expect(r.annual).toEqual(['2026-03-01', '2027-03-01', '2028-03-01']);
  });

  // The trap: step from the clamped date instead of the anchor and a contract
  // starting Jan 31 becomes Feb 28 → Mar 28 → Apr 28, sliding a few days
  // earlier every short month until it no longer lands where it was sold.
  test('month-end contracts clamp without drifting', async ({ page }) => {
    await load(page);
    const keys = await page.evaluate(() => {
      const norm = ctNormalizeSchedule({ freq: 'monthly' });
      return [0, 1, 2, 3, 4, 5].map(n => ctDateKey(ctOccurrenceDate('2026-01-31', norm, n)));
    });
    expect(keys).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31',
      '2026-04-30', '2026-05-31', '2026-06-30',
    ]);
  });

  test('February clamping follows the leap year', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const norm = ctNormalizeSchedule({ freq: 'monthly' });
      return {
        leap: ctDateKey(ctOccurrenceDate('2024-01-31', norm, 1)),
        common: ctDateKey(ctOccurrenceDate('2026-01-31', norm, 1)),
      };
    });
    expect(r.leap).toBe('2024-02-29');
    expect(r.common).toBe('2026-02-28');
  });

  // Weekly schedules built by adding 7*24*60*60*1000 milliseconds land an hour
  // off across a DST change and eventually report the previous calendar day.
  // Calendar arithmetic keeps every occurrence on the same weekday.
  test('weekly holds its weekday across daylight saving', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const norm = ctNormalizeSchedule({ freq: 'weekly' });
      const days = [], keys = [];
      for (let n = 0; n < 12; n++) {
        const d = ctOccurrenceDate('2026-02-22', norm, n);
        days.push(d.getDay());
        keys.push(ctDateKey(d));
      }
      return { unique: [...new Set(days)], keys };
    });
    expect(r.unique).toHaveLength(1);
    // Spans the 2026 US spring-forward (March 8).
    expect(r.keys).toContain('2026-03-01');
    expect(r.keys).toContain('2026-03-08');
    expect(r.keys).toContain('2026-03-15');
  });

  test('date keys are local, not UTC-shifted', async ({ page }) => {
    await load(page);
    // new Date('2026-09-07') is UTC midnight — the 6th anywhere west of GMT.
    const key = await page.evaluate(() => ctDateKey(ctParseDate('2026-09-07')));
    expect(key).toBe('2026-09-07');
  });
});

test.describe('schedule normalization', () => {
  test('absent or unusable schedules yield no periods, not an error', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => ({
      none: ctNormalizeSchedule(null),
      empty: ctNormalizeSchedule({}),
      bogus: ctNormalizeSchedule({ freq: 'fortnightly' }),
      due: ctDuePeriods({ id: 'c', status: 'active', startDate: '2026-01-01', visits: null }, 'visit', Date.now(), 60).length,
    }));
    expect(r.none).toBeNull();
    expect(r.empty).toBeNull();
    expect(r.bogus).toBeNull();
    expect(r.due).toBe(0);
  });

  test('a bad interval falls back to 1 rather than generating nothing', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => [0, -3, 2.5, null, 'x'].map(v => ctNormalizeSchedule({ freq: 'monthly', interval: v }).step));
    expect(r).toEqual([1, 1, 1, 1, 1]);
  });
});

test.describe('due periods and the horizon', () => {
  test('billing stops at today — no invoicing a period that has not started', async ({ page }) => {
    await load(page);
    const keys = await page.evaluate((now) => {
      const c = { id: 'ct_1', status: 'active', startDate: '2026-01-01', billing: { freq: 'monthly' } };
      return ctDuePeriods(c, 'billing', now, 0).map(p => p.dateKey);
    }, AT(2026, 3, 15));
    expect(keys).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
  });

  test('visits look ahead by the horizon so the calendar shows upcoming work', async ({ page }) => {
    await load(page);
    const r = await page.evaluate((now) => {
      const c = { id: 'ct_1', status: 'active', startDate: '2026-03-02', visits: { freq: 'weekly' } };
      return {
        ahead: ctDuePeriods(c, 'visit', now, 28).map(p => p.dateKey),
        none: ctDuePeriods(c, 'visit', now, 0).map(p => p.dateKey),
      };
    }, AT(2026, 3, 2));
    expect(r.ahead).toEqual(['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23', '2026-03-30']);
    expect(r.none).toEqual(['2026-03-02']);
  });

  test('the contract end date bounds generation ahead of the horizon', async ({ page }) => {
    await load(page);
    const keys = await page.evaluate((now) => {
      const c = { id: 'ct_1', status: 'active', startDate: '2026-03-02', endDate: '2026-03-20', visits: { freq: 'weekly' } };
      return ctDuePeriods(c, 'visit', now, 365).map(p => p.dateKey);
    }, AT(2026, 3, 2));
    expect(keys).toEqual(['2026-03-02', '2026-03-09', '2026-03-16']);
  });

  test('paused, ended, future and unknown-status contracts generate nothing', async ({ page }) => {
    await load(page);
    const r = await page.evaluate((now) => {
      const base = { id: 'ct_1', startDate: '2026-01-01', billing: { freq: 'monthly' } };
      const count = over => ctDuePeriods(Object.assign({}, base, over), 'billing', now, 0).length;
      return {
        active: count({ status: 'active' }),
        paused: count({ status: 'paused' }),
        ended: count({ status: 'ended' }),
        unknown: count({ status: 'whatever' }),
        missing: count({}),
        notStarted: count({ status: 'active', startDate: '2027-01-01' }),
        expired: count({ status: 'active', endDate: '2025-06-01' }),
      };
    }, AT(2026, 3, 15));
    expect(r.active).toBe(3);
    expect(r.paused).toBe(0);
    expect(r.ended).toBe(0);
    expect(r.unknown).toBe(0);
    expect(r.missing).toBe(0);
    expect(r.notStarted).toBe(0);
    expect(r.expired).toBe(0);
  });
});

test.describe('period keys', () => {
  test('keys are stable, and distinct per contract and kind', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => ({
      visit: ctPeriodKey('ct_9f2', 'visit', '2026-09-07'),
      billing: ctPeriodKey('ct_9f2', 'billing', '2026-09-07'),
      other: ctPeriodKey('ct_aaa', 'visit', '2026-09-07'),
      repeat: ctPeriodKey('ct_9f2', 'visit', '2026-09-07'),
      badKind: ctPeriodKey('ct_9f2', 'nonsense', '2026-09-07'),
      noId: ctPeriodKey('', 'visit', '2026-09-07'),
    }));
    expect(r.visit).toBe('ct_9f2:v:2026-09-07');
    expect(r.billing).toBe('ct_9f2:b:2026-09-07');
    expect(r.visit).toBe(r.repeat);
    expect(new Set([r.visit, r.billing, r.other]).size).toBe(3);
    expect(r.badKind).toBe('');
    expect(r.noId).toBe('');
  });
});

test.describe('idempotency', () => {
  // The one that matters. Two devices, a double-click, a retry after a dropped
  // connection — the second run must find nothing left to do.
  test('a second run creates nothing', async ({ page }) => {
    await load(page);
    const r = await page.evaluate((now) => {
      const c = {
        id: 'ct_1', status: 'active', startDate: '2026-01-01',
        visits: { freq: 'weekly' }, billing: { freq: 'monthly' },
      };
      const first = ctPlan(c, { now, visitHorizonDays: 60 });
      // Pretend the run wrote them: records now carry their period keys.
      const jobs = first.visits.map(p => ({ id: 'j' + p.index, periodKey: p.key }));
      const invoices = first.billing.map(p => ({ id: 'i' + p.index, periodKey: p.key }));
      const second = ctPlan(c, {
        now, visitHorizonDays: 60,
        existingJobKeys: ctExistingKeys(jobs),
        existingInvoiceKeys: ctExistingKeys(invoices),
      });
      return {
        firstVisits: first.visits.length, firstBilling: first.billing.length,
        secondVisits: second.visits.length, secondBilling: second.billing.length,
        secondEmpty: second.isEmpty,
      };
    }, AT(2026, 3, 15));
    expect(r.firstVisits).toBeGreaterThan(0);
    expect(r.firstBilling).toBe(3);
    expect(r.secondVisits).toBe(0);
    expect(r.secondBilling).toBe(0);
    expect(r.secondEmpty).toBe(true);
  });

  test('a partial run leaves exactly the rest, and time advancing adds only new periods', async ({ page }) => {
    await load(page);
    const r = await page.evaluate((t) => {
      const c = { id: 'ct_1', status: 'active', startDate: '2026-01-01', billing: { freq: 'monthly' } };
      const all = ctPlan(c, { now: t.march }).billing;
      // Only the first two were written before the run was interrupted.
      const partial = ctExistingKeys(all.slice(0, 2).map(p => ({ periodKey: p.key })));
      const resumed = ctPlan(c, { now: t.march, existingInvoiceKeys: partial }).billing;
      const written = ctExistingKeys(all.map(p => ({ periodKey: p.key })));
      const later = ctPlan(c, { now: t.april, existingInvoiceKeys: written }).billing;
      return {
        resumed: resumed.map(p => p.dateKey),
        later: later.map(p => p.dateKey),
      };
    }, { march: AT(2026, 3, 15), april: AT(2026, 4, 15) });
    expect(r.resumed).toEqual(['2026-03-01']);
    expect(r.later).toEqual(['2026-04-01']);
  });

  test('existing keys are accepted as a Set, an array, or a record map', async ({ page }) => {
    await load(page);
    const r = await page.evaluate((now) => {
      const c = { id: 'ct_1', status: 'active', startDate: '2026-01-01', billing: { freq: 'monthly' } };
      const due = ctDuePeriods(c, 'billing', now, 0);
      const keys = due.map(p => p.key);
      return {
        set: ctMissingPeriods(due, new Set(keys)).length,
        array: ctMissingPeriods(due, keys).length,
        map: ctMissingPeriods(due, { a: keys[0], b: keys[1], c: keys[2] }).length,
        none: ctMissingPeriods(due, null).length,
      };
    }, AT(2026, 3, 15));
    expect(r.set).toBe(0);
    expect(r.array).toBe(0);
    expect(r.map).toBe(0);
    expect(r.none).toBe(3);
  });

  test('records without a period key are ignored, so existing jobs never collide', async ({ page }) => {
    await load(page);
    const size = await page.evaluate(() => ctExistingKeys([
      { id: 'j1', name: 'Dock rebuild' },
      { id: 'j2', name: 'Seawall repair' },
      { id: 'j3', periodKey: 'ct_1:v:2026-01-01' },
    ]).size);
    expect(size).toBe(1);
  });
});

test.describe('add-ons', () => {
  test('unbilled add-ons are pending; stamped ones are never picked up again', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const c = {
        id: 'ct_1', status: 'active', startDate: '2026-01-01',
        addons: {
          a1: { id: 'a1', desc: 'Emergency callout', amount: 450, date: '2026-02-11' },
          a2: { id: 'a2', desc: 'Replacement cleat', amount: 85, date: '2026-01-04', billedInvoiceId: 'i_77' },
          a3: { id: 'a3', desc: 'Extra pressure wash', amount: 300, date: '2026-01-20' },
        },
      };
      const pending = ctPendingAddons(c);
      return { ids: pending.map(a => a.id), total: ctAddonsTotal(pending) };
    });
    // Oldest first, and the billed one is gone.
    expect(r.ids).toEqual(['a3', 'a1']);
    expect(r.total).toBe(750);
  });

  test('add-ons ride along with any billing run and are independent of the schedule', async ({ page }) => {
    await load(page);
    const r = await page.evaluate((now) => {
      const addons = { a1: { id: 'a1', desc: 'Callout', amount: 200, date: '2026-02-01' } };
      // A contract billed annually still surfaces the add-on today.
      const annual = ctPlan({ id: 'ct_1', status: 'active', startDate: '2026-01-01', billing: { freq: 'annual' }, addons }, { now });
      // So does one with no billing schedule at all.
      const none = ctPlan({ id: 'ct_2', status: 'active', startDate: '2026-01-01', addons }, { now });
      return {
        annualBilling: annual.billing.length, annualAddons: annual.addons.length,
        noneBilling: none.billing.length, noneAddons: none.addons.length, noneEmpty: none.isEmpty,
      };
    }, AT(2026, 3, 15));
    expect(r.annualBilling).toBe(1);
    expect(r.annualAddons).toBe(1);
    expect(r.noneBilling).toBe(0);
    expect(r.noneAddons).toBe(1);
    expect(r.noneEmpty).toBe(false);
  });

  test('empty and malformed add-ons are skipped', async ({ page }) => {
    await load(page);
    const ids = await page.evaluate(() => ctPendingAddons({
      addons: {
        good: { id: 'good', desc: 'Real work', amount: 100 },
        zeroButNamed: { id: 'zeroButNamed', desc: 'Warranty visit', amount: 0 },
        blank: { id: 'blank', desc: '   ', amount: 0 },
        noId: { desc: 'Orphan', amount: 50 },
        nothing: null,
      },
    }).map(a => a.id));
    expect(ids.sort()).toEqual(['good', 'zeroButNamed']);
  });
});

test.describe('the two cycles are independent', () => {
  test('weekly visits billed annually keep separate counts and keys', async ({ page }) => {
    await load(page);
    const r = await page.evaluate((now) => {
      const c = {
        id: 'ct_1', status: 'active', startDate: '2026-01-05',
        visits: { freq: 'weekly' }, billing: { freq: 'annual' },
      };
      const plan = ctPlan(c, { now, visitHorizonDays: 0 });
      return {
        visits: plan.visits.length,
        billing: plan.billing.length,
        overlap: plan.visits.filter(v => plan.billing.some(b => b.key === v.key)).length,
      };
    }, AT(2026, 3, 15));
    expect(r.visits).toBe(10);
    expect(r.billing).toBe(1);
    expect(r.overlap).toBe(0);
  });

  test('billing with no visits is a retainer and needs no extra mode', async ({ page }) => {
    await load(page);
    const r = await page.evaluate((now) => {
      const c = { id: 'ct_gmm', status: 'active', startDate: '2026-01-01', visits: null, billing: { freq: 'monthly' } };
      const plan = ctPlan(c, { now });
      return { visits: plan.visits.length, billing: plan.billing.map(p => p.dateKey) };
    }, AT(2026, 3, 15));
    expect(r.visits).toBe(0);
    expect(r.billing).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
  });
});
