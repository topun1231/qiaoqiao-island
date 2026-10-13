import * as THREE from './vendor/three.module.js';
import { createStoneIsland } from './stone-island.js';
import { STONE_KEYS, HOP_SECONDS, ARRIVE_SECONDS } from './stone-game.js';

export const STONE_PATH = Object.freeze([
  [-3.67, 2.35], [-2.64, 1.59], [-1.60, 1.03], [-.53, .70],
  [.55, .69], [1.62, .95], [2.67, 1.45], [3.67, 2.05],
].map(Object.freeze));
export const STONE_TOP_Y = .332 + .105 / 2;
export const BEAR_SCALE = .65;
export const FOOTPRINT_CENTER_Z = -.16;
export const FOOT_BOTTOM_Y = -.01;
const BANK_Y = .32 + FOOT_BOTTOM_Y * BEAR_SCALE;
const READY_YAW = Math.PI / 2 - .38;
const READY_ROOT = [-4.85, .32, 2.65];
export const BANK_LANDING = Object.freeze([4.72, BANK_Y, 2.27]);
export const FLAG_DESTINATION = Object.freeze([5.42, BANK_Y, 3.32]);
const WALK_SECONDS = ARRIVE_SECONDS - HOP_SECONDS;
const clamp = x => Math.max(0, Math.min(1, x));
const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const mix = (a, b, t) => a + (b - a) * t;
const angleMix = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const READY_FEET = [READY_ROOT[0] + Math.sin(READY_YAW) * FOOTPRINT_CENTER_Z * BEAR_SCALE,
  BANK_Y, READY_ROOT[2] + Math.cos(READY_YAW) * FOOTPRINT_CENTER_Z * BEAR_SCALE];
const heading = (from, to) => Math.atan2(to[0] - from[0], to[2] - from[2]);
const positionAt = index => index ? [STONE_PATH[index - 1][0], STONE_TOP_Y, STONE_PATH[index - 1][1]] : READY_FEET;
const restingYaw = index => index ? heading(positionAt(index), index < 8 ? positionAt(index + 1) : BANK_LANDING) : READY_YAW;

// Canonical state completely determines a pose, including a restored mid-air hop.
// These coordinates describe the centre of all four paws, not the bear's offset root.
export function sampleStonePose(state) {
  const index = Math.max(0, Math.min(8, Math.trunc(state.index || 0)));
  let feet = positionAt(index).slice(), yaw = restingYaw(index), squash = 0, pitch = 0;
  let tuck = 0, gait = 0, stance = index ? .92 : 1;
  const hop = (from, to, yawFrom, yawTo, elapsed, stanceFrom, stanceTo) => {
    const t = clamp(elapsed / HOP_SECONDS);
    const air = clamp((t - .16) / .66), travel = ease(air);
    feet = from.map((value, axis) => mix(value, to[axis], travel));
    feet[1] += Math.sin(Math.PI * air) * .64;
    yaw = angleMix(yawFrom, yawTo, ease(air));
    stance = mix(stanceFrom, stanceTo, ease(air));
    if (t < .16) squash = .11 * ease(t / .16);
    else if (t < .82) squash = .11 * (1 - ease(air / .25)) + .08 * ease((air - .82) / .18);
    else squash = .08 * (1 - ease((t - .82) / .18));
    tuck = Math.sin(Math.PI * air) * .22;
    pitch = Math.sin(Math.PI * air * 2) * .035;
  };
  if (state.phase === 'hopping' && index < 8) {
    hop(positionAt(index), positionAt(index + 1), restingYaw(index), restingYaw(index + 1),
      Number(state.hopTime) || 0, index ? .92 : 1, .92);
  } else if (state.phase === 'arriving' || state.phase === 'complete') {
    const arrival = state.phase === 'complete' ? ARRIVE_SECONDS : Math.max(0, Number(state.hopTime) || 0);
    const walkYaw = heading(BANK_LANDING, FLAG_DESTINATION);
    if (arrival <= HOP_SECONDS) {
      hop(positionAt(8), BANK_LANDING, restingYaw(8), walkYaw, arrival, .92, 1);
    } else {
      const walk = clamp((arrival - HOP_SECONDS) / WALK_SECONDS), travel = ease(walk);
      feet = BANK_LANDING.map((value, axis) => mix(value, FLAG_DESTINATION[axis], travel));
      // A small walking gait has a smooth envelope and returns all paws to rest.
      gait = Math.sin(walk * Math.PI * 6) * Math.sin(walk * Math.PI) * .15;
      yaw = walkYaw; stance = 1;
    }
  }
  const bodyScaleY = 1 - squash;
  const root = [feet[0] - Math.sin(yaw) * FOOTPRINT_CENTER_Z * BEAR_SCALE,
    feet[1] - FOOT_BOTTOM_Y * BEAR_SCALE * bodyScaleY,
    feet[2] - Math.cos(yaw) * FOOTPRINT_CENTER_Z * BEAR_SCALE];
  return { root, feet, yaw, bodyScaleY, pitch, tuck, gait, stance };
}

// The controller owns the only requestAnimationFrame loop and supplies seconds.
export function createStoneWorld(container) {
  const island = createStoneIsland(container);
  const { scene, camera, renderer, bear, body, head, legs, waterMat } = island;
  const props = new THREE.Group(); props.name = 'stone-river-crossing'; scene.add(props);
  const materialCache = new Map(), textures = new Set(), drawings = [];
  const mat = color => {
    if (!materialCache.has(color)) materialCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: .94, flatShading: true }));
    return materialCache.get(color);
  };
  function mesh(geometry, color, position, scale = [1, 1, 1], parent = props) {
    const m = new THREE.Mesh(geometry, typeof color === 'string' ? mat(color) : color);
    m.position.set(...position); m.scale.set(...scale); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  }
  const sphere = new THREE.SphereGeometry(1, 14, 10), box = new THREE.BoxGeometry(1, 1, 1);
  const ell = (color, p, s, parent) => mesh(sphere, color, p, s, parent);
  const block = (color, p, s, parent) => mesh(box, color, p, s, parent);
  const cylinder = (color, p, top, bottom, height, parent = props, segments = 12) =>
    mesh(new THREE.CylinderGeometry(top, bottom, height, segments), color, p, [1, 1, 1], parent);
  function texture(draw, w = 512, h = 512) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const redraw = () => { ctx.clearRect(0, 0, w, h); draw(ctx, w, h); t.needsUpdate = true; };
    redraw(); textures.add(t); drawings.push(redraw); return t;
  }
  const letterMaps = new Map();
  for (const key of ['F', 'J']) for (const status of ['future', 'current', 'done']) {
    letterMaps.set(`${key}:${status}`, texture(ctx => {
      ctx.fillStyle = status === 'current' ? '#3f5734' : status === 'done' ? '#788952' : '#7e8b82';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 342px Arial, sans-serif';
      ctx.fillText(status === 'done' ? '✓' : key, 256, 278);
    }));
  }
  const stones = STONE_PATH.map(([x, z], i) => {
    const stone = new THREE.Group(); stone.name = `stone-${i + 1}-${STONE_KEYS[i]}`; stone.position.set(x, 0, z); props.add(stone);
    const first = i === 0, radius = first ? .65 : .57;
    const rock = cylinder(mat(first ? '#98a597' : '#8d9d97').clone(), [0, -.22, 0], radius, radius * .86, 1.06, stone, 7);
    rock.name = 'stone-volume'; rock.rotation.y = .18 + i * .37;
    const top = cylinder(mat(first ? '#f0e6b9' : '#bdc9bd').clone(), [0, .332, 0], radius * .94, radius, .105, stone, 7);
    top.name = 'stone-top'; top.rotation.y = rock.rotation.y;
    for (let j = 0; j < 3; j++) {
      const a = 2.05 + j * .35;
      ell(first ? '#98b060' : '#8ba373', [Math.cos(a) * radius * .86, .38, Math.sin(a) * radius * .86], [.12, .037, .08], stone);
    }
    const label = new THREE.Mesh(new THREE.PlaneGeometry(first ? .82 : .72, first ? .82 : .72),
      new THREE.MeshBasicMaterial({ map: letterMaps.get(`${STONE_KEYS[i]}:${first ? 'current' : 'future'}`), transparent: true,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    label.name = 'stone-key'; label.rotation.x = -Math.PI / 2; label.position.y = .394; stone.add(label);
    const points = [];
    for (let k = 0; k <= 7; k++) {
      const a = k / 7 * Math.PI * 2 + rock.rotation.y;
      points.push(new THREE.Vector3(Math.cos(a) * radius * 1.06, .42, Math.sin(a) * radius * 1.06));
    }
    const ring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0), 56, .035, 5, false),
      new THREE.MeshBasicMaterial({ color: '#fff0a4' }));
    ring.name = 'next-stone-outline'; ring.visible = first; stone.add(ring);
    const ripple = new THREE.Mesh(new THREE.TorusGeometry(radius * .93, .013, 4, 48, Math.PI * 1.35),
      new THREE.MeshBasicMaterial({ color: '#c7efe1', transparent: true, opacity: .65 }));
    ripple.rotation.set(-Math.PI / 2, 0, .15 + i * .42); ripple.position.y = -.708; stone.add(ripple);
    stone.userData.radius = radius; stone.userData.topY = STONE_TOP_Y;
    return { stone, rock, top, label, ring };
  });
  const pointerMaps = STONE_KEYS.map((_, i) => texture((ctx, w, h) => {
    ctx.fillStyle = '#fff9dc'; ctx.beginPath(); ctx.roundRect(8, 6, w - 16, h - 36, 28); ctx.fill();
    ctx.strokeStyle = '#ddcd8b'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w / 2 - 16, h - 32); ctx.lineTo(w / 2, h - 9); ctx.lineTo(w / 2 + 16, h - 32); ctx.fill();
    ctx.fillStyle = '#536442'; ctx.font = '700 30px "Noto Sans CJK SC", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`下一步 · ${i + 1}`, w / 2, 48);
  }, 256, 128));
  const pointer = new THREE.Mesh(new THREE.PlaneGeometry(1.48, .74),
    new THREE.MeshBasicMaterial({ map: pointerMaps[0], transparent: true, depthWrite: false }));
  pointer.name = 'next-step-pointer'; props.add(pointer);

// A quiet, tangible destination: picnic cloth, basket, fruit, and a small flag.
const picnic=new THREE.Group();picnic.name='right-bank-picnic-destination';picnic.position.set(6.20,.23,2.20);picnic.rotation.y=-.13;props.add(picnic);
block('#ead6ad',[0,.045,0],[2.40,.055,1.68],picnic);
for(let x=-1.0;x<=1.05;x+=.4)block('#cf9a71',[x,.076,0],[.075,.006,1.65],picnic);
for(let z=-.68;z<=.69;z+=.34)block('#cf9a71',[0,.08,z],[2.38,.005,.052],picnic);
for(const side of[-1,1])for(let j=0;j<9;j++)block('#e5cba0',[side*1.25,.041,-.65+j*.16],[.14,.028,.034],picnic);
const basket=new THREE.Group();basket.position.set(.50,.17,-.20);picnic.add(basket);
ell('#aa783c',[0,.21,0],[.45,.30,.34],basket);ell('#d2ac67',[0,.42,0],[.47,.075,.35],basket);
for(let i=0;i<4;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(.41,.026,5,22),mat(i%2?'#e0bd7a':'#bf9552'));ring.rotation.x=Math.PI/2;ring.scale.y=.75;ring.position.y=.12+i*.078;basket.add(ring);}
const handle=new THREE.Mesh(new THREE.TorusGeometry(.38,.039,6,24,Math.PI),mat('#c9a268'));handle.position.y=.43;basket.add(handle);
for(const [x,y,z]of[[-.20,.44,.02],[.08,.49,.05],[.22,.44,-.08]]){ell('#e49554',[x,y,z],[.13,.14,.13],basket);ell('#769945',[x+.05,y+.12,z],[.07,.022,.034],basket);}
const plate=cylinder('#fff2d1',[-.53,.15,.20],.30,.30,.035,picnic,24);
ell('#ce9855',[-.53,.215,.20],[.20,.09,.13],picnic);
const flagPole=[5.2,.34,2.6];
cylinder('#98784b',[flagPole[0],1.34,flagPole[2]],.047,.062,2.0);ell('#ddb96b',[flagPole[0],2.38,flagPole[2]],[.087,.087,.087]);
const flagShape=new THREE.Shape();flagShape.moveTo(0,0);flagShape.lineTo(.86,-.12);flagShape.lineTo(.68,-.43);flagShape.lineTo(0,-.39);flagShape.closePath();
const flag=mesh(new THREE.ShapeGeometry(flagShape),new THREE.MeshStandardMaterial({color:'#d98b53',roughness:1,side:THREE.DoubleSide}),[flagPole[0],2.27,flagPole[2]],[1,1,1]);flag.rotation.y=.08;
const goalMap=texture((ctx,w,h)=>{ctx.fillStyle='#fffae1';ctx.beginPath();ctx.roundRect(5,5,w-10,h-10,24);ctx.fill();ctx.fillStyle='#637149';ctx.font='700 32px "Noto Sans CJK SC", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('去对岸野餐',w/2,h/2);},256,96);
const goalLabel=new THREE.Mesh(new THREE.PlaneGeometry(2.05,.768),new THREE.MeshBasicMaterial({map:goalMap,transparent:true,depthWrite:false}));goalLabel.position.set(6.3,1.08,3.0);props.add(goalLabel);

  const legPositions = legs.map(leg => leg.position.clone());
  let disposed = false, ambientTime = 12.6, frozenState = null, frozenInput = null;
  let width = -1, height = -1, lastState = null;
  function compose() {
    if (disposed) return;
    const w = Math.max(1, container.clientWidth || 1), h = Math.max(1, container.clientHeight || 1);
    if (w !== width || h !== height) {
      width = w; height = h;
      const aspect = w / h, halfW = aspect < 1 ? 10.1 : 8.7;
      renderer.setSize(w, h); camera.left = -halfW; camera.right = halfW;
      camera.top = halfW / aspect; camera.bottom = -halfW / aspect;
      camera.position.set(0, 15.5, 23); camera.lookAt(0, .55, 1.6); camera.updateProjectionMatrix();
    }
    pointer.quaternion.copy(camera.quaternion); goalLabel.quaternion.copy(camera.quaternion);
    renderer.render(scene, camera);
  }
  function render(state = { phase: 'ready', index: 0 }, dt = 0) {
    if (disposed) return;
    if (state.paused) {
      if (!frozenState || frozenInput !== state) { frozenState = { ...state }; frozenInput = state; }
    } else { frozenState = null; frozenInput = null; }
    const frame = frozenState || state;
    lastState = frame;
    const pose = sampleStonePose(frame);
    bear.position.set(...pose.root); bear.rotation.set(0, pose.yaw, 0); bear.scale.setScalar(BEAR_SCALE);
    body.position.set(0, 0, 0); body.scale.set(1, pose.bodyScaleY, 1); body.rotation.set(pose.pitch, 0, 0);
    head.rotation.set(0, 0, 0);
    legs.forEach((leg, i) => {
      const rest = legPositions[i];
      leg.position.set(rest.x * pose.stance, rest.y, FOOTPRINT_CENTER_Z + (rest.z - FOOTPRINT_CENTER_Z) * pose.stance);
      leg.scale.set(pose.stance, 1, pose.stance);
      leg.rotation.set((i % 2 ? -1 : 1) * pose.tuck + (i === 0 || i === 3 ? 1 : -1) * pose.gait, 0, 0);
    });
    const next = Math.max(0, Math.min(8, Math.trunc(frame.index || 0)));
    stones.forEach(({ stone, rock, top, label, ring }, i) => {
      const status = i < next ? 'done' : i === next ? 'current' : 'future';
      stone.userData.status = status;
      top.material.color.set(status === 'current' ? '#f0e6b9' : status === 'done' ? '#c9cfad' : '#bdc9bd');
      rock.material.color.set(status === 'current' ? '#98a597' : status === 'done' ? '#939d89' : '#8d9d97');
      label.material.map = letterMaps.get(`${STONE_KEYS[i]}:${status}`);
      label.material.opacity = status === 'future' ? .82 : 1;
      label.userData.text = status === 'done' ? '✓' : STONE_KEYS[i]; ring.visible = i === next;
    });
    pointer.visible = next < 8;
    if (next < 8) {
      pointer.position.set(STONE_PATH[next][0] + .1, 1.48, STONE_PATH[next][1] - .12);
      pointer.material.map = pointerMaps[next]; pointer.userData.step = next + 1;
    }
    if (!frame.paused && Number.isFinite(dt)) ambientTime += Math.max(0, Math.min(.1, dt));
    waterMat.uniforms.time.value = ambientTime;
    compose();
  }
  const resize = () => compose();
  globalThis.window?.addEventListener('resize', resize);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(container);
  document.fonts?.ready.then(() => { if (!disposed) { drawings.forEach(draw => draw()); compose(); } });
  render();
  return {
    render,
    dispose() {
      if (disposed) return;
      disposed = true; globalThis.window?.removeEventListener('resize', resize); observer?.disconnect();
      island.dispose({ textures, materials: materialCache.values(), geometries: [sphere, box] }); textures.clear(); drawings.length = 0; materialCache.clear();
      frozenState = frozenInput = lastState = null;
    },
  };
}
