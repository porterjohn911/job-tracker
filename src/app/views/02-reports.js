// Reports view
// Generated from src/app/05-owner-reports-map-notifications.js lines 270-425.
function renderReports(){
  const all=jobs();
  const range=parseInt(S.reportRange||'90',10);
  const cutoff=range>0?Date.now()-range*86400000:0;
  const inRange=all.filter(j=>(j.created||0)>=cutoff);
  // Win rate: completed jobs vs explicitly lost jobs. On-hold work stays out of decided outcomes.
  const totalLeads=all.filter(j=>j.created>=cutoff).length;
  const won=all.filter(j=>j.status==='complete'&&(j.created||0)>=cutoff).length;
  const lost=all.filter(j=>j.status==='lost'&&(j.created||0)>=cutoff).length;
  const open=all.filter(j=>(j.status==='lead'||j.status==='active'||j.status==='hold')&&(j.created||0)>=cutoff).length;
  const decided=won+lost;
  const winRate=decided>0?(won/decided)*100:0;
  const conversionRate=totalLeads>0?(won/totalLeads)*100:0;

  // Financial
  const totalValue=inRange.reduce((s,j)=>s+Number(j.value||0),0);
  const revenue=inRange.filter(j=>j.status==='complete').reduce((s,j)=>{const t=invoiceTotals(j);return s+(t?t.total:Number(j.invoiced||j.value||0))},0);
  const collected=inRange.reduce((s,j)=>{const t=invoiceTotals(j);return s+(t?t.paid:Number(j.paid||0))},0);
  const avgDeal=won>0?revenue/won:0;
  const pipeline=inRange.filter(j=>!isClosedJob(j)).reduce((s,j)=>s+Number(j.value||0),0);

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

    ${typeof renderJobCosting==='function'?renderJobCosting():''}

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
