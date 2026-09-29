// ============================================================
// WORLD — ilha procedural: terreno com colinas suaves, grama
// instanciada com shader de vento, árvores/rochas instanciadas
// (destrutíveis), casas com colisão, baús, fogueira, lago com
// água PBR, loot no chão e parede da tempestade com shader.
// ============================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Mat } from '../engine/materials.js';
import { getSurface } from '../engine/textures.js';
import { Wind } from '../anim/secondary.js';

export const MAP_R = 420;
export const GRID = 16, WALL_H = 13;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function heightAt(x, z){
  const d = Math.hypot(x, z);
  let h = 5.5 * Math.sin(x / 95) * Math.cos(z / 120) + 2.4 * Math.sin(x / 41 + z / 57) + 1.2 * Math.sin(z / 23 - x / 31);
  h *= THREE.MathUtils.smoothstep(d, 40, 140);          // centro plano
  // achata pontos de interesse
  for(const f of FLATS){ const dd = Math.hypot(x - f[0], z - f[1]); if(dd < f[2] + 18){ const k = THREE.MathUtils.smoothstep(dd, f[2], f[2] + 18); h = h * k + f[3] * (1 - k); } }
  // borda da ilha afunda
  h -= Math.max(0, d - MAP_R + 30) * 0.6;
  return h;
}
const FLATS = [];   // [x,z,r,h]

let _rng = 1234567;
const rnd = () => ((_rng = (_rng * 1664525 + 1013904223) >>> 0) / 4294967296);
const rr = (a, b) => a + rnd() * (b - a);

// shader de vento para vegetação (instanced): desloca vértices pelo peso = altura
function windify(mat, amount, key){
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = WIND_U.uTime; sh.uniforms.uWind = WIND_U.uWind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec3 uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float wgt = clamp(position.y * ${amount.toFixed(3)}, 0.0, 1.5); wgt *= wgt;
        float ph = uTime * 1.7 + ip.x * 0.05 + ip.z * 0.043;
        float gust = sin(ph) * 0.6 + sin(ph * 2.3 + 1.7) * 0.3 + sin(ph * 5.1) * 0.1;
        transformed.x += (uWind.x * (0.6 + gust * 0.5)) * wgt;
        transformed.z += (uWind.z * (0.6 + gust * 0.5)) * wgt;`);
  };
  mat.customProgramCacheKey = () => 'wind_' + key;
  return mat;
}
export const WIND_U = { uTime: { value: 0 }, uWind: { value: new THREE.Vector3() } };

export class World {
  constructor(scene, physics, particles, audio, quality){
    this.scene = scene; this.physics = physics; this.particles = particles; this.audio = audio;
    this.q = quality || 'alta';
    this.group = new THREE.Group(); scene.add(this.group);
    this.raycastTargets = [];       // meshes que bloqueiam tiros
    this.trees = []; this.rocks = []; this.chests = []; this.pickups = []; this.houses = []; this.structures = [];
    this.emitters = [];
    this.t = 0;
    _rng = 1234567;
    this._planHouses();
    this._ground();
    this._water();
    this._houses();
    this._trees();
    this._rocks();
    this._grass();
    this._campfires();
    this._storm();
  }
  // ---------- terreno ----------
  _planHouses(){
    this.housePlan = [];
    const spots = [[60, 40], [-90, 70], [120, -110], [-140, -80], [20, -170], [190, 90], [-40, 200], [-220, 20]];
    spots.forEach(([x, z], i) => {
      const w = i % 3 === 0 ? 3 : 2, d = 2;
      this.housePlan.push({ x, z, w, d, rot: 0 });
      FLATS.push([x, z, Math.max(w, d) * GRID * 0.75, 0]);
    });
    FLATS.push([-60, -40, 26, -2.2]); // lago
  }
  _ground(){
    const seg = this.q === 'baixa' ? 120 : 220;
    const g = new THREE.PlaneGeometry(MAP_R * 2.4, MAP_R * 2.4, seg, seg); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    const cA = new THREE.Color(0x5f8f3e), cB = new THREE.Color(0x7aa04a), cDirt = new THREE.Color(0x8a7550), cSand = new THREE.Color(0xcdb98a);
    for(let i = 0; i < pos.count; i++){
      const x = pos.getX(i), z = pos.getZ(i), h = heightAt(x, z); pos.setY(i, h);
      const n = Math.sin(x * 0.05) * Math.cos(z * 0.043) * 0.5 + 0.5;
      const c = cA.clone().lerp(cB, n);
      const d = Math.hypot(x, z);
      if(d > MAP_R - 40) c.lerp(cSand, THREE.MathUtils.smoothstep(d, MAP_R - 40, MAP_R - 15));
      for(const hp of this.housePlan){ const dd = Math.hypot(x - hp.x, z - hp.z); if(dd < 30) c.lerp(cDirt, (1 - dd / 30) * 0.5); }
      const lake = Math.hypot(x + 60, z + 40); if(lake < 34) c.lerp(cSand, THREE.MathUtils.smoothstep(34 - lake, 0, 8));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const s = getSurface('ground');
    const rep = (t) => { const c = t.clone(); c.repeat.set(90, 90); c.needsUpdate = true; return c; };
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, normalMap: rep(s.normalMap), roughnessMap: rep(s.roughnessMap), map: rep(s.detailMap), normalScale: new THREE.Vector2(1.2, 1.2) });
    this.ground = new THREE.Mesh(g, m); this.ground.receiveShadow = true; this.ground.name = 'ground';
    this.group.add(this.ground); this.raycastTargets.push(this.ground);
    // oceano
    const sea = new THREE.Mesh(new THREE.CircleGeometry(4000, 64), new THREE.MeshPhysicalMaterial({ color: 0x1b6a8a, roughness: 0.12, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.1 }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -6; this.group.add(sea); sea.userData.noProbe = true;
  }
  _water(){
    const s = getSurface('plaster');
    const n = s.normalMap.clone(); n.repeat.set(6, 6); n.needsUpdate = true; this.waterNormal = n;
    const m = new THREE.MeshPhysicalMaterial({ color: 0x2a6f8f, roughness: 0.06, metalness: 0, transmission: 0.0, clearcoat: 1, clearcoatRoughness: 0.05, normalMap: n, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.88 });
    m.userData.envBoost = 3;
    this.lake = new THREE.Mesh(new THREE.CircleGeometry(30, 48), m); this.lake.rotation.x = -Math.PI / 2; this.lake.position.set(-60, -1.4, -40);
    this.group.add(this.lake);
    // fonte na praça
    const fx = 0, fz = -18, base = heightAt(fx, fz);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.6, 1.6, 32, 1, true), Mat.rock(0x9ca3af)); bowl.position.set(fx, base + 0.8, fz);
    const bowlIn = new THREE.Mesh(new THREE.CircleGeometry(4.9, 32), m); bowlIn.rotation.x = -Math.PI / 2; bowlIn.position.set(fx, base + 1.3, fz);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 5, 16), Mat.rock(0xb8bec6)); col.position.set(fx, base + 2.5, fz);
    [bowl, bowlIn, col].forEach(o => { o.castShadow = true; o.receiveShadow = true; this.group.add(o); });
    this.raycastTargets.push(bowl, col);
    this.physics.addCircle(fx, fz, 5.4, base + 1.6);
    this.fountain = V(fx, base + 5, fz);
    this.particles.addEmitter({ type: 'water', rate: 22, pos: this.fountain.clone(), opt: { n: 3 } });
    this.soundSpots = [{ id: 'fountain', name: 'water', pos: this.fountain.clone(), vol: 0.5 }];
  }
  // ---------- casas ----------
  _houses(){
    const wallM = Mat.plaster(0xe8dcc4), wallM2 = Mat.plaster(0xc9d6df), roofM = Mat.wood(0x8b3a2b), floorM = Mat.wood(0xa87b4f), trimM = Mat.wood(0x5b3a24), glassM = Mat.glass(0x9fd3ff);
    const T = 0.6;
    this.housePlan.forEach((hp, idx) => {
      const W = hp.w * GRID, D = hp.d * GRID, H = WALL_H, x0 = hp.x - W / 2, z0 = hp.z - D / 2, y0 = 0;
      const g = new THREE.Group(); this.group.add(g);
      const wm = idx % 2 ? wallM2 : wallM;
      const addBox = (cx, cy, cz, sx, sy, sz, mat, collide) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); m.position.set(cx, cy, cz); m.castShadow = true; m.receiveShadow = true; g.add(m);
        this.raycastTargets.push(m);
        if(collide !== false) this.physics.addBox(V(cx - sx / 2, cy - sy / 2, cz - sz / 2), V(cx + sx / 2, cy + sy / 2, cz + sz / 2));
        return m;
      };
      // fundação + piso
      addBox(hp.x, y0 - 1, hp.z, W + 1, 2.4, D + 1, Mat.rock(0x8f969e), false);
      this.physics.addBox(V(x0 - 0.5, y0 - 3, z0 - 0.5), V(x0 + W + 0.5, y0 + 0.2, z0 + D + 0.5));
      addBox(hp.x, y0 + 0.25, hp.z, W - 0.2, 0.1, D - 0.2, floorM, false);
      // paredes: frente (z0) com porta, fundos com janelas
      const doorW = 5, doorH = 9;
      const segW = (W - doorW) / 2;
      addBox(x0 + segW / 2, H / 2, z0, segW, H, T, wm);
      addBox(x0 + W - segW / 2, H / 2, z0, segW, H, T, wm);
      addBox(hp.x, doorH + (H - doorH) / 2, z0, doorW, H - doorH, T, wm);
      // fundos com janela
      const winW = 5, winY0 = 4.5, winY1 = 9;
      addBox(x0 + (W - winW) / 4, H / 2, z0 + D, (W - winW) / 2, H, T, wm);
      addBox(x0 + W - (W - winW) / 4, H / 2, z0 + D, (W - winW) / 2, H, T, wm);
      addBox(hp.x, winY0 / 2, z0 + D, winW, winY0, T, wm);
      addBox(hp.x, winY1 + (H - winY1) / 2, z0 + D, winW, H - winY1, T, wm);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winY1 - winY0), glassM); glass.position.set(hp.x, (winY0 + winY1) / 2, z0 + D); g.add(glass);
      this.physics.addBox(V(hp.x - winW / 2, winY0, z0 + D - T / 2), V(hp.x + winW / 2, winY1, z0 + D + T / 2));
      // laterais
      addBox(x0, H / 2, hp.z, T, H, D, wm);
      addBox(x0 + W, H / 2, hp.z, T, H, D, wm);
      // molduras
      addBox(hp.x, doorH + 0.2, z0 - 0.35, doorW + 0.8, 0.5, 0.3, trimM, false);
      // telhado de duas águas
      const rw = D / 2 + 1.2, pitch = 0.5;
      [-1, 1].forEach(sd => {
        const r = new THREE.Mesh(new THREE.BoxGeometry(W + 2.4, 0.6, rw / Math.cos(pitch)), roofM);
        r.position.set(hp.x, H + Math.tan(pitch) * rw / 2 - 0.2, hp.z + sd * rw / 2 - sd * 0.6);
        r.rotation.x = sd * pitch; r.castShadow = true; r.receiveShadow = true; g.add(r); this.raycastTargets.push(r);
      });
      this.physics.addBox(V(x0 - 1, H, z0 - 1), V(x0 + W + 1, H + 0.5, z0 + D + 1));
      // chaminé
      addBox(x0 + W * 0.75, H + 5, hp.z + 2, 2.2, 7, 2.2, Mat.rock(0x7c6f64));
      this.particles.addEmitter({ type: 'dust', rate: 4, pos: V(x0 + W * 0.75, H + 9, hp.z + 2), opt: { color: 0xcfcfcf, n: 1, power: 1.6 } });
      // baú interno
      this.addChest(hp.x + (idx % 2 ? -W / 4 : W / 4), hp.z + D / 4, Math.PI);
      this.houses.push({ ...hp, W, D, center: V(hp.x, 0, hp.z) });
    });
    // baús externos
    [[30, 110], [-160, 150], [150, 20], [-20, -110], [240, -60], [-260, -150], [90, 230]].forEach(([x, z], i) => this.addChest(x, z, i));
  }
  addChest(x, z, rot){
    const inHouse = this.housePlan.some(h => Math.abs(x - h.x) < h.w * GRID / 2 && Math.abs(z - h.z) < h.d * GRID / 2);
    const y = heightAt(x, z) + (inHouse ? 0.3 : 0);
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot || 0;
    const wood = Mat.wood(0x8b5a2b), gold = Mat.metal(0xf5c542, 0.25);
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.8, 2.2), wood); base.position.y = 0.9;
    const lidPivot = new THREE.Group(); lidPivot.position.set(0, 1.8, -1.1);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 3.4, 16, 1, false, 0, Math.PI), wood); lid.rotation.z = Math.PI / 2; lid.position.set(0, 0, 1.1);
    lidPivot.add(lid);
    [-1.3, 1.3].forEach(xx => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.9, 2.3), gold); b.position.set(xx, 0.95, 0); g.add(b); });
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.2), gold); lock.position.set(0, 1.6, 1.15);
    // brilho do baú: halo aditivo (em vez de PointLight — 15 luzes pontuais custariam caro em todos os shaders)
    const glow = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffc94a, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.set(0, 1.4, 0); glow.userData.noProbe = true;
    Object.defineProperty(glow, 'intensity', { get(){ return this._i || 0; }, set(v){ this._i = v; this.material.opacity = Math.min(0.6, v * 0.06); this.visible = v > 0.05; } });
    g.add(base, lidPivot, lock, glow);
    g.traverse(o => { if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
    this.group.add(g);
    const chest = { group: g, lid: lidPivot, glow, pos: g.position.clone(), opened: false, openT: 0 };
    chest.emitter = this.particles.addEmitter({ type: 'magic', rate: 5, pos: g.position.clone().add(V(0, 2.2, 0)), opt: { color: 0xffd36a } });
    this.chests.push(chest);
    this.physics.addCircle(x, z, 1.6, g.position.y + 1.8);
    return chest;
  }
  openChest(chest){
    if(chest.opened) return false;
    chest.opened = true; chest.openT = 0.001;
    this.particles.removeEmitter(chest.emitter);
    this.particles.emit('confetti', chest.pos.clone().add(V(0, 2.5, 0)), { count: 30 });
    this.particles.flash(chest.pos.clone().add(V(0, 3, 0)), 0xffd36a, 8, 0.5, 20);
    return true;
  }
  // ---------- vegetação ----------
  _treeGeos(){
    const trunk = new THREE.CylinderGeometry(0.55, 0.95, 9, 10, 4); trunk.translate(0, 4.5, 0);
    const tp = trunk.attributes.position; for(let i = 0; i < tp.count; i++){ const y = tp.getY(i); tp.setX(i, tp.getX(i) + Math.sin(y * 0.6) * 0.15); }
    trunk.computeVertexNormals();
    const leaves = [];
    for(let i = 0; i < 7; i++){
      const r = 3.2 - i * 0.18 + (i % 2) * 0.4;
      const s = new THREE.IcosahedronGeometry(r, 2);
      const sp = s.attributes.position; for(let k = 0; k < sp.count; k++){ const x = sp.getX(k), y = sp.getY(k), z = sp.getZ(k); const n = 1 + Math.sin(x * 1.7 + z * 1.3) * 0.12 + Math.sin(y * 2.2) * 0.08; sp.setXYZ(k, x * n, y * n, z * n); }
      const a = i / 7 * Math.PI * 2;
      s.translate(Math.cos(a) * (i ? 2.2 : 0), 10 + (i ? rr(-1, 2) : 1.8), Math.sin(a) * (i ? 2.2 : 0));
      leaves.push(s.index ? s.toNonIndexed() : s);
    }
    const leaf = mergeGeometries(leaves.map(g => { ['uv'].forEach(k => g.deleteAttribute(k)); return g; })); leaf.computeVertexNormals();
    // pinheiro
    const pineT = new THREE.CylinderGeometry(0.4, 0.8, 12, 8); pineT.translate(0, 6, 0);
    const cones = [];
    for(let i = 0; i < 4; i++){ const c = new THREE.ConeGeometry(4.2 - i * 0.85, 5, 12, 2); const cp = c.attributes.position; for(let k = 0; k < cp.count; k++){ cp.setX(k, cp.getX(k) * (1 + Math.sin(k) * 0.06)); } c.translate(0, 6 + i * 2.8, 0); cones.push(c.index ? c.toNonIndexed() : c); }
    const pine = mergeGeometries(cones.map(g => { g.deleteAttribute('uv'); return g; })); pine.computeVertexNormals();
    return { trunk, leaf, pineT, pine };
  }
  _trees(){
    const G = this._treeGeos();
    const count = this.q === 'baixa' ? 90 : this.q === 'media' ? 140 : 200;
    const trunkM = Mat.wood(0x6b4a2f), leafM = windify(new THREE.MeshStandardMaterial({ color: 0x4f8a35, roughness: 0.85, flatShading: false }), 0.06, 'leaf');
    const pineM = windify(new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.9 }), 0.05, 'pine');
    const half = Math.ceil(count / 2);
    const iT = new THREE.InstancedMesh(G.trunk, trunkM, half), iL = new THREE.InstancedMesh(G.leaf, leafM, half);
    const iPT = new THREE.InstancedMesh(G.pineT, trunkM, count - half), iP = new THREE.InstancedMesh(G.pine, pineM, count - half);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    let a = 0, b = 0;
    for(let i = 0; i < count; i++){
      let x, z, ok = false, tries = 0;
      while(!ok && tries++ < 40){ const ang = rnd() * Math.PI * 2, d = 30 + Math.sqrt(rnd()) * (MAP_R - 60); x = Math.cos(ang) * d; z = Math.sin(ang) * d; ok = this._freeSpot(x, z, 14); }
      if(!ok) continue;
      const y = heightAt(x, z), sc = rr(0.8, 1.35);
      p.set(x, y - 0.3, z); q.setFromEuler(new THREE.Euler(0, rnd() * 6.28, 0)); s.set(sc, sc * rr(0.9, 1.15), sc); m.compose(p, q, s);
      const pineType = i >= half;
      const tree = { x, z, y, sc, hp: 120, alive: true, pine: pineType, idx: pineType ? b : a, matrix: m.clone() };
      if(pineType){ iPT.setMatrixAt(b, m); iP.setMatrixAt(b, m); c.setHSL(0.33 + rr(-0.03, 0.03), 0.45, 0.28 + rr(-0.04, 0.04)); iP.setColorAt(b, c); b++; }
      else { iT.setMatrixAt(a, m); iL.setMatrixAt(a, m); c.setHSL(0.27 + rr(-0.04, 0.05), 0.5, 0.36 + rr(-0.05, 0.05)); iL.setColorAt(a, c); a++; }
      tree.collider = this.physics.addCircle(x, z, 1.1 * sc, y + 14);
      this.trees.push(tree);
    }
    iT.count = iL.count = a; iPT.count = iP.count = b;
    [iT, iL, iPT, iP].forEach(im => { im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; if(im.instanceColor) im.instanceColor.needsUpdate = true; this.group.add(im); this.raycastTargets.push(im); });
    this.treeMeshes = { iT, iL, iPT, iP };
    iT.userData.treeKind = 'round'; iL.userData.treeKind = 'round'; iPT.userData.treeKind = 'pine'; iP.userData.treeKind = 'pine';
  }
  _rocks(){
    const count = this.q === 'baixa' ? 40 : 70;
    const geo = new THREE.DodecahedronGeometry(2.2, 1);
    const gp = geo.attributes.position; for(let i = 0; i < gp.count; i++){ const x = gp.getX(i), y = gp.getY(i), z = gp.getZ(i); const n = 1 + Math.sin(x * 2.1 + y * 1.3) * 0.12 + Math.cos(z * 1.7) * 0.1; gp.setXYZ(i, x * n, y * n * 0.75, z * n); }
    geo.computeVertexNormals();
    const im = new THREE.InstancedMesh(geo, Mat.rock(0x8d949c), count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let k = 0;
    for(let i = 0; i < count; i++){
      const ang = rnd() * Math.PI * 2, d = 25 + Math.sqrt(rnd()) * (MAP_R - 50), x = Math.cos(ang) * d, z = Math.sin(ang) * d;
      if(!this._freeSpot(x, z, 10)) continue;
      const sc = rr(0.6, 1.8), y = heightAt(x, z);
      p.set(x, y + 0.2 * sc, z); q.setFromEuler(new THREE.Euler(rnd(), rnd() * 6, rnd() * 0.3)); s.set(sc * rr(0.9, 1.4), sc, sc * rr(0.9, 1.3)); m.compose(p, q, s);
      im.setMatrixAt(k, m);
      this.rocks.push({ x, z, y, sc, hp: 180, alive: true, idx: k, matrix: m.clone(), collider: this.physics.addCircle(x, z, 2.2 * sc, y + 2 * sc) });
      k++;
    }
    im.count = k; im.castShadow = true; im.receiveShadow = true; this.group.add(im); this.raycastTargets.push(im); this.rockMesh = im;
  }
  _freeSpot(x, z, r){
    for(const h of this.housePlan) if(Math.abs(x - h.x) < h.w * GRID / 2 + r && Math.abs(z - h.z) < h.d * GRID / 2 + r) return false;
    if(Math.hypot(x + 60, z + 40) < 34 + r * 0.5) return false;
    if(Math.hypot(x, z + 18) < 12 + r) return false;
    return true;
  }
  _grass(){
    const n = { baixa: 6000, media: 14000, alta: 26000, ultra: 40000 }[this.q] || 20000;
    const blade = new THREE.PlaneGeometry(0.35, 1.6, 1, 4); blade.translate(0, 0.8, 0);
    const bp = blade.attributes.position; for(let i = 0; i < bp.count; i++){ const y = bp.getY(i); bp.setX(i, bp.getX(i) * (1 - y / 1.7)); bp.setZ(i, y * y * 0.06); }
    const cross = mergeGeometries([blade, blade.clone().rotateY(Math.PI / 2), blade.clone().rotateY(Math.PI / 4)]);
    cross.computeVertexNormals();
    const mat = windify(new THREE.MeshStandardMaterial({ color: 0x6d9c3f, roughness: 0.9, side: THREE.DoubleSide }), 0.55, 'grass');
    const im = new THREE.InstancedMesh(cross, mat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    let k = 0;
    for(let i = 0; i < n; i++){
      const ang = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 300, x = Math.cos(ang) * d, z = Math.sin(ang) * d;
      if(!this._freeSpot(x, z, 1)) continue;
      const sc = rr(0.7, 1.5);
      p.set(x, heightAt(x, z) - 0.05, z); q.setFromEuler(new THREE.Euler(0, rnd() * 6.28, 0)); s.set(sc, sc * rr(0.8, 1.3), sc); m.compose(p, q, s);
      im.setMatrixAt(k, m); c.setHSL(0.24 + rr(-0.03, 0.04), 0.5, 0.3 + rr(-0.05, 0.08)); im.setColorAt(k, c); k++;
    }
    im.count = k; im.receiveShadow = true; im.castShadow = false; im.userData.noProbe = true;
    this.group.add(im); this.grass = im;
  }
  _campfires(){
    this.fires = [];
    [[14, 30], [-120, -30], [100, 150]].forEach(([x, z]) => {
      const y = heightAt(x, z), g = new THREE.Group(); g.position.set(x, y, z);
      for(let i = 0; i < 4; i++){ const l = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 3.2, 8), Mat.wood(0x4a2f1c)); l.rotation.set(Math.PI / 2 - 0.25, i * Math.PI / 2, 0); l.position.y = 0.4; g.add(l); }
      for(let i = 0; i < 9; i++){ const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), Mat.rock(0x6b7280)); const a = i / 9 * Math.PI * 2; s.position.set(Math.cos(a) * 1.8, 0.2, Math.sin(a) * 1.8); g.add(s); }
      g.traverse(o => { if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
      const light = new THREE.PointLight(0xff8a3d, 30, 30, 2); light.position.y = 2.2; light.castShadow = false; g.add(light);
      this.group.add(g);
      const pos = V(x, y + 0.8, z);
      this.particles.addEmitter({ type: 'fire', rate: 26, pos: pos.clone(), opt: { size: 1.6 } });
      this.particles.addEmitter({ type: 'dust', rate: 3, pos: pos.clone().add(V(0, 3, 0)), opt: { color: 0x555555, n: 1, power: 1.3 } });
      this.physics.addCircle(x, z, 1.8, y + 1);
      this.fires.push({ light, pos, base: 30 });
      this.soundSpots.push({ id: 'fire' + x, name: 'fire', pos, vol: 0.6 });
    });
  }
  // ---------- tempestade ----------
  _storm(){
    const mat = new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x9b4dff) } },
      vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec2 vUv; varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        void main(){ vec2 p = vec2(vUv.x * 60.0, vUv.y * 6.0 - uTime * 0.6);
          float v = n(p) * 0.5 + n(p * 2.3 + uTime * 0.3) * 0.3 + n(p * 5.0) * 0.2;
          float a = (0.28 + v * 0.35) * (1.0 - smoothstep(0.7, 1.0, vUv.y));
          gl_FragColor = vec4(uColor * (0.7 + v * 0.9), a); }`
    });
    this.stormWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 260, 96, 1, true), mat);
    this.stormWall.position.y = 80; this.stormWall.userData.noProbe = true; this.stormWall.renderOrder = 5;
    this.group.add(this.stormWall);
    this.storm = { r: MAP_R, target: MAP_R, cx: 0, cz: 0, tcx: 0, tcz: 0, phase: 0, timer: 35, shrinking: false, dmg: 1 };
    this.setStormRadius(MAP_R);
  }
  setStormRadius(r){ this.storm.r = r; this.stormWall.scale.set(r, 1, r); this.stormWall.position.x = this.storm.cx; this.stormWall.position.z = this.storm.cz; }
  inStorm(p){ return Math.hypot(p.x - this.storm.cx, p.z - this.storm.cz) > this.storm.r; }
  updateStorm(dt, active){
    const S = this.storm;
    this.stormWall.material.uniforms.uTime.value += dt;
    if(!active) return null;
    S.timer -= dt;
    let ev = null;
    if(!S.shrinking && S.timer <= 0 && S.phase < 6){
      S.shrinking = true; S.phase++; S.from = S.r; S.fcx = S.cx; S.fcz = S.cz;
      S.target = Math.max(28, S.r * 0.62);
      const a = Math.random() * Math.PI * 2, off = (S.r - S.target) * 0.5 * Math.random();
      S.tcx = S.cx + Math.cos(a) * off; S.tcz = S.cz + Math.sin(a) * off;
      S.shrinkT = 0; S.shrinkDur = 18; S.dmg = S.phase; ev = 'shrink';
    }
    if(S.shrinking){
      S.shrinkT += dt; const u = Math.min(1, S.shrinkT / S.shrinkDur), e = u * u * (3 - 2 * u);
      S.cx = S.fcx + (S.tcx - S.fcx) * e; S.cz = S.fcz + (S.tcz - S.fcz) * e;
      this.setStormRadius(S.from + (S.target - S.from) * e);
      if(u >= 1){ S.shrinking = false; S.timer = 35; ev = 'stop'; }
    }
    return ev;
  }
  // ---------- destruição ----------
  hitResource(obj, instanceId, point){
    let list = null;
    if(obj === this.rockMesh) list = this.rocks.filter(r => r.idx === instanceId);
    else if(obj.userData.treeKind) list = this.trees.filter(t => t.idx === instanceId && t.pine === (obj.userData.treeKind === 'pine'));
    const it = list && list[0]; if(!it || !it.alive) return null;
    const isRock = obj === this.rockMesh;
    it.hp -= 35;
    this.particles.emit(isRock ? 'stone' : 'wood', point, { count: 10 });
    if(it.hp <= 0){
      it.alive = false;
      const zero = new THREE.Matrix4().makeScale(0, 0, 0);
      if(isRock){ this.rockMesh.setMatrixAt(it.idx, zero); this.rockMesh.instanceMatrix.needsUpdate = true; }
      else { const tm = this.treeMeshes; const a = it.pine ? [tm.iPT, tm.iP] : [tm.iT, tm.iL]; a.forEach(m => { m.setMatrixAt(it.idx, zero); m.instanceMatrix.needsUpdate = true; }); }
      it.collider.r = 0; it.collider.top = -1e9;
      this.particles.emit(isRock ? 'stone' : 'wood', point.clone().setY(it.y + 4), { count: 40 });
      this.particles.emit('dust', point.clone().setY(it.y + 2), { count: 20, size: 4 });
    }
    return { kind: isRock ? 'stone' : 'wood', amount: isRock ? 12 : 10, destroyed: !it.alive };
  }
  // ---------- loot no chão ----------
  spawnPickup(type, pos, amount){
    const g = new THREE.Group();
    const colors = { ammo: 0x94a3b8, shield: 0x3b82f6, potion: 0x3b82f6, medkit: 0xef4444, wood: 0xa16207, stone: 0x9ca3af, rifle: 0x22c55e, shotgun: 0x3b82f6, sniper: 0xa855f7 };
    const c = colors[type] || 0xffffff;
    let mesh;
    if(type === 'potion' || type === 'shield'){ mesh = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), Mat.glass(0x60a5fa)); const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.6, 10), Mat.glass(0x60a5fa)); neck.position.y = 0.8; g.add(neck); }
    else if(type === 'medkit'){ mesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 0.6), Mat.paint(0xf1f5f9)); const cr = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 0.62), Mat.paint(0xef4444)); const cr2 = cr.clone(); cr2.rotation.z = Math.PI / 2; g.add(cr, cr2); }
    else if(['rifle', 'shotgun', 'sniper'].includes(type)){ mesh = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 0.3), Mat.metal(0x333a40, 0.4)); }
    else mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.8), Mat.paint(c));
    g.add(mesh);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.5, 32), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = -1.1; g.add(ring);
    // sem PointLight (evita recompilar shaders a cada item) — brilho via anel aditivo
    ring.material.blending = THREE.AdditiveBlending;
    g.position.copy(pos); g.position.y = heightAt(pos.x, pos.z) + 1.5;
    g.traverse(o => { if(o.isMesh) o.castShadow = true; });
    this.group.add(g);
    const pk = { type, amount: amount || 1, group: g, pos: g.position.clone(), t: Math.random() * 6 };
    this.pickups.push(pk); return pk;
  }
  removePickup(pk){ this.group.remove(pk.group); this.pickups.splice(this.pickups.indexOf(pk), 1); }
  // ---------- update ----------
  update(dt, camera){
    this.t += dt;
    WIND_U.uTime.value = this.t;
    WIND_U.uWind.value.set(Wind.dir.x * Wind.strength * 0.06, 0, Wind.dir.z * Wind.strength * 0.06);
    if(this.waterNormal){ this.waterNormal.offset.x += dt * 0.02; this.waterNormal.offset.y += dt * 0.013; }
    for(const f of this.fires) f.light.intensity = f.base * (0.8 + Math.sin(this.t * 13) * 0.08 + Math.sin(this.t * 7.3) * 0.1 + Math.random() * 0.06);
    for(const c of this.chests){
      if(c.openT > 0 && c.openT < 1){ c.openT = Math.min(1, c.openT + dt * 2.5); c.lid.rotation.x = -1.9 * (1 - Math.pow(1 - c.openT, 3)); c.glow.intensity = 3 + (1 - c.openT) * 12; }
      else if(!c.opened) c.glow.intensity = 2.5 + Math.sin(this.t * 3) * 0.8;
      else c.glow.intensity *= 0.97;
    }
    for(const p of this.pickups){ p.t += dt; p.group.children[0].rotation.y += dt * 1.5; p.group.position.y = p.pos.y + Math.sin(p.t * 2) * 0.25; }
  }
}
