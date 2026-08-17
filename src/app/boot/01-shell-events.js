// Navigation, header, referrals, and primary shell handlers
// Generated from src/app/10-handlers-boot.js.

// Which nav tabs a company's TYPE allows.
//
// Both tabs are marked display:none in index.html and revealed here, rather
// than shipped visible and hidden later. A gate has to fail closed: shipped
// visible, every way this function can fail to run — a slow load before the
// first paint, a stale cached bundle, an exception thrown earlier in
// attachShellHandlers — leaves a company looking at a tab that is not theirs.
// Hidden by default, the same failures show one tab too few, which is a
// nuisance rather than a wrong answer. A maintenance company seeing Entities
// is exactly the failure this shape prevents.
//
// Called at the very top of attachShellHandlers, before the element wiring
// below it, because a TypeError on any missing element down there used to skip
// the gating entirely.
//
// Set BOTH ways, not hidden-only: a company's type can change mid-session from
// the company editor, which updates ACTIVE_CO in place, so a tab that has just
// become relevant has to be able to come back without a reload.
function applyTypeGatedTabs(){
  const set=(view,on)=>{
    const btn=document.querySelector('.nav-btn[data-view="'+view+'"]');
    if(btn)btn.style.display=on?'':'none';
  };
  set('contracts',typeof ctEnabled==='function'&&ctEnabled());
  set('entities',typeof meEnabled==='function'&&meEnabled());
}

function attachShellHandlers(){
  applyTypeGatedTabs();
  document.querySelectorAll('.nav-btn').forEach(b=>{
    b.onclick=()=>{
      const view=b.dataset.view;
      if(!canOpenView(view)){toast(view==='reports'?'Reports are owner-only':'Owner-only','');return}
      S.view=view;S.detail=null;render();
    }
  });
  // onId rather than $('x').onclick: these two threw if either element was
  // missing, and being above the rest of this function that took everything
  // below them down with it — including the tab gating.
  onId('user-btn','click',showSettingsModal);
  onId('setup-link','click',showSetupModal);
  const _bco=$('brand-co');if(_bco)_bco.textContent=OWNER_MODE?'All Companies':ACTIVE_CO.label;
  const _bsw=$('brand-switch');if(_bsw){if(gateOn()&&!canSeeAll(SESSION)){_bsw.style.display='none';}else{_bsw.onclick=showCompanySwitcher;}}
  const _rpt=document.querySelector('.nav-btn[data-view="reports"]');if(_rpt&&!canSeeBank())_rpt.style.display='none';
  const _bnk=document.querySelector('.nav-btn[data-view="bank"]');if(_bnk&&!canSeeBank())_bnk.style.display='none';
  $('owner-refresh')?.addEventListener('click',refreshOwnerData);
  $('owner-manage-companies')?.addEventListener('click',showCompanyManagerModal);
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
}
