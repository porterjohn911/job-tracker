// Calendar, job detail, tabs, stage, and progress handlers
// Generated from src/app/10-handlers-boot.js.

function attachCalendarDetailHandlers(){
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

  // Time off
  $('btn-request-timeoff')?.addEventListener('click',showTimeOffModal);
  document.querySelectorAll('[data-timeoff-approve]').forEach(b=>b.onclick=async()=>{
    if(!canApproveTimeOff()){toast('Only owners can approve time off','');return}
    const r=S.timeOff[b.dataset.timeoffApprove];if(!r)return;
    r.status='approved';r.reviewedBy=currentPersonName();r.reviewedAt=Date.now();
    await writeTimeOff(r);render();toast('Time off approved');
  });
  document.querySelectorAll('[data-timeoff-deny]').forEach(b=>b.onclick=async()=>{
    if(!canApproveTimeOff()){toast('Only owners can approve time off','');return}
    const r=S.timeOff[b.dataset.timeoffDeny];if(!r)return;
    r.status='denied';r.reviewedBy=currentPersonName();r.reviewedAt=Date.now();
    await writeTimeOff(r);render();toast('Request denied');
  });
  document.querySelectorAll('[data-timeoff-delete]').forEach(b=>b.onclick=async()=>{
    const id=b.dataset.timeoffDelete;
    if(!confirm('Cancel this time-off request?'))return;
    await deleteTimeOff(id);render();toast('Request canceled');
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
}
