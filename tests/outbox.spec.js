// Saving with no signal.
//
// Two measured failures drive every test here.
//
// Firebase's set() resolves only on server acknowledgement, so with no signal
// `await writeJob(j)` never returned — and every save handler is shaped
// `await write…; toast(); closeModal()`. The modal sat open with no message,
// so the person pressed Save again and got a second job.
//
// And the Firebase web SDK holds its pending writes in memory only. Closing
// the tab in a dead zone dropped the queued write while localStorage kept the
// edit with nothing marking it unsent — so the next sync replaced it with
// server truth and the work was gone for good.

const { expect, test } = require('@playwright/test');
const { stubExternals } = require('./_stubs');

// A Firebase stand-in whose write behaviour can be switched mid-test.
//   ok    — resolves, like a healthy connection
//   hang  — never settles, which is exactly what offline looks like
//   deny  — rejects with PERMISSION_DENIED, like undeployed rules
//   fail  — rejects with a network error
const controllableFirebase = `
  window.__fb = { mode: 'ok', sets: [], removes: [] };
  window.firebase = {
    apps: [],
    initializeApp(c) { this.apps.push({ c }); return this.apps[0]; },
    auth() { throw new Error('no auth'); },
    database() {
      const react = () => {
        if (window.__fb.mode === 'hang') return new Promise(() => {});
        if (window.__fb.mode === 'deny') {
          const e = new Error('PERMISSION_DENIED: Permission denied');
          e.code = 'PERMISSION_DENIED';
          return Promise.reject(e);
        }
        if (window.__fb.mode === 'fail') return Promise.reject(new Error('network unreachable'));
        return Promise.resolve();
      };
      return { ref(p) {
        const node = {
          _path: p || '',
          child(c) { return Object.assign(Object.create(node), { _path: (this._path ? this._path + '/' : '') + c }); },
          on() {},
          set(v) { window.__fb.sets.push({ path: this._path, value: v }); return react(); },
          remove() { window.__fb.removes.push({ path: this._path }); return react(); },
          push(v) { window.__fb.sets.push({ path: this._path, value: v, push: true }); return react(); },
          get() { return Promise.resolve({ exists: () => false, val: () => null }); },
        };
        return node;
      } };
    },
    storage() { return { ref() { return { put: () => Promise.reject(new Error('x')), delete: () => Promise.resolve(), getDownloadURL: () => Promise.resolve('') }; } }; },
  };
`;

async function boot(page, opts) {
  opts = opts || {};
  await stubExternals(page);
  await page.route('https://www.gstatic.com/firebasejs/**', route =>
    route.fulfill({ contentType: 'application/javascript', body: controllableFirebase }));
  await page.setViewportSize({ width: 430, height: 850 });
  await page.addInitScript(() => {
    localStorage.setItem('jt_company', 'co');
    localStorage.setItem('jt_companies', JSON.stringify({
      co: { id: 'co', ns: 'co', label: 'Test Co', active: true, type: 'project' },
    }));
  });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.render === 'function');
  // Put the app in "cloud sync is on" mode against the controllable stub.
  await page.evaluate(m => {
    DB = firebase.database().ref('co');
    window.__fb.mode = m;
    OUTBOX = {};
    SYNC.online = m !== 'hang';
  }, opts.mode || 'ok');
}

test.describe('a save no longer waits on the server', () => {
  test('writeJob resolves even when the cloud write never comes back', async ({ page }) => {
    await boot(page, { mode: 'hang' });
    const r = await page.evaluate(async () => {
      let settled = 'PENDING';
      writeJob({ id: 'j1', name: 'Dock repair', status: 'active' })
        .then(() => { settled = 'RESOLVED'; }, () => { settled = 'REJECTED'; });
      await new Promise(res => setTimeout(res, 300));
      return { settled, queued: Object.keys(OUTBOX), inMemory: !!S.jobs.j1 };
    });
    expect(r.settled).toBe('RESOLVED');
    expect(r.queued).toEqual(['jobs/j1']);
    expect(r.inMemory).toBe(true);
  });

  // The measured symptom: modal open, button live, no toast, forever.
  test('the job modal closes and confirms with no connectivity', async ({ page }) => {
    await boot(page, { mode: 'hang' });
    await page.evaluate(() => { S.view = 'jobs'; render(); });
    await page.evaluate(() => showJobModal('add'));
    await page.fill('#f-name', 'Dock repair');
    await page.click('#btn-sv');
    await expect(page.locator('#btn-sv')).toHaveCount(0);
    await expect(page.locator('.toast, #toast')).toContainText('Job added');
    expect(await page.evaluate(() => Object.keys(S.jobs).length)).toBe(1);
  });

  test('deleting a job does not hang either', async ({ page }) => {
    await boot(page, { mode: 'hang' });
    const r = await page.evaluate(async () => {
      S.jobs = { j1: { id: 'j1', name: 'Gone', status: 'active' } };
      let settled = false;
      deleteJobDB('j1').then(() => { settled = true; });
      await new Promise(res => setTimeout(res, 300));
      return { settled, queued: OUTBOX['jobs/j1'], stillInState: !!S.jobs.j1 };
    });
    expect(r.settled).toBe(true);
    expect(r.queued.op).toBe('remove');
    expect(r.stillInState).toBe(false);
  });

  // logAct sits directly behind writeJob in every save handler, so an awaited
  // push there would reintroduce the same hang one line later.
  test('the activity log does not hang the handler behind it', async ({ page }) => {
    await boot(page, { mode: 'hang' });
    const settled = await page.evaluate(async () => {
      let done = false;
      logAct('did a thing', 'Some job').then(() => { done = true; });
      await new Promise(res => setTimeout(res, 300));
      return done;
    });
    expect(settled).toBe(true);
  });
});

test.describe('unsent work survives a reload', () => {
  // The data-loss case. The edit is in localStorage but nothing marks it
  // unsent, so the first sync after reconnecting overwrites it.
  test('an edit made offline is not overwritten by server truth', async ({ page }) => {
    await boot(page, { mode: 'hang' });
    await page.evaluate(async () => {
      await writeJob({ id: 'j1', name: 'Dock repair', status: 'active', notes: [{ t: 'Ladder is rotten' }] });
    });

    // The tab is closed and reopened. Only what reached localStorage survives.
    await page.reload();
    await page.waitForFunction(() => typeof window.render === 'function');

    const r = await page.evaluate(() => {
      const queuedAfterBoot = Object.keys(OUTBOX);
      // …and the sync listener fires with the server's older copy.
      const merged = applyPendingJobs({ j1: { id: 'j1', name: 'Dock repair', status: 'active', notes: [] } });
      return { queuedAfterBoot, notes: (merged.j1.notes || []).length };
    });
    expect(r.queuedAfterBoot).toEqual(['jobs/j1']);
    expect(r.notes).toBe(1);
  });

  test('an offline delete is not undone by the next sync', async ({ page }) => {
    await boot(page, { mode: 'hang' });
    await page.evaluate(async () => {
      S.jobs = { j1: { id: 'j1', name: 'Gone' } };
      await deleteJobDB('j1');
    });
    await page.reload();
    await page.waitForFunction(() => typeof window.render === 'function');
    const back = await page.evaluate(() =>
      !!applyPendingJobs({ j1: { id: 'j1', name: 'Gone' } }).j1);
    expect(back).toBe(false);
  });

  test('reconnecting drains the queue and the job goes up', async ({ page }) => {
    await boot(page, { mode: 'hang' });
    await page.evaluate(async () => { await writeJob({ id: 'j1', name: 'Dock repair' }); });
    const r = await page.evaluate(async () => {
      window.__fb.mode = 'ok';
      SYNC.online = true;
      await outboxFlush(true);
      const forJob = window.__fb.sets.filter(s => /jobs\/j1$/.test(s.path));
      return {
        left: Object.keys(OUTBOX).length,
        attempts: forJob.length,
        lastValue: forJob[forJob.length - 1].value.name,
        persisted: localStorage.getItem('co_outbox'),
      };
    });
    expect(r.left).toBe(0);
    expect(r.lastValue).toBe('Dock repair');
    expect(r.persisted).toBe('{}');
    // Two attempts, not one: the stalled offline send is still sitting on a
    // promise that will never settle, so reconnecting retries it rather than
    // waiting on it. set() of the same value to the same path is idempotent,
    // which is what makes the retry safe.
    expect(r.attempts).toBe(2);
  });
});

test.describe('pressing save twice', () => {
  // Measured before the guard: two taps in a dead zone produced two jobs,
  // because the add path mints a fresh uid() per press.
  test('does not create a duplicate job', async ({ page }) => {
    await boot(page, { mode: 'hang' });
    await page.evaluate(() => { S.view = 'jobs'; render(); });
    await page.evaluate(() => showJobModal('add'));
    await page.fill('#f-name', 'Dock repair');
    await page.evaluate(() => {
      const b = document.getElementById('btn-sv');
      b.click(); b.click(); b.click();
    });
    await page.waitForTimeout(300);
    const names = await page.evaluate(() => Object.values(S.jobs).map(j => j.name));
    expect(names).toEqual(['Dock repair']);
  });

  test('guardBtn refuses a second call while the first is running', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(async () => {
      const b = document.createElement('button');
      b.id = 'probe-btn'; b.textContent = 'Save';
      document.body.appendChild(b);
      let runs = 0;
      const slow = () => { runs++; return new Promise(res => setTimeout(res, 150)); };
      const first = guardBtn('probe-btn', slow);
      const second = guardBtn('probe-btn', slow);
      const busyLabel = b.textContent;
      const busyDisabled = b.disabled;
      await new Promise(res => setTimeout(res, 300));
      return { first, second, runs, busyLabel, busyDisabled, label: b.textContent, disabled: b.disabled };
    });
    expect(r.first).toBe(true);
    expect(r.second).toBe(false);
    expect(r.runs).toBe(1);
    expect(r.busyDisabled).toBe(true);
    expect(r.busyLabel).toBe('Saving…');
    // Released afterwards, so a button still on screen works again.
    expect(r.disabled).toBe(false);
    expect(r.label).toBe('Save');
  });

  test('a throw inside a guarded save still releases the button', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(async () => {
      const b = document.createElement('button');
      b.id = 'probe-btn2'; b.textContent = 'Save';
      document.body.appendChild(b);
      guardBtn('probe-btn2', () => { throw new Error('save blew up'); });
      await new Promise(res => setTimeout(res, 50));
      return { disabled: b.disabled, label: b.textContent, reported: (JT_ERRORS.last || {}).where };
    });
    expect(r.disabled).toBe(false);
    expect(r.label).toBe('Save');
    expect(r.reported).toBe('save:probe-btn2');
  });
});

test.describe('the queue behaves', () => {
  test('repeat edits to one job collapse to a single pending write', async ({ page }) => {
    await boot(page, { mode: 'hang' });
    const r = await page.evaluate(async () => {
      for (let i = 0; i < 20; i++) await writeJob({ id: 'j1', name: 'Edit ' + i });
      return { entries: Object.keys(OUTBOX).length, value: OUTBOX['jobs/j1'].value.name };
    });
    expect(r.entries).toBe(1);
    expect(r.value).toBe('Edit 19');
  });

  // Rules rejection fails identically every time. Retrying is a loop that
  // never ends and never explains itself.
  test('a permission denial is reported once and dropped', async ({ page }) => {
    await boot(page, { mode: 'deny' });
    const r = await page.evaluate(async () => {
      await writeJob({ id: 'j1', name: 'Rejected' });
      await new Promise(res => setTimeout(res, 100));
      return {
        left: Object.keys(OUTBOX).length,
        attempts: window.__fb.sets.filter(s => /jobs\/j1$/.test(s.path)).length,
        sync: (document.getElementById('sync-text') || {}).textContent || '',
      };
    });
    expect(r.left).toBe(0);
    expect(r.attempts).toBe(1);
    expect(r.sync).toContain('Team sync save failed');
  });

  // A delivery failure is the opposite: keep it, try again later.
  test('a network failure keeps its place and retries on reconnect', async ({ page }) => {
    await boot(page, { mode: 'fail' });
    const r = await page.evaluate(async () => {
      await writeJob({ id: 'j1', name: 'Held' });
      await new Promise(res => setTimeout(res, 50));
      const heldAfterFailure = Object.keys(OUTBOX).length;
      window.__fb.mode = 'ok';
      await outboxFlush();
      return { heldAfterFailure, left: Object.keys(OUTBOX).length };
    });
    expect(r.heldAfterFailure).toBe(1);
    expect(r.left).toBe(0);
  });

  // Found while writing these: the first offline send sat on a promise that
  // never settled, so the in-flight flag stayed set for the life of the page
  // and reconnecting drained nothing. A stall that permanently disables the
  // queue is worse than the hang this file exists to fix.
  test('a stalled send does not disable the queue for good', async ({ page }) => {
    await boot(page, { mode: 'hang' });
    const r = await page.evaluate(async () => {
      await writeJob({ id: 'j1', name: 'Stuck' });
      await new Promise(res => setTimeout(res, 50));
      const stuckMidSend = OUTBOX_SENDING;
      window.__fb.mode = 'ok';
      const sent = await outboxFlush(true);
      return { stuckMidSend, sent, left: Object.keys(OUTBOX).length, sending: OUTBOX_SENDING };
    });
    expect(r.stuckMidSend).toBe(true);
    expect(r.sent).toBe(1);
    expect(r.left).toBe(0);
    expect(r.sending).toBe(false);
  });

  test('a send that never comes back times out and keeps its place', async ({ page }) => {
    await boot(page, { mode: 'hang' });
    const r = await page.evaluate(async () => {
      OUTBOX_SEND_TIMEOUT = 120;
      await writeJob({ id: 'j1', name: 'Slow' });
      await new Promise(res => setTimeout(res, 400));
      const out = { left: Object.keys(OUTBOX).length, sending: OUTBOX_SENDING };
      OUTBOX_SEND_TIMEOUT = 15000;
      return out;
    });
    expect(r.left).toBe(1);
    expect(r.sending).toBe(false);
  });

  test('a healthy save leaves nothing queued', async ({ page }) => {
    await boot(page, { mode: 'ok' });
    const r = await page.evaluate(async () => {
      await writeJob({ id: 'j1', name: 'Fine' });
      await new Promise(res => setTimeout(res, 50));
      return { left: Object.keys(OUTBOX).length, sync: (document.getElementById('sync-text') || {}).textContent };
    });
    expect(r.left).toBe(0);
    expect(r.sync).toBe('Team sync live');
  });

  test('the queue is capped, and says so rather than dropping work quietly', async ({ page }) => {
    await boot(page, { mode: 'hang' });
    const r = await page.evaluate(async () => {
      for (let i = 0; i < 205; i++) outboxPut('jobs/j' + i, { id: 'j' + i }, 'job', 'set');
      return {
        entries: Object.keys(OUTBOX).length,
        oldestGone: !OUTBOX['jobs/j0'],
        newestKept: !!OUTBOX['jobs/j204'],
        toast: (document.querySelector('.toast, #toast') || {}).textContent || '',
      };
    });
    expect(r.entries).toBe(200);
    expect(r.oldestGone).toBe(true);
    expect(r.newestKept).toBe(true);
    expect(r.toast).toContain('unsent changes');
  });

  // A job carrying an inline base64 photo can be megabytes. Skipping rather
  // than trimming is deliberate: a trimmed copy sent after a reload would
  // overwrite the cloud's good record with a photo-less one.
  test('an oversized entry is held in memory but never persisted', async ({ page }) => {
    await boot(page, { mode: 'hang' });
    const r = await page.evaluate(async () => {
      await writeJob({ id: 'big', name: 'Photo job', photos: [{ url: 'data:image/jpeg;base64,' + 'A'.repeat(400000) }] });
      const stored = JSON.parse(localStorage.getItem('co_outbox') || '{}');
      return { inMemory: !!OUTBOX['jobs/big'], persisted: !!stored['jobs/big'] };
    });
    expect(r.inMemory).toBe(true);
    expect(r.persisted).toBe(false);
  });
});

test.describe('the sync bar tells the truth', () => {
  test('offline with work waiting says how much', async ({ page }) => {
    await boot(page, { mode: 'hang' });
    await page.evaluate(async () => {
      SYNC.online = false;
      await writeJob({ id: 'j1', name: 'One' });
      await writeJob({ id: 'j2', name: 'Two' });
    });
    await expect(page.locator('#sync-text')).toHaveText('Offline · 2 waiting to sync');
  });

  test('offline with nothing waiting does not imply a problem', async ({ page }) => {
    await boot(page, { mode: 'hang' });
    await page.evaluate(() => { SYNC.online = false; syncPendingUI(); });
    await expect(page.locator('#sync-text')).toHaveText('Offline · working locally');
  });

  test('it goes green again once the queue drains', async ({ page }) => {
    await boot(page, { mode: 'hang' });
    await page.evaluate(async () => { SYNC.online = false; await writeJob({ id: 'j1', name: 'One' }); });
    await expect(page.locator('#sync-text')).toContainText('waiting to sync');
    await page.evaluate(async () => { window.__fb.mode = 'ok'; SYNC.online = true; await outboxFlush(true); });
    await expect(page.locator('#sync-text')).toHaveText('Team sync live');
  });
});

test.describe('the escape hatch', () => {
  // This change touches every save in the app, including the project company
  // that cannot afford downtime. Turning it off must restore the old path
  // exactly, not approximately.
  test('with the outbox off, writes go straight out and nothing is queued', async ({ page }) => {
    await boot(page, { mode: 'ok' });
    const r = await page.evaluate(async () => {
      OUTBOX_ON = false;
      await writeJob({ id: 'j1', name: 'Direct' });
      const out = { queued: Object.keys(OUTBOX).length, sent: window.__fb.sets.filter(s => /jobs\/j1$/.test(s.path)).length };
      OUTBOX_ON = true;
      return out;
    });
    expect(r.queued).toBe(0);
    expect(r.sent).toBe(1);
  });

  test('with the outbox off, a failing write still rejects the caller', async ({ page }) => {
    await boot(page, { mode: 'fail' });
    const threw = await page.evaluate(async () => {
      OUTBOX_ON = false;
      let t = false;
      try { await writeJob({ id: 'j1', name: 'Direct' }); } catch (e) { t = true; }
      OUTBOX_ON = true;
      return t;
    });
    expect(threw).toBe(true);
  });

  test('with the outbox off, the sync overlay ignores it', async ({ page }) => {
    await boot(page, { mode: 'hang' });
    const notes = await page.evaluate(() => {
      OUTBOX = { 'jobs/j1': { value: { id: 'j1', notes: [{ t: 'x' }] }, op: 'set', at: 1 } };
      OUTBOX_ON = false;
      const merged = applyPendingJobs({ j1: { id: 'j1', notes: [] } });
      OUTBOX_ON = true;
      return (merged.j1.notes || []).length;
    });
    expect(notes).toBe(0);
  });
});

test.describe('contracts and entities are deliberately left alone', () => {
  // They are office actions with a newly built loud-failure path. Routing them
  // through the outbox would trade a working behaviour for an untested one.
  test('a contract write still awaits and still throws', async ({ page }) => {
    await boot(page, { mode: 'fail' });
    const r = await page.evaluate(async () => {
      let threw = false;
      try { await ctWriteContract('contracts/c1', { id: 'c1' }, 'set'); } catch (e) { threw = true; }
      return { threw, queued: Object.keys(OUTBOX).length };
    });
    expect(r.threw).toBe(true);
    expect(r.queued).toBe(0);
  });
});
