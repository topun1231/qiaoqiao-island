import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as records from '../dist/fruit-combo-test/records.js';
import * as engine from '../dist/fruit-combo-test/engine.js';

// Real controller and engine, with a controlled clock and renderer stub.
function boot({rendererFailure=false}={}){
 const nodes=new Map(),events=new Map(),docEvents=new Map(),canvasEvents=new Map();
 let now=0,frame,renders=0;
 const options=['easy','normal','hard'].map(value=>({value}));
 const disk=new Map(),localStorage={getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v)};
 const canvas={addEventListener:(name,fn)=>canvasEvents.set(name,fn)};
 const html=readFileSync(new URL('../dist/fruit-combo-test/index.html',import.meta.url),'utf8');
 for(const [,id] of html.matchAll(/\bid="([^"]+)"/g))nodes.set(id,{
  open:false,disabled:false,dataset:{},textContent:'',setAttribute(){},focus(){},
  showModal(){this.open=true;},close(){this.open=false;},addEventListener(){},querySelector:()=>canvas
 });
 const document={hidden:false,querySelectorAll:()=>options,getElementById:id=>nodes.get(id),querySelector:()=>({dataset:{}}),addEventListener:(name,fn)=>docEvents.set(name,fn)};
 const context=vm.createContext({...engine,...records,localStorage,document,window:{addEventListener:(name,fn)=>events.set(name,fn)},
  performance:{now:()=>now},crypto:{getRandomValues:a=>{a[0]=314;return a;}},console:{error(){}},
  requestAnimationFrame:fn=>{frame=fn;},createOrchardWorld:()=>{if(rendererFailure)throw Error('no WebGL');return{update(){renders++;}};}
 });
 vm.runInContext(readFileSync(new URL('../dist/fruit-combo-test/main.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,''),context);
 const emit=(handlers,name,options={})=>{const e={defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...options};handlers.get(name)?.(e);return e;};
 return{nodes,document,disk,choose(speed){const input=options.find(o=>o.value===speed);if(!input.disabled)input.onchange();},read:expr=>vm.runInContext(expr,context),renders:()=>renders,
  click:id=>{if(!nodes.get(id).disabled)nodes.get(id).onclick();},
  event:(name,options)=>emit(events,name,options),canvasEvent:name=>emit(canvasEvents,name),
  visibility:hidden=>{document.hidden=hidden;docEvents.get('visibilitychange')();},
  advance(seconds){const end=now+seconds*1000;while(now<end){now=Math.min(end,now+20);frame(now);}}
 };
}

test('IME key events without compositionstart freeze the fruit and do not consume native IME Escape',()=>{
 for(const options of [{key:'Process',keyCode:229},{key:'Escape',isComposing:true}]){
  const p=boot();p.click('resume');p.advance(.5);const age=p.read('state.fallAge');
  assert.equal(p.event('keydown',options).defaultPrevented,false);p.advance(4);
  assert.equal(p.read('state.fallAge'),age);assert.equal(p.read('state.missed'),0);
  assert.equal(p.nodes.get('break-dialog').open,true);assert.match(p.nodes.get('break-copy').textContent,/英文输入/);
  p.click('resume');assert.equal(p.read('state.paused'),false);
 }
});

test('cancelled composition without compositionend cannot latch the resume button',()=>{
 const p=boot();p.click('resume');p.event('compositionstart');p.event('blur');p.click('resume');
 const key=p.read('state.target');p.event('keydown',{key,code:'Key'+key});
 assert.equal(p.read('state.caught'),1);assert.equal(p.nodes.get('break-dialog').open,false);
});

test('context loss freezes both initial and active sessions until recovery and manual resume',()=>{
 for(const active of [false,true]){
  const p=boot();if(active){p.click('resume');p.advance(.8);}
  const age=p.read('state.fallAge');assert.equal(p.canvasEvent('webglcontextlost').defaultPrevented,true);
  p.click('resume');p.advance(4);p.event('blur');
  assert.equal(p.read('state.fallAge'),age);assert.equal(p.read('state.missed'),0);
  assert.equal(p.nodes.get('resume').disabled,true);assert.match(p.nodes.get('break-copy').textContent,/画面暂时中断/);
  p.canvasEvent('webglcontextrestored');p.advance(4);
  assert.equal(p.read('state.fallAge'),age);assert.equal(p.nodes.get('resume').disabled,false);
  p.click('resume');p.advance(.2);assert.ok(p.read('state.fallAge')>age);
 }
});

test('paused frames stop renderer updates while resume continues the same fruit',()=>{
 const p=boot(),initial=p.renders();p.advance(3);assert.equal(p.renders(),initial);
 p.click('resume');p.advance(.5);assert.ok(p.renders()>initial);const age=p.read('state.fallAge');
 p.click('pause');const paused=p.renders();p.advance(3);assert.equal(p.renders(),paused);
 p.click('resume');p.advance(.1);assert.ok(p.renders()>paused);assert.ok(p.read('state.fallAge')>age);
});

test('held keys, modifiers and pause recovery do not create extra catches or mistakes',()=>{
 const p=boot();p.click('resume');const key=p.read('state.target'),code='Key'+key;
 for(const modifier of ['ctrlKey','altKey','metaKey'])p.event('keydown',{key:'Z',code:'KeyZ',[modifier]:true});
 p.event('keydown',{key,code});p.event('keydown',{key,code,repeat:true});p.advance(.6);
 p.event('keydown',{key,code});assert.equal(p.read('state.caught'),1);assert.equal(p.read('state.wrong'),0);
 p.visibility(true);p.advance(3);assert.equal(p.read('state.missed'),0);p.visibility(false);p.click('resume');
 const next=p.read('state.target');p.event('keydown',{key:next,code:'Key'+next});assert.equal(p.read('state.caught'),2);
});

test('renderer initialization failure leaves the session stopped and exposes return-to-map help',()=>{
 const p=boot({rendererFailure:true});p.advance(4);p.click('resume');
 assert.equal(p.read('state.paused'),true);assert.equal(p.nodes.get('render-error').hidden,false);
 assert.equal(p.nodes.get('pause').disabled,true);assert.equal(p.read('state.missed'),0);
});

test('speed selection stays paused; cancellation preserves streak and commit resets only current game',()=>{
 const p=boot();p.click('resume');let key=p.read('state.target');p.event('keydown',{key});p.advance(.6);
 p.click('speed');p.choose('hard');p.advance(4);
 assert.equal(p.read('state.speed'),'normal');assert.equal(p.read('state.streak'),1);
 assert.equal(p.nodes.get('resume').textContent,'换速并重新开始');
 p.click('cancel-speed');assert.equal(p.read('state.speed'),'normal');assert.equal(p.read('state.streak'),1);
 p.click('pause');p.choose('easy');p.click('resume');
 assert.equal(p.read('state.speed'),'easy');assert.equal(p.read('state.caught'),0);assert.equal(p.read('state.streak'),0);
 assert.equal(p.read('records.best("normal")'),1);assert.equal(p.nodes.get('best').textContent,0);
});
test('initial speed choice starts clean and context loss blocks both change and cancellation',()=>{
 const p=boot();p.choose('hard');p.click('resume');assert.equal(p.read('state.fallSeconds'),1.8);
 const key=p.read('state.target');p.event('keydown',{key});p.click('pause');p.choose('easy');
 p.canvasEvent('webglcontextlost');p.click('resume');p.click('cancel-speed');
 assert.equal(p.read('state.speed'),'hard');assert.equal(p.read('state.streak'),1);
 assert.equal(p.nodes.get('cancel-speed').disabled,true);
 p.canvasEvent('webglcontextrestored');assert.equal(p.read('state.paused'),true);p.click('cancel-speed');
 assert.equal(p.read('state.speed'),'hard');assert.equal(p.read('state.streak'),1);
});
test('new records are persisted on the catch before the animation completes',()=>{
 const p=boot();p.click('resume');p.event('keydown',{key:p.read('state.target')});
 assert.equal(JSON.parse(p.disk.get(records.RECORD_KEY)).normal,1);
 assert.equal(p.read('state.phase'),'catch');assert.match(p.nodes.get('feedback').textContent,/新纪录/);
});
