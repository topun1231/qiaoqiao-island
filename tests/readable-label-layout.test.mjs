import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {screenObjectBounds} from '../dist/game/screen-bounds.js';
import {invitationLabelBounds} from '../dist/game/invitation-world.js';
import {layoutPairingLabels} from '../dist/game/pairing-world.js';
const overlaps=(a,b)=>Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top);
test('large cards and room labels avoid characters within narrow and wide scenes',()=>{
 for(const width of [480,900,1280]){
  const height=500,bear={left:width*.22-30,right:width*.22+30,top:210,bottom:310};
  const card=invitationLabelBounds(width*.45,300,302,220,width,height,[bear]);
  assert(!overlaps({left:card.x-card.width/2,right:card.x+card.width/2,top:card.y-card.height,bottom:card.y},bear));
  const entries=Array.from({length:6},(_,i)=>({key:String(i),x:width*.4+i%2*30,y:250+Math.floor(i/2)*15,width:140,height:65,destination:i>3}));
  const labels=layoutPairingLabels(entries,width,height,[bear]);for(const l of labels){assert(!overlaps(l.rect,bear));assert(l.rect.left>=0&&l.rect.right<=width&&l.rect.top>=0&&l.rect.bottom<=height);}
  for(let i=0;i<labels.length;i++)for(let j=0;j<i;j++)assert(!overlaps(labels[i].rect,labels[j].rect));
 }
});
test('projected avoidance bounds follow a moving character rather than a fixed screen region',()=>{
 const camera=new THREE.OrthographicCamera(-5,5,5,-5,.1,100);camera.position.set(0,0,10);camera.lookAt(0,0,0);camera.updateProjectionMatrix();
 const object=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshBasicMaterial());
 const a=screenObjectBounds(object,camera,1000,1000);object.position.x=2;const b=screenObjectBounds(object,camera,1000,1000);assert(Math.abs(b.left-a.left-200)<1e-8);assert.equal(a.bottom,b.bottom);object.geometry.dispose();object.material.dispose();
});
