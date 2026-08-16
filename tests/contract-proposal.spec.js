// The proposal.
//
// The document a customer reads before a contract goes live. Two things carry
// most of the weight here:
//
//   contract.pricing must never reach the customer. Crew rate, hours per visit
//   and target margin are what the work costs us; a customer who sees them has
//   the whole negotiation. Several cases below try to find those numbers in
//   every output the app can produce.
//
//   The document is built once as blocks and rendered twice. The email and the
//   PDF attachment must never say different things, so the content is tested at
//   the block level and both renderers are checked against it.

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
  await page.waitForFunction(() => typeof window.ctProposalBlocks === 'function');
  await page.evaluate(() => {
    S.contracts = {}; S.jobs = {}; S.customers = {}; S.timeEntries = {}; S.payRates = {};
    S.members = []; S.ctDetail = null; S.ctRoute = null; S.ctRevenue = false;
    S.ctBills = false; S._ctWired = false;
    ctSaveContractsLocal();
  });
}

// A fully-priced contract. The pricing block carries deliberately distinctive
// numbers so a leak into any output is unmistakable.
const PRICED = {
  id: 'ct_a', name: 'Dock maintenance', status: 'paused', startDate: '2026-07-01',
  customerId: 'cus_1',
  visits: { freq: 'monthly' }, visitsThrough: '2027-07-01',
  billing: { freq: 'monthly', amount: 650 },
  checklist: [
    { id: 'ck1', text: 'Inspect anodes, replace if under half' },
    { id: 'ck2', text: 'Tighten dock hardware and check bolts' },
  ],
  pricing: { hoursPerVisit: 3.7, crewRate: 83, driveMinutes: 47, materialsPerVisit: 61, targetMargin: 44 },
  proposal: {
    number: 'P-1007', date: '2026-06-15', validUntil: '2026-07-15',
    exclusions: 'Storm damage\nParts over $200',
    terms: 'Payment due on receipt.',
  },
};

async function seed(page, over) {
  await page.evaluate(async (a) => {
    await saveCustomer({ id: 'cus_1', name: 'Whitaker Marina', email: 'ap@whitaker.example', address: '1120 Lakeshore Dr' });
    await ctSaveContract(Object.assign({}, a.base, a.over || {}));
  }, { base: PRICED, over });
}

test.describe('the pricing block never reaches the customer', () => {
  // The numbers in PRICED.pricing are distinctive on purpose: 3.7, 83, 47, 61
  // and 44 appear nowhere else in this contract.
  const LEAKS = ['3.7', '83', '47', '61', '44'];

  test('not in the content blocks', async ({ page }) => {
    await load(page);
    await seed(page);
    const json = await page.evaluate(n => JSON.stringify(ctProposalBlocks(ctGetContract('ct_a'), n)), NOW);
    LEAKS.forEach(v => expect(json, `pricing value ${v} leaked into the blocks`).not.toContain(v));
  });

  test('not in the email HTML', async ({ page }) => {
    await load(page);
    await seed(page);
    const html = await page.evaluate(n => ctProposalHTML(ctGetContract('ct_a'), n), NOW);
    LEAKS.forEach(v => expect(html, `pricing value ${v} leaked into the email`).not.toContain(v));
    // And the thing it SHOULD say is there.
    expect(html).toContain('$650.00');
  });

  test('not in the plain-text alternative', async ({ page }) => {
    await load(page);
    await seed(page);
    const text = await page.evaluate(n => ctProposalText(ctGetContract('ct_a'), n), NOW);
    LEAKS.forEach(v => expect(text, `pricing value ${v} leaked into the text body`).not.toContain(v));
  });

  // Scanned as READ TEXT, not as markup — the raw HTML is full of CSS
  // `margin:` declarations, which is styling and not the cost concept. What
  // matters is what a customer's eye lands on.
  test('the words themselves never appear either', async ({ page }) => {
    await load(page);
    await seed(page);
    const all = await page.evaluate((n) => {
      const c = ctGetContract('ct_a');
      const el = document.createElement('div');
      el.innerHTML = ctProposalHTML(c, n);
      const visible = el.textContent || '';
      const blockText = ctProposalBlocks(c, n)
        .map(b => [b.text, b.headline, b.sub].concat(b.items || [], (b.rows || []).flat()).filter(Boolean).join(' '))
        .join(' ');
      return (visible + ' ' + ctProposalText(c, n) + ' ' + blockText).toLowerCase();
    }, NOW);
    ['crew rate', 'crewrate', 'target margin', 'targetmargin', 'hours per visit',
      'hourspervisit', 'margin', 'our cost', 'cost per visit'].forEach(w => {
      expect(all, `"${w}" appeared in customer-facing output`).not.toContain(w);
    });
  });
});

test.describe('the content', () => {
  test('the scope is the contract checklist, verbatim', async ({ page }) => {
    await load(page);
    await seed(page);
    const b = await page.evaluate(n => ctProposalBlocks(ctGetContract('ct_a'), n), NOW);
    const bullets = b.find(x => x.type === 'bullets');
    expect(bullets.items).toEqual([
      'Inspect anodes, replace if under half',
      'Tighten dock hardware and check bolts',
    ]);
  });

  // "Monthly" is what everyone says. Real dates are the differentiator, and
  // they come from the same period math that will generate the visits.
  test('the schedule names actual visit dates', async ({ page }) => {
    await load(page);
    await seed(page);
    const dates = await page.evaluate(n => ctProposalVisitDates(ctGetContract('ct_a'), 4).map(ctDateKey), NOW);
    expect(dates).toEqual(['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01']);
  });

  test('visit dates stop at the contract end date', async ({ page }) => {
    await load(page);
    await seed(page, { endDate: '2026-08-15' });
    const dates = await page.evaluate(n => ctProposalVisitDates(ctGetContract('ct_a'), 4).map(ctDateKey), NOW);
    expect(dates).toEqual(['2026-07-01', '2026-08-01']);
  });

  test('the price is the billing amount, annualized', async ({ page }) => {
    await load(page);
    await seed(page, { billing: { freq: 'quarterly', amount: 1800 } });
    const b = await page.evaluate(n => ctProposalBlocks(ctGetContract('ct_a'), n), NOW);
    const price = b.find(x => x.type === 'price');
    expect(price.headline).toBe('$1,800.00');
    expect(price.sub).toContain('quarterly');
    expect(price.sub).toContain('$7,200.00 a year');
  });

  test('exclusions split onto their own lines', async ({ page }) => {
    await load(page);
    await seed(page);
    const b = await page.evaluate(n => ctProposalBlocks(ctGetContract('ct_a'), n), NOW);
    const heads = b.filter(x => x.type === 'h').map(x => x.text);
    expect(heads).toContain('What is not included');
    const lists = b.filter(x => x.type === 'bullets');
    expect(lists[1].items).toEqual(['Storm damage', 'Parts over $200']);
  });

  test('a contract with no checklist says the scope is unconfirmed rather than nothing', async ({ page }) => {
    await load(page);
    await seed(page, { checklist: [] });
    const b = await page.evaluate(n => ctProposalBlocks(ctGetContract('ct_a'), n), NOW);
    const json = JSON.stringify(b);
    expect(json).toContain('Scope to be confirmed');
  });

  test('a retainer with no visits gets no schedule section', async ({ page }) => {
    await load(page);
    await seed(page, { visits: null, visitsThrough: '' });
    const b = await page.evaluate(n => ctProposalBlocks(ctGetContract('ct_a'), n), NOW);
    expect(b.filter(x => x.type === 'h').map(x => x.text)).not.toContain('How often');
    // It still has a price, which is the whole point of a retainer.
    expect(b.some(x => x.type === 'price')).toBe(true);
  });

  test('always ends with the acceptance block', async ({ page }) => {
    await load(page);
    await seed(page);
    const b = await page.evaluate(n => ctProposalBlocks(ctGetContract('ct_a'), n), NOW);
    expect(b[b.length - 1].type).toBe('sign');
  });
});

test.describe('the two renderers agree', () => {
  test('every block reaches both the HTML and the text', async ({ page }) => {
    await load(page);
    await seed(page);
    const r = await page.evaluate((n) => {
      const c = ctGetContract('ct_a');
      return { blocks: ctProposalBlocks(c, n), html: ctProposalHTML(c, n), text: ctProposalText(c, n) };
    }, NOW);
    r.blocks.forEach(b => {
      if (b.type === 'h') {
        expect(r.html, `heading "${b.text}" missing from HTML`).toContain(b.text);
        expect(r.text, `heading "${b.text}" missing from text`).toContain(b.text.toUpperCase());
      }
      if (b.type === 'bullets') b.items.forEach(i => {
        expect(r.html).toContain(i);
        expect(r.text).toContain(i);
      });
      if (b.type === 'price') {
        expect(r.html).toContain(b.headline);
        expect(r.text).toContain(b.headline);
      }
    });
  });

  test('customer-entered text is escaped, not injected', async ({ page }) => {
    await load(page);
    await seed(page, {
      checklist: [{ id: 'ck1', text: '<img src=x onerror=alert(1)>' }],
      proposal: Object.assign({}, PRICED.proposal, { intro: '<script>alert(2)</script>' }),
    });
    const html = await page.evaluate(n => ctProposalHTML(ctGetContract('ct_a'), n), NOW);
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>alert(2)');
    expect(html).toContain('&lt;img');
  });

  test('the header carries the number, the customer and the expiry', async ({ page }) => {
    await load(page);
    await seed(page);
    const html = await page.evaluate(n => ctProposalHTML(ctGetContract('ct_a'), n), NOW);
    expect(html).toContain('P-1007');
    expect(html).toContain('Whitaker Marina');
    expect(html).toContain('2026-07-15');
  });
});

test.describe('state', () => {
  test('walks draft to sent to accepted', async ({ page }) => {
    await load(page);
    await seed(page);
    const draft = await page.evaluate(n => ctProposalState(ctGetContract('ct_a'), n), NOW);
    expect(draft.level).toBe('draft');

    await page.evaluate(async (n) => {
      const c = ctGetContract('ct_a');
      await ctSaveContract(Object.assign({}, c, { proposal: Object.assign({}, c.proposal, { sentAt: n }) }));
    }, NOW);
    const sent = await page.evaluate(n => ctProposalState(ctGetContract('ct_a'), n), NOW);
    expect(sent.level).toBe('sent');
    expect(sent.detail).toContain('valid 30 more days');
  });

  test('a sent proposal past its date reads as expired', async ({ page }) => {
    await load(page);
    await seed(page, { proposal: Object.assign({}, PRICED.proposal, { validUntil: '2026-06-01', sentAt: 1 }) });
    const s = await page.evaluate(n => ctProposalState(ctGetContract('ct_a'), n), NOW);
    expect(s.level).toBe('expired');
    expect(s.detail).toContain('14 days ago');
  });

  // A decision outranks a date. An accepted proposal does not become "expired"
  // because its valid-until passed.
  test('acceptance outranks expiry', async ({ page }) => {
    await load(page);
    await seed(page, { proposal: Object.assign({}, PRICED.proposal, { validUntil: '2026-06-01', sentAt: 1, acceptedAt: 1750000000000 }) });
    const s = await page.evaluate(n => ctProposalState(ctGetContract('ct_a'), n), NOW);
    expect(s.level).toBe('accepted');
  });

  test('proposal numbers increment across contracts', async ({ page }) => {
    await load(page);
    await seed(page);
    const n = await page.evaluate(() => ctNewProposalNumber());
    expect(n).toBe('P-1008');
  });
});

test.describe('accepting activates the contract', () => {
  test('switches it to active and records who agreed', async ({ page }) => {
    await load(page);
    await seed(page);
    const before = await page.evaluate(() => ctGetContract('ct_a').status);
    expect(before).toBe('paused');

    const r = await page.evaluate(async (n) => {
      const out = await ctAcceptProposal('ct_a', 'Dana Whitaker', n);
      const c = ctGetContract('ct_a');
      return { activated: out.activated, status: c.status, by: c.proposal.acceptedBy, at: c.proposal.acceptedAt };
    }, NOW);
    expect(r.activated).toBe(true);
    expect(r.status).toBe('active');
    expect(r.by).toBe('Dana Whitaker');
    expect(r.at).toBe(NOW);
  });

  // Normalization parks a self-contradictory contract no matter what a document
  // says. The caller has to hear that rather than believe crews are booked.
  test('a contradictory contract is not activated, and says so', async ({ page }) => {
    await load(page);
    await seed(page, { startDate: '2026-07-01', endDate: '2026-01-01' });
    const r = await page.evaluate(async (n) => {
      const out = await ctAcceptProposal('ct_a', '', n);
      return { activated: out.activated, status: ctGetContract('ct_a').status };
    }, NOW);
    expect(r.activated).toBe(false);
    expect(r.status).toBe('paused');
  });

  test('declining records the decision and leaves the contract alone', async ({ page }) => {
    await load(page);
    await seed(page);
    const r = await page.evaluate(async (n) => {
      await ctDeclineProposal('ct_a', n);
      const c = ctGetContract('ct_a');
      return { status: c.status, declined: c.proposal.declinedAt, level: ctProposalState(c, n).level };
    }, NOW);
    expect(r.status).toBe('paused');
    expect(r.declined).toBe(NOW);
    expect(r.level).toBe('declined');
  });

  test('accepting after declining clears the decline', async ({ page }) => {
    await load(page);
    await seed(page);
    const level = await page.evaluate(async (n) => {
      await ctDeclineProposal('ct_a', n);
      await ctAcceptProposal('ct_a', 'Dana', n);
      return ctProposalState(ctGetContract('ct_a'), n).level;
    }, NOW);
    expect(level).toBe('accepted');
  });
});

test.describe('normalization', () => {
  test('an untouched proposal block normalizes away', async ({ page }) => {
    await load(page);
    const p = await page.evaluate(() => ctNormProposal({ number: '', intro: '', exclusions: '', terms: '', sentAt: 0 }));
    expect(p).toBeNull();
  });

  test('long fields are clamped to what the rules accept', async ({ page }) => {
    await load(page);
    const p = await page.evaluate(() => ctNormProposal({
      number: 'P'.repeat(100), intro: 'x'.repeat(5000), exclusions: 'y'.repeat(5000),
      terms: 'z'.repeat(9000), acceptedBy: 'n'.repeat(500), sentAt: -5,
    }));
    expect(p.number.length).toBe(32);
    expect(p.intro.length).toBe(1000);
    expect(p.exclusions.length).toBe(2000);
    expect(p.terms.length).toBe(4000);
    expect(p.acceptedBy.length).toBe(120);
    expect(p.sentAt).toBe(0);
  });

  test('terms are seeded from the invoice terms already in Settings', async ({ page }) => {
    await load(page);
    const t = await page.evaluate(() => {
      COMPANY.terms = 'Net 15. Late work billed at cost.';
      return ctDefaultProposalTerms();
    });
    expect(t).toContain('Net 15. Late work billed at cost.');
    expect(t).toContain('30 days written notice');
  });
});

test.describe('the price guard', () => {
  // The only moment the number can still be changed is while the proposal is
  // being drafted. After it is signed you are looking at it for a year.
  test('warns when the contract is priced under its own target', async ({ page }) => {
    await load(page);
    await seed(page);
    const hint = await page.evaluate(() => ctProposalPriceGuard(ctGetContract('ct_a')));
    // 3.7h + 47min drive at $83 plus $61 materials, at a 44% target, needs far
    // more than the $650 this contract bills.
    expect(hint).toContain('under by');
    expect(hint).toContain('$650.00');
  });

  test('says it is covered when the price clears the target', async ({ page }) => {
    await load(page);
    await seed(page, { billing: { freq: 'monthly', amount: 3000 } });
    const hint = await page.evaluate(() => ctProposalPriceGuard(ctGetContract('ct_a')));
    expect(hint).toContain('You are covered');
  });

  // The guard is for the person drafting. It must not end up in the document.
  test('the guard is not part of the document', async ({ page }) => {
    await load(page);
    await seed(page);
    const r = await page.evaluate((n) => {
      const c = ctGetContract('ct_a');
      return { guard: ctProposalPriceGuard(c), html: ctProposalHTML(c, n) };
    }, NOW);
    expect(r.guard).toContain('target');
    expect(r.html).not.toContain('target');
  });
});

test.describe('sending', () => {
  test('refuses without a customer email', async ({ page }) => {
    await load(page);
    await seed(page);
    const msg = await page.evaluate(async () => {
      await saveCustomer({ id: 'cus_1', name: 'Whitaker Marina', email: '' });
      try { await ctSendProposal('ct_a'); return 'sent'; } catch (e) { return e.message; }
    });
    expect(msg).toContain('No email address');
  });

  test('refuses without an email channel, and does not stamp it sent', async ({ page }) => {
    await load(page);
    await seed(page);
    const r = await page.evaluate(async () => {
      let msg = '';
      try { await ctSendProposal('ct_a'); } catch (e) { msg = e.message; }
      return { msg, sentAt: ctGetContract('ct_a').proposal.sentAt };
    });
    expect(r.msg).toContain('connect Gmail');
    expect(r.sentAt).toBe(0);
  });
});

test.describe('on the account page', () => {
  test('a contract with no proposal is offered one', async ({ page }) => {
    await load(page);
    await seed(page, { proposal: null });
    const html = await page.evaluate(n => renderContractDetail('ct_a', n), NOW);
    expect(html).toContain('Draft a proposal');
    expect(html).toContain('it can only ever promise what this contract will actually do');
  });

  test('a drafted proposal shows its number and state', async ({ page }) => {
    await load(page);
    await seed(page);
    const html = await page.evaluate(n => renderContractDetail('ct_a', n), NOW);
    expect(html).toContain('P-1007');
    expect(html).toContain('Draft');
    expect(html).toContain('btn-ct-prop-send');
  });

  test('an accepted proposal cannot be re-sent or re-accepted', async ({ page }) => {
    await load(page);
    await seed(page);
    const html = await page.evaluate(async (n) => {
      await ctAcceptProposal('ct_a', 'Dana', n);
      return renderContractDetail('ct_a', n);
    }, NOW);
    expect(html).toContain('Accepted');
    expect(html).not.toContain('btn-ct-prop-send');
    expect(html).not.toContain('btn-ct-prop-accept');
  });

  // Accepting normally activates. When it could not, the page has to say so —
  // otherwise it reads as agreed and nothing is being scheduled.
  test('accepted but still paused is called out', async ({ page }) => {
    await load(page);
    await seed(page, { proposal: Object.assign({}, PRICED.proposal, { acceptedAt: 1750000000000 }) });
    const html = await page.evaluate(n => renderContractDetail('ct_a', n), NOW);
    expect(html).toContain('nothing will generate until it is active');
  });
});

test.describe('project work is untouched', () => {
  test('a project company gets no proposals', async ({ page }) => {
    await stubExternals(page);
    await page.addInitScript(() => {
      localStorage.setItem('jt_company', 'mhs');
      localStorage.setItem('jt_companies', JSON.stringify({
        mhs: { id: 'mhs', ns: 'mhs', label: 'MHS', active: true, type: 'project' },
      }));
    });
    await page.goto('/');
    await page.waitForFunction(() => typeof window.ctProposalBlocks === 'function');
    const r = await page.evaluate(() => ({ enabled: ctEnabled(), btn: !!document.getElementById('btn-ct-prop-new') }));
    expect(r.enabled).toBe(false);
    expect(r.btn).toBe(false);
  });
});

// The PDF is the thing that actually gets attached, so the leak invariant is
// checked against what is DRAWN on it — every string passed to the renderer is
// recorded, rather than inferred from the block list.
async function withPdfSpy(page) {
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/jspdf/**', route => route.fulfill({
    contentType: 'application/javascript',
    body: require('fs').readFileSync(require.resolve('jspdf/dist/jspdf.umd.min.js'), 'utf8'),
  }));
  await page.evaluate(() => {
    window.__drawn = [];
    window.__pages = 1;
    // jsPDF attaches its API to the INSTANCE, not the prototype, so the
    // constructor is wrapped rather than the prototype patched.
    const load = window.loadPDFLibs;
    window.loadPDFLibs = () => load().then(() => {
      const Orig = window.__origJsPDF || (window.__origJsPDF = window.jspdf.jsPDF);
      function Wrapped() {
        const inst = new Orig(...arguments);
        const text = inst.text.bind(inst), addPage = inst.addPage.bind(inst);
        inst.text = function (t) { [].concat(t).forEach(x => window.__drawn.push(String(x))); return text.apply(null, arguments); };
        inst.addPage = function () { window.__pages++; return addPage.apply(null, arguments); };
        return inst;
      }
      return { jsPDF: Wrapped };
    });
  });
}

test.describe('the PDF', () => {
  test('builds, and carries the scope and the price', async ({ page }) => {
    await load(page);
    await seed(page);
    await withPdfSpy(page);
    const r = await page.evaluate(async (n) => {
      const f = await ctBuildProposalPDF(ctGetContract('ct_a'), n);
      return { name: f.name, size: f.size, pages: window.__pages, drawn: window.__drawn.join(' | ') };
    }, NOW);
    expect(r.name).toBe('Proposal-P-1007.pdf');
    expect(r.size).toBeGreaterThan(1000);
    expect(r.drawn).toContain('Inspect anodes, replace if under half');
    expect(r.drawn).toContain('$650.00');
    expect(r.drawn).toContain('P-1007');
    expect(r.drawn).toContain('Accepted by');
  });

  test('no pricing figure is ever drawn on it', async ({ page }) => {
    await load(page);
    await seed(page);
    await withPdfSpy(page);
    const drawn = await page.evaluate(async (n) => {
      await ctBuildProposalPDF(ctGetContract('ct_a'), n);
      return window.__drawn.join(' | ');
    }, NOW);
    ['3.7', '83', '47', '61', '44'].forEach(v =>
      expect(drawn, `pricing value ${v} was drawn on the PDF`).not.toContain(v));
    expect(drawn.toLowerCase()).not.toContain('margin');
  });

  test('a short proposal is one page', async ({ page }) => {
    await load(page);
    await seed(page, { proposal: Object.assign({}, PRICED.proposal, { exclusions: '', terms: 'Payment due on receipt.' }) });
    await withPdfSpy(page);
    const pages = await page.evaluate(async (n) => {
      await ctBuildProposalPDF(ctGetContract('ct_a'), n);
      return window.__pages;
    }, NOW);
    expect(pages).toBe(1);
  });

  // A long scope must overflow onto more pages rather than overprint, which is
  // the failure the invoice PDF had before it was measured-then-packed.
  test('a long proposal paginates without losing anything', async ({ page }) => {
    await load(page);
    const many = Array.from({ length: 40 }, (_, i) => ({ id: 'ck' + i, text: 'Checklist item number ' + i + ' with enough words on it to wrap onto a second line in the document' }));
    await seed(page, { checklist: many });
    await withPdfSpy(page);
    const r = await page.evaluate(async (n) => {
      await ctBuildProposalPDF(ctGetContract('ct_a'), n);
      return { pages: window.__pages, drawn: window.__drawn.join(' | ') };
    }, NOW);
    expect(r.pages).toBeGreaterThan(1);
    // First, last and the signature block all survived the packing.
    expect(r.drawn).toContain('Checklist item number 0');
    expect(r.drawn).toContain('Checklist item number 39');
    expect(r.drawn).toContain('Accepted by');
    expect(r.drawn).toContain('2 of ');
  });

  test('a retainer with no visits still produces a valid document', async ({ page }) => {
    await load(page);
    await seed(page, { visits: null, visitsThrough: '', checklist: [] });
    await withPdfSpy(page);
    const r = await page.evaluate(async (n) => {
      const f = await ctBuildProposalPDF(ctGetContract('ct_a'), n);
      return { size: f.size, drawn: window.__drawn.join(' | ') };
    }, NOW);
    expect(r.size).toBeGreaterThan(1000);
    expect(r.drawn).toContain('$650.00');
    expect(r.drawn).not.toContain('HOW OFTEN');
  });
});
