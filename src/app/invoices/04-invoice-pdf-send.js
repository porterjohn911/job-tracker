// Invoice PDF creation and send modal
// Generated from src/app/04-invoices-email.js lines 573-814.
// ── Send PDF: jsPDF with real text → Web Share on mobile, Download + Gmail draft on desktop ──
// Image-only invoice PDFs are commonly flagged by mail scanners. Keep the
// invoice page text/vector based and only rasterize customer photos.
let _pdfLibsP=null;
function loadPDFLibs(){
  if(_pdfLibsP)return _pdfLibsP;
  function add(src){return new Promise((r,j)=>{const s=document.createElement('script');s.src=src;s.onload=r;s.onerror=()=>j(new Error('Failed to load '+src));document.head.appendChild(s)})}
  _pdfLibsP=Promise.resolve()
    .then(()=>(window.jspdf&&window.jspdf.jsPDF)?null:add('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'))
    .then(()=>({jsPDF:window.jspdf.jsPDF}));
  return _pdfLibsP;
}
async function urlToDataURL(url){
  if(!url)return null;if(/^data:/.test(url))return url;
  try{const r=await fetch(url,{mode:'cors'});const b=await r.blob();return await new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.readAsDataURL(b)})}catch(e){return null}
}
function _hex2rgb(h){h=String(h||'').replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h||'0',16);return [(n>>16)&255,(n>>8)&255,n&255]}
function _imgFmt(du){return /^data:image\/png/i.test(du)?'PNG':'JPEG'}
async function _pdfImageData(src){
  const du=await urlToDataURL(src);if(!du)return null;
  const img=new Image();
  await new Promise(r=>{img.onload=img.onerror=r;img.src=du;setTimeout(r,3000)});
  if(!img.width)return null;
  if(/^data:image\/svg/i.test(du)){
    const c=document.createElement('canvas');
    c.width=Math.max(1,img.width);c.height=Math.max(1,img.height);
    c.getContext('2d').drawImage(img,0,0);
    return {du:c.toDataURL('image/png'),fmt:'PNG',w:img.width,h:img.height};
  }
  return {du,fmt:_imgFmt(du),w:img.width,h:img.height};
}
async function buildInvoicePDFFile(j,inv,kind){
  kind=kind||'invoice';
  const EST=kind==='estimate';
  const {jsPDF}=await loadPDFLibs();
  const c=calcInvoice(inv);
  const co=COMPANY;
  const P=invTheme();
  const primary=_hex2rgb(P.primary),link=_hex2rgb(P.link),rule=_hex2rgb(P.rule);
  const dark=[10,31,24],mid=[61,99,88],muted=[122,168,152];
  const pdf=new jsPDF({unit:'pt',format:'letter',orientation:'portrait',compress:true});
  const pageW=pdf.internal.pageSize.getWidth(),pageH=pdf.internal.pageSize.getHeight();
  const ML=48,MR=48,contentW=pageW-ML-MR,bottom=pageH-56;
  const amtX=pageW-MR,qtyX=pageW-MR-118,descRight=qtyX-92;
  const setColor=rgb=>pdf.setTextColor(rgb[0],rgb[1],rgb[2]);
  let y=0;
  const ensure=h=>{if(y+h>bottom){pdf.addPage();y=56}};

  const headerTop=36,headerBottom=124;
  const logoFull=(typeof brandLogoFull==='function')?brandLogoFull():'';
  const logoSrc=(typeof getBrandLogoSrc==='function')?getBrandLogoSrc():'';
  try{
    const logo=await _pdfImageData(logoFull||logoSrc);
    if(logo){
      if(logoFull){
        const maxW=300,maxH=72,k=Math.min(maxW/logo.w,maxH/logo.h,1);
        const lw=logo.w*k,lh=logo.h*k;
        pdf.addImage(logo.du,logo.fmt,ML,headerTop,lw,lh);
        pdf.setFont('helvetica','normal');pdf.setFontSize(8.8);setColor(mid);
        const addr=[BIZ_ADDRESS,co.phone,co.email,co.website].filter(Boolean).join('\n');
        pdf.splitTextToSize(addr,contentW-lw-28).forEach((ln,i)=>pdf.text(ln,ML+lw+14,headerTop+14+i*12));
      }else{
        const lh=62,lw=lh*(logo.w/logo.h);
        pdf.addImage(logo.du,logo.fmt,ML,headerTop,lw,lh);
        pdf.setFont('helvetica','bold');pdf.setFontSize(20);setColor(primary);
        pdf.text(co.name||'Waterfront Solutions',ML+lw+14,headerTop+20);
        pdf.setFont('helvetica','bold');pdf.setFontSize(8.5);pdf.setTextColor(102,102,102);
        pdf.text(co.license?'Lic. '+co.license:'Construction & Waterfront Services',ML+lw+14,headerTop+34);
        pdf.setFont('helvetica','normal');pdf.setFontSize(8.8);pdf.setTextColor(85,85,85);
        const addr=[BIZ_ADDRESS,co.phone+(co.email?' · '+co.email:''),co.website].filter(Boolean).join('\n');
        pdf.splitTextToSize(addr,260).forEach((ln,i)=>pdf.text(ln,ML+lw+14,headerTop+49+i*12));
      }
    }else{
      pdf.setFont('helvetica','bold');pdf.setFontSize(20);setColor(primary);
      pdf.text(co.name||'Waterfront Solutions',ML,headerTop+20);
    }
  }catch(e){}
  pdf.setFont('helvetica','bold');pdf.setFontSize(36);setColor(primary);
  pdf.text(EST?'ESTIMATE':'INVOICE',amtX,headerTop+24,{align:'right'});
  pdf.setFont('helvetica','normal');pdf.setFontSize(10.5);setColor(mid);
  if(inv.number)pdf.text(String(inv.number),amtX,headerTop+43,{align:'right'});
  const stText=EST?(inv.status||'draft'):invoiceStatus(inv);
  pdf.setFont('helvetica','bold');pdf.setFontSize(8.8);
  let stFill=[241,245,249],stColor=[71,85,105];
  if(stText==='paid'||stText==='accepted'){stFill=[220,252,231];stColor=[22,101,52]}
  else if(stText==='overdue'||stText==='declined'){stFill=[254,226,226];stColor=[153,27,27]}
  else if(stText==='sent'){stFill=[254,243,199];stColor=[146,64,14]}
  pdf.setFillColor(stFill[0],stFill[1],stFill[2]);pdf.roundedRect(amtX-88,headerTop+52,88,18,9,9,'F');
  pdf.setTextColor(stColor[0],stColor[1],stColor[2]);pdf.text(String(stText).toUpperCase(),amtX-44,headerTop+64,{align:'center'});
  pdf.setDrawColor(rule[0],rule[1],rule[2]);pdf.setLineWidth(3);pdf.line(ML,headerBottom,pageW-MR,headerBottom);
  y=headerBottom+28;

  pdf.setFont('helvetica','bold');pdf.setFontSize(9);setColor(muted);
  pdf.text(EST?'PREPARED FOR':'BILL TO',ML,y);
  let billY=y+16;
  if(j.customerName){pdf.setFont('helvetica','bold');pdf.setFontSize(12);setColor(dark);pdf.text(String(j.customerName),ML,billY);billY+=15}
  pdf.setFont('helvetica','normal');pdf.setFontSize(10);setColor(mid);
  [(j.billingAddress||j.address),j.customerPhone,j.customerEmail].filter(Boolean).forEach(l=>{
    pdf.splitTextToSize(String(l),250).forEach(ln=>{pdf.text(ln,ML,billY);billY+=14});
  });
  const metaX=ML+contentW/2+12;
  pdf.setFont('helvetica','bold');pdf.setFontSize(9);setColor(muted);
  pdf.text('PROJECT',metaX,y);
  let metaY=y+16;
  if(j.name){pdf.setFont('helvetica','bold');pdf.setFontSize(12);setColor(dark);pdf.text(String(j.name),metaX,metaY);metaY+=15}
  pdf.setFont('helvetica','normal');pdf.setFontSize(10);setColor(mid);
  if(j.address){pdf.splitTextToSize(String(j.address),250).forEach(ln=>{pdf.text(ln,metaX,metaY);metaY+=14})}
  metaY+=8;
  pdf.setFont('helvetica','bold');pdf.setFontSize(9);setColor(muted);pdf.text(EST?'ESTIMATE DATE':'INVOICE DATE',metaX,metaY);metaY+=14;
  pdf.setFont('helvetica','normal');pdf.setFontSize(10);setColor(dark);pdf.text(fmtDate(inv.date)||'',metaX,metaY);metaY+=18;
  if(inv.dueDate){pdf.setFont('helvetica','bold');pdf.setFontSize(9);setColor(muted);pdf.text(EST?'VALID UNTIL':'DUE DATE',metaX,metaY);metaY+=14;pdf.setFont('helvetica','normal');pdf.setFontSize(10);setColor(dark);pdf.text(fmtDate(inv.dueDate),metaX,metaY);metaY+=14}
  y=Math.max(metaY,billY)+22;

  pdf.setFillColor(240,250,246);
  pdf.rect(ML,y,contentW,24,'F');
  pdf.setDrawColor(221,221,221);pdf.setLineWidth(0.7);pdf.line(ML,y,ML+contentW,y);pdf.line(ML,y+24,ML+contentW,y+24);
  pdf.setTextColor(102,102,102);pdf.setFont('helvetica','bold');pdf.setFontSize(9);
  pdf.text('DESCRIPTION',ML+10,y+16);
  pdf.text('QTY',qtyX-72,y+16,{align:'right'});
  pdf.text('RATE',qtyX,y+16,{align:'right'});
  pdf.text('AMOUNT',amtX,y+16,{align:'right'});
  y+=24;

  pdf.setFont('helvetica','normal');pdf.setFontSize(10.5);
  const items=inv.items||[];
  items.forEach((it,idx)=>{
    const amt=Number(it.qty||0)*Number(it.rate||0);
    const descLines=pdf.splitTextToSize(String(it.desc||''),descRight-(ML+10));
    const rowH=Math.max(22,descLines.length*13+9);
    ensure(rowH);
    setColor(dark);
    descLines.forEach((ln,i)=>pdf.text(ln,ML+10,y+15+i*13));
    setColor(mid);
    pdf.text(String(it.qty??''),qtyX-72,y+15,{align:'right'});
    pdf.text(money2(Number(it.rate||0)),qtyX,y+15,{align:'right'});
    pdf.setFont('helvetica','bold');setColor(dark);
    pdf.text(money2(amt),amtX,y+15,{align:'right'});
    pdf.setFont('helvetica','normal');
    y+=rowH;
    pdf.setDrawColor(238,243,241);pdf.setLineWidth(0.5);pdf.line(ML,y,ML+contentW,y);
  });
  if(!items.length){ensure(22);setColor(muted);pdf.text('No line items',ML+10,y+15);y+=22}

  ensure(120);
  y+=18;
  const totLabelX=amtX-300,totValX=amtX;
  const totRow=(label,val,o)=>{o=o||{};pdf.setFont('helvetica',o.bold?'bold':'normal');pdf.setFontSize(o.size||10.5);setColor(o.color||mid);pdf.text(label,totLabelX,y);setColor(o.valColor||o.color||dark);pdf.text(val,totValX,y,{align:'right'});y+=o.gap||16};
  totRow('Subtotal',money2(c.sub));
  totRow('Tax ('+Number(inv.taxRate||0)+'%)',money2(c.tax));
  pdf.setDrawColor(rule[0],rule[1],rule[2]);pdf.setLineWidth(1.2);pdf.line(totLabelX,y-4,totValX,y-4);y+=8;
  totRow('Total',money2(c.total),{bold:true,size:12,color:primary,valColor:primary});
  if(c.paid>0)totRow('Paid','-'+money2(c.paid));

  y+=8;ensure(52);
  const boxH=40,boxY=y;
  let boxLabel,boxVal,boxFill,boxText;
  if(EST){boxLabel='ESTIMATED TOTAL';boxVal=money2(c.total);boxFill=[230,247,241];boxText=[10,61,46]}
  else if(c.balance<=0.005){boxLabel='PAID IN FULL - THANK YOU';boxVal='';boxFill=[220,252,231];boxText=[22,101,52]}
  else{boxLabel='BALANCE DUE'+(inv.dueDate?' BY '+fmtDate(inv.dueDate).toUpperCase():'');boxVal=money2(c.balance);boxFill=[254,243,199];boxText=[146,64,14]}
  pdf.setFillColor(boxFill[0],boxFill[1],boxFill[2]);
  pdf.roundedRect(ML,boxY,contentW,boxH,6,6,'F');
  pdf.setTextColor(boxText[0],boxText[1],boxText[2]);
  pdf.setFont('helvetica','bold');pdf.setFontSize(9.5);
  pdf.text(boxLabel,ML+16,boxY+24);
  if(boxVal){pdf.setFontSize(18);pdf.text(boxVal,amtX-16,boxY+26,{align:'right'})}
  y=boxY+boxH+20;

  if(inv.notes){
    ensure(28);
    pdf.setFont('helvetica','bold');pdf.setFontSize(9);setColor(link);pdf.text('NOTES',ML,y);y+=14;
    pdf.setFont('helvetica','normal');pdf.setFontSize(10);setColor(mid);
    pdf.splitTextToSize(String(inv.notes),contentW).forEach(ln=>{ensure(13);pdf.text(ln,ML,y);y+=13});
    y+=8;
  }

  if(inv.terms){
    ensure(24);
    pdf.setDrawColor(230,240,235);pdf.setLineWidth(0.5);pdf.line(ML,y,ML+contentW,y);y+=12;
    pdf.setFont('helvetica','italic');pdf.setFontSize(8.5);setColor(muted);
    pdf.splitTextToSize(String(inv.terms),contentW).forEach(ln=>{ensure(11);pdf.text(ln,ML,y);y+=11});
  }

  const photos=(inv.photos||[]).filter(p=>p&&p.url);
  for(const ph of photos){
    const du=await urlToDataURL(ph.url);if(!du)continue;
    const img=new Image();await new Promise(r=>{img.onload=img.onerror=r;img.src=du;setTimeout(r,3000)});
    if(!img.width)continue;
    const maxW=pageW-72,maxH=pageH-120;let w=img.width,h=img.height;const k=Math.min(maxW/w,maxH/h,1);w*=k;h*=k;
    pdf.addPage();
    pdf.setFont('helvetica','bold');pdf.setFontSize(11);setColor(primary);
    pdf.text((kind==='estimate'?'Estimate':'Invoice')+' '+(inv.number||'')+' — Photos',36,40);
    pdf.addImage(du,_imgFmt(du),(pageW-w)/2,60,w,h);
    if(ph.caption){pdf.setFont('helvetica','normal');pdf.setFontSize(10);setColor(mid);pdf.text(String(ph.caption).slice(0,200),36,60+h+22,{maxWidth:pageW-72})}
  }

  const pageCount=pdf.internal.getNumberOfPages();
  for(let p=1;p<=pageCount;p++){
    pdf.setPage(p);
    const fy=pageH-30;
    pdf.setDrawColor(230,240,235);pdf.setLineWidth(0.5);pdf.line(ML,fy-14,ML+contentW,fy-14);
    pdf.setFont('helvetica','normal');pdf.setFontSize(8.5);setColor(muted);
    const bits=[co.name,co.phone,co.email,co.website].filter(Boolean).join('  ·  ');
    if(bits)pdf.text(bits,pageW/2,fy,{align:'center'});
    if(co.license)pdf.text('License #'+co.license,pageW/2,fy+11,{align:'center'});
    if(pageCount>1)pdf.text(p+' / '+pageCount,amtX,fy,{align:'right'});
  }
  const blob=pdf.output('blob');
  const filename=(EST?'Estimate':'Invoice')+'-'+(inv.number||'draft')+'.pdf';
  return new File([blob],filename,{type:'application/pdf'});
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
