// PIN lock screen and access control modal
// Generated from src/app/09-settings-access-command-voice.js.
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
