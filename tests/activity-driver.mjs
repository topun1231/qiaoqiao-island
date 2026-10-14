import {mazeBoard,DIRECTIONS,gateKey,gateLane,blockKey,kiteStars} from '../dist/game/island-activities.js';
export function pathKey(position,target,valid){
 const queue=[[position,[]]],seen=new Set();
 while(queue.length){const [p,keys]=queue.shift(),id=p.join(',');if(id===target.join(','))return keys[0];if(seen.has(id))continue;seen.add(id);for(const [key,v]of Object.entries(DIRECTIONS)){const next=[p[0]+v[0],p[1]+v[1]];if(valid(next))queue.push([next,[...keys,key]]);}}
 throw Error('Unreachable target '+target);
}
export function nextActivityKey(s){
 if([5,6].includes(s.level)){const b=mazeBoard(s),goal=s.level===6&&s.inventory.length<2?b.supplies[s.inventory.includes('T')?'Y':'T']:b.goal;return pathKey(s.position,goal,p=>b.rows[p[1]]?.[p[0]]==='.');}
 if(s.level===8)return s.held?s.items.find(i=>i.key===s.held).goalZone:s.items.find(i=>s.placements[i.key]!==i.goalZone).key;
 if(s.level===11)return s.stage==='select'?s.choices.find(c=>!c.done).key:s.target;
 if(s.lessonStageIndex===0)return s.lane<gateLane(s)?'D':s.lane>gateLane(s)?'A':gateKey(s);
 if(s.lessonStageIndex===1)return blockKey(s);
 return pathKey(s.position,kiteStars.find((p,i)=>!s.stars.includes(i)),p=>p[0]>=0&&p[0]<=4&&p[1]>=0&&p[1]<=2&&!(p[1]===1&&[1,3].includes(p[0])));
}
