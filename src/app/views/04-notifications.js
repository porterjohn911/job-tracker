// Notifications and unread badge
// Generated from src/app/05-owner-reports-map-notifications.js lines 508-585.
// ══ Notifications ══
function buildNotifications(){
  const out=[];
  const me=(S.user||'').toLowerCase();
  const all=jobs();
  // Tasks due / overdue assigned to me (or unassigned that I created)
  all.forEach(j=>{
    (j.tasks||[]).forEach((t,i)=>{
      if(t.done||!t.due)return;
      const d=daysUntil(t.due);
      if(d===null)return;
      const owner=(t.assigned||'').toLowerCase();
      const mine=me&&(owner===me||owner==='');
      if(!mine)return;
      if(d<0)out.push({type:'overdue',time:new Date(t.due+'T00:00:00').getTime(),text:`Task overdue: <strong>${esc(t.text)}</strong>`,sub:esc(j.name)+' · '+Math.abs(d)+'d late',jobId:j.id});
      else if(d<=2)out.push({type:'task',time:new Date(t.due+'T00:00:00').getTime(),text:`Task due ${d===0?'today':d===1?'tomorrow':'in '+d+' days'}: <strong>${esc(t.text)}</strong>`,sub:esc(j.name),jobId:j.id});
    });
  });
  // Recent activity on jobs assigned to me
  S.activity.slice(0,40).forEach(a=>{
    const job=Object.values(S.jobs).find(j=>j.name===a.job);
    if(!job)return;
    const mine=me&&(job.assigned||'').toLowerCase()===me;
    if(mine&&a.user&&a.user.toLowerCase()!==me){
      out.push({type:'activity',time:a.time,text:`<strong>${esc(a.user)}</strong> ${esc(a.action)}`,sub:esc(a.job||''),jobId:job.id});
    }
  });
  // Recent notes that mention me by name (case-insensitive substring)
  if(me){
    all.forEach(j=>{
      (j.notes||[]).forEach(n=>{
        if(!n.text||!n.user)return;
        if(n.user.toLowerCase()===me)return;
        if(n.text.toLowerCase().includes('@'+me)||n.text.toLowerCase().includes(me)&&n.text.includes('@')){
          out.push({type:'mention',time:n.time,text:`<strong>${esc(n.user)}</strong> mentioned you`,sub:esc(j.name)+' · '+esc(n.text).slice(0,60),jobId:j.id});
        }
      });
    });
  }
  return out.sort((a,b)=>b.time-a.time).slice(0,30);
}
function unreadCount(){return buildNotifications().filter(n=>n.time>S.notifReadAt).length}
function updateBellBadge(){
  const b=$('bell-badge');if(!b)return;
  const n=unreadCount();
  b.textContent=n>9?'9+':n;
  b.style.display=n>0?'flex':'none';
}
function showNotificationsModal(){
  const notifs=buildNotifications();
  const ICONS={overdue:'!',task:'○',activity:'•',mention:'@'};
  const body=notifs.length===0
    ? `<div class="notif-empty">🔕<br><br>You're all caught up.<br><span style="font-size:12px">Tasks assigned to you, mentions, and activity on your jobs will appear here.</span></div>`
    : '<div class="notif-list">'+notifs.map(n=>`<div class="notif-item ${n.time>S.notifReadAt?'unread':''}" data-open="${n.jobId}">
        <div class="notif-icon ${n.type}">${ICONS[n.type]||'•'}</div>
        <div class="notif-body"><div class="notif-text">${n.text}</div><div class="notif-meta">${n.sub} · ${ago(n.time)}</div></div>
        ${n.time>S.notifReadAt?'<div class="notif-dot"></div>':''}
      </div>`).join('')+'</div>';
  $('modal-root').innerHTML=`<div class="modal-bd" id="mbd"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Notifications ${notifs.length?'<span style="font-weight:400;color:var(--text-3);font-size:13px">· '+notifs.length+'</span>':''}</div>
      <div style="display:flex;gap:4px;align-items:center">${notifs.length?'<button class="notif-clear" id="notif-mark">Mark all read</button>':''}<button class="modal-close" id="mc"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    </div>
    <div class="modal-body" style="padding:0 20px 20px">${body}</div>
  </div></div>`;
  $('mc').onclick=closeModal;
  $('mbd').onclick=e=>{if(e.target===e.currentTarget)closeModal()};
  $('notif-mark')?.addEventListener('click',()=>{
    S.notifReadAt=Date.now();
    localStorage.setItem(LS('notif_read'),String(S.notifReadAt));
    closeModal();render();toast('Marked all as read');
  });
  document.querySelectorAll('.notif-item[data-open]').forEach(el=>el.onclick=()=>{
    S.notifReadAt=Math.max(S.notifReadAt,Date.now());
    localStorage.setItem(LS('notif_read'),String(S.notifReadAt));
    S.detail=el.dataset.open;S.view='jobs';S.detailTab='overview';closeModal();render();
  });
}

