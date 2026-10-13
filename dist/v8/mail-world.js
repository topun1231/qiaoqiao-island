import * as THREE from './vendor/three.module.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';

export const MAIL_SENTENCES = Object.freeze(['hi sam', 'come to my home', 'let us play']);
export const MAIL_ACTION_SECONDS = 5;
export const MAIL_BEAR_SCALE = .78;
export const MAIL_GROUND_Y = .065;
export const MAIL_ROUTE_POINTS = Object.freeze([
  [-4.5,.065,9],[-4.1,.065,5.6],[-2.3,.065,2.6],[1.4,.065,1.4],
  [4.1,.065,-.9],[3.2,.065,-3.5],[.2,.065,-5.0],[-2.2,.065,-5.55],[-4.3,.065,-6.5],
].map(Object.freeze));
const MAIL_ROUTE = new THREE.CatmullRomCurve3(MAIL_ROUTE_POINTS.map(p => new THREE.Vector3(...p)), false, 'catmullrom', .4);
const ROOT_Y = MAIL_GROUND_Y + .01 * MAIL_BEAR_SCALE;
const START = [-3.33, ROOT_Y, 3.45], START_YAW = .57;
const STOP_U = [.24683258128648983, .5178325812864898, .8648325812864899];
export const MAILBOX_POSITIONS = Object.freeze([[-1.96,.09,2.05],[3.88,.09,-.91],[-2.33,.09,-5.38]].map(Object.freeze));
export const MAIL_STOPS = Object.freeze(STOP_U.map(u => { const p = MAIL_ROUTE.getPointAt(u); return Object.freeze([p.x, ROOT_Y, p.z]); }));
const clamp = v => Math.max(0, Math.min(1, v));
const ease = v => { v = clamp(v); return v * v * (3 - 2 * v); };
const mix = (a,b,t) => a + (b-a)*t;
const angleMix = (a,b,t) => a + Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
const heading = (a,b) => Math.atan2(b[0]-a[0],b[2]-a[2]);
const STOP_YAWS = MAIL_STOPS.map((p,i) => heading(p,MAILBOX_POSITIONS[i]));
const WALK_END = 3.05, LIFT_END = 3.55, POST_END = 3.93, RESPONSE_START = 4.04, REFILL_START = 4.45;
const pointOnWalk = (index, progress) => {
  if (!index) return START.map((n,axis) => mix(n,MAIL_STOPS[0][axis], progress));
  const p = MAIL_ROUTE.getPointAt(mix(STOP_U[index-1], STOP_U[index], progress));
  return [p.x,ROOT_Y,p.z];
};
function canonical(state = {}) {
  const index = Math.max(0,Math.min(3,Math.trunc(Number(state.taskIndex ?? state.index ?? state.sentenceIndex ?? state.delivered) || 0)));
  const phase = state.phase || 'ready';
  const progress = Math.max(0,Math.trunc(Number(state.taskChar ?? state.charIndex ?? state.typedCount ?? state.progress) || 0));
  return { index, phase, progress, actionTime: Math.max(0,Number(state.actionTime) || 0), paused: !!state.paused };
}

// A saved state is a complete animation pose. No accumulated position or time.
export function sampleMailPose(input = {}) {
  const state = canonical(input), index = Math.min(2,state.index);
  const acting = state.phase === 'acting' && state.index < 3;
  const complete = state.phase === 'complete' || state.index === 3;
  const time = acting ? Math.min(MAIL_ACTION_SECONDS,state.actionTime) : 0;
  const previous = Math.max(0,state.index-1);
  let root = (state.index ? MAIL_STOPS[previous] : START).slice();
  let yaw = state.index ? STOP_YAWS[previous] : START_YAW;
  let gait = 0, step = 0, lift = 0, insert = 0, response = 0, refill = 0;
  if (acting) {
    const walk = clamp(time / WALK_END), travel = ease(walk);
    root = pointOnWalk(index,travel);
    const lookAhead = pointOnWalk(index,Math.min(1,travel+.002));
    const lookBehind = pointOnWalk(index,Math.max(0,travel-.002));
    const pathYaw = heading(lookBehind,lookAhead);
    yaw = angleMix(state.index ? STOP_YAWS[index-1] : START_YAW, pathYaw,ease(walk/.16));
    yaw = angleMix(yaw,STOP_YAWS[index],ease((walk-.83)/.17));
    const distance = index ? (STOP_U[index]-STOP_U[index-1])*MAIL_ROUTE.getLength() : Math.hypot(MAIL_STOPS[0][0]-START[0],MAIL_STOPS[0][2]-START[2]);
    gait = Math.sin(travel*distance/.68*Math.PI*2)*Math.sin(Math.PI*walk)*.12;
    step = travel*distance/.68*Math.PI*2;
    lift = ease((time-WALK_END)/(LIFT_END-WALK_END));
    insert = ease((time-LIFT_END)/(POST_END-LIFT_END));
    response = ease((time-RESPONSE_START)/.35);
    refill = index < 2 ? ease((time-REFILL_START)/(MAIL_ACTION_SECONDS-REFILL_START)) : 0;
  }
  const delivered = complete ? 3 : state.index + (acting && time >= POST_END ? 1 : 0);
  // Carry position, mailbox slot, and bag positions are in world coordinates.
  const carry = [root[0]+Math.sin(yaw)*.823,root[1]+.91*MAIL_BEAR_SCALE,root[2]+Math.cos(yaw)*.823];
  const box = MAILBOX_POSITIONS[index], boxYaw = STOP_YAWS[index]+Math.PI;
  const slot = [box[0]+Math.sin(boxYaw)*.405,box[1]+1.25,box[2]+Math.cos(boxYaw)*.405];
  let envelope = carry.slice(), envelopeYaw = yaw, envelopeScale = 1;
  let envelopeVisible = !complete;
  if (acting && time >= WALK_END) {
    const lifted = [slot[0]+Math.sin(boxYaw)*.16,slot[1],slot[2]+Math.cos(boxYaw)*.16];
    envelope = carry.map((n,axis)=>mix(n,lifted[axis],lift));
    if (time >= LIFT_END) envelope = lifted.map((n,axis)=>mix(n,slot[axis]-[Math.sin(boxYaw)*.31,0,Math.cos(boxYaw)*.31][axis],insert));
    envelopeScale = 1 - insert*.18;
    envelopeVisible = time < POST_END;
    if (refill > 0) {
      const bag = [root[0]-Math.cos(yaw)*.40,root[1]+.60,root[2]+Math.sin(yaw)*.40];
      envelope = bag.map((n,axis)=>mix(n,carry[axis],refill));
      envelope[1] += Math.sin(refill*Math.PI)*.11;
      envelopeVisible = true; envelopeScale = .7+.3*refill;
    }
  }
  return { index, root, yaw, gait, step, walk: acting ? clamp(time/WALK_END) : 0,
    lift: lift*(1-response), insert, response, delivered, time, acting,
    envelope, envelopeYaw, envelopeVisible, envelopeScale, envelopeTilt: -.10 * (refill || (1-insert)),
    mailboxDoor: acting ? ease((time-3.12)/.24)*(1-ease((time-3.96)/.23)) : 0,
    flag: acting ? ease((time-POST_END)/.26) : 0,
  };
}

// Controller owns requestAnimationFrame and advances only its canonical model.
export function createMailWorld(container) {
const scene = new THREE.Scene();
scene.background = new THREE.Color('#c3d697');
scene.fog = new THREE.Fog('#c3d697', 40, 74);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
container.appendChild(renderer.domElement);
const camera = new THREE.OrthographicCamera(-10.6, 10.6, 7, -7, .1, 120);
scene.add(new THREE.HemisphereLight('#fff8d9', '#6d9367', 1.7));
scene.add(new THREE.AmbientLight('#e6eed2', .3));
const sun = new THREE.DirectionalLight('#fff0c7', 2.35);
sun.position.set(-12, 23, 11); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -19, right: 19, top: 19, bottom: -19 });
sun.shadow.bias = -.0007; sun.shadow.normalBias = .035; sun.shadow.radius = 5;
scene.add(sun);
const mats = new Map(), geometries = new Set(), materials = new Set();
function mat(color) { if (!mats.has(color)) mats.set(color, new THREE.MeshStandardMaterial({ color, roughness: .96, flatShading: true })); return mats.get(color); }
function mesh(geo, color, p = [0, 0, 0], s = [1, 1, 1], parent = scene) {
  const m = new THREE.Mesh(geo, typeof color === 'string' ? mat(color) : color);
  geometries.add(geo); materials.add(m.material); m.position.set(...p); m.scale.set(...s); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
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
let seed = 2381;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const range = (a, b) => a + rnd() * (b - a);
const plane = new THREE.PlaneGeometry(90, 120); plane.rotateX(-Math.PI / 2);
mesh(plane, '#b6ce83', [0, -.01, 0]).castShadow = false;
for (const [x,z,s] of [[-13,-15,9],[10,-17,10],[-16,5,8],[18,3,10]]) {
  ell('#b9cf8c', [x,-1.65,z], [s,2.6,s*.8]).castShadow=false;
}
// One continuous, sandy garden lane. There are no river stones or letter tiles.
const route = MAIL_ROUTE;
function ribbon(curve,width,color,yOffset=0){
  const positions=[],uvs=[],indices=[];const n=160;
  for(let i=0;i<=n;i++){const t=i/n,p=curve.getPoint(t),v=curve.getTangent(t);const nx=-v.z,nz=v.x;const w=width*(.98+Math.sin(t*17)*.035);
    positions.push(p.x+nx*w/2,p.y+yOffset,p.z+nz*w/2,p.x-nx*w/2,p.y+yOffset,p.z-nz*w/2);uvs.push(0,t*12,1,t*12);
    if(i<n){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();return mesh(geo,color);
}
ribbon(route,1.94,'#bec98b',-.015);ribbon(route,1.74,'#dfcba0');
for(const pts of [ [[-2.3,.081,2.3],[-3.65,.081,1.45],[-4.4,.081,.8]], [[4,.081,-.8],[4.8,.081,-1.6],[4.8,.081,-2.4]], [[-2.2,.081,-5.6],[-3.4,.081,-6.1],[-4,.081,-6.4]] ]) ribbon(new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(...p))),.85,'#decda4');
// Irregular tiny flecks read as packed earth, not stepping targets.
for(let i=0;i<80;i++){const t=range(.04,.94),p=route.getPoint(t),v=route.getTangent(t),d=range(-.70,.70);ell(i%3?'#d2bd91':'#e9d7ac',[p.x-v.z*d,.088,p.z+v.x*d],[range(.025,.055),.006,range(.025,.075)]).castShadow=false;}

function tree(x,z,s=1,pine=false){
  const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(s);scene.add(g);
  cylinder('#957047',[0,1.1,0],.14,.24,2.2,g);
  if(pine){for(let i=0;i<3;i++){const m=mesh(new THREE.ConeGeometry(1.10-i*.17,1.55,7),['#739451','#86a657','#9ab86a'][i],[0,1.6+i*.6,0],[1,1,1],g);m.rotation.y=i*.35;}}
  else{beam([0,1.35,0],[-.47,2,.12],.085,'#957047',g);beam([0,1.52,0],[.5,2.22,0],.085,'#957047',g);
    for(const [dx,dy,dz,k]of[[0,2.5,0,1.15],[-.68,2.3,.08,.75],[.65,2.55,.15,.8],[0,3.02,-.1,.74]]){const m=mesh(ico,['#9ab958','#adc86b','#9fbd5f','#b6cc74'][Math.floor(rnd()*4)],[dx,dy,dz],[k,k,k],g);m.rotation.set(rnd(),rnd(),rnd());}}
  return g;
}
for(const [x,z,s,p]of[[-8.5,-1,1.15,0],[-9,-5,1.4,0],[-7,-9,1.05,1],[-7.8,-12,1.4,0],[-3,-12,1.2,0],[.5,-10.3,1.15,0],[3,-11,1.4,1],[7.8,-8,1.25,0],[8.8,-3.9,1.08,0],[8,1,1.12,1],[9,5.7,1.0,0],[-9.3,5.2,1.03,0],[-7.9,8.5,1.12,0]])tree(x,z,s,!!p);
function flower(x,z,s=1,color='#fff5d7'){
  const g=new THREE.Group();g.position.set(x,.07,z);g.scale.setScalar(s);scene.add(g);
  beam([0,0,0],[0,.26,0],.015,'#819958',g);ell('#84a354',[.07,.12,0],[.12,.025,.045],g);
  for(let j=0;j<5;j++){const a=j*Math.PI*2/5;ell(color,[Math.sin(a)*.096,.28,Math.cos(a)*.096],[.085,.027,.077],g);}ell('#e7ba58',[0,.3,0],[.048,.03,.048],g);
}
function grass(x,z,s=.8){const g=new THREE.Group();g.position.set(x,.06,z);scene.add(g);for(let j=0;j<3;j++){const m=mesh(new THREE.ConeGeometry(.049*s,.32*s,3),j%2?'#99b360':'#87a650',[range(-.1,.1),.12*s,range(-.1,.1)],[1,1,1],g);m.rotation.z=range(-.25,.25);}}
function flowerBed(x,z,w,d,color){
  ell('#a6bd72',[x,.06,z],[w,.065,d]).castShadow=false;
  for(let i=0;i<15;i++){const a=rnd()*Math.PI*2,r=Math.sqrt(rnd());flower(x+Math.cos(a)*r*w*.9,z+Math.sin(a)*r*d*.9,range(.65,1.05),color);}
}
flowerBed(-5.95,1.1,1.0,.57,'#fff4d5');flowerBed(-2.9,.65,.7,.43,'#eeb299');flowerBed(6.3,-1.8,.7,.64,'#f4e6b1');flowerBed(3.3,-3.5,.6,.5,'#dfdab4');flowerBed(-5.5,-6.2,.63,.47,'#efcfb0');flowerBed(.1,3.45,.9,.38,'#fff2cb');
for(const [x,z]of[[-6.3,3.4],[-.2,4.2],[2.5,3.5],[5.3,1.8],[6.7,.3],[-6.1,-4],[.3,-3],[-.3,-7.3],[-7,5.7],[3.8,5.5]]){for(let i=0;i<7;i++)grass(x+range(-.65,.65),z+range(-.5,.5),range(.7,1.2));for(let i=0;i<4;i++)flower(x+range(-.45,.45),z+range(-.3,.3),range(.65,.9),i%3?'#fff3d1':'#e9ad94');}

function fence(x,z,count,rotation=0){const g=new THREE.Group();g.position.set(x,.04,z);g.rotation.y=rotation;scene.add(g);for(let i=0;i<count;i++){const p=block('#d1ba83',[i*.52,.43,0],[.12,.84,.13],g);const cap=mesh(new THREE.ConeGeometry(.10,.12,4),'#dec995',[i*.52,.9,0],[1,1,1],g);cap.rotation.y=Math.PI/4;}for(const y of[.29,.64])block('#ddc894',[(count-1)*.26,y,.015],[(count-1)*.52+.18,.10,.10],g);}
fence(-6.15,1.55,4);fence(-6.5,-.5,5,Math.PI/2);fence(5.65,-1.6,4);fence(6.9,-3.7,4,Math.PI/2);fence(-5.8,-5.8,3);

function cottage(x,z,scale,palette){
  const g=new THREE.Group();g.name='garden-cottage';g.position.set(x,.07,z);g.scale.setScalar(scale);scene.add(g);
  block(palette.wall,[0,1.2,0],[2.9,2.4,2.55],g);block('#d3c498',[0,.11,0],[3.08,.22,2.73],g);
  const tri=new THREE.Shape();tri.moveTo(-1.45,0);tri.lineTo(1.45,0);tri.lineTo(0,1.35);tri.closePath();
  mesh(new THREE.ExtrudeGeometry(tri,{depth:2.55,bevelEnabled:false}),palette.wall,[0,2.4,-1.275],[1,1,1],g);
  for(const side of[-1,1]){let roof=block(palette.roof,[side*.80,3.10,0],[2.26,.14,3.1],g);roof.rotation.z=-side*.75;
    for(let row=0;row<4;row++)for(let col=0;col<6;col++){const tile=block(palette.tiles[(row+col)%3],[side*(.2+row*.4),3.80-row*.37,-1.36+col*.49],[.59,.10,.47],g);tile.rotation.z=-side*.75;}}
  for(let i=0;i<7;i++){const ridge=cylinder(palette.tiles[1],[0,3.78,-1.5+i*.47],.125,.125,.48,g,8);ridge.rotation.x=Math.PI/2;}
  block(palette.wall,[.87,3.37,-.6],[.44,1.25,.49],g);block('#e9dfbb',[.87,4.02,-.6],[.62,.15,.64],g);block('#989278',[.87,4.105,-.6],[.33,.012,.33],g);
  const arch=new THREE.Shape();arch.moveTo(-.43,0);arch.lineTo(.43,0);arch.lineTo(.43,.98);arch.absarc(0,.98,.43,0,Math.PI,false);arch.lineTo(-.43,0);
  mesh(new THREE.ExtrudeGeometry(arch,{depth:.07,bevelEnabled:true,bevelSize:.03,bevelThickness:.025,bevelSegments:2}),palette.door,[-.12,.15,1.283],[1,1,1],g);
  for(let dx=-.4;dx<=.2;dx+=.15)block('#967b52',[dx,.80,1.38],[.012,1.05,.01],g);ell('#ecd58b',[.14,.73,1.43],[.06,.06,.038],g);
  block('#e1d2aa',[-.12,.12,1.54],[1.34,.18,.49],g);block('#dac9a0',[-.12,.05,1.85],[1.58,.10,.36],g);
  mesh(new THREE.CircleGeometry(.37,24),'#839c86',[0,2.60,1.285],[1,1,1],g);
  mesh(new THREE.TorusGeometry(.38,.064,7,24),'#e0c186',[0,2.60,1.33],[1,1,1],g);
  block('#e8cf99',[0,2.60,1.39],[.052,.70,.05],g);block('#e8cf99',[0,2.60,1.39],[.70,.052,.05],g);
  block('#8eaa95',[1.456,1.41,.23],[.025,.66,.70],g);
  for(const zz of[-.14,.60])block('#d0b581',[1.485,1.41,zz],[.06,.80,.06],g);for(const yy of[1.04,1.41,1.8])block('#d8c28e',[1.49,yy,.23],[.06,.055,.85],g);
  for(const side of[-1,1])for(let i=0;i<4;i++){const bush=mesh(ico,side>0?'#9cac6b':'#8fa866',[side*(1.24+rnd()*.35),.27,.72+rnd()*.6],[.35,.31,.35],g);bush.rotation.set(rnd(),rnd(),rnd());}
  return g;
}
cottage(-4.5,-.7,.90,{wall:'#f4e4b9',roof:'#b56d46',tiles:['#c37d4c','#d69259','#cb8650'],door:'#aa8151'});
cottage(4.75,-3.7,.76,{wall:'#e3dec0',roof:'#81957b',tiles:['#82977d','#93a18a','#8c9c81'],door:'#99a47f'});
cottage(-3.9,-7.8,.71,{wall:'#e4dfba',roof:'#a28d6c',tiles:['#aa9572','#b39d7a','#aa9674'],door:'#9c986d'});


const dynamicRoots = new Set();
const dynamic = name => { const g = new THREE.Group(); g.name = name; dynamicRoots.add(g); scene.add(g); return g; };
const mailboxes = MAILBOX_POSITIONS.map(([x,y,z],index) => {
  const g=dynamic(`recipient-mailbox-${index+1}`);g.position.set(x,y,z);g.rotation.y=STOP_YAWS[index]+Math.PI;
  const colors={body:mat('#cb805b').clone(),door:mat('#b86743').clone(),flag:mat('#e5b755').clone()};
  cylinder('#ac8250',[0,.48,0],.066,.08,.96,g);block('#cf9160',[0,.96,0],[.60,.13,.61],g);
  block(colors.body,[0,1.18,0],[.59,.40,.67],g);
  const dome=mesh(new THREE.CylinderGeometry(.295,.295,.67,14,1,false,0,Math.PI),colors.body,[0,1.38,0],[1,1,1],g);dome.rotation.x=Math.PI/2;dome.rotation.z=Math.PI/2;
  block('#6c6449',[0,1.23,.342],[.47,.28,.014],g);
  const door=new THREE.Group();door.name='mailbox-door';door.position.set(0,1.075,.352);g.add(door);
  block(colors.door,[0,.155,0],[.50,.31,.035],door);block('#f3dcac',[0,.175,.025],[.28,.036,.018],door);
  const flag=new THREE.Group();flag.name='mailbox-flag';flag.position.set(.36,1.16,-.12);g.add(flag);
  block('#d7ac64',[0,.23,0],[.055,.48,.065],flag);block(colors.flag,[.1,.44,0],[.24,.12,.045],flag);
  const ring=ell('#f7d67f',[0,.035,0],[.68,.026,.52],g);ring.castShadow=false;ring.name='active-mailbox-ground-glow';
  const status = new THREE.Group();status.name='delivered-invitation';g.add(status);
  block('#fff0c6',[0,1.20,.02],[.39,.22,.03],status);status.visible=false;
  return {g,door,flag,ring,status,colors};
});

// Four short legs remain separate: scenery batching must never capture the actor.
const bear=dynamic('bear-carrying-invitation');bear.scale.setScalar(MAIL_BEAR_SCALE);
const body=new THREE.Group();bear.add(body);
ell('#aa6b32',[0,.7,-.27],[.52,.57,.75],body);ell('#c4833c',[0,.88,-.2],[.48,.50,.62],body);ell('#b77633',[0,.92,-.91],[.16,.18,.17],body);
const legs=[];
for(const x of[-.33,.33])for(const z of[-.67,.22]){const leg=new THREE.Group();leg.name=`bear-leg-${legs.length}`;leg.position.set(x,.55,z);body.add(leg);ell('#aa6930',[0,-.21,0],[.18,.38,.19],leg);ell('#814d25',[0,-.43,.065],[.2,.13,.25],leg);leg.userData.base=[x,.55,z];legs.push(leg);}
const head=new THREE.Group();head.name='bear-head';head.position.set(0,1.25,.43);body.add(head);ell('#bd7b37',[0,0,0],[.53,.54,.46],head);ell('#cb8a44',[0,.07,.12],[.46,.46,.37],head);
for(const x of[-.38,.38]){ell('#a5652f',[x,.40,-.05],[.20,.21,.13],head);ell('#7e4b2b',[x,.42,.055],[.115,.13,.06],head);}
ell('#ead3a1',[0,-.17,.42],[.28,.23,.19],head);ell('#3c3426',[0,-.06,.596],[.106,.077,.057],head);
for(const x of[-.23,.23]){ell('#342e22',[x,.08,.402],[.058,.079,.043],head);ell('#fff3d0',[x-.012,.11,.435],[.019,.024,.012],head);}
const bag=block('#ad8150',[-.48,.68,-.24],[.16,.39,.44],body);bag.rotation.z=-.08;block('#c49a61',[-.575,.79,-.24],[.026,.15,.44],body);
beam([-.44,.92,-.45],[-.39,1.12,.1],.029,'#e0bd78',body);

// Independent envelope travels into the real mailbox opening before disappearing.
const letter=dynamic('visible-cream-envelope');
block('#fff0c6',[0,0,0],[.70,.43,.045],letter);
beam([-.33,.195,.026],[0,-.025,.026],.012,'#c3a373',letter);beam([0,-.025,.027],[.33,.195,.027],.012,'#c3a373',letter);
beam([-.33,-.195,.026],[-.09,-.025,.026],.009,'#e0c493',letter);beam([.33,-.195,.026],[.09,-.025,.026],.009,'#e0c493',letter);
ell('#d79064',[0,-.035,.039],[.058,.058,.012],letter);

const recipientLocations = [[-4.61,.07,.88],[4.66,.07,-2.29],[-3.98,.07,-6.48]];
const recipients=recipientLocations.map((p,index)=>{
  const g=dynamic(`cottage-recipient-${index+1}`);g.position.set(...p);g.scale.setScalar(.56);
  const color=['#d1b389','#ad9b7d','#cfac7f'][index];
  ell(color,[0,.41,0],[.28,.39,.24],g);ell(color,[0,.94,.035],[.32,.32,.28],g);
  for(const x of[-.22,.22])ell(color,[x,index===1?1.30:1.18,.0],index===1?[.105,.31,.09]:[.13,.15,.09],g);
  ell('#edddbd',[0,.84,.265],[.18,.12,.08],g);ell('#514533',[0,.88,.34],[.05,.035,.03],g);
  for(const x of[-.13,.13])ell('#413b2d',[x,.98,.289],[.028,.039,.022],g);
  for(const x of[-.17,.17])ell('#8e7654',[x,.12,.03],[.12,.11,.18],g);
  const paw=new THREE.Group();paw.position.set(.28,.66,.015);g.add(paw);ell(color,[.05,.1,0],[.1,.24,.1],paw);
  ell(color,[-.29,.47,.015],[.09,.21,.10],g);
  return {g,paw,base:p};
});

// Merge only immutable scenery, preserving independent actor/mailbox transforms.
scene.updateMatrixWorld(true);
const batches=new Map(),remove=[];
scene.traverse(o=>{
  if(!o.isMesh||o.material.transparent)return;
  for(let parent=o;parent;parent=parent.parent)if(dynamicRoots.has(parent))return;
  const key=o.material.uuid;let batch=batches.get(key);if(!batch){batch={material:o.material,geometries:[]};batches.set(key,batch);}
  batch.geometries.push((o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(o.matrixWorld));remove.push(o);
});
for(const m of remove)m.removeFromParent();
for(const batch of batches.values()){
  const geometry=mergeGeometries(batch.geometries,false);
  if(geometry){geometries.add(geometry);const m=new THREE.Mesh(geometry,batch.material);m.name='batched-garden-scenery';m.castShadow=m.receiveShadow=true;scene.add(m);}
  for(const g of batch.geometries)g.dispose();
}

// These labels are projected from scene coordinates, never a separate sentence HUD.
const overlay=document.createElement('div');overlay.className='mail-scene-labels';
Object.assign(overlay.style,{position:'absolute',inset:'0',pointerEvents:'none',overflow:'hidden',zIndex:'2'});
container.appendChild(overlay);
const addLabel=(className,css)=>{const el=document.createElement('div');el.className=className;Object.assign(el.style,{position:'absolute',fontFamily:'"PingFang SC","Microsoft YaHei",Arial,sans-serif',...css});overlay.appendChild(el);return el;};
const panel=addLabel('mail-world-sentence',{background:'#fff8df',border:'1px solid #ead6a3',borderRadius:'16px',padding:'10px 12px 12px',boxShadow:'0 5px 18px #484c2415',color:'#52643c',transform:'translate(-30%,-100%)'});
panel.setAttribute('role','group');panel.setAttribute('aria-label','当前邀请短句');
const title=document.createElement('div');Object.assign(title.style,{fontSize:'11px',fontWeight:'700',letterSpacing:'.8px',color:'#92845e',marginBottom:'7px'});panel.appendChild(title);
const cells=document.createElement('div');Object.assign(cells.style,{display:'grid',gap:'3px',alignItems:'center'});panel.appendChild(cells);
const pointer=document.createElement('div');Object.assign(pointer.style,{position:'absolute',left:'30%',bottom:'-9px',width:'16px',height:'16px',background:'#fff8df',borderRight:'1px solid #ead6a3',borderBottom:'1px solid #ead6a3',transform:'rotate(45deg)'});panel.appendChild(pointer);
const numbers=mailboxes.map((_,i)=>{const el=addLabel('mailbox-world-number',{width:'28px',height:'28px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'15px',fontWeight:'800',background:'#edecd1',border:'1px solid #b5ba92',color:'#899271',transform:'translate(-50%,-50%)'});el.textContent=String(i+1);return el;});
const replies=recipients.map((_,i)=>{const el=addLabel('recipient-world-response',{padding:'6px 10px',borderRadius:'12px',background:'#fff9dc',border:'1px solid #e4d3a2',fontWeight:'700',fontSize:'12px',color:'#68804e',whiteSpace:'nowrap',boxShadow:'0 3px 12px #53632912',transform:'translate(-50%,-100%)'});el.textContent=['收到啦！','我会来的！','一起玩！'][i];return el;});
let disposed=false,lastState=null,frozenState=null,frozenInput=null,cellKey='',cellNodes=[],width=1,height=1;
const vector=new THREE.Vector3();
function screenPosition(position) { vector.set(...position).project(camera);return [(vector.x*.5+.5)*width,(-vector.y*.5+.5)*height]; }
function project(el,position) { const [x,y]=screenPosition(position);el.style.left=`${x}px`;el.style.top=`${y}px`; }
function updateLabels(state,pose){
  const index=Math.min(2,state.index),text=MAIL_SENTENCES[index];
  const key=`${index}:${width<560}`;
  if(cellKey!==key){
    cellKey=key;cellNodes=[];cells.replaceChildren();
    for(const [i,ch]of[...text].entries()){
      const el=document.createElement('span');el.textContent=ch===' '?'␣':ch.toUpperCase();
      el.setAttribute('aria-label',ch===' '?'Space 空格':ch);el.dataset.character=ch===' '?'Space':ch;
      Object.assign(el.style,{display:'inline-flex',alignItems:'center',justifyContent:'center',height:'34px',borderRadius:'7px',fontFamily:'Arial,sans-serif',fontWeight:'800',boxSizing:'border-box',border:'1px solid transparent',position:'relative'});
      cells.appendChild(el);cellNodes.push(el);
    }
  }
  const columns=index===1?8:index===2?7:6;
  const cellWidth=Math.max(23,Math.min(31,(width-64-(columns-1)*3)/columns));
  cells.style.gridTemplateColumns=`repeat(${columns}, ${cellWidth}px)`;
  const progress=state.phase==='acting'?text.length:Math.min(text.length,state.progress);
  cellNodes.forEach((el,i)=>{
    const done=i<progress,current=i===progress&&state.phase!=='acting';
    el.dataset.status=done?'done':current?'current':'future';
    Object.assign(el.style,{width:`${cellWidth}px`,fontSize:`${Math.min(26,cellWidth*.87)}px`,color:done?'#3c673d':current?'#3d5937':'#69754f',background:done?'#dceab6':current?'#edf0d2':'transparent',borderColor:current?'#96a665':done?'#b6c991':'transparent',boxShadow:current?'0 2px 0 #91a45b':'none'});
  });
  title.textContent=state.phase==='acting'?(pose.time<POST_END?'小熊正在送信…':'邀请送到啦！'):['给 SAM 的邀请','送给朋友的邀请','最后一封邀请'][index];
  panel.style.display=state.index>=3||state.phase==='complete'?'none':'block';
  const box=MAILBOX_POSITIONS[index],anchor=[box[0]+(index===1?-.5:1.05),2.70,box[2]];
  const [px,py]=screenPosition(anchor),panelWidth=columns*cellWidth+(columns-1)*3+26;
  const left=Math.max(panelWidth*.30+12,Math.min(width-panelWidth*.70-12,px));
  panel.style.left=`${left}px`;panel.style.top=`${Math.max(160,Math.min(height-112,py))}px`;
  panel.dataset.sentence=text;panel.dataset.progress=String(progress);panel.dataset.mailIndex=String(index);
  numbers.forEach((el,i)=>{
    const done=i<pose.delivered,current=i===state.index&&!done;
    el.textContent=done?'✓':String(i+1);el.dataset.status=done?'done':current?'current':'future';
    Object.assign(el.style,{background:done?'#dae7b3':current?'#fff1c4':'#edecd1',color:done?'#638044':current?'#936340':'#899271',borderColor:current?'#d1b977':'#b5ba92'});
    project(el,[MAILBOX_POSITIONS[i][0],i===state.index?1.7:2.1,MAILBOX_POSITIONS[i][2]]);
  });
  replies.forEach((el,i)=>{
    const shown=i<state.index||(pose.acting&&i===state.index&&pose.response>0)||state.index===3;
    el.style.display=shown?'block':'none';el.style.opacity=String(i<state.index||state.index===3?1:pose.response);
    project(el,[recipientLocations[i][0],1.8,recipientLocations[i][2]]);
  });
}
function compose(state){
  const pose=sampleMailPose(state);
  bear.position.set(...pose.root);bear.rotation.set(0,pose.yaw,0);body.rotation.set(0,0,0);body.position.set(0,0,0);
  head.position.set(0,1.25+pose.lift*.065,.43);head.rotation.set(-pose.lift*.11,0,-pose.gait*.08);
  legs.forEach((leg,i)=>{
    const [x,y,z]=leg.userData.base,phase=pose.step+(i===0||i===3?0:Math.PI);
    const moving=pose.acting&&pose.time<WALK_END;
    const stride=moving?Math.sin(phase)*Math.sin(Math.PI*pose.walk)*.09:0;
    const rise=moving?Math.max(0,Math.cos(phase))*Math.sin(Math.PI*pose.walk)*.065:0;
    leg.position.set(x,y+rise+(i===3?pose.lift*.07:0),z+stride);leg.rotation.set(i===3?-pose.lift*.08:0,0,0);
  });
  letter.position.set(...pose.envelope);letter.rotation.set(0,pose.envelopeYaw,pose.envelopeTilt);letter.scale.setScalar(MAIL_BEAR_SCALE*pose.envelopeScale);letter.visible=pose.envelopeVisible;
  mailboxes.forEach((box,i)=>{
    const done=i<pose.delivered,current=i===state.index&&!done;
    box.g.userData.status=done?'done':current?'current':'future';
    box.colors.body.color.set(current?'#cb805b':done?'#aebc83':'#a8ae8b');
    box.colors.door.color.set(current?'#b86743':done?'#94a06c':'#8f9978');
    box.colors.flag.color.set(done?'#e5b755':current?'#e5b755':'#b6b291');
    box.ring.visible=current;box.door.rotation.x=i===state.index?pose.mailboxDoor*Math.PI*.43:0;
    const raised=i<state.index||state.index===3?1:i===state.index?pose.flag:0;
    box.flag.rotation.x=(1-raised)*Math.PI*.52;box.status.visible=done;
    box.g.userData.posted=done;
  });
  recipients.forEach((recipient,i)=>{
    const amount=i<state.index||state.index===3?1:i===state.index?pose.response:0;
    recipient.g.visible=amount>0;recipient.g.position.set(recipient.base[0],recipient.base[1]-.08*(1-amount),recipient.base[2]);
    recipient.g.scale.setScalar(.56*(.92+.08*amount));
    recipient.paw.rotation.z=-.35-(i===state.index?Math.sin(pose.time*9)*pose.response*(1-ease((pose.time-4.6)/.4))*.22:0);
  });
  camera.updateMatrixWorld(true);updateLabels(state,pose);renderer.render(scene,camera);
}
function resize(){
  if(disposed)return;
  width=Math.max(1,container.clientWidth);height=Math.max(1,container.clientHeight);const aspect=width/height;
  renderer.setSize(width,height);const halfW=aspect<1?10.45:10.3;
  camera.left=-halfW;camera.right=halfW;camera.top=halfW/aspect;camera.bottom=-halfW/aspect;
  camera.position.set(0,18,25);camera.lookAt(0,.8,aspect<1?-.2:0);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  if(lastState)compose(lastState);
}
function render(input={},dt=0){
  if(disposed)return;
  let state=canonical(input);
  // A pause locks the first presented pose, including external mutation attempts.
  if(state.paused){
    if(!frozenState||frozenInput!==input){frozenState={...state};frozenInput=input;}
    state=frozenState;
  }else{frozenState=frozenInput=null;}
  lastState=state;compose(state);
}
globalThis.window?.addEventListener('resize',resize);
const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;observer?.observe(container);
resize();render({phase:'ready',taskIndex:0,taskChar:0});
return {render,resize,
  dispose(){
    if(disposed)return;disposed=true;globalThis.window?.removeEventListener('resize',resize);observer?.disconnect();
    geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());
    for(const material of mats.values())if(!materials.has(material))material.dispose();
    renderer.dispose();renderer.domElement.remove();overlay.remove();scene.clear();
    geometries.clear();materials.clear();mats.clear();frozenState=frozenInput=lastState=null;cellNodes=[];
  },
};
}
