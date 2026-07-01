// Company and owner workspace switcher
// Generated from src/app/09-settings-access-command-voice.js.
// ══ Company Switcher ══
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
    </div>
  </div></div>`;
  $('mc').onclick=closeModal;
  $('mbd').onclick=e=>{if(e.target===e.currentTarget)closeModal()};
  document.querySelectorAll('[data-co]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.co;
    if(id===cur){closeModal();return}
    try{localStorage.setItem('jt_company',id)}catch(e){}
    location.reload();
  });
}
