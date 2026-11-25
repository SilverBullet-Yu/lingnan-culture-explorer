/* 英歌首页与详情共用的原创静物母版；正常 generate/build 不会恢复旧头图。 */
import { copyFileSync } from 'node:fs';
const source = new URL('../art/rehearsal.svg', import.meta.url);
const target = new URL('../../public/yingge/assets/yingge-hero.svg', import.meta.url);
copyFileSync(source, target);
console.log('yingge-hero.svg：排练前的鼓与双槌，已从原创母版生成。');
