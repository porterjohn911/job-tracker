// Company settings modal and Gmail panel
// Generated from src/app/09-settings-access-command-voice.js.
// ══ Company / settings modal ══
function showSettingsModal(){
  const c={...COMPANY};
  const canEditBrand=!gateOn()||isOwnerRole(SESSION);
  const appLogo=companyAppLogoSrc();
  const invoiceLogo=brandLogoFull();
  const headerColor=companyHeaderColor();
  $('modal-root').innerHTML=`<div class="modal-bd" id="mbd" role="dialog" aria-modal="true" aria-label="Settings"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Settings</div><button class="modal-close" id="mc" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Your Name (appears on notes & activity)</label><input class="form-input" id="set-user" value="${esc(S.user||'')}" placeholder="Your name"></div>
      <div style="margin:14px 0 10px;padding-top:14px;border-top:1px solid var(--border)"><div class="form-label" style="font-size:12px">Company Info (used on invoices)</div></div>
      <div class="form-group"><label class="form-label">Company Name</label><input class="form-input" id="set-co-name" value="${esc(c.name||'')}"></div>
      <div class="form-group"><label class="form-label">Address</label><textarea class="form-textarea" id="set-co-addr" style="min-height:56px">${esc(c.address||'')}</textarea></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Phone</label><input class="form-input" type="tel" id="set-co-phone" value="${esc(c.phone||'')}"></div>
        <div class="form-group"><label class="form-label">Email</label><input class="form-input" type="email" id="set-co-email" value="${esc(c.email||'')}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Website</label><input class="form-input" id="set-co-web" value="${esc(c.website||'')}"></div>
        <div class="form-group"><label class="form-label">License #</label><input class="form-input" id="set-co-lic" value="${esc(c.license||'')}"></div>
      </div>
      <div class="form-group"><label class="form-label">Default Tax Rate (%)</label><input class="form-input" type="number" step="0.01" id="set-co-tax" value="${esc(c.taxRate||'')}"></div>
      <div class="form-group"><label class="form-label">Default Invoice Terms</label><textarea class="form-textarea" id="set-co-terms">${esc(c.terms||'')}</textarea></div>
      ${canEditBrand?`<div style="margin:14px 0 10px;padding-top:14px;border-top:1px solid var(--border)"><div class="form-label" style="font-size:12px">Company Branding</div></div>
      <div class="tt-hint" style="margin-bottom:10px">Upload a compact app logo for the header and a wider invoice logo for invoices, estimates, PDFs, and emails.</div>
      <div class="form-group">
        <label class="form-label">Header / invoice color</label>
        <div style="display:flex;align-items:center;gap:10px">
          <input id="brand-header-color" type="color" value="${esc(headerColor)}" aria-label="Header and invoice color" style="width:52px;height:42px;padding:2px;border:1px solid var(--border);border-radius:8px;background:var(--surface);cursor:pointer">
          <input class="form-input" id="brand-header-color-text" value="${esc(headerColor)}" maxlength="7" spellcheck="false" autocapitalize="off" style="font-family:monospace;max-width:120px">
          <div id="brand-header-swatch" aria-hidden="true" style="width:42px;height:42px;border-radius:8px;border:1px solid var(--border);background:${esc(headerColor)}"></div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">App logo</label>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <img id="brand-app-preview" src="${esc(appLogo||'')}" alt="" style="width:52px;height:52px;object-fit:contain;border:1px solid var(--border);border-radius:8px;background:var(--surface)">
            <label class="btn-sm" style="cursor:pointer">Upload<input type="file" id="brand-app-file" accept="image/*" style="display:none"></label>
            ${ACTIVE_CO.appLogoUrl?'<button class="btn-mini" id="brand-app-remove" type="button">Remove</button>':''}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Invoice logo</label>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <img id="brand-invoice-preview" src="${esc(invoiceLogo||appLogo||'')}" alt="" style="width:120px;height:52px;object-fit:contain;border:1px solid var(--border);border-radius:8px;background:var(--surface)">
            <label class="btn-sm" style="cursor:pointer">Upload<input type="file" id="brand-invoice-file" accept="image/*" style="display:none"></label>
            ${ACTIVE_CO.invoiceLogoUrl?'<button class="btn-mini" id="brand-invoice-remove" type="button">Remove</button>':''}
          </div>
        </div>
      </div>`:''}
      <div style="margin:14px 0 10px;padding-top:14px;border-top:1px solid var(--border)"><div class="form-label" style="font-size:12px">Email sending (Gmail API)</div></div>
      <div id="gm-panel" style="margin-bottom:6px"></div>
      ${typeof renderStorageSettings==='function'?renderStorageSettings():''}
      <div style="margin:14px 0 10px;padding-top:14px;border-top:1px solid var(--border)"><div class="form-label" style="font-size:12px">Team Access &amp; Roles</div></div>
      ${(FB_AUTH_ON||accessEnabled())
        ? `<div class="tt-hint" style="margin-bottom:10px">Signed in as <strong>${esc(SESSION?SESSION.name:'?')}</strong> · ${esc(SESSION?SESSION.role:'')}${SESSION&&!canSeeAll(SESSION)?' · '+esc((COMPANIES[SESSION.company]||{}).label||SESSION.company):' · all companies'}</div>
           <div style="display:flex;gap:8px;flex-wrap:wrap">${isOwnerRole(SESSION)?'<button class="btn-sm" id="set-access" type="button">Manage team access</button>':''}<button class="btn-sm" id="set-signout" type="button">Sign out</button></div>`
        : `<div class="tt-hint" style="margin-bottom:10px">Access control is <strong>off</strong> — anyone can open any company. Turn it on to lock each worker to their company and give owners &amp; managers the full view.</div>
           <button class="btn-sm" id="set-access" type="button">Set up team access</button>`}
      ${(typeof canManageApiKeys === 'function' && canManageApiKeys())
        ? `<div style="margin:14px 0 10px;padding-top:14px;border-top:1px solid var(--border)"><div class="form-label" style="font-size:12px">Agent API Keys</div></div>
           <div class="tt-hint" style="margin-bottom:10px">Give an automated agent scoped, revocable access to this app.</div>
           <button class="btn-sm" id="set-apikeys" type="button">Manage API keys</button>`
        : ''}
    </div>
    <div class="modal-foot"><button class="btn-cancel" id="btn-cx">Cancel</button><button class="btn-save" id="btn-set-save">Save</button></div>
  </div></div>`;
  const closeSettings=()=>{if(typeof applyCompanyBranding==='function')applyCompanyBranding();closeModal()};
  $('mc').onclick=$('btn-cx').onclick=closeSettings;
  $('mbd').onclick=e=>{if(e.target===e.currentTarget)closeSettings()};
  $('set-access')?.addEventListener('click',()=>{closeSettings();showAccessModal()});
  $('set-apikeys')?.addEventListener('click',()=>{closeSettings();showApiKeysModal()});
  $('set-signout')?.addEventListener('click',()=>{if(confirm('Sign out of this device?'))signOut()});
  async function saveBrandLogo(kind,file){
    const up=await uploadCompanyLogoFile(file,kind);
    if(!up)return;
    const co={...(COMPANIES[COMPANY_ID]||ACTIVE_CO)};
    if(kind==='app'){co.appLogoUrl=up.url;co.appLogoPath=up.path}
    else{co.invoiceLogoUrl=up.url;co.invoiceLogoPath=up.path}
    try{
      await writeCompanyRegistryRecord(co);
      applyCompanyBranding();
      const img=$(kind==='app'?'brand-app-preview':'brand-invoice-preview');
      if(img)img.src=up.url;
      toast(kind==='app'?'App logo saved':'Invoice logo saved');
    }catch(e){toast('Could not save logo','')}
  }
  async function removeBrandLogo(kind){
    const co={...(COMPANIES[COMPANY_ID]||ACTIVE_CO)};
    const path=kind==='app'?co.appLogoPath:co.invoiceLogoPath;
    if(kind==='app'){delete co.appLogoUrl;delete co.appLogoPath}
    else{delete co.invoiceLogoUrl;delete co.invoiceLogoPath}
    try{
      await writeCompanyRegistryRecord(co);
      await deleteStoragePath(path);
      applyCompanyBranding();
      const img=$(kind==='app'?'brand-app-preview':'brand-invoice-preview');
      if(img)img.src=kind==='app'?(companyAppLogoSrc()||''):(brandLogoFull()||companyAppLogoSrc()||'');
      toast(kind==='app'?'App logo removed':'Invoice logo removed');
    }catch(e){toast('Could not remove logo','')}
  }
  $('brand-app-file')?.addEventListener('change',function(){const f=this.files&&this.files[0];if(f)saveBrandLogo('app',f)});
  $('brand-invoice-file')?.addEventListener('change',function(){const f=this.files&&this.files[0];if(f)saveBrandLogo('invoice',f)});
  $('brand-app-remove')?.addEventListener('click',()=>removeBrandLogo('app'));
  $('brand-invoice-remove')?.addEventListener('click',()=>removeBrandLogo('invoice'));
  function previewHeaderColor(raw){
    const color=normalizeHexColor(raw);
    if(!color)return;
    const sw=$('brand-header-swatch');
    if(sw)sw.style.background=color;
    if(typeof applyCompanyBranding==='function')applyCompanyBranding({...ACTIVE_CO,theme:{...(ACTIVE_CO.theme||{}),headerColor:color}});
  }
  $('brand-header-color')?.addEventListener('input',e=>{
    const color=normalizeHexColor(e.target.value);
    if(!color)return;
    const text=$('brand-header-color-text');
    if(text)text.value=color;
    previewHeaderColor(color);
  });
  $('brand-header-color-text')?.addEventListener('input',e=>{
    const color=normalizeHexColor(e.target.value);
    if(!color)return;
    const picker=$('brand-header-color');
    if(picker)picker.value=color;
    previewHeaderColor(color);
  });
  function renderGmailPanel(){
    const cfg=gmailLoad();const connected=gmailConnected();
    const okOrigin=gmailOriginOk();const reason=gmailOriginReason();
    const originBlock=okOrigin
      ? `<div class="tt-hint" style="margin:8px 0;padding:8px 10px;background:var(--surface-2,#f5f5f5);border-radius:8px;font-size:12px">Authorized JavaScript origin to paste into Google Cloud Console:<br><strong style="font-family:monospace;font-size:12.5px;user-select:all">${esc(location.origin)}</strong></div>`
      : `<div class="tt-hint" style="margin:8px 0;padding:10px;background:#fff4e5;border-left:3px solid #d97706;border-radius:6px;font-size:12px;color:#7c2d12"><strong>Can't connect from this URL.</strong><br>${esc(reason)}<br><br>Current origin: <span style="font-family:monospace">${esc(location.origin)}</span></div>`;
    $('gm-panel').innerHTML=connected
      ? `<div class="tt-hint" style="margin-bottom:8px">Connected as <strong>${esc(cfg.email||'(unknown account)')}</strong>. "Email PDF" sends the branded invoice/estimate + PDF in one click from this account's Sent folder.</div>
         ${originBlock}
         <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn-sm" id="gm-reconnect" type="button"${okOrigin?'':' disabled'}>Reconnect</button><button class="btn-sm" id="gm-disconnect" type="button">Disconnect</button></div>`
      : `<div class="tt-hint" style="margin-bottom:10px">Connect a Gmail account once and "Email PDF" becomes true one-click for this company.<br><a href="#" id="gm-help" style="color:var(--green-700);text-decoration:underline">Setup steps (~10 min, one-time)</a></div>
         ${originBlock}
         <div class="form-group"><label class="form-label">OAuth Client ID</label><input class="form-input" id="gm-clientid" value="${esc(cfg.clientId||'')}" placeholder="123456789-abc.apps.googleusercontent.com" spellcheck="false" autocapitalize="off" style="font-family:monospace;font-size:12.5px"${okOrigin?'':' disabled'}></div>
         <button class="btn-sm" id="gm-connect" type="button"${okOrigin?'':' disabled title="Open this app over HTTPS (or localhost) to connect Gmail"'}>Connect Gmail</button>`;
    $('gm-connect')?.addEventListener('click',async()=>{
      const id=($('gm-clientid')?.value||'').trim();if(!id){toast('Paste your OAuth Client ID first','');return}
      const btn=$('gm-connect');btn.disabled=true;const oldT=btn.textContent;btn.textContent='Opening Google…';
      try{await gmailConnect(id);toast('Gmail connected');renderGmailPanel()}
      catch(e){toast('Connect failed: '+((e&&e.message)||e),'');btn.disabled=false;btn.textContent=oldT}
    });
    $('gm-reconnect')?.addEventListener('click',async()=>{
      const cfg=gmailLoad();if(!cfg.clientId)return;
      try{await gmailConnect(cfg.clientId);toast('Reconnected');renderGmailPanel()}catch(e){toast('Reconnect failed: '+((e&&e.message)||e),'')}
    });
    $('gm-disconnect')?.addEventListener('click',()=>{if(!confirm('Disconnect Gmail from this company? Sending will fall back to the share/download flow.'))return;gmailDisconnect();toast('Disconnected');renderGmailPanel()});
    $('gm-help')?.addEventListener('click',(e)=>{e.preventDefault();alert('One-time Gmail setup (~10 min):\n\n1. Open console.cloud.google.com and create a project (or reuse one).\n2. APIs & Services → Library → enable "Gmail API".\n3. APIs & Services → OAuth consent screen → External → fill app name + your email → add scope https://www.googleapis.com/auth/gmail.send → add your gmail address as a Test user → save. (Stay in Testing mode; no Google verification needed for personal use.)\n4. APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application.\n   Authorized JavaScript origins: paste EXACTLY this (HTTPS, no trailing slash, no path):\n   '+location.origin+'\n   Google requires HTTPS or localhost. file:// and plain http:// (non-localhost) will be rejected.\n5. Copy the Client ID and paste it here, then click Connect Gmail.')});
  }
  renderGmailPanel();
  if(typeof wireStorageSettings==='function')wireStorageSettings();
  $('btn-set-save').onclick=async()=>{
    const newUser=$('set-user').value.trim();
    if(newUser!==S.user){S.user=newUser;localStorage.setItem(LS('user'),S.user)}
    let savedBrand=false;
    if(canEditBrand){
      const picked=normalizeHexColor(($('brand-header-color-text')?.value||$('brand-header-color')?.value||'').trim());
      if(!picked){toast('Use a valid hex color like #0a3d2e','');return}
      const current=normalizeHexColor(ACTIVE_CO.theme&&ACTIVE_CO.theme.headerColor)||companyHeaderColor();
      if(picked!==current){
        const co={...(COMPANIES[COMPANY_ID]||ACTIVE_CO)};
        co.theme={...(co.theme||{}),headerColor:picked};
        try{await writeCompanyRegistryRecord(co);savedBrand=true}
        catch(e){toast('Could not save brand color','');return}
      }
    }
    COMPANY={
      name:$('set-co-name').value.trim()||COMPANY_DEFAULT.name,
      address:$('set-co-addr').value.trim(),
      phone:$('set-co-phone').value.trim(),
      email:$('set-co-email').value.trim(),
      website:$('set-co-web').value.trim(),
      license:$('set-co-lic').value.trim(),
      taxRate:$('set-co-tax').value,
      terms:$('set-co-terms').value.trim(),
    };
    saveCompany(COMPANY);
    if(savedBrand&&typeof applyCompanyBranding==='function')applyCompanyBranding();
    closeModal();render();toast('Settings saved');
  };
}
