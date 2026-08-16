// Recurring contracts — the Contracts view.
//
// Read-only. Nothing in this file writes — it renders state and returns an HTML
// string, exactly like renderCustomers() and the other views. The editor in
// 04-contract-editor.js owns every write.
//
// Layout and classes follow views/07-customers.js so this tab looks like it
// belongs: the same header block, .kpi-grid, search input and card list.
//
// Requires 01-contract-periods.js and 02-contract-store.js.

// ── Display helpers ─────────────────────────────────────────────────────────

// "Weekly", "Every 2 weeks", "Monthly", "Every 3 months", "Annually".
// Reads the stored freq/interval rather than the reduced {unit, step}, so a
// quarterly contract reads as "Quarterly" and not "Every 3 months".
function ctFreqLabel(schedule) {
  if (!schedule || !ctNormalizeSchedule(schedule)) return '';
  const freq = String(schedule.freq).toLowerCase();
  const n = Number(schedule.interval) >= 1 ? Math.floor(Number(schedule.interval)) : 1;
  const plain = { weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annually' };
  if (n === 1) return plain[freq] || freq;
  const unit = { weekly: 'weeks', biweekly: 'fortnights', monthly: 'months', quarterly: 'quarters', annual: 'years' }[freq] || freq;
  return 'Every ' + n + ' ' + unit;
}

// The first occurrence strictly after `fromTs`, or null when the contract has
// no schedule of that kind, is not active, or has run past its end date.
//
// The kind is validated rather than treated as "visit or else billing": an
// unrecognized kind must return nothing, not quietly fall through to the
// billing schedule and report a billing date where a visit was asked for.
// Visits are additionally bounded by the paid-through date, so the card never
// promises a visit nobody has paid for.
function ctNextDate(contract, kind, fromTs) {
  if (kind !== 'visit' && kind !== 'billing') return null;
  if (!contract || !ctIsActive(contract, fromTs)) return null;
  const norm = ctNormalizeSchedule(kind === 'visit' ? contract.visits : contract.billing);
  if (!norm) return null;
  const from = ctStartOfDay(fromTs == null ? Date.now() : fromTs);
  const end = ctParseDate(contract.endDate);
  const paid = kind === 'visit' ? ctParseDate(ctVisitLimit(contract)) : null;
  if (kind === 'visit' && !paid) return null;
  for (let n = 0; n < 2000; n++) {
    const d = ctOccurrenceDate(contract.startDate, norm, n);
    if (!d) return null;
    if (end && d > end) return null;
    if (paid && d > paid) return null;
    if (d > from) return d;
  }
  return null;
}

// Occurrences falling inside the window [today, today + days]. Used for the
// "due soon" count, so past-due periods are deliberately excluded.
//
// Visits are additionally capped by what the customer has paid for, so the
// count only ever promises work that will actually be scheduled. Counting
// unpaid occurrences here would put visits on the dashboard that no generation
// run will ever create.
function ctUpcoming(contract, kind, nowTs, days) {
  const today = ctStartOfDay(nowTs == null ? Date.now() : nowTs);
  const periods = kind === 'visit'
    ? ctVisitPeriods(contract, nowTs)
    : ctDuePeriods(contract, kind, nowTs, days);
  const until = ctAddDays(today, Math.max(0, Math.floor(Number(days) || 0)));
  return periods.filter(p => p.date >= today && p.date <= until);
}

function ctStatusStyle(status) {
  return {
    active: 'background:var(--green-700);color:#fff',
    paused: 'background:var(--surface-2, #e8e8e8);color:var(--text-2)',
    ended: 'background:transparent;color:var(--text-3);border:1px solid var(--border)',
  }[status] || 'background:var(--surface-2, #e8e8e8);color:var(--text-2)';
}

function ctStatusLabel(status) {
  return { active: 'Active', paused: 'Paused', ended: 'Ended' }[status] || status;
}

// "Mar 22" / "Mar 22, 2027" — the year only when it is not the current one.
function ctShortDate(d, nowTs) {
  if (!d) return '';
  const now = new Date(nowTs == null ? Date.now() : nowTs);
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
}

// The customer's name if there is a saved record, otherwise nothing. Contracts
// store a customerId; the directory owns the name.
function ctCustomerName(customerId) {
  if (!customerId) return '';
  const rec = (typeof S !== 'undefined' && S.customers && S.customers[customerId]) || null;
  return (rec && rec.name) || '';
}

// The Generate button carries its own count, so the amount of outstanding work
// is visible before opening anything. It disappears entirely when there is
// nothing due — a button that always offers to create records invites pressing
// it to find out, and this one writes real jobs and invoices.
//
// Defined defensively: 05-contract-generate.js loads after this file, and the
// view must still render if it is missing.
function ctGenerateButton(nowTs) {
  if (typeof ctPendingWork !== 'function') return '';
  let totals;
  try { totals = ctPendingTotals(ctPendingWork(nowTs)); } catch (e) { return ''; }
  const n = totals.visits + totals.invoices;
  if (!n) return '';
  return `<button class="btn-add" id="btn-ct-generate" style="background:var(--orange)" aria-label="Generate due contract work">
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/></svg>
    Generate ${n}
  </button>`;
}

// ── Renewals ────────────────────────────────────────────────────────────────

// Contracts that have stopped scheduling, or are about to.
//
// This is the counterpart to visits stopping when prepayment runs out. That is
// the safe behaviour, but it fails quietly: the crews simply stop being booked.
// The account page says so for one contract; this says it for all of them, so a
// lapse cannot hide behind a list of cards that all read "Active".
//
// Urgent first, then soonest, because the order is a work queue.
function ctNeedsRenewal(nowTs) {
  if (typeof ctRenewalState !== 'function') return [];
  const rank = { urgent: 0, soon: 1 };
  return ctContractList()
    .filter(c => c.status === 'active')
    .map(c => ({ contract: c, state: ctRenewalState(c, nowTs) }))
    .filter(r => r.state.level === 'urgent' || r.state.level === 'soon')
    .sort((a, b) =>
      (rank[a.state.level] - rank[b.state.level]) ||
      ((a.state.paidDays == null ? 9e9 : a.state.paidDays) - (b.state.paidDays == null ? 9e9 : b.state.paidDays)) ||
      (a.contract.name || '').localeCompare(b.contract.name || ''));
}

function ctRenewalSection(nowTs) {
  const rows = ctNeedsRenewal(nowTs);
  if (!rows.length) return '';
  const urgent = rows.filter(r => r.state.level === 'urgent').length;
  return `<div class="section" style="border:1px solid ${urgent ? 'var(--orange)' : 'var(--border)'};border-radius:10px;padding:12px 14px">
    <div class="section-hd" style="margin-bottom:6px">Needs Renewing <span>${urgent ? urgent + ' already stopped scheduling' : 'coming up'}</span></div>
    ${rows.map(r => `<div data-ct="${esc(r.contract.id)}" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.contract.name || 'Untitled contract')}</div>
        <div style="font-size:11.5px;color:${r.state.level === 'urgent' ? 'var(--orange)' : 'var(--text-3)'}">${esc(r.state.message)}</div>
      </div>
      <span style="font-size:11px;font-weight:700;flex-shrink:0;color:${r.state.level === 'urgent' ? 'var(--orange)' : 'var(--text-3)'}">${r.state.level === 'urgent' ? 'STOPPED' : (r.state.paidDays != null ? r.state.paidDays + 'd' : '')}</span>
    </div>`).join('')}
  </div>`;
}

// ── Card ────────────────────────────────────────────────────────────────────

function ctContractCard(c, nowTs) {
  const now = nowTs == null ? Date.now() : nowTs;
  const customer = ctCustomerName(c.customerId);
  const visitLbl = ctFreqLabel(c.visits);
  const billLbl = ctFreqLabel(c.billing);

  const schedule = [
    visitLbl ? visitLbl.toLowerCase() + ' visits' : '',
    billLbl ? 'billed ' + billLbl.toLowerCase() : '',
  ].filter(Boolean).join(' · ') || 'no schedule set';

  const nextVisit = ctNextDate(c, 'visit', now);
  const nextBill = ctNextDate(c, 'billing', now);
  const next = [
    nextVisit ? 'Next visit ' + ctShortDate(nextVisit, now) : '',
    nextBill ? 'next bill ' + ctShortDate(nextBill, now) : '',
  ].filter(Boolean).join(' · ');

  // How much of the schedule is actually paid for. When the paid-through date
  // has passed, scheduling has stopped — say so plainly, because the contract
  // still reads "Active" and the crew simply stops being booked otherwise.
  const paid = ctVisitLimit(c);
  const paidDate = paid ? ctParseDate(paid) : null;
  const lapsed = !!(paidDate && paidDate < ctStartOfDay(now));
  const remaining = c.visits && paid ? ctVisitPeriods(c, now).filter(p => p.date >= ctStartOfDay(now)).length : 0;
  const paidLine = c.visits && paid
    ? `<div style="font-size:12px;margin-top:3px;color:${lapsed ? 'var(--orange)' : 'var(--text-3)'}${lapsed ? ';font-weight:600' : ''}">${lapsed
        ? 'Paid through ' + esc(ctShortDate(paidDate, now)) + ' — renew to keep scheduling visits'
        : remaining + ' visit' + (remaining === 1 ? '' : 's') + ' paid through ' + esc(ctShortDate(paidDate, now))}</div>`
    : '';

  const addons = ctPendingAddons(c);
  const addonLine = addons.length
    ? `<div style="font-size:12px;color:var(--orange);margin-top:4px;font-weight:600">${addons.length} unbilled add-on${addons.length === 1 ? '' : 's'} · ${money2(ctAddonsTotal(addons))}</div>`
    : '';

  // Anything that would stop this contract doing what its author expects is
  // shown on the card rather than hidden behind an edit click — a contract that
  // silently generates nothing is the failure most likely to go unnoticed.
  const issues = ctContractIssues(c);
  const issueLine = issues.length
    ? `<div style="font-size:12px;color:var(--orange);margin-top:4px">⚠ ${esc(issues[0])}${issues.length > 1 ? ` <span style="color:var(--text-3)">+${issues.length - 1} more</span>` : ''}</div>`
    : '';

  return `<div class="section" data-ct="${esc(c.id)}" style="cursor:pointer;margin-bottom:0;padding:12px 14px">
    <div style="display:flex;align-items:flex-start;gap:10px">
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.name || 'Untitled contract')}</div>
        <div style="font-size:12px;color:var(--text-3);margin-top:2px">${customer ? esc(customer) + ' · ' : ''}${esc(schedule)}</div>
        ${next ? `<div style="font-size:12px;color:var(--text-2);margin-top:3px">${esc(next)}</div>` : ''}
        ${paidLine}
        ${addonLine}
        ${issueLine}
      </div>
      <span class="status-pill" style="${ctStatusStyle(c.status)};flex-shrink:0">${ctStatusLabel(c.status)}</span>
    </div>
  </div>`;
}

// ── View ────────────────────────────────────────────────────────────────────

function renderContracts(nowTs) {
  const now = nowTs == null ? Date.now() : nowTs;
  // The account page, when one is open. Routed here rather than through the
  // app's router, exactly as renderCustomers() switches on S.custDetail, so no
  // shared view or routing code has to know contracts have a detail view.
  if (S.ctDetail && typeof renderContractDetail === 'function') return renderContractDetail(S.ctDetail, now);
  if (S.ctRoute && typeof renderDayRoute === 'function') return renderDayRoute(S.ctRoute, now);
  const all = ctContractList();
  const q = ((typeof S !== 'undefined' && S.ctSearch) || '').trim().toLowerCase();
  const list = all.filter(c => !q ||
    (c.name + ' ' + ctCustomerName(c.customerId) + ' ' + (c.notes || '')).toLowerCase().includes(q));

  const active = all.filter(c => c.status === 'active');
  const renewals = ctNeedsRenewal(now);
  const dueSoon = active.reduce((n, c) => n + ctUpcoming(c, 'visit', now, 30).length, 0);
  const pendingAddons = all.reduce((acc, c) => {
    const a = ctPendingAddons(c);
    return { count: acc.count + a.length, total: acc.total + ctAddonsTotal(a) };
  }, { count: 0, total: 0 });

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;font-weight:700">Recurring Work</div>
        <div style="font-size:20px;font-weight:700;margin-top:2px">Contracts</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn-cancel" id="btn-ct-route" aria-label="Today's route">Today's Route</button>
        ${ctGenerateButton(now)}
        <button class="btn-add" id="btn-ct-add" aria-label="Add contract">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
          Add Contract
        </button>
      </div>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Active</div><div class="kpi-value">${active.length}</div><div class="kpi-sub">of ${all.length} contract${all.length === 1 ? '' : 's'}</div></div>
      <div class="kpi-card"><div class="kpi-label">Visits Due</div><div class="kpi-value">${dueSoon}</div><div class="kpi-sub">next 30 days</div></div>
      <div class="kpi-card"><div class="kpi-label">Needs Renewing</div><div class="kpi-value" style="color:${renewals.length ? 'var(--orange)' : 'var(--green-700)'}">${renewals.length}</div><div class="kpi-sub">${renewals.filter(r => r.state.level === 'urgent').length} stopped scheduling</div></div>
      <div class="kpi-card accent"><div class="kpi-label">Unbilled Add-ons</div><div class="kpi-value" style="color:${pendingAddons.total > 0 ? 'var(--orange)' : 'var(--green-700)'}">${money2(pendingAddons.total)}</div><div class="kpi-sub">${pendingAddons.count} item${pendingAddons.count === 1 ? '' : 's'}</div></div>
    </div>
    ${ctRenewalSection(now)}
    ${all.length ? `<div style="margin:6px 0 12px">
      <input class="form-input" id="ct-search" value="${esc((typeof S !== 'undefined' && S.ctSearch) || '')}" placeholder="Search contracts…" style="width:100%">
    </div>` : ''}
    ${typeof ctHasSampleData === 'function' && ctHasSampleData() ? `<div style="text-align:right;margin-bottom:10px">
      <button id="btn-ct-sample-rm" style="background:none;border:none;padding:0;font-size:11.5px;color:var(--text-3);cursor:pointer;text-decoration:underline">Remove sample data</button>
    </div>` : ''}
    ${list.length === 0 ? `<div class="section" style="text-align:center;padding:34px 20px">
        <p style="font-size:14px;color:var(--text-2);margin-bottom:4px">${all.length === 0 ? 'No contracts yet.' : 'No contracts match your search.'}</p>
        <p style="font-size:12.5px;color:var(--text-3)">${all.length === 0 ? 'A contract schedules repeat visits, recurring billing, or both — and new contracts start paused until you switch them on.' : 'Try a different name or customer.'}</p>
        ${all.length === 0 && typeof ctLoadSampleData === 'function' ? `<button class="btn-cancel" id="btn-ct-sample" style="margin-top:14px">Load sample data</button>
        <p style="font-size:11.5px;color:var(--text-3);margin-top:8px">Five example accounts with visits, hours and invoices, so the numbers have something to show. Removable in one press.</p>` : ''}
      </div>`
    : `<div style="display:flex;flex-direction:column;gap:8px">${list.map(c => ctContractCard(c, now)).join('')}</div>`}
  `;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ctFreqLabel, ctNextDate, ctUpcoming, ctNeedsRenewal, ctRenewalSection, ctStatusStyle, ctStatusLabel,
    ctShortDate, ctCustomerName, ctContractCard, renderContracts,
  };
}
