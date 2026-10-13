import * as THREE from '../vendor/three.module.js';
import { createCozyIsland } from './cozy-island.js';
import { createCozyProps, clamp, ease, lerp } from './cozy-props.js';

const LEFT = -10.65, RIGHT = -6.25, FRUIT_Z = 2.35;
// Keep the basket between the two landing lanes, never in front of a waiting key.
const BASKET = [-8.45, .25, 5.60];
const order = ['F', 'J', 'F', 'J'];
export function getOrchardPlan(state = {}) {
  const keys = state.level === 2 ? ['D', 'K'] : ['F', 'J'];
  const sequence = state.tasks?.length ? state.tasks.map(task => task.key) : state.level === 2 ? ['D', 'D', 'K'] : order;
  const required = Object.fromEntries(keys.map(key => [key, sequence.filter(k => k === key).length]));
  return { keys, sequence, required, total: sequence.length };
}
const names = { F: '苹果', J: '橙子', D: '梨', K: '桃' };

/** Waiting is safe: the fruit takes six seconds to settle, then waits forever. */
export function sampleOrchardFruit(key, age = 0, level = 1) {
  const left = key === 'F' || key === 'D';
  const t = level === 1 ? ease(Math.max(0, age) / 6) : 0;
  return [left ? LEFT : RIGHT, lerp(4.9, .82, t), lerp(FRUIT_Z, 4.0, t)];
}

export function createOrchardWorld(container) {
  const island = createCozyIsland(container, 'orchard');
  const { scene, camera, renderer, bear, body, head, legs, waterMat } = island;
  const p = createCozyProps(scene, camera), { root, mesh, ell, cylinder } = p;
  root.name = 'preview-orchard';
  const restLegs = legs.map(leg => leg.position.clone());
  const restHead = head.position.clone();
  const shoulders = [new THREE.Vector3(-.47, .85, .20), new THREE.Vector3(.47, .85, .20)];
  function tree(x) {
    const g = new THREE.Group(); g.position.set(x, 0, -.3); root.add(g);
    cylinder('#95643b', [0, 1.54, 0], .17, .29, 3.08, g);
    for (const [x, y, z, s] of [[0,3.9,0,1.25],[-.65,3.4,.15,.98],[.7,3.58,.05,.98],[0,4.65,-.16,.81]]) {
      const crown = mesh(new THREE.IcosahedronGeometry(1, 1), '#a8c955', [x, y, z], [s, s, s], g); crown.rotation.y = y;
    }
    return g;
  }
  tree(LEFT - .25); tree(RIGHT + .1);
  // The two fruit sources stay in the same place, while each choice has its own key.
  const treeLabels = [p.label('F', [LEFT, 2.52, .10], 1.15, .62), p.label('J', [RIGHT, 2.52, .10], 1.15, .62)];
  treeLabels.forEach((label, i) => { label.name = `orchard-source-key-${i}`; });
  const fruits = new Map();
  for (const key of ['F', 'J', 'D', 'K']) {
    const fruit = p.fruit(key); fruit.scale.setScalar(.8);
    const label = p.label(key, [0, .13, .64], .78, .55, fruit, 'active'); label.name = `fruit-key-${key}`;
    label.material.depthTest = false; label.renderOrder = 50;
    fruit.visible = false; fruits.set(key, { fruit, label });
  }
  const basket = p.basket(BASKET, 1.04); basket.name = 'orchard-persistent-basket';
  const orderBaskets = [-1,1].map((side,i)=>{
    const position=[BASKET[0]+side*1.65,BASKET[1],BASKET[2]];
    const group=p.basket(position,.85);group.name=`orchard-order-basket-${i}`;group.visible=false;
    const label=p.label('',[position[0],.62,7.10],2.85,.62);label.name=`orchard-order-label-${i}`;
    const contents=Array.from({length:6},(_,n)=>Object.fromEntries(['F','J','D','K'].map(k=>{
      const fruit=p.fruit(k,group);fruit.scale.setScalar(.29);fruit.visible=false;
      fruit.position.set(Math.cos(n*2.4)*.37,.70+Math.floor(n/4)*.24,Math.sin(n*2.4)*.32);
      return [k,fruit];
    })));
    label.material.depthTest=false;label.renderOrder=35;
    return {group,label,contents,position};
  });
  const divider=mesh(new THREE.BoxGeometry(.065,.55,1.08),'#ba9059',[0,.8,0],[1,1,1],basket);divider.name='orchard-basket-divider';divider.visible=false;
  const taskLabel=p.label('',[-8.45,3.85,1.2],4.5,.62);taskLabel.name='orchard-task-heading';taskLabel.visible=false;
  const pairGuide=p.label('',[-8.45,3.15,1.2],4.3,.47);pairGuide.name='orchard-balanced-guide';pairGuide.visible=false;
  for(const label of [taskLabel,pairGuide]){label.material.depthTest=false;label.renderOrder=40;}

  // Pool bounded round contents so a new shopping list never keeps old fruit.
  const stored = Array.from({ length: 12 }, (_, index) => Object.fromEntries(['F', 'J', 'D', 'K'].map(key => {
    const fruit = p.fruit(key, basket); fruit.name = `basket-fruit-${index}-${key}`; fruit.scale.setScalar(.32); fruit.visible = false;
    return [key, fruit];
  })));
  const quantityLabels = [p.label('F × 2', [LEFT, .65, 5.65], 2.3, .68), p.label('J × 2', [RIGHT, .65, 5.65], 2.3, .68)];
  quantityLabels.forEach((m, i) => { m.name = `orchard-quantity-${i}`; });
  const basketLabel = p.label('野餐篮 · 0 / 4', [BASKET[0], .55, 7.35], 2.75, .62);
  basketLabel.name = 'orchard-basket-count';
  // A little in-world string makes repeat/alternate patterns readable without
  // adding another falling fruit or changing which key can be caught now.
  const sequencePreview = new THREE.Group(); sequencePreview.name = 'orchard-sequence-preview';
  sequencePreview.position.set(-8.45, 3.65, 1.65); sequencePreview.visible = false; root.add(sequencePreview);
  const sequenceTitle = p.label('这一小串', [0, .55, 0], 1.45, .37, sequencePreview);
  sequenceTitle.name = 'orchard-sequence-title';
  const sequenceLabels = Array.from({ length: 4 }, (_, i) => {
    const label = p.label('F', [(i - 1.5) * .60, 0, 0], .51, .42, sequencePreview);
    label.name = `orchard-sequence-key-${i}`; return label;
  });
  for (const label of [sequenceTitle, ...sequenceLabels]) {
    label.material.depthTest = false; label.renderOrder = 25;
  }
  for (const label of [...treeLabels, ...quantityLabels, basketLabel]) {
    label.material.depthTest = false; label.renderOrder = 30;
  }
  // Empty fruit silhouettes convey quantities without requiring number-key input.
  const silhouettes = Array.from({ length: 9 }, (_, index) => Object.fromEntries(['D', 'K'].map(key => {
    const g = p.fruit(key); g.scale.setScalar(.24); g.visible = false;
    g.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = .22; o.material.depthWrite = false; } });
    g.name = `shopping-empty-outline-${index}-${key}`;
    return [key, g];
  })));
  const particles = [];
  for (let i = 0; i < 9; i++) {
    const m = mesh(new THREE.IcosahedronGeometry(.067, 0), i % 2 ? '#f4d48a' : '#e6eea4'); m.visible = false;
    m.castShadow = false; particles.push(m);
  }
  let disposed = false, width = 0, height = 0, lastState = null;
  const actionStart = new THREE.Vector3(), grip = new THREE.Vector3(), release = new THREE.Vector3();
  const destination = new THREE.Vector3(BASKET[0], BASKET[1] + 1.15, BASKET[2]);
  function compose() {
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    if (width !== w || height !== h) {
      width = w; height = h; renderer.setSize(w, h);
      const aspect = w / h, halfW = Math.max(6.05, aspect * 4.25);
      camera.left = -halfW; camera.right = halfW; camera.top = halfW / aspect; camera.bottom = -halfW / aspect;
      camera.position.set(-8.45, 10.5, 22); camera.lookAt(-8.45, 1.9, 2.5); camera.updateProjectionMatrix();
    }
    p.billboard(); renderer.render(scene, camera);
  }
  function pose(u, left) {
    bear.position.set(-8.45, .32, 3.75); bear.rotation.set(0, .03, 0); bear.scale.setScalar(1.58);
    body.position.set(0, 0, 0); body.scale.set(1, 1, 1); body.rotation.set(0, 0, 0);
    head.position.copy(restHead); head.rotation.set(-.12, 0, -.015);
    legs.forEach((leg, i) => { leg.position.copy(restLegs[i]); leg.rotation.set(0, 0, 0); leg.scale.set(1, 1, 1); });
    const reach = ease(u / .30) * (1 - ease((u - .56) / .40));
    for (const [i, index] of [1, 3].entries()) {
      const active = (left ? 0 : 1) === i;
      legs[index].position.copy(shoulders[i]);
      legs[index].rotation.set(-.16 - (active ? .98 * reach : .24 * reach), 0, (i ? 1 : -1) * (.14 + .20 * reach));
    }
    head.rotation.y = (left ? -.16 : .16) * reach; head.rotation.x += .08 * reach;
    body.rotation.z = (left ? .025 : -.025) * reach;
    bear.updateMatrixWorld(true);
    grip.set(left ? -.015 : .015, -.42, .27).applyMatrix4(legs[left ? 1 : 3].matrixWorld);
    grip.z += .18; grip.y += .14;
  }
  function update(state = {}, dt = 0) {
    if (disposed) return;
    lastState = state;
    const level = state.level === 2 ? 2 : 1, { keys, sequence, required, total } = getOrchardPlan(state);
    const modern=state.contentVersion===3, orders=modern?(state.orders||[]):[];
    const dual=orders.length===2, activeOrder=orders.find(o=>o.id===(state.action?.orderId||state.orderId));
    const activeIndex=Math.max(0,orders.indexOf(activeOrder));
    const selecting=dual&&state.stage==='select';
    const activeNeeds=activeOrder?.needs||required;
    const activeCounts=activeOrder?(state.orderCounts?.[activeOrder.id]||{}):(state.counts||{});
    const ordered=modern&&state.catchStyle==='orders';
    basket.visible=!dual;
    taskLabel.visible=modern&&ordered;
    pairGuide.visible=modern&&!!state.balanced;divider.visible=pairGuide.visible;
    if(taskLabel.visible)p.setLabel(taskLabel,selecting?'先选一个篮子，再按水果字母':activeOrder?.label||'按清单装水果');
    if(pairGuide.visible)p.setLabel(pairGuide,'一格梨，一格桃 · 交替装成一对');
    orderBaskets.forEach((entry,i)=>{
      const order=orders[i];entry.group.visible=dual;entry.label.visible=dual;
      if(!order||!dual)return;
      const bagCounts={...(state.orderCounts?.[order.id]||{})};
      if(state.action?.type==='catch'&&state.action.orderId===order.id&&state.action.elapsed/state.action.duration>=.86)bagCounts[state.action.key]=(bagCounts[state.action.key]||0)+1;
      const done=state.orderCompleted?.includes(order.id), active=state.orderId===order.id;
      const totalNeed=Object.values(order.needs).reduce((a,b)=>a+b,0),countNow=Object.values(bagCounts).reduce((a,b)=>a+b,0);
      p.setLabel(entry.label,`${selecting&&!done?order.key+' · ':''}${order.label} ${countNow}/${totalNeed}${done?' ✓':''}`,active||selecting&&!done?'active':done?'muted':'label');
      const filled=keys.flatMap(k=>Array(Math.max(0,Math.min(6,bagCounts[k]||0))).fill(k));
      entry.contents.forEach((slot,n)=>Object.entries(slot).forEach(([k,f])=>{f.visible=filled[n]===k;}));
      entry.group.userData.orderId=order.id;entry.group.userData.count=countNow;
    });
    const destinationPosition=dual?orderBaskets[activeIndex].position:BASKET;
    destination.set(destinationPosition[0],destinationPosition[1]+(dual?.95:1.15),destinationPosition[2]);
    const settled = state.phase === 'complete' || state.stageReady || state.phase === 'stage-ready';
    const action = state.action?.type === 'catch' ? state.action : null;
    const u = action ? clamp(action.elapsed / action.duration) : 0;
    const key = String(action?.key || state.target || sequence[state.step || 0] || 'F').toUpperCase();
    const left = key === 'F' || key === 'D'; pose(u, left);
    sequencePreview.visible = level === 1 && (modern?state.catchStyle==='chunk':state.lessonStageIndex>0) && !settled;
    // Keep each four-key string still while its highlight advances. Replacing
    // it after every catch would disguise FF/JJ pairs as a moving ticker.
    const previewStep = Math.max(0, Math.min(total - 1, Number.isInteger(state.step) ? state.step : 0));
    const previewStart = modern&&Number.isInteger(state.visibleStart)?state.visibleStart:Math.floor(previewStep / 4) * 4;
    const previewKeys = sequence.slice(previewStart, previewStart + 4);
    sequencePreview.userData.start = previewStart;
    sequenceLabels.forEach((label, i) => {
      const index = previewStart + i;
      label.visible = i < previewKeys.length;
      label.position.x = (i - (previewKeys.length - 1) / 2) * .60;
      label.userData.index = index;
      label.userData.current = index === previewStep;
      if (label.visible) p.setLabel(label, previewKeys[i], index === previewStep ? 'active' : index < previewStep ? 'muted' : 'label');
    });
    const counts = { ...(state.counts || {}) };
    if (!state.counts && level === 1) sequence.slice(0, state.step || 0).forEach(k => { counts[k] = (counts[k] || 0) + 1; });
    const caughtVisual = action && u >= .86;
    if (caughtVisual) counts[key] = (counts[key] || 0) + 1;
    const count = Object.values(counts).reduce((a, b) => a + Number(b || 0), 0);
    basket.userData.count = count; basket.userData.counts = counts;
    for (const [k, data] of fruits) {
      const active = selecting?false:ordered?keys.includes(k)&&(Number(activeCounts[k]||0)<(activeNeeds[k]||0)||action?.key===k):level === 1 ? k === key : keys.includes(k) && (Number(counts[k] || 0) < required[k] || action?.key === k);
      data.fruit.visible = !settled && active && keys.includes(k);
      const age = level === 1 && !ordered ? Number(action?.fallAge ?? state.fallAge ?? Math.max(0, (state.time || 0) - (state.fruitStartedAt || 0))) : 0;
      data.fruit.position.set(...sampleOrchardFruit(k, age, ordered?2:level)); data.fruit.rotation.set(0, 0, 0); data.fruit.scale.setScalar(.8);
      data.label.visible = true;p.setLabel(data.label,k,state.balanced&&state.target&&k!==state.target?'muted':'active');
      if (action && k === key) {
        actionStart.set(...sampleOrchardFruit(k, age, ordered?2:level));
        // Catch, briefly hold in a real paw, then toss in front of the bear to its basket.
        if (u <= .44) {
          data.fruit.position.copy(actionStart).lerp(grip, ease(u / .32));
        } else {
          pose(.44, left); release.copy(grip); pose(u, left);
          const t = ease((u - .44) / .42), v = 1 - t;
          data.fruit.position.set(v * release.x + t * destination.x,
            lerp(release.y, destination.y, t) + Math.sin(Math.PI * t) * .88,
            lerp(release.z, destination.z, t) + Math.sin(Math.PI * t) * .62);
          data.fruit.scale.setScalar(lerp(.8, .38 * 1.04, t));
        }
        data.label.visible = u < .70;
        if (caughtVisual) data.fruit.visible = false;
      }
    }
    const used = {};
    stored.forEach((slot, i) => {
      const k = sequence[i];
      if (k) used[k] = (used[k] || 0) + 1;
      for (const [fruitKey, f] of Object.entries(slot)) {
        f.visible = !dual && fruitKey === k && used[k] <= (counts[k] || 0);
        const ring = Math.floor(i / 5), a = (i % 5) * Math.PI * 2 / 5 + ring * .65;
        f.position.set(state.balanced?(fruitKey==='D'?-.25:.25):Math.cos(a)*.46,.75+ring*.29,state.balanced?((i%2)-.5)*.35:Math.sin(a)*.40); f.rotation.y = a;
      }
    });
    keys.forEach((k, i) => {
      const remaining = Math.max(0, (ordered?activeNeeds[k]||0:required[k]) - (ordered?activeCounts[k]||0:counts[k]||0));
      p.setLabel(treeLabels[i], k, (state.balanced&&state.target?k===state.target:level===1?k===key:remaining>0)&&!settled?'active':'label');
      quantityLabels[i].visible = (level===2||ordered)&&!selecting;
      p.setLabel(quantityLabels[i], remaining ? `${names[k]}还缺 ${remaining} 个` : `${names[k]}够啦 ✓`, remaining ? 'label' : 'muted');
      quantityLabels[i].userData.key = k; quantityLabels[i].userData.remaining = remaining;
    });
    const outlineUsed = {};
    silhouettes.forEach((slot, i) => {
      const k = sequence[i]; if (k) outlineUsed[k] = (outlineUsed[k] || 0) + 1;
      for (const [fruitKey, g] of Object.entries(slot)) {
        g.visible = !dual && level === 2 && fruitKey === k && outlineUsed[k] > (counts[k] || 0);
        const row = Math.floor(i / 5), column = i % 5, rowCount = Math.min(5, total - row * 5);
        g.position.set(-8.45 + (column - (rowCount - 1) / 2) * .48, .43, 6.26 + row * .45);
      }
    });
    basketLabel.visible=!dual;p.setLabel(basketLabel, `野餐篮 · ${count} / ${total}`);
    for (let i = 0; i < particles.length; i++) {
      const age = (u - .27) / .23, m = particles[i]; m.visible = !!action && age >= 0 && age < 1;
      if (m.visible) { const a = i * 2.399; m.position.copy(grip).add(new THREE.Vector3(Math.cos(a) * age * .72, age * .65, Math.sin(a) * age * .45)); m.scale.setScalar(1 - age); }
    }
    waterMat.uniforms.time.value = 12.6 + Number(state.time || 0);
    root.userData.level = level; root.userData.lessonStageIndex = state.lessonStageIndex || 0; root.userData.total = total; root.userData.actionProgress = u; root.userData.fallAge = state.fallAge || 0;
    compose();
  }
  const resize = () => { if (!disposed) compose(); };
  globalThis.window?.addEventListener('resize', resize);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null; observer?.observe(container);
  document.fonts?.ready.then(() => { if (!disposed) { p.drawings.forEach(draw => draw()); compose(); } });
  return { update, destroy() {
    if (disposed) return; disposed = true; globalThis.window?.removeEventListener('resize', resize); observer?.disconnect();
    island.dispose({ textures: p.textures.values(), materials: p.materials.values(), geometries: p.geometries }); lastState = null;
  } };
}
