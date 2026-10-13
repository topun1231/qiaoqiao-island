import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import * as game from '../dist/v8/journey-game.js';
import * as journeyStore from '../dist/v8/journey-store.js';
import * as catchGame from '../dist/v8/catch-game.js';
import * as adventure from '../dist/v8/adventure.js';
import * as curriculum from '../dist/v8/curriculum.js';
import { createFeedback, isControlActivation } from '../dist/v8/feedback.js';

const root = path.resolve(import.meta.dirname, '../dist/v8');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = [...read('sw.js').match(/const FILES=\[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
const key = token => ({ code: token.length === 1 ? `Key${token}` : token,
  key: token === 'Space' ? ' ' : token === 'Backspace' ? token : token.toLowerCase() });
const envelope = (...states) => ({ version: 2, sessions: {}, progress: adventure.defaultProgress(), journeys: Object.fromEntries(states.map(state => [state.levelId, { snapshot: game.snapshotJourney(state), awarded: false, notice: '' }])) });
const snapshot = page => game.snapshotJourney(page.state());

// Exercise the real page controller with a small DOM and deterministic clock.
// No browser, network, renderer, or application source modifications are needed.
function boot({ level = 5, entries = {}, unavailable = false, rendererFailure = false, controller = 'journey' } = {}) {
  const nodes = new Map(), allNodes = [], windowEvents = new Map(), documentEvents = new Map();
  const writes = [], removals = [], store = new Map(Object.entries(entries).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  let frame, now = 0, recorded = 0, reloads = 0, disposed = 0, cancelled = 0, timerId = 0;
  const timers = new Map(), rendered = [];
  const document = {
    hidden: false, activeElement: null,
    getElementById(id) { return nodes.get(id); },
    createElement(tag) { return element(tag); },
    querySelector(selector) { return selector === `.${controller}-game` ? gameRoot : null; },
    querySelectorAll(selector) { return selector === '[data-key]' ? allNodes.filter(node => node.dataset.key && node.parentNode) : []; },
    addEventListener(name, callback) { documentEvents.set(name, callback); }
  };
  function element(tag, id = '') {
    const classes = new Set();
    const node = { tagName: tag.toUpperCase(), id, hidden: false, dataset: {}, children: [], attributes: {}, parentNode: null,
      classList: { toggle(name, enabled) { const on = enabled ?? !classes.has(name); on ? classes.add(name) : classes.delete(name); return on; }, add(...names) { names.forEach(n => classes.add(n)); }, remove(...names) { names.forEach(n => classes.delete(n)); }, contains(name) { return classes.has(name); } },
      append(...children) { for (const child of children) { child.parentNode = this; this.children.push(child); } },
      replaceChildren(...children) { this.children.forEach(child => { child.parentNode = null; }); this.children = []; this.append(...children); },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      getAttribute(name) { return this.attributes[name] ?? null; },
      focus() { document.activeElement = this; },
      blur() { if (document.activeElement === this) document.activeElement = null; },
      closest() { return ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(this.tagName) ? this : null; },
      querySelectorAll() { return this.children.flatMap(child => [child, ...child.querySelectorAll()]).filter(child => ['BUTTON', 'A'].includes(child.tagName)); },
      querySelector(selector) { return this.children.find(child => child.tagName === selector.toUpperCase()) ?? element(selector); }
    };
    let text = '';
    Object.defineProperty(node, 'textContent', { get() { return text; }, set(value) { text = String(value); } });
    allNodes.push(node);
    if (id) nodes.set(id, node);
    return node;
  }
  for (const [, tag, before, id, after] of read(`${controller}.html`).matchAll(/<([a-z][a-z0-9]*)\b([^>]*?)id="([^"]+)"([^>]*)>/gi)) {
    const node = element(tag, id); node.hidden = /\bhidden\b/.test(before + after);
  }
  const gameRoot = element('main');
  for (const [parent, children] of [['catchPause', ['resumeCatch']], ['catchDone', ['replayCatch']], ...(controller === 'journey' ? [['journeyCheckpoint', ['nextRoute']]] : [])]) {
    const exit = element('a'); exit.href = './';
    nodes.get(parent).append(element('p'), ...children.map(id => nodes.get(id)), exit);
  }
  const localStorage = {
    getItem(k) { if (unavailable) throw Error('Storage unavailable'); return store.get(k) ?? null; },
    setItem(k, value) { if (unavailable) throw Error('Storage unavailable'); store.set(k, value); writes.push([k, JSON.parse(value)]); },
    removeItem(k) { store.delete(k); removals.push(k); }
  };
  const world = { render(state, dt) { rendered.push({ state: (controller === 'journey' ? game.snapshotJourney : catchGame.snapshotCatch)(state), dt }); }, dispose() { disposed++; } };
  const schedule = (callback, delay) => { const id = ++timerId; timers.set(id, { callback, at: now + delay }); return id; };
  const cancel = id => timers.delete(id);
  const createWorld = () => { if (rendererFailure) throw Error('No WebGL'); return world; };
  const context = vm.createContext({
    ...game, ...catchGame, ...journeyStore, ...adventure, ...curriculum, createFeedback: callback => createFeedback(callback, schedule, cancel), isControlActivation, document, localStorage, JSON, URL,
    awardJourney(progress, state) { recorded++; return journeyStore.awardJourney(progress, state); },
    window: { localStorage, addEventListener: (name, callback) => windowEvents.set(name, callback) },
    navigator: {}, performance: { now: () => now }, console: { error() {} },
    requestAnimationFrame: callback => { frame = callback; return 1; }, cancelAnimationFrame() { cancelled++; },
    createRoomWorld: createWorld, createMailWorld: createWorld, createJourneyStoneWorld: createWorld, createCatchWorld: createWorld,
    setTimeout: schedule, clearTimeout: cancel, location: { href: `https://example.test/typing-island/${controller}.html?level=${level}`, reload() { reloads++; } }
  });
  vm.runInContext(read(`${controller}.js`).replace(/^import[^\n]+\n/gm, ''), context);
  return { nodes, allNodes, document, localStorage, writes, removals, store, windowEvents, documentEvents, rendered,
    advance(seconds) { now += seconds * 1000; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); } frame(now); },
    press(token, extra = {}) { let prevented = false; windowEvents.get('keydown')({ ...key(token), preventDefault() { prevented = true; }, ...extra }); return prevented; },
    state() { return vm.runInContext('state', context); },
    progress() { return vm.runInContext(controller === 'journey' ? 'envelope.progress' : 'progress', context); },
    recordCalls() { return recorded; },
    entries() { return Object.fromEntries(store); },
    get reloads() { return reloads; }, get disposed() { return disposed; }, get cancelled() { return cancelled; }
  };
}

function start(page) { page.nodes.get('startCatch').onclick(); }
function finishPage(page) {
  if (page.state().paused) page.nodes.get('resumeCatch').onclick();
  if (page.state().phase === 'ready') start(page);
  for (let guard = 0; page.state().phase !== 'complete' && guard < 1000; guard++) {
    if (page.state().phase === 'acting') page.advance(page.state().actionDuration);
    else if (page.state().phase === 'checkpoint') page.nodes.get('nextRoute').onclick();
    else page.press(page.state().target);
  }
  assert.equal(page.state().phase, 'complete');
}
function act(page) {
  while (page.state().phase === 'playing') page.press(page.state().target);
  assert.equal(page.state().phase, 'acting');
}
function completeAction(page) { act(page); page.advance(page.state().actionDuration); }

test('journey DOM bindings are unique and all transitive assets are self-hosted and precached', () => {
  const html = read('journey.html'), source = read('journey.js'), visited = new Set();
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const [, id] of source.matchAll(/\$\('([^']+)'\)/g)) assert(ids.includes(id), `Missing journey #${id}`);
  function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    assert(manifest.includes(`./${file}`), `Not precached: ${file}`);
    assert(fs.existsSync(path.join(root, file)), `Missing asset: ${file}`);
    if (file.endsWith('.css')) for (const [, dependency] of read(file).matchAll(/@import\s+['"]([^'"]+)['"]/g)) visit(path.posix.normalize(path.posix.join(path.posix.dirname(file), dependency)));
    if (file.endsWith('.js')) for (const [, dep] of read(file).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)) {
      assert(dep.startsWith('./'), `External dependency in ${file}: ${dep}`);
      visit(path.posix.normalize(path.posix.join(path.posix.dirname(file), dep)));
    }
  }
  visit('journey.html');
  for (const [, asset] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) if (asset !== './') visit(asset.split('?')[0]);
  assert.match(html, /aria-modal="true"/);
});

test('every journey level 5–12 is freely playable, starts only deliberately, and invalid numeric routes fall back safely', () => {
  for (let levelId = 5; levelId <= 12; levelId++) {
    const page = boot({ level: levelId });
    assert.equal(page.state().levelId, levelId);
    assert.equal(page.state().mode, levelId < 10 ? 'stone' : levelId < 12 ? 'room' : 'mail');
    assert.equal(page.state().phase, 'ready');
    assert.equal(page.nodes.get('startCatch').hidden, false);
    assert.equal(page.nodes.get('pauseCatch').hidden, true);
    assert.equal(page.document.activeElement, page.nodes.get('startCatch'));
    const initial = snapshot(page); page.press(page.state().target); page.advance(5);
    assert.deepEqual(snapshot(page), initial);
    finishPage(page);
    assert.equal(page.progress().completed[levelId]?.attempts, 1);
    assert.equal(page.progress().completed[levelId]?.bestAccuracy, 1);
  }
  for (const value of ['0', '4', '13', '-1', '5.5', 'NaN', 'Infinity', 'abc', '__proto__']) assert.equal(boot({ level: value }).state().levelId, 5, value);
});

test('wrong input is red, reports the physical key and correct finger without moving or changing typed text', () => {
  for (const levelId of [5, 10, 11, 12]) {
    const page = boot({ level: levelId }); start(page);
    const target = page.state().target, initial = snapshot(page);
    assert.equal(page.press('X'), true);
    assert.equal(page.state().index, initial.index);
    assert.equal(page.state().buffer, initial.buffer);
    assert.equal(page.state().target, target);
    assert.equal(page.state().wrong, 1);
    assert.equal(page.nodes.get('actualKey').textContent, 'X');
    assert.match(page.nodes.get('feedbackText').textContent, /按到了 X.*试试/);
    assert.equal(page.nodes.get('catchFeedback').classList.contains('visible'), true);
    assert.equal(page.press(target), true);
    assert.equal(page.nodes.get('catchFeedback').classList.contains('visible'), false);
    assert.equal(page.state().wrong, 1);
  }
  assert.match(read('journey.css'), /@import ['"]\.\/catch\.css['"]/);
  assert.match(read('catch.css'), /\.feedback-line kbd\{[^}]*background:#f8c5ba/);
  assert.match(read('catch.css'), /\.key\.wrong\{[^}]*background:#f8c5ba/);
});

test('feedback expires, pause clears it, and it never reappears after loading a saved attempt', () => {
  const page = boot({ level: 10 }); start(page); page.press('X'); page.advance(1);
  assert.equal(page.nodes.get('catchFeedback').classList.contains('visible'), true);
  page.press('Z'); page.advance(1);
  assert.equal(page.nodes.get('actualKey').textContent, 'Z');
  assert.equal(page.nodes.get('catchFeedback').classList.contains('visible'), true);
  page.advance(.8);
  assert.equal(page.nodes.get('catchFeedback').classList.contains('visible'), false);
  page.press('X'); page.nodes.get('pauseCatch').onclick();
  assert.equal(page.nodes.get('catchFeedback').classList.contains('visible'), false);
  const fresh = boot({ level: 10, entries: page.entries() });
  assert.equal(fresh.state().wrong, 3);
  assert.equal(fresh.nodes.get('catchFeedback').classList.contains('visible'), false);
});

test('holding keys, modified shortcuts and IME events never create attempts', () => {
  const page = boot({ level: 10 }); start(page); const initial = snapshot(page);
  for (const extra of [{ repeat: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { isComposing: true }, { keyCode: 229 }, { which: 229 }]) {
    assert.equal(page.press('C', extra), false);
    assert.deepEqual(snapshot(page), initial);
  }
  assert.match(page.nodes.get('sceneInstruction').textContent, /切换到英文输入法/);
  assert.equal(page.press('C'), true);
  assert.equal(page.state().index, 1);
});

test('Enter and Space on focused controls retain native activation and never count as lesson keys', () => {
  const page = boot({ level: 10 });
  assert.equal(page.press('Enter', { key: 'Enter' }), false);
  assert.equal(page.state().phase, 'ready');
  page.nodes.get('startCatch').blur();
  assert.equal(page.press('Enter', { key: 'Enter' }), true);
  completeAction(page);
  assert.equal(page.state().target, 'Space');
  page.nodes.get('pauseCatch').focus(); const before = snapshot(page);
  assert.equal(page.press('Space'), false);
  assert.deepEqual(snapshot(page), before);
  page.nodes.get('pauseCatch').blur();
  assert.equal(page.press('Space'), true);
  assert.equal(page.state().target, 'B');
});

test('stone, room and mail actions discard all input rather than queueing the next target', () => {
  for (const levelId of [5, 10, 11, 12]) {
    const page = boot({ level: levelId }); start(page); act(page); page.advance(.25);
    const moving = snapshot(page);
    for (const token of ['F', 'J', 'X', 'Space', 'Backspace', 'Enter']) {
      assert.equal(page.press(token), false);
      assert.deepEqual(snapshot(page), moving);
    }
    page.advance(page.state().actionDuration);
    assert.equal(page.state().index, moving.index);
    assert.equal(page.state().wrong, 0);
    page.advance(50);
    assert.equal(page.state().index, moving.index);
  }
});

test('pause button, Escape, blur and visibility freeze exact mid-action time until resume', () => {
  for (const mode of [5, 10, 12]) for (const reason of ['button', 'escape', 'blur', 'visibility']) {
    const page = boot({ level: mode }); start(page); act(page); page.advance(.2);
    if (reason === 'button') page.nodes.get('pauseCatch').onclick();
    else if (reason === 'escape') page.press('Escape', { key: 'Escape' });
    else if (reason === 'blur') page.windowEvents.get('blur')();
    else { page.document.hidden = true; page.documentEvents.get('visibilitychange')(); }
    assert.equal(page.state().paused, true, `${mode} ${reason}`);
    assert.equal(page.nodes.get('catchPause').hidden, false);
    assert.equal(page.document.activeElement, page.nodes.get('resumeCatch'));
    const paused = snapshot(page); page.advance(100); page.press('X');
    assert.deepEqual(snapshot(page), paused);
    page.nodes.get('resumeCatch').onclick(); page.advance(page.state().actionDuration - .2);
    assert.equal(page.state().paused, false);
    assert.notEqual(page.state().phase, 'acting');
    assert.equal(page.state().index, paused.index);
  }
});

test('reload mid-action resumes paused at the exact saved pose and credits the action only once', () => {
  for (const levelId of [5, 10, 11, 12]) {
    const old = boot({ level: levelId }); start(old); act(old); old.advance(.3); old.windowEvents.get('pagehide')();
    const prior = snapshot(old), page = boot({ level: levelId, entries: old.entries() });
    assert.equal(page.state().paused, true);
    assert.equal(page.state().actionTime, .3);
    assert.deepEqual({ ...snapshot(page), paused: prior.paused }, prior);
    const paused = snapshot(page); page.advance(100); assert.deepEqual(snapshot(page), paused);
    page.nodes.get('resumeCatch').onclick(); page.advance(page.state().actionDuration - .3);
    assert.equal(page.state().taskIndex, prior.taskIndex + 1);
    assert.equal(page.state().correct, prior.correct);
    page.advance(100);
    assert.equal(page.state().taskIndex, prior.taskIndex + 1);
    assert.equal(old.disposed, 1); assert.equal(old.cancelled, 1);
  }
});

test('room Space advances from a placed object and correction Backspace changes CUPP to CUP before moving', () => {
  const page = boot({ level: 10 }); start(page);
  for (const token of ['C', 'U', 'P']) assert.equal(page.press(token), true);
  assert.equal(page.state().phase, 'acting'); assert.equal(page.state().buffer, 'cup');
  assert.equal(page.press('Space'), false);
  page.advance(game.ROOM_ACTION_SECONDS);
  assert.equal(page.state().target, 'Space');
  const index = page.state().index;
  assert.equal(page.press('Space'), true);
  assert.equal(page.state().index, index + 1);
  assert.equal(page.state().buffer, 'cup ');
  assert.equal(page.state().phase, 'playing'); assert.equal(page.state().target, 'B');
  const correction = boot({ level: 11 }); start(correction);
  assert.equal(correction.state().buffer, 'cupp'); assert.equal(correction.state().target, 'Backspace');
  assert.equal(correction.press('P'), true); assert.equal(correction.state().buffer, 'cupp');
  assert.equal(correction.press('Backspace'), true);
  assert.equal(correction.state().buffer, 'cup'); assert.equal(correction.state().phase, 'acting');
  correction.advance(game.ROOM_ACTION_SECONDS);
  assert.equal(correction.state().target, 'Space'); assert.equal(correction.state().correct, 1);
});

test('mail spaces separate words and a delivery starts only after the complete sentence', () => {
  const page = boot({ level: 12 }); start(page);
  for (const token of ['H', 'I']) page.press(token);
  assert.equal(page.state().target, 'Space'); assert.equal(page.state().phase, 'playing');
  page.press('Space'); assert.equal(page.state().phase, 'playing'); assert.equal(page.state().buffer, 'hi ');
  for (const token of ['S', 'A']) page.press(token);
  assert.equal(page.state().phase, 'playing');
  page.press('M'); assert.equal(page.state().phase, 'acting');
  assert.equal(page.state().taskIndex, 0);
  page.advance(game.MAIL_ACTION_SECONDS - .1); assert.equal(page.state().phase, 'acting');
  page.advance(.1); assert.equal(page.state().taskIndex, 1); assert.equal(page.state().target, 'C');
});

test('stone checkpoints require deliberate continuation, trap focus and preserve all remaining curriculum keys', () => {
  const page = boot({ level: 5 }); start(page);
  for (let i = 0; i < game.STONE_BATCH_SIZE; i++) completeAction(page);
  assert.equal(page.state().phase, 'checkpoint');
  assert.equal(page.state().index, game.STONE_BATCH_SIZE);
  assert.equal(page.nodes.get('journeyCheckpoint').hidden, false);
  assert.equal(page.document.activeElement, page.nodes.get('nextRoute'));
  const before = snapshot(page); page.press('X'); page.advance(50); assert.deepEqual(snapshot(page), before);
  assert.equal(page.press('Enter', { key: 'Enter' }), false);
  assert.deepEqual(snapshot(page), before, 'Native focused button activation must be handled by its click');
  page.nodes.get('nextRoute').onclick();
  assert.equal(page.state().phase, 'playing');
  assert.equal(page.state().index, game.STONE_BATCH_SIZE);
  assert.equal(page.state().target, curriculum.getLevel(5).sequence[game.STONE_BATCH_SIZE]);
  finishPage(page);
  assert.equal(page.state().index, curriculum.getLevel(5).sequence.length);
});

test('pause, checkpoint and complete modals trap Tab, allow native buttons and provide a map exit', () => {
  const page = boot({ level: 5 }); start(page); page.nodes.get('pauseCatch').onclick();
  for (const [modalId, buttonId] of [['catchPause', 'resumeCatch'], ['journeyCheckpoint', 'nextRoute'], ['catchDone', 'replayCatch']]) {
    if (modalId === 'journeyCheckpoint') { page.nodes.get('resumeCatch').onclick(); for (let i = 0; i < 8; i++) completeAction(page); }
    if (modalId === 'catchDone') finishPage(page);
    const modal = page.nodes.get(modalId), controls = modal.querySelectorAll('button,a'), link = controls.at(-1);
    assert.equal(link.href, './');
    page.nodes.get(buttonId).focus();
    assert.equal(page.press('Tab', { key: 'Tab', shiftKey: true }), true);
    assert.equal(page.document.activeElement, link);
    assert.equal(page.press('Tab', { key: 'Tab' }), true);
    assert.equal(page.document.activeElement, page.nodes.get(buttonId));
    const before = snapshot(page); page.press('Enter', { key: 'Enter' }); assert.deepEqual(snapshot(page), before);
  }
});

test('completion is awarded once across frames and reload, while deliberate replay earns a new attempt without lowering best score', () => {
  const page = boot({ level: 10 }); finishPage(page);
  assert.equal(page.recordCalls(), 1);
  assert.equal(page.progress().completed[10].attempts, 1);
  assert.equal(page.nodes.get('catchDone').hidden, false);
  assert.equal(page.document.activeElement, page.nodes.get('replayCatch'));
  page.advance(100); page.windowEvents.get('pagehide')();
  const persisted = JSON.parse(page.store.get(journeyStore.ENVELOPE_KEY));
  assert.equal(persisted.journeys[10].awarded, true);
  const loaded = boot({ level: 10, entries: page.entries() });
  assert.equal(loaded.state().phase, 'complete');
  loaded.advance(100); assert.equal(loaded.recordCalls(), 0);
  assert.equal(loaded.progress().completed[10].attempts, 1);
  loaded.nodes.get('replayCatch').onclick(); start(loaded); loaded.press('X'); finishPage(loaded);
  assert.equal(loaded.progress().completed[10].attempts, 2);
  assert.equal(loaded.progress().completed[10].bestAccuracy, 1);
  assert(loaded.progress().completed[10].accuracy < 1);
});

test('a terminal saved journey whose reward is pending is reconciled and awarded once on load', () => {
  const original = boot({ level: 10 }); finishPage(original);
  const saved = envelope(original.state());
  const page = boot({ level: 10, entries: { [journeyStore.ENVELOPE_KEY]: saved } });
  assert.equal(page.progress().completed[10]?.attempts, 1);
  assert.equal(JSON.parse(page.store.get(journeyStore.ENVELOPE_KEY)).journeys[10].awarded, true);
  const reloaded = boot({ level: 10, entries: page.entries() });
  assert.equal(reloaded.progress().completed[10]?.attempts, 1);
});

test('old bridge progress is migrated before another selected journey clears the active mirror', () => {
  const progress = adventure.defaultProgress(), old = adventure.startAdventure(adventure.createAdventure(4, progress));
  for (let i = 0; i < 6; i++) adventure.handleAdventureKey(old, key(old.target));
  progress.active = adventure.snapshotAdventure(old);
  const page = boot({ level: 12, entries: { [adventure.STORAGE_KEY]: progress } });
  const saved = JSON.parse(page.store.get(journeyStore.ENVELOPE_KEY));
  assert(saved.sessions[4]);
  assert.deepEqual(adventure.snapshotAdventure(catchGame.restoreCatch(saved.sessions[4])), progress.active);
});

test('switching journeys preserves sibling partial attempts and all historical catch records', () => {
  const oldCatch = catchGame.snapshotCatch(catchGame.createCatchGame(2));
  const page = boot({ level: 10, entries: { [journeyStore.ENVELOPE_KEY]: { ...envelope(), sessions: { 2: oldCatch } } } });
  start(page); page.press('C'); page.windowEvents.get('pagehide')();
  const snapshot10 = snapshot(page);
  const second = boot({ level: 12, entries: page.entries() }); start(second); second.press('H'); second.windowEvents.get('pagehide')();
  const saved = JSON.parse(second.store.get(journeyStore.ENVELOPE_KEY));
  assert.deepEqual(saved.sessions[2], oldCatch);
  assert.deepEqual(saved.journeys[10].snapshot, snapshot10);
  const returned = boot({ level: 10, entries: second.entries() });
  assert.equal(returned.state().index, 1); assert.equal(returned.state().target, 'U'); assert.equal(returned.state().paused, true);
});

test('changed old content displays a migration notice without altering prior completion records', () => {
  for (const levelId of [10, 11, 12]) {
    const old = catchGame.startCatchGame(catchGame.createCatchGame(levelId));
    catchGame.pressCatchKey(old, key(old.target));
    if (old.phase === 'catching') catchGame.tickCatchGame(old, 20);
    const progress = adventure.defaultProgress(); progress.completed[levelId] = { accuracy: .8, bestAccuracy: 1, attempts: 2 };
    const page = boot({ level: levelId, entries: { [journeyStore.ENVELOPE_KEY]: { ...envelope(), progress, sessions: { [levelId]: catchGame.snapshotCatch(old) } } } });
    assert.equal(page.state().index, 0);
    assert.equal(page.nodes.get('migrationNotice').hidden, false);
    assert.match(page.nodes.get('migrationNotice').textContent, /玩法更新/);
    assert.deepEqual(page.progress().completed, progress.completed);
    start(page); assert.equal(page.nodes.get('migrationNotice').hidden, true);
  }
});

test('storage conflict freezes actions and prevents frame, replay and pagehide from overwriting another tab', () => {
  for (const key of [adventure.STORAGE_KEY, journeyStore.ENVELOPE_KEY, null]) {
    const page = boot({ level: 10 }); start(page); act(page); page.advance(.2);
    const count = page.writes.length;
    page.windowEvents.get('storage')({ storageArea: page.localStorage, key, newValue: null });
    assert.equal(page.state().paused, true);
    assert.equal(page.nodes.get('catchPause').hidden, false);
    assert.equal(page.nodes.get('resumeCatch').textContent, '刷新并继续');
    const frozen = snapshot(page); page.press('X'); page.advance(100); page.windowEvents.get('pagehide')();
    assert.deepEqual(snapshot(page), frozen);
    assert.equal(page.writes.length, count);
    page.nodes.get('resumeCatch').onclick(); assert.equal(page.reloads, 1);
  }
});

test('unrelated storage updates are ignored and bfcache restoration reloads fresh progress', () => {
  const page = boot({ level: 10 }); start(page);
  page.windowEvents.get('storage')({ storageArea: page.localStorage, key: 'unrelated', newValue: '{}' });
  page.windowEvents.get('storage')({ storageArea: {}, key: journeyStore.ENVELOPE_KEY, newValue: '{}' });
  assert.equal(page.state().paused, false);
  page.windowEvents.get('pageshow')({ persisted: false }); assert.equal(page.reloads, 0);
  page.windowEvents.get('pageshow')({ persisted: true }); assert.equal(page.reloads, 1);
});

test('storage denial keeps every journey playable with an honest unsaved warning', () => {
  const page = boot({ level: 10, unavailable: true });
  assert.match(page.nodes.get('catchSave').textContent, /无法保存/);
  finishPage(page);
  assert.equal(page.writes.length, 0);
  assert.equal(page.progress().completed[10].attempts, 1);
});

test('renderer failure reports an accessible error and never starts an invisible journey', () => {
  const page = boot({ level: 10, rendererFailure: true });
  assert.equal(page.nodes.get('catchError').hidden, false);
  start(page); page.press('C'); page.advance(10);
  assert.equal(page.state().phase, 'ready'); assert.equal(page.state().index, 0);
  assert.match(read('journey.html'), /id="catchError"[\s\S]*href="\.\/"/);
});

test('restored ready and complete snapshots clear stray pause flags so visible controls stay usable', () => {
  const ready = game.createJourneyGame(10); ready.paused = true;
  const page = boot({ level: 10, entries: { [journeyStore.ENVELOPE_KEY]: envelope(ready) } });
  assert.equal(page.state().paused, false);
  assert.equal(page.document.activeElement, page.nodes.get('startCatch'));
  start(page); page.press('C'); assert.equal(page.state().index, 1);
  finishPage(page);
  const saved = JSON.parse(page.store.get(journeyStore.ENVELOPE_KEY)); saved.journeys[10].snapshot.paused = true;
  const done = boot({ level: 10, entries: { [journeyStore.ENVELOPE_KEY]: saved } });
  assert.equal(done.state().paused, false);
  assert.equal(done.document.activeElement, done.nodes.get('replayCatch'));
});


test('real catch and journey controllers preserve each other’s live attempts and completed awards across repeated switches', () => {
  const catchPage = boot({ controller: 'catch', level: 2 }); start(catchPage);
  catchPage.press(catchPage.state().target); catchPage.advance(2);
  catchPage.press(catchPage.state().target); catchPage.advance(.25);
  catchPage.windowEvents.get('pagehide')();
  const priorCatch = catchGame.snapshotCatch(catchPage.state());
  const first = boot({ level: 10, entries: catchPage.entries() }); start(first); first.press('C'); first.windowEvents.get('pagehide')();
  const priorJourney = snapshot(first);
  const returnedCatch = boot({ controller: 'catch', level: 2, entries: first.entries() });
  assert.deepEqual({ ...catchGame.snapshotCatch(returnedCatch.state()), paused: priorCatch.paused }, priorCatch);
  assert.deepEqual(JSON.parse(returnedCatch.store.get(journeyStore.ENVELOPE_KEY)).journeys[10].snapshot, priorJourney);
  returnedCatch.nodes.get('resumeCatch').onclick();
  for (let guard = 0; returnedCatch.state().phase !== 'complete' && guard < 500; guard++) {
    if (returnedCatch.state().phase === 'catching') returnedCatch.advance(2);
    else returnedCatch.press(returnedCatch.state().target);
  }
  assert.equal(returnedCatch.state().phase, 'complete');
  assert.equal(returnedCatch.progress().completed[2].attempts, 1);
  const second = boot({ level: 10, entries: returnedCatch.entries() });
  assert.equal(second.state().index, 1); assert.equal(second.state().target, 'U');
  assert.equal(second.progress().completed[2].attempts, 1);
  finishPage(second);
  const again = boot({ controller: 'catch', level: 3, entries: second.entries() });
  assert.equal(again.progress().completed[2].attempts, 1);
  assert.equal(again.progress().completed[10].attempts, 1);
  assert.equal(JSON.parse(again.store.get(journeyStore.ENVELOPE_KEY)).journeys[10].awarded, true);
  const final = boot({ level: 10, entries: again.entries() });
  assert.equal(final.state().phase, 'complete');
  assert.equal(final.progress().completed[10].attempts, 1);
  assert.equal(final.recordCalls(), 0);
});
