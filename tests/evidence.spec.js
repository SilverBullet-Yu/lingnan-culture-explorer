/* 现行界面证据截图（v0.5：2 条路线 / 6 个场景）。
   仅经 `npm run evidence` 运行；产物写入 原型/资料区/验证/20261115-现行界面证据/，
   不覆盖 资料区/验证/v0.4.0回归/ 历史截图。 */
import { test, expect } from '@playwright/test';

const DIR = '资料区/验证/20261115-现行界面证据';

async function shot(page, name) {
  /* 整页截图前把懒加载图强制 eager 并等全部加载完成——
     native lazy 只加载视口附近图片，fullPage 截图会把视口外图块截成空白 */
  await page.evaluate(() => {
    document.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; });
  });
  await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete), null, { timeout: 8000 }).catch(() => {});
  /* 等 View Transitions 柔转（0.18s）结束后再截，避免截到交叉渐变 */
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}`, fullPage: true });
}

test('现行界面证据截图（首页/主题/路线/场景/答疑/我的探索/三维地图）', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.immersive-home #atlas3d-slot canvas')).toBeVisible({ timeout: 30000 });
  await shot(page, '01-首页.png');

  await page.getByRole('button', { name: '普宁 · 英歌', exact: true }).press('Enter');
  await expect(page.locator('#home-location-note h2')).toHaveText('英歌上场前');
  await shot(page, '02-首页-选中普宁英歌.png');

  await page.goto('/#topics');
  await expect(page.locator('h1')).toContainText('主题索引');
  await shot(page, '03-主题索引.png');

  await page.goto('/#route/route-yingge-before');
  await expect(page.locator('h1')).toContainText('英歌上场前');
  await shot(page, '04-潮汕路线.png');

  await page.goto('/#scene/scene-gz-qilou');
  await expect(page.locator('.language')).toBeVisible();
  await shot(page, '05-场景页-方言卡.png');

  await page.locator('.qa-suggest-btn').first().click();
  await expect(page.locator('#qa-result')).toContainText('来源');
  await shot(page, '06-场景页-答疑.png');

  /* 按当前门槛完成当前场景：已读 + 理解动作 + 文字稿替代声音 */
  await page.locator('[data-scene-read]').click();
  await page.locator('#scene-interaction [data-understanding]').first().click();
  await page.locator('[data-understanding-submit]').click();
  await page.locator('[data-scene-fallback]').click();
  await expect(page.locator('[data-scene-completion]')).toContainText('降级完成');
  await page.locator('aside button[data-fav]').click();
  await page.locator('#note-text').fill('想记住骑楼柱廊的遮阳与排水细节。');
  await page.locator('aside button[data-note]').click();
  await page.goto('/#me');
  await expect(page.locator('h1')).toContainText('我的探索');
  await shot(page, '07-我的探索.png');

  /* 08 三维地图：完整地图页悬停广州（原生 Raycaster 拾取） */
  await page.goto('/#atlas');
  await page.waitForFunction('document.documentElement.classList.contains("atlas3d-on")', { timeout: 30000 });
  await page.waitForTimeout(2500);
  const gz = await page.evaluate(() => (window.__atlas3dProject ? window.__atlas3dProject('广州') : null));
  if (gz) {
    await page.mouse.move(gz[0], gz[1], { steps: 8 });
    await page.waitForTimeout(900);
  }
  await shot(page, '08-三维地图-首页悬停贴纸卡.png');

  /* 09 进度地形：写入本机进度 → 对应城市地块抬高提亮（方案 5） */
  await page.evaluate(() => {
    localStorage.setItem('lingnan-progress', JSON.stringify({
      'scene-gz-qilou': { done: true, at: '2026-11-15T10:00:00.000Z' },
      'scene-gz-xiguan': { done: true, at: '2026-11-15T10:05:00.000Z' },
      'scene-gz-street': { done: true, at: '2026-11-15T10:10:00.000Z' },
      'scene-cz-yingge-role': { done: true, at: '2026-11-15T10:15:00.000Z' },
      'scene-cz-yingge-team': { done: true, at: '2026-11-15T10:20:00.000Z' },
    }));
    localStorage.setItem('lingnan-route-completed', JSON.stringify({ 'route-arcade-market': '2026-11-15T10:25:00.000Z' }));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('document.documentElement.classList.contains("atlas3d-on")', { timeout: 30000 });
  await page.waitForTimeout(3000);
  await shot(page, '09-三维地图-进度地形.png');

  /* 10 二维降级对照：?map=svg 强制回到原 SVG 地图 */
  await page.goto('/?map=svg#atlas', { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  await shot(page, '10-二维降级对照.png');
});
