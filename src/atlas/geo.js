/* 地图几何的纯函数层：不依赖 DOM，构建期脚本（scripts/generate-map.mjs）
   与浏览器运行时共用同一份投影与路径代码，保证预计算结果与交互重算一致。 */
import { feature as topoFeature } from 'topojson-client';
import { ATLAS_TERRITORIES, CITY_CULTURE, CULTURES, mapEntryFor } from './config.js';

/* 解码 TopoJSON：{gd: 广东21市 features, hkmo: 港澳 features} */
export function topoFeatures(topo) {
  return {
    gd: topoFeature(topo, topo.objects.gd).features,
    hkmo: topoFeature(topo, topo.objects.hkmo).features
  };
}

export function allFeatures(topo) {
  const parts = topoFeatures(topo);
  return parts.gd.concat(parts.hkmo);
}

/* 每个行政区的渲染档案：颜色、跳转目标、是否港澳 */
export function featureProfile(feature) {
  const code = feature.properties.adcode;
  const entry = mapEntryFor(code);
  const href = entry ? entry.href : null;
  if (ATLAS_TERRITORIES[code]) {
    return { code, isTerritory: true, ...ATLAS_TERRITORIES[code], href };
  }
  const key = CITY_CULTURE[code] || 'other';
  const culture = CULTURES[key];
  return {
    code,
    isTerritory: false,
    name: feature.properties.name.replace('市', ''),
    color: culture.color,
    dark: culture.dark,
    href
  };
}

export function ringsFor(feature) {
  const geometry = feature.geometry;
  return (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).flat();
}

/* 有限旋转 + 斜切投影：view = {angle, zoom, tilted}，与原 atlas.js 完全一致 */
export function createProjection(features, view) {
  const angle = view.angle * Math.PI / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const tilt = view.tilted ? 0.73 : 1;
  function raw(point) {
    const x = (point[0] - 113.5) * 100;
    const y = (23.1 - point[1]) * 108;
    return [x * cosine - y * sine, (x * sine + y * cosine) * tilt];
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  features.forEach(function (feature) {
    ringsFor(feature).forEach(function (ring) { ring.forEach(function (point) {
      const value = raw(point);
      minX = Math.min(minX, value[0]); maxX = Math.max(maxX, value[0]);
      minY = Math.min(minY, value[1]); maxY = Math.max(maxY, value[1]);
    }); });
  });
  const scale = Math.min(865 / (maxX - minX), 480 / (maxY - minY)) * view.zoom;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return function (point) {
    const value = raw(point);
    return [570 + (value[0] - cx) * scale, 332 + (value[1] - cy) * scale];
  };
}

export function topPath(feature, project) {
  return ringsFor(feature).map(function (ring) {
    return ring.map(function (point, index) {
      const xy = project(point);
      return (index ? 'L' : 'M') + xy[0].toFixed(2) + ',' + xy[1].toFixed(2);
    }).join(' ') + 'Z';
  }).join(' ');
}

export function wallsPath(feature, project, depth) {
  if (!depth) return '';
  return ringsFor(feature).map(function (ring) {
    const points = ring.map(project);
    return points.slice(0, -1).map(function (a, index) {
      const b = points[index + 1];
      return 'M' + a[0].toFixed(2) + ',' + a[1].toFixed(2) + 'L' + b[0].toFixed(2) + ',' + b[1].toFixed(2) + 'L' + b[0].toFixed(2) + ',' + (b[1] + depth).toFixed(2) + 'L' + a[0].toFixed(2) + ',' + (a[1] + depth).toFixed(2) + 'Z';
    }).join(' ');
  }).join(' ');
}

/* —— 紧凑点串 ↔ SVG path ——
   预计算产物用"环|环 环"的文本存投影后坐标，运行时拼装成 path，
   避免在产物里重复存顶面与侧壁两份几何。 */

export function ringsTextToRings(text) {
  return text.split('|').map(function (ring) {
    return ring.split(' ').map(function (pair) {
      const comma = pair.indexOf(',');
      return [parseFloat(pair.slice(0, comma)), parseFloat(pair.slice(comma + 1))];
    });
  });
}

export function ringsToTopPath(rings) {
  return rings.map(function (ring) {
    return ring.map(function (point, index) {
      return (index ? 'L' : 'M') + point[0].toFixed(2) + ',' + point[1].toFixed(2);
    }).join(' ') + 'Z';
  }).join(' ');
}

export function ringsToWallsPath(rings, depth) {
  if (!depth) return '';
  return rings.map(function (points) {
    return points.slice(0, -1).map(function (a, index) {
      const b = points[index + 1];
      return 'M' + a[0].toFixed(2) + ',' + a[1].toFixed(2) + 'L' + b[0].toFixed(2) + ',' + b[1].toFixed(2) + 'L' + b[0].toFixed(2) + ',' + (b[1] + depth).toFixed(2) + 'L' + a[0].toFixed(2) + ',' + (a[1] + depth).toFixed(2) + 'Z';
    }).join(' ');
  }).join(' ');
}

export function ringsTextToPaths(text, depth) {
  const rings = ringsTextToRings(text);
  return { top: ringsToTopPath(rings), walls: ringsToWallsPath(rings, depth) };
}
