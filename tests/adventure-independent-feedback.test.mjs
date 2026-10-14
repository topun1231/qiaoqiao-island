import {taskGuide} from '../dist/game/task-guide.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as currentEngine from '../dist/game/engine-classic.js';
const engine=currentEngine;
import * as store from '../dist/game/store.js';
import {getFinger} from '../dist/curriculum.js';

const read=name=>fs.readFileSync(new URL(`../dist/game/${name}`,import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const mastered=[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ','Space','Backspace'];
const progress=(sessions={},extra={})=>({...store.blank(),practiced:[...mastered],sessions,...extra});

test('level 2 basket instructions expose physical keycaps and switch after selection without help credit',async()=>{
 const state=engine.create(2,2,314),page=await boot({query:'?level=2',data:progress({2:sessionWithMetrics(state)})});
 page.click('intro-next');
 const controls=page.nodes.get('task-guide-controls');
 assert.deepEqual(controls.children.filter(n=>n.tagName==='KBD').map(n=>n.textContent),['F','J']);
 assert.match(controls.attributes['aria-label'],/F 选左篮，J 选右篮/);
 page.tap('J');page.advance(1);
 assert.match(page.nodes.get('task-guide-title').textContent,/分享组合篮/);
 assert.equal(controls.children.filter(n=>n.tagName==='KBD').length,0);
 assert.equal(page.read('roundMetrics.help'),0);
});
const eventKey=token=>({key:token==='Space'?' ':token.length>1?token:token.toLowerCase(),code:token.length===1?`Key${token}`:token});

// Execute the real controllers and engine with a tiny DOM, controlled frame
// clock and storage. Renderer factories alone are stubbed. These exercise
// handlers and persistence; they are not a substitute for native browser QA.
async function boot({modern=true,query='?level=1',data,entries={},page='play',unavailable=false,confirmResult=true,rendererFailure=false,fixedSeed,pathname='/game/play.html',hash=''}={}){
 const nodes=new Map(),windowEvents=new Map(),documentEvents=new Map(),writes=[],prompts=[],alerts=[],rendered=[],historyCalls=[],recordedKeys=[];
 const values=new Map(Object.entries(entries));if(data)values.set(store.STORAGE_KEY,JSON.stringify(data));
 let now=0,frame,reloads=0,writeFailure=false;
 const document={hidden:false,activeElement:null,getElementById:id=>nodes.get(id),createElement:tag=>element(tag),addEventListener:(name,fn)=>documentEvents.set(name,fn)};
 function element(tag,id=''){
  const classes=new Set(),events=new Map();
  const node={dataset:{},tagName:tag.toUpperCase(),id,hidden:false,disabled:false,open:false,children:[],textContent:'',_html:'',get innerHTML(){return this._html;},set innerHTML(value){this._html=value;this.children=[];},style:{},attributes:{},events,
   classList:{toggle(name,on){on??=!classes.has(name);on?classes.add(name):classes.delete(name);return on;},contains:name=>classes.has(name)},
   append(...children){this.children.push(...children);},setAttribute(name,value){this.attributes[name]=String(value);},getAttribute(name){return this.attributes[name]??null;},
   addEventListener:(name,fn)=>events.set(name,fn),focus(){document.activeElement=this;},
   showModal(){this.returnFocus=document.activeElement;this.open=true;},close(){this.open=false;document.activeElement=this.returnFocus;},click(event={detail:1}){if(!this.disabled){this.onclick?.(event);events.get('click')?.(event);}},querySelector(){return this.status;}};
  if(id)nodes.set(id,node);return node;
 }
 for(const [,tag,id]of read(`${page==='play'?'play':'index'}.html`).matchAll(/<([a-z][a-z0-9]*)\b[^>]*?\bid="([^"]+)"/gi))element(tag,id);
 document.body=element('body');if(nodes.has('world'))nodes.get('world').status=element('canvas');
 const dialogs=[...nodes.values()].filter(node=>node.tagName==='DIALOG'),hintbar=element('footer');
 const stages=Array.from({length:12},()=>{const node=element('section');node.status=element('span');return node;}),counts=[element('strong'),element('strong')],tracks=[element('i'),element('i')],journey=element('section'),entry=element('section');
 document.querySelector=selector=>selector==='.hintbar'?hintbar:selector==='.journey-progress'?journey:selector==='.free-practice'?entry:selector.startsWith('#')?nodes.get(selector.slice(1)):null;
 document.querySelectorAll=selector=>selector==='dialog'?dialogs:selector==='.stage'?stages:selector==='.journey-progress strong'?counts:selector==='.progress-track i'?tracks:[];
 const localStorage={getItem(key){if(unavailable)throw Error('SecurityError');return values.get(key)??null;},setItem(key,value){if(unavailable||writeFailure)throw Error('SecurityError');values.set(key,value);writes.push({key,value:JSON.parse(value)});}};
 const location={search:query,pathname,hash,href:'',reload(){reloads++;}};
 const history={state:{source:'existing-history'},replaceState(state,title,url){historyCalls.push({state,title,url});this.state=state;const parsed=new URL(url,'https://typing.example');location.search=parsed.search;location.pathname=parsed.pathname;location.hash=parsed.hash;}};
 const world={update(state,dt){rendered.push({state:engine.snapshot(state),dt});}};
 const worldModules=Object.fromEntries(['Orchard','River','Forest','Pairing','Invitation'].map(name=>[`create${name}World`,()=>{if(rendererFailure)throw Error('WebGL unavailable');return world;}]));
 const context=vm.createContext({createFeedback:()=>({unlock(){},stop(){},pulse(){},play(){}}),taskGuide,...engine,create:fixedSeed===undefined?(modern?currentEngine.create:engine.create):(level,stage=0,seed=fixedSeed)=>currentEngine.create(level,stage,seed),getFinger,STORAGE_KEY:store.STORAGE_KEY,load:()=>store.load(localStorage),save:data=>store.save(data,localStorage),blank:store.blank,recordKeys:(data,keys)=>{recordedKeys.push([...keys]);return store.recordKeys(data,keys);},hasConflict:data=>store.hasConflict(data,localStorage),document,
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

function sessionWithMetrics(state,extra={}){
 const saved=engine.snapshot(state),empty=()=>({correct:0,wrong:0,backspace:0,choices:0,help:0});
 saved.roundMetrics={version:1,level:state.level,seed:state.seed,attemptId:'test-round',snapshotFingerprint:store.snapshotFingerprint(saved.state),...empty(),stages:[0,1,2].map(index=>({...empty(),observed:index===state.lessonStageIndex,automaticHints:index===0})),...extra};return saved;
}
function nextTaskKey(state){
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

test('v4 independent HUD hides next key/finger and wrong feedback never reveals the answer',async()=>{
 const state=engine.create(3,1,482),page=await boot({query:'?level=3',data:progress({3:sessionWithMetrics(state)})});page.click('intro-next');page.advance(.1);
 assert.equal(page.state().version,4);assert.equal(page.nodes.get('world').classList.contains('independent-practice'),true);
 assert.equal(page.nodes.get('key-hints').children.length,0);assert.match(page.nodes.get('finger-hint').textContent,/默认关闭/);
 const target=page.read('state.target'),wrong=[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find(k=>k!==target);page.tap(wrong);
 assert.match(page.nodes.get('message').textContent,new RegExp(`刚才按了 ${wrong}`));assert.doesNotMatch(page.nodes.get('message').textContent,new RegExp(`先找 ${target}|接下来是 ${target}`));
 assert.equal(page.document.querySelector('.hintbar').classList.contains('error'),true);
 assert.equal(page.nodes.get('key-hints').children.some(c=>c.textContent===target),false);
 page.click('help');assert.match(page.nodes.get('help-current-target').textContent,new RegExp(target));assert.equal(page.read('roundMetrics.help'),1);assert.equal(page.read('state.hintRequested'),true);
 page.click('close-help');page.tap(target);assert.equal(page.read('state.hintRequested'),false);assert.equal(page.read('roundMetrics.wrong'),1);
});

test('v4 real key counters exclude ignored input, repeats, warmup, modifiers, composition and modal input',async()=>{
 const page=await boot({query:'?level=3',data:progress()});page.click('intro-next');const first=page.read('state.target');
 for(const options of [{repeat:true},{ctrlKey:true},{metaKey:true},{altKey:true},{isComposing:true},{keyCode:229}])page.tap(first,options);
 assert.equal(page.read('roundMetrics.correct'),0);assert.ok(page.nodes.get('paused').open);page.click('resume');
 page.keydown(first);page.keydown(first,{repeat:true});page.keydown(first);page.keyup(first);assert.equal(page.read('roundMetrics.correct'),1);
 const next=page.read('state.target');page.tap(next);const before=plain(page.read('roundMetrics'));page.advance(5);assert.deepEqual(plain(page.read('roundMetrics')),before,'executing queued input is not another physical press');
 page.click('pause');page.tap(first);assert.deepEqual(plain(page.read('roundMetrics')),before);page.click('resume');
 page.event('compositionstart');page.tap(first);page.event('compositionend');assert.deepEqual(plain(page.read('roundMetrics')),before);
 const fresh=await boot({query:'?level=1'});fresh.click('intro-next');fresh.tap('Z');fresh.tap(fresh.read('warmKeys[warmIndex]'));assert.equal(fresh.read('roundMetrics.correct'),0);assert.equal(fresh.read('roundMetrics.wrong'),0);
});

test('wrong typed letter remains counted after Backspace and survives pause, reload and stage changes',async()=>{
 const page=await boot({query:'?level=11',data:progress()});page.click('intro-next');const wrong=page.read('state.target')==='Z'?'X':'Z';page.tap(wrong);assert.equal(page.read('roundMetrics.wrong'),1);page.tap('Backspace');
 assert.equal(page.read('roundMetrics.wrong'),1);assert.equal(page.read('roundMetrics.backspace'),1);page.click('help');page.click('close-help');page.click('pause');
 const saved=store.load(page.localStorage).sessions[11];assert.equal(saved.roundMetrics.wrong,1);assert.equal(saved.roundMetrics.backspace,1);assert.equal(saved.roundMetrics.help,1);
 const reloaded=await boot({query:'?level=11',entries:Object.fromEntries(page.values)});reloaded.click('intro-next');assert.equal(reloaded.read('roundMetrics.wrong'),1);assert.match(reloaded.nodes.get('round-metrics').textContent,/错按 1 次.*退格修正 1 次.*主动提示 1 次/);
 completeStage(reloaded);reloaded.click('continue-stage');assert.equal(reloaded.read('roundMetrics.wrong'),1);assert.equal(reloaded.read('roundMetrics.help'),1);assert.equal(reloaded.read('roundMetrics.stages[1].observed'),true);
});

test('v4 pending input counts once across saved execution, and busy extras do not count',async()=>{
 const page=await boot({query:'?level=11',data:progress()});page.click('intro-next');for(let i=0;i<100&&!page.read('state.action');i++)page.tap(page.read('state.target'));const first=page.read('roundMetrics.correct');
 page.tap('Z');const recorded=plain(page.read('roundMetrics'));assert.equal(recorded.correct,first);assert.equal(recorded.wrong,0,'unsupported busy inputs are not mistakes');
 page.event('pagehide');const reloaded=await boot({query:'?level=11',entries:Object.fromEntries(page.values)});reloaded.click('intro-next');reloaded.advance(5);assert.deepEqual(plain(reloaded.read('roundMetrics')).correct,recorded.correct);
 const state=engine.create(1,1,847),queued=await boot({query:'?level=1',data:progress({1:sessionWithMetrics(state)})});queued.click('intro-next');
 const visible=queued.read('state.tasks.slice(state.step,state.visibleEnd).map(t=>t.key)');for(const key of visible)queued.tap(key);
 const count=queued.read('roundMetrics.correct');assert.equal(count,visible.length);queued.event('pagehide');
 const resumed=await boot({query:'?level=1',entries:Object.fromEntries(queued.values)});resumed.click('intro-next');resumed.advance(8);assert.equal(resumed.read('roundMetrics.correct'),count);
});

test('v4 complete-round evaluation only claims the observed final stage without help; replay resets counters',async()=>{
 const page=await boot({query:'?level=3',data:progress()});page.click('intro-next');completeStage(page);page.click('continue-stage');page.click('help');page.click('close-help');completeStage(page);page.click('continue-stage');completeStage(page);
 assert.equal(page.state().solved,true);assert.match(page.nodes.get('finish-evaluation').textContent,/第 3 段未求助完成/);assert.doesNotMatch(page.nodes.get('finish-evaluation').textContent,/掌握|指法正确|100%/);
 assert.equal(page.read('roundMetrics.help'),1);assert.equal(page.read('roundMetrics.stages[2].help'),0);const oldSeed=page.state().seed,oldAttempt=page.read('roundMetrics.attemptId');
 page.click('replay');assert.equal(page.read('roundMetrics.correct'),0);assert.equal(page.read('roundMetrics.help'),0);assert.notEqual(page.read('roundMetrics.attemptId'),oldAttempt);assert.notEqual(page.state().seed,oldSeed);assert.ok(store.load(page.localStorage).completed.includes(3));
 const state=engine.create(3,2,411),helped=await boot({query:'?level=3',data:progress({3:sessionWithMetrics(state)})});helped.click('intro-next');helped.click('help');helped.click('close-help');completeStage(helped);assert.doesNotMatch(helped.nodes.get('finish-evaluation').textContent,/未求助完成/);
});

test('missing metrics are never invented as zero, including previously saved v4 rounds',async()=>{
 const state=engine.create(3,1,31),page=await boot({query:'?level=3',data:progress({3:engine.snapshot(state)})});page.click('intro-next');page.tap(page.read('state.target'));assert.equal(page.read('roundMetrics'),null);assert.match(page.nodes.get('round-metrics').textContent,/未记录/);page.event('pagehide');assert.equal(store.load(page.localStorage).sessions[3].roundMetrics,undefined);
});

for(let level=1;level<=12;level++)test(`v4 real controller finishes, preserves round metrics and routes level ${level}`,async()=>{
 const page=await boot({query:`?level=${level}`,data:progress()});page.click('intro-next');
 for(let index=0;index<3;index++){
  completeStage(page);
  if(index<2){page.click('continue-stage');assert.equal(page.read('roundMetrics.stages[getStageInfo(state).index].observed'),true);}
 }
 assert.equal(page.state().solved,true);assert.equal(page.nodes.get('finished').open,true);
 const saved=store.load(page.localStorage).sessions[level];assert.equal(saved.version,4);assert.ok(saved.roundMetrics);assert.equal(saved.roundMetrics.correct+saved.roundMetrics.choices+saved.roundMetrics.backspace>0,true);assert.equal(saved.roundMetrics.help,0);
 assert.match(page.nodes.get('finish-evaluation').textContent,/第 3 段未求助完成/);page.click('next-level');assert.equal(page.location.href,level===12?'./':`play.html?level=${level+1}`);
});

test('active room help describes only currently available full shortcodes, including placement while picking up',async()=>{
 const state=engine.create(7,1,185),page=await boot({query:'?level=7',data:progress({7:sessionWithMetrics(state)})});page.click('intro-next');const current=plain(page.read('state.codeInput.candidates'));
 page.click('help');const detail=page.nodes.get('help-current-target').textContent;for(const choice of current)assert.ok(detail.includes(choice.code));assert.ok(page.nodes.get('finger-detail').textContent.length<350);page.click('close-help');
 const choice=current.find(c=>c.kind==='item')||current[0];for(const key of choice.code)page.tap(key);assert.equal(page.read('state.action.type'),'pick');
 const zones=plain(page.read('state.codeInput.candidates'));assert.ok(zones.every(c=>c.kind==='zone'));page.click('help');for(const zone of zones)assert.ok(page.nodes.get('help-current-target').textContent.includes(zone.code));
});

test('new late-level keys are taught in small groups before gameplay credit and are incremental',async()=>{
 const page=await boot({query:'?level=12'});page.click('intro-next');assert.equal(page.nodes.get('warmup').open,true);assert.ok(page.read('warmKeys.length')<=3);assert.match(page.nodes.get('warmup-step').textContent,/认识新键 · 1 \/ /);
 while(page.nodes.get('warmup').open)page.tap(page.read('warmKeys[warmIndex]'));
 const choice=page.read('state.choices.find(c=>!c.done).key');page.tap(choice);page.advance(5);assert.equal(page.nodes.get('warmup').open,true);assert.ok(page.read('warmKeys.length')<26);assert.equal(page.read('roundMetrics.choices'),1);assert.equal(page.read('roundMetrics.correct'),0);
 const first=page.read('warmKeys[warmIndex]');page.tap(first);assert.equal(page.read('roundMetrics.correct'),0);page.event('pagehide');const reloaded=await boot({query:'?level=12',entries:Object.fromEntries(page.values)});reloaded.click('intro-next');assert.equal(reloaded.read('roundMetrics.choices'),1);assert.ok(!reloaded.read('warmKeys').includes(first));
});

test('room pickup introduces newly exposed placement-code keys before any pending gameplay credit',async()=>{
 const state=engine.create(7,1,185),initialKeys=engine.getRequiredKeys(state),page=await boot({query:'?level=7',data:progress({7:sessionWithMetrics(state)},{practiced:[]})});page.click('intro-next');assert.equal(page.nodes.get('warmup').open,true);while(page.nodes.get('warmup').open)page.tap(page.read('warmKeys[warmIndex]'));assert.equal(page.read('roundMetrics.choices'),0);
 const item=page.read('state.codeInput.candidates[0]');for(const key of item.code)page.tap(key);
 assert.equal(page.read('state.action.type'),'pick');assert.equal(page.nodes.get('warmup').open,true);const action=page.state().action,counts=plain(page.read('roundMetrics'));page.advance(5);assert.deepEqual(page.state().action,action);
 const missing=plain(page.read('warmKeys'));assert.ok(missing.length>0);assert.ok(missing.every(key=>!initialKeys.includes(key)));
 while(page.nodes.get('warmup').open)page.tap(page.read('warmKeys[warmIndex]'));assert.deepEqual(plain(page.read('roundMetrics')),counts);
 const zone=page.read('state.codeInput.candidates[0]');for(const key of zone.code)page.tap(key);assert.equal(page.read('state.pendingCode'),zone.code);assert.equal(page.read('roundMetrics.choices'),counts.choices+zone.code.length);
 page.event('pagehide');const resumed=await boot({query:'?level=7',entries:Object.fromEntries(page.values)});resumed.click('intro-next');const queuedCount=resumed.read('roundMetrics.choices');resumed.advance(5);assert.equal(resumed.read('roundMetrics.choices'),queuedCount);
});

const visibleRound=state=>JSON.stringify({tasks:state.tasks,items:state.items,zones:state.zones,invitationParts:state.invitationParts,friends:state.friends});
for(const level of [11,12])test(`level ${level} replay always switches visible text families, while refresh keeps the exact new family`,async()=>{
 for(const oldSeed of [0,1,2,17,0xffffffff]){
  const old=engine.create(level,0,oldSeed),data=progress({[level]:sessionWithMetrics(old)},{completed:[level]}),page=await boot({query:`?level=${level}&replay=1`,data,fixedSeed:oldSeed});
  const fresh=plain(page.read('state')),families=level===11?3:2;assert.notEqual(fresh.seed,oldSeed);assert.notEqual(fresh.seed%families,oldSeed%families);assert.notEqual(visibleRound(fresh),visibleRound(old));
  const savedSeed=fresh.seed,visible=visibleRound(fresh);assert.equal(page.location.search,`?level=${level}`);
  const refreshed=await boot({query:page.location.search,entries:Object.fromEntries(page.values),fixedSeed:oldSeed});assert.equal(refreshed.state().seed,savedSeed);assert.equal(visibleRound(plain(refreshed.read('state'))),visible);
  refreshed.click('replay');const next=plain(refreshed.read('state'));assert.notEqual(next.seed,savedSeed);assert.notEqual(next.seed%families,savedSeed%families);assert.notEqual(visibleRound(next),visible);
 }
});

test('all v4 replay routes change seed even when the random draw repeats, and sampled mixed combinations visibly change',async()=>{
 for(let level=1;level<=10;level++){
  const old=engine.create(level,0,112),page=await boot({query:`?level=${level}&replay=1`,data:progress({[level]:sessionWithMetrics(old)}),fixedSeed:112});assert.notEqual(page.state().seed,112);
  if(level<=8)assert.notEqual(visibleRound(plain(page.read('state'))),visibleRound(old),`level ${level} mixed combination changes`);
  const seed=page.state().seed;page.click('replay');assert.notEqual(page.state().seed,seed);assert.equal(page.read('roundMetrics.seed'),page.state().seed);
 }
});

for(const nextLevel of [11,12])test(`next-level navigation to completed level ${nextLevel} switches its saved text family`,async()=>{
 const current=engine.create(nextLevel-1,2,21),next=engine.create(nextLevel,2,87);
 for(let guard=0;guard<500&&!next.solved;guard++){
  if(next.action){engine.tick(next,10);continue;}const key=nextTaskKey(next);assert.ok(key);engine.press(next,key);engine.tick(next,10);
 }
 assert.equal(next.solved,true);const page=await boot({query:`?level=${nextLevel-1}`,data:progress({[nextLevel-1]:sessionWithMetrics(current),[nextLevel]:sessionWithMetrics(next)},{completed:[nextLevel]})});page.click('intro-next');completeStage(page);page.click('next-level');assert.equal(page.location.href,`play.html?level=${nextLevel}&replay=1`);
 const destination=await boot({query:`?level=${nextLevel}&replay=1`,entries:Object.fromEntries(page.values),fixedSeed:next.seed}),families=nextLevel===11?3:2;
 assert.notEqual(destination.state().seed%families,next.seed%families);assert.notEqual(visibleRound(plain(destination.read('state'))),visibleRound(engine.create(nextLevel,0,next.seed)));assert.equal(destination.read('roundMetrics.correct'),0);
});
