/* P02 英歌详情（设计方案 §5）：名称 → 普宁案例标识 → 代表图 → 身份信息 →
   学习问题 → 故事《上场之前》与四章目录 → 预计时长 → 底部资料来源。
   主按钮：开始故事 / 直接探索；有记录时变为「继续体验」并显示上次所在章节；
   点击章节名称可从该章进入；「重新体验」先展示现有记录与重新开始的选择。 */
import { culture, chapters, sources, esc, safeUrl, fmtDate, state, save } from '../store.js';
import { LOADER } from '../motionx.js';

export function detailPage() {
  var c = culture();
  if (!c) return '<div class="empty">' + LOADER + '内容加载中…</div>';
  var list = chapters();
  var visited = list.filter(function (ch) { return state.progress.chapters[ch.chapter_id] });
  var current = state.progress.current;
  var resumeChapter = null;
  if (current && current.chapter) resumeChapter = current.chapter;

  var html = '<p class="crumb"><a href="#map">文化地图</a> / ' + esc(c.name) + '</p>';

  /* —— 首屏：名称 + 案例标识 + 代表图 + 身份信息 —— */
  html += '<section class="detail-hero" data-reveal>'
    + '<figure class="detail-hero-figure"><img src="' + esc(safeUrl(c.hero_image)) + '" alt="' + esc(c.hero_alt) + '">'
    + '<figcaption>' + esc(c.hero_caption) + '</figcaption></figure>'
    + '<div class="detail-hero-body"><span class="tag">' + esc(c.nav_tag) + '</span>'
    + '<h1>' + esc(c.name) + '</h1>'
    + '<p class="case-line"><small class="case-badge">' + esc(c.case_name) + ' 案例</small></p>'
    + '<div class="facts">'
    + '<span class="fact"><b>名录身份</b>' + esc(c.tags.join(' · ')) + '</span>'
    + '<span class="fact"><b>项目编号</b>' + esc(c.catalog_no) + '</span>'
    + '<span class="fact"><b>地区</b>' + esc(c.region) + '</span>'
    + '</div>'
    + '<p class="muted">' + esc(c.identity_note) + '</p>'
    + '</div></section>';

  /* —— 学习问题 —— */
  html += '<div class="banner" data-reveal><div><h2 style="margin:0">学习问题</h2><p style="margin:6px 0 0">' + esc(c.learning_question) + '</p></div>'
    + '<a class="btn" href="' + (resumeChapter ? '#story/' + esc(resumeChapter) : '#story/' + esc(list.length ? list[0].chapter_id : 'ch1')) + '">' + (resumeChapter ? '继续体验' : '开始故事') + '</a></div>';
  if (resumeChapter) {
    var rc = list.filter(function (ch) { return ch.chapter_id === resumeChapter })[0];
    if (rc) html += '<p class="muted small-note">上次进行到：' + esc(rc.title) + '。也可点下方章节名从任意一章进入。</p>';
  }

  /* —— 故事与身份 —— */
  html += '<div class="columns" data-reveal><section><h2>故事 ·《' + esc(c.story_title) + '》</h2>'
    + '<p>' + esc(c.story_intro) + '</p>'
    + '<p class="muted">你的身份：' + esc(c.user_role) + '。预计时长：' + esc(c.estimated_minutes) + '。</p>';

  /* —— 四章目录 —— */
  html += '<h3 style="margin-top:22px">普宁案例章节目录</h3><p class="muted small-note">下列是拓展故事的章节，不计入主路线的学习场景。</p><div class="chapter-list">';
  list.forEach(function (ch) {
    var rec = state.progress.chapters[ch.chapter_id];
    html += '<a class="chapter-row" href="#story/' + esc(ch.chapter_id) + '">'
      + '<i>' + ch.order + '</i><span><b>' + esc(ch.title) + '</b>'
      + '<small>' + esc(ch.minutes) + ' 分钟 · ' + esc(ch.subtitle) + '</small></span>'
      + (rec ? '<em class="chapter-done">' + esc(stageLabel(rec.stage)) + '</em>' : '<em>未开始</em>')
      + '</a>';
  });
  html += '</div>';

  /* —— 重新体验（有记录时） —— */
  if (visited.length) {
    html += '<button class="btn secondary" id="restart-story" type="button" style="margin-top:16px">重新体验</button>'
      + '<p class="muted small-note">重新体验会先展示现有记录，再由你选择是否从头开始。</p>';
  }
  html += '</section>';

  /* —— 侧栏：直接探索 + 资料来源 —— */
  html += '<aside><div class="card"><h3>自由探索</h3>'
    + '<p>不想按顺序走？直接进四个场景：先看脸谱，再听鼓，最后看队伍怎样合。</p>'
    + '<a class="btn secondary" href="#explore">直接探索 →</a></div>'
    + '<div class="card" style="margin-top:14px"><h3>资料来源</h3><ul class="source-list">';
  sources().forEach(function (s) {
    html += '<li>' + esc(s.title) + '<br><small class="muted">' + esc(s.publisher) + ' · 查阅日期 ' + esc(s.accessed)
      + (s.url ? ' · <a href="' + esc(safeUrl(s.url)) + '" target="_blank" rel="noopener noreferrer">官方资料 ↗</a>' : '') + '</small>'
      + (s.note ? '<br><small class="muted">' + esc(s.note) + '</small>' : '') + '</li>';
  });
  html += '</ul><p class="muted small-note">' + esc(c.source_note) + '</p></div></aside></div>';
  return html;
}

function stageLabel(stage) {
  return { story: '进行到剧情', interact: '进行到关卡', feedback: '进行到反馈', explore: '进行到探索' }[stage] || '进行中';
}

/* 重新体验：先展示现有记录，确认后清空章节进度并回到第一章 */
export function bindDetailPage() {
  var btn = document.getElementById('restart-story');
  if (!btn) return;
  btn.onclick = function () {
    var list = chapters();
    var visited = list.filter(function (ch) { return state.progress.chapters[ch.chapter_id] });
    var summary = visited.map(function (ch) { return ch.title }).join('、') || '（无）';
    if (!confirm('现有章节记录：' + summary + '。\n重新体验会清空章节进度（作品与收藏保留），从头开始吗？')) return;
    state.progress.chapters = {};
    state.progress.current = null;
    state.progress.interactions = {};
    save();
    location.hash = '#story/' + (list.length ? list[0].chapter_id : 'ch1');
  };
}
