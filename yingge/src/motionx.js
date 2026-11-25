/* 动画编排帮助层（motion 库的统一入口）：
   - revealView：视图内 [data-reveal] 元素按层级 stagger 入场（仅 hash 路由切换时调用，
     同页重渲不打扰）
   - popEl / swayEl：收藏、节奏命中等微交互反馈
   - 全部动画只走 transform/opacity（合成层），并尊重「减少动效」开关与系统偏好；
     元素带 [data-reveal] 但动效被关闭时保持可见（初始态由 JS 设置而非 CSS，避免无 JS 或
     动效关闭时内容不可见）。 */
import { animate, stagger } from 'motion';

export function motionReduced() {
  return document.body.classList.contains('reduced-motion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

var EASE_OUT = [0.22, 0.61, 0.36, 1];

export function finishMotion() {
  document.getAnimations().forEach(function (animation) {
    if (animation.effect && animation.effect.getTiming().iterations !== Infinity) {
      try { animation.finish() } catch (_) { animation.cancel() }
    }
  });
}
window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', function (event) { if (event.matches) finishMotion() });

export function revealStage(root) {
  if (!root || motionReduced()) return;
  var items = root.querySelectorAll('.stage-nav, .act-head, .story-line, .task-card, .feedback-card, #stage-mount, .story-actions');
  animate(Array.from(items), { opacity: [0, 1], transform: ['translateY(10px)', 'translateY(0)'] }, { duration: .28, delay: stagger(.035), ease: EASE_OUT });
}

/* 纸墨风墨点加载器（Circle Loaders 思路，样式在 guochao.css） */
export var LOADER = '<span class="ink-loader" aria-hidden="true"><i></i><i></i><i></i></span> ';

/* 视图入场：带 data-reveal 的元素依次浮现；reduced 时直接跳过 */
export function revealView(root) {
  if (!root || motionReduced()) return;
  var items = root.querySelectorAll('[data-reveal]');
  if (!items.length) return;
  animate(
    Array.from(items),
    { opacity: [0, 1], transform: ['translateY(16px)', 'translateY(0px)'] },
    { duration: 0.5, delay: stagger(0.07), ease: EASE_OUT }
  );
}

/* 微交互：确认式弹跳（收藏成功、保存成功、节奏点命中） */
export function popEl(el) {
  if (!el || motionReduced()) return;
  animate(el, { transform: ['scale(1)', 'scale(1.28)', 'scale(0.96)', 'scale(1)'] }, { duration: 0.42, ease: EASE_OUT });
}

/* 微交互：左右轻摇（用于提示出错或强调） */
export function swayEl(el) {
  if (!el || motionReduced()) return;
  animate(el, { transform: ['translateX(0)', 'translateX(-5px)', 'translateX(5px)', 'translateX(0)'] }, { duration: 0.36, ease: EASE_OUT });
}

/* 侧栏展开：知识点面板滑入（配合 guochao.css 的过渡态） */
export function slidePanel(el) {
  if (!el || motionReduced()) return;
  animate(el, { opacity: [0, 1], transform: ['translateX(18px)', 'translateX(0px)'] }, { duration: 0.38, ease: EASE_OUT });
}

/* [Magic UI 思路] 数字滚动：视图渲染后对 [data-countup="N"] 从 0 数到 N。
   元素初始文本即终值（无 JS / 动效关闭时可读），动画由 onUpdate 临时接管。 */
export function countUp(root) {
  if (!root) return;
  var els = root.querySelectorAll('[data-countup]');
  if (!els.length) return;
  if (motionReduced()) return; /* 初始文本已是终值，无需处理 */
  Array.from(els).forEach(function (el) {
    var target = Number(el.dataset.countup) || 0;
    if (!target) return;
    animate(0, target, {
      duration: 0.9,
      ease: EASE_OUT,
      onUpdate: function (v) { el.textContent = String(Math.round(v)) }
    });
  });
}
