// Printable invoice and estimate renderer
// Generated from src/app/08-invoice-editor-print.js.
// ══ Printable invoice with company letterhead ══
function printInvoice(j,inv,kind){
  kind=kind||'invoice';const EST=kind==='estimate';
  const w=window.open('','_blank');
  if(!w){toast('Pop-up blocked — allow pop-ups to print','');return}
  const photoAppendix=(inv.photos||[]).filter(p=>p&&p.url).map((p,i)=>`
    <section class="photo-page">
      <div class="photo-page-hd">${EST?'Estimate':'Invoice'} ${esc(inv.number||'')} - Photo ${i+1}</div>
      <img src="${esc(p.url)}" alt="">
      ${p.caption?`<div class="photo-caption">${esc(p.caption)}</div>`:''}
    </section>`).join('');
  const printTools=`<div class="no-print print-bar">
      <button class="alt" onclick="window.close()">Close</button>
      <button onclick="window.print()">Print / Save PDF</button>
    </div>
    <style>
      .photo-page{page-break-before:always;break-before:page;min-height:calc(100vh - 64px);display:flex;flex-direction:column;align-items:center;justify-content:center;padding-top:24px}
      .photo-page-hd{align-self:flex-start;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#0a3d2e;margin-bottom:18px}
      .photo-page img{max-width:100%;max-height:82vh;object-fit:contain;border:1px solid #ddd}
      .photo-caption{align-self:flex-start;margin-top:12px;font-size:13px;color:#3d6358;line-height:1.5}
      @media print{body{margin:0;padding:18mm 16mm;max-width:none}.no-print{display:none}.photo-page{min-height:calc(100vh - 36mm)}}
      .print-bar{position:fixed;top:12px;right:12px;display:flex;gap:8px}
      .print-bar button{padding:8px 16px;background:#0a3d2e;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;font-family:Helvetica,sans-serif}
      .print-bar button.alt{background:#fff;color:#0a3d2e;border:1.5px solid #0a3d2e}
    </style>`;
  const html=buildInvoiceEmailHTML(j,inv,'',kind).replace(/<body([^>]*)>/,`<body$1>${printTools}`);
  w.document.write(html.replace('</body>',photoAppendix+'</body>'));
  w.document.close();
}
