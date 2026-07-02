// Sort, bulk actions, invoices, reports, map, filters, and job opening handlers
// Generated from src/app/10-handlers-boot.js.

function attachListInvoiceReportMapHandlers(){
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
    let restored=false;
    const restore=async()=>{if(restored)return;restored=true;for(const j of backup){await writeJob(j)}render();toast('Restored '+backup.length+' job(s)')};
    UNDO.push(restore);
    toast('Deleted '+ids.length+' job(s)','undo',restore);
  });
  $('bulk-star')?.addEventListener('click',async()=>{
    const ids=Array.from(S.bulkSel);
    // Pin if any not pinned, else unpin all
    const anyUnpinned=ids.some(id=>!S.jobs[id]?.favorite);
    for(const id of ids){const j=S.jobs[id];if(j){j.favorite=anyUnpinned;await writeJob(j)}}
    render();toast((anyUnpinned?'Pinned ':'Unpinned ')+ids.length+' job(s)');
  });
  $('bulk-status')?.addEventListener('click',async()=>{
    const choice=prompt('Set status to: lead / active / hold / lost / complete','active');
    if(!choice||!JOB_STATUS_VALUES.includes(choice.trim())){toast('Invalid status','');return}
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
    let restored=false;
    const restore=async()=>{
      if(restored)return;restored=true;
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
  document.querySelectorAll('[data-pick-location]').forEach(el=>el.onclick=e=>{
    e.preventDefault();
    e.stopPropagation();
    showGeocodeCandidateModal(el.dataset.pickLocation);
  });
  document.querySelectorAll('[data-open-job]').forEach(el=>el.onclick=e=>{
    e.preventDefault();
    e.stopPropagation();
    S.detail=el.dataset.openJob;
    S.view='jobs';
    S.detailTab='overview';
    render();
  });
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
}
