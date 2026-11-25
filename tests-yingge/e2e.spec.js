/* 英歌舞最小原型 · E2E 回归（对照《英歌舞最小原型设计方案》§19 验收表 T01-T12）。
   每个 test 使用独立 context（localStorage 互不可见），需要前置进度的用例
   通过 addInitScript 预置 yingge-progress。 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const VIEW = (page) => page.locator('#main-content');

/* 知识点与来源以种子数据为准：来源链接必须与 source_ref 指向的 URL 一致 */
const SEED = JSON.parse(fs.readFileSync(new URL('../public/yingge/assets/seed-data.json', import.meta.url), 'utf8'));
const SOURCE_BY_REF = Object.fromEntries(SEED.sources.map((s) => [s.ref, s]));

/* —— T01 从地图选择英歌 —— */
test('T01 从地图选择英歌：潮汕筛选正确，详情与案例一致', async ({ page }) => {
  await page.goto('/yingge/index.html#map');
  await expect(page.getByRole('heading', { name: '潮汕 · 英歌地图' })).toBeVisible();
  /* P01 收窄为潮汕单域：四个市均可点击并展开常驻的潮汕面板（2026-11-07 产品变更） */
  const panel = page.getByRole('complementary', { name: '地区内容面板' });
  /* 地图区域是凹多边形，取区域内第一个真实命中点做指针点击，验证「可见面可点」 */
  async function clickRegion(city) {
    const link = page.getByRole('link', { name: new RegExp(city + '，查看英歌案例') });
    await expect(link).toBeVisible();
    await link.scrollIntoViewIfNeeded();
    const pt = await link.evaluate(function (el) {
      const surface = el.querySelector('.atlas-surface');
      const r = surface.getBoundingClientRect();
      for (let gx = 0.05; gx <= 0.95; gx += 0.05) {
        for (let gy = 0.05; gy <= 0.95; gy += 0.05) {
          const x = r.left + r.width * gx;
          const y = r.top + r.height * gy;
          if (document.elementFromPoint(x, y) === surface) return { x: x, y: y };
        }
      }
      return null;
    });
    expect(pt, city + ' 区域应存在可点击的可见面').not.toBeNull();
    await page.mouse.click(pt.x, pt.y);
    await expect(panel).toContainText('民俗与节庆');
  }
  for (const city of ['汕头', '汕尾', '潮州', '揭阳']) await clickRegion(city);
  await clickRegion('汕头');
  await expect(panel).toContainText('普宁英歌 案例');
  await panel.getByRole('link', { name: /进入英歌/ }).click();
  await expect(page).toHaveURL(/#detail/);
  await expect(page.getByRole('heading', { name: '英歌', exact: true })).toBeVisible();
  await expect(VIEW(page)).toContainText('Ⅲ-8');
  await expect(VIEW(page)).toContainText('国家级非物质文化遗产代表性项目 · 传统舞蹈');
  await expect(page.getByRole('link', { name: /开始故事/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /直接探索/ })).toBeVisible();
});

/* —— T02 依次体验四章 —— */
test('T02 依次体验四章：剧情 互动 探索 成果完整衔接', async ({ page }) => {
  await page.goto('/yingge/index.html#story/ch1');
  await expect(VIEW(page)).toContainText('后天就要出队巡游了');
  /* 第一章：走示范路径（无需绘制） */
  await page.getByRole('button', { name: /开始关卡/ }).click();
  await expect(page.locator('#mask-canvas')).toBeVisible();
  await page.getByRole('button', { name: '观看创作示范' }).click();
  await expect(VIEW(page)).toContainText('这一步做完了');
  await page.getByRole('button', { name: /去脸谱展墙看看/ }).click();
  await expect(VIEW(page)).toContainText('自由探索 · 脸谱展墙');
  await page.getByRole('link', { name: /继续故事：共同节奏/ }).click();
  /* 第二章：完整一次练习（反馈先留在关卡内，用户点完成推进） */
  await page.getByRole('button', { name: /开始关卡/ }).click();
  await page.locator('#rhythm-demo').click();
  await expect(page.locator('#rhythm-start')).toBeVisible({ timeout: 20000 });
  await page.locator('#rhythm-start').click();
  await expect(page.locator('.rhythm-fb')).toHaveCount(8, { timeout: 25000 });
  await expect(VIEW(page)).toContainText('8 个点的反馈');
  await page.getByRole('button', { name: '完成本章 →' }).click();
  /* 第三章：播放一种协作结果后进入排练场 */
  await page.getByRole('button', { name: /去声音与动作看看/ }).click();
  await page.getByRole('link', { name: /继续故事：队伍协作/ }).click();
  await page.getByRole('button', { name: /开始关卡/ }).click();
  await page.locator('#team-play').click();
  await expect(page.locator('#team-go')).toBeVisible({ timeout: 10000 });
  await page.locator('#team-go').click();
  await expect(VIEW(page)).toContainText('这些配合，是一次次练出来的');
  /* 第四章：人物探索 → 成果 */
  await page.getByRole('button', { name: /去队伍与排练看看/ }).click();
  await page.getByRole('link', { name: /继续故事：今日传承/ }).click();
  await page.getByRole('button', { name: /进入人物探索/ }).click();
  await expect(page.locator('.people-record')).toHaveCount(3);
  await page.getByRole('link', { name: /整理我的观察册/ }).click();
  await expect(VIEW(page)).toContainText('我的上场观察册');
  /* 成果页记录四章进度（四个章节条目都已进行） */
  await expect(page.locator('.result-chapter.done')).toHaveCount(4);
});

/* —— T03 跳章与恢复 —— */
test('T03 跳至第三章再回第一章：显示前情，返回后恢复已有记录', async ({ page }) => {
  await page.addInitScript(function () {
    localStorage.setItem('yingge-progress', JSON.stringify({
      current: { chapter: 'ch1', stage: 'feedback' },
      chapters: { ch1: { stage: 'feedback', at: new Date().toISOString(), data: { done: true, summary: '<p>《测试》已保存。</p>' } } },
      explored: {}, interactions: {}, updatedAt: new Date().toISOString()
    }));
  });
  /* 直接跳第三章：显示前情与本章目标 */
  await page.goto('/yingge/index.html#story/ch3');
  await expect(VIEW(page)).toContainText('前情');
  await expect(VIEW(page)).toContainText('脸上的角色准备好了');
  await expect(VIEW(page)).toContainText('本章目标');
  /* 回第一章：恢复已有记录（停在反馈阶段） */
  await page.goto('/yingge/index.html#story/ch1');
  await expect(VIEW(page)).toContainText('《测试》已保存');
  await expect(VIEW(page)).toContainText('这一步做完了');
});

/* —— T04 绘制 撤销 保存 刷新 —— */
test('T04 绘制 撤销 保存 刷新：作品内容和名称恢复 可下载', async ({ page }) => {
  await page.goto('/yingge/index.html#story/ch1');
  await page.getByRole('button', { name: /开始关卡/ }).click();
  const canvas = page.locator('#mask-canvas');
  /* 画两笔 */
  for (const p of [[210, 230], [300, 260]]) {
    await canvas.evaluate(function (c, pt) {
      var r = c.getBoundingClientRect();
      function pev(type, x, y) { c.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true })) }
      pev('pointerdown', r.left + pt[0], r.top + pt[1]);
      pev('pointermove', r.left + pt[0] + 40, r.top + pt[1] + 30);
      pev('pointerup', r.left + pt[0] + 40, r.top + pt[1] + 30);
    }, p);
  }
  /* 撤销一笔 → 重做恢复 → 命名保存 */
  await page.getByRole('button', { name: '撤销' }).click();
  await page.getByRole('button', { name: '重做' }).click();
  await page.locator('#mask-name').fill('回归测试作品');
  await page.locator('#mask-save').click();
  await expect(VIEW(page)).toContainText('《回归测试作品》已保存');
  /* 刷新后作品与名称恢复（成果页 + 展墙对照 + 下载入口） */
  await page.reload();
  await page.goto('/yingge/index.html#result');
  await expect(page.locator('.result-work figcaption')).toContainText('《回归测试作品》');
  await expect(page.locator('[data-download]').first()).toBeVisible();
  await page.goto('/yingge/index.html#explore/wall');
  await expect(page.locator('#compare-mine img')).toHaveAttribute('src', /data:image\/png/, { timeout: 8000 });
});

/* —— T05 节奏点按反馈 —— */
test('T05 按提示测试早 准 晚点按：判定由点按时刻映射 慢速 900ms 生效', async ({ page }) => {
  /* 用 Playwright 假时钟控制 performance.now 与 setTimeout：点按时刻与 150ms 阈值精确对齐，
     不依赖真实计时，也不会因机器快慢产生偶发失败 */
  await page.clock.install();
  await page.goto('/yingge/index.html#story/ch2');
  await page.getByRole('button', { name: /开始关卡/ }).click();
  await page.locator('#rhythm-demo').click();
  await page.clock.runFor(13000); /* 示范片段 12.2 秒结束 */
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500); /* 暂停假时钟，之后只用 runFor 推进 */

  const tap = page.locator('#rhythm-tap');
  const point = (i) => page.locator(`.rhythm-point[data-point="${i}"]`);
  const verdicts = async () => (await page.locator('.rhythm-fb').allInnerTexts()).map((s) => s.replace(/^\d+\s*/, '').trim());

  /* 1. 原速：8 次点按全部落在点位时刻（偏差 0ms）→ 8 次「跟上了」
     点位时刻 = 300ms 启动偏移 + 4×600ms 准备拍 + i×600ms */
  await page.locator('#rhythm-start').click();
  let cursor = 0;
  for (let i = 0; i < 8; i++) {
    const at = 2700 + i * 600;
    await page.clock.runFor(at - cursor);
    cursor = at;
    await tap.click();
    await expect(point(i)).toHaveAttribute('data-verdict', '跟上了');
  }
  await page.clock.runFor(8000 - cursor + 100);
  expect(await verdicts()).toEqual(Array(8).fill('跟上了（0ms）'));

  /* 2. 原速：按真实时刻制造四类判定——第 2 点提前 200ms、第 3 点延后 200ms、
     第 4 点漏点，其余仍在点位时刻点按 */
  await page.locator('#rhythm-again').click();
  cursor = 0;
  const plan = [0, -200, 200, null, 0, 0, 0, 0];
  const expected = ['跟上了', '稍早', '稍晚', null, '跟上了', '跟上了', '跟上了', '跟上了'];
  for (let i = 0; i < 8; i++) {
    if (plan[i] === null) continue;
    const at = 2700 + i * 600 + plan[i];
    await page.clock.runFor(at - cursor);
    cursor = at;
    await tap.click();
    await expect(point(i)).toHaveAttribute('data-verdict', expected[i]);
  }
  await page.clock.runFor(8000 - cursor + 100);
  expect(await verdicts()).toEqual([
    '跟上了（0ms）', '稍早（-200ms）', '稍晚（+200ms）', '未点按',
    '跟上了（0ms）', '跟上了（0ms）', '跟上了（0ms）', '跟上了（0ms）'
  ]);

  /* 3. 慢速：相邻点位相差 900ms（在点位前 1ms 尚未激活，推进 1ms 后激活），
     同样在点位时刻点按应全部命中 */
  await page.locator('#rhythm-slow').click();
  cursor = 0;
  for (let i = 0; i < 8; i++) {
    const at = 3900 + i * 900; /* 300 + 4×900 + i×900 */
    if (i > 0) {
      await page.clock.runFor(at - 1 - cursor);
      cursor = at - 1;
      await expect(point(i)).not.toHaveClass(/active/);
      await page.clock.runFor(1);
      cursor = at;
    } else {
      await page.clock.runFor(at - cursor);
      cursor = at;
    }
    await expect(point(i)).toHaveClass(/active/);
    await tap.click();
    await expect(point(i)).toHaveAttribute('data-verdict', '跟上了');
  }
  await page.clock.runFor(12 * 900 + 800 - cursor + 100);
  expect(await verdicts()).toEqual(Array(8).fill('跟上了（0ms）'));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('yingge-progress')));
  expect(saved.chapters.ch2.data.rhythm.slow).toBe(true);
  expect(saved.chapters.ch2.data.rhythm.hits).toBe(8);
});

/* —— T06 协作两种结果 —— */
test('T06 播放两种协作结果：启动时刻与回放点位对应', async ({ page }) => {
  await page.goto('/yingge/index.html#story/ch3');
  await page.getByRole('button', { name: /开始关卡/ }).click();

  const scrub = page.locator('#team-scrub');
  const clock = page.locator('#team-clock');
  const players = page.locator('#team-players .team-player');
  const startX = (i) => 96 + i * 113;
  /* 立即模式：启动时刻 = i×260 + 120；等鼓点模式：全部 900 */
  const startAt = (i, cue) => (cue ? 900 : 120 + i * 260);
  const expectedY = (t, i, cue) => {
    const s = startAt(i, cue);
    const p = t < s ? 0 : Math.min(1, (t - s) / 800);
    return 196 - 92 * (p * p * (3 - 2 * p));
  };
  async function frame(t) {
    await scrub.evaluate(function (el, v) { el.value = String(v); el.dispatchEvent(new Event('input')) }, t);
  }
  async function readXY(i) {
    const tr = await players.nth(i).getAttribute('transform');
    const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(tr || '');
    return m ? [Number(m[1]), Number(m[2])] : [NaN, NaN];
  }

  /* 不等鼓点：六个启动时刻依次错开；进度条步长 10ms，取启动前 10ms 验证尚未启动 */
  for (let i = 0; i < 6; i++) {
    await frame(startAt(i, false) - 10);
    await expect(players.nth(i).locator('.team-start-at')).toHaveText('');
    await frame(startAt(i, false));
    await expect(players.nth(i).locator('.team-start-at')).toHaveText('已启动');
    await expect(page.locator('#team-launches line')).toHaveCount(i + 1);
  }
  /* 回放进度与时钟、点位同步：同一 t 下时钟读数为 t/1000，坐标按启动时刻与 800ms 移动时长计算 */
  for (const t of [0, 600, 920, 1200, 2000, 2400]) {
    await frame(t);
    await expect(clock).toHaveText((t / 1000).toFixed(1) + 's');
    for (let i = 0; i < 6; i++) {
      const [x, y] = await readXY(i);
      expect(x, `t=${t} 队员${i + 1} 的 x 坐标`).toBe(startX(i));
      expect(Math.abs(y - expectedY(t, i, false)), `t=${t} 队员${i + 1} 的 y 坐标`).toBeLessThanOrEqual(0.6);
      await expect(players.nth(i).locator('.team-start-at')).toHaveText(t >= startAt(i, false) ? '已启动' : '');
    }
    const started = Array.from({ length: 6 }, (_, i) => i).filter((i) => t >= startAt(i, false)).length;
    await expect(page.locator('#team-launches line')).toHaveCount(started);
  }
  /* 播放到结束：先回到 0 时刻再播放，避免读到上一次拖动留下的 2.4s 时钟 */
  await frame(0);
  await page.locator('#team-play').click();
  await expect(clock).toHaveText('2.4s', { timeout: 10000 });
  for (let i = 0; i < 6; i++) {
    const [, y] = await readXY(i);
    expect(Math.abs(y - 104), `结束帧队员${i + 1} 应到位`).toBeLessThanOrEqual(0.6);
  }
  await expect(page.locator('#team-links line')).toHaveCount(5);

  /* 等鼓点：共同提示在 600–899ms 亮起，900ms 六人同时启动（进度条步长 10ms，取 890） */
  await page.locator('.team-opt[data-mode="cue"]').click();
  await frame(890);
  await expect(page.locator('#team-cue')).toHaveClass(/on/);
  for (let i = 0; i < 6; i++) await expect(players.nth(i).locator('.team-start-at')).toHaveText('');
  await frame(900);
  await expect(page.locator('#team-cue')).not.toHaveClass(/on/);
  for (let i = 0; i < 6; i++) {
    await expect(players.nth(i).locator('.team-start-at')).toHaveText('已启动');
    const [, y] = await readXY(i);
    expect(Math.abs(y - 196), `启动瞬间队员${i + 1} 应在起点`).toBeLessThanOrEqual(0.6);
  }
  await expect(page.locator('#team-launches line')).toHaveCount(6);
  await frame(1200);
  await expect(clock).toHaveText('1.2s');
  for (let i = 0; i < 6; i++) {
    const [, y] = await readXY(i);
    expect(Math.abs(y - expectedY(1200, i, true)), `等鼓点 t=1200 队员${i + 1} 的 y 坐标`).toBeLessThanOrEqual(0.6);
  }
  await frame(0);
  await page.locator('#team-play').click();
  await expect(clock).toHaveText('2.4s', { timeout: 10000 });
  for (let i = 0; i < 6; i++) {
    const [, y] = await readXY(i);
    expect(Math.abs(y - 104), `等鼓点结束帧队员${i + 1} 应到位`).toBeLessThanOrEqual(0.6);
  }
});

/* —— T07 12 个知识点与收藏 —— */
test('T07 打开12个知识点并收藏：来源链接与 source_ref 一致 刷新后保留', async ({ page }) => {
  const panel = page.locator('#knowledge-panel');

  /* 每个面板：打开 → 断言来源链接 href 与 source_ref 指向的 URL 一致 → 收藏 */
  async function openK(id) {
    const k = SEED.knowledge.find((x) => x.id === id);
    await page.goto('/yingge/index.html#explore/' + k.scene);
    if (k.scene === 'wall') {
      if (id === 'K02') {
        /* K02 与 K01 同一对象，经「同一对象的其他知识点」进入 */
        await page.locator('.wall-face[data-ref="face-1"]').click();
        await page.locator('.k-sibling', { hasText: 'K02' }).click();
      } else {
        await page.locator(`.wall-face[data-ref="${k.object_ref}"]`).click();
      }
    } else {
      await page.locator(`.object-card[data-k="${id}"]`).click();
    }
    await expect(panel).toContainText(id);
    await expect(panel.locator('.knowledge-src a')).toHaveAttribute('href', SOURCE_BY_REF[k.source_ref].url);
  }

  for (const k of SEED.knowledge) {
    await openK(k.id);
    await expect(page.locator('#k-fav')).toHaveText('收藏');
    await page.locator('#k-fav').click();
    await expect(page.locator('#k-fav')).toHaveText('已收藏');
  }
  /* 12/12 探索与 12 条收藏；成果页列出全部 12 条 */
  await expect(page.locator('.explore-count')).toContainText('已探索 12 / 12');
  await expect(page.locator('.explore-count')).toContainText('收藏 12 条');
  await page.goto('/yingge/index.html#result');
  await expect(page.locator('.result-fav')).toHaveCount(12);

  /* 刷新后收藏保留：重新打开 12 个面板，按钮均为「已收藏」 */
  await page.reload();
  for (const k of SEED.knowledge) {
    await openK(k.id);
    await expect(page.locator('#k-fav')).toHaveText('已收藏');
  }
  await expect(page.locator('.explore-count')).toContainText('收藏 12 条');

  /* 收藏条目回跳原场景对象 */
  await page.goto('/yingge/index.html#result');
  await expect(page.locator('.result-fav')).toHaveCount(12);
  await page.locator('.result-fav', { hasText: 'K01' }).click();
  await expect(page).toHaveURL(/#explore\/wall\/K01/);
  await expect(panel).toContainText('K01');
  await expect(page.locator('#k-fav')).toHaveText('已收藏');
});

/* —— T08 关闭声音与报道引述 —— */
test('T08 关闭声音并查看报道引述：视觉练习可用 引述与出处对应', async ({ page }) => {
  await page.goto('/yingge/index.html#map');
  await page.getByRole('button', { name: '声音开' }).click();
  await expect(page.getByRole('button', { name: '声音关' })).toBeVisible();
  /* 声音关闭时练习仍可走视觉时间线（开始 → 8 点反馈） */
  await page.goto('/yingge/index.html#story/ch2');
  await page.getByRole('button', { name: /开始关卡/ }).click();
  await page.locator('#rhythm-demo').click();
  await page.locator('#rhythm-start').click();
  await expect(page.locator('.rhythm-fb')).toHaveCount(8, { timeout: 25000 });
  /* 第四章报道引述位：引述句、出处与非采录原声标注对应显示 */
  await page.goto('/yingge/index.html#story/ch4');
  await page.getByRole('button', { name: /进入人物探索/ }).click();
  await expect(page.locator('.people-voice')).toContainText('英歌舞有强大的生命力');
  await expect(page.locator('.people-voice')).toContainText('人民日报 2026-03-27');
  await expect(page.locator('.people-voice')).toContainText('非采录原声');
});

/* —— T09 回顾题 —— */
test('T09 完成回顾题并返回章节：解释出现 首次与最近答案保存', async ({ page }) => {
  await page.goto('/yingge/index.html#result');
  /* 第一次选「按演员自己的喜好自由配色」，再改为「按梁山泊英雄的形象与性格特征」 */
  await page.locator('.review-opt[data-q="r1"][data-key="preference"]').click();
  await expect(page.locator('.review-q[data-q="r1"] .review-feedback')).toContainText('颜色首先服务于');
  await page.locator('.review-opt[data-q="r1"][data-key="basis"]').click();
  await expect(page.locator('.review-q[data-q="r1"] .review-feedback')).toContainText('脸色与笔法依人物形象和性格');
  await expect(page.locator('.review-q[data-q="r1"] .review-hint')).toContainText('首次选择：按演员自己的喜好自由配色');
  await expect(page.locator('.review-q[data-q="r1"] .review-hint')).toContainText('最近选择：按梁山泊英雄的形象与性格特征');
  /* 返回相关章节链接可达 */
  await page.locator('.review-q[data-q="r1"]').getByRole('link', { name: /回到相关章节/ }).click();
  await expect(page).toHaveURL(/#story\/ch1/);
  /* 刷新后首次与最近答案保留 */
  await page.goto('/yingge/index.html#result');
  await page.reload();
  await expect(page.locator('.review-q[data-q="r1"] .review-hint')).toContainText('首次选择：按演员自己的喜好自由配色');
});

/* —— T10 关闭后再次进入 —— */
test('T10 关闭后再次进入：继续入口恢复章节与阶段', async ({ page }) => {
  await page.addInitScript(function () {
    localStorage.setItem('yingge-progress', JSON.stringify({
      current: { chapter: 'ch2', stage: 'explore' },
      chapters: { ch2: { stage: 'explore', at: new Date().toISOString(), data: { done: true } } },
      explored: {}, interactions: {}, updatedAt: new Date().toISOString()
    }));
  });
  /* 继续入口在详情页（裁剪掉「我的探索」后由详情承接） */
  await page.goto('/yingge/index.html#detail');
  await expect(VIEW(page)).toContainText('上次进行到：共同节奏');
  await page.getByRole('link', { name: '继续体验' }).click();
  await expect(page).toHaveURL(/#story\/ch2/);
  /* 恢复到记录的阶段（探索），并显示场景入口 */
  await expect(VIEW(page)).toContainText('自由探索 · 声音与动作');
});

/* —— T11 媒体失败与恢复 —— */
test('T11 模拟媒体失败与保存失败：摘要 重试 导出与继续入口可用', async ({ page }) => {
  /* 种子加载失败：失败页显示摘要与重试 */
  await page.route('**/seed-data.json', function (route) { route.abort() });
  await page.goto('/yingge/index.html#detail');
  await expect(page.locator('#seed-retry')).toBeVisible();
  await expect(page.locator('#main-content')).toContainText('种子数据加载失败');
  /* 解除拦截后重试恢复 */
  await page.unroute('**/seed-data.json');
  await page.locator('#seed-retry').click();
  await expect(page.getByRole('heading', { name: '英歌', exact: true })).toBeVisible({ timeout: 10000 });
  /* 保存失败时顶部保存条出现「导出观察记录」与「重试保存」（裁剪后唯一导出入口） */
  await expect(page.locator('#save-export')).toBeAttached();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('yingge-save', { detail: { ok: false } })));
  await expect(page.locator('#save-export')).toBeVisible();
  await expect(page.locator('#save-retry')).toBeVisible();
});

/* —— T12 手机点按与键盘 —— */
test('T12 手机点按与键盘操作：主要操作可达 焦点可见 内容完整', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/yingge/index.html#map');
  /* 主要操作在竖屏下可达：潮汕入口点击后进入详情 */
  await page.getByRole('link', { name: /汕头，查看英歌案例/ }).click();
  await page.getByRole('link', { name: /进入英歌/ }).click();
  await expect(page.getByRole('heading', { name: '英歌', exact: true })).toBeVisible();
  /* 主按钮触控高度接近 44px 下限（设计方案 §6；行高随字体浮动，≥40 视为达标） */
  const btn = page.getByRole('link', { name: /开始故事|继续体验/ });
  const box = await btn.boundingBox();
  expect(box && box.height >= 40).toBeTruthy();
  /* 窄屏栅格收口：各子页面与创作关不得横向溢出、创作关必须单列
     （guochao.css 末位加载曾覆盖 story.css 的 @media 降级，2026-11-08 修复） */
  for (const hash of ['#map', '#detail', '#story/ch1', '#explore/wall', '#result']) {
    await page.goto('/yingge/index.html' + hash);
    await page.locator('#app[aria-busy="false"]').waitFor({ timeout: 5000 });
    await page.waitForTimeout(150);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, hash + ' 窄屏横向溢出').toBeLessThanOrEqual(0);
  }
  await page.goto('/yingge/index.html#story/ch1');
  await page.locator('#stage-advance').evaluate(function (el) { el.click() });
  await page.locator('.mask-layout').waitFor({ timeout: 5000 });
  const maskCols = await page.locator('.mask-layout').evaluate(function (el) { return getComputedStyle(el).gridTemplateColumns });
  expect(maskCols.trim().split(/\s+/).length, '创作关窄屏应单列').toBe(1);
  /* 键盘可达：聚焦潮汕链接后 Enter 进入 */
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/yingge/index.html#map');
  await page.getByRole('link', { name: /潮州，查看英歌案例/ }).focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('complementary', { name: '地区内容面板' });
  await expect(panel).toContainText('民俗与节庆');
});

/* 三张自绘脸谱的头颈结构、成人眼裂比例和纯矢量约束 */
test('T13 三张脸谱保持纯矢量和图像语义，头颈与眼部比例完整', async ({ page }) => {
  await page.goto('/yingge/index.html#explore/wall');
  const faces = page.locator('.wall-face > svg');
  await expect(faces).toHaveCount(3);
  for (const face of await faces.all()) {
    await expect(face).toHaveAttribute('viewBox', '0 0 200 240');
    await expect(face).toHaveAttribute('role', 'img');
    await expect(face).toHaveAttribute('aria-label', '参考脸谱示意图');
    await expect(face.locator('image, foreignObject, script')).toHaveCount(0);
    await expect(face.locator('.face-neck')).toHaveCount(1);
    await expect(face.locator('.face-ear')).toHaveCount(2);
    await expect(face.locator('.face-eye-opening')).toHaveCount(2);
    const geometry = await face.evaluate(function (svg) {
      /* 统一到根SVG坐标，避免局部缩放后比例断言仍假通过。 */
      function bounds(el) {
        const box = el.getBBox(), matrix = svg.getCTM().inverse().multiply(el.getCTM());
        const points = [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]
          .map(function (p) { return new DOMPoint(p[0], p[1]).matrixTransform(matrix) });
        const xs = points.map(function (p) { return p.x }), ys = points.map(function (p) { return p.y });
        return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), y: Math.min(...ys) };
      }
      const head = bounds(svg.querySelector('.face-head'));
      const eyes = Array.from(svg.querySelectorAll('.face-eye-opening')).map(bounds);
      const ids = Array.from(svg.querySelectorAll('[id]')).map(function (el) { return el.id });
      const refs = Array.from(svg.querySelectorAll('*')).flatMap(function (el) {
        return Array.from(el.attributes).flatMap(function (attr) {
          return Array.from(attr.value.matchAll(/url\(#([^)]*)\)/g)).map(function (m) { return m[1] });
        });
      });
      return { head: { width: head.width, height: head.height }, eyes, localRefs: refs.every(function (id) { return ids.includes(id) }) };
    });
    expect(geometry.head.height / geometry.head.width).toBeGreaterThan(1.35);
    for (const eye of geometry.eyes) {
      expect(eye.width / geometry.head.width).toBeGreaterThan(.17);
      expect(eye.width / geometry.head.width).toBeLessThan(.23);
      expect(eye.height / eye.width).toBeLessThan(.43);
      expect(eye.y).toBeGreaterThan(97);
      expect(eye.y).toBeLessThan(112);
    }
    expect(geometry.localRefs).toBe(true);
  }
  const ids = await faces.evaluateAll(function (svgs) {
    return svgs.flatMap(function (svg) { return Array.from(svg.querySelectorAll('[id]')).map(function (el) { return el.id }) });
  });
  expect(new Set(ids).size).toBe(ids.length);
});
