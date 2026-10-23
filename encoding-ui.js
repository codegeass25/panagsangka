/* Official encoding UI. Browser wall-clock time never controls permission. */
'use strict';
window.PanagEncodingUI={create({state,api,esc,flash}){
 let anchor=0,serverTime=0,pending=null,lastBoundary='',owner=state.token||'',adminPending=null,refreshAgain=false,adminAgain=false;
 const operations={placement_save:'Save placement draft',placement_submit:'Submit placements',correction_request:'Request result correction',judged_results_submit:'Submit generated judging results',judge_save:'Save judge draft',judge_submit:'Submit judge ballot'};
 const roleFor=op=>op.startsWith('judge_')?'judge':'manager';
 function writeAction(method,path){const p=path.replace(/^\/api/,'');for(const [verb,re,operation] of [['PUT',/^\/events\/(\d+)\/result$/,'placement_save'],['POST',/^\/events\/(\d+)\/submit$/,'placement_submit'],['POST',/^\/events\/(\d+)\/correction$/,'correction_request'],['PUT',/^\/judging\/events\/(\d+)\/ballot$/,'judge_save'],['POST',/^\/judging\/events\/(\d+)\/submit$/,'judge_submit'],['POST',/^\/judging\/events\/(\d+)\/submit-results$/,'judged_results_submit']]){const m=method===verb&&re.exec(p);if(m)return {operation,event:Number(m[1])};}return null;}
 const now=()=>serverTime+Math.max(0,performance.now()-anchor);
 const format=t=>t===null||t===undefined?'Not scheduled':new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'medium'}).format(new Date(Number(t)));
 function allowed(op,event,modal=false){
  const s=state.encoding;
  if(state.user?.role==='admin')return !modal||Number(document.querySelector('.modal')?.dataset.season||s?.year)===Number(s?.year||state.public?.branding?.year);
  if(!s||!state.online||performance.now()-anchor>30000||roleFor(op)!==state.user?.role)return false;
  if(modal&&Number(document.querySelector('.modal')?.dataset.season)!==s.year)return false;
  const clock=now(),base=state.user.role==='judge'?s.judge_open:s.manager_open;
  if(base&&(!s.enabled||state.user.role==='judge'&&!s.apply_judges||s.ends_at===null||clock<s.ends_at))return true;
  return (s.overrides||[]).some(o=>o.event_id===Number(event)&&o.operation===op&&clock<o.expires_at);
 }
 function statusText(){
  const s=state.encoding;if(!s)return 'Encoding permissions unavailable. Reconnecting to the official server…';
  let text=s.message+' Official timezone: Asia/Manila.';
  if(s.starts_at!==null)text+=' Opening: '+format(s.starts_at)+'.';
  if(s.ends_at!==null)text+=' Closing: '+format(s.ends_at)+'.';
  const boundary=s.enabled&&s.published?(now()<s.starts_at?s.starts_at:(s.manager_open?s.ends_at:null)):null;
  if(boundary!==null&&boundary!==undefined){const seconds=Math.max(0,Math.ceil((boundary-now())/1000)),days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60),rest=seconds%60;text+=' '+(now()<s.starts_at?'Opens in ':'Closes in ')+(days?days+'d ':'')+String(hours).padStart(2,'0')+':'+String(minutes).padStart(2,'0')+':'+String(rest).padStart(2,'0')+'.';}
  if(state.user?.role==='judge'&&!s.apply_judges&&s.published)text+=' Digital judges are exempt from this date lock.';
  if(s.overrides?.length)text+=' Limited emergency actions are authorized until their individual expiry; other actions remain locked.';
  return text;
 }
 function gate(el,can){if(!el.hasAttribute('data-encoding-baseline-disabled'))el.dataset.encodingBaselineDisabled=el.disabled?'1':'0';el.disabled=el.dataset.encodingBaselineDisabled==='1'||!can;el.dataset.encodingLocked=can?'0':'1';}
 function decorate(){
  const restricted=['manager','judge'].includes(state.user?.role),banner=document.getElementById('encoding-status');
  if(banner){banner.hidden=!restricted;if(restricted)banner.textContent=statusText();}
  const modal=document.querySelector('.modal');
  if(modal&&restricted){let notice=modal.querySelector('[data-encoding-notice]');if(!notice){notice=document.createElement('div');notice.className='callout encoding-modal-notice';notice.dataset.encodingNotice='1';modal.querySelector('.modal-body').prepend(notice);}notice.textContent=Number(modal.dataset.season)!==state.encoding?.year?'This form belongs to an earlier season and is permanently read-only. Close it and reload the active season.':statusText();}
  for(const [id,op,inputSelector] of [['placements-form','placement_save','.placement-select'],['correction-form','correction_request','.correction-select,textarea'],['judge-ballot-form','judge_save','[data-j-score]']]){
   const form=document.getElementById(id);if(!form)continue;const event=Number(form.dataset.id||form.dataset.event);
   form.querySelectorAll(inputSelector).forEach(el=>gate(el,allowed(op,event,true)));
   form.querySelectorAll('button[type="submit"]').forEach(el=>{const submitting=el.value==='submit';const required=id==='placements-form'?'placement_submit':id==='judge-ballot-form'?'judge_submit':'correction_request';gate(el,allowed(op,event,true)&&(!submitting||allowed(required,event,true)));});
  }
  document.querySelectorAll('[data-action="request-correction"]').forEach(el=>gate(el,allowed('correction_request',Number(el.dataset.id),!!el.closest('.modal'))));
  document.querySelectorAll('[data-j-action="manager-submit-judging"]').forEach(el=>gate(el,allowed('judged_results_submit',Number(el.dataset.jId),true)));
  for(const [selector,op,label] of [['[data-action="encode"]','placement_save','View Placements'],['[data-j-action="open-ballot"]','judge_save','View Score Sheet']])document.querySelectorAll(selector).forEach(el=>{if(!el.dataset.encodingLabel)el.dataset.encodingLabel=el.textContent;const locked=restricted&&!allowed(op,Number(el.dataset.id||el.dataset.jId));el.textContent=locked?label:el.dataset.encodingLabel;el.title=locked?'Encoding is locked; assigned records remain readable.':'';});
  const conflict=document.getElementById('encoding-draft-conflict');if(conflict)conflict.hidden=state.encodingDraft?.revision===state.encodingAdmin?.schedule?.revision&&state.encodingDraft?.year===state.encodingAdmin?.schedule?.year;
  const live=document.getElementById('encoding-admin-status');if(live)live.textContent=statusText();
 }
 async function refresh(){
  if(pending){refreshAgain=true;return pending;}
  const token=state.token;pending=(async()=>{try{const data=await api('/api/encoding/status');if(token!==state.token)return;state.encoding=data;serverTime=data.server_now;anchor=performance.now();decorate();}catch{state.encoding=null;decorate();}finally{pending=null;if(refreshAgain){refreshAgain=false;queueMicrotask(refresh);}}})();return pending;
 }
 async function loadAdmin(){
  if(state.user?.role!=='admin'){state.encodingAdmin=null;state.encodingDraft=null;return;}
  if(adminPending){adminAgain=true;return adminPending;}
  const token=state.token;adminPending=(async()=>{try{const data=await api('/api/admin/encoding/schedule');if(token===state.token&&state.user?.role==='admin'){state.encodingAdmin=data;decorate();}}finally{adminPending=null;if(adminAgain){adminAgain=false;queueMicrotask(()=>loadAdmin().catch(()=>{}));}}})();return adminPending;
 }
 function draft(){
  const saved=state.encodingAdmin?.schedule;if(!saved)return null;
  if(!state.encodingDraft)state.encodingDraft={year:saved.year,revision:saved.revision,enabled:saved.enabled,apply_judges:saved.apply_judges,start_date:saved.start_local?.slice(0,10)||'',start_time:saved.start_local?.slice(11)||'',end_date:saved.end_local?.slice(0,10)||'',end_time:saved.end_local?.slice(11)||'',reason:'',dirty:false};
  return state.encodingDraft;
 }
 function settings(){
  const data=state.encodingAdmin,d=draft();if(!d)return '<section id="encoding-settings" class="panel panel-pad"><h3>Official Intramurals Encoding Schedule</h3><p>Loading official server schedule…</p></section>';
  const s=data.schedule;
  const field=(id,label,type,value)=>`<div class="field-group"><label class="field-label" for="encoding-${id}">${label}</label><input class="text-field" id="encoding-${id}" name="${id}" type="${type}" value="${esc(value)}" ${type==='time'?'step="1"':''}></div>`;
  const subjects=[...(state.users||[]).filter(u=>u.role==='manager'&&u.active).map(u=>({value:'manager:'+u.id,label:'Manager · '+u.name})),...(state.judgingAdmin?.judges||[]).filter(u=>u.active).map(u=>({value:'judge:'+u.id,label:'Judge · '+u.name}))];
  return `<section id="encoding-settings" class="panel panel-pad encoding-settings"><div class="panel-title-row"><h3 class="panel-title">Official Intramurals Encoding Schedule</h3><span class="status-badge ${s.published?'approved':'returned'}">Season ${s.year} · ${s.published?'Published':'Locked / unpublished'}</span></div>
   <p class="muted small">Official timezone: Asia/Manila (UTC+08:00). Server time governs every protected write. Opening is inclusive; closing is exclusive. Admin reviews and approvals remain available.</p>
   <p id="encoding-admin-status" class="callout">${esc(statusText())}</p>
   <div id="encoding-draft-conflict" class="callout warning" hidden>Published schedule changed. Your draft is preserved. <button type="button" class="action-button secondary" data-e-action="rebase">Keep Draft &amp; Use Latest Revision</button></div>
   <form id="encoding-schedule-form"><div class="encoding-switches"><label><input name="enabled" type="checkbox" ${d.enabled?'checked':''}> Enable Date-Based Encoding Lock</label><label><input name="apply_judges" type="checkbox" ${d.apply_judges?'checked':''}> Apply to Digital Judges</label></div>
   <div class="brand-fields">${field('start_date','Official Encoding Start Date','date',d.start_date)}${field('start_time','Official Encoding Start Time','time',d.start_time)}${field('end_date','Optional Encoding End Date','date',d.end_date)}${field('end_time','Optional Encoding End Time','time',d.end_time)}</div>
   <div class="field-group"><label class="field-label" for="encoding-reason">Publication / change reason (15–800 characters)</label><textarea id="encoding-reason" class="text-field" name="reason" minlength="15" maxlength="800" required rows="2">${esc(d.reason)}</textarea></div>
   <div class="actions"><button type="button" class="action-button secondary" data-e-action="discard">Discard Schedule Draft</button><button type="submit" class="action-button">Publish Official Schedule</button></div></form>
   <details class="encoding-emergency"><summary>Admin Emergency Overrides · one person / event / action · maximum 30 minutes</summary><p class="muted small">Existing event assignments and scoring locks still apply. Managers and judges cannot create or extend overrides. Every grant, attempt and revocation is audited. Restoring a database invalidates emergency grants.</p>
   <form id="encoding-override-form" data-revision="${s.revision}" data-year="${s.year}"><div class="brand-fields"><div class="field-group"><label class="field-label" for="override-subject">Authorized person</label><select id="override-subject" name="subject" class="select-field" required><option value="">Choose one person</option>${subjects.map(u=>`<option value="${u.value}">${esc(u.label)}</option>`).join('')}</select></div><div class="field-group"><label class="field-label" for="override-event">Active scoring event</label><select id="override-event" name="event_id" class="select-field" required><option value="">Choose one event</option>${(state.events||[]).filter(e=>e.is_scoring_event).map(e=>`<option value="${e.id}">${esc(e.display_name||e.path||e.name)}</option>`).join('')}</select></div><div class="field-group"><label class="field-label" for="override-operation">Single allowed action</label><select id="override-operation" name="operation" class="select-field" required>${Object.entries(operations).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></div>${field('override_minutes','Duration (1–30 minutes)','number','5')}</div><div class="field-group"><label class="field-label" for="override-reason">Emergency reason</label><textarea id="override-reason" name="reason" class="text-field" minlength="15" maxlength="800" required></textarea></div><button class="action-button danger" type="submit">Grant Scoped Emergency Override</button></form>
   <div class="encoding-override-list">${s.overrides.filter(o=>!o.revoked_at&&o.expires_at>data.server_now).map(o=>`<form class="encoding-revoke-form" data-id="${esc(o.id)}" data-year="${s.year}" data-revision="${s.revision}"><p>${esc(o.role)} #${o.subject_id} · event #${o.event_id} · ${esc(operations[o.operation])} · expires ${esc(format(o.expires_at))}</p><label class="field-label">Revocation reason<input class="text-field" name="reason" minlength="15" maxlength="800" required></label><button class="action-button danger" type="submit">Revoke Override</button></form>`).join('')}</div></details>
   <details class="encoding-audit"><summary>Schedule &amp; emergency audit trail</summary><div class="table-wrap"><table class="report-table"><tr><th>Time · Asia/Manila</th><th>Action</th><th>Admin / actor</th><th>Reason</th></tr>${data.audit.map(row=>{let detail={};try{detail=JSON.parse(row.details);}catch{}return `<tr><td>${esc(format(Date.parse(row.created_at.replace(' ','T')+'Z')))}</td><td>${esc(row.action)}</td><td>${esc(row.user_id??'Judge / system')}</td><td>${esc(detail.reason||detail.revoke_reason||'Recorded system / scoped action')}</td></tr>`;}).join('')||'<tr><td colspan="4">No schedule changes published.</td></tr>'}</table></div></details></section>`;
 }
 function replaceSettings(){const node=document.getElementById('encoding-settings');if(node)node.outerHTML=settings();decorate();}
 function capture(){const form=document.getElementById('encoding-schedule-form'),d=draft();if(!form||!d)return;for(const name of ['start_date','start_time','end_date','end_time','reason'])d[name]=form.elements[name].value;for(const name of ['enabled','apply_judges'])d[name]=form.elements[name].checked;d.dirty=true;}
 async function submit(form){
  if(form.id==='encoding-schedule-form'){
   capture();const d=draft(),sent=JSON.stringify(d);if((!d.end_date)!==(!d.end_time))throw Error('Provide both optional closing date and time, or leave both empty');
   const data=await api('/api/admin/encoding/schedule',{method:'POST',body:JSON.stringify({expected_year:d.year,expected_revision:d.revision,timezone:'Asia/Manila',enabled:d.enabled,apply_judges:d.apply_judges,start_local:d.start_date&&d.start_time?d.start_date+'T'+d.start_time:'',end_local:d.end_date&&d.end_time?d.end_date+'T'+d.end_time:'',reason:d.reason})});
   state.encodingAdmin=data;if(JSON.stringify(state.encodingDraft)===sent){state.encodingDraft=null;replaceSettings();}else state.encodingDraft.revision=data.schedule.revision;
   await refresh();flash('Official encoding schedule published. Live permissions are synchronized.');return;
  }
  const fields=new FormData(form),p={expected_year:Number(form.dataset.year),expected_revision:Number(form.dataset.revision),reason:String(fields.get('reason')||'')};
  let path='/api/admin/encoding/overrides';
  if(form.classList.contains('encoding-revoke-form')){path+='/revoke';p.id=form.dataset.id;}else{const [role,id]=String(fields.get('subject')||'').split(':');Object.assign(p,{role,subject_id:Number(id),event_id:Number(fields.get('event_id')),operation:fields.get('operation'),minutes:Number(fields.get('override_minutes'))});}
  state.encodingAdmin=await api(path,{method:'POST',body:JSON.stringify(p)});if(!state.encodingDraft?.dirty)state.encodingDraft=null;replaceSettings();await refresh();flash('Scoped emergency authorization updated and recorded.');
 }
 document.addEventListener('input',e=>{if(e.target.closest('#encoding-schedule-form'))capture();});
 document.addEventListener('change',e=>{if(e.target.closest('#encoding-schedule-form'))capture();});
 document.addEventListener('submit',e=>{if(!e.target.matches('#encoding-schedule-form,#encoding-override-form,.encoding-revoke-form'))return;e.preventDefault();submit(e.target).catch(err=>flash(err.message,'bad'));});
 document.addEventListener('click',async e=>{const action=e.target.closest('[data-e-action]')?.dataset.eAction;if(!action)return;try{await loadAdmin();if(action==='discard'){state.encodingDraft=null;replaceSettings();}else if(action==='rebase'){const d=draft(),s=state.encodingAdmin.schedule;if(d.year!==s.year)throw Error('The season changed. Keep a copy of your draft, then discard it to edit the active season.');d.revision=s.revision;document.querySelectorAll('#encoding-override-form,.encoding-revoke-form').forEach(f=>f.dataset.revision=s.revision);decorate();flash('Draft preserved. Review the latest official schedule before publishing.');}}catch(err){flash(err.message,'bad');}});
 function start(){setInterval(()=>{const s=state.encoding;decorate();if(!s)return;const t=now(),boundary=[s.starts_at,s.ends_at,...(s.overrides||[]).map(o=>o.expires_at)].filter(x=>x!==null&&x<=t).join(',');if(boundary!==lastBoundary){lastBoundary=boundary;refresh();}},1000);setInterval(refresh,15000);}
 function clear(){state.encoding=null;state.encodingAdmin=null;state.encodingDraft=null;owner=state.token;}
 return {settings,decorate,refresh,loadAdmin,start,allowed,clear,dirty:()=>!!state.encodingDraft?.dirty,
  headers:(method,path)=>writeAction(method,path)?{'X-Panagsangka-Season':String(document.querySelector('.modal')?.dataset.season||state.encoding?.year||state.public?.branding?.year||'')}: {},
  connected:()=>{if(owner!==state.token){owner=state.token;state.encodingDraft=null;}return refresh();}};
}};
