import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/game/engine.js';
import * as Old from '../dist/game/engine-classic.js';
import {createRoute} from '../dist/game/route-adventure.js';
import {mazeBoard,DIRECTIONS} from '../dist/game/island-activities.js';
import {nextActivityKey,pathKey} from './activity-driver.mjs';
const roundtrip=s=>{const snap=E.snapshot(s),r=E.restore(snap);assert.ok(r,`restore ${s.level}/${s.lessonStageIndex}/${s.stage}`);assert.deepEqual(E.snapshot(r),snap);return r;};
function input(s,k){assert.equal(E.press(s,k).status,'accepted');if(s.action){E.tick(s,.1);roundtrip(s);E.tick(s,10);}roundtrip(s);}
for(const level of [5,6,8,11,12])for(const seed of [0,314])test(`current activity ${level}/${seed}: three stages, physical inputs and reloads`,()=>{
 let s=E.create(level,0,seed);for(let stage=0;stage<3;stage++){
  for(let n=0;n<150&&!s.stageReady&&!s.solved;n++)input(s,nextActivityKey(s));assert.ok(s.stageReady||s.solved);
  if(stage<2){const position=s.position&&[...s.position],inventory=[...s.inventory],arrived=[...s.arrived];assert.ok(E.advanceStage(s));if(level===6){assert.deepEqual(s.position,position);assert.deepEqual(s.inventory,inventory);}if(level===11)assert.deepEqual(s.arrived,arrived);s=roundtrip(s);}
 }assert.ok(s.solved);if(level===11)assert.equal(new Set(s.arrived).size,3);
});
test('maze dead end stays put until an explicit reverse key; no direction scores as a typo',()=>{
 const s=E.create(5,0,9);input(s,'D');input(s,'D');assert.deepEqual(s.position,[3,5]);E.tick(s,100);assert.deepEqual(s.position,[3,5]);assert.equal(E.press(s,'W').status,'ignored');assert.equal(s.wrongKey,null);input(s,'A');assert.deepEqual(s.position,[2,5]);
});
test('maze supplies can be collected in either order without resetting position',()=>{
 const s=E.create(6,0,9),b=mazeBoard(s);for(const key of ['Y','T']){for(let i=0;i<40&&!s.stageReady;i++)input(s,pathKey(s.position,b.supplies[key],p=>b.rows[p[1]]?.[p[0]]==='.'));assert.ok(s.inventory.includes(key));E.advanceStage(s);}assert.deepEqual(s.inventory,['Y','T']);assert.deepEqual(s.position,b.supplies.T);
});
test('sorting wrong placement stays visible, can be picked up and corrected, and free play persists',()=>{
 const s=E.create(8,2,4);input(s,'F');input(s,'M');assert.equal(s.placements.F,'M');assert.equal(s.wrongKey,null);assert.equal(s.progress,0);for(let n=0;n<20&&!s.solved;n++)input(s,nextActivityKey(s));assert.ok(s.solved);input(s,'F');input(s,'M');assert.ok(s.solved);roundtrip(s);
});
test('old forest, errands, rooms and invitations retain their original in-progress rules',()=>{
 for(const level of [5,6,8,11,12]){for(const old of [Old.create(level,1,45),...(level===5?[createRoute(5,1,45)]:[])]){const snap=E.snapshot(old);assert.deepEqual(E.snapshot(E.restore(snap)),snap);}assert.equal(E.create(level).activityEdition,1);}
});
test('activity save rejects injected fields, impossible moves, invalid action and accessors',()=>{
 const good=E.snapshot(E.create(5,0,1));for(const change of [r=>r.extra=true,r=>r.seed=-1,r=>r.accepted=['A'],r=>r.action={type:'walk'},r=>r.lessonStageIndex=2,r=>r.activityEdition=2]){const bad=structuredClone(good);change(bad.state);assert.equal(E.restore(bad),null);}let called=false;const trap=structuredClone(good);Object.defineProperty(trap.state,'accepted',{get(){called=true;return[];}});assert.equal(E.restore(trap),null);assert.equal(called,false);
});
