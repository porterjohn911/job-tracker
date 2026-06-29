// Invoice editor and printable invoice rendering
// Generated from src/app.js lines 3388-3773.
// ══ Invoice editor ══
let INV_DRAFT=null; // current draft being edited

function defaultInvoice(j){
  const today=dateKey(new Date());
  const due=new Date();due.setDate(due.getDate()+30);
  return {
    id:'inv_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
    number:nextInvoiceNumber(),
    date:today,
    dueDate:dateKey(due),
    items:[{desc:j.name||'Services rendered',qty:1,rate:Number(j.value||0)||0}],
    taxRate:COMPANY.taxRate||'',
    notes:'',
    terms:COMPANY.terms||'',
    photos:[],
    paid:0,
    status:'draft',
    created:Date.now(),
  };
}

function defaultEstimate(j){
  const today=dateKey(new Date());
  const exp=new Date();exp.setDate(exp.getDate()+30);
  return {
    id:'est_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
    number:nextEstimateNumber(),
    date:today,
    dueDate:dateKey(exp),
    items:[{desc:j.name||'Proposed work',qty:1,rate:Number(j.value||0)||0}],
    taxRate:COMPANY.taxRate||'',
    notes:'',
    terms:COMPANY.terms||'',
    photos:[],
    status:'draft',
    created:Date.now(),
  };
}

function showInvoiceModal(jobId,invoiceId,kind){
  kind=kind||'invoice';
  const j=S.jobs[jobId];if(!j)return;
  const arr=kind==='estimate'?(j.estimates||[]):(j.invoices||[]);
  let inv;
  if(invoiceId){
    inv=arr.find(i=>i.id===invoiceId);
    if(!inv)return;
    INV_DRAFT=JSON.parse(JSON.stringify(inv));
  }else{
    INV_DRAFT=kind==='estimate'?defaultEstimate(j):defaultInvoice(j);
  }
  renderInvoiceModal(jobId,!!invoiceId,kind);
}

function renderInvoiceModal(jobId,isEdit,kind){
  kind=kind||'invoice';const EST=kind==='estimate';
  const inv=INV_DRAFT;
  const c=calcInvoice(inv);
  const itemsHtml=(inv.items||[]).map((it,i)=>`<div class="li-row" data-li="${i}">
    <input type="text" data-li-field="desc" value="${esc(it.desc||'')}" placeholder="Description (e.g. Dock repair labor)" aria-label="Description">
    <input type="number" step="0.01" data-li-field="qty" value="${esc(it.qty??'')}" placeholder="Qty" aria-label="Quantity">
    <input type="number" step="0.01" data-li-field="rate" value="${esc(it.rate??'')}" placeholder="Rate" aria-label="Unit rate">
    <div class="li-amt">${money((Number(it.qty||0)*Number(it.rate||0)))}</div>
    <button class="li-del" data-li-del="${i}" aria-label="Remove line item">×</button>
  </div>`).join('');

  $('modal-root').innerHTML=`<div class="modal-bd" id="mbd" role="dialog" aria-modal="true" aria-label="Invoice editor"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">${isEdit?(EST?'Edit Estimate':'Edit Invoice'):(EST?'New Estimate':'New Invoice')}</div><button class="modal-close" id="mc" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">${EST?'Estimate #':'Invoice #'}</label><input class="form-input" id="inv-num" value="${esc(inv.number||'')}"></div>
        <div class="form-group"><label class="form-label">Status</label>
          <select class="form-select" id="inv-status">
            <option value="draft" ${inv.status==='draft'?'selected':''}>Draft</option>
            <option value="sent" ${inv.status==='sent'?'selected':''}>Sent</option>
            ${EST?`<option value="accepted" ${inv.status==='accepted'?'selected':''}>Accepted</option><option value="declined" ${inv.status==='declined'?'selected':''}>Declined</option>`:`<option value="paid" ${inv.status==='paid'?'selected':''}>Paid</option>`}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">${EST?'Estimate Date':'Invoice Date'}</label><input class="form-input" type="date" id="inv-date" value="${esc(inv.date||'')}"></div>
        <div class="form-group"><label class="form-label">${EST?'Valid Until':'Due Date'}</label><input class="form-input" type="date" id="inv-due" value="${esc(inv.dueDate||'')}"></div>
      </div>
      <div class="form-group"><label class="form-label">Line Items</label>
        <div class="li-head"><div>Description</div><div>Qty</div><div>Rate</div><div>Amount</div><div></div></div>
        <div class="line-items" id="line-items">${itemsHtml}</div>
        <button class="li-add-btn" id="li-add" type="button">+ Add Line Item</button>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Tax Rate (%)</label><input class="form-input" type="number" step="0.01" id="inv-tax" value="${esc(inv.taxRate??'')}"></div>
        ${EST?'':`<div class="form-group"><label class="form-label">Amount Paid</label><input class="form-input" type="number" step="0.01" id="inv-paid" value="${esc(inv.paid??'')}"></div>`}
      </div>
      <div class="inv-totals" id="inv-totals">
        <div class="inv-total-row"><span>Subtotal</span><span class="v" id="t-sub">${money(c.sub)}</span></div>
        <div class="inv-total-row"><span>Tax (${Number(inv.taxRate||0)}%)</span><span class="v" id="t-tax">${money(c.tax)}</span></div>
        <div class="inv-total-row grand"><span>Total</span><span class="v" id="t-total">${money(c.total)}</span></div>
        ${EST?'':`<div class="inv-total-row" style="color:var(--text-3);margin-top:4px"><span>Paid</span><span class="v" id="t-paid">${money(c.paid)}</span></div>
        <div class="inv-total-row" style="font-weight:700"><span>Balance Due</span><span class="v" id="t-bal">${money(c.balance)}</span></div>`}
      </div>
      <div class="form-group"><label class="form-label">Notes (visible on ${EST?'estimate':'invoice'})</label>
        <div class="textarea-with-mic"><textarea class="form-textarea" id="inv-notes" placeholder="Additional notes for the customer…">${esc(inv.notes||'')}</textarea>${micButton('#inv-notes')}</div>
      </div>
      <div class="form-group"><label class="form-label">Payment Terms</label><textarea class="form-textarea" id="inv-terms">${esc(inv.terms||'')}</textarea></div>
      <div class="form-group"><label class="form-label">Photos / Attachments <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-3);font-size:11px">attached to the printed / PDF ${EST?'estimate':'invoice'}</span></label>
        <div class="inv-photos" id="inv-photos"></div>
        <label class="photo-add-btn" style="aspect-ratio:auto;padding:12px;flex-direction:row;gap:8px">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"/><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"/></svg>
          <span>Add Photos</span>
          <input type="file" accept="image/*" multiple id="inv-photo-upload" style="display:none">
        </label>
      </div>
    </div>
    <div class="modal-foot">
      ${isEdit?`<button class="btn-delete" id="inv-del">Delete</button>`:''}
      <button class="btn-cancel" id="btn-cx">Cancel</button>
      <button class="btn-sm" id="inv-print" style="background:var(--surface);border:1.5px solid var(--border-md);font-weight:600">Save & Print</button>
      <button class="btn-sm" id="inv-send" style="background:var(--green-100);border:1.5px solid var(--green-600);color:var(--green-700);font-weight:700"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:13px;height:13px"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/></svg>Save & Send</button>
      <button class="btn-save" id="inv-save">Save</button>
    </div>
  </div></div>`;

  $('mc').onclick=$('btn-cx').onclick=()=>{INV_DRAFT=null;closeModal()};
  $('mbd').onclick=e=>{if(e.target===e.currentTarget){INV_DRAFT=null;closeModal()}};

  function refreshLineItems(){
    const wrap=$('line-items');
    wrap.innerHTML=(INV_DRAFT.items||[]).map((it,i)=>`<div class="li-row" data-li="${i}">
      <input type="text" data-li-field="desc" value="${esc(it.desc||'')}" placeholder="Description">
      <input type="number" step="0.01" data-li-field="qty" value="${esc(it.qty??'')}" placeholder="Qty">
      <input type="number" step="0.01" data-li-field="rate" value="${esc(it.rate??'')}" placeholder="Rate">
      <div class="li-amt">${money(Number(it.qty||0)*Number(it.rate||0))}</div>
      <button class="li-del" data-li-del="${i}">×</button>
    </div>`).join('');
    wireLineItemHandlers();
    refreshTotals();
  }
  function refreshTotals(){
    const c=calcInvoice(INV_DRAFT);
    const tsub=$('t-sub'),ttax=$('t-tax'),ttot=$('t-total'),tpaid=$('t-paid'),tbal=$('t-bal');
    if(tsub)tsub.textContent=money(c.sub);
    if(ttax)ttax.textContent=money(c.tax);
    if(ttot)ttot.textContent=money(c.total);
    if(tpaid)tpaid.textContent=money(c.paid);
    if(tbal)tbal.textContent=money(c.balance);
    // Update tax row label
    const taxLabel=document.querySelector('#inv-totals .inv-total-row:nth-child(2) span:first-child');
    if(taxLabel)taxLabel.textContent='Tax ('+Number(INV_DRAFT.taxRate||0)+'%)';
    // Update line-row amounts
    document.querySelectorAll('[data-li]').forEach(row=>{
      const i=parseInt(row.dataset.li);const it=INV_DRAFT.items[i];if(!it)return;
      const amt=row.querySelector('.li-amt');
      if(amt)amt.textContent=money(Number(it.qty||0)*Number(it.rate||0));
    });
  }
  function wireLineItemHandlers(){
    document.querySelectorAll('[data-li]').forEach(row=>{
      const i=parseInt(row.dataset.li);
      row.querySelectorAll('[data-li-field]').forEach(inp=>{
        inp.oninput=()=>{
          const f=inp.dataset.liField;
          INV_DRAFT.items[i][f]=f==='desc'?inp.value:inp.value;
          refreshTotals();
        };
      });
    });
    document.querySelectorAll('[data-li-del]').forEach(b=>b.onclick=()=>{
      const i=parseInt(b.dataset.liDel);
      INV_DRAFT.items.splice(i,1);
      if(INV_DRAFT.items.length===0)INV_DRAFT.items.push({desc:'',qty:1,rate:0});
      refreshLineItems();
    });
  }
  wireLineItemHandlers();
  wireMicButtons();

  function renderInvPhotos(){
    const wrap=$('inv-photos');if(!wrap)return;
    const ph=INV_DRAFT.photos||[];
    wrap.innerHTML=ph.map((p,i)=>`<div class="inv-photo" data-ip="${i}">
      <img src="${p.url}" alt="">
      <button class="inv-photo-del" data-ip-del="${i}" type="button" aria-label="Remove photo">×</button>
      <input class="inv-photo-cap" data-ip-cap="${i}" value="${esc(p.caption||'')}" placeholder="Caption (optional)">
    </div>`).join('');
    wrap.querySelectorAll('[data-ip-del]').forEach(b=>b.onclick=()=>{INV_DRAFT.photos.splice(parseInt(b.dataset.ipDel),1);renderInvPhotos()});
    wrap.querySelectorAll('[data-ip-cap]').forEach(inp=>inp.oninput=()=>{const i=parseInt(inp.dataset.ipCap);if(INV_DRAFT.photos[i])INV_DRAFT.photos[i].caption=inp.value});
  }
  renderInvPhotos();
  $('inv-photo-upload')?.addEventListener('change',function(){
    const files=Array.from(this.files||[]);if(!files.length)return;
    INV_DRAFT.photos=INV_DRAFT.photos||[];
    files.forEach(file=>{
      if(!file.type.startsWith('image/'))return;
      const r=new FileReader();
      r.onload=e=>{const img=new Image();img.onload=()=>{
        const c=document.createElement('canvas');const MAX=1200;let w=img.width,h=img.height;
        if(w>MAX||h>MAX){if(w>h){h=Math.round(h*MAX/w);w=MAX}else{w=Math.round(w*MAX/h);h=MAX}}
        c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);
        INV_DRAFT.photos.push({url:c.toDataURL('image/jpeg',0.8),caption:''});renderInvPhotos();
      };img.src=e.target.result};
      r.readAsDataURL(file);
    });
    this.value='';
  });

  $('li-add').onclick=()=>{INV_DRAFT.items=INV_DRAFT.items||[];INV_DRAFT.items.push({desc:'',qty:1,rate:0});refreshLineItems();};
  ['inv-num','inv-date','inv-due','inv-status','inv-tax','inv-paid','inv-notes','inv-terms'].forEach(id=>{
    const el=$(id);if(!el)return;
    const k=id.replace('inv-','');
    const fieldMap={num:'number',date:'date',due:'dueDate',status:'status',tax:'taxRate',paid:'paid',notes:'notes',terms:'terms'};
    el.oninput=el.onchange=()=>{INV_DRAFT[fieldMap[k]]=el.value;refreshTotals()};
  });

  async function saveInvoice(){
    const j=S.jobs[jobId];if(!j)return null;
    // Drop empty trailing items
    INV_DRAFT.items=(INV_DRAFT.items||[]).filter(it=>(it.desc&&it.desc.trim())||Number(it.qty||0)!==0||Number(it.rate||0)!==0);
    if(INV_DRAFT.items.length===0){toast('Add at least one line item','');return null}
    const key=EST?'estimates':'invoices';
    j[key]=j[key]||[];
    const existing=j[key].findIndex(i=>i.id===INV_DRAFT.id);
    if(existing>=0)j[key][existing]=INV_DRAFT;else j[key].push(INV_DRAFT);
    // Invoices update the job's aggregate invoiced/paid totals; estimates never do.
    if(!EST){const tot=invoiceTotals(j);j.invoiced=tot.total;j.paid=tot.paid;}
    await writeJob(j);
    await logAct((existing>=0?'updated ':'created ')+(EST?'estimate':'invoice')+' on',j.name);
    return INV_DRAFT;
  }

  $('inv-save').onclick=async()=>{
    const saved=await saveInvoice();
    if(saved){toast('Invoice saved');INV_DRAFT=null;closeModal();render()}
  };
  $('inv-print').onclick=async()=>{
    const saved=await saveInvoice();
    if(saved){INV_DRAFT=null;closeModal();render();printInvoice(S.jobs[jobId],saved,kind)}
  };
  $('inv-send').onclick=async()=>{
    const saved=await saveInvoice();
    if(saved){INV_DRAFT=null;closeModal();render();showSendInvoiceModal(S.jobs[jobId],saved,kind)}
  };
  if(isEdit){
    $('inv-del').onclick=async()=>{
      const j=S.jobs[jobId];if(!j)return;
      const key=EST?'estimates':'invoices';
      const backup=JSON.parse(JSON.stringify(INV_DRAFT));
      j[key]=(j[key]||[]).filter(i=>i.id!==INV_DRAFT.id);
      if(!EST){const tot=invoiceTotals(j);j.invoiced=tot?tot.total:0;j.paid=tot?tot.paid:0;}
      await writeJob(j);await logAct('deleted '+(EST?'estimate':'invoice')+' on',j.name);
      INV_DRAFT=null;closeModal();render();
      const restore=async()=>{const jj=S.jobs[jobId];if(jj){jj[key]=jj[key]||[];jj[key].push(backup);if(!EST){const t=invoiceTotals(jj);jj.invoiced=t.total;jj.paid=t.paid;}await writeJob(jj);render();toast((EST?'Estimate':'Invoice')+' restored')}};
      UNDO.push(restore);
      toast((EST?'Estimate':'Invoice')+' deleted','undo',restore);
    };
  }
}

// ══ Printable invoice with company letterhead ══
function printInvoice(j,inv,kind){
  kind=kind||'invoice';const EST=kind==='estimate';
  const w=window.open('','_blank');
  if(!w){toast('Pop-up blocked — allow pop-ups to print','');return}
  const c=calcInvoice(inv);
  const stText=EST?(inv.status||'draft'):invoiceStatus(inv);
  const logoSrc=getBrandLogoSrc();
  const co=COMPANY;
  const P=invTheme();
  const logoFull=brandLogoFull();
  const itemsRows=(inv.items||[]).map(it=>{
    const amt=Number(it.qty||0)*Number(it.rate||0);
    return `<tr>
      <td>${esc(it.desc||'')}</td>
      <td class="num">${esc(String(it.qty??''))}</td>
      <td class="num">${money(Number(it.rate||0))}</td>
      <td class="num">${money(amt)}</td>
    </tr>`;
  }).join('');

  w.document.write(`<!DOCTYPE html><html><head>
    <meta charset="utf-8">
    <title>${esc(inv.number||'Invoice')} — ${esc(j.name||'')}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Helvetica,Arial,sans-serif;color:#0a1f18;background:#fff;max-width:780px;margin:30px auto;padding:0 32px;font-size:13px;line-height:1.5}
      .lh{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:3px solid ${P.rule};margin-bottom:24px;gap:20px}
      .lh-l{display:flex;align-items:center;gap:14px;flex:1}
      .lh-l img{width:78px;height:78px;object-fit:contain}
      .lh-l img.full{width:300px;height:auto;max-width:62%}
      .lh-co{flex:1}
      .lh-co h1{font-family:Georgia,serif;font-size:24px;font-weight:600;color:${P.primary};letter-spacing:0.01em;line-height:1.1;margin-bottom:4px}
      .lh-co .tag{font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#666}
      .lh-co .addr{font-size:11.5px;color:#555;margin-top:6px;line-height:1.5;white-space:pre-line}
      .lh-r{text-align:right}
      .lh-r .title{font-size:36px;font-weight:800;color:${P.primary};letter-spacing:0.04em;line-height:1}
      .lh-r .num{font-size:13px;color:#555;margin-top:6px}
      .lh-r .status{display:inline-block;margin-top:8px;font-size:10.5px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:4px 12px;border-radius:20px;background:#fef3c7;color:#92400e}
      .lh-r .status.paid{background:#dcfce7;color:#166534}
      .lh-r .status.accepted{background:#dcfce7;color:#166534}
      .lh-r .status.draft{background:#f1f5f9;color:#475569}
      .lh-r .status.overdue{background:#fee2e2;color:#991b1b}
      .lh-r .status.declined{background:#fee2e2;color:#991b1b}
      .meta{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px}
      .meta-box .lbl{font-size:9.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#888;margin-bottom:4px}
      .meta-box .v{font-size:13px;color:#0a1f18;line-height:1.5}
      .meta-box .v strong{display:block;font-size:14px;margin-bottom:1px}
      table{width:100%;border-collapse:collapse;margin-bottom:18px}
      thead th{text-align:left;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#666;padding:8px 10px;background:#f0faf6;border-top:1px solid #ddd;border-bottom:1px solid #ddd}
      th.num,td.num{text-align:right}
      tbody td{padding:10px;border-bottom:1px solid #eee;font-size:13px;vertical-align:top}
      tbody tr:last-child td{border-bottom:1px solid #ddd}
      .totals{margin-left:auto;width:300px;margin-bottom:20px}
      .totals .row{display:flex;justify-content:space-between;padding:5px 0;font-size:13px}
      .totals .row .v{font-variant-numeric:tabular-nums;font-weight:600}
      .totals .grand{padding:10px 0;border-top:2px solid ${P.rule};margin-top:6px;font-size:16px;font-weight:700;color:${P.primary}}
      .totals .due{margin-top:8px;padding:10px 14px;background:#fef3c7;border-radius:6px;font-size:14px;font-weight:700;color:#92400e;display:flex;justify-content:space-between}
      .totals .due.zero{background:#dcfce7;color:#166534}
      .notes{margin-top:16px;padding:14px;background:#f7f9f8;border-left:3px solid ${P.notesBar};border-radius:6px;font-size:12px;color:#3d6358;line-height:1.6}
      .notes .lbl{font-size:9.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${P.primary};margin-bottom:5px}
      .terms{margin-top:14px;font-size:11px;color:#777;line-height:1.6;white-space:pre-line}
      .ft{margin-top:28px;padding-top:14px;border-top:1px solid #ddd;text-align:center;font-size:10.5px;color:#888;letter-spacing:0.04em}
      .inv-photos-doc{margin-top:22px;padding-top:16px;border-top:1px solid #ddd}
      .inv-photos-doc .ip-hd{font-size:9.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#888;margin-bottom:12px}
      .ip-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      .ip-grid figure{border:1px solid #eee;border-radius:6px;overflow:hidden;page-break-inside:avoid;break-inside:avoid}
      .ip-grid img{width:100%;height:auto;display:block}
      .ip-grid figcaption{font-size:11px;color:#555;padding:6px 8px}
      @media print{body{margin:0;padding:18mm 16mm;max-width:none}.no-print{display:none}}
      .print-bar{position:fixed;top:12px;right:12px;display:flex;gap:8px}
      .print-bar button{padding:8px 16px;background:${P.primary};color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;font-family:Helvetica,sans-serif}
      .print-bar button.alt{background:#fff;color:${P.primary};border:1.5px solid ${P.primary}}
    </style></head><body>
    <div class="no-print print-bar">
      <button class="alt" onclick="window.close()">Close</button>
      <button onclick="window.print()">Print / Save PDF</button>
    </div>
    <header class="lh">
      <div class="lh-l">
        ${logoFull
          ?`<img class="full" src="${logoFull}" alt="${esc(co.name||'')}">
        <div class="lh-co"><div class="addr">${esc(BIZ_ADDRESS)}${co.phone?'\n'+esc(co.phone):''}${co.email?' · '+esc(co.email):''}${co.website?'\n'+esc(co.website):''}</div></div>`
          :`${logoSrc?`<img src="${logoSrc}" alt="">`:''}
        <div class="lh-co">
          <h1>${esc(co.name||'Waterfront Solutions')}</h1>
          <div class="tag">${esc(co.license?'Lic. '+co.license:'Construction & Waterfront Services')}</div>
          <div class="addr">${esc(BIZ_ADDRESS)}${co.phone?'\n'+esc(co.phone):''}${co.email?' · '+esc(co.email):''}${co.website?'\n'+esc(co.website):''}</div>
        </div>`}
      </div>
      <div class="lh-r">
        <div class="title">${EST?'ESTIMATE':'INVOICE'}</div>
        <div class="num">${esc(inv.number||'')}</div>
        <div class="status ${stText}">${stText}</div>
      </div>
    </header>
    <section class="meta">
      <div class="meta-box">
        <div class="lbl">${EST?'Prepared For':'Bill To'}</div>
        <div class="v"><strong>${esc(j.customerName||'Customer')}</strong>${j.billingAddress?'\n'+esc(j.billingAddress):(j.address?'\n'+esc(j.address):'')}${j.customerPhone?'\n'+esc(j.customerPhone):''}${j.customerEmail?'\n'+esc(j.customerEmail):''}</div>
      </div>
      <div class="meta-box">
        <div class="lbl">Project</div>
        <div class="v"><strong>${esc(j.name||'')}</strong>${j.address?'\n'+esc(j.address):''}</div>
        <div style="margin-top:12px"><div class="lbl">${EST?'Estimate Date':'Invoice Date'}</div><div class="v">${fmtDate(inv.date)||''}</div></div>
        ${inv.dueDate?`<div style="margin-top:8px"><div class="lbl">${EST?'Valid Until':'Due Date'}</div><div class="v">${fmtDate(inv.dueDate)}</div></div>`:''}
      </div>
    </section>
    <table>
      <thead><tr><th style="width:50%">Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
      <tbody>${itemsRows||'<tr><td colspan="4" style="text-align:center;color:#999;padding:20px">No line items</td></tr>'}</tbody>
    </table>
    <div class="totals">
      <div class="row"><span>Subtotal</span><span class="v">${money(c.sub)}</span></div>
      <div class="row"><span>Tax (${Number(inv.taxRate||0)}%)</span><span class="v">${money(c.tax)}</span></div>
      <div class="row grand"><span>Total</span><span class="v">${money(c.total)}</span></div>
      ${EST
        ?`<div class="due zero"><span>Estimated Total${inv.dueDate?' · valid until '+fmtDate(inv.dueDate):''}</span><span class="v">${money(c.total)}</span></div>`
        :`${c.paid>0?`<div class="row"><span>Paid</span><span class="v">-${money(c.paid)}</span></div>`:''}
      <div class="due ${c.balance<=0.005?'zero':''}"><span>${c.balance<=0.005?'Paid in Full':'Balance Due'}</span><span class="v">${money(Math.max(0,c.balance))}</span></div>`}
    </div>
    ${inv.notes?`<div class="notes"><div class="lbl">Notes</div>${esc(inv.notes).replace(/\n/g,'<br>')}</div>`:''}
    ${inv.terms?`<div class="terms">${esc(inv.terms)}</div>`:''}
    ${(inv.photos&&inv.photos.length)?`<div class="inv-photos-doc"><div class="ip-hd">Photos</div><div class="ip-grid">${inv.photos.map(p=>`<figure><img src="${p.url}" alt="">${p.caption?`<figcaption>${esc(p.caption)}</figcaption>`:''}</figure>`).join('')}</div></div>`:''}
    <div class="ft">${esc(co.name||'Waterfront Solutions')}${co.phone?' · '+esc(co.phone):''}${co.email?' · '+esc(co.email):''} — Thank you for your business</div>
    </body></html>`);
  w.document.close();
}

