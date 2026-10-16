export const SPEEDS = Object.freeze({easy:{label:'入门',speed:.85},normal:{label:'标准',speed:1.4},hard:{label:'高手',speed:2.05}});
export const FINISH = 120, CATCH = 1.6;
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function refill(s){
 const bag=[...alphabet];
 for(let i=25;i>0;i--){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;const j=Math.floor(s.seed/4294967296*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
 s.queue.push(...bag);
}
export function create(seed=Date.now(),difficulty='normal'){
 if(!Object.hasOwn(SPEEDS,difficulty))difficulty='normal';
 const s={difficulty,seed:seed>>>0,phase:'ready',police:0,thief:18,time:0,correct:0,wrong:0,combo:0,best:0,lastHit:null,queue:[],history:[]};
 refill(s);return s;
}
export function start(s){if(s.phase==='ready'||s.phase==='paused')s.phase='running';}
export function pause(s){if(s.phase==='running')s.phase='paused';}
export function tick(s,dt){
 if(s.phase!=='running'||!Number.isFinite(dt)||dt<=0)return;
 const elapsed=Math.min(dt,(FINISH-s.thief)/SPEEDS[s.difficulty].speed);
 s.time+=elapsed;s.thief=Math.min(FINISH,s.thief+elapsed*SPEEDS[s.difficulty].speed);
 if(s.lastHit!==null&&s.time-s.lastHit>2)s.combo=0;
 if(s.thief>=FINISH-1e-9)s.phase='lost';
}
export function press(s,key){
 if(s.phase!=='running'||typeof key!=='string'||!/^[a-z]$/i.test(key))return 'ignored';
 if(key.toUpperCase()!==s.queue[0]){s.wrong++;s.combo=0;return 'wrong';}
 const hit=s.queue.shift();s.history.push(hit);if(s.history.length>3)s.history.shift();
 if(s.queue.length<10)refill(s);
 s.correct++;s.combo++;s.best=Math.max(s.best,s.combo);s.lastHit=s.time;
 s.police+=.95*(1+Math.min(20,s.combo)*.025);
 if(s.thief-s.police<=CATCH){s.police=s.thief-CATCH;s.phase='won';}
 return s.phase==='won'?'won':'hit';
}
