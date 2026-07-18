// Owner-only review of approval-gated agent send requests (AGENT_API_DESIGN.md §7).
// The agent queues invoice sends; nothing is emailed until an owner approves
// here. Approving opens the normal send composer (the owner's existing Gmail/PDF
// path); dismissing marks the request rejected. Reuses apiKeysToken() /
// canManageApiKeys() from settings/03-api-keys.js.

async function agentSendsRequest(method, body) {
  const token = await apiKeysToken();
  const opts = { method, headers: { Authorization: 'Bearer ' + token } };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const qs = method === 'GET' ? ('?company=' + encodeURIComponent(COMPANY_ID) + '&status=pending') : '';
  const r = await fetch('/.netlify/functions/api-pending-sends' + qs, opts);
  let data = {};
  try { data = await r.json(); } catch (e) { /* ignore */ }
  if (!r.ok) throw new Error(data.error || ('Request failed (' + r.status + ')'));
  return data;
}

function agentSendRowHtml(s) {
  const when = s.requestedAt ? new Date(s.requestedAt).toLocaleString() : '';
  const label = s.kind === 'estimate' ? 'Estimate' : 'Invoice';
  return `<div class="acc-row" data-send="${esc(s.id)}">
    <div class="acc-info">
      <div class="acc-name">${esc(label)} ${esc(s.number || '')} <span class="acc-meta">${esc(s.customerName || s.jobName || '')}</span></div>
      <div class="acc-meta">to ${esc(s.to || '—')} · requested by ${esc(s.requestedByLabel || 'agent')}${when ? ' · ' + esc(when) : ''}</div>
    </div>
    <div style="display:flex;gap:6px">
      <button class="btn-sm" data-send-approve="${esc(s.id)}" type="button">Review &amp; send</button>
      <button class="btn-remove" data-send-reject="${esc(s.id)}" type="button">Dismiss</button>
    </div>
  </div>`;
}

function showAgentSendsModal() {
  if (typeof canManageApiKeys !== 'function' || !canManageApiKeys()) { toast('Only owners can review agent sends', ''); return; }

  $('modal-root').innerHTML = `<div class="modal-bd" id="mbd" role="dialog" aria-modal="true" aria-label="Agent send requests"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Agent Send Requests</div><button class="modal-close" id="mc" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      <p style="font-size:12px;color:var(--text-2);line-height:1.5;margin-bottom:12px">Invoices an agent has queued to send. Nothing is emailed until you approve. <strong>Review &amp; send</strong> opens the normal send screen; <strong>Dismiss</strong> discards the request.</p>
      <div class="member-list" id="agent-sends-list"><p class="acc-meta">Loading…</p></div>
    </div>
    <div class="modal-foot"><button class="btn-cancel" id="btn-cx">Close</button></div>
  </div></div>`;

  const close = () => closeModal();
  $('mc').onclick = $('btn-cx').onclick = close;
  $('mbd').onclick = (e) => { if (e.target === e.currentTarget) close(); };

  async function markResolved(id, action) {
    await agentSendsRequest('POST', { company: COMPANY_ID, id, action });
  }

  async function refresh() {
    try {
      const { sends } = await agentSendsRequest('GET');
      const list = $('agent-sends-list');
      list.innerHTML = sends && sends.length
        ? sends.map(agentSendRowHtml).join('')
        : '<p class="acc-meta">No pending send requests.</p>';

      list.querySelectorAll('[data-send-reject]').forEach((b) => {
        b.onclick = async () => {
          try { await markResolved(b.dataset.sendReject, 'rejected'); toast('Dismissed'); refresh(); }
          catch (e) { toast('Could not dismiss: ' + (e.message || ''), ''); }
        };
      });

      list.querySelectorAll('[data-send-approve]').forEach((b) => {
        b.onclick = async () => {
          const s = (sends || []).find((x) => x.id === b.dataset.sendApprove);
          if (!s) return;
          const j = S.jobs[s.jobId];
          const arr = j && (s.kind === 'estimate' ? j.estimates : j.invoices);
          const inv = Array.isArray(arr) ? arr.find((i) => i && i.id === s.invoiceId) : null;
          if (!j || !inv) { toast('That job or invoice is no longer available', ''); return; }
          try { await markResolved(s.id, 'approved'); } catch (e) { /* still let them send */ }
          close();
          // Hand off to the app's normal, owner-driven send composer.
          if (typeof showSendInvoiceModal === 'function') showSendInvoiceModal(j, inv, s.kind || 'invoice');
          else toast('Approved — open the invoice to send it', '');
        };
      });
    } catch (e) {
      $('agent-sends-list').innerHTML = `<p class="acc-meta">Could not load requests: ${esc(e.message || '')}</p>`;
    }
  }

  refresh();
}
