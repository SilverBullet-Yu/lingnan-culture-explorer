/* 构建期预计算默认视角的地图几何：
   把 atlas 默认视角（angle -10 / zoom 1 / 立体）下的投影坐标按紧凑点串存好
   （环用 | 分隔、点用空格、坐标用逗号，1 位小数），首屏拼装 path 即可绘制，
   不再执行投影运算；用户旋转/缩放/俯仰时再动态加载 TopoJSON 现算。
   生成物：src/generated/map-default.json */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allFeatures, createProjection, featureProfile, ringsFor } from '../src/atlas/geo.js';
import { ATLAS_STICKERS, ATLAS_TERRITORIES, CITY_LABEL_OFFSETS, DEFAULT_VIEW, VIEWBOX, WALL_DEPTH } from '../src/atlas/config.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const topo = JSON.parse(readFileSync(join(root, 'src', 'data', 'geo.topo.json'), 'utf8'));
const features = allFeatures(topo);
const project = createProjection(features, DEFAULT_VIEW);

const north = project([113.5, 24]);
const south = project([113.5, 23]);
const compassAngle = Math.atan2(north[0] - south[0], south[1] - north[1]) * 180 / Math.PI;

function ringsText(feature) {
  return ringsFor(feature).map(function (ring) {
    return ring.map(function (point) {
      const xy = project(point);
      return xy[0].toFixed(1) + ',' + xy[1].toFixed(1);
    }).join(' ');
  }).join('|');
}

const payload = {
  view: DEFAULT_VIEW,
  viewBox: VIEWBOX,
  depth: DEFAULT_VIEW.tilted ? WALL_DEPTH : 0,
  compassAngle: compassAngle,
  features: [],
  stickers: [],
  territories: []
};

features.forEach(function (feature) {
  const profile = featureProfile(feature);
  const item = {
    code: profile.code,
    name: profile.name,
    href: profile.href,
    color: profile.color,
    dark: profile.dark,
    isTerritory: profile.isTerritory,
    rings: ringsText(feature)
  };
  if (!profile.isTerritory) {
    const center = project(feature.properties.center);
    const offset = CITY_LABEL_OFFSETS[profile.code] || [0, 0];
    item.label = { x: center[0] + offset[0], y: center[1] + offset[1], text: profile.name };
  }
  payload.features.push(item);
});

ATLAS_STICKERS.forEach(function (sticker) {
  const point = project(sticker.coord);
  payload.stickers.push({ name: sticker.name, culture: sticker.culture, image: sticker.image, x: point[0], y: point[1] });
});

Object.keys(ATLAS_TERRITORIES).forEach(function (code) {
  const feature = features.find(function (item) { return String(item.properties.adcode) === code; });
  payload.territories.push({ code: code, x: project(feature.properties.center)[0], y: project(feature.properties.center)[1] });
});

const outDir = join(root, 'src', 'generated');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'map-default.json');
writeFileSync(outPath, JSON.stringify(payload));
const kb = (JSON.stringify(payload).length / 1024).toFixed(1);
console.log(`map-default.json 已生成：${kb} KB，${payload.features.length} 个行政区（默认视角几何已预计算）`);
