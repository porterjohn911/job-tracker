// Navigation, header, referrals, and primary shell handlers
// Generated from src/app/10-handlers-boot.js.

function attachShellHandlers(){
  document.querySelectorAll('.nav-btn').forEach(b=>{
    b.onclick=()=>{
      const view=b.dataset.view;
      if(!canOpenView(view)){toast(view==='reports'?'Reports are owner-only':'Owner-only','');return}
      S.view=view;S.detail=null;render();
    }
  });
  $('user-btn').onclick=showSettingsModal;
  $('setup-link').onclick=showSetupModal;
  const _bco=$('brand-co');if(_bco)_bco.textContent=OWNER_MODE?'All Companies':ACTIVE_CO.label;
  const _bsw=$('brand-switch');if(_bsw){if(gateOn()&&!canSeeAll(SESSION)){_bsw.style.display='none';}else{_bsw.onclick=showCompanySwitcher;}}
  const _rpt=document.querySelector('.nav-btn[data-view="reports"]');if(_rpt&&!canSeeBank())_rpt.style.display='none';
  const _bnk=document.querySelector('.nav-btn[data-view="bank"]');if(_bnk&&!canSeeBank())_bnk.style.display='none';
  // Contracts only exist for maintenance/management companies, and only for
  // managers and owners — the same people the Firebase rules let read the node.
  // Set both ways rather than only hiding: unlike the role-based buttons above,
  // a company's type can change mid-session from the company editor, which
  // updates ACTIVE_CO in place. Hiding only would leave the tab missing until a
  // reload right after someone switched the company to maintenance.
  const _ct=document.querySelector('.nav-btn[data-view="contracts"]');if(_ct)_ct.style.display=(typeof ctEnabled==='function'&&ctEnabled())?'':'none';
  // Entities are management-only, set both ways for the same reason: a
  // company's type can change mid-session from the company editor.
  const _me=document.querySelector('.nav-btn[data-view="entities"]');if(_me)_me.style.display=(typeof meEnabled==='function'&&meEnabled())?'':'none';
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
