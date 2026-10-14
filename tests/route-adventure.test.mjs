import test from 'node:test';
import assert from 'node:assert/strict';
import * as Runtime from '../dist/game/engine.js';
import {createRoute} from '../dist/game/route-adventure.js';
const Engine={...Runtime,create:createRoute};
import * as Classic from '../dist/game/engine-classic.js';
import {riverLeg,forestGraph} from '../dist/game/route-adventure.js';
import {taskGuide} from '../dist/game/task-guide.js';
import {snapshotFingerprint,validateRoundMetrics} from '../dist/game/store.js';
const finishAction=s=>{if(s.action)Engine.tick(s,s.action.duration);};
const input=(s,text)=>{for(const key of text)assert.equal(Engine.press(s,key).status,'accepted');};
function roundtrip(s){const snapshot=Engine.snapshot(s),restored=Engine.restore(snapshot);assert.ok(restored,'save restores');assert.deepEqual(Engine.snapshot(restored),snapshot);return restored;}
function walk(s,suffix){const choice=s.choices.find(c=>c.nodeTo.endsWith(suffix));assert.ok(choice,suffix);input(s,choice.code);Engine.tick(s,.2);roundtrip(s);finishAction(s);roundtrip(s);}

for(let stage=0;stage<3;stage++)for(const lanes of [['A','A'],['A','H'],['H','A'],['H','H']])test(`river stage ${stage} routes ${lanes.join('')} finish equally and restore every prefix/jump`,()=>{
 let s=Engine.create(4,stage,17);assert.equal(s.total,2);
 for(const lane of lanes){
  const before=s.progress;input(s,lane);assert.equal(s.progress,before);
  const path=riverLeg(s);assert.equal(path.codes.length,lane==='A'?3:2);
  for(const code of path.codes){
   for(const key of code){input(s,key);s=roundtrip(s);}
   Engine.tick(s,.2);s=roundtrip(s);s.paused=true;const paused=Engine.snapshot(s);Engine.tick(s,100);assert.deepEqual(Engine.snapshot(s),paused);s.paused=false;finishAction(s);s=roundtrip(s);
  }
 }
 assert.equal(s.progress,2);assert.equal(s.stageReady,stage<2);assert.equal(s.solved,stage===2);
 assert.equal(s.discoveries.includes('水边小鸭'),lanes.includes('H'));
});

test('forest supports two forward routes, crossover, retreat, discoveries and marked edges',()=>{
 const s=Engine.create(5,0,9);assert.equal(s.choices.length,2);
 walk(s,'n1');assert.equal(s.choices.length,3);walk(s,'d1');assert.ok(s.discoveries.includes('找回朋友的围巾'));
 walk(s,'d0');walk(s,'n0');walk(s,'n1');walk(s,'n2');assert.equal(s.discoveries.length,2);
 walk(s,'n3');walk(s,'d2');walk(s,'d0');walk(s,'d2');walk(s,'n3');walk(s,'n4');
 assert.equal(s.stageReady,true);assert.equal(s.wrongKey,null);assert.ok(s.visitedEdges.length>=8);assert.equal(s.progress,1);
});
test('both forest routes reach every chapter and all branches stay reachable',()=>{
 for(let stage=0;stage<3;stage++)for(const route of [['n1','n2','n3','n4'],['d0','d2','n3','n4']]){
  const s=Engine.create(5,stage,42),graph=forestGraph(s);const seen=new Set([graph.start]);
  for(let n=0;n<10;n++)for(const e of graph.edges){if(seen.has(e.from))seen.add(e.to);if(seen.has(e.to))seen.add(e.from);}
  assert.equal(seen.size,Object.keys(graph.nodes).length);
  for(const node of route)walk(s,node);assert.equal(s.solved,stage===2);
 }
});
for(const level of [4,5])test(`new level ${level} completes three stages with consistent metrics fingerprints and saves`,()=>{
 let s=Engine.create(level,0,313);
 for(let stage=0;stage<3;stage++){
  if(level===4)for(const key of ['A','H']){input(s,key);for(const code of riverLeg(s).codes){input(s,code);finishAction(s);}}
  else for(const node of ['d0','d2','n3','n4'])walk(s,node);
  s=roundtrip(s);if(stage<2){assert.ok(Engine.advanceStage(s));s=roundtrip(s);}
 }
 assert.ok(s.solved);assert.equal(s.stageHistory.length,3);
 const snap=Engine.snapshot(s),counts={correct:0,wrong:0,backspace:0,choices:0,help:0};
 const metrics={version:1,attemptId:'route-test',level,seed:s.seed,snapshotFingerprint:snapshotFingerprint(snap.state),...counts,stages:[0,1,2].map(i=>({...counts,observed:true,automaticHints:i===0}))};
 assert.ok(validateRoundMetrics(metrics,snap));
});
test('wrong typing preserves code prefix; corrections count once; valid route selection never reports wrong',()=>{
 const s=Engine.create(5,0,1),choice=s.choices[0];input(s,choice.code[0]);
 const bad=[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find(k=>!s.choices.some(c=>c.code.startsWith(s.codeBuffer+k)));
 assert.equal(Engine.press(s,bad).status,'wrong');assert.equal(s.codeBuffer,choice.code[0]);roundtrip(s);
 assert.equal(Engine.press(s,'Backspace').status,'accepted');assert.equal(s.codeBuffer,'');roundtrip(s);input(s,choice.code);assert.equal(s.wrongKey,null);finishAction(s);roundtrip(s);
});
test('malformed or impossible route saves are rejected without invoking getters',()=>{
 const s=Engine.create(5,0,1),good=Engine.snapshot(s);
 for(const change of [s=>s.seed=-1,s=>s.accepted=['ZZ'],s=>s.lessonStageIndex=7,s=>s.action={type:'walk'},s=>s.stageHistory=[{index:0}],s=>s.routeAdventure=2,s=>s.routeLeg=1]){
  const bad=structuredClone(good);change(bad.state);assert.equal(Engine.restore(bad),null);
 }
 let invoked=false;const trap={};Object.defineProperty(trap,'state',{get(){invoked=true;return good.state;}});assert.equal(Engine.restore(trap),null);assert.equal(invoked,false);
});
test('existing route saves keep classic behavior until replay',()=>{
 for(const level of [4,5]){const old=Classic.create(level,1,42);const saved=Classic.snapshot(old);assert.deepEqual(Engine.snapshot(Engine.restore(saved)),saved);assert.equal(Engine.restore(saved).routeAdventure,undefined);assert.equal(Engine.create(level).routeAdventure,1);}
});
test('new guides describe real choices and no longer punish exploration',()=>{
 assert.match(taskGuide(Engine.create(4)).controls,/3 跳/);assert.match(taskGuide(Engine.create(5)).next,/探索不计错/);
});
