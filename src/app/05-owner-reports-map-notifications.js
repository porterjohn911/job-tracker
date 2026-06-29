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

function renderReports(){
  const all=jobs();
  const range=parseInt(S.reportRange||'90',10);
  const cutoff=range>0?Date.now()-range*86400000:0;
  const inRange=all.filter(j=>(j.created||0)>=cutoff);
  // Win rate: complete vs (complete + lead-but-not-converted-and-not-on-hold-recently). Simpler: of jobs that left "lead" stage, how many became "complete"?
  const totalLeads=all.filter(j=>j.created>=cutoff).length;
  const won=all.filter(j=>j.status==='complete'&&(j.created||0)>=cutoff).length;
  const lost=all.filter(j=>j.status==='hold'&&(j.created||0)>=cutoff).length;
  const open=all.filter(j=>(j.status==='lead'||j.status==='active')&&(j.created||0)>=cutoff).length;
  const decided=won+lost;
  const winRate=decided>0?(won/decided)*100:0;
  const conversionRate=totalLeads>0?(won/totalLeads)*100:0;

  // Financial
  const totalValue=inRange.reduce((s,j)=>s+Number(j.value||0),0);
  const revenue=inRange.filter(j=>j.status==='complete').reduce((s,j)=>{const t=invoiceTotals(j);return s+(t?t.total:Number(j.invoiced||j.value||0))},0);
  const collected=inRange.reduce((s,j)=>{const t=invoiceTotals(j);return s+(t?t.paid:Number(j.paid||0))},0);
  const avgDeal=won>0?revenue/won:0;
  const pipeline=inRange.filter(j=>j.status!=='complete'&&j.status!=='hold').reduce((s,j)=>s+Number(j.value||0),0);

  // Monthly revenue chart — last 6 months
  const months=[];
  const now=new Date();
  for(let i=5;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    months.push({label:d.toLocaleDateString(undefined,{month:'short'}),key:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),val:0});
  }
  all.forEach(j=>{
    if(j.status!=='complete')return;
    const t=j.completedAt||j.created;
    if(!t)return;
    const d=new Date(t);
    const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    const m=months.find(x=>x.key===k);
    if(m)m.val+=Number(j.invoiced||j.value||0);
  });
  const maxMonth=Math.max(1,...months.map(m=>m.val));

  // Lead source ROI
  const bySource={};
  all.forEach(j=>{
    if((j.created||0)<cutoff)return;
    const s=j.leadSource||'Unknown';
    bySource[s]=bySource[s]||{total:0,won:0,value:0,revenue:0};
    bySource[s].total++;
    bySource[s].value+=Number(j.value||0);
    if(j.status==='complete'){bySource[s].won++;bySource[s].revenue+=Number(j.invoiced||j.value||0)}
  });
  const sources=Object.entries(bySource).sort((a,b)=>b[1].revenue-a[1].revenue);

  // Team leaderboard
  const byMember={};
  all.forEach(j=>{
    if((j.created||0)<cutoff)return;
    const m=j.assigned||'Unassigned';
    byMember[m]=byMember[m]||{name:m,jobs:0,won:0,revenue:0};
    byMember[m].jobs++;
    if(j.status==='complete'){byMember[m].won++;byMember[m].revenue+=Number(j.invoiced||j.value||0)}
  });
  const leaderboard=Object.values(byMember).sort((a,b)=>b.revenue-a.revenue).slice(0,8);

  // Donut chart for win rate
  const circumference=2*Math.PI*52;
  const donutDash=(winRate/100)*circumference;

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;font-weight:700">Performance</div>
        <div style="font-size:20px;font-weight:700;margin-top:2px">Reports</div>
      </div>
      <div class="filter-row" style="margin-bottom:0">
        ${[['30','30 days'],['90','90 days'],['365','1 year'],['0','All time']].map(([v,l])=>`<div class="filter-chip ${S.reportRange===v?'active':''}" data-range="${v}">${l}</div>`).join('')}
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card accent"><div class="kpi-label">Won Revenue</div><div class="kpi-value">${money(revenue)}</div><div class="kpi-sub">${won} job${won!==1?'s':''} completed</div></div>
      <div class="kpi-card"><div class="kpi-label">Pipeline Value</div><div class="kpi-value">${money(pipeline)}</div><div class="kpi-sub">${open} open</div></div>
      <div class="kpi-card"><div class="kpi-label">Avg Job Size</div><div class="kpi-value">${money(avgDeal)}</div><div class="kpi-sub">across won jobs</div></div>
      <div class="kpi-card"><div class="kpi-label">Collected</div><div class="kpi-value">${money(collected)}</div><div class="kpi-sub">${revenue>0?((collected/revenue)*100).toFixed(0):0}% of revenue</div></div>
    </div>

    <div class="report-section">
      <div class="report-hd">Win Rate <span class="kpi-sub">${won} won · ${lost} lost · ${open} open</span></div>
      <div class="donut-wrap">
        <div class="donut">
          <svg viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface-3)" stroke-width="14"/>
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--green-600)" stroke-width="14"
              stroke-dasharray="${donutDash} ${circumference}" stroke-linecap="round"/>
          </svg>
          <div class="donut-center"><div class="donut-pct">${winRate.toFixed(0)}%</div><div class="donut-lbl">Win Rate</div></div>
        </div>
        <div class="donut-legend">
          <div class="donut-leg-row"><div class="donut-leg-dot" style="background:var(--green-600)"></div>Won <strong style="margin-left:auto">${won}</strong></div>
          <div class="donut-leg-row"><div class="donut-leg-dot" style="background:#94a3b8"></div>Lost <strong style="margin-left:auto">${lost}</strong></div>
          <div class="donut-leg-row"><div class="donut-leg-dot" style="background:var(--gold)"></div>Open <strong style="margin-left:auto">${open}</strong></div>
          <div class="donut-leg-row" style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border)"><span style="color:var(--text-3);font-size:11px">Conversion</span><strong style="margin-left:auto">${conversionRate.toFixed(0)}%</strong></div>
        </div>
      </div>
    </div>

    <div class="report-section">
      <div class="report-hd">Monthly Revenue <span class="kpi-sub">Last 6 months</span></div>
      <div class="report-chart">
        ${months.map(m=>{
          const h=(m.val/maxMonth)*100;
          return `<div class="report-bar" style="height:${Math.max(2,h)}%" title="${money(m.val)}">
            <div class="report-bar-val">${m.val>0?'$'+(m.val>=1000?(m.val/1000).toFixed(0)+'k':m.val):''}</div>
            <div class="report-bar-label">${m.label}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="report-x-pad"></div>
    </div>

    <div class="report-section">
      <div class="report-hd">Lead Source ROI <span class="kpi-sub">${sources.length} source${sources.length!==1?'s':''}</span></div>
      ${sources.length===0?'<p style="font-size:13px;color:var(--text-3);padding:4px 0">Set the Lead Source on jobs to see where your best work comes from.</p>'
        :`<div style="display:flex;flex-direction:column;gap:8px">
          ${sources.map(([name,s])=>{
            const rate=s.total>0?(s.won/s.total)*100:0;
            return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:13.5px">${esc(name)}</div>
                <div style="font-size:11.5px;color:var(--text-3)">${s.total} lead${s.total!==1?'s':''} · ${s.won} won · ${rate.toFixed(0)}% conversion</div>
              </div>
              <div style="text-align:right">
                <div style="font-weight:700;font-size:14px">${money(s.revenue)}</div>
                <div style="font-size:11px;color:var(--text-3)">${money(s.value)} pipeline</div>
              </div>
            </div>`;
          }).join('')}
        </div>`}
    </div>

    <div class="report-section">
      <div class="report-hd">Team Leaderboard <span class="kpi-sub">By revenue</span></div>
      ${leaderboard.length===0?'<p style="font-size:13px;color:var(--text-3);padding:4px 0">Assign jobs to team members to see rankings.</p>'
        :`<div class="leaderboard">
          ${leaderboard.map((m,i)=>{
            const rankCls=i===0?'gold':i===1?'silver':i===2?'bronze':'';
            return `<div class="lb-row">
              <div class="lb-rank ${rankCls}">${i+1}</div>
              <div class="member-ava" style="width:30px;height:30px;font-size:12px">${initials(m.name)}</div>
              <div class="lb-name">${esc(m.name)}<div style="font-size:11px;color:var(--text-3);font-weight:500">${m.won}/${m.jobs} won</div></div>
              <div class="lb-stats"><strong>${money(m.revenue)}</strong><div>revenue</div></div>
            </div>`;
          }).join('')}
        </div>`}
    </div>
  `;
}

// ══ Map ══
function renderMap(){
  const all=jobs();
  const withCoords=all.filter(j=>j.lat&&j.lng);
  const needGeo=all.filter(j=>j.address&&(!j.lat||!j.lng));
  return `
    <div class="map-controls">
      <div class="map-stats">${withCoords.length} of ${all.filter(j=>j.address).length} jobs pinned</div>
      ${needGeo.length>0?`<button class="btn-sm" id="btn-geocode">Locate ${needGeo.length} address${needGeo.length!==1?'es':''}</button>`:''}
      <span class="geocode-status" id="geo-status" style="display:none"></span>
    </div>
    ${withCoords.length===0?`<div class="map-empty">
      <p style="margin-bottom:10px">No jobs pinned to the map yet.</p>
      <p style="font-size:12.5px">${needGeo.length>0?'Click "Locate" above to find addresses on the map.':'Add a job with an address to get started.'}</p>
    </div>`:''}
    <div class="map-wrap" id="map-wrap" style="${withCoords.length===0?'display:none':''}">
      <div id="leaflet-map"></div>
    </div>
  `;
}

function mountMap(){
  if(typeof L==='undefined'){
    setTimeout(mountMap,200);
    return;
  }
  const el=document.getElementById('leaflet-map');
  if(!el)return;
  if(MAP){MAP.remove();MAP=null;MAP_MARKERS=[]}
  const all=jobs().filter(j=>j.lat&&j.lng);
  if(all.length===0)return;
  MAP=L.map(el,{scrollWheelZoom:true});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,attribution:'© OpenStreetMap'
  }).addTo(MAP);
  const group=[];
  all.forEach(j=>{
    const color=j.status==='complete'?'#3ab5c8':j.status==='active'?'#4ade80':j.status==='hold'?'#94a3b8':'#e8a830';
    const icon=L.divIcon({
      className:'',
      html:`<div style="background:${color};width:24px;height:24px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center"><div style="transform:rotate(45deg);color:#fff;font-size:11px;font-weight:700">${initials(j.name)}</div></div>`,
      iconSize:[24,24],iconAnchor:[12,24]
    });
    const m=L.marker([j.lat,j.lng],{icon}).addTo(MAP);
    m.bindPopup(`<strong>${esc(j.name)}</strong>${esc(j.address||'')}<br><br>${j.customerName?esc(j.customerName)+'<br>':''}${j.customerPhone?'📞 '+esc(j.customerPhone)+'<br>':''}<a href="#" data-open-job="${j.id}">Open job →</a>`);
    m.on('popupopen',()=>{
      const lnk=document.querySelector('[data-open-job="'+j.id+'"]');
      if(lnk)lnk.onclick=e=>{e.preventDefault();S.detail=j.id;S.view='jobs';S.detailTab='overview';render()};
    });
    group.push([j.lat,j.lng]);
  });
  if(group.length===1){MAP.setView(group[0],13)}
  else{MAP.fitBounds(group,{padding:[40,40]})}
  setTimeout(()=>MAP&&MAP.invalidateSize(),100);
}

// Nominatim geocoder (rate limited 1/sec by their TOS)
async function geocodeOne(addr){
  try{
    const r=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(addr),{headers:{'Accept':'application/json'}});
    if(!r.ok)return null;
    const data=await r.json();
    if(data&&data.length>0)return{lat:parseFloat(data[0].lat),lng:parseFloat(data[0].lon)};
  }catch(e){}
  return null;
}
async function geocodeAll(){
  const queue=jobs().filter(j=>j.address&&(!j.lat||!j.lng));
  const status=$('geo-status');
  if(status)status.style.display='inline-block';
  for(let i=0;i<queue.length;i++){
    const j=queue[i];
    if(status)status.textContent=`Locating ${i+1} of ${queue.length}: ${j.name}…`;
    const coords=await geocodeOne(j.address);
    if(coords){j.lat=coords.lat;j.lng=coords.lng;await writeJob(j)}
    await new Promise(r=>setTimeout(r,1100));
  }
  if(status)status.textContent='Done.';
  toast('Locations updated');
  render();
}

// ══ Notifications ══
function buildNotifications(){
  const out=[];
  const me=(S.user||'').toLowerCase();
  const all=jobs();
  // Tasks due / overdue assigned to me (or unassigned that I created)
  all.forEach(j=>{
    (j.tasks||[]).forEach((t,i)=>{
      if(t.done||!t.due)return;
      const d=daysUntil(t.due);
      if(d===null)return;
      const owner=(t.assigned||'').toLowerCase();
      const mine=me&&(owner===me||owner==='');
      if(!mine)return;
      if(d<0)out.push({type:'overdue',time:new Date(t.due+'T00:00:00').getTime(),text:`Task overdue: <strong>${esc(t.text)}</strong>`,sub:esc(j.name)+' · '+Math.abs(d)+'d late',jobId:j.id});
      else if(d<=2)out.push({type:'task',time:new Date(t.due+'T00:00:00').getTime(),text:`Task due ${d===0?'today':d===1?'tomorrow':'in '+d+' days'}: <strong>${esc(t.text)}</strong>`,sub:esc(j.name),jobId:j.id});
    });
  });
  // Recent activity on jobs assigned to me
  S.activity.slice(0,40).forEach(a=>{
    const job=Object.values(S.jobs).find(j=>j.name===a.job);
    if(!job)return;
    const mine=me&&(job.assigned||'').toLowerCase()===me;
    if(mine&&a.user&&a.user.toLowerCase()!==me){
      out.push({type:'activity',time:a.time,text:`<strong>${esc(a.user)}</strong> ${esc(a.action)}`,sub:esc(a.job||''),jobId:job.id});
    }
  });
  // Recent notes that mention me by name (case-insensitive substring)
  if(me){
    all.forEach(j=>{
      (j.notes||[]).forEach(n=>{
        if(!n.text||!n.user)return;
        if(n.user.toLowerCase()===me)return;
        if(n.text.toLowerCase().includes('@'+me)||n.text.toLowerCase().includes(me)&&n.text.includes('@')){
          out.push({type:'mention',time:n.time,text:`<strong>${esc(n.user)}</strong> mentioned you`,sub:esc(j.name)+' · '+esc(n.text).slice(0,60),jobId:j.id});
        }
      });
    });
  }
  return out.sort((a,b)=>b.time-a.time).slice(0,30);
}
function unreadCount(){return buildNotifications().filter(n=>n.time>S.notifReadAt).length}
function updateBellBadge(){
  const b=$('bell-badge');if(!b)return;
  const n=unreadCount();
  b.textContent=n>9?'9+':n;
  b.style.display=n>0?'flex':'none';
}
function showNotificationsModal(){
  const notifs=buildNotifications();
  const ICONS={overdue:'!',task:'○',activity:'•',mention:'@'};
  const body=notifs.length===0
    ? `<div class="notif-empty">🔕<br><br>You're all caught up.<br><span style="font-size:12px">Tasks assigned to you, mentions, and activity on your jobs will appear here.</span></div>`
    : '<div class="notif-list">'+notifs.map(n=>`<div class="notif-item ${n.time>S.notifReadAt?'unread':''}" data-open="${n.jobId}">
        <div class="notif-icon ${n.type}">${ICONS[n.type]||'•'}</div>
        <div class="notif-body"><div class="notif-text">${n.text}</div><div class="notif-meta">${n.sub} · ${ago(n.time)}</div></div>
        ${n.time>S.notifReadAt?'<div class="notif-dot"></div>':''}
      </div>`).join('')+'</div>';
  $('modal-root').innerHTML=`<div class="modal-bd" id="mbd"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Notifications ${notifs.length?'<span style="font-weight:400;color:var(--text-3);font-size:13px">· '+notifs.length+'</span>':''}</div>
      <div style="display:flex;gap:4px;align-items:center">${notifs.length?'<button class="notif-clear" id="notif-mark">Mark all read</button>':''}<button class="modal-close" id="mc"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    </div>
    <div class="modal-body" style="padding:0 20px 20px">${body}</div>
  </div></div>`;
  $('mc').onclick=closeModal;
  $('mbd').onclick=e=>{if(e.target===e.currentTarget)closeModal()};
  $('notif-mark')?.addEventListener('click',()=>{
    S.notifReadAt=Date.now();
    localStorage.setItem(LS('notif_read'),String(S.notifReadAt));
    closeModal();render();toast('Marked all as read');
  });
  document.querySelectorAll('.notif-item[data-open]').forEach(el=>el.onclick=()=>{
    S.notifReadAt=Math.max(S.notifReadAt,Date.now());
    localStorage.setItem(LS('notif_read'),String(S.notifReadAt));
    S.detail=el.dataset.open;S.view='jobs';S.detailTab='overview';closeModal();render();
  });
}

function renderJobs(){
  const all=jobs();
  const cnt={all:all.length,lead:0,active:0,complete:0,hold:0};
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
function renderDetailTab(j,tab){
  const photos=j.photos||[];
  if(tab==='overview'){
    const desc=j.description?`<p style="font-size:13.5px;margin-top:10px;line-height:1.65;color:var(--text)">${esc(j.description)}</p>`:'';
    const due=daysUntil(j.dueDate);
    const dueBadge=j.dueDate?(due<0?`<span class="badge danger">${Math.abs(due)}d overdue</span>`:due===0?'<span class="badge">Due today</span>':due<=7?'<span class="badge">in '+due+'d</span>':''):'';
    const balance=jobBalance(j);
    return `
      <div class="section">
        <div class="section-hd">Details</div>
        <div class="info-grid">
          <div class="info-cell"><div class="info-label">Type</div><div class="info-value">${esc(j.type||'—')}</div></div>
          <div class="info-cell"><div class="info-label">Assigned to</div><div class="info-value">${esc(j.assigned||'—')}</div></div>
          <div class="info-cell"><div class="info-label">Start date</div><div class="info-value">${j.startDate?fmtDate(j.startDate):'—'}</div></div>
          <div class="info-cell"><div class="info-label">Due date</div><div class="info-value">${j.dueDate?fmtDate(j.dueDate):'—'} ${dueBadge}</div></div>
          <div class="info-cell"><div class="info-label">Stage</div><div class="info-value">${esc(jobStage(j))}</div></div>
          <div class="info-cell"><div class="info-label">Est. value</div><div class="info-value">${j.value?money(j.value):'—'}</div></div>
        </div>
        ${desc}
      </div>
      <div class="section">
        <div class="section-hd">Quick Stats <span style="font-weight:500;font-size:11px;color:var(--text-3);text-transform:none;letter-spacing:0">tap a stat to open · + to add</span></div>
        <div class="info-grid">
          ${statCell('Photos','photos',photos.length,true)}
          ${statCell('Open Tasks','tasks',(j.tasks||[]).filter(t=>!t.done).length,true)}
          ${statCell('Daily Log','log',(j.dailyLogs||[]).length,true)}
          ${statCell('Files','docs',(j.documents||[]).length,true)}
          ${statCell('Receipts','receipts',money2(receiptTotal(j)),true)}
          ${statCell('Invoices','invoices',(j.invoices||[]).length,true)}
          ${statCell('Estimates','estimates',(j.estimates||[]).length,true)}
          ${statCell('Comms','comms',(j.comms||[]).length,true)}
          ${statCell('Notes','notes',(j.notes||[]).length,true)}
          ${statCell('Balance Due','financial',money(balance),false,balance>0?'var(--orange)':'var(--green-700)')}
        </div>
      </div>`;
  }
  if(tab==='customer'){
    return `
      <div class="section">
        <div class="section-hd">Customer Information <button class="btn-sm" id="btn-edit-customer" style="padding:5px 10px;font-size:11px">Edit</button></div>
        <div class="info-grid">
          <div class="info-cell" style="grid-column:1/-1"><div class="info-label">Name</div><div class="info-value">${esc(j.customerName||'—')}</div></div>
          <div class="info-cell"><div class="info-label">Phone</div><div class="info-value">${j.customerPhone?`<a href="tel:${encodeURIComponent(j.customerPhone)}" style="color:var(--green-700);text-decoration:none">${esc(j.customerPhone)}</a>`:'—'}</div></div>
          <div class="info-cell"><div class="info-label">Email</div><div class="info-value" style="font-size:12px;word-break:break-all">${j.customerEmail?`<a href="mailto:${encodeURIComponent(j.customerEmail)}" style="color:var(--green-700);text-decoration:none">${esc(j.customerEmail)}</a>`:'—'}</div></div>
          <div class="info-cell" style="grid-column:1/-1"><div class="info-label">Job Site Address</div><div class="info-value" style="font-size:13px">${esc(j.address||'—')}</div></div>
          <div class="info-cell" style="grid-column:1/-1"><div class="info-label">Billing Address</div><div class="info-value" style="font-size:13px">${esc(j.billingAddress||j.address||'—')}</div></div>
          <div class="info-cell" style="grid-column:1/-1"><div class="info-label">Lead Source</div><div class="info-value">${esc(j.leadSource||'—')}</div></div>
        </div>
        ${j.customerNotes?`<div style="background:var(--surface-3);border-radius:var(--r-sm);padding:11px 13px;margin-top:10px"><div class="info-label">Customer Notes</div><p style="font-size:13px;margin-top:4px;line-height:1.55">${esc(j.customerNotes)}</p></div>`:''}
      </div>`;
  }
  if(tab==='tasks'){
    const tasks=j.tasks||[];
    const open=tasks.filter(t=>!t.done);
    const done=tasks.filter(t=>t.done);
    const render=(t,i)=>{
      const due=daysUntil(t.due);
      const overdue=due!==null&&due<0&&!t.done;
      const dueLbl=t.due?(overdue?'<span class="badge danger">'+Math.abs(due)+'d late</span>':' · '+fmtShort(t.due)):'';
      const assignMeta=t.assigned?' · '+esc(t.assigned):'';
      return `<div class="task-item ${t.done?'done':''}">
        <div class="task-check ${t.done?'checked':''}" data-task-toggle="${i}"></div>
        <div style="flex:1;min-width:0">
          <div class="task-text">${esc(t.text)}</div>
          ${(t.due||t.assigned)?`<div class="task-meta">${dueLbl}${assignMeta}</div>`:''}
        </div>
        <button class="task-del" data-task-del="${i}">✕</button>
      </div>`;
    };
    return `
      <div class="section">
        <div class="section-hd">Open Tasks <span>${open.length}</span></div>
        <div class="task-list">${open.length?tasks.map((t,i)=>!t.done?render(t,i):'').join(''):'<p style="font-size:13px;color:var(--text-3);padding:4px 0">No open tasks.</p>'}</div>
        <div class="task-add">
          <input class="form-input" id="task-in" placeholder="New task…" style="flex:1">
          <input class="form-input" id="task-due" type="date" style="max-width:140px" title="Due date">
          <button class="btn-post" id="btn-add-task">Add</button>
        </div>
      </div>
      ${done.length?`<div class="section">
        <div class="section-hd">Completed <span>${done.length}</span></div>
        <div class="task-list">${tasks.map((t,i)=>t.done?render(t,i):'').join('')}</div>
      </div>`:''}`;
  }
  if(tab==='log'){
    const logs=(j.dailyLogs||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    return `
      <div class="section">
        <div class="section-hd">Daily Log <span>${logs.length} entr${logs.length===1?'y':'ies'}</span></div>
        <div class="log-list">
          ${logs.length===0?'<p style="font-size:13px;color:var(--text-3);padding:4px 0">No log entries yet. Use the form below to record on-site work.</p>':logs.map(l=>`<div class="log-entry">
            <div class="log-date">${fmtDate(l.date)} ${l.weather?`<span class="log-weather">· ${esc(l.weather)}</span>`:''} ${l.user?`<span class="log-weather">· by ${esc(l.user)}</span>`:''}</div>
            <div class="log-text">${esc(l.text)}</div>
            ${l.hours?`<div class="log-hours">⏱ ${esc(l.hours)} hrs</div>`:''}
          </div>`).join('')}
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:12px 14px">
          <div class="form-row">
            <div class="form-group" style="margin-bottom:8px"><label class="form-label">Date</label><input class="form-input" type="date" id="log-date" value="${dateKey(new Date())}"></div>
            <div class="form-group" style="margin-bottom:8px"><label class="form-label">Hours</label><input class="form-input" type="number" step="0.5" id="log-hours" placeholder="0"></div>
          </div>
          <div class="form-group" style="margin-bottom:8px"><label class="form-label">Weather / Conditions</label><input class="form-input" id="log-weather" placeholder="Sunny 72°F, calm winds…"></div>
          <div class="form-group" style="margin-bottom:8px"><label class="form-label">Work Performed</label>
            <div class="textarea-with-mic"><textarea class="form-textarea" id="log-text" placeholder="Describe today’s work, crew on site, materials used, issues…"></textarea>${micButton('#log-text')}</div>
          </div>
          <button class="btn-post" id="btn-add-log">Add Log Entry</button>
        </div>
      </div>`;
  }
  if(tab==='photos'){
    const cat=S.photoCat||'all';
    const filtered=cat==='all'?photos:photos.filter(p=>(p.cat||'')===cat);
    const photosHtml=filtered.map((p,i)=>{
      const idx=photos.indexOf(p);
      const url=p.url||p;
      return `<div class="photo-wrap">
        ${p.cat?`<span class="photo-cat-label">${esc(p.cat)}</span>`:''}
        <img src="${url}" alt="" data-view-photo="${idx}" loading="lazy">
        <button class="photo-del" data-del-photo="${idx}">×</button>
      </div>`;
    }).join('');
    return `
      <div class="section">
        <div class="section-hd">Photos <span>${photos.length} total</span></div>
        <div class="photo-cat-tabs">
          ${PHOTO_CATS.map(c=>`<div class="photo-cat-chip ${cat===c?'active':''}" data-photo-cat="${c}">${c==='all'?'All':c.charAt(0).toUpperCase()+c.slice(1)} ${c==='all'?photos.length:photos.filter(p=>(p.cat||'')===c).length}</div>`).join('')}
        </div>
        <div class="photos-grid">
          ${photosHtml}
          <label class="photo-add-btn">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"/><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"/></svg>
            <span>Add Photos</span>
            <input type="file" accept="image/*" multiple id="photo-upload" style="display:none">
          </label>
        </div>
        <p style="font-size:11.5px;color:var(--text-3);margin-top:10px">Tip: Upload tags photos as “${cat==='all'?'before':cat}”. Switch tabs first to choose a category.</p>
      </div>`;
  }
  if(tab==='docs'){
    const docs=j.documents||[];
    const fileIcon=`<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>`;
    return `
      <div class="section">
        <div class="section-hd">Files & Documents <span>${docs.length}</span></div>
        <div class="doc-list">
          ${docs.length===0?'<p style="font-size:13px;color:var(--text-3);padding:4px 0">No files yet. Contracts, permits, plans, receipts — keep them all here.</p>'
            :docs.map((d,i)=>`<a class="doc-item" href="${d.url}" download="${esc(d.name)}" target="_blank">
              <div class="doc-icon">${fileIcon}</div>
              <div class="doc-info"><div class="doc-name">${esc(d.name)}</div><div class="doc-meta">${esc(d.size||'')}${d.uploaded?' · '+ago(d.uploaded):''}${d.user?' · '+esc(d.user):''}</div></div>
              <button class="doc-del" data-doc-del="${i}" onclick="event.preventDefault();event.stopPropagation()">✕</button>
            </a>`).join('')}
        </div>
        <label class="photo-add-btn" style="aspect-ratio:auto;padding:14px;flex-direction:row;gap:8px">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span>Upload File (PDF, DOC, IMG)</span>
          <input type="file" accept="*/*" id="doc-upload" style="display:none">
        </label>
      </div>`;
  }
  if(tab==='receipts'){
    const receipts=j.receipts||[];
    const total=receiptTotal(j);
    const fileIcon=`<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185zM9.75 9h.008v.008H9.75V9zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 4.5h.008v.008h-.008V13.5zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/></svg>`;
    const byCat={};receipts.forEach(r=>{const c=r.category||'Other';byCat[c]=(byCat[c]||0)+Number(r.amount||0)});
    return `
      <div class="section">
        <div class="section-hd">Receipts & Expenses <span>${receipts.length}</span></div>
        <div class="rcpt-total"><div><div class="info-label">Total Expenses</div><div class="rcpt-total-val">${money2(total)}</div></div>${receipts.length?`<div class="rcpt-total-sub">${receipts.length} receipt${receipts.length>1?'s':''}</div>`:''}</div>
        ${Object.keys(byCat).length?`<div class="rcpt-cats">${Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([c,v])=>`<span class="rcpt-cat-chip">${esc(c)} · ${money2(v)}</span>`).join('')}</div>`:''}
        <div class="doc-list">
          ${receipts.length===0?'<p style="font-size:13px;color:var(--text-3);padding:4px 0">No receipts yet. Snap a photo or upload a receipt and log the amount to keep all job expenses in one spot.</p>'
            :receipts.map((r,i)=>{
              const isImg=(r.type||'').startsWith('image/')||/^data:image\//.test(r.url||'');
              const thumb=isImg&&r.url?`<div class="doc-icon" style="overflow:hidden;padding:0"><img src="${r.url}" alt="" style="width:100%;height:100%;object-fit:cover"></div>`:`<div class="doc-icon">${fileIcon}</div>`;
              const meta=[r.vendor,r.category,r.date?fmtDate(r.date):'',r.user].filter(Boolean).join(' · ');
              const open=r.url?`href="${r.url}" download="${esc(r.name||'receipt')}" target="_blank"`:'';
              return `<a class="doc-item" ${open}>
                ${thumb}
                <div class="doc-info"><div class="doc-name">${esc(r.vendor||r.name||'Receipt')} <span class="rcpt-amt">${money2(r.amount||0)}</span></div><div class="doc-meta">${esc(meta)||(r.note?esc(r.note):(r.uploaded?ago(r.uploaded):''))}</div></div>
                <button class="doc-del" data-receipt-del="${i}" onclick="event.preventDefault();event.stopPropagation()">✕</button>
              </a>`;
            }).join('')}
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:12px 14px;margin-top:10px">
          <div class="form-row">
            <div class="form-group"><label class="form-label">Amount ($) *</label><input class="form-input" type="number" inputmode="decimal" min="0" step="0.01" id="rcpt-amount" placeholder="0.00"></div>
            <div class="form-group"><label class="form-label">Date</label><input class="form-input" type="date" id="rcpt-date" value="${dateKey(new Date())}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Vendor / Store</label><input class="form-input" id="rcpt-vendor" placeholder="e.g. Home Depot"></div>
            <div class="form-group"><label class="form-label">Category</label><select class="form-select" id="rcpt-cat">${RECEIPT_CATS.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></div>
          </div>
          <div class="form-group"><label class="form-label">Note (optional)</label><input class="form-input" id="rcpt-note" placeholder="What was purchased"></div>
          <label class="photo-add-btn" style="aspect-ratio:auto;padding:12px;flex-direction:row;gap:8px;margin-bottom:10px">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"/><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"/></svg>
            <span id="rcpt-file-label">Attach receipt photo or PDF (optional)</span>
            <input type="file" accept="image/*,application/pdf" id="rcpt-upload" style="display:none">
          </label>
          <button class="btn-post" id="btn-add-receipt">Add Receipt</button>
        </div>
      </div>`;
  }
  if(tab==='financial'){
    const est=Number(j.value||0);
    const lab=jobLaborStats(j.id);const anyRates=S.members.some(m=>rateOf(m)>0);
    const exp=receiptTotal(j);const rcptN=(j.receipts||[]).length;
    const invTot=invoiceTotals(j);
    const inv=invTot?invTot.total:Number(j.invoiced||0);
    const paid=invTot?invTot.paid:Number(j.paid||0);
    const bal=inv-paid;
    const pctPaid=inv>0?(paid/inv)*100:0;
    const margin=est-Number(j.costs||0);
    const lockedByInv=!!invTot;
    return `
      <div class="section">
        <div class="section-hd">Financial Summary${lockedByInv?' <span style="font-weight:400;text-transform:none;letter-spacing:0">From '+((j.invoices||[]).length)+' invoice'+((j.invoices||[]).length===1?'':'s')+'</span>':''}</div>
        <div class="fin-grid">
          <div class="fin-cell"><div class="fin-label">Estimate</div><div class="fin-value">${money(est)}</div></div>
          <div class="fin-cell"><div class="fin-label">Costs / Materials</div><div class="fin-value">${money(j.costs||0)}</div></div>
          <div class="fin-cell"><div class="fin-label">Invoiced</div><div class="fin-value">${money(inv)}</div></div>
          <div class="fin-cell"><div class="fin-label">Paid</div><div class="fin-value">${money(paid)}</div></div>
          <div class="fin-cell ${bal>0?'bal-neg':'bal-pos'}" style="grid-column:1/-1"><div class="fin-label">Balance Due</div><div class="fin-value">${money(bal)}</div>
            <div class="fin-bar"><div class="fin-bar-fill" style="width:${Math.min(100,pctPaid)}%"></div></div>
            <div style="font-size:11.5px;color:var(--text-3)">${pctPaid.toFixed(0)}% collected</div>
          </div>
          <div class="fin-cell" style="grid-column:1/-1"><div class="fin-label">Projected Margin</div><div class="fin-value" style="color:${margin>=0?'var(--green-700)':'var(--orange)'}">${money(margin)} <span style="font-size:12px;color:var(--text-3);font-weight:500">${est>0?'('+((margin/est)*100).toFixed(0)+'%)':''}</span></div></div>
          <div class="fin-cell" style="grid-column:1/-1"><div class="fin-label">Actual Labor (tracked)${lab.active?' · <span style="color:var(--green-700);text-transform:none;letter-spacing:0;font-weight:600">'+lab.active+' on the clock</span>':''}</div><div class="fin-value">${anyRates?money(lab.cost):'—'} <span style="font-size:12px;color:var(--text-3);font-weight:500">${fmtHM(lab.ms)}${anyRates?'':' · set rates on Team'}</span></div></div>
          <div class="fin-cell" style="grid-column:1/-1"><div class="fin-label">Receipt Expenses</div><div class="fin-value">${money2(exp)} <span style="font-size:12px;color:var(--text-3);font-weight:500">${rcptN?rcptN+' receipt'+(rcptN>1?'s':''):'none logged'}</span></div></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Estimate ($)</label><input class="form-input" type="number" id="fin-est" value="${esc(est||'')}"></div>
          <div class="form-group"><label class="form-label">Costs ($)</label><input class="form-input" type="number" id="fin-costs" value="${esc(j.costs||'')}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Invoiced ($)${lockedByInv?' <span style="color:var(--text-3);font-weight:400;text-transform:none;letter-spacing:0;font-size:10px">auto</span>':''}</label><input class="form-input" type="number" id="fin-inv" value="${esc(inv||'')}" ${lockedByInv?'disabled':''}></div>
          <div class="form-group"><label class="form-label">Paid ($)${lockedByInv?' <span style="color:var(--text-3);font-weight:400;text-transform:none;letter-spacing:0;font-size:10px">auto</span>':''}</label><input class="form-input" type="number" id="fin-paid" value="${esc(paid||'')}" ${lockedByInv?'disabled':''}></div>
        </div>
        <button class="btn-post" id="btn-save-fin" style="margin-top:6px" ${lockedByInv?'disabled':''}>Save Financials</button>
        ${lockedByInv?'<p style="font-size:11.5px;color:var(--text-3);margin-top:10px">Invoiced and Paid totals are computed from the Invoices tab. Edit individual invoices there.</p>':''}
      </div>`;
  }
  if(tab==='comms'){
    const comms=(j.comms||[]).slice().sort((a,b)=>(b.time||0)-(a.time||0));
    const icon={call:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"/></svg>',
      text:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-3.978c.26-.39.687-.634 1.153-.67 1.09-.086 2.17-.208 3.238-.365 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"/></svg>',
      email:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75"/></svg>',
      meeting:'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493"/></svg>'};
    return `
      <div class="section">
        <div class="section-hd">Communication Log <span>${comms.length}</span></div>
        <div class="comm-list">
          ${comms.length===0?'<p style="font-size:13px;color:var(--text-3);padding:4px 0">No communications logged. Track every call, text, and email with the customer.</p>'
            :comms.map(c=>`<div class="comm-item">
              <div class="comm-icon ${c.type}">${icon[c.type]||icon.call}</div>
              <div class="comm-body">
                <div class="comm-head"><div class="comm-type">${esc(c.type)} ${c.user?'· '+esc(c.user):''}</div><div class="comm-time">${ago(c.time)}</div></div>
                <div class="comm-text">${esc(c.text)}</div>
              </div>
            </div>`).join('')}
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:12px 14px">
          <div class="form-group" style="margin-bottom:8px"><label class="form-label">Type</label>
            <select class="form-select" id="comm-type">
              <option value="call">📞 Phone Call</option>
              <option value="text">💬 Text Message</option>
              <option value="email">📧 Email</option>
              <option value="meeting">👥 In-Person Meeting</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:8px"><label class="form-label">Summary</label>
            <div class="textarea-with-mic"><textarea class="form-textarea" id="comm-text" placeholder="What was discussed?"></textarea>${micButton('#comm-text')}</div>
          </div>
          <button class="btn-post" id="btn-add-comm">Log Communication</button>
        </div>
      </div>`;
  }
  if(tab==='invoices'){
    const invs=(j.invoices||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    const tot=invoiceTotals(j);
    return `
      <div class="section">
        <div class="section-hd" style="margin-bottom:12px">Invoices <span>${invs.length}</span></div>
        ${tot?`<div class="inv-totals" style="margin-bottom:14px">
          <div class="inv-total-row"><span>Total Invoiced</span><span class="v">${money(tot.total)}</span></div>
          <div class="inv-total-row"><span>Paid</span><span class="v">${money(tot.paid)}</span></div>
          <div class="inv-total-row grand"><span>Balance Due</span><span class="v">${money(tot.balance)}</span></div>
        </div>`:''}
        <div class="invoice-list">
          ${invs.length===0?'<p style="font-size:13px;color:var(--text-3);padding:4px 0">No invoices yet. Create your first one — it will use your company letterhead and pull from line items.</p>'
            :invs.map(inv=>{
              const c=calcInvoice(inv);
              const st=invoiceStatus(inv);
              return `<div class="invoice-row ${st}" data-inv-id="${esc(inv.id)}">
                <div class="invoice-row-main">
                  <div class="invoice-num">${esc(inv.number||'')} <span class="invoice-status ${st}">${st}</span></div>
                  <div class="invoice-meta">${fmtDate(inv.date)}${inv.dueDate?' · due '+fmtDate(inv.dueDate):''} · ${(inv.items||[]).length} item${(inv.items||[]).length!==1?'s':''}</div>
                </div>
                <div class="invoice-row-amt">
                  <div class="invoice-row-total">${money(c.total)}</div>
                  <div class="invoice-row-bal">${c.balance>0.005?money(c.balance)+' due':'Paid'}</div>
                </div>
              </div>`;
            }).join('')}
        </div>
        <button class="btn-post" id="btn-new-inv" style="margin-top:6px">+ New Invoice</button>
      </div>`;
  }
  if(tab==='estimates'){
    const ests=(j.estimates||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    return `
      <div class="section">
        <div class="section-hd" style="margin-bottom:12px">Estimates <span>${ests.length}</span></div>
        <div class="invoice-list">
          ${ests.length===0?'<p style="font-size:13px;color:var(--text-3);padding:4px 0">No estimates yet. Create one — it uses the same letterhead as your invoices and sends the same way.</p>'
            :ests.map(e=>{
              const c=calcInvoice(e);
              const st=e.status||'draft';
              return `<div class="invoice-row ${st}" data-est-id="${esc(e.id)}">
                <div class="invoice-row-main">
                  <div class="invoice-num">${esc(e.number||'')} <span class="invoice-status ${st}">${st}</span></div>
                  <div class="invoice-meta">${fmtDate(e.date)}${e.dueDate?' · valid until '+fmtDate(e.dueDate):''} · ${(e.items||[]).length} item${(e.items||[]).length!==1?'s':''}</div>
                </div>
                <div class="invoice-row-amt">
                  <div class="invoice-row-total">${money(c.total)}</div>
                  <div class="invoice-row-bal">estimate</div>
                </div>
              </div>`;
            }).join('')}
        </div>
        <button class="btn-post" id="btn-new-est" style="margin-top:6px">+ New Estimate</button>
      </div>`;
  }
  if(tab==='notes'){
    const notesHtml=(j.notes||[]).length===0?`<p style="font-size:13px;color:var(--text-3);padding:4px 0">No notes yet — be the first to add one.</p>`
      :(j.notes||[]).slice().reverse().map(n=>`<div class="note-card"><div class="note-meta"><div class="note-avatar">${initials(n.user)}</div>${esc(n.user)} · ${ago(n.time)}</div><div class="note-text">${esc(n.text)}</div></div>`).join('');
    return `
      <div class="section">
        <div class="section-hd">Internal Notes <span>${(j.notes||[]).length}</span></div>
        <div class="notes-list">${notesHtml}</div>
        <div class="note-compose">
          <input class="note-input" id="note-in" placeholder="${S.user?'Add a note…':'Set your name first…'}" ${!S.user?'disabled':''}>
          ${micButton('#note-in')}
          <button class="btn-post" id="btn-post" ${!S.user?'disabled':''}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/></svg>
            Post
          </button>
        </div>
      </div>`;
  }
  return '';
}

function renderActivity(){
  if(!S.activity.length)return`<div class="empty"><div class="empty-icon"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"/></svg></div><h3>No activity yet</h3><p>As your team adds and updates jobs, everything will appear here.</p></div>`;
  return'<div class="activity-feed">'+S.activity.map((a,i)=>'<div class="activity-item" style="animation-delay:'+( i*0.03)+'s">'+'<div class="activity-ava">'+initials(a.user)+'</div>'+'<div class="activity-body">'+'<div class="activity-text"><strong>'+esc(a.user)+'</strong> '+esc(a.action)+(a.job?' · <strong>'+esc(a.job)+'</strong>':'')+'</div><div class="activity-time">'+ago(a.time)+'</div></div></div>').join('')+'</div>';
}

