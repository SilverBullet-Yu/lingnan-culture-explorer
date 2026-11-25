/* P01 文化地图（设计方案 §5，2026-11-07 收窄为潮汕单域）：潮汕四市地图 + 英歌案例面板。
   地图只呈现汕头/汕尾/潮州/揭阳（普宁为揭阳代管，地图上以案例点标注）；
   点击任一城市显示「民俗与节庆」标签与英歌卡片，点击英歌卡片进入 P02（#detail）。
   本模块保持纯函数：地图与面板按钮的点击绑定在 main.js 的 bind() 中完成。 */
import { atlasMarkup } from '../atlas/render.js';
import { culture, esc, safeUrl, sourceFor, state, chapter } from '../store.js';

export function mapPage() {
  return atlasMarkup(chaoshanPanel());
}

/* 潮汕面板：「民俗与节庆」+ 英歌卡片（地图全境即潮汕，面板常驻） */
function chaoshanPanel() {
  var c = culture();
  if (!c) return '<div class="map-panel-card"><p class="muted">正在加载内容…</p></div>';
  var src = sourceFor(c.source_ref);
  var html = '<div class="map-panel-card map-panel-chaoshan" data-reveal>'
    + '<span class="tag">' + esc(c.nav_tag) + '</span>'
    + '<figure class="map-panel-figure"><img src="' + esc(safeUrl(c.hero_image)) + '" alt="' + esc(c.hero_alt) + '"></figure>'
    + '<h2>' + esc(c.name) + '<small class="case-badge">' + esc(c.case_name) + ' 案例</small></h2>'
    + '<p>' + esc(c.map_blurb) + '</p>'
    + '<a class="btn" href="#detail">进入' + esc(c.name) + ' →</a>';
  var current = state.progress.current;
  var last = current && chapter(current.chapter);
  if (last) html += '<a class="btn secondary" href="#story/' + esc(last.chapter_id) + '">继续体验 · ' + esc(last.title) + ' →</a>';
  if (src) html += '<p class="muted small-note">身份资料：' + esc(src.title) + '（' + esc(src.publisher) + '）</p>';
  html += '</div>';
  return html;
}
