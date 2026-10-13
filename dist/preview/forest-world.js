import * as THREE from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';

// World coordinates are persistent. The three chapters meet at the same
// physical checkpoint; a key never replaces the clearing beneath the bear.
const GROUND_Y = .105;
const FEATURE_SIDE = { blueMushroom: -1, pond: -1, bridge: -1, hollow: -1, reeds: -1, pavilion: -1, redFlower: 1, beehive: 1, slope: 1, cabin: 1 };
const CHAPTER_X = [[0,-3.2,0,-3.2,0],[0,3.2,0,3.2,0],[0,3.2,0,-3.2,0]];
const ERRAND_NODES = { hub:[0,5], 't-start':[3.2,1], 't-mid':[5,-3.1], 't-end':[3.2,-7.2], 'y-start':[-3.2,1], 'y-mid':[-5,-3.1], 'y-end':[-3.2,-7.2], 't-d0':[.1,-3.1], 't-d1':[8.1,-7.2], 'y-d0':[-.1,-3.1], 'y-d1':[-8.1,-7.2], 't-return':[3.2,-10.5], 't-meet':[1.8,-14.6], 'y-return':[-3.2,-10.5], 'y-meet':[-1.8,-14.6], 't-rd0':[6.6,-14.6], 't-rd1':[5.2,-18.7], 'y-rd0':[-6.6,-14.6], 'y-rd1':[-5.2,-18.7], friend:[0,-18.7] };
const NODE_NAMES = {hub:'林间入口','t-start':'蜂窝路口','t-mid':'木桥边','t-end':'蜂蜜小屋','y-start':'芦苇路口','y-mid':'花径边','y-end':'河边亭','t-return':'桥前路口','t-meet':'木桥尽头','y-return':'花径路口','y-meet':'花径尽头',friend:'朋友的野餐地'};
export function forestCurrentTask(state = {}) {
  return state.task || state.tasks?.[Math.min(state.step || 0, state.tasks.length - 1)] || {};
}
export function forestNodePosition(id, state = {}) {
  const match = /^s([0-2])-([nd])(\d+)$/.exec(String(id));
  if (match) {
    const stage=+match[1],i=Math.max(0,Math.min(match[2]==='n'?4:3,+match[3])),xs=CHAPTER_X[stage];
    return [match[2]==='n'?xs[i]:2*xs[i]-xs[i+1],GROUND_Y,5-16.4*stage-4.1*(match[2]==='n'?i:i+1)];
  }
  const point = ERRAND_NODES[id];
  return point ? [point[0],GROUND_Y,point[1]] : [0,GROUND_Y,5];
}
export function forestBranchSide(state = {}, key, task = forestCurrentTask(state)) {
  const branch=task.branches?.find(item=>item.key===key);
  if(branch?.nodeTo){const a=forestNodePosition(task.nodeFrom||state.nodeId,state),b=forestNodePosition(branch.nodeTo,state);return b[0]<a[0]?-1:1;}
  if(state.level===6&&(key==='T'||key==='Y'))return key==='T'?1:-1;
  const index=task.branches?.findIndex(item=>item.key===key)??-1;
  if(index>=0)return state.level===6?FEATURE_SIDE[task.branches[index].feature]||(index?1:-1):index?1:-1;
  return ['E','R','J'].includes(key)?-1:1;
}
function edgeId(a,b){return [a,b].sort().join('~');}
function chapterId(state){return Math.max(0,Math.min(2,state.lessonStageIndex||0));}
function legacyNode(state){
  if(state.level===5)return `s${chapterId(state)}-n${Math.min(4,state.step||0)}`;
  if(state.stage==='fork'||state.stage==='travel')return `${state.selected==='Y'?'y':'t'}-${state.forkIndex?'mid':'start'}`;
  const last=(state.inventory||state.completed||[]).at(-1);return last?`${last==='Y'?'y':'t'}-end`:'hub';
}
export function forestCurrentNode(state={}){return typeof state.nodeId==='string'?state.nodeId:legacyNode(state);}
function branchNodes(state,task,index){
  const from=task.nodeFrom||`s${chapterId(state)}-n${Math.min(3,index)}`;
  return (task.branches||[]).map(branch=>({...branch,nodeTo:branch.nodeTo||(branch.key===task.correct?`s${chapterId(state)}-n${Math.min(4,index+1)}`:`s${chapterId(state)}-d${Math.min(3,index)}`),nodeFrom:from}));
}
export function forestLayout(state={}){
  const nodes={},edges=new Map(),landmarks=[];
  const addNode=id=>{if(!nodes[id])nodes[id]=forestNodePosition(id,state);return id;};
  const addEdge=(a,b)=>{if(!a||!b||a===b)return;addNode(a);addNode(b);edges.set(edgeId(a,b),{id:edgeId(a,b),from:a,to:b});};
  if(state.level===5){
    for(let stage=0;stage<3;stage++)for(let i=0;i<4;i++){addEdge(`s${stage}-n${i}`,`s${stage}-n${i+1}`);addEdge(`s${stage}-n${i}`,`s${stage}-d${i}`);}
    // Other chapters have fixed scenery too, even before their clues are read.
    const defaults=[['blueMushroom','beehive','bridge','reeds'],['pond','redFlower','hollow','slope'],['blueMushroom','beehiveRibbon','bridgeFootprints','cabinLit']];
    for(let stage=0;stage<3;stage++)for(let i=0;i<4;i++){
      landmarks.push({id:`s${stage}-n${i+1}`,feature:defaults[stage][i],label:'',...(stage===2?{traitPresent:true}:{})});
      landmarks.push({id:`s${stage}-d${i}`,feature:(stage===2?['blueMushroomPlain','beehive','bridgePlain','cabinDark']:['redFlower','pond','slope','hollow'])[i],label:'',...(stage===2?{traitPresent:false}:{})});
    }
    for(const [i,task]of(state.tasks||[]).entries())for(const b of branchNodes(state,task,i)){
      addEdge(b.nodeFrom,b.nodeTo);const previous=landmarks.findIndex(item=>item.id===b.nodeTo);if(previous>=0)landmarks.splice(previous,1);landmarks.push({id:b.nodeTo,feature:b.feature,label:b.label,detail:b.detail||task.detail,traitPresent:b.traitPresent});
    }
  }else{
    for(const [a,b]of[['hub','t-start'],['hub','y-start'],['t-start','t-mid'],['t-start','t-d0'],['t-mid','t-end'],['t-mid','t-d1'],['y-start','y-mid'],['y-start','y-d0'],['y-mid','y-end'],['y-mid','y-d1'],['t-end','y-start'],['y-end','t-start'],['t-end','t-return'],['y-end','y-return'],['t-end','y-return'],['y-end','t-return'],['t-return','t-meet'],['t-return','t-rd0'],['t-meet','friend'],['t-meet','t-rd1'],['y-return','y-meet'],['y-return','y-rd0'],['y-meet','friend'],['y-meet','y-rd1']])addEdge(a,b);
    for(const [id,feature]of[['t-start','beehive'],['t-mid','beehive'],['t-end','cabin'],['y-start','reeds'],['y-mid','reeds'],['y-end','pavilion'],['t-d0','trailEnd'],['t-d1','hollow'],['y-d0','trailEnd'],['y-d1','pond'],['t-return','beehive'],['t-meet','bridge'],['y-return','reeds'],['y-meet','redFlower'],['t-rd0','hollow'],['t-rd1','slope'],['y-rd0','hollow'],['y-rd1','slope'],['friend','picnic']])landmarks.push({id,feature,label:NODE_NAMES[id]||''});
    for(const task of state.tasks||[]){for(const fork of task.forks||[])for(const branch of fork.branches||[])addEdge(fork.nodeFrom,branch.nodeTo);}
  }
  addNode(forestCurrentNode(state));
  return {nodes,edges:[...edges.values()],landmarks};
}
// Shared by scene and tests: all motion follows one connected ground ribbon.
export function forestActionRoute(state={}){
  const a=state.action;if(!a)return {from:forestCurrentNode(state),to:forestCurrentNode(state),points:[forestNodePosition(forestCurrentNode(state),state)],returning:false};
  let from=typeof a.from==='string'&&(a.from in ERRAND_NODES||/^s\d-[nd]\d+$/.test(a.from))?a.from:forestCurrentNode(state),to=a.to;
  if(typeof to!=='string'||!(to in ERRAND_NODES||/^s\d-[nd]\d+$/.test(to))){
    const task=forestCurrentTask(state);
    if(state.level===5)to=task.branches?.find(b=>b.key===a.key)?.nodeTo||`s${chapterId(state)}-${a.type==='detour'?'d':'n'}${Math.min(a.type==='detour'?3:4,(state.step||0)+(a.type==='detour'?0:1))}`;
    else {const prefix=(a.destination||state.selected||a.key)==='Y'?'y':'t';to=`${prefix}-${a.type==='visit'?'start':a.type==='collect'?'end':'mid'}`;}
  }
  const canonical=[from,to].sort(),reversed=from!==canonical[0];
  const start=forestNodePosition(canonical[0],state),end=forestNodePosition(canonical[1],state),dx=end[0]-start[0],dz=end[2]-start[2];
  const bend=Math.min(.65,Math.hypot(dx,dz)*.10),len=Math.hypot(dx,dz)||1;
  const controls=[start,[start[0]+dx*.33-dz/len*bend,GROUND_Y,start[2]+dz*.33+dx/len*bend],[start[0]+dx*.72-dz/len*bend*.45,GROUND_Y,start[2]+dz*.72+dx/len*bend*.45],end];
  const curve=new THREE.CatmullRomCurve3(controls.map(p=>new THREE.Vector3(...p)),false,'catmullrom',.35);
  const points=curve.getPoints(48).map(p=>p.toArray());if(reversed)points.reverse();
  if(a.type==='detour')points.push(...points.slice(0,-1).reverse());
  return {from,to,points,returning:a.type==='detour'};
}
function smooth(t){t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);}
export function forestMotionSample(state={},progress){
  const r=forestActionRoute(state),p=Math.max(0,Math.min(1,progress??(state.action?state.action.elapsed/Math.max(.001,state.action.duration):0)));
  // A short pause at a wrong landmark makes the reason for turning back visible.
  const u=r.returning?(p<.43?.5*smooth(p/.43):p<.55?.5:.5+.5*smooth((p-.55)/.45)):smooth(p);
  const lengths=[0];for(let i=1;i<r.points.length;i++)lengths.push(lengths.at(-1)+Math.hypot(...r.points[i].map((v,j)=>v-r.points[i-1][j])));
  const distance=u*lengths.at(-1);let i=1;while(i<lengths.length-1&&lengths[i]<distance)i++;
  const a=r.points[i-1]||r.points[0],b=r.points[i]||a,m=(distance-(lengths[i-1]||0))/((lengths[i]||0)-(lengths[i-1]||0)||1);
  return {point:a.map((v,j)=>v+(b[j]-v)*m),direction:b.map((v,j)=>v-a[j]),distance,walking:!!state.action&&!(r.returning&&p>=.43&&p<.55)&&p>0&&p<1,from:r.from,to:r.to};
}
export function forestCameraFrame(width,height,focus=[0,0,0]){
  const aspect=Math.max(.25,width/Math.max(1,height)),halfWidth=aspect<1?6.9:Math.max(8.1,Math.min(9.1,aspect*4.35));
  return {left:-halfWidth,right:halfWidth,top:halfWidth/aspect,bottom:-halfWidth/aspect,position:[focus[0],19,focus[2]+23],target:[focus[0],.35,focus[2]-1.35]};
}
export function forestProjectedLabel(point,camera,width,height,boxWidth=150,boxHeight=44){
  const p=new THREE.Vector3(...point).project(camera),pad=8;
  return {x:Math.max(pad+boxWidth/2,Math.min(width-pad-boxWidth/2,(p.x*.5+.5)*width)),y:Math.max(boxHeight+pad,Math.min(height-pad,(-p.y*.5+.5)*height)),visible:p.z>=-1&&p.z<=1&&Math.abs(p.x)<1.25&&Math.abs(p.y)<1.2};
}

function createConnectedForestWorld(host){
let destroyed=false,width=1,height=1,clock=0,sceneToken='',labelToken='',lastState=null,firstFrame=true;
const originalPosition=host.style.position;if(!getComputedStyle(host).position||getComputedStyle(host).position==='static')host.style.position='relative';
const scene=new THREE.Scene();scene.background=new THREE.Color('#b8d09a');scene.fog=new THREE.Fog('#b8d09a',38,70);
let renderer;try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}catch(error){throw new Error('森林场景无法启动：'+error.message);}
renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.6));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
renderer.domElement.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block';host.appendChild(renderer.domElement);
const camera=new THREE.OrthographicCamera(-9,9,6,-6,.1,100),cameraFocus=new THREE.Vector3();
scene.add(new THREE.HemisphereLight('#fff8d9','#70966c',1.8));scene.add(new THREE.AmbientLight('#e6efd3',.28));
const sun=new THREE.DirectionalLight('#fff0c9',2.25);sun.position.set(-12,23,14);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-14,right:14,top:14,bottom:-14});sun.shadow.bias=-.00065;sun.shadow.normalBias=.035;sun.shadow.radius=5;scene.add(sun);scene.add(sun.target);
const mats=new Map(),disposables=[];
function mat(color){if(!mats.has(color))mats.set(color,new THREE.MeshStandardMaterial({color,roughness:.95,flatShading:true}));return mats.get(color);}
function mesh(geometry,color,p=[0,0,0],s=[1,1,1],parent=scene){const m=new THREE.Mesh(geometry,typeof color==='string'?mat(color):color);m.position.set(...p);m.scale.set(...s);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
const sphere=new THREE.SphereGeometry(1,12,8),ico=new THREE.IcosahedronGeometry(1,1),box=new THREE.BoxGeometry(1,1,1);
const ell=(c,p,s,g)=>mesh(sphere,c,p,s,g),block=(c,p,s,g)=>mesh(box,c,p,s,g);
const cylinder=(c,p,rt,rb,h,g=scene,segments=9)=>mesh(new THREE.CylinderGeometry(rt,rb,h,segments),c,p,[1,1,1],g);
function beam(a,b,r,c,g=scene){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),m=cylinder(c,av.clone().add(bv).multiplyScalar(.5).toArray(),r,r,av.distanceTo(bv),g);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),bv.sub(av).normalize());return m;}
let seed=3381;const rnd=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296),range=(a,b)=>a+rnd()*(b-a);
let landscape=new THREE.Group();landscape.name='connected-forest-landscape';scene.add(landscape);
function tree(x,z,s=1,pine=false) {
  const g=new THREE.Group();g.userData.canopyTree=true;g.position.set(x,0,z);g.scale.setScalar(s);landscape.add(g);
  cylinder('#94734e',[0,1.25,0],.17,.25,2.5,g);
  if(pine) for(let i=0;i<3;i++) {
    const m=mesh(new THREE.ConeGeometry(1.28-i*.22,1.8,7),['#678b54','#789a5d','#8aac68'][i],[0,1.7+i*.72,0],[1,1,1],g);m.rotation.y=i*.3;
  } else {
    beam([0,1.35,0],[-.53,2.1,.12],.1,'#94734e',g);beam([0,1.6,0],[.53,2.28,0],.1,'#94734e',g);
    for(const [dx,dy,dz,k] of [[0,2.8,0,1.30],[-.7,2.54,.15,.88],[.76,2.74,.05,.88],[0,3.39,-.07,.82]]) {
      const m=mesh(ico,['#86a95d','#9abb6b','#abc87b','#91b363'][Math.floor(rnd()*4)],[dx,dy,dz],[k,k,k],g);m.rotation.set(rnd(),rnd(),rnd());
    }
  }
  return g;
}
function bush(x,z,s=1,color='#91b468') { const g=new THREE.Group();g.position.set(x,.07,z);landscape.add(g);for(const [a,b,c,k] of [[0,.3,0,.59],[-.37,.23,.11,.41],[.35,.22,-.04,.39]]){const m=mesh(ico,color,[a*s,b*s,c*s],[k*s,k*s*.65,k*s],g);m.rotation.y=rnd()*6;} }
function grass(x,z,s=.8) { const g=new THREE.Group();g.position.set(x,.07,z);landscape.add(g);for(let j=0;j<3;j++){const m=mesh(new THREE.ConeGeometry(.048*s,.32*s,3),j%2?'#9ab362':'#86a551',[range(-.10,.10),.12*s,range(-.10,.10)],[1,1,1],g);m.rotation.z=range(-.3,.3);} }
function flower(x,z,s=1,c='#fff4cf',parent=landscape) {
  const g=new THREE.Group();g.position.set(x,.08,z);g.scale.setScalar(s);parent.add(g);
  beam([0,0,0],[0,.27,0],.015,'#7f9b50',g);ell('#89a35d',[.065,.11,0],[.10,.02,.045],g);
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5;ell(c,[Math.sin(a)*.092,.29,Math.cos(a)*.092],[.078,.025,.075],g);}
  ell('#e5ba54',[0,.31,0],[.049,.03,.049],g);
}
function mushroom(x,z,s=1,parent=landscape,color='#ce7256') {
  const g=new THREE.Group();g.position.set(x,.11,z);g.scale.setScalar(s);parent.add(g);
  cylinder('#ebdaba',[0,.52,0],.23,.30,1.04,g,11);
  ell('#dac69f',[0,.25,0],[.33,.27,.32],g);
  cylinder('#ebd9ad',[0,1.04,0],.90,.94,.105,g,14);
  const cap=mesh(new THREE.SphereGeometry(1,16,8,0,Math.PI*2,0,Math.PI/2),color,[0,1.07,0],[.98,.66,.98],g);
  for(const [x,z,k] of [[-.42,.38,.16],[.30,.50,.13],[.11,-.16,.20],[-.52,-.29,.13],[.57,-.16,.13]]) {
    const y=1.07+.66*Math.sqrt(1-x*x-z*z);
    const dot=ell('#f7e7bf',[x,y+.015,z],[k,.022,k*.85],g);dot.rotation.z=-x*.6;dot.rotation.x=z*.6;
  }
  return g;
}
function cottage(parent,x,z,lit=true){
 const g=new THREE.Group();g.position.set(x,.08,z);g.scale.setScalar(.87);parent.add(g);
 block('#e5cf9e',[0,.95,0],[2.02,1.87,1.62],g);
 for(const s of[-1,1]){const roof=block('#ac6e46',[s*.56,2.11,0],[1.50,.19,2.04],g);roof.rotation.z=s*-.58;}
 block('#865e3c',[-.37,.69,.825],[.59,1.32,.08],g);ell('#e5be60',[-.18,.72,.89],[.042,.042,.025],g);
 block('#966e43',[.53,1.02,.83],[.62,.70,.10],g);
 const glow=new THREE.MeshStandardMaterial({color:lit?'#ffdf7c':'#596452',emissive:lit?'#f6be4c':'#000000',emissiveIntensity:lit?1.0:0,roughness:.8});disposables.push(glow);
 const window=block(glow,[.53,1.02,.9],[.46,.54,.035],g);window.name=lit?'forest-lit-window':'forest-dark-window';window.userData.forestTrait=true;block('#ad8750',[.53,1.02,.925],[.045,.57,.035],g);block('#ad8750',[.53,1.02,.925],[.49,.045,.035],g);
 block('#bd9968',[0,.11,1.03],[2.20,.17,.52],g);block('#a57b54',[-.71,2.22,-.48],[.32,.73,.40],g);
 return g;
}

// Established v8 island bear, with the same four paws, amber fur, and cream muzzle.
const bear=new THREE.Group();bear.name='bear-considering-the-fork';bear.position.set(0,.105,4.34);bear.scale.setScalar(.94);bear.rotation.y=2.62;scene.add(bear);
const body=new THREE.Group();bear.add(body);
ell('#aa6b32',[0,.7,-.27],[.52,.57,.75],body);ell('#c4833c',[0,.88,-.2],[.48,.50,.62],body);ell('#b77633',[0,.92,-.91],[.16,.18,.17],body);
const legs=[];
for(const x of[-.33,.33])for(const z of[-.67,.22]){const leg=new THREE.Group();leg.position.set(x,.55,z);body.add(leg);legs.push(leg);ell('#aa6930',[0,-.21,0],[.18,.38,.19],leg);ell('#814d25',[0,-.43,.065],[.2,.13,.25],leg);}
const head=new THREE.Group();head.position.set(0,1.25,.43);head.rotation.y=-.38;body.add(head);ell('#bd7b37',[0,0,0],[.53,.54,.46],head);ell('#cb8a44',[0,.07,.12],[.46,.46,.37],head);
for(const x of[-.38,.38]){ell('#a5652f',[x,.40,-.05],[.20,.21,.13],head);ell('#7e4b2b',[x,.42,.055],[.115,.13,.06],head);}
ell('#ead3a1',[0,-.17,.42],[.28,.23,.19],head);ell('#3c3426',[0,-.06,.596],[.106,.077,.057],head);
for(const x of[-.23,.23]){ell('#342e22',[x,.08,.402],[.058,.079,.043],head);ell('#fff3d0',[x-.012,.11,.435],[.019,.024,.012],head);}


const rabbit=new THREE.Group();rabbit.name='rabbit-beside-red-mushroom';rabbit.position.set(4.64,.1,-3.15);rabbit.rotation.y=.05;scene.add(rabbit);
ell('#ecdfc3',[0,.37,0],[.33,.4,.31],rabbit);ell('#fff1d6',[0,.65,.14],[.34,.33,.29],rabbit);
for(const x of[-.15,.15]) {const ear=ell('#f1e6cd',[x,1.10,.10],[.115,.38,.105],rabbit);ear.rotation.z=-x*.7;const inner=ell('#dca99a',[x,1.13,.187],[.052,.25,.021],rabbit);inner.rotation.z=-x*.7;ell('#e3d4b6',[x,.115,.18],[.17,.11,.25],rabbit);ell('#4a4334',[x*.94,.71,.397],[.035,.045,.027],rabbit);}
ell('#d59888',[0,.59,.445],[.048,.034,.025],rabbit);ell('#f9ebd0',[.29,.33,-.11],[.16,.17,.16],rabbit);


function honeyJar(parent,pos,scale=1){const g=new THREE.Group();g.position.set(...pos);g.scale.setScalar(scale);parent.add(g);cylinder('#e8b85a',[0,.19,0],.17,.19,.38,g,12);cylinder('#aa7540',[0,.4,0],.18,.18,.07,g,12);block('#fff1c3',[0,.2,.17],[.21,.15,.014],g);ell('#b6843e',[0,.2,.185],[.058,.044,.012],g);return g;}
function juiceBottle(parent,pos,scale=1){const g=new THREE.Group();g.position.set(...pos);g.scale.setScalar(scale);parent.add(g);cylinder('#d88c62',[0,.22,0],.14,.16,.39,g,12);cylinder('#e4b777',[0,.455,0],.075,.11,.13,g,12);cylinder('#78a071',[0,.55,0],.085,.085,.07,g,12);block('#fff0cf',[0,.22,.145],[.21,.15,.014],g);ell('#d6a24f',[0,.22,.16],[.052,.054,.011],g);return g;}

// The basket belongs to the traveller: collected supplies stay visible through
// both later chapters instead of vanishing into a resettable hub prop.
const basket=new THREE.Group();basket.name='persistent-picnic-basket';basket.position.set(0,1.01,-.34);basket.scale.setScalar(.72);bear.add(basket);
block('#bb9056',[0,.20,0],[.87,.38,.61],basket);block('#dbc089',[0,.40,0],[.91,.09,.65],basket);
for(let i=0;i<5;i++)block('#a47b47',[-.35+i*.175,.2,.315],[.024,.32,.014],basket);
const handle=mesh(new THREE.TorusGeometry(.33,.035,6,16,Math.PI),'#9e7444',[0,.4,0],[1,1,1],basket);
const basketHoney=honeyJar(basket,[-.21,.31,0],1.02),basketJuice=juiceBottle(basket,[.21,.31,0],.98);basketHoney.name='basket-honey';basketJuice.name='basket-juice';
let waitingHoney=null,waitingJuice=null,worldLayout=null;
const visitedTrails=new Map(),landmarkRecords=new Map(),landmarkGroups=new Map();let routeClearancePoints=[],signOccluders=[];
function ribbon(points,width,color,y=.065,parent=landscape){
 const positions=[],indices=[];
 for(let i=0;i<points.length;i++){
  const p=points[i],a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b[0]-a[0],dz=b[2]-a[2],l=Math.hypot(dx,dz)||1,nx=-dz/l,nz=dx/l;
  positions.push(p[0]+nx*width/2,y,p[2]+nz*width/2,p[0]-nx*width/2,y,p[2]-nz*width/2);
  if(i<points.length-1){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();const m=mesh(geometry,color,[0,0,0],[1,1,1],parent);m.castShadow=false;return m;
}
function solidMeshBounds(root){
 root.updateMatrixWorld(true);const solid=new THREE.Box3();root.traverse(child=>{if(!child.isMesh)return;const b=new THREE.Box3(),vertices=child.geometry.getAttribute('position'),v=new THREE.Vector3();for(let i=0;i<vertices.count;i++)b.expandByPoint(v.fromBufferAttribute(vertices,i).applyMatrix4(child.matrixWorld));if(b.max.y>.18&&b.min.y<2.0)solid.union(b);});return solid;
}
function routeMarginForBounds(box){let margin=Infinity;for(const q of routeClearancePoints){const dx=Math.max(box.min.x-q[0],0,q[0]-box.max.x),dz=Math.max(box.min.z-q[2],0,q[2]-box.max.z);margin=Math.min(margin,Math.hypot(dx,dz)-(q[3]||0));}return margin;}
function terrainFeature(record){
 const p=record.position||forestNodePosition(record.id),g=new THREE.Group();g.name=`forest-landmark-${record.id}-${record.feature}`;
 const chapterNode=/^s([0-2])-n([1-4])$/.exec(record.id),previousX=chapterNode?CHAPTER_X[+chapterNode[1]][+chapterNode[2]-1]:0;const outward=Math.abs(p[0])<.2&&previousX>0?-1:p[0]<-.2?-1:1;landscape.add(g);landmarkGroups.set(record.id,g);
 const patch=ell('#adc681',[0,.075,0],[1.4,.055,1.02],g);patch.castShadow=false;
 const feature=({blueMushroomPlain:'blueMushroom',beehiveRibbon:'beehive',bridgeFootprints:'bridge',bridgePlain:'bridge',cabinLit:'cabin',cabinDark:'cabin'})[record.feature]||record.feature;
 const traitPresent=record.traitPresent??!['blueMushroomPlain','bridgePlain','cabinDark'].includes(record.feature);
 g.userData={featureFamily:feature,traitPresent};
 function trait(name){const root=new THREE.Group();root.name=`forest-trait-${record.id}-${name}`;root.userData.forestTrait=true;g.add(root);return root;}
 if(feature==='blueMushroom'||feature==='mushroomDecoy'){
  mushroom(0,0,.88,g,feature==='blueMushroom'?'#6f9fab':'#cb7357');mushroom(-.7,.35,.40,g,feature==='blueMushroom'?'#80b4be':'#d68162');
  if(traitPresent){const stump=trait('stump');cylinder('#a68156',[1.00,.32,.23],.34,.42,.64,stump);cylinder('#d4b784',[1.00,.655,.23],.33,.34,.035,stump);}
 }else if(feature==='redFlower'){
  for(let i=0;i<8;i++)flower(Math.sin(i*2.4)*.54,Math.cos(i*2.4)*.40,2.25,'#d97660',g);
 }else if(feature==='beehive'){
  cylinder('#94734e',[.3,1.13,-.12],.16,.23,2.26,g);beam([.3,1.5,-.12],[-.4,2.0,0],.1,'#94734e',g);
  for(const[x,y,z,s]of[[.3,2.63,-.15,.85],[-.32,2.6,-.22,.60],[.82,2.47,-.15,.62]])mesh(ico,'#96b76b',[x,y,z],[s,s*.9,s],g);
  for(let i=0;i<5;i++)ell(i%2?'#d6ac54':'#e8bc64',[-.36,1.73-i*.11,.05],[.35-Math.abs(2-i)*.05,.11,.29-Math.abs(2-i)*.03],g);
  ell('#79603f',[-.36,1.52,.33],[.07,.08,.012],g);
  if(record.feature==='beehiveRibbon'||record.traitPresent===true){const bow=trait('ribbon');block('#d58b6b',[.3,1.08,.12],[.46,.19,.08],bow);for(const side of[-1,1]){const tail=block('#df9c7b',[.3+side*.16,.89,.14],[.12,.36,.06],bow);tail.rotation.z=side*.32;}}
 }else if(feature==='pond'||feature==='reeds'){
  ell('#c0d6c1',[0,.11,-.1],[1.2,.065,.90],g).castShadow=false;ell('#85bcc0',[0,.16,-.1],[1.07,.038,.77],g).castShadow=false;
  for(const[x,z]of[[-.8,-.5],[.8,-.6],[-.95,.15]])for(let i=0;i<3;i++){const xx=x+i*.09,h=.55+i*.16;beam([xx,.1,z],[xx+.03,h,z],.022,'#829455',g);ell('#a98a54',[xx+.03,h,z],[.045,.11,.042],g);}
  for(const[x,z]of[[-.45,-.13],[.47,-.37]]){const pad=mesh(new THREE.CircleGeometry(.22,10,.1,5.8),'#97b766',[x,.21,z],[1,1,1],g);pad.rotation.x=-Math.PI/2;pad.castShadow=false;}
 }else if(feature==='bridge'){
  ell('#92bdba',[0,.10,0],[1.35,.045,.92],g).castShadow=false;
  for(let i=0;i<7;i++)block(i%2?'#b68c57':'#c59d65',[0,.20,-.81+i*.27],[1.22,.13,.24],g);
  for(const x of[-.67,.67]){for(const z of[-.77,.8])cylinder('#9b754c',[x,.5,z],.052,.07,.73,g);beam([x,.8,-.83],[x,.8,.86],.045,'#bc955d',g);}
  if(traitPresent){const footprints=trait('footprints');for(let i=0;i<3;i++)for(const side of[-1,1])ell('#a18d67',[side*.15,.087,1.18+i*.28],[.080,.011,.12],footprints);}
 }else if(feature==='hollow'){
  cylinder('#a68156',[0,.82,0],.54,.70,1.60,g,11);cylinder('#cfb286',[0,1.64,0],.54,.57,.055,g,11);ell('#5b523b',[0,.65,.64],[.30,.43,.038],g);ell('#8f734d',[0,.2,.65],[.36,.08,.14],g);
 }else if(feature==='slope'){
  for(let i=0;i<6;i++){const a=i*2.5,m=mesh(ico,i%2?'#b5b399':'#9eaa8b',[Math.cos(a)*.47,.23+(i%3)*.13,Math.sin(a)*.44],[.44,.33,.38],g);m.rotation.set(.1*i,.6*i,0);}
 }else if(feature==='cabin'){
  cottage(g,0,-.35,traitPresent);if(record.id==='t-end')waitingHoney=honeyJar(g,[-.6,.29,.82],1.1);
 }else if(feature==='pavilion'){
  block('#b69761',[0,.12,0],[1.6,.16,1.24],g);for(const x of[-.68,.68])for(const z of[-.5,.5])cylinder('#a27e50',[x,.88,z],.065,.08,1.65,g);
  mesh(new THREE.ConeGeometry(1.28,.60,4),'#b98852',[0,1.93,0],[1,1,.9],g).rotation.y=Math.PI/4;block('#d4b984',[0,.49,-.2],[1.22,.12,.37],g);waitingJuice=juiceBottle(g,[0,.57,0],1.05);
 }else if(feature==='picnic'){
  block('#dfb489',[0,.11,0],[2.2,.06,1.58],g);for(const x of[-.8,-.25,.3,.85])block('#efcba1',[x,.149,0],[.12,.008,1.58],g);for(const z of[-.5,0,.5])block('#f1d7b1',[0,.15,z],[2.2,.008,.11],g);
 }
 // Keep the bear's swept capsule (0.60 radius, ±0.50 fore/aft) and
 // the full 1.08-radius turning circle at every stop clear of solid props.
 // Bounds come from the actual low-poly meshes, rather than a per-prop guess.
 // Low grass/footprint/ground patches do not count as solid obstacles.
 const solid=solidMeshBounds(g);
 if(solid.isEmpty())solid.set(new THREE.Vector3(-.65,0,-.5),new THREE.Vector3(.65,1,.5));
 if(record.feature==='trailEnd'){g.position.set(p[0],0,p[2]);return g;}
 const candidates=[];
 for(const lateral of[2.1,2.5,2.9,3.3,3.7,4.1,4.5])for(const along of[0,.65,-.65,1.3,-1.3,1.95,-1.95,2.6,-2.6])candidates.push({x:p[0]+outward*lateral,z:p[2]+along,cost:lateral+Math.abs(along)*.58});
 candidates.sort((a,b)=>a.cost-b.cost);let chosen=null,bestClear=-1;
 for(const c of candidates){let clearance=Infinity;for(const q of routeClearancePoints){const dx=Math.max(solid.min.x+c.x-q[0],0,q[0]-solid.max.x-c.x),dz=Math.max(solid.min.z+c.z-q[2],0,q[2]-solid.max.z-c.z);clearance=Math.min(clearance,Math.hypot(dx,dz)-(q[3]||0));}if(clearance>bestClear){bestClear=clearance;chosen=c;}if(clearance>=.04){chosen=c;break;}}
 g.position.set(chosen.x,0,chosen.z);g.userData.routeMargin=bestClear;g.userData.solidBounds={min:[solid.min.x+chosen.x,solid.min.y,solid.min.z+chosen.z],max:[solid.max.x+chosen.x,solid.max.y,solid.max.z+chosen.z]};
 return g;
}
function disposeRoot(root){const geometries=new Set(),textures=new Set(),materials=new Set();root.traverse(o=>{if(o.geometry&&o.geometry!==sphere&&o.geometry!==ico&&o.geometry!==box)geometries.add(o.geometry);if(o.material?.map){textures.add(o.material.map);materials.add(o.material);}});for(const g of geometries)g.dispose();for(const t of textures)t.dispose();for(const m of materials)m.dispose();root.removeFromParent();}
function batchLandscape(){
 const batches=new Map(),remove=[];landscape.updateMatrixWorld(true);
 // Waiting items remain independent so collecting one can remove it accurately.
 const dynamic=new Set();for(const item of[waitingHoney,waitingJuice])item?.traverse(o=>dynamic.add(o));landscape.traverse(o=>{if(o.userData.forestTrait)o.traverse(child=>dynamic.add(child));});
 landscape.traverse(o=>{if(!o.isMesh||dynamic.has(o)||o.material.transparent)return;const key=o.material.uuid;if(!batches.has(key))batches.set(key,{material:o.material,geometries:[]});const geometry=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(o.matrixWorld);geometry.deleteAttribute('uv');batches.get(key).geometries.push(geometry);remove.push(o);});
 for(const m of remove)m.removeFromParent();
 for(const batch of batches.values()){const geometry=mergeGeometries(batch.geometries,false);if(geometry){const m=new THREE.Mesh(geometry,batch.material);m.castShadow=m.receiveShadow=true;landscape.add(m);}for(const g of batch.geometries)g.dispose();}
}
const trailRoot=new THREE.Group();trailRoot.name='walked-forest-trail';scene.add(trailRoot);
const signRoot=new THREE.Group();signRoot.name='current-junction-signposts';scene.add(signRoot);
function makeSign(){
 const group=new THREE.Group();signRoot.add(group);cylinder('#a18051',[0,.51,0],.065,.082,1.02,group);
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=192;const ctx=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,depthTest:false,toneMapped:false});const panel=mesh(new THREE.PlaneGeometry(1.03,.77),material,[0,1.18,0],[1,1,1],group);panel.name='active-forest-key-panel';panel.renderOrder=1000;panel.castShadow=panel.receiveShadow=false;
 let token='';return{group,panel,set(key,done,active,side){const next=[key,done,active,side].join();if(next===token)return;token=next;ctx.clearRect(0,0,256,192);ctx.fillStyle='#b29461';ctx.beginPath();ctx.roundRect(5,10,246,178,19);ctx.fill();ctx.fillStyle=active?'#fff1c9':done?'#dce2b8':'#efddb0';ctx.beginPath();ctx.roundRect(5,3,246,178,19);ctx.fill();ctx.strokeStyle='#c7b27d';ctx.lineWidth=4;ctx.stroke();ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#50603f';ctx.font='800 116px Arial';ctx.fillText(key,128,78);ctx.font='700 44px Arial';ctx.fillText(done?'✓':side<0?'←':'→',128,146);texture.needsUpdate=true;}};
}
const signs=[makeSign(),makeSign()];let signAnchor=null,signPlacementToken='';const signRay=new THREE.Raycaster();
function placeReadableSigns(){
 if(!signAnchor||!signs.some(s=>s.group.visible))return;
 const token=[labelToken,width,height,Math.round(cameraFocus.x*2),Math.round(cameraFocus.z*2)].join('|');if(token===signPlacementToken)return;signPlacementToken=token;
 for(let i=0;i<2;i++){
  const sign=signs[i];if(!sign.group.visible)continue;let found=false;
  for(const z of[-1.45,.8,2.3,3.3,-2.6,4.0,-3.8,-4.6]){for(const x of[1.9,2.45,1.4,3.0]){
   let clear=true;sign.group.position.set(signAnchor[0]+(i?x:-x),.08,signAnchor[2]+z);sign.group.updateMatrixWorld(true);
   for(const[a,b]of[[0,0],[-.27,.10],[.27,.10],[-.27,.27],[.27,.27]]){const target=sign.panel.localToWorld(new THREE.Vector3(a,b,0)),projection=target.clone().project(camera),delta=target.sub(camera.position);if(Math.abs(projection.x)>.93||Math.abs(projection.y)>.88){clear=false;break;}signRay.set(camera.position,delta.clone().normalize());signRay.far=delta.length()-.02;if(signOccluders.some(box=>{const hit=signRay.ray.intersectBox(box,new THREE.Vector3());return hit&&hit.distanceTo(camera.position)<signRay.far;})){clear=false;break;}}
   if(clear){found=true;break;}
  }if(found)break;}
  // Retain an independent, depth-free interaction plane at cramped views.
  if(!found)sign.group.position.set(signAnchor[0]+(i?1.9:-1.9),.08,signAnchor[2]+2.3);
 }
}

function buildLandscape(state){
 const levelChanged=lastState&&lastState.level!==state.level;if(levelChanged)landmarkRecords.clear();
 disposeRoot(landscape);landscape=new THREE.Group();landscape.name='connected-forest-landscape';scene.add(landscape);waitingHoney=waitingJuice=null;landmarkGroups.clear();seed=3381;
 worldLayout=forestLayout(state);
 for(const record of worldLayout.landmarks){if(!landmarkRecords.has(record.id)||record.id.startsWith(`s${chapterId(state)}-`))landmarkRecords.set(record.id,record);}
 const plane=new THREE.PlaneGeometry(90,110);plane.rotateX(-Math.PI/2);mesh(plane,'#b7cf88',[0,-.03,-15],[1,1,1],landscape).castShadow=false;
 for(const z of state.level===5?[7,-8,-24,-40]:[4,-10,-20])ell('#c3d694',[0,-.19,z],[10.5,.23,11.4],landscape).castShadow=false;
 const allPathPoints=[];routeClearancePoints=[];
 for(const edge of worldLayout.edges){const r=forestActionRoute({...state,action:{type:'walk',from:edge.from,to:edge.to,key:'',duration:1,elapsed:0}});allPathPoints.push(...r.points.filter((_,i)=>i%6===0));for(let j=0;j<r.points.length;j++){const p=r.points[j],a=r.points[Math.max(0,j-1)],b=r.points[Math.min(r.points.length-1,j+1)],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz)||1;for(const lead of[-.5,0,.5])routeClearancePoints.push([p[0]+dx/length*lead,p[1],p[2]+dz/length*lead,.60]);}for(const p of[r.points[0],r.points.at(-1)])routeClearancePoints.push([...p,1.08]);ribbon(r.points,1.64,'#b0bf82',.052);ribbon(r.points,1.45,'#ddca9f');
  for(let i=0;i<14;i++){const p=r.points[Math.floor(range(2,r.points.length-2))];ell(i%3?'#cfba8e':'#e7d4a9',[p[0]+range(-.45,.45),.08,p[2]+range(-.32,.32)],[range(.026,.046),.008,range(.035,.060)],landscape).castShadow=false;}
 }
 for(const record of [...landmarkRecords.values()].sort((a,b)=>a.id.localeCompare(b.id)))terrainFeature(record);
 if(state.level===6){terrainFeature({id:'t-mid-bridge',feature:'bridge',position:[3.5,GROUND_Y,-4.7]});terrainFeature({id:'y-mid-flowers',feature:'redFlower',position:[-3.1,GROUND_Y,-4.5]});}
 // Trees grow beside the entire route, never through an active branch or sign.
 const minZ=state.level===5?-47:-23;
 for(let z=8;z>=minZ;z-=3.6)for(const side of[-1,1]){const x=side*range(8.3,11.1);tree(x,z+range(-.6,.6),range(.91,1.2),rnd()<.32);if(rnd()<.48)bush(side*range(6.8,8.0),z+1.2,range(.8,1.12));}
 for(let i=0;i<(state.level===5?56:25);i++){
  const x=range(-7.1,7.1),z=range(minZ,8);if(allPathPoints.some(p=>Math.hypot(p[0]-x,p[2]-z)<1.7))continue;
  for(let j=0;j<3;j++)grass(x+range(-.24,.24),z+range(-.25,.25),range(.7,1));if(i%3===0)for(let j=0;j<3;j++)flower(x+range(-.30,.30),z+range(-.2,.2),range(.9,1.35));
 }
 for(const root of landscape.children.filter(child=>child.userData.canopyTree)){
  let bounds=solidMeshBounds(root),margin=routeMarginForBounds(bounds),tries=0;while(margin<.04&&tries++<8){root.position.x+=root.position.x<0?-.65:.65;bounds=solidMeshBounds(root);margin=routeMarginForBounds(bounds);}
  root.userData.routeMargin=margin;root.userData.solidBounds={min:bounds.min.toArray(),max:bounds.max.toArray()};
 }
 landscape.updateMatrixWorld(true);signOccluders=landscape.children.filter(child=>child.isGroup).map(child=>new THREE.Box3().setFromObject(child)).filter(box=>!box.isEmpty()&&box.max.y>1.05);
 batchLandscape();
 // Breadcrumb meshes are stable for the lifetime of a chapter, and history
 // rehydrates them after refreshing or crossing a checkpoint.
 for(const child of [...trailRoot.children])disposeRoot(child);visitedTrails.clear();
 for(const edge of worldLayout.edges){const r=forestActionRoute({...state,action:{type:'walk',from:edge.from,to:edge.to,key:'',duration:1,elapsed:0}}),g=new THREE.Group();g.name=`walked-trail-${edge.id}`;g.visible=false;trailRoot.add(g);for(let i=4;i<r.points.length-2;i+=5){const p=r.points[i],next=r.points[i+1],angle=Math.atan2(next[0]-p[0],next[2]-p[2]);for(const s of[-1,1]){const foot=ell('#9e966b',[p[0]+Math.cos(angle)*s*.15,.092,p[2]-Math.sin(angle)*s*.15],[.056,.012,.105],g);foot.rotation.y=angle;foot.castShadow=false;}}visitedTrails.set(edge.id,g);}
}

const labels=document.createElement('div');labels.setAttribute('aria-hidden','true');labels.style.cssText='position:absolute;inset:0;pointer-events:none;overflow:hidden';host.appendChild(labels);
function label(kind){const el=document.createElement('div');el.className=`forest-world-label forest-world-${kind}`;el.style.cssText='position:absolute;transform:translate(-50%,-100%);box-sizing:border-box;font-family:system-ui,-apple-system,"Noto Sans SC",sans-serif;color:#485b37;text-align:center;';
 el.style.cssText+=kind==='clue'?'width:max-content;max-width:min(290px,72vw);white-space:normal;padding:9px 13px;border:1px solid #fff8df;border-radius:15px;background:rgba(255,250,229,.95);box-shadow:0 4px 14px #55653e12;font-size:clamp(13px,1.25vw,16px);font-weight:700;line-height:1.5;':'max-width:170px;padding:4px 8px;border-radius:10px;background:rgba(255,249,224,.91);font-size:clamp(11px,1.0vw,13px);font-weight:650;line-height:1.4;white-space:nowrap;';
 labels.appendChild(el);return{el,point:[0,0,0],visible:true};}
const clueLabel=label('clue'),leftLabel=label('landmark'),rightLabel=label('landmark'),basketLabel=label('basket'),locationLabel=label('location');
const allLabels=[clueLabel,leftLabel,rightLabel,basketLabel,locationLabel];
function taskChoices(state){
 const task=forestCurrentTask(state);
 if(state.level===6&&(state.stage==='select'||state.stage==='travel'))return (state.tasks||[]).map(t=>({key:t.key,label:t.routeOnly?t.label:`${t.label}方向`,nodeTo:t.startNode||t.nodeTo||`${t.key==='Y'?'y':'t'}-${t.routeOnly?'mid':'start'}`,done:(state.completed||[]).includes(t.id)||(state.lessonStageIndex<2&&(state.inventory||[]).includes(t.key))}));
 if(state.level===5)return branchNodes(state,task,Math.min(3,state.step||0));
 return(task.branches||[]).map((b,i)=>({...b,nodeTo:b.nodeTo||`${state.selected==='Y'?'y':'t'}-${b.key===task.correct?(state.forkIndex?'end':'mid'):'d'+Math.min(1,state.forkIndex||0)}`}));
}
function updateLabels(state){
 const task=forestCurrentTask(state),current=forestCurrentNode(state),p=forestNodePosition(current,state),complete=state.stageReady||state.phase==='complete',choices=taskChoices(state);
 const anchor=state.action?.from&&typeof state.action.from==='string'?forestNodePosition(state.action.from,state):p;signAnchor=anchor;signPlacementToken='';
 clueLabel.point=[anchor[0],3.05,anchor[2]-1.65];
 let clue=task.clue||'蜂蜜和果汁，先去哪一处？';
 if(state.level===6&&state.stage==='select')clue=state.lessonStageIndex===2?'篮子准备好了，走哪条路去野餐？':state.inventory?.length?'带好已取到的一份，去找另一份':'蜂蜜和果汁，先去哪一处？';
 if(state.action?.type==='detour')clue='这条路和线索不同，回到刚才的路口';
 else if(complete)clue=state.level===5?(state.solved?'找到朋友啦！':state.lessonStageIndex===0?'走到溪边啦，接着往森林深处走':'穿过溪边小径啦，朋友就在前面'):state.solved?'两份点心都送到朋友身边啦':`${(state.inventory||[]).includes('T')?'蜂蜜':'果汁'}收好啦，继续带着走`;
 const preview=task.routePreview;
 if(!complete&&!state.action&&Array.isArray(preview)&&preview.length>1&&!clue.includes('→'))clue+='\n接着找：'+preview.map(item=>typeof item==='string'?item:item.label||item.feature||'').filter(Boolean).slice(0,2).join(' → ');
 clueLabel.el.textContent=clue;clueLabel.el.style.whiteSpace='pre-line';
 const sorted=choices.map(c=>({...c,point:forestNodePosition(c.nodeTo,state)})).sort((a,b)=>a.point[0]-b.point[0]);
 for(let i=0;i<2;i++){
  const choice=sorted[i],lab=i?rightLabel:leftLabel,sign=signs[i];lab.visible=!!choice&&!complete;sign.group.visible=!!choice&&!complete;
  if(!choice)continue;
  const dest=choice.point,side=i?1:-1;
  // Active boards stand on the near side of this fork, ahead of the old
  // landmark canopy. Their letters also render in the interaction layer.
  sign.group.position.set(anchor[0]+side*1.5,.08,anchor[2]+2.8);
  sign.set(choice.key,!!choice.done,state.action?.key===choice.key,side);
  const landmark=landmarkGroups.get(choice.nodeTo)?.position;lab.point=[landmark?.x??dest[0],.33,(landmark?.z??dest[2])+1.1];lab.el.textContent=choice.label;lab.el.style.opacity=choice.done?'.58':'1';
 }
 const previousTask=state.level===5&&state.step>0?state.tasks?.[Math.min(state.step-1,state.tasks.length-1)]:null,currentLandmark=previousTask?.branches?.find(branch=>branch.key===previousTask.correct)?.label;
 locationLabel.point=[p[0],.15,p[2]+1.15];locationLabel.el.textContent=state.action?'正在沿小径前进':`现在 · ${state.level===5?(currentLandmark||['森林入口','溪边路口','北边林口'][chapterId(state)]):(NODE_NAMES[current]||'林间路口')}`;locationLabel.visible=!complete;
 basketLabel.visible=state.level===6;const items=state.inventory||state.completed||[];basketLabel.el.textContent=items.length?`篮子：${[items.includes('T')?'蜂蜜':'',items.includes('Y')?'果汁':''].filter(Boolean).join(' · ')}`:'野餐篮 · 等你来装';
}
function syncTrails(state){
 const nodes=state.traversedNodes||[];for(const group of visitedTrails.values())group.visible=false;
 for(let i=1;i<nodes.length;i++){const g=visitedTrails.get(edgeId(nodes[i-1],nodes[i]));if(g)g.visible=true;}
 if(state.level===5){for(let stage=0;stage<=chapterId(state);stage++){const count=stage<chapterId(state)?4:Math.min(4,state.step||0);for(let i=0;i<count;i++){const g=visitedTrails.get(edgeId(`s${stage}-n${i}`,`s${stage}-n${i+1}`));if(g)g.visible=true;}}}
}
function positionLabels(){
 for(const l of allLabels){const boxWidth=Math.min(width-16,l.el.offsetWidth||150),boxHeight=l.el.offsetHeight||40,p=forestProjectedLabel(l.point,camera,width,height,boxWidth,boxHeight);l.el.style.display=l.visible&&p.visible?'':'none';l.el.style.left=p.x+'px';l.el.style.top=p.y+'px';}
 // Basket contents stay beneath the bear/current-place label, never over
 // either branch letter. Stack in pixels so portrait layouts keep the gap.
 if(basketLabel.visible){const bottom=parseFloat(basketLabel.el.style.top),labelHeight=basketLabel.el.offsetHeight||28;basketLabel.el.style.top=Math.min(height-8,bottom+labelHeight+7)+'px';}
 // At phone widths keep the two destination tags separate even when the
 // projected route bends toward the center. They stay near their own branch.
 if(width<600&&leftLabel.visible&&rightLabel.visible){const a=parseFloat(leftLabel.el.style.left),b=parseFloat(rightLabel.el.style.left),aw=leftLabel.el.offsetWidth||110,bw=rightLabel.el.offsetWidth||110;if(b-a<(aw+bw)/2+10){leftLabel.el.style.left=Math.max(aw/2+8,width*.24)+'px';rightLabel.el.style.left=Math.min(width-bw/2-8,width*.76)+'px';}}
}
function frameCamera(snap=false,dt=0){
 const desired=new THREE.Vector3(bear.position.x*.78,0,bear.position.z-1.9);
 if(snap)cameraFocus.copy(desired);else cameraFocus.lerp(desired,1-Math.exp(-Math.max(0,dt)*5.2));
 const frame=forestCameraFrame(width,height,cameraFocus.toArray());Object.assign(camera,{left:frame.left,right:frame.right,top:frame.top,bottom:frame.bottom});camera.position.set(...frame.position);camera.lookAt(...frame.target);camera.updateProjectionMatrix();camera.updateMatrixWorld();
 for(const s of signs){s.panel.quaternion.copy(camera.quaternion);s.panel.scale.setScalar(Math.max(1,52*(frame.right-frame.left)/(width*1.03)));}placeReadableSigns();
 sun.position.set(cameraFocus.x-12,23,cameraFocus.z+14);sun.target.position.set(cameraFocus.x,0,cameraFocus.z-2);sun.target.updateMatrixWorld();
}
function resize(){if(destroyed)return;width=Math.max(1,host.clientWidth);height=Math.max(1,host.clientHeight);renderer.setSize(width,height,false);frameCamera(firstFrame);positionLabels();}
const observer=new ResizeObserver(resize);observer.observe(host);resize();
function update(state,dt=0){
 if(destroyed||!state)return;const paused=!!state.paused,delta=paused?0:Math.min(.08,Math.max(0,dt));clock+=delta;
 const chapter=[state.level,chapterId(state),state.contentVersion||0].join('|');if(chapter!==sceneToken){sceneToken=chapter;buildLandscape(state);labelToken='';}
 const token=[chapter,state.nodeId,state.step,state.forkIndex,state.stage,state.phase,state.action?.type,state.action?.key,state.selected,state.message,JSON.stringify(state.inventory),JSON.stringify(state.completed)].join('|');if(token!==labelToken){labelToken=token;updateLabels(state);syncTrails(state);}
 const pose=forestMotionSample(state);bear.position.set(...pose.point);const walking=pose.walking?1:0;
 if(pose.walking){const direction=new THREE.Vector3(...pose.direction);if(direction.lengthSq()>.00001){const desired=Math.atan2(direction.x,direction.z),angle=Math.atan2(Math.sin(desired-bear.rotation.y),Math.cos(desired-bear.rotation.y));if(!paused)bear.rotation.y+=angle*(1-Math.exp(-Math.max(dt,.001)*14));}}
 const phase=pose.distance*5.25;for(let i=0;i<legs.length;i++){const wave=Math.sin(phase+[0,Math.PI,Math.PI,0][i]);legs[i].rotation.x=wave*.34*walking;legs[i].position.y=.55+Math.max(0,wave)*.025*walking;}
 body.position.y=walking?Math.abs(Math.sin(phase*2))*.023:Math.sin(clock*1.8)*.008;body.rotation.z=Math.sin(phase)*.012*walking;head.rotation.y=walking?0:-.15+Math.sin(clock*.8)*.06;
 const items=state.inventory||state.completed||[];basket.visible=state.level===6;basketHoney.visible=items.includes('T');basketJuice.visible=items.includes('Y');if(waitingHoney)waitingHoney.visible=!items.includes('T');if(waitingJuice)waitingJuice.visible=!items.includes('Y');
 // A pickup becomes visible in the same grounded arrival action, then remains.
 if(state.action?.type==='collect'&&!state.action.targetFriend&&state.action.elapsed/state.action.duration>.8){const key=state.action.destination||state.selected;if(key==='T'){basketHoney.visible=true;if(waitingHoney)waitingHoney.visible=false;}else{basketJuice.visible=true;if(waitingJuice)waitingJuice.visible=false;}}
 const friendNode=state.level===5?'s2-n4':'friend',fp=forestNodePosition(friendNode,state);rabbit.visible=state.level===5?(state.solved||state.phase==='complete'||chapterId(state)===2&&state.step>=3):state.lessonStageIndex===2;
 const friendHome=landmarkGroups.get(friendNode)?.position;rabbit.position.set(friendHome?friendHome.x-.2:fp[0]+2.1,.1+Math.sin(clock*1.8)*.01,friendHome?friendHome.z+1.3:fp[2]+.4);rabbit.rotation.z=Math.sin(clock*.8)*.01;
 basketLabel.point=[bear.position.x,.15,bear.position.z+1.15];
 const changedLevel=lastState&&lastState.level!==state.level;frameCamera(firstFrame||changedLevel,delta);firstFrame=false;positionLabels();renderer.render(scene,camera);lastState={level:state.level};
}
function destroy(){if(destroyed)return;destroyed=true;observer.disconnect();labels.remove();const geometries=new Set(),materials=new Set(),textures=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of(Array.isArray(o.material)?o.material:o.material?[o.material]:[])){materials.add(m);if(m.map)textures.add(m.map);}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();for(const d of disposables)d.dispose();renderer.dispose();renderer.domElement.remove();host.style.position=originalPosition;}
return{update,destroy};
}

// An in-flight v1/v2 save keeps its original scene and timing until replay.
function createLegacyForestWorld(host) {
let destroyed = false;
const disposables = [];
const originalPosition = host.style.position;
if (!getComputedStyle(host).position || getComputedStyle(host).position === 'static') host.style.position = 'relative';
const scene = new THREE.Scene();
scene.background = new THREE.Color('#b8d09a');
scene.fog = new THREE.Fog('#b8d09a', 36, 68);
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
catch (error) { throw new Error('森林场景无法启动：' + error.message); }
renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.6));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
host.appendChild(renderer.domElement);
const camera = new THREE.OrthographicCamera(-11.6, 11.6, 7, -7, .1, 100);
scene.add(new THREE.HemisphereLight('#fff8d9', '#70966c', 1.8));
scene.add(new THREE.AmbientLight('#e6efd3', .28));
const sun = new THREE.DirectionalLight('#fff0c9', 2.25);
sun.position.set(-12, 23, 14); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -19, right: 19, top: 19, bottom: -19 });
sun.shadow.bias = -.00065; sun.shadow.normalBias = .035; sun.shadow.radius = 5;
scene.add(sun);
const mats = new Map();
function mat(color) { if (!mats.has(color)) mats.set(color, new THREE.MeshStandardMaterial({ color, roughness: .95, flatShading: true })); return mats.get(color); }
function mesh(geometry, color, p = [0, 0, 0], s = [1, 1, 1], parent = scene) {
  const m = new THREE.Mesh(geometry, typeof color === 'string' ? mat(color) : color);
  m.position.set(...p); m.scale.set(...s); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
const sphere = new THREE.SphereGeometry(1, 14, 10), ico = new THREE.IcosahedronGeometry(1, 1), box = new THREE.BoxGeometry(1, 1, 1);
const ell = (c, p, s, g) => mesh(sphere, c, p, s, g);
const block = (c, p, s, g) => mesh(box, c, p, s, g);
const cylinder = (c, p, rt, rb, h, g = scene, segments = 9) => mesh(new THREE.CylinderGeometry(rt, rb, h, segments), c, p, [1, 1, 1], g);
function beam(a, b, r, c, g = scene) {
  const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b);
  const m = cylinder(c, av.clone().add(bv).multiplyScalar(.5).toArray(), r, r, av.distanceTo(bv), g);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bv.sub(av).normalize()); return m;
}
let seed = 3381;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const range = (a, b) => a + rnd() * (b - a);
const plane = new THREE.PlaneGeometry(90, 100); plane.rotateX(-Math.PI / 2);
mesh(plane, '#b7cf88', [0, -.03, 0]).castShadow = false;
// A single, generous clearing keeps both decisions visible from the junction.
ell('#c4d797', [0,-.24,.5], [10.1,.31,10.7]).castShadow = false;
for (const [x,z,s] of [[-13,-11,8],[11,-12,9],[-15,5,8],[17,4,9]]) ell('#aec887',[x,-1.7,z],[s,2.6,s*.9]).castShadow=false;

function ribbon(curve,width,color,yOffset=0) {
  const positions=[],indices=[],n=110;
  for(let i=0;i<=n;i++) {
    const t=i/n,p=curve.getPoint(t),v=curve.getTangent(t),nx=-v.z,nz=v.x,w=width*(1+Math.sin(t*13)*.025);
    positions.push(p.x+nx*w/2,p.y+yOffset,p.z+nz*w/2,p.x-nx*w/2,p.y+yOffset,p.z-nz*w/2);
    if(i<n){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return mesh(g,color);
}
const pathCurves = [
  [[0,.06,11],[0,.06,7.3],[0,.06,4.9],[0,.06,2.65]],
  [[0,.065,2.8],[-1.6,.065,1.8],[-3.5,.065,.05],[-5.4,.065,-1.6],[-5.35,.065,-3.35]],
  [[0,.065,2.8],[1.7,.065,1.8],[3.75,.065,.1],[5.25,.065,-1.75],[5.2,.065,-3.8]],
].map(points=>new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'catmullrom',.45));
for (const curve of pathCurves) { ribbon(curve,2.27,'#afbd80',-.014); ribbon(curve,2.06,'#ddca9f'); }
ell('#ddca9f',[0,.066,2.8],[1.23,.013,1.12]).castShadow=false;
for (const curve of pathCurves) for(let i=0;i<42;i++) {
  const p=curve.getPoint(range(.05,.94)),v=curve.getTangent(range(.05,.94)),d=range(-.79,.79);
  ell(i%3?'#d2bd90':'#e8d6ae',[p.x-v.z*d,.082,p.z+v.x*d],[range(.026,.05),.009,range(.035,.07)]).castShadow=false;
}

function tree(x,z,s=1,pine=false) {
  const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(s);scene.add(g);
  cylinder('#94734e',[0,1.25,0],.17,.25,2.5,g);
  if(pine) for(let i=0;i<3;i++) {
    const m=mesh(new THREE.ConeGeometry(1.28-i*.22,1.8,7),['#678b54','#789a5d','#8aac68'][i],[0,1.7+i*.72,0],[1,1,1],g);m.rotation.y=i*.3;
  } else {
    beam([0,1.35,0],[-.53,2.1,.12],.1,'#94734e',g);beam([0,1.6,0],[.53,2.28,0],.1,'#94734e',g);
    for(const [dx,dy,dz,k] of [[0,2.8,0,1.30],[-.7,2.54,.15,.88],[.76,2.74,.05,.88],[0,3.39,-.07,.82]]) {
      const m=mesh(ico,['#86a95d','#9abb6b','#abc87b','#91b363'][Math.floor(rnd()*4)],[dx,dy,dz],[k,k,k],g);m.rotation.set(rnd(),rnd(),rnd());
    }
  }
  return g;
}
// The perimeter is deliberately open in front of each destination and letter sign.
for(const [x,z,s,p] of [
  [-10.4,-7,1.3,0],[-8.1,-8.9,1.16,1],[-5.4,-10.5,1.1,0],[-2.6,-10.8,1.2,0],
  [.6,-10.7,1.18,1],[3.7,-10.3,1.17,0],[6.8,-9.1,1.16,0],[9.4,-7.3,1.33,1],
  [-10.8,-1.7,1.21,0],[-10.7,3.1,1.13,1],[10.9,-1.3,1.14,0],[10.9,3.6,1.03,0],
  [-9.25,7.7,1.20,0],[9.25,8.0,1.22,1],[-7.6,-5.65,.83,0],[8.3,-5.2,.88,0]
]) tree(x,z,s,!!p);
function bush(x,z,s=1,color='#91b468') { const g=new THREE.Group();g.position.set(x,.07,z);scene.add(g);for(const [a,b,c,k] of [[0,.3,0,.59],[-.37,.23,.11,.41],[.35,.22,-.04,.39]]){const m=mesh(ico,color,[a*s,b*s,c*s],[k*s,k*s*.65,k*s],g);m.rotation.y=rnd()*6;} }
for(const [x,z,s] of [[-8.4,1.3,1.1],[-7.7,4.6,1.4],[7.7,4.7,1.35],[7.6,.2,1.1],[-2.4,-7.3,1.4],[2.7,-7.5,1.1],[-9,-3.5,1.1],[9.1,-3.3,1.2]])bush(x,z,s);
function grass(x,z,s=.8) { const g=new THREE.Group();g.position.set(x,.07,z);scene.add(g);for(let j=0;j<3;j++){const m=mesh(new THREE.ConeGeometry(.048*s,.32*s,3),j%2?'#9ab362':'#86a551',[range(-.10,.10),.12*s,range(-.10,.10)],[1,1,1],g);m.rotation.z=range(-.3,.3);} }
function flower(x,z,s=1,c='#fff4cf',parent=scene) {
  const g=new THREE.Group();g.position.set(x,.08,z);g.scale.setScalar(s);parent.add(g);
  beam([0,0,0],[0,.27,0],.015,'#7f9b50',g);ell('#89a35d',[.065,.11,0],[.10,.02,.045],g);
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5;ell(c,[Math.sin(a)*.092,.29,Math.cos(a)*.092],[.078,.025,.075],g);}
  ell('#e5ba54',[0,.31,0],[.049,.03,.049],g);
}
for(const [x,z] of [[-6.9,2.2],[-3.2,4.7],[3.3,4.4],[7.7,2.2],[-2.3,-1.4],[1.3,-2.6],[-6.8,-5.8],[6.6,-5.8]]) {
  for(let i=0;i<9;i++)grass(x+range(-.7,.7),z+range(-.5,.5),range(.65,1.0));
  for(let i=0;i<7;i++)flower(x+range(-.75,.75),z+range(-.5,.5),range(.75,1.15),i%3?'#fff3d0':'#efbea5');
}

// Left landmark: unmistakably blue water, lily pads, reeds, and a little duck.
ell('#95b674',[-5.5,.075,-4.8],[2.45,.09,1.84]).castShadow=false;
ell('#bcd7c4',[-5.5,.13,-4.8],[2.16,.07,1.63]).castShadow=false;
const water=new THREE.MeshStandardMaterial({color:'#86bdc1',roughness:.52,metalness:.05,flatShading:true});
ell(water,[-5.5,.174,-4.8],[2.02,.04,1.51]).castShadow=false;
for(const [x,z,s] of [[-6.7,-4.55,.38],[-5.25,-5.55,.3],[-4.32,-5.05,.28]]) {
  const pad=mesh(new THREE.CircleGeometry(s,11,.15,Math.PI*1.83),'#96b568',[x,.22,z]);pad.rotation.x=-Math.PI/2;pad.rotation.z=rnd()*3;pad.castShadow=false;
}
for(const [x,z] of [[-7.2,-5.15],[-7.0,-5.6],[-4.35,-6.1]]) for(let i=0;i<4;i++) {
  const xx=x+range(-.16,.16),zz=z+range(-.16,.16),h=range(.5,.9);beam([xx,.11,zz],[xx+.04,h,zz],.024,'#879759');ell('#b09661',[xx+.04,h,zz],[.055,.15,.055]);
}
const duck=new THREE.Group();duck.position.set(-5.9,.2,-4.35);duck.rotation.y=-.7;scene.add(duck);
ell('#f3df9e',[0,.21,0],[.35,.27,.45],duck);ell('#f6e6b2',[0,.54,.27],[.24,.24,.23],duck);ell('#e9cd82',[-.22,.25,.03],[.12,.16,.3],duck);ell('#e5a959',[0,.48,.52],[.15,.07,.13],duck);
for(const x of[-.14,.14])ell('#494533',[x,.58,.45],[.026,.034,.022],duck);
for(const [x,z,s] of [[-7.6,-4,.32],[-6.95,-3.7,.24],[-3.6,-4.9,.36],[-3.85,-5.85,.26]]) {const m=mesh(ico,'#b4b59b',[x,.13,z],[s,s*.55,s*.73]);m.rotation.y=rnd()*6;}

// Right landmark: a red mushroom glade. No arrow or highlight reveals the choice.
ell('#a7bd77',[5.55,.074,-4.30],[2.24,.045,1.89]).castShadow=false;
function mushroom(x,z,s=1,parent=scene,color='#ce7256') {
  const g=new THREE.Group();g.position.set(x,.11,z);g.scale.setScalar(s);parent.add(g);
  cylinder('#ebdaba',[0,.52,0],.23,.30,1.04,g,11);
  ell('#dac69f',[0,.25,0],[.33,.27,.32],g);
  cylinder('#ebd9ad',[0,1.04,0],.90,.94,.105,g,14);
  const cap=mesh(new THREE.SphereGeometry(1,16,8,0,Math.PI*2,0,Math.PI/2),color,[0,1.07,0],[.98,.66,.98],g);
  for(const [x,z,k] of [[-.42,.38,.16],[.30,.50,.13],[.11,-.16,.20],[-.52,-.29,.13],[.57,-.16,.13]]) {
    const y=1.07+.66*Math.sqrt(1-x*x-z*z);
    const dot=ell('#f7e7bf',[x,y+.015,z],[k,.022,k*.85],g);dot.rotation.z=-x*.6;dot.rotation.x=z*.6;
  }
  return g;
}
const originalMushrooms=[mushroom(5.48,-4.55,1.35),mushroom(6.82,-3.73,.68),mushroom(4.15,-4.75,.49),mushroom(6.65,-5.48,.44)];
for(let i=0;i<13;i++) {const a=range(0,Math.PI*2);grass(5.4+Math.cos(a)*range(1.45,2.0),-4.5+Math.sin(a)*range(1.18,1.6),range(.7,1.1));}

// Small rabbit peeks around the near side of the giant cap, at the actual endpoint.
const rabbit=new THREE.Group();rabbit.name='rabbit-beside-red-mushroom';rabbit.position.set(4.64,.1,-3.15);rabbit.rotation.y=.05;scene.add(rabbit);
ell('#ecdfc3',[0,.37,0],[.33,.4,.31],rabbit);ell('#fff1d6',[0,.65,.14],[.34,.33,.29],rabbit);
for(const x of[-.15,.15]) {const ear=ell('#f1e6cd',[x,1.10,.10],[.115,.38,.105],rabbit);ear.rotation.z=-x*.7;const inner=ell('#dca99a',[x,1.13,.187],[.052,.25,.021],rabbit);inner.rotation.z=-x*.7;ell('#e3d4b6',[x,.115,.18],[.17,.11,.25],rabbit);ell('#4a4334',[x*.94,.71,.397],[.035,.045,.027],rabbit);}
ell('#d59888',[0,.59,.445],[.048,.034,.025],rabbit);ell('#f9ebd0',[.29,.33,-.11],[.16,.17,.16],rabbit);

// An undecorated stump is scenery, never a third branch.
const stump=cylinder('#a68052',[0,.37,-6.2],.59,.68,.69);cylinder('#d2b581',[0,.723,-6.2],.57,.58,.025);
for(let i=0;i<5;i++){const a=i*Math.PI*2/5;beam([Math.cos(a)*.53,.25,-6.2+Math.sin(a)*.53],[Math.cos(a)*.75,.08,-6.2+Math.sin(a)*.75],.10,'#a68052');}

// Established v8 island bear, with the same four paws, amber fur, and cream muzzle.
const bear=new THREE.Group();bear.name='bear-considering-the-fork';bear.position.set(0,.105,4.34);bear.scale.setScalar(.94);bear.rotation.y=2.62;scene.add(bear);
const body=new THREE.Group();bear.add(body);
ell('#aa6b32',[0,.7,-.27],[.52,.57,.75],body);ell('#c4833c',[0,.88,-.2],[.48,.50,.62],body);ell('#b77633',[0,.92,-.91],[.16,.18,.17],body);
const legs=[];
for(const x of[-.33,.33])for(const z of[-.67,.22]){const leg=new THREE.Group();leg.position.set(x,.55,z);body.add(leg);legs.push(leg);ell('#aa6930',[0,-.21,0],[.18,.38,.19],leg);ell('#814d25',[0,-.43,.065],[.2,.13,.25],leg);}
const head=new THREE.Group();head.position.set(0,1.25,.43);head.rotation.y=-.38;body.add(head);ell('#bd7b37',[0,0,0],[.53,.54,.46],head);ell('#cb8a44',[0,.07,.12],[.46,.46,.37],head);
for(const x of[-.38,.38]){ell('#a5652f',[x,.40,-.05],[.20,.21,.13],head);ell('#7e4b2b',[x,.42,.055],[.115,.13,.06],head);}
ell('#ead3a1',[0,-.17,.42],[.28,.23,.19],head);ell('#3c3426',[0,-.06,.596],[.106,.077,.057],head);
for(const x of[-.23,.23]){ell('#342e22',[x,.08,.402],[.058,.079,.043],head);ell('#fff3d0',[x-.012,.11,.435],[.019,.024,.012],head);}

// Dynamic scenery is deliberately kept out of the opaque static batch.
const taskRoot=new THREE.Group();taskRoot.name='current-clue-landmarks';scene.add(taskRoot);
const features={};
function feature(name){const g=new THREE.Group();g.name=name;g.visible=false;taskRoot.add(g);features[name]=g;return g;}
const blue=feature('blueMushroom');mushroom(-5.13,-2.88,.85,blue,'#699ca9');mushroom(-6.18,-2.62,.44,blue,'#78afbd');
const red=feature('redFlower');
for(let i=0;i<10;i++)flower(5.24+Math.sin(i*2.4)*.53,-2.8+Math.cos(i*2.4)*.37,2.4,'#d87660',red);
ell('#b89066',[5.24,.22,-2.8],[.58,.22,.43],red);
const hive=feature('beehive');
cylinder('#977148',[6.12,1.32,-2.9],.20,.29,2.64,hive);
beam([6.12,1.75,-2.9],[5.34,2.44,-2.78],.11,'#977148',hive);
for(const [x,y,z,s]of[[6.05,3,-3.0,1.04],[6.65,2.76,-3.1,.75],[5.5,3.01,-3.25,.72]])mesh(ico,'#91b363',[x,y,z],[s,s*.87,s],hive);
for(let i=0;i<5;i++)ell(i%2?'#d6ac54':'#e8bc64',[5.39,2.02-i*.135,-2.70],[.40-Math.abs(2-i)*.055,.13,.31-Math.abs(2-i)*.04],hive);
ell('#79603f',[5.39,1.72,-2.388],[.082,.09,.012],hive);
const bee=ell('#e6b544',[4.87,1.89,-2.3],[.10,.075,.075],hive);ell('#fff5d7',[4.87,1.98,-2.3],[.075,.034,.11],hive);
const bridge=feature('bridge');
const bridgeDeck=new THREE.Group();bridgeDeck.position.set(-5.3,.10,-3.66);bridgeDeck.rotation.y=-.22;bridge.add(bridgeDeck);
for(let i=0;i<7;i++)block(i%2?'#b68c57':'#c59d65',[0,.16,-.82+i*.27],[1.32,.16,.24],bridgeDeck);
for(const x of[-.72,.72]){for(const z of[-.79,.8])cylinder('#9b754c',[x,.46,z],.06,.075,.75,bridgeDeck);beam([x,.75,-.84],[x,.75,.86],.047,'#bc955d',bridgeDeck);}
for(let i=0;i<7;i++){const p=pathCurves[1].getPoint(.32+i*.072);for(const s of[-1,1])ell('#b19e76',[p.x+s*.13,.097,p.z],[.062,.011,.115],bridge);}
const slope=feature('slope');
for(let i=0;i<7;i++){const a=i*2.5;const rock=mesh(ico,i%2?'#b5b399':'#9eaa8b',[5.32+Math.cos(a)*.53,.23+(i%3)*.19,-2.86+Math.sin(a)*.5],[.5,.36,.42],slope);rock.rotation.set(.1*i,.6*i,0);}
const hollow=feature('hollow');
cylinder('#a68156',[-5.8,.97,-3.01],.61,.79,1.88,hollow,11);cylinder('#cfb286',[-5.8,1.92,-3.01],.61,.64,.07,hollow,11);
ell('#5b523b',[-5.8,.79,-2.28],[.36,.54,.038],hollow);ell('#8f734d',[-5.8,.26,-2.26],[.4,.08,.15],hollow);
for(const [x,z]of[[-6.3,-2.5],[-5.2,-2.5]])beam([x,.2,z],[x+(x<-5.8?-.2:.2),.08,z+.3],.14,'#a68156',hollow);
const cabin=feature('cabin');
function cottage(parent,x,z){
 const g=new THREE.Group();g.position.set(x,.08,z);g.scale.setScalar(.87);parent.add(g);
 block('#e5cf9e',[0,.95,0],[2.02,1.87,1.62],g);
 for(const s of[-1,1]){const roof=block('#ac6e46',[s*.56,2.11,0],[1.50,.19,2.04],g);roof.rotation.z=s*-.58;}
 block('#865e3c',[-.37,.69,.825],[.59,1.32,.08],g);ell('#e5be60',[-.18,.72,.89],[.042,.042,.025],g);
 block('#966e43',[.53,1.02,.83],[.62,.70,.10],g);
 const glow=new THREE.MeshStandardMaterial({color:'#ffdf7c',emissive:'#f6be4c',emissiveIntensity:.7,roughness:.8});disposables.push(glow);
 block(glow,[.53,1.02,.9],[.46,.54,.035],g);block('#ad8750',[.53,1.02,.925],[.045,.57,.035],g);block('#ad8750',[.53,1.02,.925],[.49,.045,.035],g);
 block('#bd9968',[0,.11,1.03],[2.20,.17,.52],g);block('#a57b54',[-.71,2.22,-.48],[.32,.73,.40],g);
 return g;
}
cottage(cabin,6.34,-3.62);
const pavilion=feature('pavilion');
const pergola=new THREE.Group();pergola.position.set(-5.15,.12,-3.20);pavilion.add(pergola);
block('#b69761',[0,.09,0],[1.72,.15,1.25],pergola);
for(const x of[-.73,.73])for(const z of[-.5,.5])cylinder('#a27e50',[x,.93,z],.065,.08,1.77,pergola);
mesh(new THREE.ConeGeometry(1.36,.64,4),'#b98852',[0,2.10,0],[1,1,.9],pergola).rotation.y=Math.PI/4;
block('#d4b984',[0,.52,-.2],[1.3,.12,.37],pergola);
const reeds=feature('reeds');
for(let i=0;i<8;i++){const x=-4.27+(i%3)*.13,z=-2.90+Math.floor(i/3)*.15,h=.64+(i%4)*.12;beam([x,.10,z],[x-.08,h,z],.026,'#879759',reeds);ell('#a78651',[x-.08,h,z],[.047,.13,.044],reeds);}
const mushroomDecoy=feature('mushroomDecoy');mushroom(-5.7,-2.95,.66,mushroomDecoy);mushroom(-6.25,-2.60,.38,mushroomDecoy);
const picnic=feature('picnic');
const basket=new THREE.Group();basket.name='persistent-picnic-basket';basket.position.set(1.33,.10,4.7);picnic.add(basket);
block('#bb9056',[0,.24,0],[.90,.44,.61],basket);block('#dbc089',[0,.48,0],[.96,.10,.67],basket);
for(let i=0;i<5;i++)block('#a47b47',[-.38+i*.19,.25,.313],[.022,.39,.012],basket);
for(let i=0;i<3;i++)block('#d7b577',[0,.13+i*.12,.33],[.90,.023,.025],basket);
const handle=mesh(new THREE.TorusGeometry(.36,.035,6,18,Math.PI),'#9e7444',[0,.48,0],[1,1,1],basket);handle.rotation.z=0;
function honeyJar(parent,pos,scale=1){const g=new THREE.Group();g.position.set(...pos);g.scale.setScalar(scale);parent.add(g);cylinder('#e8b85a',[0,.19,0],.17,.19,.38,g,12);cylinder('#aa7540',[0,.4,0],.18,.18,.07,g,12);block('#fff1c3',[0,.2,.17],[.21,.15,.014],g);ell('#b6843e',[0,.2,.185],[.058,.044,.012],g);return g;}
function juiceBottle(parent,pos,scale=1){const g=new THREE.Group();g.position.set(...pos);g.scale.setScalar(scale);parent.add(g);cylinder('#d88c62',[0,.22,0],.14,.16,.39,g,12);cylinder('#e4b777',[0,.455,0],.075,.11,.13,g,12);cylinder('#78a071',[0,.55,0],.085,.085,.07,g,12);block('#fff0cf',[0,.22,.145],[.21,.15,.014],g);ell('#d6a24f',[0,.22,.16],[.052,.054,.011],g);return g;}
const basketHoney=honeyJar(basket,[-.23,.32,0],1.08),basketJuice=juiceBottle(basket,[.23,.32,0],1.02);
const carriedHoney=honeyJar(bear,[-.29,1.03,-.59],.70),carriedJuice=juiceBottle(bear,[-.29,1.03,-.59],.70);carriedHoney.visible=carriedJuice.visible=false;
const waitingHoney=honeyJar(cabin,[5.7,.29,-2.36],1.1),waitingJuice=juiceBottle(pavilion,[-5.15,.73,-3.15],1.05);

const billboards=[];
function createSign(x,z,left){
 const g=new THREE.Group();g.position.set(x,.08,z);scene.add(g);
 cylinder('#a18051',[0,.70,0],.073,.092,1.40,g,8);ell('#aebd7f',[0,.025,0],[.24,.02,.19],g).castShadow=false;
 const canvas=document.createElement('canvas');canvas.width=384;canvas.height=256;
 const ctx=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
 const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false});
 const panel=mesh(new THREE.PlaneGeometry(1.38,.92),material,[x,1.67,z+.08]);panel.castShadow=panel.receiveShadow=false;billboards.push(panel);
 let last='';
 function set(letter='',done=false,active=false){
  const token=letter+done+active;if(token===last)return;last=token;
  ctx.clearRect(0,0,384,256);const w=384,h=256;
  ctx.fillStyle='#b49560';ctx.beginPath();ctx.roundRect(11,22,w-22,h-37,28);ctx.fill();
  ctx.fillStyle=done?'#e0dfb4':active?'#fff1c9':'#efddb0';ctx.beginPath();ctx.roundRect(11,11,w-22,h-37,26);ctx.fill();
  ctx.strokeStyle=active?'#bd965a':'#d2bb86';ctx.lineWidth=active?7:4;ctx.stroke();
  ctx.fillStyle='#bca374';for(const xx of[32,w-32]){ctx.beginPath();ctx.arc(xx,40,5,0,Math.PI*2);ctx.fill();}
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=done?'#84936a':'#536042';ctx.font='800 130px Arial';ctx.fillText(letter,w*.53,h*.46);
  ctx.strokeStyle='#748060';ctx.lineWidth=8;ctx.lineCap='round';ctx.lineJoin='round';const y=h*.79;
  if(done){ctx.beginPath();ctx.moveTo(w*.40,y);ctx.lineTo(w*.48,y+15);ctx.lineTo(w*.62,y-17);ctx.stroke();}
  else{ctx.beginPath();ctx.moveTo(w*.32,y);ctx.lineTo(w*.68,y);ctx.stroke();ctx.beginPath();const end=left?w*.32:w*.68,dir=left?1:-1;ctx.moveTo(end+dir*22,y-17);ctx.lineTo(end,y);ctx.lineTo(end+dir*22,y+17);ctx.stroke();}
  texture.needsUpdate=true;
 }
 set(left?'E':'I');return{set,texture,panel};
}
const signs=[createSign(-2.53,1.26,true),createSign(2.53,1.26,false)];

// The approved trees, paths, pond, flowers, and shadows retain their exact geometry.
const dynamic=new Set();for(const root of[bear,rabbit,taskRoot,...originalMushrooms])root.traverse(o=>dynamic.add(o));
scene.updateMatrixWorld(true);const batches=new Map(),remove=[];
scene.traverse(o=>{if(!o.isMesh||dynamic.has(o)||o.material.transparent)return;const key=o.material.uuid;let batch=batches.get(key);if(!batch){batch={material:o.material,geometries:[]};batches.set(key,batch);}const geometry=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(o.matrixWorld);if(!o.material.map)geometry.deleteAttribute('uv');batch.geometries.push(geometry);remove.push(o);});
for(const m of remove)m.removeFromParent();
const keptGeometries=new Set();scene.traverse(o=>{if(o.geometry)keptGeometries.add(o.geometry);});
for(const geometry of new Set(remove.map(m=>m.geometry)))if(!keptGeometries.has(geometry))geometry.dispose();
for(const batch of batches.values()){const geometry=mergeGeometries(batch.geometries,false);if(geometry){const m=new THREE.Mesh(geometry,batch.material);m.castShadow=m.receiveShadow=true;scene.add(m);}for(const g of batch.geometries)g.dispose();}

// Small projected labels belong to their scene objects, rather than a duplicate HUD.
const labels=document.createElement('div');labels.setAttribute('aria-hidden','true');labels.style.cssText='position:absolute;inset:0;pointer-events:none;overflow:hidden';host.appendChild(labels);
function label(point,kind){const el=document.createElement('div');el.className='forest-world-label forest-world-'+kind;el.style.cssText='position:absolute;transform:translate(-50%,-100%);box-sizing:border-box;font-family:system-ui,-apple-system,"Noto Sans SC",sans-serif;color:#485b37;text-align:center;white-space:nowrap;';
 if(kind==='clue')el.style.cssText+='max-width:min(320px,49vw);white-space:normal;padding:10px 16px;border:1px solid rgba(255,255,238,.85);border-radius:18px;background:rgba(255,250,225,.93);box-shadow:0 5px 16px #55653e12;font-size:clamp(12px,1.35vw,17px);font-weight:750;line-height:1.5;';
 else el.style.cssText+='padding:5px 10px;border-radius:12px;background:rgba(255,249,224,.86);font-size:clamp(10px,1.0vw,13px);font-weight:650;line-height:1.45;';
 labels.appendChild(el);return{el,point:new THREE.Vector3(...point)};}
const clueLabel=label([0,1.78,-1.05],'clue');
const leftLabel=label([-5.55,.48,-1.65],'landmark'),rightLabel=label([5.5,.48,-1.65],'landmark');
const basketLabel=label([1.5,.45,5.67],'basket');
const projected=new THREE.Vector3();let width=0,height=0;
function resize(){if(destroyed)return;width=Math.max(1,host.clientWidth);height=Math.max(1,host.clientHeight);const aspect=width/height;renderer.setSize(width,height,false);const halfW=aspect<1?10.8:11.25;camera.left=-halfW;camera.right=halfW;camera.top=halfW/aspect;camera.bottom=-halfW/aspect;camera.position.set(0,19,25);camera.lookAt(0,.45,aspect<1?-.15:.3);camera.updateProjectionMatrix();camera.updateMatrixWorld();billboards.forEach(m=>m.quaternion.copy(camera.quaternion));positionLabels();}
function positionLabels(){for(const l of[clueLabel,leftLabel,rightLabel,basketLabel]){projected.copy(l.point).project(camera);l.el.style.left=((projected.x*.5+.5)*width)+'px';l.el.style.top=((-projected.y*.5+.5)*height)+'px';}}
const observer=new ResizeObserver(resize);observer.observe(host);resize();

// Route sampling uses the very same centerlines as the approved ground paths.
const START=new THREE.Vector3(0,.105,4.34),FORK=new THREE.Vector3(0,.105,2.8);
function branchPoints(side,reverse=false,fraction=.90){const curve=pathCurves[side<0?1:2],pts=[];for(let i=0;i<=36;i++){const p=curve.getPoint(fraction*i/36);p.y=.105;pts.push(p);}return reverse?pts.reverse():pts;}
const ends={'-1':branchPoints(-1).at(-1),'1':branchPoints(1).at(-1)};
function route(points){const clean=[];for(const p of points){if(!clean.length||p.distanceTo(clean.at(-1))>.001)clean.push(p.clone());}const lengths=[0];for(let i=1;i<clean.length;i++)lengths.push(lengths.at(-1)+clean[i].distanceTo(clean[i-1]));return{points:clean,lengths,length:lengths.at(-1)||1};}
function sample(r,u){const d=Math.max(0,Math.min(1,u))*r.length;let i=1;while(i<r.lengths.length-1&&r.lengths[i]<d)i++;const a=r.points[i-1]||r.points[0],b=r.points[i]||a;const delta=(r.lengths[i]||r.length)-r.lengths[i-1];return{point:a.clone().lerp(b,delta?Math.max(0,Math.min(1,(d-r.lengths[i-1])/delta)):0),direction:b.clone().sub(a).normalize(),distance:d};}
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
const sideFor = forestBranchSide;
function pastSide(state){const task=state.tasks?.[Math.min((state.step||0)-1,state.tasks.length-1)];return task?sideFor(state,task.correct,task):(state.step%2===1?-1:1);}
function idlePoint(state){if(state.level===6)return state.stage==='fork'||state.stage==='travel'?FORK:START;return state.step>0?ends[pastSide(state)]:START;}
function incoming(state){return state.step>0?branchPoints(pastSide(state),true):[START,FORK];}
let motionToken='',motionRoute=null,motionAction=null,motionOrigin=null,elapsedClock=0,previousState=null;
function makeMotion(state){const a=state.action,key=a.key,side=sideFor(state,key);let pts;
 if(state.level===5){const toFork=incoming(state),out=branchPoints(side);pts=[...toFork,...out];if(a.type==='detour')pts=[...pts,...out.slice().reverse(),...toFork.slice().reverse()];}
 else if(a.type==='visit')pts=[START,FORK];
 else if(a.type==='follow'){const out=branchPoints(side);pts=[FORK,...out,...out.slice().reverse()];}
 else if(a.type==='collect'){const out=branchPoints(sideFor(state,a.destination||state.selected));pts=[FORK,...out,...out.slice().reverse(),START];}
 else {const out=branchPoints(side,false,.75);pts=[FORK,...out,...out.slice().reverse()];}
 const result=route(pts);
 if(a.type==='collect'){const outward=route([FORK,...branchPoints(sideFor(state,a.destination||state.selected))]);result.turn=outward.length/result.length;}
 else if(a.type==='detour'||a.type==='follow')result.turn=.5;
 return result;
}
function updateLabels(state){const task=forestCurrentTask(state);
 for(const g of Object.values(features))g.visible=false;
 let left='',right='',clue='';let keys=['E','I'];const complete=state.phase==='complete'||state.phase==='stage-ready'||state.stageReady;
 if(state.level===5){
  const branches=task.branches||[];
  keys=branches.length?branches.map(branch=>branch.key):keys;
  clue=complete?'找到朋友啦！小兔在这里等你':task.clue||'观察路边的东西，找下一条线索';
  left=branches[0]?.label||'';right=branches[1]?.label||'';
  for(const branch of branches)if(features[branch.feature])features[branch.feature].visible=true;
  waitingHoney.visible=waitingJuice.visible=false;
 }else{
  picnic.visible=true;const selected=state.selected||state.action?.destination;const isFork=state.stage==='fork'||['collect','detour','follow'].includes(state.action?.type);
  const destinations=state.tasks||[],leftDestination=destinations.find(item=>item.key==='Y'),rightDestination=destinations.find(item=>item.key==='T');
  keys=['Y','T'];cabin.visible=pavilion.visible=true;
  left=leftDestination?`${leftDestination.label} · ${leftDestination.item}`:'河边亭 · 果汁';right=rightDestination?`${rightDestination.label} · ${rightDestination.item}`:'蜂蜜小屋 · 蜂蜜';
  clue=complete?'两份都取到啦，可以去野餐了':'蜂蜜和果汁，先去哪一处？';
  if(isFork){
   clue=task.clue||'看看路边的东西，再找下一条线索';cabin.visible=pavilion.visible=false;
   for(const branch of task.branches||[]){const side=sideFor(state,branch.key,task),index=side<0?0:1;keys[index]=branch.key;if(side<0)left=branch.label;else right=branch.label;if(features[branch.feature])features[branch.feature].visible=true;}
   // Keep the actual final collection source at its familiar destination.
   if(state.action?.type==='collect'){cabin.visible=selected==='T';pavilion.visible=selected==='Y';}
  } else if(state.action?.type==='visit')clue=`出发去${task.label||(selected==='T'?'蜂蜜小屋':'河边亭')}`;
  const items=state.inventory||state.completed||[];basketHoney.visible=items.includes('T');basketJuice.visible=items.includes('Y');
  waitingHoney.visible=!items.includes('T');waitingJuice.visible=!items.includes('Y');
  const missing=Math.max(0,(state.tasks?.length||2)-items.length);
  basketLabel.el.textContent=items.length?`野餐篮：${[items.includes('T')?'蜂蜜':'',items.includes('Y')?'果汁':''].filter(Boolean).join(' · ')}`:`野餐篮 · 还缺 ${missing} 份`;
 }
 originalMushrooms.forEach(g=>g.visible=false);
 rabbit.visible=state.level===5&&complete;
 if(rabbit.visible){const side=pastSide(state),end=ends[side];rabbit.position.set(end.x+(side<0?-.65:.65),.1,end.z-.15);}
 const branchChoices=state.choices||[];
 for(let i=0;i<2;i++){const c=branchChoices.find(x=>x.key===keys[i]);const taken=state.level===6&&((state.completed||[]).includes(keys[i])||!!c?.done);signs[i].set(keys[i],taken,!!state.action&&state.action.key===keys[i]);}
 if(state.action?.type==='detour')clue=state.message||'这边和线索不一样，再回路口看看';
 clueLabel.el.textContent=clue;leftLabel.el.textContent=left;rightLabel.el.textContent=right;basketLabel.el.style.display=state.level===6?'':'none';
}
let labelToken='',lastLessonStage=-1;
function update(state,dt=0){if(destroyed||!state)return;const paused=!!state.paused;if((state.lessonStageIndex||0)!==lastLessonStage){lastLessonStage=state.lessonStageIndex||0;labelToken='';motionToken='';motionAction=null;elapsedClock=0;bear.rotation.y=2.62;}if(!paused)elapsedClock+=Math.min(.05,Math.max(0,dt));
 const token=[state.level,state.lessonStageIndex,state.forkIndex,state.step,state.stage,state.phase,state.selected,state.action?.type,state.action?.key,state.message,JSON.stringify(state.completed),JSON.stringify(state.inventory),state.task?.clue].join('|');
 if(token!==labelToken){labelToken=token;updateLabels(state);}
 let walking=0,walkPhase=0,direction=null;
 if(state.action){
  const a=state.action;const k=[state.level,state.lessonStageIndex,state.forkIndex,state.step,state.stage,a.type,a.key,a.destination,a.from,a.to].join('|');
  if(k!==motionToken||a!==motionAction&&a.elapsed<(motionAction?.elapsed||0)){motionToken=k;motionRoute=makeMotion(state);motionAction=a;motionOrigin=bear.rotation.y;}
  const p=Math.max(0,Math.min(1,a.elapsed/Math.max(.001,a.duration)));let u=smooth(p),legProgress=p;
  if(motionRoute.turn!==undefined){const turn=motionRoute.turn;if(p<.44){legProgress=p/.44;u=turn*smooth(legProgress);}else if(p<.55){legProgress=0;u=turn;}else{legProgress=(p-.55)/.45;u=turn+(1-turn)*smooth(legProgress);}}
  const m=sample(motionRoute,u);bear.position.copy(m.point);direction=m.direction;
  walking=Math.min(1,Math.sin(Math.PI*legProgress)*3);walkPhase=m.distance*4.2;
  // An actual jar/bottle rides with the bear on the homeward part of collection.
  const bringing=a.type==='collect'&&p>.49;carriedHoney.visible=bringing&&(a.destination||state.selected)==='T';carriedJuice.visible=bringing&&(a.destination||state.selected)==='Y';
  if(bringing){waitingHoney.visible=!(a.destination==='T');waitingJuice.visible=!(a.destination==='Y');}
 }else{
  motionToken='';motionAction=null;bear.position.copy(idlePoint(state));carriedHoney.visible=carriedJuice.visible=false;
 }
 if(direction&&direction.lengthSq()>.01){const desired=Math.atan2(direction.x,direction.z);const delta=Math.atan2(Math.sin(desired-bear.rotation.y),Math.cos(desired-bear.rotation.y));if(!paused)bear.rotation.y+=delta*(1-Math.exp(-Math.max(dt,.001)*11));}
 for(let i=0;i<legs.length;i++){const phase=walkPhase+([0,Math.PI,Math.PI,0][i]);legs[i].rotation.x=Math.sin(phase)*.34*walking;legs[i].position.y=.55+Math.max(0,Math.sin(phase))*.035*walking;}
 body.position.y=walking?Math.abs(Math.sin(walkPhase*2))*.029:Math.sin(elapsedClock*1.8)*.008;body.rotation.z=Math.sin(walkPhase)*.016*walking;head.rotation.y=walking?0:-.18+Math.sin(elapsedClock*.8)*.07;
 rabbit.position.y=.1+Math.sin(elapsedClock*1.8)*.012;rabbit.rotation.z=Math.sin(elapsedClock*.8)*.012;bee.position.y=1.89+Math.sin(elapsedClock*5)*.075;
 if((state.phase==='complete'||state.stageReady)&&state.level===5){head.rotation.y=-.5;}
 renderer.render(scene,camera);previousState=state;
}
function destroy(){if(destroyed)return;destroyed=true;observer.disconnect();labels.remove();const geometries=new Set(),materials=new Set(),textures=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of(Array.isArray(o.material)?o.material:o.material?[o.material]:[])){materials.add(m);if(m.map)textures.add(m.map);}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();for(const d of disposables)d.dispose();renderer.dispose();renderer.domElement.remove();host.style.position=originalPosition;}
return{update,destroy};
}

export function createForestWorld(host){
 let world=null,kind=null;
 return {update(state,dt=0){const next=state?.contentVersion===3||state?.version===3?'connected':'legacy';if(next!==kind){world?.destroy();world=next==='connected'?createConnectedForestWorld(host):createLegacyForestWorld(host);kind=next;}world.update(state,dt);},destroy(){world?.destroy();world=null;}};
}
