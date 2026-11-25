/* 文化圈页：广府/客家/潮汕的介绍、主题筛选与相关地区 */
import { state, fav, esc, safeUrl } from '../store.js';
import { assetBadge } from '../asset-badges.js';
import { CULTURES, TOPICS, TOPIC_ORDER, SCENE_TOPICS } from '../atlas/config.js';
import { missingPage } from './missing.js';
import { regionCard } from './region-card.js';
import { yinggeEntry } from './yingge-entry.js';
export function culturePage(key){
  var c=CULTURES[key];if(!c||key==='other')return missingPage('文化圈');
  if(state.atlas.culture!==key){state.atlas.culture=key;state.atlas.topic='all'}
  var topic=state.atlas.topic;
  function topicOf(s){return s.topic||SCENE_TOPICS[s.id]||'other'}
  var matches=state.data.scenes.filter(function(s){return c.regions.includes(s.region_id)&&(topic==='all'||topicOf(s)===topic)});
  var pid='photo:'+key;
  return '<section class="culture-overview" style="--accent:'+c.color+'"><div class="crumb"><a href="#home">文化地图</a> / '+esc(c.name)+'</div><div class="columns"><div><span class="tag">'+esc(c.name)+'</span><h1>'+esc(c.subtitle)+'</h1><p class="muted">'+esc(c.desc)+'</p><div class="culture-keywords">'+c.keywords.map(function(w){return '<span>'+esc(w)+'</span>'}).join('')+'</div><a class="btn secondary" href="#home">← 返回文化地图</a></div><figure class="culture-photo"><img src="assets/'+esc(c.photo)+'" alt="'+esc(c.caption)+'" width="600" height="360"><figcaption>'+assetBadge(c.photo)+esc(c.caption)+' · <a href="'+esc(safeUrl(c.source))+'" target="_blank" rel="noopener noreferrer">文化资料 ↗</a> · <button class="fav-chip'+(fav(pid)?' on':'')+'" data-fav="'+pid+'" data-fav-off="☆ 收藏图片" data-fav-on="★ 已收藏" aria-pressed="'+fav(pid)+'">'+(fav(pid)?'★ 已收藏':'☆ 收藏图片')+'</button></figcaption></figure></div>'+(key==='chaoshan'?yinggeEntry():'')+'<div class="head"><div><h2>从文化走进场景</h2><p>选择一个主题，开始具体的生活情境探索。</p></div></div><div class="culture-topic-row" role="group" aria-label="场景主题">'+['all'].concat(TOPIC_ORDER).map(function(t){return '<button data-culture-topic="'+t+'" aria-pressed="'+(t===topic)+'">'+esc(TOPICS[t])+'</button>'}).join('')+'</div>'+ (matches.length?'<div class="grid">'+matches.map(function(s){var r=state.data.regions.find(function(r){return r.id===s.region_id});return '<article class="card"><span class="tag">'+esc(r?r.name:'')+' · '+esc(TOPICS[topicOf(s)]||'')+'</span><h3>'+esc(s.title)+'</h3><p>通过图文、文化任务和地方表达，认识日常生活。</p><div class="meta"><a href="#scene/'+esc(s.id)+'">进入学习场景 →</a></div></article>'}).join('')+'</div>':'<div class="culture-empty">'+(key==='kejia'?'客家文化的学习场景尚未上线。目前可以通过图片和文化介绍认识客家，或返回地图探索广府与潮汕。':'这个主题的学习场景尚未上线，请选择其他主题。')+'</div>')+'<div class="head"><h2>探索相关地区</h2></div>'+(c.regions.length?'<div class="grid">'+state.data.regions.filter(function(r){return c.regions.includes(r.id)}).map(regionCard).join('')+'</div>':'<p class="muted">客家地区的学习内容准备中。</p>')+'</section>';
}
