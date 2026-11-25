/* 第二章 节奏跟随关卡（设计方案 §10）：
   进入先「播放排练片段」（合成鼓点 + 同步示意画面，约 12 秒，标注教学示意），
   随后进入简化节拍练习（界面标注「节奏教学练习」）：8 个等间隔提示点，
   每点间隔 600 毫秒，先播 4 拍准备提示；桌面按空格、手机点按同一个大按钮。
   匹配规则：前后各半个拍间隔内匹配最近的未匹配目标点；相差 150 毫秒以内显示
   「跟上了」，其余显示「稍早/稍晚」；超出窗口的输入忽略；窗口结束仍未点按的
   目标显示「未点按」；每个目标只匹配一次；按住产生的重复输入忽略。
   结束后显示 8 个点的反馈，可原速再试 / 慢速练习（900 毫秒）/ 播放示范 /
   进入声音探索。慢速保留相同反馈规则。声音与提示点由同一时间线驱动。 */
import { soundOn } from '../store.js';
import { interactionData, saveInteractionData } from './flow.js';
import { popEl, motionReduced } from '../motionx.js';

var POINTS = 8;
var INTERVAL = 600;
var PREP = 4;
var WINDOW = 150;      /* 「跟上了」判定 */
var SLOW_INTERVAL = 900;

/* —— 合成鼓声（零素材依赖：低频鼓 + 槌击噪声） —— */
function playDrum(ctx, at, strong, output) {
  var osc = ctx.createOscillator();
  var gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(strong ? 150 : 190, at);
  osc.frequency.exponentialRampToValueAtTime(55, at + 0.18);
  gain.gain.setValueAtTime(strong ? 0.9 : 0.5, at);
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
  osc.connect(gain).connect(output);
  osc.start(at);
  osc.stop(at + 0.25);
  return strong ? [osc, playStick(ctx, at, 0.25, output)] : [osc];
}
function playStick(ctx, at, vol, output) {
  var len = ctx.sampleRate * 0.05;
  var buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  var ch = buffer.getChannelData(0);
  for (var i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  var src = ctx.createBufferSource();
  var gain = ctx.createGain();
  gain.gain.value = vol;
  src.buffer = buffer;
  src.connect(gain).connect(output);
  src.start(at);
  return src;
}

/* 每拍即时发声，不预排 WebAudio。总增益负责立即静音，音源负责彻底停止尾音。 */
function createAudio(note) {
  var ctx = null, output = null, voices = new Set();
  var armed = false, disposed = false, failed = false, resuming = false;
  function status() {
    note.textContent = !soundOn() ? '声音已关闭，仍可观察同步提示。'
      : failed ? '音频不可用，请观察同步提示。'
      : ctx && ctx.state !== 'running' ? '音频尚未就绪，请观察同步提示；可暂停后重新播放。' : '';
  }
  function silence() {
    if (output && ctx) output.gain.setValueAtTime(0, ctx.currentTime);
    voices.forEach(function (source) { try { source.stop() } catch (e) { /* 已结束 */ } });
    voices.clear();
  }
  function prepare() {
    if (disposed) return;
    armed = true;
    if (!soundOn()) { silence(); status(); return }
    try {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { failed = true; status(); return }
        ctx = new AC();
        output = ctx.createGain();
        output.connect(ctx.destination);
        failed = false;
      }
      output.gain.setValueAtTime(1, ctx.currentTime);
      if (ctx.state !== 'running' && !resuming) {
        var current = ctx;
        resuming = true;
        Promise.resolve(ctx.resume()).then(function () {
          if (ctx !== current || disposed) return;
          resuming = false;
          status();
        }, function () {
          if (ctx !== current || disposed) return;
          resuming = false;
          failed = true;
          silence();
          status();
        });
      }
    } catch (e) { failed = true; silence() }
    status();
  }
  function beat(strong, tick) {
    if (!armed || disposed || document.hidden) return;
    if (!soundOn()) { silence(); status(); return }
    if (!ctx || ctx.state !== 'running' || failed) { status(); return }
    try {
      var sources = tick ? [playStick(ctx, ctx.currentTime, 0.5, output)]
        : playDrum(ctx, ctx.currentTime, strong, output);
      sources.forEach(function (source) {
        voices.add(source);
        source.onended = function () { voices.delete(source); source.disconnect() };
      });
    } catch (e) { failed = true; silence(); status() }
  }
  function stop() {
    armed = false;
    silence();
    var previous = ctx;
    ctx = null;
    output = null;
    resuming = false;
    if (previous) { try { Promise.resolve(previous.close()).catch(function () {}) } catch (e) { /* 已关闭 */ } }
  }
  /* 冒泡到 document 时，header #sound 的 onclick 已更新 store；无需外部事件协议。 */
  function onSound(event) {
    if (!event.target.closest || !event.target.closest('header #sound')) return;
    if (!soundOn()) silence();
    else if (armed && !document.hidden) prepare();
    status();
  }
  document.addEventListener('click', onSound);
  status();
  return { prepare: prepare, beat: beat, stop: stop, dispose: function () {
    if (disposed) return;
    disposed = true;
    stop();
    document.removeEventListener('click', onSound);
  } };
}

function pulseDrum(drum, strong) {
  drum.querySelector('i').textContent = strong ? '重' : '嗒';
  popEl(drum);
}

/* 两个入口共用的真实 12 秒示范时间线；暂停保留位置，重播从零开始。 */
function createDemo(audio, onBeat, onEnd) {
  var timer = null, playing = false, elapsed = 0, origin = 0, next = 0;
  var duration = 20 * INTERVAL;
  function schedule() {
    if (!playing) return;
    var now = performance.now() - origin;
    if (now >= duration) {
      playing = false;
      elapsed = 0;
      next = 0;
      audio.stop();
      onEnd();
      return;
    }
    if (next < 20 && now >= next * INTERVAL) {
      /* 主线程滞后时跳过旧拍，不突发补播已过时的鼓声。 */
      next = Math.max(next, Math.floor(now / INTERVAL));
      var strong = next % 4 === 0;
      audio.beat(strong);
      onBeat(next, strong);
      next++;
    }
    timer = setTimeout(schedule, Math.max(0, Math.min(next * INTERVAL, duration) - (performance.now() - origin)));
  }
  function pause() {
    if (playing) elapsed = Math.min(duration, performance.now() - origin);
    playing = false;
    clearTimeout(timer);
    audio.stop();
  }
  return {
    play: function () {
      if (playing || document.hidden) return;
      playing = true;
      origin = performance.now() - elapsed;
      audio.prepare();
      schedule();
    },
    pause: pause,
    reset: function () { pause(); elapsed = 0; next = 0 },
    isPlaying: function () { return playing }
  };
}

/* 接口：mountSoundDemo(容器元素) 自建 DOM，返回幂等 cleanup；不自动播放。
   调用方在弹层关闭/场景卸载时调用 cleanup，不依赖故事 api。 */
export function mountSoundDemo(el) {
  el.innerHTML = '<div class="rhythm-card sound-demo">'
    + '<p class="tag">排练片段 · 教学示意（12 秒合成鼓点）</p>'
    + '<div class="rhythm-drum" data-demo-drum><i>鼓</i></div>'
    + '<p data-demo-caption role="status">每四拍一个重音；真实英歌鼓点随板式变化。</p>'
    + '<p class="muted small-note" data-demo-audio role="status"></p>'
    + '<button type="button" class="btn" data-demo-play>播放</button> '
    + '<button type="button" class="btn secondary" data-demo-replay>重播</button></div>';
  var drum = el.querySelector('[data-demo-drum]');
  var caption = el.querySelector('[data-demo-caption]');
  var play = el.querySelector('[data-demo-play]');
  var replay = el.querySelector('[data-demo-replay]');
  var audio = createAudio(el.querySelector('[data-demo-audio]'));
  var disposed = false;
  var demo = createDemo(audio, function (index, strong) {
    pulseDrum(drum, strong);
    caption.textContent = '第 ' + (index + 1) + '/20 拍 · ' + (strong ? '重音' : '轻拍');
  }, function () {
    caption.textContent = '12 秒示范播放完毕，可重播观察。';
    play.textContent = '播放';
  });
  play.onclick = function () {
    if (disposed || document.hidden) return;
    if (demo.isPlaying()) {
      demo.pause();
      play.textContent = '继续播放';
      caption.textContent = '已暂停，点击继续播放。';
    } else { demo.play(); play.textContent = '暂停' }
  };
  replay.onclick = function () {
    if (disposed || document.hidden) return;
    demo.reset(); demo.play(); play.textContent = '暂停';
  };
  function onHidden() {
    if (!document.hidden) return;
    demo.reset();
    play.textContent = '开始播放';
    caption.textContent = '页面已隐藏，示范已停止。请点击开始播放。';
  }
  document.addEventListener('visibilitychange', onHidden);
  return function () {
    if (disposed) return;
    disposed = true;
    demo.reset();
    audio.dispose();
    document.removeEventListener('visibilitychange', onHidden);
    play.onclick = replay.onclick = null;
    play.disabled = replay.disabled = true;
  };
}

export function mountRhythm(el, chapterId, api) {
  var interval = INTERVAL;
  var mode = 'intro'; /* intro → demo → ready → running → result */
  var disposed = false;
  var timers = [];
  var running = false;
  var lastInputAt = -1;
  var targets = [];
  var startTime = 0;
  var data = interactionData(chapterId);

  el.innerHTML = [
    '<div class="rhythm-card">',
    '<p class="tag">节奏教学练习</p>',
    '<h3>' + (data.done ? '上一轮练习结果已保存，可以再试' : '先听示范，再跟上 8 个提示点') + '</h3>',
    '<div class="rhythm-stage" id="rhythm-stage" aria-label="节奏示意">',
    '<div class="rhythm-drum" id="rhythm-drum"><i></i></div>',
    '<p class="rhythm-caption" id="rhythm-caption">排练片段 · 教学示意（12 秒合成鼓点）</p>',
    '</div>',
    '<div class="rhythm-points" id="rhythm-points">' + pointsHtml() + '</div>',
    '<div class="rhythm-actions" id="rhythm-actions"></div>',
    '<div class="rhythm-result" id="rhythm-result" hidden></div>',
    '<p class="muted small-note" id="rhythm-audio-note" role="status"></p>',
    '<p class="muted small-note">桌面按空格键，手机点按下方大按钮。声音由顶部「声音开/关」控制。</p>',
    '</div>'
  ].join('');

  var drum = el.querySelector('#rhythm-drum');
  var caption = el.querySelector('#rhythm-caption');
  var pointsBox = el.querySelector('#rhythm-points');
  var actionsBox = el.querySelector('#rhythm-actions');
  var resultBox = el.querySelector('#rhythm-result');

  function pointsHtml() {
    var html = '';
    for (var i = 0; i < POINTS; i++) html += '<span class="rhythm-point" data-point="' + i + '"><i></i></span>';
    return html;
  }
  function clearTimers() {
    timers.forEach(function (t) { clearTimeout(t) });
    timers = [];
  }
  var audio = createAudio(el.querySelector('#rhythm-audio-note'));
  var demo = createDemo(audio, function (index, strong) {
    caption.textContent = '示范第 ' + (index + 1) + '/20 拍：每四拍一个重音，真实英歌鼓点随板式变化。';
    drumPulse(strong);
  }, function () {
    drum.querySelector('i').textContent = '鼓';
    caption.textContent = '示范播完了。试着跟上同样的节拍。';
    mode = 'ready';
    renderActions();
  });
  function drumPulse(strong) { pulseDrum(drum, strong) }

  /* 保留触发按钮的 id，播放时禁用，并在函数入口阻止旧引用重复触发。 */
  function playDemo() {
    if (disposed || document.hidden || mode === 'demo' || running) return;
    clearTimers();
    mode = 'demo';
    actionsBox.querySelectorAll('button').forEach(function (button) { button.disabled = true });
    demo.reset();
    demo.play();
  }

  /* —— 练习：4 拍准备 + 8 提示点，同一时间线驱动 —— */
  function startPractice(slow) {
    if (disposed || document.hidden || running || mode === 'demo') return;
    clearTimers();
    demo.reset();
    interval = slow ? SLOW_INTERVAL : INTERVAL;
    lastInputAt = -1;
    targets = [];
    for (var i = 0; i < POINTS; i++) targets.push({ index: i, at: PREP * interval + i * interval, matched: false });
    var total = PREP * interval + (POINTS - 1) * interval + interval;
    audio.prepare();
    startTime = performance.now() + 300;
    running = true;
    mode = 'running';
    resultBox.hidden = true;
    renderPointsIdle();
    for (var q = 0; q < PREP; q++) {
      (function (idx) {
        timers.push(setTimeout(function () {
          if (!running || document.hidden) return;
          caption.textContent = '准备 ' + (PREP - idx) + '……';
          audio.beat(false, true);
          drumPulse(false);
        }, idx * interval + 300));
      })(q);
    }
    targets.forEach(function (tg) {
      timers.push(setTimeout(function () {
        if (!running || document.hidden) return;
        caption.textContent = '第 ' + (tg.index + 1) + ' 点';
        audio.beat(true);
        drumPulse(true);
        if (!tg.matched) pointNode(tg.index).classList.add('active');
      }, tg.at + 300));
      timers.push(setTimeout(function () {
        if (!running || tg.matched) return;
        tg.matched = true;
        tg.verdict = 'miss';
        tg.diff = null;
        showVerdict(tg);
      }, tg.at + 300 + interval / 2));
    });
    timers.push(setTimeout(function () { finishPractice(slow) }, total + 300 + 500));
    renderActions();
    el.querySelector('#rhythm-tap').focus();
  }

  function pointNode(i) { return pointsBox.querySelector('[data-point="' + i + '"]') }
  function renderPointsIdle() {
    pointsBox.querySelectorAll('.rhythm-point').forEach(function (n) { n.className = 'rhythm-point'; n.removeAttribute('data-verdict') });
  }

  /* 判定：前后各半个拍间隔内匹配最近的未匹配目标（§10） */
  function handleInput() {
    if (!running || disposed || document.hidden) return;
    var now = performance.now();
    if (now - lastInputAt < 120) return; /* 点按去抖；键盘长按另外由 event.repeat 拒绝 */
    lastInputAt = now;
    var t = now - startTime; /* 与 targets.at（含准备拍）、点位与鼓声共用同一起点 */
    var best = null, bestDiff = Infinity;
    targets.forEach(function (tg) {
      if (tg.matched) return;
      var diff = t - tg.at;
      if (Math.abs(diff) < interval / 2 && Math.abs(diff) < Math.abs(bestDiff)) { best = tg; bestDiff = diff }
    });
    var verdict;
    if (best && Math.abs(bestDiff) <= WINDOW) verdict = 'hit';
    else if (best) verdict = bestDiff < 0 ? 'early' : 'late';
    else return; /* 超出窗口的输入忽略 */
    best.matched = true;
    best.verdict = verdict;
    best.diff = Math.round(bestDiff);
    showVerdict(best);
  }

  function showVerdict(tg, animate) {
    var node = pointNode(tg.index);
    node.classList.remove('active');
    node.classList.add('done', tg.verdict);
    node.setAttribute('data-verdict', verdictText(tg.verdict));
    if (animate !== false) popEl(node);
  }
  function verdictText(v) { return { hit: '跟上了', early: '稍早', late: '稍晚', miss: '未点按' }[v] || v }

  function renderResults() {
    renderPointsIdle();
    var html = '<b>8 个点的反馈</b><div class="rhythm-feedback">';
    targets.forEach(function (tg) {
      var v = tg.verdict || 'miss';
      showVerdict(tg, false);
      html += '<span class="rhythm-fb ' + v + '"><i>' + (tg.index + 1) + '</i>' + verdictText(v)
        + (Number.isFinite(tg.diff) ? '（' + (tg.diff > 0 ? '+' : '') + tg.diff + 'ms）'
          : v === 'miss' ? '' : '（时间差未记录）') + '</span>';
    });
    html += '</div><p class="muted">反馈只说明这次点按与教学提示的关系。'
      + '本练习把鼓点简化成 8 个等间隔点；真实英歌用锣鼓点与螺号，节奏分慢板、中板、快板。'
      + '共同提示怎样帮助大家一起进入？鼓、英歌槌与队员的声音和动作，可以在下面的声音探索里观察。</p>';
    resultBox.innerHTML = html;
    resultBox.hidden = false;
  }

  function finishPractice(slow) {
    if (!running || disposed || document.hidden) return;
    running = false;
    clearTimers();
    audio.stop();
    targets.forEach(function (tg) {
      if (!tg.verdict) { tg.verdict = 'miss'; tg.diff = null }
    });
    caption.textContent = '练习结束。';
    renderResults();
    mode = 'result';
    var hits = targets.filter(function (t) { return t.verdict === 'hit' }).length;
    /* 结果先留在关卡内供查看与再试；用户点「完成本章」才推进到反馈阶段（§10） */
    saveInteractionData(chapterId, {
      rhythm: {
        slow: !!slow, hits: hits,
        verdicts: targets.map(function (t) { return t.verdict }),
        diffs: targets.map(function (t) { return Number.isFinite(t.diff) ? t.diff : null })
      },
      done: true
    });
    renderActions();
  }

  function replayInputs() {
    clearTimers();
    demo.reset();
    if (motionReduced()) { caption.textContent = '已按减少动效设置展示静态结果：正数表示稍晚，负数表示稍早，未点按没有输入时刻。'; return }
    mode = 'replay';
    renderPointsIdle();
    renderActions();
    audio.prepare();
    targets.forEach(function (target, index) {
      var at = 300 + index * interval;
      timers.push(setTimeout(function () {
        audio.beat(true);
        pointNode(index).classList.add('active');
        caption.textContent = '目标提示 · 第 ' + (index + 1) + ' 点';
      }, at));
      if (Number.isFinite(target.diff)) timers.push(setTimeout(function () {
        pointNode(index).classList.add('input-mark');
        caption.textContent = '我的点按 · 第 ' + (index + 1) + ' 点（' + (target.diff > 0 ? '+' : '') + target.diff + 'ms）';
      }, Math.max(0, at + target.diff)));
    });
    timers.push(setTimeout(function () {
      audio.stop();
      mode = 'result';
      caption.textContent = '回放完成：实心点是目标提示，外圈是你的点按。';
      renderActions();
    }, targets.length * interval + 600));
  }

  function renderActions() {
    var html = '';
    if (mode === 'intro') {
      html = '<button type="button" class="btn" id="rhythm-demo">播放排练片段</button>';
    } else if (mode === 'ready') {
      html = '<button type="button" class="btn" id="rhythm-start">开始练习（8 点）</button>'
        + '<button type="button" class="btn secondary" id="rhythm-demo2">再听一次示范</button>';
    } else if (mode === 'running') {
      html = '<button type="button" class="btn rhythm-tap" id="rhythm-tap">点 按</button>';
    } else if (mode === 'replay') {
      html = '<button type="button" class="btn secondary" id="rhythm-stop-replay">停止回放</button>';
    } else if (mode === 'result') {
      html = '<button type="button" class="btn" id="rhythm-again">原速再试</button>'
        + '<button type="button" class="btn secondary" id="rhythm-slow">慢速练习（900ms）</button>'
        + '<button type="button" class="btn secondary" id="rhythm-demo3">播放示范</button>'
        + '<button type="button" class="btn secondary" id="rhythm-replay-inputs">回放我的点按</button>'
        + '<a class="btn secondary" href="#explore/sound">进入声音探索 →</a>'
        + '<button type="button" class="btn" id="rhythm-done">完成本章 →</button>';
    }
    actionsBox.innerHTML = html;
    var bind = function (id, fn) { var n = el.querySelector('#' + id); if (n) n.onclick = fn };
    bind('rhythm-demo', playDemo);
    bind('rhythm-demo2', playDemo);
    bind('rhythm-demo3', playDemo);
    bind('rhythm-start', function () { startPractice(interval === SLOW_INTERVAL) });
    bind('rhythm-again', function () { startPractice(false) });
    bind('rhythm-slow', function () { startPractice(true) });
    bind('rhythm-tap', handleInput);
    bind('rhythm-replay-inputs', replayInputs);
    bind('rhythm-stop-replay', function () { clearTimers(); audio.stop(); mode = 'result'; renderResults(); renderActions() });
    bind('rhythm-done', function () {
      var r = interactionData(chapterId).rhythm;
      var hits = r ? r.hits : 0;
      var slow = r ? r.slow : false;
      api.done('<p><b>节奏练习完成</b>：8 个提示点中「跟上了」' + hits + ' 个' + (slow ? '（慢速 900ms 间隔）' : '') + '。'
        + (hits >= 6 ? '你已经能跟着共同提示进入。' : '试一试先听共同提示再进入，会更容易跟上。')
        + '跟得上提示，说明你抓住了这条练习时间线；真实鼓点会随板式变化。</p>');
    });
  }

  /* 空格键触发点按（页面保持焦点，§10） */
  function onKey(event) {
    if (event.code !== 'Space' || !running || disposed || document.hidden) return;
    var h = location.hash.slice(1).split('/');
    if (h[0] !== 'story') return;
    var tap = el.querySelector('#rhythm-tap');
    function isControl(node) {
      return node && node !== tap && (node.isContentEditable || (node.closest
        && node.closest('input, textarea, select, button, a, [role="textbox"], [role="button"], [contenteditable]:not([contenteditable="false"])')));
    }
    if (isControl(event.target) || isControl(document.activeElement)) return;
    event.preventDefault(); /* 包含 repeat：阻止原生按钮在长按后生成额外 click */
    if (event.repeat) return;
    handleInput();
  }
  document.addEventListener('keydown', onKey);

  /* 隐藏时废弃当前轮次，不保存半轮结果；返回后必须显式开始。 */
  function onHidden() {
    if (!document.hidden) return;
    var active = running || mode === 'demo' || mode === 'replay';
    running = false;
    clearTimers();
    demo.reset();
    audio.stop();
    if (active) {
      caption.textContent = '已暂停，点「开始练习」从准备拍重新开始。';
      drum.querySelector('i').textContent = '鼓';
      renderPointsIdle();
      mode = 'ready';
      renderActions();
    }
  }
  document.addEventListener('visibilitychange', onHidden);
  api.registerCleanup(function () {
    if (disposed) return;
    disposed = true;
    running = false;
    clearTimers();
    demo.reset();
    audio.dispose();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onHidden);
    actionsBox.querySelectorAll('button').forEach(function (button) { button.onclick = null; button.disabled = true });
  });

  if (data.done && data.rhythm) {
    var saved = data.rhythm;
    interval = saved.slow ? SLOW_INTERVAL : INTERVAL;
    if (Array.isArray(saved.verdicts) && saved.verdicts.length === POINTS) {
      targets = saved.verdicts.map(function (v, i) {
        var verdict = ['hit', 'early', 'late', 'miss'].indexOf(v) >= 0 ? v : 'miss';
        return { index: i, verdict: verdict, matched: true,
          diff: verdict !== 'miss' && Array.isArray(saved.diffs) && Number.isFinite(saved.diffs[i]) ? saved.diffs[i] : null };
      });
      caption.textContent = '上次练习：8 点中跟上了 ' + targets.filter(function (t) { return t.verdict === 'hit' }).length
        + ' 个' + (saved.slow ? '（慢速）' : '') + '。';
      renderResults();
      mode = 'result';
    } else {
      caption.textContent = '旧记录未保存完整的 8 点反馈，请重新练习。';
      mode = 'ready';
    }
  }
  renderActions();
}
