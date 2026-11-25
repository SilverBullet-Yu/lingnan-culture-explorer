/* 全局状态与本地存储：localStorage 学习记录六键 + 界面设置单键。 */
/* 读出后按期望容器类型校验：键被改坏（旧版本残留、浏览器扩展或同源脚本写入）时
   回到空容器，而不是让渲染链路对非对象/非数组取值抛错、每次刷新都白屏 */
function loadStore(key,fallback,kind){try{var v=JSON.parse(localStorage.getItem(key));if(kind==='array')return Array.isArray(v)?v:fallback;return v&&typeof v==='object'&&!Array.isArray(v)?v:fallback}catch(e){return fallback}}

/* 界面设置（跨刷新保留；清除学习记录时不清除） */
var defaultSettings={phraseLang:'zh',motion:false};
function loadSettings(){
  var s=loadStore('lingnan-settings',{});
  if(!s||typeof s!=='object'||Array.isArray(s))s={};
  Object.keys(defaultSettings).forEach(function(k){if(s[k]===undefined)s[k]=defaultSettings[k]});
  return s;
}
/* 收藏元素级净化：容器是数组但元素非字符串（改坏数据）时剔除，
   避免「我的探索」favGroup 对数字或对象取 indexOf 抛错 */
function sanitizeFavorites(list){return list.filter(function(x){return typeof x==='string'})}
var settings=loadSettings();
function saveSettings(){try{localStorage.setItem('lingnan-settings',JSON.stringify(settings))}catch(e){/* 存储不可用时保留会话内设置 */}}

export var state={atlas:{culture:'guangfu',topic:'all'},data:null,progress:loadStore('lingnan-progress',{}),sceneSteps:loadStore('lingnan-scene-steps',{}),favorites:sanitizeFavorites(loadStore('lingnan-favorites',[],'array')),results:loadStore('lingnan-task-results',{}),notes:loadStore('lingnan-notes',{}),routeDone:loadStore('lingnan-route-completed',{})};
/* 会话内 UI 状态（不入库）：方言卡语言跨页保留，编辑中的笔记 id 仅当前页有效 */
export var phraseLang=settings.phraseLang==='en'?'en':'zh';
export var editingNote='';
/* 跨标签页一致性：另一页清除或改写本机数据后（storage 事件只在非改动页触发），
   本页重读全部键并同步设置——否则旧内存状态会在下次 save() 时“复活”已被清除的记录 */
export function reloadState(){
  state.progress=loadStore('lingnan-progress',{});
  state.sceneSteps=loadStore('lingnan-scene-steps',{});
  state.favorites=sanitizeFavorites(loadStore('lingnan-favorites',[],'array'));
  state.results=loadStore('lingnan-task-results',{});
  state.notes=loadStore('lingnan-notes',{});
  state.routeDone=loadStore('lingnan-route-completed',{});
  settings=loadSettings();
  phraseLang=settings.phraseLang==='en'?'en':'zh';
}
export var TASK_TYPES={listening:'听辨',choice:'选择',matching:'配对',relation:'人物关系',route:'路线判断'};
export function setPhraseLang(v){phraseLang=v;settings.phraseLang=v;saveSettings()}
export function setEditingNote(v){editingNote=v}
export function setMotion(v){settings.motion=!!v;saveSettings()}
export function motionPref(){return !!settings.motion}
export function resetSession(){editingNote=''}
export function save(){try{localStorage.setItem('lingnan-progress',JSON.stringify(state.progress));localStorage.setItem('lingnan-scene-steps',JSON.stringify(state.sceneSteps));localStorage.setItem('lingnan-favorites',JSON.stringify(state.favorites));localStorage.setItem('lingnan-task-results',JSON.stringify(state.results));localStorage.setItem('lingnan-notes',JSON.stringify(state.notes));localStorage.setItem('lingnan-route-completed',JSON.stringify(state.routeDone));return true}catch(e){/* 存储被禁或已满：保留会话内状态，但调用方必须显式处理失败 */return false}}

/* 路线完成条件：全部场景完成，且该路线 3 道任务均有提交记录。 */
export function routeSatisfied(r){
  if(!r||!Array.isArray(r.scene_ids)||!state.data)return false;
  var all=r.scene_ids.every(function(id){return isDone(id)});
  var tasks=(state.data.tasks||[]).filter(function(t){return t.route_id===r.id});
  var submitted=tasks.length===3&&tasks.every(function(t){var v=state.results[t.id];return v&&typeof v==='object'&&typeof v.answer==='number'});
  return all&&submitted;
}
/* 只在场景完成 / 任务提交后调用：达成就补记完成时间，不在这里做反向清除 */
export function checkRoute(){
  if(!state.data||!Array.isArray(state.data.routes))return;
  state.data.routes.forEach(function(r){if(routeSatisfied(r)&&!state.routeDone[r.id])state.routeDone[r.id]=new Date().toISOString()});
}
/* 撤销已不再成立的成果记录（F-12：清除场景进度后不能留下“没有浏览过但已完成”）；返回被撤销的路线名 */
export function pruneRouteDone(){
  var revoked=[];
  routes().forEach(function(r){if(state.routeDone[r.id]&&!routeSatisfied(r)){delete state.routeDone[r.id];revoked.push(r.name||r.id)}});
  return revoked;
}
export function isDone(id){var v=state.progress[id];if(!v)return false;if(v===true)return true;return !!v.done}
export function doneAt(id){var v=state.progress[id];return v&&v!==true&&v.done&&v.at?v.at:null}
export function fmtDate(iso){if(!iso)return '—';var d=new Date(iso);return isNaN(d)?String(iso).slice(0,10):d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2)}
export function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
/* 外链地址白名单：只放行 http(s)/blob/mailto 与站内相对地址，其余（javascript:/data: 等
   可执行 scheme）丢弃换 '#'。种子数据当前均为 https 与相对路径，这里挡住 scheme 从数据侧混入 */
export function safeUrl(u){var s=String(u==null?'':u);return /^(https?:|blob:|mailto:|#|\/|\.{1,2}\/)/i.test(s)||s.indexOf(':')<0?s:'#'}
export function scene(id){if(!state.data)return null;for(var i=0;i<state.data.scenes.length;i++)if(state.data.scenes[i].id===id)return state.data.scenes[i];return null}
export function region(id){if(!state.data)return null;for(var i=0;i<state.data.regions.length;i++)if(state.data.regions[i].id===id)return state.data.regions[i];return null}
export function phraseFor(id){if(!state.data)return null;for(var i=0;i<state.data.phrases.length;i++)if(state.data.phrases[i].id===id)return state.data.phrases[i];return null}
export function taskFor(id){if(!state.data)return null;for(var i=0;i<state.data.tasks.length;i++)if(state.data.tasks[i].scene_id===id)return state.data.tasks[i];return null}
export function routes(){return state.data&&Array.isArray(state.data.routes)?state.data.routes:[]}
export function routeById(id){var list=routes();for(var i=0;i<list.length;i++)if(list[i].id===id)return list[i];return null}
export function defaultRoute(){var list=routes();return list.length?list[0]:null}
export function routeForScene(sceneId){var list=routes();for(var i=0;i<list.length;i++){if(list[i].scene_ids&&list[i].scene_ids.indexOf(sceneId)>=0)return list[i]}return null}
export function fav(id){return state.favorites.indexOf(id)>=0}
