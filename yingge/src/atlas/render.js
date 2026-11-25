/* 英歌原型 · 广东文化地图渲染（fork 自岭南漫游 atlas/render.js，v0.1 裁剪版）：
   只保留「预计算几何 → SVG 拼装 → 城市名标签避让 → 失败降级列表」主线；
   视角工具栏、贴纸、港澳引线、图例已随旧业务移除。
   交互模型改变：地图点击不再直接跳路由，而是回调 onPick(feature)，
   由页面层（pages/map.js）决定右侧内容面板显示什么。 */
import { CHAOSHAN_CODES, VIEWBOX } from './config.js';
import { ringsTextToPaths } from './geo.js';
import { esc } from '../store.js';
import mapDefault from '../generated/map-default.json';

var activeObserver = null;
/* 城市名统一放在顶层图层并做避让：标签不嵌在各区块里，避免被相邻区块盖住 */
var labelNodes = [];

export function disposeAtlas() { if (activeObserver) { activeObserver.disconnect(); activeObserver = null; } }

export function atlasMarkup(panelHtml) {
  return [
    '<section class="map-poster" aria-labelledby="atlas-heading">',
    '<div class="poster-band">',
    '<span class="poster-v" aria-hidden="true">上场之前</span>',
    '<div class="poster-band-main">',
    '<p class="act-eyebrow">英歌舞 · 国家级非遗 Ⅲ-8 · 广东潮汕</p>',
    '<h1 id="atlas-heading">潮汕<span class="replica-dot"> · </span>英歌地图</h1>',
    '<p class="atlas-introduction">英歌舞在潮汕四市的节庆中传承，也常被搬上舞台。点地图上任一城市，打开普宁英歌案例；案例中的脸谱、鼓点与队伍示意，用来观察一次演出前的准备。</p>',
    '</div></div>',
    '<div class="map-grid">',
    '<div class="replica-wrap"><div class="atlas-stage" id="replica-map">',
    '<div class="atlas-hover-label" id="atlas-hover-label" aria-hidden="true">点击城市，查看英歌案例</div>',
    '</div></div>',
    '<aside class="map-panel" id="map-panel" aria-label="地区内容面板">' + (panelHtml || '') + '</aside>',
    '</div>',
    '<p class="sr-only" id="atlas-status" role="status" aria-live="polite"></p></section>'
  ].join('');
}

export function mountAtlas(onPick) {
  const stage = document.getElementById('replica-map');
  if (!stage) return;
  disposeAtlas();
  /* 首屏路径（预计算数据 + SVG 构建）整体兜底，失败时不白屏，切换为容器内等价列表 */
  try {
    mountDefaultAtlas(stage, onPick);
  } catch (error) {
    fallbackView(stage, onPick);
  }
}

/* 降级视图：地图不可用时在容器内渲染与地图等价的入口列表（潮汕四市入口）。 */
function fallbackView(stage, onPick) {
  disposeAtlas();
  var box = document.createElement('div');
  box.className = 'atlas-fallback card';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-labelledby', 'atlas-fallback-title');
  var rows = mapDefault.features.map(function (feature) {
    return '<a class="replica-legend-row is-chaoshan" href="#map" data-fallback-pick="chaoshan"><i style="background:#cf3a1c"></i>' + esc(feature.name) + ' · 潮汕<small>进入 →</small></a>';
  });
  box.innerHTML = '<p class="atlas-fallback-note">地图加载失败，已自动切换为列表视图</p>'
    + '<h3 id="atlas-fallback-title">从这里出发</h3>' + rows.join('');
  box.addEventListener('click', function (event) {
    var link = event.target.closest('[data-fallback-pick]');
    if (link) { event.preventDefault(); onPick({ zone: 'chaoshan' }); }
  });
  var section = stage.closest('.replica-atlas');
  if (section) section.classList.add('atlas-fallback-active');
  stage.replaceChildren(box);
  var status = document.getElementById('atlas-status');
  if (status) status.textContent = '地图加载失败，已自动切换为列表视图';
}

/* 首屏默认路径：预计算数据 + SVG 构建 */
function mountDefaultAtlas(stage, onPick) {
  const namespace = 'http://www.w3.org/2000/svg';
  const view = Object.assign({}, mapDefault.view);
  let source = defaultSource();
  const svg = makeSvg('svg', { viewBox: VIEWBOX, class: 'atlas-svg', role: 'group', 'aria-label': '潮汕文化地图，四市可点选查看英歌案例' });
  stage.prepend(svg);

  function makeSvg(tag, attributes, text) {
    const node = document.createElementNS(namespace, tag);
    Object.entries(attributes || {}).forEach(function (entry) { node.setAttribute(entry[0], entry[1]); });
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function mixColor(hex, amount) {
    return '#' + [1, 3, 5].map(function (offset) {
      const channel = parseInt(hex.slice(offset, offset + 2), 16);
      return Math.round(channel + (255 - channel) * amount).toString(16).padStart(2, '0');
    }).join('');
  }

  /* 首屏路径：预计算几何，直接把紧凑点串拼成 path */
  function defaultSource() {
    const depth = mapDefault.depth;
    return {
      depth: depth,
      compassAngle: mapDefault.compassAngle,
      features: mapDefault.features.map(function (feature) {
        const paths = ringsTextToPaths(feature.rings, depth);
        return { code: feature.code, name: feature.name, color: feature.color, dark: feature.dark, top: paths.top, walls: paths.walls, label: feature.label || null };
      })
    };
  }

  function pick() {
    onPick({ zone: 'chaoshan' });
  }

  function drawMap() {
    const depth = source.depth;
    const defs = makeSvg('defs');
    const filter = makeSvg('filter', { id: 'atlas-ground-shadow', x: '-20%', y: '-30%', width: '150%', height: '160%' });
    filter.append(makeSvg('feGaussianBlur', { stdDeviation: 10 }));
    defs.append(filter);
    const pattern = makeSvg('pattern', { id: 'atlas-sea-grid', width: 44, height: 28, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(-10)' });
    pattern.append(makeSvg('path', { d: 'M44 0H0V28', fill: 'none', stroke: '#b09a6c', 'stroke-width': 0.7, opacity: 0.4 }));
    defs.append(pattern);
    const floor = makeSvg('g', { class: 'atlas-floor-layer', 'aria-hidden': 'true', 'pointer-events': 'none' });
    const sides = makeSvg('g', { class: 'atlas-side-layer', 'aria-hidden': 'true', 'pointer-events': 'none' });
    const tops = makeSvg('g', { class: 'atlas-top-layer' });
    const background = makeSvg('g', { 'aria-hidden': 'true', 'pointer-events': 'none' });
    background.append(makeSvg('ellipse', { cx: 570, cy: 330, rx: 430, ry: 250, fill: '#f1e6cb', opacity: 0.8 }));
    background.append(makeSvg('ellipse', { cx: 570, cy: 330, rx: 430, ry: 250, fill: 'url(#atlas-sea-grid)' }));
    background.append(makeSvg('text', { x: 545, y: 628, class: 'atlas-sea-label' }, '南 海'));
    background.append(makeSvg('path', { d: 'M514 646q14-10 28 0t28 0M594 628q12-8 24 0t24 0', class: 'atlas-wave' }));
    const compass = makeSvg('g', { transform: 'translate(190 568)', class: 'atlas-compass' });
    compass.append(makeSvg('circle', { r: 25, fill: '#fdf8ec', stroke: '#b09a6c' }));
    compass.append(makeSvg('path', { d: 'M0-15L-6 8L0 3L6 8Z', transform: 'rotate(' + source.compassAngle + ')', fill: '#9e2410' }));
    compass.append(makeSvg('text', { y: -35, 'text-anchor': 'middle' }, '北'));
    background.append(compass);

    source.features.forEach(function (feature) {
      const code = feature.code;
      const gradientId = 'atlas-top-' + code;
      const gradient = makeSvg('linearGradient', { id: gradientId, x1: '0%', y1: '0%', x2: '40%', y2: '100%' });
      gradient.append(makeSvg('stop', { offset: '0%', 'stop-color': mixColor(feature.color, 0.18) }));
      gradient.append(makeSvg('stop', { offset: '100%', 'stop-color': feature.color }));
      defs.append(gradient);
      floor.append(makeSvg('path', { d: feature.top, transform: 'translate(0 ' + depth + ')', fill: feature.dark, 'fill-rule': 'evenodd' }));
      sides.append(makeSvg('path', { d: feature.walls, fill: feature.dark }));
      const link = makeSvg('a', { class: 'atlas-region', href: '#map', 'data-adcode': code, 'aria-label': feature.name + '，查看英歌案例' });
      link.append(makeSvg('title', {}, feature.name + ' · 潮汕 · 点击查看英歌'));
      link.append(makeSvg('path', { d: feature.top, class: 'atlas-surface', fill: 'url(#' + gradientId + ')', 'fill-rule': 'evenodd' }));
      link.addEventListener('click', function (event) { event.preventDefault(); pick(); });
      link.addEventListener('keydown', function (event) { if (event.key === ' ') { event.preventDefault(); pick(); } });
      link.addEventListener('pointerenter', function () { document.getElementById('atlas-hover-label').textContent = feature.name + ' · 潮汕 · 点击查看英歌'; });
      link.addEventListener('pointerleave', function () { document.getElementById('atlas-hover-label').textContent = '点击地图区域，查看内容'; });
      tops.append(link);
    });
    const shadow = makeSvg('path', { d: source.features.map(function (feature) { return feature.top; }).join(' '), transform: 'translate(12 ' + (depth + 19) + ')', fill: '#26190d', opacity: 0.22, filter: 'url(#atlas-ground-shadow)', 'pointer-events': 'none', 'aria-hidden': 'true' });
    const labelLayer = makeSvg('g', { class: 'atlas-label-layer', 'pointer-events': 'none', 'aria-hidden': 'true' });
    /* 普宁案例标记：朱砂圆点 + 金环脉冲 + 标签（案例所在地，预计算坐标） */
    if (mapDefault.puning) {
      const puning = makeSvg('g', { class: 'atlas-puning', transform: 'translate(' + mapDefault.puning.x + ' ' + mapDefault.puning.y + ')' });
      puning.append(makeSvg('circle', { r: 13, class: 'atlas-puning-ring' }));
      puning.append(makeSvg('circle', { r: 6.5, class: 'atlas-puning-dot' }));
      puning.append(makeSvg('text', { x: 16, y: 5, class: 'atlas-puning-label' }, '普宁 · 英歌'));
      labelLayer.append(puning);
    }
    labelNodes = [];
    source.features.forEach(function (feature) {
      if (!feature.label) return;
      const text = makeSvg('text', { x: feature.label.x, y: feature.label.y, class: 'atlas-city-label is-chaoshan' }, feature.label.text);
      labelLayer.append(text);
      labelNodes.push({ el: text });
    });
    svg.replaceChildren(defs, background, shadow, floor, sides, tops, labelLayer);
    placeCityLabels();
    /* 字体加载与首帧布局会改变标签行高，等它们稳定后补测一次，避免边缘漏判 */
    requestAnimationFrame(placeCityLabels);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (stage.isConnected) placeCityLabels(); });
  }

  /* 城市名避让：以屏幕像素为步长尝试候选位移，先避开已放置的标签，再尽量留在本区域内。 */
  function placeCityLabels() {
    if (!labelNodes.length) return;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const scale = Math.max(0.0001, Math.hypot(matrix.a, matrix.b));
    const obstacles = [];
    const candidates = [[0, 0]];
    [16, 26, 38, 52].forEach(function (radius) {
      for (let step = 0; step < 10; step++) {
        const angle = Math.PI * 2 * step / 10;
        candidates.push([Math.round(Math.cos(angle) * radius), Math.round(Math.sin(angle) * radius)]);
      }
    });
    function overlapArea(box, rect) {
      const width = Math.min(box.right, rect.right) - Math.max(box.left, rect.left);
      const height = Math.min(box.bottom, rect.bottom) - Math.max(box.top, rect.top);
      return width > 0 && height > 0 ? width * height : 0;
    }
    labelNodes.forEach(function (node) {
      const text = node.el;
      text.removeAttribute('transform');
      const base = text.getBoundingClientRect();
      let best = null, bestScore = null;
      for (let i = 0; i < candidates.length; i++) {
        const dx = candidates[i][0], dy = candidates[i][1];
        const box = { left: base.left + dx - 2, right: base.right + dx + 2, top: base.top + dy - 2, bottom: base.bottom + dy + 2 };
        let overlap = 0;
        for (let j = 0; j < obstacles.length; j++) overlap += overlapArea(box, obstacles[j]);
        const score = overlap * 1e3 + (dx * dx + dy * dy);
        if (bestScore === null || score < bestScore) { bestScore = score; best = candidates[i]; }
        if (overlap === 0 && i === 0) break;
      }
      if (best && (best[0] || best[1])) {
        text.setAttribute('transform', 'translate(' + (best[0] / scale).toFixed(1) + ' ' + (best[1] / scale).toFixed(1) + ')');
      }
      obstacles.push(text.getBoundingClientRect());
    });
  }

  drawMap();
  const observer = new ResizeObserver(placeCityLabels);
  observer.observe(stage);
  activeObserver = observer;
}
