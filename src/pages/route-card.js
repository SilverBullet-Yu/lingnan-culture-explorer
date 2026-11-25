/* 路线卡共用内容来源；首页提供简览，地区和路线列表保留各自元数据。 */
import { state, isDone, esc } from '../store.js';
import { assetBadge } from '../asset-badges.js';

export function routeCard(r, {index, regionName, sceneCount}={}){
  var ids=Array.isArray(r.scene_ids)?r.scene_ids:[];
  var total=ids.length;
  var minutes='约 '+esc(r.estimated_minutes||30)+' 分钟';
  var href='#route/'+esc(r.id);
  var title='<h3>'+esc(r.name)+'</h3>';
  var theme=esc(r.theme_name||'文化路线');
  if(index!==undefined){
    return '<a class="card route-card route-card-compact" href="'+href+'"><span class="route-card-index" aria-hidden="true">'+String(index).padStart(2,'0')+'</span><div>'+title+'<p>'+theme+' · '+total+' 个场景</p></div><span class="route-card-time">'+minutes+' <span aria-hidden="true">→</span></span></a>';
  }
  var cover=r.cover_image?'<img class="region-cover-image" src="'+esc(r.cover_image)+'" alt="'+esc(r.cover_caption||r.name)+'" loading="lazy" width="600" height="360">'+assetBadge(r.cover_image):'';
  var left=total+' 个场景 · '+minutes;
  var right,progress='';
  if(regionName!==undefined){
    left=sceneCount+' 个'+esc(regionName)+'场景 · '+minutes;
    right='进入路线 →';
  }else{
    var done=ids.filter(isDone).length;
    var status=state.routeDone[r.id]?'已完成':done?'进行中':'未开始';
    right=done+'/'+total+' · '+status;
    progress='<div class="bar"><i style="width:'+(total?Math.round(done/total*100):0)+'%"></i></div>';
  }
  return '<a class="card route-card" href="'+href+'">'+cover+'<span class="tag">'+theme+'</span>'+title+'<p>'+esc(r.description||'')+'</p><div class="meta"><span>'+left+'</span><span>'+right+'</span></div>'+progress+'</a>';
}
