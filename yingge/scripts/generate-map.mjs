/* 构建期预计算默认视角的地图几何（fork 自岭南漫游同名脚本，裁去贴纸与港澳锚点）：
   把默认视角（angle -10 / zoom 1 / 立体）下的投影坐标按紧凑点串存好
   （环用 | 分隔、点用空格、坐标用逗号，1 位小数），首屏拼装 path 即可绘制。
   英歌原型的地图不提供旋转/缩放交互，运行时无需再加载 TopoJSON 现算。
   P01 只呈现潮汕四市（2026-11-07 用户定版）：投影边界只按四市拟合，
   地图自动放大居中；普宁（揭阳代管，案例所在地）坐标一并预计算。
   生成物：src/generated/map-default.json */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allFeatures, createProjection, featureProfile, ringsFor } from '../src/atlas/geo.js';
import { CHAOSHAN_CODES, CITY_LABEL_OFFSETS, DEFAULT_VIEW, VIEWBOX, WALL_DEPTH } from '../src/atlas/config.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const topo = JSON.parse(readFileSync(join(root, 'src', 'data', 'geo.topo.json'), 'utf8'));
const features = allFeatures(topo).filter(function (feature) {
  return Boolean(CHAOSHAN_CODES[feature.properties.adcode]);
});
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
  puning: (function () {
    const xy = project([116.17, 23.3]); /* 普宁市区概略位置（案例标注点） */
    return { x: +xy[0].toFixed(1), y: +xy[1].toFixed(1) };
  })(),
  features: []
};

features.forEach(function (feature) {
  const profile = featureProfile(feature);
  const item = {
    code: profile.code,
    name: profile.name,
    href: profile.href,
    color: profile.color,
    dark: profile.dark,
    rings: ringsText(feature)
  };
  const center = project(feature.properties.center);
  const offset = CITY_LABEL_OFFSETS[profile.code] || [0, 0];
  item.label = { x: center[0] + offset[0], y: center[1] + offset[1], text: profile.name };
  payload.features.push(item);
});

const outDir = join(root, 'src', 'generated');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'map-default.json');
writeFileSync(outPath, JSON.stringify(payload));
const kb = (JSON.stringify(payload).length / 1024).toFixed(1);
console.log(`map-default.json 已生成：${kb} KB，${payload.features.length} 个行政区（默认视角几何已预计算）`);
