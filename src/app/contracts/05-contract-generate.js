// Recurring contracts — turning a plan into real jobs and invoices.
//
// This is the only file in the feature that creates records the rest of the app
// treats as real work and real money. It is deliberately manual: you press a
// button, read exactly what will be created, and confirm. Nothing here runs on
// a timer. Moving it behind the scheduled-function pattern later is a change of
// trigger, not of logic — ctRunGeneration() is already idempotent.
//
// Everything a run creates carries the period key that produced it, so a second
// run finds nothing left to do. That is what makes it safe to press the button
// twice, to press it on two devices, or to press it again after a failure
// halfway through: the run resumes rather than repeating.
//
// Ordering rule for add-ons: they are stamped as billed BEFORE the invoice
// carrying them is written. If the write then fails, the add-on looks billed on
// an invoice that does not exist — visible in the editor, and fixable with one
// click. The other order risks the invoice existing while the add-on still
// looks unbilled, which bills the customer for it again on the next run.
// Under-billing is a conversation; double-billing is a lost customer.
//
// Requires 01-contract-periods.js through 04-contract-editor.js.

// ── Naming ──────────────────────────────────────────────────────────────────

// "Sep 2026" for schedules with at most one occurrence a month; "Sep 7, 2026"
// for weekly and fortnightly ones, where a month label would repeat and two
// visits would end up sharing a name.
function ctPeriodLabel(date, schedule) {
  const d = ctParseDate(date);
  if (!d) return '';
  const freq = String((schedule && schedule.freq) || '').toLowerCase();
  const dense = freq === 'weekly' || freq === 'biweekly';
  return d.toLocaleDateString(undefined, dense
    ? { month: 'short', day: 'numeric', year: 'numeric' }
    : { month: 'short', year: 'numeric' });
}

function ctGeneratedName(contract, date, schedule) {
  const base = (contract && contract.name) || 'Contract';
  const label = ctPeriodLabel(date, schedule);
  return label ? base + ' — ' + label : base;
}

// The billing container. Invoices in this app live on jobs, and a contract's
// recurring bills are not tied to any one visit — a weekly-visit contract billed
// annually has no visit to hang the invoice from. So each contract gets one
// standing job that holds its invoices, created on first use.
//
// The id is derived from the contract id rather than random, so "does this
// already exist?" needs no bookkeeping and two devices cannot create two.
function ctBillingJobId(contract) { return 'jct_' + ((contract && contract.id) || ''); }

// ── Reading what already exists ─────────────────────────────────────────────

function ctExistingVisitKeys() {
  return ctExistingKeys(Object.values((typeof S !== 'undefined' && S.jobs) || {}));
}

function ctExistingBillingKeys() {
  const out = new Set();
  Object.values((typeof S !== 'undefined' && S.jobs) || {}).forEach(j => {
    (j.invoices || []).forEach(inv => { if (inv && inv.periodKey) out.add(String(inv.periodKey)); });
  });
  return out;
}

// The full plan across every contract, measured against what is really on disk
// rather than anything cached.
function ctPendingWork(nowTs) {
  const now = nowTs == null ? Date.now() : nowTs;
  const visitKeys = ctExistingVisitKeys();
  const invoiceKeys = ctExistingBillingKeys();
  return ctContractList()
    .map(c => Object.assign(ctPlan(c, { now, existingJobKeys: visitKeys, existingInvoiceKeys: invoiceKeys }), { contract: c }))
    .filter(p => !p.isEmpty);
}

function ctPendingTotals(plans) {
  return (plans || []).reduce((acc, p) => ({
    visits: acc.visits + p.visits.length,
    invoices: acc.invoices + p.billing.length,
    addons: acc.addons + (p.billing.length ? p.addons.length : 0),
  }), { visits: 0, invoices: 0, addons: 0 });
}

// ── Building records ────────────────────────────────────────────────────────

// A visit job, shaped exactly like one the job modal would create so every
// existing feature — schedule, map, photos, time, costing — treats it normally.
function ctBuildVisitJob(contract, period) {
  const cust = (typeof S !== 'undefined' && S.customers && S.customers[contract.customerId]) || {};
  const address = ctStr(cust.address);
  return {
    id: typeof uid === 'function' ? uid() : 'j_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    name: ctGeneratedName(contract, period.date, contract.visits),
    status: 'active',
    stage: '',
    type: '',
    assigned: '',
    address: address,
    startDate: period.dateKey,
    dueDate: period.dateKey,
    value: '',
    description: contract.notes || '',
    customerName: ctStr(cust.name),
    customerPhone: ctStr(cust.phone),
    customerEmail: ctStr(cust.email),
    billingAddress: address,
    leadSource: '',
    progress: 0,
    notes: [], photos: [], dailyLogs: [], documents: [], comms: [],
    // The contract's checklist becomes this visit's tasks, in the same shape
    // the job detail's task list already creates and ticks off. That is the
    // whole point of defining scope on the contract: a generated visit arrives
    // knowing what the work is, instead of as a name and a date that whoever
    // opens it on a dock has to interpret.
    //
    // Copied, not referenced. Editing the contract later must not rewrite what
    // a crew already ticked off on a visit they have done.
    tasks: (contract.checklist || []).map(item => ({
      text: item.text, due: '', assigned: '', done: false, user: '', time: Date.now(),
    })),
    created: Date.now(),
    geocodeStatus: address ? 'pending' : 'none',
    // Provenance, and the idempotency stamp.
    contractId: contract.id,
    periodKey: period.key,
  };
}

// The standing job that holds a contract's invoices.
function ctBuildBillingJob(contract) {
  const cust = (typeof S !== 'undefined' && S.customers && S.customers[contract.customerId]) || {};
  const address = ctStr(cust.address);
  return {
    id: ctBillingJobId(contract),
    name: (contract.name || 'Contract') + ' — Agreement',
    status: 'active',
    stage: '', type: '', assigned: '',
    address: address,
    startDate: contract.startDate,
    dueDate: contract.endDate || '',
    value: '',
    description: 'Recurring billing for this agreement. Invoices raised by the contract land here.',
    customerName: ctStr(cust.name),
    customerPhone: ctStr(cust.phone),
    customerEmail: ctStr(cust.email),
    billingAddress: address,
    leadSource: '',
    progress: 0,
    notes: [], photos: [], tasks: [], dailyLogs: [], documents: [], comms: [], invoices: [],
    created: Date.now(),
    geocodeStatus: 'none',
    contractId: contract.id,
  };
}

// One recurring invoice, plus any add-ons waiting to ride along.
//
// Always created as a DRAFT. Generation raises paperwork; a person still decides
// what gets sent to a customer.
function ctBuildInvoice(contract, period, addons, invoiceId) {
  const b = contract.billing || {};
  const items = (b.items && b.items.length)
    ? b.items.map(it => ({ desc: it.desc, qty: it.qty || 1, rate: it.rate }))
    : [{ desc: ctGeneratedName(contract, period.date, b), qty: 1, rate: Number(b.amount || 0) }];

  (addons || []).forEach(a => {
    items.push({ desc: a.desc || 'Additional work', qty: 1, rate: Number(a.amount || 0) });
  });

  const due = ctParseDate(period.date) || new Date();
  const dueDate = ctAddDays(due, 30);
  const company = (typeof COMPANY !== 'undefined' && COMPANY) || {};

  return {
    id: invoiceId,
    number: typeof nextInvoiceNumber === 'function' ? nextInvoiceNumber() : 'INV-' + Date.now(),
    date: period.dateKey,
    dueDate: ctDateKey(dueDate),
    items: items,
    taxRate: company.taxRate || '',
    notes: '',
    terms: company.terms || '',
    photos: [],
    paid: 0,
    status: 'draft',
    created: Date.now(),
    contractId: contract.id,
    periodKey: period.key,
  };
}

// ── The run ─────────────────────────────────────────────────────────────────

// Create everything in `plans`. Returns a tally of what was written and what
// failed. Never throws: a single bad contract must not abandon the rest, and
// anything skipped is simply still pending on the next run.
async function ctRunGeneration(plans, opts) {
  const o = opts || {};
  const result = { visits: 0, invoices: 0, addons: 0, errors: [] };

  for (const plan of plans || []) {
    const contract = plan.contract || ctGetContract(plan.contractId);
    if (!contract) continue;

    for (const period of plan.visits) {
      try {
        await writeJob(ctBuildVisitJob(contract, period));
        result.visits++;
      } catch (e) {
        result.errors.push('Visit ' + period.dateKey + ' on ' + (contract.name || contract.id));
      }
    }

    if (!plan.billing.length) continue;

    // The container job is created once, on the first invoice this contract
    // ever raises.
    let billingJob = (typeof S !== 'undefined' && S.jobs && S.jobs[ctBillingJobId(contract)]) || null;
    if (!billingJob) {
      billingJob = ctBuildBillingJob(contract);
      try {
        await writeJob(billingJob);
      } catch (e) {
        result.errors.push('Could not open a billing job for ' + (contract.name || contract.id));
        continue;
      }
    }

    // Add-ons ride on the FIRST invoice of the run only — they are one-offs, not
    // something every period repeats.
    let addonsForRun = ctPendingAddons(contract);

    for (const period of plan.billing) {
      const invoiceId = 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const riders = addonsForRun;
      addonsForRun = [];

      try {
        // Stamp first — see the ordering note at the top of this file.
        for (const a of riders) await ctStampAddon(contract.id, a.id, invoiceId);

        const invoice = ctBuildInvoice(contract, period, riders, invoiceId);
        const job = S.jobs[billingJob.id];
        job.invoices = (job.invoices || []).concat([invoice]);
        await writeJob(job);

        result.invoices++;
        result.addons += riders.length;
      } catch (e) {
        result.errors.push('Invoice ' + period.dateKey + ' on ' + (contract.name || contract.id));
      }
    }
  }

  if (typeof logAct === 'function' && (result.visits || result.invoices)) {
    try { await logAct('generated contract work', result.visits + ' visits, ' + result.invoices + ' invoices'); } catch (e) {}
  }
  return result;
}

// ── Preview ─────────────────────────────────────────────────────────────────

function ctPlanRows(plans) {
  return (plans || []).map(p => {
    const c = p.contract;
    const bits = [];
    if (p.visits.length) {
      const dates = p.visits.map(v => v.dateKey);
      const shown = dates.slice(0, 6).join(', ') + (dates.length > 6 ? ` +${dates.length - 6} more` : '');
      bits.push(`<div style="font-size:12px;color:var(--text-2);margin-top:3px"><strong>${p.visits.length} visit${p.visits.length === 1 ? '' : 's'}</strong> — ${esc(shown)}</div>`);
    }
    if (p.billing.length) {
      const amount = Number((c.billing && c.billing.amount) || 0);
      bits.push(`<div style="font-size:12px;color:var(--text-2);margin-top:3px"><strong>${p.billing.length} invoice${p.billing.length === 1 ? '' : 's'}</strong> — ${esc(p.billing.map(b => b.dateKey).join(', '))}${amount ? ' · ' + money2(amount) + ' each' : ''}</div>`);
      if (p.addons.length) {
        bits.push(`<div style="font-size:12px;color:var(--orange);margin-top:3px">${p.addons.length} add-on${p.addons.length === 1 ? '' : 's'} (${money2(p.addonsTotal)}) added to the first invoice</div>`);
      }
    } else if (p.addons.length) {
      // Add-ons cannot be billed without a billing schedule to carry them.
      bits.push(`<div style="font-size:12px;color:var(--text-3);margin-top:3px">${p.addons.length} add-on${p.addons.length === 1 ? '' : 's'} waiting — this contract has no billing schedule to put them on.</div>`);
    }
    if (!bits.length) return '';
    return `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="font-weight:700;font-size:13.5px">${esc(c.name || 'Untitled contract')}</div>
      ${bits.join('')}
    </div>`;
  }).join('');
}

function openGeneratePreview(nowTs) {
  const plans = ctPendingWork(nowTs);
  const totals = ctPendingTotals(plans);
  const nothing = !totals.visits && !totals.invoices;

  const summary = nothing
    ? `<p style="font-size:13.5px;color:var(--text-2);line-height:1.6">Everything due has already been created. Visits are only scheduled as far as each customer has paid, so if you were expecting more, extend a contract's <strong>Visits paid through</strong> date.</p>`
    : `<p style="font-size:13.5px;color:var(--text-2);line-height:1.6;margin-bottom:4px">This will create
        <strong>${totals.visits} job${totals.visits === 1 ? '' : 's'}</strong> and
        <strong>${totals.invoices} invoice${totals.invoices === 1 ? '' : 's'}</strong>.
        Invoices are created as drafts — nothing is sent to anyone.</p>
      <div style="margin-top:10px">${ctPlanRows(plans)}</div>`;

  $('modal-root').innerHTML = `<div class="modal-bd" id="ctg-bd" role="dialog" aria-modal="true" aria-label="Generate contract work"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">${nothing ? 'Nothing Due' : 'Generate Due Work'}</div><button class="modal-close" id="ctg-close" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">${summary}</div>
    <div class="modal-foot">
      <button class="btn-cancel" id="ctg-cancel">${nothing ? 'Close' : 'Cancel'}</button>
      ${nothing ? '' : `<button class="btn-save" id="ctg-go">Create ${totals.visits + totals.invoices} record${totals.visits + totals.invoices === 1 ? '' : 's'}</button>`}
    </div>
  </div></div>`;

  $('ctg-close').onclick = $('ctg-cancel').onclick = closeModal;
  $('ctg-bd').onclick = e => { if (e.target === e.currentTarget) closeModal(); };

  if (nothing) return;

  $('ctg-go').onclick = async () => {
    const btn = $('ctg-go');
    btn.disabled = true;
    btn.textContent = 'Creating…';
    const r = await ctRunGeneration(plans, { now: nowTs });
    closeModal();
    if (typeof render === 'function') render();
    const made = [];
    if (r.visits) made.push(r.visits + ' job' + (r.visits === 1 ? '' : 's'));
    if (r.invoices) made.push(r.invoices + ' draft invoice' + (r.invoices === 1 ? '' : 's'));
    if (r.errors.length) toast('Created ' + (made.join(' and ') || 'nothing') + '; ' + r.errors.length + ' failed — press Generate again to retry', '');
    else toast('Created ' + (made.join(' and ') || 'nothing'));
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ctPeriodLabel, ctGeneratedName, ctBillingJobId,
    ctExistingVisitKeys, ctExistingBillingKeys, ctPendingWork, ctPendingTotals,
    ctBuildVisitJob, ctBuildBillingJob, ctBuildInvoice,
    ctRunGeneration, ctPlanRows, openGeneratePreview,
  };
}
