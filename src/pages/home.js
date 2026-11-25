/* 首页专用地图图志。#atlas 仍由既有完整版页面承载。 */
import { atlasMarkup } from '../atlas/render.js';
import { esc, routeById } from '../store.js';

const stations = [
  { city:'广州', code:'440100', region:'广州', tag:'骑楼', id:'route-arcade-market', image:'assets/gz-arcade.webp', alt:'骑楼廊下插画', question:'不进店，行人为什么也能从楼下走过？' },
  { city:'揭阳', code:'445200', region:'普宁', tag:'英歌', id:'route-yingge-before', image:'yingge/assets/yingge-hero.svg', alt:'英歌鼓与双槌', question:'找一找：两支木槌放在鼓的哪一边？' },
];
const icon = path => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" aria-hidden="true"><path d="'+path+'"/></svg>';
const book = icon('M4 5.5h13.5a2 2 0 0 1 2 2V20H6.5A2.5 2.5 0 0 1 4 17.5zm0 12A2.5 2.5 0 0 1 6.5 15H20M8 9h8m-8 3h5');
const compass = '<svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="19" stroke="#8a9b83"/><path d="M24 1v46M1 24h46" stroke="#8a9b83" stroke-width=".7"/><path d="m24 6 6 18-6-3-6 3z" fill="#315645"/><path d="m24 42 6-18-6 3-6-3z" stroke="#315645"/></svg>';
const navItems = [['home','文化地图'],['regions','探索地区'],['topics','主题索引'],['route','文化路线'],['me','我的探索']];
const info = '学习记录仅保存在这台设备的浏览器中。进度、收藏、任务结果与笔记存于 localStorage，跟读录音存于 IndexedDB；两者都不上传。清除浏览器数据，或在「我的探索」中清除全部本机数据后，记录不可恢复（界面设置保留）。';

export function home(){
  const heading = '<div class="n-ink"><div class="n-kicker"><span class="n-stamp" aria-hidden="true">岭</span>田野手记 · 地图总览</div><h1 id="atlas-heading">岭南游纪</h1><p>粤港澳文化地图 <span>／</span> 广东 21 市、香港、澳门</p></div>';
  const menu = '<button type="button" class="n-dir" aria-expanded="false" aria-controls="home-directory">'+book+'目录</button><nav class="n-menu" id="home-directory" aria-label="手记目录" hidden><strong>手记目录</strong>'+navItems.map(([hash,label],i)=>'<a href="#'+hash+'">'+label+'<small aria-hidden="true">'+(i?'→':'当前')+'</small></a>').join('')+'</nav>';
  const markers = '<div class="n-markers" role="group" aria-label="地点手记入口">'+stations.filter(s=>routeById(s.id)).map(s=>'<button type="button" class="n-marker" data-city="'+s.city+'" data-code="'+s.code+'" aria-label="'+s.region+' · '+s.tag+'" aria-controls="home-location-note" aria-pressed="false" hidden><span class="n-mark-label">'+s.tag+'</span><span class="n-pin-dot" aria-hidden="true"></span></button>').join('')+'</div>';
  const note = '<aside class="n-note" id="home-location-note" aria-labelledby="home-note-title" hidden><div class="n-note-tag"></div><button type="button" class="n-note-close" aria-label="关闭地点手记">×</button><img alt=""><h2 id="home-note-title"></h2><p></p><div class="n-note-meta"><span></span><a>进入路线 →</a></div></aside>';
  const tools = '<div class="n-compass" aria-hidden="true">北'+compass+'</div><div class="n-rail"><b>点选地图标记，翻看地点手记</b><small><span class="n-gesture-svg">用下方按钮调整地图</span><span class="n-gesture-3d">拖动平移<span class="n-gesture-wheel"> · 滚轮缩放</span></span></small></div>';
  const privacy = '<aside class="n-data"><button type="button" aria-expanded="false" aria-controls="home-privacy">学习记录仅存本机</button><div id="home-privacy" hidden><p>'+esc(info)+'</p><p>内部演示版 · 素材待授权</p><button type="button" class="n-ack">知道了</button></div></aside>';
  return atlasMarkup({ immersive:true, heading, markers, overlays:menu+note+tools+privacy });
}

export function bindHome(section){
  if(!section)return;
  const q = selector => section.querySelector(selector);
  const note = q('.n-note');
  const markers = [...section.querySelectorAll('.n-marker')];
  const pairs = ['.n-dir','.n-key>button','.n-more','.n-data>button'].map(selector=>{
    const button=q(selector);
    return [button, section.querySelector('#'+button.getAttribute('aria-controls'))];
  });
  const expand = (button,panel,on) => { panel.hidden=!on; button.setAttribute('aria-expanded',String(on)); };
  let active=null;
  function select(marker, moveFocus=false){
    active=marker;
    note.hidden=!marker;
    section.classList.toggle('n-has-note',!!marker);
    markers.forEach(button=>button.setAttribute('aria-pressed',String(button===marker)));
    if(!marker)return;
    const station=stations.find(s=>s.city===marker.dataset.city), route=routeById(station.id);
    q('.n-note-tag').textContent=station.region+' · 地点手记';
    q('.n-note h2').textContent=route.name;
    q('.n-note p').textContent=station.question;
    q('.n-note-meta span').textContent=route.scene_ids.length+' 个学习场景';
    q('.n-note a').setAttribute('href','#route/'+route.id);
    const image=q('.n-note img'); image.src=station.image; image.alt=station.alt;
    if(moveFocus)q('.n-note a').focus({preventScroll:true});
  }
  function closeNote(){ const marker=active; select(null); marker?.focus({preventScroll:true}); }
  pairs.forEach(([button,panel])=>{
    button.onclick=()=>{
      const open=panel.hidden;
      pairs.forEach(([b,p])=>expand(b,p,b===button&&open));
      if(open)select(null);
    };
    panel.addEventListener('click',event=>{
      if(event.target.closest('a')){
        expand(button,panel,false);
        if(event.target.closest('a').hash===location.hash)button.focus();
      }
    });
  });
  section.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    const pair=pairs.find(([,panel])=>!panel.hidden);
    if(pair){expand(...pair,false);pair[0].focus();}
    else if(active)closeNote();
    else return;
    event.preventDefault();
  });
  section.addEventListener('pointerdown',event=>{
    pairs.forEach(([button,panel])=>{if(!panel.hidden&&!panel.contains(event.target)&&!button.contains(event.target))expand(button,panel,false);});
  });
  q('.n-note-close').onclick=closeNote;
  q('.n-ack').onclick=()=>{
    document.querySelector('#lingnan-storage-notice button')?.click();
    expand(...pairs[3],false);
    pairs[3][0].focus();
  };
  markers.forEach(marker=>{
    marker.onclick=event=>{pairs.forEach(([b,p])=>expand(b,p,false));select(marker,event.detail===0);};
    marker.addEventListener('pointerenter',event=>{
      if(event.pointerType==='mouse'&&pairs.every(([,p])=>p.hidden))select(marker);
    });
  });
  q('.atlas-stage').addEventListener('atlas:layout',event=>placeMarkers(section,markers,event.detail));
}

/* 和地图同一绘制周期更新；SVG 重算和 3D 镜头移动后均跟随地理点位。 */
function placeMarkers(section,markers,{points,labels,north}){
  if(Number.isFinite(north))section.querySelector('.n-compass svg').style.transform='rotate('+north+'deg)';
  const stage=section.querySelector('.atlas-stage'), rect=stage.getBoundingClientRect();
  const blocked = labels.map(el=>el.getBoundingClientRect()).filter(b=>b.width&&b.height);
  const move = (box,x,y) => ({left:box.left+x,right:box.right+x,top:box.top+y,bottom:box.bottom+y});
  const intersects = (a,b,gap) => a.left<b.right+gap&&a.right>b.left-gap&&a.top<b.bottom+gap&&a.bottom>b.top-gap;
  const inside = b => b.left>=16&&b.right<=window.innerWidth-16&&b.top>=0&&b.bottom<=window.innerHeight;
  for(const marker of markers){
    const point=points[marker.dataset.code];
    marker.hidden=!point||point[0]<22||point[0]>rect.width-22||point[1]<40||point[1]>rect.height;
    if(marker.hidden)continue;
    marker.style.left=point[0]+'px';marker.style.top=(point[1]-8)+'px';
    for(const prop of ['--label-x','--label-y','--dot-x','--dot-y'])marker.style.removeProperty(prop);
    if(!matchMedia('(max-width:700px)').matches)continue;
    const tag=marker.querySelector('.n-mark-label').getBoundingClientRect(), dot=marker.querySelector('.n-pin-dot').getBoundingClientRect();
    const pins=[[0,0],[0,-4],[0,4],[-8,0],[8,0],[-5,-6],[5,-6],[0,-10],[-10,-4],[10,-4],[0,-15],[-10,-11],[10,-11],[-16,0],[16,0],[-13,7],[13,7],[0,-21]];
    const tags=[[0,0],[-9,0],[9,0],[-17,0],[17,0],[0,-5],[-9,-5],[9,-5],[-17,-5],[17,-5],[-25,3],[25,3],[0,-12],[-12,-12],[12,-12],[-16,13],[16,13],[-20,8],[20,8],[-20,17],[20,17],[0,20],[-24,-5],[24,-5]];
    for(const [dx,dy] of pins){
      const d=move(dot,dx,dy);
      if(!inside(d)||blocked.some(b=>intersects(b,d,3)))continue;
      const fit=tags.find(([x,y])=>{
        const t=move(tag,dx+x,dy+y);
        return inside(t)&&!intersects(t,d,0)&&!blocked.some(b=>intersects(t,b,2));
      });
      if(!fit)continue;
      const [x,y]=fit;
      for(const [prop,value] of [['--label-x',x+dx],['--label-y',y+dy],['--dot-x',dx],['--dot-y',dy]])marker.style.setProperty(prop,value+'px');
      blocked.push(move(tag,dx+x,dy+y),d);
      break;
    }
  }
}
