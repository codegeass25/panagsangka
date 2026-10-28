/* A bounded audience feed in a dedicated region, outside the official score viewport. */
(()=>{'use strict';
window.PanagArenaComments={create(ctx){
 let settings=null,items=[],seen=new Set(),year=null,waitUntil=0,restricted=null,busy=false,message='',lastPaint='',localHidden=false,sendId=null,composerOpen=false,returnFocus=null;
 const root=()=>ctx.root(),$=s=>root()?.querySelector(s),live=()=>ctx.live()&&!document.hidden;
 window.visualViewport?.addEventListener('resize',()=>{if(composerOpen)viewportInset();});
 const channel=typeof BroadcastChannel==='function'?new BroadcastChannel(ctx.storagePrefix+':comments'):null;
 function markup(){return '<section class="arena-comments" data-comments-region aria-label="Live audience comments"><header><div><b>THE CROWD · LIVE COMMENTS</b><small>Audience entertainment · selected teams are unverified</small></div><button type="button" data-comment-toggle aria-pressed="false">Hide comments locally</button></header><div class="arena-comment-stage" data-comment-stage aria-live="off" aria-label="Recent audience comments"></div><button type="button" class="arena-comment-backdrop" data-a-action="fan-compose-close" aria-label="Close comment composer" hidden></button><form data-comment-form id="arena-comment-form" role="group" aria-label="Write a live audience comment"><div class="arena-compose-top"><strong>💬 Write a live comment</strong><button type="button" data-a-action="fan-compose-close" aria-label="Close comment composer">✕</button></div><label for="arena-comment-text">Cheer for your team respectfully…</label><div class="arena-comment-compose"><select data-comment-grade aria-label="Optional unverified team affiliation"><option value="">No team selected</option>'+[7,8,9,10,11,12].map(g=>'<option value="'+g+'">Grade '+g+' · unverified</option>').join('')+'</select><input id="arena-comment-text" data-comment-input autocomplete="off" maxlength="600" placeholder="Cheer for your team respectfully…"><button type="submit" data-comment-send>Send Comment</button></div><div class="arena-comment-help"><span data-comment-feedback role="status" aria-live="polite">Live comments are disabled.</span><span data-comment-count>0 / 120</span></div></form></section>';}
 function mount(){
  const h=$('[data-comments-region]');if(!h)return;
  h.querySelector('[data-comment-form]').addEventListener('submit',submit);
  h.querySelector('[data-comment-input]').addEventListener('input',()=>{sendId=null;paint();});
  h.querySelector('[data-comment-toggle]').addEventListener('click',()=>{localHidden=!localHidden;paint(true);});
  h.querySelector('[data-comment-grade]').addEventListener('change',e=>{const g=Number(e.target.value);if(g)ctx.selectGrade?.(g);});
  paint(true);
 }
 function composing(){return composerOpen;}
 function setGrade(grade){const el=$('[data-comment-grade]');if(el&&grade>=7&&grade<=12)el.value=String(grade);}
 function viewportInset(){const vv=window.visualViewport;if(!vv)return;const bottom=Math.max(0,window.innerHeight-vv.height-vv.offsetTop);root()?.style.setProperty('--fan-keyboard-offset',`${Math.round(bottom)}px`);}
 function openComposer(){if(!enabled())return false;const input=$('[data-comment-input]');if(!input)return false;returnFocus=document.activeElement;composerOpen=true;root()?.classList.add('arena-fan-composing');document.documentElement.classList.add('arena-comment-composing');viewportInset();paint(true);input.focus({preventScroll:true});return true;}
 function closeComposer(){if(!composerOpen)return;composerOpen=false;root()?.classList.remove('arena-fan-composing');document.documentElement.classList.remove('arena-comment-composing');root()?.style.removeProperty('--fan-keyboard-offset');paint(true);if(returnFocus?.isConnected) returnFocus.focus({preventScroll:true});returnFocus=null;}
 function enabled(){return !!settings?.enabled&&!settings.paused&&(settings.allow_closed||ctx.cheerAvailable());}
 function config(next){if(!next||ctx.year()&&next.year!==ctx.year())return;if(settings?.epoch&&next.epoch!==settings.epoch){reset();seen.clear();waitUntil=0;restricted=null;}if(year!==next.year){reset();seen.clear();restricted=null;waitUntil=0;year=next.year;}
  if(settings&&settings.epoch===next.epoch&&settings.year===next.year&&next.revision<settings.revision)return;const was=enabled();settings=next;
  if(!enabled())closeComposer();if(!settings.enabled||settings.paused)reset();
  if(!was&&enabled()&&ctx.live())ctx.ensure().catch(e=>{message=e.message;paint();});paint(true);
 }
 function accept(data){if(!data)return;config(data.settings);if(data.session_status)status({...data.session_status,year:data.settings.year});for(const c of data.feed||[])receive(c);paint();}
 function reset(){items=[];$('[data-comment-stage]')?.replaceChildren();}
 function status(data,share=false){
  if(data.year&&data.year!==year)return;restricted=data.restriction||null;waitUntil=performance.now()+Math.max(0,data.cooldown_ms||0,restricted?.retry_after_ms||0);lastPaint='';
  if(share)channel?.postMessage({token:ctx.token(),year,restriction:restricted,cooldown_ms:Math.max(0,waitUntil-performance.now()),sent:Date.now()});paint();
 }
 if(channel)channel.onmessage=e=>{if(e.data?.token!==ctx.token()||e.data.year!==year)return;status({...e.data,cooldown_ms:Math.max(0,e.data.cooldown_ms-Math.max(0,Date.now()-e.data.sent))});};
 function receive(c){
  if(!settings||!enabled()||!live()||c.year!==year||seen.has(c.id)||ctx.now()-c.created_at>=settings.visible_seconds*1000)return;
  seen.add(c.id);if(seen.size>200)seen.delete(seen.values().next().value);
  items.push(c);items=items.slice(-settings.max_visible);render();
 }
 function hide(data){if(data.year!==year)return;items=items.filter(x=>x.id!==data.id);render();}
 function render(){
  const stage=$('[data-comment-stage]');if(!stage)return;
  const before=new Map([...stage.children].map(n=>[Number(n.dataset.commentId),n.getBoundingClientRect().top]));
  const ids=new Set(items.map(x=>x.id));for(const el of [...stage.children])if(!ids.has(Number(el.dataset.commentId)))el.remove();
  for(const c of items){
   let el=stage.querySelector('[data-comment-id="'+c.id+'"]');
   if(!el){el=document.createElement('article');el.className='arena-comment-bubble';el.dataset.commentId=c.id;
    const emblem=document.createElement('span');emblem.className='arena-comment-emblem';emblem.textContent=c.grade?'G'+c.grade:'✦';const src=c.grade&&ctx.logo(c.grade);if(src){const img=document.createElement('img');img.src=src;img.alt='Selected Grade '+c.grade+' emblem (unverified affiliation)';emblem.replaceChildren(img);}
    const body=document.createElement('div'),name=document.createElement('strong'),text=document.createElement('p');
    name.textContent=c.nickname+(c.grade?' · Grade '+c.grade:'');text.textContent=c.text;
    body.append(name,text);el.append(emblem,body);stage.append(el);
    if(ctx.animate())el.animate([{opacity:0,transform:'translateY(16px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'ease-out'});
   }
  }
  for(const el of stage.children){const old=before.get(Number(el.dataset.commentId)),dy=old-el.getBoundingClientRect().top;if(old!==undefined&&dy&&ctx.animate())el.animate([{transform:'translateY('+dy+'px)'},{transform:'translateY(0)'}],{duration:240,easing:'ease-out'});}
 }
 function paint(force=false){
  const region=$('[data-comments-region]');if(!region)return;
  const max=settings?.max_length||120,remaining=Math.ceil(Math.max(0,waitUntil-performance.now())/1000),input=$('[data-comment-input]'),count=[...(input?.value||'')].length,permanent=restricted?.permanent,restrictedNow=!!restricted&&(permanent||restricted.expires_at>ctx.now());
  const fullscreen=!!document.fullscreenElement,displayAllowed=fullscreen?settings?.show_projector:settings?.show_arena;
  const minimized=!enabled()||localHidden||ctx.announcement()||ctx.view()==='podium'||!displayAllowed;
  region.dataset.minimized=String(!!minimized);region.dataset.composerOpen=String(composerOpen);region.hidden=fullscreen?!settings?.show_projector:!displayAllowed&&!composerOpen;const backdrop=$('.arena-comment-backdrop');if(backdrop)backdrop.hidden=!composerOpen;
  const key=JSON.stringify([remaining,busy,enabled(),count,max,restrictedNow,minimized,message,composerOpen]);if(!force&&key===lastPaint)return;lastPaint=key;
  const stage=$('[data-comment-stage]');stage.hidden=!!minimized;
  const b=$('[data-comment-send]');b.disabled=!enabled()||restrictedNow||busy||remaining>0||count<1||count>max;b.textContent=busy?(settings?.ai_moderation?'Checking comment…':'Sending…'):remaining?'Wait '+remaining+'s':'Send Comment';input.disabled=!enabled()||restrictedNow||busy;
  $('[data-comment-count]').textContent=count+' / '+max;
  $('[data-comment-feedback]').textContent=!enabled()?'Live comments are '+(settings?.paused?'paused by Admin.':'disabled.'):(restrictedNow?(permanent?'Commenting restricted until Admin revokes.':'Commenting restricted · '+remaining+'s remaining.'):(remaining?'Comment cooldown · '+remaining+'s remaining.':message||'Text and emojis only. Keep it respectful.'));
  const t=$('[data-comment-toggle]');t.textContent=localHidden?'Show comments locally':'Hide comments locally';t.setAttribute('aria-pressed',String(localHidden));
 }
 function tick(){
  if(!root())return;const before=items.length;items=items.filter(x=>settings&&ctx.now()-x.created_at<settings.visible_seconds*1000);if(items.length!==before)render();
  if(live()&&settings)for(const el of $('[data-comment-stage]')?.children||[]){const c=items.find(x=>x.id===Number(el.dataset.commentId));if(c)el.style.opacity=String(Math.min(1,Math.max(0,(settings.visible_seconds*1000-(ctx.now()-c.created_at))/(settings.fade_seconds*1000))));}
  paint();
 }
 async function submit(e){
  e.preventDefault();if(busy||!enabled()||waitUntil>performance.now())return;
  const input=$('[data-comment-input]');if(!input?.value.trim())return;busy=true;paint();
  if(!sendId)sendId=crypto.randomUUID?.()||String(Date.now())+'_'+Math.random().toString(36).slice(2);
  try{
   await ctx.ensure();const grade=Number($('[data-comment-grade]').value)||null;
   const r=await ctx.request('/api/arena/comments',{request_id:sendId,expected_year:year,text:input.value,grade});
   if(r.comment)receive(r.comment);status({...r.session_status,year},true);input.value='';sendId=null;message=r.warning||'Your comment is live!';closeComposer();
  }catch(err){
   const d=err.details||{};if(d.restriction)status({restriction:d.restriction,year},true);if(d.retry_after_ms)waitUntil=performance.now()+d.retry_after_ms;
   message=err.message;if(err.status===401){ctx.expire();await ctx.ensure().catch(()=>{});}
  }finally{busy=false;paint(true);}
 }
 function unmount(){closeComposer();reset();lastPaint='';}
 return {markup,mount,unmount,config,accept,status,receive,hide,reset,tick,enabled,paint,setGrade,openComposer,closeComposer,composing};
}};
})();
