// Visit reports — telling the customer what was done.
//
// A maintenance customer pays the same fee whether or not anything broke, and
// by month four starts wondering what they are paying for. That, not
// dissatisfaction, is what cancels agreements. These cases are about the ways
// a proof-of-service email fails at its own job: going out when nothing was
// done, claiming work that was not ticked, or going out twice.

const { expect, test } = require('@playwright/test');
const { stubExternals } = require('./_stubs');

const DAY = '2026-03-16';

async function load(page) {
  await stubExternals(page);
  await page.addInitScript(() => {
    localStorage.setItem('jt_company', 'wfs');
    localStorage.setItem('jt_companies', JSON.stringify({
      wfs: { id: 'wfs', ns: 'wfs', label: 'Waterfront Solutions', active: true, type: 'maintenance' },
    }));
  });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.ctVisitReportState === 'function');
  await page.evaluate(() => {
    S.contracts = {}; S.jobs = {}; S.customers = {}; S.ctDetail = null; S.ctRoute = null;
    S.ctSearch = ''; S._ctWired = false; ctSaveContractsLocal();
  });
}

// A contract with a customer who has an email, plus one generated visit.
async function seed(page, over) {
  return page.evaluate(async (o) => {
    await saveCustomer({ id: 'cus_1', name: 'Dale Whitaker', email: 'dale@example.com', address: '1120 Lakeshore Dr' });
    await ctSaveContract({
      id: 'ct_a', name: 'Dock maintenance', customerId: 'cus_1', status: 'active',
      startDate: '2026-03-01', visits: { freq: 'monthly' }, visitsThrough: '2026-03-31',
      checklist: [{ id: 'ck1', text: 'Check anodes' }, { id: 'ck2', text: 'Tighten hardware' }, { id: 'ck3', text: 'Photos' }],
    });
    await ctRunGeneration(ctPendingWork(new Date(2026, 2, 16).getTime()), {});
    const j = ctContractJobs('ct_a')[0];
    j.startDate = '2026-03-16'; j.dueDate = '2026-03-16';
    j.customerName = 'Dale Whitaker'; j.address = '1120 Lakeshore Dr';
    Object.assign(j, o || {});
    await writeJob(j);
    return j.id;
  }, over);
}

// Sending requires a signed-in team account, the same as the invoice send.
// The shared stub disables auth, so simulate a signed-in user where a send is
// actually exercised.
const signIn = (page) => page.evaluate(() => {
  window.firebase = { apps: [{}], auth: () => ({ currentUser: { getIdToken: async () => 'test-token' } }) };
});

const tick = (page, jobId, n) => page.evaluate(async (args) => {
  const j = S.jobs[args.jobId];
  j.tasks.slice(0, args.n).forEach(t => { t.done = true; t.doneBy = 'Dale'; t.doneTime = Date.now(); });
  await writeJob(j);
}, { jobId, n });

test.describe('whether there is anything to report', () => {
  test('a visit with nothing ticked and no photos cannot be reported', async ({ page }) => {
    await load(page);
    const id = await seed(page);
    const st = await page.evaluate((jobId) => ctVisitReportState(S.jobs[jobId]), id);
    // An email saying nothing was done invites exactly the question this
    // feature exists to prevent.
    expect(st.can).toBe(false);
    expect(st.reason).toContain('nothing to report');
  });

  test('one ticked item is enough', async ({ page }) => {
    await load(page);
    const id = await seed(page);
    await tick(page, id, 1);
    const st = await page.evaluate((jobId) => ctVisitReportState(S.jobs[jobId]), id);
    expect(st.can).toBe(true);
    expect(st.done).toHaveLength(1);
    expect(st.outstanding).toHaveLength(2);
  });

  test('a photo alone is enough, even with no checklist', async ({ page }) => {
    await load(page);
    const id = await seed(page, { tasks: [], photos: [{ id: 'p1', url: 'https://example.com/a.jpg' }] });
    const st = await page.evaluate((jobId) => ctVisitReportState(S.jobs[jobId]), id);
    expect(st.can).toBe(true);
    expect(st.photos).toHaveLength(1);
  });

  test('no customer email means no report, and says so', async ({ page }) => {
    await load(page);
    const id = await seed(page);
    await tick(page, id, 2);
    const st = await page.evaluate(async (jobId) => {
      await saveCustomer({ id: 'cus_1', name: 'Dale Whitaker', email: '' });
      S.jobs[jobId].customerEmail = '';
      return ctVisitReportState(S.jobs[jobId]);
    }, id);
    expect(st.can).toBe(false);
    expect(st.reason).toContain('No email address');
  });

  test('the job\'s own email is the fallback when the customer record has none', async ({ page }) => {
    await load(page);
    const id = await seed(page, { customerEmail: 'fallback@example.com' });
    await tick(page, id, 1);
    const to = await page.evaluate(async (jobId) => {
      await saveCustomer({ id: 'cus_1', name: 'Dale Whitaker', email: '' });
      return ctVisitReportState(S.jobs[jobId]).to;
    }, id);
    expect(to).toBe('fallback@example.com');
  });
});

test.describe('what the email says', () => {
  test('lists what was ticked, with who did it', async ({ page }) => {
    await load(page);
    const id = await seed(page);
    await tick(page, id, 2);
    const r = await page.evaluate((jobId) => ({
      html: ctVisitReportHTML(S.jobs[jobId]),
      text: ctVisitReportText(S.jobs[jobId]),
    }), id);
    expect(r.html).toContain('Check anodes');
    expect(r.html).toContain('Tighten hardware');
    expect(r.html).toContain('Dale');
    expect(r.text).toContain('- Check anodes (Dale)');
  });

  // Listing work that was not done, to the customer, reads as an admission
  // rather than a report. The composer warns the sender instead.
  test('does not claim work that was not ticked', async ({ page }) => {
    await load(page);
    const id = await seed(page);
    await tick(page, id, 1);
    const html = await page.evaluate((jobId) => ctVisitReportHTML(S.jobs[jobId]), id);
    expect(html).toContain('Check anodes');
    expect(html).not.toContain('Tighten hardware');
  });

  test('embeds the photos', async ({ page }) => {
    await load(page);
    const id = await seed(page, { photos: [{ id: 'p1', url: 'https://example.com/a.jpg' }, { id: 'p2', url: 'https://example.com/b.jpg' }] });
    await tick(page, id, 1);
    const html = await page.evaluate((jobId) => ctVisitReportHTML(S.jobs[jobId]), id);
    expect(html).toContain('https://example.com/a.jpg');
    expect(html).toContain('https://example.com/b.jpg');
  });

  test('a custom message replaces the default opening', async ({ page }) => {
    await load(page);
    const id = await seed(page);
    await tick(page, id, 1);
    const r = await page.evaluate((jobId) => ({
      def: ctVisitReportHTML(S.jobs[jobId]),
      custom: ctVisitReportHTML(S.jobs[jobId], 'Everything looked good, no issues to flag.'),
    }), id);
    expect(r.def).toContain('Here is what we took care of');
    expect(r.custom).toContain('Everything looked good');
    expect(r.custom).not.toContain('Here is what we took care of');
  });

  test('untrusted text is escaped', async ({ page }) => {
    await load(page);
    const id = await seed(page, { customerName: '<img src=x onerror=alert(1)>' });
    await page.evaluate(async (jobId) => {
      const j = S.jobs[jobId];
      j.tasks[0].text = '<script>alert(1)<\/script>';
      j.tasks[0].done = true;
      await writeJob(j);
    }, id);
    const html = await page.evaluate((jobId) => ctVisitReportHTML(S.jobs[jobId], '<b>hi</b>'), id);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;b&gt;hi');
  });

  test('the subject names the company and the date', async ({ page }) => {
    await load(page);
    const id = await seed(page);
    await tick(page, id, 1);
    const subject = await page.evaluate((jobId) => ctVisitReportSubject(S.jobs[jobId]), id);
    expect(subject).toContain('visit report');
    expect(subject.length).toBeGreaterThan(10);
  });
});

test.describe('sending', () => {
  // Body-only. The checklist and photos are the message; there is no document.
  test('posts with attachment:false and no PDF', async ({ page }) => {
    await load(page);
    const id = await seed(page);
    await tick(page, id, 2);
    await signIn(page);
    const sent = await page.evaluate(async (jobId) => {
      let captured = null;
      window.fetch = async (url, opts) => {
        captured = { url, body: JSON.parse(opts.body) };
        return { ok: true, json: async () => ({ ok: true }) };
      };
      await ctSendVisitReport(S.jobs[jobId], {});
      return captured;
    }, id);
    expect(sent.url).toContain('/.netlify/functions/send-invoice');
    expect(sent.body.attachment).toBe(false);
    expect(sent.body.pdfBase64).toBeUndefined();
    expect(sent.body.to).toBe('dale@example.com');
    expect(sent.body.html).toContain('Check anodes');
    expect(sent.body.message).toContain('Check anodes');
  });

  test('stamps the job so it shows as reported', async ({ page }) => {
    await load(page);
    const id = await seed(page);
    await tick(page, id, 1);
    await signIn(page);
    const r = await page.evaluate(async (jobId) => {
      window.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
      await ctSendVisitReport(S.jobs[jobId], {});
      const st = ctVisitReportState(S.jobs[jobId]);
      return { at: S.jobs[jobId].visitReportedAt, to: S.jobs[jobId].visitReportedTo, sentAt: st.sentAt };
    }, id);
    expect(r.at).toBeGreaterThan(0);
    expect(r.to).toBe('dale@example.com');
    expect(r.sentAt).toBe(r.at);
  });

  test('a server error surfaces and does not mark it sent', async ({ page }) => {
    await load(page);
    const id = await seed(page);
    await tick(page, id, 1);
    await signIn(page);
    const r = await page.evaluate(async (jobId) => {
      window.fetch = async () => ({ ok: false, json: async () => ({ error: 'Email not set up yet' }) });
      let msg = '';
      try { await ctSendVisitReport(S.jobs[jobId], {}); } catch (e) { msg = e.message; }
      return { msg, stamped: !!S.jobs[jobId].visitReportedAt };
    }, id);
    expect(r.msg).toContain('Email not set up yet');
    expect(r.stamped).toBe(false);
  });

  test('refuses a visit with nothing to report', async ({ page }) => {
    await load(page);
    const id = await seed(page);
    const msg = await page.evaluate(async (jobId) => {
      window.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
      try { await ctSendVisitReport(S.jobs[jobId], {}); return ''; } catch (e) { return e.message; }
    }, id);
    expect(msg).toContain('nothing to report');
  });
});

test.describe('the composer', () => {
  test('previews the email and warns about unticked items', async ({ page }) => {
    await load(page);
    const id = await seed(page);
    await tick(page, id, 1);
    await page.evaluate((jobId) => openVisitReportComposer(jobId), id);
    const r = await page.evaluate(() => ({
      to: document.getElementById('vr-to').value,
      body: document.querySelector('.modal-body').textContent,
      hasPreview: !!document.getElementById('vr-preview'),
      canSend: !document.getElementById('vr-send').disabled,
    }));
    expect(r.to).toBe('dale@example.com');
    expect(r.hasPreview).toBe(true);
    expect(r.canSend).toBe(true);
    // Judgement stays with the person sending, but they are told.
    expect(r.body).toContain('2 items still unticked');
    expect(r.body).toContain('Tighten hardware');
  });

  test('blocks and explains when there is nothing to report', async ({ page }) => {
    await load(page);
    const id = await seed(page);
    await page.evaluate((jobId) => openVisitReportComposer(jobId), id);
    const r = await page.evaluate(() => ({
      body: document.querySelector('.modal-body').textContent,
      disabled: document.getElementById('vr-send').disabled,
    }));
    expect(r.disabled).toBe(true);
    expect(r.body).toContain('nothing to report');
  });

  test('warns before sending a second copy', async ({ page }) => {
    await load(page);
    const id = await seed(page);
    await tick(page, id, 1);
    await signIn(page);
    await page.evaluate(async (jobId) => {
      window.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
      await ctSendVisitReport(S.jobs[jobId], {});
      openVisitReportComposer(jobId);
    }, id);
    const body = await page.evaluate(() => document.querySelector('.modal-body').textContent);
    expect(body).toContain('Already sent');
    expect(body).toContain('second copy');
  });

  test('sends what was typed, then closes', async ({ page }) => {
    await load(page);
    const id = await seed(page);
    await tick(page, id, 2);
    await signIn(page);
    await page.evaluate((jobId) => {
      window.__sent = null;
      window.fetch = async (url, opts) => { window.__sent = JSON.parse(opts.body); return { ok: true, json: async () => ({ ok: true }) }; };
      openVisitReportComposer(jobId);
    }, id);
    await page.fill('#vr-msg', 'All good this month, nothing needed.');
    await page.fill('#vr-to', 'someone.else@example.com');
    await page.click('#vr-send');
    const r = await page.evaluate(() => ({
      open: !!document.getElementById('vr-bd'),
      sent: window.__sent,
    }));
    expect(r.open).toBe(false);
    expect(r.sent.to).toBe('someone.else@example.com');
    expect(r.sent.html).toContain('All good this month');
  });
});

test.describe('where it is offered', () => {
  test('on the account page, only for reportable visits', async ({ page }) => {
    await load(page);
    const id = await seed(page);
    let html = await page.evaluate(() => renderContractDetail('ct_a'));
    expect(html).not.toContain('data-ct-report');

    await tick(page, id, 1);
    html = await page.evaluate(() => renderContractDetail('ct_a'));
    expect(html).toContain('data-ct-report');
    expect(html).toContain('Send report');
  });

  test('the account page shows it as reported afterwards', async ({ page }) => {
    await load(page);
    const id = await seed(page);
    await tick(page, id, 1);
    await signIn(page);
    const html = await page.evaluate(async (jobId) => {
      window.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
      await ctSendVisitReport(S.jobs[jobId], {});
      return renderContractDetail('ct_a');
    }, id);
    expect(html).toContain('Reported');
    expect(html).not.toContain('Send report');
  });

  test('on the day route too', async ({ page }) => {
    await load(page);
    const id = await seed(page);
    await tick(page, id, 1);
    const html = await page.evaluate((d) => renderDayRoute(d), DAY);
    expect(html).toContain('data-ct-report');
  });

  test('the button opens the composer from the account page', async ({ page }) => {
    await load(page);
    const id = await seed(page);
    await tick(page, id, 1);
    await page.evaluate(() => { S.view = 'contracts'; S.ctDetail = 'ct_a'; render(); });
    await page.click('[data-ct-report]');
    expect(await page.evaluate(() => !!document.getElementById('vr-bd'))).toBe(true);
  });
});

test.describe('project work is untouched', () => {
  test('a project company gets no reporting and still renders', async ({ page }) => {
    await stubExternals(page);
    await page.addInitScript(() => localStorage.setItem('jt_company', 'wfs'));
    await page.goto('/');
    await page.waitForFunction(() => typeof window.renderJobs === 'function');
    const r = await page.evaluate(() => {
      S.view = 'invoices'; render();
      const invoices = document.getElementById('content').innerHTML.length > 0;
      S.view = 'jobs'; render();
      return { invoices, jobs: document.getElementById('content').innerHTML.length > 0, enabled: ctEnabled() };
    });
    expect(r.invoices).toBe(true);
    expect(r.jobs).toBe(true);
    expect(r.enabled).toBe(false);
  });
});
