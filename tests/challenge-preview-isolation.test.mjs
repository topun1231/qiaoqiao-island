import test from 'node:test';import assert from 'node:assert/strict';import{STORAGE_KEY,BACKUP_KEY,V3_BACKUP_KEY,blank,validate,load,save,recordKeys}from'../dist/challenge-test/store.js';
test('challenge progress and backups use a distinct namespace and leave preview records untouched',()=>{
 const oldKeys=['typing-island-main-catch-v2','typing-island-progress-v1','qiaoqiao-island-variety-preview-v1','qiaoqiao-island-variety-preview-before-experience-v3','qiaoqiao-island-variety-preview-before-independent-v4'];
 const oldRecords=new Map(oldKeys.map(key=>[key,JSON.stringify({version:1,completed:[1,2],practiced:['F','J'],sessions:{},updated:1})]));
 const values=new Map(oldRecords),calls=[];
 const storage={getItem(key){calls.push(key);return values.get(key)??null;},setItem(key,value){calls.push(key);values.set(key,value);}};
 for(const key of [STORAGE_KEY,BACKUP_KEY,V3_BACKUP_KEY])assert.match(key,/^qiaoqiao-island-challenge-test-/);
 assert.equal(new Set([STORAGE_KEY,BACKUP_KEY,V3_BACKUP_KEY]).size,3);
 const fresh=load(storage);assert.deepEqual(fresh,blank());assert.equal(save(fresh,storage),true);
 const legacy=JSON.stringify({version:1,completed:[7],practiced:['F'],sessions:{7:{version:2,state:{level:7}}},updated:2});
 values.set(STORAGE_KEY,legacy);const data=load(storage);assert.equal(save(data,storage),true);
 assert.equal(values.get(BACKUP_KEY),legacy);assert.equal(values.get(V3_BACKUP_KEY),legacy);
 assert.ok(calls.every(key=>key.startsWith('qiaoqiao-island-challenge-test-')));
 for(const [key,value]of oldRecords)assert.equal(values.get(key),value,key);
});
test('preview storage never reads or changes original records',()=>{const calls=[];const values=new Map([['typing-island-main-catch-v2','original-catch'],['typing-island-progress-v1','original-main']]);const storage={getItem(k){calls.push(k);return values.get(k);},setItem(k,v){calls.push(k);values.set(k,v);}};const d=load(storage);recordKeys(d,['F','F','J','Space']);save(d,storage);assert.equal(values.get('typing-island-main-catch-v2'),'original-catch');assert.equal(values.get('typing-island-progress-v1'),'original-main');assert.deepEqual([...new Set(calls)],[STORAGE_KEY]);assert.deepEqual(load(storage).practiced,['F','J','Space']);});
test('corrupt preview progress recovers without inventing mastery',()=>{assert.deepEqual(validate(null),blank());assert.deepEqual(validate({version:1,completed:[0,1,1,12,13],practiced:['A','A','Z','invalid','Space']}).completed,[1,12]);assert.deepEqual(validate({version:1,practiced:['A','A','Z','invalid','Space']}).practiced,['A','Z','Space']);});
test('failed save reports false without deleting any data',()=>{assert.equal(save(blank(),{setItem(){throw Error('quota');}}),false);});

test('a failed initial read cannot overwrite an existing challenge save after storage recovers',()=>{
 const original=JSON.stringify({...blank(),completed:[3,8],practiced:['F','J','V'],updated:123});
 const values=new Map([[STORAGE_KEY,original]]);let readFails=true,writes=0;
 const storage={getItem(key){if(readFails)throw Error('SecurityError');return values.get(key)??null;},setItem(key,value){writes++;values.set(key,value);}};
 const uncertain=load(storage);assert.deepEqual(uncertain,blank());readFails=false;
 recordKeys(uncertain,['A']);assert.equal(save(uncertain,storage),false);
 assert.equal(writes,0);assert.equal(values.get(STORAGE_KEY),original);
 const recovered=load(storage);assert.deepEqual(recovered.completed,[3,8]);
 recordKeys(recovered,['A']);assert.equal(save(recovered,storage),true);
 assert.deepEqual(load(storage).completed,[3,8]);assert.deepEqual(load(storage).practiced,['F','J','V','A']);
});

test('an unreadable current baseline cannot authorize a write over another tab',()=>{
 const values=new Map([[STORAGE_KEY,JSON.stringify({...blank(),completed:[3]})]]);let readFails=false,writes=0;
 const storage={getItem(key){if(readFails)throw Error('SecurityError');return values.get(key)??null;},setItem(key,value){writes++;values.set(key,value);}};
 const data=load(storage),remote=JSON.stringify({...blank(),completed:[3,8]});
 values.set(STORAGE_KEY,remote);readFails=true;recordKeys(data,['F']);
 assert.equal(save(data,storage),false);assert.equal(writes,0);assert.equal(values.get(STORAGE_KEY),remote);
 readFails=false;assert.equal(save(data,storage),false);assert.equal(values.get(STORAGE_KEY),remote);
});
