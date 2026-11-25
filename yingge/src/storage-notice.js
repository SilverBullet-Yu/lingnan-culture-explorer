/* 英歌原型 · 首次使用提示条
   首次访问时在页面顶部说明：记录保存在当前设备的当前浏览器（设计方案 §15 存储提示），
   包含进度、收藏、成果与作品；清除浏览器数据会删除这些记录且不可恢复。点击「知道了」后写入
   yingge-notice-dismissed 标记，之后不再显示。
   无依赖；重复引入不会叠加；样式由本文件注入，不改动 styles.css。 */
(function () {
  'use strict';
  if (window.__YINGGE_STORAGE_NOTICE__) return; // 幂等：重复引入直接返回
  window.__YINGGE_STORAGE_NOTICE__ = true;

  var FLAG_KEY = 'yingge-notice-dismissed';
  var BAR_ID = 'yingge-storage-notice';

  function dismissed() {
    try { return localStorage.getItem(FLAG_KEY) === '1'; } catch (e) { return false; }
  }
  function markDismissed() {
    try { localStorage.setItem(FLAG_KEY, '1'); } catch (e) { /* 存储不可用时仅本次生效 */ }
  }

  var CSS = [
    '#' + BAR_ID + '{width:calc(100% - 10vw);max-width:1112px;margin:12px auto 0;padding:13px 18px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:#fdf8ec;border:2px solid #26190d;border-left:6px solid #cf3a1c;border-radius:6px;box-shadow:5px 5px 0 rgba(38,25,13,.12);color:#26190d;font:13px/1.7 "Microsoft YaHei","PingFang SC",sans-serif}',
    '#' + BAR_ID + ' p{margin:0;flex:1;min-width:220px;font:inherit;color:#26190d}',
    '#' + BAR_ID + ' p strong{font-weight:bold}',
    '#' + BAR_ID + ' button{flex:none;border:2px solid #26190d;border-radius:4px;padding:7px 16px;background:#cf3a1c;color:#fdf3e1;box-shadow:3px 3px 0 #26190d;font:inherit;font-weight:bold;font-size:12.5px;cursor:pointer}',
    '#' + BAR_ID + ' button:hover{filter:brightness(1.06)}',
    '#' + BAR_ID + ' button:active{transform:translate(2px,2px);box-shadow:0 0 0 #26190d}',
    '#' + BAR_ID + ' button:focus-visible{outline:2px solid #9e2410;outline-offset:2px}',
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
      bar.innerHTML = '<p><strong>记录保存在当前设备的当前浏览器中。</strong>'
        + '章节进度、收藏、回顾答案与作品只存于本机，不上传。'
        + '清除浏览器数据会删除这些记录且不可恢复（界面设置保留）。</p>'
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
