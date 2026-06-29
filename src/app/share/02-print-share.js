// Print summary and native/share fallback
// Generated from src/app/07-modals-jobs-share.js.
// ══ Share / Print ══
function printJob(j){
  const w=window.open('','_blank');
  if(!w){toast('Pop-up blocked','');return}
  const photos=(j.photos||[]).map(p=>photoURL(p));
  w.document.write(`<!DOCTYPE html><html><head><title>${esc(j.name)} — Job Summary</title>
    <style>body{font-family:system-ui,sans-serif;max-width:800px;margin:30px auto;padding:0 20px;color:#0a1f18}
    h1{font-size:24px;margin:0 0 6px}h2{font-size:14px;text-transform:uppercase;color:#666;margin:24px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
    .meta{color:#666;margin-bottom:20px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:14px}
    .cell{background:#f5f5f5;padding:10px;border-radius:6px}.label{font-size:11px;color:#666;text-transform:uppercase;font-weight:700}
    img{max-width:200px;border-radius:8px;margin:4px}.pphotos{display:flex;flex-wrap:wrap}</style></head><body>
    <h1>${esc(j.name)}</h1>
    <div class="meta">${esc(j.address||'')} ${j.customerName?'· '+esc(j.customerName):''} ${j.customerPhone?'· '+esc(j.customerPhone):''}</div>
    <h2>Details</h2>
    <div class="grid">
      <div class="cell"><div class="label">Stage</div>${esc(jobStage(j))}</div>
      <div class="cell"><div class="label">Status</div>${esc(spLabel(j.status))}</div>
      <div class="cell"><div class="label">Type</div>${esc(j.type||'—')}</div>
      <div class="cell"><div class="label">Assigned</div>${esc(j.assigned||'—')}</div>
      <div class="cell"><div class="label">Start</div>${esc(j.startDate||'—')}</div>
      <div class="cell"><div class="label">Due</div>${esc(j.dueDate||'—')}</div>
      <div class="cell"><div class="label">Estimate</div>${money(j.value)}</div>
      <div class="cell"><div class="label">Balance</div>${money(jobBalance(j))}</div>
    </div>
    ${j.description?'<h2>Scope of Work</h2><p>'+esc(j.description).replace(/\n/g,'<br>')+'</p>':''}
    ${(j.tasks||[]).length?'<h2>Tasks</h2><ul>'+(j.tasks||[]).map(t=>'<li>'+(t.done?'☑ ':'☐ ')+esc(t.text)+(t.due?' (due '+esc(t.due)+')':'')+'</li>').join('')+'</ul>':''}
    ${photos.length?'<h2>Photos</h2><div class="pphotos">'+photos.map(p=>'<img src="'+p+'" />').join('')+'</div>':''}
    </body></html>`);
  w.document.close();
  setTimeout(()=>w.print(),500);
}

async function shareJob(j){
  const text=`${j.name}\n${j.address||''}\n${j.customerName?'Customer: '+j.customerName+'\n':''}Stage: ${jobStage(j)} · ${j.progress||0}% complete`;
  if(navigator.share){
    try{await navigator.share({title:j.name,text});return}catch(e){if(e.name==='AbortError')return}
  }
  try{await navigator.clipboard.writeText(text);toast('Copied to clipboard')}catch(e){alert(text)}
}
