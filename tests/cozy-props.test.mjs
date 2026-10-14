import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {createCozyProps} from '../dist/game/cozy-props.js';

test('changing an activity removes old labels without stopping the next frame',()=>{
 const previous=globalThis.document;
 const context=new Proxy({}, {get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
 globalThis.document={createElement:()=>({getContext:()=>context})};
 try{
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),p=createCozyProps(scene,camera),round=new THREE.Group();p.root.add(round);
  p.label('ball',[0,0,0],2,.5,round);p.billboard();round.clear();
  const next=p.label('tower',[0,0,0],2,.5,round);camera.rotation.y=.3;camera.updateMatrixWorld();
  assert.doesNotThrow(()=>p.billboard());assert.ok(next.quaternion.equals(camera.quaternion));
 }finally{globalThis.document=previous;}
});
