// Customer directory handlers. Additive: wires only the customer view's own
// elements plus the customers-node sync listener (attached from within the tab,
// so no shared boot code changes). Job links inside the view use data-open,
// which the existing global handler already wires.
function attachCustomerHandlers(){
  if(typeof wireCustomersData==='function')wireCustomersData();

  $('cust-search')?.addEventListener('input',e=>{S.custSearch=e.target.value;render()});
  document.querySelectorAll('[data-cust-sort]').forEach(b=>b.onclick=()=>{S.custSort=b.dataset.custSort;render()});
  document.querySelectorAll('[data-cust]').forEach(el=>el.onclick=()=>{S.custDetail=el.dataset.cust;render()});
  document.querySelector('[data-cust-back]')?.addEventListener('click',()=>{S.custDetail=null;render()});

  // Add a new customer (works even with no jobs yet — a prospect).
  $('btn-cust-add')?.addEventListener('click',()=>openCustomerForm({}));

  // Edit the current customer (creates a saved record from derived data if new).
  $('btn-cust-edit')?.addEventListener('click',e=>{
    const key=e.currentTarget.dataset.custEdit||S.custDetail;
    const c=(typeof buildCustomers==='function'?buildCustomers():[]).find(x=>x.key===key);
    if(c)openCustomerForm(customerFormSeed(c));
  });

  // New job pre-filled with this customer's details (reuses the job modal).
  $('btn-cust-newjob')?.addEventListener('click',()=>{
    const c=(typeof buildCustomers==='function'?buildCustomers():[]).find(x=>x.key===S.custDetail);
    if(!c)return;
    showJobModal('add',{customerName:c.name,customerPhone:c.phone,customerEmail:c.email,address:c.address,billingAddress:c.address});
  });

  // Log a communication onto the selected job (same shape as the job Comms tab).
  $('btn-cust-add-comm')?.addEventListener('click',async()=>{
    const text=($('cust-comm-text')?.value||'').trim();
    if(!text){toast('Add a summary','');return}
    const jobId=$('cust-comm-job')?.value;
    const j=jobId&&S.jobs[jobId];
    if(!j){toast('Pick a job to log this against','');return}
    const type=$('cust-comm-type')?.value||'call';
    j.comms=j.comms||[];
    j.comms.push({type,text,user:S.user,time:Date.now()});
    await writeJob(j);
    await logAct('logged a '+type,j.name);
    render();
    toast('Communication logged');
  });
}
