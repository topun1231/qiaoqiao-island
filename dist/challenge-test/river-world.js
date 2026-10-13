import * as THREE from '../vendor/three.module.js';
import { createCozyIsland } from './cozy-island.js';
import { createCozyProps, clamp, ease, lerp } from './cozy-props.js';

export const RIVER_TOP_Y = .3845;
export const RIVER_BEAR_SCALE = .85;
export const RIVER_STONE_RADIUS = .87;
export const FOOT_CENTER_Z = -.16;
export const FOOT_BOTTOM_Y = -.01;
export const RIVER_PATHS = Object.freeze({
  sl: { sequence: 'SL', start: [-5.15, .30, 2.4], end: [5.15, .30, 2.4], stones: [[-1.65, 2.4], [1.65, 2.4]] },
  fjsl: { sequence: 'FJSL', start: [5.15, .30, 2.4], end: [-5.15, .30, 2.4], stones: [[2.7, 2.1], [.91, 1.75], [-.91, 1.75], [-2.7, 2.1]] },
  agh: { sequence: 'AGH', start: [-5.15, .30, 2.4], end: [5.15, .30, 2.4], stones: [[-2.55, .30], [0, -.15], [2.55, .30]] },
  hag: { sequence: 'HAG', start: [-5.15, .30, 2.4], end: [5.15, .30, 2.4], stones: [[-2.55, 4.4], [0, 4.85], [2.55, 4.4]] },
});
const heading = (from, to) => Math.atan2(to[0] - from[0], to[2] - from[2]);
const angleMix = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const stonePoint = (path, index) => index <= 0 ? path.start.slice() : index > path.stones.length ? path.end.slice() : [path.stones[index - 1][0], RIVER_TOP_Y, path.stones[index - 1][1]];

// The learned keys change between bounded rounds; geometry follows the current
// task instead of interpreting a route ID as a literal letter sequence.
export function getRiverPaths(state = {}) {
  const level = state.level === 4 ? 4 : 3;
  if (!state.tasks?.length) return RIVER_PATHS;
  const segment = Number(state.action?.segment ?? state.segment ?? 0);
  const shape = (sequence, section, lane = null) => {
    const reverse = section % 2 === 1, direction = reverse ? -1 : 1, n = sequence.length;
    const points = Array.from({ length: n }, (_, i) => {
      const t = n <= 1 ? .5 : i / (n - 1), x = n === 2 ? -1.65 + t * 3.30 : -2.70 + t * 5.40;
      const z = lane === null ? n === 2 ? 2.4 : 2.10 - Math.sin(t * Math.PI) * .40 : lane === 0 ? .30 - Math.sin(t * Math.PI) * .45 : 4.4 + Math.sin(t * Math.PI) * .45;
      return [x * direction, z];
    });
    return { sequence, start: [-5.15 * direction, .30, 2.4], end: [5.15 * direction, .30, 2.4], stones: points, segment: section };
  };
  if (level === 3) return Object.fromEntries(state.tasks.map((task, index) => [task.id || `river-${index + 1}`, shape(task.sequence, index)]));
  return Object.fromEntries(state.tasks.map((task, index) => {
    const segments = task.segmentSequences || [task.sequence];
    const current = Math.min(segment, segments.length - 1);
    return [task.id, { ...shape(segments[current], current, index), segments, fullSequence: task.sequence }];
  }));
}

// v4 routes can contain 24 letters, but only the current 2–4 stones are
// actionable. Keep both route choices legible instead of shrinking all future
// segments into one board. Earlier saved games retain their original labels.
export function riverRouteLabel(state, path, lane = 0) {
  if (state.version >= 4) return `${lane === 0 ? '上路' : '下路'}·${path.sequence}`;
  return path.segments ? path.segments.map(text => text.toLowerCase().split('').join(' ')).join(' → ') : path.sequence.toLowerCase().split('').join('  ');
}

export function getRiverFrame(state = {}) {
  const action = state.action?.type === 'jump' ? state.action : null;
  const level = state.level === 4 ? 4 : 3;
  const segment = Number(action?.segment ?? state.segment ?? 0), paths = getRiverPaths(state);
  const legacyRoute = level === 4 ? String(action?.route || state.route || 'agh').toLowerCase() : segment === 1 ? 'fjsl' : 'sl';
  const route = state.tasks?.length ? level === 4 ? action?.route || state.route || state.tasks[0].id : state.tasks[segment]?.id || Object.keys(paths).at(-1) : legacyRoute;
  const path = paths[route] || paths[Object.keys(paths)[0]];
  const index = Math.max(0, Math.min(path.stones.length, Number(action?.segmentIndex ?? state.segmentIndex ?? (level === 4 ? action?.from ?? state.index ?? state.step ?? 0 : 0))));
  let nextPath = null;
  if (level === 3) nextPath = state.tasks?.length ? paths[state.tasks[segment + 1]?.id] : segment === 0 ? RIVER_PATHS.fjsl : null;
  else if (path.segments?.[segment + 1]) nextPath = getRiverPaths({ ...state, action: null, segment: segment + 1 })[route];
  return { action, level, segment, route, paths, path, nextPath, index, choosing: level === 4 && !state.route && !action, complete: state.phase === 'complete' || state.phase === 'stage-ready' || !!state.stageReady };
}

/** Samples foot-centred motion. A final keyed hop is followed by a short
 * automatic hop onto the bank, retaining a continuous segment transition. */
export function sampleRiverPose(state = {}) {
  const frame = getRiverFrame(state), { path, index, action } = frame;
  const atBank = frame.complete || index >= path.stones.length;
  let feet = atBank ? path.end.slice() : stonePoint(path, index);
  let yaw = frame.choosing ? Math.PI / 2 : atBank ? heading(stonePoint(path, path.stones.length), path.end) : heading(feet, stonePoint(path, index + 1));
  let bodyScaleY = 1, tuck = 0, pitch = 0;
  if (action) {
    const last = index === path.stones.length - 1;
    let u = clamp(action.elapsed / action.duration), from = stonePoint(path, index), to = stonePoint(path, index + 1);
    let previousYaw = frame.level === 4 && frame.segment === 0 && index === 0 ? Math.PI / 2 : heading(from, to), targetYaw = heading(to, last ? path.end : stonePoint(path, index + 2));
    if (last) {
      if (u <= .62) u /= .62;
      else {
        u = (u - .62) / .38; from = to; to = path.end.slice(); previousYaw = targetYaw;
        targetYaw = frame.nextPath ? heading(frame.nextPath.start, stonePoint(frame.nextPath, 1)) : heading(from, to);
      }
    }
    const air = clamp((u - .14) / .70), travel = ease(air), distance = Math.hypot(to[0] - from[0], to[2] - from[2]);
    feet = from.map((v, i) => lerp(v, to[i], travel));
    feet[1] += Math.sin(Math.PI * air) * Math.min(1.1, .5 + distance * .15);
    yaw = angleMix(previousYaw, targetYaw, ease(air));
    const squash = u < .14 ? .10 * ease(u / .14) : u > .84 ? .075 * (1 - ease((u - .84) / .16)) : .10 * (1 - ease(air / .18));
    bodyScaleY = 1 - squash; tuck = Math.sin(Math.PI * air) * .21; pitch = Math.sin(Math.PI * air * 2) * .035;
  }
  const root = [feet[0] - Math.sin(yaw) * FOOT_CENTER_Z * RIVER_BEAR_SCALE,
    feet[1] - FOOT_BOTTOM_Y * RIVER_BEAR_SCALE * bodyScaleY,
    feet[2] - Math.cos(yaw) * FOOT_CENTER_Z * RIVER_BEAR_SCALE];
  return { ...frame, root, feet, yaw, bodyScaleY, tuck, pitch, stance: .94 };
}

export function createRiverWorld(container) {
  const island = createCozyIsland(container, 'river');
  const { scene, camera, renderer, bear, body, head, legs, waterMat } = island;
  const p = createCozyProps(scene, camera), { root, mesh, ell, block, cylinder } = p;
  root.name = 'preview-river';
  const stoneSets = new Map(), restLegs = legs.map(leg => leg.position.clone());
  function createStone(route, key, point, index) {
    const g = new THREE.Group(); g.position.set(point[0], 0, point[1]); g.name = `river-${route}-stone-${index + 1}`; root.add(g);
    const radius = RIVER_STONE_RADIUS, angle = .18 + index * .37;
    const rock = cylinder(p.mat('#8d9d97').clone(), [0, -.22, 0], radius, radius * .87, 1.06, g, 7); rock.rotation.y = angle;
    const top = cylinder(p.mat('#bdc9bd').clone(), [0, .332, 0], radius * .94, radius, .105, g, 7); top.rotation.y = angle;
    const moss = [];
    for (let j = 0; j < 3; j++) { const a = 2.05 + j * .4; moss.push(ell(p.mat('#8ba373').clone(), [Math.cos(a) * radius * .85, .394, Math.sin(a) * radius * .85], [.12, .031, .09], g)); }
    const label = mesh(new THREE.PlaneGeometry(.98, .98), new THREE.MeshBasicMaterial({ map: p.textMap(key, 'stone'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), [0, .400, 0], [1, 1, 1], g);
    label.rotation.x = -Math.PI / 2; label.castShadow = label.receiveShadow = false; label.name = `river-key-${key}`;
    label.userData.text = key;
    const ring = mesh(new THREE.TorusGeometry(radius * 1.02, .029, 5, 42), new THREE.MeshBasicMaterial({ color: '#fff1a8', transparent: true }), [0, .404, 0], [1, 1, 1], g); ring.rotation.x = -Math.PI / 2; ring.visible = false;
    ring.castShadow = ring.receiveShadow = false; g.userData = { route, key, index, radius, topY: RIVER_TOP_Y };
    return { g, rock, top, moss, label, ring };
  }
  for (const [route, path] of Object.entries(RIVER_PATHS)) stoneSets.set(route, [...path.sequence].map((key, i) => createStone(route, key, path.stones[i], i)));
  const routeLabels = {
    agh: p.label('a  g  h', [-5.30, 1.0, -.42], 2.90, .69),
    hag: p.label('h  a  g', [-5.30, 1.0, 5.65], 2.90, .69),
  };
  Object.entries(routeLabels).forEach(([key, label]) => { label.name = `river-route-preview-${key}`; label.userData.route = key; });
  const sectionBoard = p.label('路线 1 · s  l', [-5.50, 1.28, .05], 2.75, .75);
  sectionBoard.name = 'river-full-sequence';
  const pointer = p.label('下一块', [0, 1.4, 0], 1.2, .49, root, 'active'); pointer.name = 'river-next-stone';
  // Same destination for both level-4 routes: no forest clue, wrong branch, or hidden rule.
  const picnic = new THREE.Group(); picnic.position.set(6.20, .22, 3.3); picnic.rotation.y = -.12; root.add(picnic);
  block('#ead6ad', [0, .045, 0], [2.2, .055, 1.6], picnic);
  for (let x = -.9; x <= 1; x += .4) block('#cf9a71', [x, .077, 0], [.07, .007, 1.6], picnic);
  for (let z = -.6; z <= .7; z += .33) block('#cf9a71', [0, .08, z], [2.2, .006, .055], picnic);
  const basket = p.basket([6.65, .30, 3.18], .58);
  for (let i = 0; i < 3; i++) { const f = p.fruit(i % 2 ? 'D' : 'F', basket); f.scale.setScalar(.36); f.position.set((i - 1) * .3, .8, .13 * Math.sin(i * 2.3)); }
  const flag = new THREE.Group(); flag.position.set(5.48, .3, 1.0); root.add(flag);
  cylinder('#98784b', [0, .91, 0], .047, .062, 1.82, flag); ell('#ddb96b', [0, 1.86, 0], [.083, .083, .083], flag);
  const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(.82, -.08); shape.lineTo(.62, -.42); shape.lineTo(0, -.36); shape.closePath();
  mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: '#d98b53', roughness: 1, side: THREE.DoubleSide }), [0, 1.73, 0], [1,1,1], flag);
  const goalLabel = p.label('到岸边啦', [6.18, .45, 5.2], 2.05, .57); goalLabel.visible = false;
  for(const sign of [sectionBoard,pointer,goalLabel,...Object.values(routeLabels)]){sign.material.depthTest=false;sign.renderOrder=40;}
  let disposed = false, width = 0, height = 0;
  function compose() {
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    if (w !== width || h !== height) {
      width = w; height = h; renderer.setSize(w, h);
      const aspect = w / h, halfW = Math.max(8.35, aspect * 4.25);
      camera.left = -halfW; camera.right = halfW; camera.top = halfW / aspect; camera.bottom = -halfW / aspect;
      camera.position.set(0, 16, 24); camera.lookAt(0, .5, 1.9); camera.updateProjectionMatrix();
    }
    p.billboard(); renderer.render(scene, camera);
  }
  function update(state = {}, dt = 0) {
    if (disposed) return;
    const pose = sampleRiverPose(state), { action, paths, path, index, level, route, choosing } = pose;
    const independent = state.version >= 4 && state.lessonStageIndex > 0 && !state.hintRequested;
    // Reuse existing meshes where possible and hide paths from earlier rounds.
    for (const [id, definition] of Object.entries(paths)) {
      if (!stoneSets.has(id)) stoneSets.set(id, []);
      const stones = stoneSets.get(id);
      [...definition.sequence].forEach((key, i) => {
        if (!stones[i]) stones[i] = createStone(id, key, definition.stones[i], i);
        const stone = stones[i]; stone.g.position.set(definition.stones[i][0], 0, definition.stones[i][1]);
        if (stone.label.userData.text !== key) { stone.label.material.map = p.textMap(key, 'stone'); stone.label.userData.text = key; stone.label.name = `river-key-${key}`; }
        stone.g.userData.key = key;
      });
    }
    bear.position.set(...pose.root); bear.rotation.set(0, pose.yaw, 0); bear.scale.setScalar(RIVER_BEAR_SCALE);
    body.position.set(0, 0, 0); body.rotation.set(pose.pitch, 0, 0); body.scale.set(1, pose.bodyScaleY, 1); head.rotation.set(0, 0, 0);
    legs.forEach((leg, i) => {
      const rest = restLegs[i]; leg.position.set(rest.x * pose.stance, rest.y, FOOT_CENTER_Z + (rest.z - FOOT_CENTER_Z) * pose.stance);
      leg.scale.set(pose.stance, 1, pose.stance); leg.rotation.set((i % 2 ? -1 : 1) * pose.tuck, 0, 0);
    });
    const u = action ? clamp(action.elapsed / action.duration) : 0;
    for (const [r, stones] of stoneSets) {
      const definition = paths[r];
      const show = !!definition && (level === 4 ? state.tasks?.length ? state.tasks.some(task => task.id === r) : r === 'agh' || r === 'hag' : r === route);
      const activeRoute = r === route;
      const dim = level === 4 && !choosing && !activeRoute;
      stones.forEach(({ g, rock, top, moss, label, ring }, i) => {
        g.visible = show && i < (definition?.stones.length || 0);
        const done = activeRoute && (i < index || pose.complete || (action && i === index && u > (index === path.stones.length - 1 ? .53 : .85)));
        const current = !independent && !pose.complete && (choosing ? i === 0 : activeRoute && i === index);
        top.material.color.set(done ? '#c7cfaa' : current ? '#f0e6b9' : '#bdc9bd');
        rock.material.color.set(current ? '#98a597' : '#8d9d97');
        for (const m of [rock, top, ...moss]) { m.material.transparent = dim; m.material.opacity = dim ? .24 : 1; m.material.depthWrite = !dim; }
        label.material.opacity = dim ? .25 : done ? .58 : 1;
        // Keep each original key readable after landing; never replace the route with stale F/J.
        ring.visible = current && !action; g.userData.status = done ? 'done' : current ? 'current' : dim ? 'other-route' : 'future';
      });
    }
    Object.values(routeLabels).forEach((label, lane) => {
      const r = level === 4 ? state.tasks?.[lane]?.id || ['agh', 'hag'][lane] : null;
      const choicePath = paths[r];
      label.visible = level === 4 && !!choicePath;
      if (!choicePath) return;
      const display = riverRouteLabel(state, choicePath, lane);
      p.setLabel(label, display, choosing || route === r ? 'active' : 'muted');
      label.position.x = choicePath.start[0] < 0 ? -5.30 : 5.30;
      label.material.opacity = choosing || route === r ? 1 : .45; label.userData.route = r;
    });
    sectionBoard.visible = level === 3;
    if (level === 3) {
      p.setLabel(sectionBoard, `路线 ${pose.segment + 1} · ${path.sequence.toLowerCase().split('').join(' ')}`);
      sectionBoard.position.set(path.start[0] > 0 ? 5.55 : -5.5, 1.28, .05);
    }
    pointer.visible = !independent && !choosing && !pose.complete && !action && index < path.stones.length;
    if (pointer.visible) { const point = path.stones[index]; pointer.position.set(point[0], 1.45, point[1] - .12); pointer.userData.key = path.sequence[index]; }
    goalLabel.visible = pose.complete; goalLabel.position.x = path.end[0] < 0 ? -6.15 : 6.18;
    root.userData.route = choosing ? null : route; root.userData.index = index; root.userData.level = level; root.userData.feet = pose.feet.slice();
    waterMat.uniforms.time.value = 12.6 + Number(state.time || 0); compose();
  }
  const resize = () => { if (!disposed) compose(); };
  globalThis.window?.addEventListener('resize', resize);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null; observer?.observe(container);
  document.fonts?.ready.then(() => { if (!disposed) { p.drawings.forEach(draw => draw()); compose(); } });
  return { update, destroy() {
    if (disposed) return; disposed = true; globalThis.window?.removeEventListener('resize', resize); observer?.disconnect();
    island.dispose({ textures: p.textures.values(), materials: p.materials.values(), geometries: p.geometries });
  } };
}
