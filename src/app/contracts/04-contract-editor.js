// Recurring contracts — the editor modal and this tab's handlers.
//
// NOT LOADED BY index.html. Held out of the app's script list until the feature
// is finished; scripts/check-static.mjs fails the build if it appears there.
//
// The modal markup follows openCustomerForm() in views/07-customers.js — the
// same .modal-bd / .modal / .modal-head / .modal-body / .modal-foot shell and
// the same form classes — so it behaves like every other sheet in the app.
//
// Handlers live here rather than in boot/ for now. boot/ IS loaded by
// index.html, and nothing about this feature may touch a file the live app
// runs until it is finished. PR 5 adds the one call that invokes
// attachContractHandlers().
//
// Requires 01-contract-periods.js, 02-contract-store.js, 03-contract-list.js.

const CT_FREQ_OPTIONS = [
  ['', 'None'],
  ['weekly', 'Weekly'],
  ['biweekly', 'Every 2 weeks'],
  ['monthly', 'Monthly'],
  ['quarterly', 'Quarterly'],
  ['annual', 'Annually'],
];

function ctFreqSelect(id, selected) {
  const opts = CT_FREQ_OPTIONS
    .map(([v, l]) => `<option value="${v}" ${String(selected || '') === v ? 'selected' : ''}>${l}</option>`)
    .join('');
  return `<select class="form-select" id="${id}">${opts}</select>`;
}

function ctStatusSelect(id, selected) {
  // Paused first: it is the safe default and the one the editor opens on for a
  // new contract, so it should be what the eye lands on.
  return `<select class="form-select" id="${id}">` +
    [['paused', 'Paused — nothing generates'], ['active', 'Active — generating'], ['ended', 'Ended']]
      .map(([v, l]) => `<option value="${v}" ${selected === v ? 'selected' : ''}>${l}</option>`)
      .join('') + '</select>';
}

function ctCustomerSelect(id, selected) {
  const recs = Object.values((typeof S !== 'undefined' && S.customers) || {})
    .filter(r => r && r.id)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  const opts = ['<option value="">— none —</option>'].concat(
    recs.map(r => `<option value="${esc(r.id)}" ${selected === r.id ? 'selected' : ''}>${esc(r.name || r.id)}</option>`),
  ).join('');
  return `<select class="form-select" id="${id}">${opts}</select>`;
}

// The add-on rows inside the editor. Billed ones stay visible with the invoice
// that charged them, because "has this already been billed?" is the question
// this list exists to answer.
function ctAddonRows(c) {
  const all = Object.values(c.addons || {}).sort((a, b) =>
    String(a.date || '').localeCompare(String(b.date || '')) || a.id.localeCompare(b.id));
  if (!all.length) return `<p style="font-size:12.5px;color:var(--text-3);margin:0">Nothing extra billed on this contract yet.</p>`;
  return all.map(a => {
    const billed = !!a.billedInvoiceId;
    return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(a.desc || 'Add-on')}</div>
        <div style="font-size:11.5px;color:var(--text-3)">${esc(a.date || 'no date')}${billed ? ' · billed on ' + esc(a.billedInvoiceId) : ' · not yet billed'}</div>
      </div>
      <div style="font-size:13px;font-weight:700;flex-shrink:0;color:${billed ? 'var(--text-3)' : 'var(--text)'}">${money2(a.amount)}</div>
      ${billed ? '' : `<button class="btn-remove" data-ct-addon-rm="${esc(a.id)}" aria-label="Remove add-on">Remove</button>`}
    </div>`;
  }).join('');
}

function ctIssueBanner(c) {
  const issues = ctContractIssues(c);
  if (!issues.length) return '';
  return `<div style="background:rgba(234,140,20,0.10);border:1px solid var(--orange);border-radius:8px;padding:9px 11px;margin-bottom:12px">
    <div style="font-size:12px;font-weight:700;color:var(--orange);margin-bottom:3px">This contract will not do what you expect</div>
    <ul style="margin:0;padding-left:16px;font-size:12px;color:var(--text-2);line-height:1.55">
      ${issues.map(i => `<li>${esc(i)}</li>`).join('')}
    </ul>
  </div>`;
}

// ── Editor ──────────────────────────────────────────────────────────────────

function openContractForm(seed) {
  const c = ctNormalizeContract(seed) || ctNewContract();
  const isEdit = !!(seed && seed.id && ctGetContract(seed.id));
  const v = c.visits || {}, b = c.billing || {};

  $('modal-root').innerHTML = `<div class="modal-bd" id="ct-bd" role="dialog" aria-modal="true" aria-label="Contract"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">${isEdit ? 'Edit Contract' : 'New Contract'}</div><button class="modal-close" id="ct-close" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      ${ctIssueBanner(c)}
      <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="ct-name" value="${esc(c.name)}" placeholder="Monthly dock maintenance"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Customer</label>${ctCustomerSelect('ct-customer', c.customerId)}</div>
        <div class="form-group"><label class="form-label">Status</label>${ctStatusSelect('ct-status', c.status)}</div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Starts</label><input class="form-input" type="date" id="ct-start" value="${esc(c.startDate)}"></div>
        <div class="form-group"><label class="form-label">Ends <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-3);font-size:11px">optional</span></label><input class="form-input" type="date" id="ct-end" value="${esc(c.endDate)}"></div>
      </div>

      <div class="section-hd" style="margin-top:6px">Visits <span>creates a job each time</span></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Frequency</label>${ctFreqSelect('ct-visit-freq', v.freq)}</div>
        <div class="form-group"><label class="form-label">Every</label><input class="form-input" type="number" min="1" step="1" id="ct-visit-interval" value="${esc(String(v.interval || 1))}"></div>
      </div>

      <div class="section-hd" style="margin-top:6px">Billing <span>creates an invoice each time</span></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Frequency</label>${ctFreqSelect('ct-bill-freq', b.freq)}</div>
        <div class="form-group"><label class="form-label">Every</label><input class="form-input" type="number" min="1" step="1" id="ct-bill-interval" value="${esc(String(b.interval || 1))}"></div>
      </div>
      <div class="form-group"><label class="form-label">Amount per bill</label><input class="form-input" type="number" min="0" step="0.01" id="ct-bill-amount" value="${esc(String(b.amount || ''))}" placeholder="0.00"></div>

      ${isEdit ? `<div class="section-hd" style="margin-top:6px">Add-ons <span>billed on top, whenever</span></div>
      <div style="margin-bottom:10px">${ctAddonRows(c)}</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Description</label><input class="form-input" id="ct-addon-desc" placeholder="Emergency callout"></div>
        <div class="form-group"><label class="form-label">Amount</label><input class="form-input" type="number" min="0" step="0.01" id="ct-addon-amount" placeholder="0.00"></div>
      </div>
      <button class="btn-cancel" id="ct-addon-add" style="width:100%;margin-bottom:4px">Add add-on</button>` : ''}

      <div class="form-group" style="margin-top:12px"><label class="form-label">Notes</label><textarea class="form-textarea" id="ct-notes" placeholder="Anything the team should know about this agreement…">${esc(c.notes)}</textarea></div>
    </div>
    <div class="modal-foot">
      ${isEdit ? `<button class="btn-delete" id="ct-del">Delete</button>` : ''}
      <button class="btn-cancel" id="ct-cancel">Cancel</button>
      <button class="btn-save" id="ct-save">${isEdit ? 'Save' : 'Create Contract'}</button>
    </div>
  </div></div>`;

  $('ct-close').onclick = $('ct-cancel').onclick = closeModal;
  $('ct-bd').onclick = e => { if (e.target === e.currentTarget) closeModal(); };

  $('ct-save').onclick = async () => {
    const next = ctReadContractForm(c);
    if (!next.name) { toast('Give the contract a name', ''); return; }
    const saved = await ctSaveContract(next);
    if (!saved) { toast('Could not save that contract', ''); return; }
    closeModal();
    if (typeof render === 'function') render();
    // Normalization can refuse the requested status — a contradictory contract
    // is parked rather than left billing. Say so instead of letting the user
    // walk away believing it is running.
    if (next.status === 'active' && saved.status !== 'active') toast('Saved, but held as paused — check the dates', '');
    else toast(saved.status === 'active' ? 'Contract saved and active' : 'Contract saved');
  };

  if (isEdit) {
    $('ct-del').onclick = async () => {
      if (!confirm('Delete this contract? Jobs and invoices it already created are kept.')) return;
      await ctDeleteContract(c.id);
      closeModal();
      if (typeof render === 'function') render();
      toast('Contract deleted');
    };

    $('ct-addon-add').onclick = async () => {
      const desc = ($('ct-addon-desc').value || '').trim();
      const amount = Number($('ct-addon-amount').value || 0);
      if (!desc && !amount) { toast('Add a description or an amount', ''); return; }
      // Save the form first so edits in progress are not lost behind the reopen.
      await ctSaveContract(ctReadContractForm(c));
      await ctAddAddon(c.id, { desc: desc, amount: amount, date: ctDateKey(new Date()) });
      openContractForm(ctGetContract(c.id));
      toast('Add-on added');
    };

    document.querySelectorAll('[data-ct-addon-rm]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.ctAddonRm;
        const cur = ctGetContract(c.id);
        if (!cur || !cur.addons[id]) return;
        // Billed add-ons have no Remove button; guard anyway so a stale DOM
        // cannot delete the record of something already charged.
        if (cur.addons[id].billedInvoiceId) { toast('That add-on has already been billed', ''); return; }
        const addons = Object.assign({}, cur.addons);
        delete addons[id];
        await ctSaveContract(Object.assign({}, cur, { addons: addons }));
        openContractForm(ctGetContract(c.id));
      };
    });
  }
}

// Read the form back into a contract record. Returns a plain object; the store
// normalizes it, so this only has to gather values.
function ctReadContractForm(base) {
  const val = id => { const el = $(id); return el ? String(el.value || '').trim() : ''; };
  const sched = (freqId, intervalId) => {
    const freq = val(freqId);
    if (!freq) return null;
    const n = parseInt(val(intervalId), 10);
    return { freq: freq, interval: Number.isInteger(n) && n >= 1 ? n : 1 };
  };
  const billing = sched('ct-bill-freq', 'ct-bill-interval');
  return Object.assign({}, base, {
    name: val('ct-name'),
    customerId: val('ct-customer'),
    status: val('ct-status'),
    startDate: val('ct-start'),
    endDate: val('ct-end'),
    visits: sched('ct-visit-freq', 'ct-visit-interval'),
    billing: billing ? Object.assign(billing, { amount: Number(val('ct-bill-amount')) || 0 }) : null,
    notes: val('ct-notes'),
  });
}

// ── Handlers for the Contracts tab ──────────────────────────────────────────
// Same shape as attachCustomerHandlers(): wire only this view's own elements
// and attach the feature's sync listener from within its own tab.

function attachContractHandlers() {
  if (typeof ctWireContractsData === 'function') ctWireContractsData();

  $('ct-search')?.addEventListener('input', e => {
    S.ctSearch = e.target.value;
    if (typeof render === 'function') render();
  });

  $('btn-ct-add')?.addEventListener('click', () => openContractForm(ctNewContract()));

  document.querySelectorAll('[data-ct]').forEach(el => {
    el.onclick = () => {
      const rec = ctGetContract(el.dataset.ct);
      if (rec) openContractForm(rec);
    };
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ctFreqSelect, ctStatusSelect, ctCustomerSelect, ctAddonRows, ctIssueBanner,
    openContractForm, ctReadContractForm, attachContractHandlers,
  };
}
