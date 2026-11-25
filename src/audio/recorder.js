/* 跟读录音模块（自包含）：IndexedDB 存取、document 级事件委托、整页重渲时的资源清理。
   main.js 只需 import 一次（模块加载时自行注册监听，不依赖 bind()）。
   产品红线：全部在本机完成，不上传，不做任何评分。
   IndexedDB：库名 lingnan-audio，对象仓 takes（自增主键），记录 {scene_id,phrase_id,phrase_text,at,duration_ms,blob}。 */
import '../styles/recorder.css';
import { state, scene, phraseFor, fmtDate, esc } from '../store.js';

/* ---------- IndexedDB 助手 ---------- */
var DB='lingnan-audio',STORE='takes';
function openDB(){return new Promise(function(res,rej){var rq=indexedDB.open(DB,1);rq.onupgradeneeded=function(){rq.result.createObjectStore(STORE,{autoIncrement:true})};rq.onsuccess=function(){res(rq.result)};rq.onerror=function(){rej(rq.error||new Error('IndexedDB 打开失败'))}})}
function tx(mode,fn){return openDB().then(function(db){return new Promise(function(res,rej){var t=db.transaction(STORE,mode);var rq=fn(t.objectStore(STORE));t.oncomplete=function(){db.close();res(rq&&rq.result)};t.onerror=function(){db.close();rej(t.error)};t.onabort=function(){db.close();rej(t.error||new Error('事务中止'))}})})}
function addTake(rec){return tx('readwrite',function(st){return st.add(rec)})}
function delTake(id){var k=/^\d+$/.test(String(id))?Number(id):id;return tx('readwrite',function(st){return st.delete(k)})}
function clearTakes(){return tx('readwrite',function(st){return st.clear()})}
export function clearAllTakes(){return clearTakes()}
function allTakes(){return openDB().then(function(db){return new Promise(function(res,rej){var out=[],t=db.transaction(STORE,'readonly'),rq=t.objectStore(STORE).openCursor();rq.onsuccess=function(){var c=rq.result;if(c){var v=c.value;v.id=c.key;out.push(v);c.continue()}else res(out)};rq.onerror=function(){rej(rq.error)};t.oncomplete=function(){db.close()}})})}

/* ---------- 模块内状态 ---------- */
var rec=null,stream=null,startAt=0,timer=0,aborted=false;   /* 正在进行的录音（音频分片挂在 rec.buf 上，避免多轮录音互相污染） */
var starting=false,saving=false,gen=0;   /* 权限请求中 / 保存中 / 录音轮次（丢弃迟到的异步回调） */
var pending=null;      /* 最近一次未保存的录音 {blob,duration_ms,url,saved} */
var listUrls=[];       /* 「我的探索」列表正在使用的 blob URL，重渲前统一 revoke */
var compareAudio=null; /* compareTake 动态创建的原声实例：不在 DOM 里，pauseOthers 管不到，需自持引用防连点叠音 */
var takesById={};      /* 「我的探索」当前列表，供原声对比取 phrase_id */
var MAX_MS=120000;     /* 单条最长 2 分钟，到时自动停止 */
function recording(){return !!(rec&&rec.state==='recording')}
function fmtDur(ms){if(!(ms>=0))return '—';var s=Math.round(ms/1000);if(s<60)return s+' 秒';return Math.floor(s/60)+' 分 '+('0'+(s%60)).slice(-2)+' 秒'}
function play(a){var r=a.play();if(r&&r.catch)r.catch(function(){})}
function setStatus(msg,cls){var el=document.getElementById('rec-status');if(!el)return;el.textContent=msg;el.className='rec-status'+(cls?' '+cls:'')}
/* 页内提示：用于「我的探索」等没有 #rec-status 的位置，替代 alert（不打断操作、读屏可播报） */
var toastEl=null,toastTimer=0;
function announce(msg){
  if(!toastEl){toastEl=document.createElement('div');toastEl.className='rec-toast';toastEl.setAttribute('role','status');document.body.appendChild(toastEl)}
  toastEl.textContent=msg;toastEl.hidden=false;
  if(toastTimer)clearTimeout(toastTimer);
  toastTimer=setTimeout(function(){if(toastEl)toastEl.hidden=true;toastTimer=0},4500);
}

/* ---------- 重渲清理：页面导航会整体替换 #app 内容 ----------
   用 MutationObserver 监听 #app 直接子节点（整页 innerHTML 覆盖必触发，地图挂载等后代变更不触发）：
   录音进行中→停止媒体轨并丢弃未保存录音；已创建的 blob URL 在下次渲染前 revoke。 */
function stopTracks(){if(stream){try{stream.getTracks().forEach(function(t){t.stop()})}catch(e){}stream=null}}
function cleanup(){
  aborted=true;gen++;starting=false;saving=false;
  if(timer){clearInterval(timer);timer=0}
  if(rec){try{if(rec.state!=='inactive')rec.stop()}catch(e){}rec=null}
  stopTracks();
  if(pending&&pending.url)URL.revokeObjectURL(pending.url);
  pending=null;
  if(compareAudio){try{compareAudio.pause()}catch(e){}compareAudio=null}
  listUrls.forEach(function(u){URL.revokeObjectURL(u)});listUrls=[];
}
function onAppSwap(){
  if(recording()||starting||pending||stream||listUrls.length)cleanup();
  if(document.getElementById('takes-list'))refreshTakes();   /* 「我的探索」渲染出现后填充列表 */
}
var appEl=document.getElementById('app');
if(appEl&&window.MutationObserver)new MutationObserver(onAppSwap).observe(appEl,{childList:true});
else window.addEventListener('hashchange',onAppSwap);        /* 兜底 */

/* ---------- 跟读录音（场景页方言卡） ---------- */
function toggleBtn(){return document.querySelector('[data-rec-act="toggle"]')}
function tick(){
  var ms=Date.now()-startAt;
  setStatus('● 录音中 '+('0'+Math.floor(ms/60000)).slice(-2)+':'+('0'+Math.floor(ms/1000)%60).slice(-2)+' · 最长 2 分钟','rec-live');
  if(ms>=MAX_MS)stopRec();
}
function startRec(){
  if(recording()||starting)return;
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.MediaRecorder){setStatus('此浏览器不支持录音（需在 localhost 或 https 环境下用较新的浏览器打开）。','rec-err');return}
  if(pending){if(pending.url)URL.revokeObjectURL(pending.url);pending=null}
  var box=document.getElementById('rec-result');if(box)box.hidden=true;
  var sv=document.querySelector('[data-rec-act="save"]');if(sv){sv.disabled=false;sv.textContent='保存到本机'}   /* 重录后允许再次保存 */
  aborted=false;starting=true;var my=++gen;
  setStatus('正在请求麦克风权限…');
  navigator.mediaDevices.getUserMedia({audio:true}).then(function(s){
    if(my!==gen){try{s.getTracks().forEach(function(t){t.stop()})}catch(e){}return}   /* 已切页或已开始新一轮：停掉这条流并放弃 */
    starting=false;stream=s;
    var opts=null;
    if(MediaRecorder.isTypeSupported){if(MediaRecorder.isTypeSupported('audio/webm'))opts={mimeType:'audio/webm'};else if(MediaRecorder.isTypeSupported('audio/mp4'))opts={mimeType:'audio/mp4'}}
    try{rec=opts?new MediaRecorder(s,opts):new MediaRecorder(s)}catch(e){try{rec=new MediaRecorder(s)}catch(e2){setStatus('录音初始化失败：'+(e2&&e2.message?e2.message:'此环境不可用'),'rec-err');stopTracks();return}}
    var mine=rec;mine.buf=[];
    mine.ondataavailable=function(e){if(e.data&&e.data.size)mine.buf.push(e.data)};
    mine.onstop=function(){onStop(mine)};
    mine.start();startAt=Date.now();
    var b=toggleBtn();if(b){b.textContent='■ 停止录音';b.classList.add('rec-on')}
    timer=setInterval(tick,250);tick();
  }).catch(function(e){
    if(my!==gen)return;
    starting=false;stopTracks();
    var msg=e&&e.name==='NotAllowedError'?'未获得麦克风权限：请在浏览器地址栏的权限设置里允许麦克风后重试。':e&&e.name==='NotFoundError'?'未检测到麦克风设备，请检查后重试。':'录音启动失败：'+(e&&e.message?e.message:'未知原因');
    setStatus(msg,'rec-err');
  });
}
function stopRec(){
  if(rec&&rec.state==='recording'){try{rec.stop()}catch(e){}}
}
function onStop(src){
  if(src!==rec)return;                                        /* 迟到回调（已切页或已开始新一轮）：不动新一轮的状态 */
  if(timer){clearInterval(timer);timer=0}
  var ms=Date.now()-startAt;var mt=src&&src.mimeType;var parts=(src&&src.buf)||[];
  rec=null;stopTracks();
  var b=toggleBtn();if(b){b.textContent='● 开始录音';b.classList.remove('rec-on')}
  if(aborted)return;                                          /* 重渲丢弃，不入库 */
  var blob=new Blob(parts,{type:mt||'audio/webm'});           /* 先取走分片再清空，否则 Blob 永远为空 */
  if(!blob.size){setStatus('没有录到声音，请检查麦克风后再试。','rec-err');return}
  if(pending&&pending.url)URL.revokeObjectURL(pending.url);
  pending={blob:blob,duration_ms:ms,url:URL.createObjectURL(blob)};
  var a=document.querySelector('.rec-playback');if(a)a.src=pending.url;
  var box=document.getElementById('rec-result');if(box)box.hidden=false;
  setStatus('已停止 · 时长 '+fmtDur(ms)+'，可回放、重录或保存到本机。');
}
function saveTake(){
  if(recording()||!pending||pending.saved||saving)return;    /* 录音中/已保存/保存中都不重复入库 */
  var block=document.querySelector('[data-rec]');if(!block)return;
  var sc=block.dataset.scene||'',ph=block.dataset.phrase||'';
  var p=phraseFor(ph);var cur=pending;saving=true;
  addTake({scene_id:sc,phrase_id:ph,phrase_text:p&&p.text?p.text:'',at:new Date().toISOString(),duration_ms:cur.duration_ms,blob:cur.blob}).then(function(){
    saving=false;cur.saved=true;
    if(!document.body.contains(block))return;                 /* 保存期间已切页：不改动新页面 */
    var btn=document.querySelector('[data-rec-act="save"]');if(btn){btn.disabled=true;btn.textContent='已保存 ✓'}
    setStatus('已保存到「我的探索 · 跟读录音」，仅在本机浏览器可见。');
  }).catch(function(){saving=false;if(!document.body.contains(block))return;setStatus('保存失败：此浏览器存储不可用（可能处于隐私模式），录音未保存。','rec-err')});
}

/* ---------- 「我的探索」录音记录列表 ---------- */
function refreshTakes(){
  var box=document.getElementById('takes-list');if(!box)return;
  allTakes().then(function(list){
    var box2=document.getElementById('takes-list');if(!box2)return;   /* await 期间可能已重渲 */
    listUrls.forEach(function(u){URL.revokeObjectURL(u)});listUrls=[];
    list=list.filter(function(tk){return tk&&tk.blob});              /* 跳过不完整的旧记录，避免 createObjectURL 抛错 */
    list.sort(function(x,y){return (x.at||'')<(y.at||'')?1:-1});      /* 新的在前 */
    takesById={};
    var clearBtn=document.getElementById('takes-clear');if(clearBtn)clearBtn.hidden=!list.length;
    if(!list.length){box2.innerHTML='<p class="muted">还没有跟读录音。到任意场景页的方言卡里，用「跟读练习」录一句吧。</p>';return}
    box2.innerHTML=list.map(function(tk){
      takesById[tk.id]=tk;
      var s=state.data&&tk.scene_id?scene(tk.scene_id):null;
      var tkPhrase=tk.phrase_id?phraseFor(tk.phrase_id):null;
      var title=s?s.title:(tk.scene_id||'未知场景');
      var text=tk.phrase_text||'';
      var url=URL.createObjectURL(tk.blob);listUrls.push(url);
      var compare=tkPhrase&&tkPhrase.audio_url?'<button class="mini-btn" data-take-act="compare" data-id="'+esc(tk.id)+'">原声对比</button>':'';
      return '<div class="record"><div class="info"><b>'+esc(title)+' · 跟读录音</b><audio class="rec-take-audio" data-take-id="'+esc(tk.id)+'" src="'+esc(url)+'" preload="none"></audio><p>'+(text?esc(text)+' · ':'')+'<span class="muted">'+fmtDate(tk.at)+' · 时长 '+fmtDur(tk.duration_ms)+' · 仅本机保存</span></p></div><div class="record-actions"><button class="mini-btn" data-take-act="play" data-id="'+esc(tk.id)+'">▶ 播放</button>'+compare+'<a class="mini-btn" href="#scene/'+encodeURIComponent(tk.scene_id||'')+'">去场景</a><button class="mini-btn" data-take-act="del" data-id="'+esc(tk.id)+'">删除</button></div></div>';
    }).join('');
  }).catch(function(){var box3=document.getElementById('takes-list');if(box3)box3.innerHTML='<p class="muted">录音记录读取失败：此浏览器可能不支持或已禁用 IndexedDB。</p>'});
}
function playTake(id){
  var a=document.querySelector('audio[data-take-id="'+id+'"]');if(!a)return;
  document.querySelectorAll('audio.rec-take-audio').forEach(function(o){if(o!==a&&!o.paused)o.pause()});
  if(a.paused)play(a);else a.pause();
}
function pauseOthers(except){
  document.querySelectorAll('audio').forEach(function(o){if(o!==except&&!o.paused){try{o.pause()}catch(e){}}});
}
/* 场景页：先放原声，结束后接自己的跟读 */
function comparePractice(){
  var original=document.querySelector('audio[data-audio-kind="phrase"]');
  var take=document.querySelector('.rec-playback');
  if(!original||!original.getAttribute('src')){setStatus('这条表达还没有示范音频，暂不能与原声对比。','rec-err');return}
  if(!pending){setStatus('先录一段跟读，再与原声对比。','rec-err');return}
  if(take&&pending.url)take.src=pending.url;
  pauseOthers(original);
  var minePlayed=false;
  function playMine(){if(minePlayed)return;minePlayed=true;if(take){try{take.currentTime=0}catch(e){}play(take)}setStatus('原声结束，正在播放你的跟读…')}
  original.addEventListener('ended',playMine,{once:true});
  original.addEventListener('error',playMine,{once:true});
  try{original.currentTime=0}catch(e){}
  setStatus('正在播放原声…');
  var r=original.play();
  if(r&&r.catch)r.catch(playMine);
  setTimeout(function(){if(minePlayed)return;if(original.paused)playMine()},12000);
}
/* 我的探索：原声 → 已保存的跟读 */
function compareTake(id){
  var tk=takesById[id];if(!tk)return;
  var p=tk.phrase_id?phraseFor(tk.phrase_id):null;
  var takeAudio=document.querySelector('audio[data-take-id="'+id+'"]');
  if(!takeAudio)return;
  if(!p||!p.audio_url){announce('这条表达还没有示范音频，暂不能与原声对比。');return}
  pauseOthers(takeAudio);
  if(compareAudio){try{compareAudio.pause()}catch(e){}}   /* 连点两次会叠出多路原声 */
  var original=new Audio(p.audio_url);
  compareAudio=original;
  var minePlayed=false;
  function playMine(){if(minePlayed)return;minePlayed=true;try{takeAudio.currentTime=0}catch(e){}play(takeAudio)}
  original.addEventListener('ended',playMine,{once:true});
  original.addEventListener('error',playMine,{once:true});
  original.play().catch(playMine);
  setTimeout(function(){if(!original.paused)return;playMine()},12000);
}

/* ---------- document 级事件委托（注册一次，重渲后依然有效） ---------- */
document.addEventListener('click',function(e){
  var el=e.target;if(!el||!el.closest)return;
  var take=el.closest('[data-take-act]');                     /* 我的探索：单条播放/删除 */
  if(take){var act=take.dataset.takeAct,tid=take.dataset.id;
    if(act==='play')playTake(tid);
    else if(act==='compare')compareTake(tid);
    else if(act==='del'&&confirm('删除这条跟读录音？删除后不可恢复。'))delTake(tid).then(refreshTakes).catch(function(){announce('删除失败，请重试。')});
    return}
  if(el.closest('#takes-clear')){                             /* 我的探索：全部清空 */
    if(confirm('确定清空全部跟读录音吗？录音仅保存在本机浏览器，清空后不可恢复。'))clearTakes().then(refreshTakes).catch(function(){announce('清空失败，请重试。')});
    return}
  var pb=el.closest('[data-audio-act]');                      /* 叙事/示范音频播放器 */
  if(pb){var a=pb.closest('[data-audio-player]');a=a&&a.querySelector('audio.rec-src');if(!a)return;
    var act2=pb.dataset.audioAct;
    if(act2==='toggle'){if(a.paused)play(a);else a.pause()}
    else if(act2==='slow'){a.playbackRate=a.playbackRate===0.75?1:0.75;pb.textContent=a.playbackRate===0.75?'1× 正常语速':'0.75× 慢速';pb.setAttribute('aria-pressed',a.playbackRate===0.75?'true':'false');if(a.paused)play(a)}
    else if(act2==='replay'){a.playbackRate=1;var slow=a.closest('[data-audio-player]').querySelector('[data-audio-act="slow"]');if(slow){slow.textContent='0.75× 慢速';slow.setAttribute('aria-pressed','false')}try{a.currentTime=0}catch(err){}play(a)}
    return}
  var rb=el.closest('[data-rec-act]');                        /* 跟读练习 */
  if(!rb)return;
  var act3=rb.dataset.recAct;
  if(act3==='toggle'){if(recording())stopRec();else startRec()}
  else if(act3==='rerecord'){if(!recording())startRec()}
  else if(act3==='save'){saveTake()}
  else if(act3==='compare'){comparePractice()}
});
/* 媒体事件不冒泡，用捕获阶段委托：更新播放/暂停图标、进度条与列表按钮文案 */
['play','pause','ended'].forEach(function(ev){
  document.addEventListener(ev,function(e){
    var a=e.target;if(!a||!a.classList)return;
    if(a.classList.contains('rec-src')){var box=a.closest('[data-audio-player]');if(!box)return;
      var b=box.querySelector('.play');if(b){b.textContent=ev==='play'?'❚❚':'▶';b.setAttribute('aria-pressed',String(ev==='play'));b.setAttribute('aria-label',(ev==='play'?'暂停 ':'播放 ')+((box.querySelector('.player-row span')||{}).textContent||'音频'));}
      if(ev==='ended'){var bar=box.querySelector('.bar i');if(bar)bar.style.width='0%'}}
    else if(a.classList.contains('rec-take-audio')){var row=a.closest('.record');if(!row)return;
      var btn=row.querySelector('[data-take-act="play"]');if(btn)btn.textContent=ev==='play'?'❚❚ 暂停':'▶ 播放'}
  },true);
});
/* 音频加载失败：保留文字内容，播放器给等价提示 */
document.addEventListener('error',function(e){
  var a=e.target;if(!a||!a.classList||!a.classList.contains('rec-src'))return;
  var box=a.closest('[data-audio-player]');if(!box)return;
  var note=box.querySelector('p.muted');if(note)note.textContent='音频加载失败，可继续阅读文字内容。';
  var btn=box.querySelector('.play');if(btn){btn.disabled=true;btn.textContent='▶'}
},true);
document.addEventListener('timeupdate',function(e){
  var a=e.target;if(!a||!a.classList||!a.classList.contains('rec-src'))return;
  var box=a.closest('[data-audio-player]');var bar=box&&box.querySelector('.bar i');if(!bar)return;
  var d=a.duration;var pct=(d&&isFinite(d)&&d>0)?Math.min(100,a.currentTime/d*100):0;bar.style.width=pct+'%';
  var pbar=bar.parentElement;if(pbar&&pbar.hasAttribute('role'))pbar.setAttribute('aria-valuenow',String(Math.round(pct)));
},true);
