export const STORAGE_KEY='qiaoqiao-island-variety-preview-v1';
export const BACKUP_KEY='qiaoqiao-island-variety-preview-before-experience-v3';
const baselines=new WeakMap();
export const blank=()=>({version:1,completed:[],practiced:[],sessions:{},lastLevel:null,updated:0});
export function validate(value){
 if(!value||value.version!==1)return blank();
 const sessions={};
 if(value.sessions&&typeof value.sessions==='object'&&!Array.isArray(value.sessions))for(const [key,session] of Object.entries(value.sessions)){
  if(/^(?:[1-9]|1[0-2])$/.test(key)&&session&&[1,2,3].includes(session.version)&&session.state?.level===Number(key))sessions[key]=session;
 }
 return {version:1,completed:[...new Set((Array.isArray(value.completed)?value.completed:[]).filter(x=>Number.isInteger(x)&&x>=1&&x<=12))],practiced:[...new Set((Array.isArray(value.practiced)?value.practiced:[]).filter(x=>typeof x==='string'&&(/^[A-Z]$/.test(x)||['Space','Backspace'].includes(x))))],sessions,lastLevel:Number.isInteger(value.lastLevel)&&value.lastLevel>=1&&value.lastLevel<=12?value.lastLevel:null,updated:Number.isFinite(value.updated)&&value.updated>=0?value.updated:0};
}
export function load(storage){
 try{
  storage??=globalThis.localStorage;
  const raw=storage.getItem(STORAGE_KEY);
  let data;try{data=validate(JSON.parse(raw));}catch{data=blank();}
  const needsBackup=raw&&Object.values(data.sessions).some(s=>s.version<3);
  let backupReady=true;
  if(needsBackup)try{if(storage.getItem(BACKUP_KEY)==null)storage.setItem(BACKUP_KEY,raw);}catch{backupReady=false;}
  baselines.set(data,{storage,raw,backupReady});return data;
 }catch{return blank();}
}
/** Detect a changed record even before this tab receives its storage event. */
export function hasConflict(data,storage){
 try{storage??=globalThis.localStorage;const baseline=baselines.get(data);return !!baseline&&baseline.storage===storage&&storage.getItem(STORAGE_KEY)!==baseline.raw;}catch{return false;}
}
export function save(data,storage){
 try{
  storage??=globalThis.localStorage;
  if(hasConflict(data,storage)||baselines.get(data)?.backupReady===false)return false;
  const updated=Date.now(),raw=JSON.stringify(validate({...data,updated}));
  storage.setItem(STORAGE_KEY,raw);data.updated=updated;baselines.set(data,{storage,raw});return true;
 }catch{return false;}
}
export function recordKeys(data,keys){for(const key of keys)if((/^[A-Z]$/.test(key)||key==='Space'||key==='Backspace')&&!data.practiced.includes(key))data.practiced.push(key);}
