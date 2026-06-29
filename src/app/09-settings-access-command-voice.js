// Settings, workspace switcher, access, command palette, shortcuts, and voice
// Generated from src/app.js lines 3774-4242.
// ══ Company / settings modal ══
function showSettingsModal(){
  const c={...COMPANY};
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
      <div style="margin:14px 0 10px;padding-top:14px;border-top:1px solid var(--border)"><div class="form-label" style="font-size:12px">Email sending (Gmail API)</div></div>
      <div id="gm-panel" style="margin-bottom:6px"></div>
      <div style="margin:14px 0 10px;padding-top:14px;border-top:1px solid var(--border)"><div class="form-label" style="font-size:12px">Team Access &amp; Roles</div></div>
      ${(FB_AUTH_ON||accessEnabled())
        ? `<div class="tt-hint" style="margin-bottom:10px">Signed in as <strong>${esc(SESSION?SESSION.name:'?')}</strong> · ${esc(SESSION?SESSION.role:'')}${SESSION&&!canSeeAll(SESSION)?' · '+esc((COMPANIES[SESSION.company]||{}).label||SESSION.company):' · all companies'}</div>
           <div style="display:flex;gap:8px;flex-wrap:wrap">${isOwnerRole(SESSION)?'<button class="btn-sm" id="set-access" type="button">Manage team access</button>':''}<button class="btn-sm" id="set-signout" type="button">Sign out</button></div>`
        : `<div class="tt-hint" style="margin-bottom:10px">Access control is <strong>off</strong> — anyone can open any company. Turn it on to lock each worker to their company and give owners &amp; managers the full view.</div>
           <button class="btn-sm" id="set-access" type="button">Set up team access</button>`}
    </div>
    <div class="modal-foot"><button class="btn-cancel" id="btn-cx">Cancel</button><button class="btn-save" id="btn-set-save">Save</button></div>
  </div></div>`;
  $('mc').onclick=$('btn-cx').onclick=closeModal;
  $('mbd').onclick=e=>{if(e.target===e.currentTarget)closeModal()};
  $('set-access')?.addEventListener('click',()=>{closeModal();showAccessModal()});
  $('set-signout')?.addEventListener('click',()=>{if(confirm('Sign out of this device?'))signOut()});
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
  $('btn-set-save').onclick=()=>{
    const newUser=$('set-user').value.trim();
    if(newUser!==S.user){S.user=newUser;localStorage.setItem(LS('user'),S.user)}
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
    closeModal();render();toast('Settings saved');
  };
}

// ══ Company Switcher ══
function showCompanySwitcher(){
  if(gateOn()&&!canSeeAll(SESSION)){toast('You only have access to '+ACTIVE_CO.label,'');return}
  const cur=OWNER_MODE?'owner':COMPANY_ID;
  const rows=Object.values(COMPANIES).map(co=>`
    <button class="co-pick${co.id===cur?' active':''}" data-co="${esc(co.id)}">
      <div><div class="co-pick-name">${esc(co.label)}</div><div class="co-pick-tag">${esc(co.tag)}</div></div>
      ${co.id===cur?'<span class="co-pick-badge">Current</span>':''}
    </button>`).join('');
  const ownerActive=cur==='owner';
  $('modal-root').innerHTML=`<div class="modal-bd" id="mbd" role="dialog" aria-modal="true" aria-label="Choose workspace"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Choose workspace</div><button class="modal-close" id="mc" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      <p style="font-size:13px;color:var(--text-2);margin-bottom:16px;line-height:1.5">Each company keeps completely separate jobs, invoices, schedule, photos, and settings. Owner is a cross-company analytics workspace. Picking any one reloads the app.</p>
      ${rows}
      <button class="co-pick${ownerActive?' active':''}" data-co="owner" style="border-color:var(--gold);background:${ownerActive?'var(--gold-light)':'var(--surface)'}">
        <div><div class="co-pick-name">Owner</div><div class="co-pick-tag">Analytics &amp; reports across all companies</div></div>
        ${ownerActive?'<span class="co-pick-badge">Current</span>':'<span class="co-pick-badge">All</span>'}
      </button>
    </div>
  </div></div>`;
  $('mc').onclick=closeModal;
  $('mbd').onclick=e=>{if(e.target===e.currentTarget)closeModal()};
  document.querySelectorAll('[data-co]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.co;
    if(id===cur){closeModal();return}
    try{localStorage.setItem('jt_company',id)}catch(e){}
    location.reload();
  });
}

// ══ Access control: lock screen + team/role manager ══
function showLockScreen(msg){
  let root=document.getElementById('lock-root');
  if(!root){root=document.createElement('div');root.id='lock-root';document.body.appendChild(root)}
  root.innerHTML=`<div class="lock-bd"><div class="lock-card">
    <div class="lock-ico"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/></svg></div>
    <div class="lock-title">Enter your PIN</div>
    <div class="lock-sub">Sign in to your workspace</div>
    <input id="lock-pin" class="lock-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="••••" aria-label="PIN">
    <div class="lock-err" id="lock-err">${msg?esc(msg):''}</div>
    <button class="lock-btn" id="lock-go" type="button">Sign In</button>
  </div></div>`;
  const pin=document.getElementById('lock-pin');setTimeout(()=>{try{pin.focus()}catch(e){}},60);
  function tryIn(){
    const v=(document.getElementById('lock-pin').value||'').trim();
    const m=v?(ACCESS.members||[]).find(x=>String(x.pin)===v):null;
    if(!m){document.getElementById('lock-err').textContent='Incorrect PIN. Try again.';const p=document.getElementById('lock-pin');p.value='';p.focus();return}
    try{localStorage.setItem(SESSION_KEY,m.id)}catch(e){}
    location.reload();
  }
  document.getElementById('lock-go').onclick=tryIn;
  pin.onkeydown=e=>{if(e.key==='Enter')tryIn()};
}
function signOut(){if(FB_AUTH_ON){try{firebase.auth().signOut()}catch(e){}return}try{localStorage.removeItem(SESSION_KEY)}catch(e){}location.reload()}

let ACCESS_DRAFT=null;
function showAccessModal(){
  if(FB_AUTH_ON){return showFbUserAdmin();}
  if(accessEnabled()&&!isOwnerRole(SESSION)){toast('Only owners can manage access','');return}
  ACCESS_DRAFT=ACCESS?JSON.parse(JSON.stringify(ACCESS)):{enabled:false,members:[]};
  ACCESS_DRAFT.members=ACCESS_DRAFT.members||[];
  renderAccessModal();
}
function renderAccessModal(){
  const a=ACCESS_DRAFT;
  const coOpts=Object.values(COMPANIES).map(co=>`<option value="${esc(co.id)}">${esc(co.label)}</option>`).join('');
  const rows=a.members.length?a.members.map((m,i)=>`<div class="acc-row" data-acc="${i}">
    <div class="acc-ava">${initials(m.name)}</div>
    <div class="acc-info"><div class="acc-name">${esc(m.name)} <span class="acc-role acc-role-${esc(m.role)}">${esc(m.role)}</span></div>
      <div class="acc-meta">${canSeeAll(m)?'All companies':esc((COMPANIES[m.company]||{}).label||m.company)} · PIN ${esc(String(m.pin||''))}</div></div>
    <button class="btn-remove" data-acc-del="${i}" type="button">Remove</button>
  </div>`).join(''):'<p style="font-size:13px;color:var(--text-3);padding:4px 0">No people yet. Add at least one owner so you keep full access.</p>';
  $('modal-root').innerHTML=`<div class="modal-bd" id="mbd" role="dialog" aria-modal="true" aria-label="Team access"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Team Access &amp; Roles</div><button class="modal-close" id="mc" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      <label class="acc-toggle"><input type="checkbox" id="acc-enabled" ${a.enabled?'checked':''}><span>Require a PIN to use the app (locks each worker to their company)</span></label>
      <div class="member-list" style="margin-top:14px">${rows}</div>
      <div style="margin:16px 0 8px;padding-top:14px;border-top:1px solid var(--border)"><div class="form-label" style="font-size:12px">Add person</div></div>
      <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="acc-name" placeholder="e.g. Mike Jones"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Role</label><select class="form-select" id="acc-role"><option value="worker">Worker — one company</option><option value="manager">Manager — all companies</option><option value="owner">Owner — all + manages access</option></select></div>
        <div class="form-group" id="acc-co-wrap"><label class="form-label">Company</label><select class="form-select" id="acc-co">${coOpts}</select></div>
      </div>
      <div class="form-group"><label class="form-label">PIN (4–8 digits)</label><input class="form-input" id="acc-pin" inputmode="numeric" maxlength="8" placeholder="e.g. 1234"></div>
      <button class="btn-sm" id="acc-add" type="button">+ Add person</button>
      <div class="tt-hint" style="margin-top:14px">PINs are stored on the device for now (a soft gate). Real per-user logins arrive with Firebase sign-in — these names and roles carry over.</div>
    </div>
    <div class="modal-foot"><button class="btn-cancel" id="btn-cx">Cancel</button><button class="btn-save" id="acc-save">Save &amp; Apply</button></div>
  </div></div>`;
  $('mc').onclick=$('btn-cx').onclick=()=>{ACCESS_DRAFT=null;closeModal()};
  $('mbd').onclick=e=>{if(e.target===e.currentTarget){ACCESS_DRAFT=null;closeModal()}};
  const roleSel=$('acc-role'),coWrap=$('acc-co-wrap');
  function syncCo(){coWrap.style.display=roleSel.value==='worker'?'':'none'}
  roleSel.onchange=syncCo;syncCo();
  $('acc-enabled').onchange=()=>{ACCESS_DRAFT.enabled=$('acc-enabled').checked};
  document.querySelectorAll('[data-acc-del]').forEach(b=>b.onclick=()=>{ACCESS_DRAFT.members.splice(parseInt(b.dataset.accDel),1);renderAccessModal()});
  $('acc-add').onclick=()=>{
    const name=$('acc-name').value.trim();const role=$('acc-role').value;const pin=($('acc-pin').value||'').trim();const company=role==='worker'?$('acc-co').value:'all';
    if(!name){toast('Enter a name','');return}
    if(!/^\d{4,8}$/.test(pin)){toast('PIN must be 4–8 digits','');return}
    if(ACCESS_DRAFT.members.some(m=>String(m.pin)===pin)){toast('That PIN is already used','');return}
    ACCESS_DRAFT.members.push({id:'u_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),name,role,company,pin});
    renderAccessModal();
  };
  $('acc-save').onclick=()=>{
    const a=ACCESS_DRAFT;
    if(a.enabled){
      if(!a.members.length){toast('Add at least one person first','');return}
      if(!a.members.some(m=>m.role==='owner')){toast('Add at least one owner so you keep access','');return}
    }
    try{localStorage.setItem(ACCESS_KEY,JSON.stringify(a))}catch(e){}
    ACCESS=a;
    if(a.enabled){const me=a.members.find(m=>m.role==='owner');if(me){try{localStorage.setItem(SESSION_KEY,me.id)}catch(e){}}}
    else{try{localStorage.removeItem(SESSION_KEY)}catch(e){}}
    ACCESS_DRAFT=null;location.reload();
  };
}

// Apply the active company's logo + color theme (logo/theme are optional;
// Waterfront has none, so it keeps its original logo and green header).
function applyCompanyBranding(){
  if(ACTIVE_CO.logoSvg){
    const img=document.querySelector('.brand-logo');
    if(img){img.src='data:image/svg+xml;utf8,'+encodeURIComponent(ACTIVE_CO.logoSvg);img.alt=ACTIVE_CO.label;}
  }
  const t=ACTIVE_CO.theme;
  if(t&&!document.getElementById('co-theme')){
    let css='';
    if(t.headerBg)css+='.header{background:'+t.headerBg+'}';
    if(t.syncBg)css+='.sync-bar{background:'+t.syncBg+'}';
    if(t.navActive)css+='.nav-btn.active{color:'+t.navActive+';border-bottom-color:'+t.navActive+'}';
    if(css){const s=document.createElement('style');s.id='co-theme';s.textContent=css;document.head.appendChild(s);}
  }
}

// ══ Command Palette ══
let CMD={open:false,query:'',idx:0,items:[]};
function cmdItems(){
  const out=[];
  // Views
  [['dashboard','Home / Dashboard','home'],['jobs','Jobs','briefcase'],['schedule','Schedule','calendar'],['invoices','Invoices','invoice'],['referrals','Referrals','team'],['map','Map','map'],['reports','Reports','chart'],['activity','Activity','list'],['team','Team','team'],['time','Time','calendar'],['bank','Bank','chart']].forEach(([v,name,ico])=>{
    out.push({type:'view',name:'Go to '+name,sub:'View',ico,run:()=>{S.view=v;S.detail=null;render()}});
  });
  // Actions
  out.push({type:'action',name:'New Job',sub:'Create a job',ico:'plus',run:()=>showJobModal('add')});
  out.push({type:'action',name:'New Invoice',sub:'Pick a job, then create invoice',ico:'invoice',run:()=>showJobPickerModal(jobId=>showInvoiceModal(jobId))});
  out.push({type:'action',name:'New Estimate',sub:'Pick a job, then create an estimate',ico:'invoice',run:()=>showJobPickerModal(jobId=>showInvoiceModal(jobId,null,'estimate'))});
  out.push({type:'action',name:'New Referral',sub:'Log a referred lead & payout',ico:'plus',run:()=>showReferralModal('add')});
  out.push({type:'action',name:'Settings & Company Info',sub:'Edit name, logo, invoice defaults',ico:'kbd',run:showSettingsModal});
  if(!gateOn()||canSeeAll(SESSION)){
    out.push({type:'action',name:'Switch company / workspace',sub:'Waterfront · Manufactured Housing · Norris Lake · Owner',ico:'link',run:showCompanySwitcher});
    if(!OWNER_MODE)out.push({type:'action',name:'Owner workspace',sub:'Analytics across all companies',ico:'chart',run:()=>{try{localStorage.setItem('jt_company','owner')}catch(e){};location.reload()}});
  }
  out.push({type:'action',name:'Export to CSV',sub:'Download all jobs',ico:'download',run:exportCSV});
  out.push({type:'action',name:'Notifications',sub:'See your inbox',ico:'bell',run:showNotificationsModal});
  out.push({type:'action',name:'Connect Team (Firebase)',sub:'Live sync setup',ico:'link',run:showSetupModal});
  out.push({type:'action',name:'Keyboard Shortcuts',sub:'See all hotkeys',ico:'kbd',run:showShortcutsModal});
  out.push({type:'action',name:'Undo last action',sub:'Reverse the most recent change',ico:'undo',run:undoLast});
  // Jobs
  jobs().forEach(j=>{
    const sub=[j.customerName,j.address,spLabel(j.status)].filter(Boolean).join(' · ');
    out.push({type:'job',name:j.name,sub,ico:'job',run:()=>{S.detail=j.id;S.view='jobs';S.detailTab='overview';render()}});
  });
  return out;
}
function cmdFilter(q){
  const items=cmdItems();
  if(!q)return items;
  const ql=q.toLowerCase();
  // Simple fuzzy: include if all query chars appear in order
  const matches=items.map(it=>{
    const hay=(it.name+' '+(it.sub||'')).toLowerCase();
    let idx=0,score=0;
    for(const ch of ql){
      const f=hay.indexOf(ch,idx);
      if(f<0)return null;
      score+=(f-idx);idx=f+1;
    }
    return {it,score:score+(hay.startsWith(ql)?-100:0)};
  }).filter(Boolean).sort((a,b)=>a.score-b.score);
  return matches.map(m=>m.it);
}
const CMD_ICONS={
  home:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"/></svg>',
  briefcase:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>',
  calendar:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25"/></svg>',
  map:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"/></svg>',
  chart:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z"/></svg>',
  list:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"/></svg>',
  team:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952"/></svg>',
  plus:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>',
  download:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>',
  bell:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31"/></svg>',
  link:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757"/></svg>',
  kbd:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5v10.5H3.75z"/></svg>',
  undo:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"/></svg>',
  job:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12"/></svg>',
  invoice:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 3h6m-9-9h12v18l-3-2-3 2-3-2-3 2V6z"/></svg>',
};
function showCommandPalette(){
  CMD.open=true;CMD.query='';CMD.idx=0;CMD.items=cmdItems();
  renderCmd();
  setTimeout(()=>{const i=document.getElementById('cmd-input');if(i)i.focus()},10);
}
function hideCommandPalette(){CMD.open=false;document.getElementById('cmd-root').innerHTML=''}
function renderCmd(){
  if(!CMD.open)return;
  const groups={action:[],view:[],job:[]};
  CMD.items.forEach((it,i)=>groups[it.type].push({...it,gi:i}));
  const groupOrder=[['action','Actions'],['view','Views'],['job','Jobs']];
  let html='';
  let visIdx=0;
  groupOrder.forEach(([k,label])=>{
    if(!groups[k].length)return;
    html+=`<div class="cmd-group-hd">${label}</div>`;
    groups[k].slice(0,20).forEach(it=>{
      const sel=visIdx===CMD.idx?'sel':'';
      html+=`<div class="cmd-item ${sel}" data-cmd-idx="${visIdx}">
        <div class="cmd-item-icon">${CMD_ICONS[it.ico]||CMD_ICONS.job}</div>
        <div class="cmd-item-body"><div class="cmd-item-name">${esc(it.name)}</div>${it.sub?`<div class="cmd-item-sub">${esc(it.sub)}</div>`:''}</div>
      </div>`;
      visIdx++;
    });
  });
  if(!html)html=`<div class="cmd-empty">No matches for “${esc(CMD.query)}”</div>`;
  document.getElementById('cmd-root').innerHTML=`<div class="cmd-bd" id="cmd-bd" role="dialog" aria-label="Command palette" aria-modal="true">
    <div class="cmd-box">
      <div class="cmd-input-wrap">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z"/></svg>
        <input id="cmd-input" class="cmd-input" placeholder="Search jobs, run commands…" value="${esc(CMD.query)}" aria-label="Search" autocomplete="off">
        <span class="cmd-kbd">ESC</span>
      </div>
      <div class="cmd-results" id="cmd-results">${html}</div>
      <div class="cmd-foot">
        <span><span class="cmd-kbd">↑</span><span class="cmd-kbd">↓</span> navigate</span>
        <span><span class="cmd-kbd">↵</span> select</span>
        <span><span class="cmd-kbd">ESC</span> close</span>
      </div>
    </div>
  </div>`;
  const inp=document.getElementById('cmd-input');
  inp.oninput=()=>{CMD.query=inp.value;CMD.items=cmdFilter(CMD.query);CMD.idx=0;renderCmd();setTimeout(()=>document.getElementById('cmd-input').focus(),0);inp.value;document.getElementById('cmd-input').value=CMD.query;document.getElementById('cmd-input').setSelectionRange(CMD.query.length,CMD.query.length)};
  document.getElementById('cmd-bd').onclick=e=>{if(e.target.id==='cmd-bd')hideCommandPalette()};
  document.querySelectorAll('[data-cmd-idx]').forEach(el=>el.onclick=()=>{
    const i=parseInt(el.dataset.cmdIdx);CMD.idx=i;runCmd();
  });
}
function runCmd(){
  // Flatten in same order as render
  const groups={action:[],view:[],job:[]};
  CMD.items.forEach(it=>groups[it.type].push(it));
  const ordered=[...groups.action,...groups.view,...groups.job.slice(0,20)];
  const it=ordered[CMD.idx];
  if(!it)return;
  hideCommandPalette();
  it.run();
}

// ══ Keyboard shortcuts modal ══
function showShortcutsModal(){
  const rows=[
    ['Open command palette',['Ctrl','K'],['⌘','K']],
    ['New job',['N']],
    ['Search this view',['/'],],
    ['Go to Dashboard',['G','D']],
    ['Go to Jobs',['G','J']],
    ['Go to Schedule',['G','S']],
    ['Go to Invoices',['G','I']],
    ['Go to Map',['G','M']],
    ['Go to Reports',['G','R']],
    ['Notifications',['B']],
    ['Undo last action',['Ctrl','Z'],['⌘','Z']],
    ['Show this help',['?']],
    ['Close modal / palette',['ESC']],
  ];
  $('modal-root').innerHTML=`<div class="modal-bd" id="mbd" role="dialog" aria-label="Keyboard shortcuts" aria-modal="true"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Keyboard Shortcuts</div><button class="modal-close" id="mc" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      <p style="font-size:12.5px;color:var(--text-2);margin-bottom:14px;line-height:1.5">Speed up everyday actions. Shortcuts work anywhere except in text fields.</p>
      <div class="kbd-grid">
        ${rows.map(r=>`<div class="kbd-row"><div class="kbd-row-label">${esc(r[0])}</div><div class="kbd-keys">${r[1].map(k=>'<kbd>'+esc(k)+'</kbd>').join('')}</div></div>`).join('')}
      </div>
    </div>
  </div></div>`;
  $('mc').onclick=closeModal;
  $('mbd').onclick=e=>{if(e.target===e.currentTarget)closeModal()};
}

// ══ Voice dictation (Web Speech API) ══
const VOICE={rec:null,active:null};
function supportsVoice(){return!!(window.SpeechRecognition||window.webkitSpeechRecognition)}
function startVoice(targetEl,btn){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){toast('Voice not supported in this browser','');return}
  if(VOICE.rec){stopVoice();return}
  const rec=new SR();
  rec.continuous=true;rec.interimResults=true;rec.lang='en-US';
  VOICE.rec=rec;VOICE.active=btn;
  btn.classList.add('listening');btn.setAttribute('aria-pressed','true');
  const initial=targetEl.value;
  let final='';
  rec.onresult=e=>{
    let interim='';
    for(let i=e.resultIndex;i<e.results.length;i++){
      const r=e.results[i];
      if(r.isFinal)final+=r[0].transcript;else interim+=r[0].transcript;
    }
    targetEl.value=(initial?initial+(initial.endsWith(' ')?'':' '):'')+final+interim;
  };
  rec.onerror=e=>{toast('Voice error: '+e.error,'');stopVoice()};
  rec.onend=()=>{stopVoice()};
  try{rec.start()}catch(e){toast('Could not start mic','');stopVoice()}
}
function stopVoice(){
  if(VOICE.rec){try{VOICE.rec.stop()}catch(e){}VOICE.rec=null}
  if(VOICE.active){VOICE.active.classList.remove('listening');VOICE.active.setAttribute('aria-pressed','false');VOICE.active=null}
}
function micButton(targetSelector){
  if(!supportsVoice())return'';
  return `<button type="button" class="mic-btn" data-mic="${targetSelector}" title="Voice dictation" aria-label="Start voice dictation" aria-pressed="false">
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"/></svg>
  </button>`;
}
function wireMicButtons(){
  document.querySelectorAll('[data-mic]').forEach(btn=>{
    btn.onclick=e=>{
      e.preventDefault();
      const sel=btn.dataset.mic;
      const target=document.querySelector(sel);
      if(!target){toast('Field not found','');return}
      startVoice(target,btn);
    };
  });
}

// ══ Global keyboard ══
let KBD_BUFFER='';let KBD_BUFFER_T=null;
function onKey(e){
  // Skip if a modal command palette is open (handled separately)
  if(CMD.open){
    if(e.key==='Escape'){e.preventDefault();hideCommandPalette();return}
    if(e.key==='ArrowDown'){e.preventDefault();CMD.idx=Math.min(CMD.idx+1,Math.max(0,countCmdVisible()-1));renderCmd();const inp=document.getElementById('cmd-input');if(inp){inp.focus();inp.setSelectionRange(inp.value.length,inp.value.length)}return}
    if(e.key==='ArrowUp'){e.preventDefault();CMD.idx=Math.max(0,CMD.idx-1);renderCmd();const inp=document.getElementById('cmd-input');if(inp){inp.focus();inp.setSelectionRange(inp.value.length,inp.value.length)}return}
    if(e.key==='Enter'){e.preventDefault();runCmd();return}
    return;
  }
  // Cmd/Ctrl+K opens palette regardless
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();showCommandPalette();return}
  // Cmd/Ctrl+Z undo
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!e.shiftKey){
    if(!isTyping(e)){e.preventDefault();undoLast();return}
  }
  // ESC closes any modal
  if(e.key==='Escape'){
    if($('modal-root').innerHTML){closeModal();return}
    if($('fs-root').innerHTML){$('fs-root').innerHTML='';return}
  }
  // Don't trigger single-letter shortcuts while typing
  if(isTyping(e))return;
  const k=e.key;
  if(OWNER_MODE){if(k==='?'){e.preventDefault();showShortcutsModal()}return}
  if(k==='/'){e.preventDefault();const s=document.getElementById('search-in');if(s){s.focus();s.select()}else{showCommandPalette()};return}
  if(k==='n'||k==='N'){e.preventDefault();showJobModal('add');return}
  if(k==='?'){e.preventDefault();showShortcutsModal();return}
  if(k==='b'||k==='B'){e.preventDefault();showNotificationsModal();return}
  // g + (d/j/s/m/r) go-to
  if(k==='g'||k==='G'){KBD_BUFFER='g';clearTimeout(KBD_BUFFER_T);KBD_BUFFER_T=setTimeout(()=>KBD_BUFFER='',1200);return}
  if(KBD_BUFFER==='g'){
    const map={d:'dashboard',j:'jobs',s:'schedule',i:'invoices',m:'map',r:'reports',a:'activity',t:'team'};
    const target=map[k.toLowerCase()];
    if(target){KBD_BUFFER='';clearTimeout(KBD_BUFFER_T);S.view=target;S.detail=null;render();e.preventDefault()}
  }
}
function isTyping(e){
  const t=e.target;
  if(!t)return false;
  const tag=(t.tagName||'').toLowerCase();
  if(tag==='input'||tag==='textarea'||tag==='select')return true;
  if(t.isContentEditable)return true;
  return false;
}
function countCmdVisible(){
  const groups={action:0,view:0,job:0};
  CMD.items.forEach(it=>groups[it.type]++);
  return groups.action+groups.view+Math.min(20,groups.job);
}

