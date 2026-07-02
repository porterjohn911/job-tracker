// Job modal and job create/edit/delete actions
// Generated from src/app/07-modals-jobs-share.js.
// ══ Modals ══
function closeModal(){$('modal-root').innerHTML=''}

function showJobModal(mode,job){
  if(OWNER_MODE){toast('Open a company to add or edit jobs','');return}
  const j=job||{};
  const mOpts=S.members.map(m=>`<option value="${esc(m)}" ${j.assigned===m?'selected':''}>${esc(m)}</option>`).join('');
  $('modal-root').innerHTML=`<div class="modal-bd" id="mbd"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">${mode==='add'?'New Job':'Edit Job'}</div><button class="modal-close" id="mc"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Job name *</label><input class="form-input" id="f-name" value="${esc(j.name||'')}" placeholder="e.g. Lake house dock repair"></div>
      <div class="form-group"><label class="form-label">Job Site Address</label><input class="form-input" id="f-addr" value="${esc(j.address||'')}" placeholder="123 Waterfront Dr, LaFollette TN"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Stage</label><select class="form-select" id="f-stage">${STAGES.map(s=>`<option value="${esc(s)}" ${jobStage(j)===s?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Status</label><select class="form-select" id="f-status"><option value="lead" ${j.status==='lead'?'selected':''}>Lead</option><option value="active" ${(j.status==='active'||!j.status)?'selected':''}>Active</option><option value="hold" ${j.status==='hold'?'selected':''}>On Hold</option><option value="lost" ${j.status==='lost'?'selected':''}>Lost</option><option value="complete" ${j.status==='complete'?'selected':''}>Complete</option></select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Job type</label><select class="form-select" id="f-type"><option value="">Select…</option><option value="New construction" ${j.type==='New construction'?'selected':''}>New construction</option><option value="Renovation" ${j.type==='Renovation'?'selected':''}>Renovation</option><option value="Dock / waterfront" ${j.type==='Dock / waterfront'?'selected':''}>Dock / waterfront</option><option value="Repair" ${j.type==='Repair'?'selected':''}>Repair</option><option value="Inspection" ${j.type==='Inspection'?'selected':''}>Inspection</option><option value="Other" ${j.type==='Other'?'selected':''}>Other</option></select></div>
        <div class="form-group"><label class="form-label">Assigned to</label><select class="form-select" id="f-assigned"><option value="">Select…</option>${mOpts}<option value="__custom__">Type name…</option></select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Start date</label><input class="form-input" type="date" id="f-start" value="${esc(j.startDate||'')}"></div>
        <div class="form-group"><label class="form-label">Due date</label><input class="form-input" type="date" id="f-due" value="${esc(j.dueDate||'')}"></div>
      </div>
      <div id="custom-wrap" style="display:none" class="form-group"><label class="form-label">Custom name</label><input class="form-input" id="f-cname" placeholder="Name"></div>

      <div style="margin:18px 0 10px;padding-top:14px;border-top:1px solid var(--border)">
        <div class="form-label" style="font-size:12px;margin-bottom:10px">Customer Information</div>
      </div>
      <div class="form-group"><label class="form-label">Customer Name</label><input class="form-input" id="f-cust-name" value="${esc(j.customerName||'')}" placeholder="John & Jane Smith"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Phone</label><input class="form-input" type="tel" id="f-cust-phone" value="${esc(j.customerPhone||'')}" placeholder="(555) 123-4567"></div>
        <div class="form-group"><label class="form-label">Email</label><input class="form-input" type="email" id="f-cust-email" value="${esc(j.customerEmail||'')}" placeholder="customer@example.com"></div>
      </div>
      <div class="form-group"><label class="form-label">Billing Address</label><input class="form-input" id="f-bill-addr" value="${esc(j.billingAddress||'')}" placeholder="Leave blank if same as job site"></div>
      <div class="form-group"><label class="form-label">Lead Source</label><select class="form-select" id="f-source"><option value="">Not set</option>${LEAD_SOURCES.map(s=>`<option value="${esc(s)}" ${j.leadSource===s?'selected':''}>${esc(s)}</option>`).join('')}</select></div>

      <div style="margin:18px 0 10px;padding-top:14px;border-top:1px solid var(--border)">
        <div class="form-label" style="font-size:12px;margin-bottom:10px">Financial</div>
      </div>
      <div class="form-group"><label class="form-label">Estimated value ($)</label><input class="form-input" type="number" id="f-val" value="${esc(j.value||'')}" placeholder="0"></div>
      <div class="form-group"><label class="form-label">Description / Scope of Work</label><textarea class="form-textarea" id="f-desc">${esc(j.description||'')}</textarea></div>
    </div>
    <div class="modal-foot">
      ${mode==='edit'?`<button class="btn-delete" id="btn-del">Delete</button>`:''}
      <button class="btn-cancel" id="btn-cx">Cancel</button>
      <button class="btn-save" id="btn-sv">${mode==='add'?'Add Job':'Save'}</button>
    </div>
  </div></div>`;
  $('mc').onclick=$('btn-cx').onclick=closeModal;
  $('mbd').onclick=e=>{if(e.target===e.currentTarget)closeModal()};
  $('f-assigned').onchange=function(){$('custom-wrap').style.display=this.value==='__custom__'?'block':'none'};
  if(j.assigned&&S.members.includes(j.assigned)){
    $('f-assigned').value=j.assigned;
  }else if(j.assigned){
    // A custom (non-member) name — keep it via the "Type name…" field instead of wiping it on save
    $('f-assigned').value='__custom__';
    $('custom-wrap').style.display='block';
    $('f-cname').value=j.assigned;
  }
  $('btn-sv').onclick=async()=>{
    const name=$('f-name').value.trim();
    if(!name){toast('Please enter a job name','');return}
    let assigned=$('f-assigned').value;
    if(assigned==='__custom__')assigned=$('f-cname').value.trim();
    const address=$('f-addr').value.trim();
    const prevAddress=(j.address||'').trim();
    const addressChanged=mode==='add'||address!==prevAddress;
    const data={
      name,assigned,
      address,
      status:$('f-status').value,
      stage:$('f-stage').value,
      type:$('f-type').value,
      startDate:$('f-start').value,
      dueDate:$('f-due').value,
      value:$('f-val').value,
      description:$('f-desc').value.trim(),
      customerName:$('f-cust-name').value.trim(),
      customerPhone:$('f-cust-phone').value.trim(),
      customerEmail:$('f-cust-email').value.trim(),
      billingAddress:$('f-bill-addr').value.trim(),
      leadSource:$('f-source').value,
    };
    if(mode==='add'){
      const nj={id:uid(),...data,progress:data.status==='complete'?100:0,notes:[],photos:[],tasks:[],dailyLogs:[],documents:[],comms:[],created:Date.now()};
      nj.geocodeStatus=address?'pending':'none';
      if(nj.status==='complete')nj.completedAt=Date.now();
      await writeJob(nj);await logAct('added job',name);toast('Job added');
    }else{
      const merged={...j,...data};
      if(addressChanged){
        delete merged.lat;
        delete merged.lng;
        delete merged.geocodedAt;
        delete merged.geocodeLabel;
        merged.geocodeStatus=address?'pending':'none';
        merged.locationSource=address?'address':'none';
      }
      if(merged.status==='complete'&&!j.completedAt)merged.completedAt=Date.now();
      await writeJob(merged);await logAct('updated job',name);toast('Changes saved');
    }
    closeModal();render();
  };
  if(mode==='edit')$('btn-del').onclick=async()=>{
    const backup=JSON.parse(JSON.stringify(j));
    await deleteJobDB(j.id);await logAct('deleted job',j.name);
    S.detail=null;closeModal();render();
    let restored=false;
    const restore=async()=>{if(restored)return;restored=true;await writeJob(backup);render();toast('Job restored')};
    UNDO.push(restore);
    toast('Job deleted','undo',restore);
  };
}
