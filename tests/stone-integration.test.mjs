import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import * as game from '../dist/v8/stone-game.js';
import * as adventure from '../dist/v8/adventure.js';
import * as catchGame from '../dist/v8/catch-game.js';
import { createFeedback, isControlActivation } from '../dist/v8/feedback.js';

const root = path.resolve(import.meta.dirname, '../dist/v8');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = [...read('sw.js').match(/const FILES=\[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
const sequence = ['F', 'J', 'F', 'F', 'J', 'F', 'J', 'J'];
const key = token => ({ code: token.length === 1 ? `Key${token}` : token,
  key: token === 'Space' ? ' ' : token === 'Backspace' ? token : token.toLowerCase() });
const snapshot = page => game.snapshotStone(page.state());

// Run the real page controller with a deliberately small DOM and fake renderer.
// This verifies controller integration, not WebGL rendering or browser layout.
function boot({ entries = {}, unavailable = false, rendererFailure = false } = {}) {
  const nodes = new Map(), allNodes = [], windowEvents = new Map(), documentEvents = new Map();
  const reads = [], writes = [], removals = [], rendered = [], timers = new Map();
  const store = new Map(Object.entries(entries).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
  let frame, now = 0, timerId = 0, reloads = 0, disposed = 0, cancelled = 0;
  const document = {
    hidden: false, activeElement: null,
    getElementById(id) { return nodes.get(id); },
    createElement(tag) { return element(tag); },
    querySelectorAll(selector) { return selector === '[data-key]' ? allNodes.filter(node => node.dataset.key) : []; },
    addEventListener(name, callback) { documentEvents.set(name, callback); }
  };
  function element(tag, id = '') {
    const classes = new Set();
    const node = { tagName: tag.toUpperCase(), id, hidden: false, dataset: {}, children: [], attributes: {}, parentNode: null,
      classList: { toggle(name, enabled) { const on = enabled ?? !classes.has(name); on ? classes.add(name) : classes.delete(name); return on; }, add(...names) { names.forEach(name => classes.add(name)); }, remove(...names) { names.forEach(name => classes.delete(name)); }, contains(name) { return classes.has(name); } },
      append(...children) { for (const child of children) { child.parentNode = this; this.children.push(child); } },
      replaceChildren(...children) { this.children.forEach(child => { child.parentNode = null; }); this.children = []; this.append(...children); },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      getAttribute(name) { return this.attributes[name] ?? null; },
      focus() { document.activeElement = this; },
      blur() { if (document.activeElement === this) document.activeElement = null; },
      closest() { return ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(this.tagName) ? this : null; },
      querySelectorAll() { return this.children.flatMap(child => [child, ...child.querySelectorAll()]).filter(child => ['BUTTON', 'A'].includes(child.tagName)); }
    };
    let text = '';
    Object.defineProperty(node, 'textContent', { get() { return text; }, set(value) { text = String(value); } });
    allNodes.push(node);
    if (id) nodes.set(id, node);
    return node;
  }
  for (const [, tag, before, id, after] of read('stone.html').matchAll(/<([a-z][a-z0-9]*)\b([^>]*?)id="([^"]+)"([^>]*)>/gi)) {
    const node = element(tag, id); node.hidden = /\bhidden\b/.test(before + after);
  }
  for (const [, tag, token] of read('stone.html').matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bdata-key="([^"]+)"[^>]*>/gi)) {
    element(tag).dataset.key = token;
  }
  for (const [parent, button] of [['paused', 'resume'], ['done', 'replay']]) {
    const link = element('a'); link.href = './'; nodes.get(parent).append(nodes.get(button), link);
  }
  const localStorage = {
    getItem(key) { reads.push(key); if (unavailable) throw Error('Storage unavailable'); return store.get(key) ?? null; },
    setItem(key, value) { if (unavailable) throw Error('Storage unavailable'); store.set(key, value); writes.push([key, JSON.parse(value)]); },
    removeItem(key) { store.delete(key); removals.push(key); }
  };
  const schedule = (callback, delay) => { const id = ++timerId; timers.set(id, { callback, at: now + delay }); return id; };
  const cancel = id => timers.delete(id);
  const context = vm.createContext({
    ...game, isControlActivation, createFeedback: callback => createFeedback(callback, schedule, cancel),
    document, localStorage, JSON, URL, performance: { now: () => now },
    window: { localStorage, addEventListener: (name, callback) => windowEvents.set(name, callback) },
    navigator: {}, console: { error() {} }, setTimeout: schedule, clearTimeout: cancel,
    requestAnimationFrame: callback => { frame = callback; return 1; }, cancelAnimationFrame() { cancelled++; },
    createStoneWorld: () => { if (rendererFailure) throw Error('No WebGL'); return { render(state, dt) { rendered.push({ state: game.snapshotStone(state), dt }); }, dispose() { disposed++; } }; },
    location: { href: 'https://example.test/typing-island/stone.html', reload() { reloads++; } }
  });
  vm.runInContext(read('stone.js').replace(/^import[^\n]+\n/gm, ''), context);
  return { nodes, allNodes, document, localStorage, reads, writes, removals, store, windowEvents, documentEvents, rendered,
    advance(seconds) { now += seconds * 1000; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); } frame(now); },
    press(token, extra = {}) { let prevented = false; windowEvents.get('keydown')({ ...key(token), preventDefault() { prevented = true; }, ...extra }); return prevented; },
    state() { return vm.runInContext('state', context); },
    entries() { return Object.fromEntries(store); },
    get reloads() { return reloads; }, get disposed() { return disposed; }, get cancelled() { return cancelled; }
  };
}

function start(page) { page.nodes.get('start').onclick(); }
function hop(page) { assert.equal(page.press(page.state().target), true); page.advance(.75); }
function reachArrival(page) {
  start(page);
  for (let i = 0; i < sequence.length; i++) { assert.equal(page.state().target, sequence[i]); hop(page); }
  assert.equal(page.state().phase, 'arriving');
}
function finish(page) { reachArrival(page); page.advance(1.8); assert.equal(page.state().phase, 'complete'); }


test('stone page DOM bindings and every transitive asset resolve to self-hosted precached files', () => {
  const html = read('stone.html'), source = read('stone.js'), visited = new Set();
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const [, id] of source.matchAll(/\$\('([^']+)'\)/g)) assert(ids.includes(id), `Missing stone #${id}`);
  function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    assert(manifest.includes(`./${file}`), `Not precached: ${file}`);
    assert(fs.existsSync(path.join(root, file)), `Missing asset: ${file}`);
    if (file.endsWith('.js')) {
      const code = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
      for (const [, dependency] of code.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)) {
        assert(dependency.startsWith('./'), `External dependency in ${file}: ${dependency}`);
        visit(path.posix.normalize(path.posix.join(path.posix.dirname(file), dependency)));
      }
    }
  }
  visit('stone.html');
  for (const [, asset] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) if (asset !== './') visit(asset.split('?')[0]);
  assert.equal(game.STONE_STORAGE_KEY, 'typing-island-stones-v1');
  assert.notEqual(game.STONE_STORAGE_KEY, adventure.STORAGE_KEY);
  assert.notEqual(game.STONE_STORAGE_KEY, catchGame.MAIN_CATCH_STORAGE_KEY);
  assert.notEqual(game.STONE_STORAGE_KEY, catchGame.CATCH_STORAGE_KEY);
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(read('stone.css'), /\.small-key\.wrong\{[^}]*#fac7ba/);
});

test('the map adds one optional stone entry while keeping the twelve-lesson catch grid and default route', () => {
  const html = read('index.html'), source = read('main.js');
  assert.equal([...html.matchAll(/href="stone\.html"/g)].length, 1);
  assert.match(html, /<a class="stone-entry" href="stone\.html">[\s\S]*?F \/ J[\s\S]*?<\/a>/);
  assert.match(html, /<nav class="map-grid" id="levelGrid" aria-label="全部十二关，均可自由选择"><\/nav>/);
  assert.match(html, /id="continueButton" href="catch\.html\?level=1"/);
  assert.match(source, /for \(const level of LEVELS\)/);
});

test('fresh page waits for start and follows exactly eight F/J hops before the picnic arrival', () => {
  const page = boot();
  assert.equal(page.state().phase, 'ready');
  assert.equal(page.state().target, 'F');
  assert.equal(page.nodes.get('start').hidden, false);
  assert.equal(page.nodes.get('pause').hidden, true);
  assert.equal(page.document.activeElement, page.nodes.get('start'));
  const ready = snapshot(page); page.press('F'); page.advance(5); assert.deepEqual(snapshot(page), ready);
  start(page);
  for (const [i, token] of sequence.entries()) {
    assert.equal(page.state().target, token);
    assert.equal(page.press(token), true);
    assert.equal(page.state().phase, 'hopping');
    assert.equal(page.nodes.get('done').hidden, true);
    page.advance(.5);
    assert.equal(page.state().phase, 'hopping');
    page.advance(.25);
    assert.equal(page.state().index, i + 1);
    assert.equal(page.nodes.get('count').textContent, String(i + 1));
  }
  assert.equal(page.state().phase, 'arriving');
  assert.equal(page.state().target, null);
  page.advance(1.5);
  assert.equal(page.state().phase, 'arriving');
  assert.equal(page.nodes.get('done').hidden, true);
  page.advance(.3);
  assert.equal(page.state().phase, 'complete');
  assert.equal(page.nodes.get('done').hidden, false);
  assert.equal(page.nodes.get('pause').hidden, true);
  assert.equal(page.document.activeElement, page.nodes.get('replay'));
  const completed = snapshot(page); page.press('F'); page.advance(30); assert.deepEqual(snapshot(page), completed);
});

test('wrong physical key is shown in red without advancing, and correct input clears feedback', () => {
  const page = boot(); start(page);
  assert.equal(page.press('J'), true);
  assert.equal(page.state().index, 0);
  assert.equal(page.state().target, 'F');
  assert.equal(page.state().wrong, 1);
  assert.equal(page.nodes.get('wrongKey').textContent, 'J');
  assert.match(page.nodes.get('wrongText').textContent, /按到了 J.*左手食指 F/);
  assert.equal(page.nodes.get('feedback').classList.contains('visible'), true);
  assert.equal(page.allNodes.find(node => node.dataset.key === 'J').classList.contains('wrong'), true);
  assert.equal(page.allNodes.find(node => node.dataset.key === 'F').classList.contains('wrong'), false);
  assert.equal(page.press('X'), true);
  assert.equal(page.nodes.get('wrongKey').textContent, 'X');
  assert.equal(page.state().index, 0);
  assert.equal(page.state().wrong, 2);
  page.press('F');
  assert.equal(page.nodes.get('feedback').classList.contains('visible'), false);
  assert(page.allNodes.filter(node => node.dataset.key).every(node => !node.classList.contains('wrong')));
  page.advance(.75);
  assert.equal(page.state().target, 'J');
  assert.equal(page.state().wrong, 2);
});

test('wrong feedback expires, clears on pause, and is never restored as saved progress', () => {
  const page = boot(); start(page); page.press('X');
  page.advance(1);
  assert.equal(page.nodes.get('feedback').classList.contains('visible'), true);
  page.press('J'); page.advance(1);
  assert.equal(page.nodes.get('wrongKey').textContent, 'J');
  assert.equal(page.nodes.get('feedback').classList.contains('visible'), true);
  page.advance(.8);
  assert.equal(page.nodes.get('feedback').classList.contains('visible'), false);
  page.press('X'); page.nodes.get('pause').onclick();
  assert.equal(page.nodes.get('feedback').classList.contains('visible'), false);
  const refreshed = boot({ entries: page.entries() });
  assert.equal(refreshed.state().wrong, 3);
  assert.equal(refreshed.state().index, 0);
  assert.equal(refreshed.state().paused, true);
  assert.equal(refreshed.nodes.get('feedback').classList.contains('visible'), false);
});

test('repeat, modified shortcuts, and composition never count as an exercise attempt', () => {
  const page = boot(); start(page);
  const initial = snapshot(page);
  for (const extra of [{ repeat: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { isComposing: true }, { keyCode: 229 }, { which: 229 }]) {
    assert.equal(page.press('F', extra), false);
    assert.deepEqual(snapshot(page), initial);
  }
  assert.match(page.nodes.get('instruction').textContent, /切换到英文输入法/);
  assert.equal(page.press('F'), true);
  assert.equal(page.state().phase, 'hopping');
});

test('all input while airborne or arriving is ignored, including rapid correct keys', () => {
  const page = boot(); start(page); page.press('F'); page.advance(.25);
  const airborne = snapshot(page);
  for (const token of ['J', 'F', 'X', 'Space', 'Backspace']) {
    assert.equal(page.press(token), false);
    assert.deepEqual(snapshot(page), airborne);
  }
  page.advance(.5);
  assert.equal(page.state().index, 1);
  for (let i = 1; i < sequence.length; i++) hop(page);
  const arrival = snapshot(page);
  for (const token of ['F', 'J', 'X']) { assert.equal(page.press(token), false); assert.deepEqual(snapshot(page), arrival); }
  assert.equal(page.state().wrong, 0);
});

test('Enter starts only when it is not activating a focused link or button', () => {
  const page = boot();
  assert.equal(page.press('Enter', { key: 'Enter' }), false);
  assert.equal(page.state().phase, 'ready');
  page.nodes.get('start').blur();
  assert.equal(page.press('Enter', { key: 'Enter' }), true);
  assert.notEqual(page.state().phase, 'ready');
  const before = snapshot(page);
  page.nodes.get('pause').focus();
  assert.equal(page.press('Space'), false);
  assert.deepEqual(snapshot(page), before);
});

test('pause, window blur, visibility and Escape freeze progress until resume', () => {
  for (const reason of ['button', 'blur', 'visibility', 'escape']) {
    const page = boot(); start(page); page.press('F'); page.advance(.25);
    if (reason === 'button') page.nodes.get('pause').onclick();
    else if (reason === 'blur') page.windowEvents.get('blur')();
    else if (reason === 'visibility') { page.document.hidden = true; page.documentEvents.get('visibilitychange')(); }
    else page.press('Escape', { key: 'Escape' });
    assert.equal(page.state().paused, true, reason);
    assert.equal(page.nodes.get('paused').hidden, false);
    assert.equal(page.document.activeElement, page.nodes.get('resume'));
    const paused = snapshot(page); page.advance(60); page.press('F'); assert.deepEqual(snapshot(page), paused);
    page.nodes.get('resume').onclick();
    assert.equal(page.state().paused, false);
    page.advance(.5);
    assert.equal(page.state().index, 1);
    assert.equal(page.state().target, 'J');
  }
});

test('refresh during a hop preserves its exact pose time and resumes paused without duplicate credit', () => {
  const original = boot(); start(original); hop(original); original.press('J'); original.advance(.25);
  original.windowEvents.get('pagehide')();
  const saved = snapshot(original), page = boot({ entries: original.entries() });
  assert.equal(page.state().paused, true);
  assert.equal(page.state().phase, 'hopping');
  assert.equal(page.nodes.get('paused').hidden, false);
  assert.equal(page.document.activeElement, page.nodes.get('resume'));
  assert.deepEqual({ ...snapshot(page), paused: saved.paused }, saved);
  const paused = snapshot(page); page.advance(80); assert.deepEqual(snapshot(page), paused);
  page.nodes.get('resume').onclick(); page.advance(.5);
  assert.equal(page.state().index, 2);
  assert.equal(page.state().target, 'F');
  page.advance(20);
  assert.equal(page.state().index, 2);
  assert.equal(original.disposed, 1);
  assert.equal(original.cancelled, 1);
});

test('pausing the final hop and arrival postpones the completed overlay until actual arrival', () => {
  const page = boot(); start(page);
  for (let i = 0; i < sequence.length - 1; i++) hop(page);
  page.press('J'); page.advance(.25); page.nodes.get('pause').onclick(); page.advance(30);
  assert.equal(page.state().index, 7);
  assert.equal(page.nodes.get('done').hidden, true);
  page.nodes.get('resume').onclick(); page.advance(.5);
  assert.equal(page.state().phase, 'arriving');
  page.advance(.5); page.nodes.get('pause').onclick();
  const saved = snapshot(page); page.advance(30); assert.deepEqual(snapshot(page), saved);
  assert.equal(page.nodes.get('done').hidden, true);
  page.windowEvents.get('pagehide')();
  const refreshed = boot({ entries: page.entries() });
  assert.equal(refreshed.state().phase, 'arriving');
  assert.equal(refreshed.state().paused, true);
  refreshed.nodes.get('resume').onclick(); refreshed.advance(1.3);
  assert.equal(refreshed.state().phase, 'complete');
  assert.equal(refreshed.nodes.get('done').hidden, false);
});

test('complete refresh stays complete and replay resets only the independent stone attempt', () => {
  const entries = {
    [adventure.STORAGE_KEY]: { independent: 'map' },
    [catchGame.MAIN_CATCH_STORAGE_KEY]: { independent: 'main catch' },
    [catchGame.CATCH_STORAGE_KEY]: { independent: 'legacy catch' }
  };
  const page = boot({ entries }); start(page); page.press('X');
  for (const token of sequence) { assert.equal(page.state().target, token); hop(page); }
  page.advance(1.8);
  assert.equal(page.state().wrong, 1);
  assert(page.reads.every(key => key === game.STONE_STORAGE_KEY));
  assert(page.writes.every(([key]) => key === game.STONE_STORAGE_KEY));
  assert.deepEqual(page.removals, []);
  for (const [key, value] of Object.entries(entries)) assert.equal(page.store.get(key), JSON.stringify(value));
  const refreshed = boot({ entries: page.entries() });
  assert.equal(refreshed.state().phase, 'complete');
  assert.equal(refreshed.state().paused, false);
  assert.equal(refreshed.document.activeElement, refreshed.nodes.get('replay'));
  refreshed.nodes.get('replay').onclick();
  assert.equal(refreshed.state().phase, 'ready');
  assert.equal(refreshed.state().index, 0);
  assert.equal(refreshed.state().wrong, 0);
  assert.equal(refreshed.state().target, 'F');
  assert.equal(refreshed.nodes.get('done').hidden, true);
  assert.equal(refreshed.document.activeElement, refreshed.nodes.get('start'));
  finish(refreshed);
  for (const [key, value] of Object.entries(entries)) assert.equal(refreshed.store.get(key), JSON.stringify(value));
});

test('storage conflicts freeze gameplay and block stale frame and pagehide writes', () => {
  for (const key of [game.STONE_STORAGE_KEY, null]) {
    const page = boot(); start(page); page.press('F'); page.advance(.25);
    const writes = page.writes.length;
    page.windowEvents.get('storage')({ storageArea: page.localStorage, key, newValue: '{}' });
    assert.equal(page.state().paused, true);
    assert.equal(page.nodes.get('paused').hidden, false);
    assert.equal(page.nodes.get('resume').textContent, '刷新并继续');
    assert.match(page.nodes.get('pauseHeading').textContent, /另一页面更新/);
    assert.equal(page.document.activeElement, page.nodes.get('resume'));
    const paused = snapshot(page); page.press('F'); page.advance(60); page.windowEvents.get('pagehide')();
    assert.deepEqual(snapshot(page), paused);
    assert.equal(page.writes.length, writes);
    page.nodes.get('resume').onclick();
    assert.equal(page.reloads, 1);
  }
});

test('unrelated storage is ignored and browser Back forces a fresh saved-state load', () => {
  const page = boot(); start(page);
  for (const key of [adventure.STORAGE_KEY, catchGame.MAIN_CATCH_STORAGE_KEY, catchGame.CATCH_STORAGE_KEY, 'another-app']) {
    page.windowEvents.get('storage')({ storageArea: page.localStorage, key, newValue: '{}' });
    assert.equal(page.state().paused, false);
    assert.equal(page.nodes.get('paused').hidden, true);
  }
  page.windowEvents.get('storage')({ storageArea: {}, key: game.STONE_STORAGE_KEY, newValue: '{}' });
  assert.equal(page.state().paused, false);
  page.windowEvents.get('pageshow')({ persisted: false }); assert.equal(page.reloads, 0);
  page.windowEvents.get('pageshow')({ persisted: true }); assert.equal(page.reloads, 1);
});

test('storage denial and later save failure keep the attempt playable with an honest warning', () => {
  const page = boot({ unavailable: true });
  assert.match(page.nodes.get('saveNote').textContent, /无法保存/);
  finish(page);
  assert.equal(page.writes.length, 0);
  const quota = boot(); start(quota);
  const save = quota.localStorage.setItem.bind(quota.localStorage);
  quota.localStorage.setItem = () => { throw Error('Quota reached'); };
  hop(quota);
  assert.equal(quota.state().index, 1);
  assert.match(quota.nodes.get('saveNote').textContent, /无法保存/);
  quota.localStorage.setItem = save;
  quota.nodes.get('pause').onclick();
  assert.match(quota.nodes.get('saveNote').textContent, /本机自动保存/);
  const refreshed = boot({ entries: quota.entries() });
  assert.equal(refreshed.state().index, 1);
  assert.equal(refreshed.state().paused, true);
});

test('restored ready and complete snapshots clear stray pause flags and keep their visible controls usable', () => {
  const readySave = { ...game.snapshotStone(game.createStoneGame()), paused: true };
  assert(game.restoreStone(readySave));
  const ready = boot({ entries: { [game.STONE_STORAGE_KEY]: readySave } });
  assert.equal(ready.state().paused, false);
  assert.equal(ready.nodes.get('paused').hidden, true);
  assert.equal(ready.document.activeElement, ready.nodes.get('start'));
  start(ready); hop(ready);
  assert.equal(ready.state().index, 1);
  const original = boot(); finish(original);
  const completeSave = { ...snapshot(original), paused: true };
  assert(game.restoreStone(completeSave));
  const completed = boot({ entries: { [game.STONE_STORAGE_KEY]: completeSave } });
  assert.equal(completed.state().phase, 'complete');
  assert.equal(completed.state().paused, false);
  assert.equal(completed.nodes.get('paused').hidden, true);
  assert.equal(completed.nodes.get('done').hidden, false);
  assert.equal(completed.document.activeElement, completed.nodes.get('replay'));
  completed.nodes.get('replay').onclick();
  start(completed); hop(completed);
  assert.equal(completed.state().index, 1);
});

test('invalid saved data safely starts fresh and never borrows catch or map records', () => {
  for (const saved of ['{bad json', 'null', '[]', '{"version":999}', '{"phase":"complete","index":8}']) {
    const page = boot({ entries: { [game.STONE_STORAGE_KEY]: saved, [catchGame.CATCH_STORAGE_KEY]: { version: 1, index: 8, phase: 'complete' } } });
    assert.equal(page.state().phase, 'ready', saved);
    assert.equal(page.state().index, 0);
    assert.equal(page.state().target, 'F');
    assert(page.writes.every(([key]) => key === game.STONE_STORAGE_KEY));
  }
});

test('pause and completion dialogs keep Tab focus within controls and include a map exit', () => {
  const page = boot(); start(page); page.nodes.get('pause').onclick();
  for (const [modalId, buttonId] of [['paused', 'resume'], ['done', 'replay']]) {
    if (modalId === 'done') { page.nodes.get('resume').onclick(); for (const token of sequence) { assert.equal(page.state().target, token); hop(page); } page.advance(1.8); }
    const modal = page.nodes.get(modalId), controls = modal.querySelectorAll('button,a'), link = controls.at(-1);
    assert.equal(link.href, './');
    page.nodes.get(buttonId).focus();
    assert.equal(page.press('Tab', { key: 'Tab', shiftKey: true }), true);
    assert.equal(page.document.activeElement, link);
    assert.equal(page.press('Tab', { key: 'Tab' }), true);
    assert.equal(page.document.activeElement, page.nodes.get(buttonId));
  }
});

test('renderer failure reports the problem and never starts an invisible attempt', () => {
  const page = boot({ rendererFailure: true });
  assert.equal(page.nodes.get('error').hidden, false);
  start(page); page.press('F'); page.advance(10);
  assert.equal(page.state().phase, 'ready');
  assert.equal(page.state().index, 0);
  assert.match(read('stone.html'), /id="error"[\s\S]*href="\.\/"/);
});

test('offline navigation preserves stone route, query strings, and map exits', async () => {
  const handlers = new Map(), scope = 'https://example.test/typing-island/';
  const stored = new Map(manifest.map(file => [new URL(file, scope).href, { asset: file }]));
  vm.runInContext(read('sw.js'), vm.createContext({ URL,
    self: { location: new URL('sw.js', scope), addEventListener: (name, callback) => handlers.set(name, callback) },
    fetch: async () => { throw Error('offline'); },
    caches: { async match(request, options = {}) {
      const url = new URL(typeof request === 'string' ? request : request.url, scope);
      if (options.ignoreSearch) url.search = '';
      return stored.get(url.href);
    } }
  }));
  for (const [route, expected] of [['stone.html', './stone.html'], ['stone.html?resume=1', './stone.html'], ['index.html?from=stone', './index.html'], ['', './']]) {
    let result;
    handlers.get('fetch')({ request: { url: new URL(route, scope).href, mode: 'navigate', method: 'GET' }, respondWith(promise) { result = promise; } });
    assert.equal((await result).asset, expected, route);
  }
});
