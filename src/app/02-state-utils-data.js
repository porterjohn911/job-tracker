// State, utilities, local storage, Firebase, and time helpers
// Generated from src/app.js lines 269-498.
// ══ State ══
let DB=null;
let MAP=null,MAP_MARKERS=[];
const S={jobs:{},activity:[],members:[],view:'dashboard',detail:null,detailTab:'overview',filter:'all',search:'',photoCat:'all',calMonth:new Date().getMonth(),calYear:new Date().getFullYear(),calSelected:null,calMode:localStorage.getItem(LS('calmode'))||'month',reportRange:'90',sort:localStorage.getItem(LS('sort'))||'newest',sortOpen:false,bulkMode:false,bulkSel:new Set(),invFilter:'all',invSearch:'',invSort:'date',user:localStorage.getItem(LS('user'))||'',notifReadAt:parseInt(localStorage.getItem(LS('notif_read'))||'0',10),refFilter:'all',referrals:{},timeEntries:{},payRates:{},transactions:{},timeOff:{},receipts:{},owner:{}};
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
function saveCompany(c){return saveLocalValue(LS('company'),c,'company settings',true)}
let COMPANY=loadCompany();

// ── Workflow stages (BuilderTrend / AccuLynx style)
const STAGES=['Lead','Estimate','Approved','Scheduled','In Progress','Punch List','Complete'];
const STAGE_TO_STATUS={'Lead':'lead','Estimate':'lead','Approved':'active','Scheduled':'active','In Progress':'active','Punch List':'active','Complete':'complete'};
const JOB_STATUS_VALUES=['lead','active','hold','lost','complete'];
const CLOSED_JOB_STATUSES=['complete','lost'];
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
function daysUntil(s){if(!s)return null;try{const d=new Date(s+(s.length===10?'T00:00:00':''));const t=new Date();t.setHours(0,0,0,0);const n=Math.round((d-t)/(1000*60*60*24));return isNaN(n)?null:n}catch(e){return null}}
function jobBalance(j){const inv=Number(j.invoiced||0),paid=Number(j.paid||0);return inv-paid}
function jobStage(j){return j.stage||(j.status==='complete'?'Complete':j.status==='lead'?'Lead':'In Progress')}
function isClosedJob(j){return CLOSED_JOB_STATUSES.includes(j.status)}

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
function autoGrowTextareas(root=document){
  root.querySelectorAll('textarea[data-autogrow]').forEach(el=>{
    const grow=()=>{el.style.height='auto';el.style.height=el.scrollHeight+'px'};
    el.removeEventListener('input',el._autoGrowHandler);
    el._autoGrowHandler=grow;
    el.addEventListener('input',grow);
    grow();
  });
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

// ── Time off (employees request → owner approves → shown on the schedule) ──
function timeOffList(){return Object.values(S.timeOff||{})}
// Owner-only approval; in ungated solo mode the single user is treated as owner.
function canApproveTimeOff(){return !gateOn()||isOwnerRole(SESSION)}
function currentPersonName(){return (SESSION&&SESSION.name)||S.user||'Me'}
function currentPersonId(){return (SESSION&&(SESSION.uid||SESSION.id))||('name:'+String(S.user||'me').toLowerCase())}
function timeOffId(){return 'to_'+Date.now()+'_'+Math.random().toString(36).slice(2,6)}
// Inclusive YYYY-MM-DD keys from start..end, capped so a bad far date can't blow up.
function dateRangeKeys(start,end){
  if(!start)return[];
  const s=start.slice(0,10),e=(end||start).slice(0,10);
  if(e<s)return[s];
  const out=[],a=new Date(s+'T00:00:00'),b=new Date(e+'T00:00:00');
  for(let d=new Date(a);d<=b&&out.length<120;d.setDate(d.getDate()+1))out.push(dateKey(d));
  return out;
}
// dateKey -> [{req, half}] for APPROVED time off, expanded across each covered day.
function timeOffByDay(){
  const map={};
  timeOffList().forEach(r=>{
    if(r.status!=='approved')return;
    const keys=dateRangeKeys(r.startDate,r.endDate);
    keys.forEach(k=>{
      const half=keys.length===1?(r.half||false):false; // half-day only for single-day requests
      (map[k]=map[k]||[]).push({req:r,half});
    });
  });
  return map;
}
async function writeTimeOff(r){
  S.timeOff[r.id]=r;
  const localOk=LOCAL.saveTimeOff(!DB);
  await writeDB('timeoff/'+r.id,r,'time off');
  if(!localOk&&!DB)throw new Error('Local time-off save failed');
}
async function deleteTimeOff(id){
  delete S.timeOff[id];
  const localOk=LOCAL.saveTimeOff(!DB);
  await removeDB('timeoff/'+id,'time off');
  if(!localOk&&!DB)throw new Error('Local time-off delete failed');
}

// ── Standalone / overhead receipts (not tied to a job — fuel, tools, etc.) ──
function overheadReceipts(){return Object.values(S.receipts||{})}
async function writeReceipt(r){
  S.receipts=S.receipts||{};S.receipts[r.id]=r;
  const localOk=LOCAL.saveReceipts(!DB);
  await writeDB('receipts/'+r.id,r,'receipt');
  if(!localOk&&!DB)throw new Error('Local receipt save failed');
}
async function deleteReceipt(id){
  if(S.receipts)delete S.receipts[id];
  const localOk=LOCAL.saveReceipts(!DB);
  await removeDB('receipts/'+id,'receipt');
  if(!localOk&&!DB)throw new Error('Local receipt delete failed');
}

// ══ DB layer ══
const SYNC={pendingJobs:{}};
function reportLocalSaveError(label,e,required){
  console.warn('Local save failed for '+label,e);
  syncStatus('err','Browser storage is full - team sync may still save');
  if(required)toast('Could not save '+label+' on this device','');
}
function saveLocalValue(key,value,label,required){
  try{localStorage.setItem(key,JSON.stringify(value));return true}
  catch(e){reportLocalSaveError(label||'data',e,required);return false}
}
function showCloudSaveError(label,e){
  console.error('Team sync save failed for '+label,e);
  syncStatus('err','Team sync save failed');
  toast('Could not save '+label+' to team sync','');
}
function applyPendingJobs(remote){
  Object.keys(SYNC.pendingJobs).forEach(id=>{
    const pending=SYNC.pendingJobs[id];
    if(pending===null)delete remote[id];
    else remote[id]=pending;
  });
  return remote;
}
async function writeDB(path,value,label){
  if(!DB)return true;
  try{await DB.child(path).set(value);return true}
  catch(e){showCloudSaveError(label,e);throw e}
}
async function removeDB(path,label){
  if(!DB)return true;
  try{await DB.child(path).remove();return true}
  catch(e){showCloudSaveError(label,e);throw e}
}
// Keep base64 image blobs OUT of the localStorage cache so its ~5MB limit can
// never overflow. When cloud sync is active (DB set), the full data — including
// any inline base64 — already lives in the Realtime Database, so the local
// cache can safely drop those blobs; short https/Storage URLs are always kept.
// With no cloud (offline/local-only) everything is stored as before, since the
// cache would be the only copy.
function slimJobsForLocal(jobsObj){
  const big=u=>typeof u==='string'&&u.slice(0,5)==='data:';
  const hasBig=arr=>Array.isArray(arr)&&arr.some(p=>p&&(big(p.url)||big(p.poster)));
  const slimArr=arr=>hasBig(arr)?arr.map(p=>{if(!p)return p;const o={...p};if(big(o.url))o.url='';if(big(o.poster))delete o.poster;return o;}):arr;
  const slimInvs=arr=>Array.isArray(arr)&&arr.some(inv=>inv&&hasBig(inv.photos))
    ?arr.map(inv=>(inv&&hasBig(inv.photos))?{...inv,photos:slimArr(inv.photos)}:inv):arr;
  const out={};
  for(const id in jobsObj){
    const j=jobsObj[id];
    if(!j||typeof j!=='object'){out[id]=j;continue}
    out[id]={...j,photos:slimArr(j.photos),receipts:slimArr(j.receipts),documents:slimArr(j.documents),invoices:slimInvs(j.invoices),estimates:slimInvs(j.estimates)};
  }
  return out;
}
const LOCAL={
  load(){try{S.jobs=JSON.parse(localStorage.getItem(LS('jobs'))||'{}')}catch(e){S.jobs={}}try{S.activity=JSON.parse(localStorage.getItem(LS('activity'))||'[]')}catch(e){S.activity=[]}try{S.members=JSON.parse(localStorage.getItem(LS('members'))||'[]')}catch(e){S.members=[]}try{S.referrals=JSON.parse(localStorage.getItem(LS('referrals'))||'{}')}catch(e){S.referrals={}}try{S.timeEntries=JSON.parse(localStorage.getItem(LS('time'))||'{}')}catch(e){S.timeEntries={}}try{S.payRates=canSeeFinancials()?JSON.parse(localStorage.getItem(LS('payrates'))||'{}'):{};}catch(e){S.payRates={}}try{S.transactions=canSeeBank()?JSON.parse(localStorage.getItem(LS('transactions'))||'{}'):{};}catch(e){S.transactions={}}try{S.timeOff=JSON.parse(localStorage.getItem(LS('timeoff'))||'{}')}catch(e){S.timeOff={}}try{S.receipts=JSON.parse(localStorage.getItem(LS('receipts'))||'{}')}catch(e){S.receipts={}}},
  saveJobs(required){return saveLocalValue(LS('jobs'),DB?slimJobsForLocal(S.jobs):S.jobs,'jobs',required)},
  saveActivity(required){return saveLocalValue(LS('activity'),S.activity.slice(0,300),'activity',required)},
  saveMembers(required){return saveLocalValue(LS('members'),S.members,'team members',required)},
  saveReferrals(required){return saveLocalValue(LS('referrals'),S.referrals,'referrals',required)},
  saveTime(required){return saveLocalValue(LS('time'),S.timeEntries,'time entries',required)},
  savePayRates(required){return saveLocalValue(LS('payrates'),S.payRates,'pay rates',required)},
  saveTransactions(required){return saveLocalValue(LS('transactions'),S.transactions,'bank transactions',required)},
  saveTimeOff(required){return saveLocalValue(LS('timeoff'),S.timeOff,'time off',required)},
  saveReceipts(required){return saveLocalValue(LS('receipts'),S.receipts,'receipts',required)}
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
// Grab a small poster frame from a video file (first frame, downscaled). The
// resulting data URL is stored on the record so grids show a real still rather
// than a generic play icon. Rejects on any failure; callers treat that as "no poster".
function videoPoster(file){
  return new Promise((resolve,reject)=>{
    let done=false;
    const v=document.createElement('video');
    const url=URL.createObjectURL(file);
    const cleanup=()=>{try{URL.revokeObjectURL(url)}catch(e){}};
    const fail=()=>{if(done)return;done=true;cleanup();reject(new Error('poster failed'))};
    v.preload='metadata';v.muted=true;v.playsInline=true;
    v.onerror=fail;
    v.onloadedmetadata=()=>{try{v.currentTime=Math.min(0.1,(v.duration||1)/2)}catch(e){fail()}};
    v.onseeked=()=>{
      if(done)return;done=true;
      try{
        let w=v.videoWidth,h=v.videoHeight;const MAX=480;
        if(!w||!h){cleanup();return reject(new Error('no frame'))}
        if(w>MAX||h>MAX){if(w>h){h=Math.round(h*MAX/w);w=MAX}else{w=Math.round(w*MAX/h);h=MAX}}
        const c=document.createElement('canvas');c.width=w;c.height=h;
        c.getContext('2d').drawImage(v,0,0,w,h);
        cleanup();resolve(c.toDataURL('image/jpeg',0.7));
      }catch(e){cleanup();reject(e)}
    };
    v.src=url;
    setTimeout(fail,8000);
  });
}
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
    DB.child('jobs').on('value',s=>{S.jobs=applyPendingJobs(s.val()||{});LOCAL.saveJobs();syncStatus('ok','Team sync live');render()});
    DB.child('activity').on('value',s=>{const r=s.val();S.activity=r?Object.values(r).sort((a,b)=>b.time-a.time):[];LOCAL.saveActivity()});
    DB.child('members').on('value',s=>{S.members=s.val()||[];LOCAL.saveMembers();render()});
    DB.child('timeoff').on('value',s=>{S.timeOff=s.val()||{};LOCAL.saveTimeOff();render()});
    DB.child('receipts').on('value',s=>{S.receipts=s.val()||{};LOCAL.saveReceipts();render()});
    DB.child('referrals').on('value',s=>{S.referrals=s.val()||{};LOCAL.saveReferrals();render()});
    DB.child('time').on('value',s=>{S.timeEntries=s.val()||{};LOCAL.saveTime();render()});
    if(canSeeFinancials())DB.child('payrates').on('value',s=>{S.payRates=s.val()||{};LOCAL.savePayRates();render()});
    else S.payRates={};
    if(canSeeBank())DB.child('transactions').on('value',s=>{S.transactions=s.val()||{};LOCAL.saveTransactions();render()});
    else S.transactions={};
    DB.child('.info/connected').on('value',s=>{if(!s.val())syncStatus('err','Reconnecting…')});
    return true;
  }catch(e){syncStatus('err','Firebase error');return false}
}
async function writeJob(j){
  const copy=JSON.parse(JSON.stringify(j));
  S.jobs[j.id]=j;SYNC.pendingJobs[j.id]=copy;
  const localOk=LOCAL.saveJobs(!DB);
  try{await writeDB('jobs/'+j.id,copy,'job')}
  finally{delete SYNC.pendingJobs[j.id]}
  if(!localOk&&!DB)throw new Error('Local job save failed');
}
async function deleteJobDB(id){
  delete S.jobs[id];SYNC.pendingJobs[id]=null;
  const localOk=LOCAL.saveJobs(!DB);
  try{await removeDB('jobs/'+id,'job')}
  finally{delete SYNC.pendingJobs[id]}
  if(!localOk&&!DB)throw new Error('Local job delete failed');
}
async function logAct(action,job,jobId){
  const e={user:S.user||'Someone',action,job:job||'',time:Date.now()};
  if(jobId)e.jobId=jobId;
  S.activity.unshift(e);LOCAL.saveActivity();
  if(DB){try{await DB.child('activity').push(e)}catch(err){console.warn('Activity sync failed',err)}}
}
async function saveMembers(){const localOk=LOCAL.saveMembers(!DB);await writeDB('members',S.members,'team members');if(!localOk&&!DB)throw new Error('Local team save failed')}
async function writeReferral(r){S.referrals[r.id]=r;const localOk=LOCAL.saveReferrals(!DB);await writeDB('referrals/'+r.id,r,'referral');if(!localOk&&!DB)throw new Error('Local referral save failed')}
async function deleteReferralDB(id){delete S.referrals[id];const localOk=LOCAL.saveReferrals(!DB);await removeDB('referrals/'+id,'referral');if(!localOk&&!DB)throw new Error('Local referral delete failed')}

// ── Time tracking (clock in / clock out) ──
async function writeTimeEntry(t){S.timeEntries[t.id]=t;const localOk=LOCAL.saveTime(!DB);await writeDB('time/'+t.id,t,'time entry');if(!localOk&&!DB)throw new Error('Local time save failed')}
async function deleteTimeEntryDB(id){delete S.timeEntries[id];const localOk=LOCAL.saveTime(!DB);await removeDB('time/'+id,'time entry');if(!localOk&&!DB)throw new Error('Local time delete failed')}
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
async function savePayRates(){if(!canSeeFinancials()){toast('Only managers and owners can edit pay rates','');return}const localOk=LOCAL.savePayRates(!DB);await writeDB('payrates',S.payRates,'pay rates');if(!localOk&&!DB)throw new Error('Local pay rate save failed')}
function rateOf(m){return Number((S.payRates||{})[m]||0)}
function hoursOf(ms){return ms/3600000}
function jobLaborStats(jobId){let ms=0,cost=0,active=0;timeList().forEach(t=>{if((t.job||'')!==jobId)return;const d=entryDur(t);ms+=d;cost+=hoursOf(d)*rateOf(t.member);if(!t.end)active++});return{ms,hours:hoursOf(ms),cost,active}}
function laborByJob(){const map={};timeList().forEach(t=>{const k=t.job||'';const e=map[k]||(map[k]={ms:0,cost:0,active:0});const d=entryDur(t);e.ms+=d;e.cost+=hoursOf(d)*rateOf(t.member);if(!t.end)e.active++});return map}

// ── Owner mode: read every company's jobs (read-only, all nodes) ──
function ownerPrefix(co){return co.ns+(ENV==='dev'?'_dev_':'_')}
function ownerNode(co){return co.ns+(ENV==='dev'?'_dev':'')}
function ownerLoadLocal(){S.owner=S.owner||{};S.ownerTime=S.ownerTime||{};S.ownerRates=S.ownerRates||{};Object.values(COMPANIES).forEach(co=>{try{S.owner[co.id]=Object.values(JSON.parse(localStorage.getItem(ownerPrefix(co)+'jobs')||'{}')||{})}catch(e){S.owner[co.id]=[]}try{S.ownerTime[co.id]=Object.values(JSON.parse(localStorage.getItem(ownerPrefix(co)+'time')||'{}')||{})}catch(e){S.ownerTime[co.id]=[]}try{S.ownerRates[co.id]=JSON.parse(localStorage.getItem(ownerPrefix(co)+'payrates')||'{}')||{}}catch(e){S.ownerRates[co.id]={}}})}
const OWNER_COMPANY_WATCHED={};
function watchOwnerCompany(co){
  if(!co||OWNER_COMPANY_WATCHED[co.id])return;
  OWNER_COMPANY_WATCHED[co.id]=true;
  try{S.owner=S.owner||{};S.owner[co.id]=Object.values(JSON.parse(localStorage.getItem(ownerPrefix(co)+'jobs')||'{}')||{})}catch(e){S.owner[co.id]=[]}
  try{S.ownerTime=S.ownerTime||{};S.ownerTime[co.id]=Object.values(JSON.parse(localStorage.getItem(ownerPrefix(co)+'time')||'{}')||{})}catch(e){S.ownerTime[co.id]=[]}
  try{S.ownerRates=S.ownerRates||{};S.ownerRates[co.id]=JSON.parse(localStorage.getItem(ownerPrefix(co)+'payrates')||'{}')||{}}catch(e){S.ownerRates[co.id]={}}
  firebase.database().ref(ownerNode(co)).child('jobs').on('value',s=>{S.owner=S.owner||{};S.owner[co.id]=Object.values(s.val()||{});syncStatus('ok','Live · all companies');render()});
  firebase.database().ref(ownerNode(co)).child('time').on('value',s=>{S.ownerTime=S.ownerTime||{};S.ownerTime[co.id]=Object.values(s.val()||{});render()});
  firebase.database().ref(ownerNode(co)).child('payrates').on('value',s=>{S.ownerRates=S.ownerRates||{};S.ownerRates[co.id]=s.val()||{};render()});
}
function listenCompanyRegistry(){
  if(!(typeof firebase!=='undefined'&&firebase.apps&&firebase.apps.length))return;
  try{
    firebase.database().ref('companies').on('value',s=>{
      const next=normalizeCompanyRegistry(s.val()||{});
      COMPANIES=next;
      saveCompanyRegistryLocal(COMPANIES);
      if(OWNER_MODE)Object.values(COMPANIES).forEach(watchOwnerCompany);
      if(typeof render==='function'&&$('content'))render();
    });
  }catch(e){}
}
function ownerInitFB(cfg){
  try{
    if(!firebase.apps.length)firebase.initializeApp(cfg);
    syncStatus('pulse','Connecting…');
    listenCompanyRegistry();
    Object.values(COMPANIES).forEach(watchOwnerCompany);
    firebase.database().ref('owner_schedule').on('value',s=>{S.ownerSchedule=s.val()||{};saveOwnerScheduleLocal();render()});
    firebase.database().ref('.info/connected').on('value',s=>{if(!s.val())syncStatus('err','Reconnecting…')});
    return true;
  }catch(e){syncStatus('err','Firebase error');return false}
}
function ownerJobs(id){return (S.owner&&S.owner[id])||[]}

// ── Owner shared calendar (cross-company events; owner-level node) ──
function ownerScheduleReady(){return typeof firebase!=='undefined'&&firebase.apps&&firebase.apps.length}
function ownerScheduleLoadLocal(){try{S.ownerSchedule=JSON.parse(localStorage.getItem('jt_owner_schedule')||'{}')}catch(e){S.ownerSchedule={}}}
function saveOwnerScheduleLocal(){try{localStorage.setItem('jt_owner_schedule',JSON.stringify(S.ownerSchedule||{}))}catch(e){}}
function ownerScheduleList(){if(!S.ownerSchedule)ownerScheduleLoadLocal();return Object.values(S.ownerSchedule||{})}
function ownerEventId(){return 'oev_'+Date.now()+'_'+Math.random().toString(36).slice(2,6)}
async function writeOwnerSchedule(ev){S.ownerSchedule=S.ownerSchedule||{};S.ownerSchedule[ev.id]=ev;saveOwnerScheduleLocal();if(ownerScheduleReady()){try{await firebase.database().ref('owner_schedule/'+ev.id).set(ev)}catch(e){}}}
async function deleteOwnerSchedule(id){if(S.ownerSchedule)delete S.ownerSchedule[id];saveOwnerScheduleLocal();if(ownerScheduleReady()){try{await firebase.database().ref('owner_schedule/'+id).remove()}catch(e){}}}
// Time-of-day helpers (minutes from midnight).
function minToLabel(min){min=Number(min)||0;const h=Math.floor(min/60),mm=min%60,ap=h<12?'AM':'PM',h12=(h%12)||12;return h12+(mm?':'+String(mm).padStart(2,'0'):'')+' '+ap}
function minToInput(min){min=Number(min)||0;return String(Math.floor(min/60)).padStart(2,'0')+':'+String(min%60).padStart(2,'0')}
function inputToMin(v){if(!v)return null;const p=String(v).split(':');return (Number(p[0])||0)*60+(Number(p[1])||0)}

function loadAndConnect(){
  if(OWNER_MODE){ownerLoadLocal();if(FIREBASE_CONFIG)ownerInitFB(FIREBASE_CONFIG);}
  else{LOCAL.load();if(FIREBASE_CONFIG){initFB(FIREBASE_CONFIG);listenCompanyRegistry();}}
}
