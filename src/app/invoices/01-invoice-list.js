// Global invoice list, aging report, and job picker
// Generated from src/app/04-invoices-email.js lines 1-222.
// Invoice lists, invoice email, Gmail, PDF, and send helpers
// Generated from src/app.js lines 829-1639.
// ══ Invoices view (all invoices across all jobs) ══
function getAllInvoices(){
  const out=[];
  Object.values(S.jobs).forEach(j=>{
    (j.invoices||[]).forEach(inv=>out.push({inv,job:j}));
  });
  return out;
}

function agingBucket(days){
  // days = number of days OVERDUE (positive means past due)
  if(days<=0)return 0; // current / not yet due
  if(days<=30)return 1;
  if(days<=60)return 2;
  if(days<=90)return 3;
  return 4;
}

function renderInvoicesView(){
  const all=getAllInvoices();
  // Stats
  let totalInvoiced=0,totalPaid=0,outstanding=0,overdueAmt=0,overdueCount=0;
  const statusCounts={draft:0,sent:0,paid:0,overdue:0};
  // Aging buckets: 0=current, 1=1-30, 2=31-60, 3=61-90, 4=90+
  const aging=[0,0,0,0,0];
  const agingCounts=[0,0,0,0,0];
  // Top outstanding customers
  const byCustomer={};

  all.forEach(({inv,job})=>{
    const c=calcInvoice(inv);
    const st=invoiceStatus(inv);
    totalInvoiced+=c.total;
    totalPaid+=c.paid;
    outstanding+=c.balance;
    statusCounts[st]=(statusCounts[st]||0)+1;
    // Aging — only on unpaid balances
    if(c.balance>0.005){
      const due=inv.dueDate||inv.date;
      const daysOver=due?-(daysUntil(due)||0):0;
      const b=agingBucket(daysOver);
      aging[b]+=c.balance;
      agingCounts[b]++;
      if(st==='overdue'){overdueAmt+=c.balance;overdueCount++}
      // Customer aggregation
      const key=job.customerName||'(no name)';
      byCustomer[key]=byCustomer[key]||{name:key,jobs:new Set(),outstanding:0,overdue:0};
      byCustomer[key].jobs.add(job.id);
      byCustomer[key].outstanding+=c.balance;
      if(st==='overdue')byCustomer[key].overdue+=c.balance;
    }
  });
  const topCustomers=Object.values(byCustomer).sort((a,b)=>b.outstanding-a.outstanding).slice(0,5);

  // Filter + search + sort
  const q=S.invSearch.toLowerCase();
  let shown=all.filter(({inv,job})=>{
    if(S.invFilter!=='all'&&invoiceStatus(inv)!==S.invFilter)return false;
    if(!q)return true;
    const hay=((inv.number||'')+' '+(job.name||'')+' '+(job.customerName||'')+' '+(job.address||'')).toLowerCase();
    return hay.includes(q);
  });
  const sortFns={
    date:(a,b)=>(b.inv.date||'').localeCompare(a.inv.date||''),
    due:(a,b)=>(a.inv.dueDate||'9999').localeCompare(b.inv.dueDate||'9999'),
    amount:(a,b)=>calcInvoice(b.inv).total-calcInvoice(a.inv).total,
    balance:(a,b)=>calcInvoice(b.inv).balance-calcInvoice(a.inv).balance,
    number:(a,b)=>(b.inv.number||'').localeCompare(a.inv.number||''),
  };
  const sortFn=sortFns[S.invSort]||sortFns.date;
  shown.sort(sortFn);

  const collectionRate=totalInvoiced>0?(totalPaid/totalInvoiced)*100:0;
  const statusChips=[
    ['all','All',all.length],
    ['draft','Draft',statusCounts.draft||0],
    ['sent','Sent',statusCounts.sent||0],
    ['overdue','Overdue',statusCounts.overdue||0],
    ['paid','Paid',statusCounts.paid||0],
  ];

  const agingLabels=['Current','1-30 days','31-60 days','61-90 days','90+ days'];

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;font-weight:700">Accounts Receivable</div>
        <div style="font-size:20px;font-weight:700;margin-top:2px">Invoices</div>
      </div>
      <button class="btn-add" id="btn-new-inv-global" aria-label="Create new invoice">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
        New Invoice
      </button>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card accent"><div class="kpi-label">Outstanding</div><div class="kpi-value">${money(outstanding)}</div><div class="kpi-sub">${all.filter(({inv})=>calcInvoice(inv).balance>0.005).length} unpaid</div></div>
      <div class="kpi-card"><div class="kpi-label">Overdue</div><div class="kpi-value" style="color:${overdueCount>0?'var(--red)':'var(--text)'}">${money(overdueAmt)}</div><div class="kpi-sub">${overdueCount} invoice${overdueCount!==1?'s':''}</div></div>
      <div class="kpi-card"><div class="kpi-label">Collected</div><div class="kpi-value">${money(totalPaid)}</div><div class="kpi-sub">${collectionRate.toFixed(0)}% of invoiced</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Invoiced</div><div class="kpi-value">${money(totalInvoiced)}</div><div class="kpi-sub">${all.length} invoice${all.length!==1?'s':''}</div></div>
    </div>

    <div class="report-section">
      <div class="report-hd">Aging Report <span class="kpi-sub">Outstanding balances by age</span></div>
      <div class="aging-grid">
        ${agingLabels.map((lbl,i)=>`<div class="aging-cell bucket-${i}">
          <div class="aging-lbl">${lbl}</div>
          <div class="aging-val">${money(aging[i])}</div>
          <div class="aging-cnt">${agingCounts[i]} invoice${agingCounts[i]!==1?'s':''}</div>
        </div>`).join('')}
      </div>
    </div>

    ${topCustomers.length?`<div class="report-section">
      <div class="report-hd">Top Outstanding Customers</div>
      <div class="leaderboard top-customers">
        ${topCustomers.map((c,i)=>{
          const rankCls=i===0?'gold':i===1?'silver':i===2?'bronze':'';
          return `<div class="lb-row">
            <div class="lb-rank ${rankCls}">${i+1}</div>
            <div class="member-ava" style="width:30px;height:30px;font-size:12px">${initials(c.name)}</div>
            <div class="lb-name">${esc(c.name)}<div style="font-size:11px;color:var(--text-3);font-weight:500">${c.jobs.size} job${c.jobs.size!==1?'s':''}${c.overdue>0?' · '+money(c.overdue)+' overdue':''}</div></div>
            <div class="lb-stats"><strong>${money(c.outstanding)}</strong><div>balance</div></div>
          </div>`;
        }).join('')}
      </div>
    </div>`:''}

    <div class="toolbar" style="margin-top:8px">
      <div class="search-wrap">
        <div class="search-icon"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z"/></svg></div>
        <input class="search" id="inv-search" placeholder="Search invoice #, job, customer…" value="${esc(S.invSearch)}" aria-label="Search invoices">
      </div>
      <select class="form-select" id="inv-sort" style="max-width:160px;font-size:13px;padding:8px 10px" aria-label="Sort invoices">
        <option value="date" ${S.invSort==='date'?'selected':''}>Newest first</option>
        <option value="due" ${S.invSort==='due'?'selected':''}>Due soonest</option>
        <option value="amount" ${S.invSort==='amount'?'selected':''}>Largest total</option>
        <option value="balance" ${S.invSort==='balance'?'selected':''}>Largest balance</option>
        <option value="number" ${S.invSort==='number'?'selected':''}>Invoice #</option>
      </select>
    </div>

    <div class="filter-row" style="margin-bottom:14px">
      ${statusChips.map(([k,lbl,n])=>`<div class="filter-chip ${S.invFilter===k?'active':''}" data-inv-filter="${k}">${lbl} ${n}</div>`).join('')}
    </div>

    <div class="invoice-list">
      ${shown.length===0?`<div class="empty" style="padding:40px 20px">
        <div class="empty-icon"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75M3.75 9.75h16.5m-16.5 3.75h16.5"/></svg></div>
        <h3>${all.length===0?'No invoices yet':'No matches'}</h3>
        <p>${all.length===0?'Create your first invoice. It will use your company letterhead and pull from job line items.':'Try a different search or filter.'}</p>
      </div>`
        :shown.map(({inv,job})=>{
          const c=calcInvoice(inv);
          const st=invoiceStatus(inv);
          const daysOver=inv.dueDate?-(daysUntil(inv.dueDate)||0):0;
          const overInfo=st==='overdue'&&daysOver>0?` · <span style="color:var(--red);font-weight:700">${daysOver}d late</span>`:'';
          return `<div class="invoice-row ${st}">
            <div class="invoice-row-main" data-open-inv="${esc(job.id)}|${esc(inv.id)}" style="cursor:pointer">
              <div class="invoice-num">${esc(inv.number||'')} <span class="invoice-status ${st}">${st}</span></div>
              <div class="invoice-meta">${esc(job.customerName||'(no customer)')} · ${fmtDate(inv.date)}${inv.dueDate?' · due '+fmtDate(inv.dueDate):''}${overInfo}</div>
              <div class="inv-row-job">${esc(job.name||'')}</div>
            </div>
            <div class="invoice-row-amt" style="margin-right:8px">
              <div class="invoice-row-total">${money(c.total)}</div>
              <div class="invoice-row-bal" style="color:${c.balance>0.005?'var(--orange)':'var(--green-700)'};font-weight:600">${c.balance>0.005?money(c.balance)+' due':'Paid'}</div>
            </div>
            <div class="inv-quick-actions">
              <button class="inv-quick-btn" data-inv-print="${esc(job.id)}|${esc(inv.id)}" title="Print" aria-label="Print invoice ${esc(inv.number||'')}">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659"/></svg>
              </button>
              ${c.balance>0.005?`<button class="inv-quick-btn" data-inv-paid="${esc(job.id)}|${esc(inv.id)}" title="Mark paid in full" aria-label="Mark invoice ${esc(inv.number||'')} as paid">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
              </button>`:''}
              <button class="inv-quick-btn" data-inv-email="${esc(job.id)}|${esc(inv.id)}" title="Send invoice via email" aria-label="Send invoice ${esc(inv.number||'')}">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/></svg>
              </button>
            </div>
          </div>`;
        }).join('')}
    </div>
  `;
}

// Pick a job, then open invoice editor for it
function showJobPickerModal(onPick){
  const all=jobs();
  if(all.length===0){toast('Add a job first','');return}
  $('modal-root').innerHTML=`<div class="modal-bd" id="mbd" role="dialog" aria-modal="true" aria-label="Pick a job"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Pick a Job</div><button class="modal-close" id="mc" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      <p style="font-size:12.5px;color:var(--text-2);margin-bottom:10px">Invoices are attached to a job so the customer info and project details pull through automatically.</p>
      <div class="search-wrap" style="margin-bottom:12px"><div class="search-icon"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z"/></svg></div>
        <input class="search" id="picker-search" placeholder="Search jobs…" aria-label="Search jobs" autofocus>
      </div>
      <div id="picker-list" style="display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow-y:auto">
        ${all.map(j=>`<div class="invoice-row" data-pick="${esc(j.id)}" style="cursor:pointer;border-left-color:${j.status==='complete'?'#0284c7':j.status==='active'?'#16a34a':j.status==='lead'?'#d97706':'#94a3b8'}">
          <div class="invoice-row-main">
            <div class="invoice-num">${esc(j.name)}</div>
            <div class="invoice-meta">${esc(j.customerName||'No customer')}${j.address?' · '+esc(j.address):''}</div>
          </div>
          <span class="status-pill ${spClass(j.status)}">${spLabel(j.status)}</span>
        </div>`).join('')}
      </div>
    </div>
  </div></div>`;
  $('mc').onclick=closeModal;
  $('mbd').onclick=e=>{if(e.target===e.currentTarget)closeModal()};
  const filterList=q=>{
    const ql=q.toLowerCase();
    document.querySelectorAll('[data-pick]').forEach(r=>{
      const hay=r.textContent.toLowerCase();
      r.style.display=!ql||hay.includes(ql)?'':'none';
    });
  };
  $('picker-search').oninput=e=>filterList(e.target.value);
  document.querySelectorAll('[data-pick]').forEach(r=>r.onclick=()=>{
    closeModal();onPick(r.dataset.pick);
  });
}

