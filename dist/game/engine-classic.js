import {applyPlayability,isRoomDesign,roomObjectives} from './playability.js';
import * as PreviousEngine from './engine-v3.js';
import { POOLS, NEW_KEYS, STAGE_NAMES, normalizeSeed, applyChallenge, decorateCodes, codeChoices, stageRequiredKeys } from './challenge-curriculum.js';
/**
 * Isolated, untimed twelve-adventure preview.
 * The engine is deterministic and DOM-free. All time values are seconds.
 * Valid input is credited immediately, except a single visible next operation
 * received ahead of time: that pending key is credited when its action starts.
 * Visible results commit on action completion. Controllers own repeat filtering.
 */
export { FINGERS, getFinger } from '../curriculum.js';

const tokens = text => [...new Set([...text.toUpperCase()].map(c => c === ' ' ? 'Space' : c))];
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const spec = (id, title, mode, newKeys, requiredKeys, extra = {}) => ({
  id, level: id, title, mode, newKeys, requiredKeys, ...extra,
});
const OLD_SPECS = [
  spec(1, '接水果和分装篮子', 'catch', ['F', 'J'], ['F', 'J'], { groups: [['F', 'J']], instruction: '亮起的水果准备好啦，把它接进篮子' }),
  spec(2, '为野餐采购水果', 'catch', ['D', 'K'], ['D', 'K'], { groups: [['D', 'K']], instruction: '需要两个梨和一个桃，先接哪一种都可以' }),
  spec(3, '一块石头一个字母', 'stone', ['S', 'L'], ['S', 'L', 'F', 'J'], { groups: [['S', 'L']], instruction: '沿着石头上的字母，一步一步练习两串石头路线' }),
  spec(4, '先看短串再连跳', 'stone', ['A', 'G', 'H'], ['A', 'G', 'H'], { groups: [['A', 'G', 'H']], instruction: '两条路都能到岸边，先按 A 或 H 选一条' }),
  spec(5, '看线索找朋友', 'forest', ['E', 'I', 'R', 'U'], ['E', 'I', 'R', 'U'], { groups: [['E', 'I'], ['R', 'U']], instruction: '观察路边的东西，沿着朋友的线索找路' }),
  spec(6, '带着野餐篮去取东西', 'forest', ['T', 'Y'], ['T', 'Y', 'F', 'J'], { groups: [['T', 'Y']], instruction: '蜂蜜和果汁都要带上，先去哪一处由你决定' }),
  spec(7, '把物品按用途归位', 'room', ['Q', 'W', 'O', 'P'], ['Q', 'W', 'O', 'P'], { groups: [['Q', 'W'], ['O', 'P']], instruction: '花瓶放窗边，点心放小架；先拿物品，再选合适的位置' }),
  spec(8, '把已有房间重新整理', 'room', ['V', 'M', 'B', 'N'], ['F', 'D', 'V', 'M', 'B', 'N'], { groups: [['V', 'M'], ['B', 'N']], instruction: '屋里已经摆满东西，按用途把旧物挪到阅读角和游戏角' }),
  spec(9, '把邀请卡慢慢写完整', 'card', ['C', 'X', 'Z'], ['C', 'X', 'Z'], { groups: [['C', 'X'], ['Z']], instruction: '照着完整目标，补上卡片的最后一个字母' }),
  spec(10, '删掉多字再改错字', 'card', ['Backspace'], ['Backspace', 'Z'], { groups: [['Backspace']], instruction: '正确的前面已经锁好，只修卡片的末尾' }),
  spec(11, '邀请朋友来野餐', 'mail', ['Space'], [...tokens('join us'), 'Backspace'], { groups: [['Space']], instruction: '写好 join us，把朋友请到野餐垫上' }),
  spec(12, '和朋友一起玩野餐', 'mail', [], [...tokens('cxzcome and playjoin uslet us eat'), 'Backspace'], { groups: [], entryKeys: ['C', 'X', 'Z'], instruction: '朋友已经在野餐垫旁，选择伙伴，一起打招呼、游戏和分享' }),
];
const V4_INSTRUCTIONS = ['看清水果上的字母，用 F、J、D、K 接好一排，再按订单分装','先读采购单，买齐每种水果；两位朋友的篮子可以自己选先后','每次先看一小段，把熟悉的八个字母混合起来过河','两条路都能到岸边，自己选路并读清每一小段','观察地标和线索，输入路牌上的完整短码找朋友','自己决定采购顺序，输入完整路牌短码，带着两份食物去找朋友','先输入物品短码拿起，再输入合适位置的短码归位','看清每件物品的用途，输入短码把已有房间重新整理','先练 C、X、Z，再从空白写出完整短词','对照完整词，改正错误词尾或删掉多余字母，正确部分可以保留','在同一张卡上写好三段邀请，把朋友请到野餐垫旁','选择伙伴，读清小纸条，一起打招呼、游戏和分享'];
export const SPECS = freeze(OLD_SPECS.map((s,i)=>({...s,instruction:V4_INSTRUCTIONS[i],newKeys:NEW_KEYS[i],requiredKeys:[...POOLS[i],...(i===9?['Backspace']:i>9?['Space','Backspace']:[])],groups:Array.from({length:Math.ceil(NEW_KEYS[i].length/2)},(_,j)=>NEW_KEYS[i].slice(j*2,j*2+2))})));
export const specs = SPECS;
export const LEVELS = SPECS;
export const LETTER_GROUPS = freeze(['FJ', 'DK', 'SL', 'AGH', 'EI', 'RU', 'TY', 'QW', 'OP', 'VM', 'BN', 'CXZ'].map(x => [...x]));
export const getSpec = id => SPECS.find(s => s.id === id) || null;

const FOREST = freeze([
  { id: 'junction-1', clue: '朋友说先找蓝蘑菇', correct: 'E', branches: [{ key: 'E', label: '蓝蘑菇', feature: 'blueMushroom' }, { key: 'I', label: '红花', feature: 'redFlower' }] },
  { id: 'junction-2', clue: '再找有蜂窝的大树', correct: 'I', branches: [{ key: 'E', label: '水潭', feature: 'pond' }, { key: 'I', label: '蜂窝大树', feature: 'beehive' }] },
  { id: 'junction-3', clue: '小脚印通向木桥', correct: 'R', branches: [{ key: 'R', label: '脚印和木桥', feature: 'bridge' }, { key: 'U', label: '石坡', feature: 'slope' }] },
  { id: 'junction-4', clue: '最后找亮着灯的小屋', correct: 'U', branches: [{ key: 'R', label: '空树洞', feature: 'hollow' }, { key: 'U', label: '亮灯小屋', feature: 'cabin' }] },
]);
const DESTINATIONS = freeze([
  { id: 'T', key: 'T', label: '蜂蜜小屋', item: '蜂蜜', clue: '沿着蜂窝找到蜂蜜小屋', correct: 'F', branches: [{ key: 'F', label: '蜂窝大树', feature: 'beehive' }, { key: 'J', label: '蓝蘑菇', feature: 'blueMushroom' }] },
  { id: 'Y', key: 'Y', label: '河边亭', item: '果汁', clue: '沿着芦苇找到河边亭', correct: 'J', branches: [{ key: 'F', label: '红花', feature: 'redFlower' }, { key: 'J', label: '河边芦苇', feature: 'reeds' }] },
]);
const FRIENDS = freeze([
  { id: 'C', key: 'C', label: '小兔', text: 'come and play' },
  { id: 'X', key: 'X', label: '小熊', text: 'join us' },
  { id: 'Z', key: 'Z', label: '小鹿', text: 'let us eat' },
]);
const clone = value => JSON.parse(JSON.stringify(value));
const token = key => {
  if (key === ' ' || key === 'Space' || key === 'Spacebar') return 'Space';
  if (key === 'Backspace') return key;
  return typeof key === 'string' && /^[a-z]$/i.test(key) ? key.toUpperCase() : null;
};
const char = key => key === 'Space' ? ' ' : key.toLowerCase();
const nextTextKey = state => {
  if (state.buffer === state.targetText) return null;
  if (!state.targetText.startsWith(state.buffer)) return 'Backspace';
  return token(state.targetText[state.buffer.length]);
};

const STAGE_TITLES = STAGE_NAMES;
const STAGE_DESCRIPTIONS = {
  1: ['一颗一颗接住苹果和橙子', '看清一排四颗，再连着接进篮子', '照两张小订单，给朋友分装水果'],
  2: ['先装好一份梨和桃的订单', '自己决定先装哪位朋友的篮子', '一格梨、一格桃，装好两对水果'],
  3: ['一块石头一个字母，试试两串路线', '三个新短串，每次先看清这一段', '把熟悉的四个字母换个顺序再连起来'],
  4: ['先选一条三字母小路', '自己选路，连续走完两段短串', '两条路的字母组合都变了，先看再连跳'],
  5: ['沿单个地标走到小溪', '先读两步路线，穿过溪边树林', '对照两条特征，找到北边的朋友'],
  6: ['自己选第一处，沿路取回一份东西', '带着已有物品，去取另一份', '选择回程路线，把两份东西带给朋友'],
  7: ['按物品的用途，把花瓶和点心盒归位', '保留摆好的东西，再布置阅读桌', '阅读结束后，把书和花瓶收入展示架'],
  8: ['把已有家具挪好，准备舒适阅读角', '阅读角和游戏角换个位置，四件旧物都搬到另一边', '书留在安静角，把灯和软垫搬到玩具旁，准备表演'],
  9: ['每张只差最后一个字母', '印好的部分变短了，补上两三个字母', '从空白卡片开始，写好三个完整短词'],
  10: ['先删掉多字，再替换错字', '末尾可能多了两个字，慢慢检查', '有的要删，有的要重写，一张一张修好'],
  11: ['在同一张邀请卡上写下邀请', '补上集合地点：公园', '补上要带的东西，贴出完整邀请'],
  12: ['朋友都到啦，选择先和谁打招呼', '自己挑一位伙伴和一种游戏', '选择和朋友分享哪份点心'],
};
const wordCard = (id, target, prefix = '', initial = prefix) => ({ id, target, prefix, initial });
function forestTask(source, index, alternate = false) {
  const task = clone(FOREST[source % FOREST.length]);
  task.id = `junction-${index + 1}`;
  if (alternate) task.correct = task.branches.find(branch => branch.key !== task.correct).key;
  const goal = task.branches.find(branch => branch.key === task.correct);
  task.clue = `第 ${index + 1} 条线索：去找${goal.label}`;
  return task;
}
function oldDefinitions(state) {
  const n = state.lessonStageIndex;
  switch (state.level) {
    case 1: {
      const sequence = ['FJFJ', 'FFJJFJFJ', 'JFFJFJJFFJFJ'][n];
      state.tasks = [...sequence].map((key, i) => ({ id: `fruit-${i + 1}`, key, label: key === 'F' ? '苹果' : '橙子' })); break;
    }
    case 2: {
      const amounts = [[2, 1], [2, 4], [5, 4]][n];
      state.tasks = amounts.flatMap((count, k) => Array.from({ length: count }, (_, i) => ({ id: `${k ? 'peach' : 'pear'}-${i + 1}`, key: k ? 'K' : 'D', label: k ? '桃' : '梨' }))); break;
    }
    case 3: {
      const sequences = [['SL', 'FJSL'], ['LSFJ', 'JFSL', 'SLJF'], ['FLSJ', 'LJSF', 'SFJL']][n];
      state.tasks = sequences.map((sequence, i) => ({ id: `river-${i + 1}`, sequence, label: sequence.toLowerCase() })); break;
    }
    case 4: {
      const routes = [[['AGH'], ['HAG']], [['AGH', 'AGH'], ['HAG', 'HAG']], [['AHGA', 'GHGA'], ['HGAH', 'AGAH']]][n];
      state.tasks = routes.map((segmentSequences, i) => ({ id: i ? 'hag' : 'agh', key: i ? 'H' : 'A', segmentSequences, sequence: segmentSequences.join(''), label: segmentSequences.join(' · ').toLowerCase() })); break;
    }
    case 5:
      state.tasks = n === 0 ? clone(FOREST) : (n === 1 ? [1, 0, 3, 2, 0, 1] : [2, 0, 3, 1, 0, 2, 1, 3]).map((source, i) => forestTask(source, i, n === 1 ? i % 2 === 0 : i % 3 !== 1)); break;
    case 6:
      state.tasks = clone(DESTINATIONS).map(destination => ({ ...destination, forks: Array.from({ length: n + 1 }, (_, i) => {
        const fork = { clue: destination.clue, correct: destination.correct, branches: clone(destination.branches) };
        if (i < n && (i % 2 || n === 1 || n === 2 && i === 0)) fork.correct = fork.branches.find(branch => branch.key !== fork.correct).key;
        if (n === 2 && i === 1) fork.branches = destination.key === 'T'
          ? [{ key: 'F', label: '红花', feature: 'redFlower' }, { key: 'J', label: '水潭', feature: 'pond' }]
          : [{ key: 'F', label: '蜂窝大树', feature: 'beehive' }, { key: 'J', label: '水潭', feature: 'pond' }];
        if (n) fork.clue = `第 ${i + 1}/${n + 1} 条线索：去找${fork.branches.find(branch => branch.key === fork.correct).label}`;
        return fork;
      }) })); break;
    case 7:
      state.items = [{ key: 'Q', label: '花瓶' }, { key: 'O', label: '点心盒' }];
      if (n) state.items.push({ key: 'F', label: '小书' }, { key: 'D', label: '小灯' });
      state.zones = [{ key: 'W', label: '窗边桌', capacity: n ? 2 : 1 }, { key: 'P', label: '小架子', capacity: n ? 2 : 1 }];
      if (n === 2) state.items.forEach(item => { item.goalZone = ['Q', 'D'].includes(item.key) ? 'W' : 'P'; });
      state.tasks = state.items.map(item => ({ id: item.key, ...item })); break;
    case 8:
      state.items = [{ key: 'F', label: '小书' }, { key: 'D', label: '小灯' }, { key: 'V', label: '软垫' }, { key: 'B', label: '玩具篮' }];
      state.zones = [{ key: 'M', label: '窗边桌', capacity: 2 }, { key: 'N', label: '小架子', capacity: 2 }];
      if (n === 2) state.items.forEach(item => { item.goalZone = ['F', 'D'].includes(item.key) ? 'M' : 'N'; });
      state.tasks = state.items.map(item => ({ id: item.key, ...item })); break;
    case 9:
      state.tasks = n === 0 ? [wordCard('music', 'music', 'musi'), wordCard('box', 'box', 'bo'), wordCard('jazz', 'jazz', 'jaz')] : n === 1 ? [wordCard('music', 'music', 'mus'), wordCard('box', 'box', 'b'), wordCard('jazz', 'jazz', 'ja')] : [wordCard('cat', 'cat'), wordCard('fox', 'fox'), wordCard('zip', 'zip')]; break;
    case 10:
      state.tasks = n === 0 ? [wordCard('box', 'box', 'box', 'boxx'), wordCard('jazz', 'jazz', 'jaz', 'jazx')] : n === 1 ? [wordCard('box', 'box', 'box', 'boxxx'), wordCard('jazz', 'jazz', 'jaz', 'jazxx'), wordCard('music', 'music', 'musi', 'musix')] : [wordCard('cat', 'cat', 'c', 'cxt'), wordCard('fox', 'fox', 'f', 'fxo'), wordCard('zip', 'zip', 'zi', 'zippp')]; break;
    case 11:
      state.friends = [clone([{ id: 'J', key: 'J', label: '小熊', text: 'join us' }, FRIENDS[0], FRIENDS[2]][n])]; state.tasks = clone(state.friends); break;
    case 12:
      state.friends = n === 0 ? clone(FRIENDS) : n === 1 ? [{ ...clone(FRIENDS[0]), text: 'hi' }, { ...clone(FRIENDS[1]), text: 'hello' }] : [{ ...clone(FRIENDS[2]), text: 'see you' }]; state.tasks = clone(state.friends); break;
  }
  state.total = state.mode === 'stone' ? (state.level === 3 ? state.tasks.reduce((sum, task) => sum + task.sequence.length, 0) : state.tasks[0].sequence.length) : state.tasks.length;
}


const FRUIT_LABELS = { F: '苹果', J: '橙子', D: '梨', K: '桃', S: '草莓', L: '葡萄' };
const INVITATION_PARTS = freeze([{ title: '邀请大家', text: 'join us' }, { title: '集合地点', text: 'at the park' }, { title: '带上游戏', text: 'bring a game' }]);
function orchardOrder(id, key, label, needs) { return { id, key, label, needs }; }
function definitions(state) {
  oldDefinitions(state);
  const n = state.lessonStageIndex;
  if (state.mode === 'catch') {
    state.balanced = state.level === 2 && n === 2;
    state.catchStyle = state.level === 1 && n < 2 ? (n ? 'chunk' : 'single') : 'orders';
    state.orders = [];
    if (state.level === 1 && n < 2) {
      state.tasks = [...(n ? 'FFJJJFJF' : 'FJFJ')].map((key, i) => ({ id: `fruit-${i + 1}`, key, label: FRUIT_LABELS[key] }));
    } else {
      state.orders = state.level === 1
        ? [orchardOrder('rabbit', 'F', '小兔篮', { F: 2, J: 1 }), orchardOrder('bear', 'J', '小熊篮', { F: 1, J: 2 })]
        : n === 0 ? [orchardOrder('picnic', 'D', '野餐篮', { D: 2, K: 1 })]
        : n === 1 ? [orchardOrder('rabbit', 'D', '小兔的梨子篮', { D: 2, K: 1 }), orchardOrder('bear', 'K', '小熊的桃子篮', { D: 1, K: 2 })]
        : [orchardOrder('pairs', 'D', '两对水果盒', { D: 2, K: 2 })];
      state.tasks = state.orders.flatMap(order => Object.entries(order.needs).flatMap(([key, amount]) => Array.from({ length: amount }, (_, i) => ({ id: `${order.id}-${key}-${i + 1}`, orderId: order.id, key, label: FRUIT_LABELS[key] }))));
    }
    state.total = state.tasks.length;
  }
  if (state.level === 5) {
    const chapter = [
      [['蓝蘑菇','blueMushroom'],['蜂窝大树','beehive'],['脚印木桥','bridge'],['溪边芦苇','reeds']],
      [['水潭','pond'],['红花','redFlower'],['空树洞','hollow'],['石坡','slope']],
      [['树桩旁的蓝蘑菇','blueMushroom'],['挂丝带的蜂窝树','beehiveRibbon'],['留着脚印的木桥','bridgeFootprints'],['亮着灯的小屋','cabinLit']],
    ][n];
    const corrects = ['EIRU','IEUR','IERU'][n];
    state.tasks = chapter.map(([label, feature], i) => {
      const correct = corrects[i], pair = i < 2 ? ['E','I'] : ['R','U'];
      const wrongFeature = (n===2 ? ['blueMushroomPlain','beehive','bridgePlain','cabinDark'] : ['redFlower','pond','slope','hollow'])[i];
      const wrongLabel = (n===2 ? ['没有树桩的蓝蘑菇','没有丝带的蜂窝树','没有脚印的木桥','没有亮灯的小屋'] : ['红花','普通水潭','没有脚印的石坡','空树洞'])[i];
      const nodeFrom = `s${n}-n${i}`, nodeTo = `s${n}-n${i + 1}`;
      const routePreview = n === 1 ? chapter.slice(i, i + 2).map(([text]) => text) : [];
      return { id: `s${n}-junction-${i+1}`, nodeFrom, nodeTo, correct, routePreview,
        clue: n === 1 ? `小路线：${routePreview.join(' → ')}` : n === 2 ? `同时找两个特征：${label}` : `沿着${label}走`,
        branches: pair.map(key => ({ key, label: key === correct ? label : wrongLabel, feature: key === correct ? feature : wrongFeature, ...(n===2?{traitPresent:key===correct}:{}), nodeTo: key === correct ? nodeTo : `s${n}-d${i}` })) };
    });
    state.total = state.tasks.length;
  }
  if (state.level === 6) {
    state.tasks = clone(DESTINATIONS).map(destination => {
      const prefix = destination.key.toLowerCase(), returning = n === 2;
      const start = returning ? `${prefix}-return` : `${prefix}-start`;
      const middle = returning ? `${prefix}-meet` : `${prefix}-mid`;
      const end = returning ? 'friend' : `${prefix}-end`;
      const landmarks = destination.key === 'T' ? [['蜂窝大树','beehive'],['蜂蜜小屋','cabin']] : [['溪边芦苇','reeds'],['河边亭','pavilion']];
      return { ...destination, startNode: start, routeOnly: returning,
        label: returning ? (destination.key === 'T' ? '木桥回程' : '花径回程') : destination.label,
        item: returning ? '两份野餐食物' : destination.item,
        forks: landmarks.map(([label, feature], i) => ({ id: `${prefix}-fork-${i}`, nodeFrom: i ? middle : start, nodeTo: i ? end : middle,
          clue: returning ? (i ? '看见朋友啦，把野餐篮送到朋友身边' : `沿${destination.key === 'T' ? '木桥' : '花径'}继续向前`) : `带着篮子，沿${label}走`,
          correct: i ? destination.correct : (destination.correct === 'F' ? 'J' : 'F'),
          branches: ['F','J'].map(key => { const correct = i ? destination.correct : (destination.correct === 'F' ? 'J' : 'F'); return { key, label: key === correct ? returning ? i ? '等待的朋友' : destination.key === 'T' ? '木桥' : '花径' : label : '没有路标的小岔路', feature: key === correct ? returning ? i ? 'cabin' : destination.key === 'T' ? 'bridge' : 'redFlower' : feature : 'hollow', nodeTo: key === correct ? i ? end : middle : `${prefix}-${returning ? 'rd' : 'd'}${i}` }; }) })) };
    });
    state.total = 1;
  }
  if (state.level === 7) {
    state.items = [{key:'Q',label:'花瓶',goalZone:n===2?'P':'W'},{key:'O',label:'点心盒',goalZone:'P'}];
    if (n) state.items.push({key:'F',label:'故事书',goalZone:n===2?'P':'W'},{key:'D',label:'阅读灯',goalZone:'W'});
    state.zones = [{key:'W',label:n?'阅读桌':'窗边桌',capacity:n===1?3:1},{key:'P',label:n?'展示架':'小架子',capacity:n===2?3:1}];
    state.tasks = state.items.map(item=>({id:item.key,...item})); state.total=state.items.length;
  }
  if (state.level === 8) {
    const goals = [{F:'M',D:'M',V:'M',B:'N'},{F:'N',D:'N',V:'N',B:'M'},{F:'N',D:'M',V:'M',B:'M'}][n];
    state.items = [{key:'F',label:'故事书'},{key:'D',label:'阅读灯'},{key:'V',label:'软垫'},{key:'B',label:'玩具篮'}].map(item=>({...item,goalZone:goals[item.key]}));
    state.zones = [{key:'M',label:['阅读角','游戏角','表演游戏角'][n],capacity:[3,1,3][n]},{key:'N',label:['游戏角','阅读角','安静阅读角'][n],capacity:[1,3,1][n]}];
    state.tasks=state.items.map(item=>({id:item.key,...item})); state.total=state.items.length;
  }
  if (state.level === 11) {
    state.invitationParts=clone(INVITATION_PARTS); state.mailPart=n;
    state.friends=clone(FRIENDS); state.tasks=[{id:'C',...state.friends[0],text:INVITATION_PARTS[n].text}]; state.total=1;
  }
  if (state.level === 12) {
    state.activity=[{id:'greet',label:'打招呼'},{id:'play',label:'一起玩'},{id:'share',label:'分享点心'}][n];
    const texts=[['hi rabbit','hello bear','hi deer'],['roll a ball','build a tower','fly a kite'],['share a pear','pour the juice','pass a cake']][n];
    const labels=[['向小兔问好','向小熊问好','向小鹿问好'],['和小兔滚球','和小熊搭积木','和小鹿放风筝'],['与小兔分梨','给小熊倒果汁','递蛋糕给小鹿']][n];
    state.friends=clone(FRIENDS).map((friend,i)=>({...friend,text:texts[i],activityLabel:labels[i]})); state.tasks=clone(state.friends); state.total=1;
  }
}
export function create(level, lessonStageIndex = 0, seed, contentVersion = 4) {
  if(contentVersion!==4&&!(contentVersion===5&&[6,8,12].includes(level)))throw new RangeError('Unknown gameplay version');
  const def = getSpec(level);
  if (!def) throw new RangeError('Choose a preview level from 1 to 12.');
  if (!Number.isInteger(lessonStageIndex) || lessonStageIndex < 0 || lessonStageIndex > 2) throw new RangeError('Choose a lesson stage from 0 to 2.');
  const state = {
    version: 4, contentVersion, seed: normalizeSeed(seed), level, mode: def.mode, phase: 'playing', paused: false,
    lessonStageIndex, startStageIndex: lessonStageIndex, stageReady: false, stageTitle: STAGE_TITLES[lessonStageIndex],
    stageDescription: STAGE_DESCRIPTIONS[level][lessonStageIndex], stageHistory: [], stageStartAccepted: 0,
    legacyCompleted: false, migrationNotice: '', initialPlacements: {}, forkIndex: 0,
    step: 0, index: 0, accepted: [], completed: [], selected: null, held: null,
    placements: {}, buffer: '', route: null, action: null, pendingKey: null,
    wrongKey: null, wrongUntil: 0, tasks: [], choices: [], target: null,
    message: lessonStageIndex ? STAGE_DESCRIPTIONS[level][lessonStageIndex] : def.instruction, progress: 0, total: 0,
    stage: 'play', queue: [], sequence: '', segment: 0, segmentIndex: 0,
    counts: {}, inventory: [], arrived: [], picnicGuests: [], items: [], zones: [], friends: [],
    targetText: '', lockedPrefix: '', time: 0, fruitStartedAt: 0, fallAge: 0,
    solved: false, layoutComplete: false, catchStyle: '', orders: [], orderId: null, orderCounts: {}, orderCompleted: [], orderHistory: [], lastFruit: null, nodeId: '', traversedNodes: [], routeOrder: [], invitationWritten: [], invitationParts: [], activityHistory: [],
  };
  definitions(state);
  applyChallenge(state);
  applyPlayability(state);
  if (state.mode === 'catch') state.counts = Object.fromEntries([...new Set(state.tasks.map(t=>t.key))].map(key=>[key,0]));
  if (level === 3) state.sequence = state.tasks.map(task => task.sequence).join('');
  if (level === 6 || level === 12) state.stage = 'select';
  if (state.mode === 'catch' && state.orders.length) {
    state.orderId = state.chooseOrders ? null : state.orders[0].id;
    if (!state.orderId) state.stage = 'select';
  }
  if (level === 5) { state.nodeId = `s${lessonStageIndex}-n0`; state.traversedNodes=[state.nodeId]; }
  if (level === 6) { state.nodeId='hub'; state.traversedNodes=['hub']; if (lessonStageIndex > 0) { state.inventory=lessonStageIndex===1?['T']:['T','Y']; state.routeOrder=[...state.inventory]; state.nodeId=lessonStageIndex===1?'t-end':'y-end'; } }
  if (level === 12) state.picnicGuests=['C','X','Z'];
  if (state.mode === 'room') {
    state.stage = 'pick';
    if (level === 7 && lessonStageIndex > 0) state.placements = lessonStageIndex === 1 ? {Q:'W',O:'P'} : {Q:'W',O:'P',F:'W',D:'W'};
    if (level === 8) state.placements = contentVersion===5 ? [{F:'N',D:'M',V:'N',B:'M'},{F:'N',D:'N',V:'N',B:'M'},{F:'N',D:'M',V:'N',B:'M'}][lessonStageIndex] : [{F:'N',D:'N',V:'N',B:'M'},{F:'M',D:'M',V:'M',B:'N'},{F:'N',D:'N',V:'N',B:'M'}][lessonStageIndex];
    state.initialPlacements = clone(state.placements);
  }
  if (state.mode === 'card') initializeCard(state);
  if (level === 11) { state.stage = 'write'; state.selected = state.friends[0].key; state.targetText = state.invitationParts[lessonStageIndex].text; }
  state.message=state.stageDescription;
  refresh(state);
  return state;
}

export function getStageInfo(state) {
  if (state.version < 4) return PreviousEngine.getStageInfo(state);
  const index = state.legacyCompleted ? 2 : state.lessonStageIndex;
  return { index, number: index + 1, count: 3, title: state.stageTitle, description: state.stageDescription, ready: state.stageReady, final: index === 2, completed: state.solved ? 3 : state.lessonStageIndex + (state.stageReady ? 1 : 0) };
}
export function advanceStage(state) {
  if (state.version < 4) return PreviousEngine.advanceStage(state);
  if (!state.stageReady || state.phase !== 'stage-ready' || state.action || state.lessonStageIndex >= 2 || state.solved) return false;
  const next = create(state.level, state.lessonStageIndex + 1, state.seed, state.contentVersion);
  next.accepted = [...state.accepted]; next.stageStartAccepted = next.accepted.length;
  next.stageHistory = clone(state.stageHistory); next.startStageIndex=state.startStageIndex; next.picnicGuests = [...state.picnicGuests]; next.paused = state.paused;
  next.time = state.time; next.fruitStartedAt = state.time;
  if (state.level === 6) { next.inventory=[...state.inventory]; next.routeOrder=[...state.routeOrder]; next.nodeId=state.nodeId; next.traversedNodes=[...state.traversedNodes]; }
  if (state.level === 5) next.traversedNodes=[...state.traversedNodes,next.nodeId];
  if (state.mode === 'room') { next.placements={...state.placements}; next.initialPlacements={...state.placements}; }
  next.invitationWritten=[...state.invitationWritten]; next.activityHistory=clone(state.activityHistory);
  if (state.level === 12) next.picnicGuests=['C','X','Z'];
  Object.assign(state, next);
  refresh(state);
  return true;
}

/** Minimal current-task keys, so jumping to level 12 does not front-load all text. */
export function getRequiredKeys(state) {
  if (state.version < 4) return PreviousEngine.getRequiredKeys(state);
  if (state.stageReady) return [];
  return stageRequiredKeys(state);
}

function initializeCard(state) {
  const task = state.tasks[state.step];
  if (!task) return;
  state.stage = 'write';
  state.lockedPrefix = task.prefix;
  state.targetText = task.target;
  state.buffer = task.initial;
}
function roomReady(state) {
  if(isRoomDesign(state))return roomObjectives(state).every(goal=>goal.done);
  return state.items.every(item => state.placements[item.key] && (!item.goalZone || state.placements[item.key] === item.goalZone)) && state.zones.every(zone => Object.values(state.placements).filter(key => key === zone.key).length === zone.capacity);
}
function stoneSegments(state) {
  return state.level === 3 ? state.tasks.map(task => task.sequence) : state.tasks.find(task => task.id === state.route)?.segmentSequences || [];
}
function stonePosition(state, index = state.index) {
  const segments = stoneSegments(state);
  let offset = 0;
  for (let segment = 0; segment < segments.length; segment++) {
    if (index < offset + segments[segment].length || segment === segments.length - 1) return { segment, segmentIndex: index - offset, sequence: segments[segment] };
    offset += segments[segment].length;
  }
  return { segment: 0, segmentIndex: 0, sequence: '' };
}
function currentFork(state) {
  const destination = state.tasks.find(task => task.key === state.selected);
  return destination ? { ...destination, ...(destination.forks?.[state.forkIndex] || destination) } : null;
}
function refresh(state) {
  state.fallAge = Math.max(0, state.time - state.fruitStartedAt);
  state.task = null;
  switch (state.mode) {
    case 'catch': {
      state.task = state.catchStyle === 'single' || state.catchStyle === 'chunk' ? state.tasks[state.step] || null : state.tasks.find(task=>task.orderId===state.orderId&&!state.completed.includes(task.id)) || null;
      const keys = state.orders.length ? Object.keys(state.orders.find(order=>order.id===state.orderId)?.needs||{}) : state.fruitKeys;
      const order = state.orders.find(order=>order.id===state.orderId);
      state.activeOrder = order || null;
      state.visibleStart = state.catchStyle === 'chunk' ? Math.floor(state.step/4)*4 : state.step;
      state.visibleEnd = state.catchStyle === 'chunk' ? Math.min(state.visibleStart+4,state.total) : state.step+1;
      state.visibleSequence = state.catchStyle === 'chunk' ? state.tasks.slice(state.visibleStart,state.visibleEnd).map(task=>task.key).join('') : '';
      state.choices = state.stage === 'select' ? state.orders.map(order=>({key:order.key,label:order.label,kind:'order',orderId:order.id,done:state.orderCompleted.includes(order.id)})) : keys.map(key=> {
        const required=order ? order.needs[key]||0 : state.tasks.filter(task=>task.key===key).length;
        const count=order ? state.orderCounts[order.id]?.[key]||0 : state.counts[key]||0;
        return {key,label:`${key} 水果`,kind:'fruit',needed:required,count,remaining:required-count,done:count>=required};
      });
      state.target = state.catchStyle === 'single' || state.catchStyle === 'chunk' ? state.tasks[state.step+(state.action?1:0)+state.queue.length]?.key || null : null;
      if (state.catchStyle==='chunk'&&state.step+(state.action?1:0)+state.queue.length>=state.visibleEnd) state.target=null;
      if(state.balanced&&state.lastFruit) {state.target=state.lastFruit==='D'?'K':'D';state.choices=state.choices.map(choice=>({...choice,disabled:choice.key!==state.target&&!choice.done}));}
      break;
    }
    case 'stone': {
      const position = stonePosition(state);
      state.segment = position.segment; state.segmentIndex = position.segmentIndex;
      state.task = state.level === 3 ? state.tasks[state.segment] : state.tasks.find(task => task.id === state.route) || null;
      if (state.level === 4 && !state.route) {
        state.choices = state.tasks.map(task => ({ key: task.key, label: task.label, kind: 'route', route: task.id, sequence: task.sequence, done: false }));
      } else {
        const sequence = position.sequence;
        state.choices = [...sequence].map((key, index) => ({ key, label: key.toLowerCase(), kind: 'stone', index, done: index < state.segmentIndex }));
      }
      state.target = state.sequence[state.index + (state.action ? 1 : 0) + state.queue.length] || null;
      if(state.index+(state.action?1:0)+state.queue.length>=state.index-position.segmentIndex+position.sequence.length)state.target=null;
      break;
    }
    case 'forest': {
      if (state.level === 5) state.task = state.tasks[state.step] || null;
      else state.task = currentFork(state);
      if (state.level === 6 && (state.stage === 'select' || state.stage === 'travel')) {
        state.choices = state.tasks.filter(task=>state.contentVersion!==5||state.lessonStageIndex<2||task.key===state.routeOrder.at(-1)).map(task => ({ key: task.key, label: `${task.label} · ${task.item}`, kind: 'destination', done: state.level === 6 && state.lessonStageIndex < 2 ? state.inventory.includes(task.id) : state.completed.includes(task.id) }));
      } else {
        state.choices = (state.task?.branches || []).map(branch => ({ ...branch, kind: 'path', done: false }));
      }
      // The clue, rather than a highlighted solution, guides the path choice.
      state.target = null;
      break;
    }
    case 'room': {
      state.layoutComplete = roomReady(state);
      const count = zone => Object.values(state.placements).filter(value => value === zone).length;
      state.choices = [
        ...state.items.map(item => ({ ...item, kind: 'item', position: state.placements[item.key] || 'floor', done: Boolean(state.placements[item.key]), disabled: state.stage !== 'pick' })),
        ...state.zones.map(zone => ({ ...zone, kind: 'zone', count: count(zone.key), done: count(zone.key) === zone.capacity, disabled: state.stage !== 'place' })),
      ];
      state.target = null;
      state.progress = state.solved || state.stageReady ? state.total : isRoomDesign(state) ? roomObjectives(state).filter(goal=>goal.done).length : state.items.some(item => item.goalZone) ? state.items.filter(item => state.placements[item.key] === item.goalZone).length : state.zones.reduce((sum, zone) => sum + Math.min(count(zone.key), zone.capacity), 0);
      break;
    }
    case 'card': {
      state.task = state.tasks[state.step] || state.tasks.at(-1);
      state.target = nextTextKey(state);
      state.choices = state.target ? [{ key: state.target, label: state.target === 'Backspace' ? '删掉末尾一个字' : state.target, kind: 'letter', done: false }] : [];
      break;
    }
    case 'mail': {
      state.task = state.friends.find(friend => friend.key === state.selected) || null;
      if (state.stage === 'select' || state.stage === 'travel' || state.phase === 'complete') {
        state.choices = state.friends.map(friend => ({ key: friend.key, label: state.level === 12 ? friend.activityLabel : friend.label, kind: 'friend', done: state.arrived.includes(friend.key) }));
        state.target = null;
      } else {
        state.target = nextTextKey(state);
        state.choices = state.target ? [{ key: state.target, label: state.target === 'Space' ? '词间空格' : state.target, kind: 'letter', done: false }] : [];
      }
      break;
    }
  }
  if (state.stageReady || state.phase === 'complete' && state.mode !== 'room') state.target = null;
  decorateCodes(state);
}
function result(state, status, key) { return { status, key, message: state.message, pendingKey: state.pendingKey }; }
function ignored(state, key, message) {
  if (message) state.message = message;
  return result(state, 'ignored', key);
}
function wrong(state, key, message) {
  state.wrongKey = key; state.wrongUntil = state.time + 1.3;
  state.message = message || '没关系，看看当前的提示，再试一次';
  return result(state, 'wrong', key);
}
function credit(state, key) {
  if (!state._suppressCredit) state.accepted.push(...(state._creditCode ? [...state._creditCode] : [key])); state.wrongKey = null; state.wrongUntil = 0;
}
function begin(state, type, key, from, to, duration, extras = {}) {
  state.action = { type, key, from, to, duration, elapsed: 0, ...extras };
  state.phase = 'acting';
}
function finish(state, message) {
  state.progress = state.total;
  if (!state.legacyCompleted && !state.stageHistory.some(stage => stage.index === state.lessonStageIndex)) state.stageHistory.push({ index: state.lessonStageIndex, title: state.stageTitle, accepted: state.accepted.slice(state.stageStartAccepted), progress: state.total, total: state.total });
  state.stageReady = state.lessonStageIndex < 2 && !state.legacyCompleted;
  state.solved = !state.stageReady; state.phase = state.stageReady ? 'stage-ready' : 'complete';
  state.message = message;
}
function jump(state, key) {
  const { segment, segmentIndex, sequence } = stonePosition(state);
  const last = segmentIndex === sequence.length - 1;
  begin(state, 'jump', key, state.index, state.index + 1, last ? .9 : .56, { segment, segmentIndex, route: state.route });
  state.message = '小熊正在跳；可以接着按后面的字母';
}

// Receive only an operation the child can already see and choose. Room zones
// remain visible during pickup; shopping's other fruit remains on its tree.
// A new forest clue, card, single falling fruit, or invitation is not visible
// yet, so its future input must never be guessed or silently consumed.
function pendingKeys(state) {
  if (state.mode === 'room' && state.action?.type === 'pick' && state.stage === 'pick') return state.zones.map(zone => zone.key);
  if (state.catchStyle === 'orders' && state.action?.type === 'catch') return state.choices.filter(choice => choice.kind === 'fruit' && choice.key !== state.action.key && choice.remaining > 0).map(choice=>choice.key);
  return [];
}
function receivePending(state, key) {
  if (state.pendingKey) return ignored(state, key, `已收到 ${state.pendingKey}，正在按顺序完成；这次按键没有加入`);
  if (pendingKeys(state).includes(key)) {
    state.pendingKey = key; state.wrongKey = null; state.wrongUntil = 0;
    state.message = state.mode === 'room'
      ? `已收到 ${key}，拿好后就摆到${state.zones.find(zone => zone.key === key).label}，不用再按`
      : `已收到 ${key}，这颗放进篮子后就接${state.tasks.find(task => task.key === key).label}，不用再按`;
    return result(state, 'queued', key);
  }
  const next = state.action.type === 'pick' ? '可以先按一次位置的字母'
    : state.action.type === 'place' ? '放好后再选下一件物品'
    : state.action.type === 'detour' ? '回到路口后再选'
    : state.mode === 'forest' ? '新线索出现后再按'
    : state.mode === 'card' ? '下一张卡片出现后再按'
    : state.mode === 'catch' ? '下一颗水果出现后再按'
    : state.action.type === 'visit' ? '到达后看清短句再按' : '朋友收好后再按';
  return ignored(state, key, `动作正在完成，这次按键没有加入；${next}`);
}

function corePress(state, rawKey) {
  if (state.version < 4) return PreviousEngine.press(state, rawKey);
  const key = token(rawKey);
  if (!key) return ignored(state, null);
  if (state.paused) return ignored(state, key);
  if (state.phase === 'ready' || state.stageReady) return ignored(state, key);
  if (state.phase === 'complete' && state.mode !== 'room') return ignored(state, key);
  if (state.action) {
    if (state.mode === 'catch' && state.catchStyle === 'chunk') {
      const index = state.step + 1 + state.queue.length;
      if (index >= state.visibleEnd) return ignored(state,key,'这一排四颗都收到了，下一排出现后再按');
      if (key !== state.tasks[index].key) return wrong(state,key,`这一排接下来是 ${state.tasks[index].key}，已接住的水果都保留`);
      credit(state,key); state.queue.push(key); state.message=`收到 ${key}，会按可见的一排顺序接好`;
      refresh(state); return result(state,'queued',key);
    }
    if (state.mode !== 'stone') return receivePending(state, key);
    const position=stonePosition(state),visibleEnd=state.index-position.segmentIndex+position.sequence.length;
    if(state.index+1+state.queue.length>=visibleEnd)return ignored(state,key,'这一段都收到了，下一段出现后再按');
    const next = state.sequence[state.index + 1 + state.queue.length];
    if (!next) return ignored(state, key, '这一段的字母都收到了，等小熊站稳');
    if (key !== next) return wrong(state, key, `这一跳先找 ${next}；走过的进度都保留`);
    credit(state, key); state.queue.push(key);
    state.message = '收到啦，小熊会按顺序一块一块跳';
    refresh(state);
    return result(state, 'accepted', key);
  }
  if (state.mode === 'catch') {
    if (state.stage === 'select') {
      const order=state.orders.find(order=>order.key===key);
      if (!order) return wrong(state,key,'先看两张订单，选择要装的篮子');
      if (state.orderCompleted.includes(order.id)) return ignored(state,key,'这份篮子已经装好啦');
      credit(state,key); state.orderId=order.id; state.stage='play'; state.message=`先装${order.label}，照订单挑水果`;
      refresh(state); return result(state,'accepted',key);
    }
    const task=state.catchStyle==='single'||state.catchStyle==='chunk'?state.tasks[state.step]:state.tasks.find(task=>task.orderId===state.orderId&&task.key===key&&!state.completed.includes(task.id));
    if (state.catchStyle==='orders'&&state.choices.some(choice=>choice.key===key&&choice.done)) return ignored(state,key,'这一篮的这种水果够啦，看看订单还缺什么');
    if (!task||task.key!==key) return wrong(state,key,state.catchStyle==='single'||state.catchStyle==='chunk'?'看看当前水果上的字母':'照这份订单挑还缺的水果');
    if (state.balanced&&state.lastFruit===key) return wrong(state,key,'这一对要一梨一桃，先补另一格，再开始下一对');
    credit(state,key); begin(state,'catch',key,key,'basket',.68,{taskId:task.id,orderId:state.orderId,fallAge:state.fallAge});
    state.message=`${task.label}接住啦，放进${state.activeOrder?.label||'篮子'}`;
  } else if (state.mode === 'stone') {
    if (state.level === 4 && !state.route) {
      const route = state.tasks.find(task => task.key === key);
      if (!route) return wrong(state, key, '看看两条完整短串，按 A 或 H 开始');
      state.route = route.id; state.sequence = route.sequence;
    }
    if (key !== state.sequence[state.index]) return wrong(state, key, '小熊站稳啦，找下一块石头的字母');
    credit(state, key); jump(state, key);
  } else if (state.mode === 'forest') {
    if (state.level === 6 && state.stage === 'select') {
      const destination=state.tasks.find(task=>task.key===key);
      if (!destination) return wrong(state,key,'看看 T 和 Y 的路牌，选择一条路');
      if (state.lessonStageIndex<2&&state.inventory.includes(key)) return ignored(state,key,`${destination.item}已经在篮子里，去取另一份`);
      credit(state,key); state.selected=key; state.forkIndex=0; state.stage='travel';
      begin(state,'visit',key,state.nodeId,destination.startNode,state.lessonStageIndex===1?1.9:.9,{destination:key}); state.message=`带着篮子出发，去${destination.label}`;
    } else {
      const task=state.level===5?state.tasks[state.step]:currentFork(state);
      const branch=task?.branches.find(branch=>branch.key===key);
      if (!branch) return wrong(state,key,'先看线索，再选路口的字母牌');
      if (key!==task.correct) {
        begin(state,'detour',key,state.nodeId,branch.nodeTo,1.1,{step:state.step,destination:state.selected});
        const answer=wrong(state,key,`这里是${branch.label}，和线索不一样；沿原路回到路口`); refresh(state); return answer;
      }
      credit(state,key);
      const type=state.level===5?'walk':state.forkIndex+1<task.forks.length?'follow':'collect';
      begin(state,type,key,state.nodeId,branch.nodeTo,1.05,{step:state.step,destination:state.selected,forkIndex:state.forkIndex,targetFriend:state.level===6&&state.lessonStageIndex===2});
      state.message=type==='collect'?(state.lessonStageIndex===2?'把两份食物交到朋友手里':`找到${task.item}，放进随身的野餐篮`):`沿${branch.label}继续向前`;
    }
  } else if (state.mode === 'room') {
    if (state.stage === 'pick') {
      const item = state.items.find(item => item.key === key);
      if (!item) return wrong(state, key, '先按物品上的字母，拿起一件东西');
      credit(state, key); state.selected = key;
      begin(state, 'pick', key, state.placements[key] || 'floor', 'held', .8, { item: key });
      state.message = `小熊正在拿起${item.label}；位置字母可以先按一次`;
    } else {
      const zone = state.zones.find(zone => zone.key === key);
      if (!zone) return wrong(state, key, '手里已经拿好啦，再按一个位置的字母');
      credit(state, key);
      begin(state, 'place', key, state.placements[state.held] || 'floor', key, .9, { item: state.held });
      state.message = `把东西摆到${zone.label}`;
    }
  } else if (state.mode === 'card' && state.level === 9) {
    if (key !== nextTextKey(state)) return wrong(state, key, state.lockedPrefix ? '印好的前面保留，照完整目标补后面的字母' : '照完整目标一个字母一个字母写');
    credit(state, key); state.buffer += char(key);
    if (state.buffer === state.targetText) {
      begin(state, 'fold', key, state.task.id, 'envelope', 1.1, { taskId: state.task.id });
      state.message = '补好啦，把邀请卡收进信封';
    } else state.message = '这个字母写好啦，继续补完整个词';
  } else if (state.mode === 'mail' && state.stage === 'select') {
    const friend = state.friends.find(friend => friend.key === key);
    if (!friend) return wrong(state, key, '看看野餐垫旁的字母，选择先和哪位朋友一起做这件事');
    if (state.arrived.includes(key)) return ignored(state, key, state.lessonStageIndex > 0 ? `已经给${friend.label}写好这张小纸条啦` : `${friend.label}已经坐在野餐垫旁啦`);
    credit(state, key); state.selected = key; state.stage = 'travel';
    begin(state, 'visit', key, 'picnic', key, .8, { destination: key, activity: state.activity.id });
    state.message = `走到${friend.label}身边，准备${friend.activityLabel}`;
  } else {
    // Backspace was taught before editable text. Prefixes remain protected.
    if (state.stage !== 'write') return ignored(state, key);
    if (key === 'Space' && state.level === 10) return ignored(state, key, '这张卡片写完整短词，不需要空格');
    if (key === 'Backspace') {
      if (state.buffer.length <= state.lockedPrefix.length) return ignored(state, key, state.lockedPrefix ? '印好的前面已经锁住啦' : '已经删到开头啦');
      state.buffer = state.buffer.slice(0, -1); credit(state, key);
      state.message = '删掉末尾一个字，再看看完整目标';
    } else {
      if (state.buffer.length >= 100) return ignored(state, key, '先用退格修一修末尾，再继续');
      state.buffer += char(key);
      if (!state.targetText.startsWith(state.buffer)) {
        const answer = wrong(state, key, '末尾多了一个不合适的字，用退格删掉就好');
        refresh(state); return answer;
      }
      credit(state, key); state.message = key === 'Space' ? '词之间留好空格啦，继续写后面的词' : state.level === 12 ? `把${state.activity.label}的小纸条写完整` : '继续写好这张邀请卡';
    }
    if (state.buffer === state.targetText) {
      if (state.mode === 'card') {
        begin(state, 'fold', key, state.task.id, 'envelope', 1.1, { taskId: state.task.id });
        state.message = '修好啦，把邀请卡收进信封';
      } else {
        state.stage = 'delivery';
        const partOnly=state.level===11&&state.lessonStageIndex<2;
        begin(state,'deliver',key,state.selected,'picnic',partOnly?.9:state.level===11?5.5:2.2,{destination:state.selected,partOnly,allGuests:state.level===11&&!partOnly,activity:state.activity?.id||null});
        state.message=partOnly?'这一部分写好啦，留在同一张邀请卡上':state.level===11?'完整邀请贴好啦，三位朋友一起走来':'小纸条写好啦，和朋友一起把这件事做起来';
      }
    }
  }
  refresh(state);
  return result(state, 'accepted', key);
}

/** Physical input wrapper: short codes trigger original stable-ID actions only when complete. */
export function press(state, rawKey) {
  if(state.version<4)return PreviousEngine.press(state,rawKey);
  const key=token(rawKey);
  const inputKind=key==='Backspace'?'correction':state.mode==='forest'||state.mode==='room'?'code':state.stage==='select'?'choice':'letter';
  const output=res=>({...res,inputKind,correct:res.status==='wrong'?false:res.status==='accepted'||res.status==='queued'?true:null});
  if(!key||state.paused||state.stageReady||state.phase==='ready'||state.phase==='complete'&&state.mode!=='room')return output(corePress(state,rawKey));
  if(!['forest','room'].includes(state.mode))return output(corePress(state,rawKey));
  if(state.pendingKey)return output(ignored(state,key,'已经收到位置短码，放好后再选下一件'));
  const choices=codeChoices(state);
  if(!choices.length)return output(ignored(state,key,'动作正在完成，新目标出现后再按'));
  if(key==='Backspace'){
    if(!state.codeBuffer)return output(ignored(state,key,'短码还没有开始'));
    state.codeBuffer=state.codeBuffer.slice(0,-1);credit(state,key);state.message='删掉一个短码字母，再看物品上的完整短码';refresh(state);return output(result(state,'accepted',key));
  }
  const typed=state.codeBuffer+(key==='Space'?' ':key),matches=choices.filter(c=>c.code.startsWith(typed));
  if(!matches.length){const answer=wrong(state,key,'这个字母不在当前短码中，已输入的部分保留');refresh(state);return output(answer);}
  const pending=Boolean(state.action),complete=matches.find(c=>c.code===typed);
  if(!state.codeBuffer)state.codeStartAccepted=state.accepted.length;
  state.codeBuffer=typed;
  if(!pending)credit(state,key);
  if(!complete){state.message='短码记住啦，继续看完整字母牌';refresh(state);return output(result(state,pending?'queued':'accepted',key));}
  state.codeBuffer='';
  if(pending){state.pendingCode=typed;const answer=corePress(state,complete.key);refresh(state);return output({...answer,key});}
  state._suppressCredit=true;const answer=corePress(state,complete.key);delete state._suppressCredit;
  if(answer.status==='wrong')state.accepted.splice(state.codeStartAccepted);
  refresh(state);return output({...answer,key});
}

function commit(state, action) {
  const pendingKey = pendingKeys(state).includes(state.pendingKey) ? state.pendingKey : null;
  state.pendingKey = null;
  state.action = null;
  state.phase = state.solved ? 'complete' : 'playing';
  switch (action.type) {
    case 'catch': {
      state.completed.push(action.taskId); state.counts[action.key]=(state.counts[action.key]||0)+1;
      state.step++; state.progress=state.step; state.fruitStartedAt=state.time; state.lastFruit=action.key;
      if (action.orderId) {
        const counts=state.orderCounts[action.orderId]||(state.orderCounts[action.orderId]={}); counts[action.key]=(counts[action.key]||0)+1;
        const order=state.orders.find(order=>order.id===action.orderId);
        if (Object.entries(order.needs).every(([key,amount])=>(counts[key]||0)===amount)) {
          state.orderCompleted.push(order.id); state.orderHistory.push(order.id);
          if (state.step<state.total) {
            if (state.chooseOrders) {state.orderId=null;state.stage='select';}
            else state.orderId=state.orders.find(order=>!state.orderCompleted.includes(order.id)).id;
          }
        }
      }
      state.message=state.stage==='select'?'这一篮装好啦，选择下一张订单':state.orderId&&state.orderId!==action.orderId?`这个篮子装好了，接着装${state.orders.find(order=>order.id===state.orderId).label}`:`装好一颗啦，看看${state.orders.find(order=>order.id===state.orderId)?.label||'这一排'}还缺什么`;
      if(state.step===state.total) finish(state,'水果都按要求装好啦，篮子里是你亲手挑的水果');
      else if(state.catchStyle==='chunk'&&state.queue.length) {
        const key=state.queue.shift(),task=state.tasks[state.step]; begin(state,'catch',key,key,'basket',.68,{taskId:task.id,orderId:null,fallAge:0});
      }
      break;
    }
    case 'jump':
      state.completed.push(`stone-${state.index + 1}`);
      state.index++; state.step = state.index; state.progress = state.index;
      state.message = action.segmentIndex === stoneSegments(state)[action.segment]?.length - 1 ? '到岸啦！换一串石头，转身再练一次' : '站稳啦，继续下一块石头';
      if (state.index === state.total) finish(state, '到对岸啦！每一步都是你自己走过来的');
      else if (state.queue.length) jump(state, state.queue.shift());
      break;
    case 'walk':
      state.nodeId=action.to; state.traversedNodes.push(action.to);
      state.completed.push(state.tasks[state.step].id);
      state.step++; state.progress = state.step;
      state.message = state.tasks[state.step]?.clue || '找到朋友啦';
      if (state.step === state.total) finish(state, ['已经走到小溪，前面还有两步路线图','穿过溪边树林啦，接着找北边的小屋','找到小屋和朋友啦，你走完了整片森林'][state.lessonStageIndex]);
      break;
    case 'detour':
      state.message = state.task?.clue ? `回到路口啦。${state.task.clue}` : '回到路口啦，再看一看场景线索';
      break;
    case 'visit':
      if (state.mode === 'forest') {
        state.nodeId=action.to; state.traversedNodes.push(action.to);
        state.stage = 'fork';
        state.message = currentFork(state).clue;
      } else {
        state.stage = 'write'; state.buffer = ''; state.lockedPrefix = '';
        state.targetText = state.friends.find(friend => friend.key === state.selected).text;
        state.message = `朋友就在身边，写好这张${state.activity.label}的小纸条`;
      }
      break;
    case 'follow':
      state.nodeId=action.to; state.traversedNodes.push(action.to);
      state.forkIndex++; state.message = currentFork(state).clue;
      break;
    case 'collect':
      state.nodeId=action.to; state.traversedNodes.push(action.to); state.completed.push(action.destination);
      if(!action.targetFriend&&!state.inventory.includes(action.destination)) {state.inventory.push(action.destination);state.routeOrder.push(action.destination);}
      state.step++;state.progress=state.step;state.stage='select';state.selected=null;
      finish(state,action.targetFriend?'两份食物都送到朋友身边，整篮东西一路都没有丢':state.inventory.length===1?'第一份已经在篮子里，带着它去取另一份':state.contentVersion===5?'两份都取到啦，接着送到朋友身边':'两份都取到啦，选一条路去见朋友');
      break;
    case 'pick':
      if(state.codeBuffer&&!state.pendingCode)state.accepted.push(...state.codeBuffer);
      state.held = action.item; state.stage = 'place';
      state.message = '拿好啦，再按一个位置的字母';
      break;
    case 'place':
      state.placements[action.item] = action.to;
      state.held = null; state.selected = null; state.stage = 'pick';
      state.completed = state.items.filter(item => state.placements[item.key]).map(item => item.key);
      state.step++; state.layoutComplete = roomReady(state);
      if (state.layoutComplete) finish(state, state.lessonStageIndex === 2 ? '每件东西都摆到合适的位置啦！还可以继续改摆' : '这一轮整理好啦，两处都放好了东西');
      else if (state.solved) state.message = '这是你新的摆法，想怎么整理都可以';
      else if(isRoomDesign(state))state.message='还需要：'+roomObjectives(state).filter(goal=>!goal.done).map(goal=>goal.label).join('；');
      else {
        const count = key => Object.values(state.placements).filter(zone => zone === key).length;
        const crowded = state.zones.find(zone => count(zone.key) > zone.capacity);
        const available = state.zones.find(zone => count(zone.key) < zone.capacity);
        state.message = crowded && available
          ? `${crowded.label}多了${count(crowded.key) - crowded.capacity}件，可拿一件放到${available.label}`
          : `摆好一件啦，接着看看${state.items.filter(item=>state.placements[item.key]!==item.goalZone).map(item=>`${item.label}要到${state.zones.find(zone=>zone.key===item.goalZone).label}`).join('，')}`;
      }
      break;
    case 'fold':
      state.completed.push(action.taskId); state.step++; state.progress = state.step;
      if (state.step === state.total) finish(state, '邀请卡都收好啦，每张都准备好送给朋友');
      else { initializeCard(state); state.message = state.level === 10 ? '检查这张卡的末尾，按目标删改' : '下一张卡片来了，把缺少的字母补完整'; }
      break;
    case 'deliver':
      state.completed.push(action.destination); state.arrived.push(action.destination); state.step++; state.progress=state.step;
      if(state.level===11) {
        state.invitationWritten.push(state.targetText);
        if(action.allGuests) state.picnicGuests=['C','X','Z'];
        finish(state,action.partOnly?'邀请卡的这一部分写好啦，下一段接着写在同一张卡上':'邀请卡写完整，三位朋友都到公园啦');
      } else {
        state.activityHistory.push({stage:state.lessonStageIndex,friend:action.destination,text:state.targetText,activity:state.activity.id});
        finish(state,`${state.friends.find(friend=>friend.key===action.destination).activityLabel}完成啦，朋友们都留在野餐垫旁`);
      }
      break;
  }
  refresh(state);
  // Start a received operation only after its prerequisite has visibly
  // completed. It is now credited exactly once, and long ticks can finish it.
  if (pendingKey && !state.stageReady && (state.phase !== 'complete' || state.mode === 'room')) {
    state._creditCode=state.pendingCode; state.pendingCode=null; corePress(state,pendingKey); delete state._creditCode; refresh(state);
  }
}

/** Tick handles a whole long frame without losing queued actions or arrivals. */
export function tick(state, dt) {
  if (state.version < 4) return PreviousEngine.tick(state, dt);
  if (!Number.isFinite(dt) || dt <= 0 || state.paused || state.phase === 'ready' || state.stageReady) return state;
  let remaining = dt;
  while (remaining > 0) {
    if (!state.action) { state.time += remaining; remaining = 0; break; }
    const action = state.action;
    const span = Math.min(remaining, Math.max(0, action.duration - action.elapsed));
    state.time += span; action.elapsed += span; remaining -= span;
    if (action.elapsed + 1e-9 >= action.duration) commit(state, action);
    else break;
  }
  if (state.wrongKey && state.time >= state.wrongUntil) { state.wrongKey = null; state.wrongUntil = 0; }
  refresh(state);
  return state;
}

const SAVED_FIELDS = ['seed','codeBuffer','codeStartAccepted','pendingCode','version', 'level', 'phase', 'paused', 'step', 'index', 'accepted', 'completed', 'selected', 'held', 'placements', 'buffer', 'route', 'action', 'pendingKey', 'wrongKey', 'wrongUntil', 'message', 'progress', 'stage', 'queue', 'sequence', 'counts', 'inventory', 'arrived', 'targetText', 'lockedPrefix', 'time', 'fruitStartedAt', 'solved', 'lessonStageIndex', 'stageReady', 'stageHistory', 'stageStartAccepted', 'legacyCompleted', 'migrationNotice', 'forkIndex', 'picnicGuests', 'contentVersion', 'startStageIndex', 'orderId', 'orderCounts', 'orderCompleted', 'orderHistory', 'lastFruit', 'nodeId', 'traversedNodes', 'routeOrder', 'invitationWritten', 'activityHistory'];
export function snapshot(state) {
  if (state.version < 4) return PreviousEngine.snapshot(state);
  // Do not persist renderer state or derived task definitions. Every pending
  // action and queue is preserved, so resuming never double-credits a key.
  return { version: 4, state: clone(Object.fromEntries(SAVED_FIELDS.map(key => [key, state[key]]))) };
}
const finite = value => Number.isFinite(value) && value >= 0;
const keysOnly = array => Array.isArray(array) && array.length <= 20000 && array.every(value => token(value) === value);
const strings = array => Array.isArray(array) && array.length <= 20000 && array.every(value => typeof value === 'string' && value.length <= 60);
// Reject non-JSON object shapes before cloning. Loading a save must not invoke
// accessors, accept prototype keys, or smuggle renderer-owned mutable objects.
function plainData(value, depth = 0) {
  if (depth > 12) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    if (value.length > 20000 || Reflect.ownKeys(value).length !== value.length + 1) return false;
    for (let index = 0; index < value.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !plainData(descriptor.value, depth + 1)) return false;
    }
    return true;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  return Reflect.ownKeys(value).every(key => {
    if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value') && plainData(descriptor.value, depth + 1);
  });
}
function validAction(saved, state) {
  const a = saved.action;
  if (!a) return true;
  if (!saved.accepted.length && a.type !== 'detour') return false;
  const task = state.tasks[saved.step];
  const rawDestination = state.tasks.find(item => item.key === saved.selected);
  const destination = rawDestination ? { ...rawDestination, ...(rawDestination.forks?.[saved.forkIndex] || {}) } : null;
  const from = saved.placements[a.item] || 'floor';
  switch (a.type) {
    case 'catch': return a.orderId === (state.tasks.find(item=>item.id===a.taskId)?.orderId || null) && a.orderId === saved.orderId && a.from === a.key && a.to === 'basket' && !saved.completed.includes(a.taskId) && state.tasks.some(item => item.id === a.taskId && item.key === a.key) && (state.catchStyle === 'orders' || task?.id === a.taskId) && finite(a.fallAge);
    case 'jump': return a.from === saved.index && a.to === saved.index + 1 && saved.index < state.total && a.route === saved.route;
    case 'walk': return state.level === 5 && a.key === task?.correct && a.step === saved.step && a.from === saved.nodeId && a.to === task.nodeTo;
    case 'detour': {
      const fork = state.level === 5 ? task : destination;
      return Boolean(fork?.branches.some(branch => branch.key === a.key)) && a.key !== fork.correct && a.to === fork.branches.find(branch=>branch.key===a.key).nodeTo && a.from === saved.nodeId;
    }
    case 'visit': return ((state.level===6&&a.from===saved.nodeId&&a.to===destination?.startNode)||(state.level===12&&a.from==='picnic'&&a.to===saved.selected))&&saved.stage==='travel'&&a.key===saved.selected&&a.destination===saved.selected&&Boolean(destination)&&!saved.completed.includes(saved.selected);
    case 'follow': return state.level === 6 && saved.stage === 'fork' && a.key === destination?.correct && a.from === saved.nodeId && a.to === destination.nodeTo && a.destination === saved.selected && a.forkIndex === saved.forkIndex && saved.forkIndex + 1 < destination.forks.length && !saved.completed.includes(saved.selected);
    case 'collect': return a.targetFriend === (saved.lessonStageIndex===2) && state.level === 6 && saved.stage === 'fork' && a.key === destination?.correct && a.from === saved.nodeId && a.to === destination.nodeTo && a.destination === saved.selected && saved.forkIndex === destination.forks.length - 1 && !saved.completed.includes(saved.selected);
    case 'pick': return saved.stage === 'pick' && saved.held === null && saved.selected === a.item && a.key === a.item && a.from === from && a.to === 'held';
    case 'place': return saved.stage === 'place' && saved.held === a.item && saved.selected === a.item && a.key === a.to && a.from === from;
    case 'fold': return saved.stage === 'write' && task?.id === a.taskId && a.from === task.id && a.to === 'envelope' && saved.buffer === task.target;
    case 'deliver': return a.partOnly === (state.level===11&&saved.lessonStageIndex<2) && a.allGuests === (state.level===11&&saved.lessonStageIndex===2) && a.activity === (state.activity?.id||null) && saved.stage === 'delivery' && a.destination === saved.selected && a.from === saved.selected && a.to === 'picnic' && saved.buffer === saved.targetText && !saved.arrived.includes(saved.selected);
    default: return false;
  }
}
function validSaved(saved, state) {
  if (!saved || saved.version !== 4 || saved.level !== state.level) return false;
  if (!Number.isInteger(saved.startStageIndex)||saved.startStageIndex<0||saved.startStageIndex>saved.lessonStageIndex) return false;
  if (saved.lessonStageIndex !== state.lessonStageIndex || typeof saved.stageReady !== 'boolean' || typeof saved.legacyCompleted !== 'boolean' || typeof saved.migrationNotice !== 'string' || saved.migrationNotice.length > 500) return false;
  if (!Number.isInteger(saved.forkIndex) || saved.forkIndex < 0 || saved.forkIndex > 1) return false;
  if (!Number.isInteger(saved.stageStartAccepted) || saved.stageStartAccepted < 0 || !keysOnly(saved.accepted) || saved.stageStartAccepted > saved.accepted.length) return false;
  if (!Array.isArray(saved.stageHistory) || saved.stageHistory.length > 3 || !strings(saved.picnicGuests) || new Set(saved.picnicGuests).size !== saved.picnicGuests.length || saved.picnicGuests.some(key => !['J', 'C', 'X', 'Z'].includes(key))) return false;
  if (state.mode !== 'mail' && saved.picnicGuests.length) return false;
  if (saved.legacyCompleted && (!saved.solved || saved.lessonStageIndex !== 0 || saved.stageHistory.length || saved.stageStartAccepted)) return false;
  let historyOffset = 0;
  for (let i = 0; i < saved.stageHistory.length; i++) {
    const history = saved.stageHistory[i];
    const stageIndex=saved.startStageIndex+i;
    const stage = create(state.level, stageIndex, state.seed, state.contentVersion);
    if (!history || history.index !== stageIndex || history.title !== stage.stageTitle || history.total !== stage.total || history.progress !== stage.total || !keysOnly(history.accepted) || !history.accepted.length || history.accepted.join('|') !== saved.accepted.slice(historyOffset, historyOffset + history.accepted.length).join('|')) return false;
    historyOffset += history.accepted.length;
    if (stageIndex < saved.lessonStageIndex && stageIndex === saved.lessonStageIndex - 1 && historyOffset !== saved.stageStartAccepted) return false;
  }
  if (!saved.legacyCompleted && (saved.stageHistory.length !== saved.lessonStageIndex - saved.startStageIndex + (saved.stageReady || saved.solved ? 1 : 0) || saved.lessonStageIndex === saved.startStageIndex && saved.stageStartAccepted !== 0)) return false;
  if ((saved.phase === 'stage-ready') !== saved.stageReady || saved.stageReady && (saved.solved || saved.lessonStageIndex >= 2 || saved.action)) return false;
  if (!['ready', 'playing', 'acting', 'stage-ready', 'complete'].includes(saved.phase) || typeof saved.paused !== 'boolean' || typeof saved.solved !== 'boolean') return false;
  if (!['play', 'select', 'travel', 'fork', 'pick', 'place', 'write', 'delivery'].includes(saved.stage)) return false;
  if (![saved.time, saved.wrongUntil, saved.fruitStartedAt, saved.progress, saved.index, saved.step].every(finite)) return false;
  if (!Number.isInteger(saved.index) || !Number.isInteger(saved.step) || saved.progress > state.total || saved.fruitStartedAt > saved.time) return false;
  if (state.mode !== 'room' && saved.step > state.total) return false;
  if (!keysOnly(saved.accepted) || !keysOnly(saved.queue) || saved.queue.length > state.total || !strings(saved.completed) || !strings(saved.inventory) || !strings(saved.arrived)) return false;
  if ([saved.completed, saved.inventory, saved.arrived].some(array => new Set(array).size !== array.length)) return false;
  if (typeof saved.buffer !== 'string' || saved.buffer.length > 100 || typeof saved.message !== 'string' || saved.message.length > 500 || typeof saved.sequence !== 'string') return false;
  if (typeof saved.targetText !== 'string' || typeof saved.lockedPrefix !== 'string' || !saved.buffer.startsWith(saved.lockedPrefix)) return false;
  for (const value of [saved.selected, saved.held, saved.wrongKey]) if (value !== null && token(value) !== value) return false;
  if (!saved.placements || typeof saved.placements !== 'object' || Array.isArray(saved.placements) || !saved.counts || typeof saved.counts !== 'object' || Array.isArray(saved.counts)) return false;
  if (Object.entries(saved.placements).some(([key, value]) => !state.items.some(item => item.key === key) || !state.zones.some(zone => zone.key === value))) return false;
  if (Object.entries(saved.counts).some(([key, value]) => !state.tasks.some(task => task.key === key) || !Number.isInteger(value) || value < 0 || value > state.tasks.filter(task => task.key === key).length)) return false;
  if ((saved.phase === 'acting') !== Boolean(saved.action)) return false;
  if (saved.phase === 'complete' && !saved.solved) return false;
  if (state.mode !== 'room') {
    if (saved.step !== saved.completed.length || saved.progress !== saved.step) return false;
    const done = saved.step === state.total;
    const final = saved.lessonStageIndex === 2 || saved.legacyCompleted;
    if (saved.solved !== (done && final) || saved.stageReady !== (done && !final) || saved.solved !== (saved.phase === 'complete')) return false;
    const validIds = state.mode === 'stone' ? Array.from({ length: state.total }, (_, i) => `stone-${i + 1}`) : state.tasks.map(task => task.id);
    if (saved.completed.some(id => !validIds.includes(id))) return false;
  }
  if (state.mode === 'catch') {
    for (const choice of state.choices) if ((saved.counts[choice.key] || 0) !== saved.completed.filter(id => state.tasks.find(task => task.id === id)?.key === choice.key).length) return false;
    if (state.level === 1 && state.catchStyle !== 'orders' && saved.completed.some((id, index) => id !== state.tasks[index].id)) return false;
  }
  if (state.level === 5 && saved.completed.some((id, index) => id !== state.tasks[index].id)) return false;
  if(state.level===6&&(!['select','travel','fork'].includes(saved.stage)||saved.inventory.some(key=>!['T','Y'].includes(key))||saved.inventory.length<(saved.lessonStageIndex===2?2:saved.lessonStageIndex))) return false;
  if (state.mode === 'mail' && (saved.arrived.join(',') !== saved.completed.join(',') || state.level===12&&saved.arrived.some(key => !saved.picnicGuests.includes(key)))) return false;
  if (state.mode === 'room' && ((saved.stage === 'place') !== Boolean(saved.held) || !['pick', 'place'].includes(saved.stage))) return false;
  if (state.mode === 'room' && saved.stageReady && !roomReady({ ...state, placements: saved.placements })) return false;
  if (!Number.isInteger(saved.seed)||saved.seed<0||saved.seed>0xffffffff||typeof saved.codeBuffer!=='string'||!/^[A-Z]{0,3}$/.test(saved.codeBuffer)) return false;
  const candidateState={...state,...saved}; refresh(candidateState);
  if(!Number.isInteger(saved.codeStartAccepted)||saved.codeStartAccepted<0||saved.codeStartAccepted>saved.accepted.length)return false;
  if(saved.codeBuffer&&!codeChoices({...candidateState,paused:false}).some(c=>c.code.startsWith(saved.codeBuffer))) return false;
  if(saved.pendingCode!==null&&(typeof saved.pendingCode!=='string'||!state.zones.some(z=>z.key===saved.pendingKey&&z.codesByItem?.[saved.selected]===saved.pendingCode)))return false;
  if (!validAction(saved, state)) return false;
  if (saved.queue.length&&!saved.action) return false;
  if (saved.action) {
    const a = saved.action;
    if (!a || typeof a !== 'object' || !['catch', 'jump', 'walk', 'detour', 'visit', 'follow', 'collect', 'pick', 'place', 'fold', 'deliver'].includes(a.type)) return false;
    if (token(a.key) !== a.key || !finite(a.duration) || !a.duration || a.duration > 10 || !finite(a.elapsed) || a.elapsed > a.duration) return false;
    const allowed = { catch: ['catch'], stone: ['jump'], forest: ['walk', 'detour', 'visit', 'follow', 'collect'], room: ['pick', 'place'], card: ['fold'], mail: ['visit', 'deliver'] };
    if (!allowed[state.mode].includes(a.type)) return false;
    if ((a.type === 'catch' || a.type === 'fold') && !state.tasks.some(task => task.id === a.taskId)) return false;
    if ((a.type === 'pick' || a.type === 'place') && !state.items.some(item => item.key === a.item)) return false;
    if (a.type === 'place' && !state.zones.some(zone => zone.key === a.to)) return false;
    if (a.type === 'deliver' && !state.friends.some(friend => friend.key === a.destination)) return false;
  }
  if (saved.pendingKey !== null && (token(saved.pendingKey) !== saved.pendingKey || !pendingKeys({ ...state, ...saved, choices: catchChoicesForSave(state,saved) }).includes(saved.pendingKey))) return false;
  if (state.mode === 'stone') {
    const seq = state.level === 3 ? state.tasks.map(task => task.sequence).join('') : state.tasks.find(task => task.id === saved.route)?.sequence || '';
    if (saved.sequence !== seq || saved.index > state.total || saved.queue.join('') !== seq.slice(saved.index + (saved.action ? 1 : 0), saved.index + (saved.action ? 1 : 0) + saved.queue.length)) return false;
    if (saved.action && saved.action.key !== seq[saved.index]) return false;
    if(saved.action){const p=stonePosition({...state,route:saved.route},saved.index);if(saved.queue.length>p.sequence.length-p.segmentIndex-1)return false;}
    if (saved.action) { const position = stonePosition({ ...state, route: saved.route }, saved.index); if (saved.action.segment !== position.segment || saved.action.segmentIndex !== position.segmentIndex) return false; }
  } else if (state.mode==='catch'&&state.catchStyle==='chunk') {
    const end=Math.min((Math.floor(saved.step/4)+1)*4,state.total),start=saved.step+(saved.action?1:0);
    if(saved.queue.length>end-start||saved.queue.join('')!==state.tasks.slice(start,start+saved.queue.length).map(task=>task.key).join('')) return false;
  } else if (saved.queue.length) return false;
  if (state.mode === 'room' && saved.held !== null && !state.items.some(item => item.key === saved.held)) return false;
  if (state.mode === 'card') {
    const task = state.tasks[Math.min(saved.step, state.tasks.length - 1)];
    if (saved.targetText !== task.target || saved.lockedPrefix !== task.prefix) return false;
  }
  if (state.mode === 'mail') {
    if (saved.arrived.some(key => !state.friends.some(friend => friend.key === key))) return false;
    const friend = state.friends.find(friend => friend.key === saved.selected);
    if (['write', 'delivery'].includes(saved.stage) && (!friend || saved.targetText !== (state.level===11?state.invitationParts[saved.lessonStageIndex].text:friend.text))) return false;
  }
  if(saved.contentVersion!==state.contentVersion||!strings(saved.traversedNodes)||!strings(saved.routeOrder)||!strings(saved.invitationWritten)||!strings(saved.orderCompleted)||!strings(saved.orderHistory)) return false;
  if(typeof saved.nodeId!=='string'||saved.nodeId.length>60||!Array.isArray(saved.activityHistory)||saved.activityHistory.length>3||!saved.orderCounts||typeof saved.orderCounts!=='object'||Array.isArray(saved.orderCounts)) return false;
  if(saved.lastFruit!==null&&!state.fruitKeys?.includes(saved.lastFruit)) return false;
  if(state.mode==='catch'&&state.orders.length) {
    if(saved.orderId!==null&&!state.orders.some(order=>order.id===saved.orderId)) return false;
    if(saved.orderId===null&&saved.stage!=='select') return false;
    for(const order of state.orders) for(const [key,amount] of Object.entries(order.needs)) {
      const count=saved.orderCounts[order.id]?.[key]||0;
      if(!Number.isInteger(count)||count<0||count>amount||count!==saved.completed.filter(id=>state.tasks.find(task=>task.id===id)?.orderId===order.id&&state.tasks.find(task=>task.id===id)?.key===key).length) return false;
    }
    if(saved.orderCompleted.some(id=>!state.orders.some(order=>order.id===id))||new Set(saved.orderCompleted).size!==saved.orderCompleted.length) return false;
    if(saved.orderHistory.join('|')!==saved.orderCompleted.join('|')) return false;
    for(const [id,counts] of Object.entries(saved.orderCounts)) {
      const order=state.orders.find(order=>order.id===id);
      if(!order||!counts||typeof counts!=='object'||Array.isArray(counts)||Object.entries(counts).some(([key,value])=>!Object.hasOwn(order.needs,key)||!Number.isInteger(value)||value<0))return false;
    }
    for(const order of state.orders) {
      const done=Object.entries(order.needs).every(([key,amount])=>(saved.orderCounts[order.id]?.[key]||0)===amount);
      if(done!==saved.orderCompleted.includes(order.id)) return false;
    }
  } else if(saved.orderId!==null||Object.keys(saved.orderCounts).length||saved.orderCompleted.length||saved.orderHistory.length) return false;
  if(state.mode==='catch') {
    const last=state.tasks.find(task=>task.id===saved.completed.at(-1));
    if(saved.lastFruit!==(last?.key||null))return false;
  }
  if(state.level===5) {
    const node=state.tasks[Math.min(saved.step,state.total-1)][saved.step===state.total?'nodeTo':'nodeFrom'];
    if(saved.nodeId!==node||saved.traversedNodes.some(id=>!/^s[0-2]-n[0-4]$/.test(id)))return false;
  }
  if(state.level===6) {
    if(state.contentVersion===5&&saved.lessonStageIndex===2&&saved.selected!==null&&saved.selected!==saved.routeOrder.at(-1))return false;
    const validNodes=['hub','t-start','t-mid','t-end','y-start','y-mid','y-end','t-return','t-meet','y-return','y-meet','friend'];
    const expected=Math.min(saved.lessonStageIndex+(saved.stageReady||saved.solved?1:0),2);
    if(!validNodes.includes(saved.nodeId)||saved.traversedNodes.some(id=>!validNodes.includes(id))||saved.routeOrder.join('|')!==saved.inventory.join('|')||saved.inventory.length!==expected)return false;
  } else if(saved.inventory.length||saved.routeOrder.length)return false;
  if(state.level===11) {
    const written=state.invitationParts.slice(saved.startStageIndex,saved.lessonStageIndex+(saved.stageReady||saved.solved?1:0)).map(part=>part.text);
    if(saved.invitationWritten.join('|')!==written.join('|')||saved.picnicGuests.join('|')!==(saved.solved?'C|X|Z':''))return false;
  } else if(saved.invitationWritten.length)return false;
  if(state.level===12) {
    if(saved.picnicGuests.join('|')!=='C|X|Z'||saved.activityHistory.length!==saved.lessonStageIndex-saved.startStageIndex+(saved.stageReady||saved.solved?1:0))return false;
    for(let index=0;index<saved.activityHistory.length;index++){
      const record=saved.activityHistory[index],stage=saved.startStageIndex+index,def=create(12,stage,state.seed,state.contentVersion),friend=def.friends.find(friend=>friend.key===record?.friend);
      if(!friend||record.stage!==stage||record.text!==friend.text||record.activity!==def.activity.id)return false;
    }
  } else if(saved.activityHistory.length)return false;
  return true;
}
function catchChoicesForSave(state,saved) {
  if(state.mode!=='catch')return state.choices;
  const order=state.orders.find(order=>order.id===saved.orderId);
  return state.fruitKeys.map(key=>({key,kind:'fruit',remaining:order?(order.needs[key]||0)-(saved.orderCounts[order.id]?.[key]||0):0}));
}
export function restore(value) {
  try {
    const parsed=typeof value==='string'?JSON.parse(value):value;
    if(!plainData(parsed)||!parsed||!parsed.state||!getSpec(parsed.state.level))return null;
    if([1,2,3].includes(parsed.version)) {
      const restored=PreviousEngine.restore(parsed);
      return restored;
    }
    if(parsed.version!==4||parsed.state.version!==4)return null;
    const saved=clone(parsed.state);
    if(!Object.hasOwn(saved,'pendingKey'))saved.pendingKey=null;
    if(Array.isArray(saved.stageHistory))for(const history of saved.stageHistory)if(history&&Number.isInteger(history.index)&&history.index>=0&&history.index<3&&typeof history.title==='string'&&history.title.length<=40)history.title=STAGE_TITLES[history.index];
    const state=create(saved.level,saved.lessonStageIndex,saved.seed,saved.contentVersion);
    if(!validSaved(saved,state))return null;
    for(const key of SAVED_FIELDS)state[key]=saved[key];
    // Initial room positions are deterministic per chapter; actual saved
    // placements are intentionally independent while a child rearranges them.
    refresh(state);return state;
  }catch{return null;}
}


export const createLegacy = (level, stage = 0) => PreviousEngine.createLegacy(level, stage);
export const createV3 = (level, stage = 0) => PreviousEngine.create(level, stage);

export const createVersion3 = createV3;
