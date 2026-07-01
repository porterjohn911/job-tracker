// Keyboard shortcuts modal
// Generated from src/app/09-settings-access-command-voice.js.
// ══ Keyboard shortcuts modal ══
function showShortcutsModal(){
  const rows=[
    ['Open command palette',['Ctrl','K'],['⌘','K']],
    ['New job',['N']],
    ['Search this view',['/'],],
    ['Go to Dashboard',['G','D']],
    ['Go to Jobs',['G','J']],
    ['Go to Schedule',['G','S']],
    ['Go to Invoices',['G','I']],
    ['Go to Map',['G','M']],
    ['Go to Reports',['G','R']],
    ['Notifications',['B']],
    ['Undo last action',['Ctrl','Z'],['⌘','Z']],
    ['Show this help',['?']],
    ['Close modal / palette',['ESC']],
  ];
  $('modal-root').innerHTML=`<div class="modal-bd" id="mbd" role="dialog" aria-label="Keyboard shortcuts" aria-modal="true"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Keyboard Shortcuts</div><button class="modal-close" id="mc" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      <p style="font-size:12.5px;color:var(--text-2);margin-bottom:14px;line-height:1.5">Speed up everyday actions. Shortcuts work anywhere except in text fields.</p>
      <div class="kbd-grid">
        ${rows.map(r=>`<div class="kbd-row"><div class="kbd-row-label">${esc(r[0])}</div><div class="kbd-keys">${r[1].map(k=>'<kbd>'+esc(k)+'</kbd>').join('')}</div></div>`).join('')}
      </div>
    </div>
  </div></div>`;
  $('mc').onclick=closeModal;
  $('mbd').onclick=e=>{if(e.target===e.currentTarget)closeModal()};
}
