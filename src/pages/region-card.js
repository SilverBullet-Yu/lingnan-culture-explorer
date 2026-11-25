/* 地区卡片：首页、探索地区、文化圈页共用；未开放地区置灰并标「未开放」。 */
import { state, esc, routes } from '../store.js';
import { assetBadge } from '../asset-badges.js';
export function regionCard(r){
  var scenes=state.data.scenes.filter(function(s){return s.region_id===r.id});
  var count=scenes.length;
  var routeCount=routes().filter(function(rt){return (rt.scene_ids||[]).some(function(id){var s=state.data.scenes.find(function(x){return x.id===id});return s&&s.region_id===r.id})}).length;
  var locked=r.status!=='open'||!count;
  /* 首版不加载未开放地区的封面照片（授权未落地，且会随构建一并分发）：改纯色占位 + 图标 + 「未开放」标签。
     open 地区照常渲染 cover_image；planned 地区即使 seed 里配了 cover_image 也不输出 <img>。 */
  var cover=r.cover_image&&!locked?'<img class="region-cover-image" src="'+esc(r.cover_image)+'" alt="'+esc(r.cover_caption||r.name)+'" loading="lazy" width="600" height="360">'+assetBadge(r.cover_image):'<div class="region" style="background:'+esc(r.color)+'" aria-hidden="true">'+esc(r.icon)+'</div>';
  var statusTag=locked?'<span class="region-status">未开放</span>':'';
  var meta=count?('<span>'+routeCount+' 条路线 · '+count+' 个学习场景</span>'):'<span>学习场景准备中</span>';
  var action=locked?'<a href="#region/'+esc(r.id)+'">查看简介 →</a>':'<a href="#region/'+esc(r.id)+'">进入 '+esc(r.name)+' →</a>';
  return '<article class="card region-card'+(locked?' region-locked':'')+'">'+cover+statusTag+'<span class="tag">'+esc(r.culture_name)+'</span><h3>'+esc(r.name)+'</h3><p>'+esc(r.description)+'</p><div class="meta">'+meta+action+'</div></article>';
}
