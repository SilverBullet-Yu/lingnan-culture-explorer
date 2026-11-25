/* 潮汕入口卡：在潮汕地区页 / 潮汕文化圈页引出「英歌 · 上场之前」内嵌体验（#yingge）。
   纯静态内容；封面复用英歌头图（鼓与成对短槌，服务于 /yingge/assets/）。 */
export function yinggeEntry() {
  return '<section class="yingge-entry"><a class="yingge-entry-card" href="#yingge" aria-label="进入英歌上场前的普宁案例拓展">'
    + '<img class="yingge-entry-cover" src="yingge/assets/yingge-hero.svg" alt="排练前的鼓与两支短木槌，项目原创静物示意" loading="lazy" width="600" height="260">'
    + '<div class="yingge-entry-body"><span class="tag">潮汕 · 国家级非遗 Ⅲ-8 · 普宁案例</span>'
    + '<h2>英歌上场前 · 普宁案例拓展</h2>'
    + '<p>以普宁英歌为例，通过脸谱创作、节奏练习和队伍协作观察，了解一场表演如何准备就绪。约 20 分钟，不计入「英歌上场前」路线的三个学习场景。</p>'
    + '<span class="yingge-entry-cta">进入英歌互动故事 →</span></div></a></section>';
}