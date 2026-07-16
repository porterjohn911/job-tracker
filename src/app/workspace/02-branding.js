// Active company branding theme
// Generated from src/app/09-settings-access-command-voice.js.
// Apply the active company's logo + color theme (logo/theme are optional;
// Waterfront has none, so it keeps its original logo and green header).
const DEFAULT_APP_LOGO_SRC=(()=>{const img=document.querySelector('.brand-logo');return img?img.src:''})();
function companyBrandCss(co){
  co=co||ACTIVE_CO;
  const t=co.theme||{};
  const custom=normalizeHexColor(t.headerColor);
  const bg=companyHeaderBg(co);
  const text=readableOn(companyHeaderColor(co));
  const muted=text==='#ffffff'?'rgba(255,255,255,0.62)':'rgba(10,31,24,0.68)';
  const soft=text==='#ffffff'?'rgba(255,255,255,0.12)':'rgba(255,255,255,0.58)';
  const border=text==='#ffffff'?'rgba(255,255,255,0.18)':'rgba(10,31,24,0.18)';
  let css='';
  if(bg)css+='.header{background:'+bg+'}';
  if(custom){
    css+='.brand-text h1{color:'+text+'}.brand-switch{color:'+muted+'}.brand-switch:hover{color:'+text+'}.user-btn,.bell-btn{color:'+text+';background:'+soft+';border-color:'+border+'}.header::after{background:'+border+'}';
    css+='.sync-bar{background:'+custom+'}.nav-btn.active{color:'+custom+';border-bottom-color:'+custom+'}';
  }else{
    if(t.syncBg)css+='.sync-bar{background:'+t.syncBg+'}';
    if(t.navActive)css+='.nav-btn.active{color:'+t.navActive+';border-bottom-color:'+t.navActive+'}';
  }
  return css;
}
function applyCompanyBranding(co){
  co=co||ACTIVE_CO;
  const logo=companyAppLogoSrc();
  const img=document.querySelector('.brand-logo');
  if(img){img.src=logo||DEFAULT_APP_LOGO_SRC;img.alt=co.label;}
  let s=document.getElementById('co-theme');
  if(!s){s=document.createElement('style');s.id='co-theme';document.head.appendChild(s)}
  s.textContent=companyBrandCss(co);
}
