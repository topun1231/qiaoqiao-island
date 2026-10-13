import * as THREE from './vendor/three.module.js';
import { createRoomScene } from './room-scene.js';
import { getJourneyLesson, getJourneyTarget } from './journey-game.js';

export const ROOM_BEAR_SCALE = .91;
export const ROOM_HOME = Object.freeze([-.64, .075, 1.42]);
export const ROOM_ORDER = Object.freeze(['CUP', 'BOOK', 'HAT', 'BALL']);
const freeze = value => Object.freeze(value);
export const ROOM_OBJECTS = freeze({
  CUP: freeze({ source: freeze([1.18,.065,1.17]), destination: freeze([2.23,1.747,-2.16]), rotation: freeze([0,.18,0]), finalRotation: freeze([0,.18,0]), pickup: freeze([.255,.075,1.297]), pickupYaw: 1.707, carryHeight: .47, clearance: .57, approach: freeze([]), carry: freeze([[1.52,.075,1.00],[2.23,.075,.12],[2.23,.075,-.97]]), returning: freeze([[2.20,.075,.38],[.56,.075,1.42]]) }),
  BOOK: freeze({ source: freeze([-1.57,.13,-1.40]), destination: freeze([-2.64,1.137,-2.92]), rotation: freeze([0,-.28,0]), finalRotation: freeze([0,0,0]), pickup: freeze([-1.36,.075,-.50]), pickupYaw: -2.912, carryHeight: .56, clearance: .65, approach: freeze([[-.78,.075,.60]]), carry: freeze([[-2.54,.075,-.68],[-2.64,.075,-1.40]]), returning: freeze([[-2.56,.075,-.52],[-1.35,.075,.70]]) }),
  HAT: freeze({ source: freeze([-3.42,.09,1.72]), destination: freeze([-4.55,2.14,.23]), rotation: freeze([0,-.25,0]), finalRotation: freeze([0,0,-Math.PI/2]), pickup: freeze([-2.50,.075,1.62]), pickupYaw: -1.462, carryHeight: .58, clearance: .66, approach: freeze([[-1.64,.075,1.52]]), carry: freeze([[-2.94,.075,1.05],[-3.44,.075,.23]]), returning: freeze([[-2.75,.075,.50],[-1.8,.075,1.22]]) }),
  BALL: freeze({ source: freeze([3.39,.39,2.05]), destination: freeze([3.82,.88,.13]), rotation: freeze([0,0,0]), finalRotation: freeze([0,0,0]), pickup: freeze([2.45,.075,1.94]), pickupYaw: 1.454, carryHeight: .59, clearance: .59, approach: freeze([[.73,.075,1.52],[1.66,.075,1.77]]), carry: freeze([[3.16,.075,1.53],[3.82,.075,1.34]]), returning: freeze([[2.95,.075,1.18],[1.38,.075,1.32]]) }),
});
export const ROOM_TIMING = freeze({ approach:.18, grasp:.25, lift:.34, carry:.67, place:.79, release:.84, end:1 });
const clamp = x => Math.max(0, Math.min(1, x));
const ease = x => { x=clamp(x); return x*x*(3-2*x); };
const mix = (a,b,t) => a+(b-a)*t;
const mix3 = (a,b,t) => a.map((v,i)=>mix(v,b[i],t));
const angleMix = (a,b,t) => a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
const yawTo = (a,b) => Math.atan2(b[0]-a[0],b[2]-a[2]);
const distance = (a,b) => Math.hypot(b[0]-a[0],b[2]-a[2]);
const step = (value,a,b) => clamp((value-a)/(b-a));
const sourcePose = key => ({ position:[...ROOM_OBJECTS[key].source], rotation:[...ROOM_OBJECTS[key].rotation], location:'floor' });
const destinationPose = key => ({ position:[...ROOM_OBJECTS[key].destination], rotation:[...ROOM_OBJECTS[key].finalRotation], location:'destination' });

// Curved waypoints avoid furniture, and arc-length sampling gives even, compact
// steps. Every value is a pure function of saved lesson progress and action time.
function samplePath(points,t,startYaw,endYaw) {
  const total = points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p),0);
  let remaining=ease(t)*total, index=0, length=0;
  for (;index<points.length-2;index++) {
    length=distance(points[index],points[index+1]);
    if(remaining<=length)break;
    remaining-=length;
  }
  length=distance(points[index],points[index+1]);
  const q=length?clamp(remaining/length):1;
  const from=points[index],to=points[index+1];
  const position=mix3(from,to,q);
  const direction=yawTo(from,to);
  let yaw=direction;
  // Ease both ends of each small turn instead of snapping to the next segment.
  const before=index?angleMix(yawTo(points[index-1],from),direction,.5):startYaw;
  const after=index<points.length-2?angleMix(direction,yawTo(to,points[index+2]),.5):endYaw;
  if(q<.27)yaw=angleMix(before,direction,ease(q/.27));
  if(q>.73)yaw=angleMix(direction,after,ease((q-.73)/.27));
  const moving=Math.sin(Math.PI*clamp(t));
  return { position, yaw, gait:Math.sin(ease(t)*total*8.5)*.12*moving, stride:Math.sin(ease(t)*total*8.5)*moving, traveled:ease(t)*total };
}
function carriedPosition(key,root,yaw) {
  const spec=ROOM_OBJECTS[key], forward=key==='BALL'?1.09:.99;
  const side=.38*(.56*Math.cos(yaw)-.83*Math.sin(yaw));
  return [root[0]+Math.sin(yaw)*forward+Math.cos(yaw)*side,root[1]+spec.carryHeight,root[2]+Math.cos(yaw)*forward-Math.sin(yaw)*side];
}

export function sampleRoomPose(state={}) {
  const taskIndex=Math.max(0,Math.min(7,Math.trunc(state.taskIndex||0)));
  const objectIndex=Math.min(3,Math.floor(taskIndex/2)), key=ROOM_ORDER[objectIndex];
  const objects=Object.fromEntries(ROOM_ORDER.map((word,index)=>[word,index*2<taskIndex?destinationPose(word):sourcePose(word)]));
  const result={ root:[...ROOM_HOME], yaw:1.72, gait:0, stride:0, crouch:0, headPitch:.10, reach:0, lift:0, key, objects, progress:0, stage:'ready', upright:0, completed:ROOM_ORDER.filter((_,i)=>i*2<taskIndex) };
  if(state.complete||state.phase==='complete') { result.stage='complete'; return result; }
  if(state.phase!=='acting'||taskIndex%2)return result;
  const spec=ROOM_OBJECTS[key], t=clamp((Number(state.actionTime)||0)/(Number(state.actionDuration)||8));
  result.progress=t;
  const carryPoints=[spec.pickup,...spec.carry], endpoint=carryPoints.at(-1), endYaw=yawTo(endpoint,spec.destination);
  const returnPoints=[endpoint,...spec.returning,ROOM_HOME];
  let object=sourcePose(key), travel;
  if(t<ROOM_TIMING.approach) {
    const q=step(t,0,ROOM_TIMING.approach);
    travel=samplePath([ROOM_HOME,...spec.approach,spec.pickup],q,1.72,spec.pickupYaw);
    result.stage='approaching';
  } else if(t<ROOM_TIMING.grasp) {
    const q=ease(step(t,ROOM_TIMING.approach,ROOM_TIMING.grasp));
    result.root=[...spec.pickup]; result.yaw=spec.pickupYaw; result.crouch=q*.17; result.headPitch=.10+q*.43; result.reach=q*.40; result.stage='reaching';
  } else if(t<ROOM_TIMING.lift) {
    const q=ease(step(t,ROOM_TIMING.grasp,ROOM_TIMING.lift));
    result.root=[...spec.pickup]; result.yaw=spec.pickupYaw; result.crouch=(1-q)*.17; result.headPitch=.10+(1-q)*.43; result.reach=.40; result.lift=q; result.stage='lifting';
    object.position=mix3(spec.source,carriedPosition(key,result.root,result.yaw),q);
    object.rotation=spec.rotation.map((a,i)=>angleMix(a,i===1?result.yaw:0,q));object.location='carried';
  } else if(t<ROOM_TIMING.carry) {
    const q=step(t,ROOM_TIMING.lift,ROOM_TIMING.carry);
    travel=samplePath(carryPoints,q,spec.pickupYaw,endYaw); result.reach=.40; result.lift=1; result.stage='carrying';
  } else if(t<ROOM_TIMING.place) {
    const q=ease(step(t,ROOM_TIMING.carry,ROOM_TIMING.place));
    result.root=[...endpoint];result.yaw=endYaw;result.reach=.40+q*.25;result.lift=1;
    result.headPitch=.10-q*.26;result.stage='placing';
    const start=carriedPosition(key,endpoint,endYaw);
    if(key!=='BALL')start[1]=spec.destination[1]+.10;
    object.position=mix3(start,spec.destination,q);
    object.position[1]+=Math.sin(Math.PI*q)*(key==='BALL'?.27:.11);
    object.rotation=spec.finalRotation.map((a,i)=>angleMix(i===1?endYaw:0,a,q));object.location='carried';
  } else if(t<ROOM_TIMING.release) {
    const q=ease(step(t,ROOM_TIMING.place,ROOM_TIMING.release));
    result.root=[...endpoint];result.yaw=endYaw;result.reach=.65*(1-q);result.headPitch=-.16+q*.26;result.lift=1-q;result.stage='releasing';object=destinationPose(key);
  } else {
    const q=step(t,ROOM_TIMING.release,1);
    travel=samplePath(returnPoints,q,endYaw,1.72); result.stage='returning';object=destinationPose(key);
  }
  if(travel){ result.root=travel.position;result.yaw=travel.yaw;result.gait=travel.gait;result.stride=travel.stride; }
  if(result.stage==='carrying') {
    object.position=carriedPosition(key,result.root,result.yaw);object.rotation=[0,result.yaw,0];object.location='carried';
    if(key!=='BALL')object.position[1]=mix(object.position[1],spec.destination[1]+.10,ease(step(t,.51,.60)));
  }
  if(key!=='BALL')result.upright=ease(step(t,.51,.60))*(1-ease(step(t,.84,.92)));
  if(key==='BOOK')result.upright*=.50;
  // No independent bounce: feet and the held object share the same mild sway.
  result.objects[key]=object;
  return result;
}

const LABEL_CSS = `
.room-world-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden;font-family:'PingFang SC','Microsoft YaHei',sans-serif;z-index:2}
.room-object-label,.room-home-label{position:absolute;white-space:nowrap;transform:translate(-50%,-100%);text-align:center}
.room-object-label[hidden]{display:none}.room-object-label{display:flex;flex-direction:column;align-items:center;gap:5px}
.room-object-label.quiet{font:bold 12px Arial,sans-serif;letter-spacing:1.5px;color:#8b7d62;background:#fffcf0df;border:1px solid #f2e8d0;border-radius:8px;padding:5px 9px}
.room-object-label.done{font:bold 11px Arial,sans-serif;color:#7b8662;background:#fcfcebd9;border:1px solid #e4e6c9;border-radius:8px;padding:4px 7px;letter-spacing:.8px}
.room-label-caption{font-size:10px;font-weight:750;letter-spacing:.6px;color:#886c41;background:#fff6d6ef;border:1px solid #f7e8b9;border-radius:8px;padding:3px 7px}
.room-word{display:flex;align-items:center;gap:4px;padding:6px 8px;background:#fffbed;border:2px solid #e9bb64;border-radius:12px;box-shadow:0 4px 0 #b88d4338,0 5px 18px #73502212;font:800 23px Arial,sans-serif;color:#a69577;letter-spacing:1px}
.room-word .letter{display:flex;align-items:center;justify-content:center;min-width:21px;height:28px;border-radius:5px}
.room-word .current{background:#f5d68c;color:#755522;box-shadow:inset 0 -2px #d8b76777}
.room-word .accepted{color:#6f8351}.room-word .extra{background:#f4d4bc;color:#995c3b;text-decoration:line-through;text-decoration-thickness:3px;border:1px dashed #ac7250}
.room-pointer{width:9px;height:9px;background:#fffbed;border-right:2px solid #e9bb64;border-bottom:2px solid #e9bb64;transform:rotate(45deg);margin-top:-10px}
.room-key-instruction{display:flex;align-items:center;gap:7px;padding:6px 9px;border-radius:9px;background:#fff7de;border:1.5px solid #dbb66a;box-shadow:0 3px 0 #b4935730;color:#7d6031;font-size:11px;font-weight:700}
.room-key-instruction kbd{border:1px solid #c8a351;box-shadow:0 2px #c8a351;border-radius:5px;padding:3px 6px;background:#f4dda0;color:#725020;font:bold 12px Arial,sans-serif}.room-home-label{font-size:11px;font-weight:700;color:#829063;background:#fafbede8;border:1px solid #e5e6bb;padding:6px 9px;border-radius:9px}
@media(max-width:700px){.room-word{font-size:19px;padding:5px 6px;gap:2px}.room-word .letter{min-width:19px;height:23px}.room-object-label.quiet,.room-object-label.done{font-size:10px;padding:4px 6px}.room-label-caption{font-size:9px}.room-home-label{font-size:10px;padding:4px 6px}.room-key-instruction{font-size:10px;padding:5px 7px;gap:5px}.room-key-instruction kbd{font-size:11px}}
`;
const el = (tag,className,text) => { const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node; };
const clear = node => { node.textContent=''; };
const destinationCaption = { CUP:'放回桌上',BOOK:'放回书架',HAT:'挂到衣钩',BALL:'放进玩具篮' };

// The controller owns the single animation loop. `dt` is deliberately not used:
// rendering/reloading a paused saved frame cannot move an item or duplicate it.
export function createRoomWorld(container) {
  const roomScene=createRoomScene(container);
  const { scene,camera,renderer,bear,body,head,legs,objects,objectHalo,tableDestination }=roomScene;
  const labelLayer=el('div','room-world-labels');labelLayer.setAttribute('aria-hidden','true');
  const styles=el('style');styles.textContent=LABEL_CSS;labelLayer.appendChild(styles);
  const labels=Object.fromEntries(ROOM_ORDER.map(key=>{const label=el('div','room-object-label quiet',key);label.dataset.object=key;labelLayer.appendChild(label);return [key,label];}));
  const homeLabel=el('div','room-home-label');labelLayer.appendChild(homeLabel);container.appendChild(labelLayer);
  const routeGroup=new THREE.Group();routeGroup.name='active-floor-route';scene.add(routeGroup);
  const routeMaterial=new THREE.MeshBasicMaterial({color:'#f8edbd',transparent:true,opacity:.82});
  const routeGeometry=new THREE.CylinderGeometry(.036,.036,.008,10);
  const routeDots=Array.from({length:18},()=>{const dot=new THREE.Mesh(routeGeometry,routeMaterial);routeGroup.add(dot);return dot;});
  const destinationGroup=new THREE.Group();destinationGroup.name='current-destination-outline';scene.add(destinationGroup);
  const destinationRing=new THREE.Mesh(new THREE.TorusGeometry(.40,.022,6,48),new THREE.MeshBasicMaterial({color:'#ecf2b2'}));destinationRing.rotation.x=-Math.PI/2;destinationGroup.add(destinationRing);
  const legRest=legs.map(leg=>leg.position.clone());
  const down=new THREE.Vector3(0,-1,0), gripPoint=new THREE.Vector3(), limbDirection=new THREE.Vector3();
  const grips={ CUP:{width:.23,y:.19,z:0}, BOOK:{width:.34,y:.12,z:0}, HAT:{width:.32,y:.12,z:0}, BALL:{width:.27,y:0,z:0} };
  function poseForepaws(pose) {
    const active=pose.stage==='reaching'||pose.stage==='lifting'||pose.stage==='carrying'||pose.stage==='placing'||pose.stage==='releasing';
    const blend=pose.stage==='reaching'?pose.reach/.40:pose.stage==='releasing'?pose.reach/.65:1;
    const high=pose.stage==='placing'?ease(step(pose.progress,ROOM_TIMING.carry,ROOM_TIMING.place)):pose.stage==='releasing'?1-ease(step(pose.progress,ROOM_TIMING.place,ROOM_TIMING.release)):0;
    const item=pose.objects[pose.key],grip=grips[pose.key];
    bear.updateMatrixWorld(true);
    if(active)for(const i of [1,3]) {
      const leg=legs[i],side=i===1?-1:1,rest=legRest[i];
      leg.position.set(rest.x,rest.y+(.12+pose.upright*.34)*blend,rest.z+.10*blend);
      const forward=pose.yaw;
      gripPoint.set(item.position[0]+Math.cos(forward)*side*grip.width,item.position[1]+grip.y,item.position[2]-Math.sin(forward)*side*grip.width);
      if(pose.key==='HAT'&&high>0)gripPoint.y-=.28*high;
      if((pose.key==='BOOK'||pose.key==='CUP')&&pose.upright>0){const back=pose.key==='BOOK'?.30:.14;gripPoint.x-=Math.sin(forward)*back*pose.upright;gripPoint.z-=Math.cos(forward)*back*pose.upright;}
      body.worldToLocal(gripPoint);
      const restPaw=new THREE.Vector3(rest.x,.12,rest.z+.065);
      bear.localToWorld(restPaw);body.worldToLocal(restPaw);
      gripPoint.lerpVectors(restPaw,gripPoint,blend);
      limbDirection.copy(gripPoint).sub(leg.position);
      const length=limbDirection.length();
      leg.quaternion.setFromUnitVectors(down,limbDirection.normalize());
      const arm=leg.children[0],paw=leg.children[1];
      arm.position.set(0,-length*.49,0);arm.scale.set(.17,length*.50+.06,.18);
      paw.position.set(0,-length,0);paw.scale.set(.17,.12,.20);
      leg.userData.reachLength=length;
    }
    // While rearing a little at tall furniture, hind paws remain on the floor.
    if(pose.upright>0)for(const i of(active?[0,2]:[0,1,2,3])){
      const leg=legs[i],rest=legRest[i];
      gripPoint.set(rest.x,.12+Math.max(0,Math.sin(pose.stride*(i===0?1:-1)))*.05,rest.z+.065);
      bear.localToWorld(gripPoint);body.worldToLocal(gripPoint);
      limbDirection.copy(gripPoint).sub(leg.position);const length=limbDirection.length();
      leg.quaternion.setFromUnitVectors(down,limbDirection.normalize());
      leg.children[0].position.set(0,-length*.49,0);leg.children[0].scale.set(.18,length*.50+.06,.19);
      leg.children[1].position.set(0,-length,0);leg.children[1].scale.set(.2,.13,.25);
    }
  }
  let disposed=false,width=-1,height=-1,lastState=null,frozenState=null,frozenInput=null,labelKey='',lastPose=null;
  const vector=new THREE.Vector3();
  function resize() {
    if(disposed)return;
    const w=Math.max(1,container.clientWidth||1),h=Math.max(1,container.clientHeight||1);
    if(w===width&&h===height)return;
    width=w;height=h;
    const aspect=w/h,halfHeight=Math.max(6.05,7.25/aspect);
    camera.left=-halfHeight*aspect;camera.right=halfHeight*aspect;camera.top=halfHeight;camera.bottom=-halfHeight;
    camera.position.set(10.5,12.4,15.5);camera.lookAt(0,1.74,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    renderer.setSize(w,h);
  }
  function project(label,position,offset=0) {
    vector.set(...position);vector.y+=offset;vector.project(camera);
    const px=(vector.x*.5+.5)*width,py=(-vector.y*.5+.5)*height;
    label.style.left=`${Math.max(34,Math.min(width-34,px))}px`;label.style.top=`${Math.max(52,Math.min(height-12,py))}px`;
  }
  function updateLabels(frame,pose) {
    const target=getJourneyTarget(frame),taskIndex=Math.max(0,frame.taskIndex||0);
    const separator=target?.kind==='space';
    const activeKey=separator?ROOM_ORDER[Math.max(0,Math.floor(taskIndex/2))]:pose.key;
    const acting=frame.phase==='acting',complete=frame.phase==='complete'||frame.complete;
    const key=[taskIndex,frame.taskChar,frame.phase,target?.text,target?.token,frame.levelId].join(':');
    if(key!==labelKey) {
      labelKey=key;
      for(const word of ROOM_ORDER) {
        const label=labels[word],done=pose.completed.includes(word);clear(label);label.hidden=acting&&word===activeKey;
        if(word!==activeKey||complete) {label.className=`room-object-label ${done?'done':'quiet'}`;label.textContent=done?`✓ ${word}`:word;continue;}
        label.className='room-object-label active';
        const caption=separator?'单词之间留一点空隙':acting?'小熊正在送回家':target?.kind==='backspace'?'多了一个 P，删掉它':'先收拾这个';
        label.appendChild(el('span','room-label-caption',caption));
        const wordNode=el('span','room-word');
        const text=target?.kind==='backspace'&&!acting?'CUPP':word;
        [...text].forEach((letter,i)=> {
          const extra=target?.kind==='backspace'&&!acting&&i===3;
          const accepted=separator||acting||target?.kind==='backspace'&&i<3||i<(frame.taskChar||0);
          const current=!acting&&!separator&&target?.kind!=='backspace'&&i===(frame.taskChar||0);
          wordNode.appendChild(el('span',`letter${extra?' extra':accepted?' accepted':current?' current':''}`,letter));
        });
        label.appendChild(wordNode);
        if(separator||target?.kind==='backspace'&&!acting){
          const instruction=el('span','room-key-instruction');instruction.appendChild(el('kbd','',separator?'Space 空格':'⌫ Backspace'));instruction.appendChild(el('span','',separator?'分开两个单词':'删掉多余的 P'));label.appendChild(instruction);
        }
        label.appendChild(el('span','room-pointer'));
      }
      homeLabel.textContent=acting?`小熊正在${destinationCaption[activeKey]}`:destinationCaption[activeKey];
    }
    for(const word of ROOM_ORDER) {
      const object=pose.objects[word],done=object.location==='destination';
      let offset=word==='BALL'?.60:word==='BOOK'?.49:.72;
      if(done)offset=word==='HAT'?.53:word==='CUP'?.72:word==='BOOK'?.44:.58;
      if(word===activeKey&&separator)offset+=.32;
      project(labels[word],object.position,offset);
      labels[word].style.opacity=acting&&word===activeKey?'0.91':'1';
    }
    homeLabel.hidden=complete||separator;
    const spec=ROOM_OBJECTS[activeKey];project(homeLabel,spec.destination,activeKey==='CUP'?.78:activeKey==='HAT'?.60:.68);
  }
  function updateRoute(pose,frame) {
    const taskIndex=Math.max(0,frame.taskIndex||0),active=taskIndex<7&&!frame.complete&&taskIndex%2===0;
    const spec=ROOM_OBJECTS[pose.key],points=[spec.source,...spec.carry.map(p=>[p[0],.082,p[2]])];
    routeGroup.visible=active&&pose.progress<ROOM_TIMING.place;
    const lengths=points.slice(1).map((p,i)=>distance(points[i],p)),total=lengths.reduce((a,b)=>a+b,0);
    routeDots.forEach((dot,i)=>{let d=(i+1)/(routeDots.length+1)*total,j=0;while(j<lengths.length-1&&d>lengths[j])d-=lengths[j++];const p=mix3(points[j],points[j+1],lengths[j]?d/lengths[j]:0);dot.position.set(p[0],.082,p[2]);});
    const onFloor=pose.objects[pose.key].location==='floor';objectHalo.visible=active&&onFloor;objectHalo.position.set(spec.source[0],0,spec.source[2]);
    tableDestination.visible=active&&pose.key==='CUP'&&pose.progress<ROOM_TIMING.place;
    destinationGroup.visible=active&&pose.key!=='CUP'&&pose.progress<ROOM_TIMING.place;
    destinationGroup.position.set(...spec.destination);destinationGroup.rotation.set(pose.key==='HAT'?0:0,0,pose.key==='HAT'?Math.PI/2:0);
  }
  function render(state={levelId:10,phase:'ready',taskIndex:0,taskChar:0},dt=0) {
    if(disposed)return;
    if(state.paused){if(!frozenState||frozenInput!==state){frozenState={...state};frozenInput=state;}}
    else {frozenState=null;frozenInput=null;}
    const frame=frozenState||state;lastState=frame;
    const pose=sampleRoomPose(frame);lastPose=pose;
    bear.position.set(...pose.root);bear.rotation.set(0,pose.yaw,0);bear.scale.setScalar(ROOM_BEAR_SCALE);
    const rise=pose.key==='HAT'?.20:pose.key==='CUP'?.13:0;
    body.position.set(0,-pose.crouch+rise*pose.upright,0);body.rotation.set(-.45*pose.upright,0,0);body.scale.set(1,1,1);
    head.rotation.set(pose.headPitch,0,0);
    legs.forEach((leg,i)=>{const rest=legRest[i];leg.position.copy(rest);leg.rotation.set((i===0||i===3?1:-1)*pose.gait,0,0);leg.scale.set(1,1,1);leg.children[0].position.set(0,-.21,0);leg.children[0].scale.set(.18,.38,.19);leg.children[1].position.set(0,-.43,.065);leg.children[1].scale.set(.2,.13,.25);leg.userData.reachLength=.43;});
    // Forepaws meet the actual mesh, including while it is lifted onto a shelf.
    // Inverse-kinematic placement keeps the wrist attached instead of a giant swing.
    poseForepaws(pose);
    for(const word of ROOM_ORDER){const object=objects[word],target=pose.objects[word];object.position.set(...target.position);object.rotation.set(...target.rotation);object.visible=true;object.userData.location=target.location;}
    updateRoute(pose,frame);resize();scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);updateLabels(frame,pose);renderer.render(scene,camera);
  }
  const onResize=()=>{if(!disposed){width=-1;render(lastState||undefined);}};
  globalThis.window?.addEventListener('resize',onResize);
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(onResize):null;observer?.observe(container);
  document.fonts?.ready.then(()=>{if(!disposed)render(lastState||undefined);});
  render();
  return {render,
    get debug(){return {...roomScene,labels,labelLayer,homeLabel,routeGroup,destinationGroup,pose:lastPose};},
    dispose(){if(disposed)return;disposed=true;observer?.disconnect();globalThis.window?.removeEventListener('resize',onResize);labelLayer.remove();roomScene.dispose();lastState=frozenState=frozenInput=lastPose=null;},
  };
}
