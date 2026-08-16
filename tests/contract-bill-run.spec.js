// The bill run.
//
// This is the one screen in the app that emails real customers in bulk, so the
// cases below are weighted toward what must NOT happen: a second send of an
// invoice already sent, a run that stops silently at the first bounce, an
// invoice stamped sent when nothing left the building, and a bulk press falling
// through to the single-invoice path's download-and-open-a-tab fallback.

const { expect, test } = require('@playwright/test');
const { stubExternals } = require('./_stubs');

const NOW = new Date(2026, 5, 15).getTime();

async function load(page) {
  await stubExternals(page);
  await page.addInitScript(() => {
    localStorage.setItem('jt_company', 'wfs');
    localStorage.setItem('jt_companies', JSON.stringify({
      wfs: { id: 'wfs', ns: 'wfs', label: 'Waterfront Solutions', active: true, type: 'maintenance' },
    }));
  });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.ctBillRunRows === 'function');
  await page.evaluate(() => {
    S.contracts = {}; S.jobs = {}; S.customers = {}; S.timeEntries = {}; S.payRates = {};
    S.members = []; S.ctDetail = null; S.ctRoute = null; S.ctRevenue = false;
    S.ctBills = false; S.ctBillResult = null; S._ctWired = false;
    ctSaveContractsLocal();
  });
}

// A contract with an Agreement job carrying invoices, built directly so each
// case can put an invoice in exactly the state it wants to test.
async function seed(page, spec) {
  await page.evaluate(async (a) => {
    for (const c of a.customers || []) await saveCustomer(c);
    for (const s of a.specs) {
      await ctSaveContract(s.contract);
      const c = ctGetContract(s.contract.id);
      const job = ctBuildBillingJob(c);
      job.invoices = s.invoices;
      if (s.jobEmail !== undefined) job.customerEmail = s.jobEmail;
      await writeJob(job);
    }
  }, spec);
}

const inv = over => Object.assign({
  id: 'i1', number: 'INV-1001', date: '2026-06-01', dueDate: '2026-06-15',
  status: 'draft', items: [{ desc: 'Monthly maintenance', qty: 1, rate: 600 }], taxRate: 0,
}, over);

const contract = over => Object.assign({
  id: 'ct_a', name: 'Dock maintenance', status: 'active', startDate: '2026-01-01',
  customerId: 'cus_1', visits: { freq: 'monthly' }, visitsThrough: '2027-01-01',
  billing: { freq: 'monthly', amount: 600 },
}, over);

const CUST = [{ id: 'cus_1', name: 'Whitaker Marina', email: 'ap@whitaker.example' }];

// Replace delivery with a recorder. Everything above ctDeliverInvoice is pure
// enough to test for real; the transport itself is the only part stubbed.
async function stubDelivery(page, opts) {
  await page.evaluate((o) => {
    window.__sends = [];
    window.ctDeliverInvoice = async (row, channel) => {
      window.__sends.push({ number: row.inv.number, to: row.to, channel: channel });
      if (o.failOn && o.failOn.includes(row.inv.number)) throw new Error('Mailbox full');
    };
  }, opts || {});
}

test.describe('what is waiting to go out', () => {
  test('finds unsent drafts and leaves everything else alone', async ({ page }) => {
    await load(page);
    await seed(page, {
      customers: CUST,
      specs: [{
        contract: contract(),
        invoices: [
          inv({ id: 'i1', number: 'INV-1001' }),
          inv({ id: 'i2', number: 'INV-1002', status: 'sent', sent: 1750000000000 }),
          inv({ id: 'i3', number: 'INV-1003', status: 'paid', paid: 600 }),
          inv({ id: 'i4', number: 'INV-1004' }),
        ],
      }],
    });
    const rows = await page.evaluate(n => ctBillRunRows(n).map(r => r.inv.number), NOW);
    expect(rows).toEqual(['INV-1001', 'INV-1004']);
  });

  // `sent` is the authority. An invoice whose status was edited back to draft
  // after it went out must never be picked up again.
  test('an invoice that was already sent never comes back, whatever its status says', async ({ page }) => {
    await load(page);
    await seed(page, {
      customers: CUST,
      specs: [{ contract: contract(), invoices: [inv({ status: 'draft', sent: 1750000000000 })] }],
    });
    const rows = await page.evaluate(n => ctBillRunRows(n), NOW);
    expect(rows).toHaveLength(0);
  });

  test('gathers across every contract, grouped by customer', async ({ page }) => {
    await load(page);
    await seed(page, {
      customers: [
        { id: 'cus_1', name: 'Zeta Docks', email: 'z@example.com' },
        { id: 'cus_2', name: 'Alpha Marina', email: 'a@example.com' },
      ],
      specs: [
        { contract: contract({ id: 'ct_a', customerId: 'cus_1' }), invoices: [inv({ number: 'INV-1' })] },
        { contract: contract({ id: 'ct_b', customerId: 'cus_2' }), invoices: [inv({ number: 'INV-2' })] },
        { contract: contract({ id: 'ct_c', customerId: 'cus_2' }), invoices: [inv({ number: 'INV-3' })] },
      ],
    });
    const rows = await page.evaluate(n => ctBillRunRows(n).map(r => r.customer + '/' + r.inv.number), NOW);
    // Alpha's two land together, so "they are getting two emails" is visible.
    expect(rows).toEqual(['Alpha Marina/INV-2', 'Alpha Marina/INV-3', 'Zeta Docks/INV-1']);
  });

  test('a contract with no Agreement job contributes nothing', async ({ page }) => {
    await load(page);
    await page.evaluate(async () => { await ctSaveContract({ id: 'ct_z', name: 'X', status: 'active', startDate: '2026-01-01', billing: { freq: 'monthly', amount: 500 } }); });
    const rows = await page.evaluate(n => ctBillRunRows(n), NOW);
    expect(rows).toHaveLength(0);
  });
});

test.describe('pre-flight checks', () => {
  test('no email address blocks the send', async ({ page }) => {
    await load(page);
    await seed(page, {
      customers: [{ id: 'cus_1', name: 'Whitaker Marina', email: '' }],
      specs: [{ contract: contract(), invoices: [inv()], jobEmail: '' }],
    });
    const r = await page.evaluate(n => ctBillRunRows(n)[0], NOW);
    expect(r.sendable).toBe(false);
    expect(r.blocking).toContain('No email address for this customer');
  });

  test('a malformed address blocks it too', async ({ page }) => {
    await load(page);
    await seed(page, {
      customers: [{ id: 'cus_1', name: 'Whitaker Marina', email: 'ap@whitaker' }],
      specs: [{ contract: contract(), invoices: [inv()] }],
    });
    const r = await page.evaluate(n => ctBillRunRows(n)[0], NOW);
    expect(r.sendable).toBe(false);
    expect(r.blocking[0]).toContain('does not look valid');
  });

  test('a zero-total invoice is blocked — there is nothing to charge', async ({ page }) => {
    await load(page);
    await seed(page, {
      customers: CUST,
      specs: [{ contract: contract(), invoices: [inv({ items: [] })] }],
    });
    const r = await page.evaluate(n => ctBillRunRows(n)[0], NOW);
    expect(r.sendable).toBe(false);
    expect(r.blocking).toContain('Nothing to charge — the invoice totals zero');
  });

  // The customer's record is the authority, not the snapshot taken when the
  // Agreement job was opened a year ago.
  test('the current customer email wins over the stale one on the job', async ({ page }) => {
    await load(page);
    await seed(page, {
      customers: [{ id: 'cus_1', name: 'Whitaker Marina', email: 'new@whitaker.example' }],
      specs: [{ contract: contract(), invoices: [inv()], jobEmail: 'old@whitaker.example' }],
    });
    const r = await page.evaluate(n => ctBillRunRows(n)[0], NOW);
    expect(r.to).toBe('new@whitaker.example');
  });

  test('an invoice short of the contract amount is flagged but still sendable', async ({ page }) => {
    await load(page);
    await seed(page, {
      customers: CUST,
      specs: [{ contract: contract(), invoices: [inv({ items: [{ desc: 'Part period', qty: 1, rate: 400 }] })] }],
    });
    const r = await page.evaluate(n => ctBillRunRows(n)[0], NOW);
    expect(r.sendable).toBe(true);
    expect(r.advisory[0]).toContain('$200.00 under the contract amount');
  });

  // Over the contract amount is an add-on riding along, which is normal.
  test('an invoice above the contract amount is not flagged', async ({ page }) => {
    await load(page);
    await seed(page, {
      customers: CUST,
      specs: [{ contract: contract(), invoices: [inv({ items: [{ desc: 'Month', qty: 1, rate: 600 }, { desc: 'Callout', qty: 1, rate: 450 }] })] }],
    });
    const r = await page.evaluate(n => ctBillRunRows(n)[0], NOW);
    expect(r.advisory).toHaveLength(0);
  });

  test('an account already overdue is called out before another bill lands', async ({ page }) => {
    await load(page);
    await seed(page, {
      customers: CUST,
      specs: [{
        contract: contract(),
        invoices: [
          inv({ id: 'old', number: 'INV-900', status: 'sent', sent: 1, dueDate: '2026-01-15' }),
          inv({ id: 'new', number: 'INV-1001' }),
        ],
      }],
    });
    const r = await page.evaluate(n => ctBillRunRows(n)[0], NOW);
    expect(r.sendable).toBe(true);
    expect(r.advisory.join(' ')).toContain('$600.00 is already overdue');
  });

  test('totals separate what can go from what cannot', async ({ page }) => {
    await load(page);
    await seed(page, {
      customers: [
        { id: 'cus_1', name: 'A', email: 'a@example.com' },
        { id: 'cus_2', name: 'B', email: '' },
      ],
      specs: [
        { contract: contract({ id: 'ct_a', customerId: 'cus_1' }), invoices: [inv({ number: 'INV-1' })] },
        { contract: contract({ id: 'ct_b', customerId: 'cus_2' }), invoices: [inv({ number: 'INV-2' })], jobEmail: '' },
      ],
    });
    const t = await page.evaluate(n => ctBillRunTotals(ctBillRunRows(n)), NOW);
    expect(t.count).toBe(2);
    expect(t.sendable).toBe(1);
    expect(t.blocked).toBe(1);
    expect(t.total).toBe(600);
    expect(t.customers).toBe(1);
  });
});

test.describe('the run', () => {
  test('sends each invoice once and stamps it', async ({ page }) => {
    await load(page);
    await seed(page, {
      customers: CUST,
      specs: [{ contract: contract(), invoices: [inv({ id: 'i1', number: 'INV-1' }), inv({ id: 'i2', number: 'INV-2' })] }],
    });
    await stubDelivery(page);
    const out = await page.evaluate(async (n) => {
      const r = await ctRunBilling(ctBillRunRows(n), { channel: 'smtp' });
      return { r: { sent: r.sent, failed: r.failed, total: r.total }, sends: window.__sends, left: ctBillRunRows(n).length };
    }, NOW);
    expect(out.r).toEqual({ sent: 2, failed: 0, total: 1200 });
    expect(out.sends.map(s => s.number)).toEqual(['INV-1', 'INV-2']);
    expect(out.sends[0].to).toBe('ap@whitaker.example');
    // Stamped, so a second run has nothing to do.
    expect(out.left).toBe(0);
  });

  test('running twice does not bill anyone twice', async ({ page }) => {
    await load(page);
    await seed(page, { customers: CUST, specs: [{ contract: contract(), invoices: [inv()] }] });
    await stubDelivery(page);
    const sends = await page.evaluate(async (n) => {
      await ctRunBilling(ctBillRunRows(n), { channel: 'smtp' });
      await ctRunBilling(ctBillRunRows(n), { channel: 'smtp' });
      return window.__sends.length;
    }, NOW);
    expect(sends).toBe(1);
  });

  // The whole point of a bill run is that it finishes. A bounce on invoice two
  // must not silently cancel invoices three through twelve.
  test('one failure does not stop the rest of the run', async ({ page }) => {
    await load(page);
    await seed(page, {
      customers: CUST,
      specs: [{ contract: contract(), invoices: [inv({ id: 'i1', number: 'INV-1' }), inv({ id: 'i2', number: 'INV-2' }), inv({ id: 'i3', number: 'INV-3' })] }],
    });
    await stubDelivery(page, { failOn: ['INV-2'] });
    const out = await page.evaluate(async (n) => {
      const r = await ctRunBilling(ctBillRunRows(n), { channel: 'smtp' });
      return {
        sent: r.sent, failed: r.failed, total: r.total,
        attempted: window.__sends.map(s => s.number),
        errors: r.results.filter(x => !x.ok).map(x => x.error),
      };
    }, NOW);
    expect(out.attempted).toEqual(['INV-1', 'INV-2', 'INV-3']);
    expect(out.sent).toBe(2);
    expect(out.failed).toBe(1);
    expect(out.total).toBe(1200);
    expect(out.errors).toEqual(['Mailbox full']);
  });

  // A failed send must leave the invoice exactly where it was. Stamping it
  // would lose the money silently — the invoice would look sent and never be
  // retried by anyone.
  test('a failed invoice stays a draft and comes back on the next run', async ({ page }) => {
    await load(page);
    await seed(page, {
      customers: CUST,
      specs: [{ contract: contract(), invoices: [inv({ id: 'i1', number: 'INV-1' }), inv({ id: 'i2', number: 'INV-2' })] }],
    });
    await stubDelivery(page, { failOn: ['INV-2'] });
    const out = await page.evaluate(async (n) => {
      await ctRunBilling(ctBillRunRows(n), { channel: 'smtp' });
      const left = ctBillRunRows(n);
      const j = S.jobs[ctBillingJobId({ id: 'ct_a' })];
      return {
        left: left.map(r => r.inv.number),
        stamps: j.invoices.map(i => ({ n: i.number, sent: !!i.sent, status: i.status })),
      };
    }, NOW);
    expect(out.left).toEqual(['INV-2']);
    expect(out.stamps).toEqual([
      { n: 'INV-1', sent: true, status: 'sent' },
      { n: 'INV-2', sent: false, status: 'draft' },
    ]);
  });

  test('refuses to start with no email channel', async ({ page }) => {
    await load(page);
    await seed(page, { customers: CUST, specs: [{ contract: contract(), invoices: [inv()] }] });
    await stubDelivery(page);
    const r = await page.evaluate(async (n) => {
      try {
        await ctRunBilling(ctBillRunRows(n), {});
        return { threw: false, sends: window.__sends.length };
      } catch (e) {
        return { threw: true, message: e.message, sends: window.__sends.length };
      }
    }, NOW);
    // The Firebase stub throws on auth() and Gmail is not connected, so there
    // is genuinely no channel here.
    expect(r.threw).toBe(true);
    expect(r.message).toContain('No email channel');
    expect(r.sends).toBe(0);
  });

  test('reports progress per invoice as it goes', async ({ page }) => {
    await load(page);
    await seed(page, {
      customers: CUST,
      specs: [{ contract: contract(), invoices: [inv({ id: 'i1', number: 'INV-1' }), inv({ id: 'i2', number: 'INV-2' })] }],
    });
    await stubDelivery(page);
    const seen = await page.evaluate(async (n) => {
      const out = [];
      await ctRunBilling(ctBillRunRows(n), { channel: 'smtp', onProgress: (i, total, row) => out.push(`${i + 1}/${total} ${row.inv.number}`) });
      return out;
    }, NOW);
    expect(seen).toEqual(['1/2 INV-1', '2/2 INV-2']);
  });
});

test.describe('the page', () => {
  test('leads with what is ready and what is held back', async ({ page }) => {
    await load(page);
    await seed(page, {
      customers: [
        { id: 'cus_1', name: 'Whitaker Marina', email: 'ap@whitaker.example' },
        { id: 'cus_2', name: 'No Email Co', email: '' },
      ],
      specs: [
        { contract: contract({ id: 'ct_a', customerId: 'cus_1' }), invoices: [inv({ number: 'INV-1' })] },
        { contract: contract({ id: 'ct_b', customerId: 'cus_2' }), invoices: [inv({ number: 'INV-2' })], jobEmail: '' },
      ],
    });
    const html = await page.evaluate(n => renderBillRun(n), NOW);
    expect(html).toContain('Ready to send');
    expect(html).toContain('$600.00');
    expect(html).toContain('Held back');
    expect(html).toContain('No email address for this customer');
  });

  test('a blocked invoice cannot be ticked', async ({ page }) => {
    await load(page);
    await seed(page, {
      customers: [{ id: 'cus_1', name: 'No Email Co', email: '' }],
      specs: [{ contract: contract(), invoices: [inv()], jobEmail: '' }],
    });
    const html = await page.evaluate(n => renderBillRun(n), NOW);
    expect(html).toContain('disabled');
    expect(html).not.toContain('checked');
  });

  test('says up front when there is no way to send', async ({ page }) => {
    await load(page);
    await seed(page, { customers: CUST, specs: [{ contract: contract(), invoices: [inv()] }] });
    const html = await page.evaluate(n => renderBillRun(n), NOW);
    expect(html).toContain('No way to send yet');
    expect(html).toContain('you can still review the list below');
  });

  test('an empty run explains where invoices come from', async ({ page }) => {
    await load(page);
    const html = await page.evaluate(n => renderBillRun(n), NOW);
    expect(html).toContain('Nothing is waiting to go out');
    expect(html).toContain('Generate');
  });

  // Failures must be named on screen, not summarised into a toast that scrolls
  // away. This is the exact shape of the bug that lost contracts earlier.
  test('the result panel names every failure and its reason', async ({ page }) => {
    await load(page);
    await seed(page, {
      customers: CUST,
      specs: [{ contract: contract(), invoices: [inv({ id: 'i1', number: 'INV-1' }), inv({ id: 'i2', number: 'INV-2' })] }],
    });
    await stubDelivery(page, { failOn: ['INV-2'] });
    const html = await page.evaluate(async (n) => {
      S.ctBillResult = await ctRunBilling(ctBillRunRows(n), { channel: 'smtp' });
      return renderBillRun(n);
    }, NOW);
    expect(html).toContain('1 invoice sent');
    expect(html).toContain('1 failed');
    expect(html).toContain('Mailbox full');
    expect(html).toContain('still in the list');
  });

  test('a clean run says so without listing anything', async ({ page }) => {
    await load(page);
    await seed(page, { customers: CUST, specs: [{ contract: contract(), invoices: [inv()] }] });
    await stubDelivery(page);
    const html = await page.evaluate(async (n) => {
      S.ctBillResult = await ctRunBilling(ctBillRunRows(n), { channel: 'smtp' });
      return renderBillRun(n);
    }, NOW);
    expect(html).toContain('1 invoice sent · $600.00');
    expect(html).toContain('Every selected invoice went out');
  });
});

test.describe('routing', () => {
  test('the button appears only when something is waiting', async ({ page }) => {
    await load(page);
    await page.click('.nav-btn[data-view="contracts"]');
    expect(await page.locator('#btn-ct-bills').count()).toBe(0);

    await seed(page, { customers: CUST, specs: [{ contract: contract(), invoices: [inv()] }] });
    await page.evaluate(() => render());
    await expect(page.locator('#btn-ct-bills')).toHaveText('Bill Run · 1');
  });

  test('opens the run and comes back', async ({ page }) => {
    await load(page);
    await seed(page, { customers: CUST, specs: [{ contract: contract(), invoices: [inv()] }] });
    await page.click('.nav-btn[data-view="contracts"]');
    await page.click('#btn-ct-bills');
    await expect(page.locator('text=Unsent invoices')).toBeVisible();
    await page.click('[data-ct-bill-back]');
    await expect(page.locator('#btn-ct-add')).toBeVisible();
  });

  test('unticking updates the count on the send button', async ({ page }) => {
    await load(page);
    await seed(page, {
      customers: CUST,
      specs: [{ contract: contract(), invoices: [inv({ id: 'i1', number: 'INV-1' }), inv({ id: 'i2', number: 'INV-2' })] }],
    });
    await page.click('.nav-btn[data-view="contracts"]');
    await page.click('#btn-ct-bills');
    await expect(page.locator('#ct-bill-count')).toHaveText('2');
    await page.locator('.ct-bill-pick').first().uncheck();
    await expect(page.locator('#ct-bill-count')).toHaveText('1');
  });

  test('the send button is disabled without a channel', async ({ page }) => {
    await load(page);
    await seed(page, { customers: CUST, specs: [{ contract: contract(), invoices: [inv()] }] });
    await page.click('.nav-btn[data-view="contracts"]');
    await page.click('#btn-ct-bills');
    await expect(page.locator('#ct-bill-send')).toBeDisabled();
  });
});

test.describe('project work is untouched', () => {
  test('a project company gets no bill run', async ({ page }) => {
    await stubExternals(page);
    await page.addInitScript(() => {
      localStorage.setItem('jt_company', 'mhs');
      localStorage.setItem('jt_companies', JSON.stringify({
        mhs: { id: 'mhs', ns: 'mhs', label: 'MHS', active: true, type: 'project' },
      }));
    });
    await page.goto('/');
    await page.waitForFunction(() => typeof window.ctBillRunRows === 'function');
    const r = await page.evaluate(() => ({ enabled: ctEnabled(), button: !!document.getElementById('btn-ct-bills') }));
    expect(r.enabled).toBe(false);
    expect(r.button).toBe(false);
  });

  // The single-invoice path degrades to downloading the PDF and opening a
  // compose tab. That is fine for one invoice and unusable for twelve, so the
  // bulk path must never reach it.
  test('the bulk path does not go through sendInvoicePDF', async ({ page }) => {
    await load(page);
    await seed(page, { customers: CUST, specs: [{ contract: contract(), invoices: [inv()] }] });
    const used = await page.evaluate(async (n) => {
      let called = false;
      const real = window.sendInvoicePDF;
      window.sendInvoicePDF = async () => { called = true; };
      window.ctDeliverInvoice = async () => {};
      await ctRunBilling(ctBillRunRows(n), { channel: 'smtp' });
      window.sendInvoicePDF = real;
      return called;
    }, NOW);
    expect(used).toBe(false);
  });
});

test.describe('a backlog arrives pre-overdue', () => {
  // Generating a year of missed billing produces invoices whose due dates are
  // behind us. Worth saying before the press, not after the customer notices.
  test('an invoice due in the past is flagged, and still sendable', async ({ page }) => {
    await load(page);
    await seed(page, {
      customers: CUST,
      specs: [{ contract: contract(), invoices: [inv({ dueDate: '2026-05-01' })] }],
    });
    const r = await page.evaluate(n => ctBillRunRows(n)[0], NOW);
    expect(r.sendable).toBe(true);
    expect(r.advisory.join(' ')).toContain('arrives already overdue');
  });

  test('an invoice due in the future is not flagged', async ({ page }) => {
    await load(page);
    await seed(page, {
      customers: CUST,
      specs: [{ contract: contract(), invoices: [inv({ dueDate: '2027-01-01' })] }],
    });
    const r = await page.evaluate(n => ctBillRunRows(n)[0], NOW);
    expect(r.advisory).toHaveLength(0);
  });

  test('a disabled send button reads as disabled, not just behaves as it', async ({ page }) => {
    await load(page);
    await seed(page, { customers: CUST, specs: [{ contract: contract(), invoices: [inv()] }] });
    await page.click('.nav-btn[data-view="contracts"]');
    await page.click('#btn-ct-bills');
    const btn = page.locator('#ct-bill-send');
    await expect(btn).toBeDisabled();
    // A full-width primary button that looks pressable and does nothing is
    // worse than no button.
    expect(Number(await btn.evaluate(el => getComputedStyle(el).opacity))).toBeLessThan(0.6);
  });
});
