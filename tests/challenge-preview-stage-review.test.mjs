import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import { createLegacy as create, press, tick, snapshot, restore, advanceStage, getStageInfo, getRequiredKeys } from '../dist/challenge-test/engine-v3.js';
import { getRiverFrame, sampleRiverPose, RIVER_STONE_RADIUS, RIVER_TOP_Y } from '../dist/challenge-test/river-world.js';
import { getOrchardPlan } from '../dist/challenge-test/orchard-world.js';
import { pairingItemKeys, pairingZoneKeys, samplePairingPose, reconstructPairingContext } from '../dist/challenge-test/pairing-world.js';
import { forestCurrentTask, forestBranchSide } from '../dist/challenge-test/forest-world.js';
import { invitationCardContent, invitationGuestKeys, invitationVisit, sampleInvitationPose } from '../dist/challenge-test/invitation-world.js';

// Independent shortest-path traversal derived from the live task definitions.
// Counts exclude onboarding, optional mistakes, and free post-completion play.
const minimumCounts = [[4,8,12],[3,6,9],[6,12,12],[3,6,8],[4,6,8],[4,6,8],[4,8,8],[4,8,8],[3,6,9],[3,7,10],[7,13,10],[33,9,8]];
const allKeys = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'Space', 'Backspace'];
function nextCorrect(state, reverse = false) {
  const order = values => reverse ? [...values].reverse() : values;
  if (state.mode === 'catch') return state.level === 1 ? state.target : order(state.choices).find(choice => !choice.done)?.key;
  if (state.mode === 'stone') return state.sequence[state.index] || order(state.tasks)[0].key;
  if (state.mode === 'forest') return state.stage === 'select' ? order(state.tasks).find(task => !state.completed.includes(task.id))?.key : state.task.correct;
  if (state.mode === 'room') {
    if (state.stage === 'pick') return order(state.items).find(item => item.goalZone ? state.placements[item.key] !== item.goalZone : !state.placements[item.key])?.key;
    const item = state.items.find(item => item.key === state.held);
    return item.goalZone || order(state.zones).find(zone => Object.values(state.placements).filter(key => key === zone.key).length < zone.capacity)?.key;
  }
  if (state.mode === 'mail' && state.stage === 'select') return order(state.friends).find(friend => !state.arrived.includes(friend.key))?.key;
  return state.target;
}
function roundtrip(state) {
  const saved = snapshot(state), result = restore(JSON.stringify(saved));
  assert.ok(result, `restore ${state.level}/${state.lessonStageIndex}/${state.action?.type || state.stage}`);
  assert.deepEqual(snapshot(result), saved);
  assert.deepEqual(result, state);
  return result;
}
function settle(state, verify = false) {
  if (!state.action) return state;
  if (verify) {
    tick(state, (state.action.duration - state.action.elapsed) / 2);
    const paused = structuredClone(state); paused.paused = true;
    const before = snapshot(paused); tick(paused, 1000); press(paused, 'A');
    assert.deepEqual(snapshot(paused), before);
    roundtrip(paused); roundtrip(state);
  }
  tick(state, 1000);
  if (verify) roundtrip(state);
  return state;
}
function solveRound(state, reverse = false, verify = false) {
  settle(state, verify);
  let safety = 300;
  while (!state.solved && !state.stageReady) {
    assert.ok(safety--, `bounded solvability ${state.level}/${state.lessonStageIndex}`);
    const key = nextCorrect(state, reverse);
    assert.ok(key, `next key ${state.level}/${state.lessonStageIndex}`);
    assert.ok(getRequiredKeys(state).includes(key), `required-key guidance includes ${key}`);
    const oldHistory = state.stageHistory.length;
    assert.equal(advanceStage(state), false, 'cannot advance an unfinished round');
    assert.equal(press(state, key).status, 'accepted', `${state.level}/${state.lessonStageIndex}/${key}`);
    if (state.action) {
      assert.equal(state.stageHistory.length, oldHistory, 'input alone does not finish its visible action');
      assert.equal(state.solved, false);
      assert.equal(state.stageReady, false);
    }
    if (verify) roundtrip(state);
    settle(state, verify);
  }
  return state;
}

for (let level = 1; level <= 12; level++) test(`independent full traversal: level ${level}, three gated rounds, exact minimum inputs and every-action restore`, () => {
  const state = create(level), counts = [];
  for (let stage = 0; stage < 3; stage++) {
    assert.equal(getStageInfo(state).number, stage + 1);
    roundtrip(state);
    const before = state.accepted.length;
    solveRound(state, level % 2 === 0, true);
    counts.push(state.accepted.length - before);
    assert.equal(state.stageHistory.length, stage + 1);
    if (stage < 2) {
      assert.equal(state.solved, false); assert.equal(state.phase, 'stage-ready');
      const boundary = snapshot(state);
      for (const key of allKeys) assert.equal(press(state, key).status, 'ignored');
      tick(state, 1e6); assert.deepEqual(snapshot(state), boundary, 'boundary stays inert until explicit advance');
      assert.equal(advanceStage(state), true);
      assert.equal(advanceStage(state), false, 'a double click cannot skip a round');
      assert.equal(state.lessonStageIndex, stage + 1);
      assert.deepEqual(state.accepted, boundary.state.accepted, 'transition never invents input');
    } else {
      assert.equal(state.solved, true); assert.equal(state.phase, 'complete');
      assert.equal(advanceStage(state), false);
    }
  }
  assert.deepEqual(counts, minimumCounts[level - 1]);
});

test('independent alternate choices cover all 26 letters in real bounded mainline tasks', () => {
  for (const reverse of [false, true]) {
    const letters = new Set();
    for (let level = 1; level <= 9; level++) {
      const state = create(level);
      for (let stage = 0; stage < 3; stage++) { solveRound(state, reverse); if (stage < 2) assert.equal(advanceStage(state), true); }
      state.accepted.filter(key => key.length === 1).forEach(key => letters.add(key));
    }
    assert.equal([...letters].sort().join(''), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  }
});

test('original v1 mid-action fixture preserves all accepted input and pending actions before finishing the new rounds', () => {
  const fixtures = JSON.parse(fs.readFileSync(new URL('./fixtures/preview-v1-mid-action.json', import.meta.url), 'utf8'));
  assert.equal(fixtures.length, 12);
  for (const legacy of fixtures) {
    const state = restore(legacy);
    assert.ok(state, `v1 level ${legacy.state.level}`);
    assert.equal(state.lessonStageIndex, 0);
    assert.deepEqual(state.accepted, legacy.state.accepted);
    assert.deepEqual(state.action, legacy.state.action);
    assert.equal(state.buffer, legacy.state.buffer);
    assert.equal(state.solved, false);
    roundtrip(state);
    for (let stage = 0; stage < 3; stage++) { solveRound(state, false, true); if (stage < 2) assert.equal(advanceStage(state), true); }
    assert.equal(state.accepted.length, minimumCounts[state.level - 1].reduce((sum, n) => sum + n, 0));
    assert.equal(state.solved, true);
  }
});

test('original completed room saves remain restorable after continued free arrangement', () => {
  for (const level of [7, 8]) {
    const old = create(level); solveRound(old);
    const legacy = snapshot(old); legacy.version = legacy.state.version = 1;
    legacy.state.solved = true; legacy.state.phase = 'complete';
    const resumed = restore(legacy); assert.ok(resumed); assert.equal(resumed.legacyCompleted, true);
    const item = resumed.items[0], currentZone = resumed.placements[item.key];
    assert.equal(press(resumed, item.key).status, 'accepted'); settle(resumed); roundtrip(resumed);
    assert.equal(press(resumed, currentZone).status, 'accepted'); settle(resumed); roundtrip(resumed);
    assert.equal(resumed.solved, true); assert.equal(resumed.stageReady, false);
  }
});

test('stage history and boundary corruption cannot skip required rounds', () => {
  const first = create(1); solveRound(first); const boundary = snapshot(first);
  for (const corrupt of [
    s => { s.lessonStageIndex = 1; },
    s => { s.lessonStageIndex = 2; },
    s => { s.stageReady = false; s.solved = true; s.phase = 'complete'; },
    s => { s.stageHistory = []; },
    s => { s.stageHistory[0].accepted = []; },
    s => { s.stageStartAccepted = 1; },
  ]) {
    const saved = structuredClone(boundary); corrupt(saved.state); assert.equal(restore(saved), null);
  }
  advanceStage(first); solveRound(first); advanceStage(first);
  const finalStart = snapshot(first); finalStart.state.stageHistory.pop(); assert.equal(restore(finalStart), null);
});

test('all long river queues survive save and finish only their current round', () => {
  for (const level of [3, 4]) {
    const state = create(level);
    for (let stage = 0; stage < 3; stage++) {
      const sequence = state.sequence || state.tasks[stage % 2].sequence;
      for (const key of sequence) assert.equal(press(state, key).status, 'accepted');
      assert.equal(state.queue.length, sequence.length - 1);
      roundtrip(state); tick(state, 1000); roundtrip(state);
      assert.equal(state.solved, stage === 2);
      assert.equal(state.stageReady, stage !== 2);
      if (stage !== 2) assert.equal(advanceStage(state), true);
    }
  }
});

const vectorNear = (a, b, message) => assert.ok(Math.hypot(...a.map((v, i) => v - b[i])) < 1e-8, `${message}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
test('actual staged river task letters match visible stone geometry and every hop remains continuous across banks', () => {
  for (const level of [3, 4]) for (const reverse of [false, true]) {
    const state = create(level);
    for (let stage = 0; stage < 3; stage++) {
      while (!state.stageReady && !state.solved) {
        const before = sampleRiverPose(state), key = nextCorrect(state, reverse);
        assert.equal(press(state, key).status, 'accepted');
        const frame = getRiverFrame(state);
        assert.equal(frame.path.sequence[frame.index], key);
        vectorNear(sampleRiverPose(state).root, before.root, `level ${level} round ${stage} hop start`);
        const atEnd = sampleRiverPose({ ...state, action: { ...state.action, elapsed: state.action.duration } });
        tick(state, state.action.duration);
        vectorNear(sampleRiverPose(state).root, atEnd.root, `level ${level} round ${stage} hop end`);
      }
      if (stage < 2) assert.equal(advanceStage(state), true);
    }
  }
});

test('dynamic orchard and room helpers agree with current task definitions after every stage transition', () => {
  for (const level of [1, 2, 7, 8]) {
    const state = create(level);
    for (let stage = 0; stage < 3; stage++) {
      if (state.mode === 'catch') {
        const plan = getOrchardPlan(state);
        assert.deepEqual(plan.sequence, state.tasks.map(task => task.key));
        assert.equal(plan.total, state.total);
        for (const choice of state.choices) assert.equal(plan.required[choice.key], choice.needed);
      } else {
        assert.deepEqual(pairingItemKeys(state), state.items.map(item => item.key));
        assert.deepEqual(pairingZoneKeys(state), state.zones.map(zone => zone.key));
        const pose = samplePairingPose(state, reconstructPairingContext(state));
        assert.deepEqual(Object.keys(pose.objects), state.items.map(item => item.key));
        for (const item of state.items) assert.equal(pose.objects[item.key].location, state.placements[item.key] || 'floor');
      }
      solveRound(state);
      if (stage < 2) assert.equal(advanceStage(state), true);
    }
  }
});

test('every forest clue and final collection follow the currently displayed branch', () => {
  const featureSides = { blueMushroom: -1, pond: -1, bridge: -1, hollow: -1, reeds: -1, redFlower: 1, beehive: 1, slope: 1, cabin: 1 };
  for (const level of [5, 6]) {
    const state = create(level);
    for (let stage = 0; stage < 3; stage++) {
      while (!state.stageReady && !state.solved) {
        const task = forestCurrentTask(state);
        if (task.branches) for (const branch of task.branches) assert.equal(forestBranchSide(state, branch.key), featureSides[branch.feature]);
        const key = nextCorrect(state); assert.equal(press(state, key).status, 'accepted');
        if (state.action.type === 'collect') assert.equal(forestBranchSide(state, state.action.key), forestBranchSide(state, state.action.destination), 'collection route matches the accepted clue');
        settle(state);
      }
      if (stage < 2) assert.equal(advanceStage(state), true);
    }
  }
});

test('staged invitation text comes from the active task and arrived friends remain seated during later greetings', () => {
  for (const level of [9, 10, 11, 12]) {
    const state = create(level);
    let previousGuests = [];
    for (let stage = 0; stage < 3; stage++) {
      for (const guest of previousGuests) assert.ok(invitationGuestKeys(state).includes(guest), 'new round retains arrived friends');
      while (!state.stageReady && !state.solved) {
        if (state.mode === 'card') {
          const content = invitationCardContent(state);
          assert.equal(content.target, state.task.target); assert.equal(content.prefix, state.task.prefix); assert.equal(content.buffer, state.buffer);
          if (!state.lockedPrefix) assert.match(content.protectedText, /空白/);
          if (state.target === 'Backspace') assert.match(content.instruction, /Backspace/);
        }
        const key = nextCorrect(state); assert.equal(press(state, key).status, 'accepted');
        if (state.mode === 'mail') {
          const guests = invitationGuestKeys(state), visit = invitationVisit(state);
          if (level === 12 && stage > 0) assert.equal(visit.atPicnic, true);
          if (state.action) {
            for (const fraction of [0, .2, .5, .95, 1]) {
              const pose = sampleInvitationPose({ ...state, action: { ...state.action, elapsed: state.action.duration * fraction } });
              for (const guest of guests) {
                assert.equal(pose.friends[guest].visible, true); assert.equal(pose.friends[guest].seated, true);
                assert.equal(pose.friends[guest].stride, 0, 'already seated guests do not repeat their arrival');
              }
            }
          }
        }
        settle(state);
      }
      if (state.mode === 'mail') previousGuests = invitationGuestKeys(state);
      if (level === 12) assert.equal(previousGuests.length, 3);
      if (stage < 2) assert.equal(advanceStage(state), true);
    }
  }
});

test('real articulated paws fit every dynamically generated staged river stone, including both alternate routes', async () => {
  const saved = new Map(['document', 'window', 'ResizeObserver', '__stageReviewRenderer', '__stageReviewIsland'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const context = { beginPath(){}, roundRect(){}, arc(){}, fill(){}, stroke(){}, clearRect(){}, fillText(){}, moveTo(){}, lineTo(){} };
  globalThis.document = { createElement: () => ({ getContext: () => ({ ...context }) }) };
  globalThis.window = { addEventListener(){}, removeEventListener(){} };
  globalThis.ResizeObserver = undefined;
  globalThis.__stageReviewRenderer = class {
    constructor() { this.domElement = { remove(){} }; this.shadowMap = {}; }
    setPixelRatio(){} setSize(){} dispose(){}
    render(scene, camera) { scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); }
  };
  const imports = (source, url) => source.replace(/from\s*(['"])(\.\.?\/[^'"]+)\1/g, (_, q, path) => `from '${new URL(path, url).href}'`);
  const load = async (name, transform) => {
    const url = new URL(`../dist/challenge-test/${name}`, import.meta.url);
    return import(`data:text/javascript;base64,${Buffer.from(imports(transform(fs.readFileSync(url, 'utf8')), url)).toString('base64')}`);
  };
  let world;
  try {
    const { createCozyIsland } = await load('cozy-island.js', source => source.replace('new THREE.WebGLRenderer(', 'new globalThis.__stageReviewRenderer('));
    let island;
    globalThis.__stageReviewIsland = (container, kind) => (island = createCozyIsland(container, kind));
    const { createRiverWorld } = await load('river-world.js', source => source.replace("import { createCozyIsland } from './cozy-island.js';", 'const createCozyIsland = globalThis.__stageReviewIsland;'));
    world = createRiverWorld({ clientWidth: 1280, clientHeight: 720, appendChild(){} });
    for (const level of [3, 4]) for (const reverse of [false, true]) {
      const state = create(level);
      for (let stage = 0; stage < 3; stage++) {
        while (!state.stageReady && !state.solved) {
          assert.equal(press(state, nextCorrect(state, reverse)).status, 'accepted');
          const frame = getRiverFrame(state), index = frame.index, last = index === frame.path.stones.length - 1;
          const landing = { ...state, action: { ...state.action, elapsed: state.action.duration * (last ? .62 : 1) } };
          world.update(landing, 0);
          const [x, z] = frame.path.stones[index], limit = RIVER_STONE_RADIUS * .94 * Math.cos(Math.PI / 7), theta = .18 + index * .37;
          const stone = island.scene.getObjectByName(`river-${frame.route}-stone-${index + 1}`);
          assert.equal(stone.visible, true); assert.equal(stone.userData.key, state.action.key);
          for (const leg of island.legs) {
            const foot = leg.children[1], vertices = foot.geometry.getAttribute('position'); let low = Infinity;
            for (let i = 0; i < vertices.count; i++) {
              const point = new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(foot.matrixWorld); low = Math.min(low, point.y);
              for (let edge = 0; edge < 7; edge++) {
                const angle = theta + (edge + .5) * Math.PI * 2 / 7;
                assert.ok((point.x - x) * Math.sin(angle) + (point.z - z) * Math.cos(angle) < limit - .002, `paw clips level ${level}, round ${stage}, route ${frame.route}, stone ${index + 1}`);
              }
            }
            assert.ok(Math.abs(low - RIVER_TOP_Y) < 1e-7, 'feet touch the actual stone top');
          }
          settle(state);
        }
        if (stage < 2) assert.equal(advanceStage(state), true);
      }
    }
  } finally {
    world?.destroy();
    for (const [key, descriptor] of saved) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
});
