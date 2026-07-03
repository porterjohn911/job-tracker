// Invoice and estimate defaults plus editor launcher
// Generated from src/app/08-invoice-editor-print.js.
// ══ Invoice editor ══
let INV_DRAFT=null; // current draft being edited

// Auto-attach a job's Before/During/After photos to a new invoice, each
// captioned with its stage so whoever receives it knows what they're looking
// at. Ordered Before → During → After. Reads only job data — the editor, the
// printed invoice, and the emailed PDF already render inv.photos + captions.
function invoicePhotosFromJob(j){
  const label={before:'Before',during:'During',after:'After'};
  const out=[];
  ['before','during','after'].forEach(stage=>{
    (((j&&j.photos)||[])).forEach(p=>{
      if(!p||(p.cat||'')!==stage)return;
      const url=(typeof photoURL==='function')?photoURL(p):(typeof p==='string'?p:(p&&p.url)||'');
      if(!url)return;
      out.push({url,caption:p.caption?label[stage]+' — '+p.caption:label[stage]});
    });
  });
  return out;
}

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
    photos:invoicePhotosFromJob(j),
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
