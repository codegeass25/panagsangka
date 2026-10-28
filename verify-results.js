/* Verification Center: hierarchy and actions always use actual event IDs. */
(function(root,factory){
  const value=factory();
  if(typeof module==='object'&&module.exports)module.exports=value;
  else root.PanagVerify=value;
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const special=rule=>['saludo','emblem','singing'].includes(rule);
  const collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
  const queues={submitted:'New Submissions',corrections:'Correction Requests',returned:'Returned to Manager'};
  function timestamp(value){
    if(!value)return 0;
    const s=String(value).replace(' ','T'),n=Date.parse(/(?:Z|[+-]\d\d:\d\d)$/i.test(s)?s:s+'Z');
    return Number.isFinite(n)?n:0;
  }
  function approvalBlock(record,evidence){
    if(record.status!=='submitted')return 'Only submitted results can be approved.';
    if(!special(record.rule))return '';
    if(!evidence)return 'Checking current judge evidence…';
    if(evidence.error)return 'Judge evidence is unavailable. Refresh before approval.';
    const review=evidence.review;
    if(!evidence.ready||evidence.tie_groups?.length||JSON.stringify(evidence.entries)!==JSON.stringify(record.entries))
      return 'Judge results are incomplete, tied, or differ from this submission. Return for Manager review.';
    if(evidence.result_revision!==record.revision||!review||review.result_revision!==record.revision||
       review.entries!==JSON.stringify(record.entries)||!evidence.fingerprint||review.summary_fingerprint!==evidence.fingerprint)
      return 'Missing or outdated Event Manager verification. Return for Manager review.';
    return '';
  }
  function buildModel(events,results,corrections,evidence={}){
    const nodes=new Map(),duplicates=new Set();
    for(const event of events){
      if(!Number.isSafeInteger(event.id)||event.id<=0)continue;
      if(nodes.has(event.id))duplicates.add(event.id);
      else nodes.set(event.id,{event,children:[],chain:null});
    }
    for(const node of nodes.values()){
      const parent=nodes.get(node.event.parent_id);
      if(parent)parent.children.push(node);
    }
    function chain(node){
      if(node.chain)return node.chain;
      const seen=new Set(),out=[];let current=node;
      while(current){
        const e=current.event;
        if(seen.has(e.id)||duplicates.has(e.id)||e.active===0||e.active===false)return null;
        seen.add(e.id);out.unshift(current);
        if(e.parent_id===null){node.chain=out;return out;}
        current=nodes.get(e.parent_id);
      }
      return null;
    }
    const lists={submitted:[],corrections:[],returned:[]},unavailable=[],currentResults=new Map();
    for(const r of results)currentResults.set(r.event_id,currentResults.has(r.event_id)?null:r);
    const seen=new Set();
    function add(record,queue){
      const key=queue==='corrections'?'c:'+record.id:'r:'+record.event_id;
      if(seen.has(key))return;seen.add(key);
      const node=nodes.get(record.event_id),ancestors=node&&chain(node);
      if(!ancestors||node.event.is_scoring_event!==true||node.children.some(n=>n.event.active!==0&&n.event.active!==false)){
        unavailable.push({queue,record});return;
      }
      const event=node.event,path=event.path||ancestors.map(n=>n.event.name).join(' → ');
      let blocked='';
      if(queue==='corrections'){
        const official=currentResults.get(event.id);
        if(!Number.isSafeInteger(record.id)||record.id<=0)blocked='Invalid request reference.';
        else if(special(event.rule))blocked='Judge-scored results cannot accept manually proposed placements.';
        else if(!official||official.status!=='approved'||official.revision!==record.base_revision)
          blocked='Official results changed. This request requires reconciliation against the current official record.';
      }else if(!currentResults.get(event.id))blocked='Ambiguous result record. Refresh before reviewing.';
      const approvalReason=queue==='submitted'?blocked||approvalBlock({...record,rule:event.rule},evidence[event.id]):'';
      lists[queue].push({key,record,event,path,ancestors:ancestors.map(n=>n.event.id),blocked,approvalReason,
        actionable:queue!=='returned'&&!blocked,time:timestamp(queue==='corrections'?record.created_at:record.updated_at)});
    }
    for(const r of results)if(r.status==='submitted'||r.status==='returned')add(r,r.status);
    for(const r of corrections)if(r.status==='pending')add(r,'corrections');
    const counts=Object.fromEntries(Object.entries(lists).map(([key,items])=>[key,items.length]));
    counts.awaiting=lists.submitted.filter(i=>i.actionable).length+lists.corrections.filter(i=>i.actionable).length;
    return {nodes,queues:lists,counts,unavailable};
  }
  function selectQueue(model,options={}){
    const queue=options.tab in queues?options.tab:'submitted',query=String(options.search||'').trim().toLocaleLowerCase();
    const items=model.queues[queue].filter(i=>
      (!query||(i.event.name+' '+i.path).toLocaleLowerCase().includes(query))&&
      (!options.main||i.ancestors[0]===Number(options.main))&&
      (!options.category||i.ancestors.includes(Number(options.category)))&&
      (!options.readiness||(options.readiness==='ready'?!i.blocked&&!i.approvalReason:!!(i.blocked||i.approvalReason))));
    const visible=new Map(),roots=[];
    for(const item of items){
      let parent=null;
      for(const id of item.ancestors){
        let node=visible.get(id);
        if(!node){
          node={event:model.nodes.get(id).event,children:[],items:[],count:0,actionable:0,newest:0,depth:parent?parent.depth+1:0};
          visible.set(id,node);if(parent)parent.children.push(node);else roots.push(node);
        }
        node.count++;node.actionable+=Number(item.actionable);node.newest=Math.max(node.newest,item.time);parent=node;
      }
      parent.items.push(item);
    }
    function compare(a,b,isRoot){
      if(options.sort==='newest'&&a.newest!==b.newest)return b.newest-a.newest;
      if(isRoot){const order=(Number(a.event.sort_order)||0)-(Number(b.event.sort_order)||0);if(order)return order;}
      return collator.compare(a.event.name,b.event.name);
    }
    const pending=[roots];
    while(pending.length){const siblings=pending.pop();siblings.sort((a,b)=>compare(a,b,siblings===roots));for(const node of siblings)pending.push(node.children);}
    return {roots,visible,items,queue};
  }
  function create(ctx){
    const {state,esc,btn,gradeText,api}=ctx;
    const ui={tab:'submitted',search:'',main:'',category:'',readiness:'',sort:'event',expanded:new Map()};
    let evidence={},model=null,view=null,evidenceRun=0,inFlight=null,identity='',review=null;
    const doc=()=>document.getElementById('verify-center');
    const rendered=new WeakMap();
    const setHTML=(el,html)=>{if(el&&rendered.get(el)!==html){el.innerHTML=html;rendered.set(el,html);}};
    const date=value=>{const n=timestamp(value);return n?new Date(n).toLocaleString('en-PH',{timeZone:'Asia/Manila'})+' (Manila)':String(value||'Not recorded');};
    function reset(){
      evidenceRun++;evidence={};inFlight=null;model=null;review=null;identity='';
      Object.assign(ui,{tab:'submitted',search:'',main:'',category:'',readiness:'',sort:'event',expanded:new Map()});
    }
    function control(label,action,id=''){return '<button type="button" class="action-button secondary smallbtn" data-v-action="'+action+'" data-v-id="'+esc(id)+'">'+label+'</button>';}
    function shell(){
      return '<section id="verify-center" aria-label="Result verification center">'+
        '<div class="verify-heading"><div><div class="section-overline">ADMIN VERIFICATION</div><h3>Verification Center</h3><p class="muted small">Review final scoring events in their official event hierarchy.</p></div><div class="verify-awaiting" role="status"><strong data-v-count="awaiting">0</strong><span>Awaiting Admin Review</span></div></div>'+
        '<div class="verify-stats">'+Object.entries(queues).map(([key,name])=>'<button type="button" data-v-action="tab" data-v-id="'+key+'" aria-controls="verify-queue"><span>'+name+'</span><strong data-v-count="'+key+'">0</strong><small>'+(key==='returned'?'Awaiting manager resubmission':key==='corrections'?'Published scores stay official until approved':'Admin approval publishes official points')+'</small></button>').join('')+'</div>'+
        '<div class="verify-workspace panel"><div class="verify-tabs" role="tablist" aria-label="Verification queues">'+Object.entries(queues).map(([key,name])=>'<button type="button" role="tab" id="verify-tab-'+key+'" data-v-action="tab" data-v-id="'+key+'" aria-controls="verify-queue" aria-selected="false">'+name+' <span data-v-count="'+key+'">0</span></button>').join('')+'</div>'+
        '<div class="verify-filters">'+
        '<label>Search events<input type="search" class="search-field" data-v-filter="search" placeholder="Event name or full path" autocomplete="off"></label>'+
        '<label>Main Event<select class="select-field" data-v-filter="main" aria-label="Main Event"></select></label>'+
        '<label>Category / nested group<select class="select-field" data-v-filter="category" aria-label="Category or nested group"></select></label>'+
        '<label>Review readiness<select class="select-field" data-v-filter="readiness"><option value="">All in this queue</option><option value="ready">Ready for decision</option><option value="blocked">Approval unavailable</option></select></label>'+
        '<label>Sort by<select class="select-field" data-v-filter="sort"><option value="event">Natural event order</option><option value="newest">Newest submission</option></select></label></div>'+
        '<div class="verify-tools"><p data-v-visible role="status" class="muted small"></p><div>'+control('Expand All','expand')+control('Collapse All','collapse')+control('Clear filters','clear')+'</div></div>'+
        '<p data-v-unavailable class="callout warning" hidden></p><div id="verify-queue" role="tabpanel" tabindex="0" aria-labelledby="verify-tab-submitted"></div></div></section>';
    }
    function card(item){
      const r=item.record,isCorrection=ui.tab==='corrections',returned=ui.tab==='returned',attrs='data-reviewed-revision="'+Number(r.revision)+'"';
      let scores='';
      if(!isCorrection)scores='<div class="verify-scores">'+[7,8,9,10,11,12].map(g=>{
        let label='—',points='';
        try{const row=window.PanagScoring.gradeResult(item.event.rule,r.entries,g);label=row.placement_codes.join(' · ')||row.status;points='+'+row.points;}
        catch{label='Breakdown required';}
        return '<div><span>'+gradeText(g)+'</span><strong>'+esc(label)+'</strong><small>'+esc(points)+'</small></div>';
      }).join('')+'</div>';
      const manager=r.manager_review;
      return '<article class="verify-card" data-v-record="'+esc(item.key)+'">'+
        '<div class="verify-card-heading"><h4>'+esc(item.event.name)+'</h4><span class="status-badge '+(isCorrection?'submitted':esc(r.status))+'">'+(isCorrection?'Pending correction':esc(r.status))+'</span></div>'+
        '<p class="verify-path">'+esc(item.path)+'</p><p class="muted tiny">'+(isCorrection?'Requested':'Updated / submitted')+': '+esc(date(isCorrection?r.created_at:r.updated_at))+'</p>'+
        (isCorrection?'<p class="small">Manager: '+esc(r.manager_name||'Name not recorded')+'</p><div class="callout warning"><b>Documented reason:</b> '+esc(r.reason)+'</div>':scores)+
        (manager?'<p class="muted small">⚖ Manager verified'+(manager.manager_name?': '+esc(manager.manager_name):'')+' · '+esc(date(manager.reviewed_at))+'</p>':special(item.event.rule)?'<p class="muted small">Judge-derived results · Event Manager verification required</p>':'')+
        (r.comment?'<p class="callout warning"><b>'+(returned?'Return reason':'Previous note')+':</b> '+esc(r.comment)+'</p>':'')+
        (item.blocked||item.approvalReason?'<p class="callout warning" role="status">'+esc(item.blocked||item.approvalReason)+'</p>':'')+
        (returned?'<p class="muted small">Awaiting manager correction and resubmission. No Admin approval is pending.</p>':
          '<div class="approval-actions">'+(isCorrection?(!item.blocked?btn('Compare & Decide','review-correction',r.id,'smallbtn'):''):
            (!item.blocked?btn('View Breakdown','review',item.event.id,'secondary smallbtn',attrs)+btn('↩ Return','return',item.event.id,'danger smallbtn',attrs)+btn('✓ Approve Official Result','approve',item.event.id,'smallbtn',attrs+(item.approvalReason?' disabled':'')):''))+'</div>')+'</article>';
    }
    function group(node){
      const id=node.event.id,open=ui.expanded.has(id)?ui.expanded.get(id):node.depth<2,kind=node.depth===0?'Main Event':node.children.length?'Nested group':'Scoring event';
      return '<section class="verify-group '+(node.depth===0?'verify-root':'')+'" data-v-group="'+id+'"><h4 class="verify-group-heading"><button type="button" data-v-action="toggle" data-v-id="'+id+'" aria-expanded="'+open+'" aria-controls="verify-children-'+id+'"><span class="verify-chevron" aria-hidden="true">'+(open?'▾':'▸')+'</span><span class="verify-group-name"><small>'+kind+(node.depth>2?' · Level '+(node.depth+1):'')+'</small><strong>'+esc(node.event.name)+'</strong></span><span class="verify-group-count"><b>'+node.count+'</b><small>'+(ui.tab==='returned'?'returned':node.actionable+' need action')+'</small></span></button></h4><div id="verify-children-'+id+'" class="verify-children" '+(open?'':'hidden')+'>'+node.items.map(card).join('')+node.children.map(group).join('')+'</div></section>';
    }
    function update(){
      if(state.user?.role!=='admin'){if(identity)reset();return;}
      const currentIdentity=state.user.id+':'+(state.public?.branding?.year||'');
      if(identity&&identity!==currentIdentity)reset();identity=currentIdentity;
      if(!doc())return;
      model=buildModel(state.events,state.results,state.corrections,evidence);
      if(ui.main&&!model.nodes.has(Number(ui.main))){ui.main='';ui.category='';}
      if(ui.category&&!model.nodes.has(Number(ui.category)))ui.category='';
      view=selectQueue(model,ui);
      const root=doc(),focused=document.activeElement,focusKey=focused?.dataset?.vAction?focused.dataset.vAction+':'+focused.dataset.vId:null;
      const scroll={x:window.scrollX,y:window.scrollY};
      root.querySelectorAll('[data-v-count]').forEach(el=>{el.textContent=String(model.counts[el.dataset.vCount]);});
      root.querySelectorAll('[data-v-action="tab"]').forEach(el=>{
        const selected=el.dataset.vId===ui.tab;el.classList.toggle('active',selected);
        if(el.getAttribute('role')==='tab'){el.setAttribute('aria-selected',String(selected));el.tabIndex=selected?0:-1;}
        else el.setAttribute('aria-pressed',String(selected));
      });
      root.querySelector('#verify-queue').setAttribute('aria-labelledby','verify-tab-'+ui.tab);
      const all=model.queues[ui.tab],rootIds=new Set(all.map(i=>i.ancestors[0]));
      const mainOptions=[...rootIds].map(id=>model.nodes.get(id).event).sort((a,b)=>(Number(a.sort_order)||0)-(Number(b.sort_order)||0)||collator.compare(a.name,b.name));
      // Retain selected filters across queues, even when the new queue has no matches.
      if(ui.main&&!rootIds.has(Number(ui.main))&&model.nodes.has(Number(ui.main)))mainOptions.push(model.nodes.get(Number(ui.main)).event);
      setHTML(root.querySelector('[data-v-filter="main"]'),'<option value="">All Main Events</option>'+mainOptions.map(e=>'<option value="'+e.id+'">'+esc(e.name)+'</option>').join(''));
      const categoryIds=new Set(all.filter(i=>!ui.main||i.ancestors[0]===Number(ui.main)).flatMap(i=>i.ancestors.slice(1,-1)));
      if(ui.category&&model.nodes.has(Number(ui.category)))categoryIds.add(Number(ui.category));
      setHTML(root.querySelector('[data-v-filter="category"]'),'<option value="">All nested groups</option>'+[...categoryIds].map(id=>model.nodes.get(id).event).sort((a,b)=>collator.compare(a.path||a.name,b.path||b.name)).map(e=>'<option value="'+e.id+'">'+esc(e.path||e.name)+'</option>').join(''));
      root.querySelectorAll('[data-v-filter]').forEach(el=>{if(el.value!==ui[el.dataset.vFilter])el.value=ui[el.dataset.vFilter];});
      const unavailable=model.unavailable.filter(i=>i.queue===ui.tab).length,notice=root.querySelector('[data-v-unavailable]');
      notice.hidden=!unavailable;notice.textContent=unavailable+' record(s) have an inactive, missing, ambiguous, or non-scoring event reference. They are excluded from action counts and require event-record reconciliation.';
      root.querySelector('[data-v-visible]').textContent=view.items.length+' of '+all.length+' '+queues[ui.tab].toLowerCase()+' · '+view.roots.length+' Main Event(s)';
      const empty=all.length?'No events match these filters. Clear filters to see this queue.':ui.tab==='returned'?'No results are awaiting manager resubmission.':ui.tab==='corrections'?'No pending correction requests.':'No new submissions awaiting Admin review.';
      setHTML(root.querySelector('#verify-queue'),view.roots.map(group).join('')||'<div class="centered-empty"><span aria-hidden="true">✓</span><p>'+empty+'</p></div>');
      if(focusKey)[...root.querySelectorAll('[data-v-action]')].find(el=>el.dataset.vAction+':'+el.dataset.vId===focusKey)?.focus({preventScroll:true});
      if(window.scrollY!==scroll.y||window.scrollX!==scroll.x)window.scrollTo({left:scroll.x,top:scroll.y,behavior:'instant'});
      syncReview();
      if(all.some(i=>ui.tab==='submitted'&&special(i.event.rule)&&!evidence[i.event.id])&&!inFlight)refreshEvidence();
    }
    async function refreshEvidence(){
      if(state.user?.role!=='admin'||state.page!=='approvals')return;
      const run=++evidenceRun,token=state.token;
      const work=Promise.all(state.results.filter(r=>r.status==='submitted'&&special(r.rule)).map(async r=>{
        try{
          const d=await api('/api/judging/events/'+r.event_id+'/summary');
          const payload={event_id:d.event_id,config:d.config,criteria:d.criteria,participants:d.participants,progress:d.progress,ranking:d.ranking,tie_groups:d.tie_groups,entries:d.entries};
          const hash=await window.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
          return [r.event_id,{...d,fingerprint:Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('')}];
        }catch{return [r.event_id,{error:true}];}
      }));
      inFlight=work;
      const entries=await work;
      if(run!==evidenceRun||token!==state.token||state.user?.role!=='admin')return;
      evidence=Object.fromEntries(entries);inFlight=null;update();
    }
    function trackReview(kind,id,revision){review={kind,id:Number(id),revision:Number(revision)};}
    function syncReview(){
      const body=document.querySelector('#modal-root .modal-body');if(!review||!body)return;
      const fresh=review.kind==='correction'?state.corrections.find(r=>r.id===review.id):state.results.find(r=>r.event_id===review.id);
      const current=model?.queues.submitted.find(i=>i.event.id===review.id);
      const stale=review.kind==='correction'?!fresh||fresh.status!=='pending'||fresh.base_revision!==review.revision||!model?.queues.corrections.some(i=>i.record.id===review.id&&!i.blocked):!fresh||fresh.status!=='submitted'||fresh.revision!==review.revision||!current||!!current.blocked;
      let banner=body.querySelector('[data-v-conflict]');
      const approval=body.querySelector('[data-action=do-approve]');
      if(!stale&&approval&&current?.approvalReason){if(!banner){banner=document.createElement('p');banner.className='callout warning';banner.dataset.vConflict='';banner.setAttribute('role','alert');body.prepend(banner);}banner.textContent=current.approvalReason+' Close and reopen the current review.';approval.disabled=true;}
      if(stale&&!banner){banner=document.createElement('p');banner.className='callout warning';banner.dataset.vConflict='';banner.setAttribute('role','alert');banner.textContent='This review changed on another session. Your notes are preserved. Close and reopen the current record before deciding.';body.prepend(banner);}
      if(stale)body.querySelectorAll('[data-action="approve"],[data-action="return"],[data-action="do-approve"],[data-action="do-return"],[data-action="do-correction-approve"],[data-action="do-correction-reject"]').forEach(b=>b.disabled=true);
    }
    document.addEventListener('click',e=>{
      const b=e.target.closest('#verify-center [data-v-action]');if(!b||state.user?.role!=='admin')return;
      const action=b.dataset.vAction,id=b.dataset.vId;
      if(action==='tab')ui.tab=id;
      if(action==='toggle')ui.expanded.set(Number(id),!(ui.expanded.has(Number(id))?ui.expanded.get(Number(id)):view.visible.get(Number(id)).depth<2));
      if(action==='expand'||action==='collapse')for(const key of view.visible.keys())ui.expanded.set(key,action==='expand');
      if(action==='clear')Object.assign(ui,{search:'',main:'',category:'',readiness:'',sort:'event'});
      update();
    });
    document.addEventListener('input',e=>{if(e.target.matches('#verify-center [data-v-filter="search"]')){ui.search=e.target.value;update();}});
    document.addEventListener('change',e=>{
      if(!e.target.matches('#verify-center select[data-v-filter]'))return;
      const key=e.target.dataset.vFilter;ui[key]=e.target.value;if(key==='main')ui.category='';update();
    });
    document.addEventListener('keydown',e=>{
      if(!e.target.closest('#verify-center [role="tab"]')||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      e.preventDefault();const keys=Object.keys(queues),n=keys.indexOf(ui.tab);
      ui.tab=e.key==='Home'?keys[0]:e.key==='End'?keys.at(-1):keys[(n+(e.key==='ArrowRight'?1:2))%3];update();document.getElementById('verify-tab-'+ui.tab).focus();
    });
    return {shell,update,refreshEvidence,reset,trackReview,clearReview:()=>{review=null;},
      approvalReason:id=>{const item=buildModel(state.events,state.results,state.corrections,evidence).queues.submitted.find(i=>i.event.id===Number(id));return item?item.blocked||item.approvalReason:'This submission is no longer available for approval.';}};
  }
  return {buildModel,selectQueue,approvalBlock,timestamp,create};
});
