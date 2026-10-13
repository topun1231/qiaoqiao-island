import test from 'node:test';
import assert from 'node:assert/strict';
import { create,press,tick,advanceStage } from '../dist/challenge-test/engine-v3.js';
import { samplePairingPose, pairingSlotPosition, layoutPairingLabels } from '../dist/challenge-test/pairing-world.js';
import { sampleInvitationPose, invitationGuestKeys, invitationLabelBounds, INVITATION_FRIENDS } from '../dist/challenge-test/invitation-world.js';
const near=(a,b,e=1e-8)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);
const vector=(a,b)=>a.forEach((n,i)=>near(n,b[i]));
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const items=['F','D','V','B'].map(key=>({key,goalZone:key==='B'?'N':'M'}));
const room={contentVersion:3,level:8,items,zones:[{key:'M',capacity:3},{key:'N',capacity:1}],placements:{F:'N',D:'N',V:'N',B:'M'},held:null};
const parts=[{title:'请谁来',text:'join us'},{title:'在哪里',text:'at the park'},{title:'带什么',text:'bring a game'}];
const invitation={level:11,mode:'mail',invitationParts:parts,invitationWritten:[],selected:'C',phase:'acting',stage:'write',picnicGuests:[],arrived:[]};
const picnic={level:12,mode:'mail',phase:'playing',stage:'select',picnicGuests:['C','X','Z'],arrived:[],activityHistory:[],activity:{id:'greet',label:'打招呼'}};

test('reading/play nooks support books and lamps on furniture, cushions and toy baskets on floor',()=>{
 const pose=samplePairingPose(room);
 for(const key of ['V','B'])near(pose.objects[key].position[1],.105);
 for(const key of ['F','D'])assert(pose.objects[key].position[1]>1.0);
 for(const zone of ['M','N'])for(const key of ['V','B'])near(pairingSlotPosition(zone,0,1,key)[1],.105);
 assert.notDeepEqual(pairingSlotPosition('M',0,1,'V'),pairingSlotPosition('N',0,1,'V'));
});
test('all room objects stay at source until grasp, follow bear only after pickup, then settle on support',()=>{
 for(const key of ['F','D','V','B']){
  const source=samplePairingPose(room).objects[key].position;
  const pick=p=>samplePairingPose({...room,action:{type:'pick',item:key,elapsed:p,duration:1}});
  for(const p of [0,.25,.51,.60,.669])vector(pick(p).objects[key].position,source);
  const lifted=pick(1);assert.equal(lifted.objects[key].location,'held');assert(distance(lifted.objects[key].position,source)>.1);
  const context={root:lifted.root,yaw:lifted.yaw};let previous=lifted.objects[key].position;
  for(let i=0;i<=2000;i++){
   const pose=samplePairingPose({...room,held:key,action:{type:'place',item:key,to:'M',elapsed:i/2000,duration:1}},context);
   assert(distance(previous,pose.objects[key].position)<.04);previous=pose.objects[key].position;
   for(const value of [...pose.root,...previous])assert(Number.isFinite(value));
  }
  const committed=samplePairingPose({...room,placements:{...room.placements,[key]:'M'}});
  vector(previous,committed.objects[key].position);
 }
});
test('room labels stay within narrow viewport and retain six unique readable labels',()=>{
 const entries=['F','D','V','B','M','N'].map((key,i)=>({key,destination:i>3,x:i>2?319:0,y:i%2?0:530,width:104,height:52}));
 const placed=layoutPairingLabels(entries,320,540);assert.equal(new Set(placed.map(e=>e.key)).size,6);
 for(const entry of placed){assert(entry.rect.left>=11);assert(entry.rect.right<=309);assert(entry.rect.top>=11);assert(entry.rect.bottom<=529);}
 for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++){
  const a=placed[i].rect,b=placed[j].rect;assert(!(a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top));
 }
});
test('one shared invitation accumulates parts without calling friends until final dispatch',()=>{
 for(let stage=0;stage<2;stage++)for(const p of [0,.3,.7,1]){
  const state={...invitation,lessonStageIndex:stage,invitationWritten:parts.slice(0,stage).map(v=>v.text),action:{type:'deliver',partOnly:true,elapsed:p,duration:1}};
  const pose=sampleInvitationPose(state);assert(pose.shared);assert.equal(pose.writingPart,stage);
  for(const [key,friend]of Object.entries(pose.friends)){assert(friend.visible);assert(!friend.arrived);vector(friend.position,INVITATION_FRIENDS[key].home);}
  assert.deepEqual(invitationGuestKeys(state),[]);
  const savedPart=sampleInvitationPose({...state,action:null,phase:'stage-ready',stageReady:true,arrived:['C']});
  assert.deepEqual(invitationGuestKeys({...state,arrived:['C']}),[]);
  for(const [key,friend]of Object.entries(savedPart.friends)){vector(friend.position,INVITATION_FRIENDS[key].home);assert(!friend.arrived);}
 }
});
test('final shared invitation makes all three guests walk continuously to lasting picnic seats',()=>{
 const previous=Object.fromEntries(Object.entries(INVITATION_FRIENDS).map(([key,f])=>[key,f.home]));
 for(let i=0;i<=1000;i++){
  const pose=sampleInvitationPose({...invitation,lessonStageIndex:2,invitationWritten:['join us','at the park'],action:{type:'deliver',allGuests:true,partOnly:false,elapsed:i/1000*5.5,duration:5.5}});
  for(const [key,friend]of Object.entries(pose.friends)){assert(friend.visible);assert(distance(previous[key],friend.position)<.065);previous[key]=friend.position;}
 }
 const complete=sampleInvitationPose({...invitation,phase:'complete',picnicGuests:['C','X','Z'],invitationWritten:parts.map(v=>v.text)});
 for(const key of Object.keys(previous)){vector(previous[key],INVITATION_FRIENDS[key].seat);vector(complete.friends[key].position,previous[key]);assert(complete.friends[key].arrived);}
});
test('picnic guests persist during every activity and greeting does not manufacture another invitation',()=>{
 for(const activity of ['greet','play','share'])for(const selected of ['C','X','Z'])for(const p of [0,.25,.6,1]){
  const pose=sampleInvitationPose({...picnic,activity:{id:activity},selected,stage:'delivery',phase:'acting',action:{type:'deliver',destination:selected,activity,elapsed:p*2.2,duration:2.2}});
  assert.equal(pose.envelopeVisible,false);
  for(const [key,friend]of Object.entries(pose.friends)){assert(friend.visible&&friend.seated&&friend.arrived);vector(friend.position,INVITATION_FRIENDS[key].seat);}
  assert.equal(pose.activityProps.length,activity==='greet'?0:1);
 }
});
test('chosen play/share result remains after commit and next activity starts at previous bear position',()=>{
 for(const activity of ['play','share'])for(const selected of ['C','X','Z']){
  const active={...picnic,activity:{id:activity},selected,phase:'acting',stage:'delivery',action:{type:'deliver',destination:selected,activity,elapsed:2.2,duration:2.2}};
  const end=sampleInvitationPose(active),history=[{activity,friend:selected,text:'test',stage:1}];
  const committed=sampleInvitationPose({...picnic,activity:{id:'share'},activityHistory:history,phase:'stage-ready',stageReady:true});
  vector(end.root,committed.root);vector(end.activityProps[0].position,committed.activityProps[0].position);
  const visit=sampleInvitationPose({...picnic,activity:{id:'share'},activityHistory:history,selected:'X',phase:'acting',stage:'travel',action:{type:'visit',destination:'X',elapsed:0,duration:1}});
  vector(visit.root,end.root);
 }
});
test('invitation label bounds fit 320px wide and short viewports without clipping',()=>{
 for(const size of [[320,540],[375,280],[1184,606]])for(const point of [[-100,-100],[9999,9999],[160,120]]){
  const b=invitationLabelBounds(...point,304,168,...size);
  assert(b.x-b.width/2>=11.99);assert(b.x+b.width/2<=size[0]-11.99);assert(b.y-b.height>=11.99);assert(b.y<=size[1]-11.99);
 }
});

test('furnished room 8 preserves layouts across an 8/8/4-key reading, corner-swap and performance task',()=>{
 const state=create(8),layouts=[{F:'M',D:'M',V:'M',B:'N'},{F:'N',D:'N',V:'N',B:'M'},{F:'N',D:'M',V:'M',B:'M'}],expectedKeys=[8,8,4];
 for(let stage=0;stage<3;stage++){
  assert.equal(Object.keys(state.placements).length,4,'all four objects are furnished at the start of every stage');
  assert.deepEqual(Object.fromEntries(state.items.map(item=>[item.key,item.goalZone])),layouts[stage]);
  const initial={...state.placements},start=state.accepted.length;
  while(!state.stageReady&&!state.solved){
   const item=state.items.find(item=>state.placements[item.key]!==item.goalZone);assert(item);
   assert.equal(press(state,item.key).status,'accepted');tick(state,100);
   assert.equal(press(state,item.goalZone).status,'accepted');tick(state,100);
   const pose=samplePairingPose(state);
   for(const key of ['V','B'])near(pose.objects[key].position[1],.105);
   for(const key of ['F','D'])assert(pose.objects[key].position[1]>1);
  }
  assert.equal(state.accepted.length-start,expectedKeys[stage]);assert.deepEqual(state.placements,layouts[stage]);assert.notDeepEqual(state.placements,initial);
  if(stage<2){assert(advanceStage(state));assert.deepEqual(state.placements,layouts[stage]);assert.deepEqual(state.initialPlacements,layouts[stage]);}
 }
 assert.equal(state.accepted.length,20);assert(state.solved);
 assert.match(state.zones.find(zone=>zone.key==='M').label,/表演|游戏/);
 assert.match(state.zones.find(zone=>zone.key==='N').label,/阅读|故事/);
});
