(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PanagScoring=factory();})(typeof window!=='undefined'?window:globalThis,function(){'use strict';
const GRADES = [7,8,9,10,11,12];
const RULES = Object.freeze({
  sports: {label:'SPORTS GAMES',placements:[['champion','Champion',6],['runner1','1st Runner-up',5],['runner2','2nd Runner-up',4],['runner3','3rd Runner-up',3],['runner4','4th Runner-up',2],['runner5','5th Runner-up',1],['none','No Participation',0]]},
  singing: {label:'SINGING DUET',placements:[['champion','Champion',6],['runner1','1st Runner-up',5],['runner2','2nd Runner-up',4],['runner3','3rd Runner-up',3],['runner4','4th Runner-up',2],['runner5','5th Runner-up',1],['none','No Participation',0]]},
  saludo: {label:'SALUDO CONTEST',placements:[['champion','Champion',20],['runner1','1st Runner-up',15],['runner2','2nd Runner-up',10],['participation','Participation',5],['none','No Participation',0]]},
  emblem: {label:'BEST EMBLEM 2026',placements:[['champion','Mr. and Ms. Sports',20],['runner1','1st Runner-up',15],['runner2','2nd Runner-up',10],['participation','Participation',5],['none','No Participation',0]]}
});
function legacyScores(rule, entries){
  if(!RULES[rule])throw Error('Invalid scoring rule');
  if(!entries || typeof entries!=='object' || Array.isArray(entries))throw Error('Invalid grade placements');
  const keys=Object.keys(entries);if(keys.length!==6 || keys.some(k=>!GRADES.includes(Number(k))))throw Error('Exactly Grade 7 to Grade 12 must have a placement');
  const valid = new Set(RULES[rule].placements.map(x=>x[0]));
  const unique = new Set(); const scores={};
  for(const grade of GRADES){
    const placement=entries[grade];
    if(!valid.has(placement))throw Error('Invalid or missing placement for Grade '+grade);
    if(!['participation','none'].includes(placement)){
      if(unique.has(placement))throw Error('Duplicate placement: '+placement);
      unique.add(placement);
    }
    scores[grade]=RULES[rule].placements.find(x=>x[0]===placement)[2];
  }
  return scores;
}
function rankTeams(totals){
  let last=null,rank=0;
  return totals.slice().sort((a,b)=>b.points-a.points||a.grade-b.grade).map((t,i)=>{
    if(t.points!==last){rank=i+1;last=t.points;}
    return {...t,rank};
  });
}
const SLOTS=RULES.sports.placements.slice(0,6),CODES=['C','1R','2R','3R','4R','5R'];
function object(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
function normalizeSports(input,{draft=false}={}){
 if(!object(input))throw Error('Invalid sports result');
 const legacy=input.schema===undefined;let participation={},placements={};
 if(legacy){legacyScores('sports',input);for(const g of GRADES){const slot=SLOTS.find(([k])=>input[g]===k);participation[g]=slot?'participated':'unknown';if(slot)placements[slot[0]]=g;}}
 else{
  if(input.schema!=='sports-v2'||Object.keys(input).some(k=>!['schema','participation','placements'].includes(k)))throw Error('Unsupported sports result schema');
  if(!object(input.participation)||!object(input.placements))throw Error('Sports participation and placement maps are required');
  if(Object.keys(input.participation).some(k=>!GRADES.map(String).includes(k)))throw Error('Only Grade 7 through Grade 12 may participate');
  if(Object.keys(input.placements).some(k=>!SLOTS.some(([s])=>s===k)))throw Error('Invalid or tied sports placement slot');
  for(const g of GRADES){const v=input.participation[g]??'unknown';if(!['unknown','participated','none'].includes(v))throw Error('Invalid participation for Grade '+g);participation[g]=v;}
  for(const [key] of SLOTS){const g=input.placements[key]??null;if(g!==null&&(!Number.isInteger(g)||!GRADES.includes(g)))throw Error('A placement must have one Grade 7–12 winner or be unawarded');placements[key]=g;}
 }
 const points=Object.fromEntries(GRADES.map(g=>[g,0])),grades=Object.fromEntries(GRADES.map(g=>[g,{grade:g,status:participation[g],confirmed:participation[g]!=='unknown',placements:[],placement_codes:[],points:0,placement_count:0}]));let gap=false;const issues=[];
 for(const [i,[key,label,value]] of SLOTS.entries()){const g=placements[key]??null;placements[key]=g;if(g===null){gap=true;continue;}if(participation[g]==='none')throw Error('Grade '+g+' is marked No Participation and cannot win '+label+'. Correct its participation first.');if(gap)issues.push('Award placements consecutively starting at Champion; '+label+' follows an unawarded slot.');if(participation[g]==='unknown')issues.push('Confirm participation for Grade '+g+' before submission');points[g]+=value;grades[g].placements.push(key);grades[g].placement_codes.push(CODES[i]);grades[g].placement_count++;grades[g].points+=value;grades[g].status='placed';}
 for(const g of GRADES)if(participation[g]==='unknown')issues.push('Participation for Grade '+g+' is not yet confirmed'+(legacy?' (legacy history not independently verified)':''));
 const complete=issues.length===0;if(!draft&&!complete)throw Error([...new Set(issues)].join('; '));
 return {schema:'sports-v2',legacy,participation,placements,points,grades,total_points:Object.values(points).reduce((a,b)=>a+b,0),complete,issues:[...new Set(issues)]};
}
function validatePlacements(rule,entries,options={}){return rule==='sports'&&entries?.schema!==undefined?normalizeSports(entries,options).points:legacyScores(rule,entries);}
function validateOfficial(rule,entries){try{return rule==='sports'?normalizeSports(entries).points:validatePlacements(rule,entries);}catch(e){e.status=400;e.code='INVALID_OFFICIAL_RESULT';throw e;}}
function winner(entries,slot){return entries?.schema==='sports-v2'?(entries.placements?.[slot]??null):Number(Object.entries(entries||{}).find(([,v])=>v===slot)?.[0])||null;}
function resultRows(rule,entries){if(rule==='sports'){const r=normalizeSports(entries,{draft:true});return SLOTS.flatMap(([key,label,points])=>r.placements[key]===null?[]:[{grade:r.placements[key],placement:key,label,points}]);}return Object.entries(entries||{}).map(([g,k])=>{const p=RULES[rule]?.placements.find(x=>x[0]===k);return {grade:Number(g),placement:k,label:p?.[1]||'Unknown',points:p?.[2]||0};});}
function gradeResult(rule,entries,g){if(rule==='sports')return normalizeSports(entries,{draft:true}).grades[g];const row=resultRows(rule,entries).find(r=>r.grade===Number(g));return {grade:Number(g),status:row?.placement==='none'?'none':row?'placed':'unknown',placements:row?[row.placement]:[],placement_codes:row?[row.label]:[],placement_count:row&&row.points>0?1:0,points:row?.points||0,confirmed:!!row};}
return {GRADES,RULES,SLOTS,CODES,validatePlacements,validateOfficial,normalizeSports,rankTeams,winner,resultRows,gradeResult};
});
