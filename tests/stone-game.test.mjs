import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STONE_STORAGE_KEY, STONE_KEYS, HOP_SECONDS, ARRIVE_SECONDS,
  createStoneGame, startStoneGame, pressStoneKey, tickStoneGame,
  setStonePaused, snapshotStone, restoreStone,
} from '../dist/stone-game.js';
import { STORAGE_KEY, defaultProgress } from '../dist/adventure.js';
import { CATCH_STORAGE_KEY, MAIN_CATCH_STORAGE_KEY } from '../dist/catch-game.js';

const key = token => ({ code: /^[A-Z]$/.test(token) ? `Key${token}` : token });
const fresh = () => startStoneGame(createStoneGame());
const hop = state => {
  assert.deepEqual(pressStoneKey(state, key(state.target)), { kind: 'correct' });
  assert.equal(tickStoneGame(state, HOP_SECONDS), true);
  return state;
};
const at = index => {
  const state = fresh();
  for (let i = 0; i < index; i += 1) hop(state);
  return state;
};
const roundtrip = state => {
  const saved = snapshotStone(state);
  assert.equal(saved.version, 1);
  assert.deepEqual(restoreStone(saved), state);
  const restored = restoreStone(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(restored, state);
  assert.notEqual(restored, state);
  assert.notEqual(restored, saved);
  return restored;
};

test('one optional eight-stone prototype has independent storage and immutable keys', () => {
  assert.equal(STONE_STORAGE_KEY, 'typing-island-stones-v1');
  assert.equal(new Set([STONE_STORAGE_KEY, STORAGE_KEY, CATCH_STORAGE_KEY, MAIN_CATCH_STORAGE_KEY]).size, 4);
  assert.deepEqual(STONE_KEYS, ['F', 'J', 'F', 'F', 'J', 'F', 'J', 'J']);
  assert.ok(Object.isFrozen(STONE_KEYS));
  assert.equal(HOP_SECONDS, 0.75);
  assert.equal(ARRIVE_SECONDS, 1.8);
  const state = createStoneGame();
  assert.deepEqual(state, { phase: 'ready', index: 0, target: 'F', hopTime: 0, paused: false, wrong: 0 });
  assert.deepEqual(Object.keys(state).sort(), ['phase', 'index', 'target', 'hopTime', 'paused', 'wrong'].sort());
  roundtrip(state);
  assert.notEqual(createStoneGame(), state);
});

test('ready requires explicit start; pausing and repeated starts never reset progress', () => {
  const state = createStoneGame();
  for (const event of [key('F'), key('J'), key('Enter'), key('Space')]) {
    assert.deepEqual(pressStoneKey(state, event), { kind: 'ignored' });
  }
  assert.equal(tickStoneGame(state, 1e6), false);
  const paused = structuredClone(setStonePaused(state, true));
  assert.equal(startStoneGame(state), state);
  assert.deepEqual(state, paused);
  setStonePaused(state, false);
  assert.equal(startStoneGame(state), state);
  assert.equal(state.phase, 'playing');
  hop(state);
  const progressed = structuredClone(state);
  startStoneGame(state);
  assert.deepEqual(state, progressed);
});

test('all eight physical keys land once each, then bank hop and walk finish automatically', () => {
  const state = fresh();
  for (const [index, token] of STONE_KEYS.entries()) {
    assert.equal(state.phase, 'playing');
    assert.equal(state.index, index);
    assert.equal(state.target, token);
    assert.equal(state.hopTime, 0);
    roundtrip(state);
    assert.deepEqual(pressStoneKey(state, key(token)), { kind: 'correct' });
    assert.equal(state.phase, 'hopping');
    assert.equal(state.index, index, 'a correct key is not yet a landed stone');
    assert.equal(state.target, token);
    roundtrip(state);
    assert.equal(tickStoneGame(state, HOP_SECONDS / 2), false);
    assert.equal(state.hopTime, HOP_SECONDS / 2);
    roundtrip(state);
    const inAir = structuredClone(state);
    for (const input of ['F', 'J', 'X', 'Enter']) {
      assert.deepEqual(pressStoneKey(state, key(input)), { kind: 'ignored' });
    }
    assert.deepEqual(state, inAir, 'in-air inputs cannot queue credit or mistakes');
    assert.equal(tickStoneGame(state, HOP_SECONDS / 2), true);
    assert.equal(state.index, index + 1);
    assert.equal(state.target, STONE_KEYS[index + 1] ?? null);
    assert.equal(state.hopTime, 0);
    roundtrip(state);
  }
  assert.equal(state.phase, 'arriving');
  assert.equal(state.index, 8);
  assert.equal(state.target, null);
  const arriving = structuredClone(state);
  for (const token of ['F', 'J', 'X']) assert.deepEqual(pressStoneKey(state, key(token)), { kind: 'ignored' });
  assert.deepEqual(state, arriving);
  assert.equal(tickStoneGame(state, HOP_SECONDS), false);
  assert.equal(state.phase, 'arriving', 'the bank hop is followed by a walk');
  assert.equal(state.hopTime, HOP_SECONDS);
  roundtrip(state);
  assert.equal(tickStoneGame(state, ARRIVE_SECONDS - HOP_SECONDS), true);
  assert.deepEqual(state, { phase: 'complete', index: 8, target: null, hopTime: 0, paused: false, wrong: 0 });
  roundtrip(state);
});

test('wrong keys report the actual physical key and keep the target, position and time', () => {
  const state = at(1);
  const cases = [
    [{ code: 'KeyF', key: 'j' }, 'F'],
    [key('KeyQ'), 'Q'],
    [{ code: 'Digit9', key: '9' }, '9'],
    [{ code: 'Semicolon', key: ';' }, ';'],
    [{ code: 'Space', key: ' ' }, 'Space'],
    [{ code: 'Backspace', key: 'Backspace' }, 'Backspace'],
    [{ code: 'Unidentified', key: 'x' }, 'X'],
    [{ key: '?' }, '?'],
  ];
  for (const [event, pressed] of cases) {
    const before = structuredClone(state);
    assert.deepEqual(pressStoneKey(state, event), { kind: 'wrong', pressed, target: 'J' });
    assert.deepEqual(state, { ...before, wrong: before.wrong + 1 });
    roundtrip(state);
  }
  assert.deepEqual(pressStoneKey(state, { code: 'KeyJ', key: 'f' }), { kind: 'correct' });
  assert.equal(state.index, 1);
  assert.equal(state.wrong, cases.length);
});

test('wrong counters saturate at a safe bounded value and remain restorable', () => {
  const state = fresh();
  state.wrong = 999_999;
  pressStoneKey(state, key('J'));
  pressStoneKey(state, key('J'));
  assert.equal(state.wrong, 1_000_000);
  roundtrip(state);
});

test('repeat, shortcuts, IME and non-input keys cannot start hops or count mistakes', () => {
  const state = fresh();
  const before = structuredClone(state);
  for (const token of ['F', 'J']) {
    for (const flag of ['repeat', 'ctrlKey', 'altKey', 'metaKey', 'shiftKey', 'isComposing']) {
      assert.deepEqual(pressStoneKey(state, { ...key(token), [flag]: true }), { kind: 'ignored' });
    }
    for (const field of ['keyCode', 'which']) {
      assert.deepEqual(pressStoneKey(state, { ...key(token), [field]: 229 }), { kind: 'ignored' });
    }
  }
  for (const event of [null, undefined, {}, { key: 'Process' }, { key: '中' },
    { code: 'Escape' }, { code: 'Tab' }, { code: 'ShiftLeft' }, { code: 'ArrowLeft' },
    { code: 'Enter' }, { code: 'NumpadEnter' }, { key: 'Enter' },
    { code: 'UnusableCode', key: 'f' }]) {
    assert.deepEqual(pressStoneKey(state, event), { kind: 'ignored' });
  }
  assert.deepEqual(state, before);
});

test('physical key fallback supports browsers without a usable code, never overrides known codes', () => {
  for (const event of [{ code: 'KeyF', key: 'a' }, { key: 'f' }, { key: 'F' },
    { code: '', key: 'f' }, { code: 'Unidentified', key: 'f' }]) {
    const state = fresh();
    assert.deepEqual(pressStoneKey(state, event), { kind: 'correct' });
    assert.equal(state.phase, 'hopping');
  }
  const state = fresh();
  assert.deepEqual(pressStoneKey(state, { code: 'KeyA', key: 'f' }), { kind: 'wrong', pressed: 'A', target: 'F' });
  assert.deepEqual(pressStoneKey(state, { code: 'Escape', key: 'f' }), { kind: 'ignored' });
});

test('every ready, resting, hopping, arrival and completed position round-trips paused or live', () => {
  const states = [createStoneGame()];
  for (let index = 0; index < STONE_KEYS.length; index += 1) {
    const resting = at(index);
    states.push(structuredClone(resting));
    pressStoneKey(resting, key(resting.target));
    states.push(structuredClone(resting));
    for (const time of [0.01, HOP_SECONDS / 2, HOP_SECONDS - Number.EPSILON]) {
      states.push({ ...resting, hopTime: time });
    }
  }
  const arriving = at(8);
  for (const time of [0, 0.01, HOP_SECONDS, ARRIVE_SECONDS / 2, ARRIVE_SECONDS - Number.EPSILON]) {
    states.push({ ...arriving, hopTime: time });
  }
  tickStoneGame(arriving, ARRIVE_SECONDS);
  states.push(arriving);
  for (const state of states) {
    for (const paused of [false, true]) roundtrip({ ...state, paused });
  }
});

test('pause freezes keys and elapsed motion through every hop and the final arrival', () => {
  const state = createStoneGame();
  const freeze = () => {
    assert.equal(setStonePaused(state, true), state);
    const frozen = structuredClone(state);
    assert.deepEqual(pressStoneKey(state, key('F')), { kind: 'ignored' });
    assert.deepEqual(pressStoneKey(state, key('X')), { kind: 'ignored' });
    assert.equal(tickStoneGame(state, 1e6), false);
    assert.equal(startStoneGame(state), state);
    assert.deepEqual(state, frozen);
    roundtrip(state);
    setStonePaused(state, false);
  };
  freeze();
  startStoneGame(state);
  for (let index = 0; index < STONE_KEYS.length; index += 1) {
    freeze();
    pressStoneKey(state, key(state.target));
    freeze();
    tickStoneGame(state, HOP_SECONDS / 2);
    freeze();
    assert.equal(tickStoneGame(state, HOP_SECONDS / 2), true);
    assert.equal(state.index, index + 1);
  }
  freeze();
  tickStoneGame(state, HOP_SECONDS);
  freeze();
  tickStoneGame(state, ARRIVE_SECONDS - HOP_SECONDS);
  freeze();
  assert.equal(state.phase, 'complete');
});

test('large dt lands one hop only, including the eighth; no leftover time walks or queues a key', () => {
  const state = fresh();
  pressStoneKey(state, key(state.target));
  assert.equal(tickStoneGame(state, Number.MAX_VALUE), true);
  assert.equal(state.index, 1);
  assert.equal(state.phase, 'playing');
  assert.equal(state.hopTime, 0);
  assert.equal(tickStoneGame(state, Number.MAX_VALUE), false);
  assert.equal(state.index, 1);
  for (let index = 1; index < 7; index += 1) hop(state);
  pressStoneKey(state, key(state.target));
  assert.equal(tickStoneGame(state, Number.MAX_VALUE), true);
  assert.equal(state.phase, 'arriving');
  assert.equal(state.hopTime, 0);
  assert.equal(tickStoneGame(state, ARRIVE_SECONDS / 2), false);
  assert.equal(state.phase, 'arriving');
  assert.equal(tickStoneGame(state, Number.MAX_VALUE), true);
  assert.equal(state.phase, 'complete');
});

test('only animation phases spend valid elapsed time; invalid dt never mutates state', () => {
  const hopping = fresh();
  pressStoneKey(hopping, key(hopping.target));
  const complete = at(8);
  tickStoneGame(complete, ARRIVE_SECONDS);
  for (const state of [createStoneGame(), fresh(), hopping, at(8), complete]) {
    const before = structuredClone(state);
    for (const dt of [undefined, null, NaN, Infinity, -Infinity, 0, -1, '1', {}, true]) {
      assert.equal(tickStoneGame(state, dt), false);
      assert.deepEqual(state, before);
    }
  }
  for (const state of [createStoneGame(), fresh(), complete]) {
    const before = structuredClone(state);
    assert.equal(tickStoneGame(state, 1e6), false);
    assert.deepEqual(state, before, 'waiting never causes a sink, timeout or failure');
  }
});

test('restoring an unfinished hop resumes exact pending credit once, including final arrival', () => {
  for (let index = 0; index < STONE_KEYS.length; index += 1) {
    const state = at(index);
    pressStoneKey(state, key(state.target));
    tickStoneGame(state, HOP_SECONDS / 2);
    const resumed = roundtrip(state);
    setStonePaused(resumed, true);
    tickStoneGame(resumed, 1e6);
    assert.equal(resumed.index, index);
    assert.equal(resumed.hopTime, HOP_SECONDS / 2);
    setStonePaused(resumed, false);
    assert.equal(tickStoneGame(resumed, HOP_SECONDS / 2), true);
    assert.equal(resumed.index, index + 1);
    assert.equal(resumed.phase, index === 7 ? 'arriving' : 'playing');
    assert.equal(resumed.hopTime, 0);
  }
  const state = at(8);
  tickStoneGame(state, HOP_SECONDS);
  const resumed = roundtrip(state);
  assert.equal(tickStoneGame(resumed, ARRIVE_SECONDS - HOP_SECONDS), true);
  assert.equal(resumed.phase, 'complete');
  const done = roundtrip(resumed);
  assert.equal(tickStoneGame(done, 1e6), false);
  assert.deepEqual(done, resumed);
});

test('completion is stable and replay is a fresh independent game without curriculum changes', () => {
  const progress = defaultProgress();
  progress.completed[3] = { correct: 4, wrong: 1 };
  progress.mistakes.F = 2;
  const beforeProgress = structuredClone(progress);
  const completed = at(8);
  tickStoneGame(completed, ARRIVE_SECONDS);
  const before = structuredClone(completed);
  for (const event of [key('F'), key('J'), key('Enter'), key('X')]) {
    assert.deepEqual(pressStoneKey(completed, event), { kind: 'ignored' });
  }
  startStoneGame(completed);
  tickStoneGame(completed, 1e6);
  assert.deepEqual(completed, before);
  const replay = createStoneGame();
  startStoneGame(replay);
  hop(replay);
  assert.equal(replay.index, 1);
  assert.deepEqual(completed, before);
  assert.deepEqual(progress, beforeProgress);
  assert.equal(Object.hasOwn(snapshotStone(completed), 'completed'), false);
});

test('snapshot is a detached canonical value with no accidentally added state fields', () => {
  const state = fresh();
  state.unrelated = { hidden: true };
  const saved = snapshotStone(state);
  assert.deepEqual(Object.keys(saved).sort(), ['version', 'phase', 'index', 'target', 'hopTime', 'paused', 'wrong'].sort());
  saved.index = 5;
  saved.wrong = 9;
  assert.equal(state.index, 0);
  assert.equal(state.wrong, 0);
});

test('restore rejects malformed fields, non-JSON shapes and corrupt version data', () => {
  const saved = snapshotStone(fresh());
  for (const invalid of [null, undefined, false, 1, 'state', [], new Date(),
    Object.create(saved), { ...saved, extra: true }, { ...saved, [Symbol('extra')]: true }]) {
    assert.equal(restoreStone(invalid), null);
  }
  for (const field of Object.keys(saved)) {
    const missing = { ...saved };
    delete missing[field];
    assert.equal(restoreStone(missing), null, `missing ${field}`);
    assert.equal(restoreStone({ ...saved, [field]: undefined }), null, `undefined ${field}`);
  }
  const bad = {
    version: [0, 2, '1', null, true],
    phase: ['', 'waiting', 'falling', 'celebrating', 'complete', 'arriving', null, 0],
    index: [-1, -0, 0.5, 8, 9, NaN, Infinity, '0', null, true],
    target: ['J', '', 'f', 'FJ', null, 1],
    hopTime: [-1, -0, 0.01, NaN, Infinity, '0', null, true],
    paused: [0, 1, '', 'false', null],
    wrong: [-1, -0, 0.5, 1_000_001, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '0', null, false],
  };
  for (const [field, values] of Object.entries(bad)) {
    for (const value of values) assert.equal(restoreStone({ ...saved, [field]: value }), null, `invalid ${field}: ${String(value)}`);
  }
  const accessor = { ...saved };
  Object.defineProperty(accessor, 'index', { enumerable: true, get() { throw new Error('must not read'); } });
  assert.equal(restoreStone(accessor), null);
  const nonEnumerable = { ...saved };
  Object.defineProperty(nonEnumerable, 'index', { value: 0, enumerable: false });
  assert.equal(restoreStone(nonEnumerable), null);
  assert.deepEqual(restoreStone(Object.assign(Object.create(null), saved)), fresh());
  assert.deepEqual(restoreStone(Object.freeze(saved)), fresh());
});

test('restore rejects every unreachable phase/index/time combination and accepts every valid target', () => {
  for (const phase of ['ready', 'playing', 'hopping', 'arriving', 'complete']) {
    for (let index = 0; index <= STONE_KEYS.length; index += 1) {
      const saved = { version: 1, phase, index, target: STONE_KEYS[index] ?? null, hopTime: 0, paused: false, wrong: 0 };
      const reachable = phase === 'ready' ? index === 0 :
        ['playing', 'hopping'].includes(phase) ? index < 8 : index === 8;
      assert.equal(restoreStone(saved) !== null, reachable, `${phase} index ${index}`);
      if (!reachable) continue;
      const animated = phase === 'hopping' || phase === 'arriving';
      const limit = phase === 'hopping' ? HOP_SECONDS : ARRIVE_SECONDS;
      assert.equal(restoreStone({ ...saved, hopTime: 0.1 }) !== null, animated);
      assert.equal(restoreStone({ ...saved, hopTime: limit }), null, `${phase} at elapsed boundary`);
      assert.equal(restoreStone({ ...saved, hopTime: limit + 0.1 }), null);
      assert.equal(restoreStone({ ...saved, wrong: 1 }) !== null, phase !== 'ready');
      assert.equal(restoreStone({ ...saved, target: saved.target === 'F' ? 'J' : 'F' }), null);
    }
  }
});
