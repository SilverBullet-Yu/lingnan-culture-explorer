/* 通用音频播放器 markup：由 recorder.js 在 document 级接管播放/慢速/重听事件。 */
import { esc } from '../store.js';
export function playerMarkup(src,label,note,simple,kind){
  if(!src)return '<div class="player"><div class="player-row"><button class="play" disabled aria-label="音频尚未提供">▶</button><div class="bar" role="progressbar" aria-label="播放进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i style="width:0%"></i></div><span>音频待提供</span></div><p class="muted">'+esc(note||'这段音频尚未提供，可先阅读文字内容。')+'</p></div>';
  var acts=simple?'':'<div class="rec-acts"><button class="rec-mini" data-audio-act="slow" aria-pressed="false">0.75× 慢速</button><button class="rec-mini" data-audio-act="replay">重听</button></div>';
  return '<div class="player" data-audio-player data-scene-audio="'+(kind==='required'?'required':'')+'"><div class="player-row"><button class="play" data-audio-act="toggle" aria-pressed="false" aria-label="播放'+esc(label)+'">▶</button><div class="bar" role="progressbar" aria-label="播放进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i style="width:0%"></i></div><span>'+esc(label)+'</span></div>'+acts+'<audio class="rec-src"'+(kind?' data-audio-kind="'+esc(kind)+'"':'')+' src="'+esc(src)+'" preload="none"></audio><p class="muted">'+esc(note||'')+'</p></div>';
}
