import test from 'node:test';
import assert from 'node:assert/strict';
import {create,press,tick} from '../dist/game/engine.js';
import {taskGuide} from '../dist/game/task-guide.js';

test('continuous input guidance distinguishes remaining letters from an already queued row',()=>{
 for(const level of [1,3]){
  const s=create(level,0,314),keys=level===1?s.tasks.slice(0,s.visibleEnd).map(t=>t.key).join(''):s.task.sequence;
  press(s,keys[0]);assert.match(taskGuide(s).controls,/可以继续/);
  assert.deepEqual(taskGuide({...s,target:'SECRET'}),taskGuide(s));
  for(const k of keys.slice(1))press(s,k);
  assert.match(taskGuide(s).controls,/都收到了/);assert.match(taskGuide(s).next,/下一排/);
 }
});
test('route animations still require waiting; forest always names the current destination',()=>{
 for(let stage=0;stage<3;stage++){
  const forest=create(5,stage,314);assert.ok(taskGuide(forest).title.includes(forest.routeGraph.nodes[forest.routeGraph.goal].label));
  for(const k of forest.choices[0].code)press(forest,k);
  assert.match(taskGuide(forest).next,/等动作完成/);
 }
 const river=create(4,0,314);press(river,'A');for(const k of river.choices[0].code)press(river,k);
 assert.match(taskGuide(river).next,/等动作完成/);
});
test('room pickup can receive a placement code; completed rooms no longer repeat objectives',()=>{
 const s=create(8,0,314);for(const k of s.choices[0].code)press(s,k);
 assert.match(taskGuide(s).controls,/可以先输入位置/);tick(s,10);
 const done={...s,held:null,solved:true,phase:'complete'};
 assert.match(taskGuide(done).title,/任务完成/);assert.match(taskGuide(done).next,/不用再完成清单/);
});
