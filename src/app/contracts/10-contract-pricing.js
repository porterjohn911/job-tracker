// Recurring contracts — what we thought a visit costs, versus what it costs.
//
// A fixed-price maintenance agreement is a bet made once and paid for all year.
// Someone decides "call it $650 a month", the crew turns up twelve times, and
// nobody finds out the visits run an hour long until the renewal conversation —
// by which point the year is already lost. Project work does not have this
// problem: a job that overruns shows up as a bad job. Here the overrun is
// spread across twelve visits nobody looks at individually.
//
// So the contract carries the assumptions it was priced on — hours, crew rate,
// drive time, materials, target margin — and this file checks them against the
// hours and receipts that were actually logged. The output is a single number
// worth arguing about at renewal:
//
//   "At the hours you are really working, this needs to be $780 a month to hit
//    40%. You are charging $650."
//
// Two rules keep that number honest:
//
//   Only visits with LOGGED TIME count. A visit nobody clocked is unmeasured,
//   not free. Averaging it in as zero hours makes every account look profitable
//   in exact proportion to how badly the crew keeps time.
//
//   Nothing is asserted from one visit. The sample size travels with the answer
//   so a single bad day never reads as a pricing failure.
//
// Everything here READS. It writes nothing and touches no project-work code.
//
// Requires 01-contract-periods.js through 06-contract-detail.js.

// ── Frequency arithmetic ────────────────────────────────────────────────────

// How many times a schedule fires in a year. Returns null when there is no
// schedule, because "no schedule" is not "zero per year" — the difference
// decides whether an annual figure can be quoted at all.
function ctPerYear(schedule) {
  const norm = ctNormalizeSchedule(schedule);
  if (!norm || !norm.step) return null;
  const per = norm.unit === 'week' ? 52 / norm.step : 12 / norm.step;
  return Number.isFinite(per) && per > 0 ? per : null;
}

// ── The estimate ────────────────────────────────────────────────────────────

// What the contract says a visit should cost, and what it would have to be
// priced at to hit the target margin. Pure arithmetic on the stored
// assumptions — no jobs, no time entries. Null when the contract was never
// priced, which is a legitimate state and not an error.
//
// Drive time is costed at the same crew rate as on-site work. It is paid the
// same, and a contract an hour up the coast is exactly the kind that quietly
// loses money.
function ctPricingEstimate(contract) {
  const p = contract && contract.pricing;
  if (!p) return null;

  const driveHours = (p.driveMinutes || 0) / 60;
  const hoursPerVisit = (p.hoursPerVisit || 0) + driveHours;
  const laborPerVisit = hoursPerVisit * (p.crewRate || 0);
  const costPerVisit = laborPerVisit + (p.materialsPerVisit || 0);

  const visitsPerYear = ctPerYear(contract.visits);
  const billsPerYear = ctPerYear(contract.billing);
  const m = p.targetMargin / 100;

  // Price = cost / (1 - margin). Dividing by (1 - m) is the only formula that
  // gives a true margin; cost * (1 + m) gives a markup, which on a 40% target
  // is nearly nine points light.
  const priceFor = cost => (m > 0 && m < 1 ? cost / (1 - m) : cost);

  const costPerYear = visitsPerYear == null ? null : costPerVisit * visitsPerYear;
  const suggestedPerYear = costPerYear == null ? null : priceFor(costPerYear);
  const billedPerYear = (billsPerYear != null && contract.billing)
    ? (contract.billing.amount || 0) * billsPerYear
    : null;

  return {
    hoursPerVisit, driveHours,
    onSiteHours: p.hoursPerVisit || 0,
    crewRate: p.crewRate || 0,
    materialsPerVisit: p.materialsPerVisit || 0,
    laborPerVisit, costPerVisit,
    targetMargin: p.targetMargin,
    visitsPerYear, billsPerYear,
    costPerYear, suggestedPerYear,
    suggestedPerBill: (suggestedPerYear == null || !billsPerYear) ? null : suggestedPerYear / billsPerYear,
    billedPerYear,
    // The margin the contract would earn if every assumption held. Worth
    // showing on its own: a contract can be mispriced before anyone works it.
    marginAtEstimate: (billedPerYear && costPerYear != null && billedPerYear > 0)
      ? ((billedPerYear - costPerYear) / billedPerYear) * 100
      : null,
  };
}

// ── The actuals ─────────────────────────────────────────────────────────────

// What the visits really cost, averaged over the ones there is a record of.
//
// `measured` is the count that everything else divides by, and it counts only
// visits with logged time. Materials on an unmeasured visit are deliberately
// left out of the average rather than divided by a denominator that excludes
// the labour they came with — they are reported separately so the number is
// never quietly understated.
function ctPricingActual(contract) {
  const jobs = typeof ctContractJobs === 'function' ? ctContractJobs(contract.id) : [];
  const stats = j => (typeof jobLaborStats === 'function' ? jobLaborStats(j.id) : { hours: 0, cost: 0 });
  const receipts = j => (typeof receiptTotal === 'function' ? receiptTotal(j) : 0);

  let hours = 0, labor = 0, materials = 0, measured = 0;
  let unmeasured = 0, unmeasuredMaterials = 0;

  jobs.forEach(j => {
    const s = stats(j);
    if (s.hours > 0) {
      measured++;
      hours += s.hours;
      labor += s.cost || 0;
      materials += receipts(j) + Number(j.costs || 0);
    } else {
      unmeasured++;
      unmeasuredMaterials += receipts(j) + Number(j.costs || 0);
    }
  });

  const cost = labor + materials;
  return {
    visitCount: jobs.length,
    measured, unmeasured, unmeasuredMaterials,
    hours, labor, materials, cost,
    hoursPerVisit: measured ? hours / measured : null,
    laborPerVisit: measured ? labor / measured : null,
    materialsPerVisit: measured ? materials / measured : null,
    costPerVisit: measured ? cost / measured : null,
    // The effective hourly rate the crew actually cost, which is not the crew
    // rate typed into the estimate the moment two people ride to one visit.
    effectiveRate: hours > 0 ? labor / hours : null,
    // Below three visits an average is an anecdote. Callers say so rather than
    // presenting a reprice figure with the confidence of a measurement.
    thin: measured > 0 && measured < 3,
  };
}

// ── Estimate versus actual ──────────────────────────────────────────────────

// The comparison, and the reprice number that comes out of it.
//
// The reprice is computed from ACTUAL cost at the contract's own target margin,
// so it answers "what should this be" rather than "how wrong was the estimate".
// It needs a visit schedule to annualize per-visit costs; without one there is
// no honest way to turn a visit average into a yearly figure, so it says it
// cannot rather than guessing.
function ctPricingVariance(contract) {
  const est = ctPricingEstimate(contract);
  const act = ctPricingActual(contract);

  const out = {
    estimate: est, actual: act,
    hoursDelta: null, hoursPct: null,
    costDelta: null, costPct: null,
    neededPerYear: null, neededPerBill: null,
    billedPerYear: est ? est.billedPerYear : null,
    billedPerBill: (contract.billing && contract.billing.amount) || null,
    gapPerYear: null, gapPct: null,
    marginNow: null,
    canReprice: false,
    verdict: 'unpriced',
  };

  if (!est) { out.verdict = 'unpriced'; return out; }
  if (!act.measured) { out.verdict = 'unmeasured'; return out; }

  out.hoursDelta = act.hoursPerVisit - est.hoursPerVisit;
  out.hoursPct = est.hoursPerVisit > 0 ? (out.hoursDelta / est.hoursPerVisit) * 100 : null;
  out.costDelta = act.costPerVisit - est.costPerVisit;
  out.costPct = est.costPerVisit > 0 ? (out.costDelta / est.costPerVisit) * 100 : null;

  const visitsPerYear = est.visitsPerYear;
  const m = est.targetMargin / 100;
  if (visitsPerYear != null && m > 0 && m < 1) {
    const actualCostPerYear = act.costPerVisit * visitsPerYear;
    out.actualCostPerYear = actualCostPerYear;
    out.neededPerYear = actualCostPerYear / (1 - m);
    if (est.billsPerYear) out.neededPerBill = out.neededPerYear / est.billsPerYear;
    if (est.billedPerYear != null && est.billedPerYear > 0) {
      out.gapPerYear = out.neededPerYear - est.billedPerYear;
      out.gapPct = (out.gapPerYear / est.billedPerYear) * 100;
      out.marginNow = ((est.billedPerYear - actualCostPerYear) / est.billedPerYear) * 100;
    }
    out.canReprice = out.neededPerYear > 0;
  }

  // The verdict drives the colour and the sentence. It reads the MARGIN being
  // earned, not the hours: a visit that runs long on a contract priced with
  // room to spare is not a problem, and saying it is teaches people to ignore
  // this panel.
  if (out.marginNow == null) out.verdict = 'unbilled';
  else if (out.marginNow < 0) out.verdict = 'losing';
  else if (out.marginNow < est.targetMargin - 10) out.verdict = 'under';
  else out.verdict = 'on-target';

  return out;
}

// ── Rendering ───────────────────────────────────────────────────────────────

function ctHours(n) { return (Math.round(n * 10) / 10).toFixed(1) + 'h'; }

function ctSigned(n, fmt) { return (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n)); }

// The sentence someone can take into a renewal conversation. Written as prose
// on purpose — a table of variances gets nodded at, a sentence with a dollar
// figure in it gets acted on.
function ctPricingVerdictText(v) {
  const est = v.estimate, act = v.actual;
  if (v.verdict === 'unpriced') return 'This contract has no estimate, so there is nothing to check the real hours against.';
  if (v.verdict === 'unmeasured') {
    return act.visitCount
      ? `No time has been logged on ${act.visitCount === 1 ? 'the visit' : 'any of the ' + act.visitCount + ' visits'} yet, so there is nothing to compare. The estimate stands at ${money2(est.costPerVisit)} a visit.`
      : 'No visits have been worked yet. The estimate stands at ' + money2(est.costPerVisit) + ' a visit.';
  }

  const sample = `Measured across ${act.measured} visit${act.measured === 1 ? '' : 's'}`;
  const thin = act.thin ? ' — too few to be sure of yet' : '';
  const hoursBit = `${sample}${thin}: ${ctHours(act.hoursPerVisit)} a visit against ${ctHours(est.hoursPerVisit)} estimated, at ${money2(act.costPerVisit)} of cost against ${money2(est.costPerVisit)}.`;

  if (!v.canReprice) return hoursBit + ' Set a visit frequency to turn that into a yearly figure.';
  if (v.verdict === 'unbilled') {
    return hoursBit + ` At those costs this needs ${money2(v.neededPerYear)} a year to hit ${est.targetMargin}%${v.neededPerBill ? ', or ' + money2(v.neededPerBill) + ' a bill' : ''}.`;
  }

  const priceBit = v.neededPerBill != null && v.billedPerBill
    ? `${money2(v.neededPerBill)} a bill to hit ${est.targetMargin}%. You are charging ${money2(v.billedPerBill)}.`
    : `${money2(v.neededPerYear)} a year to hit ${est.targetMargin}%. You are billing ${money2(v.billedPerYear)}.`;

  if (v.verdict === 'losing') return `${hoursBit} This account is losing money at ${v.marginNow.toFixed(0)}% margin. It needs ${priceBit}`;
  if (v.verdict === 'under') return `${hoursBit} It is earning ${v.marginNow.toFixed(0)}% against a ${est.targetMargin}% target. It needs ${priceBit}`;
  return `${hoursBit} It is earning ${v.marginNow.toFixed(0)}% against a ${est.targetMargin}% target, so the price is holding.`;
}

function ctPricingRow(label, estimated, actual, delta) {
  return `<div style="display:flex;align-items:baseline;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)">
    <div style="flex:1;min-width:0;font-size:12.5px;color:var(--text-2)">${esc(label)}</div>
    <div style="width:78px;text-align:right;font-size:12.5px;color:var(--text-3)">${esc(estimated)}</div>
    <div style="width:78px;text-align:right;font-size:12.5px;font-weight:700">${esc(actual)}</div>
    <div style="width:74px;text-align:right;font-size:11.5px;color:${delta.over ? 'var(--orange)' : 'var(--green-700)'}">${esc(delta.text)}</div>
  </div>`;
}

// The whole panel, rendered into the account page. Returns markup in every
// state including "not priced yet", because an empty space teaches nobody that
// the estimate is the thing missing.
function ctPricingSection(contract) {
  const v = ctPricingVariance(contract);
  const est = v.estimate, act = v.actual;
  const text = ctPricingVerdictText(v);

  const tone = { losing: 'var(--orange)', under: 'var(--orange)', 'on-target': 'var(--green-700)' }[v.verdict] || 'var(--text-3)';
  const head = {
    unpriced: 'not priced',
    unmeasured: 'nothing logged yet',
    unbilled: 'not billed yet',
    losing: 'losing money',
    under: 'under target',
    'on-target': 'on target',
  }[v.verdict] || '';

  if (!est) {
    return `<div class="section">
      <div class="section-hd">Pricing <span>${esc(head)}</span></div>
      <div style="font-size:12.5px;color:var(--text-2);line-height:1.6">${esc(text)}
        Press <strong>Edit</strong> and fill in the hours, crew rate and materials this was quoted on.</div>
    </div>`;
  }

  const rows = act.measured ? [
    ctPricingRow('Hours per visit', ctHours(est.hoursPerVisit), ctHours(act.hoursPerVisit),
      { over: v.hoursDelta > 0.05, text: Math.abs(v.hoursDelta) < 0.05 ? 'on' : ctSigned(v.hoursDelta, ctHours) }),
    ctPricingRow('Labour per visit', money2(est.laborPerVisit), money2(act.laborPerVisit),
      { over: act.laborPerVisit > est.laborPerVisit, text: ctSigned(act.laborPerVisit - est.laborPerVisit, money2) }),
    ctPricingRow('Materials & costs', money2(est.materialsPerVisit), money2(act.materialsPerVisit),
      { over: act.materialsPerVisit > est.materialsPerVisit, text: ctSigned(act.materialsPerVisit - est.materialsPerVisit, money2) }),
    ctPricingRow('Cost per visit', money2(est.costPerVisit), money2(act.costPerVisit),
      { over: v.costDelta > 0, text: ctSigned(v.costDelta, money2) }),
  ].join('') : '';

  const header = act.measured
    ? `<div style="display:flex;gap:8px;padding-bottom:5px;border-bottom:1px solid var(--border);font-size:10.5px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-3);font-weight:700">
        <div style="flex:1"></div>
        <div style="width:78px;text-align:right">Quoted</div>
        <div style="width:78px;text-align:right">Actual</div>
        <div style="width:74px;text-align:right"></div>
      </div>`
    : '';

  // The reprice figure is given its own line at full size. It is the one number
  // on this page that someone acts on, and it should not have to be found.
  //
  // On an account already above target the same number is a FLOOR, not a price
  // to move to, and it is labelled that way. "Price to hit 40%: $312" next to a
  // $650 bill reads as advice to cut the price by half, which is the opposite
  // of what a healthy contract deserves — and the one misreading of this panel
  // that would actually cost money.
  const healthy = v.verdict === 'on-target';
  const headroom = healthy && v.billedPerBill ? v.billedPerBill - v.neededPerBill : 0;
  const reprice = (v.canReprice && v.neededPerBill != null && v.billedPerBill)
    ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:11px;padding:9px 11px;border-radius:8px;background:${healthy ? 'var(--surface)' : 'rgba(234,140,20,0.10)'};border:1px solid ${healthy ? 'var(--border)' : 'var(--orange)'}">
        <div style="font-size:12px;color:var(--text-2)">${healthy ? 'Floor to hold' : 'Price to hit'} ${esc(String(est.targetMargin))}%</div>
        <div style="text-align:right">
          <div style="font-size:17px;font-weight:700;color:${tone}">${money2(v.neededPerBill)}</div>
          <div style="font-size:11px;color:var(--text-3)">now ${money2(v.billedPerBill)}${healthy
            ? ' · ' + money2(headroom) + ' of headroom'
            : (v.gapPct != null ? ' · ' + ctSigned(v.gapPct, n => n.toFixed(0) + '%') : '')}</div>
        </div>
      </div>`
    : '';

  const unmeasuredNote = act.unmeasured
    ? `<div style="font-size:11.5px;color:var(--text-3);margin-top:8px">${act.unmeasured} visit${act.unmeasured === 1 ? '' : 's'} had no time logged and ${act.unmeasured === 1 ? 'is' : 'are'} left out of the average${act.unmeasuredMaterials > 0 ? ', along with ' + money2(act.unmeasuredMaterials) + ' of materials on them' : ''}.</div>`
    : '';

  return `<div class="section">
    <div class="section-hd">Pricing <span style="color:${tone}">${esc(head)}</span></div>
    <div style="font-size:12.5px;color:var(--text-2);line-height:1.6;margin-bottom:${act.measured ? '11' : '0'}px">${esc(text)}</div>
    ${header}${rows}${reprice}${unmeasuredNote}
  </div>`;
}

// The live hint under the estimate fields in the editor: what these numbers
// mean before anything is saved. Entering a crew rate is otherwise an act of
// faith about what it implies for the price.
function ctPricingHint(contract) {
  const est = ctPricingEstimate(contract);
  if (!est) return 'Fill these in to check the price against the hours your crew really works.';
  const perVisit = money2(est.costPerVisit) + ' of cost a visit';
  if (est.suggestedPerBill != null) {
    const now = (contract.billing && contract.billing.amount) || 0;
    return `${perVisit}. At ${est.targetMargin}% that is ${money2(est.suggestedPerBill)} a bill` +
      (now > 0 ? ` — you have ${money2(now)}.` : '.');
  }
  if (est.suggestedPerYear != null) return `${perVisit}, ${money2(est.suggestedPerYear)} a year at ${est.targetMargin}%. Set a billing frequency to price the bill.`;
  return `${perVisit}. Set a visit frequency to turn that into a yearly figure.`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ctPerYear, ctPricingEstimate, ctPricingActual, ctPricingVariance,
    ctPricingVerdictText, ctPricingSection, ctPricingHint,
  };
}
