// ============================================================
// BUILD PIECES (v16) — modelos das peças de construção ao estilo
// Fortnite, por material (madeira / pedra / metal) e por edição:
//   parede: normal · janela · porta · arco
//   piso:   normal · buraco
//   rampa:  normal (a edição inverte o sentido)
//   telhado (cone)
// Cada peça = 1 malha com 2 grupos (painel + moldura) → 2 draw calls.
// Também devolve as caixas de colisão locais de cada variante.
// ============================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Mat } from '../engine/materials.js';

export const GRID = 16, WALL_H = 13;
export const BUILD_MATS = {
  wood:  { label: 'Madeira', hp: 150, grow: 2.4, color: 0xc18a52, frame: 0x7a4a24 },
  stone: { label: 'Pedra',   hp: 300, grow: 1.5, color: 0xb9b3aa, frame: 0x6f6a63 },
  metal: { label: 'Metal',   hp: 500, grow: 0.95, color: 0x9aa7b6, frame: 0x4b5563 }
};
export const EDITS = { wall: ['full', 'window', 'door', 'arch'], floor: ['full', 'hole'], ramp: ['full', 'flip'], cone: ['full'] };

const _cache = new Map(), _mats = new Map();
function norm(g){
  g = g.index ? g.toNonIndexed() : g.clone();
  Object.keys(g.attributes).forEach(k => { if(!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); });
  if(!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}
function bx(w, h, d, x, y, z, rx, ry, rz){
  const g = new THREE.BoxGeometry(w, h, d);
  if(rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)));
  g.translate(x || 0, y || 0, z || 0);
  return norm(g);
}
// painel com UVs em escala do mundo (textura não estica em peças grandes)
function worldUV(g, s){
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for(let i = 0; i < p.count; i++){
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if(ay >= ax && ay >= az) uv.setXY(i, x / s, z / s); else if(ax >= az) uv.setXY(i, z / s, y / s); else uv.setXY(i, x / s, y / s);
  }
  return g;
}

/** materiais [painel, moldura] (+ versão danificada) por tipo */
export function buildMaterials(kind, damaged){
  const key = kind + (damaged ? '_d' : '');
  if(_mats.has(key)) return _mats.get(key);
  const B = BUILD_MATS[kind] || BUILD_MATS.wood;
  let panel, frame;
  if(kind === 'stone'){ panel = Mat.brick(B.color, 1).clone(); frame = Mat.concrete(B.frame, 1).clone(); }
  else if(kind === 'metal'){ panel = Mat.sheet(B.color, 1).clone(); frame = Mat.metal(B.frame, 0.45).clone(); }
  else { panel = Mat.wood(B.color).clone(); frame = Mat.wood(B.frame).clone(); }
  if(damaged){ panel.color.multiplyScalar(0.62); frame.color.multiplyScalar(0.6); panel.emissive = new THREE.Color(0x2a0a00); }
  const r = [panel, frame]; _mats.set(key, r); return r;
}

/** geometria (com grupos 0 = painel, 1 = moldura) + caixas locais [x0,y0,z0,x1,y1,z1] */
export function pieceGeometry(piece, kind, edit){
  edit = edit || 'full';
  const key = piece + '_' + kind + '_' + edit;
  if(_cache.has(key)) return _cache.get(key);
  const P = [], F = [], boxes = [];
  const G = GRID, H = WALL_H, T = 0.5, FT = 0.95;
  const texS = kind === 'wood' ? 16 : 8;
  if(piece === 'wall'){
    // origem no centro da parede (como a v15: BoxGeometry(G, H, 0.6))
    const y0 = -H / 2;
    const hole = edit === 'window' ? [-3, 3, -0.6, 3.6] : edit === 'door' ? [-2.8, 2.8, y0, y0 + 9.6] : edit === 'arch' ? [-6.6, 6.6, y0, y0 + 9.6] : null;
    const addPanel = (x0, x1, ya, yb) => { if(x1 - x0 < 0.05 || yb - ya < 0.05) return; P.push(worldUV(bx(x1 - x0, yb - ya, T, (x0 + x1) / 2, (ya + yb) / 2, 0), texS)); boxes.push([x0, ya, -0.35, x1, yb, 0.35]); };
    if(!hole) addPanel(-G / 2, G / 2, y0, H / 2);
    else {
      addPanel(-G / 2, hole[0], y0, H / 2); addPanel(hole[1], G / 2, y0, H / 2);
      addPanel(hole[0], hole[1], hole[3], H / 2); if(hole[2] > y0) addPanel(hole[0], hole[1], y0, hole[2]);
      // moldura da abertura
      F.push(bx(hole[1] - hole[0] + 0.5, 0.45, FT, 0, hole[3], 0)); if(hole[2] > y0) F.push(bx(hole[1] - hole[0] + 0.5, 0.45, FT, 0, hole[2], 0));
      [hole[0], hole[1]].forEach(x => F.push(bx(0.45, hole[3] - Math.max(y0, hole[2]), FT, x, (hole[3] + Math.max(y0, hole[2])) / 2, 0)));
    }
    // moldura exterior
    F.push(bx(G, FT, FT, 0, H / 2 - FT / 2, 0), bx(G, FT, FT, 0, y0 + FT / 2, 0), bx(FT, H, FT, -G / 2 + FT / 2, 0, 0), bx(FT, H, FT, G / 2 - FT / 2, 0, 0));
    if(kind === 'wood' && !hole){ const a = Math.atan2(H - 2, G - 2); const L = Math.hypot(G - 2, H - 2); F.push(bx(L, 0.7, 0.75, 0, 0, 0.12, 0, 0, a), bx(L, 0.7, 0.75, 0, 0, -0.12, 0, 0, -a)); }
    if(kind === 'wood' && hole){ F.push(bx(G - 1, 0.5, 0.7, 0, H / 2 - 2.5, 0.1)); }
    if(kind === 'metal'){ for(const yy of [-3.3, 0, 3.3]) F.push(bx(G - 1.4, 0.35, 0.75, 0, yy, 0)); for(const sx of [-1, 1]) for(const sy of [-1, 1]) F.push(bx(0.45, 0.45, 1.05, sx * (G / 2 - 1.1), sy * (H / 2 - 1.1), 0)); }
    if(kind === 'stone'){ F.push(bx(G + 0.3, 0.6, 1.1, 0, y0 + 0.3, 0)); }
  } else if(piece === 'floor'){
    const hole = edit === 'hole' ? 3.4 : 0;
    const add = (x0, x1, z0, z1) => { P.push(worldUV(bx(x1 - x0, T, z1 - z0, (x0 + x1) / 2, 0, (z0 + z1) / 2), texS)); boxes.push([x0, -0.3, z0, x1, 0.3, z1]); };
    if(!hole) add(-G / 2, G / 2, -G / 2, G / 2);
    else { add(-G / 2, G / 2, -G / 2, -hole); add(-G / 2, G / 2, hole, G / 2); add(-G / 2, -hole, -hole, hole); add(hole, G / 2, -hole, hole);
      F.push(bx(hole * 2, 0.8, 0.5, 0, 0, -hole), bx(hole * 2, 0.8, 0.5, 0, 0, hole), bx(0.5, 0.8, hole * 2, -hole, 0, 0), bx(0.5, 0.8, hole * 2, hole, 0, 0)); }
    F.push(bx(G, 0.8, FT, 0, 0, -G / 2 + FT / 2), bx(G, 0.8, FT, 0, 0, G / 2 - FT / 2), bx(FT, 0.8, G, -G / 2 + FT / 2, 0, 0), bx(FT, 0.8, G, G / 2 - FT / 2, 0, 0));
    if(kind === 'wood') for(let i = -2; i <= 2; i++) if(!hole || Math.abs(i) > 0) F.push(bx(0.3, 0.62, G - 1.5, i * 3.1, 0.02, 0));
    if(kind === 'metal') F.push(bx(G - 1.2, 0.7, 0.4, 0, 0, 0), bx(0.4, 0.7, G - 1.2, 0, 0, 0));
  } else if(piece === 'ramp'){
    const len = Math.hypot(G, H), a = -Math.atan2(H, G);
    const parts = [];
    parts.push(['p', worldUV(bx(G - 1.4, T, len, 0, 0, 0), texS)]);
    parts.push(['f', bx(FT, 1.2, len, -G / 2 + FT / 2, 0.3, 0)], ['f', bx(FT, 1.2, len, G / 2 - FT / 2, 0.3, 0)]);
    // degraus (madeira/pedra) ou nervuras antiderrapantes (metal)
    const n = kind === 'metal' ? 9 : 7;
    for(let i = 0; i < n; i++){ const z = -len / 2 + (i + 0.5) * len / n; parts.push(['f', bx(G - 2, kind === 'metal' ? 0.3 : 0.55, kind === 'metal' ? 0.35 : 0.9, 0, 0.35, z)]); }
    const R = new THREE.Matrix4().makeRotationX(a);
    for(const [t, g] of parts){ g.applyMatrix4(R); (t === 'p' ? P : F).push(g); }
    boxes.push([-G / 2, -H / 2, -G / 2, G / 2, H / 2, G / 2]);
  } else { // cone / telhado
    const c = new THREE.ConeGeometry(G * 0.71, H * 0.5, 4, 1, false); c.rotateY(Math.PI / 4); c.translate(0, H * 0.25, 0);
    P.push(worldUV(norm(c), texS));
    const apex = new THREE.Vector3(0, H * 0.5, 0);
    for(const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]){
      const corner = new THREE.Vector3(cx * G / 2, 0, cz * G / 2), d = apex.clone().sub(corner), L = d.length();
      const g = bx(0.7, L, 0.7, 0, 0, 0); g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())));
      g.translate((corner.x + apex.x) / 2, (corner.y + apex.y) / 2, (corner.z + apex.z) / 2); F.push(g);
    }
    F.push(bx(G, 0.7, 0.7, 0, 0.35, -G / 2 + 0.35), bx(G, 0.7, 0.7, 0, 0.35, G / 2 - 0.35), bx(0.7, 0.7, G, -G / 2 + 0.35, 0.35, 0), bx(0.7, 0.7, G, G / 2 - 0.35, 0.35, 0));
    boxes.push([-G / 2, 0, -G / 2, G / 2, 0.6, G / 2]);
  }
  const gp = mergeGeometries(P), gf = mergeGeometries(F);
  const geo = mergeGeometries([gp, gf], true);
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  const res = { geo, boxes };
  _cache.set(key, res); return res;
}
