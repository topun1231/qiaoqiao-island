import * as THREE from '../vendor/three.module.js';
import {createCozyIsland} from './cozy-island.js';
import {createCozyProps} from './cozy-props.js';
import {riverLeg} from './route-adventure.js';

export function createRouteRiverWorld(host){
 const island=createCozyIsland(host,'river'),{scene,camera,renderer,bear,body,legs}=island;
 const props=createCozyProps(scene,camera),{root,cylinder,ell,label,setLabel}=props;
 const stones=new Map();let layout='',disposed=false;
 cylinder('#a2ab86',[0,-.12,2.4],1.05,1.2,.7,root,14);
 cylinder('#c9d7a1',[0,.27,2.4],1.02,1.05,.08,root,14);
 label('中途小岛',[0,.8,2.4],1.7,.42);
 const duck=new THREE.Group();root.add(duck);duck.position.set(-1.5,.2,5.1);
 ell('#f8df78',[0,.15,0],[.35,.25,.45],duck);ell('#f6e994',[.12,.42,-.2],[.23,.23,.23],duck);
 ell('#d98b3b',[.15,.41,-.43],[.17,.07,.15],duck);ell('#3e4235',[.28,.48,-.29],[.025,.03,.025],duck);
 const status=label('选择一条路线',[0,2.6,-.4],5.3,.6);
 const options=document.createElement('div');options.className='route-options';options.setAttribute('aria-label','过河路线与当前石头');host.append(options);
 let optionToken='';
 function update(state,dt=0){
  if(disposed)return;
  const token=[state.seed,state.lessonStageIndex,state.routeLeg].join('|');
  if(layout!==token){
   layout=token;
   for(const entry of stones.values()){root.remove(entry.group);entry.top.material.dispose();entry.sign.material.dispose();entry.group.traverse(o=>{o.geometry?.dispose();});}stones.clear();
   for(const lane of ['agh','hag']){
    const path=riverLeg(state,lane);
    path.stones.forEach((point,i)=>{
     const group=new THREE.Group();root.add(group);group.position.set(point[0],0,point[1]);
     cylinder('#8f9d92',[0,.06,0],path.radius,path.radius*.88,.55,group,8);
     const top=cylinder(props.mat('#d1d6bd').clone(),[0,.35,0],path.radius*.95,path.radius,.08,group,8);
     const sign=label(path.codes[i],[0,.9,0],1.2,.42,group);
     stones.set(lane+i,{group,top,sign,lane,index:i});
    });
   }
  }
  const path=riverLeg(state),index=state.routeStone;
  const point=i=>i===0?path.start:i>path.stones.length?path.end:[path.stones[i-1][0],.39,path.stones[i-1][1]];
  let position=state.route?point(index):state.routeLeg===2?[5.15,.32,2.4]:path.start;
  if(state.action){
   let t=state.action.elapsed/state.action.duration,from=point(index),to=point(index+1);
   if(index===path.stones.length-1&&t>.65){from=to;to=path.end;t=(t-.65)/.35;}else if(index===path.stones.length-1)t/=.65;
   const u=t*t*(3-2*t);position=from.map((v,i)=>v+(to[i]-v)*u);position[1]+=Math.sin(Math.PI*t)*.65;
  }
  bear.position.set(position[0],position[1]+.01,position[2]);bear.rotation.set(0,Math.PI/2,0);bear.scale.setScalar(.68);body.scale.set(1,1,1);
  legs.forEach((leg,i)=>leg.rotation.x=state.action?Math.sin(state.action.elapsed*12)*(i%2?1:-1)*.15:0);
  for(const entry of stones.values()){
   const active=!state.route||state.route===entry.lane,done=state.route===entry.lane&&entry.index<state.routeStone;
   entry.top.material.color.set(done?'#99bc83':active?'#dbe0c4':'#9aa99b');entry.sign.material.opacity=active?1:.35;
  }
  duck.visible=state.route==='hag'||state.discoveries.includes('水边小鸭');duck.position.y=.2+Math.sin(state.time*2)*.035;
  const title=state.solved||state.stageReady?'到对岸啦！':!state.route?state.routeLeg?'中途小岛 · 可以换路':'选路：字母少、跳得多 / 字母多、跳得少':state.action?'这组收到了，等小熊站稳':`按完这一串：${path.codes[index]||''}`;
  setLabel(status,title);
  const texts=state.choices.map(c=>`${c.code} · ${c.label}`),newToken=JSON.stringify([texts,state.codeBuffer,Boolean(state.action),state.discoveries]);
  if(optionToken!==newToken){optionToken=newToken;options.replaceChildren();for(const text of texts){const item=document.createElement('span');item.textContent=text;options.append(item);}if(state.codeBuffer){const item=document.createElement('small');item.textContent='已输入 '+state.codeBuffer;options.append(item);}}
  options.hidden=state.stageReady||state.solved;host.setAttribute('aria-label',`过河 ${state.routeLeg}/2 ${texts.join('；')} 已输入 ${state.codeBuffer}`);
  const width=Math.max(1,host.clientWidth),height=Math.max(1,host.clientHeight),halfWidth=Math.max(7.2,width/height*4.4);
  renderer.setSize(width,height);Object.assign(camera,{left:-halfWidth,right:halfWidth,top:halfWidth*height/width,bottom:-halfWidth*height/width});camera.position.set(0,15,22);camera.lookAt(0,.3,2.4);camera.updateProjectionMatrix();
  props.billboard();island.waterMat.uniforms.time.value+=dt;renderer.render(scene,camera);
 }
 return{update,destroy(){if(disposed)return;disposed=true;options.remove();island.dispose({geometries:props.geometries,materials:props.materials,textures:props.textures});}};
}
