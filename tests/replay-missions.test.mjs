import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/game/engine.js';
import * as Classic from '../dist/game/engine-classic.js';
import {createActivity} from '../dist/game/island-activities.js';
import {friendRequest} from '../dist/game/word-missions.js';
import {recordReplay,stampCount,cleanReplayRecords} from '../dist/game/replay-goals.js';
import {blank,validate} from '../dist/game/store.js';
import {nextActivityKey} from './activity-driver.mjs';
function roundtrip(s){const snap=E.snapshot(s);const r=E.restore(snap);assert.ok(r);assert.deepEqual(E.snapshot(r),snap);return r;}
function input(s,key){assert.equal(E.press(s,key).status,'accepted');if(s.action){E.tick(s,.1);roundtrip(s);E.tick(s,5);}roundtrip(s);}
for(const level of [9,11])for(const seed of [0,17,294])test(`new word mission ${level}/${seed}: three stages keep text difficulty and recover every input`,()=>{
 let s=E.create(level,0,seed);assert.equal(s.activityEdition,3);
 for(let stage=0;stage<3;stage++){
  for(let n=0;n<240&&!s.stageReady&&!s.solved;n++){
   if(s.choices.length)assert.ok(s.choices.every(c=>c.code.length===[3,3,4][stage]&&new Set(c.code).size===c.code.length));
   if(level===9)assert.deepEqual(s.tasks.map(t=>t.target),Classic.create(9,stage,seed).tasks.map(t=>t.target));
   input(s,nextActivityKey(s));
  }
  assert.ok(s.stageReady||s.solved);if(stage<2)assert.ok(E.advanceStage(s));s=roundtrip(s);
 }
 assert.ok(s.solved);if(level===11)assert.equal(new Set(s.arrived).size,3);
});
test('wrong card stays in place; partial codes, backspace and wrong letters preserve progress',()=>{
 for(const level of [9,11]){
  let s=E.create(level,0,17);
  if(level===11){for(const key of s.choices[0].code)input(s,key);assert.equal(s.stage,'compose');}
  const correct=level===9?s.tasks[s.step].target:friendRequest(s).text;
  const wrong=s.choices.find(c=>c.key!==correct);for(const key of wrong.code)input(s,key);
  assert.equal(s.progress,0);assert.equal(s.stage,level===9?'choose':'compose');assert.equal(s.action,null);
  const code=s.choices.find(c=>c.key===correct).code;input(s,code[0]);s=roundtrip(s);input(s,'Backspace');assert.equal(s.codeBuffer,'');
  for(const key of code)input(s,key);assert.equal(s.stage,'write');
  const first=s.target;assert.equal(E.press(s,first==='Q'?'W':'Q').status,'wrong');assert.equal(s.buffer,'');
  if(level===11){input(s,first);input(s,'Backspace');assert.equal(s.buffer,'');}
  roundtrip(s);
 }
});
test('old card and invitation sessions continue unchanged; impossible edition/log/action rejected',()=>{
 for(const s of [Classic.create(9,1,3),Classic.create(11,1,3),createActivity(11,1,3,1)])roundtrip(s);
 const snapshot=E.snapshot(E.create(9,0,17));
 for(const change of [s=>s.activityEdition=1,s=>s.level=8,s=>s.accepted=['Space'],s=>s.extra=1,s=>s.action={type:'fold'},s=>s.lessonStageIndex=2]){const bad=structuredClone(snapshot);change(bad.state);assert.equal(E.restore(bad),null);}
});
test('the last code letter remains a choice, and the last written letter remains typing',()=>{
 const s=E.create(9,0,17),code=s.choices.find(c=>c.key==='c').code;
 for(const k of code)assert.equal(E.press(s,k).inputKind,'code');
 assert.equal(s.stage,'write');assert.equal(E.press(s,'C').inputKind,'letter');assert.equal(s.action.type,'fold');
});
test('replay stamps require observed full rounds, persist independently, survive refresh without inflation',()=>{
 const data=blank(),s={solved:true,phase:'complete',startStageIndex:0,level:9,seed:5};
 const m={level:9,seed:5,wrong:2,help:0,stages:[0,1,2].map(()=>({observed:true}))};
 assert.equal(recordReplay(data,s,null),false);assert.equal(recordReplay(data,{...s,startStageIndex:1},m),false);
 assert.equal(recordReplay(data,s,{...m,stages:[{observed:true},{observed:false},{observed:true}]}),false);
 assert.equal(recordReplay(data,s,m),true);assert.equal(stampCount(data.replayRecords[9]),1);
 assert.equal(recordReplay(data,s,m),false);assert.equal(recordReplay(data,s,{...m,wrong:0,help:1}),true);
 assert.equal(stampCount(data.replayRecords[9]),2);assert.deepEqual(validate(JSON.parse(JSON.stringify(data))).replayRecords,data.replayRecords);
 assert.deepEqual(cleanReplayRecords({1:{bestWrong:-1,bestHelp:0},2:{bestWrong:NaN,bestHelp:0}}),{});
 assert.equal(validate(blank()).replayRecords,undefined);
});
