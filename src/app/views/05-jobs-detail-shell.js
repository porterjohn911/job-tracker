// Jobs list, job cards, empty state, and detail shell
// Generated from src/app/05-owner-reports-map-notifications.js lines 586-780.
function renderJobs(){
  const all=jobs();
  const cnt={all:all.length,lead:0,active:0,complete:0,hold:0,lost:0};
  all.forEach(j=>{if(cnt[j.status]!==undefined)cnt[j.status]++});
  const q=S.search.toLowerCase();
  const shown=all.filter(j=>{
    const mf=S.filter==='all'||j.status===S.filter;
    const hay=(j.name+' '+(j.address||'')+' '+(j.customerName||'')+' '+(j.customerPhone||'')+' '+(j.customerEmail||'')+' '+(j.assigned||'')).toLowerCase();
    const ms=!S.search||hay.includes(q);
    return mf&&ms;
  });
  const sortLabels={newest:'Newest',oldest:'Oldest',name:'A–Z',value:'Highest value',due:'Due soonest',progress:'Most complete'};
  const sortCheckSvg='<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>';
  return`<div class="toolbar">
    <button class="btn-add" id="btn-add-job" aria-label="Create new job">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
      New Job
    </button>
    <div class="search-wrap">
      <div class="search-icon"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z"/></svg></div>
      <input class="search" id="search-in" placeholder="Search jobs, address, customer…" value="${esc(S.search)}" aria-label="Search jobs">
    </div>
    <div class="sort-wrap">
      <button class="btn-sm" id="btn-sort" aria-label="Sort jobs" aria-haspopup="true" aria-expanded="${S.sortOpen?'true':'false'}">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12"/></svg>
        ${sortLabels[S.sort]||'Sort'}
      </button>
      <div class="sort-menu ${S.sortOpen?'open':''}" role="menu">
        ${Object.entries(sortLabels).map(([k,v])=>`<div class="sort-opt ${S.sort===k?'active':''}" data-sort="${k}" role="menuitem" tabindex="0">${sortCheckSvg}<span>${v}</span></div>`).join('')}
      </div>
    </div>
    <button class="btn-sm" id="btn-bulk" aria-label="${S.bulkMode?'Exit selection':'Select multiple jobs'}" aria-pressed="${S.bulkMode?'true':'false'}">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      ${S.bulkMode?'Done':'Select'}
    </button>
    <button class="btn-sm" id="btn-export-csv" title="Export to CSV" aria-label="Export all jobs to CSV">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
      Export
    </button>
  </div>
  <div class="filter-row" style="margin-bottom:14px">
    <div class="filter-chip ${S.filter==='all'?'active':''}" data-filter="all">All ${cnt.all}</div>
    <div class="filter-chip ${S.filter==='lead'?'active':''}" data-filter="lead">Lead ${cnt.lead}</div>
    <div class="filter-chip ${S.filter==='active'?'active':''}" data-filter="active">Active ${cnt.active}</div>
    <div class="filter-chip ${S.filter==='complete'?'active':''}" data-filter="complete">Done ${cnt.complete}</div>
    <div class="filter-chip ${S.filter==='hold'?'active':''}" data-filter="hold">On Hold ${cnt.hold}</div>
    <div class="filter-chip ${S.filter==='lost'?'active':''}" data-filter="lost">Lost ${cnt.lost}</div>
  </div>
  ${S.bulkMode&&S.bulkSel.size>0?`<div class="bulk-bar">
    <div class="bulk-bar-count">${S.bulkSel.size} selected</div>
    <button id="bulk-status">Set Status</button>
    <button id="bulk-assign">Assign</button>
    <button id="bulk-star">Pin/Unpin</button>
    <button class="danger" id="bulk-delete">Delete</button>
  </div>`:''}
  ${shown.length===0?renderEmpty(all.length):'<div class="jobs-grid">'+shown.map(renderCard).join('')+'</div>'}` ;
}

function renderEmpty(total){
  return`<div class="empty">
    <div class="empty-icon"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"/></svg></div>
    <h3>${total===0?'No jobs yet':'No matches'}</h3>
    <p>${total===0?'Add your first job to start tracking your team’s work.':'Try a different search or filter.'}</p>
    ${total===0?'<button class="btn-add" id="btn-add-job2" style="margin:0 auto">+ Add First Job</button>':''}
  </div>`;
}

function renderCard(j){
  const photos=j.photos||[];
  const pct=j.progress||0;
  const photoBadge=photos.length>1?'<div class="photo-badge"><svg xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke=\"currentColor\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z\"/><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z\"/></svg>'+photos.length+'</div>':'';
  const firstPhoto=photos.length>0?(typeof photos[0]==='string'?photos[0]:photos[0].url):'';
  const thumb=photos.length>0?'<img src="'+firstPhoto+'" alt="" loading="lazy"><div class="status-dot '+sdClass(j.status)+'"></div>'+photoBadge:'<div class="status-dot '+sdClass(j.status)+'" style="top:10px;left:10px;position:absolute"></div><div class="card-thumb-icon">🏠</div>';

  const tasks=(j.tasks||[]);
  const openTasks=tasks.filter(t=>!t.done).length;
  const bal=jobBalance(j);
  const meta=[];
  if(j.customerName)meta.push(esc(j.customerName));
  if(openTasks)meta.push(openTasks+' open task'+(openTasks>1?'s':''));
  if(bal>0)meta.push('<span style="color:var(--orange);font-weight:600">'+money(bal)+' due</span>');

  const selected=S.bulkSel.has(j.id);
  const starSvg='<svg xmlns="http://www.w3.org/2000/svg" fill="'+(j.favorite?'currentColor':'none')+'" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/></svg>';
  return`<div class="job-card ${selected?'selected':''} ${S.bulkMode?'selectable':''}" data-open="${j.id}" data-card-id="${j.id}" style="animation-delay:${Math.random()*0.1}s" tabindex="0" role="link" aria-label="${esc(j.name)}${j.favorite?', pinned':''}">
    <div class="job-card-check" aria-hidden="true"></div>
    <button class="star-btn card-star ${j.favorite?'starred':''}" data-fav="${j.id}" title="${j.favorite?'Unpin':'Pin to top'}" aria-label="${j.favorite?'Unpin':'Pin'} ${esc(j.name)}" aria-pressed="${j.favorite?'true':'false'}">${starSvg}</button>
    <div class="card-thumb">${thumb}</div>
    <div class="card-body">
      <div class="card-name">${esc(j.name)}</div>
      <div class="card-addr"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/></svg>${esc(j.address||'No address')}</div>
      ${meta.length?`<div style="font-size:11.5px;color:var(--text-3);margin-bottom:8px;display:flex;gap:8px;flex-wrap:wrap">${meta.join(' · ')}</div>`:''}
      <div class="prog-track"><div class="prog-fill" style="width:${pct}%"></div></div>
      <div class="card-footer"><span class="status-pill ${spClass(j.status)}">${spLabel(j.status)}</span><span class="card-pct">${pct}%</span></div>
    </div>
  </div>`;
}

function renderDetail(id){
  const j=S.jobs[id];
  if(!j)return`<button class="detail-back" id="btn-back"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/></svg>Back</button><p style="color:var(--text-2)">Job not found.</p>`;
  const photos=j.photos||[];
  const pct=j.progress||0;
  const thumbHtml=photos.length>0?`<img src="${photos[0].url||photos[0]}" alt="">`:null;
  const stage=jobStage(j);
  const stageIdx=STAGES.indexOf(stage);
  const tab=S.detailTab||'overview';
  const tabs=[
    {id:'overview',label:'Overview'},
    {id:'customer',label:'Customer'},
    {id:'tasks',label:'Tasks',count:(j.tasks||[]).filter(t=>!t.done).length},
    {id:'log',label:'Daily Log',count:(j.dailyLogs||[]).length},
    {id:'photos',label:'Photos',count:photos.length},
    {id:'docs',label:'Files',count:(j.documents||[]).length},
    {id:'receipts',label:'Receipts',count:(j.receipts||[]).length},
    {id:'invoices',label:'Invoices',count:(j.invoices||[]).length},
    {id:'estimates',label:'Estimates',count:(j.estimates||[]).length},
    {id:'financial',label:'Financials'},
    {id:'comms',label:'Comms',count:(j.comms||[]).length},
    {id:'notes',label:'Notes',count:(j.notes||[]).length},
  ];

  return`
    <button class="detail-back" id="btn-back"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/></svg>All Jobs</button>
    <div class="detail-hero">${thumbHtml?thumbHtml:'🏠'}
      ${photos.length>0?`<div class="hero-overlay"><div class="hero-photo-count"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"/><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"/></svg>${photos.length} photo${photos.length>1?'s':''}</div><span class="status-pill ${spClass(j.status)}">${spLabel(j.status)}</span></div>`:''}
    </div>
    <div class="detail-name">${esc(j.name)}</div>
    <div class="detail-addr"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/></svg>${esc(j.address||'No address set')}</div>

    <div class="quick-actions">
      <a class="qa-btn ${j.customerPhone?'':'disabled'}" ${j.customerPhone?`href="tel:${encodeURIComponent(j.customerPhone)}"`:''}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"/></svg>
        Call
      </a>
      <a class="qa-btn ${j.customerPhone?'':'disabled'}" ${j.customerPhone?`href="sms:${encodeURIComponent(j.customerPhone)}"`:''}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-3.978c.26-.39.687-.634 1.153-.67 1.09-.086 2.17-.208 3.238-.365 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"/></svg>
        Text
      </a>
      <a class="qa-btn ${j.customerEmail?'':'disabled'}" ${j.customerEmail?`href="mailto:${encodeURIComponent(j.customerEmail)}"`:''}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>
        Email
      </a>
      <a class="qa-btn ${j.address?'':'disabled'}" ${j.address?`href="https://maps.google.com/?q=${encodeURIComponent(j.address)}" target="_blank" rel="noopener"`:''}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"/></svg>
        Map
      </a>
    </div>

    <div class="stage-pipeline">
      ${STAGES.map((s,i)=>{
        const cls=i<stageIdx?'done':i===stageIdx?'current':'';
        return `<button class="stage-step ${cls}" data-stage="${esc(s)}" title="${esc(s)}">${esc(s)}</button>`;
      }).join('')}
    </div>

    <div class="detail-actions">
      <button class="btn-sm" id="btn-edit-job"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/></svg>Edit Job</button>
      <button class="btn-sm" id="btn-print-job"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z"/></svg>Print</button>
      <button class="btn-sm" id="btn-share-job"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z"/></svg>Share</button>
    </div>

    <div class="prog-section">
      <div class="prog-top"><span class="prog-label-text">Completion</span><span class="prog-pct" id="prog-pct">${pct}%</span></div>
      <div class="prog-track-lg"><div class="prog-fill-lg" id="prog-fill-lg" style="width:${pct}%"></div></div>
      <input type="range" id="prog-slider" min="0" max="100" value="${pct}">
    </div>

    <div class="detail-tabs">
      ${tabs.map(t=>`<button class="detail-tab ${tab===t.id?'active':''}" data-tab="${t.id}">${t.label}${t.count?' <span style="opacity:0.6">·'+t.count+'</span>':''}</button>`).join('')}
    </div>

    <div id="tab-content">${renderDetailTab(j,tab)}</div>
  `;
}

function statCell(label,tab,value,addable,color){
  const goArrow='<span class="stat-go"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg></span>';
  return `<div class="info-cell stat-cell" data-goto="${tab}" tabindex="0" role="button" aria-label="${esc(label)}: ${esc(String(value))}. Open ${esc(label)}">
    ${addable?`<button class="stat-add" data-add="${tab}" title="Add to ${esc(label)}" aria-label="Add to ${esc(label)}">+</button>`:''}
    <div class="info-label">${esc(label)}</div>
    <div class="info-value"${color?` style="color:${color}"`:''}>${esc(String(value))}${goArrow}</div>
  </div>`;
}
function triggerQuickAdd(tab){
  setTimeout(()=>{
    if(tab==='tasks')$('task-in')?.focus();
    else if(tab==='notes')$('note-in')?.focus();
    else if(tab==='photos')$('photo-upload')?.click();
    else if(tab==='docs')$('doc-upload')?.click();
    else if(tab==='receipts')$('rcpt-amount')?.focus();
    else if(tab==='invoices')$('btn-new-inv')?.click();
    else if(tab==='estimates')$('btn-new-est')?.click();
    else if(tab==='log'||tab==='comms'){const f=document.querySelector('#tab-content input,#tab-content textarea,#tab-content select');if(f){f.focus();f.scrollIntoView({block:'center'});}}
  },50);
}
