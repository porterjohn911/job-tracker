// CSV export
// Generated from src/app/07-modals-jobs-share.js.
// ══ CSV export ══
function exportCSV(){
  const rows=[['Name','Customer','Phone','Email','Address','Status','Stage','Type','Assigned','Start','Due','Estimate','Invoiced','Paid','Balance','Progress','Created']];
  jobs().forEach(j=>{
    rows.push([j.name,j.customerName,j.customerPhone,j.customerEmail,j.address,j.status,jobStage(j),j.type,j.assigned,j.startDate,j.dueDate,j.value,j.invoiced,j.paid,jobBalance(j),(j.progress||0)+'%',j.created?new Date(j.created).toLocaleDateString():''].map(v=>v==null?'':String(v)));
  });
  const csv=rows.map(r=>r.map(c=>/[",\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='waterfront-jobs-'+dateKey(new Date())+'.csv';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  toast('Exported '+jobs().length+' jobs');
}
