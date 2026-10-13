import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../dist/vendor/three.module.js';
import {create,press,tick,advanceStage,snapshot,restore} from '../dist/challenge-test/engine-v3.js';
import {forestLayout,forestNodePosition,forestCurrentNode,forestActionRoute,forestMotionSample,forestBranchSide,forestCameraFrame,forestProjectedLabel} from '../dist/challenge-test/forest-world.js';
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const finishAction=state=>{while(state.action)tick(state,state.action.duration-state.action.elapsed);};
const close=(a,b)=>assert.ok(distance(a,b)<1e-7,`${a} != ${b}`);

test('all twelve forest choices advance through distinct joined physical junctions without stage resets',()=>{
 const state=create(5),visited=[];
 for(let stage=0;stage<3;stage++){
  for(let step=0;step<4;step++){
   const from=forestNodePosition(state.nodeId),task=state.task;visited.push(from);
   for(const b of task.branches){const side=forestBranchSide(state,b.key);assert.equal(side,task.branches.indexOf(b)?1:-1);}
   assert.equal(press(state,task.correct).status,'accepted');
   close(forestMotionSample(state,0).point,from);close(forestMotionSample(state,1).point,forestNodePosition(state.action.to));
   const to=forestMotionSample(state,1).point;assert(distance(from,to)>4);
   finishAction(state);close(forestMotionSample(state).point,to);
  }
  const checkpoint=forestNodePosition(state.nodeId);
  if(stage<2){advanceStage(state);close(forestNodePosition(state.nodeId),checkpoint);}
 }
 assert.equal(new Set(visited.map(p=>p.join(','))).size,12);assert.equal(state.solved,true);assert(distance(visited[0],forestNodePosition(state.nodeId))>48);
});

test('wrong forest routes only return to their current junction; pause and restore keep the exact grounded position',()=>{
 const state=create(5);for(let i=0;i<2;i++){press(state,state.task.correct);finishAction(state);}
 const before=structuredClone(state),wrong=state.task.branches.find(b=>b.key!==state.task.correct);
 assert.equal(press(state,wrong.key).status,'wrong');assert.equal(state.action.type,'detour');
 const route=forestActionRoute(state);close(route.points[0],forestNodePosition(before.nodeId));close(route.points.at(-1),forestNodePosition(before.nodeId));
 close(forestMotionSample(state,.49).point,forestNodePosition(wrong.nodeTo));
 tick(state,state.action.duration*.62);const pose=forestMotionSample(state);state.paused=true;tick(state,50);close(forestMotionSample(state).point,pose.point);
 const restored=restore(snapshot(state));assert.ok(restored);close(forestMotionSample(restored).point,pose.point);
 state.paused=false;finishAction(state);assert.equal(state.nodeId,before.nodeId);assert.deepEqual(state.completed,before.completed);assert.deepEqual(state.traversedNodes,before.traversedNodes);
});

test('every errands action is a real connected graph edge and both source orders keep the full basket',()=>{
 for(const first of['T','Y'])for(const returnKey of['T','Y']){
  const state=create(6);
  for(let stage=0;stage<3;stage++){
   const layout=forestLayout(state),keys=stage===0?first:stage===1?(first==='T'?'Y':'T'):returnKey;
   assert.equal(press(state,keys).status,'accepted');
   while(state.action||!state.stageReady&&!state.solved){
    if(!state.action)press(state,state.task.correct);
    const a=state.action;assert(layout.edges.some(e=>[e.from,e.to].includes(a.from)&&[e.from,e.to].includes(a.to)),`${a.from} -> ${a.to}`);
    close(forestMotionSample(state,0).point,forestNodePosition(a.from));close(forestMotionSample(state,1).point,forestNodePosition(a.to));
    if(stage===2)assert(forestNodePosition(a.to)[2]<forestNodePosition(a.from)[2],'every return step must get closer to the friend, without revisiting a source');
    finishAction(state);
   }
   assert.equal(state.inventory.length,Math.min(2,stage+1));const at=forestNodePosition(state.nodeId);
   if(stage<2){advanceStage(state);close(forestNodePosition(state.nodeId),at);}
  }
  assert.equal(state.nodeId,'friend');assert.deepEqual(state.inventory,[first,first==='T'?'Y':'T']);
 }
});

test('reverse travel follows the very same ribbon rather than cutting across scenery',()=>{
 const state=create(6),a=forestActionRoute({...state,action:{from:'t-end',to:'y-start',type:'visit'}}),b=forestActionRoute({...state,action:{from:'y-start',to:'t-end',type:'visit'}});
 assert.equal(a.points.length,b.points.length);for(let i=0;i<a.points.length;i++)close(a.points[i],b.points.at(-1-i));
});

test('camera and projected branch labels are finite and locally readable on wide and narrow viewports',()=>{
 for(const[width,height]of[[1184,606],[588,690],[390,640]])for(let stage=0;stage<3;stage++){
  const state=create(5,stage);
  for(let i=0;i<4;i++){
   const point=forestNodePosition(state.task.nodeFrom),focus=[point[0]*.78,0,point[2]-1.9],frame=forestCameraFrame(width,height,focus),camera=new THREE.OrthographicCamera(frame.left,frame.right,frame.top,frame.bottom,.1,100);
   camera.position.set(...frame.position);camera.lookAt(...frame.target);camera.updateProjectionMatrix();camera.updateMatrixWorld();
   assert(frame.right-frame.left<=18.2,'local camera must not zoom out to fit the whole forest');
   for(const branch of state.task.branches){const p=forestNodePosition(branch.nodeTo),label=forestProjectedLabel([p[0],.33,p[2]+.85],camera,width,height,110,36);assert(label.visible);assert(label.x>=63&&label.x<=width-63);assert(label.y>=44&&label.y<=height-8);}
   press(state,state.task.correct);finishAction(state);
  }
 }
});

class Element{
 constructor(tag='div'){this.tagName=tag;this.style={};this.dataset={};this.children=[];this.attributes={};this.clientWidth=1184;this.clientHeight=606;this.offsetWidth=125;this.offsetHeight=42;}
 appendChild(node){node.parentNode=this;this.children.push(node);return node;}
 setAttribute(key,value){this.attributes[key]=value;}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);}
 getContext(){return new Proxy({},{get:(o,k)=>o[k]??(()=>{}),set:(o,k,v)=>(o[k]=v,true)});}
}
test('actual connected scene keeps old footprints, live inventory and valid geometry after movement, checkpoints and resize',async()=>{
 const names=['document','ResizeObserver','getComputedStyle','__forestRenderer'],old=new Map(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));let latest,camera,resize;
 globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};globalThis.getComputedStyle=()=>({position:'relative'});globalThis.ResizeObserver=class{constructor(fn){resize=fn;}observe(){}disconnect(){}};
 globalThis.__forestRenderer=class{constructor(){this.domElement=new Element('canvas');this.shadowMap={};}setPixelRatio(){}setSize(){}render(s,c){latest=s;camera=c;s.updateMatrixWorld(true);}dispose(){}};
 let world;
 try{
  let source=await readFile(new URL('../dist/challenge-test/forest-world.js',import.meta.url),'utf8');source=source.replace(/from\s*(['"])([^'"]+)\1/g,(_,q,path)=>`from '${new URL(path,new URL('../dist/challenge-test/forest-world.js',import.meta.url)).href}'`).replaceAll('new THREE.WebGLRenderer(','new globalThis.__forestRenderer(');
  const {createForestWorld}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`),host=new Element();world=createForestWorld(host);const state=create(5);world.update(state,.016);
  const first=forestNodePosition(state.nodeId),startCamera=camera.position.clone();
  for(let i=0;i<4;i++){press(state,state.task.correct);for(let t=0;t<30;t++){tick(state,.04);world.update(state,.04);}finishAction(state);world.update(state,.04);}
  const previousTrail=latest.getObjectByName('walked-trail-s0-n0~s0-n1');assert(previousTrail?.visible);assert.equal(latest.getObjectByName('rabbit-beside-red-mushroom').visible,false);
  assert(camera.position.distanceTo(startCamera)>10);assert(latest.getObjectByName('bear-considering-the-fork').position.distanceTo(new THREE.Vector3(...first))>16);
  advanceStage(state);world.update(state,.016);assert(latest.getObjectByName('walked-trail-s0-n0~s0-n1')?.visible,'earlier section remains walked after checkpoint');
  for(const width of[588,390,1184]){host.clientWidth=width;resize();world.update(state,.016);for(const el of host.children.flatMap(x=>x.children||[])){if(el.style.left)assert(Number.isFinite(parseFloat(el.style.left)));}}
  latest.traverse(o=>{for(const value of[...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()])assert(Number.isFinite(value));const attr=o.geometry?.getAttribute('position');if(attr)for(const value of attr.array)assert(Number.isFinite(value));});
  // Every active board stays in front of the current landmark, at a readable
  // screen size. Check all twelve forks against the actual merged geometry.
  for(let chapter=0;chapter<3;chapter++){
   world.destroy();world=createForestWorld(host);const walk=create(5,chapter);
   for(let fork=0;fork<4;fork++){
    world.update(walk,.04);for(let settle=0;settle<25;settle++)world.update(walk,.04);
    latest.traverse(object=>{if(!object.userData.solidBounds)return;assert(object.userData.routeMargin>=.04,`${object.name} only clears the route by ${object.userData.routeMargin}`);});

    for(const viewWidth of[1184,588,390]){
     host.clientWidth=viewWidth;resize();world.update(walk,.04);const root=latest.getObjectByName('connected-forest-landscape');
     latest.getObjectByName('current-junction-signposts').traverse(panel=>{
      if(panel.name!=='active-forest-key-panel'||!panel.parent.visible)return;
      assert.equal(panel.material.depthTest,false,'the current key cannot disappear behind an old canopy');assert(panel.renderOrder>=1000);
      const center=panel.getWorldPosition(new THREE.Vector3()),a=panel.localToWorld(new THREE.Vector3(-.515,0,0)).project(camera),b=panel.localToWorld(new THREE.Vector3(.515,0,0)).project(camera);
      assert((b.x-a.x)*host.clientWidth/2>=51.9,'letter board must remain readable at phone widths');
      for(const [x,y]of[[0,0],[-.27,.10],[.27,.10],[-.27,.27],[.27,.27]]){
       const target=panel.localToWorld(new THREE.Vector3(x,y,0)),vector=target.sub(camera.position),ray=new THREE.Raycaster(camera.position,vector.clone().normalize(),.1,vector.length()-.02),hits=ray.intersectObject(root,true);
       assert.equal(hits.length,0,`chapter ${chapter} fork ${fork} width ${viewWidth} panel ${center.toArray()} letter ${x},${y}: ${hits.map(h=>h.object.material.color.getHexString()+':'+h.point.toArray().join(',')).join(';')}`);
      }
     });
    }
    if(chapter===2){
     const good=walk.task.branches.find(b=>b.key===walk.task.correct),bad=walk.task.branches.find(b=>b.key!==walk.task.correct),goodRoot=latest.getObjectByName(`forest-landmark-${good.nodeTo}-${good.feature}`),badRoot=latest.getObjectByName(`forest-landmark-${bad.nodeTo}-${bad.feature}`);
     assert.equal(goodRoot.userData.featureFamily,badRoot.userData.featureFamily);assert.equal(goodRoot.userData.traitPresent,true);assert.equal(badRoot.userData.traitPresent,false);
     if(fork<3){const name=['stump','ribbon','footprints'][fork];assert(latest.getObjectByName(`forest-trait-${good.nodeTo}-${name}`)?.children.length>0);assert.equal(latest.getObjectByName(`forest-trait-${bad.nodeTo}-${name}`),undefined);}
     else{assert.equal(goodRoot.getObjectByName('forest-lit-window').material.emissiveIntensity,1);assert.equal(badRoot.getObjectByName('forest-dark-window').material.emissiveIntensity,0);}
    }
    press(walk,walk.task.correct);finishAction(walk);
   }
  }
  world.destroy();world=createForestWorld(host);const supplies=create(6);
  for(let stage=0;stage<3;stage++){
   const key=stage===1?'Y':'T';press(supplies,key);
   while(supplies.action||!supplies.stageReady&&!supplies.solved){if(!supplies.action)press(supplies,supplies.task.correct);tick(supplies,100);world.update(supplies,.04);}
   latest.traverse(object=>{if(object.userData.solidBounds)assert(object.userData.routeMargin>=.04,`${object.name} only clears the route by ${object.userData.routeMargin}`);});
   const basket=latest.getObjectByName('persistent-picnic-basket');assert(basket.visible);assert.equal(basket.parent.name,'bear-considering-the-fork');assert(latest.getObjectByName('basket-honey').visible);assert.equal(latest.getObjectByName('basket-juice').visible,stage>0);
   if(stage<2){const previous=latest.getObjectByName('bear-considering-the-fork').position.clone();advanceStage(supplies);world.update(supplies,.016);assert(previous.distanceTo(latest.getObjectByName('bear-considering-the-fork').position)<1e-7);}
  }
  // Both destination orders and both return choices retain two separate,
  // readable scene signs at every selection and clue junction.
  for(const first of['T','Y'])for(const back of['T','Y']){
   world.destroy();world=createForestWorld(host);const trip=create(6);
   for(let chapter=0;chapter<3;chapter++){
    while(!trip.stageReady&&!trip.solved){
     world.update(trip,.04);for(let settle=0;settle<25;settle++)world.update(trip,.04);
     for(const viewWidth of[1184,588,390]){
      host.clientWidth=viewWidth;resize();world.update(trip,.04);const boards=latest.getObjectByName('current-junction-signposts').children.filter(g=>g.visible),root=latest.getObjectByName('connected-forest-landscape');assert.equal(boards.length,2);
      const overlay=host.children.find(child=>child.children.some(label=>label.className?.includes('forest-world-basket'))),basketTag=overlay.children.find(label=>label.className?.includes('forest-world-basket')),placeTag=overlay.children.find(label=>label.className?.includes('forest-world-location'));assert(Math.abs(parseFloat(basketTag.style.left)-parseFloat(placeTag.style.left))<.01,'basket caption stays under the bear instead of beside a key');assert(parseFloat(basketTag.style.top)-basketTag.offsetHeight>=parseFloat(placeTag.style.top)+6,'basket contents stack below the current-place caption');
      assert(boards[0].position.distanceTo(boards[1].position)>2.5,'T and Y must not share a world position when both destinations lie on the same side');
      const centers=boards.map(g=>g.getObjectByName('active-forest-key-panel').getWorldPosition(new THREE.Vector3()).project(camera));assert(centers[1].x-centers[0].x>.14);for(const center of centers)assert(Math.abs(center.x)<.93&&Math.abs(center.y)<.9);
      for(const board of boards){const panel=board.getObjectByName('active-forest-key-panel');for(const[x,y]of[[0,0],[-.27,.1],[.27,.1]]){const target=panel.localToWorld(new THREE.Vector3(x,y,0)),delta=target.clone().sub(camera.position),ray=new THREE.Raycaster(camera.position,delta.clone().normalize(),.1,delta.length()-.02);assert.equal(ray.intersectObject(root,true).length,0,`${first}/${back} stage ${chapter} ${trip.nodeId} width ${viewWidth} sign ${board.position.toArray()}: ${ray.intersectObject(root,true).map(h=>h.object.material.color.getHexString()+':'+h.point.toArray().join(',')).join(';')}`);assert.equal(ray.intersectObject(latest.getObjectByName('bear-considering-the-fork'),true).length,0,'bear must not cover the current letter');}}
     }
     const key=trip.stage==='select'?(chapter===0?first:chapter===1?(first==='T'?'Y':'T'):back):trip.task.correct;press(trip,key);finishAction(trip);
    }
    world.update(trip,.04);if(chapter<2)advanceStage(trip);
   }
   const bear=latest.getObjectByName('bear-considering-the-fork'),friend=latest.getObjectByName('rabbit-beside-red-mushroom');assert(Math.hypot(bear.position.x-friend.position.x,bear.position.z-friend.position.z)>1.65,'arrival leaves separate bear and rabbit standing space');
  }
  world.destroy();world=null;assert.equal(host.children.length,0);
 }finally{world?.destroy();for(const[key,value]of old)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
});
