// The day route — what the crew is doing today, in order.
//
// A maintenance crew does six to ten stops a day. The Schedule is a month
// calendar and the Map plots pins; neither answers the question asked at 7am,
// which is "where am I going, in what order, and what am I doing there".
//
// It lives inside the Contracts tab rather than as its own nav item, routed on
// S.ctRoute the same way the account page routes on S.ctDetail. That keeps the
// whole feature inside src/app/contracts/ and leaves project-work companies
// untouched — they get no Contracts tab, so they get none of this.
//
// It reads jobs, not contracts. A crew's day includes the one-off repair booked
// between two dock visits, so filtering to contract work only would produce a
// route that sends someone to five of their six stops.
//
// Requires 01-contract-periods.js through 06-contract-detail.js.

// Jobs scheduled on a given day, in the order a crew would work them.
//
// jobDateRange() is the same function the Schedule uses to place a job on the
// calendar, so a job appears here exactly when it appears there — including
// multi-day jobs, which show on every day they span.
function ctRouteJobs(dateKey) {
  const key = String(dateKey || '');
  if (!key) return [];
  const billingIds = new Set(ctContractList().map(c => ctBillingJobId({ id: c.id })));
  return Object.values((typeof S !== 'undefined' && S.jobs) || {})
    .filter(j => j && !billingIds.has(j.id) && !isClosedJob(j))
    .filter(j => (typeof jobDateRange === 'function' ? jobDateRange(j) : []).indexOf(key) >= 0)
    // Grouped by whoever is assigned, with unclaimed work last — it is the
    // leftover pile, not the start of the day. Sorted on an explicit flag
    // rather than a sort-last sentinel character, because localeCompare is
    // locale-aware and will not reliably order punctuation after letters.
    .sort((a, b) =>
      (a.assigned ? 0 : 1) - (b.assigned ? 0 : 1) ||
      String(a.assigned || '').localeCompare(String(b.assigned || '')) ||
      String(a.name || '').localeCompare(String(b.name || '')));
}

// Everything the route needs about one stop, gathered once.
function ctRouteStop(job) {
  const tasks = job.tasks || [];
  const contract = job.contractId ? ctGetContract(job.contractId) : null;
  return {
    job: job,
    contract: contract,
    address: ctStr(job.address),
    tasksTotal: tasks.length,
    tasksDone: tasks.filter(t => t && t.done).length,
    photos: (job.photos || []).length,
    // A stop with nothing ticked and nothing photographed has not been started,
    // which is what the crew and the office both want to see at a glance.
    started: tasks.some(t => t && t.done) || (job.photos || []).length > 0,
  };
}

function ctRouteSummary(stops) {
  return stops.reduce((acc, s) => ({
    stops: acc.stops + 1,
    done: acc.done + (s.tasksTotal > 0 && s.tasksDone === s.tasksTotal ? 1 : 0),
    tasks: acc.tasks + s.tasksTotal,
    tasksDone: acc.tasksDone + s.tasksDone,
  }), { stops: 0, done: 0, tasks: 0, tasksDone: 0 });
}

// A maps link, so a phone can hand the address straight to navigation. Built
// from the address rather than coordinates because a job may not be geocoded
// yet, and every maps app accepts a query string.
function ctMapsHref(address) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address);
}

function ctRouteRow(stop, index) {
  const j = stop.job;
  const progress = stop.tasksTotal
    ? `${stop.tasksDone}/${stop.tasksTotal} done`
    : (stop.started ? 'in progress' : 'no checklist');
  const complete = stop.tasksTotal > 0 && stop.tasksDone === stop.tasksTotal;

  return `<div class="section" style="margin-bottom:0;padding:11px 13px">
    <div style="display:flex;align-items:flex-start;gap:11px">
      <div style="flex-shrink:0;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;background:${complete ? 'var(--green-700)' : 'var(--surface-2, #e8e8e8)'};color:${complete ? '#fff' : 'var(--text-2)'}">${complete ? '✓' : index + 1}</div>
      <div style="flex:1;min-width:0">
        <div data-open="${esc(j.id)}" style="font-size:13.5px;font-weight:700;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(j.name || 'Job')}</div>
        <div style="font-size:11.5px;color:var(--text-3);margin-top:2px">
          ${j.assigned ? esc(j.assigned) + ' · ' : ''}${esc(progress)}${stop.photos ? ' · ' + stop.photos + ' photo' + (stop.photos === 1 ? '' : 's') : ''}
        </div>
        ${stop.address
          ? `<a href="${esc(ctMapsHref(stop.address))}" target="_blank" rel="noopener" style="font-size:11.5px;color:var(--green-700);text-decoration:none;display:inline-block;margin-top:3px">${esc(stop.address)} ↗</a>`
          : `<div style="font-size:11.5px;color:var(--text-3);margin-top:3px">No address on this job</div>`}
      </div>
    </div>
  </div>`;
}

function renderDayRoute(dateKey, nowTs) {
  const today = ctDateKey(ctStartOfDay(nowTs == null ? Date.now() : nowTs));
  const key = String(dateKey || today);
  const d = ctParseDate(key) || ctParseDate(today);
  const stops = ctRouteJobs(key).map(ctRouteStop);
  const sum = ctRouteSummary(stops);

  const label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const rel = key === today ? 'Today' : (key === ctDateKey(ctAddDays(ctParseDate(today), 1)) ? 'Tomorrow' : '');

  return `
    <div style="margin-bottom:12px">
      <button data-ct-route-back style="background:none;border:none;padding:0;font-size:12.5px;color:var(--text-3);cursor:pointer">← All contracts</button>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;flex-wrap:wrap">
      <div>
        <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;font-weight:700">${esc(rel || 'Route')}</div>
        <div style="font-size:20px;font-weight:700;margin-top:2px">${esc(label)}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <button class="btn-cancel" data-ct-route-day="${esc(ctDateKey(ctAddDays(d, -1)))}" aria-label="Previous day">←</button>
        ${key === today ? '' : `<button class="btn-cancel" data-ct-route-day="${esc(today)}">Today</button>`}
        <button class="btn-cancel" data-ct-route-day="${esc(ctDateKey(ctAddDays(d, 1)))}" aria-label="Next day">→</button>
      </div>
    </div>

    ${stops.length ? `<div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Stops</div><div class="kpi-value">${sum.stops}</div><div class="kpi-sub">${sum.done} finished</div></div>
      <div class="kpi-card"><div class="kpi-label">Checklist</div><div class="kpi-value">${sum.tasks ? sum.tasksDone + '/' + sum.tasks : '—'}</div><div class="kpi-sub">${sum.tasks ? 'items done' : 'nothing to tick'}</div></div>
    </div>` : ''}

    ${stops.length === 0
      ? `<div class="section" style="text-align:center;padding:34px 20px">
          <p style="font-size:14px;color:var(--text-2);margin-bottom:4px">Nothing scheduled for ${esc(label)}.</p>
          <p style="font-size:12.5px;color:var(--text-3)">Visits appear here once they are generated, alongside any other job booked that day.</p>
        </div>`
      : `<div style="display:flex;flex-direction:column;gap:8px">${stops.map(ctRouteRow).join('')}</div>`}
  `;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ctRouteJobs, ctRouteStop, ctRouteSummary, ctMapsHref, ctRouteRow, renderDayRoute,
  };
}
