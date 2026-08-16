// Managed entities — what each one pays, and what is still needed to know it.
//
// Four fee shapes are storable. Only one of them can be answered from data the
// app holds today, and this file says so out loud rather than producing a
// number for the other three:
//
//   flat      answerable now — an amount on a frequency, same arithmetic as a
//             contract's recurring billing.
//
//   percent   needs the linked company's revenue. Cross-company data today is
//             read from localStorage (see ownerLoadLocal), so it exists only
//             for companies opened on THIS device. A fee billed from that would
//             be right on one phone and zero on another, which is worse than no
//             fee at all — so it is offered as a clearly-labelled estimate and
//             never as a billable figure.
//
//   costplus  needs GMM's real cost for the entity, which needs management time
//             and overhead attributed to entities. Neither link exists yet.
//
//   hourly    needs management time logged against the entity. Time entries
//             attach to jobs, and an entity is not a job.
//
// Everything unanswerable returns monthly: null and a `needs` list. Null is not
// zero: zero says "this entity pays nothing", and that is a different and much
// more dangerous claim than "nobody has told me yet".
//
// Requires 01-entity-store.js.

// How many times a fee frequency fires in a year. Reuses the contracts period
// math so a monthly management fee and a monthly maintenance bill can never
// disagree about what "monthly" means.
function meFeePerYear(fee) {
  if (typeof ctPerYear !== 'function') return null;
  return ctPerYear({ freq: (fee && fee.freq) || 'monthly', interval: (fee && fee.interval) || 1 });
}

// A plain-English rendering of the arrangement, whether or not it computes.
// Worth having on its own: "6% of collected, at least $2,000 a month" is useful
// to read on a card even when the app cannot yet work out the number.
function meFeeLabel(entity) {
  const f = (entity && entity.fee) || {};
  const freqLabel = typeof ctFreqLabel === 'function'
    ? (ctFreqLabel({ freq: f.freq, interval: f.interval }) || 'Monthly').toLowerCase()
    : 'monthly';

  if (f.basis === 'flat') {
    return f.amount ? money2(f.amount) + ' ' + freqLabel : 'Flat fee, amount not set';
  }
  if (f.basis === 'percent') {
    if (!f.percent) return 'Percentage fee, percentage not set';
    const bounds = [
      f.floor ? 'at least ' + money2(f.floor) : '',
      f.cap ? 'capped at ' + money2(f.cap) : '',
    ].filter(Boolean).join(', ');
    return f.percent + '% of ' + f.percentOf + (bounds ? ' · ' + bounds : '');
  }
  if (f.basis === 'costplus') {
    return f.markup ? 'Cost plus ' + f.markup + '%' : 'Cost-plus, markup not set';
  }
  if (f.basis === 'hourly') {
    return f.rate ? money2(f.rate) + ' an hour' : 'Hourly, rate not set';
  }
  return 'No fee set';
}

// Whether the linked company's data is reachable at all on this device, and how
// much of it there is. Reported rather than assumed, because "no revenue" and
// "no data here" look identical once summed.
function meLinkedRevenue(entity) {
  const id = entity && entity.companyId;
  if (!id) return { linked: false, cached: false, jobs: 0, invoiced: 0, collected: 0 };
  const jobs = (typeof ownerJobs === 'function' ? ownerJobs(id) : []) || [];
  let invoiced = 0, collected = 0;
  jobs.forEach(j => {
    const t = typeof invoiceTotals === 'function' ? invoiceTotals(j) : null;
    invoiced += t ? t.total : Number(j.invoiced || 0);
    collected += t ? t.paid : Number(j.paid || 0);
  });
  return { linked: true, cached: jobs.length > 0, jobs: jobs.length, invoiced, collected };
}

// What an entity pays, per month, and what it would take to know.
//
// `monthly` is null whenever the answer is not honestly available. `estimate`
// carries a figure that is indicative only — currently just the percentage
// case, computed off device-local cached data — and is never added into a
// billable total.
function meFee(entity, nowTs) {
  const f = (entity && entity.fee) || {};
  const out = {
    basis: f.basis || 'flat',
    label: meFeeLabel(entity),
    monthly: null,
    annual: null,
    estimate: null,
    estimateNote: '',
    needs: [],
  };

  if (f.basis === 'flat') {
    const perYear = meFeePerYear(f);
    if (!f.amount) { out.needs.push('an amount'); return out; }
    if (!perYear) { out.needs.push('a billing frequency'); return out; }
    out.monthly = f.amount * perYear / 12;
    out.annual = out.monthly * 12;
    return out;
  }

  if (f.basis === 'percent') {
    if (!f.percent) out.needs.push('a percentage');
    if (!entity.companyId) out.needs.push('a link to a company in this app');
    out.needs.push('live cross-company revenue — today that data is only cached per device');

    const rev = meLinkedRevenue(entity);
    if (f.percent && rev.cached) {
      const base = f.percentOf === 'invoiced' ? rev.invoiced : rev.collected;
      let v = base * (f.percent / 100);
      if (f.floor) v = Math.max(v, f.floor);
      if (f.cap) v = Math.min(v, f.cap);
      out.estimate = v;
      out.estimateNote = f.percent + '% of ' + money2(base) + ' ' + f.percentOf +
        ' across ' + rev.jobs + ' job' + (rev.jobs === 1 ? '' : 's') +
        ' held on this device — all time, not a month, and not live.';
    } else if (f.percent && entity.companyId) {
      out.estimateNote = 'No data for ' + (meLinkedLabel(entity.companyId) || entity.companyId) +
        ' on this device, so there is nothing to take a percentage of here.';
    }
    return out;
  }

  if (f.basis === 'costplus') {
    if (!f.markup) out.needs.push('a markup');
    out.needs.push("GMM's own costs attributed to this entity");
    return out;
  }

  if (f.basis === 'hourly') {
    if (!f.rate) out.needs.push('an hourly rate');
    out.needs.push('management time logged against this entity');
    return out;
  }

  out.needs.push('a fee basis');
  return out;
}

// The book, rolled up.
//
// Billable and pending are kept apart for the same reason the revenue book
// keeps costed and uncosted apart: adding a known number to an unknown one and
// presenting the sum as the total is how a figure becomes confidently wrong.
function meBook(nowTs) {
  const rows = meList().map(e => ({ entity: e, fee: meFee(e, nowTs) }));
  const active = rows.filter(r => r.entity.status === 'active');
  const billable = active.filter(r => r.fee.monthly != null);
  const pending = active.filter(r => r.fee.monthly == null);

  return {
    rows, active, billable, pending,
    total: rows.length,
    activeCount: active.length,
    monthly: billable.reduce((s, r) => s + r.fee.monthly, 0),
    annual: billable.reduce((s, r) => s + r.fee.monthly, 0) * 12,
    pendingCount: pending.length,
    // Indicative only, and reported separately so it can never be mistaken for
    // money the app believes is owed.
    estimated: pending.reduce((s, r) => s + (r.fee.estimate || 0), 0),
    linked: rows.filter(r => r.entity.companyId).length,
    broken: rows.filter(r => meLinkBroken(r.entity)).length,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    meFeePerYear, meFeeLabel, meLinkedRevenue, meFee, meBook,
  };
}
