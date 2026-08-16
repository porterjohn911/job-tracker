// Managed entities — the editor and this view's handlers.
//
// Follows openContractForm() in shape: the same modal shell, the same form
// classes, a live hint under the fee fields, and handlers wired from one gated
// call rather than from the shared boot code.
//
// The fee section shows all four bases but only the fields belonging to the
// selected one, because a form that asks for a percentage AND an hourly rate
// AND a markup at the same time reads as four unfinished questions rather than
// one answered.
//
// Requires 03-entity-view.js.

const ME_FREQ_OPTIONS = [
  ['weekly', 'Weekly'],
  ['biweekly', 'Every 2 weeks'],
  ['monthly', 'Monthly'],
  ['quarterly', 'Quarterly'],
  ['annual', 'Annually'],
];

function meCompanySelect(id, selected) {
  const recs = Object.values((typeof COMPANIES !== 'undefined' && COMPANIES) || {})
    .filter(c => c && c.id && c.id !== ((typeof ACTIVE_CO !== 'undefined' && ACTIVE_CO.id) || ''))
    .sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));
  const opts = ['<option value="">— standalone, not in this app —</option>'].concat(
    recs.map(c => `<option value="${esc(c.id)}" ${selected === c.id ? 'selected' : ''}>${esc(c.label || c.id)}</option>`),
  );
  // A link pointing at a company that has since gone keeps its own option, so
  // opening the editor cannot silently clear it.
  if (selected && !recs.some(c => c.id === selected)) {
    opts.push(`<option value="${esc(selected)}" selected>${esc(selected)} — no longer in the switcher</option>`);
  }
  return `<select class="form-select" id="${id}">${opts.join('')}</select>`;
}

function meSelect(id, options, selected) {
  return `<select class="form-select" id="${id}">` +
    options.map(([v, l]) => `<option value="${v}" ${String(selected || '') === v ? 'selected' : ''}>${l}</option>`).join('') +
    '</select>';
}

// What this arrangement means, recomputed as the fields change. The point is
// the same as the contract editor's price guard: someone typing a fee should
// see what it comes to, and — just as importantly — be told immediately when it
// is a shape the app cannot yet work out, rather than discovering that later on
// an empty roster.
function meFeeHint(entity) {
  const f = meFee(entity);
  if (f.monthly != null) {
    return money2(f.monthly) + ' a month · ' + money2(f.annual) + ' a year.';
  }
  const needs = meNeedsLine(f);
  return needs + (f.estimate != null ? ' Roughly ' + money2(f.estimate) + ' on cached data — indicative only.' : '');
}

function meFeeFields(f) {
  const show = b => f.basis === b ? '' : 'display:none';
  return `
    <div id="me-fee-flat" style="${show('flat')}">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Amount</label><input class="form-input" type="number" min="0" step="0.01" id="me-amount" value="${esc(String(f.amount || ''))}" placeholder="2500.00"></div>
        <div class="form-group"><label class="form-label">Every</label>${meSelect('me-freq', ME_FREQ_OPTIONS, f.freq)}</div>
      </div>
    </div>

    <div id="me-fee-percent" style="${show('percent')}">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Percentage</label><input class="form-input" type="number" min="0" max="49" step="0.1" id="me-percent" value="${esc(String(f.percent || ''))}" placeholder="6"></div>
        <div class="form-group"><label class="form-label">Of</label>${meSelect('me-percent-of', [['collected', 'What they collect'], ['invoiced', 'What they invoice']], f.percentOf)}</div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Floor <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-3);font-size:11px">optional</span></label><input class="form-input" type="number" min="0" step="0.01" id="me-floor" value="${esc(String(f.floor || ''))}" placeholder="2000.00"></div>
        <div class="form-group"><label class="form-label">Cap <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-3);font-size:11px">optional</span></label><input class="form-input" type="number" min="0" step="0.01" id="me-cap" value="${esc(String(f.cap || ''))}" placeholder=""></div>
      </div>
    </div>

    <div id="me-fee-costplus" style="${show('costplus')}">
      <div class="form-group"><label class="form-label">Markup %</label><input class="form-input" type="number" min="0" max="499" step="0.1" id="me-markup" value="${esc(String(f.markup || ''))}" placeholder="15"></div>
    </div>

    <div id="me-fee-hourly" style="${show('hourly')}">
      <div class="form-group"><label class="form-label">Rate an hour</label><input class="form-input" type="number" min="0" step="0.01" id="me-rate" value="${esc(String(f.rate || ''))}" placeholder="95.00"></div>
    </div>`;
}

function openEntityForm(seed) {
  const e = meNormalize(seed) || meNewEntity();
  const isEdit = !!(seed && seed.id && meGet(seed.id));
  const f = e.fee;

  $('modal-root').innerHTML = `<div class="modal-bd" id="me-bd" role="dialog" aria-modal="true" aria-label="Managed entity"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">${isEdit ? 'Edit Entity' : 'New Entity'}</div><button class="modal-close" id="me-close" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="me-name" value="${esc(e.name)}" placeholder="Waterfront Dock Services"></div>

      <div class="form-group"><label class="form-label">Company in this app</label>${meCompanySelect('me-company', e.companyId)}</div>
      <div class="tt-hint" style="margin-top:-4px">Link it and its own numbers can eventually drive the fee. Leave it standalone for a business whose books are kept elsewhere.</div>

      <div class="form-row" style="margin-top:12px">
        <div class="form-group"><label class="form-label">Status</label>${meSelect('me-status', [['paused', 'Paused — not billing'], ['active', 'Active'], ['ended', 'Ended']], e.status)}</div>
        <div class="form-group"><label class="form-label">Starts</label><input class="form-input" type="date" id="me-start" value="${esc(e.startDate)}"></div>
      </div>
      <div class="form-group"><label class="form-label">Ends <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-3);font-size:11px">optional</span></label><input class="form-input" type="date" id="me-end" value="${esc(e.endDate)}"></div>

      <div class="section-hd" style="margin-top:6px">Management fee</div>
      <div class="form-group"><label class="form-label">Basis</label>${meSelect('me-basis', [['flat', 'Flat amount'], ['percent', 'Percentage of their revenue'], ['costplus', 'Cost plus a markup'], ['hourly', 'Hourly']], f.basis)}</div>
      ${meFeeFields(f)}
      <div class="tt-hint" id="me-fee-hint" style="margin-top:-4px">${esc(meFeeHint(e))}</div>

      <div class="section-hd" style="margin-top:10px">Contact</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="me-contact-name" value="${esc(e.contactName)}"></div>
        <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="me-contact-phone" value="${esc(e.contactPhone)}"></div>
      </div>
      <div class="form-group"><label class="form-label">Email</label><input class="form-input" type="email" id="me-contact-email" value="${esc(e.contactEmail)}"></div>

      <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="me-notes" placeholder="Anything about this arrangement worth writing down…">${esc(e.notes)}</textarea></div>
    </div>
    <div class="modal-foot">
      ${isEdit ? `<button class="btn-delete" id="me-del">Delete</button>` : ''}
      <button class="btn-cancel" id="me-cancel">Cancel</button>
      <button class="btn-save" id="me-save">${isEdit ? 'Save' : 'Create Entity'}</button>
    </div>
  </div></div>`;

  $('me-close').onclick = $('me-cancel').onclick = closeModal;
  $('me-bd').onclick = ev => { if (ev.target === ev.currentTarget) closeModal(); };

  // Only the selected basis's fields are shown, and the hint recomputes from
  // the form rather than the saved record so it tracks unsaved edits.
  const refresh = () => {
    const basis = $('me-basis').value;
    ['flat', 'percent', 'costplus', 'hourly'].forEach(b => {
      const el = $('me-fee-' + b);
      if (el) el.style.display = b === basis ? '' : 'none';
    });
    const hint = $('me-fee-hint');
    if (hint) hint.textContent = meFeeHint(meNormalize(meReadForm(e)) || e);
  };
  ['me-basis', 'me-amount', 'me-freq', 'me-percent', 'me-percent-of', 'me-floor', 'me-cap',
    'me-markup', 'me-rate', 'me-company'].forEach(id => {
    $(id)?.addEventListener('input', refresh);
    $(id)?.addEventListener('change', refresh);
  });

  $('me-save').onclick = async () => {
    const next = meReadForm(e);
    if (!meStr(next.name)) { toast('Give the entity a name', ''); return; }
    let saved;
    try {
      saved = await meSave(next);
    } catch (err) {
      // meWrite has already said what went wrong. The modal stays open so the
      // work is not lost behind a record that is about to be reverted.
      return;
    }
    if (!saved) { toast('Could not save that entity', ''); return; }
    closeModal();
    if (typeof render === 'function') render();
    if (next.status === 'active' && saved.status !== 'active') toast('Saved, but held as paused — check the dates', '');
    else toast('Entity saved');
  };

  if (isEdit) {
    $('me-del').onclick = async () => {
      if (!confirm('Delete this entity? Nothing it is linked to is touched.')) return;
      try {
        await meDelete(e.id);
      } catch (err) {
        return;
      }
      closeModal();
      if (S.meDetail === e.id) S.meDetail = null;
      if (typeof render === 'function') render();
      toast('Entity deleted');
    };
  }
}

// Read the form back. Returns a plain object; the store normalizes it.
function meReadForm(base) {
  const val = id => { const el = $(id); return el ? String(el.value || '').trim() : ''; };
  const num = id => Number(val(id)) || 0;
  return Object.assign({}, base, {
    name: val('me-name'),
    companyId: val('me-company'),
    status: val('me-status'),
    startDate: val('me-start'),
    endDate: val('me-end'),
    contactName: val('me-contact-name'),
    contactEmail: val('me-contact-email'),
    contactPhone: val('me-contact-phone'),
    // Every basis is carried, not just the selected one, so switching between
    // them and back does not lose what was already typed.
    fee: {
      basis: val('me-basis'),
      amount: num('me-amount'),
      freq: val('me-freq') || 'monthly',
      interval: 1,
      percent: num('me-percent'),
      percentOf: val('me-percent-of') || 'collected',
      floor: num('me-floor'),
      cap: num('me-cap'),
      markup: num('me-markup'),
      rate: num('me-rate'),
    },
    notes: val('me-notes'),
  });
}

// ── Handlers ────────────────────────────────────────────────────────────────

function attachEntityHandlers() {
  if (typeof meWireData === 'function') meWireData();

  $('me-search')?.addEventListener('input', ev => {
    S.meSearch = ev.target.value;
    if (typeof render === 'function') render();
  });

  $('btn-me-add')?.addEventListener('click', () => openEntityForm(meNewEntity()));

  document.querySelectorAll('[data-me]').forEach(el => {
    el.onclick = () => {
      if (!meGet(el.dataset.me)) return;
      S.meDetail = el.dataset.me;
      if (typeof render === 'function') render();
    };
  });

  document.querySelector('[data-me-back]')?.addEventListener('click', () => {
    S.meDetail = null;
    if (typeof render === 'function') render();
  });

  $('btn-me-edit')?.addEventListener('click', () => {
    const rec = meGet(S.meDetail);
    if (rec) openEntityForm(rec);
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ME_FREQ_OPTIONS, meCompanySelect, meFeeHint, meFeeFields,
    openEntityForm, meReadForm, attachEntityHandlers,
  };
}
