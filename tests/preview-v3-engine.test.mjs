import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {create,createLegacy,press,tick,advanceStage,snapshot,restore,getRequiredKeys,SPECS} from '../dist/preview/engine.js';
const settle=s=>{while(s.action)tick(s,s.action.duration-s.action.elapsed+1e-8);return s;};
const hit=(s,k)=>{const r=press(s,k);assert.ok(['accepted','queued'].includes(r.status),`${s.level}/${s.lessonStageIndex} ${k}: ${s.message}`);return settle(s);};
const roundtrip=s=>{const r=restore(JSON.stringify(snapshot(s)));assert.ok(r,`restore ${s.level}/${s.lessonStageIndex}/${s.action?.type||s.stage}`);assert.deepEqual(snapshot(r),snapshot(s));assert.deepEqual(r,s);return r;};
function next(s,alt=false){
 if(s.mode==='catch'){
  if(s.stage==='select')return s.choices.filter(c=>!c.done).at(alt?-1:0).key;
  if(s.catchStyle==='orders')return s.choices.filter(c=>!c.done&&(!s.balanced||c.key!==s.lastFruit)).at(alt?-1:0).key;
  return s.tasks[s.step].key;
 }
 if(s.mode==='stone'&&s.level===4&&!s.route)return alt?'H':'A';
 if(s.mode==='forest')return s.stage==='select'?s.choices.filter(c=>!c.done).at(alt?-1:0).key:s.task.correct;
 if(s.mode==='room')return s.stage==='pick'?s.items.filter(i=>s.placements[i.key]!==i.goalZone).at(alt?-1:0).key:s.items.find(i=>i.key===s.held).goalZone;
 if(s.mode==='mail'&&s.stage==='select')return s.choices.at(alt?-1:0).key;
 return s.target;
}
function solveStage(s,alt=false){let guard=0;while(!s.stageReady&&!s.solved){assert.ok(++guard<200);roundtrip(s);hit(s,next(s,alt));}roundtrip(s);return s;}
function solve(s,alt=false){let guard=0;while(!s.solved){assert.ok(++guard<4);solveStage(s,alt);if(s.stageReady)assert.equal(advanceStage(s),true);}return s;}

for(let level=1;level<=12;level++)test(`v3 level ${level} completes all three distinct chapters with exact resume at every operation`,()=>{
 const s=create(level);assert.equal(s.version,3);assert.equal(s.contentVersion,3);assert.deepEqual(s.accepted,[]);
 solve(s);assert.equal(s.solved,true);assert.equal(s.stageHistory.length,3);assert.equal(s.action,null);assert.equal(s.queue.length,0);
 for(const key of SPECS[level-1].newKeys)assert.ok(s.accepted.includes(key),`new key ${key} is a real action`);
 roundtrip(s);
});
test('v3 mainline introduces all 26 through actual actions by level 9 in both choice orders',()=>{
 for(const alt of [false,true]){const letters=new Set();for(let l=1;l<=9;l++)for(const key of solve(create(l),alt).accepted)if(key.length===1)letters.add(key);assert.equal([...letters].sort().join(''),'ABCDEFGHIJKLMNOPQRSTUVWXYZ');}
});
test('all 36 standalone chapter states restore, without inventing earlier practice history',()=>{
 for(let l=1;l<=12;l++)for(let stage=0;stage<3;stage++){const s=create(l,stage);roundtrip(s);assert.deepEqual(s.accepted,[]);assert.deepEqual(s.stageHistory,[]);solveStage(s);assert.equal(s.stageHistory[0].index,stage);}
});
test('single falling fruit never queues a hidden fruit; visible four-key row queues exactly and stops at row boundary',()=>{
 const warm=create(1);press(warm,'F');assert.equal(press(warm,'J').status,'ignored');assert.deepEqual(warm.accepted,['F']);
 const s=create(1,1);assert.equal(s.visibleSequence,'FFJJ');assert.equal(press(s,'F').status,'accepted');
 for(const key of 'FJJ')assert.equal(press(s,key).status,'queued');assert.deepEqual(s.queue,[...'FJJ']);assert.deepEqual(s.accepted,[...'FFJJ']);
 assert.equal(press(s,'J').status,'ignored');assert.match(s.message,/下一排/);s.paused=true;const frozen=snapshot(s);tick(s,100);press(s,'F');assert.deepEqual(snapshot(s),frozen);
 const restored=roundtrip(s);s.paused=false;restored.paused=false;tick(s,100);tick(restored,100);assert.deepEqual(s,restored);assert.equal(s.step,4);assert.equal(s.visibleSequence,'JFJF');assert.deepEqual(s.accepted,[...'FFJJ']);
 for(const key of 'JFJF')press(s,key);tick(s,100);assert.equal(s.stageReady,true);assert.deepEqual(s.accepted,[...'FFJJJFJF']);assert.equal(advanceStage(s),true);assert.deepEqual(s.queue,[]);assert.equal(s.step,0);roundtrip(s);
});
test('fruit orders have different physical basket contents and chosen priority survives save',()=>{
 for(const first of ['D','K']){
  const s=create(2,1);assert.equal(s.stage,'select');hit(s,first);const initial=s.orderId;
  assert.equal(initial,first==='D'?'rabbit':'bear');assert.equal(s.counts[first],0,'choosing a basket is not a caught fruit');
  while(!s.orderCompleted.includes(initial))hit(s,next(s));assert.equal(s.stage,'select');assert.deepEqual(s.orderHistory,[initial]);
  assert.deepEqual(s.orderCounts[initial],s.orders.find(o=>o.id===initial).needs);roundtrip(s);solveStage(s);
  assert.deepEqual(s.orderHistory,first==='D'?['rabbit','bear']:['bear','rabbit']);assert.deepEqual(s.orderCounts.rabbit,{D:2,K:1});assert.deepEqual(s.orderCounts.bear,{D:1,K:2});
 }
});
test('balanced box enforces one of each per pair instead of repeating a bigger quota',()=>{
 const s=create(2,2);assert.equal(s.balanced,true);hit(s,'D');const before=[...s.accepted];assert.equal(press(s,'D').status,'wrong');assert.deepEqual(s.accepted,before);hit(s,'K');hit(s,'D');hit(s,'K');assert.equal(s.solved,true);assert.deepEqual(s.counts,{D:2,K:2});
 const other=create(2,2);for(const key of 'KDKD')hit(other,key);assert.equal(other.solved,true);assert.notDeepEqual(s.accepted,other.accepted);
});
test('pending other order fruit is credited once only after current catch commits',()=>{
 const s=create(2);press(s,'D');assert.equal(press(s,'K').status,'queued');assert.deepEqual(s.accepted,['D']);assert.equal(s.pendingKey,'K');tick(s,.31);const r=roundtrip(s);tick(s,100);tick(r,100);assert.deepEqual(r,s);assert.deepEqual(s.accepted,['D','K']);assert.deepEqual(s.orderCounts.picnic,{D:1,K:1});
});
test('forest journeys use 12 physical junctions and different clue reading, without repeating a fixed station',()=>{
 const s=create(5);const seen=[];for(let stage=0;stage<3;stage++){
  assert.equal(s.tasks.length,4);if(stage===1)assert.equal(s.task.routePreview.length,2);if(stage===2)assert.match(s.task.clue,/两个特征/);
  while(!s.stageReady&&!s.solved){const before=s.nodeId;const t=s.task;assert.equal(t.nodeFrom,before);press(s,t.correct);assert.equal(s.action.from,before);assert.equal(s.action.to,t.nodeTo);assert.ok(s.action.duration<=1.1);seen.push(t.id);roundtrip(s);settle(s);assert.equal(s.nodeId,t.nodeTo);}
  if(stage<2){assert.equal(s.solved,false);advanceStage(s);}
 }assert.equal(new Set(seen).size,12);assert.equal(s.solved,true);assert.deepEqual(s.stageHistory.map(h=>h.accepted.join('')),['EIRU','IEUR','IERU']);assert.ok(s.traversedNodes.includes('s0-n4'));assert.ok(s.traversedNodes.includes('s2-n4'));
});
test('forest wrong branch returns to the same current node without progress or hidden key consumption',()=>{
 const s=create(5);hit(s,s.task.correct);const node=s.nodeId,accepted=[...s.accepted];const wrong=s.task.branches.find(b=>b.key!==s.task.correct);
 assert.equal(press(s,wrong.key).status,'wrong');assert.equal(s.action.from,node);assert.equal(s.action.to,wrong.nodeTo);assert.equal(press(s,s.task.correct).status,'ignored');roundtrip(s);settle(s);assert.equal(s.nodeId,node);assert.equal(s.step,1);assert.deepEqual(s.accepted,accepted);
});
test('forest pickup order remains a real choice; inventory persists and final journey never refetches',()=>{
 for(const first of ['T','Y']){
  const s=create(6);hit(s,first);assert.equal(s.nodeId,`${first.toLowerCase()}-start`);hit(s,s.task.correct);assert.equal(s.nodeId,`${first.toLowerCase()}-mid`);hit(s,s.task.correct);
  assert.deepEqual(s.inventory,[first]);const endpoint=s.nodeId;advanceStage(s);assert.equal(s.nodeId,endpoint);assert.deepEqual(s.inventory,[first]);assert.equal(press(s,first).status,'ignored');
  const second=first==='T'?'Y':'T';press(s,second);assert.equal(s.action.from,endpoint);settle(s);hit(s,s.task.correct);hit(s,s.task.correct);assert.deepEqual(s.inventory,[first,second]);
  advanceStage(s);const kept=[...s.inventory];hit(s,first);hit(s,s.task.correct);press(s,s.task.correct);assert.equal(s.action.targetFriend,true);assert.equal(s.action.to,'friend');roundtrip(s);settle(s);assert.deepEqual(s.inventory,kept);assert.deepEqual(s.routeOrder,kept);assert.equal(s.nodeId,'friend');assert.equal(s.solved,true);
 }
});
test('room putaway goals are fixed by use and later chapters preserve placed objects',()=>{
 const s=create(7);hit(s,'Q');hit(s,'P');hit(s,'O');hit(s,'W');assert.equal(s.layoutComplete,false);assert.equal(s.stageReady,false);
 solveStage(s);assert.deepEqual(s.placements,{Q:'W',O:'P'});advanceStage(s);assert.deepEqual(s.placements,{Q:'W',O:'P'});solveStage(s);const before={...s.placements};advanceStage(s);assert.deepEqual(s.placements,before);assert.equal(s.layoutComplete,false);solveStage(s);assert.deepEqual(s.placements,{Q:'P',O:'P',F:'P',D:'W'});
});
test('room8 begins fully furnished and each condition requires moving existing items',()=>{
 const s=create(8);assert.equal(Object.keys(s.placements).length,4);assert.ok(s.zones.every(z=>!z.label.includes('桌')));const moved=[];
 for(let stage=0;stage<3;stage++){const changes=s.items.filter(i=>s.placements[i.key]!==i.goalZone);assert.ok(changes.length>0);assert.ok(changes.every(i=>s.placements[i.key]));moved.push(changes.map(i=>i.key));solveStage(s);if(stage<2)advanceStage(s);}
 assert.deepEqual(moved,[['F','D','V','B'],['F','D','V','B'],['D','V']]);for(const key of 'VMBN')assert.ok(s.stageHistory[0].accepted.includes(key));assert.equal(s.solved,true);
 const kept=[...s.accepted];hit(s,'F');hit(s,'M');assert.equal(s.solved,true);assert.equal(s.phase,'complete');assert.deepEqual(s.accepted.slice(0,kept.length),kept);roundtrip(s);
});
test('room pending pickup/place survives pause and restore with exactly one placement action',()=>{
 const s=create(8);press(s,'V');assert.equal(press(s,'M').status,'queued');tick(s,.3);s.paused=true;const r=roundtrip(s);tick(r,100);assert.deepEqual(r,s);r.paused=false;tick(r,100);assert.equal(r.placements.V,'M');assert.deepEqual(r.accepted,['V','M']);assert.equal(r.pendingKey,null);roundtrip(r);
});
test('one three-part invitation stays on one card and all friends arrive only when complete',()=>{
 const s=create(11);for(let stage=0;stage<3;stage++){
  assert.equal(s.targetText,s.invitationParts[stage].text);if(stage<2)assert.deepEqual(s.picnicGuests,[]);for(const key of s.targetText)assert.equal(press(s,key).status,'accepted');assert.equal(s.action.partOnly,stage<2);assert.equal(s.action.allGuests,stage===2);roundtrip(s);settle(s);assert.equal(s.invitationWritten.length,stage+1);if(stage<2){assert.deepEqual(s.picnicGuests,[]);advanceStage(s);}
 }assert.deepEqual(s.picnicGuests,['C','X','Z']);assert.deepEqual(s.invitationWritten,['join us','at the park','bring a game']);assert.equal(s.solved,true);
});
test('picnic starts with invited friends, choices change activities, and nobody is reinvited',()=>{
 for(const friend of ['C','X','Z']){
  const s=create(12);assert.deepEqual(s.picnicGuests,['C','X','Z']);const goals=[];
  for(let stage=0;stage<3;stage++){assert.equal(s.stage,'select');hit(s,friend);goals.push(s.targetText);assert.doesNotMatch(s.message,/家门|邀请/);for(const k of s.targetText)press(s,k);assert.equal(s.action.activity,['greet','play','share'][stage]);settle(s);assert.equal(s.activityHistory.length,stage+1);assert.deepEqual(s.picnicGuests,['C','X','Z']);if(stage<2)advanceStage(s);}
  assert.equal(new Set(goals).size,3);assert.ok(s.activityHistory.every(a=>a.friend===friend));roundtrip(s);
 }
 assert.notEqual(create(12,1).friends[0].text,create(12,1).friends[1].text);
});
test('editable invitations preserve Space and Backspace, and selecting a friend does not type a letter',()=>{
 const s=create(12);hit(s,'X');assert.equal(s.buffer,'');assert.deepEqual(s.accepted,['X']);assert.ok(getRequiredKeys(s).includes('Space'));assert.ok(getRequiredKeys(s).includes('Backspace'));
 press(s,'q');assert.equal(s.target,'Backspace');hit(s,'Backspace');assert.equal(s.buffer,'');for(const k of s.targetText)press(s,k);settle(s);assert.ok(s.accepted.includes('Backspace'));assert.ok(s.accepted.includes('Space'));roundtrip(s);
});
test('old v1/v2 snapshots keep actual progress, in-flight elapsed time, queue, and earned badges',()=>{
 for(const name of ['preview-v1-mid-action','preview-v1-complete']){
  const fixtures=JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}.json`,import.meta.url),'utf8'));
  for(const original of fixtures){const s=restore(original);assert.ok(s);assert.equal(s.version,2);for(const [field,value]of Object.entries(original.state))if(field!=='version')assert.deepEqual(s[field],value,`${name}/${original.state.level}/${field}`);roundtrip(s);}
 }
 const old=createLegacy(3);for(const k of 'SLFJSL')press(old,k);tick(old,.2);const before=snapshot(old);assert.deepEqual(snapshot(restore(before)),before);settle(old);assert.deepEqual(old.accepted,[...'SLFJSL']);
});
test('v3 corrupted hidden queues, inventory, order data and histories are rejected',()=>{
 const samples=[
  [create(1),s=>{s.queue=['J'];}],
  [create(1,1),s=>{s.queue=['J'];}],
  [create(6),s=>{s.inventory=['Z'];}],
  [create(2),s=>{s.orderCounts={picnic:{D:1}};}],
  [create(2),s=>{s.orderId='fake';}],
  [create(7),s=>{s.placements={Q:'fake'};}],
  [create(12),s=>{s.activityHistory=Array(4).fill({});}],
  [create(11),s=>{s.contentVersion=2;}],
  [create(5),s=>{s.traversedNodes=[null];}],
 ];
 for(const[state,corrupt]of samples){const save=snapshot(state);corrupt(save.state);assert.equal(restore(save),null);}
});

test('v3 save validator rejects forged action destinations and durable story results',()=>{
 const fruit=create(2);press(fruit,'D');let value=snapshot(fruit);value.state.action.orderId='bear';assert.equal(restore(value),null);
 const blank=create(2);value=snapshot(blank);value.state.orderCounts={picnic:'bad'};assert.equal(restore(value),null);value=snapshot(blank);value.state.orderCompleted=['picnic'];assert.equal(restore(value),null);
 const invitation=create(11);for(const key of invitation.targetText)press(invitation,key);value=snapshot(invitation);value.state.action.allGuests=true;assert.equal(restore(value),null);
 value=snapshot(create(11));value.state.invitationWritten=['join us'];assert.equal(restore(value),null);
 value=snapshot(create(12));value.state.picnicGuests=[];assert.equal(restore(value),null);
 const picnic=solveStage(create(12));value=snapshot(picnic);value.state.activityHistory[0].activity='share';assert.equal(restore(value),null);
 const forest=create(5);value=snapshot(forest);value.state.nodeId='s0-n4';assert.equal(restore(value),null);
});

test('automatic fruit-basket boundary names the next basket rather than the completed one',()=>{
 const s=create(1,2);for(const key of 'FFJ')hit(s,key);assert.equal(s.orderId,'bear');assert.match(s.message,/这个篮子装好了.*小熊篮/);assert.doesNotMatch(s.message,/小兔篮还缺/);assert.deepEqual(s.orderCounts.rabbit,{F:2,J:1});roundtrip(s);
});

test('final forest delivery moves through new forward route nodes without revisiting a pickup',()=>{
 for(const route of ['T','Y']){const s=create(6,2);const pickup=s.nodeId;press(s,route);assert.equal(s.action.from,pickup);assert.equal(s.action.to,`${route.toLowerCase()}-return`);settle(s);hit(s,s.task.correct);assert.equal(s.nodeId,`${route.toLowerCase()}-meet`);hit(s,s.task.correct);assert.equal(s.nodeId,'friend');assert.deepEqual(s.inventory,['T','Y']);roundtrip(s);}
});

test('last forest chapter requires the second trait between same-category landmarks',()=>{
 const s=create(5,2);const pairs=[['blueMushroom','blueMushroomPlain'],['beehiveRibbon','beehive'],['bridgeFootprints','bridgePlain'],['cabinLit','cabinDark']];
 s.tasks.forEach((task,index)=>{const right=task.branches.find(branch=>branch.key===task.correct),wrong=task.branches.find(branch=>branch.key!==task.correct);assert.deepEqual([right.feature,wrong.feature],pairs[index]);assert.equal(right.traitPresent,true);assert.equal(wrong.traitPresent,false);assert.match(wrong.label,/没有/);assert.match(task.clue,/两个特征/);});
 assert.equal(s.tasks.map(task=>task.correct).join(''),'IERU');
});
test('room8 later chapters swap all furniture then move light and cushion for a performance',()=>{
 const s=create(8);solveStage(s);advanceStage(s);assert.deepEqual(s.placements,{F:'M',D:'M',V:'M',B:'N'});const before=s.accepted.length;solveStage(s);assert.equal(s.accepted.length-before,8);assert.deepEqual(s.placements,{F:'N',D:'N',V:'N',B:'M'});advanceStage(s);const second=s.accepted.length;solveStage(s);assert.equal(s.accepted.length-second,4);assert.deepEqual(s.placements,{F:'N',D:'M',V:'M',B:'M'});assert.deepEqual(s.zones.map(zone=>zone.capacity),[3,1]);
});
