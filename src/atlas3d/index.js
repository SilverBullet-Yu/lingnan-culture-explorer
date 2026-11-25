/* 三维地图的常驻层控制器（阶段 1）
   —— 全站只有一个 3D 画布：完整地图页嵌进地图舞台，其它路由按需挂作底图；
      路由切换 = 移动镜头，而不是重建页面。
   —— 降级：URL 带 ?map=svg 时强制走现有 SVG 地图；3D 初始化失败也自动回退 SVG。 */
import { createAtlas3D } from './scene.js';
import { poseFor, cityForRegion } from './poses.js';
import { CULTURES, MAP_DISPLAY_ONLY, MAP_HELP } from '../atlas/config.js';
import { state, scene as sceneById, routeById, region as regionById, isDone } from '../store.js';

let atlas = null;
let mode = 'pending';          /* pending | 3d | svg */
let lastRoute = 'home';
let lastParam = '';
const narrowHome = window.matchMedia('(max-width:700px)');
narrowHome.addEventListener('change', () => {if(lastRoute==='home'&&atlas)syncAtlas3D(lastRoute,lastParam);});

function forcedSvg(){
  try { return new URLSearchParams(window.location.search).get('map') === 'svg'; }
  catch (e) { return false; }
}
function reducedMotion(){
  return document.body.classList.contains('reduced-motion') ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/* 方案 5「我的探索变成地形」：把本机进度换算成
   ① 每个城市完成了几个场景（决定地块抬高量）② 哪些路线已完成（决定光带与加亮） */
function progressSummary(){
  const scenes = (state.data && state.data.scenes) || [];
  const cities = {};
  const routeCities = {};
  const cityOfScene = function (id){
    const s = scenes.filter(function (x) { return x.id === id; })[0];
    if (!s) return null;
    return cityForRegion(s.region_id);
  };
  Object.keys(state.progress || {}).forEach(function (id){
    if (!isDone(id)) return;
    const city = cityOfScene(id);
    if (!city) return;
    cities[city] = (cities[city] || 0) + 1;
  });
  Object.keys(state.routeDone || {}).forEach(function (rid){
    const r = routeById(rid);
    if (!r || !Array.isArray(r.scene_ids)) return;
    r.scene_ids.forEach(function (id){
      const city = cityOfScene(id);
      if (city) routeCities[city] = (routeCities[city] || 0) + 1;
    });
  });
  return { cities: cities, routeCities: routeCities };
}

/* 悬停反馈：与 SVG 地图同一套文案与播报位置 */
function onHover(name, detail){
  const label = document.getElementById('atlas-hover-label');
  const status = document.getElementById('atlas-status');
  const entry = detail && detail.entry;
  const text = name ? name + ' · ' + (entry ? entry.label : MAP_DISPLAY_ONLY) : MAP_HELP;
  if (label) label.textContent = text;
  if (status) status.textContent = text;
}
/* 仅有入口的地块可跳转地区页，与 SVG 地图一致。 */
function onSelect(hit){
  if (!hit || !hit.entry || !hit.entry.href) return;
  window.location.hash = hit.entry.href.slice(1);
}

export function initAtlas3D(){
  if (forcedSvg()){ mode = 'svg'; return; }
  createAtlas3D({ onHover: onHover, onSelect: onSelect }).then(function (scene) {
    atlas = scene;
    mode = '3d';
    document.documentElement.classList.add('atlas3d-on');
    syncAtlas3D(lastRoute, lastParam);
  }).catch(function (error) {
    mode = 'svg';
    document.documentElement.classList.remove('atlas3d-on');
    console.warn('[atlas3d] 初始化失败，回退 SVG 地图：', error);
    syncAtlas3D(lastRoute, lastParam);
  });
}

/* 工具栏（旋转/缩放/俯视/重置）在 3D 模式下改驱动 3D 相机 */
function overviewPose(surfaceOnly){
  const pose=poseFor('home','',atlas);
  if(surfaceOnly&&window.matchMedia('(max-width:700px)').matches){pose.azim=-14;pose.margin=.955;}
  return pose;
}
function bindToolbar(surfaceOnly){
  if (!atlas) return;
  document.querySelectorAll('[data-map-action]').forEach(function (button) {
    button.onclick = function () {
      const action = button.dataset.mapAction;
      if (action === 'reset'){
        atlas.setPose(overviewPose(surfaceOnly), reducedMotion());
      } else {
        atlas.command(action);
      }
      const zoom = document.getElementById('atlas-zoom');
      if (zoom) zoom.textContent = atlas.zoomPercent() + '%';
      const tilt = document.querySelector('[data-map-action="tilt"]');
      if (tilt){tilt.textContent = atlas.tilted() ? '立体视角' : '俯视视角';tilt.setAttribute('aria-pressed',String(atlas.tilted()));}
      const name = document.getElementById('atlas-view-name');
      if (name) name.textContent = atlas.tilted() ? '立体漫游' : '俯视总览';
    };
  });
}

export function syncAtlas3D(route, param){
  lastRoute = route || 'home';
  lastParam = param || '';
  const stage = document.getElementById('replica-map');
  const slot = document.getElementById('atlas3d-slot');
  const routeSlot = document.getElementById('atlas3d-route-slot');
  const isOverview = lastRoute === 'home' || lastRoute === 'atlas';
  const surfaceOnly = lastRoute === 'home' && !!slot;
  const embed = isOverview && slot ? slot : lastRoute === 'route' ? routeSlot : null;

  if (mode !== '3d' || !atlas){
    if (stage) stage.classList.remove('atlas3d-mode');
    return;
  }

  const pose = isOverview ? overviewPose(surfaceOnly) : poseFor(lastRoute,lastParam,atlas);
  const instant = reducedMotion();

  if (embed){
    if (atlas.host.parentNode !== embed) embed.appendChild(atlas.host);
    atlas.host.classList.add('is-stage');
    atlas.host.classList.remove('is-ambient');
    if (stage) stage.classList.add('atlas3d-mode');
    atlas.setAmbient(false,isOverview,surfaceOnly);
    atlas.setInteractive(true);
    if (isOverview) bindToolbar(surfaceOnly);
  } else {
    if (atlas.host.parentNode !== document.body) document.body.appendChild(atlas.host);
    atlas.host.classList.remove('is-stage');
    atlas.host.classList.add('is-ambient');
    atlas.setAmbient(true);
    if (stage) stage.classList.remove('atlas3d-mode');
    atlas.setInteractive(false);
  }
  atlas.clearHover();
  atlas.setRoutePath(pose.routePath || null);
  if(embed)atlas.resize();
  atlas.setPose(pose, instant);
  /* 进度 → 地形：每次渲染都同步一次（进度变化本身会触发重渲） */
  const summary = progressSummary();
  summary.routeCompleted = lastRoute === 'route' && !!state.routeDone[lastParam];
  atlas.setProgress(summary);

  /* 页眉指示牌：告诉用户镜头现在落在哪 */
  const where = document.getElementById('atlas3d-where');
  if (where){
    const label = where.querySelector('b');
    if (label) label.textContent = poseLabel(lastRoute, lastParam);
    where.title = '镜头位姿：' + poseLabel(lastRoute, lastParam);
  }
}

/* 位姿 → 人话标签（用种子数据里的真实名称，不用 id） */
function poseLabel(route, param){
  if (route === 'home' || route === 'atlas') return '俯瞰广东';
  if (route === 'culture') return '文化圈 · ' + ((CULTURES[param] && CULTURES[param].name) || param);
  if (route === 'region') return '地区 · ' + ((regionById(param) && regionById(param).name) || param.replace('region-', ''));
  if (route === 'route') return '路线 · ' + ((routeById(param) && routeById(param).name) || param);
  if (route === 'scene'){
    const item = sceneById(param);
    const region = item ? regionById(item.region_id) : null;
    return '场景 · ' + ((region && region.name) || '岭南');
  }
  return '广东总览';
}

/* 供测试与调试读取 */
export function atlas3DInfo(){
  if (!atlas) return { mode: mode, backend: null, pose: null, frames: 0, hover: null };
  const detail = atlas.info();
  return {
    mode: mode,
    backend: detail.backend,
    pose: detail.pose,
    frames: detail.frames,
    hover: detail.hover,
    surfaceOnly: detail.surfaceOnly,
    camera: detail.camera,
    target: detail.target,
    radius: detail.radius,
    elev: detail.elev
  };
}
export function atlas3DReady(){ return mode === '3d' && !!atlas; }
/* 调试与回归用：暴露当前模式、后端、位姿与帧数 */
if (typeof window !== 'undefined'){
  window.__atlas3dInfo = atlas3DInfo;
  window.__atlas3dProject = function (name){ return atlas ? atlas.projectCity(name) : null; };
  window.__atlas3dZoom = function (radius){ return atlas ? atlas.setRadius(radius) : null; };
  window.__atlas3dRoutePath = function (){ return atlas ? atlas.routePathPoints() : null; };
  window.__atlas3dCityHeight = function (name){ return atlas ? atlas.cityHeight(name) : null; };
  window.__atlas3dRouteGlow = function (){ return atlas ? atlas.routeGlow() : null; };
}
