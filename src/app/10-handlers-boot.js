// Event wiring, global handlers, and boot sequence
// Generated from src/app.js lines 4243-4682.
// ══ Handlers ══
function attachHandlers(){
  document.querySelectorAll('.nav-btn').forEach(b=>{
    b.onclick=()=>{S.view=b.dataset.view;S.detail=null;render()}
  });
  $('user-btn').onclick=showSettingsModal;
  $('setup-link').onclick=showSetupModal;
  const _bco=$('brand-co');if(_bco)_bco.textContent=OWNER_MODE?'All Companies':ACTIVE_CO.label;
  const _bsw=$('brand-switch');if(_bsw){if(gateOn()&&!canSeeAll(SESSION)){_bsw.style.display='none';}else{_bsw.onclick=showCompanySwitcher;}}
  const _bnk=document.querySelector('.nav-btn[data-view="bank"]');if(_bnk&&gateOn()&&!isOwnerRole(SESSION))_bnk.style.display='none';
  $('owner-refresh')?.addEventListener('click',refreshOwnerData);
  document.querySelectorAll('[data-view-company]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.viewCompany;
    try{localStorage.setItem('jt_company',id)}catch(e){}
    location.reload();
  });
  $('bell-btn')?.addEventListener('click',showNotificationsModal);
  $('cmd-btn')?.addEventListener('click',showCommandPalette);
  $('fab')?.addEventListener('click',()=>showJobModal('add'));
  $('btn-add-ref')?.addEventListener('click',()=>showReferralModal('add'));
  $('btn-add-ref2')?.addEventListener('click',()=>showReferralModal('add'));
  document.querySelectorAll('[data-ref-open]').forEach(el=>el.onclick=()=>showReferralModal('edit',S.referrals[el.dataset.refOpen]));
  document.querySelectorAll('[data-ref-paid]').forEach(b=>b.onclick=async e=>{e.stopPropagation();const r=S.referrals[b.dataset.refPaid];if(!r)return;r.payoutStatus='paid';if(!r.paidAt)r.paidAt=dateKey(new Date());await writeReferral(r);render();toast('Marked paid')});
  document.querySelectorAll('[data-ref-filter]').forEach(c=>c.onclick=()=>{S.refFilter=c.dataset.refFilter;render()});

  // Sort menu
  $('btn-sort')?.addEventListener('click',e=>{e.stopPropagation();S.sortOpen=!S.sortOpen;render()});
  document.querySelectorAll('[data-sort]').forEach(el=>{
    el.onclick=()=>{S.sort=el.dataset.sort;localStorage.setItem(LS('sort'),S.sort);S.sortOpen=false;render();toast('Sorted by '+el.textContent.trim().toLowerCase())};
    el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click()}};
  });
  if(S.sortOpen){
    // Click outside closes
    setTimeout(()=>{
      const handler=e=>{
        if(!e.target.closest('.sort-wrap')){S.sortOpen=false;document.removeEventListener('click',handler);render()}
      };
      document.addEventListener('click',handler);
    },0);
  }

  // Bulk mode
  $('btn-bulk')?.addEventListener('click',()=>{S.bulkMode=!S.bulkMode;if(!S.bulkMode)S.bulkSel.clear();render()});
  $('bulk-delete')?.addEventListener('click',async()=>{
    const ids=Array.from(S.bulkSel);
    if(!confirm('Delete '+ids.length+' job(s)? This can be undone right after.'))return;
    const backup=ids.map(id=>S.jobs[id]).filter(Boolean).map(j=>JSON.parse(JSON.stringify(j)));
    for(const id of ids){await deleteJobDB(id)}
    await logAct('deleted '+ids.length+' job(s)','');
    S.bulkSel.clear();S.bulkMode=false;render();
    UNDO.push(async()=>{for(const j of backup){await writeJob(j)}render();toast('Restored '+backup.length+' job(s)')});
    toast('Deleted '+ids.length+' job(s)','undo',()=>{UNDO.pop()();});
  });
  $('bulk-star')?.addEventListener('click',async()=>{
    const ids=Array.from(S.bulkSel);
    // Pin if any not pinned, else unpin all
    const anyUnpinned=ids.some(id=>!S.jobs[id]?.favorite);
    for(const id of ids){const j=S.jobs[id];if(j){j.favorite=anyUnpinned;await writeJob(j)}}
    render();toast((anyUnpinned?'Pinned ':'Unpinned ')+ids.length+' job(s)');
  });
  $('bulk-status')?.addEventListener('click',async()=>{
    const choice=prompt('Set status to: lead / active / hold / complete','active');
    if(!choice||!['lead','active','hold','complete'].includes(choice.trim())){toast('Invalid status','');return}
    const ids=Array.from(S.bulkSel);
    for(const id of ids){const j=S.jobs[id];if(j){j.status=choice.trim();if(choice.trim()==='complete'){j.progress=100;j.completedAt=j.completedAt||Date.now()}await writeJob(j)}}
    render();toast('Updated '+ids.length+' job(s)');
  });
  $('bulk-assign')?.addEventListener('click',async()=>{
    const opts=S.members.length?S.members.join(', '):'(no team members yet)';
    const choice=prompt('Assign to (must match a team member name): '+opts);
    if(!choice)return;
    const ids=Array.from(S.bulkSel);
    for(const id of ids){const j=S.jobs[id];if(j){j.assigned=choice.trim();await writeJob(j)}}
    render();toast('Assigned '+ids.length+' job(s)');
  });

  // Favorites star on cards
  document.querySelectorAll('[data-fav]').forEach(b=>b.onclick=async e=>{
    e.stopPropagation();
    const id=b.dataset.fav;const j=S.jobs[id];if(!j)return;
    j.favorite=!j.favorite;await writeJob(j);render();
    toast(j.favorite?'Pinned to top':'Unpinned');
  });

  // Voice dictation mic buttons
  wireMicButtons();

  // Invoices (per-job tab)
  $('btn-new-inv')?.addEventListener('click',()=>{const id=S.detail;if(id)showInvoiceModal(id)});
  document.querySelectorAll('[data-inv-id]').forEach(row=>row.onclick=()=>{
    const id=S.detail;if(id)showInvoiceModal(id,row.dataset.invId);
  });
  $('btn-new-est')?.addEventListener('click',()=>{const id=S.detail;if(id)showInvoiceModal(id,null,'estimate')});
  document.querySelectorAll('[data-est-id]').forEach(row=>row.onclick=()=>{
    const id=S.detail;if(id)showInvoiceModal(id,row.dataset.estId,'estimate');
  });

  // Invoices (global view)
  $('btn-new-inv-global')?.addEventListener('click',()=>showJobPickerModal(jobId=>showInvoiceModal(jobId)));
  $('inv-search')?.addEventListener('input',e=>{S.invSearch=e.target.value;render()});
  $('inv-sort')?.addEventListener('change',e=>{S.invSort=e.target.value;render()});
  document.querySelectorAll('[data-inv-filter]').forEach(c=>c.onclick=()=>{S.invFilter=c.dataset.invFilter;render()});
  document.querySelectorAll('[data-open-inv]').forEach(el=>el.onclick=e=>{
    e.stopPropagation();
    const [jobId,invId]=el.dataset.openInv.split('|');
    showInvoiceModal(jobId,invId);
  });
  document.querySelectorAll('[data-inv-print]').forEach(b=>b.onclick=e=>{
    e.stopPropagation();
    const [jobId,invId]=b.dataset.invPrint.split('|');
    const j=S.jobs[jobId];if(!j)return;
    const inv=(j.invoices||[]).find(i=>i.id===invId);
    if(inv)printInvoice(j,inv);
  });
  document.querySelectorAll('[data-inv-paid]').forEach(b=>b.onclick=async e=>{
    e.stopPropagation();
    const [jobId,invId]=b.dataset.invPaid.split('|');
    const j=S.jobs[jobId];if(!j)return;
    const inv=(j.invoices||[]).find(i=>i.id===invId);
    if(!inv)return;
    const c=calcInvoice(inv);
    const prevPaid=Number(inv.paid||0);
    const prevStatus=inv.status;
    inv.paid=c.total;inv.status='paid';
    const tot=invoiceTotals(j);if(tot){j.invoiced=tot.total;j.paid=tot.paid}
    await writeJob(j);await logAct('marked invoice '+(inv.number||'')+' paid on',j.name);render();
    const restore=async()=>{
      const jj=S.jobs[jobId];if(!jj)return;
      const ii=(jj.invoices||[]).find(i=>i.id===invId);if(!ii)return;
      ii.paid=prevPaid;ii.status=prevStatus;
      const t=invoiceTotals(jj);if(t){jj.invoiced=t.total;jj.paid=t.paid}
      await writeJob(jj);render();toast('Reverted');
    };
    UNDO.push(restore);
    toast('Marked paid','undo',restore);
  });
  document.querySelectorAll('[data-inv-email]').forEach(b=>b.onclick=e=>{
    e.stopPropagation();
    const [jobId,invId]=b.dataset.invEmail.split('|');
    const j=S.jobs[jobId];if(!j)return;
    const inv=(j.invoices||[]).find(i=>i.id===invId);
    if(inv)emailInvoice(j,inv);
  });
  // Reports
  document.querySelectorAll('[data-range]').forEach(c=>c.onclick=()=>{S.reportRange=c.dataset.range;render()});
  // Map
  $('btn-geocode')?.addEventListener('click',geocodeAll);
  $('btn-add-job')?.addEventListener('click',()=>showJobModal('add'));
  $('btn-add-job2')?.addEventListener('click',()=>showJobModal('add'));
  $('btn-export-csv')?.addEventListener('click',exportCSV);
  $('btn-view-all-act')?.addEventListener('click',()=>{S.view='activity';render()});
  $('search-in')?.addEventListener('input',e=>{S.search=e.target.value;render()});
  document.querySelectorAll('[data-filter]').forEach(c=>c.onclick=()=>{S.filter=c.dataset.filter;render()});
  document.querySelectorAll('[data-open]').forEach(c=>{
    c.onclick=e=>{
      e.stopPropagation();
      // Bulk mode: clicks toggle selection instead of opening
      if(S.bulkMode&&c.classList.contains('job-card')){
        const id=c.dataset.open;
        if(S.bulkSel.has(id))S.bulkSel.delete(id);else S.bulkSel.add(id);
        render();return;
      }
      S.detail=c.dataset.open;S.view='jobs';S.detailTab='overview';render();
    };
    c.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();c.click()}};
  });

  // Calendar
  $('cal-prev')?.addEventListener('click',()=>{
    if(S.calMode==='agenda'){const n=new Date();S.calMonth=n.getMonth();S.calYear=n.getFullYear();render();return}
    S.calMonth--;if(S.calMonth<0){S.calMonth=11;S.calYear--}render();
  });
  $('cal-next')?.addEventListener('click',()=>{
    if(S.calMode==='agenda'){const n=new Date();S.calMonth=n.getMonth();S.calYear=n.getFullYear();render();return}
    S.calMonth++;if(S.calMonth>11){S.calMonth=0;S.calYear++}render();
  });
  $('cal-today')?.addEventListener('click',()=>{const n=new Date();S.calMonth=n.getMonth();S.calYear=n.getFullYear();S.calSelected=dateKey(n);render()});
  document.querySelectorAll('[data-cal-mode]').forEach(b=>b.onclick=()=>{S.calMode=b.dataset.calMode;localStorage.setItem(LS('calmode'),S.calMode);render()});
  document.querySelectorAll('[data-cal-day]').forEach(d=>d.onclick=e=>{
    // Ignore clicks on chips (they have their own handler that stops propagation, but be defensive)
    if(e.target.closest('[data-open]'))return;
    // Tapping a day from outside the current month jumps to that month
    const k=d.dataset.calDay;
    const [yy,mm]=k.split('-').map(n=>parseInt(n,10));
    if(yy!==S.calYear||(mm-1)!==S.calMonth){S.calYear=yy;S.calMonth=mm-1}
    S.calSelected=k;render();
  });

  // Detail
  $('btn-back')?.addEventListener('click',()=>{S.detail=null;S.detailTab='overview';render()});
  $('btn-edit-job')?.addEventListener('click',()=>{const j=S.jobs[S.detail];if(j)showJobModal('edit',j)});
  $('btn-edit-customer')?.addEventListener('click',()=>{const j=S.jobs[S.detail];if(j)showJobModal('edit',j)});
  $('btn-print-job')?.addEventListener('click',()=>{const j=S.jobs[S.detail];if(j)printJob(j)});
  $('btn-share-job')?.addEventListener('click',()=>{const j=S.jobs[S.detail];if(j)shareJob(j)});

  // Detail tabs
  document.querySelectorAll('[data-tab]').forEach(t=>t.onclick=()=>{S.detailTab=t.dataset.tab;render()});
  document.querySelectorAll('.stat-cell[data-goto]').forEach(el=>{
    el.onclick=()=>{S.detailTab=el.dataset.goto;render()};
    el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();S.detailTab=el.dataset.goto;render()}};
  });
  document.querySelectorAll('.stat-add[data-add]').forEach(b=>{
    b.onclick=e=>{e.stopPropagation();S.detailTab=b.dataset.add;S.quickAdd=b.dataset.add;render()};
  });
  if(S.quickAdd){const t=S.quickAdd;S.quickAdd=null;triggerQuickAdd(t)}

  // Stage pipeline
  document.querySelectorAll('[data-stage]').forEach(b=>b.onclick=async()=>{
    const j=S.jobs[S.detail];if(!j)return;
    const newStage=b.dataset.stage;
    j.stage=newStage;
    const newStatus=STAGE_TO_STATUS[newStage];
    if(newStatus)j.status=newStatus;
    if(newStage==='Complete'){j.progress=100;j.completedAt=Date.now()}
    await writeJob(j);await logAct('moved to '+newStage,j.name);render();toast('Stage updated');
  });

  // Progress
  const sl=$('prog-slider');
  if(sl){let pt;sl.oninput=function(){const f=$('prog-fill-lg'),p=$('prog-pct');if(f)f.style.width=this.value+'%';if(p)p.textContent=this.value+'%';clearTimeout(pt);pt=setTimeout(async()=>{const j=S.jobs[S.detail];if(j){j.progress=parseInt(this.value);await writeJob(j)}},700)}}

  // Photos
  document.querySelectorAll('[data-photo-cat]').forEach(c=>c.onclick=()=>{S.photoCat=c.dataset.photoCat;render()});
  $('photo-upload')?.addEventListener('change',function(){
    const j=S.jobs[S.detail];if(!j)return;j.photos=j.photos||[];
    const files=Array.from(this.files);if(!files.length)return;
    const cat=S.photoCat&&S.photoCat!=='all'?S.photoCat:'';
    const total=files.length;let done=0;
    const finishOne=()=>{if(++done===total){writeJob(j).then(()=>{logAct('added '+total+' photo(s) to',j.name);render();toast(total+' photo'+(total>1?'s':'')+' added','photo')})}};
    if(storageReady())toast('Uploading '+total+' photo'+(total>1?'s':'')+'…','photo');
    files.forEach(file=>{const r=new FileReader();r.onload=e=>{
      const img=new Image();img.onload=async()=>{
        const c=document.createElement('canvas');const MAX=1400;
        let w=img.width,h=img.height;
        if(w>MAX||h>MAX){if(w>h){h=Math.round(h*MAX/w);w=MAX}else{w=Math.round(w*MAX/h);h=MAX}}
        c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);
        const blob=await canvasToBlob(c,'image/jpeg',0.78);
        const up=blob?await uploadToStorage(blob,'jobs/'+j.id+'/photos','jpg'):null;
        const rec={cat:cat,user:S.user,time:Date.now()};
        if(up){rec.url=up.url;rec.storagePath=up.path}
        else{rec.url=c.toDataURL('image/jpeg',0.78)}
        j.photos.push(rec);
        finishOne();
      };img.src=e.target.result
    };r.readAsDataURL(file)});
  });
  document.querySelectorAll('[data-del-photo]').forEach(b=>b.onclick=async e=>{
    e.stopPropagation();const j=S.jobs[S.detail];if(!j)return;
    const removed=j.photos.splice(parseInt(b.dataset.delPhoto),1)[0];await writeJob(j);render();toast('Photo removed');
    if(removed&&removed.storagePath)deleteStoragePath(removed.storagePath);
  });
  document.querySelectorAll('[data-view-photo]').forEach(img=>img.onclick=e=>{
    e.stopPropagation();const j=S.jobs[S.detail];if(!j)return;
    const idx=parseInt(img.dataset.viewPhoto);
    const url=photoURL(j.photos[idx]);
    $('fs-root').innerHTML=`<div class="photo-fs" id="fs"><button class="photo-fs-close" id="fsc">×</button><img src="${url}" alt=""></div>`;
    $('fsc').onclick=()=>$('fs-root').innerHTML='';
    $('fs').onclick=e=>{if(e.target===e.currentTarget)$('fs-root').innerHTML=''};
  });

  // Notes
  const ni=$('note-in'),pb=$('btn-post');
  async function postNote(){const t=ni?.value.trim();if(!t)return;const j=S.jobs[S.detail];if(!j)return;j.notes=j.notes||[];j.notes.push({user:S.user,text:t,time:Date.now()});await writeJob(j);await logAct('posted a note on',j.name);ni.value='';render();toast('Note posted','note')}
  pb?.addEventListener('click',postNote);
  ni?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();postNote()}});

  // Tasks
  $('btn-add-task')?.addEventListener('click',async()=>{
    const inp=$('task-in'),due=$('task-due');
    const text=inp?.value.trim();if(!text)return;
    const j=S.jobs[S.detail];if(!j)return;
    j.tasks=j.tasks||[];
    j.tasks.push({text,due:due?.value||'',assigned:'',done:false,user:S.user,time:Date.now()});
    await writeJob(j);await logAct('added task to',j.name);render();toast('Task added');
  });
  $('task-in')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('btn-add-task')?.click()}});
  document.querySelectorAll('[data-task-toggle]').forEach(b=>b.onclick=async()=>{
    const j=S.jobs[S.detail];if(!j)return;const i=parseInt(b.dataset.taskToggle);
    j.tasks[i].done=!j.tasks[i].done;
    if(j.tasks[i].done){j.tasks[i].doneTime=Date.now();j.tasks[i].doneBy=S.user}
    await writeJob(j);await logAct(j.tasks[i].done?'completed task':'reopened task',j.name);render();
  });
  document.querySelectorAll('[data-task-del]').forEach(b=>b.onclick=async()=>{
    const j=S.jobs[S.detail];if(!j)return;
    const i=parseInt(b.dataset.taskDel);
    const removed=j.tasks.splice(i,1)[0];
    await writeJob(j);render();
    const restore=async()=>{const jj=S.jobs[j.id];if(jj){jj.tasks=jj.tasks||[];jj.tasks.splice(i,0,removed);await writeJob(jj);render();toast('Task restored')}};
    UNDO.push(restore);
    toast('Task removed','undo',restore);
  });

  // Daily log
  $('btn-add-log')?.addEventListener('click',async()=>{
    const text=$('log-text').value.trim();if(!text){toast('Enter work performed','');return}
    const j=S.jobs[S.detail];if(!j)return;
    j.dailyLogs=j.dailyLogs||[];
    j.dailyLogs.push({date:$('log-date').value||dateKey(new Date()),weather:$('log-weather').value.trim(),hours:$('log-hours').value,text,user:S.user,time:Date.now()});
    await writeJob(j);await logAct('added log entry to',j.name);render();toast('Log entry saved');
  });

  // Documents
  $('doc-upload')?.addEventListener('change',function(){
    const j=S.jobs[S.detail];if(!j)return;j.documents=j.documents||[];
    const file=this.files[0];if(!file)return;
    const cap=storageReady()?25*1024*1024:5*1024*1024;
    if(file.size>cap){toast('File too large (max '+(cap/1024/1024)+'MB)','');return}
    const meta={name:file.name,size:(file.size/1024).toFixed(0)+' KB',type:file.type,uploaded:Date.now(),user:S.user};
    const finishDoc=async(extra)=>{j.documents.push({...meta,...extra});await writeJob(j);await logAct('uploaded '+file.name+' to',j.name);render();toast('File uploaded')};
    if(storageReady())toast('Uploading…');
    (async()=>{
      const ext=(file.name.split('.').pop()||'').toLowerCase();
      const up=await uploadToStorage(file,'jobs/'+j.id+'/docs',ext);
      if(up){await finishDoc({url:up.url,storagePath:up.path})}
      else{const r=new FileReader();r.onload=async e=>{await finishDoc({url:e.target.result})};r.readAsDataURL(file)}
    })();
  });
  document.querySelectorAll('[data-doc-del]').forEach(b=>b.onclick=async e=>{
    e.preventDefault();e.stopPropagation();
    const j=S.jobs[S.detail];if(!j)return;
    const i=parseInt(b.dataset.docDel);
    const removed=j.documents.splice(i,1)[0];
    await writeJob(j);render();
    const restore=async()=>{const jj=S.jobs[j.id];if(jj){jj.documents=jj.documents||[];jj.documents.splice(i,0,removed);await writeJob(jj);render();toast('File restored')}};
    UNDO.push(restore);
    toast('File removed','undo',restore);
  });

  // Receipts & expenses
  $('rcpt-upload')?.addEventListener('change',function(){const l=$('rcpt-file-label');if(l)l.textContent=this.files&&this.files[0]?this.files[0].name:'Attach receipt photo or PDF (optional)'});
  $('btn-add-receipt')?.addEventListener('click',async()=>{
    const j=S.jobs[S.detail];if(!j)return;
    const amount=parseFloat($('rcpt-amount').value);
    if(!(amount>0)){toast('Enter the receipt amount','');return}
    const base={amount,vendor:$('rcpt-vendor').value.trim(),category:$('rcpt-cat').value,note:$('rcpt-note').value.trim(),date:$('rcpt-date').value||dateKey(new Date()),user:S.user,uploaded:Date.now()};
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
    const restore=async()=>{const jj=S.jobs[j.id];if(jj){jj.receipts=jj.receipts||[];jj.receipts.splice(i,0,removed);await writeJob(jj);render();toast('Receipt restored')}};
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
  $('bank-clear')?.addEventListener('click',async()=>{if(!confirm('Remove ALL imported transactions for this company? This cannot be undone.'))return;S.transactions={};await saveAllTxns();render();toast('Transactions cleared')});
  document.querySelectorAll('[data-bank-cat]').forEach(sel=>sel.onchange=async()=>{const t=S.transactions[sel.dataset.bankCat];if(t){t.category=sel.value;await writeTxn(t)}});
  document.querySelectorAll('[data-bank-job]').forEach(sel=>sel.onchange=async()=>{const t=S.transactions[sel.dataset.bankJob];if(t){t.jobId=sel.value;await writeTxn(t);render()}});
  document.querySelectorAll('[data-bank-del]').forEach(b=>b.onclick=async()=>{const t=S.transactions[b.dataset.bankDel];if(!t)return;const backup=JSON.parse(JSON.stringify(t));await deleteTxnDB(t.id);render();const restore=async()=>{await writeTxn(backup);render();toast('Transaction restored')};UNDO.push(restore);toast('Transaction removed','undo',restore)});
  $('tt-goto-team')?.addEventListener('click',()=>{S.view='team';render()});
  $('tt-clockin')?.addEventListener('click',async()=>{
    const member=$('tt-member')?.value;
    if(!member){toast('Pick a team member','');return}
    if(activeEntry(member)){toast(member+' is already clocked in','');return}
    const job=$('tt-job')?.value||'';
    const note=$('tt-note')?.value.trim()||'';
    const t={id:tid(),member,job,note,start:Date.now(),end:null,by:S.user||'',created:Date.now()};
    await writeTimeEntry(t);await logAct('clocked in '+member,job&&S.jobs[job]?S.jobs[job].name:'');render();toast(member+' clocked in');
  });
  document.querySelectorAll('[data-clock-out]').forEach(b=>b.onclick=async()=>{
    const t=S.timeEntries[b.dataset.clockOut];if(!t||t.end)return;
    t.end=Date.now();await writeTimeEntry(t);
    await logAct('clocked out '+t.member+' ('+fmtHM(entryDur(t))+')',t.job&&S.jobs[t.job]?S.jobs[t.job].name:'');
    render();toast(t.member+' clocked out · '+fmtHM(entryDur(t)));
  });
  $('tt-add-manual')?.addEventListener('click',()=>showTimeModal(null));
  document.querySelectorAll('[data-rate-member]').forEach(inp=>{inp.onchange=async()=>{const m=inp.dataset.rateMember;const v=parseFloat(inp.value);S.payRates=S.payRates||{};if(!v||v<=0)delete S.payRates[m];else S.payRates[m]=v;await savePayRates();toast('Saved rate for '+m)}});
  document.querySelectorAll('[data-labor-job]').forEach(el=>el.onclick=()=>{S.detail=el.dataset.laborJob;S.view='jobs';S.detailTab='financial';render()});
  document.querySelectorAll('[data-time-edit]').forEach(b=>b.onclick=()=>{const t=S.timeEntries[b.dataset.timeEdit];if(t)showTimeModal(t)});
  document.querySelectorAll('[data-time-del]').forEach(b=>b.onclick=async()=>{
    const t=S.timeEntries[b.dataset.timeDel];if(!t)return;
    const backup=JSON.parse(JSON.stringify(t));
    await deleteTimeEntryDB(t.id);render();
    const restore=async()=>{await writeTimeEntry(backup);render();toast('Entry restored')};
    UNDO.push(restore);toast('Entry deleted','undo',restore);
  });
  if(S.view==='time'&&timeList().some(t=>!t.end))startTimeTick();
}

document.addEventListener('keydown',onKey);

// Service worker would require a same-origin .js file; manifest alone makes it installable.
// Browsers prompt "Add to Home Screen" when the manifest + HTTPS + an icon are present.

function bootApp(){
  loadAndConnect();
  if(OWNER_MODE)applyOwnerChrome();else applyCompanyBranding();
  render();
}
if(FB_AUTH_ON){startAuthGate();}
else if(LOCKED){showLockScreen();}
else{bootApp();}

