import { test, expect } from '@playwright/test';

const areas = {
  440100: ['#ecd2bf', '广府文化'],
  441400: ['#d5e1c4', '客家文化'],
  445100: ['#ecdcb2', '潮汕文化'],
  440800: ['#dfe0d2'],
  810000: ['#bfd4df', '香港'],
  820000: ['#d6c9df', '澳门'],
};

function rgb(hex) {
  return 'rgb(' + hex.slice(1).match(/../g).map(n => parseInt(n, 16)).join(', ') + ')';
}

test('SVG 分区配色与图例一致，旋转重绘后不退回旧色', async ({ page }) => {
  await page.goto('/?map=svg#atlas');
  const verify = async () => {
    for (const [code, [fill, legend]] of Object.entries(areas)) {
      await expect(page.locator('#atlas-top-' + code + ' stop').last()).toHaveAttribute('stop-color', fill);
      if (legend) {
        const swatch = page.locator('.replica-tag').filter({ hasText: legend }).locator('i');
        await expect(swatch).toHaveCSS('background-color', rgb(fill));
      }
    }
  };
  await verify();
  const surface = page.locator('[data-adcode="440100"] .atlas-surface');
  const pathBefore = await surface.getAttribute('d');
  await page.getByRole('button', { name: '地图向右旋转' }).click();
  await expect(surface).not.toHaveAttribute('d', pathBefore);
  await verify();
});

test('三维手机地图沿用纸本底色，工具栏完整且缩放可用', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#atlas');
  await expect(page.locator('#atlas3d-slot canvas')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#replica-map')).toHaveCSS('background-color', 'rgb(248, 245, 233)');
  await expect(page.getByRole('button', { name: '放大地图' })).toHaveCSS('min-height', '40px');
  const metrics = await page.locator('.atlas-controls').evaluate(el => ({
    width: el.clientWidth, scrollWidth: el.scrollWidth, pageWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width);
  expect(metrics.pageWidth).toBe(390);
  const stored = await page.locator('#atlas-zoom').textContent();
  await page.getByRole('button', { name: '放大地图' }).click();
  await expect(page.locator('#atlas-zoom')).not.toHaveText(stored);
});
