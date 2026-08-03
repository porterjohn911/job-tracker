// The invoice letterhead (company name + business address) is printed on top of
// the theme band in both the emailed HTML and the PDF attachment. Those two used
// hardcoded white ink, so setting a white or pale "Header / invoice color" in
// Settings made the letterhead invisible against its own background — the
// customer received an invoice with no company name on it.
//
// bandInk() now derives the ink from the band's luminance. These tests pin that
// behavior at both extremes so a future palette change can't silently
// reintroduce white-on-white.

const { expect, test } = require('@playwright/test');
const { stubExternals } = require('./_stubs');

const JOB = { name: 'Dock Rebuild', customerName: 'Dale Whitaker', customerEmail: 'd@example.com', address: 'Kingston, TN' };
const INV = {
  id: 'i1', number: '1042', date: '2026-08-01', dueDate: '2026-08-15', taxRate: 0, paid: 0,
  items: [{ desc: 'Dock decking replacement', qty: 1, rate: 4200 }], photos: [],
};

const LIGHT_INK = { name: '#0a1f18', addr: '#2d3d37' };
const DARK_INK = { name: '#ffffff', addr: 'rgba(255,255,255,0.75)' };

// Boot the shell with a company whose header color is `headerColor` (null leaves
// the built-in dark green gradient in place).
async function boot(page, headerColor) {
  await stubExternals(page);
  await page.addInitScript((hc) => {
    localStorage.setItem('jt_company', 'wfs');
    if (hc) {
      localStorage.setItem('jt_companies', JSON.stringify({
        wfs: { id: 'wfs', ns: 'wfs', label: 'Waterfront Solutions', theme: { headerColor: hc } },
      }));
    }
  }, headerColor);
  await page.goto('/');
  await page.waitForFunction(() => typeof window.buildInvoiceEmailHTML === 'function');
}

// Read the ink actually written into the emailed letterhead.
function letterheadInk(page) {
  return page.evaluate(({ job, inv }) => {
    const html = buildInvoiceEmailHTML(job, inv, '', 'invoice');
    return {
      name: (html.match(/serif;font-size:22px;font-weight:600;color:([^;]+)/) || [])[1],
      addr: (html.match(/font-size:11\.5px;color:([^;]+);margin-top/) || [])[1],
    };
  }, { job: JOB, inv: INV });
}

const CASES = [
  ['default gradient (unset)', null, DARK_INK],
  ['pure white', '#ffffff', LIGHT_INK],
  ['near-white', '#fafafa', LIGHT_INK],
  ['mid-tone gold', '#e8a830', LIGHT_INK],
  ['dark green', '#0a3d2e', DARK_INK],
  ['dark navy', '#0a0e16', DARK_INK],
];

for (const [label, headerColor, expected] of CASES) {
  test(`emailed letterhead ink follows the band — ${label}`, async ({ page }) => {
    await boot(page, headerColor);
    expect(await letterheadInk(page)).toEqual(expected);
  });
}

test('bandInk keeps the address readable on every band it returns', async ({ page }) => {
  await boot(page, null);
  const results = await page.evaluate(() => {
    // Relative luminance + WCAG contrast ratio.
    const lum = (r, g, b) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (rgb, hex) => {
      const n = parseInt(hex.slice(1), 16);
      const a = lum(rgb[0], rgb[1], rgb[2]);
      const b = lum((n >> 16) & 255, (n >> 8) & 255, n & 255);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const bands = ['#ffffff', '#fafafa', '#f5deb3', '#e8a830', '#c9a227', '#9fd6b8',
      '#cccccc', '#0a3d2e', '#1a6e55', '#0a0e16', '#202c3d'];
    return bands.map((b) => {
      const ink = bandInk(b);
      return { band: b, name: ratio(ink.textRgb, b), addr: ratio(ink.mutedRgb, b) };
    });
  });

  // 4.5:1 is the WCAG AA floor for body-size text; the address is 11.5px.
  for (const r of results) {
    expect(r.name, `company name on ${r.band}`).toBeGreaterThanOrEqual(4.5);
    expect(r.addr, `business address on ${r.band}`).toBeGreaterThanOrEqual(4.5);
  }
});
