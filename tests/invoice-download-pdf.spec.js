// The send composer can email the branded PDF, but there was no way to just get
// that file — "Also Print PDF" opens the HTML email in a print window, which is
// a different rendering. "Download PDF" hands over the exact File the send paths
// attach, and must not mark the document sent: its whole purpose is obtaining
// the PDF without the invoice counting as delivered.

const { expect, test } = require('@playwright/test');
const { stubExternals } = require('./_stubs');

const JOB = {
  id: 'job1', name: 'Dock Rebuild', customerName: 'Dale Whitaker',
  customerEmail: 'dale@example.com', address: '1120 Lakeshore Dr, Kingston, TN 37763',
};
const INV = {
  id: 'inv1', number: '1042', date: '2026-08-01', dueDate: '2026-08-15', taxRate: 7, paid: 0,
  status: 'draft', terms: 'Payment due upon receipt.',
  items: [{ desc: 'Dock decking replacement', qty: 1, rate: 4200 }], photos: [],
};

async function openComposer(page, kind) {
  await stubExternals(page);
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/jspdf/**', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: require('fs').readFileSync(require.resolve('jspdf/dist/jspdf.umd.min.js'), 'utf8'),
  }));
  await page.addInitScript(() => localStorage.setItem('jt_company', 'wfs'));
  await page.goto('/');
  await page.waitForFunction(() => typeof window.showSendInvoiceModal === 'function');
  await page.evaluate(({ job, inv, kind }) => {
    // Keep handles so the test can inspect what the button did to the record.
    window.__job = JSON.parse(JSON.stringify(job));
    window.__inv = JSON.parse(JSON.stringify(inv));
    showSendInvoiceModal(window.__job, window.__inv, kind);
  }, { job: JOB, inv: INV, kind });
  await page.waitForSelector('#em-download');
}

test('downloads the branded PDF from the send composer', async ({ page }) => {
  await openComposer(page, 'invoice');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#em-download'),
  ]);
  expect(download.suggestedFilename()).toBe('Invoice-1042.pdf');

  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const buf = Buffer.concat(chunks);
  expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(buf.length).toBeGreaterThan(1000);
});

test('estimates download under their own name', async ({ page }) => {
  await openComposer(page, 'estimate');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#em-download'),
  ]);
  expect(download.suggestedFilename()).toBe('Estimate-1042.pdf');
});

test('downloading does not mark the invoice sent', async ({ page }) => {
  await openComposer(page, 'invoice');
  await Promise.all([page.waitForEvent('download'), page.click('#em-download')]);
  // Every other action in this composer flips inv.sent and promotes the status;
  // this one must leave the record exactly as it found it.
  const inv = await page.evaluate(() => ({ sent: window.__inv.sent || null, status: window.__inv.status }));
  expect(inv.sent).toBeNull();
  expect(inv.status).toBe('draft');
});

test('the composer stays open so the file can be checked before sending', async ({ page }) => {
  await openComposer(page, 'invoice');
  await Promise.all([page.waitForEvent('download'), page.click('#em-download')]);
  await expect(page.locator('#em-send-now')).toBeVisible();
});
