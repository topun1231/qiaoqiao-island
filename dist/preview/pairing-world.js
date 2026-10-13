import * as THREE from '../vendor/three.module.js';
import { createRoomScene } from './pairing-room-scene.js';

// Only this isolated preview uses the new two-stage, freely rearrangeable room.
// Engine actions are authoritative. No input, storage, timers, or animation loop.
const FLOOR_Y = .105;
const HOME = [0, .075, 1.32];
const clamp = (x,a=0,b=1) => Math.max(a,Math.min(b,x));
const ease = x => { x=clamp(x); return x*x*(3-2*x); };
const part = (t,a,b) => ease((t-a)/(b-a));
const mix = (a,b,t) => a+(b-a)*t;
const mix3 = (a,b,t) => a.map((n,i)=>mix(n,b[i],t));
const yawTo = (a,b) => Math.atan2(b[0]-a[0],b[2]-a[2]);
const angleMix = (a,b,t) => a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
const distance = (a,b) => Math.hypot(a[0]-b[0],a[2]-b[2]);
const v = values => new THREE.Vector3(...values);

export const PAIRING_ITEMS = Object.freeze({
  Q:{label:'花瓶', floor:[-1.80,FLOOR_Y,.48], height:.64, grip:.20, width:.20},
  O:{label:'点心盒', floor:[1.85,FLOOR_Y,1.80], height:.32, grip:.16, width:.28},
  F:{label:'小书', floor:[-1.90,FLOOR_Y,.50], height:.18, grip:.10, width:.26},
  D:{label:'小灯', floor:[1.68,FLOOR_Y,1.65], height:.58, grip:.17, width:.20},
  V:{label:'软垫', floor:[-1.90,FLOOR_Y,.75], height:.24, grip:.13, width:.29},
  B:{label:'玩具篮', floor:[1.85,FLOOR_Y,1.82], height:.49, grip:.22, width:.28},
});
export const PAIRING_ZONES = Object.freeze({
  W:{label:'窗边桌', center:[2.50,1.363,-2.10], anchor:[2.58,2.40,-2.30]},
  P:{label:'小架子', center:[-3.47,1.144,-2.69], anchor:[-3.48,2.72,-2.73]},
  M:{label:'阅读角', center:[2.50,1.363,-2.10], anchor:[2.58,2.40,-2.30]},
  N:{label:'游戏角', center:[-3.47,1.144,-2.69], anchor:[-3.48,2.72,-2.73]},
});
export const pairingItemKeys = state => state?.items?.length ? state.items.map(item=>item.key) : Number(state?.level ?? state)===8?['F','D','V','B']:['Q','O'];
export const pairingZoneKeys = state => state?.zones?.length ? state.zones.map(zone=>zone.key) : Number(state?.level ?? state)===8?['M','N']:['W','P'];
const itemKeys = pairingItemKeys, zoneKeys = pairingZoneKeys;
const floorSlots = [[-2.00,FLOOR_Y,.20],[1.75,FLOOR_Y,.30],[-1.65,FLOOR_Y,2.25],[1.75,FLOOR_Y,2.30]];

// Two normal rests, plus two deliberately offset overflow rests. Occupancy is
// never a rule here: all four items can temporarily share either destination.
export function pairingSlotPosition(zone,index=0,count=1,itemKey='') {
  // Soft furnishings and toy baskets belong on the floor beside each nook.
  // A zone is a useful corner, not permission to put a cushion on a tabletop.
  if((zone==='M'||zone==='N') && (itemKey==='V'||itemKey==='B')) {
    const x=zone==='M'?2.40:-3.35;
    return [x+(itemKey==='B'?.55:-.48),FLOOR_Y,zone==='M'?-.28:-.78];
  }
  const spec=PAIRING_ZONES[zone] || PAIRING_ZONES.W;
  const shelf=zone==='P'||zone==='N';
  const offsets=count===1?[[0,0,.08]]:count===2?[[-.55,0,.08],[.55,0,.08]]:
    count===3?[[-.78,0,.11],[0,0,.11],[.78,0,.11]]:
    [[-.85,0,.12],[-.28,.015,-.09],[.29,0,.14],[.86,.015,-.09]];
  const offset=offsets[clamp(index,0,offsets.length-1)];
  return [spec.center[0]+offset[0],spec.center[1]+offset[1],spec.center[2]+offset[2]*(shelf?.75:1)];
}
function placedPoses(state,placements={}) {
  const keys=itemKeys(state), result={};
  for(const key of keys) {
    const zone=placements[key];
    const nooks=state.contentVersion===3||state.version===3;
    const ground=nooks&&(zone==='M'||zone==='N')&&(key==='V'||key==='B');
    const siblings=keys.filter(other=>placements[other]===zone && ((nooks&&(zone==='M'||zone==='N'))?(other==='V'||other==='B')===ground:true));
    result[key]={position:zone?pairingSlotPosition(zone,siblings.indexOf(key),siblings.length,nooks?key:''):[...(state?.items?.length>2 ? floorSlots[keys.indexOf(key)] : PAIRING_ITEMS[key].floor)],yaw:zone?0:key==='V'?-.14:.14,location:zone||'floor'};
  }
  return result;
}
function carriedPosition(root,yaw) {
  return [root[0]+Math.sin(yaw)*1.025,root[1]+.565,root[2]+Math.cos(yaw)*1.025];
}
function corridorPath(from,to) {
  const points=[[...from]];
  // Furniture fronts are clear; crossing happens in front of both pieces.
  const aisle=.30;
  if(from[2]<-.15) points.push([from[0],.075,aisle]);
  if(to[2]<-.15) {
    if(Math.abs(points.at(-1)[0]-to[0])>.25) points.push([to[0],.075,aisle]);
  } else if(Math.abs(points.at(-1)[0]-to[0])>.55) {
    const front=Math.max(from[2],to[2]);
    if(Math.abs(points.at(-1)[2]-front)>.15)points.push([points.at(-1)[0],.075,front]);
    points.push([to[0],.075,front]);
  }
  if(distance(points.at(-1),to)>.001)points.push([...to]);
  if(points.length===1)points.push([...to]);
  return points;
}
function pathPose(points,t,startYaw,endYaw) {
  const lengths=points.slice(1).map((p,i)=>distance(points[i],p));
  const total=lengths.reduce((sum,n)=>sum+n,0);
  const traveled=ease(t)*total;
  let remaining=traveled,index=0;
  while(index<lengths.length-1 && remaining>lengths[index])remaining-=lengths[index++];
  const q=lengths[index]?clamp(remaining/lengths[index]):1;
  const direction=yawTo(points[index],points[index+1]);
  const atDistance=value=>{let rest=clamp(value,0,total),i=0;while(i<lengths.length-1&&rest>lengths[i])rest-=lengths[i++];return mix3(points[i],points[i+1],lengths[i]?clamp(rest/lengths[i]):1);};
  // Blend over a real walking distance rather than a fraction of each segment.
  // A very short aisle segment must not spin the carried object in one frame.
  const before=atDistance(traveled-.38),after=atDistance(traveled+.38);
  let yaw=distance(before,after)>.001?yawTo(before,after):direction;
  const turnDistance=Math.min(.78,total*.40)||.01;
  yaw=angleMix(startYaw,yaw,ease(traveled/turnDistance));
  yaw=angleMix(yaw,endYaw,ease((traveled-(total-turnDistance))/turnDistance));
  if(total<.02)yaw=angleMix(startYaw,endYaw,ease(t));
  return {root:mix3(points[index],points[index+1],q),yaw,travel:traveled,moving:Math.sin(Math.PI*clamp(t))};
}

/** Deterministic, testable frame. Context is a renderer-owned action-start pose. */
export function samplePairingPose(state={},context={}) {
  const level=Number(state.level)||7, placements=state.placements||{};
  const objects=placedPoses(state,placements);
  const pose={level,root:[...(context.root||HOME)],yaw:context.yaw??.52,objects,active:state.held||null,grip:state.held?1:0,upright:state.held ? .09 : 0,crouch:0,travel:0,moving:0,stage:state.held?'holding':'idle'};
  const a=state.action;
  if(!a || !['pick','place'].includes(a.type)) {
    if(state.held && objects[state.held])objects[state.held]={position:carriedPosition(pose.root,pose.yaw),yaw:pose.yaw,location:'held'};
    return pose;
  }
  const key=a.item||a.key, spec=PAIRING_ITEMS[key];
  if(!spec || !objects[key])return pose;
  const t=clamp((a.elapsed||0)/(a.duration||1));
  const from=objects[key].position;
  const startRoot=[...(context.root||HOME)], startYaw=context.yaw??.52;
  pose.active=key;
  if(a.type==='pick') {
    const source=context.source||from;
    const approach=[source[0],.075,source[2]+.91];
    const end=[approach[0],.075,approach[2]+.34];
    const sourceHigh=source[1]>.5;
    if(t<.52) {
      Object.assign(pose,pathPose(corridorPath(startRoot,approach),t/.52,startYaw,Math.PI));
      pose.stage='approaching';
    } else {
      pose.root=[...approach];pose.yaw=Math.PI;
      pose.grip=part(t,.52,.67);
      pose.crouch=(sourceHigh?0:.16)*part(t,.52,.66)*(1-part(t,.68,.85));
      pose.upright=(sourceHigh?.16:.02)*part(t,.52,.66);
      pose.stage=t<.67?'grasping':'lifting';
      if(t>=.67) {
        const q=part(t,.67,.86);
        pose.upright=mix(sourceHigh?.16:.02,.09,q);
        const carried=carriedPosition(pose.root,pose.yaw);
        objects[key]={position:mix3(source,carried,q),yaw:angleMix(objects[key].yaw,Math.PI,q),location:'held'};
      }
      if(t>.86) {
        const q=part(t,.86,1);
        pose.root=mix3(approach,end,q);pose.yaw=angleMix(Math.PI,.52,q);
        objects[key]={position:carriedPosition(pose.root,pose.yaw),yaw:pose.yaw,location:'held'};
        pose.travel=q*.34;pose.moving=Math.sin(Math.PI*q)*.5;pose.stage='holding';
      }
    }
  } else {
    const zone=a.to||a.key;
    const projected={...placements,[key]:zone};
    const destination=placedPoses(state,projected)[key].position;
    const approach=[destination[0],.075,destination[2]+.91];
    pose.grip=1;pose.upright=.09;
    if(t<.62) {
      Object.assign(pose,pathPose(corridorPath(startRoot,approach),t/.62,startYaw,Math.PI));
      pose.stage='carrying';
      objects[key]={position:carriedPosition(pose.root,pose.yaw),yaw:pose.yaw,location:'held'};
    } else {
      pose.root=[...approach];pose.yaw=Math.PI;pose.stage='placing';
      const q=part(t,.62,.88);
      pose.upright=mix(.09,.19,q);
      const origin=carriedPosition(approach,Math.PI);
      const p=mix3(origin,destination,q);p[1]+=Math.sin(Math.PI*q)*.10;
      objects[key]={position:p,yaw:angleMix(Math.PI,0,q),location:t<.88?'held':zone};
      if(t>=.88){pose.grip=1-part(t,.88,.97);pose.upright=.19*(1-part(t,.88,1));pose.stage='releasing';}
    }
    // Existing pieces shift gently to make room, without jumping on commit.
    const finalObjects=placedPoses(state,projected);
    for(const other of itemKeys(state))if(other!==key && (placements[other]===zone || placements[other]===placements[key])) {
      objects[other].position=mix3(objects[other].position,finalObjects[other].position,part(t,.70,.95));
    }
  }
  return pose;
}

// Accepted room keys also let a restored session reconstruct the exact settled
// bear pose, without adding presentation fields to the persisted engine state.
export function reconstructPairingContext(state={}) {
  const level=Number(state.level)||7, keys=itemKeys(state), zones=zoneKeys(state);
  const accepted=(state.accepted||[]).slice(Number(state.stageStartAccepted)||0);
  if(state.action && ['pick','place'].includes(state.action.type))accepted.pop();
  const placements={...(state.initialPlacements ?? (level===8?{F:'M',D:'N'}:{}))};
  let context={root:[...HOME],yaw:.52},held=null;
  for(const key of accepted) {
    let action;
    if(keys.includes(key) && !held)action={type:'pick',key,item:key,from:placements[key]||'floor',to:'held',duration:1,elapsed:1};
    else if(zones.includes(key) && held)action={type:'place',key,item:held,from:placements[held]||'floor',to:key,duration:1,elapsed:1};
    else continue;
    const pose=samplePairingPose({...state,level,placements,held,action},context);
    context={root:[...pose.root],yaw:pose.yaw};
    if(action.type==='pick')held=key;
    else {placements[held]=key;held=null;}
  }
  return context;
}

// Screen-space labels are packed independently of mesh positions. This keeps
// every unique key readable even when several movable pieces share one shelf.
export function layoutPairingLabels(entries,width,height) {
  const occupied=[],result=[];
  const ordered=[...entries].sort((a,b)=>Number(b.destination)-Number(a.destination));
  const overlaps=(a,b)=>a.left<b.right+8&&a.right>b.left-8&&a.top<b.bottom+8&&a.bottom>b.top-8;
  for(const entry of ordered) {
    const safeWidth=Math.max(1,width-24),labelWidth=Math.min(entry.width,safeWidth);
    const half=labelWidth/2,minimumY=Math.min(height-12,entry.height+12);
    let best=null;
    for(let row=-10;row<=10;row++)for(let column=-11;column<=11;column++) {
      const x=clamp(entry.x+column*22,half+12,Math.max(half+12,width-half-12));
      const y=clamp(entry.y+row*20,minimumY,Math.max(minimumY,height-22));
      const rect={left:x-half,right:x+half,top:Math.max(12,y-entry.height),bottom:y};
      const collisions=occupied.filter(other=>overlaps(rect,other)).length;
      const cost=collisions*1e7+(x-entry.x)**2+(y-entry.y)**2*1.07;
      if(!best||cost<best.cost)best={...entry,x,y,rect,cost};
    }
    occupied.push(best.rect);result.push(best);
  }
  return result;
}

const CSS=`
.pairing-label-layer{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:3;font-family:"PingFang SC","Microsoft YaHei",sans-serif}
.pairing-label-leaders{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.pairing-world-label{position:absolute;transform:translate(-50%,-100%);white-space:nowrap;color:#755b35;background:#fff8e7ed;border:1px solid #e9d7b2;border-radius:11px;padding:7px 9px;box-shadow:0 3px 10px #5b422611;font-size:11px;line-height:1.25;transition:opacity .18s,border-color .18s}
.pairing-world-label:after{content:"";position:absolute;bottom:-5px;left:calc(50% - 4px);width:8px;height:8px;background:inherit;border-bottom:inherit;border-right:inherit;transform:rotate(45deg)}
.pairing-world-label .pairing-tagline{display:block;font-size:9px;letter-spacing:.3px;margin-bottom:4px;color:#9c875d}
.pairing-world-label .pairing-caption{display:flex;gap:7px;align-items:center;font-weight:650}
.pairing-world-label kbd{font:800 21px/1 Arial,sans-serif;min-width:23px;text-align:center;border:1px solid #cebd91;border-radius:5px;background:#f2e4c2;padding:2px 3px;box-shadow:0 2px 0 #cebd9170;color:#866b38}
.pairing-world-label.destination{background:#f7fae9f2;color:#657850;border-color:#bdca96}
.pairing-world-label.destination .pairing-tagline{color:#8b986d}
.pairing-world-label.destination kbd{background:#e6edcf;color:#697e45;border-color:#aec287;box-shadow:0 2px 0 #a8ba8270}
.pairing-world-label.available{border-width:2px;padding:6px 8px}
.pairing-world-label.quiet{opacity:.85}
.pairing-world-label.held{background:#fff2cf;border-color:#d5ac63;opacity:1}
.pairing-world-label .pairing-count{margin-left:3px;font-size:10px;font-weight:550;color:#8b986d}
@media(max-width:680px){.pairing-world-label{padding:5px 6px;font-size:10px;border-radius:8px}.pairing-world-label.available{padding:4px 5px}.pairing-world-label kbd{font-size:17px;min-width:19px}.pairing-world-label .pairing-caption{gap:4px}.pairing-world-label .pairing-tagline{font-size:8px;margin-bottom:3px}}
`;
const element=(tag,className='',text)=>{const el=document.createElement(tag);el.className=className;if(text!==undefined)el.textContent=text;return el;};

export function createPairingWorld(container) {
  const world=createRoomScene(container);
  const {scene,room,camera,renderer,bear,body,head,legs,table,shelf,basket,objectHalo,tableDestination,mesh,mat,cylinder,ring}=world;
  renderer.domElement.setAttribute('aria-label','小熊的整理房间：先按物品字母拿起，再按区域字母放下');
  // Keep the approved cutaway, furniture, rug, window, and bear. The small table
  // is lowered just enough that placement uses short, believable forepaws.
  table.scale.y=.80;
  for(const child of room.children)if(child.isGroup && child.position.x===3.29 && child.position.y===1.73) child.position.y=1.392;
  tableDestination.visible=false;objectHalo.visible=false;
  // Remove only the old movable proposal props and decorative basket. The new
  // basket is the actual labelled moveable item, never a duplicate decoration.
  for(const object of Object.values(world.objects))object.removeFromParent();
  basket.visible=false;
  // Clear the low shelf for freely chosen pieces; higher decorations stay intact.
  for(const object of [...shelf.children])if(object.position.y>1.14 && object.position.y<1.77)object.removeFromParent();
  const objects={};
  const boxGeometry=new THREE.BoxGeometry(1,1,1), ballGeometry=new THREE.SphereGeometry(1,16,12);
  const block=(color,p,s,parent)=>mesh(boxGeometry,color,p,s,parent);
  const ell=(color,p,s,parent)=>mesh(ballGeometry,color,p,s,parent);
  const group=key=>{const g=new THREE.Group();g.name=`pairing-movable-${key}`;room.add(g);objects[key]=g;return g;};
  {
    const g=group('Q');
    const points=[[.12,0],[.19,.055],[.205,.20],[.16,.31],[.085,.39],[.085,.46]].map(p=>new THREE.Vector2(...p));
    mesh(new THREE.LatheGeometry(points,24),'#89ada0',[0,0,0],[1,1,1],g);
    ring('#c5d9bb',[0,.455,0],.085,.025,g);
    cylinder('#91a574',[.012,.51,0],.011,.011,.16,g,8);
    ell('#f0d398',[.012,.602,0],[.095,.072,.075],g);
    for(let i=0;i<5;i++){const a=i*Math.PI*2/5;ell('#efddbb',[.012+Math.sin(a)*.083,.612,Math.cos(a)*.075],[.062,.036,.047],g);}
    ell('#afc594',[-.065,.51,0],[.083,.037,.035],g);
  }
  {
    const g=group('O');
    block('#b88463',[0,.135,0],[.62,.25,.47],g);block('#cda885',[0,.281,0],[.67,.064,.52],g);
    block('#e3d3a4',[0,.318,0],[.094,.009,.51],g);block('#e3d3a4',[0,.16,.241],[.094,.27,.012],g);
    ell('#be946b',[-.065,.337,0],[.08,.024,.04],g);ell('#be946b',[.065,.337,0],[.08,.024,.04],g);
  }
  {
    const g=group('F');
    block('#b9795f',[0,.027,0],[.59,.055,.68],g);block('#efe5c8',[.012,.089,0],[.55,.09,.62],g);block('#c48a68',[0,.151,0],[.60,.038,.69],g);
    block('#e6cd91',[0,.174,0],[.27,.009,.032],g);block('#aa694f',[-.272,.091,0],[.044,.163,.68],g);
  }
  {
    const g=group('D');
    cylinder('#bb9364',[0,.038,0],.18,.20,.076,g,24);cylinder('#a28252',[0,.24,0],.026,.035,.40,g,12);
    cylinder('#e8c993',[0,.405,0],.12,.24,.24,g,24);ring('#cfaa71',[0,.287,0],.231,.016,g);
    cylinder('#f8e8b7',[0,.29,0],.206,.206,.007,g,24);ell('#e9d5a7',[0,.554,0],[.049,.027,.049],g);
  }
  {
    const g=group('V');
    const pad=ell('#9eaf96',[0,.13,0],[.37,.13,.32],g);pad.rotation.y=-.12;
    const stitch=ring('#d4dabb',[0,.125,0],.29,.012,g);stitch.scale.set(1.12,.92,1);
    for(const x of[-.21,.21])for(const z of[-.17,.17])ell('#8e9e83',[x,.231,z],[.019,.012,.019],g);
  }
  {
    const g=group('B');
    block('#c49b68',[0,.046,0],[.62,.09,.50],g);
    for(const x of[-.29,.29])block('#c6a172',[x,.235,0],[.055,.37,.50],g);
    for(const z of[-.23,.23])block('#d2ad7d',[0,.235,z],[.61,.37,.058],g);
    for(let i=0;i<4;i++)for(const z of[-.265,.265])block('#e0bd88',[0,.10+i*.089,z],[.63,.026,.017],g);
    for(const z of[-.267,.267])block('#e5c58f',[0,.429,z],[.69,.056,.058],g);
    for(const x of[-.321,.321])block('#e5c58f',[x,.429,0],[.058,.056,.51],g);
    ell('#ddbe79',[-.13,.39,0],[.12,.12,.12],g);const toy=block('#96ac99',[.13,.365,-.02],[.19,.18,.19],g);toy.rotation.y=.23;
  }
  const rests=new THREE.Group();rests.name='two-zone-empty-rests';room.add(rests);
  const restMaterials=[];
  const restMeshes=[];
  for(let zoneIndex=0;zoneIndex<2;zoneIndex++)for(let slot=0;slot<4;slot++) {
    const material=new THREE.MeshBasicMaterial({color:'#eef1c6',transparent:true,opacity:.80,depthWrite:false});restMaterials.push(material);
    const rest=ring(material,[0,0,0],.32,.015,rests);restMeshes.push(rest);
  }
  const layer=element('div','pairing-label-layer');layer.setAttribute('aria-hidden','true');
  const svgNS='http://www.w3.org/2000/svg';
  const leaders=document.createElementNS(svgNS,'svg');leaders.classList.add('pairing-label-leaders');leaders.setAttribute('aria-hidden','true');layer.appendChild(leaders);
  const style=element('style');style.textContent=CSS;layer.appendChild(style);container.appendChild(layer);
  const labels={};
  for(const key of [...Object.keys(PAIRING_ITEMS),...Object.keys(PAIRING_ZONES)]) {
    const label=element('div','pairing-world-label');label.dataset.key=key;
    const tagline=element('span','pairing-tagline'),caption=element('span','pairing-caption');
    caption.append(element('kbd','',key),element('span','pairing-name',(PAIRING_ITEMS[key]||PAIRING_ZONES[key]).label));
    const count=element('span','pairing-count');caption.appendChild(count);label.append(tagline,caption);layer.appendChild(label);
    const line=document.createElementNS(svgNS,'path');line.setAttribute('fill','none');line.setAttribute('stroke',PAIRING_ITEMS[key]?'#ac946d':'#93a573');line.setAttribute('stroke-width','1.35');line.setAttribute('stroke-linecap','round');line.setAttribute('opacity','.70');leaders.appendChild(line);
    const dot=document.createElementNS(svgNS,'circle');dot.setAttribute('r','2.1');dot.setAttribute('fill',PAIRING_ITEMS[key]?'#b79d72':'#98aa7c');leaders.appendChild(dot);
    labels[key]={el:label,tagline,count,line,dot,name:caption.children[1]};
  }
  const legRest=legs.map(leg=>leg.position.clone());
  const down=new THREE.Vector3(0,-1,0);
  let width=0,height=0,disposed=false,lastLevel=0,lastLessonStage=-1,lastState=null,lastPose=null,lastAction=null,actionContext=null,settledRoot=[...HOME],settledYaw=.52;
  let debug={},lastEngineTime=-1;
  function resize() {
    if(disposed)return;
    const w=Math.max(1,container.clientWidth),h=Math.max(1,container.clientHeight);
    if(w===width&&h===height)return;
    width=w;height=h;const aspect=w/h,halfHeight=Math.max(5.55,7.18/aspect);
    camera.left=-halfHeight*aspect;camera.right=halfHeight*aspect;camera.top=halfHeight;camera.bottom=-halfHeight;
    camera.position.set(10.5,12.4,15.5);camera.lookAt(0,1.55,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    renderer.setSize(w,h);
    if(lastState)render(lastState);
  }
  function limbTo(leg,target,width,depth) {
    const direction=target.clone().sub(leg.position),length=direction.length();
    leg.quaternion.setFromUnitVectors(down,direction.normalize());
    leg.children[0].position.set(0,-length*.47,0);leg.children[0].scale.set(width,length*.49+.025,depth);
    leg.children[1].position.set(0,-length,0);leg.children[1].scale.set(width*.98,.115,depth*1.14);
    leg.userData.reachLength=length;
    return length;
  }
  function poseBear(pose) {
    bear.position.set(...pose.root);bear.rotation.set(0,pose.yaw,0);
    // Body sway is extremely small; foot positions are solved back to the floor.
    const sway=Math.sin(pose.travel*9)*pose.moving*.009;
    body.position.set(0,pose.upright-pose.crouch+sway,0);body.rotation.set(-pose.upright*.70,0,0);
    head.rotation.set(.06+pose.crouch*.5,0,0);
    bear.updateMatrixWorld(true);
    const lengths=[];
    for(let i=0;i<legs.length;i++) {
      const leg=legs[i],rest=legRest[i],front=i===1||i===3,side=i<2?-1:1;
      leg.position.copy(rest);leg.rotation.set(0,0,0);
      const phase=pose.travel*10+(i===0||i===3?0:Math.PI);
      // Zero-height stance; only the swinging foot rises, never the whole bear.
      const footLift=Math.max(0,Math.sin(phase))*.075*pose.moving;
      const footStride=Math.cos(phase)*.13*pose.moving;
      const foot=new THREE.Vector3(rest.x,.117+footLift,rest.z+.065+footStride);
      bear.localToWorld(foot);body.worldToLocal(foot);
      let target=foot;
      if(front && pose.active && pose.grip>0) {
        leg.position.set(rest.x,mix(rest.y,.80,pose.grip),mix(rest.z,.34,pose.grip));
        const spec=PAIRING_ITEMS[pose.active],object=pose.objects[pose.active];
        const grip=new THREE.Vector3(object.position[0]+Math.cos(pose.yaw)*side*spec.width,object.position[1]+spec.grip,object.position[2]-Math.sin(pose.yaw)*side*spec.width);
        body.worldToLocal(grip);target=foot.clone().lerp(grip,pose.grip);
      }
      lengths.push(limbTo(leg,target,front&&pose.grip>.1?.15:.18,front&&pose.grip>.1?.155:.19));
    }
    return lengths;
  }
  let labelEntries=[];
  function project(label,position,anchor=position,destination=false,key='') {
    const p=v(position).project(camera),target=v(anchor).project(camera);
    labelEntries.push({key,destination,x:(p.x*.5+.5)*width,y:(-p.y*.5+.5)*height,width:label.offsetWidth||92,height:label.offsetHeight||52,anchorX:(target.x*.5+.5)*width,anchorY:(-target.y*.5+.5)*height});
  }
  function arrangeLabels() {
    leaders.setAttribute('viewBox',`0 0 ${width} ${height}`);
    for(const entry of layoutPairingLabels(labelEntries,width,height)) {
      const label=labels[entry.key];
      label.el.style.left=`${entry.x}px`;label.el.style.top=`${entry.y}px`;
      const endX=clamp(entry.anchorX,entry.rect.left+7,entry.rect.right-7);
      const endY=clamp(entry.anchorY,entry.rect.top+7,entry.rect.bottom-7);
      const visible=Math.hypot(endX-entry.anchorX,endY-entry.anchorY)>11;
      label.line.style.display=visible?'':'none';label.dot.style.display=visible?'':'none';
      label.line.setAttribute('d',`M ${endX.toFixed(1)} ${endY.toFixed(1)} L ${entry.anchorX.toFixed(1)} ${entry.anchorY.toFixed(1)}`);
      label.dot.setAttribute('cx',entry.anchorX.toFixed(1));label.dot.setAttribute('cy',entry.anchorY.toFixed(1));
    }
  }
  function render(state) {
    if(disposed)return;
    const level=Number(state.level)||7;
    if(level!==lastLevel || (state.lessonStageIndex||0)!==lastLessonStage || (Number.isFinite(state.time)&&state.time<lastEngineTime)) {const restored=reconstructPairingContext(state);lastLevel=level;lastLessonStage=state.lessonStageIndex||0;lastAction=null;actionContext=null;settledRoot=restored.root;settledYaw=restored.yaw;lastPose=null;}
    lastEngineTime=Number.isFinite(state.time)?state.time:lastEngineTime;
    const action=state.action&&['pick','place'].includes(state.action.type)?state.action:null;
    const signature=action?`${action.type}:${action.item||action.key}:${action.to}:${action.from}`:'';
    if(action) {
      if(!lastAction || signature!==lastAction.signature || action.elapsed<lastAction.elapsed) {
        if(lastPose){settledRoot=[...lastPose.root];settledYaw=lastPose.yaw;}
        const key=action.item||action.key;
        actionContext={root:[...settledRoot],yaw:settledYaw,source:placedPoses(state,state.placements||{})[key]?.position};
      }
    } else if(lastAction) {
      const finalState={...lastAction.state,action:{...lastAction.state.action,elapsed:lastAction.state.action.duration}};
      const finalPose=samplePairingPose(finalState,actionContext||{});
      settledRoot=[...finalPose.root];settledYaw=finalPose.yaw;actionContext=null;
    }
    const pose=samplePairingPose(state,action? actionContext : {root:settledRoot,yaw:settledYaw});
    lastAction=action?{signature,elapsed:action.elapsed,state:{...state,placements:{...state.placements},action:{...action}}}:null;
    lastPose=pose;
    const keys=itemKeys(state),zones=zoneKeys(state),held=state.held||((action?.type==='pick'&&pose.grip>.98)||action?.type==='place'?action?.item:null);
    for(const [key,obj]of Object.entries(objects)) {
      obj.visible=keys.includes(key);
      if(obj.visible){obj.position.set(...pose.objects[key].position);obj.rotation.set(0,pose.objects[key].yaw,0);}
    }
    const limbLengths=poseBear(pose);
    const picking=!state.held&&!action&&!state.stageReady&&state.phase!=='stage-ready';labelEntries=[];
    for(const [key,label]of Object.entries(labels)) {
      const isItem=!!PAIRING_ITEMS[key],visible=isItem?keys.includes(key):zones.includes(key);
      label.el.hidden=!visible;label.el.style.maxWidth=`${Math.max(1,width-24)}px`;label.el.style.boxSizing='border-box';if(!visible){label.line.style.display='none';label.dot.style.display='none';continue;}
      if(isItem) {
        const item=state.items?.find(item=>item.key===key);
        label.name.textContent=item?.label||PAIRING_ITEMS[key].label;
        const isHeld=key===held,placed=!!state.placements?.[key];
        label.el.className=`pairing-world-label item${picking?' available':' quiet'}${isHeld?' held':''}`;
        const goalZone=state.zones?.find(zone=>zone.key===item?.goalZone);
        const goalHint=!state.solved&&!state.freePlay&&item?.goalZone?`送到 ${goalZone?.label||PAIRING_ZONES[item.goalZone]?.label||item.goalZone} (${item.goalZone})`:'';
        label.tagline.textContent=action?.item===key?(action.type==='place'?'正在放下':pose.grip>.98?(goalHint?`拿好啦 · ${goalHint}`:'拿好啦'):'小熊来拿了'):isHeld?(goalHint?`已拿起 · ${goalHint}`:'已拿起 · 选位置'):goalHint|| (placed?'还可以再拿':'↑ 拿取');
        label.count.textContent='';
        const p=[...pose.objects[key].position];p[1]+=PAIRING_ITEMS[key].height+.23;
        if(isHeld){p[0]-=.70;p[1]+=.20;p[2]+=.10;}
        const anchor=[...pose.objects[key].position];anchor[1]+=PAIRING_ITEMS[key].height*.70;
        project(label.el,p,anchor,false,key);
      } else {
        const count=keys.filter(item=>state.placements?.[item]===key&&item!==state.held).length;
        label.el.className=`pairing-world-label destination${state.held&&!action?' available':' quiet'}`;
        const zone=state.zones?.find(zone=>zone.key===key);
        label.name.textContent=zone?.label||PAIRING_ZONES[key].label;
        label.tagline.textContent=state.held?'↓ 放置':'小区域';label.count.textContent=state.solved||state.freePlay?`${count}件`:`${count}/${zone?.capacity??(level===8?2:1)}`;
        project(label.el,PAIRING_ZONES[key].anchor,PAIRING_ZONES[key].center,true,key);
      }
    }
    arrangeLabels();
    zones.forEach((zone,index)=>{
      const capacity=state.zones?.find(item=>item.key===zone)?.capacity??(level===8?2:1);
      const goals=state.items?.filter(item=>item.goalZone===zone)||[];
      for(let slot=0;slot<4;slot++) {
        const rest=restMeshes[index*4+slot],item=goals[slot];
        rest.visible=!state.solved&&!state.freePlay&&slot<capacity;
        const siblings=goals.filter(other=>(['V','B'].includes(other.key))===(['V','B'].includes(item?.key)));
        rest.position.set(...pairingSlotPosition(zone,item?siblings.indexOf(item):slot,item?siblings.length:capacity,(state.contentVersion===3||state.version===3)?item?.key:''));rest.position.y+=.008;
        const filled=item?state.placements?.[item.key]===zone&&state.held!==item.key:slot<keys.filter(key=>state.placements?.[key]===zone&&key!==state.held).length;
        restMaterials[index*4+slot].opacity=filled?.16:.75;
      }
    });
    debug={stage:pose.stage,held,root:[...pose.root],limbLengths,objects:Object.fromEntries(keys.map(key=>[key,{...pose.objects[key],position:[...pose.objects[key].position]}]))};
    renderer.render(scene,camera);
  }
  function update(state,dt=0) {if(disposed)return;lastState=state;resize();render(state);}
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;
  observer?.observe(container);if(!observer)window.addEventListener('resize',resize);
  resize();
  return {update,destroy(){if(disposed)return;disposed=true;observer?.disconnect();if(!observer)window.removeEventListener('resize',resize);layer.remove();world.dispose();},get debug(){return debug;}};
}
