import{stampCount}from'./replay-goals.js';
import{createFeedback}from'./feedback.js';
import{createWorld}from'./map-world.js';
import{STORAGE_KEY,load,save,blank}from'./store.js';
import{restore}from'./engine.js';
try{createWorld(document.getElementById('world'));}catch(e){document.getElementById('render-error').hidden=false;}
const data=load();
createFeedback(document.getElementById('sound'));
const order=[data.lastLevel,...Array.from({length:12},(_,i)=>i+1)].filter(Boolean);
const ongoing=order.find(id=>{const s=restore(data.sessions[id]);return s?.level===id&&!s.solved&&s.phase!=='complete';});
const next=ongoing||order.find(id=>!data.completed.includes(id))||data.lastLevel||1;
const resumeLink=document.getElementById('continue-adventure');
resumeLink.textContent=`${ongoing?'继续冒险':data.completed.length===12?'再玩一次':'开始冒险'} · 第 ${next} 关`;
resumeLink.href=`play.html?level=${next}${!ongoing&&data.completed.includes(next)?'&replay=1':''}`;
const stages=[...document.querySelectorAll('.stage')];
stages.forEach((stage,i)=>{
 const id=i+1,session=restore(data.sessions[id]),canResume=session?.level===id&&session.phase!=='complete',done=data.completed.includes(id);
 stage.classList.toggle('completed',done);
 stage.querySelector('.stage-status').innerHTML=(canResume?`继续 ${(session.lessonStageIndex||0)+1}/3`:done?'✓ 已完成':'')+(done?` · 印章 ${stampCount(data.replayRecords?.[id])}/2`:'');
 stage.setAttribute('title',data.replayRecords?.[id]?`挑战：全关不求助 / 全关零错按；最佳错按 ${data.replayRecords[id].bestWrong}，最佳求助 ${data.replayRecords[id].bestHelp}`:'完成三段可得挑战印章：全关不求助、全关零错按');
 stage.href=`play.html?level=${id}${done&&!canResume?'&replay=1':''}`;
 stage.addEventListener('keydown',e=>{if(e.key===' '){e.preventDefault();if(!e.repeat)stage.click();}});
});
const counts=[data.completed.length,data.practiced.filter(k=>/^[A-Z]$/.test(k)).length];
document.querySelectorAll('.journey-progress strong').forEach((node,i)=>node.innerHTML=`${counts[i]} <small>/ ${i?26:12}</small>`);
document.querySelectorAll('.progress-track i').forEach((node,i)=>node.style.width=`${counts[i]/(i?26:12)*100}%`);
document.querySelector('.journey-progress').setAttribute('aria-label',`冒险完成 ${counts[0]}/12，已练过字母 ${counts[1]}/26`);
// This production entrance intentionally does not register an offline worker.

document.querySelector('#reset-preview').onclick=()=>{if(confirm('清空冒险进度、挑战印章和已练字母？接果子最高纪录和声音设置会保留。')){if(save(blank()))location.reload();else alert('未能保存，记录没有被清空');}};

window.addEventListener('storage',e=>{if((e.key===STORAGE_KEY||e.key===null)&&(!e.storageArea||e.storageArea===window.localStorage))location.reload();});

window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
