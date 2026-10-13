import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../dist/vendor/three.module.js';
import { HOP_SECONDS, ARRIVE_SECONDS, STONE_KEYS } from '../dist/stone-game.js';

// Real scene geometry and deterministic animation; only canvas drawing and GPU
// submission are stubbed. Actual rendered pixels are reviewed separately.
const globalNames = ['window', 'document', 'devicePixelRatio', 'requestAnimationFrame', 'cancelAnimationFrame', '__stoneRenderer', '__stoneCreateIsland'];
const originals = new Map(globalNames.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const listeners = new Map();
let baseWorld, rafCount = 0, rendererCount = 0;
const context = { beginPath() {}, roundRect() {}, arc() {}, fill() {}, stroke() {}, clearRect() {}, fillText() {}, moveTo() {}, lineTo() {} };
globalThis.document = { createElement: () => ({ getContext: () => ({ ...context }) }) };
globalThis.window = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); } };
globalThis.devicePixelRatio = 1;
globalThis.requestAnimationFrame = () => { rafCount++; throw new Error('The world must not own an animation loop'); };
globalThis.cancelAnimationFrame = () => {};
globalThis.__stoneRenderer = class {
  constructor() { this.domElement = { remove: () => { this.removed = true; } }; this.shadowMap = {}; rendererCount++; }
  setPixelRatio() {} setSize(w, h) { this.size = [w, h]; }
  render(scene, camera) { scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); this.calls = (this.calls || 0) + 1; }
  dispose() { this.disposed = (this.disposed || 0) + 1; }
};
const absoluteImports = (source, url) => source.replace(/from\s*(['"])(\.\/[^'"]+)\1/g, (_, quote, path) => `from '${new URL(path, url).href}'`);
const islandURL = new URL('../dist/stone-island.js', import.meta.url);
const baseSource = absoluteImports(await readFile(islandURL, 'utf8'), islandURL).replace('new THREE.WebGLRenderer(', 'new globalThis.__stoneRenderer(');
const { createStoneIsland } = await import(`data:text/javascript;base64,${Buffer.from(baseSource).toString('base64')}`);
globalThis.__stoneCreateIsland = container => { baseWorld = createStoneIsland(container); return baseWorld; };
const worldURL = new URL('../dist/stone-world.js', import.meta.url);
const worldSource = absoluteImports((await readFile(worldURL, 'utf8')).replace("import { createStoneIsland } from './stone-island.js';", 'const createStoneIsland = globalThis.__stoneCreateIsland;'), worldURL);
const { createStoneWorld, sampleStonePose, STONE_PATH, STONE_TOP_Y, BEAR_SCALE, FOOTPRINT_CENTER_Z, BANK_LANDING, FLAG_DESTINATION } =
  await import(`data:text/javascript;base64,${Buffer.from(worldSource).toString('base64')}`);
const container = { clientWidth: 1196, clientHeight: 762, appendChild() {} };
const world = createStoneWorld(container);
const island = baseWorld, { scene, bear, body, legs, camera, renderer, waterMat } = island;
const state = (index = 0, phase = 'playing', hopTime = 0) => ({ index, phase, hopTime, paused: false, target: STONE_KEYS[index] || null });
const near = (a, b, message, epsilon = 1e-8) => assert(Math.abs(a - b) < epsilon, `${message || 'not near'}: ${a}, ${b}`);
const vectorNear = (a, b, message) => { for (let i = 0; i < 3; i++) near(a[i], b[i], message); };
const worldFeet = () => legs.map(leg => leg.children[1]);
const eachVertex = (mesh, fn) => {
  const vertices = mesh.geometry.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) fn(new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(mesh.matrixWorld));
};
const poseSnapshot = () => JSON.stringify([bear.position, bear.quaternion, body.scale, body.rotation, ...legs.map(leg => [leg.position, leg.quaternion, leg.scale])]);

after(() => {
  world.dispose();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
});

test('approved initial bear, eight stones and camera stay intact without a second RAF', () => {
  world.render(state(0, 'ready'));
  vectorNear(bear.position.toArray(), [-4.85, .32, 2.65]);
  near(bear.scale.x, .65); near(camera.left, -8.7); near(camera.right, 8.7);
  assert.equal(STONE_PATH.length, 8); assert.deepEqual(STONE_KEYS, ['F', 'J', 'F', 'F', 'J', 'F', 'J', 'J']);
  assert.equal(scene.getObjectByName('next-step-pointer').userData.step, 1);
  assert.equal(rafCount, 0); assert.equal(rendererCount, 1);
});

test('all four real paws fit every heptagonal top and touch its surface', () => {
  for (let index = 1; index <= 8; index++) {
    world.render(state(index));
    const [cx, cz] = STONE_PATH[index - 1], radius = (index === 1 ? .65 : .57) * .94;
    const inwardLimit = radius * Math.cos(Math.PI / 7), theta = .18 + (index - 1) * .37;
    for (const foot of worldFeet()) {
      let lowY = Infinity;
      eachVertex(foot, point => {
        lowY = Math.min(lowY, point.y);
        for (let edge = 0; edge < 7; edge++) {
          const a = theta + (edge + .5) * Math.PI * 2 / 7;
          const outward = (point.x - cx) * Math.sin(a) + (point.z - cz) * Math.cos(a);
          assert(outward < inwardLimit - .002, `paw exceeds stone ${index}, edge ${edge}: ${outward} >= ${inwardLimit}`);
        }
      });
      near(lowY, STONE_TOP_Y, `foot touches top of stone ${index}`, 1e-7);
    }
    const rootOffset = new THREE.Vector3(0, 0, FOOTPRINT_CENTER_Z * BEAR_SCALE).applyAxisAngle(new THREE.Vector3(0, 1, 0), bear.rotation.y);
    near(bear.position.x + rootOffset.x, cx); near(bear.position.z + rootOffset.z, cz);
  }
});

test('every hop has stable endpoints, a short arc, compact limbs, and continuous motion', () => {
  for (let index = 0; index < 8; index++) {
    const start = sampleStonePose(state(index)), end = sampleStonePose(state(index + 1));
    vectorNear(sampleStonePose(state(index, 'hopping', 0)).root, start.root);
    vectorNear(sampleStonePose(state(index, 'hopping', HOP_SECONDS)).root, end.root);
    near(sampleStonePose(state(index, 'hopping', HOP_SECONDS)).yaw, end.yaw);
    let previous = start, maxHeight = -Infinity;
    for (let i = 0; i <= 750; i++) {
      const pose = sampleStonePose(state(index, 'hopping', i / 1000));
      assert(new THREE.Vector3(...pose.root).distanceTo(new THREE.Vector3(...previous.root)) < .015, `jump discontinuity: stone ${index + 1}, ${i}`);
      assert(Math.abs(pose.tuck) <= .22 + 1e-8); assert(Math.abs(pose.pitch) <= .035 + 1e-8);
      maxHeight = Math.max(maxHeight, pose.feet[1]); previous = pose;
    }
    assert(maxHeight > STONE_TOP_Y + .57 && maxHeight < STONE_TOP_Y + .66);
  }
});

test('stone eight reaches the bank then walks all the way to the flag without teleporting', () => {
  const start = sampleStonePose(state(8));
  const first = sampleStonePose(state(8, 'arriving', 0)); vectorNear(first.root, start.root);
  const bank = sampleStonePose(state(8, 'arriving', HOP_SECONDS)); vectorNear(bank.feet, BANK_LANDING);
  assert(bank.feet[0] > 4.6, 'bank landing clears the grassy river edge');
  let previous = first;
  for (let i = 1; i <= 1800; i++) {
    const pose = sampleStonePose(state(8, 'arriving', i / 1000));
    assert(new THREE.Vector3(...pose.root).distanceTo(new THREE.Vector3(...previous.root)) < .014, `arrival discontinuity at ${i}`);
    previous = pose;
  }
  const complete = sampleStonePose(state(8, 'complete'));
  vectorNear(previous.root, complete.root); vectorNear(complete.feet, FLAG_DESTINATION);
  world.render(state(8, 'complete')); assert.equal(scene.getObjectByName('next-step-pointer').visible, false);
});

test('the next highlight and scene-space pointer advance only after landing', () => {
  world.render(state(2, 'hopping', .4));
  const pointer = scene.getObjectByName('next-step-pointer');
  assert.equal(pointer.userData.step, 3);
  const third = scene.getObjectByName('stone-3-F');
  assert.equal(third.userData.status, 'current'); assert.equal(third.getObjectByName('next-stone-outline').visible, true);
  assert.equal(scene.getObjectByName('stone-2-J').getObjectByName('stone-key').userData.text, '✓');
  world.render(state(3));
  assert.equal(pointer.userData.step, 4); assert.equal(third.userData.status, 'done');
  assert.equal(third.getObjectByName('next-stone-outline').visible, false);
});

test('canonical mid-arc restoration is deterministic and every paused transform freezes', () => {
  const active = state(3, 'hopping', .38);
  world.render(active, .016); const original = poseSnapshot();
  world.render(state(0, 'ready'), .016);
  const restored = { ...active, paused: true }; world.render(restored);
  assert.equal(poseSnapshot(), original);
  const time = waterMat.uniforms.time.value;
  for (let i = 0; i < 20; i++) { restored.hopTime += .02; world.render(restored, .1); }
  assert.equal(poseSnapshot(), original); assert.equal(waterMat.uniforms.time.value, time);
  restored.hopTime = .38; restored.paused = false; world.render(restored, .02);
  assert.equal(poseSnapshot(), original); near(waterMat.uniforms.time.value, time + .02);
});

test('dispose releases geometry, materials, textures, canvas and resize listener exactly once', () => {
  const resources = new Set();
  scene.traverse(object => {
    if (object.geometry) resources.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
    }
  });
  const counts = new Map(); resources.forEach(resource => resource.addEventListener('dispose', () => counts.set(resource, (counts.get(resource) || 0) + 1)));
  assert(listeners.has('resize'));
  const calls = renderer.calls; world.dispose(); world.dispose(); world.render(state(0), 1);
  assert.equal(renderer.calls, calls); assert.equal(renderer.disposed, 1); assert.equal(renderer.removed, true);
  assert.equal(listeners.has('resize'), false); assert.equal(scene.children.length, 0);
  for (const resource of resources) assert.equal(counts.get(resource), 1, `${resource.type} must release exactly once`);
  assert.equal(rafCount, 0);
});
