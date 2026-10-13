import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {create,press,tick,renderState,ALPHABET,FALL_SECONDS,CATCH_SECONDS} from '../dist/fruit-challenge/engine.js';
const start=seed=>({...create(seed),paused:false});

test('each random bag covers all 26 letters and continues through 1040 successful catches',()=>{
 const state=start(314),targets=[];
 for(let n=0;n<1040;n++){
  targets.push(state.target);assert.equal(press(state,state.target),'caught');tick(state,CATCH_SECONDS);
  assert.equal(state.phase,'falling');assert.equal(state.spawned,n+2);
 }
 for(let n=0;n<targets.length;n+=26)assert.equal(targets.slice(n,n+26).sort().join(''),ALPHABET);
 for(let n=26;n<targets.length;n+=26)assert.notEqual(targets[n-1],targets[n]);
 assert.equal(state.caught,1040);assert.equal(state.missed,0);assert.equal(state.wrong,0);
 assert.equal(Object.values(state.counts).reduce((a,b)=>a+b,0),1040);
 assert.equal(state.bag.length,26);assert.equal(Object.keys(state.counts).length,26);
 assert.ok(!('completed' in state));assert.ok(!('solved' in state));
});
test('seeds shuffle deterministically with complete bags rather than alphabet order',()=>{
 const a=create(12),b=create(12),c=create(13);
 assert.deepEqual(a,b);assert.notDeepEqual(a.bag,c.bag);assert.notEqual(a.bag.join(''),ALPHABET);
 for(let seed=0;seed<100;seed++)assert.equal(create(seed).bag.slice().sort().join(''),ALPHABET);
});
test('missing all letters keeps producing fruit without ending or crediting catches',()=>{
 const state=start(57),seen=[];
 for(let n=0;n<80;n++){
  seen.push(state.target);tick(state,FALL_SECONDS);assert.equal(state.phase,'miss');
  assert.equal(press(state,state.target),'ignored');assert.equal(state.missed,n+1);
  tick(state,.22);assert.equal(state.phase,'falling');
 }
 assert.equal(new Set(seen).size,26);assert.equal(state.spawned,81);assert.equal(state.caught,0);
});
test('wrong letters do not reset descent; nonletters and catch-animation keys are ignored',()=>{
 const state=start(7);tick(state,1);const target=state.target;
 assert.equal(press(state,target==='A'?'B':'A'),'wrong');assert.equal(state.fallAge,1);assert.equal(state.target,target);
 for(const key of ['Space','Enter','Backspace','中','ab',null])assert.equal(press(state,key),'ignored');
 assert.equal(press(state,target.toLowerCase()),'caught');assert.equal(state.action.fallAge,1);
 for(let n=0;n<50;n++)assert.equal(press(state,target),'ignored');
 assert.equal(state.caught,1);assert.equal(state.wrong,1);tick(state,CATCH_SECONDS);assert.equal(state.spawned,2);
});
test('pause freezes falling, misses and catching; resume consumes only active time',()=>{
 const state=create(55),before=structuredClone(state);tick(state,1000);assert.equal(press(state,state.target),'ignored');assert.deepEqual(state,before);
 state.paused=false;tick(state,FALL_SECONDS-.1);state.paused=true;const falling=structuredClone(state);tick(state,999);assert.deepEqual(state,falling);
 state.paused=false;press(state,state.target);tick(state,.1);state.paused=true;const catching=structuredClone(state);tick(state,999);assert.deepEqual(state,catching);
 state.paused=false;tick(state,CATCH_SECONDS);assert.equal(state.phase,'falling');assert.equal(state.caught,1);assert.equal(state.missed,0);
});
test('invalid time steps cannot change counts or create transitions',()=>{
 const state=start(4),before=structuredClone(state);
 for(const dt of [0,-1,NaN,Infinity])tick(state,dt);
 assert.deepEqual(state,before);
});
test('renderer gets all letters and live counts without a finite completion state',()=>{
 const state=start(89);press(state,state.target);const view=renderState(state);
 assert.equal(view.fruitKeys.join(''),ALPHABET);assert.equal(view.catchStyle,'endless');assert.equal(view.caught,1);
 assert.equal(view.action.type,'catch');assert.equal(view.phase,'catch');assert.equal(view.stageReady,undefined);
});
test('formal records use a separate namespace without adventure progress imports',()=>{
 const root=new URL('../dist/fruit-challenge/',import.meta.url);
 for(const file of readdirSync(root).filter(n=>n.endsWith('.js'))){
  const source=readFileSync(new URL(file,root),'utf8');
  assert.doesNotMatch(source,/sessionStorage|indexedDB|store\.js|register\(/,file);
 }
 const source=readFileSync(new URL('records.js',root),'utf8');
 assert.match(source,/qiaoqiao-island-fruit-records-v1/);
 assert.doesNotMatch(source,/qiaoqiao-island-fruit-combo-test-v1|qiaoqiao-island-challenge-test-v1/);
 const view=readFileSync(new URL('world.js',root),'utf8');
 assert.match(view,/strip\.visible=false/);assert.match(view,/heading\.visible=false/);
});

test('formal challenge retains accepted combo gameplay and is reachable from free practice',()=>{
 for(const file of ['engine.js','world.js','style.css']){
  assert.equal(readFileSync(new URL('../dist/fruit-challenge/'+file,import.meta.url),'utf8'),readFileSync(new URL('../dist/fruit-combo-test/'+file,import.meta.url),'utf8'),file);
 }
 assert.equal(readFileSync(new URL('../dist/fruit-challenge/records.js',import.meta.url),'utf8'),readFileSync(new URL('../dist/fruit-combo-test/records.js',import.meta.url),'utf8').replace('qiaoqiao-island-fruit-combo-test-v1','qiaoqiao-island-fruit-records-v1'));
 const map=readFileSync(new URL('../dist/game/map.js',import.meta.url),'utf8');
 assert.match(map,/fruitChallenge.textContent='全字母接果子'/);
 assert.match(map,/location.href='\.\.\/fruit-challenge\/'/);
 const html=readFileSync(new URL('../dist/fruit-challenge/index.html',import.meta.url),'utf8');
 assert.match(html,/正式版/);assert.doesNotMatch(html,/试玩/);
});
