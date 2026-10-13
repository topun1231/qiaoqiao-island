import {create,press,tick,renderState,SPEEDS} from './engine.js';
import {createOrchardWorld} from './world.js';
import {createRecords,RECORD_KEY} from './records.js';
const $=id=>document.getElementById(id),seed=()=>crypto.getRandomValues(new Uint32Array(1))[0];
let state=create(seed());
const records=createRecords(()=>localStorage),dialog=$('break-dialog'),held=new Set();
const options=[...document.querySelectorAll('input[name="speed"]')];
let world,failed=false,contextLost=false,started=false,selected=state.speed,last=performance.now(),feedbackUntil=0,lastTarget='';
function message(text,result=''){$('feedback').textContent=text;$('feedback').dataset.result=result;feedbackUntil=state.time+1.3;}
function recordUI(){
 $('best').textContent=records.best(state.speed);$('selected-best').textContent=records.best(selected);
 $('save-status').hidden=$('dialog-save-status').hidden=records.saved;
}
function settings(){
 const changing=started&&selected!==state.speed;
 options.forEach(input=>{input.checked=input.value===selected;input.disabled=contextLost;});
 $('restart-note').hidden=!changing;$('cancel-speed').hidden=!changing;
 $('resume').textContent=changing?'换速并重新开始':started?'继续挑战':'开始接果子';
 $('resume').disabled=$('cancel-speed').disabled=failed||contextLost;recordUI();
}
function paint(){
 for(const key of ['caught','wrong','missed','streak'])$(key).textContent=state[key];
 $('speed').textContent=SPEEDS[state.speed].label+' ▾';recordUI();
 if(state.time>feedbackUntil){$('feedback').textContent='按果子上的字母接住它';$('feedback').dataset.result='';}
 if(lastTarget!==state.target){lastTarget=state.target;$('world').setAttribute('aria-label',`全字母接果子场景，当前果子字母 ${state.target}`);}
 world?.update(renderState(state));
}
function pause(copy='进度停在这里，准备好后继续接果子。'){
 if(failed)return;
 state.paused=true;held.clear();if(!dialog.open)selected=state.speed;
 $('break-title').textContent=started?'休息一下':'全字母接果子';
 $('break-copy').textContent=contextLost?'画面暂时中断，已暂停计数。恢复后可继续，也可以回地图。':copy;
 settings();if(!dialog.open)dialog.showModal();$('break-title').focus();
}
function resume(cancel=false){
 if(failed||contextLost)return;
 if(cancel)selected=state.speed;
 if(selected!==state.speed){state=create(seed(),selected);feedbackUntil=0;lastTarget='';message('按果子上的字母接住它');}
 started=true;dialog.close();held.clear();state.paused=false;last=performance.now();paint();$('world').focus();
}
options.forEach(input=>input.onchange=()=>{selected=input.value;settings();});
$('pause').onclick=$('speed').onclick=()=>pause();
$('resume').onclick=()=>resume();$('cancel-speed').onclick=()=>resume(true);
dialog.addEventListener('cancel',e=>e.preventDefault());
window.addEventListener('blur',()=>pause('离开了游戏窗口，已暂停。回来后再继续。'));
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause('切换了页面，已暂停。回来后再继续。');});
window.addEventListener('pagehide',()=>pause());
window.addEventListener('compositionstart',()=>pause('请切换到英文输入，再继续挑战。'));
window.addEventListener('storage',e=>{if(e.key===RECORD_KEY||e.key===null){records.refresh();recordUI();}});
window.addEventListener('keyup',e=>held.delete(e.code||e.key));
window.addEventListener('keydown',e=>{
 if(e.isComposing||e.keyCode===229){pause('请切换到英文输入，再继续挑战。');return;}
 if(e.key==='Escape'){e.preventDefault();pause();return;}
 if(state.paused||failed||e.ctrlKey||e.metaKey||e.altKey)return;
 if(!/^[A-Za-z]$/.test(e.key))return;
 e.preventDefault();const code=e.code||e.key;if(e.repeat||held.has(code))return;held.add(code);
 const result=press(state,e.key);
 if(result==='wrong')message('连击中断，看清字母再试。','wrong');
 if(result==='caught'){
  const improved=records.record(state.speed,state.streak);
  message(improved?'新纪录！连击 '+state.streak:'接住了！连击 '+state.streak,improved?'record':'');
 }
 paint();
});
try{
 world=createOrchardWorld($('world'));
 const canvas=$('world').querySelector('canvas');
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;pause();});
 canvas.addEventListener('webglcontextrestored',()=>{contextLost=false;pause('画面已恢复，准备好后继续接果子。');paint();});
 paint();settings();dialog.showModal();$('break-title').focus();
}catch(e){failed=true;state.paused=true;$('render-error').hidden=false;$('pause').disabled=$('speed').disabled=true;console.error(e);}
function frame(now){
 const dt=Math.min(.1,Math.max(0,(now-last)/1000));last=now;
 if(!failed&&!state.paused){const missed=state.missed;tick(state,dt);if(state.missed>missed)message('漏接了，重新攒连击吧。','miss');paint();}
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
