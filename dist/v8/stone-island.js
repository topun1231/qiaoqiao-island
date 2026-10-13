import * as THREE from './vendor/three.module.js';
import{mergeGeometries}from'./vendor/BufferGeometryUtils.js';
export function createStoneIsland(container){
// The approved static island. This module deliberately never owns an animation loop.
const sourceGeometries=new Set();
const scene=new THREE.Scene();scene.background=new THREE.Color('#b3d68a');scene.fog=new THREE.Fog('#c2dfa1',34,66);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;container.appendChild(renderer.domElement);
const camera=new THREE.OrthographicCamera(-13,13,9,-9,.1,100);camera.position.set(0,15,23);camera.lookAt(0,0,-1.7);
scene.add(new THREE.HemisphereLight('#fff9da','#6c976f',1.65));const sun=new THREE.DirectionalLight('#fff1cb',2.5);sun.position.set(-12,23,9);sun.castShadow=true;sun.shadow.mapSize.set(1536,1536);sun.shadow.camera.left=-20;sun.shadow.camera.right=20;sun.shadow.camera.top=20;sun.shadow.camera.bottom=-20;sun.shadow.bias=-.0006;sun.shadow.normalBias=.04;sun.shadow.radius=4;scene.add(sun);scene.add(new THREE.AmbientLight('#e6fff1',.25));
const materials={};function mat(c,flat=false){let k=c+flat;return materials[k]??=new THREE.MeshStandardMaterial({color:c,roughness:.92,flatShading:flat});}function mesh(g,c,p=[0,0,0],s=[1,1,1],parent=scene){sourceGeometries.add(g);const m=new THREE.Mesh(g,typeof c==='string'?mat(c):c);m.position.set(...p);m.scale.set(...s);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}const sphere=new THREE.SphereGeometry(1,14,10),ico=new THREE.IcosahedronGeometry(1,1),box=new THREE.BoxGeometry(1,1,1);function ell(c,p,s,parent){return mesh(sphere,c,p,s,parent)}function cube(c,p,s,parent){return mesh(box,c,p,s,parent)}function cylinder(c,p,rt,rb,h,parent,segments=9){return mesh(new THREE.CylinderGeometry(rt,rb,h,segments),c,p,[1,1,1],parent)}function lineBetween(a,b,r,c,parent=scene){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),m=cylinder(c,av.clone().add(bv).multiplyScalar(.5).toArray(),r,r,av.distanceTo(bv),parent);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),bv.sub(av).normalize());return m}let seed=103;function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}function range(a,b){return a+rnd()*(b-a)}
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
// The crossing is intentionally open water: no timber bridge or sandy road.
// Trees have distinct silhouettes, woody branches, and gently faceted crowns.
function tree(x,z,s=1,pine=false){const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(s);scene.add(g);cylinder('#95643b',[0,1.15,0],.16,.29,2.3,g);cylinder('#ae7941',[.06,.55,.10],.055,.12,1.0,g);if(pine){for(let i=0;i<3;i++){let t=mesh(new THREE.ConeGeometry(1.23-i*.20,1.75,7),mat(['#4c8555','#5b955f','#72a969'][i],true),[0,1.7+i*.66,0],[1,1,1],g);t.rotation.y=i*.3;}}else{lineBetween([0,1.4,0],[-.52,2.1,.1],.1,'#95643b',g);lineBetween([0,1.6,0],[.55,2.3,0],.1,'#95643b',g);for(const [dx,dy,dz,ss]of[[0,2.6,0,1.35],[-.7,2.4,.1,.85],[.65,2.65,.2,.85],[0,3.2,-.1,.83]]){const leaf=mesh(ico,mat(['#91bd42','#a8ce53','#86b643','#bddb65'][Math.floor(rnd()*4)],true),[dx,dy,dz],[ss,ss,ss],g);leaf.rotation.set(rnd(),rnd(),rnd());}}return g;}
for(const [x,z,s,p]of[[-9.5,-3,1.2,0],[-7.1,-5,1.12,0],[-11,-7,1.4,1],[-11.4,5,.95,0],[-12,0,1.4,0],[-6.4,-10,1,0],[-11,-14,1.6,0],[6,-5,1.1,1],[8,-7,1.35,1],[11,-5,1.4,0],[11.8,5,1.05,0],[5.8,-11,1.0,0],[9.6,-12,1.5,1],[-13,8,1.5,1]])tree(x,z,s,!!p);
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
const bear=new THREE.Group();bear.name='island-bear';scene.add(bear);bear.position.set(-4.85,.32,2.65);bear.scale.setScalar(.65);bear.rotation.y=Math.PI/2-.38;const body=new THREE.Group();bear.add(body);ell('#aa6b32',[0,.7,-.27],[.52,.57,.75],body);ell('#c4833c',[0,.88,-.2],[.48,.50,.62],body);ell('#b77633',[0,.92,-.91],[.16,.18,.17],body);const legs=[];for(const x of[-.33,.33])for(const z of[-.67,.22]){const leg=new THREE.Group();leg.position.set(x,.55,z);body.add(leg);ell('#aa6930',[0,-.21,0],[.18,.38,.19],leg);ell('#814d25',[0,-.43,.065],[.2,.13,.25],leg);legs.push(leg);}const head=new THREE.Group();head.position.set(0,1.25,.43);body.add(head);ell('#bd7b37',[0,0,0],[.53,.54,.46],head);ell('#cb8a44',[0,.07,.12],[.46,.46,.37],head);for(const x of[-.38,.38]){ell('#a5652f',[x,.40,-.05],[.20,.21,.13],head);ell('#7e4b2b',[x,.42,.055],[.115,.13,.06],head);}ell('#ead3a1',[0,-.17,.42],[.28,.23,.19],head);ell('#3c3426',[0,-.06,.596],[.106,.077,.057],head);for(const x of[-.23,.23]){ell('#342e22',[x,.08,.402],[.058,.079,.043],head);ell('#fff3d0',[x-.012,.11,.435],[.019,.024,.012],head);}const smilePts=[new THREE.Vector3(-.09,-.25,.584),new THREE.Vector3(0,-.28,.604),new THREE.Vector3(.09,-.25,.584)];const smile=new THREE.Line(new THREE.BufferGeometry().setFromPoints(smilePts),new THREE.LineBasicMaterial({color:'#745537'}));head.add(smile);

// Share the exact source geometry, but leave every limb in its original resting pose.
body.position.set(0,0,0);body.rotation.set(0,0,0);head.rotation.set(0,0,0);
legs.forEach(leg=>leg.rotation.set(0,0,0));
// Batch only the unchanging island. The bear remains an articulated model.
scene.updateMatrixWorld(true);
const dynamic=new Set(ripples);bear.traverse(o=>dynamic.add(o));
const batches=new Map(),remove=[];
scene.traverse(o=>{
 if(!o.isMesh||dynamic.has(o)||o.material.isShaderMaterial||o.material.transparent)return;
 const key=o.material.uuid;
 if(!batches.has(key))batches.set(key,{material:o.material,geometries:[]});
 batches.get(key).geometries.push((o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(o.matrixWorld));
 remove.push(o);
});
remove.forEach(o=>o.removeFromParent());
for(const batch of batches.values()){
 const g=mergeGeometries(batch.geometries,false);
 if(g){const m=new THREE.Mesh(g,batch.material);m.castShadow=true;m.receiveShadow=true;scene.add(m);}
 batch.geometries.forEach(g=>g.dispose());
}
waterMat.uniforms.time.value=12.6;
let disposed=false;
function dispose(extra={}){
 if(disposed)return;disposed=true;
 const geometries=new Set([...sourceGeometries,...(extra.geometries||[])]),mats=new Set(extra.materials||[]),textures=new Set(extra.textures||[]);
 scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of(Array.isArray(o.material)?o.material:[o.material]))mats.add(m);});
 for(const m of mats)for(const value of Object.values(m))if(value?.isTexture)textures.add(value);
 geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());mats.forEach(m=>m.dispose());
 renderer.renderLists?.dispose();renderer.dispose();renderer.domElement.remove();scene.clear();sourceGeometries.clear();
}
return {scene,camera,renderer,bear,body,head,legs,waterMat,ripples,dispose};
}
