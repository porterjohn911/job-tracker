// The contract checklist — scope defined once, copied onto every visit.
//
// Before this, a generated visit was a name, a date and an address. Whoever
// opened "Dock maintenance — Sep 2026" on a dock had nothing telling them what
// the job was; the scope lived in someone's head. The checklist is what makes a
// generated visit usable in the field, and a ticked one is the proof of service
// that justifies a fixed fee in a month when nothing broke.
//
// It rides on the job task list the app already has, so the crew side needed
// no new UI at all.

const { expect, test } = require('@playwright/test');
const { stubExternals } = require('./_stubs');

const MARCH = new Date(2026, 2, 15).getTime();

async function load(page) {
  await stubExternals(page);
  await page.addInitScript(() => {
    localStorage.setItem('jt_company', 'wfs');
    localStorage.setItem('jt_companies', JSON.stringify({
      wfs: { id: 'wfs', ns: 'wfs', label: 'Waterfront Solutions', active: true, type: 'maintenance' },
    }));
  });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.ctNormChecklist === 'function');
  await page.evaluate(() => {
    S.contracts = {}; S.jobs = {}; S.customers = {}; S.ctDetail = null; S.ctSearch = '';
    S.timeEntries = {}; S.payRates = {}; S._ctWired = false;
    ctSaveContractsLocal();
  });
}

const withList = {
  id: 'ct_a', name: 'Dock maintenance', status: 'active', startDate: '2026-01-01',
  visits: { freq: 'monthly' }, visitsThrough: '2026-03-01',
  checklist: [
    { id: 'ck1', text: 'Check anodes' },
    { id: 'ck2', text: 'Tighten hardware' },
    { id: 'ck3', text: 'Before and after photos' },
  ],
};

test.describe('normalization', () => {
  test('keeps order, trims, and drops empties', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => ctNormChecklist([
      { id: 'a', text: '  Check anodes  ' },
      { text: 'Tighten hardware' },
      { id: 'c', text: '   ' },
      { id: 'd' },
      null,
      { id: 'e', text: 'Photos' },
    ]));
    // Order is the order the crew works in, so it is preserved, not sorted.
    expect(r.map(i => i.text)).toEqual(['Check anodes', 'Tighten hardware', 'Photos']);
    expect(r[0].id).toBe('a');
    // An item with no id gets one rather than being dropped.
    expect(r[1].id).toMatch(/^ck_/);
  });

  test('survives a round trip and accepts a Firebase-shaped map', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const once = ctNormalizeContract({ id: 'c1', checklist: [{ id: 'a', text: 'One' }, { id: 'b', text: 'Two' }] });
      const twice = ctNormalizeContract(once);
      // Firebase hands arrays back as objects keyed by index.
      const fromMap = ctNormalizeContract({ id: 'c2', checklist: { 0: { id: 'a', text: 'One' }, 1: { id: 'b', text: 'Two' } } });
      return {
        stable: JSON.stringify(once.checklist) === JSON.stringify(twice.checklist),
        fromMap: fromMap.checklist.map(i => i.text),
      };
    });
    expect(r.stable).toBe(true);
    expect(r.fromMap).toEqual(['One', 'Two']);
  });

  test('a contract with no checklist is flagged, not broken', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const bare = ctNormalizeContract({ id: 'c1', name: 'X', status: 'active', startDate: '2026-01-01', visits: { freq: 'monthly' }, visitsThrough: '2026-06-01' });
      return { list: bare.checklist, issues: ctContractIssues(bare).join(' | ') };
    });
    expect(r.list).toEqual([]);
    expect(r.issues).toContain('No checklist');
  });

  // Billing-only contracts have no visits, so there is nothing to nag about.
  test('a retainer is not asked for a checklist', async ({ page }) => {
    await load(page);
    const issues = await page.evaluate(() => ctContractIssues({
      id: 'c1', name: 'Retainer', status: 'active', startDate: '2026-01-01', billing: { freq: 'monthly', amount: 500 },
    }).join(' | '));
    expect(issues).not.toContain('No checklist');
  });
});

test.describe('generated visits carry the work', () => {
  test('every visit arrives with the checklist as unticked tasks', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async (args) => {
      await ctSaveContract(args.c);
      await ctRunGeneration(ctPendingWork(args.now), { now: args.now });
      const jobs = ctContractJobs('ct_a');
      return {
        count: jobs.length,
        texts: jobs[0].tasks.map(t => t.text),
        allUnticked: jobs.every(j => j.tasks.every(t => t.done === false)),
        // Matches the shape the job detail's own task list creates.
        shape: Object.keys(jobs[0].tasks[0]).sort(),
      };
    }, { c: withList, now: MARCH });
    expect(r.count).toBe(3);
    expect(r.texts).toEqual(['Check anodes', 'Tighten hardware', 'Before and after photos']);
    expect(r.allUnticked).toBe(true);
    expect(r.shape).toEqual(['assigned', 'done', 'due', 'text', 'time', 'user']);
  });

  test('the crew can tick items off with the task UI that already exists', async ({ page }) => {
    await load(page);
    await page.evaluate(async (args) => {
      await ctSaveContract(args.c);
      await ctRunGeneration(ctPendingWork(args.now), { now: args.now });
    }, { c: withList, now: MARCH });
    const r = await page.evaluate(async () => {
      const j = ctContractJobs('ct_a')[0];
      j.tasks[0].done = true;
      j.tasks[0].doneBy = 'Dale';
      await writeJob(j);
      const open = (S.jobs[j.id].tasks || []).filter(t => !t.done).length;
      return { open, doneBy: S.jobs[j.id].tasks[0].doneBy };
    });
    expect(r.open).toBe(2);
    expect(r.doneBy).toBe('Dale');
  });

  // Editing the agreement must not rewrite what a crew already ticked off.
  test('changing the contract does not touch visits already created', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async (args) => {
      await ctSaveContract(args.c);
      await ctRunGeneration(ctPendingWork(args.now), { now: args.now });
      const first = ctContractJobs('ct_a')[0];
      first.tasks[0].done = true;
      await writeJob(first);

      // Rewrite the scope entirely and extend the paid-through date.
      await ctSaveContract(Object.assign({}, ctGetContract('ct_a'), {
        checklist: [{ id: 'ck9', text: 'Completely different work' }],
        visitsThrough: '2026-05-01',
      }));
      await ctRunGeneration(ctPendingWork(args.now), { now: args.now });

      const jobs = ctContractJobs('ct_a');
      return {
        oldTexts: jobs[0].tasks.map(t => t.text),
        oldStillDone: jobs[0].tasks[0].done,
        newTexts: jobs[jobs.length - 1].tasks.map(t => t.text),
        total: jobs.length,
      };
    }, { c: withList, now: MARCH });
    expect(r.oldTexts).toEqual(['Check anodes', 'Tighten hardware', 'Before and after photos']);
    expect(r.oldStillDone).toBe(true);
    expect(r.newTexts).toEqual(['Completely different work']);
    expect(r.total).toBe(5);
  });

  test('a contract with no checklist still generates a usable visit', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(async (args) => {
      await ctSaveContract(Object.assign({}, args.c, { checklist: [] }));
      await ctRunGeneration(ctPendingWork(args.now), { now: args.now });
      const j = ctContractJobs('ct_a')[0];
      return { tasks: j.tasks, isArray: Array.isArray(j.tasks), name: j.name };
    }, { c: withList, now: MARCH });
    expect(r.tasks).toEqual([]);
    expect(r.isArray).toBe(true);
    expect(r.name).toContain('Dock maintenance');
  });
});

test.describe('the editor', () => {
  test('items can be added, reordered by entry, and removed before saving', async ({ page }) => {
    await load(page);
    await page.evaluate(() => { S.view = 'contracts'; render(); });
    await page.click('#btn-ct-add');
    await page.fill('#ct-name', 'Dock care');
    for (const text of ['Check anodes', 'Tighten hardware', 'Photos']) {
      await page.fill('#ct-check-text', text);
      await page.click('#ct-check-add');
    }
    let texts = await page.evaluate(() =>
      [...document.querySelectorAll('#ct-check-rows [data-ct-check-rm]')].map(b => b.parentElement.children[1].textContent));
    expect(texts).toEqual(['Check anodes', 'Tighten hardware', 'Photos']);

    // Remove the middle item.
    await page.evaluate(() => document.querySelectorAll('#ct-check-rows [data-ct-check-rm]')[1].click());
    texts = await page.evaluate(() =>
      [...document.querySelectorAll('#ct-check-rows [data-ct-check-rm]')].map(b => b.parentElement.children[1].textContent));
    expect(texts).toEqual(['Check anodes', 'Photos']);
  });

  test('Enter adds an item so a whole scope can be typed without the mouse', async ({ page }) => {
    await load(page);
    await page.evaluate(() => { S.view = 'contracts'; render(); });
    await page.click('#btn-ct-add');
    await page.fill('#ct-check-text', 'Check anodes');
    await page.press('#ct-check-text', 'Enter');
    await page.fill('#ct-check-text', 'Tighten hardware');
    await page.press('#ct-check-text', 'Enter');
    const r = await page.evaluate(() => ({
      rows: document.querySelectorAll('#ct-check-rows [data-ct-check-rm]').length,
      cleared: document.getElementById('ct-check-text').value,
      stillOpen: !!document.getElementById('ct-bd'),
    }));
    expect(r.rows).toBe(2);
    expect(r.cleared).toBe('');
    // Enter must not submit the form out from under someone mid-scope.
    expect(r.stillOpen).toBe(true);
  });

  test('the checklist saves with the contract and reopens intact', async ({ page }) => {
    await load(page);
    await page.evaluate(() => { S.view = 'contracts'; render(); });
    await page.click('#btn-ct-add');
    await page.fill('#ct-name', 'Dock care');
    await page.fill('#ct-check-text', 'Check anodes');
    await page.click('#ct-check-add');
    await page.fill('#ct-check-text', 'Tighten hardware');
    await page.click('#ct-check-add');
    await page.click('#ct-save');

    const saved = await page.evaluate(() => ctContractList()[0].checklist.map(i => i.text));
    expect(saved).toEqual(['Check anodes', 'Tighten hardware']);

    await page.evaluate(() => openContractForm(ctContractList()[0]));
    const reopened = await page.evaluate(() =>
      [...document.querySelectorAll('#ct-check-rows [data-ct-check-rm]')].map(b => b.parentElement.children[1].textContent));
    expect(reopened).toEqual(['Check anodes', 'Tighten hardware']);
  });

  test('an empty item is ignored, and text is escaped', async ({ page }) => {
    await load(page);
    await page.evaluate(() => { S.view = 'contracts'; render(); });
    await page.click('#btn-ct-add');
    await page.fill('#ct-check-text', '   ');
    await page.click('#ct-check-add');
    let rows = await page.evaluate(() => document.querySelectorAll('#ct-check-rows [data-ct-check-rm]').length);
    expect(rows).toBe(0);

    await page.fill('#ct-check-text', '<img src=x onerror=alert(1)>');
    await page.click('#ct-check-add');
    const r = await page.evaluate(() => ({
      rows: document.querySelectorAll('#ct-check-rows [data-ct-check-rm]').length,
      imgs: document.querySelectorAll('#ct-check-rows img').length,
    }));
    expect(r.rows).toBe(1);
    expect(r.imgs).toBe(0);
  });
});

test.describe('the account page', () => {
  test('shows how much of each visit was actually done', async ({ page }) => {
    await load(page);
    const html = await page.evaluate(async (args) => {
      await ctSaveContract(args.c);
      await ctRunGeneration(ctPendingWork(args.now), { now: args.now });
      const jobs = ctContractJobs('ct_a');
      jobs[0].tasks[0].done = true;
      jobs[0].tasks[1].done = true;
      await writeJob(jobs[0]);
      return renderContractDetail('ct_a', args.now);
    }, { c: withList, now: MARCH });
    expect(html).toContain('2/3 done');
    expect(html).toContain('0/3 done');
  });
});
