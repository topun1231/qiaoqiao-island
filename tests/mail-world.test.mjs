import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../dist/vendor/three.module.js';

const originalGlobals = new Map(['document','window','devicePixelRatio','requestAnimationFrame','ResizeObserver','__mailRenderer'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
const listeners=new Map();let scene,camera,renderer,rafCount=0,observer;
class Element {
  constructor(tag='div'){this.tagName=tag;this.style={};this.dataset={};this.children=[];this.attributes={};}
  appendChild(child){child.parentNode=this;this.children.push(child);return child;}
  replaceChildren(...children){this.children=[];children.forEach(child=>this.appendChild(child));}
  setAttribute(key,value){this.attributes[key]=value;}
  remove(){this.removed=true;if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);}
}
globalThis.document={createElement:tag=>new Element(tag)};
globalThis.window={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}};
globalThis.devicePixelRatio=1;
globalThis.requestAnimationFrame=()=>{rafCount++;throw Error('Controller must own the only animation loop');};
globalThis.ResizeObserver=class {constructor(fn){this.callback=fn;observer=this;}observe(host){this.host=host;}disconnect(){this.disconnected=true;}};
globalThis.__mailRenderer=class {
  constructor(){this.domElement=new Element('canvas');this.shadowMap={};renderer=this;}
  setPixelRatio(){}setSize(w,h){this.size=[w,h];}
  render(s,c){scene=s;camera=c;s.updateMatrixWorld(true);c.updateMatrixWorld(true);this.calls=(this.calls||0)+1;}
  dispose(){this.disposed=(this.disposed||0)+1;}
};
const url=new URL('../dist/mail-world.js',import.meta.url);
const source=(await readFile(url,'utf8')).replace(/from\s*(['"])(\.\/[^'"]+)\1/g,(_,quote,path)=>`from '${new URL(path,url).href}'`).replace('new THREE.WebGLRenderer(','new globalThis.__mailRenderer(');
const {createMailWorld,sampleMailPose,MAIL_STOPS,MAILBOX_POSITIONS,MAIL_SENTENCES,MAIL_GROUND_Y,MAIL_ACTION_SECONDS}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const host=new Element();host.clientWidth=1196;host.clientHeight=762;
const world=createMailWorld(host);
const state=(taskIndex=0,phase='playing',actionTime=0,taskChar=0)=>({taskIndex,phase,actionTime,taskChar,paused:false});
const near=(a,b,message='not near',epsilon=1e-7)=>assert(Math.abs(a-b)<epsilon,`${message}: ${a} / ${b}`);
const vectorNear=(a,b,message)=>a.forEach((n,i)=>near(n,b[i],message));
const angularNear=(a,b)=>near(Math.atan2(Math.sin(a-b),Math.cos(a-b)),0);
const byClass=className=>host.children.find(e=>e.className==='mail-scene-labels').children.filter(e=>e.className===className);
const snapshot=()=>{const out=[];scene.traverse(o=>{if(o.name.startsWith('bear-')||o.name.includes('mailbox')||o.name==='visible-cream-envelope')out.push([o.name,o.position.toArray(),o.quaternion.toArray(),o.scale.toArray(),o.visible]);});return JSON.stringify(out);};

after(()=>{world.dispose();for(const[key,value]of originalGlobals){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}});

test('approved garden composition retains three cottages and independent animated props',()=>{
  world.render(state(0,'ready'));
  const cottages=[];scene.traverse(o=>{if(o.name==='garden-cottage')cottages.push(o);});
  assert.equal(cottages.length,3);assert.deepEqual(cottages.map(o=>[o.position.x,o.position.z]),[[-4.5,-.7],[4.75,-3.7],[-3.9,-7.8]]);
  const bear=scene.getObjectByName('bear-carrying-invitation');vectorNear(bear.position.toArray(),[-3.33,.0728,3.45]);near(bear.scale.x,.78);
  for(let i=1;i<=3;i++){const box=scene.getObjectByName(`recipient-mailbox-${i}`);assert(box.children.length>7);assert(box.getObjectByName('mailbox-door'));assert(box.getObjectByName('mailbox-flag'));}
  assert(bear.getObjectByName('bear-leg-0'));assert(scene.getObjectByName('visible-cream-envelope').children.length>4);
  near(camera.left,-10.3);near(camera.right,10.3);assert.equal(rafCount,0);
});

test('all four stationary paws are grounded at the actual sandy path surface',()=>{
  for(let index=0;index<=3;index++){
    world.render(state(index,index===3?'complete':'playing'));
    for(let i=0;i<4;i++){
      const leg=scene.getObjectByName(`bear-leg-${i}`),foot=leg.children[1],positions=foot.geometry.getAttribute('position');let lowest=Infinity;
      for(let j=0;j<positions.count;j++)lowest=Math.min(lowest,new THREE.Vector3().fromBufferAttribute(positions,j).applyMatrix4(foot.matrixWorld).y);
      near(lowest,MAIL_GROUND_Y,`paw ${i} at stop ${index}`);
    }
  }
});

test('every walk follows continuous real lane positions with small steps and stable endpoints',()=>{
  for(let index=0;index<3;index++){
    const first=sampleMailPose(state(index)),last=sampleMailPose(state(index+1,index===2?'complete':'playing'));
    vectorNear(sampleMailPose(state(index,'acting',0)).root,first.root);
    let previous=sampleMailPose(state(index,'acting',0));
    for(let t=0;t<=5000;t++){
      const pose=sampleMailPose(state(index,'acting',t/1000));
      assert(new THREE.Vector3(...pose.root).distanceTo(new THREE.Vector3(...previous.root))<.008,`no teleport at ${index}:${t}`);
      near(pose.root[1],.0728);assert(Math.abs(pose.gait)<=.12+1e-10);
      previous=pose;
    }
    vectorNear(previous.root,last.root);angularNear(previous.yaw,last.yaw);vectorNear(previous.root,MAIL_STOPS[index]);
    if(index<2){vectorNear(previous.envelope,last.envelope);near(previous.envelopeTilt,last.envelopeTilt);near(previous.envelopeScale,last.envelopeScale);}
  }
});

test('visible envelope is carried, lifted, inserted, then hidden only inside its mailbox',()=>{
  assert.equal(MAIL_ACTION_SECONDS,5);
  for(let i=0;i<3;i++){
    for(const t of[0,.5,2,3.05,3.3,3.55,3.8,3.92])assert.equal(sampleMailPose(state(i,'acting',t)).envelopeVisible,true,`visible before post at ${i}:${t}`);
    const carry=sampleMailPose(state(i,'acting',3.05)),lift=sampleMailPose(state(i,'acting',3.55)),post=sampleMailPose(state(i,'acting',3.93));
    assert(lift.envelope[1]-carry.envelope[1]>.5);near(lift.envelope[1],1.34);
    assert.equal(post.envelopeVisible,false);assert.equal(post.delivered,i+1);assert.equal(post.response,0);
    assert(Math.hypot(post.envelope[0]-MAILBOX_POSITIONS[i][0],post.envelope[2]-MAILBOX_POSITIONS[i][2])<.1);
    assert(post.mailboxDoor>.8);assert(sampleMailPose(state(i,'acting',4.35)).response>.9);
    assert.equal(sampleMailPose(state(i,'acting',5)).envelopeVisible,i<2);
  }
});

test('correct letters light progressively and every Space stays explicit in a compact two-line sentence',()=>{
  world.render(state(0,'playing',0,3));
  let panel=byClass('mail-world-sentence')[0],cells=panel.children[1].children;
  assert.equal(panel.dataset.sentence,'hi sam');assert.deepEqual(cells.map(c=>c.textContent),['H','I','␣','S','A','M']);
  assert.deepEqual(cells.map(c=>c.dataset.status),['done','done','done','current','future','future']);
  assert.equal(cells[2].attributes['aria-label'],'Space 空格');
  world.render(state(1,'playing',0,7));panel=byClass('mail-world-sentence')[0];cells=panel.children[1].children;
  assert.equal(cells.length,MAIL_SENTENCES[1].length);assert.equal(panel.children[1].style.gridTemplateColumns,'repeat(8, 31px)');
  assert(cells.filter(c=>c.dataset.character==='Space').length===3);
  assert.equal(cells[7].dataset.status,'current');
  world.render(state(1,'acting',.3,15));assert(cells.every(c=>c.dataset.status==='done'));
  host.clientWidth=360;host.clientHeight=760;world.resize();assert.equal(panel.children[1].style.gridTemplateColumns,'repeat(8, 31px)');
  assert(parseFloat(panel.style.left)>=90);host.clientWidth=1196;host.clientHeight=762;world.resize();
});

test('mailbox flags and three separate cottage responses survive completion',()=>{
  world.render(state(0,'ready'));
  assert.deepEqual(byClass('mailbox-world-number').map(e=>e.dataset.status),['current','future','future']);
  world.render(state(0,'acting',4.4,6));assert.equal(scene.getObjectByName('recipient-mailbox-1').userData.posted,true);assert.equal(scene.getObjectByName('cottage-recipient-1').visible,true);
  assert.equal(scene.getObjectByName('cottage-recipient-2').visible,false);
  world.render(state(3,'complete'));
  assert.equal(byClass('mail-world-sentence')[0].style.display,'none');assert.deepEqual(byClass('mailbox-world-number').map(e=>e.textContent),['✓','✓','✓']);
  assert(byClass('recipient-world-response').every(e=>e.style.display==='block'));
  for(let i=1;i<=3;i++){assert.equal(scene.getObjectByName(`cottage-recipient-${i}`).visible,true);near(scene.getObjectByName(`recipient-mailbox-${i}`).getObjectByName('mailbox-flag').rotation.x,0);}
  assert.equal(scene.getObjectByName('visible-cream-envelope').visible,false);
});

test('mid-walk and mid-post restoration is exact and paused poses never drift',()=>{
  for(const time of[1.27,3.31,3.81,4.65]){
    const active=state(1,'acting',time,15);world.render(active,.016);const original=snapshot();
    world.render(state(0,'ready'));const restored={...active,paused:true};world.render(restored);assert.equal(snapshot(),original);
    for(let i=0;i<12;i++){restored.actionTime+=.04;world.render(restored,.1);assert.equal(snapshot(),original);}
    restored.actionTime=time;restored.paused=false;world.render(restored);assert.equal(snapshot(),original);
  }
});

test('dispose releases every live resource once and removes listeners, observer, labels, and canvas',()=>{
  const resources=new Set();scene.traverse(o=>{if(o.geometry)resources.add(o.geometry);if(o.material)resources.add(o.material);});
  const counts=new Map();resources.forEach(resource=>resource.addEventListener('dispose',()=>counts.set(resource,(counts.get(resource)||0)+1)));
  const calls=renderer.calls;world.dispose();world.dispose();world.render(state(0));world.resize();
  assert.equal(renderer.calls,calls);assert.equal(renderer.disposed,1);assert.equal(renderer.domElement.removed,true);assert.equal(observer.disconnected,true);assert.equal(listeners.size,0);assert.equal(host.children.length,0);assert.equal(scene.children.length,0);
  for(const resource of resources)assert.equal(counts.get(resource),1,`${resource.type} disposed once`);assert.equal(rafCount,0);
});
