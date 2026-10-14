import * as THREE from '../vendor/three.module.js';

export const clamp = x => Math.max(0, Math.min(1, x));
export const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };
export const lerp = (a, b, t) => a + (b - a) * t;

// Each world owns its props, textures and renderer. No RAF, input, or storage.
export function createCozyProps(scene, camera) {
  const root = new THREE.Group(); scene.add(root);
  const materials = new Map(), textures = new Map(), drawings = [];
  const sphere = new THREE.SphereGeometry(1, 20, 14);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const billboards = [];
  const mat = color => {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .91 }));
    return materials.get(color);
  };
  function mesh(geometry, color, position = [0, 0, 0], scale = [1, 1, 1], parent = root) {
    const m = new THREE.Mesh(geometry, typeof color === 'string' ? mat(color) : color);
    m.position.set(...position); m.scale.set(...scale); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  }
  const ell = (color, position, scale, parent) => mesh(sphere, color, position, scale, parent);
  const block = (color, position, scale, parent) => mesh(box, color, position, scale, parent);
  const cylinder = (color, position, rt, rb, height, parent, segments = 12) =>
    mesh(new THREE.CylinderGeometry(rt, rb, height, segments), color, position, [1, 1, 1], parent);
  function texture(id, draw, w = 512, h = 256) {
    if (textures.has(id)) return textures.get(id);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'), t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const redraw = () => { ctx.clearRect(0, 0, w, h); draw(ctx, w, h); t.needsUpdate = true; };
    redraw(); drawings.push(redraw); textures.set(id, t); return t;
  }
  function textMap(text, style = 'label', aspect = 2) {
    return texture(`${style}:${aspect}:${text}`, (ctx, w, h) => {
      if (style !== 'stone') {
        ctx.fillStyle = style === 'active' ? '#fff1b7' : '#fff8df';
        ctx.beginPath(); ctx.roundRect(9, 10, w - 18, h - 20, 50); ctx.fill();
        ctx.strokeStyle = style === 'active' ? '#dba852' : '#d6c395'; ctx.lineWidth = 5; ctx.stroke();
      }
      ctx.fillStyle = style === 'muted' ? '#95a18a' : '#52633b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const length = Array.from(text).length;
      const size = style === 'stone' ? 330 : Math.min(h * .55, (w - 60) / Math.max(1, length * .95));
      ctx.font = `800 ${size}px "Noto Sans CJK SC", Arial, sans-serif`;
      ctx.fillText(text, w / 2, h / 2 + (style === 'stone' ? 12 : 3));
    }, 512, style === 'stone' ? 512 : Math.round(512 / aspect));
  }
  function label(text, position, width = 2, height = .8, parent = root, style = 'label') {
    const m = mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: textMap(text, style, width / height), transparent: true, depthWrite: false }), position, [1, 1, 1], parent);
    m.castShadow = m.receiveShadow = false; m.userData.text = text; m.userData.aspect = width / height; billboards.push(m); return m;
  }
  function setLabel(m, text, style = 'label') {
    if (m.userData.text === text && m.userData.style === style) return;
    m.userData.text = text; m.userData.style = style; m.material.map = textMap(text, style, m.userData.aspect || 2);
  }
  function fruit(key, parent = root) {
    const g = new THREE.Group(); parent.add(g); g.name = `fruit-${key}`;
    const pear = key === 'D', peach = key === 'K', orange = key === 'J';
    const color = pear ? '#c5cc65' : peach ? '#efad8f' : orange ? '#ecaa49' : '#ec8250';
    if (pear) {
      ell(color, [0, -.11, 0], [.56, .57, .55], g);
      ell(color, [0, .40, 0], [.34, .44, .34], g);
    } else {
      ell(color, [-.18, 0, 0], [.48, .58, .54], g);
      ell(color, [.18, 0, 0], [.48, .58, .54], g);
      ell(color, [0, -.16, 0], [.55, .46, .54], g);
    }
    const stem = cylinder('#805735', [0, pear ? .82 : .66, 0], .048, .066, .28, g, 7); stem.rotation.z = -.12;
    const leaf = ell('#739747', [.23, pear ? .91 : .76, .02], [.27, .058, .13], g); leaf.rotation.z = .4;
    return g;
  }
  function basket(position, scale = 1) {
    const g = new THREE.Group(); g.position.set(...position); g.scale.setScalar(scale); root.add(g);
    cylinder('#b88950', [0, .33, 0], .87, .66, .66, g, 18);
    for (let i = 0; i < 4; i++) {
      const r = mesh(new THREE.TorusGeometry(.83, .047, 6, 28), i % 2 ? '#e0b97b' : '#c69b5c', [0, .12 + .17 * i, 0], [.84 + .055 * i, .84 + .055 * i, 1], g); r.rotation.x = Math.PI / 2;
    }
    mesh(new THREE.TorusGeometry(.76, .055, 6, 28, Math.PI), '#c49a62', [0, .65, -.13], [1, 1, 1], g);
    return g;
  }
  function billboard() { for (let i=billboards.length-1;i>=0;i--) { const m=billboards[i];if(!m.parent){billboards.splice(i,1);continue;}m.quaternion.copy(camera.quaternion); if (m.parent !== root) { const q = new THREE.Quaternion(); m.parent.getWorldQuaternion(q); m.quaternion.premultiply(q.invert()); } } }
  return { root, mat, mesh, ell, block, cylinder, label, setLabel, textMap, fruit, basket, billboard, textures, materials, drawings, geometries: [sphere, box] };
}
