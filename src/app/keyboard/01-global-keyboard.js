// Global keyboard shortcuts
// Generated from src/app/09-settings-access-command-voice.js.
// ══ Global keyboard ══
let KBD_BUFFER='';let KBD_BUFFER_T=null;
function onKey(e){
  // Skip if a modal command palette is open (handled separately)
  if(CMD.open){
    if(e.key==='Escape'){e.preventDefault();hideCommandPalette();return}
    if(e.key==='ArrowDown'){e.preventDefault();CMD.idx=Math.min(CMD.idx+1,Math.max(0,countCmdVisible()-1));renderCmd();const inp=document.getElementById('cmd-input');if(inp){inp.focus();inp.setSelectionRange(inp.value.length,inp.value.length)}return}
    if(e.key==='ArrowUp'){e.preventDefault();CMD.idx=Math.max(0,CMD.idx-1);renderCmd();const inp=document.getElementById('cmd-input');if(inp){inp.focus();inp.setSelectionRange(inp.value.length,inp.value.length)}return}
    if(e.key==='Enter'){e.preventDefault();runCmd();return}
    return;
  }
  // Cmd/Ctrl+K opens palette regardless
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();showCommandPalette();return}
  // Cmd/Ctrl+Z undo
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!e.shiftKey){
    if(!isTyping(e)){e.preventDefault();undoLast();return}
  }
  // ESC closes any modal
  if(e.key==='Escape'){
    if($('modal-root').innerHTML){closeModal();return}
    if($('fs-root').innerHTML){$('fs-root').innerHTML='';return}
  }
  // Don't trigger single-letter shortcuts while typing
  if(isTyping(e))return;
  const k=e.key;
  if(OWNER_MODE){if(k==='?'){e.preventDefault();showShortcutsModal()}return}
  if(k==='/'){e.preventDefault();const s=document.getElementById('search-in');if(s){s.focus();s.select()}else{showCommandPalette()};return}
  if(k==='n'||k==='N'){e.preventDefault();showJobModal('add');return}
  if(k==='?'){e.preventDefault();showShortcutsModal();return}
  if(k==='b'||k==='B'){e.preventDefault();showNotificationsModal();return}
  // g + (d/j/s/m/r) go-to
  if(k==='g'||k==='G'){KBD_BUFFER='g';clearTimeout(KBD_BUFFER_T);KBD_BUFFER_T=setTimeout(()=>KBD_BUFFER='',1200);return}
  if(KBD_BUFFER==='g'){
    const map={d:'dashboard',j:'jobs',s:'schedule',i:'invoices',m:'map',r:'reports',a:'activity',t:'team'};
    const target=map[k.toLowerCase()];
    if(target){
      KBD_BUFFER='';clearTimeout(KBD_BUFFER_T);e.preventDefault();
      if(!canOpenView(target)){toast(target==='reports'?'Reports are manager/owner only':'Owner-only','');return}
      S.view=target;S.detail=null;render();
    }
  }
}
function isTyping(e){
  const t=e.target;
  if(!t)return false;
  const tag=(t.tagName||'').toLowerCase();
  if(tag==='input'||tag==='textarea'||tag==='select')return true;
  if(t.isContentEditable)return true;
  return false;
}
function countCmdVisible(){
  const groups={action:0,view:0,job:0};
  CMD.items.forEach(it=>groups[it.type]++);
  return groups.action+groups.view+Math.min(20,groups.job);
}
