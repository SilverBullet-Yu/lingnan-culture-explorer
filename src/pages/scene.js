/* 场景页：叙事、环境声/旁白、方言卡、跟读对比、文化任务与场景答疑。
   播放与录音事件统一由 audio/recorder.js 在 document 级委托处理，本页不绑事件。 */
import { state, phraseLang, TASK_TYPES, isDone, scene, region, phraseFor, taskFor, fav, fmtDate, esc, safeUrl, routeForScene } from '../store.js';
import { assetBadge } from '../asset-badges.js';
import { missingPage } from './missing.js';
import { playerMarkup } from '../audio/player.js';

function readingsBlock(p){
  if(!p.readings||!p.readings.length)return '';
  return '<div class="readings"><div class="head"><h3>多地区读音对照</h3><span class="tag">来源可查 · 读音待母语者复核</span></div><div class="reading-grid">'+p.readings.map(function(r){
    return '<div class="reading-item"><b>'+esc(r.region)+'</b><span class="reading-text">'+esc(r.text)+'</span><small>'+esc(r.reading)+'</small><p>'+esc(r.note||'')+'</p>'+(r.source_url?'<small class="muted"><a href="'+esc(safeUrl(r.source_url))+'" target="_blank" rel="noopener noreferrer">'+esc(r.source||'来源')+' ↗</a></small>':'')+'</div>';
  }).join('')+'</div></div>';
}

function qaBlock(id){
  var list=(state.data.qa||[]).filter(function(q){return q.scene_id===id});
  if(!list.length)return '';
  var suggests=list.slice(0,3).map(function(q){return '<button type="button" class="qa-suggest-btn" data-qa-suggest="'+esc(q.question)+'">'+esc(q.question)+'</button>'}).join('');
  return '<div class="card qa-card" id="qa-card"><span class="tag">场景答疑</span><h2>有疑问？问问这个场景</h2><p class="muted">回答只来自本场景的审核知识库，不接入生成式 AI，也不会调用外部服务。</p><form id="qa-form"><label class="sr-only" for="qa-input">输入你的问题</label><div class="qa-row"><input id="qa-input" type="text" autocomplete="off" placeholder="例如：为什么茶楼要搭台？" maxlength="120"><button class="btn" type="submit">提问</button></div></form><div class="qa-suggest" role="group" aria-label="可以这样问">'+suggests+'</div><div id="qa-result" class="qa-result" role="status" aria-live="polite"></div><p class="muted" style="margin:10px 0 0">本场景知识库共 '+list.length+' 条审核问答。超出范围的问题会统一答复「当前内容暂未覆盖」。</p></div>';
}

export function scenePage(id){
  var s=scene(id);if(!s)return missingPage('场景');
  var rg=region(s.region_id);if(!rg)return missingPage('场景');
  var p=phraseFor(s.phrase_id);if(!p)return missingPage('场景');
  var rt=routeForScene(id);if(!rt)return missingPage('场景');
  var t=taskFor(id);
  var d=isDone(id);var steps=state.sceneSteps[id]||{};var note=state.notes[id];var en=phraseLang==='en';
  var idx=(rt.scene_ids||[]).indexOf(id);
  var prevS=idx>0?scene(rt.scene_ids[idx-1]):null;
  var nextS=idx>=0&&idx<rt.scene_ids.length-1?scene(rt.scene_ids[idx+1]):null;

  var review=s.narrative.review_status==='reviewed'?'已审核（课程原型）':'待复核';
  var storyCard='<div class="card scene-learning-card"><h2>先看懂这个场景</h2><p>'+esc(s.narrative.story)+'</p><div class="facts" style="grid-template-columns:1fr"><div class="fact"><b>地点</b>'+esc(s.narrative.place)+'</div><div class="fact"><b>人物</b>'+esc(s.narrative.people)+'</div><div class="fact"><b>物件</b>'+esc(s.narrative.objects)+'</div></div><p class="content-status"><small class="muted" style="overflow-wrap:anywhere">内容状态：'+review+(s.narrative.source_note?' · '+esc(s.narrative.source_note):'')+'</small></p>'+playerMarkup(s.narrative.ambient_url,s.narrative.ambient_label||'环境声',s.narrative.ambient_note,true)+(s.narrative.audio_url?playerMarkup(s.narrative.audio_url,s.narrative.audio_label||'旁白音频',s.narrative.audio_note,false,'required'):'<p class="muted" style="margin-top:10px"><b>旁白待补：</b>'+esc(s.narrative.audio_note||'本场景旁白尚未提供，可先阅读文字稿。')+'</p>')+'<div class="scene-step-actions"><button class="btn secondary" data-scene-read="'+esc(id)+'" '+(steps.read?'disabled':'')+'>'+(steps.read?'图文已确认阅读':'确认已读图文卡')+'</button><span class="scene-step-state" data-step-state="read">'+(steps.read?'已完成':'待完成')+'</span></div><p class="muted">'+(s.narrative.audio_url?'必需声音播放完整后可完成；若媒体不可用，可先阅读上方文字稿并使用替代路径。':'本场景无旁白音频：确认已读并提交理解动作后，可使用「文字稿替代声音」完成。')+'</p></div>';

  var langCard='<div class="language"><div class="phrase-head"><strong>'+esc(p.text)+'</strong><span class="phrase-tools"><button class="fav-chip'+(fav(p.id)?' on':'')+'" data-fav="'+esc(p.id)+'" data-fav-off="☆ 收藏这句表达" data-fav-on="★ 已收藏这句表达" aria-pressed="'+fav(p.id)+'">'+(fav(p.id)?'★ 已收藏这句表达':'☆ 收藏这句表达')+'</button><button id="phrase-lang" aria-pressed="'+en+'">'+(en?'中文释义':'英文释义')+'</button></span></div><p class="reading"><b>读音：</b>'+esc(p.reading)+'</p><p class="reading-note">'+esc(p.reading_note)+'</p><p class="phrase-meaning">'+(en?'<b>Meaning (EN)：</b>'+esc(p.meaning_en):'<b>普通话释义：</b>'+esc(p.meaning_zh))+'</p><div class="facts" style="grid-template-columns:1fr 1fr"><div class="fact"><b>说话人</b>'+esc(p.speaker)+'</div><div class="fact"><b>使用对象</b>'+esc(p.audience)+'</div><div class="fact"><b>使用场合</b>'+esc(p.occasion)+'</div><div class="fact"><b>来源地区</b>'+esc(p.source_region)+'</div></div><p style="margin:10px 0 0"><small class="muted">状态：'+(p.review_status==='pending_review'?'待母语者复核':'已由母语者复核')+' · 音频'+(p.audio_url?'已提供（'+esc(p.audio_label||(p.audio_source==='synthetic'?'合成语音 · 非真人录音':p.audio_source==='spliced'?'真人单字发音拼接':'真人录音'))+'）':'待提供')+'</small></p>'+playerMarkup(p.audio_url,(p.audio_url?(p.audio_label||'合成语音 · 非真人录音')+' · ':'示范音频 · ')+p.text,p.audio_url?((p.audio_note?p.audio_note+' ':'')+'可切换 0.75× 慢速或重听，再录下自己的跟读做对比。'):(p.audio_note||'示范音频待提供，可先阅读读音与释义。'),false,'phrase')+readingsBlock(p)+'<div class="rec-practice" data-rec data-scene="'+esc(id)+'" data-phrase="'+esc(p.id)+'" role="group" aria-label="跟读练习"><div class="rec-head"><b>跟读练习</b><span class="rec-chip">仅保存在本机</span></div><p class="muted rec-hint">'+(p.audio_url?'先播放上方示范音频（可慢速），再录下自己的跟读；录音结束后可用「原声 → 我的跟读」连续对比。':'示范音频待提供，可先自己录一句跟读，回放练习。')+'</p><div class="rec-row"><button class="rec-btn" data-rec-act="toggle">● 开始录音</button><span class="rec-status" id="rec-status" role="status">未开始</span></div><div class="rec-result" id="rec-result" hidden><audio class="rec-playback" controls></audio><div class="rec-row" style="margin-top:8px"><button class="rec-mini" data-rec-act="rerecord">重录</button><button class="rec-mini" data-rec-act="save">保存到本机</button>'+(p.audio_url?'<button class="rec-mini" data-rec-act="compare">原声 → 我的跟读</button>':'')+'</div></div><p class="muted rec-legal">录音仅保存在本机浏览器（IndexedDB），不会上传，也不做任何评分。</p></div></div>';

  var interaction='<div class="card scene-interaction" id="scene-interaction"><span class="tag">场景理解动作</span><h2>'+esc(s.understanding_prompt||'观察这个场景后，选择最能概括你发现的一项。')+'</h2>'+'<div role="radiogroup" aria-label="理解动作选项">'+(s.understanding_options||[]).map(function(o,i){return '<button type="button" class="option" role="radio" aria-checked="false" data-understanding="'+i+'">'+esc(o)+'</button>'}).join('')+'</div>'+'<div class="actions"><button class="btn" data-understanding-submit="'+esc(id)+'" '+(steps.interaction?'disabled':'')+'>'+(steps.interaction?'理解动作已提交':'提交理解动作')+'</button><span data-step-state="interaction">'+(steps.interaction?'已完成':'待完成')+'</span></div></div>';
  var routeReady=rt.scene_ids.every(function(sceneId){return isDone(sceneId)});
  var taskCard='';
  if(t){var res=state.results[t.id];var ok=res&&res.answer===t.answer;
    taskCard='<div class="card" style="margin-top:16px" id="task-card"><span class="tag">文化任务 · '+TASK_TYPES[t.type]+'</span><h2 style="margin:8px 0 4px">理解检查</h2><p>'+esc(t.prompt)+'</p>'+'<div role="radiogroup" aria-label="任务答案选项">'+t.options.map(function(o,i){return '<button class="option" role="radio" aria-checked="false" data-a="'+i+'">'+esc(o)+'</button>'}).join('')+'</div>'+'<div class="actions" style="margin-top:12px"><button class="btn" id="task-submit" '+(!routeReady?'disabled':'')+'>'+(res?'重新提交':'提交答案')+'</button>'+(routeReady?'':'<span class="muted">完成本路线 3 个场景后开放</span>')+'</div><div id="task-result" class="result '+(res?(ok?'good':'bad'):'')+'" role="status"'+(res?'':' hidden')+'>'+(res?'<b>'+(ok?'回答正确':'回答错误，再想想')+'</b><span class="muted">'+fmtDate(res.at)+' 提交</span><br>你的选择：'+esc(t.options[res.answer])+(ok?'':'<br>正确答案：'+esc(t.options[t.answer]))+'<br>'+esc(t.explanation):'')+'</div></div>';
  }
  var prevLink=prevS?'<a class="btn secondary" href="#scene/'+esc(prevS.id)+'">← 上一站：'+esc(prevS.title)+'</a>':'';
  var nextLink=nextS?'<a class="btn secondary" href="#scene/'+esc(nextS.id)+'">下一站：'+esc(nextS.title)+' →</a>':'';
  var aside='<aside><div class="card"><button class="btn" style="width:100%" data-fav="'+esc(id)+'" data-fav-off="收藏场景" data-fav-on="已收藏场景">'+(fav(id)?'已收藏场景':'收藏场景')+'</button><p class="muted" data-step-state="audio">声音：'+(steps.audio?'已播放完整':steps.fallback?'已使用文字稿替代':'待完成')+'</p><button class="btn secondary" style="width:100%;margin-top:10px" data-scene-fallback="'+esc(id)+'" '+(steps.audio||steps.fallback?'disabled':'')+'>使用文字稿替代声音</button><p class="muted" data-scene-completion>'+(d?(state.progress[id].mode==='fallback'?'降级完成':'已完成'):'完成条件：图文已读、理解动作已提交、声音已播放或使用替代')+'</p></div><div class="card" style="margin-top:16px"><h3>探索笔记</h3><p class="muted">'+(note?'最后更新：'+fmtDate(note.at):'笔记仅保存在本机浏览器。')+'</p><textarea class="note-area" id="note-text" aria-label="场景笔记" placeholder="记下这个场景里想留住的细节或疑问…">'+esc(note?note.text:'')+'</textarea><button class="btn secondary" style="width:100%" data-note="'+esc(id)+'">'+(note?'更新笔记':'保存笔记')+'</button></div><div class="card" style="margin-top:16px"><h3>场景导航</h3><div class="scene-nav">'+prevLink+nextLink+'</div><a class="btn" href="#route/'+esc(rt.id)+'" style="width:100%;margin-top:10px">返回路线</a></div></aside>';

  var coverImg=s.cover_image?'<img class="scene-cover-image" src="'+esc(s.cover_image)+'" alt="'+esc(s.cover_caption||s.title)+'" width="1160" height="600">':'';
  var coverSource=s.source_url?' · <a href="'+esc(safeUrl(s.source_url))+'" target="_blank" rel="noopener noreferrer">阅读背景资料 ↗</a>':'';
  var coverCaption=s.cover_caption?'<p class="scene-cover-caption">'+assetBadge(s.cover_image)+esc(s.cover_caption)+coverSource+'</p>':'';
  var cid='card:'+id;
  var coverFav='<button class="fav-chip scene-cover-fav'+(fav(cid)?' on':'')+'" data-fav="'+esc(cid)+'" data-fav-off="☆ 收藏图文卡" data-fav-on="★ 已收藏图文卡" aria-pressed="'+fav(cid)+'" aria-label="收藏图文卡：'+esc(s.title)+'">'+(fav(cid)?'★ 已收藏图文卡':'☆ 收藏图文卡')+'</button>';
  var cover='<div class="scene-cover'+(s.cover_image?' has-image':'')+'">'+coverImg+coverFav+'<div class="scene-cover-body"><span class="tag scene-status-tag" data-scene-status="'+esc(id)+'">'+esc(rg.name)+' · 场景 · '+(d?'已完成':'未完成')+'</span><h1>'+esc(s.title)+'</h1>'+coverCaption+'</div></div>';

  return '<div class="crumb"><a href="#route">文化路线</a> / <a href="#route/'+esc(rt.id)+'">'+esc(rt.name)+'</a> / '+esc(s.title)+'</div>'+cover+'<div class="columns"><article>'+storyCard+langCard+interaction+taskCard+qaBlock(id)+'</article>'+aside+'</div>';
}
