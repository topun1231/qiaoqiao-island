import * as THREE from '../vendor/three.module.js';
import {createCozyProps} from '../game/cozy-props.js';
const roadX=z=>Math.sin(z*.16)*2.1;
export function createChaseWorld(container){
 const scene=new THREE.Scene();scene.background=new THREE.Color('#c8d58c');
 const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
 container.append(renderer.domElement);
 const camera=new THREE.OrthographicCamera(-13,13,9,-9,.1,150);
 scene.add(new THREE.HemisphereLight('#fff8da','#788c53',2.1));
 const sun=new THREE.DirectionalLight('#fff0cf',2.8);sun.position.set(-18,36,15);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-48,right:48,top:48,bottom:-48,far:110});sun.shadow.normalBias=.04;sun.target.position.z=-20;scene.add(sun,sun.target);
 const p=createCozyProps(scene,camera),{ell,block,cylinder,mesh,root}=p;
 block('#c2ce82',[0,-.25,-18],[110,.5,140]).castShadow=false;
 // Road and actors share this centerline, including the bridge.
 const vertices=[],indices=[];
 for(let i=0;i<=140;i++){const z=12-i*.5;vertices.push(roadX(z)-2.5,.035,z,roadX(z)+2.5,.035,z);if(i<140){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}}
 const road=new THREE.BufferGeometry();road.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));road.setIndex(indices);road.computeVertexNormals();mesh(road,'#e2d39c').castShadow=false;
 block('#57b5aa',[0,-.02,-20],[90,.09,3.4]);
 const bridge=new THREE.Group();bridge.position.set(roadX(-20),.02,-20);root.add(bridge);
 for(let i=0;i<12;i++)block(i%2?'#caa364':'#d8b476',[0,.13,-1.9+i*.35],[5.2,.18,.33],bridge);
 for(const side of[-1,1]){for(const z of[-1.9,0,1.9])cylinder('#a88347',[side*2.5,.65,z],.10,.13,1.2,bridge);block('#b78e50',[side*2.5,1,0],[.12,.13,4.2],bridge);}
 let seed=318;function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
 const ico=new THREE.IcosahedronGeometry(1,1);
 function tree(x,z,scale){const group=new THREE.Group();group.position.set(x,0,z);group.scale.setScalar(scale);root.add(group);cylinder('#987141',[0,1.3,0],.16,.27,2.6,group);for(const [x,y,z,s] of [[0,3,0,1.35],[-.7,2.6,0,.85],[.6,2.8,.2,.95],[0,3.8,0,.7]])mesh(ico,['#99b750','#b0c665','#87a945'][Math.floor(random()*3)],[x,y,z],[s,s,s],group);}
 for(let i=0;i<95;i++){
  const z=10-random()*62,side=i%2?1:-1,x=roadX(z)+side*(7+random()*20);
  if(Math.abs(z+20)<3)continue;
  tree(x,z,.65+random()*.65);
 }
 for(let i=0;i<130;i++){
  const z=8-random()*55,x=roadX(z)+(i%2?1:-1)*(3.2+random()*4);
  if(Math.abs(z+20)<2.5)continue;
  if(i%4===0){mesh(ico,'#a7ad8b',[x,.15,z],[.35,.3,.4]);continue;}
  if(i%3===0){cylinder('#72934a',[x,.16,z],.025,.025,.3);for(let k=0;k<5;k++){const a=k*Math.PI*2/5;ell('#fff6d5',[x+Math.cos(a)*.13,.32,z+Math.sin(a)*.13],[.11,.035,.10]);}ell('#ecc65c',[x,.34,z],[.07,.04,.07]);}
  else mesh(new THREE.ConeGeometry(.14,.48,4),'#92aa4c',[x,.2,z]);
 }
 const hut=new THREE.Group();hut.position.set(roadX(-40),0,-43);root.add(hut);
 block('#efdfad',[0,1.25,0],[3.4,2.5,3],hut);block('#977044',[0,.75,1.52],[.85,1.5,.06],hut);
 for(const side of[-1,1]){const roof=block('#c9934e',[side*.88,3.02,0],[2.4,.20,3.8],hut);roof.rotation.z=side*-.6;}
 const sign=p.label('小偷的藏身处',[roadX(-37)+4,2,-37],3.3,.52);cylinder('#9d7c4a',[roadX(-37)+4,.85,-37],.08,.11,1.7);
 function character(police){
  const group=new THREE.Group();root.add(group);
  const fur=police?'#bc7a36':'#929081',dark=police?'#8b542c':'#514e48';
  ell(fur,[0,1.10,0],[.52,.7,.40],group);ell(police?'#4e80a0':'#b2ac97',[0,1.25,0],[.55,.46,.46],group);
  ell(police?'#e6c993':'#d4ceba',[0,.95,.39],[.31,.36,.07],group);
  const head=new THREE.Group();head.position.set(0,2,0);group.add(head);ell(fur,[0,0,0],[.58,.55,.48],head);
  for(const x of[-.43,.43]){ell(fur,[x,.42,-.02],[.22,.25,.15],head);ell(dark,[x,.43,.10],[.13,.15,.045],head);}
  if(!police)for(const x of[-.25,.25]){const mask=ell('#44463e',[x,.02,.408],[.24,.17,.10],head);mask.rotation.z=x;}
  ell(police?'#efd9a6':'#e2dfca',[0,-.18,.45],[.30,.24,.22],head);ell('#302f28',[0,-.07,.65],[.10,.08,.07],head);
  for(const x of[-.23,.23]){ell('#242820',[x,.07,.46],[.049,.068,.043],head);ell('#fff8d9',[x-.014,.09,.495],[.014,.02,.01],head);}
  const limbs=[];
  for(const side of[-1,1]){
   const leg=new THREE.Group();leg.position.set(side*.28,.58,0);group.add(leg);ell(fur,[0,-.17,0],[.20,.30,.22],leg);ell(dark,[0,-.40,.09],[.23,.13,.30],leg);limbs.push(leg);
   const arm=new THREE.Group();arm.position.set(side*.52,1.5,0);group.add(arm);ell(fur,[0,-.25,0],[.20,.37,.21],arm);arm.rotation.z=side*.15;limbs.push(arm);
  }
  if(police){
   cylinder('#397599',[0,.49,0],.48,.48,.22,head);ell('#2c5c7b',[0,.40,.40],[.46,.06,.25],head);
   const starShape=new THREE.Shape();for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,r=i%2?.065:.14;const x=Math.cos(a)*r,y=Math.sin(a)*r;if(i===0)starShape.moveTo(x,y);else starShape.lineTo(x,y);}starShape.closePath();
   mesh(new THREE.ShapeGeometry(starShape),'#efcb63',[0,.51,.486],[1,1,1],head);mesh(new THREE.ShapeGeometry(starShape),'#efcb63',[-.23,1.42,.443],[1,1,1],group);
  }else{
   const tail=new THREE.Group();tail.position.set(0,.66,-.34);tail.rotation.x=-.8;group.add(tail);for(let i=0;i<6;i++)ell(i%2?'#484c44':'#bab7a5',[0,0,-.14-i*.19],[.23,.22,.17],tail);
   ell('#c1a16b',[0,1.3,-.55],[.43,.54,.28],group);for(const x of[-.23,.15]){ell('#dc8053',[x,1.8,-.51],[.16,.17,.15],group);cylinder('#7f6541',[x,1.99,-.51],.022,.022,.14,group);}
  }
  const name=p.label(police?'你':'小偷',[0,3.08,0],police?.65:.95,.38,group);name.material.depthTest=false;name.renderOrder=5;
  return {group,limbs};
 }
 const bear=character(true),thief=character(false);let policeVisual=0,thiefVisual=18,lastTime=0,previousPolice=0;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 function position(actor,distance,moving,phase){
  const z=-distance*.32,point=new THREE.Vector3(roadX(z),Math.abs(z+20)<2.2?.27:.11,z);
  actor.group.position.copy(point);actor.group.rotation.y=Math.atan2(roadX(z-.1)-roadX(z),-.1);
  const bounce=moving&&!reduced?Math.sin(phase*2)*.045:0;actor.group.position.y+=Math.abs(bounce);
  actor.limbs.forEach((limb,i)=>limb.rotation.x=moving?Math.sin(phase+(i===0||i===3?0:Math.PI))*.55:0);
 }
 function update(s,dt=0){
  const blend=1-Math.exp(-dt*12);if(s.time===0){policeVisual=s.police;thiefVisual=s.thief;}
  else{policeVisual+=(s.police-policeVisual)*blend;thiefVisual+=(s.thief-thiefVisual)*blend;}
  const active=s.phase==='running',walking=active&&(s.police-previousPolice>.001||Math.abs(s.police-policeVisual)>.02);
  if(active)lastTime+=dt;
  position(bear,policeVisual,walking,lastTime*13);position(thief,thiefVisual,active,lastTime*11);previousPolice=s.police;
  const middleZ=-(policeVisual+thiefVisual)*.16,center=new THREE.Vector3(roadX(middleZ),.6,middleZ);
  const width=container.clientWidth,height=Math.max(1,container.clientHeight),aspect=width/height;
  const gap=(thiefVisual-policeVisual)*.32;
  const halfHeight=Math.max(6.4,gap*.32+3.8,(gap*.48+4.5)/aspect);
  camera.left=-halfHeight*aspect;camera.right=halfHeight*aspect;camera.top=halfHeight;camera.bottom=-halfHeight;
  camera.position.copy(center).add(new THREE.Vector3(26,20,10));camera.lookAt(center);camera.updateProjectionMatrix();
  if(renderer.domElement.width!==Math.round(width*renderer.getPixelRatio())||renderer.domElement.height!==Math.round(height*renderer.getPixelRatio()))renderer.setSize(width,height,false);
  p.billboard();renderer.render(scene,camera);
 }
 function destroy(){const geometries=new Set(),materials=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());p.textures.forEach(t=>t.dispose());renderer.dispose();renderer.domElement.remove();}
 return {update,destroy,canvas:renderer.domElement};
}
