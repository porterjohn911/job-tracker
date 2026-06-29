// Map view and geocoding
// Generated from src/app/05-owner-reports-map-notifications.js lines 426-507.
// ══ Map ══
function renderMap(){
  const all=jobs();
  const withCoords=all.filter(j=>j.lat&&j.lng);
  const needGeo=all.filter(j=>j.address&&(!j.lat||!j.lng));
  return `
    <div class="map-controls">
      <div class="map-stats">${withCoords.length} of ${all.filter(j=>j.address).length} jobs pinned</div>
      ${needGeo.length>0?`<button class="btn-sm" id="btn-geocode">Locate ${needGeo.length} address${needGeo.length!==1?'es':''}</button>`:''}
      <span class="geocode-status" id="geo-status" style="display:none"></span>
    </div>
    ${withCoords.length===0?`<div class="map-empty">
      <p style="margin-bottom:10px">No jobs pinned to the map yet.</p>
      <p style="font-size:12.5px">${needGeo.length>0?'Click "Locate" above to find addresses on the map.':'Add a job with an address to get started.'}</p>
    </div>`:''}
    <div class="map-wrap" id="map-wrap" style="${withCoords.length===0?'display:none':''}">
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
  const all=jobs().filter(j=>j.lat&&j.lng);
  if(all.length===0)return;
  MAP=L.map(el,{scrollWheelZoom:true});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,attribution:'© OpenStreetMap'
  }).addTo(MAP);
  const group=[];
  all.forEach(j=>{
    const color=j.status==='complete'?'#3ab5c8':j.status==='active'?'#4ade80':j.status==='hold'?'#94a3b8':'#e8a830';
    const icon=L.divIcon({
      className:'',
      html:`<div style="background:${color};width:24px;height:24px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center"><div style="transform:rotate(45deg);color:#fff;font-size:11px;font-weight:700">${initials(j.name)}</div></div>`,
      iconSize:[24,24],iconAnchor:[12,24]
    });
    const m=L.marker([j.lat,j.lng],{icon}).addTo(MAP);
    m.bindPopup(`<strong>${esc(j.name)}</strong>${esc(j.address||'')}<br><br>${j.customerName?esc(j.customerName)+'<br>':''}${j.customerPhone?'📞 '+esc(j.customerPhone)+'<br>':''}<a href="#" data-open-job="${j.id}">Open job →</a>`);
    m.on('popupopen',()=>{
      const lnk=document.querySelector('[data-open-job="'+j.id+'"]');
      if(lnk)lnk.onclick=e=>{e.preventDefault();S.detail=j.id;S.view='jobs';S.detailTab='overview';render()};
    });
    group.push([j.lat,j.lng]);
  });
  if(group.length===1){MAP.setView(group[0],13)}
  else{MAP.fitBounds(group,{padding:[40,40]})}
  setTimeout(()=>MAP&&MAP.invalidateSize(),100);
}

// Nominatim geocoder (rate limited 1/sec by their TOS)
async function geocodeOne(addr){
  try{
    const r=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(addr),{headers:{'Accept':'application/json'}});
    if(!r.ok)return null;
    const data=await r.json();
    if(data&&data.length>0)return{lat:parseFloat(data[0].lat),lng:parseFloat(data[0].lon)};
  }catch(e){}
  return null;
}
async function geocodeAll(){
  const queue=jobs().filter(j=>j.address&&(!j.lat||!j.lng));
  const status=$('geo-status');
  if(status)status.style.display='inline-block';
  for(let i=0;i<queue.length;i++){
    const j=queue[i];
    if(status)status.textContent=`Locating ${i+1} of ${queue.length}: ${j.name}…`;
    const coords=await geocodeOne(j.address);
    if(coords){j.lat=coords.lat;j.lng=coords.lng;await writeJob(j)}
    await new Promise(r=>setTimeout(r,1100));
  }
  if(status)status.textContent='Done.';
  toast('Locations updated');
  render();
}

