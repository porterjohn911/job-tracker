// Job Costing / Profit-per-Job — an additive Reports section.
//
// Purely additive: this file only READS existing data (invoices, receipts,
// tracked time + pay rates, and the manual Costs field on a job) and returns a
// new report section. It changes no existing behavior. renderReports() includes
// it via a single `${renderJobCosting()}` call.
//
// Cost model (all sources labeled so the number is transparent):
//   Labor    = tracked, completed time entries for the job × each member's rate
//   Materials= sum of the job's receipts
//   Other    = the job's manual "Costs" field (financials tab)
//   Revenue  = invoice total if invoiced, else the job's invoiced/estimate value

// Labor cost per jobId, computed in one pass over time entries.
function jobLaborCosts(){
  const out={};
  const entries=(typeof timeList==='function')?timeList():Object.values((typeof S!=='undefined'&&S.timeEntries)||{});
  entries.forEach(t=>{
    if(!t||!t.jobId||!t.end||!t.start)return;
    const hours=(t.end-t.start)/3600000;
    if(!(hours>0))return;
    const rate=(typeof rateOf==='function')?rateOf(t.member):Number(((S.payRates||{})[t.member])||0);
    out[t.jobId]=(out[t.jobId]||0)+hours*rate;
  });
  return out;
}

// Compute the cost/profit breakdown for a single job.
function jobCosting(j,laborMap){
  const t=(typeof invoiceTotals==='function')?invoiceTotals(j):null;
  const revenue=t?t.total:(Number(j.invoiced)||Number(j.value)||0);
  const labor=(laborMap&&laborMap[j.id])||0;
  const materials=(typeof receiptTotal==='function')?receiptTotal(j):0;
  const other=Number(j.costs||0);
  const cost=labor+materials+other;
  const profit=revenue-cost;
  const margin=revenue>0?(profit/revenue)*100:null;
  return {revenue,labor,materials,other,cost,profit,margin};
}

function renderJobCosting(){
  const all=(typeof jobs==='function')?jobs():[];
  const range=parseInt((typeof S!=='undefined'&&S.reportRange)||'90',10);
  const cutoff=range>0?Date.now()-range*86400000:0;
  const laborMap=jobLaborCosts();
  const rows=all
    .filter(j=>(j.created||0)>=cutoff)
    .map(j=>({job:j,c:jobCosting(j,laborMap)}))
    .filter(r=>r.c.revenue>0||r.c.cost>0)
    .sort((a,b)=>b.c.profit-a.c.profit);

  const totalRevenue=rows.reduce((s,r)=>s+r.c.revenue,0);
  const totalCost=rows.reduce((s,r)=>s+r.c.cost,0);
  const totalProfit=totalRevenue-totalCost;
  const avgMargin=totalRevenue>0?(totalProfit/totalRevenue)*100:null;
  const profitColor=v=>v>0?'var(--green-700)':(v<0?'var(--red)':'var(--text)');

  const list=rows.length?rows.map(({job:j,c})=>{
    const parts=[];
    if(c.labor>0)parts.push('labor '+money2(c.labor));
    if(c.materials>0)parts.push('materials '+money2(c.materials));
    if(c.other>0)parts.push('other '+money2(c.other));
    const breakdown=parts.length?parts.join(' · '):'no costs recorded';
    return `<div data-open="${esc(j.id)}" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(j.name||'Untitled job')} <span class="status-pill ${spClass(j.status)}" style="font-size:9.5px;vertical-align:middle">${spLabel(j.status)}</span></div>
        <div style="font-size:11px;color:var(--text-3)">Rev ${money2(c.revenue)} − Cost ${money2(c.cost)} <span style="opacity:.8">(${breakdown})</span></div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-weight:700;font-size:14px;color:${profitColor(c.profit)}">${c.profit<0?'−':''}${money2(Math.abs(c.profit))}</div>
        <div style="font-size:11px;color:var(--text-3)">${c.margin===null?'—':(c.margin<0?'−':'')+Math.abs(c.margin).toFixed(0)+'% margin'}</div>
      </div>
    </div>`;
  }).join(''):'<p style="font-size:13px;color:var(--text-3);padding:6px 0">No job revenue or costs recorded in this range yet. Add invoices, receipts, tracked time, or a Costs figure to a job to see profitability.</p>';

  return `
    <div class="report-section">
      <div class="report-hd">Job Profitability <span class="kpi-sub">${rows.length} job${rows.length!==1?'s':''} with revenue or costs</span></div>
      <div class="kpi-grid" style="margin-bottom:12px">
        <div class="kpi-card"><div class="kpi-label">Revenue</div><div class="kpi-value">${money2(totalRevenue)}</div><div class="kpi-sub">invoiced / est.</div></div>
        <div class="kpi-card"><div class="kpi-label">Costs</div><div class="kpi-value">${money2(totalCost)}</div><div class="kpi-sub">labor + materials + other</div></div>
        <div class="kpi-card accent"><div class="kpi-label">Profit</div><div class="kpi-value" style="color:${profitColor(totalProfit)}">${totalProfit<0?'−':''}${money2(Math.abs(totalProfit))}</div><div class="kpi-sub">${avgMargin===null?'—':(avgMargin<0?'−':'')+Math.abs(avgMargin).toFixed(0)+'% margin'}</div></div>
      </div>
      <div style="display:flex;flex-direction:column">${list}</div>
      <div style="font-size:11px;color:var(--text-3);margin-top:10px;line-height:1.5">Cost = tracked labor (time × each member's pay rate) + receipts + the manual <strong>Costs</strong> field on each job. Set pay rates on the Team tab and log receipts/time to sharpen these numbers.</div>
    </div>`;
}
