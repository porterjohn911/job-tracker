// Core modals, job editor, CSV export, share, and print
// Generated from src/app.js lines 3206-3387.
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
        <div class="form-group"><label class="form-label">Status</label><select class="form-select" id="f-status"><option value="lead" ${j.status==='lead'?'selected':''}>Lead</option><option value="active" ${(j.status==='active'||!j.status)?'selected':''}>Active</option><option value="complete" ${j.status==='complete'?'selected':''}>Complete</option><option value="hold" ${j.status==='hold'?'selected':''}>On Hold</option></select></div>
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
  if(j.assigned&&S.members.includes(j.assigned))$('f-assigned').value=j.assigned;
  $('btn-sv').onclick=async()=>{
    const name=$('f-name').value.trim();
    if(!name){toast('Please enter a job name','');return}
    let assigned=$('f-assigned').value;
    if(assigned==='__custom__')assigned=$('f-cname').value.trim();
    const data={
      name,assigned,
      address:$('f-addr').value.trim(),
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
      if(nj.status==='complete')nj.completedAt=Date.now();
      await writeJob(nj);await logAct('added job',name);toast('Job added');
    }else{
      const merged={...j,...data};
      if(merged.status==='complete'&&!j.completedAt)merged.completedAt=Date.now();
      await writeJob(merged);await logAct('updated job',name);toast('Changes saved');
    }
    closeModal();render();
  };
  if(mode==='edit')$('btn-del').onclick=async()=>{
    const backup=JSON.parse(JSON.stringify(j));
    await deleteJobDB(j.id);await logAct('deleted job',j.name);
    S.detail=null;closeModal();render();
    toast('Job deleted','undo',async()=>{await writeJob(backup);render();toast('Job restored')});
    UNDO.push(async()=>{await writeJob(backup);render();toast('Job restored')});
  };
}

function showSetupModal(){
  $('modal-root').innerHTML=`<div class="modal-bd" id="mbd"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Connect Your Team</div><button class="modal-close" id="mc"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      <p style="font-size:13.5px;color:var(--text-2);line-height:1.7;margin-bottom:16px">To share jobs, photos, and notes across your team in real time, connect a free Firebase database. Takes about 5 minutes.</p>
      <div class="setup-steps">
        <div class="setup-step"><div class="step-num">1</div><div class="step-text">Go to <a href="https://console.firebase.google.com" target="_blank">console.firebase.google.com</a> and sign in with Google.</div></div>
        <div class="setup-step"><div class="step-num">2</div><div class="step-text">Click "Add project", name it <strong>waterfront-jobs</strong>, skip Analytics → Create.</div></div>
        <div class="setup-step"><div class="step-num">3</div><div class="step-text">Build → Realtime Database → Create Database → "Start in test mode" → Done.</div></div>
        <div class="setup-step"><div class="step-num">4</div><div class="step-text">Gear icon ⚙ → Project settings → Your apps → Web icon &lt;/&gt; → Register → copy the <strong>firebaseConfig</strong>.</div></div>
        <div class="setup-step"><div class="step-num">5</div><div class="step-text">Paste the config JSON below and tap Connect. Do this on every team member's phone.</div></div>
      </div>
      <div class="form-group"><label class="form-label">Firebase config JSON</label><textarea class="form-textarea" id="fb-cfg" style="font-family:monospace;font-size:12px;min-height:110px" placeholder='{"apiKey":"AIza...","authDomain":"...","databaseURL":"https://....firebaseio.com","projectId":"...","storageBucket":"...","messagingSenderId":"...","appId":"..."}'>
</textarea></div>
    </div>
    <div class="modal-foot"><button class="btn-cancel" id="btn-cx">Cancel</button><button class="btn-save" id="btn-connect">Connect Team</button></div>
  </div></div>`;
  $('mc').onclick=$('btn-cx').onclick=closeModal;
  $('mbd').onclick=e=>{if(e.target===e.currentTarget)closeModal()};
  $('btn-connect').onclick=()=>{
    let raw=$('fb-cfg').value.trim();
    let cfg;
    try{raw=raw.replace(/^.*?=/,'').replace(/;?\s*$/,'');cfg=JSON.parse(raw);if(!cfg.databaseURL)throw new Error('Missing databaseURL')}
    catch(e){toast('Invalid config — check and try again','');return}
    localStorage.setItem('wfs_fb',JSON.stringify(cfg));FIREBASE_CONFIG=cfg;
    closeModal();const ok=initFB(cfg);if(ok)toast('Team connected! Live sync active');
  };
}

// ══ Helpers for photo backward compat ══
function photoURL(p){return typeof p==='string'?p:(p&&p.url)||''}

// ══ CSV export ══
function exportCSV(){
  const rows=[['Name','Customer','Phone','Email','Address','Status','Stage','Type','Assigned','Start','Due','Estimate','Invoiced','Paid','Balance','Progress','Created']];
  jobs().forEach(j=>{
    rows.push([j.name,j.customerName,j.customerPhone,j.customerEmail,j.address,j.status,jobStage(j),j.type,j.assigned,j.startDate,j.dueDate,j.value,j.invoiced,j.paid,jobBalance(j),(j.progress||0)+'%',j.created?new Date(j.created).toLocaleDateString():''].map(v=>v==null?'':String(v)));
  });
  const csv=rows.map(r=>r.map(c=>/[",\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='waterfront-jobs-'+dateKey(new Date())+'.csv';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  toast('Exported '+jobs().length+' jobs');
}

// ══ Share / Print ══
function printJob(j){
  const w=window.open('','_blank');
  if(!w){toast('Pop-up blocked','');return}
  const photos=(j.photos||[]).map(p=>photoURL(p));
  w.document.write(`<!DOCTYPE html><html><head><title>${esc(j.name)} — Job Summary</title>
    <style>body{font-family:system-ui,sans-serif;max-width:800px;margin:30px auto;padding:0 20px;color:#0a1f18}
    h1{font-size:24px;margin:0 0 6px}h2{font-size:14px;text-transform:uppercase;color:#666;margin:24px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
    .meta{color:#666;margin-bottom:20px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:14px}
    .cell{background:#f5f5f5;padding:10px;border-radius:6px}.label{font-size:11px;color:#666;text-transform:uppercase;font-weight:700}
    img{max-width:200px;border-radius:8px;margin:4px}.pphotos{display:flex;flex-wrap:wrap}</style></head><body>
    <h1>${esc(j.name)}</h1>
    <div class="meta">${esc(j.address||'')} ${j.customerName?'· '+esc(j.customerName):''} ${j.customerPhone?'· '+esc(j.customerPhone):''}</div>
    <h2>Details</h2>
    <div class="grid">
      <div class="cell"><div class="label">Stage</div>${esc(jobStage(j))}</div>
      <div class="cell"><div class="label">Status</div>${esc(spLabel(j.status))}</div>
      <div class="cell"><div class="label">Type</div>${esc(j.type||'—')}</div>
      <div class="cell"><div class="label">Assigned</div>${esc(j.assigned||'—')}</div>
      <div class="cell"><div class="label">Start</div>${esc(j.startDate||'—')}</div>
      <div class="cell"><div class="label">Due</div>${esc(j.dueDate||'—')}</div>
      <div class="cell"><div class="label">Estimate</div>${money(j.value)}</div>
      <div class="cell"><div class="label">Balance</div>${money(jobBalance(j))}</div>
    </div>
    ${j.description?'<h2>Scope of Work</h2><p>'+esc(j.description).replace(/\n/g,'<br>')+'</p>':''}
    ${(j.tasks||[]).length?'<h2>Tasks</h2><ul>'+(j.tasks||[]).map(t=>'<li>'+(t.done?'☑ ':'☐ ')+esc(t.text)+(t.due?' (due '+esc(t.due)+')':'')+'</li>').join('')+'</ul>':''}
    ${photos.length?'<h2>Photos</h2><div class="pphotos">'+photos.map(p=>'<img src="'+p+'" />').join('')+'</div>':''}
    </body></html>`);
  w.document.close();
  setTimeout(()=>w.print(),500);
}

async function shareJob(j){
  const text=`${j.name}\n${j.address||''}\n${j.customerName?'Customer: '+j.customerName+'\n':''}Stage: ${jobStage(j)} · ${j.progress||0}% complete`;
  if(navigator.share){
    try{await navigator.share({title:j.name,text});return}catch(e){if(e.name==='AbortError')return}
  }
  try{await navigator.clipboard.writeText(text);toast('Copied to clipboard')}catch(e){alert(text)}
}

