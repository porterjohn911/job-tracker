const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installStubs, NAV_VIEWS } = require('./audit-stubs');

const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const RESULTS_DIR = path.join(__dirname, '..', 'test-results');
const OUT = path.join(RESULTS_DIR, 'usability-findings.json');
const findings = [];
function record(category, severity, view, message, detail) {
  findings.push({ category, severity, view, message, detail });
}
test.afterAll(() => {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(findings, null, 2));
  // Human-readable summary to the console so `npx playwright test` surfaces it.
  const bySev = findings.reduce((a, f) => ((a[f.severity] = (a[f.severity] || 0) + 1), a), {});
  console.log(`\n=== Usability & visual audit: ${findings.length} finding(s) ` +
    `(high: ${bySev.high || 0}, medium: ${bySev.medium || 0}, low: ${bySev.low || 0}) ===`);
  for (const f of findings) console.log(`  [${f.severity}] (${f.view}) ${f.message}`);
  console.log(`\nFull detail: ${OUT}\n`);
});

async function boot(page, viewport) {
  if (viewport) await page.setViewportSize(viewport);
  await installStubs(page);
  await page.goto('/');
  await expect(page.locator('#content')).toBeVisible();
  await page.waitForTimeout(400);
}
async function gotoView(page, view) {
  const btn = page.locator(`.nav-btn[data-view="${view}"]`);
  if (await btn.count()) { await btn.first().click(); await page.waitForTimeout(350); }
}

// 1. Static markup usability facts (viewport zoom, lang, title, etc.)
test('markup-level usability', async ({ page }) => {
  await boot(page);
  const viewport = await page.getAttribute('meta[name="viewport"]', 'content');
  if (/user-scalable\s*=\s*no/i.test(viewport || '') || /maximum-scale\s*=\s*1(\.0)?/i.test(viewport || '')) {
    record('accessibility', 'high', 'global',
      'Pinch-zoom is disabled in the viewport meta tag (WCAG 1.4.4)',
      `content="${viewport}" — user-scalable=no / maximum-scale=1 blocks users from zooming to read text.`);
  }
  expect(true).toBe(true);
});

// 2. axe-core accessibility scan on every view (desktop)
test('axe accessibility scan across all views', async ({ page }) => {
  await boot(page, { width: 1280, height: 900 });
  await page.addScriptTag({ content: AXE });
  const seen = new Set();
  for (const view of NAV_VIEWS) {
    await gotoView(page, view);
    const results = await page.evaluate(async () => {
      return await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa'] },
        resultTypes: ['violations'],
      });
    });
    for (const v of results.violations) {
      const key = `${v.id}`; // dedupe rule across views, report first view
      const targets = v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ');
      const sev = ({critical:'high',serious:'high',moderate:'medium',minor:'low'})[v.impact] || 'medium';
      if (!seen.has(key)) {
        seen.add(key);
        record('accessibility', sev, view, `[axe:${v.id}] ${v.help}`,
          `${v.nodes.length} node(s). e.g. ${targets}`);
      }
    }
  }
  expect(true).toBe(true);
});

// 3. Buttons / links without accessible names
test('interactive elements have accessible names', async ({ page }) => {
  await boot(page, { width: 1280, height: 900 });
  for (const view of NAV_VIEWS) {
    await gotoView(page, view);
    const bad = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('button, a[href], [role="button"]').forEach(el => {
        if (el.offsetParent === null) return; // skip hidden
        const name = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim();
        if (!name) out.push(el.outerHTML.slice(0, 120));
      });
      return out;
    });
    if (bad.length) {
      record('accessibility', 'high', view,
        `${bad.length} interactive element(s) with no accessible name (empty button/link)`,
        bad.slice(0, 4).join('  ||  '));
    }
  }
  expect(true).toBe(true);
});

// 4. Touch-target sizes on mobile (WCAG 2.5.5 / Apple 44px, Material 48px)
test('touch target sizes on mobile', async ({ page }) => {
  await boot(page, { width: 390, height: 844 });
  for (const view of NAV_VIEWS) {
    await gotoView(page, view);
    const small = await page.evaluate(() => {
      const MIN = 40;
      const out = [];
      document.querySelectorAll('button, a[href], input, select, [role="button"]').forEach(el => {
        if (el.offsetParent === null) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (r.height < MIN || r.width < MIN) {
          const label = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30);
          out.push(`${label} (${Math.round(r.width)}x${Math.round(r.height)})`);
        }
      });
      return out;
    });
    if (small.length) {
      // Dedupe identical entries
      const uniq = [...new Set(small)];
      record('touch-target', 'medium', view,
        `${uniq.length} tap target(s) below 40px on a 390px phone (WCAG 2.5.5)`,
        uniq.slice(0, 8).join(', '));
    }
  }
  expect(true).toBe(true);
});

// 5. Horizontal overflow (content wider than viewport) on mobile
test('no horizontal overflow on mobile', async ({ page }) => {
  await boot(page, { width: 360, height: 780 });
  for (const view of NAV_VIEWS) {
    await gotoView(page, view);
    const overflow = await page.evaluate(() => {
      const docW = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth <= docW + 1) return null;
      const offenders = [];
      document.querySelectorAll('body *').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.right > docW + 2 && r.width > 40 && el.offsetParent !== null) {
          offenders.push(`${el.tagName.toLowerCase()}.${(el.className||'').toString().split(' ')[0]} (right=${Math.round(r.right)})`);
        }
      });
      return { scrollW: document.documentElement.scrollWidth, docW, offenders: [...new Set(offenders)].slice(0,5) };
    });
    if (overflow) {
      record('responsive', 'medium', view,
        `Horizontal overflow on 360px phone: page scrolls ${overflow.scrollW}px wide (viewport ${overflow.docW}px)`,
        overflow.offenders.join(', '));
    }
  }
  expect(true).toBe(true);
});

// 6. Duplicate element IDs (breaks label/aria references, getElementById)
test('no duplicate DOM ids', async ({ page }) => {
  await boot(page, { width: 1280, height: 900 });
  for (const view of NAV_VIEWS) {
    await gotoView(page, view);
    const dups = await page.evaluate(() => {
      const counts = {};
      document.querySelectorAll('[id]').forEach(el => { counts[el.id] = (counts[el.id]||0)+1; });
      return Object.entries(counts).filter(([,n]) => n > 1).map(([id,n]) => `#${id} x${n}`);
    });
    if (dups.length) {
      record('correctness', 'medium', view,
        `${dups.length} duplicate element id(s) in the DOM`,
        dups.slice(0, 8).join(', '));
    }
  }
  expect(true).toBe(true);
});

// 7. Console / page errors while navigating every view
test('no console errors navigating all views', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await boot(page, { width: 1280, height: 900 });
  for (const view of NAV_VIEWS) { await gotoView(page, view); }
  if (errors.length) {
    record('correctness', 'high', 'global',
      `${errors.length} console/page error(s) during navigation`,
      [...new Set(errors)].slice(0, 6).join('  ||  '));
  }
  expect(true).toBe(true);
});

// 8. Form fields without an accessible label (opens New Job modal)
test('form inputs have labels (new job modal)', async ({ page }) => {
  await boot(page, { width: 1280, height: 900 });
  const fab = page.locator('#fab');
  if (await fab.count()) {
    await fab.click();
    await page.waitForTimeout(400);
    const unlabeled = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('#modal-root input, #modal-root select, #modal-root textarea').forEach(el => {
        if (el.type === 'hidden' || el.offsetParent === null) return;
        const id = el.id;
        const hasLabel = id && document.querySelector(`label[for="${CSS.escape(id)}"]`);
        const wrapped = el.closest('label');
        const aria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
        const placeholder = el.getAttribute('placeholder');
        if (!hasLabel && !wrapped && !aria) {
          out.push(`${el.tagName.toLowerCase()}[${el.type||''}]${placeholder?` placeholder="${placeholder}"`:' (no placeholder either)'}`);
        }
      });
      return out;
    });
    if (unlabeled.length) {
      record('accessibility', 'medium', 'new-job-modal',
        `${unlabeled.length} form field(s) without a programmatic <label>/aria-label`,
        unlabeled.slice(0, 8).join(', '));
    }
  }
  expect(true).toBe(true);
});

// 9. Keyboard focus visibility — is there any :focus-visible outline styling?
test('focus indicator styling present', async ({ page }) => {
  await boot(page, { width: 1280, height: 900 });
  const info = await page.evaluate(() => {
    let hasFocusRule = false;
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      if (!rules) continue;
      for (const r of rules) {
        if (r.selectorText && /:focus(-visible)?/.test(r.selectorText)) { hasFocusRule = true; break; }
      }
      if (hasFocusRule) break;
    }
    // Check a nav button's actual focus outline
    const btn = document.querySelector('.nav-btn');
    btn && btn.focus();
    const cs = btn ? getComputedStyle(btn) : null;
    return { hasFocusRule, outlineWidth: cs ? cs.outlineWidth : null, outlineStyle: cs ? cs.outlineStyle : null };
  });
  if (!info.hasFocusRule) {
    record('accessibility', 'medium', 'global',
      'No :focus / :focus-visible rules found in stylesheets — keyboard focus may be invisible (WCAG 2.4.7)',
      JSON.stringify(info));
  }
  expect(true).toBe(true);
});
