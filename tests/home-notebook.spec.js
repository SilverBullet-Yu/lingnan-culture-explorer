import { expect, test } from '@playwright/test';

const routes = [
  ['广州 · 骑楼', '骑楼与市井', 'route-arcade-market'],
  ['普宁 · 英歌', '英歌上场前', 'route-yingge-before'],
];

for (const [width, height] of [[1440,900],[1366,768],[390,844]]) {
  test('地点手记可点选、切换并实际进入两条路线 '+width, async ({ browser, baseURL }) => {
    test.setTimeout(65000);
    const mobile=width===390;
    const page=await browser.newPage({baseURL,viewport:{width,height},hasTouch:mobile,isMobile:mobile,reducedMotion:'reduce'});
    const faults=[];page.on('pageerror', e=>faults.push(e.message));
    try {
      await page.goto('/');
      await expect(page.locator('#atlas3d-slot canvas')).toBeVisible({timeout:30000});
      const note=page.locator('#home-location-note');
      await expect(note).toBeHidden();
      for(const [label,title,id] of routes){
        const marker=page.getByRole('button',{name:label,exact:true});
        await expect(marker).toBeVisible();
        if(mobile)await marker.tap();
        else await marker.press('Enter');
        await expect(note.getByRole('heading')).toHaveText(title);
        await expect(marker).toHaveAttribute('aria-pressed','true');
        await expect(page.locator('.n-marker[aria-pressed=true]')).toHaveCount(1);
        const link=note.getByRole('link',{name:/进入路线/});
        if(!mobile)await expect(link).toBeFocused();
        const box=await note.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x+box.width).toBeLessThanOrEqual(width);
        expect(box.y+box.height).toBeLessThanOrEqual(height);
        await link.click();
        await expect(page).toHaveURL(new RegExp('#route/'+id+'$'));
        await expect(page.locator('main h1')).toContainText(title);
        await page.goBack();
        await expect(page.locator('.immersive-home')).toBeVisible();
        await expect(note).toBeHidden();
      }
      expect(faults).toEqual([]);
    } finally {await page.close();}
  });
}
