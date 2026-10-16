import {shuffled,POOLS} from './challenge-curriculum.js';

const words={c:['字母 C','C'],x:['字母 X','X'],z:['字母 Z','Z'],cat:['小猫','🐈'],box:['盒子','📦'],zip:['拉链','🧥'],duck:['鸭子','🦆'],fish:['小鱼','🐟'],jump:['跳起来','🐇'],queen:['女王','👑'],frog:['青蛙','🐸'],milk:['牛奶','🥛'],wave:['挥手','👋'],nest:['鸟窝','🪺'],toy:['玩具','🧸']};
export const invitationRequests=[
 {clue:'我想带些吃的去分享',label:'带上水果',text:'bring some fruit'},
 {clue:'我想和大家一起玩游戏',label:'一起玩游戏',text:'come and play games'},
 {clue:'我想帮忙摆好野餐桌',label:'帮忙摆桌子',text:'help set the table'},
];
export function friendRequest(s){return shuffled(invitationRequests,s.seed)[s.friends.findIndex(f=>f.key===s.selected)];}
export function missionChoices(s){
 if(s.stageReady||s.solved)return [];
 if(s.level===11&&s.stage==='select')return s.friends.filter(f=>!s.arrived.includes(f.key)).map(f=>({...f,key:f.key}));
 if(s.level===11&&s.stage==='compose')return shuffled(invitationRequests,s.seed+s.lessonStageIndex*19).map(r=>({key:r.text,label:r.label,text:r.text}));
 if(s.level===9&&s.stage==='choose'){
  const target=s.tasks[s.step].target;
  const other=shuffled(Object.keys(words).filter(w=>w!==target&&w.length>1),s.seed+s.step*43+s.lessonStageIndex*8191).slice(0,2);
  return shuffled([target,...other],s.seed+s.step*73).map(w=>({key:w,label:words[w][0],text:w}));
 }
 return [];
}
export function refreshMission(s){
 const choices=missionChoices(s),pool=shuffled(POOLS[s.level-1],(s.seed+s.step*131+s.lessonStageIndex*8191+(s.stage==='compose'?313:0))>>>0),length=[3,3,4][s.lessonStageIndex];
 s.choices=choices.map((c,i)=>({...c,code:Array.from({length},(_,j)=>pool[i+j*3]).join('')}));
 if(s.action||s.stageReady||s.solved)s.choices=[];
 s.codeInput={buffer:s.codeBuffer,candidates:s.choices.filter(c=>c.code.startsWith(s.codeBuffer)),pending:null};
 s.target=s.stage==='write'?(s.targetText[s.buffer.length]===' '?'Space':s.targetText[s.buffer.length]?.toUpperCase())||null:null;
 if(s.level===9){const word=s.tasks[s.step]?.target;s.missionClue=word?`${words[word][1]} 找出「${words[word][0]}」的词卡`:'';}
 else s.missionClue=s.selected?`${s.friends.find(f=>f.key===s.selected).label}：${friendRequest(s).clue}`:'先选一位还没邀请的朋友';
}
export function missionGuide(s){
 if(s.stageReady||s.solved)return null;
 if(s.action)return {title:s.level===9?'小熊把词卡收好了':'小熊正在送邀请',controls:'这一串已收到，动作完成后继续',next:'不需要重复输入'};
 if(s.stage==='write')return {title:s.level===9?'词卡选对了，写出完整单词':'邀请选好了，写给这位朋友',controls:'看完整目标，依次输入；空格分词，不用回车',next:'按错直接重试；Backspace 可以修改末字'};
 return {title:s.missionClue,controls:s.stage==='select'?'输入朋友家旁的完整短码，走过去见面':'看清意思，输入所选卡片的完整短码',next:s.codeBuffer?`已输入 ${s.codeBuffer} · Backspace 可改选`:s.stage==='select'?'三位朋友都要邀请，先去哪家由你决定':'选错会留在这里，可重新选择，不跳过任务'};
}
