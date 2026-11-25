/* 路由 → 镜头位姿（方案 1「镜头即路由」）
   每个路由给一组镜头位姿：注视点（经纬度）、俯仰角、方位角、视距。
   首页是「俯瞰广东」总览；进入地区/文化/路线/场景时镜头俯冲到对应地点。 */
import { scene as sceneById, routeById } from '../store.js';

/* 地区 → 所属城市（与 seed 数据的 region_id 对应） */
const REGION_CITY = {
  'region-gz': '广州', 'region-fs': '佛山', 'region-cz': '潮州',
  'region-mz': '梅州', 'region-hk': '香港', 'region-mo': '澳门'
};
/* 文化圈 → 代表城市（镜头落点） */
const CULTURE_CITY = { guangfu: '广州', kejia: '梅州', chaoshan: '潮州' };

export function cityForRegion(regionId){ return REGION_CITY[regionId] || null; }

function coordsOf(atlas, city){
  if (!city || !atlas || !atlas.cityCenter) return null;
  return atlas.cityCenter(city);
}

export function poseFor(route, param, atlas){
  const center = (atlas && atlas.landCenter) ? atlas.landCenter() : [113.3, 23.4];
  const overview = { key: 'overview', target: center, elev: 76, azim: 0, fit: 'land', margin: 0.99 };

  if (route === 'home') return Object.assign({}, overview, { key: 'home' });

  if (route === 'culture'){
    const point = coordsOf(atlas, CULTURE_CITY[param]);
    if (point) return { key: 'culture:' + param, target: point, elev: 62, azim: -8, radius: 44 };
    return overview;
  }

  if (route === 'region'){
    const point = coordsOf(atlas, REGION_CITY[param]);
    if (point) return { key: 'region:' + param, target: point, elev: 58, azim: -6, radius: 36 };
    return overview;
  }

  if (route === 'route'){
    const route = routeById(param);
    const points = [];
    if (route && Array.isArray(route.scene_ids)){
      route.scene_ids.forEach(function (id){
        const item = sceneById(id);
        if (!item) return;
        const point = coordsOf(atlas, REGION_CITY[item.region_id]);
        if (point) points.push(point);
      });
    }
    if (points.length){
      const lon = points.reduce(function (sum, p) { return sum + p[0]; }, 0) / points.length;
      const lat = points.reduce(function (sum, p) { return sum + p[1]; }, 0) / points.length;
      return { key: 'route:' + param, target: [lon, lat], elev: 66, azim: -4,
        fitPoints: points, routePath: points };
    }
    return overview;
  }

  if (route === 'scene'){
    const item = sceneById(param);
    const point = item ? coordsOf(atlas, REGION_CITY[item.region_id]) : null;
    if (point) return { key: 'scene:' + param, target: point, elev: 50, azim: 0, radius: 26 };
    return overview;
  }

  return overview;
}
