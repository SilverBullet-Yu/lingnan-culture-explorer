/* 探索地区列表 */
import { state } from '../store.js';
import { regionCard } from './region-card.js';
export function regions(){return '<div class="crumb"><a href="#home">文化地图</a> / 探索地区</div><div class="head"><div><h1>探索地区</h1><p>从一座城的生活细节开始，选择你的第一站。</p></div><a class="btn secondary" href="#home">返回文化地图</a></div><div class="grid">'+state.data.regions.map(regionCard).join('')+'</div>'}
