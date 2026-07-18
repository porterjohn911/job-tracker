// Owner-only API key management UI (see AGENT_API_DESIGN.md §8).
// Talks to /.netlify/functions/api-keys with the signed-in owner's Firebase
// ID token. Minting shows the raw key exactly once.

// All scopes, with a human label and a "sensitive" flag for the high-risk one.
const API_KEY_SCOPES = [
  { id: 'invoices:read', label: 'Read invoices & estimates' },
  { id: 'invoices:write', label: 'Create / send invoices (send is gated)' },
  { id: 'schedule:read', label: 'Read the schedule' },
  { id: 'schedule:write', label: 'Add / edit schedule entries' },
  { id: 'financials:read', label: 'Read financial summaries' },
  { id: 'financials:sensitive', label: 'Read bank & payroll (high risk)', sensitive: true },
];

// True only when real Firebase logins are on AND the current user is an owner
// — the endpoint needs a verifiable ID token and owner role.
function canManageApiKeys() {
  return !!(typeof FB_AUTH_ON !== 'undefined' && FB_AUTH_ON
    && typeof FB_USER !== 'undefined' && FB_USER && FB_USER.role === 'owner');
}

async function apiKeysToken() {
  const u = firebase.auth().currentUser;
  if (!u) throw new Error('Not signed in');
  return await u.getIdToken();
}

async function apiKeysRequest(method, body) {
  const token = await apiKeysToken();
  const opts = { method, headers: { Authorization: 'Bearer ' + token } };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch('/.netlify/functions/api-keys', opts);
  let data = {};
  try { data = await r.json(); } catch (e) { /* ignore */ }
  if (!r.ok) throw new Error(data.error || ('Request failed (' + r.status + ')'));
  return data;
}

function apiKeyRowHtml(k) {
  const when = k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'never';
  const co = (typeof COMPANIES !== 'undefined' && COMPANIES[k.company] && COMPANIES[k.company].label) || k.company;
  const scopes = (k.scopes || []).map((s) => `<span class="acc-role">${esc(s)}</span>`).join(' ');
  return `<div class="acc-row" data-key="${esc(k.id)}">
    <div class="acc-info">
      <div class="acc-name">${esc(k.label)} <span class="acc-meta">${esc(k.prefix)}…</span></div>
      <div class="acc-meta">${esc(co)} · ${scopes || 'no scopes'} · used ${esc(when)}</div>
    </div>
    <button class="btn-remove" data-key-del="${esc(k.id)}" type="button">Revoke</button>
  </div>`;
}

function showApiKeysModal() {
  if (!canManageApiKeys()) { toast('Only owners can manage API keys', ''); return; }
  const coOpts = (typeof COMPANIES !== 'undefined' ? Object.values(COMPANIES) : [])
    .map((co) => `<option value="${esc(co.id)}" ${co.id === (typeof COMPANY_ID !== 'undefined' ? COMPANY_ID : '') ? 'selected' : ''}>${esc(co.label)}</option>`).join('');
  const scopeChecks = API_KEY_SCOPES.map((s) => `<label class="acc-toggle" style="${s.sensitive ? 'color:#b91c1c' : ''}">
    <input type="checkbox" class="apikey-scope" value="${esc(s.id)}" ${s.id === 'invoices:read' ? 'checked' : ''}>
    <span>${esc(s.label)}</span></label>`).join('');

  $('modal-root').innerHTML = `<div class="modal-bd" id="mbd" role="dialog" aria-modal="true" aria-label="API keys"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Agent API Keys</div><button class="modal-close" id="mc" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      <p style="font-size:12px;color:var(--text-2);line-height:1.5;margin-bottom:12px">API keys let an automated agent access this app. A key is shown <strong>once</strong> at creation — copy it then. Keep keys server-side; never paste one into the browser.</p>
      <div id="apikey-new" style="display:none;margin-bottom:14px"></div>
      <div class="member-list" id="apikey-list"><p class="acc-meta">Loading…</p></div>
      <div style="margin:16px 0 8px;padding-top:14px;border-top:1px solid var(--border)"><div class="form-label" style="font-size:12px">Create a key</div></div>
      <div class="form-group"><label class="form-label">Label</label><input class="form-input" id="apikey-label" placeholder="e.g. Invoicing agent"></div>
      <div class="form-group"><label class="form-label">Company</label><select class="form-select" id="apikey-company">${coOpts}</select></div>
      <div class="form-group"><label class="form-label">Scopes</label>${scopeChecks}</div>
      <button class="btn-sm" id="apikey-create" type="button">+ Generate key</button>
    </div>
    <div class="modal-foot"><button class="btn-cancel" id="btn-cx">Close</button></div>
  </div></div>`;

  const close = () => closeModal();
  $('mc').onclick = $('btn-cx').onclick = close;
  $('mbd').onclick = (e) => { if (e.target === e.currentTarget) close(); };

  async function refresh() {
    try {
      const { keys } = await apiKeysRequest('GET');
      const list = $('apikey-list');
      list.innerHTML = keys && keys.length
        ? keys.map(apiKeyRowHtml).join('')
        : '<p class="acc-meta">No keys yet.</p>';
      list.querySelectorAll('[data-key-del]').forEach((b) => {
        b.onclick = async () => {
          if (!confirm('Revoke this key? Any agent using it stops working immediately.')) return;
          try { await apiKeysRequest('DELETE', { id: b.dataset.keyDel }); toast('Key revoked'); refresh(); }
          catch (e) { toast('Revoke failed: ' + (e.message || ''), ''); }
        };
      });
    } catch (e) {
      $('apikey-list').innerHTML = `<p class="acc-meta">Could not load keys: ${esc(e.message || '')}</p>`;
    }
  }

  $('apikey-create').onclick = async () => {
    const label = $('apikey-label').value.trim();
    const company = $('apikey-company').value;
    const scopes = [...document.querySelectorAll('.apikey-scope:checked')].map((c) => c.value);
    if (!label) { toast('Enter a label', ''); return; }
    if (!scopes.length) { toast('Select at least one scope', ''); return; }
    try {
      const { key } = await apiKeysRequest('POST', { label, company, scopes });
      const box = $('apikey-new');
      box.style.display = '';
      box.innerHTML = `<div style="padding:12px;border:1px solid var(--gold);border-radius:8px;background:var(--gold-light)">
        <div class="form-label" style="font-size:12px;margin-bottom:6px">Copy this key now — you won't see it again</div>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="form-input" id="apikey-raw" readonly value="${esc(key)}" style="font-family:monospace;font-size:12px">
          <button class="btn-sm" id="apikey-copy" type="button">Copy</button>
        </div></div>`;
      $('apikey-copy').onclick = () => {
        const el = $('apikey-raw'); el.select();
        try { navigator.clipboard.writeText(el.value); toast('Copied'); } catch (e) { document.execCommand('copy'); }
      };
      $('apikey-label').value = '';
      refresh();
    } catch (e) {
      toast('Could not create key: ' + (e.message || ''), '');
    }
  };

  refresh();
}
