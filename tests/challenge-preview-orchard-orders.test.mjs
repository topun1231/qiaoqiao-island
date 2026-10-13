import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../dist/vendor/three.module.js';

const saved = new Map(['document', 'window', 'ResizeObserver', '__orchardRenderer'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const listeners = new Set(), worlds = [], renderers = [];
let latest;
globalThis.document = { createElement: () => ({ getContext: () => new Proxy({}, { get: (object, key) => object[key] ?? (() => {}), set: (object, key, value) => (object[key] = value, true) }) }) };
globalThis.window = { addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
globalThis.ResizeObserver = undefined;
globalThis.__orchardRenderer = class {
  constructor() { this.domElement = { remove() {} }; this.shadowMap = {}; renderers.push(this); }
  setPixelRatio() {} setSize() {} dispose() { this.disposed = true; }
  render(scene, camera) { scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); latest = { scene, camera }; }
};
const base = new URL('../dist/challenge-test/', import.meta.url);
async function load(name, replacements = {}) {
  let source = await readFile(new URL(name, base), 'utf8');
  source = source.replace(/from\s*(['"])([^'"]+)\1/g, (_, q, path) => `from '${replacements[path] || new URL(path, new URL(name, base)).href}'`)
    .replaceAll('new THREE.WebGLRenderer(', 'new globalThis.__orchardRenderer(');
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}
const island = await load('cozy-island.js');
const { createOrchardWorld } = await import(await load('orchard-world.js', { './cozy-island.js': island }));
function world(width = 1184, height = 606) {
  const instance = createOrchardWorld({ clientWidth: width, clientHeight: height, appendChild() {} });
  worlds.push(instance); return instance;
}
const object = name => latest.scene.getObjectByName(name);
const preview = () => object('orchard-sequence-preview');
const labels = () => Array.from({ length: 4 }, (_, i) => object(`orchard-sequence-key-${i}`));
const previewSnapshot = () => ({ visible: preview().visible, start: preview().userData.start, labels: labels().map(label => ({ text: label.userData.text, style: label.userData.style, current: label.userData.current, index: label.userData.index, visible: label.visible, position: label.position.toArray() })) });

const modern=(extra={})=>({version:3,contentVersion:3,level:2,lessonStageIndex:1,catchStyle:'orders',stage:'select',phase:'playing',orders:[{id:'rabbit',key:'D',label:'小兔篮',needs:{D:2,K:1}},{id:'deer',key:'K',label:'小鹿篮',needs:{D:1,K:2}}],orderId:null,orderCounts:{rabbit:{D:2,K:1},deer:{D:0,K:0}},orderCompleted:['rabbit'],tasks:[{key:'D'},{key:'D'},{key:'K'},{key:'D'},{key:'K'},{key:'K'}],counts:{D:2,K:1},...extra});
test('separate shopping baskets retain fulfilled contents and label the selectable unfinished order',()=>{
 const scene=world();scene.update(modern());
 assert.equal(object('orchard-persistent-basket').visible,false);
 assert.equal(object('orchard-order-basket-0').userData.count,3);
 assert.match(object('orchard-order-label-0').userData.text,/✓/);
 assert.match(object('orchard-order-label-1').userData.text,/K.*小鹿篮/);
 assert.equal(object('fruit-key-D').parent.visible,false);
 scene.update(modern({stage:'play',orderId:'deer'}));
 assert.equal(object('fruit-key-D').parent.visible,true);
 assert.equal(object('orchard-order-label-1').userData.style,'active');
 assert.equal(object('orchard-order-basket-0').userData.count,3);
});
test('balanced shopping has an actual divided basket while matching orders do not show a misleading linear string',()=>{
 const scene=world();scene.update(modern({level:1,lessonStageIndex:2,stage:'play',orderId:'rabbit',orders:[{id:'rabbit',key:'F',label:'小兔篮',needs:{F:2,J:1}},{id:'bear',key:'J',label:'小熊篮',needs:{F:1,J:2}}],tasks:[{key:'F'},{key:'F'},{key:'J'},{key:'F'},{key:'J'},{key:'J'}],counts:{},orderCounts:{},orderCompleted:[]}));
 assert.equal(preview().visible,false);
 scene.update(modern({lessonStageIndex:2,stage:'play',orders:[{id:'pair',label:'配对盒',needs:{D:2,K:2}}],orderId:'pair',orderCounts:{pair:{D:1,K:1}},orderCompleted:[],balanced:true,tasks:[{key:'D'},{key:'K'},{key:'D'},{key:'K'}],counts:{D:1,K:1}}));
 assert.equal(object('orchard-basket-divider').visible,true);
 assert.equal(object('orchard-balanced-guide').visible,true);
 assert.equal(object('orchard-persistent-basket').visible,true);
});
after(() => {
  worlds.forEach(instance => instance.destroy()); assert.equal(listeners.size, 0); assert(renderers.every(renderer => renderer.disposed));
  for (const [key, descriptor] of saved) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
});
