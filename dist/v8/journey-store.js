import {migrateAdventureCatch,snapshotCatch,restoreCatch} from './catch-game.js';
import {loadProgress,validateProgress,saveProgress,getAccuracy} from './adventure.js';
import {createJourneyGame,restoreJourney,snapshotJourney,startJourneyGame,pressJourneyKey,tickJourneyGame,advanceJourneyCheckpoint} from './journey-game.js';
export const ENVELOPE_KEY='typing-island-main-catch-v2';
export function readEnvelope(storage){
 const fallback=loadProgress(storage);let envelope={version:2,sessions:{},journeys:{},progress:fallback.progress,lastJourney:null},persistent=fallback.persistent;
 try{const text=storage?.getItem(ENVELOPE_KEY);if(text&&text.length<500000){const raw=JSON.parse(text);if(raw?.version===2){envelope={...raw,sessions:{},journeys:{},progress:validateProgress(raw.progress)?raw.progress:fallback.progress};for(const [id,snap]of Object.entries(raw.sessions??{})){const valid=restoreCatch(snap);if(valid&&String(valid.levelId)===id)envelope.sessions[id]=snap;}for(const [id,entry]of Object.entries(raw.journeys??{})){const s=restoreJourney(entry?.snapshot);if(s&&String(s.levelId)===id)envelope.journeys[id]={snapshot:snapshotJourney(s),awarded:s.phase==='complete'&&entry.awarded===true,notice:typeof entry.notice==='string'?entry.notice:''};}persistent=true;}}}catch{}
 if(!Number.isInteger(envelope.lastJourney)||!envelope.journeys[envelope.lastJourney]||envelope.journeys[envelope.lastJourney].snapshot.phase==='complete')envelope.lastJourney=null;
 if(envelope.progress.active&&!envelope.sessions[envelope.progress.active.levelId]){const old=migrateAdventureCatch(envelope.progress);if(old)envelope.sessions[old.levelId]=snapshotCatch(old);}
 return {envelope,persistent};
}
export function writeEnvelope(storage,envelope){try{if(!storage)throw Error();storage.setItem(ENVELOPE_KEY,JSON.stringify(envelope));saveProgress(storage,envelope.progress);return true;}catch{return false;}}
export function openJourney(envelope,levelId){
 const existing=envelope.journeys[levelId];if(existing){const state=restoreJourney(existing.snapshot);if(state)return{state,awarded:existing.awarded,notice:existing.notice};}
 const state=createJourneyGame(levelId,envelope.progress);const old=envelope.sessions?.[levelId];let notice='';
 // Keep old attempts untouched. Letter routes can retain exact accepted lesson keys.
 if(old&&Number.isInteger(old.index)&&old.index>0&&old.phase!=='complete'){
  if(levelId<=9&&Array.isArray(old.sequence)){
   const count=Math.max(0,Math.min(state.sequence.length,old.index-(old.reviewCount||0)));
   const same=old.sequence.slice(old.reviewCount||0).join('|')===state.sequence.join('|');
   if(same){startJourneyGame(state);let guard=0;while(state.index<count&&guard++<1000){if(state.phase==='checkpoint')advanceJourneyCheckpoint(state);if(state.phase==='acting'){tickJourneyGame(state,100);continue;}pressJourneyKey(state,{code:'Key'+state.target,key:state.target});}if(state.phase==='acting')tickJourneyGame(state,100);notice='已接着上次练过的字母，换一条石头路线继续';}
  }else notice='玩法更新了：已完成关卡和最好成绩都保留，这一轮从新物品或邀请开始';
 }
 return{state,awarded:false,notice};
}
export function awardJourney(progress,state){
 if(state.phase!=='complete'||state.index!==state.sequence.length||!restoreJourney(snapshotJourney(state))||!validateProgress(progress))return false;
 const accuracy=getAccuracy(state),old=progress.completed[state.levelId];
 progress.completed[state.levelId]={accuracy,bestAccuracy:Math.max(old?.bestAccuracy??0,accuracy),attempts:Math.min(1000000,(old?.attempts??0)+1)};
 for(const [key,n]of Object.entries(state.wrongKeys)){if(/^[A-Z]$/.test(key))progress.mistakes[key]=Math.min(1000000,(progress.mistakes[key]??0)+n);}
 progress.active=null;return true;
}
