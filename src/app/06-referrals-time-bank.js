// Referrals, time tracking, payroll, and bank import
// Generated from src/app.js lines 2775-3205.
// ══ Referrals — referred leads & payouts (per company) ══
function refStatusMeta(s){
  return ({new:{label:'New lead',pill:'sp-lead',col:'var(--gold)'},won:{label:'Won',pill:'sp-complete',col:'var(--green-600)'},lost:{label:'Lost',pill:'sp-hold',col:'var(--text-3)'}})[s]||{label:'New lead',pill:'sp-lead',col:'var(--gold)'};
}
function renderReferrals(){
  const all=Object.values(S.referrals).sort((a,b)=>(b.created||0)-(a.created||0));
  const total=all.length;
  const won=all.filter(r=>r.status==='won').length;
  const owed=all.filter(r=>r.payoutStatus!=='paid').reduce((s,r)=>s+Number(r.payout||0),0);
  const paid=all.filter(r=>r.payoutStatus==='paid').reduce((s,r)=>s+Number(r.payout||0),0);
  const f=S.refFilter||'all';
  const isOwed=r=>r.payoutStatus!=='paid'&&Number(r.payout||0)>0;
  const match=r=>f==='all'?true:f==='new'?r.status==='new':f==='won'?r.status==='won':f==='owed'?isOwed(r):f==='paid'?r.payoutStatus==='paid':true;
  const shown=all.filter(match);
  const cnt={all:total,new:all.filter(r=>r.status==='new').length,won:won,owed:all.filter(isOwed).length,paid:all.filter(r=>r.payoutStatus==='paid').length};
  const chips=[['all','All'],['new','New'],['won','Won'],['owed','Owed'],['paid','Paid']];
  const rows=shown.map(r=>{
    const m=refStatusMeta(r.status);
    const job=r.jobId&&S.jobs[r.jobId]?S.jobs[r.jobId]:null;
    const meta=[r.dateReferred?fmtDate(r.dateReferred):'',job?'Job: '+esc(job.name):'',r.referrerPhone?esc(r.referrerPhone):'',r.dealValue?money(r.dealValue)+' deal':''].filter(Boolean).join(' · ');
    const payoutCol=Number(r.payout||0)>0?(r.payoutStatus==='paid'?'var(--green-700)':'var(--orange)'):'var(--text-3)';
    return `<div class="invoice-row" data-ref-open="${esc(r.id)}" style="border-left-color:${m.col}">
      <div class="invoice-row-main">
        <div class="invoice-num">${esc(r.referrer||'—')} <span style="color:var(--text-3);font-weight:500">referred</span> ${esc(r.lead||'—')}</div>
        ${meta?`<div class="invoice-meta">${meta}</div>`:''}
        <div style="margin-top:6px"><span class="status-pill ${m.pill}">${m.label}</span></div>
      </div>
      <div class="invoice-row-amt">
        <div style="font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;font-weight:700">Payout</div>
        <div style="font-weight:800;font-size:15px;color:${payoutCol}">${Number(r.payout||0)>0?money(r.payout):'—'}</div>
        ${Number(r.payout||0)>0?`<span class="badge ${r.payoutStatus==='paid'?'':'danger'}" style="margin-top:4px">${r.payoutStatus==='paid'?'Paid'+(r.paidAt?' '+fmtShort(r.paidAt):''):'Owed'}</span>`:''}
        ${isOwed(r)?`<div><button class="btn-mini" data-ref-paid="${esc(r.id)}" style="margin-top:7px">Mark paid</button></div>`:''}
      </div>
    </div>`;
  }).join('');
  const giftIcon='<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"/></svg>';
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;font-weight:700">Referrals</div>
        <div style="font-size:20px;font-weight:700;margin-top:2px">Referred leads &amp; payouts</div>
      </div>
      <button class="btn-add" id="btn-add-ref"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>New Referral</button>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card accent"><div class="kpi-label">Payouts Owed</div><div class="kpi-value">${money(owed)}</div><div class="kpi-sub">to referrers</div></div>
      <div class="kpi-card"><div class="kpi-label">Paid Out</div><div class="kpi-value">${money(paid)}</div><div class="kpi-sub">all-time</div></div>
      <div class="kpi-card"><div class="kpi-label">Referrals</div><div class="kpi-value">${total}</div><div class="kpi-sub">${won} won</div></div>
      <div class="kpi-card"><div class="kpi-label">Conversion</div><div class="kpi-value">${total>0?Math.round(won/total*100):0}%</div><div class="kpi-sub">leads → won</div></div>
    </div>
    <div class="filter-row" style="margin-bottom:14px">
      ${chips.map(([k,l])=>`<div class="filter-chip ${f===k?'active':''}" data-ref-filter="${k}">${l} ${cnt[k]}</div>`).join('')}
    </div>
    ${shown.length===0?`<div class="empty"><div class="empty-icon">${giftIcon}</div><h3>${total===0?'No referrals yet':'No matches'}</h3><p>${total===0?'Track who sent you leads and what you owe them.':'Try a different filter.'}</p>${total===0?'<button class="btn-add" id="btn-add-ref2" style="margin:0 auto">+ Add Referral</button>':''}</div>`:`<div style="display:flex;flex-direction:column;gap:8px">${rows}</div>`}
  `;
}
function showReferralModal(mode,ref){
  const r=ref||{};
  const sel=(v,cur)=>v===cur?'selected':'';
  const jobOpts=Object.values(S.jobs).sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map(j=>`<option value="${esc(j.id)}" ${r.jobId===j.id?'selected':''}>${esc(j.name)}</option>`).join('');
  $('modal-root').innerHTML=`<div class="modal-bd" id="mbd" role="dialog" aria-modal="true" aria-label="Referral"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">${mode==='add'?'New Referral':'Edit Referral'}</div><button class="modal-close" id="mc" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Referred by (referrer)</label><input class="form-input" id="rf-referrer" value="${esc(r.referrer||'')}" placeholder="Who sent you this lead?"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Referrer phone</label><input class="form-input" type="tel" id="rf-phone" value="${esc(r.referrerPhone||'')}"></div>
        <div class="form-group"><label class="form-label">Referrer email</label><input class="form-input" type="email" id="rf-email" value="${esc(r.referrerEmail||'')}"></div>
      </div>
      <div class="form-group"><label class="form-label">Referred lead / customer</label><input class="form-input" id="rf-lead" value="${esc(r.lead||'')}" placeholder="Name of the new lead"></div>
      <div class="form-group"><label class="form-label">Linked job (optional)</label><select class="form-select" id="rf-job"><option value="">— None —</option>${jobOpts}</select></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Status</label><select class="form-select" id="rf-status"><option value="new" ${sel('new',r.status||'new')}>New lead</option><option value="won" ${sel('won',r.status)}>Won</option><option value="lost" ${sel('lost',r.status)}>Lost</option></select></div>
        <div class="form-group"><label class="form-label">Date referred</label><input class="form-input" type="date" id="rf-date" value="${esc(r.dateReferred||dateKey(new Date()))}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Deal value</label><input class="form-input" type="number" step="0.01" id="rf-deal" value="${esc(r.dealValue||'')}" placeholder="0"></div>
        <div class="form-group"><label class="form-label">Referral payout</label><input class="form-input" type="number" step="0.01" id="rf-payout" value="${esc(r.payout||'')}" placeholder="0"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Payout status</label><select class="form-select" id="rf-pstatus"><option value="pending" ${sel('pending',r.payoutStatus||'pending')}>Pending</option><option value="paid" ${sel('paid',r.payoutStatus)}>Paid</option></select></div>
        <div class="form-group"><label class="form-label">Date paid</label><input class="form-input" type="date" id="rf-paid" value="${esc(r.paidAt||'')}"></div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="rf-notes">${esc(r.notes||'')}</textarea></div>
    </div>
    <div class="modal-foot">${mode==='edit'?'<button class="btn-cancel" id="rf-del" style="color:var(--red);margin-right:auto">Delete</button>':''}<button class="btn-cancel" id="btn-cx">Cancel</button><button class="btn-save" id="rf-save">Save</button></div>
  </div></div>`;
  $('mc').onclick=$('btn-cx').onclick=closeModal;
  $('mbd').onclick=e=>{if(e.target===e.currentTarget)closeModal()};
  if(mode==='edit'){const d=$('rf-del');if(d)d.onclick=async()=>{if(confirm('Delete this referral?')){await deleteReferralDB(r.id);closeModal();render();toast('Referral deleted')}}}
  $('rf-save').onclick=async()=>{
    const rec={
      id:r.id||('r_'+Date.now()+'_'+Math.random().toString(36).slice(2,6)),
      created:r.created||Date.now(),
      referrer:$('rf-referrer').value.trim(),
      referrerPhone:$('rf-phone').value.trim(),
      referrerEmail:$('rf-email').value.trim(),
      lead:$('rf-lead').value.trim(),
      jobId:$('rf-job').value||'',
      status:$('rf-status').value,
      dateReferred:$('rf-date').value,
      dealValue:$('rf-deal').value,
      payout:$('rf-payout').value,
      payoutStatus:$('rf-pstatus').value,
      paidAt:$('rf-paid').value,
      notes:$('rf-notes').value.trim(),
    };
    if(!rec.referrer&&!rec.lead){toast('Add a referrer or lead name','');return}
    if(rec.payoutStatus==='paid'&&!rec.paidAt)rec.paidAt=dateKey(new Date());
    await writeReferral(rec);
    await logAct((mode==='add'?'added a referral from ':'updated referral from ')+(rec.referrer||'someone'),rec.lead||'');
    closeModal();render();toast(mode==='add'?'Referral added':'Referral saved');
  };
}
function renderTeam(){
  const showPay=canSeeFinancials();
  return`<div class="member-add">
    <input id="member-in" placeholder="Add team member name…">
    <button class="btn-save" id="btn-add-member">Add</button>
  </div>
  <div class="member-list">${S.members.map((m,i)=>`<div class="member-row"><div class="member-ava">${initials(m)}</div><div class="member-name">${esc(m)}</div>${showPay?`<div class="tt-rate"><span>$</span><input class="tt-rate-in" type="number" inputmode="decimal" min="0" step="0.5" data-rate-member="${esc(m)}" value="${rateOf(m)||''}" placeholder="0" aria-label="Hourly rate for ${esc(m)}"><span>/hr</span></div>`:''}<button class="btn-remove" data-rm="${i}">Remove</button></div>`).join('')}</div>
  ${S.members.length&&showPay?`<div class="tt-hint" style="margin-top:10px">Set each person’s hourly pay rate to calculate actual labor cost per job on the Time tab.</div>`:''}
  <div class="team-info-card">
    <strong>Team sharing:</strong><br>
    ${DB?'✅ Firebase connected — all devices share the same data in real time.':'⚠️ Not connected. Each phone saves its own data. Tap <strong>Connect team →</strong> above to enable live sharing.'}
  </div>`;
}

function renderTime(){
  if(!S.members.length){
    return `<div class="tt-empty" style="padding:44px 16px">
      <p style="font-size:14px;color:var(--text-2);margin-bottom:18px;line-height:1.6">Add your team members first, then you can clock them in and out and track hours.</p>
      <button class="btn-save" id="tt-goto-team">Go to Team →</button>
    </div>`;
  }
  const all=timeList();
  const active=all.filter(t=>!t.end).sort((a,b)=>a.start-b.start);
  const today=dateKey(new Date());
  const ws=weekStart();
  const todayMs=all.filter(t=>dateKey(t.start)===today).reduce((s,t)=>s+entryDur(t),0);
  const weekMs=all.filter(t=>t.start>=ws).reduce((s,t)=>s+entryDur(t),0);
  const defMember=S.members.includes(S.user)?S.user:S.members[0];
  const mOpts=S.members.map(m=>`<option value="${esc(m)}" ${m===defMember?'selected':''}>${esc(m)}</option>`).join('');
  const jOpts=jobs().map(j=>`<option value="${esc(j.id)}">${esc(j.name)}</option>`).join('');

  const completed=all.filter(t=>t.end).sort((a,b)=>b.start-a.start);
  const groups={};
  completed.forEach(t=>{const k=dateKey(t.start);(groups[k]=groups[k]||[]).push(t)});
  const dayKeys=Object.keys(groups).sort((a,b)=>b.localeCompare(a)).slice(0,30);

  const activeHtml=active.length?active.map(t=>{
    const jn=t.job&&S.jobs[t.job]?S.jobs[t.job].name:'';
    const meta=['Since '+fmtClockT(t.start),jn,t.note].filter(Boolean).join(' · ');
    return `<div class="tt-active">
      <div class="member-ava">${initials(t.member)}</div>
      <div class="tt-active-body"><div class="tt-active-name">${esc(t.member)}</div><div class="tt-active-meta">${esc(meta)}</div></div>
      <div class="tt-timer" data-tick-start="${t.start}">${fmtHMS(Date.now()-t.start)}</div>
      <button class="tt-btn-out" data-clock-out="${esc(t.id)}">Clock Out</button>
    </div>`;
  }).join(''):`<div class="tt-empty">No one is on the clock right now.</div>`;

  const logHtml=dayKeys.length?dayKeys.map(k=>{
    const rows=groups[k];
    const dayTotal=rows.reduce((s,t)=>s+entryDur(t),0);
    const label=new Date(k+'T00:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
    return `<div class="tt-day"><div class="tt-day-hd"><span class="tt-day-date">${k===today?'Today':esc(label)}</span><span class="tt-day-total">${fmtHM(dayTotal)}</span></div>${
      rows.map(t=>{
        const jn=t.job&&S.jobs[t.job]?S.jobs[t.job].name:'';
        const meta=[fmtClockT(t.start)+' – '+fmtClockT(t.end),jn,t.note].filter(Boolean).join(' · ');
        return `<div class="tt-row">
          <div class="member-ava">${initials(t.member)}</div>
          <div class="tt-row-body"><div class="tt-row-top"><span class="tt-row-name">${esc(t.member)}</span><span class="tt-row-dur">${fmtHM(entryDur(t))}</span></div><div class="tt-row-meta">${esc(meta)}</div></div>
          <button class="tt-icon" data-time-edit="${esc(t.id)}" title="Edit" aria-label="Edit entry">✎</button>
          <button class="tt-icon" data-time-del="${esc(t.id)}" title="Delete" aria-label="Delete entry">✕</button>
        </div>`;
      }).join('')
    }</div>`;
  }).join(''):`<div class="tt-empty">No completed time entries yet.</div>`;

  const showPay=canSeeFinancials();
  const anyRates=showPay&&S.members.some(m=>rateOf(m)>0);
  const lb=laborByJob();
  const laborRows=Object.keys(lb).map(k=>({k,name:k?(S.jobs[k]?S.jobs[k].name:'(deleted job)'):'General / no job',ms:lb[k].ms,cost:lb[k].cost,active:lb[k].active})).filter(r=>r.ms>0).sort((a,b)=>showPay?((b.cost-a.cost)||(b.ms-a.ms)):(b.ms-a.ms));
  const laborHtml=laborRows.length?laborRows.map(r=>{
    const clickable=r.k&&S.jobs[r.k];
    return `<div class="tt-job"${clickable?` data-labor-job="${esc(r.k)}"`:''}>
      <div class="tt-job-body"><div class="tt-job-name">${esc(r.name)}${r.active?` <span class="tt-live">● ${r.active} on the clock</span>`:''}</div><div class="tt-job-sub">${fmtHM(r.ms)} total${showPay&&!anyRates?' · set rates for cost':''}</div></div>
      <div class="tt-job-cost">${showPay?(anyRates?money(r.cost):'—'):fmtHM(r.ms)}</div>
    </div>`;
  }).join(''):`<div class="tt-empty">No labor logged to jobs yet.</div>`;

  return `
    <div class="tt-kpis">
      <div class="tt-kpi"><div class="tt-kpi-val">${active.length}</div><div class="tt-kpi-lbl">On the clock</div></div>
      <div class="tt-kpi"><div class="tt-kpi-val">${fmtHM(todayMs)}</div><div class="tt-kpi-lbl">Today</div></div>
      <div class="tt-kpi"><div class="tt-kpi-val">${fmtHM(weekMs)}</div><div class="tt-kpi-lbl">This week</div></div>
    </div>
    <div class="tt-card">
      <div class="tt-card-hd">Clock in</div>
      <div class="tt-field"><label>Team member</label><select id="tt-member">${mOpts}</select></div>
      <div class="tt-field"><label>Job (optional)</label><select id="tt-job"><option value="">— No job / general —</option>${jOpts}</select></div>
      <div class="tt-field"><label>Note (optional)</label><input id="tt-note" placeholder="e.g. framing the deck"></div>
      <button class="tt-clockin-btn" id="tt-clockin">Clock In</button>
    </div>
    ${(!gateOn()||canSeeAll(SESSION))?`<button class="tt-payroll-btn" id="tt-payroll" type="button"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>Export payroll for Gusto</button>`:''}
    <div class="section-hd">On the clock now</div>
    ${activeHtml}
    <div class="section-hd" style="margin-top:20px">${showPay?'Labor cost by job':'Labor hours by job'}</div>
    ${showPay&&!anyRates?`<div class="tt-hint">Set each person’s hourly rate on the Team tab to calculate labor cost.</div>`:''}
    ${laborHtml}
    <div class="section-hd" style="margin-top:20px">Time log <button class="btn-mini" id="tt-add-manual">+ Add entry</button></div>
    ${logHtml}
  `;
}

function showTimeModal(entry){
  if(OWNER_MODE){toast('Open a company to edit time','');return}
  if(!S.members.length){toast('Add team members first','');return}
  const add=!entry;
  const defMember=S.members.includes(S.user)?S.user:S.members[0];
  const t=entry||{member:defMember,job:'',note:'',start:Date.now(),end:Date.now()};
  const running=!add&&!t.end;
  const mOpts=S.members.map(m=>`<option value="${esc(m)}" ${t.member===m?'selected':''}>${esc(m)}</option>`).join('');
  const jOpts=jobs().map(j=>`<option value="${esc(j.id)}" ${t.job===j.id?'selected':''}>${esc(j.name)}</option>`).join('');
  $('modal-root').innerHTML=`<div class="modal-bd" id="mbd"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">${add?'Add Time Entry':'Edit Time Entry'}</div><button class="modal-close" id="mc"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Team member</label><select class="form-select" id="tm-member">${mOpts}</select></div>
      <div class="form-group"><label class="form-label">Job (optional)</label><select class="form-select" id="tm-job"><option value="">— No job / general —</option>${jOpts}</select></div>
      <div class="form-group"><label class="form-label">Note (optional)</label><input class="form-input" id="tm-note" value="${esc(t.note||'')}" placeholder="What was worked on"></div>
      <div class="form-group"><label class="form-label">Clock in</label><input class="form-input" type="datetime-local" id="tm-start" value="${dtLocalValue(t.start)}"></div>
      <div class="form-group" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="tm-running" ${running?'checked':''} style="width:auto"><label class="form-label" for="tm-running" style="margin:0">Still on the clock</label></div>
      <div class="form-group" id="tm-end-wrap" style="${running?'display:none':''}"><label class="form-label">Clock out</label><input class="form-input" type="datetime-local" id="tm-end" value="${dtLocalValue(t.end||Date.now())}"></div>
    </div>
    <div class="modal-foot">
      ${add?'':`<button class="btn-delete" id="tm-del">Delete</button>`}
      <button class="btn-cancel" id="btn-cx">Cancel</button>
      <button class="btn-save" id="tm-save">${add?'Add':'Save'}</button>
    </div>
  </div></div>`;
  $('mc').onclick=$('btn-cx').onclick=closeModal;
  $('mbd').onclick=e=>{if(e.target===e.currentTarget)closeModal()};
  $('tm-running').onchange=function(){$('tm-end-wrap').style.display=this.checked?'none':''};
  $('tm-save').onclick=async()=>{
    const member=$('tm-member').value;
    if(!member){toast('Pick a team member','');return}
    const start=dtLocalParse($('tm-start').value);
    if(!start){toast('Enter a valid clock-in time','');return}
    const stillRunning=$('tm-running').checked;
    let end=stillRunning?null:dtLocalParse($('tm-end').value);
    if(!stillRunning&&!end){toast('Enter a clock-out time','');return}
    if(end&&end<start){toast('Clock out must be after clock in','');return}
    const rec={id:t.id||tid(),member,job:$('tm-job').value||'',note:$('tm-note').value.trim(),start,end,by:t.by||S.user||'',created:t.created||Date.now()};
    await writeTimeEntry(rec);closeModal();render();toast(add?'Time entry added':'Time entry saved');
  };
  if(!add)$('tm-del').onclick=async()=>{
    if(!confirm('Delete this time entry?'))return;
    const backup=JSON.parse(JSON.stringify(t));
    await deleteTimeEntryDB(t.id);closeModal();render();
    const restore=async()=>{await writeTimeEntry(backup);render();toast('Entry restored')};
    UNDO.push(restore);toast('Entry deleted','undo',restore);
  };
}

// ── Payroll export (crew hours → Gusto) ──
// No live API: a static page can't hold Gusto's OAuth secret or call its API
// (CORS), so this produces a payroll-ready CSV / copyable table you enter into
// Gusto. Read-only — never alters time entries, invoices, or estimates.
let PAYROLL_RANGE=null;
function payrollData(fromKey,toKey){
  const within=t=>{const k=dateKey(t.start);return (!fromKey||k>=fromKey)&&(!toKey||k<=toKey)};
  const byMember={};
  timeList().forEach(t=>{
    if(!t.end)return;            // only completed sessions count toward payroll
    if(!within(t))return;
    const m=t.member||'(unassigned)';
    const e=byMember[m]||(byMember[m]={member:m,ms:0,days:{}});
    const d=entryDur(t);e.ms+=d;const k=dateKey(t.start);e.days[k]=(e.days[k]||0)+d;
  });
  const rows=Object.values(byMember).map(e=>{
    const hours=e.ms/3600000,rate=rateOf(e.member);
    return {member:e.member,hours,rate,gross:hours*rate,days:Object.keys(e.days).sort().map(k=>({date:k,hours:e.days[k]/3600000}))};
  }).sort((a,b)=>a.member.localeCompare(b.member));
  return {rows,totalHours:rows.reduce((s,r)=>s+r.hours,0),totalGross:rows.reduce((s,r)=>s+r.gross,0)};
}
function csvCell(s){s=String(s==null?'':s);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function payrollSummaryCSV(data,anyRates){
  const lines=[['Employee','Total Hours'].concat(anyRates?['Hourly Rate','Gross Pay']:[])];
  data.rows.forEach(r=>lines.push([r.member,r.hours.toFixed(2)].concat(anyRates?[r.rate?r.rate.toFixed(2):'',r.rate?r.gross.toFixed(2):'']:[])));
  return lines.map(r=>r.map(csvCell).join(',')).join('\r\n');
}
function payrollDailyCSV(data,anyRates){
  const lines=[['Employee','Date','Hours'].concat(anyRates?['Hourly Rate','Gross Pay']:[])];
  data.rows.forEach(r=>r.days.forEach(d=>lines.push([r.member,d.date,d.hours.toFixed(2)].concat(anyRates?[r.rate?r.rate.toFixed(2):'',r.rate?(d.hours*r.rate).toFixed(2):'']:[]))));
  return lines.map(r=>r.map(csvCell).join(',')).join('\r\n');
}
function payrollFileBase(fromKey,toKey){
  const co=((ACTIVE_CO&&ACTIVE_CO.label)||'company').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'');
  return 'Payroll-'+co+'-'+fromKey+'_to_'+toKey;
}
function showPayrollModal(){
  if(gateOn()&&!canSeeAll(SESSION)){toast('Only managers and owners can run payroll','');return}
  if(!S.members.length){toast('Add team members first','');return}
  const today=dateKey(new Date());
  const start=new Date();start.setDate(start.getDate()-13);
  const def=PAYROLL_RANGE||{from:dateKey(start),to:today};
  renderPayrollModal(def.from,def.to);
}
function renderPayrollModal(fromKey,toKey){
  PAYROLL_RANGE={from:fromKey,to:toKey};
  const data=payrollData(fromKey,toKey);
  const anyRates=S.members.some(m=>rateOf(m)>0)||data.rows.some(r=>r.rate>0);
  const cols=anyRates?4:2;
  const rowsHtml=data.rows.length?data.rows.map(r=>`<tr><td>${esc(r.member)}</td><td class="num">${r.hours.toFixed(2)}</td>${anyRates?`<td class="num">${r.rate?money2(r.rate):'—'}</td><td class="num">${r.rate?money2(r.gross):'—'}</td>`:''}</tr>`).join(''):`<tr><td colspan="${cols}" style="text-align:center;color:var(--text-3);padding:14px">No tracked hours in this range</td></tr>`;
  const dailyHtml=data.rows.length?data.rows.map(r=>`<div style="margin-top:10px"><div style="font-weight:600;font-size:12.5px;display:flex;justify-content:space-between"><span>${esc(r.member)}</span><span>${r.hours.toFixed(2)} h${r.rate?' · '+money2(r.gross):''}</span></div>${r.days.map(d=>`<div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--text-3);padding:1px 0 1px 8px"><span>${esc(fmtDate(d.date))}</span><span>${d.hours.toFixed(2)} h</span></div>`).join('')}</div>`).join(''):'<div class="tt-empty">No hours.</div>';
  $('modal-root').innerHTML=`<div class="modal-bd" id="mbd" role="dialog" aria-modal="true" aria-label="Payroll export"><div class="modal" style="max-width:640px"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Payroll Export — ${esc(ACTIVE_CO.label)}</div><button class="modal-close" id="mc" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      <p style="font-size:12.5px;color:var(--text-2);line-height:1.55;margin-bottom:12px">Total tracked crew hours for the pay period. Download the summary as CSV (or copy it) and enter the hours into Gusto when you run payroll. Read-only — it never changes time entries, invoices, or estimates.</p>
      <div class="form-row">
        <div class="form-group"><label class="form-label">From</label><input class="form-input" type="date" id="pr-from" value="${esc(fromKey)}"></div>
        <div class="form-group"><label class="form-label">To</label><input class="form-input" type="date" id="pr-to" value="${esc(toKey)}"></div>
      </div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table class="admin-table">
        <thead><tr><th>Employee</th><th class="num">Hours</th>${anyRates?'<th class="num">Rate</th><th class="num">Gross</th>':''}</tr></thead>
        <tbody>${rowsHtml}
          <tr class="total-row"><td>Total</td><td class="num">${data.totalHours.toFixed(2)}</td>${anyRates?`<td></td><td class="num">${money2(data.totalGross)}</td>`:''}</tr>
        </tbody></table></div>
      ${anyRates?'':'<div class="tt-hint" style="margin-top:10px">Set hourly rates on the Team tab to include gross pay.</div>'}
      <div class="section-hd" style="margin-top:16px">Daily breakdown</div>
      ${dailyHtml}
    </div>
    <div class="modal-foot">
      <button class="btn-cancel" id="btn-cx">Close</button>
      <button class="btn-sm" id="pr-copy" type="button">Copy summary</button>
      <button class="btn-sm" id="pr-daily" type="button">Daily CSV</button>
      <button class="btn-save" id="pr-csv" type="button">Download for Gusto</button>
    </div>
  </div></div>`;
  $('mc').onclick=$('btn-cx').onclick=()=>closeModal();
  $('mbd').onclick=e=>{if(e.target===e.currentTarget)closeModal()};
  $('pr-from').onchange=()=>renderPayrollModal($('pr-from').value,$('pr-to').value);
  $('pr-to').onchange=()=>renderPayrollModal($('pr-from').value,$('pr-to').value);
  $('pr-csv').onclick=()=>{downloadFile(payrollFileBase(fromKey,toKey)+'.csv',payrollSummaryCSV(data,anyRates),'text/csv;charset=utf-8');toast('Payroll CSV downloaded')};
  $('pr-daily').onclick=()=>{downloadFile(payrollFileBase(fromKey,toKey)+'-daily.csv',payrollDailyCSV(data,anyRates),'text/csv;charset=utf-8');toast('Daily CSV downloaded')};
  $('pr-copy').onclick=async()=>{
    const head=['Employee','Hours'].concat(anyRates?['Rate','Gross']:[]);
    const tsv=[head].concat(data.rows.map(r=>[r.member,r.hours.toFixed(2)].concat(anyRates?[r.rate?r.rate.toFixed(2):'',r.rate?r.gross.toFixed(2):'']:[]))).map(r=>r.join('\t')).join('\n');
    try{await navigator.clipboard.writeText(tsv);toast('Copied — paste into a sheet or Gusto')}catch(e){toast('Copy failed','')}
  };
}

// ── Banking: CSV/OFX import, categorize, cash flow (per company) ──
const BANK_CATS=['Income','Materials','Fuel / Travel','Subcontractor','Equipment','Payroll','Office / Admin','Insurance','Taxes / Fees','Bank / Transfer','Other'];
function pad2(n){return String(n).padStart(2,'0')}
function bankNormDate(s){s=String(s||'').trim();if(!s)return'';let m=s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);if(m)return m[1]+'-'+pad2(m[2])+'-'+pad2(m[3]);m=s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);if(m){let y=m[3];if(y.length===2)y='20'+y;return y+'-'+pad2(m[1])+'-'+pad2(m[2])}m=s.match(/^(\d{4})(\d{2})(\d{2})/);if(m)return m[1]+'-'+m[2]+'-'+m[3];const d=new Date(s);if(!isNaN(d))return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());return s}
function bankParseAmt(s){if(s==null)return 0;let str=String(s).trim();if(!str)return 0;const neg=/^\(.*\)$/.test(str);str=str.replace(/[()$,\s]/g,'');let n=parseFloat(str);if(isNaN(n))return 0;return neg?-Math.abs(n):n}
function bankParseCSV(text){const rows=[];let i=0,field='',row=[],inQ=false;text=String(text).replace(/\r\n/g,'\n').replace(/\r/g,'\n');while(i<text.length){const c=text[i];if(inQ){if(c==='"'){if(text[i+1]==='"'){field+='"';i+=2;continue}inQ=false;i++;continue}field+=c;i++;continue}if(c==='"'){inQ=true;i++;continue}if(c===','){row.push(field);field='';i++;continue}if(c==='\n'){row.push(field);rows.push(row);row=[];field='';i++;continue}field+=c;i++}if(field.length||row.length){row.push(field);rows.push(row)}return rows.filter(r=>r.some(x=>String(x).trim()!==''))}
function bankCSVToTxns(text){const rows=bankParseCSV(text);if(rows.length<2)return[];const H=rows[0].map(h=>String(h).trim().toLowerCase());const find=(...names)=>{for(const n of names){const i=H.indexOf(n);if(i>=0)return i}for(const n of names){const i=H.findIndex(h=>h.includes(n));if(i>=0)return i}return -1};const di=find('date','posted date','transaction date','post date'),dsc=find('description','name','payee','memo','details','transaction'),amt=find('amount','amt'),deb=find('debit','withdrawal','withdrawals','money out','paid out'),cred=find('credit','deposit','deposits','money in','paid in');const out=[];for(let r=1;r<rows.length;r++){const cells=rows[r];const dateRaw=di>=0?cells[di]:'';let description=(dsc>=0?(cells[dsc]||''):'').trim();let amount=0;if(amt>=0)amount=bankParseAmt(cells[amt]);else{const d=Math.abs(bankParseAmt(cells[deb]||'')),c=Math.abs(bankParseAmt(cells[cred]||''));amount=c-d}if(!description&&!amount&&!dateRaw)continue;out.push({date:bankNormDate(dateRaw),description:description||'(no description)',amount})}return out}
function bankOFXToTxns(text){const out=[];const blocks=String(text).split(/<STMTTRN>/i).slice(1);blocks.forEach(b=>{const get=t=>{const m=b.match(new RegExp('<'+t+'>([^<\\r\\n]*)','i'));return m?m[1].trim():''};const amount=parseFloat(get('TRNAMT'));if(isNaN(amount))return;out.push({date:bankNormDate(get('DTPOSTED')),description:(get('NAME')||get('MEMO')||'(no description)').trim(),amount})});return out}
function bankParse(text){return (/<OFX>/i.test(text)||/<STMTTRN>/i.test(text))?bankOFXToTxns(text):bankCSVToTxns(text)}
function bankAutoCat(desc,amount){const d=(desc||'').toLowerCase();if(amount>0)return'Income';const rules=[['Materials',/home ?depot|lowe'?s|menards|ace hardware|sherwin|84 lumber|ferguson|supply|building material|hardware|paint|concrete|lumber/],['Fuel / Travel',/shell|exxon|chevron|\bbp\b|marathon|fuel|gas station|speedway|circle k|pilot|love'?s|sunoco|valero|hotel|airline|uber|lyft/],['Subcontractor',/subcontract|\bsub\b|excavat|plumb|electric|drywall|roofing|hvac/],['Equipment',/rental|united rent|sunbelt|tool|equipment|caterpillar|bobcat|john deere/],['Payroll',/gusto|payroll|\badp\b|paychex|wage|direct dep/],['Insurance',/insurance|liberty mutual|state farm|geico|progressive|nationwide|policy|hiscox|next insurance/],['Taxes / Fees',/\birs\b|\btax\b|dept of revenue|franchise|permit|license fee|secretary of state|treasury/],['Bank / Transfer',/transfer|zelle|venmo|cash app|withdrawal|\batm\b|service charge|overdraft|interest charge|wire|bill pay/],['Office / Admin',/google|microsoft|adobe|verizon|at&t|comcast|t-mobile|office|staples|amazon|amzn|software|subscription|godaddy|dropbox|zoom/]];for(const[cat,re]of rules)if(re.test(d))return cat;return'Other'}
function txnList(){return Object.values(S.transactions||{})}
function bankKey(t){return (t.date||'')+'|'+(Number(t.amount)||0).toFixed(2)+'|'+String(t.description||'').slice(0,40).toLowerCase().replace(/\s+/g,' ').trim()}
function bankTotals(){const all=txnList();const inSum=all.filter(t=>Number(t.amount)>0).reduce((s,t)=>s+Number(t.amount),0);const outSum=all.filter(t=>Number(t.amount)<0).reduce((s,t)=>s+Math.abs(Number(t.amount)),0);return{inSum,outSum,net:inSum-outSum,count:all.length}}
async function writeTxn(t){S.transactions[t.id]=t;LOCAL.saveTransactions();if(DB)await DB.child('transactions/'+t.id).set(t).catch(()=>{})}
async function deleteTxnDB(id){delete S.transactions[id];LOCAL.saveTransactions();if(DB)await DB.child('transactions/'+id).remove().catch(()=>{})}
async function saveAllTxns(){LOCAL.saveTransactions();if(DB)await DB.child('transactions').set(S.transactions).catch(()=>{})}
function renderBank(){
  if(gateOn()&&!isOwnerRole(SESSION)) return `<div class="tt-empty" style="padding:40px 16px"><p style="font-size:14px;color:var(--text-2);line-height:1.6">Bank &amp; cash flow is owner-only.</p></div>`;
  const t=bankTotals();
  const all=txnList().slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const byCat={};all.forEach(x=>{if(Number(x.amount)<0){const c=x.category||'Other';byCat[c]=(byCat[c]||0)+Math.abs(Number(x.amount))}});
  const cats=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  const catOpts=c=>BANK_CATS.map(x=>`<option value="${esc(x)}" ${c===x?'selected':''}>${esc(x)}</option>`).join('');
  const jobOpts=jid=>`<option value="">— link job —</option>`+jobs().map(job=>`<option value="${esc(job.id)}" ${jid===job.id?'selected':''}>${esc(job.name)}</option>`).join('');
  const rows=all.map(x=>{const out=Number(x.amount)<0;return `<div class="bank-row" data-bank="${esc(x.id)}">
    <div class="bank-main"><div class="bank-desc">${esc(x.description||'')}</div><div class="bank-meta">${esc(fmtDate(x.date)||x.date||'')}${x.jobId&&S.jobs[x.jobId]?' · '+esc(S.jobs[x.jobId].name):''}</div></div>
    <select class="bank-cat" data-bank-cat="${esc(x.id)}">${catOpts(x.category||'Other')}</select>
    <select class="bank-job" data-bank-job="${esc(x.id)}">${jobOpts(x.jobId||'')}</select>
    <div class="bank-amt ${out?'out':'in'}">${out?'−':'+'}${money2(Math.abs(Number(x.amount)))}</div>
    <button class="tt-icon" data-bank-del="${esc(x.id)}" title="Delete" aria-label="Delete">✕</button>
  </div>`}).join('');
  return `
    <div class="tt-kpis">
      <div class="tt-kpi"><div class="tt-kpi-val" style="color:var(--green-700)">${money2(t.inSum)}</div><div class="tt-kpi-lbl">Money In</div></div>
      <div class="tt-kpi"><div class="tt-kpi-val" style="color:var(--orange)">${money2(t.outSum)}</div><div class="tt-kpi-lbl">Money Out</div></div>
      <div class="tt-kpi"><div class="tt-kpi-val" style="color:${t.net>=0?'var(--green-700)':'var(--red)'}">${money2(t.net)}</div><div class="tt-kpi-lbl">Net (profit)</div></div>
    </div>
    <div class="toolbar" style="margin-bottom:14px">
      <button class="btn-add" id="bank-import"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>Import CSV / OFX</button>
      ${all.length?`<button class="btn-mini" id="bank-clear" style="margin-left:auto">Clear all</button>`:''}
    </div>
    ${cats.length?`<div class="section-hd">Spending by category</div><div class="rcpt-cats" style="margin-bottom:16px">${cats.map(([c,v])=>`<span class="rcpt-cat-chip">${esc(c)} · ${money2(v)}</span>`).join('')}</div>`:''}
    <div class="section-hd">Transactions <span>${all.length}</span></div>
    ${all.length?`<div class="bank-list">${rows}</div>`:`<div class="tt-empty">No transactions yet. Tap <strong>Import CSV / OFX</strong> and upload a transaction file from your bank.</div>`}
  `;
}
function showBankImport(){
  if(gateOn()&&!isOwnerRole(SESSION)){toast('Owner-only','');return}
  $('modal-root').innerHTML=`<div class="modal-bd" id="mbd" role="dialog" aria-modal="true" aria-label="Import transactions"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Import Bank Transactions</div><button class="modal-close" id="mc" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      <p style="font-size:12.5px;color:var(--text-2);line-height:1.5;margin-bottom:12px">Download a <strong>CSV</strong> or <strong>OFX/QFX</strong> file of transactions from your bank or card, then upload it (or paste CSV text). New transactions are added and auto-categorized; duplicates are skipped.</p>
      <label class="photo-add-btn" style="aspect-ratio:auto;padding:14px;flex-direction:row;gap:8px;margin-bottom:10px">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
        <span id="bank-file-label">Choose CSV / OFX file</span>
        <input type="file" accept=".csv,.ofx,.qfx,text/csv,text/plain,application/x-ofx" id="bank-file" style="display:none">
      </label>
      <div class="form-group"><label class="form-label">…or paste CSV here</label><textarea class="form-textarea" id="bank-paste" style="font-family:monospace;font-size:12px;min-height:90px" placeholder="Date,Description,Amount&#10;2026-05-01,Home Depot,-152.34&#10;2026-05-03,Customer payment,1500.00"></textarea></div>
      <div id="bank-preview" style="font-size:12.5px;color:var(--text-3);min-height:18px"></div>
    </div>
    <div class="modal-foot"><button class="btn-cancel" id="btn-cx">Cancel</button><button class="btn-save" id="bank-do-import" disabled>Import</button></div>
  </div></div>`;
  $('mc').onclick=$('btn-cx').onclick=closeModal;$('mbd').onclick=e=>{if(e.target===e.currentTarget)closeModal()};
  let fresh=[];
  function preview(text){
    const parsed=bankParse(text)||[];
    const existing=new Set(txnList().map(bankKey));
    const seen=new Set();
    fresh=parsed.filter(p=>{const k=bankKey(p);if(existing.has(k)||seen.has(k))return false;seen.add(k);return true});
    $('bank-preview').innerHTML=parsed.length?`Found <strong>${parsed.length}</strong> · <strong>${fresh.length}</strong> new (duplicates skipped).`:'No transactions detected — check the file or format.';
    $('bank-do-import').disabled=fresh.length===0;
  }
  $('bank-file').onchange=function(){const f=this.files&&this.files[0];if(!f)return;$('bank-file-label').textContent=f.name;const r=new FileReader();r.onload=e=>{const ta=$('bank-paste');if(ta)ta.value='';preview(e.target.result)};r.readAsText(f)};
  $('bank-paste').oninput=function(){preview(this.value)};
  $('bank-do-import').onclick=async()=>{
    if(!fresh.length)return;
    S.transactions=S.transactions||{};
    // Include the row index so ids stay unique within a single import: Date.now()
    // is identical across this synchronous loop, which previously let two rows
    // collide on the same id and silently overwrite each other.
    fresh.forEach((p,idx)=>{const id='b_'+Date.now()+'_'+idx+'_'+Math.random().toString(36).slice(2,8);S.transactions[id]={id,date:p.date,description:p.description,amount:Number(p.amount)||0,category:bankAutoCat(p.description,Number(p.amount)||0),jobId:'',source:'import',key:bankKey(p),imported:Date.now()}});
    await saveAllTxns();await logAct('imported '+fresh.length+' bank transaction(s)','');closeModal();render();toast('Imported '+fresh.length+' transaction'+(fresh.length!==1?'s':''));
  };
}
