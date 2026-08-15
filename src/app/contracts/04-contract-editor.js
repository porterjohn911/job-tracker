// Recurring contracts — the editor modal and this tab's handlers.
//
// The modal markup follows openCustomerForm() in views/07-customers.js — the
// same .modal-bd / .modal / .modal-head / .modal-body / .modal-foot shell and
// the same form classes — so it behaves like every other sheet in the app.
//
// Handlers live here rather than in boot/ so the feature stays self-contained;
// boot/06-attach-handlers.js makes one gated call into attachContractHandlers().
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

// Live feedback under the paid-through field: exactly what that date buys.
// Entering a date is otherwise an act of faith — "does 2027-08-01 mean twelve
// visits or thirteen?" is the question this answers before anything is saved.
function ctVisitCountHint(c) {
  if (!c.visits) return 'Pick a visit frequency first.';
  if (!c.visitsThrough) return 'No visits are scheduled until you set how far ahead the customer has paid.';
  const periods = ctVisitPeriods(c, Date.now());
  if (!periods.length) return 'That date is before the first visit — no visits fall inside it.';
  const first = periods[0], last = periods[periods.length - 1];
  return periods.length + ' visit' + (periods.length === 1 ? '' : 's') + ', ' +
    first.dateKey + ' through ' + last.dateKey + '. Push this date out when they renew.';
}

// The scope of work. Editable only in the contract, so a crew cannot quietly
// change what the agreement promises — they tick items off on the visit.
function ctChecklistRows(c) {
  const items = c.checklist || [];
  if (!items.length) return `<p style="font-size:12.5px;color:var(--text-3);margin:0 0 8px">Nothing yet. Add what a crew does on each visit — it lands on every generated job as a task list.</p>`;
  return items.map((it, i) => `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
    <span style="font-size:11px;color:var(--text-3);min-width:18px;flex-shrink:0">${i + 1}.</span>
    <div style="flex:1;min-width:0;font-size:13px">${esc(it.text)}</div>
    <button class="btn-remove" data-ct-check-rm="${esc(it.id)}" aria-label="Remove checklist item">Remove</button>
  </div>`).join('');
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
      <div class="form-group"><label class="form-label">Visits paid through</label><input class="form-input" type="date" id="ct-visits-through" value="${esc(c.visitsThrough)}"></div>
      <div class="tt-hint" id="ct-visits-count" style="margin-top:-4px">${ctVisitCountHint(c)}</div>

      <div class="section-hd" style="margin-top:10px">Checklist <span>copied onto every visit</span></div>
      <div id="ct-check-rows" style="margin-bottom:8px">${ctChecklistRows(c)}</div>
      <div style="display:flex;gap:8px;align-items:flex-end">
        <div class="form-group" style="flex:1;margin-bottom:0"><input class="form-input" id="ct-check-text" placeholder="Check anodes and hardware"></div>
        <button class="btn-cancel" id="ct-check-add" style="flex-shrink:0">Add</button>
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

  // Recompute the visit count as the schedule or the paid-through date change,
  // reading the form rather than the saved record so it tracks unsaved edits.
  const refreshCount = () => {
    const el = $('ct-visits-count');
    if (el) el.textContent = ctVisitCountHint(ctNormalizeContract(ctReadContractForm(c)) || c);
  };
  ['ct-visits-through', 'ct-visit-freq', 'ct-visit-interval', 'ct-start'].forEach(id => {
    $(id)?.addEventListener('change', refreshCount);
  });

  // Checklist edits happen against the in-memory record and redraw only their
  // own rows. Round-tripping through a save would lose whatever else is typed
  // in the form, and would not work at all on a contract that has never been
  // saved — where writing the scope down is most natural.
  const redrawChecklist = () => {
    const rows = $('ct-check-rows');
    if (!rows) return;
    rows.innerHTML = ctChecklistRows(c);
    rows.querySelectorAll('[data-ct-check-rm]').forEach(btn => {
      btn.onclick = () => {
        c.checklist = (c.checklist || []).filter(it => it.id !== btn.dataset.ctCheckRm);
        redrawChecklist();
      };
    });
  };
  const addChecklistItem = () => {
    const input = $('ct-check-text');
    const text = (input.value || '').trim();
    if (!text) return;
    c.checklist = (c.checklist || []).concat([{ id: ctNewCheckId(), text: text.slice(0, 200) }]);
    input.value = '';
    input.focus();
    redrawChecklist();
  };
  $('ct-check-add')?.addEventListener('click', addChecklistItem);
  // Enter adds an item rather than submitting, so a whole scope can be typed
  // without reaching for the mouse between lines.
  $('ct-check-text')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(); }
  });
  redrawChecklist();

  $('ct-save').onclick = async () => {
    const next = ctReadContractForm(c);
    if (!next.name) { toast('Give the contract a name', ''); return; }
    // A rejected sync write throws. The modal stays open so the work is not
    // lost, and ctWriteContract has already said what went wrong — closing here
    // would leave a contract on screen that is about to be reverted by the
    // sync listener, which is what "it saved and then disappeared" looks like.
    let saved;
    try {
      saved = await ctSaveContract(next);
    } catch (e) {
      return;
    }
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
      try {
        await ctDeleteContract(c.id);
      } catch (e) {
        return;
      }
      closeModal();
      // Leave the account page if it was showing the contract just deleted.
      if (S.ctDetail === c.id) S.ctDetail = null;
      if (typeof render === 'function') render();
      toast('Contract deleted');
    };

    $('ct-addon-add').onclick = async () => {
      const desc = ($('ct-addon-desc').value || '').trim();
      const amount = Number($('ct-addon-amount').value || 0);
      if (!desc && !amount) { toast('Add a description or an amount', ''); return; }
      // Save the form first so edits in progress are not lost behind the reopen.
      try {
        await ctSaveContract(ctReadContractForm(c));
        await ctAddAddon(c.id, { desc: desc, amount: amount, date: ctDateKey(new Date()) });
      } catch (e) {
        return;
      }
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
        try {
          await ctSaveContract(Object.assign({}, cur, { addons: addons }));
        } catch (e) {
          return;
        }
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
    visitsThrough: val('ct-visits-through'),
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

  $('btn-ct-generate')?.addEventListener('click', () => {
    if (typeof openGeneratePreview === 'function') openGeneratePreview();
  });

  // A card opens the account page, not the editor. Editing is one of several
  // things you might want to do with a contract, and rarely the first — the
  // questions that come up daily are "is this making money" and "when does it
  // renew", which live on the detail view.
  document.querySelectorAll('[data-ct]').forEach(el => {
    el.onclick = () => {
      if (!ctGetContract(el.dataset.ct)) return;
      S.ctDetail = el.dataset.ct;
      if (typeof render === 'function') render();
    };
  });

  document.querySelector('[data-ct-back]')?.addEventListener('click', () => {
    S.ctDetail = null;
    if (typeof render === 'function') render();
  });

  $('btn-ct-edit')?.addEventListener('click', () => {
    const rec = ctGetContract(S.ctDetail);
    if (rec) openContractForm(rec);
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ctFreqSelect, ctStatusSelect, ctCustomerSelect, ctAddonRows, ctIssueBanner,
    openContractForm, ctReadContractForm, attachContractHandlers,
  };
}
