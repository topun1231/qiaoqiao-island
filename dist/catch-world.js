import * as THREE from './vendor/three.module.js';
import { createWorld } from './world.js';
import { createCatchGame, getCatchTarget } from './catch-game.js';

const clamp = x => Math.max(0, Math.min(1, x));
const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const CATCH_AT = .36, RELEASE_AT = .56, STORED_AT = 1.08;

// This scene shares the island renderer and its single animation loop.
export function createCatchWorld(container) {
  const world = createWorld(container);
  world.configureLevel(0, []);
  world.setProgress(8);
  world.setPaused(true);
  const { scene, camera } = world;
  world.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
  world.renderer.setSize(container.clientWidth, container.clientHeight);
  scene.traverse(o => { if (o.isDirectionalLight && o.shadow) o.shadow.mapSize.set(1024, 1024); });
  const bear = scene.getObjectByName('island-bear');
  const body = bear.children[0];
  const head = body.children.find(o => o.isGroup && o.children.length > 10);
  const legs = body.children.filter(o => o.isGroup && o.children.length === 2);
  const restLegs = legs.map(o => o.position.clone());
  // Front limbs have a fixed shoulder. Only their rotations articulate; the
  // two rear feet stay planted, with no root jump or sliding between catches.
  const shoulders = [new THREE.Vector3(-.47, .85, .20), new THREE.Vector3(.47, .85, .20)];
  const root = new THREE.Group(); root.name = 'catch-fruit-world'; scene.add(root);
  const sphere = new THREE.SphereGeometry(1, 20, 14);
  const materials = new Map();
  const material = color => {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .88 }));
    return materials.get(color);
  };
  function mesh(geometry, mat, position, scale, parent = root) {
    const m = new THREE.Mesh(geometry, typeof mat === 'string' ? material(mat) : mat);
    m.position.set(...position); m.scale.set(...scale); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  const stemGeometry = new THREE.CylinderGeometry(.075, .09, .37, 8);
  function makeApple(parent) {
    const g = new THREE.Group(); parent.add(g);
    mesh(sphere, '#ec8250', [-.24, 0, 0], [.56, .72, .63], g);
    mesh(sphere, '#ec8250', [.24, 0, 0], [.56, .72, .63], g);
    mesh(sphere, '#ec8250', [0, -.19, .015], [.68, .58, .63], g);
    const stem = mesh(stemGeometry, '#805735', [.01, .78, 0], [1, 1, 1], g); stem.rotation.z = -.15;
    const leaf = mesh(sphere, '#729b41', [.29, .85, .04], [.34, .085, .15], g); leaf.rotation.z = .35;
    return g;
  }
  const apple = makeApple(root); apple.name = 'falling-letter-fruit';
  const textures = new Map();
  function labelTexture(target) {
    const text = target.fruitLabel || 'F';
    const typed = Math.min(text.length, Math.max(0, target.typedCount || 0));
    const key = `${target.kind}:${text}:${typed}`;
    if (textures.has(key)) return textures.get(key);
    const wide = text.length > 1;
    const canvas = document.createElement('canvas'); canvas.width = wide ? 1024 : 512; canvas.height = 512;
    const ctx = canvas.getContext('2d'), cx = canvas.width / 2;
    ctx.fillStyle = '#fff6d9'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 9;
    ctx.beginPath();
    if (wide) ctx.roundRect(34, 54, canvas.width - 68, 404, 174);
    else ctx.arc(cx, 256, 206, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (target.kind === 'word') {
      ctx.font = '900 240px Arial, sans-serif';
      const widths = [...text].map(char => ctx.measureText(char).width);
      const total = widths.reduce((a, b) => a + b, 0) + (text.length - 1) * 12;
      let x = cx - total / 2;
      [...text].forEach((char, i) => {
        ctx.fillStyle = i < typed ? '#719b3d' : '#594429';
        ctx.fillText(char, x + widths[i] / 2, 259);
        if (i === typed) {
          ctx.fillStyle = '#d9ab4c'; ctx.beginPath(); ctx.roundRect(x + 3, 387, Math.max(14, widths[i] - 6), 13, 6); ctx.fill();
        }
        x += widths[i] + 12;
      });
    } else if (target.kind === 'space' || target.kind === 'backspace') {
      ctx.fillStyle = '#594429'; ctx.font = '900 176px Arial, sans-serif'; ctx.fillText(text, cx, 232);
      ctx.fillStyle = '#8b815e'; ctx.font = '700 55px Arial, sans-serif';
      ctx.fillText(target.kind === 'space' ? 'SPACE' : 'BACKSPACE', cx, 370);
    } else {
      ctx.fillStyle = '#594429'; ctx.font = '900 302px Arial, sans-serif'; ctx.fillText(text, cx, 276);
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    const result = { texture, wide, key }; textures.set(key, result); return result;
  }
  const labelMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  const label = mesh(new THREE.PlaneGeometry(1.28, 1.28), labelMaterial, [0, 0, .7], [1, 1, 1], apple);
  label.name = 'fruit-key-label'; label.castShadow = label.receiveShadow = false;
  const trails = new THREE.Group(); apple.add(trails);
  const trailMaterial = new THREE.MeshBasicMaterial({ color: '#fff9d6', transparent: true, opacity: .65 });
  for (const [x, y, length] of [[-.32, 1.31, .28], [.25, 1.54, .42]]) mesh(new THREE.CapsuleGeometry(.025, length, 4, 8), trailMaterial, [x, y, -.03], [1, 1, 1], trails);

  const basket = new THREE.Group(); basket.name = 'collected-fruit-basket'; basket.position.set(-8.7, .27, 5.25); root.add(basket);
  mesh(new THREE.CylinderGeometry(.88, .66, .66, 16), '#b8884e', [0, .34, 0], [1, 1, 1], basket);
  const rimGeometry = new THREE.TorusGeometry(.84, .075, 6, 24);
  for (let i = 0; i < 4; i++) { const ring = mesh(rimGeometry, i % 2 ? '#d6ae70' : '#c59a5e', [0, .12 + i * .17, 0], [.83 + i * .055, .83 + i * .055, 1], basket); ring.rotation.x = Math.PI / 2; }
  mesh(new THREE.TorusGeometry(.76, .065, 6, 24, Math.PI), '#c89e65', [0, .60, 0], [1, 1, 1], basket);
  const stored = [];
  for (let i = 0; i < 8; i++) {
    const f = makeApple(basket); f.name = `stored-fruit-${i}`; f.scale.setScalar(.29);
    const angle = i * 2.399, radius = i < 5 ? .48 : .26;
    f.position.set(Math.cos(angle) * radius, .69 + (i < 5 ? 0 : .29), Math.sin(angle) * radius); f.rotation.y = angle; f.visible = false; stored.push(f);
  }
  const overflowCanvas = document.createElement('canvas'); overflowCanvas.width = 256; overflowCanvas.height = 128;
  const overflowTexture = new THREE.CanvasTexture(overflowCanvas); overflowTexture.colorSpace = THREE.SRGBColorSpace;
  const overflowMaterial = new THREE.MeshBasicMaterial({ map: overflowTexture, transparent: true, depthWrite: false });
  const overflow = mesh(new THREE.PlaneGeometry(.76, .38), overflowMaterial, [0, .48, .91], [1, 1, 1], basket);
  overflow.name = 'basket-overflow-count'; overflow.castShadow = overflow.receiveShadow = false; overflow.visible = false;
  let lastOverflow = -1;
  const burst = [], particleGeometry = new THREE.IcosahedronGeometry(.06, 0);
  for (let i = 0; i < 10; i++) {
    const m = mesh(particleGeometry, i % 3 === 0 ? '#fff6c5' : i % 3 === 1 ? '#ecc66b' : '#b8d677', [0, 0, 0], [1, 1, 1]); m.visible = false; m.castShadow = false;
    burst.push({ mesh: m, x: Math.cos(i * 2.399), y: .3 + (i % 5) * .18, z: Math.sin(i * 2.399) * .45 });
  }
  const cameraTarget = new THREE.Vector3(-6.05, 1.9, 1.5);
  const facing = new THREE.Vector3(), start = new THREE.Vector3(), hand = new THREE.Vector3(), release = new THREE.Vector3();
  const catchPoint = new THREE.Vector3(), basketPoint = new THREE.Vector3(-8.7, 1.15, 5.25);
  const pawOffset = new THREE.Vector3(0, -.43, .11), fruitOnPaw = new THREE.Vector3(.05, .16, .48);
  const temporaryRotation = new THREE.Euler(), offsets = [0, .18, -.14, .12, -.2, .08, -.05, .16];
  let width = 0, height = 0, disposed = false, clock = 0, lastPhase = '', lastFruit = '', scenePaused = false;
  // Freeze the shared world's ambient animation as well as the lesson pose.
  const ambientObjects = [], waterUniforms = [];
  scene.traverse(o => {
    if (o.material?.isShaderMaterial && o.material.uniforms.time) waterUniforms.push({ uniform: o.material.uniforms.time, value: o.material.uniforms.time.value });
    if ((o.geometry?.type === 'TorusGeometry' && o.material?.transparent && o.parent === scene) || (o.isMesh && o.scale.x === .028)) {
      ambientObjects.push({ object: o, position: o.position.clone(), rotation: o.quaternion.clone(), opacity: o.material.opacity });
    }
  });
  const originalRender = world.renderer.render.bind(world.renderer);
  world.renderer.render = (renderScene, renderCamera) => {
    for (const item of waterUniforms) { if (scenePaused) item.uniform.value = item.value; else item.value = item.uniform.value; }
    for (const item of ambientObjects) {
      const o = item.object;
      if (scenePaused) { o.position.copy(item.position); o.quaternion.copy(item.rotation); o.material.opacity = item.opacity; }
      else { item.position.copy(o.position); item.rotation.copy(o.quaternion); item.opacity = o.material.opacity; }
    }
    originalRender(renderScene, renderCamera);
  };
  let hasReceivedState = false;
  let frozen = createCatchGame();
  function compose() {
    width = container.clientWidth; height = container.clientHeight;
    const aspect = Math.max(width, 1) / Math.max(height, 1), halfW = aspect < 1 ? 5.4 : 8.15;
    camera.left = -halfW; camera.right = halfW; camera.top = halfW / aspect; camera.bottom = -halfW / aspect;
    camera.position.set(-6.05, 12, 22); camera.lookAt(cameraTarget); camera.updateProjectionMatrix();
    facing.copy(camera.position).sub(cameraTarget).normalize(); label.position.copy(facing).multiplyScalar(.72); label.quaternion.copy(camera.quaternion);
    overflow.quaternion.copy(camera.quaternion);
  }
  window.addEventListener('resize', compose); compose();
  function armPose(time, lane) {
    const reach = ease(time / .33) * (1 - ease((time - .61) / .62));
    temporaryRotation.set(-.18 - .86 * reach, 0, .15 + (.22 + lane * .35) * reach);
    return temporaryRotation;
  }
  function gripAt(time, lane, out) {
    return out.copy(pawOffset).applyEuler(armPose(time, lane)).add(shoulders[1]).applyMatrix4(body.matrixWorld).add(fruitOnPaw);
  }
  function restingFruit(state, target, out) {
    const lane = offsets[target.fruitIndex % offsets.length] || 0;
    const progress = target.stationary || state.phase === 'intro' || state.phase === 'ready' ? 0 : ease(state.fall || 0);
    return out.set(-5.26 + lane, THREE.MathUtils.lerp(5.3, .95, progress), THREE.MathUtils.lerp(3.05, 5.65, progress));
  }
  function render(state, dt = 0) {
    if (disposed) return;
    const firstActualState = !hasReceivedState;
    scenePaused = !!state.paused;
    if (width !== container.clientWidth || height !== container.clientHeight) compose();
    if (!state.paused || !hasReceivedState) {
      frozen = { ...state };
      if (!state.paused) clock += Math.min(Math.max(dt, 0), .05);
      hasReceivedState = true;
    }
    const s = frozen, target = getCatchTarget(s);
    const index = Math.max(0, target.fruitIndex || 0), fruitId = `${s.levelId || 1}:${index}`;
    const catching = s.phase === 'catching', t = Math.max(0, s.catchTime || 0), lane = offsets[index % offsets.length] || 0;
    if (catching && (firstActualState || lastPhase !== 'catching' || fruitId !== lastFruit)) {
      if (firstActualState || fruitId !== lastFruit) restingFruit(s, target, start);
      else start.copy(apple.position);
    }
    // The root and planted feet never leave the grass. A brief head turn and one
    // short paw reach follow the fruit, then all joints ease back to the same rest.
    bear.position.set(-6.65, .32, 3.2); bear.scale.setScalar(2.1); bear.rotation.set(0, .19, 0);
    body.position.set(0, 0, 0); body.rotation.set(0, 0, 0);
    head.rotation.set(-.14, .025, -.035);
    for (let i = 0; i < legs.length; i++) { legs[i].position.copy(restLegs[i]); legs[i].rotation.set(0, 0, 0); }
    legs[1].position.copy(shoulders[0]); legs[1].rotation.set(-.18, 0, -.15);
    legs[3].position.copy(shoulders[1]); legs[3].rotation.set(-.18, 0, .15);
    if (catching) {
      const reach = ease(t / .33) * (1 - ease((t - .61) / .62));
      legs[3].rotation.copy(armPose(t, lane));
      head.rotation.y += .08 * reach;
      head.rotation.x += .06 * reach;
      head.rotation.z -= .025 * reach;
    } else if (s.phase === 'complete') {
      head.rotation.z += Math.sin(clock * 2.5) * .018;
    }
    bear.updateMatrixWorld(true);
    apple.visible = s.phase !== 'complete' && index < target.fruitTotal && !!target.fruitLabel;
    apple.scale.setScalar(.86); apple.rotation.set(0, 0, 0);
    if (catching) {
      gripAt(t, lane, hand);
      apple.position.copy(start).lerp(hand, ease(t / CATCH_AT));
      gripAt(CATCH_AT, lane, catchPoint);
      if (t >= RELEASE_AT) {
        gripAt(RELEASE_AT, lane, release);
        const u = ease((t - RELEASE_AT) / (STORED_AT - RELEASE_AT)), v = 1 - u;
        // An underhand arc passes in front of the bear, never through its torso.
        apple.position.set(
          v * v * v * release.x + 3 * v * v * u * (release.x - .35) + 3 * v * u * u * -7.9 + u * u * u * basketPoint.x,
          v * v * v * release.y + 3 * v * v * u * 2.7 + 3 * v * u * u * 2.5 + u * u * u * basketPoint.y,
          v * v * v * release.z + 3 * v * v * u * 6.3 + 3 * v * u * u * 6.5 + u * u * u * basketPoint.z
        );
        apple.scale.setScalar(THREE.MathUtils.lerp(.86, .29, u));
      }
      if (t >= STORED_AT) apple.visible = false;
      label.visible = t < .8; trails.visible = false;
    } else {
      restingFruit(s, target, apple.position);
      label.visible = true;
      trails.visible = !target.stationary && ['falling', 'intro', 'ready'].includes(s.phase);
    }
    const badge = labelTexture(target);
    if (labelMaterial.map !== badge.texture) { labelMaterial.map = badge.texture; labelMaterial.needsUpdate = true; }
    label.scale.set(badge.wide ? 1.62 : 1, badge.wide ? .87 : 1, 1);
    label.userData = { text: target.fruitLabel, typedPrefix: target.typedPrefix, typedCount: target.typedCount, fruitIndex: index };
    const count = s.phase === 'complete' ? target.fruitTotal : index + (catching && t >= STORED_AT ? 1 : 0);
    basket.userData.count = count;
    for (let i = 0; i < 8; i++) stored[i].visible = i < count;
    const extra = Math.max(0, count - 8);
    overflow.visible = extra > 0;
    if (extra !== lastOverflow) {
      const ctx = overflowCanvas.getContext('2d'); ctx.clearRect(0, 0, 256, 128);
      ctx.fillStyle = '#fff2cf'; ctx.beginPath(); ctx.roundRect(5, 6, 246, 116, 40); ctx.fill();
      ctx.fillStyle = '#79592e'; ctx.font = '800 83px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`+${extra}`, 128, 71);
      overflowTexture.needsUpdate = true; lastOverflow = extra;
    }
    const burstAge = t - CATCH_AT;
    for (const p of burst) {
      p.mesh.visible = catching && burstAge >= 0 && burstAge < .36;
      if (p.mesh.visible) {
        const u = burstAge / .36;
        p.mesh.position.set(catchPoint.x + p.x * u * .8, catchPoint.y + p.y * u - u * u * .4, catchPoint.z + p.z * u);
        p.mesh.scale.setScalar((1 - u) * 1.1); p.mesh.rotation.set(u * 5, p.x * 4, u * 3);
      }
    }
    lastPhase = s.phase; lastFruit = fruitId;
  }
  function setCompleted(completed = []) {
    world.configureLevel(0, completed);
    world.setProgress(8);
    world.setPaused(true);
    if (hasReceivedState) render(frozen, 0);
  }
  render(frozen, 0);
  hasReceivedState = false;
  return { render, setProgress: setCompleted, setCompleted, dispose() {
    if (disposed) return; disposed = true;
    window.removeEventListener('resize', compose);
    for (const { texture } of textures.values()) texture.dispose();
    overflowTexture.dispose();
    world.dispose();
  } };
}
