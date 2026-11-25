import { test, expect } from '@playwright/test';

async function open(page, path) {
  await page.goto('/yingge/index.html#' + path);
  await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false');
}

test('章节导航：可读颜色、跳章前情、回看保留已到达阶段与地图续接', async ({ page }) => {
  await open(page, 'story/ch3');
  await expect(page.locator('.recap')).toContainText('本章目标');
  await expect(page.locator('.story-toc-row').first()).toHaveCSS('color', 'rgb(38, 25, 13)');
  await expect(page.locator('.story-toc-row.on')).toHaveAttribute('aria-current', 'step');
  await page.locator('#stage-advance').click();
  await expect(page.locator('#team-play')).toBeVisible();
  await page.getByRole('button', { name: '剧情', exact: true }).click();
  await expect(page.locator('#stage-advance')).toBeVisible();
  await page.getByRole('button', { name: '关卡', exact: true }).click();
  await expect(page.locator('#team-play')).toBeVisible();
  await page.locator('header nav a[href="#map"]').click();
  await expect(page.getByRole('link', { name: /继续体验 · 队伍协作/ })).toBeVisible();
  await page.getByRole('link', { name: /继续体验 · 队伍协作/ }).click();
  await expect(page.locator('#team-play')).toBeVisible();
});

test('知识深链：选中、局部放大、计数、关闭焦点与继续故事', async ({ page }) => {
  await open(page, 'explore/wall/K02');
  await expect(page.locator('#knowledge-panel')).toHaveClass(/open/);
  await expect(page.locator('#knowledge-panel .knowledge-id')).toHaveText('K02');
  await expect(page.locator('.detail-viewport svg')).toHaveAttribute('viewBox', '35 55 130 80');
  await expect(page.locator('[data-scene-tab="wall"] small')).toHaveText('1/3');
  await page.locator('#k-close').click();
  await expect(page.locator('#knowledge-panel')).not.toHaveClass(/open/);
  await page.locator('.wall-face[data-k="K01"]').click();
  await expect(page).toHaveURL(/wall\/K01$/);
  await page.locator('[data-detail="lines"]').click();
  await expect(page.locator('.detail-viewport svg')).toHaveAttribute('viewBox', '35 105 130 100');
  await page.keyboard.press('Escape');
  await expect(page.locator('.wall-face[data-k="K01"]')).toBeFocused();
  await page.locator('[data-compare-view="eyes"]').click();
  await expect(page.locator('#compare-ref svg')).toHaveAttribute('viewBox', '35 55 130 80');
  await page.locator('.explore-continue a').click();
  await expect(page).toHaveURL(/story\/ch2/);
  await expect(page.locator('h1')).toHaveText('共同节奏');
});

test('协作切换中断播放且减少动效显示静态比较', async ({ page }) => {
  await open(page, 'story/ch3/interact');
  await page.locator('#team-play').click();
  await page.locator('[data-mode="cue"]').click();
  await expect(page.locator('#team-clock')).toHaveText('0.0s');
  await page.locator('#motion').click();
  await page.locator('#team-play').click();
  await expect(page.locator('.team-times')).toContainText('1号 0.90s');
  await expect(page.locator('#team-go')).toBeVisible();
});

test('声音探索实际示范：静音视觉、暂停与重播', async ({ page }) => {
  await open(page, 'explore/sound');
  await page.locator('#sound').click();
  await page.locator('[data-demo-play]').click();
  await expect(page.locator('[data-demo-caption]')).toContainText('/20 拍');
  await expect(page.locator('[data-demo-audio]')).toContainText('声音已关闭');
  await page.locator('[data-demo-play]').click();
  await expect(page.locator('[data-demo-caption]')).toContainText('已暂停');
  await page.locator('[data-demo-replay]').click();
  await expect(page.locator('[data-demo-play]')).toHaveText('暂停');
  await page.locator('[data-scene-tab="wall"]').click();
  await expect(page.locator('#sound-demo-mount')).toHaveCount(0);
});

test('保存失败保留会话并提供下载与重试', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'yingge-progress') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await open(page, 'explore/wall');
  await page.locator('.wall-face[data-k="K01"]').click();
  await expect(page.locator('#save-status')).toContainText('请先下载作品与观察记录');
  const download = page.waitForEvent('download');
  await page.locator('#save-export').click();
  expect((await download).suggestedFilename()).toMatch(/英歌观察记录.*json/);
  await expect(page.locator('#save-retry')).toBeVisible();
  await page.locator('#save-retry').click();
  await expect(page.locator('#knowledge-panel')).toContainText('K01');
});

for (const width of [390, 768, 1440]) {
  test(`布局 ${width}px：六视图无横向溢出、导航与触控可达`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    for (const route of ['map', 'detail', 'story/ch1', 'story/ch1/interact', 'explore/wall', 'explore/sound', 'result', 'me']) {
      await open(page, route);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    }
    if (width === 390) {
      await open(page, 'story/ch1');
      await expect(page.locator('.story-toc')).toBeHidden();
      await page.locator('.chapter-toggle').click();
      await expect(page.locator('.story-toc')).toBeVisible();
      await open(page, 'explore/wall');
      await page.locator('.wall-face[data-k="K01"]').click();
      await expect(page.locator('#knowledge-panel')).toHaveCSS('position', 'fixed');
      await page.locator('#k-close').click();
      await expect(page.locator('#knowledge-panel')).toBeHidden();
    }
    expect(errors).toEqual([]);
  });
}

test('回放我的点按使用真实时间差并支持停止', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('yingge-progress', JSON.stringify({
    current: { chapter: 'ch2', stage: 'interact' }, explored: {}, interactions: {},
    chapters: { ch2: { stage: 'interact', data: { done: true, rhythm: { slow: false, hits: 6, verdicts: ['hit', 'early', 'late', 'hit', 'hit', 'hit', 'hit', 'hit'], diffs: [0, -200, 200, 0, 0, 0, 0, 0] } } } }
  })));
  await open(page, 'story/ch2');
  await page.locator('#rhythm-replay-inputs').click();
  await expect(page.locator('.rhythm-point.input-mark').first()).toBeVisible();
  await page.locator('#rhythm-stop-replay').click();
  await expect(page.locator('#rhythm-again')).toBeVisible();
  await expect(page.locator('.rhythm-fb')).toHaveCount(8);
});

test('多标签同步不循环写回，最新位置可恢复', async ({ page, context }) => {
  await open(page, 'story/ch1');
  const other = await context.newPage();
  await open(other, 'story/ch3');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('yingge-progress')).current.chapter)).toBe('ch3');
  const stamp = await other.evaluate(() => localStorage.getItem('yingge-progress'));
  await page.waitForTimeout(500);
  expect(await other.evaluate(() => localStorage.getItem('yingge-progress'))).toBe(stamp);
  await other.close();
});

test('双画布同步采用最新草稿，远端清空不复活旧笔画', async ({ page, context }) => {
  await open(page, 'story/ch1/interact');
  await page.locator('#mask-name').fill('第一份草稿');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('yingge-progress')).chapters.ch1.data?.draft?.name)).toBe('第一份草稿');
  const other = await context.newPage();
  await open(other, 'story/ch1/interact');
  await other.locator('#mask-name').fill('另一页的新草稿');
  await expect(page.locator('#mask-name')).toHaveValue('另一页的新草稿');
  const saved = await page.evaluate(() => localStorage.getItem('yingge-progress'));
  await page.waitForTimeout(1000);
  expect(await other.evaluate(() => localStorage.getItem('yingge-progress'))).toBe(saved);
  await other.evaluate(() => localStorage.removeItem('yingge-progress'));
  await expect(page.locator('#stage-advance')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('yingge-progress'))).toBeNull();
  await other.close();
});

test('成果页缺失图片的下载显示页内反馈', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('yingge-works', JSON.stringify([{ id: 'missing-image', name: '图片不存在的作品', at: '2026-11-11T00:00:00Z', refs: [] }])));
  await open(page, 'result');
  await page.locator('[data-download="missing-image"]').click();
  await expect(page.locator('[data-edit-status]')).toContainText('未找到作品图片');
});

test('两个记录中心不会因存储探针循环刷新', async ({ page, context }) => {
  await open(page, 'me');
  await page.evaluate(() => {
    window.businessUpdates = 0;
    window.addEventListener('storage', e => { if (e.key === 'yingge-probe') window.businessUpdates++ });
  });
  const other = await context.newPage();
  await open(other, 'me');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.businessUpdates)).toBeLessThanOrEqual(2);
  await other.close();
});

test('减少动效双通道保留内容可见', async ({ page }) => {
  await open(page, 'story/ch1');
  await page.locator('#motion').click();
  await expect(page.locator('body')).toHaveClass(/reduced-motion/);
  await expect(page.locator('h1')).toBeVisible();
  await page.reload();
  await expect(page.locator('#motion')).toHaveAttribute('aria-pressed', 'true');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 'explore/wall/K01');
  await expect(page.locator('#knowledge-panel')).toHaveCSS('opacity', '1');
  await expect(page.locator('#knowledge-panel h3')).toBeVisible();
});
