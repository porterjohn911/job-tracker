// Voice dictation helpers and microphone buttons
// Generated from src/app/09-settings-access-command-voice.js.
// ══ Voice dictation (Web Speech API) ══
const VOICE={rec:null,active:null};
function supportsVoice(){return!!(window.SpeechRecognition||window.webkitSpeechRecognition)}
function startVoice(targetEl,btn){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){toast('Voice not supported in this browser','');return}
  if(VOICE.rec){stopVoice();return}
  const rec=new SR();
  rec.continuous=true;rec.interimResults=true;rec.lang='en-US';
  VOICE.rec=rec;VOICE.active=btn;
  btn.classList.add('listening');btn.setAttribute('aria-pressed','true');
  const initial=targetEl.value;
  let final='';
  rec.onresult=e=>{
    let interim='';
    for(let i=e.resultIndex;i<e.results.length;i++){
      const r=e.results[i];
      if(r.isFinal)final+=r[0].transcript;else interim+=r[0].transcript;
    }
    targetEl.value=(initial?initial+(initial.endsWith(' ')?'':' '):'')+final+interim;
  };
  rec.onerror=e=>{toast('Voice error: '+e.error,'');stopVoice()};
  rec.onend=()=>{stopVoice()};
  try{rec.start()}catch(e){toast('Could not start mic','');stopVoice()}
}
function stopVoice(){
  if(VOICE.rec){try{VOICE.rec.stop()}catch(e){}VOICE.rec=null}
  if(VOICE.active){VOICE.active.classList.remove('listening');VOICE.active.setAttribute('aria-pressed','false');VOICE.active=null}
}
function micButton(targetSelector){
  if(!supportsVoice())return'';
  return `<button type="button" class="mic-btn" data-mic="${targetSelector}" title="Voice dictation" aria-label="Start voice dictation" aria-pressed="false">
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"/></svg>
  </button>`;
}
function wireMicButtons(){
  document.querySelectorAll('[data-mic]').forEach(btn=>{
    btn.onclick=e=>{
      e.preventDefault();
      const sel=btn.dataset.mic;
      const target=document.querySelector(sel);
      if(!target){toast('Field not found','');return}
      startVoice(target,btn);
    };
  });
}
