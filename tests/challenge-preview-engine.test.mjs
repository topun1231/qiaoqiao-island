import test from 'node:test';
import assert from 'node:assert/strict';
import { SPECS, LETTER_GROUPS, createLegacy as create, press, tick, snapshot, restore, getRequiredKeys } from '../dist/challenge-test/engine-v3.js';

const settle = state => { while (state.action) tick(state, state.action.duration - state.action.elapsed + 1e-8); return state; };
const key = (state, input) => { assert.equal(press(state, input).status, 'accepted', `level ${state.level}, ${input}: ${state.message}`); return settle(state); };
const write = (state, text) => { for (const letter of text) { const res = press(state, letter); assert.equal(res.status, 'accepted', `${letter}: ${state.message}`); } return state; };
const meaningful = state => ({ completed: [...state.completed], placements: { ...state.placements }, accepted: [...state.accepted], step: state.step, index: state.index, progress: state.progress, buffer: state.buffer });
const roundtrip = state => {
  const saved = snapshot(state);
  const resumed = restore(JSON.stringify(saved));
  assert.ok(resumed, `restore level ${state.level}/${state.action?.type || state.stage}`);
  assert.deepEqual(snapshot(resumed), saved);
  assert.deepEqual(resumed, state);
  return resumed;
};
const permutations = values => values.length ? values.flatMap((value, i) => permutations(values.filter((_, j) => j !== i)).map(tail => [value, ...tail])) : [[]];

function solve(level, choice = {}) {
  const state = create(level);
  switch (level) {
    case 1: for (const letter of 'FJFJ') key(state, letter); break;
    case 2: for (const letter of choice.order || 'DKD') key(state, letter); break;
    case 3: for (const letter of 'SLFJSL') key(state, letter); break;
    case 4: for (const letter of choice.route || 'AGH') key(state, letter); break;
    case 5: for (const letter of 'EIRU') key(state, letter); break;
    case 6: for (const letter of choice.order || 'TY') { key(state, letter); key(state, letter === 'T' ? 'F' : 'J'); } break;
    case 7: for (const letter of choice.order || 'QWOP') key(state, letter); break;
    case 8: for (const letter of choice.order || 'VMBN') key(state, letter); break;
    case 9: for (const letter of 'CXZ') key(state, letter); break;
    case 10: for (const letter of ['Backspace', 'Backspace', 'Z']) key(state, letter); break;
    case 11: write(state, 'join us'); settle(state); break;
    case 12:
      for (const letter of choice.order || 'CXZ') { key(state, letter); write(state, state.targetText); settle(state); }
      break;
  }
  return state;
}

test('twelve specs contain the approved modes, introduction order and warmup groups', () => {
  assert.equal(SPECS.length, 12);
  assert.deepEqual(SPECS.map(s => s.mode), ['catch', 'catch', 'stone', 'stone', 'forest', 'forest', 'room', 'room', 'card', 'card', 'mail', 'mail']);
  assert.equal(SPECS.flatMap(s => s.newKeys).filter(k => k.length === 1).join(''), 'FJDKSLAGHEIRUTYQWOPVMBNCXZ');
  assert.equal(LETTER_GROUPS.flat().join(''), 'FJDKSLAGHEIRUTYQWOPVMBNCXZ');
  assert.deepEqual(SPECS[9].newKeys, ['Backspace']);
  assert.deepEqual(SPECS[10].newKeys, ['Space']);
  assert.throws(() => create(0), RangeError);
  assert.throws(() => create(13), RangeError);
});

for (let level = 1; level <= 12; level++) {
  test(`level ${level} starts playing and completes its original warmup-stage task`, () => {
    const fresh = create(level);
    assert.equal(fresh.phase, 'playing');
    assert.equal(fresh.solved, false);
    assert.deepEqual(fresh.accepted, []);
    roundtrip(fresh);
    const state = solve(level);
    assert.equal(state.phase, 'stage-ready');
    assert.equal(state.solved, false);
    assert.equal(state.stageReady, true);
    assert.equal(state.progress, state.total);
    assert.equal(state.action, null);
    for (const introduced of SPECS[level - 1].newKeys) assert.ok(state.accepted.includes(introduced), `formal task must actually use ${introduced}`);
    roundtrip(state);
  });
}

test('formal mainline levels 1–9 require all 26 real letter presses, including alternate routes and arrangements', () => {
  for (const alternative of [false, true]) {
    const accepted = new Set();
    for (let level = 1; level <= 9; level++) {
      const options = alternative ? { 2: { order: 'KDD' }, 4: { route: 'HAG' }, 6: { order: 'YT' }, 7: { order: 'OWQP' }, 8: { order: 'BNVM' } }[level] || {} : {};
      solve(level, options).accepted.filter(key => key.length === 1).forEach(key => accepted.add(key));
    }
    assert.equal([...accepted].sort().join(''), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  }
});

test('orchard one has F/J twice and no punishment for wrong or premature action input', () => {
  const state = create(1), before = meaningful(state);
  assert.equal(press(state, 'J').status, 'wrong');
  assert.deepEqual(meaningful(state), before);
  tick(state, 2);
  assert.equal(state.wrongKey, null);
  assert.equal(state.wrongUntil, 0);
  assert.equal(press(state, 'f').status, 'accepted');
  assert.equal(state.progress, 0);
  assert.equal(state.action.fallAge, 2);
  assert.equal(press(state, 'J').status, 'ignored');
  assert.deepEqual(state.accepted, ['F']);
  tick(state, state.action.duration / 2);
  roundtrip(state);
  settle(state);
  assert.equal(state.progress, 1);
  assert.deepEqual(state.counts, { F: 1, J: 0 });
  assert.ok(state.fallAge < 1e-6);
  for (const letter of 'JFJ') key(state, letter);
  assert.equal(state.phase, 'stage-ready');
  assert.deepEqual(state.counts, { F: 2, J: 2 });
});

for (const order of ['DDK', 'DKD', 'KDD']) test(`orchard shopping allows ${order} with real basket quantities`, () => {
  const state = solve(2, { order });
  assert.deepEqual(state.accepted, [...order]);
  assert.deepEqual(state.counts, { D: 2, K: 1 });
  assert.equal(new Set(state.completed).size, 3);
});

test('already sufficient fruit gently ignores extra presses without credit', () => {
  const state = create(2);
  key(state, 'K');
  const before = meaningful(state);
  assert.equal(press(state, 'K').status, 'ignored');
  assert.deepEqual(meaningful(state), before);
});

test('two-segment river queues fast sequential input including the next bank without lost letters', () => {
  const state = create(3);
  write(state, 'slfjsl');
  assert.deepEqual(state.queue, [...'LFJSL']);
  assert.equal(state.progress, 0);
  assert.equal(state.target, null);
  assert.equal(press(state, 'L').status, 'ignored');
  tick(state, .2);
  const resumed = roundtrip(state);
  tick(state, 50); tick(resumed, 50);
  assert.equal(state.phase, 'stage-ready');
  assert.deepEqual(state, resumed);
  assert.equal(state.segment, 1);
  assert.equal(state.segmentIndex, 4);
  assert.deepEqual(state.accepted, [...'SLFJSL']);
});

test('river shows SL then FJSL and keeps current stone on an incorrect input', () => {
  const state = create(3);
  assert.equal(state.task.sequence, 'SL');
  assert.equal(press(state, 'S').status, 'accepted');
  const before = meaningful(state), action = structuredClone(state.action);
  assert.equal(press(state, 'J').status, 'wrong');
  assert.deepEqual(meaningful(state), before);
  assert.deepEqual(state.action, action);
  key(state, 'L'); // queues the second hop and lets both hops complete
  assert.equal(state.segment, 1);
  assert.equal(state.task.sequence, 'FJSL');
  assert.equal(state.target, 'F');
  assert.equal(state.progress, 2);
});

for (const route of ['AGH', 'HAG']) test(`river route ${route} genuinely selects its path and includes all three new keys`, () => {
  const state = create(4);
  assert.deepEqual(state.choices.map(c => c.label), ['agh', 'hag']);
  assert.equal(press(state, 'G').status, 'wrong');
  assert.equal(state.route, null);
  write(state, route);
  assert.equal(state.route, route.toLowerCase());
  assert.equal(state.action.route, route.toLowerCase());
  const restored = roundtrip(state); settle(restored);
  assert.equal(restored.phase, 'stage-ready');
  assert.equal([...new Set(restored.accepted)].sort().join(''), 'AGH');
});

test('forest clue failures take a real detour and return without resetting or crediting an incorrect route', () => {
  const state = create(5);
  for (const expected of 'EIRU') {
    assert.equal(state.task.correct, expected);
    assert.equal(state.target, null, 'a clue must not be replaced with the answer');
    const wrong = state.task.branches.find(branch => branch.key !== expected).key;
    const before = meaningful(state);
    assert.equal(press(state, wrong).status, 'wrong');
    assert.equal(state.action.type, 'detour');
    tick(state, 1); roundtrip(state); settle(state);
    assert.deepEqual(meaningful(state), before);
    assert.equal(state.phase, 'playing');
    key(state, expected);
  }
  assert.equal(state.phase, 'stage-ready');
  assert.deepEqual(state.accepted, [...'EIRU']);
});

for (const order of ['TY', 'YT']) test(`forest errands preserve destination and item order ${order}`, () => {
  const state = create(6);
  for (const destination of order) {
    assert.equal(press(state, destination).status, 'accepted');
    assert.equal(state.action.type, 'visit');
    assert.equal(state.stage, 'travel');
    assert.equal(press(state, 'F').status, 'ignored');
    settle(state);
    assert.equal(state.stage, 'fork');
    assert.equal(state.selected, destination);
    const correct = destination === 'T' ? 'F' : 'J';
    const before = meaningful(state);
    assert.equal(press(state, correct === 'F' ? 'J' : 'F').status, 'wrong');
    settle(state); assert.deepEqual(meaningful(state), before);
    assert.equal(press(state, correct).status, 'accepted');
    assert.equal(state.action.type, 'collect');
    assert.equal(state.inventory.includes(destination), false);
    tick(state, 2); roundtrip(state); settle(state);
    assert.equal(state.inventory.includes(destination), true);
    if (!state.stageReady && state.phase !== 'complete') assert.equal(press(state, destination).status, 'ignored');
  }
  assert.deepEqual(state.inventory, [...order]);
  assert.deepEqual(state.completed, [...order]);
  assert.equal(state.phase, 'stage-ready');
});

for (const order of ['QWOP', 'QPOW', 'OWQP', 'OPQW']) test(`room 7 allows actual two-stage choice ${order}`, () => {
  const state = solve(7, { order });
  assert.equal(new Set(Object.values(state.placements)).size, 2);
  assert.equal(state.layoutComplete, true);
  assert.equal(state.accepted.length, 4);
});

test('room pick and place are visibly separate, wrong stage keeps progress and labels remain unique', () => {
  const state = create(7);
  assert.equal(new Set(state.choices.map(c => c.key)).size, state.choices.length);
  assert.equal(press(state, 'W').status, 'wrong');
  assert.equal(press(state, 'Q').status, 'accepted');
  assert.equal(state.held, null);
  assert.deepEqual(state.placements, {});
  tick(state, .7); roundtrip(state); settle(state);
  assert.equal(state.held, 'Q');
  assert.equal(state.stage, 'place');
  const before = meaningful(state);
  assert.equal(press(state, 'O').status, 'wrong');
  assert.deepEqual(meaningful(state), before);
  assert.equal(press(state, 'W').status, 'accepted');
  assert.equal(state.held, 'Q');
  assert.deepEqual(state.placements, {});
  tick(state, 1); roundtrip(state); settle(state);
  assert.equal(state.held, null);
  assert.deepEqual(state.placements, { Q: 'W' });
  key(state, 'O'); key(state, 'W');
  assert.equal(state.phase, 'playing', 'both items in one region is allowed but not complete');
  assert.deepEqual(state.placements, { Q: 'W', O: 'W' });
  key(state, 'Q'); key(state, 'P');
  assert.equal(state.phase, 'stage-ready');
  assert.deepEqual(state.placements, { Q: 'P', O: 'W' });
});

test('room 8 starts with old objects, allows rearranging them and never substitutes it for new keys', () => {
  const state = create(8);
  assert.deepEqual(state.placements, { F: 'M', D: 'N' });
  assert.deepEqual(state.accepted, []);
  for (const letter of 'FNVM BN'.replaceAll(' ', '')) key(state, letter);
  assert.equal(state.phase, 'playing');
  assert.deepEqual(state.placements, { F: 'N', D: 'N', V: 'M', B: 'N' });
  key(state, 'D'); key(state, 'M');
  assert.equal(state.phase, 'stage-ready');
  assert.deepEqual(state.placements, { F: 'N', D: 'M', V: 'M', B: 'N' });
  for (const letter of 'VMBN') assert.ok(state.accepted.includes(letter));
  assert.equal(new Set(state.choices.map(c => c.key)).size, state.choices.length);
  const ready = snapshot(state);
  assert.equal(press(state, 'V').status, 'ignored', 'the warmup boundary waits for explicit next-stage navigation');
  assert.equal(press(state, 'N').status, 'ignored');
  assert.deepEqual(snapshot(state), ready);
  assert.equal(state.solved, false, 'a warmup goal does not complete the whole level');
  assert.equal(state.stageReady, true);
  roundtrip(state);
});

test('card 9 locks the printed prefix, rejects mistypes and folds each card before the next', () => {
  const state = create(9);
  for (const [prefix, target, ending] of [['musi', 'music', 'C'], ['bo', 'box', 'X'], ['jaz', 'jazz', 'Z']]) {
    assert.equal(state.lockedPrefix, prefix); assert.equal(state.buffer, prefix); assert.equal(state.targetText, target);
    const before = meaningful(state);
    assert.equal(press(state, 'Backspace').status, 'wrong');
    assert.deepEqual(meaningful(state), before);
    assert.equal(press(state, ending).status, 'accepted');
    assert.equal(state.buffer, target);
    assert.equal(state.action.type, 'fold');
    assert.equal(state.completed.includes(target), false);
    tick(state, .5); roundtrip(state); settle(state);
    assert.equal(state.completed.includes(target), true);
  }
  assert.equal(state.phase, 'stage-ready');
  assert.deepEqual(state.accepted, ['C', 'X', 'Z']);
});

test('card 10 teaches delete then replacement and permits tail mistakes without touching prefixes', () => {
  const state = create(10);
  assert.equal(state.buffer, 'boxx');
  assert.equal(state.target, 'Backspace');
  assert.equal(press(state, 'q').status, 'wrong');
  assert.equal(state.buffer, 'boxxq');
  assert.deepEqual(state.accepted, []);
  assert.equal(press(state, 'Backspace').status, 'accepted');
  assert.equal(state.buffer, 'boxx');
  key(state, 'Backspace');
  assert.equal(state.buffer, 'jazx');
  assert.equal(state.lockedPrefix, 'jaz');
  key(state, 'Backspace');
  assert.equal(state.buffer, 'jaz');
  const before = meaningful(state);
  assert.equal(press(state, 'Backspace').status, 'ignored');
  assert.deepEqual(meaningful(state), before);
  assert.equal(press(state, 'Space').status, 'ignored');
  key(state, 'z');
  assert.equal(state.phase, 'stage-ready');
  assert.equal(state.buffer, 'jazz');
});

test('first invitation requires a real space, end correction and actual friend arrival', () => {
  const state = create(11);
  assert.equal(press(state, 'Backspace').status, 'ignored');
  write(state, 'join');
  assert.equal(state.target, 'Space');
  assert.equal(press(state, 'u').status, 'wrong');
  assert.equal(state.buffer, 'joinu');
  assert.equal(state.target, 'Backspace');
  key(state, 'Backspace');
  write(state, ' us');
  assert.equal(state.stage, 'delivery');
  assert.equal(state.action.type, 'deliver');
  assert.equal(state.phase, 'acting');
  assert.deepEqual(state.arrived, []);
  assert.equal(state.progress, 0);
  tick(state, state.action.duration - .01);
  assert.notEqual(state.phase, 'stage-ready');
  assert.deepEqual(state.arrived, []);
  roundtrip(state); tick(state, .02);
  assert.equal(state.phase, 'stage-ready');
  assert.deepEqual(state.arrived, ['J']);
  assert.ok(state.accepted.includes('Space'));
});

for (const order of permutations(['C', 'X', 'Z'])) test(`picnic invitation order ${order.join('')} changes persistent arrival order`, () => {
  const state = create(12);
  assert.deepEqual(state.arrived, []);
  for (const friend of order) {
    assert.equal(press(state, friend).status, 'accepted');
    assert.equal(state.buffer, '', 'the selecting key must not become text');
    assert.equal(state.stage, 'travel');
    tick(state, 1); roundtrip(state); settle(state);
    assert.equal(state.stage, 'write');
    assert.equal(state.buffer, '');
    assert.deepEqual(getRequiredKeys(state), [...new Set([...state.targetText.toUpperCase()].map(k => k === ' ' ? 'Space' : k)), 'Backspace']);
    write(state, state.targetText);
    assert.equal(state.phase, 'acting');
    assert.equal(state.arrived.includes(friend), false);
    tick(state, 1); roundtrip(state); settle(state);
    assert.equal(state.arrived.includes(friend), true);
    if (!state.stageReady && state.phase !== 'complete') {
      assert.equal(state.stage, 'select');
      const before = meaningful(state);
      assert.equal(press(state, friend).status, 'ignored');
      assert.deepEqual(meaningful(state), before);
    }
  }
  assert.equal(state.phase, 'stage-ready');
  assert.deepEqual(state.arrived, order);
  assert.deepEqual(state.completed, order);
});

test('direct selection warms only needed keys and printed text never causes practice credit', () => {
  assert.deepEqual(getRequiredKeys(create(5)), ['E', 'I', 'R', 'U']);
  assert.deepEqual(getRequiredKeys(create(9)), ['C', 'X', 'Z']);
  assert.deepEqual(getRequiredKeys(create(10)), ['Backspace', 'Z']);
  const state = create(12);
  assert.deepEqual(getRequiredKeys(state), ['C', 'X', 'Z']);
  key(state, 'X');
  assert.deepEqual(getRequiredKeys(state), ['J', 'O', 'I', 'N', 'Space', 'U', 'S', 'Backspace']);
  assert.deepEqual(state.accepted, ['X']);
  assert.equal(state.arrived.length, 0);
});

for (let level = 1; level <= 12; level++) test(`level ${level} pause freezes state and restore preserves pending work`, () => {
  const state = create(level);
  const first = { 1: 'F', 2: 'K', 3: 'S', 4: 'H', 5: 'E', 6: 'T', 7: 'Q', 8: 'V', 9: 'C', 10: 'Backspace', 11: 'J', 12: 'Z' }[level];
  assert.equal(press(state, first).status, 'accepted');
  tick(state, .12);
  state.paused = true;
  const before = snapshot(state);
  assert.equal(press(state, 'A').status, 'ignored');
  tick(state, 100);
  assert.deepEqual(snapshot(state), before);
  const resumed = roundtrip(state);
  resumed.paused = false; state.paused = false;
  tick(resumed, 20); tick(state, 20);
  assert.deepEqual(resumed, state);
});

test('invalid, special and nonfinite input cannot change a task', () => {
  const state = create(1), before = snapshot(state);
  for (const value of ['Enter', 'ArrowLeft', 'Delete', 'Control', 'aA', '', null, undefined, 1, {}, '你']) assert.equal(press(state, value).status, 'ignored');
  for (const dt of [0, -1, NaN, Infinity, undefined, '1']) tick(state, dt);
  assert.deepEqual(snapshot(state), before);
});

test('restore rejects malformed snapshots and recreates derived definitions from code', () => {
  for (const value of [null, undefined, {}, [], 'bad JSON', { version: 2 }, { version: 1, state: { level: 99 } }]) assert.equal(restore(value), null);
  const bads = [
    s => { s.level = 0; }, s => { s.phase = 'teleport'; }, s => { s.step = -1; }, s => { s.paused = 'yes'; },
    s => { s.accepted = ['Enter']; }, s => { s.queue = ['F']; }, s => { s.progress = 99; }, s => { s.buffer = null; },
    s => { s.placements = { F: 'fake' }; }, s => { s.phase = 'acting'; s.action = null; },
    s => { s.time = -1; }, s => { s.action = { type: 'deliver', key: 'F', duration: 1, elapsed: 0 }; s.phase = 'acting'; },
  ];
  for (const change of bads) { const saved = snapshot(create(1)); change(saved.state); assert.equal(restore(saved), null); }
  const saved = snapshot(create(1));
  saved.state.tasks = [{ id: 'hacked' }]; saved.state.choices = [];
  const resumed = restore(saved);
  assert.equal(resumed.tasks[0].id, 'fruit-1');
  assert.equal(resumed.choices.length, 2);
});


test('restore never invokes accessors or accepts sparse, prototype or nonfinite data', () => {
  let calls = 0;
  const accessor = snapshot(create(1));
  Object.defineProperty(accessor.state, 'time', { get() { calls++; return 0; }, enumerable: true });
  assert.equal(restore(accessor), null);
  const arrayAccessor = snapshot(create(1));
  arrayAccessor.state.accepted = ['F'];
  Object.defineProperty(arrayAccessor.state.accepted, '0', { get() { calls++; return 'F'; }, enumerable: true });
  assert.equal(restore(arrayAccessor), null);
  assert.equal(calls, 0);
  const sparse = snapshot(create(1)); sparse.state.accepted = new Array(3); assert.equal(restore(sparse), null);
  const symbol = snapshot(create(1)); symbol[Symbol('hidden')] = 1; assert.equal(restore(symbol), null);
  const nonfinite = snapshot(create(1)); nonfinite.state.time = Infinity; assert.equal(restore(nonfinite), null);
  const proto = snapshot(create(1)); Object.setPrototypeOf(proto.state, { injected: true }); assert.equal(restore(proto), null);
  assert.equal(restore('{"version":1,"state":{"__proto__":{"level":1}}}'), null);
});

test('corrupt saves cannot turn incomplete text, a wrong route, or a stale action into task credit', () => {
  const cases = [
    [1, 'F', s => { s.action.taskId = 'fruit-2'; }],
    [1, 'F', s => { s.action.from = 'J'; }],
    [3, 'S', s => { s.action.to = 6; }],
    [5, 'E', s => { s.action.key = 'I'; }],
    [6, 'T', s => { s.action.destination = 'Y'; }],
    [7, 'Q', s => { s.action.item = 'O'; }],
    [9, 'C', s => { s.buffer = 'musi'; }],
    [10, 'Backspace', s => { s.buffer = 'boxx'; }],
    [12, 'C', s => { s.stage = 'write'; }],
  ];
  for (const [level, first, corrupt] of cases) {
    const state = create(level); press(state, first);
    const saved = snapshot(state); corrupt(saved.state);
    assert.equal(restore(saved), null, `level ${level} corruption`);
  }
  const invite = create(11); write(invite, 'join us');
  const saved = snapshot(invite); saved.state.buffer = 'join u';
  assert.equal(restore(saved), null);
  const completion = snapshot(create(5)); completion.state.phase = 'complete'; completion.state.solved = true;
  assert.equal(restore(completion), null);
});

test('snapshot is a detached copy and animation credit is never duplicated after repeated reloads', () => {
  const original = create(2); press(original, 'D'); tick(original, .33);
  const saved = snapshot(original); saved.state.accepted.push('F'); saved.state.action.elapsed = 0;
  assert.deepEqual(original.accepted, ['D']); assert.equal(original.action.elapsed, .33);
  let resumed = original;
  for (let i = 0; i < 10; i++) resumed = roundtrip(resumed);
  settle(resumed); assert.deepEqual(resumed.completed, ['pear-1']); assert.deepEqual(resumed.accepted, ['D']);
  resumed = roundtrip(resumed); tick(resumed, 100);
  assert.deepEqual(resumed.completed, ['pear-1']); assert.deepEqual(resumed.accepted, ['D']);
});
