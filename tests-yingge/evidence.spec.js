/* 英歌舞最小原型 v1.1 界面证据截图。
   仅经 `npm run evidence:yingge` 运行；产物写入 原型/资料区/验证/导航与功能清查-20261111/。
   覆盖五个视图（P01-P05）与关键互动状态。 */
import { test, expect } from '@playwright/test';

const DIR = '资料区/验证/导航与功能清查-20261111';

async function shot(page, name) {
  /* 等 View Transitions 柔转（0.18s）与字体稳定后再截，避免截到交叉渐变 */
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${name}`, fullPage: true });
}

async function gotoView(page, hash) {
  await page.goto(hash);
  await expect(page.locator('#app[aria-busy="false"]')).toBeVisible();
}

test('五视图证据截图（P01-P05）', async ({ page }) => {
  /* P01 文化地图：默认面板 */
  await gotoView(page, '/yingge/index.html#map');
  await expect(page.getByRole('heading', { name: '潮汕 · 英歌地图' })).toBeVisible();
  await shot(page, '01-P01文化地图.png');
  /* P01：点击潮汕后的英歌卡片 */
  await page.getByRole('link', { name: /汕头，查看英歌案例/ }).click();
  await expect(page.getByRole('complementary', { name: '地区内容面板' })).toContainText('普宁英歌 案例');
  await shot(page, '02-P01潮汕英歌卡片.png');

  /* P02 英歌详情 */
  await gotoView(page, '/yingge/index.html#detail');
  await expect(page.getByRole('heading', { name: '英歌', exact: true })).toBeVisible();
  await shot(page, '03-P02英歌详情.png');

  /* P03 第一章剧情与脸谱创作关卡 */
  await gotoView(page, '/yingge/index.html#story/ch1');
  await shot(page, '04-P03第一章剧情.png');
  await page.getByRole('button', { name: /开始关卡/ }).click();
  await expect(page.locator('#mask-canvas')).toBeVisible();
  await shot(page, '05-P03脸谱创作关卡.png');
  /* P03 第二章节奏练习 */
  await gotoView(page, '/yingge/index.html#story/ch2');
  await page.getByRole('button', { name: /开始关卡/ }).click();
  await page.locator('#rhythm-demo').click();
  await shot(page, '06-P03节奏示范.png');
  /* P03 第三章协作（播放后回放态） */
  await gotoView(page, '/yingge/index.html#story/ch3');
  await page.getByRole('button', { name: /开始关卡/ }).click();
  await page.getByRole('button', { name: '等鼓点，一起起步' }).click();
  await page.locator('#team-play').click();
  await page.waitForTimeout(2600);
  await shot(page, '07-P03协作动画.png');
  /* P03 第四章人物探索 */
  await gotoView(page, '/yingge/index.html#story/ch4');
  await page.getByRole('button', { name: /进入人物探索/ }).click();
  await expect(page.locator('.people-record')).toHaveCount(3);
  await shot(page, '08-P03人物探索.png');

  /* P04 四个知识场景 */
  await gotoView(page, '/yingge/index.html#explore/wall');
  await page.locator('.wall-face[data-ref="face-1"]').click();
  await expect(page.locator('#knowledge-panel')).toContainText('K01');
  await shot(page, '09-P04脸谱展墙.png');
  await gotoView(page, '/yingge/index.html#explore/sound');
  await page.locator('.object-card[data-k="K04"]').click();
  await shot(page, '10-P04声音与动作.png');
  await gotoView(page, '/yingge/index.html#explore/team');
  await page.locator('.object-card[data-k="K08"]').click();
  await shot(page, '11-P04队伍与排练.png');
  await gotoView(page, '/yingge/index.html#explore/people');
  await page.locator('.object-card[data-k="K10"]').click();
  await shot(page, '12-P04人物与传承.png');

  /* P05 故事成果 */
  await gotoView(page, '/yingge/index.html#result');
  await expect(page.getByRole('heading', { name: '我的上场观察册' })).toBeVisible();
  await shot(page, '13-P05故事成果.png');

  /* 手机竖屏对照（设计方案 §6） */
  await page.setViewportSize({ width: 375, height: 812 });
  await gotoView(page, '/yingge/index.html#story/ch1');
  await shot(page, '15-手机竖屏-故事.png');
  await gotoView(page, '/yingge/index.html#explore/wall');
  await shot(page, '16-手机竖屏-探索.png');
  await page.locator('.wall-face[data-k="K01"]').click();
  await shot(page, '17-手机竖屏-知识面板.png');
});
