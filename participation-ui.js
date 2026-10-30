/* Public viewer Sports Participation Monitor. No admin data or write operations. */
(()=>{'use strict';
// Mirror backend/report-data.js monitor() from existing PUBLIC data only.
// The public endpoint already contains active scoring leaves and approved official entries.
// Never infer a "No Participation" from an unapproved or missing result.
function build(publicData,scoring){
 if(!publicData||!Array.isArray(publicData.event_catalog)||!Array.isArray(publicData.approved_results)||typeof scoring?.normalizeSports!=='function')throw Error('Official public sports data is not available yet');
 const grades=[7,8,9,10,11,12];
 const catalog=publicData.event_catalog,byId=new Map(catalog.map(e=>[Number(e.id),e]));
 const childIds=new Set(catalog.map(e=>Number(e.parent_id)).filter(Number.isInteger));
 const approved=new Map(publicData.approved_results.filter(r=>r.rule==='sports').map(r=>[Number(r.event_id),r]));
 const empty=()=>({status:'unknown',points:0,placements:[],placement_codes:[],placement_count:0,confirmed:false});
 const events=catalog.filter(e=>e.rule==='sports'&&e.is_scoring_event===true&&!childIds.has(Number(e.id))).map(e=>{
  const chain=[],seen=new Set();let current=e;
  while(current&&chain.length<60&&!seen.has(Number(current.id))){chain.unshift(current);seen.add(Number(current.id));current=byId.get(Number(current.parent_id));}
  const path=chain.map(node=>node.name).join(' > ');
  const main=(chain[0]?.name?.trim()?.toUpperCase()==='SPORTS GAMES'?(chain[1]||e):(chain[0]||e));
  const category=/\bgirls\b/i.test(path)?'Girls':/\bboys\b/i.test(path)?'Boys':/\bmixed\b/i.test(path)?'Mixed':'Unspecified';
  const result=approved.get(Number(e.id));let normalized=null;
  if(result){try{normalized=scoring.normalizeSports(result.entries,{draft:true});}catch{normalized=null;}}
  return {event_id:Number(e.id),path,main_id:Number(main.id),main_name:main.name,category,
   status:result?'approved':'unencoded',approved_at:result?.approved_at||null,
   grades:Object.fromEntries(grades.map(g=>[g,normalized?.grades[g]||empty()]))};
 });
 const summaries=grades.map(grade=>{
  const stats={grade,total_events:events.length,participated:0,placed:0,no_placement:0,none:0,unknown:0,placements:0,points:0};
  for(const e of events){const r=e.grades[grade];if(r.status==='placed'){stats.placed++;stats.participated++;}else if(r.status==='participated'){stats.no_placement++;stats.participated++;}else if(r.status==='none')stats.none++;else stats.unknown++;
   stats.placements+=r.placement_count;stats.points+=r.points;}
  stats.confirmed=stats.participated+stats.none;
  stats.participation_rate=stats.confirmed?Math.round(stats.participated/stats.confirmed*1000)/10:null;
  return stats;
 });
 return {year:publicData.season?.year||publicData.branding?.year,branding:publicData.branding,events,grades:summaries,total_scheduled:events.length,
  approved:events.filter(e=>e.status==='approved').length,
  rate_denominator:'Confirmed approved outcomes only; unknown and unapproved outcomes excluded'};
}
window.PanagViewerParticipation={build,create({state,api,esc,imageUrl}){

 let root=null,data=null,signature='',requestId=0,loading=false,selectedGrade=null;
 const grades=[7,8,9,10,11,12],labels={C:'Champion','1R':'1st Runner-up','2R':'2nd Runner-up','3R':'3rd Runner-up','4R':'4th Runner-up','5R':'5th Runner-up'};
 const filters={main:'',category:'',status:'all',search:'',sort:'event'};
 const $=q=>root?.querySelector(q);
 const human=g=>{const rec=(data?.branding||state.public?.branding)?.grades?.find(x=>Number(x.grade)===Number(g));return 'Grade '+g+(rec?.team_name?' - '+rec.team_name:'');};
 const emblem=g=>{const rec=(data?.branding||state.public?.branding)?.grades?.find(x=>Number(x.grade)===Number(g));const src=imageUrl(rec?.logo_thumb||rec?.logo_path);return src?`<img class="vpm-emblem" src="${esc(src)}" alt="Grade ${g} emblem" loading="lazy">`:`<span class="vpm-emblem vpm-emblem-fallback">G${g}</span>`;};
 const statusName=s=>s==='placed'?'Placed':s==='participated'?'Joined without placing':s==='none'?'No Participation':'Pending / Unknown';
 const prettyTime=x=>{if(!x)return 'Not approved';const dt=new Date(/^\d{4}-\d{2}-\d{2} /.test(x)?x.replace(' ','T')+'Z':x);return Number.isFinite(dt.getTime())?new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',year:'numeric',month:'short',day:'2-digit',hour:'numeric',minute:'2-digit',hour12:true}).format(dt):'Approved';};
 const fmt=n=>Number(n||0).toLocaleString('en-PH');
 const stat=(n,t)=>`<div class="vpm-stat"><strong>${fmt(n)}</strong><span>${esc(t)}</span></div>`;
 function markup(){return '<section id="viewer-participation" class="vpm"><div class="vpm-loading" role="status">Loading verified sports participation…</div></section>';}
 function contextKey(){const p=state.public;return p?JSON.stringify([p.season?.year,p.branding?.grades,p.event_catalog?.map(e=>[e.id,e.parent_id,e.name,e.rule,e.is_scoring_event]),p.approved_results?.map(r=>[r.event_id,r.rule,r.revision,r.approved_at,r.entries])]):'';}
 function update(){if(!root||state.user)return;const now=contextKey();if(now===signature&&data)return;
  if(!now){data=null;root.innerHTML='<div class="vpm-loading" role="status">Official public data is unavailable. <button type="button" data-vpm-action="refresh">Retry</button></div>';return;}
  try{const next=build(state.public,window.PanagScoring);data=next;signature=now;render();}
  catch(err){data=null;root.innerHTML=`<div class="vpm-failure" role="alert"><h3>Participation results unavailable</h3><p>${esc(err.message||'Unable to read official public data')}</p><button type="button" data-vpm-action="refresh">Retry loading</button></div>`;}
 }
 async function load(){if(!root||state.user||loading)return;loading=true;const id=++requestId;const indicator=$('[data-vpm-loading]');if(indicator)indicator.textContent='Refreshing official results…';
  try{const latest=await api('/api/public');if(id!==requestId||!root||state.user)return;
   // The existing public GET endpoint is the ONLY network source for this module.
   state.public=latest;signature='';update();
  }catch(err){if(id!==requestId||!root)return;const status=$('[data-vpm-loading]');if(status)status.textContent='Unable to refresh. Showing the last loaded figures.';
   else if(!data)root.innerHTML=`<div class="vpm-failure" role="alert"><h3>Participation results unavailable</h3><p>${esc(err.message||'Network connection failed')}</p><button type="button" data-vpm-action="refresh">Retry loading</button></div>`;
  }finally{if(id===requestId)loading=false;}
 }
 function awards(g){const count={C:0,'1R':0,'2R':0,'3R':0,'4R':0,'5R':0};for(const e of data?.events||[])for(const c of e.grades?.[g]?.placement_codes||[])if(Object.hasOwn(count,c))count[c]++;return count;}
 function gradeCard(g){const counts=awards(g.grade);const rate=g.participation_rate;const coverage=g.total_events?Math.round(g.confirmed/g.total_events*1000)/10:0;
  return `<article class="vpm-grade"><header>${emblem(g.grade)}<h3>${esc(human(g.grade))}</h3></header><div class="vpm-stats">${stat(g.total_events,'Displayed events')}${stat(g.participated,'Confirmed joined')}${stat(g.placed,'Events with placements')}${stat(g.no_placement,'Joined without placing')}${stat(g.none,'No Participation')}${stat(g.unknown,'Pending / Unknown')}${stat(g.placements,'Total earned placements')}${stat(g.points,'Approved sports points')}</div><div class="vpm-rate"><div><strong>${rate===null?'No confirmed outcomes':rate+'% of '+g.confirmed+' confirmed outcomes'}</strong><small>${coverage}% verification coverage</small></div><div class="vpm-track"><i style="width:${Math.min(100,Math.max(0,rate||0))}%"></i></div></div><div class="vpm-wins"><span>🏆 ${counts.C} Champion${counts.C===1?'':'s'}</span><span>🥈 ${counts['1R']} 1st R</span><span>🥉 ${counts['2R']} 2nd R</span></div><button type="button" class="vpm-view" data-vpm-action="grade" data-grade="${g.grade}">View Grade ${g.grade} details <span aria-hidden="true">→</span></button></article>`;
 }
 function renderSummary(){return `<header class="vpm-heading"><div><p class="vpm-overline">PANAGSANGKA · OFFICIAL LIVE RESULTS</p><h2>Sports Participation Monitor</h2><p>Approved outcomes only. Pending and unverified history stay distinct from confirmed No Participation.</p></div><div class="vpm-head-actions"><span data-vpm-loading role="status" aria-live="polite"></span><button type="button" class="vpm-reload" data-vpm-action="refresh">↻ Refresh</button></div></header><div class="vpm-insight"><strong>${fmt(data.total_scheduled)} scheduled sports events</strong><span>${fmt(data.approved)} approved event results · ${fmt(data.total_scheduled-data.approved)} awaiting official confirmation</span></div><div class="vpm-grade-grid">${data.grades.map(gradeCard).join('')}</div><p class="vpm-explain">Participation rate = confirmed joined ÷ confirmed outcomes (joined + confirmed No Participation). Verification coverage = confirmed outcomes ÷ displayed sports events. Multiple wins in one event count as one joined event but multiple earned placements.</p>`;}
 function option(value,title,selected){return `<option value="${esc(value)}" ${String(selected)===String(value)?'selected':''}>${esc(title)}</option>`;}
 function detailToolbar(){const mains=[...new Map(data.events.map(e=>[String(e.main_id),e.main_name])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'en',{numeric:true}));const cats=[...new Set(data.events.map(e=>e.category))].sort();
  return `<div class="vpm-toolbar"><label>Search event<input data-vpm-filter="search" type="search" placeholder="Search event / hierarchy…" value="${esc(filters.search)}"></label><label>Main sport<select data-vpm-filter="main">${option('','All sports',filters.main)}${mains.map(([id,title])=>option(id,title,filters.main)).join('')}</select></label><label>Category<select data-vpm-filter="category">${option('','All categories',filters.category)}${cats.map(c=>option(c,c,filters.category)).join('')}</select></label><label>Participation<select data-vpm-filter="status">${[['all','All outcomes'],['placed','Placed'],['participated','Joined without placing'],['none','No Participation'],['unknown','Pending / Unknown']].map(([v,t])=>option(v,t,filters.status)).join('')}</select></label><label>Sort<select data-vpm-filter="sort">${[['event','Event hierarchy'],['points','Highest official points'],['awards','Most awards'],['status','Participation status'],['recent','Latest approved']].map(([v,t])=>option(v,t,filters.sort)).join('')}</select></label></div>`;}
 function detailGrade(){const g=data.grades.find(x=>x.grade===selectedGrade);if(!g){selectedGrade=null;return renderSummary();}const counts=awards(g.grade);
  return `<header class="vpm-heading"><div><p class="vpm-overline">OFFICIAL PARTICIPATION RECORD</p><h2>${esc(human(g.grade))}</h2><p>Every scheduled sports event and its approved, read-only outcome.</p></div><div class="vpm-head-actions"><span data-vpm-loading role="status" aria-live="polite"></span><button class="vpm-reload" type="button" data-vpm-action="refresh">↻ Refresh</button><button class="vpm-back" type="button" data-vpm-action="back">← All grades</button></div></header><div class="vpm-selected"><div>${emblem(g.grade)}<div><strong>${esc(human(g.grade))}</strong><p>${g.confirmed} confirmed outcomes · ${g.unknown} pending / unknown</p></div></div><div class="vpm-pill-row"><span>🏆 ${counts.C} Champion</span><span>🥈 ${counts['1R']} 1st Runner-up</span><span>🥉 ${counts['2R']} 2nd Runner-up</span><span>🎖️ ${g.placements} total awards</span><span>⭐ ${g.points} sports points</span></div></div>${detailToolbar()}<div class="vpm-result-heading"><h3>Every recorded and pending sports event</h3><small data-vpm-count></small></div><div data-vpm-results></div><p class="vpm-explain">Placements follow official sports rules: Champion (C), 1st–5th Runner-up (1R–5R). Each approved event can award multiple places to one grade. Pending/Unknown entries have no confirmed result and never count as No Participation. Timestamps are displayed in Philippine time.</p>`;}
 function rows(){let list=data.events.map(e=>({...e,gradeRow:e.grades?.[selectedGrade]||{status:'unknown',placement_codes:[],placement_count:0,points:0}})).filter(e=>(!filters.main||String(e.main_id)===filters.main)&&(!filters.category||e.category===filters.category)&&(!filters.status||filters.status==='all'||e.gradeRow.status===filters.status)&&(!filters.search||e.path.toLocaleLowerCase().includes(filters.search.toLocaleLowerCase())));
  list.sort((a,b)=>{let diff=0;if(filters.sort==='points')diff=b.gradeRow.points-a.gradeRow.points;else if(filters.sort==='awards')diff=b.gradeRow.placement_count-a.gradeRow.placement_count;else if(filters.sort==='status')diff=a.gradeRow.status.localeCompare(b.gradeRow.status);else if(filters.sort==='recent')diff=String(b.approved_at||'').localeCompare(String(a.approved_at||''));return diff||a.path.localeCompare(b.path,'en',{numeric:true});});return list;}
 function drawRows(){const host=$('[data-vpm-results]');if(!host)return;const list=rows(),count=$('[data-vpm-count]');if(count)count.textContent=`${list.length} of ${data.events.length} sports events`;
  host.innerHTML=list.length?`<div class="vpm-table-wrap" role="region" aria-label="Grade ${selectedGrade} approved sports participation details" tabindex="0"><table class="vpm-table"><thead><tr><th>Sports event / hierarchy</th><th>Grade</th><th>Participation</th><th>All placements</th><th>Awards</th><th>Official points</th><th>Approval / date</th></tr></thead><tbody>${list.map(e=>{const r=e.gradeRow,display=r.placement_codes?.join(' · ')||'—';return `<tr><td data-col="Event"><strong>${esc(e.path)}</strong><small>${esc(e.category)}</small></td><td data-col="Grade">${esc(human(selectedGrade))}</td><td data-col="Participation"><span class="vpm-status is-${esc(r.status)}">${esc(statusName(r.status))}</span></td><td data-col="Placements"><span title="${esc((r.placement_codes||[]).map(c=>labels[c]||c).join(', '))}">${esc(display)}</span></td><td data-col="Awards">${fmt(r.placement_count)}</td><td data-col="Points"><strong>${fmt(r.points)}</strong></td><td data-col="Approval"><span class="vpm-approval ${e.status==='approved'?'yes':'pending'}">${e.status==='approved'?'Approved':'Pending / Unknown'}</span><small>${esc(e.status==='approved'?prettyTime(e.approved_at):'Not approved')}</small></td></tr>`;}).join('')}</tbody></table></div>`:'<div class="vpm-empty">No sports events match these filters. <button type="button" data-vpm-action="clear">Clear filters</button></div>';
 }
 function render(){if(!root||!data)return;root.innerHTML=selectedGrade===null?renderSummary():detailGrade();if(selectedGrade!==null)drawRows();}
 function click(e){const btn=e.target.closest('[data-vpm-action]');if(!btn||!root?.contains(btn))return;const action=btn.dataset.vpmAction;
  if(action==='grade'){const grade=Number(btn.dataset.grade);if(!grades.includes(grade))return;selectedGrade=grade;filters.main='';filters.category='';filters.status='all';filters.search='';filters.sort='event';render();root.scrollIntoView({block:'start',behavior:'instant'});}
  else if(action==='back'){selectedGrade=null;render();root.scrollIntoView({block:'start',behavior:'instant'});}
  else if(action==='refresh')load(true);
  else if(action==='clear'){Object.assign(filters,{main:'',category:'',status:'all',search:'',sort:'event'});render();}
 }
 function change(e){if(!e.target.matches('[data-vpm-filter]')||e.target.dataset.vpmFilter==='search')return;filters[e.target.dataset.vpmFilter]=e.target.value;drawRows();}
 function input(e){if(e.target.matches('[data-vpm-filter="search"]')){filters.search=e.target.value;drawRows();}}
 function mount(node){if(root===node)return;unmount();root=node;if(!root)return;root.addEventListener('click',click);root.addEventListener('change',change);root.addEventListener('input',input);update();}
 function unmount(){if(!root)return;root.removeEventListener('click',click);root.removeEventListener('change',change);root.removeEventListener('input',input);root=null;requestId++;loading=false;data=null;signature='';selectedGrade=null;Object.assign(filters,{main:'',category:'',status:'all',search:'',sort:'event'});}
 return {markup,mount,unmount,update};
}};
})();
