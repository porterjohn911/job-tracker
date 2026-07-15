// Environment, company configuration, and auth gates
// Generated from src/app.js lines 1-268.
// ══════════════════════════════════════════════════════════════════
// ENVIRONMENT SWITCH — this is the ONLY line that differs between the
// production file (your team uses this) and the dev file (you work here).
//   'prod' → live team data    |    'dev' → isolated sandbox data
// ══════════════════════════════════════════════════════════════════
const ENV = 'prod';

// All data (localStorage + the Firebase node) is namespaced by ENV, so
// the dev copy reads/writes a completely separate sandbox and can never
// affect what the team sees in production.
// ── Multi-company support ───────────────────────────────────────────
// Each company keeps completely isolated data (its own Firebase node +
// localStorage namespace). Waterfront keeps the original 'wfs' namespace
// so every bit of existing data is preserved untouched. The chosen
// company is remembered in one global key shared across all companies.
// Square brand emblem for Manufactured Housing Solutions, styled to match
// the supplied logo (dark field, gold corner brackets + accent line, white
// MHS wordmark, steel-blue detail).
const MHS_LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
<rect width="192" height="192" rx="40" fill="#0b0f17"/>
<g fill="none" stroke="#e8a830" stroke-width="5" stroke-linecap="square">
<path d="M30 50V30H50"/><path d="M142 30H162V50"/><path d="M162 142V162H142"/><path d="M50 162H30V142"/>
</g>
<text x="96" y="103" text-anchor="middle" font-family="'DM Sans',Arial,sans-serif" font-weight="700" font-size="56" letter-spacing="1" fill="#ffffff">MHS</text>
<line x1="60" y1="123" x2="132" y2="123" stroke="#e8a830" stroke-width="3.5"/>
<circle cx="60" cy="123" r="4.5" fill="#e8a830"/><circle cx="132" cy="123" r="4.5" fill="#e8a830"/>
<text x="96" y="146" text-anchor="middle" font-family="'DM Sans',Arial,sans-serif" font-weight="600" font-size="12.5" letter-spacing="4" fill="#9fb1c4">SOLUTIONS</text>
</svg>`;

// Full horizontal MHS lockup with its own dark panel, so it reads on any
// surface (used on invoice letterheads — email and printed/PDF).
const MHS_LOGO_FULL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 280">
<rect width="720" height="280" rx="22" fill="#0b0f17"/>
<g fill="none" stroke="#e8a830" stroke-width="2.5" stroke-linecap="square">
<path d="M40 60V38H78"/><path d="M642 38H680V60"/><path d="M680 220V242H642"/><path d="M78 242H40V220"/>
<line x1="92" y1="38" x2="628" y2="38"/><line x1="92" y1="242" x2="628" y2="242"/>
</g>
<text x="360" y="116" text-anchor="middle" font-family="'DM Sans',Arial,sans-serif" font-weight="800" font-size="54" letter-spacing="1" fill="#ffffff">MANUFACTURED</text>
<line x1="170" y1="134" x2="550" y2="134" stroke="#e8a830" stroke-width="2.5"/>
<circle cx="170" cy="134" r="5" fill="#e8a830"/><circle cx="550" cy="134" r="5" fill="#e8a830"/>
<g fill="none" stroke="#e8a830" stroke-width="2.5"><path d="M150 100H132V168H150"/><path d="M570 100H588V168H570"/></g>
<text x="360" y="178" text-anchor="middle" font-family="'DM Sans',Arial,sans-serif" font-weight="600" font-size="38" letter-spacing="16" fill="#9fb1c4">HOUSING</text>
<line x1="210" y1="196" x2="510" y2="196" stroke="#2a3850" stroke-width="1"/>
<text x="360" y="224" text-anchor="middle" font-family="'DM Sans',Arial,sans-serif" font-weight="700" font-size="21" letter-spacing="10" fill="#e8a830">SOLUTIONS</text>
<text x="360" y="250" text-anchor="middle" font-family="'DM Sans',Arial,sans-serif" font-weight="500" font-size="11.5" letter-spacing="5" fill="#5a7088">FULL SERVICE CONSTRUCTION</text>
</svg>`;

// Owner-mode emblem (growth chart) — signals the cross-company workspace.
const OWNER_LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
<rect width="192" height="192" rx="40" fill="#1e1b2e"/>
<rect x="46" y="106" width="22" height="44" rx="3" fill="#7c6cc4"/>
<rect x="85" y="80" width="22" height="70" rx="3" fill="#a99ce0"/>
<rect x="124" y="58" width="22" height="92" rx="3" fill="#e8a830"/>
<path d="M57 96 L96 68 L135 48" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
<circle cx="57" cy="96" r="5.5" fill="#a99ce0"/><circle cx="96" cy="68" r="5.5" fill="#e8a830"/><circle cx="135" cy="48" r="5.5" fill="#ffffff"/>
</svg>`;
const _navIcon=d=>`<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="${d}"/></svg>`;
const OWNER_NAV = `
  <button class="nav-btn" data-view="o_overview">${_navIcon('M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z')}Overview</button>
  <button class="nav-btn" data-view="o_schedule">${_navIcon('M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5')}Schedule</button>
  <button class="nav-btn" data-view="o_financials">${_navIcon('M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z')}Financials</button>
  <button class="nav-btn" data-view="o_pipeline">${_navIcon('M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z')}Pipeline</button>
  <button class="nav-btn" data-view="o_leads">${_navIcon('M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z')}Leads</button>
  <button class="nav-btn" data-view="o_companies">${_navIcon('M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21')}Companies</button>
  <button class="nav-btn" data-view="o_hours">${_navIcon('M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z')}Hours</button>
`;

const COMPANIES = {
  wfs: { id:'wfs', ns:'wfs', label:'Waterfront Solutions',           tag:'Construction & Waterfront Services',
         inv:{ band:'linear-gradient(135deg,#0a3d2e 0%,#1a6e55 100%)', primary:'#0a3d2e', link:'#0f5040', notesBar:'#1a6e55', rule:'#0a3d2e' } },
  mhs: { id:'mhs', ns:'mhs', label:'Manufactured Housing Solutions', tag:'Full Service Construction', logoSvg:MHS_LOGO, logoFull:MHS_LOGO_FULL,
         theme:{ headerBg:'linear-gradient(135deg,#0a0e16 0%,#141a26 55%,#202c3d 100%)', syncBg:'#0a0e16', navActive:'#33506f' },
         inv:{ band:'linear-gradient(135deg,#0a0e16 0%,#202c3d 100%)', primary:'#1f2a3a', link:'#33506f', notesBar:'#e8a830', rule:'#e8a830' } },
  nlr: { id:'nlr', ns:'nlr', label:'Norris Lake Roofing',            tag:'Roofing & Exteriors' },
};
// Invoice palette helpers — default matches Waterfront so other companies
// (and any without an override) keep the original green invoice styling.
const INV_DEFAULT={ band:'linear-gradient(135deg,#0a3d2e 0%,#1a6e55 100%)', primary:'#0a3d2e', link:'#0f5040', notesBar:'#1a6e55', rule:'#0a3d2e' };
function invTheme(){ return ACTIVE_CO.inv||INV_DEFAULT }
function brandLogoFull(){ return ACTIVE_CO.logoFull?'data:image/svg+xml;utf8,'+encodeURIComponent(ACTIVE_CO.logoFull):'' }
const _stored = (() => { try { return localStorage.getItem('jt_company'); } catch (e) { return null; } })();

// ── Access control (passcode gate; per-user roles) ──────────────────
// Soft, client-side gate until Firebase Auth lands next. A global access
// list (jt_access) defines members with a role + home company + PIN.
// Workers are pinned to their own company; managers and owners can view
// every company and the Owner workspace. Roles carry over to real logins.
const ACCESS_KEY='jt_access'+(ENV==='dev'?'_dev':'');
const SESSION_KEY='jt_session'+(ENV==='dev'?'_dev':'');
function loadAccess(){try{const a=JSON.parse(localStorage.getItem(ACCESS_KEY)||'null');if(a&&Array.isArray(a.members))return a}catch(e){}return null}
let ACCESS=loadAccess();
function accessEnabled(){return !!(ACCESS&&ACCESS.enabled&&ACCESS.members&&ACCESS.members.length)}
function findMember(id){return (ACCESS&&ACCESS.members||[]).find(m=>m.id===id)||null}
function canSeeAll(m){return !!(m&&(m.role==='owner'||m.role==='manager'))}
function isOwnerRole(m){return !!(m&&m.role==='owner')}
function canSeeFinancials(m=SESSION){return !gateOn()||canSeeAll(m)}
function canSeeBank(m=SESSION){return !gateOn()||isOwnerRole(m)}
function canOpenView(v){
  if(v==='reports')return canSeeFinancials();
  if(v==='bank')return canSeeBank();
  return true;
}
let SESSION=accessEnabled()?(()=>{try{return findMember(localStorage.getItem(SESSION_KEY))}catch(e){return null}})():null;
const LOCKED=accessEnabled()&&!SESSION;

// Resolve workspace, honoring the signed-in member's permissions.
let _want=_stored;
if(SESSION&&!canSeeAll(SESSION))_want=SESSION.company; // workers are pinned to their company
const OWNER_MODE = _want==='owner' && (!accessEnabled()||canSeeAll(SESSION));
const COMPANY_ID = (_want && COMPANIES[_want]) ? _want : (SESSION&&!canSeeAll(SESSION)&&COMPANIES[SESSION.company]?SESSION.company:'wfs');
const ACTIVE_CO = COMPANIES[COMPANY_ID];
document.title = OWNER_MODE ? 'Job Tracker — Owner' : ('Job Tracker — ' + ACTIVE_CO.label);

// Data (localStorage + the Firebase node) is namespaced by company AND by
// ENV, so each company's prod and dev sandboxes stay completely separate.
const DB_NS = ACTIVE_CO.ns + (ENV === 'dev' ? '_dev' : '');
const LS = k => ACTIVE_CO.ns + (ENV === 'dev' ? '_dev_' : '_') + k;

// The Firebase connection config is shared (key 'wfs_fb'), so once you
// set up Firebase in either file the other auto-connects to the same
// project — just a different data node, so the data stays isolated.
if (ENV === 'dev') {
  document.addEventListener('DOMContentLoaded', () => {
    document.title = '[DEV] ' + document.title;
    const b = document.createElement('div');
    b.textContent = 'DEV SANDBOX — separate data, safe to experiment. Team production is unaffected.';
    b.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#b45309;color:#fff;font:600 12px/1.4 \'DM Sans\',sans-serif;text-align:center;padding:7px 12px;letter-spacing:.4px';
    document.body.appendChild(b);
  });
}

// ══ Firebase config ══
// Production loads this from a Netlify function backed by environment
// variables. Local/dev users can still paste config through Connect Team.
const FIREBASE_CONFIG_BAKED = null;
let FIREBASE_CONFIG = FIREBASE_CONFIG_BAKED;
try{const s=localStorage.getItem('wfs_fb');if(!FIREBASE_CONFIG&&s)FIREBASE_CONFIG=JSON.parse(s)}catch(e){}
async function loadRuntimeFirebaseConfig(){
  if(FIREBASE_CONFIG||location.protocol==='file:')return;
  if(['localhost','127.0.0.1','::1'].includes(location.hostname))return;
  try{
    const r=await fetch('/.netlify/functions/app-config',{headers:{Accept:'application/json'}});
    if(!r.ok)return;
    const cfg=await r.json();
    if(cfg&&cfg.apiKey&&cfg.projectId)FIREBASE_CONFIG=cfg;
  }catch(e){}
}

// ── Firebase Authentication gate (real logins + roles) ───────────────
// Active whenever a Firebase config is present and the Auth SDK loaded.
// Each signed-in user maps to /users/{uid} = {name,email,role,company}.
// Roles: worker (one company) · manager/owner (all). The first account to
// sign in (empty /users) is auto-promoted to owner; later sign-ups start
// "pending" until an owner assigns them. Database rules enforce all of this
// server-side — these client checks only shape the UI.
let FB_AUTH_ON = !!(FIREBASE_CONFIG && typeof firebase!=='undefined' && firebase.auth);
function refreshFirebaseAuthFlag(){FB_AUTH_ON=!!(FIREBASE_CONFIG&&typeof firebase!=='undefined'&&firebase.auth)}
function gateOn(){return FB_AUTH_ON||accessEnabled()}
function canSeeAllRec(r){return !!(r&&(r.role==='owner'||r.role==='manager'))}
let FB_USER=null;
function ensureLockRoot(){let r=document.getElementById('lock-root');if(!r){r=document.createElement('div');r.id='lock-root';document.body.appendChild(r)}return r}
function authLockIcon(){return '<div class="lock-ico"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/></svg></div>'}
function startAuthGate(){
  try{if(!firebase.apps.length)firebase.initializeApp(FIREBASE_CONFIG)}catch(e){}
  let auth;try{auth=firebase.auth()}catch(e){bootApp();return}
  try{auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)}catch(e){}
  showAuthLoading();
  auth.onAuthStateChanged(u=>handleAuthUser(auth,u));
}
async function handleAuthUser(auth,user){
  if(!user){showAuthScreen(auth,'');return}
  showAuthLoading();
  try{
    const db=firebase.database();
    const uref=db.ref('users/'+user.uid);
    let rec=null;
    try{const s=await uref.get();rec=s.exists()?s.val():null}catch(e){}
    if(!rec){
      const base={name:(user.displayName||(user.email||'').split('@')[0]||'User'),email:user.email||''};
      // first user, OR /users unreadable under locked rules -> attempt owner; the DB rule is the real gatekeeper (only succeeds if /users is truly empty)
      let firstish=false;
      try{const all=await db.ref('users').get();firstish=!all.exists()}catch(e){firstish=true}
      rec={...base,role:firstish?'owner':'pending',company:firstish?'all':''};
      try{await uref.set(rec)}
      catch(e){rec={...base,role:'pending',company:''};try{await uref.set(rec)}catch(e2){}}
    }
    FB_USER={uid:user.uid,...rec};
    SESSION={uid:user.uid,name:rec.name,role:rec.role,company:rec.company};
    if(rec.role==='pending'||!rec.role){showPendingScreen(auth,rec);return}
    if(!canSeeAllRec(rec)){
      let cur=null;try{cur=localStorage.getItem('jt_company')}catch(e){}
      if(rec.company&&cur!==rec.company){try{localStorage.setItem('jt_company',rec.company)}catch(e){}location.reload();return}
    }
    hideAuthScreen();
    bootApp();
  }catch(e){showAuthScreen(auth,(e&&e.message)||'Sign-in error')}
}
function showAuthLoading(){ensureLockRoot().innerHTML=`<div class="lock-bd"><div class="lock-card">${authLockIcon()}<div class="lock-sub" style="margin-top:10px">Loading…</div></div></div>`}
function showAuthScreen(auth,errMsg){
  const root=ensureLockRoot();
  root.innerHTML=`<div class="lock-bd"><div class="lock-card">
    ${authLockIcon()}
    <div class="lock-title">Sign in</div>
    <div class="lock-sub" id="auth-sub">Use your work email and password</div>
    <input id="auth-email" class="auth-in" type="email" placeholder="you@company.com" autocomplete="username">
    <input id="auth-pass" class="auth-in" type="password" placeholder="Password" autocomplete="current-password">
    <div class="lock-err" id="auth-err">${errMsg?esc(errMsg):''}</div>
    <button class="lock-btn" id="auth-go" type="button">Sign In</button>
    <div style="display:flex;justify-content:space-between;margin-top:12px;font-size:12px">
      <a href="#" id="auth-signup" style="color:var(--green-700);text-decoration:none">Create account</a>
      <a href="#" id="auth-reset" style="color:var(--text-3);text-decoration:none">Forgot password?</a>
    </div>
  </div></div>`;
  let mode='signin';
  const setErr=t=>{const e=document.getElementById('auth-err');if(e)e.textContent=t};
  document.getElementById('auth-signup').onclick=e=>{e.preventDefault();mode=mode==='signup'?'signin':'signup';document.getElementById('auth-go').textContent=mode==='signup'?'Create Account':'Sign In';document.getElementById('auth-sub').textContent=mode==='signup'?'Create your account — an owner grants access after':'Use your work email and password';document.getElementById('auth-signup').textContent=mode==='signup'?'Have an account? Sign in':'Create account';setErr('')};
  document.getElementById('auth-reset').onclick=async e=>{e.preventDefault();const em=(document.getElementById('auth-email').value||'').trim();if(!em){setErr('Enter your email first');return}try{await auth.sendPasswordResetEmail(em);setErr('Password reset email sent.')}catch(err){setErr((err&&err.message)||'Could not send reset')}};
  async function go(){
    const em=(document.getElementById('auth-email').value||'').trim();const pw=document.getElementById('auth-pass').value||'';
    if(!em||!pw){setErr('Enter email and password');return}
    setErr('');const btn=document.getElementById('auth-go');btn.textContent='…';
    try{if(mode==='signup')await auth.createUserWithEmailAndPassword(em,pw);else await auth.signInWithEmailAndPassword(em,pw);}
    catch(err){setErr((err&&err.message)||'Sign-in failed');btn.textContent=mode==='signup'?'Create Account':'Sign In'}
  }
  document.getElementById('auth-go').onclick=go;
  document.getElementById('auth-pass').onkeydown=e=>{if(e.key==='Enter')go()};
  setTimeout(()=>{try{document.getElementById('auth-email').focus()}catch(e){}},60);
}
function showPendingScreen(auth,rec){
  ensureLockRoot().innerHTML=`<div class="lock-bd"><div class="lock-card">
    ${authLockIcon()}
    <div class="lock-title">Awaiting access</div>
    <div class="lock-sub">You're signed in as ${esc(rec.email||rec.name||'')}, but an owner hasn't granted you a company yet. You'll get in as soon as they assign you.</div>
    <button class="lock-btn" id="auth-out" type="button" style="margin-top:16px">Sign out</button>
  </div></div>`;
  document.getElementById('auth-out').onclick=()=>{try{auth.signOut()}catch(e){}};
}
function hideAuthScreen(){const r=document.getElementById('lock-root');if(r)r.innerHTML=''}
async function showFbUserAdmin(){
  if(!(FB_USER&&FB_USER.role==='owner')){toast('Only owners can manage access','');return}
  $('modal-root').innerHTML=`<div class="modal-bd" id="mbd" role="dialog" aria-modal="true" aria-label="Team access"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Team Access &amp; Roles</div><button class="modal-close" id="mc" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body" id="fbu-body"><p style="font-size:13px;color:var(--text-3)">Loading team…</p></div>
  </div></div>`;
  $('mc').onclick=closeModal;$('mbd').onclick=e=>{if(e.target===e.currentTarget)closeModal()};
  try{const snap=await firebase.database().ref('users').get();renderFbUserList(snap.exists()?snap.val():{});}
  catch(e){const b=$('fbu-body');if(b)b.innerHTML='<p style="color:var(--red);font-size:13px">Could not load users: '+esc(e.message||'')+'</p>'}
}
function renderFbUserList(users){
  const b=$('fbu-body');if(!b)return;
  const ids=Object.keys(users);
  const coOpts=c=>Object.values(COMPANIES).map(co=>`<option value="${esc(co.id)}" ${c===co.id?'selected':''}>${esc(co.label)}</option>`).join('');
  const roleOpts=r=>['worker','manager','owner'].map(x=>`<option value="${x}" ${r===x?'selected':''}>${x[0].toUpperCase()+x.slice(1)}</option>`).join('');
  b.innerHTML=`
    <p style="font-size:12px;color:var(--text-2);line-height:1.5;margin-bottom:12px">People who sign in appear here as <strong>pending</strong>. Set each person's role and company, then Save. Workers see only their company; managers &amp; owners see all.</p>
    ${ids.length?ids.map(uid=>{const u=users[uid]||{};const pend=(u.role==='pending'||!u.role);return `<div class="acc-row" data-fbu="${esc(uid)}" style="flex-wrap:wrap;gap:8px">
      <div class="acc-info" style="flex:1 1 100%"><div class="acc-name">${esc(u.name||u.email||uid)}${pend?' <span class="acc-role" style="background:var(--gold-light);color:#92400e">pending</span>':''}</div><div class="acc-meta">${esc(u.email||'')}</div></div>
      <select class="form-select" style="flex:1;min-width:110px" data-fbu-role>${roleOpts(pend?'worker':u.role)}</select>
      <select class="form-select" style="flex:1;min-width:130px" data-fbu-co>${coOpts(u.company)}</select>
      <button class="btn-sm" data-fbu-save type="button">Save</button>
    </div>`}).join(''):'<p style="font-size:13px;color:var(--text-3)">No one has signed in yet. Share the app link — people sign in and show up here to assign.</p>'}
  `;
  b.querySelectorAll('[data-fbu]').forEach(row=>{
    const roleSel=row.querySelector('[data-fbu-role]'),coSel=row.querySelector('[data-fbu-co]');
    const sync=()=>{coSel.style.display=roleSel.value==='worker'?'':'none'};roleSel.onchange=sync;sync();
    row.querySelector('[data-fbu-save]').onclick=async()=>{
      const uid=row.dataset.fbu,role=roleSel.value,company=role==='worker'?coSel.value:'all',u=users[uid]||{};
      try{await firebase.database().ref('users/'+uid).update({role,company,name:u.name||'',email:u.email||''});u.role=role;u.company=company;toast('Saved')}catch(e){toast('Save failed: '+(e.message||''),'')}
    };
  });
}
