import{SPECS,create,press,tick,snapshot,restore,getRequiredKeys,getStageInfo,advanceStage}from'./engine.js';
import{STORAGE_KEY,load,save,recordKeys,hasConflict}from'./store.js';
import{getFinger}from'../curriculum.js';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),practice=params.get('practice');
const practiceGroups=['FJ','DK','SL','AGH','EI','RU','TY','QW','OP','VM','BN','CXZ','ABCDEFGHIJKLMNOPQRSTUVWXYZ','Space','Backspace'];
const requestedLevel=Number(params.get('level')),isPractice=practiceGroups.includes(practice),level=Number.isInteger(requestedLevel)?Math.max(1,Math.min(12,requestedLevel)):1,spec=SPECS.find(s=>(s.id??s.level)===level);
const replayRequested=!isPractice&&params.get('replay')==='1';
let data=load(),restored=restore(data.sessions[level]),state=!replayRequested&&restored?.level===level?restored:create(level),storageConflict=false,renderFailed=false,world=null,warmKeys=[],warmIndex=0,warmPurpose='',warmWrong=null,warmWrongUntil=0,composing=false,held=new Set(),captured=new Set(),finishedShown=false,lastTime=performance.now(),saveClock=0,practiceCount=0,completionDismissed=false,transitionGate=null,replayPending=replayRequested;
const display=k=>k==='Space'?'空格':k==='Backspace'?'退格':k||'';
const copy={catch:['🍐','按一次字母','🧸','接住果子',level===2?'先看清单接水果，再为不同朋友选篮子，最后把梨和桃装成配对盒。按场景里的提示就好':'先接单个果子，再试着连按看得见的小串，最后照清单为朋友装篮子'],stone:['🪨','看清短串','🧸','一步一步跳',level===4?'两条短串都看得见。先按第一块石头选一串，再按后面的字母连跳':'每块石头对应一个字母。按一次就跳一步，可以慢慢按，也可以连贯输入'],forest:['🌳','读场景线索','🧸','沿路找朋友',level===6?'先选一个目的地，再看路口线索。两件东西都拿到，就能带去野餐':'朋友给你一条线索。看看池塘、蘑菇和路牌，按路牌字母选路。走错会带你回来'],room:['📦','先选物品','🧸','再选摆放处',level===8?'房间已经摆好了，现在要换个用途。看每件物品旁的新位置提示，先拿起，再改放；搬完还能自由布置':'看物品旁的位置提示，先按物品标签拿起，再按位置标签放下。熊会把它送回自己的位置'],card:['✉️','看完整目标','✎','修好卡片',level===10?'先用 Backspace 退格删掉末尾多出或写错的字，再补上正确的字。只改末尾':'完整单词一直显示。前面的字已经写好，找到最后缺的那个字母，帮小熊补上'],mail:[level===12?'🧺':'✉️',level===12?'选择伙伴':'写好邀请','🧸',level===12?'一起玩野餐':'朋友来野餐',level===12?'朋友已经收到邀请，正在野餐地等你。每段选一位伙伴，写一句话，一起问候、游戏和分享点心':'给所有朋友写一张共同邀请，分三小段写好。两个词之间轻按空格，写完后一起出发']};
$('title').textContent=isPractice?'自由练习':`第 ${level} 关 · ${spec.title}`;
const dialogs=[...document.querySelectorAll('dialog')];
const activationCode=code=>['Space','Enter','NumpadEnter'].includes(code);
const modalRelease=new Set();
$('world').setAttribute('tabindex','-1');
function openDialog(id){
 if($(id).open)return;
 // A key held during the last action must never activate a newly shown button.
 // Focus a heading first; Tab still reaches the primary button immediately.
 if(id==='stage-finished'||id==='finished')transitionGate={id,blocked:new Set([...held].filter(activationCode))};
 $(id).showModal();
 if(id==='stage-finished')$('stage-finish-title').focus();
 if(id==='finished')$('finish-title').focus();
}
function closeDialog(id){
 if(!$(id).open)return;
 // Native dialog dismissal returns focus to its opener. A help/pause button
 // would then consume the next Space, so return to the typing region instead.
 for(const code of held)if(activationCode(code))modalRelease.add(code);
 $(id).close();if(transitionGate?.id===id)transitionGate=null;
 if(!dialogs.some(d=>d.open))$('world').focus({preventScroll:true});
}
function transitionAllowed(event){return !storageConflict&&!renderFailed&&!(event?.detail===0&&transitionGate?.blocked.size);}
function notice(text){$('status-note').textContent=text;}
function stopForConflict(){if(storageConflict)return;storageConflict=true;state.paused=true;held.clear();captured.clear();warmWrong=null;for(const d of dialogs)if(d.open)d.close();notice('另一页更新了预览记录，请回地图后再继续');$('resume').disabled=true;$('restart').disabled=true;openDialog('paused');}
function consumeReplay(){
 if(!replayPending)return;
 const query=new URLSearchParams(location.search);query.delete('replay');const search=query.toString();
 // Replay is a one-time command. The newly saved round must resume on refresh.
 try{history.replaceState(history.state,'',`${location.pathname}${search?'?'+search:''}${location.hash}`);replayPending=false;}catch{}
}
function persist(){if(storageConflict)return false;if(!isPractice){data.sessions[level]=snapshot(state);data.lastLevel=level;if(state.solved||state.phase==='complete'){if(!data.completed.includes(level))data.completed.push(level);}}if(save(data)){consumeReplay();if($('status-note').textContent==='浏览器没有保存成功，暂时不要关闭这一页')notice('');return true;}if(hasConflict(data))stopForConflict();else{notice('浏览器没有保存成功，暂时不要关闭这一页');if($('finished').open)$('finish-copy').textContent='这一关已经完成，但浏览器暂时没有保存成功。请留在这一页，稍后再按下一步重试';}return false;}
function keyboard(target,wrong){$('keyboard').innerHTML='';for(const row of ['QWERTYUIOP','ASDFGHJKL;','ZXCVBNM',['Space','Backspace']]){const r=document.createElement('div');r.className='keyboard-row';for(const key of row){const k=document.createElement('span');k.className=`keyboard-key ${key===target?'active':''} ${key===wrong?'error':''} ${'FJ;'.includes(key)?'home':''} ${key.length>1?'wide':''}`;k.textContent=display(key);if(key===';'){k.title='右手小指的基准键，只作定位提示';k.setAttribute('aria-label','分号，右手小指的基准键，只作定位提示');}r.append(k);}$('keyboard').append(r);}}
function showWarm(){if(storageConflict)return;const key=warmKeys[warmIndex];if(!key){closeDialog('warmup');warmPurpose='';persist();lastTime=performance.now();return;}const finger=getFinger(key);$('warmup-step').textContent=isPractice?`自由练习 · 已按对 ${practiceCount} 次`:`先认键 ${warmIndex+1} / ${warmKeys.length}`;$('warmup-key').textContent=display(key);$('warmup-key').classList.toggle('error',!!warmWrong);$('warmup-finger').textContent=finger?.label||'';$('warmup-return').textContent=key==='Space'?'空格把两个词分开，用拇指轻轻按':key==='Backspace'?`退格会删除末尾一个字，不是 Delete 键。${finger.returnHint}`:finger?.returnHint||'';$('warmup-feedback').textContent=warmWrong?`刚才按了 ${display(warmWrong)}，试试 ${display(key)}`:'轻按一次，不用长按';keyboard(key,warmWrong);$('practice-end').hidden=!isPractice;openDialog('warmup');}
function prepareKeys(keys,purpose='task'){const missing=[...new Set(keys)].filter(k=>!data.practiced.includes(k));if(!missing.length)return false;warmKeys=missing;warmIndex=0;warmPurpose=purpose;warmWrong=null;showWarm();return true;}
function startTask(){if(storageConflict||renderFailed)return;closeDialog('intro');if(showCheckpoint())return;if(!prepareKeys(getRequiredKeys(state),'entry'))lastTime=performance.now();}
function showIntro(){if(storageConflict)return;const c=copy[spec.mode],stage=getStageInfo(state);$('intro-title').textContent=spec.title;$('intro-copy').textContent=state.version<3?stage.description:stage.index?stage.description:c[4];$('intro-demo').innerHTML=`${c[0]} <span>${c[1]}</span> → ${c[2]} <span>${c[3]}</span>`;$('intro-progress').textContent=(state.version<3?`接着第 ${stage.number} / ${stage.count} 段 · 上次进度保留，重玩可体验调整后的任务`:state.migrationNotice)||((state.accepted.length||stage.index)?`接着第 ${stage.number} / ${stage.count} 段 · ${stage.title}，已完成的操作都还在`:'每关三小段，每一段都有新变化');openDialog('intro');}
function pause(){if(renderFailed||isPractice||dialogs.some(d=>d.open))return;state.paused=true;held.clear();captured.clear();persist();openDialog('paused');}
function resume(){if(storageConflict||renderFailed)return;state.paused=false;closeDialog('paused');held.clear();captured.clear();lastTime=performance.now();persist();}
function restart(){if(storageConflict)return;if(!confirm('从头再玩这一关？已完成记录和练过的字母会保留'))return;state=create(level);finishedShown=false;completionDismissed=false;for(const d of dialogs)if(d.open)d.close();persist();showIntro();}
$('intro-next').onclick=startTask;$('pause').onclick=pause;$('resume').onclick=resume;$('restart').onclick=restart;
$('continue-stage').onclick=event=>{
 if(!transitionAllowed(event)||!state.stageReady)return;
 if(!advanceStage(state))return;
 closeDialog('stage-finished');finishedShown=false;completionDismissed=false;
 persist();if(storageConflict)return;
 if(!prepareKeys(getRequiredKeys(state),'stage'))lastTime=performance.now();
 renderHUD();
};
$('replay').onclick=event=>{if(!transitionAllowed(event))return;state=create(level);finishedShown=false;completionDismissed=false;closeDialog('finished');persist();showIntro();};
$('next-level').onclick=event=>{
 if(!transitionAllowed(event)||!(state.solved||state.phase==='complete'))return;
 if(!persist())return;
 if(level===12){location.href='./';return;}
 const next=level+1,nextSession=restore(data.sessions[next]),canResume=nextSession?.level===next&&!nextSession.solved&&nextSession.phase!=='complete';
 const replay=!canResume&&(data.completed.includes(next)||nextSession?.solved||nextSession?.phase==='complete');
 location.href=`play.html?level=${next}${replay?'&replay=1':''}`;
};
$('keep-arranging').onclick=event=>{if(!transitionAllowed(event))return;completionDismissed=true;closeDialog('finished');};$('practice-end').onclick=()=>location.href='./';
$('help').onclick=()=>{if(renderFailed||storageConflict||dialogs.some(d=>d.open))return;held.clear();captured.clear();state.paused=true;const keys=[...new Set(getRequiredKeys(state))];$('finger-detail').textContent=keys.map(k=>`${display(k)}：${getFinger(k)?.label||''}`).join('　');openDialog('finger-dialog');};$('close-help').onclick=()=>{if(storageConflict)return;closeDialog('finger-dialog');state.paused=false;lastTime=performance.now();};
for(const d of dialogs)d.addEventListener('cancel',e=>{e.preventDefault();if(d.id==='paused')resume();else if(d.id==='finger-dialog')$('close-help').click();});
function normalize(e){if(e.key===' '||e.code==='Space')return'Space';if(e.key==='Backspace')return'Backspace';return /^[a-z]$/i.test(e.key)?e.key.toUpperCase():null;}
window.addEventListener('keydown',e=>{
 const key=normalize(e),controlSpace=['BUTTON','A'].includes(document.activeElement?.tagName)&&key==='Space'&&!$('warmup').open;
 if(e.ctrlKey||e.metaKey||e.altKey||e.isComposing||composing||e.keyCode===229)return;
 // Keep browser control activation available outside the typing warmup. For
 // captured keys, repeated keydowns must also suppress scroll/back navigation.
 if(e.repeat||held.has(e.code)||transitionGate?.blocked.has(e.code)||modalRelease.has(e.code)){if(activationCode(e.code)||captured.has(e.code)||(key&&!controlSpace))e.preventDefault();return;}
 held.add(e.code);
 if(e.key==='Escape'){if(!dialogs.some(d=>d.open)){e.preventDefault();pause();held.add(e.code);captured.add(e.code);}return;}
 if(!key||controlSpace)return;
 e.preventDefault();captured.add(e.code);
 if(storageConflict)return;
 if($('warmup').open){
  if(key===warmKeys[warmIndex]){recordKeys(data,[key]);practiceCount++;warmWrong=null;warmIndex++;if(isPractice&&warmIndex>=warmKeys.length)warmIndex=0;persist();showWarm();}
  else{warmWrong=key;warmWrongUntil=performance.now()+1100;showWarm();}
  return;
 }
 if(dialogs.some(d=>d.open)||state.paused||isPractice)return;
 const result=press(state,key);if(result.status==='accepted'||result.status==='queued')recordKeys(data,[key]);persist();
 if(!state.action&&!state.paused)prepareKeys(getRequiredKeys(state));renderHUD();
});
window.addEventListener('keyup',e=>{if(transitionGate?.blocked.has(e.code)){e.preventDefault();transitionGate.blocked.delete(e.code);}if(modalRelease.delete(e.code))e.preventDefault();held.delete(e.code);captured.delete(e.code);});
window.addEventListener('compositionstart',()=>{composing=true;notice('请切换到英文输入法，再按字母键');});
window.addEventListener('compositionend',()=>{composing=false;held.clear();captured.clear();modalRelease.clear();});
window.addEventListener('blur',()=>{composing=false;held.clear();captured.clear();modalRelease.clear();pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){composing=false;held.clear();captured.clear();modalRelease.clear();pause();}});
window.addEventListener('pagehide',persist);
window.addEventListener('storage',e=>{if((e.key===STORAGE_KEY||e.key===null)&&(!e.storageArea||e.storageArea===window.localStorage))stopForConflict();});
function renderHUD(){
 const error=state.wrongKey&&state.wrongUntil>0,pending=state.pendingKey;
 const queued=Array.isArray(state.queue)?state.queue:[],received=pending?[pending]:queued;
 $('message').textContent=error?`刚才按了 ${display(state.wrongKey)} · ${state.message||'看一看场景里的提示，再试一次'}`:state.message||'';
 document.querySelector('.hintbar').classList.toggle('error',!!error);
 const finishedUI=(state.solved||state.phase==='complete')&&!completionDismissed;
 const choices=(state.choices||[]).filter(c=>!c.disabled&&(spec.mode==='room'||!c.done)).map(c=>c.key),keys=finishedUI?[]:[...new Set(received.length?[...received,...(state.target?[state.target]:[])]:state.target?[state.target]:choices)].slice(0,5);
 $('key-hints').innerHTML='';
 for(const key of [...keys,...(error&&!keys.includes(state.wrongKey)?[state.wrongKey]:[])]){
  const el=document.createElement('span');el.className=`key-chip ${error&&key===state.wrongKey?'error':''}`;el.textContent=received.includes(key)?`${display(key)} 已接收`:display(key);
  if(received.includes(key))el.setAttribute('aria-label',`${display(key)}，已接收，等待当前动作完成`);
  $('key-hints').append(el);
 }
 $('finger-hint').textContent=received.length?`${received.map(display).join(' → ')} · 已接收，按顺序完成，不用再按`:keys.map(k=>`${display(k)} · ${getFinger(k)?.label||''}`).join('　')||(state.stageReady?'这一段完成，准备好后继续':state.solved||state.phase==='complete'?(level===12?'冒险完成啦，可以回地图再挑一关':'完成啦，可以继续下一关或回地图'):'小熊正在行动，稍等它走稳');
 const lesson=getStageInfo(state);$('stage-progress').textContent=isPractice?'自由练习':`${lesson.title} · 第 ${lesson.number} / ${lesson.count} 段`;$('progress').textContent=isPractice?'慢慢练':`本段 ${state.progress||0} / ${state.total||1}`;$('lesson-progress').setAttribute('aria-label',isPractice?'自由练习':`第 ${lesson.number} 段，共 ${lesson.count} 段，${lesson.title}；本段完成 ${state.progress||0}，共 ${state.total||1}`);
}
function showCheckpoint(){
 if(storageConflict||isPractice)return false;
 const stage=getStageInfo(state);
 if(state.stageReady){
  if(!$('stage-finished').open){
   const saved=persist();if(storageConflict)return true;
   $('stage-save-note').textContent=saved?'进度会留在这里，准备好再继续':'浏览器暂时没有保存成功，请先留在这一页';
   $('stage-finish-step').textContent=`第 ${stage.number} / ${stage.count} 段`;
   $('stage-finish-title').textContent=`${stage.title}完成啦！`;
   const nextState=restore(snapshot(state)),nextStage=nextState&&advanceStage(nextState)?getStageInfo(nextState):null;
   const nextTitle=nextStage?.title||['热身','变化','小挑战'][stage.index+1];
   $('stage-finish-copy').textContent=`接下来是${nextTitle}：${nextStage?.description||'换一种任务，再试试刚才练过的键'}。没有倒计时`;
   $('continue-stage').textContent=`继续第 ${stage.number+1} 段 · ${nextTitle}`;
   openDialog('stage-finished');
  }
  return true;
 }
 if((state.phase==='complete'||state.solved)&&!finishedShown&&!completionDismissed){
  const saved=persist();if(storageConflict)return true;
  finishedShown=true;$('finish-title').textContent=level===12?'今天的野餐完成啦！':state.legacyCompleted?'小熊的任务完成啦！':'三段都完成啦！';
  const nextSession=level<12?restore(data.sessions[level+1]):null,nextPartial=nextSession?.level===level+1&&!nextSession.solved&&nextSession.phase!=='complete';
  $('finish-copy').textContent=!saved?'这一关已经完成，但浏览器暂时没有保存成功。请留在这一页，稍后再按下一步重试':level===12?'第 12 关完成啦，回地图看看这次冒险。练过的字母和完成记录都会留下':`${state.legacyCompleted?'这一关的完成记录已经保留':'这一关已经记在预览地图上'}。${nextPartial?'下一关会接着上次的进度':'准备好就去下一关，也可以重玩这一关'}`;
  $('next-level').textContent=level===12?'完成冒险 · 回地图':`下一关 · 第 ${level+1} 关`;
  $('keep-arranging').hidden=spec.mode!=='room';openDialog('finished');return true;
 }
 return false;
}
async function init(){if(replayPending)persist();try{const sources={catch:['./orchard-world.js','createOrchardWorld'],stone:['./river-world.js','createRiverWorld'],forest:['./forest-world.js','createForestWorld'],room:['./pairing-world.js','createPairingWorld'],card:['./invitation-world.js','createInvitationWorld'],mail:['./invitation-world.js','createInvitationWorld']};const [path,fn]=sources[spec.mode];const mod=await import(path);world=mod[fn]($('world'));world.update(state,0);}catch(e){$('render-error').hidden=false;console.error(e);if(!isPractice){renderFailed=true;state.paused=true;$('pause').disabled=true;$('help').disabled=true;notice('场景暂时无法显示，请刷新重试，或返回地图');renderHUD();return;}}
if(!storageConflict){if(isPractice){warmPurpose='practice';warmKeys=['Space','Backspace'].includes(practice)?[practice]:[...practice];warmIndex=0;showWarm();}else{state.paused=false;if(!showCheckpoint())showIntro();}}renderHUD();requestAnimationFrame(frame);}
function frame(now){
 const dt=Math.min(.25,Math.max(0,(now-lastTime)/1000));lastTime=now;
 if(warmWrong&&now>warmWrongUntil){warmWrong=null;showWarm();}
 const blocked=dialogs.some(d=>d.open)||isPractice;
 if(!blocked&&!state.paused){
  const before=state.action;tick(state,dt);if(before&&!state.action)prepareKeys(getRequiredKeys(state));
  saveClock+=dt;if(saveClock>.7){persist();saveClock=0;}
  showCheckpoint();
 }
 world?.update(state,dialogs.some(d=>d.open)||isPractice||state.paused?0:dt);renderHUD();requestAnimationFrame(frame);
}
init();
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});

window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
