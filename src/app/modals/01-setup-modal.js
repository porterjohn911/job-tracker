// Firebase/team setup modal
// Generated from src/app/07-modals-jobs-share.js.
function showSetupModal(){
  $('modal-root').innerHTML=`<div class="modal-bd" id="mbd"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Connect Your Team</div><button class="modal-close" id="mc"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      <p style="font-size:13.5px;color:var(--text-2);line-height:1.7;margin-bottom:16px">To share jobs, photos, and notes across your team in real time, connect a free Firebase database. Takes about 5 minutes.</p>
      <div class="setup-steps">
        <div class="setup-step"><div class="step-num">1</div><div class="step-text">Go to <a href="https://console.firebase.google.com" target="_blank">console.firebase.google.com</a> and sign in with Google.</div></div>
        <div class="setup-step"><div class="step-num">2</div><div class="step-text">Click "Add project", name it <strong>waterfront-jobs</strong>, skip Analytics → Create.</div></div>
        <div class="setup-step"><div class="step-num">3</div><div class="step-text">Build → Realtime Database → Create Database → "Start in test mode" → Done.</div></div>
        <div class="setup-step"><div class="step-num">4</div><div class="step-text">Gear icon ⚙ → Project settings → Your apps → Web icon &lt;/&gt; → Register → copy the <strong>firebaseConfig</strong>.</div></div>
        <div class="setup-step"><div class="step-num">5</div><div class="step-text">Paste the config JSON below and tap Connect. Do this on every team member's phone.</div></div>
      </div>
      <div class="form-group"><label class="form-label">Firebase config JSON</label><textarea class="form-textarea" id="fb-cfg" style="font-family:monospace;font-size:12px;min-height:110px" placeholder='{"apiKey":"YOUR_FIREBASE_API_KEY","authDomain":"...","databaseURL":"https://....firebaseio.com","projectId":"...","storageBucket":"...","messagingSenderId":"...","appId":"..."}'>
</textarea></div>
    </div>
    <div class="modal-foot"><button class="btn-cancel" id="btn-cx">Cancel</button><button class="btn-save" id="btn-connect">Connect Team</button></div>
  </div></div>`;
  $('mc').onclick=$('btn-cx').onclick=closeModal;
  $('mbd').onclick=e=>{if(e.target===e.currentTarget)closeModal()};
  $('btn-connect').onclick=()=>{
    let raw=$('fb-cfg').value.trim();
    let cfg;
    try{raw=raw.replace(/^.*?=/,'').replace(/;?\s*$/,'');cfg=JSON.parse(raw);if(!cfg.databaseURL)throw new Error('Missing databaseURL')}
    catch(e){toast('Invalid config — check and try again','');return}
    localStorage.setItem('wfs_fb',JSON.stringify(cfg));FIREBASE_CONFIG=cfg;
    closeModal();const ok=initFB(cfg);if(ok)toast('Team connected! Live sync active');
  };
}
