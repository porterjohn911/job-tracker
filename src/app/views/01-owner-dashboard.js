// Owner dashboard, cross-company metrics, and owner chrome
// Generated from src/app/05-owner-reports-map-notifications.js lines 1-269.
// Owner dashboards, reports, map, and notifications
// Generated from src/app.js lines 1640-2774.
// ══ Reports ══
// ══ Owner / Admin — cross-company dashboard ══
const ADMIN_COLORS={wfs:'#2a9070',mhs:'#e8a830',nlr:'#3ab5c8'};
function adminFirebaseReady(){return typeof firebase!=='undefined'&&firebase.apps&&firebase.apps.length}
function refreshOwnerData(){ownerLoadLocal();render();toast('Refreshed');}
function companyMetrics(arr){
  const m={total:arr.length,active:0,leads:0,complete:0,hold:0,value:0,pipeline:0,invoiced:0,collected:0,revenue:0,won:0,lost:0};
  arr.forEach(j=>{
    const st=j.status;
    // Invoiced/collected come from the job's actual invoices when present
    // (source of truth), falling back to the saved aggregate fields. This
    // keeps the owner rollup correct even if j.invoiced/j.paid weren't synced
    // — otherwise both Collected and Outstanding can read 0 (the same number).
    const t=invoiceTotals(j);
    const invd=t?t.total:Number(j.invoiced||0);
    const pd=t?t.paid:Number(j.paid||0);
    if(st==='active')m.active++;
    else if(st==='lead')m.leads++;
    else if(st==='complete'){m.complete++;m.won++;m.revenue+=invd||Number(j.value||0);}
    else if(st==='hold'){m.hold++;m.lost++;}
    m.value+=Number(j.value||0);
    if(st!=='complete'&&st!=='hold')m.pipeline+=Number(j.value||0);
    m.invoiced+=invd;
    m.collected+=pd;
  });
  m.outstanding=m.invoiced-m.collected;
  m.winRate=(m.won+m.lost)>0?(m.won/(m.won+m.lost))*100:0;
  m.avg=m.won>0?m.revenue/m.won:0;
  return m;
}
function adminCompareChart(title,rows,fmt){
  const max=Math.max(1,...rows.map(r=>r.val));
  return `<div class="report-section">
    <div class="report-hd">${esc(title)}</div>
    <div class="bar-chart">
      ${rows.map(r=>`<div class="bar-row">
        <div class="bar-row-label">${esc(r.label)}</div>
        <div class="bar-row-track"><div class="bar-row-fill" style="width:${(r.val/max*100).toFixed(1)}%;background:${r.color}"></div></div>
        <div class="bar-row-val" style="min-width:70px">${fmt(r.val)}</div>
      </div>`).join('')}
    </div>
  </div>`;
}
// ── stats + owner helpers ──
function pctStr(n,d){return d>0?((n/d)*100).toFixed(0)+'%':'—'}
function fmtMoneyShort(v){v=Number(v||0);if(Math.abs(v)>=1000)return '$'+(v/1000).toFixed(Math.abs(v)>=10000?0:1)+'k';return '$'+Math.round(v)}
const colorOf=co=>ADMIN_COLORS[co.id]||'var(--green-600)';
const coLbl=co=>co.id.toUpperCase();
function ownerList(){return Object.values(COMPANIES).map(co=>({co,jobs:ownerJobs(co.id),m:companyMetrics(ownerJobs(co.id))}))}
function ownerGrand(list){const g={};['total','active','leads','complete','hold','value','pipeline','invoiced','collected','revenue','won','lost'].forEach(k=>g[k]=list.reduce((s,x)=>s+x.m[k],0));g.outstanding=g.invoiced-g.collected;g.winRate=(g.won+g.lost)>0?g.won/(g.won+g.lost)*100:0;return g}
function monthlyRevenue(jobsArr){
  const months=[];const now=new Date();
  for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push({label:d.toLocaleDateString(undefined,{month:'short'}),key:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),val:0});}
  jobsArr.forEach(j=>{if(j.status!=='complete')return;const t=j.completedAt||j.created;if(!t)return;const d=new Date(t);const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');const m=months.find(x=>x.key===k);if(m)m.val+=Number(j.invoiced||j.value||0);});
  return months;
}
function reportChart(series){
  const max=Math.max(1,...series.map(m=>m.val));
  return `<div class="report-chart">${series.map(m=>`<div class="report-bar" style="height:${(m.val/max*100).toFixed(1)}%">${m.val?`<span class="report-bar-val">${fmtMoneyShort(m.val)}</span>`:''}<span class="report-bar-label">${esc(m.label)}</span></div>`).join('')}</div><div class="report-x-pad"></div>`;
}
function ownerTitle(sub){
  return `<div style="margin-bottom:14px">
    <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;font-weight:700">Owner · All Companies</div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <div style="font-size:20px;font-weight:700;margin-top:2px">${esc(sub)}</div>
      <button class="btn-mini" id="owner-refresh">${adminFirebaseReady()?'↻ Refresh':'Reload local'}</button>
    </div>
  </div>`;
}
function renderOwner(c){
  if(!String(S.view||'').startsWith('o_'))S.view='o_overview';
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===S.view));
  const v=S.view;
  c.innerHTML = v==='o_financials'?ownerFinancials()
    : v==='o_pipeline'?ownerPipeline()
    : v==='o_leads'?ownerLeads()
    : v==='o_companies'?ownerCompanies()
    : v==='o_hours'?ownerHours()
    : ownerOverview();
  updateUserUI();
  attachHandlers();
}
function ownerOverview(){
  const list=ownerList(),g=ownerGrand(list);
  const top=[...list].sort((a,b)=>b.m.collected-a.m.collected)[0];
  const watch=[...list].sort((a,b)=>b.m.outstanding-a.m.outstanding)[0];
  const allJobs=list.flatMap(x=>x.jobs);
  const tableRows=list.map(x=>`<tr>
    <td style="font-weight:700"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${colorOf(x.co)};margin-right:7px;vertical-align:middle"></span>${esc(x.co.label)}</td>
    <td class="num">${x.m.total}</td><td class="num">${x.m.active}</td><td class="num">${x.m.leads}</td><td class="num">${x.m.complete}</td>
    <td class="num">${money(x.m.pipeline)}</td><td class="num">${money(x.m.collected)}</td><td class="num">${money(x.m.outstanding)}</td><td class="num">${x.m.winRate.toFixed(0)}%</td>
  </tr>`).join('');
  return `
    ${ownerTitle('Overview')}
    <div class="kpi-grid">
      <div class="kpi-card accent"><div class="kpi-label">Total Collected</div><div class="kpi-value">${money(g.collected)}</div><div class="kpi-sub">across ${list.length} companies</div></div>
      <div class="kpi-card"><div class="kpi-label">Outstanding</div><div class="kpi-value">${money(g.outstanding)}</div><div class="kpi-sub">${money(g.invoiced)} invoiced</div></div>
      <div class="kpi-card"><div class="kpi-label">Pipeline</div><div class="kpi-value">${money(g.pipeline)}</div><div class="kpi-sub">${g.active} active jobs</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Jobs</div><div class="kpi-value">${g.total}</div><div class="kpi-sub">${g.leads} leads · ${g.complete} done</div></div>
    </div>
    <div class="report-section" style="display:flex;gap:14px;flex-wrap:wrap">
      <div style="flex:1;min-width:150px"><div class="kpi-label">Top performer</div><div style="font-size:16px;font-weight:800;color:${colorOf(top.co)};margin-top:3px">${esc(top.co.label)}</div><div class="kpi-sub">${money(top.m.collected)} collected</div></div>
      <div style="flex:1;min-width:150px"><div class="kpi-label">Most outstanding</div><div style="font-size:16px;font-weight:800;color:${colorOf(watch.co)};margin-top:3px">${esc(watch.co.label)}</div><div class="kpi-sub">${money(watch.m.outstanding)} unpaid</div></div>
    </div>
    ${adminCompareChart('Revenue share — collected',list.map(x=>({label:coLbl(x.co),val:x.m.collected,color:colorOf(x.co)})),money)}
    <div class="report-section"><div class="report-hd">Monthly revenue · all companies <span class="kpi-sub">last 6 months</span></div>${reportChart(monthlyRevenue(allJobs))}</div>
    ${adminCompareChart('Outstanding balance',list.map(x=>({label:coLbl(x.co),val:x.m.outstanding,color:colorOf(x.co)})),money)}
    ${adminCompareChart('Pipeline value',list.map(x=>({label:coLbl(x.co),val:x.m.pipeline,color:colorOf(x.co)})),money)}
    <div class="report-section">
      <div class="report-hd">Side-by-side</div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table class="admin-table">
        <thead><tr><th>Company</th><th class="num">Jobs</th><th class="num">Active</th><th class="num">Leads</th><th class="num">Done</th><th class="num">Pipeline</th><th class="num">Collected</th><th class="num">Outstanding</th><th class="num">Win%</th></tr></thead>
        <tbody>${tableRows}
          <tr class="total-row"><td>All companies</td><td class="num">${g.total}</td><td class="num">${g.active}</td><td class="num">${g.leads}</td><td class="num">${g.complete}</td><td class="num">${money(g.pipeline)}</td><td class="num">${money(g.collected)}</td><td class="num">${money(g.outstanding)}</td><td class="num">${g.winRate.toFixed(0)}%</td></tr>
        </tbody></table></div>
    </div>
  `;
}
function ownerFinancials(){
  const list=ownerList(),g=ownerGrand(list);
  const allJobs=list.flatMap(x=>x.jobs);
  const collRate=pctStr(g.collected,g.invoiced);
  const rows=list.map(x=>{const m=x.m;return `<tr>
    <td style="font-weight:700"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${colorOf(x.co)};margin-right:7px;vertical-align:middle"></span>${esc(x.co.label)}</td>
    <td class="num">${money(m.revenue)}</td><td class="num">${money(m.invoiced)}</td><td class="num">${money(m.collected)}</td><td class="num">${money(m.outstanding)}</td><td class="num">${pctStr(m.collected,m.invoiced)}</td><td class="num">${money(m.avg)}</td>
  </tr>`}).join('');
  return `
    ${ownerTitle('Financials')}
    <div class="kpi-grid">
      <div class="kpi-card accent"><div class="kpi-label">Collected</div><div class="kpi-value">${money(g.collected)}</div><div class="kpi-sub">${collRate} of invoiced</div></div>
      <div class="kpi-card"><div class="kpi-label">Invoiced</div><div class="kpi-value">${money(g.invoiced)}</div><div class="kpi-sub">${money(g.revenue)} won revenue</div></div>
      <div class="kpi-card"><div class="kpi-label">Outstanding (A/R)</div><div class="kpi-value">${money(g.outstanding)}</div><div class="kpi-sub">to be collected</div></div>
      <div class="kpi-card"><div class="kpi-label">Avg job size</div><div class="kpi-value">${money(g.won>0?g.revenue/g.won:0)}</div><div class="kpi-sub">across ${g.won} won</div></div>
    </div>
    <div class="report-section"><div class="report-hd">Monthly revenue · all companies <span class="kpi-sub">last 6 months</span></div>${reportChart(monthlyRevenue(allJobs))}</div>
    ${adminCompareChart('Collected by company',list.map(x=>({label:coLbl(x.co),val:x.m.collected,color:colorOf(x.co)})),money)}
    ${adminCompareChart('Outstanding by company',list.map(x=>({label:coLbl(x.co),val:x.m.outstanding,color:colorOf(x.co)})),money)}
    <div class="report-section">
      <div class="report-hd">Financial breakdown</div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table class="admin-table">
        <thead><tr><th>Company</th><th class="num">Revenue</th><th class="num">Invoiced</th><th class="num">Collected</th><th class="num">Outstanding</th><th class="num">Collect%</th><th class="num">Avg job</th></tr></thead>
        <tbody>${rows}
          <tr class="total-row"><td>All companies</td><td class="num">${money(g.revenue)}</td><td class="num">${money(g.invoiced)}</td><td class="num">${money(g.collected)}</td><td class="num">${money(g.outstanding)}</td><td class="num">${collRate}</td><td class="num">${money(g.won>0?g.revenue/g.won:0)}</td></tr>
        </tbody></table></div>
    </div>
  `;
}
function ownerHours(){
  const cos=Object.values(COMPANIES);
  const rows=cos.map(co=>{
    const entries=(S.ownerTime&&S.ownerTime[co.id])||[];
    const rates=(S.ownerRates&&S.ownerRates[co.id])||{};
    let ms=0,cost=0,active=0;
    entries.forEach(t=>{const d=Math.max(0,(t.end||Date.now())-t.start);ms+=d;cost+=(d/3600000)*Number(rates[t.member]||0);if(!t.end)active++});
    return {co,ms,cost,active,count:entries.length};
  });
  const gMs=rows.reduce((s,r)=>s+r.ms,0),gCost=rows.reduce((s,r)=>s+r.cost,0),gActive=rows.reduce((s,r)=>s+r.active,0),gCount=rows.reduce((s,r)=>s+r.count,0);
  const anyRates=rows.some(r=>r.cost>0);
  const maxMs=Math.max(1,...rows.map(r=>r.ms));
  const cards=rows.map(r=>`
    <div class="report-section">
      <div class="report-hd" style="align-items:center"><span style="display:flex;align-items:center;gap:8px"><span style="width:11px;height:11px;border-radius:3px;background:${colorOf(r.co)}"></span>${esc(r.co.label)}</span>${r.active?`<span class="tt-live">● ${r.active} on the clock</span>`:''}</div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:4px"><div style="font-size:22px;font-weight:700;font-family:var(--font-display)">${fmtHM(r.ms)}</div><div style="font-size:15px;font-weight:700;color:var(--green-700)">${anyRates?money(r.cost):'—'}</div></div>
      <div class="bar-row-track" style="margin-top:8px"><div class="bar-row-fill" style="width:${(r.ms/maxMs*100).toFixed(1)}%;background:${colorOf(r.co)}"></div></div>
    </div>`).join('');
  const tableRows=rows.map(r=>`<tr><td style="font-weight:700"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${colorOf(r.co)};margin-right:7px;vertical-align:middle"></span>${esc(r.co.label)}</td><td class="num">${fmtHM(r.ms)}</td><td class="num">${r.active}</td><td class="num">${anyRates?money(r.cost):'—'}</td></tr>`).join('');
  return `
    ${ownerTitle('Labor Hours')}
    <div class="kpi-grid">
      <div class="kpi-card accent"><div class="kpi-label">Total hours</div><div class="kpi-value">${fmtHM(gMs)}</div><div class="kpi-sub">across ${rows.length} companies</div></div>
      <div class="kpi-card"><div class="kpi-label">Labor cost</div><div class="kpi-value">${anyRates?money(gCost):'—'}</div><div class="kpi-sub">${anyRates?'from tracked time':'set rates per company'}</div></div>
      <div class="kpi-card"><div class="kpi-label">On the clock</div><div class="kpi-value">${gActive}</div><div class="kpi-sub">right now</div></div>
      <div class="kpi-card"><div class="kpi-label">Sessions</div><div class="kpi-value">${gCount}</div><div class="kpi-sub">total time entries</div></div>
    </div>
    ${cards}
    <div class="report-section">
      <div class="report-hd">Hours by company</div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table class="admin-table">
        <thead><tr><th>Company</th><th class="num">Hours</th><th class="num">On clock</th><th class="num">Labor $</th></tr></thead>
        <tbody>${tableRows}
          <tr class="total-row"><td>All companies</td><td class="num">${fmtHM(gMs)}</td><td class="num">${gActive}</td><td class="num">${anyRates?money(gCost):'—'}</td></tr>
        </tbody></table></div>
    </div>
  `;
}
function ownerPipeline(){
  const list=ownerList(),g=ownerGrand(list);
  const leadsN=g.leads,activeN=g.active,completeN=g.complete;
  const funnelMax=Math.max(1,leadsN,activeN,completeN);
  const funnel=[['Leads',leadsN,'#3ab5c8'],['Active',activeN,'#e8a830'],['Complete',completeN,'#2a9070']];
  const conv=pctStr(completeN,leadsN+activeN+completeN);
  const rows=list.map(x=>{const m=x.m;return `<tr>
    <td style="font-weight:700"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${colorOf(x.co)};margin-right:7px;vertical-align:middle"></span>${esc(x.co.label)}</td>
    <td class="num">${money(m.pipeline)}</td><td class="num">${m.leads}</td><td class="num">${m.active}</td><td class="num">${m.complete}</td><td class="num">${m.winRate.toFixed(0)}%</td>
  </tr>`}).join('');
  return `
    ${ownerTitle('Pipeline')}
    <div class="kpi-grid">
      <div class="kpi-card accent"><div class="kpi-label">Open pipeline</div><div class="kpi-value">${money(g.pipeline)}</div><div class="kpi-sub">${g.active+g.leads} open jobs</div></div>
      <div class="kpi-card"><div class="kpi-label">Win rate</div><div class="kpi-value">${g.winRate.toFixed(0)}%</div><div class="kpi-sub">${g.won} won · ${g.lost} lost</div></div>
      <div class="kpi-card"><div class="kpi-label">Conversion</div><div class="kpi-value">${conv}</div><div class="kpi-sub">to completed</div></div>
      <div class="kpi-card"><div class="kpi-label">Active jobs</div><div class="kpi-value">${g.active}</div><div class="kpi-sub">${g.leads} leads waiting</div></div>
    </div>
    <div class="report-section">
      <div class="report-hd">Funnel · all companies</div>
      <div class="bar-chart">${funnel.map(([lab,val,col])=>`<div class="bar-row"><div class="bar-row-label" style="flex-basis:80px">${lab}</div><div class="bar-row-track"><div class="bar-row-fill" style="width:${(val/funnelMax*100).toFixed(1)}%;background:${col}"></div></div><div class="bar-row-val">${val}</div></div>`).join('')}</div>
    </div>
    ${adminCompareChart('Pipeline value by company',list.map(x=>({label:coLbl(x.co),val:x.m.pipeline,color:colorOf(x.co)})),money)}
    ${adminCompareChart('Active jobs by company',list.map(x=>({label:coLbl(x.co),val:x.m.active,color:colorOf(x.co)})),v=>String(v))}
    <div class="report-section">
      <div class="report-hd">Pipeline breakdown</div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table class="admin-table">
        <thead><tr><th>Company</th><th class="num">Pipeline</th><th class="num">Leads</th><th class="num">Active</th><th class="num">Done</th><th class="num">Win%</th></tr></thead>
        <tbody>${rows}
          <tr class="total-row"><td>All companies</td><td class="num">${money(g.pipeline)}</td><td class="num">${g.leads}</td><td class="num">${g.active}</td><td class="num">${g.complete}</td><td class="num">${g.winRate.toFixed(0)}%</td></tr>
        </tbody></table></div>
    </div>
  `;
}
function ownerLeads(){
  const list=ownerList();
  const allJobs=list.flatMap(x=>x.jobs);
  const bySrc={};
  allJobs.forEach(j=>{const s=j.leadSource||'Unknown';bySrc[s]=bySrc[s]||{src:s,total:0,won:0,revenue:0};bySrc[s].total++;if(j.status==='complete'){bySrc[s].won++;bySrc[s].revenue+=Number(j.invoiced||j.value||0)}});
  const srcs=Object.values(bySrc).sort((a,b)=>b.revenue-a.revenue);
  const best=srcs.find(s=>s.revenue>0)||srcs[0];
  const maxRev=Math.max(1,...srcs.map(s=>s.revenue));
  const rows=srcs.map(s=>`<tr><td style="font-weight:600">${esc(s.src)}</td><td class="num">${s.total}</td><td class="num">${s.won}</td><td class="num">${pctStr(s.won,s.total)}</td><td class="num">${money(s.revenue)}</td></tr>`).join('');
  return `
    ${ownerTitle('Leads & sources')}
    ${best?`<div class="report-section"><div class="kpi-label">Best lead source</div><div style="font-size:17px;font-weight:800;color:var(--green-700);margin-top:3px">${esc(best.src)}</div><div class="kpi-sub">${money(best.revenue)} won revenue · ${pctStr(best.won,best.total)} conversion</div></div>`:''}
    <div class="report-section">
      <div class="report-hd">Revenue by lead source <span class="kpi-sub">all companies</span></div>
      <div class="bar-chart">${srcs.slice(0,8).map(s=>`<div class="bar-row"><div class="bar-row-label" style="flex-basis:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.src)}</div><div class="bar-row-track"><div class="bar-row-fill" style="width:${(s.revenue/maxRev*100).toFixed(1)}%;background:var(--green-600)"></div></div><div class="bar-row-val" style="min-width:64px">${money(s.revenue)}</div></div>`).join('')||'<div class="kpi-sub">No lead-source data yet.</div>'}</div>
    </div>
    <div class="report-section">
      <div class="report-hd">Lead source detail</div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table class="admin-table">
        <thead><tr><th>Source</th><th class="num">Total</th><th class="num">Won</th><th class="num">Conv%</th><th class="num">Revenue</th></tr></thead>
        <tbody>${rows||'<tr><td colspan="5" style="text-align:center;color:var(--text-3)">No data</td></tr>'}</tbody>
      </table></div>
    </div>
  `;
}
function ownerCompanies(){
  const list=ownerList();
  const cards=list.map(x=>{const m=x.m,co=x.co;return `<div class="report-section">
    <div class="report-hd" style="align-items:center"><span style="display:flex;align-items:center;gap:8px"><span style="width:11px;height:11px;border-radius:3px;background:${colorOf(co)}"></span>${esc(co.label)}</span><button class="btn-mini" data-view-company="${esc(co.id)}">Open →</button></div>
    <div class="kpi-grid" style="margin-bottom:0">
      <div class="kpi-card"><div class="kpi-label">Collected</div><div class="kpi-value">${money(m.collected)}</div><div class="kpi-sub">${money(m.outstanding)} outstanding</div></div>
      <div class="kpi-card"><div class="kpi-label">Pipeline</div><div class="kpi-value">${money(m.pipeline)}</div><div class="kpi-sub">${m.active} active · ${m.leads} lead${m.leads!==1?'s':''}</div></div>
      <div class="kpi-card"><div class="kpi-label">Jobs</div><div class="kpi-value">${m.total}</div><div class="kpi-sub">${m.complete} complete</div></div>
      <div class="kpi-card"><div class="kpi-label">Win rate</div><div class="kpi-value">${m.winRate.toFixed(0)}%</div><div class="kpi-sub">avg ${money(m.avg)}</div></div>
    </div></div>`}).join('');
  return `${ownerTitle('Companies')}<div class="kpi-sub" style="margin:-6px 0 12px">Open any company to manage it in its own workspace.</div>${cards}<div class="report-x-pad"></div>`;
}
function applyOwnerChrome(){
  if(!OWNER_MODE)return;
  const bco=$('brand-co');if(bco)bco.textContent='All Companies';
  const h1=document.querySelector('.brand-text h1');if(h1)h1.textContent='Owner';
  const img=document.querySelector('.brand-logo');if(img){img.src='data:image/svg+xml;utf8,'+encodeURIComponent(OWNER_LOGO);img.alt='Owner';}
  let s=document.getElementById('co-theme');if(!s){s=document.createElement('style');s.id='co-theme';document.head.appendChild(s);}
  s.textContent='.header{background:linear-gradient(135deg,#1e1b2e 0%,#2b2440 60%,#3a2f55 100%)}.sync-bar{background:#1e1b2e}.nav-btn.active{color:#a99ce0;border-bottom-color:#a99ce0}';
  const nav=document.querySelector('.nav');if(nav)nav.innerHTML=OWNER_NAV;
  const fab=$('fab');if(fab)fab.style.display='none';
}

