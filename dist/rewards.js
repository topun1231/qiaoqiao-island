import * as THREE from './vendor/three.module.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';

// New lesson rewards are made after the original scenery has been batched.
// Each animated construction stage is itself batched by material, so flowers,
// roof shingles and fabric details do not each cost a separate draw call.
export function createRewards(scene) {
  const root = new THREE.Group();
  root.name = 'learning-rewards';
  scene.add(root);
  const palette = new Map();
  const sphere = new THREE.SphereGeometry(1, 12, 8);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const leaf = new THREE.IcosahedronGeometry(1, 1);
  const stages = [];
  const rotors = [];
  const lanterns = [];
  let active = 1, earned = new Set(), progress = 0, time = 0;
  const completedBatch = new THREE.Group();
  completedBatch.name = 'completed-reward-batch';
  root.add(completedBatch);
  const batchedOriginals = [];

  function material(color) {
    if (!palette.has(color)) palette.set(color, new THREE.MeshStandardMaterial({ color, roughness: .9 }));
    return palette.get(color);
  }
  function shape(parent, geometry, color, position, scale = [1, 1, 1]) {
    const m = new THREE.Mesh(geometry, material(color));
    m.position.set(...position);
    m.scale.set(...scale);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  const ball = (g, color, p, s) => shape(g, sphere, color, p, s);
  const block = (g, color, p, s) => shape(g, box, color, p, s);
  const cylinder = (g, color, p, top, bottom, height, segments = 12) => shape(g, new THREE.CylinderGeometry(top, bottom, height, segments), color, p);
  function bar(g, a, b, radius, color) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const m = cylinder(g, color, start.clone().add(end).multiplyScalar(.5).toArray(), radius, radius, start.distanceTo(end));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
    return m;
  }
  function group(parent, position = [0, 0, 0]) {
    const g = new THREE.Group();
    g.position.set(...position);
    parent.add(g);
    return g;
  }
  function stage(level, position, start = 0, end = 1, style = 'grow') {
    const g = group(root, position);
    g.name = `reward-${level}-stage-${stages.filter(s => s.level === level).length + 1}`;
    const s = { level, group: g, start, end, style, value: 0, target: 0, base: g.position.clone(), originalScale: g.scale.clone() };
    stages.push(s);
    return g;
  }
  function bloom(g, x, z, height, color = '#fff4cf', size = 1) {
    bar(g, [x, .02, z], [x, height, z], .017 * size, '#669951');
    const l = ball(g, '#83b85e', [x + .07 * size, height * .45, z], [.13 * size, .026 * size, .065 * size]);
    l.rotation.z = .35;
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const petal = ball(g, color, [x + Math.cos(a) * .12 * size, height, z + Math.sin(a) * .12 * size], [.13 * size, .046 * size, .073 * size]);
      petal.rotation.y = -a;
    }
    ball(g, '#e6b746', [x, height + .025, z], [.077 * size, .052 * size, .077 * size]);
  }

  // 2: Two little cedar-edged beds. 3: Daisies subsequently blossom in them.
  for (let i = 0; i < 2; i++) {
    const x = -7.25 + i * 1.28, z = -.62 - i * .15;
    const bed = stage(2, [x, .22, z], i * .5, (i + 1) * .5, 'build');
    block(bed, '#8b6746', [0, .03, 0], [1.1, .08, .76]);
    block(bed, '#786042', [0, .09, 0], [.97, .08, .61]);
    for (const side of [-1, 1]) {
      block(bed, '#b88754', [side * .55, .14, 0], [.1, .24, .87]);
      block(bed, '#cc9b62', [0, .14, side * .39], [1.2, .24, .09]);
      for (const end of [-1, 1]) ball(bed, '#775b3f', [side * .51, .16, end * .438], [.022, .022, .012]);
    }
    for (let j = 0; j < 3; j++) {
      const sprout = ball(bed, '#91b45a', [(j - 1) * .3, .21, -.04], [.1, .14, .055]);
      sprout.rotation.z = j % 2 ? .4 : -.4;
    }
    for (let j = 0; j < 4; j++) {
      const idx = i * 4 + j;
      const flowers = stage(3, [x + (j % 2 ? .24 : -.24), .43, z + (j < 2 ? -.16 : .16)], idx / 8, (idx + 1) / 8);
      bloom(flowers, 0, 0, .25 + (idx % 3) * .075, idx % 3 === 0 ? '#f3cfbd' : '#fff5d9', .82);
    }
  }

  // 4/5 share a real tree: planting leaves a sapling; watering matures it.
  const tree = group(root, [-7.15, .23, 3.8]);
  tree.name = 'reward-4-5-growing-tree';
  cylinder(tree, '#9e6e40', [0, .98, 0], .095, .2, 1.96);
  bar(tree, [0, 1, 0], [-.4, 1.72, .1], .075, '#9e6e40');
  bar(tree, [0, 1.25, 0], [.45, 1.98, -.03], .066, '#9e6e40');
  for (const [x, y, z, r, c] of [[0, 2.07, 0, .92, '#92bd50'], [-.54, 1.95, .08, .61, '#9dc658'], [.57, 2.11, .06, .64, '#86b248'], [0, 2.62, -.04, .55, '#b2ce67']]) {
    shape(tree, leaf, c, [x, y, z], [r, r * .92, r]);
  }
  const treeSoil = stage(4, [-7.15, .22, 3.8], 0, .24);
  ball(treeSoil, '#b69864', [0, .025, 0], [.52, .05, .44]);
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    ball(treeSoil, '#c1c2a3', [Math.cos(a) * .47, .07, Math.sin(a) * .4], [.14, .09, .11]);
  }
  const can = stage(5, [-6.35, .24, 4.05], .08, .5, 'build');
  cylinder(can, '#7ea597', [0, .23, 0], .18, .22, .4);
  cylinder(can, '#a9c9ae', [0, .43, 0], .18, .18, .035);
  bar(can, [.1, .2, 0], [.49, .47, 0], .057, '#7ea597');
  const spout = cylinder(can, '#b7ccb2', [.49, .47, 0], .09, .075, .05);
  spout.rotation.z = -.7;
  const handle = shape(can, new THREE.TorusGeometry(.24, .037, 6, 16, Math.PI * 1.55), '#94b9a5', [-.12, .28, 0]);
  handle.rotation.z = Math.PI * .24;
  const treeFruit = stage(5, [-7.15, .23, 3.8], .5, 1);
  for (const [x, y, z] of [[-.56, 1.92, .57], [.43, 2.14, .69], [0, 2.56, .47]]) {
    ball(treeFruit, '#dcaa58', [x, y, z], [.105, .12, .105]);
    bar(treeFruit, [x, y + .1, z], [x + .02, y + .17, z], .016, '#856345');
  }
  let treeValue = 0, treeTarget = 0;

  // 6: A gentle curve of broad stepping stones from the bridge to the door.
  for (let i = 0; i < 7; i++) {
    const f = i / 6;
    const stone = stage(6, [5.02 + f * 2.9, .3, 1.03 - f * 1.47], i / 7, (i + 1) / 7, 'build');
    const s = cylinder(stone, i % 2 ? '#c9c7af' : '#ded7ba', [0, .05, 0], .28, .32, .12, 7);
    s.scale.set(1.27, 1, .93);
    s.rotation.y = i * .71;
    ball(stone, '#e3deca', [-.07, .118, -.035], [.13, .01, .09]);
  }

  // 7: A plaster windmill with a shingled cap and four cloth-and-wood sails.
  const millBase = [-5.85, .23, -2.6];
  const footing = stage(7, millBase, 0, .2, 'build');
  cylinder(footing, '#c5c09e', [0, .08, 0], .56, .62, .16, 10);
  const mill = stage(7, millBase, .12, .72, 'build');
  cylinder(mill, '#eee0b7', [0, .92, 0], .35, .48, 1.66, 12);
  cylinder(mill, '#d9c8a2', [0, .21, 0], .47, .5, .18, 12);
  shape(mill, new THREE.ConeGeometry(.59, .69, 10), '#6f9680', [0, 2.04, 0]);
  cylinder(mill, '#84a58a', [0, 1.74, 0], .58, .58, .08, 12);
  ball(mill, '#ddb575', [0, 2.41, 0], [.065, .09, .065]);
  block(mill, '#a57a4b', [0, .47, .435], [.3, .51, .045]);
  ball(mill, '#efd194', [.08, .46, .473], [.028, .028, .021]);
  shape(mill, new THREE.CircleGeometry(.12, 14), '#6c9890', [0, 1.07, .4]);
  const millWindow = shape(mill, new THREE.TorusGeometry(.125, .027, 5, 14), '#caab70', [0, 1.07, .41]);
  const sails = stage(7, [-5.85, 1.75, -2.09], .6, 1, 'build');
  const rotor = group(sails);
  rotor.name = 'windmill-rotor';
  for (let i = 0; i < 4; i++) {
    const arm = group(rotor);
    arm.rotation.z = i * Math.PI / 2 + Math.PI / 4;
    block(arm, '#a57b4b', [0, .54, 0], [.067, 1.08, .07]);
    block(arm, '#f4e8c8', [.155, .64, -.012], [.3, .69, .047]);
    for (const yy of [.34, .55, .77, .97]) block(arm, '#c1a578', [.155, yy, .023], [.32, .025, .025]);
    block(arm, '#bb9861', [.31, .64, .024], [.024, .71, .025]);
  }
  ball(rotor, '#c49b61', [0, 0, .07], [.125, .125, .08]);
  rotors.push({ group: rotor, owner: sails });

  // 8: Three neat garden rows with carrots and rounded cabbage leaves.
  for (let i = 0; i < 3; i++) {
    const row = stage(8, [8.85 + i * .48, .24, 3.52], i / 3, (i + 1) / 3);
    block(row, '#9c7b4e', [0, .035, 0], [.44, .07, 1.26]);
    block(row, '#bca570', [0, .04, -.69], [.44, .12, .075]);
    block(row, '#bca570', [0, .04, .69], [.44, .12, .075]);
    for (let j = 0; j < 3; j++) {
      const z = (j - 1) * .39;
      if (i === 1) {
        ball(row, '#dca15b', [0, .12, z], [.09, .12, .09]);
        for (let k = 0; k < 3; k++) {
          const v = ball(row, '#82a955', [(k - 1) * .055, .28, z], [.042, .17, .032]);
          v.rotation.z = (k - 1) * -.4;
        }
      } else {
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2;
          const v = ball(row, k % 2 ? '#91b973' : '#aecb88', [Math.cos(a) * .08, .16, z + Math.sin(a) * .08], [.13, .12, .1]);
          v.rotation.y = a;
        }
        ball(row, '#bdd596', [0, .22, z], [.105, .1, .105]);
      }
    }
  }

  // 9: An arched terracotta mailbox, a raised flag and a little cream letter.
  const mailBase = [9.78, .24, -.16];
  const post = stage(9, mailBase, 0, .32, 'build');
  block(post, '#b28a55', [0, .47, 0], [.13, .94, .15]);
  block(post, '#c6a673', [0, .89, 0], [.57, .1, .4]);
  const mailbox = stage(9, [9.78, 1.18, -.16], .25, .83, 'build');
  block(mailbox, '#b67557', [0, .16, 0], [.52, .33, .63]);
  const mailRoof = cylinder(mailbox, '#cb8c68', [0, .31, 0], .26, .26, .65, 18);
  mailRoof.rotation.x = Math.PI / 2;
  mailRoof.scale.z = .78;
  block(mailbox, '#e9c694', [0, .12, .33], [.45, .035, .025]);
  block(mailbox, '#6e7c68', [0, .3, .342], [.28, .038, .018]);
  const mailFlag = stage(9, [9.78, 1.18, -.16], .8, 1);
  bar(mailFlag, [.3, .1, 0], [.3, .7, 0], .026, '#a97650');
  block(mailFlag, '#e6b753', [.4, .65, 0], [.2, .13, .05]);
  const letter = block(mailFlag, '#f9ebc9', [-.035, .37, .358], [.24, .15, .022]);
  letter.rotation.z = -.17;
  bar(mailFlag, [-.15, .435, .373], [-.025, .36, .373], .008, '#c6a77a');
  bar(mailFlag, [-.025, .36, .373], [.085, .4, .373], .008, '#c6a77a');

  // 10: A stitched picnic blanket, woven basket, mugs and tiny berry pastries.
  const picnic = [-5.88, .26, 5.28];
  const cloth = stage(10, picnic, 0, .42);
  cloth.rotation.y = -.16;
  block(cloth, '#e8c9a6', [0, .015, 0], [1.83, .035, 1.35]);
  for (let i = -2; i <= 2; i++) block(cloth, '#d69580', [i * .33, .036, 0], [.15, .008, 1.35]);
  for (let i = -2; i <= 2; i++) block(cloth, '#f0ddba', [0, .042, i * .26], [1.83, .008, .07]);
  for (let i = 0; i < 12; i++) for (const end of [-1, 1]) block(cloth, '#efe2c1', [-.84 + i * .15, .015, end * .71], [.025, .026, .12]);
  const basket = stage(10, [-6.37, .32, 5.16], .35, .75, 'build');
  block(basket, '#b89059', [0, .18, 0], [.48, .36, .38]);
  for (let i = 0; i < 4; i++) {
    block(basket, i % 2 ? '#d2ac73' : '#c5a063', [0, .075 + i * .09, .196], [.5, .04, .025]);
    block(basket, '#c5a063', [.251, .075 + i * .09, 0], [.025, .04, .39]);
  }
  const basketHandle = shape(basket, new THREE.TorusGeometry(.2, .027, 5, 14, Math.PI), '#ad844d', [0, .35, 0]);
  block(basket, '#f1dfb3', [0, .37, .05], [.43, .04, .25]);
  const snacks = stage(10, [-5.57, .32, 5.35], .68, 1, 'build');
  cylinder(snacks, '#f5e8c9', [0, .035, .1], .23, .21, .05, 18);
  for (const x of [-.09, .08]) {
    ball(snacks, '#d6a462', [x, .11, .08], [.087, .065, .084]);
    ball(snacks, '#ba786a', [x, .163, .075], [.035, .024, .035]);
  }
  for (const x of [-.25, .27]) {
    cylinder(snacks, x < 0 ? '#8da99a' : '#d7a582', [x, .09, -.28], .078, .07, .17);
    cylinder(snacks, '#7e6344', [x, .178, -.28], .058, .058, .004);
    const h = shape(snacks, new THREE.TorusGeometry(.056, .018, 5, 12), '#e3d2ae', [x + .085, .1, -.28]);
  }

  // 11: Warm paper lanterns on curved timber arms outside the cottage.
  for (let i = 0; i < 2; i++) {
    const g = stage(11, [i ? 10.36 : 5.68, .25, i ? .35 : -.08], i * .5, (i + 1) * .5, 'build');
    cylinder(g, '#a38350', [0, .82, 0], .06, .085, 1.64);
    bar(g, [0, 1.61, 0], [i ? -.3 : .3, 1.73, 0], .045, '#b79460');
    const lamp = group(g, [i ? -.31 : .31, 1.44, 0]);
    bar(lamp, [0, .27, 0], [0, .05, 0], .014, '#a48650');
    ball(lamp, '#f3d990', [0, 0, 0], [.19, .24, .19]);
    for (const y of [-.23, .23]) cylinder(lamp, '#ba955d', [0, y, 0], .092, .092, .045);
    for (let j = 0; j < 6; j++) {
      const a = j * Math.PI / 3;
      bar(lamp, [Math.cos(a) * .095, -.2, Math.sin(a) * .095], [Math.cos(a) * .187, 0, Math.sin(a) * .187], .012, '#d6b977');
      bar(lamp, [Math.cos(a) * .187, 0, Math.sin(a) * .187], [Math.cos(a) * .095, .2, Math.sin(a) * .095], .012, '#d6b977');
    }
    bar(lamp, [0, -.25, 0], [0, -.39, 0], .018, '#c39b5b');
    lanterns.push({ group: lamp, owner: g, phase: i * 2.1 });
  }

  // 12: The existing home gets a welcoming floral wreath and fabric pennants.
  const festival = stage(12, [8.1, .12, -2.75], 0, .68, 'build');
  festival.rotation.y = -.12;
  const cord = [];
  for (let i = 0; i <= 16; i++) {
    const x = -1.65 + i * 3.3 / 16;
    cord.push(new THREE.Vector3(x, 2.42 - .31 * Math.sin(i / 16 * Math.PI), 1.55));
  }
  shape(festival, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cord), 22, .012, 5, false), '#ad8b58', [0, 0, 0]);
  for (let i = 0; i < 9; i++) {
    const x = -1.46 + i * .365, y = 2.42 - .31 * Math.sin((i + .5) / 9 * Math.PI);
    const triangle = new THREE.Shape();
    triangle.moveTo(-.12, 0); triangle.lineTo(.12, 0); triangle.lineTo(0, -.28); triangle.closePath();
    shape(festival, new THREE.ExtrudeGeometry(triangle, { depth: .018, bevelEnabled: false }), ['#d99d82', '#9dbc91', '#e9c779'][i % 3], [x, y, 1.55]);
  }
  const wreath = stage(12, [8.1, .12, -2.75], .58, 1);
  wreath.rotation.y = -.12;
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, x = Math.sin(a) * .23, y = 1.43 + Math.cos(a) * .23;
    const l = ball(wreath, i % 2 ? '#8aaf6e' : '#769e62', [x, y, 1.49], [.096, .08, .046]);
    l.rotation.z = -a;
    if (i % 3 === 0) ball(wreath, '#e3b16a', [x, y, 1.535], [.047, .047, .032]);
  }
  for (const side of [-1, 1]) {
    const ribbon = block(wreath, '#d9a28a', [side * .047, 1.12, 1.52], [.07, .19, .025]);
    ribbon.rotation.z = side * -.18;
  }

  // Batch only inside an animation boundary. Moving sails and hanging paper
  // lanterns retain their local transforms; nothing enters the scenery batch.
  function batch(g, protectedGroups = []) {
    g.updateMatrixWorld(true);
    const protectedObjects = new Set();
    protectedGroups.forEach(p => p.traverse(o => protectedObjects.add(o)));
    const byMaterial = new Map(), originals = [];
    const inverse = g.matrixWorld.clone().invert();
    g.traverse(o => {
      if (!o.isMesh || protectedObjects.has(o)) return;
      const geometry = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(inverse.clone().multiply(o.matrixWorld));
      if (!byMaterial.has(o.material)) byMaterial.set(o.material, []);
      byMaterial.get(o.material).push(geometry);
      originals.push(o);
    });
    originals.forEach(o => o.removeFromParent());
    for (const [m, geometries] of byMaterial) {
      const geometry = mergeGeometries(geometries, false);
      if (geometry) {
        const mesh = new THREE.Mesh(geometry, m);
        mesh.castShadow = mesh.receiveShadow = true;
        g.add(mesh);
      }
      geometries.forEach(geometry => geometry.dispose());
    }
  }
  for (const s of stages) {
    const moving = [...rotors, ...lanterns].filter(m => m.owner === s.group).map(m => m.group);
    moving.forEach(g => batch(g));
    batch(s.group, moving);
    s.originalScale.copy(s.group.scale);
    s.group.visible = false;
  }
  batch(tree);
  tree.visible = false;

  const clamp = n => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
  const fraction = level => earned.has(level) ? 1 : active === level ? progress : 0;
  function assignTargets(snap = false) {
    for (const s of stages) {
      s.target = clamp((fraction(s.level) - s.start) / (s.end - s.start));
      if (snap) s.value = s.target;
    }
    const planted = fraction(4), watered = fraction(5);
    treeTarget = watered > 0 ? .48 + watered * .52 : planted * .48;
    if (snap) treeValue = treeTarget;
  }
  function applyStage(s) {
    const g = s.group, f = s.value;
    g.visible = f > .002;
    if (!g.visible) return;
    // Trees and planted flowers rise naturally from the ground. Built objects
    // settle by only a few centimeters instead of floating into the scene.
    const width = s.style === 'build' ? .88 + f * .12 : .6 + f * .4;
    g.scale.copy(s.originalScale).multiply(new THREE.Vector3(width, Math.max(.001, f), width));
    g.position.copy(s.base);
    if (s.style === 'build') g.position.y += Math.sin(f * Math.PI) * .045;
  }
  function update(dt, running = true) {
    if (running) time += dt;
    const ease = running ? 1 - Math.exp(-dt * 11) : 0;
    for (const s of stages) {
      s.value += (s.target - s.value) * ease;
      if (Math.abs(s.target - s.value) < .001) s.value = s.target;
      applyStage(s);
    }
    treeValue += (treeTarget - treeValue) * ease;
    if (Math.abs(treeTarget - treeValue) < .001) treeValue = treeTarget;
    tree.visible = treeValue > .005;
    tree.scale.setScalar(Math.max(.001, treeValue));
    // Fruit follows the growing branches instead of rising through the trunk.
    treeFruit.scale.setScalar(Math.max(.001, treeValue));
    tree.rotation.z = tree.visible ? Math.sin(time * .65) * .012 : 0;
    for (const rotor of rotors) if (rotor.owner.visible && running) rotor.group.rotation.z -= dt * .28;
    for (const lamp of lanterns) lamp.group.rotation.z = Math.sin(time * .85 + lamp.phase) * .045;
  }
  function batchCompleted() {
    for (const m of batchedOriginals) m.visible = true;
    batchedOriginals.length = 0;
    for (const m of [...completedBatch.children]) { m.geometry.dispose(); m.removeFromParent(); }
    root.updateMatrixWorld(true);
    const movingObjects = new Set();
    [...rotors, ...lanterns].forEach(m => m.group.traverse(o => movingObjects.add(o)));
    const inverse = root.matrixWorld.clone().invert(), byMaterial = new Map();
    for (const s of stages) {
      if (!earned.has(s.level)) continue;
      s.group.traverse(o => {
        if (!o.isMesh || movingObjects.has(o)) return;
        const geometry = o.geometry.clone().applyMatrix4(inverse.clone().multiply(o.matrixWorld));
        if (!byMaterial.has(o.material)) byMaterial.set(o.material, []);
        byMaterial.get(o.material).push(geometry);
        o.visible = false;
        batchedOriginals.push(o);
      });
    }
    for (const [material, geometries] of byMaterial) {
      const geometry = mergeGeometries(geometries, false);
      if (geometry) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = mesh.receiveShadow = true;
        completedBatch.add(mesh);
      }
      geometries.forEach(g => g.dispose());
    }
  }
  function configure(levelId, completedIds = []) {
    active = Number(levelId) || 0;
    earned = new Set([...completedIds].map(Number).filter(id => Number.isInteger(id) && id >= 1 && id <= 12));
    progress = 0;
    assignTargets(true);
    update(0, false);
    batchCompleted();
  }
  function setProgress(f) {
    progress = Math.max(progress, clamp(Number(f)));
    assignTargets();
  }
  configure(1, []);
  return {
    root,
    configure,
    setProgress,
    update,
    // Celebration finishes the active construction. Only configure's explicit
    // completedIds make a reward permanent across level changes.
    finish(levelId) { if (Number(levelId) === active) setProgress(1); },
    dispose() {
      root.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
      palette.forEach(m => m.dispose());
      root.removeFromParent();
    }
  };
}
