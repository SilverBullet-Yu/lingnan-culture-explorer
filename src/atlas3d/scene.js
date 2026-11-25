/* 三维地图场景（阶段 1 · 镜头即路由）
   —— 全部用 Three.js r187 WebGPURenderer；无 WebGPU 时自动回退 WebGL 2。
   几何口径沿用 map-spike 已验证的 A2+/B1 结论：沙盘托盘、小岛平铺（<0.15° 不挤出）、
   东南远海岛礁不入图、城市名锚定领地内切圆极点、澳门引线到海上。
   区别于试点：DOM 标签/贴纸改用相机矩阵直接投影，不再需要 echarts-gl 那套内部相机 API。 */
import * as THREE from 'three/webgpu';
import { feature as topoFeature } from 'topojson-client';
import { CULTURES, CITY_CULTURE, ATLAS_TERRITORIES, atlasPaperFor, ATLAS_STICKERS, MAP_CULTURE_LABEL, mapEntryFor } from '../atlas/config.js';

/* 世界坐标：1° ≈ 8 单位；z 轴朝北为负 */
const LON0 = 113.5, LAT0 = 23.1, S = 8;
const sx = (lon) => (lon - LON0) * S;
const sy = (lat) => (lat - LAT0) * S;

const LAND_H = 3.0;      /* 陆地挤出高度 */
const EMBED = 0.8;       /* 陆地嵌入托盘侧壁的深度 */
const TRAY_H = 1.6;      /* 沙盘托盘厚度 */
const FLAT_H = 0.55;     /* 平铺小岛高出托盘的高度 */
const FLAT_MAX_DEG = 0.15;
const NEAR_SHORE = { lonMin: 109.5, lonMax: 117.5, latMin: 21.4, latMax: 25.6 };
const PLATE_BOUNDS = [109.3, 19.9, 117.75, 25.9];
const LABEL_OFFSETS = { 820000: [30, 22] };   /* 澳门引出偏移 */
const LEADER_SET = { 820000: 1 };
const STICKER_CITY = { '虾饺':'广州', '肠粉':'江门', '烧鹅':'茂名', '酿豆腐':'河源', '盐焗鸡':'惠州', '围龙屋':'梅州', '工夫茶':'潮州', '牛肉丸':'汕头', '蚝烙':'汕尾' };

function stripName(n){ return String(n).replace(/特别行政区$/, '').replace(/市$/, ''); }
function polysOf(geom){ return geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates]; }
function ringBBox(ring){
  let a = [Infinity, Infinity], b = [-Infinity, -Infinity];
  for (const p of ring){ a[0] = Math.min(a[0], p[0]); a[1] = Math.min(a[1], p[1]); b[0] = Math.max(b[0], p[0]); b[1] = Math.max(b[1], p[1]); }
  return [a, b];
}
function pointInRing(x, y, ring){
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++){
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function ringArea(ring){
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return a / 2;
}
function segDist(px, py, ax, ay, bx, by){
  const dx = bx - ax, dy = by - ay;
  let t = (dx || dy) ? ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy) : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px, qy = ay + dy * t - py;
  return Math.hypot(qx, qy);
}
function ringDist(x, y, rings){
  let d = Infinity;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
      d = Math.min(d, segDist(x, y, ring[j][0], ring[j][1], ring[i][0], ring[i][1]));
  return d;
}
/* 最大多边形的内切圆极点（polylabel 同思路）：标签锚点落在领地内部深处，
   官方 center 贴岸（汕头在港岸、汕尾压岸线、深圳贴深港界）导致的漂移从根上消除 */
function poleCenter(geom){
  const polys = polysOf(geom);
  let best = null, bestA = 0;
  for (const poly of polys){ const a = Math.abs(ringArea(poly[0])); if (a > bestA){ bestA = a; best = poly; } }
  if (!best) return null;
  const outer = best[0];
  const bb = ringBBox(outer);
  const cx = (bb[0][0] + bb[1][0]) / 2, cy = (bb[0][1] + bb[1][1]) / 2;
  let bestPt = [cx, cy], bestD = -Infinity;
  const queue = [{ x: cx, y: cy, h: Math.max(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1]) / 2 }];
  while (queue.length){
    const c = queue.pop();
    const d = (pointInRing(c.x, c.y, outer) ? 1 : -1) * ringDist(c.x, c.y, best);
    if (d > bestD){ bestD = d; bestPt = [c.x, c.y]; }
    if (c.h > 0.01 && d + c.h * 1.4143 > bestD){
      const h2 = c.h / 2;
      queue.push({ x: c.x - h2, y: c.y - h2, h: h2 }, { x: c.x + h2, y: c.y - h2, h: h2 },
                 { x: c.x - h2, y: c.y + h2, h: h2 }, { x: c.x + h2, y: c.y + h2, h: h2 });
    }
  }
  return bestPt;
}

function makeMaterial(color, opts){
  const params = Object.assign({ color: new THREE.Color(color), roughness: 0.94, metalness: 0, flatShading: true }, opts || {});
  const Ctor = THREE.MeshStandardNodeMaterial || THREE.MeshStandardMaterial;
  return new Ctor(params);
}
function darken(color, k){ return new THREE.Color(color).multiplyScalar(k).getStyle(); }

function buildShape(poly){
  const shape = new THREE.Shape();
  const outer = poly[0];
  shape.moveTo(sx(outer[0][0]), sy(outer[0][1]));
  for (let i = 1; i < outer.length; i++) shape.lineTo(sx(outer[i][0]), sy(outer[i][1]));
  shape.closePath();
  for (let h = 1; h < poly.length; h++){
    const hole = new THREE.Path();
    hole.moveTo(sx(poly[h][0][0]), sy(poly[h][0][1]));
    for (let i = 1; i < poly[h].length; i++) hole.lineTo(sx(poly[h][i][0]), sy(poly[h][i][1]));
    hole.closePath();
    shape.holes.push(hole);
  }
  return shape;
}

/* 创建场景：返回一个控制器对象。失败（无 WebGPU 且无 WebGL）时抛出，由上层切回 SVG 地图。 */
export async function createAtlas3D(options = {}) {
  const onHover = options.onHover || function(){};
  const onSelect = options.onSelect || function(){};

  const host = document.createElement('div');
  host.className = 'atlas3d-host';
  /* a11y：aria-hidden 只作用于画布与标签层；贴纸层包含可聚焦链接，保持对读屏可见（审计低-2） */
  const canvas = document.createElement('canvas');
  canvas.className = 'atlas3d-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const labelLayer = document.createElement('div');
  labelLayer.className = 'atlas3d-labels';
  labelLayer.setAttribute('aria-hidden', 'true');
  const stickerLayer = document.createElement('div');
  stickerLayer.className = 'atlas3d-stickers';
  const leaderSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  leaderSvg.setAttribute('class', 'atlas3d-leaders');
  leaderSvg.setAttribute('aria-hidden', 'true');
  host.append(canvas, leaderSvg, labelLayer, stickerLayer);

  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: true });
  await renderer.init();
  renderer.setClearColor(0x000000, 0);
  const backend = renderer.backend && renderer.backend.isWebGPUBackend === true ? 'WebGPU' : 'WebGL 2';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1.6, 0.5, 900);

  const goal = { radius: 80, elev: 80, azim: 0, target: new THREE.Vector3(0, 0, 0) };
  const cur = { radius: 80, elev: 80, azim: 0, target: new THREE.Vector3(0, 0, 0) };

  let dirty = true;
  let disposed = false;
  let frames = 0;
  let basePx = null;
  let hoverName = null;
  let pose = { key: 'home' };
  let landMeshes = [];
  let cities = [];
  let stickers = [];
  let landBox = null;
  let landSize = null;
  let baseRadius = 80;

  /* —— 地理数据 —— */
  const topoModule = await import('../data/geo.topo.json');
  const topo = topoModule.default || topoModule;
  const raw = [];
  ['gd', 'hkmo'].forEach((key) => topoFeature(topo, topo.objects[key]).features.forEach((f) => raw.push(f)));

  const inFarSea = (cx, cy) => cx > 114.8 && cy < 21.2;
  const features = [];
  const flatAgg = {};
  for (const f of raw){
    const nice = stripName(f.properties.name);
    const polys = polysOf(f.geometry);
    const big = [], small = [];
    for (const poly of polys){
      const bb = ringBBox(poly[0]);
      const cx = (bb[0][0] + bb[1][0]) / 2, cy = (bb[0][1] + bb[1][1]) / 2;
      if (inFarSea(cx, cy)) continue;
      const dim = Math.max(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1]);
      if (dim < FLAT_MAX_DEG){
        if (cx < NEAR_SHORE.lonMin || cx > NEAR_SHORE.lonMax || cy < NEAR_SHORE.latMin || cy > NEAR_SHORE.latMax) continue;
        small.push(poly);
      } else big.push(poly);
    }
    if (small.length){
      const agg = flatAgg[nice] = flatAgg[nice] || { props: Object.assign({ flat: true }, f.properties, { name: nice + '·屿' }), polys: [] };
      agg.polys = agg.polys.concat(small);
    }
    if (!big.length){
      if (flatAgg[nice]) flatAgg[nice].props = Object.assign({ flat: true }, f.properties, { name: nice });
      continue;
    }
    features.push({ type: 'Feature', properties: Object.assign({}, f.properties, { name: nice }),
      geometry: big.length === 1 ? { type: 'Polygon', coordinates: big[0] } : { type: 'MultiPolygon', coordinates: big } });
  }
  for (const key of Object.keys(flatAgg)){
    features.push({ type: 'Feature', properties: flatAgg[key].props,
      geometry: { type: 'MultiPolygon', coordinates: flatAgg[key].polys } });
  }

  /* —— 光照与托盘 —— */
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9c8f76, 1.15));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.1); keyLight.position.set(38, 72, 46); scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xfff3e0, 0.55); fillLight.position.set(-44, 26, -34); scene.add(fillLight);

  /* 沙盘托盘按陆地实际范围收紧：固定矩形会在西北方向留出大片空白，像一张贴歪的纸 */
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const f2 of features){
    for (const poly of polysOf(f2.geometry))
      for (const ring of poly)
        for (const p of ring){
          if (p[0] < minLon) minLon = p[0];
          if (p[0] > maxLon) maxLon = p[0];
          if (p[1] < minLat) minLat = p[1];
          if (p[1] > maxLat) maxLat = p[1];
        }
  }
  const PAD = 0.85;
  const bounds = [minLon - PAD, minLat - PAD, maxLon + PAD, maxLat + PAD];
  const trayW = sx(bounds[2]) - sx(bounds[0]);
  const trayD = sy(bounds[3]) - sy(bounds[1]);
  const trayColor = '#e3d7bd';
  const tray = new THREE.Mesh(new THREE.BoxGeometry(trayW, TRAY_H, trayD), makeMaterial(trayColor, { flatShading: false }));
  tray.position.set((sx(bounds[0]) + sx(bounds[2])) / 2, -TRAY_H / 2, -(sy(bounds[1]) + sy(bounds[3])) / 2);
  scene.add(tray);
  /* 沙盘落在海面上的柔和投影：canvas 透明 → 投影直接压在舞台的渐变海面上 */
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 256;
  const shadowCtx = shadowCanvas.getContext('2d');
  const shadowGrad = shadowCtx.createRadialGradient(128, 128, 36, 128, 128, 128);
  shadowGrad.addColorStop(0, 'rgba(74,58,36,0.30)');
  shadowGrad.addColorStop(0.62, 'rgba(74,58,36,0.16)');
  shadowGrad.addColorStop(1, 'rgba(74,58,36,0)');
  shadowCtx.fillStyle = shadowGrad;
  shadowCtx.fillRect(0, 0, 256, 256);
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(trayW * 1.28, trayD * 1.34), shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.set(tray.position.x, -TRAY_H - 0.04, tray.position.z);
  scene.add(shadowPlane);

  /* —— 陆地挤出与平铺小岛 —— */
  const allMeshes = [];
  /* 方案 5「我的探索变成地形」：按行政区分组记录地块与材质，
     完成场景后该市地块抬高并提亮（t 为 0→1 的动画进度） */
  const landGroups = {};
  const cityLift = {};
  let paperMap = false;
  let surfaceOnly = false;
  const markerCities = new Set([440100,445200]);
  const warmLight = new THREE.Color('#fff0d2');
  function landColors(color){
    const cap = new THREE.Color(color), wall = new THREE.Color(darken(color, 0.7));
    return { cap, wall, hotCap: cap.clone().lerp(warmLight, 0.3), hotWall: wall.clone().lerp(warmLight, 0.16) };
  }
  for (const f of features){
    const code = f.properties.adcode;
    const culture = CULTURES[CITY_CULTURE[code]] || CULTURES.other;
    const territory = ATLAS_TERRITORIES[code];
    const color = (territory && territory.color) || culture.color;
    const flat = !!f.properties.flat;
    const depth = flat ? FLAT_H : LAND_H;
    const capMat = makeMaterial(color);
    const wallMat = makeMaterial(darken(color, 0.7));
    const group = landGroups[code] || (landGroups[code] = {
      code: code, name: f.properties.name, parts: [],
      colors: landColors(color), paper: landColors(atlasPaperFor(code).color),
      t: 0, targetT: 0, lift: 1, maxLift: 0.55
    });
    for (const poly of polysOf(f.geometry)){
      const geo = new THREE.ExtrudeGeometry(buildShape(poly), {
        depth, bevelEnabled: !flat, bevelSize: 0.1, bevelThickness: 0.08, bevelSegments: 1, curveSegments: 1
      });
      geo.rotateX(-Math.PI / 2);
      // ExtrudeGeometry 的首组由等量的下盖和上盖组成；第二组为侧壁与倒角。
      // 首页只提交上盖给渲染器/拾取器；完整顶点仍用于原有相机取景。
      const fullGroups=geo.groups.slice();
      const lids=fullGroups[0], topCount=lids.count/2;
      const topStart=lids.start+topCount;
      const position=geo.getAttribute('position'), normal=geo.getAttribute('normal');
      const topY=position.getY(topStart);
      if (fullGroups.length!==2 || lids.materialIndex!==0 || lids.count%6 || fullGroups[1].materialIndex!==1 || geo.index) throw new Error('Unexpected atlas extrusion groups');
      for(let i=topStart;i<topStart+topCount;i++){
        if(Math.abs(position.getY(i)-topY)>1e-5 || normal.getY(i)<.999)throw new Error('Unexpected atlas top face');
      }
      const mesh = new THREE.Mesh(geo, [capMat, wallMat]);
      mesh.position.y = flat ? 0 : -EMBED;
      mesh.userData = { name: f.properties.name, code: code, flat: flat };
      scene.add(mesh);
      allMeshes.push(mesh);
      group.parts.push({ mesh, capMat, wallMat, fullGroups, topStart, topCount });
      if (!flat) landMeshes.push(mesh);
    }
  }

  function strokeGeometry(points){
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    return geo;
  }
  const homeOutline = [], homeBoundaries = [], homeSegments = new Map();
  const coordKey = p => p[0].toFixed(7)+','+p[1].toFixed(7);
  for(const f of features){
    const y=f.properties.flat ? FLAT_H+.06 : LAND_H-EMBED+.16;
    for(const poly of polysOf(f.geometry))for(const ring of poly)for(let i=1;i<ring.length;i++){
      const a=ring[i-1], b=ring[i], ka=coordKey(a), kb=coordKey(b);
      const key=ka<kb?ka+'/'+kb:kb+'/'+ka;
      let edge=homeSegments.get(key);
      if(!edge){ edge={a,b,y,codes:new Set()};homeSegments.set(key,edge); }
      edge.y=Math.max(edge.y,y);edge.codes.add(f.properties.adcode);
    }
  }
  for(const {a,b,y,codes} of homeSegments.values()){
    (codes.size>1?homeBoundaries:homeOutline).push(sx(a[0]),y,-sy(a[1]),sx(b[0]),y,-sy(b[1]));
  }
  const homeStrokes=[[homeOutline,'#776b54',.73],[homeBoundaries,'#71634d',.46]].map(([points,color,opacity])=>{
    const line=new THREE.LineSegments(strokeGeometry(points),new THREE.LineBasicMaterial({color,opacity,transparent:true,depthWrite:false}));
    line.visible=false;scene.add(line);return line;
  });

  /* —— 地区边界白线 —— */
  const borderPts = [];
  for (const f of features){
    const y = f.properties.flat ? FLAT_H + 0.06 : (LAND_H - EMBED + 0.16);
    for (const poly of polysOf(f.geometry))
      for (const ring of poly)
        for (let i = 0; i < ring.length - 1; i++){
          const a = ring[i], b = ring[i + 1];
          borderPts.push(sx(a[0]), y, -sy(a[1]), sx(b[0]), y, -sy(b[1]));
        }
  }
  const borderGeo = new THREE.BufferGeometry();
  borderGeo.setAttribute('position', new THREE.Float32BufferAttribute(borderPts, 3));
  const borderMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
  const originalStrokes=new THREE.LineSegments(borderGeo,borderMat);
  scene.add(originalStrokes);

  /* —— 城市名标签（DOM 层） —— */
  const byName = {};
  /* 平铺小岛聚合特征（「XX·屿」）不产生城市名标签 */
  cities = features.filter((f) => f.properties.center && !/·屿$/.test(f.properties.name)).map((f) => {
    const item = { name: f.properties.name, code: f.properties.adcode, center: f.properties.center,
      coord: poleCenter(f.geometry) || f.properties.center, leader: !!LEADER_SET[f.properties.adcode] };
    byName[item.name] = item;
    return item;
  });
  for (const city of cities){
    const el = document.createElement('div');
    el.className = 'atlas3d-label' + (city.leader ? ' is-leader' : '');
    el.textContent = city.name;
    labelLayer.appendChild(el);
    city.el = el;
    if (city.leader){
      city.dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      city.dot.setAttribute('r', '2.6'); city.dot.setAttribute('fill', '#3f4a56');
      city.line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      city.line.setAttribute('stroke', '#3f4a56'); city.line.setAttribute('stroke-width', '1'); city.line.setAttribute('opacity', '0.7');
      leaderSvg.appendChild(city.dot); leaderSvg.appendChild(city.line);
    }
  }

  /* —— 贴纸（DOM 层，跟随相机投影；悬停地市才亮出） —— */
  for (const { name, culture, image } of ATLAS_STICKERS){
    const city = byName[STICKER_CITY[name]];
    if (!city) continue;
    const el = document.createElement('a');
    el.className = 'atlas3d-sticker';
    el.href = '#culture/' + culture;
    const label = name + ' · ' + CULTURES[culture].name + ' · ' + MAP_CULTURE_LABEL;
    el.setAttribute('aria-label', label);
    el.title = label;
    el.innerHTML = '<span class="badge"><img src="' + image + '" alt="" width="44" height="44"></span>';
    el.style.display = 'none';
    stickerLayer.appendChild(el);
    stickers.push({ name: name, city: city.name, coord: city.coord, el, visible: false, shown: false });
  }

  /* —— 方案 5：进度 → 地形 —— */
  let progress = { cities: {}, routeCities: {}, routeCompleted: false };

  /* 路线光带：把一条路线的场景串成贴地发光带（方案 1） —— */
  let routeGroup = null;
  /* 路线完成后光带整条转为实心亮金（方案 5） */
  function applyBandStyle(){
    if (!routeGroup) return;
    const core = routeGroup.children[1], glow = routeGroup.children[0];
    if (!core || !glow) return;
    const done = !!progress.routeCompleted;
    core.material.color.set(done ? '#ffe9a8' : '#ffdf94');
    core.material.opacity = done ? 1 : 0.96;
    core.material.transparent = !done;
    glow.material.color.set(done ? '#ffd977' : '#f7c96b');
    glow.material.opacity = done ? 0.5 : 0.32;
  }
  function setRoutePath(points){
    if (routeGroup){
      scene.remove(routeGroup);
      routeGroup.traverse(function (child) { if (child.geometry) child.geometry.dispose(); });
      routeGroup = null;
    }
    if (points && points.length >= 2){
      /* 相邻重复点必须先去重：同城的多个场景（如三个广州站点）会产生重复控制点，
         CatmullRom 的切线会除零 → 整条管状几何变 NaN → 光带整条画不出来 */
      const dedup = [];
      for (const p of points){
        const last = dedup[dedup.length - 1];
        if (!last || Math.abs(last[0] - p[0]) > 1e-6 || Math.abs(last[1] - p[1]) > 1e-6) dedup.push(p);
      }
      if (dedup.length < 2){ dirty = true; return; }
      const curvePoints = dedup.map(function (p) { return new THREE.Vector3(sx(p[0]), LAND_H - EMBED + 0.55, -sy(p[1])); });
      const curve = new THREE.CatmullRomCurve3(curvePoints, false, 'centripetal', 0.5);
      const Ctor = THREE.MeshBasicNodeMaterial || THREE.MeshBasicMaterial;
      routeGroup = new THREE.Group();
      const glow = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.55, 10, false),
        new Ctor({ color: new THREE.Color('#f7c96b'), transparent: true, opacity: 0.32 }));
      const core = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.2, 10, false),
        new Ctor({ color: new THREE.Color('#ffdf94'), transparent: true, opacity: 0.98 }));
      routeGroup.add(glow, core);
      scene.add(routeGroup);
    }
    applyBandStyle();
    dirty = true;
  }

  /* —— 包围盒（取景用） —— */
  landBox = new THREE.Box3();
  for (const mesh of allMeshes) landBox.expandByObject(mesh);
  landSize = landBox.getSize(new THREE.Vector3());

  /* 方案 5：把「完成场景数」换算成各地块的目标抬高量 */
  function setProgress(next){
    progress = next || { cities: {}, routeCities: {}, routeCompleted: false };
    for (const code in landGroups){
      const g = landGroups[code];
      const done = progress.cities[g.name] || 0;
      const routeBonus = progress.routeCities[g.name] || 0;
      let t = 0;
      if (done > 0) t += 0.34 + 0.16 * Math.min(done - 1, 3);
      if (routeBonus > 0) t += 0.2 * Math.min(routeBonus, 2);
      g.targetT = Math.min(1, t);
    }
    applyBandStyle();
    dirty = true;
  }

  /* 方案 5：完成场景 → 地块抬高提亮（单标量 t 同时驱动高度与颜色） */
  function animateLift(){
    let moving = false;
    for (const code in landGroups){
      const g = landGroups[code];
      if (Math.abs(g.targetT - g.t) > 0.002){
        g.t += (g.targetT - g.t) * 0.12;
        moving = true;
      } else if (g.t !== g.targetT){
        g.t = g.targetT;
        moving = true;
      }
      g.lift = 1 + g.maxLift * g.t;
      const colors = paperMap ? g.paper : g.colors;
      g.parts.forEach(function (part){
        part.mesh.scale.y = g.lift;
        part.capMat.color.copy(colors.cap).lerp(colors.hotCap, g.t);
        part.wallMat.color.copy(colors.wall).lerp(colors.hotWall, g.t);
        if (part.capMat.emissive){
          part.capMat.emissive.set('#ffb14d');
          part.capMat.emissiveIntensity = 0.34 * g.t;
        }
      });
      cityLift[g.name] = g.lift;
    }
    return moving;
  }

  /* —— 相机与交互 —— */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let drag = null;
  let interactive = true;

  function pickAt(clientX, clientY){
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(landMeshes, false);
    if (!hits.length) return null;
    const hit = hits[0];
    return { name: hit.object.userData.name, code: hit.object.userData.code, entry: mapEntryFor(hit.object.userData.code),
      lon: hit.point.x / S + LON0, lat: LAT0 - hit.point.z / S };
  }
  function setHover(name, detail){
    if (hoverName !== name){
      hoverName = name;
      dirty = true;
      onHover(name, detail);
    }
  }
  canvas.addEventListener('pointermove', (event) => {
    if (!interactive) return;
    if (drag && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 3) drag.moved = true;
    if (!drag){
      const hit = pickAt(event.clientX, event.clientY);
      setHover(hit ? hit.name : null, hit);
      return;
    }
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    drag.x = event.clientX; drag.y = event.clientY;
    if (drag.button === 0){
      const scale = 2 * cur.radius * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.max(1, canvas.clientHeight);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
      const move = right.multiplyScalar(-dx * scale).add(up.multiplyScalar(dy * scale));
      goal.target.add(move); cur.target.add(move);
    } else {
      goal.azim -= dx * 0.3;
      goal.elev = clamp(goal.elev - dy * 0.25, 28, 90);
    }
    dirty = true;
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (!interactive) return;
    drag = { button: event.button, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointerup', (event) => {
    const wasDrag = drag && (drag.moved || Math.abs(event.clientX - drag.x) > 3 || Math.abs(event.clientY - drag.y) > 3);
    drag = null;
    if (!interactive || wasDrag) return;
    const hit = pickAt(event.clientX, event.clientY);
    if (hit?.entry) onSelect(hit);
  });
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('pointerleave', () => setHover(null, null));
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('wheel', (event) => {
    if (!interactive) return;
    event.preventDefault();
    goal.radius = clamp(goal.radius * (1 + Math.sign(event.deltaY) * 0.12), 18, 260);
    dirty = true;
  }, { passive: false });

  /* —— 尺寸 —— */
  function resize(){
    const rect = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    leaderSvg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    leaderSvg.setAttribute('width', String(w));
    leaderSvg.setAttribute('height', String(h));
    basePx = null;
    /* 画布尺寸变了（进舞台 / 换路由 / 窗口缩放）→ 按新宽高比重新取景，
       否则地图会停在上一次的视距上（表现为地图偏小、四周留白过多） */
    if (pose && pose.fit === 'land'){
      goal.radius = fitRadius(camera.aspect, goal.elev, pose.margin);
      baseRadius = goal.radius;
    } else if (pose && pose.fitPoints){
      goal.radius = fitPointsRadius(pose.fitPoints, camera.aspect, goal.elev);
    }
    dirty = true;
  }
  const observer = new ResizeObserver(() => resize());
  observer.observe(host);

  /* —— 位姿 —— */
  function fitRadius(aspect, elev, margin){
    if (!landSize) return 80;
    const rad = THREE.MathUtils.degToRad(elev);
    const halfH = (landSize.z * Math.sin(rad) + LAND_H * Math.cos(rad)) / 2 + 3;
    const halfW = landSize.x / 2 + 3;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    return Math.max(halfH / tanHalf, halfW / (tanHalf * aspect)) * (margin || 1.05);
  }
  /* 按一组点的范围取景（路线光带用），随画布宽高比自适应 */
  function fitPointsRadius(points, aspect, elev){
    if (!points || points.length < 2) return 60;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of points){
      const x = sx(p[0]), z = -sy(p[1]);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    const halfW = (maxX - minX) / 2 + 5, halfD = (maxZ - minZ) / 2 + 5;
    const rad = THREE.MathUtils.degToRad(elev);
    const halfH = halfD * Math.sin(rad) + LAND_H * Math.cos(rad);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    return Math.max(halfH / tanHalf, halfW / (tanHalf * aspect)) * 1.08;
  }
  function applyPose(next, instant){
    pose = next;
    const target = next.target ? new THREE.Vector3(sx(next.target[0]), 0, -sy(next.target[1])) : goal.target.clone();
    goal.target.copy(target);
    if (next.elev != null) goal.elev = clamp(next.elev, 10, 90);
    if (next.azim != null) goal.azim = next.azim;
    if (next.radius != null) goal.radius = clamp(next.radius, 14, 300);
    else if (next.fitPoints) goal.radius = fitPointsRadius(next.fitPoints, camera.aspect, goal.elev);
    else if (next.fit === 'land'){ goal.radius = fitRadius(camera.aspect, goal.elev, next.margin); baseRadius = goal.radius; }
    if (instant){
      cur.target.copy(goal.target); cur.radius = goal.radius; cur.elev = goal.elev; cur.azim = goal.azim;
    }
    basePx = null;   /* 字号缩放基准跟着新位姿重取，避免沿用上一镜头的比例 */
    dirty = true;
  }

  /* —— DOM 投影层 —— */
  const tmp = new THREE.Vector3();
  function project(lon, lat, y){
    tmp.set(sx(lon), y, -sy(lat)).project(camera);
    return { x: (tmp.x * 0.5 + 0.5) * canvas.clientWidth, y: (-tmp.y * 0.5 + 0.5) * canvas.clientHeight, z: tmp.z };
  }
  function scaleFactor(){
    const a = project(110, 22, 0), b = project(111, 22, 0);
    const px = Math.hypot(b.x - a.x, b.y - a.y);
    if (!basePx) basePx = px || 1;
    return clamp(px / (basePx || 1), 0.5, 3.5);
  }
  function resolveOverlaps(items){
    const CARD_W = 78, CARD_H = 78, AVOID_MAX = 120;
    items.forEach((s) => { s._x = s._ax; });
    for (let pass = 0; pass < 3; pass++){
      let moved = false;
      items.sort((a, b) => a._x - b._x);
      for (let i = 1; i < items.length; i++)
        for (let j = 0; j < i; j++){
          const dx = items[i]._x - items[j]._x, dy = items[i]._ay - items[j]._ay;
          if (Math.abs(dx) < CARD_W && Math.abs(dy) < CARD_H){
            const push = (CARD_W - Math.abs(dx)) * (dx >= 0 ? 1 : -1);
            const nx = Math.max(items[i]._ax - AVOID_MAX, Math.min(items[i]._x + push, items[i]._ax + AVOID_MAX));
            if (nx !== items[i]._x){ items[i]._x = nx; moved = true; }
          }
        }
      if (!moved) break;
    }
  }
  function updateOverlays(){
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const f = scaleFactor();
    const fq = Math.round(f * 20) / 20;
    const topY = LAND_H - EMBED;
    const liftY = function (name){ return topY + ((cityLift[name] || 1) - 1) * LAND_H; };
    const items = [];
    for (const sticker of stickers){
      const p = project(sticker.coord[0], sticker.coord[1], liftY(sticker.city));
      sticker.visible = p.z < 1 && p.x > -40 && p.x < w + 40 && p.y > -40 && p.y < h + 40;
      /* 卡片只在悬停时亮出，且整屏底图模式（interactive=false）一律不显示——
         否则跳页后悬停态残留，卡片会挂在背景底图上跟着镜头飞 */
      sticker.shown = !surfaceOnly && interactive && sticker.city === hoverName && sticker.visible;
      if (sticker.shown){ sticker._ax = p.x; sticker._ay = p.y; items.push(sticker); }
    }
    /* 防重叠只在真实显示的卡片之间推挤：隐藏贴纸不参与，
       否则近邻城市（汕头/潮州、江门/广州）的隐形贴纸会把悬停卡推离它的城市 */
    resolveOverlaps(items);
    const cardCities = {};
    for (const sticker of stickers) if (sticker.shown) cardCities[sticker.city] = 1;
    for (const sticker of stickers){
      const show = sticker.shown;
      const want = show ? '' : 'none';
      if (sticker.el.style.display !== want) sticker.el.style.display = want;
      if (!show) continue;
      const x = Math.round(sticker._x - 24), y = Math.round(sticker._ay - 60);
      if (x !== sticker._px || y !== sticker._py){ sticker._px = x; sticker._py = y; sticker.el.style.left = x + 'px'; sticker.el.style.top = y + 'px'; }
    }
    for (const city of cities){
      const p = project(city.coord[0], city.coord[1], liftY(city.name));
      const off = LABEL_OFFSETS[city.code] || [0, 0];
      const fs = Math.round(13 * fq * 2) / 2;
      if (city._fs !== fs){ city._fs = fs; city.el.style.fontSize = fs + 'px'; }
      const onScreen = p.z < 1 && p.x > -40 && p.x < w + 40 && p.y > -40 && p.y < h + 40;
      if (!onScreen){
        if (city.el.style.display !== 'none') city.el.style.display = 'none';
        if (city.leader){ city.dot.style.display = 'none'; city.line.style.display = 'none'; }
        continue;
      }
      const x = Math.round(p.x + off[0] * f), y = Math.round(p.y + off[1] * f);
      if (x !== city._px || y !== city._py){
        city._px = x; city._py = y;
        city.el.style.left = x + 'px'; city.el.style.top = y + 'px';
        if (city.leader){
          city.dot.setAttribute('cx', Math.round(p.x)); city.dot.setAttribute('cy', Math.round(p.y));
          city.dot.setAttribute('r', (2.6 * fq).toFixed(2));
          city.line.setAttribute('x1', Math.round(p.x)); city.line.setAttribute('y1', Math.round(p.y));
          city.line.setAttribute('x2', Math.round(p.x + off[0] * 0.82 * f)); city.line.setAttribute('y2', Math.round(p.y + off[1] * 0.82 * f));
          city.line.setAttribute('stroke-width', fq.toFixed(2));
          city.dot.style.display = ''; city.line.style.display = '';
        }
      }
      const want = cardCities[city.name] ? 'none' : '';
      if (city.el.style.display !== want) city.el.style.display = want;
    }
  }

  function syncHomeMarkers(){
    if(!surfaceOnly)return;
    const stage=host.closest('.atlas-stage');
    if(!stage?.isConnected)return;
    const points={};
    for(const c of cities){
      if(!markerCities.has(Number(c.code)))continue;
      const h=LAND_H-EMBED+((cityLift[c.name]||1)-1)*LAND_H;
      const p=project(c.coord[0],c.coord[1],h);
      points[c.code]=[p.x,p.y];
    }
    stage.dispatchEvent(new CustomEvent('atlas:layout',{detail:{points,labels:cities.map(c=>c.el),north:cur.azim}}));
  }

  /* —— 渲染循环（按需渲染） —— */
  let last = performance.now();
  renderer.setAnimationLoop(() => {
    if (disposed) return;
    const now = performance.now();
    const moving = Math.abs(goal.radius - cur.radius) > 0.02 || Math.abs(goal.elev - cur.elev) > 0.02 ||
      Math.abs(goal.azim - cur.azim) > 0.02 || goal.target.distanceToSquared(cur.target) > 0.0004;
    if (moving){
      const k = 1 - Math.pow(0.0016, (now - last) / 1000);
      cur.radius += (goal.radius - cur.radius) * k;
      cur.elev += (goal.elev - cur.elev) * k;
      cur.azim += (goal.azim - cur.azim) * k;
      cur.target.lerp(goal.target, k);
      dirty = true;
    }
    last = now;
    if (!dirty) return;
    dirty = false;
    if (animateLift()) dirty = true;
    const phi = THREE.MathUtils.degToRad(90 - cur.elev);
    const th = THREE.MathUtils.degToRad(cur.azim);
    camera.position.set(
      cur.target.x + cur.radius * Math.sin(phi) * Math.sin(th),
      cur.target.y + cur.radius * Math.cos(phi),
      cur.target.z + cur.radius * Math.sin(phi) * Math.cos(th)
    );
    camera.lookAt(cur.target);
    camera.updateMatrixWorld();
    updateOverlays();
    syncHomeMarkers();
    renderer.render(scene, camera);
    frames++;
  });

  resize();

  return {
    host: host,
    canvas: canvas,
    backend: backend,
    setPose: applyPose,
    setRoutePath: setRoutePath,
    /* 画布跨路由复用；纸本材质只在完整地图舞台启用。 */
    setAmbient(on, paper = false, topOnly = false){
      if(surfaceOnly!==topOnly){
        surfaceOnly=topOnly;
        for(const g of Object.values(landGroups))for(const {mesh,fullGroups,topStart,topCount} of g.parts){
          const geo=mesh.geometry;geo.clearGroups();
          if(topOnly){geo.addGroup(topStart,topCount,0);geo.setDrawRange(topStart,topCount);}
          else{fullGroups.forEach(g=>geo.addGroup(g.start,g.count,g.materialIndex));geo.setDrawRange(0,Infinity);}
        }
        tray.visible=shadowPlane.visible=originalStrokes.visible=!topOnly;
        homeStrokes.forEach(line=>{line.visible=topOnly;});
      }
      if (paperMap !== paper){
        paperMap = paper;
        tray.material.color.set(paper ? '#eee6d3' : trayColor);
        borderMat.color.set(paper ? '#887a62' : '#ffffff');
      }
      borderMat.opacity = on ? 0.26 : paper ? 0.78 : 0.92;
      borderMat.needsUpdate = true;
      dirty = true;
    },
    setProgress: setProgress,
    cityHeight(name){
      for (const code in landGroups) if (landGroups[code].name === name) return +landGroups[code].lift.toFixed(3);
      return null;
    },
    routeGlow(){ return !!progress.routeCompleted; },
    setInteractive(on){ interactive = !!on; host.classList.toggle('is-interactive', !!on); },
    refresh(){ dirty = true; },
    /* 路由切换时清掉悬停态：底图模式收不到指针事件，不清会导致提示条与卡片残留上一城 */
    clearHover(){ setHover(null, null); },
    resize,
    info(){ return { backend: backend, frames: frames, surfaceOnly, pose: pose.key, hover: hoverName, ready: true,
      routeNodes: routeGroup ? routeGroup.children.length : 0, routePoints: routeGroup ? routeGroup.children[0].geometry.parameters.path.points.length : 0,
      camera: { x: +camera.position.x.toFixed(2), y: +camera.position.y.toFixed(2), z: +camera.position.z.toFixed(2) },
      target: { x: +cur.target.x.toFixed(2), z: +cur.target.z.toFixed(2) }, radius: +cur.radius.toFixed(2), elev: +cur.elev.toFixed(2) }; },
    cityCenter(name){ const city = byName[name]; return city ? city.center : null; },
    /* 城市锚点的页面坐标（供无头测试精确悬停） */
    projectCity(name){
      const city = byName[name];
      if (!city) return null;
      const p = project(city.coord[0], city.coord[1], LAND_H - EMBED);
      const rect = canvas.getBoundingClientRect();
      return [rect.left + p.x, rect.top + p.y];
    },
    landCenter(){
      if (!landBox) return null;
      const c = landBox.getCenter(new THREE.Vector3());
      return [c.x / S + LON0, LAT0 - c.z / S];
    },
    /* 工具栏命令：旋转/缩放/俯视，与 SVG 地图的按钮语义一致 */
    command(action){
      if (action === 'zoom-in') goal.radius = clamp(goal.radius * 0.85, 14, 300);
      else if (action === 'zoom-out') goal.radius = clamp(goal.radius * 1.18, 14, 300);
      else if (action === 'rotate-left') goal.azim -= 8;
      else if (action === 'rotate-right') goal.azim += 8;
      else if (action === 'tilt') goal.elev = goal.elev > 60 ? 40 : 80;
      dirty = true;
      return goal.radius;
    },
    zoomPercent(){ return Math.round(clamp(baseRadius / goal.radius, 0.2, 5) * 100); },
    setRadius(r){ goal.radius = clamp(r, 14, 300); dirty = true; return goal.radius; },
    routePathPoints(){ return routeGroup ? routeGroup.children.map(function (child) { return child.geometry.parameters.path.points.map(function (v) { return [+v.x.toFixed(2), +v.z.toFixed(2)]; }); }) : null; },
    tilted(){ return goal.elev > 60; },
    dispose(){
      disposed = true;
      observer.disconnect();
      renderer.setAnimationLoop(null);
      renderer.dispose();
      if (host.parentNode) host.parentNode.removeChild(host);
    }
  };
}
