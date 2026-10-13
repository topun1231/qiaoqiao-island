import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../dist/vendor/three.module.js';
import { create, createV3, press, tick } from '../dist/challenge-test/engine.js';
import { forestCodeLabel, forestMotionSample } from '../dist/challenge-test/forest-world.js';
import { pairingCodeLabel, samplePairingPose, layoutPairingLabels } from '../dist/challenge-test/pairing-world.js';
import { getOrchardPlan, orchardVisibleKeys, orchardSequenceLabels, orchardFruitSpecies } from '../dist/challenge-test/orchard-world.js';

class Element {
  constructor(tag='div'){this.tagName=tag;this.style={};this.dataset={};this.children=[];this.attributes={};this.classList={add(){}};this.clientWidth=1184;this.clientHeight=606;this.offsetWidth=172;this.offsetHeight=58;this.textContent='';}
  appendChild(node){node.parentNode=this;this.children.push(node);return node;}
  append(...nodes){nodes.forEach(node=>this.appendChild(node));}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  setAttribute(key,value){this.attributes[key]=value;}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);}
  getContext(){return new Proxy({},{get:(o,k)=>o[k]??(()=>{}),set:(o,k,v)=>(o[k]=v,true)});}
}
const globals=['document','window','ResizeObserver','getComputedStyle','__mixedRenderer'];
const saved=new Map(globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
const worlds=[],renderers=[],listeners=new Set();let latest;
globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};
globalThis.window={addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn)};
globalThis.ResizeObserver=class{observe(){}disconnect(){}};
globalThis.getComputedStyle=()=>({position:'relative'});
globalThis.__mixedRenderer=class{
  constructor(){this.domElement=new Element('canvas');this.shadowMap={};renderers.push(this);}
  setPixelRatio(){}setSize(){}dispose(){this.disposed=true;}
  render(scene,camera){scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);latest={scene,camera};}
};
const base=new URL('../dist/challenge-test/',import.meta.url);
async function load(name,replacements={}){
  let source=await readFile(new URL(name,base),'utf8');
  source=source.replace(/from\s*(['"])([^'"]+)\1/g,(_,q,path)=>`from '${replacements[path]||new URL(path,new URL(name,base)).href}'`).replaceAll('new THREE.WebGLRenderer(','new globalThis.__mixedRenderer(');
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}
const island=await load('cozy-island.js'),room=await load('pairing-room-scene.js');
const {createForestWorld}=await import(await load('forest-world.js'));
const {createPairingWorld}=await import(await load('pairing-world.js',{'./pairing-room-scene.js':room}));
const {createOrchardWorld}=await import(await load('orchard-world.js',{'./cozy-island.js':island}));
const object=name=>latest.scene.getObjectByName(name);
function scene(factory,width=1184,height=606){const host=new Element();host.clientWidth=width;host.clientHeight=height;const world=factory(host);worlds.push(world);return{world,host};}
function find(node,predicate){return predicate(node)?node:node.children?.map(child=>find(child,predicate)).find(Boolean);}
function bounds(label){
  const vertices=label.geometry.getAttribute('position'),points=Array.from({length:vertices.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(label.matrixWorld).project(latest.camera));
  return{left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),bottom:Math.min(...points.map(p=>p.y)),top:Math.max(...points.map(p=>p.y))};
}
const disjoint=(a,b)=>a.right<b.left||b.right<a.left||a.top<b.bottom||b.top<a.bottom;
const complete=state=>{while(state.action)tick(state,state.action.duration-state.action.elapsed);};

test('level 2 basket keycaps match selection keys and disappear when filling starts',()=>{
 const {world}=scene(createOrchardWorld),state=create(2,2,314);world.update(state);
 for(const [i,key] of ['F','J'].entries()){
  assert.equal(object(`orchard-order-keycap-${i}`).userData.text,key);
  assert.equal(object(`orchard-order-keycap-${i}`).visible,true);
  assert.match(object(`orchard-order-select-${i}`).userData.text,new RegExp(`按 ${key} 选择`));
 }
 press(state,'J');world.update(state);
 assert.equal(object('orchard-order-keycap-0').visible,false);
 assert.equal(object('orchard-order-keycap-1').visible,false);
 world.destroy();
});
function enter(state,code){let result;for(const key of code)result=press(state,key);return result;}

test('v4 forest codes retain full targets and entered prefixes without changing physical routes',()=>{
  for(const level of[5,6])for(const stage of[0,1,2]){
    const state=create(level,stage,42),choice=state.choices.find(choice=>!choice.done),raw=level===5?state.task.branches.find(branch=>branch.key===choice.key):state.tasks.find(task=>task.key===choice.key);
    assert.equal(forestCodeLabel(state,raw).code,choice.code);assert(choice.code.length>=2&&choice.code.length<=4);
    press(state,choice.code[0]);const display=forestCodeLabel(state,raw);assert.equal(display.code,choice.code);assert.equal(display.typed,choice.code[0]);assert.equal(display.cursor,1);assert.equal(state.action,null);
    const v3=createV3(level,stage);assert.equal(forestCodeLabel(v3,{key:'F',code:'ABCD'}).code,'F');
  }
  const state=create(5,0,42),choice=state.choices.find(choice=>choice.key===state.task.correct);enter(state,choice.code);
  const v3=createV3(5);press(v3,v3.task.correct);
  for(const progress of[0,.2,.5,.9,1])assert.deepEqual(forestMotionSample(state,progress).point,forestMotionSample(v3,progress).point);
});

test('actual forest boards display complete 2–4 letter codes with prefix marks at narrow and wide sizes',()=>{
  for(const width of[500,1184])for(const level of[5,6])for(const stage of[0,1,2]){
    const{world}=scene(createForestWorld,width);const state=create(level,stage,18);world.update(state);
    const panels=[];object('current-junction-signposts').traverse(node=>{if(node.name==='active-forest-key-panel'&&node.parent.visible)panels.push(node);});
    assert.equal(panels.length,2);
    for(const panel of panels){assert(state.choices.some(choice=>choice.code===panel.userData.code));const b=bounds(panel);assert(b.left>=-.97&&b.right<=.97&&b.bottom>=-.97&&b.top<=.97,`forest board clipped at ${width}`);}
    assert(disjoint(...panels.map(bounds)));
    const choice=state.choices.find(choice=>!choice.done);press(state,choice.code[0]);const before=JSON.stringify(state);world.update(state);assert.equal(JSON.stringify(state),before);
    assert.equal(panels.find(panel=>panel.userData.code===choice.code).userData.typed,choice.code[0]);
    assert(panels.every(panel=>panel.userData.code.length>=2));world.destroy();
  }
});

test('room codes use item-specific destination targets, preserve prefixes, and keep four movable objects',()=>{
  for(const width of[500,1184]){
    const{world,host}=scene(createPairingWorld,width),state=create(8,1,42);world.update(state);
    const item=state.items.find(item=>state.placements[item.key]!==item.goalZone),first=pairingCodeLabel(state,item.key);
    assert.equal(first.code,item.code);press(state,item.code[0]);world.update(state);
    assert.equal(pairingCodeLabel(state,item.key).typed,item.code[0]);
    const label=find(host,node=>node.dataset?.key===item.key),cap=find(label,node=>node.tagName==='kbd');
    assert.equal(cap.dataset.code,item.code);assert.equal(cap.dataset.typed,item.code[0]);assert.equal(cap.children.map(child=>child.textContent).join(''),item.code);
    enter(state,item.code.slice(1));complete(state);world.update(state);assert.equal(state.held,item.key);
    for(const zone of state.zones){assert.equal(pairingCodeLabel(state,zone.key).code,zone.codesByItem[item.key]);const target=find(host,node=>node.dataset?.key===zone.key);assert.equal(find(target,node=>node.tagName==='kbd').dataset.code,zone.codesByItem[item.key]);}
    const visible=[];latest.scene.traverse(node=>{if(node.name.startsWith('pairing-movable-')&&node.visible)visible.push(node);});assert.equal(visible.length,4);
    const before=JSON.stringify(state);world.update(state);assert.equal(JSON.stringify(state),before);world.destroy();
  }
  const v3=createV3(8);assert.equal(pairingCodeLabel(v3,'F').code,'F');
});

test('six long room labels stay separated inside 500px without changing ground-nook placements',()=>{
  const entries=Array.from({length:6},(_,i)=>({key:String(i),x:210+(i%2)*40,y:260+Math.floor(i/2)*20,width:188,height:65,destination:i>3}));
  const layout=layoutPairingLabels(entries,500,606);
  for(const entry of layout){assert(entry.rect.left>=0&&entry.rect.right<=500);assert(entry.rect.top>=0&&entry.rect.bottom<=606);}
  for(let i=0;i<layout.length;i++)for(let j=i+1;j<layout.length;j++)assert(disjoint(layout[i].rect,layout[j].rect),'long code labels overlap');
  const state=create(8,1,42),v3=createV3(8,1);assert.deepEqual(samplePairingPose(state).objects,samplePairingPose(v3).objects);
});

test('orchard expands to four/six keys but keeps full four-key chunks and at most three fruit choices',()=>{
  for(const level of[1,2])for(const stage of[0,1,2]){
    const state=create(level,stage,42),plan=getOrchardPlan(state);assert.equal(plan.keys.length,level===1?4:6);assert.equal(plan.total,state.tasks.length);
    assert(orchardVisibleKeys(state).length<=3);
    if(state.catchStyle!=='orders'){const labels=orchardSequenceLabels(state);assert.equal(labels.length,4);assert.equal(labels.filter(label=>label.current).length,stage===0?1:0);state.step=2;const entered=orchardSequenceLabels(state);assert.equal(entered.filter(label=>label.done).length,2);assert.equal(entered.map(label=>label.key).join(''),labels.map(label=>label.key).join(''));if(stage===1){state.hintRequested=true;assert.equal(orchardSequenceLabels(state).filter(label=>label.current).length,1);}}
  }
  assert.equal(new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(orchardFruitSpecies)).size,2);
});

test('actual mixed orchard keeps full targets in frame and never marks the next letter after warmup',()=>{
  for(const[width,height]of[[500,606],[1184,606],[1800,400]]){
    const{world}=scene(createOrchardWorld,width,height);
    for(const level of[1,2])for(const stage of[1,2]){
      const state=create(level,stage,42);world.update(state);if(state.stage==='select'){assert.equal(object('orchard-sequence-preview').visible,false);press(state,state.choices.find(choice=>!choice.done).key);complete(state);world.update(state);}const before=JSON.stringify(state);world.update(state,50);assert.equal(JSON.stringify(state),before);
      const root=object('preview-orchard'),visible=root.userData.visibleKeys;assert(visible.length<=3);assert(root.userData.fruitKeys.length<=6);
      let live=0;latest.scene.traverse(node=>{if(/^fruit-key-/.test(node.name)&&node.parent.visible){live++;assert.equal(node.userData.style,'label');const box=bounds(node);assert(box.left>-.98&&box.right<.98&&box.bottom>-.98&&box.top<.98,`${node.name} clipped at ${width}`);}});assert(live<=3);
      const heading=bounds(object('orchard-task-heading'));assert(heading.top<.98,`heading clipped at ${width}`);
      if(state.catchStyle!=='orders'){
        const labels=Array.from({length:4},(_,i)=>object(`orchard-sequence-key-${i}`));assert(labels.every(label=>label.visible&&label.userData.style==='label'&&!label.userData.current));
        for(const label of labels){const box=bounds(label);assert(box.left>-.98&&box.right<.98&&box.bottom>-.98&&box.top<.98);assert(disjoint(box,bounds(object('fruit-key-'+state.target))),`chunk overlaps live fruit at ${width}`);}
        press(state,state.target);tick(state,state.action.duration*.4);world.update(state);assert.deepEqual(labels.map(label=>label.userData.text),state.tasks.slice(0,4).map(task=>task.key));
      }else{
        const quantities=visible.map(key=>object('orchard-quantity-'+key));for(let i=0;i<quantities.length;i++)for(let j=i+1;j<quantities.length;j++)assert(disjoint(bounds(quantities[i]),bounds(quantities[j])),'fruit quantities overlap');
      }
      latest.scene.traverse(node=>{for(const value of[...node.position.toArray(),...node.scale.toArray(),...node.quaternion.toArray()])assert(Number.isFinite(value));});
    }
    world.destroy();
  }
});
after(()=>{worlds.forEach(world=>world.destroy());assert.equal(listeners.size,0);assert(renderers.every(renderer=>renderer.disposed));for(const[key,descriptor]of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
