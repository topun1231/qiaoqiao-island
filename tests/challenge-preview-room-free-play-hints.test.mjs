import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { create, press, tick, snapshot, restore, advanceStage } from '../dist/challenge-test/engine-v3.js';

class Element {
  constructor(tag = 'div') {
    this.tagName = tag; this.style = {}; this.dataset = {}; this.children = []; this.attributes = {};
    this.classList = { add() {} }; this.clientWidth = 1184; this.clientHeight = 606; this.offsetWidth = 100; this.offsetHeight = 54;
  }
  appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  insertBefore(node, before) { this.children = this.children.filter(child => child !== node); const i = this.children.indexOf(before); this.children.splice(i < 0 ? this.children.length : i, 0, node); node.parentNode = this; return node; }
  setAttribute(key, value) { this.attributes[key] = value; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); }
  getContext() { return new Proxy({}, { get: (object, key) => object[key] ?? (() => {}), set: (object, key, value) => (object[key] = value, true) }); }
}
const find = (node, predicate) => predicate(node) ? node : node.children?.map(child => find(child, predicate)).find(Boolean);
const child = (node, className) => find(node, element => element.className === className);

test('room task destinations remain before completion and disappear throughout solved free play', async () => {
  const globals = ['document', 'window', 'ResizeObserver', 'getComputedStyle', '__roomHintRenderer'];
  const old = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const listeners = new Set(), renderers = [], worlds = [];
  globalThis.document = { createElement: tag => new Element(tag), createElementNS: (_, tag) => new Element(tag) };
  globalThis.window = { addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.getComputedStyle = () => ({ position: 'relative' });
  globalThis.__roomHintRenderer = class {
    constructor() { this.domElement = new Element('canvas'); this.shadowMap = {}; renderers.push(this); }
    setPixelRatio() {} setSize() {} render(scene, camera) { scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); }
    dispose() { this.disposed = true; }
  };
  const base = new URL('../dist/challenge-test/', import.meta.url);
  async function load(name, replacements = {}) {
    let source = await readFile(new URL(name, base), 'utf8');
    source = source.replace(/from\s*(['"])([^'"]+)\1/g, (_, q, path) => `from '${replacements[path] || new URL(path, new URL(name, base)).href}'`)
      .replaceAll('new THREE.WebGLRenderer(', 'new globalThis.__roomHintRenderer(');
    return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  }
  try {
    const room = await load('pairing-room-scene.js');
    const { createPairingWorld } = await import(await load('pairing-world.js', { './pairing-room-scene.js': room }));
    for (const level of [7, 8]) {
      const host = new Element(), world = createPairingWorld(host); worlds.push(world);
      const state = create(level);
      // Reach the challenge through genuine boundaries so restored free play
      // includes the same valid prior-stage history as the live controller.
      while (state.lessonStageIndex < 2) {
        while (!state.stageReady) {
          const key = state.held
            ? state.items.find(item => item.key === state.held).goalZone
            : state.items.find(item => state.placements[item.key] !== item.goalZone).key;
          assert.equal(press(state, key).status, 'accepted'); tick(state, 100);
        }
        assert.equal(advanceStage(state), true);
      }
      const label = key => find(host, node => node.dataset?.key === key);
      const tagline = key => child(label(key), 'pairing-tagline').textContent;
      const verify = () => {
        const before = JSON.stringify(state); world.update(state); assert.equal(JSON.stringify(state), before);
        for (const item of state.items) {
          assert.equal(label(item.key).hidden, false);
          assert.equal(child(label(item.key), 'pairing-name').textContent, item.label);
          assert.equal(find(label(item.key), node => node.tagName === 'kbd').textContent, item.key);
          if (state.solved) assert.doesNotMatch(tagline(item.key), /送到/, `${item.key} must not retain a required destination in free play`);
        }
        for (const zone of state.zones) {
          const count = state.items.filter(item => state.placements[item.key] === zone.key && state.held !== item.key).length;
          assert.equal(label(zone.key).hidden, false);
          assert.equal(child(label(zone.key), 'pairing-count').textContent, state.solved ? `${count}件` : `${count}/${zone.capacity}`);
        }
      };
      verify();
      for (const item of state.items) assert.equal(tagline(item.key), `送到 ${state.zones.find(zone => zone.key === item.goalZone).label} (${item.goalZone})`);
      while (!state.solved) {
        const item = state.items.find(item => state.placements[item.key] !== item.goalZone);
        assert(item); assert.equal(press(state, item.key).status, 'accepted'); tick(state, 100); verify();
        assert.match(tagline(item.key), /已拿起 · 送到/);
        assert.equal(press(state, item.goalZone).status, 'accepted'); tick(state, 100); verify();
      }
      for (const item of state.items) assert.equal(tagline(item.key), '还可以再拿');
      const item = state.items[0], other = state.zones.find(zone => zone.key !== item.goalZone);
      assert.equal(press(state, item.key).status, 'accepted'); tick(state, .7); verify();
      tick(state, 100); verify(); assert.equal(tagline(item.key), '已拿起 · 选位置');
      assert.equal(press(state, other.key).status, 'accepted'); tick(state, .5); verify();
      tick(state, 100); verify(); assert.equal(state.placements[item.key], other.key); assert.equal(state.solved, true);
      assert.equal(tagline(item.key), '还可以再拿');
      const resumed = restore(JSON.stringify(snapshot(state))); assert(resumed); world.update(resumed);
      for (const item of resumed.items) assert.doesNotMatch(tagline(item.key), /送到/);
      // A replay is a fresh task and must regain the explicit destination hints.
      world.update(create(level, 2));
      for (const item of state.items) assert.match(tagline(item.key), /送到/);
      world.destroy(); assert.equal(host.children.length, 0);
    }
    assert.equal(listeners.size, 0); assert(renderers.every(renderer => renderer.disposed));
  } finally {
    worlds.forEach(world => world.destroy());
    for (const [key, descriptor] of old) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
});
