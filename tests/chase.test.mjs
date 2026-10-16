import test from 'node:test';
import assert from 'node:assert/strict';
import {create,start,pause,tick,press,SPEEDS,FINISH} from '../dist/chase/engine.js';
test('ready and paused phases freeze both characters and input',()=>{const s=create(1);tick(s,10);assert.equal(s.time,0);assert.equal(press(s,s.queue[0]),'ignored');start(s);tick(s,1);pause(s);const before=JSON.stringify(s);tick(s,10);press(s,s.queue[0]);assert.equal(JSON.stringify(s),before);start(s);tick(s,1);assert.equal(s.time,2);});
test('every 26 letters includes every letter; stream continues over bag boundaries',()=>{const s=create(4);start(s);s.thief=10000;const typed=[];for(let i=0;i<260;i++){typed.push(s.queue[0]);press(s,s.queue[0]);}for(let i=0;i<260;i+=26)assert.equal(new Set(typed.slice(i,i+26)).size,26);assert.equal(s.correct,260);assert.ok(s.queue.length>=10);assert.equal(s.history.length,3);});
test('wrong keys stay on current letter and reset acceleration without deleting progress',()=>{const s=create(8);start(s);press(s,s.queue[0]);const position=s.police,queue=[...s.queue];assert.equal(press(s,s.queue[0]==='X'?'Y':'X'),'wrong');assert.deepEqual(s.queue,queue);assert.equal(s.police,position);assert.equal(s.combo,0);assert.equal(s.correct,1);assert.equal(s.wrong,1);press(s,s.queue[0].toLowerCase());assert.equal(s.correct,2);});
test('special keys and invalid difficulty are safe',()=>{const s=create(2,'__proto__');assert.equal(s.difficulty,'normal');start(s);for(const key of ['Enter','Backspace',' ',null,'中'])assert.equal(press(s,key),'ignored');assert.equal(s.wrong,0);});
test('idle breaks streak; gain is capped',()=>{const s=create(2);s.thief=10000;start(s);for(let i=0;i<25;i++)press(s,s.queue[0]);const before=s.police;press(s,s.queue[0]);assert.ok(Math.abs(s.police-before-1.425)<1e-9);s.thief=18;tick(s,2.1);assert.equal(s.combo,0);});
test('capture freezes progress and input',()=>{const s=create(1);start(s);while(s.phase==='running')press(s,s.queue[0]);assert.equal(s.phase,'won');const before=JSON.stringify(s);tick(s,20);press(s,s.queue[0]);assert.equal(JSON.stringify(s),before);});
test('arrival loses exactly at hideout; delayed frames cannot postpone defeat',()=>{const s=create(9);start(s);tick(s,10000);assert.equal(s.phase,'lost');assert.equal(s.thief,FINISH);assert.ok(Math.abs(s.time-102/1.4)<1e-8);assert.equal(press(s,s.queue[0]),'ignored');});
test('invalid tick durations do not corrupt state',()=>{const s=create(1);start(s);for(const dt of [-1,NaN,Infinity,0])tick(s,dt);assert.equal(s.time,0);});
function play(difficulty,cpm){const s=create(63,difficulty);start(s);while(s.phase==='running'){tick(s,60/cpm);press(s,s.queue[0]);}return s;}
for(const [difficulty,cpm] of [['easy',55],['normal',85],['hard',120]]){
 test(`${difficulty}: ${cpm} correct letters/min can win`,()=>{const s=play(difficulty,cpm);assert.equal(s.phase,'won');console.log(JSON.stringify({difficulty,cpm,seconds:+s.time.toFixed(1),correct:s.correct}));});
 test(`${difficulty}: typing well below required pace loses`,()=>assert.equal(play(difficulty,20).phase,'lost'));
}
test('difficulty strictly increases thief speed',()=>assert.ok(SPEEDS.easy.speed<SPEEDS.normal.speed&&SPEEDS.normal.speed<SPEEDS.hard.speed));
