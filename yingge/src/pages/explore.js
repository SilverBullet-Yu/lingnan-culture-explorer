/* P04 知识探索（设计方案 §9/§13）：四个场景各 3 个知识点，与故事共用同一组资料。
   - 脸谱展墙：三张参考脸谱，初始只显示简短名称；点击放大并展开知识点侧栏；
     「对照我的作品」左右并置参考与个人创作，可记录观察细节。
   - 声音与动作：重播排练片段（合成鼓点）+ 鼓 / 英歌槌 / 队员三个对象。
   - 队伍与排练：相邻队员 / 队伍变化 / 排练过程三个对象（变化前后并排示意）。
   - 人物与传承：三张记录卡（同第四章探索）。
   侧栏阅读顺序：名称与一句重点 → 说明与对应局部 → 查看资料 → 收藏 → 关闭。
   每次打开对象后已探索计数更新；收藏绑定 K 编号；支持 #explore/:scene/:kId 深链
  （成果页回跳时直接选中对应对象）。 */
import { chapters, culture, esc, fav, isExplored, exploredCount, knowledge, knowledgeList, markExplored, save, sceneData, scenes, sourceFor, state, toggleFav, safeUrl } from '../store.js';
import { faceSvg } from '../story/mask.js';
import { LOADER } from '../motionx.js';
import { getWork } from '../works-db.js';
import { popEl, slidePanel } from '../motionx.js';
import { mountSoundDemo } from '../story/rhythm.js';
import { registerStageCleanup } from '../story/flow.js';

export function explorePage(sceneId, kId) {
  var list = scenes();
  if (!list.length) return '<div class="empty">' + LOADER + '内容加载中…</div>';
  var current = sceneData(sceneId) || list[0];
  var openK = kId ? knowledge(kId) : null;
  if (openK && openK.scene !== current.scene_id) {
    var owner = sceneData(openK.scene);
    if (owner) current = owner; /* 深链的知识点属于另一个场景时跟随它 */
  }
  var c = culture();
  var html = '<p class="crumb"><a href="#map">文化地图</a> / <a href="#detail">' + esc(c ? c.name : '英歌') + '</a> / 知识探索</p>';
  html += '<p class="explore-count muted small-note">' + '已探索 <span data-countup="' + exploredCount() + '">' + exploredCount() + '</span> / ' + knowledgeList().length + ' 个知识点 · 收藏 <span data-countup="' + state.favorites.length + '">' + state.favorites.length + '</span> 条' + '</p>';
  html += '<div class="scene-tabs" data-reveal>';
  list.forEach(function (s) {
    html += '<a class="scene-tab' + (s.scene_id === current.scene_id ? ' on' : '') + '"' + (s.scene_id === current.scene_id ? ' aria-current="page"' : '') + ' href="#explore/' + esc(s.scene_id) + '" data-scene-tab="' + s.scene_id + '">'
      + '<span class="tab-num" aria-hidden="true">' + (SCENE_NUMS[s.scene_id] || '') + '</span>' + esc(s.name)
      + '<small>' + sceneProgress(s) + '</small></a>';
  });
  html += '</div>';
  html += '<div class="explore-layout" id="explore-body" data-scene="' + esc(current.scene_id) + '">'
    + sceneBody(current)
    + '<aside class="knowledge-panel" id="knowledge-panel" tabindex="-1" aria-label="知识点说明" data-open-k="' + (openK ? esc(openK.id) : '') + '">' + panelEmpty() + '</aside>'
    + '</div>';
  var ownerChapter = chapters().find(function (ch) { return ch.after_scene === current.scene_id });
  var next = ownerChapter && chapters()[ownerChapter.order];
  html += '<div class="explore-continue"><div><b>看过之后，回到故事里</b><p class="muted">探索记录会留在你的观察册中，不必一次看完。</p></div><a class="btn" href="' + (next ? '#story/' + next.chapter_id : '#result') + '">' + (next ? '继续故事：' + esc(next.title) : '整理我的观察册') + ' →</a></div>';
  return html;
}

function sceneProgress(s) {
  var total = s.knowledge.length;
  var seen = s.knowledge.filter(function (k) { return isExplored(k) }).length;
  return seen + '/' + total;
}

function sceneBody(scene) {
  if (scene.scene_id === 'wall') return wallBody(scene);
  if (scene.scene_id === 'sound') return soundBody(scene);
  if (scene.scene_id === 'team') return teamBody(scene);
  return peopleBody(scene);
}

/* 场景序号（国潮装饰，aria-hidden 不进可访问名） */
var SCENE_NUMS = { wall: '壹', sound: '贰', team: '叁', people: '肆' };
function sceneHead(scene) {
  return '<section class="card scene-card" data-reveal>'
    + '<span class="scene-no" aria-hidden="true">' + (SCENE_NUMS[scene.scene_id] || '') + '</span>'
    + '<p class="scene-kicker" aria-hidden="true">第' + (SCENE_NUMS[scene.scene_id] || '') + '景</p>'
    + '<h1>' + esc(scene.name) + '</h1><p class="muted">' + esc(scene.intro) + '</p>';
}

/* —— 脸谱展墙 —— */
function wallBody(scene) {
  var refs = (state.data && state.data.references) || [];
  var works = state.works;
  var html = sceneHead(scene);
  html += '<div class="wall-grid">';
  refs.forEach(function (r) {
    var linked = knowledgeList().filter(function (k) { return k.scene === 'wall' && k.object_ref === r.ref });
    html += '<button type="button" class="wall-face' + (linked.length ? '' : ' wall-face-extra') + '" data-ref="' + esc(r.ref) + '"'
      + (linked.length ? ' data-k="' + esc(linked[0].id) + '"' : '') + '>'
      + faceSvg(r.svg) + '<b>' + esc(r.name) + '</b>'
      + '<small>' + (linked.length ? '点击展开 · ' + linked.map(function (k) { return k.id }).join(' / ') : '对照用 · 不对应具体人物') + '</small>'
      + '</button>';
  });
  html += '</div>';
  /* 对照我的作品（§9）：参考与个人创作并置 + 观察细节输入 */
  if (works.length) {
    var latest = works[works.length - 1];
    html += '<div class="wall-compare"><h3>对照我的作品</h3>'
      + '<p class="muted small-note">最新作品《' + esc(latest.name) + '》（' + esc(latest.id) + '）。点击参考放大眉眼或线条区域，与自己的画法对照。</p>'
      + '<div class="compare-grid" id="compare-grid">'
      + '<figure class="compare-item"><figcaption>参考（点击局部放大）</figcaption><div class="compare-ref" id="compare-ref">' + faceSvg('red') + '</div></figure>'
      + '<figure class="compare-item"><figcaption>我的创作</figcaption><div class="compare-mine" id="compare-mine" data-work="' + esc(latest.id) + '"><img alt="我的作品预览" src=""></div></figure>'
      + '</div>'
      + '<label for="observe-detail">我观察到的一个细节</label>'
      + '<textarea id="observe-detail" class="note-area" maxlength="120" placeholder="例如：眉毛的线条怎样向两侧延伸……"></textarea>'
      + '<button type="button" class="btn secondary" id="observe-save">保存到作品记录</button>'
      + '</div>';
  } else {
    html += '<div class="wall-compare"><h3>先看一组示例对照</h3><p class="muted">左边是参考，右边是教学创作示例，不是你的作品。观察主色与线条的差别。</p><div class="compare-grid"><figure class="compare-item"><figcaption>参考</figcaption><div class="compare-ref" id="compare-ref">' + faceSvg('red') + '</div></figure><figure class="compare-item"><figcaption>教学创作示例 · 非传统脸谱复制</figcaption><svg viewBox="0 0 200 250" role="img" aria-label="圆点与颊纹个人创作示例"><ellipse cx="100" cy="124" rx="72" ry="105" fill="#fdf8ec" stroke="#a5771a" stroke-width="2"/><path d="M48 94 Q70 68 92 94 M108 94 Q130 68 152 94" fill="none" stroke="#cf3a1c" stroke-width="10"/><circle cx="64" cy="144" r="12" fill="#dfa63c"/><circle cx="136" cy="144" r="12" fill="#dfa63c"/><path d="M70 185 Q100 201 130 185" fill="none" stroke="#26190d" stroke-width="5"/></svg></figure></div><a class="btn secondary" href="#story/ch1/interact">创作我的脸谱 →</a></div>';
  }
  html += '<div class="detail-controls" aria-label="参考观察范围"><button type="button" class="mini-btn" data-compare-view="all" aria-pressed="true">整体</button><button type="button" class="mini-btn" data-compare-view="eyes" aria-pressed="false">放大眉眼</button><button type="button" class="mini-btn" data-compare-view="lines" aria-pressed="false">放大线条</button></div></section>';
  return html;
}

/* —— 声音与动作 —— */
function soundBody(scene) {
  var objects = [
    { ref: 'drum', k: 'K04', label: '鼓', desc: '英歌用锣鼓点与吆喝组织动作，先听本段合成鼓点。' },
    { ref: 'stick', k: 'K05', label: '英歌槌', desc: '一对圆形短木棒，双手随鼓点上下左右对击。' },
    { ref: 'motion', k: 'K06', label: '队员动作', desc: '骑马蹲裆、提腿横跃，动作跟着鼓点走。' }
  ];
  var html = sceneHead(scene);
  html += '<div id="sound-demo-mount"></div><p class="muted small-note">本项目合成鼓点与同步提示，仅作教学示意，不是真实演出录音。</p>';
  html += '<div class="object-grid">' + objects.map(function (o) {
    return '<button type="button" class="object-card' + (isExplored(o.k) ? ' seen' : '') + '" data-k="' + o.k + '">'
      + '<b>' + esc(o.label) + '</b><p>' + esc(o.desc) + '</p><small>' + esc(o.k) + ' · ' + esc(knowledge(o.k).title) + '</small></button>';
  }).join('') + '</div></section>';
  return html;
}

/* —— 队伍与排练 —— */
function teamBody(scene) {
  var objects = [
    { ref: 'neighbor', k: 'K07', label: '相邻队员', desc: '看相邻两人的间距与朝向。' },
    { ref: 'formation', k: 'K08', label: '队伍变化', desc: '双龙出海、猛虎下山、麦穗花、田螺圈——看这一组前后两帧。' },
    { ref: 'rehearsal', k: 'K09', label: '排练过程', desc: '一次没对齐，停下来，再来一次。' }
  ];
  var html = sceneHead(scene);
  html += '<div class="formation-pair" aria-hidden="true">'
    + '<figure><figcaption>变化前 · 示意</figcaption><svg viewBox="0 0 240 90">' + formationSvg('before') + '</svg></figure>'
    + '<figure><figcaption>变化后 · 示意</figcaption><svg viewBox="0 0 240 90">' + formationSvg('after') + '</svg></figure>'
    + '</div>';
  html += '<div class="object-grid">' + objects.map(function (o) {
    return '<button type="button" class="object-card' + (isExplored(o.k) ? ' seen' : '') + '" data-k="' + o.k + '">'
      + '<b>' + esc(o.label) + '</b><p>' + esc(o.desc) + '</p><small>' + esc(o.k) + ' · ' + esc(knowledge(o.k).title) + '</small></button>';
  }).join('') + '</div></section>';
  return html;
}

function formationSvg(kind) {
  var spots = kind === 'before' ? [30, 70, 110, 150, 190, 210] : [26, 64, 102, 148, 186, 214];
  var rows = kind === 'before' ? [30, 30, 30, 30, 30, 30] : [24, 24, 40, 40, 56, 56];
  return spots.map(function (x, i) {
    return '<circle cx="' + x + '" cy="' + rows[i] + '" r="9" fill="#cf3a1c" stroke="#9e2410" stroke-width="2"/>';
  }).join('') + '<line x1="10" y1="72" x2="230" y2="72" stroke="#857057" stroke-dasharray="5 5"/>';
}

/* —— 人物与传承（探索态：三卡 + K10-K12） —— */
function peopleBody(scene) {
  var cards = [
    { k: 'K10', label: '开始学习', text: '打开人物记录中的起点，看他或她怎样接触英歌。' },
    { k: 'K11', label: '队形调整', text: '看第三张记录卡里，1992 年带队参赛时队形的朝向发生了什么变化。' },
    { k: 'K12', label: '参与表演', text: '阅读这位学习者对一次参与的讲述，结合当时的照片与时间。' }
  ];
  var html = sceneHead(scene);
  html += '<p class="muted small-note">完整的人物记录（三问定位与原声）在第四章故事中。</p>';
  html += '<div class="object-grid">' + cards.map(function (o) {
    return '<button type="button" class="object-card' + (isExplored(o.k) ? ' seen' : '') + '" data-k="' + o.k + '">'
      + '<b>' + esc(o.label) + '</b><p>' + esc(o.text) + '</p><small>' + esc(o.k) + ' · ' + esc(knowledge(o.k).title) + '</small></button>';
  }).join('') + '</div></section>';
  return html;
}

/* —— 侧栏：知识点说明 —— */
function panelEmpty() {
  return '<p class="muted">点击场景中的对象，在这里展开知识点说明。</p>';
}
function referenceDetail(k) {
  if (k.scene !== 'wall') return '';
  var ref = state.data.references.find(function (r) { return r.ref === k.object_ref });
  if (!ref) return '';
  return '<figure class="knowledge-detail"><div class="detail-viewport">' + faceSvg(ref.svg) + '</div><figcaption>' + esc(ref.detail.label + ' · ' + ref.detail.note) + '</figcaption></figure><div class="detail-controls"><button class="mini-btn" type="button" data-detail="all" aria-pressed="true">整体</button><button class="mini-btn" type="button" data-detail="eyes" aria-pressed="false">眉眼</button><button class="mini-btn" type="button" data-detail="lines" aria-pressed="false">线条</button></div>';
}
function panel(k) {
  var src = k.source_ref ? sourceFor(k.source_ref) : null;
  /* 同一对象上的其他知识点（如 face-1 的 K01 与 K02），保证每条知识都可到达 */
  var siblings = knowledgeList().filter(function (x) { return x.scene === k.scene && x.object_ref === k.object_ref && x.id !== k.id });
  return '<b class="knowledge-id">' + esc(k.id) + '</b>'
    + '<h3>' + esc(k.title) + '</h3>'
    + '<p class="knowledge-point"><b>' + esc(k.point) + '</b></p>'
    + '<p class="knowledge-text">' + esc(k.text) + '</p>'
    + referenceDetail(k)
    + (siblings.length ? '<div class="knowledge-siblings"><b>同一对象的其他知识点</b>' + siblings.map(function (s) {
      return '<button type="button" class="btn secondary k-sibling" data-k="' + esc(s.id) + '">' + esc(s.id) + ' · ' + esc(s.title) + '</button>';
    }).join('') + '</div>' : '')
    + (src ? '<div class="knowledge-src"><b>查看资料</b><p>' + esc(src.title) + '<br><small class="muted">' + esc(src.publisher) + ' · 查阅日期 ' + esc(src.accessed)
      + (src.url ? ' · <a href="' + esc(safeUrl(src.url)) + '" target="_blank" rel="noopener noreferrer">官方资料 ↗</a>' : '') + '</small></p></div>' : '')
    + '<div class="knowledge-actions">'
    + '<button type="button" class="btn secondary" id="k-fav" data-k="' + esc(k.id) + '">' + (fav(k.id) ? '已收藏' : '收藏') + '</button>'
    + '<button type="button" class="btn secondary" id="k-close">关闭</button>'
    + '</div>';
}

/* —— 绑定：对象点击 → 展开侧栏并计已探索；收藏；对照作品 —— */
export function bindExplorePage() {
  var body = document.getElementById('explore-body');
  var panelBox = document.getElementById('knowledge-panel');
  if (!body || !panelBox) return;

  var origin = null;
  var originalScroll = window.scrollY;
  var regions = { all: '0 0 200 240', eyes: '35 55 130 80', lines: '35 105 130 100' };
  function setRegion(svg, name) { if (svg) svg.setAttribute('viewBox', regions[name] || regions.all) }
  function closePanel() {
    panelBox.classList.remove('open');
    panelBox.innerHTML = panelEmpty();
    history.replaceState(history.state, '', '#explore/' + body.dataset.scene);
    if (origin && origin.isConnected) origin.focus({ preventScroll: true });
    window.scrollTo(0, originalScroll);
  }
  function onEscape(event) { if (event.key === 'Escape' && panelBox.classList.contains('open')) closePanel() }
  document.addEventListener('keydown', onEscape);
  registerStageCleanup(function () { document.removeEventListener('keydown', onEscape) });

  function openKnowledge(kId, focus) {
    var k = knowledge(kId);
    if (!k) return;
    if (!panelBox.classList.contains('open')) originalScroll = window.scrollY;
    if (document.activeElement && !panelBox.contains(document.activeElement)) origin = document.activeElement;
    markExplored(kId, body.dataset.scene);
    history.replaceState(history.state, '', '#explore/' + body.dataset.scene + '/' + kId);
    panelBox.innerHTML = panel(k);
    panelBox.classList.add('open');
    slidePanel(panelBox);
    bindPanel();
    /* 更新场景进度小计与对象高亮 */
    var count = document.querySelector('.explore-count');
    if (count) count.innerHTML = '已探索 <span data-countup="' + exploredCount() + '">' + exploredCount() + '</span> / ' + knowledgeList().length + ' 个知识点 · 收藏 <span data-countup="' + state.favorites.length + '">' + state.favorites.length + '</span> 条';
    var card = Array.from(body.querySelectorAll('.wall-face, .object-card')).find(function (button) { return button.dataset.k === kId || button.dataset.ref === k.object_ref });
    body.querySelectorAll('.wall-face, .object-card').forEach(function (button) {
      var selected = button === card;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    if (card) { card.classList.add('seen'); if (!origin || !body.contains(origin)) origin = card }
    var selectedRef = state.data.references.find(function (r) { return r.ref === k.object_ref });
    var compare = document.getElementById('compare-ref');
    if (compare && selectedRef) compare.innerHTML = faceSvg(selectedRef.svg);
    var tab = document.querySelector('[data-scene-tab="' + body.dataset.scene + '"] small');
    if (tab) tab.textContent = sceneProgress(sceneData(body.dataset.scene));
    if (k.id === 'K02') {
      setRegion(panelBox.querySelector('.detail-viewport svg'), 'eyes');
      panelBox.querySelectorAll('[data-detail]').forEach(function (button) { button.setAttribute('aria-pressed', String(button.dataset.detail === 'eyes')) });
    }
    if (focus !== false) panelBox.focus({ preventScroll: true });
  }

  function bindPanel() {
    var favBtn = panelBox.querySelector('#k-fav');
    if (favBtn) favBtn.onclick = function () {
      toggleFav(favBtn.dataset.k);
      favBtn.textContent = fav(favBtn.dataset.k) ? '已收藏' : '收藏';
      popEl(favBtn);
      var count = document.querySelector('.explore-count');
      if (count) count.innerHTML = '已探索 <span data-countup="' + exploredCount() + '">' + exploredCount() + '</span> / ' + knowledgeList().length + ' 个知识点 · 收藏 <span data-countup="' + state.favorites.length + '">' + state.favorites.length + '</span> 条';
    };
    var close = panelBox.querySelector('#k-close');
    if (close) close.onclick = closePanel;
    panelBox.querySelectorAll('[data-detail]').forEach(function (button) {
      button.onclick = function () {
        setRegion(panelBox.querySelector('.detail-viewport svg'), button.dataset.detail);
        panelBox.querySelectorAll('[data-detail]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)) });
      };
    });
    /* 同一对象的其他知识点入口 */
    panelBox.querySelectorAll('.k-sibling').forEach(function (b) {
      b.onclick = function () { openKnowledge(b.dataset.k) };
    });
  }

  body.querySelectorAll('[data-k]').forEach(function (card) {
    card.onclick = function () { openKnowledge(card.dataset.k) };
  });
  /* 展墙：点击脸谱 → 展开/放大（含 face-3 的比较提示） */
  body.querySelectorAll('.wall-face').forEach(function (face) {
    face.onclick = function () {
      var kId = face.dataset.k;
      if (kId) { openKnowledge(kId); return }
      origin = face;
      originalScroll = window.scrollY;
      var compare = document.getElementById('compare-ref');
      var ref = state.data.references.find(function (r) { return r.ref === face.dataset.ref });
      if (compare && ref) compare.innerHTML = faceSvg(ref.svg);
      panelBox.innerHTML = '<b class="knowledge-id">教学示意</b><h3>' + esc(face.querySelector('b').textContent) + '</h3>'
        + '<p class="knowledge-point"><b>通过比较发现区别。</b></p>'
        + '<p class="knowledge-text">把这张参考与展墙中的其他脸谱放在一起，先找出一处看得见的差别，再打开对应的案例说明（点击另一张脸谱）。</p>'
        + '<div class="knowledge-actions"><button type="button" class="btn secondary" id="k-close">关闭</button></div>';
      panelBox.classList.add('open');
      bindPanel();
    };
  });
  /* 声音与动作：重播片段（合成鼓点） */
  var demoMount = document.getElementById('sound-demo-mount');
  if (demoMount) registerStageCleanup(mountSoundDemo(demoMount));
  document.querySelectorAll('[data-compare-view]').forEach(function (button) {
    button.onclick = function () {
      setRegion(document.querySelector('#compare-ref svg'), button.dataset.compareView);
      document.querySelectorAll('[data-compare-view]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)) });
    };
  });
  if (panelBox.dataset.openK) openKnowledge(panelBox.dataset.openK, false);
  /* 对照我的作品：PNG 预览 + 观察细节 */
  var mine = document.getElementById('compare-mine');
  if (mine) {
    var workId = mine.dataset.work;
    getWork(workId).then(function (work) {
      if (!mine.isConnected) return;
      if (work && work.png) mine.querySelector('img').src = work.png;
      if (work && work.observe) document.getElementById('observe-detail').value = work.observe;
    }).catch(function () { if (mine.isConnected) mine.textContent = '作品预览暂不可用，可重试或继续观察参考。' });
    var saveBtn = document.getElementById('observe-save');
    document.getElementById('observe-detail').oninput = function () { saveBtn.disabled = false; saveBtn.textContent = '保存到作品记录' };
    if (saveBtn) saveBtn.onclick = function () {
      var text = document.getElementById('observe-detail').value.replace(/^\s+|\s+$/g, '');
      if (!text) { alert('先写下一个你观察到的细节。'); return }
      dbmod.then(function (db) {
        return db.getWork(workId).then(function (work) {
          if (!work) throw new Error('作品记录不存在，请重新打开作品');
          work.observe = text;
          return db.putWork(work);
        });
      }).then(function () {
        /* 索引同步一句摘要 */
        var idx = state.works.filter(function (w) { return w.id === workId })[0];
        if (idx) idx.observe = text;
        var saved = save();
        saveBtn.textContent = saved ? '已保存到作品记录' : '已写入作品，索引未保存，请导出记录';
        saveBtn.disabled = true;
      }).catch(function (e) { alert('保存失败：' + e) });
    };
  }
}
