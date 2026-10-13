import test from 'node:test';
import assert from 'node:assert/strict';
import {createFeedback,SOUND_KEY} from '../dist/game/feedback.js';
function environment(raw=null,denied=false){
 const saved=new Map(raw===null?[]:[[SOUND_KEY,raw]]),events=new Map(),oscillators=[],contexts=[];
 const globals=['localStorage','AudioContext','window','document','matchMedia'],old=Object.fromEntries(globals.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const param=()=>({setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
 class Audio{
  constructor(){this.currentTime=0;this.state='running';contexts.push(this);}
  createGain(){return{gain:param(),connect(){},disconnect(){}};}
  createOscillator(){const o={frequency:param(),connect(){},disconnect(){},start(){o.started=true;},stop(){o.stopped=true;}};oscillators.push(o);return o;}
 }
 const storage={getItem:k=>{if(denied)throw Error('denied');return saved.get(k)??null;},setItem:(k,v)=>{if(denied)throw Error('denied');saved.set(k,v);}};
 const document={hidden:false,addEventListener:(name,fn)=>events.set(name,fn)};
 for(const [key,value] of Object.entries({localStorage:storage,AudioContext:Audio,window:{addEventListener:(name,fn)=>events.set(name,fn)},document,matchMedia:()=>({matches:false})}))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 const button=()=>({textContent:'',attrs:{},setAttribute(k,v){this.attrs[k]=v;}});
 return{saved,events,oscillators,contexts,document,button,restore(){for(const k of globals)if(old[k])Object.defineProperty(globalThis,k,old[k]);else delete globalThis[k];}};
}
test('sound is gesture-gated, rate-limited, muteable from either control, and stored separately',()=>{
 const e=environment();try{
  let focused=0;e.document.getElementById=()=>({focus(){focused++;}});
  const a=e.button(),b=e.button();b.closest=()=>({});const f=createFeedback([a,b]);f.play('complete');assert.equal(e.contexts.length,0);
  f.unlock();f.play();assert.equal(e.oscillators.length,1);f.play();assert.equal(e.oscillators.length,1);
  a.onclick();assert.equal(a.textContent,'声音 关');assert.equal(b.textContent,'声音 关');assert.equal(e.oscillators[0].stopped,true);
  f.play();assert.equal(e.oscillators.length,1);assert.deepEqual([...e.saved.keys()],[SOUND_KEY]);
  e.contexts[0].currentTime=1;b.onclick();assert.equal(a.attrs['aria-pressed'],'true');assert.equal(e.oscillators.length,2);assert.equal(focused,1);
 }finally{e.restore();}
});
test('saved mute survives re-entry, denied storage does not break controls, and missing audio is safe',()=>{
 const e=environment('off',true);try{
  const button=e.button(),f=createFeedback(button);button.onclick();assert.equal(button.textContent,'声音 关');
  delete globalThis.AudioContext;button.onclick();assert.doesNotThrow(()=>{f.unlock();f.play();});
 }finally{e.restore();}
 const m=environment('off');try{const f=createFeedback(m.button());f.unlock();f.play();assert.equal(m.contexts.length,0);}finally{m.restore();}
});
test('celebration notes stop on blur, remote mute updates all controls, reduced motion skips pulses',()=>{
 const e=environment();try{
  const b=e.button(),f=createFeedback(b);f.unlock();f.play('complete');assert.equal(e.oscillators.length,3);
  e.events.get('blur')();assert.ok(e.oscillators.every(o=>o.stopped));
  e.saved.set(SOUND_KEY,'off');e.events.get('storage')({key:SOUND_KEY});assert.equal(b.attrs['aria-pressed'],'false');
  let animations=0;const n={animate(){animations++;},getAnimations:()=>[]};f.pulse(n);assert.equal(animations,1);
  globalThis.matchMedia=()=>({matches:true});f.pulse(n);assert.equal(animations,1);
 }finally{e.restore();}
});
