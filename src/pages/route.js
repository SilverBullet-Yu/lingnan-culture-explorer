/* 路线页：路线列表与单条路线详情（进度、场景时间线、任务入口与路线笔记） */
import { state, isDone, scene, region, taskFor, fmtDate, fav, esc, TASK_TYPES, routes, routeById } from '../store.js';
import { routeCard } from './route-card.js';
import { missingPage } from './missing.js';

function routeList(){
  var list=routes();
  var doneCount=list.filter(function(r){return state.routeDone[r.id]}).length;
  return '<div class="crumb"><a href="#home">文化地图</a> / 文化路线</div><div class="head"><div><span class="tag">按路线探索</span><h1>文化路线</h1><p>先比较主题、时长与场景数量，再选一条开始；学习进度保存在本机浏览器。</p></div><a class="btn secondary" href="#topics">按主题浏览</a></div>'
    +(list.length?'<div class="grid route-grid">'+list.map(function(r){return routeCard(r)}).join('')+'</div>':'<div class="empty">路线正在筹备中，请稍后再来。</div>')
    +'<div class="card" style="margin-top:22px"><div class="head"><div><h3>路线完成判定</h3><p>每条路线 3 个场景全部完成，并完整提交 3 题路线任务，即记为完成。任务不计分、不排名，可重做。</p></div><span class="tag">已完成 '+doneCount+'/'+list.length+' 条</span></div><a class="btn secondary" href="#me">查看我的探索 →</a></div>';
}
function routeDetail(r){
  var data=state.data||{};
  var ids=Array.isArray(r.scene_ids)?r.scene_ids:[];
  var total=ids.length;
  var tasksAll=Array.isArray(data.tasks)?data.tasks.filter(function(t){return t&&t.route_id===r.id}):[];
  var results=(state.results&&typeof state.results==='object')?state.results:{};
  var routeDone=(state.routeDone&&typeof state.routeDone==='object')?state.routeDone:{};
  var notes=(state.notes&&typeof state.notes==='object')?state.notes:{};
  function sOf(id){try{return scene(id)||null}catch(e){return null}}
  function rOf(id){try{return region(id)||null}catch(e){return null}}
  function tOf(id){try{return taskFor(id)||null}catch(e){return null}}
  function isFav(id){try{return fav(id)}catch(e){return false}}
  function resOf(t){return t&&t.id!=null?results[t.id]:null}
  function dateOf(res){return res&&res.at?esc(fmtDate(res.at)):''}
  function titleOf(s){return s&&s.title?esc(s.title):'未知场景'}
  var pending=ids.filter(function(id){return !isDone(id)});
  var done=total-pending.length;
  var submitted=tasksAll.filter(function(t){return resOf(t)}).length;
  var completedAt=routeDone[r.id];
  var missing=pending.map(function(id){return titleOf(sOf(id))});
  var gap='';if(missing.length)gap+='未完成场景 '+missing.length+' 个：'+missing.join('、')+'；';if(submitted<tasksAll.length)gap+='还需提交 '+(tasksAll.length-submitted)+' 道任务。';
  var next=pending[0]||ids[0];
  var regionNames=[];ids.forEach(function(id){var s=sOf(id);var rg=s?rOf(s.region_id):null;if(rg&&rg.name&&regionNames.indexOf(rg.name)<0)regionNames.push(rg.name)});
  var regionText=regionNames.map(esc).join(' · ')||'—';
  var firstPending=tasksAll.filter(function(t){return !resOf(t)})[0];
  var nextRoute=r.next_route_id?routeById(r.next_route_id):null;
  var allDone=routes().length>0&&routes().every(function(x){return routeDone[x.id]});
  var list=ids.length?ids.map(function(id,i){
    var s=sOf(id);var d=isDone(id);var t=tOf(id);var sub=t?resOf(t):null;
    return '<a class="card timeline" href="#scene/'+esc(id)+'"><span class="'+(d?'step done':'step')+'">'+(d?'✓':i+1)+'</span><div><b>'+titleOf(s)+'</b><p>'+(d?'已完成':'未完成')+' · '+(sub?'任务已提交':'任务未提交')+(s?'':' · 场景数据缺失')+'</p></div></a>'
  }).join(''):'<div class="empty">路线场景正在筹备中。</div>';
  var banner=completedAt?'<div class="banner"><div><span class="tag">路线完成</span><p class="banner-title">「'+esc(r.name||'当前路线')+'」已完成</p><p>完成日期：'+esc(fmtDate(completedAt))+' · '+total+' 个场景 · 提交任务 '+submitted+' 次</p>'+(nextRoute?'<p class="muted">接下来可以衔接下一条路线。</p>':allDone?'<p class="muted">两条路线都已走完，可以回到路线列表或查看探索成果。</p>':'<p class="muted">下一条路线正在筹备中</p>')+'</div><div class="actions" style="margin:0">'+(nextRoute?'<a class="btn" href="#route/'+esc(nextRoute.id)+'">衔接下一条路线：'+esc(nextRoute.name||nextRoute.id)+' →</a>':'<a class="btn secondary" href="#route">返回路线列表</a>')+'<a class="btn" href="#me">查看探索成果 →</a></div></div>':'';
  var pct=total?Math.round(done/total*100):0;
  var rule=r.completion_rule?esc(r.completion_rule):'完成全部场景并提交一次任务';
  var routeMap='<div class="atlas3d-route-map"><div class="atlas3d-route-map-head"><b>这条路线在地图上</b><span>光带串起 '+total+' 个场景</span></div><div id="atlas3d-route-slot" class="atlas3d-route-slot"></div></div>';
  var progressCard='<div class="card" style="margin-top:22px"><div class="head"><div><h2>路线进度</h2><p>'+done+'/'+total+' 个场景已完成 · 任务提交 '+submitted+'/'+tasksAll.length+'</p></div><b>'+pct+'%</b></div><div class="bar"><i style="width:'+pct+'%"></i></div><p class="muted" style="margin:12px 0 0">完成条件：'+rule+'</p>'+(gap?'<p style="margin:4px 0 0">距完成还差：'+gap+'</p>':'')+'</div>';
  var guideHref=(firstPending&&firstPending.scene_id)?'#scene/'+esc(firstPending.scene_id):'';
  var guide=(total&&done===total&&submitted<tasksAll.length&&firstPending&&guideHref)?'<div class="card" style="margin:27px 0 0;border:2px solid var(--peach);background:#fdf3f0;display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap"><div><span class="tag" style="background:var(--peach);color:#5c2e2b">继续完成任务</span><p style="margin:8px 0 2px;font-size:22px;font-weight:700">场景已全部完成，还需提交 '+(tasksAll.length-submitted)+' 道任务</p><p>每个场景对应一道题，完整提交后即可点亮路线。</p></div><a class="btn" href="'+guideHref+'">去作答任务 →</a></div>':'';
  var taskRows=tasksAll.map(function(t,i){
    var s=sOf(t.scene_id);var res=resOf(t);var tn=TASK_TYPES[t.type]||t.type||'任务';
    var st=res?('已提交'+(dateOf(res)?' · '+dateOf(res):'')):'未提交';
    var body='<span class="'+(res?'step done':'step')+'">'+(res?'✓':i+1)+'</span><div><b>'+titleOf(s)+'</b><p><span class="tag">'+esc(tn)+'</span> '+st+'</p></div>'+(t.scene_id?'<b style="margin-left:auto;white-space:nowrap">去作答 →</b>':'<b class="muted" style="margin-left:auto;white-space:nowrap">场景缺失</b>');
    return t.scene_id?'<a class="card timeline" href="#scene/'+esc(t.scene_id)+'">'+body+'</a>':'<div class="card timeline">'+body+'</div>'
  }).join('');
  var taskCard=tasksAll.length?'<div class="head"><div><h2>文化任务</h2><p>本路线共 '+tasksAll.length+' 道任务，每个场景对应 1 题；需完整提交全部 3 题才计入路线完成，可重做且不计分。</p></div>'+(submitted?'<button class="mini-btn" data-route-reset="'+esc(r.id)+'">重做本路线任务</button>':'')+'</div><div class="timeline">'+taskRows+'</div>':'';
  var note=notes[r.id];
  var noteText=note&&typeof note.text==='string'?note.text:'';
  var noteLine=note&&note.at?'最后更新：'+esc(fmtDate(note.at)):'笔记仅保存在本机浏览器。';
  var primary=next?'<a class="btn" href="#scene/'+esc(next)+'">'+(done?'继续探索':'开始第一站')+'</a>':'<span class="muted">首个场景正在筹备中</span>';
  var themeName=esc(r.theme_name||'岭南文化');
  return '<div class="crumb"><a href="#home">首页</a> / <a href="#route">文化路线</a> / '+esc(r.name||'路线')+'</div>'+banner+guide+'<div class="columns"><div><span class="tag">'+themeName+'</span><h1>'+esc(r.name||'当前路线')+'</h1><p class="muted">'+esc(r.description||'')+'</p><div class="actions">'+primary+'<button class="btn secondary" data-fav="'+esc(r.id)+'" data-fav-off="收藏路线" data-fav-on="已收藏 ✓">'+(isFav(r.id)?'已收藏 ✓':'收藏路线')+'</button></div>'+progressCard+routeMap+'</div><aside><div class="card"><h3>路线信息</h3><div class="facts" style="grid-template-columns:1fr"><div class="fact"><b>主题</b>'+themeName+'</div><div class="fact"><b>地区</b>'+regionText+'</div><div class="fact"><b>预计时长</b>'+(r.estimated_minutes?'约 '+esc(r.estimated_minutes)+' 分钟':'待定')+'</div><div class="fact"><b>场景数量</b>'+total+' 个场景</div><div class="fact"><b>学习方式</b>图文 · 方言 · 任务</div></div></div><div class="card" style="margin-top:16px"><h3>路线笔记</h3><p class="muted">'+noteLine+'</p><textarea class="note-area" id="note-text" aria-label="路线笔记" placeholder="记下这条路线的安排，或想比较的地点…">'+esc(noteText)+'</textarea><button class="btn secondary" style="width:100%" data-note="'+esc(r.id)+'">'+(note?'更新笔记':'保存笔记')+'</button></div></aside></div><div class="head"><div><h2>'+total+' 个场景</h2><p>先理解场景，再接触语言，最后完成任务。</p></div></div><div class="timeline">'+list+'</div>'+taskCard+(completedAt?'':'<div class="card" style="margin-top:18px"><b>如何完成这条路线？</b><p style="margin:6px 0 0">'+rule+'。每个场景需确认已读图文卡、提交理解动作，并完整播放声音或使用文字稿替代；随后完成本路线对应的 3 道任务。</p></div>');
}
export function route(id){
  if(!id)return routeList();
  var r=routeById(id);
  if(!r)return missingPage('路线');
  return routeDetail(r);
}
