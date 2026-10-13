import{createWorld}from'./map-world.js';
import{STORAGE_KEY,load,save,blank}from'./store.js';
import{restore}from'./engine.js';
try{createWorld(document.getElementById('world'));}catch(e){document.getElementById('render-error').hidden=false;}
const data=load();
const stages=[...document.querySelectorAll('.stage')];
stages.forEach((stage,i)=>{
 const id=i+1,session=restore(data.sessions[id]),canResume=session?.level===id&&session.phase!=='complete',done=data.completed.includes(id);
 stage.tabIndex=0;stage.role='link';stage.classList.toggle('completed',done);
 stage.querySelector('.stage-status').innerHTML=`<i></i>${canResume?`${session.version<4?'保留旧回合 · ':''}接着第 ${(session.lessonStageIndex||0)+1}/3 段`:done?'已经完成 · 再玩一次':'可自由选择'}`;
 const go=()=>location.href=`play.html?level=${id}${done&&!canResume?'&replay=1':''}`;
 stage.addEventListener('click',go);stage.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!e.repeat)go();}});
});
const counts=[data.completed.length,data.practiced.filter(k=>/^[A-Z]$/.test(k)).length];
document.querySelectorAll('.journey-progress strong').forEach((node,i)=>node.innerHTML=`${counts[i]} <small>/ ${i?26:12}</small>`);
document.querySelectorAll('.progress-track i').forEach((node,i)=>node.style.width=`${counts[i]/(i?26:12)*100}%`);
document.querySelector('.journey-progress').setAttribute('aria-label',`冒险完成 ${counts[0]}/12，已练过字母 ${counts[1]}/26`);
const dialog=document.querySelector('#practice-dialog');const entry=document.querySelector('.free-practice');entry.tabIndex=0;entry.role='button';entry.onclick=()=>dialog.showModal();entry.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();dialog.showModal();}};
const groups=['FJ','DK','SL','AGH','EI','RU','TY','QW','OP','VM','BN','CXZ','ABCDEFGHIJKLMNOPQRSTUVWXYZ','Space','Backspace'];for(const group of groups){const b=document.createElement('button');b.textContent=group==='ABCDEFGHIJKLMNOPQRSTUVWXYZ'?'全字母':group==='Space'?'空格':group==='Backspace'?'退格':group;b.onclick=()=>location.href=`play.html?practice=${group}`;document.querySelector('#practice-groups').append(b);}document.querySelector('#close-practice').onclick=()=>dialog.close();
// This partial-review test entrance intentionally does not register an offline worker.

document.querySelector('#reset-preview').onclick=()=>{if(confirm('清空这个预览的冒险和练习记录？原版记录完全不受影响。')){if(save(blank()))location.reload();else alert('未能保存，记录没有被清空');}};

window.addEventListener('storage',e=>{if((e.key===STORAGE_KEY||e.key===null)&&(!e.storageArea||e.storageArea===window.localStorage))location.reload();});

window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
