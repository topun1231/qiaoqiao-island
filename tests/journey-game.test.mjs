import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../dist/curriculum.js';
import { defaultProgress, recordCompletion, validateProgress } from '../dist/adventure.js';
import {
  JOURNEY_STORAGE_KEY, JOURNEY_SNAPSHOT_VERSION, STONE_BATCH_SIZE,
  STONE_ACTION_SECONDS, ROOM_ACTION_SECONDS, MAIL_ACTION_SECONDS,
  getJourneyLesson, createJourneyGame, startJourneyGame, pressJourneyKey,
  tickJourneyGame, setJourneyPaused, advanceJourneyCheckpoint,
  snapshotJourney, restoreJourney, getJourneyTarget,
} from '../dist/journey-game.js';

const key = token => ({ code: /^[A-Z]$/.test(token) ? `Key${token}` : token });
const roundtrip = state => {
  const snapshot = snapshotJourney(state);
  const restored = restoreJourney(JSON.parse(JSON.stringify(snapshot)));
  assert.deepEqual(restored, state);
  assert.notEqual(restored, state);
  assert.notEqual(restored.sequence, state.sequence);
  assert.notEqual(restored.wrongKeys, state.wrongKeys);
  return restored;
};
const finishAction = state => {
  assert.equal(state.phase, 'acting');
  assert.equal(tickJourneyGame(state, state.actionDuration), true);
};
const enterTask = state => {
  const current = getJourneyLesson(state.levelId).tasks[state.taskIndex];
  const tokens = current.tokens.slice(state.taskChar);
  for (const token of tokens) {
    assert.equal(state.phase, 'playing');
    assert.equal(state.target, token);
    assert.ok(['letter', 'correct', 'space'].includes(pressJourneyKey(state, key(token)).kind));
    roundtrip(state);
  }
};
const complete = state => {
  startJourneyGame(state);
  let guard = 0;
  while (state.phase !== 'complete' && guard++ < 200) {
    roundtrip(state);
    if (state.phase === 'checkpoint') {
      assert.equal(advanceJourneyCheckpoint(state), true);
    } else if (state.phase === 'acting') {
      finishAction(state);
    } else enterTask(state);
  }
  assert.equal(state.phase, 'complete');
  return state;
};
const atCheckpoint = (levelId = 5) => {
  const state = startJourneyGame(createJourneyGame(levelId));
  while (state.phase !== 'checkpoint') {
    enterTask(state);
    finishAction(state);
  }
  return state;
};

test('lesson metadata preserves catch 1–4 and every original stone token 5–9', () => {
  for (let id = 1; id <= 4; id += 1) {
    const lesson = getJourneyLesson(id);
    assert.equal(lesson.mode, 'catch');
    assert.deepEqual(lesson.sequence, LEVELS[id - 1].sequence);
    assert.throws(() => createJourneyGame(id), RangeError);
  }
  for (let id = 5; id <= 9; id += 1) {
    const lesson = getJourneyLesson(id);
    assert.equal(lesson.mode, 'stone');
    assert.deepEqual(lesson.sequence, LEVELS[id - 1].sequence);
    assert.deepEqual(lesson.tasks.flatMap(task => task.tokens), LEVELS[id - 1].sequence);
    assert.equal(lesson.tasks.length, lesson.sequence.length);
    assert.equal(lesson.batchSize, 8);
    assert.ok(lesson.sequence.length > 16);
    assert.ok(Object.isFrozen(lesson) && Object.isFrozen(lesson.tasks) && Object.isFrozen(lesson.tasks[0].tokens));
  }
  assert.equal(getJourneyLesson(0), null);
  assert.equal(getJourneyLesson(13), null);
  assert.equal(getJourneyLesson('5'), null);
  assert.throws(() => createJourneyGame(), RangeError);
  assert.match(JOURNEY_STORAGE_KEY, /journey/);
  assert.equal(JOURNEY_SNAPSHOT_VERSION, 1);
  assert.equal(STONE_BATCH_SIZE, 8);
});

test('room specs require four complete named objects and explicit physical spaces', () => {
  const lesson = getJourneyLesson(10);
  assert.equal(lesson.mode, 'room');
  assert.equal(lesson.actionDuration, ROOM_ACTION_SECONDS);
  assert.deepEqual(lesson.tasks.map(task => task.kind), ['word', 'space', 'word', 'space', 'word', 'space', 'word']);
  assert.deepEqual(lesson.tasks.filter(task => task.kind === 'word').map(task => task.label), ['CUP', 'BOOK', 'HAT', 'BALL']);
  assert.deepEqual(lesson.sequence, ['C', 'U', 'P', 'Space', 'B', 'O', 'O', 'K', 'Space', 'H', 'A', 'T', 'Space', 'B', 'A', 'L', 'L']);
  const fix = getJourneyLesson(11);
  assert.equal(fix.initialText, 'cupp');
  assert.equal(fix.tasks[0].initialText, 'CUPP');
  assert.equal(fix.tasks[0].kind, 'backspace');
  assert.equal(fix.tasks[0].label, 'CUP');
  assert.deepEqual(fix.sequence, ['Backspace', ...lesson.sequence.slice(3)]);
});

test('mail comprises exactly three sentences with every internal physical space', () => {
  const lesson = getJourneyLesson(12);
  assert.equal(lesson.mode, 'mail');
  assert.equal(lesson.actionDuration, MAIL_ACTION_SECONDS);
  assert.deepEqual(lesson.tasks.map(task => task.label), ['hi sam', 'come to my home', 'let us play']);
  assert.deepEqual(lesson.tasks.map(task => task.tokens.filter(token => token === 'Space').length), [1, 3, 2]);
  assert.ok(lesson.tasks.every(task => task.kind === 'sentence'));
});

test('all levels 5–12 finish every task and final animation without skipped or double credit', () => {
  for (let id = 5; id <= 12; id += 1) {
    const state = createJourneyGame(id, { ...defaultProgress(), mistakes: { F: 12 } });
    assert.equal(state.reviewCount, 0);
    assert.deepEqual(state.reviewKeys, []);
    roundtrip(state);
    assert.equal(tickJourneyGame(state, 1e8), false);
    assert.deepEqual(pressJourneyKey(state, key(state.target)), { kind: 'ignored' });
    assert.deepEqual(pressJourneyKey(state, key('Enter')), { kind: 'ignored' });
    complete(state);
    assert.equal(state.index, getJourneyLesson(id).sequence.length);
    assert.equal(state.correct, state.index);
    assert.equal(state.taskIndex, getJourneyLesson(id).tasks.length);
    assert.equal(state.complete, true);
    assert.equal(state.target, null);
    assert.equal(state.actionTime, 0);
    assert.equal(getJourneyTarget(state).kind, 'complete');
    roundtrip(state);
    const before = structuredClone(state);
    assert.equal(tickJourneyGame(state, 1e8), false);
    assert.deepEqual(pressJourneyKey(state, key('Enter')), { kind: 'ignored' });
    assert.equal(advanceJourneyCheckpoint(state), false);
    assert.deepEqual(state, before);
  }
});

test('stone batches remain at most eight, retain curriculum progress and require explicit continuation', () => {
  for (let id = 5; id <= 9; id += 1) {
    const state = startJourneyGame(createJourneyGame(id));
    let checkpoints = 0;
    while (state.phase !== 'complete') {
      const view = getJourneyTarget(state);
      assert.ok(view.batchSize > 0 && view.batchSize <= 8);
      assert.deepEqual(view.batchTasks.map(task => task.label), state.sequence.slice(view.batchStart, view.batchEnd));
      if (state.phase === 'checkpoint') {
        checkpoints += 1;
        assert.equal(view.localIndex, 8);
        assert.equal(state.taskIndex, checkpoints * 8);
        assert.equal(state.correct, checkpoints * 8);
        assert.equal(state.target, null);
        const waiting = structuredClone(state);
        assert.deepEqual(pressJourneyKey(state, key(state.sequence[state.index])), { kind: 'ignored' });
        assert.equal(tickJourneyGame(state, 1e9), false);
        assert.deepEqual(state, waiting);
        roundtrip(state);
        assert.deepEqual(pressJourneyKey(state, key('Enter')), { kind: 'checkpoint' });
        assert.equal(getJourneyTarget(state).localIndex, 0);
        assert.equal(state.index, checkpoints * 8);
      } else {
        enterTask(state);
        finishAction(state);
      }
    }
    assert.equal(checkpoints, Math.floor((state.sequence.length - 1) / 8));
  }
});

test('stone action credits a correct key once and ignores all rapid input while moving', () => {
  const state = startJourneyGame(createJourneyGame(5));
  assert.equal(state.actionDuration, STONE_ACTION_SECONDS);
  assert.deepEqual(pressJourneyKey(state, key('E')), { kind: 'correct' });
  assert.equal(state.index, 1);
  assert.equal(state.correct, 1);
  assert.equal(state.taskIndex, 0);
  assert.equal(state.taskChar, 1);
  assert.equal(state.target, null);
  assert.equal(state.built, 0);
  const moving = structuredClone(state);
  for (const token of ['E', 'I', 'Z', 'Space', 'Backspace', 'Enter']) {
    assert.deepEqual(pressJourneyKey(state, key(token)), { kind: 'ignored' });
  }
  assert.deepEqual(state, moving);
  assert.equal(tickJourneyGame(state, .25), false);
  roundtrip(state);
  assert.equal(tickJourneyGame(state, .5), true);
  assert.equal(state.index, 1);
  assert.equal(state.correct, 1);
  assert.equal(state.taskIndex, 1);
  assert.equal(state.built, 1);
  assert.equal(state.phase, 'playing');
  assert.equal(tickJourneyGame(state, 1e8), false);
});

test('room waits for full word, then full action, then an explicit Space without animation', () => {
  const state = startJourneyGame(createJourneyGame(10));
  assert.deepEqual(pressJourneyKey(state, key('C')), { kind: 'letter' });
  assert.equal(getJourneyTarget(state).typedPrefix, 'C');
  assert.deepEqual(pressJourneyKey(state, key('U')), { kind: 'letter' });
  assert.equal(state.phase, 'playing');
  assert.equal(state.built, 0);
  assert.equal(tickJourneyGame(state, 1e8), false);
  assert.deepEqual(pressJourneyKey(state, key('P')), { kind: 'correct' });
  assert.equal(state.phase, 'acting');
  assert.equal(getJourneyTarget(state).typedPrefix, 'CUP');
  assert.equal(state.taskIndex, 0);
  finishAction(state);
  assert.equal(state.taskIndex, 1);
  assert.equal(state.target, 'Space');
  assert.equal(state.built, 1);
  assert.deepEqual(pressJourneyKey(state, key('B')), { kind: 'wrong', pressed: 'B', target: 'Space' });
  assert.equal(state.index, 3);
  assert.deepEqual(pressJourneyKey(state, key('Space')), { kind: 'space' });
  assert.equal(state.phase, 'playing');
  assert.equal(state.taskIndex, 2);
  assert.equal(state.index, 4);
  assert.equal(state.target, 'B');
  assert.equal(state.buffer, 'cup ');
  roundtrip(state);
  complete(state);
  assert.equal(state.buffer, 'cup book hat ball');
  assert.equal(state.built, 4);
});

test('Backspace lesson begins CUPP and only the intended delete produces CUP', () => {
  const state = startJourneyGame(createJourneyGame(11));
  assert.equal(state.target, 'Backspace');
  assert.equal(state.buffer, 'cupp');
  assert.equal(getJourneyTarget(state).text, 'CUPP');
  for (const token of ['C', 'U', 'P', 'Space']) {
    assert.equal(pressJourneyKey(state, key(token)).kind, 'wrong');
    assert.equal(state.buffer, 'cupp');
  }
  assert.deepEqual(pressJourneyKey(state, key('Backspace')), { kind: 'correct' });
  assert.equal(state.buffer, 'cup');
  assert.equal(getJourneyTarget(state).text, 'CUP');
  assert.equal(getJourneyTarget(state).typedPrefix, 'CUP');
  assert.equal(state.phase, 'acting');
  roundtrip(state);
  assert.equal(pressJourneyKey(state, key('Backspace')).kind, 'ignored');
  finishAction(state);
  assert.equal(state.target, 'Space');
  assert.equal(pressJourneyKey(state, key('Backspace')).kind, 'wrong');
  complete(state);
  assert.equal(state.buffer, 'cup book hat ball');
  assert.equal(state.correct, 15);
  assert.deepEqual(state.wrongKeys, { Backspace: 4, Space: 1 });
});

test('mail delivers only a full sentence; spaces cannot be inferred or skipped', () => {
  const state = startJourneyGame(createJourneyGame(12));
  for (const token of ['H', 'I']) assert.equal(pressJourneyKey(state, key(token)).kind, 'letter');
  assert.equal(getJourneyTarget(state).typedPrefix, 'hi');
  assert.equal(state.target, 'Space');
  assert.equal(pressJourneyKey(state, key('S')).kind, 'wrong');
  assert.equal(state.taskChar, 2);
  assert.equal(pressJourneyKey(state, key('Space')).kind, 'letter');
  assert.equal(getJourneyTarget(state).typedPrefix, 'hi ');
  for (const token of ['S', 'A']) assert.equal(pressJourneyKey(state, key(token)).kind, 'letter');
  assert.equal(state.phase, 'playing');
  assert.equal(state.built, 0);
  assert.equal(pressJourneyKey(state, key('M')).kind, 'correct');
  assert.equal(state.phase, 'acting');
  assert.equal(tickJourneyGame(state, 2.5), false);
  assert.equal(getJourneyTarget(state).actionProgress, .5);
  assert.equal(state.taskIndex, 0);
  finishAction(state);
  assert.equal(state.taskIndex, 1);
  assert.equal(state.built, 1);
  assert.equal(getJourneyTarget(state).label, 'come to my home');
  assert.equal(getJourneyTarget(state).typedPrefix, '');
  complete(state);
  assert.equal(state.built, 3);
});

test('wrong physical printable keys only count retries against the intended target', () => {
  const state = startJourneyGame(createJourneyGame(10));
  const initial = structuredClone(state);
  for (const [code, pressed] of [['KeyX', 'X'], ['Digit4', '4'], ['Period', '.'], ['Space', 'Space'], ['Backspace', 'Backspace'], ['NumpadDivide', '/']]) {
    assert.deepEqual(pressJourneyKey(state, { code, key: 'c' }), { kind: 'wrong', pressed, target: 'C' });
    for (const field of ['index', 'correct', 'buffer', 'taskIndex', 'taskChar', 'target', 'phase', 'actionTime', 'built']) assert.equal(state[field], initial[field]);
  }
  assert.equal(state.wrong, 6);
  assert.deepEqual(state.wrongKeys, { C: 6 });
  roundtrip(state);
  assert.equal(pressJourneyKey(state, { code: 'KeyC', key: 'ф' }).kind, 'letter');
});

test('repeat, shortcuts, modifiers, IME and navigation are ignored in every interactive phase', () => {
  const states = [startJourneyGame(createJourneyGame(5)), startJourneyGame(createJourneyGame(10)), startJourneyGame(createJourneyGame(11)), startJourneyGame(createJourneyGame(12)), atCheckpoint()];
  for (const state of states) {
    const token = state.phase === 'checkpoint' ? 'Enter' : state.target;
    const before = structuredClone(state);
    const events = [null, {}, ...['repeat', 'ctrlKey', 'altKey', 'metaKey', 'shiftKey', 'isComposing'].map(flag => ({ ...key(token), [flag]: true })),
      { ...key(token), keyCode: 229 }, { ...key(token), which: 229 },
      ...['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Escape', 'F1'].map(code => ({ code, key: code }))];
    if (state.phase !== 'checkpoint') events.push(key('Enter'), key('NumpadEnter'));
    for (const event of events) assert.deepEqual(pressJourneyKey(state, event), { kind: 'ignored' });
    assert.deepEqual(state, before);
  }
});

test('pause freezes input, action time, starts and checkpoints, including after reload', () => {
  const ready = setJourneyPaused(createJourneyGame(5), true);
  startJourneyGame(ready);
  assert.equal(ready.phase, 'ready');
  const acting = startJourneyGame(createJourneyGame(12));
  enterTask(acting);
  tickJourneyGame(acting, 1.25);
  const checkpoint = atCheckpoint();
  for (const state of [ready, acting, checkpoint]) {
    setJourneyPaused(state, true);
    const saved = roundtrip(state);
    const before = structuredClone(saved);
    assert.equal(tickJourneyGame(saved, 10000), false);
    assert.equal(advanceJourneyCheckpoint(saved), false);
    assert.equal(pressJourneyKey(saved, key('Enter')).kind, 'ignored');
    assert.equal(pressJourneyKey(saved, key('H')).kind, 'ignored');
    assert.deepEqual(saved, before);
    setJourneyPaused(saved, false);
    if (saved.phase === 'acting') {
      assert.equal(tickJourneyGame(saved, 3.75), true);
      assert.equal(saved.taskIndex, 1);
      assert.equal(saved.index, 6);
    } else if (saved.phase === 'checkpoint') assert.equal(advanceJourneyCheckpoint(saved), true);
    else assert.equal(startJourneyGame(saved).phase, 'playing');
  }
});

test('invalid tick times cannot move, duplicate credit or auto-enter another task', () => {
  const state = startJourneyGame(createJourneyGame(5));
  enterTask(state);
  const before = structuredClone(state);
  for (const dt of [NaN, Infinity, -Infinity, 0, -1, undefined, null, '1']) assert.equal(tickJourneyGame(state, dt), false);
  assert.deepEqual(state, before);
  assert.equal(tickJourneyGame(state, 1e100), true);
  assert.equal(state.phase, 'playing');
  assert.equal(state.index, 1);
  assert.equal(state.taskIndex, 1);
  assert.equal(state.actionTime, 0);
});

test('mid-letter and mid-action restore use canonical accepted index without double awards', () => {
  let state = startJourneyGame(createJourneyGame(10));
  pressJourneyKey(state, key('C'));
  state = roundtrip(state);
  assert.equal(state.index, 1);
  assert.equal(state.target, 'U');
  pressJourneyKey(state, key('U'));
  state = roundtrip(state);
  pressJourneyKey(state, key('P'));
  tickJourneyGame(state, 1);
  state = roundtrip(state);
  assert.equal(state.index, 3);
  assert.equal(state.taskChar, 3);
  assert.equal(state.actionTime, 1);
  assert.equal(pressJourneyKey(state, key('P')).kind, 'ignored');
  finishAction(state);
  assert.equal(state.index, 3);
  assert.equal(state.correct, 3);
  assert.equal(state.target, 'Space');
  state = roundtrip(state);
  pressJourneyKey(state, key('Space'));
  assert.equal(state.index, 4);
  complete(state);
  assert.equal(state.correct, 17);
});

test('stone completion remains compatible with shared reward and mistake recording', () => {
  for (let id = 5; id <= 9; id += 1) {
    const progress = defaultProgress();
    const state = startJourneyGame(createJourneyGame(id, progress));
    pressJourneyKey(state, key('Z'));
    complete(state);
    recordCompletion(progress, state);
    recordCompletion(progress, state);
    assert.equal(progress.completed[id].attempts, 1);
    assert.equal(progress.completed[id].accuracy, state.correct / (state.correct + 1));
    assert.equal(progress.mistakes[state.sequence[0]], 1);
    assert.equal(validateProgress(progress), true);
  }
});

test('restore rejects malformed, non-finite, cross-lesson, modified sequence and impossible credit', () => {
  const base = snapshotJourney(startJourneyGame(createJourneyGame(10)));
  const corruptions = [
    { version: 0 }, { signature: '' }, { levelId: 11 }, { mode: 'stone' }, { phase: 'hopping' },
    { index: 1 }, { correct: 1 }, { index: -0 }, { correct: -0 }, { taskIndex: -1 }, { taskIndex: 7 },
    { taskChar: 1 }, { taskChar: NaN }, { actionTime: NaN }, { actionTime: Infinity }, { actionTime: -0 },
    { actionTime: 1 }, { actionDuration: 1 }, { paused: 1 }, { complete: true }, { buffer: 'C' },
    { built: 1 }, { wrong: -1 }, { wrong: Infinity }, { wrong: 1 }, { wrongKeys: { Z: 1 }, wrong: 1 },
    { wrongKeys: { C: 0 } }, { reviewCount: 1 }, { reviewCount: -0 }, { reviewKeys: ['F'] },
    { sequence: [...base.sequence].reverse() }, { sequence: [...base.sequence, 'C'] },
    { phase: 'checkpoint' }, { phase: 'complete' }, { target: null }, { extra: 1 },
  ];
  for (const change of corruptions) assert.equal(restoreJourney({ ...base, ...change }), null, JSON.stringify(change));
  for (const value of [null, [], 'save', 1, {}, Object.create({ ...base })]) assert.equal(restoreJourney(value), null);
  const missing = { ...base };
  delete missing.index;
  assert.equal(restoreJourney(missing), null);
  const wrongVersion = { ...base, version: JOURNEY_SNAPSHOT_VERSION + 1 };
  assert.equal(restoreJourney(wrongVersion), null);
  const altered = { ...base, sequence: [...base.sequence] };
  altered.sequence[0] = 'X';
  assert.equal(restoreJourney(altered), null);
});

test('restore validates every task boundary, animation range and last-task completion', () => {
  const state = startJourneyGame(createJourneyGame(10));
  enterTask(state);
  const acting = snapshotJourney(state);
  for (const change of [
    { phase: 'playing' }, { phase: 'complete' }, { taskChar: 2 }, { index: 2, correct: 2 },
    { actionTime: state.actionDuration }, { actionTime: -1 }, { target: 'Space' }, { built: 1 },
  ]) assert.equal(restoreJourney({ ...acting, ...change }), null);
  finishAction(state);
  const separator = snapshotJourney(state);
  assert.equal(restoreJourney({ ...separator, phase: 'acting', taskChar: 1, index: 4, correct: 4, target: null, buffer: 'cup ' }), null);
  const checkpoint = snapshotJourney(atCheckpoint());
  assert.equal(restoreJourney({ ...checkpoint, taskChar: 1 }), null);
  assert.equal(restoreJourney({ ...checkpoint, target: checkpoint.sequence[checkpoint.index] }), null);
  const done = snapshotJourney(complete(createJourneyGame(12)));
  assert.equal(restoreJourney({ ...done, phase: 'playing' }), null);
  assert.equal(restoreJourney({ ...done, complete: false }), null);
  assert.equal(restoreJourney({ ...done, actionTime: 1 }), null);
});

test('snapshots are isolated copies and restore rejects accessors, sparse arrays and extra symbols', () => {
  const state = startJourneyGame(createJourneyGame(5));
  pressJourneyKey(state, key('X'));
  const snapshot = snapshotJourney(state);
  snapshot.sequence[0] = 'Z';
  snapshot.wrongKeys.E = 88;
  assert.equal(state.sequence[0], 'E');
  assert.equal(state.wrongKeys.E, 1);
  const good = snapshotJourney(state);
  const withGetter = { ...good };
  Object.defineProperty(withGetter, 'index', { enumerable: true, get() { throw new Error('never read'); } });
  assert.equal(restoreJourney(withGetter), null);
  assert.equal(restoreJourney({ ...good, [Symbol('extra')]: 1 }), null);
  const sparse = { ...good, sequence: [...good.sequence] };
  delete sparse.sequence[2];
  assert.equal(restoreJourney(sparse), null);
  const arrayExtra = { ...good, sequence: [...good.sequence] };
  arrayExtra.sequence.extra = 1;
  assert.equal(restoreJourney(arrayExtra), null);
  const wrongGetter = { ...good, wrongKeys: {} };
  Object.defineProperty(wrongGetter.wrongKeys, 'E', { enumerable: true, get() { throw new Error('never read'); } });
  assert.equal(restoreJourney(wrongGetter), null);
});
