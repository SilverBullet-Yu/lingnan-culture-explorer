/* 主题索引：七类主题与地区索引等价的入口；暂无路线的主题显示明确空态。 */
import { state, esc, routeForScene, region } from '../store.js';
import { assetBadge } from '../asset-badges.js';
import { TOPICS, TOPIC_ORDER, SCENE_TOPICS } from '../atlas/config.js';
import { missingPage } from './missing.js';

function topicOf(s){return s.topic||SCENE_TOPICS[s.id]||'other'}
function scenesOf(key){return state.data.scenes.filter(function(s){return topicOf(s)===key})}
function sceneCard(s){
  var rg=region(s.region_id);var rt=routeForScene(s.id);
  return '<a class="card topic-scene" href="#scene/'+esc(s.id)+'">'+(s.cover_image?'<img class="region-cover-image" src="'+esc(s.cover_image)+'" alt="'+esc(s.cover_caption||s.title)+'" loading="lazy" width="600" height="360">'+assetBadge(s.cover_image):'')+'<span class="tag">'+esc(rg?rg.name:'')+(rt?' · '+esc(rt.name):'')+'</span><h3>'+esc(s.title)+'</h3><p>'+esc(s.narrative&&s.narrative.story?s.narrative.story.slice(0,72)+'…':'')+'</p><div class="meta"><span>进入场景 →</span></div></a>';
}
function topicIndex(){
  var cards=TOPIC_ORDER.map(function(key){
    var count=scenesOf(key).length;
    return '<a class="card topic-card'+(count?'':' topic-card-empty')+'" href="#topics/'+esc(key)+'"><span class="tag">'+ (count?count+' 个场景':'暂无路线') +'</span><h3>'+esc(TOPICS[key])+'</h3><p>'+(count?'从已有场景进入，看看这个主题在生活里的样子。':'该主题暂无路线，先去其他主题看看吧。')+'</p><div class="meta"><span>'+(count?'查看场景 →':'查看空态 →')+'</span></div></a>'
  }).join('');
  return '<div class="crumb"><a href="#home">文化地图</a> / 主题索引</div><div class="head"><div><span class="tag">按主题浏览</span><h1>主题索引</h1><p>七类主题按调研兴趣排序展示；暂无路线的主题也会保留入口，不会隐藏。</p></div><a class="btn secondary" href="#regions">按地区浏览</a></div><div class="grid cols3">'+cards+'</div><p class="muted" style="margin-top:18px">当前已开放内容主要集中在建筑与民俗；饮食、自然景观、方言与地方词语、非遗技艺、历史人物与故事的主题场景仍在筹备中。</p>';
}
function topicDetail(key){
  if(!TOPICS[key]||key==='all')return missingPage('主题');
  var list=scenesOf(key);
  return '<div class="crumb"><a href="#home">文化地图</a> / <a href="#topics">主题索引</a> / '+esc(TOPICS[key])+'</div><div class="head"><div><span class="tag">主题</span><h1>'+esc(TOPICS[key])+'</h1><p>'+(list.length?'这个主题下的场景来自不同路线，可按兴趣直接进入。':'该主题暂无路线。')+'</p></div><a class="btn secondary" href="#topics">← 返回主题索引</a></div>'
    +(list.length?'<div class="grid">'+list.map(sceneCard).join('')+'</div>':'<div class="empty"><h2>该主题暂无路线</h2><p>可以去建筑与民俗主题看看已有场景，或从地区索引进入。</p><a class="btn" href="#topics">换一个主题</a> <a class="btn secondary" href="#regions">按地区浏览</a></div>');
}
export function topicsPage(key){return key?topicDetail(key):topicIndex()}
