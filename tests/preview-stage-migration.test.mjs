import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createLegacy as create, press, tick, restore, snapshot, advanceStage, getStageInfo, getSpec } from '../dist/preview/engine.js';
import { forestBranchSide } from '../dist/preview/forest-world.js';
import { blank, validate, STORAGE_KEY } from '../dist/preview/store.js';
const fixture = name => JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const mid = fixture('preview-v1-mid-action'), completed = fixture('preview-v1-complete');
const settle = state => { while (state.action) tick(state, state.action.duration - state.action.elapsed); };

for (const original of mid) test(`v1 level ${original.state.level} migrates its actual in-flight task without replay or index mismatch`, () => {
  const resumed = restore(original);
  assert.ok(resumed); assert.equal(resumed.version, 2); assert.equal(resumed.lessonStageIndex, 0);
  assert.match(resumed.migrationNotice, /原来的进度已经保留/);
  for (const [field, value] of Object.entries(original.state)) if (field !== 'version') assert.deepEqual(resumed[field], value, `preserve ${field}`);
  assert.deepEqual(resumed.accepted, original.state.accepted);
  const reloaded = restore(snapshot(resumed)); assert.deepEqual(reloaded, resumed);
  settle(resumed); settle(reloaded); assert.deepEqual(reloaded, resumed);
  assert.deepEqual(resumed.accepted, original.state.accepted, 'committing an existing action never credits it twice');
});
for (const original of completed) test(`v1 completed level ${original.state.level} stays earned after v2 upgrade`, () => {
  const state = restore(original); assert.ok(state);
  assert.equal(state.phase, 'complete'); assert.equal(state.solved, true); assert.equal(state.legacyCompleted, true);
  assert.equal(state.stageReady, false); assert.equal(getStageInfo(state).completed, 3);
  assert.equal(advanceStage(state), false);
  assert.deepEqual(state.accepted, original.state.accepted);
  assert.deepEqual(restore(snapshot(state)), state);
});
test('completed legacy rooms keep earned status and resumable saves after free arrangement', () => {
  for (const level of [7, 8]) {
    const state = restore(completed[level - 1]);
    const item = state.items[0], destination = state.placements[item.key];
    assert.equal(press(state, item.key).status, 'accepted'); settle(state);
    assert.equal(press(state, destination).status, 'accepted'); settle(state);
    assert.equal(state.phase, 'complete'); assert.equal(state.solved, true);
    assert.deepEqual(state.stageHistory, []); assert.deepEqual(restore(snapshot(state)), state);
  }
});
test('existing preview storage retains earned badges, real practiced keys and both snapshot versions', () => {
  const value = { ...blank(), completed: [1, 7, 12], practiced: ['F', 'J', 'Space'], sessions: { 1: mid[0], 2: snapshot(create(2)) }, lastLevel: 2 };
  const kept = validate(value);
  assert.equal(STORAGE_KEY, 'qiaoqiao-island-variety-preview-v1', 'keep the established storage record');
  assert.deepEqual(kept.completed, value.completed); assert.deepEqual(kept.practiced, value.practiced);
  assert.deepEqual(kept.sessions, value.sessions);
});
test('stage statistics reject altered or phantom history credit', () => {
  const state = create(1);
  for (const key of 'FJFJ') { press(state, key); settle(state); }
  const corruptions = [
    saved => { saved.state.stageHistory[0].accepted[0] = 'Z'; },
    saved => { saved.state.stageHistory[0].total = 99; },
    saved => { saved.state.stageReady = false; },
    saved => { saved.state.stageHistory = []; },
    saved => { saved.state.lessonStageIndex = 2; },
    saved => { saved.state.stageStartAccepted = 1; },
    saved => { saved.version = 1; },
  ];
  for (const corrupt of corruptions) { const value = snapshot(state); corrupt(value); assert.equal(restore(value), null); }
  advanceStage(state);
  const value = snapshot(state); value.state.stageStartAccepted = 3; assert.equal(restore(value), null);
});

test('cosmetic stage title updates preserve all semantic progress and normalize only presentation', () => {
  const state = create(1);
  for (const key of state.tasks.map(task => task.key)) { press(state, key); settle(state); }
  advanceStage(state);
  for (const key of state.tasks.map(task => task.key)) { press(state, key); settle(state); }
  const oldCopy = snapshot(state); oldCopy.state.stageHistory[1].title = '换个玩法';
  const resumed = restore(oldCopy); assert.ok(resumed);
  assert.deepEqual(snapshot(resumed), snapshot(state));
  assert.equal(resumed.stageHistory[1].title, '变化练习');
  const invalid = structuredClone(oldCopy); invalid.state.stageHistory[1].index = 2;
  assert.equal(restore(invalid), null, 'copy normalization cannot change the required stage order');
});

test('final forest errands use three distinct landmark clues without changing keys or physical branch alignment', () => {
  const state = create(6, 2);
  const expected = {
    T: { keys: 'JJF', landmarks: ['blueMushroom', 'pond', 'beehive'], sides: [-1, -1, 1] },
    Y: { keys: 'FFJ', landmarks: ['redFlower', 'beehive', 'reeds'], sides: [1, 1, -1] },
  };
  for (const destination of state.tasks) {
    const goals = destination.forks.map(fork => fork.branches.find(branch => branch.key === fork.correct));
    const plan = expected[destination.key];
    assert.equal(destination.forks.map(fork => fork.correct).join(''), plan.keys);
    assert.deepEqual(goals.map(branch => branch.feature), plan.landmarks);
    assert.equal(new Set(goals.map(branch => branch.feature)).size, 3);
    destination.forks.forEach((fork, i) => {
      assert.ok(fork.clue.includes(goals[i].label), 'clue names its actual visible landmark');
      assert.equal(forestBranchSide({ ...state, selected: destination.key, task: fork }, fork.correct, fork), plan.sides[i]);
      assert.deepEqual(fork.branches.map(branch => branch.key).sort(), ['F', 'J']);
    });
  }
});

test('later picnic stages describe greetings and farewell at the picnic instead of another home invitation', () => {
  assert.equal(getSpec(11).title, '邀请朋友来野餐');
  const state = create(12);
  for (let stage = 0; stage < 3; stage++) {
    const purpose = stage === 2 ? '道别' : '问候';
    for (const friend of state.friends) {
      assert.equal(press(state, friend.key).status, 'accepted');
      if (stage) { assert.match(state.message, /野餐垫旁/); assert.ok(state.message.includes(purpose)); assert.doesNotMatch(state.message, /家|门|邀请/); }
      settle(state);
      if (stage) { assert.match(state.message, /朋友身边/); assert.ok(state.message.includes(purpose)); assert.doesNotMatch(state.message, /家|门|邀请/); }
      for (const key of friend.text) {
        assert.equal(press(state, key).status, 'accepted');
        if (stage) assert.doesNotMatch(state.message, /家|门|邀请/);
      }
      if (stage) { assert.ok(state.message.includes(purpose)); assert.match(state.message, /身边的朋友/); }
      settle(state);
      if (stage) { assert.doesNotMatch(state.message, /家|门|邀请/); assert.ok(state.message.includes(purpose)); }
    }
    if (stage < 2) assert.equal(advanceStage(state), true);
  }
  assert.equal(state.solved, true);
});
