// Active company branding theme
// Generated from src/app/09-settings-access-command-voice.js.
// Apply the active company's logo + color theme (logo/theme are optional;
// Waterfront has none, so it keeps its original logo and green header).
function applyCompanyBranding(){
  if(ACTIVE_CO.logoSvg){
    const img=document.querySelector('.brand-logo');
    if(img){img.src='data:image/svg+xml;utf8,'+encodeURIComponent(ACTIVE_CO.logoSvg);img.alt=ACTIVE_CO.label;}
  }
  const t=ACTIVE_CO.theme;
  if(t&&!document.getElementById('co-theme')){
    let css='';
    if(t.headerBg)css+='.header{background:'+t.headerBg+'}';
    if(t.syncBg)css+='.sync-bar{background:'+t.syncBg+'}';
    if(t.navActive)css+='.nav-btn.active{color:'+t.navActive+';border-bottom-color:'+t.navActive+'}';
    if(css){const s=document.createElement('style');s.id='co-theme';s.textContent=css;document.head.appendChild(s);}
  }
}
