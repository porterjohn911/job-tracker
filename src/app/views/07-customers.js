// Customers — a directory of your clients.
//
// Phase 1 derived every customer from the fields already stored on jobs.
// Phase 2 adds editable, team-synced customer RECORDS (stored in the company's
// `customers` node) that can exist without a job (prospects) and hold extra
// fields (notes, tags, preferred contact). Records are matched to jobs by
// identity aliases, and their values are overlaid on the derived data.
//
// Everything here is self-contained to the Customers tab: the only writes are
// to job.comms (via writeJob) and to the customers node (via saveCustomer),
// and the sync listener is attached from this tab — no other app code changes.

// ── Identity normalization (shared by jobs and saved records) ──
function normEmail(s){return (s||'').trim().toLowerCase()}
function normPhone(s){return (s||'').replace(/[^0-9]/g,'')}
function normName(s){return (s||'').trim().toLowerCase()}

// Stable identity for a job's customer: prefer email, then phone, then name.
function customerKey(j){
  const email=normEmail(j.customerEmail);
  if(email)return 'e:'+email;
  const phone=normPhone(j.customerPhone);
  if(phone.length>=7)return 'p:'+phone;
  const name=normName(j.customerName);
  if(name)return 'n:'+name;
  return '';
}

// Identity keys a saved record should match (its own fields + remembered aliases).
function customerAliasKeys(rec){
  const keys=[];const al=rec.aliases||{};
  (al.emails||[]).concat(rec.email?[rec.email]:[]).forEach(e=>{const v=normEmail(e);if(v)keys.push('e:'+v)});
  (al.phones||[]).concat(rec.phone?[rec.phone]:[]).forEach(p=>{const v=normPhone(p);if(v.length>=7)keys.push('p:'+v)});
  (al.names||[]).concat(rec.name?[rec.name]:[]).forEach(n=>{const v=normName(n);if(v)keys.push('n:'+v)});
  return keys;
}

// ── Data layer (localStorage cache + optional Firebase sync) ──
function custId(){return 'c_'+Date.now()+'_'+Math.random().toString(36).slice(2,8)}
function loadCustomersLocal(){try{S.customers=JSON.parse(localStorage.getItem(LS('customers'))||'{}')||{}}catch(e){S.customers={}}}
function saveCustomersLocal(){try{localStorage.setItem(LS('customers'),JSON.stringify(S.customers||{}))}catch(e){}}
// Attach the sync listener once, from within the tab, using the existing DB ref.
function wireCustomersData(){
  if(S._custWired)return;
  if(!S.customers)loadCustomersLocal();
  if(typeof DB!=='undefined'&&DB){
    S._custWired=true;
    try{DB.child('customers').on('value',s=>{S.customers=s.val()||{};saveCustomersLocal();if(S.view==='customers')render()})}catch(e){}
  }
}
async function saveCustomer(rec){
  rec.updatedAt=Date.now();rec.updatedBy=S.user||'';
  S.customers=S.customers||{};S.customers[rec.id]=rec;
  saveCustomersLocal();
  if(typeof DB!=='undefined'&&DB){try{await DB.child('customers/'+rec.id).set(rec)}catch(e){}}
  if(typeof logAct==='function'){try{await logAct('saved customer',rec.name||'')}catch(e){}}
}
async function deleteCustomer(id){
  if(!id)return;
  const rec=(S.customers||{})[id];
  if(S.customers)delete S.customers[id];
  saveCustomersLocal();
  if(typeof DB!=='undefined'&&DB){try{await DB.child('customers/'+id).remove()}catch(e){}}
  if(typeof logAct==='function'){try{await logAct('removed customer record',(rec&&rec.name)||'')}catch(e){}}
}
function mergeAliases(base,add){
  const a={emails:[],phones:[],names:[]};
  const push=(arr,v)=>{v=(v||'').trim();if(v&&arr.indexOf(v)<0)arr.push(v)};
  if(base){(base.emails||[]).forEach(v=>push(a.emails,v));(base.phones||[]).forEach(v=>push(a.phones,v));(base.names||[]).forEach(v=>push(a.names,v))}
  if(add){push(a.emails,add.email);push(a.phones,add.phone);push(a.names,add.name)}
  return a;
}

// ── Build the merged customer list (saved records ∪ job-derived) ──
function buildCustomers(){
  const saved=S.customers||{};
  const aliasToId={};
  Object.values(saved).forEach(rec=>{customerAliasKeys(rec).forEach(k=>{aliasToId[k]=rec.id})});
  const groups={};
  jobs().forEach(j=>{
    const k=customerKey(j);
    if(!k)return;
    const sid=aliasToId[k];
    const gid=sid?('s:'+sid):k;
    (groups[gid]=groups[gid]||{savedId:sid||null,key:sid?null:k,rows:[]}).rows.push(j);
  });
  // Saved records with no matching jobs (prospects) still appear.
  Object.values(saved).forEach(rec=>{const gid='s:'+rec.id;if(!groups[gid])groups[gid]={savedId:rec.id,key:null,rows:[]}});
  return Object.values(groups).map(g=>{
    const rec=g.savedId?saved[g.savedId]:null;
    const js=g.rows.slice().sort((a,b)=>(b.created||0)-(a.created||0));
    const pick=f=>{for(const j of js){const v=(j[f]||'').trim();if(v)return v}return ''};
    const dName=pick('customerName'),dEmail=pick('customerEmail'),dPhone=pick('customerPhone');
    const dAddr=pick('billingAddress')||pick('address');
    const name=(rec&&rec.name)||dName||dEmail||dPhone||'(Unnamed customer)';
    const email=(rec&&rec.email)||dEmail;
    const phone=(rec&&rec.phone)||dPhone;
    const address=(rec&&rec.address)||dAddr;
    let invoiced=0,paid=0;const statusCounts={};const comms=[];let lastActivity=rec?rec.updatedAt||0:0,photoCount=0;
    js.forEach(j=>{
      const t=(typeof invoiceTotals==='function')?invoiceTotals(j):null;
      invoiced+=t?t.total:Number(j.invoiced||0);
      paid+=t?t.paid:Number(j.paid||0);
      const st=j.status||'active';statusCounts[st]=(statusCounts[st]||0)+1;
      (j.comms||[]).forEach(cm=>comms.push({...cm,jobId:j.id,jobName:j.name}));
      photoCount+=(j.photos||[]).length;
      if((j.created||0)>lastActivity)lastActivity=j.created||0;
    });
    comms.sort((a,b)=>(b.time||0)-(a.time||0));
    if(comms[0]&&(comms[0].time||0)>lastActivity)lastActivity=comms[0].time;
    return {key:g.savedId?('s:'+g.savedId):g.key,savedId:g.savedId||null,saved:rec||null,isSaved:!!rec,
      name,email,phone,address,notes:(rec&&rec.notes)||'',tags:(rec&&rec.tags)||[],preferredContact:(rec&&rec.preferredContact)||'',
      jobs:js,jobCount:js.length,isRepeat:js.length>1,
      invoiced,paid,outstanding:Math.max(0,invoiced-paid),statusCounts,
      comms,commCount:comms.length,lastComm:comms[0]||null,photoCount,lastActivity};
  });
}

function custSortLabel(k){return{recent:'Recent',owed:'Owed',jobs:'Jobs',name:'Name'}[k]||'Recent'}

function renderCustomers(){
  if(S.custDetail)return renderCustomerDetail(S.custDetail);
  const all=buildCustomers();
  const q=(S.custSearch||'').trim().toLowerCase();
  let list=all.filter(c=>!q||(c.name+' '+c.email+' '+c.phone+' '+c.address+' '+(c.tags||[]).join(' ')).toLowerCase().includes(q));
  const sort=S.custSort||'recent';
  const sorters={
    recent:(a,b)=>b.lastActivity-a.lastActivity,
    owed:(a,b)=>b.outstanding-a.outstanding,
    jobs:(a,b)=>b.jobCount-a.jobCount,
    name:(a,b)=>a.name.localeCompare(b.name),
  };
  list=list.slice().sort(sorters[sort]||sorters.recent);
  const totalOutstanding=all.reduce((s,c)=>s+c.outstanding,0);
  const repeatCount=all.filter(c=>c.isRepeat).length;
  const sortChips=['recent','owed','jobs','name'].map(k=>
    `<button data-cust-sort="${k}" style="padding:6px 12px;border-radius:999px;border:1px solid var(--border);font-size:12px;font-weight:600;cursor:pointer;background:${sort===k?'var(--green-700)':'var(--surface)'};color:${sort===k?'#fff':'var(--text-2)'}">${custSortLabel(k)}</button>`
  ).join('');
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;font-weight:700">Client Directory</div>
        <div style="font-size:20px;font-weight:700;margin-top:2px">Customers</div>
      </div>
      <button class="btn-add" id="btn-cust-add" aria-label="Add customer">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
        Add Customer
      </button>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Customers</div><div class="kpi-value">${all.length}</div><div class="kpi-sub">${repeatCount} repeat</div></div>
      <div class="kpi-card"><div class="kpi-label">Repeat Clients</div><div class="kpi-value">${repeatCount}</div><div class="kpi-sub">${all.length?Math.round(repeatCount/all.length*100):0}% of customers</div></div>
      <div class="kpi-card accent"><div class="kpi-label">Owed to You</div><div class="kpi-value" style="color:${totalOutstanding>0?'var(--orange)':'var(--green-700)'}">${money2(totalOutstanding)}</div><div class="kpi-sub">across all customers</div></div>
    </div>
    <div style="margin:6px 0 12px">
      <input class="form-input" id="cust-search" value="${esc(S.custSearch||'')}" placeholder="Search name, phone, email, tag…" style="width:100%">
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">${sortChips}</div>
    </div>
    ${list.length===0?`<div class="section" style="text-align:center;padding:34px 20px">
        <p style="font-size:14px;color:var(--text-2);margin-bottom:4px">${all.length===0?'No customers yet.':'No customers match your search.'}</p>
        <p style="font-size:12.5px;color:var(--text-3)">${all.length===0?'Add a customer above, or add a name/phone/email to a job and they\'ll appear here automatically.':'Try a different name, phone, or email.'}</p>
      </div>`
    :`<div style="display:flex;flex-direction:column;gap:8px">${list.map(custCard).join('')}</div>`}
  `;
}

function custCard(c){
  const contact=[c.phone,c.email].filter(Boolean).join(' · ')||c.address||'No contact info';
  const tagChips=(c.tags||[]).slice(0,3).map(t=>`<span style="font-size:10px;font-weight:600;color:var(--text-2);background:var(--surface-3);padding:1px 6px;border-radius:999px">${esc(t)}</span>`).join(' ');
  return `<div data-cust="${esc(c.key)}" style="display:flex;align-items:center;gap:12px;padding:13px 14px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);cursor:pointer">
    <div class="activity-ava" style="width:38px;height:38px;font-size:14px;flex-shrink:0">${esc(initials(c.name))}</div>
    <div style="flex:1;min-width:0">
      <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.name)}${c.isRepeat?' <span style="font-size:10px;font-weight:700;color:var(--green-700);background:var(--green-100);padding:1px 6px;border-radius:999px;vertical-align:middle">REPEAT</span>':''}${tagChips?' '+tagChips:''}</div>
      <div style="font-size:12px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(contact)}</div>
      <div style="font-size:11.5px;color:var(--text-3);margin-top:2px">${c.jobCount} job${c.jobCount!==1?'s':''} · ${c.commCount} contact${c.commCount!==1?'s':''} logged</div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      ${c.outstanding>0?`<div style="font-weight:700;color:var(--orange)">${money2(c.outstanding)}</div><div style="font-size:10.5px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.05em">owed</div>`
        :`<div style="font-weight:700;color:var(--green-700)">Paid up</div>`}
    </div>
  </div>`;
}

function renderCustomerDetail(key){
  const c=buildCustomers().find(x=>x.key===key);
  if(!c){S.custDetail=null;return renderCustomers();}
  const telHref=c.phone?'tel:'+c.phone.replace(/[^0-9+]/g,''):'';
  const mapHref=c.address?'https://maps.google.com/?q='+encodeURIComponent(c.address):'';
  const contactBtns=[
    telHref?`<a href="${esc(telHref)}" style="flex:1;text-align:center;padding:9px;background:var(--green-100);color:var(--green-700);border-radius:var(--r-md);font-weight:600;font-size:13px;text-decoration:none">📞 Call</a>`:'',
    c.email?`<a href="mailto:${esc(c.email)}" style="flex:1;text-align:center;padding:9px;background:var(--green-100);color:var(--green-700);border-radius:var(--r-md);font-weight:600;font-size:13px;text-decoration:none">📧 Email</a>`:'',
    mapHref?`<a href="${esc(mapHref)}" target="_blank" rel="noopener" style="flex:1;text-align:center;padding:9px;background:var(--green-100);color:var(--green-700);border-radius:var(--r-md);font-weight:600;font-size:13px;text-decoration:none">📍 Map</a>`:'',
  ].filter(Boolean).join('');

  const photos=[];
  c.jobs.forEach(j=>(j.photos||[]).forEach(p=>{const u=photoURL(p);if(u)photos.push({url:u,jobId:j.id})}));
  const photoStrip=photos.slice(0,8).map(p=>
    `<img data-open="${esc(p.jobId)}" src="${esc(p.url)}" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:8px;flex-shrink:0;cursor:pointer;border:1px solid var(--border)">`
  ).join('');

  const jobRows=c.jobs.length?c.jobs.map(j=>{
    const t=(typeof invoiceTotals==='function')?invoiceTotals(j):null;
    const bal=t?t.balance:(Number(j.invoiced||0)-Number(j.paid||0));
    return `<div data-open="${esc(j.id)}" style="display:flex;align-items:center;gap:10px;padding:11px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);cursor:pointer">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(j.name||'Untitled job')}</div>
        <div style="font-size:11.5px;color:var(--text-3)">${esc(j.address||'No address')}${bal>0.005?' · '+money2(bal)+' due':''}</div>
      </div>
      <span class="status-pill ${spClass(j.status)}">${spLabel(j.status)}</span>
    </div>`;
  }).join(''):'<p style="font-size:12.5px;color:var(--text-3);padding:4px 0">No jobs yet — this is a saved prospect. Use "New Job" above to start one.</p>';

  const commIcon={call:'📞',text:'💬',email:'📧',meeting:'👥'};
  const commRows=c.comms.map(cm=>`<div class="comm-item">
      <div class="comm-icon ${esc(cm.type||'call')}">${commIcon[cm.type]||'📞'}</div>
      <div class="comm-body">
        <div class="comm-head"><div class="comm-type">${esc(cm.type||'note')}${cm.user?' · '+esc(cm.user):''}</div><div class="comm-time">${ago(cm.time)}</div></div>
        <div class="comm-text">${esc(cm.text||'')}</div>
        <div style="font-size:11px;color:var(--text-3);margin-top:3px">on ${esc(cm.jobName||'a job')}</div>
      </div>
    </div>`).join('');

  const jobOpts=c.jobs.map(j=>`<option value="${esc(j.id)}">${esc(j.name||'Untitled job')}</option>`).join('');
  const tagChips=(c.tags||[]).map(t=>`<span style="font-size:11px;font-weight:600;color:var(--text-2);background:var(--surface-3);padding:2px 8px;border-radius:999px">${esc(t)}</span>`).join(' ');

  return `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <button data-cust-back style="width:34px;height:34px;border-radius:50%;border:1px solid var(--border);background:var(--surface);cursor:pointer;display:flex;align-items:center;justify-content:center" aria-label="Back to customers">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:18px;height:18px"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
      </button>
      <div style="flex:1;min-width:0">
        <div style="font-size:19px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.name)}${c.isRepeat?' <span style="font-size:10px;font-weight:700;color:var(--green-700);background:var(--green-100);padding:1px 6px;border-radius:999px;vertical-align:middle">REPEAT</span>':''}</div>
        <div style="font-size:12px;color:var(--text-3)">${c.jobCount} job${c.jobCount!==1?'s':''}${c.isSaved?' · saved record':''}</div>
      </div>
      <button class="btn-sm" id="btn-cust-edit" data-cust-edit="${esc(c.key)}" style="background:var(--surface);border:1px solid var(--border-md);font-weight:600">Edit</button>
    </div>

    <div class="section" style="margin-bottom:10px">
      ${(c.phone||c.email||c.address)?`<div style="font-size:13px;color:var(--text-2);line-height:1.7;margin-bottom:${tagChips||c.preferredContact?'8':'10'}px">
        ${c.phone?`<div>📞 ${esc(c.phone)}</div>`:''}
        ${c.email?`<div>📧 ${esc(c.email)}</div>`:''}
        ${c.address?`<div>📍 ${esc(c.address)}</div>`:''}
        ${c.preferredContact?`<div style="color:var(--text-3);font-size:12px">Prefers: ${esc(c.preferredContact)}</div>`:''}
      </div>`:'<div style="font-size:13px;color:var(--text-3);margin-bottom:10px">No contact details on file.</div>'}
      ${tagChips?`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${tagChips}</div>`:''}
      ${c.notes?`<div style="font-size:12.5px;color:var(--text-2);background:var(--surface-3);border-radius:var(--r-md);padding:10px 12px;margin-bottom:10px;white-space:pre-wrap">${esc(c.notes)}</div>`:''}
      ${contactBtns?`<div style="display:flex;gap:8px">${contactBtns}</div>`:''}
    </div>

    <div class="kpi-grid" style="margin-bottom:10px">
      <div class="kpi-card"><div class="kpi-label">Invoiced</div><div class="kpi-value">${money2(c.invoiced)}</div><div class="kpi-sub">${money2(c.paid)} paid</div></div>
      <div class="kpi-card accent"><div class="kpi-label">Balance Due</div><div class="kpi-value" style="color:${c.outstanding>0?'var(--orange)':'var(--green-700)'}">${money2(c.outstanding)}</div><div class="kpi-sub">${c.outstanding>0?'awaiting payment':'all paid up'}</div></div>
      <div class="kpi-card"><div class="kpi-label">Contacts Logged</div><div class="kpi-value">${c.commCount}</div><div class="kpi-sub">${c.lastComm?ago(c.lastComm.time)+' ago':'none yet'}</div></div>
    </div>

    <div style="margin-bottom:10px"><button class="btn-add" id="btn-cust-newjob" style="width:100%;justify-content:center">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
      New Job for ${esc(c.name)}
    </button></div>

    ${photoStrip?`<div class="section" style="margin-bottom:10px">
      <div class="section-hd">Recent Photos <span>${c.photoCount}</span></div>
      <div style="display:flex;gap:8px;overflow-x:auto;padding:2px 0">${photoStrip}</div>
    </div>`:''}

    <div class="section" style="margin-bottom:10px">
      <div class="section-hd">Jobs <span>${c.jobCount}</span></div>
      <div style="display:flex;flex-direction:column;gap:8px">${jobRows}</div>
    </div>

    <div class="section">
      <div class="section-hd">Communication Log <span>${c.commCount}</span></div>
      <div class="comm-list">
        ${c.commCount===0?'<p style="font-size:13px;color:var(--text-3);padding:4px 0">No communications logged yet. Track every call, text, and email so the whole team can see it.</p>':commRows}
      </div>
      ${c.jobs.length?`<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:12px 14px;margin-top:10px">
        <div class="form-row">
          <div class="form-group" style="margin-bottom:8px"><label class="form-label">Type</label>
            <select class="form-select" id="cust-comm-type">
              <option value="call">📞 Phone Call</option>
              <option value="text">💬 Text Message</option>
              <option value="email">📧 Email</option>
              <option value="meeting">👥 In-Person Meeting</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:8px"><label class="form-label">On job</label>
            <select class="form-select" id="cust-comm-job">${jobOpts}</select>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:8px"><label class="form-label">Summary</label>
          <textarea class="form-textarea" id="cust-comm-text" placeholder="What was discussed?"></textarea>
        </div>
        <button class="btn-post" id="btn-cust-add-comm">Log Communication</button>
      </div>`:'<p style="font-size:12px;color:var(--text-3);margin-top:8px">Communications are logged against a job. Start a job for this customer to log calls and texts.</p>'}
    </div>
  `;
}

// Build the edit-form seed from a merged customer object (keeps job identities
// as aliases so the record keeps matching those jobs after edits).
function customerFormSeed(c){
  const emails=[],phones=[],names=[];
  (c.jobs||[]).forEach(j=>{if(j.customerEmail)emails.push(j.customerEmail);if(j.customerPhone)phones.push(j.customerPhone);if(j.customerName)names.push(j.customerName)});
  const base=(c.saved&&c.saved.aliases)||{};
  const aliases=mergeAliases({emails:(base.emails||[]).concat(emails),phones:(base.phones||[]).concat(phones),names:(base.names||[]).concat(names)},null);
  return {id:c.savedId||null,name:c.name==='(Unnamed customer)'?'':c.name,email:c.email,phone:c.phone,address:c.address,
    notes:c.notes||'',tags:c.tags||[],preferredContact:c.preferredContact||'',aliases,createdAt:c.saved&&c.saved.createdAt};
}

// The add/edit modal. Wires its own buttons (modals aren't part of render()).
function openCustomerForm(seed){
  seed=seed||{};
  const isEdit=!!seed.id;
  const pref=seed.preferredContact||'';
  const prefOpt=(v,l)=>`<option value="${v}" ${pref===v?'selected':''}>${l}</option>`;
  $('modal-root').innerHTML=`<div class="modal-bd" id="cf-bd" role="dialog" aria-modal="true" aria-label="Customer"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">${isEdit?'Edit Customer':'Add Customer'}</div><button class="modal-close" id="cf-close" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="cf-name" value="${esc(seed.name||'')}" placeholder="John &amp; Jane Smith"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Phone</label><input class="form-input" type="tel" id="cf-phone" value="${esc(seed.phone||'')}" placeholder="(555) 123-4567"></div>
        <div class="form-group"><label class="form-label">Email</label><input class="form-input" type="email" id="cf-email" value="${esc(seed.email||'')}" placeholder="customer@example.com"></div>
      </div>
      <div class="form-group"><label class="form-label">Address</label><input class="form-input" id="cf-address" value="${esc(seed.address||'')}" placeholder="123 Lake Dr, LaFollette TN"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Preferred contact</label><select class="form-select" id="cf-pref">${prefOpt('','No preference')}${prefOpt('call','Phone Call')}${prefOpt('text','Text')}${prefOpt('email','Email')}</select></div>
        <div class="form-group"><label class="form-label">Tags <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-3);font-size:11px">comma-separated</span></label><input class="form-input" id="cf-tags" value="${esc((seed.tags||[]).join(', '))}" placeholder="VIP, builder"></div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="cf-notes" placeholder="Anything the team should know about this customer…">${esc(seed.notes||'')}</textarea></div>
    </div>
    <div class="modal-foot">
      ${isEdit?`<button class="btn-delete" id="cf-del">Delete</button>`:''}
      <button class="btn-cancel" id="cf-cancel">Cancel</button>
      <button class="btn-save" id="cf-save">${isEdit?'Save':'Add Customer'}</button>
    </div>
  </div></div>`;
  $('cf-close').onclick=$('cf-cancel').onclick=closeModal;
  $('cf-bd').onclick=e=>{if(e.target===e.currentTarget)closeModal()};
  $('cf-save').onclick=async()=>{
    const name=$('cf-name').value.trim(),email=$('cf-email').value.trim(),phone=$('cf-phone').value.trim();
    if(!name&&!email&&!phone){toast('Add at least a name, phone, or email','');return}
    const rec={
      id:seed.id||custId(),
      name,email,phone,
      address:$('cf-address').value.trim(),
      notes:$('cf-notes').value.trim(),
      preferredContact:$('cf-pref').value,
      tags:$('cf-tags').value.split(',').map(s=>s.trim()).filter(Boolean),
      aliases:mergeAliases(seed.aliases,{email,phone,name}),
      createdAt:seed.createdAt||Date.now(),
    };
    await saveCustomer(rec);
    S.custDetail='s:'+rec.id;
    closeModal();render();toast('Customer saved');
  };
  if(isEdit){$('cf-del').onclick=async()=>{
    await deleteCustomer(seed.id);
    S.custDetail=null;closeModal();render();toast('Customer record removed');
  };}
}
