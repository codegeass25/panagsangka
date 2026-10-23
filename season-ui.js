(()=>{'use strict';
// Presentational helpers used by the original PANAGSANGKA PWA.
const fields=[
 ['event_name','Event Title',80],['subtitle','Header Subtitle',120],
 ['tagline','Header Tagline',160],['sidebar_subtitle','Sidebar Subtitle',100],
 ['sidebar_words','Sidebar Keywords (one per line)',120],
 ['banner_kicker','Banner Small Caption',100],['banner_motto','Main Banner Motto',180],
 ['banner_detail','Banner Description',220],['footer','Footer Text',120],
 ['decoration_left','Header Left Decoration',120],['decoration_right','Header Right Decoration',120]
];
function settings(b,esc){return `<section class="panel panel-pad season-settings" style="margin-bottom:14px">
 <div class="panel-title-row"><h3 class="panel-title">🎨 Event Branding & Identity</h3><span class="status-badge approved">Season ${Number(b.year)||2026}</span></div>
 <p class="muted small">The red-marked header, sidebar, slogan, and footer text are editable. New text goes live on every connected device after Save.</p>
 <div class="brand-fields">${fields.map(([key,label,max])=>`<div class="field-group"><label class="field-label" for="brand-${key}">${esc(label)}</label>${key==='sidebar_words'?`<textarea rows="4" class="text-field" id="brand-${key}" maxlength="${max}">${esc(b[key]||'')}</textarea>`:`<input class="text-field" id="brand-${key}" maxlength="${max}" value="${esc(b[key]||'')}">`}</div>`).join('')}</div>
 <div class="brand-preview"><div class="brand-preview-small">LIVE BRANDING PREVIEW</div><h2 id="brand-preview-title">${esc(b.event_name||'PANAGSANGKA')} ${esc(b.year||2026)}</h2><p id="brand-preview-subtitle">${esc(b.subtitle||'')}</p><small id="brand-preview-tagline">${esc(b.tagline||'')}</small><div class="brand-preview-banner"><small id="brand-preview-kicker">${esc(b.banner_kicker||'')}</small><strong id="brand-preview-motto">${esc(b.banner_motto||'')}</strong><span id="brand-preview-detail">${esc(b.banner_detail||'')}</span></div><div class="brand-preview-keywords" id="brand-preview-keywords">${esc(b.sidebar_words||'').replace(/\n/g,' · ')}</div></div>
 <div class="section-row"><span class="muted small">Championship year is changed only via Finalize Season in History. No previous results are relabeled.</span><div>${'<button class="action-button" data-action="save-branding" type="button">💾 Save & Publish Branding</button>'}</div></div>
 </section>`;}
function history(state,esc,btn,logoURL){
 const active=state.public?.branding?.year||state.history?.active_year||2026;
 const list=state.history?.archives||[];
 const selected=Number(state.historySelected||active),isActive=selected===Number(active);
 const d=isActive?state.public:state.historyDetail;
 const status=isActive?'LIVE CURRENT SEASON':'ARCHIVED & LOCKED';
 const b=d?.branding||{};
 const gradeLogo=g=>{const row=b.grades?.find(r=>Number(r.grade)===Number(g));const img=logoURL(row?.logo_thumb||row?.logo_path);return img?`<img class="grade-logo" alt="Grade ${g}" src="${esc(img)}">`:`<span class="grade-logo g${g}">${g}</span>`;};
 return `<div class="section-row"><div><h3 class="section-title">🏆 Championship History</h3><p class="muted small">Official records are retained across years. Only the active season accepts new scores.</p></div><span class="status-badge ${isActive?'approved':'submitted'}">${esc(status)}</span></div>
 <div class="panel panel-pad season-switcher"><div class="field-group"><label class="field-label" for="history-season">Select Championship Year</label><select class="select-field" id="history-season" data-history-selector><option value="${active}" ${isActive?'selected':''}>${active} — Current Season</option>${list.map(x=>`<option value="${x.year}" ${selected===x.year?'selected':''}>${x.year} — Archived</option>`).join('')}</select></div>
 ${state.user?.role==='admin'?`<div class="season-admin-actions">${btn('🏁 Finalize & Create Next Season','finalize-season','','secondary')}${!isActive?btn('⬇ Full Official Archive (JSON)','export-history','','secondary'):''}</div>`:''}</div>
 ${d?`<div class="panel panel-pad" style="margin-top:13px"><div class="season-trophy"><div><div class="section-overline">${esc((b.event_name||'PANAGSANGKA').toUpperCase())} ${selected}</div><h3>${isActive?'Live Overall Standings':'Official Archived Championship'}</h3><p class="muted small">${isActive?'Results update only after Admin approval.':'Historical records are read-only and locked for this season.'}</p></div><div class="trophy-emoji">🏆</div></div>
 <div class="season-result-list">${(d.standings||[]).map(r=>`<div class="season-grade"><span class="season-rank">#${esc(r.rank)}</span>${gradeLogo(r.grade)}<strong>Grade ${esc(r.grade)}</strong><span class="season-points">${esc(r.points)} pts</span></div>`).join('')}</div>
 <div class="section-row"><p class="muted small">${d.approved_results?.length||0} officially approved scoring events</p>${!isActive?btn('🖨 Print Archive','print-history','','secondary smallbtn'):''}</div>
 </div><div class="panel panel-pad" style="margin-top:13px"><h3 class="panel-title">Approved Event Winners</h3><div class="table-wrap"><table class="report-table"><thead><tr><th>Event</th><th>Top Award</th><th>Approved</th></tr></thead><tbody>${(d.approved_results||[]).map(r=>{const champ=Object.entries(r.entries||{}).find(([,v])=>v==='champion');return `<tr><td>${esc(r.event_name)}</td><td>${champ?'Grade '+esc(champ[0]):'—'}</td><td>${esc(r.approved_at||'—')}</td></tr>`;}).join('')||'<tr><td colspan="3">No approved results.</td></tr>'}</tbody></table></div></div>`:`<div class="panel panel-pad" style="margin-top:13px"><p>Loading selected championship history…</p></div>`}
 ${state.user?.role==='admin'?`<div class="callout" style="margin-top:13px">Annual records include judges’ score sheets, event definitions, officials, official standings, logos and correction audit data. Full private judging details are available only in the Admin export. Reset Operational never deletes this archive.</div>`:''}`;
}
function finalizeForm(year,esc,btn){const next=Number(year)+1;return `<div class="callout warning"><strong>PERMANENT SEASON FINALIZATION</strong><br>Official ${year} standings, judging results, event definitions and logo references will be locked in the archive. The new season starts with ZERO points, while accounts, sports hierarchy, scoring rules, grade logos, judging criteria and assignments carry forward. An automatic backup is created first.</div>
 <div class="field-group"><label class="field-label">New Competition Year</label><input id="next-season-year" class="text-field" type="number" min="${next}" max="2100" value="${next}"></div>
 <div class="field-group"><label class="field-label">Reason / Finalization Note (required)</label><textarea class="text-field" id="finalize-reason" minlength="8" maxlength="800" rows="3" placeholder="e.g. Official championship results verified and season closed"></textarea></div>
 <div class="field-group"><label class="field-label">Type ARCHIVE ${esc(year)} to confirm</label><input class="text-field" id="finalize-confirm" autocomplete="off" placeholder="ARCHIVE ${esc(year)}"></div>
 <div class="modal-actions">${btn('Cancel','close-modal','','secondary')}${btn('Finalize and Start New Season','do-finalize','','danger')}</div>`;}
window.PanagSeasonsUI={fields,settings,history,finalizeForm};
})();
