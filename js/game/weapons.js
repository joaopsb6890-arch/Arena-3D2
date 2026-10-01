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

// v16: raridades (multiplicador de dano) — cor = cor da raridade no Fortnite
export const RARITY = [
  { id: 'comum', label: 'Comum', css: 'common', color: 0x9ca3af, mult: 1.0 },
  { id: 'incomum', label: 'Incomum', css: 'uncommon', color: 0x22c55e, mult: 1.06 },
  { id: 'raro', label: 'Raro', css: 'rare', color: 0x3b82f6, mult: 1.12 },
  { id: 'epico', label: 'Épico', css: 'epic', color: 0xa855f7, mult: 1.18 },
  { id: 'lendario', label: 'Lendário', css: 'legendary', color: 0xf59e0b, mult: 1.25 }
];
export function rollRarity(bias){ const r = Math.random() + (bias || 0); return r > 0.97 ? 4 : r > 0.88 ? 3 : r > 0.7 ? 2 : r > 0.42 ? 1 : 0; }
export const GUNS = ['rifle', 'shotgun', 'sniper', 'smg', 'pistol'];
export const WEAPON_STATS = {
  pickaxe: { name: 'Picareta', icon: '⛏️', dmg: 35, cd: 0.5, range: 7 },
  rifle:   { name: 'Fuzil de Assalto', short: 'AR', icon: '🔫', dmg: 32, head: 2, cd: 0.11, mag: 30, reserve: 180, spread: 0.012, auto: true, reloadClip: 'reloadRifle', reloadTime: 1.7, range: 400 },
  shotgun: { name: 'Escopeta Pump', short: 'ESC', icon: '💥', dmg: 11, pellets: 9, head: 1.8, cd: 0.85, mag: 5, reserve: 30, spread: 0.07, pump: true, reloadClip: 'reloadShotgun', reloadTime: 1.5, range: 70 },
  sniper:  { name: 'Rifle de Precisão', short: 'SNP', icon: '🎯', dmg: 110, head: 2.5, cd: 1.3, mag: 1, reserve: 16, spread: 0.0, bolt: true, reloadClip: 'boltSniper', reloadTime: 0.85, range: 900, scope: true },
  // v16
  smg:     { name: 'Submetralhadora', short: 'SMG', icon: '🔫', dmg: 17, head: 1.75, cd: 0.075, mag: 30, reserve: 210, spread: 0.028, auto: true, reloadClip: 'reloadRifle', reloadTime: 1.7, range: 160, drop: 70 },
  pistol:  { name: 'Pistola', short: 'PST', icon: '🔫', dmg: 25, head: 2, cd: 0.17, mag: 16, reserve: 96, spread: 0.016, reloadClip: 'reloadRifle', reloadTime: 1.7, range: 260, drop: 120 }
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

const WEAPON_SCALE = { rifle: 1.35, shotgun: 1.3, sniper: 1.25, smg: 1.35, pistol: 1.45 };
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
  else if(type === 'smg'){
    // corpo compacto com carregador reto, supressor curto e coronha dobrável
    b.add(gunMetal, box(0.19, 0.22, 0.72, 0.035), V(0, 0.19, 0.26))
     .add(poly, box(0.17, 0.12, 0.5, 0.03), V(0, 0.04, 0.3))
     .add(steel, box(0.06, 0.035, 0.55), V(0, 0.32, 0.25))
     .add(steel, cyl(0.075, 0.075, 0.42, 16), V(0, 0.2, 0.83), RX)
     .add(accent, cyl(0.08, 0.08, 0.05, 16), V(0, 0.2, 0.66), RX)
     .add(steel, cyl(0.03, 0.03, 0.05, 10), V(0, 0.2, 1.05), RX)
     .add(poly, box(0.13, 0.3, 0.15, 0.04), V(0, -0.1, -0.02), [-0.25, 0, 0])
     .add(steel, box(0.03, 0.09, 0.13), V(0, 0.0, 0.16))
     .add(poly, box(0.12, 0.2, 0.12, 0.03), V(0, -0.04, 0.58), [0.2, 0, 0])      // punho frontal
     .add(steel, box(0.04, 0.04, 0.42), V(0.06, 0.16, -0.3)).add(steel, box(0.04, 0.04, 0.42), V(-0.06, 0.16, -0.3))
     .add(rubber, box(0.16, 0.2, 0.05, 0.02), V(0, 0.14, -0.52))
     .add(gunMetal, box(0.13, 0.12, 0.16, 0.03), V(0, 0.4, 0.2)).add(glass, box(0.09, 0.08, 0.02), V(0, 0.41, 0.29))
     .add(glow, box(0.012, 0.03, 0.3), V(0.1, 0.22, 0.3));
    b.build(root);
    const mag = new THREE.Group(); mag.position.set(0, -0.02, 0.36);
    const mb = new WB(); mb.add(poly, box(0.1, 0.42, 0.14, 0.02), V(0, -0.2, 0)).add(steel, box(0.11, 0.04, 0.15), V(0, -0.41, 0));
    mb.build(mag); root.add(mag); parts.mag = mag;
    markers.fore = marker(root, 'fore', V(0, -0.1, 0.6));
    markers.muzzle = marker(root, 'muzzle', V(0, 0.2, 1.1));
    markers.sight = marker(root, 'sight', V(0, 0.42, 0.1));
    markers.eject = marker(root, 'eject', V(-0.1, 0.22, 0.3));
  } else if(type === 'pistol'){
    b.add(gunMetal, box(0.13, 0.13, 0.62, 0.03), V(0, 0.2, 0.2))          // corrediça
     .add(poly, box(0.12, 0.09, 0.52, 0.025), V(0, 0.09, 0.18))
     .add(steel, cyl(0.03, 0.03, 0.08, 10), V(0, 0.2, 0.53), RX)
     .add(poly, box(0.12, 0.34, 0.17, 0.035), V(0, -0.1, -0.03), [-0.22, 0, 0])
     .add(steel, box(0.03, 0.08, 0.12), V(0, 0.02, 0.1))
     .add(steel, box(0.03, 0.05, 0.04), V(0, 0.29, 0.44)).add(steel, box(0.08, 0.05, 0.04), V(0, 0.29, -0.06))
     .add(accent, box(0.132, 0.02, 0.3), V(0, 0.15, 0.25));
    for(let i = 0; i < 5; i++) b.add(steel, box(0.135, 0.1, 0.012), V(0, 0.22, -0.04 + i * 0.03));
    b.build(root);
    const mag = new THREE.Group(); mag.position.set(0, -0.28, -0.08);
    const mb = new WB(); mb.add(steel, box(0.1, 0.06, 0.14, 0.01), V(0, 0, 0)); mb.build(mag); root.add(mag); parts.mag = mag;
    markers.fore = marker(root, 'fore', V(0, -0.14, 0.02));
    markers.muzzle = marker(root, 'muzzle', V(0, 0.2, 0.58));
    markers.sight = marker(root, 'sight', V(0, 0.3, -0.1));
    markers.eject = marker(root, 'eject', V(-0.07, 0.23, 0.15));
  }
  markers.grip = marker(root, 'grip', V(0, -0.04, -0.02));
  root.traverse(o => { if(o.isMesh) o.castShadow = true; });
  // escala estilizada (proporção Fortnite: armas robustas e legíveis em 3ª pessoa); grip na origem → IK intacto
  root.scale.setScalar(WEAPON_SCALE[type] || 1.3);
  return { group: root, type, markers, parts, stats: WEAPON_STATS[type] };
}

export function createPickaxe(style){
  style = style || 'padrao';
  const g = new THREE.Group(); g.name = 'pickaxe'; g.userData.style = style;
  const b = new WB();
  let wood = Mat.wood(0x6b3a17), leather = Mat.leather(0x1a1410), gold = Mat.metal(0xd4a02a, 0.2), head = Mat.metal(0x3b4250, 0.35), edge = Mat.metal(0xdfe6ee, 0.12);
  // cabo comum (origem = ponto de pega; +Y ao longo do cabo; +Z = frente do golpe)
  const handle = (mat, len, r) => { b.add(mat, cyl(r || 0.055, (r || 0.055) * 1.15, len, 14), V(0, len / 2 - 0.5, 0)); };
  const grip = (mat) => { b.add(mat, cyl(0.075, 0.075, 0.55, 14), V(0, 0.0, 0)); for(let i = 0; i < 5; i++) b.add(mat, new THREE.TorusGeometry(0.075, 0.012, 6, 16), V(0, -0.22 + i * 0.11, 0), [Math.PI / 2, 0, 0.2]); };
  let tip = V(0, 1.3, 1.2), glowMat = null;
  if(style === 'padrao' || style === 'dourada' || style === 'neon'){
    // v18: variantes da picareta clássica (Dourada, Néon)
    let glow = Mat.emissive(0x22d3ee, 1.4), hw = wood, gl = leather;
    if(style === 'dourada'){ const g2 = Mat.metal(0xf5c542, 0.12); glow = Mat.emissive(0xfff1a8, 2.2); hw = Mat.metal(0x7c4a12, 0.3); gl = Mat.leather(0x3f1d0b); gold = g2; head = Mat.metal(0xe0a82e, 0.15); edge = Mat.metal(0xfff7d6, 0.05); glowMat = glow; }
    if(style === 'neon'){ glow = Mat.emissive(0xff3ea5, 3.0); hw = Mat.polymer(0x111827); gl = Mat.polymer(0x1f2937); gold = Mat.emissive(0x22d3ee, 2.2); head = Mat.polymer(0x0b0f19); edge = Mat.emissive(0xff3ea5, 2.6); glowMat = glow; }
    handle(hw, 2.2); grip(gl);
    b.add(gold, cyl(0.085, 0.085, 0.08, 14), V(0, -0.5, 0)).add(gold, new THREE.SphereGeometry(0.09, 12, 8), V(0, -0.56, 0)).add(gold, cyl(0.09, 0.09, 0.1, 14), V(0, 1.55, 0));
    b.add(head, box(0.26, 0.3, 0.42, 0.05), V(0, 1.72, 0));
    for(let i = 0; i < 6; i++){ const t = i / 5; const z = 0.2 + t * 0.85, y = 1.72 - t * t * 0.38, sc = 1 - t * 0.75; b.add(i < 5 ? head : edge, box(0.2 * sc + 0.03, 0.2 * sc + 0.03, 0.2), V(0, y, z), [0.5 * t, 0, 0]); }
    b.add(edge, new THREE.ConeGeometry(0.07, 0.3, 6), V(0, 1.3, 1.16), [Math.PI / 2 + 0.75, 0, 0]);
    b.add(head, box(0.18, 0.36, 0.34, 0.03), V(0, 1.68, -0.36), [-0.2, 0, 0]).add(edge, box(0.06, 0.44, 0.1, 0.01), V(0, 1.66, -0.55), [-0.2, 0, 0]);
    b.add(gold, box(0.28, 0.08, 0.44), V(0, 1.88, 0)).add(glow, box(0.27, 0.03, 0.2), V(0, 1.72, 0.12));
  } else if(style === 'machado'){
    handle(Mat.wood(0x8b5a2b), 2.3, 0.06); grip(Mat.leather(0x7c2d12));
    const blade = new THREE.Shape(); blade.moveTo(0, -0.28); blade.quadraticCurveTo(0.55, -0.55, 0.78, -0.62); blade.quadraticCurveTo(0.95, 0, 0.78, 0.62); blade.quadraticCurveTo(0.55, 0.5, 0, 0.28); blade.lineTo(0, -0.28);
    const bg = new THREE.ExtrudeGeometry(blade, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 16 });
    bg.translate(0, 0, -0.035); bg.rotateY(-Math.PI / 2);   // lâmina aponta para +Z
    b.add(Mat.metal(0x9ca3af, 0.25), bg, V(0, 1.6, 0.05)).add(edge, box(0.03, 1.1, 0.06), V(0, 1.6, 0.9));
    b.add(Mat.metal(0x374151, 0.35), box(0.24, 0.42, 0.28, 0.05), V(0, 1.62, -0.06)).add(Mat.leather(0x7c2d12), cyl(0.07, 0.07, 0.2, 12), V(0, 1.3, 0));
    tip = V(0, 1.6, 0.95);
  } else if(style === 'martelo'){
    handle(Mat.metal(0x1e293b, 0.3), 2.1, 0.06); grip(Mat.leather(0x0f172a));
    glowMat = Mat.emissive(0x60a5fa, 2.2);
    b.add(Mat.metal(0x64748b, 0.25), box(0.62, 0.62, 1.1, 0.08), V(0, 1.7, 0.1)).add(Mat.metal(0xcbd5e1, 0.15), box(0.66, 0.66, 0.12, 0.03), V(0, 1.7, 0.66)).add(Mat.metal(0xcbd5e1, 0.15), box(0.66, 0.66, 0.12, 0.03), V(0, 1.7, -0.46));
    for(const sz of [-0.2, 0.3]) b.add(glowMat, box(0.64, 0.06, 0.06), V(0, 1.7, sz));
    b.add(glowMat, new THREE.OctahedronGeometry(0.16, 0), V(0, 2.08, 0.1));
    tip = V(0, 1.7, 0.72);
  } else if(style === 'foice'){
    handle(Mat.wood(0x1c1917), 2.8, 0.05); grip(Mat.leather(0x3b0764));
    glowMat = Mat.emissive(0xa855f7, 1.8);
    const curve = new THREE.QuadraticBezierCurve3(V(0, 2.2, 0), V(0, 2.55, 0.9), V(0, 1.6, 1.75));
    b.add(Mat.metal(0x1f2937, 0.2), new THREE.TubeGeometry(curve, 24, 0.07, 6), V(0, 0, 0), null, V(1, 1, 1));
    b.add(glowMat, new THREE.TubeGeometry(curve, 24, 0.025, 5), V(0, -0.1, 0.02));
    b.add(Mat.metal(0x111827, 0.3), new THREE.SphereGeometry(0.14, 14, 10), V(0, 2.2, 0)).add(glowMat, new THREE.OctahedronGeometry(0.1, 0), V(0, -0.62, 0));
    tip = V(0, 1.6, 1.75);
  } else if(style === 'cristal'){
    handle(Mat.metal(0xe2e8f0, 0.2), 2.2, 0.05); grip(Mat.leather(0x0e7490));
    const ice = new THREE.MeshPhysicalMaterial({ color: 0x9ff3ff, emissive: 0x22d3ee, emissiveIntensity: 0.6, roughness: 0.08, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.85 });
    glowMat = ice;
    b.add(ice, new THREE.OctahedronGeometry(0.34, 0), V(0, 1.75, 0), null, V(0.8, 1, 1));
    b.add(ice, new THREE.ConeGeometry(0.16, 1.1, 5), V(0, 1.58, 0.72), [Math.PI / 2 + 0.35, 0, 0]);
    b.add(ice, new THREE.ConeGeometry(0.13, 0.6, 5), V(0, 1.72, -0.45), [-Math.PI / 2 - 0.2, 0, 0]);
    for(let i = 0; i < 3; i++) b.add(ice, new THREE.ConeGeometry(0.05, 0.3, 4), V(0, 0.3 + i * 0.4, 0.07), [0.6, 0, 0]);
    tip = V(0, 1.4, 1.22);
  } else if(style === 'lamina'){
    handle(Mat.metal(0x18181b, 0.25), 1.2, 0.07); grip(Mat.leather(0x881337));
    glowMat = Mat.emissive(0xf43f5e, 3.0);
    b.add(Mat.metal(0x27272a, 0.3), box(0.34, 0.14, 0.34, 0.04), V(0, 0.62, 0)).add(Mat.metal(0xa1a1aa, 0.15), cyl(0.09, 0.09, 0.2, 14), V(0, 0.75, 0));
    b.add(glowMat, box(0.06, 2.0, 0.22, 0.03), V(0, 1.85, 0.03)).add(Mat.emissive(0xffe4e6, 3.5), box(0.02, 1.9, 0.08, 0.01), V(0, 1.85, 0.03));
    tip = V(0, 2.6, 0.1);
  } else if(style === 'doce'){
    // bengala listrada: listras como anéis alternados
    const red = Mat.paint(0xdc2626), white = Mat.paint(0xfafafa);
    for(let i = 0; i < 12; i++) b.add(i % 2 ? red : white, cyl(0.075, 0.075, 0.2, 14), V(0, -0.5 + i * 0.2, 0), [0, 0, 0.0]);
    const curve = new THREE.QuadraticBezierCurve3(V(0, 1.9, 0), V(0, 2.6, 0.45), V(0, 1.95, 0.95));
    b.add(red, new THREE.TubeGeometry(curve, 20, 0.078, 10), V(0, 0, 0));
    b.add(white, new THREE.TorusGeometry(0.09, 0.02, 6, 14), V(0, 2.3, 0.3), [0.5, 0, 0]);
    tip = V(0, 1.95, 0.95);
  } else if(style === 'tridente'){
    // v15: tridente dos mares — haste de bronze, três dentes farpados, pérola brilhante
    const bronze = Mat.metal(0xb7791f, 0.25), pearl = Mat.emissive(0x67e8f9, 1.6);
    handle(bronze, 2.6, 0.05); grip(Mat.leather(0x134e4a)); glowMat = pearl;
    b.add(bronze, cyl(0.1, 0.07, 0.25, 16), V(0, 1.72, 0), RX).add(pearl, new THREE.SphereGeometry(0.11, 16, 12), V(0, 1.72, 0.02));
    b.add(bronze, box(0.1, 0.1, 0.9, 0.03), V(0, 1.72, 0.3));
    for(const dx of [-0.32, 0, 0.32]){
      const len = dx === 0 ? 1.0 : 0.75;
      b.add(bronze, cyl(0.045, 0.05, len, 10), V(dx, 1.72, 0.75 + len / 2 - 0.1), RX);
      b.add(Mat.metal(0xfde68a, 0.15), new THREE.ConeGeometry(0.09, 0.28, 8), V(dx, 1.72, 0.7 + len), RX);
      b.add(bronze, new THREE.ConeGeometry(0.05, 0.16, 6), V(dx + (dx >= 0 ? 0.06 : -0.06), 1.72, 0.55 + len), [Math.PI / 2, 0, dx >= 0 ? -0.8 : 0.8]);
    }
    b.add(bronze, box(0.74, 0.08, 0.08, 0.02), V(0, 1.72, 0.66));
    tip = V(0, 1.72, 1.8);
  } else if(style === 'chave'){
    // chave inglesa gigante
    const steel = Mat.metal(0xcbd5e1, 0.2), dark = Mat.metal(0x334155, 0.35);
    b.add(steel, box(0.2, 2.3, 0.1, 0.04), V(0, 0.65, 0)); grip(Mat.polymer(0xdc2626));
    const jaw = new THREE.Shape(); jaw.moveTo(-0.35, 0); jaw.lineTo(-0.35, 0.55); jaw.lineTo(-0.12, 0.55); jaw.lineTo(-0.12, 0.22); jaw.lineTo(0.12, 0.22); jaw.lineTo(0.12, 0.62); jaw.lineTo(0.38, 0.5); jaw.lineTo(0.35, 0); jaw.lineTo(-0.35, 0);
    const jg = new THREE.ExtrudeGeometry(jaw, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 }); jg.translate(0, 0, -0.07); jg.rotateY(Math.PI / 2);
    b.add(steel, jg, V(0, 1.72, 0.0), [Math.PI / 2 - 0.2, 0, 0]);
    b.add(dark, cyl(0.1, 0.1, 0.18, 14), V(0, 1.72, 0.12), [0, 0, Math.PI / 2]);
    for(let i = 0; i < 5; i++) b.add(dark, box(0.22, 0.02, 0.11), V(0, 1.6 - i * 0.05, 0.12));
    tip = V(0, 1.9, 0.6);
  } else if(style === 'guitarra'){
    // guitarra-machado: corpo em V, braço com trastes, cordas, cabeça com tarraxas
    const body = Mat.paint(0x7c3aed), black = Mat.polymer(0x111827), chrome = Mat.metal(0xe5e7eb, 0.1); glowMat = Mat.emissive(0xe879f9, 1.8);
    b.add(Mat.wood(0x3f1d0b), box(0.14, 2.4, 0.08, 0.03), V(0, 0.7, 0)); grip(black);
    for(let i = 0; i < 8; i++) b.add(chrome, box(0.15, 0.015, 0.09), V(0, 0.2 + i * 0.2, 0.005));
    const vs = new THREE.Shape(); vs.moveTo(0, 0); vs.lineTo(0.75, 0.9); vs.lineTo(0.55, 1.05); vs.lineTo(0, 0.42); vs.lineTo(-0.55, 1.05); vs.lineTo(-0.75, 0.9); vs.lineTo(0, 0);
    const vg = new THREE.ExtrudeGeometry(vs, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 }); vg.translate(0, 0, -0.08); vg.rotateX(Math.PI); vg.rotateY(Math.PI / 2);
    b.add(body, vg, V(0, 2.55, 0), [0, 0, 0]);
    b.add(glowMat, box(0.05, 0.9, 0.2, 0.02), V(0, 2.2, 0.22), [0.7, 0, 0]);
    b.add(black, box(0.18, 0.35, 0.1, 0.03), V(0, -0.45, 0));
    for(const sd of [-1, 1]) for(let i = 0; i < 3; i++) b.add(chrome, cyl(0.025, 0.025, 0.12, 6), V(sd * 0.12, -0.55 + i * 0.1, 0), [0, 0, Math.PI / 2]);
    tip = V(0, 2.2, 0.9);
  } else if(style === 'pirulito'){
    const stick = Mat.polymer(0xfafafa); glowMat = null;
    handle(stick, 2.0, 0.045); grip(Mat.leather(0xbe185d));
    const swirlA = Mat.paint(0xf472b6), swirlB = Mat.paint(0xfde047), swirlC = Mat.paint(0x38bdf8);
    for(let i = 0; i < 18; i++){
      const t = i / 18, a = t * Math.PI * 6, r = 0.12 + t * 0.55;
      b.add([swirlA, swirlB, swirlC][i % 3], new THREE.SphereGeometry(0.16 + t * 0.05, 12, 8), V(0, 1.95 + Math.sin(a) * r, Math.cos(a) * r * 0.9), null, V(0.8, 1, 1));
    }
    b.add(swirlA, cyl(0.64, 0.64, 0.22, 28), V(0, 1.95, 0), [0, 0, Math.PI / 2]);
    b.add(Mat.glass(0xffffff), cyl(0.68, 0.68, 0.24, 28), V(0, 1.95, 0), [0, 0, Math.PI / 2]);
    tip = V(0, 1.95, 0.7);
  } else if(style === 'katana'){
    // v18: katana — lâmina curva extrudida, tsuba, cabo entrançado
    const steel = Mat.metal(0xe5e7eb, 0.08), dark = Mat.polymer(0x111827), red = Mat.cloth(0xb91c1c, 'fabric'); glowMat = Mat.emissive(0xf87171, 2.4);
    b.add(dark, cyl(0.06, 0.065, 1.0, 12), V(0, 0.0, 0));
    for(let i = 0; i < 7; i++) b.add(red, box(0.14, 0.05, 0.14, 0.02), V(0, -0.4 + i * 0.13, 0), [0, i * 0.8, 0.5]);
    b.add(Mat.metal(0xd4a02a, 0.2), cyl(0.2, 0.2, 0.05, 20), V(0, 0.55, 0));
    const bl = new THREE.Shape(); bl.moveTo(-0.06, 0); bl.lineTo(0.06, 0); bl.quadraticCurveTo(0.14, 1.4, 0.02, 2.5); bl.lineTo(-0.02, 2.2); bl.quadraticCurveTo(0.02, 1.2, -0.06, 0);
    const bg = new THREE.ExtrudeGeometry(bl, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.012, bevelSegments: 1, curveSegments: 16 }); bg.translate(0, 0, -0.015); bg.rotateY(Math.PI / 2);
    b.add(steel, bg, V(0, 0.58, 0)).add(glowMat, box(0.012, 1.7, 0.02), V(0, 1.5, -0.05));
    tip = V(0, 2.9, 0.1);
  } else if(style === 'ancora'){
    const iron = Mat.metal(0x475569, 0.35), rope = Mat.cloth(0xd6b77a, 'fabric');
    b.add(iron, cyl(0.08, 0.09, 2.3, 12), V(0, 0.7, 0)); grip(rope);
    b.add(iron, box(0.9, 0.14, 0.14, 0.04), V(0, 1.55, 0));
    b.add(iron, new THREE.TorusGeometry(0.2, 0.05, 8, 18), V(0, -0.62, 0));
    b.add(iron, new THREE.TorusGeometry(0.62, 0.075, 8, 24, Math.PI), V(0, 1.9, 0), [0, Math.PI / 2, Math.PI]);
    for(const sz of [-1, 1]) b.add(Mat.metal(0x94a3b8, 0.2), new THREE.ConeGeometry(0.16, 0.42, 4), V(0, 1.98, sz * 0.62), [sz * -0.6, 0, 0]);
    tip = V(0, 1.95, 0.7);
  } else if(style === 'taco'){
    const bat = Mat.wood(0xd9b27c); glowMat = Mat.emissive(0xfde047, 2.2);
    b.add(bat, cyl(0.19, 0.06, 2.2, 18), V(0, 0.95, 0)).add(bat, new THREE.SphereGeometry(0.19, 16, 10), V(0, 2.05, 0), null, V(1, 0.4, 1)); grip(Mat.polymer(0x1d4ed8));
    b.add(Mat.polymer(0x1d4ed8), cyl(0.09, 0.09, 0.06, 14), V(0, -0.3, 0));
    for(let i = 0; i < 4; i++){ const st = new THREE.OctahedronGeometry(0.06, 0); b.add(glowMat, st, V(Math.sin(i * 1.6) * 0.14, 1.2 + i * 0.22, Math.cos(i * 1.6) * 0.14)); }
    tip = V(0, 2.1, 0.15);
  } else if(style === 'osso'){
    const bone = Mat.polymer(0xf5efe0);
    b.add(bone, cyl(0.1, 0.12, 2.1, 12), V(0, 0.8, 0)); grip(Mat.leather(0x78350f));
    for(const sx of [-1, 1]){ b.add(bone, new THREE.SphereGeometry(0.2, 14, 10), V(sx * 0.13, 1.95, 0)); b.add(bone, new THREE.SphereGeometry(0.16, 12, 8), V(sx * 0.1, -0.35, 0)); }
    tip = V(0, 2.05, 0.1);
  } else if(style === 'viking'){
    const steel = Mat.metal(0x9ca3af, 0.2); glowMat = Mat.emissive(0x38bdf8, 2.4);
    handle(Mat.wood(0x4a2f1c), 2.3, 0.06); grip(Mat.leather(0x292524));
    const blade = new THREE.Shape(); blade.moveTo(0, -0.22); blade.quadraticCurveTo(0.4, -0.5, 0.62, -0.58); blade.quadraticCurveTo(0.78, 0, 0.62, 0.58); blade.quadraticCurveTo(0.4, 0.5, 0, 0.22); blade.lineTo(0, -0.22);
    for(const sd of [1, -1]){
      const bg = new THREE.ExtrudeGeometry(blade, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 12 });
      bg.translate(0, 0, -0.03); bg.rotateY(sd > 0 ? -Math.PI / 2 : Math.PI / 2);
      b.add(steel, bg, V(0, 1.62, sd * 0.06)).add(glowMat, box(0.07, 0.07, 0.07), V(0, 1.62, sd * 0.35), [0.78, 0, 0.78]);
    }
    b.add(Mat.metal(0x374151, 0.3), box(0.2, 0.46, 0.22, 0.04), V(0, 1.62, 0));
    tip = V(0, 1.62, 0.7);
  } else if(style === 'relampago'){
    glowMat = Mat.emissive(0xfde047, 3.0);
    handle(Mat.metal(0x1e293b, 0.3), 1.6, 0.06); grip(Mat.leather(0x0f172a));
    const zz = new THREE.Shape(); zz.moveTo(0, 0); zz.lineTo(0.28, 0.55); zz.lineTo(0.08, 0.55); zz.lineTo(0.38, 1.2); zz.lineTo(-0.05, 0.6); zz.lineTo(0.14, 0.6); zz.lineTo(-0.12, 0.05); zz.lineTo(0, 0);
    const zg = new THREE.ExtrudeGeometry(zz, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 }); zg.translate(0, 0, -0.05); zg.rotateY(-Math.PI / 2); zg.scale(1, 1.25, 1.25);
    b.add(glowMat, zg, V(0, 1.05, 0)).add(Mat.metal(0xe5e7eb, 0.1), cyl(0.1, 0.1, 0.12, 12), V(0, 1.06, 0));
    tip = V(0, 2.4, 0.45);
  } else if(style === 'cogumelo'){
    handle(Mat.polymer(0xf5f0e1), 2.0, 0.08); grip(Mat.leather(0x7c2d12));
    b.add(Mat.paint(0xdc2626), new THREE.SphereGeometry(0.62, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), V(0, 1.55, 0), null, V(1, 0.75, 1));
    b.add(Mat.polymer(0xf5f0e1), cyl(0.6, 0.5, 0.08, 22), V(0, 1.55, 0));
    for(let i = 0; i < 7; i++){ const a = i * 2.3, r = i ? 0.38 : 0; b.add(Mat.polymer(0xffffff), new THREE.SphereGeometry(0.09, 8, 6), V(Math.cos(a) * r, 1.55 + (i ? 0.3 : 0.47), Math.sin(a) * r), null, V(1, 0.5, 1)); }
    tip = V(0, 1.7, 0.6);
  } else if(style === 'espatula'){
    const steel = Mat.metal(0xd1d5db, 0.15);
    handle(Mat.polymer(0x111827), 1.7, 0.07); grip(Mat.polymer(0xef4444));
    b.add(steel, box(0.05, 0.5, 0.08), V(0, 1.4, 0.05), [0.35, 0, 0]);
    b.add(steel, box(0.04, 0.72, 0.62, 0.03), V(0, 1.92, 0.22), [0.35, 0, 0]);
    for(let i = 0; i < 3; i++) b.add(Mat.polymer(0x0f172a), box(0.05, 0.45, 0.06), V(0, 1.95, 0.08 + i * 0.16), [0.35, 0, 0]);
    tip = V(0, 2.2, 0.45);
  }
  b.build(g);
  g.userData.tip = marker(g, 'tip', tip);
  g.userData.glow = glowMat;
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

// v20: asa delta a sério — vela com curvatura (billow), diedro, bordo de fuga recortado entre as réguas
// e faixas de cor por vértice; estrutura com quilha, bordos de ataque, travessa, mastro e trapézio.
function deltaSail(o){
  const S = o.span || 4.3, zN = o.nose || 2.7, zT = o.tipZ || -0.55, zTail = o.tail || -1.55, zTE = o.tipTE || -1.0, NU = 28, NV = 10;
  const pos = [], col = [], idx = [], cA = new THREE.Color(o.c1 || 0xef4444), cB = new THREE.Color(o.c2 || 0xf8fafc), cC = new THREE.Color(o.c3 || 0x1f2937), c = new THREE.Color();
  for(let j = 0; j <= NV; j++) for(let i = 0; i <= NU; i++){
    const u = i / NU * 2 - 1, v = j / NV, au = Math.abs(u);
    const le = zN + (zT - zN) * au, te = zTail + (zTE - zTail) * au + Math.abs(Math.sin(au * Math.PI * 3)) * 0.22;
    const x = u * S * (1 - v * 0.04), z = le + (te - le) * v;
    const y = Math.sin(v * Math.PI) * 0.34 * (1 - au * au) + au * 0.42 - v * au * 0.18;
    pos.push(x, y, z);
    const band = o.pattern === 'chevron' ? Math.floor((au * 3 - v * 1.2) + 10) % 3 : o.pattern === 'tips' ? (au > 0.7 ? 2 : au > 0.62 ? 1 : 0) : (au < 0.12 ? 1 : au > 0.78 ? 2 : (Math.floor(au * 5) % 2 ? 1 : 0));
    c.copy(band === 0 ? cA : band === 1 ? cB : cC); if(v > 0.92) c.multiplyScalar(0.8);
    col.push(c.r, c.g, c.b);
  }
  for(let j = 0; j < NV; j++) for(let i = 0; i < NU; i++){ const a = j * (NU + 1) + i, b = a + 1, d = a + NU + 1, e = d + 1; idx.push(a, d, b, b, d, e); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  return { geo: g, S, zN, zT, zTail };
}
function tubeTo(b, mat, a, c, r){ const d = c.clone().sub(a), L = d.length(); const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize()); const e = new THREE.Euler().setFromQuaternion(q); b.add(mat, cyl(r, r, L, 6), a.clone().add(c).multiplyScalar(0.5), [e.x, e.y, e.z]); }
function deltaFrame(g, b, o, sail, frameMat){
  const Y = o.y || 2.1, wire = Mat.metal(0xd1d5db, 0.2), dark = frameMat;
  const nose = V(0, Y + 0.05, sail.zN), tail = V(0, Y + 0.02, sail.zTail - 0.2), tipL = V(sail.S, Y + 0.42, sail.zT), tipR = V(-sail.S, Y + 0.42, sail.zT);
  tubeTo(b, dark, nose, tail, 0.06); tubeTo(b, dark, nose, tipL, 0.055); tubeTo(b, dark, nose, tipR, 0.055);
  const cbL = nose.clone().lerp(tipL, 0.55), cbR = nose.clone().lerp(tipR, 0.55); tubeTo(b, dark, cbL, cbR, 0.045);
  const kp = V(0, Y + 1.2, 0.15); tubeTo(b, dark, V(0, Y, 0.15), kp, 0.04);
  for(const p of [nose, tail, tipL, tipR]) tubeTo(b, wire, kp, p, 0.012);
  const hub = V(0, Y - 0.02, 0.25), bl = V(0.9, 0, 0), br = V(-0.9, 0, 0);
  tubeTo(b, dark, hub, bl, 0.035); tubeTo(b, dark, hub, br, 0.035);
  for(const p of [nose, tail, tipL, tipR]){ tubeTo(b, wire, bl, p, 0.01); tubeTo(b, wire, br, p, 0.01); }
  // réguas (battens) por cima da vela
  for(let k = 1; k <= 4; k++){ for(const sd of [1, -1]){ const au = k / 5, le = V(sd * au * sail.S, Y + au * 0.42 + 0.03, sail.zN + (sail.zT - sail.zN) * au), te = V(sd * au * sail.S * 0.96, Y + au * 0.24 + 0.03, (o.tail || -1.55) + ((o.tipTE || -1.0) - (o.tail || -1.55)) * au); tubeTo(b, Mat.polymer(0x111827), le, te, 0.015); } }
  // winglets nas pontas
  if(o.winglets !== false) for(const tp of [tipL, tipR]){ const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute([tp.x, tp.y, tp.z + 0.2, tp.x, tp.y + 0.7, tp.z - 0.5, tp.x, tp.y, tp.z - 0.6], 3)); wg.computeVertexNormals(); const mm = Mat.paint(o.c3 || 0x1f2937).clone(); mm.side = THREE.DoubleSide; const w = new THREE.Mesh(wg, mm); w.castShadow = true; g.add(w); }
  return { nose, tail, tipL, tipR };
}
export function createGlider(color, style){
  style = style || 'classico';
  const g = new THREE.Group(); g.userData.style = style;
  const frame = Mat.metal(0x333a44, 0.3);
  const b = new WB();
  // barra de pega (mãos em ±0.75, altura ~0)
  b.add(frame, cyl(0.04, 0.04, 1.8, 8), V(0, 0, 0), [0, 0, Math.PI / 2]);
  const bendPlane = (w, h, sag, arch) => { const pg = new THREE.PlaneGeometry(w, h, 24, 8); const pos = pg.attributes.position; for(let i = 0; i < pos.count; i++){ const x = pos.getX(i), y = pos.getY(i); pos.setZ(i, -Math.pow(x / (w / 2), 2) * sag + Math.sin((y + h / 2) / h * Math.PI) * arch); } pg.computeVertexNormals(); return pg; };
  const cloth = (c) => { const m = Mat.cloth(c, 'fabric').clone(); m.side = THREE.DoubleSide; return m; };
  if(style === 'classico' || style === 'deltapro' || style === 'falcao' || style === 'neon'){
    const pal = { classico: { c1: color || 0xef4444, c2: 0xf8fafc, c3: 0x1f2937, pattern: 'bands' }, deltapro: { c1: 0x0ea5e9, c2: 0xfacc15, c3: 0x0f172a, pattern: 'chevron' }, falcao: { c1: 0x78350f, c2: 0xd6a26a, c3: 0x1c1917, pattern: 'tips', span: 4.8, tipZ: -0.2, tipTE: -1.3 }, neon: { c1: 0x0f172a, c2: 0x1e1b4b, c3: 0xf0abfc, pattern: 'tips' } }[style];
    const sail = deltaSail(pal);
    const sm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: style === 'neon' ? 0.3 : 0.7, metalness: style === 'neon' ? 0.4 : 0, side: THREE.DoubleSide });
    if(style === 'neon'){ sm.emissive = new THREE.Color(0x2a0a3a); }
    const w = new THREE.Mesh(sail.geo, sm); w.position.y = 2.1; w.castShadow = true; g.add(w); g.userData.wing = w;
    const fr = deltaFrame(g, b, Object.assign({ y: 2.1 }, pal), sail, style === 'neon' ? Mat.emissive(0xf0abfc, 2.6).clone() : Mat.metal(0x374151, 0.3));
    if(style === 'neon') g.userData.pulse = b.m.keys().next().value;
    if(style === 'falcao'){
      // penas nas pontas (primárias) + cauda em leque
      const fm = Mat.cloth(0x3f2a1a, 'fabric').clone(); fm.side = THREE.DoubleSide;
      for(const sd of [1, -1]) for(let k = 0; k < 5; k++){ const f = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 1.5), fm); f.rotation.x = -Math.PI / 2; f.rotation.z = sd * (0.25 + k * 0.16); f.position.set(sd * (4.5 + k * 0.08), 2.55, -0.55 - k * 0.22); f.castShadow = true; g.add(f); }
      for(let k = 0; k < 7; k++){ const f = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 1.6), fm); f.rotation.x = -Math.PI / 2 + 0.15; f.rotation.z = (k - 3) * 0.16; f.position.set((k - 3) * 0.2, 2.05, -2.3); g.add(f); }
    }
  } else if(style === 'jato'){
    b.add(frame, cyl(0.03, 0.03, 2.2, 8), V(0.85, 1.0, 0), [0, 0, 0.55]).add(frame, cyl(0.03, 0.03, 2.2, 8), V(-0.85, 1.0, 0), [0, 0, -0.55]);
    const w = new THREE.Mesh(bendPlane(6, 2.6, 0.9, 0.3), (style === 'jato' ? (() => { const m = Mat.metal(0x94a3b8, 0.35).clone(); m.side = THREE.DoubleSide; return m; })() : cloth(color || 0xef4444))); w.rotation.x = -Math.PI / 2 + 0.25; w.position.y = 2.0; w.castShadow = true; g.add(w); g.userData.wing = w;
    if(style === 'jato'){
      const glow = Mat.emissive(0x38bdf8, 3);
      for(const sx of [-1.6, 1.6]){ b.add(Mat.metal(0x9ca3af, 0.2), cyl(0.22, 0.28, 0.9, 16), V(sx, 1.85, -0.9), RX); b.add(glow, cyl(0.18, 0.18, 0.05, 16), V(sx, 1.85, -1.36), RX); }
      g.userData.thrusters = [V(-1.6, 1.85, -1.5), V(1.6, 1.85, -1.5)];
    }
  } else if(style === 'guardachuva'){
    b.add(frame, cyl(0.035, 0.035, 2.4, 8), V(0, 1.2, 0));
    const cone = new THREE.ConeGeometry(3.1, 1.1, 16, 1, true); const cm = new THREE.Mesh(cone, cloth(color || 0xfbbf24)); cm.position.y = 2.75; cm.castShadow = true; g.add(cm); g.userData.wing = cm;
    const ribs = Mat.metal(0xd4a02a, 0.2); for(let i = 0; i < 8; i++){ const a = i / 8 * Math.PI * 2; b.add(ribs, cyl(0.02, 0.02, 3.2, 5), V(Math.cos(a) * 1.5, 2.72, Math.sin(a) * 1.5), [Math.sin(a) * 1.22, 0, -Math.cos(a) * 1.22]); }
    b.add(Mat.metal(0xd4a02a, 0.2), new THREE.SphereGeometry(0.12, 10, 8), V(0, 3.35, 0));
  } else if(style === 'asas'){
    // duas asas articuladas (batem) — membrana + ossos
    const mem = cloth(0x7f1d1d), bone = Mat.polymer(0x292524);
    const wings = [];
    for(const sd of [1, -1]){
      const wj = new THREE.Group(); wj.position.set(sd * 0.3, 1.9, -0.2); g.add(wj);
      const shp = new THREE.Shape(); shp.moveTo(0, 0); shp.lineTo(sd * 3.4, 0.9); shp.lineTo(sd * 3.0, -0.4); shp.lineTo(sd * 2.2, -0.2); shp.lineTo(sd * 1.8, -0.9); shp.lineTo(sd * 1.1, -0.5); shp.lineTo(sd * 0.6, -1.1); shp.lineTo(0, -0.4);
      const mg = new THREE.ShapeGeometry(shp, 8); mg.rotateX(-Math.PI / 2 + 0.2);
      const mm = new THREE.Mesh(mg, mem); mm.castShadow = true; wj.add(mm);
      const bb = new WB(); bb.add(bone, cyl(0.06, 0.03, 3.5, 6), V(sd * 1.7, 0.2, -0.45), [Math.PI / 2 - 0.2, 0, sd * (Math.PI / 2 - 0.26)]); bb.build(wj);
      wings.push(wj);
    }
    b.add(frame, cyl(0.03, 0.03, 2.0, 8), V(0.4, 0.95, -0.1), [0, 0, 0.3]).add(frame, cyl(0.03, 0.03, 2.0, 8), V(-0.4, 0.95, -0.1), [0, 0, -0.3]);
    g.userData.flap = wings;
  } else if(style === 'folha'){
    const leaf = new THREE.Shape(); leaf.moveTo(0, -1.6); leaf.quadraticCurveTo(2.8, -0.6, 0, 1.8); leaf.quadraticCurveTo(-2.8, -0.6, 0, -1.6);
    const lg = new THREE.ShapeGeometry(leaf, 16); const pos = lg.attributes.position; for(let i = 0; i < pos.count; i++){ const x = pos.getX(i); pos.setZ(i, -x * x * 0.12); } lg.computeVertexNormals(); lg.rotateX(-Math.PI / 2);
    const lm = new THREE.Mesh(lg, cloth(0x4d7c0f)); lm.position.y = 2.3; lm.castShadow = true; g.add(lm); g.userData.wing = lm;
    b.add(Mat.wood(0x65a30d), cyl(0.05, 0.03, 3.4, 6), V(0, 2.32, 0), RX).add(Mat.wood(0x3f6212), cyl(0.04, 0.04, 2.3, 6), V(0, 1.15, 0));
  } else if(style === 'balao'){
    // v15: cacho de balões com fios
    const cols = [0xef4444, 0xfbbf24, 0x22c55e, 0x3b82f6, 0xa855f7, 0xec4899, 0xf97316];
    const line = Mat.polymer(0xe5e7eb);
    for(let i = 0; i < 7; i++){
      const a = i / 7 * Math.PI * 2, r = i === 0 ? 0 : 1.0, px = Math.cos(a) * r, pz = Math.sin(a) * r, py = 4.2 + (i === 0 ? 0.6 : Math.sin(i * 2.3) * 0.3);
      const m = new THREE.MeshPhysicalMaterial({ color: cols[i], roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.3 });
      const bm = new THREE.Mesh(new THREE.SphereGeometry(0.78, 20, 16), m); bm.scale.set(1, 1.18, 1); bm.position.set(px, py, pz); bm.castShadow = true; g.add(bm);
      b.add(Mat.paint(cols[i]), new THREE.ConeGeometry(0.1, 0.16, 8), V(px, py - 0.95, pz), [Math.PI, 0, 0]);
      const d = new THREE.Vector3(px, py - 1, pz); const L = d.length();
      b.add(line, cyl(0.012, 0.012, L, 4), d.clone().multiplyScalar(0.5), null, null);
      g.userData.balloons = g.userData.balloons || []; g.userData.balloons.push(bm);
    }
  } else if(style === 'paraquedas'){
    // paraquedas militar: cúpula em gomos + cordas
    const cols = [0x4d7c0f, 0x3f6212];
    for(let i = 0; i < 12; i++){
      const seg = new THREE.SphereGeometry(3.2, 4, 10, i / 12 * Math.PI * 2, Math.PI * 2 / 12, 0, Math.PI * 0.42);
      const m = new THREE.Mesh(seg, cloth(cols[i % 2])); m.position.y = 1.6; m.scale.set(1, 0.62, 1); m.castShadow = true; g.add(m);
    }
    g.userData.wing = g.children[g.children.length - 1];
    const rope = Mat.polymer(0xd6d3d1);
    for(let i = 0; i < 8; i++){ const a = i / 8 * Math.PI * 2, top = V(Math.cos(a) * 2.95, 1.6 + 3.2 * 0.62 * Math.cos(Math.PI * 0.42), Math.sin(a) * 2.95), bot = V(Math.cos(a) * 0.8, 0, Math.sin(a) * 0.1); const d = top.clone().sub(bot), L = d.length(); const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize()); const e = new THREE.Euler().setFromQuaternion(q); b.add(rope, cyl(0.015, 0.015, L, 4), bot.clone().add(top).multiplyScalar(0.5), [e.x, e.y, e.z]); }
  } else if(style === 'borboleta'){
    // asas de borboleta translúcidas que batem (reusa o mecanismo 'flap')
    const wings = [];
    for(const sd of [1, -1]){
      const wj = new THREE.Group(); wj.position.set(sd * 0.25, 1.9, -0.2); g.add(wj);
      const up = new THREE.Shape(); up.moveTo(0, 0); up.bezierCurveTo(sd * 1.2, 1.9, sd * 3.2, 1.7, sd * 3.0, 0.2); up.bezierCurveTo(sd * 2.4, -0.4, sd * 1.2, -0.2, 0, 0);
      const lo = new THREE.Shape(); lo.moveTo(0, 0); lo.bezierCurveTo(sd * 1.6, -0.3, sd * 2.4, -1.4, sd * 1.4, -1.9); lo.bezierCurveTo(sd * 0.6, -1.9, sd * 0.2, -1.0, 0, 0);
      for(const [shp, c] of [[up, 0x22d3ee], [lo, 0xa855f7]]){
        const mg = new THREE.ShapeGeometry(shp, 16); mg.rotateX(-Math.PI / 2 + 0.2);
        const mm = new THREE.Mesh(mg, new THREE.MeshPhysicalMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, roughness: 0.3, transparent: true, opacity: 0.82, side: THREE.DoubleSide, iridescence: 1, iridescenceIOR: 1.5 }));
        mm.castShadow = true; wj.add(mm);
      }
      wings.push(wj);
    }
    b.add(Mat.polymer(0x1f2937), cyl(0.09, 0.07, 1.4, 10), V(0, 1.9, -0.2), RX);
    b.add(frame, cyl(0.03, 0.03, 2.0, 8), V(0.4, 0.95, -0.1), [0, 0, 0.3]).add(frame, cyl(0.03, 0.03, 2.0, 8), V(-0.4, 0.95, -0.1), [0, 0, -0.3]);
    g.userData.flap = wings;
  } else if(style === 'disco'){
    // disco voador: casco metálico, cúpula de vidro, anel de luzes
    const hull = Mat.metal(0xcbd5e1, 0.18), glow = Mat.emissive(0x4ade80, 2.6);
    b.add(hull, new THREE.SphereGeometry(2.6, 36, 12), V(0, 2.6, 0), null, V(1, 0.22, 1));
    b.add(Mat.metal(0x64748b, 0.3), new THREE.TorusGeometry(2.55, 0.12, 8, 48), V(0, 2.6, 0), RX);
    for(let i = 0; i < 12; i++){ const a = i / 12 * Math.PI * 2; b.add(glow, new THREE.SphereGeometry(0.13, 10, 8), V(Math.cos(a) * 2.35, 2.45, Math.sin(a) * 2.35)); }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.0, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), Mat.glass(0xa7f3d0)); dome.position.y = 2.95; g.add(dome);
    b.add(glow, cyl(0.9, 1.3, 0.12, 24), V(0, 2.28, 0));
    b.add(frame, cyl(0.03, 0.03, 2.3, 8), V(0.7, 1.15, 0), [0, 0, 0.5]).add(frame, cyl(0.03, 0.03, 2.3, 8), V(-0.7, 1.15, 0), [0, 0, -0.5]);
    g.userData.pulse = glow;
  } else if(style === 'tapete'){
    // v16: tapete mágico — tecido ondulante com franjas e padrão (faixas por vértice)
    const pg = new THREE.PlaneGeometry(5.4, 3.4, 30, 12); pg.rotateX(-Math.PI / 2);
    const cols = new Float32Array(pg.attributes.position.count * 3), cA = new THREE.Color(0x7c2d12), cB = new THREE.Color(0xf59e0b), cC = new THREE.Color(0x1e3a8a);
    for(let i = 0; i < pg.attributes.position.count; i++){ const x = pg.attributes.position.getX(i), z = pg.attributes.position.getZ(i); const e = Math.max(Math.abs(x) / 2.7, Math.abs(z) / 1.7); const c = e > 0.86 ? cB : (Math.floor((Math.abs(x) + Math.abs(z)) * 1.6) % 2 ? cA : cC); cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
    pg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const cm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    const carpet = new THREE.Mesh(pg, cm); carpet.position.set(0, 2.6, -0.3); carpet.castShadow = true; g.add(carpet);
    carpet.userData.base = pg.attributes.position.array.slice(); g.userData.carpet = carpet;
    for(let i = 0; i < 14; i++) b.add(Mat.paint(0xfbbf24), cyl(0.03, 0.01, 0.5, 4), V(-2.6 + i * 0.4, 2.35, 1.4));
    b.add(Mat.cloth(0xfbbf24, 'fabric'), cyl(0.025, 0.025, 2.7, 6), V(1.4, 1.3, 0), [0, 0, 0.6]).add(Mat.cloth(0xfbbf24, 'fabric'), cyl(0.025, 0.025, 2.7, 6), V(-1.4, 1.3, 0), [0, 0, -0.6]);
  } else if(style === 'neon_v16'){
    // v16: asa delta de néon (arestas emissivas pulsantes)
    const shp = new THREE.Shape(); shp.moveTo(0, 2.2); shp.lineTo(3.4, -1.2); shp.lineTo(0, -0.5); shp.lineTo(-3.4, -1.2); shp.closePath();
    const wg = new THREE.ShapeGeometry(shp); wg.rotateX(-Math.PI / 2 + 0.18);
    const w = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.6, roughness: 0.25, side: THREE.DoubleSide })); w.position.y = 2.2; w.castShadow = true; g.add(w); g.userData.wing = w;
    const glow = Mat.emissive(0xf0abfc, 3).clone();
    const edges = [[V(0, 0, -2.2), V(3.4, 0, 1.2)], [V(0, 0, -2.2), V(-3.4, 0, 1.2)], [V(3.4, 0, 1.2), V(0, 0, 0.5)], [V(-3.4, 0, 1.2), V(0, 0, 0.5)]];
    for(const [a0, b0] of edges){ const d = b0.clone().sub(a0), L = d.length(); const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize()); const e = new THREE.Euler().setFromQuaternion(q); b.add(glow, cyl(0.07, 0.07, L, 6), a0.clone().add(b0).multiplyScalar(0.5).add(V(0, 2.25, 0)), [e.x, e.y, e.z]); }
    b.add(frame, cyl(0.03, 0.03, 2.2, 8), V(0.5, 1.1, 0), [0, 0, 0.45]).add(frame, cyl(0.03, 0.03, 2.2, 8), V(-0.5, 1.1, 0), [0, 0, -0.45]);
    g.userData.pulse = glow;
  } else if(style === 'pipa'){
    // v16: pipa (papagaio de papel) com cauda de laços que ondula
    const kg = new THREE.BufferGeometry(); kg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -2.6, 2, 0, 0, 0, 0, 1.6, 0, 0, -2.6, 0, 0, 1.6, -2, 0, 0], 3)); kg.computeVertexNormals();
    const k1 = new THREE.Mesh(kg, cloth(color || 0x22c55e)); k1.position.y = 2.6; k1.rotation.x = 0.25; k1.castShadow = true; g.add(k1); g.userData.wing = k1;
    b.add(Mat.wood(0x92400e), cyl(0.03, 0.03, 4.2, 5), V(0, 2.6, -0.5), RX).add(Mat.wood(0x92400e), cyl(0.03, 0.03, 4, 5), V(0, 2.6, 0), [0, 0, Math.PI / 2]);
    b.add(frame, cyl(0.02, 0.02, 2.6, 5), V(0.5, 1.3, 0), [0, 0, 0.4]).add(frame, cyl(0.02, 0.02, 2.6, 5), V(-0.5, 1.3, 0), [0, 0, -0.4]);
    const tail = []; const bowC = [0xef4444, 0xfbbf24, 0x3b82f6, 0xa855f7, 0xef4444];
    let parent = g; for(let i = 0; i < 5; i++){ const seg = new THREE.Group(); seg.position.set(0, i === 0 ? 2.6 : 0, i === 0 ? 1.8 : 0.75); parent.add(seg); const bow = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), Mat.paint(bowC[i])); bow.scale.set(1.6, 0.4, 0.8); seg.add(bow); tail.push(seg); parent = seg; }
    g.userData.tail = tail;
  } else if(style === 'dirigivel'){
    // v16: mini dirigível com hélice e barquinha
    const env = new THREE.Mesh(new THREE.SphereGeometry(1.5, 24, 14), Mat.paint(0xe11d48)); env.scale.set(1, 1, 2.2); env.position.y = 3.6; env.castShadow = true; g.add(env);
    for(let i = 0; i < 3; i++){ const r = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.05, 6, 32), Mat.paint(0xf8fafc)); r.position.set(0, 3.6, -1.6 + i * 1.6); r.scale.set(1, 1, 1); r.rotation.set(0, 0, 0); const k = Math.sqrt(1 - Math.pow((-1.6 + i * 1.6) / 3.3, 2)); r.scale.set(k, k, 1); g.add(r); }
    for(const [x, y, rz] of [[0, 1, 0], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]]) b.add(Mat.paint(0xf8fafc), box(0.08, 1.1, 0.9), V(x * 0.9, 3.6 + y * 0.9, -3.0), [0, 0, rz]);
    b.add(Mat.wood(0x78350f), box(1.0, 0.4, 1.4, 0.1), V(0, 2.0, 0)).add(frame, cyl(0.02, 0.02, 1.8, 4), V(0.4, 2.8, 0), [0, 0, 0.2]).add(frame, cyl(0.02, 0.02, 1.8, 4), V(-0.4, 2.8, 0), [0, 0, -0.2]);
    b.add(frame, cyl(0.03, 0.03, 2.0, 6), V(0.45, 1.0, 0), [0, 0, 0.45]).add(frame, cyl(0.03, 0.03, 2.0, 6), V(-0.45, 1.0, 0), [0, 0, -0.45]);
    const prop = new THREE.Group(); prop.position.set(0, 3.6, -3.4); g.add(prop);
    for(let i = 0; i < 3; i++){ const bl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.04), Mat.metal(0x374151, 0.3)); bl.position.y = 0.5; const pv = new THREE.Group(); pv.rotation.z = i / 3 * Math.PI * 2; pv.add(bl); prop.add(pv); }
    g.userData.spin = prop;
  } else if(style === 'fenix'){
    // v16: asas de fénix em chamas (batem e largam fogo)
    const wings = [], fire = Mat.emissive(0xff6a00, 2.4), fire2 = Mat.emissive(0xfbbf24, 2.8);
    for(const sd of [1, -1]){
      const wj = new THREE.Group(); wj.position.set(sd * 0.3, 1.9, -0.2); g.add(wj);
      for(let f = 0; f < 6; f++){ const fe = new THREE.Mesh(new THREE.ConeGeometry(0.28, 2.2 - f * 0.18, 5), f % 2 ? fire2 : fire); fe.rotation.z = sd * (Math.PI / 2 + 0.1 + f * 0.12); fe.rotation.x = -0.25; fe.position.set(sd * (0.6 + f * 0.48), 0.1 - f * 0.08, 0.2 + f * 0.04); wj.add(fe); }
      wings.push(wj);
    }
    b.add(frame, cyl(0.03, 0.03, 2.0, 8), V(0.4, 0.95, -0.1), [0, 0, 0.3]).add(frame, cyl(0.03, 0.03, 2.0, 8), V(-0.4, 0.95, -0.1), [0, 0, -0.3]);
    g.userData.flap = wings; g.userData.fire = [V(-2.4, 1.8, 0), V(2.4, 1.8, 0), V(0, 1.9, -0.6)];
  } else if(style === 'nuvem'){
    // v16: nuvem fofa (esferas) que se deforma suavemente
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xdbeafe, emissiveIntensity: 0.25 });
    const puffs = [];
    for(let i = 0; i < 9; i++){ const a = i / 9 * Math.PI * 2, r = i === 0 ? 0 : 1.6; const s = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0 + (i % 3) * 0.25, 2), m); s.position.set(Math.cos(a) * r, 3.1 + (i % 2) * 0.35, Math.sin(a) * r * 0.8); s.castShadow = true; g.add(s); puffs.push(s); }
    b.add(frame, cyl(0.03, 0.03, 2.6, 8), V(0.5, 1.3, 0), [0, 0, 0.4]).add(frame, cyl(0.03, 0.03, 2.6, 8), V(-0.5, 1.3, 0), [0, 0, -0.4]);
    g.userData.balloons = puffs;
  }
  b.build(g);
  return g;
}
