import {taskGuide} from '../dist/challenge-test/task-guide.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as engineAPI from '../dist/challenge-test/engine.js';
// Keep the v3 controller regression fixtures; v4 has a dedicated suite.
const currentEngine={...engineAPI,create:engineAPI.createV3};
const engine={...currentEngine,create:currentEngine.createLegacy};
import * as store from '../dist/challenge-test/store.js';
import {getFinger} from '../dist/curriculum.js';

const read=name=>fs.readFileSync(new URL(`../dist/challenge-test/${name}`,import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const mastered=[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ','Space','Backspace'];
const progress=(sessions={},extra={})=>({...store.blank(),practiced:[...mastered],sessions,...extra});
const eventKey=token=>({key:token==='Space'?' ':token.length>1?token:token.toLowerCase(),code:token.length===1?`Key${token}`:token});

// Execute the real controllers and engine with a tiny DOM, controlled frame
// clock and storage. Renderer factories alone are stubbed. These exercise
// handlers and persistence; they are not a substitute for native browser QA.
async function boot({modern=false,query='?level=1',data,entries={},page='play',unavailable=false,confirmResult=true,rendererFailure=false,pathname='/challenge-test/play.html',hash=''}={}){
 const nodes=new Map(),windowEvents=new Map(),documentEvents=new Map(),writes=[],prompts=[],alerts=[],rendered=[],historyCalls=[],recordedKeys=[];
 const values=new Map(Object.entries(entries));if(data)values.set(store.STORAGE_KEY,JSON.stringify(data));
 let now=0,frame,reloads=0,writeFailure=false;
 const document={hidden:false,activeElement:null,getElementById:id=>nodes.get(id),createElement:tag=>element(tag),addEventListener:(name,fn)=>documentEvents.set(name,fn)};
 function element(tag,id=''){
  const classes=new Set(),events=new Map();
  const node={tagName:tag.toUpperCase(),id,hidden:false,disabled:false,open:false,children:[],textContent:'',innerHTML:'',style:{},attributes:{},events,
   classList:{toggle(name,on){on??=!classes.has(name);on?classes.add(name):classes.delete(name);return on;},contains:name=>classes.has(name)},
   append(...children){this.children.push(...children);},setAttribute(name,value){this.attributes[name]=String(value);},getAttribute(name){return this.attributes[name]??null;},
   addEventListener:(name,fn)=>events.set(name,fn),focus(){document.activeElement=this;},
   showModal(){this.returnFocus=document.activeElement;this.open=true;},close(){this.open=false;document.activeElement=this.returnFocus;},click(event={detail:1}){if(!this.disabled){this.onclick?.(event);events.get('click')?.(event);}},querySelector(){return this.status;}};
  if(id)nodes.set(id,node);return node;
 }
 for(const [,tag,id]of read(`${page==='play'?'play':'index'}.html`).matchAll(/<([a-z][a-z0-9]*)\b[^>]*?\bid="([^"]+)"/gi))element(tag,id);
 document.body=element('body');
 const dialogs=[...nodes.values()].filter(node=>node.tagName==='DIALOG'),hintbar=element('footer');
 const stages=Array.from({length:12},()=>{const node=element('section');node.status=element('span');return node;}),counts=[element('strong'),element('strong')],tracks=[element('i'),element('i')],journey=element('section'),entry=element('section');
 document.querySelector=selector=>selector==='.hintbar'?hintbar:selector==='.journey-progress'?journey:selector==='.free-practice'?entry:selector.startsWith('#')?nodes.get(selector.slice(1)):null;
 document.querySelectorAll=selector=>selector==='dialog'?dialogs:selector==='.stage'?stages:selector==='.journey-progress strong'?counts:selector==='.progress-track i'?tracks:[];
 const localStorage={getItem(key){if(unavailable)throw Error('SecurityError');return values.get(key)??null;},setItem(key,value){if(unavailable||writeFailure)throw Error('SecurityError');values.set(key,value);writes.push({key,value:JSON.parse(value)});}};
 const location={search:query,pathname,hash,href:'',reload(){reloads++;}};
 const history={state:{source:'existing-history'},replaceState(state,title,url){historyCalls.push({state,title,url});this.state=state;const parsed=new URL(url,'https://typing.example');location.search=parsed.search;location.pathname=parsed.pathname;location.hash=parsed.hash;}};
 const world={update(state,dt){rendered.push({state:engine.snapshot(state),dt});}};
 const worldModules=Object.fromEntries(['Orchard','River','Forest','Pairing','Invitation'].map(name=>[`create${name}World`,()=>{if(rendererFailure)throw Error('WebGL unavailable');return world;}]));
 const context=vm.createContext({taskGuide,...engine,create:modern?currentEngine.create:engine.create,getFinger,STORAGE_KEY:store.STORAGE_KEY,load:()=>store.load(localStorage),save:data=>store.save(data,localStorage),blank:store.blank,recordKeys:(data,keys)=>{recordedKeys.push([...keys]);return store.recordKeys(data,keys);},hasConflict:data=>store.hasConflict(data,localStorage),document,
  window:{localStorage,addEventListener:(name,fn)=>windowEvents.set(name,fn)},localStorage,location,history,navigator:{},URLSearchParams,performance:{now:()=>now},
  requestAnimationFrame:fn=>{frame=fn;},worldModules,createWorld:()=>world,confirm:message=>{prompts.push(message);return confirmResult;},alert:message=>alerts.push(message),console:{error(){}}});
 const source=read(`${page}.js`).replace(/^import[^\n]+\n/gm,'').replace('const mod=await import(path);','const mod=await Promise.resolve(worldModules);');
 vm.runInContext(source,context);await Promise.resolve();await Promise.resolve();
 const event=(name,options={})=>{const e={...options,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};windowEvents.get(name)?.(e);return e;};
 const keydown=(token,options={})=>event('keydown',{...eventKey(token),...options});
 const keyup=token=>event('keyup',eventKey(token));
 return {nodes,dialogs,stages,entry,counts,tracks,journey,values,writes,prompts,alerts,rendered,document,localStorage,location,history,historyCalls,recordedKeys,event,keydown,keyup,
  tap(token,options={}){const e=keydown(token,options);keyup(token);return e;},
  state:()=>engine.snapshot(vm.runInContext('state',context)).state,
  practiced:()=>plain(vm.runInContext('data.practiced',context)),read:expression=>vm.runInContext(expression,context),
  advance(seconds,step=.1){const end=now+seconds*1000;while(now+1e-6<end){now=Math.min(end,now+step*1000);frame?.(now);}},
  click:(id,event)=>nodes.get(id).click(event),focus:tag=>{document.activeElement=element(tag);},focusId:id=>nodes.get(id).focus(),
  nativeDown(token,options={}){const e=keydown(token,options);if(!e.defaultPrevented&&token==='Enter'&&document.activeElement?.tagName==='BUTTON')document.activeElement.click({detail:0});return e;},
  nativeUp(token){const e=keyup(token);if(!e.defaultPrevented&&token==='Space'&&document.activeElement?.tagName==='BUTTON')document.activeElement.click({detail:0});return e;},
  cancel(id){const e={preventDefault(){}};nodes.get(id).events.get('cancel')?.(e);},
  visibility(hidden){document.hidden=hidden;documentEvents.get('visibilitychange')?.();},
  remote(data,key=store.STORAGE_KEY){if(data===null)values.delete(key);else values.set(key,JSON.stringify(data));},
  reloads:()=>reloads,failWrites:()=>{writeFailure=true;},allowWrites:()=>{writeFailure=false;},
 };
}

function nextInput(state){
 if(state.target)return state.target;
 if(state.mode==='forest'&&state.task?.correct)return state.task.correct;
 if(state.mode==='room'){
  if(state.stage==='pick')return state.items.find(item=>item.goalZone?state.placements[item.key]!==item.goalZone:!state.placements[item.key])?.key;
  const item=state.items.find(item=>item.key===state.held);
  return item?.goalZone||state.zones.find(zone=>Object.values(state.placements).filter(key=>key===zone.key).length<zone.capacity)?.key;
 }
 return state.choices.find(choice=>!choice.done&&!choice.disabled)?.key;
}
function solvedLevel(level){
 const state=engine.create(level);
 for(let steps=0;!state.solved&&steps<500;steps++){
  if(state.stageReady){assert.equal(engine.advanceStage(state),true);continue;}
  const input=nextInput(state);assert.ok(input,`level ${level} exposes next action`);assert.equal(engine.press(state,input).status,'accepted',`level ${level}: ${input}`);engine.tick(state,15);
 }
 assert.equal(state.solved,true,`level ${level} reaches final completion`);return state;
}
function finishAnyLevel(page){
 for(let steps=0;!page.state().solved&&steps<500;steps++){
  if(page.state().stageReady){page.click('continue-stage');continue;}
  const input=nextInput(plain(page.read('state')));assert.ok(input);page.tap(input);page.advance(6);
 }
 assert.equal(page.state().solved,true);
}
function legacySnapshot(state){
 const saved=engine.snapshot(state);saved.version=1;saved.state.version=1;
 for(const key of ['lessonStageIndex','stageReady','stageHistory','stageStartAccepted','legacyCompleted','migrationNotice','initialPlacements','forkIndex'])delete saved.state[key];
 return saved;
}

function finishFruitStage(page){
 for(let presses=0;!page.state().stageReady&&!page.state().solved&&presses<100;presses++){
  const key=page.read('state.target || state.choices.find(choice=>!choice.done)?.key');
  assert.ok(key,'fruit stage must expose a target or remaining basket choice');page.tap(key);page.advance(3);
 }
 assert.ok(page.state().stageReady||page.state().solved);
}
function finishFruitLevel(page){
 while(!page.state().solved){finishFruitStage(page);if(page.state().stageReady)page.click('continue-stage');}
}

for(const token of ['Space','Backspace'])test(`${token} warmup captures focused links/buttons and rejects repeat, IME and modifier combos`,async()=>{
 const page=await boot({query:`?practice=${token}`});assert.equal(page.nodes.get('warmup').open,true);
 for(const tag of ['a','button']){
  page.focus(tag);const before=page.read('practiceCount');assert.equal(page.keydown(token).defaultPrevented,true);assert.equal(page.read('practiceCount'),before+1);
  assert.equal(page.keydown(token,{repeat:true}).defaultPrevented,true);assert.equal(page.keydown(token).defaultPrevented,true);assert.equal(page.read('practiceCount'),before+1);page.keyup(token);
 }
 for(const options of [{ctrlKey:true},{metaKey:true},{altKey:true},{isComposing:true},{keyCode:229}]){const before=page.read('practiceCount');page.tap(token,options);assert.equal(page.read('practiceCount'),before);}
 page.event('compositionstart');const before=page.read('practiceCount');page.tap(token);assert.equal(page.read('practiceCount'),before);page.event('compositionend');page.tap(token);assert.equal(page.read('practiceCount'),before+1);
 assert.deepEqual(page.practiced(),[token]);assert.deepEqual(store.load(page.localStorage).sessions,{});assert.equal(store.load(page.localStorage).lastLevel,null);
});

test('Space still activates ordinary controls outside warmup without gameplay credit',async()=>{
 const page=await boot({data:progress()});page.focus('button');assert.equal(page.tap('Space').defaultPrevented,false);assert.deepEqual(page.state().accepted,[]);
});

for(const [open,close,dialog]of [['help','close-help','finger-dialog'],['pause','resume','paused']]){
 for(const dismissal of ['click','Escape','Space','Enter'])test(`${open} ${dismissal} dismissal restores typing focus and accepts the next word separator`,async()=>{
  const page=await boot({query:'?level=11',data:progress()});page.click('intro-next');for(const key of 'JOIN')page.tap(key);
  assert.equal(page.state().buffer,'join');page.focusId(open);page.click(open);assert.equal(page.nodes.get(dialog).open,true);
  if(dismissal==='Escape')page.cancel(dialog);
  else{page.focusId(close);if(dismissal==='click')page.click(close);else{page.nativeDown(dismissal);page.nativeUp(dismissal);}}
  assert.equal(page.nodes.get(dialog).open,false);assert.equal(page.document.activeElement.id,'world');assert.equal(page.nodes.get('world').attributes.tabindex,'-1');
  assert.equal(page.state().paused,false);assert.equal(page.state().buffer,'join','closing a dialog must not type a residual separator');
  assert.equal(page.nativeDown('Space').defaultPrevented,true);page.nativeUp('Space');assert.equal(page.state().buffer,'join ');assert.equal(page.nodes.get(dialog).open,false);
  assert.equal(page.tap('Tab').defaultPrevented,false);page.focusId(open);assert.equal(page.nativeDown('Space').defaultPrevented,false);page.nativeUp('Space');assert.equal(page.nodes.get(dialog).open,true,'deliberately focusing a control still enables browser-standard Space activation');
 });
 for(const token of ['Space','Enter'])test(`${open} dismissal blocks a held ${token} until release without leaving stale input`,async()=>{
  const page=await boot({query:'?level=11',data:progress()});page.click('intro-next');for(const key of 'JOIN')page.tap(key);
  page.focusId(open);page.click(open);page.focusId(close);page.keydown(token);page.click(close);
  assert.equal(page.document.activeElement.id,'world');assert.equal(page.keydown(token).defaultPrevented,true);assert.equal(page.keydown(token,{repeat:true}).defaultPrevented,true);assert.equal(page.state().buffer,'join');
  assert.equal(page.nativeUp(token).defaultPrevented,true);assert.equal(page.state().buffer,'join');page.tap('Space');assert.equal(page.state().buffer,'join ');
 });
}

test('a lost activation keyup on window blur cannot latch the modal-release guard',async()=>{
 const page=await boot({query:'?level=11',data:progress()});page.click('intro-next');for(const key of 'JOIN')page.tap(key);
 page.focusId('help');page.click('help');page.focusId('close-help');page.nativeDown('Enter');page.event('blur');assert.equal(page.nodes.get('paused').open,true);page.click('resume');
 page.tap('Space');assert.equal(page.state().buffer,'join ');assert.equal(page.tap('Enter').defaultPrevented,false);
});

for(const practice of ['OP','Backspace'])test(`${practice} warmup diagrams show semicolon as a home-position reference, never a practice requirement`,async()=>{
 const page=await boot({query:`?practice=${practice}`});if(practice==='OP')page.tap('O');
 const rows=page.nodes.get('keyboard').children.slice(-4),homeRow=rows[1].children;
 assert.equal(homeRow.map(key=>key.textContent).join(''),'ASDFGHJKL;');const semicolon=homeRow.at(-1);
 assert.match(semicolon.className,/\bhome\b/);assert.match(semicolon.attributes['aria-label'],/右手小指/);assert.match(page.nodes.get('warmup-return').textContent,/;/);
 assert.ok(!page.read('warmKeys').includes(';'));page.tap(';',{key:';',code:'Semicolon'});assert.equal(page.read('practiceCount'),practice==='OP'?1:0);assert.ok(!page.practiced().includes(';'));
});

test('warmup blocks ticking and passive saves, credits only actual correct presses, and persists partial warmup',async()=>{
 const page=await boot();page.click('intro-next');assert.equal(page.nodes.get('warmup').open,true);
 page.tap('J');assert.deepEqual(page.practiced(),[]);page.tap('F');assert.deepEqual(page.practiced(),['F']);const state=page.state(),writes=page.writes.length;
 page.advance(3);assert.deepEqual(page.state(),state);assert.equal(page.writes.length,writes);
 const refreshed=await boot({entries:Object.fromEntries(page.values)});refreshed.click('intro-next');assert.equal(refreshed.nodes.get('warmup-key').textContent,'J');refreshed.tap('J');assert.equal(refreshed.nodes.get('warmup').open,false);assert.deepEqual(refreshed.state().accepted,[]);
});

test('held gameplay keys never double-credit and paused queued movement survives refresh exactly',async()=>{
 const page=await boot({query:'?level=3',data:progress()});page.click('intro-next');page.keydown('S');page.keydown('S',{repeat:true});page.keydown('S');page.keyup('S');page.tap('L');page.advance(.2);
 assert.deepEqual(page.state().accepted,['S','L']);page.click('pause');const pending=page.state();assert.ok(pending.action.elapsed>0);assert.equal(pending.paused,true);
 page.advance(4);assert.deepEqual(page.state(),pending);page.event('pagehide');
 const refreshed=await boot({query:'?level=3',entries:Object.fromEntries(page.values)});const resumed=refreshed.state();assert.deepEqual(resumed.action,pending.action);assert.deepEqual(resumed.queue,pending.queue);assert.equal(refreshed.nodes.get('intro').open,true);
 refreshed.advance(2);assert.deepEqual(refreshed.state().action,pending.action);refreshed.click('intro-next');refreshed.advance(2);assert.equal(refreshed.state().index,2);assert.deepEqual(refreshed.state().accepted,['S','L']);
});

test('blur/hidden pause actions, require resume and do not retain a held key',async()=>{
 const page=await boot({data:progress()});page.click('intro-next');page.keydown('F');page.advance(.2);page.event('blur');assert.equal(page.nodes.get('paused').open,true);const state=page.state();page.advance(2);assert.deepEqual(page.state(),state);
 page.cancel('paused');assert.equal(page.state().paused,false);page.advance(2);page.tap('J');assert.deepEqual(page.state().accepted,['F','J']);page.visibility(true);assert.equal(page.state().paused,true);
});

test('storage conflict locks all resume/restart routes and prevents warmup/pagehide overwrite',async()=>{
 const page=await boot({query:'?practice=Space'});page.tap('Space');const remote=progress({}, {practiced:['Z'],completed:[12]});page.remote(remote);page.event('storage',{key:store.STORAGE_KEY,storageArea:page.localStorage});
 const writes=page.writes.length;assert.equal(page.nodes.get('warmup').open,false);assert.equal(page.nodes.get('paused').open,true);assert.equal(page.nodes.get('resume').disabled,true);assert.equal(page.nodes.get('restart').disabled,true);
 page.cancel('paused');page.click('resume');page.click('restart');page.tap('Space');page.event('pagehide');page.advance(3);assert.equal(page.writes.length,writes);assert.equal(page.nodes.get('paused').open,true);assert.equal(page.state().paused,true);assert.deepEqual(store.load(page.localStorage).practiced,['Z']);
});

test('compare-before-save catches conflicts before the browser storage event arrives',async()=>{
 const page=await boot({data:progress()});page.click('intro-next');const remote=progress({}, {completed:[12]});page.remote(remote);page.tap('F');assert.equal(page.nodes.get('paused').open,true);assert.equal(page.writes.length,0);page.event('pagehide');assert.deepEqual(store.load(page.localStorage).completed,[12]);
});

test('preview ignores unrelated/session storage events but locks for localStorage.clear',async()=>{
 const page=await boot({data:progress()});page.click('intro-next');page.event('storage',{key:'typing-island-progress-v1',storageArea:page.localStorage});assert.equal(page.nodes.get('paused').open,false);
 page.event('storage',{key:store.STORAGE_KEY,storageArea:{}});assert.equal(page.nodes.get('paused').open,false);page.remote(null);page.event('storage',{key:null,storageArea:page.localStorage});assert.equal(page.nodes.get('paused').open,true);page.event('pagehide');assert.equal(page.values.has(store.STORAGE_KEY),false);
});

test('invalid query and wrong-level snapshots cannot mismatch the title and engine',async()=>{
 for(const level of ['1.5','nope','Infinity']){const page=await boot({query:`?level=${level}`});assert.equal(page.state().level,1);assert.match(page.nodes.get('title').textContent,/第 1 关/);}
 const page=await boot({query:'?level=2',data:progress({2:engine.snapshot(engine.create(7))})});assert.equal(page.state().level,2);assert.equal(page.read('state.mode'),'catch');
});

test('completion is saved once; replay resets the round while retaining completion and practiced keys',async()=>{
 const page=await boot({data:progress()});page.click('intro-next');finishFruitLevel(page);
 assert.equal(page.nodes.get('finished').open,true);assert.equal(page.state().solved,true);assert.deepEqual(store.load(page.localStorage).completed,[1]);
 page.click('replay');assert.equal(page.nodes.get('intro').open,true);assert.equal(page.state().solved,false);assert.deepEqual(page.state().accepted,[]);assert.deepEqual(store.load(page.localStorage).completed,[1]);assert.deepEqual(page.practiced(),mastered);
});

test('explicit replay query starts fresh; ordinary saved-level routing resumes',async()=>{
 const state=engine.create(2);engine.press(state,'D');engine.tick(state,.2);const data=progress({2:engine.snapshot(state)},{completed:[2]});
 const resumed=await boot({query:'?level=2',data});assert.deepEqual(resumed.state().action,state.action);
 const replay=await boot({query:'?level=2&replay=1',data});assert.equal(replay.state().action,null);assert.deepEqual(replay.state().accepted,[]);replay.event('pagehide');assert.deepEqual(store.load(replay.localStorage).completed,[2]);
});

test('room HUD follows pick/place phases and retains already-placed movable items',async()=>{
 const page=await boot({query:'?level=8',data:progress()});page.click('intro-next');page.advance(.1);
 assert.equal(page.nodes.get('finger-hint').textContent.includes('F ·'),true);assert.equal(page.nodes.get('finger-hint').textContent.includes('M ·'),false);
 page.tap('V');page.advance(2);assert.equal(page.state().stage,'place');assert.equal(page.nodes.get('finger-hint').textContent.includes('M ·'),true);assert.equal(page.nodes.get('finger-hint').textContent.includes('V ·'),false);
});

for(const [level,first,queued,extra]of [[7,'Q','W','P'],[2,'D','K','D']])test(`level ${level} visibly acknowledges one queued input without claiming completed progress`,async()=>{
 const page=await boot({query:`?level=${level}`,data:progress()});page.click('intro-next');page.tap(first);page.tap(queued);
 assert.equal(page.state().pendingKey,queued);assert.deepEqual(page.state().accepted,[first]);assert.equal(page.state().progress,0);assert.deepEqual(page.recordedKeys,[[first],[queued]]);
 assert.match(page.nodes.get('message').textContent,new RegExp(`已收到 ${queued}`));assert.match(page.nodes.get('finger-hint').textContent,/已接收，按顺序完成，不用再按/);
 assert.equal(page.nodes.get('key-hints').children.at(-1).textContent,`${queued} 已接收`);assert.equal(page.document.querySelector('.hintbar').classList.contains('error'),false);
 page.tap(extra);assert.equal(page.state().pendingKey,queued);assert.deepEqual(page.recordedKeys,[[first],[queued]]);assert.match(page.nodes.get('message').textContent,/这次按键没有加入/);assert.match(page.nodes.get('finger-hint').textContent,/已接收/);
 page.advance(.2);page.click('pause');page.event('pagehide');const snapshot=page.state();assert.equal(store.load(page.localStorage).sessions[level].state.pendingKey,queued);
 const refreshed=await boot({query:`?level=${level}`,entries:Object.fromEntries(page.values)});refreshed.click('intro-next');assert.equal(refreshed.state().pendingKey,queued);assert.match(refreshed.nodes.get('finger-hint').textContent,/已接收/);
 refreshed.advance(snapshot.action.duration-snapshot.action.elapsed+.01);assert.equal(refreshed.state().pendingKey,null);assert.deepEqual(refreshed.state().accepted,[first,queued]);assert.doesNotMatch(refreshed.nodes.get('finger-hint').textContent,/已接收/);assert.deepEqual(refreshed.recordedKeys,[],'executing restored input is not a new physical keypress');
 refreshed.advance(5);assert.deepEqual(refreshed.state().accepted,[first,queued]);
});

test('wrong-key feedback remains visible after action-time input that was not accepted or queued',async()=>{
 const page=await boot({query:'?level=5',data:progress()});page.click('intro-next');page.tap('I');assert.equal(page.document.querySelector('.hintbar').classList.contains('error'),true);page.tap('E');
 assert.equal(page.state().pendingKey,null);assert.deepEqual(page.recordedKeys,[]);assert.equal(page.document.querySelector('.hintbar').classList.contains('error'),true);assert.match(page.nodes.get('message').textContent,/刚才按了 I/);assert.match(page.nodes.get('message').textContent,/这次按键没有加入/);
});

test('restart is confirmed and a declined restart preserves the paused session',async()=>{
 const page=await boot({data:progress(),confirmResult:false});page.click('intro-next');page.tap('F');page.click('pause');const state=page.state();page.click('restart');assert.equal(page.prompts.length,1);assert.deepEqual(page.state(),state);
});

test('storage unavailable reports failure without breaking intro or warmup',async()=>{
 const page=await boot({unavailable:true});page.click('intro-next');page.tap('F');assert.equal(page.nodes.get('warmup').open,true);assert.match(page.nodes.get('status-note').textContent,/没有保存成功/);assert.equal(page.state().level,1);
});

test('map routes completed rounds to replay and unfinished rounds to their exact level',async()=>{
 const complete=engine.create(1);while(!complete.solved){if(complete.stageReady)engine.advanceStage(complete);engine.press(complete,complete.target);engine.tick(complete,3);}const playing=engine.create(2);engine.press(playing,'D');
 const page=await boot({page:'map',data:progress({1:engine.snapshot(complete),2:engine.snapshot(playing)},{completed:[1,2]})});
 page.stages[0].click();assert.equal(page.location.href,'play.html?level=1&replay=1');page.stages[1].click();assert.equal(page.location.href,'play.html?level=2');assert.match(page.stages[1].status.innerHTML,/接着/);
 page.stages[11].events.get('keydown')({key:' ',preventDefault(){}});assert.equal(page.location.href,'play.html?level=12');
});

test('map practice stays in the preview and reset requires confirmation, preserves original keys',async()=>{
 const entries={'typing-island-progress-v1':'original-v8','typing-island-main-catch-v2':'original-catch'};
 const cancelled=await boot({page:'map',data:progress({}, {completed:[1]}),entries,confirmResult:false});cancelled.click('reset-preview');assert.equal(cancelled.prompts.length,1);assert.equal(cancelled.writes.length,0);assert.equal(cancelled.reloads(),0);
 const page=await boot({page:'map',data:progress({}, {completed:[1]}),entries});page.entry.click();assert.equal(page.nodes.get('practice-dialog').open,true);assert.equal(page.nodes.get('practice-groups').children.length,15);page.nodes.get('practice-groups').children.at(-1).click();assert.equal(page.location.href,'play.html?practice=Backspace');
 page.click('reset-preview');assert.equal(page.reloads(),1);assert.deepEqual(store.load(page.localStorage).completed,[]);for(const [key,value]of Object.entries(entries))assert.equal(page.values.get(key),value);assert.deepEqual([...new Set(page.writes.map(write=>write.key))],[store.STORAGE_KEY]);
});

test('map refreshes on another preview tab update and ignores original progress updates',async()=>{
 const page=await boot({page:'map'});page.event('storage',{key:'typing-island-progress-v1',storageArea:page.localStorage});assert.equal(page.reloads(),0);page.event('storage',{key:store.STORAGE_KEY,storageArea:page.localStorage});assert.equal(page.reloads(),1);
});

test('store rejects stale writes, allows explicit reset and handles a throwing localStorage getter',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const first=store.load(storage),stale=store.load(storage);store.recordKeys(first,['F']);assert.equal(store.save(first,storage),true);store.recordKeys(stale,['J']);assert.equal(store.hasConflict(stale,storage),true);assert.equal(store.save(stale,storage),false);assert.deepEqual(store.load(storage).practiced,['F']);
 assert.equal(store.save(store.blank(),storage),true);assert.deepEqual(store.load(storage).practiced,[]);
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('SecurityError');}});
 try{assert.deepEqual(store.load(),store.blank());assert.equal(store.save(store.blank()),false);}finally{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;}
});

 test('room completion can continue arranging without reopening finish or losing earned completion',async()=>{
 const page=await boot({query:'?level=7',data:progress()});page.click('intro-next');finishAnyLevel(page);
 assert.equal(page.nodes.get('finished').open,true);assert.equal(page.nodes.get('keep-arranging').hidden,false);page.click('keep-arranging');page.tap('Q');page.advance(2);page.tap('P');page.advance(3);
 assert.equal(page.nodes.get('finished').open,false);assert.equal(page.state().placements.Q,'P');assert.deepEqual(store.load(page.localStorage).completed,[7]);
});

 test('late level task warmup starts after arrival and refresh keeps its completed travel',async()=>{
 const page=await boot({query:'?level=12',data:progress({}, {practiced:['C','X','Z']})});page.click('intro-next');page.tap('C');assert.equal(page.nodes.get('warmup').open,false);page.advance(2.5);
 assert.equal(page.state().stage,'write');assert.equal(page.nodes.get('warmup').open,true);assert.equal(page.state().action,null);const atArrival=page.state();page.advance(2);assert.deepEqual(page.state(),atArrival);page.event('pagehide');
 const refreshed=await boot({query:'?level=12',entries:Object.fromEntries(page.values)});refreshed.click('intro-next');assert.equal(refreshed.state().stage,'write');assert.equal(refreshed.state().action,null);assert.equal(refreshed.nodes.get('warmup').open,true);assert.deepEqual(refreshed.state().accepted,['C']);
});

test('browser Back bfcache restoration refreshes map and play from current preview storage',async()=>{
 for(const pageName of ['map','play']){const page=await boot({page:pageName});page.event('pageshow',{persisted:false});assert.equal(page.reloads(),0);page.event('pageshow',{persisted:true});assert.equal(page.reloads(),1);}
});

test('holding Escape cannot immediately cancel the pause it just opened',async()=>{
 const page=await boot({data:progress()});page.click('intro-next');assert.equal(page.keydown('Escape',{key:'Escape'}).defaultPrevented,true);assert.equal(page.nodes.get('paused').open,true);assert.equal(page.keydown('Escape',{key:'Escape',repeat:true}).defaultPrevented,true);assert.equal(page.state().paused,true);page.keyup('Escape');page.cancel('paused');assert.equal(page.state().paused,false);
});

test('failed renderer exposes retry guidance and cannot accept invisible adventure input',async()=>{
 const page=await boot({data:progress(),rendererFailure:true});assert.equal(page.nodes.get('render-error').hidden,false);assert.equal(page.nodes.get('intro').open,false);assert.equal(page.nodes.get('warmup').open,false);assert.match(page.nodes.get('status-note').textContent,/刷新/);assert.equal(page.state().paused,true);
 page.tap('F');page.click('intro-next');page.click('resume');page.click('pause');page.advance(3);assert.deepEqual(page.state().accepted,[]);assert.equal(page.state().paused,true);
 const practice=await boot({query:'?practice=FJ',rendererFailure:true});assert.equal(practice.nodes.get('warmup').open,true);practice.tap('F');assert.deepEqual(practice.practiced(),['F']);
});


test('three real stages have visible progress, deliberate boundaries and no premature completion',async()=>{
 const page=await boot({data:progress()});page.click('intro-next');assert.match(page.nodes.get('stage-progress').textContent,/1 \/ 3/);
 for(let index=0;index<3;index++){
  const before=page.state().accepted.length;finishFruitStage(page);assert.ok(page.state().accepted.length>before);
  const saved=store.load(page.localStorage),snapshot=saved.sessions[1];assert.equal(snapshot.version,2);assert.equal(snapshot.state.lessonStageIndex,index);
  if(index<2){
   assert.equal(page.nodes.get('stage-finished').open,true);assert.equal(page.nodes.get('finished').open,false);assert.equal(page.state().solved,false);assert.deepEqual(saved.completed,[]);
   assert.equal(page.document.activeElement.id,'stage-finish-title');assert.match(page.nodes.get('continue-stage').textContent,new RegExp(`第 ${index+2} 段`));
   const checkpoint=page.state(),writes=page.writes.length;page.advance(30);assert.deepEqual(page.state(),checkpoint);assert.equal(page.writes.length,writes,'waiting adds neither timer nor passive save');
   page.tap('F');assert.deepEqual(page.state().accepted,checkpoint.accepted);page.cancel('stage-finished');assert.equal(page.nodes.get('stage-finished').open,true);
   page.click('continue-stage');assert.equal(page.nodes.get('stage-finished').open,false);assert.equal(page.state().lessonStageIndex,index+1);assert.equal(page.state().progress,0);assert.deepEqual(page.state().accepted,checkpoint.accepted);
   assert.equal(store.load(page.localStorage).sessions[1].state.lessonStageIndex,index+1);
  }else{assert.equal(page.nodes.get('finished').open,true);assert.deepEqual(saved.completed,[1]);assert.match(page.nodes.get('next-level').textContent,/下一关.*第 2 关/);}
 }
});

test('refresh preserves an exact stage checkpoint and the next-stage partial action',async()=>{
 const page=await boot({data:progress()});page.click('intro-next');finishFruitStage(page);const saved=page.state();page.event('pagehide');
 const boundary=await boot({entries:Object.fromEntries(page.values)});assert.equal(boundary.nodes.get('stage-finished').open,true);assert.equal(boundary.nodes.get('intro').open,false);assert.deepEqual(boundary.state(),saved);
 boundary.click('continue-stage');boundary.tap(boundary.read('state.target'));boundary.advance(.2);boundary.click('pause');const partial=boundary.state();
 const resumed=await boot({entries:Object.fromEntries(boundary.values)});assert.equal(resumed.state().lessonStageIndex,1);assert.deepEqual(resumed.state().action,partial.action);assert.deepEqual(resumed.state().accepted,partial.accepted);assert.match(resumed.nodes.get('intro-progress').textContent,/第 2 \/ 3 段/);
});

for(const token of ['Space','Enter'])test(`held ${token} cannot skip a stage, but Tab and a fresh Enter can continue`,async()=>{
 const page=await boot({data:progress()});page.click('intro-next');
 while(page.read('state.progress < state.total-1')){page.tap(page.read('state.target'));page.advance(3);}
 page.tap(page.read('state.target'));page.keydown(token);page.advance(3);
 assert.equal(page.nodes.get('stage-finished').open,true);assert.equal(page.state().lessonStageIndex,0);
 page.focusId('continue-stage');assert.equal(page.nativeDown(token,{repeat:true}).defaultPrevented,true);page.click('continue-stage',{detail:0});assert.equal(page.state().lessonStageIndex,0);
 assert.equal(page.nativeUp(token).defaultPrevented,true);assert.equal(page.state().lessonStageIndex,0);
 assert.equal(page.tap('Tab').defaultPrevented,false);page.focusId('continue-stage');assert.equal(page.nativeDown('Enter').defaultPrevented,false);page.keyup('Enter');assert.equal(page.state().lessonStageIndex,1);assert.equal(page.nodes.get('stage-finished').open,false);
});

test('fresh Space can continue after release, while repeated Enter cannot retrigger a newly focused control',async()=>{
 const page=await boot({data:progress()});page.click('intro-next');finishFruitStage(page);page.focusId('continue-stage');
 assert.equal(page.nativeDown('Space').defaultPrevented,false);assert.equal(page.nativeUp('Space').defaultPrevented,false);assert.equal(page.state().lessonStageIndex,1);
 finishFruitStage(page);page.focusId('continue-stage');page.nativeDown('Enter');assert.equal(page.state().lessonStageIndex,2);page.focusId('pause');assert.equal(page.nativeDown('Enter',{repeat:true}).defaultPrevented,true);assert.equal(page.nodes.get('paused').open,false);page.keyup('Enter');
});

test('next level saves completion before navigation and resumes an existing next-level partial session',async()=>{
 const next=engine.create(2);engine.press(next,'D');engine.tick(next,.2);const pending=engine.snapshot(next);
 const page=await boot({data:progress({2:pending})});page.click('intro-next');finishFruitLevel(page);assert.match(page.nodes.get('finish-copy').textContent,/接着上次/);
 page.click('next-level');assert.equal(page.location.href,'play.html?level=2');const saved=store.load(page.localStorage);assert.deepEqual(saved.completed,[1]);assert.deepEqual(saved.sessions[2],pending);assert.equal(saved.sessions[1].state.solved,true);
 const resumed=await boot({query:'?level=2',entries:Object.fromEntries(page.values)});assert.deepEqual(resumed.state().action,pending.state.action);assert.deepEqual(resumed.state().accepted,pending.state.accepted);
});

test('next level replays an already-completed next level and preserves all existing completion records',async()=>{
 const page=await boot({data:progress({}, {completed:[2]})});page.click('intro-next');finishFruitLevel(page);page.click('next-level');assert.equal(page.location.href,'play.html?level=2&replay=1');assert.deepEqual(store.load(page.localStorage).completed,[2,1]);
});

for(const token of ['Space','Enter'])test(`held ${token} cannot trigger next level when final completion appears`,async()=>{
 const page=await boot({data:progress()});page.click('intro-next');for(let round=0;round<2;round++){finishFruitStage(page);page.click('continue-stage');}
 while(page.read('state.progress < state.total-1')){page.tap(page.read('state.target'));page.advance(3);}
 page.tap(page.read('state.target'));page.keydown(token);page.advance(3);assert.equal(page.nodes.get('finished').open,true);page.focusId('next-level');
 assert.equal(page.nativeDown(token,{repeat:true}).defaultPrevented,true);page.click('next-level',{detail:0});assert.equal(page.location.href,'');assert.equal(page.nativeUp(token).defaultPrevented,true);assert.equal(page.location.href,'');
 page.nativeDown('Enter');page.keyup('Enter');assert.equal(page.location.href,'play.html?level=2');
});

test('a final-save conflict blocks next-level navigation and preserves the newer remote record',async()=>{
 const page=await boot({data:progress()});page.click('intro-next');finishFruitLevel(page);const remote=progress({}, {completed:[12]});page.remote(remote);page.click('next-level');assert.equal(page.location.href,'');assert.equal(page.nodes.get('paused').open,true);assert.deepEqual(store.load(page.localStorage).completed,[12]);
});


for(let level=1;level<12;level++)test(`level ${level} offers a working next-level route to ${level+1}`,async()=>{
 const final=solvedLevel(level),page=await boot({query:`?level=${level}`,data:progress({[level]:engine.snapshot(final)})});
 assert.equal(page.nodes.get('finished').open,true);assert.match(page.nodes.get('next-level').textContent,new RegExp(`第 ${level+1} 关`));
 page.click('next-level');assert.equal(page.location.href,`play.html?level=${level+1}`);assert.ok(store.load(page.localStorage).completed.includes(level));
});

test('level 12 finishes the adventure at the map and never offers level 13',async()=>{
 const final=solvedLevel(12),page=await boot({query:'?level=12',data:progress({12:engine.snapshot(final)})});
 assert.equal(page.nodes.get('finished').open,true);assert.match(page.nodes.get('next-level').textContent,/完成冒险.*回地图/);assert.doesNotMatch(page.nodes.get('next-level').textContent,/13/);page.click('next-level');assert.equal(page.location.href,'./');assert.deepEqual(store.load(page.localStorage).completed,[12]);
 page.click('replay');assert.equal(page.state().lessonStageIndex,0);assert.equal(page.state().solved,false);assert.equal(page.nodes.get('intro').open,true);assert.deepEqual(store.load(page.localStorage).completed,[12]);
});

test('old unfinished sessions retain their exact task and explain the staged upgrade',async()=>{
 const old=engine.create(3);engine.press(old,'S');engine.tick(old,.2);const saved=legacySnapshot(old),page=await boot({query:'?level=3',data:progress({3:saved},{completed:[1,2]})});
 assert.deepEqual(page.state().action,saved.state.action);assert.deepEqual(page.state().accepted,['S']);assert.ok(page.nodes.get('intro-progress').textContent.length);assert.ok(page.read('state.migrationNotice'));
 page.click('intro-next');page.advance(2);assert.equal(page.state().index,1);page.event('pagehide');const stored=store.load(page.localStorage);assert.deepEqual(stored.completed,[1,2]);assert.equal(stored.sessions[3].version,2);
});

test('old completed sessions keep their earned finish and never claim three newly played stages',async()=>{
 const old=engine.create(1);while(!old.stageReady){engine.press(old,old.target);engine.tick(old,3);}old.phase='complete';old.solved=true;
 const page=await boot({data:progress({1:legacySnapshot(old)},{completed:[1],practiced:['F','J']})});assert.equal(page.nodes.get('finished').open,true);assert.equal(page.nodes.get('stage-finished').open,false);assert.deepEqual(store.load(page.localStorage).completed,[1]);assert.deepEqual(page.practiced(),['F','J']);assert.doesNotMatch(page.nodes.get('finish-title').textContent,/三段/);
 page.click('next-level');assert.equal(page.location.href,'play.html?level=2');
});


test('resumed later-stage introduction describes its current task rather than the first basket',async()=>{
 const state=engine.create(2);for(const key of 'DKD'){engine.press(state,key);engine.tick(state,3);}engine.advanceStage(state);
 const page=await boot({query:'?level=2',data:progress({2:engine.snapshot(state)})});assert.equal(page.nodes.get('intro-copy').textContent,engine.getStageInfo(state).description);assert.match(page.nodes.get('intro-progress').textContent,/第 2 \/ 3 段/);
});

test('continuing a stage warms newly required keys without adding gameplay credit',async()=>{
 const page=await boot({query:'?level=7',data:progress({}, {practiced:[...'QWOP']})});page.click('intro-next');for(const key of 'QWOP'){page.tap(key);page.advance(3);}
 assert.equal(page.nodes.get('stage-finished').open,true);page.click('continue-stage');assert.equal(page.state().lessonStageIndex,1);assert.equal(page.nodes.get('warmup').open,true);assert.equal(page.nodes.get('warmup-key').textContent,'F');const accepted=page.state().accepted;
 page.tap('F');page.event('pagehide');const resumed=await boot({query:'?level=7',entries:Object.fromEntries(page.values)});resumed.click('intro-next');assert.equal(resumed.nodes.get('warmup-key').textContent,'D');resumed.tap('D');assert.equal(resumed.nodes.get('warmup').open,false);assert.deepEqual(resumed.state().accepted,accepted);assert.equal(resumed.state().lessonStageIndex,1);
});


test('a failed final save keeps next-level navigation on the page until saving succeeds',async()=>{
 const page=await boot({data:progress()});page.click('intro-next');finishFruitLevel(page);const stored=page.values.get(store.STORAGE_KEY);page.failWrites();page.click('next-level');assert.equal(page.location.href,'');assert.equal(page.nodes.get('finished').open,true);assert.match(page.nodes.get('status-note').textContent,/没有保存成功/);assert.equal(page.values.get(store.STORAGE_KEY),stored);
 page.allowWrites();page.click('next-level');assert.equal(page.location.href,'play.html?level=2');assert.deepEqual(store.load(page.localStorage).completed,[1]);
});


test('replay query is consumed once, preserves URL context, and refresh resumes the newly saved round',async()=>{
 const page=await boot({query:'?level=3&replay=1&source=map',pathname:'/island/challenge-test/play.html',hash:'#adventure',data:progress({3:engine.snapshot(solvedLevel(3))},{completed:[3]})});
 assert.equal(page.state().solved,false);assert.deepEqual(page.state().accepted,[]);assert.equal(page.location.search,'?level=3&source=map');assert.equal(page.location.pathname,'/island/challenge-test/play.html');assert.equal(page.location.hash,'#adventure');assert.deepEqual(page.historyCalls,[{state:{source:'existing-history'},title:'',url:'/island/challenge-test/play.html?level=3&source=map#adventure'}]);
 assert.equal(store.load(page.localStorage).sessions[3].state.solved,false);const immediate=await boot({query:page.location.search,entries:Object.fromEntries(page.values)});assert.equal(immediate.nodes.get('intro').open,true);assert.equal(immediate.state().solved,false);
 page.click('intro-next');page.tap('S');page.tap('L');page.advance(.2);page.click('pause');const partial=page.state();assert.equal(page.historyCalls.length,1);assert.ok(partial.action);assert.deepEqual(partial.queue,['L']);
 const refreshed=await boot({query:page.location.search,entries:Object.fromEntries(page.values)});assert.deepEqual(refreshed.state().action,partial.action);assert.deepEqual(refreshed.state().queue,partial.queue);assert.deepEqual(refreshed.state().accepted,['S','L']);assert.deepEqual(store.load(refreshed.localStorage).completed,[3]);assert.equal(refreshed.historyCalls.length,0);
});


for(let level=1;level<=12;level++)test(`experience v3 controller completes three stages, saves, and routes level ${level}`,async()=>{
 const page=await boot({modern:true,query:`?level=${level}`,data:progress()});page.click('intro-next');
 for(let guard=0;guard<150&&!page.state().solved;guard++){
  const state=plain(page.read('state'));
  if(state.action){page.advance(state.action.duration-state.action.elapsed+.2);continue;}
  if(state.stageReady){page.click('continue-stage');continue;}
  if(page.nodes.get('warmup').open){page.tap(page.read('warmKeys[warmIndex]'));continue;}
  let input=nextInput(state);
  if(state.balanced&&state.lastFruit)input=state.choices.find(c=>c.kind==='fruit'&&!c.done&&c.key!==state.lastFruit)?.key||input;
  assert.ok(input,`level ${level} exposes an input at ${state.stage}`);page.tap(input);page.advance(5);
 }
 assert.equal(page.state().solved,true);assert.equal(page.state().version,3);
 assert.equal(page.nodes.get('finished').open,true);assert.ok(store.load(page.localStorage).completed.includes(level));
 page.click('next-level');assert.equal(page.location.href,level===12?'./':`play.html?level=${level+1}`);
});
test('v3 visible fruit string accepts a burst, reports its exact queue, and resumes once after refresh',async()=>{
 const state=currentEngine.create(1);for(const k of 'FJFJ'){currentEngine.press(state,k);currentEngine.tick(state,4);}currentEngine.advanceStage(state);
 const page=await boot({modern:true,query:'?level=1',data:progress({1:currentEngine.snapshot(state)})});page.click('intro-next');
 for(const k of 'FFJJ')page.tap(k);assert.deepEqual(page.state().queue,['F','J','J']);assert.match(page.nodes.get('finger-hint').textContent,/F → J → J.*已接收/);
 page.event('blur');const reloaded=await boot({modern:true,query:'?level=1',entries:Object.fromEntries(page.values)});reloaded.click('intro-next');reloaded.advance(4);
 assert.equal(reloaded.state().step,4);assert.deepEqual(reloaded.state().queue,[]);assert.deepEqual(reloaded.state().accepted.slice(-4),['F','F','J','J']);assert.deepEqual(reloaded.recordedKeys,[]);
});
