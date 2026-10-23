(()=>{'use strict';
// Presentational helpers used by the original PANAGSANGKA PWA.
const fields=[
 ['school_name','School Name',120],['hero_supporting_text','Hero Supporting Text',220],
 ['event_name','Event Title',80],['subtitle','Header Subtitle',120],
 ['tagline','Header Tagline',160],['sidebar_subtitle','Sidebar Subtitle',100],
 ['sidebar_words','Sidebar Keywords (one per line)',120],
 ['banner_kicker','Banner Small Caption',100],['banner_motto','Main Banner Motto',180],
 ['banner_detail','Banner Description',220],['footer','Footer Text',120],
 ['decoration_left','Header Left Decoration',120],['decoration_right','Header Right Decoration',120]
];
const HERO_LOGOS=['school','7','8','9','10','11','12','extra1','extra2','extra3','extra4'];
const HERO_LABELS={school:'School Seal',extra1:'Extra Emblem 1',extra2:'Extra Emblem 2',extra3:'Extra Emblem 3',extra4:'Extra Emblem 4'};
const TEXT_FIELDS=fields;
const DESIGN_FIELDS=[
 ['hero_watermark_opacity','School Watermark Opacity',[['0','0%'],['10','10%'],['20','20%'],['30','30%'],['40','40%'],['60','60%'],['80','80%'],['100','100%']]],
 ['hero_watermark_size','School Watermark Width',[['30','30%'],['45','45%'],['65','65%'],['80','80%'],['100','100%']]],
 ['hero_logo_spacing','Emblem Spacing',[['0','None'],['4','4px'],['8','8px'],['12','12px'],['20','20px'],['28','28px'],['40','40px']]],
 ['hero_layout','Hero Layout',[['poster','Cinematic Poster'],['compact','Compact Championship']]],
 ['hero_font','Championship Title Font',[['heritage','Heritage Gold · Decorative Serif'],['arena','Arena · Athletic Condensed'],['champion','Champion · Heavy Display']]],
 ['hero_title_size','Main Title Size',[['medium','Medium'],['large','Large'],['xl','Extra Large']]],
 ['hero_subtitle_size','Supporting Subtitle Size',[['small','Small'],['medium','Medium'],['large','Large']]],
 ['hero_support_font','Supporting Text Font',[['condensed','Sport Condensed'],['bold','Athletic Bold'],['classic','Classic Serif']]],
 ['hero_logo_size','Top Logo Size',[['small','Small'],['medium','Medium'],['large','Large']]],
 ['hero_effect','Background Palette',[['sunset','Maroon & Gold (Poster)'],['royal','Royal Navy & Gold'],['midnight','Midnight & Crimson']]],
 ['hero_overlay_strength','Background Overlay Opacity',[['0','0%'],['15','15%'],['25','25%'],['35','35%'],['45','45%'],['55','55%'],['65','65%'],['75','75%'],['85','85%']]]
];
const FLAGS=[['hero_show_watermark','Show School Watermark'],['hero_show_logos','Show Logo Strip'],['hero_show_school_name','Show School Name'],['hero_show_title','Show Main Title'],['hero_show_year','Show Season Year'],['hero_show_subtitle','Show Subtitle'],['hero_show_tagline','Show Tagline'],['hero_show_motifs','Show Decorative Motifs'],['hero_show_athletes','Show Athlete Artwork']];
function logoItems(b){return (b.hero_logo_order||HERO_LOGOS.join(',')).split(',').filter(x=>HERO_LOGOS.includes(x));}
function visibleItems(b){return (b.hero_visible_logos||'school,7,8,9,10,11,12').split(',').filter(x=>HERO_LOGOS.includes(x));}
function imageFor(id,b,imageUrl){
 if(id==='school')return imageUrl(b.school_logo);
 if(id.startsWith('extra'))return imageUrl(b['hero_'+id]);
 const row=(b.grades||[]).find(r=>String(r.grade)===id);
 return imageUrl(row?.logo_thumb||row?.logo_path);
}
const BUNDLED_POSTER='/assets/championship-poster-2026-6935240df12b.png';
function posterUrl(b,imageUrl){return !b.hero_poster||b.hero_poster===BUNDLED_POSTER?'./assets/championship-poster-2026-6935240df12b.png':imageUrl(b.hero_poster);}
function posterMarkup(b,esc,imageUrl,preview=false){
 const src=posterUrl(b,imageUrl),width=Number(b.hero_poster_width)||1672,height=Number(b.hero_poster_height)||941;
 const year=b.hero_poster_year||2026;
 // The panoramic crop is only valid for the bundled original. Admin-uploaded
 // posters keep their original aspect ratio and never inherit outdated artwork.
 const bundled=src==='./assets/championship-poster-2026-6935240df12b.png';
 const panorama=bundled&&!preview?'<img class="panoramic-poster-image" src="./assets/championship-panorama-2026.png" width="1920" height="240" alt="" aria-hidden="true" decoding="async">':'';
 return `<figure class="original-poster${panorama?' bundled-poster':''}" style="--poster-ratio:${width/height}" title="Artwork year ${esc(year)} · season ${esc(b.year||2026)}"><img class="original-poster-image" src="${esc(src)}" width="${width}" height="${height}" alt="Original championship poster · artwork year ${esc(year)}" fetchpriority="${preview?'auto':'high'}" decoding="async">${panorama}</figure>`;
}
// The public 2026 live system can be configured for a Dynamic Hero (including
// the supplied database). Give phones the actual official poster artwork rather
// than a tiny text-driven banner or a legacy "View Full Poster" affordance.
// This device-only rendering does not alter the desktop branding, uploaded
// original-poster mode, settings preview, or future-season dynamic hero.
function compactDevicePoster(b,preview){
 if(preview||Number(b.year||2026)!==2026)return '';
 return `<figure class="mobile-official-banner" aria-label="PANAGSANGKA 2026 official championship poster"><picture class="mobile-official-picture"><source media="(orientation: landscape) and (max-height: 500px) and (max-width: 1000px)" srcset="./assets/championship-panorama-2026.png"><img class="mobile-official-image" src="./assets/championship-poster-2026-6935240df12b.png" width="1672" height="941" alt="PANAGSANGKA 2026 championship poster featuring Grade 7 through Grade 12 teams" loading="lazy" decoding="async"></picture></figure>`;
}
function heroMarkup(b,esc,imageUrl,preview=false){
 if(b.hero_mode!=='dynamic')return posterMarkup(b,esc,imageUrl,preview);
 const active=visibleItems(b),all=logoItems(b),year=b.year||2026;
 const logos=b.hero_show_logos==='0'?'':`<div class="poster-logo-strip">${all.filter(id=>id!=='school'&&active.includes(id)).map(id=>{const img=imageFor(id,b,imageUrl);return `<span class="poster-logo-slot" title="${esc(HERO_LABELS[id]||'Grade '+id)}">${img?`<img src="${esc(img)}" alt="${esc(HERO_LABELS[id]||'Grade '+id)}" ${preview?'':'loading="lazy"'}>`:`<span class="poster-logo-fallback">${esc(id==='school'?'🏫':id.startsWith('extra')?'★':'G'+id)}</span>`}</span>`;}).join('')}</div>`;
 const bg=imageUrl(b.hero_background),ov=imageUrl(b.hero_overlay);
 const art=bg?`<div class="poster-uploaded-background" style="background-image:url('${esc(bg)}')"></div>`:'';
 const overlay=ov?`<div class="poster-uploaded-overlay" style="background-image:url('${esc(ov)}')"></div>`:'';
 const school=imageUrl(b.school_logo);
 const watermark=school&&b.hero_show_watermark!=='0'?`<img class="poster-school-watermark" src="${esc(school)}" alt="" aria-hidden="true">`:'';
 const word=b.event_name||'PANAGSANGKA';
 return `<div class="poster-stage poster-${esc(b.hero_layout||'poster')} font-${esc(b.hero_font||'heritage')} title-${esc(b.hero_title_size||'large')} subtitle-${esc(b.hero_subtitle_size||'medium')} support-${esc(b.hero_support_font||'condensed')} logos-${esc(b.hero_logo_size||'medium')} effect-${esc(b.hero_effect||'sunset')} ${b.hero_show_motifs==='0'?'hide-motifs':''}" style="--poster-opacity:${Math.max(0,Math.min(85,Number(b.hero_overlay_strength??35))) / 100};--watermark-opacity:${Math.max(0,Math.min(100,Number(b.hero_watermark_opacity??20)))/100};--watermark-size:${Math.max(10,Math.min(100,Number(b.hero_watermark_size??65)))}%;--logo-gap:${Math.max(0,Math.min(40,Number(b.hero_logo_spacing??12)))}px">${art}${overlay}${watermark}<div class="poster-content">${logos}${b.hero_show_school_name==='0'?'':`<div class="poster-school">${esc(b.school_name||'MAGALLANES NATIONAL HIGH SCHOOL')}</div>`}${b.hero_show_title==='0'?'':`<div class="poster-title">${esc(word)}</div>`}${b.hero_show_year==='0'?'':`<div class="poster-year">${esc(year)}</div>`}${b.hero_show_subtitle==='0'?'':`<div class="poster-subtitle">${esc(b.subtitle||'SCHOOL INTRAMURALS')}</div>`}${b.hero_show_tagline==='0'?'':`<div class="poster-tagline">${esc(b.tagline||'ONE PASSION. ONE PURPOSE.')}</div>`}${b.hero_supporting_text?`<div class="poster-supporting-text">${esc(b.hero_supporting_text)}</div>`:''}${b.hero_show_athletes==='0'?'':`<div class="poster-athletes" aria-hidden="true"><span>🏃</span><span>🏀</span><span>🏆</span><span>🏐</span></div>`}</div></div>${compactDevicePoster(b,preview)}`;
}
function settings(b,esc,imageUrl){
 const f=(key,label,max)=>`<div class="field-group"><label class="field-label" for="brand-${key}">${esc(label)}</label>${key==='sidebar_words'?`<textarea rows="4" class="text-field" id="brand-${key}" maxlength="${max}">${esc(b[key]||'')}</textarea>`:`<input class="text-field" id="brand-${key}" maxlength="${max}" value="${esc(b[key]||'')}">`}</div>`;
 const select=(key,label,opts)=>`<div class="field-group"><label class="field-label" for="brand-${key}">${esc(label)}</label><select class="select-field" id="brand-${key}">${opts.map(([v,t])=>`<option value="${esc(v)}" ${String(b[key]||'')===v?'selected':''}>${esc(t)}</option>`).join('')}</select></div>`;
 const flag=(key,label)=>`<div class="hero-flag"><label for="brand-${key}">${esc(label)}</label><select class="select-field" id="brand-${key}"><option value="1" ${b[key]!=='0'?'selected':''}>On</option><option value="0" ${b[key]==='0'?'selected':''}>Off</option></select></div>`;
 const logoOrder=logoItems(b),visible=new Set(visibleItems(b));
 return `<section class="panel panel-pad season-settings" style="margin-bottom:14px"><div class="panel-title-row"><h3 class="panel-title">🎨 Championship Branding Studio</h3><span class="status-badge approved">Season ${esc(b.year||2026)}</span></div>
 <p class="muted small">Edit freely—even while the leaderboard is live. Unsaved changes will never be overwritten by Socket.IO or polling. Save & Publish when ready.</p>
 <div id="brand-dirty-banner" class="callout hidden" role="status">✍️ Unsaved changes are safe on this screen. The live banner will update only after you publish.</div>
 <div id="brand-conflict-banner" class="callout warning hidden" role="status">Published branding changed. Your draft is preserved. <button type="button" class="action-button secondary" data-action="rebase-branding">Keep Draft &amp; Use Latest Revision</button> Review before publishing, or discard to load saved settings.</div>
 <fieldset class="hero-settings-block hero-mode-picker"><legend>Hero Display Mode</legend>
 <label><input type="radio" name="hero-display-mode" data-brand-mode value="original" ${b.hero_mode!=='dynamic'?'checked':''}> Original Championship Poster</label>
 <label><input type="radio" name="hero-display-mode" data-brand-mode value="dynamic" ${b.hero_mode==='dynamic'?'checked':''}> Dynamic Customizable Hero</label>
 <input type="hidden" id="brand-hero_mode" value="${esc(b.hero_mode||'original')}"></fieldset>
 <div id="original-poster-controls" class="hero-settings-block ${b.hero_mode==='dynamic'?'hidden':''}"><h3>Original Championship Poster</h3>
 <p class="muted small">The complete original artwork is displayed directly, with its original proportions and colors. Uploads preserve the original file bytes. Text and logo controls apply to Dynamic Mode.</p>
 <div id="current-poster-preview">${posterMarkup(b,esc,imageUrl,true)}</div>
 <p class="small">${esc(b.hero_poster_width||1672)} × ${esc(b.hero_poster_height||941)} px · ${esc((b.hero_poster_format||'png').toUpperCase())} · artwork year ${esc(b.hero_poster_year||2026)}</p>
 ${Number(b.hero_poster_year||2026)!==Number(b.year||2026)?'<p class="callout warning">This artwork belongs to a different year. Upload new artwork to change its printed year; the original image is never edited automatically.</p>':''}
 <div class="field-group"><label class="field-label" for="poster-artwork-year">Year printed in replacement artwork</label><input id="poster-artwork-year" class="text-field" type="number" min="2000" max="2100" value="${esc(b.year||2026)}"></div>
 <div class="poster-upload-actions"><label class="action-button secondary" for="poster-upload">Replace Poster</label><input id="poster-upload" type="file" hidden accept="image/png,image/jpeg,image/webp" data-poster-upload>
 <button type="button" class="action-button secondary" data-action="restore-original-poster">Restore Bundled Original (2026)</button></div>
 <p class="muted small">Publish or discard draft edits before changing artwork. Static PNG/JPEG/WebP · up to 24 MB · no recompression. Existing archived files remain intact.</p></div>
 <div id="dynamic-hero-controls" class="${b.hero_mode==='dynamic'?'':'hidden'}">
 <p class="callout">Dynamic Mode uses editable text and uploaded logos. Its layout is independently configurable.</p>
 <div class="hero-settings-block"><h3>✒️ Official Text & Identity</h3><div class="brand-fields">${TEXT_FIELDS.map(([k,label,max])=>f(k,label,max)).join('')}</div></div>
 <div class="hero-settings-block"><h3>🏆 Poster-Style Hero Design</h3><div class="brand-fields">${DESIGN_FIELDS.map(([k,l,opts])=>select(k,l,opts)).join('')}</div><div class="hero-flags">${FLAGS.map(([k,l])=>flag(k,l)).join('')}</div></div>
 <div class="hero-settings-block"><h3>🛡️ Top Logo Strip & Order</h3><p class="muted small">The school seal is rendered as a centered watermark. Grade logos reuse your existing optimized uploads. Use arrows to change display order; uncheck any logo to hide it. Supplementary emblems can be uploaded separately.</p>
 <input type="hidden" id="brand-hero_logo_order" value="${esc(logoOrder.join(','))}"><input type="hidden" id="brand-hero_visible_logos" value="${esc([...visible].join(','))}">
 <div class="hero-logo-manager" id="hero-logo-manager">${logoOrder.filter(id=>id!=='school').map((id,i)=>`<div class="hero-logo-row" data-hero-row="${esc(id)}"><label><input type="checkbox" data-hero-visible="${esc(id)}" ${visible.has(id)?'checked':''}/><span>${esc(HERO_LABELS[id]||'Grade '+id)}</span></label><div class="hero-logo-row-actions">${imageFor(id,b,imageUrl)?`<img src="${esc(imageFor(id,b,imageUrl))}" alt="">`:''}<button type="button" class="action-button secondary iconbtn" data-action="hero-logo-move" data-id="${esc(id)}:up" ${i===0?'disabled':''} title="Move up">↑</button><button type="button" class="action-button secondary iconbtn" data-action="hero-logo-move" data-id="${esc(id)}:down" ${i===logoOrder.filter(x=>x!=='school').length-1?'disabled':''} title="Move down">↓</button></div></div>`).join('')}</div>
 </div>
 <div class="hero-settings-block"><h3>🎨 Hero Artwork Uploads</h3><p class="muted small">Huge photos are automatically compressed to WebP before storage (up to 1920×1080 background, up to 512px additional emblems). The database stores only optimized image paths.</p>
 <div class="hero-assets-grid">${[['background','Main Background Photo'],['overlay','Decorative Motif / Transparent Overlay'],['extra1','Extra Top Emblem 1'],['extra2','Extra Top Emblem 2'],['extra3','Extra Top Emblem 3'],['extra4','Extra Top Emblem 4']].map(([key,label])=>`<div class="hero-asset-row"><span>${esc(label)}</span>${imageUrl(b['hero_'+key])?`<img src="${esc(imageUrl(b['hero_'+key]))}" alt="${esc(label)}" loading="lazy">`:''}<div class="hero-asset-actions"><label class="action-button secondary" for="hero-upload-${key}">📤 Upload</label><input hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" id="hero-upload-${key}" data-hero-upload="${key}">${imageUrl(b['hero_'+key])?`<button type="button" class="action-button danger" data-action="hero-asset-remove" data-id="${key}">🗑 Remove</button>`:''}</div></div>`).join('')}</div><p class="muted small">Save text/design changes before uploading images to prevent version conflicts. Uploaded images are immutable so historical posters remain intact.</p></div>
 </div><div class="hero-settings-block"><h3>👁 Live Desktop / Mobile Preview</h3><div class="preview-switch"><button type="button" class="action-button secondary" data-action="preview-desktop">▣ Desktop</button><button type="button" class="action-button secondary" data-action="preview-mobile">▯ Mobile</button></div><div class="poster-live-preview" id="poster-live-preview">${heroMarkup(b,esc,imageUrl,true)}</div></div>
 <div class="branding-actions"><span class="muted small">Year is changed only through History → Finalize Season.</span><div class="actions"><button type="button" class="action-button secondary" data-action="cancel-branding">Discard Draft</button><button type="button" class="action-button secondary" data-action="reset-branding">Reset to Last Saved</button><button type="button" class="action-button" data-action="save-branding">💾 Save & Publish Branding</button></div></div>
 </section>`;
}
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
 ${d?`${!isActive?`<div class="season-archive-poster">${heroMarkup({...b,hero_mode:b.hero_mode||'dynamic',year:selected},esc,logoURL,true)}</div>`:''}<div class="panel panel-pad" style="margin-top:13px"><div class="season-trophy"><div><div class="section-overline">${esc((b.event_name||'PANAGSANGKA').toUpperCase())} ${selected}</div><h3>${isActive?'Live Overall Standings':'Official Archived Championship'}</h3><p class="muted small">${isActive?'Results update only after Admin approval.':'Historical records are read-only and locked for this season.'}</p></div><div class="trophy-emoji">🏆</div></div>
 <div class="season-result-list">${(d.standings||[]).map(r=>`<div class="season-grade"><span class="season-rank">#${esc(r.rank)}</span>${gradeLogo(r.grade)}<strong>Grade ${esc(r.grade)}</strong><span class="season-points">${esc(r.points)} pts</span></div>`).join('')}</div>
 <div class="section-row"><p class="muted small">${d.approved_results?.length||0} officially approved scoring events</p>${!isActive?btn('🖨 Print Archive','print-history','','secondary smallbtn'):''}</div>
 </div><div class="panel panel-pad" style="margin-top:13px"><h3 class="panel-title">Approved Event Winners</h3><div class="table-wrap"><table class="report-table"><thead><tr><th>Event</th><th>Top Award</th><th>Approved</th></tr></thead><tbody>${(d.approved_results||[]).map(r=>{const champ=Object.entries(r.entries||{}).find(([,v])=>v==='champion');return `<tr><td>${esc(r.event_name)}</td><td>${champ?'Grade '+esc(champ[0]):'—'}</td><td>${esc(r.approved_at||'—')}</td></tr>`;}).join('')||'<tr><td colspan="3">No approved results.</td></tr>'}</tbody></table></div></div>`:`<div class="panel panel-pad" style="margin-top:13px"><p>Loading selected championship history…</p></div>`}
 ${state.user?.role==='admin'?`<div class="callout" style="margin-top:13px">Annual records include judges’ score sheets, event definitions, officials, official standings, logos and correction audit data. Full private judging details are available only in the Admin export. Reset Operational never deletes this archive.</div>`:''}`;
}
function finalizeForm(year,esc,btn){const next=Number(year)+1;return `<div class="callout warning"><strong>PERMANENT SEASON FINALIZATION</strong><br>Official ${year} standings, judging results, event definitions and logo references will be locked in the archive. The new season starts with ZERO points, while accounts, sports hierarchy, scoring rules, grade logos, judging criteria and assignments carry forward. An automatic backup is created first.</div>
 <div class="field-group"><label class="field-label">New Competition Year</label><input id="next-season-year" class="text-field" type="number" min="${next}" max="2100" value="${next}"></div>
 <div class="field-group"><label class="field-label" for="next-hero-design">New Season Hero</label><select id="next-hero-design" class="select-field"><option value="dynamic">Use Dynamic Hero with the new season year (default)</option><option value="copy">Copy previous hero design unchanged (poster retains its printed artwork year)</option></select><p class="muted small">The archived season is locked. Upload a separate poster for the new year in Branding Studio.</p></div>
 <div class="field-group"><label class="field-label">Reason / Finalization Note (required)</label><textarea class="text-field" id="finalize-reason" minlength="8" maxlength="800" rows="3" placeholder="e.g. Official championship results verified and season closed"></textarea></div>
 <div class="field-group"><label class="field-label">Type ARCHIVE ${esc(year)} to confirm</label><input class="text-field" id="finalize-confirm" autocomplete="off" placeholder="ARCHIVE ${esc(year)}"></div>
 <div class="modal-actions">${btn('Cancel','close-modal','','secondary')}${btn('Finalize and Start New Season','do-finalize','','danger')}</div>`;}
window.PanagSeasonsUI={fields,settings,history,finalizeForm,heroMarkup,posterUrl,HERO_LOGOS,visibleItems,logoItems,DESIGN_FIELDS,FLAGS};
})();
