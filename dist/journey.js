import {createJourneyGame,getJourneyLesson,startJourneyGame,pressJourneyKey,tickJourneyGame,setJourneyPaused,snapshotJourney,advanceJourneyCheckpoint} from './journey-game.js';
import {readEnvelope,writeEnvelope,openJourney,awardJourney,ENVELOPE_KEY} from './journey-store.js';
import {createRoomWorld} from './room-world.js';
import {createMailWorld} from './mail-world.js';
import {createJourneyStoneWorld} from './journey-stone-world.js';
import {createFeedback,isControlActivation} from './feedback.js';
import {getFinger} from './curriculum.js';
import {getAccuracy,STORAGE_KEY} from './adventure.js';
const $=id=>document.getElementById(id),label=k=>k==='Space'?'空格':k==='Backspace'?'退格':k??'';
const requested=Number(new URL(location.href).searchParams.get('level')||5),level=getJourneyLesson(Number.isInteger(requested)&&requested>=5&&requested<=12?requested:5);
let storage;try{storage=localStorage;}catch{}
const loaded=readEnvelope(storage),envelope=loaded.envelope;let persistent=loaded.persistent;
let {state,awarded,notice}=openJourney(envelope,level.id),world,raf,previous=performance.now(),lastSave=0,conflict=false;
setJourneyPaused(state,!['ready','complete'].includes(state.phase));
if(state.phase==='complete'&&!awarded)awarded=awardJourney(envelope.progress,state);
const root=document.querySelector('.journey-game');root.classList.add('mode-'+level.mode);
try{world=({room:createRoomWorld,mail:createMailWorld,stone:createJourneyStoneWorld}[level.mode])($('journeyWorld'));}catch(e){console.error(e);$('catchError').hidden=false;}
const modeTitle={room:'整理小屋',mail:'送邀请信',stone:'跳石过河'};
$('lessonTitle').textContent=`${level.id}. ${modeTitle[level.mode]}`;document.title=`第${level.id}关 ${modeTitle[level.mode]} · 敲敲岛`;
$('migrationNotice').textContent=notice;$('migrationNotice').hidden=!notice;
const feedback=createFeedback(value=>{$('catchFeedback').classList.toggle('visible',!!value);for(const el of document.querySelectorAll('[data-key]'))el.classList.toggle('wrong',value?.pressed===el.dataset.key);if(value){$('actualKey').textContent=label(value.pressed);$('feedbackText').textContent=`按到了 ${label(value.pressed)}，试试${getFinger(value.target)?.label??''} ${label(value.target)}`;}});
function save(){if(conflict)return;envelope.journeys[level.id]={snapshot:snapshotJourney(state),awarded,notice};envelope.lastJourney=state.phase==='complete'?null:level.id;envelope.progress.active=null;persistent=writeEnvelope(storage,envelope);$('catchSave').textContent=persistent?'进度保存在本机 · 请使用实体键盘和英文输入法':'暂时无法保存，请保持页面打开 · 实体键盘练习';}
function announce(){$('catchAnnouncement').textContent=state.target?`下一个键 ${label(state.target)}，${getFinger(state.target)?.label??''}`:state.phase==='acting'?'小熊正在完成任务，请看场景':state.phase==='checkpoint'?'这段路已走完，准备好再继续':'本关完成，可以重玩或回地图';}
function render(){const done=state.phase==='complete',ready=state.phase==='ready',moving=state.phase==='acting',checkpoint=state.phase==='checkpoint',task=level.tasks[state.taskIndex];
$('fruitCount').textContent=level.tasks.slice(0,state.taskIndex).filter(t=>t.kind!=='space').length;$('fruitTotal').textContent=level.tasks.filter(t=>t.kind!=='space').length;
$('startCatch').hidden=!ready;$('pauseCatch').hidden=ready||done;$('catchDone').hidden=!done;$('catchPause').hidden=!state.paused||ready||done;$('journeyCheckpoint').hidden=!checkpoint||state.paused;root.classList.toggle('complete-mode',done);
$('keyHints').replaceChildren();const keys=[...new Set([...(level.mode==='stone'?level.newKeys:[]),...(state.target?[state.target]:[])])];for(const k of keys){const el=document.createElement('span');el.className='key'+(k===state.target?' active':'')+(k.length>1?' wide':'');el.dataset.key=k;el.textContent=label(k);$('keyHints').append(el);}
const finger=getFinger(state.target);$('fingerCue').textContent=done?'谢谢你，手指放松一下':moving?'看，小熊正在行动':checkpoint?'准备好，再走下一段':`${finger?.label??'手指'}轻按 ${label(state.target)}`;
$('returnCue').textContent=finger?.returnHint??'慢慢来，每一步都算数';
$('sceneInstruction').textContent=level.mode==='room'?'拼完一个单词，小熊抱起物品送回原位':level.mode==='mail'?'写好一句邀请，小熊沿小路送到朋友家':'看下一块石头，按对字母向前跳一步';
let title='慢慢来，也很棒',text='按错不会重来，目标会留在原地等你';
if(ready){title='准备好，再出发';text=level.mode==='room'?(level.id===11?'CUPP 多了一个 P，先按退格把标签改成 CUP':'按顺序拼完物品单词，空格表示收好、准备下一件'):level.mode==='mail'?'按顺序写完短句，词之间记得用拇指按空格':level.subtitle;}
else if(moving){title=level.mode==='stone'?'轻轻跳，稳稳落':level.mode==='room'?'抱起来，送回家':'邀请信出发啦';text='小熊行动时不用连按，等它停稳再继续';}
else if(state.target==='Space'){title='给词语留一点空隙';text=level.mode==='room'?'这件收好啦，用拇指按空格，再整理下一件':'用拇指按空格，让两个单词分开';}
else if(state.target==='Backspace'){title='改好标签，再收拾';text='CUPP 多了一个 P，用右手小指按退格，变成 CUP';}
else if(checkpoint){title='这一段稳稳走完了';text='没有倒计时，休息好再继续';}
$('gentleTitle').textContent=title;$('gentleText').textContent=text;
$('checkpointText').textContent=`已经练过 ${state.index} / ${state.sequence.length} 个按键，准备好再走下一段`;
$('doneHeading').textContent=level.mode==='room'?'小屋收拾好啦！':level.mode==='mail'?'邀请都送到啦！':'石头路走完啦！';$('doneText').textContent=`${level.reward.icon} ${level.reward.name}已留在小岛 · 本轮准确率 ${Math.round(getAccuracy(state)*100)}%`;$('accuracyTip').textContent='可以再练一次，也可以回地图自由选关';
}
function start(){if(!world||conflict)return;feedback.clear();notice='';$('migrationNotice').hidden=true;startJourneyGame(state);render();announce();save();$('startCatch').blur();}
function pause(){if(!world||state.paused||['ready','complete'].includes(state.phase))return;feedback.clear();setJourneyPaused(state,true);render();save();$('resumeCatch').focus({preventScroll:true});}
function resume(){if(conflict)return;feedback.clear();setJourneyPaused(state,false);render();announce();save();$('resumeCatch').blur();if(state.phase==='checkpoint')$('nextRoute').focus();}
function nextRoute(){if(conflict||state.paused)return;feedback.clear();advanceJourneyCheckpoint(state);render();announce();save();$('nextRoute').blur();}
$('startCatch').onclick=start;$('pauseCatch').onclick=pause;$('resumeCatch').onclick=resume;$('nextRoute').onclick=nextRoute;
$('replayCatch').onclick=()=>{feedback.clear();state=createJourneyGame(level.id,envelope.progress);awarded=false;render();save();$('startCatch').focus({preventScroll:true});};
window.addEventListener('keydown',e=>{const modal=!$('catchPause').hidden?$('catchPause'):!$('catchDone').hidden?$('catchDone'):!$('journeyCheckpoint').hidden?$('journeyCheckpoint'):null;if(modal){if(e.key==='Tab'){const all=[...modal.querySelectorAll('button,a')],first=all[0],last=all.at(-1);if(!all.includes(document.activeElement)||(!e.shiftKey&&document.activeElement===last)){e.preventDefault();first.focus();}else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}}return;}
if(!world||conflict||e.ctrlKey||e.altKey||e.metaKey||e.shiftKey||e.repeat)return;if(e.isComposing||e.keyCode===229||e.which===229){$('sceneInstruction').textContent='请切换到英文输入法，再按场景中的字母';return;}if(e.key==='Escape'){pause();return;}if(isControlActivation(e,document.activeElement))return;if(state.phase==='ready'&&e.key==='Enter'){e.preventDefault();start();return;}
const result=pressJourneyKey(state,e);if(result.kind==='wrong'){e.preventDefault();feedback.wrong(result.pressed??e.key,state.target);save();}else if(result.kind!=='ignored'){e.preventDefault();feedback.clear();render();announce();save();}});
window.addEventListener('storage',e=>{if(e.storageArea!==storage||![STORAGE_KEY,ENVELOPE_KEY,null].includes(e.key))return;conflict=true;feedback.clear();setJourneyPaused(state,true);render();$('catchDone').hidden=true;$('journeyCheckpoint').hidden=true;$('catchPause').hidden=false;$('pauseHeading').textContent='另一页面更新了学习记录';$('catchPause').querySelector('p').textContent='为避免覆盖新记录，请刷新后继续';$('resumeCatch').textContent='刷新并继续';$('resumeCatch').onclick=()=>location.reload();$('resumeCatch').focus();});
window.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('pagehide',()=>{save();feedback.clear();cancelAnimationFrame(raf);world?.dispose();});window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
function frame(now){const dt=Math.max(0,(now-previous)/1000);previous=now;const changed=tickJourneyGame(state,dt);if(changed){if(state.phase==='complete'&&!awarded)awarded=awardJourney(envelope.progress,state);render();announce();save();if(state.phase==='complete')$('replayCatch').focus({preventScroll:true});else if(state.phase==='checkpoint')$('nextRoute').focus({preventScroll:true});}world?.render(state,dt);if(now-lastSave>1000&&!state.paused&&!['ready','complete'].includes(state.phase)){save();lastSave=now;}raf=requestAnimationFrame(frame);}
render();save();if(state.paused)$('resumeCatch').focus();else if(state.phase==='complete')$('replayCatch').focus();else $('startCatch').focus();raf=requestAnimationFrame(frame);
