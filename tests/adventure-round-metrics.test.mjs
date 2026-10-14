import test from 'node:test';
import assert from 'node:assert/strict';
import {blank,validate,load,save,STORAGE_KEY,BACKUP_KEY,V3_BACKUP_KEY,snapshotFingerprint} from '../dist/game/store.js';
const clone=x=>JSON.parse(JSON.stringify(x));
const counters=()=>({correct:0,wrong:0,backspace:0,choices:0,help:0});
function envelope(){
 const state={version:4,level:3,seed:492,lessonStageIndex:1,accepted:['F'],paused:false};
 return {version:4,state,roundMetrics:{version:1,level:3,seed:492,attemptId:'round-492',snapshotFingerprint:snapshotFingerprint(state),...counters(),correct:1,stages:[{...counters(),observed:true,automaticHints:true},{...counters(),correct:1,observed:true,automaticHints:false},{...counters(),observed:false,automaticHints:false}]}};
}
const record=session=>({...blank(),completed:[1,3],practiced:['F','J','Backspace'],sessions:{3:session}});
function memory(entries={}){const map=new Map(Object.entries(entries));return {map,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};}
test('v3 exact bytes receive a distinct immutable backup without overwriting v2 or original v8',()=>{
 const old=JSON.stringify(record({version:3,state:{version:3,level:3,accepted:['S']}})),storage=memory({[STORAGE_KEY]:old,[BACKUP_KEY]:'earlier-v2-backup','typing-island-progress-v1':'original-v8'}),data=load(storage);
 assert.equal(storage.getItem(V3_BACKUP_KEY),old);assert.equal(storage.getItem(BACKUP_KEY),'earlier-v2-backup');data.sessions[3]=envelope();assert.equal(save(data,storage),true);assert.equal(storage.getItem(V3_BACKUP_KEY),old);assert.equal(storage.getItem('typing-island-progress-v1'),'original-v8');
 const after=load(storage);assert.deepEqual(after.completed,[1,3]);assert.deepEqual(after.practiced,['F','J','Backspace']);assert.equal(after.sessions[3].roundMetrics.correct,1);
});
test('v4 upgrade refuses to overwrite when distinct v3 backup cannot be saved',()=>{
 const raw=JSON.stringify(record({version:3,state:{version:3,level:3}})),storage=memory({[STORAGE_KEY]:raw}),set=storage.setItem;storage.setItem=(key,value)=>{if(key===V3_BACKUP_KEY)throw Error('quota');set(key,value);};const data=load(storage);data.sessions[3]=envelope();assert.equal(save(data,storage),false);assert.equal(storage.getItem(STORAGE_KEY),raw);
});
test('round metrics survive atomic save and cannot attach to a different resumed snapshot',()=>{
 const storage=memory(),data=record(envelope());assert.equal(save(data,storage),true);assert.equal(load(storage).sessions[3].roundMetrics.correct,1);
 for(const change of [s=>s.state.seed++,s=>s.state.accepted.push('J'),s=>s.roundMetrics.seed++,s=>s.roundMetrics.level=4,s=>s.roundMetrics.snapshotFingerprint='different']){
  const saved=envelope();change(saved);assert.equal(validate(record(saved)).sessions[3].roundMetrics,undefined);
 }
});
test('malformed, overlarge or internally inconsistent metrics become unrecorded',()=>{
 const cases=[m=>m.wrong=-1,m=>m.help=Infinity,m=>m.backspace=1.5,m=>m.choices=1000001,m=>m.correct=2,m=>m.stages[2].observed='yes',m=>m.stages[2].automaticHints=true,m=>m.attemptId='<script>',m=>m.stages.pop(),m=>{m.help=1;m.stages[2].help=1;}];
 for(const change of cases){const saved=envelope();change(saved.roundMetrics);const checked=validate(record(saved));assert.equal(checked.sessions[3].roundMetrics,undefined);assert.equal(checked.sessions[3].state.level,3);}
 const old=envelope();old.version=3;old.state.version=3;assert.equal(validate(record(old)).sessions[3].roundMetrics,undefined);
 const absent=envelope();delete absent.roundMetrics;assert.equal(validate(record(absent)).sessions[3].roundMetrics,undefined);
});
test('validated metrics discard unrelated UI data and preserve only bounded counts',()=>{
 const saved=envelope();saved.roundMetrics.unknown='untrusted';saved.roundMetrics.stages[1].unknown='untrusted';const checked=validate(record(saved)).sessions[3].roundMetrics;assert.equal(checked.unknown,undefined);assert.equal(checked.stages[1].unknown,undefined);assert.equal(checked.correct,1);
});
