/* 入口：样式、首次使用提示条、hash 路由与种子数据加载。
   #home 为沉浸式地图；#atlas 保留既有完整地图深链。 */
import './styles/styles.css';
import './styles/map.css';
import './styles/photo.css';
import './styles/atlas3d.css';
import './styles/editorial.css';
import './styles/refine.css';
import './styles/embed.css';
import './styles/immersive-home.css';
import './storage-notice.js';
import './audio/recorder.js';
import './audio/scene-completion.js';
import { state, save, resetSession, setPhraseLang, setEditingNote, phraseLang, isDone, scene, taskFor, fav, routes, checkRoute, pruneRouteDone, setMotion, motionPref, defaultRoute, esc, safeUrl, reloadState, fmtDate } from './store.js';
import { atlasMarkup, mountAtlas, disposeAtlas } from './atlas/render.js';

import { home, bindHome } from './pages/home.js';
import { regions } from './pages/regions.js';
import { route } from './pages/route.js';
import { scenePage } from './pages/scene.js';
import { me, clearAll, routeFavCount, noteRecordHtml } from './pages/me.js';
import { culturePage } from './pages/culture.js';
import { regionPage } from './pages/region.js';
import { topicsPage } from './pages/topics.js';
import { missingPage } from './pages/missing.js';

/* 三维地图层按需加载：three 单独成块（约 240KB gzip），首屏不等它；
   层加载完成后由 syncAtlas3D 接管「路由 → 镜头位姿」 */
var atlas3d=null, atlas3dRoute='home', atlas3dParam='';
function syncAtlas3D(route,param){
  atlas3dRoute=route||'home';atlas3dParam=param||'';
  if(atlas3d)atlas3d.syncAtlas3D(atlas3dRoute,atlas3dParam);
}
var forceSvgMap=false;
try{forceSvgMap=new URLSearchParams(window.location.search).get('map')==='svg'}catch(e){}
if(!forceSvgMap){
  import('./atlas3d/index.js').then(function(mod){
    atlas3d=mod;
    mod.initAtlas3D();
    /* 三维层是异步加载的：加载期间发生的路由变化要先存着，层就绪后补一次，
       否则带深链首开（例如 #route/route-arcade-market）会退回总览位姿 */
    mod.syncAtlas3D(atlas3dRoute,atlas3dParam);
  }).catch(function(error){console.warn('[atlas3d] 模块加载失败，继续使用 SVG 地图：',error)});
}

var app=document.getElementById('app');
function shell(x){return '<div>'+x+'</div>'}

/* ---------- 操作级局部更新：收藏 / 笔记 / 任务 ----------
   这三类操作不改变路由，只更新受影响的 DOM，不再整页重建 #app：
   触发控件不被替换（焦点保留），笔记草稿与光标不丢，<audio> 不被销毁。 */
function toggle(id){
  var on=!fav(id);
  if(on)state.favorites.push(id);else state.favorites=state.favorites.filter(function(x){return x!==id});
  save();
  syncFavorite(id,on);
}
/* 收藏状态：同一 id 在页面上可能出现在多个位置（收藏按钮、图文卡角标、我的探索列表） */
function syncFavorite(id,on){
  document.querySelectorAll('[data-fav]').forEach(function(btn){
    if(btn.dataset.fav!==id)return;
    if(btn.classList.contains('mini-btn')){removeFavoriteRow(btn);return}
    if(btn.classList.contains('fav-chip'))btn.classList.toggle('on',on);
    if(btn.hasAttribute('aria-pressed'))btn.setAttribute('aria-pressed',String(on));
    var text=on?btn.dataset.favOn:btn.dataset.favOff;
    if(text)btn.textContent=text;
  });
  var count=document.getElementById('fav-count');
  if(count)count.textContent=String(state.favorites.length);
  document.querySelectorAll('[data-route-fav]').forEach(function(el){el.textContent=String(routeFavCount(el.dataset.routeFav))});
}
/* 「我的探索」的收藏明细：移除单条记录与所在的记录行 */
function removeFavoriteRow(btn){
  var row=btn.closest('.record');if(!row)return;
  var card=row.parentElement;
  var heading=card?card.querySelector('h3'):null;
  var headingText=heading?heading.textContent:'收藏';
  var next=row.nextElementSibling||row.previousElementSibling;
  row.remove();
  if(card&&!card.querySelector('.record')){
    card.textContent='';
    var h=document.createElement('h3');h.textContent=headingText;card.appendChild(h);
    var p=document.createElement('p');p.className='muted';p.textContent='暂无收藏。';card.appendChild(p);
  }
  /* 触发按钮已随记录行移除，焦点交给同组下一条移除按钮；组内没有记录时交给分组卡片 */
  var target=next?next.querySelector('[data-fav]'):null;
  if(target)target.focus();
  else if(card){card.setAttribute('tabindex','-1');card.focus({preventScroll:true})}
}
/* 笔记保存：只改「最后更新」与按钮文案，textarea 保持原值，草稿与光标不受影响 */
function syncNote(id){
  var btn=document.querySelector('[data-note]');
  if(!btn||btn.dataset.note!==id)return;
  var note=state.notes[id];
  var card=btn.closest('.card');
  var meta=card?card.querySelector('p.muted'):null;
  if(meta)meta.textContent=note&&note.at?'最后更新：'+fmtDate(note.at):'笔记仅保存在本机浏览器。';
  btn.textContent=note?'更新笔记':'保存笔记';
}
/* 任务提交：只更新结果区与按钮文案，选项、焦点与同页音频保持原样 */
function syncTaskResult(t){
  var res=state.results[t.id];if(!res)return;
  var ok=res.answer===t.answer;
  var box=document.getElementById('task-result');
  if(box){
    box.hidden=false;
    box.className='result '+(ok?'good':'bad');
    box.innerHTML='<b>'+(ok?'回答正确':'回答错误，再想想')+'</b><span class="muted">'+fmtDate(res.at)+' 提交</span><br>你的选择：'+esc(t.options[res.answer])+(ok?'':'<br>正确答案：'+esc(t.options[t.answer])+'<br>'+esc(t.explanation));
  }
  var btn=document.getElementById('task-submit');
  if(btn)btn.textContent='重新提交';
}
function syncNav(p0){document.querySelectorAll('nav a').forEach(function(a){var current=a.hash==='#'+p0||((p0==='culture'||p0==='atlas')&&a.hash==='#home')||(p0==='region'&&a.hash==='#regions')||(p0==='scene'&&a.hash==='#route');if(current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')})}

/* 「跳到主要内容」：#main-content 是页面内锚点，不是业务路由。浏览器默认先改 hash，
   再触发 hashchange → routeRender 整页重渲，历史里多一条 #main-content；按返回又被
   路由守卫改回原路由，形成来回跳转。这里拦下链接的点击/Enter，只把焦点交给主内容区：
   不改 hash、不增历史、不进入路由判定，任意路由（含带参数页与 404）都成立。 */
function initSkipLink(){
  document.querySelectorAll('a[href="#main-content"]').forEach(function(link){
    link.addEventListener('click',function(e){
      var target=document.getElementById('main-content');
      if(!target)return;
      e.preventDefault();
      target.focus();
      target.scrollIntoView({block:'start'});
    });
  });
}
initSkipLink();


function normQ(s){return String(s||'').toLowerCase().replace(/[\s，。！？、；：“”‘’（）()《》〈〉·…,.!?;:'"\-]/g,'')}
function scoreQA(q,question){
  var n=normQ(question),score=0;
  (q.keywords||[]).forEach(function(k){var nk=normQ(k);if(nk&&n.indexOf(nk)>=0)score+=Math.max(2,nk.length)});
  var qn=normQ(q.question);
  for(var i=0;i<qn.length-1;i++){if(n.indexOf(qn.slice(i,i+2))>=0)score+=1}
  return score;
}
function askQA(question){
  var id=location.hash.split('/')[1];
  var list=(state.data&&state.data.qa?state.data.qa:[]).filter(function(q){return q.scene_id===id});
  var box=document.getElementById('qa-result');if(!box)return;
  if(!normQ(question)){box.className='qa-result warn';box.innerHTML='<b>请先输入一个问题</b><p>可以点下方建议问题，或围绕本场景的地点、人物、物件与故事提问。</p>';return}
  var best=null,bestScore=0;
  list.forEach(function(q){var s=scoreQA(q,question);if(s>bestScore){bestScore=s;best=q}});
  if(best&&bestScore>=2){
    box.className='qa-result good';
    box.innerHTML='<b>回答</b><p>'+esc(best.answer)+'</p><p class="muted">来源：'+esc(best.source)+(best.source_url?' · <a href="'+esc(safeUrl(best.source_url))+'" target="_blank" rel="noopener noreferrer">查看来源 ↗</a>':'')+'</p>';
  }else{
    box.className='qa-result warn';
    /* 兜底链接只指向真实场景：id 取自地址栏，拼写错误时退回路线列表 */
    var back=scene(id)?'#scene/'+esc(id):'#route';
    box.innerHTML='<b>当前内容暂未覆盖</b><p>这个问题还没有审核过的答案。可以回到上方场景图文卡，或换一个与场景有关的问题。</p><p class="muted"><a href="'+back+'">回到场景内容</a></p>';
  }
}

/* 业务路由名；静态骨架内的锚点（如 index.html 的“跳到主要内容”→ #main-content）不属于它们 */
var ROUTES=['home','atlas','regions','topics','route','scene','me','culture','region','yingge'];
var lastRoute='';

/* #yingge：全屏内嵌「英歌 · 上场之前」子应用（iframe 原样运行，独立主题/存储/路由）。
   岭南只负责挂载与返回；sub 透传为英歌初始 hash，支持 #yingge/story/ch1 之类深链。 */
function renderYinggeEmbed(sub){
  var src='yingge/index.html'+(sub?('#'+sub):'');
  app.innerHTML=shell('<div class="yingge-embed" role="region" aria-label="英歌 · 上场之前（内嵌体验）">'
    +'<div class="yingge-embed-bar">'
    +'<a class="yingge-embed-back" href="#home">← 返回岭南游纪文化地图</a>'
    +'<span class="yingge-embed-title">英歌上场前 · 普宁案例拓展</span>'
    +'<a class="yingge-embed-open" href="'+esc(src)+'" target="_blank" rel="noopener">在新标签打开 ↗</a>'
    +'</div>'
    +'<iframe class="yingge-embed-frame" src="'+esc(src)+'" title="英歌 · 上场之前 —— 英歌舞互动故事"></iframe>'
    +'</div>');
  app.setAttribute('aria-busy','false');
  document.title='英歌 · 上场之前 · 岭南游纪';
  syncNav('yingge');
  var back=app.querySelector('.yingge-embed-back');if(back)back.focus({preventScroll:true});
}

function render(){
  var h=location.hash.slice(1)||'home';var p=h.split('/');
  /* 命中 #main-content / #app 这类页面内锚点时回到上一个有效路由：
     直接走 dispatch 会被当成无效地址渲染成引导页，把整页内容（含焦点目标）替换掉 */
  if(h&&ROUTES.indexOf(p[0])<0&&document.getElementById(p[0])){location.hash=lastRoute||'#home';return}
  if(ROUTES.indexOf(p[0])>=0)lastRoute='#'+h;
  document.body.classList.toggle('is-yingge-embed',p[0]==='yingge');
  document.body.classList.toggle('is-immersive-home',p[0]==='home'&&!!state.data);
  if(p[0]==='home'||p[0]==='atlas')document.title=p[0]==='home'?'岭南游纪 · 文化地图':'粤港澳 · 文化地图 · 岭南游纪';
  disposeAtlas();
  if(p[0]==='yingge'){renderYinggeEmbed(p.slice(1).join('/'));return}
  if(!state.data){
    app.innerHTML='<div class="empty">正在展开岭南文化地图…</div>';
    app.setAttribute('aria-busy','true');
    syncAtlas3D(p[0],p[1]);
    syncNav(p[0]);
    return;
  }
  var html=p[0]==='home'?home():p[0]==='atlas'?'<div class="crumb"><a href="#home">← 返回首页</a></div>'+atlasMarkup():p[0]==='regions'?regions():p[0]==='topics'?topicsPage(p[1]):p[0]==='route'?route(p[1]):p[0]==='scene'?scenePage(p[1]):p[0]==='me'?me():p[0]==='culture'?culturePage(p[1]):p[0]==='region'?regionPage(p[1]):missingPage('页面');
  app.innerHTML=shell(html);
  app.setAttribute('aria-busy','false');
  bind();
  bindHome(app.querySelector('.immersive-home'));
  mountAtlas();
  syncAtlas3D(p[0],p[1]);
  syncNav(p[0]);
}

function bind(){
  document.querySelectorAll('[data-culture-topic]').forEach(function(button){button.onclick=function(){state.atlas.topic=button.dataset.cultureTopic;render()}});
  document.querySelectorAll('[data-fav]').forEach(function(x){x.onclick=function(e){e.preventDefault();e.stopPropagation();toggle(x.dataset.fav)}});
  document.querySelectorAll('[data-remove]').forEach(function(x){x.onclick=function(){
    var id=x.dataset.remove,s=scene(id),t=taskFor(id);
    var resetTask=!!(t&&state.results[t.id]);
    var revoke=routes().filter(function(r){return state.routeDone[r.id]&&Array.isArray(r.scene_ids)&&r.scene_ids.indexOf(id)>=0}).map(function(r){return r.name||r.id});
    var msg='移除「'+(s?s.title:id)+'」的浏览记录？';
    if(resetTask)msg+='该场景已提交的任务结果会一并清除。';
    if(revoke.length)msg+='清除后「'+revoke.join('、')+'」不再满足完成条件（场景未全部完成），其成果记录会被撤销。';
    msg+='删除后不可恢复，学习进度只影响这一条场景。';
    if(!confirm(msg))return;
    delete state.progress[id];
    delete state.sceneSteps[id];
    if(resetTask)delete state.results[t.id];
    pruneRouteDone();
    save();render();
  }});
  document.querySelectorAll('[data-note]').forEach(function(x){x.onclick=function(){
    var el=document.getElementById('note-text');
    var t=el?el.value.replace(/^\s+|\s+$/g,''):'';
    var id=x.dataset.note;
    if(t)state.notes[id]={text:t,at:new Date().toISOString()};else delete state.notes[id];
    if(!save()){
      var meta=x.closest('.card')?x.closest('.card').querySelector('p.muted'):null;
      if(meta)meta.textContent='本机存储不可用：笔记只保留在当前页面，请检查浏览器存储权限后重试。';
      return;
    }
    syncNote(id);
  }});
  var b=document.getElementById('phrase-lang');
  if(b)b.onclick=function(){setPhraseLang(phraseLang==='en'?'zh':'en');render()};
  var sub=document.getElementById('task-submit');
  if(sub)sub.onclick=function(){
    var t=taskFor(location.hash.split('/')[1]);
    var currentRoute=t&&routes().find(function(r){return r.id===t.route_id});
    if(currentRoute&&currentRoute.scene_ids.some(function(id){return !isDone(id)})){var taskMessage=document.getElementById('task-result');if(taskMessage){taskMessage.hidden=false;taskMessage.className='result warn';taskMessage.textContent='请先完成本路线的 3 个场景，再提交路线任务。'}return}
    var sel=document.querySelector('#task-card .option.selected');
    var box=document.getElementById('task-result');
    if(!box||!t)return;
    if(!sel){box.hidden=false;box.className='result warn';box.textContent='请先选择一个选项，再点「提交答案」。';return}
    state.results[t.id]={answer:Number(sel.dataset.a),at:new Date().toISOString()};
    checkRoute();
    if(!save()){
      box.hidden=false;box.className='result warn';box.textContent='本机存储不可用：答案只保留在当前页面，请检查浏览器存储权限后重试。';
      return;
    }
    syncTaskResult(t);
  };
  document.querySelectorAll('#task-card .option').forEach(function(x){x.onclick=function(){document.querySelectorAll('#task-card .option').forEach(function(y){y.classList.remove('selected');y.setAttribute('aria-checked','false')});x.classList.add('selected');x.setAttribute('aria-checked','true')}});
  document.querySelectorAll('[data-note-edit]').forEach(function(x){x.onclick=function(){setEditingNote(x.dataset.noteEdit);render()}});
  document.querySelectorAll('[data-note-cancel]').forEach(function(x){x.onclick=function(){setEditingNote('');render()}});
  document.querySelectorAll('[data-note-del]').forEach(function(x){x.onclick=function(){if(confirm('删除这条笔记？删除后不可恢复。')){delete state.notes[x.dataset.noteDel];save();render()}}});
  document.querySelectorAll('[data-note-save]').forEach(function(x){x.onclick=function(){
    var el=document.getElementById('edit-note-text');
    var t=el?el.value.replace(/^\s+|\s+$/g,''):'';
    var k=x.dataset.noteSave;
    if(t)state.notes[k]={text:t,at:new Date().toISOString()};else delete state.notes[k];
    if(!save()){
      var tip=x.closest('.record')?x.closest('.record').querySelector('.muted'):null;
      if(tip)tip.textContent='本机存储不可用：修改未保存，请检查浏览器存储权限后重试。';
      return;
    }
    setEditingNote('');
    var row=x.closest('.record');
    if(state.notes[k]){
      /* 只把这一条记录从编辑态换成只读态，其余记录与焦点之外的内容不动 */
      if(row)row.outerHTML=noteRecordHtml(k);
      bind();
      var edit=document.querySelector('[data-note-edit="'+k+'"]');
      if(edit)edit.focus({preventScroll:true});
    }else if(row){
      /* 清空后保存等于删除这条笔记：移除记录行，空列表回退为空态文案 */
      var card=row.parentElement;
      var head=card?card.previousElementSibling:null;
      row.remove();
      if(card&&!card.querySelector('.record')){
        card.textContent='';
        var empty=document.createElement('p');empty.className='muted';empty.textContent='还没有笔记。';
        card.replaceWith(empty);
      }
      var heading=head?head.querySelector('h2'):null;
      if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true})}
    }
  }});
  document.querySelectorAll('[data-result-del]').forEach(function(x){x.onclick=function(){if(confirm('删除这条任务结果？删除后不可恢复；若路线不再满足完成条件，成果记录也会撤销。')){delete state.results[x.dataset.resultDel];pruneRouteDone();save();render()}}});
  document.querySelectorAll('[data-route-del]').forEach(function(x){x.onclick=function(){if(confirm('删除这条路线成果记录？删除后不可恢复；学习进度与任务结果不受影响。')){delete state.routeDone[x.dataset.routeDel];save();render()}}});
  document.querySelectorAll('[data-route-reset]').forEach(function(x){x.onclick=function(){if(confirm('重做本路线全部任务？已提交的任务结果会被清除；路线成果记录也会撤销，完成场景仍保留。')){var rid=x.dataset.routeReset;Object.keys(state.results).forEach(function(tid){var t=null;for(var i=0;i<state.data.tasks.length;i++)if(state.data.tasks[i].id===tid)t=state.data.tasks[i];if(t&&t.route_id===rid)delete state.results[tid]});pruneRouteDone();save();render()}}});
  var ca=document.getElementById('clear-all');
  if(ca)ca.onclick=clearAll;
  var qaForm=document.getElementById('qa-form');
  if(qaForm)qaForm.onsubmit=function(e){e.preventDefault();var input=document.getElementById('qa-input');askQA(input?input.value:'')};
  document.querySelectorAll('[data-qa-suggest]').forEach(function(x){x.onclick=function(){var input=document.getElementById('qa-input');if(input)input.value=x.dataset.qaSuggest;askQA(x.dataset.qaSuggest)}});
}

function applyMotion(on){document.body.classList.toggle('reduced-motion',on);var btn=document.getElementById('motion');if(btn){btn.setAttribute('aria-pressed',String(on));btn.textContent=on?'恢复动效':'减少动效'}}
applyMotion(motionPref());
document.getElementById('motion').onclick=function(){var on=!document.body.classList.contains('reduced-motion');applyMotion(on);setMotion(on)};

render();
/* 页面切换柔转（View Transitions，渐进增强）：仅 hash 路由切换走 startViewTransition，
   同页局部更新（收藏、笔记、任务）已不再重渲，释义切换等仍走重渲但不产生过渡；减少动效
   （手动开关或系统偏好）或浏览器不支持时直接重渲，F-13 两条关闭通道不受影响 */
/* 回顶与焦点/标题更新必须等新 DOM 就绪：VT 下 render 异步执行，若跟在
   routeRender() 调用之后同步执行，拿到的是即将被替换的旧页面 h1 */
function settlePage(){
  window.scrollTo(0,0);
  var heading=app.querySelector('h1, [role=heading][aria-level="1"]');
  if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});if(!document.body.classList.contains('is-immersive-home'))document.title=heading.textContent+' · 岭南游纪'}
}
function routeRender(){
  var reduced=document.body.classList.contains('reduced-motion')||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!reduced&&document.startViewTransition)document.startViewTransition(function(){render();settlePage()});
  else{render();settlePage()}
}
window.addEventListener('hashchange',function(){resetSession();routeRender()});
/* 加载失败不逼用户整页刷新：页内一键重试（验收演示时直接恢复，不用碰开发者工具） */
function loadSeedFailed(){
  app.setAttribute('aria-busy','false');
  app.innerHTML='<div class="empty">种子数据加载失败，请在 原型/ 目录运行 npm run dev（或 npm run preview）后访问对应本地地址。<br><button class="btn" id="seed-retry" style="margin-top:12px">重试加载</button></div>';
  var retry=document.getElementById('seed-retry');if(retry)retry.onclick=loadSeed;
}
function loadSeed(){fetch('/api/seed-data').then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(function(d){state.data=d;state.favorites=state.favorites.filter(function(x,i,a){return a.indexOf(x)===i}).map(function(x){return x==='route'?(defaultRoute()?defaultRoute().id:x):x}).filter(function(x,i,a){return a.indexOf(x)===i});save();render()}).catch(function(error){console.error('[seed] 加载或首屏渲染失败：',error);loadSeedFailed()})}
loadSeed();
/* 跨标签页一致性：其他标签页清除或改写本机数据（storage 事件不在改动页自身触发）时，
   重读状态并重渲——否则本页旧内存状态会在下次保存时“复活”已被清除的记录 */
window.addEventListener('storage',function(e){
  if(e.key&&e.key.indexOf('lingnan-')!==0)return;
  reloadState();
  applyMotion(motionPref());
  render();
});
