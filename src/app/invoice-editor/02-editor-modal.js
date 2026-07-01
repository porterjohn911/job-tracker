// Invoice and estimate editor modal
// Generated from src/app/08-invoice-editor-print.js.
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
      let restored=false;
      const restore=async()=>{
        if(restored)return;restored=true;
        const jj=S.jobs[jobId];if(!jj)return;
        jj[key]=jj[key]||[];
        const existing=jj[key].findIndex(i=>i.id===backup.id);
        if(existing>=0)jj[key][existing]=backup;else jj[key].push(backup);
        if(!EST){const t=invoiceTotals(jj);jj.invoiced=t?t.total:0;jj.paid=t?t.paid:0;}
        await writeJob(jj);render();toast((EST?'Estimate':'Invoice')+' restored');
      };
      UNDO.push(restore);
      toast((EST?'Estimate':'Invoice')+' deleted','undo',restore);
    };
  }
}
