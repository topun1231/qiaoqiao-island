export const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const FALL_SECONDS=2.5;
export const SPEEDS=Object.freeze({easy:{label:'轻松',seconds:3.5},normal:{label:'进阶',seconds:2.5},hard:{label:'挑战',seconds:1.8}});
export const CATCH_SECONDS=.48;
const MISS_SECONDS=.22;

function random(state){
 let x=state.seed;x^=x<<13;x^=x>>>17;x^=x<<5;state.seed=x>>>0;return state.seed/4294967296;
}
function nextFruit(state){
 const previous=state.target;
 if(state.cursor>=state.bag.length){
  state.bag=[...ALPHABET];
  for(let i=25;i>0;i--){const j=Math.floor(random(state)*(i+1));[state.bag[i],state.bag[j]]=[state.bag[j],state.bag[i]];}
  if(state.bag[0]===previous)[state.bag[0],state.bag[1]]=[state.bag[1],state.bag[0]];
  state.cursor=0;
 }
 state.target=state.bag[state.cursor++];state.spawned++;state.fallAge=0;state.phase='falling';state.action=null;state.delay=0;
}
export function create(seed=Date.now(),speed='normal'){
 if(!Object.hasOwn(SPEEDS,speed))speed='normal';
 const state={speed,fallSeconds:SPEEDS[speed].seconds,streak:0,seed:(seed>>>0)||1,bag:[],cursor:0,target:'',spawned:0,phase:'falling',paused:true,fallAge:0,action:null,delay:0,time:0,caught:0,wrong:0,missed:0,counts:Object.fromEntries([...ALPHABET].map(k=>[k,0]))};
 nextFruit(state);return state;
}
export function press(state,key){
 if(state.paused||state.phase!=='falling'||typeof key!=='string'||!/^[A-Za-z]$/.test(key))return 'ignored';
 key=key.toUpperCase();
 if(key!==state.target){state.wrong++;state.streak=0;return 'wrong';}
 state.caught++;state.streak++;state.counts[key]++;state.phase='catch';
 state.action={type:'catch',key,fallAge:state.fallAge,elapsed:0,duration:CATCH_SECONDS};
 return 'caught';
}
export function tick(state,dt){
 if(state.paused||!Number.isFinite(dt)||dt<=0)return;
 state.time+=dt;
 if(state.phase==='falling'){
  state.fallAge=Math.min(state.fallSeconds,state.fallAge+dt);
  if(state.fallAge>=state.fallSeconds){state.missed++;state.streak=0;state.phase='miss';state.delay=MISS_SECONDS;}
 }else if(state.phase==='catch'){
  state.action.elapsed=Math.min(CATCH_SECONDS,state.action.elapsed+dt);
  if(state.action.elapsed>=CATCH_SECONDS)nextFruit(state);
 }else if(state.phase==='miss'){
  state.delay-=dt;if(state.delay<=0)nextFruit(state);
 }
}
export function renderState(state){
 return {...state,version:4,level:1,fruitKeys:[...ALPHABET],tasks:[],lessonStageIndex:2,stage:'play',catchStyle:'endless'};
}
