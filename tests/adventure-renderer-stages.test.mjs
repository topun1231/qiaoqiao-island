import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { create, press, tick } from '../dist/game/engine-v3.js';

class Element {
  constructor(tag='div') { this.tagName=tag; this.style={}; this.dataset={}; this.children=[]; this.attributes={}; this.classList={add:()=>{}}; this.clientWidth=1184; this.clientHeight=606; this.offsetWidth=100; this.offsetHeight=54; }
  appendChild(node) { node.parentNode=this; this.children.push(node); return node; }
  append(...nodes) { nodes.forEach(node=>this.appendChild(node)); }
  replaceChildren(...nodes) { this.children=[]; this.append(...nodes); }
  insertBefore(node,before) { this.children=this.children.filter(child=>child!==node); const index=this.children.indexOf(before); this.children.splice(index<0?this.children.length:index,0,node); node.parentNode=this; return node; }
  setAttribute(key,value) { this.attributes[key]=value; }
  remove() { if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this); }
  getContext() { return new Proxy({},{get:(object,key)=>object[key]??(()=>{}),set:(object,key,value)=>(object[key]=value,true)}); }
}
const find=(node,predicate)=>predicate(node)?node:node.children?.map(child=>find(child,predicate)).find(Boolean);
const finiteScene=scene=>scene.traverse(node=>{for(const number of [...node.position.toArray(),...node.quaternion.toArray(),...node.scale.toArray()])assert(Number.isFinite(number),node.name||node.type);});

test('actual room and forest scenes render every bounded stage and action without stale props or invalid poses',async()=>{
 const globals=['document','window','ResizeObserver','getComputedStyle','__stageRenderer'];
 const old=new Map(globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const listeners=new Set(),renderers=[];let latest;
 globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};
 globalThis.window={addEventListener:(_,handler)=>listeners.add(handler),removeEventListener:(_,handler)=>listeners.delete(handler)};
 globalThis.ResizeObserver=class {observe(){}disconnect(){}};
 globalThis.getComputedStyle=()=>({position:'relative'});
 globalThis.__stageRenderer=class {constructor(){this.domElement=new Element('canvas');this.shadowMap={};renderers.push(this);}setPixelRatio(){}setSize(){}render(scene,camera){scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);latest=scene;}dispose(){this.disposed=true;}};
 const base=new URL('../dist/game/',import.meta.url);
 async function load(name,replacements={}) {let source=await readFile(new URL(name,base),'utf8');source=source.replace(/from\s*(['"])([^'"]+)\1/g,(_,q,path)=>`from '${replacements[path]||new URL(path,new URL(name,base)).href}'`).replaceAll('new THREE.WebGLRenderer(','new globalThis.__stageRenderer(');return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;}
 try {
  const roomScene=await load('pairing-room-scene.js');
  const {createPairingWorld}=await import(await load('pairing-world.js',{'./pairing-room-scene.js':roomScene}));
  const {createForestWorld}=await import(await load('forest-world.js'));
  for(const level of [7,8]) {
   const host=new Element(),world=createPairingWorld(host);
   for(let round=0;round<3;round++) {
    const state=create(level,round);world.update(state);finiteScene(latest);
    for(const item of state.items)assert(latest.getObjectByName(`pairing-movable-${item.key}`).visible);
    if(round===2)for(const item of state.items){const label=find(host,node=>node.dataset?.key===item.key);assert(find(label,node=>node.className==='pairing-tagline').textContent.includes(item.goalZone));}
    let limit=30;
    while(!state.stageReady&&!state.solved&&limit--) {
     const item=state.held?state.items.find(item=>item.key===state.held):state.items.find(item=>item.goalZone?state.placements[item.key]!==item.goalZone:!state.placements[item.key]);
     const key=state.held?item.goalZone||state.zones.find(zone=>Object.values(state.placements).filter(key=>key===zone.key).length<zone.capacity).key:item.key;
     assert.equal(press(state,key).status,'accepted');
     for(const fraction of [.10,.30,.60]){tick(state,state.action.duration*fraction);world.update(state);finiteScene(latest);}
     tick(state,10);world.update(state);finiteScene(latest);
     if(state.held&&item.goalZone){const label=find(host,node=>node.dataset?.key===state.held);const tagline=find(label,node=>node.className==='pairing-tagline').textContent;assert(tagline.includes('已拿起'));assert(tagline.includes(item.goalZone));assert(tagline.includes(state.zones.find(zone=>zone.key===item.goalZone).label));}
    }
    assert(state.stageReady||state.solved);
   }
   world.destroy();assert.equal(host.children.length,0);
  }
  for(const level of [5,6]) {
   const host=new Element(),world=createForestWorld(host);
   for(let round=0;round<3;round++) {
    const state=create(level,round);world.update(state);finiteScene(latest);
    let limit=30;
    while(!state.stageReady&&!state.solved&&limit--) {
     const key=state.stage==='select'?state.choices.find(choice=>!choice.done).key:state.task.correct;
     assert.equal(press(state,key).status,'accepted');
     tick(state,state.action.duration*.55);world.update(state,.016);finiteScene(latest);
     tick(state,10);world.update(state,.016);finiteScene(latest);
    }
    assert(state.stageReady||state.solved);
    if(level===5)assert.equal(latest.getObjectByName('rabbit-beside-red-mushroom').visible,round===2,'the friend waits at the final clearing, not at intermediate route checkpoints');
   }
   world.destroy();assert.equal(host.children.length,0);
  }
  assert.equal(listeners.size,0);assert(renderers.every(renderer=>renderer.disposed));
 } finally {for(const[key,value]of old)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
});
