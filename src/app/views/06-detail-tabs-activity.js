// Job detail tabs and activity view
// Generated from src/app/05-owner-reports-map-notifications.js lines 781-1138.
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
    const lab=jobLaborStats(j.id);const showPay=canSeeFinancials();const anyRates=showPay&&S.members.some(m=>rateOf(m)>0);
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
          <div class="fin-cell" style="grid-column:1/-1"><div class="fin-label">${showPay?'Actual Labor (tracked)':'Labor Hours (tracked)'}${lab.active?' · <span style="color:var(--green-700);text-transform:none;letter-spacing:0;font-weight:600">'+lab.active+' on the clock</span>':''}</div><div class="fin-value">${showPay?(anyRates?money(lab.cost):'—'):fmtHM(lab.ms)} <span style="font-size:12px;color:var(--text-3);font-weight:500">${showPay?fmtHM(lab.ms)+(anyRates?'':' · set rates on Team'):'tracked'}</span></div></div>
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

