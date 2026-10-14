import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { create, createV3, press, tick, advanceStage } from '../dist/game/engine-classic.js';
import { getRiverPaths, riverRouteLabel } from '../dist/game/river-world.js';

test('v4 longest river routes keep both current short segments on bounded labels', () => {
  for (const seed of [0, 18, 42, 20261012]) for (const route of [0, 1]) {
    const state = create(4, 0, seed);
    let visitedSegments = 0, priorSegment = '';
    while (!state.solved) {
      if (state.stageReady) { advanceStage(state); continue; }
      const paths = getRiverPaths(state);
      for (const [lane, task] of state.tasks.entries()) {
        const path = paths[task.id], label = riverRouteLabel(state, path, lane);
        assert.equal(label, `${lane ? '下路' : '上路'}·${task.segmentSequences[path.segment]}`);
        assert.ok(label.length <= 7, `overlong route board: ${label}`);
        assert.match(label, /^(上路|下路)·[A-Z]{2,4}$/);
        assert.equal(label.slice(3), path.stones.map((_, index) => path.sequence[index]).join(''));
        assert.ok(!label.includes('→'), 'future segments must not be compressed into the current board');
      }
      const marker = `${state.lessonStageIndex}:${state.segment}`;
      if (marker !== priorSegment) { visitedSegments++; priorSegment = marker; }
      const key = state.route ? state.target : state.tasks[route].key;
      assert.equal(press(state, key).status, 'accepted');
      while (state.action) tick(state, state.action.duration - state.action.elapsed + 1e-8);
    }
    assert.equal(visitedSegments, 16); // 4×3, 6×3, then 6×4 letters.
    assert.equal(state.stageHistory.length, 3);
  }
});

test('legacy v3 river route labels retain all original segment text exactly', () => {
  for (let stage = 0; stage < 3; stage++) {
    const state = createV3(4, stage), paths = getRiverPaths(state);
    for (const [lane, task] of state.tasks.entries()) {
      const path = paths[task.id];
      const expected = path.segments.map(text => text.toLowerCase().split('').join(' ')).join(' → ');
      assert.equal(riverRouteLabel(state, path, lane), expected);
    }
  }
  assert.equal(riverRouteLabel({ version: 3 }, { sequence: 'AGH' }), 'a  g  h');
});

test('the live river renderer uses the bounded route-label formatter', async () => {
  const source = await readFile(new URL('../dist/game/river-world.js', import.meta.url), 'utf8');
  assert.match(source, /const display = riverRouteLabel\(state, choicePath, lane\)/);
  assert.match(source, /p\.setLabel\(label, display, choosing \|\| route === r \? 'active' : 'muted'\)/);
});
