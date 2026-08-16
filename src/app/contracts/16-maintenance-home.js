// Recurring contracts — Home, for a company that does maintenance.
//
// Home is the screen that opens by default, and for a maintenance company it
// was answering project-work questions: active job count, pipeline value, job
// value. On a book of recurring contracts those numbers mean nothing — "27
// active jobs" is twenty-seven generated visits, and "$0 in pipeline" is a
// field nobody fills in. Meanwhile the three questions actually asked every
// morning were all one or two taps down inside the Contracts tab:
//
//   Where is the crew going today?
//   What is about to lapse?
//   What is waiting to be invoiced?
//
// So this is Home for those companies: those three answered above the fold,
// each one tapping straight through to the screen that acts on it.
//
// ── How it is gated ─────────────────────────────────────────────────────────
//
// renderDashboard() gains ONE early return, taken only when ctEnabled() is
// true. A project company never enters the branch, so its dashboard runs the
// same code it always did — this file is not even loaded into the decision.
// That is the only line of shared render code this touches.
//
// Requires 01-contract-periods.js through 15-proposal-ui.js.

// ── Gathering ───────────────────────────────────────────────────────────────

// Money, computed cheaply. Deliberately does NOT call ctRevenueBook(), which
// builds a labour index and costs every contract — that is right for the
// revenue page and far too much work for a screen that redraws on every render.
function ctHomeMoney() {
  let mrr = 0;
  ctContractList().forEach(c => { if (c.status === 'active') mrr += ctMonthlyValue(c); });

  let invoiced = 0, paid = 0;
  Object.values((typeof S !== 'undefined' && S.jobs) || {}).forEach(j => {
    const t = typeof invoiceTotals === 'function' ? invoiceTotals(j) : null;
    if (t) { invoiced += t.total; paid += t.paid; }
  });
  return { mrr: mrr, outstanding: invoiced - paid };
}

// The next day inside `days` that has anything booked, so an empty today says
// "nothing until Tuesday" rather than just "nothing".
function ctHomeNextDay(nowTs, days) {
  const start = ctStartOfDay(nowTs == null ? Date.now() : nowTs);
  for (let i = 1; i <= (days || 14); i++) {
    const d = ctAddDays(start, i);
    if (ctRouteJobs(ctDateKey(d)).length) return d;
  }
  return null;
}

// Everything Home needs, gathered once so the view is pure formatting.
function ctHomeState(nowTs) {
  const now = nowTs == null ? Date.now() : nowTs;
  const today = ctDateKey(ctStartOfDay(now));
  const stops = ctRouteJobs(today).map(ctRouteStop);

  let bills = { count: 0, total: 0 };
  try {
    const rows = ctBillRunRows(now);
    const t = ctBillRunTotals(rows);
    bills = { count: t.sendable, total: t.total, blocked: t.blocked };
  } catch (e) { /* leave at zero */ }

  let pending = 0;
  try {
    const totals = ctPendingTotals(ctPendingWork(now));
    pending = totals.visits + totals.invoices;
  } catch (e) { /* leave at zero */ }

  const renewals = ctNeedsRenewal(now);
  const renewMrr = renewals.reduce((s, r) => s + ctMonthlyValue(r.contract), 0);

  return {
    today: today,
    stops: stops,
    summary: ctRouteSummary(stops),
    nextDay: stops.length ? null : ctHomeNextDay(now, 14),
    renewals: renewals,
    renewUrgent: renewals.filter(r => r.state.level === 'urgent').length,
    renewMrr: renewMrr,
    bills: bills,
    pending: pending,
    money: ctHomeMoney(),
    contractCount: ctContractList().length,
  };
}

// ── Rendering ───────────────────────────────────────────────────────────────

// A tile only exists when it has something to say. A row of zeroes is a row of
// things not to do, and it pushes the one thing that does matter off the fold.
function ctHomeTile(go, label, value, sub, urgent) {
  return `<button class="ct-home-tile${urgent ? ' urgent' : ''}" data-home-go="${esc(go)}">
    <div class="ct-home-tile-label">${esc(label)}</div>
    <div class="ct-home-tile-value">${esc(value)}</div>
    <div class="ct-home-tile-sub">${esc(sub)}</div>
  </button>`;
}

function ctHomeStopRow(stop) {
  const j = stop.job;
  const done = stop.tasksTotal > 0 && stop.tasksDone === stop.tasksTotal;
  const bits = [
    j.assigned || 'Unassigned',
    stop.tasksTotal ? stop.tasksDone + '/' + stop.tasksTotal : (stop.started ? 'in progress' : 'not started'),
  ].join(' · ');
  return `<div class="ct-home-stop" data-open="${esc(j.id)}">
    <div class="ct-home-dot${done ? ' done' : ''}">${done ? '✓' : ''}</div>
    <div style="flex:1;min-width:0">
      <div class="ct-home-stop-name">${esc(j.name || 'Job')}</div>
      <div class="ct-home-stop-sub">${esc(bits)}</div>
    </div>
    ${stop.address ? `<a class="ct-home-map" href="${esc(ctMapsHref(stop.address))}" target="_blank" rel="noopener" aria-label="Directions">↗</a>` : ''}
  </div>`;
}

function ctHomeRouteCard(st) {
  if (!st.stops.length) {
    const next = st.nextDay;
    return `<div class="section ct-home-route">
      <div class="ct-home-route-hd">
        <div><div class="ct-home-eyebrow">Today</div><div class="ct-home-h">Nothing booked</div></div>
      </div>
      <div class="ct-home-empty">${next
        ? 'Next work is ' + esc(next.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })) + '.'
        : 'Nothing scheduled in the next two weeks.'}</div>
      <button class="ct-home-more" data-home-go="route">Open the day route →</button>
    </div>`;
  }

  const shown = st.stops.slice(0, 4);
  const rest = st.stops.length - shown.length;
  return `<div class="section ct-home-route">
    <div class="ct-home-route-hd">
      <div>
        <div class="ct-home-eyebrow">Today</div>
        <div class="ct-home-h">${st.summary.stops} stop${st.summary.stops === 1 ? '' : 's'}</div>
      </div>
      <div class="ct-home-progress">${st.summary.done}/${st.summary.stops}<span>done</span></div>
    </div>
    ${shown.map(ctHomeStopRow).join('')}
    <button class="ct-home-more" data-home-go="route">${rest > 0 ? rest + ' more · open the day route →' : 'Open the day route →'}</button>
  </div>`;
}

function ctHome(nowTs) {
  const now = nowTs == null ? Date.now() : nowTs;
  const st = ctHomeState(now);
  const d = new Date(now);

  if (!st.contractCount) {
    return `<div class="ct-home-date">${esc(d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}</div>
      <div class="section" style="text-align:center;padding:34px 20px">
        <p style="font-size:14px;color:var(--text-2);margin-bottom:4px">No contracts yet.</p>
        <p style="font-size:12.5px;color:var(--text-3);margin-bottom:14px">This is a maintenance company, so Home shows the day's route, what needs renewing and what is waiting to be billed — all of which come from contracts.</p>
        <button class="btn-add" data-home-go="contracts" style="margin:0 auto">Go to Contracts</button>
      </div>`;
  }

  const tiles = [
    st.renewals.length ? ctHomeTile('renew', 'Needs renewing', String(st.renewals.length),
      st.renewMrr > 0 ? money2(st.renewMrr) + ' a month' : (st.renewUrgent ? st.renewUrgent + ' stopped' : 'coming up'),
      st.renewUrgent > 0) : '',
    st.bills.count ? ctHomeTile('bills', 'To bill', money2(st.bills.total),
      st.bills.count + ' invoice' + (st.bills.count === 1 ? '' : 's') + (st.bills.blocked ? ' · ' + st.bills.blocked + ' held' : ''), false) : '',
    st.pending ? ctHomeTile('generate', 'To generate', String(st.pending), 'visits and invoices due', false) : '',
  ].filter(Boolean).join('');

  return `
    <div class="ct-home-date">${esc(d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}</div>
    ${ctHomeRouteCard(st)}
    ${tiles ? `<div class="ct-home-tiles">${tiles}</div>` : ''}
    <button class="ct-home-money" data-home-go="revenue">
      <div>
        <div class="ct-home-tile-label">Monthly recurring</div>
        <div class="ct-home-money-value">${money2(st.money.mrr)}</div>
      </div>
      <div style="text-align:right">
        <div class="ct-home-tile-label">Outstanding</div>
        <div class="ct-home-money-value${st.money.outstanding > 0.005 ? ' owed' : ''}">${money2(st.money.outstanding)}</div>
      </div>
    </button>
  `;
}

// ── Handlers ────────────────────────────────────────────────────────────────

// Wired from attachContractHandlers(), which already runs on every render for
// companies that use contracts — so Home's buttons work without touching the
// shared handler orchestrator.
function ctAttachHomeHandlers() {
  document.querySelectorAll('[data-home-go]').forEach(el => {
    el.onclick = e => {
      e.stopPropagation();
      const go = el.dataset.homeGo;
      S.view = 'contracts';
      S.detail = null;
      S.ctDetail = null; S.ctRoute = null; S.ctRevenue = false; S.ctBills = false;
      if (go === 'route') S.ctRoute = ctDateKey(new Date());
      else if (go === 'revenue') S.ctRevenue = true;
      else if (go === 'bills') S.ctBills = true;
      if (typeof render === 'function') render();
      // Generation writes records, so it opens its own preview rather than
      // running from a tap on Home.
      if (go === 'generate' && typeof openGeneratePreview === 'function') openGeneratePreview();
    };
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ctHomeMoney, ctHomeNextDay, ctHomeState, ctHomeTile, ctHomeStopRow,
    ctHomeRouteCard, ctHome, ctAttachHomeHandlers,
  };
}
