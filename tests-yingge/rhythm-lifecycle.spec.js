/* 独立运行：node --test tests-yingge/rhythm-lifecycle.spec.js
   不运行项目 build/generate，也不改 Playwright 配置；真实 Edge DOM + 虚拟时钟。
   载入原始 rhythm/store/flow，只将 ESM 链接替换为同作用域绑定；popEl 仅计数。
   WebAudio 桩记录真实合成函数的图节点、时间与停止动作，末例使用真实 AudioContext。 */
import { test as nodeTest, before as nodeBefore, after as nodeAfter } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium, test as playwrightTest } from '@playwright/test';

/* 同时兼容现有 playwright test 自动发现，避免独立 Node 用例干扰默认测试入口。 */
const standalone = !!process.env.NODE_TEST_CONTEXT;
const before = standalone ? nodeBefore : playwrightTest.beforeAll;
const after = standalone ? nodeAfter : playwrightTest.afterAll;
const test = standalone ? nodeTest : (name, fn) => playwrightTest(name, async () => {
  const finalizers = [];
  try { await fn({ after: (cleanup) => finalizers.push(cleanup) }); }
  finally { for (const cleanup of finalizers.reverse()) await cleanup(); }
});

const load = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/\bexport (?=function|var)/g, '');
const source = load('../yingge/src/store.js') + '\n' + load('../yingge/src/story/flow.js')
  + '\nfunction popEl(el) { el.dataset.pops = String(+(el.dataset.pops || 0) + 1) }\n'
  + load('../yingge/src/story/rhythm.js');
let browser;
before(async () => { browser = await chromium.launch({ channel: 'msedge', headless: true }); });
after(async () => { if (browser) await browser.close(); });

async function setup(t, { shared = false, saved = null, audio = 'fake' } = {}) {
  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  await page.route('http://rhythm.test/**', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<header><button id="sound">声音</button></header><main id="fixture"></main>'
      + '<input id="input"><textarea id="textarea"></textarea><select id="select"><option>A</option></select>'
      + '<div id="editor" contenteditable="true"><span>编辑</span></div><button id="other">其他</button>',
  }));
  await page.goto('http://rhythm.test/#story/ch2');
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:00Z'));
  await page.evaluate(({ source, shared, saved, audio }) => {
    window.audit = { contexts: [], starts: [], stops: [], gains: [], done: [] };
    if (audio === 'absent') {
      window.AudioContext = window.webkitAudioContext = undefined;
    } else if (audio !== 'real') {
      class Audio {
        constructor() {
          if (audio === 'throws') throw new Error('Audio unavailable');
          this.state = audio === 'rejects' ? 'suspended' : 'running';
          this.sampleRate = 48000;
          this.destination = {};
          window.audit.contexts.push(this);
        }
        get currentTime() { return performance.now() / 1000; }
        createGain() {
          const gain = { gain: { value: 1, setValueAtTime(value, at) {
            this.value = value;
            window.audit.gains.push({ value, at });
          }, exponentialRampToValueAtTime() {} }, connect() { return this; } };
          return gain;
        }
        node(kind) {
          const ctx = this;
          return {
            frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
            connect() { return this; }, disconnect() {},
            start(at) { window.audit.starts.push({ kind, at, now: ctx.currentTime }); },
            stop(at) { window.audit.stops.push({ kind, at: at ?? null, now: ctx.currentTime }); },
          };
        }
        createOscillator() { return this.node('drum'); }
        createBufferSource() { return this.node('stick'); }
        createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
        resume() { return Promise.reject(new Error('Resume denied')); }
        close() { this.state = 'closed'; return Promise.resolve(); }
      }
      window.AudioContext = Audio;
    }
    const module = new Function(source + '\nreturn { mountRhythm, mountSoundDemo, setSound, soundOn, interactionData, saveInteractionData, reloadState };')();
    window.module = module;
    document.querySelector('#sound').onclick = () => module.setSound(!module.soundOn());
    if (saved) module.saveInteractionData('ch2', { done: true, rhythm: saved });
    window.cleanups = [];
    window.mount = () => shared
      ? cleanups.push(module.mountSoundDemo(document.querySelector('#fixture')))
      : module.mountRhythm(document.querySelector('#fixture'), 'ch2', {
        registerCleanup: (fn) => cleanups.push(fn), done: (html) => audit.done.push(html),
      });
    window.cleanup = () => cleanups.splice(0).forEach((fn) => fn());
    window.hide = (hidden) => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    window.mount();
  }, { source, shared, saved, audio });
  return page;
}
const click = (page, selector) => page.locator(selector).evaluate((el) => el.click());
const advance = (page, ms) => page.clock.runFor(ms);
const stats = (page) => page.evaluate(() => ({
  starts: audit.starts.length,
  drums: audit.starts.filter((s) => s.kind === 'drum').length,
  stopped: audit.stops.filter((s) => s.at === null).length,
  contexts: audit.contexts.length,
  closed: audit.contexts.filter((c) => c.state === 'closed').length,
  future: audit.starts.filter((s) => s.at > s.now).length,
}));
async function ready(page) {
  await click(page, '#rhythm-demo');
  await advance(page, 12000);
  assert.equal(await page.locator('#rhythm-start').count(), 1);
}
async function key(page, { repeat = false, target = '#rhythm-tap' } = {}) {
  return page.locator(target).evaluate((el, repeat) => {
    el.focus();
    const event = new KeyboardEvent('keydown', { code: 'Space', key: ' ', repeat, bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event.defaultPrevented;
  }, repeat);
}

test('示范逐拍合成、禁止重入；顶栏立即停止尾音，静音仍有视觉，再开不补播', async (t) => {
  const page = await setup(t);
  await click(page, '#rhythm-demo');
  assert.equal(await page.locator('#rhythm-demo').isDisabled(), true);
  await page.locator('#rhythm-demo').evaluate((el) => { el.onclick(); el.onclick(); });
  assert.deepEqual(await stats(page), { starts: 2, drums: 1, stopped: 0, contexts: 1, closed: 0, future: 0 });
  await click(page, '#sound');
  assert.equal((await stats(page)).stopped, 2);
  assert.equal(await page.evaluate(() => audit.gains.at(-1).value), 0);
  await advance(page, 1800);
  assert.equal((await stats(page)).starts, 2);
  assert.match(await page.locator('#rhythm-caption').textContent(), /4\/20/);
  await click(page, '#sound');
  await advance(page, 600);
  assert.equal((await stats(page)).drums, 2);
  assert.equal((await stats(page)).future, 0);
  await advance(page, 9600);
  assert.equal(await page.locator('#rhythm-start').count(), 1);
});

test('示范和练习隐藏即关闭声音；返回不播放，必须重新开始，清理幂等', async (t) => {
  const page = await setup(t);
  await click(page, '#rhythm-demo');
  await page.evaluate(() => hide(true));
  let before = await stats(page);
  assert.equal(before.closed, 1);
  await advance(page, 20000);
  await page.evaluate(() => hide(false));
  assert.deepEqual(await stats(page), before);
  assert.equal(await page.locator('#rhythm-start').count(), 1);
  await click(page, '#rhythm-start');
  assert.equal(await page.locator('#rhythm-tap').evaluate((el) => el === document.activeElement), true);
  await advance(page, 300);
  await page.evaluate(() => hide(true));
  before = await stats(page);
  await advance(page, 12000);
  assert.deepEqual(await stats(page), before);
  assert.equal(await page.evaluate(() => module.interactionData('ch2').done), undefined);
  await page.evaluate(() => { hide(false); cleanup(); cleanup(); });
  await click(page, '#sound');
  await click(page, '#sound');
  await advance(page, 20000);
  assert.deepEqual(await stats(page), before);
});

test('600ms/4准备拍/8点/150ms；过滤长按与输入控件，按窗口反馈，持久化有符号时间差', async (t) => {
  const page = await setup(t);
  await ready(page);
  await click(page, '#rhythm-start');
  const baseline = (await stats(page)).starts;
  await advance(page, 2100);
  assert.equal((await stats(page)).starts - baseline, 4);
  assert.match(await page.locator('#rhythm-caption').textContent(), /准备 1/);
  await advance(page, 450); // 第一目标 -150ms：判为 hit
  await key(page);
  await advance(page, 550); // 第二目标 -200ms
  await click(page, '#rhythm-tap');
  await advance(page, 1000); // 第三目标 +200ms
  await click(page, '#rhythm-tap');
  await advance(page, 400); // 第四目标：repeat，距离上次输入远超120ms
  assert.equal(await key(page, { repeat: true }), true);
  for (const target of ['#input', '#textarea', '#select', '#editor', '#other']) {
    assert.equal(await key(page, { target }), false);
  }
  await advance(page, 300);
  assert.equal(await page.locator('[data-point="3"]').getAttribute('data-verdict'), '未点按');
  await advance(page, 300); // 第五目标正点
  await page.locator('#rhythm-tap').focus();
  await page.keyboard.press('Space'); // 验证真实键盘的 keyup 不再产生一次点击
  await advance(page, 600); // 第六目标，两个重复 click 只匹配一次
  await click(page, '#rhythm-tap');
  await click(page, '#rhythm-tap');
  await advance(page, 751); // 第七目标 +151ms
  await click(page, '#rhythm-tap');
  await advance(page, 449); // 第八目标正点
  await key(page);
  await advance(page, 1100);
  const result = await page.evaluate(() => module.interactionData('ch2').rhythm);
  assert.deepEqual(result, {
    slow: false, hits: 4,
    verdicts: ['hit', 'early', 'late', 'miss', 'hit', 'hit', 'late', 'hit'],
    diffs: [-150, -200, 200, null, 0, 0, 151, 0],
  });
  assert.equal(await page.locator('.rhythm-fb').count(), 8);
  assert.equal(await page.locator('.rhythm-point.done').count(), 8);
  const html = await page.locator('#rhythm-result').innerHTML();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('yingge-progress')).chapters.ch2.data.rhythm), result);
  await page.evaluate(() => { cleanup(); module.reloadState(); mount(); });
  assert.equal(await page.locator('#rhythm-result').innerHTML(), html);
  assert.equal(await page.locator('#rhythm-result').isVisible(), true);
  assert.match(html, /-150ms/);
  assert.match(html, /\+151ms/);
  assert.equal(await page.locator('a[href="#explore/sound"]').count(), 1);
  await click(page, '#rhythm-done');
  assert.match(await page.evaluate(() => audit.done[0]), /跟上了」4 个/);
  await click(page, '#rhythm-demo3'); // 回顾可重播
  assert.equal(await page.locator('#rhythm-demo3').isDisabled(), true);
});

test('练习逐拍读取声音设置，慢速900ms保留150ms判据及隐藏后慢速重新开始', async (t) => {
  const saved = { slow: false, hits: 0, verdicts: Array(8).fill('miss'), diffs: Array(8).fill(null) };
  const page = await setup(t, { saved });
  await click(page, '#rhythm-slow');
  await advance(page, 300);
  await click(page, '#sound');
  const muted = (await stats(page)).starts;
  await advance(page, 3600);
  assert.equal((await stats(page)).starts, muted);
  assert.match(await page.locator('#rhythm-caption').textContent(), /第 1 点/);
  await advance(page, 150);
  await key(page);
  await click(page, '#sound');
  await advance(page, 900);
  await key(page);
  await advance(page, 8950);
  assert.deepEqual(await page.evaluate(() => module.interactionData('ch2').rhythm.diffs.slice(0, 2)), [150, 150]);
  assert.equal(await page.evaluate(() => module.interactionData('ch2').rhythm.slow), true);
  await click(page, '#rhythm-slow');
  await page.evaluate(() => { hide(true); hide(false); });
  await click(page, '#rhythm-start');
  await advance(page, 2700);
  assert.match(await page.locator('#rhythm-caption').textContent(), /准备 2/);
  await advance(page, 1200);
  assert.match(await page.locator('#rhythm-caption').textContent(), /第 1 点/);
});

test('兼容旧verdicts记录，不伪造时间差；无完整历史时不伪造8点结果', async (t) => {
  const page = await setup(t, { saved: { slow: true, hits: 1, verdicts: ['hit', ...Array(7).fill('miss')] } });
  assert.equal(await page.locator('.rhythm-fb').count(), 8);
  assert.match(await page.locator('.rhythm-fb').first().textContent(), /时间差未记录/);
  await page.evaluate(() => {
    cleanup();
    module.saveInteractionData('ch2', { done: true, rhythm: { hits: 6 } });
    mount();
  });
  assert.equal(await page.locator('.rhythm-fb').count(), 0);
  assert.match(await page.locator('#rhythm-caption').textContent(), /旧记录未保存/);
});

test('共享播放器12秒20拍，播放/暂停/继续/重播，静音视觉与生命周期清理', async (t) => {
  const page = await setup(t, { shared: true });
  assert.equal((await stats(page)).starts, 0);
  await click(page, '[data-demo-play]');
  await advance(page, 1250);
  assert.equal((await stats(page)).drums, 3);
  await click(page, '[data-demo-play]');
  const paused = await stats(page);
  await advance(page, 5000);
  assert.deepEqual(await stats(page), paused);
  await click(page, '[data-demo-play]');
  await advance(page, 549);
  assert.equal((await stats(page)).drums, 3);
  await advance(page, 1);
  assert.equal((await stats(page)).drums, 4);
  await advance(page, 10200);
  assert.equal((await stats(page)).drums, 20);
  assert.match(await page.locator('[data-demo-caption]').textContent(), /播放完毕/);
  await click(page, '[data-demo-replay]');
  assert.match(await page.locator('[data-demo-caption]').textContent(), /1\/20/);
  await click(page, '#sound');
  const muted = (await stats(page)).drums;
  await advance(page, 600);
  assert.equal((await stats(page)).drums, muted);
  assert.match(await page.locator('[data-demo-caption]').textContent(), /2\/20/);
  await page.evaluate(() => hide(true));
  await advance(page, 20000);
  await page.evaluate(() => hide(false));
  assert.match(await page.locator('[data-demo-play]').textContent(), /开始播放/);
  await click(page, '#sound');
  const hidden = await stats(page);
  await advance(page, 1000);
  assert.deepEqual(await stats(page), hidden);
  await click(page, '[data-demo-play]');
  assert.match(await page.locator('[data-demo-caption]').textContent(), /1\/20/);
  await page.evaluate(() => { cleanup(); cleanup(); });
  const cleaned = await stats(page);
  await advance(page, 20000);
  await click(page, '#sound');
  await click(page, '#sound');
  assert.deepEqual(await stats(page), cleaned);
  assert.equal(await page.locator('[data-demo-play]').isDisabled(), true);
});

for (const audio of ['absent', 'throws', 'rejects']) {
  test(`音频不可用(${audio})明确文字降级，视觉完整继续且无未处理异常`, async (t) => {
    const page = await setup(t, { shared: true, audio });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await click(page, '[data-demo-play]');
    assert.match(await page.locator('[data-demo-audio]').textContent(), /音频不可用/);
    await advance(page, 600);
    assert.match(await page.locator('[data-demo-caption]').textContent(), /2\/20/);
    await advance(page, 11400);
    assert.match(await page.locator('[data-demo-caption]').textContent(), /播放完毕/);
    assert.deepEqual(errors, []);
  });
}

test('真实WebAudio冒烟：创建并启动振荡器和噪声，隐藏后关闭AudioContext', async (t) => {
  const page = await setup(t, { shared: true, audio: 'real' });
  await page.evaluate(() => {
    const AC = window.AudioContext;
    window.realContexts = [];
    window.realNodes = [];
    window.AudioContext = class extends AC {
      constructor() { super(); realContexts.push(this); }
      createOscillator() { const node = super.createOscillator(); realNodes.push(node); return node; }
      createBufferSource() { const node = super.createBufferSource(); realNodes.push(node); return node; }
    };
  });
  await page.locator('[data-demo-play]').click();
  await advance(page, 600);
  assert.equal(await page.evaluate(() => realContexts[0].state), 'running');
  assert.ok(await page.evaluate(() => realNodes.some((n) => n instanceof OscillatorNode)));
  assert.ok(await page.evaluate(() => realNodes.some((n) => n instanceof AudioBufferSourceNode)));
  await page.evaluate(() => hide(true));
  assert.equal(await page.evaluate(() => realContexts[0].state), 'closed');
});
