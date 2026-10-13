import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('formal game retains approved gameplay and storage code byte-for-byte',()=>{
 for(const file of readdirSync(new URL('../dist/challenge-test/',import.meta.url)).filter(f=>f.endsWith('.js')&&!['play.js','map.js','task-guide.js'].includes(f))){
  assert.equal(read('dist/game/'+file),read('dist/challenge-test/'+file),file);
 }

});
test('default entry launches formal game and preserves preview assets',()=>{
 assert.match(read('dist/index.html'),/location\.replace\('\.\/game\//);
 assert.match(read('dist/game/play.html'),/正式版 · 自动保存进度/);
 assert.doesNotMatch(read('dist/game/index.html'),/第4—8关待实测|部分验收新版测试/);
 const manifest=JSON.parse(read('tests/promotion-preview-manifest.json'));
 for(const [file,hash] of Object.entries(manifest))assert.equal(createHash('sha256').update(readFileSync(new URL('../'+file,import.meta.url))).digest('hex'),hash,file);
});
test('formal local imports resolve and archived v8 has its original storage namespace',()=>{
 for(const f of readdirSync(new URL('../dist/game/',import.meta.url)).filter(f=>f.endsWith('.js'))){
  for(const match of read('dist/game/'+f).matchAll(/(?:from\s*|import\s*\()['"](\.\.?\/[^'"]+)['"]/g))assert.ok(existsSync(new URL(match[1],new URL('../dist/game/'+f,import.meta.url))),`${f}: ${match[1]}`);
 }
 assert.equal(read('dist/v8/adventure.js'),read('dist/adventure.js'));
 assert.equal(read('dist/v8/journey-store.js'),read('dist/journey-store.js'));
});
test('updated root worker never replaces new game navigations with cached v8 HTML',()=>{
 const handlers=new Map();let intercepted=false;
 vm.runInNewContext(read('dist/sw.js'),{URL,self:{location:new URL('https://example.test/sw.js'),addEventListener:(n,f)=>handlers.set(n,f)}});
 for(const path of ['/game/','/game/play.html?level=2','/challenge-test/play.html?level=2']){
  intercepted=false;handlers.get('fetch')({request:{method:'GET',url:'https://example.test'+path,mode:'navigate'},respondWith(){intercepted=true;}});
  assert.equal(intercepted,false,path);
 }
});
