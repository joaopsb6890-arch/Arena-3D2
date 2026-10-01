// ============================================================
// RIG — construção do personagem com ESQUELETO hierárquico
// (hips → spine → chest → neck → head, clavícula → braço →
// antebraço → mão → falanges, coxa → canela → pé → dedos),
// malhas por articulação mescladas por material (poucas draw
// calls), rosto com BLEND SHAPES (morph targets) na boca,
// pálpebras e sobrancelhas articuladas, cabelo com spring bones,
// capa com cloth verlet, hitboxes invisíveis e LOD.
// Eixos: personagem olha para +Z, esquerda = +X, cima = +Y.
// ============================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Mat } from '../engine/materials.js';
import { SKINS, BODY_TYPES } from './skins.js';
import { SpringChain, VerletCloth } from './secondary.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------- geometrias utilitárias ----------------
function lathe(profile, seg){
  // profile: [[r, y], ...] de baixo para cima
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)), seg || 24);
}
// segmento de membro pendendo em -Y: raio r1 (topo) → r2 (base), bulge no meio
function limb(len, r1, r2, bulge, seg){
  const pts = [], N = 12;
  for(let i = 0; i <= N; i++){
    const t = i / N;                 // 0 = base (-len), 1 = topo (0)
    const y = -len + t * len;
    let r = r2 + (r1 - r2) * t + Math.sin(Math.PI * t) * (bulge || 0);
    const capB = Math.min(1, t * N / 1.5), capT = Math.min(1, (1 - t) * N / 1.5);
    r *= Math.sqrt(Math.min(capB, capT)) * 0.35 + 0.65;
    pts.push([r, y]);
  }
  pts.unshift([0.001, -len - r2 * 0.35]);
  pts.push([0.001, r1 * 0.35]);
  return lathe(pts, seg || 18);
}
function sphere(r, ws, hs){ return new THREE.SphereGeometry(r, ws || 24, hs || 16); }
function box(w, h, d, r){ return r ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d); }
function cyl(rt, rb, h, s){ return new THREE.CylinderGeometry(rt, rb, h, s || 16); }
function capsule(r, len){ return new THREE.CapsuleGeometry(r, len, 6, 14); }
function torus(r, t, rs, ts, arc){ return new THREE.TorusGeometry(r, t, rs || 10, ts || 32, arc); }

function xf(geo, p, r, s){
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if(!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const m = new THREE.Matrix4().compose(p || V(0, 0, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(r || [0, 0, 0]))), s ? (s.isVector3 ? s : V(s, s, s)) : V(1, 1, 1));
  g.applyMatrix4(m);
  // mantém só atributos comuns para o merge
  Object.keys(g.attributes).forEach(k => { if(!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); });
  return g;
}

// zonas de mistura por junta: z = meia-largura da zona, dir = sentido do osso (−1 = pende em −Y), max = peso máx. do pai
const BLEND = {
  uArm: { z: 0.34, dir: 1, max: 0.55 }, fArm: { z: 0.3, dir: 1, max: 0.6 }, hand: { z: 0.1, dir: 1, max: 0.5 },
  thigh: { z: 0.3, dir: 1, max: 0.5 }, shin: { z: 0.3, dir: 1, max: 0.6 }, foot: { z: 0.12, dir: 1, max: 0.45 },
  neck: { z: 0.14, dir: -1, max: 0.6 }, spine: { z: 0.16, dir: -1, max: 0.5 }, chest: { z: 0.2, dir: -1, max: 0.5 }, head: { z: 0.12, dir: -1, max: 0.35 }
};
// ---------------- construtor de partes ----------------
class PartBuilder {
  constructor(){ this.buckets = new Map(); }
  add(joint, geo, mat, p, r, s, opts){
    opts = opts || {};
    const key = joint.uuid + '|' + mat.uuid + '|' + (opts.fine ? 'f' : 'c') + '|' + (opts.noShadow ? 'n' : 's');
    if(!this.buckets.has(key)) this.buckets.set(key, { joint, mat, fine: !!opts.fine, noShadow: !!opts.noShadow, geos: [] });
    this.buckets.get(key).geos.push(xf(geo, p, r, s));
  }
  /**
   * OTIMIZAÇÃO v13 — "skinned batching": todas as peças rígidas do personagem com o mesmo
   * material viram UM SkinnedMesh (cada vértice preso a 1 osso, peso 1). O esqueleto continua
   * igual (juntas Object3D animadas pelo Animator/IK/molas), mas as ~70 draw calls por
   * personagem caem para ~15-20 (uma por material). Mesmo visual, GPU faz o transform.
   */
  buildSkinned(root, fineList, meshList){
    root.updateMatrixWorld(true);
    const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const bones = [], boneIdx = new Map();
    const groups = new Map();
    for(const b of this.buckets.values()){
      if(!boneIdx.has(b.joint)){ boneIdx.set(b.joint, bones.length); bones.push(b.joint); }
      const key = b.mat.uuid + '|' + b.fine + '|' + b.noShadow;
      if(!groups.has(key)) groups.set(key, { mat: b.mat, fine: b.fine, noShadow: b.noShadow, geos: [] });
      const bi = boneIdx.get(b.joint), M = new THREE.Matrix4().multiplyMatrices(rootInv, b.joint.matrixWorld);
      // v15: SKINNING SUAVE nas articulações — vértices perto da junta misturam o osso com o osso-pai
      // (ombro, cotovelo, pulso, anca, joelho, tornozelo, pescoço, tronco). Acaba com as "quebras"
      // de manequim quando o braço/perna dobra. Custo zero em runtime (GPU já faz 4 pesos por vértice).
      const bl = BLEND[b.joint.name.replace(/[LR]$/, '')];
      let pi = -1;
      if(bl && b.joint.parent && b.joint.parent.isObject3D && b.joint.parent !== root){
        const par = b.joint.parent;
        if(!boneIdx.has(par)){ boneIdx.set(par, bones.length); bones.push(par); }
        pi = boneIdx.get(par);
      }
      for(const g0 of b.geos){
        const g = g0.clone(); g.applyMatrix4(M);
        const n = g.attributes.position.count;
        const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
        const lp = g0.attributes.position;
        for(let i = 0; i < n; i++){
          si[i * 4] = bi; sw[i * 4] = 1;
          if(pi >= 0){
            // distância ao longo do eixo do osso (−Y para membros, +Y para tronco/pescoço)
            const y = lp.getY(i) * bl.dir, z = bl.z;
            if(y > -z){ const t = Math.min(1, (y + z) / (2 * z)); const w = t * t * (3 - 2 * t) * bl.max; si[i * 4 + 1] = pi; sw[i * 4] = 1 - w; sw[i * 4 + 1] = w; }
          }
        }
        g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
        g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
        groups.get(key).geos.push(g);
      }
    }
    const skeleton = new THREE.Skeleton(bones);   // boneInverses = inverso da pose de repouso
    for(const G of groups.values()){
      const g = mergeGeometries(G.geos, false);
      g.computeBoundingSphere(); g.boundingSphere.radius *= 1.6;   // folga para poses extremas
      const m = new THREE.SkinnedMesh(g, G.mat);
      m.castShadow = !G.noShadow; m.receiveShadow = true;
      root.add(m); m.bind(skeleton, m.matrixWorld);
      m.boundingSphere = g.boundingSphere.clone();
      m.computeBoundingSphere = function(){ this.boundingSphere = g.boundingSphere.clone(); };
      meshList.push(m);
      if(G.fine) fineList.push(m);
    }
    return skeleton;
  }
  build(fineList, meshList){
    for(const b of this.buckets.values()){
      const g = mergeGeometries(b.geos, false);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, b.mat);
      m.castShadow = !b.noShadow; m.receiveShadow = true;
      b.joint.add(m);
      meshList.push(m);
      if(b.fine) fineList.push(m);
    }
  }
}

// ---------------- boca com morph targets ----------------
function buildMouth(lipColor){
  const ring = torus(0.13, 0.034, 10, 32);
  const inner = new THREE.CircleGeometry(0.125, 32);
  inner.translate(0, 0, -0.012);
  const teethU = box(0.19, 0.035, 0.03); teethU.translate(0, 0.022, -0.02);
  const teethL = box(0.17, 0.03, 0.03); teethL.translate(0, -0.03, -0.024);
  const parts = [ring, inner, teethU, teethL].map(g => { const n = g.index ? g.toNonIndexed() : g; Object.keys(n.attributes).forEach(k => { if(!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); }); return n; });
  const geo = mergeGeometries(parts, true);
  // achata para formar lábios fechados
  const pos = geo.attributes.position;
  const base = new Float32Array(pos.array.length);
  for(let i = 0; i < pos.count; i++){
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    base[i * 3] = x; base[i * 3 + 1] = y * 0.3; base[i * 3 + 2] = z;
  }
  pos.array.set(base); pos.needsUpdate = true;
  // grupos 0 lábios / 1 interior / 2,3 dentes → materiais
  const targets = {
    open:   (x, y, z) => [x * 0.92, y < 0 ? y - 0.11 * (1 - Math.min(1, (x / 0.15) ** 2)) : y + 0.018, z],
    smile:  (x, y, z) => [x * 1.14, y + 0.05 * (x / 0.13) ** 2 - 0.006, z - Math.abs(x) * 0.08],
    frown:  (x, y, z) => [x * 0.96, y - 0.05 * (x / 0.13) ** 2 + 0.01, z],
    O:      (x, y, z) => [x * 0.6, y * 2.4 + (y < 0 ? -0.03 : 0.02), z + 0.02],
    wide:   (x, y, z) => [x * 1.24, y < 0 ? y - 0.03 : y + 0.008, z],
    press:  (x, y, z) => [x * 1.02, y * 0.35, z - 0.006],
    sneer:  (x, y, z) => [x, x < 0 && y > 0 ? y + 0.035 : y, z]
  };
  geo.morphAttributes.position = [];
  const names = Object.keys(targets);
  names.forEach(n => {
    const arr = new Float32Array(base.length);
    for(let i = 0; i < pos.count; i++){
      const r = targets[n](base[i * 3], base[i * 3 + 1], base[i * 3 + 2]);
      arr[i * 3] = r[0] - base[i * 3]; arr[i * 3 + 1] = r[1] - base[i * 3 + 1]; arr[i * 3 + 2] = r[2] - base[i * 3 + 2];
    }
    geo.morphAttributes.position.push(new THREE.Float32BufferAttribute(arr, 3));
  });
  geo.morphTargetsRelative = true;
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, [Mat.lips(lipColor), Mat.mouthInner(), Mat.teeth(), Mat.teeth()]);
  mesh.morphTargetInfluences = new Array(names.length).fill(0);
  mesh.morphTargetDictionary = {}; names.forEach((n, i) => mesh.morphTargetDictionary[n] = i);
  return mesh;
}

// ============================================================
export function createCharacter(skinKey, opts){
  opts = opts || {};
  const S = typeof skinKey === 'string' ? (SKINS[skinKey] || SKINS.default) : skinKey;
  const BT = BODY_TYPES[opts.bodyType || S.body] || BODY_TYPES.padrao;
  const H = BT.height, B = BT.bulk;

  // ------------ proporções (unidades do mundo, altura ≈ 7.2) ------------
  const P = {
    thigh: 1.72 * BT.leg * H, shin: 1.62 * BT.leg * H, ankle: 0.16 * H,
    hipW: 0.40 * BT.hip, spine: 0.95 * H, chestH: 1.0 * H, neck: 0.34 * H,
    headR: 0.6 * BT.head,   // v20: cabeça um pouco maior (proporção estilo Fortnite)
    shoulderW: 0.80 * BT.shoulder, clavX: 0.18,
    uArm: 1.32 * BT.arm * H, fArm: 1.22 * BT.arm * H, hand: 0.5, foot: 0.62
  };
  P.hipH = P.thigh + P.shin + P.ankle;
  P.legLen = P.thigh + P.shin;

  const root = new THREE.Group(); root.name = 'char_root';
  const J = {};
  const joint = (name, parent, pos) => { const j = new THREE.Group(); j.name = name; j.position.copy(pos); parent.add(j); J[name] = j; return j; };

  // ------------ esqueleto ------------
  joint('hips', root, V(0, P.hipH + 0.06, 0));
  joint('spine', J.hips, V(0, 0.3, 0));
  joint('chest', J.spine, V(0, P.spine * 0.62, 0));
  joint('neck', J.chest, V(0, P.chestH * 0.98, -0.02));
  joint('head', J.neck, V(0, P.neck, 0.03));
  for(const sd of ['L', 'R']){
    const sx = sd === 'L' ? 1 : -1;
    joint('clav' + sd, J.chest, V(sx * P.clavX, P.chestH * 0.8, -0.02));
    joint('uArm' + sd, J['clav' + sd], V(sx * (P.shoulderW - P.clavX), 0, 0));
    joint('fArm' + sd, J['uArm' + sd], V(0, -P.uArm, 0));
    joint('hand' + sd, J['fArm' + sd], V(0, -P.fArm, 0));
    joint('thigh' + sd, J.hips, V(sx * P.hipW, -0.08, 0));
    joint('shin' + sd, J['thigh' + sd], V(0, -P.thigh, 0));
    joint('foot' + sd, J['shin' + sd], V(0, -P.shin, 0));
    joint('toe' + sd, J['foot' + sd], V(0, -P.ankle + 0.06, P.foot * 0.62));
    // mão em repouso: palma para o corpo
    J['hand' + sd].rotation.y = sd === 'L' ? -Math.PI / 2 : Math.PI / 2;
  }

  // ------------ materiais ------------
  const clothKind = S.outfit === 'hoodie' || S.outfit === 'robe' ? 'fabric' : 'fabric';
  const mTop = Mat.cloth(S.top, clothKind), mTop2 = Mat.cloth(S.top2, 'fabric');
  const mPant = Mat.cloth(S.pant, 'denim');
  const mSkin = Mat.skin(S.skin);
  const mBoot = Mat.leather(S.boots), mBelt = Mat.leather(0x2a1d14), mGlove = Mat.leather(0x1f1f22);
  const mMetal = Mat.metal(0xbfc5cc, 0.3), mGold = Mat.metal(0xd4a02a, 0.25);
  const mAccent = Mat.paint(S.accent), mHair = Mat.hair(S.hair);
  const mSole = Mat.polymer(0x1a1a1a);
  const armor = S.outfit === 'armor';

  const pb = new PartBuilder();
  const fine = [], meshes = [];
  const add = (j, geo, mat, p, r, s, o) => pb.add(j, geo, mat, p, r, s, o);

  // ------------ pélvis / quadril ------------
  add(J.hips, lathe([[0.001, -0.42], [0.46 * B, -0.36], [0.62 * B, -0.12], [0.66 * B, 0.12], [0.62 * B, 0.32], [0.001, 0.34]], 28), mPant, V(0, 0, 0), null, V(1, 1, 0.72));
  add(J.hips, torus(0.64 * B, 0.07, 8, 36), mBelt, V(0, 0.2, 0), [Math.PI / 2, 0, 0], V(1, 0.72, 1));
  add(J.hips, box(0.24, 0.18, 0.06, 0.02), S.outfit === 'armor' ? mGold : mMetal, V(0, 0.2, 0.47 * B));
  if(S.extras.includes('pouches')){
    add(J.hips, box(0.26, 0.3, 0.18, 0.05), mBelt, V(0.52 * B, 0.08, 0.2), [0, -0.5, 0], null, { fine: true });
    add(J.hips, box(0.26, 0.3, 0.18, 0.05), mBelt, V(-0.52 * B, 0.08, 0.2), [0, 0.5, 0], null, { fine: true });
  }

  // ------------ abdômen (spine) ------------
  const topMat = S.outfit === 'robe' ? mTop : mTop;
  add(J.spine, lathe([[0.001, -0.05], [0.6 * B, -0.02], [0.62 * B, P.spine * 0.3], [0.66 * B, P.spine * 0.62], [0.001, P.spine * 0.66]], 28), topMat, V(0, 0, 0), null, V(1, 1, 0.7));
  if(S.outfit === 'robe'){
    // saia do manto (cai por cima das coxas)
    add(J.hips, lathe([[0.001, -1.6], [0.95 * B, -1.55], [0.8 * B, -0.8], [0.68 * B, -0.1], [0.001, 0.0]], 32), mTop2, V(0, 0, 0), null, V(1, 1, 0.8));
  }

  // ------------ peito ------------
  const cH = P.chestH;
  add(J.chest, lathe([[0.001, -0.02], [0.66 * B, 0.0], [0.79 * B, cH * 0.32], [0.86 * B, cH * 0.6], [0.8 * B, cH * 0.82], [0.5, cH * 0.97], [0.001, cH * 1.02]], 32), topMat, V(0, 0, 0), null, V(1, 1, 0.7));
  // v20: trapézios (ligam pescoço aos ombros — acabam com o ar de "boneco de madeira")
  for(const sx of [1, -1]) add(J.chest, sphere(0.36 * B, 18, 12), topMat, V(sx * 0.4 * B, cH * 0.88, -0.05), [0, 0, -sx * 0.35], V(1.55, 0.6, 1.0));
  // peitorais / omoplatas suaves
  for(const sx of [1, -1]){ add(J.chest, sphere(0.34 * B, 18, 12), topMat, V(sx * 0.3 * B, cH * 0.62, 0.3 * B), null, V(1.15, 0.85, 0.75)); add(J.chest, sphere(0.34 * B, 18, 12), topMat, V(sx * 0.32 * B, cH * 0.64, -0.3 * B), null, V(1.1, 0.95, 0.6)); }
  // gola
  add(J.chest, torus(0.3, 0.07, 8, 28), S.outfit === 'hoodie' ? mTop2 : mTop2, V(0, cH * 0.96, 0), [Math.PI / 2, 0, 0], V(1, 0.9, 1));
  if(S.outfit === 'jacket' || S.outfit === 'hoodie'){
    add(J.chest, box(0.05, cH * 0.9, 0.04), mMetal, V(0, cH * 0.46, 0.56 * B), [-0.08, 0, 0], null, { fine: true }); // zíper
    add(J.chest, box(0.3, 0.22, 0.05, 0.03), mTop2, V(0.34 * B, cH * 0.58, 0.5 * B), [-0.15, 0.25, 0], null, { fine: true });
  }
  if(S.outfit === 'hoodie'){
    // capuz abaixado atrás do pescoço
    add(J.chest, sphere(0.42, 20, 12), mTop2, V(0, cH * 0.92, -0.38), null, V(1.15, 0.6, 0.75));
    add(J.chest, box(0.7 * B, 0.3, 0.12, 0.06), mTop2, V(0, cH * 0.22, 0.5 * B), [-0.1, 0, 0]); // bolso canguru
  }
  if(S.outfit === 'vest' || S.outfit === 'armor'){
    const vm = armor ? mGold : mTop2;
    add(J.chest, box(1.2 * B, cH * 0.7, 0.2, 0.08), vm, V(0, cH * 0.42, 0.44 * B), [-0.06, 0, 0]);
    add(J.chest, box(1.2 * B, cH * 0.7, 0.2, 0.08), vm, V(0, cH * 0.42, -0.44 * B), [0.06, 0, 0]);
    for(let i = 0; i < 3; i++) add(J.chest, box(0.26, 0.22, 0.1, 0.03), armor ? mMetal : mBelt, V(-0.36 + i * 0.36, cH * 0.22, 0.56 * B), null, null, { fine: true });
    if(armor){
      add(J.chest, torus(0.5, 0.06, 8, 24, Math.PI), mMetal, V(0, cH * 0.72, 0.55 * B), [0, 0, 0], V(1, 0.6, 1), { fine: true });
    }
  }
  if(S.outfit === 'tshirt'){
    add(J.chest, box(0.3, 0.3, 0.03, 0.02), mAccent, V(0, cH * 0.55, 0.57 * B), [-0.12, 0, 0], null, { fine: true }); // estampa
  }
  if(S.outfit === 'robe'){
    add(J.chest, box(0.14, cH * 0.95, 0.05), mAccent, V(0.18, cH * 0.45, 0.54 * B), [-0.08, 0, 0.05]);
    add(J.chest, box(0.14, cH * 0.95, 0.05), mAccent, V(-0.18, cH * 0.45, 0.54 * B), [-0.08, 0, -0.05]);
  }
  if(S.extras.includes('fur')){
    add(J.chest, torus(0.42, 0.16, 10, 28), Mat.cloth(0xf1f5f9, 'fabric'), V(0, cH * 0.94, 0), [Math.PI / 2, 0, 0], V(1.05, 0.95, 1));
  }
  // ombros (deltoides) + ombreiras
  for(const sd of ['L', 'R']){
    const u = J['uArm' + sd];
    const ssx = sd === 'L' ? 1 : -1;
    add(u, sphere(0.37 * B, 20, 14), armor ? mGold : topMat, V(-ssx * 0.05, -0.1, 0), null, V(1.12, 1.05, 1.02));   // v20: deltoide mais cheio
    if(armor || S.outfit === 'vest') add(u, sphere(0.4 * B, 18, 10, ), armor ? mGold : mTop2, V(0, 0.02, 0), null, V(1.05, 0.55, 1.05));
  }

  // ------------ mochila (spring) ------------
  let backpack = null;
  if(S.extras.includes('backpack')){
    const bpJ = joint('backpack', J.chest, V(0, cH * 0.62, -0.5 * B));
    const bpTip = joint('backpackTip', bpJ, V(0, -0.02, -0.001));
    add(bpTip, box(0.9 * B, 1.0, 0.42, 0.12), Mat.cloth(0x4b5563, 'fabric'), V(0, -0.3, -0.18));
    add(bpTip, box(0.7 * B, 0.36, 0.2, 0.06), Mat.cloth(0x374151, 'fabric'), V(0, -0.52, -0.42), null, null, { fine: true });
    add(bpTip, cyl(0.16, 0.16, 0.95, 14), Mat.cloth(0x6b7280, 'fabric'), V(0, 0.28, -0.2), [0, 0, Math.PI / 2], null, { fine: true });
    // alças
    add(J.chest, box(0.1, cH * 0.8, 0.9 * B), mBelt, V(0.32, cH * 0.55, 0), [0.0, 0, 0], V(1, 1, 1), { fine: true });
    add(J.chest, box(0.1, cH * 0.8, 0.9 * B), mBelt, V(-0.32, cH * 0.55, 0), null, null, { fine: true });
    backpack = bpJ;
  }

  // ------------ braços ------------
  for(const sd of ['L', 'R']){
    const u = J['uArm' + sd], f = J['fArm' + sd], h = J['hand' + sd];
    const sleeveLong = S.outfit !== 'tshirt' && S.outfit !== 'vest';
    // braço superior: manga ou pele
    add(u, limb(P.uArm, 0.3 * B, 0.23 * B, 0.06 * B), sleeveLong || armor ? topMat : mSkin);   // v20: bíceps
    if(!sleeveLong && !armor){
      add(u, limb(P.uArm * 0.42, 0.33 * B, 0.3 * B, 0.01), topMat, V(0, 0, 0)); // manga curta
    }
    // antebraço
    add(f, limb(P.fArm, 0.235 * B, 0.16 * B, 0.055 * B), sleeveLong ? topMat : mSkin);
    if(sleeveLong) add(f, torus(0.16 * B, 0.05, 8, 20), mTop2, V(0, -P.fArm + 0.12, 0), [Math.PI / 2, 0, 0], null, { fine: true });
    if(armor) add(f, limb(P.fArm * 0.6, 0.25 * B, 0.2 * B, 0.02), mGold, V(0, -P.fArm * 0.35, 0));
    // cotovelo
    add(f, sphere(0.225 * B, 14, 10), sleeveLong ? topMat : mSkin, V(0, 0, -0.01));
    // MÃO: palma + dedos articulados
    const gloveMat = (S.outfit === 'armor' || S.outfit === 'vest') ? mGlove : mSkin;
    const sx = sd === 'L' ? 1 : -1;
    add(h, box(0.32, 0.38, 0.17, 0.07), gloveMat, V(0, -0.18, 0));
    const fingers = [];
    for(let i = 0; i < 4; i++){
      const fx = (-0.105 + i * 0.07) * sx * -1;
      const len = [0.15, 0.17, 0.16, 0.13][i];
      const f1 = joint('f' + sd + i + 'a', h, V(fx, -0.35, 0.01));
      const f2 = joint('f' + sd + i + 'b', f1, V(0, -len, 0));
      add(f1, capsule(0.038, len - 0.03), gloveMat, V(0, -len / 2, 0), null, null, { fine: true });
      add(f2, capsule(0.034, len * 0.8 - 0.03), gloveMat, V(0, -len * 0.4, 0), null, null, { fine: true });
      fingers.push([f1, f2]);
    }
    const t1 = joint('t' + sd + 'a', h, V(0.15 * sx, -0.1, 0.06));
    t1.rotation.set(0.5, 0, sx * 0.6);
    const t2 = joint('t' + sd + 'b', t1, V(0, -0.14, 0));
    add(t1, capsule(0.045, 0.1), gloveMat, V(0, -0.07, 0), null, null, { fine: true });
    add(t2, capsule(0.04, 0.08), gloveMat, V(0, -0.06, 0), null, null, { fine: true });
    // mão "luva" simplificada para LOD distante
    const mitten = new THREE.Mesh(xf(capsule(0.12, 0.25), V(0, -0.4, 0)), gloveMat);
    mitten.castShadow = true; mitten.visible = false; h.add(mitten);
    J['hand' + sd].userData.fingers = fingers;
    J['hand' + sd].userData.thumb = [t1, t2];
    J['hand' + sd].userData.mitten = mitten;
  }

  // ------------ pernas ------------
  for(const sd of ['L', 'R']){
    const t = J['thigh' + sd], s = J['shin' + sd], f = J['foot' + sd], toe = J['toe' + sd];
    add(t, limb(P.thigh, 0.38 * B, 0.26 * B, 0.06 * B), mPant);
    add(s, sphere(0.24 * B, 14, 10), mPant, V(0, 0, 0.02));
    add(s, limb(P.shin, 0.26 * B, 0.18 * B, 0.05 * B), mPant);
    add(s, sphere(0.2 * B, 14, 10), mPant, V(0, -P.shin * 0.3, -0.07), null, V(1.05, 1.7, 0.95));   // v20: gémeos
    if(S.outfit === 'vest' || armor) add(s, box(0.34, 0.36, 0.12, 0.06), armor ? mGold : mBelt, V(0, -0.12, 0.2), [0.12, 0, 0], null, { fine: true }); // joelheira
    // bota: cano + pé
    add(s, lathe([[0.2, -P.shin - 0.02], [0.22, -P.shin * 0.72], [0.24, -P.shin * 0.56], [0.001, -P.shin * 0.55]], 18), mBoot);
    add(f, box(0.4, 0.3, 0.72, 0.1), mBoot, V(0, -P.ankle + 0.19, 0.16));
    add(f, box(0.44, 0.08, 0.8, 0.03), mSole, V(0, -P.ankle + 0.02, 0.17));
    add(toe, sphere(0.2, 16, 10), mBoot, V(0, 0.05, 0.04), null, V(1.05, 0.72, 1.2));
    add(toe, box(0.42, 0.08, 0.34, 0.03), mSole, V(0, -0.02, 0.06));
    add(f, torus(0.21, 0.035, 6, 20), mBelt, V(0, 0.04, 0.02), [Math.PI / 2, 0, 0], V(1, 1.1, 1), { fine: true });
  }

  // ------------ pescoço e cabeça ------------
  const R = P.headR;
  add(J.neck, cyl(0.24, 0.3, P.neck + 0.12, 16), mSkin, V(0, P.neck / 2, 0));
  const hc = V(0, R * 0.95, 0.02); // centro da cabeça no joint
  // crânio + mandíbula + bochechas
  add(J.head, sphere(R, 32, 24), mSkin, hc, null, V(0.94, 1.06, 1.0));
  add(J.head, sphere(R * 0.78, 28, 18), mSkin, V(0, R * 0.52, 0.12), null, V(0.95, 0.75, 1.0));
  add(J.head, sphere(R * 0.26, 14, 10), mSkin, V(R * 0.42, R * 0.72, R * 0.62), null, V(1, 0.8, 0.6));
  add(J.head, sphere(R * 0.26, 14, 10), mSkin, V(-R * 0.42, R * 0.72, R * 0.62), null, V(1, 0.8, 0.6));
  // nariz
  add(J.head, sphere(R * 0.14, 14, 10), mSkin, V(0, R * 0.86, R * 0.97), null, V(0.9, 1.35, 1.1));
  add(J.head, sphere(R * 0.1, 10, 8), mSkin, V(0, R * 0.7, R * 1.02), null, V(1.4, 0.8, 1));
  // orelhas
  add(J.head, sphere(R * 0.2, 14, 10), mSkin, V(R * 0.93, R * 0.92, 0), [0, 0.3, 0], V(0.45, 1, 0.8));
  add(J.head, sphere(R * 0.2, 14, 10), mSkin, V(-R * 0.93, R * 0.92, 0), [0, -0.3, 0], V(0.45, 1, 0.8));

  // olhos (grupos para olhar), pálpebras e sobrancelhas
  const face = { eyes: [], lidsU: [], lidsL: [], brows: [], mouth: null };
  for(const sd of [1, -1]){
    const eg = new THREE.Group(); eg.position.set(sd * R * 0.34, R * 1.02, R * 0.84 + 0.02); J.head.add(eg);
    const white = new THREE.Mesh(sphere(R * 0.19, 20, 14), Mat.eyeWhite()); white.scale.set(1, 0.92, 0.7); eg.add(white);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(R * 0.105, 24), Mat.iris(S.eye)); iris.position.z = R * 0.135; eg.add(iris);
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(R * 0.05, 18), Mat.pupil()); pupil.position.z = R * 0.137; eg.add(pupil);
    const hl = new THREE.Mesh(new THREE.CircleGeometry(R * 0.022, 10), Mat.emissive(0xffffff, 1.5)); hl.position.set(R * 0.035, R * 0.04, R * 0.139); eg.add(hl);
    face.eyes.push(eg);
    // pálpebra superior (casca esférica) — gira em X para piscar
    const lidU = new THREE.Group(); lidU.position.copy(eg.position); J.head.add(lidU);
    const lidGeo = new THREE.SphereGeometry(R * 0.205, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const lu = new THREE.Mesh(lidGeo, mSkin); lu.scale.set(1.02, 0.95, 0.76); lu.rotation.x = -0.9; lidU.add(lu);
    const lash = new THREE.Mesh(torus(R * 0.2, R * 0.018, 6, 20, Math.PI), Mat.hair(0x151010)); lash.scale.set(1, 1, 0.76); lash.rotation.set(-0.9 + Math.PI / 2, 0, 0); lidU.add(lash);
    face.lidsU.push(lidU);
    const lidL = new THREE.Group(); lidL.position.copy(eg.position); J.head.add(lidL);
    const ll = new THREE.Mesh(new THREE.SphereGeometry(R * 0.2, 20, 8, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), mSkin); ll.scale.set(1.02, 0.95, 0.76); lidL.add(ll);
    face.lidsL.push(lidL);
    // sobrancelha
    const bw = new THREE.Group(); bw.position.set(sd * R * 0.36, R * 1.27, R * 0.95 + 0.02); J.head.add(bw);
    const bm = new THREE.Mesh(box(R * 0.4, R * 0.075, R * 0.08, 0.02), Mat.hair(S.hair === 0xe8f4f8 || S.hair === 0xd8d4f0 ? 0x9ca3af : S.hair)); bm.rotation.z = sd * 0.08; bw.add(bm);
    bw.userData.side = sd;
    face.brows.push(bw);
  }
  // boca com blend shapes
  const mouth = buildMouth(new THREE.Color(S.skin).lerp(new THREE.Color(0x9b3b3b), 0.45).getHex());
  mouth.position.set(0, R * 0.5, Math.max(0.12 + R * 0.78, R * 0.92 + 0.02) - 0.01); mouth.rotation.x = -0.1; mouth.scale.set(R / 0.56, R / 0.56, R / 0.56);
  J.head.add(mouth); face.mouth = mouth;
  if(S.extras.includes('mask')){
    add(J.head, sphere(R * 0.98, 28, 16), Mat.cloth(0x111318, 'fabric'), V(0, R * 0.55, 0.06), null, V(0.97, 0.52, 1.04));
    mouth.visible = false;
  }

  // ------------ cabelo ------------
  const springs = [];
  const headColl = { obj: J.head, offset: hc.clone(), r: R * 1.05 };
  const neckColl = { obj: J.chest, offset: V(0, cH * 0.7, 0), r: 0.72 * B };
  const backColl = { obj: J.chest, offset: V(0, cH * 0.35, -0.1), r: 0.75 * B };
  const hairCap = (() => {
    const g = new THREE.SphereGeometry(R * 1.07, 36, 20, 0, Math.PI * 2, 0, Math.PI * 0.56);
    const pos = g.attributes.position;
    for(let i = 0; i < pos.count; i++){
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const n = Math.sin(a * 9) * 0.02 + Math.sin(a * 23 + y * 20) * 0.012;
      const s = 1 + n;
      pos.setXYZ(i, x * s, y * s, z * s);
    }
    g.computeVertexNormals();
    return g;
  })();
  if(S.hairStyle !== 'mohawk' && !S.extras.includes('helmet')) add(J.head, hairCap, mHair, hc.clone().add(V(0, R * 0.1, -R * 0.08)), [-0.42, 0, 0], V(0.97, 1.0, 1.02));
  if(S.hairStyle === 'mohawk'){
    // crista com molas (física secundária) + laterais raspadas
    add(J.head, hairCap, Mat.hair(new THREE.Color(S.skin).lerp(new THREE.Color(0x1a1410), 0.35).getHex()), hc.clone().add(V(0, R * 0.08, -R * 0.08)), [-0.42, 0, 0], V(0.95, 0.97, 1.0));
    for(let i = 0; i < 6; i++){
      const t = i / 5; const sj = joint('mohawk' + i, J.head, V(0, R * (1.95 - Math.pow(t - 0.35, 2) * 0.9), R * (0.55 - t * 1.35)));
      sj.rotation.x = -0.35 - t * 0.6;
      add(sj, box(R * 0.16, R * 0.62 * (1 - Math.abs(t - 0.4) * 0.5), R * 0.28, R * 0.05), mHair, V(0, R * 0.22, 0));
      springs.push(new SpringChain([sj], V(0, R * 0.5, 0), { stiffness: 30, drag: 0.45, gravity: 2, wind: 0.08 }));
    }
  }
  if(S.hairStyle === 'afro'){
    const ag = new THREE.SphereGeometry(R * 1.35, 30, 20); const ap = ag.attributes.position;
    for(let i = 0; i < ap.count; i++){ const x = ap.getX(i), y = ap.getY(i), z = ap.getZ(i); const n = 1 + Math.sin(x * 19) * Math.sin(y * 17) * Math.sin(z * 23) * 0.05; ap.setXYZ(i, x * n, y * n, z * n); }
    ag.computeVertexNormals();
    const afJ = joint('afro', J.head, hc.clone().add(V(0, R * 0.95, -R * 0.45)));
    add(afJ, ag, mHair, V(0, 0, 0), null, V(1.08, 0.85, 1.0));
    springs.push(new SpringChain([afJ], V(0, R * 0.4, 0), { stiffness: 55, drag: 0.5, gravity: 1, wind: 0.02 }));
  }
  if(S.hairStyle === 'short' || S.hairStyle === 'spiky'){
    // franja
    add(J.head, sphere(R * 0.5, 18, 10), mHair, V(0, R * 1.62, R * 0.58), [0.5, 0, 0], V(1.4, 0.4, 0.6));
  }
  if(S.hairStyle === 'spiky'){
    for(let i = 0; i < 9; i++){
      const a = (i / 9) * Math.PI * 2;
      const sj = joint('spike' + i, J.head, V(Math.cos(a) * R * 0.55, R * 1.75, Math.sin(a) * R * 0.5 - R * 0.1));
      sj.rotation.set(Math.sin(a) * 0.9 - 0.3, 0, -Math.cos(a) * 0.9);
      add(sj, new THREE.ConeGeometry(R * 0.2, R * 0.75, 8), mHair, V(0, R * 0.3, 0));
      springs.push(new SpringChain([sj], V(0, R * 0.7, 0), { stiffness: 40, drag: 0.5, gravity: 1, wind: 0.05 }));
    }
  }
  if(S.hairStyle === 'bun'){
    const bj = joint('bun', J.head, V(0, R * 1.62, -R * 0.62));
    add(bj, sphere(R * 0.36, 18, 12), mHair, V(0, R * 0.08, -R * 0.12));
    add(bj, torus(R * 0.2, R * 0.05, 6, 16), mAccent, V(0, 0, -0.02), [0.6, 0, 0], null, { fine: true });
    springs.push(new SpringChain([bj], V(0, R * 0.2, -R * 0.35), { stiffness: 18, drag: 0.4, gravity: 3, colliders: [headColl] }));
  }
  if(S.hairStyle === 'long' || S.hairStyle === 'ponytail'){
    const strands = S.hairStyle === 'long' ? [[-0.55, 0.9], [-0.28, 0.4], [0, 0.2], [0.28, 0.4], [0.55, 0.9]] : [[0, 0.1]];
    strands.forEach(([ox, side], k) => {
      const nSeg = S.hairStyle === 'long' ? 4 : 5;
      const segLen = S.hairStyle === 'long' ? 0.42 : 0.36;
      const baseY = S.hairStyle === 'ponytail' ? R * 1.5 : R * 1.25;
      const js = [];
      let parent = J.head;
      for(let s = 0; s < nSeg; s++){
        const pos = s === 0 ? V(ox * R, baseY, -R * 0.82 + Math.abs(ox) * R * 0.25) : V(0, -segLen, 0);
        const jj = joint('hair' + k + '_' + s, parent, pos);
        if(s === 0) jj.rotation.x = S.hairStyle === 'ponytail' ? 0.9 : 0.25;
        const w = (S.hairStyle === 'long' ? 0.2 : 0.17) * (1 - s * 0.14) * R / 0.56;
        add(jj, S.hairStyle === 'long' ? box(w * 1.8, segLen + 0.06, w * 0.7, w * 0.3) : capsule(w, segLen * 0.7), mHair, V(0, -segLen / 2, 0));
        js.push(jj); parent = jj;
      }
      if(S.hairStyle === 'ponytail') add(J.head, torus(R * 0.14, R * 0.05, 6, 14), mAccent, V(0, R * 1.5, -R * 0.84), [0.6, 0, 0], null, { fine: true });
      springs.push(new SpringChain(js, V(0, -segLen, 0), { stiffness: S.hairStyle === 'long' ? 3.5 : 2.8, drag: 0.22, gravity: 14, wind: 0.5, radius: 0.12, colliders: [headColl, neckColl, backColl] }));
    });
    if(S.hairStyle === 'long'){
      // mechas laterais
      add(J.head, box(R * 0.3, R * 1.1, R * 0.3, 0.05), mHair, V(R * 0.86, R * 0.7, R * 0.15), [0, 0, -0.08]);
      add(J.head, box(R * 0.3, R * 1.1, R * 0.3, 0.05), mHair, V(-R * 0.86, R * 0.7, R * 0.15), [0, 0, 0.08]);
    }
  }
  if(S.extras.includes('crown')){
    const cg = cyl(R * 0.62, R * 0.58, R * 0.32, 10);
    add(J.head, cg, mGold, V(0, R * 2.0, -R * 0.02));
    for(let i = 0; i < 5; i++){ const a = i / 5 * Math.PI * 2; add(J.head, new THREE.ConeGeometry(R * 0.1, R * 0.34, 6), mGold, V(Math.cos(a) * R * 0.58, R * 2.3, Math.sin(a) * R * 0.58 - R * 0.02)); }
    add(J.head, sphere(R * 0.09, 10, 8), Mat.emissive(0xef4444, 0.8), V(0, R * 2.04, R * 0.6), null, null, { fine: true });
  }
  // ------------ acessórios novos ------------
  const mGlow = Mat.emissive(S.glow || S.accent, 1.6);
  if(S.extras.includes('helmet')){
    const gl = new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22, clearcoat: 1, depthWrite: false, envMapIntensity: 2 });
    add(J.head, sphere(R * 1.42, 32, 22), gl, hc.clone().add(V(0, R * 0.05, 0.02)));
    add(J.head, torus(R * 1.05, R * 0.14, 10, 32), Mat.metal(0xe5e7eb, 0.3), V(0, -R * 0.12, 0.02), [Math.PI / 2, 0, 0]);
    add(J.head, box(R * 0.35, R * 0.2, R * 0.15, 0.03), mGlow, V(R * 1.1, R * 0.4, 0), null, null, { fine: true });
  }
  if(S.extras.includes('visor')){
    add(J.head, new THREE.SphereGeometry(R * 1.02, 28, 10, -Math.PI * 0.45, Math.PI * 0.9, Math.PI * 0.38, Math.PI * 0.16), mGlow, hc.clone(), [0, 0, 0], V(0.98, 1.06, 1.04));
  }
  if(S.extras.includes('goggles')){
    for(const sd of [1, -1]) add(J.head, cyl(R * 0.2, R * 0.2, R * 0.16, 16), Mat.glass(0xf472b6), V(sd * R * 0.36, R * 1.62, R * 0.72), [Math.PI / 2 - 0.5, 0, 0]);
    add(J.head, torus(R * 1.02, R * 0.05, 6, 30), Mat.leather(0x18181b), hc.clone().add(V(0, R * 0.6, 0)), [Math.PI / 2 - 0.35, 0, 0]);
  }
  if(S.extras.includes('headphones')){
    add(J.head, torus(R * 1.08, R * 0.08, 8, 30, Math.PI), Mat.polymer(0x18181b), hc.clone().add(V(0, R * 0.1, 0)), [0, 0, 0]);
    for(const sd of [1, -1]){ add(J.head, cyl(R * 0.34, R * 0.34, R * 0.24, 20), Mat.polymer(0x27272a), V(sd * R * 1.02, R * 0.92, 0), [0, 0, Math.PI / 2]); add(J.head, cyl(R * 0.24, R * 0.24, R * 0.05, 20), mGlow, V(sd * R * 1.16, R * 0.92, 0), [0, 0, Math.PI / 2], null, { fine: true }); }
  }
  if(S.extras.includes('horns')){
    add(J.head, new THREE.SphereGeometry(R * 1.12, 30, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), Mat.metal(0x9ca3af, 0.35), hc.clone().add(V(0, R * 0.12, 0)));
    for(const sd of [1, -1]){
      const hg = new THREE.TorusGeometry(R * 0.55, R * 0.12, 8, 16, Math.PI * 0.6);
      add(J.head, hg, Mat.polymer(0xf5f0e1), V(sd * R * 0.95, R * 1.35, 0), [0, 0, sd > 0 ? -0.2 : Math.PI + 0.2]);
    }
    add(J.head, box(R * 0.12, R * 0.5, R * 0.1), Mat.metal(0x9ca3af, 0.35), V(0, R * 0.95, R * 1.05));
  }
  if(S.extras.includes('beard')){
    const bj = joint('beard', J.head, V(0, R * 0.35, R * 0.72));
    add(bj, sphere(R * 0.5, 20, 14), mHair, V(0, -R * 0.15, 0), null, V(1.1, 1.2, 0.7));
    add(bj, new THREE.ConeGeometry(R * 0.28, R * 0.6, 12), mHair, V(0, -R * 0.65, 0.02), [Math.PI, 0, 0]);
    springs.push(new SpringChain([bj], V(0, -R * 0.7, 0), { stiffness: 25, drag: 0.45, gravity: 3 }));
  }
  if(S.extras.includes('scarf')){
    add(J.chest, torus(0.34, 0.12, 10, 28), Mat.cloth(S.accent, 'fabric'), V(0, cH * 0.93, 0.02), [Math.PI / 2, 0, 0], V(1.05, 0.95, 1));
    const js = []; let par = J.chest;
    for(let sI = 0; sI < 4; sI++){ const jj = joint('scarf' + sI, par, sI === 0 ? V(0.18, cH * 0.9, -0.4) : V(0, -0.42, 0)); if(sI === 0) jj.rotation.x = 0.4; add(jj, box(0.26, 0.46, 0.06, 0.03), Mat.cloth(S.accent, 'fabric'), V(0, -0.21, 0)); js.push(jj); par = jj; }
    springs.push(new SpringChain(js, V(0, -0.42, 0), { stiffness: 3, drag: 0.2, gravity: 14, wind: 0.9, radius: 0.1, colliders: [backColl] }));
  }
  if(S.extras.includes('shoulderpads')){
    for(const sd of ['L', 'R']){
      const u = J['uArm' + sd];
      add(u, new THREE.SphereGeometry(0.46 * B, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), Mat.metal(0x3f3f46, 0.3), V(0, 0.05, 0), null, V(1, 0.7, 1));
      for(let i = 0; i < 3; i++) add(u, new THREE.ConeGeometry(0.07, 0.3, 8), Mat.metal(0xd4d4d8, 0.2), V((i - 1) * 0.2, 0.32, 0), null, null, { fine: true });
    }
  }
  if(S.extras.includes('glowlines')){
    // linhas emissivas (brilham no bloom) — marca de raridade lendária/épica
    add(J.chest, box(0.06, cH * 0.8, 0.04), mGlow, V(0.28, cH * 0.45, 0.56 * B), [-0.08, 0, 0], null, { fine: true });
    add(J.chest, box(0.06, cH * 0.8, 0.04), mGlow, V(-0.28, cH * 0.45, 0.56 * B), [-0.08, 0, 0], null, { fine: true });
    add(J.hips, torus(0.66 * B, 0.03, 6, 36), mGlow, V(0, 0.28, 0), [Math.PI / 2, 0, 0], V(1, 0.72, 1), { fine: true });
    for(const sd of ['L', 'R']){
      add(J['fArm' + sd], torus(0.2 * B, 0.025, 6, 20), mGlow, V(0, -P.fArm * 0.5, 0), [Math.PI / 2, 0, 0], null, { fine: true });
      add(J['shin' + sd], torus(0.24 * B, 0.03, 6, 20), mGlow, V(0, -P.shin * 0.35, 0), [Math.PI / 2, 0, 0], null, { fine: true });
    }
  }
  // ------------ v15: acessórios dos trajes novos ------------
  const hatTop = hc.clone().add(V(0, R * 0.95, -R * 0.02));
  if(S.extras.includes('tricorn')){
    const felt = Mat.cloth(0x1c1917, 'fabric'), trim = Mat.metal(0xd4a02a, 0.25);
    add(J.head, cyl(R * 0.78, R * 0.9, R * 0.6, 24), felt, hatTop.clone().add(V(0, R * 0.12, 0)));
    const brim = new THREE.CylinderGeometry(R * 1.55, R * 1.55, R * 0.06, 3); brim.rotateY(Math.PI / 6);
    add(J.head, brim, felt, hatTop.clone().add(V(0, -R * 0.12, 0)), [0.08, 0, 0]);
    for(let i = 0; i < 3; i++){ const a = i / 3 * Math.PI * 2 + Math.PI / 2; add(J.head, torus(R * 0.5, R * 0.05, 6, 16, Math.PI * 0.8), trim, hatTop.clone().add(V(Math.cos(a) * R * 1.15, -R * 0.02, Math.sin(a) * R * 1.15)), [Math.PI / 2, 0, a], null, { fine: true }); }
    add(J.head, box(R * 0.35, R * 0.35, R * 0.04, R * 0.02), Mat.paint(0xfafafa), hatTop.clone().add(V(0, R * 0.12, R * 0.86)), null, null, { fine: true });
  }
  if(S.extras.includes('eyepatch')){
    add(J.head, cyl(R * 0.2, R * 0.2, R * 0.05, 16), Mat.leather(0x0a0a0a), V(-R * 0.34, R * 1.02, R * 0.99), [Math.PI / 2, 0, 0]);
    add(J.head, torus(R * 1.0, R * 0.025, 5, 36), Mat.leather(0x0a0a0a), hc.clone().add(V(0, R * 0.18, 0)), [Math.PI / 2 + 0.25, 0.35, 0], V(1, 1, 0.98));
  }
  if(S.extras.includes('kabuto')){
    const lac = Mat.paint(0x7f1d1d), gold = Mat.metal(0xd4a02a, 0.2);
    add(J.head, new THREE.SphereGeometry(R * 1.18, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), lac, hc.clone().add(V(0, R * 0.12, 0)));
    for(let i = 0; i < 3; i++) add(J.head, new THREE.CylinderGeometry(R * (1.32 + i * 0.12), R * (1.42 + i * 0.12), R * 0.18, 28, 1, true, Math.PI * 0.2, Math.PI * 1.6), lac, hc.clone().add(V(0, R * (0.1 - i * 0.2), -R * 0.02)), [0, Math.PI, 0]);
    const kw = new THREE.Shape(); kw.moveTo(0, 0); kw.quadraticCurveTo(R * 0.4, R * 0.6, R * 1.1, R * 1.4); kw.lineTo(R * 0.95, R * 1.45); kw.quadraticCurveTo(R * 0.25, R * 0.75, -R * 0.02, R * 0.12);
    for(const sd of [1, -1]){ const g2 = new THREE.ExtrudeGeometry(kw, { depth: R * 0.04, bevelEnabled: false }); if(sd < 0) g2.scale(-1, 1, 1); add(J.head, g2, gold, V(sd * R * 0.1, R * 1.55, R * 0.95), [-0.25, 0, 0]); }
    add(J.head, sphere(R * 0.16, 14, 10), gold, V(0, R * 1.62, R * 1.08));
  }
  if(S.extras.includes('cowboyhat')){
    const felt = Mat.cloth(0x8b5a2b, 'fabric');
    const crown = lathe([[R * 0.8, 0], [R * 0.82, R * 0.35], [R * 0.72, R * 0.62], [R * 0.4, R * 0.7], [R * 0.2, R * 0.6], [0.001, R * 0.62]], 24);
    add(J.head, crown, felt, hatTop.clone().add(V(0, -R * 0.1, 0)));
    const brim = new THREE.CylinderGeometry(R * 1.75, R * 1.75, R * 0.05, 32, 1); const bp = brim.attributes.position;
    for(let i = 0; i < bp.count; i++){ const x = bp.getX(i), z = bp.getZ(i); bp.setY(i, bp.getY(i) + Math.pow(Math.abs(x) / (R * 1.75), 2) * R * 0.45); }
    brim.computeVertexNormals(); add(J.head, brim, felt, hatTop.clone().add(V(0, -R * 0.08, 0)), [0.06, 0, 0]);
    add(J.head, cyl(R * 0.83, R * 0.83, R * 0.12, 24), Mat.cloth(0x3b2414, 'fabric'), hatTop.clone().add(V(0, R * 0.0, 0)), null, null, { fine: true });
  }
  if(S.extras.includes('wizardhat')){
    const hm = Mat.cloth(S.top, 'fabric'), star = Mat.emissive(0xfde047, 1.8);
    add(J.head, cyl(R * 1.7, R * 1.7, R * 0.05, 32), hm, hatTop.clone().add(V(0, -R * 0.1, 0)));
    const cone = new THREE.ConeGeometry(R * 0.95, R * 2.6, 24, 8); const cp = cone.attributes.position;
    for(let i = 0; i < cp.count; i++){ const y = cp.getY(i) / (R * 2.6) + 0.5; cp.setZ(i, cp.getZ(i) - y * y * R * 0.9); }
    cone.computeVertexNormals(); add(J.head, cone, hm, hatTop.clone().add(V(0, R * 1.2, 0)));
    for(let i = 0; i < 4; i++) add(J.head, new THREE.OctahedronGeometry(R * 0.12, 0), star, hatTop.clone().add(V(Math.sin(i * 1.7) * R * 0.6, R * (0.3 + i * 0.45), R * (0.62 - i * 0.2))), null, null, { fine: true });
  }
  if(S.extras.includes('sunglasses')){
    const lens = Mat.glass(0x0f172a);
    for(const sd of [1, -1]) add(J.head, box(R * 0.44, R * 0.26, R * 0.06, R * 0.06), lens, V(sd * R * 0.34, R * 1.02, R * 1.02), [0, sd * 0.12, 0]);
    add(J.head, box(R * 0.22, R * 0.05, R * 0.05), Mat.metal(0x111827, 0.3), V(0, R * 1.08, R * 1.05));
    add(J.head, torus(R * 1.0, R * 0.02, 4, 30, Math.PI), Mat.metal(0x111827, 0.3), hc.clone().add(V(0, R * 0.08, 0)), [Math.PI / 2, 0, Math.PI], null, { fine: true });
  }
  if(S.extras.includes('tie')){
    add(J.chest, box(0.4, 0.26, 0.05, 0.02), Mat.cloth(0xfafafa, 'fabric'), V(0, cH * 0.88, 0.5 * B), [-0.2, 0, 0]);
    add(J.chest, box(0.14, 0.14, 0.08, 0.03), Mat.cloth(S.accent, 'fabric'), V(0, cH * 0.84, 0.56 * B), [-0.15, 0, 0]);
    add(J.chest, lathe([[0.001, -0.62], [0.12, -0.52], [0.1, -0.1], [0.06, 0], [0.001, 0.01]], 4), Mat.cloth(S.accent, 'fabric'), V(0, cH * 0.8, 0.57 * B), [-0.08, Math.PI / 4, 0], V(1, 1, 0.3));
  }
  if(S.extras.includes('bunnyears')){
    const fur = Mat.cloth(S.top2, 'fabric'), inner = Mat.cloth(0xfbcfe8, 'fabric');
    for(const sd of [1, -1]){
      const ej = joint('ear' + (sd > 0 ? 'L' : 'R'), J.head, V(sd * R * 0.42, R * 1.75, -R * 0.05)); ej.rotation.z = -sd * 0.15;
      add(ej, sphere(R * 0.28, 16, 12), fur, V(0, R * 0.7, 0), null, V(0.7, 2.6, 0.35));
      add(ej, sphere(R * 0.18, 12, 10), inner, V(0, R * 0.7, R * 0.07), null, V(0.65, 2.3, 0.2), { fine: true });
      springs.push(new SpringChain([ej], V(0, R * 1.3, 0), { stiffness: 16, drag: 0.35, gravity: 3, wind: 0.1 }));
    }
    add(J.hips, sphere(0.22, 14, 10), Mat.cloth(0xfafafa, 'fabric'), V(0, 0.0, -0.5 * B), null, null, { fine: true });
  }
  if(springs.length === 0){ /* sem spring */ }
  if(backpack) springs.push(new SpringChain([backpack], V(0, -0.6, -0.1), { stiffness: 22, drag: 0.45, gravity: 4, wind: 0.02 }));

  // ------------ v18: detalhes extra (sobretudo para os trajes base) ------------
  const EX = (k) => S.extras.includes(k);
  const mDark = Mat.polymer(0x1f2328), mAcc2 = Mat.cloth(S.accent, 'fabric'), mTop2c = Mat.cloth(S.top2, 'fabric');
  if(EX('gloves')){
    for(const sd of ['L', 'R']){
      add(J['hand' + sd], box(0.34, 0.24, 0.19, 0.06), mGlove, V(0, -0.13, 0), null, null, { fine: true });
      add(J['fArm' + sd], torus(0.165 * B, 0.045, 8, 20), mAcc2, V(0, -P.fArm + 0.06, 0), [Math.PI / 2, 0, 0], null, { fine: true });
    }
  }
  if(EX('watch')){
    add(J.fArmL, torus(0.155 * B, 0.04, 8, 20), mDark, V(0, -P.fArm + 0.22, 0), [Math.PI / 2, 0, 0], null, { fine: true });
    add(J.fArmL, cyl(0.075, 0.075, 0.05, 14), Mat.emissive(S.accent, 1.2), V(0.15 * B, -P.fArm + 0.22, 0), [0, 0, Math.PI / 2], null, { fine: true });
  }
  if(EX('kneepads')){
    for(const sd of ['L', 'R']){
      add(J['shin' + sd], box(0.36, 0.36, 0.14, 0.06), mDark, V(0, -0.1, 0.22), [0.12, 0, 0], null, { fine: true });
      add(J['shin' + sd], torus(0.25 * B, 0.03, 6, 20), mDark, V(0, -0.16, 0.02), [Math.PI / 2, 0, 0], null, { fine: true });
    }
  }
  if(EX('cargo')){
    const mPk = Mat.cloth(new THREE.Color(S.pant).multiplyScalar(0.78).getHex(), 'denim');
    for(const sd of ['L', 'R']){ const sx = sd === 'L' ? 1 : -1;
      add(J['thigh' + sd], box(0.14, 0.44, 0.36, 0.05), mPk, V(sx * 0.3 * B, -P.thigh * 0.5, 0.02), null, null, { fine: true });
      add(J['thigh' + sd], box(0.16, 0.1, 0.38, 0.03), mPk, V(sx * 0.31 * B, -P.thigh * 0.5 + 0.24, 0.02), null, null, { fine: true });
    }
  }
  if(EX('holster')){
    add(J.thighR, box(0.16, 0.5, 0.3, 0.05), mBelt, V(-0.33 * B, -P.thigh * 0.3, 0.02), null, null, { fine: true });
    add(J.thighR, box(0.12, 0.28, 0.14, 0.03), mDark, V(-0.36 * B, -P.thigh * 0.3 + 0.3, 0.02), [0, 0, -0.15], null, { fine: true });
    add(J.thighR, torus(0.37 * B, 0.03, 6, 20), mBelt, V(0, -P.thigh * 0.38, 0), [Math.PI / 2, 0, 0], null, { fine: true });
  }
  if(EX('straps')){
    for(const zf of [1, -1]) add(J.chest, box(0.16, cH * 1.28, 0.06, 0.02), mBelt, V(0, cH * 0.5, zf * 0.56 * B), [-0.08 * zf, 0, 0.62 * zf], null, { fine: true });
    for(let i = 0; i < 3; i++) add(J.chest, box(0.14, 0.18, 0.1, 0.03), mDark, V(-0.3 + i * 0.26, cH * (0.3 + i * 0.17), 0.6 * B), [-0.1, 0, 0.62], null, { fine: true });
  }
  if(EX('emblem')){
    add(J.chest, cyl(0.15, 0.15, 0.03, 20), mAcc2, V(0.32, cH * 0.66, 0.565 * B), [Math.PI / 2 - 0.15, 0, 0], null, { fine: true });
    add(J.chest, box(0.1, 0.1, 0.02), Mat.emissive(0xffffff, 0.6), V(0.32, cH * 0.66, 0.585 * B), [-0.15, 0, Math.PI / 4], null, { fine: true });
  }
  if(EX('bandana')){
    const bd = new THREE.ConeGeometry(0.42, 0.55, 3); bd.rotateX(Math.PI); bd.scale(1, 1, 0.35);
    add(J.chest, bd, mAcc2, V(0, cH * 0.8, 0.47 * B), [-0.12, 0, 0], null, { fine: true });
    add(J.chest, torus(0.31, 0.07, 8, 24), mAcc2, V(0, cH * 0.95, 0.02), [Math.PI / 2, 0, 0], null, { fine: true });
  }
  if(EX('tiedjacket')){
    add(J.hips, torus(0.66 * B, 0.1, 8, 36), mAcc2, V(0, 0.08, 0), [Math.PI / 2, 0, 0], V(1, 0.74, 1));
    add(J.hips, box(0.2, 0.7, 0.1, 0.05), mAcc2, V(0.12, -0.28, 0.5 * B), [0.1, 0, 0.12], null, { fine: true });
    add(J.hips, box(0.2, 0.62, 0.1, 0.05), mAcc2, V(-0.14, -0.26, 0.5 * B), [0.1, 0, -0.18], null, { fine: true });
    add(J.hips, box(1.0 * B, 0.9, 0.08, 0.04), mAcc2, V(0, -0.32, -0.48 * B), [-0.12, 0, 0]);
  }
  if(EX('sneakers')){
    const white = Mat.polymer(0xf8fafc);
    for(const sd of ['L', 'R']){
      const f = J['foot' + sd], toe = J['toe' + sd];
      add(f, box(0.47, 0.13, 0.83, 0.04), white, V(0, -P.ankle + 0.035, 0.17));
      add(toe, box(0.45, 0.13, 0.37, 0.04), white, V(0, -0.02, 0.06));
      for(const sx of [1, -1]) add(f, box(0.02, 0.1, 0.42), mAccent, V(sx * 0.205, -P.ankle + 0.2, 0.12), [0.25, 0, 0], null, { fine: true });
      for(let i = 0; i < 3; i++) add(f, box(0.24, 0.025, 0.04), white, V(0, -P.ankle + 0.33 - i * 0.02, 0.28 + i * 0.1), [0.35, 0, 0], null, { fine: true });
    }
  }
  if(EX('cap')){
    const capM = Mat.cloth(S.capColor || S.accent, 'fabric');
    add(J.head, new THREE.SphereGeometry(R * 1.14, 30, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), capM, hc.clone().add(V(0, R * 0.14, -R * 0.04)), [-0.22, 0, 0], V(1, 0.96, 1.03));
    add(J.head, torus(R * 1.13, R * 0.06, 6, 32), mTop2c, hc.clone().add(V(0, R * 0.2, -R * 0.04)), [Math.PI / 2 - 0.22, 0, 0], null, { fine: true });
    const bz = S.capBack ? -1 : 1;
    add(J.head, box(R * 1.15, R * 0.08, R * 0.8, 0.03), capM, hc.clone().add(V(0, bz > 0 ? R * 0.5 : R * 0.1, bz * R * 1.32)), [bz * 0.18, 0, 0]);
    add(J.head, sphere(R * 0.1, 10, 8), mTop2c, hc.clone().add(V(0, R * 1.2, -R * 0.28)), null, null, { fine: true });
  }
  if(EX('headband')){
    add(J.head, torus(R * 0.99, R * 0.09, 8, 32), mAcc2, hc.clone().add(V(0, R * 0.45, -R * 0.02)), [Math.PI / 2 - 0.12, 0, 0], V(0.96, 1.02, 1));
    for(const sd of [1, -1]) add(J.head, box(R * 0.16, R * 0.6, R * 0.05, 0.02), mAcc2, hc.clone().add(V(sd * R * 0.14, R * 0.1, -R * 1.02)), [0.3, 0, sd * 0.25], null, { fine: true });
  }
  // ------------ build ------------
  if(opts.batch === false) pb.build(fine, meshes); else pb.buildSkinned(root, fine, meshes);

  // ------------ músculos (bulge ao flexionar) ------------
  const muscles = [];
  for(const sd of ['L', 'R']){
    const bic = new THREE.Mesh(xf(sphere(0.2 * B, 16, 12), V(0, -P.uArm * 0.45, 0.07), null, V(1, 1.9, 1.05)), S.outfit === 'tshirt' || S.outfit === 'vest' ? mSkin : topMat);
    bic.castShadow = true; J['uArm' + sd].add(bic);
    muscles.push({ mesh: bic, elbow: J['fArm' + sd] });
  }

  // ------------ capa (cloth) ------------
  let cloth = null;
  if(S.extras.includes('cape')){
    const pins = [];
    const cols = 6;
    for(let i = 0; i <= cols; i++){
      const t = i / cols - 0.5;
      pins.push(V(t * 1.4 * B, cH * 0.92, -0.42 * B - Math.cos(t * Math.PI) * 0.08));
    }
    const capeMat = Mat.cloth(S.top2, 'fabric').clone();
    capeMat.side = THREE.DoubleSide;
    cloth = { pins, cols, rows: 9, seg: 0.46, mat: capeMat };
  }

  // ------------ hitboxes invisíveis ------------
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hbHead = new THREE.Mesh(sphere(R * 1.15, 8, 6), hitMat); hbHead.position.copy(hc); J.head.add(hbHead);
  const hbBody = new THREE.Mesh(capsule(0.85 * B, P.spine + cH * 0.6), hitMat); hbBody.position.set(0, (P.spine + cH) * 0.4, 0); J.spine.add(hbBody);
  const hbLegL = new THREE.Mesh(capsule(0.35, P.legLen - 0.6), hitMat); hbLegL.position.y = -P.legLen / 2; J.thighL.add(hbLegL);
  const hbLegR = new THREE.Mesh(capsule(0.35, P.legLen - 0.6), hitMat); hbLegR.position.y = -P.legLen / 2; J.thighR.add(hbLegR);
  const hitboxes = { head: hbHead, body: [hbBody, hbLegL, hbLegR] };

  // ------------ soquetes ------------
  const weaponHolder = new THREE.Group(); weaponHolder.name = 'weaponHolder'; root.add(weaponHolder);
  const handSocketR = new THREE.Group(); handSocketR.position.set(0, -0.3, 0.06); J.handR.add(handSocketR);
  const handSocketL = new THREE.Group(); handSocketL.position.set(0, -0.3, 0.06); J.handL.add(handSocketL);

  // restos de pose
  const restQ = {};
  Object.entries(J).forEach(([k, j]) => restQ[k] = j.quaternion.clone());

  const ch = {
    root, J, P, S, BT, face, springs, muscles, cloth, clothSim: null, hitboxes, fine, meshes,
    weaponHolder, handSocketR, handSocketL, restQ, name: opts.name || 'Player',
    skinKey: typeof skinKey === 'string' ? skinKey : 'custom', lod: 0,
    colliders: [headColl, neckColl, backColl,
      { obj: J.hips, offset: V(0, -0.1, 0), r: 0.72 * B },
      { obj: J.thighL, offset: V(0, -P.thigh * 0.5, 0), r: 0.4 * B },
      { obj: J.thighR, offset: V(0, -P.thigh * 0.5, 0), r: 0.4 * B }]
  };
  root.userData.character = ch;
  [hbHead, ...hitboxes.body].forEach(h => h.userData.character = ch);
  hbHead.userData.isHead = true;
  if(cloth){
    ch.clothSim = new VerletCloth(J.chest, cloth.pins, cloth.rows, cloth.seg, cloth.mat, root,
      { colliders: [backColl, { obj: J.hips, offset: V(0, 0, -0.1), r: 0.78 * B }, { obj: J.thighL, offset: V(0, -P.thigh * 0.6, 0), r: 0.45 * B }, { obj: J.thighR, offset: V(0, -P.thigh * 0.6, 0), r: 0.45 * B }, { obj: J.shinL, offset: V(0, -P.shin * 0.5, 0), r: 0.36 }, { obj: J.shinR, offset: V(0, -P.shin * 0.5, 0), r: 0.36 }], gravity: 30, wind: 1.2 });
  }
  return ch;
}

// LOD: 0 = alto (tudo), 1 = médio (sem dedos/detalhes, sem física), 2 = baixo (sem sombra)
export function setCharacterLOD(ch, level){
  if(ch.lod === level) return;
  ch.lod = level;
  const showFine = level === 0;
  ch.fine.forEach(m => m.visible = showFine);
  ['handL', 'handR'].forEach(h => { const u = ch.J[h].userData; if(u.mitten) u.mitten.visible = !showFine; });
  ch.face.lidsL.forEach(l => l.visible = level < 2);
  ch.face.brows.forEach(b => b.visible = level < 2);
  ch.face.eyes.forEach(e => e.children.forEach((c, i) => { if(i > 0) c.visible = level < 2; }));
  ch.meshes.forEach(m => m.castShadow = level < 2);
  if(ch.clothSim) ch.clothSim.mesh.castShadow = level < 2;
}

export function disposeCharacter(ch){
  ch.root.traverse(o => { if(o.isMesh && o.geometry) o.geometry.dispose(); });
  if(ch.root.parent) ch.root.parent.remove(ch.root);
}
