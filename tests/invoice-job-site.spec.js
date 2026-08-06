// Invoices and estimates print the job-site address so the customer (and anyone
// they forward the invoice to) can tell which property the work was billed for.
// The block is built once by invoiceSiteLines() and rendered by three templates
// — the emailed HTML, its plain-text alternative, and the PDF attachment — so
// these tests pin the shared contract and each template's use of it.

const { expect, test } = require('@playwright/test');
const { stubExternals } = require('./_stubs');

const INV = {
  id: 'i1', number: '1042', date: '2026-08-01', dueDate: '2026-08-15', taxRate: 7, paid: 0,
  terms: 'Payment due upon receipt unless otherwise noted. Thank you for your business.',
  items: [{ desc: 'Dock decking replacement', qty: 1, rate: 4200 }], photos: [],
};

const SITE = '1120 Lakeshore Dr, Kingston, TN 37763';
const BILLING = '412 Oak Street, Knoxville, TN 37902';

async function boot(page) {
  await stubExternals(page);
  await page.addInitScript(() => localStorage.setItem('jt_company', 'wfs'));
  await page.goto('/');
  await page.waitForFunction(() => typeof window.buildInvoiceEmailHTML === 'function');
}

test.describe('invoiceSiteLines', () => {
  test('prefers the job site address and falls back to billing', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(({ site, billing }) => ({
      both: invoiceSiteLines({ customerName: 'Dale Whitaker', address: site, billingAddress: billing }),
      siteOnly: invoiceSiteLines({ customerName: 'Dale Whitaker', address: site }),
      // "Billing Address" is hinted as "leave blank if same as job site", so a job
      // with only a billing address still describes where the work happened.
      billingOnly: invoiceSiteLines({ customerName: 'Dale Whitaker', address: '', billingAddress: billing }),
      noName: invoiceSiteLines({ address: site }),
      empty: invoiceSiteLines({ customerName: '', address: '', billingAddress: '' }),
      nothing: invoiceSiteLines(null),
    }), { site: SITE, billing: BILLING });

    expect(r.both).toEqual(['Dale Whitaker', SITE]);
    expect(r.siteOnly).toEqual(['Dale Whitaker', SITE]);
    expect(r.billingOnly).toEqual(['Dale Whitaker', BILLING]);
    expect(r.noName).toEqual([SITE]);
    // Null rather than an empty array, so templates omit the heading entirely.
    expect(r.empty).toBeNull();
    expect(r.nothing).toBeNull();
  });
});

test.describe('templates render the job site', () => {
  test('emailed HTML shows the block, and omits it when there is no address', async ({ page }) => {
    await boot(page);
    const { withSite, without } = await page.evaluate(({ inv, site }) => ({
      withSite: buildInvoiceEmailHTML({ name: 'Dock Rebuild', customerName: 'Dale Whitaker', address: site }, inv, '', 'invoice'),
      without: buildInvoiceEmailHTML({ name: 'Dock Rebuild', customerName: 'Dale Whitaker' }, inv, '', 'invoice'),
    }), { inv: INV, site: SITE });

    expect(withSite).toContain('Job Site');
    expect(withSite).toContain(SITE);
    expect(without).not.toContain('Job Site');
  });

  test('plain-text alternative shows the block', async ({ page }) => {
    await boot(page);
    const { withSite, without } = await page.evaluate(({ inv, site }) => ({
      withSite: buildInvoiceEmailText({ name: 'Dock Rebuild', customerName: 'Dale Whitaker', address: site }, inv, '', 'invoice'),
      without: buildInvoiceEmailText({ name: 'Dock Rebuild', customerName: 'Dale Whitaker' }, inv, '', 'invoice'),
    }), { inv: INV, site: SITE });

    expect(withSite).toContain('Job Site:');
    expect(withSite).toContain(SITE);
    expect(without).not.toContain('Job Site:');
  });

  test('estimates carry it too', async ({ page }) => {
    await boot(page);
    const html = await page.evaluate(({ inv, site }) =>
      buildInvoiceEmailHTML({ name: 'Dock Rebuild', customerName: 'Dale Whitaker', address: site }, inv, '', 'estimate'),
    { inv: INV, site: SITE });
    expect(html).toContain('Job Site');
    expect(html).toContain(SITE);
  });

  test('address is escaped, not injected', async ({ page }) => {
    await boot(page);
    const html = await page.evaluate((inv) =>
      buildInvoiceEmailHTML({ name: 'x', customerName: 'Dale', address: '<script>alert(1)</script>' }, inv, '', 'invoice'),
    INV);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

test.describe('PDF layout budget', () => {
  // The card, terms and footer offsets were hardcoded, so an invoice carrying
  // terms printed them across the card edge and over the footer. The tail is now
  // measured before drawing; these cases are the ones that used to overflow.
  const CASES = [
    ['no job site', { name: 'Dock Rebuild', customerName: '', address: '' }],
    ['job site', { name: 'Dock Rebuild', customerName: 'Dale Whitaker', address: SITE }],
    ['long wrapping address', {
      name: 'Dock Rebuild', customerName: 'Dale & Marianne Whitaker-Thompson',
      address: '4127 Old Harriman Highway, Suite 200\nKingston, TN 37763-4410',
    }],
  ];

  for (const [label, job] of CASES) {
    test(`builds a single-page PDF — ${label}`, async ({ page }) => {
      await boot(page);
      // jsPDF is loaded from a CDN the test environment blocks; serve the copy
      // that ships in node_modules instead.
      await page.route('https://cdnjs.cloudflare.com/ajax/libs/jspdf/**', (route) => route.fulfill({
        contentType: 'application/javascript',
        body: require('fs').readFileSync(require.resolve('jspdf/dist/jspdf.umd.min.js'), 'utf8'),
      }));
      const { pages, bytes } = await page.evaluate(async ({ job, inv }) => {
        const file = await buildInvoicePDFFile(job, inv, 'invoice');
        const text = await file.text();
        return { pages: (text.match(/\/Type\s*\/Page[^s]/g) || []).length, bytes: file.size };
      }, { job, inv: INV });

      expect(bytes).toBeGreaterThan(1000);
      // No photos on these invoices, so the whole document must fit one page —
      // the layout budget spilling would push content off it.
      expect(pages).toBe(1);
    });
  }
});
