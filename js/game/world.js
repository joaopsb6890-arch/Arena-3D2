// ============================================================
// WORLD — ilha procedural: terreno com colinas suaves, grama
// instanciada com shader de vento, árvores/rochas instanciadas
// (destrutíveis), casas com colisão, baús, fogueira, lago com
// água PBR, loot no chão e parede da tempestade com shader.
// ============================================================
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Mat } from '../engine/materials.js';
import { getSurface, getTerrainLayers } from '../engine/textures.js';
import { Wind } from '../anim/secondary.js';
import { planPOIs, buildPOIs, ZONES, ROADS, LOCATIONS, palmGeo, cactusGeo, bushGeo, flowerGeo } from './pois.js';
import { createWeapon, RARITY, GUNS, rollRarity } from './weapons.js';

export const MAP_R = 600;   // v18: ilha maior (era 420 → ~2× a área)
export const GRID = 16, WALL_H = 13;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// v16: relevo novo — Pico Nevado (montanha com planalto no topo), dunas no deserto e o Rio Serpente
export const MOUNTAIN = { x: -245, z: -235, r: 118, h: 80 };
export const DESERT = { x: -300, z: 140, r: 130 };
export const RIVER = [[-172, -152], [-120, -135], [-85, -100], [-68, -66]];
export const WATER_Y = -1.4;
// v18: Cratera Vulcânica (cone com cratera e lago de lava) no nordeste
export const VOLCANO = { x: 335, z: 335, r: 100, h: 60, cr: 21 };
export const LAVA_Y = 37.5;
export function lavaAt(x, z){ return Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < VOLCANO.cr - 1 ? LAVA_Y : null; }
function volcanoH(x, z){
  const vx = x - VOLCANO.x, vz = z - VOLCANO.z, vd = Math.sqrt(vx * vx + vz * vz);
  if(vd >= VOLCANO.r) return 0;
  const u = 1 - vd / VOLCANO.r, e = u * u * (3 - 2 * u);
  let h = VOLCANO.h * Math.pow(e, 1.15) + Math.sin(Math.atan2(vz, vx) * 9 + vd * 0.08) * u * (1 - u) * 9;
  if(vd < VOLCANO.cr + 9){ const k = THREE.MathUtils.smoothstep(vd, VOLCANO.cr - 5, VOLCANO.cr + 9); h = h * k + (LAVA_Y - 2.5) * (1 - k); }
  return h;
}
function riverDist(x, z){
  if(x < -190 || x > -50 || z < -170 || z > -48) return 1e9;
  let best = 1e9;
  for(let i = 0; i < RIVER.length - 1; i++){
    const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t); if(d < best) best = d;
  }
  return best;
}
export function heightAt(x, z){
  const d = Math.hypot(x, z);
  if(FLAT_WORLD) return -Math.max(0, d - MAP_R + 30) * 0.6;   // ilha plana do Modo Criativo / mapas criados
  let h = 5.5 * Math.sin(x / 95) * Math.cos(z / 120) + 2.4 * Math.sin(x / 41 + z / 57) + 1.2 * Math.sin(z / 23 - x / 31);
  h *= THREE.MathUtils.smoothstep(d, 40, 140);          // centro plano
  // montanha: perfil suave + cristas; planalto no topo para a cabana
  const mx = x - MOUNTAIN.x, mz = z - MOUNTAIN.z, md2 = mx * mx + mz * mz;
  if(md2 < MOUNTAIN.r * MOUNTAIN.r){
    const u = 1 - Math.sqrt(md2) / MOUNTAIN.r, e = u * u * (3 - 2 * u);
    const ridge = (Math.sin(Math.atan2(mz, mx) * 5 + u * 3) * 0.5 + Math.sin(x / 13 + z / 17) * 0.3) * u * (1 - u) * 26;
    h += Math.min(MOUNTAIN.h, MOUNTAIN.h * Math.pow(e, 1.25) * 1.08 + ridge);
  }
  // dunas
  const dx = x - DESERT.x, dz = z - DESERT.z, dd2 = dx * dx + dz * dz;
  if(dd2 < DESERT.r * DESERT.r){ const w = 1 - Math.sqrt(dd2) / DESERT.r; h += (Math.sin(x / 19 + z / 31) * 2.2 + Math.sin(x / 7.3 - z / 11) * 0.5) * Math.min(1, w * 2.5); }
  // v18: vulcão
  h += volcanoH(x, z);
  // achata pontos de interesse
  for(const f of FLATS){ const dd = Math.hypot(x - f[0], z - f[1]); if(dd < f[2] + 18){ const k = THREE.MathUtils.smoothstep(dd, f[2], f[2] + 18); h = h * k + f[3] * (1 - k); } }
  // leito do rio (depois dos achatamentos, para a água atravessar tudo)
  const rd = riverDist(x, z);
  if(rd < 17){ const k = THREE.MathUtils.smoothstep(rd, 5, 17); h = Math.min(h, h * k + -3.1 * (1 - k)); }
  // borda da ilha afunda
  h -= Math.max(0, d - MAP_R + 30) * 0.6;
  return h;
}
/** v16: superfície da água em (x,z) ou null (lago + rio) */
export function waterAt(x, z){
  if(FLAT_WORLD) return null;
  if(Math.hypot(x + 60, z + 40) < 29) return WATER_Y;
  if(riverDist(x, z) < 9) return WATER_Y;
  return null;
}
export { riverDist };
const FLATS = [];   // [x,z,r,h]
let FLAT_WORLD = false;

let _rng = 1234567;
const rnd = () => ((_rng = (_rng * 1664525 + 1013904223) >>> 0) / 4294967296);
const rr = (a, b) => a + rnd() * (b - a);

// shader de vento para vegetação (instanced): desloca vértices pelo peso = altura
function windify(mat, amount, key, grad){
  mat.onBeforeCompile = (sh) => {
    if(grad){
      // v14: gradiente raiz→ponta (oclusão falsa na base, pontas mais claras) — custo ~0
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGH;').replace('#include <color_fragment>', `#include <color_fragment>\n diffuseColor.rgb *= mix(${grad[0].toFixed(2)}, ${grad[1].toFixed(2)}, clamp(vGH, 0.0, 1.0));`);
    }
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
    if(grad) sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vGH;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGH = position.y * ' + grad[2].toFixed(3) + ';');
  };
  mat.customProgramCacheKey = () => 'wind_' + key + (grad ? '_g' : '');
  return mat;
}
const HIDDEN = new THREE.MeshBasicMaterial({ visible: false });
// v18: divide um InstancedMesh em blocos espaciais (células de 'cell' u) → o frustum culling (câmara e sombra)
// passa a descartar blocos inteiros fora de vista em vez de desenhar a ilha toda em cada passe.
function chunkify(im, cell){
  const n = im.count, m = new THREE.Matrix4(), c = new THREE.Color(), groups = new Map(), map = new Array(n);
  for(let i = 0; i < n; i++){ im.getMatrixAt(i, m); const key = Math.floor(m.elements[12] / cell) + ',' + Math.floor(m.elements[14] / cell); if(!groups.has(key)) groups.set(key, []); groups.get(key).push(i); }
  const meshes = [];
  for(const ids of groups.values()){
    const cm = new THREE.InstancedMesh(im.geometry, im.material, ids.length);
    ids.forEach((id, j) => { im.getMatrixAt(id, m); cm.setMatrixAt(j, m); if(im.instanceColor){ im.getColorAt(id, c); cm.setColorAt(j, c); } map[id] = { m: cm, i: j }; });
    cm.castShadow = im.castShadow; cm.receiveShadow = im.receiveShadow; Object.assign(cm.userData, im.userData);
    cm.instanceMatrix.needsUpdate = true; if(cm.instanceColor) cm.instanceColor.needsUpdate = true; cm.computeBoundingSphere();
    meshes.push(cm);
  }
  im.dispose && im.dispose();
  return { meshes, map };
}
const CELL = 300;
function mergeVerticesSafe(g){ const c = g.clone(); c.deleteAttribute('uv'); c.deleteAttribute('normal'); return mergeVertices(c, 1e-4); }
export const WIND_U = { uTime: { value: 0 }, uWind: { value: new THREE.Vector3() } };

export class World {
  constructor(scene, physics, particles, audio, quality, opts){
    this.scene = scene; this.physics = physics; this.particles = particles; this.audio = audio;
    opts = opts || {}; this.empty = !!opts.empty;
    FLATS.length = 0; FLAT_WORLD = this.empty;   // v13: antes acumulava entradas a cada partida (heightAt ficava mais lento)
    this.q = quality || 'alta';
    this.group = new THREE.Group(); scene.add(this.group);
    this.raycastTargets = [];       // meshes que bloqueiam tiros
    this.trees = []; this.rocks = []; this.chests = []; this.pickups = []; this.houses = []; this.structures = [];
    this.emitters = [];
    this.t = 0;
    _rng = 1234567;
    if(this.empty){ this.housePlan = []; this.fires = []; }
    else { this._planHouses(); planPOIs(FLATS); }
    this._ground();
    this._water();
    if(!this.empty){
      this._houses();
      // v16: locais nomeados (cidade, fábrica, posto, farol, pico, ponte)
      this._staticMerge = [];
      this.poi = buildPOIs(this, heightAt);
      for(const g of this._staticMerge) g.traverse(o => { if(o.isMesh){ if(!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); if(o.geometry.boundingSphere.radius > 2.5 && o.material !== this.poi.mats.glass) this.raycastTargets.push(o); } });
      this._mergeStatic(this._staticMerge);
      this.poi.loot.chests.forEach(([x, z, r, y]) => this.addChest(x, z, r, y));
      this.poi.loot.floor.forEach(([x, y, z]) => { const t = Math.random(); if(t < 0.62) this.spawnPickup(GUNS[Math.floor(Math.random() * GUNS.length)], V(x, 0, z), 1, { y: y + 1.5, rar: rollRarity() }); else this.spawnPickup(['potion', 'medkit', 'ammo', 'grenade'][Math.floor(Math.random() * 4)], V(x, 0, z), t < 0.8 ? 1 : 2, { y: y + 1.5 }); });
      this._river();
      this._volcano();
      this._trees(); this._rocks(); this._props();
    }
    if(this.empty || opts.editable) this._emptyInstances();
    this._grass();
    if(!this.empty) this._campfires();
    this._storm();
  }
  waterAt(x, z){ return waterAt(x, z); }
  // ---------- terreno ----------
  _planHouses(){
    this.housePlan = [];
    const spots = [[60, 40], [-90, 70], [120, -110], [-140, -80], [20, -170], [190, 90], [-40, 200], [-220, 20], [330, 40], [-330, -40], [80, 330], [-150, 385], [420, -200], [-200, -430]];   // v18: +6 casas no anel exterior
    spots.forEach(([x, z], i) => {
      const w = i % 3 === 0 ? 3 : 2, d = 2;
      this.housePlan.push({ x, z, w, d, rot: 0 });
      FLATS.push([x, z, Math.max(w, d) * GRID * 0.75, 0]);
    });
    FLATS.push([-60, -40, 26, -2.2]); // lago
  }
  _ground(){
    const seg = this.q === 'baixa' ? 200 : this.q === 'media' ? 270 : 330;   // v18: mapa maior → mais segmentos (≈4.4 u por quadrado em Alta)
    const g = new THREE.PlaneGeometry(MAP_R * 2.4, MAP_R * 2.4, seg, seg); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3), spl = new Float32Array(pos.count * 4);
    const SS = THREE.MathUtils.smoothstep, addW = (i, ch, w) => { spl[i * 4 + ch] = Math.max(spl[i * 4 + ch], w); };
    const cA = new THREE.Color(0x5f8f3e), cB = new THREE.Color(0x7aa04a), cDirt = new THREE.Color(0x8a7550), cSand = new THREE.Color(0xcdb98a);
    const cBas = new THREE.Color(0x3a3431), cAsh = new THREE.Color(0x5b534d), cDes = new THREE.Color(0xe0c48c), cSnow = new THREE.Color(0xf1f5f9), cBed = new THREE.Color(0x7c6f55), cRoad = new THREE.Color(0x9a8260), cPave = new THREE.Color(0x6b6f76);
    for(let i = 0; i < pos.count; i++){
      const x = pos.getX(i), z = pos.getZ(i), h = heightAt(x, z); pos.setY(i, h);
      const n = Math.sin(x * 0.05) * Math.cos(z * 0.043) * 0.5 + 0.5;
      const c = cA.clone().lerp(cB, n);
      const d = Math.hypot(x, z);
      if(d > MAP_R - 40){ const w = SS(d, MAP_R - 40, MAP_R - 15); c.lerp(cSand, w); addW(i, 0, w); }
      for(const hp of this.housePlan){ const dd = Math.hypot(x - hp.x, z - hp.z); if(dd < 30){ c.lerp(cDirt, (1 - dd / 30) * 0.5); addW(i, 3, (1 - dd / 30) * 0.8); } }
      const lake = Math.hypot(x + 60, z + 40); if(lake < 34){ const w = SS(34 - lake, 0, 8); c.lerp(cSand, w); addW(i, 0, w); }
      if(!this.empty){
        // v16: biomas
        const dD = Math.hypot(x - DESERT.x, z - DESERT.z); if(dD < DESERT.r + 20){ const w = SS(DESERT.r + 20 - dD, 0, 35); c.lerp(cDes, w); addW(i, 0, w); }
        const vD = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
        if(vD < VOLCANO.r + 14){ const w = SS(VOLCANO.r + 14 - vD, 0, 45); c.lerp(vD < VOLCANO.cr + 12 ? cBas : cAsh, w * 0.9); addW(i, 1, w * 0.75); }
        else if(h > 34){ const w = SS(h, 34, 46); c.lerp(cSnow, w); addW(i, 2, w); }
        const rd = riverDist(x, z); if(rd < 16){ const w = SS(16 - rd, 0, 5) * 0.85; c.lerp(rd < 9 ? cBed : cSand, w); addW(i, rd < 9 ? 3 : 0, w); }
        for(const r of ROADS){ const dx = r[2] - r[0], dz = r[3] - r[1], t = Math.max(0, Math.min(1, ((x - r[0]) * dx + (z - r[1]) * dz) / (dx * dx + dz * dz))); const dr = Math.hypot(x - r[0] - dx * t, z - r[1] - dz * t); if(dr < 6){ c.lerp(cRoad, (1 - dr / 6) * 0.7); addW(i, 3, Math.min(1, (1 - dr / 6) * 1.3)); } }
        for(const Z of ZONES){ if(x > Z[0] - 4 && x < Z[2] + 4 && z > Z[1] - 4 && z < Z[3] + 4 && !Z[4]){ c.lerp(cPave, 0.8); addW(i, 1, 0.9); } }
      }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.computeVertexNormals();
    // v14: variação macro + encostas terrosas "cozidas" nas cores dos vértices (custo zero na GPU)
    const nrm = g.attributes.normal, vn = (x, z) => { const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, h = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); }, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz); return (h(i, j) * (1 - sx) + h(i + 1, j) * sx) * (1 - sz) + (h(i, j + 1) * (1 - sx) + h(i + 1, j + 1) * sx) * sz; };
    const cRock = new THREE.Color(0x786650), tmp = new THREE.Color();
    for(let i = 0; i < pos.count; i++){
      const x = pos.getX(i), z = pos.getZ(i);
      const gm = vn(x * 0.012, z * 0.012) * 0.65 + vn(x * 0.05, z * 0.05) * 0.35, k = 0.84 + gm * 0.28;
      tmp.setRGB(col[i * 3] * k, col[i * 3 + 1] * k, col[i * 3 + 2] * k);
      const dry = THREE.MathUtils.smoothstep(vn(x * 0.021 + 7, z * 0.021 + 7), 0.55, 0.9) * 0.4; tmp.r *= 1 + 0.18 * dry; tmp.g *= 1 + 0.06 * dry; tmp.b *= 1 - 0.28 * dry;
      const rk = THREE.MathUtils.smoothstep(0.93 - nrm.getY(i), 0, 0.15); tmp.lerp(cRock, rk * 0.7); addW(i, 1, rk);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('splat', new THREE.BufferAttribute(spl, 4));
    const s = getSurface('ground');
    const rep = (t) => { const c = t.clone(); c.repeat.set(90, 90); c.needsUpdate = true; return c; };
    // v17: terreno com 5 camadas de textura (relva, areia, rocha, neve, terra) misturadas por pesos por vértice,
    // amostragem dupla em escalas diferentes (sem padrão repetido visível), rocha projetada nas encostas,
    // transição por "altura" da textura (bordas naturais) e esbatimento à distância (sem cintilação).
    const L = getTerrainLayers(this.q === 'baixa' ? 256 : 512);
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, normalMap: rep(s.normalMap), roughnessMap: rep(s.roughnessMap), normalScale: new THREE.Vector2(0.9, 0.9) });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { tG: { value: L.grass }, tS: { value: L.sand }, tR: { value: L.rock }, tN: { value: L.snow }, tD: { value: L.dirt } });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 splat; varying vec4 vSpl; varying vec3 vTW; varying vec3 vTN;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSpl = splat; vTW = (modelMatrix * vec4(transformed, 1.0)).xyz; vTN = normal;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tG, tS, tR, tN, tD; varying vec4 vSpl; varying vec3 vTW; varying vec3 vTN;\nvec3 dual(sampler2D t, vec2 p){ vec2 q = mat2(0.8, -0.6, 0.6, 0.8) * p * 0.27 + 0.31; return mix(texture2D(t, p).rgb, texture2D(t, q).rgb, 0.38); }')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 p = vTW.xz * 0.16;
          vec3 cg = dual(tG, p), cs = dual(tS, p * 0.8), cn = dual(tN, p * 0.6), cd = dual(tD, p * 1.1);
          vec3 an = abs(normalize(vTN)); vec3 cr = texture2D(tR, vTW.xz * 0.09).rgb * an.y + texture2D(tR, vTW.zy * 0.09).rgb * an.x + texture2D(tR, vTW.xy * 0.09).rgb * an.z; cr /= (an.x + an.y + an.z);
          vec4 w = clamp(vSpl, 0.0, 1.0);
          // transição pela luminância da textura (a areia "enche" os vales da relva primeiro, etc.)
          float hg = dot(cg, vec3(0.33));
          w = clamp(w + (vec4(dot(cs, vec3(.33)), dot(cr, vec3(.33)), dot(cn, vec3(.33)), dot(cd, vec3(.33))) - hg) * 2.5 * w * (1.0 - w) * 4.0, 0.0, 1.0);
          w = smoothstep(0.15, 0.85, w);
          vec3 lay = cg;
          lay = mix(lay, cd, w.w); lay = mix(lay, cs, w.x); lay = mix(lay, cr, w.y); lay = mix(lay, cn, w.z);
          float fd = smoothstep(70.0, 320.0, distance(vTW, cameraPosition));
          lay = mix(lay, vec3(0.5), fd * 0.7);
          diffuseColor.rgb *= lay * 2.0;`);
    };
    m.customProgramCacheKey = () => 'terrain_v17';
    this.ground = new THREE.Mesh(g, m); this.ground.receiveShadow = true; this.ground.name = 'ground';
    this.group.add(this.ground); this.raycastTargets.push(this.ground);
    // oceano
    // v14: oceano mais barato (Standard em vez de Physical+clearcoat), cor por profundidade e espuma animada na costa
    const seaMat = new THREE.MeshStandardMaterial({ color: 0x1b6a8a, roughness: 0.22, metalness: 0.0, envMapIntensity: 0.6 });
    seaMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = WIND_U.uTime; sh.uniforms.uR = { value: MAP_R };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vSW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSW = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vSW; uniform float uTime, uR;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float sd = length(vSW) - uR * 1.0;
          diffuseColor.rgb = mix(vec3(0.10, 0.48, 0.52), vec3(0.03, 0.17, 0.30), smoothstep(-15.0, 120.0, sd));
          float fo = sin(sd * 0.9 - uTime * 1.6 + sin(atan(vSW.y, vSW.x) * 23.0) * 2.0) * 0.5 + 0.5;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.97, 1.0), smoothstep(0.86, 1.0, fo) * smoothstep(22.0, -12.0, sd) * 0.8);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          vec2 wq = vSW * 0.09; normal = normalize(normal + vec3(sin(wq.x * 3.1 + uTime * 1.3) * 0.05 + sin(wq.y * 4.7 - uTime * 0.9) * 0.04, 0.0, cos(wq.y * 2.9 + uTime * 1.1) * 0.05));`);
    };
    seaMat.customProgramCacheKey = () => 'sea_v14';
    const sea = new THREE.Mesh(new THREE.CircleGeometry(4000, 64), seaMat);
    sea.rotation.x = -Math.PI / 2; sea.position.y = -6; this.group.add(sea); sea.userData.noProbe = true;
  }
  _water(){
    if(this.empty){ this.soundSpots = []; return; }
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
    this.housePlan.forEach((hp, idx) => this._buildHouse(hp, idx));
    this._mergeStatic(this.houseGroups);
    // baús externos
    [[30, 110], [-160, 150], [150, 20], [-20, -110], [240, -60], [-260, -150], [90, 230]].forEach(([x, z], i) => this.addChest(x, z, i));
  }
  _buildHouse(hp, idx){
    const wallM = Mat.plaster(0xe8dcc4), wallM2 = Mat.plaster(0xc9d6df), roofM = Mat.wood(0x8b3a2b), floorM = Mat.wood(0xa87b4f), trimM = Mat.wood(0x5b3a24), glassM = Mat.glass(0x9fd3ff);
    const shutA = Mat.paint(0x2f6f8f), shutB = Mat.paint(0x7a3b2e), shutC = Mat.paint(0x4d6b3a), doorM = Mat.wood(0x6b4226), brass = Mat.metal(0xc8a24a, 0.3), roofM2 = Mat.wood(0x7a2f22);
    const flowerA = Mat.paint(0xe11d48), flowerB = Mat.paint(0xfacc15), leafM2 = Mat.paint(0x3f7d2c), glassDark = Mat.glass(0x7fb3d5), rugM = Mat.cloth(0x9f1239, 'fabric'), bookA = Mat.paint(0x1d4ed8), bookB = Mat.paint(0xb45309), bookC = Mat.paint(0x15803d);
    const T = 0.6;
      const W = hp.w * GRID, D = hp.d * GRID, H = WALL_H, x0 = hp.x - W / 2, z0 = hp.z - D / 2, y0 = 0;
      const g = new THREE.Group(); this.group.add(g); (this.houseGroups = this.houseGroups || []).push(g);
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
      hp.smoke = this.particles.addEmitter({ type: 'dust', rate: 4, pos: V(x0 + W * 0.75, H + 9, hp.z + 2), opt: { color: 0xcfcfcf, n: 1, power: 1.6 } });
      // ---- detalhes v13 (sem colisão; juntados no merge → custo de draw call ~zero) ----
      const deco = (cx, cy, cz, sx, sy, sz, mat, rx, ry) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); m.position.set(cx, cy, cz); if(rx) m.rotation.x = rx; if(ry) m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
      const shutM = idx % 3 === 0 ? shutA : idx % 3 === 1 ? shutB : shutC;
      const windowAt = (cx, cy, cz, axis, w, h, out) => {
        // moldura + travessas + venezianas + floreira
        const ax = axis === 'x', t = 0.35;
        const P = (u, v, n) => ax ? [cx + u, cy + v, cz + n] : [cx + n, cy + v, cz + u];
        const S = (su, sv, sn) => ax ? [su, sv, sn] : [sn, sv, su];
        deco(...P(0, h / 2 + 0.2, out * 0.2), ...S(w + 0.9, 0.4, t), trimM); deco(...P(0, -h / 2 - 0.25, out * 0.3), ...S(w + 1.2, 0.35, 0.7), trimM);
        deco(...P(-w / 2 - 0.2, 0, out * 0.2), ...S(0.4, h, t), trimM); deco(...P(w / 2 + 0.2, 0, out * 0.2), ...S(0.4, h, t), trimM);
        deco(...P(0, 0, out * 0.15), ...S(0.16, h, 0.16), trimM); deco(...P(0, 0, out * 0.15), ...S(w, 0.16, 0.16), trimM);
        deco(...P(-w / 2 - 1.5, 0, out * 0.25), ...S(2.2, h + 0.4, 0.18), shutM); deco(...P(w / 2 + 1.5, 0, out * 0.25), ...S(2.2, h + 0.4, 0.18), shutM);
        for(let i = -1; i <= 1; i++){ deco(...P(-w / 2 - 1.5, i * h * 0.3, out * 0.36), ...S(1.9, 0.12, 0.06), trimM); deco(...P(w / 2 + 1.5, i * h * 0.3, out * 0.36), ...S(1.9, 0.12, 0.06), trimM); }
        deco(...P(0, -h / 2 - 0.8, out * 0.6), ...S(w + 0.4, 0.8, 0.9), floorM);
        for(let i = 0; i < 5; i++){ const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), [flowerA, flowerB, leafM2][i % 3]); f.position.set(...P((i - 2) * w / 5, -h / 2 - 0.2, out * 0.6)); g.add(f); }
      };
      windowAt(hp.x, (winY0 + winY1) / 2, z0 + D, 'x', winW, winY1 - winY0, 1);
      // janelas falsas nas laterais (vidro + moldura)
      [-1, 1].forEach(sd => {
        const xw = sd < 0 ? x0 : x0 + W;
        const gl = new THREE.Mesh(new THREE.PlaneGeometry(4, 4.2), glassDark); gl.position.set(xw + sd * 0.32, 6.8, hp.z); gl.rotation.y = sd * Math.PI / 2; g.add(gl);
        windowAt(xw, 6.8, hp.z, 'z', 4, 4.2, sd);
      });
      // porta aberta, batentes, degrau e luminária
      deco(x0 + segW - 0.25, doorH / 2, z0 - 0.2, 0.5, doorH, 0.9, trimM); deco(x0 + W - segW + 0.25, doorH / 2, z0 - 0.2, 0.5, doorH, 0.9, trimM);
      const door = deco(x0 + segW + 0.2, doorH / 2 - 0.1, z0 - 2.3, 0.3, doorH - 0.4, 4.4, doorM);
      deco(x0 + segW + 0.4, doorH / 2, z0 - 3.9, 0.2, 0.2, 0.5, brass);
      for(let i = 0; i < 3; i++) deco(x0 + segW + 0.55, 1.3 + i * 2.6, z0 - 2.3, 0.08, 1.6, 3.4, trimM);
      deco(hp.x, -0.2, z0 - 1.6, doorW + 3, 0.7, 3, Mat.rock(0xa1a1aa));
      deco(hp.x + doorW / 2 + 1.3, doorH - 0.8, z0 - 0.55, 0.5, 0.8, 0.5, brass);
      // cantoneiras, cumeeira, beirais e rodapé
      [[x0, z0], [x0 + W, z0], [x0, z0 + D], [x0 + W, z0 + D]].forEach(([cx, cz]) => deco(cx, H / 2, cz, 0.9, H + 0.2, 0.9, trimM));
      deco(hp.x, H + Math.tan(pitch) * rw - 0.2, hp.z, W + 2.8, 0.7, 0.7, trimM);
      [-1, 1].forEach(sd => deco(hp.x, H - 0.1, hp.z + sd * (rw - 0.4), W + 2.6, 0.5, 0.3, trimM));
      deco(hp.x, 0.6, z0 - 0.2, W + 0.4, 0.8, 0.25, Mat.rock(0x8f969e)); deco(hp.x, 0.6, z0 + D + 0.2, W + 0.4, 0.8, 0.25, Mat.rock(0x8f969e));
      // telhas: fiadas sobre o telhado
      [-1, 1].forEach(sd => { const n = 7; for(let i = 0; i < n; i++){ const u = (i + 0.5) / n; const zz = hp.z + sd * (rw - 0.6) * u - sd * 0.6 * 0 , yy = H + Math.tan(pitch) * rw * (1 - u) + 0.25; deco(hp.x, yy - 0.2, zz + sd * 0.1, W + 2.5, 0.25, 0.6, roofM2, sd * pitch); } });
      deco(x0 + W * 0.75, H + 8.7, hp.z + 2, 2.8, 0.5, 2.8, Mat.rock(0x57534e));
      // interior: mesa, cadeiras, estante, tapete
      const ix = hp.x + (idx % 2 ? W / 4 : -W / 4), iz = hp.z - D / 6;
      deco(ix, 2.4, iz, 4.2, 0.3, 2.6, floorM); [[-1.8, -1], [1.8, -1], [-1.8, 1], [1.8, 1]].forEach(([dx, dz]) => deco(ix + dx, 1.2, iz + dz, 0.3, 2.3, 0.3, trimM));
      [-1, 1].forEach(sd => { deco(ix + sd * 3.2, 1.3, iz, 1.4, 0.2, 1.4, trimM); deco(ix + sd * 3.8, 2.4, iz, 0.2, 2.2, 1.4, trimM); });
      deco(ix, 0.33, iz, 7, 0.05, 5, rugM);
      deco(x0 + 1, 4, hp.z + D / 2 - 2.5, 1, 7.5, 5, trimM); for(let i = 0; i < 3; i++) deco(x0 + 1.4, 1.6 + i * 2.3, hp.z + D / 2 - 2.5, 0.8, 1.2, 4.2, [bookA, bookB, bookC][i]);
      // baú interno
      this.addChest(hp.x + (idx % 2 ? -W / 4 : W / 4), hp.z + D / 4, Math.PI);
      this.houses.push({ ...hp, W, D, center: V(hp.x, 0, hp.z) });
  }
  addChest(x, z, rot, yOver){
    const inHouse = this.housePlan.some(h => Math.abs(x - h.x) < h.w * GRID / 2 && Math.abs(z - h.z) < h.d * GRID / 2);
    const y = yOver !== undefined ? yOver : heightAt(x, z) + (inHouse ? 0.3 : 0);
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
    const chest = { group: g, lid: lidPivot, glow, pos: g.position.clone(), opened: false, openT: 0, elev: yOver !== undefined && yOver - heightAt(x, z) > 3 };
    chest.emitter = this.particles.addEmitter({ type: 'magic', rate: 5, pos: g.position.clone().add(V(0, 2.2, 0)), opt: { color: 0xffd36a } });
    this.chests.push(chest);
    chest.collider = this.physics.addCircle(x, z, 1.6, g.position.y + 1.8);
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
  /** OTIMIZAÇÃO v13: junta malhas estáticas por material (casas: ~260 draw calls → ~10) */
  _mergeStatic(groups){
    const buckets = new Map();
    for(const g of groups){
      g.updateMatrixWorld(true);
      g.children.slice().forEach(m => {
        if(!m.isMesh || m.userData.keep) return;
        const k = m.material.uuid + (m.castShadow ? 's' : 'n');
        if(!buckets.has(k)) buckets.set(k, { mat: m.material, cast: m.castShadow, geos: [] });
        let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        Object.keys(geo.attributes).forEach(a => { if(!['position', 'normal', 'uv'].includes(a)) geo.deleteAttribute(a); });
        if(!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
        geo.applyMatrix4(m.matrixWorld);
        buckets.get(k).geos.push(geo);
        // a peça original fica só para raycast (tiros/câmera) — invisível, não gera draw call
        if(this.raycastTargets.includes(m)){ m.material = HIDDEN; m.castShadow = false; } else { g.remove(m); m.geometry.dispose(); }
      });
    }
    for(const b of buckets.values()){
      const mesh = new THREE.Mesh(mergeGeometries(b.geos, false), b.mat);
      mesh.castShadow = b.cast; mesh.receiveShadow = true; mesh.name = 'houses_merged'; mesh.userData.noProbe = false;
      this.group.add(mesh);
    }
  }
  // ---------- vegetação ----------
  _treeGeos(){
    const trunk = new THREE.CylinderGeometry(0.55, 0.95, 9, 10, 4); trunk.translate(0, 4.5, 0);
    const tp = trunk.attributes.position; for(let i = 0; i < tp.count; i++){ const y = tp.getY(i); tp.setX(i, tp.getX(i) + Math.sin(y * 0.6) * 0.15); }
    trunk.computeVertexNormals();
    // v13: galhos + 12 aglomerados de folhas (antes 7), com ruído mais fino
    const branches = [];
    for(let i = 0; i < 5; i++){ const a = i / 5 * Math.PI * 2 + 0.4; const b = new THREE.CylinderGeometry(0.16, 0.32, 4.2, 6); b.translate(0, 2.1, 0); b.rotateZ(0.9); b.rotateY(a); b.translate(0, 6.5 + (i % 3) * 0.9, 0); branches.push(b.index ? b.toNonIndexed() : b); }
    const trunkFull = mergeGeometries([trunk.index ? trunk.toNonIndexed() : trunk, ...branches]); trunkFull.computeVertexNormals();
    const leaves = [];
    for(let i = 0; i < 12; i++){
      const r = 2.9 - (i % 4) * 0.25 + (i % 2) * 0.35;
      const s = new THREE.IcosahedronGeometry(r, 2);
      const sp = s.attributes.position; for(let k = 0; k < sp.count; k++){ const x = sp.getX(k), y = sp.getY(k), z = sp.getZ(k); const n = 1 + Math.sin(x * 1.7 + z * 1.3) * 0.12 + Math.sin(y * 2.2) * 0.08; sp.setXYZ(k, x * n, y * n, z * n); }
      const a = i / 11 * Math.PI * 2 * 1.618, ring = i === 0 ? 0 : i < 6 ? 2.6 : 1.6;
      s.translate(Math.cos(a) * ring, 10 + (i === 0 ? 2.4 : i < 6 ? rr(-1.2, 0.8) : rr(1.4, 2.8)), Math.sin(a) * ring);
      leaves.push(s.index ? s.toNonIndexed() : s);
    }
    const leaf = mergeGeometries(leaves.map(g => { ['uv'].forEach(k => g.deleteAttribute(k)); return g; })); leaf.computeVertexNormals();
    // pinheiro
    const pineT = new THREE.CylinderGeometry(0.4, 0.8, 12, 8); pineT.translate(0, 6, 0);
    const cones = [];
    for(let i = 0; i < 6; i++){ const c = new THREE.ConeGeometry(4.4 - i * 0.62, 4.2, 18, 3); const cp = c.attributes.position; for(let k = 0; k < cp.count; k++){ const x = cp.getX(k), z = cp.getZ(k), y = cp.getY(k), ang = Math.atan2(z, x); const serr = 1 + Math.sin(ang * 9) * 0.09 * (0.5 - y / 4.2); cp.setX(k, x * serr); cp.setZ(k, z * serr); if(y < -1.5) cp.setY(k, y - Math.abs(Math.sin(ang * 9)) * 0.35); } c.translate(0, 5.6 + i * 2.05, 0); cones.push(c.index ? c.toNonIndexed() : c); }
    const pine = mergeGeometries(cones.map(g => { g.deleteAttribute('uv'); return g; })); pine.computeVertexNormals();
    return { trunk: trunkFull, leaf, pineT, pine };
  }
  _trees(){
    const G = this.treeG = this._treeGeos();
    const count = this.q === 'baixa' ? 180 : this.q === 'media' ? 280 : 400;   // v18: mapa ~2× maior
    const trunkM = Mat.wood(0x6b4a2f), leafM = windify(new THREE.MeshStandardMaterial({ color: 0x4f8a35, roughness: 0.85, flatShading: false }), 0.06, 'leaf');
    const pineM = windify(new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.9 }), 0.05, 'pine');
    const half = Math.ceil(count / 2);
    const iT = new THREE.InstancedMesh(G.trunk, trunkM, half), iL = new THREE.InstancedMesh(G.leaf, leafM, half);
    const iPT = new THREE.InstancedMesh(G.pineT, trunkM, count - half), iP = new THREE.InstancedMesh(G.pine, pineM, count - half);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    let a = 0, b = 0;
    for(let i = 0; i < count; i++){
      let x, z, ok = false, tries = 0;
      while(!ok && tries++ < 40){ const ang = rnd() * Math.PI * 2, d = 30 + Math.sqrt(rnd()) * (MAP_R - 60); x = Math.cos(ang) * d; z = Math.sin(ang) * d;
        // v18: bosques densos — selva à volta do Templo (árvores redondas) e pinhal no Acampamento (pinheiros)
        const bias = rnd(); if(bias < 0.1 && i < half){ const a2 = rnd() * 6.28, d2 = 22 + Math.sqrt(rnd()) * 60; x = 40 + Math.cos(a2) * d2; z = 480 + Math.sin(a2) * d2; } else if(bias < 0.1){ const a2 = rnd() * 6.28, d2 = 26 + Math.sqrt(rnd()) * 55; x = -330 + Math.cos(a2) * d2; z = 370 + Math.sin(a2) * d2; }
        ok = this._freeSpot(x, z, 14) && Math.hypot(x - VOLCANO.x, z - VOLCANO.z) > VOLCANO.r * 0.8; }
      if(!ok) continue;
      const pineType0 = i >= half, y0 = heightAt(x, z);
      if(Math.hypot(x - DESERT.x, z - DESERT.z) < DESERT.r - 10 || y0 > 60 || (!pineType0 && y0 > 30)) continue;
      const y = y0, sc = rr(0.8, 1.35);
      p.set(x, y - 0.3, z); q.setFromEuler(new THREE.Euler(0, rnd() * 6.28, 0)); s.set(sc, sc * rr(0.9, 1.15), sc); m.compose(p, q, s);
      const pineType = i >= half;
      const tree = { x, z, y, sc, hp: 120, alive: true, pine: pineType, idx: pineType ? b : a, matrix: m.clone() };
      if(pineType){ iPT.setMatrixAt(b, m); iP.setMatrixAt(b, m); c.setHSL(0.33 + rr(-0.03, 0.03), 0.45, 0.28 + rr(-0.04, 0.04)); if(y > 30) c.lerp(new THREE.Color(0xe8f0f5), THREE.MathUtils.smoothstep(y, 30, 48) * 0.7); iP.setColorAt(b, c); b++; }
      else { iT.setMatrixAt(a, m); iL.setMatrixAt(a, m); c.setHSL(0.27 + rr(-0.04, 0.05), 0.5, 0.36 + rr(-0.05, 0.05)); iL.setColorAt(a, c); a++; }
      tree.collider = this.physics.addCircle(x, z, 1.1 * sc, y + 14);
      this.trees.push(tree);
    }
    iT.count = iL.count = a; iPT.count = iP.count = b;
    iT.userData.treeKind = 'round'; iL.userData.treeKind = 'round'; iPT.userData.treeKind = 'pine'; iP.userData.treeKind = 'pine';
    // v18: blocos espaciais (culling por bloco) — cada árvore guarda as suas instâncias (tronco + copa)
    const round = this.trees.filter(t => !t.pine), pines = this.trees.filter(t => t.pine);
    for(const [im, list] of [[iT, round], [iL, round], [iPT, pines], [iP, pines]]){
      im.castShadow = true; im.receiveShadow = true;
      // troncos (poucos triângulos) ficam num só draw call; copas/pinheiros (pesados) vão em blocos
      const whole = im === iT || im === iPT;
      const { meshes, map } = whole ? { meshes: [im], map: Array.from({ length: im.count }, (_, i) => ({ m: im, i })) } : chunkify(im, CELL), byIdx = new Map(list.map(t => [t.idx, t]));
      if(whole){ im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
      for(const cm of meshes){ cm.userData.map = []; this.group.add(cm); this.raycastTargets.push(cm); }
      map.forEach((e, idx) => { const t = byIdx.get(idx); if(!t) return; (t.parts || (t.parts = [])).push(e); e.m.userData.map[e.i] = t; });
    }
    this.treeMeshes = null;
  }
  _rocks(){
    const count = this.q === 'baixa' ? 80 : 140;
    const { geo, rockMat } = this._rockGeo();
    const im = new THREE.InstancedMesh(geo, rockMat, count);
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
    im.count = k; im.castShadow = true; im.receiveShadow = true;
    const { meshes, map } = chunkify(im, CELL), byIdx = new Map(this.rocks.map(r => [r.idx, r]));
    for(const cm of meshes){ cm.userData.map = []; cm.userData.rock = true; this.group.add(cm); this.raycastTargets.push(cm); }
    map.forEach((e, idx) => { const r = byIdx.get(idx); if(!r) return; r.parts = [e]; e.m.userData.map[e.i] = r; });
    this.rockMesh = null;
  }
  _rockGeo(){
    if(this.rockG) return this.rockG;
    // v13: rocha com ruído fractal (4 oitavas) + faces "lascadas" + musgo no topo (vertex color)
    let geo = new THREE.IcosahedronGeometry(2.2, this.q === 'baixa' ? 2 : 3);   // v18: menos triângulos (o ruído fractal mantém a forma)
    geo = mergeVerticesSafe(geo);
    const gp = geo.attributes.position, col = new Float32Array(gp.count * 3), cR = new THREE.Color(0x9aa1a9), cD = new THREE.Color(0x6b7178), cM = new THREE.Color(0x5d7f3a), tmp = new THREE.Color();
    for(let i = 0; i < gp.count; i++){
      const x = gp.getX(i), y = gp.getY(i), z = gp.getZ(i);
      let n = 0, a = 0.16, f = 1.1; for(let o = 0; o < 4; o++){ n += Math.sin(x * f + 1.3 * o) * Math.sin(y * f * 1.3 + 0.7 * o) * Math.sin(z * f * 0.9 + 2.1 * o) * a; a *= 0.5; f *= 2.1; }
      const facet = Math.round((x + z) * 1.4) / 1.4 - (x + z); n += facet * 0.05;
      const k = 1 + n; gp.setXYZ(i, x * k * 1.05, y * k * 0.72, z * k);
      const up = y / 2.2;
      tmp.copy(cD).lerp(cR, 0.5 + n * 2.5); if(up > 0.35) tmp.lerp(cM, THREE.MathUtils.smoothstep(up, 0.35, 0.9) * 0.75);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const uv = new Float32Array(gp.count * 2); for(let i = 0; i < gp.count; i++){ uv[i * 2] = Math.atan2(gp.getZ(i), gp.getX(i)) / 6.283 + 0.5; uv[i * 2 + 1] = gp.getY(i) / 3.2 + 0.5; } geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const rockMat = Mat.rock(0xffffff).clone(); rockMat.vertexColors = true;
    return (this.rockG = { geo, rockMat });
  }
  // ---------- API de edição (Modo Criativo / mapas criados) ----------
  _emptyInstances(){
    const G = this.treeG || (this.treeG = this._treeGeos()), cap = 500;
    const trunkM = Mat.wood(0x6b4a2f), leafM = windify(new THREE.MeshStandardMaterial({ color: 0x4f8a35, roughness: 0.85 }), 0.06, 'leaf');
    const pineM = windify(new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.9 }), 0.05, 'pine');
    const iT = new THREE.InstancedMesh(G.trunk, trunkM, cap), iL = new THREE.InstancedMesh(G.leaf, leafM, cap), iPT = new THREE.InstancedMesh(G.pineT, trunkM, cap), iP = new THREE.InstancedMesh(G.pine, pineM, cap);
    iL.setColorAt(0, new THREE.Color(1, 1, 1)); iP.setColorAt(0, new THREE.Color(1, 1, 1));
    [iT, iL, iPT, iP].forEach(im => { im.count = 0; im.castShadow = im.receiveShadow = true; im.frustumCulled = false; this.group.add(im); this.raycastTargets.push(im); });
    this.edTree = { iT, iL, iPT, iP }; this._treeN = { round: 0, pine: 0 };
    iT.userData.treeKind = iL.userData.treeKind = 'round'; iPT.userData.treeKind = iP.userData.treeKind = 'pine';
    [iT, iL, iPT, iP].forEach(m => m.userData.ed = true);
    const { geo, rockMat } = this._rockGeo();
    const er = this.edRock = new THREE.InstancedMesh(geo, rockMat, cap); er.count = 0; er.castShadow = er.receiveShadow = true; er.frustumCulled = false; er.userData.ed = true;
    this.group.add(er); this.raycastTargets.push(er);
  }
  addTree(x, z, pine, sc, rot){
    const tm = this.edTree, k = pine ? 'pine' : 'round', idx = this._treeN[k]++;
    const y = heightAt(x, z); sc = sc || 1.1;
    const m = new THREE.Matrix4().compose(V(x, y - 0.3, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot || 0, 0)), V(sc, sc, sc));
    const c = new THREE.Color().setHSL(pine ? 0.33 : 0.27 + (Math.random() - 0.5) * 0.06, pine ? 0.45 : 0.5, pine ? 0.28 : 0.36);
    const [a, b] = pine ? [tm.iPT, tm.iP] : [tm.iT, tm.iL];
    a.setMatrixAt(idx, m); b.setMatrixAt(idx, m); b.setColorAt(idx, c);
    a.count = b.count = this._treeN[k]; a.instanceMatrix.needsUpdate = b.instanceMatrix.needsUpdate = true; b.instanceColor.needsUpdate = true;
    const t = { ed: true, x, z, y, sc, hp: 120, alive: true, pine: !!pine, idx, matrix: m, collider: this.physics.addCircle(x, z, 1.1 * sc, y + 14) };
    this.trees.push(t); return t;
  }
  removeTree(t){
    const tm = this.edTree, zero = new THREE.Matrix4().makeScale(0, 0, 0);
    (t.pine ? [tm.iPT, tm.iP] : [tm.iT, tm.iL]).forEach(m => { m.setMatrixAt(t.idx, zero); m.instanceMatrix.needsUpdate = true; });
    t.alive = false; this.physics.removeCircle(t.collider);
  }
  addRock(x, z, sc, rot){
    const im = this.edRock, idx = im.count; sc = sc || 1.2; const y = heightAt(x, z);
    const m = new THREE.Matrix4().compose(V(x, y + 0.2 * sc, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, rot || 0, 0.1)), V(sc * 1.2, sc, sc * 1.1));
    im.setMatrixAt(idx, m); im.count = idx + 1; im.instanceMatrix.needsUpdate = true;
    const r = { ed: true, x, z, y, sc, hp: 180, alive: true, idx, matrix: m, collider: this.physics.addCircle(x, z, 2.2 * sc, y + 2 * sc) };
    this.rocks.push(r); return r;
  }
  removeRock(r){ this.edRock.setMatrixAt(r.idx, new THREE.Matrix4().makeScale(0, 0, 0)); this.edRock.instanceMatrix.needsUpdate = true; r.alive = false; this.physics.removeCircle(r.collider); }
  removeChest(c){ this.group.remove(c.group); if(!c.opened) this.particles.removeEmitter(c.emitter); this.physics.removeCircle(c.collider); this.chests.splice(this.chests.indexOf(c), 1); }
  /** casa isolada (Modo Criativo): devolve um handle para remover */
  addHouse(x, z, w){
    const hp = { x, z, w: w || 2, d: 2, rot: 0 };
    const boxes0 = this.physics.boxes.length, rt0 = this.raycastTargets.length, ch0 = this.chests.length, em0 = this.particles.emitters ? this.particles.emitters.length : 0;
    this.housePlan.push(hp);
    const idx = this.housePlan.length - 1;
    this._buildHouse(hp, idx);
    const h = { hp, group: this.houseGroups[this.houseGroups.length - 1], boxes: this.physics.boxes.slice(boxes0), targets: this.raycastTargets.slice(rt0), chests: this.chests.slice(ch0) };
    return h;
  }
  removeHouse(h){
    this.group.remove(h.group); h.boxes.forEach(b => this.physics.removeBox(b));
    h.targets.forEach(t => { const i = this.raycastTargets.indexOf(t); if(i >= 0) this.raycastTargets.splice(i, 1); });
    h.chests.forEach(c => this.removeChest(c));
    this.housePlan.splice(this.housePlan.indexOf(h.hp), 1);
    if(h.hp.smoke) this.particles.removeEmitter(h.hp.smoke);
    const hi = this.houses.findIndex(x => x.x === h.hp.x && x.z === h.hp.z); if(hi >= 0) this.houses.splice(hi, 1);
  }
  _freeSpot(x, z, r){
    for(const h of this.housePlan) if(Math.abs(x - h.x) < h.w * GRID / 2 + r && Math.abs(z - h.z) < h.d * GRID / 2 + r) return false;
    if(Math.hypot(x + 60, z + 40) < 34 + r * 0.5) return false;
    if(Math.hypot(x, z + 18) < 12 + r) return false;
    if(!this.empty){
      for(const Z of ZONES) if(x > Z[0] - r && x < Z[2] + r && z > Z[1] - r && z < Z[3] + r) return false;
      if(riverDist(x, z) < 11 + r * 0.5) return false;
      if(Math.abs(z + 117.5) < 6 + r && x > -134 && x < -70) return false;
    }
    return true;
  }
  // v18: relva "infinita" na GPU — um ladrilho de instâncias que acompanha a câmara (mod no vertex shader),
  // altura e máscara lidas de um mapa de altura (DataTexture). Custo constante, relva em toda a ilha.
  _grass(){
    const n = { baixa: 5000, media: 10000, alta: 17000, ultra: 26000 }[this.q] || 15000;
    const T = this.q === 'baixa' ? 130 : this.q === 'ultra' ? 190 : 165;
    const blade = new THREE.PlaneGeometry(0.35, 1.6, 1, this.q === 'baixa' ? 2 : 4); blade.translate(0, 0.8, 0);
    const bp = blade.attributes.position; for(let i = 0; i < bp.count; i++){ const y = bp.getY(i); bp.setX(i, bp.getX(i) * (1 - y / 1.7)); bp.setZ(i, y * y * 0.06); }
    const cross = mergeGeometries([blade, blade.clone().rotateY(Math.PI / 2), blade.clone().rotateY(Math.PI / 4)]);
    cross.computeVertexNormals();
    // mapa de altura + máscara (R = altura, G = pode ter relva)
    const N = this.q === 'baixa' ? 256 : 384, SZ = MAP_R * 2.2, O = -SZ / 2, st = SZ / N;
    const data = new Uint16Array(N * N * 4), toH = THREE.DataUtils.toHalfFloat;
    for(let j = 0; j < N; j++) for(let i = 0; i < N; i++){
      const x = O + (i + 0.5) * st, z = O + (j + 0.5) * st, h = heightAt(x, z), d = Math.hypot(x, z);
      let ok = d < MAP_R - 34 && h > -0.6 && this._freeSpot(x, z, 1);
      if(ok && !this.empty) ok = Math.hypot(x - DESERT.x, z - DESERT.z) > DESERT.r - 6 && h < 32 && Math.hypot(x - VOLCANO.x, z - VOLCANO.z) > VOLCANO.r * 0.78 && !(Math.abs(x - 500) < 60 && Math.abs(z + 30) < 50);
      const k = (j * N + i) * 4; data[k] = toH(h - 0.05); data[k + 1] = toH(ok ? 1 : 0); data[k + 2] = 0; data[k + 3] = toH(1);
    }
    const hm = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
    hm.magFilter = hm.minFilter = THREE.LinearFilter; hm.wrapS = hm.wrapT = THREE.ClampToEdgeWrapping; hm.needsUpdate = true;
    const mat = windify(new THREE.MeshStandardMaterial({ color: 0x6d9c3f, roughness: 0.9, side: THREE.DoubleSide }), 0.55, 'grass', [0.5, 1.2, 0.9]);
    const U = this.grassU = { uCam: { value: new THREE.Vector3() }, uHM: { value: hm }, uHMp: { value: new THREE.Vector4(O, O, SZ, T) } };
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh) => {
      prev(sh); Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec3 uCam; uniform sampler2D uHM; uniform vec4 uHMp;')
        .replace('#include <project_vertex>', `
          #ifdef USE_INSTANCING
          {
            vec3 o = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]); float TT = uHMp.w;
            vec2 wp = mod(o.xz - uCam.xz + 0.5 * TT, TT) - 0.5 * TT + uCam.xz;
            vec4 hmv = texture2D(uHM, (wp - uHMp.xy) / uHMp.z);
            float fade = 1.0 - smoothstep(TT * 0.3, TT * 0.5, length(wp - uCam.xz));
            float keep = step(0.5, hmv.g) * fade;
            mat3 RS = mat3(instanceMatrix);
            transformed = transformed * keep + inverse(RS) * vec3(wp.x - o.x, hmv.r - o.y, wp.y - o.z);
          }
          #endif
          #include <project_vertex>`);
    };
    mat.customProgramCacheKey = () => 'grass_v18';
    const im = new THREE.InstancedMesh(cross, mat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    for(let i = 0; i < n; i++){
      const x = (rnd() - 0.5) * T, z = (rnd() - 0.5) * T, sc = rr(0.7, 1.5);
      p.set(x, 0, z); q.setFromEuler(new THREE.Euler(0, rnd() * 6.28, 0)); s.set(sc, sc * rr(0.8, 1.3), sc); m.compose(p, q, s);
      im.setMatrixAt(i, m); c.setHSL(0.24 + rr(-0.03, 0.04), 0.5, 0.3 + rr(-0.05, 0.08)); im.setColorAt(i, c);
    }
    im.frustumCulled = false; im.receiveShadow = true; im.castShadow = false; im.userData.noProbe = true;
    this.group.add(im); this.grass = im;
  }
  // v18: lago de lava na cratera (shader animado, emissivo → bloom) + fumo e brasas
  _volcano(){
    const V0 = VOLCANO, U = this.lavaU = { value: 0 };
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uT = U;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vLW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLW = position.xy;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uT; varying vec2 vLW;\nfloat hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\nfloat nz(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hh(i), hh(i + vec2(1, 0)), f.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), f.x), f.y); }')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 q = vLW * 0.22; float n = nz(q + vec2(uT * 0.15, uT * 0.08)) * 0.6 + nz(q * 2.3 - vec2(uT * 0.2, 0.0)) * 0.3 + nz(q * 5.0 + uT * 0.3) * 0.1;
          float crust = smoothstep(0.52, 0.62, n);
          vec3 hot = mix(vec3(3.2, 1.1, 0.12), vec3(4.0, 2.4, 0.5), smoothstep(0.2, 0.45, n));
          diffuseColor.rgb = mix(hot, vec3(0.09, 0.05, 0.04), crust);`);
    };
    mat.customProgramCacheKey = () => 'lava_v18';
    const lava = new THREE.Mesh(new THREE.CircleGeometry(V0.cr + 4, 48), mat);
    lava.rotation.x = -Math.PI / 2; lava.position.set(V0.x, LAVA_Y, V0.z); lava.userData.noProbe = true; this.group.add(lava); this.lava = lava;
    this.particles.addEmitter({ type: 'dust', rate: 5, pos: V(V0.x, LAVA_Y + 6, V0.z), opt: { color: 0x3f3a36, n: 1, power: 2.6 } });
    this.particles.addEmitter({ type: 'fire', rate: 8, pos: V(V0.x + 6, LAVA_Y + 0.5, V0.z - 4), opt: { size: 2.2 } });
    this.particles.addEmitter({ type: 'fire', rate: 6, pos: V(V0.x - 7, LAVA_Y + 0.5, V0.z + 5), opt: { size: 1.8 } });
    // baús na borda da cratera
    for(const a of [0.6, 2.8, 4.6]){ const x = V0.x + Math.cos(a) * (V0.cr + 14), z = V0.z + Math.sin(a) * (V0.cr + 14); this.addChest(x, z, -a, heightAt(x, z)); }
  }
  // v16: fita de água do Rio Serpente (mesmo material do lago)
  _river(){
    const curve = new THREE.CatmullRomCurve3(RIVER.map(([x, z]) => V(x, WATER_Y, z)));
    const N = 90, W = 11, pos = [], uv = [], idx = [];
    for(let i = 0; i <= N; i++){
      const t = i / N * 0.97, p = curve.getPointAt(t), tg = curve.getTangentAt(t), nx = -tg.z, nz = tg.x, l = Math.hypot(nx, nz) || 1;
      pos.push(p.x + nx / l * W, WATER_Y, p.z + nz / l * W, p.x - nx / l * W, WATER_Y, p.z - nz / l * W);
      uv.push(0, t * 12, 1, t * 12);
      if(i < N){ const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    if(g.attributes.normal.getY(0) < 0){ idx.reverse(); g.setIndex(idx); g.computeVertexNormals(); }
    this.river = new THREE.Mesh(g, this.lake.material); this.river.userData.noProbe = true; this.river.receiveShadow = true;
    this.group.add(this.river);
    this.soundSpots.push({ id: 'river', name: 'water', pos: V(-102, 0, -118), vol: 0.45 });
  }
  // v16: arbustos (esconderijo), flores, palmeiras e catos — tudo instanciado
  _props(){
    const q = this.q, M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();
    const inst = (geo, mat, list, opts) => {
      if(!list.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((o, i) => { P.set(o.x, o.y, o.z); Q.setFromEuler(E.set(0, o.r, 0)); S.setScalar(o.s); M4.compose(P, Q, S); im.setMatrixAt(i, M4); });
      im.castShadow = !!opts.cast; im.receiveShadow = true; if(opts.noProbe) im.userData.noProbe = true;
      const { meshes, map } = opts.chunk ? chunkify(im, CELL) : { meshes: [im], map: list.map((_, i) => ({ m: im, i })) };
      if(!opts.chunk){ im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
      list.forEach((o, i) => { o._im = map[i].m; o._idx = map[i].i; });
      for(const cm of meshes){ this.group.add(cm); if(opts.target) this.raycastTargets.push(cm); }
      return meshes;
    };
    const vmat = Mat.vcolor('veg', { roughness: 0.85, metalness: 0 });
    const pick = (n, fn, r) => { const out = []; for(let i = 0; i < n * 4 && out.length < n; i++){ const p = fn(); if(p && this._freeSpot(p[0], p[1], r || 3)) out.push({ x: p[0], z: p[1], y: heightAt(p[0], p[1]), r: rnd() * 6.28, s: rr(0.8, 1.25) }); } return out; };
    const inDesert = (x, z) => Math.hypot(x - DESERT.x, z - DESERT.z) < DESERT.r - 8;
    const jungle = () => { const a = rnd() * 6.28, d = Math.sqrt(rnd()) * 75; return [40 + Math.cos(a) * d, 480 + Math.sin(a) * d]; };
    const ring = (r0, r1) => () => { const a = rnd() * Math.PI * 2, d = r0 + Math.sqrt(rnd()) * (r1 - r0); return [Math.cos(a) * d, Math.sin(a) * d]; };
    // arbustos: bloqueiam a visão (entram no raycast da IA? não — só visual), sem colisão, como no Fortnite
    const nearV = (x, z) => Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < VOLCANO.r * 0.85;
    const bushes = pick(q === 'baixa' ? 120 : 260, () => { const p = rnd() < 0.18 ? jungle() : ring(30, MAP_R - 50)(); return inDesert(p[0], p[1]) || nearV(p[0], p[1]) || heightAt(p[0], p[1]) > 32 ? null : p; }, 2);
    this.bushMesh = inst(bushGeo(), windify(vmat.clone(), 0.12, 'bush'), bushes, { cast: q !== 'baixa', chunk: true });
    this.bushes = bushes;
    const flowers = pick(q === 'baixa' ? 260 : 760, () => { const p = ring(20, MAP_R - 60)(); return inDesert(p[0], p[1]) || nearV(p[0], p[1]) ? null : p; }, 1);
    inst(flowerGeo(), windify(vmat.clone(), 0.5, 'flower'), flowers, { noProbe: true });
    // catos (colisão + coleta de madeira)
    const cacti = pick(40, () => { const a = rnd() * 6.28, d = Math.sqrt(rnd()) * (DESERT.r - 12); return [DESERT.x + Math.cos(a) * d, DESERT.z + Math.sin(a) * d]; }, 4);
    const cm = inst(cactusGeo(), vmat, cacti, { cast: true, target: true });
    // palmeiras na praia e no deserto
    const palms = pick(q === 'baixa' ? 60 : 80, () => { if(rnd() < 0.3) return jungle(); if(rnd() < 0.3){ const a = rnd() * 6.28, d = Math.sqrt(rnd()) * (DESERT.r - 15); return [DESERT.x + Math.cos(a) * d, DESERT.z + Math.sin(a) * d]; } const a = rnd() * 6.28, d = MAP_R - 42 + rnd() * 14; return [Math.cos(a) * d, Math.sin(a) * d]; }, 6);
    const pm = inst(palmGeo(), windify(vmat.clone(), 0.04, 'palm'), palms, { cast: true, target: true });
    this.extraRes = [];
    const reg = (ims, list, kind, hp, rad, top) => { if(!ims) return; ims.forEach(im => im.userData.extraRes = true); list.forEach((o, i) => this.extraRes.push({ im: o._im, idx: o._idx, kind, hp, alive: true, x: o.x, y: o.y, z: o.z, collider: this.physics.addCircle(o.x, o.z, rad * o.s, o.y + top) })); };
    reg(cm, cacti, 'wood', 80, 1.1, 9); reg(pm, palms, 'wood', 120, 0.7, 15);
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
    // v18: fogueiras extra sem luz dinâmica (brasas emissivas + bloom)
    for(const [x, z] of (this.poi && this.poi.fires2) || []){
      const y = heightAt(x, z), g = new THREE.Group(); g.position.set(x, y, z);
      for(let i = 0; i < 4; i++){ const l = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 3.2, 8), Mat.wood(0x4a2f1c)); l.rotation.set(Math.PI / 2 - 0.25, i * Math.PI / 2, 0); l.position.y = 0.4; g.add(l); }
      const ember = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), Mat.emissive(0xff6a1a, 3)); g.add(ember);
      this.group.add(g);
      const pos = V(x, y + 0.8, z);
      this.particles.addEmitter({ type: 'fire', rate: 22, pos: pos.clone(), opt: { size: 1.5 } });
      this.physics.addCircle(x, z, 1.8, y + 1);
      this.fires.push({ light: null, pos, base: 0 });
      this.soundSpots.push({ id: 'fire' + x, name: 'fire', pos, vol: 0.6 });
    }
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
      S.shrinkT = 0; S.shrinkDur = S.phase <= 2 ? 26 : 18; S.dmg = S.phase; ev = 'shrink';
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
    if(obj.userData.bank) return obj.userData.bank.hit(obj, instanceId, 50, point, true);
    if(obj.userData.extraRes){
      const it = this.extraRes.find(e => e.im === obj && e.idx === instanceId); if(!it || !it.alive) return null;
      it.hp -= 35; this.particles.emit('wood', point, { count: 10 });
      if(it.hp <= 0){ it.alive = false; obj.setMatrixAt(it.idx, new THREE.Matrix4().makeScale(0, 0, 0)); obj.instanceMatrix.needsUpdate = true; this.physics.removeCircle(it.collider); this.particles.emit('wood', point, { count: 30 }); }
      return { kind: 'wood', amount: 9, destroyed: !it.alive };
    }
    let list = null;
    const ed = !!obj.userData.ed, isRock = !!obj.userData.rock || obj === this.edRock;
    if(obj.userData.map){ const t = obj.userData.map[instanceId]; list = t ? [t] : null; }
    else
    if(isRock) list = this.rocks.filter(r => r.idx === instanceId && !!r.ed === ed);
    else if(obj.userData.treeKind) list = this.trees.filter(t => t.idx === instanceId && !!t.ed === ed && t.pine === (obj.userData.treeKind === 'pine'));
    const it = list && list[0]; if(!it || !it.alive) return null;
    it.hp -= 35;
    this.particles.emit(isRock ? 'stone' : 'wood', point, { count: 10 });
    if(it.hp <= 0){
      it.alive = false;
      const zero = new THREE.Matrix4().makeScale(0, 0, 0);
      if(it.parts) it.parts.forEach(e => { e.m.setMatrixAt(e.i, zero); e.m.instanceMatrix.needsUpdate = true; });
      else if(isRock){ obj.setMatrixAt(it.idx, zero); obj.instanceMatrix.needsUpdate = true; }
      else { const tm = ed ? this.edTree : this.treeMeshes; const a = it.pine ? [tm.iPT, tm.iP] : [tm.iT, tm.iL]; a.forEach(m => { m.setMatrixAt(it.idx, zero); m.instanceMatrix.needsUpdate = true; }); }
      it.collider.r = 0; it.collider.top = -1e9;
      this.particles.emit(isRock ? 'stone' : 'wood', point.clone().setY(it.y + 4), { count: 40 });
      this.particles.emit('dust', point.clone().setY(it.y + 2), { count: 20, size: 4 });
    }
    return { kind: isRock ? 'stone' : 'wood', amount: isRock ? 12 : 10, destroyed: !it.alive };
  }
  // ---------- loot no chão ----------
  spawnPickup(type, pos, amount, opts){
    opts = opts || {};
    const g = new THREE.Group();
    const colors = { ammo: 0x94a3b8, shield: 0x3b82f6, potion: 0x3b82f6, medkit: 0xef4444, wood: 0xa16207, stone: 0x9ca3af, metal: 0x64748b, grenade: 0x65a30d, rift: 0xa855f7, impulso: 0x3b82f6, escudo: 0x38bdf8, fumo: 0x9ca3af, arbusto: 0x4ade80 };
    const isGun = GUNS.includes(type), rar = isGun ? (opts.rar ?? 0) : -1;
    const c = isGun ? RARITY[rar].color : (colors[type] || 0xffffff);
    let mesh;
    if(type === 'potion' || type === 'shield'){ mesh = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), Mat.glass(0x60a5fa)); const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.6, 10), Mat.glass(0x60a5fa)); neck.position.y = 0.8; g.add(neck); }
    else if(type === 'medkit'){ mesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 0.6), Mat.paint(0xf1f5f9)); const cr = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 0.62), Mat.paint(0xef4444)); const cr2 = cr.clone(); cr2.rotation.z = Math.PI / 2; g.add(cr, cr2); }
    else if(isGun){
      // v16: modelo real da arma (reutiliza um modelo em cache por tipo → clone partilha geometrias/materiais)
      this._gunCache = this._gunCache || {};
      if(!this._gunCache[type]) this._gunCache[type] = createWeapon(type).group;
      mesh = this._gunCache[type].clone(); mesh.scale.multiplyScalar(1.5); mesh.rotation.set(0, 0, 0.25);
    }
    else if(type === 'grenade'){ mesh = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), Mat.paint(0x4d7c0f)); const pin = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 12), Mat.metal(0xd1d5db, 0.3)); pin.position.y = 0.65; g.add(pin); }
    else if(type === 'impulso'){ mesh = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), Mat.paint(0x2563eb)); const rg = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.08, 6, 20), Mat.emissive(0x93c5fd, 2.5)); g.add(rg); }
    else if(type === 'escudo'){ mesh = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), Mat.glass(0x38bdf8)); const ck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.4, 8), Mat.wood(0x92400e)); ck.position.y = 0.7; g.add(ck); }
    else if(type === 'fumo'){ mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.1, 14), Mat.metal(0x6b7280, 0.4)); const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.25, 10), Mat.paint(0xf5f5f4)); cap.position.y = 0.65; g.add(cap); }
    else if(type === 'arbusto'){ mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), Mat.cloth(0x4d7c0f, 'fabric')); }
    else if(type === 'rift'){ mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(0.45, 0.16, 48, 8), Mat.emissive(0xc084fc, 2.2)); }
    else mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.8), Mat.paint(c));
    g.add(mesh);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.5, 32), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = -1.1; g.add(ring);
    ring.material.blending = THREE.AdditiveBlending;
    // v16: feixe de loot (raridade) nas armas
    if(isGun && rar >= 1){
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, 14, 12, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.22 + rar * 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 5.8; beam.userData.noProbe = true; g.add(beam);
    }
    g.position.copy(pos); g.position.y = opts.y !== undefined ? opts.y : heightAt(pos.x, pos.z) + 1.5;
    g.traverse(o => { if(o.isMesh && o !== ring) o.castShadow = true; });
    this.group.add(g);
    const pk = { type, amount: amount || 1, group: g, pos: g.position.clone(), t: Math.random() * 6, rar: Math.max(0, rar) };
    this.pickups.push(pk); return pk;
  }
  removePickup(pk){ this.group.remove(pk.group); this.pickups.splice(this.pickups.indexOf(pk), 1); }
  // ---------- update ----------
  update(dt, camera){
    this.t += dt;
    WIND_U.uTime.value = this.t;
    WIND_U.uWind.value.set(Wind.dir.x * Wind.strength * 0.06, 0, Wind.dir.z * Wind.strength * 0.06);
    if(this.waterNormal){ this.waterNormal.offset.x += dt * 0.02; this.waterNormal.offset.y += dt * 0.013; }
    for(const f of this.fires) if(f.light) f.light.intensity = f.base * (0.8 + Math.sin(this.t * 13) * 0.08 + Math.sin(this.t * 7.3) * 0.1 + Math.random() * 0.06);
    for(const c of this.chests){
      if(c.openT > 0 && c.openT < 1){ c.openT = Math.min(1, c.openT + dt * 2.5); c.lid.rotation.x = -1.9 * (1 - Math.pow(1 - c.openT, 3)); c.glow.intensity = 3 + (1 - c.openT) * 12; }
      else if(!c.opened) c.glow.intensity = 2.5 + Math.sin(this.t * 3) * 0.8;
      else c.glow.intensity *= 0.97;
    }
    // v16: só anima/mostra loot perto da câmara (o resto fica invisível → menos draw calls)
    const cp = camera ? camera.position : null;
    for(const p of this.pickups){
      if(cp){ const dx = p.pos.x - cp.x, dz = p.pos.z - cp.z, vis = dx * dx + dz * dz < 190 * 190; p.group.visible = vis; if(!vis) continue; }
      p.t += dt; p.group.rotation.y += dt * 1.5; p.group.position.y = p.pos.y + Math.sin(p.t * 2) * 0.25;
    }
    if(this.poi && this.poi.beam) this.poi.beam.rotation.y += dt * 0.7;
    // v18: moinhos, radar, gema do templo, luz da antena, lava
    if(this.poi && this.poi.spinners) for(const sp of this.poi.spinners){ sp.o.rotation[sp.ax] += dt * sp.sp; if(sp.bob) sp.o.position.y = sp.bob + Math.sin(this.t * 1.6) * 0.4; }
    if(this.poi && this.poi.blinks) for(const b of this.poi.blinks) b.visible = (this.t % 1.4) < 0.7;
    if(this.lavaU) this.lavaU.value = this.t;
    if(this.grassU && camera){ this.grassU.uCam.value.copy(camera.position); }
    // v18: culling por distância dos grupos pequenos (baús, adereços) + emissores de partículas longe da câmara
    if(camera){
      this.particles.camPos = camera.position;
      if(!this._far){
        this._far = []; const bs = new THREE.Box3(), sp = new THREE.Sphere();
        const pk = new Set(this.pickups.map(p => p.group)); for(const c of this.group.children){ if(!c.isGroup || !c.children.length || pk.has(c)) continue; bs.setFromObject(c); if(bs.isEmpty()) continue; bs.getBoundingSphere(sp); if(sp.radius < 14) this._far.push({ o: c, x: sp.center.x, z: sp.center.z, r: sp.radius, v: c.visible }); }
        this._farI = 0;
      }
      const D = this.q === 'baixa' ? 190 : 280, cx = camera.position.x, cz = camera.position.z, L = this._far, n = Math.min(L.length, 120);
      for(let k = 0; k < n; k++){ const e = L[this._farI = (this._farI + 1) % L.length]; const d = Math.hypot(e.x - cx, e.z - cz) - e.r; const vis = d < D; if(vis !== e.v){ e.v = vis; e.o.visible = vis; } }
    }
  }
}
