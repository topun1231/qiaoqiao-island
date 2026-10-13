import test from 'node:test';
import assert from 'node:assert/strict';
import {create,press,tick,SPEEDS,renderState} from '../dist/fruit-challenge/engine.js';
import {sampleMixedOrchardFruit} from '../dist/fruit-challenge/world.js';
import {createRecords,RECORD_KEY} from '../dist/fruit-challenge/records.js';

for(const [speed,{seconds}] of Object.entries(SPEEDS)){
 test(`${speed}: falling geometry and miss clock agree`,()=>{
  const s=create(42,speed);s.paused=false;tick(s,seconds-.01);assert.equal(s.missed,0);
  assert.equal(sampleMixedOrchardFruit(renderState(s),s.target,seconds)[1],.8200000000000003);
  tick(s,.02);assert.equal(s.missed,1);assert.equal(s.streak,0);tick(s,.23);assert.equal(s.phase,'falling');
 });
 test(`${speed}: 40 complete shuffled alphabets continue with no finish`,()=>{
  const s=create(42,speed);s.paused=false;
  for(let batch=0;batch<40;batch++){
   const letters=[];
   for(let i=0;i<26;i++){letters.push(s.target);assert.equal(press(s,s.target),'caught');tick(s,.49);}
   assert.equal(new Set(letters).size,26);assert.notEqual(letters.join(''),'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  }
  assert.equal(s.streak,1040);assert.equal(s.caught,1040);assert.equal(s.spawned,1041);assert.equal(s.phase,'falling');
 });
}
test('only effective wrong input and misses break streak; pause and catch animation inputs preserve it',()=>{
 const s=create(42);s.paused=false;press(s,s.target);assert.equal(s.streak,1);
 assert.equal(press(s,'?'),'ignored');assert.equal(press(s,'Z'),'ignored');tick(s,.49);
 s.paused=true;tick(s,20);press(s,'Z');assert.equal(s.streak,1);s.paused=false;
 press(s,s.target==='A'?'B':'A');assert.equal(s.streak,0);press(s,s.target.toLowerCase());assert.equal(s.streak,1);
 tick(s,.49);tick(s,3);assert.equal(s.streak,0);assert.equal(s.wrong,1);assert.equal(s.missed,1);
});
function storage(raw=null){
 const data=new Map(raw===null?[]:[[RECORD_KEY,raw]]),writes=[];
 return{data,writes,getItem:key=>data.get(key)??null,setItem(key,value){writes.push(key);data.set(key,value);}};
}
test('records persist per speed, max-merge newer stored values and touch only preview key',()=>{
 const disk=storage(),r=createRecords(()=>disk);
 assert.equal(r.record('normal',12),true);r.record('easy',7);r.record('hard',4);
 disk.data.set(RECORD_KEY,JSON.stringify({easy:99,normal:3,hard:24}));
 r.record('normal',8);const reload=createRecords(()=>disk);
 assert.equal(reload.best('normal'),12);assert.equal(reload.best('easy'),99);assert.equal(reload.best('hard'),24);
 assert.deepEqual(new Set(disk.writes),new Set([RECORD_KEY]));
});
test('invalid or unreadable existing records never get overwritten',()=>{
 for(const raw of ['{','null','[]','{"easy":-1}','{"hard":1.5}','{"normal":9007199254740992}']){
  const disk=storage(raw),r=createRecords(()=>disk);r.record('normal',5);
  assert.equal(r.saved,false);assert.equal(r.best('normal'),5);assert.equal(disk.writes.length,0);assert.equal(disk.getItem(RECORD_KEY),raw);
 }
 const r=createRecords(()=>{throw Error('denied');});assert.equal(r.record('hard',3),true);assert.equal(r.saved,false);
});
test('failed save keeps in-memory best and retries without discarding other speeds',()=>{
 const disk=storage(),put=disk.setItem;disk.setItem=()=>{throw Error('quota');};
 const r=createRecords(()=>disk);r.record('normal',9);assert.equal(r.saved,false);
 disk.setItem=put;r.record('hard',2);assert.equal(r.saved,true);
 assert.deepEqual(JSON.parse(disk.getItem(RECORD_KEY)),{easy:0,normal:9,hard:2});
 for(const value of [-1,NaN,Infinity,1.5,'4'])assert.equal(r.record('normal',value),false);
 assert.equal(r.record('__proto__',10),false);
});
