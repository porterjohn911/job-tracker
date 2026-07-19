// Global keyboard listener and app boot sequence
// Generated from src/app/10-handlers-boot.js.

document.addEventListener('keydown',onKey);

// Service worker would require a same-origin .js file; manifest alone makes it installable.
// Browsers prompt "Add to Home Screen" when the manifest + HTTPS + an icon are present.

function bootApp(){
  loadAndConnect();
  if(OWNER_MODE)applyOwnerChrome();else applyCompanyBranding();
  render();
  if(typeof initPush==='function')try{initPush()}catch(e){}
}
async function startApp(){
  await loadRuntimeFirebaseConfig();
  refreshFirebaseAuthFlag();
  if(FB_AUTH_ON){startAuthGate();}
  else if(LOCKED){showLockScreen();}
  else{bootApp();}
}
startApp();

