import * as Classic from './engine-classic.js';
import {POOLS} from './challenge-curriculum.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const edgeId=(a,b)=>[a,b].sort().join('~');
function code(state,index,length){
 const pool=POOLS[state.level-1];let value=(state.seed+index*7919+state.lessonStageIndex*313)>>>0,result='';
 for(let i=0;i<length;i++){value=(Math.imul(value,1664525)+1013904223)>>>0;result+=pool[value%pool.length];}
 return result;
}
export function riverLeg(state,lane=state.route){
 const easy=lane==='agh',leg=state.routeLeg||0,count=easy?3:2,length=easy?2:3+Number(state.lessonStageIndex===2);
 const start=leg?[0,.32,2.4]:[-5.15,.32,2.4],end=leg?[5.15,.32,2.4]:[0,.32,2.4];
 return{start,end,codes:Array.from({length:count},(_,i)=>code(state,leg*30+i+(easy?1:11),length)),stones:Array.from({length:count},(_,i)=>[start[0]+(end[0]-start[0])*(i+1)/(count+1),easy?1.05:3.75]),radius:easy?.68:.49};
}
export function forestGraph(state){
 const stage=state.lessonStageIndex,prefix=`s${stage}-`,offset=stage*14;
 const definitions=[['n0','林间入口',0,5,'reeds'],['n1','蘑菇地',-3,1,'blueMushroom'],['d0','池塘',3,1,'pond'],['d1','树洞小径',0,-1,'hollow'],['n2','松鼠木桥',-3,-3,'bridge'],['d2','花丛小径',3,-3,'redFlower'],['n3','汇合路口',0,-6,'beehive'],['n4',['溪边营地','林间营地','小兔小屋'][stage],0,-9,stage===2?'cabinLit':'pavilion']];
 const nodes=Object.fromEntries(definitions.map(([id,label,x,z,feature])=>[prefix+id,{id:prefix+id,label,feature,point:[x,.105,z-offset]}]));
 const pairs=[['n0','n1'],['n0','d0'],['n1','d1'],['d0','d1'],['n1','n2'],['d0','d2'],['n2','n3'],['d2','n3'],['n3','n4']];
 const edges=pairs.map(([a,b])=>({from:prefix+a,to:prefix+b,id:edgeId(prefix+a,prefix+b)}));
 return{nodes,edges,start:prefix+'n0',goal:prefix+'n4'};
}
export function createRoute(level,stage=0,seed){
 const state=Classic.create(level,stage,seed);
 state.routeAdventure=1;state.routeLeg=0;state.routeStone=0;state.visitedEdges=[];state.discoveries=[];
 state.tasks=[];state.route=null;state.step=0;state.index=0;state.progress=0;state.total=level===4?2:1;
 state.completed=[];state.traversedNodes=[];state.stage='select';state.nodeId=level===5?forestGraph(state).start:'river-start';
 state.stageDescription=level===4?'大石头路：三次短码跳跃；小岛捷径：两次长码跳跃。到中途小岛可以换路。':'两边的小路都能走。输入路牌短码前进，可以回头、绕路；走过的小径会留下标记。';
 state.message=level===5?'选一条小路，出发找朋友':state.stageDescription;refreshRoute(state);return state;
}
export function refreshRoute(state){
 if(state.level===4){
  state.tasks=[{id:'agh',key:'A',label:'大石头路 · 3 跳 × 2 字母'},{id:'hag',key:'H',label:`小岛捷径 · 2 跳 × ${state.lessonStageIndex===2?4:3} 字母`}];
  state.stage=state.route?'play':'select';
  const path=riverLeg(state),target=state.route?path.codes[state.routeStone]||'':'';
  state.choices=state.route?[{key:target[0],code:target,label:'当前石头',done:false}]:state.tasks.map(t=>({...t,code:t.key,done:false}));
  state.target=state.route?target[state.codeBuffer.length]||null:null;state.task=null;
 }else{
  const graph=forestGraph(state);state.routeGraph=graph;
  const destinations=graph.edges.flatMap(e=>e.from===state.nodeId?[e.to]:e.to===state.nodeId?[e.from]:[]);
  const pool=POOLS[4],length=state.lessonStageIndex===2?3:2;
  const branches=destinations.map((id,i)=>{const node=graph.nodes[id],back=node.point[2]>graph.nodes[state.nodeId].point[2];return{key:['E','I','R'][i],code:pool[(state.seed+i*3+destinations.length)%pool.length]+code(state,17+i,length-1),label:`${back?'返回 · ':''}${node.label}${state.traversedNodes.includes(id)?' · 已到过':''}`,feature:node.feature,nodeTo:id,done:false};});
  state.task={nodeFrom:state.nodeId,branches,clue:state.message};
  state.tasks=Object.values(graph.nodes).map(n=>({id:n.id,...n}));state.choices=branches;state.target=null;state.stage='fork';
 }
 if(state.stageReady||state.solved)state.choices=[];
 state.codeInput={buffer:state.codeBuffer,candidates:state.choices.filter(c=>c.code.startsWith(state.codeBuffer)).map(c=>({...c,codeCursor:state.codeBuffer.length})),pending:null};
}
function finish(state){
 state.progress=state.total;state.step=state.total;
 state.stageHistory.push({index:state.lessonStageIndex,title:state.stageTitle,accepted:state.accepted.slice(state.stageStartAccepted),progress:state.total,total:state.total});
 state.stageReady=state.lessonStageIndex<2;state.solved=!state.stageReady;state.phase=state.stageReady?'stage-ready':'complete';
 state.message=state.level===4?'到对岸啦！选哪条路线都算完成':state.solved?'找到小兔啦！你自己选路走到了这里':'走到营地啦，准备好后继续探索';
}
export function pressRoute(state,raw){
 const key=raw===' '||raw==='Space'?'Space':raw==='Backspace'?'Backspace':typeof raw==='string'&&/^[a-z]$/i.test(raw)?raw.toUpperCase():null;
 const result=status=>({status,key,message:state.message,inputKind:key==='Backspace'?'correction':state.level===5?'code':state.route?'letter':'choice',pendingKey:null});
 if(!key||state.paused||state.stageReady||state.solved||state.action)return result('ignored');
 if(key==='Backspace'){
  if(!state.codeBuffer)return result('ignored');
  state.codeBuffer=state.codeBuffer.slice(0,-1);state.accepted.push(key);state.wrongKey=null;refreshRoute(state);return result('accepted');
 }
 const typed=state.codeBuffer+key,choices=state.choices.filter(c=>c.code.startsWith(typed));
 if(!choices.length){state.wrongKey=key;state.wrongUntil=state.time+1.3;state.message='这个字母与当前路牌不符，已输入的部分保留';return result('wrong');}
 state.accepted.push(key);state.wrongKey=null;state.wrongUntil=0;state.codeBuffer=typed;
 const choice=choices.find(c=>c.code===typed);
 if(choice){
  state.codeBuffer='';
  if(state.level===4&&!state.route){state.route=choice.id;state.message=`已选${choice.label}；输入第一块石头的完整字母串`;refreshRoute(state);return result('accepted');}
  state.action=state.level===4?{type:'jump',key,from:state.routeStone,to:state.routeStone+1,route:state.route,leg:state.routeLeg,duration:.65,elapsed:0}:{type:'walk',key:choice.key,from:state.nodeId,to:choice.nodeTo,duration:.85,elapsed:0};
  state.phase='acting';state.message=state.level===4?'这组字母收到了，小熊正在跳':'沿着你选的小路出发';
 }else state.message=`已输入 ${typed}，继续把短码打完整`;
 refreshRoute(state);return result('accepted');
}
export function tickRoute(state,dt){
 if(state.paused||!Number.isFinite(dt)||dt<=0)return state;
 state.time+=dt;
 if(state.wrongKey&&state.time>=state.wrongUntil)state.wrongKey=null;
 if(state.action){
  state.action.elapsed=Math.min(state.action.duration,state.action.elapsed+dt);
  if(state.action.elapsed>=state.action.duration){
   const action=state.action;state.action=null;state.phase='playing';
   if(state.level===4){
    state.routeStone++;
    if(state.routeStone===riverLeg(state).codes.length){
     if(state.route==='hag'&&!state.discoveries.includes('水边小鸭'))state.discoveries.push('水边小鸭');
     state.routeLeg++;state.progress=state.step=state.routeLeg;state.routeStone=0;state.route=null;
     state.nodeId=state.routeLeg===1?'river-island':'river-end';
     state.message='到中途小岛啦！按 A 走大石头路，按 H 走捷径，可以换路';
     if(state.routeLeg===2)finish(state);
    }else state.message='站稳啦，接着输入下一块石头的字母串';
   }else{
    state.nodeId=action.to;
    const edge=edgeId(action.from,action.to);if(!state.visitedEdges.includes(edge))state.visitedEdges.push(edge);
    if(!state.traversedNodes.includes(action.to))state.traversedNodes.push(action.to);
    const node=forestGraph(state).nodes[action.to];
    state.message=`${node.label} · 继续探索或回头`;
    const discovery=action.to.endsWith('d1')?'找回朋友的围巾':action.to.endsWith('n2')?'松鼠提示：穿过汇合路口就到营地':null;
    if(discovery&&!state.discoveries.includes(discovery)){state.discoveries.push(discovery);state.message=discovery;}
    if(action.to===forestGraph(state).goal)finish(state);
   }
  }
 }
 refreshRoute(state);return state;
}
export function advanceRoute(state){
 if(!state.stageReady||state.action||state.lessonStageIndex>=2)return false;
 const next=createRoute(state.level,state.lessonStageIndex+1,state.seed);
 Object.assign(next,{accepted:[...state.accepted],stageStartAccepted:state.accepted.length,stageHistory:copy(state.stageHistory),startStageIndex:state.startStageIndex,paused:state.paused,time:state.time});
 Object.assign(state,next);return true;
}
export function snapshotRoute(state){
 return{version:4,state:{...Classic.snapshot(state).state,routeAdventure:1}};
}
// Rebuild only from accepted physical inputs. Derived paths and counters are never trusted from disk.
export function plain(value,depth=0){
 if(depth>12)return false;
 if(value===null||['string','boolean'].includes(typeof value))return true;
 if(typeof value==='number')return Number.isFinite(value);
 if(!value||typeof value!=='object'||(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value))))return false;
 if(Array.isArray(value)&&value.length>20000)return false;
 return Reflect.ownKeys(value).every(key=>{if(typeof key!=='string'||['__proto__','constructor','prototype'].includes(key))return false;const descriptor=Object.getOwnPropertyDescriptor(value,key);return Object.hasOwn(descriptor,'value')&&plain(descriptor.value,depth+1);});
}
export function restoreRoute(value){
 try{
  if(typeof value==='string')value=JSON.parse(value);
  if(!plain(value)||!value||Object.getPrototypeOf(value)!==Object.prototype)return null;
  const raw=value.state;if(!raw||Object.getPrototypeOf(raw)!==Object.prototype)return null;
  const allowed=new Set([...Object.keys(Classic.snapshot(Classic.create(4,0,1)).state),'routeAdventure']);
  for(const k of Reflect.ownKeys(raw)){const d=Object.getOwnPropertyDescriptor(raw,k);if(!allowed.has(k)||!Object.hasOwn(d,'value'))return null;}
  if(value.version!==4||raw.version!==4||raw.routeAdventure!==1||![4,5].includes(raw.level))return null;
  if(!Number.isInteger(raw.seed)||raw.seed<0||raw.seed>0xffffffff||![0,1,2].includes(raw.lessonStageIndex)||!Number.isInteger(raw.startStageIndex)||raw.startStageIndex<0||raw.startStageIndex>raw.lessonStageIndex)return null;
  if(!Array.isArray(raw.accepted)||raw.accepted.length>20000||raw.accepted.some(k=>typeof k!=='string'||!/^([A-Z]|Backspace)$/.test(k)))return null;
  if(typeof raw.paused!=='boolean'||!Number.isFinite(raw.time)||raw.time<0||!Number.isFinite(raw.wrongUntil)||raw.wrongUntil<0||!(raw.wrongKey===null||typeof raw.wrongKey==='string'&&/^([A-Z]|Space|Backspace)$/.test(raw.wrongKey))||typeof raw.message!=='string'||raw.message.length>500)return null;
  const state=createRoute(raw.level,raw.startStageIndex,raw.seed);
  for(let i=0;i<raw.accepted.length;i++){
   if(state.stageReady&&!advanceRoute(state))return null;
   if(pressRoute(state,raw.accepted[i]).status!=='accepted')return null;
   if(state.action&&(i<raw.accepted.length-1||!raw.action))tickRoute(state,state.action.duration);
  }
  if(state.lessonStageIndex<raw.lessonStageIndex&&state.stageReady)advanceRoute(state);
  if(state.lessonStageIndex!==raw.lessonStageIndex||state.stageStartAccepted!==raw.stageStartAccepted||JSON.stringify(state.stageHistory)!==JSON.stringify(raw.stageHistory))return null;
  if(Boolean(state.action)!==Boolean(raw.action))return null;
  if(raw.action){const {elapsed,...rest}=raw.action,{elapsed:unused,...expected}=state.action;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=state.action.duration||JSON.stringify(rest)!==JSON.stringify(expected))return null;state.action.elapsed=elapsed;}
  Object.assign(state,{paused:raw.paused,time:raw.time,wrongKey:raw.wrongKey,wrongUntil:raw.wrongUntil,message:raw.message});refreshRoute(state);const expected=snapshotRoute(state).state;for(const key of Object.keys(expected))if(JSON.stringify(expected[key])!==JSON.stringify(raw[key]))return null;return state;
 }catch{return null;}
}
