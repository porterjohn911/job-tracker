// What the app does when something goes wrong.
//
// Before this there was no window.onerror and no unhandledrejection handler
// anywhere, so a throw left the screen byte-for-byte unchanged with no message.
// Tap a tab, nothing happens, tap again, nothing happens. These cases are all
// versions of the same question: does the person using it find out?

const { expect, test } = require('@playwright/test');
const { stubExternals } = require('./_stubs');

async function boot(page, type) {
  await stubExternals(page);
  await page.setViewportSize({ width: 430, height: 850 });
  await page.addInitScript((t) => {
    localStorage.setItem('jt_company', 'co');
    localStorage.setItem('jt_companies', JSON.stringify({
      co: { id: 'co', ns: 'co', label: 'Test Co', active: true, type: t },
    }));
  }, type || 'project');
  await page.goto('/');
  await page.waitForFunction(() => typeof window.render === 'function');
}

test.describe('it is listening at all', () => {
  test('the boundary loads before the rest of the app', async ({ page }) => {
    const html = require('fs').readFileSync('index.html', 'utf8');
    const scripts = [...html.matchAll(/<script\s+src="\.\/([^"]+)"/g)].map(m => m[1]);
    expect(scripts[0]).toBe('src/app/00-error-boundary.js');
  });

  test('an uncaught error raises a banner', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { setTimeout(() => { throw new Error('kaboom'); }, 0); });
    await expect(page.locator('#jt-err')).toBeVisible();
    await expect(page.locator('.jt-err-title')).toContainText('Something went wrong');
  });

  test('an unhandled promise rejection raises one too', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { Promise.reject(new Error('nope-async')); });
    await expect(page.locator('#jt-err')).toBeVisible();
    await page.click('#jt-err-toggle');
    await expect(page.locator('#jt-err-detail')).toContainText('nope-async');
  });

  // A failed image or script load fires the same window error event and is not
  // an app exception. Banner-on-every-slow-asset would train people to dismiss
  // the thing without reading it.
  test('a failed asset load does not raise one', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => new Promise(r => {
      const img = document.createElement('img');
      img.onerror = () => setTimeout(r, 50);
      img.src = '/definitely-not-here-' + Math.random() + '.png';
      document.body.appendChild(img);
    }));
    expect(await page.locator('#jt-err').count()).toBe(0);
  });

  // A throw inside render() fires on every redraw. Twenty stacked banners is
  // its own kind of broken.
  test('repeats are counted, not stacked', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      for (let i = 0; i < 5; i++) jtReportError(new Error('same'), 'here');
      return { banners: document.querySelectorAll('#jt-err').length, count: JT_ERRORS.count };
    });
    expect(r.banners).toBe(1);
    expect(r.count).toBe(5);
    await expect(page.locator('.jt-err-title')).toContainText('(5)');
  });

  test('it can be dismissed and reload is offered', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => jtReportError(new Error('x'), 'y'));
    await expect(page.locator('#jt-err-reload')).toBeVisible();
    await page.click('#jt-err-close');
    expect(await page.locator('#jt-err').count()).toBe(0);
  });

  test('the detail is escaped, not injected', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => jtReportError(new Error('<img src=x onerror=alert(1)>'), 'inj'));
    await page.click('#jt-err-toggle');
    const r = await page.evaluate(() => ({
      text: document.getElementById('jt-err-detail').textContent,
      imgs: document.querySelectorAll('#jt-err img').length,
    }));
    expect(r.text).toContain('<img src=x');
    expect(r.imgs).toBe(0);
  });
});

test.describe('a broken screen does not freeze the app', () => {
  // The measured symptom this replaces: content unchanged byte for byte, no
  // message, nav still pointing at a tab that did nothing.
  test('a throwing view says so in place', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const real = window.renderJobs;
      window.renderJobs = () => { throw new Error('view exploded'); };
      S.view = 'jobs';
      render();
      window.renderJobs = real;
      const c = document.getElementById('content');
      return { html: c.innerHTML, hasBanner: !!document.getElementById('jt-err') };
    });
    expect(r.html).toContain('This screen could not be drawn');
    expect(r.html).toContain('view exploded');
    expect(r.hasBanner).toBe(true);
  });

  test('the nav still works afterwards, so you can leave', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      const real = window.renderJobs;
      window.renderJobs = () => { throw new Error('boom'); };
      S.view = 'jobs';
      render();
      window.renderJobs = real;
    });
    await page.click('.nav-btn[data-view="customers"]');
    const view = await page.evaluate(() => S.view);
    expect(view).toBe('customers');
    await expect(page.locator('#content')).not.toContainText('could not be drawn');
  });

  test('render itself does not throw out to its caller', async ({ page }) => {
    await boot(page);
    const threw = await page.evaluate(() => {
      const real = window.renderJobs;
      window.renderJobs = () => { throw new Error('boom'); };
      let t = false;
      try { S.view = 'jobs'; render(); } catch (e) { t = true; }
      window.renderJobs = real;
      return t;
    });
    expect(threw).toBe(false);
  });
});

test.describe('one broken area does not unwire the rest', () => {
  // attachHandlers runs eight areas in a row. Unwrapped, a throw in the first
  // left the other seven unwired — most of the app inert with nothing said.
  // That is the shape of the bug that showed Entities on a maintenance company.
  test('a throwing attach area leaves the others wired', async ({ page }) => {
    await boot(page, 'maintenance');
    const r = await page.evaluate(() => {
      const real = window.attachShellHandlers;
      window.attachShellHandlers = () => { throw new Error('shell broke'); };
      render();
      window.attachShellHandlers = real;
      return {
        // A later area still ran: the contracts tab handlers wired the fold.
        more: !!document.getElementById('ct-nav-more'),
        banner: !!document.getElementById('jt-err'),
      };
    });
    expect(r.more).toBe(true);
    expect(r.banner).toBe(true);
  });

  test('the chrome still updates when a handler area fails', async ({ page }) => {
    await boot(page);
    const ran = await page.evaluate(() => {
      let called = false;
      const realAttach = window.attachHandlers;
      const realBadge = window.updateBellBadge;
      window.attachHandlers = () => { throw new Error('nope'); };
      window.updateBellBadge = () => { called = true; };
      render();
      window.attachHandlers = realAttach;
      window.updateBellBadge = realBadge;
      return called;
    });
    // updateBellBadge runs before attachHandlers and must not be skipped by it.
    expect(ran).toBe(true);
  });
});

test.describe('the safe helpers', () => {
  test('onId is a no-op on a missing element rather than a throw', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      missing: onId('definitely-not-here', 'click', () => {}),
      present: onId('content', 'click', () => {}),
    }));
    expect(r.missing).toBe(false);
    expect(r.present).toBe(true);
  });

  // Assignment, not addEventListener: handlers rebind on every render, and the
  // header and nav survive those renders. Accumulating would fire a press
  // three, five, ten times.
  test('onId replaces rather than accumulates', async ({ page }) => {
    await boot(page);
    const fired = await page.evaluate(() => {
      let n = 0;
      for (let i = 0; i < 5; i++) onId('user-btn', 'click', () => { n++; });
      document.getElementById('user-btn').click();
      return n;
    });
    expect(fired).toBe(1);
  });

  test('jtTry returns the fallback and reports', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const v = jtTry(() => { throw new Error('inner'); }, 'unit', 'fallback');
      return { v, last: JT_ERRORS.last.where };
    });
    expect(r.v).toBe('fallback');
    expect(r.last).toBe('unit');
  });

  test('jtTry passes the value through when nothing goes wrong', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => jtTry(() => 42, 'unit'))).toBe(42);
  });

  // syncStatus is called from inside Firebase listener callbacks. A throw there
  // does not just lose the status text — it kills the callback delivering data.
  test('syncStatus survives its elements being gone', async ({ page }) => {
    await boot(page);
    const threw = await page.evaluate(() => {
      document.getElementById('sync-dot')?.remove();
      document.getElementById('sync-text')?.remove();
      try { syncStatus('ok', 'Team sync live'); return false; } catch (e) { return true; }
    });
    expect(threw).toBe(false);
  });
});

test.describe('a clean app raises nothing', () => {
  test('booting and moving around produces no banner', async ({ page }) => {
    await boot(page, 'maintenance');
    for (const v of ['dashboard', 'jobs', 'customers', 'contracts', 'schedule']) {
      await page.evaluate(view => { S.view = view; render(); }, v);
    }
    expect(await page.locator('#jt-err').count()).toBe(0);
  });

  test('a project company boots clean too', async ({ page }) => {
    await boot(page, 'project');
    await page.evaluate(() => { S.view = 'jobs'; render(); S.view = 'dashboard'; render(); });
    expect(await page.locator('#jt-err').count()).toBe(0);
  });
});
