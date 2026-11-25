/* 素材角标映射表：图片文件名 → { 类别, 文案 }。
   唯一来源：素材采集岗后续直接改本文件，页面只查表、不散落来源判断逻辑。
   文案逐字取自《内部演示版标识与素材角标方案_20261119.md》§1.3 表；
   授权状态以 资料区/docs/素材与授权/素材来源.md 为准，本表只负责「界面如何标注」，不判授权。
   注意：类别名与页面文案均不得出现方案 §二 禁用词，本表已按此措辞。 */
import { esc } from './store.js';

/* 角标样式已由 src/styles/styles.css 的 .asset-badge 规则承接（底色 #FBEFD0 / 文字 #6B4E12 /
   1px #A8801A 边框 / 圆角 2px），本文件不再内联 style，避免内联优先级盖住样式表。 */

/* —— 需标注角标的素材（无公开许可的第三方来源照片）—— */
export const ASSET_BADGES = {
  /* 第三方来源照片 · 无公开许可 */
  'yueju-stage.jpg':            { category: '第三方来源照片（无公开许可）', text: '内部演示版 · 素材待授权' },
  'guangzhou-qilou.jpg':        { category: '第三方来源照片（无公开许可）', text: '内部演示版 · 素材待授权' },
  'chaozhou-paifang.jpg':       { category: '第三方来源照片（无公开许可）', text: '内部演示版 · 素材待授权' },
  'macao-museum.jpg':           { category: '第三方来源照片（无公开许可）', text: '内部演示版 · 素材待授权' },
  'foshan-market.jpg':          { category: '第三方来源照片（无公开许可）', text: '内部演示版 · 素材待授权' },
  'foshan-fish-market.jpg':     { category: '第三方来源照片（无公开许可）', text: '内部演示版 · 素材待授权' },
  'chaozhou-tea.jpg':           { category: '第三方来源照片（无公开许可）', text: '内部演示版 · 素材待授权' },
  /* 香港非遗办（ICHO）来源图 */
  'hakka-unicorn.jpeg':         { category: '香港非遗办（ICHO）来源图', text: '内部演示版 · 素材待授权' },
  'teochew-festival.jpeg':      { category: '香港非遗办（ICHO）来源图', text: '内部演示版 · 素材待授权' },
  'hongkong-fire-dragon.jpeg':  { category: '香港非遗办（ICHO）来源图', text: '内部演示版 · 素材待授权' },
  /* 中新社／中新网资料图 */
  'guangzhou-teahouse.jpg':     { category: '中新社／中新网资料图', text: '中新网／中新社资料图 · 内部演示版 · 素材待授权' },
  'guangzhou-dimsum.jpg':       { category: '中新社／中新网资料图', text: '中新网／中新社资料图 · 内部演示版 · 素材待授权' },
  'guangzhou-service.jpg':      { category: '中新社／中新网资料图', text: '中新网／中新社资料图 · 内部演示版 · 素材待授权' }
};

/* —— 自制素材：按 2026-11-19 Chief 裁决不加角标，仅登记用于核对与自证 —— */
export const SELF_MADE_ASSETS = {
  'yingge-hero.svg': '项目原创静物（本地渲染；SVG 内嵌无损 WebP）',
  'sticker-0.jpg': '项目原创地图贴纸（本地矢量绘制）',
  'sticker-1.jpg': '项目原创地图贴纸（本地矢量绘制）',
  'sticker-2.jpg': '项目原创地图贴纸（本地矢量绘制）',
  'sticker-3.jpg': '项目原创地图贴纸（本地矢量绘制）',
  'sticker-4.jpg': '项目原创地图贴纸（本地矢量绘制）',
  'sticker-5.jpg': '项目原创地图贴纸（本地矢量绘制）',
  'sticker-6.jpg': '项目原创地图贴纸（本地矢量绘制）',
  'sticker-7.jpg': '项目原创地图贴纸（本地矢量绘制）',
  'sticker-8.jpg': '项目原创地图贴纸（本地矢量绘制）'
};

/* 取文件名（去掉目录与查询串），映射表按文件名取值 */
export function assetFile(src){
  return String(src == null ? '' : src).split('?')[0].split('#')[0].split('/').pop();
}

/* 角标 HTML：无映射（自制素材）返回空串；返回值自带一个尾随空格便于紧跟图注。 */
export function assetBadge(src){
  var file = assetFile(src);
  var entry = ASSET_BADGES[file];
  if (!entry) return '';
  return '<span class="asset-badge" data-asset="' + esc(file) + '">' + esc(entry.text) + '</span> ';
}
