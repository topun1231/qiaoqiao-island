import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../dist/journey-store.js';
import * as game from '../dist/journey-game.js';
import * as catchGame from '../dist/catch-game.js';
import * as adventure from '../dist/adventure.js';

const key = token => ({ code: token.length === 1 ? `Key${token}` : token, key: token === 'Space' ? ' ' : token });
const copy = value => JSON.parse(JSON.stringify(value));
const entry = (state, awarded = false, notice = '') => ({ snapshot: game.snapshotJourney(state), awarded, notice });
function memory(entries = {}, failures = []) {
  const values = new Map(Object.entries(entries).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
  const writes = [];
  return { values, writes,
    getItem(key) { if (failures.includes(`get:${key}`)) throw Error('Blocked'); return values.get(key) ?? null; },
    setItem(key, value) { if (failures.includes(`set:${key}`)) throw Error('Blocked'); values.set(key, value); writes.push(key); },
  };
}
function partialCatch(levelId, count, progress = adventure.defaultProgress()) {
  const state = catchGame.startCatchGame(catchGame.createCatchGame(levelId, progress));
  while (state.index < count) {
    catchGame.pressCatchKey(state, key(state.target));
    if (state.phase === 'catching') catchGame.tickCatchGame(state, 20);
  }
  return state;
}
function finished(levelId = 10) {
  const state = game.startJourneyGame(game.createJourneyGame(levelId));
  for (let guard = 0; state.phase !== 'complete' && guard < 1000; guard++) {
    if (state.phase === 'acting') game.tickJourneyGame(state, 20);
    else if (state.phase === 'checkpoint') game.advanceJourneyCheckpoint(state);
    else game.pressJourneyKey(state, key(state.target));
  }
  assert.equal(state.phase, 'complete');
  return state;
}
function envelope(overrides = {}) { return { version: 2, sessions: {}, journeys: {}, progress: adventure.defaultProgress(), lastJourney: null, ...overrides }; }

test('shared envelope is authoritative and round-trips catch sessions, journeys, stamps, scores and mistakes atomically', () => {
  const stale = adventure.defaultProgress(); stale.completed[1] = { accuracy: .5, bestAccuracy: .5, attempts: 1 };
  const progress = adventure.defaultProgress();
  progress.completed[1] = { accuracy: .8, bestAccuracy: .95, attempts: 3 };
  progress.completed[12] = { accuracy: .9, bestAccuracy: 1, attempts: 2 };
  progress.mistakes.F = 4;
  const oldCatch = catchGame.snapshotCatch(partialCatch(2, 3));
  const journey = game.startJourneyGame(game.createJourneyGame(10)); game.pressJourneyKey(journey, key('C'));
  const saved = envelope({ progress, sessions: { 2: oldCatch }, journeys: { 10: entry(journey) }, lastJourney: 10 });
  const storage = memory({ [adventure.STORAGE_KEY]: stale, [store.ENVELOPE_KEY]: saved });
  const loaded = store.readEnvelope(storage);
  assert.equal(loaded.persistent, true);
  assert.deepEqual(loaded.envelope.progress, progress);
  assert.deepEqual(loaded.envelope.sessions[2], oldCatch);
  assert.deepEqual(loaded.envelope.journeys[10], entry(journey));
  assert.equal(loaded.envelope.lastJourney, 10);
  assert.deepEqual(storage.writes, [], 'Reads cannot mutate the historical save');
  loaded.envelope.journeys[11] = entry(game.createJourneyGame(11));
  assert.equal(store.writeEnvelope(storage, loaded.envelope), true);
  assert.deepEqual(storage.writes, [store.ENVELOPE_KEY, adventure.STORAGE_KEY]);
  const persisted = JSON.parse(storage.values.get(store.ENVELOPE_KEY));
  assert.deepEqual(persisted.sessions[2], oldCatch);
  assert.deepEqual(persisted.progress.completed, progress.completed);
  assert.deepEqual(persisted.journeys[10], entry(journey));
  assert(persisted.journeys[11]);
});

test('pre-progress v2 catch envelope keeps valid sessions and uses the legacy progress mirror', () => {
  const progress = adventure.defaultProgress(); progress.completed[4] = { accuracy: .9, bestAccuracy: 1, attempts: 2 };
  const oldCatch = catchGame.snapshotCatch(partialCatch(5, 5));
  for (const extra of [{}, { progress: { version: 999 } }]) {
    const storage = memory({ [adventure.STORAGE_KEY]: progress, [store.ENVELOPE_KEY]: { version: 2, sessions: { 5: oldCatch }, ...extra } });
    const { envelope: loaded } = store.readEnvelope(storage);
    assert.deepEqual(loaded.progress, progress);
    assert.deepEqual(loaded.sessions[5], oldCatch);
    assert.deepEqual(storage.writes, []);
  }
});

test('migration preserves exact accepted lesson keys in every old level 5–9 catch attempt', () => {
  for (let levelId = 5; levelId <= 9; levelId++) {
    const progress = adventure.defaultProgress(); progress.mistakes.F = 2;
    const old = catchGame.snapshotCatch(partialCatch(levelId, 11, progress));
    const saved = envelope({ progress, sessions: { [levelId]: old } });
    const before = copy(saved);
    const opened = store.openJourney(saved, levelId);
    assert.equal(opened.state.index, old.index - old.reviewCount, `Level ${levelId}`);
    assert.equal(opened.state.correct, old.index - old.reviewCount);
    assert.deepEqual(opened.state.sequence.slice(0, opened.state.index), old.sequence.slice(old.reviewCount, old.index));
    assert(game.restoreJourney(game.snapshotJourney(opened.state)));
    assert.match(opened.notice, /上次|继续/);
    assert.equal(opened.awarded, false);
    assert.deepEqual(saved, before, 'Migration leaves historical sessions and best records intact');
  }
});

test('a pending old catch animation does not grant an unearned extra stone key', () => {
  const state = partialCatch(5, 3);
  catchGame.pressCatchKey(state, key(state.target)); catchGame.tickCatchGame(state, .2);
  assert.equal(state.phase, 'catching');
  const old = catchGame.snapshotCatch(state);
  const opened = store.openJourney(envelope({ sessions: { 5: old } }), 5);
  assert.equal(opened.state.index, old.index - old.reviewCount);
  assert.equal(opened.state.phase, 'playing');
});

test('changed word, correction and sentence content restarts levels 10–12 with a visible explanation and keeps all old records', () => {
  for (const levelId of [10, 11, 12]) {
    const progress = adventure.defaultProgress(); progress.completed[levelId] = { accuracy: .8, bestAccuracy: .96, attempts: 7 };
    const old = catchGame.snapshotCatch(partialCatch(levelId, 2));
    const saved = envelope({ progress, sessions: { [levelId]: old } }); const before = copy(saved);
    const opened = store.openJourney(saved, levelId);
    assert.equal(opened.state.index, 0);
    assert.equal(opened.state.phase, 'ready');
    assert.match(opened.notice, /玩法更新/);
    assert.match(opened.notice, /最好成绩.*保留/);
    assert.deepEqual(saved, before);
  }
});

test('existing journey attempt takes precedence over its legacy catch copy', () => {
  const state = game.startJourneyGame(game.createJourneyGame(10)); game.pressJourneyKey(state, key('C'));
  const saved = envelope({ sessions: { 10: catchGame.snapshotCatch(partialCatch(10, 2)) }, journeys: { 10: entry(state, false, 'Migration already explained') } });
  const opened = store.openJourney(saved, 10);
  assert.deepEqual(game.snapshotJourney(opened.state), game.snapshotJourney(state));
  assert.equal(opened.notice, 'Migration already explained');
});

test('completed journey award retains older best results, increments one attempt and accumulates letter mistakes', () => {
  const state = game.startJourneyGame(game.createJourneyGame(10));
  game.pressJourneyKey(state, key('X'));
  while (state.phase !== 'complete') {
    if (state.phase === 'acting') game.tickJourneyGame(state, 20);
    else game.pressJourneyKey(state, key(state.target));
  }
  const progress = adventure.defaultProgress(); progress.completed[10] = { accuracy: .8, bestAccuracy: 1, attempts: 3 }; progress.mistakes.C = 2;
  progress.completed[12] = { accuracy: .9, bestAccuracy: .95, attempts: 2 };
  assert.equal(store.awardJourney(progress, state), true);
  assert.equal(progress.completed[10].attempts, 4);
  assert.equal(progress.completed[10].bestAccuracy, 1);
  assert.equal(progress.completed[10].accuracy, state.correct / (state.correct + 1));
  assert.equal(progress.mistakes.C, 3);
  assert.equal(progress.completed[12].attempts, 2);
  assert.equal(progress.active, null);
  const before = copy(progress);
  assert.equal(store.awardJourney(progress, game.createJourneyGame(11)), false);
  assert.deepEqual(progress, before);
});

test('malformed root, corrupt JSON, wrong version and oversized envelopes safely fall back without writes', () => {
  const progress = adventure.defaultProgress(); progress.completed[1] = { accuracy: .9, bestAccuracy: .9, attempts: 1 };
  for (const raw of ['{broken', 'null', '[]', 'true', JSON.stringify({ version: 3, progress }), ' '.repeat(500001)]) {
    const storage = memory({ [adventure.STORAGE_KEY]: progress, [store.ENVELOPE_KEY]: raw });
    const loaded = store.readEnvelope(storage);
    assert.deepEqual(loaded.envelope.progress, progress);
    assert.deepEqual(loaded.envelope.journeys, {});
    assert.deepEqual(loaded.envelope.sessions, {});
    assert.deepEqual(storage.writes, []);
  }
});

test('invalid journey entries cannot select another lesson, award unfinished work or poison valid sibling saves', () => {
  const valid = entry(game.createJourneyGame(10));
  const bad = copy(valid); bad.snapshot.index = 999;
  const storage = memory({ [store.ENVELOPE_KEY]: envelope({ journeys: { 5: valid, 10: valid, 11: bad, strange: valid }, lastJourney: 5 }) });
  const loaded = store.readEnvelope(storage).envelope;
  assert.deepEqual(Object.keys(loaded.journeys), ['10']);
  assert.equal(loaded.lastJourney, null, 'Continue may only target a validated unfinished journey');
  const unfinished = entry(game.createJourneyGame(11), true);
  const normalized = store.readEnvelope(memory({ [store.ENVELOPE_KEY]: envelope({ journeys: { 11: unfinished } }) })).envelope;
  assert.equal(normalized.journeys[11]?.awarded ?? false, false, 'An unfinished snapshot must never suppress its eventual award');
});

test('invalid catch containers and snapshots are rejected while valid catch siblings remain', () => {
  const valid = catchGame.snapshotCatch(partialCatch(2, 3));
  const saved = envelope({ sessions: { 2: valid, 3: valid, 4: { levelId: 4, index: 20 } } });
  const loaded = store.readEnvelope(memory({ [store.ENVELOPE_KEY]: saved })).envelope;
  assert.deepEqual(Object.keys(loaded.sessions), ['2']);
  for (const sessions of [[], ['junk'], 'bad', 123]) {
    assert.deepEqual(store.readEnvelope(memory({ [store.ENVELOPE_KEY]: envelope({ sessions }) })).envelope.sessions, {});
  }
});

test('envelope write failure leaves the compatibility mirror unchanged and reports failure', () => {
  const old = adventure.defaultProgress(); old.completed[1] = { accuracy: .8, bestAccuracy: .9, attempts: 2 };
  const storage = memory({ [adventure.STORAGE_KEY]: old }, [`set:${store.ENVELOPE_KEY}`]);
  assert.equal(store.writeEnvelope(storage, envelope()), false);
  assert.deepEqual(JSON.parse(storage.values.get(adventure.STORAGE_KEY)), old);
  assert.deepEqual(storage.writes, []);
});

test('a failed compatibility mirror does not invalidate a successfully committed atomic envelope', () => {
  const state = finished(); const progress = adventure.defaultProgress(); store.awardJourney(progress, state);
  const saved = envelope({ progress, journeys: { 10: entry(state, true) } });
  const storage = memory({}, [`set:${adventure.STORAGE_KEY}`]);
  assert.equal(store.writeEnvelope(storage, saved), true);
  assert.deepEqual(store.readEnvelope(storage).envelope.progress, progress);
  assert.equal(store.readEnvelope(storage).envelope.journeys[10].awarded, true);
});
