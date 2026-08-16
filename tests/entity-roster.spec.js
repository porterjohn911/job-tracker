// The managed entity roster.
//
// A management company's customers are the businesses it runs, and until now it
// got the maintenance build verbatim — day route, crew checklists and all. This
// is the first thing that is genuinely its own.
//
// The case carrying most weight here is the negative one, twice over: a project
// company and a MAINTENANCE company must both come out of this unchanged. The
// second is easy to forget, because everything else in src/app/contracts/ is
// shared between maintenance and management.
//
// After that, the discipline is the same as everywhere else in this feature: a
// fee the app cannot honestly work out returns null, never zero.

const { expect, test } = require('@playwright/test');
const { stubExternals } = require('./_stubs');

const NOW = new Date(2026, 5, 15).getTime();

async function boot(page, type, extraCompanies) {
  await stubExternals(page);
  await page.setViewportSize({ width: 430, height: 850 });
  await page.addInitScript((a) => {
    localStorage.setItem('jt_company', 'co');
    localStorage.setItem('jt_companies', JSON.stringify(Object.assign({
      co: { id: 'co', ns: 'co', label: 'Green Mountain', active: true, type: a.t },
    }, a.extra || {})));
  }, { t: type, extra: extraCompanies });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.render === 'function');
  await page.evaluate(() => {
    S.entities = {}; S.contracts = {}; S.jobs = {}; S.customers = {};
    S.meDetail = null; S.meSearch = ''; S._meWired = false; S._ctWired = false;
    if (typeof meSaveLocal === 'function') meSaveLocal();
    render();
  });
}

const WFS = { wfs: { id: 'wfs', ns: 'wfs', label: 'Waterfront Solutions', active: true, type: 'maintenance' } };

async function add(page, over) {
  return page.evaluate(async (o) => {
    const e = await meSave(Object.assign({
      id: 'me_a', name: 'Waterfront Dock Services', status: 'active', startDate: '2026-01-01',
      fee: { basis: 'flat', amount: 2500, freq: 'monthly', interval: 1 },
    }, o || {}));
    return e;
  }, over);
}

test.describe('who gets entities at all', () => {
  test('a project company gets nothing', async ({ page }) => {
    await boot(page, 'project');
    const r = await page.evaluate(() => ({
      enabled: meEnabled(),
      canOpen: canOpenView('entities'),
      tab: document.querySelector('.nav-btn[data-view="entities"]').style.display,
    }));
    expect(r.enabled).toBe(false);
    expect(r.canOpen).toBe(false);
    expect(r.tab).toBe('none');
  });

  // The one most likely to be got wrong: everything else in the contracts
  // directory is shared between maintenance and management, so it would be easy
  // for entities to leak onto the maintenance side too.
  test('a maintenance company gets nothing either', async ({ page }) => {
    await boot(page, 'maintenance');
    const r = await page.evaluate(() => ({
      enabled: meEnabled(),
      canOpen: canOpenView('entities'),
      tab: document.querySelector('.nav-btn[data-view="entities"]').style.display,
      contracts: ctEnabled(),
    }));
    expect(r.enabled).toBe(false);
    expect(r.canOpen).toBe(false);
    expect(r.tab).toBe('none');
    // And it still has everything it had.
    expect(r.contracts).toBe(true);
  });

  test('a management company gets the tab, and it leads the nav', async ({ page }) => {
    await boot(page, 'management');
    const r = await page.evaluate(() => ({
      enabled: meEnabled(),
      primary: ctNavPrimary(),
      visible: [...document.querySelectorAll('.nav-btn')].filter(b => b.style.display !== 'none').map(b => b.dataset.view || b.id),
      overflows: document.querySelector('.nav').scrollWidth > Math.ceil(document.querySelector('.nav').getBoundingClientRect().width),
    }));
    expect(r.enabled).toBe(true);
    expect(r.primary).toEqual(['dashboard', 'entities', 'contracts', 'schedule']);
    expect(r.visible).toContain('entities');
    // Jobs makes way for Entities rather than being added to an overflowing bar.
    expect(r.visible).not.toContain('jobs');
    expect(r.overflows).toBe(false);
  });

  test('a management company keeps its contracts', async ({ page }) => {
    await boot(page, 'management');
    const r = await page.evaluate(() => ({ ct: ctEnabled(), tab: document.querySelector('.nav-btn[data-view="contracts"]').style.display }));
    expect(r.ct).toBe(true);
    expect(r.tab).not.toBe('none');
  });
});

test.describe('the record', () => {
  test('a new entity starts paused, never billing by default', async ({ page }) => {
    await boot(page, 'management');
    const e = await page.evaluate(() => meNewEntity());
    expect(e.status).toBe('paused');
    expect(e.fee.basis).toBe('flat');
  });

  test('an unrecognized status falls to paused', async ({ page }) => {
    await boot(page, 'management');
    const e = await page.evaluate(() => meNormalize({ id: 'x', status: 'billing-hard' }));
    expect(e.status).toBe('paused');
  });

  test('a contradictory term is held as paused', async ({ page }) => {
    await boot(page, 'management');
    const e = await page.evaluate(() => meNormalize({ id: 'x', status: 'active', startDate: '2026-06-01', endDate: '2026-01-01' }));
    expect(e.status).toBe('paused');
    expect(await page.evaluate(() => meIssues({ id: 'x', status: 'active', startDate: '2026-06-01', endDate: '2026-01-01' })))
      .toContain('End date is before the start date — held as paused.');
  });

  // Someone comparing "what would 6% be?" against "what would $2,500 be?"
  // should be able to flip back and forth without retyping.
  test('switching basis keeps what was typed under the others', async ({ page }) => {
    await boot(page, 'management');
    const fee = await page.evaluate(() => meNormFee({
      basis: 'percent', amount: 2500, freq: 'monthly', percent: 6, markup: 15, rate: 95,
    }));
    expect(fee.basis).toBe('percent');
    expect(fee.amount).toBe(2500);
    expect(fee.markup).toBe(15);
    expect(fee.rate).toBe(95);
  });

  test('nonsense fee values are clamped inside what the rules accept', async ({ page }) => {
    await boot(page, 'management');
    const fee = await page.evaluate(() => meNormFee({
      basis: 'nope', amount: -50, percent: 900, markup: 9000, rate: 1e9, floor: 1e12, percentOf: 'vibes',
    }));
    expect(fee.basis).toBe('flat');
    expect(fee.amount).toBe(0);
    // A management fee at or above the entity's whole revenue is a typo.
    expect(fee.percent).toBe(0);
    expect(fee.markup).toBe(0);
    expect(fee.rate).toBeLessThanOrEqual(10000);
    expect(fee.floor).toBeLessThanOrEqual(1000000);
    expect(fee.percentOf).toBe('collected');
  });

  test('it saves, reads back and deletes', async ({ page }) => {
    await boot(page, 'management');
    await add(page);
    const after = await page.evaluate(() => ({ list: meList().map(e => e.name), one: meGet('me_a').fee.amount }));
    expect(after.list).toEqual(['Waterfront Dock Services']);
    expect(after.one).toBe(2500);

    await page.evaluate(() => meDelete('me_a'));
    expect(await page.evaluate(() => meList().length)).toBe(0);
  });

  test('active entities sort above paused and ended', async ({ page }) => {
    await boot(page, 'management');
    await page.evaluate(async () => {
      await meSave({ id: 'me_z', name: 'Zeta', status: 'active', startDate: '2026-01-01' });
      await meSave({ id: 'me_a', name: 'Alpha', status: 'ended', startDate: '2026-01-01' });
      await meSave({ id: 'me_m', name: 'Mid', status: 'paused', startDate: '2026-01-01' });
    });
    expect(await page.evaluate(() => meList().map(e => e.name))).toEqual(['Zeta', 'Mid', 'Alpha']);
  });
});

test.describe('fees the app can work out', () => {
  test('a flat fee normalizes to a month whatever its frequency', async ({ page }) => {
    await boot(page, 'management');
    const r = await page.evaluate(() => ({
      monthly: meFee({ fee: { basis: 'flat', amount: 2500, freq: 'monthly', interval: 1 } }).monthly,
      quarterly: meFee({ fee: { basis: 'flat', amount: 7500, freq: 'quarterly', interval: 1 } }).monthly,
      annual: meFee({ fee: { basis: 'flat', amount: 30000, freq: 'annual', interval: 1 } }).monthly,
      weekly: meFee({ fee: { basis: 'flat', amount: 100, freq: 'weekly', interval: 1 } }).monthly,
    }));
    expect(r.monthly).toBe(2500);
    expect(r.quarterly).toBe(2500);
    expect(r.annual).toBe(2500);
    // 52/12, not four weeks — the same arithmetic the contracts book uses.
    expect(r.weekly).toBeCloseTo(433.333, 2);
  });

  test('a flat fee with no amount is unknown, not zero', async ({ page }) => {
    await boot(page, 'management');
    const f = await page.evaluate(() => meFee({ fee: { basis: 'flat', amount: 0, freq: 'monthly' } }));
    expect(f.monthly).toBeNull();
    expect(f.needs).toContain('an amount');
  });
});

test.describe('fees the app cannot yet work out', () => {
  // Zero would say "this entity pays nothing", which is a different and far
  // more dangerous claim than "nobody has told me yet".
  test('percentage, cost-plus and hourly all return null rather than zero', async ({ page }) => {
    await boot(page, 'management', WFS);
    const r = await page.evaluate(() => ({
      pct: meFee({ companyId: 'wfs', fee: { basis: 'percent', percent: 6, percentOf: 'collected' } }),
      cp: meFee({ fee: { basis: 'costplus', markup: 15 } }),
      hr: meFee({ fee: { basis: 'hourly', rate: 95 } }),
    }));
    [r.pct, r.cp, r.hr].forEach(f => expect(f.monthly).toBeNull());
    expect(r.pct.needs.join(' ')).toContain('cross-company revenue');
    expect(r.cp.needs.join(' ')).toContain("GMM's own costs");
    expect(r.hr.needs.join(' ')).toContain('time logged against this entity');
  });

  test('a percentage fee reads back as prose even when it cannot compute', async ({ page }) => {
    await boot(page, 'management', WFS);
    const label = await page.evaluate(() => meFeeLabel({
      fee: { basis: 'percent', percent: 6, percentOf: 'collected', floor: 2000, cap: 0 },
    }));
    expect(label).toBe('6% of collected · at least $2,000.00');
  });

  // An estimate off device-local cached data is worth offering and must never
  // be mistaken for a billable figure.
  test('a percentage estimate is labelled as cached, not live', async ({ page }) => {
    await boot(page, 'management', WFS);
    const f = await page.evaluate(() => {
      S.owner = { wfs: [{ id: 'j1', status: 'complete', invoices: [{ items: [{ qty: 1, rate: 10000 }], paid: 8000 }] }] };
      return meFee({ companyId: 'wfs', fee: { basis: 'percent', percent: 6, percentOf: 'collected' } });
    });
    expect(f.monthly).toBeNull();
    expect(f.estimate).toBeCloseTo(480, 5);
    expect(f.estimateNote).toContain('on this device');
    expect(f.estimateNote).toContain('not live');
  });

  test('a floor lifts the estimate and a cap holds it down', async ({ page }) => {
    await boot(page, 'management', WFS);
    const r = await page.evaluate(() => {
      S.owner = { wfs: [{ id: 'j1', status: 'complete', invoices: [{ items: [{ qty: 1, rate: 10000 }], paid: 8000 }] }] };
      return {
        floored: meFee({ companyId: 'wfs', fee: { basis: 'percent', percent: 6, percentOf: 'collected', floor: 2000 } }).estimate,
        capped: meFee({ companyId: 'wfs', fee: { basis: 'percent', percent: 6, percentOf: 'collected', cap: 100 } }).estimate,
      };
    });
    expect(r.floored).toBe(2000);
    expect(r.capped).toBe(100);
  });

  test('no cached data says so rather than reading as zero revenue', async ({ page }) => {
    await boot(page, 'management', WFS);
    const f = await page.evaluate(() => meFee({ companyId: 'wfs', fee: { basis: 'percent', percent: 6 } }));
    expect(f.estimate).toBeNull();
    expect(f.estimateNote).toContain('No data for Waterfront Solutions on this device');
  });
});

test.describe('the roll-up keeps known and unknown apart', () => {
  test('the monthly total counts only fees it can actually work out', async ({ page }) => {
    await boot(page, 'management', WFS);
    await page.evaluate(async () => {
      await meSave({ id: 'me_1', name: 'Flat one', status: 'active', startDate: '2026-01-01', fee: { basis: 'flat', amount: 2500, freq: 'monthly' } });
      await meSave({ id: 'me_2', name: 'Percent one', status: 'active', startDate: '2026-01-01', companyId: 'wfs', fee: { basis: 'percent', percent: 6 } });
      await meSave({ id: 'me_3', name: 'Paused one', status: 'paused', startDate: '2026-01-01', fee: { basis: 'flat', amount: 9999, freq: 'monthly' } });
    });
    const b = await page.evaluate(n => meBook(n), NOW);
    expect(b.activeCount).toBe(2);
    expect(b.monthly).toBe(2500);
    expect(b.pendingCount).toBe(1);
    // The paused one is not in the total, and the pending one has not been
    // guessed at and added in.
    expect(b.monthly).not.toBe(12499);
  });

  test('a broken company link is counted and called out', async ({ page }) => {
    await boot(page, 'management');
    await add(page, { companyId: 'gone', fee: { basis: 'flat', amount: 1000, freq: 'monthly' } });
    const r = await page.evaluate(n => ({ book: meBook(n), broken: meLinkBroken(meGet('me_a')) }), NOW);
    expect(r.broken).toBe(true);
    expect(r.book.broken).toBe(1);
  });

  test('a live link is not broken', async ({ page }) => {
    await boot(page, 'management', WFS);
    await add(page, { companyId: 'wfs' });
    const r = await page.evaluate(() => ({ broken: meLinkBroken(meGet('me_a')), label: meLinkedLabel('wfs') }));
    expect(r.broken).toBe(false);
    expect(r.label).toBe('Waterfront Solutions');
  });
});

test.describe('the roster', () => {
  test('an empty roster explains what an entity is', async ({ page }) => {
    await boot(page, 'management');
    const html = await page.evaluate(n => renderEntities(n), NOW);
    expect(html).toContain('No managed entities yet');
    expect(html).toContain('books are kept elsewhere');
    expect(html).not.toContain('$0.00');
  });

  test('it leads with the fees it knows and flags the ones it does not', async ({ page }) => {
    await boot(page, 'management', WFS);
    await page.evaluate(async () => {
      await meSave({ id: 'me_1', name: 'Flat one', status: 'active', startDate: '2026-01-01', fee: { basis: 'flat', amount: 2500, freq: 'monthly' } });
      await meSave({ id: 'me_2', name: 'Percent one', status: 'active', startDate: '2026-01-01', companyId: 'wfs', fee: { basis: 'percent', percent: 6 } });
    });
    const html = await page.evaluate(n => renderEntities(n), NOW);
    expect(html).toContain('$2,500.00');
    expect(html).toContain('Not yet computable');
    expect(html).toContain('counts only the 1 entity');
    expect(html).toContain('not yet computable');
  });

  test('the detail page says what is missing in a sentence', async ({ page }) => {
    await boot(page, 'management');
    await add(page, { fee: { basis: 'hourly', rate: 95 } });
    const html = await page.evaluate(n => { S.meDetail = 'me_a'; return renderEntities(n); }, NOW);
    expect(html).toContain('Needs management time logged against this entity.');
    expect(html).toContain('$95.00 an hour');
  });

  test('a rough figure is marked as not billable', async ({ page }) => {
    await boot(page, 'management', WFS);
    await page.evaluate(async () => {
      S.owner = { wfs: [{ id: 'j1', status: 'complete', invoices: [{ items: [{ qty: 1, rate: 10000 }], paid: 8000 }] }] };
      await meSave({ id: 'me_a', name: 'Pct', status: 'active', startDate: '2026-01-01', companyId: 'wfs', fee: { basis: 'percent', percent: 6 } });
      S.meDetail = 'me_a';
    });
    const html = await page.evaluate(n => renderEntities(n), NOW);
    expect(html).toContain('Rough figure only');
    expect(html).toContain('Do not bill from this');
  });
});

test.describe('the editor', () => {
  test('it round-trips every basis through the form', async ({ page }) => {
    await boot(page, 'management', WFS);
    await add(page);
    const fee = await page.evaluate(() => {
      openEntityForm(meGet('me_a'));
      document.getElementById('me-basis').value = 'percent';
      document.getElementById('me-percent').value = '6.5';
      document.getElementById('me-percent-of').value = 'invoiced';
      document.getElementById('me-floor').value = '2000';
      document.getElementById('me-company').value = 'wfs';
      return meNormalize(meReadForm(meGet('me_a'))).fee;
    });
    expect(fee.basis).toBe('percent');
    expect(fee.percent).toBe(6.5);
    expect(fee.percentOf).toBe('invoiced');
    expect(fee.floor).toBe(2000);
    // The flat amount that was already there survives the switch.
    expect(fee.amount).toBe(2500);
  });

  test('changing the basis shows only that basis\'s fields', async ({ page }) => {
    await boot(page, 'management');
    await add(page);
    const shown = await page.evaluate(() => {
      openEntityForm(meGet('me_a'));
      const sel = document.getElementById('me-basis');
      sel.value = 'hourly';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return ['flat', 'percent', 'costplus', 'hourly']
        .filter(b => document.getElementById('me-fee-' + b).style.display !== 'none');
    });
    expect(shown).toEqual(['hourly']);
  });

  test('the hint says what a fee comes to, or why it cannot', async ({ page }) => {
    await boot(page, 'management');
    await add(page);
    const flat = await page.evaluate(() => {
      openEntityForm(meGet('me_a'));
      const el = document.getElementById('me-amount');
      el.value = '3000';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return document.getElementById('me-fee-hint').textContent;
    });
    expect(flat).toContain('$3,000.00 a month');
    expect(flat).toContain('$36,000.00 a year');

    const hourly = await page.evaluate(() => {
      const sel = document.getElementById('me-basis');
      sel.value = 'hourly';
      document.getElementById('me-rate').value = '95';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return document.getElementById('me-fee-hint').textContent;
    });
    expect(hourly).toContain('Needs management time');
  });

  // A company that has since been archived must not be silently unlinked just
  // because someone opened the editor.
  test('a link to a missing company survives opening the editor', async ({ page }) => {
    await boot(page, 'management');
    await add(page, { companyId: 'gone' });
    const kept = await page.evaluate(() => {
      openEntityForm(meGet('me_a'));
      return meReadForm(meGet('me_a')).companyId;
    });
    expect(kept).toBe('gone');
  });

  test('the roster opens an entity and comes back', async ({ page }) => {
    await boot(page, 'management');
    await add(page);
    await page.evaluate(() => { S.view = 'entities'; render(); });
    await page.click('[data-me="me_a"]');
    await expect(page.locator('text=Managed entity')).toBeVisible();
    await page.click('[data-me-back]');
    await expect(page.locator('#btn-me-add')).toBeVisible();
  });
});

test.describe('the tab gate fails closed', () => {
  // Shipped visible and hidden later, every way the gating can fail to run —
  // a slow first paint, a stale cached bundle, an exception thrown earlier in
  // attachShellHandlers — leaves a company looking at a tab that is not theirs.
  // A maintenance company seeing Entities is exactly that failure.
  test('both type-gated tabs are hidden in the markup before any JS runs', async ({ page }) => {
    const html = require('fs').readFileSync('index.html', 'utf8');
    ['entities', 'contracts'].forEach(v => {
      const m = html.match(new RegExp('<button class="nav-btn" data-view="' + v + '"[^>]*>'));
      expect(m, v + ' button not found').toBeTruthy();
      expect(m[0], v + ' must ship hidden').toContain('display:none');
    });
  });

  test('a maintenance company never shows Entities, even mid-load', async ({ page }) => {
    await stubExternals(page);
    await page.addInitScript(() => {
      localStorage.setItem('jt_company', 'co');
      localStorage.setItem('jt_companies', JSON.stringify({
        co: { id: 'co', ns: 'co', label: 'Maint', active: true, type: 'maintenance' },
      }));
    });
    // Sampled from the very first paint, before boot has necessarily finished.
    await page.goto('/', { waitUntil: 'commit' });
    const everShown = await page.evaluate(async () => {
      let seen = false;
      for (let i = 0; i < 40; i++) {
        const b = document.querySelector('.nav-btn[data-view="entities"]');
        if (b && b.getBoundingClientRect().width > 0) seen = true;
        await new Promise(r => setTimeout(r, 25));
      }
      return seen;
    });
    expect(everShown).toBe(false);
  });

  // The gating used to sit below $('setup-link').onclick — a TypeError there
  // skipped it entirely and left the static markup showing.
  test('an exception later in attachShellHandlers cannot reveal the tab', async ({ page }) => {
    await boot(page, 'maintenance');
    const r = await page.evaluate(() => {
      // Remove an element the wiring below the gate dereferences unguarded.
      document.getElementById('setup-link')?.remove();
      let threw = false;
      try { attachShellHandlers(); } catch (e) { threw = true; }
      const b = document.querySelector('.nav-btn[data-view="entities"]');
      return { threw, display: b.style.display, contracts: document.querySelector('.nav-btn[data-view="contracts"]').style.display };
    });
    expect(r.threw).toBe(true);
    // Gated first, so the throw below it changes nothing.
    expect(r.display).toBe('none');
    expect(r.contracts).toBe('');
  });

  test('a management company still gets Entities revealed', async ({ page }) => {
    await boot(page, 'management');
    const d = await page.evaluate(() => document.querySelector('.nav-btn[data-view="entities"]').style.display);
    expect(d).toBe('');
  });

  test('a project company gets neither', async ({ page }) => {
    await boot(page, 'project');
    const r = await page.evaluate(() => ({
      entities: document.querySelector('.nav-btn[data-view="entities"]').style.display,
      contracts: document.querySelector('.nav-btn[data-view="contracts"]').style.display,
    }));
    expect(r.entities).toBe('none');
    expect(r.contracts).toBe('none');
  });

  // Switching a company's type in the editor updates ACTIVE_CO in place, so the
  // tab has to be able to come back without a reload.
  test('a tab that becomes relevant mid-session comes back', async ({ page }) => {
    await boot(page, 'maintenance');
    const after = await page.evaluate(() => {
      ACTIVE_CO.type = 'management';
      applyTypeGatedTabs();
      return document.querySelector('.nav-btn[data-view="entities"]').style.display;
    });
    expect(after).toBe('');
  });
});
