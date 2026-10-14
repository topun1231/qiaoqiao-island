import {plain} from './route-adventure.js';
import * as Classic from './engine-classic.js';

export const DIRECTIONS={W:[0,-1,'↑ 上'],A:[-1,0,'← 左'],S:[0,1,'↓ 下'],D:[1,0,'→ 右']};
const clone=v=>JSON.parse(JSON.stringify(v));
const id=(x,y)=>`${x},${y}`;
// Corridors are connected and include cul-de-sacs; no choice teleports the player back.
const MAPS=[
 ['#####','#...#','###.#','#...#','#.###','#...#','#####'],
 ['#######','#.....#','#.###.#','#...#.#','###.#.#','#.....#','#######'],
 ['#########','#...#...#','#.#.#.#.#','#.#...#.#','#.#####.#','#.......#','#########'],
];
export function mazeBoard(s){
 const rows=s.level===6?MAPS[2]:MAPS[s.lessonStageIndex],cells=[];
 for(let y=0;y<rows.length;y++)for(let x=0;x<rows[y].length;x++)if(rows[y][x]==='.')cells.push([x,y]);
 return{rows,cells,start:[1,rows.length-2],goal:[rows[0].length-2,1],supplies:{T:[3,1],Y:[7,3]}};
}
export function classification(s){
 return [
  {title:'整理阅读和游戏用品',zones:['阅读区','游戏区'],goals:{F:'M',D:'M',V:'M',B:'N'},rules:['书、灯、软垫','玩具篮']},
  {title:'准备小舞台',zones:['观众阅读区','表演区'],goals:{F:'M',V:'M',D:'N',B:'N'},rules:['书、软垫','灯、玩具篮']},
  {title:'睡前收拾好',zones:['床边区','收纳区'],goals:{D:'M',V:'M',F:'N',B:'N'},rules:['灯、软垫','书、玩具篮']},
 ][s.lessonStageIndex];
}
const friends=[{key:'C',label:'小兔',text:'come and play'},{key:'X',label:'小熊',text:'bring some fruit'},{key:'Z',label:'小鹿',text:'join our picnic'}];
export function createActivity(level,stage=0,seed){
 if(![5,6,8,11,12].includes(level))throw Error('Unknown activity');
 const s=Classic.create(level,stage,seed);s.activityEdition=1;s.contentVersion=6;s.action=null;s.target=null;s.accepted=[];
 s.progress=0;s.step=0;s.stage='play';s.completed=[];s.traversedNodes=[];s.inventory=[];s.arrived=[];s.picnicGuests=[];
 s.placements={};s.initialPlacements={};s.selected=null;s.held=null;s.codeBuffer='';s.buffer='';s.targetText='';s.activity=null;s.activityHistory=[];
 delete s.invitationParts;
 if(level===5||level===6){s.position=[...mazeBoard(s).start];s.total=1;s.nodeId=id(...s.position);s.traversedNodes=[s.nodeId];s.stageTitle=level===5?['找到溪边营地','绕过树篱','找到小兔'][stage]:['装进第一份','再找另一份','送到野餐地'][stage];s.stageDescription=level===5?'W 上、A 左、S 下、D 右。走到旗子就完成；走进死路，要自己按反方向走回来。':'沿迷宫找蜂蜜和果汁，先找哪份都可以；两份带齐后走到野餐旗子。走错路自己返回。';}
 if(level===8){const c=classification(s);s.items=[{key:'F',label:'故事书'},{key:'D',label:'阅读灯'},{key:'V',label:'软垫'},{key:'B',label:'玩具篮'}].map(i=>({...i,code:i.key,goalZone:c.goals[i.key]}));s.zones=['M','N'].map((key,i)=>({key,code:key,label:c.zones[i],rule:c.rules[i],capacity:Object.values(c.goals).filter(v=>v===key).length}));s.tasks=s.items;s.total=4;s.stage='pick';s.stageTitle=c.title;s.stageDescription=`右边 M：${c.zones[0]}（${c.rules[0]}）；左边 N：${c.zones[1]}（${c.rules[1]}）。先拿物品，再放到地毯对应的区域。`;}
 if(level===11){s.friends=clone(friends);s.total=1;s.stage='select';s.stageTitle=['拜访第一位朋友','去另一位朋友家','送出最后一封'][stage];s.stageDescription='按 C、X 或 Z 选还没邀请的朋友，走到他家门前写邀请。每封送出后，这位朋友会走去野餐地。';}
 if(level===12){s.total=[3,6,3][stage];s.stageTitle=['滚球过门','搭一座彩色塔','风筝摘星星'][stage];s.stageDescription=['A 向左、D 向右移球，对准亮着的球门，再按门上的字母击球。三道门都要过。','看上方的下一块形状：F 方块、J 长条、K 屋顶。每按对一次，亲手搭上一块。','W 上、A 左、S 下、D 右操纵风筝，收齐三颗星。云朵挡路时换一个方向。'][stage];s.lane=0;s.position=[2,2];s.stars=[];s.blocks=[];}
 if(level===6&&stage>0){s.inventory=stage===1?['T']:['T','Y'];s.position=[...mazeBoard(s).supplies[stage===1?'T':'Y']];s.traversedNodes=[id(...s.position)];}
 if(level===11&&stage>0){s.arrived=friends.slice(0,stage).map(f=>f.key);s.picnicGuests=[...s.arrived];}
 s.message=s.stageDescription;refreshActivity(s);return s;
}
export const gateLane=s=>[-1,1,0][s.step];
export const gateKey=s=>'FJKLRTYU'[(s.seed+s.step*3)%8];
export const blockKey=s=>['F','J','F','J','F','K'][s.step];
export const kiteStars=[[0,0],[4,0],[2,1]];
export function refreshActivity(s){
 s.choices=[];s.target=null;
 if(s.level===5||s.level===6){const b=mazeBoard(s);s.choices=Object.entries(DIRECTIONS).filter(([,v])=>b.rows[s.position[1]+v[1]]?.[s.position[0]+v[0]]==='.').map(([key,v])=>({key,code:key,label:v[2]}));s.nodeId=id(...s.position);}
 if(s.level===8)s.choices=(s.held?s.zones:s.items).map(i=>({...i,code:i.key,done:false}));
 if(s.level===11){s.choices=s.stage==='select'?s.friends.map(f=>({...f,code:f.key,done:s.arrived.includes(f.key)})):[];s.target=s.stage==='write'?(s.targetText.startsWith(s.buffer)?s.targetText[s.buffer.length]?.toUpperCase()===' '?'Space':s.targetText[s.buffer.length]?.toUpperCase():'Backspace'):null;}
 if(s.level===12){s.choices=(s.lessonStageIndex===0?[{key:'A',label:'向左移球'},{key:'D',label:'向右移球'},{key:gateKey(s),label:'击球'}]:s.lessonStageIndex===1?[{key:'F',label:'方块'},{key:'J',label:'长条'},{key:'K',label:'屋顶'}]:Object.entries(DIRECTIONS).map(([key,v])=>({key,label:v[2]}))).map(c=>({...c,code:c.key}));}
 if(s.stageReady||s.solved&&s.level!==8)s.choices=[];
 s.codeInput={buffer:'',candidates:s.choices,pending:null};
}
function finish(s){s.progress=s.total;s.stageHistory.push({index:s.lessonStageIndex,title:s.stageTitle,accepted:s.accepted.slice(s.stageStartAccepted),progress:s.total,total:s.total});s.stageReady=s.lessonStageIndex<2;s.solved=!s.stageReady;s.phase=s.stageReady?'stage-ready':'complete';s.message='完成啦！这是你一步一步做出来的';}
function begin(s,type,key,to,duration=.4,extra={}){s.action={type,key,from:s.level===8?s.placements[s.held||key]||'floor':s.level===11?s.selected:clone(s.position||s.lane),to:clone(to),duration,elapsed:0,...extra};s.phase='acting';}
export function pressActivity(s,raw){
 const key=raw===' '||raw==='Space'?'Space':raw==='Backspace'?'Backspace':/^[a-z]$/i.test(raw||'')?raw.toUpperCase():null;
 const result=status=>({status,key,inputKind:s.level===11&&s.stage==='write'?'letter':'choice'});
 if(!key||s.paused||s.action||s.stageReady||s.solved&&s.level!==8)return result('ignored');
 const accept=()=>{s.accepted.push(key);s.wrongKey=null;refreshActivity(s);return result('accepted');};
 const wrong=message=>{s.wrongKey=key;s.wrongUntil=s.time+1.3;s.message=message;return result('wrong');};
 if(s.level===5||s.level===6){const d=DIRECTIONS[key];if(!d)return wrong('按 W、A、S、D，选择走的方向');const p=[s.position[0]+d[0],s.position[1]+d[1]];if(mazeBoard(s).rows[p[1]]?.[p[0]]!=='.'){s.message='这边有树篱，换个方向；走过的路也能返回';return result('ignored');}begin(s,'walk',key,p);s.message=`往${d[2]}走一段`;return accept();}
 if(s.level===8){if(!s.held){const item=s.items.find(i=>i.key===key);if(!item)return wrong('先按 F、D、V 或 B 拿起物品');s.selected=key;begin(s,'pick',key,'held',.65,{item:key});}
  else{const zone=s.zones.find(z=>z.key===key);if(!zone)return wrong('手里拿好了，按 M 放右边，按 N 放左边');begin(s,'place',key,key,.7,{item:s.held});}return accept();}
 if(s.level===11){if(s.stage==='select'){if(!s.friends.some(f=>f.key===key))return wrong('按朋友家旁的 C、X 或 Z');if(s.arrived.includes(key)){s.message='这位朋友已经出发啦，去另一个家';return result('ignored');}s.selected=key;s.stage='travel';begin(s,'visit',key,key,1.1,{destination:key});return accept();}
  if(s.stage!=='write')return result('ignored');
  if(key==='Backspace'){if(!s.buffer)return result('ignored');s.buffer=s.buffer.slice(0,-1);}else{const ch=key==='Space'?' ':key.toLowerCase();if(!s.targetText.startsWith(s.buffer+ch))return wrong('照邀请卡上的字母继续写，前面不用重打');s.buffer+=ch;}
  if(s.buffer===s.targetText){s.stage='delivery';begin(s,'deliver',key,'picnic',3,{destination:s.selected});}return accept();}
 if(s.lessonStageIndex===0){if(key==='A'||key==='D'){const next=Math.max(-1,Math.min(1,s.lane+(key==='A'?-1:1)));if(next===s.lane)return result('ignored');begin(s,'shift',key,next,.22);}else if(key===gateKey(s)){if(s.lane!==gateLane(s)){s.message='还没对准亮着的球门，按 A 或 D 调整位置';return result('ignored');}begin(s,'roll',key,s.step+1,.5);}else return wrong('先用 A / D 对准球门，再按门上的字母');return accept();}
 if(s.lessonStageIndex===1){if(key!==blockKey(s))return wrong('看看上方的下一块，再选同样形状的积木');begin(s,'stack',key,s.step,.35);return accept();}
 const d=DIRECTIONS[key];if(!d)return wrong('按 W、A、S、D 操纵风筝');const p=[s.position[0]+d[0],s.position[1]+d[1]];if(p[0]<0||p[0]>4||p[1]<0||p[1]>2||p[0]===1&&p[1]===1||p[0]===3&&p[1]===1){s.message='这边有云或到了边界，换一个方向';return result('ignored');}begin(s,'fly',key,p,.3);return accept();
}
export function tickActivity(s,dt){
 if(s.paused||!Number.isFinite(dt)||dt<=0)return s;s.time+=dt;if(s.wrongKey&&s.time>=s.wrongUntil)s.wrongKey=null;
 if(s.action){const a=s.action;a.elapsed=Math.min(a.duration,a.elapsed+dt);if(a.elapsed>=a.duration){s.action=null;s.phase=s.solved?'complete':'playing';
  if(a.type==='walk'){s.position=a.to;s.nodeId=id(...s.position);if(!s.traversedNodes.includes(s.nodeId))s.traversedNodes.push(s.nodeId);const b=mazeBoard(s);s.message='停在这里，自己选择下一步';if(s.level===5){if(id(...s.position)===id(...b.goal))finish(s);}else{for(const [item,p]of Object.entries(b.supplies))if(id(...s.position)===id(...p)&&!s.inventory.includes(item)){s.inventory.push(item);s.message=`${item==='T'?'蜂蜜':'果汁'}装进篮子了`;finish(s);}if(s.lessonStageIndex===2&&s.inventory.length===2&&id(...s.position)===id(...b.goal))finish(s);}}
  if(a.type==='pick'){s.held=a.item;s.stage='place';s.message='拿好了，按 M 放右边，按 N 放左边';}
  if(a.type==='place'){s.placements[a.item]=a.to;s.held=null;s.stage='pick';s.progress=s.items.filter(i=>s.placements[i.key]===i.goalZone).length;s.message=s.items.find(i=>i.key===a.item).goalZone===a.to?'放对啦！再拿下一件':'这件用途不合适，物品留在这里；再拿起来换一边';if(s.progress===4&&!s.solved)finish(s);}
  if(a.type==='visit'){s.stage='write';s.buffer='';s.targetText=s.friends.find(f=>f.key===s.selected).text;s.message='到了朋友家，照卡片写好邀请';}
  if(a.type==='deliver'){s.arrived.push(s.selected);s.picnicGuests=[...s.arrived];finish(s);}
  if(a.type==='shift')s.lane=a.to;
  if(a.type==='roll'||a.type==='stack'){if(a.type==='stack')s.blocks.push(a.key);s.step++;s.progress=s.step;s.message=a.type==='roll'?'穿过球门了！对准下一道':'搭上一块啦！看看下一块的形状';if(s.progress===s.total)finish(s);}
  if(a.type==='fly'){s.position=a.to;const star=kiteStars.findIndex(p=>id(...p)===id(...s.position));if(star>=0&&!s.stars.includes(star))s.stars.push(star);s.progress=s.stars.length;if(s.progress===3)finish(s);}
 }}refreshActivity(s);return s;
}
export function advanceActivity(s){if(!s.stageReady||s.action||s.lessonStageIndex>=2)return false;const n=createActivity(s.level,s.lessonStageIndex+1,s.seed);Object.assign(n,{accepted:[...s.accepted],stageStartAccepted:s.accepted.length,stageHistory:clone(s.stageHistory),startStageIndex:s.startStageIndex,time:s.time,paused:s.paused});if(s.level===6){n.position=[...s.position];n.inventory=[...s.inventory];n.traversedNodes=[...s.traversedNodes];}if(s.level===11){n.arrived=[...s.arrived];n.picnicGuests=[...s.picnicGuests];}Object.assign(s,n);refreshActivity(s);return true;}
const fields=['version','activityEdition','level','seed','startStageIndex','lessonStageIndex','accepted','time','paused','action','wrongKey','wrongUntil','message'];
export const snapshotActivity=s=>({version:4,state:Object.fromEntries(fields.map(k=>[k,clone(s[k])]))});
export function restoreActivity(value){try{
 const v=typeof value==='string'?JSON.parse(value):value;if(!plain(v)||!v||v.version!==4)return null;const r=v.state;
 if(!r||Object.keys(r).length!==fields.length||fields.some(k=>!Object.hasOwn(r,k))||r.version!==4||r.activityEdition!==1||![5,6,8,11,12].includes(r.level)||!Number.isInteger(r.seed)||r.seed<0||r.seed>0xffffffff||![0,1,2].includes(r.startStageIndex)||![0,1,2].includes(r.lessonStageIndex)||r.startStageIndex>r.lessonStageIndex||!Array.isArray(r.accepted)||r.accepted.length>20000||r.accepted.some(k=>typeof k!=='string'||!/^([A-Z]|Space|Backspace)$/.test(k))||!Number.isFinite(r.time)||r.time<0||typeof r.paused!=='boolean'||!Number.isFinite(r.wrongUntil)||r.wrongUntil<0||!(r.wrongKey===null||typeof r.wrongKey==='string'&&/^([A-Z]|Space|Backspace)$/.test(r.wrongKey))||typeof r.message!=='string'||r.message.length>500)return null;
 const s=createActivity(r.level,r.startStageIndex,r.seed);for(let i=0;i<r.accepted.length;i++){if(s.stageReady&&!advanceActivity(s))return null;if(pressActivity(s,r.accepted[i]).status!=='accepted')return null;if(s.action&&(i<r.accepted.length-1||!r.action))tickActivity(s,s.action.duration);}
 if(s.lessonStageIndex<r.lessonStageIndex&&s.stageReady)advanceActivity(s);if(s.lessonStageIndex!==r.lessonStageIndex||Boolean(s.action)!==Boolean(r.action))return null;
 if(r.action){const {elapsed,...rest}=r.action,{elapsed:unused,...expected}=s.action;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=s.action.duration||JSON.stringify(rest)!==JSON.stringify(expected))return null;s.action.elapsed=elapsed;}
 Object.assign(s,{paused:r.paused,time:r.time,wrongKey:r.wrongKey,wrongUntil:r.wrongUntil,message:r.message});return s;
 }catch{return null;}}
export function activityKeys(s){if(s.stageReady||s.action)return[];return s.level===11&&s.stage==='write'?[...new Set([...s.targetText.toUpperCase()].map(k=>k===' '?'Space':k)),'Backspace']:s.choices.filter(c=>!c.done).map(c=>c.key);}
export function activityGuide(s){
 if(s.stageReady||s.solved&&s.level!==8)return null;
 const guide=(title,controls,next)=>({title,controls,next});
 if(s.level===5||s.level===6)return guide(s.level===5?'沿迷宫走到黄色旗子':s.inventory.length<2?'先找蜂蜜和果汁':'两份装齐了，走到野餐旗子','W ↑ 上　A ← 左　S ↓ 下　D → 右；每按一次走一段',s.action?'正在走这一段，停稳后再选方向':'走进死路会停在那里；按反方向自己走回来，不扣分');
 if(s.level===8){const c=classification(s);return guide(s.solved?'完成了，可以自由摆放':c.title,s.held?'拿好了：M 放右边绿色区；N 放左边橙色区':'按 F 取书、D 取灯、V 取软垫、B 取玩具篮',s.solved?'想结束就点「冒险地图」':`右边 ${c.zones[0]}：${c.rules[0]}；左边 ${c.zones[1]}：${c.rules[1]}`);}
 if(s.level===11)return s.stage==='select'?guide('还没邀请谁？去他家看看',s.choices.filter(c=>!c.done).map(c=>`按 ${c.key} 去${c.label}家`).join('；'),'每次走到不同朋友的门前，送好后朋友自己去野餐'):guide(s.action?s.stage==='delivery'?'朋友收到邀请，正在去野餐':'小熊正在去朋友家':'在朋友家门口写邀请','照卡片输入字母；词之间按空格，不用回车','前面写对的保留；按错再试，也可用 Backspace 删除末字');
 return guide(s.stageTitle,s.stageDescription,s.action?'这一步已收到，动画结束后继续':s.lessonStageIndex===0?'球没对准不会丢失，调整位置再击球':s.lessonStageIndex===1?'每按对一次就搭上一块，不需要抄整句英文':'星星会留在收集栏，绕过云朵继续飞');
}
