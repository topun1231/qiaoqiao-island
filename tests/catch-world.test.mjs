import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../dist/vendor/three.module.js';
import { createCatchGame, startCatchGame, pressCatchKey, tickCatchGame, getCatchTarget } from '../dist/catch-game.js';

// Real Three geometry and world frame loop. Only the GPU and canvas drawing are
// stubbed; actual pixels are checked separately in the running browser.
const globals = ['window', 'document', 'devicePixelRatio', 'requestAnimationFrame', 'cancelAnimationFrame', '__catchRenderer', '__catchCreateWorld'];
const originalGlobals = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let nextFrame, now = performance.now(), baseWorld;
const context = { beginPath() {}, roundRect() {}, arc() {}, fill() {}, stroke() {}, clearRect() {}, fillText() {}, measureText(text) { return { width: text.length * 140 }; } };
globalThis.document = { createElement() { return { getContext() { return { ...context }; } }; } };
globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
globalThis.devicePixelRatio = 1;
globalThis.requestAnimationFrame = callback => { nextFrame = callback; return 1; };
globalThis.cancelAnimationFrame = () => {};
globalThis.__catchRenderer = class {
  constructor() { this.domElement = { remove() {} }; this.shadowMap = {}; }
  setPixelRatio() {} setSize() {} dispose() {}
  render(scene, camera) { scene.updateMatrixWorld(); camera.updateMatrixWorld(); }
};
const worldURL = new URL('../dist/world.js', import.meta.url);
const absoluteImports = (source, url) => source.replace(/from\s*(['"])(\.\/[^'"]+)\1/g, (_, quote, path) => `from '${new URL(path, url).href}'`);
const baseSource = absoluteImports(await readFile(worldURL, 'utf8'), worldURL).replace('new THREE.WebGLRenderer(', 'new globalThis.__catchRenderer(');
const { createWorld } = await import(`data:text/javascript;base64,${Buffer.from(baseSource).toString('base64')}`);
globalThis.__catchCreateWorld = container => { baseWorld = createWorld(container); return baseWorld; };
const catchURL = new URL('../dist/catch-world.js', import.meta.url);
const catchSource = absoluteImports((await readFile(catchURL, 'utf8')).replace("import { createWorld } from './world.js';", 'const createWorld = globalThis.__catchCreateWorld;'), catchURL);
const { createCatchWorld } = await import(`data:text/javascript;base64,${Buffer.from(catchSource).toString('base64')}`);
const world = createCatchWorld({ clientWidth: 1196, clientHeight: 762, appendChild() {} });
const bear = baseWorld.scene.getObjectByName('island-bear'), body = bear.children[0];
const limbs = body.children.filter(o => o.isGroup && o.children.length === 2);
const apple = baseWorld.scene.getObjectByName('falling-letter-fruit');
const label = baseWorld.scene.getObjectByName('fruit-key-label');
const basket = baseWorld.scene.getObjectByName('collected-fruit-basket');
const pos = object => object.getWorldPosition(new THREE.Vector3());
const event = state => ({ code: /^[A-Z]$/.test(state.target) ? `Key${state.target}` : state.target });
const close = (a, b, message) => assert(a.distanceTo(b) < 1e-9, message);
function frame() { now += 20; nextFrame(now); }
function finishFruit(state) {
  while (state.phase !== 'catching' && state.phase !== 'complete') pressCatchKey(state, event(state));
  tickCatchGame(state, 1.35);
}

after(() => {
  world.dispose();
  for (const [key, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

test('catch keeps root, both feet, and both shoulders grounded and attached', () => {
  const state = startCatchGame(createCatchGame());
  world.render(state); frame();
  const origin = pos(bear), feet = [pos(limbs[0]), pos(limbs[2])], shoulders = [pos(limbs[1]), pos(limbs[3])];
  const leftRotation = limbs[1].rotation.clone(), restRight = limbs[3].rotation.clone(), initialFruit = apple.position.clone();
  pressCatchKey(state, event(state));
  world.render(state);
  close(apple.position, initialFruit, 'key press must not teleport the fruit');
  for (let i = 0; i <= 135; i++) {
    state.catchTime = i / 100;
    world.render(state); frame();
    close(pos(bear), origin, 'bear root must not jump or slide');
    close(pos(limbs[0]), feet[0]); close(pos(limbs[2]), feet[1]);
    close(pos(limbs[1]), shoulders[0]); close(pos(limbs[3]), shoulders[1]);
    assert(limbs[1].rotation.equals(leftRotation), 'only one paw reaches');
    assert(Math.abs(limbs[3].rotation.x) <= 1.05, 'avoid the previous 2.35-radian swing');
  }
  assert(limbs[3].rotation.equals(restRight), 'reach smoothly returns to its initial pose');
});

test('fruit enters the paw continuously then passes in front of the torso into the basket', () => {
  const state = startCatchGame(createCatchGame());
  world.render(state); pressCatchKey(state, event(state));
  let previous;
  for (let i = 0; i <= 1080; i++) {
    state.catchTime = i / 1000; world.render(state);
    if (previous) assert(apple.position.distanceTo(previous) < .023, `motion discontinuity at ${state.catchTime}`);
    if (apple.position.x < -5.8 && apple.position.x > -7.6) assert(apple.position.z > 5.7, 'deposit must stay in front of the torso');
    previous = apple.position.clone();
  }
  assert.equal(apple.visible, false);
  assert.equal(basket.userData.count, 1);
  close(apple.position, new THREE.Vector3(-8.7, 1.15, 5.25));
});

test('whole words retain one fruit while individual letters update its real 3D texture', () => {
  const state = startCatchGame(createCatchGame(10));
  world.render(state);
  const initialTarget = getCatchTarget(state), position = apple.position.clone(), texture = label.material.map;
  assert.equal(initialTarget.kind, 'word');
  assert.equal(label.userData.text, 'cat');
  assert.equal(pressCatchKey(state, event(state)).kind, 'letter');
  world.render(state);
  close(apple.position, position);
  assert.equal(label.userData.text, 'cat');
  assert.equal(label.userData.typedPrefix, 'c');
  assert.equal(label.userData.typedCount, 1);
  assert.notEqual(label.material.map, texture);
  assert.equal(basket.userData.count, 0);
  finishFruit(state); world.render(state);
  assert.equal(label.userData.text, '空格');
  assert.equal(basket.userData.count, 1);
  const spacePosition = apple.position.clone(); state.fall = 1; world.render(state);
  close(apple.position, spacePosition, 'space lesson fruit stays still');
  const backspace = startCatchGame(createCatchGame(11)); world.render(backspace);
  assert.equal(label.userData.text, '退格');
});

test('basket counts word groups rather than keys and shows overflow beyond eight fruits', () => {
  const state = startCatchGame(createCatchGame(10));
  while (state.phase !== 'complete') finishFruit(state);
  world.render(state);
  assert.equal(basket.userData.count, 13);
  assert.equal(apple.visible, false);
  assert.equal(basket.children.filter(o => o.name.startsWith('stored-fruit-') && o.visible).length, 8);
  assert.equal(baseWorld.scene.getObjectByName('basket-overflow-count').visible, true);
});

test('paused frames freeze paw, fruit, head and ambient animation', () => {
  const state = startCatchGame(createCatchGame()); world.render(state); pressCatchKey(state, event(state));
  state.catchTime = .22; world.render(state); frame();
  const fruitPosition = apple.position.clone(), limbRotation = limbs[3].rotation.clone();
  const bearRotation = bear.quaternion.clone();
  const head = body.children.find(o => o.isGroup && o.children.length > 10), headRotation = head.rotation.clone();
  state.paused = true; world.render(state);
  const water = []; baseWorld.scene.traverse(o => { if (o.material?.uniforms?.time) water.push(o.material.uniforms.time); });
  const time = water[0].value;
  for (let i = 0; i < 30; i++) { state.catchTime += .03; world.render(state, 1); frame(); }
  close(apple.position, fruitPosition);
  assert(limbs[3].rotation.equals(limbRotation)); assert(bear.quaternion.equals(bearRotation)); assert(head.rotation.equals(headRotation));
  assert.equal(water[0].value, time);
});

test('earned reward props preserve the catch camera and articulated pose', () => {
  const state = startCatchGame(createCatchGame(7)); world.render(state);
  const before = pos(bear), camera = baseWorld.camera.position.clone();
  world.setCompleted([1, 2, 3, 4]); frame();
  close(pos(bear), before); close(baseWorld.camera.position, camera);
  assert.equal(baseWorld.scene.getObjectByName('reward-2-stage-1').visible, true);
  assert.equal(baseWorld.scene.getObjectByName('reward-3-stage-1').visible, true);
  assert.equal(baseWorld.scene.getObjectByName('reward-7-stage-1').visible, false);
});
