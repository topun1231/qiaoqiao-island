import {create,press,tick,renderState} from './engine.js';
import {createOrchardWorld} from './world.js';
const $=id=>document.getElementById(id),state=create(crypto.getRandomValues(new Uint32Array(1))[0]);
const dialog=$('break-dialog'),held=new Set(),footer=document.querySelector('.hintbar');
let world,failed=false,composing=false,last=performance.now(),feedbackUntil=0,lastTarget='';
function message(text,result=''){$('feedback').textContent=text;footer.dataset.result=result;feedbackUntil=state.time+1;}
function paint(){
 for(const key of ['caught','wrong','missed'])$(key).textContent=state[key];
 if(state.time>feedbackUntil){$('feedback').textContent='继续看下一颗果子，想休息时点暂停';footer.dataset.result='';}
 if(lastTarget!==state.target){lastTarget=state.target;$('world').setAttribute('aria-label',`全字母接果子场景，当前果子字母 ${state.target}`);}
 world?.update(renderState(state));
}
function pause(copy='进度停在这里，准备好后继续接果子。'){
 if(state.paused||failed)return;
 state.paused=true;held.clear();$('break-title').textContent='小熊等你回来';$('break-copy').textContent=copy;$('resume').textContent='继续挑战';
 if(!dialog.open)dialog.showModal();$('break-title').focus();
}
$('pause').onclick=()=>pause();
$('resume').onclick=()=>{if(failed||composing)return;dialog.close();held.clear();state.paused=false;last=performance.now();$('world').focus();};
dialog.addEventListener('cancel',e=>e.preventDefault());
window.addEventListener('blur',()=>pause('离开了游戏窗口，已暂停。回来后再继续。'));
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause('切换了页面，已暂停。回来后再继续。');});
window.addEventListener('pagehide',()=>pause());
window.addEventListener('compositionstart',()=>{composing=true;pause('请切换到英文输入，再继续挑战。');});
window.addEventListener('compositionend',()=>{composing=false;});
window.addEventListener('keyup',e=>held.delete(e.code||e.key));
window.addEventListener('keydown',e=>{
 if(e.key==='Escape'){e.preventDefault();pause();return;}
 if(state.paused||failed||composing||e.isComposing||e.keyCode===229||e.ctrlKey||e.metaKey||e.altKey)return;
 if(!/^[A-Za-z]$/.test(e.key))return;
 e.preventDefault();const code=e.code||e.key;if(e.repeat||held.has(code))return;held.add(code);
 const result=press(state,e.key);
 if(result==='wrong')message('这颗还没接到，看清果子上的字母再试。','wrong');
 if(result==='caught')message('接住了！准备看下一颗。');
 paint();
});
try{world=createOrchardWorld($('world'));paint();dialog.showModal();$('break-title').focus();}
catch(e){failed=true;state.paused=true;$('render-error').hidden=false;$('pause').disabled=true;console.error(e);}
function frame(now){
 const dt=Math.min(.1,Math.max(0,(now-last)/1000));last=now;
 if(!failed){const missed=state.missed;tick(state,dt);if(state.missed>missed)message('漏接了，下一颗继续。','miss');paint();}
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
