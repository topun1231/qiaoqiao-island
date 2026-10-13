import test from 'node:test';
import assert from 'node:assert/strict';
import {STORAGE_KEY,BACKUP_KEY,load,save,validate} from '../dist/preview/store.js';
const old=JSON.stringify({version:1,completed:[1,7],practiced:['F','J'],sessions:{7:{version:2,state:{level:7,accepted:['Q','W']}}},updated:123});
function memory(){const values=new Map([[STORAGE_KEY,old],['typing-island-progress-v1','untouched']]);return {values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};}
test('experience update backs up exact old preview bytes once without touching original data',()=>{const s=memory(),d=load(s);assert.equal(s.values.get(BACKUP_KEY),old);d.sessions[7]={version:3,state:{level:7}};assert.equal(save(d,s),true);assert.deepEqual(load(s).completed,[1,7]);assert.equal(s.values.get(BACKUP_KEY),old);assert.equal(s.values.get('typing-island-progress-v1'),'untouched');});
test('failed required backup blocks overwrite rather than losing old snapshot',()=>{const s=memory(),set=s.setItem;s.setItem=(k,v)=>{if(k===BACKUP_KEY)throw Error('quota');set(k,v);};const d=load(s);d.sessions={};assert.equal(save(d,s),false);assert.equal(s.values.get(STORAGE_KEY),old);});
test('session envelope accepts all supported versions and no arbitrary version',()=>{const d=validate({version:1,sessions:{1:{version:1,state:{level:1}},2:{version:2,state:{level:2}},3:{version:3,state:{level:3}},4:{version:99,state:{level:4}}}});assert.deepEqual(Object.keys(d.sessions),['1','2','3']);});
