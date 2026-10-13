import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../dist/vendor/three.module.js';
import { LEVELS } from '../dist/curriculum.js';
import { HOP_SECONDS } from '../dist/stone-game.js';
import { createJourneyGame, startJourneyGame, pressJourneyKey, tickJourneyGame, advanceJourneyCheckpoint, getJourneyTarget, snapshotJourney, restoreJourney } from '../dist/journey-game.js';
import { sampleStonePose, STONE_PATH, STONE_TOP_Y, BANK_LANDING } from '../dist/stone-world.js';

// The real scene and paw meshes are used; only canvas drawing and GPU submission
// are stubbed. The controller, rather than the world, owns animation scheduling.
const globalNames = ['window', 'document', 'devicePixelRatio', 'requestAnimationFrame', '__journeyRenderer', '__journeyCreateIsland', '__journeyCanvasTexture'];
const originals = new Map(globalNames.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const listeners = new Map();
let island, rafCount = 0;
const generatedTextures = new Set();
const context = { beginPath() {}, roundRect() {}, arc() {}, fill() {}, stroke() {}, clearRect() {}, fillText() {}, moveTo() {}, lineTo() {} };
globalThis.document = { createElement: () => ({ getContext: () => ({ ...context }) }) };
globalThis.window = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); } };
globalThis.devicePixelRatio = 1;
globalThis.__journeyCanvasTexture = class extends THREE.CanvasTexture {
  constructor(...args) { super(...args); generatedTextures.add(this); }
};
globalThis.requestAnimationFrame = () => { rafCount++; throw new Error('World must not own a second animation loop'); };
globalThis.__journeyRenderer = class {
  constructor() { this.domElement = { remove: () => { this.removed = true; } }; this.shadowMap = {}; }
  setPixelRatio() {} setSize(w, h) { this.size = [w, h]; }
  render(scene, camera) { scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); this.calls = (this.calls || 0) + 1; }
  dispose() { this.disposed = (this.disposed || 0) + 1; }
};
const absoluteImports = (source, url) => source.replace(/from\s*(['"])(\.\/[^'"]+)\1/g, (_, quote, path) => `from '${new URL(path, url).href}'`);
const islandURL = new URL('../dist/stone-island.js', import.meta.url);
const islandSource = absoluteImports(await readFile(islandURL, 'utf8'), islandURL).replace('new THREE.WebGLRenderer(', 'new globalThis.__journeyRenderer(');
const { createStoneIsland } = await import(`data:text/javascript;base64,${Buffer.from(islandSource).toString('base64')}`);
globalThis.__journeyCreateIsland = container => (island = createStoneIsland(container));
const worldURL = new URL('../dist/journey-stone-world.js', import.meta.url);
const source = absoluteImports((await readFile(worldURL, 'utf8')).replace("import { createStoneIsland } from './stone-island.js';", 'const createStoneIsland = globalThis.__journeyCreateIsland;').replaceAll('new THREE.CanvasTexture(', 'new globalThis.__journeyCanvasTexture('), worldURL);
const { createJourneyStoneWorld, getJourneyStoneFrame, sampleJourneyStonePose } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const world = createJourneyStoneWorld({ clientWidth: 1196, clientHeight: 762, appendChild() {} });
const { scene, bear, body, legs, camera, renderer, waterMat } = island;
const stone = index => scene.getObjectByName(`stone-${index + 1}`);
const state = (levelId = 5, taskIndex = 0, phase = 'playing', actionTime = 0, sequence = LEVELS[levelId - 1].sequence) => ({ levelId, taskIndex, phase, actionTime, sequence, paused: false });
const near = (a, b, message, epsilon = 1e-8) => assert(Math.abs(a - b) < epsilon, `${message || 'not near'}: ${a}, ${b}`);
const vectorNear = (a, b, message) => { for (let i = 0; i < 3; i++) near(a[i], b[i], message); };
const snapshot = () => JSON.stringify([bear.position, bear.quaternion, body.scale, body.rotation, ...legs.map(leg => [leg.position, leg.quaternion, leg.scale])]);
const finitePose = pose => [pose.root, pose.feet, [pose.yaw, pose.bodyScaleY, pose.pitch, pose.tuck, pose.gait, pose.stance]].flat().every(Number.isFinite);

after(() => {
  world.dispose();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
});

test('journey preserves approved composition, bear scale, and single animation owner', () => {
  world.render(state(5, 0, 'ready'));
  vectorNear(bear.position.toArray(), [-4.85, .32, 2.65]);
  near(bear.scale.x, .65); near(camera.left, -8.7); near(camera.right, 8.7);
  STONE_PATH.forEach(([x, z], i) => vectorNear(stone(i).position.toArray(), [x, 0, z]));
  assert.equal(stone(0).getObjectByName('stone-key').userData.text, 'E');
  assert.equal(scene.getObjectByName('next-step-pointer').userData.token, 'E');
  assert.equal(rafCount, 0);
});

test('every unchanged level 5–9 key appears once in a bank of at most eight', () => {
  for (const level of LEVELS.slice(4, 9)) {
    const visible = [];
    for (let start = 0; start < level.sequence.length; start += 8) {
      const frame = getJourneyStoneFrame(state(level.id, start));
      assert.equal(frame.batchStart, start);
      assert(frame.tokens.length > 0 && frame.tokens.length <= 8);
      visible.push(...frame.tokens);
      world.render(state(level.id, start));
      const labels = [];
      for (let i = 0; i < 8; i++) {
        const label = stone(i).getObjectByName('stone-key');
        if (label.visible) labels.push(label.userData.text);
        else {
          assert.equal(stone(i).userData.status, 'path');
          assert.equal(stone(i).userData.token, null);
          assert.equal(stone(i).getObjectByName('next-stone-outline').visible, false);
        }
      }
      assert.deepEqual(labels, level.sequence.slice(start, start + 8));
    }
    assert.deepEqual(visible, level.sequence);
  }
});

test('review prefixes, if present, are included without shifting or omitting lesson keys', () => {
  const sequence = ['F', 'F', 'J', 'J', 'D', 'D', ...LEVELS[4].sequence];
  const displayed = [];
  for (let start = 0; start < sequence.length; start += 8) displayed.push(...getJourneyStoneFrame(state(5, start, 'playing', 0, sequence)).tokens);
  assert.deepEqual(displayed, sequence);
});

test('all token hops and full or short final banks have continuous, bounded endpoints', () => {
  for (const level of LEVELS.slice(4, 9)) {
    for (let index = 0; index < level.sequence.length; index++) {
      const frame = getJourneyStoneFrame(state(level.id, index));
      const last = frame.localIndex === frame.tokens.length - 1;
      const duration = last ? HOP_SECONDS * (10 - frame.tokens.length) : HOP_SECONDS;
      const idle = sampleJourneyStonePose(state(level.id, index));
      vectorNear(sampleJourneyStonePose(state(level.id, index, 'acting', 0)).root, idle.root);
      let previous = idle;
      for (let t = 0; t <= duration + .00001; t += .005) {
        const pose = sampleJourneyStonePose(state(level.id, index, 'acting', Math.min(t, duration)));
        assert(finitePose(pose), `non-finite pose in level ${level.id}, token ${index}, time ${t}`);
        assert(new THREE.Vector3(...pose.root).distanceTo(new THREE.Vector3(...previous.root)) < .075,
          `discontinuous or oversized hop in level ${level.id}, token ${index}, time ${t}`);
        previous = pose;
      }
      const end = sampleJourneyStonePose(state(level.id, index, 'acting', duration));
      const phase = last ? index + 1 === level.sequence.length ? 'complete' : 'checkpoint' : 'playing';
      vectorNear(end.root, sampleJourneyStonePose(state(level.id, index + 1, phase)).root);
      if (last) vectorNear(end.feet, BANK_LANDING);
    }
  }
});

test('checkpoints keep the old bank visible until explicit advance resets at the next start', () => {
  for (const level of LEVELS.slice(4, 9)) {
    for (let index = 8; index < level.sequence.length; index += 8) {
      const checkpoint = state(level.id, index, 'checkpoint');
      world.render(checkpoint);
      assert.equal(getJourneyStoneFrame(checkpoint).batchStart, index - 8);
      vectorNear(sampleJourneyStonePose(checkpoint).feet, BANK_LANDING);
      assert.equal(scene.getObjectByName('next-step-pointer').visible, false);
      assert.equal(stone(7).getObjectByName('stone-key').userData.text, '✓');
      // The shared controller covers this route change with its chapter overlay.
      const continued = state(level.id, index);
      world.render(continued);
      assert.equal(getJourneyStoneFrame(continued).batchStart, index);
      vectorNear(bear.position.toArray(), [-4.85, .32, 2.65]);
      assert.equal(stone(0).getObjectByName('stone-key').userData.text, level.sequence[index]);
    }
  }
});

test('each automatic filler landing retains the original four-paw placement', () => {
  // A one-key last bank traverses all eight original stones using short hops.
  const sequence = ['Z'];
  for (let index = 1; index <= 8; index++) {
    const active = state(9, 0, 'acting', index * HOP_SECONDS, sequence);
    world.render(active);
    vectorNear(sampleJourneyStonePose(active).feet, sampleStonePose({ index, phase: 'playing' }).feet);
    const [cx, cz] = STONE_PATH[index - 1], radius = (index === 1 ? .65 : .57) * .94;
    const inwardLimit = radius * Math.cos(Math.PI / 7), theta = .18 + (index - 1) * .37;
    for (const leg of legs) {
      const foot = leg.children[1], vertices = foot.geometry.getAttribute('position');
      let lowY = Infinity;
      for (let v = 0; v < vertices.count; v++) {
        const point = new THREE.Vector3().fromBufferAttribute(vertices, v).applyMatrix4(foot.matrixWorld);
        lowY = Math.min(lowY, point.y);
        for (let edge = 0; edge < 7; edge++) {
          const angle = theta + (edge + .5) * Math.PI * 2 / 7;
          assert((point.x - cx) * Math.sin(angle) + (point.z - cz) * Math.cos(angle) < inwardLimit - .002);
        }
      }
      near(lowY, STONE_TOP_Y, `paw touches automatic stone ${index}`, 1e-7);
    }
  }
});

test('current key remains highlighted during its hop, then empty trail has no phantom targets', () => {
  world.render(state(5, 25, 'acting', .4));
  assert.equal(stone(1).userData.status, 'current');
  assert.equal(stone(1).getObjectByName('stone-key').userData.text, 'G');
  assert.equal(scene.getObjectByName('next-step-pointer').userData.step, 26);
  world.render(state(5, 25, 'acting', .9));
  assert.equal(stone(1).userData.status, 'done');
  assert.equal(scene.getObjectByName('next-step-pointer').visible, false);
  for (let i = 2; i < 8; i++) assert.equal(stone(i).getObjectByName('stone-key').visible, false);
});

test('restored mid-hop and automatic-trail pauses freeze bear, labels and water', () => {
  for (const active of [state(6, 3, 'acting', .38), state(9, 24, 'acting', 3.12)]) {
    world.render(active, .016);
    const original = snapshot();
    world.render(state());
    const paused = { ...active, sequence: [...active.sequence], paused: true };
    world.render(paused);
    assert.equal(snapshot(), original);
    const time = waterMat.uniforms.time.value;
    for (let i = 0; i < 10; i++) { paused.actionTime += .02; world.render(paused, .1); }
    assert.equal(snapshot(), original); assert.equal(waterMat.uniforms.time.value, time);
    paused.actionTime = active.actionTime; paused.paused = false; world.render(paused, .02);
    assert.equal(snapshot(), original); near(waterMat.uniforms.time.value, time + .02);
  }
});

test('dynamic letter texture cache stays stable while repeatedly rendering the same lesson', () => {
  for (let i = 0; i < 8; i++) world.render(state(7, i));
  const size = generatedTextures.size;
  for (let round = 0; round < 10; round++) for (let i = 0; i < 8; i++) world.render(state(7, i));
  assert.equal(generatedTextures.size, size);
});

test('render bounds invalid indices and finite or non-finite time without missing stone access', () => {
  for (const taskIndex of [-5, 0, 8, 30, 100000, NaN, Infinity]) {
    for (const phase of ['ready', 'playing', 'acting', 'checkpoint', 'complete']) {
      for (const actionTime of [-1, 0, 1000, NaN, Infinity]) {
        const input = { ...state(), taskIndex, phase, actionTime };
        assert(finitePose(sampleJourneyStonePose(input)));
        world.render(input);
      }
    }
  }
});

test('real model timing and saved states reach every bank before checkpoint or completion', () => {
  for (const level of LEVELS.slice(4, 9)) {
    const game = createJourneyGame(level.id);
    startJourneyGame(game);
    while (game.phase !== 'complete') {
      if (game.phase === 'checkpoint') {
        assert.equal(getJourneyStoneFrame(game).batchStart, getJourneyTarget(game).batchStart);
        vectorNear(sampleJourneyStonePose(game).feet, BANK_LANDING);
        const restoredCheckpoint = restoreJourney(snapshotJourney(game));
        assert(restoredCheckpoint);
        vectorNear(sampleJourneyStonePose(restoredCheckpoint).root, sampleJourneyStonePose(game).root);
        assert.equal(advanceJourneyCheckpoint(game), true);
      }
      const frame = getJourneyStoneFrame(game), target = getJourneyTarget(game);
      assert.equal(frame.batchStart, target.batchStart);
      assert.equal(frame.localIndex, target.localIndex);
      assert.deepEqual(frame.tokens, target.batchTasks.map(task => task.tokens[0]));
      assert.equal(pressJourneyKey(game, { code: `Key${game.target}` }).kind, 'correct');
      const duration = frame.localIndex === frame.tokens.length - 1 ? HOP_SECONDS * (10 - frame.tokens.length) : HOP_SECONDS;
      assert.equal(game.actionDuration, duration);
      game.actionTime = duration / 2;
      const restored = restoreJourney(snapshotJourney(game));
      assert(restored, `mid-action restoration failed for level ${level.id}, task ${game.taskIndex}`);
      vectorNear(sampleJourneyStonePose(restored).root, sampleJourneyStonePose(game).root);
      const end = sampleJourneyStonePose({ ...game, actionTime: duration });
      assert.equal(tickJourneyGame(game, duration), true);
      vectorNear(sampleJourneyStonePose(game).root, end.root);
    }
    assert.equal(game.index, level.sequence.length);
    assert.equal(game.taskIndex, level.sequence.length);
    vectorNear(sampleJourneyStonePose(game).feet, BANK_LANDING);
  }
});

test('disposal releases dynamic letters and all geometry once and removes resize listener', () => {
  const resources = new Set(generatedTextures);
  scene.traverse(object => {
    if (object.geometry) resources.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
    }
  });
  const counts = new Map();
  resources.forEach(resource => resource.addEventListener('dispose', () => counts.set(resource, (counts.get(resource) || 0) + 1)));
  const calls = renderer.calls;
  world.dispose(); world.dispose(); world.render(state(), 1);
  assert.equal(renderer.calls, calls); assert.equal(renderer.disposed, 1); assert.equal(renderer.removed, true);
  assert.equal(listeners.has('resize'), false); assert.equal(scene.children.length, 0);
  for (const resource of resources) assert.equal(counts.get(resource), 1, `${resource.type} must be disposed once`);
  assert.equal(rafCount, 0);
});
