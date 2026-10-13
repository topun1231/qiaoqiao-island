import { physicalKey } from './adventure.js';

// This optional prototype never reads or writes the twelve-lesson progress.
export const STONE_STORAGE_KEY = 'typing-island-stones-v1';
export const STONE_KEYS = Object.freeze(['F', 'J', 'F', 'F', 'J', 'F', 'J', 'J']);
export const HOP_SECONDS = 0.75;
// The last stone is followed by one bank hop and a short automatic walk.
export const ARRIVE_SECONDS = 1.8;
const MAX_WRONG = 1_000_000;
const STATE_FIELDS = ['phase', 'index', 'target', 'hopTime', 'paused', 'wrong'];
const SNAPSHOT_FIELDS = ['version', ...STATE_FIELDS];

/** Index counts landed stones, never a key accepted for an unfinished hop. */
export function createStoneGame() {
  return {
    phase: 'ready', index: 0, target: STONE_KEYS[0],
    hopTime: 0, paused: false, wrong: 0,
  };
}

export function startStoneGame(state) {
  if (state.phase === 'ready' && !state.paused) state.phase = 'playing';
  return state;
}

export function setStonePaused(state, paused) {
  state.paused = Boolean(paused);
  return state;
}

/** Only a fresh physical keydown on a resting stone can begin the next hop. */
export function pressStoneKey(state, event) {
  if (!event || state.paused || state.phase !== 'playing' || event.repeat ||
      event.ctrlKey || event.altKey || event.metaKey || event.shiftKey ||
      event.isComposing || event.keyCode === 229 || event.which === 229) {
    return { kind: 'ignored' };
  }
  const pressed = physicalKey(event);
  if (pressed === null || pressed === 'Enter') return { kind: 'ignored' };
  if (pressed !== state.target) {
    state.wrong = Math.min(MAX_WRONG, state.wrong + 1);
    return { kind: 'wrong', pressed, target: state.target };
  }
  state.phase = 'hopping';
  state.hopTime = 0;
  return { kind: 'correct' };
}

/** One tick can finish one animation only; leftover time never grants credit. */
export function tickStoneGame(state, dt) {
  if (state.paused || !Number.isFinite(dt) || dt <= 0) return false;
  if (state.phase === 'hopping') {
    state.hopTime = Math.min(HOP_SECONDS, state.hopTime + dt);
    if (state.hopTime >= HOP_SECONDS) {
      state.index += 1;
      state.target = STONE_KEYS[state.index] ?? null;
      state.hopTime = 0;
      state.phase = state.index === STONE_KEYS.length ? 'arriving' : 'playing';
      return true;
    }
  } else if (state.phase === 'arriving') {
    state.hopTime = Math.min(ARRIVE_SECONDS, state.hopTime + dt);
    if (state.hopTime >= ARRIVE_SECONDS) {
      state.hopTime = 0;
      state.phase = 'complete';
      return true;
    }
  }
  return false;
}

/** A separate, small versioned save contains no curriculum or reward data. */
export function snapshotStone(state) {
  return { version: 1, ...Object.fromEntries(STATE_FIELDS.map(key => [key, state[key]])) };
}

function exactSnapshot(value) {
  if (value === null || typeof value !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === SNAPSHOT_FIELDS.length &&
    keys.every(key => SNAPSHOT_FIELDS.includes(key)) &&
    SNAPSHOT_FIELDS.every(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      // Saved JSON has only enumerable own data, never methods or accessors.
      return descriptor?.enumerable && Object.hasOwn(descriptor, 'value');
    });
}

/** Restore only reachable positions; the controller pauses active reloads. */
export function restoreStone(snapshot) {
  try {
    if (!exactSnapshot(snapshot) || snapshot.version !== 1) return null;
    const { phase, index, target, hopTime, paused, wrong } = snapshot;
    if (!['ready', 'playing', 'hopping', 'arriving', 'complete'].includes(phase) ||
        !Number.isSafeInteger(index) || index < 0 || index > STONE_KEYS.length || Object.is(index, -0) ||
        target !== (STONE_KEYS[index] ?? null) || typeof paused !== 'boolean' ||
        !Number.isSafeInteger(wrong) || wrong < 0 || wrong > MAX_WRONG || Object.is(wrong, -0) ||
        !Number.isFinite(hopTime) || hopTime < 0 || Object.is(hopTime, -0)) return null;
    if (phase === 'ready' && (index !== 0 || wrong !== 0)) return null;
    if ((index === STONE_KEYS.length) !== (phase === 'arriving' || phase === 'complete')) return null;
    if (phase === 'hopping') {
      if (hopTime >= HOP_SECONDS) return null;
    } else if (phase === 'arriving') {
      if (hopTime >= ARRIVE_SECONDS) return null;
    } else if (hopTime !== 0) return null;
    return { phase, index, target, hopTime, paused, wrong };
  } catch {
    return null;
  }
}
