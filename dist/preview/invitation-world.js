import * as THREE from '../vendor/three.module.js';
import { createInvitationRoomScene } from './invitation-room-scene.js';
import { createInvitationGarden, INVITATION_BEAR_SCALE } from './invitation-garden-scene.js';

// All action poses are a pure function of engine state. No renderer clock,
// keyboard listener, game mutation, or requestAnimationFrame is owned here.
const clamp=n=>Math.max(0,Math.min(1,n));
const ease=n=>{n=clamp(n);return n*n*(3-2*n);};
const mix=(a,b,t)=>a+(b-a)*t;
const mix3=(a,b,t)=>a.map((v,i)=>mix(v,b[i],t));
const yaw=(a,b)=>Math.atan2(b[0]-a[0],b[2]-a[2]);
const angleMix=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
const portion=(p,a,b)=>clamp((p-a)/(b-a));
const HOME=[-1.6,.075,3.4];
export const INVITATION_FRIENDS=Object.freeze({
 C:Object.freeze({index:0,label:'小兔',home:[-4.61,.07,.88],stop:[-3.18,.075,1.55],seat:[.08,.08,5.0],route:[[-2.3,.075,2.6]],text:'come and play'}),
 X:Object.freeze({index:1,label:'小熊',home:[4.66,.07,-2.29],stop:[3.68,.075,-1.35],seat:[1.8,.08,5.3],route:[[-2.3,.075,2.6],[1.4,.075,1.4],[3.85,.075,-.6]],text:'join us'}),
 Z:Object.freeze({index:2,label:'小鹿',home:[-3.98,.07,-6.48],stop:[-2.7,.075,-5.7],seat:[3.48,.08,4.65],route:[[-2.3,.075,2.6],[1.4,.075,1.4],[3.85,.075,-.6],[3.2,.075,-3.5],[.2,.075,-5]],text:'let us eat'}),
});
const friendKey=key=>String(key||'X').toUpperCase()==='J'?'X':String(key||'X').toUpperCase();
function pathSample(points,t,startYaw=0,endYaw=0){
 const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[2]-points[i][2]));
 const length=lengths.reduce((a,b)=>a+b,0),travel=ease(t)*length;
 let remaining=travel,i=0;while(i<lengths.length-1&&remaining>lengths[i])remaining-=lengths[i++];
 const q=lengths[i]?clamp(remaining/lengths[i]):1,a=points[i],b=points[i+1],direction=yaw(a,b);
 let heading=direction;
 if(t<.1)heading=angleMix(startYaw,direction,ease(t/.1));
 if(t>.9)heading=angleMix(direction,endYaw,ease((t-.9)/.1));
 return {root:mix3(a,b,q),yaw:heading,stride:Math.sin(travel*8.8)*Math.sin(Math.PI*clamp(t)),travel};
}
export function invitationCardContent(state = {}) {
 const target = state.targetText || state.task?.target || 'music';
 const prefix = state.lockedPrefix ?? state.task?.prefix ?? 'musi', buffer = state.buffer ?? prefix;
 const remaining = Math.max(0, target.length - Math.min(target.length, buffer.length));
 const protectedText = prefix ? `已印好的 ${prefix} 锁定，不用重打` : '这张是空白卡片，照着完整目标写';
 const instruction = state.target === 'Backspace' ? '末尾有字需要修改 · 按 Backspace 删掉' : remaining > 1 ? `接着补上 ${remaining} 个字母` : remaining === 1 ? '再补上最后一个字母' : '写好啦，小熊来收好卡片';
 return { target, prefix, buffer, remaining, protectedText, instruction };
}
export function invitationGuestKeys(state = {}) {
 const guests=(state.picnicGuests || []).map(friendKey);
 // Activity completions name friends but never invite them a second time.
 const arrivals=state.activity || Number(state.level)===11&&state.invitationParts?.length ? [] : (state.arrived || state.completed || []).map(friendKey);
 return [...new Set([...guests,...arrivals])].filter(key=>INVITATION_FRIENDS[key]);
}
const picnicStop = key => {
 const normalized=friendKey(key),f=INVITATION_FRIENDS[normalized]||INVITATION_FRIENDS.X;
 // A small diagonal stance lets both faces read in the fixed picnic camera.
 // Keep the interaction close enough for a wave or a short sharing gesture.
 return [f.seat[0]+(normalized==='Z'?.48:-.48),HOME[1],f.seat[2]-1.25];
};
export function invitationVisit(state = {}, selected = friendKey(state.action?.destination || state.selected)) {
 const spec = INVITATION_FRIENDS[selected] || INVITATION_FRIENDS.X;
 const atPicnic = (state.picnicGuests || []).map(friendKey).includes(selected);
 const stop = atPicnic ? picnicStop(selected) : spec.stop;
 const target = atPicnic ? spec.seat : spec.home;
 const previous=state.activityHistory?.at(-1),from=previous?picnicStop(previous.friend):HOME;
 return { ...spec, atPicnic, stop, target, visitor: atPicnic ? [from, stop] : [HOME, ...spec.route, stop] };
}
export function invitationActivityResults(state={}) {
 return (state.activityHistory||[]).map(entry=>({...entry,friend:friendKey(entry.friend)})).filter(entry=>INVITATION_FRIENDS[entry.friend]);
}
export function sampleInvitationPose(state={}){
 const action=state.action,active=state.phase==='acting'&&action;
 const p=active?clamp((Number(action.elapsed)||0)/Math.max(.001,Number(action.duration)||1)):0;
 const mode=state.mode||(Number(state.level)<=10?'card':'mail');
 if(mode==='card')return {mode,progress:p,stamp:active?Math.sin(Math.PI*portion(p,0,.4)):0,fold:active?ease(portion(p,.32,.68)):0,pack:active?ease(portion(p,.67,1)):0,acting:!!active,root:[-3.72,.445,1.10],yaw:Math.PI/2};
 const selected=friendKey(action?.destination||state.selected),spec=invitationVisit(state,selected);
 const guests=new Set(invitationGuestKeys(state)),shared=Number(state.level)===11&&Array.isArray(state.invitationParts);
 const activity=typeof state.activity==='string'?state.activity:state.activity?.id;
 const history=invitationActivityResults(state),last=history.at(-1);
 let root=last?picnicStop(last.friend):HOME.slice(),rotation=last?yaw(root,INVITATION_FRIENDS[last.friend].seat):.2,stride=0,envelopeVisible=false,hand=0;
 const friends=Object.fromEntries(Object.entries(INVITATION_FRIENDS).map(([key,f])=>[key,{position:guests.has(key)?f.seat.slice():f.home.slice(),yaw:guests.has(key)?Math.PI:0,visible:shared||guests.has(key)||key===selected&&state.stage==='write',stride:0,seated:guests.has(key),arrived:guests.has(key),wave:0}]));
 if(shared) {
  root=HOME.slice();rotation=Math.PI;
  if(active&&action.type==='deliver') {
   hand=Math.sin(Math.PI*portion(p,0,action.partOnly?1:.20));
   envelopeVisible=action.partOnly?p<.72:p<.18;
   if(action.allGuests&&!action.partOnly)for(const[key,f]of Object.entries(INVITATION_FRIENDS)) {
    const path=[f.home,f.stop,...f.route.slice().reverse(),[-.55,.075,3.15],[f.seat[0],.08,3.9],f.seat];
    const q=portion(p,.16+f.index*.025,.94+f.index*.025),walk=pathSample(path,q,yaw(f.home,f.stop),Math.PI);
    friends[key]={position:walk.root,yaw:walk.yaw,visible:true,stride:walk.stride,seated:q>=1,arrived:q>=1,wave:0};
   }
  }
 } else {
  if(state.stage==='write'||state.stage==='delivery'){root=spec.stop.slice();rotation=yaw(root,spec.target);}
  const visitor=spec.visitor;
  if(active&&action.type==='visit'){
   const walk=pathSample(visitor,p,rotation,yaw(spec.stop,spec.target));root=walk.root;rotation=walk.yaw;stride=walk.stride;envelopeVisible=!activity;
  }
  if(active&&action.type==='deliver'){
   root=spec.stop.slice();rotation=yaw(root,spec.target);
   if(activity) {
    hand=Math.sin(Math.PI*p);friends[selected].wave=activity==='greet'?Math.sin(Math.PI*p)*Math.sin(p*Math.PI*5):Math.sin(Math.PI*p)*.25;
   } else {
    hand=ease(portion(p,0,.16))*(1-ease(portion(p,.19,.29)));envelopeVisible=p<.23;
    const back=pathSample(visitor.slice().reverse(),portion(p,.32,1),rotation,.2);
    if(p>.32){root=back.root;rotation=back.yaw;stride=back.stride;}
    if(!spec.atPicnic){
     const friendPath=[spec.home,spec.stop,...spec.route.slice().reverse(),HOME,[.2,.08,4.2],spec.seat];
     const walk=pathSample(friendPath,portion(p,.22,.94),yaw(spec.home,spec.stop),Math.PI);
     friends[selected]={position:walk.root,yaw:walk.yaw,visible:true,stride:walk.stride,seated:p>=.94,arrived:p>=.94,wave:0};
    }
   }
  }
  if((state.phase==='complete'||state.phase==='stage-ready'||state.stageReady)&&!activity){root=HOME.slice();rotation=.2;}
 }
 const carry=[root[0]+Math.sin(rotation)*.78,root[1]+.88,root[2]+Math.cos(rotation)*.78];
 const envelope=shared?mix3(carry,[-1.60,.95,2.13],ease(portion(p,0,.7))):hand?mix3(carry,[spec.target[0],.68,spec.target[2]+.18],hand):carry;
 const results=[...history];
 if(activity&&active&&action.type==='deliver')results.push({activity,friend:selected,text:state.targetText,progress:p,pending:true});
 const activityProps=results.filter(entry=>entry.activity!=='greet').map(entry=>{
  const f=INVITATION_FRIENDS[entry.friend],q=entry.pending?entry.progress:1,rest=[f.seat[0]+(entry.friend==='Z'?.38:-.38),.12,f.seat[2]-.36];
  const stop=picnicStop(entry.friend),heading=yaw(stop,f.seat);
  const origin=[stop[0]+Math.sin(heading)*.66,.85,stop[2]+Math.cos(heading)*.66];
  const lift=ease(portion(q,.10,.58));
  const position=mix3(origin,rest,lift);
  if(entry.activity==='play'&&entry.friend==='C') {position[1]=.27;position[0]=mix(origin[0],rest[0],ease(q));position[2]=mix(origin[2]-.65,rest[2],ease(q));}
  return {...entry,progress:q,position,build:entry.activity==='play'&&entry.friend==='X'?ease(portion(q,.12,.90)):1,launch:entry.activity==='play'&&entry.friend==='Z'?ease(portion(q,.12,.90)):0};
 });
 return {mode,progress:p,root,yaw:rotation,stride,envelope,envelopeVisible,hand,friends,selected,atPicnic:spec.atPicnic,acting:!!active,shared,activity,activityProps,writingPart:Number(state.mailPart??state.lessonStageIndex)||0};
}

const make=(tag,cls,parent,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;if(parent)parent.appendChild(node);return node;};
const font='"PingFang SC","Microsoft YaHei",Arial,sans-serif';
function labelLayer(container){const node=make('div','invitation-scene-labels',container);Object.assign(node.style,{position:'absolute',inset:'0',overflow:'hidden',pointerEvents:'none',zIndex:2,fontFamily:font});return node;}
function label(parent,css={}){const node=make('div','invitation-scene-label',parent);Object.assign(node.style,{position:'absolute',transform:'translate(-50%,-100%)',color:'#574f35',fontSize:'13px',fontWeight:700,whiteSpace:'nowrap',...css});return node;}
export function invitationLabelBounds(x,y,labelWidth,labelHeight,width,height) {
 const w=Math.min(labelWidth,Math.max(1,width-24)),h=Math.min(labelHeight,Math.max(1,height-24));
 return {x:Math.max(w/2+12,Math.min(width-w/2-12,x)),y:Math.max(h+12,Math.min(height-12,y)),width:w,height:h};
}
function project(node,position,camera,w,h){const v=new THREE.Vector3(...position).project(camera),bounds=invitationLabelBounds((v.x*.5+.5)*w,(-v.y*.5+.5)*h,node.offsetWidth||112,node.offsetHeight||34,w,h);node.style.left=`${bounds.x}px`;node.style.top=`${bounds.y}px`;node.style.maxWidth=`${Math.max(1,w-24)}px`;node.style.boxSizing='border-box';}
function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function createCardWorld(container){
 const art=createInvitationRoomScene(container),{scene,camera,renderer,bear,body,head,legs,objects,objectHalo,tableDestination,mesh,mat}=art;
 for(const o of Object.values(objects))o.visible=false;objectHalo.visible=false;tableDestination.visible=false;
 const layer=labelLayer(container),caption=label(layer,{padding:'7px 12px',background:'#fff7df',border:'1px solid #dac7a5',borderRadius:'20px',boxShadow:'0 4px 10px #75513215'});
 caption.textContent='小熊的邀请卡工作台';
 // A readable magnification is anchored directly above the worktable, rather
 // than competing with the physical card or repeating a bottom-screen prompt.
 const cardPanel=label(layer,{width:'302px',boxSizing:'border-box',whiteSpace:'normal',background:'#fff9e9',border:'2px solid #d5bd88',borderRadius:'17px',padding:'12px 15px 13px',boxShadow:'0 5px 18px #78604422'});
 cardPanel.classList.add('invitation-editable-card');cardPanel.setAttribute('role','group');cardPanel.setAttribute('aria-label','工作台上的邀请卡放大显示');
 const cardTitle=make('div','invitation-card-number',cardPanel);Object.assign(cardTitle.style,{fontSize:'12px',color:'#83714e',marginBottom:'6px'});
 const fullTarget=make('div','invitation-card-target',cardPanel);Object.assign(fullTarget.style,{display:'flex',gap:'10px',alignItems:'baseline',marginBottom:'9px'});
 const fullTargetLabel=make('span','',fullTarget,'完整目标');Object.assign(fullTargetLabel.style,{fontSize:'12px',color:'#827558'});
 const fullTargetWord=make('span','invitation-card-target-word',fullTarget);Object.assign(fullTargetWord.style,{fontSize:'26px',fontFamily:'ui-monospace,monospace',fontWeight:800,color:'#456140'});
 const cardLetters=make('div','invitation-card-letters',cardPanel);Object.assign(cardLetters.style,{display:'flex',gap:'3px',alignItems:'center',padding:'7px 0 8px',borderTop:'1px solid #e4d7b5',overflow:'hidden'});
 const cardProtected=make('div','invitation-card-protected',cardPanel);Object.assign(cardProtected.style,{fontSize:'12px',color:'#77705b',lineHeight:'1.4'});
 const cardInstruction=make('div','invitation-card-instruction',cardPanel);Object.assign(cardInstruction.style,{fontSize:'12px',color:'#665735',marginTop:'5px',lineHeight:'1.4'});
 const pointer=make('div','',cardPanel);Object.assign(pointer.style,{position:'absolute',left:'48%',bottom:'-8px',width:'13px',height:'13px',background:'#fff9e9',borderRight:'2px solid #d5bd88',borderBottom:'2px solid #d5bd88',transform:'rotate(45deg)'});
 let magnifiedKey='';
 function updateMagnifiedCard(state,pose){
  cardPanel.style.display=pose.acting||state.phase==='complete'||state.phase==='stage-ready'||state.stageReady?'none':'block';caption.style.display=pose.acting||state.phase==='complete'||state.phase==='stage-ready'||state.stageReady?'block':'none';
  if(pose.acting||state.phase==='complete'||state.phase==='stage-ready'||state.stageReady)return;
  const {target,prefix,buffer,protectedText,instruction}=invitationCardContent(state);
  const signature=[target,prefix,buffer,state.wrongKey,state.target,state.step,state.lessonStageIndex].join('|');
  if(signature!==magnifiedKey){magnifiedKey=signature;cardTitle.textContent=`第 ${(state.step||0)+1} 张邀请卡 · 工作台上的卡片`;fullTargetWord.textContent=target;cardLetters.replaceChildren();
   const shown=Math.max(target.length,buffer.length),start=Math.max(0,shown-6);
   if(start){const dots=make('span','',cardLetters,'…');Object.assign(dots.style,{fontSize:'20px',color:'#89826f'});}
   for(let i=start;i<shown;i++){
    const ch=buffer[i]||'',printed=i<prefix.length,wrong=!!ch&&ch!==target[i],current=i===buffer.length;
    const cell=make('span','invitation-card-character',cardLetters,ch||' ');cell.dataset.state=wrong?'wrong':printed?'locked':ch?'typed':'missing';cell.setAttribute('aria-label',wrong?`${ch} 待修改`:printed?`${ch} 已印好`:ch||'待补字母');
    Object.assign(cell.style,{position:'relative',display:'inline-flex',flex:'0 0 36px',width:'36px',height:'46px',alignItems:'center',justifyContent:'center',boxSizing:'border-box',borderRadius:'6px',fontFamily:'ui-monospace,monospace',fontSize:'36px',fontWeight:800,color:printed?'#686b58':wrong?'#9b4d35':'#3e633e',background:printed?'#ece9d9':wrong?'#fff0df':'#fffef6',border:printed?'1px solid #ddd8c2':wrong?'2px dashed #9b4d35':'2px solid #baa779',textDecoration:wrong?'line-through':'none'});
    if(current){const caret=make('span','invitation-card-caret',cell);Object.assign(caret.style,{position:'absolute',left:'5px',top:'7px',height:'29px',width:'3px',background:'#4f6542'});}
   }
   if(buffer.length>=target.length){const caret=make('span','invitation-card-caret',cardLetters);Object.assign(caret.style,{height:'33px',width:'3px',flex:'0 0 3px',background:'#4f6542',marginLeft:'1px'});}
   cardProtected.textContent=protectedText;
   cardInstruction.textContent=instruction;
   if(state.wrongKey&&Number(state.level)===9)cardInstruction.textContent='照着完整目标，从光标的位置继续写';
  }
  const pos=new THREE.Vector3(-.4,2.32,-.15).project(camera),panelWidth=Math.min(302,width-24),px=(pos.x*.5+.5)*width,py=(-pos.y*.5+.5)*height;
  cardPanel.style.width=`${panelWidth}px`;cardPanel.style.left=`${Math.max(panelWidth/2+12,Math.min(width-panelWidth/2-12,px))}px`;cardPanel.style.top=`${Math.max(188,py)}px`;
 }
 const table=new THREE.Group();table.name='invitation-writing-worktable';scene.add(table);
 const cube=new THREE.BoxGeometry(1,1,1),ellGeo=new THREE.SphereGeometry(1,14,10);
 const block=(c,p,s,parent=table)=>mesh(cube,c,p,s,parent);
 block('#b08053',[-.25,.93,1.28],[4.8,.15,2.72]);const worktop=block('#d1a574',[-.25,1.035,1.28],[4.94,.10,2.84]);worktop.name='invitation-writing-tabletop';
 for(const x of[-2.32,1.82])for(const z of[.17,2.37])block('#b38b5b',[x,.49,z],[.16,.92,.16]);
 block('#a3754e',[-.25,.57,1.28],[4.39,.12,.12]);
 // A stable low step keeps the bear beside the table, never inside its slab.
 const step=new THREE.Group();step.name='invitation-bear-footstool';scene.add(step);
 const stepTop=block('#caa575',[-3.84,.385,1.10],[1.72,.10,1.18],step);stepTop.name='invitation-bear-footstool-top';
 for(const x of[-4.49,-3.19])for(const z of[.66,1.54])block('#ac8153',[x,.215,z],[.13,.24,.13],step);
 block('#b88f5f',[-3.84,.19,.66],[1.38,.10,.10],step);block('#b88f5f',[-3.84,.19,1.54],[1.38,.10,.10],step);
 const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=768;const ctx=canvas.getContext('2d');
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const paperMat=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,toneMapped:false});
 const card=new THREE.Group();card.name='real-editable-invitation-card';card.position.set(-.25,1.097,1.32);card.rotation.x=-Math.PI/2;scene.add(card);
 function paperHalf(side){const geo=new THREE.PlaneGeometry(2.16,2.50),uv=geo.attributes.uv;for(let i=0;i<uv.count;i++)uv.setX(i,uv.getX(i)*.5+(side>0?.5:0));const part=new THREE.Mesh(geo,paperMat);part.position.x=side*1.08;part.castShadow=true;return part;}
 const left=paperHalf(-1);card.add(left);const flap=new THREE.Group();flap.name='folding-card-half';card.add(flap);flap.add(paperHalf(1));
 const stamp=new THREE.Group();stamp.name='bear-paw-stamp';scene.add(stamp);block('#8a6748',[0,.10,0],[.32,.18,.32],stamp);mesh(ellGeo,'#b4824e',[0,.29,0],[.13,.17,.13],stamp);stamp.position.set(.1,1.23,.75);
 const ink=block('#806d55',[1.88,1.17,.14],[.37,.10,.40]);block('#b69a72',[1.88,1.21,.14],[.27,.05,.29]);
 const envelope=new THREE.Group();envelope.name='folded-card-envelope';scene.add(envelope);block('#f8e8c5',[0,0,0],[1.6,.025,1.0],envelope);envelope.position.set(-1.58,1.145,2.1);envelope.visible=false;
 block('#c5a071',[2.85,.34,1.6],[1.27,.65,.94]);block('#e1c595',[2.85,.68,1.6],[1.35,.10,1.01]);
 const sealed=[];for(let i=0;i<3;i++){const g=new THREE.Group();g.name=`finished-envelope-${i}`;g.position.set(2.85,.73+i*.055,1.6);g.rotation.y=-.15;scene.add(g);block('#fff0cc',[0,0,0],[.95,.045,.65],g);mesh(ellGeo,'#c78461',[.15,.029,.02],[.07,.013,.07],g);g.visible=false;sealed.push(g);}
 const pen=block('#b4784f',[2.2,1.16,1.6],[.055,.07,1.3]);pen.rotation.y=-.24;
 const legRest=legs.map(l=>l.position.clone());
 let width=1,height=1,last=null,key='',disposed=false;
 function draw(state,pose){
  const {target,prefix,buffer,protectedText,instruction}=invitationCardContent(state);
  const k=[target,prefix,buffer,state.level,state.phase,pose.stamp>.5,pose.fold>.1,state.wrongKey,state.message].join('|');if(key===k)return;key=k;
  ctx.clearRect(0,0,1280,768);ctx.fillStyle='#fff9e7';rounded(ctx,0,0,1280,768,30);ctx.strokeStyle='#ddbf85';ctx.lineWidth=5;ctx.strokeRect(30,30,1220,708);
  ctx.textAlign='center';ctx.fillStyle='#8b754a';ctx.font=`700 33px ${font}`;ctx.fillText(Number(state.level)===9?'野餐邀请卡 · 写好短词':'野餐邀请卡 · 修好末尾',640,90);
  ctx.font=`500 27px ${font}`;ctx.fillStyle='#766a51';ctx.fillText('完整目标',640,150);
  ctx.font='700 78px ui-monospace, monospace';ctx.fillStyle='#4a6447';ctx.fillText(target,640,232);
  ctx.fillStyle='#e8d8b9';ctx.fillRect(130,263,1020,2);
  const chars=[...buffer],fontSize=103,cell=98,shown=Math.max(target.length,chars.length),start=640-shown*cell/2;
  ctx.font=`700 ${fontSize}px ui-monospace, monospace`;ctx.textBaseline='middle';ctx.textAlign='center';
  for(let i=0;i<shown;i++){
   const x=start+i*cell,printed=i<prefix.length,ch=chars[i]||'',wrong=!!ch&&ch!==target[i];
   ctx.fillStyle=printed?'#ece6d4':wrong?'#fff0df':'#fffdf4';rounded(ctx,x+3,317,cell-6,132,9);
   if(!printed){ctx.strokeStyle=wrong?'#9f5039':'#bca671';ctx.lineWidth=wrong?4:3;ctx.setLineDash(wrong?[12,7]:[]);ctx.strokeRect(x+3,317,cell-6,132);ctx.setLineDash([]);}
   ctx.fillStyle=printed?'#7f7e6c':wrong?'#944830':'#42643e';ctx.fillText(ch,x+cell/2,384);
   if(wrong){ctx.strokeStyle='#944830';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x+17,404);ctx.lineTo(x+cell-17,355);ctx.stroke();ctx.font=`700 19px ${font}`;ctx.fillText('待修改',x+cell/2,474);ctx.font=`700 ${fontSize}px ui-monospace, monospace`;}
   if(!ch&&i===chars.length){ctx.fillStyle='#576648';ctx.fillRect(x+19,426,cell-38,5);}
  }
  const cursorX=start+chars.length*cell-4;ctx.fillStyle='#536441';ctx.fillRect(cursorX,325,5,116);
  ctx.textBaseline='alphabetic';ctx.font=`600 25px ${font}`;ctx.fillStyle='#85806b';ctx.fillText(protectedText,640,533);
  let tip=instruction;
  if(state.wrongKey)tip=Number(state.level)===9?'从光标的位置继续写，再试一次':'末尾可以用 Backspace 修改';
  if(pose.acting)tip=pose.fold>.08?'小熊正在折好卡片':'写好啦！小熊盖上小印章';
  if(state.phase==='complete'||state.stageReady)tip='邀请卡都装进信封啦';
  ctx.font=`700 30px ${font}`;ctx.fillStyle='#685c42';ctx.fillText(tip,640,635);
  if(pose.progress>.30){ctx.save();ctx.translate(755,215);ctx.rotate(-.15);ctx.strokeStyle='#b67956';ctx.fillStyle='#b67956';ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,58,0,Math.PI*2);ctx.stroke();ctx.font=`700 28px ${font}`;ctx.fillText('完成',0,9);ctx.restore();}
  texture.needsUpdate=true;
 }
 function update(state){
  if(disposed)return;last=state;const pose=sampleInvitationPose(state);draw(state,pose);
  bear.position.set(...pose.root);bear.rotation.set(0,pose.yaw,0);bear.scale.setScalar(1.04);body.position.set(0,0,0);body.rotation.set(0,0,0);head.rotation.set(.10-pose.stamp*.06,0,0);
  legs.forEach((leg,i)=>{leg.position.copy(legRest[i]);leg.rotation.set(0,0,0);if(i===1||i===3){leg.position.y+=.28;leg.position.z=.46;leg.rotation.x=-1.35+pose.stamp*.35;}});
  const stampLift=pose.acting&&pose.progress<.36?Math.sin(pose.progress/.36*Math.PI)*.36:0;
  stamp.position.set(-2.27,1.095+stampLift,.72);stamp.rotation.z=-.08*pose.stamp;
  // Both front paws actually reach the tool/paper; they are not a decorative bob.
  bear.updateMatrixWorld(true);body.updateMatrixWorld(true);
  for(const i of[1,3]){const leg=legs[i],grip=new THREE.Vector3(mix(i===3?-2.27:-2.30,-2.68,pose.fold),i===3?1.405+stampLift:1.17+pose.fold*.18,i===3?.72:1.48);body.worldToLocal(grip);const direction=grip.sub(leg.position),length=direction.length();leg.userData.reachLength=length;leg.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),direction.normalize());leg.children[0].position.set(0,-length*.49,0);leg.children[0].scale.set(.17,length*.5+.045,.18);leg.children[1].position.set(0,-length,0);leg.children[1].scale.set(.18,.12,.21);}
  card.position.set(-.25+3.1*pose.pack,1.097+.46*Math.sin(pose.pack*Math.PI)-.33*pose.pack,1.32+.48*pose.pack);card.rotation.set(-Math.PI/2,0,-.12*pose.pack);card.scale.setScalar(1-.55*pose.pack);flap.rotation.y=-pose.fold*Math.PI*.985;
  card.visible=state.phase!=='complete'&&!state.stageReady&&state.phase!=='stage-ready'&&pose.pack<.98;envelope.visible=pose.pack>.6;envelope.position.set(-.25+3.1*pose.pack,1.13+.3*Math.sin(pose.pack*Math.PI)-.33*pose.pack,1.32+.48*pose.pack);envelope.scale.setScalar(.7+.3*pose.pack);
  sealed.forEach((g,i)=>g.visible=i<(state.completed?.length||state.step||0));
  caption.textContent=state.phase==='complete'||state.stageReady?'这一组邀请卡都装好啦':pose.fold>.1?'小熊正在折好卡片、装进信封':'写好啦，小熊盖上小印章';
  camera.updateMatrixWorld(true);project(caption,[-.4,2.9,-.3],camera,width,height);updateMagnifiedCard(state,pose);renderer.render(scene,camera);
  container.dataset.invitationMode='card';container.dataset.cardTarget=state.targetText||'';container.dataset.cardBuffer=state.buffer||'';container.dataset.cardFold=pose.fold.toFixed(3);
 }
 function resize(){if(disposed)return;width=Math.max(1,container.clientWidth);height=Math.max(1,container.clientHeight);const aspect=width/height,hh=Math.max(4.95,6.3/aspect);camera.left=-hh*aspect;camera.right=hh*aspect;camera.top=hh;camera.bottom=-hh;camera.position.set(4.2,12.8,14.7);camera.lookAt(-.3,1.1,.3);camera.updateProjectionMatrix();renderer.setSize(width,height);if(last)update(last);}
 const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;observer?.observe(container);globalThis.window?.addEventListener('resize',resize);resize();
 return {update,destroy(){if(disposed)return;disposed=true;observer?.disconnect();globalThis.window?.removeEventListener('resize',resize);layer.remove();art.dispose();}};
}

function createDeliveryWorld(container){
 const art=createInvitationGarden(container),{scene,camera,renderer,bear,body,head,legs,letter,mailboxes,recipients,block,ell,beam,dynamic}=art;
 // A genuine picnic destination stays in the same scene throughout every visit.
 const picnic=dynamic('persistent-picnic-destination');picnic.position.set(1.65,.08,4.40);
 block('#e9c887',[0,.015,0],[4.28,.045,2.42],picnic);block('#cc8d6b',[0,.048,0],[4.09,.018,2.24],picnic);
 for(let i=-3;i<=3;i++)block('#eadbb5',[i*.56,.061,0],[.18,.01,2.24],picnic);
 for(let i=-1;i<=1;i++)block('#eadbb5',[0,.07,i*.70],[4.09,.012,.18],picnic);
 const dish=ell('#fbedd3',[-.36,.11,.04],[.63,.055,.40],picnic);ell('#c9a361',[-.36,.16,.04],[.46,.08,.27],picnic);
 for(const p of[[-.58,.24,.0],[-.23,.24,.12],[-.36,.25,-.1]])ell('#d5946c',p,[.13,.10,.12],picnic);
 for(const x of[.61,.99]){art.cylinder('#96aba0',[x,.19,.03],.14,.12,.30,picnic);art.cylinder('#eee5bd',[x,.345,.03],.115,.115,.012,picnic);}
 block('#be9665',[-1.45,.22,-.23],[.56,.36,.49],picnic);beam([-1.69,.38,-.23],[-1.69,.63,-.23],.035,'#b18b58',picnic);beam([-1.21,.38,-.23],[-1.21,.63,-.23],.035,'#b18b58',picnic);beam([-1.69,.63,-.23],[-1.21,.63,-.23],.035,'#b18b58',picnic);
 const board=dynamic('shared-three-part-invitation-board');board.position.set(-1.6,.08,2.12);
 block('#a78154',[-.82,.59,0],[.10,1.18,.12],board);block('#a78154',[.82,.59,0],[.10,1.18,.12],board);block('#caa772',[0,1.09,0],[2.15,1.40,.10],board);
 const boardCanvas=document.createElement('canvas');boardCanvas.width=768;boardCanvas.height=512;const boardContext=boardCanvas.getContext('2d');
 const boardTexture=new THREE.CanvasTexture(boardCanvas);boardTexture.colorSpace=THREE.SRGBColorSpace;
 const boardMaterial=new THREE.MeshBasicMaterial({map:boardTexture,toneMapped:false});
 const boardPaper=new THREE.Mesh(new THREE.PlaneGeometry(1.95,1.24),boardMaterial);boardPaper.position.set(0,1.09,.065);board.add(boardPaper);let boardKey='';
 const activityObjects={};
 for(const id of ['play-C','play-X','play-Z','share-C','share-X','share-Z']){const g=dynamic(`picnic-activity-${id}`);g.visible=false;activityObjects[id]=g;}
 const ball=activityObjects['play-C'];ell('#be8868',[0,0,0],[.25,.25,.25],ball);block('#efd292',[0,.21,0],[.25,.06,.29],ball);
 const tower=activityObjects['play-X'];for(let i=0;i<4;i++)block(['#d6a05d','#a6b98d','#b7876c','#edcb86'][i],[0,.11+i*.21,0],[.27,.20,.27],tower);
 const kite=activityObjects['play-Z'],kiteBody=new THREE.Group();kite.add(kiteBody);
 const kiteShape=new THREE.Shape();kiteShape.moveTo(0,.55);kiteShape.lineTo(.38,0);kiteShape.lineTo(0,-.5);kiteShape.lineTo(-.38,0);kiteShape.closePath();
 const kiteMesh=new THREE.Mesh(new THREE.ShapeGeometry(kiteShape),new THREE.MeshStandardMaterial({color:'#d69a68',side:THREE.DoubleSide,roughness:1}));kiteBody.add(kiteMesh);
 beam([0,-.49,.01],[0,.54,.01],.018,'#eed8a5',kiteBody);beam([-.37,0,.01],[.37,0,.01],.018,'#eed8a5',kiteBody);
 const kiteString=beam([0,.08,0],[0,1,0],.008,'#d8c894',kite);kiteString.name='picnic-kite-tether';
 const pear=activityObjects['share-C'];ell('#fcf0d3',[0,.018,0],[.26,.025,.23],pear);ell('#c4bf73',[0,.15,0],[.13,.16,.13],pear);ell('#c4bf73',[.01,.27,0],[.08,.11,.08],pear);beam([.01,.34,0],[.035,.40,0],.014,'#876643',pear);
 const juice=activityObjects['share-X'];art.cylinder('#9dae99',[0,.12,0],.15,.12,.24,juice);art.cylinder('#efcb74',[0,.244,0],.132,.132,.012,juice);
 const cake=activityObjects['share-Z'];ell('#f8ecd1',[0,.018,0],[.30,.025,.25],cake);block('#c69762',[0,.12,0],[.30,.18,.25],cake);block('#eed4a0',[0,.225,0],[.31,.055,.26],cake);ell('#be7f5a',[0,.27,0],[.05,.05,.05],cake);
 const route=dynamic('current-invitation-route'),routeDots=[];for(let i=0;i<39;i++){const dot=ell('#fff2be',[0,.10,0],[.07,.02,.07],route);dot.castShadow=false;routeDots.push(dot);}
 const layer=labelLayer(container),houses=Object.fromEntries(Object.entries(INVITATION_FRIENDS).map(([key,f])=>{const n=label(layer,{background:'#fff7df',border:'1px solid #d2bb89',borderRadius:'13px',padding:'7px 11px',boxShadow:'0 4px 14px #62734218'});n.dataset.recipient=key;n.textContent=`${key} · ${f.label}`;return [key,n];}));
 const party=label(layer,{background:'#fff8df',border:'1px solid #d2bd88',borderRadius:'14px',padding:'7px 11px'});
 const responses=Object.fromEntries(Object.keys(INVITATION_FRIENDS).map(key=>[key,label(layer,{background:'#fff8df',padding:'5px 8px',borderRadius:'11px',fontSize:'11px'})]));
 const panel=label(layer,{whiteSpace:'normal',width:'292px',boxSizing:'border-box',background:'#fff8e4',border:'2px solid #d3b97e',borderRadius:'17px',padding:'12px 14px',boxShadow:'0 6px 20px #53633322'});
 panel.classList.add('invitation-sentence-card');panel.setAttribute('role','group');panel.setAttribute('aria-label','朋友家门前的邀请卡');
 const title=make('div','invitation-panel-title',panel);Object.assign(title.style,{fontSize:'12px',color:'#8a7959',marginBottom:'6px'});
 const target=make('div','invitation-complete-target',panel);Object.assign(target.style,{fontSize:'22px',fontWeight:800,fontFamily:'ui-monospace,monospace',letterSpacing:'.5px',color:'#4b6141',marginBottom:'7px',whiteSpace:'pre-wrap'});
 const typed=make('div','invitation-typed-sentence',panel);Object.assign(typed.style,{display:'flex',alignItems:'center',minHeight:'32px',fontSize:'21px',fontFamily:'ui-monospace,monospace',fontWeight:800,padding:'4px 0',borderTop:'1px solid #e6d9b8',flexWrap:'wrap'});
 const hint=make('div','invitation-card-hint',panel);Object.assign(hint.style,{fontSize:'11px',color:'#8a7856',marginTop:'6px',lineHeight:'1.45'});
 const legRest=legs.map(l=>l.position.clone()),legParts=legs.map(l=>l.children.map(c=>({position:c.position.clone(),scale:c.scale.clone()})));
 let width=1,height=1,last=null,disposed=false,labelKey='',cameraMode='';
 function updatePanel(state,pose){
  const writing=state.stage==='write'&&!state.stageReady&&state.phase!=='complete',delivery=state.action?.type==='deliver'&&state.phase==='acting'&&(!pose.shared||state.action.partOnly||pose.progress<.22);
  panel.style.display=writing||delivery?'block':'none';
  if(!writing&&!delivery)return;
  const spec=invitationVisit(state,pose.selected),text=state.targetText||spec.text,buffer=state.buffer||'';
  const purpose=state.activity?.label||'邀请';
  const k=[text,buffer,state.wrongKey,state.phase,pose.selected,state.lessonStageIndex,width<560].join('|');
  if(k!==labelKey){labelKey=k;title.textContent=pose.shared?`给三位朋友的邀请 · ${state.invitationParts[pose.writingPart]?.title||'写好邀请'}`:delivery?`和${spec.label}${purpose}`:`和${spec.label}${purpose} · 照着写`;
   target.textContent=text;target.setAttribute('aria-label',`完整目标 ${text}`);typed.replaceChildren();
   const visibleLength=Math.max(text.length,buffer.length);
   for(let i=0;i<visibleLength;i++){
    const char=buffer[i],expected=text[i],wrong=char!==undefined&&char!==expected,current=i===buffer.length;
    const cell=make('span','invitation-character',typed);cell.textContent=char===undefined?(expected===' '?'␣':'·'):char===' '?'␣':char;
    cell.dataset.state=wrong?'wrong':char===undefined?'empty':'typed';cell.setAttribute('aria-label',wrong?`待修改 ${char}`:char===' '||expected===' '?'空格':char||'待写');
    Object.assign(cell.style,{display:'inline-block',width:expected===' '||char===' '?'18px':'15px',minWidth:expected===' '||char===' '?'18px':'15px',textAlign:'center',position:'relative',height:'28px',lineHeight:'28px',boxSizing:'border-box',color:wrong?'#a14f37':char===undefined?'#b3ad95':'#526944',borderBottom:current?'3px solid #68774f':expected===' '?'1px dashed #bdad81':'2px solid transparent',textDecoration:wrong?'line-through':'none',background:wrong?'#f4e0cf':'transparent'});
    if(wrong){cell.title='这个末字需要修改';cell.style.outline='1px dashed #a14f37';}
   }
   const cursor=make('span','invitation-caret',typed,'│');Object.assign(cursor.style,{color:'#556944',order:'0',width:'3px',marginLeft:'-3px'});
   if(buffer.length<typed.children.length-1)typed.insertBefore(cursor,typed.children[buffer.length]);
   hint.textContent=delivery?(pose.shared?(state.action.partOnly?'把这一行留在同一张邀请卡上':'邀请写全了，三位朋友沿小路来野餐'):pose.activity?'小熊和朋友一起完成刚才写下的活动':spec.atPicnic?'小熊把卡片递给野餐垫旁的朋友':'小熊正在递出卡片，朋友会走到野餐垫旁'):'␣ 表示空格；写错末尾时按 Backspace 修改';
   if(state.wrongKey)hint.textContent='有个末字需要修改：按 Backspace 删掉，再继续';
  }
  // The back cottage is above the walking lane: put its letter to the right
  // in open garden space, so neither the bear nor the friend is underneath it.
  const anchor=pose.shared?[-1.6,3.1,2.12]:spec.atPicnic?[1.45,3.2,3.6]:pose.selected==='Z'?[1.3,1.4,-4.8]:[spec.home[0],2.0,spec.home[2]],v=new THREE.Vector3(...anchor).project(camera),panelWidth=Math.min(304,width-24);
  const bounds=invitationLabelBounds((v.x*.5+.5)*width,(-v.y*.5+.5)*height,panelWidth,panel.offsetHeight||168,width,height);
  panel.style.width=`${panelWidth}px`;panel.style.left=`${bounds.x}px`;panel.style.top=`${bounds.y}px`;

 }
 function update(state){
  if(disposed)return;last=state;const nextCamera=state.activity?'picnic':'garden';if(cameraMode!==nextCamera){cameraMode=nextCamera;configureCamera();}const pose=sampleInvitationPose(state),arrived=new Set((pose.shared?invitationGuestKeys(state):state.arrived||state.completed||[]).map(friendKey)),guests=new Set(invitationGuestKeys(state));
  const available=new Set(state.friends?.length?state.friends.map(friend=>friendKey(friend.key)):Number(state.level)===11?['X']:['C','X','Z']);
  bear.position.set(...pose.root);bear.rotation.set(0,pose.yaw,0);body.position.set(0,Math.abs(pose.stride)*.025,0);body.rotation.set(0,0,0);head.rotation.set(-pose.hand*.16,0,-pose.stride*.025);
  legs.forEach((leg,i)=>{const phase=i===0||i===3?1:-1;leg.position.copy(legRest[i]);leg.position.z+=pose.stride*.11*phase;leg.position.y+=Math.max(0,pose.stride*phase)*.075;leg.rotation.set(i===3?-pose.hand*.55:0,0,0);leg.children.forEach((child,j)=>{child.position.copy(legParts[i][j].position);child.scale.copy(legParts[i][j].scale);});});
  letter.visible=pose.envelopeVisible;letter.position.set(...pose.envelope);letter.rotation.set(0,pose.yaw,-.08);letter.scale.setScalar(INVITATION_BEAR_SCALE);
  for(const[key,f]of Object.entries(INVITATION_FRIENDS)){
   const r=recipients[f.index],p=pose.friends[key];r.g.visible=p.visible;r.g.position.set(...p.position);r.g.rotation.y=p.yaw;r.g.scale.setScalar(p.seated?.59:.65);r.paw.rotation.z=(p.seated?-.6:-.2)+(p.wave||0)*.7;
   r.feet.forEach((foot,i)=>{foot.position.z=.03+p.stride*(i?-.10:.10);foot.position.y=.12+Math.max(0,p.stride*(i?-1:1))*.07;});
   const atPicnic=guests.has(key),choice=pose.activity&&state.stage==='select'&&!state.stageReady&&state.phase!=='complete';
   houses[key].style.display=available.has(key)&&(!pose.activity||choice)?'block':'none';
   const activities=pose.activity==='play'?{C:'滚球',X:'搭积木',Z:'放风筝'}:pose.activity==='share'?{C:'分梨子',X:'倒果汁',Z:'分蛋糕'}:{C:'问候小兔',X:'问候小熊',Z:'问候小鹿'};
   houses[key].textContent=choice?`${key} · ${activities[key]}`:atPicnic?`${f.label}已到`:pose.shared?`${f.label}的家`:arrived.has(key)?`✓ ${f.label}`:`${key} · ${f.label}`;
   Object.assign(houses[key].style,{background:arrived.has(key)?'#e1e9bb':key===pose.selected&&state.stage!=='select'?'#fff0bb':'#fff7df',opacity:'1'});
   project(houses[key],atPicnic?[f.seat[0],1.4,f.seat[2]]:[f.home[0],1.07,f.home[2]],camera,width,height);
   if(choice&&width<560){houses[key].style.left=`${width*(f.index+1)/4}px`;houses[key].style.top=`${height-50}px`;houses[key].style.padding='6px 7px';houses[key].style.fontSize='11px';}
   responses[key].style.display=pose.activity&&!choice?'block':p.seated&&!available.has(key)?'block':'none';
   responses[key].textContent=pose.activity?(key===pose.selected&&pose.acting&&state.action?.type==='deliver'?pose.activity==='greet'?'你好呀！':pose.activity==='play'?'一起玩！':'谢谢分享！':f.label):`${f.label}已到`;
   project(responses[key],[p.position[0],1.2,p.position[2]],camera,width,height);
   const box=mailboxes[f.index];box.ring.visible=!pose.shared&&!pose.activity&&!atPicnic&&state.stage!=='select'&&key===pose.selected&&!arrived.has(key);box.flag.rotation.x=guests.has(key)?0:Math.PI*.52;box.status.visible=guests.has(key);box.door.rotation.x=!pose.shared&&key===pose.selected?-pose.hand*.5:0;

  }
  const showRoute=state.action?.type==='visit'&&state.phase==='acting';route.visible=showRoute;
  if(showRoute){const f=invitationVisit(state,pose.selected),points=f.visitor;routeDots.forEach((dot,i)=>dot.position.set(...pathSample(points,i/(routeDots.length-1)).root));}
  board.visible=pose.shared;
  if(pose.shared){const written=state.invitationWritten||[],current=state.buffer||'',k=JSON.stringify([written,current,state.lessonStageIndex]);if(k!==boardKey){boardKey=k;boardContext.fillStyle='#fff5db';boardContext.fillRect(0,0,768,512);boardContext.fillStyle='#6a704a';boardContext.textAlign='center';boardContext.font=`700 42px ${font}`;boardContext.fillText('给小兔、小熊和小鹿',384,72);for(let i=0;i<3;i++){const text=written[i]||(i===pose.writingPart?current:'');boardContext.fillStyle=text?'#5f7148':'#d7c69e';boardContext.fillRect(68,126+i*113,632,2);boardContext.font='700 45px ui-monospace, monospace';boardContext.fillText(text||'· · ·',384,185+i*113);}boardTexture.needsUpdate=true;}}
  for(const object of Object.values(activityObjects))object.visible=false;
  for(const prop of pose.activityProps){const object=activityObjects[`${prop.activity}-${prop.friend}`];if(!object)continue;object.visible=true;object.position.set(...prop.position);object.rotation.set(0,0,0);if(prop.activity==='play'&&prop.friend==='C')object.rotation.x=prop.progress*Math.PI*4;if(prop.activity==='play'&&prop.friend==='X')object.children.forEach((child,i)=>{child.position.y=.11+i*.21;child.scale.y=.20*clamp(prop.build*4-i);child.visible=prop.build*4>i;});if(prop.activity==='play'&&prop.friend==='Z'){kiteBody.position.set(.3*prop.launch,.55+prop.launch*2.05,0);kiteBody.rotation.z=-.17;const a=new THREE.Vector3(0,.09,0),b=kiteBody.position.clone();kiteString.position.copy(a).add(b).multiplyScalar(.5);kiteString.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());kiteString.scale.y=a.distanceTo(b)/.92;}}
  const movingProp=pose.activityProps.find(prop=>prop.pending);
  if(movingProp&&pose.hand>.02){bear.updateMatrixWorld(true);body.updateMatrixWorld(true);const leg=legs[movingProp.friend==='Z'?3:1],grip=new THREE.Vector3(...movingProp.position);grip.y+=.13;body.worldToLocal(grip);const direction=grip.sub(leg.position),length=Math.min(.96,direction.length());leg.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),direction.normalize());leg.children[0].position.set(0,-length*.46,0);leg.children[0].scale.set(.16,length*.49+.025,.18);leg.children[1].position.set(0,-length,0);}
  party.textContent=state.phase==='complete'?(pose.activity?'一起玩过，也一起分享点心啦': '三位朋友到齐啦，去野餐！'):pose.shared?(state.action?.allGuests&&pose.acting?'邀请已贴好，朋友们正在走来':`同一张邀请 · 已写好 ${state.invitationWritten?.length||0}/3 行`):pose.activity?`${state.activity.label} · 朋友一直都在这里`:`野餐垫 · ${guests.size} 位朋友在一起`;
  project(party,[1.7,.25,6.23],camera,width,height);camera.updateMatrixWorld(true);updatePanel(state,pose);renderer.render(scene,camera);

  container.dataset.invitationMode='mail';container.dataset.invitationStage=state.stage||'';container.dataset.invited=String(guests.size);container.dataset.bearPosition=pose.root.map(n=>n.toFixed(3)).join(',');container.dataset.friendPositions=JSON.stringify(Object.fromEntries(Object.entries(pose.friends).map(([k,v])=>[k,v.position])));container.dataset.activityResults=JSON.stringify(pose.activityProps.map(prop=>({activity:prop.activity,friend:prop.friend,position:prop.position})));
 }
 function configureCamera(){const aspect=width/height,close=cameraMode==='picnic',halfWidth=close?(aspect<1?4.8:6.3):(aspect<1?10.0:11.4);camera.left=-halfWidth;camera.right=halfWidth;camera.top=halfWidth/aspect;camera.bottom=-halfWidth/aspect;camera.position.set(0,18,25);camera.lookAt(close?1.1:0,close?.6:.8,close?3.95:-1.3);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);}
 function resize(){if(disposed)return;width=Math.max(1,container.clientWidth);height=Math.max(1,container.clientHeight);configureCamera();renderer.setSize(width,height);if(last)update(last);}

 const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;observer?.observe(container);globalThis.window?.addEventListener('resize',resize);resize();
 return {update,destroy(){if(disposed)return;disposed=true;observer?.disconnect();globalThis.window?.removeEventListener('resize',resize);layer.remove();boardTexture.dispose();boardMaterial.dispose();boardPaper.geometry.dispose();kiteMesh.geometry.dispose();kiteMesh.material.dispose();art.destroy();}};
}

export function createInvitationWorld(container){
 let mode=null,world=null,disposed=false,lastSnapshot=null;
 return {
  update(input={},dt=0){if(disposed)return;let state=input;const next=input.mode||(Number(input.level)<=10?'card':'mail');if(next!==mode){world?.destroy();mode=next;world=mode==='card'?createCardWorld(container):createDeliveryWorld(container);lastSnapshot=null;}
   // Freeze the last visible pose while paused, even if an external caller supplies
   // a different action elapsed value. A first paused frame uses its own snapshot.
   if(input.paused){if(!lastSnapshot)lastSnapshot=JSON.parse(JSON.stringify(input));state=lastSnapshot;}else lastSnapshot=JSON.parse(JSON.stringify(input));
   world.update(state,dt);
  },
  destroy(){if(disposed)return;disposed=true;world?.destroy();world=null;lastSnapshot=null;delete container.dataset.invitationMode;delete container.dataset.cardTarget;delete container.dataset.cardBuffer;delete container.dataset.cardFold;delete container.dataset.invitationStage;delete container.dataset.invited;delete container.dataset.bearPosition;delete container.dataset.friendPositions;delete container.dataset.activityResults;}
 };
}
