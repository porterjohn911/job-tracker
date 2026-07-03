// Settings → Photo Storage section.
//
// A friendly, no-console front door to the photo migration: shows how full the
// browser cache is and how many old photos are still stored as base64, with a
// one-tap "Move old photos to cloud" button (owners/managers only) that runs
// the existing, tested photoMigrationRun() with a live progress readout.
//
// Additive: the settings modal inserts renderStorageSettings() into its body
// and calls wireStorageSettings() when it opens. Nothing else changes.

// Count photos/receipts/documents still stored inline as base64 (silent).
function _storageBase64Stats(){
  let count=0,bytes=0;
  const big=u=>typeof u==='string'&&u.slice(0,5)==='data:';
  const scan=arr=>(arr||[]).forEach(p=>{if(p&&big(p.url)){count++;bytes+=p.url.length}});
  Object.values((typeof S!=='undefined'&&S.jobs)||{}).forEach(j=>{
    scan(j.photos);scan(j.receipts);scan(j.documents);
    (j.invoices||[]).forEach(inv=>scan(inv&&inv.photos));
    (j.estimates||[]).forEach(inv=>scan(inv&&inv.photos));
  });
  return {count,bytes};
}
// Rough size of everything this app has in localStorage.
function _localStorageBytes(){
  let total=0;
  try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);total+=(k?k.length:0)+((localStorage.getItem(k)||'').length)}}catch(e){}
  return total;
}
// Owners/managers only (or any single user when access control is off).
function _canRunMigration(){
  const gate=(typeof gateOn==='function')&&gateOn();
  if(!gate)return true;
  return (typeof canSeeAll==='function')&&canSeeAll(typeof SESSION!=='undefined'?SESSION:null);
}

function _storageSectionInner(){
  const s=_storageBase64Stats();
  const cap=5; // ~5 MB practical localStorage budget
  const usedMB=_localStorageBytes()/1048576;
  const embeddedMB=s.bytes/1048576;
  const pct=Math.max(2,Math.min(100,Math.round(usedMB/cap*100)));
  const barColor=pct>=85?'var(--red)':(pct>=60?'#d97706':'var(--green-600)');
  let body;
  if(s.count>0){
    const line=`<div style="font-size:12.5px;color:var(--text-2);margin:10px 0 8px">⚠️ <strong>${s.count}</strong> old photo${s.count!==1?'s are':' is'} still stored in this browser (~${embeddedMB.toFixed(1)} MB) instead of the cloud. Moving them frees space and stops the "storage full" error.</div>`;
    const action=_canRunMigration()
      ? `<button class="btn-sm" id="sm-migrate" type="button">Move old photos to cloud</button><div id="sm-migrate-status" style="font-size:12px;color:var(--text-3);margin-top:8px"></div>`
      : `<div class="tt-hint">Ask an owner or manager to move these to the cloud.</div>`;
    body=line+action;
  }else{
    body=`<div style="font-size:12.5px;color:var(--green-700);margin:10px 0 4px">✓ All photos are stored in the cloud — nothing to move.</div>`;
  }
  return `
    <div style="margin:14px 0 10px;padding-top:14px;border-top:1px solid var(--border)"><div class="form-label" style="font-size:12px">Photo Storage</div></div>
    <div style="font-size:11.5px;color:var(--text-3);display:flex;justify-content:space-between;margin-bottom:4px"><span>Browser cache</span><span>~${usedMB.toFixed(1)} MB of ~${cap} MB</span></div>
    <div style="height:8px;background:var(--surface-3);border-radius:999px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${barColor};transition:width .2s"></div></div>
    ${body}`;
}

function renderStorageSettings(){
  return `<div id="sm-section">${_storageSectionInner()}</div>`;
}

function wireStorageSettings(){
  const btn=document.getElementById('sm-migrate');
  if(!btn)return;
  btn.addEventListener('click',async()=>{
    if(typeof photoMigrationRun!=='function')return;
    const status=document.getElementById('sm-migrate-status');
    const setS=t=>{if(status)status.textContent=t};
    btn.disabled=true;const old=btn.textContent;btn.textContent='Moving…';
    setS('Preparing…');
    try{
      const res=await photoMigrationRun({onProgress:(done,total)=>setS('Moving '+done+' of '+total+'…')});
      const sec=document.getElementById('sm-section');
      if(sec){sec.innerHTML=_storageSectionInner();wireStorageSettings();}
      const done=document.getElementById('sm-migrate-status');
      if(done)done.textContent='✓ Done — '+res.migrated+' moved'+(res.failed?', '+res.failed+' failed':'');
      else if(typeof toast==='function')toast(res.migrated+' photos moved to cloud','');
    }catch(e){
      setS('Could not move photos: '+((e&&e.message)||e));
      btn.disabled=false;btn.textContent=old;
    }
  });
}
