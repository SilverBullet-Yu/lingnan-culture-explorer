/* P03 故事体验（设计方案 §6/§7/§16）：
   桌面左侧四章目录，中间为故事或互动，底部为人物对话和当前操作按钮；
   页面上方显示「英歌／上场之前／章节名称」。
   阶段机：剧情 story → 互动 interact → 反馈 feedback → 探索 explore
  （第四章由剧情直接进入人物探索）。跨章进入显示前情与本章目标；
   再次回到关卡时恢复已有操作（关卡自恢复草稿）。
   三个互动关卡的挂载与绑定在 src/story/ 下（mask/rhythm/teamwork/people）。 */
import { chapter, chapters, esc, sceneData, state } from '../store.js';
import { currentStage, interactionData, STAGES, stageLabel } from '../story/flow.js';
import { LOADER } from '../motionx.js';

export function storyPage(chapterId) {
  var list = chapters();
  if (!list.length) return '<div class="empty">' + LOADER + '内容加载中…</div>';
  var ch = chapter(chapterId) || (state.progress.current && state.progress.current.chapter ? chapter(state.progress.current.chapter) : null) || list[0];
  var stage = currentStage(ch.chapter_id);
  var html = '<p class="crumb">英歌 / 上场之前 / ' + esc(ch.title) + '</p>';
  html += '<div class="story-layout">' + toc(list, ch) + '<section class="story-main" id="story-main" data-reveal>';
  html += stageNav(ch, stage);
  if (stage === 'story') html += stageStory(ch);
  else if (stage === 'interact') html += stageInteract(ch);
  else if (stage === 'feedback') html += stageFeedback(ch);
  else html += stageExplore(ch, list);
  html += '</section></div>';
  return html;
}

function toc(list, ch) {
  var html = '<div class="chapter-navigation"><button class="chapter-toggle" type="button" aria-expanded="false" aria-controls="chapter-toc">章节目录 · ' + esc(ch.title) + '<span aria-hidden="true">＋</span></button><nav id="chapter-toc" class="story-toc" aria-label="章节目录">';
  list.forEach(function (item) {
    var rec = state.progress.chapters[item.chapter_id];
    html += '<a class="story-toc-row' + (item.chapter_id === ch.chapter_id ? ' on' : '') + '"' + (item.chapter_id === ch.chapter_id ? ' aria-current="step"' : '') + ' href="#story/' + esc(item.chapter_id) + '">'
      + '<i>' + item.order + '</i><span><b>' + esc(item.title) + '</b>'
      + '<small>' + esc(item.minutes) + ' 分钟' + (rec ? ' · ' + esc(stageLabel(rec.stage)) : '') + '</small></span></a>';
  });
  return html + '</nav></div>';
}

/* 阶段导航：已到达的阶段可以回看；当前阶段高亮 */
function stageNav(ch, stage) {
  var record = state.progress.chapters[ch.chapter_id];
  var reached = STAGES.indexOf(record && record.reached || stage);
  var html = '<div class="stage-nav" aria-label="本章阶段">';
  STAGES.forEach(function (s, i) {
    if (ch.interaction === 'people' && (s === 'interact' || s === 'feedback')) return; /* 第四章无这两个阶段 */
    var cls = s === stage ? ' on' : (i < reached ? ' reached' : '');
    html += '<button type="button" class="stage-pill' + cls + '" data-stage="' + s + '" data-chapter="' + ch.chapter_id + '"' + (s === stage ? ' aria-current="step"' : '') + (i > reached ? ' disabled' : '') + '>' + stageLabel(s) + '</button>';
  });
  return html + '</div>';
}

/* —— 幕次头部：巨型描边幕数字 + 眉标（国潮叙事装饰，纯增量；
   h1 文本不变，e2e 的标题断言不受影响） —— */
var ACT_NUMS = { 1: '壹', 2: '贰', 3: '叁', 4: '肆' };
function actHead(ch, titleHtml, subHtml) {
  var n = ACT_NUMS[ch.order] || esc(ch.order);
  return '<div class="act-head"><span class="act-no" aria-hidden="true">' + n + '</span>'
    + '<div class="act-head-main"><p class="act-eyebrow">第' + n + '幕 · 《上场之前》</p>'
    + '<h1>' + titleHtml + '</h1>'
    + (subHtml ? '<p class="muted">' + subHtml + '</p>' : '')
    + '</div></div>';
}

/* —— 剧情阶段：对话 + 本章任务卡 + 主按钮 —— */
function stageStory(ch) {
  var isPeople = ch.interaction === 'people';
  var html = actHead(ch, esc(ch.title), esc(ch.subtitle) + ' · ' + esc(ch.minutes) + ' 分钟');
  html += recap(ch);
  (ch.story || []).forEach(function (line) {
    html += '<div class="story-line"><b>' + esc(line.speaker) + '</b><p>' + esc(line.text) + '</p></div>';
  });
  html += '<div class="task-card"><b>本章任务</b><p>' + esc(ch.interaction_intro) + '</p></div>';
  html += '<div class="story-actions"><button class="btn" id="stage-advance" type="button">'
    + (isPeople ? '进入人物探索 →' : '开始关卡：' + esc(interactionName(ch.interaction)) + ' →') + '</button></div>';
  return html;
}

/* 跨章前情：本章无记录且前面任一章已进行时，显示最近一章的衔接台词与本章目标（§4 自由探索） */
function recap(ch) {
  if (state.progress.chapters[ch.chapter_id]) return '';
  var last = null;
  chapters().forEach(function (c) {
    if (c.order < ch.order && state.progress.chapters[c.chapter_id]) last = c;
  });
  if (!last && ch.order > 1) last = chapters()[ch.order - 2];
  if (!last || !last.next_line) return '';
  return '<div class="recap"><b>前情</b><p>' + esc(last.next_line.speaker + '：' + last.next_line.text) + '</p>'
    + '<p class="muted">本章目标：' + esc(ch.subtitle) + '。</p></div>';
}

/* —— 互动阶段：关卡挂载点（bind 时初始化） —— */
function stageInteract(ch) {
  return actHead(ch, esc(interactionName(ch.interaction)), esc(ch.interaction_intro))
    + '<div id="stage-mount" data-interaction="' + esc(ch.interaction) + '" data-chapter="' + esc(ch.chapter_id) + '">'
    + '<p class="empty">' + LOADER + '正在装载关卡…</p></div>';
}

/* —— 反馈阶段：操作结果 + 章间衔接台词 —— */
function stageFeedback(ch) {
  var data = interactionData(ch.chapter_id);
  var html = actHead(ch, '这一步做完了', null);
  html += data.summary ? '<div class="feedback-card">' + data.summary + '</div>' : '<div class="feedback-card"><p>你完成了本章的互动，记录已保存。</p></div>';
  if (ch.next_line) {
    html += '<div class="story-line"><b>' + esc(ch.next_line.speaker) + '</b><p>' + esc(ch.next_line.text) + '</p></div>';
  }
  var scene = sceneData(ch.after_scene);
  html += '<div class="story-actions"><button class="btn" id="stage-advance" type="button">去' + esc(scene ? scene.name : '探索') + '看看 →</button></div>';
  return html;
}

/* —— 探索阶段：进入对应知识场景；第四章收尾进观察册 —— */
function stageExplore(ch, list) {
  var isPeople = ch.interaction === 'people';
  var html = '';
  if (isPeople) {
    /* 第四章：人物探索本身就是本章互动（挂在探索阶段） */
    html += actHead(ch, '人物与传承', esc(ch.interaction_intro))
      + '<div id="stage-mount" data-interaction="people" data-chapter="' + esc(ch.chapter_id) + '"><p class="empty">' + LOADER + '正在装载…</p></div>';
    return html;
  }
  var scene = sceneData(ch.after_scene);
  var data = interactionData(ch.chapter_id);
  html += actHead(ch, '自由探索 · ' + esc(scene ? scene.name : ''), null);
  html += data.summary ? '<div class="feedback-card">' + data.summary + '</div>' : '';
  if (scene) {
    html += '<div class="task-card"><b>' + esc(scene.name) + '</b><p>' + esc(scene.intro) + '</p>'
      + '<p class="muted">场景知识点：' + scene.knowledge.join(' / ') + '</p></div>';
  }
  var next = list[ch.order] || null;
  html += '<div class="story-actions">';
  if (scene) html += '<a class="btn secondary" href="#explore/' + esc(scene.scene_id) + '">进入' + esc(scene.name) + ' →</a>';
  if (next) html += '<a class="btn" href="#story/' + esc(next.chapter_id) + '">继续故事：' + esc(next.title) + ' →</a>';
  else html += '<a class="btn" href="#result">整理我的观察册 →</a>';
  html += '</div>';
  return html;
}

function interactionName(type) {
  return { mask: '脸谱创作', rhythm: '节奏跟随', teamwork: '队伍协作', people: '人物探索' }[type] || '互动';
}

/* —— 绑定：关卡挂载 ——
   由 main.js 的 bind() 调用；阶段按钮的推进在 main.js 中绑定（含 render）。
   关卡模块在传入的容器内自行接管 DOM。 */
export function bindStoryPage(mounters) {
  var toggle = document.querySelector('.chapter-toggle');
  if (toggle) toggle.onclick = function () {
    var expanded = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.parentElement.classList.toggle('expanded', expanded);
  };
  document.querySelectorAll('[data-stage]').forEach(function (button) {
    button.onclick = function () { location.hash = '#story/' + button.dataset.chapter + '/' + button.dataset.stage };
  });
  var mount = document.getElementById('stage-mount');
  if (mount) {
    var type = mount.dataset.interaction;
    var chId = mount.dataset.chapter;
    var fn = mounters[type];
    if (fn) fn(mount, chId);
  }
}
