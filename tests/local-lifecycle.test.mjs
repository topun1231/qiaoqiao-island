import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../dist/local-lifecycle.js',import.meta.url),'utf8');
const settle=async()=>{await new Promise(setImmediate);await new Promise(setImmediate);};
test('direct HTML opens show launcher instructions without making requests or touching saves',()=>{
 const body={style:{},replaceChildren(...nodes){this.children=nodes;}};
 const document={body,createElement:tag=>({tag,style:{},append(...nodes){this.children=nodes;}})};
 vm.runInNewContext(source,{location:{protocol:'file:',hostname:''},document});
 const children=body.children[0].children;
 assert.match(children[0].textContent,/敲敲岛\.exe/);
 assert.match(children[1].textContent,/完整解压/);
 assert.equal(children[3].href,'http://127.0.0.1:4173/');
 const root=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
 assert.match(root,/if\(location.protocol==='file:'\)return;/);
});
async function boot({host='127.0.0.1',supported=true,streamAPI=true,delayHead=false,capacity=false}={}){
 const events=new Map(),timers=new Map(),requests=[],streams=[];let nextTimer=0,finishHead;
 const context={location:{hostname:host,protocol:'http:',pathname:'/game/'},AbortController,
  ReadableStream:streamAPI?ReadableStream:undefined,
  addEventListener:(name,fn)=>events.set(name,fn),
  setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id),
  fetch:async(url,options)=>{
   requests.push({url,options});
   if(options.method==='HEAD'){
    if(delayHead)await new Promise(resolve=>finishHead=resolve);
    return {headers:new Map(supported?[['X-Qiaoqiao-Lifecycle','stream-v1']]:[])};
   }
   if(capacity)return {status:204,ok:true,body:null};
   let stream;
   const body=new ReadableStream({start(controller){stream=controller;streams.push(controller);}});
   options.signal.addEventListener('abort',()=>{try{stream.error(new Error('aborted'));}catch{}});
   return {ok:true,body};
  }};
 vm.runInNewContext(source,context);await settle();
 return {events,timers,requests,streams,finishHead:()=>finishHead(),runRetry:async()=>{const [id,fn]=timers.entries().next().value;timers.delete(id);fn();await settle();}};
}
test('all five game entries register launcher lifetime without affecting game modules',()=>{
 for(const file of ['index.html','game/index.html','game/play.html','fruit-challenge/index.html','chase/index.html']){
  const html=readFileSync(new URL('../dist/'+file,import.meta.url),'utf8');
  assert.equal((html.match(/src="(?:\.\/|\.\.\/)local-lifecycle\.js"/g)||[]).length,1,file);
 }
 assert.doesNotMatch(source,/localStorage|sessionStorage/);
});
test('a background or paused page keeps its connection without input or timer heartbeats',async()=>{
 const q=await boot();assert.equal(q.streams.length,1);assert.equal(q.timers.size,0);
 assert.equal(q.events.has('visibilitychange'),false);assert.equal(q.events.has('blur'),false);
 assert.equal(q.requests[1].options.signal.aborted,false);
 q.events.get('pagehide')({persisted:false});await settle();
 assert.equal(q.requests[1].options.signal.aborted,true);assert.equal(q.timers.size,0);
});
test('back-forward cache return reconnects once and ignores the previous aborted request',async()=>{
 const q=await boot();q.events.get('pagehide')({persisted:true});q.events.get('pageshow')({persisted:true});await settle();
 assert.equal(q.streams.length,2);assert.equal(q.timers.size,0);
 assert.equal(q.requests[3].options.signal.aborted,false);
 q.events.get('pagehide')({});await settle();
});
test('closing while capability detection is pending never opens a late connection',async()=>{
 const q=await boot({delayHead:true});q.events.get('pagehide')({});q.finishHead();await settle();
 assert.equal(q.streams.length,0);assert.equal(q.timers.size,0);
});
test('unexpected connection loss retries but closing the page cancels retry',async()=>{
 const q=await boot();q.streams[0].close();await settle();assert.equal(q.timers.size,1);
 await q.runRetry();assert.equal(q.streams.length,2);
 q.streams[1].error(new Error('network'));await settle();assert.equal(q.timers.size,1);
 q.events.get('pagehide')({});await settle();assert.equal(q.timers.size,0);
});
test('other hosts, ordinary servers and browsers without streaming keep their previous behavior',async()=>{
 const remote=await boot({host:'example.com'});assert.equal(remote.requests.length,0);
 const old=await boot({supported:false});assert.equal(old.requests.length,1);assert.equal(old.timers.size,0);
 const browser=await boot({streamAPI:false});assert.equal(browser.requests.length,0);
});
test('launcher capacity fallback does not retry or prevent the game from loading',async()=>{
 const q=await boot({capacity:true});assert.equal(q.requests.length,2);assert.equal(q.streams.length,0);assert.equal(q.timers.size,0);
});
