// ============================================================
// POIs (v16) — locais nomeados ao estilo Fortnite:
//   Torres Tortas (cidade com prédios de 2–4 andares, escadas, telhados)
//   Fábrica Ferrugem (armazéns, contentores empilhados, grua)
//   Posto Poeira (bombas, loja, carros) no Deserto Seco
//   Farol Solitário (galeria no topo + feixe rotativo)
//   Pico Nevado (cabana no planalto da montanha)
//   Ponte do Rio Serpente
// Tudo o que é "de cidade" usa PieceBank: peças instanciadas (1 draw
// call por tipo/material) com colisão, vida e coleta de material
// (tijolo → pedra, chapa/carros → metal). Tiros, explosões e a
// picareta destroem peças; barris vermelhos explodem.
// ============================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Mat } from '../engine/materials.js';

export const GRID = 16, WALL_H = 13;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3(), _e = new THREE.Euler(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// ---------------- locais nomeados ----------------
export const LOCATIONS = [
  { n: 'Farol Solitário', x: 30, z: -370, r: 40 },
  { n: 'Rio Serpente', x: -110, z: -118, r: 38 },
  { n: 'Lago Sereno', x: -60, z: -40, r: 38 },
  { n: 'Praça Central', x: 0, z: -10, r: 45 },
  { n: 'Recanto Leste', x: 190, z: 90, r: 40 },
  { n: 'Quinta do Norte', x: -40, z: 200, r: 45 },
  { n: 'Vale dos Pinheiros', x: 120, z: -110, r: 45 },
  { n: 'Posto Poeira', x: -285, z: 118, r: 55 },
  { n: 'Torres Tortas', x: 215, z: 196, r: 72 },
  { n: 'Fábrica Ferrugem', x: 215, z: -205, r: 72 },
  { n: 'Pico Nevado', x: -245, z: -235, r: 95 },
  { n: 'Deserto Seco', x: -300, z: 140, r: 130 },
  // v18: anel exterior do mapa maior
  { n: 'Porto Pesqueiro', x: 500, z: -30, r: 70 },
  { n: 'Templo Perdido', x: 40, z: 480, r: 60 },
  { n: 'Moinhos Altos', x: -480, z: -70, r: 60 },
  { n: 'Cratera Vulcânica', x: 335, z: 335, r: 100 },
  { n: 'Base Científica', x: 330, z: -400, r: 60 },
  { n: 'Acampamento Pinhal', x: -330, z: 370, r: 55 }
];
export function locationAt(x, z){ for(const L of LOCATIONS) if(Math.hypot(x - L.x, z - L.z) < L.r) return L; return null; }
// zonas sem vegetação/objetos aleatórios (retângulos x0,z0,x1,z1)
// 5.º valor = 1 → zona sem calçada (só sem vegetação)
export const ZONES = [[167, 147, 263, 245], [165, -255, 272, -160], [-312, 80, -255, 150], [18, -384, 44, -356, 1], [-262, -252, -228, -218, 1],
  [455, -75, 560, 15], [8, 440, 72, 520, 1], [-515, -105, -445, -35, 1], [300, -432, 362, -368], [-352, 350, -306, 392, 1]];
// estradas de terra (centro → locais)
export const ROADS = [[0, -10, 215, 196], [0, -10, 215, -205], [0, -10, -285, 118], [0, -10, 30, -345], [-60, -40, -150, -168], [0, -10, -40, 200], [215, 196, 190, 90],
  [190, 90, 330, 40], [330, 40, 470, -30], [-40, 200, 80, 330], [80, 330, 40, 445], [-220, 20, -330, -40], [-330, -40, -455, -70], [-285, 118, -330, 350], [215, -205, 330, -370], [215, 196, 272, 272]];

// ---------------- helpers de geometria ----------------
function norm(g, color){
  g = g.index ? g.toNonIndexed() : g.clone();
  Object.keys(g.attributes).forEach(k => { if(!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); });
  if(!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if(color !== undefined){ const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3); for(let i = 0; i < n; i++){ a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
  return g;
}
function B(w, h, d, x, y, z, color, rx, ry, rz){ const g = new THREE.BoxGeometry(w, h, d); if(rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0))); g.translate(x, y, z); return norm(g, color); }
function C(rt, rb, h, x, y, z, color, seg, rx, rz){ const g = new THREE.CylinderGeometry(rt, rb, h, seg || 14); if(rx || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx || 0, 0, rz || 0))); g.translate(x, y, z); return norm(g, color); }
function worldUV(g, s){
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for(let i = 0; i < p.count; i++){
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)), x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if(ay >= ax && ay >= az) uv.setXY(i, x / s, z / s); else if(ax >= az) uv.setXY(i, z / s, y / s); else uv.setXY(i, x / s, y / s);
  }
  return g;
}
const merge = (list) => { const g = mergeGeometries(list); g.computeBoundingBox(); g.computeBoundingSphere(); return g; };

// ---------------- geometrias das peças da cidade ----------------
const GEO = {};
function wallGeo(v){
  const k = 'wall_' + v; if(GEO[k]) return GEO[k];
  const T = 0.8, parts = [], boxes = [];
  const panel = (x0, x1, y0, y1) => { if(x1 - x0 < 0.05 || y1 - y0 < 0.05) return; parts.push(B(x1 - x0, y1 - y0, T, (x0 + x1) / 2, (y0 + y1) / 2, 0)); boxes.push([x0, y0, -T / 2, x1, y1, T / 2]); };
  const hole = v === 'window' ? [-3.2, 3.2, 4.2, 9.4] : v === 'door' ? [-2.8, 2.8, 0, 9.6] : v === 'bigdoor' ? [-7.4, 7.4, 0, 11] : v === 'wide' ? [-6, 6, 4.2, 9.4] : null;
  if(!hole) panel(-GRID / 2, GRID / 2, 0, WALL_H);
  else {
    panel(-GRID / 2, hole[0], 0, WALL_H); panel(hole[1], GRID / 2, 0, WALL_H); panel(hole[0], hole[1], hole[3], WALL_H); if(hole[2] > 0) panel(hole[0], hole[1], 0, hole[2]);
    // moldura/peitoril
    parts.push(B(hole[1] - hole[0] + 0.8, 0.5, T + 0.5, 0, hole[3] + 0.1, 0)); if(hole[2] > 0) parts.push(B(hole[1] - hole[0] + 1.2, 0.45, T + 0.9, 0, hole[2] - 0.1, 0));
  }
  // cornija e rodapé
  parts.push(B(GRID, 0.6, T + 0.35, 0, WALL_H - 0.3, 0), B(GRID, 0.7, T + 0.25, 0, 0.35, 0));
  const geo = merge(parts.map(g => worldUV(g, 8)));
  return (GEO[k] = { geo, boxes });
}
function floorGeo(){ if(GEO.floor) return GEO.floor; const g = worldUV(B(GRID, 0.8, GRID, 0, 0, 0), 8); g.computeBoundingBox(); g.computeBoundingSphere(); return (GEO.floor = { geo: g, boxes: [[-GRID / 2, -0.4, -GRID / 2, GRID / 2, 0.4, GRID / 2]] }); }
function stairGeo(){
  if(GEO.stair) return GEO.stair;
  const len = Math.hypot(GRID, WALL_H), a = -Math.atan2(WALL_H, GRID), parts = [B(GRID - 2, 0.6, len, 0, 0, 0)];
  for(let i = 0; i < 10; i++) parts.push(B(GRID - 2.4, 0.7, 1.0, 0, 0.45, -len / 2 + (i + 0.5) * len / 10));
  parts.push(B(0.6, 1.8, len, -GRID / 2 + 1.2, 0.8, 0), B(0.6, 1.8, len, GRID / 2 - 1.2, 0.8, 0));
  const R = new THREE.Matrix4().makeRotationX(a).premultiply(new THREE.Matrix4().makeTranslation(0, WALL_H / 2, 0));
  const g = merge(parts.map(p => worldUV(p.applyMatrix4(R), 8)));
  return (GEO.stair = { geo: g, boxes: [[-GRID / 2, 0, -GRID / 2, GRID / 2, WALL_H, GRID / 2]], ramp: true });
}
function parapetGeo(){ if(GEO.parapet) return GEO.parapet; const g = merge([worldUV(B(GRID, 2.6, 0.8, 0, 1.3, 0), 8), worldUV(B(GRID, 0.4, 1.3, 0, 2.7, 0), 8)]); return (GEO.parapet = { geo: g, boxes: [[-GRID / 2, 0, -0.5, GRID / 2, 2.9, 0.5]] }); }
function glassGeo(v){ const k = 'glass_' + v; if(GEO[k]) return GEO[k]; const w = v === 'wide' ? 12 : 6.4; const g = new THREE.PlaneGeometry(w, 5.2); g.translate(0, 6.8, 0); return (GEO[k] = { geo: norm(g), boxes: [] }); }
// ---- props com cores por vértice ----
function carGeo(){
  if(GEO.car) return GEO.car;
  const W = 0xf1f5f9, D = 0x1f2937, T = 0x111111, L = 0xfde68a, R = 0xdc2626, Cr = 0xcbd5e1;
  const p = [B(5, 1.9, 10.4, 0, 1.75, 0, W), B(4.6, 1.8, 5.2, 0, 3.55, -0.6, W), B(4.7, 1.35, 5.3, 0, 3.6, -0.6, D),
    B(4.2, 0.2, 5.0, 0, 4.5, -0.6, W), B(5.1, 0.5, 0.5, 0, 1.2, 5.2, Cr), B(5.1, 0.5, 0.5, 0, 1.2, -5.2, Cr),
    B(1.0, 0.5, 0.2, 1.7, 2.1, 5.22, L), B(1.0, 0.5, 0.2, -1.7, 2.1, 5.22, L), B(1.0, 0.45, 0.2, 1.7, 2.1, -5.22, R), B(1.0, 0.45, 0.2, -1.7, 2.1, -5.22, R)];
  for(const sx of [-1, 1]) for(const sz of [-1, 1]){ p.push(C(1.05, 1.05, 0.8, sx * 2.35, 1.05, sz * 3.3, T, 16, 0, Math.PI / 2), C(0.55, 0.55, 0.84, sx * 2.37, 1.05, sz * 3.3, Cr, 10, 0, Math.PI / 2)); }
  return (GEO.car = { geo: merge(p), boxes: [[-2.6, 0, -5.3, 2.6, 4.6, 5.3]] });
}
function containerGeo(){
  if(GEO.cont) return GEO.cont;
  const p = [worldUV(B(20, 8.4, 8, 0, 4.2, 0), 8)];
  for(const sx of [-1, 1]) for(const sz of [-1, 1]) p.push(B(0.6, 8.6, 0.6, sx * 9.8, 4.3, sz * 3.8));
  p.push(B(20.2, 0.5, 8.2, 0, 0.25, 0), B(20.2, 0.5, 8.2, 0, 8.3, 0));
  for(const sz of [-1.2, 1.2]) p.push(B(0.25, 7, 0.25, 10.1, 4.2, sz));
  return (GEO.cont = { geo: merge(p), boxes: [[-10, 0, -4, 10, 8.6, 4]] });
}
function barrelGeo(){ if(GEO.barrel) return GEO.barrel; const p = [C(1.25, 1.25, 3.4, 0, 1.7, 0, 0xdc2626, 18), C(1.3, 1.3, 0.25, 0, 0.6, 0, 0x7f1d1d, 18), C(1.3, 1.3, 0.25, 0, 2.8, 0, 0x7f1d1d, 18), B(1.6, 0.9, 0.05, 0, 1.8, 1.27, 0xfacc15)]; return (GEO.barrel = { geo: merge(p), boxes: [[-1.3, 0, -1.3, 1.3, 3.4, 1.3]] }); }
function tankGeo(){ if(GEO.tank) return GEO.tank; const p = [C(1.4, 1.4, 4.2, 0, 2.6, 0, 0xf8fafc, 18), new THREE.SphereGeometry(1.4, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)]; p[1].translate(0, 4.7, 0); p[1] = norm(p[1], 0xf8fafc); p.push(C(0.3, 0.3, 0.6, 0, 6.1, 0, 0x94a3b8), C(1.45, 1.45, 0.4, 0, 0.3, 0, 0x64748b, 18), B(1.6, 0.8, 0.05, 0, 2.6, 1.42, 0xef4444)); return (GEO.tank = { geo: merge(p), boxes: [[-1.4, 0, -1.4, 1.4, 6, 1.4]] }); }
function pumpGeo(){ if(GEO.pump) return GEO.pump; const p = [B(2.4, 5.2, 1.6, 0, 2.6, 0, 0xef4444), B(2.0, 1.4, 0.1, 0, 4.0, 0.82, 0x0f172a), B(2.5, 0.5, 1.7, 0, 5.4, 0, 0xf8fafc), B(3.2, 0.6, 2.4, 0, 0.3, 0, 0x9ca3af), C(0.12, 0.12, 2.4, 1.35, 2.8, 0.2, 0x111111, 6, 0.4, 0)]; return (GEO.pump = { geo: merge(p), boxes: [[-1.5, 0, -1.1, 1.5, 5.6, 1.1]] }); }
function lampGeo(){ if(GEO.lamp) return GEO.lamp; const p = [C(0.22, 0.32, 14, 0, 7, 0, 0x374151, 8), C(0.5, 0.7, 0.6, 0, 0.3, 0, 0x374151, 8), B(0.25, 0.25, 3.2, 0, 13.8, 1.4, 0x374151), B(1.2, 0.5, 1.8, 0, 13.6, 2.9, 0x1f2937)]; return (GEO.lamp = { geo: merge(p), boxes: [[-0.4, 0, -0.4, 0.4, 14, 0.4]] }); }
function lampHeadGeo(){ if(GEO.lampH) return GEO.lampH; const g = new THREE.BoxGeometry(1.0, 0.2, 1.5); g.translate(0, 13.3, 2.9); return (GEO.lampH = { geo: norm(g), boxes: [] }); }
function acGeo(){ if(GEO.ac) return GEO.ac; const p = [B(4, 2.6, 3, 0, 1.3, 0, 0xd1d5db), C(1.1, 1.1, 0.2, 0, 2.65, 0, 0x4b5563, 16), B(0.2, 0.2, 2.2, 0, 2.75, 0, 0x9ca3af)]; return (GEO.ac = { geo: merge(p), boxes: [[-2, 0, -1.5, 2, 2.6, 1.5]] }); }
function benchGeo(){ if(GEO.bench) return GEO.bench; const p = [B(6, 0.3, 1.6, 0, 1.6, 0, 0x92400e), B(6, 1.2, 0.3, 0, 2.5, -0.7, 0x92400e), B(0.3, 1.6, 1.4, -2.6, 0.8, 0, 0x1f2937), B(0.3, 1.6, 1.4, 2.6, 0.8, 0, 0x1f2937)]; return (GEO.bench = { geo: merge(p), boxes: [[-3, 0, -0.9, 3, 1.8, 0.9]] }); }
function crateGeo(){ if(GEO.crate) return GEO.crate; const p = [B(4, 4, 4, 0, 2, 0, 0xb07b47)]; for(const a of [-1, 1]) p.push(B(4.1, 0.5, 0.5, 0, 2 + a * 1.6, 2.02, 0x7a4a24), B(0.5, 4.1, 0.5, a * 1.6, 2, 2.02, 0x7a4a24)); p.push(B(5.4, 0.5, 0.5, 0, 2, 2.03, 0x7a4a24, 0, 0, Math.PI / 4)); return (GEO.crate = { geo: merge(p), boxes: [[-2, 0, -2, 2, 4, 2]] }); }

// ============================================================
// PieceBank — peças instanciadas destrutíveis
// ============================================================
export class PieceBank {
  constructor(world, name){ this.world = world; this.name = name; this.types = new Map(); this.meshes = []; }
  type(key, def, mat, opts){ if(!this.types.has(key)) this.types.set(key, { key, geo: def.geo, boxes: def.boxes, ramp: def.ramp, mat, opts: opts || {}, list: [] }); return this.types.get(key); }
  add(key, x, y, z, rot, o){
    o = o || {}; const T = this.types.get(key); if(!T) return null;
    const q = rot || 0, sc = o.s || 1;
    const m = new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(o.rx || 0, q, o.rz || 0)), _s.set(sc, sc, sc));
    const it = { T, bank: this, idx: T.list.length, matrix: m, pos: V(x, y, z), q, hp: o.hp ?? T.opts.hp ?? Infinity, alive: true, harvest: o.harvest ?? T.opts.harvest, color: o.color, links: [], boxes: [], explode: T.opts.explode };
    it.maxHp = it.hp;
    T.list.push(it);
    if(T.opts.collide !== false){
      const cs = Math.cos(q), sn = Math.sin(q);
      for(const b of (T.boxes || [])){
        let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
        for(const [lx, lz] of [[b[0], b[2]], [b[3], b[2]], [b[0], b[5]], [b[3], b[5]]]){ const wx = lx * sc * cs + lz * sc * sn, wz = -lx * sc * sn + lz * sc * cs; x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); z0 = Math.min(z0, wz); z1 = Math.max(z1, wz); }
        const extra = T.ramp ? { ramp: (() => { const fx = Math.round(Math.sin(q)), fz = Math.round(Math.cos(q)); const axis = Math.abs(fx) > 0 ? 'x' : 'z'; return { axis, dir: axis === 'x' ? fx : fz }; })() } : null;
        it.boxes.push(this.world.physics.addBox(V(x + x0, y + b[1] * sc, z + z0), V(x + x1, y + b[4] * sc, z + z1), extra));
      }
    }
    return it;
  }
  link(a, b){ if(a && b) a.links.push(b); }
  finalize(){
    const W = this.world;
    for(const T of this.types.values()){
      if(!T.list.length) continue;
      const im = new THREE.InstancedMesh(T.geo, T.mat, T.list.length);
      const col = new THREE.Color();
      T.list.forEach((it, i) => { im.setMatrixAt(i, it.matrix); if(it.color !== undefined){ im.setColorAt(i, col.set(it.color)); } else if(T.list.some(o => o.color !== undefined)) im.setColorAt(i, col.set(0xffffff)); });
      im.castShadow = T.opts.cast !== false; im.receiveShadow = true;
      im.userData.bankType = T; im.userData.bank = this; im.name = 'bank_' + this.name + '_' + T.key;
      if(T.opts.noProbe) im.userData.noProbe = true;
      im.computeBoundingSphere && im.computeBoundingSphere();
      W.group.add(im); T.mesh = im; this.meshes.push(im);
      if(T.opts.target !== false){ W.raycastTargets.push(im); }
    }
  }
  /** golpe/tiro/explosão numa peça. Devolve { kind, amount, destroyed } para coleta */
  hit(obj, id, dmg, point, harvest){
    const T = obj.userData.bankType; const it = T && T.list[id];
    if(!it || !it.alive || !isFinite(it.hp)) return null;
    return this.damage(it, dmg, point, harvest);
  }
  damage(it, dmg, point, harvest){
    if(!it.alive || !isFinite(it.hp)) return null;
    it.hp -= dmg;
    const kind = it.harvest || 'stone', P = this.world.particles;
    if(point) P.emit(kind === 'wood' ? 'wood' : 'stone', point, { count: 6 });
    let amount = 0;
    if(harvest && it.harvest) amount = kind === 'metal' ? 7 : kind === 'wood' ? 10 : 9;
    if(it.hp <= 0){ this.destroy(it); if(harvest && it.harvest) amount += 10; }
    return { kind, amount, destroyed: !it.alive };
  }
  destroy(it){
    if(!it.alive) return; it.alive = false;
    const T = it.T; if(T.mesh){ T.mesh.setMatrixAt(it.idx, ZERO); T.mesh.instanceMatrix.needsUpdate = true; }
    it.boxes.forEach(b => this.world.physics.removeBox(b)); it.boxes.length = 0;
    const W = this.world, c = it.pos.clone(); c.y += 3;
    W.particles.emit(it.harvest === 'wood' ? 'wood' : 'stone', c, { count: 26 });
    W.particles.emit('dust', c, { n: 14, power: 2.2 });
    if(W.audio) W.audio.play('stepWood', c, { vol: 0.9, rate: it.harvest === 'metal' ? 1.3 : 0.55 });
    it.links.forEach(l => this.destroy(l));
    if(it.explode && W.onExplode) setTimeout(() => W.onExplode(it.pos.clone().setY(it.pos.y + 1.5), it.explode, null), 60);
  }
  /** dano em área (explosões) */
  damageRadius(pos, r, dmg){
    for(const T of this.types.values()) for(const it of T.list){
      if(!it.alive || !isFinite(it.hp)) continue;
      const d = it.pos.distanceTo(pos); if(d < r + 4) this.damage(it, dmg * Math.max(0.2, 1 - d / (r + 4)), null, false);
    }
  }
}

// ============================================================
// construção dos POIs
// ============================================================
export function planPOIs(FLATS){
  FLATS.push([215, 196, 62, 0], [215, -205, 62, 0], [-285, 115, 36, 0], [30, -370, 14, 1.0], [-131, -117.5, 5, 0.45], [-74, -117.5, 5, 0.45]);
  // v18
  FLATS.push([500, -30, 52, 0], [40, 480, 40, 0], [-480, -70, 42, 0], [330, -400, 40, 0], [-330, 370, 30, 0]);
}

export function buildPOIs(W, heightAt){
  const mats = {
    brickR: Mat.brick(0xb4553f, 1), brickB: Mat.brick(0xd8c6a0, 1), conc: Mat.concrete(0xa3a8ad, 1), concD: Mat.concrete(0x7d8288, 1),
    plasterB: Mat.plaster(0x9fbfd4), sheet: Mat.sheet(0x8fa0ae, 1), sheetW: Mat.sheet(0xffffff, 1), woodW: Mat.wood(0x9a6b43),
    vcol: Mat.vcolor('props', { roughness: 0.55, metalness: 0.15 }), vcar: Mat.vcolor('car', { roughness: 0.3, metalness: 0.35 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fd3ff, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.45, envMapIntensity: 2 }),
    lampE: Mat.emissive(0xfff1c1, 2.2), signE: Mat.emissive(0xfb923c, 2.4)
  };
  const loot = { chests: [], floor: [], ammo: [] };
  const R = { mats, loot, zips: [], lights: [] };

  // ---------- prédios em grelha ----------
  function building(bank, sp){
    const { x0, z0, cw, cd, stories } = sp, H = WALL_H, wall = sp.wall, floorM = sp.floor || 'floor_c';
    const hpW = sp.hpW || 220, harvest = sp.harvest || 'stone';
    const wk = (v) => { const key = 'w_' + sp.matKey + '_' + v; bank.type(key, wallGeo(v), sp.wallMat, { hp: hpW, harvest }); return key; };
    bank.type('glass', glassGeo('window'), mats.glass, { collide: false, target: false, cast: false, noProbe: true });
    bank.type('glassW', glassGeo('wide'), mats.glass, { collide: false, target: false, cast: false, noProbe: true });
    bank.type(floorM, floorGeo(), sp.floorMat || mats.conc, { hp: 300, harvest: 'stone' });
    bank.type('stair', stairGeo(), mats.concD, { hp: 280, harvest: 'stone' });
    bank.type('par_' + sp.matKey, parapetGeo(), sp.wallMat, { hp: 160, harvest });
    const levels = [];
    for(let s = 0; s <= stories; s++){
      const y = s * H, stairCell = s < stories && sp.stairs !== false ? (s % 2 === 0 ? [0, 0, 0] : [cw - 1, cd - 1, Math.PI]) : null;
      const prevStair = s > 0 && sp.stairs !== false ? ((s - 1) % 2 === 0 ? [0, 0] : [cw - 1, cd - 1]) : null;
      // piso (térreo: laje sobre o chão; andares: sem a célula da escada de baixo)
      for(let i = 0; i < cw; i++) for(let j = 0; j < cd; j++){
        if(prevStair && prevStair[0] === i && prevStair[1] === j && !(s === stories && sp.roofHole === false)) continue;
        if(sp.mezz && s > 0 && s < stories && !sp.mezz(i, j)) continue;
        bank.add(floorM, x0 + i * GRID + GRID / 2, y, z0 + j * GRID + GRID / 2, 0);
      }
      if(stairCell && (!sp.mezz || s === 0)) bank.add('stair', x0 + stairCell[0] * GRID + GRID / 2, y + 0.4, z0 + stairCell[1] * GRID + GRID / 2, stairCell[2]);
      if(s === stories){
        // telhado: parapeitos + props
        for(let i = 0; i < cw; i++){ bank.add('par_' + sp.matKey, x0 + i * GRID + GRID / 2, y + 0.4, z0, 0); bank.add('par_' + sp.matKey, x0 + i * GRID + GRID / 2, y + 0.4, z0 + cd * GRID, 0); }
        for(let j = 0; j < cd; j++){ bank.add('par_' + sp.matKey, x0, y + 0.4, z0 + j * GRID + GRID / 2, Math.PI / 2); bank.add('par_' + sp.matKey, x0 + cw * GRID, y + 0.4, z0 + j * GRID + GRID / 2, Math.PI / 2); }
        break;
      }
      levels.push(y + 0.4);
      // paredes do perímetro
      const edge = (cx, cz, rot, isFront, i) => {
        let v = 'window';
        if(s === 0 && isFront && (i === Math.floor((isFront === 'x' ? cw : cd) / 2))) v = sp.bigDoor ? 'bigdoor' : 'door';
        else if(sp.blank && (i + s) % 2) v = 'plain';
        else if(sp.wide && s > 0) v = 'wide';
        if(sp.plainGround && s === 0 && v === 'window') v = 'plain';
        if(v === 'bigdoor' && sp.openFront) return;
        const it = bank.add(wk(v), cx, y, cz, rot);
        if(v === 'window' || v === 'wide'){ const g = bank.add(v === 'wide' ? 'glassW' : 'glass', cx, y, cz, rot); bank.link(it, g); }
      };
      for(let i = 0; i < cw; i++){ edge(x0 + i * GRID + GRID / 2, z0 + cd * GRID, 0, sp.front === '+z' ? 'x' : false, i); edge(x0 + i * GRID + GRID / 2, z0, 0, sp.front === '-z' ? 'x' : false, i); }
      for(let j = 0; j < cd; j++){ edge(x0, z0 + j * GRID + GRID / 2, Math.PI / 2, sp.front === '-x' ? 'z' : false, j); edge(x0 + cw * GRID, z0 + j * GRID + GRID / 2, Math.PI / 2, sp.front === '+x' ? 'z' : false, j); }
    }
    // loot por andar (evita a célula da escada)
    levels.forEach((ly, s) => {
      const cells = []; for(let i = 0; i < cw; i++) for(let j = 0; j < cd; j++){ if((s % 2 === 0 && i === 0 && j === 0) || (s % 2 === 1 && i === cw - 1 && j === cd - 1)) continue; if(sp.mezz && s > 0 && !sp.mezz(i, j)) continue; cells.push([i, j]); }
      if(!cells.length) return;
      const c = cells[(s * 7 + cw) % cells.length];
      const px = x0 + c[0] * GRID + GRID / 2, pz = z0 + c[1] * GRID + GRID / 2;
      if(s % 2 === 0 || Math.random() < 0.5) loot.chests.push([px + 3, pz + 3, (s % 4) * Math.PI / 2, ly]);
      const c2 = cells[(s * 3 + 1) % cells.length];
      loot.floor.push([x0 + c2[0] * GRID + GRID / 2 - 3, ly, z0 + c2[1] * GRID + GRID / 2 - 2]);
    });
    return { roofY: stories * H + 0.4 };
  }

  // ================= TORRES TORTAS =================
  {
    const bank = new PieceBank(W, 'torres');
    const A = building(bank, { x0: 175, z0: 155, cw: 2, cd: 2, stories: 4, wallMat: mats.brickR, matKey: 'br', front: '+z' });
    building(bank, { x0: 223, z0: 155, cw: 2, cd: 2, stories: 3, wallMat: mats.conc, matKey: 'co', front: '+z', wide: true });
    building(bank, { x0: 175, z0: 205, cw: 2, cd: 2, stories: 2, wallMat: mats.plasterB, matKey: 'pl', front: '-z', harvest: 'wood', hpW: 180 });
    const D = building(bank, { x0: 223, z0: 205, cw: 2, cd: 2, stories: 3, wallMat: mats.brickB, matKey: 'bb', front: '-z' });
    // rua: candeeiros, bancos, carros
    bank.type('lamp', lampGeo(), mats.vcol, { hp: 120, harvest: 'metal' }); bank.type('lampH', lampHeadGeo(), mats.lampE, { collide: false, target: false, cast: false, noProbe: true });
    bank.type('bench', benchGeo(), mats.vcol, { hp: 80, harvest: 'wood' });
    bank.type('car', carGeo(), mats.vcar, { hp: 300, harvest: 'metal' });
    bank.type('ac', acGeo(), mats.vcol, { hp: 120, harvest: 'metal' });
    [[209, 160, 0], [209, 236, Math.PI], [221, 176, Math.PI], [221, 222, 0], [170, 196, Math.PI / 2], [262, 196, -Math.PI / 2]].forEach(([x, z, r]) => { const l = bank.add('lamp', x, heightAt(x, z), z, r); bank.link(l, bank.add('lampH', x, heightAt(x, z), z, r)); });
    [[215, 196, 0], [215, 180, Math.PI], [200, 196, Math.PI / 2]].forEach(([x, z, r]) => bank.add('bench', x, 0, z, r));
    const carCols = [0xef4444, 0x3b82f6, 0xfacc15, 0x22c55e, 0xf97316, 0xe5e7eb];
    [[211, 170, 0], [218, 214, Math.PI], [196, 193, Math.PI / 2], [240, 199, -Math.PI / 2]].forEach(([x, z, r], i) => bank.add('car', x, 0, z, r, { color: carCols[i % carCols.length] }));
    [[183, 161], [199, 179], [231, 163], [243, 213], [183, 213]].forEach(([x, z], i) => bank.add('ac', x, [52.4, 52.4, 39.4, 39.4, 26.4][i] + 0.4, z, i * 0.7));
    bank.finalize(); R.torres = bank;
    R.zips.push({ a: V(199, A.roofY + 9, 179), b: V(231, D.roofY + 9, 213) });
  }
  // ================= FÁBRICA FERRUGEM =================
  {
    const bank = new PieceBank(W, 'fabrica');
    building(bank, { x0: 175, z0: -245, cw: 3, cd: 2, stories: 2, wallMat: mats.sheet, matKey: 'sh', front: '+z', bigDoor: true, openFront: true, blank: true, harvest: 'metal', hpW: 260, mezz: (i, j) => j === 0 });
    building(bank, { x0: 231, z0: -250, cw: 2, cd: 2, stories: 1, wallMat: mats.brickR, matKey: 'br', front: '+z', plainGround: false });
    bank.type('cont', containerGeo(), mats.sheetW, { hp: 500, harvest: 'metal' });
    const cc = [0xc2410c, 0x1d4ed8, 0x15803d, 0xb91c1c, 0xca8a04, 0x0e7490];
    const stacks = [[190, -190, 0, 2], [190, -178, 0, 1], [214, -176, 0, 3], [240, -178, Math.PI / 2, 2], [252, -176, Math.PI / 2, 1], [262, -210, Math.PI / 2, 2], [168, -214, Math.PI / 2, 1]];
    stacks.forEach(([x, z, r, n], si) => { for(let k = 0; k < n; k++) bank.add('cont', x, k * 8.6, z, r, { color: cc[(si * 2 + k) % cc.length] }); });
    bank.type('barrel', barrelGeo(), mats.vcol, { hp: 60, harvest: 'metal', explode: { r: 13, dmg: 60 } });
    bank.type('crate', crateGeo(), mats.vcol, { hp: 90, harvest: 'wood' });
    [[204, -206], [207, -209], [201, -209], [236, -196], [258, -228]].forEach(([x, z]) => bank.add('barrel', x, 0, z, Math.random() * 6));
    [[180, -205], [184, -205], [182, -201], [250, -186], [228, -232]].forEach(([x, z], i) => bank.add('crate', x, i === 2 ? 4 : 0, z, i * 0.3));
    bank.type('car', carGeo(), mats.vcar, { hp: 300, harvest: 'metal' });
    bank.add('car', 196, 0, -166, 0.2, { color: 0x6b7280 }); bank.add('car', 244, 0, -164, Math.PI / 2, { color: 0x0f766e });
    bank.finalize(); R.fabrica = bank;
    // grua (estática)
    const g = new THREE.Group(); const yel = Mat.paint(0xf59e0b), dark = Mat.metal(0x374151, 0.4);
    const cx = 270, cz = -186, add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    for(const sx of [-1, 1]) for(const sz of [-1, 1]) add(new THREE.BoxGeometry(0.6, 46, 0.6), yel, cx + sx * 1.6, 23, cz + sz * 1.6);
    for(let y = 3; y < 46; y += 4.5){ add(new THREE.BoxGeometry(3.8, 0.3, 0.3), yel, cx, y, cz - 1.6); add(new THREE.BoxGeometry(3.8, 0.3, 0.3), yel, cx, y, cz + 1.6); add(new THREE.BoxGeometry(0.3, 0.3, 3.8), yel, cx - 1.6, y + 2, cz); add(new THREE.BoxGeometry(0.3, 0.3, 3.8), yel, cx + 1.6, y + 2, cz); }
    add(new THREE.BoxGeometry(5, 3, 5), dark, cx, 47.5, cz); add(new THREE.BoxGeometry(2.4, 1.6, 42), yel, cx, 49.6, cz - 12); add(new THREE.BoxGeometry(3, 3, 6), Mat.concrete(0x6b7280), cx, 49.6, cz + 10);
    const hook = add(new THREE.CylinderGeometry(0.06, 0.06, 18, 4), dark, cx, 40, cz - 28); add(new THREE.BoxGeometry(1.2, 1.2, 1.2), dark, cx, 31, cz - 28);
    W.group.add(g); W._staticMerge.push(g);
    W.physics.addBox(V(cx - 2.2, 0, cz - 2.2), V(cx + 2.2, 46, cz + 2.2)); W.physics.addBox(V(cx - 2.5, 46, cz - 2.5), V(cx + 2.5, 49, cz + 2.5));
    W.physics.addBox(V(cx - 1.2, 48.8, cz - 33), V(cx + 1.2, 50.4, cz + 9));
    R.zips.push({ a: V(cx, 57, cz), b: V(160, heightAt(160, -150) + 9, -150) });
  }
  // ================= POSTO POEIRA =================
  {
    const bank = new PieceBank(W, 'posto');
    building(bank, { x0: -300, z0: 86, cw: 2, cd: 1, stories: 1, wallMat: mats.brickB, matKey: 'bb', front: '+z', stairs: false, roofHole: false });
    bank.type('pump', pumpGeo(), mats.vcol, { hp: 120, harvest: 'metal' });
    bank.type('car', carGeo(), mats.vcar, { hp: 300, harvest: 'metal' });
    bank.type('tank', tankGeo(), mats.vcol, { hp: 70, harvest: 'metal', explode: { r: 15, dmg: 70 } });
    [-295, -285, -275].forEach(x => bank.add('pump', x, 0, 126, 0));
    bank.add('car', -290, 0, 134, Math.PI / 2 + 0.1, { color: 0xdc2626 }); bank.add('car', -262, 0, 108, 0.4, { color: 0x2563eb });
    [[-306, 100], [-306, 95], [-306, 90]].forEach(([x, z]) => bank.add('tank', x, 0, z, 0));
    bank.finalize(); R.posto = bank;
    // cobertura (estática) + placa luminosa
    const g = new THREE.Group(); const roofM = Mat.paint(0xf8fafc), stripe = mats.signE, poleM = Mat.metal(0x9ca3af, 0.35);
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    add(new THREE.BoxGeometry(34, 1.4, 20), roofM, -285, 13.3, 126); add(new THREE.BoxGeometry(34.2, 0.5, 20.2), stripe, -285, 12.7, 126);
    for(const x of [-300, -270]) for(const z of [120, 132]) add(new THREE.CylinderGeometry(0.5, 0.5, 12.6, 10), poleM, x, 6.3, z);
    add(new THREE.CylinderGeometry(0.5, 0.6, 20, 10), poleM, -258, 10, 142); add(new THREE.BoxGeometry(7, 5, 0.8), stripe, -258, 21, 142); add(new THREE.BoxGeometry(7.4, 5.4, 0.6), Mat.paint(0x1f2937), -258, 21, 141.6);
    W.group.add(g); W._staticMerge.push(g);
    W.physics.addBox(V(-302, 12.6, 116), V(-268, 14, 136));
    for(const x of [-300, -270]) for(const z of [120, 132]) W.physics.addCircle(x, z, 0.8, 12.6);
    W.physics.addCircle(-258, 142, 0.9, 24);
    loot.chests.push([-278, 92, Math.PI, 0.4]); loot.floor.push([-292, 0.4, 96]); loot.ammo.push([-270, 118]);
  }
  // ================= FAROL SOLITÁRIO =================
  {
    const x = 30, z = -370, y0 = heightAt(x, z), Ht = 46;
    const g = new THREE.Group();
    const tower = new THREE.CylinderGeometry(3.8, 5.4, Ht, 28, 12); tower.translate(0, Ht / 2, 0);
    const tp = tower.attributes.position, col = new Float32Array(tp.count * 3), cr = new THREE.Color(0xdc2626), cw = new THREE.Color(0xf8fafc);
    for(let i = 0; i < tp.count; i++){ const c = Math.floor(tp.getY(i) / (Ht / 6) + 0.001) % 2 ? cw : cr; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    tower.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const tm = new THREE.Mesh(tower, Mat.vcolor('lighthouse', { roughness: 0.6 })); tm.castShadow = tm.receiveShadow = true; g.add(tm);
    const add = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    add(new THREE.CylinderGeometry(7.2, 7.2, 0.8, 28), Mat.concrete(0x6b7280), 0, Ht + 0.4, 0);
    for(let i = 0; i < 24; i++){ const a = i / 24 * Math.PI * 2; add(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 6), Mat.metal(0x1f2937, 0.4), Math.cos(a) * 6.9, Ht + 2, Math.sin(a) * 6.9); }
    add(new THREE.TorusGeometry(6.9, 0.14, 6, 40), Mat.metal(0x1f2937, 0.4), 0, Ht + 3.3, 0).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(3, 3, 5, 16, 1, true), mats.glass, 0, Ht + 3.3, 0);
    const lamp = add(new THREE.SphereGeometry(1.3, 16, 12), Mat.emissive(0xfff7c2, 4), 0, Ht + 3.3, 0);
    add(new THREE.ConeGeometry(3.8, 3, 16), Mat.paint(0xb91c1c), 0, Ht + 7.3, 0);
    add(new THREE.BoxGeometry(3, 6, 1), Mat.wood(0x5b3a24), 0, 3, 5.2);
    g.position.set(x, y0, z); W.group.add(g);
    // feixe rotativo (aditivo)
    const beamM = new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const bg = new THREE.ConeGeometry(9, 90, 20, 1, true); bg.translate(0, -45, 0); bg.rotateX(Math.PI / 2);
    const beam = new THREE.Group(); beam.position.set(x, y0 + Ht + 3.3, z);
    const b1 = new THREE.Mesh(bg, beamM), b2 = new THREE.Mesh(bg, beamM); b2.rotation.y = Math.PI; beam.add(b1, b2); beam.userData.noProbe = true; b1.userData.noProbe = b2.userData.noProbe = true;
    W.group.add(beam); R.beam = beam;
    W.raycastTargets.push(tm);
    W.physics.addCircle(x, z, 5.2, y0 + Ht);
    W.physics.addBox(V(x - 7, y0 + Ht, z - 7), V(x + 7, y0 + Ht + 0.8, z + 7));
    W.physics.addCircle(x, z, 3.2, y0 + Ht + 8);
    loot.chests.push([x + 4.5, z + 0.5, Math.PI / 2, y0 + Ht + 0.8]);
    loot.chests.push([x + 8, z + 9, 0, y0]);
    R.zips.push({ a: V(x + 5.5, y0 + Ht + 8, z + 5.5), b: V(38, heightAt(38, -305) + 9, -305) });
  }
  // ================= PICO NEVADO (cabana) =================
  {
    const bank = new PieceBank(W, 'pico');
    const cx = -245, cz = -235, y = heightAt(cx, cz) - 0.2;
    bank.type('w_wd_plain', wallGeo('plain'), mats.woodW, { hp: 150, harvest: 'wood' });
    bank.type('w_wd_door', wallGeo('door'), mats.woodW, { hp: 150, harvest: 'wood' });
    bank.type('w_wd_window', wallGeo('window'), mats.woodW, { hp: 150, harvest: 'wood' });
    bank.type('fl_wd', floorGeo(), mats.woodW, { hp: 200, harvest: 'wood' });
    bank.add('w_wd_door', cx, y, cz + 8, 0); bank.add('w_wd_window', cx, y, cz - 8, 0); bank.add('w_wd_window', cx - 8, y, cz, Math.PI / 2); bank.add('w_wd_plain', cx + 8, y, cz, Math.PI / 2);
    bank.add('fl_wd', cx, y, cz, 0);
    bank.finalize(); R.pico = bank;
    const g = new THREE.Group(); const roofM = Mat.wood(0x7a2f22), snow = Mat.plaster(0xf8fafc);
    [-1, 1].forEach(sd => { const r = new THREE.Mesh(new THREE.BoxGeometry(19, 0.6, 11.4), roofM); r.position.set(cx, y + 16.2, cz + sd * 4.6); r.rotation.x = sd * 0.62; r.castShadow = true; g.add(r); const s = new THREE.Mesh(new THREE.BoxGeometry(19.2, 0.3, 11.4), snow); s.position.set(cx, y + 16.6, cz + sd * 4.7); s.rotation.x = sd * 0.62; g.add(s); });
    W.group.add(g); W._staticMerge.push(g);
    W.physics.addBox(V(cx - 9, y + WALL_H, cz - 9), V(cx + 9, y + WALL_H + 0.5, cz + 9));
    loot.chests.push([cx - 3, cz - 3, 0, y + 0.4]); loot.floor.push([cx + 3, y + 0.4, cz + 2]);
    R.zips.push({ a: V(cx + 12, y + 9, cz + 12), b: V(-150, heightAt(-150, -172) + 9, -172) });
  }
  // ================= PONTE DO RIO =================
  {
    const g = new THREE.Group(); const plank = Mat.wood(0x8b5a2b), post = Mat.wood(0x5b3a24);
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    const x0 = -129, x1 = -76, zc = -117.5;
    for(let x = x0; x < x1; x += 1.6) add(new THREE.BoxGeometry(1.45, 0.5, 8.5), plank, x + 0.8, 0.45, zc);
    for(const sz of [-1, 1]){ add(new THREE.BoxGeometry(x1 - x0, 0.4, 0.4), post, (x0 + x1) / 2, 3.3, zc + sz * 4.1); for(let x = x0; x <= x1; x += 6.5) add(new THREE.BoxGeometry(0.6, 3.6, 0.6), post, x, 1.9, zc + sz * 4.1); }
    for(let x = x0 + 10; x < x1 - 5; x += 11) for(const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.5, 0.6, 5, 8), post, x, -2, zc + sz * 3);
    W.group.add(g); W._staticMerge.push(g);
    W.physics.addBox(V(x0, 0.1, zc - 4.3), V(x1, 0.7, zc + 4.3));
    W.physics.addBox(V(x0, 0, zc + 3.9), V(x1, 3.6, zc + 4.4)); W.physics.addBox(V(x0, 0, zc - 4.4), V(x1, 3.6, zc - 3.9));
  }
  // ============================================================
  // v18: POIs do anel exterior (mapa maior)
  // ============================================================
  R.spinners = []; R.blinks = []; R.fires2 = [];
  const SG = () => { const g = new THREE.Group(); const add = (geo, mat, x, y, z, rx, ry, rz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if(rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0); m.castShadow = m.receiveShadow = true; g.add(m); return m; }; return [g, add]; };
  const stone = Mat.rock(0x8d8a78), stoneD = Mat.rock(0x6f6c5c), moss = Mat.cloth(0x4d7c2f, 'fabric'), plank = Mat.wood(0x8b5a2b), post = Mat.wood(0x5b3a24);
  // ================= PORTO PESQUEIRO =================
  {
    const bank = new PieceBank(W, 'porto');
    building(bank, { x0: 462, z0: -70, cw: 2, cd: 1, stories: 1, wallMat: mats.plasterB, matKey: 'pl', front: '+z', harvest: 'wood', hpW: 180 });
    const B = building(bank, { x0: 462, z0: -6, cw: 1, cd: 2, stories: 2, wallMat: mats.woodW, matKey: 'wd', front: '+x', harvest: 'wood', hpW: 160 });
    building(bank, { x0: 500, z0: -74, cw: 2, cd: 2, stories: 1, wallMat: mats.sheet, matKey: 'sh', front: '+x', bigDoor: true, blank: true, harvest: 'metal', hpW: 240 });
    bank.type('crate', crateGeo(), mats.vcol, { hp: 90, harvest: 'wood' });
    bank.type('barrel', barrelGeo(), mats.vcol, { hp: 60, harvest: 'metal', explode: { r: 13, dmg: 60 } });
    bank.type('lamp', lampGeo(), mats.vcol, { hp: 120, harvest: 'metal' }); bank.type('lampH', lampHeadGeo(), mats.lampE, { collide: false, target: false, cast: false, noProbe: true });
    [[512, -20], [516, -20], [514, -16], [540, 8], [545, -42], [530, -60]].forEach(([x, z], i) => bank.add('crate', x, i === 2 ? 4 : 0, z, i * 0.4));
    [[535, -28], [538, -25], [520, 10]].forEach(([x, z]) => bank.add('barrel', x, 0, z, Math.random() * 6));
    [[500, -30, 0], [530, -8, Math.PI], [530, -52, 0]].forEach(([x, z, r]) => { const l = bank.add('lamp', x, 0, z, r); bank.link(l, bank.add('lampH', x, 0, z, r)); });
    bank.finalize(); R.porto = bank;
    // cais de madeira (3 molhes) + estacas
    const [g, add] = SG();
    for(const zc of [-48, -18, 12]){
      const x0 = 545, x1 = 628, deck = new THREE.BoxGeometry(x1 - x0, 0.5, 7);
      add(deck, plank, (x0 + x1) / 2, 0.95, zc);
      for(let x = x0; x <= x1; x += 2.2) add(new THREE.BoxGeometry(0.12, 0.52, 7.05), post, x, 0.96, zc);
      for(let x = x0 + 4; x <= x1; x += 9) for(const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.45, 0.5, 9, 8), post, x, -3.4, zc + sz * 3.1);
      for(const sz of [-1, 1]) add(new THREE.BoxGeometry(x1 - x0, 0.3, 0.3), post, (x0 + x1) / 2, 2.6, zc + sz * 3.4);
      W.physics.addBox(V(x0, 0.2, zc - 3.5), V(x1, 1.2, zc + 3.5));
    }
    // barcos atracados
    const hullG = (() => { const sh = new THREE.Shape(); sh.moveTo(-3, -8); sh.lineTo(3, -8); sh.lineTo(3.2, 4); sh.quadraticCurveTo(2.6, 8, 0, 10); sh.quadraticCurveTo(-2.6, 8, -3.2, 4); sh.lineTo(-3, -8); const e = new THREE.ExtrudeGeometry(sh, { depth: 3, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.4, bevelSegments: 2 }); e.rotateX(Math.PI / 2); e.translate(0, 3, 0); return e; })();
    [[598, -33, 0xdc2626], [586, -3, 0x2563eb], [612, 27, 0xf8fafc]].forEach(([x, z, c], i) => {
      const bg = new THREE.Group(); bg.position.set(x, -1.9, z); bg.rotation.y = Math.PI / 2 + (i - 1) * 0.08;
      const h = new THREE.Mesh(hullG, Mat.paint(c)); h.castShadow = h.receiveShadow = true; bg.add(h);
      const deckM = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 17), plank); deckM.position.set(0, 3.1, 0.5); deckM.receiveShadow = true; bg.add(deckM);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.4, 4.5), Mat.paint(0xf1f5f9)); cab.position.set(0, 4.9, -3.5); cab.castShadow = true; bg.add(cab);
      const win = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.1, 0.1), mats.glass); win.position.set(0, 5.6, -1.2); bg.add(win);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 10, 8), post); mast.position.set(0, 8, 3); bg.add(mast);
      g.add(bg);
      W.physics.addBox(V(x - 8.5, 0.6, z - 3.2), V(x + 8.5, 1.3, z + 3.2));
    });
    // bancas de peixe (toldos às riscas)
    for(const [x, z, c] of [[488, -30, 0x2563eb], [488, -42, 0xdc2626]]){
      add(new THREE.BoxGeometry(6, 2.2, 3), plank, x, 1.1, z); add(new THREE.BoxGeometry(6.6, 0.25, 4), Mat.cloth(c, 'fabric'), x, 5.2, z, 0.18);
      for(const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.12, 0.12, 5, 6), post, x + sx * 3, 2.6, z + 1.6);
      for(let k = 0; k < 4; k++) add(new THREE.SphereGeometry(0.5, 8, 6), Mat.paint(0x94a3b8), x - 2 + k * 1.3, 2.4, z, 0, 0, 0).scale.set(1.8, 0.6, 0.7);
      W.physics.addBox(V(x - 3, 0, z - 1.5), V(x + 3, 2.2, z + 1.5));
    }
    W.group.add(g); W._staticMerge.push(g);
    loot.chests.push([622, -18, Math.PI / 2, 1.2], [600, -33, 0, 1.4]); loot.floor.push([548, 1.3, 12], [610, 1.3, -48]); loot.ammo.push([520, -30], [560, -18]);
    R.zips.push({ a: V(470, B.roofY + 9, 10), b: V(560, 10, -48) });
  }
  // ================= TEMPLO PERDIDO =================
  {
    const [g, add] = SG(); const cx = 40, cz = 492;
    const tiers = [40, 30, 20, 10];
    tiers.forEach((w, i) => {
      add(new THREE.BoxGeometry(w, 5, w), i % 2 ? stoneD : stone, cx, i * 5 + 2.5, cz);
      add(new THREE.BoxGeometry(w + 0.6, 0.6, w + 0.6), stoneD, cx, i * 5 + 5, cz);
      W.physics.addBox(V(cx - w / 2, i * 5, cz - w / 2), V(cx + w / 2, i * 5 + 5, cz + w / 2));
      for(let k = 0; k < 5; k++){ const a = k * 1.7 + i; add(new THREE.BoxGeometry(0.5 + (k % 2), 3 + (k % 3), 0.2), moss, cx + Math.cos(a) * w * 0.4, i * 5 + 3, cz - w / 2 - 0.12); }
    });
    // escadaria central (lado -z, virada para o centro da ilha): 20 degraus de 1 u
    for(let i = 0; i < 20; i++){
      const z0 = cz - 27 + i, h = i + 1;
      add(new THREE.BoxGeometry(7, h, 1.02), i % 2 ? stone : stoneD, cx, h / 2, z0 + 0.5);
      W.physics.addBox(V(cx - 3.5, 0, z0), V(cx + 3.5, h, z0 + 1));
    }
    for(const sx of [-1, 1]) for(let i = 0; i < 20; i += 4) add(new THREE.BoxGeometry(1, 1.2, 4), stoneD, cx + sx * 4, i + 1.6, cz - 27 + i + 2);
    // santuário no topo: pilares + laje + gema brilhante
    const top = 20;
    for(const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]){ add(new THREE.BoxGeometry(1.4, 8, 1.4), stone, cx + sx * 4, top + 4, cz + sz * 4); W.physics.addBox(V(cx + sx * 4 - 0.7, top, cz + sz * 4 - 0.7), V(cx + sx * 4 + 0.7, top + 8, cz + sz * 4 + 0.7)); }
    add(new THREE.BoxGeometry(11, 1.2, 11), stoneD, cx, top + 8.6, cz); W.physics.addBox(V(cx - 5.5, top + 8, cz - 5.5), V(cx + 5.5, top + 9.2, cz + 5.5));
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), Mat.emissive(0x34d399, 3)); gem.position.set(cx, top + 11.2, cz); W.group.add(gem); R.spinners.push({ o: gem, ax: 'y', sp: 0.9, bob: top + 11.2 });
    W.group.add(g); W._staticMerge.push(g);
    // colunas partidas destrutíveis à volta
    const bank = new PieceBank(W, 'templo');
    const colG = (() => { const p = [C(1.1, 1.3, 9, 0, 4.5, 0, 0x8d8a78, 10), B(3, 0.8, 3, 0, 0.4, 0, 0x6f6c5c), B(2.8, 0.7, 2.8, 0, 9.3, 0, 0x6f6c5c)]; const g2 = merge(p); g2.computeBoundingSphere(); return { geo: g2, boxes: [[-1.4, 0, -1.4, 1.4, 9.6, 1.4]] }; })();
    bank.type('col', colG, Mat.vcolor('templo', { roughness: 0.9 }), { hp: 220, harvest: 'stone' });
    [[12, 455], [68, 455], [8, 480], [72, 480], [10, 510], [70, 512], [26, 448], [54, 448]].forEach(([x, z], i) => bank.add('col', x, 0, z, i * 0.5, { s: 0.8 + (i % 3) * 0.2 }));
    bank.finalize(); R.templo = bank;
    loot.chests.push([cx, cz, 0, top + 0.1], [cx - 14, cz - 24, 0, 0], [cx + 22, cz + 6, Math.PI / 2, 0]); loot.floor.push([cx + 10, 5.2, cz - 12], [cx - 8, 10.2, cz + 9]); loot.ammo.push([cx + 16, cz - 26]);
  }
  // ================= MOINHOS ALTOS =================
  {
    const bank = new PieceBank(W, 'moinhos');
    building(bank, { x0: -500, z0: -62, cw: 2, cd: 2, stories: 1, wallMat: Mat.wood(0x9b2c2c), matKey: 'rb', front: '+x', bigDoor: true, harvest: 'wood', hpW: 170, stairs: false, roofHole: false });
    const hayG = (() => { const g2 = merge([C(1.7, 1.7, 3.2, 0, 0, 0, 0xd9b44a, 16, 0, Math.PI / 2)]); g2.translate(0, 1.7, 0); g2.computeBoundingSphere(); return { geo: g2, boxes: [[-1.6, 0, -1.7, 1.6, 3.4, 1.7]] }; })();
    bank.type('hay', hayG, Mat.vcolor('hay', { roughness: 1 }), { hp: 60, harvest: 'wood' });
    [[-462, -58], [-462, -52], [-458, -55], [-470, -86], [-440, -70], [-505, -24], [-500, -20]].forEach(([x, z], i) => bank.add('hay', x, i === 2 ? 3.3 : 0, z, i * 0.9));
    bank.finalize(); R.moinhos = bank;
    const [g, add] = SG(); const white = Mat.plaster(0xf5f0e6), roofM = Mat.wood(0x5b2a1a), sail = Mat.cloth(0xf8fafc, 'fabric');
    for(const [x, z, ry] of [[-455, -102, 0.4], [-512, -104, -0.3], [-448, -22, 0.9]]){
      const y = heightAt(x, z);
      add(new THREE.CylinderGeometry(3.0, 4.4, 26, 18), white, x, y + 13, z); add(new THREE.ConeGeometry(3.8, 6, 18), roofM, x, y + 29, z);
      add(new THREE.BoxGeometry(2.2, 4, 0.4), post, x + Math.sin(ry + Math.PI) * 4.3, y + 2, z + Math.cos(ry + Math.PI) * 4.3, 0, ry);
      W.physics.addCircle(x, z, 4.3, y + 32);
      const hub = new THREE.Group(); hub.position.set(x + Math.sin(ry) * 3.8, y + 24, z + Math.cos(ry) * 3.8); hub.rotation.y = ry;
      const rot = new THREE.Group(); hub.add(rot);
      rot.add(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.4, 12).rotateX(Math.PI / 2), post));
      for(let k = 0; k < 4; k++){ const arm = new THREE.Group(); arm.rotation.z = k * Math.PI / 2; const a = new THREE.Mesh(new THREE.BoxGeometry(0.4, 13, 0.3), post); a.position.y = 6.8; const sl = new THREE.Mesh(new THREE.BoxGeometry(2.8, 10, 0.12), sail); sl.position.set(1.6, 7.6, 0.1); a.castShadow = sl.castShadow = true; arm.add(a, sl); rot.add(arm); }
      W.group.add(hub); R.spinners.push({ o: rot, ax: 'z', sp: 0.55 + Math.random() * 0.2 });
      loot.floor.push([x + 7, y + 0.4, z + 3]);
    }
    // cercas
    for(let i = 0; i < 14; i++){ const x = -530 + i * 6; add(new THREE.BoxGeometry(0.4, 2.4, 0.4), post, x, 1.2, -128); add(new THREE.BoxGeometry(6, 0.3, 0.2), plank, x + 3, 1.8, -128); add(new THREE.BoxGeometry(6, 0.3, 0.2), plank, x + 3, 0.9, -128); }
    W.group.add(g); W._staticMerge.push(g);
    loot.chests.push([-455, -94, 0, heightAt(-455, -94)], [-512, -96, 0, heightAt(-512, -96)]); loot.ammo.push([-470, -40]);
  }
  // ================= BASE CIENTÍFICA =================
  {
    const bank = new PieceBank(W, 'base');
    const A = building(bank, { x0: 306, z0: -426, cw: 3, cd: 2, stories: 2, wallMat: mats.conc, matKey: 'co', front: '+z', wide: true });
    bank.type('cont', containerGeo(), mats.sheetW, { hp: 500, harvest: 'metal' });
    [[300, -365, 0, 0xf8fafc], [300, -365, 0, 0x0e7490, 8.6], [364, -440, Math.PI / 2, 0xca8a04]].forEach(([x, z, r, c, y]) => bank.add('cont', x, y || 0, z, r, { color: c }));
    bank.finalize(); R.base = bank;
    const [g, add] = SG(); const domeM = new THREE.MeshPhysicalMaterial({ color: 0xe2e8f0, roughness: 0.25, metalness: 0.4, clearcoat: 0.8 });
    for(const [x, z, r] of [[318, -378, 7.5], [348, -376, 6]]){ add(new THREE.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), domeM, x, 0, z); add(new THREE.CylinderGeometry(r + 0.2, r + 0.2, 0.6, 28), Mat.concrete(0x6b7280), x, 0.3, z); W.physics.addCircle(x, z, r * 0.92, r * 0.85); }
    // torre de antena com luz a piscar
    const tx = 366, tz = -408;
    for(const sx of [-1, 1]) for(const sz of [-1, 1]) add(new THREE.BoxGeometry(0.35, 34, 0.35), Mat.metal(0x94a3b8, 0.4), tx + sx * 1.2, 17, tz + sz * 1.2);
    for(let y = 3; y < 34; y += 4) add(new THREE.BoxGeometry(2.6, 0.2, 2.6), Mat.metal(0x94a3b8, 0.4), tx, y, tz);
    W.physics.addCircle(tx, tz, 1.8, 34);
    W.group.add(g); W._staticMerge.push(g);
    const blink = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), Mat.emissive(0xff2d2d, 4).clone()); blink.position.set(tx, 34.6, tz); W.group.add(blink); R.blinks.push(blink);
    // radar no telhado (gira)
    const radar = new THREE.Group(); radar.position.set(330, A.roofY, -410);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(4, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.35), new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide }));
    dish.rotation.x = -Math.PI / 2 - 0.5; dish.position.y = 4; dish.castShadow = true;
    const mastR = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 4, 10), Mat.metal(0x64748b, 0.3)); mastR.position.y = 2;
    radar.add(mastR, dish); W.group.add(radar); R.spinners.push({ o: radar, ax: 'y', sp: 0.6 });
    loot.chests.push([318, -372, 0, 0.4]); loot.ammo.push([340, -386], [296, -410]);
    R.zips.push({ a: V(tx - 3, 31, tz), b: V(300, heightAt(300, -330) + 9, -330) });
  }
  // ================= ACAMPAMENTO PINHAL =================
  {
    const bank = new PieceBank(W, 'acamp');
    const cab = (cx, cz, ry) => {
      const y = heightAt(cx, cz) - 0.2;
      bank.type('w_cb_plain', wallGeo('plain'), mats.woodW, { hp: 150, harvest: 'wood' }); bank.type('w_cb_door', wallGeo('door'), mats.woodW, { hp: 150, harvest: 'wood' }); bank.type('w_cb_window', wallGeo('window'), mats.woodW, { hp: 150, harvest: 'wood' }); bank.type('fl_cb', floorGeo(), mats.woodW, { hp: 200, harvest: 'wood' });
      bank.add(ry ? 'w_cb_window' : 'w_cb_door', cx, y, cz + 8, 0); bank.add(ry ? 'w_cb_door' : 'w_cb_window', cx, y, cz - 8, 0); bank.add('w_cb_window', cx - 8, y, cz, Math.PI / 2); bank.add('w_cb_plain', cx + 8, y, cz, Math.PI / 2); bank.add('fl_cb', cx, y, cz, 0);
      return y;
    };
    const y1 = cab(-344, 356, 0), y2 = cab(-314, 384, 1);
    bank.finalize(); R.acamp = bank;
    const [g, add] = SG(); const roofM = Mat.wood(0x4a2f1c);
    for(const [cx, cz, y] of [[-344, 356, y1], [-314, 384, y2]]){ [-1, 1].forEach(sd => add(new THREE.BoxGeometry(18.4, 0.6, 11), roofM, cx, y + 16, cz + sd * 4.4, sd * 0.6)); W.physics.addBox(V(cx - 8.5, y + WALL_H, cz - 8.5), V(cx + 8.5, y + WALL_H + 0.5, cz + 8.5)); loot.chests.push([cx - 3, cz - 3, 0, y + 0.4]); }
    const tentG = (() => { const sh = new THREE.Shape(); sh.moveTo(-3, 0); sh.lineTo(3, 0); sh.lineTo(0, 4.2); sh.lineTo(-3, 0); const e = new THREE.ExtrudeGeometry(sh, { depth: 6, bevelEnabled: false }); e.translate(0, 0, -3); return e; })();
    [[-318, 356, 0xea580c, 0.3], [-342, 386, 0x16a34a, -0.5], [-352, 372, 0x2563eb, 1.3], [-322, 368, 0xfacc15, 2.2]].forEach(([x, z, c, r]) => { const y = heightAt(x, z); add(tentG, Mat.cloth(c, 'fabric'), x, y, z, 0, r); W.physics.addCircle(x, z, 2.6, y + 3.5); });
    for(let i = 0; i < 4; i++){ const a = i / 4 * Math.PI * 2 + 0.4, x = -331 + Math.cos(a) * 5, z = 370 + Math.sin(a) * 5; add(new THREE.CylinderGeometry(0.5, 0.5, 3.2, 8), post, x, heightAt(x, z) + 0.5, z, 0, -a, Math.PI / 2); }
    W.group.add(g); W._staticMerge.push(g);
    R.fires2.push([-331, 370]);
    loot.floor.push([-328, heightAt(-328, 362) + 0.4, 362]); loot.ammo.push([-336, 378]);
  }
  // ---- munições espalhadas / loot extra no chão ----
  loot.ammo.push([200, 190], [236, 198], [210, -196], [245, -230], [34, -362], [-240, -228], [-100, -110], [60, 20], [-80, 60], [140, -100], [-40, 180], [180, 80]);
  loot.floor.push([205, 0.4, 204], [228, 0.4, 190], [200, 0.4, -228], [255, 0.4, -200], [-270, 0.4, 118]);
  return R;
}

// ============================================================
// vegetação/props extra (instanciados, sem draw calls por objeto)
// ============================================================
export function palmGeo(){
  if(GEO.palm) return GEO.palm;
  const parts = [];
  for(let i = 0; i < 7; i++){ const t = i / 7; const seg = new THREE.CylinderGeometry(0.42 - t * 0.12, 0.5 - t * 0.12, 2.2, 8); seg.translate(Math.pow(t, 2) * 2.2, 1.1 + i * 2.0, 0); parts.push(norm(seg, i % 2 ? 0x8b6b43 : 0x7a5a36)); }
  for(let k = 0; k < 8; k++){
    const a = k / 8 * Math.PI * 2, leaf = new THREE.PlaneGeometry(1.6, 7, 1, 6); const lp = leaf.attributes.position;
    for(let i = 0; i < lp.count; i++){ const y = lp.getY(i) + 3.5; lp.setZ(i, -y * y * 0.05); lp.setX(i, lp.getX(i) * Math.sin(Math.min(1, y / 7) * Math.PI) * 1.2); lp.setY(i, y); }
    leaf.rotateX(-1.2); leaf.rotateY(a); leaf.translate(2.2, 14.2, 0); parts.push(norm(leaf, k % 2 ? 0x3f8f3a : 0x4fa044));
  }
  const coco = new THREE.SphereGeometry(0.5, 8, 6); coco.translate(2.2, 13.4, 0.6); parts.push(norm(coco, 0x5b3a1a));
  return (GEO.palm = merge(parts));
}
export function cactusGeo(){
  if(GEO.cactus) return GEO.cactus;
  const c = 0x3f7d3a, p = [C(0.9, 1.0, 9, 0, 4.5, 0, c, 10), new THREE.SphereGeometry(0.9, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)];
  p[1].translate(0, 9, 0); p[1] = norm(p[1], c);
  p.push(C(0.55, 0.55, 3, 1.6, 4.5, 0, c, 8, 0, Math.PI / 2), C(0.55, 0.55, 3.5, 2.9, 6.2, 0, c, 8), C(0.5, 0.5, 2.4, -1.4, 5.5, 0, c, 8, 0, Math.PI / 2), C(0.5, 0.5, 2.8, -2.5, 6.8, 0, c, 8));
  const fl = new THREE.SphereGeometry(0.45, 8, 6); fl.translate(0, 9.7, 0); p.push(norm(fl, 0xf472b6));
  return (GEO.cactus = merge(p));
}
export function bushGeo(){
  if(GEO.bush) return GEO.bush;
  const p = [];
  for(let i = 0; i < 6; i++){ const a = i / 6 * Math.PI * 2, s = new THREE.IcosahedronGeometry(1.5 + (i % 3) * 0.35, 1); s.translate(Math.cos(a) * 1.3, 1.3 + (i % 2) * 0.6, Math.sin(a) * 1.3); p.push(norm(s, i % 2 ? 0x3f7a2e : 0x4c8a36)); }
  const top = new THREE.IcosahedronGeometry(1.8, 1); top.translate(0, 2.3, 0); p.push(norm(top, 0x56963c));
  return (GEO.bush = merge(p));
}
export function flowerGeo(){
  if(GEO.flower) return GEO.flower;
  const p = [], cols = [0xf43f5e, 0xfacc15, 0xf8fafc, 0xa855f7, 0xfb923c];
  for(let i = 0; i < 5; i++){ const a = i * 2.4, r = 0.4 + i * 0.25; const st = new THREE.CylinderGeometry(0.04, 0.04, 1.1, 4); st.translate(Math.cos(a) * r, 0.55, Math.sin(a) * r); p.push(norm(st, 0x3f7a2e)); const h = new THREE.IcosahedronGeometry(0.22, 0); h.translate(Math.cos(a) * r, 1.15, Math.sin(a) * r); p.push(norm(h, cols[i])); }
  return (GEO.flower = merge(p));
}
export function llamaGeo(){
  if(GEO.llama) return GEO.llama;
  const P = 0xa855f7, Wt = 0xf5f3ff, Y = 0xfacc15, D = 0x1f2937;
  const p = [B(3.2, 2.6, 5.2, 0, 4.4, 0, P), B(1.2, 3.6, 1.3, 0, 6.8, 2.3, P, -0.2), B(1.4, 1.3, 2.2, 0, 8.9, 2.9, P), B(0.9, 0.7, 0.9, 0, 8.6, 4.1, Wt),
    B(0.35, 1.2, 0.3, 0.45, 10.0, 2.4, P), B(0.35, 1.2, 0.3, -0.45, 10.0, 2.4, P), B(0.25, 0.25, 0.1, 0.45, 9.2, 4.02, D), B(0.25, 0.25, 0.1, -0.45, 9.2, 4.02, D),
    B(3.4, 0.9, 3, 0, 5.9, -0.4, Y), B(3.5, 1.6, 0.4, 0, 4.6, 2.0, Wt), B(3.5, 1.6, 0.4, 0, 4.6, -2.3, Wt), B(0.8, 1.2, 0.8, 0, 4.9, -2.9, Wt)];
  for(const sx of [-1, 1]) for(const sz of [-1, 1]) p.push(B(0.8, 3.3, 0.8, sx * 1.1, 1.65, sz * 1.8, P), B(0.85, 0.5, 0.85, sx * 1.1, 0.25, sz * 1.8, D));
  return (GEO.llama = merge(p));
}
