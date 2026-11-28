import { test, expect } from '@playwright/test';

const wall = '/yingge/index.html#explore/wall';
const index = { id: 'wall-work', name: '我的展墙脸谱', at: '2026-01-01', refs: ['K02'], observe: '原观察' };
const work = { ...index, chapter: 'ch1', strokes: [{ tool: 'brush', points: [[12, 18]] }],
  png: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=' };
const note = '眉眼的线条向外延伸';

// 在页面所属 origin 读写真正的作品库，等待事务提交，不调用被测保存函数。
function record(page, seed) {
  return page.evaluate(({ work, seed }) => new Promise((resolve, reject) => {
    const req = indexedDB.open('yingge-works', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('works', { keyPath: 'id' });
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('works', seed ? 'readwrite' : 'readonly');
      const store = tx.objectStore('works');
      const result = seed ? store.put(work) : store.get(work.id);
      tx.oncomplete = () => { db.close(); resolve(result.result) };
      tx.onabort = () => { db.close(); reject(tx.error) };
    };
  }), { work, seed });
}
const readIndex = page => page.evaluate(() => JSON.parse(localStorage.getItem('yingge-works')));

test.beforeEach(async ({ page }) => {
  await page.goto(wall);
  await expect(page.locator('#explore-body')).toBeVisible();
  await record(page, true);
  await page.evaluate(index => localStorage.setItem('yingge-works', JSON.stringify([index])), index);
  await page.reload();
  await expect(page.locator('#observe-detail')).toHaveValue(index.observe);
  await page.locator('#observe-detail').fill(note);
});

test('保存观察后刷新展墙与成果页可回读，保留作品其余字段', async ({ page }) => {
  await page.locator('#observe-save').click();
  await expect(page.locator('#observe-save')).toHaveText('已保存到作品记录');
  expect(await record(page, false)).toEqual({ ...work, observe: note });
  expect(await readIndex(page)).toEqual([{ ...index, observe: note }]);
  await page.reload();
  await expect(page.locator('#observe-detail')).toHaveValue(note);
  await page.goto('/yingge/index.html#result');
  await expect(page.locator('.result-work')).toContainText('我的观察：' + note);
});

test('作品写事务中止时不假报成功，原文保留且可直接重试', async ({ page }) => {
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const req = put.apply(this, args);
      if (this.name === 'works') { IDBObjectStore.prototype.put = put; this.transaction.abort() }
      return req;
    };
  });
  let failure = '';
  page.once('dialog', async dialog => { failure = dialog.message(); await dialog.dismiss() });
  const btn = page.locator('#observe-save');
  await btn.click();
  await expect.poll(() => failure).toContain('保存失败');
  await expect(btn).not.toHaveText('已保存到作品记录');
  await expect(page.locator('#observe-detail')).toHaveValue(note);
  expect(await record(page, false)).toEqual(work);
  expect(await readIndex(page)).toEqual([index]);
  await btn.click();
  await expect(btn).toHaveText('已保存到作品记录');
  expect(await record(page, false)).toEqual({ ...work, observe: note });
});

test('索引写入失败时区分部分保存，无需重输即可补存', async ({ page }) => {
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'yingge-works') {
        Storage.prototype.setItem = set;
        throw new DOMException('测试：索引不可写', 'QuotaExceededError');
      }
      return set.call(this, key, value);
    };
  });
  const btn = page.locator('#observe-save');
  await btn.click();
  await expect(btn).toContainText('索引未保存');
  expect(await record(page, false)).toEqual({ ...work, observe: note });
  expect(await readIndex(page)).toEqual([index]);
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect(btn).toHaveText('已保存到作品记录');
  expect(await readIndex(page)).toEqual([{ ...index, observe: note }]);
});
