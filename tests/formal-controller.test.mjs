import {nextActivityKey} from './activity-driver.mjs';
import {roomObjectives,isRoomDesign} from '../dist/game/playability.js';
import {taskGuide} from '../dist/game/task-guide.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as currentEngine from '../dist/game/engine.js';
import * as classicEngine from '../dist/game/engine-classic.js';
const engine=currentEngine;
test('restarting an older activity saves the new round then reloads its matching renderer',async()=>{
 for(const level of [5,6,8,11,12])for(const button of ['upgrade-round','restart','replay']){
  const old=classicEngine.snapshot(classicEngine.create(level,0,12));
  const p=await boot({query:`?level=${level}`,data:progress({[level]:old},{completed:[1,2]})});
  if(button==='restart'){p.click('intro-next');p.click('pause');}
  if(button==='replay')p.read("state.solved=true;state.phase='complete';showCheckpoint()");
  p.click(button);assert.equal(p.reloads(),1,`${level}/${button}`);
  const saved=JSON.parse(p.values.get(store.STORAGE_KEY));assert.equal(saved.sessions[level].state.activityEdition,1);assert.ok(saved.completed.includes(1));
 }
});
import * as store from '../dist/game/store.js';
import {getFinger} from '../dist/curriculum.js';

const read=name=>fs.readFileSync(new URL(`../dist/game/${name}`,import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const mastered=[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ','Space','Backspace'];
const progress=(sessions={},extra={})=>({...store.blank(),practiced:[...mastered],sessions,...extra});

const eventKey=token=>({key:token==='Space'?' ':token.length>1?token:token.toLowerCase(),code:token.length===1?`Key${token}`:token});

async function boot({modern=true,query='?level=1',data,entries={},page='play',unavailable=false,confirmResult=true,rendererFailure=false,fixedSeed,pathname='/game/play.html',hash=''}={}){
 const nodes=new Map(),windowEvents=new Map(),documentEvents=new Map(),writes=[],prompts=[],alerts=[],rendered=[],historyCalls=[],recordedKeys=[];
 const values=new Map(Object.entries(entries));if(data)values.set(store.STORAGE_KEY,JSON.stringify(data));
 let now=0,frame,reloads=0,writeFailure=false;
 const document={hidden:false,activeElement:null,getElementById:id=>nodes.get(id),createElement:tag=>element(tag),addEventListener:(name,fn)=>documentEvents.set(name,fn)};
 function element(tag,id=''){
  const classes=new Set(),events=new Map();
  const node={tagName:tag.toUpperCase(),id,hidden:false,disabled:false,open:false,children:[],textContent:'',_html:'',get innerHTML(){return this._html;},set innerHTML(value){this._html=value;this.children=[];},style:{},attributes:{},events,
   classList:{toggle(name,on){on??=!classes.has(name);on?classes.add(name):classes.delete(name);return on;},contains:name=>classes.has(name)},
   append(...children){this.children.push(...children);},setAttribute(name,value){this.attributes[name]=String(value);},getAttribute(name){return this.attributes[name]??null;},
   addEventListener:(name,fn)=>events.set(name,fn),focus(){document.activeElement=this;},
   showModal(){this.returnFocus=document.activeElement;this.open=true;},close(){this.open=false;document.activeElement=this.returnFocus;},click(event={detail:1}){if(!this.disabled){this.onclick?.(event);events.get('click')?.(event);}},querySelector(){return this.status;}};
  if(id)nodes.set(id,node);return node;
 }
 for(const [,tag,id]of read(`${page==='play'?'play':'index'}.html`).matchAll(/<([a-z][a-z0-9]*)\b[^>]*?\bid="([^"]+)"/gi))element(tag,id);
 document.body=element('body');
 nodes.get('world').status=element('canvas');
 const dialogs=[...nodes.values()].filter(node=>node.tagName==='DIALOG'),hintbar=element('footer');
 const stages=Array.from({length:12},()=>{const node=element('section');node.status=element('span');return node;}),counts=[element('strong'),element('strong')],tracks=[element('i'),element('i')],journey=element('section'),entry=element('section');
 document.querySelector=selector=>selector==='.hintbar'?hintbar:selector==='.journey-progress'?journey:selector==='.free-practice'?entry:selector.startsWith('#')?nodes.get(selector.slice(1)):null;
 document.querySelectorAll=selector=>selector==='dialog'?dialogs:selector==='.stage'?stages:selector==='.journey-progress strong'?counts:selector==='.progress-track i'?tracks:[];
 const localStorage={getItem(key){if(unavailable)throw Error('SecurityError');return values.get(key)??null;},setItem(key,value){if(unavailable||writeFailure)throw Error('SecurityError');values.set(key,value);writes.push({key,value:JSON.parse(value)});}};
 const location={search:query,pathname,hash,href:'',reload(){reloads++;}};
 const history={state:{source:'existing-history'},replaceState(state,title,url){historyCalls.push({state,title,url});this.state=state;const parsed=new URL(url,'https://typing.example');location.search=parsed.search;location.pathname=parsed.pathname;location.hash=parsed.hash;}};
 const world={update(state,dt){rendered.push({state:engine.snapshot(state),dt});}};
 const worldModules=Object.fromEntries(['Orchard','River','Forest','Pairing','Invitation','Activity'].map(name=>[`create${name}World`,()=>{if(rendererFailure)throw Error('WebGL unavailable');return world;}]));
 const feedbackEvents=[];
 const context=vm.createContext({createFeedback:()=>({unlock(){},stop(){},pulse(){},play:kind=>feedbackEvents.push(kind||'hit')}),taskGuide,...engine,create:fixedSeed===undefined?(modern?currentEngine.create:engine.create):(level,stage=0,seed=fixedSeed)=>currentEngine.create(level,stage,seed),getFinger,STORAGE_KEY:store.STORAGE_KEY,load:()=>store.load(localStorage),save:data=>store.save(data,localStorage),blank:store.blank,recordKeys:(data,keys)=>{recordedKeys.push([...keys]);return store.recordKeys(data,keys);},hasConflict:data=>store.hasConflict(data,localStorage),document,
  window:{localStorage,addEventListener:(name,fn)=>windowEvents.set(name,fn)},localStorage,location,history,navigator:{},URLSearchParams,performance:{now:()=>now},
  requestAnimationFrame:fn=>{frame=fn;},worldModules,createWorld:()=>world,confirm:message=>{prompts.push(message);return confirmResult;},alert:message=>alerts.push(message),console:{error(){}}});
 const source=read(`${page}.js`).replace(/^import[^\n]+\n/gm,'').replace('const mod=await import(path);','const mod=await Promise.resolve(worldModules);');
 vm.runInContext(source,context);await Promise.resolve();await Promise.resolve();
 const event=(name,options={})=>{const e={...options,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};windowEvents.get(name)?.(e);return e;};
 const keydown=(token,options={})=>event('keydown',{...eventKey(token),...options});
 const keyup=token=>event('keyup',eventKey(token));
 return {feedbackEvents,nodes,dialogs,stages,entry,counts,tracks,journey,values,writes,prompts,alerts,rendered,document,localStorage,location,history,historyCalls,recordedKeys,event,keydown,keyup,
  tap(token,options={}){const e=keydown(token,options);keyup(token);return e;},
  state:()=>plain(vm.runInContext('state',context)),
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

function sessionWithMetrics(state,extra={}){
 const saved=engine.snapshot(state),empty=()=>({correct:0,wrong:0,backspace:0,choices:0,help:0});
 saved.roundMetrics={version:1,level:state.level,seed:state.seed,attemptId:'test-round',snapshotFingerprint:store.snapshotFingerprint(saved.state),...empty(),stages:[0,1,2].map(index=>({...empty(),observed:index===state.lessonStageIndex,automaticHints:index===0})),...extra};return saved;
}
function nextTaskKey(state){
 if(state.activityEdition)return nextActivityKey(state);
 if(isRoomDesign(state)){
  const layouts=Array.from({length:16},(_,n)=>Object.fromEntries(['F','D','V','B'].map((key,i)=>[key,n>>i&1?'M':'N']))).filter(placements=>roomObjectives({...state,placements}).every(goal=>goal.done));
  layouts.sort((a,b)=>Object.keys(a).filter(key=>a[key]!==state.placements[key]).length-Object.keys(b).filter(key=>b[key]!==state.placements[key]).length);
  const target=layouts[0],key=state.held?target[state.held]:Object.keys(target).find(key=>target[key]!==state.placements[key]);
  const choice=state.choices.find(c=>c.key===key);return choice.code[state.codeBuffer.length];
 }

 if(state.routeAdventure&&state.level===5){
  const graph=state.routeGraph,distances={[graph.goal]:0};
  for(let n=0;n<10;n++)for(const edge of graph.edges){if(distances[edge.to]!==undefined)distances[edge.from]=Math.min(distances[edge.from]??99,distances[edge.to]+1);if(distances[edge.from]!==undefined)distances[edge.to]=Math.min(distances[edge.to]??99,distances[edge.from]+1);}
  const choice=[...state.choices].sort((a,b)=>distances[a.nodeTo]-distances[b.nodeTo])[0];return choice.code[state.codeBuffer.length];
 }

 if(state.codeInput?.candidates?.length){
  const choices=(state.choices||[]).filter(c=>!c.disabled&&(state.mode==='room'||!c.done));
  let goal=choices[0];
  if(state.mode==='forest'&&state.task?.correct)goal=choices.find(c=>c.key===state.task.correct)||goal;
  if(state.mode==='room'){
   if(state.stage==='pick')goal=choices.find(c=>{const item=state.items.find(i=>i.key===c.key);return item&&state.placements[item.key]!==item.goalZone;})||goal;
   else goal=choices.find(c=>c.key===state.items.find(i=>i.key===state.held)?.goalZone)||goal;
  }
  return (goal?.code||goal?.key)?.[(state.codeBuffer||'').length];
 }
 if(state.target)return state.target;
 if(state.mode==='forest'&&state.task?.correct){const c=state.choices.find(c=>c.key===state.task.correct);return (c.code||c.key)[(state.codeBuffer||'').length];}
 if(state.mode==='room'){
  const id=state.stage==='pick'?state.items.find(i=>state.placements[i.key]!==i.goalZone)?.key:state.items.find(i=>i.key===state.held)?.goalZone;
  const choice=state.choices.find(c=>c.key===id);return choice?(choice.code||choice.key)[(state.codeBuffer||'').length]:null;
 }
 const choice=state.choices.find(c=>!c.disabled&&!c.done);return choice?(choice.code||choice.key)[(state.codeBuffer||'').length]:null;
}
function completeStage(page){
 for(let guard=0;guard<300&&!page.state().stageReady&&!page.state().solved;guard++){
  if(page.nodes.get('warmup').open){page.tap(page.read('warmKeys[warmIndex]'));continue;}
  const state=plain(page.read('state'));
  if(state.action){page.advance(state.action.duration-state.action.elapsed+.3);continue;}
  let key=nextTaskKey(state);
  if(state.balanced&&state.lastFruit)key=state.choices.find(c=>!c.done&&c.key!==state.lastFruit)?.key||key;
  assert.ok(key,`next key in level ${state.level} stage ${state.stage}`);page.tap(key);page.advance(8);
 }
 assert.ok(page.state().stageReady||page.state().solved);
}


for(let level=1;level<=12;level++)test(`formal level ${level}: all three stages complete, counters and restored snapshots agree`,async()=>{
 const p=await boot({query:`?level=${level}`,data:progress(),fixedSeed:314});p.click('intro-next');
 for(let stage=0;stage<3;stage++){
  assert.equal(p.read('state.lessonStageIndex'),stage);
  completeStage(p);
  const saved=store.load(p.localStorage).sessions[level],restored=engine.restore(saved);
  assert.ok(restored,`restorable level ${level} stage ${stage}`);
  assert.equal(restored.lessonStageIndex,stage);assert.equal(saved.roundMetrics.wrong,0);
  assert.deepEqual(plain(saved.roundMetrics),plain(p.read('metricsSnapshot(snapshot(state)).roundMetrics')));
  if(stage<2){assert.ok(p.nodes.get('stage-finished').open);p.click('continue-stage');}
 }
 assert.ok(p.nodes.get('finished').open);assert.ok(store.load(p.localStorage).completed.includes(level));
 assert.match(p.nodes.get('finish-evaluation').textContent,/第 3 段未求助完成/);
});

test('formal IME interruption freezes action and resumes without compositionend; warmup recovers too',async()=>{
 const p=await boot({query:'?level=3',data:progress()});p.click('intro-next');p.tap(p.read('state.target'));p.advance(.1);
 const action=plain(p.read('state.action'));p.event('compositionstart');p.advance(3);
 assert.deepEqual(plain(p.read('state.action')),action);assert.ok(p.nodes.get('paused').open);
 p.click('resume');p.advance(3);p.tap(p.read('state.target'));assert.equal(p.read('roundMetrics.correct'),2);
 p.event('keydown',{key:'Process',keyCode:229});assert.ok(p.nodes.get('paused').open);
 const q=await boot({query:'?practice=FJ',data:progress()});q.event('compositionstart');q.tap('F');assert.equal(q.read('practiceCount'),1);
});

test('formal context loss freezes pending movement and keys, requires recovery plus manual continue',async()=>{
 const p=await boot({query:'?level=3',data:progress()});p.click('intro-next');p.tap(p.read('state.target'));p.advance(.1);
 const before=plain(p.read('state.action')),count=p.read('roundMetrics.correct'),canvas=p.nodes.get('world');
 let prevented=false;canvas.events.get('webglcontextlost')({preventDefault(){prevented=true;}});
 assert.ok(prevented);assert.ok(p.nodes.get('paused').open);assert.ok(p.nodes.get('resume').disabled);
 p.tap(p.read('state.target'));p.click('resume');p.advance(3);assert.deepEqual(plain(p.read('state.action')),before);assert.equal(p.read('roundMetrics.correct'),count);
 canvas.events.get('webglcontextrestored')();p.advance(3);assert.deepEqual(plain(p.read('state.action')),before);
 assert.equal(p.nodes.get('resume').disabled,false);p.click('resume');p.advance(3);assert.equal(p.read('state.action'),null);
});

test('formal context recovery preserves underlying intro/help and cannot unlock a storage conflict',async()=>{
 const p=await boot({query:'?level=3',data:progress()}),canvas=p.nodes.get('world');
 const lose=()=>canvas.events.get('webglcontextlost')({preventDefault(){}}),restore=()=>canvas.events.get('webglcontextrestored')();
 lose();restore();p.click('resume');assert.ok(p.nodes.get('intro').open);p.click('intro-next');p.click('help');
 lose();restore();p.click('resume');assert.ok(p.nodes.get('finger-dialog').open);p.click('close-help');
 assert.equal(p.read('roundMetrics.help'),1);lose();p.event('storage',{key:store.STORAGE_KEY});restore();
 assert.ok(p.nodes.get('resume').disabled);p.click('resume');assert.equal(p.read('state.paused'),true);
});

test('level 9 instructions describe rejected wrong letters; Backspace instructions begin at level 10',()=>{
 for(const stage of [0,1,2]){
  const s=engine.create(9,stage,314),guide=taskGuide(s),before=s.buffer;
  assert.doesNotMatch(guide.controls,/Backspace|退格/);assert.match(guide.controls,/按错可以直接重试/);
  engine.press(s,s.target==='Z'?'A':'Z');assert.equal(s.buffer,before);
  assert.match(taskGuide(engine.create(10,stage,314)).controls,/Backspace/);
 }
});

test('formal pause stops repeated scene renders and resume updates the scene again',async()=>{
 const p=await boot({query:'?level=3',data:progress()});p.advance(.1);const intro=p.rendered.length;p.advance(2);assert.equal(p.rendered.length,intro);
 p.click('intro-next');p.advance(.1);assert.ok(p.rendered.length>intro);p.click('pause');p.advance(.1);const paused=p.rendered.length;
 p.advance(2);assert.equal(p.rendered.length,paused);p.click('resume');p.advance(.1);assert.ok(p.rendered.length>paused);
});


test('formal feedback follows accepted inputs and completion without crediting ignored keys',async()=>{
 const p=await boot({query:'?level=3',data:progress(),fixedSeed:314});p.click('intro-next');
 p.tap(p.read('state.target'));assert.deepEqual(p.feedbackEvents,['hit']);
 p.tap('Z',{ctrlKey:true});assert.deepEqual(p.feedbackEvents,['hit']);
 completeStage(p);assert.equal(p.feedbackEvents.at(-1),'complete');
 const count=p.feedbackEvents.length;p.advance(3);assert.equal(p.feedbackEvents.length,count);
 assert.equal(p.nodes.get('lesson-fill').style.width,'100%');
});
test('map continues the latest unfinished round without changing saved data',async()=>{
 const s=currentEngine.create(7,1,314),d=progress({7:currentEngine.snapshot(s)},{lastLevel:7,completed:[1,2]});
 const p=await boot({page:'map',data:d});
 assert.equal(p.nodes.get('continue-adventure').href,'play.html?level=7');
 assert.match(p.nodes.get('continue-adventure').textContent,/继续冒险/);assert.equal(p.writes.length,0);
 const fresh=await boot({page:'map',data:progress()});assert.equal(fresh.nodes.get('continue-adventure').href,'play.html?level=1');
 const completed=await boot({page:'map',data:progress({}, {completed:Array.from({length:12},(_,i)=>i+1),lastLevel:12})});
 assert.equal(completed.nodes.get('continue-adventure').href,'play.html?level=12&replay=1');
});

test('unchanged key hints keep their DOM nodes while the scene advances',async()=>{
 const p=await boot({query:'?level=3',data:progress(),fixedSeed:314});p.click('intro-next');p.advance(.1);
 const before=p.nodes.get('key-hints').children[0];assert.ok(before);p.advance(.2);
 assert.equal(p.nodes.get('key-hints').children[0],before);
 p.tap(p.read('state.target'));p.advance(3);
 assert.notEqual(p.nodes.get('key-hints').children[0],before);
});
