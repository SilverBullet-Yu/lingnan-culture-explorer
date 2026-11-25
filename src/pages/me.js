/* 我的探索：六类记录集中查看与管理（收藏、进度、任务结果、录音、笔记、成果） */
import { state, editingNote, isDone, doneAt, scene, phraseFor, fmtDate, esc, routes, routeById } from '../store.js';
import { CULTURES } from '../atlas/config.js';
import { clearAllTakes } from '../audio/recorder.js';

function allSceneIds(){
  var seen={},out=[];
  routes().forEach(function(r){(r.scene_ids||[]).forEach(function(id){if(!seen[id]){seen[id]=true;out.push(id)}})});
  return out;
}
function favLabel(id){
  if(id.indexOf('scene-')===0){var s=scene(id);return s?{t:s.title,href:'#scene/'+id}:{t:id,href:''}}
  if(id.indexOf('phrase-')===0){var p=phraseFor(id);if(!p)return {t:id,href:''};var owner=null;for(var i=0;i<state.data.scenes.length;i++)if(state.data.scenes[i].phrase_id===id)owner=state.data.scenes[i];return {t:'「'+p.text+'」· '+p.region_name+'方言',href:owner?'#scene/'+owner.id:''}}
  if(id.indexOf('photo:')===0){var c=CULTURES[id.slice(6)];return c?{t:c.name+' · 图文卡',href:'#culture/'+id.slice(6)}:{t:id,href:''}}
  if(id.indexOf('card:')===0){var s2=scene(id.slice(5));return s2?{t:s2.title+' · 图文卡',href:'#scene/'+s2.id}:{t:id,href:''}}
  var rt=routeById(id);return rt?{t:rt.name,href:'#route/'+rt.id}:{t:id,href:''};
}
function favGroup(prefixes,label){
  var list=Array.isArray(prefixes)?prefixes:[prefixes];
  var items=state.favorites.filter(function(x){return list.some(function(p){return x.indexOf(p)===0})});
  if(!items.length)return '<div class="card"><h3>'+label+'</h3><p class="muted">暂无收藏。</p></div>';
  return '<div class="card"><h3>'+label+'</h3>'+items.map(function(id){var f=favLabel(id);return '<div class="record"><div class="info"><b>'+(f.href?'<a href="'+esc(f.href)+'">'+esc(f.t)+'</a>':esc(f.t))+'</b></div><div class="record-actions"><button class="mini-btn" data-fav="'+esc(id)+'">移除</button></div></div>'}).join('')+'</div>';
}
function noteHeading(id){
  var rt=routeById(id);if(rt)return '路线「'+rt.name+'」';
  var s=scene(id);return s?'场景「'+s.title+'」':'笔记 · '+id;
}
export function routeFavCount(rid){
  var rt=routeById(rid);if(!rt)return 0;
  var ids={};ids[rid]=true;
  (rt.scene_ids||[]).forEach(function(sid){ids[sid]=true;ids['card:'+sid]=true;var s=scene(sid);if(s&&s.phrase_id)ids[s.phrase_id]=true});
  return state.favorites.filter(function(x){return ids[x]}).length;
}
/* 笔记记录的只读形态：页面渲染与「保存修改」后的局部替换共用同一份模板 */
export function noteRecordHtml(k){
  var n=state.notes[k];if(!n||typeof n!=='object')return '';
  var text=typeof n.text==='string'?n.text:'';
  return '<div class="record"><div class="info"><b>'+esc(noteHeading(k))+'</b><p>'+esc(text).replace(/\n/g,'<br>')+'</p><span class="muted">更新于 '+esc(fmtDate(n.at))+'</span></div><div class="record-actions"><button class="mini-btn" data-note-edit="'+esc(k)+'">编辑</button><button class="mini-btn" data-note-del="'+esc(k)+'">删除</button></div></div>';
}
export async function clearAll(){
  if(!confirm('确定清除全部本机学习数据吗？将删除：学习进度、路线完成记录、任务结果、收藏、笔记、跟读录音，以及首次使用提示条的关闭标记。界面设置（释义语言、动效开关）会保留。删除后不可恢复，确定继续吗？'))return;
  try{await clearAllTakes()}catch(e){/* IndexedDB 不可用时仍继续清理 localStorage */}
  ['lingnan-progress','lingnan-scene-steps','lingnan-favorites','lingnan-task-results','lingnan-notes','lingnan-route-completed','lingnan-notice-dismissed'].forEach(function(k){localStorage.removeItem(k)});
  location.reload();
}
export function me(){
  var list=routes();
  var ids=allSceneIds();
  var doneIds=ids.filter(function(id){return isDone(id)});
  var submittedTasks=state.data.tasks.filter(function(t){var v=state.results[t.id];return v&&typeof v==='object'}).length;
  var doneRoutes=Object.keys(state.routeDone).filter(function(rid){return routeById(rid)});
  /* 统计口径与明细渲染一致：损坏的记录值不计入，也不进明细 */
  var noteKeys=Object.keys(state.notes).filter(function(k){var n=state.notes[k];return n&&typeof n==='object'});
  var head='<div class="crumb"><a href="#home">首页</a> / 我的探索</div><h1>我的探索</h1><p class="muted">收藏、进度、任务结果、录音、笔记与成果都保存在这台设备的浏览器中，可在此集中查看与管理。</p>';
  var takesSection='<div class="head"><div><h2>跟读录音</h2><p>在场景页方言卡录制的跟读音频，仅保存在本机浏览器（IndexedDB），不会上传。</p></div><button class="btn secondary" id="takes-clear" hidden>清空全部录音</button></div><div class="card"><div id="takes-list" aria-live="polite"><p class="muted">正在加载录音记录…</p></div></div>';
  var stats='<div class="grid cols4" style="margin-top:18px"><div class="card"><span class="tag">完成场景</span><h2>'+doneIds.length+'/'+ids.length+'</h2><p>全部路线</p></div><div class="card"><span class="tag">任务提交</span><h2>'+submittedTasks+'</h2><p>可重做 · 不作考核</p></div><div class="card"><span class="tag">收藏内容</span><h2 id="fav-count">'+state.favorites.length+'</h2><p>路线 · 场景 · 表达 · 图文卡</p></div><div class="card"><span class="tag">路线成果</span><h2>'+doneRoutes.length+'/'+list.length+'</h2><p>已完成路线</p></div></div>';
  if(!doneIds.length&&!submittedTasks&&!state.favorites.length&&!noteKeys.length)return head+stats+'<div class="empty" style="margin-top:18px">还没有探索记录。完成场景、提交任务或收藏内容后，记录会集中出现在这里。<br><a class="btn" href="#home" style="margin-top:12px">去文化地图看看</a></div>'+takesSection;
  var achRows=doneRoutes.map(function(rid){
    var rt=routeById(rid);var sub=state.data.tasks.filter(function(t){return t.route_id===rid&&state.results[t.id]}).length;
    var count=rt?(rt.scene_ids||[]).length:0;var favCount=routeFavCount(rid);
    return '<div class="record"><div class="info"><b>'+esc(rt.name)+' · 已完成</b><p>完成日期 '+esc(fmtDate(state.routeDone[rid]))+' · 场景 '+count+' 个 · 提交任务 '+sub+' 次 · 本路线收藏 <span data-route-fav="'+esc(rid)+'">'+favCount+'</span> 项</p></div><div class="record-actions"><a class="mini-btn" href="#route/'+esc(rid)+'">回看路线</a><button class="mini-btn" data-route-del="'+esc(rid)+'">删除成果</button></div></div>';
  }).join('');
  var sceneRows=doneIds.map(function(id){var at=doneAt(id);var s=scene(id);var rt=null;var rs=routes();for(var i=0;i<rs.length;i++)if((rs[i].scene_ids||[]).indexOf(id)>=0){rt=rs[i];break}return '<div class="record"><div class="info"><b><a href="#scene/'+esc(id)+'">'+esc(s?s.title:id)+'</a></b><span class="muted">'+(rt?esc(rt.name)+' · ':'')+(at?'完成于 '+esc(fmtDate(at)):'完成时间未记录（旧数据）')+'</span></div><div class="record-actions"><button class="mini-btn" data-remove="'+esc(id)+'">移除记录</button></div></div>'}).join('');
  var noteRows=noteKeys.map(function(k){var n=state.notes[k];if(!n||typeof n!=='object')return '';var text=typeof n.text==='string'?n.text:'';var label=noteHeading(k);
    if(editingNote===k)return '<div class="record"><div class="info"><b>'+esc(label)+'</b><textarea class="note-area" id="edit-note-text" aria-label="编辑笔记">'+esc(text)+'</textarea><span class="muted">更新于 '+esc(fmtDate(n.at))+'</span><div class="record-actions" style="margin-top:8px"><button class="mini-btn" data-note-save="'+esc(k)+'">保存修改</button><button class="mini-btn" data-note-cancel="'+esc(k)+'">取消</button></div></div></div>';
    return noteRecordHtml(k);
  }).join('');
  var resultRows=Object.keys(state.results).map(function(tid){var t=null;for(var i=0;i<state.data.tasks.length;i++)if(state.data.tasks[i].id===tid)t=state.data.tasks[i];if(!t)return '';var res=state.results[tid];if(!res||typeof res!=='object')return '';var ok=res.answer===t.answer;var choice=(typeof res.answer==='number'&&t.options&&t.options[res.answer]!==undefined)?t.options[res.answer]:null;return '<div class="record"><div class="info"><b>'+(ok?'回答正确':'回答错误')+' · '+esc(t.prompt)+'</b><p>你的选择：'+(choice?esc(choice):'记录不完整')+(ok?'':'<br>正确答案：'+esc(t.options[t.answer]))+'</p><span class="muted">提交于 '+esc(fmtDate(res.at))+' · <a href="#scene/'+esc(t.scene_id)+'">回看场景重做 →</a></span></div><div class="record-actions"><button class="mini-btn" data-result-del="'+esc(tid)+'">删除记录</button></div></div>'}).join('');
  return head+stats
    +'<div class="head"><div><h2>路线成果</h2><p>达成完成条件后，这里会记录完成日期、任务数据与本路线收藏。</p></div><a class="btn secondary" href="#route">查看路线</a></div><div class="card">'+(achRows||'<p class="muted">完成一条路线后，成果卡会出现在这里。</p>')+'</div>'
    +'<div class="head"><div><h2>已完成场景</h2><p>移除单条场景记录会一并清除该场景的任务提交，并撤销因此不再成立的路线成果；移除后可回到场景重新完成。</p></div></div>'+(sceneRows?'<div class="card">'+sceneRows+'</div>':'<p class="muted">还没有已完成的场景。</p>')
    +'<div class="head"><div><h2>收藏明细</h2><p>分四组管理，单条可移除。</p></div></div><div class="grid cols2">'+favGroup('route','收藏的路线')+favGroup('scene','收藏的场景')+favGroup('phrase','收藏的表达')+favGroup(['photo:','card:'],'收藏的图文卡')+'</div>'
    +'<div class="head"><div><h2>探索笔记</h2><p>在场景页与路线页都能记录，这里可编辑、可删除。</p></div></div>'+(noteRows?'<div class="card">'+noteRows+'</div>':'<p class="muted">还没有笔记。</p>')
    +'<div class="head"><div><h2>任务结果</h2><p>记录每次提交的正误与日期，可回场景重做或删除单条记录。</p></div></div>'+(resultRows?'<div class="card">'+resultRows+'</div>':'<p class="muted">还没有提交过任务。</p>')
    +takesSection
    +'<div class="head"><div><h2>数据管理</h2><p>以上学习记录仅保存在本机浏览器（localStorage 与 IndexedDB），不会上传。</p></div></div><div class="card" style="text-align:center"><button class="btn danger" id="clear-all">清除全部本机数据</button><p class="muted" style="margin-top:10px">将删除学习进度、路线完成记录、任务结果、收藏、笔记与跟读录音，删除后不可恢复；释义语言与动效开关等界面设置会保留。</p></div>';
}
