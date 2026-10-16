import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/game/engine.js';
import {gateLane,gateKey} from '../dist/game/island-activities.js';
import {activityBallPose} from '../dist/game/activity-world.js';

function command(s,key){for(const char of s.choices.find(c=>c.key===key).code)E.press(s,char);}
const near=(a,b)=>a.forEach((v,i)=>assert(Math.abs(v-b[i])<1e-9));
test('bear follows lateral moves and pushes before the ball rolls, without jumps at commit or restore',()=>{
 const s=E.create(12,0,93);
 for(let gate=0;gate<3;gate++){
  while(s.lane!==gateLane(s)){const from=activityBallPose(s);command(s,s.lane<gateLane(s)?'D':'A');const end=activityBallPose({...s,action:{...s.action,elapsed:s.action.duration}});E.tick(s,100);assert.deepEqual(activityBallPose(s).bear,end.bear);assert.notEqual(from.bear[0],end.bear[0]);}
  const start=activityBallPose(s);command(s,gateKey(s));const snap=JSON.stringify(E.snapshot(s));let previous=start;
  for(let i=0;i<=100;i++){
   const frame={...s,action:{...s.action,elapsed:s.action.duration*i/100}},pose=activityBallPose(frame);
   assert(pose.bear[2]>pose.ball[2],'bear stays behind the ball');assert(Math.abs(pose.bear[0]-pose.ball[0]+.8)<1e-9);
   assert(Math.abs(pose.bear[2]-previous.bear[2])<.1);previous=pose;
   if(i===10){assert(pose.push>0);assert.deepEqual(pose.ball,start.ball,'wind up precedes rolling');}
   if(i===50){assert(pose.bear[2]<start.bear[2]);assert.deepEqual(activityBallPose(E.restore(E.snapshot(frame))),pose);}
  }
  assert.equal(JSON.stringify(E.snapshot(s)),snap,'sampling is read-only');E.tick(s,100);near(activityBallPose(s).bear,previous.bear);near(activityBallPose(s).ball,previous.ball);
 }
 assert(s.stageReady);
});
