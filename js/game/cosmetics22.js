// v22: mochilas (back bling) e wraps de armas
import * as THREE from 'three';

export const BACKBLINGS = {
  nenhuma: { n: 'Nenhuma' }, mochila: { n: 'Mochila tática' }, capa: { n: 'Capa de herói' }, asas: { n: 'Asas de anjo' },
  espada: { n: 'Espada lendária' }, escudo: { n: 'Escudo redondo' }, guitarra: { n: 'Guitarra' }, jetpack: { n: 'Jetpack' }
};
export const WRAPS = {
  nenhum: { n: 'Sem wrap' }, ouro: { n: 'Ouro', c: 0xf5c518, m: 1, r: 0.22 }, neon: { n: 'Neon roxo', c: 0xa855f7, e: 0x6d28d9 },
  camuflado: { n: 'Camuflado', c: 0x4d7c0f, r: 0.9 }, gelo: { n: 'Gelo', c: 0x93c5fd, m: 0.3, r: 0.15 }, lava: { n: 'Lava', c: 0xea580c, e: 0x9a3412 }, rosa: { n: 'Rosa chiclete', c: 0xf472b6 }
};
const std = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.6, metalness: 0.1 }, o || {}));
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export function attachBackBling(ch, key){
  if(!ch || !ch.J || !ch.J.chest) return null;
  const old = ch.J.chest.getObjectByName('bb22'); if(old){ old.parent.remove(old); old.traverse(o => { if(o.geometry) o.geometry.dispose(); }); }
  if(!key || key === 'nenhuma' || !BACKBLINGS[key]) return null;
  const cH = (ch.P && ch.P.chestH) || 1.6, g = new THREE.Group(); g.name = 'bb22'; g.position.set(0, cH * 0.55, -0.62);
  const add = (geo, mat, x, y, z, rx, ry, rz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.rotation.set(rx || 0, ry || 0, rz || 0); m.castShadow = true; g.add(m); return m; };
  if(key === 'mochila'){ const a = std(0x3f6212, { roughness: 0.9 }); add(box(1.0, 1.15, 0.5), a, 0, -0.1, -0.2); add(box(0.8, 0.4, 0.22), std(0x365314), 0, -0.35, -0.5); add(new THREE.CylinderGeometry(0.17, 0.17, 1.05, 10), std(0x78716c), 0, 0.55, -0.2, 0, 0, Math.PI / 2); }
  else if(key === 'capa'){ const m = std(0xb91c1c, { side: THREE.DoubleSide, roughness: 0.8 }); const geo = new THREE.PlaneGeometry(1.5, 3.0, 4, 6); const p = geo.attributes.position; for(let i = 0; i < p.count; i++){ const y = p.getY(i); p.setZ(i, -Math.pow((1.5 - y) / 3, 1.6) * 0.9); p.setX(i, p.getX(i) * (1 + (1.5 - y) / 3 * 0.5)); } geo.computeVertexNormals(); add(geo, m, 0, -1.2, -0.05); }
  else if(key === 'asas'){ const m = std(0xf8fafc, { roughness: 0.5, emissive: 0x334155, emissiveIntensity: 0.2 }); for(const s of [-1, 1]){ for(let i = 0; i < 4; i++) add(box(1.6 - i * 0.25, 0.18, 0.05), m, s * (0.7 + i * 0.05), 0.4 - i * 0.28, -0.1, 0, s * 0.35, s * (0.5 - i * 0.12)); } }
  else if(key === 'espada'){ add(box(0.18, 3.0, 0.06), std(0xcbd5e1, { metalness: 0.9, roughness: 0.2 }), 0, 0.1, -0.15, 0, 0, 0.5); add(box(0.8, 0.14, 0.14), std(0xca8a04, { metalness: 0.8, roughness: 0.3 }), 0.55, -0.85, -0.15, 0, 0, 0.5); add(box(0.14, 0.6, 0.14), std(0x451a03), 0.75, -1.15, -0.15, 0, 0, 0.5); }
  else if(key === 'escudo'){ add(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 20), std(0x1d4ed8, { metalness: 0.4 }), 0, 0, -0.1, Math.PI / 2); add(new THREE.CylinderGeometry(0.55, 0.55, 0.14, 20), std(0xf8fafc), 0, 0, -0.12, Math.PI / 2); add(new THREE.CylinderGeometry(0.25, 0.25, 0.16, 16), std(0xdc2626), 0, 0, -0.14, Math.PI / 2); }
  else if(key === 'guitarra'){ const w = std(0xdc2626, { roughness: 0.35 }); add(new THREE.CylinderGeometry(0.55, 0.55, 0.18, 18), w, 0.1, -0.5, -0.15, Math.PI / 2); add(new THREE.CylinderGeometry(0.42, 0.42, 0.18, 18), w, 0.0, 0.05, -0.15, Math.PI / 2); add(box(0.16, 1.7, 0.1), std(0x78350f), -0.25, 1.0, -0.15, 0, 0, 0.25); }
  else if(key === 'jetpack'){ const mt = std(0x9ca3af, { metalness: 0.8, roughness: 0.3 }); for(const s of [-1, 1]){ add(new THREE.CylinderGeometry(0.28, 0.28, 1.3, 14), mt, s * 0.32, -0.05, -0.2); add(new THREE.ConeGeometry(0.22, 0.35, 12), std(0x1f2937), s * 0.32, -0.85, -0.2, Math.PI); add(new THREE.ConeGeometry(0.16, 0.4, 10), new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.8 }), s * 0.32, -1.15, -0.2, Math.PI); } }
  g.traverse(o => { o.userData.noProbe = true; o.raycast = () => {}; });
  ch.J.chest.add(g); return g;
}

export function applyWrap(model, key){
  const W = WRAPS[key]; if(!model || !W || !W.c) return;
  const root = model.root || model.group || model; const col = new THREE.Color(W.c);
  root.traverse(o => { if(!o.isMesh || !o.material || o.userData.noWrap) return; const ms = Array.isArray(o.material) ? o.material : [o.material];
    const nm = ms.map(m => { if(!m.color || m.transparent) return m; const c = m.clone(); c.color.lerp(col, 0.7); if(W.m !== undefined && 'metalness' in c) c.metalness = W.m; if(W.r !== undefined && 'roughness' in c) c.roughness = W.r; if(W.e && c.emissive){ c.emissive.setHex(W.e); c.emissiveIntensity = 0.5; } return c; });
    o.material = Array.isArray(o.material) ? nm : nm[0]; });
}
