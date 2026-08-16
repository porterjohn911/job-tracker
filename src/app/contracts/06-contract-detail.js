// Recurring contracts — the account page.
//
// The app's unit is the job, which is right for project work: a job starts,
// finishes, and makes money. Maintenance does not work that way. Nobody asks
// about "Dock maintenance — Sep 2026"; they ask about Whitaker Marina — is that
// account profitable, when does it renew, when were we last there. Twenty
// contracts on monthly visits is 240 jobs a year, and none of those questions
// can be answered from a flat list of them.
//
// This file is that missing place to stand. Two questions get answered above
// the fold, because they are the two a maintenance business asks daily:
//
//   Is this account making money?   Fixed price, variable cost — the only way
//                                   to know what to reprice at renewal.
//   When does it lapse?             Visits stop when prepayment runs out (by
//                                   design), so a silent lapse stops the crews.
//
// Everything here READS. It touches no project-work behaviour: the routing
// happens inside renderContracts(), mirroring how renderCustomers() switches on
// S.custDetail, so no shared view, route or costing code changes.
//
// Requires 01-contract-periods.js through 05-contract-generate.js.

// ── Gathering a contract's work ─────────────────────────────────────────────

// Visit jobs belong to a contract by contractId. The standing Agreement job is
// excluded — it holds invoices, it is not a visit.
function ctContractJobs(contractId) {
  const billingId = ctBillingJobId({ id: contractId });
  return Object.values((typeof S !== 'undefined' && S.jobs) || {})
    .filter(j => j && j.contractId === contractId && j.id !== billingId)
    .sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')));
}

function ctContractInvoices(contractId) {
  const job = (typeof S !== 'undefined' && S.jobs && S.jobs[ctBillingJobId({ id: contractId })]) || null;
  return ((job && job.invoices) || [])
    .slice()
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
}

// ── Margin ──────────────────────────────────────────────────────────────────

// Revenue and cost rolled up across the whole account rather than per job.
//
// Per-job costing cannot answer this: each visit carries labour and materials
// with no revenue, and the Agreement job carries every invoice with no cost.
// Split across 12 jobs those numbers are noise; added up they are the margin on
// the account. Cost components are kept separate so the number is explainable —
// "we lost money on this one" is only useful with "because labour ran over".
function ctContractCosting(contract) {
  const jobs = ctContractJobs(contract.id);
  const invoices = ctContractInvoices(contract.id);

  let revenue = 0, collected = 0;
  invoices.forEach(inv => {
    const c = calcInvoice(inv);
    revenue += c.total;
    collected += c.paid;
  });

  let labor = 0, materials = 0, other = 0, hours = 0;
  jobs.forEach(j => {
    const stats = typeof jobLaborStats === 'function' ? jobLaborStats(j.id) : { cost: 0, hours: 0 };
    labor += stats.cost || 0;
    hours += stats.hours || 0;
    materials += typeof receiptTotal === 'function' ? receiptTotal(j) : 0;
    other += Number(j.costs || 0);
  });

  const cost = labor + materials + other;
  const profit = revenue - cost;
  return {
    revenue, collected, outstanding: revenue - collected,
    labor, materials, other, cost, hours,
    profit,
    margin: revenue > 0 ? (profit / revenue) * 100 : null,
    invoiceCount: invoices.length,
    visitCount: jobs.length,
    // Visits done but not yet billed by any schedule — the gap that turns into
    // a surprise at year end on a fixed-price agreement.
    hasCostWithoutRevenue: cost > 0 && revenue === 0,
  };
}

// ── Renewal ─────────────────────────────────────────────────────────────────

// Visits are scheduled only as far as the customer has paid, so a lapse stops
// the crews being booked without anything failing loudly. This is the counter-
// part to that decision: it says out loud where the account stands.
function ctRenewalState(contract, nowTs) {
  const now = ctStartOfDay(nowTs == null ? Date.now() : nowTs);
  const paid = ctParseDate(ctVisitLimit(contract));
  const end = ctParseDate(contract.endDate);
  const days = d => d ? Math.round((d - now) / 86400000) : null;

  const paidDays = days(paid);
  const endDays = days(end);

  let level = 'ok', message = '';
  if (!contract.visits) {
    level = 'none';
  } else if (!paid) {
    level = 'urgent';
    message = 'No visits are paid for — nothing will be scheduled.';
  } else if (paidDays < 0) {
    level = 'urgent';
    message = 'Prepaid visits ran out ' + Math.abs(paidDays) + ' day' + (Math.abs(paidDays) === 1 ? '' : 's') + ' ago. No new visits are being scheduled.';
  } else if (paidDays <= 30) {
    level = 'soon';
    message = 'Prepaid visits run out in ' + paidDays + ' day' + (paidDays === 1 ? '' : 's') + '.';
  }

  if (level === 'ok' && endDays != null && endDays >= 0 && endDays <= 60) {
    level = 'soon';
    message = 'The agreement ends in ' + endDays + ' day' + (endDays === 1 ? '' : 's') + '.';
  }

  return { paid, paidDays, end, endDays, level, message };
}

// ── Rendering ───────────────────────────────────────────────────────────────

function ctStat(label, value, sub, color) {
  return `<div class="kpi-card">
    <div class="kpi-label">${esc(label)}</div>
    <div class="kpi-value"${color ? ` style="color:${color}"` : ''}>${value}</div>
    <div class="kpi-sub">${esc(sub || '')}</div>
  </div>`;
}

function ctRenewalBanner(state) {
  if (state.level === 'ok' || state.level === 'none') return '';
  const urgent = state.level === 'urgent';
  const color = urgent ? 'var(--orange)' : 'var(--text-2)';
  return `<div style="background:${urgent ? 'rgba(234,140,20,0.10)' : 'var(--surface)'};border:1px solid ${urgent ? 'var(--orange)' : 'var(--border)'};border-radius:8px;padding:10px 12px;margin-bottom:14px">
    <div style="font-size:12.5px;font-weight:700;color:${color};margin-bottom:2px">${urgent ? 'Needs renewing' : 'Renewal coming up'}</div>
    <div style="font-size:12.5px;color:var(--text-2);line-height:1.5">${esc(state.message)} Extend <strong>Visits paid through</strong> on the contract to keep scheduling.</div>
  </div>`;
}

function ctVisitRows(contract, nowTs) {
  const now = ctStartOfDay(nowTs == null ? Date.now() : nowTs);
  const jobs = ctContractJobs(contract.id);
  if (!jobs.length) {
    return `<p style="font-size:12.5px;color:var(--text-3);padding:6px 0">No visits created yet. Press <strong>Generate</strong> on the Contracts tab to create the ones that are paid for.</p>`;
  }
  return jobs.map(j => {
    const d = ctParseDate(j.startDate);
    const past = d && d < now;
    const stats = typeof jobLaborStats === 'function' ? jobLaborStats(j.id) : { hours: 0, cost: 0 };
    const bits = [];
    if (stats.hours > 0) bits.push(stats.hours.toFixed(1) + 'h');
    if (stats.cost > 0) bits.push(money2(stats.cost) + ' labour');
    const receipts = typeof receiptTotal === 'function' ? receiptTotal(j) : 0;
    if (receipts > 0) bits.push(money2(receipts) + ' materials');
    if ((j.photos || []).length) bits.push((j.photos || []).length + ' photo' + ((j.photos || []).length === 1 ? '' : 's'));
    // Checklist progress is the plainest answer to "was this visit actually
    // done?", which is what a fixed-fee customer is really asking at renewal.
    const tasks = j.tasks || [];
    const doneCount = tasks.filter(t => t && t.done).length;
    if (tasks.length) bits.push(doneCount + '/' + tasks.length + ' done');
    // Reporting is offered only where there is something to report, so the
    // button never invites sending an email that says nothing happened.
    const report = typeof ctVisitReportState === 'function' ? ctVisitReportState(j) : { can: false };
    const reportBtn = report.sentAt
      ? `<span style="font-size:10.5px;color:var(--green-700);flex-shrink:0" title="Reported to ${esc(j.visitReportedTo || '')}">Reported</span>`
      : (report.can ? `<button class="btn-remove" data-ct-report="${esc(j.id)}" style="flex-shrink:0">Send report</button>` : '');

    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
      <div data-open="${esc(j.id)}" style="flex:1;min-width:0;cursor:pointer">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(j.name || 'Visit')}</div>
        <div style="font-size:11.5px;color:var(--text-3)">${esc(j.startDate || 'no date')}${bits.length ? ' · ' + esc(bits.join(' · ')) : (past ? ' · nothing logged' : '')}</div>
      </div>
      ${reportBtn}
      <span class="status-pill ${spClass(j.status)}" style="font-size:9.5px;flex-shrink:0">${spLabel(j.status)}</span>
    </div>`;
  }).join('');
}

function ctInvoiceRows(contract) {
  const invoices = ctContractInvoices(contract.id);
  if (!invoices.length) {
    return `<p style="font-size:12.5px;color:var(--text-3);padding:6px 0">No invoices raised yet.</p>`;
  }
  const billingJobId = ctBillingJobId({ id: contract.id });
  return invoices.map(inv => {
    const c = calcInvoice(inv);
    const status = typeof invoiceStatus === 'function' ? invoiceStatus(inv) : (inv.status || 'draft');
    const overdue = status === 'overdue';
    return `<div data-open="${esc(billingJobId)}" style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);cursor:pointer">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600">${esc(inv.number || 'Invoice')}</div>
        <div style="font-size:11.5px;color:${overdue ? 'var(--orange)' : 'var(--text-3)'}">${esc(inv.date || '')}${inv.dueDate ? ' · due ' + esc(inv.dueDate) : ''} · ${esc(status)}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:13px;font-weight:700">${money2(c.total)}</div>
        ${c.balance > 0.005 ? `<div style="font-size:11px;color:var(--orange)">${money2(c.balance)} due</div>` : `<div style="font-size:11px;color:var(--green-700)">paid</div>`}
      </div>
    </div>`;
  }).join('');
}

function renderContractDetail(contractId, nowTs) {
  const c = ctGetContract(contractId);
  if (!c) return `<div class="tt-empty" style="padding:40px 16px"><p style="font-size:14px;color:var(--text-2)">That contract no longer exists.</p></div>`;

  const now = nowTs == null ? Date.now() : nowTs;
  const m = ctContractCosting(c);
  const renewal = ctRenewalState(c, now);
  const customer = ctCustomerName(c.customerId);

  const schedule = [
    ctFreqLabel(c.visits) ? ctFreqLabel(c.visits).toLowerCase() + ' visits' : '',
    ctFreqLabel(c.billing) ? 'billed ' + ctFreqLabel(c.billing).toLowerCase() : '',
  ].filter(Boolean).join(' · ') || 'no schedule set';

  // Margin is deliberately unstated rather than shown as 0% or -100% when
  // nothing has been invoiced yet. A number that looks like a catastrophe but
  // only means "we have not billed yet" trains people to ignore the number.
  const marginValue = m.revenue > 0 ? m.margin.toFixed(0) + '%' : '—';
  const marginColor = m.revenue > 0 ? (m.profit > 0 ? 'var(--green-700)' : 'var(--orange)') : 'var(--text-3)';
  const marginSub = m.revenue > 0
    ? money2(m.profit) + ' profit'
    : (m.hasCostWithoutRevenue ? money2(m.cost) + ' spent, nothing billed' : 'nothing billed yet');

  const costParts = [
    m.labor > 0 ? money2(m.labor) + ' labour' : '',
    m.materials > 0 ? money2(m.materials) + ' materials' : '',
    m.other > 0 ? money2(m.other) + ' other' : '',
  ].filter(Boolean).join(' · ') || 'nothing logged';

  return `
    <div style="margin-bottom:12px">
      <button data-ct-back style="background:none;border:none;padding:0;font-size:12.5px;color:var(--text-3);cursor:pointer">← All contracts</button>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;font-weight:700">Contract</div>
        <div style="font-size:20px;font-weight:700;margin-top:2px">${esc(c.name || 'Untitled contract')}</div>
        <div style="font-size:12.5px;color:var(--text-3);margin-top:3px">${customer ? esc(customer) + ' · ' : ''}${esc(schedule)}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
        <span class="status-pill" style="${ctStatusStyle(c.status)}">${ctStatusLabel(c.status)}</span>
        <button class="btn-add" id="btn-ct-edit">Edit</button>
      </div>
    </div>

    ${ctRenewalBanner(renewal)}

    <div class="kpi-grid">
      ${ctStat('Margin', marginValue, marginSub, marginColor)}
      ${ctStat('Billed', money2(m.revenue), m.outstanding > 0.005 ? money2(m.outstanding) + ' outstanding' : m.invoiceCount + ' invoice' + (m.invoiceCount === 1 ? '' : 's'), m.outstanding > 0.005 ? 'var(--orange)' : '')}
      ${ctStat('Cost', money2(m.cost), costParts)}
    </div>

    <div class="section">
      <div class="section-hd">Renewal <span>${renewal.paid ? 'visits paid through ' + esc(ctDateKey(renewal.paid)) : 'nothing paid for'}</span></div>
      <div style="font-size:12.5px;color:var(--text-2);line-height:1.6">
        ${c.visits
          ? (renewal.paid
              ? (renewal.paidDays >= 0
                  ? `<strong>${renewal.paidDays} day${renewal.paidDays === 1 ? '' : 's'}</strong> of prepaid visits remain.`
                  : `Prepaid visits ended <strong>${Math.abs(renewal.paidDays)} day${Math.abs(renewal.paidDays) === 1 ? '' : 's'}</strong> ago.`)
              : 'No prepayment recorded, so no visits will be scheduled.')
          : 'This contract has no visit schedule.'}
        ${renewal.end ? ` The agreement ends ${esc(ctDateKey(renewal.end))}.` : ''}
        ${m.hours > 0 ? ` ${m.hours.toFixed(1)} hours logged across ${m.visitCount} visit${m.visitCount === 1 ? '' : 's'}.` : ''}
      </div>
    </div>

    ${typeof ctProposalSection === 'function' ? ctProposalSection(c, now) : ''}

    ${typeof ctPricingSection === 'function' ? ctPricingSection(c) : ''}

    <div class="section">
      <div class="section-hd">Visits <span>${m.visitCount} created</span></div>
      ${ctVisitRows(c, now)}
    </div>

    <div class="section">
      <div class="section-hd">Invoices <span>${m.invoiceCount} raised</span></div>
      ${ctInvoiceRows(c)}
    </div>
  `;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ctContractJobs, ctContractInvoices, ctContractCosting, ctRenewalState,
    ctVisitRows, ctInvoiceRows, renderContractDetail,
  };
}
