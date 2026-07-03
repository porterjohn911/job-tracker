// Command palette items, filtering, rendering, and execution
// Generated from src/app/09-settings-access-command-voice.js.
// ══ Command Palette ══
let CMD={open:false,query:'',idx:0,items:[]};
function cmdItems(){
  const out=[];
  // Views
  [['dashboard','Home / Dashboard','home'],['jobs','Jobs','briefcase'],['schedule','Schedule','calendar'],['invoices','Invoices','invoice'],['referrals','Referrals','team'],['map','Map','map'],['reports','Reports','chart'],['activity','Activity','list'],['team','Team','team'],['time','Time','calendar'],['bank','Bank','chart']].forEach(([v,name,ico])=>{
    if(!canOpenView(v))return;
    out.push({type:'view',name:'Go to '+name,sub:'View',ico,run:()=>{S.view=v;S.detail=null;render()}});
  });
  // Actions
  out.push({type:'action',name:'New Job',sub:'Create a job',ico:'plus',run:()=>showJobModal('add')});
  out.push({type:'action',name:'New Invoice',sub:'Pick a job, then create invoice',ico:'invoice',run:()=>showJobPickerModal(jobId=>showInvoiceModal(jobId))});
  out.push({type:'action',name:'New Estimate',sub:'Pick a job, then create an estimate',ico:'invoice',run:()=>showJobPickerModal(jobId=>showInvoiceModal(jobId,null,'estimate'))});
  out.push({type:'action',name:'New Referral',sub:'Log a referred lead & payout',ico:'plus',run:()=>showReferralModal('add')});
  out.push({type:'action',name:'Settings & Company Info',sub:'Edit name, logo, invoice defaults',ico:'kbd',run:showSettingsModal});
  if(!gateOn()||canSeeAll(SESSION)){
    out.push({type:'action',name:'Switch company / workspace',sub:'Waterfront · Manufactured Housing · Norris Lake · Owner',ico:'link',run:showCompanySwitcher});
    if(!OWNER_MODE)out.push({type:'action',name:'Owner workspace',sub:'Analytics across all companies',ico:'chart',run:()=>{try{localStorage.setItem('jt_company','owner')}catch(e){};location.reload()}});
  }
  out.push({type:'action',name:'Export to CSV',sub:'Download all jobs',ico:'download',run:exportCSV});
  out.push({type:'action',name:'Notifications',sub:'See your inbox',ico:'bell',run:showNotificationsModal});
  out.push({type:'action',name:'Connect Team (Firebase)',sub:'Live sync setup',ico:'link',run:showSetupModal});
  out.push({type:'action',name:'Keyboard Shortcuts',sub:'See all hotkeys',ico:'kbd',run:showShortcutsModal});
  out.push({type:'action',name:'Undo last action',sub:'Reverse the most recent change',ico:'undo',run:undoLast});
  // Jobs
  jobs().forEach(j=>{
    const sub=[j.customerName,j.address,spLabel(j.status)].filter(Boolean).join(' · ');
    out.push({type:'job',name:j.name,sub,ico:'job',run:()=>{S.detail=j.id;S.view='jobs';S.detailTab='overview';render()}});
  });
  return out;
}
function cmdFilter(q){
  const items=cmdItems();
  if(!q)return items;
  const ql=q.toLowerCase();
  // Simple fuzzy: include if all query chars appear in order
  const matches=items.map(it=>{
    const hay=(it.name+' '+(it.sub||'')).toLowerCase();
    let idx=0,score=0;
    for(const ch of ql){
      const f=hay.indexOf(ch,idx);
      if(f<0)return null;
      score+=(f-idx);idx=f+1;
    }
    return {it,score:score+(hay.startsWith(ql)?-100:0)};
  }).filter(Boolean).sort((a,b)=>a.score-b.score);
  return matches.map(m=>m.it);
}
const CMD_ICONS={
  home:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"/></svg>',
  briefcase:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>',
  calendar:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25"/></svg>',
  map:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"/></svg>',
  chart:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z"/></svg>',
  list:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"/></svg>',
  team:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952"/></svg>',
  plus:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>',
  download:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>',
  bell:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31"/></svg>',
  link:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757"/></svg>',
  kbd:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5v10.5H3.75z"/></svg>',
  undo:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"/></svg>',
  job:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12"/></svg>',
  invoice:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 3h6m-9-9h12v18l-3-2-3 2-3-2-3 2V6z"/></svg>',
};
function showCommandPalette(){
  CMD.open=true;CMD.query='';CMD.idx=0;CMD.items=cmdItems();
  renderCmd();
  setTimeout(()=>{const i=document.getElementById('cmd-input');if(i)i.focus()},10);
}
function hideCommandPalette(){CMD.open=false;document.getElementById('cmd-root').innerHTML=''}
function renderCmd(){
  if(!CMD.open)return;
  const groups={action:[],view:[],job:[]};
  CMD.items.forEach((it,i)=>groups[it.type].push({...it,gi:i}));
  const groupOrder=[['action','Actions'],['view','Views'],['job','Jobs']];
  let html='';
  let visIdx=0;
  groupOrder.forEach(([k,label])=>{
    if(!groups[k].length)return;
    html+=`<div class="cmd-group-hd">${label}</div>`;
    groups[k].slice(0,20).forEach(it=>{
      const sel=visIdx===CMD.idx?'sel':'';
      html+=`<div class="cmd-item ${sel}" data-cmd-idx="${visIdx}">
        <div class="cmd-item-icon">${CMD_ICONS[it.ico]||CMD_ICONS.job}</div>
        <div class="cmd-item-body"><div class="cmd-item-name">${esc(it.name)}</div>${it.sub?`<div class="cmd-item-sub">${esc(it.sub)}</div>`:''}</div>
      </div>`;
      visIdx++;
    });
  });
  if(!html)html=`<div class="cmd-empty">No matches for “${esc(CMD.query)}”</div>`;
  document.getElementById('cmd-root').innerHTML=`<div class="cmd-bd" id="cmd-bd" role="dialog" aria-label="Command palette" aria-modal="true">
    <div class="cmd-box">
      <div class="cmd-input-wrap">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z"/></svg>
        <input id="cmd-input" class="cmd-input" placeholder="Search jobs, run commands…" value="${esc(CMD.query)}" aria-label="Search" autocomplete="off">
        <span class="cmd-kbd">ESC</span>
      </div>
      <div class="cmd-results" id="cmd-results">${html}</div>
      <div class="cmd-foot">
        <span><span class="cmd-kbd">↑</span><span class="cmd-kbd">↓</span> navigate</span>
        <span><span class="cmd-kbd">↵</span> select</span>
        <span><span class="cmd-kbd">ESC</span> close</span>
      </div>
    </div>
  </div>`;
  const inp=document.getElementById('cmd-input');
  inp.oninput=()=>{CMD.query=inp.value;CMD.items=cmdFilter(CMD.query);CMD.idx=0;renderCmd();setTimeout(()=>document.getElementById('cmd-input').focus(),0);inp.value;document.getElementById('cmd-input').value=CMD.query;document.getElementById('cmd-input').setSelectionRange(CMD.query.length,CMD.query.length)};
  document.getElementById('cmd-bd').onclick=e=>{if(e.target.id==='cmd-bd')hideCommandPalette()};
  document.querySelectorAll('[data-cmd-idx]').forEach(el=>el.onclick=()=>{
    const i=parseInt(el.dataset.cmdIdx);CMD.idx=i;runCmd();
  });
}
function runCmd(){
  // Flatten in same order as render
  const groups={action:[],view:[],job:[]};
  CMD.items.forEach(it=>groups[it.type].push(it));
  const ordered=[...groups.action,...groups.view,...groups.job.slice(0,20)];
  const it=ordered[CMD.idx];
  if(!it)return;
  hideCommandPalette();
  it.run();
}
