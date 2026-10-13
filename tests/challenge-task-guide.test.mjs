import test from 'node:test';
import assert from 'node:assert/strict';
import {create,press,tick,snapshot,restore} from '../dist/challenge-test/engine.js';
import {taskGuide} from '../dist/challenge-test/task-guide.js';

test('all 36 stage entries explain controls without mutating or consulting a next-key answer',()=>{
 for(let level=1;level<=12;level++)for(let stage=0;stage<3;stage++){
  const state=create(level,stage,314),before=snapshot(state),view=taskGuide(state);
  assert.ok(view?.title&&view.controls&&view.next,`${level}/${stage}`);
  assert.match(view.controls,/按|输入/);
  assert.deepEqual(snapshot(state),before);
  assert.deepEqual(taskGuide({...state,target:'SECRET'}),view);
  assert.deepEqual(taskGuide(restore(before)),view);
 }
});
test('basket choice changes to the selected order instructions and retains the other option',()=>{
 const state=create(2,2,314);
 assert.match(taskGuide(state).controls,/F 选左篮，J 选右篮/);
 assert.match(taskGuide(state).next,/都要装满/);
 press(state,'J');tick(state,10);
 assert.match(taskGuide(state).title,/分享组合篮/);
 assert.doesNotMatch(taskGuide(state).controls,/选.*篮/);
});
test('short-code selection, partial input, held item and free arranging have distinct instructions',()=>{
 const state=create(7,1,314),code=state.codeInput.candidates[0].code;
 press(state,code[0]);assert.match(taskGuide(state).next,/已输入/);
 for(const key of code.slice(1))press(state,key);
 assert.match(taskGuide(state).title,/正在完成/);
 tick(state,10);assert.ok(state.held);assert.match(taskGuide(state).controls,/本次收纳码/);
 assert.match(taskGuide({...state,held:null,solved:true,phase:'complete'}).title,/自由布置/);
});
test('checkpoints hide guidance, while return routes do not ask to fetch food again',()=>{
 assert.equal(taskGuide({...create(1),stageReady:true}),null);
 assert.equal(taskGuide({...create(12),phase:'complete'}),null);
 assert.equal(taskGuide({...create(1),version:3}),null);
 assert.match(taskGuide(create(6,2,314)).title,/回程/);
 assert.doesNotMatch(taskGuide(create(6,2,314)).next,/都要取/);
});
