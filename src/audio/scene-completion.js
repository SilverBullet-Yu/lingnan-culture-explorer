import { state, save, checkRoute, isDone, routeForScene } from '../store.js';

function routeSceneCompletion(id){
  var steps=state.sceneSteps[id]||{};
  if(!steps.read||!steps.interaction||(!steps.audio&&!steps.fallback)||isDone(id))return;
  state.progress[id]={done:true,mode:steps.fallback&&!steps.audio?'fallback':'normal',at:new Date().toISOString()};
  checkRoute();save();
  var tag=document.querySelector('[data-scene-status="'+id+'"]');
  if(tag)tag.textContent=tag.textContent.replace('未完成',steps.fallback&&!steps.audio?'降级完成':'已完成');
  var message=document.querySelector('[data-scene-completion]');
  if(message)message.textContent=steps.fallback&&!steps.audio?'降级完成：已阅读文字稿并提交理解动作。':'已完成：图文、理解动作和声音均已完成。';
  /* 在同一页完成本路线最后一个场景时，任务卡不会随路由重渲；此处就地解除禁用 */
  var submit=document.querySelector('#task-submit');
  var route=routeForScene(id);
  if(submit&&submit.disabled&&route&&route.scene_ids.every(isDone)){
    submit.disabled=false;
    var hint=submit.parentElement&&submit.parentElement.querySelector('.muted');
    if(hint)hint.remove();
  }
}
function step(id,key,value){
  state.sceneSteps[id]=state.sceneSteps[id]||{};
  state.sceneSteps[id][key]=value;
  if(!save()){
    var storageNotice=document.querySelector('[data-scene-completion]');
    if(storageNotice)storageNotice.textContent='本机存储不可用：步骤已暂存在当前页面，请检查浏览器存储权限后重试。';
    return false;
  }
  routeSceneCompletion(id);
  return true;
}

document.addEventListener('click',function(event){
  var read=event.target.closest('[data-scene-read]');
  if(read){var id=read.dataset.sceneRead;if(!step(id,'read',true))return;read.disabled=true;read.textContent='图文已确认阅读';var status=document.querySelector('[data-step-state="read"]');if(status)status.textContent='已完成';return}
  var choice=event.target.closest('[data-understanding]');
  if(choice){choice.parentElement.querySelectorAll('[data-understanding]').forEach(function(x){x.classList.remove('selected');x.setAttribute('aria-checked','false')});choice.classList.add('selected');choice.setAttribute('aria-checked','true');return}
  var submit=event.target.closest('[data-understanding-submit]');
  if(submit){var picked=document.querySelector('#scene-interaction .option.selected');if(!picked){var status0=document.querySelector('[data-step-state="interaction"]');if(status0)status0.textContent='请先选择一项';return}var sceneId=submit.dataset.understandingSubmit;if(!step(sceneId,'interaction',true))return;submit.disabled=true;submit.textContent='理解动作已提交';var status1=document.querySelector('[data-step-state="interaction"]');if(status1)status1.textContent='已完成';return}
  var fallback=event.target.closest('[data-scene-fallback]');
  if(fallback){var fallbackId=fallback.dataset.sceneFallback;if(!state.sceneSteps[fallbackId]||!state.sceneSteps[fallbackId].read){var completion=document.querySelector('[data-scene-completion]');if(completion)completion.textContent='请先确认已阅读图文卡，再使用文字稿替代。';return}if(!step(fallbackId,'fallback',true))return;fallback.disabled=true;fallback.textContent='已使用文字稿替代';var audioState=document.querySelector('[data-step-state="audio"]');if(audioState)audioState.textContent='声音：已使用文字稿替代';return}
});

document.addEventListener('ended',function(event){
  var audio=event.target;
  if(!audio.matches('audio[data-audio-kind="required"]'))return;
  var player=audio.closest('[data-audio-player]');
  var card=audio.closest('.scene-learning-card');
  var readButton=card&&card.querySelector('[data-scene-read]');
  var id=readButton&&readButton.dataset.sceneRead;
  if(!id)return;
  if(!step(id,'audio',true))return;
  var status=document.querySelector('[data-step-state="audio"]');
  if(status)status.textContent='声音：已播放完整';
  var fallback=document.querySelector('[data-scene-fallback]');
  if(fallback){fallback.disabled=true;fallback.textContent='声音已完成'}
  if(player)player.setAttribute('data-audio-complete','true');
},true);
