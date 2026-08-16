// Recurring contracts — drafting, sending and accepting a proposal.
//
// The editor is deliberately thin. Almost everything a proposal says comes from
// the contract, so this only asks for the three things that exist nowhere else:
// the opening line, what is NOT included, and the terms. Everything else — the
// scope, the schedule, the dates, the price — is read from the contract, which
// is what stops a signed proposal from promising something the contract will
// not then generate.
//
// Requires 13-proposal.js and 14-proposal-doc.js.

// ── The account-page section ────────────────────────────────────────────────

function ctProposalTone(level) {
  return {
    accepted: 'var(--green-700)',
    sent: 'var(--text-2)',
    expired: 'var(--orange)',
    declined: 'var(--orange)',
  }[level] || 'var(--text-3)';
}

function ctProposalSection(contract, nowTs) {
  const state = ctProposalState(contract, nowTs);
  const p = contract.proposal;
  const tone = ctProposalTone(state.level);

  if (!p) {
    return `<div class="section">
      <div class="section-hd">Proposal <span>none yet</span></div>
      <div style="font-size:12.5px;color:var(--text-2);line-height:1.6;margin-bottom:10px">
        A proposal turns this contract into something a customer can read and agree to — the scope, the visit dates, the price and the terms, in one document. It is built from the contract, so it can only ever promise what this contract will actually do.
      </div>
      <button class="btn-cancel" id="btn-ct-prop-new" style="width:100%">Draft a proposal</button>
    </div>`;
  }

  const accepted = state.level === 'accepted';
  return `<div class="section">
    <div class="section-hd">Proposal <span style="color:${tone}">${esc(state.label)}</span></div>
    <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px">
      <div style="font-size:14px;font-weight:700">${esc(p.number || 'Proposal')}</div>
      <div style="font-size:12px;color:var(--text-3)">${esc(state.detail)}</div>
    </div>
    ${accepted && contract.status !== 'active'
      ? `<div style="font-size:12px;color:var(--orange);line-height:1.5;margin:6px 0">Accepted, but the contract is ${esc(contract.status)} — check the dates, because nothing will generate until it is active.</div>`
      : ''}
    <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px">
      <button class="btn-cancel" id="btn-ct-prop-edit">Edit</button>
      <button class="btn-cancel" id="btn-ct-prop-preview">Preview</button>
      <button class="btn-cancel" id="btn-ct-prop-pdf">Download PDF</button>
      ${accepted ? '' : `<button class="btn-add" id="btn-ct-prop-send">${p.sentAt ? 'Send again' : 'Send'}</button>`}
    </div>
    ${accepted ? '' : `<div style="display:flex;gap:7px;margin-top:7px">
      <button class="btn-cancel" id="btn-ct-prop-accept" style="flex:1;color:var(--green-700)">Mark accepted</button>
      <button class="btn-cancel" id="btn-ct-prop-decline" style="flex:1">Mark declined</button>
    </div>`}
  </div>`;
}

// ── The editor ──────────────────────────────────────────────────────────────

// What the contract bills, next to what it would need to bill to hit the target
// margin. Shown while drafting because that is the only moment the number can
// still be changed — after it is signed you are looking at it for a year.
//
// The margin figures are for the person drafting. They are read here and never
// passed to the document builder, which does not touch contract.pricing at all.
function ctProposalPriceGuard(contract) {
  if (!contract.billing) return '';
  const est = typeof ctPricingEstimate === 'function' ? ctPricingEstimate(contract) : null;
  const now = money2(contract.billing.amount || 0);
  if (!est || est.suggestedPerBill == null) {
    return `<div class="tt-hint" style="margin-top:-4px">This contract bills ${esc(now)} per period. Add an estimate on the contract to see what that needs to be for your target margin.</div>`;
  }
  const target = est.suggestedPerBill;
  const short = target > (contract.billing.amount || 0) + 0.005;
  return `<div class="tt-hint" style="margin-top:-4px${short ? ';color:var(--orange)' : ''}">
    Billing ${esc(now)} per period. At your ${esc(String(est.targetMargin))}% target this needs ${esc(money2(target))}${short ? ' — you are under by ' + esc(money2(target - (contract.billing.amount || 0))) + '. Change it on the contract before you send.' : '. You are covered.'}
  </div>`;
}

function openProposalEditor(contractId) {
  const c = ctGetContract(contractId);
  if (!c) return;
  const p = c.proposal || ctNewProposal();
  const state = ctProposalState(c);

  $('modal-root').innerHTML = `<div class="modal-bd" id="cp-bd" role="dialog" aria-modal="true" aria-label="Proposal"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Proposal</div><button class="modal-close" id="cp-close" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      <div style="font-size:12.5px;color:var(--text-2);line-height:1.6;margin-bottom:12px">
        The scope, visit dates, term and price all come from the contract itself — edit those on the contract. What goes here is everything a customer needs that the contract does not already say.
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Number</label><input class="form-input" id="cp-number" value="${esc(p.number)}"></div>
        <div class="form-group"><label class="form-label">Valid until</label><input class="form-input" type="date" id="cp-valid" value="${esc(p.validUntil)}"></div>
      </div>

      <div class="form-group"><label class="form-label">Opening line <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-3);font-size:11px">optional</span></label>
        <textarea class="form-textarea" id="cp-intro" placeholder="Leave blank for the standard opening.">${esc(p.intro)}</textarea></div>

      ${ctProposalPriceGuard(c)}

      <div class="form-group" style="margin-top:12px"><label class="form-label">What is not included</label>
        <textarea class="form-textarea" id="cp-excl" placeholder="One per line — storm damage, parts over $200, emergency callouts…">${esc(p.exclusions)}</textarea></div>
      <div class="tt-hint" style="margin-top:-4px">The scope says what is in. This says what is out, which is what disagreements are actually about.</div>

      <div class="form-group" style="margin-top:12px"><label class="form-label">Terms</label>
        <textarea class="form-textarea" id="cp-terms" style="min-height:140px">${esc(p.terms)}</textarea></div>
      <div class="tt-hint" style="margin-top:-4px">Starter wording seeded from your invoice terms in Settings. It is a plain-English starting point, not legal advice — have someone qualified read it before you rely on it.</div>
    </div>
    <div class="modal-foot">
      ${c.proposal ? `<button class="btn-delete" id="cp-del">Delete</button>` : ''}
      <button class="btn-cancel" id="cp-cancel">Cancel</button>
      <button class="btn-save" id="cp-save">Save</button>
    </div>
  </div></div>`;

  $('cp-close').onclick = $('cp-cancel').onclick = closeModal;
  $('cp-bd').onclick = e => { if (e.target === e.currentTarget) closeModal(); };

  $('cp-save').onclick = async () => {
    const next = Object.assign({}, c, {
      proposal: Object.assign({}, p, {
        number: ($('cp-number').value || '').trim(),
        validUntil: ($('cp-valid').value || '').trim(),
        intro: ($('cp-intro').value || '').trim(),
        exclusions: ($('cp-excl').value || '').trim(),
        terms: ($('cp-terms').value || '').trim(),
      }),
    });
    try {
      await ctSaveContract(next);
    } catch (e) {
      return;
    }
    closeModal();
    if (typeof render === 'function') render();
    toast('Proposal saved');
  };

  if (c.proposal) {
    $('cp-del').onclick = async () => {
      if (!confirm('Delete this proposal? The contract itself is not touched.')) return;
      try {
        await ctSaveContract(Object.assign({}, c, { proposal: null }));
      } catch (e) {
        return;
      }
      closeModal();
      if (typeof render === 'function') render();
      toast('Proposal deleted');
    };
  }
}

// A read-only look at exactly what the customer receives, rendered from the
// same blocks the email and the PDF use.
function openProposalPreview(contractId) {
  const c = ctGetContract(contractId);
  if (!c) return;
  $('modal-root').innerHTML = `<div class="modal-bd" id="cpv-bd" role="dialog" aria-modal="true" aria-label="Proposal preview"><div class="modal" style="max-width:680px"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">What they will see</div><button class="modal-close" id="cpv-close" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body" style="padding:0;background:#f0faf6">${ctProposalHTML(c)}</div>
    <div class="modal-foot"><button class="btn-cancel" id="cpv-cancel">Close</button></div>
  </div></div>`;
  $('cpv-close').onclick = $('cpv-cancel').onclick = closeModal;
  $('cpv-bd').onclick = e => { if (e.target === e.currentTarget) closeModal(); };
}

// ── Handlers ────────────────────────────────────────────────────────────────

function ctAttachProposalHandlers() {
  const id = () => (typeof S !== 'undefined' && S.ctDetail) || '';

  $('btn-ct-prop-new')?.addEventListener('click', async () => {
    const c = ctGetContract(id());
    if (!c) return;
    try {
      await ctSaveContract(Object.assign({}, c, { proposal: ctNewProposal() }));
    } catch (e) {
      return;
    }
    openProposalEditor(c.id);
  });

  $('btn-ct-prop-edit')?.addEventListener('click', () => openProposalEditor(id()));
  $('btn-ct-prop-preview')?.addEventListener('click', () => openProposalPreview(id()));

  $('btn-ct-prop-pdf')?.addEventListener('click', async () => {
    const c = ctGetContract(id());
    if (!c) return;
    toast('Building PDF…', '');
    try {
      const file = await ctBuildProposalPDF(c);
      savePdfFile(file);
      toast('Downloaded');
    } catch (e) {
      toast('Could not build the PDF: ' + ((e && e.message) || e), '');
    }
  });

  $('btn-ct-prop-send')?.addEventListener('click', async () => {
    const c = ctGetContract(id());
    if (!c) return;
    const m = ctProposalMeta(c);
    if (!confirm(`Email proposal ${m.number} to ${m.customerEmail || 'this customer'}?`)) return;
    const btn = $('btn-ct-prop-send');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      const r = await ctSendProposal(c.id);
      if (typeof render === 'function') render();
      toast('Proposal sent to ' + r.to);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Send';
      toast((e && e.message) || 'Could not send the proposal', '');
    }
  });

  // Accepting activates the contract, so it says so before it happens rather
  // than quietly starting to schedule crews and raise invoices.
  $('btn-ct-prop-accept')?.addEventListener('click', async () => {
    const c = ctGetContract(id());
    if (!c) return;
    const who = prompt('Who accepted it? (name — optional)') ;
    if (who === null) return;
    if (!confirm('Mark accepted and switch this contract to active?\n\nVisits and billing will start generating on its schedule.')) return;
    try {
      const r = await ctAcceptProposal(c.id, who || '');
      if (typeof render === 'function') render();
      toast(r.activated ? 'Accepted — contract is active' : 'Accepted, but the contract is still paused — check the dates', r.activated ? undefined : '');
    } catch (e) {
      toast((e && e.message) || 'Could not accept that proposal', '');
    }
  });

  $('btn-ct-prop-decline')?.addEventListener('click', async () => {
    const c = ctGetContract(id());
    if (!c) return;
    if (!confirm('Mark this proposal declined? The contract is left as it is.')) return;
    try {
      await ctDeclineProposal(c.id);
      if (typeof render === 'function') render();
      toast('Marked declined');
    } catch (e) {
      toast('Could not update that proposal', '');
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ctProposalTone, ctProposalSection, ctProposalPriceGuard,
    openProposalEditor, openProposalPreview, ctAttachProposalHandlers,
  };
}
