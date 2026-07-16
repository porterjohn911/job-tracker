// Receipts, financials, communications, team, bank, and time handlers
// Generated from src/app/10-handlers-boot.js.

// ── Clock in/out location capture (in-app GPS; foreground snapshot only) ──
// One reading at the moment of clock in / out. Resolves null on denial,
// unavailability, or timeout — clocking in/out is never blocked or changed.
function captureGeo(){
  return new Promise(res=>{
    if(!navigator.geolocation)return res(null);
    navigator.geolocation.getCurrentPosition(
      p=>res({lat:p.coords.latitude,lng:p.coords.longitude,acc:Math.round(p.coords.accuracy||0)}),
      ()=>res(null),
      {enableHighAccuracy:true,timeout:8000,maximumAge:60000}
    );
  });
}
// One-time, non-blocking transparency notice on this device.
function geoNoticeOnce(){
  try{if(localStorage.getItem(LS('geo_notice')))return;localStorage.setItem(LS('geo_notice'),'1');}catch(e){}
  toast('Location is recorded at clock in/out (owners/managers only)');
}
// Capture location in the background and patch the entry; if the job is
// geocoded, also record distance from the job site. Never blocks clock in/out.
async function stampTimeLocation(entryId,phase){
  const g=await captureGeo();
  if(!g)return;
  const t=S.timeEntries[entryId];
  if(!t)return;
  const j=t.job&&S.jobs[t.job];
  const miles=(j&&j.lat&&j.lng&&typeof milesBetween==='function')
    ? +milesBetween({lat:g.lat,lng:g.lng},{lat:Number(j.lat),lng:Number(j.lng)}).toFixed(2) : null;
  if(phase==='in'){t.inLat=g.lat;t.inLng=g.lng;t.inAcc=g.acc;t.inAt=Date.now();if(miles!=null)t.inMiles=miles;}
  else{t.outLat=g.lat;t.outLng=g.lng;t.outAcc=g.acc;t.outAt=Date.now();if(miles!=null)t.outMiles=miles;}
  try{await writeTimeEntry(t)}catch(e){}
  render();
}

function attachFinancialTeamTimeHandlers(){
  // Receipts & expenses
  // Quick receipt entry (dashboard) + view-all (bank)
  $('btn-dash-receipt')?.addEventListener('click',()=>showReceiptModal());
  $('btn-all-receipts')?.addEventListener('click',showAllReceiptsModal);
  $('rcpt-upload')?.addEventListener('change',function(){const l=$('rcpt-file-label');if(l)l.textContent=this.files&&this.files[0]?this.files[0].name:'Attach receipt photo or PDF (optional)'});
  $('btn-add-receipt')?.addEventListener('click',async()=>{
    const j=S.jobs[S.detail];if(!j)return;
    const amount=parseFloat($('rcpt-amount').value);
    if(!(amount>0)){toast('Enter the receipt amount','');return}
    const base={id:'rc_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),amount,vendor:$('rcpt-vendor').value.trim(),category:$('rcpt-cat').value,note:$('rcpt-note').value.trim(),date:$('rcpt-date').value||dateKey(new Date()),user:S.user,uploaded:Date.now()};
    const fileInput=$('rcpt-upload');const file=fileInput&&fileInput.files&&fileInput.files[0];
    const finish=async(extra)=>{j.receipts=j.receipts||[];j.receipts.push({...base,...extra});await writeJob(j);await logAct('added a receipt ('+money2(amount)+') to',j.name);render();toast('Receipt added')};
    if(file){
      const cap=storageReady()?25*1024*1024:6*1024*1024;
      if(!file.type.startsWith('image/')&&file.size>cap){toast('File too large (max '+(cap/1024/1024)+'MB)','');return}
      if(storageReady())toast('Uploading…');
      if(file.type.startsWith('image/')){
        const r=new FileReader();r.onload=e=>{const img=new Image();img.onload=async()=>{const c=document.createElement('canvas');const MAX=1400;let w=img.width,h=img.height;if(w>MAX||h>MAX){if(w>h){h=Math.round(h*MAX/w);w=MAX}else{w=Math.round(w*MAX/h);h=MAX}}c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);const blob=await canvasToBlob(c,'image/jpeg',0.8);const up=blob?await uploadToStorage(blob,'jobs/'+j.id+'/receipts','jpg'):null;if(up){finish({name:file.name,type:file.type,url:up.url,storagePath:up.path})}else{finish({name:file.name,type:file.type,url:c.toDataURL('image/jpeg',0.8)})}};img.src=e.target.result};r.readAsDataURL(file);
      }else{
        (async()=>{const ext=(file.name.split('.').pop()||'').toLowerCase();const up=await uploadToStorage(file,'jobs/'+j.id+'/receipts',ext);if(up){finish({name:file.name,type:file.type,url:up.url,storagePath:up.path,size:(file.size/1024).toFixed(0)+' KB'})}else{const r=new FileReader();r.onload=e=>finish({name:file.name,type:file.type,url:e.target.result,size:(file.size/1024).toFixed(0)+' KB'});r.readAsDataURL(file)}})();
      }
    }else{finish({})}
  });
  document.querySelectorAll('[data-receipt-del]').forEach(b=>b.onclick=async e=>{
    e.preventDefault();e.stopPropagation();
    const j=S.jobs[S.detail];if(!j)return;
    const i=parseInt(b.dataset.receiptDel);
    const removed=(j.receipts||[]).splice(i,1)[0];
    await writeJob(j);render();
    let restored=false;
    const restore=async()=>{if(restored)return;restored=true;const jj=S.jobs[j.id];if(jj){jj.receipts=jj.receipts||[];jj.receipts.splice(i,0,removed);await writeJob(jj);render();toast('Receipt restored')}};
    UNDO.push(restore);
    toast('Receipt removed','undo',restore);
  });

  // Financials
  $('btn-save-fin')?.addEventListener('click',async()=>{
    const j=S.jobs[S.detail];if(!j)return;
    j.value=$('fin-est').value;
    j.costs=$('fin-costs').value;
    j.invoiced=$('fin-inv').value;
    j.paid=$('fin-paid').value;
    await writeJob(j);await logAct('updated financials on',j.name);render();toast('Financials saved');
  });

  // Communications
  $('btn-add-comm')?.addEventListener('click',async()=>{
    const text=$('comm-text').value.trim();if(!text){toast('Add a summary','');return}
    const j=S.jobs[S.detail];if(!j)return;
    j.comms=j.comms||[];
    j.comms.push({type:$('comm-type').value,text,user:S.user,time:Date.now()});
    await writeJob(j);await logAct('logged a '+$('comm-type').value,j.name);render();toast('Communication logged');
  });

  // Team
  $('btn-add-member')?.addEventListener('click',async()=>{
    const inp=$('member-in');const name=inp?.value.trim();
    if(!name||S.members.includes(name)){toast(name?'Already on team':'Enter a name','');return}
    S.members.push(name);await saveMembers();inp.value='';render();toast(name+' added to team');
  });
  document.querySelectorAll('[data-rm]').forEach(b=>b.onclick=async()=>{S.members.splice(parseInt(b.dataset.rm),1);await saveMembers();render()});

  // Time tracking
  stopTimeTick();
  $('tt-payroll')?.addEventListener('click',showPayrollModal);

  // Bank / cash flow
  $('bank-import')?.addEventListener('click',showBankImport);
  $('bank-clear')?.addEventListener('click',async()=>{
    if(!confirm('Remove ALL imported transactions for this company?'))return;
    const backup=JSON.parse(JSON.stringify(S.transactions||{}));
    S.transactions={};await saveAllTxns();render();
    let restored=false;
    const restore=async()=>{if(restored)return;restored=true;S.transactions=JSON.parse(JSON.stringify(backup));await saveAllTxns();render();toast('Transactions restored')};
    UNDO.push(restore);
    toast('Transactions cleared','undo',restore);
  });
  document.querySelectorAll('[data-bank-cat]').forEach(sel=>sel.onchange=async()=>{const t=S.transactions[sel.dataset.bankCat];if(t){t.category=sel.value;await writeTxn(t)}});
  document.querySelectorAll('[data-bank-job]').forEach(sel=>sel.onchange=async()=>{const t=S.transactions[sel.dataset.bankJob];if(t){t.jobId=sel.value;await writeTxn(t);render()}});
  document.querySelectorAll('[data-bank-del]').forEach(b=>b.onclick=async()=>{const t=S.transactions[b.dataset.bankDel];if(!t)return;const backup=JSON.parse(JSON.stringify(t));await deleteTxnDB(t.id);render();let restored=false;const restore=async()=>{if(restored)return;restored=true;await writeTxn(backup);render();toast('Transaction restored')};UNDO.push(restore);toast('Transaction removed','undo',restore)});
  // Receipt reconciliation
  $('recon-automatch')?.addEventListener('click',async()=>{
    const changed=autoMatchReceipts();
    for(const t of changed)await writeTxn(t);
    render();toast(changed.length?changed.length+' matched':'No confident matches found');
  });
  document.querySelectorAll('[data-recon-match]').forEach(sel=>sel.onchange=async()=>{
    const t=S.transactions[sel.dataset.reconMatch];if(!t||!sel.value)return;
    t.matchReceipt=sel.value;t.reconciledAt=Date.now();await writeTxn(t);render();toast('Matched to receipt');
  });
  document.querySelectorAll('[data-recon-unmatch]').forEach(b=>b.onclick=async()=>{
    const t=S.transactions[b.dataset.reconUnmatch];if(!t)return;
    delete t.matchReceipt;delete t.reconciledAt;await writeTxn(t);render();toast('Unmatched');
  });
  document.querySelectorAll('[data-recon-doc]').forEach(sel=>sel.onchange=async()=>{
    const t=S.transactions[sel.dataset.reconDoc];const j=S.jobs[sel.value];if(!t||!j)return;
    const cat=(typeof RECEIPT_CATS!=='undefined'&&RECEIPT_CATS.includes(t.category))?t.category:(t.category==='Equipment'?'Tools / Equipment':'Other');
    const r={id:'rc_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),amount:Math.abs(Number(t.amount)||0),vendor:((t.description||'')+'').slice(0,60),category:cat,note:'From bank import',date:((t.date||'')+'').slice(0,10)||dateKey(new Date()),user:S.user,uploaded:Date.now(),source:'bank',txnId:t.id};
    j.receipts=j.receipts||[];j.receipts.push(r);
    t.matchReceipt='rid:'+r.id;t.reconciledAt=Date.now();if(!t.jobId)t.jobId=j.id;
    await writeJob(j);await writeTxn(t);await logAct('documented a bank expense on',j.name);render();toast('Receipt added & matched');
  });
  $('tt-goto-team')?.addEventListener('click',()=>{S.view='team';render()});
  $('tt-clockin')?.addEventListener('click',async()=>{
    const member=$('tt-member')?.value;
    if(!member){toast('Pick a team member','');return}
    if(activeEntry(member)){toast(member+' is already clocked in','');return}
    const job=$('tt-job')?.value||'';
    const note=$('tt-note')?.value.trim()||'';
    const t={id:tid(),member,job,note,start:Date.now(),end:null,by:S.user||'',created:Date.now()};
    await writeTimeEntry(t);await logAct('clocked in '+member,job&&S.jobs[job]?S.jobs[job].name:'');render();toast(member+' clocked in');
    geoNoticeOnce();stampTimeLocation(t.id,'in');
  });
  document.querySelectorAll('[data-clock-out]').forEach(b=>b.onclick=async()=>{
    const t=S.timeEntries[b.dataset.clockOut];if(!t||t.end)return;
    t.end=Date.now();await writeTimeEntry(t);
    await logAct('clocked out '+t.member+' ('+fmtHM(entryDur(t))+')',t.job&&S.jobs[t.job]?S.jobs[t.job].name:'');
    render();toast(t.member+' clocked out · '+fmtHM(entryDur(t)));
    stampTimeLocation(t.id,'out');
  });
  $('tt-add-manual')?.addEventListener('click',()=>showTimeModal(null));
  if(canSeeFinancials())document.querySelectorAll('[data-rate-member]').forEach(inp=>{inp.onchange=async()=>{const m=inp.dataset.rateMember;const v=parseFloat(inp.value);S.payRates=S.payRates||{};if(!v||v<=0)delete S.payRates[m];else S.payRates[m]=v;await savePayRates();toast('Saved rate for '+m)}});
  document.querySelectorAll('[data-labor-job]').forEach(el=>el.onclick=()=>{S.detail=el.dataset.laborJob;S.view='jobs';S.detailTab='financial';render()});
  document.querySelectorAll('[data-time-edit]').forEach(b=>b.onclick=()=>{const t=S.timeEntries[b.dataset.timeEdit];if(t)showTimeModal(t)});
  document.querySelectorAll('[data-time-del]').forEach(b=>b.onclick=async()=>{
    const t=S.timeEntries[b.dataset.timeDel];if(!t)return;
    const backup=JSON.parse(JSON.stringify(t));
    await deleteTimeEntryDB(t.id);render();
    let restored=false;
    const restore=async()=>{if(restored)return;restored=true;await writeTimeEntry(backup);render();toast('Entry restored')};
    UNDO.push(restore);toast('Entry deleted','undo',restore);
  });
  if(S.view==='time'&&timeList().some(t=>!t.end))startTimeTick();
}
