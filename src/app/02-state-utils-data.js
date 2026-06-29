// State, utilities, local storage, Firebase, and time helpers
// Generated from src/app.js lines 269-498.
// ══ State ══
let DB=null;
let MAP=null,MAP_MARKERS=[];
const S={jobs:{},activity:[],members:[],view:'dashboard',detail:null,detailTab:'overview',filter:'all',search:'',photoCat:'all',calMonth:new Date().getMonth(),calYear:new Date().getFullYear(),calSelected:null,calMode:localStorage.getItem(LS('calmode'))||'month',reportRange:'90',sort:localStorage.getItem(LS('sort'))||'newest',sortOpen:false,bulkMode:false,bulkSel:new Set(),invFilter:'all',invSearch:'',invSort:'date',user:localStorage.getItem(LS('user'))||'',notifReadAt:parseInt(localStorage.getItem(LS('notif_read'))||'0',10),refFilter:'all',referrals:{},timeEntries:{},payRates:{},transactions:{},owner:{}};
const UNDO={stack:[],push(op){this.stack.push(op);if(this.stack.length>20)this.stack.shift()},pop(){return this.stack.pop()}};

// ── Company info for invoice letterhead (editable via Settings)
// Shared business mailing address — the same for every company, shown on all
// invoice & estimate templates.
const BIZ_ADDRESS='189 Ross Estates Rd. Kingston, TN 37763';
const COMPANY_DEFAULT={
  name:ACTIVE_CO.label,
  address:'LaFollette, TN',
  phone:'',
  email:'',
  website:'',
  license:'',
  taxRate:'',
  terms:'Payment due upon receipt unless otherwise noted. Thank you for your business.',
};
function loadCompany(){try{const s=localStorage.getItem(LS('company'));return s?{...COMPANY_DEFAULT,...JSON.parse(s)}:{...COMPANY_DEFAULT}}catch(e){return{...COMPANY_DEFAULT}}}
function saveCompany(c){localStorage.setItem(LS('company'),JSON.stringify(c))}
let COMPANY=loadCompany();

// ── Workflow stages (BuilderTrend / AccuLynx style)
const STAGES=['Lead','Estimate','Approved','Scheduled','In Progress','Punch List','Complete'];
const STAGE_TO_STATUS={'Lead':'lead','Estimate':'lead','Approved':'active','Scheduled':'active','In Progress':'active','Punch List':'active','Complete':'complete'};
const PHOTO_CATS=['all','before','during','after','damage','docs'];
const LEAD_SOURCES=['Referral','Repeat Customer','Google Search','Facebook / Social','Yard Sign','Drive-By','Website','Phone Call','Walk-In','Other'];
const RECEIPT_CATS=['Materials','Tools / Equipment','Fuel / Travel','Subcontractor','Permits / Fees','Labor','Meals','Other'];
function receiptTotal(j){return (j.receipts||[]).reduce((s,r)=>s+Number(r.amount||0),0)}

// ══ Helpers ══
const $=id=>document.getElementById(id);
const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function ago(ts){const s=Math.floor((Date.now()-ts)/1000);if(s<60)return'just now';if(s<3600)return Math.floor(s/60)+'m ago';if(s<86400)return Math.floor(s/3600)+'h ago';return new Date(ts).toLocaleDateString()}
function uid(){return'j_'+Date.now()+'_'+Math.random().toString(36).slice(2,6)}
function jobs(){
  const all=Object.values(S.jobs);
  const cmp={
    newest:(a,b)=>(b.created||0)-(a.created||0),
    oldest:(a,b)=>(a.created||0)-(b.created||0),
    name:(a,b)=>(a.name||'').localeCompare(b.name||''),
    value:(a,b)=>Number(b.value||0)-Number(a.value||0),
    due:(a,b)=>{const ad=a.dueDate||'9999',bd=b.dueDate||'9999';return ad.localeCompare(bd)},
    progress:(a,b)=>(b.progress||0)-(a.progress||0),
  };
  const fn=cmp[S.sort]||cmp.newest;
  return all.sort((a,b)=>{
    const af=a.favorite?1:0,bf=b.favorite?1:0;
    if(af!==bf)return bf-af;
    return fn(a,b);
  });
}
function initials(name){return(name||'?')[0].toUpperCase()}
function money(n){const v=Number(n||0);return '$'+v.toLocaleString(undefined,{maximumFractionDigits:0})}
function money2(n){const v=Number(n||0);return '$'+v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
function dateKey(d){const x=d instanceof Date?d:new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')}
function fmtDate(s){if(!s)return'';try{const d=new Date(s+(s.length===10?'T00:00:00':''));return d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}catch(e){return s}}
function fmtShort(s){if(!s)return'';try{const d=new Date(s+(s.length===10?'T00:00:00':''));return d.toLocaleDateString(undefined,{month:'short',day:'numeric'})}catch(e){return s}}
function daysUntil(s){if(!s)return null;try{const d=new Date(s+(s.length===10?'T00:00:00':''));const t=new Date();t.setHours(0,0,0,0);return Math.round((d-t)/(1000*60*60*24))}catch(e){return null}}
function jobBalance(j){const inv=Number(j.invoiced||0),paid=Number(j.paid||0);return inv-paid}
function jobStage(j){return j.stage||(j.status==='complete'?'Complete':j.status==='lead'?'Lead':'In Progress')}

// ── Invoice helpers ──
function calcInvoice(inv){
  const items=inv.items||[];
  const sub=items.reduce((s,i)=>s+(Number(i.qty||0)*Number(i.rate||0)),0);
  const tax=sub*(Number(inv.taxRate||0)/100);
  const total=sub+tax;
  const deposit=Number(inv.deposit||0);
  const paid=Number(inv.paid||0);
  const balance=total-paid;
  return {sub,tax,total,deposit,paid,balance};
}
function nextInvoiceNumber(){
  let max=1000;
  Object.values(S.jobs).forEach(j=>{
    (j.invoices||[]).forEach(inv=>{
      const m=String(inv.number||'').match(/(\d+)/);
      if(m){const n=parseInt(m[1],10);if(n>max)max=n}
    });
  });
  return 'INV-'+(max+1);
}
function nextEstimateNumber(){
  let max=1000;
  Object.values(S.jobs).forEach(j=>{(j.estimates||[]).forEach(e=>{const m=String(e.number||'').match(/(\d+)/);if(m){const n=parseInt(m[1],10);if(n>max)max=n}})});
  return 'EST-'+(max+1);
}
function invoiceTotals(j){
  const invs=j.invoices||[];
  if(!invs.length)return null;
  const inv=invs.reduce((s,i)=>{const c=calcInvoice(i);return{total:s.total+c.total,paid:s.paid+c.paid,balance:s.balance+c.balance}},{total:0,paid:0,balance:0});
  return inv;
}
function invoiceStatus(inv){
  const c=calcInvoice(inv);
  if(c.total>0&&c.balance<=0.005)return'paid';
  if(inv.status==='sent'){
    if(inv.dueDate){const d=daysUntil(inv.dueDate);if(d!==null&&d<0)return'overdue'}
    return'sent';
  }
  return inv.status||'draft';
}
function getBrandLogoSrc(){
  const el=document.querySelector('.brand-logo');
  return el?el.src:'';
}

function toast(msg,icon='check',undoFn){
  const t=$('toast');
  const icons={check:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>',photo:'📷',note:'💬',undo:'↩'};
  t.classList.toggle('undo',!!undoFn);
  t.innerHTML=(icons[icon]||'')+'<span>'+esc(msg)+'</span>'+(undoFn?'<button class="toast-action" id="toast-undo">Undo</button>':'');
  t.classList.add('show');
  clearTimeout(t._t);t._t=setTimeout(()=>{t.classList.remove('show','undo')},undoFn?6000:2600);
  if(undoFn){
    const btn=document.getElementById('toast-undo');
    if(btn)btn.onclick=()=>{clearTimeout(t._t);t.classList.remove('show','undo');undoFn()};
  }
}
function undoLast(){const op=UNDO.pop();if(!op){toast('Nothing to undo','');return}op();}

// ══ DB layer ══
const LOCAL={
  load(){try{S.jobs=JSON.parse(localStorage.getItem(LS('jobs'))||'{}')}catch(e){S.jobs={}}try{S.activity=JSON.parse(localStorage.getItem(LS('activity'))||'[]')}catch(e){S.activity=[]}try{S.members=JSON.parse(localStorage.getItem(LS('members'))||'[]')}catch(e){S.members=[]}try{S.referrals=JSON.parse(localStorage.getItem(LS('referrals'))||'{}')}catch(e){S.referrals={}}try{S.timeEntries=JSON.parse(localStorage.getItem(LS('time'))||'{}')}catch(e){S.timeEntries={}}try{S.payRates=JSON.parse(localStorage.getItem(LS('payrates'))||'{}')}catch(e){S.payRates={}}try{S.transactions=JSON.parse(localStorage.getItem(LS('transactions'))||'{}')}catch(e){S.transactions={}}},
  saveJobs(){try{localStorage.setItem(LS('jobs'),JSON.stringify(S.jobs))}catch(e){}},
  saveActivity(){try{localStorage.setItem(LS('activity'),JSON.stringify(S.activity.slice(0,300)))}catch(e){}},
  saveMembers(){try{localStorage.setItem(LS('members'),JSON.stringify(S.members))}catch(e){}},
  saveReferrals(){try{localStorage.setItem(LS('referrals'),JSON.stringify(S.referrals))}catch(e){}},
  saveTime(){try{localStorage.setItem(LS('time'),JSON.stringify(S.timeEntries))}catch(e){}},
  savePayRates(){try{localStorage.setItem(LS('payrates'),JSON.stringify(S.payRates))}catch(e){}},
  saveTransactions(){try{localStorage.setItem(LS('transactions'),JSON.stringify(S.transactions))}catch(e){}}
};
function syncStatus(state,msg){const d=$('sync-dot'),t=$('sync-text');d.className='sync-dot '+state;t.textContent=msg}

// ══ Cloud file storage (Firebase Storage) ══
// Photos, receipts and documents upload to Firebase Storage and we keep only
// the short https download URL in the job record — instead of a base64 string
// that can be hundreds of KB each. That frees localStorage + the Realtime DB,
// letting the app hold far more photos (Storage gives gigabytes vs the ~5MB
// localStorage cap). If Storage is unavailable (offline, not enabled yet, or
// upload fails) we fall back to embedding base64 inline, exactly as before, so
// nothing is ever lost.
function storageReady(){try{return !!(FIREBASE_CONFIG&&typeof firebase!=='undefined'&&firebase.storage&&firebase.apps.length)}catch(e){return false}}
function canvasToBlob(canvas,type,quality){return new Promise(res=>{try{canvas.toBlob(b=>res(b),type,quality)}catch(e){res(null)}})}
async function uploadToStorage(blobOrFile,subpath,ext){
  if(!storageReady()||!blobOrFile)return null;
  try{
    const ns=(DB_NS||'data').replace(/[^a-zA-Z0-9_-]/g,'');
    const safeExt=(ext||'').replace(/[^a-zA-Z0-9]/g,'').slice(0,8);
    const path=ns+'/'+subpath+'/'+Date.now()+'_'+Math.random().toString(36).slice(2,8)+(safeExt?'.'+safeExt:'');
    const ref=firebase.storage().ref(path);
    const snap=await ref.put(blobOrFile);
    const url=await snap.ref.getDownloadURL();
    return {url,path};
  }catch(e){return null}
}
async function deleteStoragePath(path){if(!path||!storageReady())return;try{await firebase.storage().ref(path).delete()}catch(e){}}
function initFB(cfg){
  try{
    if(!firebase.apps.length)firebase.initializeApp(cfg);
    DB=firebase.database().ref(DB_NS);
    syncStatus('pulse','Connecting…');
    DB.child('jobs').on('value',s=>{S.jobs=s.val()||{};LOCAL.saveJobs();syncStatus('ok','Team sync live');render()});
    DB.child('activity').on('value',s=>{const r=s.val();S.activity=r?Object.values(r).sort((a,b)=>b.time-a.time):[];LOCAL.saveActivity()});
    DB.child('members').on('value',s=>{S.members=s.val()||[];LOCAL.saveMembers();render()});
    DB.child('referrals').on('value',s=>{S.referrals=s.val()||{};LOCAL.saveReferrals();render()});
    DB.child('time').on('value',s=>{S.timeEntries=s.val()||{};LOCAL.saveTime();render()});
    DB.child('payrates').on('value',s=>{S.payRates=s.val()||{};LOCAL.savePayRates();render()});
    DB.child('transactions').on('value',s=>{S.transactions=s.val()||{};LOCAL.saveTransactions();render()});
    DB.child('.info/connected').on('value',s=>{if(!s.val())syncStatus('err','Reconnecting…')});
    return true;
  }catch(e){syncStatus('err','Firebase error');return false}
}
async function writeJob(j){S.jobs[j.id]=j;LOCAL.saveJobs();if(DB)await DB.child('jobs/'+j.id).set(j).catch(()=>{})}
async function deleteJobDB(id){delete S.jobs[id];LOCAL.saveJobs();if(DB)await DB.child('jobs/'+id).remove().catch(()=>{})}
async function logAct(action,job){const e={user:S.user||'Someone',action,job:job||'',time:Date.now()};S.activity.unshift(e);LOCAL.saveActivity();if(DB)await DB.child('activity').push(e).catch(()=>{})}
async function saveMembers(){LOCAL.saveMembers();if(DB)await DB.child('members').set(S.members).catch(()=>{})}
async function writeReferral(r){S.referrals[r.id]=r;LOCAL.saveReferrals();if(DB)await DB.child('referrals/'+r.id).set(r).catch(()=>{})}
async function deleteReferralDB(id){delete S.referrals[id];LOCAL.saveReferrals();if(DB)await DB.child('referrals/'+id).remove().catch(()=>{})}

// ── Time tracking (clock in / clock out) ──
async function writeTimeEntry(t){S.timeEntries[t.id]=t;LOCAL.saveTime();if(DB)await DB.child('time/'+t.id).set(t).catch(()=>{})}
async function deleteTimeEntryDB(id){delete S.timeEntries[id];LOCAL.saveTime();if(DB)await DB.child('time/'+id).remove().catch(()=>{})}
function tid(){return't_'+Date.now()+'_'+Math.random().toString(36).slice(2,6)}
function timeList(){return Object.values(S.timeEntries||{})}
function activeEntry(member){return timeList().find(t=>t.member===member&&!t.end)}
function entryDur(t){return Math.max(0,(t.end||Date.now())-t.start)}
function fmtHM(ms){const m=Math.floor(Math.max(0,ms)/60000);const h=Math.floor(m/60);return (h?h+'h ':'')+(m%60)+'m'}
function fmtHMS(ms){const s=Math.floor(Math.max(0,ms)/1000);const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=s%60;const p=n=>String(n).padStart(2,'0');return (h?h+':':'')+p(m)+':'+p(ss)}
function fmtClockT(ts){try{return new Date(ts).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}catch(e){return''}}
function dtLocalValue(ts){const d=new Date(ts);const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes())}
function dtLocalParse(v){if(!v)return null;const t=new Date(v).getTime();return isNaN(t)?null:t}
function weekStart(){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-d.getDay());return d.getTime()}
let TIME_TICK=null;
function stopTimeTick(){if(TIME_TICK){clearInterval(TIME_TICK);TIME_TICK=null}}
function startTimeTick(){stopTimeTick();TIME_TICK=setInterval(()=>{document.querySelectorAll('[data-tick-start]').forEach(el=>{const s=parseInt(el.getAttribute('data-tick-start'),10);if(s)el.textContent=fmtHMS(Date.now()-s)})},1000)}
// ── Labor cost roll-ups ──
async function savePayRates(){LOCAL.savePayRates();if(DB)await DB.child('payrates').set(S.payRates).catch(()=>{})}
function rateOf(m){return Number((S.payRates||{})[m]||0)}
function hoursOf(ms){return ms/3600000}
function jobLaborStats(jobId){let ms=0,cost=0,active=0;timeList().forEach(t=>{if((t.job||'')!==jobId)return;const d=entryDur(t);ms+=d;cost+=hoursOf(d)*rateOf(t.member);if(!t.end)active++});return{ms,hours:hoursOf(ms),cost,active}}
function laborByJob(){const map={};timeList().forEach(t=>{const k=t.job||'';const e=map[k]||(map[k]={ms:0,cost:0,active:0});const d=entryDur(t);e.ms+=d;e.cost+=hoursOf(d)*rateOf(t.member);if(!t.end)e.active++});return map}

// ── Owner mode: read every company's jobs (read-only, all nodes) ──
function ownerPrefix(co){return co.ns+(ENV==='dev'?'_dev_':'_')}
function ownerNode(co){return co.ns+(ENV==='dev'?'_dev':'')}
function ownerLoadLocal(){S.owner=S.owner||{};S.ownerTime=S.ownerTime||{};S.ownerRates=S.ownerRates||{};Object.values(COMPANIES).forEach(co=>{try{S.owner[co.id]=Object.values(JSON.parse(localStorage.getItem(ownerPrefix(co)+'jobs')||'{}')||{})}catch(e){S.owner[co.id]=[]}try{S.ownerTime[co.id]=Object.values(JSON.parse(localStorage.getItem(ownerPrefix(co)+'time')||'{}')||{})}catch(e){S.ownerTime[co.id]=[]}try{S.ownerRates[co.id]=JSON.parse(localStorage.getItem(ownerPrefix(co)+'payrates')||'{}')||{}}catch(e){S.ownerRates[co.id]={}}})}
function ownerInitFB(cfg){
  try{
    if(!firebase.apps.length)firebase.initializeApp(cfg);
    syncStatus('pulse','Connecting…');
    Object.values(COMPANIES).forEach(co=>{
      firebase.database().ref(ownerNode(co)).child('jobs').on('value',s=>{S.owner=S.owner||{};S.owner[co.id]=Object.values(s.val()||{});syncStatus('ok','Live · all companies');render()});
      firebase.database().ref(ownerNode(co)).child('time').on('value',s=>{S.ownerTime=S.ownerTime||{};S.ownerTime[co.id]=Object.values(s.val()||{});render()});
      firebase.database().ref(ownerNode(co)).child('payrates').on('value',s=>{S.ownerRates=S.ownerRates||{};S.ownerRates[co.id]=s.val()||{};render()});
    });
    firebase.database().ref('.info/connected').on('value',s=>{if(!s.val())syncStatus('err','Reconnecting…')});
    return true;
  }catch(e){syncStatus('err','Firebase error');return false}
}
function ownerJobs(id){return (S.owner&&S.owner[id])||[]}

function loadAndConnect(){
  if(OWNER_MODE){ownerLoadLocal();if(FIREBASE_CONFIG)ownerInitFB(FIREBASE_CONFIG);}
  else{LOCAL.load();if(FIREBASE_CONFIG)initFB(FIREBASE_CONFIG);}
}

