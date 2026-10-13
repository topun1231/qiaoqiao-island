import test from 'node:test';
import assert from 'node:assert/strict';
import { FINGERS, LEVELS, getFinger, getLevel } from '../dist/curriculum.js';
import {
  STORAGE_KEY, createAdventure, startAdventure, handleAdventureKey,
  setAdventurePaused, resetAdventure, finishAdventure, getAccuracy,
  defaultProgress, getUnlockedLevel, snapshotAdventure, restoreAdventure,
  validateProgress, serializeProgress, loadProgress, saveProgress, recordCompletion,
} from '../dist/adventure.js';

const clone = value => JSON.parse(JSON.stringify(value));
const event = (token, extra = {}) => ({
  key: token === 'Space' ? ' ' : /^[A-Z]$/.test(token) ? token.toLowerCase() : token,
  code: /^[A-Z]$/.test(token) ? `Key${token}` : token,
  ...extra,
});
const press = (state, token = state.target, extra = {}) => handleAdventureKey(state, event(token, extra));
const play = (id = 1, progress = defaultProgress()) => startAdventure(createAdventure(id, progress));
const complete = state => {
  startAdventure(state);
  while (state.target) assert.equal(press(state).kind, 'correct');
  finishAdventure(state);
  return state;
};
const through = count => {
  const progress = defaultProgress();
  for (let id = 1; id <= count; id += 1) recordCompletion(progress, complete(play(id, progress)));
  return progress;
};
function storage(initial = null) {
  const data = new Map(initial === null ? [] : [[STORAGE_KEY, initial]]);
  return {
    data,
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
  };
}

const EXACT = [
  'FFFFJJJJFJFJJFJF',
  'DDDDKKKKDKDKKDKDFJDKFJDK',
  'SSSSLLLLSLSLLSLSFJDKSLDK',
  'AAAAGGGGHHHHAGHAGHFDJKSLAGH',
  'EEEEIIIIEIEIIEIFJDKSLAEHIG',
  'RRUUTTYYRUTYYTURERUIFTJY',
  'QQWWOOPPQWOPPOWQQEWRUITOPY',
  'VVMMBBNNVMBNNBMVVFJMBNTH',
  'CCXXZZCCXZVMBNCXZNBMVCXZX',
  'CAT DOG SUN MAP HAT RED FOX',
  'Backspace DOG SUN RED FOX HAT MAP',
  'THE SUN IS WARM AND WE ARE HOME',
];
const toText = sequence => sequence.map(key => key === 'Space' ? ' ' : key).join('');

test('twelve short lessons preserve the first bridge sequence and exact inputs', () => {
  assert.equal(LEVELS.length, 12);
  LEVELS.forEach((level, index) => {
    assert.equal(level.id, index + 1);
    assert.equal(toText(level.sequence), EXACT[index]);
    assert.ok(level.title && level.subtitle && level.actionLabel);
    assert.ok(level.reward.name && level.reward.icon && level.reward.description);
    assert.ok(level.sequence.length >= (index ? 24 : 16));
    assert.ok(level.sequence.length <= 40);
    assert.equal(getLevel(level.id), level);
    assert.ok(Object.isFrozen(level) && Object.isFrozen(level.sequence));
  });
  assert.equal(LEVELS[10].initialText, 'catt');
  for (const invalid of [0, 13, 1.5, '1', null, NaN]) assert.equal(getLevel(invalid), null);
  assert.throws(() => createAdventure(13), RangeError);
});

test('all 26 letters are taught once and only introduced keys appear in each lesson', () => {
  const introduced = new Set();
  for (const level of LEVELS) {
    for (const key of level.newKeys) {
      assert.ok(!introduced.has(key), `${key} is introduced twice`);
      introduced.add(key);
      assert.ok(level.sequence.includes(key));
    }
    for (const key of level.sequence) assert.ok(introduced.has(key), `${key} is used before introduction`);
  }
  assert.deepEqual([...introduced].filter(key => /^[A-Z]$/.test(key)).sort(), [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']);
  assert.ok(introduced.has('Space') && introduced.has('Backspace'));
});

test('finger map follows standard QWERTY with home returns, a thumb, and right-pinky Backspace', () => {
  const groups = [
    ['QAZ', 'left', 'pinky', 'A'], ['WSX', 'left', 'ring', 'S'],
    ['EDC', 'left', 'middle', 'D'], ['RTFGVB', 'left', 'index', 'F'],
    ['YUHJNM', 'right', 'index', 'J'], ['IK', 'right', 'middle', 'K'],
    ['OL', 'right', 'ring', 'L'], ['P', 'right', 'pinky', ';'],
  ];
  for (const [keys, hand, name, home] of groups) {
    for (const key of keys) {
      const result = getFinger(key);
      assert.equal(result.hand, hand);
      assert.equal(result.finger, name);
      assert.equal(result.home, home);
      assert.ok(result.label && result.returnHint.includes(home));
      assert.equal(result, FINGERS[key]);
    }
  }
  assert.equal(getFinger('Space').finger, 'thumb');
  assert.equal(getFinger('Backspace').hand, 'right');
  assert.equal(getFinger('Backspace').finger, 'pinky');
  assert.match(getFinger('Backspace').returnHint, /回到 ;/);
  for (const invalid of ['constructor', '__proto__', 'FINGER', '', 'f', null]) assert.equal(getFinger(invalid), null);
});

test('state is independent, serializable, and starts only with explicit start/Enter', () => {
  const first = createAdventure();
  const second = createAdventure();
  assert.equal(first.phase, 'ready');
  assert.equal(first.target, 'F');
  assert.equal(first.buffer, '');
  assert.equal(first.correct, 0);
  assert.equal(first.complete, false);
  assert.deepEqual(first, clone(first));
  assert.deepEqual(press(first, 'F'), { kind: 'ignored' });
  assert.equal(first.index, 0);
  assert.deepEqual(press(first, 'Enter'), { kind: 'start' });
  assert.equal(first.phase, 'playing');
  assert.equal(first.index, 0);
  assert.equal(second.phase, 'ready');
  assert.deepEqual(press(first, 'Enter'), { kind: 'ignored' });
  assert.equal(startAdventure(first), first);
  assert.equal(getAccuracy(first), 1);
});

test('all exact inputs complete all twelve lessons, build rewards, and unlock one by one', () => {
  const progress = defaultProgress();
  for (let id = 1; id <= 12; id += 1) {
    assert.equal(getUnlockedLevel(progress), id);
    const state = play(id, progress);
    assert.deepEqual(state.sequence, LEVELS[id - 1].sequence);
    for (let i = 0; i < state.sequence.length; i += 1) {
      assert.equal(state.target, state.sequence[i]);
      const result = press(state);
      assert.equal(result.kind, 'correct');
      assert.equal(state.index, i + 1);
      assert.equal(state.correct, i + 1);
      assert.equal(result.built, id === 1 ? Math.floor((i + 1) / 2) : i + 1);
    }
    assert.equal(state.phase, 'celebrating');
    assert.equal(state.complete, false);
    assert.equal(state.target, null);
    assert.equal(getAccuracy(state), 1);
    assert.equal(finishAdventure(state), state);
    assert.equal(state.phase, 'complete');
    assert.equal(state.complete, true);
    assert.equal(recordCompletion(progress, state), progress);
    assert.deepEqual(progress.completed[id], { accuracy: 1, bestAccuracy: 1, attempts: 1 });
    assert.equal(getUnlockedLevel(progress), Math.min(12, id + 1));
    assert.ok(validateProgress(progress));
  }
  assert.equal(Object.keys(progress.completed).length, 12);
});

test('incorrect recognized keys are gentle retries and do not change text or construction', () => {
  const state = play();
  for (const wrong of ['J', 'Q', 'Space', 'Backspace']) {
    const before = snapshotAdventure(state);
    assert.deepEqual(press(state, wrong), { kind: 'wrong' });
    assert.equal(state.index, before.index);
    assert.equal(state.target, 'F');
    assert.equal(state.buffer, before.buffer);
    assert.equal(state.built, 0);
    assert.equal(state.wrong, before.wrong + 1);
  }
  assert.deepEqual(state.wrongKeys, { F: 4 });
  press(state, 'F');
  assert.equal(state.correct, 1);
  assert.equal(state.buffer, 'f');
  assert.equal(getAccuracy(state), 1 / 5);
});

test('held keys, modifiers, IME events, and unrelated keys never start or score', () => {
  const ignored = [
    { repeat: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true },
    { shiftKey: true }, { isComposing: true }, { keyCode: 229 }, { which: 229 },
  ];
  for (const extra of ignored) {
    const ready = createAdventure();
    assert.deepEqual(press(ready, 'Enter', extra), { kind: 'ignored' });
    assert.equal(ready.phase, 'ready');
    const state = play();
    const before = clone(state);
    assert.deepEqual(press(state, 'F', extra), { kind: 'ignored' });
    assert.deepEqual(state, before);
  }
  const state = play();
  const before = clone(state);
  for (const input of [null, undefined, {}, { key: 1 }, { key: 'Dead' },
    { key: 'Escape', code: 'Escape' }, { key: 'Shift', code: 'ShiftLeft' },
    { key: 'Tab', code: 'Tab' }]) {
    assert.deepEqual(handleAdventureKey(state, input), { kind: 'ignored' });
  }
  assert.deepEqual(state, before);
});

test('physical codes take precedence, with a careful fallback when codes are missing', () => {
  const state = play();
  assert.equal(handleAdventureKey(state, { code: 'KeyJ', key: 'f' }).kind, 'wrong');
  assert.equal(handleAdventureKey(state, { code: 'Digit1', key: 'f' }).kind, 'wrong');
  assert.equal(state.index, 0);
  assert.equal(handleAdventureKey(state, { code: 'KeyF', key: 'ж' }).kind, 'correct');
  assert.equal(handleAdventureKey(state, { key: 'f' }).kind, 'correct');
  assert.equal(handleAdventureKey(state, { code: 'Unidentified', key: 'F' }).kind, 'correct');
  assert.equal(state.index, 3);
});

test('pause and resume preserve progress and do not allow automatic restart', () => {
  const state = play();
  press(state);
  const before = clone(state);
  assert.equal(setAdventurePaused(state, true), state);
  assert.equal(press(state).kind, 'ignored');
  assert.equal(press(state, 'Enter').kind, 'ignored');
  startAdventure(state);
  assert.deepEqual(state, { ...before, paused: true });
  setAdventurePaused(state, false);
  assert.deepEqual(state, before);
  press(state);
  assert.equal(state.index, 2);
  assert.equal(state.built, 1);
});

test('completion waits for the UI animation and respects its pause', () => {
  const state = play();
  finishAdventure(state);
  assert.equal(state.phase, 'playing');
  while (state.target) press(state);
  const before = clone(state);
  assert.equal(press(state, 'F').kind, 'ignored');
  assert.equal(press(state, 'Enter').kind, 'ignored');
  startAdventure(state);
  assert.deepEqual(state, before);
  setAdventurePaused(state, true);
  finishAdventure(state);
  assert.equal(state.phase, 'celebrating');
  assert.equal(state.complete, false);
  setAdventurePaused(state, false);
  finishAdventure(state);
  assert.equal(state.phase, 'complete');
  assert.equal(state.complete, true);
  assert.equal(press(state, 'F').kind, 'ignored');
});

test('Backspace corrects the guided typo, Space inserts a gap, and other backspaces cannot erase', () => {
  const state = play(11);
  assert.equal(state.buffer, 'catt');
  assert.equal(state.target, 'Backspace');
  assert.equal(press(state, 'T').kind, 'wrong');
  assert.equal(state.buffer, 'catt');
  assert.equal(press(state, 'Backspace').kind, 'correct');
  assert.equal(state.buffer, 'cat');
  assert.equal(state.target, 'Space');
  assert.equal(press(state, 'Backspace').kind, 'wrong');
  assert.equal(state.buffer, 'cat');
  assert.equal(handleAdventureKey(state, { key: ' ' }).kind, 'correct');
  assert.equal(state.buffer, 'cat ');
  complete(state);
  assert.equal(state.buffer, 'cat dog sun red fox hat map');
  const phrase = complete(play(12));
  assert.equal(phrase.buffer, 'the sun is warm and we are home');
});

test('accuracy never locks progression; completion aggregates missed target letters only', () => {
  const progress = defaultProgress();
  const state = play();
  for (let i = 0; i < 40; i += 1) press(state, 'J');
  complete(state);
  recordCompletion(progress, state);
  assert.equal(progress.completed[1].accuracy, 16 / 56);
  assert.equal(getUnlockedLevel(progress), 2);
  assert.equal(progress.mistakes.F, 40);
  assert.ok(validateProgress(progress));
  recordCompletion(progress, state);
  assert.equal(progress.completed[1].attempts, 1);
  assert.equal(progress.mistakes.F, 40);
  const later = through(10);
  const correction = play(11, later);
  press(correction, 'T');
  press(correction, 'Backspace');
  press(correction, 'Backspace');
  complete(correction);
  recordCompletion(later, correction);
  assert.deepEqual(later.mistakes, {});
  assert.equal(getUnlockedLevel(later), 12);
});

test('incomplete attempts cannot award completions; freely selected levels can', () => {
  const progress = defaultProgress();
  const state = play();
  press(state);
  assert.equal(recordCompletion(progress, state), progress);
  assert.deepEqual(progress, defaultProgress());
  recordCompletion(progress, complete(play(3)));
  assert.deepEqual(progress.completed, { 3: { accuracy: 1, bestAccuracy: 1, attempts: 1 } });
  assert.ok(validateProgress(progress));
  assert.equal(getUnlockedLevel(progress), 1);
});

test('replay reset clears the attempt, leaves saved rewards, and updates best accuracy', () => {
  const progress = defaultProgress();
  const state = play();
  press(state, 'J');
  complete(state);
  recordCompletion(progress, state);
  const firstAccuracy = progress.completed[1].accuracy;
  setAdventurePaused(state, true);
  assert.equal(resetAdventure(state, progress), state);
  assert.deepEqual(state, createAdventure(1, progress));
  assert.equal(progress.completed[1].attempts, 1);
  complete(state);
  recordCompletion(progress, state);
  assert.deepEqual(progress.completed[1], { accuracy: 1, bestAccuracy: 1, attempts: 2 });
  assert.ok(firstAccuracy < 1);
  resetAdventure(state, progress);
  startAdventure(state);
  press(state, 'J');
  press(state, 'J');
  complete(state);
  recordCompletion(progress, state);
  assert.equal(progress.completed[1].bestAccuracy, 1);
  assert.equal(progress.completed[1].accuracy, 16 / 18);
  assert.equal(progress.completed[1].attempts, 3);
  assert.equal(getUnlockedLevel(progress), 2);
});

test('review is optional, bounded to six, and contains previously learned problematic letters only', () => {
  const progress = through(10);
  progress.mistakes = { F: 9, J: 7, D: 5, K: 3, Z: 100, Q: 1 };
  assert.deepEqual(createAdventure(1, progress).reviewKeys, []);
  assert.deepEqual(createAdventure(2, progress).reviewKeys, ['F', 'F', 'J', 'J']);
  const state = createAdventure(3, progress);
  assert.deepEqual(state.reviewKeys, ['F', 'F', 'J', 'J', 'D', 'D']);
  assert.equal(state.reviewCount, 6);
  assert.deepEqual(state.sequence.slice(6), LEVELS[2].sequence);
  assert.equal(state.sequence.length, LEVELS[2].sequence.length + 6);
  assert.ok(state.reviewKeys.every(key => /^[A-Z]$/.test(key)));
  assert.equal(createAdventure(5, { mistakes: { E: 4, I: 4, Space: 4, Backspace: 4 } }).reviewCount, 0);
});

test('a clean warm-up retires a one-off mistake, while renewed wrongs remain for review', () => {
  const progress = defaultProgress();
  const first = play(1, progress);
  press(first, 'J');
  complete(first);
  recordCompletion(progress, first);
  assert.deepEqual(progress.mistakes, { F: 1 });

  const warmup = play(2, progress);
  assert.deepEqual(warmup.reviewKeys, ['F', 'F']);
  press(warmup);
  press(warmup);
  // Finishing the review is safe practice; mastery is saved with completion.
  recordCompletion(progress, warmup);
  assert.deepEqual(progress.mistakes, { F: 1 });
  complete(warmup);
  recordCompletion(progress, warmup);
  assert.deepEqual(progress.mistakes, {});
  assert.deepEqual(createAdventure(3, progress).reviewKeys, []);
  assert.ok(validateProgress(progress));

  const retryProgress = through(1);
  retryProgress.mistakes = { F: 1 };
  const retryWarmup = play(2, retryProgress);
  press(retryWarmup, 'J');
  complete(retryWarmup);
  recordCompletion(retryProgress, retryWarmup);
  assert.deepEqual(retryProgress.mistakes, { F: 1 });
  assert.deepEqual(createAdventure(3, retryProgress).reviewKeys, ['F', 'F']);
  recordCompletion(retryProgress, retryWarmup);
  assert.deepEqual(retryProgress.mistakes, { F: 1 });
});

test('warm-up mastery reduces larger weights without changing scores or incomplete attempts', () => {
  const progress = through(1);
  progress.mistakes = { F: 5 };
  const state = play(2, progress);
  press(state);
  recordCompletion(progress, state);
  assert.deepEqual(progress.mistakes, { F: 5 });
  resetAdventure(state, progress);
  assert.deepEqual(progress.mistakes, { F: 5 });
  complete(state);
  const accuracy = getAccuracy(state);
  recordCompletion(progress, state);
  assert.deepEqual(progress.mistakes, { F: 3 });
  assert.equal(progress.completed[2].accuracy, accuracy);
  assert.equal(state.wrong, 0);
  assert.ok(validateProgress(progress));
});

test('review presses do not build and reset the text exactly at the lesson boundary', () => {
  const progress = through(10);
  progress.mistakes = { F: 1 };
  const state = play(11, progress);
  assert.equal(state.buffer, 'catt');
  assert.equal(state.reviewCount, 2);
  assert.equal(press(state).built, 0);
  assert.equal(state.buffer, 'cattf');
  assert.equal(press(state).built, 0);
  assert.equal(state.buffer, 'catt');
  assert.equal(state.target, 'Backspace');
  assert.equal(press(state).built, 1);
  assert.equal(state.buffer, 'cat');
  complete(state);
  assert.equal(state.buffer, 'cat dog sun red fox hat map');
  assert.equal(state.built, LEVELS[10].sequence.length);
});

test('save/load uses only its local key, preserves progress, and returns independent data', () => {
  const local = storage();
  assert.deepEqual(loadProgress(local), { progress: defaultProgress(), persistent: true });
  const progress = through(4);
  progress.mistakes = { D: 2, A: 1 };
  const state = play(5, progress);
  press(state, 'F');
  press(state);
  progress.active = snapshotAdventure(state);
  assert.equal(saveProgress(local, progress), true);
  assert.deepEqual([...local.data.keys()], [STORAGE_KEY]);
  const loaded = loadProgress(local);
  assert.equal(loaded.persistent, true);
  assert.deepEqual(loaded.progress, progress);
  assert.notEqual(loaded.progress, progress);
  loaded.progress.completed[1].attempts = 8;
  assert.equal(progress.completed[1].attempts, 1);
  assert.equal(serializeProgress(progress), local.data.get(STORAGE_KEY));
});

test('every saved position of every level restores its exact text, including review and correction', () => {
  const progress = defaultProgress();
  for (let id = 1; id <= 12; id += 1) {
    if (id > 1) progress.mistakes.F = 1;
    const state = play(id, progress);
    for (;;) {
      progress.active = snapshotAdventure(state);
      assert.ok(validateProgress(progress), `level ${id}, index ${state.index}`);
      const persisted = loadProgress(storage(serializeProgress(progress))).progress;
      const restored = restoreAdventure(persisted);
      assert.ok(restored);
      assert.deepEqual(snapshotAdventure(restored), snapshotAdventure(state));
      assert.equal(restored.target, state.target);
      assert.equal(restored.built, state.built);
      assert.equal(restored.paused, false);
      assert.equal(restored.phase, state.target ? 'ready' : 'celebrating');
      if (!state.target) break;
      press(state);
    }
    finishAdventure(state);
    recordCompletion(progress, state);
    assert.equal(progress.active, null);
    assert.equal(restoreAdventure(progress), null);
  }
});

test('snapshots are copies and restored partial games require explicit start', () => {
  const progress = defaultProgress();
  const state = play();
  press(state, 'J');
  press(state);
  const snapshot = snapshotAdventure(state);
  snapshot.sequence[0] = 'Z';
  snapshot.wrongKeys.F = 99;
  assert.equal(state.sequence[0], 'F');
  assert.equal(state.wrongKeys.F, 1);
  progress.active = snapshotAdventure(state);
  const resumed = restoreAdventure(progress);
  assert.equal(resumed.phase, 'ready');
  assert.equal(press(resumed).kind, 'ignored');
  assert.equal(resumed.index, 1);
  assert.equal(press(resumed, 'Enter').kind, 'start');
  assert.equal(press(resumed).kind, 'correct');
  assert.equal(resumed.index, 2);
});

test('unavailable or quota-limited local storage never prevents play', () => {
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const loaded = loadProgress(denied);
  assert.equal(loaded.persistent, false);
  assert.deepEqual(loaded.progress, defaultProgress());
  assert.ok(loaded.error);
  assert.equal(saveProgress(denied, defaultProgress()), false);
  assert.equal(loadProgress({}).persistent, false);
  assert.equal(saveProgress({}, defaultProgress()), false);
  const quota = { getItem() { return null; }, setItem() { throw new Error('quota'); } };
  assert.equal(saveProgress(quota, defaultProgress()), false);
  assert.equal(complete(play(1, loaded.progress)).complete, true);
});

test('corrupt, oversized, wrong-version, prototype, and arbitrary fields are rejected', () => {
  const invalid = [
    '', '{', 'null', '[]', 'true', '0', '"hello"', 'x'.repeat(30001),
    JSON.stringify({ ...defaultProgress(), version: 2 }),
    JSON.stringify({ ...defaultProgress(), active: undefined }),
    JSON.stringify({ ...defaultProgress(), completed: { 13: { accuracy: 1, bestAccuracy: 1, attempts: 1 } } }),
    JSON.stringify({ ...defaultProgress(), completed: { '01': { accuracy: 1, bestAccuracy: 1, attempts: 1 } } }),
    JSON.stringify({ ...defaultProgress(), extra: '<script>alert(1)</script>' }),
    '{"version":1,"completed":{},"mistakes":{"__proto__":1},"active":null}',
    '{"version":1,"completed":{},"mistakes":{},"active":null,"__proto__":{"polluted":true}}',
    '{"version":1,"completed":{},"mistakes":{"constructor":2},"active":null}',
    JSON.stringify({ ...defaultProgress(), mistakes: { F: -1 } }),
    JSON.stringify({ ...defaultProgress(), mistakes: { F: 1.2 } }),
    JSON.stringify({ ...defaultProgress(), mistakes: { F: 0 } }),
    JSON.stringify({ ...defaultProgress(), mistakes: { F: 1000001 } }),
    JSON.stringify({ ...defaultProgress(), mistakes: { Space: 1 } }),
  ];
  for (const raw of invalid) {
    const result = loadProgress(storage(raw));
    assert.equal(result.persistent, true);
    assert.ok(result.error, raw.slice(0, 80));
    assert.deepEqual(result.progress, defaultProgress());
  }
  assert.equal({}.polluted, undefined);
});

test('completion metric ranges and non-plain objects cannot enter storage', () => {
  const good = through(1);
  const badEntries = [
    { accuracy: -0.1 }, { accuracy: 1.1 }, { accuracy: NaN }, { accuracy: Infinity },
    { accuracy: '1' }, { bestAccuracy: 0.5 }, { bestAccuracy: 2 },
    { attempts: 0 }, { attempts: 1.5 }, { attempts: 1000001 }, { surprise: 1 },
  ];
  for (const patch of badEntries) {
    const value = clone(good);
    Object.assign(value.completed[1], patch);
    assert.equal(validateProgress(value), false);
    assert.equal(serializeProgress(value), null);
    assert.equal(saveProgress(storage(), value), false);
  }
  const inherited = Object.create({ active: null });
  Object.assign(inherited, { version: 1, completed: {}, mistakes: {} });
  assert.equal(validateProgress(inherited), false);
  assert.equal(validateProgress({ ...defaultProgress(), completed: new Date() }), false);
});

test('active saves reject injected sequences, mismatched levels, impossible counts/text, and oversized reviews', () => {
  const good = through(2);
  const state = play(3, good);
  press(state, 'F');
  press(state);
  good.active = snapshotAdventure(state);
  const cases = [
    active => { active.sequence[0] = '<script>'; },
    active => { active.sequence.push('F'); },
    active => { active.levelId = 12; },
    active => { active.levelId = '3'; },
    active => { active.index = -1; },
    active => { active.index = 500; },
    active => { active.correct = 2; },
    active => { active.wrong = 0; },
    active => { active.wrongKeys = { Space: 1 }; },
    active => { active.buffer = '<img src=x>'; },
    active => { active.reviewCount = 7; },
    active => { active.paused = true; },
    active => { active.sequence = 'SSSS'; },
  ];
  for (const mutate of cases) {
    const value = clone(good);
    mutate(value.active);
    assert.equal(validateProgress(value), false);
    assert.equal(restoreAdventure(value), null);
    assert.ok(loadProgress(storage(JSON.stringify(value))).error);
  }
  const unknownReview = clone(good);
  unknownReview.active.reviewCount = 1;
  unknownReview.active.sequence.unshift('Z');
  assert.equal(validateProgress(unknownReview), false);
});

test('reset works in the middle of a paused exercise without deleting earlier rewards', () => {
  const progress = through(3);
  const saved = clone(progress);
  const state = play(4, progress);
  press(state);
  press(state, 'Z');
  setAdventurePaused(state, true);
  resetAdventure(state, progress);
  assert.deepEqual(state, createAdventure(4, progress));
  assert.deepEqual(progress, saved);
});


test('all twelve levels can be selected and persisted before any earlier completion', () => {
  for (let id = 1; id <= 12; id += 1) {
    const progress = defaultProgress();
    const state = play(id, progress);
    press(state);
    progress.active = snapshotAdventure(state);
    assert.ok(validateProgress(progress), `freely selected level ${id}`);
    assert.deepEqual(snapshotAdventure(restoreAdventure(progress)), snapshotAdventure(state));
    assert.deepEqual(loadProgress(storage(serializeProgress(progress))).progress, progress);
    complete(state);
    recordCompletion(progress, state);
    assert.deepEqual(Object.keys(progress.completed), [String(id)]);
    assert.ok(validateProgress(progress));
  }
});

test('noncontiguous completions, old v1 rewards, mistakes and active attempts survive together', () => {
  const progress = through(2);
  const earlier = clone(progress.completed);
  progress.mistakes = { F: 3 };
  recordCompletion(progress, complete(play(12, progress)));
  assert.deepEqual(progress.completed[1], earlier[1]);
  assert.deepEqual(progress.completed[2], earlier[2]);
  assert.ok(progress.completed[12]);
  const selected = play(7, progress);
  press(selected);
  progress.active = snapshotAdventure(selected);
  assert.deepEqual(loadProgress(storage(serializeProgress(progress))).progress, progress);
  assert.equal(restoreAdventure(progress).levelId, 7);
});
