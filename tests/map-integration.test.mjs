import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as adventure from '../dist/v8/adventure.js';
import { readEnvelope } from '../dist/v8/journey-store.js';
import { createJourneyGame, startJourneyGame, snapshotJourney } from '../dist/v8/journey-game.js';
import { LEVELS, getLevel, getFinger } from '../dist/v8/curriculum.js';

const source = fs.readFileSync(new URL('../dist/v8/main.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../dist/v8/index.html', import.meta.url), 'utf8');
const MAIN_KEY = 'typing-island-main-catch-v2';
const LEGACY_KEY = 'typing-island-catch-v1';
const STONE_KEY = 'typing-island-stones-v1';

function boot({ progress = adventure.defaultProgress(), saved = {}, noWorld = false, failRemove = false, failSave = false } = {}) {
  const nodes = new Map(), windowEvents = new Map(), documentEvents = new Map();
  const changes = [], pauses = [], configurations = [];
  let reloads = 0;
  const document = {
    activeElement: null, hidden: false,
    createElement(tag) { return new Element(tag); },
    getElementById(id) { return nodes.get(id); },
    addEventListener(name, handler) { documentEvents.set(name, handler); },
  };
  class Element {
    constructor(tag, id = '') {
      this.tagName = tag.toUpperCase();
      this.children = []; this.hidden = false; this.disabled = false;
      this.textContent = ''; this.className = ''; this.attributes = {}; this.isConnected = true;
      this.classList = { toggle() {} };
      this.id = id;
    }
    set id(id) { this._id = id; if (id) nodes.set(id, this); }
    get id() { return this._id; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(name, value) { this.attributes[name] = value; }
    focus() { document.activeElement = this; }
    scrollIntoView() {}
    querySelectorAll() { return flatten(this).filter(node => node !== this && (node.tagName === 'BUTTON' && !node.disabled || node.tagName === 'A' && node.href || node.tagName === 'INPUT')); }
  }
  for (const [, tag, id] of html.matchAll(/<([a-z]+)[^>]*\bid="([^"]+)"[^>]*>/g)) {
    new Element(tag, id);
  }
  nodes.get('dialog').hidden = true;
  nodes.get('error').hidden = true;
  nodes.get('toast').hidden = true;
  nodes.get('dialog').append(nodes.get('closeDialog'), nodes.get('dialogContent'));
  const storageValues = new Map(Object.entries({ [adventure.STORAGE_KEY]: JSON.stringify(progress), ...saved }));
  const storage = {
    getItem(key) { return storageValues.get(key) ?? null; },
    setItem(key, value) { if (failSave) throw new Error('Storage blocked'); storageValues.set(key, value); changes.push(['set', key, value]); },
    removeItem(key) { if (failRemove) throw new Error('Storage blocked'); storageValues.delete(key); changes.push(['remove', key]); },
  };
  const context = vm.createContext({
    ...adventure, readEnvelope, LEVELS, getLevel, getFinger, document, JSON,
    window: { localStorage: storage, addEventListener(name, handler) { windowEvents.set(name, handler); } },
    createWorld() { if (noWorld) throw new Error('No WebGL'); return { configureLevel(id, completed) { configurations.push([id, [...completed]]); }, setPaused(value) { pauses.push(value); } }; },
    navigator: {}, location: { reload() { reloads++; } }, console: { error() {} },
    setTimeout() { return 1; }, clearTimeout() {},
  });
  vm.runInContext(source.replace(/^import[^\n]+\n/gm, ''), context);
  return { nodes, changes, storage, document, windowEvents, documentEvents, pauses, configurations,
    get reloads() { return reloads; },
    cards() { return nodes.get('levelGrid').children; },
    dialogButton(text) { return flatten(nodes.get('dialogContent')).find(node => node.tagName === 'BUTTON' && node.textContent === text); },
  };
}
function flatten(node) { return [node, ...node.children.flatMap(flatten)]; }
function allText(node) { return flatten(node).map(item => item.textContent).join(' '); }
function clickEvent() { return { prevented: false, preventDefault() { this.prevented = true; } }; }
function complete(accuracy = .9) { return { accuracy, bestAccuracy: accuracy, attempts: 1 }; }

 test('map is only lesson selection and every fresh level has its enabled four-mode route', () => {
  const page = boot();
  assert.equal(page.cards().length, 12);
  for (const [i, card] of page.cards().entries()) {
    assert.equal(card.tagName, 'A');
    assert.equal(card.href, `${i < 4 ? 'catch' : 'journey'}.html?level=${i + 1}`);
    assert.equal(card.disabled, false);
    assert.match(card.attributes['aria-label'], /可以开始/);
    assert(allText(card).includes(LEVELS[i].reward.icon));
    const event = clickEvent(); card.onclick(event);
    assert.equal(event.prevented, false);
  }
  assert.equal(page.nodes.get('continueButton').href, 'catch.html?level=1');
  assert.equal(page.nodes.get('dialog').hidden, true);
  assert.deepEqual(page.changes, []);
  assert.deepEqual(page.configurations, [[0, []]]);
  assert.doesNotMatch(html, /id="(?:lesson|start|pause|mute)"|catch-entry|小游戏/);
  assert.doesNotMatch(source, /startWalk|startAdventure|handleAdventureKey|getUnlockedLevel/);
});

test('sparse completions retain their badges and best scores without locking other lessons', () => {
  const progress = adventure.defaultProgress();
  progress.completed[5] = { accuracy: .8, bestAccuracy: .96, attempts: 2 };
  progress.completed[12] = complete(1);
  const page = boot({ progress });
  assert.equal(page.nodes.get('completedCount').textContent, 2);
  assert.match(page.cards()[4].className, /completed-level/);
  assert.match(allText(page.cards()[4]), /最好准确率 96%/);
  assert.match(allText(page.cards()[11]), /最好准确率 100%/);
  assert.deepEqual(page.configurations, [[0, [5, 12]]]);
  assert.equal(page.nodes.get('continueButton').href, 'catch.html?level=1');
  assert.deepEqual(page.changes, []);
});

test('Continue prefers an active freely selected lesson over the suggested route', () => {
  const progress = adventure.defaultProgress();
  progress.active = adventure.snapshotAdventure(adventure.createAdventure(12));
  const page = boot({ progress });
  assert.equal(page.nodes.get('continueButton').href, 'journey.html?level=12');
  assert.equal(page.nodes.get('continueButton').textContent, '继续第 12 关 →');
  assert.deepEqual(page.changes, []);
});

test('valid atomic catch-envelope progress outranks an outdated legacy mirror', () => {
  const legacy = adventure.defaultProgress();
  legacy.completed[1] = complete(.8);
  const latest = adventure.defaultProgress();
  latest.completed[1] = { accuracy: .9, bestAccuracy: 1, attempts: 2 };
  latest.completed[12] = complete(.96);
  latest.active = adventure.snapshotAdventure(adventure.createAdventure(7));
  const page = boot({ progress: legacy, saved: { [MAIN_KEY]: JSON.stringify({ version: 2, sessions: {}, progress: latest }) } });
  assert.equal(page.nodes.get('completedCount').textContent, 2);
  assert.match(allText(page.cards()[0]), /最好准确率 100%/);
  assert.match(allText(page.cards()[11]), /最好准确率 96%/);
  assert.equal(page.nodes.get('continueButton').href, 'journey.html?level=7');
  assert.deepEqual(page.configurations, [[0, [1, 12]]]);
  assert.deepEqual(page.changes, []);
});

test('missing or invalid envelope progress falls back to valid legacy progress without writing', () => {
  const legacy = adventure.defaultProgress();
  legacy.completed[1] = complete(.9);
  for (const value of [null, '{bad json', JSON.stringify({ version: 2, sessions: {} }), JSON.stringify({ version: 2, sessions: {}, progress: { version: 1 } }), JSON.stringify({ version: 3, progress: adventure.defaultProgress() })]) {
    const page = boot({ progress: legacy, saved: value === null ? {} : { [MAIN_KEY]: value } });
    assert.equal(page.nodes.get('completedCount').textContent, 1);
    assert.match(allText(page.cards()[0]), /最好准确率 90%/);
    assert.equal(page.nodes.get('continueButton').href, 'catch.html?level=2');
    assert.deepEqual(page.changes, []);
  }
});

test('suggested route uses the first incomplete lesson and all-complete map offers replay', () => {
  const progress = adventure.defaultProgress();
  progress.completed[1] = complete(); progress.completed[2] = complete();
  let page = boot({ progress });
  assert.equal(page.nodes.get('continueButton').href, 'catch.html?level=3');
  for (const level of LEVELS) progress.completed[level.id] = complete();
  page = boot({ progress });
  assert.equal(page.nodes.get('completedCount').textContent, 12);
  assert.equal(page.nodes.get('continueButton').href, 'catch.html?level=1');
  assert.equal(page.nodes.get('continueButton').textContent, '再走一遍小岛 →');
  assert.deepEqual(page.changes, []);
});

test('word, correction, and sentence lessons remain clearly described', () => {
  const page = boot();
  assert.match(allText(page.cards()[9]), /短词 · 空格/);
  assert.match(allText(page.cards()[10]), /短词 · 退格修正/);
  assert.match(allText(page.cards()[11]), /英文短句 · 综合练习/);
});

test('keyboard help and collection preserve all twelve rewards', () => {
  const page = boot();
  page.nodes.get('keyboardButton').onclick();
  assert.equal(page.nodes.get('dialog').hidden, false);
  const text = allText(page.nodes.get('dialogContent'));
  assert.match(text, /标准 QWERTY/);
  assert.match(text, /退格/); assert.match(text, /空格/); assert.match(text, /F \/ J · 两只食指/);
  page.nodes.get('closeDialog').onclick();
  page.nodes.get('collectionButton').onclick();
  for (const level of LEVELS) assert(allText(page.nodes.get('dialogContent')).includes(level.reward.name));
  assert.deepEqual(page.changes, []);
});

test('reset requires the final explicit confirmation and cancellation preserves every store', () => {
  const page = boot({ saved: { [MAIN_KEY]: '{"version":2,"sessions":{}}', [LEGACY_KEY]: '{"legacy":true}', [STONE_KEY]: '{"stone":true}' } });
  page.nodes.get('resetButton').onclick();
  assert.deepEqual(page.changes, []);
  page.dialogButton('清除本机全部进度').onclick();
  assert.deepEqual(page.changes, []);
  assert.match(allText(page.nodes.get('dialogContent')), /每关的练习进度/);
  page.dialogButton('保留进度').onclick();
  assert.deepEqual(page.changes, []);
  assert.notEqual(page.storage.getItem(MAIN_KEY), null);
  assert.notEqual(page.storage.getItem(LEGACY_KEY), null);
  assert.notEqual(page.storage.getItem(STONE_KEY), null);
  page.nodes.get('resetButton').onclick();
  page.dialogButton('清除本机全部进度').onclick();
  page.dialogButton('确认清除').onclick();
  assert.equal(page.storage.getItem(MAIN_KEY), null);
  assert.equal(page.storage.getItem(LEGACY_KEY), null);
  assert.equal(page.storage.getItem(STONE_KEY), null);
  assert.deepEqual(JSON.parse(page.storage.getItem(adventure.STORAGE_KEY)), adventure.defaultProgress());
  assert.match(page.nodes.get('toast').textContent, /已清除本机全部进度/);
});

test('reset errors never report success', () => {
  const page = boot({ saved: { [MAIN_KEY]: 'retain' }, failRemove: true, failSave: true });
  page.nodes.get('resetButton').onclick();
  page.dialogButton('清除本机全部进度').onclick();
  page.dialogButton('确认清除').onclick();
  assert.equal(page.storage.getItem(MAIN_KEY), 'retain');
  assert.match(page.nodes.get('toast').textContent, /未能确认全部进度已清除/);
  assert.match(page.nodes.get('saveStatus').textContent, /无法保存/);
});

test('failed envelope removal preserves its progress and never overwrites the legacy mirror', () => {
  const legacy = adventure.defaultProgress();
  legacy.completed[1] = complete(.9);
  const latest = adventure.defaultProgress();
  latest.completed[12] = complete(1);
  const envelope = JSON.stringify({ version: 2, sessions: {}, progress: latest });
  const page = boot({ progress: legacy, saved: { [MAIN_KEY]: envelope }, failRemove: true });
  page.nodes.get('resetButton').onclick();
  page.dialogButton('清除本机全部进度').onclick();
  page.dialogButton('确认清除').onclick();
  assert.equal(page.storage.getItem(MAIN_KEY), envelope);
  assert.deepEqual(JSON.parse(page.storage.getItem(adventure.STORAGE_KEY)), legacy);
  assert.match(allText(page.cards()[11]), /最好准确率 100%/);
  assert.deepEqual(page.changes, []);
  assert.match(page.nodes.get('toast').textContent, /未能确认全部进度已清除/);
});

test('cross-tab updates, deletions, and clearing offer refresh and guard stale navigation or reset', () => {
  for (const key of [adventure.STORAGE_KEY, MAIN_KEY, LEGACY_KEY, null]) {
    const page = boot();
    page.windowEvents.get('storage')({ storageArea: page.storage, key, newValue: null });
    assert.equal(page.nodes.get('dialog').hidden, false);
    assert.match(allText(page.nodes.get('dialogContent')), /另一个页面更新/);
    page.nodes.get('closeDialog').onclick();
    const event = clickEvent(); page.cards()[11].onclick(event);
    assert.equal(event.prevented, true);
    page.nodes.get('resetButton').onclick();
    assert.equal(page.dialogButton('清除本机全部进度'), undefined);
    page.dialogButton('刷新并继续').onclick();
    assert.equal(page.reloads, 1);
    assert.deepEqual(page.changes, []);
  }
});

test('unrelated storage is ignored, browser Back refreshes saved progress, and hiding pauses the world', () => {
  const page = boot();
  page.windowEvents.get('storage')({ storageArea: page.storage, key: 'another-app', newValue: '{}' });
  assert.equal(page.nodes.get('dialog').hidden, true);
  page.windowEvents.get('pageshow')({ persisted: true });
  assert.equal(page.reloads, 1);
  page.document.hidden = true;
  page.documentEvents.get('visibilitychange')();
  assert.equal(page.pauses.at(-1), true);
});

test('map links and controls remain usable when the decorative WebGL world cannot load', () => {
  const page = boot({ noWorld: true });
  assert.equal(page.nodes.get('error').hidden, false);
  assert.equal(page.cards().length, 12);
  for (const card of page.cards()) assert.equal(card.disabled, false);
  assert.equal(page.nodes.get('continueButton').href, 'catch.html?level=1');
  page.nodes.get('keyboardButton').onclick();
  assert.equal(page.nodes.get('dialog').hidden, false);
});

test('dialog Escape restores focus and Tab remains inside the modal', () => {
  const page = boot();
  page.nodes.get('keyboardButton').focus();
  page.nodes.get('keyboardButton').onclick();
  const event = { ...clickEvent(), key: 'Tab', shiftKey: true };
  page.windowEvents.get('keydown')(event);
  assert.equal(event.prevented, true);
  assert.equal(page.document.activeElement, page.nodes.get('closeDialog'));
  page.windowEvents.get('keydown')({ ...clickEvent(), key: 'Escape' });
  assert.equal(page.nodes.get('dialog').hidden, true);
  assert.equal(page.document.activeElement, page.nodes.get('keyboardButton'));
});


test('Continue returns to the validated last unfinished journey ahead of the first incomplete lesson', () => {
  const state = startJourneyGame(createJourneyGame(11));
  const saved = { version: 2, sessions: {}, journeys: { 11: { snapshot: snapshotJourney(state), awarded: false, notice: '' } }, progress: adventure.defaultProgress(), lastJourney: 11 };
  const page = boot({ saved: { [MAIN_KEY]: JSON.stringify(saved) } });
  assert.equal(page.nodes.get('continueButton').href, 'journey.html?level=11');
  assert.equal(page.nodes.get('continueButton').textContent, '继续第 11 关 →');
  assert.deepEqual(page.changes, []);
});

test('confirmed reset clears the atomic envelope including journeys, catch sessions and shared best scores', () => {
  const progress = adventure.defaultProgress(); progress.completed[10] = { accuracy: .9, bestAccuracy: 1, attempts: 3 };
  const saved = { version: 2, sessions: {}, journeys: { 10: { snapshot: snapshotJourney(createJourneyGame(10)), awarded: false, notice: '' } }, progress, lastJourney: 10 };
  const page = boot({ saved: { [MAIN_KEY]: JSON.stringify(saved) } });
  page.nodes.get('resetButton').onclick(); page.dialogButton('清除本机全部进度').onclick();
  assert.equal(JSON.parse(page.storage.getItem(MAIN_KEY)).journeys[10].snapshot.levelId, 10);
  page.dialogButton('确认清除').onclick();
  assert.equal(page.storage.getItem(MAIN_KEY), null);
  assert.deepEqual(JSON.parse(page.storage.getItem(adventure.STORAGE_KEY)), adventure.defaultProgress());
  assert.equal(page.nodes.get('completedCount').textContent, 0);
  assert.equal(page.nodes.get('continueButton').href, 'catch.html?level=1');
});
