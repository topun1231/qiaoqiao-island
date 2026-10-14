import test from 'node:test';
import assert from 'node:assert/strict';
import * as Engine from '../dist/game/engine.js';
import * as Classic from '../dist/game/engine-classic.js';
import {roomObjectives} from '../dist/game/playability.js';
import {forestLayout,forestTaskChoices} from '../dist/game/forest-world.js';
import {sampleInvitationPose} from '../dist/game/invitation-world.js';
import {taskGuide} from '../dist/game/task-guide.js';
const checkSave=s=>{const snap=Engine.snapshot(s),restored=Engine.restore(snap);assert.ok(restored,`restore ${s.level}/${s.lessonStageIndex}/${s.stage}`);assert.deepEqual(Engine.snapshot(restored),snap);};
const finish=s=>{if(s.action)Engine.tick(s,s.action.duration+.01);checkSave(s);};
function choose(s,key){const choice=s.choices.find(c=>c.key===key&&!c.disabled&&!c.done||s.mode==='room'&&c.key===key&&!c.disabled);assert.ok(choice,key);for(const k of choice.code||choice.key){assert.equal(Engine.press(s,k).status,'accepted');checkSave(s);}if(s.action){Engine.tick(s,.15);checkSave(s);}finish(s);}
function move(s,item,zone){choose(s,item);choose(s,zone);}

for(const order of [['T','Y'],['Y','T']])test(`shopping ${order}: carry both foods, no fake forks or duplicate return choice`,()=>{
 const s=Engine.create(6,0,41);assert.equal(s.contentVersion,5);
 for(let stage=0;stage<3;stage++){
  const key=stage<2?order[stage]:order[1];
  assert.equal(s.choices.filter(c=>!c.done).length,stage?1:2);assert.equal(forestTaskChoices(s).filter(c=>!c.done).length,stage?1:2);choose(s,key);
  while(!s.stageReady&&!s.solved){assert.equal(s.choices.length,1);choose(s,s.choices[0].key);}
  assert.deepEqual(s.inventory,order.slice(0,Math.min(stage+1,2)));assert.equal(s.wrongKey,null);
  const layout=forestLayout(s);assert.ok(layout.edges.every(e=>!/-[rd]+\d/.test(e.from+e.to)));
  if(stage<2){assert.ok(Engine.advanceStage(s));checkSave(s);}
 }
 assert.equal(s.nodeId,'friend');assert.ok(s.solved);
});

for(let stage=0;stage<3;stage++)for(const side of ['M','N'])test(`room purpose ${stage}: valid layout on ${side}, typed actions and saves`,()=>{
 const s=Engine.create(8,stage,19),other=side==='M'?'N':'M';
 const target=stage===1?{F:other,D:side,V:side,B:side}:{F:side,D:side,V:side,B:other};
 assert.equal(s.layoutComplete,false);assert.equal(s.total,3);assert.ok(s.items.every(item=>!item.goalZone));
 for(const key of ['V','B','F','D'])if(!s.solved&&!s.stageReady&&s.placements[key]!==target[key])move(s,key,target[key]);
 assert.ok(s.solved||s.stageReady);assert.ok(roomObjectives(s).every(goal=>goal.done));assert.equal(s.placements.D,side);assert.equal(s.wrongKey,null);checkSave(s);
});
test('room accepts experimental placements without typing errors and explains unmet requirements',()=>{
 const s=Engine.create(8,0,21);move(s,'F','M');move(s,'V','M');
 assert.equal(s.layoutComplete,false);assert.equal(s.stageReady,false);assert.equal(s.wrongKey,null);assert.match(s.message,/最多三件/);assert.match(taskGuide(s).next,/○/);
 move(s,'B','N');assert.ok(s.stageReady);assert.ok(Engine.advanceStage(s));checkSave(s);assert.equal(s.layoutComplete,false);assert.match(s.stageDescription,/表演/);
 const held=s.items.find(i=>s.placements[i.key]==='N');choose(s,held.key);const choice=s.choices.find(c=>c.key==='M');
 Engine.press(s,choice.code[0]);checkSave(s);assert.equal(Engine.press(s,'Backspace').status,'accepted');checkSave(s);
});

for(const seed of [0,1])for(const key of ['C','X','Z'])test(`picnic seed ${seed}, ${key}: selected words match visible game and food`,()=>{
 const s=Engine.create(12,0,seed);
 const words={C:[/rabbit/,/roll.*ball/,/pear/],X:[/bear/,/build.*tower/,/juice/],Z:[/deer/,/fly.*kite/,/cake/]};
 for(let stage=0;stage<3;stage++){
  choose(s,key);assert.match(s.targetText,words[key][stage]);
  for(const letter of s.targetText){assert.equal(Engine.press(s,letter===' '?'Space':letter).status,'accepted');checkSave(s);}
  finish(s);assert.equal(s.activityHistory.at(-1).friend,key);
  if(stage){const pose=sampleInvitationPose(s);assert.ok(pose.activityProps.some(p=>p.friend===key&&p.activity===s.activity.id));}
  if(stage<2){assert.ok(Engine.advanceStage(s));checkSave(s);}
 }
 assert.ok(s.solved);
});

test('previous saves stay on their original gameplay and unknown versions are rejected',()=>{
 for(const level of [6,8,12])for(let stage=0;stage<3;stage++){
  const s=Classic.create(level,stage,123),snapshot=Classic.snapshot(s),restored=Engine.restore(snapshot);assert.deepEqual(Engine.snapshot(restored),snapshot);assert.equal(restored.contentVersion,4);assert.equal(Engine.create(level).contentVersion,5);
  const bad=structuredClone(snapshot);bad.state.contentVersion=6;assert.equal(Engine.restore(bad),null);
 }
 const unrelated=Engine.snapshot(Engine.create(2));unrelated.state.contentVersion=5;assert.equal(Engine.restore(unrelated),null);
});

test('completed room remains freely rearrangeable without losing completion or saved placements',()=>{
 const s=Engine.create(8,2,17);move(s,'D','N');assert.ok(s.solved);
 const history=structuredClone(s.stageHistory);move(s,'F','M');assert.equal(s.layoutComplete,false);assert.ok(s.solved);assert.deepEqual(s.stageHistory,history);checkSave(s);
});
