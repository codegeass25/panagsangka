/* Verification Center: hierarchy and actions always use actual event IDs. */
(function(root,factory){
  const value=factory();
  if(typeof module==='object'&&module.exports)module.exports=value;
  else root.PanagVerify=value;
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const special=rule=>['saludo','emblem','singing'].includes(rule);
  const collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
  const queues={all:'All Results',submitted:'Needs Approval',returned:'Returned',corrections:'Correction Requests',approved:'Approved',draft:'Drafts'};
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
    const id=value=>Number.isSafeInteger(value)&&value>0?value:typeof value==='string'&&/^[1-9]\d*$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value):0;
    const active=e=>e.active!==0&&e.active!==false&&e.active!=='0';
    const nodes=new Map(),duplicates=new Set();
    for(const source of events){
      const event={...source,id:id(source.id),parent_id:source.parent_id===null?null:id(source.parent_id)};
      if(!event.id)continue;
      if(nodes.has(event.id))duplicates.add(event.id);
      else nodes.set(event.id,{event,children:[],chain:null});
    }
    for(const node of nodes.values()){const parent=nodes.get(node.event.parent_id);if(parent)parent.children.push(node);}
    function chain(node){
      if(node.chain)return node.chain;
      const seen=new Set(),out=[];let current=node;
      while(current){
        const e=current.event;
        if(seen.has(e.id)||duplicates.has(e.id)||!active(e))return null;
        seen.add(e.id);out.unshift(current);
        if(e.parent_id===null){node.chain=out;return out;}
        current=nodes.get(e.parent_id);
      }
      return null;
    }
    const lists={all:[],submitted:[],returned:[],corrections:[],approved:[],draft:[]},unavailable=[],currentResults=new Map();
    for(const r of results){const key=id(r.event_id);currentResults.set(key,currentResults.has(key)?null:r);}
    const seen=new Set();
    function add(source,kind){
      const record={...source,event_id:id(source.event_id),...(kind==='correction'?{id:id(source.id)}:{})};
      const key=kind==='correction'?'c:'+record.id:'r:'+record.event_id;
      if(seen.has(key))return;seen.add(key);
      const node=nodes.get(record.event_id),ancestors=node&&chain(node);
      const valid=record.event_active!==false&&record.is_scoring_event!==false&&!!ancestors&&(node.event.is_scoring_event===true||node.event.is_scoring_event===1)&&!node.children.some(n=>active(n.event));
      const event=valid?node.event:{id:record.event_id,name:record.event_name||'Unavailable event reference',rule:record.rule};
      const path=valid?(event.path||ancestors.map(n=>n.event.name).join(' → ')):(record.event_path||record.event_name||'Event ID '+(record.event_id||'unavailable'));
      let blocked=valid?'':'This event reference is inactive, missing, ambiguous, or no longer a valid scoring event. This record is read-only.';
      const pending=kind==='correction'&&record.status==='pending';
      if(record.entries_valid===false)blocked='Saved score data cannot be read safely. This record is read-only and requires reconciliation.';
      if(valid&&!blocked&&pending){
        const official=currentResults.get(event.id);
        if(!record.id)blocked='Invalid request reference.';
        else if(special(event.rule))blocked='Judge-scored results cannot accept manually proposed placements.';
        else if(!official||official.status!=='approved'||Number(official.revision)!==Number(record.base_revision))
          blocked='Official results changed. This request requires reconciliation against the current official record.';
      }else if(valid&&!blocked&&kind==='result'&&!currentResults.get(event.id))blocked='Ambiguous result record. Refresh before reviewing.';
      const approvalReason=kind==='result'&&record.status==='submitted'?blocked||approvalBlock({...record,rule:event.rule},evidence[event.id]):'';
      const item={key,kind,record,event,path,ancestors:valid?ancestors.map(n=>n.event.id):[],valid,blocked,approvalReason,
        actionable:!blocked&&(kind==='result'?record.status==='submitted':pending),
        time:timestamp(kind==='correction'?record.created_at:record.updated_at)};
      if(!valid)unavailable.push(item);
      if(kind==='correction')lists.corrections.push(item);
      else{lists.all.push(item);if(['submitted','returned','approved','draft'].includes(record.status))lists[record.status].push(item);}
    }
    for(const r of results)add(r,'result');
    for(const r of corrections)add(r,'correction');
    const counts=Object.fromEntries(Object.entries(lists).map(([key,items])=>[key,items.length]));
    counts.pendingCorrections=lists.corrections.filter(i=>i.record.status==='pending').length;
    counts.awaiting=lists.submitted.filter(i=>i.actionable).length+lists.corrections.filter(i=>i.actionable).length;
    return {nodes,queues:lists,counts,unavailable};
  }
  function selectQueue(model,options={}){
    const queue=options.tab in queues?options.tab:'all',query=String(options.search||'').trim().toLocaleLowerCase();
    const items=model.queues[queue].filter(i=>
      (!query||(i.event.name+' '+i.path).toLocaleLowerCase().includes(query))&&
      (!options.status||i.record.status===options.status)&&
      (!options.main||i.ancestors[0]===Number(options.main))&&
      (!options.category||i.ancestors.includes(Number(options.category)))&&
      (!options.readiness||(options.readiness==='ready'?i.actionable&&!i.approvalReason:!!(i.blocked||i.approvalReason))));
    const visible=new Map(),roots=[],unavailable=[];
    for(const item of items){
      if(!item.valid){unavailable.push(item);continue;}
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
    unavailable.sort((a,b)=>options.sort==='newest'?b.time-a.time:collator.compare(a.path,b.path));
    return {roots,visible,items,unavailable,queue};
  }
  async function loadVerification(state,api,isCurrent=()=>true){
    if(!state.verificationData||state.verificationOwner!==state.token){
      state.verificationOwner=state.token;state.verificationData={};state.events=[];state.results=[];state.corrections=[];
      for(const key of ['events','results','corrections'])state.verificationData[key]={loaded:false,loading:false,error:'',updatedAt:0};
    }
    const run=(state.verificationRequest||0)+1;state.verificationRequest=run;
    const resources=[['events','/api/events','events'],['results','/api/admin/results','results'],['corrections','/api/admin/corrections','requests']];
    await Promise.all(resources.map(async([key,path,field])=>{
      const previous=state.verificationData[key];state.verificationData[key]={...previous,loading:true};
      try{
        const response=await api(path);
        if(!Array.isArray(response?.[field]))throw Error('Unexpected response from '+path+'; expected '+field+' data.');
        if(!isCurrent()||run!==state.verificationRequest)return;
        state[key]=response[field];
        state.verificationData[key]={loaded:true,loading:false,error:'',status:200,updatedAt:Date.now(),path};
      }catch(error){
        if(!isCurrent()||run!==state.verificationRequest)return;
        state.verificationData[key]={...previous,loading:false,error:error.message||'Request failed',status:error.status||0,path};
      }
    }));
    return state.verificationData;
  }
  function create(ctx){
    const {state,esc,btn,gradeText,api,loadAll}=ctx;
    const ui={tab:'all',search:'',main:'',category:'',status:'',readiness:'',sort:'event',expanded:new Map()};
    let evidence={},model=null,view=null,evidenceRun=0,inFlight=null,identity='',review=null;
    const doc=()=>document.getElementById('verify-center');
    const rendered=new WeakMap();
    const setHTML=(el,html)=>{if(el&&rendered.get(el)!==html){el.innerHTML=html;rendered.set(el,html);}};
    const date=value=>{const n=timestamp(value);return n?new Date(n).toLocaleString('en-PH',{timeZone:'Asia/Manila'})+' (Manila)':String(value||'Not recorded');};
    function reset(){
      evidenceRun++;evidence={};inFlight=null;model=null;review=null;identity='';
      Object.assign(ui,{tab:'all',search:'',main:'',category:'',status:'',readiness:'',sort:'event',expanded:new Map()});
    }
    function control(label,action,id=''){return '<button type="button" class="action-button secondary smallbtn" data-v-action="'+action+'" data-v-id="'+esc(id)+'">'+label+'</button>';}
    function shell(){
      return '<section id="verify-center" aria-label="Result verification center">'+
        '<div class="verify-heading"><div><div class="section-overline">ADMIN VERIFICATION</div><h3>Verification Center</h3><p class="muted small">All recorded results and correction requests, organized by their official event hierarchy.</p></div><div class="verify-awaiting" role="status"><strong data-v-count="awaiting">—</strong><span>Awaiting Admin Review</span></div></div>'+
        '<div class="verify-workspace panel"><div class="verify-tabs" role="tablist" aria-label="Verification queues">'+Object.entries(queues).map(([key,name])=>'<button type="button" role="tab" id="verify-tab-'+key+'" data-v-action="tab" data-v-id="'+key+'" aria-controls="verify-queue" aria-selected="false">'+name+' <span data-v-count="'+key+'">—</span></button>').join('')+'</div>'+
        '<div class="verify-data-row"><p data-v-data-summary role="status" class="muted small">Loading verification data…</p>'+control('Refresh data','retry')+'</div>'+
        '<div data-v-load-error class="callout error" role="alert" hidden></div>'+
        '<div class="verify-filters">'+
        '<label>Search events<input type="search" class="search-field" data-v-filter="search" placeholder="Event name or full path" autocomplete="off"></label>'+
        '<label>Main Event<select class="select-field" data-v-filter="main" aria-label="Main Event"></select></label>'+
        '<label>Category / nested group<select class="select-field" data-v-filter="category" aria-label="Category or nested group"></select></label>'+
        '<label>Status<select class="select-field" data-v-filter="status" aria-label="Result or request status"></select></label>'+
        '<label>Review readiness<select class="select-field" data-v-filter="readiness"><option value="">All records</option><option value="ready">Ready for decision</option><option value="blocked">Decision unavailable</option></select></label>'+
        '<label>Sort by<select class="select-field" data-v-filter="sort"><option value="event">Natural event order</option><option value="newest">Newest update / request</option></select></label></div>'+
        '<div class="verify-tools"><p data-v-visible role="status" class="muted small"></p><div>'+control('Expand All','expand')+control('Collapse All','collapse')+control('Clear filters','clear')+'</div></div>'+
        '<p data-v-unavailable class="callout warning" hidden></p><div id="verify-queue" role="tabpanel" tabindex="0" aria-labelledby="verify-tab-all"></div>'+
        '<details class="verify-source"><summary>Data connection</summary><div data-v-connection></div></details></div></section>';
    }
    function card(item){
      const r=item.record,isCorrection=item.kind==='correction',submitted=!isCorrection&&r.status==='submitted',pending=isCorrection&&r.status==='pending';
      const attrs='data-reviewed-revision="'+Number(r.revision)+'"';
      let scores='';
      if(!isCorrection)scores='<div class="verify-scores">'+[7,8,9,10,11,12].map(g=>{
        let label='—',points='';
        try{const row=window.PanagScoring.gradeResult(item.event.rule,r.entries,g);label=row.placement_codes.join(' · ')||row.status;points='+'+row.points;}
        catch{label='Breakdown required';}
        return '<div><span>'+gradeText(g)+'</span><strong>'+esc(label)+'</strong><small>'+esc(points)+'</small></div>';
      }).join('')+'</div>';
      const manager=r.manager_review;
      let actions='';
      if(item.valid&&r.entries_valid!==false){
        if(isCorrection)actions=!item.blocked&&pending?btn('Compare & Decide','review-correction',r.id,'smallbtn'):btn('View Comparison','inspect-correction',r.id,'secondary smallbtn');
        else if(submitted&&!item.blocked)actions=btn('View Breakdown','review',item.event.id,'secondary smallbtn',attrs)+btn('↩ Return','return',item.event.id,'danger smallbtn',attrs)+btn('✓ Approve Official Result','approve',item.event.id,'smallbtn',attrs+(item.approvalReason?' disabled':''));
        else actions=btn('View Breakdown','inspect-result',item.event.id,'secondary smallbtn');
      }
      return '<article class="verify-card" data-v-record="'+esc(item.key)+'" data-v-status="'+esc(r.status)+'">'+
        '<div class="verify-card-heading"><h4>'+esc(item.event.name)+'</h4><span class="status-badge '+esc(r.status)+'">'+esc(isCorrection?'Correction · '+r.status:r.status)+'</span></div>'+
        '<p class="verify-path">'+esc(item.path)+'</p><p class="muted tiny">'+(isCorrection?'Requested':'Updated')+': '+esc(date(isCorrection?r.created_at:r.updated_at))+'</p>'+
        (r.approved_at&&!isCorrection?'<p class="muted tiny">Approved: '+esc(date(r.approved_at))+'</p>':'')+
        (isCorrection?'<p class="small">Manager: '+esc(r.manager_name||'Name not recorded')+'</p><div class="callout warning"><b>Documented reason:</b> '+esc(r.reason)+'</div>':scores)+
        (manager?'<p class="muted small">⚖ Manager verified'+(manager.manager_name?': '+esc(manager.manager_name):'')+' · '+esc(date(manager.reviewed_at))+'</p>':special(item.event.rule)?'<p class="muted small">Judge-derived results · Event Manager verification required</p>':'')+
        (r.comment?'<p class="callout warning"><b>'+(r.status==='returned'?'Return reason':'Previous note')+':</b> '+esc(r.comment)+'</p>':'')+
        (isCorrection&&r.reviewed_at?'<p class="muted tiny">Decision recorded: '+esc(date(r.reviewed_at))+'</p>':'')+
        (isCorrection&&r.review_reason?'<p class="callout"><b>Review note:</b> '+esc(r.review_reason)+'</p>':'')+
        (item.blocked||item.approvalReason?'<p class="callout warning" role="status">'+esc(item.blocked||item.approvalReason)+'</p>':'')+
        (!isCorrection&&r.status==='returned'?'<p class="muted small">Awaiting manager correction and resubmission.</p>':!isCorrection&&r.status==='approved'?'<p class="muted small">Published official result · Read-only</p>':!isCorrection&&r.status==='draft'?'<p class="muted small">Manager draft · Not submitted for Admin approval</p>':'')+
        (actions?'<div class="approval-actions">'+actions+'</div>':'')+'</article>';
    }
    function group(node){
      const id=node.event.id,open=ui.expanded.has(id)?ui.expanded.get(id):node.depth<2,kind=node.depth===0?'Main Event':node.children.length?'Nested group':'Scoring event';
      return '<section class="verify-group '+(node.depth===0?'verify-root':'')+'" data-v-group="'+id+'"><h4 class="verify-group-heading"><button type="button" data-v-action="toggle" data-v-id="'+id+'" aria-expanded="'+open+'" aria-controls="verify-children-'+id+'"><span class="verify-chevron" aria-hidden="true">'+(open?'▾':'▸')+'</span><span class="verify-group-name"><small>'+kind+(node.depth>2?' · Level '+(node.depth+1):'')+'</small><strong>'+esc(node.event.name)+'</strong></span><span class="verify-group-count"><b>'+node.count+'</b><small>'+(ui.tab==='returned'?'returned':node.actionable+' need action')+'</small></span></button></h4><div id="verify-children-'+id+'" class="verify-children" '+(open?'':'hidden')+'>'+node.items.map(card).join('')+node.children.map(group).join('')+'</div></section>';
    }
    function resourceIssue(key){
      const info=state.verificationData?.[key];
      if(!info?.loaded)return 'Verification '+key+' have not loaded successfully. Refresh data before deciding.';
      return info.error?'Verification '+key+' could not be refreshed. Decisions are disabled until a successful refresh.':'';
    }
    function currentModel(){
      const value=buildModel(state.events,state.results,state.corrections,evidence);
      for(const item of [...value.queues.all,...value.queues.corrections]){
        const issue=resourceIssue('events')||resourceIssue('results')||(item.kind==='correction'?resourceIssue('corrections'):'');
        if(issue&&item.actionable){item.blocked=issue;item.actionable=false;}
      }
      value.counts.awaiting=value.queues.submitted.filter(i=>i.actionable).length+value.queues.corrections.filter(i=>i.actionable).length;
      return value;
    }
    function update(){
      if(state.user?.role!=='admin'){if(identity)reset();return;}
      const currentIdentity=state.user.id+':'+(state.public?.branding?.year||state.history?.active_year||state.encoding?.year||'');
      if(identity&&identity!==currentIdentity)reset();identity=currentIdentity;
      if(!doc())return;
      model=currentModel();
      if(ui.main&&!model.nodes.has(Number(ui.main))){ui.main='';ui.category='';}
      if(ui.category&&!model.nodes.has(Number(ui.category)))ui.category='';
      view=selectQueue(model,ui);
      const root=doc(),focused=document.activeElement,focusKey=focused?.dataset?.vAction?focused.dataset.vAction+':'+focused.dataset.vId:null;
      const scroll={x:window.scrollX,y:window.scrollY},data=state.verificationData||{};
      root.querySelectorAll('[data-v-count]').forEach(el=>{
        const key=el.dataset.vCount,known=key==='awaiting'?['events','results','corrections'].every(k=>data[k]?.loaded&&!data[k]?.error):data[key==='corrections'?'corrections':'results']?.loaded;
        el.textContent=known?String(model.counts[key]):'—';
      });
      root.querySelectorAll('[role="tab"]').forEach(el=>{
        const selected=el.dataset.vId===ui.tab;el.classList.toggle('active',selected);el.setAttribute('aria-selected',String(selected));el.tabIndex=selected?0:-1;
      });
      root.querySelector('#verify-queue').setAttribute('aria-labelledby','verify-tab-'+ui.tab);
      const all=model.queues[ui.tab],rootIds=new Set(all.filter(i=>i.valid).map(i=>i.ancestors[0]));
      const mainOptions=[...rootIds].map(id=>model.nodes.get(id).event).sort((a,b)=>(Number(a.sort_order)||0)-(Number(b.sort_order)||0)||collator.compare(a.name,b.name));
      if(ui.main&&!rootIds.has(Number(ui.main))&&model.nodes.has(Number(ui.main)))mainOptions.push(model.nodes.get(Number(ui.main)).event);
      setHTML(root.querySelector('[data-v-filter="main"]'),'<option value="">All Main Events</option>'+mainOptions.map(e=>'<option value="'+e.id+'">'+esc(e.name)+'</option>').join(''));
      const categoryIds=new Set(all.filter(i=>!ui.main||i.ancestors[0]===Number(ui.main)).flatMap(i=>i.ancestors.slice(1,-1)));
      if(ui.category&&model.nodes.has(Number(ui.category)))categoryIds.add(Number(ui.category));
      setHTML(root.querySelector('[data-v-filter="category"]'),'<option value="">All nested groups</option>'+[...categoryIds].map(id=>model.nodes.get(id).event).sort((a,b)=>collator.compare(a.path||a.name,b.path||b.name)).map(e=>'<option value="'+e.id+'">'+esc(e.path||e.name)+'</option>').join(''));
      const statuses=new Set(all.map(i=>i.record.status));if(ui.status)statuses.add(ui.status);
      setHTML(root.querySelector('[data-v-filter="status"]'),'<option value="">All statuses</option>'+[...statuses].sort(collator.compare).map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join(''));
      root.querySelectorAll('[data-v-filter]').forEach(el=>{if(el.value!==ui[el.dataset.vFilter])el.value=ui[el.dataset.vFilter];});
      const errors=Object.entries(data).filter(([,info])=>info.error),errorBox=root.querySelector('[data-v-load-error]');
      errorBox.hidden=!errors.length&&!state.publicLoadError;
      errorBox.textContent=errors.map(([key,info])=>key+' '+(info.status?'(HTTP '+info.status+') ':'')+': '+info.error).join(' · ')+(errors.length?' Last successful records are retained when available. Refresh data to retry.':'')+(state.publicLoadError?' Public standings could not be loaded: '+state.publicLoadError+'. Admin records are loaded independently.':'');
      const loadedResults=data.results?.loaded,loadedCorrections=data.corrections?.loaded,times=Object.values(data).map(info=>info.updatedAt||0),latest=Math.max(0,...times);
      root.querySelector('[data-v-data-summary]').textContent=(loadedResults?state.results.length:'—')+' recorded results · '+(loadedCorrections?state.corrections.length:'—')+' correction requests'+(latest?' · Last loaded '+date(new Date(latest).toISOString()):' · Loading data…')+(errors.length?' · Refresh required':'');
      setHTML(root.querySelector('[data-v-connection]'),'<p>API server: <b>'+esc(ctx.apiBase||'Configured application server')+'</b></p>'+['events','results','corrections'].map(key=>{
        const info=data[key];return '<p>'+esc(key)+': '+esc(info?.loaded?'loaded':'not loaded')+(info?.status?' · HTTP '+info.status:'')+(info?.error?' · '+esc(info.error):'')+'</p>';
      }).join(''));
      const notice=root.querySelector('[data-v-unavailable]');notice.hidden=!view.unavailable.length;
      notice.textContent=view.unavailable.length+' record(s) have unavailable event references. They remain visible below as read-only records and are excluded from Admin action counts.';
      root.querySelector('[data-v-visible]').textContent=view.items.length+' of '+all.length+' '+queues[ui.tab].toLowerCase()+' · '+view.roots.length+' Main Event(s)'+(ui.tab==='corrections'?' · '+model.counts.pendingCorrections+' pending':'');
      const relevant=ui.tab==='corrections'?'corrections':'results',loaded=data[relevant]?.loaded;
      const empty=!loaded?(data[relevant]?.error?'Verification data is unavailable. Use Refresh data to retry.':'Loading verification data…'):all.length?'No records match these filters. Clear filters to see this tab.':ui.tab==='all'?'No recorded results were returned by the current API.':ui.tab==='approved'?'No approved results were returned by the current API.':ui.tab==='draft'?'No draft results were returned by the current API.':ui.tab==='returned'?'No returned results were returned by the current API.':ui.tab==='corrections'?'No correction requests were returned by the current API.':'No submitted results awaiting Admin approval.';
      const unavailable=view.unavailable.length?'<section class="verify-unavailable"><h4>Unavailable event references · Read-only</h4>'+view.unavailable.map(card).join('')+'</section>':'';
      setHTML(root.querySelector('#verify-queue'),view.roots.map(group).join('')+unavailable||(loaded?'<div class="centered-empty"><span aria-hidden="true">✓</span><p>'+empty+'</p></div>':'<div class="centered-empty" role="status"><p>'+empty+'</p></div>'));
      if(focusKey)[...root.querySelectorAll('[data-v-action]')].find(el=>el.dataset.vAction+':'+el.dataset.vId===focusKey)?.focus({preventScroll:true});
      if(window.scrollY!==scroll.y||window.scrollX!==scroll.x)window.scrollTo({left:scroll.x,top:scroll.y,behavior:'instant'});
      syncReview();
      if(model.queues.submitted.some(i=>special(i.event.rule)&&!evidence[i.event.id])&&!inFlight)refreshEvidence();
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
      const dataIssue=resourceIssue('events')||resourceIssue('results')||(review.kind==='correction'?resourceIssue('corrections'):'');
      const stale=review.kind==='correction'?!fresh||fresh.status!=='pending'||fresh.base_revision!==review.revision||!model?.queues.corrections.some(i=>i.record.id===review.id&&!i.blocked):!fresh||fresh.status!=='submitted'||fresh.revision!==review.revision||!current||!!current.blocked;
      let banner=body.querySelector('[data-v-conflict]');
      const approval=body.querySelector('[data-action=do-approve]');
      if(!stale&&approval&&current?.approvalReason){if(!banner){banner=document.createElement('p');banner.className='callout warning';banner.dataset.vConflict='';banner.setAttribute('role','alert');body.prepend(banner);}banner.textContent=current.approvalReason+' Close and reopen the current review.';approval.disabled=true;}
      if(stale&&!banner){banner=document.createElement('p');banner.className='callout warning';banner.dataset.vConflict='';banner.setAttribute('role','alert');banner.textContent=dataIssue?dataIssue+' Your notes are preserved. Refresh data and reopen before deciding.':'This review changed on another session. Your notes are preserved. Close and reopen the current record before deciding.';body.prepend(banner);}
      if(stale)body.querySelectorAll('[data-action="approve"],[data-action="return"],[data-action="do-approve"],[data-action="do-return"],[data-action="do-correction-approve"],[data-action="do-correction-reject"]').forEach(b=>b.disabled=true);
    }
    document.addEventListener('click',e=>{
      const b=e.target.closest('#verify-center [data-v-action]');if(!b||state.user?.role!=='admin')return;
      const action=b.dataset.vAction,id=b.dataset.vId;
      if(action==='tab'&&id in queues){ui.tab=id;ui.status='';ui.readiness='';}
      if(action==='retry'){loadAll(true);return;}
      if(action==='toggle')ui.expanded.set(Number(id),!(ui.expanded.has(Number(id))?ui.expanded.get(Number(id)):view.visible.get(Number(id)).depth<2));
      if(action==='expand'||action==='collapse')for(const key of view.visible.keys())ui.expanded.set(key,action==='expand');
      if(action==='clear')Object.assign(ui,{search:'',main:'',category:'',status:'',readiness:'',sort:'event'});
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
      ui.tab=e.key==='Home'?keys[0]:e.key==='End'?keys.at(-1):keys[(n+(e.key==='ArrowRight'?1:keys.length-1))%keys.length];ui.status='';ui.readiness='';update();document.getElementById('verify-tab-'+ui.tab).focus();
    });
    return {shell,update,refreshEvidence,reset,trackReview,clearReview:()=>{review=null;},
      refreshData:isCurrent=>loadVerification(state,api,isCurrent),
      decisionReason:(id,decision='approve')=>{const item=currentModel().queues.submitted.find(i=>i.event.id===Number(id));return item?item.blocked||(decision==='approve'?item.approvalReason:''):'This submission is no longer available for a decision.';}};
  }
  return {buildModel,selectQueue,approvalBlock,timestamp,loadVerification,create};
});
