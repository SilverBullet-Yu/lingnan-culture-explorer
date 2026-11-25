/* 岭南漫游 · 首次使用提示条（需求 R-01）
   首次访问时在页面顶部说明：学习记录仅保存在本机浏览器（localStorage）中，
   包含进度、收藏、任务结果与笔记；清除浏览器数据或使用“我的探索”中的
   “清除全部本机数据”会删除这些记录且不可恢复。点击“知道了”后写入
   lingnan-notice-dismissed 标记，之后不再显示。
   无依赖；重复引入不会叠加；样式由本文件注入，不改动 styles.css。 */
(function () {
  'use strict';
  if (window.__LINGNAN_STORAGE_NOTICE__) return; // 幂等：重复引入直接返回
  window.__LINGNAN_STORAGE_NOTICE__ = true;

  var FLAG_KEY = 'lingnan-notice-dismissed';
  var BAR_ID = 'lingnan-storage-notice';

  function dismissed() {
    try { return localStorage.getItem(FLAG_KEY) === '1'; } catch (e) { return false; }
  }
  function markDismissed() {
    try { localStorage.setItem(FLAG_KEY, '1'); } catch (e) { /* 存储不可用时仅本次生效 */ }
  }

  var CSS = [
    '#' + BAR_ID + '{width:calc(100% - 10vw);max-width:1112px;margin:12px auto 0;padding:13px 18px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:#fffdf8;border:0;border-left:4px solid #a8dcc7;border-radius:16px;box-shadow:0 10px 28px #4c3f2b10;color:#29313d;font:13px/1.7 "Microsoft YaHei","PingFang SC",sans-serif}',
    '#' + BAR_ID + ' p{margin:0;flex:1;min-width:220px;font:inherit;color:#29313d}',
    '#' + BAR_ID + ' p strong{font-weight:bold}',
    '#' + BAR_ID + ' button{flex:none;border:0;border-radius:999px;padding:7px 16px;background:#29313d;color:#fff;font:inherit;font-weight:bold;font-size:12.5px;cursor:pointer}',
    '#' + BAR_ID + ' button:hover{opacity:.85}',
    '#' + BAR_ID + ' button:focus-visible{outline:2px solid #29313d;outline-offset:2px}',
    '@media(max-width:520px){#' + BAR_ID + '{width:calc(100% - 32px);padding:12px 14px}}'
  ].join('');

  function build() {
    if (document.getElementById(BAR_ID)) return; // 页面中已存在则不重复插入
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.setAttribute('role', 'status');
    var header = document.querySelector('header');
    document.body.insertBefore(bar, header || null);

    // 先插入空的 live region 再填入内容，确保读屏软件播报提示；
    // 用 setTimeout 而非 rAF：后台标签页中 rAF 会暂停，提示条会一直空白
    var fill = function () {
      bar.innerHTML = '<p><strong>学习记录仅保存在这台设备的浏览器中。</strong>'
        + '进度、收藏、任务结果与笔记存于 localStorage，跟读录音存于 IndexedDB；两者都不上传。'
        + '清除浏览器数据，或使用“我的探索”中的“清除全部本机数据”，会删除这些记录且不可恢复（界面设置保留）。</p>'
        + '<button type="button">知道了</button>';
      bar.querySelector('button').addEventListener('click', function () {
        markDismissed();
        if (bar.parentNode) bar.parentNode.removeChild(bar);
      });
    };
    setTimeout(fill, 0);
  }

  function init() {
    if (dismissed()) return;
    build();
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
