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
  { n: 'Acampamento Pinhal', x: -330, z: 370, r: 55 },
  // v19: mapa 780 — novo anel
  { n: 'Cidade Fantasma', x: 640, z: 235, r: 62 },
  { n: 'Pântano Sombrio', x: -640, z: 240, r: 70 },
  { n: 'Estância Gelada', x: -470, z: -500, r: 80 },
  { n: 'Ruínas Antigas', x: -240, z: 650, r: 55 },
  { n: 'Mirante dos Ventos', x: 60, z: -680, r: 50 },
  // v20: mapa 920 — anel exterior novo
  { n: 'Baía dos Piratas', x: 760, z: -410, r: 60 },
  { n: 'Castelo Real', x: -300, z: -760, r: 62 },
  { n: 'Parque Radical', x: 420, z: 740, r: 62 },
  { n: 'Aeródromo', x: -790, z: -200, r: 75 },
  // v24: mapa 1100 — novo anel
  { n: 'Vila Nebulosa', x: 920, z: 150, r: 58 },
  { n: 'Observatório', x: -120, z: 920, r: 55 },
  { n: 'Floresta Profunda', x: -900, z: 350, r: 65 },
  { n: 'Porto Seco', x: 450, z: -880, r: 60 },
  // v24b: mais POIs
  { n: 'Cidade Submersa', x: -700, z: 700, r: 65 },
  { n: 'Vulcão Adormecido', x: 850, z: -700, r: 70 },
  { n: 'Jardim Suspenso', x: -850, z: -700, r: 55 },
  { n: 'Fortaleza de Gelo', x: 700, z: 850, r: 60 },
  { n: 'Mercado Noturno', x: -500, z: 500, r: 55 }
];
export function locationAt(x, z){ for(const L of LOCATIONS) if(Math.hypot(x - L.x, z - L.z) < L.r) return L; return null; }
// zonas sem vegetação/objetos aleatórios (retângulos x0,z0,x1,z1)
// 5.º valor = 1 → zona sem calçada (só sem vegetação)
export const ZONES = [[167, 147, 263, 245], [165, -255, 272, -160], [-312, 80, -255, 150], [18, -384, 44, -356, 1], [-262, -252, -228, -218, 1],
  [455, -75, 560, 15], [8, 440, 72, 520, 1], [-515, -105, -445, -35, 1], [300, -432, 362, -368], [-352, 350, -306, 392, 1],
  [600, 192, 690, 282], [-500, -528, -440, -486], [-275, 615, -205, 685, 1], [30, -712, 92, -650, 1],
  [-338, -798, -262, -722, 1], [372, 692, 468, 788], [-830, -275, -750, -125],
  [860, 90, 980, 210], [-180, 860, -60, 980], [-960, 290, -840, 410], [390, -940, 510, -820]];
// estradas de terra (centro → locais)
export const ROADS = [[0, -10, 215, 196], [0, -10, 215, -205], [0, -10, -285, 118], [0, -10, 30, -345], [-60, -40, -150, -168], [0, -10, -40, 200], [215, 196, 190, 90],
  [190, 90, 330, 40], [330, 40, 470, -30], [-40, 200, 80, 330], [80, 330, 40, 445], [-220, 20, -330, -40], [-330, -40, -455, -70], [-285, 118, -330, 350], [215, -205, 330, -370], [215, 196, 272, 272],
  [500, -30, 600, 120], [600, 120, 640, 225], [-480, -70, -590, 120], [-590, 120, -610, 200], [-245, -235, -380, -400], [-380, -400, -470, -480], [40, 480, -120, 600], [-120, 600, -230, 640], [30, -370, 50, -520], [50, -520, 60, -650],
  [330, -400, 560, -420], [560, -420, 730, -410], [-245, -235, -280, -520], [-280, -520, -300, -700], [335, 335, 400, 560], [400, 560, 420, 690], [-480, -70, -640, -150], [-640, -150, -735, -200],
  // v24: estradas para os novos POIs
  [730, -410, 850, 100], [850, 100, 920, 150], [-300, -700, -200, 800], [-200, 800, -120, 920], [-735, -200, -820, 280], [-820, 280, -900, 350], [420, 690, 440, -800], [440, -800, 450, -880]];

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
  // v19
  FLATS.push([645, 238, 52, 0], [-470, -505, 40, 0], [-240, 650, 40, 0], [60, -680, 36, 0]);
  // v20
  FLATS.push([755, -408, 42, 0.6], [-300, -760, 50, 0], [420, 740, 52, 0], [-790, -200, 74, 0]);
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
  // ============================================================
  // v19: anel novo (mapa 780) — POIs com muito para escalar
  // ============================================================
  R.bounce = []; R.climbTops = []; R.benches = []; R.boards = []; R.vault = null;
  const woodD = Mat.wood(0x6b4a2f), rockM = Mat.rock(0x857a6a), rockM2 = Mat.rock(0x9a8f7c);
  // ================= CIDADE FANTASMA =================
  {
    const bank = new PieceBank(W, 'fantasma');
    const A = building(bank, { x0: 610, z0: 200, cw: 2, cd: 2, stories: 2, wallMat: mats.woodW, matKey: 'wf', front: '+x', harvest: 'wood', hpW: 160, floorMat: mats.woodW, floor: 'fl_wf' });
    building(bank, { x0: 650, z0: 236, cw: 2, cd: 1, stories: 1, wallMat: mats.woodW, matKey: 'wf', front: '-x', harvest: 'wood', hpW: 160, floorMat: mats.woodW, floor: 'fl_wf' });
    building(bank, { x0: 610, z0: 246, cw: 1, cd: 2, stories: 1, wallMat: mats.woodW, matKey: 'wf', front: '+x', harvest: 'wood', hpW: 160, floorMat: mats.woodW, floor: 'fl_wf' });
    bank.type('crate', crateGeo(), mats.vcol, { hp: 90, harvest: 'wood' }); bank.type('barrel', barrelGeo(), mats.vcol, { hp: 60, harvest: 'metal', explode: { r: 13, dmg: 60 } });
    [[646, 214], [648, 218], [600, 262], [690, 228]].forEach(([x, z], i) => bank.add('crate', x, 0, z, i * 0.7));
    [[644, 270], [687, 262]].forEach(([x, z]) => bank.add('barrel', x, 0, z, 0));
    bank.finalize(); R.fantasma = bank;
    const [g, add] = SG();
    // caixa de água (torre) — 4 pernas + depósito; escala-se até ao topo
    const tx = 672, tz = 206, tankM = Mat.wood(0x7c5a3a);
    for(const sx of [-1, 1]) for(const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.45, 0.55, 22, 8), woodD, tx + sx * 3.6, 11, tz + sz * 3.6);
    add(new THREE.CylinderGeometry(5.2, 5.2, 8, 20), tankM, tx, 26, tz); add(new THREE.ConeGeometry(5.8, 3, 20), Mat.wood(0x4a2f1c), tx, 31.5, tz);
    for(const y of [23, 26, 29]) add(new THREE.TorusGeometry(5.25, 0.18, 6, 24), Mat.metal(0x374151, 0.4), tx, y, tz, Math.PI / 2);
    W.physics.addCircle(tx, tz, 5.4, 30); R.climbTops.push([tx, tz, 30]);
    // alpendre do saloon + letreiro
    add(new THREE.BoxGeometry(2, 0.5, 34), woodD, 643.5, 12.8, 216); for(const z of [201, 216, 231]) add(new THREE.BoxGeometry(0.5, 12.8, 0.5), woodD, 644, 6.4, z);
    add(new THREE.BoxGeometry(0.6, 3.6, 16), Mat.paint(0x7c2d12), 643, 29, 216); add(new THREE.BoxGeometry(0.7, 2.6, 14), Mat.emissive(0xfbbf24, 1.6), 642.8, 29, 216);
    // cercas e cactos secos
    for(let x = 600; x < 690; x += 6) add(new THREE.BoxGeometry(0.3, 2.2, 0.3), woodD, x, 1.1, 286);
    add(new THREE.BoxGeometry(90, 0.25, 0.2), woodD, 645, 1.8, 286);
    W.group.add(g); W._staticMerge.push(g);
    R.zips.push({ a: V(tx - 4, 30, tz), b: V(600, 9, 180) });
    R.benches.push([652, 226, Math.PI]); R.boards.push([628, 192, 0]);
    loot.chests.push([tx, tz, 0, 30.2]); loot.ammo.push([660, 270], [604, 214]);
  }
  // ================= PÂNTANO SOMBRIO =================
  {
    const bank = new PieceBank(W, 'pantano');
    bank.type('w_pt_plain', wallGeo('plain'), mats.woodW, { hp: 140, harvest: 'wood' }); bank.type('w_pt_door', wallGeo('door'), mats.woodW, { hp: 140, harvest: 'wood' }); bank.type('w_pt_window', wallGeo('window'), mats.woodW, { hp: 140, harvest: 'wood' }); bank.type('fl_pt', floorGeo(), mats.woodW, { hp: 220, harvest: 'wood' });
    const huts = [[-655, 222], [-618, 262], [-668, 272]], HY = 1.4;
    for(const [cx, cz] of huts){ bank.add('w_pt_door', cx, HY, cz + 8, 0); bank.add('w_pt_window', cx, HY, cz - 8, 0); bank.add('w_pt_window', cx - 8, HY, cz, Math.PI / 2); bank.add('w_pt_plain', cx + 8, HY, cz, Math.PI / 2); bank.add('fl_pt', cx, HY, cz, 0); }
    bank.finalize(); R.pantano = bank;
    const [g, add] = SG(); const roofM = Mat.wood(0x3f2a1a);
    for(const [cx, cz] of huts){
      [-1, 1].forEach(sd => add(new THREE.BoxGeometry(18.4, 0.6, 11), roofM, cx, HY + 16, cz + sd * 4.4, sd * 0.6)); W.physics.addBox(V(cx - 8.5, HY + WALL_H, cz - 8.5), V(cx + 8.5, HY + WALL_H + 0.5, cz + 8.5));
      for(const sx of [-1, 1]) for(const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.45, 0.5, 6, 8), woodD, cx + sx * 7.6, HY - 3, cz + sz * 7.6);
      loot.chests.push([cx - 3, cz - 3, 0, HY + 0.4]);
    }
    // passadiços de madeira (margem → cabanas)
    const walk = (x0, z0, x1, z1) => { const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), a = Math.atan2(dx, dz); const n = Math.ceil(L / 8); for(let i = 0; i < n; i++){ const t0 = i / n, t1 = (i + 1) / n, mx = x0 + dx * (t0 + t1) / 2, mz = z0 + dz * (t0 + t1) / 2; add(new THREE.BoxGeometry(4, 0.4, L / n + 0.1), plank, mx, HY - 0.2, mz, 0, a); W.physics.addBox(V(mx - 2.4, HY - 0.5, mz - 2.4), V(mx + 2.4, HY, mz + 2.4)); } };
    walk(-582, 240, -610, 262); walk(-626, 254, -647, 230); walk(-660, 230, -668, 263); walk(-640, 300, -664, 282);
    // árvores mortas
    const deadM = Mat.wood(0x3b2f26);
    [[-610, 210], [-690, 240], [-640, 200], [-600, 290], [-680, 300], [-700, 205]].forEach(([x, z], i) => { const y = heightAt(x, z); add(new THREE.CylinderGeometry(0.5, 1.2, 16, 7), deadM, x, y + 7, z, 0.08 * (i % 3), 0, 0.1); add(new THREE.CylinderGeometry(0.2, 0.4, 7, 5), deadM, x + 1.8, y + 11, z, 0, 0, -0.9); add(new THREE.CylinderGeometry(0.2, 0.35, 6, 5), deadM, x - 1.4, y + 13, z + 0.5, 0.3, 0, 0.8); W.physics.addCircle(x, z, 1.2, y + 15); });
    // cogumelos gigantes saltitões (brilham) — saltam o jogador ao aterrar em cima
    const capM = Mat.emissive(0x22d3ee, 0.9), stemM = Mat.cloth(0xe7e5e4, 'fabric');
    [[-634, 236, 4.2], [-602, 222, 3.6], [-676, 248, 4.6], [-650, 292, 3.8]].forEach(([x, z, r]) => { const y = Math.max(heightAt(x, z), -3); const top = y + 4.5; add(new THREE.CylinderGeometry(r * 0.25, r * 0.32, 4.5, 10), stemM, x, y + 2.25, z); add(new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), capM, x, top - 0.6, z); W.physics.addCircle(x, z, r * 0.9, top); R.bounce.push({ x, z, r: r * 0.95, top }); });
    W.group.add(g); W._staticMerge.push(g);
    R.benches.push([-596, 270, 0]); loot.ammo.push([-584, 236], [-640, 302]);
  }
  // ================= ESTÂNCIA GELADA =================
  {
    const bank = new PieceBank(W, 'estancia');
    const A = building(bank, { x0: -494, z0: -522, cw: 3, cd: 2, stories: 2, wallMat: mats.woodW, matKey: 'eg', front: '+z', harvest: 'wood', hpW: 180, floorMat: mats.woodW, floor: 'fl_eg' });
    bank.finalize(); R.estancia = bank;
    const [g, add] = SG(); const roofM = Mat.paint(0x7f1d1d);
    [-1, 1].forEach(sd => add(new THREE.BoxGeometry(50, 0.8, 19), roofM, -470, A.roofY + 4.5, -506 + sd * 7.6, sd * 0.5)); W.physics.addBox(V(-494, A.roofY - 0.5, -522), V(-446, A.roofY + 0.2, -490));
    // teleférico: torres + cabo (tirolesa) até ao alto da colina
    const snowM = Mat.plaster(0xf8fafc), metalT = Mat.metal(0x9ca3af, 0.4);
    const tw = [[-430, -470], [-420, -540], [-412, -600]];
    tw.forEach(([x, z]) => { const y = heightAt(x, z); add(new THREE.BoxGeometry(1.2, 22, 1.2), metalT, x, y + 11, z); add(new THREE.BoxGeometry(8, 0.8, 1.2), metalT, x, y + 21.6, z); W.physics.addCircle(x, z, 1.1, y + 22); R.climbTops.push([x, z, y + 22]); });
    for(let i = 0; i < tw.length - 1; i++){ const [ax, az] = tw[i], [bx, bz] = tw[i + 1]; R.zips.push({ a: V(ax + 3, heightAt(ax, az) + 21, az), b: V(bx + 3, heightAt(bx, bz) + 21, bz) }); }
    // bonecos de neve + rinque de gelo
    [[-450, -470], [-500, -470], [-440, -530]].forEach(([x, z]) => { const y = heightAt(x, z); add(new THREE.SphereGeometry(2.2, 14, 10), snowM, x, y + 2, z); add(new THREE.SphereGeometry(1.5, 14, 10), snowM, x, y + 5.2, z); add(new THREE.SphereGeometry(1.0, 12, 8), snowM, x, y + 7.4, z); add(new THREE.ConeGeometry(0.25, 1.2, 8), Mat.paint(0xf97316), x, y + 7.4, z + 1.3, Math.PI / 2); W.physics.addCircle(x, z, 2.2, y + 8.4); });
    const ice = new THREE.Mesh(new THREE.CircleGeometry(14, 40), new THREE.MeshPhysicalMaterial({ color: 0xbfe3ff, roughness: 0.05, metalness: 0.1, clearcoat: 1 })); ice.rotation.x = -Math.PI / 2; ice.position.set(-470, 0.08, -462); ice.receiveShadow = true; g.add(ice);
    W.group.add(g); W._staticMerge.push(g);
    R.benches.push([-452, -488, Math.PI / 2]); R.boards.push([-488, -484, 0]);
    loot.ammo.push([-480, -470], [-458, -530]);
  }
  // ================= RUÍNAS ANTIGAS =================
  {
    const [g, add] = SG();
    const cx = -240, cz = 650;
    // anel de colunas (algumas partidas) — escaláveis
    for(let i = 0; i < 12; i++){ const a = i / 12 * Math.PI * 2, x = cx + Math.cos(a) * 26, z = cz + Math.sin(a) * 26, h = i % 3 === 1 ? 6 + (i % 5) : 15;
      add(new THREE.CylinderGeometry(1.5, 1.7, h, 12), rockM2, x, h / 2, z); add(new THREE.BoxGeometry(4, 1, 4), rockM, x, 0.5, z); if(h > 10) add(new THREE.BoxGeometry(4, 1.2, 4), rockM, x, h + 0.6, z);
      W.physics.addCircle(x, z, 1.8, h + (h > 10 ? 1.2 : 0)); }
    // arcos entre colunas
    for(let i = 0; i < 12; i += 3){ const a0 = i / 12 * Math.PI * 2, a1 = (i + 1) / 12 * Math.PI * 2, x = cx + Math.cos((a0 + a1) / 2) * 26, z = cz + Math.sin((a0 + a1) / 2) * 26; add(new THREE.BoxGeometry(14, 2, 3.4), rockM, x, 16.2, z, 0, -(a0 + a1) / 2 + Math.PI / 2); W.physics.addBox(V(x - 6, 15.2, z - 6), V(x + 6, 17.2, z + 6), { noClimb: true }); }
    // torre central alta (36) com escada partida — o topo só se alcança a escalar
    add(new THREE.BoxGeometry(10, 36, 10), rockM, cx, 18, cz); add(new THREE.BoxGeometry(12, 1.4, 12), rockM2, cx, 36.7, cz);
    for(let i = 0; i < 4; i++){ const a = i * Math.PI / 2; add(new THREE.BoxGeometry(1.2, 3, 1.2), rockM2, cx + Math.cos(a) * 5.4 + Math.sin(a) * 5.4, 38.9, cz + Math.sin(a) * 5.4 - Math.cos(a) * 5.4); }
    W.physics.addBox(V(cx - 6, 0, cz - 6), V(cx + 6, 37.4, cz + 6)); R.climbTops.push([cx, cz, 37.4]);
    // muros caídos
    [[-212, 630, 0.3], [-270, 672, 1.2], [-262, 618, 2.4], [-216, 676, -0.6]].forEach(([x, z, r]) => { add(new THREE.BoxGeometry(12, 5 + (r > 1 ? 3 : 0), 2), rockM, x, 2.5, z, 0, r, 0.05); const h = 5 + (r > 1 ? 3 : 0); W.physics.addCircle(x, z, 4, h); });
    W.group.add(g); W._staticMerge.push(g);
    R.zips.push({ a: V(cx + 5, 36, cz), b: V(cx + 60, heightAt(cx + 60, cz - 30) + 6, cz - 30) });
    loot.chests.push([cx, cz, 0, 37.5], [cx + 14, cz - 8, 1, heightAt(cx + 14, cz - 8)], [cx - 12, cz + 12, 2, heightAt(cx - 12, cz + 12)]);
    R.benches.push([cx + 16, cz + 10, 0]); loot.ammo.push([cx - 18, cz - 4]);
  }
  // ================= MIRANTE DOS VENTOS =================
  {
    const [g, add] = SG();
    const pillars = [[60, -680, 7, 34], [36, -660, 5.5, 24], [86, -664, 6, 46]];
    for(const [x, z, r, h] of pillars){
      const y = heightAt(x, z);
      for(let k = 0; k < 4; k++){ const seg = new THREE.CylinderGeometry(r * (0.85 + (k % 2) * 0.1), r * (1.0 - k * 0.04), h / 4 + 0.6, 9); add(seg, k % 2 ? rockM : rockM2, x + Math.sin(k * 1.7) * 0.4, y + h / 8 + k * h / 4, z + Math.cos(k * 2.1) * 0.4, 0, k * 0.7); }
      add(new THREE.CylinderGeometry(r * 1.05, r * 0.9, 1.2, 9), Mat.cloth(0x4d7c2f, 'fabric'), x, y + h + 0.3, z);
      W.physics.addCircle(x, z, r * 0.95, y + h + 0.6); R.climbTops.push([x, z, y + h + 0.6]);
      loot.chests.push([x, z, 0, y + h + 0.7]);
    }
    // ponte de corda entre os dois pilares mais altos
    const [a, b] = [pillars[0], pillars[2]], ya = heightAt(a[0], a[1]) + a[3] + 0.6, yb = heightAt(b[0], b[1]) + b[3] + 0.6;
    R.zips.push({ a: V(b[0], yb + 2.5, b[1]), b: V(a[0], ya + 2.5, a[1]) }, { a: V(a[0] - 3, ya + 2, a[1]), b: V(20, heightAt(20, -620) + 6, -620) });
    // cata-vento
    const mill = new THREE.Group(); mill.position.set(b[0], yb + 6, b[1]);
    for(let i = 0; i < 4; i++){ const bl = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6, 0.2), Mat.paint(0xf1f5f9)); bl.position.y = 3; const pv = new THREE.Group(); pv.rotation.z = i * Math.PI / 2; pv.add(bl); mill.add(pv); }
    add(new THREE.CylinderGeometry(0.3, 0.3, 6, 8), Mat.metal(0x6b7280, 0.4), b[0], yb + 3, b[1]);
    W.group.add(mill); R.spinners.push({ o: mill, ax: 'z', sp: 1.4 });
    W.group.add(g); W._staticMerge.push(g);
    R.boards.push([60, -650, Math.PI]);
  }
  // ============================================================
  // v20: anel exterior (mapa 920) — navio pirata, castelo, parque, aeródromo
  // ============================================================
  R.cannons = []; R.catapults = []; R.balloons = []; R.coaster = null; R.vending = []; R.radars = []; R.barrels = []; R.karts = []; R.portals = [];
  const ramp = (x0, y0, z0, x1, y1, z1, axis, dir) => W.physics.addBox(V(x0, y0, z0), V(x1, y1, z1), { ramp: { axis, dir } });
  // ================= BAÍA DOS PIRATAS =================
  {
    const [g, add] = SG(); const cx = 755, cz = -408, hullM = Mat.wood(0x5b3a24), deckM = Mat.wood(0x9a6b43), trimM = Mat.paint(0x7f1d1d), goldM = Mat.metal(0xd4a02a, 0.3), sailM = (() => { const m = Mat.cloth(0xf5f0e1, 'fabric').clone(); m.side = THREE.DoubleSide; return m; })();
    const L = 58, Wd = 14, DY = 7.5;   // casco ao longo de z
    add(new THREE.BoxGeometry(Wd, DY - 1, L - 12), hullM, cx, (DY - 1) / 2 + 0.5, cz);                 // casco central
    const bow = new THREE.BoxGeometry(Wd, DY - 1, 12, 2, 2, 4); { const ps = bow.attributes.position; for(let i = 0; i < ps.count; i++){ const z = ps.getZ(i), t = (z + 6) / 12; ps.setX(i, ps.getX(i) * (1 - t * 0.92)); ps.setY(i, ps.getY(i) + t * t * 1.6); } bow.computeVertexNormals(); }
    add(bow, hullM, cx, (DY - 1) / 2 + 0.5, cz + L / 2);
    const stern = new THREE.BoxGeometry(Wd, DY - 1, 6, 2, 2, 2); { const ps = stern.attributes.position; for(let i = 0; i < ps.count; i++){ const z = ps.getZ(i), t = (3 - z) / 6; ps.setX(i, ps.getX(i) * (1 - t * 0.25)); } stern.computeVertexNormals(); }
    add(stern, hullM, cx, (DY - 1) / 2 + 0.5, cz - L / 2 + 3);
    add(new THREE.BoxGeometry(Wd + 0.6, 1.2, L - 10), trimM, cx, DY - 0.6, cz);                         // faixa vermelha
    add(new THREE.BoxGeometry(Wd - 1, 0.5, L - 10), deckM, cx, DY, cz);                                // convés
    W.physics.addBox(V(cx - Wd / 2, 0, cz - L / 2 + 6), V(cx + Wd / 2, DY + 0.25, cz + L / 2 - 6));
    W.physics.addBox(V(cx - 4, 0, cz + L / 2 - 6), V(cx + 4, DY - 1, cz + L / 2 + 2));
    for(const sx of [-1, 1]){ add(new THREE.BoxGeometry(0.6, 2.2, L - 10), hullM, cx + sx * (Wd / 2 - 0.3), DY + 1.1, cz); W.physics.addBox(V(cx + sx * (Wd / 2 - 0.3) - 0.3, DY, cz - L / 2 + 5), V(cx + sx * (Wd / 2 - 0.3) + 0.3, DY + 2.2, cz + L / 2 - 5), { noClimb: true }); }
    // castelo de popa (cabine do capitão) — sobe-se por escada
    add(new THREE.BoxGeometry(Wd, 6, 12), hullM, cx, DY + 3, cz - L / 2 + 12); add(new THREE.BoxGeometry(Wd + 0.4, 0.5, 12.4), deckM, cx, DY + 6.2, cz - L / 2 + 12);
    for(const sx of [-1, 1]) for(let k = 0; k < 3; k++) add(new THREE.BoxGeometry(0.2, 1.2, 1.4), Mat.emissive(0xfbbf24, 1.6), cx + sx * (Wd / 2 + 0.05), DY + 3.4, cz - L / 2 + 8 + k * 3.6);
    W.physics.addBox(V(cx - Wd / 2, DY, cz - L / 2 + 6), V(cx + Wd / 2, DY + 6.4, cz - L / 2 + 18));
    ramp(cx - 3, DY, cz - L / 2 + 18, cx + 3, DY + 6.4, cz - L / 2 + 28, 'z', -1); add(new THREE.BoxGeometry(6, 0.5, 11.6), deckM, cx, DY + 3.2, cz - L / 2 + 23, -0.56);
    // mastros, velas, cesto da gávea
    for(const [mz, h] of [[cz + 8, 30], [cz - 10, 24]]){
      add(new THREE.CylinderGeometry(0.55, 0.75, h, 10), hullM, cx, DY + h / 2, mz); W.physics.addCircle(cx, mz, 0.8, DY + h);
      for(const [yy, w] of [[0.45, 16], [0.75, 12]]){ const sg = new THREE.PlaneGeometry(w, h * 0.26, 10, 4); const ps = sg.attributes.position; for(let i = 0; i < ps.count; i++){ const x = ps.getX(i); ps.setZ(i, (1 - Math.pow(x / (w / 2), 2)) * 1.6); } sg.computeVertexNormals(); add(sg, sailM, cx, DY + h * yy, mz + 0.9); add(new THREE.CylinderGeometry(0.2, 0.2, w + 1, 6), hullM, cx, DY + h * yy + h * 0.13, mz + 0.4, 0, 0, Math.PI / 2); }
      add(new THREE.CylinderGeometry(2.4, 1.8, 1.6, 12, 1, true), hullM, cx, DY + h * 0.86, mz); add(new THREE.CylinderGeometry(2.3, 2.3, 0.3, 12), deckM, cx, DY + h * 0.86 - 0.7, mz);
      W.physics.addCircle(cx, mz, 2.4, DY + h * 0.86 - 0.55);
    }
    loot.chests.push([cx, cz + 8.6, 0, DY + 30 * 0.86 - 0.5], [cx + 3, cz - L / 2 + 10, 2, DY + 0.3], [cx - 3, cz + 18, 1, DY + 0.3]);
    // bandeira pirata
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(5, 3, 8, 2), (() => { const m = Mat.cloth(0x111111, 'fabric').clone(); m.side = THREE.DoubleSide; return m; })()); flag.position.set(cx, DY + 32, cz + 8 + 2.6); flag.rotation.y = Math.PI / 2; g.add(flag);
    add(new THREE.SphereGeometry(0.7, 10, 8), Mat.paint(0xf5f5f4), cx + 0.05, DY + 32.2, cz + 10.6);
    // canhões no convés (sistema: E = disparar-te)
    for(const [sx, dz] of [[1, 2], [1, -6], [-1, 2], [-1, -6]]){
      const px = cx + sx * (Wd / 2 - 2.4), pz = cz + dz;
      add(new THREE.BoxGeometry(2, 1, 2.6), hullM, px, DY + 0.6, pz); add(new THREE.CylinderGeometry(0.55, 0.75, 3.6, 12), Mat.metal(0x1f2937, 0.4), px + sx * 1.0, DY + 1.6, pz, 0, 0, sx * (Math.PI / 2 - 0.35));
      for(const wz of [-1, 1]) add(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 10), hullM, px, DY + 0.5, pz + wz * 1.1, Math.PI / 2);
      R.cannons.push({ x: px, y: DY, z: pz, dx: sx * 0.85, dz: -0.53 * sx });
    }
    // cais / prancha até à areia
    ramp(cx - Wd / 2 - 10, 0, cz - 2, cx - Wd / 2, DY + 0.25, cz + 2, 'x', 1); add(new THREE.BoxGeometry(10.6, 0.5, 4), deckM, cx - Wd / 2 - 5, DY / 2, cz, 0, 0, 0.66);
    // tesouro na areia + barris + palmeiras de pedra
    add(new THREE.BoxGeometry(2.6, 1.6, 1.8), Mat.wood(0x6b4a2f), cx - 28, heightAt(cx - 28, cz + 20) + 0.8, cz + 20); add(new THREE.BoxGeometry(2.8, 0.4, 2), goldM, cx - 28, heightAt(cx - 28, cz + 20) + 1.7, cz + 20);
    loot.chests.push([cx - 30, cz - 22, 0, heightAt(cx - 30, cz - 22)]);
    W.group.add(g); W._staticMerge.push(g);
    R.zips.push({ a: V(cx, DY + 30 * 0.86 + 1.5, cz + 8), b: V(cx - 70, heightAt(cx - 70, cz + 30) + 6, cz + 30) });
    R.vending.push([cx - 34, cz - 4, Math.PI / 2]); R.barrels.push([cx - 24, cz - 30]);
    loot.ammo.push([cx - 20, cz + 10]);
  }
  // ================= CASTELO REAL =================
  {
    const [g, add] = SG(); const cx = -300, cz = -760, S2 = 36, WH = 14, WT = 3.2, stoneC = Mat.rock(0x9ca3af), stoneD2 = Mat.rock(0x6b7280), roofC = Mat.paint(0x1e3a8a), banner = (() => { const m = Mat.cloth(0xb91c1c, 'fabric').clone(); m.side = THREE.DoubleSide; return m; })();
    // muralhas (portão a norte, +z)
    const wall = (x0, z0, x1, z1) => { const w = Math.abs(x1 - x0) || WT, d = Math.abs(z1 - z0) || WT, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2; add(new THREE.BoxGeometry(w, WH, d), stoneC, mx, WH / 2, mz); W.physics.addBox(V(mx - w / 2, 0, mz - d / 2), V(mx + w / 2, WH, mz + d / 2));
      const n = Math.floor(Math.max(w, d) / 3); for(let i = 0; i < n; i += 2){ const t = (i + 0.5) / n; add(new THREE.BoxGeometry(w > d ? 1.6 : WT, 1.6, w > d ? WT : 1.6), stoneD2, x0 + (x1 - x0) * t || mx, WH + 0.8, z0 + (z1 - z0) * t || mz); } };
    wall(cx - S2, cz - S2, cx + S2, cz - S2); wall(cx - S2, cz - S2, cx - S2, cz + S2); wall(cx + S2, cz - S2, cx + S2, cz + S2);
    wall(cx - S2, cz + S2, cx - 7, cz + S2); wall(cx + 7, cz + S2, cx + S2, cz + S2);
    add(new THREE.BoxGeometry(14, 4, WT + 0.4), stoneD2, cx, WH - 2, cz + S2); W.physics.addBox(V(cx - 7, WH - 4, cz + S2 - 1.8), V(cx + 7, WH, cz + S2 + 1.8));   // arco do portão
    add(new THREE.BoxGeometry(12, 0.5, 26), Mat.wood(0x5b3a24), cx, 0.3, cz + S2 + 13); W.physics.addBox(V(cx - 6, 0, cz + S2), V(cx + 6, 0.55, cz + S2 + 26));   // ponte levadiça
    // escadas de pedra para o adarve (interior)
    ramp(cx - S2 + 1.6, 0, cz - 20, cx - S2 + 7.6, WH, cz + 10, 'z', 1); add(new THREE.BoxGeometry(6, 0.8, 33), stoneD2, cx - S2 + 4.6, WH / 2, cz - 5, -Math.atan2(WH, 30));
    ramp(cx + S2 - 7.6, 0, cz - 20, cx + S2 - 1.6, WH, cz + 10, 'z', 1); add(new THREE.BoxGeometry(6, 0.8, 33), stoneD2, cx + S2 - 4.6, WH / 2, cz - 5, -Math.atan2(WH, 30));
    // torres de canto (escaláveis, telhado cónico)
    for(const sx of [-1, 1]) for(const sz of [-1, 1]){ const tx = cx + sx * S2, tz = cz + sz * S2; add(new THREE.CylinderGeometry(6, 6.6, 24, 16), stoneC, tx, 12, tz); add(new THREE.CylinderGeometry(6.8, 6.8, 1.2, 16), stoneD2, tx, 24.6, tz); add(new THREE.ConeGeometry(7.2, 9, 16), roofC, tx, 29.6, tz); W.physics.addCircle(tx, tz, 6.4, 25.2); R.climbTops.push([tx, tz, 25.2]);
      const bn = new THREE.Mesh(new THREE.PlaneGeometry(3, 6, 2, 6), banner); bn.position.set(tx - sx * 0.2, 17, tz + sz * 6.7); bn.rotation.y = sz > 0 ? 0 : Math.PI; g.add(bn); }
    // torre de menagem (prédio de 3 andares em pedra)
    const bank = new PieceBank(W, 'castelo');
    const K = building(bank, { x0: cx - 16, z0: cz - 22, cw: 2, cd: 2, stories: 3, wallMat: mats.brickB, matKey: 'cs', front: '+z', harvest: 'stone', hpW: 260, bigDoor: true });
    bank.finalize(); R.castelo = bank;
    for(const [ox, oz] of [[-16, -22], [16, -22], [-16, 10], [16, 10]]){ add(new THREE.CylinderGeometry(2.6, 2.6, K.roofY + 6, 10), stoneD2, cx + ox, (K.roofY + 6) / 2, cz + oz); add(new THREE.ConeGeometry(3.2, 5, 10), roofC, cx + ox, K.roofY + 8.5, cz + oz); W.physics.addCircle(cx + ox, cz + oz, 2.7, K.roofY + 6); }
    // pátio: catapulta, fonte, carroças
    R.catapults.push({ x: cx + 18, z: cz + 20, ry: 0 });
    add(new THREE.CylinderGeometry(5, 5.4, 1.4, 20), stoneD2, cx - 20, 0.7, cz + 22); add(new THREE.CylinderGeometry(4.4, 4.4, 0.3, 20), Mat.emissive(0x38bdf8, 0.4), cx - 20, 1.3, cz + 22); add(new THREE.CylinderGeometry(0.6, 0.8, 4, 10), stoneC, cx - 20, 2.6, cz + 22); W.physics.addCircle(cx - 20, cz + 22, 5.2, 1.4);
    W.group.add(g); W._staticMerge.push(g);
    R.zips.push({ a: V(cx + S2, 26, cz - S2), b: V(cx + S2 + 70, heightAt(cx + S2 + 70, cz - S2 + 40) + 6, cz - S2 + 40) });
    loot.chests.push([cx - S2, cz - S2, 0, 25.3], [cx + S2, cz + S2, 1, 25.3]); R.benches.push([cx + 22, cz - 4, Math.PI / 2]); R.radars.push([cx - 24, cz - 28]);
    loot.ammo.push([cx, cz + 28], [cx - 26, cz]);
  }
  // ================= PARQUE RADICAL =================
  {
    const [g, add] = SG(); const cx = 420, cz = 740, steel = Mat.metal(0xe5e7eb, 0.25), red = Mat.paint(0xdc2626), yel = Mat.paint(0xfacc15), blu = Mat.paint(0x2563eb);
    // roda gigante (gira) — estrutura fixa + aro rotativo com cabines
    const wx = cx + 26, wz = cz + 18, wy = 24;
    for(const sz of [-1, 1]) for(const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.45, 0.6, wy + 2, 8), steel, wx + sx * 6, wy / 2, wz + sz * 2.4, sz * 0.1, 0, -sx * 0.25);
    W.physics.addCircle(wx, wz, 3, 3);
    const wheel = new THREE.Group(); wheel.position.set(wx, wy, wz); W.group.add(wheel);
    const rimM = Mat.metal(0xf8fafc, 0.2), cabCols = [red, yel, blu, Mat.paint(0x16a34a)];
    for(const sz of [-1.2, 1.2]){ const rim = new THREE.Mesh(new THREE.TorusGeometry(17, 0.35, 8, 64), rimM); rim.position.z = sz; wheel.add(rim); }
    for(let i = 0; i < 12; i++){ const a = i / 12 * Math.PI * 2; const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 17, 5), rimM); sp.position.set(Math.cos(a) * 8.5, Math.sin(a) * 8.5, 0); sp.rotation.z = a - Math.PI / 2; wheel.add(sp);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 2.4), cabCols[i % 4]); cab.position.set(Math.cos(a) * 17, Math.sin(a) * 17 - 1.4, 0); cab.castShadow = true; wheel.add(cab); cab.userData.cab = true; }
    const lights = Mat.emissive(0xf472b6, 2.4); for(let i = 0; i < 24; i++){ const a = i / 24 * Math.PI * 2; const b = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 4), lights); b.position.set(Math.cos(a) * 17, Math.sin(a) * 17, 1.6); wheel.add(b); }
    R.spinners.push({ o: wheel, ax: 'z', sp: 0.12, cabs: wheel.children.filter(c => c.userData.cab) });
    // carrossel
    const car = new THREE.Group(); car.position.set(cx - 22, 0, cz - 14); W.group.add(car);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.8, 32), Mat.paint(0xfef3c7)); disc.position.y = 0.6; car.add(disc);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(10, 4, 32), red); canopy.position.y = 8.4; car.add(canopy);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 8, 12), Mat.metal(0xd4a02a, 0.25)); pole.position.y = 4.4; car.add(pole);
    for(let i = 0; i < 8; i++){ const a = i / 8 * Math.PI * 2; const hp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 6), Mat.metal(0xd4a02a, 0.25)); hp.position.set(Math.cos(a) * 6.5, 4, Math.sin(a) * 6.5); car.add(hp);
      const horse = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 2.6), i % 2 ? Mat.paint(0xf8fafc) : Mat.paint(0x92400e)); horse.position.set(Math.cos(a) * 6.5, 3 + (i % 2) * 0.6, Math.sin(a) * 6.5); horse.rotation.y = -a; car.add(horse); }
    car.traverse(o => { if(o.isMesh) o.castShadow = true; });
    R.spinners.push({ o: car, ax: 'y', sp: 0.5 }); W.physics.addCircle(cx - 22, cz - 14, 9, 1.0);
    // barracas de feira (baús dentro)
    [[cx - 30, cz + 22], [cx - 12, cz + 30], [cx + 4, cz - 30], [cx + 26, cz - 22]].forEach(([x, z], i) => {
      add(new THREE.BoxGeometry(8, 3, 5), Mat.wood(0xa16207), x, 1.5, z); W.physics.addBox(V(x - 4, 0, z - 2.5), V(x + 4, 3, z + 2.5));
      for(let k = 0; k < 4; k++) add(new THREE.BoxGeometry(2, 0.3, 6.4), k % 2 ? red : Mat.paint(0xf8fafc), x - 3 + k * 2, 6.2, z + 0.6, 0.25);
      for(const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.15, 0.15, 6, 6), steel, x + sx * 3.8, 3, z + 3);
      if(i % 2 === 0) loot.chests.push([x, z + 4.5, 0, 0]);
    });
    // grinaldas de luzes
    for(let i = 0; i < 30; i++){ const t = i / 30, x = cx - 34 + t * 60, z = cz + 4 + Math.sin(t * 9) * 2; add(new THREE.SphereGeometry(0.3, 6, 4), Mat.emissive([0xfacc15, 0x22d3ee, 0xf472b6][i % 3], 2.2), x, 7 - Math.abs(Math.sin(t * Math.PI * 3)) * 1.2, z); }
    W.group.add(g); W._staticMerge.push(g);
    // montanha-russa (carril v19 com lombas e uma volta alta)
    const pts = []; for(let i = 0; i <= 28; i++){ const a = i / 28 * Math.PI * 2; const r = 44 + Math.sin(a * 3) * 8; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r, 6 + Math.abs(Math.sin(a * 2)) * 18 + (i % 7 === 3 ? 6 : 0)]); }
    R.coaster = pts;
    R.vending.push([cx + 8, cz + 6, 0]); R.barrels.push([cx - 4, cz - 8]); R.karts.push([cx - 40, cz + 48, 0.6], [cx - 46, cz + 40, 0.6]);
    loot.ammo.push([cx, cz]);
  }
  // ================= AERÓDROMO =================
  {
    const [g, add] = SG(); const cx = -790, cz = -200, asphalt = Mat.concrete(0x3f3f46, 1), lineM = Mat.paint(0xf8fafc), hang = Mat.sheet(0x94a3b8, 1);
    add(new THREE.BoxGeometry(18, 0.12, 150), asphalt, cx + 18, 0.08, cz); for(let i = 0; i < 12; i++) add(new THREE.BoxGeometry(0.8, 0.14, 6), lineM, cx + 18, 0.1, cz - 66 + i * 12);
    for(let i = 0; i < 16; i++) for(const sx of [-1, 1]) add(new THREE.SphereGeometry(0.3, 6, 4), Mat.emissive(i % 2 ? 0x22c55e : 0xfbbf24, 2.4), cx + 18 + sx * 9.5, 0.3, cz - 72 + i * 9.6);
    // hangares (meio cilindro) — abertos a leste
    for(const hz of [cz - 44, cz + 30]){
      const hg = new THREE.CylinderGeometry(14, 14, 26, 24, 1, true, 0, Math.PI); hg.rotateZ(Math.PI / 2); hg.rotateY(Math.PI / 2);
      const hm = hang.clone(); hm.side = THREE.DoubleSide; add(hg, hm, cx - 22, 0, hz); add(new THREE.BoxGeometry(1, 14, 28), hang, cx - 35, 7, hz);
      W.physics.addBox(V(cx - 36, 0, hz - 14), V(cx - 34, 14, hz + 14)); W.physics.addBox(V(cx - 35, 0, hz - 14.6), V(cx - 9, 10, hz - 13.4)); W.physics.addBox(V(cx - 35, 0, hz + 13.4), V(cx - 9, 10, hz + 14.6));
      W.physics.addBox(V(cx - 35, 13.2, hz - 14), V(cx - 9, 14.4, hz + 14)); R.climbTops.push([cx - 22, hz, 14.4]);
      loot.chests.push([cx - 28, hz - 6, 1, 0], [cx - 28, hz + 6, 3, 0]);
    }
    // avião estacionado (escalável)
    const px = cx - 2, pz = cz - 8, body = Mat.paint(0xf8fafc), stripe = Mat.paint(0xdc2626);
    add(new THREE.CylinderGeometry(2.2, 1.4, 22, 16), body, px, 3.2, pz, Math.PI / 2); add(new THREE.SphereGeometry(2.2, 16, 10), body, px, 3.2, pz + 11);
    add(new THREE.BoxGeometry(26, 0.5, 5), body, px, 3.0, pz + 1); add(new THREE.BoxGeometry(26.2, 0.52, 1), stripe, px, 3.0, pz + 3.2); add(new THREE.BoxGeometry(9, 0.4, 3), body, px, 3.6, pz - 9.5); add(new THREE.BoxGeometry(0.4, 4, 3.4), stripe, px, 5.4, pz - 9.8);
    const prop = new THREE.Group(); prop.position.set(px, 3.2, pz + 13.3); W.group.add(prop); for(let i = 0; i < 3; i++){ const bl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.6, 0.1), Mat.metal(0x111827, 0.3)); bl.position.y = 1.8; const pv = new THREE.Group(); pv.rotation.z = i / 3 * Math.PI * 2; pv.add(bl); prop.add(pv); } R.spinners.push({ o: prop, ax: 'z', sp: 9 });
    for(const sx of [-3, 3]) add(new THREE.CylinderGeometry(0.7, 0.7, 0.6, 12), Mat.polymer(0x111111), px + sx, 0.7, pz + 2, 0, 0, Math.PI / 2);
    W.physics.addBox(V(px - 2, 0, pz - 11), V(px + 2, 5.4, pz + 13)); W.physics.addBox(V(px - 13, 2.7, pz - 1.5), V(px + 13, 3.25, pz + 3.5));
    // torre de controlo
    const tx = cx - 30, tz = cz + 74 - 70; add(new THREE.CylinderGeometry(2.8, 3.4, 24, 12), Mat.concrete(0xd6d3d1, 1), tx, 12, tz); add(new THREE.CylinderGeometry(6, 5, 5, 12), mats.glass, tx, 26.5, tz); add(new THREE.CylinderGeometry(6.4, 6.4, 0.8, 12), Mat.concrete(0x78716c, 1), tx, 29.4, tz); add(new THREE.CylinderGeometry(6.2, 6.2, 0.6, 12), Mat.concrete(0x78716c, 1), tx, 24.2, tz);
    W.physics.addCircle(tx, tz, 3.4, 24.5); W.physics.addBox(V(tx - 4.4, 29, tz - 4.4), V(tx + 4.4, 29.8, tz + 4.4)); R.climbTops.push([tx, tz, 29.8]);
    const bl = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), Mat.emissive(0xff2d2d, 4).clone()); bl.position.set(tx, 31, tz); W.group.add(bl); R.blinks.push(bl);
    loot.chests.push([tx, tz, 0, 24.6], [tx + 1, tz + 1, 1, 29.9]);
    // manga de vento
    add(new THREE.CylinderGeometry(0.15, 0.15, 8, 6), Mat.metal(0x9ca3af, 0.4), cx + 34, 4, cz + 60); add(new THREE.ConeGeometry(0.9, 4, 10, 1, true), Mat.paint(0xf97316), cx + 34, 7.6, cz + 62, Math.PI / 2 + 0.2);
    W.group.add(g); W._staticMerge.push(g);
    R.balloons.push([cx + 40, cz - 50], [cx + 40, cz + 40]); R.radars.push([tx + 8, tz + 2]); R.vending.push([cx - 8, cz + 50, Math.PI]); R.karts.push([cx + 30, cz - 10, 0], [cx + 30, cz + 2, 0]);
    R.zips.push({ a: V(tx + 3, 30.5, tz), b: V(cx + 30, 6, cz + 30) });
  }
  // balões, karts, máquinas, barris e portais nos outros POIs
  R.balloons.push([60, -640], [-470, -450], [0, 30], [640, 280]);
  R.karts.push([24, -40, 0], [500, 30, 1.6], [-480, -30, 0], [40, 440, 0], [-300, 180, 0.4]);
  R.vending.push([20, -36, 0], [205, -170, 0], [-470, -480, 0], [-640, 300, 0], [330, -370, Math.PI]);
  R.barrels.push([10, 20], [-245, -200], [215, 230], [-480, -40], [60, 500], [500, -10], [-330, 390]);
  R.radars.push([30, -360], [215, 160], [-245, -260]);
  R.portals.push([[205, 190], [-360, 10]], [[230, -220], [-100, 360]], [[-240, -200], [450, -160]], [[30, 90], [620, 380]]);
  // bancadas / quadros nos POIs antigos
  R.benches.push([12, 8, 0], [226, -190, 0], [205, 180, 0], [-280, 100, 0], [495, 0, 0], [330, -380, 0]);
  R.boards.push([-6, 10, 0], [230, 210, Math.PI], [40, 455, 0]);
  R.vault = [342, -428, 0];
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
