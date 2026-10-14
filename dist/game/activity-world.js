import * as THREE from '../vendor/three.module.js';
import {createCozyIsland} from './cozy-island.js';
import {createCozyProps} from './cozy-props.js';
import {mazeBoard,DIRECTIONS,gateLane,gateKey,blockKey,kiteStars} from './island-activities.js';

export function createActivityWorld(host){
 const island=createCozyIsland(host),{scene,camera,renderer,bear,body,legs}=island;
 // Reuse the established bear, lighting and resource disposal; this scene needs dry ground.
 for(const child of scene.children)if(child!==bear&&!child.isLight)child.visible=false;
 scene.fog=null;scene.background.set('#cbdba7');
 const p=createCozyProps(scene,camera),{root,block,ell,cylinder,label,setLabel}=p;
 const terrain=new THREE.Group();root.add(terrain);const props=new THREE.Group();root.add(props);
 const hud=document.createElement('div');hud.className='activity-controls';host.append(hud);
 const status=document.createElement('div');status.className='activity-status';host.append(status);
 let token='',last=null,disposed=false,markers=[],ball=null,kite=null,stack=[],gateLabels=[],width=1,height=1;
 const point=(cell,b)=>[(cell[0]-(b.rows[0].length-1)/2)*1.65,.12,(cell[1]-(b.rows.length-1)/2)*1.65];
 function clear(){const shared=new Set(p.geometries);for(const group of [terrain,props])group.traverse(o=>{if(o.geometry&&!shared.has(o.geometry))o.geometry.dispose();});terrain.clear();props.clear();markers=[];stack=[];gateLabels=[];ball=null;kite=null;}
 function flag(at,text,color){const g=new THREE.Group();g.position.set(...at);props.add(g);cylinder('#977343',[0,.7,0],.04,.04,1.4,g);block(color,[.35,1.2,0],[.7,.4,.05],g);label(text,[0,1.85,0],2,.42,g);return g;}
 function build(s){clear();if(s.level===5||s.level===6){const b=mazeBoard(s);block('#b5cc8c',[0,-.12,0],[b.rows[0].length*1.65,.3,b.rows.length*1.65],terrain);
   for(let y=0;y<b.rows.length;y++)for(let x=0;x<b.rows[y].length;x++){const v=point([x,y],b);if(b.rows[y][x]==='#'){block('#789b55',[v[0],.32,v[2]],[1.55,.78,1.55],terrain);ell('#91ad62',[v[0],.74,v[2]],[.78,.18,.77],terrain);}else{block('#e6d5ac',[v[0],.045,v[2]],[1.64,.08,1.64],terrain);const mark=ell('#9fa880',[v[0],.1,v[2]],[.14,.015,.14],props);markers.push({mesh:mark,cell:`${x},${y}`});}}
   flag(point(b.goal,b),s.level===5?['溪边营地','林间营地','小兔在这里'][s.lessonStageIndex]:'野餐地','#e4ad59');
   if(s.level===6)for(const [key,cell]of Object.entries(b.supplies)){const v=point(cell,b),g=new THREE.Group();g.position.set(v[0],.18,v[2]);props.add(g);cylinder(key==='T'?'#e4b359':'#d88962',[0,.25,0],.23,.27,.5,g);cylinder('#98784a',[0,.54,0],.25,.25,.08,g);label(key==='T'?'蜂蜜':'果汁',[0,1.1,0],1.4,.4,g);markers.push({mesh:g,item:key});}
  }else{
   block('#d4dfab',[0,-.13,0],[16,.3,11],terrain);
   for(const x of[-6.8,6.8])for(const z of[-4.2,3.6]){cylinder('#936c41',[x,.7,z],.12,.2,1.4,terrain);ell('#87a75e',[x,1.7,z],[.85,1,.8],terrain);}
   if(s.lessonStageIndex===0){for(let i=0;i<3;i++){const lane=[-1,1,0][i],z=2-i*2.1;block('#b4ca83',[0,.05,z],[8,.05,.65],terrain);for(const x of[-.65,.65])cylinder('#cf9b5c',[lane*2.6+x,.55,z],.07,.07,1.1,props);block('#e3b763',[lane*2.6,1.1,z],[1.45,.13,.13],props);gateLabels.push(label('',[lane*2.6,1.6,z],2,.45,props));}ball=ell('#cf7b55',[0,.34,4],[.35,.35,.35],props);}
   if(s.lessonStageIndex===1){block('#ba9467',[0,.09,0],[4,.2,2.8],terrain);for(let i=0;i<6;i++){const key=['F','J','F','J','F','K'][i],g=new THREE.Group();props.add(g);g.position.set(0,.32+i*.6,0);if(key==='K'){const roof=new THREE.Mesh(new THREE.ConeGeometry(1.05,.7,4),p.mat('#ce875d'));roof.rotation.y=Math.PI/4;roof.position.y=.2;g.add(roof);}else block(key==='F'?'#e6bc65':'#80ac9a',[0,0,0],[key==='F'?1.15:2.15,.55,1.1],g);stack.push(g);}label('F 方块     J 长条     K 屋顶',[0,5,0],6.7,.6,props);}
   if(s.lessonStageIndex===2){scene.background.set('#c6e2dd');for(let y=0;y<3;y++)for(let x=0;x<5;x++)ell('#b4cba6',[(x-2)*2,.05,(y-1)*2],[.13,.02,.13],terrain);for(const x of[1,3]){const g=new THREE.Group();props.add(g);g.position.set((x-2)*2,1.4,0);for(const [dx,dy]of[[-.35,0],[0,.15],[.35,0]])ell('#f9f7e7',[dx,dy,0],[.5,.35,.4],g);}
    kite=new THREE.Group();props.add(kite);const shape=block('#dc9772',[0,0,0],[.65,.65,.1],kite);shape.rotation.z=Math.PI/4;for(let i=0;i<3;i++)ell('#e8c376',[Math.sin(i)*.09,-.6-i*.3,0],[.1,.1,.025],kite);
    kiteStars.forEach((cell,i)=>{const g=new THREE.Group();g.position.set((cell[0]-2)*2,1.5,(cell[1]-1)*2);props.add(g);label('★',[0,0,0],.8,.8,g);markers.push({mesh:g,star:i});});}
  }
 }
 function update(s){if(disposed)return;last=s;const t=`${s.level}/${s.level===6?0:s.lessonStageIndex}`;if(t!==token){token=t;build(s);}
  const a=s.action,u=a?Math.min(1,a.elapsed/a.duration):0,e=u*u*(3-2*u);
  if(s.level===5||s.level===6){const b=mazeBoard(s),start=point(s.position,b),end=a?point(a.to,b):start;bear.position.set(...start.map((v,i)=>v+(end[i]-v)*e));bear.scale.setScalar(.42);if(a)bear.rotation.y=Math.atan2(end[0]-start[0],end[2]-start[2]);markers.forEach(m=>m.mesh.visible=m.item?!s.inventory.includes(m.item):s.traversedNodes.includes(m.cell));
   status.textContent=s.level===6?`篮子：${s.inventory.includes('T')?'✓ 蜂蜜':'○ 蜂蜜'}　${s.inventory.includes('Y')?'✓ 果汁':'○ 果汁'}　→ 野餐旗子`:'黄色旗子是目的地 · 树篱挡路 · 死路自己返回';
  }else{
   bear.position.set(-4.5,.1,3.5);bear.rotation.y=Math.PI/3;bear.scale.setScalar(.62);
   if(s.lessonStageIndex===0){const lane=a?.type==='shift'?s.lane+(a.to-s.lane)*e:s.lane,z=4-s.step*2.1-(a?.type==='roll'?e*2.1:0);ball.position.set(lane*2.6,.4,z);gateLabels.forEach((l,i)=>setLabel(l,i<s.step?'✓ 已通过':i===s.step?`按 ${gateKey(s)} 击球`:'下一道',i===s.step?'active':'label'));status.textContent=s.step<3?`球门 ${s.step+1}/3 · A / D 移球，对准后按 ${gateKey(s)}`:'三道球门都通过啦';}
   if(s.lessonStageIndex===1){stack.forEach((g,i)=>{g.visible=i<s.step||a?.type==='stack'&&i===s.step;g.position.y=.32+i*.6+(i===s.step?1.8*(1-e):0);});status.textContent=s.step<6?`下一块：${{F:'■ 方块',J:'▬ 长条',K:'▲ 屋顶'}[blockKey(s)]} · 已搭 ${s.step}/6 块`:'彩色塔搭好了！';}
   if(s.lessonStageIndex===2){const pos=a?s.position.map((v,i)=>v+(a.to[i]-v)*e):s.position;kite.position.set((pos[0]-2)*2,1.5,(pos[1]-1)*2);kite.rotation.z=Math.sin(s.time*2)*.08;markers.forEach(m=>m.mesh.visible=!s.stars.includes(m.star));status.textContent=`星星 ${s.stars.length}/3 · W 上 A 左 S 下 D 右 · 绕过白云`;}
  }
  body.scale.set(1,1,1);legs.forEach((l,i)=>l.rotation.x=a?.type==='walk'?Math.sin(u*10)*(i%2?1:-1)*.3:0);
  const values=s.choices.filter(c=>!c.done).map(c=>`${c.key} ${c.label}`).join('　');if(hud.textContent!==values)hud.textContent=values;hud.hidden=s.stageReady||s.solved;host.setAttribute('aria-label',`${s.stageTitle} ${status.textContent} ${values}`);
  width=Math.max(1,host.clientWidth);height=Math.max(1,host.clientHeight);renderer.setSize(width,height,false);const halfH=s.level===5||s.level===6?6.5:5.5,halfW=Math.max(8.2,halfH*width/height);Object.assign(camera,{left:-halfW,right:halfW,top:halfW*height/width,bottom:-halfW*height/width});camera.position.set(0,s.level===12&&s.lessonStageIndex===1?12:20,s.level===12&&s.lessonStageIndex===1?17:10);camera.lookAt(0,0,0);camera.updateProjectionMatrix();if(kite){kite.quaternion.copy(camera.quaternion);kite.rotateZ(Math.sin(s.time*2)*.08);}p.billboard();renderer.render(scene,camera);
 }
 return{update,destroy(){if(disposed)return;disposed=true;hud.remove();status.remove();island.dispose({geometries:p.geometries,materials:p.materials.values(),textures:p.textures.values()});}};
}
