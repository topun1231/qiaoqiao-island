import * as THREE from './vendor/three.module.js';
import{mergeGeometries}from'./vendor/BufferGeometryUtils.js';
import { createRewards } from './rewards.js';
export function createWorld(container){
const scene=new THREE.Scene();scene.background=new THREE.Color('#b3d68a');scene.fog=new THREE.Fog('#c2dfa1',34,66);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;container.appendChild(renderer.domElement);
const camera=new THREE.OrthographicCamera(-13,13,9,-9,.1,100);camera.position.set(0,15,23);camera.lookAt(0,0,-1.7);
scene.add(new THREE.HemisphereLight('#fff9da','#6c976f',1.65));const sun=new THREE.DirectionalLight('#fff1cb',2.5);sun.position.set(-12,23,9);sun.castShadow=true;sun.shadow.mapSize.set(1536,1536);sun.shadow.camera.left=-20;sun.shadow.camera.right=20;sun.shadow.camera.top=20;sun.shadow.camera.bottom=-20;sun.shadow.bias=-.0006;sun.shadow.normalBias=.04;sun.shadow.radius=4;scene.add(sun);scene.add(new THREE.AmbientLight('#e6fff1',.25));
const materials={};function mat(c,flat=false){let k=c+flat;return materials[k]??=new THREE.MeshStandardMaterial({color:c,roughness:.92,flatShading:flat});}function mesh(g,c,p=[0,0,0],s=[1,1,1],parent=scene){const m=new THREE.Mesh(g,typeof c==='string'?mat(c):c);m.position.set(...p);m.scale.set(...s);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}const sphere=new THREE.SphereGeometry(1,14,10),ico=new THREE.IcosahedronGeometry(1,1),box=new THREE.BoxGeometry(1,1,1);function ell(c,p,s,parent){return mesh(sphere,c,p,s,parent)}function cube(c,p,s,parent){return mesh(box,c,p,s,parent)}function cylinder(c,p,rt,rb,h,parent,segments=9){return mesh(new THREE.CylinderGeometry(rt,rb,h,segments),c,p,[1,1,1],parent)}function lineBetween(a,b,r,c,parent=scene){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),m=cylinder(c,av.clone().add(bv).multiplyScalar(.5).toArray(),r,r,av.distanceTo(bv),parent);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),bv.sub(av).normalize());return m}let seed=103;function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}function range(a,b){return a+rnd()*(b-a)}
// Continuous sculpted banks, warm cliff layers, and soft grassy edges.
const leftEdge=[[-4.1,12],[-4.5,8],[-4.05,5],[-4.25,2],[-4.1,-1],[-4.7,-4],[-4.25,-7],[-5.15,-10],[-4.7,-14],[-5.1,-22]];function bank(side){const shape=new THREE.Shape();shape.moveTo(side*22,-45);shape.lineTo(side*4.4,-45);for(const [x,z]of leftEdge)shape.lineTo(side*(-x),-z);shape.lineTo(side*5.1,60);shape.lineTo(side*22,60);shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth:1.4,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.32,bevelThickness:.2});g.rotateX(-Math.PI/2);const m=mesh(g,'#8db34c',[0,-1.4,0]);m.receiveShadow=true;}
// Shape coordinates are flipped in Z by extrusion rotation, so the broad banks fill both foreground and distance.
bank(-1);bank(1);
for(const side of[-1,1])for(let z=-18;z<13;z+=1.35){const x=side*(4.2+Math.sin(z*.55)*.35);const rock=mesh(ico,mat(['#8a9b8a','#91a095','#a4aea0'][Math.floor(rnd()*3)],true),[x,-.9,z],[range(.65,1.25),range(.85,1.5),range(.8,1.3)]);rock.rotation.set(rnd(),rnd(),rnd());ell('#a6c65c',[x+side*.3,.02,z],[.8,.2,.9]);}
// A sunlit turquoise stream with moving caustics, entirely rendered in the 3D scene.
const waterMat=new THREE.ShaderMaterial({uniforms:{time:{value:0}},vertexShader:`varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 p;uniform float time;float caustic(vec2 q){vec2 v=q;for(int i=0;i<3;i++){float f=float(i)+1.;v+=vec2(sin(v.y*f+time*.22),cos(v.x*f-time*.18))*.35;}return pow(abs(sin(v.x*3.)*sin(v.y*3.)),12.);}void main(){vec2 q=p.xz;float s=sin(q.x*1.7+q.y*2.3+time*.7)*.035+sin(q.y*5.+time)*.015;float c=caustic(q*.72);vec3 color=mix(vec3(.12,.58,.59),vec3(.30,.76,.72),.55+s+q.y*.008);color+=c*.15;gl_FragColor=vec4(color,1.);}`});const wg=new THREE.PlaneGeometry(50,130);wg.rotateX(-Math.PI/2);mesh(wg,waterMat,[0,-.75,0]).castShadow=false;
// A small waterfall in the distance catches the morning light.
const upstreamG=new THREE.PlaneGeometry(8.6,22);upstreamG.rotateX(-Math.PI/2);mesh(upstreamG,waterMat,[0,.05,-19.3]).castShadow=false;
const fallG=new THREE.BufferGeometry();fallG.setAttribute('position',new THREE.Float32BufferAttribute([-4.1,.06,-8.3,4.1,.06,-8.3,-4.1,-.70,-7.72,4.1,-.70,-7.72],3));fallG.setIndex([0,2,1,1,2,3]);fallG.computeVertexNormals();mesh(fallG,new THREE.MeshBasicMaterial({color:'#9adbd2',transparent:true,opacity:.63,side:THREE.DoubleSide})).castShadow=false;
for(let i=0;i<34;i++){const x=range(-4.05,4.05);const stream=lineBetween([x,range(-.1,.06),-8.26],[x+range(-.06,.06),-.69,range(-7.78,-7.68)],range(.012,.038),'#b8eee0');stream.castShadow=false;for(let j=0;j<2;j++)ell('#b9e8dc',[x+range(-.12,.12),-.68,-7.7+range(-.1,.25)],[range(.07,.15),.012,range(.08,.25)]).castShadow=false;}
for(const [x,z,sc] of [[-3.7,-8.6,1.05],[3.6,-8.8,1.2],[-2.7,-9.2,.65],[2.6,-9.2,.65]])mesh(ico,mat('#98a89e',true),[x,.06,z],[sc,sc*.9,sc*.9]);
const ripples=[];function ripple(x,z,r=1){const g=new THREE.TorusGeometry(r,.018,4,50,Math.PI*1.4),m=mesh(g,new THREE.MeshBasicMaterial({color:'#b5f4e7',transparent:true,opacity:.65}),[x,-.715,z]);m.rotation.x=-Math.PI/2;m.rotation.z=rnd()*6;ripples.push(m)}for(let i=0;i<22;i++)ripple(range(-3.7,3.7),range(-16,13),range(.2,.7));
for(const [x,z,s]of[[-2.8,6,1],[2.9,5,.7],[-2.7,-4,.7],[3,-10,.9]]){mesh(ico,mat('#a6b4ab',true),[x,-.55,z],[s,.75*s,.8*s]);ripple(x,z,s*1.15)}
// Sandy stepping paths lead onto a proper timber bridge.
for(const side of[-1,1]){const path=cube('#e7d398',[side*8,.23,1.4],[8,.10,2.1]);path.rotation.y=side*.05;for(let i=0;i<10;i++){const x=side*range(5,12),z=range(.7,2.1);ell('#c4c2a8',[x,.32,z],[range(.18,.4),.08,range(.13,.26)]);}}
const bridgeZ=1.05,bridgeY=.32;for(const z of[bridgeZ-.89,bridgeZ+.89]){cube('#805b37',[0,.05,z],[9.65,.25,.18]);cube('#b9935e',[0,.2,z],[9.65,.09,.20]);}
for(const side of[-1,1]){for(let n=0;n<3;n++)cube('#ba925d',[side*(4.6+n*.36),bridgeY,bridgeZ],[.34,.17,2.04]);for(const z of[bridgeZ-1.03,bridgeZ+1.03]){cylinder('#88623a',[side*4.5,-.22,z],.19,.23,2.1);cylinder('#c49b68',[side*4.5,.85,z],.22,.22,.11);cylinder('#dcc296',[side*4.5,.91,z],.17,.17,.012);for(let y=.4;y<.72;y+=.09){const ring=mesh(new THREE.TorusGeometry(.225,.036,5,12),'#d6bd82',[side*4.5,y,z]);ring.rotation.x=Math.PI/2;}lineBetween([side*4.5,-1.0,z],[side*3.5,0,z],.1,'#765b3d');}}
const planks=[],outlines=[];for(let i=0;i<8;i++){const x=-3.7+i*1.055;const group=new THREE.Group();group.name=`bridge-plank-${i+1}`;group.position.set(x,bridgeY,bridgeZ);scene.add(group);cube('#ca9d65',[0,0,0],[.965,.19,1.82],group);cube('#d5ad76',[-.27,.101,0],[.02,.008,1.6],group);cube('#a77745',[.25,.101,-.05],[.013,.008,1.54],group);for(const z of[-.70,.70])ell('#796047',[0,.102,z],[.035,.013,.035],group);group.visible=false;planks.push(group);const pts=[[-.46,0,-.90],[.46,0,-.90],[.46,0,.9],[-.46,0,.9],[-.46,0,-.90]].map(p=>new THREE.Vector3(x+p[0],.43,bridgeZ+p[2]));const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineDashedMaterial({color:'#fffadd',dashSize:.17,gapSize:.09,transparent:true,opacity:.85}));l.computeLineDistances();scene.add(l);outlines.push(l);}
// Trees have distinct silhouettes, woody branches, and gently faceted crowns.
function tree(x,z,s=1,pine=false){const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(s);scene.add(g);cylinder('#95643b',[0,1.15,0],.16,.29,2.3,g);cylinder('#ae7941',[.06,.55,.10],.055,.12,1.0,g);if(pine){for(let i=0;i<3;i++){let t=mesh(new THREE.ConeGeometry(1.23-i*.20,1.75,7),mat(['#4c8555','#5b955f','#72a969'][i],true),[0,1.7+i*.66,0],[1,1,1],g);t.rotation.y=i*.3;}}else{lineBetween([0,1.4,0],[-.52,2.1,.1],.1,'#95643b',g);lineBetween([0,1.6,0],[.55,2.3,0],.1,'#95643b',g);for(const [dx,dy,dz,ss]of[[0,2.6,0,1.35],[-.7,2.4,.1,.85],[.65,2.65,.2,.85],[0,3.2,-.1,.83]]){const leaf=mesh(ico,mat(['#91bd42','#a8ce53','#86b643','#bddb65'][Math.floor(rnd()*4)],true),[dx,dy,dz],[ss,ss,ss],g);leaf.rotation.set(rnd(),rnd(),rnd());}}return g;}
for(const [x,z,s,p]of[[-9,-2,1.3,0],[-6.8,-5,1.12,0],[-11,-7,1.4,1],[-9.8,5,1.05,0],[-12,0,1.4,0],[-6.4,-10,1,0],[-11,-14,1.6,0],[6,-5,1.1,1],[8,-7,1.35,1],[11,-5,1.4,0],[12,5,1.35,0],[5.8,-11,1.0,0],[9.6,-12,1.5,1],[-13,8,1.5,1]])tree(x,z,s,!!p);
function grass(x,z,s){const g=new THREE.Group();g.position.set(x,.12,z);scene.add(g);for(let i=0;i<4;i++){let b=mesh(new THREE.ConeGeometry(.075*s,.48*s,3),mat(i%2?'#7faa3e':'#a1bf4b',true),[range(-.14,.14),.14*s,range(-.14,.14)],[1,1,1],g);b.rotation.z=range(-.4,.4);}}function flower(x,z,s=1){const g=new THREE.Group();g.position.set(x,.22,z);g.scale.setScalar(s);scene.add(g);lineBetween([0,0,0],[0,.22,0],.018,'#629447',g);for(let j=0;j<5;j++){let a=j*Math.PI*2/5;ell('#fff9df',[Math.sin(a)*.105,.24,Math.cos(a)*.105],[.092,.033,.082],g);}ell('#edc45f',[0,.26,0],[.058,.035,.058],g)}
for(let i=0;i<160;i++){let x=range(4.8,13)*(rnd()<.5?-1:1),z=range(-16,9);if(z>-.1&&z<2.8)continue;if(x>6&&x<10&&z>-5&&z<0)continue;grass(x,z,range(.7,1.5));if(i%3===0){for(let j=0;j<3;j++)flower(x+range(-.35,.35),z+range(-.3,.3),range(.75,1.3));}}
for(let i=0;i<28;i++){const x=range(5,13)*(rnd()<.5?-1:1),z=range(-16,10);if(z>-.1&&z<3)continue;mesh(ico,mat('#a9b19b',true),[x,.2,z],[range(.3,.8),range(.25,.6),range(.3,.7)]);}
// The little cottage: plaster, layered terracotta shingles, round glazing and an arched door.
const house=new THREE.Group();house.position.set(8.1,.12,-2.75);house.rotation.y=-.12;scene.add(house);cube('#f5e6b9',[0,1.25,0],[3.25,2.5,2.7],house);cube('#d3c39c',[0,.12,0],[3.45,.24,2.9],house);
const tri=new THREE.Shape();tri.moveTo(-1.63,0);tri.lineTo(1.63,0);tri.lineTo(0,1.6);tri.closePath();const tg=new THREE.ExtrudeGeometry(tri,{depth:2.7,bevelEnabled:false});mesh(tg,'#f7e7bb',[0,2.5,-1.35],[1,1,1],house);
for(const side of[-1,1]){let roof=cube('#b86537',[side*.93,3.29,0],[2.58,.14,3.4],house);roof.rotation.z=side*-.775;for(let row=0;row<5;row++)for(let col=0;col<7;col++){const x=side*(.19+row*.40),y=4.18-row*.392,z=-1.53+col*.49;const tile=cube(['#cb7743','#dc8d52','#d98247','#e29959'][(row+col)%4],[x,y,z],[.57,.115,.465],house);tile.rotation.z=side*-.775;}}for(let i=0;i<8;i++){const ridge=cylinder('#dd8b4c',[0,4.09,-1.65+i*.45],.16,.16,.46,house,8);ridge.rotation.x=Math.PI/2;}
cube('#ecdcb1',[1,3.72,-.65],[.48,1.45,.52],house);cube('#f7edcd',[1,4.47,-.65],[.67,.18,.67],house);cube('#8e8b70',[1,4.57,-.65],[.36,.015,.36],house);
const arch=new THREE.Shape();arch.moveTo(-.52,0);arch.lineTo(.52,0);arch.lineTo(.52,1.02);arch.absarc(0,1.02,.52,0,Math.PI,false);arch.lineTo(-.52,0);const doorG=new THREE.ExtrudeGeometry(arch,{depth:.08,bevelEnabled:true,bevelSize:.035,bevelThickness:.025,bevelSegments:2});mesh(doorG,'#a9743e',[0,.2,1.36],[1,1,1],house);for(let x=-.35;x<=.35;x+=.175)cube('#87572f',[x,.86,1.46],[.018,1.25,.012],house);ell('#eac365',[.3,.82,1.51],[.08,.08,.05],house);cube('#e9d8ae',[0,.2,1.66],[1.6,.24,.6],house);cube('#dcca9f',[0,.1,2.05],[1.85,.17,.4],house);
const win=mesh(new THREE.CircleGeometry(.43,24),'#497e79',[0,2.74,1.366],[1,1,1],house);const wr=mesh(new THREE.TorusGeometry(.44,.085,7,24),'#dfa65d',[0,2.74,1.42],[1,1,1],house);cube('#e9b568',[0,2.74,1.46],[.075,.8,.07],house);cube('#e9b568',[0,2.74,1.46],[.8,.075,.07],house);cube('#748777',[1.636,1.46,.35],[.035,.65,.7],house);for(const z of[-.05,.75])cube('#c79954',[1.67,1.46,z],[.08,.8,.08],house);for(const y of[1.07,1.46,1.86])cube('#d4a45f',[1.67,y,.35],[.08,.08,.88],house);
for(const side of[-1,1]){for(let i=0;i<7;i++){ell('#669c4c',[side*(1.4+rnd()*.5),.28,1+rnd()*.5],[.3,.3,.3],house);flower(8.1+side*(1.4+rnd()*.4),-1.2+rnd()*.45,.9);}}
for(const side of[-1,1]){const x=side*10.7;for(let i=0;i<3;i++)cube('#b18b48',[x+i*.65,.5,2.95],[.14,1,.16]);for(let y of[.32,.68])cube('#ceb068',[x+.63,y,2.95],[1.65,.13,.12]);}
// Our bear has a soft round muzzle, expressive eyes, little paws and articulated legs.
const bear=new THREE.Group();bear.name='island-bear';scene.add(bear);bear.position.set(-6.15,.32,1.05);bear.scale.setScalar(1.15);bear.rotation.y=Math.PI/2-.24;const body=new THREE.Group();bear.add(body);ell('#aa6b32',[0,.7,-.27],[.52,.57,.75],body);ell('#c4833c',[0,.88,-.2],[.48,.50,.62],body);ell('#b77633',[0,.92,-.91],[.16,.18,.17],body);const legs=[];for(const x of[-.33,.33])for(const z of[-.67,.22]){const leg=new THREE.Group();leg.position.set(x,.55,z);body.add(leg);ell('#aa6930',[0,-.21,0],[.18,.38,.19],leg);ell('#814d25',[0,-.43,.065],[.2,.13,.25],leg);legs.push(leg);}const head=new THREE.Group();head.position.set(0,1.25,.43);body.add(head);ell('#bd7b37',[0,0,0],[.53,.54,.46],head);ell('#cb8a44',[0,.07,.12],[.46,.46,.37],head);for(const x of[-.38,.38]){ell('#a5652f',[x,.40,-.05],[.20,.21,.13],head);ell('#7e4b2b',[x,.42,.055],[.115,.13,.06],head);}ell('#ead3a1',[0,-.17,.42],[.28,.23,.19],head);ell('#3c3426',[0,-.06,.596],[.106,.077,.057],head);for(const x of[-.23,.23]){ell('#342e22',[x,.08,.402],[.058,.079,.043],head);ell('#fff3d0',[x-.012,.11,.435],[.019,.024,.012],head);}const smilePts=[new THREE.Vector3(-.09,-.25,.584),new THREE.Vector3(0,-.28,.604),new THREE.Vector3(.09,-.25,.584)];const smile=new THREE.Line(new THREE.BufferGeometry().setFromPoints(smilePts),new THREE.LineBasicMaterial({color:'#745537'}));head.add(smile);
const fireflies=[];for(let i=0;i<18;i++){let m=ell('#fff1a0',[range(-11,11),range(.5,2.5),range(-10,4)],[.028,.028,.028]);fireflies.push(m);}
const confetti=[];for(let i=0;i<55;i++){let m=cube(['#e7c65c','#e29d79','#e7efbb','#8abc7b'][i%4],[0,0,0],[.10,.045,.08]);m.visible=false;confetti.push(m)}
// Batch static scenery by material: fewer draw calls, identical geometry and lighting.
scene.updateMatrixWorld(true);const dynamic=new Set([...ripples,...fireflies,...confetti]);bear.traverse(o=>dynamic.add(o));planks.forEach(g=>g.traverse(o=>dynamic.add(o)));const batches=new Map();const remove=[];scene.traverse(o=>{if(!o.isMesh||dynamic.has(o)||o.material.isShaderMaterial||o.material.transparent)return;const key=o.material.uuid;let list=batches.get(key);if(!list){list={material:o.material,geometries:[]};batches.set(key,list);}const geometry=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(o.matrixWorld);list.geometries.push(geometry);remove.push(o);});for(const o of remove)o.removeFromParent();for(const batch of batches.values()){const g=mergeGeometries(batch.geometries,false);if(g){const m=new THREE.Mesh(g,batch.material);m.castShadow=true;m.receiveShadow=true;scene.add(m);}batch.geometries.forEach(g=>g.dispose());}
// All lesson construction stays outside the immutable scenery batch above.
const rewards = createRewards(scene);
let lastPlanks = 0, walk = 0, complete = false, paused = false;
let previous = performance.now(), motionTime = 0, pops = [], raf;
let activeLevel = 1, completedIds = new Set(), bridgeLocked = false;
let celebration = null, onWalkDone = null, disposed = false;
const bearSpots = {
  0: [7.05, 1.05, .25], 1: [-6.15, 1.05, Math.PI / 2 - .24],
  2: [-5.8, 1.5, -.65], 3: [-5.8, 1.5, -.65],
  4: [-5.58, 3.75, -.7], 5: [-5.58, 3.75, -.7],
  6: [6.02, 1.65, .4], 7: [-5.55, .35, -.45],
  8: [7.28, 3.8, .7], 9: [8.65, 1.55, .6],
  10: [-5.85, 3.68, -.3], 11: [7.05, 1.05, .25],
  12: [7.05, 1.05, .25]
};
function resetBearPose() {
  const spot = activeLevel === 0 && !completedIds.has(1) ? 1 : activeLevel;
  const [x, z, angle] = bearSpots[spot] || bearSpots[0];
  bear.position.set(x, .32, z);
  bear.rotation.set(0, angle, 0);
  bear.scale.setScalar(1.15);
  body.position.y = 0;
  body.rotation.set(0, 0, 0);
  head.rotation.set(0, 0, 0);
  legs.forEach(l => l.rotation.set(0, 0, 0));
}
function setProgress(n) {
  const count = bridgeLocked ? 8 : Math.max(0, Math.min(8, Math.floor(Number(n) || 0)));
  for (let i = 0; i < 8; i++) {
    planks[i].visible = i < count;
    outlines[i].visible = i >= count;
    if (i >= lastPlanks && i < count) pops.push({ m: planks[i], age: 0 });
  }
  lastPlanks = count;
}
function configureLevel(levelId, completed = []) {
  activeLevel = Math.max(0, Math.min(12, Math.floor(Number(levelId) || 0)));
  completedIds = new Set([...completed].map(Number).filter(id => Number.isInteger(id) && id >= 1 && id <= 12));
  bridgeLocked = activeLevel > 1 || completedIds.has(1);
  walk = 0; complete = false; paused = false; pops = [];
  celebration = null; onWalkDone = null;
  lastPlanks = bridgeLocked ? 8 : 0;
  planks.forEach((p, i) => {
    p.visible = i < lastPlanks;
    p.position.y = bridgeY;
    p.rotation.z = 0;
  });
  outlines.forEach(m => m.visible = !bridgeLocked);
  confetti.forEach(m => m.visible = false);
  resetBearPose();
  rewards.configure(activeLevel, completedIds);
}
function startWalk(cb) {
  onWalkDone = typeof cb === 'function' ? cb : null;
  celebration = null;
  complete = false;
  walk = .001;
  bear.position.set(-6.15, .32, 1.05);
  bear.rotation.set(0, Math.PI / 2 - .24, 0);
  body.position.y = 0;
  head.rotation.z = 0;
}
function celebrateLevel(levelId, cb) {
  const id = Number(levelId);
  if (id !== activeLevel || id < 1 || id > 12) return;
  if (id === 1) { startWalk(cb); return; }
  walk = 0; complete = false; onWalkDone = null;
  resetBearPose();
  rewards.finish(id);
  celebration = { level: id, age: 0, done: typeof cb === 'function' ? cb : null, position: bear.position.clone(), yaw: bear.rotation.y };
}
function resize() {
  const w = container.clientWidth, h = container.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h);
  const aspect = w / h;
  const halfW = aspect < 1 ? 11.6 : 11.25, halfH = halfW / aspect;
  camera.left = -halfW; camera.right = halfW; camera.top = halfH; camera.bottom = -halfH;
  camera.updateProjectionMatrix();
  camera.position.set(0, 15, 23);
  camera.lookAt(0, 0, aspect < 1 ? 4.8 : 1.4);
}
resize();
window.addEventListener('resize', resize);
function frame(now) {
  if (disposed) return;
  const dt = Math.min(Math.max((now - previous) / 1000, 0), .2);
  previous = now;
  const ambientTime = now / 1000;
  waterMat.uniforms.time.value = ambientTime;
  for (let i = 0; i < ripples.length; i++) {
    const m = ripples[i];
    m.material.opacity = .3 + Math.sin(ambientTime * .8 + i) * .18;
    m.rotation.z += dt * .025;
  }
  for (let i = 0; i < fireflies.length; i++) fireflies[i].position.y += Math.sin(ambientTime + i) * dt * .035;
  if (!paused) {
    motionTime += dt;
    const t = motionTime;
    if (walk > 0 && !complete) {
      walk += dt;
      const q = Math.min((walk - .001) / 6.2, 1);
      bear.position.x = -6.15 + q * 13.2;
      bear.position.y = .32 + Math.sin(q * Math.PI * 2 * 18) * .04;
      legs.forEach((l, i) => l.rotation.x = Math.sin(t * 9 + i % 2 * Math.PI) * .26);
      if (q >= 1) {
        complete = true; walk = 0;
        bear.position.y = .32;
        bear.rotation.y = .25;
        const done = onWalkDone;
        onWalkDone = null;
        done?.();
      }
    } else if (celebration) {
      const party = celebration;
      party.age += dt;
      const u = Math.min(party.age / 2.7, 1);
      const envelope = Math.sin(Math.PI * u);
      const bounce = Math.max(0, Math.sin(party.age * 7)) * .23 * envelope;
      bear.position.copy(party.position);
      bear.position.y += bounce;
      body.position.y = 0;
      // A bow for growing things, a little turn for building, and a waving
      // dance for the final party. Every motion settles back onto the ground.
      if ([2, 3, 4, 5, 8].includes(party.level)) {
        head.rotation.x = Math.sin(party.age * 4.5) * .15 * envelope;
        head.rotation.z = Math.sin(party.age * 5) * .1 * envelope;
        legs[1].rotation.x = -.55 * envelope;
      } else if (party.level === 12) {
        bear.rotation.y = party.yaw + Math.sin(party.age * 3.5) * .65 * envelope;
        legs[1].rotation.x = (-.75 + Math.sin(party.age * 10) * .23) * envelope;
        legs[3].rotation.x = -.45 * envelope;
      } else {
        bear.rotation.y = party.yaw + Math.sin(party.age * 3.8) * .28 * envelope;
        legs[1].rotation.x = (-.7 + Math.sin(party.age * 8) * .2) * envelope;
        head.rotation.z = Math.sin(party.age * 4) * .09 * envelope;
      }
      if (u >= 1) {
        const done = party.done;
        celebration = null;
        complete = true;
        resetBearPose();
        confetti.forEach(m => m.visible = false);
        done?.();
      }
    } else if (complete && activeLevel === 1) {
      bear.position.y = .32 + Math.max(0, Math.sin(t * 3)) * .18;
      head.rotation.z = Math.sin(t * 2) * .07;
      legs[1].rotation.x = -.7 + Math.sin(t * 7) * .2;
    } else {
      body.position.y = Math.sin(t * 2) * .025;
      head.rotation.z = Math.sin(t * 1.1) * .025;
    }
    for (const p of pops) {
      p.age += dt;
      const u = Math.min(p.age / .5, 1);
      p.m.position.y = bridgeY + Math.sin(u * Math.PI) * .65;
      p.m.rotation.z = Math.sin(u * Math.PI) * .09 * (1 - u);
    }
    pops = pops.filter(p => p.age < .5);
  }
  rewards.update(dt, !paused);
  const partyVisible = celebration !== null || (complete && activeLevel === 1);
  if (partyVisible) {
    const x = celebration ? celebration.position.x : 7;
    const z = celebration ? celebration.position.z : 1.05;
    const t = motionTime;
    for (let i = 0; i < confetti.length; i++) {
      const m = confetti[i];
      m.visible = true;
      m.position.set(x + Math.sin(i * 7.13) * 1.45, .5 + ((i * .21 - t * .65) % 3.5 + 3.5) % 3.5, z + Math.cos(i * 3.7) * 1.2);
      m.rotation.set(t + i, t * .6 + i, t * .4);
    }
  }
  renderer.render(scene, camera);
  raf = requestAnimationFrame(frame);
}
configureLevel(1, []);
raf = requestAnimationFrame(frame);
return {
  configureLevel,
  updateTaskProgress(fraction) {
    if (activeLevel === 0) return;
    if (activeLevel === 1) setProgress(Math.floor(Math.max(0, Math.min(1, Number(fraction) || 0)) * 8));
    else rewards.setProgress(fraction);
  },
  celebrateLevel,
  setProgress,
  startWalk,
  setPaused(v) { paused = Boolean(v); },
  reset() { configureLevel(activeLevel, completedIds); },
  renderer, scene, camera,
  dispose() {
    disposed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    rewards.dispose();
    const geometries = new Set(), sceneMaterials = new Set();
    scene.traverse(o => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => sceneMaterials.add(m));
    });
    geometries.forEach(g => g.dispose());
    sceneMaterials.forEach(m => m.dispose());
    renderer.dispose();
    renderer.domElement.remove();
  }
};
}
