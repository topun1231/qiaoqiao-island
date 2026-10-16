import * as Classic from './engine-classic.js';
import {POOLS,shuffled} from './challenge-curriculum.js';
const clone=v=>JSON.parse(JSON.stringify(v));
const edgeId=(a,b)=>[a,b].sort().join('~');
export function forestGraph(s){
 const stage=s.lessonStageIndex;
 let definitions,pairs,start,goal;
 if(s.level===5){
  definitions=[['n0','林间入口',0,7,'reeds'],['n1','大树路口',0,3,'redFlower'],['n2','蘑菇路口',-4,-1,'blueMushroom'],['n3','池塘路口',4,-1,'pond'],['d0','落叶小径',-7,-4,'hollow'],['n4','木桥边',-4,-6,'bridge'],['n5','红花路口',4,-6,'redFlower'],['n6','深林路口',-2,-10,'beehive'],['n7','溪边弯道',3,-11,'reeds'],['d1','岩石小径',7,-9,'slope'],['n8','营地前的小路',0,-15,'blueMushroom'],['n9',['溪边营地','林间营地','小兔小屋'][stage],0,-20-stage*3,stage===2?'cabinLit':'pavilion']];
  pairs=[['n0','n1'],['n1','n2'],['n1','n3'],['n2','d0'],['n2','n4'],['n3','n5'],['n4','n6'],['n5','n7'],['n5','d1'],['n6','n7'],['n6','n8']];
  let last='n8';for(let i=0;i<stage;i++){const name='n'+(10+i);definitions.push([name,'林间弯道',i%2?1:-2,-19-i*4,'redFlower']);pairs.push([last,name]);last=name;}pairs.push([last,'n9']);
  if(stage===1)definitions=definitions.map(([id,label,x,z,f])=>[id,label,-x,z,f]);
  start='n0';goal='n9';
 }else{
  definitions=[['hub','林间入口',0,7,'reeds'],['fork','采购路口',0,3,'blueMushroom'],['l1','蜂窝路口',-4,-1,'beehive'],['r1','芦苇路口',4,-1,'reeds'],['ld','落叶小径',-8,-3,'hollow'],['rd','岩石小径',8,-3,'slope'],['l2','木桥岔路',-5,-6,'bridge'],['r2','花丛岔路',5,-6,'redFlower'],['t-end','蜂蜜小屋',-6,-11,'cabin'],['y-end','果汁亭',6,-11,'pavilion'],['crossL','桥后路口',-2,-10,'blueMushroom'],['crossR','池边路口',2,-10,'pond'],['camp1','林荫小路',-2,-15,'beehive'],['camp2','溪边小路',3,-15,'reeds'],['friend','野餐地',0,-20,'picnic']];
  pairs=[['hub','fork'],['fork','l1'],['fork','r1'],['l1','ld'],['l1','l2'],['r1','rd'],['r1','r2'],['l2','t-end'],['l2','crossL'],['r2','y-end'],['r2','crossR'],['crossL','crossR'],['crossL','camp1'],['crossR','camp2'],['camp1','friend'],['camp2','friend']];
  start='hub';goal='friend';
 }
 const nodes=Object.fromEntries(definitions.map(([id,label,x,z,feature])=>[id,{id,label,feature,point:[x,.105,z],position:[x,.105,z]}]));
 return{nodes,edges:pairs.map(([from,to])=>({from,to,id:edgeId(from,to)})),start,goal};
}
export function createRoute(level,stage=0,seed){
 if(![5,6].includes(level))throw new RangeError('This trial contains levels 5 and 6 only');
 const s=Classic.create(level,stage,seed);s.routeAdventure=2;s.route=null;s.action=null;s.tasks=[];s.visitedEdges=[];s.traversedNodes=[];s.inventory=[];s.discoveries=[];
 s.progress=0;s.total=1;s.step=0;s.stage='fork';s.codeBuffer='';s.target=null;s.nodeId=forestGraph(s).start;s.previousNode=null;
 s.stageTitle=level===5?['溪边营地','林间营地','找到小兔'][stage]:['取第一份点心','再取另一份','带齐去野餐'][stage];
 s.stageDescription=level===5?`看路口的 ${[2,3,4][stage]} 字母短码，逐个打完整才沿这条小路前进。目的地：${s.stageTitle}。走进死路要自己返回，也可以绕路。`:`沿小路取蜂蜜和果汁，先去哪处由你决定，再把两份送到野餐地。路牌是 ${[3,3,4][stage]} 字母短码；食物和位置一直保留。`;
 if(level===6&&stage>0){s.inventory=stage===1?['T']:['T','Y'];s.nodeId=stage===1?'t-end':'y-end';}
 s.traversedNodes=[s.nodeId];s.message=s.stageDescription;refreshRoute(s);return s;
}
export function refreshRoute(s){
 const graph=forestGraph(s),current=graph.nodes[s.nodeId],index=Object.keys(graph.nodes).indexOf(s.nodeId),length=s.level===5?[2,3,4][s.lessonStageIndex]:[3,3,4][s.lessonStageIndex];s.routeGraph=graph;
 const neighbors=graph.edges.flatMap(e=>e.from===s.nodeId?[e.to]:e.to===s.nodeId?[e.from]:[]),pool=shuffled(POOLS[s.level-1],(s.seed+index*7919+s.lessonStageIndex*313)>>>0);
 s.choices=neighbors.map((id,i)=>{const n=graph.nodes[id],back=id===s.previousNode;return{key:pool[i],code:pool[i]+shuffled(pool.filter(k=>k!==pool[i]),(s.seed+index*31+i*101+s.lessonStageIndex*7)>>>0).slice(0,length-1).join(''),label:`${back?'返回 · ':''}${n.label}${s.traversedNodes.includes(id)?' · 已走过':''}`,nodeTo:id,feature:n.feature,done:false};});
 if(s.stageReady||s.solved)s.choices=[];
 s.task={nodeFrom:s.nodeId,branches:s.choices,clue:s.message};s.tasks=Object.values(graph.nodes);s.target=null;s.stage='fork';
 s.codeInput={buffer:s.codeBuffer,candidates:s.choices.filter(c=>c.code.startsWith(s.codeBuffer)).map(c=>({...c,codeCursor:s.codeBuffer.length})),pending:null};
}
function finish(s){s.progress=s.total;s.stageHistory.push({index:s.lessonStageIndex,title:s.stageTitle,accepted:s.accepted.slice(s.stageStartAccepted),progress:1,total:1});s.stageReady=s.lessonStageIndex<2;s.solved=!s.stageReady;s.phase=s.stageReady?'stage-ready':'complete';s.message=s.level===5?'走到目的地啦，这是你自己找出的路线':s.solved?'两份点心送到了，朋友等到你啦':'点心放进篮子了，下一段从这里接着走';}
export function pressRoute(s,raw){
 const key=raw==='Backspace'?'Backspace':typeof raw==='string'&&/^[a-z]$/i.test(raw)?raw.toUpperCase():null,result=status=>({status,key,inputKind:key==='Backspace'?'correction':'code'});
 if(!key||s.paused||s.stageReady||s.solved||s.action)return result('ignored');
 if(key==='Backspace'){if(!s.codeBuffer)return result('ignored');s.codeBuffer=s.codeBuffer.slice(0,-1);s.accepted.push(key);s.wrongKey=null;refreshRoute(s);return result('accepted');}
 const typed=s.codeBuffer+key,candidates=s.choices.filter(c=>c.code.startsWith(typed));
 if(!candidates.length){s.wrongKey=key;s.wrongUntil=s.time+1.3;s.message='这个字母与路牌不符，前面输入的保留；退格可改选另一条路';return result('wrong');}
 s.accepted.push(key);s.wrongKey=null;s.wrongUntil=0;s.codeBuffer=typed;
 const choice=candidates.find(c=>c.code===typed);
 if(choice){s.codeBuffer='';s.action={type:'walk',key:choice.key,from:s.nodeId,to:choice.nodeTo,duration:.85,elapsed:0};s.phase='acting';s.message='收到完整短码，沿你选的小路出发';}else s.message=`已输入 ${typed}，继续打完这一串`;
 refreshRoute(s);return result('accepted');
}
export function tickRoute(s,dt){
 if(s.paused||!Number.isFinite(dt)||dt<=0)return s;s.time+=dt;if(s.wrongKey&&s.time>=s.wrongUntil)s.wrongKey=null;
 if(s.action){const a=s.action;a.elapsed=Math.min(a.duration,a.elapsed+dt);if(a.elapsed>=a.duration){s.action=null;s.phase='playing';s.previousNode=a.from;s.nodeId=a.to;const edge=edgeId(a.from,a.to);if(!s.visitedEdges.includes(edge))s.visitedEdges.push(edge);if(!s.traversedNodes.includes(a.to))s.traversedNodes.push(a.to);
  const g=forestGraph(s),degree=g.edges.filter(e=>e.from===a.to||e.to===a.to).length;s.message=degree===1&&a.to!==g.goal?'这里没有前进的路，输入返回路牌的短码，自己走回来':`${g.nodes[a.to].label} · 看各条路牌，自己选下一步`;
  if(s.level===5&&a.to===g.goal)finish(s);
  if(s.level===6){const item=a.to==='t-end'?'T':a.to==='y-end'?'Y':null;if(item&&!s.inventory.includes(item)){s.inventory.push(item);finish(s);}else if(a.to===g.goal){if(s.inventory.length===2)finish(s);else s.message='朋友还缺点心，沿原路回去，把蜂蜜和果汁找齐';}}
 }}refreshRoute(s);return s;
}
export function advanceRoute(s){if(!s.stageReady||s.action||s.lessonStageIndex>=2)return false;const n=createRoute(s.level,s.lessonStageIndex+1,s.seed);Object.assign(n,{accepted:[...s.accepted],stageStartAccepted:s.accepted.length,stageHistory:clone(s.stageHistory),startStageIndex:s.startStageIndex,paused:s.paused,time:s.time});if(s.level===6)for(const key of ['nodeId','previousNode','inventory','traversedNodes','visitedEdges'])n[key]=clone(s[key]);Object.assign(s,n);refreshRoute(s);return true;}
const fields=['version','routeAdventure','level','seed','startStageIndex','lessonStageIndex','accepted','time','paused','action','wrongKey','wrongUntil','message'];
export const snapshotRoute=s=>({version:4,state:Object.fromEntries(fields.map(k=>[k,clone(s[k])]))});
function plain(v,depth=0){if(depth>12)return false;if(v===null||['string','boolean'].includes(typeof v))return true;if(typeof v==='number')return Number.isFinite(v);if(!v||typeof v!=='object'||(!Array.isArray(v)&&![Object.prototype,null].includes(Object.getPrototypeOf(v)))||Array.isArray(v)&&v.length>20000)return false;return Reflect.ownKeys(v).every(k=>{if(typeof k!=='string'||['__proto__','constructor','prototype'].includes(k))return false;const d=Object.getOwnPropertyDescriptor(v,k);return Object.hasOwn(d,'value')&&plain(d.value,depth+1);});}
export function restoreRoute(value){try{
 const v=typeof value==='string'?JSON.parse(value):value;if(!plain(v)||v?.version!==4)return null;const r=v.state;
 if(!r||Object.keys(r).length!==fields.length||fields.some(k=>!Object.hasOwn(r,k))||r.version!==4||r.routeAdventure!==2||![5,6].includes(r.level)||!Number.isInteger(r.seed)||r.seed<0||r.seed>0xffffffff||![0,1,2].includes(r.startStageIndex)||![0,1,2].includes(r.lessonStageIndex)||r.startStageIndex>r.lessonStageIndex||!Array.isArray(r.accepted)||r.accepted.length>20000||r.accepted.some(k=>typeof k!=='string'||!/^([A-Z]|Backspace)$/.test(k))||!Number.isFinite(r.time)||r.time<0||typeof r.paused!=='boolean'||!Number.isFinite(r.wrongUntil)||r.wrongUntil<0||!(r.wrongKey===null||typeof r.wrongKey==='string'&&/^[A-Z]$/.test(r.wrongKey))||typeof r.message!=='string'||r.message.length>500)return null;
 const s=createRoute(r.level,r.startStageIndex,r.seed);for(let i=0;i<r.accepted.length;i++){if(s.stageReady&&!advanceRoute(s))return null;if(pressRoute(s,r.accepted[i]).status!=='accepted')return null;if(s.action&&(i<r.accepted.length-1||!r.action))tickRoute(s,s.action.duration);}
 if(s.lessonStageIndex<r.lessonStageIndex&&s.stageReady)advanceRoute(s);if(s.lessonStageIndex!==r.lessonStageIndex||Boolean(s.action)!==Boolean(r.action))return null;
 if(r.action){const {elapsed,...rest}=r.action,{elapsed:unused,...expected}=s.action;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=s.action.duration||JSON.stringify(rest)!==JSON.stringify(expected))return null;s.action.elapsed=elapsed;}
 Object.assign(s,{paused:r.paused,time:r.time,wrongKey:r.wrongKey,wrongUntil:r.wrongUntil,message:r.message});return s;
 }catch{return null;}}
