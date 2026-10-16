import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/game/engine.js';
import {forestGraph,refreshRoute} from '../dist/game/forest-adventure.js';
import {layoutForestSigns,signConnector,segmentCrossesBox,forestScreenArrow} from '../dist/game/forest-sign-layout.js';
import {forestActionRoute,forestMotionSample,forestTaskChoices,forestLayout} from '../dist/game/forest-adventure-world.js';
import {POOLS} from '../dist/game/challenge-curriculum.js';
import {STORAGE_KEY} from '../dist/game/store.js';
import {SOUND_KEY} from '../dist/game/feedback.js';
export function nextNode(s,goal){const g=forestGraph(s),q=[[s.nodeId,[]]],seen=new Set();while(q.length){const [id,path]=q.shift();if(id===goal)return path[0];if(seen.has(id))continue;seen.add(id);for(const edge of g.edges){const to=edge.from===id?edge.to:edge.to===id?edge.from:null;if(to)q.push([to,[...path,to]]);}}throw Error('unreachable');}
const roundtrip=s=>{const snapshot=E.snapshot(s),r=E.restore(snapshot);assert.ok(r);assert.deepEqual(E.snapshot(r),snapshot);assert.equal(r.nodeId,s.nodeId);assert.deepEqual(r.inventory,s.inventory);assert.equal(r.codeBuffer,s.codeBuffer);return r;};
function move(s,to){const c=s.choices.find(c=>c.nodeTo===to);assert.ok(c);for(const k of c.code){assert.equal(E.press(s,k).status,'accepted');roundtrip(s);}assert.ok(s.action);const start=forestMotionSample(s,0).point,end=forestMotionSample(s,1).point;assert.ok(start.every((v,i)=>Math.abs(v-forestGraph(s).nodes[s.nodeId].point[i])<1e-9));assert.ok(end.every((v,i)=>Math.abs(v-forestGraph(s).nodes[to].point[i])<1e-9));assert.equal(forestActionRoute(s).returning,false);E.tick(s,.4);roundtrip(s);E.tick(s,1);roundtrip(s);}
function walk(s,goal){for(let n=0;s.nodeId!==goal&&n<40;n++)move(s,nextNode(s,goal));assert.equal(s.nodeId,goal);}
for(const level of [5,6])for(const seed of [0,314,0xffffffff])test(`level ${level} seed ${seed}: all three stages with per-key and mid-walk recovery`,()=>{let s=E.create(level,0,seed);for(let stage=0;stage<3;stage++){const goal=level===5?forestGraph(s).goal:stage===0?'t-end':stage===1?'y-end':'friend';walk(s,goal);assert.ok(s.stageReady||s.solved);if(stage<2){const at=s.nodeId,items=[...s.inventory];assert.ok(E.advanceStage(s));if(level===6){assert.equal(s.nodeId,at);assert.deepEqual(s.inventory,items);}s=roundtrip(s);}}assert.ok(s.solved);});
for(const level of [5,6])test(`level ${level}: paths contain cycles, dead ends, unique mixed codes and visible scene endpoints`,()=>{
 for(let stage=0;stage<3;stage++){const s=E.create(level,stage,17),g=forestGraph(s);assert.ok(Object.keys(g.nodes).length>=12);assert.ok(g.edges.length>=Object.keys(g.nodes).length);assert.ok(g.edges.filter(e=>e.from==='d0'||e.to==='d0'||e.from==='ld'||e.to==='ld').length===1);
 for(const id of Object.keys(g.nodes)){s.nodeId=id;refreshRoute(s); // Geometry/choice inspection only; gameplay tests above use inputs.
  const neighbors=g.edges.filter(e=>e.from===id||e.to===id);assert.ok(neighbors.length<=3);
  assert.deepEqual(forestLayout({...s,routeGraph:g}).nodes[id],g.nodes[id].point);
 for(const c of s.choices){assert.equal(c.code.length,level===5?[2,3,4][stage]:[3,3,4][stage]);assert.equal(new Set(c.code).size,c.code.length);for(const k of c.code)assert.ok(POOLS[level-1].includes(k));}
 assert.equal(new Set(s.choices.map(c=>c.code[0])).size,s.choices.length);
 }
 }
});
test('three crowded signs stay separated, inside the viewport and outside the bear',()=>{
 const touches=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
 for(const [width,height] of [[320,420],[480,600],[900,400],[1280,600]])for(const edge of [0,.5,1]){
  const bear={x:width/2-45,y:height*.55,w:90,h:100};
  const boards=Array.from({length:3},(_,i)=>({x:width*edge+i*6,y:height*.7+i*4,w:width<500?150:164,h:74}));
  const boxes=layoutForestSigns(boards,width,height,bear);
  assert.deepEqual(boxes,layoutForestSigns(boards,width,height,bear));
  for(let i=0;i<boxes.length;i++){const b=boxes[i];assert.ok(b.x>=8&&b.y>=8&&b.x+b.w<=width-8&&b.y+b.h<=height-8);assert.ok(!touches(b,bear));for(let j=0;j<i;j++)assert.ok(!touches(b,boxes[j]));}
 }
});
test('deep forest fork: right path stays right and its connector never crosses the return sign',()=>{
 const origin={x:627,y:463},bear={x:576,y:350,w:103,h:137};
 const pins=[[611,486],[738,451],[696,373]].map(([x,y])=>({x,y,origin,w:164,h:74}));
 const boxes=layoutForestSigns(pins,1280,554,bear);
 assert.ok(boxes[1].x>pins[1].x);assert.ok(boxes[2].y+74<pins[2].y);
 for(let i=0;i<3;i++)for(let j=0;j<3;j++)if(i!==j){assert.ok(!segmentCrossesBox(signConnector(boxes[i],pins[i]),pins[i],boxes[j]));const p=pins[i],b=boxes[j];assert.ok(!(p.x>b.x&&p.x<b.x+b.w&&p.y>b.y&&p.y<b.y+b.h));}
 assert.equal(forestScreenArrow(origin,pins[1]),'→');assert.equal(forestScreenArrow(origin,pins[2]),'↗');
 for(const [end,expected] of [[{x:0,y:-20},'↑'],[{x:-20,y:20},'↙'],[{x:20,y:20},'↘']])assert.equal(forestScreenArrow({x:0,y:0},end),expected);
});
test('dead ends persist until the player types the return code; no typo for exploring',()=>{for(const level of [5,6]){const s=E.create(level,0,31);walk(s,level===5?'d0':'ld');const at=s.nodeId;assert.equal(s.choices.length,1);assert.equal(s.wrongKey,null);E.tick(s,90);assert.equal(s.nodeId,at);const restored=roundtrip(s);move(restored,restored.choices[0].nodeTo);assert.notEqual(restored.nodeId,at);}});
test('procurement accepts either order and reaching camp too early does not finish',()=>{const s=E.create(6,0,7);walk(s,'friend');assert.ok(!s.solved&&!s.stageReady);walk(s,'y-end');assert.deepEqual(s.inventory,['Y']);E.advanceStage(s);assert.equal(s.nodeId,'y-end');walk(s,'t-end');E.advanceStage(s);assert.deepEqual(s.inventory,['Y','T']);walk(s,'friend');assert.ok(s.solved);});
test('partial codes wait, wrong letters preserve prefix, Backspace changes direction, pause freezes walking',()=>{const s=E.create(5,0,92);const c=s.choices[0];E.press(s,c.code[0]);assert.equal(s.action,null);const before=s.nodeId;E.tick(s,50);assert.equal(s.nodeId,before);assert.equal(E.press(s,'Z').status,'wrong');assert.equal(s.codeBuffer,c.code[0]);roundtrip(s);E.press(s,'Backspace');assert.equal(s.codeBuffer,'');for(const k of c.code)E.press(s,k);s.paused=true;E.tick(s,50);assert.equal(s.action.elapsed,0);s.paused=false;E.tick(s,1);assert.equal(s.nodeId,c.nodeTo);});
test('formal storage keeps its namespace and malformed forest saves are rejected',()=>{assert.equal(STORAGE_KEY,'qiaoqiao-island-challenge-test-v1');assert.equal(SOUND_KEY,'qiaoqiao-island-sound-v1');const good=E.snapshot(E.create(5,0,9));for(const change of [s=>s.routeAdventure=1,s=>s.level=12,s=>s.accepted=['Z'],s=>s.action={},s=>s.nodeId='d0',s=>s.lessonStageIndex=2]){const bad=structuredClone(good);change(bad.state);assert.equal(E.restore(bad),null);}let invoked=false;const bad=structuredClone(good);Object.defineProperty(bad.state,'accepted',{get(){invoked=true;return[];}});assert.equal(E.restore(bad),null);assert.equal(invoked,false);});
