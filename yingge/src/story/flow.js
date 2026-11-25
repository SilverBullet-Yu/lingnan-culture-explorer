/* 故事阶段机（设计方案 §16 阶段转换）：
   每章阶段为 剧情 story → 互动 interact → 反馈 feedback → 探索 explore 四种；
   第四章由剧情直接进入人物探索（people 互动本身即探索场景）。
   点击当前主要按钮进入下一阶段，完成时保存（setChapterStage）。
   关卡运行期间的内部状态（草稿、动画计时器）通过 cleanup 注册表在离开页面时释放。 */
import { chapter, save, setChapterStage, state } from '../store.js';

export var STAGES = ['story', 'interact', 'feedback', 'explore'];

export function stageLabel(stage) {
  return { story: '剧情', interact: '关卡', feedback: '反馈', explore: '探索' }[stage] || '剧情';
}

/* 章节当前阶段：无记录视为剧情阶段（不入库，直到用户推进） */
export function currentStage(chapterId) {
  var rec = state.progress.chapters[chapterId];
  return rec && rec.stage ? rec.stage : 'story';
}

/* 下一阶段；第四章 explore 前无 feedback 阶段（人物探索即第四章互动） */
export function nextStage(chapterId, from) {
  var ch = chapter(chapterId);
  if (!ch) return 'story';
  var isPeople = ch.interaction === 'people';
  if (from === 'story') return isPeople ? 'explore' : 'interact';
  if (from === 'interact') return 'feedback';
  if (from === 'feedback') return 'explore';
  return 'explore';
}

export function gotoStage(chapterId, stage) {
  setChapterStage(chapterId, stage);
}

/* 关卡内部数据（草稿、练习结果、选择记录）挂在章节记录下 */
export function interactionData(chapterId) {
  var rec = state.progress.chapters[chapterId];
  return rec && rec.data ? rec.data : {};
}
export function saveInteractionData(chapterId, patch) {
  var rec = state.progress.chapters[chapterId] || {};
  rec.data = Object.assign({}, rec.data, patch);
  state.progress.chapters[chapterId] = rec;
  save();
}
export function clearInteractionData(chapterId) {
  var rec = state.progress.chapters[chapterId];
  if (rec) { delete rec.data; save(); }
}

/* —— 关卡清理注册表 ——
   节奏计时器、canvas 事件等在页面重渲（切章/切视图）时必须停止：
   main.js 在每次 render() 前调用 runStageCleanup()。 */
var cleanups = [];
export function registerStageCleanup(fn) { cleanups.push(fn) }
export function runStageCleanup(options) {
  var list = cleanups;
  cleanups = [];
  list.forEach(function (fn) { try { fn(options) } catch (e) { /* 清理失败不阻塞渲染 */ } });
}

/* 本章已互动过（用于「接着做/重新试一次」与完成判定） */
export function chapterInteracted(chapterId) {
  var rec = state.progress.chapters[chapterId];
  return !!(rec && (rec.interacted || (rec.data && rec.data.done)));
}
