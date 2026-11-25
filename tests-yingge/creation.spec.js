/* 独立运行：node --test tests-yingge/creation.spec.js
   不启动端口、不 build/generate，不修改种子；真实 Edge DOM/canvas/IndexedDB。
   源模块仅去掉 ESM 声明并组合；保存失败由显式注入模拟 store.save=false / DB 拒绝。
   同时兼容项目 Playwright 自动发现。 */
import { test as nodeTest, before as nodeBefore, after as nodeAfter } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium, test as playwrightTest } from '@playwright/test';

const standalone = !!process.env.NODE_TEST_CONTEXT;
const before = standalone ? nodeBefore : playwrightTest.beforeAll;
const after = standalone ? nodeAfter : playwrightTest.afterAll;
const test = standalone ? nodeTest : (name, fn) => playwrightTest(name, async () => {
  const finalizers = [];
  try { await fn({ after: fn => finalizers.push(fn) }); }
  finally { for (const fn of finalizers.reverse()) await fn(); }
});
const load = path => readFileSync(new URL(path, import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/\bexport (?=function|var)/g, '');
const source = ['../yingge/src/store.js', '../yingge/src/story/flow.js', '../yingge/src/works-db.js',
  '../yingge/src/story/mask.js', '../yingge/src/pages/result.js'].map(load).join('\n')
  + '\nfunction popEl() {}\n'
  + 'var realSave = save; save = function () { return window.failSave ? false : realSave() };\n'
  + 'var realPutWork = putWork; putWork = function (w) { return window.failDB ? Promise.reject(new Error("DB unavailable")) : realPutWork(w) };\n'
  + 'return { state, save, reloadState, mountMask, resultPage, bindResultPage, putWork, getWork, allWorks, runStageCleanup, registerStageCleanup };';
let browser;
before(async () => { browser = await chromium.launch({ channel: 'msedge', headless: true }); });
after(async () => { if (browser) await browser.close(); });

async function setup(t) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  t.after(() => context.close());
  const page = await context.newPage();
  await page.route('http://creation.test/**', route => route.fulfill({
    contentType: 'text/html', body: '<main id="fixture"></main>',
  }));
  await page.goto('http://creation.test/#story/ch1/interact');
  await page.evaluate(source => {
    window.module = new Function(source)();
    module.state.data = {
      references: [{ ref: 'face-red', svg: 'red', name: '关胜参考', role: '教学示意', detail: { label: '眉眼', note: '观察线条' } }],
      review: ['r1', 'r2', 'r3'].map(id => ({ id, question: id, options: [
        { key: 'a', label: '首次选项', feedback: '解释 A' }, { key: 'b', label: '最近选项', feedback: '解释 B' },
      ] })),
    };
    window.audit = { done: [], labels: [], downloads: [] };
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      audit.labels.push(args[0]); return fillText.apply(this, args);
    };
    const anchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) audit.downloads.push({ name: this.download, href: this.href });
      return anchorClick.call(this);
    };
    window.mount = () => {
      module.runStageCleanup();
      module.mountMask(document.querySelector('#fixture'), 'ch1', {
        registerCleanup: module.registerStageCleanup,
        done: html => {
          audit.done.push(html);
          const rec = module.state.progress.chapters.ch1;
          rec.stage = 'feedback'; rec.data.summary = html; module.save();
          module.runStageCleanup();
          document.querySelector('#fixture').innerHTML = html + '<button id="stage-advance">进入展墙</button>';
        },
      });
    };
    window.result = () => {
      module.runStageCleanup();
      document.querySelector('#fixture').innerHTML = module.resultPage();
      module.bindResultPage();
    };
    window.seedWork = async () => {
      const work = { id: 'original', name: '原作', at: '2026-01-01T00:00:00Z', refs: ['face-red'],
        strokes: [{ tool: 'brush', color: '#cf3a1c', size: 8, points: [[480, 520]] }],
        png: document.querySelector('#mask-canvas').toDataURL('image/png'), chapter: 'ch1' };
      await module.putWork(work);
      module.state.works = [{ id: work.id, name: work.name, at: work.at, refs: work.refs }];
      return work;
    };
    mount();
  }, source);
  return page;
}
const click = (page, selector) => page.locator(selector).evaluate(el => el.click());
async function dot(page) {
  await page.locator('#mask-canvas').click({ position: { x: 480, y: 520 } });
}
const draft = page => page.evaluate(() => module.state.progress.chapters.ch1.data.draft);

// 不依赖 CSS 的尺寸与动画，直接验证真实画布像素与 DOM 可访问属性。
test('单击画出点，默认粗细 8，工具 aria-pressed 与选择一致', async t => {
  const page = await setup(t);
  assert.equal(await page.locator('[data-size="8"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-size="8"]').getAttribute('aria-label'), '画笔粗细 8');
  await dot(page);
  assert.deepEqual(await page.locator('#mask-canvas').evaluate(cv => [...cv.getContext('2d').getImageData(480, 520, 1, 1).data]), [207, 58, 28, 255]);
  await click(page, '[data-size="14"]');
  await click(page, '[data-shape="band"]');
  assert.equal(await page.locator('[data-size="8"]').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('[data-size="14"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-shape="band"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-draw="brush"]').getAttribute('aria-pressed'), 'false');
});

test('名称 input 自动存草稿，pagehide 同步保存并恢复名称/笔画/参考', async t => {
  const page = await setup(t);
  await page.locator('#mask-name').fill('未完成的作品');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('yingge-progress'))?.chapters?.ch1?.data?.draft?.name === '未完成的作品');
  await dot(page);
  await click(page, '.mask-ref');
  await page.keyboard.press('Escape');
  await page.locator('#mask-name').fill('离开前最后的名称');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const saved = await draft(page);
  assert.equal(saved.name, '离开前最后的名称');
  assert.equal(saved.strokes.length, 1);
  assert.deepEqual(saved.seenRefs, ['face-red']);
  await page.evaluate(() => { module.runStageCleanup(); module.reloadState(); mount(); });
  assert.equal(await page.locator('#mask-name').inputValue(), saved.name);
  assert.equal(await page.locator('#mask-save').isEnabled(), true);
});

test('pagehide 保存尚未抬笔的数据，离开后不残留自动保存监听', async t => {
  const page = await setup(t);
  const box = await page.locator('#mask-canvas').boundingBox();
  await page.mouse.move(box.x + 400, box.y + 400);
  await page.mouse.down();
  await page.mouse.move(box.x + 430, box.y + 440);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  assert.ok((await draft(page)).strokes[0].points.length > 1);
  await page.mouse.up();
  await page.evaluate(() => {
    module.runStageCleanup();
    module.state.progress.chapters.ch1.data.draft.name = '外部新草稿';
    window.dispatchEvent(new Event('pagehide'));
  });
  assert.equal((await draft(page)).name, '外部新草稿');
});

test('参考整体/眉眼/线条只改变 viewBox，Escape 及关闭按钮恢复焦点', async t => {
  const page = await setup(t);
  await page.locator('.mask-ref').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.locator('#lightbox-close').evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('[data-viewbox="0 0 200 240"]').evaluate(el => el === document.activeElement), true);
  const svg = page.locator('#mask-lightbox svg');
  const artwork = await svg.innerHTML();
  assert.equal(await svg.getAttribute('viewBox'), '0 0 200 240');
  await click(page, '[data-viewbox="40 75 120 55"]');
  assert.equal(await svg.getAttribute('viewBox'), '40 75 120 55');
  await click(page, '[data-viewbox="40 20 65 80"]');
  assert.equal(await svg.innerHTML(), artwork);
  assert.equal(await svg.getAttribute('viewBox'), '40 20 65 80');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#mask-lightbox').isVisible(), false);
  assert.equal(await page.locator('.mask-ref').evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Enter');
  await click(page, '#lightbox-close');
  assert.equal(await page.locator('.mask-ref').evaluate(el => el === document.activeElement), true);
});

test('清空确认带当前画布预览，取消不丢笔画，确认后重做恢复', async t => {
  const page = await setup(t);
  await dot(page);
  const png = await page.locator('#mask-canvas').evaluate(cv => cv.toDataURL());
  await page.locator('#mask-clear').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#mask-lightbox img').getAttribute('src'), png);
  assert.equal(await page.locator('[role="dialog"]').getAttribute('aria-label'), '清空作品确认');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#mask-save').isEnabled(), true);
  assert.equal(await page.locator('#mask-clear').evaluate(el => el === document.activeElement), true);
  await click(page, '#mask-clear');
  await click(page, '#clear-confirm');
  assert.equal(await page.locator('#mask-save').isDisabled(), true);
  await click(page, '#mask-redo');
  assert.equal(await page.locator('#mask-canvas').evaluate(cv => cv.toDataURL()), png);
});

for (const failure of ['failDB', 'failSave']) {
  test(`${failure}：保留画布、水印下载、重试后仅有一份新作且反馈无 base64`, async t => {
    const page = await setup(t);
    await dot(page);
    await page.locator('#mask-name').fill('我的测试作品');
    await page.evaluate(failure => { window[failure] = true; }, failure);
    await click(page, '#mask-save');
    await page.locator('#mask-download-current').waitFor();
    assert.equal(await page.locator('#mask-canvas').count(), 1);
    assert.ok((await page.locator('#mask-save-status').innerText()).includes('导出观察记录'));
    assert.equal(await page.evaluate(() => audit.done.length), 0);
    const download = page.waitForEvent('download');
    await click(page, '#mask-download-current');
    assert.equal((await download).suggestedFilename(), '我的测试作品.png');
    const labels = await page.evaluate(() => audit.labels);
    assert.ok(labels.includes('《我的测试作品》'));
    assert.ok(labels.includes('受英歌启发的个人创作 · 英歌 · 上场之前'));
    await page.evaluate(failure => { window[failure] = false; }, failure);
    await click(page, '#mask-retry');
    await page.locator('[data-feedback-work]').waitFor({ state: 'attached' });
    const id = await page.locator('[data-feedback-work]').getAttribute('data-feedback-work');
    const data = await page.evaluate(async id => ({ work: await module.getWork(id), works: await module.allWorks(),
      summary: module.state.progress.chapters.ch1.data.summary, stored: localStorage.getItem('yingge-progress'), index: module.state.works }), id);
    assert.equal(data.works.length, 1);
    assert.equal(data.index.length, 1);
    assert.equal(data.work.name, '我的测试作品');
    assert.equal(data.work.strokes.length, 1);
    assert.ok(data.work.png.startsWith('data:image/png;base64,'));
    assert.ok(!data.summary.includes('base64'));
    assert.ok(!data.stored.includes('base64'));
    assert.equal(await page.locator('a[href="#explore/wall/K02"]').count(), 1);
  });
}

test('示范立即可见三步 SVG 且保留 stage-advance / 展墙入口和原草稿', async t => {
  const page = await setup(t);
  await dot(page);
  await page.locator('#mask-name').fill('示范前草稿');
  await click(page, '#mask-demo');
  assert.equal(await page.locator('#stage-advance').isVisible(), true);
  assert.equal(await page.locator('figure svg').count(), 3);
  assert.equal(await page.locator('a[href="#explore/wall/K02"]').isVisible(), true);
  assert.equal((await draft(page)).name, '示范前草稿');
  assert.equal((await draft(page)).strokes.length, 1);
  assert.equal(await page.evaluate(() => module.state.progress.chapters.ch1.data.demo), true);
});

test('按 workID 编辑读取 IndexedDB；覆盖先确认，另存新作保留原作', async t => {
  const page = await setup(t);
  const original = await page.evaluate(() => seedWork());
  await page.locator('#mask-name').fill('不能静默丢失的草稿');
  await dot(page);
  await page.evaluate(() => { result(); location.hash = '#result'; });
  page.once('dialog', dialog => dialog.dismiss());
  await click(page, '[data-edit-work="original"]');
  await page.waitForFunction(() => !document.querySelector('[data-edit-work]').disabled);
  assert.equal((await draft(page)).name, '不能静默丢失的草稿');
  assert.ok(page.url().endsWith('#result'));
  page.once('dialog', dialog => { assert.ok(dialog.message().includes('覆盖草稿')); return dialog.accept(); });
  await click(page, '[data-edit-work="original"]');
  await page.waitForURL('**/#story/ch1/interact');
  const edit = await draft(page);
  assert.deepEqual(edit.strokes, original.strokes);
  assert.deepEqual(edit.seenRefs, original.refs);
  assert.equal(edit.name, original.name);
  assert.equal(edit.editOf, original.id);
  await page.evaluate(() => mount());
  assert.equal(await page.locator('#mask-name').inputValue(), '原作');
  assert.ok((await page.locator('#fixture').textContent()).includes('保存将生成新作品'));
  await page.locator('#mask-name').fill('原作的新版本');
  await click(page, '#mask-save');
  await page.locator('[data-feedback-work]').waitFor({ state: 'attached' });
  assert.deepEqual(await page.evaluate(() => module.getWork('original')), original);
  assert.equal(await page.evaluate(async () => (await module.allWorks()).length), 2);
});

test('编辑草稿 save=false 不导航、不覆盖旧草稿；作品缺失显示错误', async t => {
  const page = await setup(t);
  await page.evaluate(() => seedWork());
  await page.locator('#mask-name').fill('保留名称');
  await page.evaluate(() => { result(); location.hash = '#result'; window.failSave = true; });
  page.once('dialog', dialog => dialog.accept());
  await click(page, '[data-edit-work]');
  await page.waitForFunction(() => document.querySelector('[data-edit-status]').textContent.includes('未能保存'));
  assert.equal((await draft(page)).name, '保留名称');
  assert.ok(page.url().endsWith('#result'));
  await page.locator('[data-edit-work]').evaluate(el => { el.dataset.editWork = 'missing'; });
  await click(page, '[data-edit-work]');
  await page.waitForFunction(() => document.querySelector('[data-edit-status]').textContent.includes('未找到'));
  assert.equal((await draft(page)).name, '保留名称');
});

test('IndexedDB 首次打开失败后重试建立新连接', async t => {
  const page = await setup(t);
  await dot(page);
  await page.evaluate(() => {
    const original = indexedDB.open.bind(indexedDB);
    window.openCount = 0;
    indexedDB.open = (...args) => {
      openCount++;
      if (openCount === 1) throw new DOMException('暂时不可用', 'UnknownError');
      return original(...args);
    };
  });
  await click(page, '#mask-save');
  await page.locator('#mask-retry').waitFor();
  await click(page, '#mask-retry');
  await page.locator('[data-feedback-work]').waitFor();
  assert.equal(await page.evaluate(() => openCount), 2);
});

test('旧版作品编辑仍保留已到达探索阶段', async t => {
  const page = await setup(t);
  await page.evaluate(async () => {
    await seedWork();
    module.state.progress.chapters.ch1 = { stage: 'explore', data: {} };
    result();
  });
  page.on('dialog', dialog => dialog.accept());
  await click(page, '[data-edit-work]');
  await page.waitForFunction(() => module.state.progress.chapters.ch1.stage === 'interact');
  assert.equal(await page.evaluate(() => module.state.progress.chapters.ch1.reached), 'explore');
});

test('成果空作品直达 interact；回顾 reload 保持解释与首次/最近及真实入口', async t => {
  const page = await setup(t);
  await page.evaluate(() => result());
  assert.equal(await page.locator('.result-works .btn').getAttribute('href'), '#story/ch1/interact');
  for (const id of ['r1', 'r2', 'r3']) {
    await click(page, `.review-opt[data-q="${id}"][data-key="a"]`);
    await click(page, `.review-opt[data-q="${id}"][data-key="b"]`);
  }
  // 从 localStorage 重读并重新渲染，模拟 reload，不再次触发选择事件。
  await page.evaluate(() => { module.reloadState(); result(); });
  for (const [id, href] of Object.entries({ r1: '#explore/wall/K02', r2: '#story/ch2/interact', r3: '#story/ch3/interact' })) {
    const box = page.locator(`.review-q[data-q="${id}"]`);
    assert.equal(await box.locator('.review-feedback').isVisible(), true);
    assert.ok((await box.locator('.review-feedback').textContent()).includes('解释 B'));
    assert.equal(await box.locator('.review-feedback a[href="' + href + '"]').count(), 1);
    assert.equal(await box.locator('.review-hint').textContent(), '首次选择：首次选项 · 最近选择：最近选项');
  }
  assert.deepEqual(await page.evaluate(() => ({ first: module.state.result.review.r1.first, last: module.state.result.review.r1.last })), { first: 'a', last: 'b' });
});
