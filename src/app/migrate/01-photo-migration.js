// One-time photo migration.
//
// Moves any photos/receipts/documents still stored as inline base64 (from
// before Firebase Storage was enabled) UP to Firebase Storage, replacing each
// blob with a short download URL and saving the job back. This shrinks both the
// cloud records and the browser cache, which is what actually clears the
// "Browser storage is full" state — because the base64 also lives in the cloud
// and keeps syncing back down until it's removed from the job data itself.
//
// Run from the browser console (owner, once — safe to re-run):
//   await photoMigrationScan()   // dry run: how much base64 is embedded
//   await photoMigrationRun()    // migrate it to Storage
//
// It only ever touches items still stored as base64; anything already on a
// Storage URL is left alone, so re-running is harmless.

function _isBase64Url(u){return typeof u==='string'&&u.slice(0,5)==='data:'}
function _dataURLtoBlob(dataURL){
  const c=dataURL.indexOf(',');
  const head=dataURL.slice(0,c),b64=dataURL.slice(c+1);
  const mime=(head.match(/data:([^;]+)/)||[])[1]||'image/jpeg';
  const bin=atob(b64);
  const arr=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);
  return new Blob([arr],{type:mime});
}
function _extFromDataURL(u){
  const m=u.match(/^data:image\/(\w+)/);
  if(m)return m[1]==='jpeg'?'jpg':m[1];
  if(u.slice(0,30).indexOf('pdf')>=0)return 'pdf';
  return 'bin';
}

async function photoMigrationScan(){
  let count=0,bytes=0;
  const scan=arr=>(arr||[]).forEach(p=>{if(p&&_isBase64Url(p.url)){count++;bytes+=p.url.length}});
  Object.values((typeof S!=='undefined'&&S.jobs)||{}).forEach(j=>{
    scan(j.photos);scan(j.receipts);scan(j.documents);
    (j.invoices||[]).forEach(inv=>scan(inv&&inv.photos));
    (j.estimates||[]).forEach(inv=>scan(inv&&inv.photos));
  });
  const mb=(bytes/1048576).toFixed(2);
  console.log('[photo-migration] '+count+' embedded file(s), ~'+mb+' MB of base64 to move.');
  if(typeof toast==='function')toast(count?count+' photos to migrate (~'+mb+' MB)':'No embedded photos to migrate','');
  return {count,bytes};
}

async function photoMigrationRun(opts){
  opts=opts||{};
  const onProgress=typeof opts.onProgress==='function'?opts.onProgress:null;
  if(!(typeof storageReady==='function'&&storageReady())){
    console.error('[photo-migration] Firebase Storage is not ready. Enable Storage first, then reload.');
    if(typeof toast==='function')toast('Enable Firebase Storage first','');
    return {migrated:0,failed:0,jobsTouched:0};
  }
  let toMove=0;
  const countArr=arr=>(arr||[]).forEach(p=>{if(p&&_isBase64Url(p.url))toMove++});
  Object.values((typeof S!=='undefined'&&S.jobs)||{}).forEach(j=>{
    countArr(j.photos);countArr(j.receipts);countArr(j.documents);
    (j.invoices||[]).forEach(inv=>countArr(inv&&inv.photos));
    (j.estimates||[]).forEach(inv=>countArr(inv&&inv.photos));
  });
  let migrated=0,failed=0,jobsTouched=0;
  if(onProgress)onProgress(0,toMove);
  const migrateArr=async(arr,jobId,kind)=>{
    if(!Array.isArray(arr))return false;
    let changed=false;
    for(const p of arr){
      if(!p||!_isBase64Url(p.url))continue;
      try{
        const up=await uploadToStorage(_dataURLtoBlob(p.url),'jobs/'+jobId+'/'+kind,_extFromDataURL(p.url));
        if(up&&up.url){p.url=up.url;p.storagePath=up.path;migrated++;changed=true;}
        else{failed++;console.warn('[photo-migration] upload returned nothing for a '+kind+' on job '+jobId);}
      }catch(e){failed++;console.warn('[photo-migration] failed one '+kind,e);}
      if(onProgress)onProgress(migrated+failed,toMove);
    }
    return changed;
  };
  const jobs=Object.values((typeof S!=='undefined'&&S.jobs)||{});
  console.log('[photo-migration] starting — checking '+jobs.length+' job(s)…');
  for(const j of jobs){
    let changed=false;
    if(await migrateArr(j.photos,j.id,'photos'))changed=true;
    if(await migrateArr(j.receipts,j.id,'receipts'))changed=true;
    if(await migrateArr(j.documents,j.id,'docs'))changed=true;
    for(const inv of (j.invoices||[]))if(await migrateArr(inv&&inv.photos,j.id,'photos'))changed=true;
    for(const inv of (j.estimates||[]))if(await migrateArr(inv&&inv.photos,j.id,'photos'))changed=true;
    if(changed){
      try{await writeJob(j);jobsTouched++;console.log('[photo-migration] updated '+(j.name||j.id));}
      catch(e){console.error('[photo-migration] could not save job '+(j.name||j.id),e);}
    }
  }
  console.log('[photo-migration] DONE — '+migrated+' file(s) moved to Storage, '+jobsTouched+' job(s) updated, '+failed+' failed.');
  if(typeof toast==='function')toast('Migration done: '+migrated+' moved'+(failed?', '+failed+' failed':''),'');
  if(typeof render==='function')render();
  return {migrated,failed,jobsTouched};
}
