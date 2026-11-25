/* 地区详情页：地区介绍与路线入口；未开放地区只展示简介。 */
import { state, esc, safeUrl, routes } from '../store.js';
import { assetBadge } from '../asset-badges.js';
import { missingPage } from './missing.js';
import { yinggeEntry } from './yingge-entry.js';
import { routeCard } from './route-card.js';

export function regionPage(id){
  var r=state.data.regions.find(function(region){return region.id===id});if(!r)return missingPage('地区');
  var scenes=state.data.scenes.filter(function(s){return s.region_id===id});
  var regionRoutes=routes().filter(function(rt){
    return (rt.scene_ids||[]).some(function(sid){var s=state.data.scenes.find(function(x){return x.id===sid});return s&&s.region_id===id});
  });
  var locked=r.status!=='open'||!scenes.length;
  /* 首版不加载未开放地区的封面照片（授权未落地，且会随构建一并分发）：与 region-card.js 同口径。 */
  var photo=r.cover_image&&!locked?'<figure class="culture-photo"><img src="'+esc(r.cover_image)+'" alt="'+esc(r.cover_caption||r.name)+'" width="600" height="360"><figcaption>'+assetBadge(r.cover_image)+esc(r.cover_caption)+(r.source_url?' · <a href="'+esc(safeUrl(r.source_url))+'" target="_blank" rel="noopener noreferrer">阅读背景资料 ↗</a>':'')+'</figcaption></figure>':'';
  var intro='<div class="'+(photo?'columns':'region-intro')+'"><div><span class="tag">'+esc(r.culture_name)+'</span>'+(locked?' <span class="region-status">未开放</span>':'')+'<h1>'+esc(r.name)+' · 文化探索</h1><p class="muted">'+esc(r.description)+'</p><div class="culture-keywords">'+r.keywords.map(function(word){return '<span>'+esc(word)+'</span>'}).join('')+'</div><a class="btn secondary" href="#home">← 返回文化地图</a></div>'+photo+'</div>';
  var content;
  if(locked){
    content='<div class="region-coming-soon"><span class="tag">内容准备中</span><h2>'+esc(r.name)+'的学习内容暂未开放</h2><p>这里先展示地区简介。可以前往广州或潮汕，开始已有的学习路线。</p><a class="btn" href="#regions">查看其他地区 →</a></div>';
  }else{
    content=(id==='region-cz'?yinggeEntry():'')+'<div class="head"><div><h2>从这里开始的路线</h2><p>选择一条路线，按场景顺序进入学习；每个场景包含图文卡、方言表达与文化任务。</p></div></div>'
      +(regionRoutes.length?'<div class="grid">'+regionRoutes.map(function(rt){
        var count=(rt.scene_ids||[]).filter(function(sid){var s=state.data.scenes.find(function(x){return x.id===sid});return s&&s.region_id===id}).length;
        return routeCard(rt, {regionName:r.name, sceneCount:count});
      }).join('')+'</div>':'<div class="empty">这里的路线正在筹备中。</div>');
  }
  return '<section class="region-overview"><div class="crumb"><a href="#home">文化地图</a> / <a href="#regions">探索地区</a> / '+esc(r.name)+'</div>'+intro+content+'</section>';
}
