import { LEVELS, getLevel } from './curriculum.js';

export const STORAGE_KEY = 'typing-island-progress-v1';
const MAX_REVIEW = 6;
const MAX_COUNT = 1_000_000;
const MAX_JSON_LENGTH = 30_000;
const recordedStates = new WeakSet();
const isLetter = token => typeof token === 'string' && /^[A-Z]$/.test(token);
const isToken = token => isLetter(token) || token === 'Space' || token === 'Backspace';
const isCount = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum && value <= MAX_COUNT;
const isRatio = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const fields = (value, names) => plain(value) && Object.keys(value).every(key => names.includes(key));
const same = (left, right) => left.length === right.length && left.every((value, i) => value === right[i]);

/** A fresh local-only save. Every island task is available from the map. */
export function defaultProgress() {
  return { version: 1, completed: {}, mistakes: {}, active: null };
}

/** Recommended next lesson, retained for old callers; it does not restrict access. */
export function getUnlockedLevel(progress) {
  let id = 1;
  while (id < LEVELS.length && Object.hasOwn(progress?.completed ?? {}, String(id))) id += 1;
  return id;
}

function previouslyLearned(levelId) {
  return new Set(LEVELS.slice(0, levelId - 1).flatMap(level => level.newKeys).filter(isLetter));
}

function reviewFor(levelId, progress) {
  if (levelId <= 1) return [];
  const learned = previouslyLearned(levelId);
  const candidates = Object.entries(progress?.mistakes ?? {})
    .filter(([key, count]) => learned.has(key) && isCount(count, 1))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  // Keep the warm-up small and predictable. It never blocks the next lesson.
  return candidates.flatMap(([key]) => [key, key]).slice(0, MAX_REVIEW);
}

export function createAdventure(levelId = 1, progress = defaultProgress()) {
  const level = getLevel(levelId);
  if (!level) throw new RangeError('Unknown island level');
  const reviewKeys = reviewFor(levelId, progress);
  const sequence = [...reviewKeys, ...level.sequence];
  return {
    phase: 'ready', levelId, index: 0, correct: 0, wrong: 0,
    target: sequence[0], buffer: level.initialText ?? '', paused: false,
    reviewKeys, reviewCount: reviewKeys.length, sequence, wrongKeys: {},
    complete: false, built: 0,
  };
}

export function startAdventure(state) {
  if (state.phase === 'ready' && !state.paused) state.phase = 'playing';
  return state;
}

export function setAdventurePaused(state, paused) {
  state.paused = Boolean(paused);
  return state;
}

export function resetAdventure(state, progress = defaultProgress()) {
  const fresh = createAdventure(state.levelId, progress);
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, fresh);
  recordedStates.delete(state);
  return state;
}

/** The UI calls this only after the reward/bridge animation has finished. */
export function finishAdventure(state) {
  if (state.phase === 'celebrating' && !state.paused) {
    state.phase = 'complete';
    state.complete = true;
  }
  return state;
}

/** A fraction, with an empty attempt shown as 100% rather than a penalty. */
export function getAccuracy(state) {
  return state.correct + state.wrong ? state.correct / (state.correct + state.wrong) : 1;
}

function ignored(event) {
  return !event || event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
    event.shiftKey || event.isComposing || event.keyCode === 229 || event.which === 229;
}

export function physicalKey(event) {
  if (event.code && event.code !== 'Unidentified') {
    if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3);
    if (event.code === 'Space' || event.code === 'Backspace') return event.code;
    if (event.code === 'Enter' || event.code === 'NumpadEnter') return 'Enter';
    const printable = { Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\' };
    if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5);
    if (/^Numpad[0-9]$/.test(event.code)) return event.code.slice(6);
    return printable[event.code] ?? null;
  }
  if (event.key === 'Enter' || event.key === 'Backspace') return event.key;
  if (event.key === ' ' || event.key === 'Spacebar') return 'Space';
  return typeof event.key === 'string' && /^[\x21-\x7e]$/.test(event.key) ? event.key.toUpperCase() : null;
}

function applyToken(buffer, token) {
  if (token === 'Backspace') return buffer.slice(0, -1);
  return buffer + (token === 'Space' ? ' ' : token.toLowerCase());
}

function builtFor(state) {
  const lessonIndex = Math.max(0, state.index - state.reviewCount);
  return state.levelId === 1 ? Math.floor(lessonIndex / 2) : lessonIndex;
}

/** Wrong keys do not change the target, typed text, or construction progress. */
export function handleAdventureKey(state, event) {
  if (state.paused || ignored(event)) return { kind: 'ignored' };
  const key = physicalKey(event);
  if (state.phase === 'ready') {
    if (key === 'Enter') {
      startAdventure(state);
      return { kind: 'start' };
    }
    return { kind: 'ignored' };
  }
  if (state.phase !== 'playing' || key === null || key === 'Enter') return { kind: 'ignored' };
  if (key !== state.target) {
    // Attribute a retry to its intended target, so the next warm-up helps it.
    if (state.wrong < MAX_COUNT) {
      state.wrong += 1;
      state.wrongKeys[state.target] = (state.wrongKeys[state.target] ?? 0) + 1;
    }
    return { kind: 'wrong' };
  }
  state.buffer = applyToken(state.buffer, key);
  state.index += 1;
  state.correct += 1;
  if (state.reviewCount && state.index === state.reviewCount) {
    state.buffer = getLevel(state.levelId).initialText ?? '';
  }
  state.target = state.sequence[state.index] ?? null;
  state.built = builtFor(state);
  if (state.index === state.sequence.length) state.phase = 'celebrating';
  return { kind: 'correct', built: state.built };
}

export function snapshotAdventure(state) {
  return {
    levelId: state.levelId, index: state.index, correct: state.correct, wrong: state.wrong,
    buffer: state.buffer, wrongKeys: { ...state.wrongKeys },
    sequence: [...state.sequence], reviewCount: state.reviewCount,
  };
}

function expectedBuffer(level, active) {
  let buffer = level.initialText ?? '';
  for (let i = 0; i < active.index; i += 1) {
    buffer = applyToken(buffer, active.sequence[i]);
    if (active.reviewCount && i + 1 === active.reviewCount) buffer = level.initialText ?? '';
  }
  return buffer;
}

function cleanCounts(value, allowed) {
  if (!plain(value) || Object.keys(value).length > allowed.size) return null;
  const clean = {};
  for (const [key, count] of Object.entries(value)) {
    if (!allowed.has(key) || !isCount(count, 1)) return null;
    clean[key] = count;
  }
  return clean;
}

function cleanActive(value, progress) {
  if (!fields(value, ['levelId', 'index', 'correct', 'wrong', 'buffer', 'wrongKeys', 'sequence', 'reviewCount'])) return null;
  const level = getLevel(value.levelId);
  if (!level || !isCount(value.reviewCount) || value.reviewCount > MAX_REVIEW) return null;
  if (value.levelId === 1 && value.reviewCount !== 0) return null;
  if (!Array.isArray(value.sequence) || value.sequence.length !== level.sequence.length + value.reviewCount) return null;
  const learned = previouslyLearned(value.levelId);
  if (!value.sequence.slice(0, value.reviewCount).every(key => learned.has(key))) return null;
  if (!same(value.sequence.slice(value.reviewCount), level.sequence)) return null;
  if (!isCount(value.index) || value.index > value.sequence.length || value.correct !== value.index || !isCount(value.wrong)) return null;
  const wrongKeys = cleanCounts(value.wrongKeys, new Set(value.sequence));
  if (!wrongKeys || Object.values(wrongKeys).reduce((sum, count) => sum + count, 0) !== value.wrong) return null;
  if (typeof value.buffer !== 'string' || value.buffer.length > 100 || value.buffer !== expectedBuffer(level, value)) return null;
  return {
    levelId: value.levelId, index: value.index, correct: value.correct, wrong: value.wrong,
    buffer: value.buffer, wrongKeys, sequence: [...value.sequence], reviewCount: value.reviewCount,
  };
}

function cleanProgress(value) {
  if (!fields(value, ['version', 'completed', 'mistakes', 'active']) || value.version !== 1 || !plain(value.completed)) return null;
  if (Object.keys(value.completed).length > LEVELS.length) return null;
  const result = defaultProgress();
  for (const [key, entry] of Object.entries(value.completed)) {
    if (!/^(?:[1-9]|1[0-2])$/.test(key) || !fields(entry, ['accuracy', 'bestAccuracy', 'attempts'])) return null;
    if (!isRatio(entry.accuracy) || !isRatio(entry.bestAccuracy) || entry.bestAccuracy < entry.accuracy || !isCount(entry.attempts, 1)) return null;
    result.completed[key] = { accuracy: entry.accuracy, bestAccuracy: entry.bestAccuracy, attempts: entry.attempts };
  }
  // Free selection permits any completed subset while retaining the v1 shape.
  const mistakes = cleanCounts(value.mistakes, new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZ'));
  if (!mistakes) return null;
  result.mistakes = mistakes;
  if (value.active !== null) {
    const active = cleanActive(value.active, result);
    if (!active) return null;
    result.active = active;
  }
  return result;
}

export function validateProgress(value) {
  try { return cleanProgress(value) !== null; } catch { return false; }
}

export function serializeProgress(progress) {
  try {
    const clean = cleanProgress(progress);
    return clean ? JSON.stringify(clean) : null;
  } catch { return null; }
}

export function loadProgress(storage) {
  try {
    const local = storage ?? globalThis.localStorage;
    if (!local || typeof local.getItem !== 'function') throw new Error('Storage unavailable');
    const raw = local.getItem(STORAGE_KEY);
    if (raw === null) return { progress: defaultProgress(), persistent: true };
    if (typeof raw !== 'string' || raw.length > MAX_JSON_LENGTH) {
      return { progress: defaultProgress(), persistent: true, error: '保存内容无效，已重新开始' };
    }
    let progress;
    try { progress = cleanProgress(JSON.parse(raw)); } catch { progress = null; }
    return progress
      ? { progress, persistent: true }
      : { progress: defaultProgress(), persistent: true, error: '保存内容无效，已重新开始' };
  } catch {
    return { progress: defaultProgress(), persistent: false, error: '浏览器暂时不能保存，本次仍可继续玩' };
  }
}

export function saveProgress(storage, progress) {
  const serialized = serializeProgress(progress);
  if (serialized === null) return false;
  try {
    const local = storage ?? globalThis.localStorage;
    if (!local || typeof local.setItem !== 'function') return false;
    local.setItem(STORAGE_KEY, serialized);
    return true;
  } catch { return false; }
}

export function restoreAdventure(progress) {
  let clean;
  try { clean = cleanProgress(progress); } catch { return null; }
  if (!clean?.active) return null;
  const active = clean.active;
  const state = createAdventure(active.levelId);
  Object.assign(state, active, {
    reviewKeys: active.sequence.slice(0, active.reviewCount),
    target: active.sequence[active.index] ?? null,
    phase: active.index === active.sequence.length ? 'celebrating' : 'ready',
  });
  state.built = builtFor(state);
  return state;
}

/** Record once for this attempt; replay is explicit and can improve its best. */
export function recordCompletion(progress, state) {
  if (recordedStates.has(state) || !['celebrating', 'complete'].includes(state.phase) ||
      state.index !== state.sequence.length || state.correct !== state.index) return progress;
  if (!validateProgress(progress) || !cleanActive(snapshotAdventure(state), progress)) return progress;
  const accuracy = getAccuracy(state);
  const previous = progress.completed[state.levelId];
  progress.completed[state.levelId] = {
    accuracy,
    bestAccuracy: Math.max(previous?.bestAccuracy ?? 0, accuracy),
    attempts: Math.min(MAX_COUNT, (previous?.attempts ?? 0) + 1),
  };
  // Successful warm-up presses retire old difficulty. Apply this before the
  // current attempt's retries so a newly difficult key still gets attention.
  for (const key of state.sequence.slice(0, state.reviewCount)) {
    const remaining = (progress.mistakes[key] ?? 0) - 1;
    if (remaining > 0) progress.mistakes[key] = remaining;
    else delete progress.mistakes[key];
  }
  for (const [key, count] of Object.entries(state.wrongKeys)) {
    if (isLetter(key)) progress.mistakes[key] = Math.min(MAX_COUNT, (progress.mistakes[key] ?? 0) + count);
  }
  progress.active = null;
  recordedStates.add(state);
  return progress;
}
