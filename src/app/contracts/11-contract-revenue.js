// Recurring contracts — the revenue book.
//
// A maintenance business is not the sum of its jobs, it is the sum of its
// agreements. The question the Contracts list cannot answer is the one a new
// venture asks weekly: what do we bring in every month without selling
// anything, is it growing, and how much of it is about to walk out the door.
//
// Everything reduces to ONE normalized number — monthly recurring revenue. A
// book of weekly, quarterly and annual agreements has no comparable figures in
// it until they are all put on the same footing, and until they are, "we bill
// $1,800 on that one" says nothing about whether it matters.
//
// Three things this refuses to do, because each would flatter the number:
//
//   Add-ons are NOT recurring. An emergency callout is real revenue and it is
//   counted, separately, where it cannot inflate the figure a valuation or a
//   hiring decision gets made against.
//
//   Cost is rolled up only over contracts that HAVE a cost basis, and the
//   uncovered share is stated. Dividing a partial cost by the whole book's
//   revenue invents margin out of contracts nobody has priced.
//
//   The trend is labelled as a reconstruction, not a billing history. It places
//   each contract on the calendar it was signed against at the price it carries
//   TODAY — useful for "when did we grow", wrong for "what did we invoice".
//
// Everything here READS. Routed on S.ctRevenue exactly as the day route is
// routed on S.ctRoute, so no shared view or router changes and project-work
// companies — which never load this directory — are untouched.
//
// Requires 01-contract-periods.js through 10-contract-pricing.js.

// ── One number, whatever the frequency ──────────────────────────────────────

// What a contract bills in an average month. Weekly agreements are worth
// 52/12 of their amount, not 4 — the four-week month is the classic way a
// recurring book quietly overstates itself by four percent.
function ctMonthlyValue(contract) {
  if (!contract || !contract.billing) return 0;
  const perYear = ctPerYear(contract.billing);
  if (!perYear) return 0;
  return (Number(contract.billing.amount) || 0) * perYear / 12;
}

// The monthly cost of servicing a contract, and where that figure came from.
//
// Actuals beat the estimate the moment there are enough visits to mean
// anything — the estimate is what someone hoped, the actuals are what happened.
// Below three measured visits the estimate is kept, because a reprice built on
// one bad Tuesday is worse than the assumption it replaced.
function ctMonthlyCost(contract, index) {
  const est = ctPricingEstimate(contract);
  if (!est || est.visitsPerYear == null) return { cost: 0, basis: 'none' };
  const act = ctPricingActual(contract, index);
  const perVisit = (act.measured >= 3 && act.costPerVisit != null)
    ? act.costPerVisit
    : est.costPerVisit;
  return {
    cost: perVisit * est.visitsPerYear / 12,
    basis: (act.measured >= 3 && act.costPerVisit != null) ? 'actual' : 'estimate',
  };
}

// ── Churn risk ──────────────────────────────────────────────────────────────

// Why a contract's revenue might not be there next quarter, in dollars.
//
// The nastiest case is the third one. Visits stop when prepayment runs out, but
// billing does NOT — the two schedules are independent by design. So a lapsed
// contract keeps invoicing while no crew is booked, and the customer finds out
// before you do. That is not a renewal reminder, it is an invoice about to be
// disputed, and it is called out as its own thing.
function ctRevenueRisk(contract, nowTs) {
  const mrr = ctMonthlyValue(contract);
  const state = ctRenewalState(contract, nowTs);
  const stillBilling = !!contract.billing && mrr > 0;

  if (contract.visits && state.paidDays != null && state.paidDays < 0) {
    return {
      level: stillBilling ? 'billing-unworked' : 'urgent',
      mrr: mrr,
      reason: stillBilling
        ? 'Visits stopped ' + Math.abs(state.paidDays) + ' days ago and it is still billing'
        : 'Visits stopped ' + Math.abs(state.paidDays) + ' days ago',
    };
  }
  if (contract.visits && !state.paid) {
    return { level: 'urgent', mrr: mrr, reason: 'No visits are paid for' };
  }
  if (state.paidDays != null && state.paidDays <= 30) {
    return { level: 'soon', mrr: mrr, reason: 'Prepaid visits run out in ' + state.paidDays + ' days' };
  }
  if (state.endDays != null && state.endDays >= 0 && state.endDays <= 60) {
    return { level: 'soon', mrr: mrr, reason: 'Agreement ends in ' + state.endDays + ' days' };
  }
  return { level: 'ok', mrr: mrr, reason: '' };
}

// ── The book ────────────────────────────────────────────────────────────────

const CT_RISK_RANK = { 'billing-unworked': 0, urgent: 1, soon: 2, ok: 3 };

function ctRevenueBook(nowTs) {
  const now = nowTs == null ? Date.now() : nowTs;
  const all = ctContractList();
  const index = ctLaborIndex();

  const rows = all.map(c => {
    const mrr = ctMonthlyValue(c);
    const cost = ctMonthlyCost(c, index);
    return {
      contract: c, mrr: mrr,
      cost: cost.cost, basis: cost.basis,
      risk: c.status === 'active' ? ctRevenueRisk(c, now) : { level: 'ok', mrr: mrr, reason: '' },
    };
  });

  const active = rows.filter(r => r.contract.status === 'active' && r.mrr > 0);
  const paused = rows.filter(r => r.contract.status === 'paused' && r.mrr > 0);

  const mrr = active.reduce((s, r) => s + r.mrr, 0);

  // Costed and uncosted are summed separately so margin is never computed by
  // dividing half a cost by a whole revenue.
  const costed = active.filter(r => r.basis !== 'none');
  const costedMrr = costed.reduce((s, r) => s + r.mrr, 0);
  const costTotal = costed.reduce((s, r) => s + r.cost, 0);

  const atRisk = active
    .filter(r => r.risk.level !== 'ok')
    .sort((a, b) => (CT_RISK_RANK[a.risk.level] - CT_RISK_RANK[b.risk.level]) || (b.mrr - a.mrr));

  // Add-ons booked in the last twelve months — real money, deliberately kept
  // out of the recurring figure.
  const yearAgo = ctDateKey(new Date(new Date(now).getFullYear() - 1, new Date(now).getMonth(), new Date(now).getDate()));
  let addons12 = 0;
  all.forEach(c => {
    Object.values(c.addons || {}).forEach(a => {
      if (a && Number(a.amount) && String(a.date || '') >= yearAgo) addons12 += Number(a.amount);
    });
  });

  return {
    rows, active, paused, atRisk,
    mrr: mrr, arr: mrr * 12,
    activeCount: active.length,
    contractCount: all.length,
    pausedMrr: paused.reduce((s, r) => s + r.mrr, 0),
    pausedCount: paused.length,
    atRiskMrr: atRisk.reduce((s, r) => s + r.mrr, 0),
    billingUnworked: atRisk.filter(r => r.risk.level === 'billing-unworked'),
    cost: costTotal,
    costedMrr: costedMrr,
    uncostedMrr: mrr - costedMrr,
    coverage: mrr > 0 ? (costedMrr / mrr) * 100 : null,
    // Margin over the costed slice only. Null when nothing is priced, rather
    // than 100% — an unpriced book is unmeasured, not free.
    margin: costedMrr > 0 ? ((costedMrr - costTotal) / costedMrr) * 100 : null,
    addons12: addons12,
    byCustomer: ctRevenueByCustomer(active),
  };
}

// Who the money comes from, largest first. One customer carrying most of a book
// is the risk that ends small maintenance companies, and it is invisible in a
// list sorted by name.
function ctRevenueByCustomer(activeRows) {
  const total = activeRows.reduce((s, r) => s + r.mrr, 0);
  const bucket = {};
  activeRows.forEach(r => {
    const key = r.contract.customerId || '';
    const name = ctCustomerName(r.contract.customerId) || 'No customer set';
    const b = bucket[key] || (bucket[key] = { key, name, mrr: 0, count: 0 });
    b.mrr += r.mrr;
    b.count++;
  });
  return Object.values(bucket)
    .map(b => Object.assign(b, { share: total > 0 ? (b.mrr / total) * 100 : 0 }))
    .sort((a, b) => b.mrr - a.mrr);
}

// ── The trend ───────────────────────────────────────────────────────────────

// Contracted MRR for each of the last `months` months.
//
// This is a RECONSTRUCTION, not a billing history. Each contract is placed on
// the calendar between its start and end dates at the price it carries today,
// so a contract repriced last week reads as though it always cost that. It
// answers "when did the book grow", which is the question a new venture has,
// and it is labelled so nobody mistakes it for what was invoiced.
//
// Paused contracts are excluded throughout: paused is a state of today with no
// history behind it, and guessing when it happened would be inventing data.
function ctMrrHistory(nowTs, months) {
  const now = new Date(nowTs == null ? Date.now() : nowTs);
  const n = Math.max(1, Math.floor(Number(months) || 12));
  const rows = ctContractList()
    .filter(c => c.status === 'active' || c.status === 'ended')
    .map(c => ({
      start: ctParseDate(c.startDate),
      // An ended contract with no end date stopped at some unknown point; the
      // last time anyone touched it is the closest honest guess.
      end: ctParseDate(c.endDate) || (c.status === 'ended' ? ctParseDate(c.updatedAt || 0) : null),
      mrr: ctMonthlyValue(c),
    }))
    .filter(r => r.start && r.mrr > 0);

  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const first = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    let mrr = 0, count = 0;
    rows.forEach(r => {
      if (r.start > last) return;
      if (r.end && r.end < first) return;
      mrr += r.mrr;
      count++;
    });
    out.push({
      key: first.getFullYear() + '-' + String(first.getMonth() + 1).padStart(2, '0'),
      label: first.toLocaleDateString(undefined, { month: 'short' }),
      year: first.getFullYear(),
      mrr: mrr, count: count,
    });
  }
  return out;
}

// ── Rendering ───────────────────────────────────────────────────────────────

// A bar with its top corners rounded and its base flat on the axis. rx on a
// <rect> would round the bottom too, lifting every bar off the baseline it is
// supposed to be measured from.
function ctRevBarPath(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y}` +
    ` L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

function ctMoneyShort(n) {
  const v = Math.round(Number(n) || 0);
  if (Math.abs(v) >= 10000) return '$' + Math.round(v / 1000) + 'k';
  if (Math.abs(v) >= 1000) return '$' + (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return '$' + v;
}

// Twelve months of contracted MRR.
//
// One series, so there is no legend and no categorical palette — a single hue
// carrying magnitude. Bars start at zero because a truncated baseline on a
// revenue chart overstates growth, which is the one thing this chart must not
// do. Every bar carries a <title>, so the exact figure is one hover away
// without a number printed on all twelve.
function ctMrrChart(history) {
  const W = 360, H = 96, GAP = 2, LABEL_H = 14;
  const n = history.length;
  if (!n) return '';
  const max = Math.max.apply(null, history.map(h => h.mrr).concat([1]));
  const barW = (W - GAP * (n - 1)) / n;

  const bars = history.map((h, i) => {
    const x = i * (barW + GAP);
    const full = max > 0 ? (h.mrr / max) * H : 0;
    const zero = h.mrr <= 0;
    // A month with nothing still gets a hairline, so a gap in the book reads as
    // a gap rather than as a month that was never in range.
    const barH = zero ? 1.5 : Math.max(full, 2);
    const y = H - barH;
    const title = `${h.label} ${h.year} — ${money2(h.mrr)} across ${h.count} contract${h.count === 1 ? '' : 's'}`;
    return `<path class="${zero ? 'ct-rev-bar-zero' : 'ct-rev-bar'}" d="${ctRevBarPath(x, y, barW, barH, 4)}"><title>${esc(title)}</title></path>`;
  }).join('');

  // Selective labels: every other month, counted BACK from the most recent so
  // this month always carries one and the spacing stays even. Counting forward
  // leaves the last two labels adjacent whenever the count is even.
  const labels = history.map((h, i) => {
    if ((n - 1 - i) % 2 !== 0) return '';
    const x = i * (barW + GAP) + barW / 2;
    return `<text class="ct-rev-axis" x="${x.toFixed(1)}" y="${H + 11}" text-anchor="middle">${esc(h.label)}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H + LABEL_H}" style="width:100%;height:auto;display:block" role="img"
    aria-label="Contracted monthly recurring revenue over the last ${n} months, ending at ${money2(history[n - 1].mrr)}">
    ${bars}
    <line class="ct-rev-axis-line" x1="0" y1="${H + 0.5}" x2="${W}" y2="${H + 0.5}"/>
    ${labels}
  </svg>`;
}

function ctRevRiskRow(row) {
  const r = row.risk;
  const alarming = r.level === 'billing-unworked' || r.level === 'urgent';
  return `<div data-ct="${esc(row.contract.id)}" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer">
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(row.contract.name || 'Untitled contract')}</div>
      <div style="font-size:11.5px;color:${alarming ? 'var(--orange)' : 'var(--text-3)'}">${esc(r.reason)}</div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div style="font-size:13px;font-weight:700;color:${alarming ? 'var(--orange)' : 'var(--text)'}">${money2(row.mrr)}</div>
      <div style="font-size:10.5px;color:var(--text-3)">a month</div>
    </div>
  </div>`;
}

// Only the largest customer is ever flagged, and only past 40%.
//
// Colouring every share above some fixed line turns arithmetic into an alarm:
// with three customers an even split is 33% each, so a 31% share is not
// concentration, it is just having three customers. What is worth flagging is
// one account big enough that losing it would hurt whatever the book's shape.
const CT_CONCENTRATION = 40;

function ctRevCustomerRow(b, topShare, isTop) {
  const wide = !!isTop && b.share >= CT_CONCENTRATION;
  return `<div style="padding:8px 0;border-bottom:1px solid var(--border)">
    <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px">
      <div style="flex:1;min-width:0;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(b.name)}</div>
      <div style="font-size:12.5px;font-weight:700;flex-shrink:0">${money2(b.mrr)}</div>
      <div style="font-size:11px;color:${wide ? 'var(--orange)' : 'var(--text-3)'};width:38px;text-align:right;flex-shrink:0">${b.share.toFixed(0)}%</div>
    </div>
    <div class="ct-rev-track"><div class="ct-rev-fill${wide ? ' wide' : ''}" style="width:${Math.max(1, (b.mrr / Math.max(topShare, 0.01)) * 100).toFixed(1)}%"></div></div>
  </div>`;
}

function renderRevenue(nowTs) {
  const now = nowTs == null ? Date.now() : nowTs;
  const book = ctRevenueBook(now);
  const history = ctMrrHistory(now, 12);

  const back = `<div style="margin-bottom:12px">
    <button data-ct-rev-back style="background:none;border:none;padding:0;font-size:12.5px;color:var(--text-3);cursor:pointer">← All contracts</button>
  </div>`;

  const head = `<div style="margin-bottom:14px">
    <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;font-weight:700">Recurring Work</div>
    <div style="font-size:20px;font-weight:700;margin-top:2px">Revenue</div>
  </div>`;

  if (!book.activeCount) {
    return back + head + `<div class="section" style="text-align:center;padding:34px 20px">
      <p style="font-size:14px;color:var(--text-2);margin-bottom:4px">No active contract is billing yet.</p>
      <p style="font-size:12.5px;color:var(--text-3)">Recurring revenue appears here once a contract has a billing frequency, an amount, and an active status.</p>
    </div>`;
  }

  // A month-over-month change worth stating only when there is a month before
  // it to compare against.
  const prev = history.length > 1 ? history[history.length - 2].mrr : null;
  const delta = prev != null && prev > 0 ? ((book.mrr - prev) / prev) * 100 : null;
  const growthSub = delta == null
    ? book.activeCount + ' active contract' + (book.activeCount === 1 ? '' : 's')
    : (delta >= 0.5 ? '+' : delta <= -0.5 ? '−' : '') +
      (Math.abs(delta) < 0.5 ? 'level on last month' : Math.abs(delta).toFixed(0) + '% on last month');

  const marginValue = book.margin == null ? '—' : book.margin.toFixed(0) + '%';
  const marginColor = book.margin == null ? 'var(--text-3)' : (book.margin >= 30 ? 'var(--green-700)' : 'var(--orange)');
  const marginSub = book.margin == null
    ? 'nothing priced yet'
    : (book.coverage >= 99.5
        ? money2(book.mrr - book.cost) + ' a month'
        : 'on the ' + book.coverage.toFixed(0) + '% that is priced');

  const top = book.byCustomer[0];
  const topMrr = top ? top.mrr : 0;

  return back + head + `
    <div class="kpi-grid">
      <div class="kpi-card accent"><div class="kpi-label">Monthly Recurring</div><div class="kpi-value">${money2(book.mrr)}</div><div class="kpi-sub">${esc(growthSub)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Annual Run Rate</div><div class="kpi-value">${ctMoneyShort(book.arr)}</div><div class="kpi-sub">${book.addons12 > 0 ? '+' + money2(book.addons12) + ' add-ons' : 'contracted, excl. add-ons'}</div></div>
      <div class="kpi-card"><div class="kpi-label">At Risk</div><div class="kpi-value" style="color:${book.atRiskMrr > 0 ? 'var(--orange)' : 'var(--green-700)'}">${money2(book.atRiskMrr)}</div><div class="kpi-sub">a month, across ${book.atRisk.length} contract${book.atRisk.length === 1 ? '' : 's'}</div></div>
      <div class="kpi-card"><div class="kpi-label">Book Margin</div><div class="kpi-value" style="color:${marginColor}">${marginValue}</div><div class="kpi-sub">${esc(marginSub)}</div></div>
    </div>

    ${book.billingUnworked.length ? `<div style="background:rgba(224,92,26,0.10);border:1px solid var(--orange);border-radius:8px;padding:10px 12px;margin-bottom:14px">
      <div style="font-size:12.5px;font-weight:700;color:var(--orange);margin-bottom:2px">Billing for work that stopped</div>
      <div style="font-size:12.5px;color:var(--text-2);line-height:1.5">${book.billingUnworked.length} contract${book.billingUnworked.length === 1 ? '' : 's'} worth ${money2(book.billingUnworked.reduce((s, r) => s + r.mrr, 0))} a month ${book.billingUnworked.length === 1 ? 'is' : 'are'} still raising invoices while no visits are being scheduled. Visits and billing run on separate schedules, so this does not stop itself — extend <strong>Visits paid through</strong> or pause the contract.</div>
    </div>` : ''}

    <div class="section">
      <div class="section-hd">Contracted MRR <span>last 12 months</span></div>
      ${ctMrrChart(history)}
      <div style="font-size:11px;color:var(--text-3);margin-top:8px;line-height:1.5">Each contract placed between its start and end dates at the price it carries today. It shows when the book grew, not what was invoiced.</div>
    </div>

    ${book.atRisk.length ? `<div class="section">
      <div class="section-hd">At Risk <span>${money2(book.atRiskMrr)} a month</span></div>
      ${book.atRisk.map(ctRevRiskRow).join('')}
    </div>` : ''}

    <div class="section">
      <div class="section-hd">Where it comes from <span>${book.byCustomer.length} customer${book.byCustomer.length === 1 ? '' : 's'}</span></div>
      ${book.byCustomer.map((b, i) => ctRevCustomerRow(b, topMrr, i === 0)).join('')}
      ${top && top.share >= CT_CONCENTRATION ? `<div style="font-size:11.5px;color:var(--orange);margin-top:8px;line-height:1.5">${esc(top.name)} is ${top.share.toFixed(0)}% of the recurring book. Losing that one account costs ${money2(top.mrr)} a month.</div>` : ''}
    </div>

    ${book.uncostedMrr > 0.005 ? `<div class="section">
      <div class="section-hd">Not yet priced <span>${money2(book.uncostedMrr)} a month</span></div>
      <div style="font-size:12.5px;color:var(--text-2);line-height:1.6">${money2(book.uncostedMrr)} of the ${money2(book.mrr)} billed each month has no cost estimate behind it, so the book margin above covers ${book.coverage.toFixed(0)}% of revenue. Add an estimate on those contracts to see the real figure.</div>
    </div>` : ''}

    ${book.pausedCount ? `<div class="section">
      <div class="section-hd">Paused <span>${money2(book.pausedMrr)} a month</span></div>
      <div style="font-size:12.5px;color:var(--text-2);line-height:1.6">${book.pausedCount} paused contract${book.pausedCount === 1 ? '' : 's'} worth ${money2(book.pausedMrr)} a month ${book.pausedCount === 1 ? 'is' : 'are'} not counted above. Switching ${book.pausedCount === 1 ? 'it' : 'them'} back to active would put ${book.mrr > 0 ? '+' + ((book.pausedMrr / book.mrr) * 100).toFixed(0) + '%' : 'that'} on the book.</div>
    </div>` : ''}
  `;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ctMonthlyValue, ctMonthlyCost, ctRevenueRisk, ctRevenueBook, ctRevenueByCustomer,
    ctMrrHistory, ctRevBarPath, ctMoneyShort, ctMrrChart, ctRevCustomerRow, renderRevenue,
  };
}
