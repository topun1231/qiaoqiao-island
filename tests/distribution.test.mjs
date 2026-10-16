import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../dist/',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');

test('distribution contains only formal modes and all local imports and HTML assets resolve',()=>{
 assert.deepEqual(readdirSync(root,{withFileTypes:true}).filter(p=>p.isDirectory()).map(p=>p.name).sort(),['chase','fruit-challenge','game','vendor']);
 function scan(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){
  const url=new URL(entry.name+(entry.isDirectory()?'/':''),dir);
  if(entry.isDirectory()){scan(url);continue;}
  if(!/\.(js|html|css)$/.test(entry.name))continue;
  const source=readFileSync(url,'utf8');
  for(const pattern of [/(?:from\s*|import\s*\()['"](\.\.?\/[^'"]+)['"]/g,/(?:src|href)=["']([^"']+)["']/g]){
   for(const [,ref] of source.matchAll(pattern)){
    if(/^(?:data:|https?:|#)/.test(ref)||ref.includes('${'))continue;
    const target=new URL(ref,url);target.search='';target.hash='';
    assert.ok(existsSync(target),`${url.pathname}: ${ref}`);
   }
  }
 }}
 scan(root);
 assert.match(read('index.html'),/location\.replace\('\.\/game\//);
 assert.match(read('game/store.js'),/qiaoqiao-island-challenge-test-v1/);
 assert.match(read('fruit-challenge/records.js'),/qiaoqiao-island-fruit-records-v1/);
 assert.match(read('game/feedback.js'),/qiaoqiao-island-sound-v1/);
});

test('entry removes only retired registrations and caches, preserving saves and unrelated apps',async()=>{
 const unregistered=[],deleted=[];let destination;
 const scopes=['/','/v8/','/preview/','/another-app/'];
 const caches={keys:async()=>['qiaoqiao-island-four-2','qiaoqiao-variety-preview-5','another-app'],delete:async key=>deleted.push(key)};
 const source=read('index.html').match(/<script>([\s\S]*?)<\/script>/)[1];
 await vm.runInNewContext(source,{URL,window:{caches},caches,navigator:{serviceWorker:{getRegistrations:async()=>scopes.map(path=>({scope:'http://127.0.0.1:4173'+path,unregister:async()=>unregistered.push(path)}))}},location:{search:'?continue=1',hash:'#map',replace:url=>destination=url}});
 assert.deepEqual(unregistered,['/','/v8/','/preview/']);
 assert.deepEqual(deleted,['qiaoqiao-island-four-2','qiaoqiao-variety-preview-5']);
 assert.equal(destination,'./game/?continue=1#map');
 assert.doesNotMatch(source,/localStorage|sessionStorage/);
});

test('retirement worker does not serve old pages and unregisters without touching unrelated caches',async()=>{
 const events=new Map(),deleted=[];let unregistered=0,skipped=0;
 vm.runInNewContext(read('sw.js'),{self:{addEventListener:(name,fn)=>events.set(name,fn),skipWaiting:async()=>skipped++,registration:{unregister:async()=>unregistered++}},caches:{keys:async()=>['qiaoqiao-island-four-1','qiaoqiao-variety-preview-5','other'],delete:async key=>deleted.push(key)}});
 let pending;const event={waitUntil:p=>pending=p};
 events.get('install')(event);await pending;events.get('activate')(event);await pending;
 assert.equal(skipped,1);assert.equal(unregistered,1);assert.equal(events.has('fetch'),false);
 assert.deepEqual(deleted,['qiaoqiao-island-four-1','qiaoqiao-variety-preview-5']);
});
