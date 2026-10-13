import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEQUENCE, createGame, startGame, handleKey, resetGame, finishWalk, setPaused,
} from '../dist/game.js';

const press = (state, key, extra = {}) => handleKey(state, {
  key: key.toLowerCase(),
  code: key === 'Enter' ? 'Enter' : `Key${key.toUpperCase()}`,
  ...extra,
});
const playing = () => startGame(createGame());

test('initial state is independent and the sequence has 16 keys', () => {
  assert.equal(SEQUENCE, 'FFFFJJJJFJFJJFJF');
  const first = createGame();
  const second = createGame();
  assert.deepEqual(first, {
    phase: 'ready', index: 0, planks: 0, target: 'F', paused: false,
  });
  startGame(first);
  assert.equal(second.phase, 'ready');
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
});

test('Enter starts ready without consuming a typing key', () => {
  const state = createGame();
  press(state, 'F');
  assert.equal(state.phase, 'ready');
  press(state, 'Enter');
  assert.equal(state.phase, 'playing');
  assert.equal(state.index, 0);
  assert.equal(state.planks, 0);
  press(state, 'Enter');
  assert.equal(state.index, 0);
});

test('every correct press advances one position and every pair lays one plank', () => {
  const state = playing();
  [...SEQUENCE].forEach((key, index) => {
    assert.equal(state.target, key);
    assert.equal(press(state, key), state);
    assert.equal(state.index, index + 1);
    assert.equal(state.planks, Math.floor((index + 1) / 2));
    assert.equal(state.target, SEQUENCE[index + 1] ?? null);
    assert.equal(state.phase, index === 15 ? 'walking' : 'playing');
  });
  assert.equal(state.planks, 8);
});

test('wrong keys and unrelated keys leave all state unchanged', () => {
  const state = playing();
  for (let index = 0; index < SEQUENCE.length; index += 1) {
    const before = { ...state };
    press(state, state.target === 'F' ? 'J' : 'F');
    press(state, 'X');
    handleKey(state, { key: ' ', code: 'Space' });
    assert.deepEqual(state, before);
    press(state, state.target);
  }
});

test('repeat keydowns cannot progress or start the game', () => {
  const state = createGame();
  press(state, 'Enter', { repeat: true });
  assert.equal(state.phase, 'ready');
  startGame(state);
  press(state, 'F');
  const before = { ...state };
  for (let i = 0; i < 20; i += 1) press(state, 'F', { repeat: true });
  assert.deepEqual(state, before);
  press(state, 'F', { repeat: false });
  assert.equal(state.index, 2);
});

test('shortcuts and IME events are ignored, including while ready', () => {
  const ignored = [
    { ctrlKey: true }, { metaKey: true }, { altKey: true },
    { isComposing: true }, { keyCode: 229 },
  ];
  for (const extra of ignored) {
    const ready = createGame();
    press(ready, 'Enter', extra);
    assert.equal(ready.phase, 'ready');
    const state = playing();
    const before = { ...state };
    press(state, 'F', extra);
    assert.deepEqual(state, before);
  }
});

test('physical KeyF and KeyJ take precedence over character values', () => {
  const state = playing();
  handleKey(state, { code: 'KeyJ', key: 'f' });
  assert.equal(state.index, 0);
  handleKey(state, { code: 'KeyX', key: 'f' });
  assert.equal(state.index, 0);
  handleKey(state, { code: 'KeyF', key: 'u' });
  assert.equal(state.index, 1);
  press(state, 'F', { shiftKey: true, key: 'F' });
  assert.equal(state.index, 2);
  handleKey(state, { key: 'f' });
  handleKey(state, { code: 'Unidentified', key: 'F' });
  assert.equal(state.index, 4);
  handleKey(state, { code: 'KeyJ', key: 'n' });
  assert.equal(state.index, 5);
});

test('pause and resume preserve progress and require an explicit resume', () => {
  const state = playing();
  [...SEQUENCE.slice(0, 5)].forEach(key => press(state, key));
  const before = { ...state };
  assert.equal(setPaused(state, true), state);
  press(state, 'J');
  press(state, 'Enter');
  startGame(state);
  assert.deepEqual(state, { ...before, paused: true });
  setPaused(state, false);
  assert.deepEqual(state, before);
  press(state, 'J');
  assert.equal(state.index, 6);
  assert.equal(state.planks, 3);
});

test('walking is distinct from completion and ignores further typing', () => {
  const state = playing();
  finishWalk(state);
  assert.equal(state.phase, 'playing');
  [...SEQUENCE].forEach(key => press(state, key));
  assert.equal(state.phase, 'walking');
  const before = { ...state };
  [...SEQUENCE].forEach(key => press(state, key));
  startGame(state);
  assert.deepEqual(state, before);
  setPaused(state, true);
  finishWalk(state);
  assert.equal(state.phase, 'walking');
  setPaused(state, false);
  assert.equal(finishWalk(state), state);
  assert.equal(state.phase, 'complete');
  press(state, 'Enter');
  press(state, 'F');
  assert.equal(state.phase, 'complete');
  assert.equal(state.index, 16);
});

test('reset gives a clean replay after completion or a partial paused game', () => {
  const state = playing();
  [...SEQUENCE].forEach(key => press(state, key));
  finishWalk(state);
  assert.equal(resetGame(state), state);
  assert.deepEqual(state, createGame());
  press(state, 'Enter');
  press(state, 'F');
  setPaused(state, true);
  resetGame(state);
  assert.deepEqual(state, createGame());
  startGame(state);
  [...SEQUENCE].forEach(key => press(state, key));
  finishWalk(state);
  assert.equal(state.phase, 'complete');
  assert.equal(state.planks, 8);
});

test('missing and unrecognized events are harmless', () => {
  const state = playing();
  const before = { ...state };
  for (const event of [undefined, null, {}, { key: 1 }, { key: 'Dead' }]) {
    handleKey(state, event);
  }
  assert.deepEqual(state, before);
});
