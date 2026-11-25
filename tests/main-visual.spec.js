import { test, expect } from '@playwright/test';

const inner = '/?map=svg#regions';
const primaryNav = page => page.getByRole('navigation', { name: '主要导航' });

test('手机顶栏：五个入口保留，位于独立导航行', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(inner);
  const nav = primaryNav(page);
  await expect(nav.getByRole('link')).toHaveCount(5);
  const boxes = await nav.evaluate(el => ({
    navTop: el.getBoundingClientRect().top,
    brandBottom: el.parentElement.querySelector('.brand').getBoundingClientRect().bottom,
    lastLinkRight: el.lastElementChild.getBoundingClientRect().right,
    viewportWidth: innerWidth,
    overflow: document.documentElement.scrollWidth - innerWidth,
  }));
  expect(boxes.navTop).toBeGreaterThanOrEqual(boxes.brandBottom);
  expect(boxes.lastLinkRight).toBeLessThanOrEqual(boxes.viewportWidth);
  expect(boxes.overflow).toBeLessThanOrEqual(0);
  await nav.getByRole('link', { name: '主题索引' }).click();
  await expect(page.getByRole('heading', { name: '主题索引', exact: true })).toBeVisible();
});

for (const [width,height] of [[1440,900],[390,844]]) {
  test('沉浸首页地名、目录和工具均落在首屏 '+width, async ({ page }) => {
    await page.setViewportSize({width,height});
    await page.goto('/');
    const map=page.locator('#replica-map');
    await expect(map.locator('canvas')).toBeVisible({timeout:30000});
    await expect.poll(()=>page.evaluate(()=>window.__atlas3dInfo?.().surfaceOnly)).toBe(true);
    await expect(map.locator('.atlas3d-label')).toHaveCount(23);
    for(const e of [page.locator('#atlas-heading'),page.locator('.n-dir'),page.locator('.n-tools'),map.locator('.atlas3d-label').filter({hasText:/^香港$|^澳门$/})]){
      for(const el of await e.all()){
        const b=await el.boundingBox();
        expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(width);
        expect(b.y).toBeGreaterThanOrEqual(0);expect(b.y+b.height).toBeLessThanOrEqual(height);
      }
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  });
}

test('路线列表与广州详情共用卡片，保留各自的状态和场景数量', async ({ page }) => {
  await page.goto('/?map=svg#route');
  const list = page.getByRole('link', { name: /骑楼与市井.*未开始/ });
  await expect(list).toContainText('0/3');
  await expect(list).toHaveClass(/route-card/);
  await page.goto('/?map=svg#region/region-gz');
  const region = page.getByRole('link', { name: /骑楼与市井.*进入路线/ });
  await expect(region).toContainText('3 个广州场景');
  await expect(region).toHaveAttribute('href', '#route/route-arcade-market');
});
