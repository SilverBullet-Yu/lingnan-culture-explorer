import { test, expect } from '@playwright/test';

const atlas = page => page.locator('.immersive-home');
const directory = page => page.getByRole('button', { name: '目录', exact: true });

test('裸地址和旧首页链接直接进入完整无侧壁 SVG 地图', async ({ page }) => {
  for (const url of ['/?map=svg', '/?map=svg#home']) {
    await page.goto(url);
    await expect(atlas(page)).toBeVisible();
    await expect(atlas(page).locator('.atlas-region')).toHaveCount(23);
    await expect(atlas(page).locator('.atlas-city-label')).toHaveCount(23);
    await expect(atlas(page).locator('.atlas-side-layer, .atlas-floor-layer')).toHaveCount(0);
    await expect(atlas(page).locator('.atlas-city-label').filter({ hasText: /^澳门$/ })).toBeVisible();
    await expect(page.getByRole('img', { name: '广东选站地图' })).toHaveCount(0);
  }
});

test('隐藏目录支持键盘关闭、焦点归还和真实导航', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?map=svg');
  const nav = page.getByRole('navigation', { name: '手记目录' });
  await expect(directory(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(nav).toBeHidden();
  await directory(page).press('Enter');
  await expect(nav.getByRole('link')).toHaveCount(5);
  await expect(nav.getByRole('link', { name: '文化地图' })).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');
  await expect(nav).toBeHidden();
  await expect(directory(page)).toBeFocused();
  await directory(page).click();
  await nav.getByRole('link', { name: '主题索引' }).click();
  await expect(page.getByRole('heading', { name: '主题索引', exact: true })).toBeFocused();
});

test('独立完整地图深链仍可直接打开并返回首页', async ({ page }) => {
  await page.goto('/?map=svg#atlas');
  await expect(page.locator('.atlas-region')).toHaveCount(23);
  await expect(page.locator('.atlas-side-layer')).toBeAttached();
  await page.getByRole('link', { name: /返回首页/ }).click();
  await expect(page).toHaveURL(/#home$/);
  await expect(atlas(page)).toBeVisible();
  await expect(page).toHaveTitle('岭南游纪 · 文化地图');
});

test('首页默认地图在 3D 中只绘制顶面；深链仍保留原地图样式', async ({ page }) => {
  test.setTimeout(65000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(atlas(page).locator('#atlas3d-slot canvas')).toBeVisible({ timeout: 30000 });
  await expect.poll(() => page.evaluate(() => window.__atlas3dInfo?.().surfaceOnly)).toBe(true);
  await expect(atlas(page).locator('.atlas3d-label')).toHaveCount(23);
  await page.getByRole('button', { name: '放大地图', exact: true }).click();
  await expect(page.locator('#atlas-zoom')).not.toHaveText('100%');
  await expect.poll(()=>page.evaluate(()=>{
    const shot=window.__atlas3dProject('广州');
    const marker=document.querySelector('.n-marker[data-city="广州"]');
    const pin=marker.getBoundingClientRect();
    return !!shot&&Math.abs(pin.x+pin.width/2-shot[0])<1&&Math.abs(pin.bottom-shot[1]+6)<2;
  })).toBe(true);
  await page.evaluate(() => { location.hash = '#atlas'; });
  await expect(page.locator('#atlas3d-slot canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__atlas3dInfo().surfaceOnly)).toBe(false);
  await page.goBack();
  await expect(atlas(page).locator('#atlas3d-slot canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__atlas3dInfo().surfaceOnly)).toBe(true);
});

test('首页本机数据说明可展开，确认后回到其他页面不重复弹出', async ({ page }) => {
  await page.goto('/?map=svg');
  const info = page.getByRole('button', { name: '学习记录仅存本机' });
  await info.click();
  await expect(page.locator('#home-privacy').getByText(/两者都不上传/)).toBeVisible();
  await page.getByRole('button', { name: '知道了' }).click();
  await expect(info).toHaveAttribute('aria-expanded', 'false');
  await page.goto('/?map=svg#topics');
  await expect(page.locator('#lingnan-storage-notice')).toHaveCount(0);
});


test('强制 SVG 时地图上的两枚地点标记仍可进入路线', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for(const [label,title,id] of [['广州 · 骑楼','骑楼与市井','route-arcade-market'],['普宁 · 英歌','英歌上场前','route-yingge-before']]){
    await page.goto('/?map=svg');
    await expect(page.locator('.immersive-home .atlas-svg')).toBeVisible();
    const pin=page.getByRole('button',{name:label,exact:true});
    await expect(pin).toBeVisible();
    await pin.press('Enter');
    const note=page.locator('#home-location-note');
    await expect(note.getByRole('heading')).toHaveText(title);
    await note.getByRole('link',{name:/进入路线/}).click();
    await expect(page).toHaveURL(new RegExp('#route/'+id+'$'));
  }
});


test('SVG 初始化失败时仍能在备选列表打开并进入地点手记路线', async ({ page }) => {
  await page.addInitScript(() => {
    const create = document.createElementNS.bind(document);
    document.createElementNS = (ns, tag, ...args) => {
      if (ns === 'http://www.w3.org/2000/svg' && tag === 'svg') throw new Error('模拟地图 SVG 初始化失败');
      return create(ns, tag, ...args);
    };
  });
  await page.goto('/?map=svg');
  await expect(atlas(page).locator('.atlas-fallback')).toBeVisible();
  const pin=atlas(page).locator('.atlas-fallback').getByRole('button',{name:'广州 · 骑楼',exact:true});
  await expect(pin).toBeVisible();
  await expect(atlas(page).locator('.atlas-fallback').getByRole('button',{name:'普宁 · 英歌',exact:true})).toBeVisible();
  await pin.press('Enter');
  await page.locator('#home-location-note').getByRole('link',{name:/进入路线/}).click();
  await expect(page).toHaveURL(/#route\/route-arcade-market$/);
});
