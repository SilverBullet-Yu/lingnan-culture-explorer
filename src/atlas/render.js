/* 粤港澳立体文化地图渲染：
   首屏用预计算几何（src/generated/map-default.json，静态导入）直接拼装 path，
   不执行投影运算；用户第一次旋转/缩放/俯仰/重置时才动态加载 TopoJSON（src/data/geo.topo.json）
   用 geo.js 现算，此后交互都走现算路径。两条路径产出同一套 DOM 结构与事件。 */
import { ATLAS_STICKERS, ATLAS_TERRITORIES, CITY_LABEL_OFFSETS, TERRITORY_OFFSET_NARROW, CULTURES, VIEWBOX,
  MAP_CULTURE_LABEL, MAP_DISPLAY_ONLY, MAP_HELP, MAP_REGION_ENTRIES, ATLAS_PAPER_PALETTE, atlasPaperFor, mapEntryFor } from './config.js';
import { allFeatures, createProjection, featureProfile, ringsTextToPaths, topPath, wallsPath } from './geo.js';
import { esc, state } from '../store.js';
import mapDefault from '../generated/map-default.json';

var activeObserver=null;
/* 城市名统一放在顶层图层并做避让：标签不再嵌在各自区块里，避免被相邻区块盖住；
   贴纸、港澳卡片与图例是上层 HTML，放置时按屏幕矩形避让。 */
var labelNodes=[];
var regionSurfaces={};

export function disposeAtlas(){if(activeObserver){activeObserver.disconnect();activeObserver=null}}

function swatch(key) {
  const paper = atlasPaperFor(key);
  return '<i style="background:' + paper.color + ';--swatch-line:' + paper.dark + '" aria-hidden="true"></i>';
}

/* 图例和既有列表视图共用链接、顺序与说明。 */
function legendRows() {
  function row(href, name, key, label) {
    return '<a class="replica-legend-row" href="' + href + '">' + swatch(key) + esc(name) + '<small>' + label + ' →</small></a>';
  }
  const regions = MAP_REGION_ENTRIES.map(function (entry) {
    return row(entry.href, entry.name, entry.codes[0], entry.label);
  });
  const cultures = Object.entries(CULTURES).filter(function ([id]) { return id !== 'other'; }).map(function ([id, culture]) {
    return row('#culture/' + id, culture.name, id, MAP_CULTURE_LABEL);
  });
  return regions.concat(cultures).join('')
    + '<div class="legend-muted">其余城市 · ' + MAP_DISPLAY_ONLY + '</div>';
}

export function atlasMarkup({ immersive=false, heading='', markers='', overlays='' }={}) {
  if (immersive) return '<section class="replica-atlas immersive-home" aria-labelledby="atlas-heading">'+heading+overlays+
    '<div class="replica-wrap"><div class="atlas-stage" id="replica-map">'+
    '<div id="atlas3d-slot" class="atlas3d-slot"></div><div id="replica-stickers" hidden></div>'+markers+
    '<div id="atlas-hover-label" aria-hidden="true" hidden>'+MAP_HELP+'</div></div></div>'+
    '<div class="n-key"><button type="button" aria-expanded="false" aria-controls="home-legend"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" aria-hidden="true"><path d="m3 8 9-5 9 5-9 5zm0 4 9 5 9-5M3 16l9 5 9-5"/></svg>图例与地区</button>'+
    '<aside class="n-key-list replica-legend" id="home-legend" aria-label="地区学习与文化介绍" hidden>'+legendRows()+'</aside></div>'+
    '<div class="n-tools" role="group" aria-label="地图控制">'+
    '<span id="atlas-view-name" class="sr-only">立体漫游</span>'+
    '<button type="button" data-map-action="zoom-out" aria-label="缩小地图">−</button><output id="atlas-zoom" aria-label="地图缩放比例">100%</output>'+
    '<button type="button" data-map-action="zoom-in" aria-label="放大地图">+</button><button type="button" data-map-action="reset" aria-label="重置地图视角">复位</button>'+
    '<button type="button" class="n-more" aria-expanded="false" aria-controls="home-views">视角</button><div class="n-extra" id="home-views" hidden>'+
    '<button type="button" data-map-action="rotate-left" aria-label="地图向左旋转">↶</button><button type="button" data-map-action="rotate-right" aria-label="地图向右旋转">↷</button>'+
    '<button type="button" data-map-action="tilt" aria-pressed="true">立体视角</button></div></div>'+
    '<p class="sr-only" id="atlas-status" role="status" aria-live="polite"></p></section>';
  return [
    '<section class="replica-atlas atlas-dimensional" aria-labelledby="atlas-heading">',
    '<div class="replica-header"><span class="atlas-eyebrow">岭南游纪 · 山海之间</span>',
    '<h1 id="atlas-heading">粤港澳<span class="replica-dot"> · </span>文化地图</h1>',
    '<div class="replica-sub">' + ['guangfu', 'kejia', 'chaoshan', 810000, 820000].map(function (key) {
      const name = (CULTURES[key] || ATLAS_TERRITORIES[key]).name;
      return '<span class="replica-tag">' + swatch(key) + esc(name) + '</span>';
    }).join('') + '</div>',
    '<p class="atlas-introduction">一座城，一种生活。沿着饮食、街巷与声音，开启你的岭南文化之旅。</p></div>',
    '<div class="atlas-toolbar"><span class="atlas-view-label"><i></i><b id="atlas-view-name">立体漫游</b><small>广东 21 市 · 香港 · 澳门</small></span>',
    '<div class="atlas-controls" role="group" aria-label="地图视角控制">',
    '<button type="button" data-map-action="rotate-left" aria-label="地图向左旋转">↶</button>',
    '<button type="button" data-map-action="rotate-right" aria-label="地图向右旋转">↷</button>',
    '<span class="control-divider"></span>',
    '<button type="button" data-map-action="zoom-out" aria-label="缩小地图">−</button>',
    '<output id="atlas-zoom" aria-label="地图缩放比例">100%</output>',
    '<button type="button" data-map-action="zoom-in" aria-label="放大地图">＋</button>',
    '<button type="button" data-map-action="tilt" aria-pressed="true">立体视角</button>',
    '<button type="button" data-map-action="reset" aria-label="重置地图视角">重置</button></div></div>',
    '<div class="replica-wrap"><div class="atlas-stage" id="replica-map">',
    '<div id="atlas3d-slot" class="atlas3d-slot"></div>',
    '<div id="replica-stickers" role="group" aria-label="文化贴纸与港澳入口"></div>',
    '<div class="atlas-hover-label" id="atlas-hover-label" aria-hidden="true">' + MAP_HELP + '</div>',
    '</div></div><aside class="replica-legend" aria-label="地区学习与文化介绍"><h3>从这里出发</h3>',
    legendRows(), '</aside>',
    '<p class="replica-footer">行政轮廓展示粤港澳地理关系 · 文化分区沿用参考图的展示性归类 · 港澳标签以引线连接真实位置</p>',
    '<p class="sr-only" id="atlas-status" role="status" aria-live="polite"></p></section>'
  ].join('');
}

/* SVG 同时绘制顶面、侧壁和底座；两条路径统一为 source：
   features[{code,name,color,dark,top,walls,label}] + stickerPoints + anchors（均为 SVG 坐标）。 */
export function mountAtlas() {
  const stage = document.getElementById('replica-map');
  if (!stage) return;
  disposeAtlas();
  /* F-02：首屏默认路径（预计算数据加载 + SVG 构建）整体兜底，失败时不白屏，切换为容器内等价列表 */
  try {
    mountDefaultAtlas(stage);
  } catch (error) {
    fallbackView(stage, '地图加载失败，已自动切换为列表视图');
  }
}

/* 首屏失败与 TopoJSON 回滚失败共用既有列表视图。 */
function fallbackView(stage, message) {
  disposeAtlas();
  var box = document.createElement('div');
  box.className = 'atlas-fallback card';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-labelledby', 'atlas-fallback-title');
  box.innerHTML = '<p class="atlas-fallback-note">' + message + '</p>'
    + '<h3 id="atlas-fallback-title">从这里出发</h3>'
    + legendRows()
    + '<a class="btn secondary" href="#regions">查看全部探索地区 →</a>';
  /* 与图例链接一致：进入任意入口前清空主题筛选，避免沿用上一次文化页的筛选状态 */
  box.addEventListener('click', function (event) {
    if (event.target.closest('a')) state.atlas.topic = 'all';
  });
  var section = stage.closest('.replica-atlas');
  if (section) section.classList.add('atlas-fallback-active');
  const notebook = stage.querySelector('.n-markers');
  if(notebook?.childElementCount){
    // 移动原节点，保留已绑定的手记行为与焦点返回目标。
    for(const pin of notebook.querySelectorAll('.n-marker'))pin.hidden=false;
    box.querySelector('h3').after(notebook);
  }
  stage.replaceChildren(box);
  /* 视角控件此时无对象可操作：禁用避免空点击，文案同步为列表状态 */
  document.querySelectorAll('[data-map-action]').forEach(function (button) {
    button.disabled = true;
    button.setAttribute('aria-disabled', 'true');
  });
  var viewName = document.getElementById('atlas-view-name');
  if (viewName) viewName.textContent = '列表视图';
  var viewScope = section ? section.querySelector('.atlas-view-label small') : null;
  if (viewScope) viewScope.textContent = '地图暂不可用';
  var zoom = document.getElementById('atlas-zoom');
  if (zoom) {
    zoom.textContent = '—';
    zoom.setAttribute('aria-hidden', 'true');
    zoom.removeAttribute('aria-label');
  }
  /* 播报只走 #atlas-status（aria-live），列表本身不再做 live region，避免整段列表被重复朗读 */
  var status = document.getElementById('atlas-status');
  if (status) status.textContent = message;
}

/* 首屏默认路径：预计算数据 + SVG 构建，由 mountAtlas 兜底调用 */
function mountDefaultAtlas(stage) {
  const immersive = !!stage.closest('.immersive-home');
  const namespace = 'http://www.w3.org/2000/svg';
  const markers = document.getElementById('replica-stickers');
  const view = Object.assign({}, mapDefault.view);
  let source = defaultSource();
  let topoData = null;
  let leaderLayer;
  const svg = makeSvg('svg', { viewBox: VIEWBOX, class: 'atlas-svg', role: 'group', 'aria-label': (immersive ? '粤港澳文化地图，含广东21市、香港与澳门' : '粤港澳立体交互地图，含广东21市、香港与澳门') });
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
    const anchors = {};
    mapDefault.territories.forEach(function (territory) { anchors[territory.code] = [territory.x, territory.y]; });
    return {
      depth: depth,
      compassAngle: mapDefault.compassAngle,
      features: mapDefault.features.map(function (feature) {
        const paths = ringsTextToPaths(feature.rings, depth);
        return { code: feature.code, name: feature.name, color: feature.color, dark: feature.dark, top: paths.top, walls: paths.walls, label: feature.label || null };
      }),
      stickerPoints: mapDefault.stickers.map(function (sticker) { return [sticker.x, sticker.y]; }),
      anchors: anchors
    };
  }

  /* 交互重算路径：TopoJSON + geo.js 现算，与原 atlas.js 的投影完全一致 */
  function topoSource() {
    const features = allFeatures(topoData);
    const project = createProjection(features, view);
    const depth = view.tilted ? 24 : 0;
    const northVector = project([113.5, 24]);
    const southVector = project([113.5, 23]);
    const compassAngle = Math.atan2(northVector[0] - southVector[0], southVector[1] - northVector[1]) * 180 / Math.PI;
    const anchors = {};
    Object.keys(ATLAS_TERRITORIES).forEach(function (code) {
      const feature = features.find(function (item) { return String(item.properties.adcode) === code; });
      const xy = project(feature.properties.center);
      anchors[code] = [xy[0], xy[1]];
    });
    return {
      depth: depth,
      compassAngle: compassAngle,
      features: features.map(function (feature) {
        const profile = featureProfile(feature);
        const center = project(feature.properties.center);
        const offset = CITY_LABEL_OFFSETS[profile.code] || [0, 0];
        return {
          code: profile.code, name: profile.name, color: profile.color, dark: profile.dark,
          top: topPath(feature, project), walls: wallsPath(feature, project, depth),
          label: profile.isTerritory && !immersive ? null : { x: center[0] + offset[0], y: center[1] + offset[1], text: profile.name }
        };
      }),
      stickerPoints: ATLAS_STICKERS.map(function (sticker) { return project(sticker.coord); }),
      anchors: anchors
    };
  }

  function drawMap() {
    if (!stage.isConnected) return;
    const depth = source.depth;
    const defs = makeSvg('defs');
    const filter = makeSvg('filter', { id: 'atlas-ground-shadow', x: '-20%', y: '-30%', width: '150%', height: '160%' });
    filter.append(makeSvg('feGaussianBlur', { stdDeviation: 10 }));
    defs.append(filter);
    const pattern = makeSvg('pattern', { id: 'atlas-sea-grid', width: 44, height: 28, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(-10)' });
    pattern.append(makeSvg('path', { d: 'M44 0H0V28', fill: 'none', stroke: '#c6b89d', 'stroke-width': 0.7, opacity: 0.42 }));
    defs.append(pattern);
    const floor = makeSvg('g', { class: 'atlas-floor-layer', 'aria-hidden': 'true', 'pointer-events': 'none' });
    const sides = makeSvg('g', { class: 'atlas-side-layer', 'aria-hidden': 'true', 'pointer-events': 'none' });
    const tops = makeSvg('g', { class: 'atlas-top-layer' });
    const background = makeSvg('g', { 'aria-hidden': 'true', 'pointer-events': 'none' });
    background.append(makeSvg('ellipse', { cx: 580, cy: 420, rx: 490, ry: 245, fill: '#efe9d8', opacity: 0.48 }));
    background.append(makeSvg('ellipse', { cx: 580, cy: 420, rx: 490, ry: 245, fill: 'url(#atlas-sea-grid)' }));
    background.append(makeSvg('text', { x: 850, y: 652, class: 'atlas-sea-label' }, '南 海'));
    background.append(makeSvg('path', { d: 'M819 672q14-10 28 0t28 0M899 650q12-8 24 0t24 0', class: 'atlas-wave' }));
    const compass = makeSvg('g', { transform: 'translate(160 124)', class: 'atlas-compass' });
    compass.append(makeSvg('circle', { r: 25, fill: '#fffdf7', stroke: '#dfd8c5' }));
    compass.append(makeSvg('path', { d: 'M0-15L-6 8L0 3L6 8Z', transform: 'rotate(' + source.compassAngle + ')', fill: '#8a8d73' }));
    compass.append(makeSvg('text', { y: -35, 'text-anchor': 'middle' }, '北'));
    background.append(compass);

    regionSurfaces = {};
    source.features.forEach(function (feature) {
      const code = feature.code;
      const paper = atlasPaperFor(code);
      const gradientId = 'atlas-top-' + code;
      const gradient = makeSvg('linearGradient', { id: gradientId, x1: '0%', y1: '0%', x2: '40%', y2: '100%' });
      gradient.append(makeSvg('stop', { offset: '0%', 'stop-color': mixColor(paper.color, 0.08) }));
      gradient.append(makeSvg('stop', { offset: '100%', 'stop-color': paper.color }));
      defs.append(gradient);
      floor.append(makeSvg('path', { d: feature.top, transform: 'translate(0 ' + depth + ')', fill: paper.dark, 'fill-rule': 'evenodd' }));
      sides.append(makeSvg('path', { d: feature.walls, fill: paper.dark }));
      const entry = mapEntryFor(code);
      const label = feature.name + ' · ' + (entry ? entry.label : MAP_DISPLAY_ONLY);
      const area = makeSvg(entry ? 'a' : 'g', { class: 'atlas-region' + (entry ? '' : ' atlas-unavailable'), 'data-adcode': code, 'aria-label': label });
      if (entry) {
        area.setAttribute('href', entry.href);
        area.addEventListener('click', function () { state.atlas.topic = 'all'; });
      } else {
        area.setAttribute('role', 'img');
      }
      area.append(makeSvg('title', {}, label));
      const surface = makeSvg('path', { d: feature.top, class: 'atlas-surface', fill: 'url(#' + gradientId + ')', 'fill-rule': 'evenodd' });
      area.append(surface);
      regionSurfaces[code] = surface;
      area.addEventListener('pointerenter', function () { document.getElementById('atlas-hover-label').textContent = label; });
      area.addEventListener('pointerleave', function () { document.getElementById('atlas-hover-label').textContent = MAP_HELP; });
      tops.append(area);
    });
    const shadow = makeSvg('path', { d: source.features.map(function (feature) { return feature.top; }).join(' '), transform: 'translate(12 ' + (depth + 19) + ')', fill: '#56664e', opacity: 0.24, filter: 'url(#atlas-ground-shadow)', 'pointer-events': 'none', 'aria-hidden': 'true' });
    leaderLayer = makeSvg('g', { class: 'atlas-leaders', 'pointer-events': 'none', 'aria-hidden': 'true' });
    const labelLayer = makeSvg('g', { class: 'atlas-label-layer', 'pointer-events': 'none', 'aria-hidden': 'true' });
    labelNodes = [];
    source.features.forEach(function (feature) {
      let label = feature.label;
      if (immersive && ATLAS_TERRITORIES[feature.code]) {
        const [x,y]=source.anchors[feature.code], macau=String(feature.code)==='820000';
        label={x:x+(macau?33:12),y:y+(macau?24:3),text:ATLAS_TERRITORIES[feature.code].name};
        if(macau)leaderLayer.append(makeSvg('path',{ d:'M'+x+','+y+'L'+(x+24)+','+(y+20), fill:'none', stroke:'#5e6d62', 'stroke-width':1.3, 'vector-effect':'non-scaling-stroke' }));
      }
      if (!label) return;
      const text = makeSvg('text', { x: label.x, y: label.y, class: 'atlas-city-label' + (mapEntryFor(feature.code) ? '' : ' is-unavailable') }, label.text);
      labelLayer.append(text);
      labelNodes.push({ el: text, code: feature.code });
    });
    if (immersive) svg.replaceChildren(defs, tops, leaderLayer, labelLayer);
    else svg.replaceChildren(defs, background, shadow, floor, sides, tops, leaderLayer, labelLayer);
    placeMarkers();
    updateControls();
  }

  const stickerElements = ATLAS_STICKERS.map(function (sticker) {
    const link = document.createElement('a');
    link.className = 'replica-sticker';
    link.href = '#culture/' + sticker.culture;
    link.setAttribute('aria-label', sticker.name + ' · ' + CULTURES[sticker.culture].name + ' · ' + MAP_CULTURE_LABEL);
    link.style.setProperty('--sc', ATLAS_PAPER_PALETTE[sticker.culture].dark);
    link.setAttribute('aria-describedby', 'sticker-card');
    link.innerHTML = '<span class="badge"><img src="' + sticker.image + '" alt="" width="44" height="44"></span>';
    link.addEventListener('click', function () { state.atlas.topic = 'all'; });
    link.addEventListener('pointerenter', function () { showStickerCard(sticker, link); });
    link.addEventListener('pointerleave', hideStickerCard);
    link.addEventListener('focus', function () { showStickerCard(sticker, link); });
    link.addEventListener('blur', hideStickerCard);
    markers.append(link);
    return link;
  });

  /* 名字与简介改为悬停/聚焦时出现的卡片：默认只留贴纸图，地图上不再常驻名字条 */
  const stickerCard = document.createElement('div');
  stickerCard.className = 'sticker-card';
  stickerCard.id = 'sticker-card';
  stickerCard.setAttribute('role', 'tooltip');
  if (stage.parentElement) stage.parentElement.append(stickerCard);

  function showStickerCard(sticker, link) {
    const culture = CULTURES[sticker.culture];
    stickerCard.innerHTML = '<b>' + esc(sticker.name) + '</b><small style="--sc:' + ATLAS_PAPER_PALETTE[sticker.culture].dark + '">' + esc(culture.name) + ' · ' + MAP_CULTURE_LABEL + '</small><p>' + esc(sticker.note || '') + '</p>';
    stickerCard.classList.add('on');
    const stageRect = stage.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    const cardRect = stickerCard.getBoundingClientRect();
    let left = linkRect.left - stageRect.left + linkRect.width / 2 - cardRect.width / 2;
    left = Math.max(8, Math.min(stageRect.width - cardRect.width - 8, left));
    let top = linkRect.top - stageRect.top - cardRect.height - 10;
    if (top < 8) top = linkRect.bottom - stageRect.top + 10;
    stickerCard.style.left = left + 'px';
    stickerCard.style.top = top + 'px';
  }

  function hideStickerCard() {
    stickerCard.classList.remove('on');
  }

  function territoryIllustration(code) {
    // R-5 裁决（2026-11-19）：下面这张暖金 SVG 是所有非香港行政区共用的通用装饰插画，
    // 与各地块色（广府 #B4442F、潮汕 #B87A1F、澳门 #B0A3BC 等）不联动，
    // 因此本轮色相改版不调整其配色，沿用原暖金。
    if (code === '810000') return '<svg viewBox="0 0 48 52" aria-hidden="true"><path d="M10 8h28v34H10Z" fill="#75a8be" stroke="#415f72" stroke-width="2"/><path d="M14 13h20v10H14ZM14 27h20v9H14Z" fill="#fff7dc"/><path d="M8 7h32M19 3h10M24 3v4" stroke="#415f72" stroke-width="2"/><circle cx="16" cy="44" r="4" fill="#415f72"/><circle cx="32" cy="44" r="4" fill="#415f72"/><path d="M5 49h38" stroke="#879d94" stroke-width="2"/></svg>';
    return '<svg viewBox="0 0 48 52" aria-hidden="true"><path d="M7 46V20h34v26Z" fill="#ead7a5" stroke="#8e7957" stroke-width="2"/><path d="M5 20L24 5L43 20Z" fill="#d7bd83" stroke="#8e7957" stroke-width="2"/><path d="M20 46V33a4 4 0 0 1 8 0v13M13 25v6M35 25v6M13 37v6M35 37v6" fill="#faf0d8" stroke="#8e7957" stroke-width="2"/><circle cx="24" cy="19" r="3" fill="#faf0d8"/><path d="M3 48h42" stroke="#8e7957" stroke-width="2"/></svg>';
  }

  const territoryElements = Object.keys(ATLAS_TERRITORIES).map(function (code) {
    const entry = mapEntryFor(code);
    const link = document.createElement('a');
    link.className = 'atlas-region-pin';
    link.dataset.region = entry.id;
    link.href = entry.href;
    link.style.setProperty('--pin-color', atlasPaperFor(code).dark);
    link.innerHTML = '<span class="territory-art">' + territoryIllustration(code) + '</span><span><b>' + entry.name + '</b><small>' + entry.label + '</small></span><i aria-hidden="true">↗</i>';
    markers.append(link);
    return { code: code, element: link };
  });

  function placeMarkers() {
    hideStickerCard();
    const matrix = svg.getScreenCTM();
    if (!matrix || !leaderLayer) return;
    const rectangle = stage.getBoundingClientRect();
    function screenPoint(xy) {
      const point = new DOMPoint(xy[0], xy[1]).matrixTransform(matrix);
      return [point.x - rectangle.left, point.y - rectangle.top];
    }
    if(immersive){
      if(stage.classList.contains('atlas3d-mode'))return;
      const points={};
      for(const n of labelNodes){
        if(n.code===440100||n.code===445200||n.code==='440100'||n.code==='445200'){
          points[n.code]=screenPoint([+n.el.getAttribute('x'),+n.el.getAttribute('y')]);
        }
      }
      stage.dispatchEvent(new CustomEvent('atlas:layout',{detail:{points,labels:labelNodes.map(n=>n.el),north:source.compassAngle}}));
      return;
    }
    ATLAS_STICKERS.forEach(function (sticker, index) {
      const point = screenPoint(source.stickerPoints[index]);
      stickerElements[index].style.left = point[0] + 'px';
      stickerElements[index].style.top = point[1] + 'px';
    });
    leaderLayer.replaceChildren();
    territoryElements.forEach(function (territory) {
      const profile = ATLAS_TERRITORIES[territory.code];
      const anchor = screenPoint(source.anchors[territory.code]);
      const narrow = rectangle.width < 600;
      const offset = narrow ? TERRITORY_OFFSET_NARROW[territory.code] : profile.offset;
      const halfWidth = territory.element.offsetWidth / 2;
      const x = Math.max(halfWidth + 12, Math.min(rectangle.width - halfWidth - 12, anchor[0] + offset[0]));
      const y = Math.min(rectangle.height - 42, anchor[1] + offset[1]);
      territory.element.style.left = x + 'px'; territory.element.style.top = y + 'px';
      const actual = source.anchors[territory.code];
      const paper = atlasPaperFor(territory.code);
      const endpoint = new DOMPoint(rectangle.left + x, rectangle.top + y).matrixTransform(matrix.inverse());
      leaderLayer.append(makeSvg('path', { d: 'M' + actual[0] + ',' + actual[1] + 'L' + endpoint.x + ',' + endpoint.y, fill: 'none', stroke: paper.dark, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', 'stroke-dasharray': '4 4' }));
      leaderLayer.append(makeSvg('circle', { cx: actual[0], cy: actual[1], r: 5.5, fill: paper.color, stroke: '#fffdf8', 'stroke-width': 2 }));
    });
    placeCityLabels();
    /* 字体加载与首帧布局会改变贴纸名字行的高度，等它们稳定后补测一次，避免边缘漏判 */
    requestAnimationFrame(placeCityLabels);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (stage.isConnected) placeCityLabels(); });
  }

  /* 城市名避让：先按原坐标测量，再以屏幕像素为步长尝试几个候选位移，避开贴纸、
     港澳卡片与图例；位移量按当前 CTM 换算回 SVG 坐标，缩放/旋转后依旧成立。 */
  function placeCityLabels() {
    if (!labelNodes.length) return;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const scale = Math.max(0.0001, Math.hypot(matrix.a, matrix.b));
    const obstacles = [];
    stickerElements.forEach(function (element) { obstacles.push(element.getBoundingClientRect()); });
    territoryElements.forEach(function (territory) { obstacles.push(territory.element.getBoundingClientRect()); });
    const legend = stage.parentElement ? stage.parentElement.querySelector('.replica-legend') : null;
    if (legend) {
      const legendRect = legend.getBoundingClientRect();
      if (legendRect.width && legendRect.height) obstacles.push(legendRect);
    }
    /* 候选位移由近到远螺旋展开；全部被挡时改选重叠面积最小的位置，避免标签留在贴纸底下 */
    const candidates = [[0, 0]];
    [18, 28, 38, 50, 64, 78].forEach(function (radius) {
      for (let step = 0; step < 12; step++) {
        const angle = Math.PI * 2 * step / 12;
        candidates.push([Math.round(Math.cos(angle) * radius), Math.round(Math.sin(angle) * radius)]);
      }
    });
    function overlapArea(box, rect) {
      const width = Math.min(box.right, rect.right) - Math.max(box.left, rect.left);
      const height = Math.min(box.bottom, rect.bottom) - Math.max(box.top, rect.top);
      return width > 0 && height > 0 ? width * height : 0;
    }
    const inverse = matrix.inverse();
    function insideRegion(node, clientX, clientY) {
      const surface = regionSurfaces[node.code];
      if (!surface || typeof surface.isPointInFill !== 'function') return true;
      try {
        return surface.isPointInFill(new DOMPoint(clientX, clientY).matrixTransform(inverse));
      } catch (e) {
        return true;
      }
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
        /* 排序：先保证不压贴纸/卡片，其次尽量留在本区域色块内，再取位移更小的候选 */
        const score = (overlap === 0 ? 0 : 1) * 1e6 + (insideRegion(node, (box.left + box.right) / 2, (box.top + box.bottom) / 2) ? 0 : 1e5) + overlap;
        if (bestScore === null || score < bestScore) { bestScore = score; best = candidates[i]; }
        if (overlap === 0 && score < 1e5) break;
      }
      if (best && (best[0] || best[1])) {
        text.setAttribute('transform', 'translate(' + (best[0] / scale).toFixed(1) + ' ' + (best[1] / scale).toFixed(1) + ')');
      }
      obstacles.push(text.getBoundingClientRect());
    });
  }

  function updateControls() {
    document.getElementById('atlas-zoom').textContent = Math.round(view.zoom * 100) + '%';
    document.querySelector('[data-map-action="zoom-out"]').disabled = view.zoom <= 0.9;
    document.querySelector('[data-map-action="zoom-in"]').disabled = view.zoom >= 1.3;
    document.querySelector('[data-map-action="rotate-left"]').disabled = view.angle <= -26;
    document.querySelector('[data-map-action="rotate-right"]').disabled = view.angle >= 14;
    const tilt = document.querySelector('[data-map-action="tilt"]');
    tilt.setAttribute('aria-pressed', String(view.tilted));
    tilt.textContent = view.tilted ? '立体视角' : '俯视视角';
    document.getElementById('atlas-view-name').textContent = view.tilted ? '立体漫游' : '俯视总览';
    document.getElementById('atlas-status').textContent = (view.tilted ? '立体视角' : '俯视视角') + '，缩放' + Math.round(view.zoom * 100) + '%';
  }

  /* 第一次视角交互时才动态加载 TopoJSON 并现算，此后都走现算路径 */
  function redraw() {
    if (topoData) { source = topoSource(); drawMap(); return; }
    import('../data/geo.topo.json').then(function (mod) {
      topoData = mod.default;
      source = topoSource();
      drawMap();
    }).catch(function () {
      /* 页面已切换（异步返回晚于重渲染）时直接丢弃，避免误改新页面的控件状态 */
      if (!stage.isConnected) return;
      /* TopoJSON 加载失败：回滚到默认视角，控件与画面保持一致并播报；回滚也失败则切换列表降级视图 */
      try {
        view.angle = mapDefault.view.angle; view.zoom = mapDefault.view.zoom; view.tilted = mapDefault.view.tilted;
        updateControls();
        var status = document.getElementById('atlas-status');
        if (status) status.textContent = '视角重算数据加载失败，已恢复默认视角';
      } catch (error) {
        fallbackView(stage, '视角重算失败，已自动切换为列表视图');
      }
    });
  }

  document.querySelectorAll('[data-map-action]').forEach(function (button) {
    button.onclick = function () {
      const action = button.dataset.mapAction;
      if (action === 'rotate-left') view.angle = Math.max(-26, view.angle - 8);
      if (action === 'rotate-right') view.angle = Math.min(14, view.angle + 8);
      if (action === 'zoom-out') view.zoom = Math.max(0.9, Number((view.zoom - 0.1).toFixed(1)));
      if (action === 'zoom-in') view.zoom = Math.min(1.3, Number((view.zoom + 0.1).toFixed(1)));
      if (action === 'tilt') view.tilted = !view.tilted;
      if (action === 'reset') { view.angle = -10; view.zoom = 1; view.tilted = true; }
      redraw();
    };
  });
  document.querySelectorAll('.replica-legend a').forEach(function (link) {
    link.onclick = function () { state.atlas.topic = 'all'; };
  });
  drawMap();
  const observer = new ResizeObserver(placeMarkers);
  observer.observe(stage);
  activeObserver = observer;
}
