/** Seeded v4 curriculum. Geometry IDs are intentionally independent from input codes. */
export const POOLS = ['FJDK','FJDKSL','FJDKSLAG','FJDKSLAGH','FJDKSLAGHEIRU','FJDKSLAGHEIRUTYQ','FJDKSLAGHEIRUTYQWOP','FJDKSLAGHEIRUTYQWOPVMBN','ABCDEFGHIJKLMNOPQRSTUVWXYZ','ABCDEFGHIJKLMNOPQRSTUVWXYZ','ABCDEFGHIJKLMNOPQRSTUVWXYZ','ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
// L5 and L6 have 13 and 16 letters respectively (the displayed ordering is cumulative).
export const NEW_KEYS = ['FJDK','SL','AG','H','EIRU','TYQ','WOP','VMBN','CXZ',['Backspace'],['Space'],[]].map(x=>Array.isArray(x)?x:[...x]);
export const STAGE_NAMES = ['熟悉新键','混合练习','独立挑战'];
const LABELS = Object.fromEntries([...'FJDKSL'].map(key=>[key,`${key} 水果`]));
const copy=x=>JSON.parse(JSON.stringify(x));
export function normalizeSeed(value) {
  const candidate=typeof value==='object'&&value!==null?value.seed:value;
  if(candidate!==undefined){if(!Number.isInteger(candidate)||candidate<0||candidate>0xffffffff)throw new RangeError('Seed must be an unsigned 32-bit integer.');return candidate>>>0;}
  return Math.floor(Math.random()*0x100000000)>>>0;
}
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
export function shuffled(values,seed){const a=[...values],random=rng(seed);for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
// Given the prior groups abc / def, each new group takes members from both.
// This guarantees new compositions for every possible seed/shuffle permutation.
export const remixOrderGroups = keys => [[keys[0],keys[3],keys[4]],[keys[1],keys[2],keys[5]]];
function mixed(pool,length,seed){let out='';for(let i=0;out.length<length;i++)out+=shuffled(pool,seed+i*7919).join('');return out.slice(0,length);}
function segments(text,max){const result=[];for(let i=0;i<text.length;i+=max)result.push(text.slice(i,i+max));return result;}
function splitCodes(pool,count,seed){const text=shuffled(pool,seed).join('');let offset=0;return Array.from({length:count},(_,i)=>{const length=Math.max(2,Math.ceil((text.length-offset)/(count-i)));let code=text.slice(offset,offset+length);offset+=length;while(code.length<2)code+=pool[(i+code.length)%pool.length];return code;});}
function alternative(code,pool){const first=[...pool].find(c=>c!==code[0]);return first+code.slice(1);}
function distinctFirst(codes,pool){const used=new Set();return codes.map(code=>{let found=code;for(let i=0;i<code.length&&used.has(found[0]);i++)found=found.slice(1)+found[0];if(used.has(found[0])){const head=[...pool].find(c=>!used.has(c));found=head+found.slice(0,3);}used.add(found[0]);return found;});}
const CARDS9=[['c','x','z','cat','box','zip'],['duck','fish','jump','queen'],['frog','milk','wave','nest','toy']];
const CARDS10=[['cat','dog','box'],['fish','jump','quick','owl'],['zebra','wave','milk','nest','play','red','quiz']];
const INVITES=[
 ['join us for a picnic','bring cake and juice','we can play by the big oak'],
 ['come to our picnic','pack fruit and fresh juice','we can jump and play games'],
 ['join us at the park','bring a box of fresh fruit','we can have milk and play']
];
const ACTIVITIES=[
 [['hello rabbit','hello bear','hello deer'],['we can jump and play','we can build a big tower','we can fly a red kite'],['share cake and fresh juice','share fruit and warm milk','share jam and a crisp pear']],
 [['hi rabbit join our game','hi bear come and play','hi deer sit by our picnic'],['let us kick the blue ball','let us make a tall tower','let us fly the bright kite'],['pass the sweet apple juice','share a bowl of fresh fruit','pass the milk and jam cake']]
];
export function applyChallenge(state){
 const n=state.lessonStageIndex,l=state.level,pool=POOLS[l-1],seed=(state.seed+l*65537+n*8191)>>>0;
 state.stageTitle=STAGE_NAMES[n];state.stageKind=['familiarization','mix','independent'][n];state.letterPool=[...pool];state.codeBuffer='';state.codeStartAccepted=0;state.pendingCode=null;
 state.stageDescription=['先看清新键，再把它们和熟悉的键一起用','换一个顺序，读清目标再动手','自己观察完整目标，完成这一轮'][n];
 if(l<=2){
   state.fruitKeys=[...pool];state.keyPool=[...pool];state.balanced=false;state.orders=[];state.catchStyle=n<2?'chunk':'orders';
   if(n<2){const length=l===1?[8,12][n]:[12,16][n];const seq=mixed(pool,length,seed);state.tasks=[...seq].map((key,i)=>({id:`fruit-${i+1}`,key,label:LABELS[key]}));}
   else {const groups=l===1?[[...pool.slice(0,2)],[...pool.slice(2)]]:[[...pool.slice(0,3)],[...pool.slice(3)]];state.orders=groups.map((keys,i)=>({id:i?'bear':'rabbit',key:i?'J':'F',label:i?'小熊篮':'小兔篮',needs:Object.fromEntries(keys.map((key,j)=>[key,(j+(seed%2))%2+1]))}));state.tasks=state.orders.flatMap(order=>Object.entries(order.needs).flatMap(([key,count])=>Array.from({length:count},(_,i)=>({id:`${order.id}-${key}-${i+1}`,orderId:order.id,key,label:LABELS[key]}))));}
   if(l===2){
     state.catchStyle='orders';state.chooseOrders=n>0;
     const keys=shuffled(pool,(state.seed+l*65537+8191)>>>0),groups=n===0?[['S','L',pool[seed%4]]]:n===1?[keys.slice(0,3),keys.slice(3)]:remixOrderGroups(keys);
     state.orders=groups.map((group,i)=>({id:n===0?'picnic':i?'bear':'rabbit',key:i?'J':'F',label:n===0?'先买新水果':n===1?i?'小熊的采购篮':'小兔的采购篮':i?'分享组合篮':'游戏组合篮',needs:Object.fromEntries(group.map((key,j)=>[key,n===0?(j===0?2:1):j===(n+i)%3?2:1]))}));
     state.tasks=state.orders.flatMap(order=>Object.entries(order.needs).flatMap(([key,count])=>Array.from({length:count},(_,i)=>({id:`${order.id}-${key}-${i+1}`,orderId:order.id,key,label:LABELS[key]}))));
     state.stageDescription=['先读一张小采购单，买齐三种水果','两位朋友要不同水果，自己决定先装哪一篮','看清分享和游戏的不同组合，装齐两份'][n];
   }
   state.total=state.tasks.length;
 }
 if(l===3){const length=[8,16,24][n],max=[2,4,4][n];state.tasks=segments(mixed(pool,length,seed),max).map((sequence,i)=>({id:`river-${i+1}`,sequence,label:sequence.toLowerCase()}));state.total=length;}
 if(l===4){const length=[12,18,24][n],max=[3,3,4][n];state.tasks=['A','H'].map((key,i)=>{let sequence=mixed(pool,length,seed+i*313);const at=sequence.indexOf(key);sequence=key+sequence.slice(0,at)+sequence.slice(at+1);const segmentSequences=segments(sequence,max);return{id:i?'hag':'agh',key,sequence,segmentSequences,label:segmentSequences.join(' · ').toLowerCase()};});state.total=length;}
 if(l===5){const codes=splitCodes(pool,4,seed);state.tasks.forEach((task,i)=>task.branches.forEach(branch=>{branch.code=branch.key===task.correct?codes[i]:alternative(codes[i],pool);}));}
 if(l===6){const routePool=n===0?pool.slice(0,10):n===1?pool.slice(10)+pool.slice(0,4):shuffled(pool,seed).slice(0,10).join('');const codes=splitCodes(routePool,3,seed);const selects=distinctFirst([codes[0],codes[0].slice(1)+codes[0][0]],pool);state.tasks.forEach((task,i)=>{task.code=selects[i];task.forks.forEach((fork,j)=>fork.branches.forEach(branch=>branch.code=branch.key===fork.correct?codes[j+1]:alternative(codes[j+1],pool)));});}
 if(l===7||l===8){
   const needed=l===7?[['Q','O'],['F','D'],['Q','F']][n]:[['F','D','V','B'],['F','D','V','B'],['D','V']][n];
   const routePool=l===7?(n===0?pool.slice(0,13):n===1?pool.slice(13)+pool.slice(0,6):shuffled(pool,seed).slice(0,13).join('')):(n<2?pool:shuffled(pool,seed).slice(0,16).join(''));
   const codes=splitCodes(routePool,needed.length*2,seed),pickCodes=distinctFirst(needed.map((_,i)=>codes[i*2]),pool);
   state.items.forEach((item,index)=>{const at=needed.indexOf(item.key);item.code=at<0?mixed(pool,3,seed+index*73):pickCodes[at];});
   // Resolve optional/settled item prefixes without touching the necessary route codes.
   const used=new Set(needed.map(key=>state.items.find(i=>i.key===key).code[0]));
   state.items.filter(i=>!needed.includes(i.key)).forEach(item=>{const first=[...pool].find(k=>!used.has(k));item.code=first+item.code.slice(1);used.add(first);});
   state.zones.forEach(zone=>{zone.codesByItem={};state.items.forEach(item=>{const at=needed.indexOf(item.key),right=at<0?mixed(pool,3,seed+item.key.charCodeAt(0)):codes[at*2+1];zone.codesByItem[item.key]=zone.key===item.goalZone?right:alternative(right,pool);});zone.code=zone.codesByItem[state.items[0].key];});
   state.tasks=state.items.map(item=>({id:item.key,...item}));
 }
 if(l===9||l===10){let words=copy((l===9?CARDS9:CARDS10)[n]);if(n)words=shuffled(words,seed);if(l===10&&n)words.push('cat');state.tasks=words.map((target,i)=>({id:`s${n}-word-${i}-${target}`,target,prefix:'',initial:l===10?(i===words.length-1?target+'x':i%2?target.slice(0,1)+target.at(-1)+'x':target.slice(0,1)+'x'):''}));state.total=state.tasks.length;state.stageDescription=l===9?['先写 C、X、Z，再写三个完整短词','把四个熟悉的词完整写出来','自己看目标，写好五张词语卡'][n]:['对照完整词，改错字或删掉多余字','有的词尾写错，有的多印了字母','自己检查每张词语卡，保留对的部分并修好词尾'][n];}
 if(l===11){const variant=state.seed%INVITES.length;state.invitationParts=INVITES[variant].map((text,i)=>({title:['邀请大家','带上食物','一起玩耍'][i],text}));state.tasks[0].text=state.invitationParts[n].text;}
 if(l===12){const texts=ACTIVITIES[state.seed%ACTIVITIES.length][n];state.friends.forEach((friend,i)=>friend.text=texts[i]);state.tasks=copy(state.friends);}
 state.challenge={version:4,seed:state.seed,stageKind:state.stageKind,levelPool:[...pool],newKeys:NEW_KEYS[l-1],minimumCodeLength:state.mode==='forest'||state.mode==='room'?2:0};
}
export function decorateCodes(state){
 if(state.version!==4)return;
 if(state.mode==='forest'){
  state.choices.forEach(choice=>{const source=choice.kind==='destination'?state.tasks.find(t=>t.key===choice.key):state.task?.branches.find(b=>b.key===choice.key);choice.code=source?.code||choice.key;});
 }
 if(state.mode==='room'){
  const item=state.held||state.selected||state.items[0]?.key;
  state.zones.forEach(zone=>zone.code=zone.codesByItem?.[item]||zone.key);
  state.choices.forEach(choice=>{const source=choice.kind==='item'?state.items.find(i=>i.key===choice.key):state.zones.find(z=>z.key===choice.key);choice.code=source?.code||choice.key;});
 }
 const candidates=codeChoices(state);
 state.choices.forEach(choice=>{const active=candidates.some(c=>c.key===choice.key&&c.code===choice.code);choice.codeCursor=active&&choice.code?.startsWith(state.codeBuffer)?state.codeBuffer.length:0;choice.codeTyped=choice.code?.slice(0,choice.codeCursor)||'';});
 state.codeInput={buffer:state.codeBuffer,candidates:candidates.map(({key,code,label,kind})=>({key,code,label,kind})),cursor:state.codeBuffer.length,pending:state.pendingCode};
}
export function codeChoices(state){
 if(!['forest','room'].includes(state.mode)||state.stageReady||state.paused)return[];
 if(state.action&&!(state.mode==='room'&&state.action.type==='pick'))return[];
 return state.choices.filter(choice=>state.mode==='room'?(state.action?.type==='pick'||state.stage==='place'?choice.kind==='zone':choice.kind==='item'):!choice.done);
}
export function fullStageRequiredKeys(state){
 const chars=text=>[...text.toUpperCase()].map(c=>c===' '?'Space':c),unique=x=>[...new Set(x)];
 if(state.mode==='forest')return unique(state.tasks.flatMap(task=>[...chars(task.code||''),...(task.branches||[]).flatMap(b=>chars(b.code||'')),...(task.forks||[]).flatMap(f=>f.branches.flatMap(b=>chars(b.code||'')))]));
 if(state.mode==='room')return unique([...state.items.flatMap(i=>chars(i.code)),...state.zones.flatMap(z=>Object.values(z.codesByItem).flatMap(chars))]);
 if(state.mode==='card')return unique([...state.tasks.flatMap(t=>chars(t.target)),...(state.level===10?['Backspace']:[])]);
 if(state.level===11)return unique([...chars(state.invitationParts[state.lessonStageIndex].text),'Backspace']);
 if(state.level===12)return unique([...state.friends.flatMap(f=>[f.key,...chars(f.text)]),'Backspace']);
 return [...state.letterPool];
}

/** Prepare only the currently visible task, rather than an entire level's alphabet. */
export function stageRequiredKeys(state){
 const chars=text=>[...text.toUpperCase()].map(c=>c===' '?'Space':c),unique=x=>[...new Set(x)];
 if(state.mode==='forest'||state.mode==='room')return unique(codeChoices(state).flatMap(c=>chars(c.code)));
 if(state.mode==='card')return unique([...chars(state.task?.target||state.targetText),...(state.level===10?['Backspace']:[])]);
 if(state.mode==='mail'){
   if(state.stage==='select'||state.stage==='travel')return state.friends.map(f=>f.key);
   if(!state.targetText.startsWith(state.buffer))return ['Backspace'];
   const start=state.buffer.length,end=state.targetText.indexOf(' ',start),part=state.targetText.slice(start,end<0?undefined:end+1);
   return unique([...chars(part),'Backspace']);
 }
 if(state.mode==='catch')return unique(state.catchStyle==='chunk'?state.tasks.slice(state.visibleStart,state.visibleEnd).map(t=>t.key):state.choices.filter(c=>!c.done).map(c=>c.key));
 if(state.mode==='stone')return unique(state.level===4&&!state.route?state.tasks.flatMap(t=>chars(t.segmentSequences[0])):chars(state.level===3?state.tasks[state.segment]?.sequence||'':state.tasks.find(t=>t.id===state.route)?.segmentSequences[state.segment]||''));
 return [...state.letterPool];
}
