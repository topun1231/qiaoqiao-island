import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createLegacy as create, press, tick, snapshot, restore, advanceStage } from '../dist/challenge-test/engine-v3.js';
import { reconstructPairingContext, samplePairingPose } from '../dist/challenge-test/pairing-world.js';
import { blank, validate, STORAGE_KEY } from '../dist/challenge-test/store.js';

const settle = state => { while (state.action) tick(state, state.action.duration - state.action.elapsed); return state; };
const roundtrip = state => {
  const resumed = restore(JSON.stringify(snapshot(state)));
  assert.ok(resumed); assert.deepEqual(resumed, state);
  return resumed;
};
const letter = (state, key) => { assert.equal(press(state, key).status, 'accepted'); settle(state); };
const write = (state, text) => { for (const key of text) assert.equal(press(state, key).status, 'accepted'); };

test('room receives one visible destination during pickup, then carries and places it exactly once', () => {
  const state = create(7);
  assert.equal(press(state, 'Q').status, 'accepted');
  const beforeQueue = roundtrip(state), action = structuredClone(state.action);
  const received = press(state, 'w');
  assert.equal(received.status, 'queued'); assert.equal(received.key, 'W');
  assert.equal(received.pendingKey, 'W'); assert.match(received.message, /已收到 W.*不用再按/);
  assert.deepEqual(state.accepted, ['Q']);
  assert.deepEqual(state.action, action); assert.equal(state.held, null);
  assert.deepEqual(state.placements, {});
  assert.deepEqual(reconstructPairingContext(state), reconstructPairingContext(beforeQueue), 'pending destination must not replay the unfinished pickup during restore');
  for (const extra of ['W', 'P', 'O', 'A']) {
    assert.equal(press(state, extra).status, 'ignored');
    assert.equal(state.pendingKey, 'W'); assert.deepEqual(state.accepted, ['Q']);
    assert.match(state.message, /已收到 W.*这次按键没有加入/);
  }
  const feedback = state.message;
  tick(state, .4); assert.equal(state.message, feedback);
  const resumed = roundtrip(state);
  tick(state, .9); tick(resumed, .9);
  assert.deepEqual(resumed, state);
  assert.equal(state.action.type, 'place'); assert.equal(state.action.key, 'W');
  assert.equal(state.held, 'Q'); assert.equal(state.pendingKey, null);
  assert.deepEqual(state.accepted, ['Q', 'W']); assert.deepEqual(state.placements, {});
  assert.equal(samplePairingPose(state, reconstructPairingContext(state)).stage, 'carrying');
  tick(state, .8); roundtrip(state); assert.deepEqual(state.placements, {});
  settle(state); assert.deepEqual(state.placements, { Q: 'W' });
  assert.equal(state.held, null); assert.deepEqual(state.accepted, ['Q', 'W']);
  roundtrip(state); tick(state, 100); assert.deepEqual(state.accepted, ['Q', 'W']);
});

test('room pending choice remains the child’s choice, including an arrangement that is not a solution', () => {
  const state = create(7, 2);
  press(state, 'Q'); assert.equal(press(state, 'P').status, 'queued');
  settle(state);
  assert.equal(state.placements.Q, 'P'); assert.equal(state.layoutComplete, false);
  assert.deepEqual(state.accepted, ['Q', 'P']); assert.equal(state.solved, false);
});

test('a paused pending destination and its exact action survive repeated save/resume', () => {
  let state = create(8); press(state, 'V'); press(state, 'M'); tick(state, .37);
  state.paused = true;
  const frozen = snapshot(state);
  for (let i = 0; i < 5; i++) { tick(state, 20); press(state, 'N'); state = roundtrip(state); }
  assert.deepEqual(snapshot(state), frozen);
  state.paused = false; tick(state, 100);
  assert.deepEqual(state.accepted, ['V', 'M']); assert.equal(state.placements.V, 'M');
  assert.equal(state.pendingKey, null); roundtrip(state);
});

test('shopping receives only the other already visible needed fruit and never overfills a quota', () => {
  const state = create(2); press(state, 'D');
  assert.equal(press(state, 'D').status, 'ignored', 'the next pear has not appeared while this pear is in flight');
  assert.equal(state.pendingKey, null);
  assert.equal(press(state, 'K').status, 'queued');
  assert.deepEqual(state.accepted, ['D']); assert.deepEqual(state.counts, { D: 0, K: 0 });
  const resumed = roundtrip(state); tick(state, 2.24); tick(resumed, 2.24);
  assert.deepEqual(resumed, state); assert.deepEqual(state.accepted, ['D', 'K']);
  assert.deepEqual(state.counts, { D: 1, K: 1 }); assert.equal(state.step, 2);
  press(state, 'D'); assert.equal(press(state, 'K').status, 'ignored');
  assert.equal(state.pendingKey, null); settle(state);
  assert.equal(state.stageReady, true); assert.deepEqual(state.accepted, ['D', 'K', 'D']);
});

test('a pending final shopping catch stops at the stage boundary and cannot spill into the next stage', () => {
  const state = create(2); letter(state, 'D'); press(state, 'D');
  assert.equal(press(state, 'K').status, 'queued'); tick(state, 100);
  assert.equal(state.phase, 'stage-ready'); assert.equal(state.pendingKey, null);
  assert.equal(state.action, null); assert.deepEqual(state.accepted, ['D', 'D', 'K']);
  assert.equal(press(state, 'D').status, 'ignored');
  assert.equal(advanceStage(state), true);
  assert.equal(state.pendingKey, null); assert.equal(state.action, null); assert.equal(state.step, 0);
  assert.deepEqual(state.accepted, ['D', 'D', 'K']); roundtrip(state);
});

test('pending room placement that completes a stage also waits for explicit stage navigation', () => {
  const state = create(7); press(state, 'Q'); press(state, 'W'); settle(state);
  press(state, 'O'); assert.equal(press(state, 'P').status, 'queued'); tick(state, 100);
  assert.equal(state.stageReady, true); assert.equal(state.pendingKey, null);
  assert.deepEqual(state.accepted, ['Q', 'W', 'O', 'P']);
  assert.equal(press(state, 'Q').status, 'ignored'); assert.equal(advanceStage(state), true);
  assert.equal(state.pendingKey, null); assert.deepEqual(state.placements, {}); roundtrip(state);
});

test('unrevealed forest clues, single fruits, next cards and invitation text are never buffered', () => {
  for (const [level, first, speculative] of [[1, 'F', 'J'], [5, 'E', 'I'], [6, 'T', 'F'], [9, 'C', 'X'], [12, 'C', 'C']]) {
    const state = create(level); press(state, first);
    const action = structuredClone(state.action), accepted = [...state.accepted];
    assert.equal(press(state, speculative).status, 'ignored', `level ${level}`);
    assert.match(state.message, /这次按键没有加入/); assert.equal(state.pendingKey, null);
    assert.deepEqual(state.action, action); assert.deepEqual(state.accepted, accepted);
    settle(state); assert.deepEqual(state.accepted, accepted); roundtrip(state);
  }
  const room = create(7); letter(room, 'Q'); press(room, 'W');
  assert.equal(press(room, 'O').status, 'ignored'); assert.equal(room.pendingKey, null);
  const forest = create(6); letter(forest, 'T'); press(forest, 'F');
  assert.equal(press(forest, 'Y').status, 'ignored'); assert.equal(forest.pendingKey, null);
});

test('wrong keys during movement never reset the current action or already completed work', () => {
  const state = create(5); letter(state, 'E'); press(state, 'I'); tick(state, .35);
  const action = structuredClone(state.action), completed = [...state.completed], accepted = [...state.accepted];
  for (const key of ['Q', 'R', 'I', 'Backspace']) assert.equal(press(state, key).status, 'ignored');
  assert.deepEqual(state.action, action); assert.deepEqual(state.completed, completed); assert.deepEqual(state.accepted, accepted);
  settle(state); assert.equal(state.step, 2); roundtrip(state);
});

test('pending-save validation rejects hidden targets, full fruit quotas and malformed pending data', () => {
  for (const value of ['Q', 'F', 'Space', ['W'], { key: 'W' }, 1, false]) {
    const state = create(7); press(state, 'Q'); const save = snapshot(state); save.state.pendingKey = value;
    assert.equal(restore(save), null);
  }
  for (const [level, first, pending] of [[1, 'F', 'J'], [5, 'E', 'I'], [6, 'T', 'F'], [9, 'C', 'X'], [12, 'C', 'C']]) {
    const state = create(level); press(state, first); const save = snapshot(state); save.state.pendingKey = pending;
    assert.equal(restore(save), null);
  }
  const idle = snapshot(create(7)); idle.state.pendingKey = 'W'; assert.equal(restore(idle), null);
  const fruit = create(2); letter(fruit, 'K'); press(fruit, 'D');
  const full = snapshot(fruit); full.state.pendingKey = 'K'; assert.equal(restore(full), null);
});

test('old v2 in-flight timing remains exact while missing pendingKey defaults safely', () => {
  for (const [level, first, oldDuration] of [[5, 'E', 3.6], [6, 'T', 1.7], [7, 'Q', 1.7], [9, 'C', 1.6], [12, 'C', 2.1]]) {
    const state = create(level); press(state, first); const save = snapshot(state);
    save.state.action.duration = oldDuration; save.state.action.elapsed = oldDuration * .71;
    delete save.state.pendingKey;
    const restored = restore(save); assert.ok(restored); assert.equal(restored.pendingKey, null);
    assert.deepEqual(restored.action, save.state.action); assert.deepEqual(restored.accepted, save.state.accepted);
    settle(restored); assert.deepEqual(restored.accepted, save.state.accepted); roundtrip(restored);
  }
});

test('legacy completed badges and old/current snapshots retain the same storage namespace', () => {
  const legacy = JSON.parse(fs.readFileSync(new URL('./fixtures/preview-v1-complete.json', import.meta.url), 'utf8'));
  const room = create(7); press(room, 'Q'); press(room, 'W');
  const record = { ...blank(), completed: [1, 7, 12], practiced: ['F', 'Q', 'W'], sessions: { 1: legacy[0], 7: snapshot(room), 12: legacy[11] } };
  const kept = validate(record);
  assert.match(STORAGE_KEY, /^qiaoqiao-island-challenge-test-/);
  assert.deepEqual(kept.completed, record.completed); assert.deepEqual(kept.practiced, record.practiced);
  assert.deepEqual(kept.sessions, record.sessions);
  assert.equal(restore(kept.sessions[1]).solved, true); assert.equal(restore(kept.sessions[12]).solved, true);
  assert.equal(restore(kept.sessions[7]).pendingKey, 'W');
});

test('bounded durations preserve every action phase and reduce forest/room waiting without changing tasks', () => {
  const forest = create(5); let walkSeconds = 0, walks = 0;
  for (let stage = 0; stage < 3; stage++) {
    while (!forest.stageReady && !forest.solved) { press(forest, forest.task.correct); assert.equal(forest.action.duration, 2.4); walkSeconds += forest.action.duration; walks++; settle(forest); }
    if (stage < 2) assert.equal(advanceStage(forest), true);
  }
  assert.equal(walks, 18); assert.ok(Math.abs(walkSeconds - 43.2) < 1e-8);
  const room = create(7); press(room, 'Q'); assert.equal(room.action.duration, 1.3);
  for (const [fraction, stage] of [[.3, 'approaching'], [.59, 'grasping'], [.76, 'lifting'], [.94, 'holding']]) {
    assert.equal(samplePairingPose({ ...room, action: { ...room.action, elapsed: room.action.duration * fraction } }).stage, stage);
  }
  settle(room); press(room, 'W'); assert.equal(room.action.duration, 1.6);
  for (const [fraction, stage] of [[.3, 'carrying'], [.75, 'placing'], [.95, 'releasing']]) {
    assert.equal(samplePairingPose({ ...room, action: { ...room.action, elapsed: room.action.duration * fraction } }).stage, stage);
  }
  const invite = create(12); press(invite, 'C'); assert.equal(invite.action.duration, 1.5); settle(invite);
  write(invite, invite.targetText); assert.equal(invite.action.duration, 3.6);
  const greeting = create(12, 1); greeting.picnicGuests = ['C', 'X', 'Z']; letter(greeting, 'C');
  write(greeting, greeting.targetText); assert.equal(greeting.action.duration, 2.2);
  const fold = create(9); press(fold, 'C'); assert.equal(fold.action.duration, 1.1);
});

test('unfinished rooms allow temporary overflow and name the exact extra count and available destination', () => {
  for (const [destination, other, label, otherLabel] of [['W', 'P', '窗边桌', '小架子'], ['P', 'W', '小架子', '窗边桌']]) {
    const state = create(7), zones = structuredClone(state.zones), items = structuredClone(state.items);
    for (const key of ['Q', destination, 'O', destination]) letter(state, key);
    assert.equal(state.message, `${label}多了1件，可拿一件放到${otherLabel}`);
    assert.deepEqual(state.placements, { Q: destination, O: destination });
    assert.deepEqual(state.accepted, ['Q', destination, 'O', destination]);
    assert.deepEqual(state.zones, zones); assert.deepEqual(state.items, items);
    assert.equal(state.solved, false); assert.equal(state.stageReady, false); roundtrip(state);
    letter(state, 'O'); letter(state, other);
    assert.equal(state.stageReady, true); assert.equal(state.layoutComplete, true);
  }
  const state = create(7);
  for (const key of 'QWOP') letter(state, key);
  assert.equal(advanceStage(state), true);
  for (const key of 'QWOWFWDW') letter(state, key);
  assert.equal(state.message, '窗边桌多了2件，可拿一件放到小架子');
  assert.equal(state.solved, false); assert.equal(state.stageReady, false);
  assert.deepEqual(state.placements, { Q: 'W', O: 'W', F: 'W', D: 'W' }); roundtrip(state);
});

test('room 8 overflow feedback includes existing pieces without changing placement credit', () => {
  const state = create(8);
  for (const key of 'VMBM') letter(state, key);
  assert.equal(state.message, '窗边桌多了1件，可拿一件放到小架子');
  assert.deepEqual(state.placements, { F: 'M', D: 'N', V: 'M', B: 'M' });
  assert.deepEqual(state.accepted, ['V', 'M', 'B', 'M']);
  assert.equal(state.layoutComplete, false); roundtrip(state);
  letter(state, 'B'); letter(state, 'N'); assert.equal(state.stageReady, true);
});

test('already completed rooms keep free-arrangement feedback and earned completion during overflow', () => {
  const legacy = JSON.parse(fs.readFileSync(new URL('./fixtures/preview-v1-complete.json', import.meta.url), 'utf8'));
  const state = restore(legacy[6]);
  const history = structuredClone(state.stageHistory);
  letter(state, 'Q'); letter(state, 'W'); letter(state, 'O'); letter(state, 'W');
  assert.equal(state.message, '这是你新的摆法，想怎么整理都可以');
  assert.equal(state.solved, true); assert.equal(state.legacyCompleted, true);
  assert.equal(state.phase, 'complete'); assert.equal(state.layoutComplete, false);
  assert.deepEqual(state.stageHistory, history); roundtrip(state);
});
