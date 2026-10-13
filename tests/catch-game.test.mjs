import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEQUENCE, CATCH_STORAGE_KEY, MAIN_CATCH_STORAGE_KEY, FALL_SECONDS, CATCH_SECONDS,
  createCatchGame, startCatchGame, pressCatchKey, tickCatchGame, setCatchPaused,
  snapshotCatch, restoreCatch, restoreLegacyCatch, getCatchTarget, migrateAdventureCatch,
} from '../dist/catch-game.js';
import {
  STORAGE_KEY, defaultProgress, createAdventure, startAdventure, handleAdventureKey,
  snapshotAdventure, getAccuracy, recordCompletion, validateProgress,
} from '../dist/adventure.js';
import { LEVELS } from '../dist/curriculum.js';

const key = token => ({ code: /^[A-Z]$/.test(token) ? `Key${token}` : token,
  key: token === 'Space' ? ' ' : token?.toLowerCase() });
const roundtrip = state => {
  const saved = snapshotCatch(state);
  assert.equal(saved.version, 2);
  assert.deepEqual(restoreCatch(JSON.parse(JSON.stringify(saved))), state);
  assert.notEqual(restoreCatch(saved), state);
};
const catchOne = state => {
  assert.deepEqual(pressCatchKey(state, key(state.target)), { kind: 'correct' });
  assert.equal(tickCatchGame(state, CATCH_SECONDS), true);
};
const falling = () => {
  const state = startCatchGame(createCatchGame());
  catchOne(state);
  return state;
};
const complete = state => {
  startCatchGame(state);
  while (state.phase !== 'complete') {
    const result = pressCatchKey(state, key(state.target));
    assert.ok(['letter', 'correct'].includes(result.kind));
    if (result.kind === 'correct') assert.equal(tickCatchGame(state, CATCH_SECONDS), true);
  }
  return state;
};

test('mainline and optional legacy storage are independent; exact first curriculum has sixteen fruits', () => {
  assert.equal(new Set([MAIN_CATCH_STORAGE_KEY, CATCH_STORAGE_KEY, STORAGE_KEY]).size, 3);
  assert.deepEqual(SEQUENCE, ['F', 'J', 'F', 'J', 'J', 'F', 'J', 'F']);
  const state = createCatchGame();
  assert.equal(state.sequence.join(''), 'FFFFJJJJFJFJJFJF');
  assert.equal(getCatchTarget(state).fruitTotal, 16);
  roundtrip(state);
  assert.deepEqual(pressCatchKey(state, key('F')), { kind: 'ignored' });
  assert.deepEqual(pressCatchKey(state, { code: 'Enter' }), { kind: 'ignored' });
  assert.equal(tickCatchGame(state, 100), false);
  startCatchGame(state);
  for (let i = 0; i < 16; i += 1) {
    assert.equal(state.index, i);
    assert.equal(state.correct, i);
    assert.equal(state.fruitIndex, i);
    assert.equal(state.target, LEVELS[0].sequence[i]);
    assert.equal(state.phase, [0, 4].includes(i) ? 'intro' : 'falling');
    if ([0, 4].includes(i)) {
      assert.equal(tickCatchGame(state, 1e6), false);
      assert.equal(state.fall, 0);
    }
    roundtrip(state);
    assert.deepEqual(pressCatchKey(state, key(state.target)), { kind: 'correct' });
    assert.equal(state.index, i);
    assert.equal(state.correct, i);
    assert.equal(state.phase, 'catching');
    const pending = structuredClone(state);
    assert.deepEqual(pressCatchKey(state, key(state.target)), { kind: 'ignored' });
    assert.deepEqual(pressCatchKey(state, key('X')), { kind: 'ignored' });
    assert.deepEqual(state, pending);
    assert.equal(tickCatchGame(state, 1), false);
    roundtrip(state);
    assert.equal(tickCatchGame(state, .35), true);
  }
  assert.equal(state.index, 16);
  assert.equal(state.target, null);
  assert.equal(state.phase, 'complete');
  assert.equal(state.complete, true);
  assert.equal(getCatchTarget(state).kind, 'complete');
  roundtrip(state);
  assert.equal(tickCatchGame(state, 1e6), false);
  assert.deepEqual(pressCatchKey(state, key('F')), { kind: 'ignored' });
});

test('all twelve exact curricula complete directly and record rewards, accuracy and mistakes', () => {
  for (const level of LEVELS) {
    const progress = defaultProgress();
    const state = startCatchGame(createCatchGame(level.id, progress));
    assert.deepEqual(state.sequence, level.sequence);
    const wrong = state.target === 'Z' ? 'X' : 'Z';
    pressCatchKey(state, key(wrong));
    assert.equal(getAccuracy(state), 0);
    while (state.phase !== 'complete') {
      roundtrip(state);
      const result = pressCatchKey(state, key(state.target));
      roundtrip(state);
      if (result.kind === 'correct') tickCatchGame(state, CATCH_SECONDS);
      else assert.equal(result.kind, 'letter');
    }
    roundtrip(state);
    assert.equal(state.correct, level.sequence.length);
    assert.equal(state.fruitIndex, getCatchTarget(state).fruitTotal);
    assert.equal(getAccuracy(state), level.sequence.length / (level.sequence.length + 1));
    recordCompletion(progress, state);
    recordCompletion(progress, state);
    assert.equal(progress.completed[level.id].attempts, 1);
    assert.equal(progress.completed[level.id].accuracy, getAccuracy(state));
    assert.ok(validateProgress(progress));
  }
  assert.throws(() => createCatchGame(13), RangeError);
});

test('each new letter first occurrence is stationary, while reviews and later letters fall', () => {
  for (const level of LEVELS.slice(0, 9)) {
    const progress = { ...defaultProgress(), mistakes: { F: 3 } };
    const state = startCatchGame(createCatchGame(level.id, progress));
    const seen = new Set();
    while (state.target) {
      const review = state.index < state.reviewCount;
      const stationary = !review && level.newKeys.includes(state.target) && !seen.has(state.target);
      assert.equal(state.phase, stationary ? 'intro' : 'falling');
      if (!review) seen.add(state.target);
      catchOne(state);
    }
  }
});

test('wrong physical printable keys preserve fruit, target and buffer without restarting its fall', () => {
  const state = falling();
  tickCatchGame(state, 3);
  const initial = structuredClone(state);
  for (const [code, pressed] of [['KeyJ', 'J'], ['Digit4', '4'], ['Period', '.'], ['Space', 'Space'], ['Backspace', 'Backspace'], ['NumpadDivide', '/']]) {
    assert.deepEqual(pressCatchKey(state, { code, key: 'f' }), { kind: 'wrong', pressed, target: 'F' });
    for (const field of ['fall', 'target', 'index', 'phase', 'buffer', 'fruitIndex', 'correct']) assert.equal(state[field], initial[field]);
  }
  assert.equal(state.wrong, 6);
  assert.deepEqual(state.wrongKeys, { F: 6 });
  roundtrip(state);
  assert.deepEqual(pressCatchKey(state, { code: 'KeyF', key: 'ф' }), { kind: 'correct' });
});

test('holds, shortcuts, IME, navigation and Enter are entirely ignored', () => {
  const state = startCatchGame(createCatchGame());
  const before = structuredClone(state);
  const events = [null, {}, ...['repeat', 'ctrlKey', 'altKey', 'metaKey', 'shiftKey', 'isComposing'].map(flag => ({ ...key('F'), [flag]: true })),
    { ...key('F'), keyCode: 229 }, { ...key('F'), which: 229 },
    ...['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Enter', 'NumpadEnter', 'Escape', 'F1'].map(code => ({ code, key: code }))];
  for (const event of events) assert.deepEqual(pressCatchKey(state, event), { kind: 'ignored' });
  assert.deepEqual(state, before);
});

test('nine-second fall lands and waits indefinitely without loss', () => {
  const state = falling();
  assert.equal(FALL_SECONDS, 9);
  assert.equal(tickCatchGame(state, 4.5), false);
  assert.equal(state.fall, .5);
  roundtrip(state);
  assert.equal(tickCatchGame(state, 4.5), true);
  assert.equal(state.phase, 'waiting');
  assert.equal(state.fall, 1);
  roundtrip(state);
  const grounded = structuredClone(state);
  assert.equal(tickCatchGame(state, 1e9), false);
  assert.deepEqual(state, grounded);
  assert.deepEqual(pressCatchKey(state, key('J')), { kind: 'wrong', pressed: 'J', target: 'F' });
  catchOne(state);
  assert.equal(state.index, 2);
  assert.equal(state.phase, 'falling');
  assert.equal(state.fall, 0);
});

test('whole words highlight letters without collecting early or resetting elapsed fall', () => {
  const state = startCatchGame(createCatchGame(10));
  tickCatchGame(state, 3);
  const before = getCatchTarget(state);
  assert.equal(before.fruitLabel, 'cat');
  assert.equal(before.groupStart, 0);
  assert.equal(before.groupEnd, 3);
  assert.equal(before.fruitTotal, 13);
  assert.deepEqual(pressCatchKey(state, key('C')), { kind: 'letter' });
  assert.equal(state.index, 1);
  assert.equal(state.correct, 1);
  assert.equal(state.buffer, 'c');
  assert.equal(state.phase, 'falling');
  assert.equal(state.fall, 1 / 3);
  assert.equal(state.fruitIndex, 0);
  assert.equal(getCatchTarget(state).typedPrefix, 'c');
  assert.equal(getCatchTarget(state).groupIndex, before.groupIndex);
  roundtrip(state);
  assert.equal(pressCatchKey(state, key('X')).kind, 'wrong');
  assert.equal(getCatchTarget(state).typedPrefix, 'c');
  assert.deepEqual(pressCatchKey(state, key('A')), { kind: 'letter' });
  assert.deepEqual(pressCatchKey(state, key('T')), { kind: 'correct' });
  assert.equal(state.index, 2);
  assert.equal(state.correct, 2);
  assert.equal(state.buffer, 'ca');
  assert.equal(getCatchTarget(state).typedPrefix, 'cat');
  assert.equal(getCatchTarget(state).fruitLabel, 'cat');
  roundtrip(state);
  tickCatchGame(state, CATCH_SECONDS);
  assert.equal(state.buffer, 'cat');
  assert.equal(state.index, 3);
  assert.equal(state.fruitIndex, 1);
  assert.equal(state.phase, 'intro');
  assert.equal(getCatchTarget(state).kind, 'space');
  assert.equal(getCatchTarget(state).fruitLabel, '空格');
  assert.equal(tickCatchGame(state, 999), false);
  catchOne(state);
  assert.equal(state.buffer, 'cat ');
  assert.equal(getCatchTarget(state).fruitLabel, 'dog');
  assert.equal(state.fruitIndex, 2);
});

test('Space and Backspace are explicit stationary targets, with catt → cat then coherent text', () => {
  const state = startCatchGame(createCatchGame(11));
  assert.equal(state.buffer, 'catt');
  assert.equal(state.phase, 'intro');
  assert.equal(state.target, 'Backspace');
  assert.equal(getCatchTarget(state).kind, 'backspace');
  assert.equal(getCatchTarget(state).fruitLabel, '退格');
  assert.equal(pressCatchKey(state, key('T')).kind, 'wrong');
  assert.equal(state.buffer, 'catt');
  pressCatchKey(state, key('Backspace'));
  assert.equal(state.buffer, 'catt');
  tickCatchGame(state, CATCH_SECONDS);
  assert.equal(state.buffer, 'cat');
  assert.equal(state.target, 'Space');
  assert.equal(state.phase, 'intro');
  catchOne(state);
  assert.equal(state.buffer, 'cat ');
  assert.equal(state.target, 'D');
  assert.equal(state.phase, 'falling');
  complete(state);
  assert.equal(state.buffer, 'cat dog sun red fox hat map');
  assert.equal(complete(createCatchGame(12)).buffer, 'the sun is warm and we are home');
});

test('reviews remain individual fruits and reset text before a correction lesson', () => {
  const progress = { ...defaultProgress(), mistakes: { F: 1, J: 2, D: 3, K: 4 } };
  const state = startCatchGame(createCatchGame(11, progress));
  assert.deepEqual(state.reviewKeys, ['K', 'K', 'D', 'D', 'J', 'J']);
  assert.equal(state.reviewCount, 6);
  for (let i = 0; i < 6; i += 1) {
    assert.equal(getCatchTarget(state).kind, 'letter');
    assert.equal(getCatchTarget(state).groupEnd - getCatchTarget(state).groupStart, 1);
    assert.equal(state.phase, 'falling');
    catchOne(state);
    roundtrip(state);
  }
  assert.equal(state.buffer, 'catt');
  assert.equal(state.built, 0);
  assert.equal(state.phase, 'intro');
  assert.equal(state.target, 'Backspace');
  complete(state);
  recordCompletion(progress, state);
  assert.deepEqual(progress.mistakes, { F: 1, D: 1, K: 2 });
});

test('pause and refresh preserve a pending catch without repeated key or collection credit', () => {
  let state = setCatchPaused(createCatchGame(10), true);
  startCatchGame(state);
  assert.equal(state.phase, 'ready');
  roundtrip(state);
  setCatchPaused(state, false);
  startCatchGame(state);
  pressCatchKey(state, key('C'));
  pressCatchKey(state, key('A'));
  tickCatchGame(state, 2);
  for (const phase of ['falling', 'catching']) {
    if (phase === 'catching') {
      pressCatchKey(state, key(state.target));
      tickCatchGame(state, .4);
    }
    setCatchPaused(state, true);
    const before = structuredClone(state);
    assert.equal(tickCatchGame(state, 1e6), false);
    assert.deepEqual(pressCatchKey(state, key(state.target)), { kind: 'ignored' });
    assert.deepEqual(state, before);
    roundtrip(state);
    state = restoreCatch(snapshotCatch(state));
    setCatchPaused(state, false);
  }
  assert.equal(state.phase, 'catching');
  assert.equal(state.correct, 2);
  assert.equal(state.catchTime, .4);
  assert.equal(tickCatchGame(state, .96), true);
  assert.equal(state.index, 3);
  assert.equal(state.correct, 3);
  assert.equal(state.fruitIndex, 1);
  assert.equal(state.fall, 0);
  assert.equal(tickCatchGame(state, 1e6), false);
  assert.equal(state.correct, 3);
});

test('invalid deltas never mutate and long frames advance only one fruit', () => {
  const state = falling();
  const before = structuredClone(state);
  for (const dt of [undefined, null, '4', NaN, Infinity, -Infinity, -1, 0]) assert.equal(tickCatchGame(state, dt), false);
  assert.deepEqual(state, before);
  pressCatchKey(state, key('F'));
  assert.equal(tickCatchGame(state, 1e6), true);
  assert.equal(state.index, 2);
  assert.equal(state.fall, 0);
});

test('bridge v1 active migration preserves every prior key and partial whole word', () => {
  for (const level of LEVELS) {
    const progress = { ...defaultProgress(), mistakes: { F: 1 } };
    const old = startAdventure(createAdventure(level.id, progress));
    for (;;) {
      progress.active = snapshotAdventure(old);
      const migrated = migrateAdventureCatch(progress);
      assert.ok(migrated);
      assert.deepEqual(snapshotAdventure(migrated), snapshotAdventure(old));
      assert.equal(migrated.phase, old.target ? 'ready' : 'complete');
      assert.equal(migrated.fruitIndex, getCatchTarget(migrated).fruitIndex);
      roundtrip(migrated);
      if (!old.target) break;
      handleAdventureKey(old, key(old.target));
    }
  }
  assert.equal(migrateAdventureCatch(defaultProgress()), null);
  assert.equal(migrateAdventureCatch({ version: 3 }), null);
});

test('strict snapshots reject missing, extra, corrupt curriculum and unreachable animation values', () => {
  const base = snapshotCatch(createCatchGame());
  for (const field of Object.keys(base)) {
    const partial = { ...base };
    delete partial[field];
    assert.equal(restoreCatch(partial), null, `missing ${field}`);
  }
  const corrupt = [null, undefined, [], 'save', new Date(), { ...base, extra: true },
    { ...base, version: 1 }, { ...base, levelId: 13 }, { ...base, index: -1 }, { ...base, index: 17 }, { ...base, index: .5 },
    { ...base, target: 'J' }, { ...base, target: '__proto__' }, { ...base, phase: 'unknown' },
    { ...base, phase: 'complete' }, { ...base, phase: 'falling' }, { ...base, phase: 'waiting' },
    { ...base, paused: 1 }, { ...base, wrong: -1 }, { ...base, wrong: 1e7 }, { ...base, wrong: .5 },
    { ...base, correct: 1 }, { ...base, wrongKeys: { F: 1 } }, { ...base, buffer: 'a' },
    { ...base, sequence: ['F'] }, { ...base, reviewCount: 1 }, { ...base, fruitIndex: 1 },
    { ...base, fall: NaN }, { ...base, fall: Infinity }, { ...base, fall: -.1 }, { ...base, fall: 1.1 },
    { ...base, catchTime: .1 }, { ...base, catchTime: CATCH_SECONDS }, { ...base, catchTime: NaN },
    { ...base, [Symbol('hidden')]: true }, JSON.parse('{"__proto__":{},"version":2}')];
  for (const value of corrupt) assert.equal(restoreCatch(value), null);
  const fallingSave = snapshotCatch(falling());
  for (const change of [{ phase: 'intro' }, { phase: 'waiting', fall: .5 }, { fall: 1 }, { phase: 'catching', catchTime: 1.35 }]) {
    assert.equal(restoreCatch({ ...fallingSave, ...change }), null);
  }
  const wordSave = snapshotCatch(startCatchGame(createCatchGame(10)));
  assert.equal(restoreCatch({ ...wordSave, phase: 'catching' }), null, 'cannot collect a partial word');
});

test('legacy eight-fruit v1 saves remain readable without becoming mainline rewards', () => {
  const old = { version: 1, index: 8, target: null, phase: 'complete', fall: 0, catchTime: 0, paused: false, wrong: 3 };
  const restored = restoreLegacyCatch(old);
  assert.equal(restored.index, 8);
  assert.equal(restored.wrong, 3);
  assert.equal(restoreCatch(old), null);
  assert.equal(restoreLegacyCatch(snapshotCatch(createCatchGame())), null);
  assert.equal(restoreLegacyCatch({ ...old, index: 16 }), null);
  assert.equal(restoreLegacyCatch({ ...old, extra: true }), null);
  assert.equal(restoreLegacyCatch({ ...old, wrong: -1 }), null);
});
