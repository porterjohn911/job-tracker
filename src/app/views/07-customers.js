// Customers — a directory derived from existing job records.
//
// This view adds NO new data model: it groups the jobs you already have by
// customer identity and aggregates contact info, financials, job/photo history,
// and communications. The only writes it makes are appending to an existing
// job's `comms` array via writeJob() — the same mechanism the job detail
// "Comms" tab already uses — so nothing else in the app is affected.

// Stable identity for a job's customer: prefer email, then phone, then name.
function customerKey(j){
  const email=(j.customerEmail||'').trim().toLowerCase();
  if(email)return 'e:'+email;
  const phone=(j.customerPhone||'').replace(/[^0-9]/g,'');
  if(phone.length>=7)return 'p:'+phone;
  const name=(j.customerName||'').trim().toLowerCase();
  if(name)return 'n:'+name;
  return ''; // no identifying info — not a customer we can group
}

// Build the aggregated customer list from jobs().
function buildCustomers(){
  const map={};
  jobs().forEach(j=>{
    const key=customerKey(j);
    if(!key)return;
    (map[key]=map[key]||{key,rows:[]}).rows.push(j);
  });
  return Object.values(map).map(c=>{
    // Most-recent job first, so the latest contact details win.
    const js=c.rows.slice().sort((a,b)=>(b.created||0)-(a.created||0));
    const pick=f=>{for(const j of js){const v=(j[f]||'').trim();if(v)return v}return ''};
    const name=pick('customerName');
    const email=pick('customerEmail');
    const phone=pick('customerPhone');
    const address=pick('billingAddress')||pick('address');
    let invoiced=0,paid=0;const statusCounts={};const comms=[];let lastActivity=0,photoCount=0;
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
    return {key:c.key,name:name||email||phone||'(Unnamed customer)',email,phone,address,
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
  let list=all.filter(c=>{
    if(!q)return true;
    return (c.name+' '+c.email+' '+c.phone+' '+c.address).toLowerCase().includes(q);
  });
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
    </div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Customers</div><div class="kpi-value">${all.length}</div><div class="kpi-sub">${repeatCount} repeat</div></div>
      <div class="kpi-card"><div class="kpi-label">Repeat Clients</div><div class="kpi-value">${repeatCount}</div><div class="kpi-sub">${all.length?Math.round(repeatCount/all.length*100):0}% of customers</div></div>
      <div class="kpi-card accent"><div class="kpi-label">Owed to You</div><div class="kpi-value" style="color:${totalOutstanding>0?'var(--orange)':'var(--green-700)'}">${money2(totalOutstanding)}</div><div class="kpi-sub">across all customers</div></div>
    </div>
    <div style="margin:6px 0 12px">
      <input class="form-input" id="cust-search" value="${esc(S.custSearch||'')}" placeholder="Search name, phone, email, address…" style="width:100%">
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">${sortChips}</div>
    </div>
    ${list.length===0?`<div class="section" style="text-align:center;padding:34px 20px">
        <p style="font-size:14px;color:var(--text-2);margin-bottom:4px">${all.length===0?'No customers yet.':'No customers match your search.'}</p>
        <p style="font-size:12.5px;color:var(--text-3)">${all.length===0?'Add a customer name, phone, or email to a job and they\'ll appear here automatically.':'Try a different name, phone, or email.'}</p>
      </div>`
    :`<div style="display:flex;flex-direction:column;gap:8px">${list.map(custCard).join('')}</div>`}
  `;
}

function custCard(c){
  const contact=[c.phone,c.email].filter(Boolean).join(' · ')||c.address||'No contact info';
  return `<div data-cust="${esc(c.key)}" style="display:flex;align-items:center;gap:12px;padding:13px 14px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);cursor:pointer">
    <div class="activity-ava" style="width:38px;height:38px;font-size:14px;flex-shrink:0">${esc(initials(c.name))}</div>
    <div style="flex:1;min-width:0">
      <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.name)}${c.isRepeat?' <span style="font-size:10px;font-weight:700;color:var(--green-700);background:var(--green-100);padding:1px 6px;border-radius:999px;vertical-align:middle">REPEAT</span>':''}</div>
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

  // Recent photos across all this customer's jobs (thumbnails link to the job).
  const photos=[];
  c.jobs.forEach(j=>(j.photos||[]).forEach(p=>{const u=photoURL(p);if(u)photos.push({url:u,jobId:j.id})}));
  const photoStrip=photos.slice(0,8).map(p=>
    `<img data-open="${esc(p.jobId)}" src="${esc(p.url)}" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:8px;flex-shrink:0;cursor:pointer;border:1px solid var(--border)">`
  ).join('');

  const jobRows=c.jobs.map(j=>{
    const t=(typeof invoiceTotals==='function')?invoiceTotals(j):null;
    const bal=t?t.balance:(Number(j.invoiced||0)-Number(j.paid||0));
    return `<div data-open="${esc(j.id)}" style="display:flex;align-items:center;gap:10px;padding:11px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);cursor:pointer">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(j.name||'Untitled job')}</div>
        <div style="font-size:11.5px;color:var(--text-3)">${esc(j.address||'No address')}${bal>0.005?' · '+money2(bal)+' due':''}</div>
      </div>
      <span class="status-pill ${spClass(j.status)}">${spLabel(j.status)}</span>
    </div>`;
  }).join('');

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

  return `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <button data-cust-back style="width:34px;height:34px;border-radius:50%;border:1px solid var(--border);background:var(--surface);cursor:pointer;display:flex;align-items:center;justify-content:center" aria-label="Back to customers">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:18px;height:18px"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
      </button>
      <div style="flex:1;min-width:0">
        <div style="font-size:19px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.name)}${c.isRepeat?' <span style="font-size:10px;font-weight:700;color:var(--green-700);background:var(--green-100);padding:1px 6px;border-radius:999px;vertical-align:middle">REPEAT</span>':''}</div>
        <div style="font-size:12px;color:var(--text-3)">${c.jobCount} job${c.jobCount!==1?'s':''} · customer since ${c.jobs.length?fmtDate(new Date(Math.min(...c.jobs.map(j=>j.created||Date.now()))).toISOString().slice(0,10)):'—'}</div>
      </div>
    </div>

    <div class="section" style="margin-bottom:10px">
      ${(c.phone||c.email||c.address)?`<div style="font-size:13px;color:var(--text-2);line-height:1.7;margin-bottom:10px">
        ${c.phone?`<div>📞 ${esc(c.phone)}</div>`:''}
        ${c.email?`<div>📧 ${esc(c.email)}</div>`:''}
        ${c.address?`<div>📍 ${esc(c.address)}</div>`:''}
      </div>`:'<div style="font-size:13px;color:var(--text-3);margin-bottom:10px">No contact details on file.</div>'}
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
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:12px 14px;margin-top:10px">
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
      </div>
    </div>
  `;
}
