/* 把 assets/ 下的 GeoJSON 全局脚本转换为单一 TopoJSON：
   - 去掉重复边界弧段与坐标冗余，体积约为原来的 1/8
   - 输出 src/data/geo.topo.json，运行时由 topojson-client 解码
   英歌原型只呈现潮汕四市：只保留广东线，港澳源数据线已随 Web-only
   收口移除（2026-11-08，git 历史可恢复）。
   数据源变动时重跑：npm run generate */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { topology } from 'topojson-server';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// 源文件是 "var GD_GEOJSON={...};" 形式的全局脚本，取首尾大括号之间解析
function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return JSON.parse(text.slice(start, end + 1));
}

const gd = extractJson(readFileSync(join(root, 'assets/guangdong.js'), 'utf8'));

const topo = topology({ gd }, 1e5);
const outDir = join(root, 'src', 'data');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'geo.topo.json');
writeFileSync(outPath, JSON.stringify(topo));

const kb = (JSON.stringify(topo).length / 1024).toFixed(1);
console.log(`geo.topo.json 已生成：${kb} KB（原 GeoJSON 合计 ${(
  JSON.stringify(gd).length / 1024
).toFixed(1)} KB）`);
