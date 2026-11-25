/* 地图几何的纯函数层：不依赖 DOM，构建期脚本（scripts/generate-map.mjs）
   与浏览器运行时共用同一份投影与路径代码，保证预计算结果与运行时一致。
   （fork 自岭南漫游 atlas/geo.js：解码只保留广东 21 市，港澳已移除，
   投影边界随之只按广东省计算。） */
import { feature as topoFeature } from 'topojson-client';
import { CHAOSHAN_CODES, ZONE_COLORS } from './config.js';

/* 解码 TopoJSON：只取 {gd: 广东21市 features}（港澳对象线已从数据管线移除） */
export function allFeatures(topo) {
  return topoFeature(topo, topo.objects.gd).features;
}

/* 每个行政区的渲染档案：所属文化区（潮汕/其他）、颜色、名称 */
export function featureProfile(feature) {
  const code = feature.properties.adcode;
  const zone = CHAOSHAN_CODES[code] ? 'chaoshan' : 'other';
  const colors = ZONE_COLORS[zone];
  return {
    code,
    name: feature.properties.name.replace('市', ''),
    href: zone === 'chaoshan' ? '#map' : null,
    color: colors.color,
    dark: colors.dark
  };
}

export function ringsFor(feature) {
  const geometry = feature.geometry;
  return (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).flat();
}

/* 有限旋转 + 斜切投影：view = {angle, zoom, tilted}，与岭南漫游版完全一致 */
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
   预计算产物用“环|环 环”的文本存投影后坐标，运行时拼装成 path。 */

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
