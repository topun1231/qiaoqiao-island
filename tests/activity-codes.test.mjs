import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/game/engine.js';
import {createActivity,towerPlan,gateLanes,starPositions,kiteCell} from '../dist/game/island-activities.js';
import {nextActivityKey,pathKey} from './activity-driver.mjs';
function restored(s){const snap=E.snapshot(s),r=E.restore(snap);assert.ok(r);assert.deepEqual(E.snapshot(r),snap);assert.equal(r.codeBuffer,s.codeBuffer);assert.deepEqual(r.placements,s.placements);assert.deepEqual(r.position,s.position);return r;}
function command(s,key){const c=s.choices.find(c=>c.key===key);assert.ok(c);for(const k of c.code)assert.equal(E.press(s,k).status,'accepted');restored(s);E.tick(s,10);restored(s);}

test('new games use mixed full codes; prefixes, typos and backspace survive refresh without movement',()=>{
 for(const level of [8,12])for(let stage=0;stage<3;stage++){
  let s=E.create(level,stage,93),choice=s.choices[0];
  assert.ok(s.choices.every(c=>c.code.length===(level===8?[3,3,4]:[3,4,4])[stage]&&new Set(c.code).size>1));
  E.press(s,choice.code[0]);assert.equal(s.action,null);s=restored(s);
  const wrong=[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find(k=>k!==choice.code[1]);assert.equal(E.press(s,wrong).status,'wrong');assert.equal(s.codeBuffer,choice.code[0]);s=restored(s);
  assert.equal(E.press(s,'Backspace').status,'accepted');assert.equal(s.codeBuffer,'');s=restored(s);
  const before=E.snapshot(s);assert.equal(E.press(s,'Backspace').status,'ignored');assert.deepEqual(E.snapshot(s),before);
 }
});
test('sorting remains a decision: wrong zone stays wrong, then manual correction works with mixed codes',()=>{
 const s=E.create(8,2,17);command(s,'F');command(s,'M');assert.equal(s.placements.F,'M');assert.equal(s.progress,0);command(s,'F');command(s,'N');assert.equal(s.progress,1);assert.equal(s.placements.F,'N');
});
test('tower wrong shape consumes only its code and does not place a block or corrupt replay',()=>{
 const s=E.create(12,1,93),wrong=s.choices.find(c=>c.key!==towerPlan(s)[0]);let result;for(const k of wrong.code)result=E.press(s,k);assert.equal(result.correct,false);assert.equal(s.action,null);assert.equal(s.step,0);assert.equal(s.codeBuffer,'');restored(s);command(s,towerPlan(s)[0]);assert.equal(s.step,1);
});
test('kite uses a larger connected board, clouds block moves, and exploration requires a manual return',()=>{
 const s=E.create(12,2,31);assert.equal(starPositions(s).length,5);command(s,'A');assert.deepEqual(s.position,[1,4]);command(s,'W');assert.deepEqual(s.position,[1,4]);command(s,'D');assert.deepEqual(s.position,[2,4]);
 for(const goal of starPositions(s))assert.ok(pathKey(s.position,goal,p=>kiteCell(s,p)));
});
test('seed variation changes gate layouts and tower plans; all stages complete with valid saves',()=>{
 const gates=new Set(),plans=new Set();
 for(let seed=0;seed<16;seed++){
  gates.add(gateLanes(E.create(12,0,seed)).join());plans.add(towerPlan(E.create(12,1,seed)).join());
  for(const level of [8,12]){let s=E.create(level,0,seed);for(let stage=0;stage<3;stage++){
   let turns=0;while(!s.stageReady&&!s.solved&&turns++<300){assert.equal(E.press(s,nextActivityKey(s)).status,'accepted');if(s.action)E.tick(s,10);}
   assert.ok(s.stageReady||s.solved);s=restored(s);if(stage<2)assert.ok(E.advanceStage(s));
  }assert.ok(s.solved);}
 }assert.ok(gates.size>2);assert.ok(plans.size>2);
});
test('edition 1 ongoing activity saves retain old controls and rules through all stages',()=>{
 for(const level of [8,12]){let s=createActivity(level,0,45,1);for(let stage=0;stage<3;stage++){
  for(let i=0;i<90&&!s.stageReady&&!s.solved;i++){E.press(s,nextActivityKey(s));if(s.action)E.tick(s,10);s=restored(s);assert.equal(s.activityEdition,1);}
  assert.ok(s.stageReady||s.solved);if(stage<2)E.advanceStage(s);
 }assert.ok(s.solved);}
});
