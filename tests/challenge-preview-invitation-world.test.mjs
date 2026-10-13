import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import { Box3 } from '../dist/vendor/three.module.js';
import {create,press,tick,advanceStage} from '../dist/challenge-test/engine-v3.js';
import {sampleInvitationPose,INVITATION_FRIENDS} from '../dist/challenge-test/invitation-world.js';
const near=(a,b,e=1e-8)=>assert(Math.abs(a-b)<e,`${a} differs from ${b}`);
const vectorNear=(a,b)=>a.forEach((n,i)=>near(n,b[i]));
const delivery=(key,p,arrived=[])=>({level:12,mode:'mail',stage:'delivery',phase:'acting',selected:key,arrived,action:{type:'deliver',destination:key,elapsed:p*5.2,duration:5.2}});

test('every selectable house has a continuous real bear visit ending at its own door',()=>{
 for(const key of['C','X','Z']){let prev=null;for(let i=0;i<=1000;i++){const pose=sampleInvitationPose({level:12,mode:'mail',stage:'travel',phase:'acting',selected:key,action:{type:'visit',destination:key,elapsed:i/1000*2.1,duration:2.1}});if(prev)assert(Math.hypot(...pose.root.map((v,j)=>v-prev[j]))<.045);prev=pose.root;}vectorNear(prev,INVITATION_FRIENDS[key].stop);}
});
test('recipient visibly walks from its own house to picnic, and stays after commit',()=>{
 for(const key of['C','X','Z']){let prev=INVITATION_FRIENDS[key].home;for(let i=0;i<=1000;i++){const pose=sampleInvitationPose(delivery(key,i/1000)),friend=pose.friends[key];assert(friend.visible);assert(Math.hypot(...friend.position.map((v,j)=>v-prev[j]))<.055);prev=friend.position;}
 vectorNear(prev,INVITATION_FRIENDS[key].seat);const settled=sampleInvitationPose({level:12,mode:'mail',phase:'playing',stage:'select',arrived:[key]});vectorNear(settled.friends[key].position,prev);assert(settled.friends[key].seated);
 }
});
test('uninvited friends never arrive and prior invitees remain through other visits',()=>{
 const before=sampleInvitationPose(delivery('Z',.8,['C']));assert(before.friends.C.seated);assert(!before.friends.X.visible);assert(!before.friends.Z.seated);vectorNear(before.friends.C.position,INVITATION_FRIENDS.C.seat);
 const end=sampleInvitationPose({level:12,mode:'mail',phase:'complete',arrived:['Z','X','C']});for(const f of Object.values(end.friends)){assert(f.visible&&f.arrived&&f.seated);}
});
test('level11 J identity maps to the first bear friend and only its actual arrival',()=>{
 const pose=sampleInvitationPose({level:11,mode:'mail',phase:'playing',stage:'write',selected:'J'});assert.equal(pose.selected,'X');assert(pose.friends.X.visible);assert(!pose.friends.C.visible);assert(!pose.friends.Z.visible);
 const end=sampleInvitationPose({level:11,mode:'mail',phase:'complete',selected:'J',arrived:['J']});assert(end.friends.X.arrived);assert(!end.friends.C.arrived);
});
test('card stamp, fold, and packing poses are deterministic and ordered',()=>{
 const base={level:9,mode:'card',phase:'acting',action:{type:'fold',duration:1.6,elapsed:0}};
 const start=sampleInvitationPose(base);assert.equal(start.fold,0);assert.equal(start.pack,0);
 const mid=sampleInvitationPose({...base,action:{...base.action,elapsed:.8}});assert(mid.fold>0&&mid.pack===0);
 const end=sampleInvitationPose({...base,action:{...base.action,elapsed:1.6}});near(end.fold,1);near(end.pack,1);assert.deepEqual(sampleInvitationPose(base),start);
});

class Element{
 constructor(tag='div'){this.tagName=tag;this.style={};this.dataset={};this.children=[];this.attributes={};this.classList={add:()=>{}};this.clientWidth=1200;this.clientHeight=820;}
 appendChild(n){n.parentNode=this;this.children.push(n);return n;}
 replaceChildren(...nodes){this.children=[];nodes.forEach(n=>this.appendChild(n));}
 insertBefore(n,before){this.children=this.children.filter(c=>c!==n);const i=this.children.indexOf(before);this.children.splice(i<0?this.children.length:i,0,n);n.parentNode=this;return n;}
 setAttribute(k,v){this.attributes[k]=v;}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);}
 getContext(){return new Proxy({},{get:(o,k)=>o[k]??(()=>{}),set:(o,k,v)=>(o[k]=v,true)});}
}
function assertPicnicGuestClearance(scene,key,idle=false){
 const bearMeshes=[],guestMeshes=[];
 scene.getObjectByName('bear-carrying-invitation').traverse(node=>{if(node.isMesh)bearMeshes.push(node);});
 scene.getObjectByName(`cottage-recipient-${INVITATION_FRIENDS[key].index+1}`).traverse(node=>{if(node.isMesh)guestMeshes.push(node);});
 let minimum=Infinity;
 for(const bear of bearMeshes)for(const guest of guestMeshes){
  const a=new Box3().setFromObject(bear),b=new Box3().setFromObject(guest);
  const gap=Math.hypot(Math.max(0,a.min.x-b.max.x,b.min.x-a.max.x),Math.max(0,a.min.y-b.max.y,b.min.y-a.max.y),Math.max(0,a.min.z-b.max.z,b.min.z-a.max.z));
  minimum=Math.min(minimum,gap);
  if(gap>0)continue;
  // Rounded meshes can have overlapping bounding-box corners. A separating
  // axis using their actual transformed vertices proves the meshes stay clear.
  const centerA=new bear.position.constructor(),centerB=new guest.position.constructor();bear.getWorldPosition(centerA);guest.getWorldPosition(centerB);
  const axis=centerB.sub(centerA).normalize();let maximumA=-Infinity,minimumB=Infinity;
  for(const [mesh,first]of [[bear,true],[guest,false]]){
   const vertices=mesh.geometry.attributes.position;
   for(let i=0;i<vertices.count;i++){const vertex=new mesh.position.constructor().fromBufferAttribute(vertices,i);mesh.localToWorld(vertex);const projection=vertex.dot(axis);if(first)maximumA=Math.max(maximumA,projection);else minimumB=Math.min(minimumB,projection);}
  }
  assert(minimumB-maximumA>.001,`bear and ${key} must retain real mesh clearance during the activity`);
 }
 if(idle)assert(minimum>.039,`bear and ${key} must retain a positive gap at the conversation stop`);
}
test('actual scene construction, read-only paused pose, mode switch, and cleanup succeed',async()=>{
 const old=new Map(['document','window','ResizeObserver','__invRenderer'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));let latest,latestCamera,renderers=[];const listeners=new Set();
 globalThis.document={createElement:tag=>new Element(tag)};globalThis.window={addEventListener:(k,f)=>listeners.add(f),removeEventListener:(k,f)=>listeners.delete(f)};globalThis.ResizeObserver=class{observe(){}disconnect(){}};
 globalThis.__invRenderer=class{constructor(){this.domElement=new Element('canvas');this.shadowMap={};renderers.push(this);}setPixelRatio(){}setSize(){}render(scene,camera){scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);latest=scene;latestCamera=camera;}dispose(){this.disposed=true;}};
 const root=new URL('../dist/challenge-test/',import.meta.url);
 const load=async(name,replacements={})=>{let s=await readFile(new URL(name,root),'utf8');s=s.replace(/from\s*(['"])([^'"]+)\1/g,(_,q,p)=>`from '${replacements[p]||new URL(p,new URL(name,root)).href}'`).replaceAll('new THREE.WebGLRenderer(','new globalThis.__invRenderer(');return`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;};
 const room=await load('invitation-room-scene.js'),garden=await load('invitation-garden-scene.js'),worldUrl=await load('invitation-world.js',{'./invitation-room-scene.js':room,'./invitation-garden-scene.js':garden});
 try{
  const {createInvitationWorld}=await import(worldUrl),host=new Element(),world=createInvitationWorld(host),card={level:9,mode:'card',phase:'playing',stage:'write',step:0,completed:[],targetText:'music',lockedPrefix:'musi',buffer:'musi',target:'C'};
  world.update(card);assert(latest.getObjectByName('real-editable-invitation-card'));assert(latest.getObjectByName('island-bear'));assert.equal(host.dataset.cardTarget,'music');assert.equal(host.dataset.cardBuffer,'musi');
  const folding={...card,phase:'acting',buffer:'music',action:{type:'fold',elapsed:.8,duration:1.6}};world.update(folding);near(latest.getObjectByName('folding-card-half').rotation.y,-sampleInvitationPose(folding).fold*Math.PI*.985);
  const saved=latest.getObjectByName('folding-card-half').rotation.y;world.update({...folding,paused:true,action:{...folding.action,elapsed:1.5}});near(latest.getObjectByName('folding-card-half').rotation.y,saved);
  // The bear occupies a separate, supported working position beside the slab.
  // Check the entire fold/pack sweep, not only the idle screenshot.
  for(let i=0;i<=120;i++){
   world.update({...folding,action:{...folding.action,elapsed:folding.action.duration*i/120}});
   const bear=latest.getObjectByName('island-bear'),head=latest.getObjectByName('bear-head'),paper=latest.getObjectByName('real-editable-invitation-card'),tabletop=latest.getObjectByName('invitation-writing-tabletop'),stool=latest.getObjectByName('invitation-bear-footstool-top');
   const headBox=new Box3().setFromObject(head),paperBox=new Box3().setFromObject(paper),tableBox=new Box3().setFromObject(tabletop),stoolBox=new Box3().setFromObject(stool);
   assert(!headBox.intersectsBox(paperBox),'the folding paper must never cross the head or muzzle');
   assert(!headBox.intersectsBox(tableBox),'the bear face must stay out of the tabletop');
   const body=bear.children[0];for(const mesh of body.children.filter(child=>child.isMesh))assert(!new Box3().setFromObject(mesh).intersectsBox(tableBox),'the torso must remain beside the table');
   for(const paw of body.children.filter(child=>child.name==='back-paw')){
    const foot=new Box3().setFromObject(paw.children[1]);near(foot.min.y,stoolBox.max.y,.003);assert(foot.min.x>=stoolBox.min.x&&foot.max.x<=stoolBox.max.x);assert(foot.min.z>=stoolBox.min.z&&foot.max.z<=stoolBox.max.z);
   }
   for(const paw of body.children.filter(child=>child.name==='front-paw'))assert(paw.userData.reachLength<1.15,'working paws stay within a compact reach');
  }

  world.update({...delivery('C',.5),targetText:'come and play',buffer:'come and play'});assert(renderers[0].disposed);assert(latest.getObjectByName('persistent-picnic-destination'));const p=sampleInvitationPose(delivery('C',.5));vectorNear(latest.getObjectByName('cottage-recipient-1').position.toArray(),p.friends.C.position);assert.equal(host.dataset.invited,'0');
  world.update({level:12,mode:'mail',phase:'complete',stage:'select',arrived:['C','X','Z'],completed:['C','X','Z']});for(let i=1;i<=3;i++)assert(latest.getObjectByName(`cottage-recipient-${i}`).visible);assert.equal(host.dataset.invited,'3');
  // Exercise real current-engine stages in the constructed scene, including
  // every chosen activity, rather than relying on isolated pose fixtures alone.
  for(const level of [11,12])for(const offset of (level===12?[0,1,2]:[0])){
   const state=create(level);world.update(state);
   for(let stage=0;stage<3;stage++){
    if(level===12){for(let i=1;i<=3;i++)assert(latest.getObjectByName(`cottage-recipient-${i}`).visible);assert.equal(host.dataset.invited,'3');assert.equal(press(state,['C','X','Z'][(stage+offset)%3]).status,'accepted');tick(state,100);world.update(state);}
    assert.equal(state.stage,'write');if(level===12){
     assertPicnicGuestClearance(latest,state.selected,true);
     const bearHead=latest.getObjectByName('bear-head'),guestHead=latest.getObjectByName(`cottage-recipient-${INVITATION_FRIENDS[state.selected].index+1}`).children[1];
     const bearPoint=new bearHead.position.constructor(),guestPoint=new guestHead.position.constructor();bearHead.getWorldPosition(bearPoint);guestHead.getWorldPosition(guestPoint);bearPoint.project(latestCamera);guestPoint.project(latestCamera);
     assert(Math.abs(bearPoint.x-guestPoint.x)>.04,`${state.selected}: the fixed camera must show separate face centers, not one directly behind the other`);
    }
    while(!state.action){assert(state.target);assert.equal(press(state,state.target).status,'accepted');world.update(state);}
    for(const p of [0,.15,.5,.8,1]){
     world.update({...state,action:{...state.action,elapsed:state.action.duration*p}});
     latest.traverse(node=>{for(const value of [...node.position.toArray(),...node.scale.toArray(),...node.quaternion.toArray()])assert(Number.isFinite(value),node.name);});
     if(level===12)assertPicnicGuestClearance(latest,state.selected);
     if(level===12&&stage>0){
      assert(latest.getObjectByName(`picnic-activity-${state.activity.id}-${state.selected}`).visible);
      if(p>0&&p<1){const frame={...state,action:{...state.action,elapsed:state.action.duration*p}},prop=sampleInvitationPose(frame).activityProps.find(prop=>prop.pending),paw=latest.getObjectByName(`bear-leg-${state.selected==='Z'?3:1}`).children[1],point=new paw.position.constructor();paw.getWorldPosition(point);assert(Math.hypot(point.x-prop.position[0],point.y-prop.position[1]-.13,point.z-prop.position[2])<.035,'the nearby paw reaches the activity prop after the diagonal stance change');}
     }
    }
    tick(state,100);world.update(state);
    if(level===11){assert(latest.getObjectByName('shared-three-part-invitation-board').visible);assert.equal(host.dataset.invited,stage===2?'3':'0');for(const [key,f]of Object.entries(INVITATION_FRIENDS))vectorNear(latest.getObjectByName(`cottage-recipient-${f.index+1}`).position.toArray(),stage===2?f.seat:f.home);}
    if(level===12){assert.equal(host.dataset.invited,'3');for(const entry of state.activityHistory.filter(entry=>entry.activity!=='greet'))assert(latest.getObjectByName(`picnic-activity-${entry.activity}-${entry.friend}`).visible);}
    if(stage<2){assert(advanceStage(state));world.update(state);}
   }
  }
  world.destroy();assert.equal(host.children.length,0);assert.equal(listeners.size,0);assert(renderers.every(r=>r.disposed));
 }finally{for(const[k,v]of old){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}
});
