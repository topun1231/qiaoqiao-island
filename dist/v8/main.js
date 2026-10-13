import { getJourneyLesson } from './journey-game.js';
import { readEnvelope } from './journey-store.js';
import { createWorld } from './world.js';
import { LEVELS, getLevel, getFinger } from './curriculum.js';
import { defaultProgress, loadProgress, saveProgress, validateProgress, STORAGE_KEY } from './adventure.js';

const MAIN_CATCH_STORAGE_KEY = 'typing-island-main-catch-v2';
const LEGACY_CATCH_STORAGE_KEY = 'typing-island-catch-v1';
const STONE_STORAGE_KEY = 'typing-island-stones-v1';
const $ = id => document.getElementById(id);
let storage;
try { storage = window.localStorage; } catch {}
// The catch envelope commits sessions and their reward progress together. Its
// valid progress is authoritative even if the compatibility mirror could not save.
function loadMapProgress() {
  try {
    const raw = storage?.getItem(MAIN_CATCH_STORAGE_KEY);
    if (typeof raw === 'string' && raw.length <= 300_000) {
      const envelope = JSON.parse(raw);
      if (envelope?.version === 2 && validateProgress(envelope.progress)) {
        return { progress: envelope.progress, persistent: true };
      }
    }
  } catch {}
  return loadProgress(storage);
}
const loaded = loadMapProgress();
let progress = loaded.progress;
let persistent = loaded.persistent;
let world;
let conflict = false;
let previousFocus = null;
let toastTimer;

try {
  world = createWorld($('world'));
} catch (error) {
  console.error(error);
  $('error').hidden = false;
}

const completedIds = () => Object.keys(progress.completed).map(Number);
const label = key => key === 'Space' ? '空格' : key === 'Backspace' ? '退格' : key;
const levelHref = id => `${id<=4?'catch':'journey'}.html?level=${id}`;
const modeLabel=id=>id<=4?'接果子':id<=9?'跳石过河':id<=11?'整理小屋':'送邀请信';
const suggestedLevel = () => LEVELS.find(level => !progress.completed[level.id])?.id ?? 1;

function notify(text) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000);
}

function makeButton(text, className, onclick) {
  const button = document.createElement('button');
  button.textContent = text;
  button.className = className;
  button.onclick = onclick;
  return button;
}

function guardNavigation(event) {
  if (!conflict) return;
  event.preventDefault();
  showConflict();
}

function renderMap() {
  const ids = completedIds();
  const suggested = suggestedLevel();
  const journeyId=readEnvelope(storage).envelope.lastJourney;
  const activeId = getLevel(journeyId)?.id??getLevel(progress.active?.levelId)?.id;
  $('completedCount').textContent = ids.length;
  $('count').textContent = ids.length;
  $('levelGrid').replaceChildren();
  for (const level of LEVELS) {
    const done = progress.completed[level.id];
    const card = document.createElement('a');
    card.className = 'level-card' + (done ? ' completed-level' : '') + (level.id === suggested && !done ? ' current-level' : '');
    card.href = levelHref(level.id);
    card.setAttribute('aria-label', `第 ${level.id} 关 ${level.title}，${done ? `已完成，可重玩，最好准确率 ${Math.round(done.bestAccuracy * 100)}%` : '可以开始'}`);
    card.onclick = guardNavigation;
    const top = document.createElement('div');
    top.className = 'card-top';
    const number = document.createElement('span');
    number.className = 'level-number';
    number.textContent = `第 ${String(level.id).padStart(2, '0')} 关 · ${modeLabel(level.id)}`;
    const icon = document.createElement('span');
    icon.className = 'card-icon';
    icon.textContent = level.reward.icon;
    top.append(number, icon);
    const title = document.createElement('h3');
    title.textContent = level.id>=5 ? `${modeLabel(level.id)} · ${level.id<=9?level.newKeys.join(' / '):level.id===10?'短词':level.id===11?'改标签':'邀请朋友'}` : level.title;
    const detail = document.createElement('p');
    detail.textContent = done ? `最好准确率 ${Math.round(done.bestAccuracy * 100)}%`
      : level.id === 10 ? '短词 · 空格'
      : level.id === 11 ? '短词 · 退格修正'
      : level.id === 12 ? '英文短句 · 综合练习'
      : level.newKeys.map(label).join(' · ');
    card.append(top, title, detail);
    if (done) {
      const check = document.createElement('span');
      check.className = 'card-check';
      check.textContent = '✓';
      check.setAttribute('aria-hidden', 'true');
      card.append(check);
    }
    $('levelGrid').append(card);
  }
  const id = activeId ?? suggested;
  $('continueButton').href = levelHref(id);
  $('continueButton').textContent = activeId ? `继续第 ${id} 关 →`
    : ids.length === LEVELS.length ? '再走一遍小岛 →'
    : id === 1 ? '从第一关出发 →' : `接着练第 ${id} 关 →`;
  $('mapIntro').textContent = ids.length === LEVELS.length
    ? '12 枚成长印章都集齐了！任选喜欢的玩法，再陪小熊练一会儿'
    : '接果子、跳石过河、整理小屋、送邀请信。任选一关，也可以按顺序慢慢练习';
  $('saveStatus').textContent = persistent
    ? '每关进度自动保存在这台浏览器 · 切换关卡会保留练习'
    : '当前无法保存，关闭后进度可能丢失';
  world?.configureLevel(0, ids);
  world?.setPaused(false);
}

function openDialog(title, build) {
  if ($('dialog').hidden) previousFocus = document.activeElement;
  world?.setPaused(true);
  $('dialogContent').replaceChildren();
  const heading = document.createElement('h2');
  heading.id = 'dialogTitle';
  heading.textContent = title;
  $('dialogContent').append(heading);
  build($('dialogContent'));
  $('dialog').hidden = false;
  $('closeDialog').focus({ preventScroll: true });
}

function closeDialog() {
  if ($('dialog').hidden) return;
  $('dialog').hidden = true;
  world?.setPaused(document.hidden);
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
}

function showKeyboard() {
  openDialog('让手指找到自己的家', box => {
    const introduction = document.createElement('p');
    introduction.textContent = '适用于标准 QWERTY 键盘。请连接实体键盘，切换到英文输入法，手腕放松，眼睛看屏幕。F 和 J 的小凸点能帮食指定位。';
    box.append(introduction);
    for (const row of ['QWERTYUIOP', 'ASDFGHJKL;', 'ZXCVBNM']) {
      const line = document.createElement('div');
      line.className = 'keyboard-row';
      for (const key of row) {
        const keycap = document.createElement('span');
        keycap.className = 'keyboard-key' + (['F', 'J'].includes(key) ? ' home target' : '');
        keycap.textContent = key;
        line.append(keycap);
      }
      box.append(line);
    }
    const special = document.createElement('div');
    special.className = 'keyboard-row';
    for (const key of ['Space', 'Backspace']) {
      const keycap = document.createElement('span');
      keycap.className = 'keyboard-key ' + (key === 'Space' ? 'space' : 'backspace');
      keycap.textContent = label(key);
      special.append(keycap);
    }
    box.append(special);
    const detail = document.createElement('div');
    detail.className = 'finger-detail';
    const title = document.createElement('strong');
    title.textContent = 'F / J · 两只食指';
    const hint = document.createElement('p');
    hint.textContent = getFinger('F').returnHint;
    detail.append(title, hint);
    box.append(detail);
    const legend = document.createElement('div');
    legend.className = 'finger-legend';
    for (const text of ['左小指 · Q A Z', '右小指 · P 与退格', '左无名指 · W S X', '右无名指 · O L', '左中指 · E D C', '右中指 · I K', '左食指 · R T F G V B', '右食指 · Y U H J N M', '空格 · 任一拇指轻轻按', '按完后，回到起始键位']) {
      const line = document.createElement('span');
      line.textContent = text;
      legend.append(line);
    }
    box.append(legend);
  });
}

function showCollection() {
  openDialog('我的小岛，一点点长大', box => {
    const introduction = document.createElement('p');
    introduction.textContent = `已经收好 ${completedIds().length} / 12 枚成长印章。每一件小礼物，都来自你的练习。`;
    box.append(introduction);
    const grid = document.createElement('div');
    grid.className = 'reward-grid';
    for (const level of LEVELS) {
      const reward = document.createElement('div');
      reward.className = 'reward-card' + (progress.completed[level.id] ? '' : ' unearned');
      const icon = document.createElement('span');
      icon.textContent = level.reward.icon;
      const title = document.createElement('b');
      title.textContent = level.reward.name;
      const detail = document.createElement('p');
      detail.textContent = progress.completed[level.id] ? '已经来到小岛' : `完成第 ${level.id} 关获得`;
      reward.append(icon, title, detail);
      grid.append(reward);
    }
    box.append(grid);
  });
}

function resetProgress() {
  if (conflict) { showConflict(); return; }
  // This function is reachable only from the final explicit reset confirmation.
  const fresh = defaultProgress();
  let removed = true;
  for (const key of [MAIN_CATCH_STORAGE_KEY, LEGACY_CATCH_STORAGE_KEY, STONE_STORAGE_KEY]) {
    try {
      if (!storage) throw new Error('Storage unavailable');
      storage.removeItem(key);
      if (storage.getItem(key) !== null) removed = false;
    } catch { removed = false; }
  }
  // Never replace the legacy mirror while an authoritative envelope might
  // remain: a later load would otherwise revive records we claimed to clear.
  const saved = removed && saveProgress(storage, fresh);
  if (saved && removed) {
    progress = fresh;
    persistent = true;
    closeDialog();
    renderMap();
    notify('已清除本机全部进度，可以重新出发');
  } else {
    const current = loadMapProgress();
    progress = current.progress;
    persistent = false;
    closeDialog();
    renderMap();
    notify('未能确认全部进度已清除，请检查浏览器的存储权限后重试');
  }
}

function showSettings() {
  if (conflict) { showConflict(); return; }
  openDialog('这台浏览器的学习进度', box => {
    const introduction = document.createElement('p');
    introduction.textContent = '不需要注册。学习记录只保存在当前浏览器，不会上传，也不会自动同步到其他设备。四种玩法分别保存，切换关卡不会清空其他关卡。清理浏览器数据或使用无痕模式可能让记录丢失。';
    const saved = document.createElement('p');
    saved.textContent = persistent ? `已保存 ${completedIds().length} 关的成长印章。` : '当前浏览器无法保存数据，请不要关闭正在练习的页面。';
    box.append(introduction, saved);
    const section = document.createElement('div');
    section.className = 'settings-section';
    section.append(makeButton('清除本机全部进度', 'text-button', () => {
      openDialog('确定清除全部进度吗？', confirmation => {
        const warning = document.createElement('p');
        warning.textContent = '12 关的学习记录、最好成绩、成长印章和每关的练习进度都会被清除，包括跳石过河和旧版练习记录，无法撤销。只影响这台浏览器。';
        const actions = document.createElement('div');
        actions.className = 'dialog-actions';
        actions.append(makeButton('保留进度', 'text-button', closeDialog), makeButton('确认清除', 'primary danger', resetProgress));
        confirmation.append(warning, actions);
      });
    }));
    box.append(section);
  });
}

function showConflict() {
  openDialog('学习进度在另一个页面更新了', box => {
    const introduction = document.createElement('p');
    introduction.textContent = '为避免使用旧记录，请刷新地图后继续选择关卡。';
    box.append(introduction, makeButton('刷新并继续', 'primary', () => location.reload()));
  });
}

$('continueButton').onclick = guardNavigation;
$('mapButton').onclick = () => { closeDialog(); $('mapHeading').scrollIntoView({ block: 'nearest' }); };
$('keyboardButton').onclick = showKeyboard;
$('collectionButton').onclick = showCollection;
$('resetButton').onclick = showSettings;
$('closeDialog').onclick = closeDialog;
window.addEventListener('keydown', event => {
  if ($('dialog').hidden) return;
  if (event.key === 'Escape') { event.preventDefault(); closeDialog(); }
  if (event.key !== 'Tab') return;
  const items = [...$('dialog').querySelectorAll('button:not([disabled]),input,a[href]')].filter(element => !element.hidden);
  if (!items.length) return;
  const first = items[0], last = items.at(-1);
  if (!items.includes(document.activeElement)) {
    event.preventDefault(); (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first.focus();
  }
});
window.addEventListener('storage', event => {
  if (event.storageArea && event.storageArea !== storage) return;
  if (event.key === null || [STORAGE_KEY, MAIN_CATCH_STORAGE_KEY, LEGACY_CATCH_STORAGE_KEY].includes(event.key)) {
    conflict = true;
    showConflict();
  }
});
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
document.addEventListener('visibilitychange', () => world?.setPaused(document.hidden || !$('dialog').hidden));

renderMap();
if (loaded.error) notify(loaded.persistent ? '旧记录暂时无法读取；选择关卡前可检查浏览器中保存的进度' : '此浏览器暂时无法保存，关闭页面后进度可能丢失');
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(registration => {
    const update = () => { $('offlineStatus').textContent = navigator.serviceWorker.controller ? '已准备离线练习 · 无需注册' : '正在准备离线练习'; };
    update();
    navigator.serviceWorker.addEventListener('controllerchange', update);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'activated') update(); });
    });
  }).catch(() => { $('offlineStatus').textContent = '离线缓存不可用，练习时请保持联网'; });
}
