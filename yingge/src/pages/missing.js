/* 无效地址引导页：不保留错误 hash（用户可以直接从引导进入有效内容） */
import { esc } from '../store.js';

export function missingPage(kind) {
  return '<div class="empty"><h1>没有找到这个' + esc(kind || '页面') + '</h1>'
    + '<p>地址可能输入有误，或内容尚未开放。</p>'
    + '<p style="margin-top:14px"><a class="btn" href="#map">回到文化地图</a> <a class="btn secondary" href="#detail">查看英歌详情</a></p></div>';
}
