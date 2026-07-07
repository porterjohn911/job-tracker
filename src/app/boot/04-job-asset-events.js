// Photos, notes, tasks, logs, and documents handlers
// Generated from src/app/10-handlers-boot.js.

function attachJobAssetHandlers(){
  // Photos
  document.querySelectorAll('[data-photo-cat]').forEach(c=>c.onclick=()=>{S.photoCat=c.dataset.photoCat;render()});
  $('photo-upload')?.addEventListener('change',function(){
    const j=S.jobs[S.detail];if(!j)return;j.photos=j.photos||[];
    const files=Array.from(this.files);if(!files.length)return;
    const cat=S.photoCat&&S.photoCat!=='all'?S.photoCat:'';
    const total=files.length;let done=0;
    const finishOne=()=>{if(++done===total){writeJob(j).then(()=>{logAct('added '+total+' photo(s) to',j.name);render();toast(total+' photo'+(total>1?'s':'')+' added','photo')})}};
    if(storageReady())toast('Uploading '+total+' photo'+(total>1?'s':'')+'…','photo');
    files.forEach(file=>{const r=new FileReader();r.onload=e=>{
      const img=new Image();img.onload=async()=>{
        const c=document.createElement('canvas');const MAX=1400;
        let w=img.width,h=img.height;
        if(w>MAX||h>MAX){if(w>h){h=Math.round(h*MAX/w);w=MAX}else{w=Math.round(w*MAX/h);h=MAX}}
        c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);
        const blob=await canvasToBlob(c,'image/jpeg',0.78);
        const up=blob?await uploadToStorage(blob,'jobs/'+j.id+'/photos','jpg'):null;
        const rec={cat:cat,user:S.user,time:Date.now()};
        if(up){rec.url=up.url;rec.storagePath=up.path}
        else{rec.url=c.toDataURL('image/jpeg',0.78)}
        j.photos.push(rec);
        finishOne();
      };img.src=e.target.result
    };r.readAsDataURL(file)});
  });
  document.querySelectorAll('[data-del-photo]').forEach(b=>b.onclick=async e=>{
    e.stopPropagation();const j=S.jobs[S.detail];if(!j)return;
    const i=parseInt(b.dataset.delPhoto);
    const removed=j.photos.splice(i,1)[0];await writeJob(j);render();
    let restored=false;
    const restore=async()=>{if(restored)return;restored=true;const jj=S.jobs[j.id];if(jj&&removed){jj.photos=jj.photos||[];jj.photos.splice(i,0,removed);await writeJob(jj);render();toast('Photo restored')}};
    UNDO.push(restore);
    toast('Photo removed','undo',restore);
  });
  document.querySelectorAll('[data-view-photo]').forEach(img=>img.onclick=e=>{
    e.stopPropagation();const j=S.jobs[S.detail];if(!j)return;
    const idx=parseInt(img.dataset.viewPhoto);
    const url=photoURL(j.photos[idx]);
    $('fs-root').innerHTML=`<div class="photo-fs" id="fs"><button class="photo-fs-close" id="fsc">×</button><img src="${url}" alt=""></div>`;
    $('fsc').onclick=()=>$('fs-root').innerHTML='';
    $('fs').onclick=e=>{if(e.target===e.currentTarget)$('fs-root').innerHTML=''};
  });

  // Notes
  const ni=$('note-in'),pb=$('btn-post');
  async function postNote(){const t=ni?.value.trim();if(!t)return;const j=S.jobs[S.detail];if(!j)return;j.notes=j.notes||[];j.notes.push({user:S.user,text:t,time:Date.now()});await writeJob(j);await logAct('posted a note on',j.name);ni.value='';render();toast('Note posted','note')}
  if(ni)autoGrowTextareas(ni.parentElement||document);
  pb?.addEventListener('click',postNote);
  ni?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();postNote()}});

  // Tasks
  $('btn-add-task')?.addEventListener('click',async()=>{
    const inp=$('task-in'),due=$('task-due');
    const text=inp?.value.trim();if(!text)return;
    const j=S.jobs[S.detail];if(!j)return;
    j.tasks=j.tasks||[];
    j.tasks.push({text,due:due?.value||'',assigned:'',done:false,user:S.user,time:Date.now()});
    await writeJob(j);await logAct('added task to',j.name);render();toast('Task added');
  });
  $('task-in')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('btn-add-task')?.click()}});
  document.querySelectorAll('[data-task-toggle]').forEach(b=>b.onclick=async()=>{
    const j=S.jobs[S.detail];if(!j)return;const i=parseInt(b.dataset.taskToggle);
    j.tasks[i].done=!j.tasks[i].done;
    if(j.tasks[i].done){j.tasks[i].doneTime=Date.now();j.tasks[i].doneBy=S.user}
    await writeJob(j);await logAct(j.tasks[i].done?'completed task':'reopened task',j.name);render();
  });
  document.querySelectorAll('[data-task-del]').forEach(b=>b.onclick=async()=>{
    const j=S.jobs[S.detail];if(!j)return;
    const i=parseInt(b.dataset.taskDel);
    const removed=j.tasks.splice(i,1)[0];
    await writeJob(j);render();
    let restored=false;
    const restore=async()=>{if(restored)return;restored=true;const jj=S.jobs[j.id];if(jj){jj.tasks=jj.tasks||[];jj.tasks.splice(i,0,removed);await writeJob(jj);render();toast('Task restored')}};
    UNDO.push(restore);
    toast('Task removed','undo',restore);
  });

  // Daily log
  $('btn-add-log')?.addEventListener('click',async()=>{
    const text=$('log-text').value.trim();if(!text){toast('Enter work performed','');return}
    const j=S.jobs[S.detail];if(!j)return;
    j.dailyLogs=j.dailyLogs||[];
    j.dailyLogs.push({date:$('log-date').value||dateKey(new Date()),weather:$('log-weather').value.trim(),hours:$('log-hours').value,text,user:S.user,time:Date.now()});
    await writeJob(j);await logAct('added log entry to',j.name);render();toast('Log entry saved');
  });

  // Documents
  $('doc-upload')?.addEventListener('change',function(){
    const j=S.jobs[S.detail];if(!j)return;j.documents=j.documents||[];
    const file=this.files[0];if(!file)return;
    const cap=storageReady()?25*1024*1024:5*1024*1024;
    if(file.size>cap){toast('File too large (max '+(cap/1024/1024)+'MB)','');return}
    const meta={name:file.name,size:(file.size/1024).toFixed(0)+' KB',type:file.type,uploaded:Date.now(),user:S.user};
    const finishDoc=async(extra)=>{j.documents.push({...meta,...extra});await writeJob(j);await logAct('uploaded '+file.name+' to',j.name);render();toast('File uploaded')};
    if(storageReady())toast('Uploading…');
    (async()=>{
      const ext=(file.name.split('.').pop()||'').toLowerCase();
      const up=await uploadToStorage(file,'jobs/'+j.id+'/docs',ext);
      if(up){await finishDoc({url:up.url,storagePath:up.path})}
      else{const r=new FileReader();r.onload=async e=>{await finishDoc({url:e.target.result})};r.readAsDataURL(file)}
    })();
  });
  document.querySelectorAll('[data-doc-del]').forEach(b=>b.onclick=async e=>{
    e.preventDefault();e.stopPropagation();
    const j=S.jobs[S.detail];if(!j)return;
    const i=parseInt(b.dataset.docDel);
    const removed=j.documents.splice(i,1)[0];
    await writeJob(j);render();
    let restored=false;
    const restore=async()=>{if(restored)return;restored=true;const jj=S.jobs[j.id];if(jj){jj.documents=jj.documents||[];jj.documents.splice(i,0,removed);await writeJob(jj);render();toast('File restored')}};
    UNDO.push(restore);
    toast('File removed','undo',restore);
  });
}
