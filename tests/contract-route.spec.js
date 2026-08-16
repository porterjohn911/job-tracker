// The day route.
//
// A maintenance crew does six to ten stops a day. The Schedule is a month
// calendar and the Map plots pins; neither answers the 7am question, which is
// "where am I going, in what order, and what am I doing there".
//
// The cases below are about the ways a route misleads a crew: leaving a stop
// off, including one that is not real work, or claiming a visit is finished
// when nothing was ticked.

const { expect, test } = require('@playwright/test');
const { stubExternals } = require('./_stubs');

const DAY = '2026-03-16';
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
  await page.waitForFunction(() => typeof window.renderDayRoute === 'function');
  await page.evaluate(() => {
    S.contracts = {}; S.jobs = {}; S.ctDetail = null; S.ctRoute = null; S.ctSearch = '';
    S._ctWired = false; ctSaveContractsLocal();
  });
}

async function job(page, over) {
  await page.evaluate(async (o) => {
    await writeJob(Object.assign({
      id: 'j_' + Math.random().toString(36).slice(2, 8), name: 'Job', status: 'active',
      startDate: '2026-03-16', dueDate: '2026-03-16', address: '', assigned: '',
      tasks: [], photos: [], notes: [], comms: [], documents: [], dailyLogs: [],
    }, o));
  }, over);
}

test.describe('what is on the route', () => {
  test('every job booked that day, contract visit or not', async ({ page }) => {
    await load(page);
    await job(page, { id: 'j_visit', name: 'Dock maintenance — Mar 2026', contractId: 'ct_a' });
    await job(page, { id: 'j_oneoff', name: 'One-off seawall repair' });
    await job(page, { id: 'j_other', name: 'Different day', startDate: '2026-03-20', dueDate: '2026-03-20' });
    const names = await page.evaluate((d) => ctRouteJobs(d).map(j => j.name), DAY);
    // A crew's day includes the one-off booked between two dock visits, so
    // filtering to contract work would send them to a partial route.
    expect(names).toContain('Dock maintenance — Mar 2026');
    expect(names).toContain('One-off seawall repair');
    expect(names).not.toContain('Different day');
  });

  test('the standing Agreement job is never a stop', async ({ page }) => {
    await load(page);
    await page.evaluate(async (d) => {
      await ctSaveContract({ id: 'ct_a', name: 'Marina retainer', status: 'active', startDate: '2026-01-01', billing: { freq: 'monthly', amount: 500 } });
      const agr = ctBuildBillingJob(ctGetContract('ct_a'));
      agr.startDate = d; agr.dueDate = d;
      await writeJob(agr);
    }, DAY);
    const names = await page.evaluate((d) => ctRouteJobs(d).map(j => j.name), DAY);
    // It exists to hold invoices. Nobody drives to it.
    expect(names).toEqual([]);
  });

  test('finished and lost jobs drop off', async ({ page }) => {
    await load(page);
    await job(page, { id: 'j_open', name: 'Still to do' });
    await job(page, { id: 'j_done', name: 'Already complete', status: 'complete' });
    await job(page, { id: 'j_lost', name: 'Lost', status: 'lost' });
    const names = await page.evaluate((d) => ctRouteJobs(d).map(j => j.name), DAY);
    expect(names).toEqual(['Still to do']);
  });

  test('a multi-day job appears on every day it spans', async ({ page }) => {
    await load(page);
    await job(page, { id: 'j_long', name: 'Three day haul out', startDate: '2026-03-15', dueDate: '2026-03-17' });
    const r = await page.evaluate(() => ['2026-03-14', '2026-03-15', '2026-03-16', '2026-03-17', '2026-03-18']
      .map(d => ctRouteJobs(d).length));
    expect(r).toEqual([0, 1, 1, 1, 0]);
  });

  test('stops group by who is assigned', async ({ page }) => {
    await load(page);
    await job(page, { id: 'j1', name: 'Zeta', assigned: 'Rick' });
    await job(page, { id: 'j2', name: 'Alpha', assigned: 'Dale' });
    await job(page, { id: 'j3', name: 'Beta', assigned: 'Rick' });
    await job(page, { id: 'j4', name: 'Unassigned work' });
    const names = await page.evaluate((d) => ctRouteJobs(d).map(j => j.name), DAY);
    // Dale's stops, then Rick's, then whatever nobody has picked up.
    expect(names).toEqual(['Alpha', 'Beta', 'Zeta', 'Unassigned work']);
  });
});

test.describe('what a stop says', () => {
  test('checklist progress, and whether it has been started at all', async ({ page }) => {
    await load(page);
    await job(page, {
      id: 'j_part', name: 'Partly done',
      tasks: [{ text: 'A', done: true }, { text: 'B', done: false }, { text: 'C', done: false }],
    });
    await job(page, { id: 'j_none', name: 'Not started', tasks: [{ text: 'A', done: false }] });
    await job(page, { id: 'j_bare', name: 'No checklist' });
    const r = await page.evaluate((d) => ctRouteJobs(d).map(j => {
      const s = ctRouteStop(j);
      return { name: j.name, done: s.tasksDone, total: s.tasksTotal, started: s.started };
    }), DAY);
    const by = n => r.find(x => x.name === n);
    expect(by('Partly done')).toMatchObject({ done: 1, total: 3, started: true });
    expect(by('Not started')).toMatchObject({ done: 0, total: 1, started: false });
    expect(by('No checklist')).toMatchObject({ done: 0, total: 0, started: false });
  });

  test('a photo counts as started even with no checklist', async ({ page }) => {
    await load(page);
    await job(page, { id: 'j_p', name: 'Photographed', photos: [{ id: 'p1', url: 'x' }] });
    const started = await page.evaluate((d) => ctRouteStop(ctRouteJobs(d)[0]).started, DAY);
    expect(started).toBe(true);
  });

  test('the summary counts only fully finished stops', async ({ page }) => {
    await load(page);
    await job(page, { id: 'j1', name: 'Done', tasks: [{ text: 'A', done: true }, { text: 'B', done: true }] });
    await job(page, { id: 'j2', name: 'Half', tasks: [{ text: 'A', done: true }, { text: 'B', done: false }] });
    await job(page, { id: 'j3', name: 'Bare' });
    const sum = await page.evaluate((d) => ctRouteSummary(ctRouteJobs(d).map(ctRouteStop)), DAY);
    expect(sum).toEqual({ stops: 3, done: 1, tasks: 4, tasksDone: 3 });
  });

  test('the address links out to maps, escaped', async ({ page }) => {
    await load(page);
    await job(page, { id: 'j1', name: 'Dock', address: '1120 Lakeshore Dr, Kingston TN' });
    const r = await page.evaluate((d) => {
      document.getElementById('content').innerHTML = renderDayRoute(d);
      const a = document.querySelector('#content a[href*="maps"]');
      return { href: a && a.getAttribute('href'), text: a && a.textContent.trim() };
    }, DAY);
    expect(r.href).toContain('1120%20Lakeshore%20Dr');
    expect(r.text).toContain('1120 Lakeshore Dr');
  });

  test('a job with no address says so rather than linking nowhere', async ({ page }) => {
    await load(page);
    await job(page, { id: 'j1', name: 'Dock' });
    const html = await page.evaluate((d) => renderDayRoute(d), DAY);
    expect(html).toContain('No address on this job');
    expect(html).not.toContain('maps/search');
  });
});

test.describe('the view', () => {
  test('names the day and counts the stops', async ({ page }) => {
    await load(page);
    await job(page, { id: 'j1', name: 'Dock A', tasks: [{ text: 'A', done: true }] });
    await job(page, { id: 'j2', name: 'Dock B' });
    const r = await page.evaluate((args) => {
      document.getElementById('content').innerHTML = renderDayRoute(args.d, args.now);
      return {
        html: document.getElementById('content').innerHTML,
        kpis: [...document.querySelectorAll('#content .kpi-value')].map(e => e.textContent.trim()),
      };
    }, { d: DAY, now: MARCH });
    expect(r.html).toContain('Mar 16');
    expect(r.html).toContain('Dock A');
    expect(r.kpis).toEqual(['2', '1/1']);
  });

  test('today and tomorrow are named, other days are not', async ({ page }) => {
    await load(page);
    const r = await page.evaluate((now) => ({
      today: renderDayRoute(ctDateKey(new Date(now)), now),
      tomorrow: renderDayRoute(ctDateKey(ctAddDays(new Date(now), 1)), now),
      later: renderDayRoute(ctDateKey(ctAddDays(new Date(now), 5)), now),
    }), MARCH);
    expect(r.today).toContain('Today');
    expect(r.tomorrow).toContain('Tomorrow');
    expect(r.later).toContain('Route');
    // A "Today" shortcut only helps when you are not already on today.
    expect(r.today).not.toContain('data-ct-route-day="2026-03-15">Today');
  });

  test('an empty day explains itself', async ({ page }) => {
    await load(page);
    const html = await page.evaluate((d) => renderDayRoute(d), DAY);
    expect(html).toContain('Nothing scheduled');
    expect(html).toContain('once they are generated');
  });
});

test.describe('navigation', () => {
  test('opens from the Contracts tab and comes back', async ({ page }) => {
    await load(page);
    await job(page, { id: 'j1', name: 'Dock A' });
    await page.evaluate(() => { S.view = 'contracts'; render(); });
    await page.click('#btn-ct-route');
    let r = await page.evaluate(() => ({ route: S.ctRoute, html: document.getElementById('content').innerHTML }));
    expect(r.route).toBeTruthy();
    expect(r.html).toContain('All contracts');

    await page.click('[data-ct-route-back]');
    r = await page.evaluate(() => ({ route: S.ctRoute, html: document.getElementById('content').innerHTML }));
    expect(r.route).toBeNull();
    expect(r.html).toContain('Add Contract');
  });

  test('the arrows step a day at a time', async ({ page }) => {
    await load(page);
    await page.evaluate((d) => { S.view = 'contracts'; S.ctRoute = d; render(); }, DAY);
    await page.evaluate(() => document.querySelector('[data-ct-route-day="2026-03-17"]').click());
    expect(await page.evaluate(() => S.ctRoute)).toBe('2026-03-17');
    await page.evaluate(() => document.querySelector('[data-ct-route-day="2026-03-16"]').click());
    expect(await page.evaluate(() => S.ctRoute)).toBe('2026-03-16');
  });

  test('tapping a stop opens that job', async ({ page }) => {
    await load(page);
    await job(page, { id: 'j1', name: 'Dock A' });
    await page.evaluate((d) => { S.view = 'contracts'; S.ctRoute = d; render(); }, DAY);
    await page.click('[data-open="j1"]');
    const r = await page.evaluate(() => ({ view: S.view, detail: S.detail }));
    expect(r.view).toBe('jobs');
    expect(r.detail).toBe('j1');
  });

  test('opening a contract leaves the route view', async ({ page }) => {
    await load(page);
    await page.evaluate(async (d) => {
      await ctSaveContract({ id: 'ct_a', name: 'Dock care', status: 'active', startDate: '2026-01-01', visits: { freq: 'monthly' }, visitsThrough: '2026-06-01' });
      S.view = 'contracts'; S.ctRoute = d; render();
    }, DAY);
    await page.click('[data-ct-route-back]');
    await page.click('[data-ct="ct_a"]');
    const r = await page.evaluate(() => ({ route: S.ctRoute, detail: S.ctDetail }));
    expect(r.route).toBeNull();
    expect(r.detail).toBe('ct_a');
  });
});

test.describe('project work is untouched', () => {
  test('a project company has no route and its views still render', async ({ page }) => {
    await stubExternals(page);
    await page.addInitScript(() => localStorage.setItem('jt_company', 'wfs'));
    await page.goto('/');
    await page.waitForFunction(() => typeof window.renderJobs === 'function');
    const r = await page.evaluate(() => {
      S.view = 'schedule'; render();
      const schedule = document.getElementById('content').innerHTML.length > 0;
      S.view = 'jobs'; render();
      return { schedule, jobs: document.getElementById('content').innerHTML.length > 0, enabled: ctEnabled() };
    });
    expect(r.schedule).toBe(true);
    expect(r.jobs).toBe(true);
    expect(r.enabled).toBe(false);
  });
});
