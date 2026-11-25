/* 英歌原型 · 动态层脚本（motionplus.js，2026-11-08）
   职责只有三件事，全部是「增强」而非「依赖」：
     1. 光标追光：给卡片与地图舞台写 --mx/--my/--sx/--sy（rAF 合帧，不在移动中反复读布局）
     2. 落章序号：给成果页章节行写 --i，供 CSS 计算错峰延迟
     3. 书脊进度：把滚动百分比写到 :root 的 --sp
   任一能力不可用（减少动效 / 触屏 / 无 JavaScript）时对应增强自动跳过，
   页面回到 guochao.css 的静态形态，内容始终完整可读。 */

var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
var hoverMQ = window.matchMedia('(hover: hover) and (pointer: fine)');

function reduced() {
  return document.body.classList.contains('reduced-motion') || reduceMQ.matches;
}

/* —— 1a. 卡片追光 —— */
function bindGlow(el) {
  if (el.dataset.dynGlow === '1') return;
  el.dataset.dynGlow = '1';
  el.classList.add('dyn-glow');
  var rect = null, frame = 0, lastX = 0, lastY = 0;

  function measure() { rect = el.getBoundingClientRect() }
  function move(event) {
    if (!rect) measure();
    lastX = event.clientX; lastY = event.clientY;
    if (frame) return;
    frame = requestAnimationFrame(function () {
      frame = 0;
      if (!rect || !el.isConnected || reduced()) return;
      var w = rect.width || 1, h = rect.height || 1;
      var x = Math.min(1, Math.max(0, (lastX - rect.left) / w));
      var y = Math.min(1, Math.max(0, (lastY - rect.top) / h));
      el.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
      el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
    });
  }
  function leave() {
    cancelAnimationFrame(frame);
    frame = 0;
    rect = null;
    el.style.removeProperty('--mx');
    el.style.removeProperty('--my');
  }
  el.addEventListener('pointerenter', measure);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', leave);
}

/* —— 1b. 地图戏台追光 —— */
function bindSpotlight(el) {
  if (!el || el.dataset.dynSpot === '1') return;
  el.dataset.dynSpot = '1';
  var rect = null, frame = 0, lastX = 0, lastY = 0;

  function measure() { rect = el.getBoundingClientRect() }
  function move(event) {
    if (!rect) measure();
    lastX = event.clientX; lastY = event.clientY;
    if (frame) return;
    frame = requestAnimationFrame(function () {
      frame = 0;
      if (!rect || !el.isConnected || reduced()) return;
      var w = rect.width || 1, h = rect.height || 1;
      var x = Math.min(1, Math.max(0, (lastX - rect.left) / w));
      var y = Math.min(1, Math.max(0, (lastY - rect.top) / h));
      el.style.setProperty('--sx', (x * w).toFixed(0) + 'px');
      el.style.setProperty('--sy', (y * h).toFixed(0) + 'px');
    });
  }
  function enter() { measure(); el.classList.add('is-lit') }
  function leave() {
    cancelAnimationFrame(frame);
    frame = 0;
    rect = null;
    el.classList.remove('is-lit');
    el.style.removeProperty('--sx');
    el.style.removeProperty('--sy');
  }
  el.addEventListener('pointerenter', enter);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', leave);
}

/* —— 2 + 3. 入口 —— */
export function enhanceDynamic(root) {
  if (!root) return;
  Array.prototype.forEach.call(root.querySelectorAll('.result-chapter'), function (el, index) {
    el.style.setProperty('--i', String(index));
  });
  if (reduced() || !hoverMQ.matches) return;
  Array.prototype.forEach.call(
    root.querySelectorAll('.card:not(.result-work), .map-panel-card, .knowledge-panel, .wall-face'),
    bindGlow
  );
  bindSpotlight(document.getElementById('replica-map'));
}

export function updateScrollProgress() {
  var doc = document.documentElement;
  var max = doc.scrollHeight - doc.clientHeight;
  var pct = max > 0 ? Math.min(100, Math.max(0, (doc.scrollTop / max) * 100)) : 0;
  doc.style.setProperty('--sp', pct.toFixed(2) + '%');
}

window.addEventListener('resize', updateScrollProgress, { passive: true });
