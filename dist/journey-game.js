import { physicalKey } from './adventure.js';
import { getLevel } from './curriculum.js';

// A separate save leaves both the old curriculum attempt and prototypes intact.
export const JOURNEY_STORAGE_KEY = 'typing-island-main-journey-v1';
export const JOURNEY_SNAPSHOT_VERSION = 1;
export const STONE_BATCH_SIZE = 8;
export const STONE_ACTION_SECONDS = 0.75;
export const ROOM_ACTION_SECONDS = 8;
export const MAIL_ACTION_SECONDS = 5;
const MAX_WRONG = 1_000_000;
const STATE_FIELDS = [
  'levelId', 'mode', 'phase', 'index', 'correct', 'wrong', 'wrongKeys',
  'sequence', 'reviewCount', 'reviewKeys', 'buffer', 'taskIndex', 'taskChar',
  'target', 'actionTime', 'actionDuration', 'paused', 'complete', 'built',
];
const SNAPSHOT_FIELDS = ['version', 'signature', ...STATE_FIELDS];
const letters = text => [...text].map(letter => letter === ' ' ? 'Space' : letter.toUpperCase());
const task = value => Object.freeze({ ...value, tokens: Object.freeze([...value.tokens]) });
const objects = Object.freeze([
  { label: 'CUP', objectId: 'cup', destination: 'table' },
  { label: 'BOOK', objectId: 'book', destination: 'shelf' },
  { label: 'HAT', objectId: 'hat', destination: 'hook' },
  { label: 'BALL', objectId: 'ball', destination: 'basket' },
]);
const lessonCache = new Map();

/** Scene-specific tasks; the early catch lessons and every stone key are intact. */
export function getJourneyLesson(levelId) {
  const base = getLevel(levelId);
  if (!base) return null;
  if (lessonCache.has(levelId)) return lessonCache.get(levelId);
  const mode = levelId <= 4 ? 'catch' : levelId <= 9 ? 'stone' : levelId <= 11 ? 'room' : 'mail';
  let tasks = [];
  if (mode === 'stone') {
    tasks = base.sequence.map((token, index) => task({ kind: 'stone', label: token, tokens: [token], stoneIndex: index }));
  } else if (mode === 'room') {
    objects.forEach((object, index) => {
      if (index) tasks.push(task({ kind: 'space', label: '空格', tokens: ['Space'] }));
      tasks.push(task(levelId === 11 && index === 0
        ? { ...object, kind: 'backspace', tokens: ['Backspace'], initialText: 'CUPP' }
        : { ...object, kind: 'word', tokens: letters(object.label) }));
    });
  } else if (mode === 'mail') {
    tasks = ['hi sam', 'come to my home', 'let us play'].map((label, index) => task({
      kind: 'sentence', label, tokens: letters(label), mailIndex: index,
      destination: ['sam', 'friend', 'friends'][index],
    }));
  }
  const lesson = Object.freeze({
    ...base, mode, tasks: Object.freeze(tasks),
    sequence: mode === 'catch' ? base.sequence : Object.freeze(tasks.flatMap(item => item.tokens)),
    initialText: levelId === 11 ? 'cupp' : base.initialText ?? '',
    actionDuration: mode === 'stone' ? STONE_ACTION_SECONDS : mode === 'room' ? ROOM_ACTION_SECONDS : mode === 'mail' ? MAIL_ACTION_SECONDS : 0,
    batchSize: mode === 'stone' ? STONE_BATCH_SIZE : 0,
  });
  lessonCache.set(levelId, lesson);
  return lesson;
}

function playableLesson(levelId) {
  const lesson = getJourneyLesson(levelId);
  if (!lesson || lesson.mode === 'catch') throw new RangeError('Journey gameplay supports island levels 5–12');
  return lesson;
}

function durationFor(lesson, taskIndex) {
  if (lesson.mode !== 'stone' || taskIndex >= lesson.tasks.length) return lesson.actionDuration;
  const batchStart = Math.floor(taskIndex / STONE_BATCH_SIZE) * STONE_BATCH_SIZE;
  const batchEnd = Math.min(batchStart + STONE_BATCH_SIZE, lesson.tasks.length);
  // The final accepted key also walks the unlabelled remainder and hops onto
  // the bank. Those automatic hops grant no input credit, even on short routes.
  return taskIndex === batchEnd - 1
    ? STONE_ACTION_SECONDS * (STONE_BATCH_SIZE + 2 - (batchEnd - batchStart))
    : STONE_ACTION_SECONDS;
}

/** Index counts accepted keys exactly once, including the final key of an action. */
export function createJourneyGame(levelId, progress) {
  const lesson = playableLesson(levelId);
  // Existing mistakes remain in the shared progress. No warm-up is inserted into
  // these object/sentence routes, so their intended sequence stays predictable.
  void progress;
  return {
    levelId, mode: lesson.mode, phase: 'ready', index: 0, correct: 0, wrong: 0,
    wrongKeys: {}, sequence: [...lesson.sequence], reviewCount: 0, reviewKeys: [],
    buffer: lesson.initialText, taskIndex: 0, taskChar: 0, target: lesson.sequence[0],
    actionTime: 0, actionDuration: durationFor(lesson, 0), paused: false, complete: false, built: 0,
  };
}

export function startJourneyGame(state) {
  if (state.phase === 'ready' && !state.paused) state.phase = 'playing';
  return state;
}

export function setJourneyPaused(state, paused) {
  state.paused = Boolean(paused);
  return state;
}

/** Checkpoints change only the displayed route, never counters or key credit. */
export function advanceJourneyCheckpoint(state) {
  if (state.phase !== 'checkpoint' || state.paused) return false;
  state.phase = 'playing';
  state.target = state.sequence[state.index] ?? null;
  return true;
}

function ignoreEvent(event) {
  return !event || event.repeat || event.ctrlKey || event.altKey || event.metaKey ||
    event.shiftKey || event.isComposing || event.keyCode === 229 || event.which === 229;
}

function applyToken(buffer, token) {
  if (token === 'Backspace') return buffer.slice(0, -1);
  return buffer + (token === 'Space' ? ' ' : token.toLowerCase());
}

function completedActions(lesson, taskIndex) {
  return lesson.tasks.slice(0, taskIndex).filter(item => item.kind !== 'space').length;
}

function finishTask(state) {
  const lesson = getJourneyLesson(state.levelId);
  state.taskIndex += 1;
  state.taskChar = 0;
  state.actionTime = 0;
  state.actionDuration = durationFor(lesson, state.taskIndex);
  state.built = completedActions(lesson, state.taskIndex);
  state.complete = state.taskIndex === lesson.tasks.length;
  state.phase = state.complete ? 'complete'
    : state.mode === 'stone' && state.taskIndex % STONE_BATCH_SIZE === 0 ? 'checkpoint' : 'playing';
  state.target = state.phase === 'playing' ? state.sequence[state.index] : null;
}

/** Fresh physical keydowns only. Animation input is discarded, never queued. */
export function pressJourneyKey(state, event) {
  if (state.paused || ignoreEvent(event)) return { kind: 'ignored' };
  const extraPrintable = { NumpadAdd: '+', NumpadSubtract: '-', NumpadMultiply: '*', NumpadDivide: '/', NumpadDecimal: '.', NumpadEqual: '=', IntlBackslash: '\\' };
  const pressed = physicalKey(event) ?? (Object.hasOwn(extraPrintable, event.code) ? extraPrintable[event.code] : null);
  if (state.phase === 'checkpoint') {
    if (pressed !== 'Enter') return { kind: 'ignored' };
    advanceJourneyCheckpoint(state);
    return { kind: 'checkpoint' };
  }
  if (state.phase !== 'playing' || pressed === null || pressed === 'Enter') return { kind: 'ignored' };
  if (pressed !== state.target) {
    if (state.wrong < MAX_WRONG) {
      state.wrong += 1;
      state.wrongKeys[state.target] = (state.wrongKeys[state.target] ?? 0) + 1;
    }
    return { kind: 'wrong', pressed, target: state.target };
  }
  state.buffer = applyToken(state.buffer, pressed);
  state.index += 1;
  state.correct = state.index;
  state.taskChar += 1;
  const current = getJourneyLesson(state.levelId).tasks[state.taskIndex];
  if (state.taskChar < current.tokens.length) {
    state.target = state.sequence[state.index];
    return { kind: 'letter' };
  }
  if (current.kind === 'space') {
    finishTask(state);
    return { kind: 'space' };
  }
  state.phase = 'acting';
  state.target = null;
  state.actionTime = 0;
  return { kind: 'correct' };
}

/** One tick finishes at most one action; leftover time never advances input. */
export function tickJourneyGame(state, dt) {
  if (state.paused || state.phase !== 'acting' || !Number.isFinite(dt) || dt <= 0) return false;
  state.actionTime = Math.min(state.actionDuration, state.actionTime + dt);
  if (state.actionTime < state.actionDuration) return false;
  finishTask(state);
  return true;
}

/** Current object plus derived scene-local route and highlight information. */
export function getJourneyTarget(state) {
  const lesson = playableLesson(state.levelId);
  const current = lesson.tasks[state.taskIndex] ?? { kind: 'complete', label: '', tokens: [] };
  const groupStart = lesson.tasks.slice(0, state.taskIndex).reduce((sum, item) => sum + item.tokens.length, 0);
  let typedPrefix = current.tokens.slice(0, state.taskChar).map(token => token === 'Space' ? ' ' : token === 'Backspace' ? '' : token).join('');
  if (current.kind === 'sentence') typedPrefix = typedPrefix.toLowerCase();
  if (current.kind === 'backspace') typedPrefix = state.taskChar ? current.label : '';
  const routeIndex = Math.max(0, state.taskIndex - (state.phase === 'checkpoint' || state.complete ? 1 : 0));
  const batchIndex = state.mode === 'stone' ? Math.floor(routeIndex / STONE_BATCH_SIZE) : 0;
  const batchStart = state.mode === 'stone' ? batchIndex * STONE_BATCH_SIZE : 0;
  const batchEnd = state.mode === 'stone' ? Math.min(batchStart + STONE_BATCH_SIZE, lesson.tasks.length) : lesson.tasks.length;
  return {
    ...current, token: state.target, target: state.target,
    taskIndex: state.taskIndex, taskCount: lesson.tasks.length, typedCount: state.taskChar, typedPrefix,
    text: current.kind === 'backspace' && state.taskChar === 0 ? current.initialText : current.label,
    groupStart, groupEnd: groupStart + current.tokens.length,
    batchIndex, batchStart, batchEnd, batchSize: batchEnd - batchStart,
    batchCount: state.mode === 'stone' ? Math.ceil(lesson.tasks.length / STONE_BATCH_SIZE) : 1,
    batchTasks: lesson.tasks.slice(batchStart, batchEnd), localIndex: state.taskIndex - batchStart,
    actionProgress: state.phase === 'acting' ? state.actionTime / state.actionDuration : 0,
  };
}

function signatureFor(lesson) {
  // Bind the save to actual content and task boundaries, not a mutable length.
  return `journey-v${JOURNEY_SNAPSHOT_VERSION}:` + JSON.stringify({
    levelId: lesson.id, mode: lesson.mode, initialText: lesson.initialText,
    sequence: lesson.sequence, tasks: lesson.tasks, actionDuration: lesson.actionDuration,
    actionDurations: lesson.tasks.map((_, index) => durationFor(lesson, index)), batchSize: lesson.batchSize,
  });
}

export function snapshotJourney(state) {
  const values = Object.fromEntries(STATE_FIELDS.map(key => [key, state[key]]));
  return {
    version: JOURNEY_SNAPSHOT_VERSION, signature: signatureFor(playableLesson(state.levelId)),
    ...values, sequence: [...state.sequence], reviewKeys: [...state.reviewKeys], wrongKeys: { ...state.wrongKeys },
  };
}

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function dataFields(value, allowed) {
  if (!plain(value) || Reflect.ownKeys(value).length !== allowed.length) return false;
  return Reflect.ownKeys(value).every(key => allowed.includes(key)) && allowed.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable && Object.hasOwn(descriptor, 'value');
  });
}

function count(value, max = MAX_WRONG) {
  return Number.isSafeInteger(value) && value >= 0 && value <= max && !Object.is(value, -0);
}

function denseArray(value, expected) {
  if (!Array.isArray(value) || value.length !== expected.length ||
      Reflect.ownKeys(value).length !== expected.length + 1) return false;
  return expected.every((token, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    return descriptor?.enumerable && Object.hasOwn(descriptor, 'value') && descriptor.value === token;
  });
}

/** Corrupt, cross-version, stale-content and impossible phase saves fail closed. */
export function restoreJourney(snapshot) {
  try {
    if (!dataFields(snapshot, SNAPSHOT_FIELDS) || snapshot.version !== JOURNEY_SNAPSHOT_VERSION) return null;
    const lesson = getJourneyLesson(snapshot.levelId);
    if (!lesson || lesson.mode === 'catch' || snapshot.signature !== signatureFor(lesson) ||
        snapshot.mode !== lesson.mode || snapshot.actionDuration !== durationFor(lesson, snapshot.taskIndex) ||
        !denseArray(snapshot.sequence, lesson.sequence) || !denseArray(snapshot.reviewKeys, []) || snapshot.reviewCount !== 0 || Object.is(snapshot.reviewCount, -0)) return null;
    const { phase, taskIndex, taskChar, index, correct, wrong, wrongKeys, actionTime } = snapshot;
    if (!['ready', 'playing', 'acting', 'checkpoint', 'complete'].includes(phase) ||
        !count(taskIndex, lesson.tasks.length) || !count(taskChar, lesson.sequence.length) ||
        !count(index, lesson.sequence.length) || correct !== index || Object.is(correct, -0) ||
        !count(wrong) || !count(snapshot.built, lesson.tasks.length) ||
        typeof snapshot.paused !== 'boolean' || typeof snapshot.complete !== 'boolean' ||
        !Number.isFinite(actionTime) || actionTime < 0 || Object.is(actionTime, -0) || actionTime >= snapshot.actionDuration) return null;
    const current = lesson.tasks[taskIndex];
    const start = lesson.tasks.slice(0, taskIndex).reduce((sum, item) => sum + item.tokens.length, 0);
    if (index !== start + taskChar || snapshot.built !== completedActions(lesson, taskIndex)) return null;
    if ((taskIndex === lesson.tasks.length) !== (phase === 'complete') || snapshot.complete !== (phase === 'complete')) return null;
    if (phase === 'complete') {
      if (taskChar !== 0 || index !== lesson.sequence.length) return null;
    } else if (phase === 'acting') {
      if (current.kind === 'space' || taskChar !== current.tokens.length) return null;
    } else if (taskChar >= current.tokens.length || actionTime !== 0) return null;
    if (phase !== 'acting' && actionTime !== 0) return null;
    if (phase === 'ready' && (index !== 0 || taskIndex !== 0 || taskChar !== 0 || wrong !== 0)) return null;
    if (phase === 'checkpoint' && (lesson.mode !== 'stone' || taskIndex === 0 || taskIndex % STONE_BATCH_SIZE !== 0 || taskChar !== 0)) return null;
    const target = ['ready', 'playing'].includes(phase) ? lesson.sequence[index] : null;
    if (snapshot.target !== target) return null;
    let buffer = lesson.initialText;
    for (const token of lesson.sequence.slice(0, index)) buffer = applyToken(buffer, token);
    if (snapshot.buffer !== buffer) return null;
    if (!plain(wrongKeys)) return null;
    const wrongNames = Reflect.ownKeys(wrongKeys);
    const allowed = new Set(lesson.sequence.slice(0, index + (phase === 'playing' ? 1 : 0)));
    let totalWrong = 0;
    for (const token of wrongNames) {
      const descriptor = Object.getOwnPropertyDescriptor(wrongKeys, token);
      if (!allowed.has(token) || !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value') ||
          !count(descriptor.value) || descriptor.value === 0) return null;
      totalWrong += descriptor.value;
    }
    if (totalWrong !== wrong) return null;
    return {
      ...Object.fromEntries(STATE_FIELDS.map(key => [key, snapshot[key]])),
      sequence: [...lesson.sequence], reviewKeys: [], wrongKeys: { ...wrongKeys },
    };
  } catch {
    return null;
  }
}
