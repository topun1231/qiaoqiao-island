/** The first island's exact 16-key bridge sequence. */
export const SEQUENCE = 'FFFFJJJJFJFJJFJF';

/** Create independent, serializable state with no DOM or timing dependencies. */
export function createGame() {
  return {
    phase: 'ready',
    index: 0,
    planks: 0,
    target: SEQUENCE[0],
    paused: false,
  };
}

/** Start only a ready game. Resuming an existing game never restarts it. */
export function startGame(state) {
  if (state.phase === 'ready' && !state.paused) state.phase = 'playing';
  return state;
}

/** Reset explicitly for replay; pausing and starting do not call this helper. */
export function resetGame(state) {
  Object.assign(state, createGame());
  return state;
}

/** Pause on lost focus, then resume without discarding progress. */
export function setPaused(state, paused) {
  state.paused = Boolean(paused);
  return state;
}

/** End the walking animation only once the entire bridge has been built. */
export function finishWalk(state) {
  if (state.phase === 'walking' && !state.paused) state.phase = 'complete';
  return state;
}

function isIgnored(event) {
  return !event || event.repeat || event.ctrlKey || event.metaKey ||
    event.altKey || event.isComposing || event.keyCode === 229;
}

function physicalKey(event) {
  // Prefer physical home-row positions, even on a non-QWERTY keyboard.
  // Fall back to key only when the browser does not report a usable code.
  if (event.code && event.code !== 'Unidentified') {
    if (event.code === 'KeyF') return 'F';
    if (event.code === 'KeyJ') return 'J';
    if (event.code === 'Enter' || event.code === 'NumpadEnter') return 'Enter';
    return null;
  }
  if (event.key === 'Enter') return 'Enter';
  if (typeof event.key !== 'string') return null;
  const key = event.key.toUpperCase();
  return key === 'F' || key === 'J' ? key : null;
}

/**
 * Apply one keydown. Held keys, shortcuts, and composition cannot lay planks.
 * Every two correct key presses build exactly one of the eight bridge planks.
 */
export function handleKey(state, event) {
  if (state.paused || isIgnored(event)) return state;
  const key = physicalKey(event);

  if (state.phase === 'ready') {
    if (key === 'Enter') startGame(state);
    return state;
  }

  if (state.phase !== 'playing' || key !== state.target) return state;

  state.index += 1;
  state.planks = Math.floor(state.index / 2);
  state.target = SEQUENCE[state.index] ?? null;
  if (state.index === SEQUENCE.length) state.phase = 'walking';
  return state;
}
