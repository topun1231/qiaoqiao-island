import{createFeedback}from'./feedback.js';
import{SPECS,create,press,tick,snapshot,restore,getRequiredKeys,getStageInfo,advanceStage}from'./engine.js';
import{STORAGE_KEY,load,save,recordKeys,hasConflict}from'./store.js';
import{getFinger}from'../curriculum.js';
import{taskGuide}from'./task-guide.js?v=formal-14';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),practice=params.get('practice');
const feedback=createFeedback([$('pause-sound'),$('sound')]);
const practiceGroups=['FJ','DK','SL','AGH','EI','RU','TY','QW','OP','VM','BN','CXZ','ABCDEFGHIJKLMNOPQRSTUVWXYZ','Space','Backspace'];
const requestedLevel=Number(params.get('level')),isPractice=practiceGroups.includes(practice),level=Number.isInteger(requestedLevel)?Math.max(1,Math.min(12,requestedLevel)):1,spec=SPECS.find(s=>(s.id??s.level)===level);
const replayRequested=!isPractice&&params.get('replay')==='1';
let data=load(),restored=restore(data.sessions[level]),state=!replayRequested&&restored?.level===level?restored:createFreshRound(restored||data.sessions[level]?.state),storageConflict=false,renderFailed=false,world=null,contextLost=false,worldFrozen=false,warmKeys=[],warmIndex=0,warmPurpose='',warmWrong=null,warmWrongUntil=0,held=new Set(),captured=new Set(),finishedShown=false,lastTime=performance.now(),saveClock=0,practiceCount=0,completionDismissed=false,transitionGate=null,replayPending=replayRequested;
// These are physical gameplay keypresses, never reconstructed from the
// engine's accepted log (which also contains edits and choice/route keys).
// A replay is a new seeded round. The two short-text levels also switch
// visible text families, even when a random seed lands in the same family.
function createFreshRound(previous){
 const next=create(level);
 if(next.version<4||previous?.version!==4||previous.level!==level||!Number.isInteger(previous.seed)||previous.seed<0||previous.seed>0xffffffff)return next;
 const families=level===11?3:level===12?2:0;let seed=next.seed;
 while(seed===previous.seed||families&&seed%families===previous.seed%families)seed=(seed+1)>>>0;
 return seed===next.seed?next:create(level,0,seed);
}
const freshCounters=()=>({correct:0,wrong:0,backspace:0,choices:0,help:0});
function newRoundMetrics(){
 if(state.version<4)return null;
 return {version:1,attemptId:`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`,level,seed:state.seed,...freshCounters(),stages:[0,1,2].map(index=>({...freshCounters(),observed:index===getStageInfo(state).index,automaticHints:index===0}))};
}
let roundMetrics=state.version>=4?(!replayRequested&&restored?.level===level?data.sessions[level]?.roundMetrics||null:newRoundMetrics()):null,hintRequested=false;
function independent(){return state.version>=4&&getStageInfo(state).index>0;}
function syncHints(){
 const independentMode=independent();state.hintRequested=hintRequested;
 state.uiHints={independent:independentMode,hintRequested,automaticNextKey:!independentMode};
 $('world').classList.toggle('independent-practice',independentMode);
 $('world').classList.toggle('hint-requested',hintRequested);
}
function countMetric(name){
 if(!roundMetrics)return;
 const stage=roundMetrics.stages[getStageInfo(state).index];
 if(roundMetrics[name]>=1000000){roundMetrics=null;return;}
 roundMetrics[name]++;stage[name]++;stage.observed=true;
}
function countInput(key,result,before){
 if(!roundMetrics||before.finished||result.status==='ignored')return;
 if(result.status==='wrong'||result.correct===false){countMetric('wrong');return;}
 if(!['accepted','queued'].includes(result.status))return;
 if(key==='Backspace'){countMetric('backspace');return;}
 const choice=result.inputKind==='code'||result.inputKind==='choice'||before.mode==='room'||before.mode==='forest'||before.stage==='select';
 countMetric(choice?'choices':'correct');
}
function metricsSnapshot(engineSnapshot){
 if(!roundMetrics)return engineSnapshot;
 const text=JSON.stringify(engineSnapshot.state);let hash=2166136261;
 for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
 return {...engineSnapshot,roundMetrics:{...roundMetrics,snapshotFingerprint:(hash>>>0).toString(16)}};
}
function resetRound(){state=createFreshRound(state);roundMetrics=newRoundMetrics();hintRequested=false;syncHints();}
function metricSummary(){return roundMetrics?`本轮：错按 ${roundMetrics.wrong} 次 / 退格修正 ${roundMetrics.backspace} 次 / 主动提示 ${roundMetrics.help} 次`:'本轮按键统计：未记录（旧进度不补算）';}
function updateMetrics(){
 $('round-metrics').textContent=isPractice?'':metricSummary();
 $('round-metrics').hidden=isPractice;
 const final=roundMetrics?.stages[2],completed=state.solved||state.phase==='complete';
 const success=completed&&final?.observed&&!final.automaticHints&&final.help===0;
 $('finish-metrics').textContent=metricSummary();
 $('finish-evaluation').textContent=success?'第 3 段未求助完成：下一键提示默认关闭，完整目标始终可见':completed&&final?.observed?'第 3 段已完成，可以重玩试试少用提示':'这一轮没有完整的独立练习记录';
 $('finish-metric-context').textContent=roundMetrics?`本轮有效字母/空格 ${roundMetrics.correct} 次，选择/路线码 ${roundMetrics.choices} 次（不代表摆放位置正确）。错按是任务判为错误的输入。统计只含任务中的实际按键，不含认键、长按重复、输入法、暂停或未接收的按键；退格不会抹掉错按记录。网页不能确认真实用指`:'旧进度没有记录错按、退格或提示次数，不能据此判断练习表现。网页不能确认真实用指';
}
function currentHelp(){
 const pending=state.pendingCode||state.pendingKey,received=[...(pending?[pending]:[]),...(state.queue||[])];
 if(received.length)return {text:`已接收 ${received.map(display).join(' → ')}，请等动作完成，不用重复`,keys:[]};
 if(state.target)return {text:`当前下一键：${display(state.target)}${state.targetText?`；完整目标：${state.targetText}`:''}`,keys:[state.target]};
 const choices=state.version>=4&&['forest','room'].includes(state.mode)?state.codeInput?.candidates||[]:(state.choices||[]).filter(choice=>!choice.disabled&&(spec.mode==='room'||!choice.done));
 const codes=choices.map(choice=>({label:choice.label||choice.key,code:choice.code||choice.key}));
 return {text:codes.length?`当前可选${codes.some(choice=>choice.code.length>1)?'短码':'键'}：${codes.map(choice=>`${choice.label} ${choice.code}`).join('；')}${state.codeBuffer?`。已经输入：${state.codeBuffer}`:''}`:'请等小熊完成动作，再看新的目标',keys:[...new Set(codes.flatMap(choice=>choice.code==='Space'||choice.code==='Backspace'?[choice.code]:[...choice.code]))]};
}
const display=k=>k==='Space'?'空格':k==='Backspace'?'退格':k||'';
const levelTitle=state.routeAdventure&&level===5?'自己选路找朋友':spec.title;
const copy={catch:['🍐','按一次字母','🧸','接住果子',level===2?'先看三种水果的清单，再为朋友选篮子；最后按新的组合配齐水果。每次都看清字母和数量':'看果子上的字母，从左到右依次按。可以一颗一颗接，也可以连按；最后照清单装篮子'],stone:['🪨','看清短串','🧸','一步一步跳',level===4?'两条路线都看得见。先按第一块石头选路，再看每一小串连跳；用到整排基准键':'每块石头对应一个字母。按一次就跳一步，可以慢慢按，也可以连贯输入'],forest:['🌳','看路牌字母','🧸','沿路找朋友',level===6?'先选一个目的地，再看路口线索。两件东西都拿到，就能带去野餐':'朋友给你一条线索。看看池塘、蘑菇和路牌，按路牌字母选路。走错会带你回来'],room:['📦','先选物品','🧸','再选摆放处',level===8?'房间已经摆好了，现在要换个用途。先输入物品的拿取码，再输入位置的本次收纳码改放；搬完还能自由布置':'先按物品旁的字母串拿起，再按合适位置上的字母串放下。字母从左到右逐个按，不用回车'],card:['✉️','看完整目标','✎','修好卡片',level===10?'先用 Backspace 退格删掉末尾多出或写错的字，再补上正确的字。只改末尾':'完整目标一直显示。先认识新字母，再把短词完整写到卡片上，不用猜英文词义'],mail:[level===12?'🧺':'✉️',level===12?'选择伙伴':'写好邀请','🧸',level===12?'一起玩野餐':'朋友来野餐',level===12?'朋友已经收到邀请，正在野餐地等你。每段选一位伙伴，写一句话，一起问候、游戏和分享点心':'给所有朋友写一张共同邀请，分三小段写好。两个词之间轻按空格，写完后一起出发']};
$('title').textContent=isPractice?'自由练习':`第 ${level} 关 · ${levelTitle}`;
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
 if(id==='stage-finished'||id==='finished'){feedback.play('complete');feedback.pulse($(id));}
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
function transitionAllowed(event){return !storageConflict&&!renderFailed&&!contextLost&&!(event?.detail===0&&transitionGate?.blocked.size);}
function notice(text){$('status-note').textContent=text;}
function stopForConflict(){if(storageConflict)return;storageConflict=true;state.paused=true;held.clear();captured.clear();warmWrong=null;for(const d of dialogs)if(d.open)d.close();notice('另一页更新了本版记录，请回地图后再继续');$('resume').disabled=true;$('restart').disabled=true;openDialog('paused');}
function consumeReplay(){
 if(!replayPending)return;
 const query=new URLSearchParams(location.search);query.delete('replay');const search=query.toString();
 // Replay is a one-time command. The newly saved round must resume on refresh.
 try{history.replaceState(history.state,'',`${location.pathname}${search?'?'+search:''}${location.hash}`);replayPending=false;}catch{}
}
function persist(){if(storageConflict)return false;if(!isPractice){data.sessions[level]=metricsSnapshot(snapshot(state));data.lastLevel=level;if(state.solved||state.phase==='complete'){if(!data.completed.includes(level))data.completed.push(level);}}if(save(data)){consumeReplay();if($('status-note').textContent==='浏览器没有保存成功，暂时不要关闭这一页')notice('');return true;}if(hasConflict(data))stopForConflict();else{notice('浏览器没有保存成功，暂时不要关闭这一页');if($('finished').open)$('finish-copy').textContent='这一关已经完成，但浏览器暂时没有保存成功。请留在这一页，稍后再按下一步重试';}return false;}
function keyboard(target,wrong){$('keyboard').innerHTML='';for(const row of ['QWERTYUIOP','ASDFGHJKL;','ZXCVBNM',['Space','Backspace']]){const r=document.createElement('div');r.className='keyboard-row';for(const key of row){const k=document.createElement('span');k.className=`keyboard-key ${key===target?'active':''} ${key===wrong?'error':''} ${'FJ;'.includes(key)?'home':''} ${key.length>1?'wide':''}`;k.textContent=display(key);if(key===';'){k.title='右手小指的基准键，只作定位提示';k.setAttribute('aria-label','分号，右手小指的基准键，只作定位提示');}r.append(k);}$('keyboard').append(r);}}
function showWarm(){if(storageConflict)return;const key=warmKeys[warmIndex];if(!key){closeDialog('warmup');warmPurpose='';persist();lastTime=performance.now();return;}const finger=getFinger(key);$('warmup-step').textContent=isPractice?`自由练习 · 已按对 ${practiceCount} 次`:`认识新键 · ${warmIndex+1} / ${warmKeys.length} · 认完继续刚才的冒险`;$('warmup-key').textContent=display(key);$('warmup-key').classList.toggle('error',!!warmWrong);$('warmup-finger').textContent=finger?.label||'';$('warmup-return').textContent=key==='Space'?'空格把两个词分开，用拇指轻轻按':key==='Backspace'?`退格会删除末尾一个字，不是 Delete 键。${finger.returnHint}`:finger?.returnHint||'';$('warmup-feedback').textContent=warmWrong?`刚才按了 ${display(warmWrong)}，试试 ${display(key)}`:'在电脑键盘上轻按一次；字母不用按 Shift';keyboard(key,warmWrong);$('practice-end').hidden=!isPractice;openDialog('warmup');}
function prepareKeys(keys,purpose='task'){const missing=[...new Set(keys)].filter(k=>!data.practiced.includes(k));if(!missing.length)return false;warmKeys=missing;warmIndex=0;warmPurpose=purpose;warmWrong=null;showWarm();return true;}
function startTask(){feedback.unlock();if(storageConflict||renderFailed||contextLost)return;closeDialog('intro');if(showCheckpoint())return;if(!prepareKeys(getRequiredKeys(state),'entry'))lastTime=performance.now();}
function showIntro(){if(storageConflict)return;const c=state.routeAdventure||state.contentVersion===5?[...copy[spec.mode].slice(0,4),state.stageDescription]:copy[spec.mode],stage=getStageInfo(state);$('intro-title').textContent=levelTitle;$('intro-copy').textContent=state.version<4?stage.description:stage.index?stage.description:c[4];$('intro-demo').innerHTML=`${c[0]} <span>${c[1]}</span> → ${c[2]} <span>${c[3]}</span>`;$('intro-progress').textContent=(state.version<4?`接着第 ${stage.number} / ${stage.count} 段 · 旧版进度原样保留，重玩可体验混合键挑战；旧按键统计未记录`:state.migrationNotice)||((state.accepted.length||stage.index)?`接着第 ${stage.number} / ${stage.count} 段 · ${stage.title}，已完成的操作都还在`:'先熟悉键位，再混合练习；后两段自己找键，不确定就点「要提示」');openDialog('intro');}
function pause(){feedback.stop();if(renderFailed||isPractice||dialogs.some(d=>d.open))return;state.paused=true;held.clear();captured.clear();persist();openDialog('paused');}
function resume(){if(storageConflict||renderFailed||contextLost)return;$('pause-copy').textContent='进度已经停在这里。回到键盘前再继续';state.paused=false;closeDialog('paused');held.clear();captured.clear();lastTime=performance.now();persist();}
function restart(){if(storageConflict||contextLost)return;if(!confirm('从头再玩这一关？已完成记录和练过的字母会保留'))return;resetRound();finishedShown=false;completionDismissed=false;for(const d of dialogs)if(d.open)d.close();persist();showIntro();}
$('intro-next').onclick=startTask;$('pause').onclick=pause;$('resume').onclick=resume;$('restart').onclick=restart;
$('continue-stage').onclick=event=>{
 if(!transitionAllowed(event)||!state.stageReady)return;
 if(!advanceStage(state))return;
 hintRequested=false;if(roundMetrics)roundMetrics.stages[getStageInfo(state).index].observed=true;syncHints();
 closeDialog('stage-finished');finishedShown=false;completionDismissed=false;
 persist();if(storageConflict)return;
 if(!prepareKeys(getRequiredKeys(state),'stage'))lastTime=performance.now();
 renderHUD();
};
$('replay').onclick=event=>{if(!transitionAllowed(event))return;resetRound();finishedShown=false;completionDismissed=false;closeDialog('finished');persist();showIntro();};
$('next-level').onclick=event=>{
 if(!transitionAllowed(event)||!(state.solved||state.phase==='complete'))return;
 if(!persist())return;
 if(level===12){location.href='./';return;}
 const next=level+1,nextSession=restore(data.sessions[next]),canResume=nextSession?.level===next&&!nextSession.solved&&nextSession.phase!=='complete';
 const replay=!canResume&&(data.completed.includes(next)||nextSession?.solved||nextSession?.phase==='complete');
 location.href=`play.html?level=${next}${replay?'&replay=1':''}`;
};
$('keep-arranging').onclick=event=>{if(!transitionAllowed(event))return;completionDismissed=true;closeDialog('finished');};$('practice-end').onclick=()=>location.href='./';
$('help').onclick=()=>{if(renderFailed||storageConflict||contextLost||dialogs.some(d=>d.open))return;held.clear();captured.clear();if(!state.solved&&state.phase!=='complete')countMetric('help');hintRequested=true;syncHints();state.paused=true;const help=currentHelp();$('help-current-target').textContent=help.text;$('finger-detail').textContent=help.keys.map(k=>`${display(k)}：${getFinger(k)?.label||''}`).join('　');persist();if(!storageConflict)openDialog('finger-dialog');renderHUD();};$('close-help').onclick=()=>{if(storageConflict||contextLost)return;closeDialog('finger-dialog');state.paused=false;lastTime=performance.now();persist();};
for(const d of dialogs)d.addEventListener('cancel',e=>{e.preventDefault();if(d.id==='paused')resume();else if(d.id==='finger-dialog')$('close-help').click();});
function normalize(e){if(e.key===' '||e.code==='Space')return'Space';if(e.key==='Backspace')return'Backspace';return /^[a-z]$/i.test(e.key)?e.key.toUpperCase():null;}
window.addEventListener('keydown',e=>{
 const key=normalize(e),controlSpace=['BUTTON','A'].includes(document.activeElement?.tagName)&&key==='Space'&&!$('warmup').open;
 if(e.isComposing||e.keyCode===229){pauseForIME();return;}
 if(e.ctrlKey||e.metaKey||e.altKey||contextLost||renderFailed)return;
 // Keep browser control activation available outside the typing warmup. For
 // captured keys, repeated keydowns must also suppress scroll/back navigation.
 if(e.repeat||held.has(e.code)||transitionGate?.blocked.has(e.code)||modalRelease.has(e.code)){if(activationCode(e.code)||captured.has(e.code)||(key&&!controlSpace))e.preventDefault();return;}
 held.add(e.code);
 if(e.key==='Escape'){if(!dialogs.some(d=>d.open)){e.preventDefault();pause();held.add(e.code);captured.add(e.code);}return;}
 if(!key||controlSpace)return;
 e.preventDefault();captured.add(e.code);feedback.unlock();
 if(storageConflict)return;
 if($('warmup').open){
  if(key===warmKeys[warmIndex]){feedback.play();feedback.pulse($('warmup-key'));recordKeys(data,[key]);practiceCount++;warmWrong=null;warmIndex++;if(isPractice&&warmIndex>=warmKeys.length)warmIndex=0;persist();showWarm();}
  else{feedback.play('wrong');feedback.pulse($('warmup-key'),'wrong');warmWrong=key;warmWrongUntil=performance.now()+1100;showWarm();}
  return;
 }
 if(dialogs.some(d=>d.open)||state.paused||isPractice)return;
 // A newly exposed task must teach its missing keys before accepting input.
 if((!state.action||!data.practiced.includes(key)&&getRequiredKeys(state).includes(key))&&prepareKeys(getRequiredKeys(state)))return;
 const before={mode:state.mode,stage:state.stage,finished:state.solved||state.phase==='complete'},result=press(state,key);
 countInput(key,result,before);
 if(result.status==='wrong'||result.correct===false){feedback.play('wrong');feedback.pulse($('message'),'wrong');}
 else if(['accepted','queued'].includes(result.status)){feedback.play();feedback.pulse($('progress'));}
 if(result.status==='accepted'||result.status==='queued'){recordKeys(data,[key]);hintRequested=false;}
 syncHints();persist();
 if(!state.paused)prepareKeys(getRequiredKeys(state));renderHUD();
});
window.addEventListener('keyup',e=>{if(transitionGate?.blocked.has(e.code)){e.preventDefault();transitionGate.blocked.delete(e.code);}if(modalRelease.delete(e.code))e.preventDefault();held.delete(e.code);captured.delete(e.code);});
function pauseForIME(){held.clear();captured.clear();modalRelease.clear();notice('请切换到英文输入法，再继续练习');pause();}
window.addEventListener('compositionstart',pauseForIME);
window.addEventListener('compositionend',()=>{held.clear();captured.clear();modalRelease.clear();});
window.addEventListener('blur',()=>{held.clear();captured.clear();modalRelease.clear();pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){held.clear();captured.clear();modalRelease.clear();pause();}});
window.addEventListener('pagehide',persist);
window.addEventListener('storage',e=>{if((e.key===STORAGE_KEY||e.key===null)&&(!e.storageArea||e.storageArea===window.localStorage))stopForConflict();});
let lastKeyHints='';
function renderHUD(){
 syncHints();updateMetrics();
 const guide=isPractice?null:taskGuide(state);
 $('task-guide').hidden=!guide;
 document.body.classList.toggle('has-task-guide',!!guide);
 if(guide){
  $('task-guide-title').textContent=guide.title;$('task-guide-next').textContent=guide.next;
  const controls=$('task-guide-controls');
  if(controls.getAttribute('aria-label')!==guide.controls){
   controls.setAttribute('aria-label',guide.controls);controls.innerHTML='';
   for(const part of guide.controls.split(/(Backspace|Space|\b[A-Z]\b)/)){
    const node=document.createElement(/^(Backspace|Space|[A-Z])$/.test(part)?'kbd':'span');node.textContent=part;controls.append(node);
   }
  }
 }
 const autoHints=!independent()||hintRequested;
 const error=state.wrongKey&&state.wrongUntil>0,pending=state.pendingCode||state.pendingKey;
 const queued=Array.isArray(state.queue)?state.queue:[],received=pending?[pending]:queued;
 $('message').textContent=!autoHints?(error?`刚才按了 ${display(state.wrongKey)}，这次不合适；进度保留，再看完整目标或场景线索`:received.length?`已接收 ${received.map(display).join(' → ')}，不用重复按`:state.stageReady?'这一段完成，准备好后继续':state.solved||state.phase==='complete'?'任务完成啦':state.action?'小熊正在完成动作，已接收的按键不用重复':state.mode==='forest'||state.mode==='room'?'看清场景线索，输入完整短码；需要时可以主动提示':'看完整目标，自己找键；需要时可以主动提示'):error?`刚才按了 ${display(state.wrongKey)} · ${state.message||'看一看场景里的提示，再试一次'}`:state.message||'';
 document.querySelector('.hintbar').classList.toggle('error',!!error);
 const finishedUI=(state.solved||state.phase==='complete')&&!completionDismissed;
 const activeChoices=state.version>=4&&['forest','room'].includes(state.mode)?state.codeInput?.candidates||[]:(state.choices||[]).filter(c=>!c.disabled&&(spec.mode==='room'||!c.done)),choices=activeChoices.map(c=>c.code?c.code[(state.codeBuffer||'').length]||c.code[0]:c.key),keys=finishedUI||!autoHints?[]:[...new Set(received.length?[...received,...(state.target?[state.target]:[])]:state.target?[state.target]:choices)].slice(0,5);
 const keySignature=JSON.stringify([keys,error?state.wrongKey:null,received]);
 if(keySignature!==lastKeyHints){lastKeyHints=keySignature;$('key-hints').innerHTML='';
 for(const key of [...keys,...(error&&!keys.includes(state.wrongKey)?[state.wrongKey]:[])]){
  const el=document.createElement('span');el.className=`key-chip ${error&&key===state.wrongKey?'error':''}`;el.textContent=received.includes(key)?`${display(key)} 已接收`:display(key);
  if(received.includes(key))el.setAttribute('aria-label',`${display(key)}，已接收，等待当前动作完成`);
  $('key-hints').append(el);
 }
 }
 $('finger-hint').textContent=!autoHints?(received.length?'已接收的输入会依次完成，下一键与指法提示默认关闭':'下一键与指法提示默认关闭 · 完整目标仍在场景中'):received.length?`${received.map(display).join(' → ')} · 已接收，按顺序完成，不用再按`:keys.map(k=>`${display(k)} · ${getFinger(k)?.label||''}`).join('　')||(state.stageReady?'这一段完成，准备好后继续':state.solved||state.phase==='complete'?(level===12?'冒险完成啦，可以回地图再挑一关':'完成啦，可以继续下一关或回地图'):'小熊正在行动，稍等它走稳');
 const fraction=Math.max(0,Math.min(1,(state.progress||0)/(state.total||1)));$('lesson-fill').style.width=`${Math.round(fraction*100)}%`;
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
  $('finish-copy').textContent=!saved?'这一关已经完成，但浏览器暂时没有保存成功。请留在这一页，稍后再按下一步重试':level===12?'第 12 关完成啦，回地图看看这次冒险。练过的字母和完成记录都会留下':`${state.legacyCompleted?'这一关的完成记录已经保留':'这一关已经记在冒险地图上'}。${nextPartial?'下一关会接着上次的进度':'准备好就去下一关，也可以重玩这一关'}`;
  $('next-level').textContent=level===12?'完成冒险 · 回地图':`下一关 · 第 ${level+1} 关`;
  $('keep-arranging').hidden=spec.mode!=='room';openDialog('finished');return true;
 }
 return false;
}
async function init(){if(replayPending)persist();try{const sources={catch:['./orchard-world.js?v=formal-14','createOrchardWorld'],stone:['./river-world.js','createRiverWorld'],forest:['./forest-world.js','createForestWorld'],room:['./pairing-world.js','createPairingWorld'],card:['./invitation-world.js','createInvitationWorld'],mail:['./invitation-world.js','createInvitationWorld']};const [path,fn]=sources[spec.mode];const mod=await import(path);world=mod[fn]($('world'));
// Some renderers create or replace their canvas on the first update.
$('world').addEventListener('webglcontextlost',e=>{
 e.preventDefault();contextLost=true;state.paused=true;held.clear();captured.clear();modalRelease.clear();persist();
 $('resume').disabled=true;$('restart').disabled=true;
 $('pause-copy').textContent='画面暂时中断，进度已暂停。恢复后可继续，也可以回地图。';openDialog('paused');
},true);
$('world').addEventListener('webglcontextrestored',()=>{
 contextLost=false;worldFrozen=false;
 if(!storageConflict){$('resume').disabled=false;$('restart').disabled=false;$('pause-copy').textContent='画面已恢复，准备好后继续冒险。';}
},true);
syncHints();world.update(state,0);}catch(e){$('render-error').hidden=false;console.error(e);if(!isPractice){renderFailed=true;state.paused=true;$('pause').disabled=true;$('help').disabled=true;notice('场景暂时无法显示，请刷新重试，或返回地图');renderHUD();return;}}
if(!storageConflict){if(isPractice){warmPurpose='practice';warmKeys=['Space','Backspace'].includes(practice)?[practice]:[...practice];warmIndex=0;showWarm();}else{state.paused=false;if(!showCheckpoint())showIntro();}}renderHUD();requestAnimationFrame(frame);}
function frame(now){
 const dt=Math.min(.25,Math.max(0,(now-lastTime)/1000));lastTime=now;
 if(warmWrong&&now>warmWrongUntil){warmWrong=null;showWarm();}
 const blocked=dialogs.some(d=>d.open)||isPractice||contextLost||renderFailed;
 if(!blocked&&!state.paused){
  const before=state.action;tick(state,dt);if(before&&!state.action)prepareKeys(getRequiredKeys(state));
  saveClock+=dt;if(saveClock>.7){persist();saveClock=0;}
  showCheckpoint();
 }
 const frozen=dialogs.some(d=>d.open)||isPractice||state.paused;
 if(!contextLost&&(!frozen||!worldFrozen)){syncHints();world?.update(state,frozen?0:dt);renderHUD();}
 worldFrozen=frozen;requestAnimationFrame(frame);
}
init();
// This production entrance intentionally does not register an offline worker.

window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
