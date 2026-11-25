/* 入口：样式、首次使用提示条、hash 路由与种子数据加载（英歌原型 v0.1）。
   五个视图共用同一页面框架（设计方案 §4）：
   #map=P01 文化地图  #detail=P02 英歌详情  #story/:id=P03 故事体验
   #explore/:scene=P04 知识探索  #result=P05 故事成果
   首屏不等种子数据：#map 用预计算地图数据立即渲染，其余区块在数据到达后填充。 */
import './styles/styles.css';
import './styles/map.css';
import './styles/story.css';
import './styles/guochao.css';
import './styles/dynamic.css';
import './storage-notice.js';
import { chapter, state, save, esc, reloadState, setMotion, motionPref, setSound, soundOn, exportData } from './store.js';
import { getWork } from './works-db.js';
import { atlasMarkup, mountAtlas, disposeAtlas } from './atlas/render.js';
import { currentStage, gotoStage, interactionData, nextStage, registerStageCleanup, runStageCleanup, saveInteractionData } from './story/flow.js';
import { mountMask } from './story/mask.js';
import { mountRhythm } from './story/rhythm.js';
import { mountTeamwork } from './story/teamwork.js';
import { mountPeople } from './story/people.js';

import { revealView, countUp, revealStage, finishMotion, LOADER } from './motionx.js';
import { enhanceDynamic, updateScrollProgress } from './motionplus.js';

import { mapPage } from './pages/map.js';
import { detailPage, bindDetailPage } from './pages/detail.js';
import { storyPage, bindStoryPage } from './pages/story.js';
import { explorePage, bindExplorePage } from './pages/explore.js';
import { resultPage, bindResultPage } from './pages/result.js';
import { missingPage } from './pages/missing.js';

var app = document.getElementById('app');
function shell(x) { return '<div>' + x + '</div>' }

/* 业务路由名；静态骨架内的锚点（如 index.html 的“跳到主要内容”→ #main-content）不属于它们 */
var ROUTES = ['map', 'detail', 'story', 'explore', 'result'];
var lastRoute = '';
var renderedStage = '';
var syncingStorage = false;
window.addEventListener('yingge-save', function (event) {
  var status = document.getElementById('save-status');
  if (!status) return;
  var ok = event.detail.ok;
  status.textContent = ok ? '已保存到本机 · ' + new Date(event.detail.at).toLocaleTimeString('zh-CN', { hour12: false }) : '本机存储不足或不可用，请先下载作品与观察记录。当前操作仍可继续。';
  status.parentElement.classList.toggle('save-failed', !ok);
  document.getElementById('save-export').hidden = ok;
  document.getElementById('save-retry').hidden = ok;
});
document.getElementById('save-export').onclick = exportData;
document.getElementById('save-retry').onclick = save;
if (state.progress.updatedAt) window.dispatchEvent(new CustomEvent('yingge-save', { detail: { ok: true, at: state.progress.updatedAt } }));
new ResizeObserver(function (entries) {
  document.documentElement.style.setProperty('--header-h', entries[0].target.offsetHeight + 'px');
}).observe(document.querySelector('header'));

export function render() {
  runStageCleanup({ discardDraft: syncingStorage });
  var h = location.hash.slice(1) || 'map';
  var p = h.split('/');
  /* 命中 #main-content / #app 这类页面内锚点时回到上一个有效路由 */
  if (h && ROUTES.indexOf(p[0]) < 0 && document.getElementById(p[0])) { location.hash = lastRoute || '#map'; return }
  if (ROUTES.indexOf(p[0]) >= 0) lastRoute = '#' + h;
  disposeAtlas();
  if (!state.data) {
    if (p[0] === 'map') {
      app.innerHTML = shell(atlasMarkup() + '<p class="empty" style="margin-top:18px">' + LOADER + '正在展开广东文化地图…</p>');
      mountAtlas(function () { /* 种子未到时点击只提示，面板保持加载态 */ });
      syncNav(p[0]);
    } else {
      app.innerHTML = '<div class="empty">' + LOADER + '正在展开英歌内容…</div>';
      app.setAttribute('aria-busy', 'true');
    }
    return;
  }
  if (p[0] === 'story' && chapter(p[1]) && ['story', 'interact', 'feedback', 'explore'].includes(p[2])) {
    var targetStage = chapter(p[1]).interaction === 'people' && ['interact', 'feedback'].includes(p[2]) ? 'explore' : p[2];
    gotoStage(p[1], targetStage);
    history.replaceState(history.state, '', '#story/' + p[1]);
  }
  var html = p[0] === 'map' ? mapPage()
    : p[0] === 'detail' ? detailPage()
    : p[0] === 'story' ? storyPage(p[1])
    : p[0] === 'explore' ? explorePage(p[1], p[2])
    : p[0] === 'result' ? resultPage()
    : missingPage('页面');
  app.innerHTML = shell(html);
  app.setAttribute('aria-busy', 'false');
  bind();
  if (p[0] === 'map') {
    mountAtlas(function () {
      /* P01 地图全境即潮汕：英歌面板常驻，点击城市不再整页重渲（悬停提示已在地图内反馈） */
    });
  }
  syncNav(p[0]);
  enhanceDynamic(app);
  if (p[0] === 'story' && chapter(p[1])) {
    var stamp = p[1] + '/' + currentStage(p[1]);
    var current = state.progress.current;
    if (!syncingStorage && (!current || current.chapter !== p[1] || current.stage !== currentStage(p[1]))) gotoStage(p[1], currentStage(p[1]));
    if (stamp !== renderedStage) revealStage(app.querySelector('.story-main'));
    renderedStage = stamp;
  } else renderedStage = '';
  var feedbackImage = app.querySelector('[data-feedback-work]');
  if (feedbackImage) getWork(feedbackImage.dataset.feedbackWork).then(function (work) { if (work && feedbackImage.isConnected) feedbackImage.src = work.png });
}

function syncNav(p0) {
  document.querySelectorAll('header > nav a').forEach(function (a) {
    var current = a.hash === '#' + p0 || (p0 === 'detail' && a.hash === '#map') || (p0 === 'story' && a.hash === '#map') || (p0 === 'explore' && a.hash === '#map') || (p0 === 'result' && a.hash === '#map');
    if (current) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function bind() {
  bindDetailPage();
  /* P03 故事：阶段主按钮推进 + 互动关卡挂载 */
  var advance = document.getElementById('stage-advance');
  if (advance) {
    advance.onclick = function () {
      var h = location.hash.slice(1).split('/');
      var ch = chapter(h[1]);
      if (ch) { gotoStage(ch.chapter_id, nextStage(ch.chapter_id, currentStage(ch.chapter_id))); render() }
    };
  }
  bindStoryPage({
    mask: function (el, chId) { mountMask(el, chId, stageApi(chId)) },
    rhythm: function (el, chId) { mountRhythm(el, chId, stageApi(chId)) },
    teamwork: function (el, chId) { mountTeamwork(el, chId, stageApi(chId)) },
    people: function (el, chId) { mountPeople(el, chId, stageApi(chId)) }
  });
  /* P04 知识探索：对象点击展开侧栏、收藏、对照作品 */
  bindExplorePage();
  /* P05 成果：作品下载/预览、回顾题、发现文字 */
  bindResultPage();
}

/* 关卡 api：done(summary) 记录完成并推进到反馈阶段；registerCleanup 供计时器/监听释放 */
function stageApi(chId) {
  return {
    done: function (summary) {
      saveInteractionData(chId, { done: true, summary: summary });
      gotoStage(chId, 'feedback');
      render();
    },
    saveData: function (patch) { saveInteractionData(chId, patch) },
    getData: function () { return interactionData(chId) },
    registerCleanup: registerStageCleanup
  };
}

function applyMotion(on) { document.body.classList.toggle('reduced-motion', on); document.documentElement.classList.toggle('reduced-motion', on); if (on) finishMotion(); var btn = document.getElementById('motion'); if (btn) { btn.setAttribute('aria-pressed', String(on)); btn.textContent = on ? '恢复动效' : '减少动效' } }
function applySound(on) { var btn = document.getElementById('sound'); if (btn) { btn.setAttribute('aria-pressed', String(on)); btn.textContent = on ? '声音开' : '声音关' } }
applyMotion(motionPref());
applySound(soundOn());
document.getElementById('motion').onclick = function () { var on = !document.body.classList.contains('reduced-motion'); applyMotion(on); setMotion(on) };
document.getElementById('sound').onclick = function () { var on = !soundOn(); setSound(on); applySound(on) };

render();
/* 路由同步落位，入场统一交给 Motion，避免延迟回调覆盖较新的 hash。 */
function settlePage() {
  window.scrollTo(0, history.state && history.state.scrollY || 0);
  revealView(app);
  countUp(app);
  var heading = app.querySelector('h1');
  if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); document.title = heading.textContent + ' · 普宁案例拓展 · 岭南游纪' }
}
function routeRender() {
  render();
  settlePage();
}
window.addEventListener('hashchange', function () { routeRender() });
/* 阅读进度条：滚动驱动（样式见 guochao.css 的 #readbar） */
var readbar = document.createElement('div');
readbar.id = 'readbar';
document.body.append(readbar);
window.addEventListener('scroll', function () {
  var doc = document.documentElement;
  var max = doc.scrollHeight - doc.clientHeight;
  readbar.style.width = (max > 0 ? (doc.scrollTop / max) * 100 : 0) + '%';
  updateScrollProgress();
  history.replaceState(Object.assign({}, history.state, { scrollY: window.scrollY }), '');
}, { passive: true });
updateScrollProgress();
/* 加载失败不逼用户整页刷新：页内一键重试；渲染阶段的异常不会被误报为加载失败 */
function loadSeedFailed(detail) {
  app.setAttribute('aria-busy', 'false');
  app.innerHTML = '<div class="empty">种子数据加载失败，请在 原型-英歌/ 目录运行 npm run dev（或 npm run preview）后访问对应本地地址。'
    + (detail ? '<pre style="text-align:left;font-size:11px;white-space:pre-wrap;margin-top:10px">' + esc(String(detail).slice(0, 400)) + '</pre>' : '')
    + '<br><button class="btn" id="seed-retry" style="margin-top:12px">重试加载</button></div>';
  var retry = document.getElementById('seed-retry'); if (retry) retry.onclick = loadSeed;
}
function loadSeed() {
  fetch('assets/seed-data.json').then(function (r) { return r.json() }).then(function (d) {
    state.data = d;
    /* render() 的异常走自己的通道，不混进加载失败的提示 */
    setTimeout(function () {
      try { render(); revealView(app); countUp(app) } catch (e) { loadSeedFailed('页面渲染出错：' + (e && e.stack || e)) }
    }, 0);
  }).catch(function (e) { loadSeedFailed('数据请求失败：' + e) });
}
loadSeed();
/* 跨标签页一致性：其他标签页清除或改写本机数据（storage 事件不在改动页触发）时，
   重读状态并重渲——否则本页旧内存状态会在下次保存时“复活”已被清除的记录 */
window.addEventListener('storage', function (e) {
  if (e.key && !['yingge-progress', 'yingge-favorites', 'yingge-result', 'yingge-works', 'yingge-settings'].includes(e.key)) return;
  reloadState();
  applyMotion(motionPref());
  applySound(soundOn());
  syncingStorage = true;
  try { render() } finally { syncingStorage = false }
});
