// The contracts feature gate, exercised through the real app.
//
// This is the spec that matters for PR 5. The contract scripts now ship to
// every company, so what keeps Waterfront, Manufactured Housing and Norris Lake
// unchanged is not that the code is absent — it is that the gate says no. These
// cases drive the actual shell: real nav markup, real router, real boot code.
//
// Two independent conditions have to hold together:
//   the company must be maintenance/management, and
//   the user must be a manager or owner (matching the Firebase rules, which
//   gate the contracts node the same way payrates is gated).

const { expect, test } = require('@playwright/test');
const { stubExternals } = require('./_stubs');

// Boot the shell with a company registry entry of the given type. Omitting the
// type is the important case: it is every company that exists today.
async function boot(page, opts) {
  const o = opts || {};
  await stubExternals(page);
  await page.addInitScript((cfg) => {
    localStorage.setItem('jt_company', 'wfs');
    const co = { id: 'wfs', ns: 'wfs', label: 'Waterfront Solutions', active: true };
    if (cfg.type !== undefined) co.type = cfg.type;
    localStorage.setItem('jt_companies', JSON.stringify({ wfs: co }));
    if (cfg.role) {
      localStorage.setItem('jt_access', JSON.stringify({
        enabled: true,
        members: [{ id: 'm1', name: 'Test User', role: cfg.role, company: 'wfs', pin: '1234' }],
      }));
      localStorage.setItem('jt_session', 'm1');
    } else {
      localStorage.removeItem('jt_access');
      localStorage.removeItem('jt_session');
    }
  }, { type: o.type, role: o.role || '' });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.renderJobs === 'function');
}

const state = (page) => page.evaluate(() => ({
  type: ACTIVE_CO.type,
  enabled: ctEnabled(),
  companyUses: ctCompanyUsesContracts(),
  canOpen: canOpenView('contracts'),
  navHidden: document.querySelector('.nav-btn[data-view="contracts"]').style.display === 'none',
  wired: !!S._ctWired,
}));

test.describe('companies that do project work — every company today', () => {
  // The registry entries in production carry no type at all. This is the case
  // that guarantees merging PR 5 changes nothing for anyone.
  test('a company with no type set sees nothing', async ({ page }) => {
    await boot(page, {});
    const r = await state(page);
    expect(r.type).toBe('project');
    expect(r.companyUses).toBe(false);
    expect(r.enabled).toBe(false);
    expect(r.canOpen).toBe(false);
    expect(r.navHidden).toBe(true);
    // The sync listener must not attach: the Firebase rules gate that node, so
    // attaching it here would only produce a permission denial on every load.
    expect(r.wired).toBe(false);
  });

  test('an explicit project type behaves the same', async ({ page }) => {
    await boot(page, { type: 'project' });
    const r = await state(page);
    expect(r.enabled).toBe(false);
    expect(r.navHidden).toBe(true);
  });

  // A typo or a value from a future version must turn features off, not on.
  test('an unrecognized type falls back to project', async ({ page }) => {
    await boot(page, { type: 'maintenence' });
    const r = await state(page);
    expect(r.type).toBe('project');
    expect(r.enabled).toBe(false);
    expect(r.navHidden).toBe(true);
  });

  test('the rest of the app is untouched', async ({ page }) => {
    await boot(page, {});
    const r = await page.evaluate(() => {
      S.view = 'jobs'; render();
      const jobsOk = document.getElementById('content').innerHTML.length > 0;
      S.view = 'customers'; render();
      const custOk = document.getElementById('content').innerHTML.length > 0;
      return {
        jobsOk, custOk,
        visibleNav: [...document.querySelectorAll('.nav-btn')]
          .filter(b => b.style.display !== 'none').map(b => b.dataset.view),
      };
    });
    expect(r.jobsOk).toBe(true);
    expect(r.custOk).toBe(true);
    expect(r.visibleNav).not.toContain('contracts');
    expect(r.visibleNav).toContain('jobs');
    expect(r.visibleNav).toContain('invoices');
  });

  // Even if the view is forced, the router refuses rather than rendering it.
  test('forcing the view shows the restricted message, not contracts', async ({ page }) => {
    await boot(page, {});
    const html = await page.evaluate(() => {
      S.view = 'contracts'; render();
      return document.getElementById('content').innerHTML;
    });
    expect(html).not.toContain('Add Contract');
    expect(html).toContain('owner-only');
  });
});

test.describe('maintenance and management companies', () => {
  for (const type of ['maintenance', 'management']) {
    test(`${type} companies get the tab`, async ({ page }) => {
      await boot(page, { type });
      const r = await state(page);
      expect(r.type).toBe(type);
      expect(r.companyUses).toBe(true);
      expect(r.enabled).toBe(true);
      expect(r.canOpen).toBe(true);
      expect(r.navHidden).toBe(false);
    });
  }

  test('clicking the nav renders the real view through the router', async ({ page }) => {
    await boot(page, { type: 'maintenance' });
    await page.click('.nav-btn[data-view="contracts"]');
    const r = await page.evaluate(() => ({
      view: S.view,
      html: document.getElementById('content').innerHTML,
      wired: !!S._ctWired,
    }));
    expect(r.view).toBe('contracts');
    expect(r.html).toContain('Add Contract');
    expect(r.html).toContain('No contracts yet');
  });

  test('a contract created through the UI persists and renders', async ({ page }) => {
    await boot(page, { type: 'maintenance' });
    await page.click('.nav-btn[data-view="contracts"]');
    await page.click('#btn-ct-add');
    await page.fill('#ct-name', 'Monthly dock check');
    await page.selectOption('#ct-visit-freq', 'monthly');
    await page.selectOption('#ct-status', 'active');
    await page.click('#ct-save');
    const r = await page.evaluate(() => ({
      count: ctContractList().length,
      html: document.getElementById('content').innerHTML,
    }));
    expect(r.count).toBe(1);
    expect(r.html).toContain('Monthly dock check');
    expect(r.html).toContain('monthly visits');
  });
});

test.describe('permission, not just company type', () => {
  // Contracts are financial. database.rules.json gates the node to
  // manager/owner, so the client has to agree — a worker who could open the tab
  // would just watch Firebase deny every read.
  test('a worker on a maintenance company sees nothing', async ({ page }) => {
    await boot(page, { type: 'maintenance', role: 'worker' });
    const r = await state(page);
    expect(r.companyUses).toBe(true);
    expect(r.enabled).toBe(false);
    expect(r.canOpen).toBe(false);
    expect(r.navHidden).toBe(true);
    expect(r.wired).toBe(false);
  });

  for (const role of ['manager', 'owner']) {
    test(`a ${role} on a maintenance company sees the tab`, async ({ page }) => {
      await boot(page, { type: 'maintenance', role });
      const r = await state(page);
      expect(r.enabled).toBe(true);
      expect(r.navHidden).toBe(false);
    });
  }

  test('a manager on a project company still sees nothing', async ({ page }) => {
    await boot(page, { role: 'manager' });
    const r = await state(page);
    expect(r.enabled).toBe(false);
    expect(r.navHidden).toBe(true);
  });
});

test.describe('the company type field', () => {
  test('normalizes to the three known values', async ({ page }) => {
    await boot(page, {});
    const r = await page.evaluate(() => ({
      valid: ['project', 'maintenance', 'management'].map(companyType),
      cased: companyType('MAINTENANCE'),
      junk: [companyType(''), companyType(null), companyType('nonsense'), companyType({}), companyType(42)],
    }));
    expect(r.valid).toEqual(['project', 'maintenance', 'management']);
    expect(r.cased).toBe('maintenance');
    expect(r.junk).toEqual(['project', 'project', 'project', 'project', 'project']);
  });

  test('the company editor offers it and round-trips the saved value', async ({ page }) => {
    await boot(page, { type: 'maintenance' });
    const r = await page.evaluate(() => {
      showCompanyEditorModal(COMPANIES.wfs);
      const sel = document.getElementById('co-type');
      return { present: !!sel, value: sel && sel.value, options: [...sel.options].map(o => o.value) };
    });
    expect(r.present).toBe(true);
    expect(r.value).toBe('maintenance');
    expect(r.options).toEqual(['project', 'maintenance', 'management']);
  });

  test('existing companies keep working when the registry has no type', async ({ page }) => {
    await boot(page, {});
    const r = await page.evaluate(() => ({
      normalized: normalizeCompanyRecord('mhs', { id: 'mhs', ns: 'mhs', label: 'Manufactured Housing Solutions' }).type,
      defaults: Object.values(normalizeCompanyRegistry(DEFAULT_COMPANIES)).map(c => c.type),
    }));
    expect(r.normalized).toBe('project');
    expect(r.defaults.every(t => t === 'project')).toBe(true);
  });
});
