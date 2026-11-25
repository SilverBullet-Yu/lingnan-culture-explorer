/* 岭南 × 英歌 统一应用整合冒烟回归（v0.5）。
   两侧 e2e 各自隔离运行时无法覆盖「内嵌挂载」链路，这里补上：
   潮汕入口可发现 → #yingge 全屏 iframe 挂载 → 主题/存储隔离 → 子路由深链 → 返回岭南复原。
   跑在岭南多页产物上（/yingge/index.html 由同一 preview 提供），沿用 ?map=svg 避开 WebGPU 噪声。
   iframe 与父页的 localStorage 隔离靠键前缀（lingnan-* / yingge-*），不依赖 origin 分区。 */
import { test, expect } from '@playwright/test';

const APP = '/?map=svg';
const FRAME = 'iframe.yingge-embed-frame';

/* 收集整条链路的资源失败与未捕获异常（同源子框架的响应/异常也会冒泡到 page）。
   过滤 View Transitions 的「Transition was skipped」AbortError：快速连续导航中断上一帧
   过渡时浏览器按规范抛出的良性信号（岭南既有 VT 行为），非功能错误。 */
function watch(page) {
  const bad = [];
  const errs = [];
  page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  page.on('pageerror', (e) => { const s = String(e); if (!/Transition was skipped/.test(s)) errs.push(s); });
  return { bad, errs };
}
const lingnanKeys = (page) => page.evaluate(() =>
  Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('lingnan-')).map((k) => [k, localStorage.getItem(k)])));
const yinggeFrame = (page) => page.frames().find((f) => f.url().includes('/yingge/index.html'));

test('整合链路：潮汕入口 → 全屏内嵌英歌 → 主题/存储隔离 → 深链 → 返回岭南', async ({ page }) => {
  const { bad, errs } = watch(page);

  /* 岭南本机状态先落一笔（关闭提示条），用于验证英歌往返后不被污染 */
  await page.goto(APP);
  await page.getByRole('button', {name:'学习记录仅存本机'}).click();
  await page.getByRole('button', {name:'知道了',exact:true}).click();
  await expect(page.locator('#lingnan-storage-notice')).toHaveCount(0);
  const before = await lingnanKeys(page);
  expect(before['lingnan-notice-dismissed']).toBeTruthy();

  /* 入口可发现：地区页 + 文化圈页都引出英歌入口卡 */
  await page.goto(APP + '#region/region-cz');
  await expect(page.locator('h1')).toContainText('潮汕');
  await expect(page.locator('a.yingge-entry-card[href="#yingge"]')).toBeVisible();
  await page.goto(APP + '#culture/chaoshan');
  await expect(page.locator('a.yingge-entry-card[href="#yingge"]')).toBeVisible();

  /* 点击入口 → 全屏挂载：hash=#yingge，岭南顶栏隐藏，iframe 渲染英歌地图 */
  await page.goto(APP + '#region/region-cz');
  await page.locator('a.yingge-entry-card[href="#yingge"]').click();
  await expect(page).toHaveURL(/#yingge$/);
  await expect(page.locator('body')).toHaveClass(/is-yingge-embed/);
  await expect(page.locator('header')).toBeHidden();
  const frame = page.frameLocator(FRAME);
  await expect(frame.getByRole('heading', { name: '潮汕 · 英歌地图' })).toBeVisible({ timeout: 15000 });

  /* 主题隔离：英歌 chrome（beat-band/品牌）只在 iframe 内，不渗入岭南父文档 */
  await expect(page.locator('.beat-band')).toHaveCount(0);
  await expect(frame.locator('.beat-band')).toBeVisible();
  await expect(frame.locator('header .brand')).toContainText('英歌');

  /* 存储隔离：英歌写 yingge-*（键前缀分隔），岭南 lingnan-* 不被改动。
     从 iframe 读英歌键、从父页读岭南键，兼容共享与分区两种 localStorage 实现。 */
  /* 存储隔离：英歌写 yingge-*（键前缀分隔），岭南 lingnan-* 不被改动。
     从 iframe 读英歌键、从父页读岭南键，兼容共享与分区两种 localStorage 实现。 */
  await frame.locator('#sound').click();
  await expect(frame.locator('#sound')).toHaveAttribute('aria-pressed', 'false');
  const frameKeys = await yinggeFrame(page).evaluate(() => Object.keys(localStorage));
  expect(frameKeys.some((k) => k.startsWith('yingge-'))).toBe(true);
  expect(await lingnanKeys(page)).toEqual(before);

  /* 深链：父 hash 带子路径 → iframe 落到对应章节（第一章剧情有「开始关卡」） */
  await page.goto(APP + '#yingge/story/ch1');
  await expect(page.frameLocator(FRAME).getByRole('button', { name: /开始关卡/ })).toBeVisible({ timeout: 15000 });
  expect(yinggeFrame(page).url()).toContain('#story/ch1');

  /* 返回岭南：卸载 iframe、沉浸首页复原、本机状态留存 */
  await page.locator('.yingge-embed-back').click();
  await expect(page).toHaveURL(/#home$/);
  await expect(page.locator('body')).not.toHaveClass(/is-yingge-embed/);
  await expect(page.locator(FRAME)).toHaveCount(0);
  await expect(page.locator('header')).toBeHidden();
  await expect(page.locator('.immersive-home #atlas-heading')).toHaveText('岭南游纪');
  await expect(page.locator('.immersive-home .atlas-region')).toHaveCount(23);
  expect(await lingnanKeys(page)).toEqual(before);

  /* 内嵌资源全部加载成功，全链路无未捕获异常 */
  expect(bad.filter((u) => u.includes('/yingge/'))).toEqual([]);
  expect(errs).toEqual([]);
});

test('窄屏 375px：内嵌英歌可达、无横向溢出、返回可用', async ({ page }) => {
  const { bad, errs } = watch(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(APP + '#yingge');
  await expect(page.locator('body')).toHaveClass(/is-yingge-embed/);
  const frame = page.frameLocator(FRAME);
  await expect(frame.getByRole('heading', { name: '潮汕 · 英歌地图' })).toBeVisible({ timeout: 15000 });

  /* 返回条在窄屏可达，父文档无横向溢出 */
  const back = page.locator('.yingge-embed-back');
  await expect(back).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await back.click();
  await expect(page).toHaveURL(/#home$/);
  await expect(page.locator('.brand')).toContainText('岭南');
  expect(bad.filter((u) => u.includes('/yingge/'))).toEqual([]);
  expect(errs).toEqual([]);
});