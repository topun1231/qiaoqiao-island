import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../dist/vendor/three.module.js';
import { createLegacy as create, press, tick, snapshot, restore, advanceStage } from '../dist/challenge-test/engine-v3.js';

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
function assertPreview(state) {
  assert.equal(preview().visible, state.level === 1 && state.lessonStageIndex > 0 && !state.stageReady && !state.solved);
  if (!preview().visible) return;
  const start = Math.floor(state.step / 4) * 4;
  assert.equal(preview().userData.start, start);
  assert.equal(labels().filter(label => label.visible && label.userData.current).length, 1);
  labels().forEach((label, i) => {
    const index = start + i;
    assert.equal(label.visible, index < state.tasks.length);
    if (!label.visible) return;
    assert.equal(label.userData.text, state.tasks[index].key);
    assert.equal(label.userData.style, index === state.step ? 'active' : index < state.step ? 'muted' : 'label');
    assert.equal(label.userData.index, index);
  });
}
function bounds(label) {
  const positions = label.geometry.getAttribute('position');
  const points = Array.from({ length: positions.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(label.matrixWorld).project(latest.camera));
  return { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)), bottom: Math.min(...points.map(p => p.y)), top: Math.max(...points.map(p => p.y)) };
}
const disjoint = (a, b) => a.right < b.left || b.right < a.left || a.top < b.bottom || b.top < a.bottom;

test('L1 shows stable FFJJ/FJFJ strings, follows real catches, and resets across every stage', () => {
  const scene = world(), state = create(1);
  for (let stage = 0; stage < 3; stage++) {
    scene.update(state); assertPreview(state);
    if (stage) assert.equal(labels().map(label => label.userData.text).join(''), stage === 1 ? 'FFJJ' : 'JFFJ');
    while (!state.stageReady && !state.solved) {
      const original = JSON.stringify(state), before = previewSnapshot();
      scene.update(state, 50); assert.equal(JSON.stringify(state), original, 'rendering must not advance or alter the task');
      assert.deepEqual(previewSnapshot(), before);
      assert.equal(press(state, state.target).status, 'accepted');
      for (const fraction of [.2, .5, .9]) {
        const partial = { ...state, action: { ...state.action, elapsed: state.action.duration * fraction } };
        scene.update(partial); assertPreview(partial);
        assert.deepEqual(previewSnapshot(), before, 'catch animation does not slide or advance the string');
        const restored = restore(JSON.stringify(snapshot(partial))); assert.ok(restored);
        scene.update(restored); assert.deepEqual(previewSnapshot(), before, 'restoring a catch reconstructs the same string');
        scene.update({ ...restored, paused: true }, 100); assert.deepEqual(previewSnapshot(), before);
      }
      tick(state, 100); scene.update(state); assertPreview(state);
      if (stage === 1 && state.step === 4) assert.equal(labels().map(label => label.userData.text).join(''), 'FJFJ');
    }
    assert.equal(preview().visible, false);
    if (stage < 2) assert.equal(advanceStage(state), true);
  }
  scene.update(create(1, 1)); assert.equal(labels().map(label => label.userData.text).join(''), 'FFJJ');
  scene.update(create(1)); assert.equal(preview().visible, false, 'warmup must not retain a later-stage string');
});

test('L2 keeps free fruit choice and exact stage quantities, with no ordering strip', () => {
  const scene = world(), state = create(2);
  for (let stage = 0; stage < 3; stage++) {
    scene.update(state); assert.equal(preview().visible, false);
    const required = [[2, 1], [2, 4], [5, 4]][stage];
    for (let i = 0; i < 2; i++) assert.equal(object(`orchard-quantity-${i}`).userData.remaining, required[i]);
    while (!state.stageReady && !state.solved) {
      const key = [...state.choices].reverse().find(choice => !choice.done).key;
      assert.equal(press(state, key).status, 'accepted'); tick(state, 100); scene.update(state);
      for (const [i, k] of ['D', 'K'].entries()) {
        const label = object(`orchard-quantity-${i}`), remaining = required[i] - state.counts[k];
        assert(label.visible); assert.equal(label.userData.remaining, remaining);
        assert.equal(label.userData.text, remaining ? `${k === 'D' ? '梨' : '桃'}还缺 ${remaining} 个` : `${k === 'D' ? '梨' : '桃'}够啦 ✓`);
      }
      assert.equal(preview().visible, false);
    }
    if (stage < 2) assert.equal(advanceStage(state), true);
  }
});

test('compact world preview stays inside desktop/narrow viewports and clear of existing targets', () => {
  for (const [width, height] of [[1184, 606], [588, 606], [360, 640], [1800, 400]]) {
    const scene = world(width, height);
    for (const stage of [1, 2]) for (const step of [0, 1, 3, 4, stage === 1 ? 7 : 11]) {
      const state = create(1, stage); state.step = step; state.target = state.tasks[step].key;
      for (const age of [0, 3, 6]) {
        scene.update({ ...state, fallAge: age });
        const strip = [object('orchard-sequence-title'), ...labels()];
        const targets = [object('fruit-key-' + state.target), object('orchard-basket-count'), object('orchard-source-key-0'), object('orchard-source-key-1')];
        for (const label of strip) {
          assert.equal(label.material.depthTest, false);
          const box = bounds(label);
          assert(box.left > -.95 && box.right < .95 && box.bottom > -.95 && box.top < .95, `${label.name} clipped at ${width}×${height}`);
          for (const target of targets) assert(disjoint(box, bounds(target)), `${label.name} covers ${target.name}`);
        }
        for (let i = 1; i < strip.length; i++) assert(disjoint(bounds(strip[0]), bounds(strip[i])), 'caption and keys must stay separate');
        latest.scene.traverse(node => {
          for (const number of [...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()]) assert(Number.isFinite(number), node.name || node.type);
        });
      }
    }
  }
});

after(() => {
  worlds.forEach(instance => instance.destroy()); assert.equal(listeners.size, 0); assert(renderers.every(renderer => renderer.disposed));
  for (const [key, descriptor] of saved) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
});
