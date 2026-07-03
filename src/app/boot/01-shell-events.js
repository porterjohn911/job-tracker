// Navigation, header, referrals, and primary shell handlers
// Generated from src/app/10-handlers-boot.js.

function attachShellHandlers(){
  document.querySelectorAll('.nav-btn').forEach(b=>{
    b.onclick=()=>{
      const view=b.dataset.view;
      if(!canOpenView(view)){toast(view==='reports'?'Reports are manager/owner only':'Owner-only','');return}
      S.view=view;S.detail=null;render();
    }
  });
  $('user-btn').onclick=showSettingsModal;
  $('setup-link').onclick=showSetupModal;
  const _bco=$('brand-co');if(_bco)_bco.textContent=OWNER_MODE?'All Companies':ACTIVE_CO.label;
  const _bsw=$('brand-switch');if(_bsw){if(gateOn()&&!canSeeAll(SESSION)){_bsw.style.display='none';}else{_bsw.onclick=showCompanySwitcher;}}
  const _rpt=document.querySelector('.nav-btn[data-view="reports"]');if(_rpt&&!canSeeFinancials())_rpt.style.display='none';
  const _bnk=document.querySelector('.nav-btn[data-view="bank"]');if(_bnk&&!canSeeBank())_bnk.style.display='none';
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
}
