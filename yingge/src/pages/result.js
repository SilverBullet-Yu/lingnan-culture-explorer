/* P05 故事成果（设计方案 §14）：观察册按顺序展示个人脸谱作品、四章操作记录、
   三道回顾题与「一句自己的发现」。
   作品提供编辑、下载图片（含作品名与「受英歌启发的个人创作」标注）、查看参考三个入口；
   示范进入的用户看到「创作我的脸谱」入口与已完成的观看记录。
   回顾题提交后立即显示解释与「回到相关章节」，可修改选择；第一次与最近一次答案都保留。
   点击任意知识条目回到对应场景与对象（#explore/:scene/:kId）。 */
import { chapter, chapters, esc, exploredCount, isExplored, knowledge, knowledgeList, reviewQuestions, save, sceneData, scenes, state } from '../store.js';
import { popEl } from '../motionx.js';
import { getWork } from '../works-db.js';

export function resultPage() {
  var c = state.data ? state.data.culture : null;
  var list = chapters();
  var visited = list.filter(function (ch) { return state.progress.chapters[ch.chapter_id] });
  var demo = state.progress.chapters.ch1 && state.progress.chapters.ch1.data && state.progress.chapters.ch1.data.demo;
  var html = '<p class="crumb"><a href="#map">文化地图</a> / <a href="#detail">' + esc(c ? c.name : '英歌') + '</a> / 故事成果</p>';
  html += '<div class="result-head"><span class="act-no" aria-hidden="true">册</span>'
    + '<div class="result-head-main"><p class="act-eyebrow">个人记录 · 《上场之前》</p>'
    + '<h1>我的上场观察册</h1></div></div>';
  html += '<p class="muted">' + esc(c ? c.ending : '') + '</p>';

  /* —— 个人作品 —— */
  html += '<section class="card result-works" data-reveal><h2>我的脸谱作品</h2>';
  if (!state.works.length) {
    html += '<p class="muted">还没有作品。' + (demo ? '你看过创作示范，随时可以补画一张。' : '回到第一章试一试。') + '</p>'
      + '<a class="btn" href="#story/ch1/interact">' + (demo ? '创作我的脸谱 →' : '去第一章创作 →') + '</a>';
  } else {
    html += '<div class="result-work-grid">' + state.works.map(function (w) {
      return '<figure class="result-work" id="rw-' + esc(w.id) + '">'
        + '<div class="result-work-img"><img alt="作品《' + esc(w.name) + '》预览" data-work="' + esc(w.id) + '" src=""></div>'
        + '<figcaption><b>《' + esc(w.name) + '》</b><small>' + esc(w.id) + ' · ' + esc(w.at.slice(0, 10))
        + (w.refs && w.refs.length ? ' · 参考 ' + esc(w.refs.join('、')) : '')
        + (w.observe ? '<br>我的观察：' + esc(w.observe) : '') + '</small>'
        + '<small class="result-work-credit">本作品为受英歌启发的个人创作，参考图见展墙</small></figcaption>'
        + '<div class="result-work-tools">'
        + '<button type="button" class="btn secondary" data-download="' + esc(w.id) + '">下载图片</button>'
        + '<button type="button" class="btn secondary" data-edit-work="' + esc(w.id) + '">编辑（另存新作品）</button>'
        + '<a class="btn secondary" href="#explore/wall/K02">查看参考</a>'
        + '<span class="small-note" role="status" data-edit-status></span>'
        + '</div></figure>';
    }).join('') + '</div>';
  }
  if (demo) html += '<p class="muted small-note">已观看创作示范；仍可继续创作自己的脸谱。</p>';
  html += '</section>';

  /* —— 四章记录与探索 —— */
  html += '<section class="card" data-reveal><h2>章节记录</h2><div class="result-chapters">';
  list.forEach(function (ch) {
    var rec = state.progress.chapters[ch.chapter_id];
    var scene = sceneData(ch.after_scene);
    var kSeen = scene ? scene.knowledge.filter(function (k) { return isExplored(k) }).length : 0;
    html += '<a class="result-chapter' + (rec ? ' done' : '') + '" href="#story/' + esc(ch.chapter_id) + '">'
      + '<i>' + ch.order + '</i><span><b>' + esc(ch.title) + '</b>'
      + '<small>' + (rec ? '已进行 · ' + ({ story: '剧情', interact: '关卡', feedback: '反馈', explore: '探索' }[rec.stage] || '') : '未开始')
      + (scene ? ' · 场景知识 ' + kSeen + '/' + scene.knowledge.length : '') + '</small></span></a>';
  });
  html += '</div>'
    + '<p class="muted small-note">已探索知识点 <span data-countup="' + exploredCount() + '">' + exploredCount() + '</span> / ' + knowledgeList().length + ' · 收藏 <span data-countup="' + state.favorites.length + '">' + state.favorites.length + '</span> 条</p>';
  if (state.favorites.length) {
    html += '<div class="result-favs">' + state.favorites.map(function (kId) {
      var k = knowledge(kId);
      if (!k) return '';
      var s = sceneData(k.scene);
      return '<a class="result-fav" href="#explore/' + esc(k.scene) + '/' + esc(k.id) + '">' + esc(k.id) + ' · ' + esc(k.title)
        + '<small>' + esc(s ? s.name : '') + ' →</small></a>';
    }).join('') + '</div>';
  }
  html += '</section>';

  /* —— 三道回顾题 —— */
  html += '<section class="card" data-reveal><h2>学习回顾</h2><p class="muted">每题提交后立即显示解释；你可以修改选择，第一次与最近一次答案都会保留。</p>';
  reviewQuestions().forEach(function (q, idx) {
    var rec = (state.result.review || {})[q.id];
    html += '<div class="review-q" data-q="' + esc(q.id) + '"><h3>' + (idx + 1) + '. ' + esc(q.question) + '</h3>';
    if (rec) html += '<p class="muted small-note review-hint">首次选择：' + esc(optionLabel(q, rec.first)) + ' · 最近选择：' + esc(optionLabel(q, rec.last)) + '</p>';
    html += '<div class="review-options">' + q.options.map(function (o) {
      return '<button type="button" class="option review-opt' + (rec && rec.last === o.key ? ' selected' : '') + '" data-q="' + esc(q.id) + '" data-key="' + esc(o.key) + '">' + esc(o.label) + '</button>';
    }).join('') + '</div>'
      + '<div class="review-feedback result' + (rec ? ' good' : '') + '"' + (rec ? '' : ' hidden') + '>'
      + (rec ? reviewFeedback(q, rec.last) : '') + '</div></div>';
  });
  html += '</section>';

  /* —— 一句自己的发现 —— */
  html += '<section class="card" data-reveal><h2>理解与表达</h2>'
    + '<label for="think-input">我原来以为……现在发现……（写一条你愿意讲给别人听的结论）</label>'
    + '<textarea id="think-input" class="note-area" maxlength="200" placeholder="我原来以为……现在发现……">' + esc(state.result.think || '') + '</textarea>'
    + '<button type="button" class="btn secondary" id="think-save">保存文字</button>'
    + '<span class="muted small-note" id="think-hint"></span>'
    + '</section>';
  return html;
}

function optionLabel(q, key) {
  var o = q.options.filter(function (x) { return x.key === key })[0];
  return o ? o.label : key;
}

/* 同一反馈函数用于提交与刷新后的回显，首次/最近答案只在实际选择时更新。 */
function reviewFeedback(q, key) {
  var opt = q.options.filter(function (o) { return o.key === key })[0];
  if (!opt) return '';
  var extra = '', records = state.progress.chapters;
  var rhythm = records.ch2 && records.ch2.data && records.ch2.data.rhythm;
  var teamwork = records.ch3 && records.ch3.data && records.ch3.data.teamwork;
  if (q.id === 'r2' && rhythm && Array.isArray(rhythm.verdicts)) {
    extra = '<p class="muted small-note">你的 8 点练习记录：' + rhythm.verdicts.map(function (v, i) {
      return '第' + (i + 1) + '点 ' + esc(({ hit: '跟上了', early: '稍早', late: '稍晚', miss: '未点按' }[v] || v));
    }).join('、') + '。</p>';
  }
  if (q.id === 'r3' && teamwork && Array.isArray(teamwork.played)) {
    extra = '<p class="muted small-note">你在协作关卡播放过 ' + teamwork.played.length + ' 种结果。</p>';
  }
  var back = { r1: '#explore/wall/K02', r2: '#story/ch2/interact', r3: '#story/ch3/interact' }[q.id] || '#story/ch1/interact';
  return '<b>解释</b><p>' + esc(opt.feedback) + '</p>' + extra
    + '<p><a href="' + (q.id === 'r1' ? '#story/ch1/interact' : back) + '">回到相关章节 →</a>'
    + (q.id === 'r1' ? ' · <a href="' + back + '">回到展墙观察参考 K02 →</a>' : '') + '</p>';
}

/* —— 绑定 —— */
export function bindResultPage() {
  /* 读取原作并深拷贝到草稿；从不修改原作，保存时由 mask 生成新编号。 */
  document.querySelectorAll('[data-edit-work]').forEach(function (btn) {
    btn.onclick = async function () {
      var hint = btn.parentElement.querySelector('[data-edit-status]');
      btn.disabled = true;
      try {
        var work = await getWork(btn.dataset.editWork);
        if (!btn.isConnected) return;
        if (!work || !Array.isArray(work.strokes) || !work.strokes.length) {
          hint.textContent = '未找到可编辑的笔画数据，原作品未改动。';
          return;
        }
        var rec = state.progress.chapters.ch1 || {};
        var existing = rec.data && rec.data.draft;
        if (existing && !confirm('已有第一章草稿。编辑将覆盖草稿（含名称、笔画与参考），未保存内容会丢失。确认替换？原作品仍保留，编辑后另存新作品。')) return;
        var previous = state.progress.chapters.ch1;
        var current = state.progress.current;
        state.progress.chapters.ch1 = Object.assign({}, rec, { reached: rec.reached || rec.stage || 'interact', stage: 'interact', data: Object.assign({}, rec.data, {
          draft: { strokes: JSON.parse(JSON.stringify(work.strokes)), name: work.name || '',
            seenRefs: Array.isArray(work.refs) ? work.refs.slice() : [], editOf: work.id }
        }) });
        state.progress.current = { chapter: 'ch1', stage: 'interact' };
        if (save() === false) {
          if (previous) state.progress.chapters.ch1 = previous; else delete state.progress.chapters.ch1;
          state.progress.current = current;
          hint.textContent = '编辑草稿未能保存，请先导出记录并释放存储空间。原草稿与原作品仍保留。';
          return;
        }
        location.hash = '#story/ch1/interact';
      } catch (error) {
        if (hint.isConnected) hint.textContent = '无法读取本机作品，原草稿与原作品未改动。请稍后重试。';
      } finally { btn.disabled = false }
    };
  });
  /* 作品预览从 IndexedDB 填充 + 下载（含水印） */
  document.querySelectorAll('[data-download]').forEach(function (btn) {
    btn.onclick = function () {
      var id = btn.dataset.download;
      getWork(id).then(function (work) {
        if (work && work.png) downloadWork(work);
        else btn.parentElement.querySelector('[data-edit-status]').textContent = '未找到作品图片。';
      }).catch(function () { btn.parentElement.querySelector('[data-edit-status]').textContent = '无法读取本机作品图片，请稍后重试。' });
    };
  });
  document.querySelectorAll('.result-work-img img').forEach(function (img) {
    var id = img.dataset.work;
    getWork(id).then(function (work) {
      if (work && work.png) img.src = work.png;
    }).catch(function () { img.alt += '（本机图片暂不可用）' });
  });

  /* 回顾题：选择 → 立即反馈 → 保留首次与最近答案 */
  document.querySelectorAll('.review-opt').forEach(function (btn) {
    btn.onclick = function () {
      var qId = btn.dataset.q, key = btn.dataset.key;
      var q = reviewQuestions().filter(function (x) { return x.id === qId })[0];
      if (!q) return;
      var review = state.result.review || (state.result.review = {});
      var rec = review[qId] || { first: key, at: new Date().toISOString() };
      rec.last = key;
      rec.at = new Date().toISOString();
      review[qId] = rec;
      save();
      /* 视觉：本题选项高亮重置 */
      var box = btn.closest('.review-q');
      box.querySelectorAll('.review-opt').forEach(function (x) { x.classList.toggle('selected', x === btn) });
      /* 反馈内容：解释 + 关联数据（节奏判定/协作记录） */
      var fb = box.querySelector('.review-feedback');
      fb.innerHTML = reviewFeedback(q, key);
      fb.hidden = false;
      fb.className = 'review-feedback result good';
      /* 更新首次/最近提示行（首次作答时该行还不存在，动态创建） */
      var hint = box.querySelector('.review-hint');
      if (!hint) {
        hint = document.createElement('p');
        hint.className = 'muted small-note review-hint';
        box.insertBefore(hint, box.querySelector('.review-options'));
      }
      hint.textContent = '首次选择：' + optionLabel(q, rec.first) + ' · 最近选择：' + optionLabel(q, rec.last);
    };
  });

  /* 一句自己的发现 */
  var thinkSave = document.getElementById('think-save');
  if (thinkSave) thinkSave.onclick = function () {
    var text = document.getElementById('think-input').value.replace(/^\s+|\s+$/g, '');
    state.result.think = text;
    var saved = save();
    var hint = document.getElementById('think-hint');
    popEl(thinkSave);
    if (hint) hint.textContent = saved ? (text ? '已保存到本机。' : '已清空。') : '尚未保存到本机，请先导出观察记录。';
  };
}

/* 下载图片：作品 PNG 底部拼接作品名与标注（§14/§15） */
function downloadWork(work) {
  var img = new Image();
  img.onload = function () {
    var cv = document.createElement('canvas');
    cv.width = img.width;
    cv.height = img.height + 96;
    var cx = cv.getContext('2d');
    cx.fillStyle = '#fdf8ec';
    cx.fillRect(0, img.height, cv.width, 96);
    cx.drawImage(img, 0, 0);
    cx.fillStyle = '#26190d';
    cx.font = 'bold 38px "Microsoft YaHei", sans-serif';
    cx.fillText('《' + work.name + '》', 32, img.height + 42);
    cx.fillStyle = '#a5771a';
    cx.font = '24px "Microsoft YaHei", sans-serif';
    cx.fillText('受英歌启发的个人创作 · 英歌 · 上场之前', 32, img.height + 78);
    cv.toBlob(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = work.name + '.png';
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href) }, 2000);
    });
  };
  img.src = work.png;
}
