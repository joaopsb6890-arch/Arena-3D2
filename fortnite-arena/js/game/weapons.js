// ============================================================
// WEAPONS — modelos PBR com marcadores para IK/efeitos:
//   grip (origem, punho), fore (guarda-mão), muzzle (boca do cano),
//   sight (ponto de mira ADS), eject (ejeção de cápsulas)
//   peças móveis: mag (carregador), pump, bolt
// Convenção: origem no punho, +Z = frente do cano, +Y = cima.
// ============================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Mat } from '../engine/materials.js';

export const WEAPON_STATS = {
  pickaxe: { name: 'Picareta', icon: '⛏️', dmg: 35, cd: 0.5, range: 7 },
  rifle:   { name: 'Fuzil de Assalto', short: 'AR', icon: '🔫', dmg: 32, head: 2, cd: 0.11, mag: 30, reserve: 180, spread: 0.012, auto: true, reloadClip: 'reloadRifle', reloadTime: 1.7, range: 400 },
  shotgun: { name: 'Escopeta Pump', short: 'ESC', icon: '💥', dmg: 11, pellets: 9, head: 1.8, cd: 0.85, mag: 5, reserve: 30, spread: 0.07, pump: true, reloadClip: 'reloadShotgun', reloadTime: 1.5, range: 70 },
  sniper:  { name: 'Rifle de Precisão', short: 'SNP', icon: '🎯', dmg: 110, head: 2.5, cd: 1.3, mag: 1, reserve: 16, spread: 0.0, bolt: true, reloadClip: 'boltSniper', reloadTime: 0.85, range: 900, scope: true }
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function part(geo, p, r, s){
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  Object.keys(g.attributes).forEach(k => { if(!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); });
  if(!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.applyMatrix4(new THREE.Matrix4().compose(p || V(0, 0, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(r || [0, 0, 0]))), s || V(1, 1, 1)));
  return g;
}
class WB {
  constructor(){ this.g = new THREE.Group(); this.m = new Map(); }
  add(mat, geo, p, r, s){ if(!this.m.has(mat)) this.m.set(mat, []); this.m.get(mat).push(part(geo, p, r, s)); return this; }
  build(target){
    target = target || this.g;
    for(const [mat, geos] of this.m){ const mesh = new THREE.Mesh(mergeGeometries(geos), mat); mesh.castShadow = true; mesh.receiveShadow = true; target.add(mesh); }
    this.m.clear(); return target;
  }
}
const box = (w, h, d, r) => r ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
const cyl = (a, b, h, s) => new THREE.CylinderGeometry(a, b, h, s || 18);
const RX = [Math.PI / 2, 0, 0];

function marker(g, name, p){ const o = new THREE.Object3D(); o.name = name; o.position.copy(p); g.add(o); return o; }

const WEAPON_SCALE = { rifle: 1.35, shotgun: 1.3, sniper: 1.25 };
export function createWeapon(type){
  const gunMetal = Mat.metal(0x2d323c, 0.38), steel = Mat.metal(0x16181d, 0.3), bright = Mat.metal(0xa8b0ba, 0.22);
  const poly = Mat.polymer(0x1d1f26), poly2 = Mat.polymer(0x3a3f2e), rubber = Mat.polymer(0x0c0c0c);
  const wood = Mat.wood(0x7a4418), accent = Mat.paint(0xf59e0b), glow = Mat.emissive(0x22d3ee, 1.2), glass = Mat.glass();
  const root = new THREE.Group(); root.name = 'weapon_' + type;
  const markers = {}, parts = {};
  const b = new WB();
  if(type === 'rifle'){
    // receiver superior/inferior
    b.add(gunMetal, box(0.2, 0.2, 0.95, 0.03), V(0, 0.2, 0.3))
     .add(poly2, box(0.19, 0.16, 0.7, 0.03), V(0, 0.06, 0.25))
     .add(steel, box(0.07, 0.04, 0.9), V(0, 0.32, 0.3));          // trilho picatinny
    for(let i = 0; i < 12; i++) b.add(steel, box(0.09, 0.025, 0.035), V(0, 0.345, -0.1 + i * 0.075));
    // guarda-mão com ventilação
    b.add(poly2, box(0.2, 0.2, 0.75, 0.05), V(0, 0.18, 1.12));
    for(let i = 0; i < 5; i++) b.add(steel, box(0.21, 0.05, 0.08, 0.01), V(0, 0.2, 0.85 + i * 0.13));
    // cano + freio de boca
    b.add(steel, cyl(0.035, 0.035, 0.6), V(0, 0.2, 1.7), RX)
     .add(accent, cyl(0.055, 0.055, 0.16, 12), V(0, 0.2, 2.02), RX)
     .add(steel, cyl(0.06, 0.06, 0.02, 12), V(0, 0.2, 1.95), RX);
    // mira frontal / traseira + red-dot
    b.add(steel, box(0.04, 0.12, 0.05), V(0, 0.34, 1.45))
     .add(gunMetal, box(0.16, 0.14, 0.22, 0.03), V(0, 0.43, 0.35))
     .add(glass, box(0.12, 0.1, 0.02), V(0, 0.45, 0.46));
    // punho (grip) inclinado
    b.add(poly, box(0.14, 0.34, 0.16, 0.04), V(0, -0.1, -0.02), [-0.3, 0, 0])
     .add(steel, box(0.03, 0.1, 0.14), V(0, 0.0, 0.18), [0, 0, 0]);   // guarda-mato
    // coronha
    b.add(poly, box(0.1, 0.1, 0.45, 0.02), V(0, 0.18, -0.35))
     .add(poly, box(0.16, 0.26, 0.4, 0.05), V(0, 0.12, -0.7))
     .add(rubber, box(0.17, 0.3, 0.06, 0.02), V(0, 0.12, -0.92));
    // seletor e detalhes
    b.add(accent, box(0.03, 0.05, 0.08), V(0.105, 0.12, 0.18)).add(glow, box(0.012, 0.03, 0.2), V(0.1, 0.24, 0.6));
    b.build(root);
    // carregador curvo (peça)
    const mag = new THREE.Group(); mag.position.set(0, -0.04, 0.42);
    const mb = new WB();
    mb.add(poly, box(0.12, 0.26, 0.2, 0.02), V(0, -0.1, 0), [0.12, 0, 0]).add(poly, box(0.12, 0.22, 0.2, 0.02), V(0, -0.3, 0.06), [0.3, 0, 0]).add(steel, box(0.13, 0.04, 0.21), V(0, -0.42, 0.1), [0.3, 0, 0]);
    mb.build(mag); root.add(mag); parts.mag = mag;
    markers.fore = marker(root, 'fore', V(0, 0.08, 1.05));
    markers.muzzle = marker(root, 'muzzle', V(0, 0.2, 2.12));
    markers.sight = marker(root, 'sight', V(0, 0.46, 0.3));
    markers.eject = marker(root, 'eject', V(-0.11, 0.22, 0.35));
  } else if(type === 'shotgun'){
    b.add(gunMetal, box(0.2, 0.24, 0.7, 0.04), V(0, 0.18, 0.2))
     .add(steel, cyl(0.055, 0.055, 1.35), V(0, 0.26, 1.2), RX)
     .add(steel, cyl(0.04, 0.04, 1.05), V(0, 0.12, 1.05), RX)        // tubo de munição
     .add(bright, cyl(0.065, 0.065, 0.06, 14), V(0, 0.26, 1.87), RX)
     .add(steel, box(0.03, 0.05, 0.04), V(0, 0.34, 1.8))
     .add(accent, box(0.05, 0.02, 0.5), V(0, 0.315, 0.3));
    b.add(wood, box(0.13, 0.3, 0.16, 0.05), V(0, -0.1, -0.03), [-0.35, 0, 0])
     .add(wood, box(0.15, 0.26, 0.6, 0.06), V(0, 0.08, -0.5), [0.08, 0, 0])
     .add(rubber, box(0.16, 0.3, 0.06, 0.02), V(0, 0.05, -0.82), [0.08, 0, 0])
     .add(steel, box(0.03, 0.1, 0.14), V(0, 0.03, 0.15));
    for(let i = 0; i < 3; i++) b.add(Mat.paint(0xdc2626), cyl(0.03, 0.03, 0.1, 10), V(0.11, 0.17, 0.05 + i * 0.13), [0, 0, Math.PI / 2]);
    b.build(root);
    const pump = new THREE.Group(); pump.position.set(0, 0.1, 0.95);
    const pb = new WB();
    pb.add(wood, box(0.17, 0.15, 0.42, 0.05), V(0, 0, 0));
    for(let i = 0; i < 6; i++) pb.add(Mat.wood(0x5a300f), box(0.18, 0.02, 0.03), V(0, -0.02, -0.15 + i * 0.06));
    pb.build(pump); root.add(pump); parts.pump = pump;
    markers.fore = marker(pump, 'fore', V(0, -0.04, 0));
    markers.muzzle = marker(root, 'muzzle', V(0, 0.26, 1.92));
    markers.sight = marker(root, 'sight', V(0, 0.36, 0.3));
    markers.eject = marker(root, 'eject', V(-0.11, 0.2, 0.3));
  } else if(type === 'sniper'){
    b.add(gunMetal, box(0.18, 0.18, 0.9, 0.03), V(0, 0.2, 0.3))
     .add(steel, cyl(0.04, 0.03, 1.5), V(0, 0.22, 1.45), RX)
     .add(steel, cyl(0.06, 0.06, 0.18, 12), V(0, 0.22, 2.25), RX)
     .add(wood, box(0.2, 0.18, 1.3, 0.05), V(0, 0.08, 0.55))
     .add(wood, box(0.13, 0.32, 0.16, 0.05), V(0, -0.1, -0.03), [-0.3, 0, 0])
     .add(wood, box(0.17, 0.3, 0.6, 0.06), V(0, 0.1, -0.55))
     .add(rubber, box(0.18, 0.32, 0.06, 0.02), V(0, 0.1, -0.87))
     .add(steel, box(0.03, 0.1, 0.14), V(0, 0.03, 0.15));
    // luneta
    b.add(steel, cyl(0.085, 0.085, 0.95, 20), V(0, 0.46, 0.35), RX)
     .add(steel, cyl(0.12, 0.085, 0.2, 20), V(0, 0.46, 0.9), RX)
     .add(steel, cyl(0.1, 0.085, 0.14, 20), V(0, 0.46, -0.15), RX)
     .add(gunMetal, cyl(0.03, 0.03, 0.08, 10), V(0, 0.56, 0.35))
     .add(steel, box(0.06, 0.12, 0.08), V(0, 0.34, 0.1)).add(steel, box(0.06, 0.12, 0.08), V(0, 0.34, 0.6))
     .add(glass, new THREE.CircleGeometry(0.11, 24), V(0, 0.46, 1.005))
     .add(accent, cyl(0.09, 0.09, 0.03, 20), V(0, 0.46, 0.8), RX);
    // bipé dobrado
    b.add(steel, cyl(0.015, 0.015, 0.5, 6), V(0.05, 0.0, 1.35), [Math.PI / 2 + 0.2, 0, 0]).add(steel, cyl(0.015, 0.015, 0.5, 6), V(-0.05, 0.0, 1.35), [Math.PI / 2 + 0.2, 0, 0]);
    b.build(root);
    const bolt = new THREE.Group(); bolt.position.set(-0.12, 0.25, 0.05);
    const bb = new WB(); bb.add(bright, cyl(0.02, 0.02, 0.16, 8), V(-0.06, 0, 0), [0, 0, Math.PI / 2]).add(bright, new THREE.SphereGeometry(0.04, 12, 8), V(-0.15, 0, 0));
    bb.build(bolt); root.add(bolt); parts.bolt = bolt;
    markers.fore = marker(root, 'fore', V(0, -0.02, 1.0));
    markers.muzzle = marker(root, 'muzzle', V(0, 0.22, 2.36));
    markers.sight = marker(root, 'sight', V(0, 0.46, -0.3));
    markers.eject = marker(root, 'eject', V(-0.12, 0.25, 0.2));
  }
  markers.grip = marker(root, 'grip', V(0, -0.04, -0.02));
  root.traverse(o => { if(o.isMesh) o.castShadow = true; });
  // escala estilizada (proporção Fortnite: armas robustas e legíveis em 3ª pessoa); grip na origem → IK intacto
  root.scale.setScalar(WEAPON_SCALE[type] || 1.3);
  return { group: root, type, markers, parts, stats: WEAPON_STATS[type] };
}

export function createPickaxe(style){
  const g = new THREE.Group(); g.name = 'pickaxe';
  const wood = Mat.wood(0x6b3a17), leather = Mat.leather(0x1a1410), gold = Mat.metal(0xd4a02a, 0.2), head = Mat.metal(0x3b4250, 0.35), edge = Mat.metal(0xdfe6ee, 0.12), glow = Mat.emissive(0x22d3ee, 1.4);
  const b = new WB();
  // cabo (origem = ponto de pega, ~1/3 de baixo)
  b.add(wood, cyl(0.055, 0.065, 2.2, 14), V(0, 0.6, 0))
   .add(leather, cyl(0.075, 0.075, 0.55, 14), V(0, 0.0, 0));
  for(let i = 0; i < 5; i++) b.add(leather, new THREE.TorusGeometry(0.075, 0.012, 6, 16), V(0, -0.22 + i * 0.11, 0), [Math.PI / 2, 0, 0.2]);
  b.add(gold, cyl(0.085, 0.085, 0.08, 14), V(0, -0.5, 0)).add(gold, new THREE.SphereGeometry(0.09, 12, 8), V(0, -0.56, 0))
   .add(gold, cyl(0.09, 0.09, 0.1, 14), V(0, 1.55, 0));
  // cabeça: bloco central + pico curvo (frente +Z) + lâmina (trás -Z)
  b.add(head, box(0.26, 0.3, 0.42, 0.05), V(0, 1.72, 0));
  const pick = [];
  for(let i = 0; i < 6; i++){
    const t = i / 5; const z = 0.2 + t * 0.85, y = 1.72 - t * t * 0.38, s = 1 - t * 0.75;
    b.add(i < 5 ? head : edge, box(0.2 * s + 0.03, 0.2 * s + 0.03, 0.2), V(0, y, z), [0.5 * t, 0, 0]);
  }
  b.add(edge, new THREE.ConeGeometry(0.07, 0.3, 6), V(0, 1.3, 1.16), [Math.PI / 2 + 0.75, 0, 0]);
  b.add(head, box(0.18, 0.36, 0.34, 0.03), V(0, 1.68, -0.36), [-0.2, 0, 0])
   .add(edge, box(0.06, 0.44, 0.1, 0.01), V(0, 1.66, -0.55), [-0.2, 0, 0]);
  b.add(gold, box(0.28, 0.08, 0.44), V(0, 1.88, 0)).add(glow, box(0.27, 0.03, 0.2), V(0, 1.72, 0.12));
  b.build(g);
  g.userData.tip = marker(g, 'tip', V(0, 1.3, 1.2));
  return g;
}

// props para interações
export function createPotion(){
  const g = new THREE.Group();
  const glass = Mat.glass(); const liquid = Mat.emissive(0x3b82f6, 0.8);
  const b = new WB();
  b.add(liquid, new THREE.SphereGeometry(0.16, 16, 12), V(0, 0, 0)).add(liquid, cyl(0.05, 0.05, 0.16, 10), V(0, 0.18, 0));
  b.build(g);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 12), glass); g.add(shell);
  const cork = new THREE.Mesh(cyl(0.055, 0.05, 0.08, 10), Mat.wood(0x8b5a2b)); cork.position.y = 0.3; g.add(cork);
  g.rotation.z = Math.PI / 2; g.position.set(0, 0, 0.08);
  return g;
}
export function createMedkit(){
  const g = new THREE.Group();
  const b = new WB();
  b.add(Mat.polymer(0xf1f5f9), box(0.5, 0.3, 0.2, 0.05), V(0, 0, 0)).add(Mat.paint(0xdc2626), box(0.3, 0.08, 0.21), V(0, 0, 0)).add(Mat.paint(0xdc2626), box(0.08, 0.26, 0.21), V(0, 0, 0));
  b.build(g); g.position.set(0, -0.05, 0.15);
  return g;
}
export function createGlider(color){
  const g = new THREE.Group();
  const frame = Mat.metal(0x333a44, 0.3);
  const b = new WB();
  b.add(frame, cyl(0.04, 0.04, 1.8, 8), V(0, 0, 0), [0, 0, Math.PI / 2])
   .add(frame, cyl(0.03, 0.03, 2.2, 8), V(0.85, 1.0, 0), [0, 0, 0.55])
   .add(frame, cyl(0.03, 0.03, 2.2, 8), V(-0.85, 1.0, 0), [0, 0, -0.55]);
  b.build(g);
  // asa — superfície curva
  const wing = new THREE.PlaneGeometry(6, 2.6, 24, 8);
  const pos = wing.attributes.position;
  for(let i = 0; i < pos.count; i++){ const x = pos.getX(i), y = pos.getY(i); pos.setZ(i, -Math.pow(x / 3, 2) * 0.9 + Math.sin((y + 1.3) / 2.6 * Math.PI) * 0.3); }
  wing.computeVertexNormals();
  const wm = Mat.cloth(color || 0xef4444, 'fabric').clone(); wm.side = THREE.DoubleSide;
  const w = new THREE.Mesh(wing, wm); w.rotation.x = -Math.PI / 2 + 0.25; w.position.y = 2.0; w.castShadow = true; g.add(w);
  g.userData.wing = w;
  return g;
}
