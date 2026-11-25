/* 岭南漫游 · 三维地图回归断言（Three.js r187 WebGPURenderer 真挤出 + 「镜头即路由」）。
   覆盖：完整地图页默认三维、?map=svg 强制降级、镜头随路由切换、地市悬停拾取、
   画布常驻不重建、减少动效下镜头立即到位。
   与 tests/e2e.spec.js（固定跑 ?map=svg 的 SVG 链路）互不干扰：这里走默认三维链路。
   约定：三维层按需异步加载，等 html.atlas3d-on 且渲染过首帧才算就绪；
   backend 随本机图形栈而变（headless Edge + SwiftShader 为 WebGL 2），只断言非空，不断言具体值。 */
import { test, expect } from '@playwright/test';

const APP = '/';
const ATLAS = APP + '#atlas';

/* 等三维层就绪：根类标记出现 + 至少渲染过一帧 */
async function wait3D(page) {
  await page.waitForFunction(
    () => document.documentElement.classList.contains('atlas3d-on'),
    null,
    { timeout: 30000 },
  );
  await page.waitForFunction(
    () => !!window.__atlas3dInfo && window.__atlas3dInfo().frames > 0,
    null,
    { timeout: 30000 },
  );
}

/* 等镜头位姿到达目标（pose 键由「路由 → 位姿」映射决定） */
async function waitPose(page, pose) {
  await page.waitForFunction(
    (want) => !!window.__atlas3dInfo && window.__atlas3dInfo().pose === want,
    pose,
    { timeout: 30000 },
  );
}

function info(page) {
  return page.evaluate(() => window.__atlas3dInfo());
}

test('完整地图页默认三维：根类标记、画布唯一、已出帧，SVG 地图保留但隐藏', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto(ATLAS);
  await wait3D(page);
  const state = await info(page);
  expect(state.mode).toBe('3d');
  expect(typeof state.backend).toBe('string');
  expect(state.backend.length).toBeGreaterThan(0);   /* 后端随本机图形栈而变 */
  expect(state.pose).toBe('home');
  expect(state.frames).toBeGreaterThan(0);
  expect(await page.locator('canvas.atlas3d-canvas').count()).toBe(1);
  /* SVG 降级地图仍在 DOM 里（路径保留），但三维模式下被 CSS 隐藏 */
  expect(await page.locator('#replica-map path').count()).toBeGreaterThan(50);
  await expect(page.locator('#replica-map path').first()).toBeAttached();
  await expect(page.locator('#replica-map svg.atlas-svg')).not.toBeVisible();
  await expect(page.locator('#replica-map path.atlas-surface').first()).not.toBeVisible();
});

test('?map=svg 强制降级：不建三维层、不请求额外脚本，SVG 地图可见', async ({ page }) => {
  test.setTimeout(90000);
  const scriptUrls = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (request.resourceType() === 'script' || /\.m?js$/.test(url.pathname)) scriptUrls.push(url.href);
  });
  await page.goto('/?map=svg#atlas');
  await expect(page.locator('#replica-map path').first()).toBeAttached();
  expect(
    await page.evaluate(() => document.documentElement.classList.contains('atlas3d-on')),
    '降级模式不应有 atlas3d-on 标记',
  ).toBe(false);
  expect(await page.locator('canvas.atlas3d-canvas').count()).toBe(0);
  const entryUrls = await page.locator('script[type="module"][src]').evaluateAll((scripts) =>
    scripts.map((script) => new URL(script.src, location.href).href).filter((url) => !url.includes('/@vite/client')),
  );
  expect(entryUrls).toHaveLength(1);
  const threeScripts = scriptUrls.filter((url) => url.includes('/assets/index-'));
  expect(threeScripts, 'SVG 降级模式不应请求包含 Three.js 实现的独立构建 chunk').toEqual([]);
  /* SVG 地图本体可见（defs 里的纹样路径不算渲染内容，用地区面路径判定） */
  await expect(page.locator('#replica-map svg.atlas-svg')).toBeVisible();
  await expect(page.locator('#replica-map path.atlas-surface').first()).toBeVisible();
});

test('镜头即路由：四个路由对应四个位姿，页眉指示牌同步', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto(ATLAS);
  await wait3D(page);
  const cases = [
    ['#region/region-gz', 'region:region-gz', '地区 · 广州'],
    ['#route/route-arcade-market', 'route:route-arcade-market', '路线 · 骑楼与市井'],
    ['#scene/scene-gz-qilou', 'scene:scene-gz-qilou', '场景 · 广州'],
    ['#me', 'overview', '广东总览'],
  ];
  for (const [hash, pose, where] of cases) {
    await page.goto(APP + hash);
    await waitPose(page, pose);
    await expect(page.locator('#atlas3d-where'), hash + ' 的页眉指示牌').toContainText(where);
  }
});

test('悬停拾取：按城市锚点移动指针，命中地市并更新提示条', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto(ATLAS);
  await wait3D(page);
  /* 先把地图舞台滚进视口，再取锚点页面坐标（坐标随滚动位置变化） */
  await page.locator('#replica-map').waitFor({ state: 'attached' });
  await page.evaluate(() => window.scrollTo(0, document.querySelector('#replica-map').getBoundingClientRect().top + window.scrollY - 120));
  const point = await page.evaluate(() => window.__atlas3dProject('广州'));
  expect(point, '应能投影广州的城市锚点').not.toBeNull();
  await page.mouse.move(point[0], point[1]);
  await expect
    .poll(async () => (await info(page)).hover, { timeout: 15000, message: '指针应拾取到广州' })
    .toBe('广州');
  await expect(page.locator('#atlas-hover-label')).toHaveText('广州 · 进入学习');

  for (const [name, label, href] of [['深圳', '仅地图展示', null], ['佛山', '地区简介', '#region/region-fs']]) {
    const city = await page.evaluate((n) => window.__atlas3dProject(n), name);
    expect(city).not.toBeNull();
    await page.mouse.move(city[0], city[1]);
    await expect(page.locator('#atlas-hover-label')).toHaveText(`${name} · ${label}`);
    const before = await page.evaluate(() => location.hash);
    await page.mouse.click(city[0], city[1]);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(href ?? before);
  }
});

test('三维地图左键拖动不应触发地市导航', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto(ATLAS);
  await wait3D(page);
  await page.locator('#replica-map').scrollIntoViewIfNeeded();
  const point = await page.evaluate(() => window.__atlas3dProject('广州'));
  expect(point, '应能投影广州的城市锚点').not.toBeNull();

  const initialHash = await page.evaluate(() => location.hash);
  await page.mouse.move(point[0], point[1]);
  await page.mouse.down();
  await page.mouse.move(point[0] + 24, point[1], { steps: 4 });
  await page.mouse.move(point[0], point[1], { steps: 4 });
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => location.hash)).toBe(initialHash);

  await page.mouse.click(point[0], point[1]);
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#region/region-gz');
});

test('画布常驻不重建：跨路由仍是同一个 canvas，宿主改挂整屏底图', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto(ATLAS);
  await wait3D(page);
  /* 完整地图页：画布嵌在地图舞台的插槽里 */
  const home = await page.evaluate(() => {
    const el = document.querySelector('.atlas3d-host');
    return { slot: el.parentElement.id, stage: el.classList.contains('is-stage') };
  });
  expect(home.slot).toBe('atlas3d-slot');
  expect(home.stage).toBe(true);
  const before = await page.locator('canvas.atlas3d-canvas').elementHandle();
  for (const [hash, pose] of [
    ['#region/region-gz', 'region:region-gz'],
    ['#route/route-arcade-market', 'route:route-arcade-market'],
    ['#scene/scene-gz-qilou', 'scene:scene-gz-qilou'],
  ]) {
    await page.goto(APP + hash);
    await waitPose(page, pose);
    expect(await page.locator('canvas.atlas3d-canvas').count()).toBe(1);
  }
  /* 仍是同一个 DOM 节点（只是换了宿主位置，没有重建） */
  const after = await page.locator('canvas.atlas3d-canvas').elementHandle();
  expect(await page.evaluate((pair) => pair[0] === pair[1], [before, after])).toBe(true);
  /* 场景页：宿主是 body 的直接子元素并带 is-ambient（整屏底图、低透明度） */
  const away = await page.evaluate(() => {
    const el = document.querySelector('.atlas3d-host');
    return { parent: el.parentElement.tagName, ambient: el.classList.contains('is-ambient') };
  });
  expect(away.parent).toBe('BODY');
  expect(away.ambient).toBe(true);
});

test('减少动效：切换路由时镜头立即到位，不做飞行动画', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto(ATLAS);
  await wait3D(page);
  await page.locator('#motion').click();
  await expect(page.locator('#motion')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => page.evaluate(() => document.body.classList.contains('reduced-motion'))).toBe(true);
  /* 先落到一个基准路由（广州），再切到同一城市的近景（场景），便于比较视距 */
  await page.goto(APP + '#region/region-gz');
  await waitPose(page, 'region:region-gz');
  /* 逐帧记录镜头状态：用来判断「新位姿的第一帧是否已经到位」 */
  await page.evaluate(() => {
    window.__rec = [];
    const tick = () => {
      const i = window.__atlas3dInfo();
      window.__rec.push({ pose: i.pose, target: i.target, radius: i.radius, elev: i.elev });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  /* 等记录器真的跑起来再切路由，保证「新位姿的第一帧」落在记录区间内 */
  await page.waitForFunction(() => window.__rec && window.__rec.length >= 3, null, { timeout: 15000 });
  await page.evaluate(() => { window.location.hash = '#scene/scene-gz-qilou'; });
  await waitPose(page, 'scene:scene-gz-qilou');
  /* 等镜头稳定：新位姿已入帧，且连续三帧数值一致 */
  await page.waitForFunction(
    (want) => {
      const r = window.__rec;
      if (!r || r.length < 4) return false;
      const same = (a, b) =>
        Math.abs(a.radius - b.radius) < 1e-6 &&
        Math.abs(a.elev - b.elev) < 1e-6 &&
        Math.abs(a.target.x - b.target.x) < 1e-6 &&
        Math.abs(a.target.z - b.target.z) < 1e-6;
      const n = r.length;
      return r[n - 1].pose === want && same(r[n - 1], r[n - 2]) && same(r[n - 2], r[n - 3]);
    },
    'scene:scene-gz-qilou',
    { timeout: 15000 },
  );
  const rec = await page.evaluate(() => window.__rec);
  const first = rec.findIndex((s) => s.pose === 'scene:scene-gz-qilou');
  expect(first, '应记录到新位姿的帧').toBeGreaterThanOrEqual(3);
  const settled = rec[rec.length - 1];
  /* 第一帧就是最终位姿（没有过渡帧）→ 镜头立即到位 */
  expect(Math.abs(rec[first].radius - settled.radius)).toBeLessThan(0.5);
  expect(Math.abs(rec[first].elev - settled.elev)).toBeLessThan(0.5);
});

test('进度 → 地形：完成场景的城市地块抬高，路线完成后光带整条亮起', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto(ATLAS);
  await wait3D(page);
  /* 基线：没探索过的城市地块高度为 1 */
  expect(await page.evaluate(() => window.__atlas3dCityHeight('广州'))).toBeCloseTo(1, 2);

  /* 写入本机进度：广州三站完成 + 一条路线完成（不新增存储键，读现有 localStorage） */
  await page.evaluate(() => {
    localStorage.setItem('lingnan-progress', JSON.stringify({
      'scene-gz-qilou': { done: true, at: '2026-11-04T10:00:00.000Z' },
      'scene-gz-xiguan': { done: true, at: '2026-11-04T10:05:00.000Z' },
      'scene-gz-street': { done: true, at: '2026-11-04T10:10:00.000Z' },
      'scene-cz-yingge-role': { done: true, at: '2026-11-04T10:15:00.000Z' },
      'scene-cz-yingge-team': { done: true, at: '2026-11-04T10:20:00.000Z' },
    }));
    localStorage.setItem('lingnan-route-completed', JSON.stringify({ 'route-arcade-market': '2026-11-04T10:25:00.000Z' }));
  });
  await page.reload({ waitUntil: 'load' });
  await wait3D(page);
  /* 等抬高动画收敛 */
  await page.waitForFunction(
    () => {
      const h = window.__atlas3dCityHeight && window.__atlas3dCityHeight('广州');
      return h !== null && h > 1.3;
    },
    null,
    { timeout: 15000 },
  );
  expect(await page.evaluate(() => window.__atlas3dCityHeight('广州'))).toBeGreaterThan(1.3);
  expect(await page.evaluate(() => window.__atlas3dCityHeight('潮州'))).toBeGreaterThan(1.1);
  /* 没去过的城市不受影响 */
  expect(await page.evaluate(() => window.__atlas3dCityHeight('深圳'))).toBeCloseTo(1, 2);

  /* 路线页：该路线已完成 → 光带整条亮起 */
  await page.evaluate(() => { location.hash = '#route/route-arcade-market'; });
  await page.waitForFunction(
    () => window.__atlas3dRouteGlow && window.__atlas3dRouteGlow() === true,
    null,
    { timeout: 15000 },
  );
});
