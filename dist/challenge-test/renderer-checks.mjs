import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../vendor/three.module.js';
import { sampleRiverPose, RIVER_PATHS, RIVER_TOP_Y, RIVER_STONE_RADIUS } from './river-world.js';
import { sampleOrchardFruit } from './orchard-world.js';

const saved = new Map(['document', 'window', 'ResizeObserver', '__previewRenderer', '__previewIsland'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const context = { beginPath(){}, roundRect(){}, arc(){}, fill(){}, stroke(){}, clearRect(){}, fillText(){}, moveTo(){}, lineTo(){} };
globalThis.document = { createElement: () => ({ getContext: () => ({ ...context }) }) };
const listeners = new Set();
globalThis.window = { addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
globalThis.ResizeObserver = undefined;
globalThis.__previewRenderer = class {
  constructor() { this.domElement = { remove(){} }; this.shadowMap = {}; }
  setPixelRatio(){} setSize(){} dispose(){}
  render(scene, camera) { scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); }
};
let latest;
const imports = (source, url) => source.replace(/from\s*(['"])(\.\.?\/[^'"]+)\1/g, (_, q, path) => `from '${new URL(path, url).href}'`);
const islandUrl = new URL('./cozy-island.js', import.meta.url);
const islandSource = imports((await readFile(islandUrl, 'utf8')).replace('new THREE.WebGLRenderer(', 'new globalThis.__previewRenderer('), islandUrl);
const { createCozyIsland } = await import(`data:text/javascript;base64,${Buffer.from(islandSource).toString('base64')}`);
globalThis.__previewIsland = (container, kind) => { latest = createCozyIsland(container, kind); return latest; };
async function loadWorld(file) {
  const url = new URL(file, import.meta.url);
  const source = imports((await readFile(url, 'utf8')).replace("import { createCozyIsland } from './cozy-island.js';", 'const createCozyIsland = globalThis.__previewIsland;'), url);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const { createRiverWorld } = await loadWorld('./river-world.js');
const { createOrchardWorld } = await loadWorld('./orchard-world.js');
const container = { clientWidth: 1280, clientHeight: 720, appendChild(){} };
const worlds = [];
const near = (a, b, eps = 1e-8) => assert(Math.abs(a - b) <= eps, `${a} differs from ${b}`);
const vectorNear = (a,b,eps) => a.forEach((v,i) => near(v,b[i],eps));

test('slow fruit lands and waits; elapsed time cannot make it disappear', () => {
  near(sampleOrchardFruit('F', 0)[1], 4.9);
  assert(sampleOrchardFruit('F', 3)[1] > .82);
  vectorNear(sampleOrchardFruit('F', 6), sampleOrchardFruit('F', 3600));
  vectorNear(sampleOrchardFruit('D', 0, 2), sampleOrchardFruit('D', 3600, 2));
});

test('both complete selectable routes contain A/G/H and share the same banks', () => {
  for (const route of ['agh', 'hag']) assert.deepEqual([...RIVER_PATHS[route].sequence].sort(), ['A','G','H']);
  assert.deepEqual(RIVER_PATHS.agh.start, RIVER_PATHS.hag.start);
  assert.deepEqual(RIVER_PATHS.agh.end, RIVER_PATHS.hag.end);
});

test('all keyed hops have continuous endpoints, including segment reversal and either first route choice', () => {
  for (const route of Object.keys(RIVER_PATHS)) {
    const path = RIVER_PATHS[route], level = ['sl','fjsl'].includes(route) ? 3 : 4, segment = route === 'fjsl' ? 1 : 0;
    for (let i = 0; i < path.stones.length; i++) {
      const base = { level, segment, segmentIndex:i, route:level===4 ? route : null, step:i, phase:'playing' };
      const action = { type:'jump', from:i, segment, segmentIndex:i, route:level===4 ? route : null, duration:i===path.stones.length-1?.9:.56, elapsed:0 };
      const startState = i===0 && level===4 ? {...base, route:null} : base;
      vectorNear(sampleRiverPose({...base,action}).root, sampleRiverPose(startState).root);
      action.elapsed = action.duration;
      const next = i === path.stones.length-1 ? level === 3 && segment === 0 ? { level:3,segment:1,segmentIndex:0,step:2,phase:'playing' } : {...base,phase:'complete',segmentIndex:i+1,step:i+1} : {...base,segmentIndex:i+1,step:i+1};
      vectorNear(sampleRiverPose({...base,action}).root, sampleRiverPose(next).root);
      let previous = sampleRiverPose({...base,action:{...action,elapsed:0}}).root;
      for (let j=1;j<=500;j++) {
        const current = sampleRiverPose({...base,action:{...action,elapsed:action.duration*j/500}}).root;
        assert(Math.hypot(...current.map((v,k)=>v-previous[k])) < .075, 'pose has a discontinuity'); previous=current;
      }
    }
  }
});

test('real articulated paw vertices fit every heptagonal stone top and touch the surface', () => {
  const world = createRiverWorld(container); worlds.push(world); const island = latest;
  for (const [route, path] of Object.entries(RIVER_PATHS)) {
    for (let i = 0; i < path.stones.length; i++) {
      const level=['sl','fjsl'].includes(route)?3:4, segment=route==='fjsl'?1:0;
      const state={level,segment,segmentIndex:i+1,route,step:i+1,phase:'playing'};
      // The last stone is a physical landing within the final-key animation.
      if(i===path.stones.length-1)state.action={type:'jump',from:i,segment,segmentIndex:i,route,duration:.9,elapsed:.9*.62};
      world.update(state);
      const [x,z]=path.stones[i], radius=RIVER_STONE_RADIUS*.94, limit=radius*Math.cos(Math.PI/7), theta=.18+i*.37;
      for (const leg of island.legs) {
        const foot=leg.children[1], vertices=foot.geometry.getAttribute('position'); let low=Infinity;
        for(let v=0;v<vertices.count;v++) {
          const point=new THREE.Vector3().fromBufferAttribute(vertices,v).applyMatrix4(foot.matrixWorld); low=Math.min(low,point.y);
          for(let edge=0;edge<7;edge++) { const a=theta+(edge+.5)*Math.PI*2/7; assert((point.x-x)*Math.sin(a)+(point.z-z)*Math.cos(a)<limit-.002); }
        }
        near(low,RIVER_TOP_Y,1e-7);
      }
    }
  }
});

test('orchard shows simultaneous shopping choices and persistent counted fruit', () => {
  const world=createOrchardWorld(container); worlds.push(world); const island=latest;
  const state={level:2,phase:'playing',counts:{D:0,K:0},step:0,time:0}; world.update(state);
  const root=island.scene.getObjectByName('preview-orchard');
  assert(root.getObjectByName('fruit-D').visible); assert(root.getObjectByName('fruit-K').visible);
  assert.equal(root.getObjectByName('orchard-quantity-0').userData.remaining,2);
  assert.equal(root.getObjectByName('orchard-quantity-1').userData.remaining,1);
  world.update({...state,counts:{D:1,K:1},step:2});
  assert.equal(root.getObjectByName('orchard-persistent-basket').userData.count,2);
  assert(root.getObjectByName('fruit-D').visible); assert(!root.getObjectByName('fruit-K').visible);
});

test('orchard key/count cards fit the real landscape viewport and the basket clears landed fruit', () => {
  const world=createOrchardWorld({...container,clientWidth:1184,clientHeight:606});worlds.push(world);const island=latest;
  const state={level:2,phase:'playing',counts:{D:0,K:0},step:0,time:0};world.update(state);
  const root=island.scene.getObjectByName('preview-orchard');
  for(const name of ['orchard-basket-count','orchard-quantity-0','orchard-quantity-1']) {
    const label=root.getObjectByName(name),v=label.geometry.getAttribute('position');
    assert.equal(label.material.depthTest,false);
    for(let i=0;i<v.count;i++) { const point=new THREE.Vector3().fromBufferAttribute(v,i).applyMatrix4(label.matrixWorld).project(island.camera);assert(Math.abs(point.x)<.95&&Math.abs(point.y)<.95,`${name} clipped`); }
  }
  world.update({...state,level:1,target:'F',fallAge:6});
  const fruit=root.getObjectByName('fruit-F'),basket=root.getObjectByName('orchard-persistent-basket');
  assert(Math.abs(fruit.position.x-basket.position.x)>2);
  assert.equal(root.getObjectByName('fruit-key-F').material.depthTest,false);
});

test('render state stays identical across repeated paused frames and inputs are not mutated', () => {
  for(const [create,state] of [[createOrchardWorld,{level:1,step:0,phase:'acting',counts:{},target:'F',time:2.1,paused:true,action:{type:'catch',key:'F',duration:1.12,elapsed:.5,fallAge:2}}], [createRiverWorld,{level:4,step:0,route:'hag',phase:'acting',time:1,paused:true,action:{type:'jump',from:0,route:'hag',duration:.56,elapsed:.23}}]]) {
    const original=JSON.stringify(state),world=create(container);worlds.push(world);const island=latest;
    const snapshot=()=>JSON.stringify([island.bear.position,island.bear.quaternion,island.body.scale,...island.legs.map(leg=>[leg.position,leg.quaternion]),island.waterMat.uniforms.time.value]);
    world.update(state,0);const before=snapshot();world.update(state,100);assert.equal(snapshot(),before);assert.equal(JSON.stringify(state),original);
  }
});

after(()=>{ for(const world of worlds)world.destroy(); assert.equal(listeners.size,0); for(const [key,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]; });
