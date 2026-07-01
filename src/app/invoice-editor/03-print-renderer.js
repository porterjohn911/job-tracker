// Printable invoice and estimate renderer
// Generated from src/app/08-invoice-editor-print.js.
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
