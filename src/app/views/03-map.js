// Map view and geocoding
// Generated from src/app/05-owner-reports-map-notifications.js lines 426-507.
// ══ Map ══
// Remembered map center/zoom so re-renders (which fully rebuild the Leaflet
// instance) don't throw away the user's pan/zoom. Persists for the session.
let MAP_VIEW=null;
// Optional "you are here" position from the Near-me button. Session-only,
// never written to a job or persisted anywhere.
let USER_LOC=null;
// Pin/legend colors, shared by the map markers and the status filter chips.
function jobPinColor(status){return status==='complete'?'#3ab5c8':status==='active'?'#4ade80':status==='lost'?'#dc2626':status==='hold'?'#94a3b8':'#e8a830'}
// Straight-line distance in miles between two {lat,lng} points (haversine).
function milesBetween(a,b){
  const R=3958.8,toRad=d=>d*Math.PI/180;
  const dLat=toRad(b.lat-a.lat),dLng=toRad(b.lng-a.lng);
  const s=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(s)));
}
function fmtMiles(mi){return mi<0.1?'here':mi<10?mi.toFixed(1)+' mi':Math.round(mi)+' mi'}
function renderMap(){
  const all=jobs();
  const withCoords=all.filter(j=>j.lat&&j.lng);
  const needGeo=all.filter(j=>j.address&&(!j.lat||!j.lng));
  const failed=needGeo.filter(j=>j.geocodeStatus==='failed');
  const needsConfirm=needGeo.filter(j=>j.geocodeStatus==='needs_confirm'&&(j.geocodeCandidates||[]).length);
  const pending=needGeo.length-failed.length-needsConfirm.length;
  const pinJobs=all.filter(j=>j.address||j.lat||j.lng);
  const manualTarget=S.manualPinJob&&S.jobs[S.manualPinJob]?S.jobs[S.manualPinJob]:null;
  const mapFilter=S.mapFilter||'all';
  const mcnt={all:withCoords.length,lead:0,active:0,complete:0,hold:0,lost:0};
  withCoords.forEach(j=>{if(mcnt[j.status]!==undefined)mcnt[j.status]++});
  const mfLabels={all:'All',lead:'Lead',active:'Active',complete:'Done',hold:'On Hold',lost:'Lost'};
  return `
    <div class="map-controls">
      <div class="map-stats">${withCoords.length} of ${all.filter(j=>j.address).length} jobs pinned${pending>0?` · ${pending} need locating`:''}${needsConfirm.length>0?` · ${needsConfirm.length} need review`:''}${failed.length>0?` · ${failed.length} failed`:''}</div>
      ${needGeo.length>0?`<button class="btn-sm" id="btn-geocode">Locate ${needGeo.length} address${needGeo.length!==1?'es':''}</button>`:''}
      ${pinJobs.length>0?`<select class="map-job-select" id="map-manual-job" aria-label="Manual pin job">
        <option value="">Set pin manually…</option>
        ${pinJobs.map(j=>`<option value="${j.id}" ${manualTarget&&manualTarget.id===j.id?'selected':''}>${esc(j.name)}${j.lat&&j.lng?' · pinned':''}</option>`).join('')}
      </select>`:''}
      <button class="btn-sm" id="map-near-me" aria-label="Center map on my location">📍 Near me</button>
      <span class="geocode-status" id="geo-status" style="display:none"></span>
    </div>
    ${withCoords.length>0?`<div class="filter-row map-filter-row" style="margin-bottom:10px" role="group" aria-label="Filter map by status">
      ${['all','lead','active','complete','hold','lost'].map(s=>`<div class="filter-chip ${mapFilter===s?'active':''}" data-map-filter="${s}">${s!=='all'?`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${jobPinColor(s)};margin-right:5px;vertical-align:middle"></span>`:''}${mfLabels[s]} ${mcnt[s]}</div>`).join('')}
    </div>`:''}
    ${manualTarget?`<div class="map-alert map-alert-manual">
      <strong>Click the map to set the pin for ${esc(manualTarget.name)}.</strong>
      <span>${manualTarget.address?esc(manualTarget.address):'No job site address saved.'}</span>
      <button class="map-clear-manual" id="map-clear-manual">Cancel manual pin</button>
    </div>`:''}
    ${needsConfirm.length>0?`<div class="map-alert map-alert-review">
      <strong>${needsConfirm.length} address${needsConfirm.length!==1?'es':''} need confirmation.</strong>
      <span>Pick the matching result before the job is pinned.</span>
      <div class="map-failed-list">${needsConfirm.slice(0,4).map(j=>`<button class="map-failed-job" data-pick-location="${j.id}">${esc(j.name)}${j.address?' · '+esc(j.address):''}</button>`).join('')}${needsConfirm.length>4?`<span class="map-failed-more">+${needsConfirm.length-4} more</span>`:''}</div>
    </div>`:''}
    ${failed.length>0?`<div class="map-alert">
      <strong>${failed.length} address${failed.length!==1?'es':''} could not be located.</strong>
      <span>Check spelling, city, state, or ZIP, then run Locate again.</span>
      <div class="map-failed-list">${failed.slice(0,4).map(j=>`<button class="map-failed-job" data-open-job="${j.id}">${esc(j.name)}${j.address?' · '+esc(j.address):''}</button>`).join('')}${failed.length>4?`<span class="map-failed-more">+${failed.length-4} more</span>`:''}</div>
    </div>`:''}
    ${withCoords.length===0?`<div class="map-empty">
      <p style="margin-bottom:10px">No jobs pinned to the map yet.</p>
      <p style="font-size:12.5px">${manualTarget?'Click the map below to place this job.':needGeo.length>0?'Click "Locate" above to find addresses on the map.':'Add a job with an address to get started.'}</p>
    </div>`:''}
    ${USER_LOC&&withCoords.length?(()=>{const n=withCoords.map(j=>({j,d:milesBetween(USER_LOC,{lat:Number(j.lat),lng:Number(j.lng)})})).sort((a,b)=>a.d-b.d)[0];return `<div class="map-stats" style="margin:0 0 10px">📍 Nearest job: <strong>${esc(n.j.name)}</strong> · ${fmtMiles(n.d)} away</div>`})():''}
    <div class="map-wrap" id="map-wrap" style="${withCoords.length===0&&!manualTarget&&!USER_LOC?'display:none':''}">
      <div id="leaflet-map"></div>
    </div>
  `;
}

function mountMap(){
  if(typeof L==='undefined'){
    setTimeout(mountMap,200);
    return;
  }
  const el=document.getElementById('leaflet-map');
  if(!el)return;
  if(MAP){MAP.remove();MAP=null;MAP_MARKERS=[]}
  const mapFilter=S.mapFilter||'all';
  const allCoords=jobs().filter(j=>j.lat&&j.lng);
  const all=allCoords.filter(j=>mapFilter==='all'||j.status===mapFilter);
  const manualTarget=S.manualPinJob&&S.jobs[S.manualPinJob]?S.jobs[S.manualPinJob]:null;
  if(allCoords.length===0&&!manualTarget&&!USER_LOC)return;
  MAP=L.map(el,{scrollWheelZoom:true});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,attribution:'© OpenStreetMap'
  }).addTo(MAP);
  // Remember where the user last left the map so the next re-render can restore it.
  MAP.on('moveend',()=>{if(MAP)MAP_VIEW={center:MAP.getCenter(),zoom:MAP.getZoom()}});
  // Cluster overlapping pins when the plugin is available; fall back to plain pins.
  const cluster=(typeof L.markerClusterGroup==='function')?L.markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:50,spiderfyOnMaxZoom:true}):null;
  const group=[];
  all.forEach(j=>{
    const color=jobPinColor(j.status);
    const icon=L.divIcon({
      className:'',
      html:`<div style="background:${color};width:24px;height:24px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center"><div style="transform:rotate(45deg);color:#fff;font-size:11px;font-weight:700">${initials(j.name)}</div></div>`,
      iconSize:[24,24],iconAnchor:[12,24]
    });
    const m=L.marker([j.lat,j.lng],{icon});
    if(cluster)cluster.addLayer(m);else m.addTo(MAP);
    MAP_MARKERS.push(m);
    const locLabel=j.locationSource==='manual'?'Manual pin':(j.geocodeLabel&&j.geocodeLabel!==j.address?'Matched: '+esc(j.geocodeLabel):'');
    const dir='https://www.google.com/maps/dir/?api=1&destination='+j.lat+','+j.lng;
    const dist=USER_LOC?fmtMiles(milesBetween(USER_LOC,{lat:Number(j.lat),lng:Number(j.lng)}))+' away':'';
    m.bindPopup(`<strong>${esc(j.name)}</strong>${esc(j.address||'')}${locLabel?'<br><span class="popup-muted">'+locLabel+'</span>':''}${dist?'<br><span class="popup-muted">📍 '+dist+'</span>':''}<br><br>${j.customerName?esc(j.customerName)+'<br>':''}${j.customerPhone?'📞 '+esc(j.customerPhone)+'<br>':''}<a href="${dir}" target="_blank" rel="noopener">🧭 Directions</a><br><a href="#" data-open-job="${j.id}">Open job →</a><br><a href="#" data-manual-pin="${j.id}">Move pin</a>`);
    m.on('popupopen',()=>{
      const lnk=document.querySelector('[data-open-job="'+j.id+'"]');
      if(lnk)lnk.onclick=e=>{e.preventDefault();S.detail=j.id;S.view='jobs';S.detailTab='overview';render()};
      const move=document.querySelector('[data-manual-pin="'+j.id+'"]');
      if(move)move.onclick=e=>{e.preventDefault();S.manualPinJob=j.id;render()};
    });
    group.push([j.lat,j.lng]);
  });
  if(cluster)MAP.addLayer(cluster);
  if(USER_LOC){
    const uicon=L.divIcon({className:'',html:`<div style="width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 3px rgba(37,99,235,0.3),0 2px 6px rgba(0,0,0,0.35)"></div>`,iconSize:[16,16],iconAnchor:[8,8]});
    L.marker([USER_LOC.lat,USER_LOC.lng],{icon:uicon,zIndexOffset:1000,keyboard:false}).addTo(MAP).bindPopup('<strong>You are here</strong>');
  }
  // Restore the user's last view if they've moved the map this session; otherwise
  // focus my location, frame the pins, or the manual-pin target on first open.
  if(MAP_VIEW){MAP.setView(MAP_VIEW.center,MAP_VIEW.zoom)}
  else if(USER_LOC){MAP.setView([USER_LOC.lat,USER_LOC.lng],14)}
  else if(manualTarget&&manualTarget.lat&&manualTarget.lng){MAP.setView([manualTarget.lat,manualTarget.lng],16)}
  else if(group.length===1){MAP.setView(group[0],13)}
  else if(group.length>1){MAP.fitBounds(group,{padding:[40,40]})}
  else{MAP.setView([36.3829,-84.1199],11)}
  if(manualTarget){
    MAP.on('click',async e=>{
      if(!confirm('Set map pin for '+manualTarget.name+' here?'))return;
      manualTarget.lat=e.latlng.lat;
      manualTarget.lng=e.latlng.lng;
      manualTarget.geocodeStatus='ok';
      manualTarget.geocodeLabel='Manual pin';
      manualTarget.geocodedAt=Date.now();
      manualTarget.locationSource='manual';
      delete manualTarget.geocodeCandidates;
      await writeJob(manualTarget);
      S.manualPinJob=null;
      render();
      toast('Manual pin saved');
    });
  }
  setTimeout(()=>MAP&&MAP.invalidateSize(),100);
}

// Nominatim geocoder (rate limited 1/sec by their TOS)
function normalizeGeocodeCandidate(row){
  return {
    lat:parseFloat(row.lat),
    lng:parseFloat(row.lon),
    label:row.display_name||'',
    type:[row.type,row.class].filter(Boolean).join(' · '),
    importance:Number(row.importance||0)
  };
}
async function geocodeCandidates(addr){
  try{
    const r=await fetch('https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=3&q='+encodeURIComponent(addr),{headers:{'Accept':'application/json'}});
    if(!r.ok)return [];
    const data=await r.json();
    if(data&&data.length>0)return data.map(normalizeGeocodeCandidate).filter(c=>Number.isFinite(c.lat)&&Number.isFinite(c.lng));
  }catch(e){}
  return [];
}
function bestGeocodeCandidate(candidates){
  if(!candidates.length)return null;
  const [first,second]=candidates;
  if(!second)return first;
  if(first.importance&&second.importance&&(first.importance-second.importance)>0.18)return first;
  return null;
}
function applyGeocodeCandidate(j,c){
  j.lat=c.lat;
  j.lng=c.lng;
  j.geocodeStatus='ok';
  j.geocodeLabel=c.label;
  j.geocodedAt=Date.now();
  j.locationSource='geocode';
  delete j.geocodeCandidates;
}
async function geocodeAll(){
  const queue=jobs().filter(j=>j.address&&(!j.lat||!j.lng));
  const status=$('geo-status');
  let located=0,review=0,failed=0;
  if(status)status.style.display='inline-block';
  for(let i=0;i<queue.length;i++){
    const j=queue[i];
    if(status)status.textContent=`Locating ${i+1} of ${queue.length}: ${j.name}…`;
    const candidates=await geocodeCandidates(j.address);
    const coords=bestGeocodeCandidate(candidates);
    if(coords){
      applyGeocodeCandidate(j,coords);
      located++;
    }else if(candidates.length){
      delete j.lat;
      delete j.lng;
      j.geocodeStatus='needs_confirm';
      j.geocodeCandidates=candidates;
      j.geocodedAt=Date.now();
      j.locationSource='address';
      review++;
    }else{
      delete j.lat;
      delete j.lng;
      j.geocodeStatus='failed';
      j.geocodedAt=Date.now();
      j.locationSource='address';
      failed++;
    }
    await writeJob(j);
    await new Promise(r=>setTimeout(r,1100));
  }
  if(status)status.textContent=`Done. ${located} located${review?`, ${review} need review`:''}${failed?`, ${failed} failed`:''}.`;
  toast(review||failed?`${located} located, ${review} need review, ${failed} failed`:'Locations updated');
  render();
}
function showGeocodeCandidateModal(jobId){
  const j=S.jobs[jobId];
  if(!j)return;
  const candidates=j.geocodeCandidates||[];
  if(!candidates.length){toast('No location choices saved','');return}
  $('modal-root').innerHTML=`<div class="modal-bd" id="mbd" role="dialog" aria-modal="true" aria-label="Confirm map location"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Confirm Location</div><button class="modal-close" id="mc" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      <div class="map-confirm-job"><strong>${esc(j.name)}</strong><span>${esc(j.address||'')}</span></div>
      <div class="map-candidate-list">
        ${candidates.map((c,i)=>`<button class="map-candidate" data-location-choice="${i}">
          <span class="map-candidate-title">${esc(c.label||'Unknown location')}</span>
          <span class="map-candidate-meta">${c.type?esc(c.type)+' · ':''}${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}</span>
        </button>`).join('')}
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn-cancel" id="btn-cx">Cancel</button>
    </div>
  </div></div>`;
  $('mc').onclick=$('btn-cx').onclick=closeModal;
  $('mbd').onclick=e=>{if(e.target===e.currentTarget)closeModal()};
  document.querySelectorAll('[data-location-choice]').forEach(btn=>btn.onclick=async()=>{
    const c=candidates[Number(btn.dataset.locationChoice)];
    if(!c)return;
    applyGeocodeCandidate(j,c);
    await writeJob(j);
    closeModal();
    render();
    toast('Location confirmed');
  });
}
