import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import * as game from '../dist/v8/catch-game.js';
import * as adventure from '../dist/v8/adventure.js';
import * as curriculum from '../dist/v8/curriculum.js';
import { createFeedback, isControlActivation } from '../dist/v8/feedback.js';

const root = path.resolve(import.meta.dirname, '../dist/v8');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = [...read('sw.js').match(/const FILES=\[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
const key = token => ({ code: token.length === 1 ? `Key${token}` : token,
  key: token === 'Space' ? ' ' : token === 'Backspace' ? token : token.toLowerCase() });
const envelope = (...states) => ({ version: 2, sessions: Object.fromEntries(states.map(state => [state.levelId, game.snapshotCatch(state)])) });
const completeFruit = state => {
  while (state.phase !== 'catching') game.pressCatchKey(state, key(state.target));
  game.tickCatchGame(state, game.CATCH_SECONDS);
};
const bridgeAttempt = (levelId, count, progress = adventure.defaultProgress()) => {
  const state = adventure.startAdventure(adventure.createAdventure(levelId, progress));
  for (let i = 0; i < count; i++) adventure.handleAdventureKey(state, key(state.target));
  progress.active = adventure.snapshotAdventure(state);
  return { progress, state };
};

// Exercise the real page controller with a small DOM and deterministic clock.
// No browser, network, renderer, or application source modifications are needed.
function boot({ level = 1, entries = {}, unavailable = false, rendererFailure = false } = {}) {
  const nodes = new Map(), allNodes = [], windowEvents = new Map(), documentEvents = new Map();
  const writes = [], removals = [], store = new Map(Object.entries(entries).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  let frame, now = 0, recorded = 0;
  const document = {
    hidden: false, activeElement: null,
    getElementById(id) { return nodes.get(id); },
    createElement(tag) { return element(tag); },
    querySelector(selector) { return selector === '.catch-game' ? gameRoot : null; },
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
  for (const [, tag, before, id, after] of read('catch.html').matchAll(/<([a-z][a-z0-9]*)\b([^>]*?)id="([^"]+)"([^>]*)>/gi)) {
    const node = element(tag, id); node.hidden = /\bhidden\b/.test(before + after);
  }
  const gameRoot = element('main');
  for (const [parent, children] of [['catchPause', ['resumeCatch']], ['catchDone', ['replayCatch']]]) {
    nodes.get(parent).append(element('p'), ...children.map(id => nodes.get(id)), element('a'));
  }
  const localStorage = {
    getItem(k) { if (unavailable) throw Error('Storage unavailable'); return store.get(k) ?? null; },
    setItem(k, value) { if (unavailable) throw Error('Storage unavailable'); store.set(k, value); writes.push([k, JSON.parse(value)]); },
    removeItem(k) { store.delete(k); removals.push(k); }
  };
  const world = { render() {}, dispose() {}, setCompleted() {} };
  const context = vm.createContext({
    ...game, ...adventure, ...curriculum, createFeedback, isControlActivation, document, localStorage, JSON, URL,
    recordCompletion(progress, state) { recorded++; return adventure.recordCompletion(progress, state); },
    window: { localStorage, addEventListener: (name, callback) => windowEvents.set(name, callback) },
    navigator: {}, performance: { now: () => now }, console: { error() {} },
    requestAnimationFrame: callback => { frame = callback; return 1; }, cancelAnimationFrame() {},
    createCatchWorld: () => { if (rendererFailure) throw Error('No WebGL'); return world; },
    setTimeout: () => 1, clearTimeout() {}, location: { href: `https://example.test/typing-island/catch.html?level=${level}`, reload() {} }
  });
  vm.runInContext(read('catch.js').replace(/^import[^\n]+\n/gm, ''), context);
  return { nodes, document, localStorage, writes, removals, store, windowEvents, documentEvents,
    advance(seconds) { now += seconds * 1000; frame(now); },
    press(token, extra = {}) { let prevented = false; windowEvents.get('keydown')({ ...key(token), preventDefault() { prevented = true; }, ...extra }); return prevented; },
    state() { return vm.runInContext('state', context); },
    progress() { return vm.runInContext('progress', context); },
    recordCalls() { return recorded; },
    entries() { return Object.fromEntries(store); }
  };
}

function finishPage(page) {
  if (page.state().paused) page.nodes.get('resumeCatch').onclick();
  if (page.state().phase === 'ready') page.nodes.get('startCatch').onclick();
  while (page.state().phase !== 'complete') {
    page.press(page.state().target);
    if (page.state().phase === 'catching') page.advance(1.4);
  }
}

test('map and catch DOM bindings exist, are unique, and all local imports are precached', () => {
  const visited = new Set();
  function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    assert(manifest.includes(`./${file}`), `Not precached: ${file}`);
    assert(fs.existsSync(path.join(root, file)), `Missing asset: ${file}`);
    if (file.endsWith('.js')) {
      const code = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
      for (const [, dep] of code.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)) {
        assert(dep.startsWith('./'), `External dependency in ${file}: ${dep}`);
        visit(path.posix.normalize(path.posix.join(path.posix.dirname(file), dep)));
      }
    }
  }
  for (const page of ['index', 'catch']) {
    const html = read(`${page}.html`), source = read(page === 'index' ? 'main.js' : 'catch.js');
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
    assert.equal(ids.length, new Set(ids).size);
    for (const [, id] of source.matchAll(/\$\('([^']+)'\)/g)) assert(ids.includes(id), `Missing ${page} #${id}`);
    visit(`${page}.html`);
    for (const [, asset] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) if (asset !== './') visit(asset.split('?')[0]);
  }
  assert.notEqual(game.MAIN_CATCH_STORAGE_KEY, adventure.STORAGE_KEY);
  assert.notEqual(game.MAIN_CATCH_STORAGE_KEY, game.CATCH_STORAGE_KEY);
  assert.doesNotMatch(read('index.html'), /小游戏|开始修桥/);
});

test('each of the twelve direct lesson URLs starts its complete curriculum with free selection', () => {
  for (const level of curriculum.LEVELS) {
    const page = boot({ level: level.id });
    assert.equal(page.state().levelId, level.id);
    assert.deepEqual(page.state().sequence, [...level.sequence]);
    assert.equal(page.nodes.get('lessonTitle').textContent, `${level.id}. ${level.title}`);
    assert.equal(page.state().phase, 'ready');
    assert.equal(page.state().buffer, level.initialText ?? '');
    assert.equal(page.nodes.get('typedLine').hidden, level.id < 10);
  }
  for (const level of ['0', '13', '-1', '1.2', 'abc', '__proto__']) assert.equal(boot({ level }).state().levelId, 1);
});

test('v1 bridge migration preserves input credit, errors, completed stamps and best scores', () => {
  const progress = adventure.defaultProgress();
  progress.completed[1] = { accuracy: .75, bestAccuracy: .95, attempts: 3 };
  progress.mistakes.F = 2;
  const old = bridgeAttempt(2, 7, progress);
  adventure.handleAdventureKey(old.state, key('X'));
  progress.active = adventure.snapshotAdventure(old.state);
  const page = boot({ level: 2, entries: { [adventure.STORAGE_KEY]: progress } });
  assert.deepEqual(adventure.snapshotAdventure(page.state()), progress.active);
  assert.deepEqual(page.progress().completed, progress.completed);
  assert.deepEqual(page.progress().mistakes, progress.mistakes);
  assert.equal(page.state().phase, 'ready');
  const saved = JSON.parse(page.store.get(game.MAIN_CATCH_STORAGE_KEY));
  assert(game.restoreCatch(saved.sessions[2]));
  assert(page.writes.every(([key]) => [game.MAIN_CATCH_STORAGE_KEY, adventure.STORAGE_KEY].includes(key)));
});

test('opening a different lesson first preserves the legacy active attempt in its own session', () => {
  const old = bridgeAttempt(4, 9);
  const page = boot({ level: 12, entries: { [adventure.STORAGE_KEY]: old.progress } });
  const sessions = JSON.parse(page.store.get(game.MAIN_CATCH_STORAGE_KEY)).sessions;
  assert(sessions[4], 'The old active lesson must be migrated before a new lesson overwrites progress.active');
  assert.deepEqual(adventure.snapshotAdventure(game.restoreCatch(sessions[4])), old.progress.active);
  assert(sessions[12]);
  const returned = boot({ level: 4, entries: page.entries() });
  assert.equal(returned.state().index, 9);
});

test('a fully typed legacy attempt interrupted before its reward is recorded exactly once', () => {
  const old = bridgeAttempt(1, curriculum.getLevel(1).sequence.length);
  const page = boot({ entries: { [adventure.STORAGE_KEY]: old.progress } });
  if (page.state().phase !== 'complete') finishPage(page);
  assert.equal(page.progress().completed[1]?.attempts, 1);
  assert.equal(page.progress().completed[1]?.bestAccuracy, 1);
  assert.equal(page.progress().active, null);
  const refreshed = boot({ entries: page.entries() });
  refreshed.advance(50);
  assert.equal(refreshed.progress().completed[1].attempts, 1);
});

test('refresh pauses a pending catch and preserves its animation and deferred credit exactly once', () => {
  const state = game.startCatchGame(game.createCatchGame(10));
  game.pressCatchKey(state, key('C')); game.pressCatchKey(state, key('A')); game.pressCatchKey(state, key('T'));
  game.tickCatchGame(state, .4);
  const page = boot({ level: 10, entries: { [game.MAIN_CATCH_STORAGE_KEY]: envelope(state) } });
  assert.equal(page.state().phase, 'catching');
  assert.equal(page.state().paused, true);
  assert.equal(page.state().correct, 2);
  assert.equal(page.state().catchTime, .4);
  assert.equal(page.nodes.get('catchPause').hidden, false);
  assert.equal(page.document.activeElement, page.nodes.get('resumeCatch'));
  page.advance(10);
  assert.equal(page.state().catchTime, .4);
  page.nodes.get('resumeCatch').onclick(); page.advance(1);
  assert.equal(page.state().index, 3);
  assert.equal(page.state().correct, 3);
  assert.equal(page.state().buffer, 'cat');
  assert.equal(page.state().target, 'Space');
  page.advance(10);
  assert.equal(page.state().correct, 3);
  page.windowEvents.get('blur')();
  assert.equal(page.state().paused, true);
});

test('switching among multiple lessons preserves independent partial words and catches', () => {
  const word = game.startCatchGame(game.createCatchGame(10));
  game.pressCatchKey(word, key('C')); game.tickCatchGame(word, 3);
  const letter = game.startCatchGame(game.createCatchGame(4));
  completeFruit(letter); game.pressCatchKey(letter, key(letter.target)); game.tickCatchGame(letter, .25);
  const page = boot({ level: 12, entries: { [game.MAIN_CATCH_STORAGE_KEY]: envelope(word, letter) } });
  const sessions = JSON.parse(page.store.get(game.MAIN_CATCH_STORAGE_KEY)).sessions;
  assert.deepEqual(sessions[10], game.snapshotCatch(word));
  assert.deepEqual(sessions[4], game.snapshotCatch(letter));
  const returned = boot({ level: 10, entries: page.entries() });
  assert.equal(returned.state().buffer, 'c');
  assert.equal(returned.state().target, 'A');
  assert.equal(returned.state().fall, 1 / 3);
  assert.equal(returned.state().paused, true);
});

test('word letters update immediately, wrong letters do not advance, and whole words catch only once', () => {
  const page = boot({ level: 10 });
  page.nodes.get('startCatch').onclick(); page.advance(2);
  const originalFall = page.state().fall;
  assert.equal(page.press('X'), true);
  assert.equal(page.state().wrong, 1);
  assert.equal(page.state().index, 0);
  assert.equal(page.nodes.get('actualKey').textContent, 'X');
  assert.equal(page.nodes.get('catchFeedback').classList.contains('visible'), true);
  assert.equal(page.press('C'), true);
  assert.equal(page.state().phase, 'falling');
  assert.equal(page.state().buffer, 'c');
  assert.equal(page.state().fall, originalFall);
  assert.equal(page.nodes.get('typedBuffer').textContent, 'c');
  assert.equal(game.getCatchTarget(page.state()).typedPrefix, 'c');
  assert.equal(page.nodes.get('catchFeedback').classList.contains('visible'), false);
  assert.equal(page.press('A'), true);
  assert.equal(page.state().buffer, 'ca');
  assert.equal(page.state().fruitIndex, 0);
  assert.equal(page.press('T'), true);
  assert.equal(page.state().phase, 'catching');
  assert.equal(game.getCatchTarget(page.state()).typedPrefix, 'cat');
  page.press('T'); page.advance(1.4);
  assert.equal(page.state().buffer, 'cat');
  assert.equal(page.state().fruitIndex, 1);
  assert.equal(page.state().wrong, 1);
});

test('Space and Backspace are explicit stationary curriculum targets with their actual text effects', () => {
  const page = boot({ level: 11 });
  page.nodes.get('startCatch').onclick();
  assert.equal(page.state().buffer, 'catt');
  assert.equal(page.state().target, 'Backspace');
  assert.equal(page.state().phase, 'intro');
  assert.equal(page.press('Space'), true);
  assert.equal(page.state().buffer, 'catt');
  assert.equal(page.press('Backspace'), true); page.advance(1.4);
  assert.equal(page.state().buffer, 'cat');
  assert.equal(page.state().target, 'Space');
  assert.equal(page.state().phase, 'intro');
  page.advance(100); assert.equal(page.state().fall, 0);
  assert.equal(page.press('Space'), true); page.advance(1.4);
  assert.equal(page.state().buffer, 'cat ');
  assert.equal(page.state().target, 'D');
  assert.equal(game.getCatchTarget(page.state()).fruitLabel, 'dog');
});

test('all twelve catch lessons record one completion, refresh adds none, replay adds exactly one', () => {
  for (const level of curriculum.LEVELS) {
    const page = boot({ level: level.id });
    finishPage(page);
    assert.equal(page.progress().completed[level.id]?.attempts, 1);
    assert.equal(page.progress().completed[level.id]?.bestAccuracy, 1);
    assert.equal(page.progress().active, null);
    assert.equal(page.recordCalls(), 1);
    assert.equal(page.nodes.get('catchDone').hidden, false);
    assert.equal(page.document.activeElement, page.nodes.get('replayCatch'));
    page.advance(100); page.windowEvents.get('pagehide')();
    assert.equal(page.recordCalls(), 1);
    const refreshed = boot({ level: level.id, entries: page.entries() });
    assert.equal(refreshed.state().phase, 'complete');
    assert.equal(refreshed.progress().completed[level.id].attempts, 1);
    refreshed.nodes.get('replayCatch').onclick();
    assert.equal(refreshed.state().index, 0);
    assert.equal(refreshed.nodes.get('catchDone').hidden, true);
    assert.equal(refreshed.document.activeElement, refreshed.nodes.get('startCatch'));
    finishPage(refreshed);
    assert.equal(refreshed.progress().completed[level.id].attempts, 2);
    assert.equal(refreshed.recordCalls(), 1);
  }
});

test('worse replay accuracy keeps the previous best and legacy optional storage is never imported or written', () => {
  const progress = adventure.defaultProgress();
  progress.completed[1] = { accuracy: 1, bestAccuracy: 1, attempts: 3 };
  const legacy = { version: 1, index: 8, target: null, phase: 'complete', fall: 0, catchTime: 0, paused: false, wrong: 0 };
  const page = boot({ entries: { [adventure.STORAGE_KEY]: progress, [game.CATCH_STORAGE_KEY]: legacy } });
  assert.equal(page.state().index, 0);
  page.nodes.get('startCatch').onclick(); page.press('X'); finishPage(page);
  assert.equal(page.progress().completed[1].attempts, 4);
  assert.equal(page.progress().completed[1].bestAccuracy, 1);
  assert(page.progress().completed[1].accuracy < 1);
  assert.equal(page.store.get(game.CATCH_STORAGE_KEY), JSON.stringify(legacy));
  assert(!page.writes.some(([key]) => key === game.CATCH_STORAGE_KEY));
});

test('storage changes freeze the page and prevent stale frame or pagehide writes', () => {
  for (const changedKey of [game.MAIN_CATCH_STORAGE_KEY, adventure.STORAGE_KEY, null]) {
    const page = boot(); page.nodes.get('startCatch').onclick();
    const writesBefore = page.writes.length;
    page.windowEvents.get('storage')({ storageArea: page.localStorage, key: changedKey, newValue: '{}' });
    assert.equal(page.nodes.get('catchPause').hidden, false);
    assert.equal(page.nodes.get('resumeCatch').textContent, '刷新并继续');
    page.windowEvents.get('pagehide')(); page.advance(100); page.press('F');
    assert.equal(page.writes.length, writesBefore);
  }
});

test('storage denial leaves practice playable with an accurate nonpersistent warning', () => {
  const page = boot({ level: 12, unavailable: true });
  assert.match(page.nodes.get('catchSave').textContent, /无法保存/);
  page.nodes.get('startCatch').onclick(); page.press('T');
  assert.equal(page.state().index, 1);
  assert.equal(page.writes.length, 0);
});

test('offline navigation preserves every level query and map route', async () => {
  const handlers = new Map(), scope = 'https://example.test/typing-island/';
  const stored = new Map(manifest.map(file => [new URL(file, scope).href, { asset: file }]));
  vm.runInContext(read('sw.js'), vm.createContext({ URL,
    self: { location: new URL('sw.js', scope), addEventListener: (name, callback) => handlers.set(name, callback) },
    fetch: async () => { throw new Error('offline'); },
    caches: { async match(request, options = {}) {
      const url = new URL(typeof request === 'string' ? request : request.url, scope);
      if (options.ignoreSearch) url.search = '';
      return stored.get(url.href);
    } }
  }));
  for (const [route, expected] of [
    ...curriculum.LEVELS.map(level => [`catch.html?level=${level.id}`, './catch.html']),
    ['catch.html', './catch.html'], ['catch.html?level=11&resume=1', './catch.html'],
    ['index.html', './index.html'], ['index.html?from=catch', './index.html'], ['', './'], ['?from=catch', './']
  ]) {
    let result;
    handlers.get('fetch')({ request: { url: new URL(route, scope).href, mode: 'navigate', method: 'GET' }, respondWith(promise) { result = promise; } });
    assert.equal((await result).asset, expected, route);
  }
});

for (const failedKey of [adventure.STORAGE_KEY, game.MAIN_CATCH_STORAGE_KEY]) {
  test(`partial final save failure for ${failedKey} cannot lose or duplicate completion`, () => {
    const state = game.startCatchGame(game.createCatchGame(1));
    while (state.index < state.sequence.length - 1) completeFruit(state);
    game.pressCatchKey(state, key(state.target));
    const progress = adventure.defaultProgress();
    progress.active = adventure.snapshotAdventure(state);
    const page = boot({ entries: { [adventure.STORAGE_KEY]: progress, [game.MAIN_CATCH_STORAGE_KEY]: envelope(state) } });
    page.nodes.get('resumeCatch').onclick();
    const save = page.localStorage.setItem.bind(page.localStorage);
    page.localStorage.setItem = (key, value) => {
      if (key === failedKey) throw Error('Quota reached for this save');
      save(key, value);
    };
    page.advance(1.4);
    if (failedKey === game.MAIN_CATCH_STORAGE_KEY) assert.match(page.nodes.get('catchSave').textContent, /无法保存/);
    const refreshed = boot({ entries: page.entries() });
    if (refreshed.state().phase !== 'complete') finishPage(refreshed);
    assert.equal(refreshed.progress().completed[1]?.attempts, 1, `failed write: ${failedKey}`);
    assert.equal(refreshed.progress().completed[1]?.bestAccuracy, 1);
  });
}

test('an atomic v2 envelope recovers its authoritative progress when the v1 mirror is absent or stale', () => {
  const progress = adventure.defaultProgress();
  progress.completed[12] = { accuracy: .8, bestAccuracy: .95, attempts: 2 };
  progress.mistakes.C = 1;
  const state = game.startCatchGame(game.createCatchGame(10, progress));
  completeFruit(state);
  progress.active = adventure.snapshotAdventure(state);
  const saved = { ...envelope(state), progress };
  const stale = adventure.defaultProgress();
  stale.completed[1] = { accuracy: 1, bestAccuracy: 1, attempts: 1 };
  for (const mirror of [undefined, stale]) {
    const entries = { [game.MAIN_CATCH_STORAGE_KEY]: saved };
    if (mirror) entries[adventure.STORAGE_KEY] = mirror;
    const page = boot({ level: 10, entries });
    assert.deepEqual(page.progress().completed, progress.completed);
    assert.deepEqual(page.progress().mistakes, progress.mistakes);
    assert.equal(page.state().index, state.index);
    assert.equal(page.state().paused, true);
    const written = JSON.parse(page.store.get(game.MAIN_CATCH_STORAGE_KEY));
    assert.equal(adventure.validateProgress(written.progress), true);
    assert.deepEqual(written.progress.completed, progress.completed);
    assert.deepEqual(JSON.parse(page.store.get(adventure.STORAGE_KEY)).completed, progress.completed);
  }
});

test('invalid envelope progress does not replace valid v1 completions or active credit', () => {
  const progress = adventure.defaultProgress();
  progress.completed[11] = { accuracy: .85, bestAccuracy: .95, attempts: 4 };
  const old = bridgeAttempt(3, 6, progress);
  const invalid = { version: 2, sessions: {}, progress: { ...adventure.defaultProgress(), completed: { 12: { accuracy: 2, bestAccuracy: 2, attempts: 1 } } } };
  const page = boot({ level: 3, entries: { [adventure.STORAGE_KEY]: old.progress, [game.MAIN_CATCH_STORAGE_KEY]: invalid } });
  assert.deepEqual(page.progress().completed, progress.completed);
  assert.equal(page.state().index, 6);
  assert.equal(page.state().levelId, 3);
});
