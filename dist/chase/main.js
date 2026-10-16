import {create,start,pause,tick,press,SPEEDS,FINISH} from './engine.js';
import {createChaseWorld} from './world.js';
import {createFeedback} from '../game/feedback.js';
const $=id=>document.getElementById(id),panel=$('panel'),feedback=createFeedback($('sound')),held=new Set();
const newState=difficulty=>create(crypto.getRandomValues(new Uint32Array(1))[0],difficulty);
let s=newState('normal'),world,last=performance.now(),messageUntil=0,renderFailed=false,oldLetters='',lastHitGap=18,closing=false;
try{world=createChaseWorld($('world'));}catch(error){console.error(error);renderFailed=true;$('render-error').hidden=false;}
function draw(dt=0){
 $('distance').textContent=Math.max(0,Math.ceil(s.thief-s.police));$('combo').textContent=s.combo;
 $('remaining').textContent=Math.max(0,Math.ceil(FINISH-s.thief));$('progress').style.width=`${s.thief/FINISH*100}%`;
 $('world').dataset.phase=s.phase;$('world').dataset.correct=s.correct;$('world').dataset.wrong=s.wrong;
 const signature=s.history.join('')+'|'+s.queue.slice(0,6).join('');
 if(signature!==oldLetters){oldLetters=signature;$('letters').replaceChildren();for(let i=s.history.length;i<3;i++){const blank=document.createElement('span');blank.style.visibility='hidden';blank.setAttribute('aria-hidden','true');$('letters').append(blank);}for(const [i,key] of [...s.history,...s.queue.slice(0,6)].entries()){const span=document.createElement('span');span.textContent=key;span.className=i<s.history.length?'done':i===s.history.length?'current':'';if(span.className==='current'){span.setAttribute('aria-current','true');span.setAttribute('aria-label',`当前请按 ${key}`);}$('letters').append(span);}}
 if(s.time>=messageUntil){$('feedback').textContent='打错不前进，按对当前字母继续 · 不用按空格';$('feedback').dataset.error='false';$('letters').querySelector('.wrong')?.classList.remove('wrong');$('moment').textContent=s.combo>=10?(closing?'正在追近！ 连对加速':'连对加速，再快一点！'):'';}
 world?.update(s,dt);
}
function showPanel(kind){
 const end=kind==='won'||kind==='lost',paused=kind==='paused';
 $('panel-title').textContent=kind==='won'?'抓到啦，苹果找回来了！':kind==='lost'?'小偷跑进藏身处了':paused?'休息一下':'追上偷苹果的小偷！';
 $('panel-copy').textContent=kind==='won'?'连续打字帮你追上了小偷！再选一个难度试试。':kind==='lost'?'再试一次：看准当前字母，连续打对就能加速追近。':paused?'双方都停在原地。准备好后，接着当前字母继续。':'你是小熊警察。照着底部字母连续打字，打得又快又准，就能追近小偷。在它到达藏身处前抓住它！';
 $('difficulties').hidden=paused;$('restart').hidden=!paused;$('go').textContent=paused?'继续追逐':end?'再来一局':'开始追逐';
 $('result').hidden=!end;$('result').textContent=`${SPEEDS[s.difficulty].label} · ${Math.round(s.time)} 秒 · 打对 ${s.correct} 个 · 错按 ${s.wrong} 次 · 最长连对 ${s.best}`;
 $('go').disabled=$('restart').disabled=renderFailed;
 if(!panel.open)panel.showModal();$('panel-title').focus();
}
function advance(){const now=performance.now(),dt=(now-last)/1000;last=now;tick(s,dt);return dt;}
function finish(){if((s.phase==='won'||s.phase==='lost')&&!panel.open){held.clear();feedback.play(s.phase==='won'?'complete':'wrong');showPanel(s.phase);}}
function breakGame(){if(s.phase!=='running')return;advance();if(s.phase!=='running'){finish();return;}pause(s);held.clear();feedback.stop();showPanel('paused');draw();}
function launch(){if(renderFailed)return;if(s.phase!=='paused'){s=newState(document.querySelector('[name=difficulty]:checked').value);lastHitGap=18;closing=false;}start(s);held.clear();feedback.unlock();panel.close();last=performance.now();messageUntil=0;oldLetters='';draw();$('world').focus({preventScroll:true});}
function keydown(e){
 if(e.key==='Escape'&&!panel.open){e.preventDefault();breakGame();return;}
 if(e.isComposing){if(s.phase==='running'){$('feedback').textContent='请切到英文输入，再按字母';messageUntil=s.time+2;}return;}
 if(s.phase!=='running'||panel.open||e.ctrlKey||e.metaKey||e.altKey||!/^[a-z]$/i.test(e.key))return;
 e.preventDefault();const physical=e.code||e.key.toUpperCase();if(e.repeat||held.has(physical))return;held.add(physical);
 advance();const result=press(s,e.key);
 if(result==='wrong'){feedback.play('wrong');$('feedback').textContent=`请按 ${s.queue[0]}，按对后继续，不用退格`;$('feedback').dataset.error='true';$('letters').querySelector('.current')?.classList.add('wrong');$('moment').textContent='';messageUntil=s.time+1.4;}
 else if(result!=='ignored'){const gap=s.thief-s.police;closing=gap<lastHitGap;lastHitGap=gap;feedback.play(s.combo%10===0?'milestone':'hit');messageUntil=0;}
 draw();finish();
}
document.addEventListener('keydown',keydown);document.addEventListener('keyup',e=>held.delete(e.code||e.key.toUpperCase()));
$('go').onclick=launch;$('pause').onclick=breakGame;
$('restart').onclick=()=>{s=newState(s.difficulty);messageUntil=0;draw();showPanel('ready');};
panel.addEventListener('cancel',e=>e.preventDefault());
window.addEventListener('blur',breakGame);document.addEventListener('visibilitychange',()=>{if(document.hidden)breakGame();});
world?.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();breakGame();renderFailed=true;$('render-error').hidden=false;$('go').disabled=$('restart').disabled=true;$('panel-copy').textContent='画面暂时中断，游戏已暂停。请刷新后重新开始。';});
let frame=0;function animate(){const dt=advance();draw(dt);finish();frame=requestAnimationFrame(animate);}draw();showPanel('ready');frame=requestAnimationFrame(animate);
window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);feedback.stop();world?.destroy();});
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
