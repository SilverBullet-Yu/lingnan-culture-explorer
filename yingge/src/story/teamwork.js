/* 第三章 队伍协作关卡（设计方案 §11）：
   画面显示六个队员圆点（教学示意）。任务为「要变「双龙出海」，六个人一排，哪种起步更容易齐」。
   用户在「不等鼓点，各自起步」和「等鼓点，一起起步」之间选择，再点击播放；两种结果都可观看，
   先前选择保留在画面上。「不等鼓点，各自起步」呈现错开的启动时刻；「等鼓点，一起起步」呈现
   共同提示后的同时启动。动画结束后标亮启动线和相邻队员，用户拖动回放进度比较同一时刻的位置。
   操作完成条件是播放过一种结果；原选择和观看记录保存到本机。 */
import { esc } from '../store.js';
import { interactionData, saveInteractionData } from './flow.js';
import { motionReduced } from '../motionx.js';

var DUR = 2400;          /* 时间轴总长（ms） */
var MOVE = 800;          /* 每人移动时长 */
var GAP = 260;           /* 各自立即模式：相邻启动间隔 */
var CUE_AT = 600;        /* 共同提示出现时刻 */
var CUE_GO = 900;        /* 共同启动时刻 */
var FRONT = 92;          /* 前进距离（SVG 单位） */

export function mountTeamwork(el, chapterId, api) {
  var data = interactionData(chapterId);
  var saved = data.teamwork || {};
  var mode = saved.choice || 'immediate';   /* 先前选择保留 */
  var played = Array.isArray(saved.played) ? saved.played.slice() : [];
  var raf = 0;
  var playing = false;
  var playStart = 0;
  var finished = false;

  el.innerHTML = [
    '<div class="team-card">',
    '<p class="tag">六人协作 · 教学示意（本项目设计内容）</p>',
    '<h3>要变「双龙出海」，六个人一排，哪种起步更容易齐？</h3>',
    '<div class="team-choice" role="group" aria-label="配合方式">',
    '<button type="button" class="team-opt" data-mode="immediate">不等鼓点，各自起步</button>',
    '<button type="button" class="team-opt" data-mode="cue">等鼓点，一起起步</button>',
    '</div>',
    '<div class="team-stage">',
    '<svg id="team-svg" viewBox="0 0 760 270" role="img" aria-label="六位队员位置教学示意">',
    '<line x1="40" y1="222" x2="720" y2="222" class="team-start-line"/>',
    '<line x1="40" y1="76" x2="720" y2="76" class="team-goal-line" stroke-dasharray="8 7"/>',
    '<text x="40" y="60" class="team-goal-text">前方位置</text>',
    '<text x="40" y="246" class="team-start-text">起点线</text>',
    '<circle id="team-cue" cx="380" cy="30" r="12" class="team-cue"/>',
    '<g id="team-players"></g>',
    '<g id="team-launches"></g>',
    '<g id="team-links"></g>',
    '</svg>',
    '</div>',
    '<div class="team-controls">',
    '<button type="button" class="btn" id="team-play">播放</button>',
    '<input type="range" id="team-scrub" min="0" max="' + DUR + '" value="0" step="10" aria-label="回放进度">',
    '<span class="muted small-note" id="team-clock">0.0s</span>',
    '</div>',
    '<div class="team-feedback" id="team-feedback"></div>',
    '<div class="story-actions" id="team-next"></div>',
    '</div>'
  ].join('');

  var svg = el.querySelector('#team-svg');
  var playersG = el.querySelector('#team-players');
  var launchesG = el.querySelector('#team-launches');
  var linksG = el.querySelector('#team-links');
  var cue = el.querySelector('#team-cue');
  var scrub = el.querySelector('#team-scrub');
  var clock = el.querySelector('#team-clock');
  var feedback = el.querySelector('#team-feedback');

  var nodes = [];
  for (var i = 0; i < 6; i++) {
    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'team-player');
    g.innerHTML = '<circle r="24" cx="0" cy="0"/><text y="6" text-anchor="middle">' + (i + 1) + '</text><text y="42" text-anchor="middle" class="team-start-at"></text>';
    playersG.append(g);
    nodes.push(g);
  }

  function startX(i) { return 96 + i * 113 }
  /* 每个队员的启动时刻（相对时间轴起点） */
  function startAt(i) { return mode === 'cue' ? CUE_GO : i * GAP + 120 }
  function progress(t, i) {
    var s = startAt(i);
    if (t < s) return 0;
    return Math.min(1, (t - s) / MOVE);
  }

  /* 纯函数帧渲染：进度条拖动与动画播放共用 */
  function renderFrame(t) {
    nodes.forEach(function (g, i) {
      var p = progress(t, i);
      var ease = p * p * (3 - 2 * p);
      var x = startX(i);
      var y = 196 - FRONT * ease;
      g.setAttribute('transform', 'translate(' + x + ' ' + y + ')');
      g.setAttribute('class', 'team-player' + (p > 0 ? ' moving' : '') + (p >= 1 ? ' arrived' : ''));
      g.querySelector('.team-start-at').textContent = t >= startAt(i) ? '已启动' : '';
    });
    var cueOn = mode === 'cue' && t >= CUE_AT && t < CUE_GO;
    cue.setAttribute('class', 'team-cue' + (cueOn ? ' on' : ''));
    /* 启动线：已启动队员的起点刻度 */
    var marks = '';
    nodes.forEach(function (g, i) {
      if (t >= startAt(i)) marks += '<line x1="' + (startX(i)) + '" y1="214" x2="' + startX(i) + '" y2="230" class="team-launch"/>';
    });
    launchesG.innerHTML = marks;
    /* 相邻队员连线：全部到位后标亮（观察相互关系） */
    var links = '';
    if (t >= DUR * 0.98) {
      for (var j = 0; j < 5; j++) {
        links += '<line x1="' + startX(j) + '" y1="104" x2="' + startX(j + 1) + '" y2="104" class="team-link"/>';
      }
    }
    linksG.innerHTML = links;
    clock.textContent = (t / 1000).toFixed(1) + 's';
  }

  function tick(now) {
    if (!playing) return;
    var t = motionReduced() ? DUR : now - playStart;
    if (t >= DUR) {
      t = DUR;
      playing = false;
      finished = true;
      finishPlay();
    }
    scrub.value = String(Math.round(t));
    renderFrame(t);
    if (playing) raf = requestAnimationFrame(tick);
  }

  function play() {
    cancelAnimationFrame(raf);
    playing = true;
    finished = false;
    playStart = performance.now();
    saveInteractionData(chapterId, { teamwork: { choice: mode, played: played } });
    feedback.innerHTML = '';
    el.querySelector('#team-next').innerHTML = '';
    if (motionReduced()) {
      playing = false;
      scrub.value = String(DUR);
      renderFrame(DUR);
      finishPlay();
    } else raf = requestAnimationFrame(tick);
  }

  function finishPlay() {
    if (played.indexOf(mode) < 0) played.push(mode);
    var isCue = mode === 'cue';
    feedback.innerHTML = '<b>' + (isCue ? '等鼓点，一起起步' : '不等鼓点，各自起步') + '</b>'
      + '<p>' + (isCue
        ? '六位队员在共同提示后同时启动。'
        : '六位队员的启动时刻一个个错开，队伍不容易一起开始。')
      + '刚才两段动画的区别在开始移动的时刻。关注共同提示和周围队员，有助于形成配合。</p>'
      + '<p>真实英歌里，队伍前面有头槌、二槌领舞，鼓点与螺号给出共同时间；这段六点动画只是把「同不同时」单独拿出来看，不是真实排练录像。</p>'
      + '<p class="muted">真实排练片段待接入；当前用这段六人动画展示配合细节。</p>'
      + '<p class="team-times">启动时刻：' + nodes.map(function (_, i) { return (i + 1) + '号 ' + (startAt(i) / 1000).toFixed(2) + 's' }).join(' · ') + '。可拖动回放进度比较位置。</p>';
    /* 操作完成条件是播放过一种结果；用户可随时切换另一种结果、重播或进入知识场景（§11） */
    if (played.length >= 1) {
      saveInteractionData(chapterId, { teamwork: { choice: mode, played: played, done: true } });
      el.querySelector('#team-next').innerHTML = '<button type="button" class="btn" id="team-go">进入排练场 →</button>';
      var go = el.querySelector('#team-go');
      if (go) go.onclick = function () {
        api.done('<p><b>协作比较完成</b>：你播放了「' + (isCue ? '等鼓点，一起起步' : '不等鼓点，各自起步') + '」'
          + (played.length > 1 ? '等 ' + played.length + ' 种结果' : '') + '。区别在开始移动的时刻——关注共同提示和周围队员，有助于形成配合。'
          + '配合不只靠同时起步，还靠队首引领和每个人能补位。</p>');
      };
    }
  }

  el.querySelectorAll('.team-opt').forEach(function (b) {
    b.onclick = function () {
      cancelAnimationFrame(raf);
      playing = false;
      feedback.innerHTML = '';
      el.querySelector('#team-next').innerHTML = '';
      mode = b.dataset.mode;
      el.querySelectorAll('.team-opt').forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)) });
      finished = false;
      renderFrame(0);
      scrub.value = '0';
      saveInteractionData(chapterId, { teamwork: { choice: mode, played: played } });
    };
  });
  el.querySelector('#team-play').onclick = play;
  scrub.oninput = function () {
    cancelAnimationFrame(raf);
    playing = false;
    renderFrame(Number(scrub.value));
  };

  function pauseHidden() {
    if (!document.hidden || !playing) return;
    cancelAnimationFrame(raf);
    playing = false;
    feedback.textContent = '页面已切出，播放暂停。可拖动回放进度，或点击播放重新比较。';
  }
  document.addEventListener('visibilitychange', pauseHidden);
  api.registerCleanup(function () { cancelAnimationFrame(raf); playing = false; document.removeEventListener('visibilitychange', pauseHidden) });

  /* 初始：高亮先前选择，停在起点 */
  el.querySelectorAll('.team-opt').forEach(function (x) { x.classList.toggle('on', x.dataset.mode === mode); x.setAttribute('aria-pressed', String(x.dataset.mode === mode)) });
  renderFrame(0);
  if (played.length) {
    feedback.innerHTML = '<p class="muted">上次你播放过 ' + played.length + ' 种结果' + (played.length > 1 ? '，拖动进度条可以比较同一时刻的位置' : '') + '。可以换另一种方式再播放。</p>';
  }
}
