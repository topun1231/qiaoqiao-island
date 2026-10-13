/**
 * A gentle, untimed QWERTY pathway. Only the first bridge exercise is the
 * original exact sequence; lessons 2–12 are implementation-designed practice.
 */
const finger = (hand, name, label, home) => Object.freeze({
  hand,
  finger: name,
  label,
  home,
  returnHint: home === 'Space'
    ? '轻按空格后，拇指放松；其他手指留在基准键上'
    : `按完回到 ${home}，让食指找到 F 和 J 的小凸点`,
});
const leftPinky = finger('left', 'pinky', '左手小指', 'A');
const leftRing = finger('left', 'ring', '左手无名指', 'S');
const leftMiddle = finger('left', 'middle', '左手中指', 'D');
const leftIndex = finger('left', 'index', '左手食指', 'F');
const rightIndex = finger('right', 'index', '右手食指', 'J');
const rightMiddle = finger('right', 'middle', '右手中指', 'K');
const rightRing = finger('right', 'ring', '右手无名指', 'L');
const rightPinky = finger('right', 'pinky', '右手小指', ';');
const thumb = finger('either', 'thumb', '拇指', 'Space');

export const FINGERS = Object.freeze({
  Q: leftPinky, A: leftPinky, Z: leftPinky,
  W: leftRing, S: leftRing, X: leftRing,
  E: leftMiddle, D: leftMiddle, C: leftMiddle,
  R: leftIndex, T: leftIndex, F: leftIndex, G: leftIndex, V: leftIndex, B: leftIndex,
  Y: rightIndex, U: rightIndex, H: rightIndex, J: rightIndex, N: rightIndex, M: rightIndex,
  I: rightMiddle, K: rightMiddle,
  O: rightRing, L: rightRing,
  P: rightPinky,
  Space: thumb,
  Backspace: Object.freeze({ ...rightPinky, returnHint: '右手小指轻按退格，再回到 ; 键；右手食指回到 J' }),
});

export function getFinger(token) {
  return typeof token === 'string' && Object.hasOwn(FINGERS, token) ? FINGERS[token] : null;
}

const letters = value => [...value];
const text = value => [...value].map(character => character === ' ' ? 'Space' : character.toUpperCase());
const level = value => Object.freeze({
  ...value,
  newKeys: Object.freeze(value.newKeys),
  sequence: Object.freeze(value.sequence),
  reward: Object.freeze(value.reward),
});

export const LEVELS = Object.freeze([
  level({
    id: 1, title: '小熊回家', subtitle: '找到 F 和 J 的小凸点，用两只食指帮小熊收果子',
    newKeys: ['F', 'J'], sequence: letters('FFFFJJJJFJFJJFJF'),
    reward: { name: '温暖木桥', icon: '🌉', description: '八块木板连起小岛，小熊有路回家啦' },
    actionLabel: '接住果子',
  }),
  level({
    id: 2, title: '门前小花圃', subtitle: '中指认识 D 和 K，按完轻轻回到基准键',
    newKeys: ['D', 'K'], sequence: letters('DDDDKKKKDKDKKDKDFJDKFJDK'),
    reward: { name: '门前花圃', icon: '🌷', description: '小屋旁长出两丛柔软的小花' },
    actionLabel: '种下小花',
  }),
  level({
    id: 3, title: '雏菊小径', subtitle: '无名指认识 S 和 L，让小雏菊沿路开放',
    newKeys: ['S', 'L'], sequence: letters('SSSSLLLLSLSLLSLSFJDKSLDK'),
    reward: { name: '小雏菊', icon: '🌼', description: '白色的小雏菊点亮门前的小径' },
    actionLabel: '种下雏菊',
  }),
  level({
    id: 4, title: '种一棵小树', subtitle: '左手小指找到 A；食指伸向 G 和 H，再回 F 和 J',
    newKeys: ['A', 'G', 'H'], sequence: letters('AAAAGGGGHHHHAGHAGHFDJKSLAGH'),
    reward: { name: '嫩绿树苗', icon: '🌱', description: '小树苗在屋边扎根，陪小熊一起长大' },
    actionLabel: '种下树苗',
  }),
  level({
    id: 5, title: '给花园浇水', subtitle: '中指向上找 E 和 I，按完回到 D 和 K',
    newKeys: ['E', 'I'], sequence: letters('EEEEIIIIEIEIIEIFJDKSLAEHIG'),
    reward: { name: '花园水壶', icon: '💧', description: '装满清水的小水壶留在花园里' },
    actionLabel: '浇灌花园',
  }),
  level({
    id: 6, title: '弯弯石头路', subtitle: '食指探索 R、U、T、Y，每次都回 F 和 J',
    newKeys: ['R', 'U', 'T', 'Y'], sequence: letters('RRUUTTYYRUTYYTURERUIFTJY'),
    reward: { name: '弯弯石径', icon: '🪨', description: '平整的小石头铺出通往花园的路' },
    actionLabel: '铺好石径',
  }),
  level({
    id: 7, title: '微风小风车', subtitle: '小指和无名指认识 Q、W、O、P，按完回到基准键',
    newKeys: ['Q', 'W', 'O', 'P'], sequence: letters('QQWWOOPPQWOPPOWQQEWRUITOPY'),
    reward: { name: '彩色风车', icon: '🌬️', description: '一座小风车陪着海风轻轻转动' },
    actionLabel: '装好风车',
  }),
  level({
    id: 8, title: '小小菜园', subtitle: '食指向下找 V、M、B、N，按完回 F 和 J',
    newKeys: ['V', 'M', 'B', 'N'], sequence: letters('VVMMBBNNVMBNNBMVVFJMBNTH'),
    reward: { name: '小小菜园', icon: '🥕', description: '整齐的菜畦里，蔬菜正在慢慢长大' },
    actionLabel: '种好菜园',
  }),
  level({
    id: 9, title: '森林来信', subtitle: '左手找到 C、X、Z，再和下排的朋友一起练习',
    newKeys: ['C', 'X', 'Z'], sequence: letters('CCXXZZCCXZVMBNCXZNBMVCXZX'),
    reward: { name: '森林信箱', icon: '📮', description: '小屋前立起信箱，等候朋友们的来信' },
    actionLabel: '安好信箱',
  }),
  level({
    id: 10, title: '草地野餐', subtitle: '把字母连成短词，用拇指轻按空格分开它们',
    newKeys: ['Space'], sequence: text('cat dog sun map hat red fox'),
    reward: { name: '野餐小毯', icon: '🧺', description: '一张野餐毯和小篮子，等朋友一起坐下' },
    actionLabel: '准备野餐',
  }),
  level({
    id: 11, title: '点亮小灯笼', subtitle: 'catt 多了一个 t：右手小指轻按退格，回到 ;，再继续短词',
    newKeys: ['Backspace'], initialText: 'catt',
    sequence: ['Backspace', ...text(' dog sun red fox hat map')],
    reward: { name: '暖暖灯笼', icon: '🏮', description: '小灯笼亮起来，照着每一次慢慢修正' },
    actionLabel: '点亮灯笼',
  }),
  level({
    id: 12, title: '小岛欢迎会', subtitle: '慢慢写下一句英文，让朋友们聚在温暖的小屋旁',
    newKeys: [], sequence: text('the sun is warm and we are home'),
    reward: { name: '小岛欢迎会', icon: '🎉', description: '朋友们带来彩旗，在美丽的小岛上一起庆祝' },
    actionLabel: '布置欢迎会',
  }),
]);

export function getLevel(id) {
  return Number.isInteger(id) && id >= 1 && id <= LEVELS.length ? LEVELS[id - 1] : null;
}
