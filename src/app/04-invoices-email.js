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
  const sortFn={
    date:(a,b)=>(b.inv.date||'').localeCompare(a.inv.date||''),
    due:(a,b)=>(a.inv.dueDate||'9999').localeCompare(b.inv.dueDate||'9999'),
    amount:(a,b)=>calcInvoice(b.inv).total-calcInvoice(a.inv).total,
    balance:(a,b)=>calcInvoice(b.inv).balance-calcInvoice(a.inv).balance,
    number:(a,b)=>(b.inv.number||'').localeCompare(a.inv.number||''),
  }[S.invSort]||sortFn?.date;
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

// ── Build polished HTML email body for an invoice ──
function buildInvoiceEmailHTML(j,inv,customMsg,kind){
  kind=kind||'invoice';const EST=kind==='estimate';
  const c=calcInvoice(inv);
  const co=COMPANY;
  const logoSrc=getBrandLogoSrc();
  const P=invTheme();
  const logoFull=brandLogoFull();
  const firstName=((j.customerName||'').trim().split(/\s+/)[0])||'there';
  const itemsRows=(inv.items||[]).map(it=>{
    const amt=Number(it.qty||0)*Number(it.rate||0);
    return `<tr><td style="padding:10px 8px;border-bottom:1px solid #eef3f1;font-size:13px;color:#0a1f18">${esc(it.desc||'')}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #eef3f1;font-size:13px;color:#3d6358;text-align:right;white-space:nowrap">${esc(String(it.qty??''))} × ${money(Number(it.rate||0))}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #eef3f1;font-size:13px;color:#0a1f18;text-align:right;font-weight:600;white-space:nowrap">${money(amt)}</td></tr>`;
  }).join('');
  const greeting=`Hi ${esc(firstName)},`;
  const intro=customMsg?esc(customMsg).replace(/\n/g,'<br>'):(EST
    ?`Thank you for considering <strong>${esc(co.name||'us')}</strong> for <strong>${esc(j.name||'your project')}</strong>. Here is your estimate — the details are below. Let us know if you'd like to move forward.`
    :`Thank you for letting <strong>${esc(co.name||'us')}</strong> work with you on <strong>${esc(j.name||'your project')}</strong>. Your invoice is ready and the details are below.`);
  const balanceLine=EST
    ?`<div style="background:#e6f7f1;color:#0a3d2e;padding:16px 18px;border-radius:10px;margin:18px 0;text-align:center">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85">Estimated Total${inv.dueDate?' · valid until '+fmtDate(inv.dueDate):''}</div>
        <div style="font-size:26px;font-weight:800;margin-top:4px;font-variant-numeric:tabular-nums">${money(c.total)}</div>
      </div>`
    :(c.balance<=0.005
    ?`<div style="background:#dcfce7;color:#166534;padding:14px 18px;border-radius:10px;margin:18px 0;font-size:15px;font-weight:700;text-align:center">✓ Paid in Full — Thank you!</div>`
    :`<div style="background:#fef3c7;color:#92400e;padding:16px 18px;border-radius:10px;margin:18px 0;text-align:center">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#92400e;opacity:0.85">Balance Due${inv.dueDate?' by '+fmtDate(inv.dueDate):''}</div>
        <div style="font-size:26px;font-weight:800;color:#92400e;margin-top:4px;font-variant-numeric:tabular-nums">${money(c.balance)}</div>
      </div>`);
  const contactLine=[co.phone?`<a href="tel:${esc(co.phone)}" style="color:${P.link};text-decoration:none">${esc(co.phone)}</a>`:'',
    co.email?`<a href="mailto:${esc(co.email)}" style="color:${P.link};text-decoration:none">${esc(co.email)}</a>`:'',
    co.website?`<a href="${esc(co.website)}" style="color:${P.link};text-decoration:none">${esc(co.website)}</a>`:''
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${EST?'Estimate':'Invoice'} ${esc(inv.number||'')}</title></head>
<body style="margin:0;padding:0;background:#f0faf6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0a1f18">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f0faf6">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(10,61,46,0.08)">
      <tr><td style="background:${P.band};padding:28px 32px;text-align:center">
        ${logoFull
          ?`<img src="${logoFull}" alt="${esc(co.name||'')}" width="380" style="display:inline-block;width:100%;max-width:380px;height:auto">`
          :`${logoSrc?`<img src="${logoSrc}" alt="${esc(co.name||'Waterfront Solutions')}" width="84" height="84" style="display:inline-block;width:84px;height:84px;object-fit:contain;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.25))">`:''}
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600;color:#ffffff;letter-spacing:0.01em;margin-top:10px">${esc(co.name||'Waterfront Solutions')}</div>`}
        ${BIZ_ADDRESS?`<div style="font-size:11.5px;color:rgba(255,255,255,0.75);margin-top:${logoFull?'12':'4'}px;letter-spacing:0.02em">${esc(BIZ_ADDRESS.replace(/\n/g,' · '))}</div>`:''}
      </td></tr>
      <tr><td style="padding:28px 32px 8px">
        <div style="font-size:11px;font-weight:700;color:#7aa898;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px">${EST?'Estimate':'Invoice'} ${esc(inv.number||'')}</div>
        <h1 style="font-size:22px;font-weight:700;color:${P.primary};margin:0 0 18px;line-height:1.25">${greeting}</h1>
        <p style="font-size:14.5px;color:#3d6358;line-height:1.65;margin:0 0 8px">${intro}</p>
      </td></tr>
      <tr><td style="padding:8px 32px">
        ${balanceLine}
      </td></tr>
      <tr><td style="padding:0 32px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e6f0eb;border-radius:10px;overflow:hidden;background:#fafdfb">
          <tr><td style="padding:14px 16px;background:#f0faf6;border-bottom:1px solid #e6f0eb">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="font-size:11px;font-weight:700;color:#7aa898;text-transform:uppercase;letter-spacing:0.06em">${EST?'Estimate Date':'Invoice Date'}</td>
                <td style="font-size:11px;font-weight:700;color:#7aa898;text-transform:uppercase;letter-spacing:0.06em;text-align:right">${inv.dueDate?(EST?'Valid Until':'Due Date'):''}</td>
              </tr>
              <tr>
                <td style="font-size:13.5px;color:#0a1f18;font-weight:600;padding-top:2px">${fmtDate(inv.date)||'—'}</td>
                <td style="font-size:13.5px;color:#0a1f18;font-weight:600;text-align:right;padding-top:2px">${inv.dueDate?fmtDate(inv.dueDate):''}</td>
              </tr>
            </table>
          </td></tr>
          <tr><td style="padding:4px 8px 8px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              ${itemsRows||'<tr><td style="padding:14px;text-align:center;color:#7aa898;font-size:12px">No line items</td></tr>'}
            </table>
          </td></tr>
          <tr><td style="padding:6px 16px 14px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:13px">
              <tr><td style="padding:3px 0;color:#3d6358">Subtotal</td><td style="padding:3px 0;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;color:#0a1f18">${money(c.sub)}</td></tr>
              <tr><td style="padding:3px 0;color:#3d6358">Tax (${Number(inv.taxRate||0)}%)</td><td style="padding:3px 0;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;color:#0a1f18">${money(c.tax)}</td></tr>
              <tr><td style="padding:9px 0 3px;color:${P.primary};font-size:14px;font-weight:700;border-top:2px solid ${P.rule}">Total</td><td style="padding:9px 0 3px;text-align:right;font-variant-numeric:tabular-nums;font-weight:800;color:${P.primary};font-size:15px;border-top:2px solid ${P.rule}">${money(c.total)}</td></tr>
              ${c.paid>0?`<tr><td style="padding:3px 0;color:#3d6358">Paid</td><td style="padding:3px 0;text-align:right;font-variant-numeric:tabular-nums;color:#3d6358">-${money(c.paid)}</td></tr>`:''}
            </table>
          </td></tr>
        </table>
      </td></tr>
      ${inv.notes?`<tr><td style="padding:18px 32px 0">
        <div style="padding:14px 16px;background:#f7f9f8;border-left:3px solid ${P.notesBar};border-radius:8px">
          <div style="font-size:10px;font-weight:700;color:${P.link};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px">Notes</div>
          <div style="font-size:13px;color:#3d6358;line-height:1.6">${esc(inv.notes).replace(/\n/g,'<br>')}</div>
        </div>
      </td></tr>`:''}
      ${co.phone||co.email?`<tr><td style="padding:24px 32px 0">
        <p style="font-size:14px;color:#3d6358;line-height:1.65;margin:0">
          Questions? Just reply to this email${co.phone?` or give us a call at <a href="tel:${esc(co.phone)}" style="color:${P.link};font-weight:600;text-decoration:none">${esc(co.phone)}</a>`:''}. We appreciate your business!
        </p>
      </td></tr>`:''}
      <tr><td style="padding:24px 32px 8px">
        <p style="font-size:14.5px;color:#0a1f18;margin:0;line-height:1.5">Thanks,<br><strong style="color:${P.primary}">${esc(S.user||co.name||'The Waterfront Solutions Team')}</strong></p>
      </td></tr>
      ${inv.terms?`<tr><td style="padding:14px 32px 0">
        <div style="font-size:11px;color:#7aa898;line-height:1.6;border-top:1px solid #e6f0eb;padding-top:14px;font-style:italic">${esc(inv.terms).replace(/\n/g,'<br>')}</div>
      </td></tr>`:''}
      <tr><td style="background:#f0faf6;padding:18px 32px;text-align:center;border-top:1px solid #e6f0eb;margin-top:24px">
        <div style="font-family:Georgia,serif;font-size:13px;font-weight:600;color:${P.primary}">${esc(co.name||'Waterfront Solutions')}</div>
        ${contactLine?`<div style="font-size:11.5px;color:#7aa898;margin-top:4px">${contactLine}</div>`:''}
        ${co.license?`<div style="font-size:10.5px;color:#7aa898;margin-top:3px;letter-spacing:0.04em">License #${esc(co.license)}</div>`:''}
      </td></tr>
    </table>
    <div style="font-size:11px;color:#7aa898;text-align:center;margin-top:14px">This ${EST?'estimate':'invoice'} was sent from your ${esc(co.name||'Waterfront Solutions')} job tracker.</div>
  </td></tr>
</table>
</body></html>`;
}

function buildInvoiceEmailText(j,inv,customMsg,kind){
  kind=kind||'invoice';const EST=kind==='estimate';
  const c=calcInvoice(inv);
  const co=COMPANY;
  const firstName=((j.customerName||'').trim().split(/\s+/)[0])||'there';
  const intro=customMsg||(EST?`Thanks for considering ${co.name||'us'} for ${j.name||'your project'}. Your estimate is ready — details below. Let us know if you'd like to move forward.`:`Thanks for letting ${co.name||'us'} work with you on ${j.name||'your project'}. Your invoice is ready — details below.`);
  const items=(inv.items||[]).map(it=>{
    const amt=Number(it.qty||0)*Number(it.rate||0);
    return `  • ${(it.desc||'').padEnd(40)} ${(it.qty??'')+' × '+money(Number(it.rate||0))}   ${money(amt)}`;
  }).join('\n');
  const lines=[
    `Hi ${firstName},`,'',
    intro,'',
    `${EST?'ESTIMATE':'INVOICE'} ${inv.number||''}`,
    `Date: ${fmtDate(inv.date)||''}`,
    inv.dueDate?`${EST?'Valid until':'Due'}:  ${fmtDate(inv.dueDate)}`:'',
    '','Line Items:',items||'  (none)','',
    `Subtotal:   ${money(c.sub)}`,
    `Tax (${Number(inv.taxRate||0)}%):  ${money(c.tax)}`,
    `Total:      ${money(c.total)}`,
    EST?'':(c.paid>0?`Paid:      -${money(c.paid)}`:''),
    EST?`ESTIMATED TOTAL: ${money(c.total)}`:(c.balance<=0.005?`PAID IN FULL — Thank you!`:`Balance Due: ${money(c.balance)}`),
    '',
    inv.notes?'Notes:\n'+inv.notes+'\n':'',
    `Questions? Just reply to this email${co.phone?' or call '+co.phone:''}. We appreciate your business!`,'',
    `Thanks,`,S.user||co.name||'The Waterfront Solutions Team','',
    [co.name,co.phone,co.email,co.website].filter(Boolean).join(' · '),
    co.license?`License #${co.license}`:'',
    inv.terms?'\n'+inv.terms:''
  ].filter(l=>l!==undefined);
  return lines.join('\n').replace(/\n{3,}/g,'\n\n');
}

function buildInvoiceEml(j,inv,customMsg,kind){
  kind=kind||'invoice';const EST=kind==='estimate';
  const co=COMPANY;
  const subject=`${EST?'Estimate':'Invoice'} ${inv.number||''} from ${co.name||'Waterfront Solutions'}`;
  const fromName=co.name||'Waterfront Solutions';
  const fromEmail=co.email||'noreply@example.com';
  const toName=j.customerName||'';
  const toEmail=j.customerEmail||'';
  const html=buildInvoiceEmailHTML(j,inv,customMsg,kind);
  const text=buildInvoiceEmailText(j,inv,customMsg,kind);
  const bnd='----=_Boundary_'+Date.now().toString(36);
  // Use base64 encoding to safely handle Unicode & long lines
  const enc=s=>{
    try{const b=typeof btoa==='function'?btoa(unescape(encodeURIComponent(s))):Buffer.from(s,'utf8').toString('base64');
      // Wrap to 76-char lines per RFC
      return b.replace(/(.{76})/g,'$1\r\n');
    }catch(e){return s}
  };
  const headers=[
    'MIME-Version: 1.0',
    `From: "${fromName}" <${fromEmail}>`,
    toEmail?`To: "${toName}" <${toEmail}>`:'',
    `Subject: ${subject}`,
    'X-Unsent: 1',
    `Content-Type: multipart/alternative; boundary="${bnd}"`,
  ].filter(Boolean).join('\r\n');
  const body=[
    '',
    `--${bnd}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64','',
    enc(text),
    `--${bnd}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64','',
    enc(html),
    `--${bnd}--`,'',
  ].join('\r\n');
  return headers+'\r\n'+body;
}

async function copyHtmlToClipboard(html,text){
  try{
    if(window.ClipboardItem&&navigator.clipboard&&navigator.clipboard.write){
      const item=new ClipboardItem({
        'text/html':new Blob([html],{type:'text/html'}),
        'text/plain':new Blob([text],{type:'text/plain'}),
      });
      await navigator.clipboard.write([item]);
      return true;
    }
  }catch(e){}
  try{await navigator.clipboard.writeText(text);return true}catch(e){}
  return false;
}

function downloadFile(filename,content,mime){
  const blob=new Blob([content],{type:mime||'text/plain;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=filename;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

// ── Gmail API: connect once, send branded HTML + PDF in true one click ──
function GMAIL_LS_KEY(){return LS('gmail')}
function gmailLoad(){try{return JSON.parse(localStorage.getItem(GMAIL_LS_KEY())||'null')||{}}catch(e){return {}}}
function gmailSave(cfg){try{localStorage.setItem(GMAIL_LS_KEY(),JSON.stringify(cfg||{}))}catch(e){}}
function gmailConnected(){const c=gmailLoad();return !!(c&&c.clientId&&c.accessToken&&Date.now()<(c.expiresAt||0)-30000)}
function gmailEmail(){return gmailLoad().email||''}
let _gisP=null;
function loadGIS(){
  if(_gisP)return _gisP;
  _gisP=new Promise((res,rej)=>{
    if(window.google&&window.google.accounts&&window.google.accounts.oauth2){res(window.google);return}
    const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.defer=true;
    s.onload=()=>res(window.google);s.onerror=()=>rej(new Error('Failed to load Google sign-in script'));
    document.head.appendChild(s);
  });
  return _gisP;
}
async function gmailFetchProfile(token){
  const r=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:'Bearer '+token}});
  if(!r.ok)throw new Error('Profile lookup failed ('+r.status+')');
  const j=await r.json();return j.emailAddress||'';
}
async function gmailRequestToken(clientId,silent){
  const google=await loadGIS();
  return new Promise((res,rej)=>{
    const client=google.accounts.oauth2.initTokenClient({
      client_id:clientId,
      scope:'https://www.googleapis.com/auth/gmail.send',
      callback:(resp)=>{if(resp&&resp.error){rej(new Error(resp.error_description||resp.error));return}res(resp)},
      error_callback:(err)=>rej(new Error((err&&err.message)||'OAuth flow cancelled'))
    });
    client.requestAccessToken({prompt:silent?'':'consent'});
  });
}
function gmailOriginOk(){
  if(typeof window==='undefined')return false;
  if(location.protocol==='file:')return false;
  // Google's rule: HTTPS, or http://localhost / http://127.0.0.1 (any port).
  if(location.protocol==='https:')return !!window.isSecureContext;
  if(location.protocol==='http:'){
    const h=location.hostname;return h==='localhost'||h==='127.0.0.1'||h==='[::1]';
  }
  return false;
}
function gmailOriginReason(){
  if(location.protocol==='file:')return 'This page is opened from a local file (file://). Google blocks OAuth from file:// pages. Open the app via its hosted URL instead.';
  if(location.protocol==='http:'){const h=location.hostname;if(h!=='localhost'&&h!=='127.0.0.1'&&h!=='[::1]')return 'This page is served over plain HTTP. Google requires HTTPS (except localhost). Use the HTTPS version of this URL.';}
  if(!window.isSecureContext)return 'This page is not a secure context. Google requires HTTPS for OAuth.';
  return '';
}
async function gmailConnect(clientId){
  if(!clientId)throw new Error('Paste your OAuth Client ID first');
  if(!gmailOriginOk())throw new Error(gmailOriginReason()||'OAuth requires a secure origin (HTTPS or localhost).');
  const tok=await gmailRequestToken(clientId,false);
  let email='';try{email=await gmailFetchProfile(tok.access_token)}catch(e){}
  const cfg={clientId,accessToken:tok.access_token,expiresAt:Date.now()+(tok.expires_in||3500)*1000,email,connectedAt:Date.now()};
  gmailSave(cfg);return cfg;
}
async function gmailEnsureToken(){
  const cfg=gmailLoad();
  if(!cfg.clientId)throw new Error('Gmail is not connected — open Settings → Email sending');
  if(Date.now()<(cfg.expiresAt||0)-30000)return cfg.accessToken;
  const tok=await gmailRequestToken(cfg.clientId,true);
  cfg.accessToken=tok.access_token;cfg.expiresAt=Date.now()+(tok.expires_in||3500)*1000;gmailSave(cfg);
  return cfg.accessToken;
}
function gmailDisconnect(){
  const cfg=gmailLoad();
  if(cfg.accessToken&&window.google&&window.google.accounts&&window.google.accounts.oauth2){
    try{window.google.accounts.oauth2.revoke(cfg.accessToken,()=>{})}catch(e){}
  }
  gmailSave({});
}
function _u8b64(s){return btoa(unescape(encodeURIComponent(s)))}
function _b64url(s){return s.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function _wrap76(s){return s.replace(/(.{76})/g,'$1\r\n')}
async function _fileToB64(file){
  const buf=await file.arrayBuffer();const bytes=new Uint8Array(buf);
  let bin='',CHUNK=0x8000;for(let i=0;i<bytes.length;i+=CHUNK)bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+CHUNK));
  return btoa(bin);
}
function buildGmailMime(o){
  const B1='ALT_'+Math.random().toString(36).slice(2);
  const B2='MIX_'+Math.random().toString(36).slice(2);
  const fromHdr=o.fromName?('"'+String(o.fromName).replace(/"/g,'')+'" <'+o.fromEmail+'>'):o.fromEmail;
  const lines=[
    'From: '+fromHdr,
    'To: '+o.to,
    'Subject: =?UTF-8?B?'+_u8b64(o.subject||'')+'?=',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="'+B2+'"',
    '',
    '--'+B2,
    'Content-Type: multipart/alternative; boundary="'+B1+'"',
    '',
    '--'+B1,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    _wrap76(_u8b64(o.textBody||'')),
    '',
    '--'+B1,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    _wrap76(_u8b64(o.htmlBody||'')),
    '',
    '--'+B1+'--'
  ];
  let mime=lines.join('\r\n');
  for(const a of (o.attachments||[])){
    const name=String(a.name||'attachment').replace(/"/g,'');
    mime+='\r\n\r\n--'+B2+'\r\n';
    mime+='Content-Type: '+(a.mime||'application/octet-stream')+'; name="'+name+'"\r\n';
    mime+='Content-Disposition: attachment; filename="'+name+'"\r\n';
    mime+='Content-Transfer-Encoding: base64\r\n\r\n';
    mime+=_wrap76(a.base64);
  }
  mime+='\r\n--'+B2+'--';
  return mime;
}
async function gmailApiSend(o){
  const token=await gmailEnsureToken();
  const fromEmail=gmailEmail();
  const atts=[];
  for(const f of (o.attachments||[])){
    atts.push({name:f.name,mime:f.type||'application/octet-stream',base64:await _fileToB64(f)});
  }
  const mime=buildGmailMime({fromName:o.fromName,fromEmail,to:o.to,subject:o.subject,htmlBody:o.htmlBody,textBody:o.textBody,attachments:atts});
  const raw=_b64url(btoa(mime));
  const r=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{
    method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({raw})
  });
  if(!r.ok){let m='Gmail API error '+r.status;try{const j=await r.json();if(j&&j.error&&j.error.message)m=j.error.message}catch(e){}throw new Error(m)}
  return r.json();
}

// ── Send PDF: jsPDF + html2canvas → Web Share on mobile, Download + Gmail draft on desktop ──
let _pdfLibsP=null;
function loadPDFLibs(){
  if(_pdfLibsP)return _pdfLibsP;
  function add(src){return new Promise((r,j)=>{const s=document.createElement('script');s.src=src;s.onload=r;s.onerror=()=>j(new Error('Failed to load '+src));document.head.appendChild(s)})}
  _pdfLibsP=Promise.all([
    window.html2canvas?Promise.resolve():add('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'),
    (window.jspdf&&window.jspdf.jsPDF)?Promise.resolve():add('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
  ]).then(()=>({html2canvas:window.html2canvas,jsPDF:window.jspdf.jsPDF}));
  return _pdfLibsP;
}
async function urlToDataURL(url){
  if(!url)return null;if(/^data:/.test(url))return url;
  try{const r=await fetch(url,{mode:'cors'});const b=await r.blob();return await new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.readAsDataURL(b)})}catch(e){return null}
}
async function buildInvoicePDFFile(j,inv,kind){
  kind=kind||'invoice';
  const {html2canvas,jsPDF}=await loadPDFLibs();
  const html=buildInvoiceEmailHTML(j,inv,'',kind);
  const ifr=document.createElement('iframe');
  ifr.setAttribute('aria-hidden','true');
  ifr.style.cssText='position:fixed;left:-9999px;top:0;width:816px;height:1100px;border:0;background:#fff;';
  document.body.appendChild(ifr);
  const idoc=ifr.contentDocument||ifr.contentWindow.document;
  idoc.open();idoc.write(html);idoc.close();
  await new Promise(r=>setTimeout(r,200));
  const imgs=Array.from(idoc.images||[]);
  await Promise.all(imgs.map(im=>im.complete?Promise.resolve():new Promise(r=>{im.onload=im.onerror=r;setTimeout(r,3000)})));
  const body=idoc.body;body.style.background='#fff';
  ifr.style.height=Math.max(1100,body.scrollHeight+40)+'px';
  await new Promise(r=>setTimeout(r,60));
  const canvas=await html2canvas(body,{scale:2,backgroundColor:'#ffffff',useCORS:true,logging:false,windowWidth:816,windowHeight:body.scrollHeight});
  document.body.removeChild(ifr);
  const pdf=new jsPDF({unit:'pt',format:'letter',orientation:'portrait'});
  const pageW=pdf.internal.pageSize.getWidth(),pageH=pdf.internal.pageSize.getHeight();
  const margin=18,imgW=pageW-margin*2,ratio=canvas.height/canvas.width,fullImgH=imgW*ratio;
  let remH=fullImgH,off=0,pageIdx=0;
  while(remH>0){
    const usable=pageH-margin*2,sliceH=Math.min(remH,usable);
    const sliceCanvasH=Math.round(sliceH/fullImgH*canvas.height);
    const sc=document.createElement('canvas');sc.width=canvas.width;sc.height=sliceCanvasH;
    sc.getContext('2d').drawImage(canvas,0,Math.round(off/fullImgH*canvas.height),canvas.width,sliceCanvasH,0,0,canvas.width,sliceCanvasH);
    if(pageIdx>0)pdf.addPage();
    pdf.addImage(sc.toDataURL('image/jpeg',0.92),'JPEG',margin,margin,imgW,sliceH);
    off+=sliceH;remH-=sliceH;pageIdx++;
  }
  const photos=(inv.photos||[]).filter(p=>p&&p.url);
  for(const ph of photos){
    const du=await urlToDataURL(ph.url);if(!du)continue;
    const img=new Image();await new Promise(r=>{img.onload=img.onerror=r;img.src=du;setTimeout(r,3000)});
    if(!img.width)continue;
    const maxW=pageW-72,maxH=pageH-120;let w=img.width,h=img.height;const k=Math.min(maxW/w,maxH/h,1);w*=k;h*=k;
    pdf.addPage();
    pdf.setFont('helvetica','bold');pdf.setFontSize(11);pdf.setTextColor(60);
    pdf.text((kind==='estimate'?'Estimate':'Invoice')+' '+(inv.number||'')+' — Photos',36,40);
    pdf.addImage(du,'JPEG',(pageW-w)/2,60,w,h);
    if(ph.caption){pdf.setFont('helvetica','normal');pdf.setFontSize(10);pdf.setTextColor(90);pdf.text(String(ph.caption).slice(0,200),36,60+h+22,{maxWidth:pageW-72})}
  }
  const blob=pdf.output('blob');
  const filename=(kind==='estimate'?'Estimate':'Invoice')+'-'+(inv.number||'draft')+'.pdf';
  return new File([blob],filename,{type:'application/pdf'});
}
// The signed-in Firebase team member, or null when access control is off / not
// signed in. Direct SMTP send requires one (the function verifies the token).
function _firebaseUser(){
  try{return (typeof firebase!=='undefined'&&firebase.apps&&firebase.apps.length&&firebase.auth&&firebase.auth().currentUser)||null}catch(e){return null}
}
// Direct server-side send via netlify/functions/send-invoice, using the
// SMTP_USER / SMTP_PASS configured in Netlify. Emails the branded PDF + HTML
// straight to the customer — no Gmail sign-in, no OS share sheet.
async function smtpInvoiceSend(o){
  const user=_firebaseUser();
  if(!user)throw new Error('Sign in with your team account to send email directly');
  const idToken=await user.getIdToken();
  const pdfBase64=await _fileToB64(o.file);
  const r=await fetch('/.netlify/functions/send-invoice',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      idToken,
      to:o.to,
      subject:o.subject,
      message:o.text,
      html:o.html,
      pdfBase64,
      filename:o.file.name,
      fromName:o.fromName||'',
      replyTo:o.replyTo||undefined,
    }),
  });
  let data={};try{data=await r.json()}catch(e){}
  if(!r.ok)throw new Error(data.error||('Send failed ('+r.status+')'));
  return data;
}
async function sendInvoicePDF(j,inv,kind,opts){
  opts=opts||{};kind=kind||'invoice';const EST=kind==='estimate';
  const to=opts.to||j.customerEmail||'';
  const subject=opts.subject||((EST?'Estimate':'Invoice')+' '+(inv.number||'')+' from '+(COMPANY.name||'')).trim();
  const message=opts.message||'';
  const text=buildInvoiceEmailText(j,inv,message,kind);
  toast('Building PDF…','');
  let file;
  try{const _builder=window.buildInvoicePDFFile||buildInvoicePDFFile;file=await _builder(j,inv,kind)}
  catch(e){toast('PDF build failed: '+((e&&e.message)||e),'');return}
  if((window.gmailConnected||gmailConnected)()){
    try{
      toast('Sending via Gmail…','');
      const htmlBody=buildInvoiceEmailHTML(j,inv,message,kind);
      const _send=window.gmailApiSend||gmailApiSend;
      await _send({to,subject,htmlBody,textBody:text,fromName:COMPANY.name||'',attachments:[file]});
      if(!inv.sent){inv.sent=Date.now();if(inv.status==='draft')inv.status='sent';await writeJob(j)}
      await logAct((EST?'emailed estimate ':'emailed invoice ')+(inv.number||'')+' (Gmail) to '+to+' for',j.name);
      toast('Sent · check your Gmail Sent folder');
      return;
    }catch(e){toast('Gmail send failed: '+((e&&e.message)||e)+' — using fallback','')}
  }
  // Direct SMTP send (uses the SMTP creds set in Netlify). Primary one-click
  // path when Gmail OAuth isn't connected and the user is signed in as a team
  // member. On failure, surface the real reason and drop to the manual fallback.
  if(_firebaseUser()){
    try{
      toast('Sending…','');
      const htmlBody=buildInvoiceEmailHTML(j,inv,message,kind);
      await smtpInvoiceSend({to,subject,text,html:htmlBody,file,fromName:COMPANY.name||'',replyTo:COMPANY.email||''});
      if(!inv.sent){inv.sent=Date.now();if(inv.status==='draft')inv.status='sent';await writeJob(j)}
      await logAct((EST?'emailed estimate ':'emailed invoice ')+(inv.number||'')+' to '+to+' for',j.name);
      toast('Sent to '+to);
      return;
    }catch(e){toast('Direct send failed: '+((e&&e.message)||e)+' — using fallback','')}
  }
  // Skip navigator.share on desktop — Chrome's desktop share sheet IS the OS
  // "Open with" picker the user wants to avoid. Only use it on real mobile.
  const _isMobile=(function(){
    const ua=(typeof navigator!=='undefined'&&navigator.userAgent)||'';
    if(/Mobi|Android|iPhone|iPad|iPod/i.test(ua))return true;
    if(navigator.userAgentData&&navigator.userAgentData.mobile)return true;
    // iPadOS Safari reports as Mac with touch:
    if(navigator.platform==='MacIntel'&&(navigator.maxTouchPoints||0)>1)return true;
    return false;
  })();
  if(_isMobile&&navigator.canShare&&typeof navigator.share==='function'){
    try{
      if(navigator.canShare({files:[file]})){
        await navigator.share({files:[file],title:subject,text:text});
        if(!inv.sent){inv.sent=Date.now();if(inv.status==='draft')inv.status='sent';await writeJob(j)}
        await logAct((EST?'shared estimate ':'shared invoice ')+(inv.number||'')+' (PDF) for',j.name);
        toast('Shared — pick Mail or Gmail and tap Send');
        return;
      }
    }catch(e){if(e&&e.name==='AbortError')return;}
  }
  // Desktop: download the PDF, then go straight to Gmail Web compose (no OS picker, no mailto handoff).
  try{
    const a=document.createElement('a');a.href=URL.createObjectURL(file);a.download=file.name;a.rel='noopener';document.body.appendChild(a);a.click();
    setTimeout(()=>{try{URL.revokeObjectURL(a.href)}catch(e){}a.remove()},2000);
  }catch(e){toast('Download failed: '+((e&&e.message)||e),'');return}
  const enc=encodeURIComponent;
  const gmailUrl='https://mail.google.com/mail/?view=cm&fs=1&to='+enc(to)+'&su='+enc(subject)+'&body='+enc(text);
  try{window.open(gmailUrl,'_blank','noopener')}catch(e){}
  if(!inv.sent){inv.sent=Date.now();if(inv.status==='draft')inv.status='sent';await writeJob(j)}
  await logAct((EST?'emailed estimate ':'emailed invoice ')+(inv.number||'')+' (PDF) for',j.name);
  toast('PDF downloaded — drag it into the Gmail tab to attach');
}

function emailInvoice(j,inv,kind){showSendInvoiceModal(j,inv,kind)}

function showSendInvoiceModal(j,inv,kind){
  kind=kind||'invoice';const EST=kind==='estimate';
  const co=COMPANY;
  const defaultSubject=`${EST?'Estimate':'Invoice'} ${inv.number||''} from ${co.name||'Waterfront Solutions'}`;
  $('modal-root').innerHTML=`<div class="modal-bd" id="mbd" role="dialog" aria-modal="true" aria-label="Send ${EST?'estimate':'invoice'}"><div class="modal" style="max-width:680px"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Send ${EST?'Estimate':'Invoice'} ${esc(inv.number||'')}</div><button class="modal-close" id="mc" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">To</label><input class="form-input" id="em-to" value="${esc(j.customerEmail||'')}" placeholder="customer@example.com"></div>
        <div class="form-group"><label class="form-label">Subject</label><input class="form-input" id="em-subject" value="${esc(defaultSubject)}"></div>
      </div>
      <div class="form-group"><label class="form-label">Personal Message <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-3)">(optional — replaces the default intro)</span></label>
        <div class="textarea-with-mic"><textarea class="form-textarea" id="em-msg" placeholder="Add a personal note for the customer (optional)…" style="min-height:64px"></textarea>${micButton('#em-msg')}</div>
      </div>
      <label class="form-label" style="display:block;margin-bottom:6px">Preview</label>
      <div class="email-preview-wrap"><iframe class="email-preview-frame" id="em-iframe" title="Email preview" style="height:560px"></iframe></div>
      <button class="email-send-btn primary" id="em-send-now" type="button" style="width:100%;margin-bottom:8px">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/></svg>
        <span>Email PDF — one tap<span class="email-send-sub">Branded PDF + photos · sends via Gmail when connected · opens Gmail Web on desktop, share sheet on mobile</span></span>
      </button>
      <div class="email-send-grid">
        <a class="email-send-btn primary" id="em-mailto" href="#">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25"/></svg>
          <span>Open in Email App<span class="email-send-sub">Default mail client (plain text)</span></span>
        </a>
        <a class="email-send-btn" id="em-gmail" href="#" target="_blank" rel="noopener">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0-.414.336-.75.75-.75h18c.414 0 .75.336.75.75v10.5a.75.75 0 01-.75.75H3a.75.75 0 01-.75-.75V6.75z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 7l9.75 7.5L21.75 7"/></svg>
          <span>Compose in Gmail Web<span class="email-send-sub">Opens gmail.com compose</span></span>
        </a>
        <button class="email-send-btn" id="em-gmail-pdf" type="button">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>
          <span>PDF via Gmail<span class="email-send-sub">Opens the PDF to save + a Gmail draft to attach it</span></span>
        </button>
        <button class="email-send-btn" id="em-copy" type="button">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9 9 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5"/></svg>
          <span>Copy Rich Email<span class="email-send-sub">Paste into any webmail</span></span>
        </button>
        <button class="email-send-btn" id="em-eml" type="button">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
          <span>Download .eml<span class="email-send-sub">Opens as draft in Outlook / Apple Mail</span></span>
        </button>
      </div>
      <p style="font-size:11.5px;color:var(--text-3);margin-top:14px;line-height:1.55">
        <strong>Tip:</strong> "Copy Rich Email" pastes the styled invoice (with logo) directly into Gmail or Outlook web compose windows. ".eml" preserves the formatting in Outlook desktop, Apple Mail, and Thunderbird.
      </p>
    </div>
    <div class="modal-foot">
      <button class="btn-cancel" id="btn-cx">Close</button>
      <button class="btn-sm" id="em-print" style="background:var(--surface);border:1.5px solid var(--border-md);font-weight:600">Also Print PDF</button>
    </div>
  </div></div>`;

  function currentMsg(){return $('em-msg')?.value.trim()||''}
  function currentSubject(){return $('em-subject')?.value||''}
  function currentTo(){return $('em-to')?.value.trim()||''}
  function refreshPreview(){
    const html=buildInvoiceEmailHTML(j,inv,currentMsg(),kind);
    const f=$('em-iframe');if(!f)return;
    const d=f.contentDocument||f.contentWindow.document;
    d.open();d.write(html);d.close();
  }
  function refreshSendLinks(){
    const to=currentTo();
    const subject=currentSubject();
    const text=buildInvoiceEmailText(j,inv,currentMsg(),kind);
    const enc=encodeURIComponent;
    const mailto=`mailto:${enc(to)}?subject=${enc(subject)}&body=${enc(text)}`;
    const gmail=`https://mail.google.com/mail/?view=cm&fs=1&to=${enc(to)}&su=${enc(subject)}&body=${enc(text)}`;
    $('em-mailto').href=mailto;
    $('em-gmail').href=gmail;
  }

  $('em-msg').oninput=()=>{refreshPreview();refreshSendLinks()};
  $('em-subject').oninput=refreshSendLinks;
  $('em-to').oninput=refreshSendLinks;
  refreshPreview();refreshSendLinks();wireMicButtons();

  $('mc').onclick=$('btn-cx').onclick=closeModal;
  $('mbd').onclick=e=>{if(e.target===e.currentTarget)closeModal()};
  $('em-mailto').onclick=async()=>{
    if(!inv.sent){inv.sent=Date.now();if(inv.status==='draft')inv.status='sent';await writeJob(j);await logAct('emailed '+(EST?'estimate':'invoice')+' '+(inv.number||'')+' for',j.name)}
  };
  $('em-gmail').onclick=async()=>{
    if(!inv.sent){inv.sent=Date.now();if(inv.status==='draft')inv.status='sent';await writeJob(j);await logAct('emailed '+(EST?'estimate':'invoice')+' '+(inv.number||'')+' for',j.name)}
  };
  $('em-gmail-pdf').onclick=async()=>{
    // Open the print/PDF view (Save as PDF) + a Gmail compose draft so the
    // PDF can be attached. Gmail compose URLs can't carry an attachment, so
    // the PDF is opened alongside for the user to attach.
    try{window.open($('em-gmail').href,'_blank','noopener')}catch(e){}
    printInvoice(j,inv,kind);
    if(!inv.sent){inv.sent=Date.now();if(inv.status==='draft')inv.status='sent';await writeJob(j);await logAct('emailed '+(EST?'estimate':'invoice')+' '+(inv.number||'')+' (PDF) for',j.name)}
    toast('Save the PDF, then attach it in the Gmail window');
  };
  $('em-copy').onclick=async()=>{
    const ok=await copyHtmlToClipboard(buildInvoiceEmailHTML(j,inv,currentMsg(),kind),buildInvoiceEmailText(j,inv,currentMsg(),kind));
    if(ok){
      if(!inv.sent){inv.sent=Date.now();if(inv.status==='draft')inv.status='sent';await writeJob(j);await logAct('prepared '+(EST?'estimate':'invoice')+' '+(inv.number||'')+' to send for',j.name)}
      toast('Copied — paste into your email');
    }else{toast('Copy failed','')}
  };
  $('em-eml').onclick=async()=>{
    const eml=buildInvoiceEml(j,inv,currentMsg(),kind);
    downloadFile(`${EST?'Estimate':'Invoice'}-${inv.number||'draft'}.eml`,eml,'message/rfc822');
    if(!inv.sent){inv.sent=Date.now();if(inv.status==='draft')inv.status='sent';await writeJob(j);await logAct('downloaded '+(EST?'estimate':'invoice')+' '+(inv.number||'')+' draft for',j.name)}
    toast('.eml downloaded — open it to send');
  };
  $('em-print').onclick=()=>printInvoice(j,inv,kind);
  $('em-send-now').onclick=async()=>{
    const to=currentTo();
    if(!to){toast('Add a recipient email first','');return}
    const btn=$('em-send-now'),lbl=btn.querySelector('span');const old=lbl?lbl.innerHTML:'';
    btn.disabled=true;if(lbl)lbl.textContent='Building PDF…';
    try{
      await sendInvoicePDF(j,inv,kind,{to,subject:currentSubject(),message:currentMsg()});
      closeModal();render();
    }catch(e){toast('Send failed: '+((e&&e.message)||e),'')}
    finally{btn.disabled=false;if(lbl)lbl.innerHTML=old}
  };
}

