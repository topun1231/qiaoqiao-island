import test from 'node:test';
import assert from 'node:assert/strict';
import * as Engine from '../dist/game/engine.js';
import * as V3 from '../dist/game/engine-v3.js';
import {POOLS,fullStageRequiredKeys,remixOrderGroups} from '../dist/game/challenge-curriculum.js';
const {create,press,tick,advanceStage,snapshot,restore,getRequiredKeys}=Engine;
const letters=keys=>[...new Set(keys.filter(k=>/^[A-Z]$/.test(k)))].sort().join('');
const sorted=s=>[...new Set(s)].sort().join('');
const settle=s=>{while(s.action)tick(s,s.action.duration-s.action.elapsed+1e-8);return s;};
function roundtrip(s){const saved=snapshot(s),resumed=restore(JSON.stringify(saved));assert.ok(resumed,`restore ${s.level}/${s.lessonStageIndex}/${s.stage}/${s.action?.type}/${s.codeBuffer}`);assert.deepEqual(snapshot(resumed),saved);return resumed;}
function next(s,choice={}){
 if(s.mode==='catch')return s.catchStyle==='orders'?s.choices.filter(c=>!c.done).at(choice.reverse?-1:0).key:s.target;
 if(s.level===4&&!s.route)return s.tasks[choice.route??0].key;
 if(s.mode==='forest')return s.stage==='select'?s.choices.filter(c=>!c.done).at(choice.destination?-1:0).code:s.choices.find(c=>c.key===s.task.correct).code;
 if(s.mode==='room'){
  if(s.stage==='pick'){const items=s.items.filter(i=>s.placements[i.key]!==i.goalZone);const item=choice.order?items.toSorted((a,b)=>choice.order.indexOf(a.key)-choice.order.indexOf(b.key))[0]:items.at(choice.reverse?-1:0);return item.code;}
  return s.choices.find(c=>c.kind==='zone'&&c.key===s.items.find(i=>i.key===s.held).goalZone).code;
 }
 if(s.mode==='mail'&&s.stage==='select')return s.friends[choice.friend??0].key;
 return s.target;
}
function hit(s,input,roundtrips=false){assert.ok(input,'expected visible next input');for(const key of ['Space','Backspace'].includes(input)?[input]:[...input]){const result=press(s,key);assert.ok(['accepted','queued'].includes(result.status),`${s.level}/${s.lessonStageIndex} ${input} ${key}: ${result.status} ${s.message}`);if(roundtrips)roundtrip(s);}settle(s);}
function stage(s,choice={},roundtrips=false){let guard=0;while(!s.stageReady&&!s.solved){assert.ok(++guard<500);if(roundtrips)roundtrip(s);hit(s,next(s,choice),roundtrips);}if(roundtrips)roundtrip(s);return s;}
function solve(s,choices=[],roundtrips=false){while(!s.solved){stage(s,choices[s.lessonStageIndex]||{},roundtrips);if(s.stageReady)assert.equal(advanceStage(s),true);}return s;}
const permutations=values=>values.length?values.flatMap((v,i)=>permutations(values.filter((_,j)=>i!==j)).map(t=>[v,...t])):[[]];

for(let level=1;level<=12;level++)test(`v4 level ${level}: real input, all stages, every-operation exact resume`,()=>{
 const s=create(level,0,20261012);assert.equal(s.version,4);assert.equal(s.contentVersion,4);solve(s,[],true);assert.equal(s.stageHistory.length,3);
 if(level<=9)assert.equal(letters(s.accepted),sorted(POOLS[level-1]));
 assert.ok(s.accepted.length>=24);assert.equal(s.action,null);assert.deepEqual(s.queue,[]);
 assert.equal(s.seed,20261012);assert.deepEqual(s.stageHistory.map(h=>h.index),[0,1,2]);
});
test('every standalone stage restores without fabricating earlier history',()=>{for(let level=1;level<=12;level++)for(let n=0;n<3;n++){const s=create(level,n,91);roundtrip(s);stage(s,{},true);assert.equal(s.stageHistory[0].index,n);}});
test('all eight complete river choices require nine letters; visible geometry stays at most four stones',()=>{
 for(let bits=0;bits<8;bits++){const s=solve(create(4,0,63),[0,1,2].map(n=>({route:bits>>n&1})));assert.equal(letters(s.accepted),sorted(POOLS[3]));}
 for(let l=3;l<=4;l++)for(let n=0;n<3;n++){const s=create(l,n,2);for(const task of s.tasks)for(const segment of task.segmentSequences||[task.sequence])assert.ok(segment.length<=4);}
});
test('every forest destination order and return route requires all sixteen letters',()=>{for(let first=0;first<2;first++)for(let last=0;last<2;last++){const s=solve(create(6,0,214),[{destination:first},{},{destination:last}]);assert.equal(letters(s.accepted),sorted(POOLS[5]));assert.equal(s.inventory.length,2);assert.equal(s.nodeId,'friend');assert.deepEqual(s.stageHistory.map(h=>h.accepted.length),[10,10,10]);}});
test('all shortest room7 reorderings require nineteen actual typed letters',()=>{for(let bits=0;bits<8;bits++){const s=solve(create(7,0,72),[0,1,2].map(n=>({reverse:Boolean(bits>>n&1)})));assert.equal(letters(s.accepted),sorted(POOLS[6]));assert.deepEqual(s.stageHistory.map(h=>h.accepted.length),[13,12,13]);}});
test('all 1152 shortest room8 ordering combinations require twenty-three letters',()=>{for(const first of permutations(['F','D','V','B']))for(const second of permutations(['F','D','V','B']))for(const last of permutations(['D','V'])){const s=solve(create(8,0,93),[{order:first},{order:second},{order:last}]);assert.equal(letters(s.accepted),sorted(POOLS[7]));assert.deepEqual(s.stageHistory.map(h=>h.accepted.length),[23,23,16]);}});
test('every picnic activity combination has a broad real pool without alphabet filler',()=>{for(let seed=0;seed<2;seed++)for(let a=0;a<3;a++)for(let b=0;b<3;b++)for(let c=0;c<3;c++){const s=solve(create(12,0,seed),[{friend:a},{friend:b},{friend:c}]);assert.ok(letters(s.accepted).length>=18);assert.equal(s.activityHistory.length,3);assert.equal(s.picnicGuests.length,3);assert.ok(s.activityHistory.every(h=>!h.text.includes('quick brown')));}});
test('seeded replay varies real task order and exact saved seed wins over current randomness',()=>{
 for(let level=1;level<=10;level++){const a=create(level,1,17),b=create(level,1,18);assert.notDeepEqual(a.tasks,b.tasks,`variation level ${level}`);assert.deepEqual(a.tasks,create(level,1,{seed:17}).tasks);roundtrip(a);}
 for(let seed=0;seed<24;seed++)for(let level=1;level<=9;level++){const s=solve(create(level,0,seed),[{reverse:true,destination:1,route:1},{reverse:true,destination:1,route:1},{reverse:true,destination:1,route:1}]);assert.equal(letters(s.accepted),sorted(POOLS[level-1]),`pool seed ${seed}/level ${level}`);}
});
test('task codes are 2–4 letters with unique first characters in every active phase',()=>{
 for(let level=5;level<=8;level++)for(let seed=0;seed<40;seed++){const s=create(level,0,seed);while(!s.solved){if(s.stageReady){advanceStage(s);continue;}const codes=s.codeInput.candidates.map(c=>c.code);assert.ok(codes.every(c=>/^[A-Z]{2,4}$/.test(c)));assert.equal(new Set(codes.map(c=>c[0])).size,codes.length);hit(s,next(s));}}
});
test('fixed two-key cadence cannot finish any chapter level1–9',()=>{for(let level=1;level<=9;level++){const s=create(level,0,211);for(let i=0;i<100;i++){press(s,i%2?'J':'F');tick(s,20);}assert.equal(s.solved,false);assert.equal(s.stageReady,false);}});
test('single visible four-key orchard row queues once and never consumes a hidden next row',()=>{
 const s=create(1,0,44),row=s.visibleSequence;for(const key of row)press(s,key);assert.equal(s.queue.length,3);const before=[...s.accepted];assert.equal(press(s,s.tasks[4].key).status,'ignored');assert.deepEqual(s.accepted,before);const r=roundtrip(s);tick(s,100);tick(r,100);assert.deepEqual(snapshot(s),snapshot(r));assert.equal(s.step,4);
});
test('short-code prefixes survive wrong input, pause, edits, and refresh; wrong branch cannot advance',()=>{
 const s=create(5,0,44),code=s.choices.find(c=>c.key===s.task.correct).code;press(s,code[0]);const before=[...s.accepted];assert.equal(press(s,'Z').status,'wrong');assert.deepEqual(s.accepted,before);assert.equal(s.codeBuffer,code[0]);s.paused=true;const r=roundtrip(s);assert.equal(press(r,code[1]).status,'ignored');r.paused=false;
 assert.equal(press(r,'Backspace').inputKind,'correction');assert.equal(r.codeBuffer,'');hit(r,code,true);assert.equal(r.step,1);
 const wrong=r.choices.find(c=>c.key!==r.task.correct),node=r.nodeId,accepted=[...r.accepted];let result;for(const key of wrong.code)result=press(r,key);assert.equal(result.status,'wrong');assert.equal(result.correct,false);assert.deepEqual(r.accepted,accepted);assert.equal(r.action.type,'detour');assert.equal(press(r,r.task.correct).status,'ignored');roundtrip(r);settle(r);assert.equal(r.nodeId,node);assert.equal(r.step,1);
});
test('room whole pending code credits once after pickup and survives mid-action refresh',()=>{
 const s=create(8,0,123),item=s.items.find(i=>s.placements[i.key]!==i.goalZone);for(const key of item.code)press(s,key);assert.equal(s.action.type,'pick');const zone=s.choices.find(c=>c.kind==='zone'&&c.key===item.goalZone);for(const key of zone.code)assert.equal(press(s,key).status,'queued');assert.equal(s.pendingCode,zone.code);assert.equal(s.accepted.join(''),item.code);assert.equal(press(s,'F').status,'ignored');tick(s,.3);const r=roundtrip(s);tick(s,100);tick(r,100);assert.deepEqual(snapshot(s),snapshot(r));assert.equal(s.placements[item.key],item.goalZone);assert.equal(s.accepted.join(''),item.code+zone.code);assert.equal(s.pendingCode,null);
});
test('partially buffered room destination can cross pickup completion without losing its keys',()=>{
 const s=create(8,0,72),item=s.items[0];for(const key of item.code)press(s,key);const code=s.choices.find(c=>c.kind==='zone'&&c.key===item.goalZone).code;press(s,code[0]);assert.equal(s.codeBuffer,code[0]);roundtrip(s);tick(s,.81);roundtrip(s);assert.equal(s.stage,'place');hit(s,code.slice(1),true);assert.equal(s.accepted.join(''),item.code+code);assert.equal(s.placements[item.key],item.goalZone);
});
test('editable cards require actual corrections plus complete words; wrong letters never earn accepted input',()=>{
 const s=create(10,0,30);assert.equal(s.lockedPrefix,'');assert.equal(s.buffer,'cx');const before=[...s.accepted];assert.equal(press(s,'A').status,'wrong');assert.deepEqual(s.accepted,before);assert.equal(s.buffer,'cxa');const correction=press(s,'Backspace');assert.equal(correction.inputKind,'correction');assert.equal(correction.correct,true);hit(s,'Backspace');for(const key of s.targetText.slice(s.buffer.length))press(s,key);assert.equal(s.action.type,'fold');assert.ok(s.accepted.includes('A'));assert.ok(!s.accepted.includes('C'));roundtrip(s);
});
test('current-task preparation never front-loads full alphabet; word boundaries update immediately',()=>{
 const card=create(9,0,17);assert.deepEqual(getRequiredKeys(card),['C']);hit(card,'C');assert.deepEqual(getRequiredKeys(card),['X']);
 const mail=create(11,0,0);assert.deepEqual(getRequiredKeys(mail),['J','O','I','N','Space','Backspace']);for(const key of 'join ')press(mail,key);assert.deepEqual(getRequiredKeys(mail),['U','S','Space','Backspace']);
 for(let level=5;level<=8;level++){const s=create(level,0,17);assert.ok(getRequiredKeys(s).length<19);assert.ok(fullStageRequiredKeys(s).length>=getRequiredKeys(s).length);}
});
test('legacy v1/v2/v3 dispatch preserves exact old tasks, snapshots, action timing and queue',()=>{
 for(const version of [2,3])for(let level=1;level<=12;level++){const old=version===2?V3.createLegacy(level):V3.create(level),save=V3.snapshot(old),resumed=restore(save);assert.ok(resumed);assert.deepEqual(snapshot(resumed),save);assert.deepEqual(resumed,old);assert.deepEqual(getRequiredKeys(resumed),V3.getRequiredKeys(old));}
 const old=V3.create(1,1),current=restore(V3.snapshot(old));for(const key of 'FFJJ'){assert.deepEqual(press(current,key),V3.press(old,key));}tick(current,.7);V3.tick(old,.7);assert.deepEqual(current,old);assert.deepEqual(snapshot(current),V3.snapshot(old));
});
test('corrupt seeded, prefix, pending, and action saves are rejected without invoking accessors',()=>{
 const saved=snapshot(create(5,0,11));for(const change of [s=>s.seed=-1,s=>s.seed=2**32,s=>s.codeBuffer='ZZZZ',s=>s.codeBuffer='Z',s=>s.pendingCode='AA',s=>s.action={type:'walk'}]){const tampered=structuredClone(saved);change(tampered.state);assert.equal(restore(tampered),null);}
 let invoked=false;const malicious={get state(){invoked=true;return saved.state;},version:4};assert.equal(restore(malicious),null);assert.equal(invoked,false);
});
test('procurement remains real selectable orders in all three chapters with bounded target groups',()=>{
 for(let seed=0;seed<12;seed++)for(let first=0;first<2;first++)for(let last=0;last<2;last++){
  const s=create(2,0,seed);assert.equal(s.catchStyle,'orders');assert.equal(s.orders.length,1);assert.ok(s.orders[0].needs.S&&s.orders[0].needs.L);stage(s);advanceStage(s);
  for(const reverse of [Boolean(first),Boolean(last)]){assert.equal(s.stage,'select');const firstId=s.orders.at(reverse?-1:0).id;stage(s,{reverse});assert.equal(s.orderHistory[0],firstId);assert.equal(s.orderHistory.length,2);assert.ok(s.orders.every(o=>Object.keys(o.needs).length===3));if(s.stageReady)advanceStage(s);}
  assert.equal(letters(s.accepted),sorted(POOLS[1]));assert.deepEqual(s.stageHistory.map(h=>h.accepted.length),[4,10,10]);roundtrip(s);
 }
});
test('stone input cannot queue an unseen segment or require an unprepared next-segment letter',()=>{
 for(let level=3;level<=4;level++){const s=create(level,0,82);const segment=level===3?s.tasks[0].sequence:s.tasks[0].segmentSequences[0];for(const key of segment)press(s,key);const before=[...s.accepted],unseen=s.sequence[segment.length];assert.equal(s.target,null);assert.equal(press(s,unseen).status,'ignored');assert.deepEqual(s.accepted,before);roundtrip(s);settle(s);assert.equal(s.index,segment.length);assert.equal(s.target,unseen);assert.ok(getRequiredKeys(s).includes(unseen));}
});
test('correction variety preserves correct prefixes and still requires twenty-one actually typed letters',()=>{
 for(let seed=0;seed<12;seed++){const s=solve(create(10,0,seed));assert.equal(letters(s.accepted),'ABCDEGHIKLMOPRSTUVWYZ');assert.ok(s.accepted.includes('Backspace'));for(let n=0;n<3;n++){const stage=create(10,n,seed);assert.ok(stage.tasks.some(t=>t.initial.startsWith(t.target)));assert.ok(stage.tasks.some(t=>!t.target.startsWith(t.initial)&&!t.initial.startsWith(t.target)));assert.ok(stage.tasks.every(t=>t.initial[0]===t.target[0]&&t.prefix===''));}}
});

test('procurement final baskets change composition for every possible shuffle, regardless of order',()=>{
 const signature=group=>[...group].sort().join('');
 // Exhausting all six-letter permutations proves the positional construction
 // for every shuffle outcome, not merely a collection of fortunate seeds.
 for(const keys of permutations([...'FJDKSL'])){
  const old=[keys.slice(0,3),keys.slice(3)].map(signature),next=remixOrderGroups(keys);
  assert.ok(next.every(group=>!old.includes(signature(group))));
  assert.equal(signature(next.flat()),'DFJKLS');
  assert.ok(next.every(group=>group.length===3));
 }
 // Integration: both stages must use the same seeded base permutation.
 for(let seed=0;seed<4096;seed++){
  const middle=create(2,1,seed),final=create(2,2,seed);
  const old=middle.orders.map(order=>signature(Object.keys(order.needs)));
  assert.ok(final.orders.every(order=>!old.includes(signature(Object.keys(order.needs)))),`seed ${seed}`);
  assert.equal(final.total,middle.total);
  assert.deepEqual(final.orders,create(2,2,{seed}).orders);
 }
});
