// Company and owner workspace switcher
// Generated from src/app/09-settings-access-command-voice.js.
// ══ Company Switcher ══
function canManageCompanies(){
  return !gateOn()||isOwnerRole(SESSION);
}
function showCompanySwitcher(){
  if(gateOn()&&!canSeeAll(SESSION)){toast('You only have access to '+ACTIVE_CO.label,'');return}
  const cur=OWNER_MODE?'owner':COMPANY_ID;
  const rows=Object.values(COMPANIES).map(co=>`
    <button class="co-pick${co.id===cur?' active':''}" data-co="${esc(co.id)}">
      <div><div class="co-pick-name">${esc(co.label)}</div><div class="co-pick-tag">${esc(co.tag)}</div></div>
      ${co.id===cur?'<span class="co-pick-badge">Current</span>':''}
    </button>`).join('');
  const ownerActive=cur==='owner';
  $('modal-root').innerHTML=`<div class="modal-bd" id="mbd" role="dialog" aria-modal="true" aria-label="Choose workspace"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Choose workspace</div><button class="modal-close" id="mc" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      <p style="font-size:13px;color:var(--text-2);margin-bottom:16px;line-height:1.5">Each company keeps completely separate jobs, invoices, schedule, photos, and settings. Owner is a cross-company analytics workspace. Picking any one reloads the app.</p>
      ${rows}
      <button class="co-pick${ownerActive?' active':''}" data-co="owner" style="border-color:var(--gold);background:${ownerActive?'var(--gold-light)':'var(--surface)'}">
        <div><div class="co-pick-name">Owner</div><div class="co-pick-tag">Analytics &amp; reports across all companies</div></div>
        ${ownerActive?'<span class="co-pick-badge">Current</span>':'<span class="co-pick-badge">All</span>'}
      </button>
      ${canManageCompanies()?'<button class="btn-sm" id="co-manage" type="button" style="margin-top:12px;width:100%">Manage companies</button>':''}
    </div>
  </div></div>`;
  $('mc').onclick=closeModal;
  $('mbd').onclick=e=>{if(e.target===e.currentTarget)closeModal()};
  $('co-manage')?.addEventListener('click',showCompanyManagerModal);
  document.querySelectorAll('[data-co]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.co;
    if(id===cur){closeModal();return}
    try{localStorage.setItem('jt_company',id)}catch(e){}
    location.reload();
  });
}

function companySlug(name){
  return String(name||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,24);
}
function uniqueCompanyId(base){
  let id=companySlug(base)||'company';
  if(id.length<2)id='co-'+id;
  const root=id.slice(0,20);
  let n=2;
  while(COMPANIES[id]||(DEFAULT_COMPANIES&&DEFAULT_COMPANIES[id])){id=(root+'-'+n).slice(0,24);n++}
  return id;
}
function showCompanyManagerModal(){
  if(!canManageCompanies()){toast('Only owners can manage companies','');return}
  const rows=Object.values(COMPANIES).sort((a,b)=>(a.label||'').localeCompare(b.label||'')).map(co=>`
    <div class="acc-row" style="gap:10px">
      <div class="acc-ava">${initials(co.label)}</div>
      <div class="acc-info"><div class="acc-name">${esc(co.label)}</div><div class="acc-meta">${esc(co.tag||'No tagline')} · namespace ${esc(co.ns)}</div></div>
      <button class="btn-sm" data-co-edit="${esc(co.id)}" type="button">Edit</button>
      <button class="btn-sm" data-co-open="${esc(co.id)}" type="button">Open</button>
    </div>`).join('');
  $('modal-root').innerHTML=`<div class="modal-bd" id="mbd" role="dialog" aria-modal="true" aria-label="Manage companies"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Manage Companies</div><button class="modal-close" id="mc" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      <div class="tt-hint" style="margin-bottom:12px">Add companies here without a code change. Each company gets its own data namespace for jobs, invoices, photos, schedules, and settings.</div>
      <button class="btn-add" id="co-add" type="button" style="width:100%;justify-content:center;margin-bottom:12px">+ Add Company</button>
      <div class="member-list">${rows||'<p style="font-size:13px;color:var(--text-3);padding:4px 0">No companies yet.</p>'}</div>
    </div>
  </div></div>`;
  $('mc').onclick=closeModal;
  $('mbd').onclick=e=>{if(e.target===e.currentTarget)closeModal()};
  $('co-add').onclick=()=>showCompanyEditorModal();
  document.querySelectorAll('[data-co-edit]').forEach(b=>b.onclick=()=>showCompanyEditorModal(COMPANIES[b.dataset.coEdit]));
  document.querySelectorAll('[data-co-open]').forEach(b=>b.onclick=()=>{try{localStorage.setItem('jt_company',b.dataset.coOpen)}catch(e){};location.reload()});
}
function showCompanyEditorModal(co){
  if(!canManageCompanies()){toast('Only owners can manage companies','');return}
  const editing=!!co;
  const current=co||{};
  $('modal-root').innerHTML=`<div class="modal-bd" id="mbd" role="dialog" aria-modal="true" aria-label="${editing?'Edit':'Add'} company"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">${editing?'Edit Company':'Add Company'}</div><button class="modal-close" id="mc" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Company name *</label><input class="form-input" id="co-label" value="${esc(current.label||'')}" placeholder="e.g. Norris Lake Roofing"></div>
      <div class="form-group"><label class="form-label">Tagline</label><input class="form-input" id="co-tag" value="${esc(current.tag||'')}" placeholder="e.g. Roofing & Exteriors"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Company ID</label><input class="form-input" id="co-id" value="${esc(current.id||'')}" placeholder="auto-generated" ${editing?'disabled':''}></div>
        <div class="form-group"><label class="form-label">Data namespace</label><input class="form-input" id="co-ns" value="${esc(current.ns||'')}" placeholder="auto-generated" ${editing?'disabled':''}></div>
      </div>
      <div class="tt-hint">The ID and namespace are permanent because they point to this company's saved data. For new companies, leave them blank unless you need a specific short code.</div>
    </div>
    <div class="modal-foot">
      ${editing?'<button class="btn-delete" id="co-archive" style="margin-right:auto">Archive</button>':''}
      <button class="btn-cancel" id="btn-cx">Cancel</button>
      <button class="btn-save" id="co-save">Save</button>
    </div>
  </div></div>`;
  $('mc').onclick=$('btn-cx').onclick=showCompanyManagerModal;
  $('mbd').onclick=e=>{if(e.target===e.currentTarget)showCompanyManagerModal()};
  if(!editing){
    $('co-label').addEventListener('input',()=>{
      if(!$('co-id').value.trim())$('co-id').placeholder=uniqueCompanyId($('co-label').value);
      if(!$('co-ns').value.trim())$('co-ns').placeholder=uniqueCompanyId($('co-label').value);
    });
  }
  $('co-save').onclick=async()=>{
    const label=$('co-label').value.trim();
    if(!label){toast('Enter a company name','');return}
    const id=editing?current.id:(companySlug($('co-id').value.trim())||uniqueCompanyId(label));
    const ns=editing?current.ns:(companySlug($('co-ns').value.trim())||id);
    if(!/^[a-z0-9_-]{2,24}$/.test(id)||!/^[a-z0-9_-]{2,24}$/.test(ns)){toast('Use 2-24 lowercase letters, numbers, dashes, or underscores for ID/namespace','');return}
    if(!editing&&(COMPANIES[id]||DEFAULT_COMPANIES[id])){toast('That company ID already exists','');return}
    const next={...current,id,ns,label,tag:$('co-tag').value.trim(),active:true,createdAt:current.createdAt||Date.now(),updatedAt:Date.now()};
    try{await writeCompanyRegistryRecord(next);toast(editing?'Company saved':'Company added');showCompanyManagerModal()}
    catch(e){toast('Could not save company','')}
  };
  $('co-archive')?.addEventListener('click',async()=>{
    if(!OWNER_MODE&&current.id===COMPANY_ID){toast('Switch to another company before archiving this one','');return}
    if(!confirm('Archive '+(current.label||'this company')+'? Existing data is not deleted, but it will be hidden from the app.'))return;
    try{await writeCompanyRegistryRecord({...current,active:false,updatedAt:Date.now()});toast('Company archived');showCompanyManagerModal()}
    catch(e){toast('Could not archive company','')}
  });
}
