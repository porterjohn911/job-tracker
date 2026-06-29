// Invoice email HTML/text/EML and download helpers
// Generated from src/app/04-invoices-email.js lines 223-433.
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

