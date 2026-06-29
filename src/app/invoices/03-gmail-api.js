// Gmail OAuth, MIME building, and Gmail API send helpers
// Generated from src/app/04-invoices-email.js lines 434-572.
// ── Gmail API: connect once, send branded HTML + PDF in true one click ──
function GMAIL_LS_KEY(){return LS('gmail')}
function gmailLoad(){try{return JSON.parse(localStorage.getItem(GMAIL_LS_KEY())||'null')||{}}catch(e){return {}}}
function gmailSave(cfg){try{localStorage.setItem(GMAIL_LS_KEY(),JSON.stringify(cfg||{}))}catch(e){}}
function gmailConnected(){const c=gmailLoad();return !!(c&&c.clientId&&c.accessToken&&Date.now()<(c.expiresAt||0)-30000)}
function gmailEmail(){return gmailLoad().email||''}
let _gisP=null;
function loadGIS(){
  if(_gisP)return _gisP;
  _gisP=new Promise((res,rej)=>{
    if(window.google&&window.google.accounts&&window.google.accounts.oauth2){res(window.google);return}
    const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.defer=true;
    s.onload=()=>res(window.google);s.onerror=()=>rej(new Error('Failed to load Google sign-in script'));
    document.head.appendChild(s);
  });
  return _gisP;
}
async function gmailFetchProfile(token){
  const r=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:'Bearer '+token}});
  if(!r.ok)throw new Error('Profile lookup failed ('+r.status+')');
  const j=await r.json();return j.emailAddress||'';
}
async function gmailRequestToken(clientId,silent){
  const google=await loadGIS();
  return new Promise((res,rej)=>{
    const client=google.accounts.oauth2.initTokenClient({
      client_id:clientId,
      scope:'https://www.googleapis.com/auth/gmail.send',
      callback:(resp)=>{if(resp&&resp.error){rej(new Error(resp.error_description||resp.error));return}res(resp)},
      error_callback:(err)=>rej(new Error((err&&err.message)||'OAuth flow cancelled'))
    });
    client.requestAccessToken({prompt:silent?'':'consent'});
  });
}
function gmailOriginOk(){
  if(typeof window==='undefined')return false;
  if(location.protocol==='file:')return false;
  // Google's rule: HTTPS, or http://localhost / http://127.0.0.1 (any port).
  if(location.protocol==='https:')return !!window.isSecureContext;
  if(location.protocol==='http:'){
    const h=location.hostname;return h==='localhost'||h==='127.0.0.1'||h==='[::1]';
  }
  return false;
}
function gmailOriginReason(){
  if(location.protocol==='file:')return 'This page is opened from a local file (file://). Google blocks OAuth from file:// pages. Open the app via its hosted URL instead.';
  if(location.protocol==='http:'){const h=location.hostname;if(h!=='localhost'&&h!=='127.0.0.1'&&h!=='[::1]')return 'This page is served over plain HTTP. Google requires HTTPS (except localhost). Use the HTTPS version of this URL.';}
  if(!window.isSecureContext)return 'This page is not a secure context. Google requires HTTPS for OAuth.';
  return '';
}
async function gmailConnect(clientId){
  if(!clientId)throw new Error('Paste your OAuth Client ID first');
  if(!gmailOriginOk())throw new Error(gmailOriginReason()||'OAuth requires a secure origin (HTTPS or localhost).');
  const tok=await gmailRequestToken(clientId,false);
  let email='';try{email=await gmailFetchProfile(tok.access_token)}catch(e){}
  const cfg={clientId,accessToken:tok.access_token,expiresAt:Date.now()+(tok.expires_in||3500)*1000,email,connectedAt:Date.now()};
  gmailSave(cfg);return cfg;
}
async function gmailEnsureToken(){
  const cfg=gmailLoad();
  if(!cfg.clientId)throw new Error('Gmail is not connected — open Settings → Email sending');
  if(Date.now()<(cfg.expiresAt||0)-30000)return cfg.accessToken;
  const tok=await gmailRequestToken(cfg.clientId,true);
  cfg.accessToken=tok.access_token;cfg.expiresAt=Date.now()+(tok.expires_in||3500)*1000;gmailSave(cfg);
  return cfg.accessToken;
}
function gmailDisconnect(){
  const cfg=gmailLoad();
  if(cfg.accessToken&&window.google&&window.google.accounts&&window.google.accounts.oauth2){
    try{window.google.accounts.oauth2.revoke(cfg.accessToken,()=>{})}catch(e){}
  }
  gmailSave({});
}
function _u8b64(s){return btoa(unescape(encodeURIComponent(s)))}
function _b64url(s){return s.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function _wrap76(s){return s.replace(/(.{76})/g,'$1\r\n')}
async function _fileToB64(file){
  const buf=await file.arrayBuffer();const bytes=new Uint8Array(buf);
  let bin='',CHUNK=0x8000;for(let i=0;i<bytes.length;i+=CHUNK)bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+CHUNK));
  return btoa(bin);
}
function buildGmailMime(o){
  const B1='ALT_'+Math.random().toString(36).slice(2);
  const B2='MIX_'+Math.random().toString(36).slice(2);
  const fromHdr=o.fromName?('"'+String(o.fromName).replace(/"/g,'')+'" <'+o.fromEmail+'>'):o.fromEmail;
  const lines=[
    'From: '+fromHdr,
    'To: '+o.to,
    'Subject: =?UTF-8?B?'+_u8b64(o.subject||'')+'?=',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="'+B2+'"',
    '',
    '--'+B2,
    'Content-Type: multipart/alternative; boundary="'+B1+'"',
    '',
    '--'+B1,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    _wrap76(_u8b64(o.textBody||'')),
    '',
    '--'+B1,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    _wrap76(_u8b64(o.htmlBody||'')),
    '',
    '--'+B1+'--'
  ];
  let mime=lines.join('\r\n');
  for(const a of (o.attachments||[])){
    const name=String(a.name||'attachment').replace(/"/g,'');
    mime+='\r\n\r\n--'+B2+'\r\n';
    mime+='Content-Type: '+(a.mime||'application/octet-stream')+'; name="'+name+'"\r\n';
    mime+='Content-Disposition: attachment; filename="'+name+'"\r\n';
    mime+='Content-Transfer-Encoding: base64\r\n\r\n';
    mime+=_wrap76(a.base64);
  }
  mime+='\r\n--'+B2+'--';
  return mime;
}
async function gmailApiSend(o){
  const token=await gmailEnsureToken();
  const fromEmail=gmailEmail();
  const atts=[];
  for(const f of (o.attachments||[])){
    atts.push({name:f.name,mime:f.type||'application/octet-stream',base64:await _fileToB64(f)});
  }
  const mime=buildGmailMime({fromName:o.fromName,fromEmail,to:o.to,subject:o.subject,htmlBody:o.htmlBody,textBody:o.textBody,attachments:atts});
  const raw=_b64url(btoa(mime));
  const r=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{
    method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({raw})
  });
  if(!r.ok){let m='Gmail API error '+r.status;try{const j=await r.json();if(j&&j.error&&j.error.message)m=j.error.message}catch(e){}throw new Error(m)}
  return r.json();
}

