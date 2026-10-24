/* PANAGSANGKA Live Arena 3.0. Official data in, presentation only out. */
(()=>{'use strict';
const GRADES=[7,8,9,10,11,12],VIEWS=['race','compare','podium','latest'];
const LABELS={race:'Championship Race',compare:'Head-to-Head',cheer:'Cheer Battle',podium:'Current Leaders',latest:'Official Results'};
const COLORS={7:['#41f87c','65,248,124'],8:['#b576ff','181,118,255'],9:['#ff503e','255,80,62'],10:['#32c5ff','50,197,255'],11:['#ffbf36','255,191,54'],12:['#e1edff','225,237,255']};
const DEFAULT={revision:0,automation:'auto',view:'race',paused:false,duration:20,announcement_duration:10,intensity:'full',cheers_visible:true,compare:[7,8]};
const Core={
 key:(r,year)=>`${year}:${r.result_id??r.event_id}:${r.revision??r.approved_at??JSON.stringify(r.entries)}`,
 changes(before,after,year){const old=new Map(before.map(r=>[r.event_id,r]));return after.filter(r=>!old.has(r.event_id)||Core.key(old.get(r.event_id),year)!==Core.key(r,year)).map(r=>({result:r,kind:old.has(r.event_id)||r.is_correction?'updated':'new'}));},
 movements(before,after){const old=new Map(before.map(r=>[r.grade,r]));return after.map(row=>{const prior=old.get(row.grade)||row;const passed=after.filter(other=>other.grade!==row.grade&&old.has(other.grade)&&prior.points<old.get(other.grade).points&&row.points>other.points).map(x=>x.grade);return {grade:row.grade,from:prior.rank,to:row.rank,delta:row.points-prior.points,passed};});},
 leaders:rows=>rows.filter(r=>r.rank<=3),
 latest:rows=>rows.slice().sort((a,b)=>String(b.approved_at||'').localeCompare(String(a.approved_at||''))||(b.result_id||0)-(a.result_id||0)),
 accepts:(prior,next,retired)=>!next||!retired?.has(next.epoch)&&(!prior||prior.epoch!==next.epoch||next.sequence>=prior.sequence)
};
window.PanagArenaCore=Core;
function saved(key,fallback){try{return localStorage.getItem(key)??fallback;}catch{return fallback;}}
function save(key,value){try{localStorage.setItem(key,value);}catch{}}
function create(ctx){
 const {state,esc,imageUrl,apiBase,flash}=ctx;
 const storagePrefix='panag-arena-3:'+apiBase;
 const retiredSnapshotEpochs=new Set(),retiredAudienceEpochs=new Set();
 function retire(set,epoch){if(!epoch)return;set.add(epoch);if(set.size>32)set.delete(set.values().next().value);}
 let root=null,socket=null,socketHandlers=null,joined=null,joining=false,sessionPending=null,audienceToken=saved(storagePrefix+':audience',''),audienceExpires=0;
 let mode=saved(storagePrefix+':display','arena'),view='race',follow=true,compare=[7,8],config={...DEFAULT},configRevision=-1;
 const requested=new URLSearchParams(location.search).get('arena');if(requested){mode='arena';if(LABELS[requested]){view=requested;follow=false;}}
 let snapshot=null,meta=null,rows=[],previousRows=[],results=[],targetRows=[],seen=new Set(),seenYear=null,queue=[],active=null,replays=new Set(),standardMarkup='',returnView=null,movementHold=null,trailGeneration=0;
 let audience=null,audienceTime=0,cheerGrade=Number(saved(storagePrefix+':grade','7')),cooldownUntil=0,cheerBusy=false;
 let tickTimer=null,pollTimer=null,lastTick=performance.now(),rotationElapsed=0,lastReceipt=0,resizeObserver=null,counterFrame=0,particleFrame=0;
 let reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,motionOverride=saved(storagePrefix+':motion','system'),sound=false,audio=null,renderSignature='',counterValues=new Map(),lastMovements=[],audiencePaintKey='',connectionPaintKey='';
 const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
 const $=selector=>root?.querySelector(selector),all=selector=>root?[...root.querySelectorAll(selector)]:[];
 const intensity=()=>reduced||motionOverride==='reduced'?'reduced':motionOverride==='off'?'off':config.intensity;
 const animate=()=>intensity()==='full'&&!document.hidden;
 const isLive=()=>!!root&&mode==='arena';
 const localPreview=()=>window.PANAGSANGKA_CONFIG?.ARENA_LOCAL_PREVIEW===true&&['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&['localhost','127.0.0.1','[::1]'].includes(new URL(apiBase).hostname);
 function mascot(grade,extra=''){const item=snapshot?.branding?.grades?.find(g=>Number(g.grade)===grade),src=imageUrl(item?.logo_path||item?.logo_thumb);return src?`<img class="arena-mascot ${extra}" src="${esc(src)}" alt="Official Grade ${grade} logo" decoding="async">`:`<span class="arena-mascot arena-logo-fallback ${extra}" aria-label="Grade ${grade}">G${grade}</span>`;}
 function brandIcon(){const src=imageUrl(snapshot?.branding?.school_logo);return src?`<img src="${esc(src)}" alt="School seal">`:'<span aria-hidden="true">✦</span>';}
 const point=(r,g)=>Number.isFinite(r.points?.[g])?r.points[g]:null;
 const ordinal=n=>n===1?'1st':n===2?'2nd':n===3?'3rd':'#'+n;
 function rankText(row){const tied=targetRows.filter(r=>r.rank===row.rank).length>1;return (tied?'TIED ':'')+'#'+row.rank;}
 function markup(standard){return `<section id="ranking-experience" class="ranking-experience"><header class="arena-toolbar"><div><h2>Overall Ranking</h2><p>Official standings · approved results only</p></div><div class="arena-toolbar-actions"><div class="arena-display-switch" role="group" aria-label="Ranking display"><button type="button" data-a-action="standard">Standard</button><button type="button" data-a-action="arena">Live Arena</button></div><button type="button" class="arena-fullscreen" data-a-action="fullscreen" aria-label="Toggle fullscreen presentation">⛶ <span>Fullscreen</span></button><div class="arena-connection"><b data-a-live>CONNECTING</b><small data-a-updated>Waiting for official data</small></div></div></header><div data-a-standard>${standard}</div><div class="arena-broadcast" data-a-broadcast hidden></div></section>`;}
 function stadium(){return `<svg class="arena-stadium" viewBox="0 0 1440 700" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="arena-roof-shade" x2="0" y2="1"><stop stop-color="#052e65"/><stop offset="1" stop-color="#020a1c"/></linearGradient><pattern id="arena-seats" width="25" height="22" patternUnits="userSpaceOnUse"><path d="M5 6h8M2 16h8" stroke="#3886c9" stroke-width="2" opacity=".4"/></pattern></defs><path d="M0 0h1440v185Q720 50 0 185Z" fill="url(#arena-roof-shade)"/><path d="M0 62Q720 250 1440 62M0 100Q720 280 1440 100M0 145Q720 310 1440 145" fill="none" stroke="#2c6ca4" stroke-width="9" opacity=".24"/><path d="M0 175Q720 410 1440 175v250Q720 590 0 425Z" fill="url(#arena-seats)" opacity=".54"/><path d="M0 470Q720 580 1440 470M0 540Q720 650 1440 540" fill="none" stroke="#0f85cf" opacity=".3"/><path d="M720 700 0 510M720 700 300 550M720 700 1140 550M720 700 1440 510" stroke="#3396db" opacity=".2"/></svg><i class="arena-beam beam-one"></i><i class="arena-beam beam-two"></i><i class="arena-beam beam-three"></i><div class="arena-stars" aria-hidden="true"></div>`;}
 function build(){
  if(!root)return;
  $('[data-a-broadcast]').innerHTML=`<div class="arena-demo-banner" data-a-demo hidden>LOCAL PREVIEW · SIMULATED SCORES · ISOLATED TEST DATABASE</div><nav class="arena-mode-tabs" aria-label="Live Arena experiences">${Object.entries(LABELS).map(([key,label])=>`<button type="button" data-a-mode="${key}" aria-pressed="false">${{race:'▥',compare:'VS',cheer:'◖',podium:'♜',latest:'◈'}[key]} <span>${label}</span></button>`).join('')}<button type="button" class="arena-follow" data-a-action="follow" hidden>Follow broadcast ↗</button><button type="button" class="arena-motion-button" data-a-action="motion" title="Change your local animation preference">◌ <span data-a-motion-label>Motion</span></button></nav><div class="arena-viewport">${stadium()}<div class="arena-title"><div class="arena-brand-emblem" data-a-brand-icon></div><div><p class="arena-overline">THE OFFICIAL CHAMPIONSHIP BROADCAST</p><h1><span data-a-brand-name>PANAGSANGKA</span> <em data-a-year>2026</em></h1><p class="arena-tagline" data-a-tagline>ONE SCHOOL · ONE SPIRIT · HIGHER TOGETHER</p></div><div class="arena-live-badges"><span class="arena-live-flag" data-a-flag>● LIVE</span><span class="arena-viewer-count"><b data-a-viewers>—</b><small>connected arena sessions</small></span></div></div><div class="arena-scenes"><section class="arena-view arena-race" data-a-view="race" aria-label="Six official grade-level standings"><div class="arena-race-track"><svg class="arena-motion-trails" aria-hidden="true"></svg>${GRADES.map(g=>`<article class="arena-team-card" data-a-grade="${g}" style="--team:${COLORS[g][0]};--team-rgb:${COLORS[g][1]}"><div class="arena-medal" data-a-rank>—</div><div class="arena-card-face"><span class="arena-delta" data-a-delta hidden></span><div data-a-mascot></div><h3>GRADE ${g}</h3><div class="arena-points" data-a-points>—</div><span class="arena-points-label">OFFICIAL POINTS</span><div class="arena-movement" data-a-movement>—</div></div><div class="arena-pedestal"></div><span class="arena-rank-accessible" data-a-rank-accessible></span></article>`).join('')}</div><div class="arena-movement-strip" data-a-movement-strip role="status" aria-live="polite">Every official approval moves the championship forward.</div></section><section class="arena-view arena-comparison" data-a-view="compare" hidden><div class="arena-view-heading"><span class="arena-overline">HEAD-TO-HEAD SPOTLIGHT</span><h2>Every point. Every position.</h2><p>Compare any two grades using their official records.</p></div><div class="arena-comparison-selectors"><label>First grade<select data-a-compare="0">${GRADES.map(g=>`<option value="${g}">Grade ${g}</option>`).join('')}</select></label><span>VS</span><label>Second grade<select data-a-compare="1">${GRADES.map(g=>`<option value="${g}">Grade ${g}</option>`).join('')}</select></label></div><div data-a-comparison-cards></div></section><section class="arena-view arena-cheer" data-a-view="cheer" hidden><div class="arena-view-heading"><span class="arena-overline">THE CROWD HAS A VOICE</span><h2>CHEER FOR YOUR GRADE!</h2><p>Choose your team. Light up the arena.</p></div><div class="arena-cheer-grades">${GRADES.map(g=>`<button type="button" data-a-cheer-grade="${g}" style="--team:${COLORS[g][0]};--team-rgb:${COLORS[g][1]}" aria-pressed="false"><span data-a-cheer-logo="${g}"></span><strong>Grade ${g}</strong><small><b data-a-cheer-total="${g}">0</b> cheers</small><i><span data-a-cheer-meter="${g}"></span></i></button>`).join('')}</div><button type="button" class="arena-cheer-button" data-a-action="cheer">◖ CHEER NOW!</button><p class="arena-cheer-feedback" data-a-cheer-feedback role="status" aria-live="polite">Your cheer appears on connected arena screens.</p><div class="arena-cheer-footer"><strong>AUDIENCE ENERGY ONLY</strong><span>Cheers never change official points or rankings.</span><button type="button" data-a-action="share">Copy audience link ↗</button></div></section><section class="arena-view arena-podium" data-a-view="podium" hidden><div class="arena-view-heading"><span class="arena-overline">THE CHAMPIONSHIP IS STILL IN PLAY</span><h2>CURRENT LEADERS</h2><p data-a-podium-note>Live standings, not final champions.</p></div><div class="arena-podium-stage" data-a-podium></div></section><section class="arena-view arena-latest" data-a-view="latest" hidden><div class="arena-view-heading"><span class="arena-overline">VERIFIED. APPROVED. OFFICIAL.</span><h2>LATEST APPROVED RESULTS</h2><p>No projected scores. Only official placements.</p></div><div class="arena-latest-grid" data-a-latest-list></div></section></div><footer class="arena-result-ticker"><div class="arena-ticker-event"><span class="arena-overline">LATEST APPROVED RESULT</span><strong data-a-latest-name>Awaiting official results</strong><small data-a-latest-category>Approved results will appear here.</small></div><div class="arena-ticker-awards" data-a-latest-awards></div><div class="arena-energy" data-a-energy><span>AUDIENCE ENERGY <b data-a-total-cheers>0</b></span><div>${GRADES.map(g=>`<i style="--team:${COLORS[g][0]}" title="Grade ${g}"><span data-a-mini-meter="${g}"></span></i>`).join('')}</div><small>Cheers ≠ championship points</small></div></footer><div class="arena-announcement" data-a-announcement hidden role="status" aria-live="polite"></div><div class="arena-cheer-burst" data-a-cheer-burst hidden></div><canvas class="arena-particles" aria-hidden="true"></canvas><div class="arena-sequence-status"><span data-a-sequence-status>Official standings</span><i><span data-a-rotation-progress></span></i></div></div><div data-a-presenter></div>`;
  $('[data-a-demo]').hidden=!localPreview();
  renderSignature='';audiencePaintKey='';connectionPaintKey='';renderPresenter();
 }
 function mount(node){
  if(root===node)return;if(root)unmount();root=node;if(!root)return;
  build();root.addEventListener('click',click);root.addEventListener('change',change);root.addEventListener('submit',submit);
  root.addEventListener('keydown',keyDown);resizeObserver=new ResizeObserver(()=>layout(false));resizeObserver.observe($('.arena-race-track'));
  lastTick=performance.now();tickTimer=setInterval(tick,100);pollTimer=setInterval(()=>{if(isLive()&&!document.hidden)refreshAudience().catch(()=>{});},5000);
  syncDisplay();if(snapshot)paintAll(false);connectionChanged();
 }
 function unmount(){
  if(!root)return;leave();clearInterval(tickTimer);clearInterval(pollTimer);resizeObserver?.disconnect();cancelAnimationFrame(counterFrame);cancelAnimationFrame(particleFrame);
  root.removeEventListener('click',click);root.removeEventListener('change',change);root.removeEventListener('submit',submit);root.removeEventListener('keydown',keyDown);
  document.documentElement.classList.remove('arena-active');root=null;active=null;queue=[];rotationElapsed=0;returnView=null;movementHold=null;
 }
 function syncDisplay(){
  if(!root)return;root.dataset.display=mode;document.documentElement.classList.toggle('arena-active',mode==='arena');$('[data-a-standard]').hidden=mode==='arena';$('[data-a-broadcast]').hidden=mode!=='arena';
  if(mode==='standard'&&standardMarkup)$('[data-a-standard]').innerHTML=standardMarkup;
  all('[data-a-action="standard"],[data-a-action="arena"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.aAction===mode)));
  if(isLive()){ensureAudience().catch(showAudienceError);setView(view);layout(false);}else{leave();active=null;queue=[];$('[data-a-announcement]').hidden=true;}
  syncMotion();
 }
 function readSeen(year){seenYear=year;let items=[];try{items=JSON.parse(saved(storagePrefix+':seen:'+year,'[]'));}catch{}seen=new Set(Array.isArray(items)?items.slice(-1000):[]);}
 function persistSeen(){save(storagePrefix+':seen:'+seenYear,JSON.stringify([...seen]));}
 function markSeen(key,persist=true){seen.add(key);if(seen.size>1000)seen.delete(seen.values().next().value);if(persist)persistSeen();}
 function update(data,standard){
  if(!root)return;
  if(!data){connectionChanged();$('[data-a-sequence-status]').textContent='Waiting for the official API. No scores are being simulated.';return;}
  const nextMeta=data.arena_snapshot;if(!Core.accepts(meta,nextMeta,retiredSnapshotEpochs))return;
  if(meta&&nextMeta&&meta.epoch!==nextMeta.epoch)retire(retiredSnapshotEpochs,meta.epoch);
  if(typeof standard==='string')standardMarkup=standard;
  const year=Number(data.branding?.year||data.season?.year),baseline=!snapshot||Number(snapshot.branding?.year)!==year||!!meta&&!!nextMeta&&meta.epoch!==nextMeta.epoch;
  const changed=baseline||!meta||!nextMeta||meta.signature!==nextMeta.signature;
  lastReceipt=performance.now();
  if(!changed){meta=nextMeta||meta;renderPresenter();connectionChanged();return;}
  previousRows=rows.length?rows.map(r=>({...r})):data.standings.map(r=>({...r}));
  const oldResults=results;targetRows=data.standings.map(r=>({...r}));results=data.approved_results||[];snapshot=data;meta=nextMeta||null;
  if(seenYear!==year)readSeen(year);
  if(baseline){active=null;queue=[];returnView=null;movementHold=null;for(const r of results)markSeen(Core.key(r,year),false);persistSeen();rows=targetRows.map(r=>({...r}));lastMovements=[];if($('[data-a-announcement]'))$('[data-a-announcement]').hidden=true;}
  else{
   const changes=Core.changes(oldResults,results,year);
   for(const item of changes){const key=Core.key(item.result,year);if(seen.has(key))continue;markSeen(key);if(isLive()){
     if(active?.result.event_id===item.result.event_id){active={...active,result:item.result,kind:'updated',key};renderAnnouncement();}
     else{queue=queue.filter(q=>q.result.event_id!==item.result.event_id);queue.push({...item,key,elapsed:0});}
   }}
   queue=queue.filter(q=>results.some(r=>r.result_id===q.result.result_id&&r.revision===q.result.revision));
   if(active&&!results.some(r=>r.result_id===active.result.result_id&&r.revision===active.result.revision)&&!active.replay){active=null;$('[data-a-announcement]').hidden=true;}
   if(!active&&!queue.length){rows=targetRows.map(r=>({...r}));lastMovements=Core.movements(previousRows,rows);}
  }
  if(mode==='standard'&&standard)$('[data-a-standard]').innerHTML=standard;
  paintAll(!baseline&&!active&&!queue.length);renderPresenter();connectionChanged();
 }
 function paintAll(moving){
  if(!root||!snapshot)return;
  $('[data-a-brand-name]').textContent=snapshot.branding?.event_name||'PANAGSANGKA';$('[data-a-year]').textContent=snapshot.branding?.year||2026;
  $('[data-a-tagline]').textContent=snapshot.branding?.tagline||'';const icon=brandIcon();if($('[data-a-brand-icon]').innerHTML!==icon)$('[data-a-brand-icon]').innerHTML=icon;
  for(const g of GRADES){const node=$(`[data-a-grade="${g}"]`),row=rows.find(r=>r.grade===g)||targetRows.find(r=>r.grade===g);if(!row)continue;
   const logo=mascot(g);if(node.querySelector('[data-a-mascot]').innerHTML!==logo)node.querySelector('[data-a-mascot]').innerHTML=logo;
   const rank=node.querySelector('[data-a-rank]');rank.textContent=String(row.rank);node.dataset.rank=String(row.rank);node.dataset.tied=String(rows.filter(r=>r.rank===row.rank).length>1);
   node.querySelector('[data-a-rank-accessible]').textContent=rankText(row)+', Grade '+g+', '+row.points+' official points';
   const movement=lastMovements.find(m=>m.grade===g),label=node.querySelector('[data-a-movement]');
   label.textContent=movement&&movement.from!==movement.to?(movement.to<movement.from?'▲ ':'▼ ')+`#${movement.from} → #${movement.to}`:'—';label.dataset.direction=movement?.to<movement?.from?'up':movement?.to>movement?.from?'down':'same';
   const delta=node.querySelector('[data-a-delta]');if(delta){delta.hidden=!moving||!movement?.delta;delta.textContent=movement?.delta?`${movement.delta>0?'+':''}${movement.delta} pts`:'';delta.dataset.direction=movement?.delta<0?'down':'up';}
   node.classList.toggle('arena-card-updated',!!moving&&!!movement?.delta);
   if(!moving){node.querySelector('[data-a-points]').textContent=String(row.points);counterValues.set(g,row.points);}
   const cheerLogo=$(`[data-a-cheer-logo="${g}"]`);if(cheerLogo.innerHTML!==logo)cheerLogo.innerHTML=logo;
  }
  layout(moving);if(moving)countPoints();renderComparison();renderPodium();renderLatest();renderTicker();paintAudience();
  const passed=lastMovements.filter(m=>m.passed.length&&m.to<m.from);
  $('[data-a-movement-strip]').textContent=passed.length?passed.map(m=>`OVERTAKE! GRADE ${m.grade} MOVES UP TO #${m.to} · ahead of ${m.passed.map(g=>'Grade '+g).join(', ')}`).join('  •  '):lastMovements.some(m=>m.delta<0)?'OFFICIAL TOTALS UPDATED · approved corrections are reflected in these standings.':'Every official approval moves the championship forward.';
  if(moving&&passed.length){playSound('overtake');$('[data-a-movement-strip]').classList.add('is-overtake');setTimeout(()=>$('[data-a-movement-strip]')?.classList.remove('is-overtake'),5000);}
 }
 function layout(moving){
  const track=$('.arena-race-track');if(!track||track.clientWidth===0)return;
  const trails=track.querySelector('.arena-motion-trails'),trackRect=track.getBoundingClientRect(),generation=++trailGeneration;if(trails){trails.innerHTML='';trails.setAttribute('viewBox',`0 0 ${track.clientWidth} ${track.clientHeight}`);}
  const width=track.clientWidth,height=track.clientHeight,cols=width>=850?6:width<345?2:3,gap=width<600?10:14,groups=Math.ceil(6/cols),cardWidth=(width-gap*(cols-1))/cols,rowHeight=(height-gap*(groups-1))/groups;
  const ordered=(rows.length?rows:GRADES.map(grade=>({grade,rank:1,points:0})));
  ordered.forEach((r,i)=>{const node=$(`[data-a-grade="${r.grade}"]`);if(!node)return;const h=groups===1?Math.min(rowHeight-18,Math.max(210,rowHeight*(r.rank===1?.94:r.rank===2?.88:r.rank===3?.83:.77))):rowHeight-14;
   const x=(i%cols)*(cardWidth+gap),y=Math.floor(i/cols)*(rowHeight+gap)+rowHeight-h,transform=`translate3d(${x}px,${y}px,0)`;
   const from=getComputedStyle(node).transform,oldRect=node.getBoundingClientRect(),fromHeight=oldRect.height;
   node.getAnimations().forEach(a=>a.cancel());node.style.width=cardWidth+'px';node.style.height=h+'px';node.style.transform=transform;node.style.zIndex=String(10-r.rank);
   if(moving&&animate()&&from!=='none'){const animation=node.animate([{transform:from,height:fromHeight+'px'},{transform,height:h+'px'}],{duration:1100,easing:'cubic-bezier(.2,.75,.2,1)'});if(config.paused)animation.pause();
    if(trails){const ox=oldRect.x-trackRect.x+oldRect.width/2,oy=oldRect.y-trackRect.y+oldRect.height*.65,nx=x+cardWidth/2,ny=y+h*.65;if(Math.abs(nx-ox)>5||Math.abs(ny-oy)>5){const line=document.createElementNS('http://www.w3.org/2000/svg','path');line.setAttribute('d',`M${ox},${oy} C${ox},${oy-42} ${nx},${ny-42} ${nx},${ny}`);line.setAttribute('stroke',COLORS[r.grade][0]);trails.append(line);}}
   }
  });
  if(trails&&moving)setTimeout(()=>{if(root&&trailGeneration===generation)trails.innerHTML='';},1600);
 }
 function countPoints(){
  cancelAnimationFrame(counterFrame);const from=new Map(counterValues),start=performance.now(),duration=animate()?1000:0;let pauseOffset=0,last=start;
  function step(now){if(!root)return;if(config.paused){pauseOffset+=now-last;last=now;counterFrame=requestAnimationFrame(step);return;}last=now;const t=duration?Math.min(1,(now-start-pauseOffset)/duration):1,ease=1-Math.pow(1-t,3);
   for(const r of rows){const value=Math.round((from.get(r.grade)??r.points)+(r.points-(from.get(r.grade)??r.points))*ease);counterValues.set(r.grade,value);const el=$(`[data-a-grade="${r.grade}"] [data-a-points]`);if(el&&el.textContent!==String(value))el.textContent=String(value);}
   if(t<1)counterFrame=requestAnimationFrame(step);
  }counterFrame=requestAnimationFrame(step);
 }
 function setView(next,local=false){if(!LABELS[next])return;const changed=view!==next;view=next;if(local){follow=false;rotationElapsed=0;returnView=null;movementHold=null;}
  if(!root)return;all('[data-a-view]').forEach(el=>el.hidden=el.dataset.aView!==view);all('[data-a-mode]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.aMode===view)));$('[data-a-action="follow"]').hidden=follow;
  root.dataset.view=view;layout(false);if(changed&&view==='podium')playSound('podium');if(changed&&animate())$(`[data-a-view="${view}"]`)?.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:450,easing:'ease-out'});
 }
 function renderComparison(){
  if(!root)return;compare=compare.map(Number);if(compare[0]===compare[1])compare[1]=GRADES.find(g=>g!==compare[0]);
  all('[data-a-compare]').forEach(el=>{if(document.activeElement!==el)el.value=String(compare[Number(el.dataset.aCompare)]);});
  const a=targetRows.find(r=>r.grade===compare[0]),b=targetRows.find(r=>r.grade===compare[1]);if(!a||!b)return;
  const sum=a.points+b.points,pct=sum?a.points/sum*100:50,gap=Math.abs(a.points-b.points),recent=Core.latest(results).slice(0,3);
  $('[data-a-comparison-cards]').innerHTML=`<div class="arena-vs-cards">${[a,b].map((r,i)=>`${i?'<strong class="arena-vs-flare">VS</strong>':''}<article style="--team:${COLORS[r.grade][0]};--team-rgb:${COLORS[r.grade][1]}"><span class="arena-compare-rank">${esc(rankText(r))}</span>${mascot(r.grade)}<h3>GRADE ${r.grade}</h3><strong>${r.points.toLocaleString()}</strong><span>OFFICIAL POINTS</span></article>`).join('')}</div><div class="arena-gap-label"><span>EXACT POINT DIFFERENCE</span><b>${gap}</b><small>${gap===0?'LEVEL ON POINTS':`Grade ${a.points>b.points?a.grade:b.grade} leads this comparison`}</small></div><div class="arena-comparison-bar"><i style="width:${pct}%;background:${COLORS[a.grade][0]}"></i><i style="width:${100-pct}%;background:${COLORS[b.grade][0]}"></i></div><div class="arena-recent-performance"><h4>RECENT OFFICIAL PERFORMANCE</h4>${recent.length?recent.map(r=>`<div><span>${esc(r.event_name)}</span><b>G${a.grade}: ${point(r,a.grade)===null?'—':point(r,a.grade)+' pts'}</b><b>G${b.grade}: ${point(r,b.grade)===null?'—':point(r,b.grade)+' pts'}</b></div>`).join(''):'<p>Approved event records will appear here.</p>'}</div>`;
 }
 function renderPodium(){
  if(!root)return;const leaders=Core.leaders(targetRows),unique=leaders.length===3&&leaders.map(r=>r.rank).join(',')==='1,2,3',ordered=unique?[leaders[1],leaders[0],leaders[2]]:leaders;
  const signature=JSON.stringify([ordered,snapshot?.branding?.revision]);if($('[data-a-podium]').dataset.signature===signature)return;$('[data-a-podium]').dataset.signature=signature;
  $('[data-a-podium-note]').textContent=targetRows.every(r=>r.points===0)?'Awaiting approved points · all six grades currently tied.':unique?'Live standings, not final champions.':'Shared positions are shown equally · live standings, not final champions.';
  $('[data-a-podium]').classList.toggle('has-ties',!unique);
  $('[data-a-podium]').innerHTML=ordered.map(r=>`<article class="arena-podium-team podium-place-${Math.min(3,r.rank)}" style="--team:${COLORS[r.grade][0]};--team-rgb:${COLORS[r.grade][1]}"><div class="arena-podium-mascot">${mascot(r.grade)}</div><div class="arena-podium-platform"><span>${rankText(r)}</span><h3>GRADE ${r.grade}</h3><strong>${r.points.toLocaleString()}</strong><small>OFFICIAL POINTS</small></div></article>`).join('');
 }
 function awards(result,large=false){const placements=['champion','runner1','runner2'];return placements.map((placement,i)=>{const entry=Object.entries(result.entries||{}).find(([,p])=>p===placement);if(!entry)return '';const g=Number(entry[0]),pts=point(result,g);return `<article class="arena-award award-${i+1} ${large?'award-large':''}" style="--team:${COLORS[g]?.[0]||'#fff'};--reveal:${i*.3}s"><span>${ordinal(i+1)}</span>${mascot(g)}<strong>GRADE ${g}</strong><b>${pts===null?'Official placement':'+'+pts+' pts'}</b></article>`;}).filter(Boolean).join('');}
 function renderLatest(){
  if(!root)return;const latest=Core.latest(results).slice(0,4),signature=JSON.stringify([latest,snapshot?.branding?.revision]);if($('[data-a-latest-list]').dataset.signature===signature)return;$('[data-a-latest-list]').dataset.signature=signature;
  $('[data-a-latest-list]').innerHTML=latest.length?latest.map(r=>`<article class="arena-official-result"><div><span class="arena-overline">${r.is_correction?'OFFICIAL RESULT UPDATED':'APPROVED RESULT'} · ${esc(r.category||'OFFICIAL EVENT')}</span><h3>${esc(r.event_name)}</h3><small>${esc(r.approved_at?new Date(r.approved_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'}):'Verified by Admin')} · Manila</small></div><div class="arena-result-awards">${awards(r)}</div></article>`).join(''):'<div class="arena-empty"><span>◇</span><h3>The next chapter starts with an approval.</h3><p>Verified event winners will appear here. No results are being simulated.</p></div>';
 }
 function renderTicker(){const latest=Core.latest(results)[0];if(!root)return;$('[data-a-latest-name]').textContent=latest?.event_name||'Awaiting official results';$('[data-a-latest-category]').textContent=latest?(latest.is_correction?'Official result updated · ':'')+(latest.category||'Approved by Admin'):'Approved placements will appear here.';const html=latest?awards(latest):'<span class="arena-ticker-empty">The race is waiting for its first official result.</span>';if($('[data-a-latest-awards]').innerHTML!==html)$('[data-a-latest-awards]').innerHTML=html;}
 async function publicRequest(path,body){const response=await fetch(apiBase+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(audienceToken?{'X-Arena-Session':audienceToken}:{})},cache:'no-store',...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();if(!response.ok){const e=Error(data.error||'Audience connection unavailable');e.status=response.status;e.retryAfter=data.retry_after_ms;throw e;}return data;}
 async function ensureAudience(){
  if(sessionPending)return sessionPending;
  if(audienceToken&&audienceExpires>Date.now()+60000){join();return;}
  sessionPending=(async()=>{try{const data=await publicRequest('/api/arena/session',{session_token:audienceToken});audienceToken=data.session_token;audienceExpires=data.expires_at;save(storagePrefix+':audience',audienceToken);cooldownUntil=performance.now()+Math.max(0,data.cooldown_ms||0);acceptAudience(data);join();}finally{sessionPending=null;}})();return sessionPending;
 }
 async function refreshAudience(){if(!isLive())return;await ensureAudience();acceptAudience(await publicRequest('/api/arena/state'));}
 function acceptAudience(data){if(retiredAudienceEpochs.has(data.epoch)||audience&&audience.epoch===data.epoch&&(data.audience_revision<audience.audience_revision||data.server_now<audienceTime))return false;if(audience&&audience.epoch!==data.epoch){retire(retiredAudienceEpochs,audience.epoch);configRevision=-1;}audience=data;audienceTime=data.server_now||0;applyConfig(data.presentation);paintAudience();return true;}
 function showAudienceError(e){if($('[data-a-cheer-feedback]'))$('[data-a-cheer-feedback]').textContent=e.message;}
 function paintAudience(){
  if(!root)return;const totals=audience?.grade_cheers||{},max=Math.max(1,...Object.values(totals)),sum=audience?.total_cheers||0;
  const remaining=Math.ceil(Math.max(0,cooldownUntil-performance.now())/1000),key=JSON.stringify([totals,sum,audience?.connected_sessions,cheerGrade,remaining,cheerBusy,!!audienceToken,config.cheers_visible]);if(audiencePaintKey===key)return;audiencePaintKey=key;
  $('[data-a-viewers]').textContent=audience?String(audience.connected_sessions):'—';$('[data-a-total-cheers]').textContent=String(sum);$('[data-a-energy]').hidden=!config.cheers_visible;
  for(const g of GRADES){const total=Number(totals[g])||0;$(`[data-a-cheer-total="${g}"]`).textContent=String(total);$(`[data-a-cheer-meter="${g}"]`).style.width=total/max*100+'%';$(`[data-a-mini-meter="${g}"]`).style.height=total/max*100+'%';$(`[data-a-cheer-grade="${g}"]`).setAttribute('aria-pressed',String(cheerGrade===g));}
  const button=$('[data-a-action="cheer"]');button.disabled=cheerBusy||remaining>0||!audienceToken;button.textContent=remaining>0?`NEXT CHEER IN ${remaining}s`:'◖ CHEER NOW!';button.setAttribute('aria-label','Cheer now for Grade '+cheerGrade);
 }
 async function cheer(){
  if(cheerBusy||performance.now()<cooldownUntil)return;cheerBusy=true;paintAudience();
  try{await ensureAudience();const before=audience?.total_cheers||0,data=await publicRequest('/api/arena/cheers',{grade:cheerGrade});cooldownUntil=performance.now()+data.cooldown_ms;acceptAudience(data);$('[data-a-cheer-feedback]').textContent=`Grade ${cheerGrade}, your cheer is live! ${data.remaining} cheers left in your hourly allowance.`;showCheerBurst(cheerGrade);playSound('cheer');if(data.total_cheers>before)particles(COLORS[cheerGrade][0],false);}
  catch(e){if(e.retryAfter)cooldownUntil=performance.now()+e.retryAfter;if(e.status===401){audienceExpires=0;audienceToken='';save(storagePrefix+':audience','');}showAudienceError(e);}
  finally{cheerBusy=false;paintAudience();}
 }
 function showCheerBurst(grade){const el=$('[data-a-cheer-burst]');if(!el||!config.cheers_visible)return;el.style.setProperty('--team',COLORS[grade][0]);el.textContent=`GRADE ${grade} · THE CROWD IS WITH YOU!`;el.hidden=false;el.getAnimations().forEach(a=>a.cancel());if(animate())el.animate([{opacity:0,transform:'translate(-50%,20px) scale(.94)'},{opacity:1,transform:'translate(-50%,0) scale(1)'},{opacity:0,transform:'translate(-50%,-12px) scale(1)'}],{duration:2400,fill:'forwards'});setTimeout(()=>{if(el.isConnected)el.hidden=true;},2500);}
 function useSocket(next){
  if(socket===next)return;if(socket&&socketHandlers)for(const [name,fn] of Object.entries(socketHandlers))socket.off(name,fn);socket=next;joined=null;joining=false;
  socketHandlers={'connect':()=>{joined=null;join();connectionChanged();},'disconnect':()=>{joined=null;joining=false;connectionChanged();},'arena:state':data=>{const old=audience?.grade_cheers||{},delta=GRADES.find(g=>(data.grade_cheers?.[g]||0)>(old[g]||0)),accepted=acceptAudience(data);if(delta&&accepted&&isLive()){showCheerBurst(delta);playSound('cheer');}},'arena:presentation':data=>applyConfig(data),'arena:replay':data=>replay(data)};
  for(const [name,fn] of Object.entries(socketHandlers))socket.on(name,fn);join();
 }
 function join(){if(!isLive()||!audienceToken||!socket?.connected||joined===socket.id||joining)return;joining=true;socket.emit('arena:join',{session_token:audienceToken},data=>{joining=false;if(!isLive())return;if(data.ok){joined=socket.id;acceptAudience(data);}else{audienceExpires=0;if(data.status===401){audienceToken='';save(storagePrefix+':audience','');ensureAudience().catch(showAudienceError);}}});}
 function leave(){if(socket?.connected&&joined)socket.emit('arena:leave');joined=null;joining=false;}
 function applyConfig(next){
  if(!next||next.revision<=configRevision)return;const oldPaused=config.paused;config={...DEFAULT,...next};configRevision=config.revision;
  if(follow){compare=[...config.compare];setView(config.view);rotationElapsed=0;}
  syncMotion();if(root&&oldPaused!==config.paused)root.getAnimations({subtree:true}).forEach(a=>{try{config.paused?a.pause():a.play();}catch{}});
  renderPresenter();paintAudience();
 }
 function renderPresenter(){
  const host=$('[data-a-presenter]');if(!host)return;if(state.user?.role!=='admin'){host.innerHTML='';return;}
  if(!host.querySelector('#arena-presenter-form'))host.innerHTML=`<details class="arena-presenter"><summary>⚙ Presenter & broadcast controls <span>Admin only · separate from official scoring</span></summary><form id="arena-presenter-form"><label>Presentation<select name="automation"><option value="auto">Automatic rotation</option><option value="manual">Manual mode</option></select></label><label>Broadcast view<select name="view">${VIEWS.map(v=>`<option value="${v}">${LABELS[v]}</option>`).join('')}</select></label><label>Rotate every (seconds)<input name="duration" type="number" min="8" max="120" required></label><label>Result reveal (seconds)<input name="announcement_duration" type="number" min="6" max="30" required></label><label>Animation intensity<select name="intensity"><option value="full">Broadcast motion</option><option value="reduced">Reduced motion</option><option value="off">Minimal / static</option></select></label><label class="arena-control-check"><input type="checkbox" name="paused"> Pause transitions</label><label class="arena-control-check"><input type="checkbox" name="cheers_visible"> Show audience energy</label><button type="submit">Save broadcast settings</button></form><div class="arena-presenter-actions"><button type="button" data-a-action="pause">Pause transitions</button><button type="button" data-a-action="sound" aria-pressed="false">♩ Sound off</button><select data-a-replay-choice aria-label="Approved result to replay"></select><button type="button" data-a-action="replay">Replay approved result</button><span data-a-presenter-message role="status"></span></div><p>Broadcast mode, durations and pause state synchronize across connected screens. Sound and fullscreen remain local and require your interaction.</p></details>`;
  const form=host.querySelector('form');if(!form.contains(document.activeElement))for(const key of ['automation','view','duration','announcement_duration','intensity','paused','cheers_visible']){const el=form.elements[key];if(el.type==='checkbox')el.checked=!!config[key];else el.value=String(config[key]);}
  $('[data-a-action="pause"]').textContent=config.paused?'Resume transitions':'Pause transitions';$('[data-a-action="sound"]').textContent=sound?'♩ Sound on':'♩ Sound off';$('[data-a-action="sound"]').setAttribute('aria-pressed',String(sound));
  const select=$('[data-a-replay-choice]'),old=select.value,html=Core.latest(results).map(r=>`<option value="${r.result_id}">${esc(r.event_name)}</option>`).join('');if(select.innerHTML!==html){select.innerHTML=html;if([...select.options].some(o=>o.value===old))select.value=old;}$('[data-a-action="replay"]').disabled=!results.length;
 }
 async function saveConfig(values){
  if(state.user?.role!=='admin')throw Error('Admin presenter access required');
  const outcome=await ctx.PUT('/api/admin/arena/presentation',{expected_year:Number(snapshot?.branding?.year),expected_revision:config.revision,...values,compare:[...compare]});applyConfig(outcome.presentation);if(values.view!==undefined){follow=true;setView(outcome.presentation.view);rotationElapsed=0;}if($('[data-a-presenter-message]'))$('[data-a-presenter-message]').textContent='Broadcast settings synchronized.';
 }
 function replay(data){if(!isLive()||data.year!==Number(snapshot?.branding?.year)||replays.has(data.nonce))return;replays.add(data.nonce);if(replays.size>100)replays.delete(replays.values().next().value);const r=results.find(r=>r.result_id===data.result.result_id&&r.revision===data.result.revision);if(!r)return;queue.push({result:r,kind:r.is_correction?'updated':'new',key:'replay:'+data.nonce,replay:true,elapsed:0});}
 function renderAnnouncement(){
  if(!root||!active)return;const r=active.result,title=active.kind==='updated'?'OFFICIAL RESULT UPDATED':'OFFICIAL RESULT',winners=awards(r,true);
  $('[data-a-announcement]').innerHTML=`<div class="arena-announcement-ribbon">${active.replay?'REPLAY · ACTUAL APPROVED RESULT':active.kind==='updated'?'VERIFIED CORRECTION':'BREAKING RESULT'}</div><button type="button" class="arena-announcement-close" data-a-action="dismiss" aria-label="Dismiss result announcement">×</button><div class="arena-announcement-heading"><span>${title}</span><h2>${esc(r.event_name)}</h2><p>${esc(r.category||'Approved event')}</p></div><div class="arena-announcement-awards">${winners||'<p>Official participation placements verified. See the approved results.</p>'}</div><div class="arena-announcement-footnote">${active.replay?'Replay · no additional points awarded':active.kind==='updated'?'Corrected official totals replace the previous placements.':'Approved by the administrator · official points only'}</div><div class="arena-reveal-progress"><i></i></div>`;
  $('[data-a-announcement]').hidden=false;$('[data-a-announcement]').dataset.kind=active.kind;syncMotion();
 }
 function finishAnnouncement(){
  active=null;if($('[data-a-announcement]'))$('[data-a-announcement]').hidden=true;
  if(!queue.length){const old=rows.map(r=>({...r}));rows=targetRows.map(r=>({...r}));lastMovements=Core.movements(old,rows);paintAll(true);rotationElapsed=0;movementHold={remaining:1500,view:returnView||view};returnView=null;}
 }
 function tick(){
  if(!root)return;const now=performance.now(),dt=Math.min(500,now-lastTick);lastTick=now;paintAudience();connectionChanged();if(!isLive()||document.hidden)return;
  if(!config.paused){
   if(!active&&queue.length){if(returnView===null)returnView=movementHold?.view||view;movementHold=null;setView('race');active=queue.shift();active.elapsed=0;renderAnnouncement();playSound(active.kind==='updated'?'update':'result');particles(active.kind==='updated'?'#64caff':'#ffd24f',active.kind!=='updated');}
   if(active){active.elapsed+=dt;const progress=Math.min(1,active.elapsed/(config.announcement_duration*1000));const bar=$('.arena-reveal-progress i');if(bar)bar.style.width=progress*100+'%';if(progress>=1)finishAnnouncement();}
   else if(movementHold){movementHold.remaining-=dt;if(movementHold.remaining<=0){const next=movementHold.view;movementHold=null;setView(next);}}
   else if(follow&&config.automation==='auto'){rotationElapsed+=dt;if(rotationElapsed>=config.duration*1000){rotationElapsed=0;setView(VIEWS[(VIEWS.indexOf(view)+1)%VIEWS.length]);}}
  }
  $('[data-a-rotation-progress]').style.width=(follow&&config.automation==='auto'?Math.min(100,rotationElapsed/(config.duration*10)):0)+'%';
  const status=config.paused?'BROADCAST PAUSED · OFFICIAL DATA STILL UPDATES':active?'OFFICIAL RESULT REVEAL':movementHold?'LIVE RANKING MOVEMENT':follow&&config.automation==='auto'?'AUTO BROADCAST · '+LABELS[view]:!follow?'LOCAL AUDIENCE VIEW · '+LABELS[view]:'MANUAL BROADCAST · '+LABELS[view];if($('[data-a-sequence-status]').textContent!==status)$('[data-a-sequence-status]').textContent=status;
 }
 function connectionChanged(){
  if(!root)return;const fresh=!!snapshot&&lastReceipt>0&&performance.now()-lastReceipt<45000,online=state.online&&fresh;
  const key=JSON.stringify([online,socket?.connected,meta?.server_now]);if(connectionPaintKey===key)return;connectionPaintKey=key;
  $('[data-a-live]').textContent=online?(socket?.connected?'LIVE UPDATES':'LIVE · POLLING'):'RECONNECTING';$('[data-a-live]').dataset.online=String(online);
  $('[data-a-flag]').textContent=online?'● LIVE':'↻ RECONNECTING';$('[data-a-updated]').textContent=meta?.server_now?'Last verified: '+new Date(meta.server_now).toLocaleTimeString('en-PH',{timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit',second:'2-digit'})+' Manila':'Waiting for official data';
 }
 function syncMotion(){if(!root)return;root.dataset.intensity=intensity();root.classList.toggle('arena-paused',config.paused);const label=$('[data-a-motion-label]');if(label)label.textContent=motionOverride==='system'?(reduced?'Reduced motion':'Motion: system'):'Motion: '+motionOverride;if(intensity()!=='full'){cancelAnimationFrame(particleFrame);const canvas=$('.arena-particles');canvas?.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);} }
 function particles(color,celebration){
  if(!animate()||!isLive())return;cancelAnimationFrame(particleFrame);const canvas=$('.arena-particles'),viewport=$('.arena-viewport'),w=viewport.clientWidth,h=viewport.clientHeight;canvas.width=w;canvas.height=h;const painter=canvas.getContext('2d'),count=w<600?24:celebration?65:30,start=performance.now();
  const items=Array.from({length:count},()=>({x:Math.random()*w,y:celebration?-Math.random()*h*.6:h*.55,vx:(Math.random()-.5)*3,vy:celebration?1+Math.random()*3:-2-Math.random()*3,spin:Math.random()*6,size:3+Math.random()*5,color:Math.random()>.35?color:['#36c5ff','#fff2b0','#ff5a5a'][Math.floor(Math.random()*3)]}));
  function draw(time){if(!root||!animate()||time-start>4300){painter.clearRect(0,0,w,h);return;}if(config.paused){particleFrame=requestAnimationFrame(draw);return;}painter.clearRect(0,0,w,h);painter.globalAlpha=Math.min(1,(4300-(time-start))/800);for(const p of items){p.x+=p.vx;p.y+=p.vy;if(!celebration)p.vy+=.04;p.spin+=.05;painter.save();painter.translate(p.x,p.y);painter.rotate(p.spin);painter.fillStyle=p.color;painter.fillRect(-p.size/2,-p.size/2,p.size,p.size*.55);painter.restore();}particleFrame=requestAnimationFrame(draw);}particleFrame=requestAnimationFrame(draw);
 }
 async function toggleSound(){if(sound){sound=false;await audio?.close().catch(()=>{});audio=null;}else{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw Error('Sound is unavailable in this browser');audio=new Audio();await audio.resume();sound=true;playSound('podium');}renderPresenter();}
 function playSound(kind){if(!sound||audio?.state!=='running')return;const notes={result:[392,523,659,784],update:[440,554,659],overtake:[523,784],podium:[261,329,392],cheer:[587,784]}[kind]||[392,523,659];notes.forEach((frequency,i)=>{const oscillator=audio.createOscillator(),gain=audio.createGain(),time=audio.currentTime+i*.12;oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(.035,time+.03);gain.gain.exponentialRampToValueAtTime(.0001,time+.24);oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(time);oscillator.stop(time+.26);});}
 async function fullscreen(){if(document.fullscreenElement===root){await document.exitFullscreen();return;}if(root?.requestFullscreen)await root.requestFullscreen();else if(root?.webkitRequestFullscreen)root.webkitRequestFullscreen();else throw Error('Fullscreen is unavailable. Use the browser’s presentation mode.');}
 async function click(event){const el=event.target.closest('[data-a-action],[data-a-mode],[data-a-cheer-grade]');if(!el||!root?.contains(el))return;try{
  if(el.dataset.aMode){setView(el.dataset.aMode,true);return;}if(el.dataset.aCheerGrade){cheerGrade=Number(el.dataset.aCheerGrade);save(storagePrefix+':grade',String(cheerGrade));paintAudience();return;}
  switch(el.dataset.aAction){
   case 'standard':case 'arena':mode=el.dataset.aAction;save(storagePrefix+':display',mode);if(mode==='arena')rows=targetRows.map(r=>({...r}));syncDisplay();paintAll(false);break;
   case 'fullscreen':await fullscreen();break;
   case 'follow':follow=true;compare=[...config.compare];setView(config.view);rotationElapsed=0;break;
   case 'cheer':await cheer();break;
   case 'share':{const url=new URL(location.href);url.search='?arena=cheer';url.hash='';if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url.href);$('[data-a-cheer-feedback]').textContent='Audience link copied. Open it on another phone to join.';}else $('[data-a-cheer-feedback]').textContent=url.href;break;}
   case 'motion':motionOverride=motionOverride==='system'?'reduced':motionOverride==='reduced'?'off':'system';save(storagePrefix+':motion',motionOverride);syncMotion();layout(false);break;
   case 'pause':await saveConfig({paused:!config.paused});break;
   case 'sound':await toggleSound();break;
   case 'replay':{if(state.user?.role!=='admin')throw Error('Admin presenter access required');const r=results.find(r=>r.result_id===Number($('[data-a-replay-choice]').value));if(!r)throw Error('Choose an actual approved result');const response=await ctx.POST('/api/admin/arena/replay',{result_id:r.result_id,expected_revision:r.revision});replay(response.replay);break;}
   case 'dismiss':finishAnnouncement();break;
  }
 }catch(e){flash(e.message||String(e),'bad');}}
 function change(event){const el=event.target;if(el.matches('[data-a-compare]')){compare[Number(el.dataset.aCompare)]=Number(el.value);if(compare[0]===compare[1])compare[1-Number(el.dataset.aCompare)]=GRADES.find(g=>g!==Number(el.value));follow=false;$('[data-a-action="follow"]').hidden=false;renderComparison();}}
 async function submit(event){if(event.target.id!=='arena-presenter-form')return;event.preventDefault();const form=event.target,button=form.querySelector('button[type=submit]');button.disabled=true;try{const fd=new FormData(form);await saveConfig({automation:fd.get('automation'),view:fd.get('view'),duration:Number(fd.get('duration')),announcement_duration:Number(fd.get('announcement_duration')),intensity:fd.get('intensity'),paused:fd.get('paused')==='on',cheers_visible:fd.get('cheers_visible')==='on'});}catch(e){flash(e.message,'bad');refreshAudience().catch(()=>{});}finally{button.disabled=false;}}
 function keyDown(event){if(event.key==='Escape'&&active)finishAnnouncement();}
 motionQuery.addEventListener?.('change',event=>{reduced=event.matches;syncMotion();layout(false);});
 document.addEventListener('fullscreenchange',()=>{if(root){root.dataset.fullscreen=String(document.fullscreenElement===root);layout(false);}});
 document.addEventListener('visibilitychange',()=>{lastTick=performance.now();if(!document.hidden&&isLive()){refreshAudience().catch(()=>{});layout(false);}});
 return {markup,mount,unmount,update,useSocket,connectionChanged};
}
window.PanagArena={create};
})();
