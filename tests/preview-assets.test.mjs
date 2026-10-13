import vm from 'node:vm';
import test from'node:test';import assert from'node:assert/strict';import{readFileSync,readdirSync,existsSync}from'node:fs';import{resolve,dirname}from'node:path';import{fileURLToPath}from'node:url';
const dir=fileURLToPath(new URL('../dist/preview/',import.meta.url));
test('every preview module import resolves to a bundled local file',()=>{for(const f of readdirSync(dir).filter(n=>n.endsWith('.js'))){const source=readFileSync(resolve(dir,f),'utf8');for(const m of source.matchAll(/(?:from\s*|import\s*\()['"](\.\.?\/[^'"]+)['"]/g)){assert.ok(existsSync(resolve(dir,m[1])),f+' imports '+m[1]);}assert.ok(!/https?:\/\/(?:unpkg|cdn|esm\.sh)/.test(source));}});
test('preview worker cache is isolated and all precached files exist',()=>{const source=readFileSync(resolve(dir,'sw.js'),'utf8'),files=JSON.parse(source.match(/const FILES=(\[[^;]+\]);/)[1]);for(const f of files)assert.ok(existsSync(resolve(dir,f)),f);assert.match(source,/qiaoqiao-variety-preview-/);assert.doesNotMatch(source,/startsWith\('qiaoqiao-island-/);assert.ok(files.includes('./engine.js'));assert.ok(files.includes('./play.html'));});


function workerHarness({offline=false,failPut=false}={}){
 const source=readFileSync(resolve(dir,'sw.js'),'utf8'),events=new Map(),calls=[],opened=[],deleted=[],cached=new Map();let skipped=0,claimed=0;
 const response=value=>({ok:true,redirected:false,value,clone(){return response(value);}});
 const cache={async put(request,value){if(failPut)throw Error('quota');cached.set(typeof request==='string'?request:request.url,value);},async match(request,options){calls.push({fallback:request.url,options});return cached.get(request.url)||cached.get(new URL(request.url).pathname);}};
 const context=vm.createContext({URL,Error,self:{location:new URL('https://typing.example/preview/sw.js'),addEventListener:(name,fn)=>events.set(name,fn),skipWaiting:async()=>{skipped++;},clients:{claim:async()=>{claimed++;}}},caches:{open:async name=>{opened.push(name);return cache;},keys:async()=>['qiaoqiao-island-four-2','qiaoqiao-variety-preview-1','qiaoqiao-variety-preview-2','qiaoqiao-variety-preview-3','qiaoqiao-variety-preview-4','other-app'],delete:async name=>{deleted.push(name);}},fetch:async(request,options)=>{calls.push({request,options});if(offline)throw Error('offline');return response('latest');}});
 vm.runInContext(source,context);
 return {events,calls,opened,deleted,cached,response,skipped:()=>skipped,claimed:()=>claimed,
  async lifecycle(name){let work;events.get(name)({waitUntil:promise=>{work=promise;}});await work;},
  async fetch(url,method='GET'){let work;events.get('fetch')({request:{url,method},respondWith:promise=>{work=promise;}});return work;},
 };
}

test('preview worker v5 bypasses stale HTTP-cache entries for navigation and dynamic modules',async()=>{
 const worker=workerHarness();
 for(const file of ['play.html?level=3','play.js','engine.js','river-world.js']){
  const url=`https://typing.example/preview/${file}`;worker.cached.set(url,worker.response('stale'));const result=await worker.fetch(url);assert.equal(result.value,'latest');assert.equal(worker.cached.get(url).value,'latest');
 }
 assert.ok(worker.calls.every(call=>call.options.cache==='reload'));assert.ok(worker.opened.every(name=>name==='qiaoqiao-variety-preview-5'));
 assert.equal(await worker.fetch('https://elsewhere.example/preview/engine.js'),undefined);assert.equal(await worker.fetch('https://typing.example/preview/progress','POST'),undefined);
});

test('preview update precaches fresh assets and deletes only older preview caches',async()=>{
 const worker=workerHarness();await worker.lifecycle('install');assert.ok(worker.calls.length>20);assert.ok(worker.calls.every(call=>call.options.cache==='reload'));assert.equal(worker.skipped(),1);
 await worker.lifecycle('activate');assert.deepEqual(worker.deleted,['qiaoqiao-variety-preview-1','qiaoqiao-variety-preview-2','qiaoqiao-variety-preview-3','qiaoqiao-variety-preview-4']);assert.equal(worker.claimed(),1);assert.ok(worker.opened.every(name=>name==='qiaoqiao-variety-preview-5'));
});

test('preview offline fallback reads only its current cache and ignores navigation query strings',async()=>{
 const worker=workerHarness({offline:true}),url='https://typing.example/preview/play.html?level=8';worker.cached.set('/preview/play.html',worker.response('current-offline'));const result=await worker.fetch(url);assert.equal(result.value,'current-offline');assert.deepEqual(worker.opened,['qiaoqiao-variety-preview-5']);assert.equal(worker.calls.at(-1).options.ignoreSearch,true);
});

test('offline-cache quota failures never discard successfully fetched latest preview code',async()=>{
 const worker=workerHarness({failPut:true}),url='https://typing.example/preview/river-world.js';worker.cached.set(url,worker.response('stale'));assert.equal((await worker.fetch(url)).value,'latest');assert.equal(worker.calls.some(call=>call.fallback),false);
});
