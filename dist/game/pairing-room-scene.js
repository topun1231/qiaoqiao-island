import * as THREE from '../vendor/three.module.js';

// Mesh-built, approved cutaway room. Animation is owned by room-world.
export function createRoomScene(container) {
const scene = new THREE.Scene();
scene.background = new THREE.Color('#f1e9d8');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
} catch (error) { throw error; }
renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
container.appendChild(renderer.domElement);
const camera = new THREE.OrthographicCamera(-8, 8, 5.3, -5.3, .1, 100);
scene.add(new THREE.HemisphereLight('#fff9e9', '#b39c78', 2.05));
const sun = new THREE.DirectionalLight('#fff1cc', 3.0);
sun.position.set(-3, 11, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, {left:-10, right:10, top:10, bottom:-10, near:.5, far:35});
sun.shadow.normalBias = .025;
sun.shadow.bias = -.00015;
sun.shadow.radius = 4;
scene.add(sun);
const fill = new THREE.DirectionalLight('#e3f0e1', .55);
fill.position.set(8, 6, -3);
scene.add(fill);

const room = new THREE.Group();
room.name = 'cozy-cutaway-room';
scene.add(room);
const palette = new Map();
function mat(color) {
  if (!palette.has(color)) palette.set(color, new THREE.MeshStandardMaterial({color, roughness:.94, flatShading:true}));
  return palette.get(color);
}
function mesh(geometry, color, position=[0,0,0], scale=[1,1,1], parent=room) {
  const object = new THREE.Mesh(geometry, typeof color === 'string' ? mat(color) : color);
  object.position.set(...position);
  object.scale.set(...scale);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}
const box = new THREE.BoxGeometry(1,1,1);
const sphere = new THREE.SphereGeometry(1,14,10);
const ell = (c,p,s,parent) => mesh(sphere,c,p,s,parent);
const block = (c,p,s,parent) => mesh(box,c,p,s,parent);
function cylinder(c,p,rt,rb,h,parent=room,n=16) { return mesh(new THREE.CylinderGeometry(rt,rb,h,n),c,p,[1,1,1],parent); }
function rod(c,a,b,r,parent=room) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const object = cylinder(c,start.clone().add(end).multiplyScalar(.5).toArray(),r,r,start.distanceTo(end),parent,10);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());
  return object;
}
function roundedShape(w,d,r) {
  const shape = new THREE.Shape(), x=-w/2, y=-d/2;
  shape.moveTo(x+r,y); shape.lineTo(x+w-r,y); shape.quadraticCurveTo(x+w,y,x+w,y+r);
  shape.lineTo(x+w,y+d-r); shape.quadraticCurveTo(x+w,y+d,x+w-r,y+d);
  shape.lineTo(x+r,y+d); shape.quadraticCurveTo(x,y+d,x,y+d-r);
  shape.lineTo(x,y+r); shape.quadraticCurveTo(x,y,x+r,y);
  return shape;
}
function slab(c,p,w,d,h,r=.1,parent=room) {
  const geometry = new THREE.ExtrudeGeometry(roundedShape(w,d,r), {depth:h,bevelEnabled:false,curveSegments:5});
  geometry.rotateX(-Math.PI/2);
  return mesh(geometry,c,p,[1,1,1],parent);
}
function ring(c,p,r,t=.025,parent=room) {
  const object=mesh(new THREE.TorusGeometry(r,t,7,56),c,p,[1,1,1],parent);
  object.rotation.x=-Math.PI/2;
  return object;
}
function line(c,points,r=.025,parent=room) {
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'catmullrom',0);
  return mesh(new THREE.TubeGeometry(curve,points.length*8,r,6,false),c,[0,0,0],[1,1,1],parent);
}

// A substantial dollhouse base, plank seams, and two open cutaway walls.
slab('#c6a17b',[0,-.38,0],10.35,7.96,.3,.21);
slab('#dfbd90',[0,-.11,0],10.20,7.81,.12,.14);
const woods=['#d4aa7a','#dcb687','#d8af7e','#e0bc8e','#d6ad7d'];
for(let col=0;col<10;col++) {
  const x=-4.5+col;
  for(let row=0;row<5;row++) {
    const z=-3.03+row*1.53;
    block(woods[(col*2+row*3)%woods.length],[x,.022,z],[.975,.042,1.505]);
    // Restrained wood grain cut into each broad plank.
    block(woods[(col*2+row*3+1)%woods.length],[x+.14,.045,z+.12],[.016,.002,.77]);
  }
}
block('#f3e6c8',[0,1.97,-3.85],[10.35,3.94,.23]);
block('#edddbb',[-5.06,1.97,0],[.23,3.94,7.85]);
block('#fbf0d9',[0,3.98,-3.85],[10.50,.12,.31]);
block('#f6eacf',[-5.06,3.98,0],[.31,.12,7.90]);
block('#d4ae7c',[0,.17,-3.69],[10.06,.30,.10]);
block('#d0a878',[-4.90,.17,0],[.10,.30,7.53]);
block('#e3c796',[0,.32,-3.68],[10.05,.055,.13]);
block('#e3c796',[-4.88,.32,0],[.13,.055,7.53]);

// A quiet wall pattern reads as wallpaper, not a dense texture.
for(let i=0;i<13;i++) for(let j=0;j<3;j++) {
  const x=-4.55+i*.74, y=.90+j*.90;
  const petal=ell('#e7d8b8',[x,y,-3.718],[.022,.046,.005]); petal.castShadow=false;
}
// Low plane beneath the room collects a soft grounding shadow.
const backdrop=mesh(new THREE.PlaneGeometry(200,200),'#f1e9d8',[0,-.42,0]);
backdrop.rotation.x=-Math.PI/2; backdrop.castShadow=false;

// The back window is built in layers, with a bright sky and chunky wooden mullions.
const windowGroup=new THREE.Group(); windowGroup.name='sunlit-window'; windowGroup.position.set(2.45,2.65,-3.65); room.add(windowGroup);
block('#b69b72',[0,0,0],[2.60,1.88,.17],windowGroup);
block('#d3e3ce',[0,0,.095],[2.33,1.62,.03],windowGroup);
ell('#f8e8af',[.62,.35,.13],[.24,.24,.017],windowGroup);
// Tiny hills beyond the window keep it part of the same island.
ell('#afc89d',[-.62,-.70,.14],[.86,.45,.025],windowGroup);
ell('#bed4aa',[.65,-.75,.15],[.91,.40,.025],windowGroup);
for(const x of[-1.23,0,1.23]) block('#f4e7c8',[x,0,.17],[.10,1.87,.12],windowGroup);
for(const y of[-.88,0,.88]) block('#f4e7c8',[0,y,.17],[2.55,.10,.12],windowGroup);
block('#d7b27e',[0,-1.01,.23],[2.89,.17,.42],windowGroup);
rod('#ab8961',[-1.61,1.08,.12],[1.61,1.08,.12],.055,windowGroup);
for(const side of[-1,1]) {
  for(let fold=0;fold<4;fold++) {
    const curtain=block(fold%2?'#d5b392':'#dfbf9b',[side*(1.32+fold*.083),-.06,.25],[.13,1.88,.16],windowGroup);
    curtain.rotation.z=side*-.045;
  }
  block('#c3956f',[side*1.46,-.39,.36],[.38,.09,.04],windowGroup);
}

// Rounded rug with a woven-looking border and actual fringe geometry.
const rug=new THREE.Group(); rug.name='sage-woven-rug'; rug.position.set(-.95,.061,.14); rug.rotation.y=-.055; room.add(rug);
slab('#e8dbc0',[0,0,0],4.45,2.85,.035,.22,rug);
slab('#a7b99a',[0,.037,0],4.21,2.62,.009,.17,rug);
slab('#bdcbae',[0,.047,0],3.68,2.10,.004,.12,rug);
for(const side of[-1,1]) {
  for(let i=0;i<17;i++) rod('#e8d9b9',[side*2.15,.025,-1.13+i*.14],[side*2.36,.025,-1.13+i*.14],.018,rug);
  block('#dde1c5',[side*1.69,.055,0],[.065,.006,1.88],rug);
}

// A low bookcase: wide shelves, little drawers, and a space waiting for BOOK.
const shelf=new THREE.Group(); shelf.name='wooden-bookshelf'; shelf.position.set(-3.45,0,-2.94); room.add(shelf);
block('#c19461',[0,1.27,-.32],[2.45,2.54,.12],shelf);
for(const x of[-1.18,1.18]) block('#be8f5e',[x,1.33,0],[.16,2.65,.84],shelf);
for(const y of[.21,1.00,1.79,2.65]) slab(y===2.65?'#d3ad76':'#d1a671',[0,y,-.01],2.58,.98,.13,.065,shelf);
for(const x of[-.61,.61]) {
  block('#d1aa78',[x,.57,.06],[1.04,.60,.72],shelf);
  block('#bd935f',[x,.59,.433],[.33,.11,.022],shelf);
  ell('#8f764f',[x,.59,.454],[.05,.037,.02],shelf);
}
const bookColors=['#95a686','#d6a066','#b6bbc0','#c38165','#e4c27e'];
for(let i=0;i<6;i++) {
  const book=block(bookColors[i%5],[-.94+i*.24,1.38,.09],[.19,.56+(i%3)*.045,.47],shelf);
  book.rotation.z=i===5?-.12:0;
  block('#ece1bf',[-.94+i*.24,1.52,.333],[.14,.022,.006],shelf);
}
for(let i=0;i<3;i++) block(bookColors[(i+2)%5],[-.63,2.00+i*.115,.06],[.78,.09,.43],shelf);
// A miniature framed island, and a squat storage jar on the top shelf.
block('#b8966d',[.55,2.22,.03],[.65,.64,.09],shelf);
block('#f5e9cf',[.55,2.22,.084],[.54,.54,.017],shelf);
ell('#a9ba84',[.53,2.19,.103],[.19,.11,.014],shelf);
ell('#dfbf6f',[.69,2.35,.103],[.065,.065,.014],shelf);

// A little framed drawing and wall hooks link the other floor objects to homes.
const frame=new THREE.Group();frame.position.set(-.50,2.55,-3.68);room.add(frame);
block('#c8a16d',[0,0,0],[1.35,1.38,.10],frame);block('#fbf0d6',[0,0,.06],[1.15,1.18,.025],frame);
ell('#d1a46d',[0,-.07,.09],[.33,.30,.016],frame);ell('#d1a46d',[-.24,.19,.09],[.13,.14,.017],frame);ell('#d1a46d',[.24,.19,.09],[.13,.14,.017],frame);
ell('#f0dbb3',[0,-.15,.112],[.18,.13,.012],frame);for(const x of[-.13,.13])ell('#765d40',[x,.01,.11],[.021,.027,.009],frame);ell('#765d40',[0,-.10,.13],[.044,.031,.010],frame);
// Peg rail on the left wall, seen from inside the room.
block('#c8a474',[-4.86,2.15,.22],[.12,.20,1.8]);
for(const z of[-.35,.23,.81]){const peg=cylinder('#aa8559',[-4.70,2.15,z],.065,.065,.25,room,10);peg.rotation.z=Math.PI/2;ell('#c39b64',[-4.55,2.15,z],[.065,.095,.095]);}

// The table is deliberately low: the bear can physically lift a cup onto it.
const table=new THREE.Group(); table.name='cup-home-table'; table.position.set(2.58,0,-2.18); room.add(table);
for(const x of[-1.09,1.09]) for(const z of[-.48,.48]) {
  const leg=block('#b68a56',[x,.72,z],[.15,1.44,.15],table);leg.rotation.z=x>0?-.035:.035;
}
block('#c29964',[0,1.29,.51],[2.28,.29,.10],table);
slab('#d6af77',[0,1.48,0],2.78,1.56,.19,.18,table);
slab('#e6c796',[0,1.67,0],2.70,1.49,.027,.17,table);
// A fine sage outline around the destination, rather than an oversized UI panel.
const tableOutline=[];
for(const p of roundedShape(2.77,1.56,.19).getPoints(12)) tableOutline.push([p.x,1.714,-p.y]);
tableOutline.push(tableOutline[0]);
const destinationMaterial=new THREE.MeshBasicMaterial({color:'#e7f0ad'});
const tableDestination = new THREE.Group(); tableDestination.name='table-destination'; table.add(tableDestination);
line(destinationMaterial,tableOutline,.020,tableDestination);
cylinder('#b7bc8b',[-.35,1.714,.02],.36,.36,.022,table,36);
ring(new THREE.MeshBasicMaterial({color:'#f5f8d0'}),[-.35,1.746,.02],.33,.018,tableDestination);
// Dashed upright cup silhouette on the empty coaster clarifies the destination.
const ghostMat=new THREE.MeshBasicMaterial({color:'#f4f7d0',transparent:true,opacity:.75});
for(let i=0;i<14;i++){
  const angle=i*Math.PI*2/14;
  ell(ghostMat,[-.35+Math.cos(angle)*.20,2.08,.02+Math.sin(angle)*.20],[.018,.018,.018],tableDestination);
}
for(const side of[-1,1])for(let i=0;i<4;i++)ell(ghostMat,[-.35+side*.20,1.79+i*.075,.11],[.016,.025,.016],tableDestination);

// One small plant balances the table without confusing the four movable objects.
const plant=new THREE.Group();plant.position.set(3.29,1.73,-2.44);room.add(plant);
cylinder('#ce9775',[0,.16,0],.25,.18,.32,plant,12);cylinder('#ab795e',[0,.325,0],.226,.226,.025,plant,16);
for(let i=0;i<6;i++) {
 const a=i*Math.PI/3; const end=[Math.sin(a)*.20,.69+(i%2)*.16,Math.cos(a)*.17];
 rod('#879e60',[0,.32,0],end,.018,plant);
 const leaf=ell(i%2?'#91ad71':'#a7be82',end,[.13,.24,.08],plant);leaf.rotation.z=-Math.sin(a)*.50;
}

// A toy basket, woven from physical strips, waits for the ball.
const basket=new THREE.Group();basket.name='toy-basket';basket.position.set(3.82,.05,.13);basket.rotation.y=-.12;room.add(basket);
slab('#c69d66',[0,0,0],1.17,.98,.13,.16,basket);
for(const x of[-.51,.51])block('#c5a070',[x,.44,0],[.10,.76,.91],basket);
for(const z of[-.43,.43])block('#cfaa77',[0,.44,z],[1.1,.76,.10],basket);
for(let i=0;i<5;i++) {
 for(const z of[-.492,.492])block(i%2?'#e1bf8a':'#dbb581',[0,.17+i*.13,z],[1.11,.045,.026],basket);
 for(const x of[-.571,.571])block(i%2?'#e1bf8a':'#dbb581',[x,.17+i*.13,0],[.026,.045,.95],basket);
}
for(const z of[-.51,.51])block('#e2c390',[0,.85,z],[1.24,.10,.11],basket);
for(const x of[-.58,.58])block('#e2c390',[x,.85,0],[.11,.10,.98],basket);
block('#ad895b',[0,.60,.494],[.30,.10,.007],basket);
ell('#e8c47b',[-.19,.55,.11],[.17,.19,.17],basket);
const toy=block('#95a992',[.17,.51,-.02],[.27,.27,.27],basket);toy.rotation.y=.24;

// Four tangible movable objects. Labels are projected above these same meshes.
const objects={};
const cup=new THREE.Group();cup.name='movable-CUP';cup.position.set(1.18,.065,1.17);cup.rotation.y=.18;room.add(cup);objects.CUP=cup;
cylinder('#82a79e',[0,.27,0],.235,.19,.46,cup,24);
cylinder('#4c766e',[0,.504,0],.183,.183,.007,cup,24);
ring('#bbd4bd',[0,.51,0],.209,.031,cup);
const handle=mesh(new THREE.TorusGeometry(.135,.046,8,22),'#86a99d',[.252,.28,0],[1,1,1],cup);handle.rotation.y=Math.PI/2;
// A small ceramic glaze mark makes the cup legible at the actual viewport size.
ell('#bbd4bd',[.054,.31,.181],[.087,.11,.017],cup);
const objectHalo=new THREE.Group(); objectHalo.name='active-object-halo'; room.add(objectHalo);
cylinder(new THREE.MeshBasicMaterial({color:'#f6e1a4',transparent:true,opacity:.42}),[0,.064,0],.49,.49,.004,objectHalo,48);
ring(new THREE.MeshBasicMaterial({color:'#ffe5a0'}),[0,.079,0],.50,.025,objectHalo);

const book=new THREE.Group();book.name='movable-BOOK';book.position.set(-1.57,.13,-1.40);book.rotation.y=-.28;room.add(book);objects.BOOK=book;
slab('#bf7e63',[0,0,0],.76,.96,.045,.034,book);slab('#f6e9c7',[.025,.045,0],.69,.88,.12,.014,book);slab('#cb8d6d',[0,.164,0],.77,.97,.041,.035,book);
block('#a26750',[-.35,.12,0],[.07,.20,.94],book);block('#e9c994',[.04,.209,-.08],[.35,.005,.04],book);block('#e9c994',[.04,.209,.04],[.23,.005,.025],book);

const hat=new THREE.Group();hat.name='movable-HAT';hat.position.set(-3.42,.09,1.72);hat.rotation.y=-.25;room.add(hat);objects.HAT=hat;
cylinder('#d5b16d',[0,.039,0],.49,.49,.077,hat,24);ell('#d9b977',[0,.17,0],[.29,.26,.28],hat);cylinder('#9fa780',[0,.13,0],.293,.293,.095,hat,24);
const bow=ell('#899a72',[.30,.15,.06],[.11,.08,.045],hat);bow.rotation.z=.15;

const ball=new THREE.Group();ball.name='movable-BALL';ball.position.set(3.39,.39,2.05);room.add(ball);objects.BALL=ball;
ell('#e5b778',[0,0,0],[.34,.34,.34],ball);
for(let i=0;i<4;i++) {
  const stripe=mesh(new THREE.TorusGeometry(.337,.010,5,48),i%2?'#c48165':'#faf0c9',[0,0,0],[1,1,1],ball);
  stripe.rotation.set(.24,i*Math.PI/4,.13);
}
ell('#c58265',[0,.335,0],[.095,.017,.095],ball);

// The original island bear proportions, colors, face, and four paws are preserved.
const bear=new THREE.Group();bear.name='island-bear';bear.position.set(-.64,.075,1.42);bear.scale.setScalar(.91);bear.rotation.y=1.72;room.add(bear);
const body=new THREE.Group();body.name='bear-body';bear.add(body);
ell('#aa6b32',[0,.7,-.27],[.52,.57,.75],body);ell('#c4833c',[0,.88,-.2],[.48,.50,.62],body);ell('#b77633',[0,.92,-.91],[.16,.18,.17],body);
const legs=[];
for(const x of[-.33,.33])for(const z of[-.67,.22]){
 const leg=new THREE.Group();leg.name=z>0?'front-paw':'back-paw';leg.position.set(x,.55,z);body.add(leg);
 ell('#aa6930',[0,-.21,0],[.18,.38,.19],leg);ell('#814d25',[0,-.43,.065],[.2,.13,.25],leg);legs.push(leg);
}
const head=new THREE.Group();head.name='bear-head';head.position.set(0,1.25,.43);body.add(head);
ell('#bd7b37',[0,0,0],[.53,.54,.46],head);ell('#cb8a44',[0,.07,.12],[.46,.46,.37],head);
for(const x of[-.38,.38]){ell('#a5652f',[x,.40,-.05],[.20,.21,.13],head);ell('#7e4b2b',[x,.42,.055],[.115,.13,.06],head);}
ell('#ead3a1',[0,-.17,.42],[.28,.23,.19],head);ell('#3c3426',[0,-.06,.596],[.106,.077,.057],head);
for(const x of[-.23,.23]){ell('#342e22',[x,.08,.402],[.058,.079,.043],head);ell('#fff3d0',[x-.012,.11,.435],[.019,.024,.012],head);}
const smile=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.09,-.25,.584),new THREE.Vector3(0,-.28,.604),new THREE.Vector3(.09,-.25,.584)]),new THREE.LineBasicMaterial({color:'#745537'}));head.add(smile);
head.rotation.x=.10;


let disposed = false;
function dispose() {
  if (disposed) return;
  disposed = true;
  const geometries = new Set(), materials = new Set(), textures = new Set();
  scene.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach(value=>value.dispose()); materials.forEach(value=>value.dispose()); textures.forEach(value=>value.dispose());
  scene.clear(); palette.clear(); renderer.dispose(); renderer.domElement.remove();
}
return { scene, camera, renderer, room, bear, body, head, legs, objects, table, shelf, basket, tableDestination, objectHalo, mesh, mat, line, ring, cylinder, dispose };
}
