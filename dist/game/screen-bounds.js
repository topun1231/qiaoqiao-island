import {Box3,Vector3} from '../vendor/three.module.js';

// Labels avoid the projected character, including its current animated pose.
export function screenObjectBounds(object,camera,width,height,padding=6){
 object.updateWorldMatrix(true,true);camera.updateMatrixWorld(true);
 const box=new Box3().setFromObject(object),points=[];
 for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new Vector3(x,y,z).project(camera));
 return {left:Math.min(...points.map(p=>(p.x*.5+.5)*width))-padding,right:Math.max(...points.map(p=>(p.x*.5+.5)*width))+padding,top:Math.min(...points.map(p=>(-p.y*.5+.5)*height))-padding,bottom:Math.max(...points.map(p=>(-p.y*.5+.5)*height))+padding};
}
