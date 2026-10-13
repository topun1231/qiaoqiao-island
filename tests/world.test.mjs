import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../dist/vendor/three.module.js';
import { createRewards } from '../dist/rewards.js';

// Exercise the real geometry, state and frame loop without a browser or a GPU.
// This replaces only WebGLRenderer; visual/rendering QA remains a browser check.
const worldURL = new URL('../dist/world.js', import.meta.url);
const originalSource = await readFile(worldURL, 'utf8');
const source = originalSource
  .replace(/from\s*(['"])(\.\/[^'"]+)\1/g, (_, quote, path) => `from '${new URL(path, worldURL).href}'`)
  .replace('new THREE.WebGLRenderer(', 'new globalThis.__typingIslandTestRenderer(');
assert.notEqual(source, originalSource);

const globals = ['window', 'devicePixelRatio', 'requestAnimationFrame', 'cancelAnimationFrame', '__typingIslandTestRenderer'];
const originalGlobals = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let nextFrame, now = performance.now(), cancelled = false;
globalThis.window = { addEventListener() {}, removeEventListener() {} };
globalThis.devicePixelRatio = 1;
globalThis.requestAnimationFrame = callback => { nextFrame = callback; return 1; };
globalThis.cancelAnimationFrame = () => { cancelled = true; };
globalThis.__typingIslandTestRenderer = class {
  constructor() {
    this.domElement = { remove() {} };
    this.shadowMap = {};
    this.frames = 0;
  }
  setPixelRatio() {}
  setSize() {}
  render(scene, camera) {
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    this.frames++;
  }
  dispose() { this.disposed = true; }
};
const { createWorld } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const world = createWorld({ clientWidth: 1196, clientHeight: 762, appendChild() {} });
now = performance.now();
const bear = world.scene.getObjectByName('island-bear');
const planks = Array.from({ length: 8 }, (_, index) => world.scene.getObjectByName(`bridge-plank-${index + 1}`));
const stage = level => world.scene.getObjectByName(`reward-${level}-stage-1`);
const idsThrough = level => Array.from({ length: level }, (_, i) => i + 1);
function advance(seconds) {
  for (let i = 0; i < Math.ceil(seconds / .02); i++) {
    now += 20;
    nextFrame(now);
  }
}

after(() => {
  world.dispose();
  for (const [key, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

test('fresh island and bridge keep the original first-level geometry and pausable plank pops', () => {
  world.configureLevel(1, []);
  assert.equal(bear.position.x, -6.15);
  assert.equal(bear.position.z, 1.05);
  assert(planks.every(p => !p.visible));
  for (let level = 2; level <= 12; level++) assert.equal(stage(level).visible, false);
  world.setProgress(4);
  advance(.1);
  assert.equal(planks.filter(p => p.visible).length, 4);
  world.setPaused(true);
  const height = planks[3].position.y;
  advance(2);
  assert.equal(planks[3].position.y, height);
  world.setPaused(false);
  advance(.6);
  assert(Math.abs(planks[3].position.y - .32) < 1e-10);
});

test('first-level bear walk takes six seconds of active time and completes exactly once', () => {
  world.configureLevel(1, []);
  world.setProgress(8);
  let completed = 0;
  world.startWalk(() => completed++);
  advance(2);
  world.setPaused(true);
  const position = bear.position.clone();
  advance(8);
  assert.equal(completed, 0);
  assert(bear.position.equals(position));
  world.setPaused(false);
  advance(4.1);
  assert.equal(completed, 0);
  advance(.14);
  assert.equal(completed, 1);
  assert(Math.abs(bear.position.x - 7.05) < 1e-10);
  advance(1);
  assert.equal(completed, 1);
});

for (let level = 2; level <= 12; level++) {
  test(`level ${level} grows actual meshes, pauses its celebration, preserves replay rewards, and cleans overview state`, () => {
    const earned = idsThrough(level - 1);
    world.configureLevel(level, earned);
    assert(planks.every(p => p.visible));
    assert.equal(stage(level).visible, false);
    world.updateTaskProgress(.45);
    advance(.6);
    assert.equal(stage(level).visible, true);
    let completed = 0;
    world.celebrateLevel(level, () => completed++);
    advance(.9);
    world.setPaused(true);
    const position = bear.position.clone();
    const scale = stage(level).scale.clone();
    advance(4);
    assert.equal(completed, 0);
    assert(bear.position.equals(position));
    assert(stage(level).scale.equals(scale));
    world.setPaused(false);
    advance(1.9);
    assert.equal(completed, 1);
    advance(1);
    assert.equal(completed, 1);
    world.configureLevel(level, [...earned, level]);
    const fullSize = stage(level).scale.clone();
    world.updateTaskProgress(.01);
    advance(.3);
    assert(stage(level).scale.equals(fullSize));
    world.configureLevel(0, earned);
    assert.equal(stage(level).visible, false);
    assert(planks.every(p => p.visible));
  });
}

test('planting and watering share a growing tree, which never shrinks during a completed replay', () => {
  const tree = world.scene.getObjectByName('reward-4-5-growing-tree');
  world.configureLevel(4, idsThrough(3));
  assert.equal(tree.visible, false);
  world.updateTaskProgress(1);
  advance(1);
  assert.equal(tree.visible, true);
  assert.equal(tree.scale.x, .48);
  world.configureLevel(5, idsThrough(4));
  assert.equal(tree.scale.x, .48);
  world.updateTaskProgress(.5);
  advance(1);
  assert(tree.scale.x > .48 && tree.scale.x < 1);
  world.configureLevel(4, idsThrough(5));
  assert.equal(tree.scale.x, 1);
  world.updateTaskProgress(.05);
  advance(1);
  assert.equal(tree.scale.x, 1);
});

test('earned bridge and earlier props stay intact through replay and reset', () => {
  world.configureLevel(1, [1, 2, 3]);
  world.setProgress(0);
  assert(planks.every(p => p.visible));
  assert.equal(stage(2).visible, true);
  assert.equal(stage(3).visible, true);
  world.configureLevel(7, idsThrough(6));
  world.updateTaskProgress(.6);
  advance(.6);
  assert.equal(stage(7).visible, true);
  world.reset();
  assert.equal(stage(7).visible, false);
  assert.equal(stage(6).visible, true);
  assert(planks.every(p => p.visible));
});

test('navigation cancels stale construction and bridge-walk callbacks', () => {
  let stale = 0;
  world.configureLevel(7, idsThrough(6));
  world.celebrateLevel(7, () => stale++);
  advance(.5);
  world.configureLevel(0, idsThrough(6));
  advance(5);
  assert.equal(stale, 0);
  world.configureLevel(1, []);
  world.startWalk(() => stale++);
  advance(.5);
  world.configureLevel(0, []);
  advance(8);
  assert.equal(stale, 0);
  assert.equal(bear.position.x, -6.15);
});

test('overview rewards derive only from explicit completed IDs and completed geometry is batched', () => {
  const scene = new THREE.Scene();
  const rewards = createRewards(scene);
  rewards.configure(7, [1, 2]);
  rewards.setProgress(1);
  rewards.update(2);
  assert.equal(scene.getObjectByName('reward-7-stage-1').visible, true);
  rewards.configure(0, [1, 2]);
  assert.equal(scene.getObjectByName('reward-7-stage-1').visible, false);
  assert.equal(scene.getObjectByName('reward-2-stage-1').visible, true);
  assert.equal(scene.getObjectByName('reward-3-stage-1').visible, false);
  rewards.configure(0, idsThrough(12));
  let count = 0;
  scene.traverseVisible(o => { if (o.isMesh) count++; });
  assert(count < 110, `Expected batched reward meshes, found ${count}`);
  rewards.dispose();
  assert.equal(scene.children.length, 0);
});

test('dispose removes the animation frame and prevents further rendering', () => {
  world.configureLevel(0, idsThrough(12));
  advance(.1);
  const rendered = world.renderer.frames;
  world.dispose();
  assert.equal(cancelled, true);
  assert.equal(world.renderer.disposed, true);
  advance(.2);
  assert.equal(world.renderer.frames, rendered);
});
