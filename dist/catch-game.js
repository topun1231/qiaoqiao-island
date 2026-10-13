import {
  createAdventure, defaultProgress, handleAdventureKey, physicalKey,
  restoreAdventure, snapshotAdventure,
} from './adventure.js';
import { getLevel } from './curriculum.js';

// Preserve the optional eight-fruit experiment's key and sequence as legacy data.
// The main curriculum never writes to this key or imports its scores.
export const CATCH_STORAGE_KEY = 'typing-island-catch-v1';
export const SEQUENCE = Object.freeze(['F', 'J', 'F', 'J', 'J', 'F', 'J', 'F']);
export const MAIN_CATCH_STORAGE_KEY = 'typing-island-main-catch-v2';
export const FALL_SECONDS = 9;
export const CATCH_SECONDS = 1.35;
const MAX_WRONG = 1_000_000;
const ACTIVE_FIELDS = ['levelId', 'index', 'correct', 'wrong', 'buffer', 'wrongKeys', 'sequence', 'reviewCount'];
const ANIMATION_FIELDS = ['target', 'phase', 'fall', 'catchTime', 'paused', 'fruitIndex'];
const LEGACY_FIELDS = ['index', 'target', 'phase', 'fall', 'catchTime', 'paused', 'wrong'];
const isLetter = key => typeof key === 'string' && /^[A-Z]$/.test(key);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exactFields = (value, allowed) => plain(value) && Reflect.ownKeys(value).length === allowed.length &&
  allowed.every(key => Object.hasOwn(value, key)) && Reflect.ownKeys(value).every(key => allowed.includes(key));

/** Reviews are single fruits. Later lessons group only their curriculum words. */
function groupsFor(state) {
  const groups = [];
  for (let start = 0; start < state.sequence.length;) {
    let end = start + 1;
    const key = state.sequence[start];
    const word = state.levelId >= 10 && start >= state.reviewCount && isLetter(key);
    if (word) while (end < state.sequence.length && isLetter(state.sequence[end])) end += 1;
    const kind = word ? 'word' : key === 'Space' ? 'space' : key === 'Backspace' ? 'backspace' : 'letter';
    const label = kind === 'space' ? '空格' : kind === 'backspace' ? '退格' :
      state.sequence.slice(start, end).join(word ? '' : '').toLowerCase();
    const newLetter = kind === 'letter' && start >= state.reviewCount && getLevel(state.levelId).newKeys.includes(key) &&
      !state.sequence.slice(state.reviewCount, start).includes(key);
    groups.push({ groupStart: start, groupEnd: end, kind,
      fruitLabel: kind === 'letter' ? key : label,
      stationary: kind === 'space' || kind === 'backspace' || newLetter });
    start = end;
  }
  return groups;
}

/** A stable fruit identity despite the key index advancing inside a whole word. */
export function getCatchTarget(state) {
  const groups = groupsFor(state);
  const groupIndex = groups.findIndex(group => state.index < group.groupEnd);
  const fruitIndex = groupIndex < 0 ? groups.length : groupIndex;
  const group = groups[fruitIndex] ?? {
    groupStart: state.sequence.length, groupEnd: state.sequence.length,
    fruitLabel: '', kind: 'complete', stationary: true,
  };
  const typedCount = Math.min(group.groupEnd - group.groupStart,
    Math.max(0, state.index - group.groupStart) + (state.phase === 'catching' ? 1 : 0));
  const typedPrefix = group.kind === 'word'
    ? state.sequence.slice(group.groupStart, group.groupStart + typedCount).join('').toLowerCase()
    : typedCount ? group.fruitLabel : '';
  return { ...group, typedPrefix, typedCount, fruitIndex, fruitTotal: groups.length,
    label: group.fruitLabel, groupIndex: fruitIndex, groupCount: groups.length };
}

function activePhase(state) {
  return getCatchTarget(state).stationary ? 'intro' : 'falling';
}

export function createCatchGame(levelId = 1, progress = defaultProgress()) {
  return { ...createAdventure(levelId, progress), fall: 0, catchTime: 0, fruitIndex: 0 };
}

export function startCatchGame(state) {
  if (state.phase === 'ready' && !state.paused) state.phase = activePhase(state);
  return state;
}

export function setCatchPaused(state, paused) {
  state.paused = Boolean(paused);
  return state;
}

// The adventure model remains the single authority for text, reviews and credit.
function commitKey(state) {
  const phase = state.phase;
  state.phase = 'playing';
  const token = state.target;
  handleAdventureKey(state, { code: isLetter(token) ? `Key${token}` : token });
  state.phase = phase;
}

export function pressCatchKey(state, event) {
  if (!event || state.paused || !['intro', 'falling', 'waiting'].includes(state.phase) ||
      event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey ||
      event.isComposing || event.keyCode === 229 || event.which === 229) return { kind: 'ignored' };
  const extraPrintable = { NumpadAdd: '+', NumpadSubtract: '-', NumpadMultiply: '*', NumpadDivide: '/', NumpadDecimal: '.', NumpadEqual: '=', IntlBackslash: '\\' };
  const pressed = physicalKey(event) ?? (Object.hasOwn(extraPrintable, event.code) ? extraPrintable[event.code] : null);
  if (pressed === null || pressed === 'Enter') return { kind: 'ignored' };
  if (pressed !== state.target) {
    if (state.wrong < MAX_WRONG) {
      state.wrong += 1;
      state.wrongKeys[state.target] = (state.wrongKeys[state.target] ?? 0) + 1;
    }
    return { kind: 'wrong', pressed, target: state.target };
  }
  if (state.index + 1 < getCatchTarget(state).groupEnd) {
    // Within a word, show each correct character immediately without restarting
    // its fall. Only the final character initiates the collection animation.
    commitKey(state);
    return { kind: 'letter' };
  }
  state.phase = 'catching';
  state.catchTime = 0;
  return { kind: 'correct' };
}

/** A transition never spends leftover time on the next fruit. */
export function tickCatchGame(state, dt) {
  if (state.paused || !Number.isFinite(dt) || dt <= 0) return false;
  if (state.phase === 'falling') {
    state.fall = Math.min(1, state.fall + dt / FALL_SECONDS);
    if (state.fall >= 1) {
      state.phase = 'waiting';
      return true;
    }
  } else if (state.phase === 'catching') {
    state.catchTime = Math.min(CATCH_SECONDS, state.catchTime + dt);
    if (state.catchTime >= CATCH_SECONDS) {
      commitKey(state);
      state.fruitIndex += 1;
      state.fall = 0;
      state.catchTime = 0;
      state.complete = state.index === state.sequence.length;
      state.phase = state.complete ? 'complete' : activePhase(state);
      return true;
    }
  }
  return false;
}

/** Mainline storage is v2; the legacy optional v1 save is never overwritten. */
export function snapshotCatch(state) {
  return { version: 2, ...snapshotAdventure(state),
    ...Object.fromEntries(ANIMATION_FIELDS.map(key => [key, state[key]])) };
}

/** Validate every counter, curriculum key, text buffer, and animation boundary. */
export function restoreCatch(snapshot) {
  try {
    if (!exactFields(snapshot, ['version', ...ACTIVE_FIELDS, ...ANIMATION_FIELDS]) || snapshot.version !== 2) return null;
    const active = Object.fromEntries(ACTIVE_FIELDS.map(key => [key, snapshot[key]]));
    const adventure = restoreAdventure({ ...defaultProgress(), active });
    if (!adventure || snapshot.target !== adventure.target || typeof snapshot.paused !== 'boolean' ||
        !Number.isFinite(snapshot.fall) || snapshot.fall < 0 || snapshot.fall > 1 ||
        !Number.isFinite(snapshot.catchTime) || snapshot.catchTime < 0 || snapshot.catchTime >= CATCH_SECONDS ||
        !Number.isSafeInteger(snapshot.fruitIndex) || snapshot.fruitIndex < 0) return null;
    const state = { ...adventure, ...Object.fromEntries(ANIMATION_FIELDS.map(key => [key, snapshot[key]])) };
    const { phase, fall, catchTime, index } = state;
    if (!['ready', 'intro', 'falling', 'waiting', 'catching', 'complete'].includes(phase)) return null;
    if ((index === state.sequence.length) !== (phase === 'complete')) return null;
    const current = getCatchTarget(state);
    if (state.fruitIndex !== current.fruitIndex) return null;
    if (phase !== 'catching' && catchTime !== 0) return null;
    if (current.stationary && fall !== 0) return null;
    if (phase === 'ready' && fall !== 0) return null;
    if (phase === 'intro' && !current.stationary) return null;
    if (phase === 'falling' && (current.stationary || fall >= 1)) return null;
    if (phase === 'waiting' && (current.stationary || fall !== 1)) return null;
    if (phase === 'catching' && index + 1 !== current.groupEnd) return null;
    if (phase === 'complete' && fall !== 0) return null;
    state.complete = phase === 'complete';
    return state;
  } catch {
    return null;
  }
}

/** Resume a validated bridge attempt without discarding its exact input credit. */
export function migrateAdventureCatch(progress) {
  const adventure = restoreAdventure(progress);
  if (!adventure) return null;
  const state = { ...adventure, phase: adventure.target ? 'ready' : 'complete',
    complete: adventure.target === null, fall: 0, catchTime: 0, fruitIndex: 0 };
  state.fruitIndex = getCatchTarget(state).fruitIndex;
  return state;
}

/** Read-only compatibility for the separate eight-fruit experiment. */
export function restoreLegacyCatch(snapshot) {
  try {
    if (!exactFields(snapshot, ['version', ...LEGACY_FIELDS]) || snapshot.version !== 1 ||
        !Number.isInteger(snapshot.index) || snapshot.index < 0 || snapshot.index > SEQUENCE.length ||
        snapshot.target !== (SEQUENCE[snapshot.index] ?? null) || typeof snapshot.paused !== 'boolean' ||
        !Number.isInteger(snapshot.wrong) || snapshot.wrong < 0 || snapshot.wrong > MAX_WRONG ||
        !Number.isFinite(snapshot.fall) || snapshot.fall < 0 || snapshot.fall > 1 ||
        !Number.isFinite(snapshot.catchTime) || snapshot.catchTime < 0 || snapshot.catchTime > CATCH_SECONDS) return null;
    const { index, phase, fall, catchTime, wrong } = snapshot;
    if (!['ready', 'intro', 'falling', 'waiting', 'catching', 'complete'].includes(phase)) return null;
    if ((index === SEQUENCE.length) !== (phase === 'complete')) return null;
    if (phase !== 'catching' && catchTime !== 0) return null;
    if (index < 2 && fall !== 0) return null;
    if (phase === 'ready' && (index !== 0 || fall !== 0 || wrong !== 0)) return null;
    if (phase === 'intro' && index >= 2) return null;
    if (phase === 'falling' && (index < 2 || fall >= 1)) return null;
    if (phase === 'waiting' && (index < 2 || fall !== 1)) return null;
    if (phase === 'complete' && fall !== 0) return null;
    return Object.fromEntries(LEGACY_FIELDS.map(key => [key, snapshot[key]]));
  } catch {
    return null;
  }
}
