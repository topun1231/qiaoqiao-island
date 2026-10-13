import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../dist/vendor/three.module.js';
import { createJourneyGame } from '../dist/journey-game.js';

// Real meshes and transforms; DOM layout and GPU submission alone are mocked.
const names=['window','document','ResizeObserver','devicePixelRatio','requestAnimationFrame','__roomRenderer','__roomCreateScene'];
const originals=new Map(names.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
const listeners=new Map();let sceneWorld,rafCalls=0;
class Element {
  constructor(tag='div'){this.tagName=tag;this.children=[];this.style={};this.dataset={};this._text='';this.hidden=false;}
  appendChild(child){this.children.push(child);child.parentNode=this;return child;}
  removeChild(child){this.children.splice(this.children.indexOf(child),1);child.parentNode=null;return child;}
  remove(){this.parentNode?.removeChild(this);this.removed=true;}
  setAttribute(name,value){this[name]=value;}
  get firstChild(){return this.children[0]||null;}
  get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  set textContent(value){this._text=String(value);this.children=[];}
}
globalThis.document={createElement:tag=>new Element(tag)};
globalThis.window={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}};
globalThis.devicePixelRatio=1;
globalThis.requestAnimationFrame=()=>{rafCalls++;throw Error('The controller must own the only RAF');};
globalThis.__roomRenderer=class {
  constructor(){this.domElement=new Element('canvas');this.shadowMap={};}
  setPixelRatio(){} setSize(w,h){this.size=[w,h];}
  render(scene,camera){scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);this.calls=(this.calls||0)+1;}
  dispose(){this.disposed=(this.disposed||0)+1;}
};
const absoluteImports=(source,url)=>source.replace(/from\s*(['"])(\.\/[^'"]+)\1/g,(_,quote,path)=>`from '${new URL(path,url).href}'`);
const sceneURL=new URL('../dist/room-scene.js',import.meta.url);
const sceneSource=absoluteImports((await readFile(sceneURL,'utf8')).replace('new THREE.WebGLRenderer(','new globalThis.__roomRenderer('),sceneURL);
const {createRoomScene}=await import(`data:text/javascript;base64,${Buffer.from(sceneSource).toString('base64')}`);
globalThis.__roomCreateScene=container=>{sceneWorld=createRoomScene(container);return sceneWorld;};
const worldURL=new URL('../dist/room-world.js',import.meta.url);
const source=absoluteImports((await readFile(worldURL,'utf8')).replace("import { createRoomScene } from './room-scene.js';",'const createRoomScene = globalThis.__roomCreateScene;'),worldURL);
const {createRoomWorld,sampleRoomPose,ROOM_OBJECTS,ROOM_ORDER,ROOM_HOME,ROOM_TIMING}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const container=Object.assign(new Element(),{clientWidth:1188,clientHeight:761});
const world=createRoomWorld(container);
const state=(taskIndex=0,phase='playing',progress=0,levelId=10)=>({...createJourneyGame(levelId),taskIndex,phase,actionTime:progress*8,actionDuration:8,taskChar:phase==='acting'?ROOM_ORDER[Math.floor(taskIndex/2)]?.length||0:0});
const near=(a,b,message='not near',epsilon=1e-8)=>assert(Math.abs(a-b)<epsilon,`${message}: ${a}, ${b}`);
const vectorNear=(a,b,message)=>a.forEach((v,i)=>near(v,b[i],message));
const snapshot=()=>JSON.stringify([sceneWorld.bear.position,sceneWorld.bear.quaternion,sceneWorld.body.position,sceneWorld.body.quaternion,sceneWorld.head.quaternion,...sceneWorld.legs.map(leg=>[leg.position,leg.quaternion,leg.children.map(child=>[child.position,child.scale])]),...Object.values(sceneWorld.objects).map(object=>[object.position,object.quaternion,object.visible])]);
after(()=>{world.dispose();for(const [key,descriptor]of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});

test('approved room keeps real movable meshes, four paws, layout and camera',()=>{
  world.render(state());
  assert.equal(rafCalls,0);assert.equal(sceneWorld.legs.length,4);
  vectorNear(sceneWorld.bear.position.toArray(),ROOM_HOME);
  for(const name of['cozy-cutaway-room','wooden-bookshelf','cup-home-table','toy-basket','sunlit-window','sage-woven-rug'])assert(sceneWorld.scene.getObjectByName(name),name);
  for(const key of ROOM_ORDER){assert(sceneWorld.objects[key].children.length>=4);vectorNear(sceneWorld.objects[key].position.toArray(),ROOM_OBJECTS[key].source);}
  near(sceneWorld.camera.top,6.05);near(sceneWorld.camera.position.x,10.5);near(sceneWorld.camera.position.y,12.4);
  assert.equal(world.debug.labels.CUP.textContent,'先收拾这个CUP');
  assert.equal(world.debug.labels.BOOK.className,'room-object-label quiet');
});

test('all action endpoints preserve positions and return the bear without teleporting',()=>{
  for(let index=0;index<4;index++){
    const key=ROOM_ORDER[index],spec=ROOM_OBJECTS[key],start=sampleRoomPose(state(index*2,'acting',0));
    vectorNear(start.root,ROOM_HOME);vectorNear(start.objects[key].position,spec.source);
    const beforeLift=sampleRoomPose(state(index*2,'acting',ROOM_TIMING.grasp));vectorNear(beforeLift.objects[key].position,spec.source);
    const placed=sampleRoomPose(state(index*2,'acting',ROOM_TIMING.place));vectorNear(placed.objects[key].position,spec.destination);
    const end=sampleRoomPose(state(index*2,'acting',1));vectorNear(end.root,ROOM_HOME);vectorNear(end.objects[key].position,spec.destination);
    vectorNear(sampleRoomPose(state(index*2+1)).objects[key].position,end.objects[key].position);
    let previous=start;
    for(let step=1;step<=8000;step++){
      const pose=sampleRoomPose(state(index*2,'acting',step/8000));
      assert(new THREE.Vector3(...pose.root).distanceTo(new THREE.Vector3(...previous.root))<.03,`bear discontinuity ${key}: ${step}`);
      assert(new THREE.Vector3(...pose.objects[key].position).distanceTo(new THREE.Vector3(...previous.objects[key].position))<.035,`item discontinuity ${key}: ${step}`);
      assert(Math.abs(pose.gait)<=.12+1e-8);assert(pose.root[0]>-4.3&&pose.root[0]<4.6);assert(pose.root[2]>-2&&pose.root[2]<3);
      previous=pose;
    }
  }
});

test('completed objects remain single, visible, and in their real destinations',()=>{
  for(let i=0;i<4;i++){
    world.render(state(i*2+1));
    for(let done=0;done<=i;done++){
      const key=ROOM_ORDER[done],object=sceneWorld.objects[key];
      assert.equal(object.visible,true);assert.equal(object.userData.location,'destination');vectorNear(object.position.toArray(),ROOM_OBJECTS[key].destination);
      let count=0;sceneWorld.scene.traverse(value=>{if(value.name===`movable-${key}`)count++;});assert.equal(count,1);
    }
  }
  const book=new THREE.Box3().setFromObject(sceneWorld.objects.BOOK);
  assert(book.min.x>-3.1&&book.max.x<-2.2);assert(book.min.y>1.12&&book.max.y<1.40);assert(book.min.z>-3.5&&book.max.z<-2.3);
  const cup=new THREE.Box3().setFromObject(sceneWorld.objects.CUP);assert(cup.min.y>=1.747-1e-6);
  const ball=new THREE.Box3().setFromObject(sceneWorld.objects.BALL,true);assert(ball.max.y>.95&&ball.min.y>.5,JSON.stringify(ball));
});

test('typing target, explicit Space separator, and crossed-out Backspace extra stay next to objects',()=>{
  const first=state();first.taskChar=1;world.render(first);
  const letters=world.debug.labels.CUP.children[1].children;assert(letters[0].className.includes('accepted'));assert(letters[1].className.includes('current'));
  world.render(state(1));assert.match(world.debug.labels.CUP.textContent,/Space 空格分开两个单词/);assert.equal(world.debug.labels.BOOK.className,'room-object-label quiet');
  world.render(state(0,'playing',0,11));assert.match(world.debug.labels.CUP.textContent,/CUPP/);assert.match(world.debug.labels.CUP.textContent,/Backspace/);assert(world.debug.labels.CUP.children[1].children[3].className.includes('extra'));
  world.render(state(0,'acting',.45));assert.equal(world.debug.labels.CUP.hidden,true);assert.match(world.debug.homeLabel.textContent,/小熊正在放回桌上/);
});

test('carried items are held by real forepaws and lift before entering the table',()=>{
  const maxReach={};
  for(let index=0;index<4;index++)for(const t of[.25,.34,.43,.53,.60,.67,.74,.79]){
    world.render(state(index*2,'acting',t));
    const key=ROOM_ORDER[index];
    for(const i of[1,3]){const leg=sceneWorld.legs[i];assert(Number.isFinite(leg.userData.reachLength));maxReach[key]=Math.max(maxReach[key]||0,leg.userData.reachLength);assert(leg.userData.reachLength<1.85,`${key} overlong arm: ${leg.userData.reachLength}`);}
    const item=sceneWorld.objects[key];
    if(key==='CUP'&&t>=.60&&t<=.79)assert(item.position.y>=1.747-1e-7,'cup must be above the solid tabletop before placing');
  }
  assert(maxReach.BOOK>0);
});

test('every paused transform is deterministic, reloadable and independent of dt',()=>{
  const active=state(4,'acting',.58);world.render(active,.016);const expected=snapshot();
  world.render(state());world.render({...active,paused:true},10);assert.equal(snapshot(),expected);
  const paused={...active,paused:true};world.render(paused);for(let i=0;i<30;i++){paused.actionTime+=.03;world.render(paused,1);}assert.equal(snapshot(),expected);
  paused.actionTime=active.actionTime;paused.paused=false;world.render(paused,0);assert.equal(snapshot(),expected);
});

test('wide and narrow resize preserve the full room and projected labels',()=>{
  for(const [width,height]of[[1188,761],[700,800],[390,844]]){
    container.clientWidth=width;container.clientHeight=height;listeners.get('resize')();
    assert.deepEqual(sceneWorld.renderer.size,[width,height]);
    for(const label of Object.values(world.debug.labels)){const x=parseFloat(label.style.left),y=parseFloat(label.style.top);assert(x>=34&&x<=width-34);assert(y>=52&&y<=height-12);}
    for(const point of[[-5.2,0,-3.9],[5.2,0,4.0],[-5.2,4,-3.9],[5.2,4,-3.9]]){const ndc=new THREE.Vector3(...point).project(sceneWorld.camera);assert(Math.abs(ndc.x)<1&&Math.abs(ndc.y)<1,'room corner remains framed');}
  }
});

test('dispose releases all meshes, GPU resources, DOM labels and resize listener once',()=>{
  const {scene,renderer}=sceneWorld,resources=new Set();scene.traverse(object=>{if(object.geometry)resources.add(object.geometry);for(const m of Array.isArray(object.material)?object.material:object.material?[object.material]:[])resources.add(m);});
  const counts=new Map();resources.forEach(resource=>resource.addEventListener('dispose',()=>counts.set(resource,(counts.get(resource)||0)+1)));
  const calls=renderer.calls;world.dispose();world.dispose();world.render(state(),1);assert.equal(renderer.calls,calls);assert.equal(renderer.disposed,1);assert.equal(renderer.domElement.removed,true);assert.equal(scene.children.length,0);assert.equal(listeners.has('resize'),false);assert.equal(container.children.length,0);
  for(const resource of resources)assert.equal(counts.get(resource),1,`${resource.type} releases once`);assert.equal(rafCalls,0);
});
