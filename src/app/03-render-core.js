// Main render dispatcher, dashboard, schedule, and detail shell
// Generated from src/app.js lines 499-828.
// ══ Render ══
function render(){
  const c=$('content');
  if(OWNER_MODE){renderOwner(c);return}
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===S.view));
  if(!canOpenView(S.view)){
    c.innerHTML=renderRestrictedView(S.view);
    updateUserUI();
    updateBellBadge();
    attachHandlers();
    return;
  }
  if(S.view==='jobs'&&S.detail)c.innerHTML=renderDetail(S.detail);
  else if(S.view==='jobs')c.innerHTML=renderJobs();
  else if(S.view==='dashboard')c.innerHTML=renderDashboard();
  else if(S.view==='schedule')c.innerHTML=renderSchedule();
  else if(S.view==='invoices')c.innerHTML=renderInvoicesView();
  else if(S.view==='customers')c.innerHTML=renderCustomers();
  else if(S.view==='referrals')c.innerHTML=renderReferrals();
  else if(S.view==='map')c.innerHTML=renderMap();
  else if(S.view==='reports')c.innerHTML=renderReports();
  else if(S.view==='activity')c.innerHTML=renderActivity();
  else if(S.view==='team')c.innerHTML=renderTeam();
  else if(S.view==='time')c.innerHTML=renderTime();
  else if(S.view==='bank')c.innerHTML=renderBank();
  updateUserUI();
  updateBellBadge();
  attachHandlers();
  if(S.view==='map')mountMap();
}

function renderRestrictedView(view){
  const msg=view==='reports'
    ? 'Reports are only available to managers and owners.'
    : 'This area is owner-only.';
  return `<div class="tt-empty" style="padding:40px 16px"><p style="font-size:14px;color:var(--text-2);line-height:1.6">${esc(msg)}</p></div>`;
}

function updateUserUI(){
  const u=$('user-label'),a=$('user-avatar');
  u.textContent=S.user||'Set name';
  a.textContent=S.user?initials(S.user):'?';
}

function sdClass(s){return{lead:'sd-lead',active:'sd-active',complete:'sd-complete',hold:'sd-hold',lost:'sd-lost'}[s]||'sd-hold'}
function spClass(s){return{lead:'sp-lead',active:'sp-active',complete:'sp-complete',hold:'sp-hold',lost:'sp-lost'}[s]||'sp-hold'}
function spLabel(s){return{lead:'Lead',active:'Active',complete:'Complete',hold:'On Hold',lost:'Lost'}[s]||s}

function renderDashboard(){
  const all=jobs();
  const active=all.filter(j=>j.status==='active');
  const leads=all.filter(j=>j.status==='lead');
  const done=all.filter(j=>j.status==='complete');
  const totalValue=all.reduce((s,j)=>s+Number(j.value||0),0);
  const totalInvoiced=all.reduce((s,j)=>{const t=invoiceTotals(j);return s+(t?t.total:Number(j.invoiced||0))},0);
  const totalPaid=all.reduce((s,j)=>{const t=invoiceTotals(j);return s+(t?t.paid:Number(j.paid||0))},0);
  const outstanding=totalInvoiced-totalPaid;
  const pipeline=leads.reduce((s,j)=>s+Number(j.value||0),0);
  // Upcoming: jobs with start date in next 14 days, or not yet started
  const upcoming=all.filter(j=>{
    if(isClosedJob(j))return false;
    const d=daysUntil(j.startDate);
    return d!==null&&d>=-1&&d<=14;
  }).sort((a,b)=>(new Date(a.startDate))-(new Date(b.startDate))).slice(0,5);
  // Open tasks across all jobs
  const openTasks=[];
  all.forEach(j=>(j.tasks||[]).forEach((t,i)=>{if(!t.done)openTasks.push({...t,jobId:j.id,jobName:j.name})}));
  openTasks.sort((a,b)=>(a.due||'9999')>(b.due||'9999')?1:-1);
  // Status distribution for chart
  const cntStatus={lead:leads.length,active:active.length,complete:done.length,hold:all.filter(j=>j.status==='hold').length,lost:all.filter(j=>j.status==='lost').length};
  const maxCnt=Math.max(1,...Object.values(cntStatus));
  const colors={lead:'var(--gold)',active:'#4ade80',complete:'var(--sky)',hold:'#94a3b8',lost:'#dc2626'};
  const recent=S.activity.slice(0,5);

  return `
    <div style="margin-bottom:14px">
      <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;font-weight:700">${new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}</div>
      <div style="font-size:20px;font-weight:700;margin-top:2px">${S.user?'Hi, '+esc(S.user.split(' ')[0])+' 👋':'Welcome'}</div>
    </div>
    <button class="dash-receipt-btn" id="btn-dash-receipt"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"/><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"/></svg>Add receipt</button>
    <div class="kpi-grid">
      <div class="kpi-card accent">
        <div class="kpi-label">Active Jobs</div>
        <div class="kpi-value">${active.length}</div>
        <div class="kpi-sub">${leads.length} lead${leads.length!==1?'s':''} · ${done.length} done</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Job Value</div>
        <div class="kpi-value">${money(totalValue)}</div>
        <div class="kpi-sub">${money(pipeline)} in pipeline</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Invoiced</div>
        <div class="kpi-value">${money(totalInvoiced)}</div>
        <div class="kpi-sub">${money(totalPaid)} collected</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Outstanding</div>
        <div class="kpi-value" style="color:${outstanding>0?'var(--orange)':'var(--green-700)'}">${money(outstanding)}</div>
        <div class="kpi-sub">${outstanding>0?'awaiting payment':'all paid up'}</div>
      </div>
    </div>

    <div class="dash-section">
      <div class="dash-section-hd">Upcoming <span class="kpi-sub" style="font-size:11px">Next 14 days</span></div>
      ${upcoming.length===0?'<p style="font-size:12.5px;color:var(--text-3);padding:4px 0">Nothing scheduled. Add start dates to jobs to plan your week.</p>'
        :upcoming.map(j=>{
          const d=daysUntil(j.startDate);
          const lbl=d===0?'Today':d===1?'Tomorrow':d<0?Math.abs(d)+'d ago':'in '+d+'d';
          const pillCls=d<=1?'sp-lead':'sp-active';
          return `<div class="dash-row" data-open="${j.id}" style="cursor:pointer">
            <span style="font-size:16px">📅</span>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(j.name)}</div>
              <div style="font-size:11.5px;color:var(--text-3)">${fmtShort(j.startDate)} · ${esc(j.assigned||'Unassigned')}</div>
            </div>
            <span class="dash-row-pill status-pill ${pillCls}">${lbl}</span>
          </div>`;
        }).join('')}
    </div>

    <div class="dash-section">
      <div class="dash-section-hd">Open Tasks <span class="kpi-sub" style="font-size:11px">${openTasks.length} total</span></div>
      ${openTasks.length===0?'<p style="font-size:12.5px;color:var(--text-3);padding:4px 0">No open tasks. Add tasks inside a job’s Tasks tab.</p>'
        :openTasks.slice(0,6).map(t=>{
          const d=daysUntil(t.due);
          const overdue=d!==null&&d<0;
          const dueLbl=t.due?(overdue?'<span class="badge danger">'+Math.abs(d)+'d overdue</span>':d===0?'<span class="badge">Today</span>':d<=3?'<span class="badge">in '+d+'d</span>':fmtShort(t.due)):'';
          return `<div class="dash-row" data-open="${t.jobId}" style="cursor:pointer">
            <span style="font-size:14px">○</span>
            <div style="flex:1;min-width:0">
              <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.text)}</div>
              <div style="font-size:11.5px;color:var(--text-3)">${esc(t.jobName)}${t.assigned?' · '+esc(t.assigned):''}</div>
            </div>
            ${dueLbl}
          </div>`;
        }).join('')}
    </div>

    <div class="dash-section">
      <div class="dash-section-hd">Jobs by Status</div>
      <div class="bar-chart">
        ${['lead','active','hold','lost','complete'].map(s=>`
          <div class="bar-row">
            <div class="bar-row-label">${spLabel(s)}</div>
            <div class="bar-row-track"><div class="bar-row-fill" style="width:${(cntStatus[s]/maxCnt)*100}%;background:${colors[s]}"></div></div>
            <div class="bar-row-val">${cntStatus[s]}</div>
          </div>
        `).join('')}
      </div>
    </div>

    ${recent.length?`<div class="dash-section">
      <div class="dash-section-hd">Recent Activity <button class="btn-sm" id="btn-view-all-act" style="padding:5px 10px;font-size:11px">View all</button></div>
      ${recent.map(a=>`<div class="dash-row" style="cursor:default">
        <div class="activity-ava" style="width:28px;height:28px;font-size:11px">${initials(a.user)}</div>
        <div style="flex:1;min-width:0;font-size:12.5px">
          <strong>${esc(a.user)}</strong> ${esc(a.action)}${a.job?' · <strong>'+esc(a.job)+'</strong>':''}
          <div style="font-size:11px;color:var(--text-3)">${ago(a.time)}</div>
        </div>
      </div>`).join('')}
    </div>`:''}
  `;
}

// Returns the date range a job covers (inclusive) as 'YYYY-MM-DD' keys.
function jobDateRange(j){
  if(!j.startDate)return[];
  const start=j.startDate.slice(0,10);
  const end=(j.dueDate||j.startDate).slice(0,10);
  // Guard against invalid dates / due before start
  if(end<start)return[start];
  const out=[];
  const s=new Date(start+'T00:00:00');
  const e=new Date(end+'T00:00:00');
  // Cap at 365 days inside the loop so a bad far-future date (e.g. dueDate
  // "9999-12-31") can't build a multi-million-element array and freeze the tab.
  for(let d=new Date(s);d<=e&&out.length<365;d.setDate(d.getDate()+1)){
    out.push(dateKey(d));
  }
  return out;
}

function chipClass(status){return{lead:'cs-lead',active:'cs-active',complete:'cs-complete',hold:'cs-hold',lost:'cs-lost'}[status]||'cs-active'}
function chipBarColor(status){return{lead:'#d97706',active:'#16a34a',complete:'#0284c7',hold:'#64748b',lost:'#dc2626'}[status]||'#16a34a'}

function renderSchedule(){
  const y=S.calYear,m=S.calMonth;
  const first=new Date(y,m,1);
  const daysInMonth=new Date(y,m+1,0).getDate();
  const startDow=first.getDay();
  const monthName=first.toLocaleDateString(undefined,{month:'long',year:'numeric'});
  const today=dateKey(new Date());
  // Build map: dateKey -> [{job, dayIdx, totalDays}]
  const byDay={};
  jobs().forEach(j=>{
    const range=jobDateRange(j);
    range.forEach((k,i)=>{
      (byDay[k]=byDay[k]||[]).push({job:j,dayIdx:i,totalDays:range.length,firstDay:range[0],lastDay:range[range.length-1]});
    });
  });
  // Sort each day's chips so multi-day jobs come first and stay in stable order
  Object.values(byDay).forEach(arr=>arr.sort((a,b)=>{
    if(b.totalDays!==a.totalDays)return b.totalDays-a.totalDays;
    return a.job.name.localeCompare(b.job.name);
  }));

  const offByDay=timeOffByDay();
  const sel=S.calSelected||today;
  const isMonth=S.calMode!=='agenda';

  return `
    <div class="cal-head">
      <div class="cal-title">${isMonth?monthName:'Upcoming'}</div>
      <div class="cal-nav">
        <button id="cal-prev" aria-label="Previous"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg></button>
        <button id="cal-today" style="width:auto;padding:0 12px;font-size:12px;font-weight:600">Today</button>
        <button id="cal-next" aria-label="Next"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg></button>
      </div>
    </div>
    <div class="cal-view-toggle" role="tablist">
      <button class="${isMonth?'active':''}" data-cal-mode="month" role="tab" aria-selected="${isMonth}">Month</button>
      <button class="${!isMonth?'active':''}" data-cal-mode="agenda" role="tab" aria-selected="${!isMonth}">Agenda</button>
    </div>
    <div class="cal-legend">
      <div class="cal-legend-item"><div class="cal-legend-sw" style="background:#dcfce7;border-left:3px solid #16a34a"></div>Active</div>
      <div class="cal-legend-item"><div class="cal-legend-sw" style="background:var(--gold-light);border-left:3px solid #d97706"></div>Lead</div>
      <div class="cal-legend-item"><div class="cal-legend-sw" style="background:#e0f2fe;border-left:3px solid #0284c7"></div>Complete</div>
      <div class="cal-legend-item"><div class="cal-legend-sw" style="background:var(--surface-3);border-left:3px solid #64748b"></div>On Hold</div>
      <div class="cal-legend-item"><div class="cal-legend-sw" style="background:#fee2e2;border-left:3px solid #dc2626"></div>Lost</div>
      <div class="cal-legend-item"><div class="cal-legend-sw" style="background:#ede9fe;border-left:3px solid #8b5cf6"></div>Time off</div>
    </div>
    ${renderTimeOffPanel()}
    ${isMonth?renderCalMonth(y,m,daysInMonth,startDow,byDay,today,sel,offByDay):renderCalAgenda(byDay,today,offByDay)}
    ${isMonth?renderSelectedDay(byDay,sel,today,offByDay):''}
  `;
}

function renderCalMonth(y,m,daysInMonth,startDow,byDay,today,sel,offByDay){
  const MAX_CHIPS=3;
  let cells='';
  const DOW=['S','M','T','W','T','F','S'];
  DOW.forEach(d=>cells+=`<div class="cal-dow">${d}</div>`);
  // Leading days from previous month
  const prevDays=new Date(y,m,0).getDate();
  for(let i=startDow-1;i>=0;i--){
    const d=prevDays-i;
    const prevM=m===0?11:m-1;
    const prevY=m===0?y-1:y;
    const k=`${prevY}-${String(prevM+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cells+=renderCalCell(k,d,byDay,today,sel,true,MAX_CHIPS,offByDay);
  }
  // Current month
  for(let d=1;d<=daysInMonth;d++){
    const k=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cells+=renderCalCell(k,d,byDay,today,sel,false,MAX_CHIPS,offByDay);
  }
  // Trailing days to fill final week
  const filled=startDow+daysInMonth;
  const trailing=(7-filled%7)%7;
  for(let i=1;i<=trailing;i++){
    const nextM=m===11?0:m+1;
    const nextY=m===11?y+1:y;
    const k=`${nextY}-${String(nextM+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
    cells+=renderCalCell(k,i,byDay,today,sel,true,MAX_CHIPS,offByDay);
  }
  return `<div class="cal-grid">${cells}</div>`;
}

function renderCalCell(k,dayNum,byDay,today,sel,otherMonth,maxChips,offByDay){
  const list=byDay[k]||[];
  const offs=(offByDay&&offByDay[k])||[];
  const offChips=offs.map(o=>{
    const nm=(o.req.member||'?').split(' ')[0];
    return `<div class="cal-chip cal-chip-off" title="${esc(o.req.member)} — time off${o.half?(' · ½ '+String(o.half).toUpperCase()):''}">${o.half?'½ ':''}${esc(nm)}</div>`;
  }).join('');
  const isToday=k===today;
  const isSel=k===sel;
  const cls='cal-day'+(isToday?' today':'')+(isSel?' selected':'')+(otherMonth?' other-month':'');
  const visible=list.slice(0,maxChips);
  const overflow=list.length-visible.length;
  const chips=visible.map(({job,dayIdx,totalDays})=>{
    const contLeft=dayIdx>0;
    const contRight=dayIdx<totalDays-1;
    const isWeekStart=new Date(k+'T00:00:00').getDay()===0;
    const isWeekEnd=new Date(k+'T00:00:00').getDay()===6;
    let contCls='';
    if(contLeft&&contRight)contCls=isWeekStart?'continues-right':(isWeekEnd?'continues-left':'continues-both');
    else if(contLeft)contCls=isWeekStart?'':'continues-left';
    else if(contRight)contCls=isWeekEnd?'':'continues-right';
    // On wrap to a new week, restart the chip with a left border
    const label=(!contLeft||isWeekStart)?esc(job.name):'';
    return `<div class="cal-chip ${chipClass(job.status)} ${contCls}" data-open="${job.id}" title="${esc(job.name)} · ${spLabel(job.status)}${totalDays>1?' · day '+(dayIdx+1)+'/'+totalDays:''}">${label||'&nbsp;'}</div>`;
  }).join('');
  const more=overflow>0?`<div class="cal-day-more" data-cal-day="${k}">+${overflow} more</div>`:'';
  return `<div class="${cls}" data-cal-day="${k}"><div class="cal-day-num"><span>${dayNum}</span></div><div class="cal-day-chips">${offChips}${chips}${more}</div></div>`;
}

function renderSelectedDay(byDay,sel,today,offByDay){
  const selList=(byDay[sel]||[]).slice();
  // Sort by workflow status: open work first, closed outcomes last.
  const order={lead:0,active:1,hold:2,lost:3,complete:4};
  selList.sort((a,b)=>(order[a.job.status]??9)-(order[b.job.status]??9));
  const offs=(offByDay&&offByDay[sel])||[];
  const dt=new Date(sel+'T00:00:00');
  const lbl=dt.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});
  const isToday=sel===today;
  const offRows=offs.map(o=>`<div class="cal-job-row">
        <div class="cal-job-row-bar" style="background:#8b5cf6"></div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600">${esc(o.req.member)} — Time off${o.half?(' (½ '+String(o.half).toUpperCase()+')'):''}</div>
          <div class="cal-job-row-meta">${o.req.reason?esc(o.req.reason):'Approved time off'}</div>
        </div>
        <span class="status-pill sp-hold">OFF</span>
      </div>`).join('');
  return `<div class="cal-day-list">
    <div class="cal-day-list-hd"><span>${esc(lbl)}${isToday?' <span class="kpi-sub" style="color:var(--green-700);font-weight:700;margin-left:6px">Today</span>':''}</span><span class="kpi-sub">${selList.length} job${selList.length!==1?'s':''}${offs.length?' · '+offs.length+' off':''}</span></div>
    ${selList.length===0&&offs.length===0?'<p style="font-size:12.5px;color:var(--text-3);padding:4px 0">Nothing scheduled. Tap a date above with jobs to see what\'s on the books.</p>'
      :offRows+selList.map(({job,dayIdx,totalDays})=>`<div class="cal-job-row" data-open="${job.id}">
        <div class="cal-job-row-bar" style="background:${chipBarColor(job.status)}"></div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600">${esc(job.name)}${totalDays>1?` <span class="cal-job-row-day">Day ${dayIdx+1}/${totalDays}</span>`:''}</div>
          <div class="cal-job-row-meta">${esc(job.address||'No address')}${job.assigned?' · '+esc(job.assigned):''}${job.customerName?' · '+esc(job.customerName):''}</div>
        </div>
        <span class="status-pill ${spClass(job.status)}">${spLabel(job.status)}</span>
      </div>`).join('')}
  </div>`;
}

function renderCalAgenda(byDay,today,offByDay){
  // Show today plus next 3 weeks that have anything scheduled (jobs or time off)
  const days=[];
  const start=new Date(today+'T00:00:00');
  for(let i=0;i<21;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);
    const k=dateKey(d);
    const offs=(offByDay&&offByDay[k])||[];
    if((byDay[k]&&byDay[k].length)||offs.length){
      days.push({k,date:d,list:byDay[k]||[],offs});
    }
  }
  if(days.length===0){
    return `<div class="cal-day-list" style="text-align:center;padding:40px 24px">
      <p style="font-size:14px;color:var(--text-2);margin-bottom:6px">Nothing scheduled in the next 3 weeks.</p>
      <p style="font-size:12.5px;color:var(--text-3)">Add a start date (and optional due date) to a job to see it here.</p>
    </div>`;
  }
  return days.map(({k,date,list,offs})=>{
    const isToday=k===today;
    const lbl=date.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'});
    const order={lead:0,active:1,hold:2,lost:3,complete:4};
    const sorted=list.slice().sort((a,b)=>(order[a.job.status]??9)-(order[b.job.status]??9));
    const offRows=offs.map(o=>`<div class="cal-job-row">
        <div class="cal-job-row-bar" style="background:#8b5cf6"></div>
        <div style="flex:1;min-width:0"><div style="font-weight:600">${esc(o.req.member)} — Time off${o.half?(' (½ '+String(o.half).toUpperCase()+')'):''}</div><div class="cal-job-row-meta">${o.req.reason?esc(o.req.reason):'Approved time off'}</div></div>
        <span class="status-pill sp-hold">OFF</span>
      </div>`).join('');
    return `<div class="agenda-day">
      <div class="agenda-day-hd">${esc(lbl)} ${isToday?'<span class="today-pill">TODAY</span>':''}<span style="margin-left:auto;color:var(--text-3);font-weight:600">${sorted.length} job${sorted.length!==1?'s':''}${offs.length?' · '+offs.length+' off':''}</span></div>
      ${offRows}${sorted.map(({job,dayIdx,totalDays})=>`<div class="cal-job-row" data-open="${job.id}">
        <div class="cal-job-row-bar" style="background:${chipBarColor(job.status)}"></div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600">${esc(job.name)}${totalDays>1?` <span class="cal-job-row-day">Day ${dayIdx+1}/${totalDays}</span>`:''}</div>
          <div class="cal-job-row-meta">${esc(job.address||'No address')}${job.assigned?' · '+esc(job.assigned):''}</div>
        </div>
        <span class="status-pill ${spClass(job.status)}">${spLabel(job.status)}</span>
      </div>`).join('')}
    </div>`;
  }).join('');
}

// ── Time-off panel (request + owner review + your requests) ──
function timeOffRangeLabel(r){
  const s=fmtShort(r.startDate);
  const multi=r.endDate&&r.endDate!==r.startDate;
  const e=multi?' – '+fmtShort(r.endDate):'';
  const h=(!multi&&r.half)?(r.half==='am'?' · ½ AM':' · ½ PM'):'';
  return s+e+h;
}
function renderTimeOffPanel(){
  const canApprove=canApproveTimeOff();
  const meId=currentPersonId();
  const all=timeOffList();
  const pending=all.filter(r=>r.status==='pending').sort((a,b)=>(a.startDate||'').localeCompare(b.startDate||''));
  const mine=all.filter(r=>r.memberId===meId).sort((a,b)=>(b.requestedAt||0)-(a.requestedAt||0));
  const pill=st=>`<span class="status-pill ${st==='approved'?'sp-complete':st==='denied'?'sp-lost':'sp-lead'}">${esc(st)}</span>`;
  return `<div class="timeoff-panel">
    <div class="timeoff-hd"><span>Time Off</span><button class="btn-sm" id="btn-request-timeoff">+ Request time off</button></div>
    ${canApprove&&pending.length?`<div class="timeoff-sub">Pending approval (${pending.length})</div>
      ${pending.map(r=>`<div class="timeoff-row">
        <div style="flex:1;min-width:0"><div style="font-weight:600">${esc(r.member)}</div><div class="timeoff-meta">${esc(timeOffRangeLabel(r))}${r.reason?' · '+esc(r.reason):''}</div></div>
        <button class="btn-sm timeoff-approve" data-timeoff-approve="${esc(r.id)}">Approve</button>
        <button class="btn-sm timeoff-deny" data-timeoff-deny="${esc(r.id)}">Deny</button>
      </div>`).join('')}`:''}
    ${mine.length?`<div class="timeoff-sub">Your requests</div>
      ${mine.slice(0,6).map(r=>`<div class="timeoff-row">
        <div style="flex:1;min-width:0"><div style="font-weight:600">${esc(timeOffRangeLabel(r))}</div><div class="timeoff-meta">${r.reason?esc(r.reason)+' · ':''}${pill(r.status)}</div></div>
        ${r.status==='pending'?`<button class="btn-remove" data-timeoff-delete="${esc(r.id)}">Cancel</button>`:''}
      </div>`).join('')}`:''}
    ${!pending.length&&!mine.length?`<div class="timeoff-meta" style="padding:6px 0">No time-off requests yet. Use “Request time off” to add one.</div>`:''}
  </div>`;
}
function showTimeOffModal(){
  const today=dateKey(new Date());
  $('modal-root').innerHTML=`<div class="modal-bd" id="mbd" role="dialog" aria-modal="true" aria-label="Request time off"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Request Time Off</div><button class="modal-close" id="mc" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">From</label><input class="form-input" id="to-start" type="date" value="${today}"></div>
        <div class="form-group"><label class="form-label">To</label><input class="form-input" id="to-end" type="date" value="${today}"></div>
      </div>
      <div class="form-group"><label class="form-label">Length</label><select class="form-select" id="to-half"><option value="">Full day(s)</option><option value="am">Half day — morning (AM)</option><option value="pm">Half day — afternoon (PM)</option></select></div>
      <div class="form-group"><label class="form-label">Reason (optional)</label><input class="form-input" id="to-reason" placeholder="e.g. Vacation, appointment"></div>
      <div class="tt-hint">Half-day applies when From and To are the same day.${canApproveTimeOff()?' As an owner, your own request is approved automatically.':' Your request is sent to the owner for approval.'}</div>
    </div>
    <div class="modal-foot"><button class="btn-cancel" id="btn-cx">Cancel</button><button class="btn-save" id="to-save">Submit request</button></div>
  </div></div>`;
  $('mc').onclick=$('btn-cx').onclick=closeModal;
  $('mbd').onclick=e=>{if(e.target===e.currentTarget)closeModal()};
  $('to-save').onclick=submitTimeOff;
}
async function submitTimeOff(){
  const start=$('to-start').value,end=$('to-end').value||$('to-start').value;
  if(!start){toast('Pick a start date','');return}
  if(end<start){toast('End date is before the start date','');return}
  const owner=canApproveTimeOff();
  const now=Date.now();
  const r={id:timeOffId(),member:currentPersonName(),memberId:currentPersonId(),startDate:start,endDate:end,half:start===end?($('to-half').value||false):false,reason:$('to-reason').value.trim(),status:owner?'approved':'pending',requestedAt:now};
  if(owner){r.reviewedBy=currentPersonName();r.reviewedAt=now;}
  try{await writeTimeOff(r)}catch(e){}
  closeModal();render();
  toast(owner?'Time off added to the schedule':'Request sent to the owner for approval');
}
