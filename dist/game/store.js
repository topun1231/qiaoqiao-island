import {cleanReplayRecords} from './replay-goals.js';
export const STORAGE_KEY='qiaoqiao-island-challenge-test-v1';
export const BACKUP_KEY='qiaoqiao-island-challenge-test-before-experience-v3';
// Never reuse the earlier v2 backup: this is the exact pre-challenge record.
export const V3_BACKUP_KEY='qiaoqiao-island-challenge-test-before-independent-v4';
const baselines=new WeakMap();
export const blank=()=>({version:1,completed:[],practiced:[],sessions:{},lastLevel:null,updated:0});
// Bind controller-owned measurements to the exact atomic engine snapshot. A
// stale or malformed measurement record must never be presented as zero errors.
export function snapshotFingerprint(state){
 const text=JSON.stringify(state);let hash=2166136261;
 for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
 return (hash>>>0).toString(16);
}
export function validateRoundMetrics(value,session){
 if(session.version!==4||!value||value.version!==1||value.level!==session.state.level||value.seed!==session.state.seed||value.snapshotFingerprint!==snapshotFingerprint(session.state))return null;
 if(typeof value.attemptId!=='string'||!/^[-a-zA-Z0-9_]{1,90}$/.test(value.attemptId)||!Array.isArray(value.stages)||value.stages.length!==3)return null;
 const names=['correct','wrong','backspace','choices','help'];
 const validCount=x=>Number.isSafeInteger(x)&&x>=0&&x<=1000000;
 const clean=x=>x&&names.every(name=>validCount(x[name]))?Object.fromEntries(names.map(name=>[name,x[name]])):null;
 const total=clean(value);if(!total)return null;
 const stages=[];
 for(const stage of value.stages){const counts=clean(stage);if(!counts||typeof stage.observed!=='boolean'||typeof stage.automaticHints!=='boolean')return null;stages.push({...counts,observed:stage.observed,automaticHints:stage.automaticHints});}
 if(names.some(name=>stages.reduce((sum,stage)=>sum+stage[name],0)!==total[name]))return null;
 if(stages.some((stage,i)=>stage.automaticHints!==(i===0)||!stage.observed&&names.some(name=>stage[name]>0)))return null;
 return {version:1,attemptId:value.attemptId,level:value.level,seed:value.seed,snapshotFingerprint:value.snapshotFingerprint,...total,stages};
}
export function validate(value){
 if(!value||value.version!==1)return blank();
 const sessions={};
 if(value.sessions&&typeof value.sessions==='object'&&!Array.isArray(value.sessions))for(const [key,session] of Object.entries(value.sessions)){
  if(/^(?:[1-9]|1[0-2])$/.test(key)&&session&&[1,2,3,4].includes(session.version)&&session.state?.level===Number(key)){
   const {roundMetrics,...engineSession}=session;
   const metrics=validateRoundMetrics(roundMetrics,engineSession);
   sessions[key]=metrics?{...engineSession,roundMetrics:metrics}:engineSession;
  }
 }
 return {version:1,...(value.replayRecords?{replayRecords:cleanReplayRecords(value.replayRecords)}:{}),completed:[...new Set((Array.isArray(value.completed)?value.completed:[]).filter(x=>Number.isInteger(x)&&x>=1&&x<=12))],practiced:[...new Set((Array.isArray(value.practiced)?value.practiced:[]).filter(x=>typeof x==='string'&&(/^[A-Z]$/.test(x)||['Space','Backspace'].includes(x))))],sessions,lastLevel:Number.isInteger(value.lastLevel)&&value.lastLevel>=1&&value.lastLevel<=12?value.lastLevel:null,updated:Number.isFinite(value.updated)&&value.updated>=0?value.updated:0};
}
export function load(storage){
 try{
  storage??=globalThis.localStorage;
  const raw=storage.getItem(STORAGE_KEY);
  let data;try{data=validate(JSON.parse(raw));}catch{data=blank();}
  const versions=Object.values(data.sessions).map(s=>s.version);
  const requiredBackups=raw?[...(versions.some(v=>v<3)?[BACKUP_KEY]:[]),...(versions.some(v=>v<4)?[V3_BACKUP_KEY]:[])]:[];
  let backupReady=true;
  for(const key of requiredBackups)try{if(storage.getItem(key)==null)storage.setItem(key,raw);}catch{backupReady=false;}
  baselines.set(data,{storage,raw,backupReady});return data;
 }catch{
  // An unreadable save is not an empty save; require a fresh load before writing.
  const data=blank();baselines.set(data,{backupReady:false});return data;
 }
}
/** Detect a changed record even before this tab receives its storage event. */
export function hasConflict(data,storage){
 try{storage??=globalThis.localStorage;const baseline=baselines.get(data);return !!baseline&&baseline.storage===storage&&storage.getItem(STORAGE_KEY)!==baseline.raw;}catch{return false;}
}
export function save(data,storage){
 try{
  storage??=globalThis.localStorage;
  const baseline=baselines.get(data);
  // Let failed reads reach this function's catch instead of treating them as no conflict.
  if(baseline?.backupReady===false||baseline?.storage===storage&&storage.getItem(STORAGE_KEY)!==baseline.raw)return false;
  const updated=Date.now(),raw=JSON.stringify(validate({...data,updated}));
  storage.setItem(STORAGE_KEY,raw);data.updated=updated;baselines.set(data,{storage,raw});return true;
 }catch{return false;}
}
export function recordKeys(data,keys){for(const key of keys)if((/^[A-Z]$/.test(key)||key==='Space'||key==='Backspace')&&!data.practiced.includes(key))data.practiced.push(key);}
