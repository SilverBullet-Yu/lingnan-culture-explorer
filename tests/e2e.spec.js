/* 岭南漫游 MVP V1.0 回归断言：两条路线、每条 3 个场景、每条 3 道任务。
   覆盖场景三项完成门槛、文字稿降级、状态持久、路线完成与撤销、潮汕主应用入口。
   英歌 iframe 子应用的独立回归见 tests-yingge/。 */
import { test, expect } from '@playwright/test';

const APP = '/?map=svg';
const PROGRESS = 'lingnan-progress';
const STEPS = 'lingnan-scene-steps';
const RESULTS = 'lingnan-task-results';
const ROUTE_DONE = 'lingnan-route-completed';
const NOTES = 'lingnan-notes';
const FAVORITES = 'lingnan-favorites';

async function ls(page, key) {
  return page.evaluate((k) => localStorage.getItem(k), key);
}
async function jsonKey(page, key) {
  const raw = await ls(page, key);
  return raw ? JSON.parse(raw) : null;
}
function acceptDialogs(page) {
  page.on('dialog', (d) => d.accept());
}
async function readAndUnderstand(page, sceneId) {
  await page.goto(APP + '#scene/' + sceneId);
  const read = page.locator('[data-scene-read="' + sceneId + '"]');
  await expect(read).toBeVisible();
  if (await read.isEnabled()) await read.click();
  await expect.poll(async () => {
    const steps = await jsonKey(page, STEPS);
    return steps?.[sceneId]?.read === true;
  }).toBeTruthy();
  const choice = page.locator('#scene-interaction [data-understanding]').first();
  await expect(choice).toBeVisible();
  await choice.click();
  const submit = page.locator('[data-understanding-submit="' + sceneId + '"]');
  if (await submit.isEnabled()) await submit.click();
  await expect.poll(async () => {
    const steps = await jsonKey(page, STEPS);
    return steps?.[sceneId]?.interaction === true;
  }).toBeTruthy();
}
async function completeByAudio(page, sceneId) {
  await readAndUnderstand(page, sceneId);
  await page.locator('audio[data-audio-kind="required"]').evaluate((audio) => {
    audio.dispatchEvent(new Event('ended', { bubbles: false }));
  });
  await expect.poll(async () => {
    const steps = await jsonKey(page, STEPS);
    return steps?.[sceneId]?.audio === true;
  }).toBeTruthy();
  await expect.poll(async () => {
    const progress = await jsonKey(page, PROGRESS);
    return Boolean(progress?.[sceneId]);
  }).toBeTruthy();
}
async function completeByFallback(page, sceneId) {
  await readAndUnderstand(page, sceneId);
  await page.locator('[data-scene-fallback]').click();
  await expect.poll(async () => {
    const steps = await jsonKey(page, STEPS);
    return steps?.[sceneId]?.fallback === true;
  }).toBeTruthy();
  await expect.poll(async () => {
    const progress = await jsonKey(page, PROGRESS);
    return Boolean(progress?.[sceneId]);
  }).toBeTruthy();
}
async function submitTask(page, sceneId) {
  await page.goto(APP + '#scene/' + sceneId);
  await page.locator('#task-card .option').first().click();
  await page.locator('#task-submit').click();
  await expect(page.locator('#task-result')).toBeVisible();
}

const mapRegionLinks = {
  440100: '#region/region-gz',
  440500: '#region/region-cz', 441500: '#region/region-cz', 445100: '#region/region-cz', 445200: '#region/region-cz',
  440600: '#region/region-fs', 441400: '#region/region-mz', 810000: '#region/region-hk', 820000: '#region/region-mo',
};

async function expectSvgEntries(page) {
  const areas = page.locator('.atlas-svg .atlas-region');
  await expect(areas).toHaveCount(23);
  const entries = await areas.evaluateAll((nodes) => Object.fromEntries(nodes.filter((node) => node.hasAttribute('href'))
    .map((node) => [node.getAttribute('data-adcode'), node.getAttribute('href')])));
  expect(entries).toEqual(mapRegionLinks);
  const displayOnly = page.locator('.atlas-svg [data-adcode="440300"]');
  await expect(displayOnly).toHaveAttribute('aria-label', /仅地图展示/);
  expect(await displayOnly.getAttribute('tabindex')).toBeNull();
}

test('完整地图 SVG 首次进入与旋转保留全部地块，只提供指定地区入口', async ({ page }) => {
  await page.goto(APP + '#atlas');
  await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.atlas-eyebrow')).toHaveText('岭南游纪 · 山海之间');
  await expectSvgEntries(page);
  const before = await page.locator('.atlas-surface').first().getAttribute('d');
  await page.locator('[data-map-action="rotate-right"]').click();
  await expect(page.locator('.atlas-surface').first()).not.toHaveAttribute('d', before);
  await expectSvgEntries(page);
});

test('地图图例区分学习与简介，文化圈入口不冒充地区学习', async ({ page }) => {
  await page.goto(APP + '#atlas');
  const legend = page.locator('.replica-legend');
  for (const href of new Set(Object.values(mapRegionLinks))) {
    const kind = /-(gz|cz)$/.test(href) ? '进入学习' : '地区简介';
    await expect(legend.locator(`a[href="${href}"]`)).toContainText(kind);
  }
  await expect(legend.locator('a[href^="#culture/"]')).toHaveCount(3);
  for (const link of await legend.locator('a[href^="#culture/"]').all()) {
    await expect(link).toContainText('文化介绍');
  }
  const legendRows = await legend.locator('.replica-legend-row').evaluateAll((nodes) =>
    nodes.map((node) => [node.getAttribute('href'), node.textContent]));

  await page.addInitScript(() => {
    const create = document.createElementNS.bind(document);
    document.createElementNS = (namespace, tag, ...options) => {
      if (namespace === 'http://www.w3.org/2000/svg' && tag === 'svg') throw new Error('模拟地图 SVG 初始化失败');
      return create(namespace, tag, ...options);
    };
  });
  await page.reload();
  const fallback = page.locator('.atlas-fallback');
  await expect(fallback).toBeVisible();
  const fallbackRows = await fallback.locator('.replica-legend-row').evaluateAll((nodes) =>
    nodes.map((node) => [node.getAttribute('href'), node.textContent]));
  expect(fallbackRows).toEqual(legendRows);
});

test('首屏与地区边界：广州、潮汕开放，其余四地未开放', async ({ page }) => {
  await page.goto(APP);
  await expect(page.locator('.brand')).toContainText('岭南');
  await expect(page.locator('.immersive-home .atlas-region')).toHaveCount(23);
  await page.goto(APP + '#regions');
  await expect(page.locator('.region-card')).toHaveCount(6);
  await expect(page.locator('.region-card.region-locked')).toHaveCount(4);
  await expect(page.locator('.region-card:not(.region-locked)')).toHaveCount(2);
  await page.goto(APP + '#region/region-cz');
  await expect(page.locator('h1')).toContainText('潮汕');
  await expect(page.locator('.region-status')).toHaveCount(0);
  await expect(page.locator('a[href^="#route/"]')).toHaveCount(1);
  await expect(page.getByText('英歌上场前', { exact: true })).toBeVisible();
});

test('路线详情：两条路线各 3 个场景和 3 道任务', async ({ page }) => {
  for (const [routeId, name] of [['route-arcade-market', '骑楼与市井'], ['route-yingge-before', '英歌上场前']]) {
    await page.goto(APP + '#route/' + routeId);
    await expect(page.locator('h1')).toContainText(name);
    await expect(page.locator('.timeline').first()).toBeVisible();
    await expect(page.locator('.timeline a[href^="#scene/"]')).toHaveCount(6);
    await expect(page.getByRole('heading', { name: '3 个场景', exact: true })).toBeVisible();
    await expect(page.getByText('本路线共 3 道任务', { exact: false })).toBeVisible();
    expect(await page.locator('a[href^="#scene/"]').count()).toBeGreaterThanOrEqual(6);
  }
});

test('场景完成门槛：图文、理解动作、完整声音可持久化', async ({ page }) => {
  await page.goto(APP + '#scene/scene-gz-qilou');
  await page.locator('[data-scene-read]').click();
  await expect(page.locator('[data-step-state="read"]')).toHaveText('已完成');
  await page.locator('#scene-interaction [data-understanding]').first().click();
  await page.locator('[data-understanding-submit]').click();
  await expect(page.locator('[data-step-state="interaction"]')).toHaveText('已完成');
  expect((await jsonKey(page, PROGRESS))?.['scene-gz-qilou']).toBeFalsy();
  await page.locator('audio[data-audio-kind="required"]').evaluate((audio) => audio.dispatchEvent(new Event('ended')));
  await expect.poll(async () => Boolean((await jsonKey(page, PROGRESS))?.['scene-gz-qilou'])).toBeTruthy();
  await page.reload();
  await expect(page.locator('[data-scene-read]')).toBeDisabled();
  await expect(page.locator('[data-step-state="audio"]')).toContainText('已播放完整');
  await expect(page.locator('.scene-status-tag')).toContainText('已完成');
});

test('场景降级：先读图文，再用文字稿替代声音', async ({ page }) => {
  await completeByFallback(page, 'scene-cz-yingge-role');
  const steps = await jsonKey(page, STEPS);
  const progress = await jsonKey(page, PROGRESS);
  expect(steps?.['scene-cz-yingge-role']).toMatchObject({ read: true, interaction: true, fallback: true });
  expect(progress?.['scene-cz-yingge-role']).toMatchObject({ done: true, mode: 'fallback' });
  await page.reload();
  await expect(page.locator('[data-scene-fallback]')).toBeDisabled();
  await expect(page.locator('[data-scene-completion]')).toContainText('降级完成');
});

test('任务守卫：路线三场景未完成前不能提交，全部完成后可提交对应任务', async ({ page }) => {
  await page.goto(APP + '#scene/scene-gz-qilou');
  await expect(page.locator('#task-submit')).toBeDisabled();
  await completeByAudio(page, 'scene-gz-qilou');
  await page.goto(APP + '#scene/scene-gz-qilou');
  await expect(page.locator('#task-submit')).toBeDisabled();
  await completeByAudio(page, 'scene-gz-xiguan');
  await completeByFallback(page, 'scene-gz-street');
  await page.goto(APP + '#scene/scene-gz-qilou');
  await expect(page.locator('#task-submit')).toBeEnabled();
  await page.locator('#task-card .option').first().click();
  await page.locator('#task-submit').click();
  await expect(page.locator('#task-result')).toContainText(/回答正确|回答错误/);
  expect((await jsonKey(page, RESULTS))?.['task-gz-1']).toBeTruthy();
});

test('路线完成：三场景完成且三题提交后记录成果', async ({ page }) => {
  for (const sid of ['scene-gz-qilou', 'scene-gz-xiguan']) await completeByAudio(page, sid);
  await completeByFallback(page, 'scene-gz-street');
  for (const sid of ['scene-gz-qilou', 'scene-gz-xiguan', 'scene-gz-street']) await submitTask(page, sid);
  const done = await jsonKey(page, ROUTE_DONE);
  expect(done?.['route-arcade-market']).toBeTruthy();
  await page.goto(APP + '#route/route-arcade-market');
  await expect(page.getByText('「骑楼与市井」已完成')).toBeVisible();
  await expect(page.getByText('提交任务 3 次', { exact: false })).toBeVisible();
});

test('潮汕路线完成：无旁白场景使用文字稿替代完成', async ({ page }) => {
  await completeByFallback(page, 'scene-cz-yingge-role');
  await completeByFallback(page, 'scene-cz-yingge-team');
  await completeByFallback(page, 'scene-cz-yingge-legacy');
  for (const sid of ['scene-cz-yingge-role', 'scene-cz-yingge-team', 'scene-cz-yingge-legacy']) await submitTask(page, sid);
  expect((await jsonKey(page, ROUTE_DONE))?.['route-yingge-before']).toBeTruthy();
  await page.goto(APP + '#region/region-cz');
  await expect(page.getByText('英歌上场前', { exact: true })).toBeVisible();
});

test('删除场景记录：清除步骤和任务结果，并撤销路线成果', async ({ page }) => {
  acceptDialogs(page);
  for (const sid of ['scene-gz-qilou', 'scene-gz-xiguan']) await completeByAudio(page, sid);
  await completeByFallback(page, 'scene-gz-street');
  for (const sid of ['scene-gz-qilou', 'scene-gz-xiguan', 'scene-gz-street']) await submitTask(page, sid);
  expect((await jsonKey(page, ROUTE_DONE))?.['route-arcade-market']).toBeTruthy();
  await page.goto(APP + '#me');
  await page.locator('button[data-remove]').first().click();
  await expect.poll(async () => Object.keys((await jsonKey(page, ROUTE_DONE)) || {}).length).toBe(0);
  const progress = await jsonKey(page, PROGRESS);
  const steps = await jsonKey(page, STEPS);
  expect(Object.keys(progress || {})).toHaveLength(2);
  expect(Object.keys(steps || {})).toHaveLength(2);
  const results = await jsonKey(page, RESULTS);
  expect(Object.keys(results || {})).toHaveLength(2);
});

test('刷新恢复与清空：步骤状态和路线结果可清除，设置保留', async ({ page }) => {
  acceptDialogs(page);
  await completeByFallback(page, 'scene-cz-yingge-role');
  await page.goto(APP + '#me');
  await page.locator('#clear-all').click();
  await expect(page.locator('.grid.cols4').getByText('0/6')).toBeVisible({ timeout: 10000 });
  expect(Object.keys((await jsonKey(page, PROGRESS)) || {})).toHaveLength(0);
  expect(Object.keys((await jsonKey(page, STEPS)) || {})).toHaveLength(0);
  expect(Object.keys((await jsonKey(page, RESULTS)) || {})).toHaveLength(0);
});

test('场景答疑与异常地址：审核回答、范围兜底和空提交提示', async ({ page }) => {
  await page.goto(APP + '#scene/scene-cz-yingge-role');
  await page.locator('.qa-suggest-btn').first().click();
  await expect(page.locator('#qa-result')).toContainText('来源');
  await page.locator('#qa-input').fill('今天股市行情如何？');
  await page.locator('#qa-form button[type="submit"]').click();
  await expect(page.locator('#qa-result')).toContainText('当前内容暂未覆盖');
  await page.locator('#qa-input').fill('');
  await page.locator('#qa-form button[type="submit"]').click();
  await expect(page.locator('#qa-result')).toContainText('请先输入一个问题');
  await page.goto(APP + '#scene/not-real');
  await expect(page.getByText(/没有找到这个/)).toBeVisible();
});

/* ---------- 操作级局部更新（收藏 / 笔记 / 任务） ---------- */
test('收藏局部更新：Tab 到按钮、Enter 触发后焦点仍在原按钮', async ({ page }) => {
  await page.goto(APP + '#scene/scene-gz-qilou');
  const favBtn = page.locator('[data-fav="scene-gz-qilou"]');
  await expect(favBtn).toHaveText('收藏场景');
  await page.locator('.crumb a').first().focus();
  let reached = false;
  for (let i = 0; i < 80; i++) {
    if (await favBtn.evaluate((el) => el === document.activeElement)) {
      reached = true;
      break;
    }
    await page.keyboard.press('Tab');
  }
  expect(reached).toBe(true);
  await page.keyboard.press('Enter');
  await expect(favBtn).toHaveText('已收藏场景');
  await expect(favBtn).toBeFocused();
  expect(await jsonKey(page, FAVORITES)).toContain('scene-gz-qilou');
});

test('笔记局部更新：收藏与保存不丢草稿和光标，保存提示就地更新', async ({ page }) => {
  await page.goto(APP + '#scene/scene-gz-qilou');
  const note = page.locator('#note-text');
  const draft = '想问：骑楼柱廊为什么能遮雨';
  await note.fill(draft);
  await note.evaluate((el) => el.setSelectionRange(4, 4));
  await page.locator('[data-fav="scene-gz-qilou"]').click();
  await expect(note).toHaveValue(draft);
  expect(await note.evaluate((el) => el.selectionStart)).toBe(4);
  const save = page.locator('[data-note="scene-gz-qilou"]');
  await save.focus();
  await page.keyboard.press('Enter');
  await expect(save).toHaveText('更新笔记');
  await expect(save).toBeFocused();
  await expect(page.locator('.card', { has: page.locator('#note-text') }).locator('p.muted')).toContainText('最后更新：');
  expect((await jsonKey(page, NOTES))?.['scene-gz-qilou']?.text).toBe(draft);
});

test('播放中收藏：音频元素未被重建，播放不中断', async ({ page }) => {
  await page.goto(APP + '#scene/scene-gz-qilou');
  const player = page.locator('[data-audio-player]').filter({ has: page.locator('audio[data-audio-kind="required"]') });
  await player.locator('.play').click();
  await expect.poll(async () => page.evaluate(() => {
    const a = document.querySelector('audio[data-audio-kind="required"]');
    return a ? !a.paused && a.currentTime > 0 : false;
  })).toBeTruthy();
  const before = await page.evaluate(() => {
    const a = document.querySelector('audio[data-audio-kind="required"]');
    window.__audioEl = a;
    return { t: a.currentTime };
  });
  await page.locator('[data-fav="scene-gz-qilou"]').click();
  const after = await page.evaluate(() => {
    const a = document.querySelector('audio[data-audio-kind="required"]');
    return { same: a === window.__audioEl, paused: a.paused, t: a.currentTime };
  });
  expect(after.same).toBe(true);
  expect(after.paused).toBe(false);
  expect(after.t).toBeGreaterThanOrEqual(before.t);
});

test('我的探索：移除收藏与保存笔记均为局部更新', async ({ page }) => {
  await page.goto(APP + '#scene/scene-gz-qilou');
  await page.locator('[data-fav="scene-gz-qilou"]').click();
  await page.locator('#note-text').fill('场景笔记草稿');
  await page.locator('[data-note="scene-gz-qilou"]').click();
  await page.goto(APP + '#me');
  await expect(page.locator('#fav-count')).toHaveText('1');
  const remove = page.locator('.record [data-fav="scene-gz-qilou"]');
  await remove.focus();
  await page.keyboard.press('Enter');
  await expect(remove).toHaveCount(0);
  await expect(page.locator('#fav-count')).toHaveText('0');
  await expect(page.locator('.card', { hasText: '收藏的场景' })).toContainText('暂无收藏。');
  expect(await page.evaluate(() => document.activeElement?.classList.contains('card'))).toBe(true);
  await page.locator('[data-note-edit="scene-gz-qilou"]').click();
  await page.locator('#edit-note-text').fill('改过的笔记');
  await page.locator('[data-note-save="scene-gz-qilou"]').click();
  await expect(page.locator('[data-note-edit="scene-gz-qilou"]')).toBeFocused();
  await expect(page.getByText('改过的笔记')).toBeVisible();
  await expect(page.locator('[data-note-save="scene-gz-qilou"]')).toHaveCount(0);
});

test('文化圈图片：收藏不跳转或丢失焦点，并在我的探索保留入口', async ({ page }) => {
  await page.goto(APP + '#culture/guangfu');
  const photo = page.locator('.culture-photo');
  const source = photo.getByRole('link', { name: /文化资料/ });
  const favorite = photo.getByRole('button', { name: /收藏图片/ });
  await expect(source).toBeVisible();
  await expect(photo.locator('a button, button a')).toHaveCount(0);
  await source.focus();
  await page.keyboard.press('Tab');
  await expect(favorite).toBeFocused();
  await page.keyboard.press('Enter');
  const saved = photo.getByRole('button', { name: /已收藏/ });
  await expect(saved).toBeFocused();
  await expect(saved).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/#culture\/guangfu$/);
  await page.goto(APP + '#me');
  await expect(page.getByRole('link', { name: '广府文化 · 图文卡' })).toHaveAttribute('href', '#culture/guangfu');
});

test('跳到主要内容：焦点落到主内容、history 不增长、页面不重渲', async ({ page }) => {
  const cases = [
    ['首页', APP],
    ['地区页', APP + '#regions'],
    ['场景页', APP + '#scene/scene-gz-qilou'],
    ['404', APP + '#no-such-page'],
  ];
  for (const [name, url] of cases) {
    /* 每条用例都从新文档进入：同文档 hash 跳转会保留上一页的焦点起点，Tab 无法回到页首 */
    await page.goto('about:blank');
    await page.goto(url);
    await expect(page.locator('#app'), name).toHaveAttribute('aria-busy', 'false');
    const skip = page.locator('a.skip-link');
    await page.keyboard.press('Tab');
    await expect(skip, name).toBeFocused();
    await page.evaluate(() => {
      window.__appChild = document.querySelector('#app > div');
    });
    const before = await page.evaluate(() => ({ len: history.length, hash: location.hash }));
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content'), name).toBeFocused();
    const after = await page.evaluate(() => ({
      len: history.length,
      hash: location.hash,
      same: window.__appChild === document.querySelector('#app > div'),
    }));
    expect(after.len, name).toBe(before.len);
    expect(after.hash, name).toBe(before.hash);
    expect(after.same, name).toBe(true);
    await page.keyboard.press('Tab');
    const next = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        inMain: !!el && document.getElementById('main-content').contains(el),
        tag: el ? el.tagName : '',
      };
    });
    expect(next.inMain, name).toBe(true);
    expect(['A', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'SUMMARY'], name).toContain(next.tag);
  }
});

test('任务提交局部更新：结果就地出现，焦点与笔记草稿保留', async ({ page }) => {
  for (const sid of ['scene-gz-qilou', 'scene-gz-xiguan']) await completeByAudio(page, sid);
  await completeByFallback(page, 'scene-gz-street');
  await page.goto(APP + '#scene/scene-gz-qilou');
  /* 同文档 hash 导航在 View Transitions 下晚一帧提交 DOM，等新页标题出现再填草稿 */
  await expect(page.locator('.scene-cover h1')).toContainText('骑楼柱廊');
  const note = page.locator('#note-text');
  await note.fill('任务草稿');
  await note.evaluate((el) => el.setSelectionRange(2, 2));
  await page.locator('#task-card .option').first().click();
  const submit = page.locator('#task-submit');
  await submit.focus();
  await page.evaluate(() => { window.__taskCard = document.querySelector('#task-card'); });
  await page.keyboard.press('Enter');
  await expect(page.locator('#task-result')).toBeVisible();
  await expect(page.locator('#task-result')).toContainText(/回答正确|回答错误/);
  await expect(submit).toHaveText('重新提交');
  await expect(submit).toBeFocused();
  expect(await page.evaluate(() => window.__taskCard === document.querySelector('#task-card'))).toBe(true);
  await expect(note).toHaveValue('任务草稿');
  expect(await note.evaluate((el) => el.selectionStart)).toBe(2);
  expect((await jsonKey(page, RESULTS))?.['task-gz-1']).toBeTruthy();
});
