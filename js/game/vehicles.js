// ============================================================
// v22: VEÍCULOS — desportivo, SUV, buggy, mota, blindado (e o quadriciclo antigo)
//  • modelos low-poly estilizados com cores vivas; cada veículo = 1 malha de carroçaria
//    (cores por vértice) + vidros + luzes + rodas → ~8 desenhos por veículo
//  • física "raycast por roda": cada roda procura o chão por baixo dela (groundAt), a mola +
//    amortecedor dessa roda calcula a compressão; a inclinação (pitch/roll) e a altura da carroçaria
//    saem do plano das 4 rodas. Aderência lateral, travão de mão (derrapagem), turbo de derrapagem,
//    nitro, capotamento (centro de gravidade alto + curva rápida / encosta) e mota que inclina.
//  • som do motor sintetizado (2 osciladores + filtro, tom pela rotação), travagem, buzina, embate
// ============================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Mat } from '../engine/materials.js';

export const VEHICLES = {
  quad:       { n: 'Quadriciclo', top: 62, acc: 46, grip: 9,  steer: 2.0, cog: 0.35, roll: 1.05, hp: 300,  radius: 2.2, wheels: [[-1.9, 1.75], [1.9, 1.75], [-1.9, -1.7], [1.9, -1.7]], wr: 0.88, susp: 0.45, seat: 0.6, color: 0xf97316 },
  desportivo: { n: 'Desportivo',  top: 92, acc: 52, grip: 11, steer: 1.8, cog: 0.25, roll: 1.25, hp: 450,  radius: 2.3, wheels: [[-1.75, 2.35], [1.75, 2.35], [-1.75, -2.25], [1.75, -2.25]], wr: 0.78, susp: 0.3, seat: 0.15, color: 0xef4444 },
  suv:        { n: 'SUV',         top: 70, acc: 40, grip: 8,  steer: 1.6, cog: 0.75, roll: 0.75, hp: 700,  radius: 2.5, wheels: [[-1.95, 2.5], [1.95, 2.5], [-1.95, -2.4], [1.95, -2.4]], wr: 0.98, susp: 0.6, seat: 1.15, color: 0x2563eb },
  buggy:      { n: 'Buggy',       top: 78, acc: 55, grip: 7,  steer: 2.1, cog: 0.4,  roll: 1.0,  hp: 350,  radius: 2.3, wheels: [[-1.9, 2.1], [1.9, 2.1], [-2.0, -1.9], [2.0, -1.9]], wr: 1.0, susp: 0.75, seat: 0.75, color: 0xfacc15 },
  mota:       { n: 'Mota',        top: 96, acc: 60, grip: 9,  steer: 2.3, cog: 0.5,  roll: 9,    hp: 200,  radius: 1.3, wheels: [[0, 1.85], [0, -1.75]], wr: 0.82, susp: 0.4, seat: 1.05, color: 0x22c55e, bike: true },
  blindado:   { n: 'Blindado',    top: 55, acc: 30, grip: 10, steer: 1.3, cog: 0.6,  roll: 1.1,  hp: 1500, radius: 2.8, wheels: [[-2.2, 2.8], [2.2, 2.8], [-2.2, 0], [2.2, 0], [-2.2, -2.8], [2.2, -2.8]], wr: 1.05, susp: 0.5, seat: 1.4, color: 0x4d7c0f }
};
export const VEH_IDS = Object.keys(VEHICLES);

// ---------------- modelos ----------------
const _c = new THREE.Color();
function part(list, geo, color, x, y, z, rx, ry, rz){
  let g = geo.index ? geo.toNonIndexed() : geo;
  for(const k of Object.keys(g.attributes)) if(!['position', 'normal'].includes(k)) g.deleteAttribute(k);
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new THREE.Vector3(1, 1, 1)));
  _c.set(color); const n = g.attributes.position.count, a = new Float32Array(n * 3); for(let i = 0; i < n; i++){ a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); list.push(g);
}
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d), C = (r1, r2, h, n) => new THREE.CylinderGeometry(r1, r2, h, n || 8);
/** cunha (para capôs/para-brisas inclinados): caixa com o topo da frente rebaixado */
function wedge(w, h, d, drop){ const g = B(w, h, d), p = g.attributes.position; for(let i = 0; i < p.count; i++) if(p.getY(i) > 0 && p.getZ(i) > 0) p.setY(i, p.getY(i) - drop); g.computeVertexNormals(); return g; }
let _bodyMat, _glassMat, _lightMat, _tailMat, _wheelMat;
function mats(){
  if(_bodyMat) return;
  _bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.25 });
  _glassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.82 });
  _lightMat = Mat.emissive(0xfff7d6, 2.6); _tailMat = Mat.emissive(0xef4444, 2.2);
  _wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.2 });
}
let _wheelGeo = {};
function wheelGeo(r, w){
  const k = r + ':' + w; if(_wheelGeo[k]) return _wheelGeo[k];
  const L = [];
  part(L, C(r, r, w, 16), 0x111111, 0, 0, 0);
  for(let i = 0; i < 12; i++){ const a = i / 12 * Math.PI * 2; part(L, B(r * 0.24, w * 1.02, r * 0.22), 0x1c1c1c, Math.cos(a) * r, 0, Math.sin(a) * r, 0, -a, 0); }
  part(L, C(r * 0.55, r * 0.55, w * 1.06, 10), 0xd1d5db, 0, 0, 0);
  part(L, C(r * 0.18, r * 0.18, w * 1.12, 8), 0x374151, 0, 0, 0);
  for(let i = 0; i < 5; i++){ const a = i / 5 * Math.PI * 2; part(L, B(r * 0.12, w * 1.08, r * 0.5), 0x9ca3af, Math.cos(a) * r * 0.3, 0, Math.sin(a) * r * 0.3, 0, -a, 0); }
  return (_wheelGeo[k] = mergeGeometries(L));
}
export function vehicleMesh(type, color){
  mats();
  const S = VEHICLES[type] || VEHICLES.quad, col = color || S.color;
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const L = [], G = [], H = [], T = [];   // carroçaria, vidros, faróis, traseiras
  const dark = 0x1f2937, black = 0x111827, chrome = 0xe5e7eb, white = 0xf8fafc;
  if(type === 'desportivo'){
    part(L, B(3.6, 0.7, 6.0), col, 0, 1.0, 0);
    part(L, wedge(3.5, 0.6, 2.2, 0.45), col, 0, 1.6, 1.9);
    part(L, B(3.5, 0.55, 1.8), col, 0, 1.6, -2.1);
    part(G, wedge(3.0, 0.9, 2.6, 0.75), 0, 0, 2.15, 0.15);
    part(L, B(3.0, 0.18, 1.3), col, 0, 2.62, -0.35);
    part(L, B(3.7, 0.12, 0.8), black, 0, 2.15, -2.85); for(const sx of [-1.4, 1.4]) part(L, B(0.12, 0.5, 0.25), black, sx, 1.9, -2.8);   // asa traseira
    part(L, B(3.7, 0.35, 0.5), black, 0, 0.75, 3.0); part(L, B(3.7, 0.35, 0.4), black, 0, 0.75, -3.0);
    for(const sx of [-1, 1]){ part(L, B(0.15, 0.25, 2.6), white, sx * 1.81, 1.15, 0); part(L, B(0.3, 0.12, 0.2), black, sx * 1.9, 2.0, 1.1); }
    part(L, B(0.5, 0.06, 5.9), white, 0.55, 1.37, 0); part(L, B(0.5, 0.06, 5.9), white, -0.55, 1.37, 0);   // faixas de corrida
    for(const sx of [-1.25, 1.25]){ part(H, B(0.8, 0.22, 0.1), 0, sx, 1.35, 3.02); part(T, B(0.9, 0.2, 0.1), 0, sx, 1.45, -3.02); }
    for(const sx of [-0.5, 0.5]) part(L, C(0.13, 0.13, 0.5, 8), chrome, sx, 0.7, -3.1, Math.PI / 2);
  } else if(type === 'suv'){
    part(L, B(3.9, 1.3, 6.2), col, 0, 1.55, 0);
    part(L, B(3.8, 1.2, 4.2), col, 0, 2.8, -0.6);
    part(G, B(3.6, 0.9, 4.0), 0, 0, 2.85, -0.6); part(G, wedge(3.6, 0.95, 0.4, 0.3), 0, 0, 2.85, 1.55);
    part(L, B(3.85, 0.15, 4.1), col, 0, 3.45, -0.6);
    for(const z of [-2, -0.6, 0.8]) part(L, B(3.4, 0.12, 0.12), black, 0, 3.6, z); for(const sx of [-1.6, 1.6]) part(L, B(0.12, 0.15, 3.6), black, sx, 3.6, -0.6);
    part(L, B(4.0, 0.5, 0.5), black, 0, 1.05, 3.15); part(L, B(4.0, 0.5, 0.5), black, 0, 1.05, -3.15);
    part(L, B(2.6, 0.7, 0.12), dark, 0, 1.7, 3.12); for(let i = 0; i < 5; i++) part(L, B(0.1, 0.6, 0.06), chrome, -1 + i * 0.5, 1.7, 3.18);
    part(L, C(0.8, 0.8, 0.35, 14), black, 0, 2.1, -3.25, Math.PI / 2);   // pneu suplente
    for(const sx of [-1, 1]){ part(L, B(0.2, 0.5, 6.0), dark, sx * 1.98, 1.0, 0); part(L, B(0.5, 0.12, 2.2), black, sx * 2.05, 0.9, 0); }
    for(const sx of [-1.45, 1.45]){ part(H, B(0.7, 0.4, 0.1), 0, sx, 1.85, 3.14); part(T, B(0.5, 0.7, 0.1), 0, sx, 2.0, -3.12); }
  } else if(type === 'buggy'){
    part(L, B(2.6, 0.45, 5.0), dark, 0, 1.15, 0);
    part(L, wedge(2.8, 0.6, 1.8, 0.35), col, 0, 1.55, 1.9);
    part(L, B(2.4, 0.9, 1.6), 0x52525b, 0, 1.7, -1.9);   // motor exposto
    for(let i = 0; i < 4; i++) part(L, C(0.12, 0.12, 0.9, 8), chrome, -0.6 + i * 0.4, 2.3, -2.2, 0.3);
    part(L, B(1.6, 0.5, 1.4), black, 0, 1.6, -0.3); part(L, B(1.5, 1.2, 0.25), black, 0, 2.2, -0.95, -0.15);
    const tube = (a, b) => { const d = new THREE.Vector3().subVectors(b, a), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()), e = new THREE.Euler().setFromQuaternion(q); part(L, C(0.09, 0.09, d.length(), 6), col, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, e.x, e.y, e.z); };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    for(const sx of [-1.2, 1.2]){ tube(V(sx, 1.3, 1.2), V(sx * 0.9, 3.3, 0.2)); tube(V(sx * 0.9, 3.3, 0.2), V(sx * 0.9, 3.3, -1.2)); tube(V(sx * 0.9, 3.3, -1.2), V(sx, 1.3, -1.4)); tube(V(sx, 1.3, 1.2), V(sx * 1.1, 1.0, 2.7)); }
    tube(V(-1.08, 3.3, 0.2), V(1.08, 3.3, 0.2)); tube(V(-1.08, 3.3, -1.2), V(1.08, 3.3, -1.2)); tube(V(-1.1, 1.3, 1.2), V(1.1, 1.3, 1.2));
    part(L, B(2.2, 0.1, 0.6), black, 0, 3.4, -0.5);
    for(const sx of [-1, 1]){ part(L, B(0.9, 0.12, 1.5), col, sx * 1.95, 2.05, 2.1, 0.2); part(L, B(1.0, 0.12, 1.7), col, sx * 2.05, 2.15, -1.9, -0.2); }
    for(const sx of [-0.7, 0.7]) part(H, C(0.3, 0.3, 0.15, 12), 0, sx, 3.45, 0.35, Math.PI / 2);
    for(const sx of [-0.9, 0.9]) part(T, B(0.4, 0.2, 0.08), 0, sx, 1.4, -2.72);
  } else if(type === 'mota'){
    part(L, B(0.7, 0.7, 2.6), col, 0, 1.45, 0.1);
    part(L, wedge(0.9, 0.9, 1.2, 0.5), col, 0, 1.95, 1.0);
    part(L, B(0.6, 0.35, 1.5), black, 0, 1.95, -0.6);
    part(L, B(0.75, 0.6, 1.0), 0x52525b, 0, 1.0, 0.1);
    part(L, C(0.12, 0.15, 1.3, 8), chrome, 0.35, 0.95, -1.0, Math.PI / 2 - 0.2);
    for(const sx of [-0.18, 0.18]) part(L, C(0.06, 0.06, 1.3, 6), chrome, sx, 1.4, 1.75, 0.45);
    part(L, C(0.05, 0.05, 1.5, 6), black, 0, 2.15, 1.35, 0, 0, Math.PI / 2);   // guiador
    part(L, B(0.45, 0.12, 0.8), col, 0, 2.0, -1.7, -0.2);
    part(G, wedge(0.8, 0.5, 0.3, 0.2), 0, 0, 2.45, 1.45);
    part(H, C(0.22, 0.22, 0.12, 12), 0, 0, 2.05, 1.65, Math.PI / 2); part(T, B(0.35, 0.15, 0.08), 0, 0, 1.95, -2.1);
  } else if(type === 'blindado'){
    part(L, B(4.4, 1.6, 7.8), col, 0, 2.0, 0);
    part(L, wedge(4.2, 1.0, 2.0, 0.8), col, 0, 3.2, 2.6);
    part(L, B(4.2, 1.2, 5.2), col, 0, 3.3, -1.1);
    part(L, C(1.1, 1.3, 0.7, 8), col, 0, 4.25, -1.2);
    part(L, C(0.18, 0.18, 2.6, 8), dark, 0, 4.35, 0.4, Math.PI / 2);   // canhão (decorativo)
    for(const sx of [-1, 1]){ part(L, B(0.35, 1.0, 7.6), dark, sx * 2.25, 1.9, 0); for(let i = 0; i < 6; i++) part(L, C(0.12, 0.12, 0.1, 6), chrome, sx * 2.44, 2.4, -3 + i * 1.2, 0, 0, Math.PI / 2); }
    part(L, B(4.5, 0.6, 0.6), black, 0, 1.3, 4.0); part(L, B(4.5, 0.6, 0.6), black, 0, 1.3, -4.0);
    part(G, B(3.0, 0.35, 0.1), 0, 0, 3.4, 3.62);
    for(let i = 0; i < 3; i++) part(L, B(3.6, 0.08, 0.6), 0x365314, 0, 4.0, -2.8 + i * 1.2);
    for(const sx of [-1.6, 1.6]){ part(H, B(0.5, 0.3, 0.1), 0, sx, 2.4, 3.92); part(T, B(0.4, 0.3, 0.1), 0, sx, 2.4, -3.92); }
  } else { // quad
    part(L, B(2.2, 0.35, 5.0), dark, 0, 0.95, 0); part(L, B(2.9, 0.55, 3.0), col, 0, 1.35, 0.2); part(L, wedge(2.4, 0.45, 1.3, 0.25), col, 0, 1.75, 1.3);
    for(const sx of [-1, 1]){ part(L, B(1.15, 0.22, 2.0), col, sx * 1.85, 1.95, 1.75, 0.18); part(L, B(1.15, 0.22, 2.0), col, sx * 1.85, 1.95, -1.75, -0.18); part(L, C(0.12, 0.12, 0.8, 8), 0xfacc15, sx * 1.55, 1.55, 1.75, 0, 0, sx * 0.5); part(L, C(0.12, 0.12, 0.8, 8), 0xfacc15, sx * 1.55, 1.55, -1.7, 0, 0, sx * 0.5); }
    part(L, B(1.7, 0.45, 1.5), black, 0, 1.85, -0.55); part(L, B(2.6, 0.4, 0.5), black, 0, 1.05, 2.75); part(L, B(2.4, 0.7, 0.9), black, 0, 1.75, -2.4);
    for(const sx of [-0.85, 0.85]) part(H, C(0.24, 0.24, 0.12, 12), 0, sx, 1.75, 2.0, Math.PI / 2 - 0.2);
    for(const sx of [-0.95, 0.95]) part(T, B(0.4, 0.2, 0.08), 0, sx, 1.8, -2.87);
  }
  const add = (list, mat, cast) => { if(!list.length) return null; const m = new THREE.Mesh(mergeGeometries(list), mat); m.castShadow = cast; body.add(m); return m; };
  add(L, _bodyMat, true); add(G, _glassMat, false); add(H, _lightMat, false); add(T, _tailMat, false);
  // volante / guiador (gira com a direção)
  let wheelS = null;
  if(type !== 'mota'){ wheelS = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.06, 6, 14), Mat.polymer(0x111827)); const sy = { desportivo: 2.1, suv: 2.85, buggy: 2.25, blindado: 3.3 }[type] || 2.75; wheelS.position.set(0, sy, { desportivo: 0.9, suv: 1.2, buggy: 0.75, blindado: 1.6 }[type] || 0.55); wheelS.rotation.x = 0.9; body.add(wheelS); }
  // rodas
  const wheels = [], steer = [], wg = wheelGeo(S.wr, S.bike ? 0.35 : S.wr * 0.8);
  for(const [x, z] of S.wheels){
    const piv = new THREE.Group(); piv.position.set(x, S.wr, z); g.add(piv);
    const w = new THREE.Mesh(wg, _wheelMat); w.rotation.order = 'ZYX'; w.rotation.z = Math.PI / 2; w.castShadow = true; piv.add(w);
    piv.userData = { x, z, base: S.wr, comp: 0, vel: 0 };
    wheels.push(w); if(z > 0.5) steer.push(piv);
  }
  g.userData = { type, wheels, steer, body, pivots: wheels.map(w => w.parent), wheelS, S };
  return g;
}

// ---------------- som do motor ----------------
export class EngineSound {
  constructor(audio){ this.audio = audio; this.on = false; }
  start(type){
    const A = this.audio; if(!A || !A.ctx || this.on) return; const c = A.ctx;
    this.on = true; this.type = type;
    const base = type === 'mota' ? 70 : type === 'blindado' ? 32 : type === 'suv' ? 42 : type === 'desportivo' ? 55 : 48;
    this.base = base;
    this.o1 = c.createOscillator(); this.o1.type = 'sawtooth'; this.o2 = c.createOscillator(); this.o2.type = 'square';
    this.f = c.createBiquadFilter(); this.f.type = 'lowpass'; this.f.frequency.value = 600; this.f.Q.value = 3;
    this.g = c.createGain(); this.g.gain.value = 0;
    this.o1.connect(this.f); this.o2.connect(this.f); this.f.connect(this.g); this.g.connect(A.dry);
    this.o1.frequency.value = base; this.o2.frequency.value = base * 0.5; this.o1.start(); this.o2.start();
    this.g.gain.setTargetAtTime(0.09, c.currentTime, 0.2);
  }
  update(rpm, load){
    if(!this.on) return; const c = this.audio.ctx, t = c.currentTime;
    const f = this.base * (0.8 + rpm * 2.6);
    this.o1.frequency.setTargetAtTime(f, t, 0.05); this.o2.frequency.setTargetAtTime(f * 0.5 + 3, t, 0.05);
    this.f.frequency.setTargetAtTime(400 + rpm * 1800 + load * 600, t, 0.08);
    this.g.gain.setTargetAtTime(0.05 + rpm * 0.06 + load * 0.03, t, 0.1);
  }
  stop(){ if(!this.on) return; this.on = false; const c = this.audio.ctx, t = c.currentTime; this.g.gain.setTargetAtTime(0, t, 0.15); const o1 = this.o1, o2 = this.o2; setTimeout(() => { try { o1.stop(); o2.stop(); } catch(e){} }, 600); }
  horn(on){
    const A = this.audio; if(!A || !A.ctx) return; const c = A.ctx;
    if(on && !this.hg){ this.hg = c.createGain(); this.hg.gain.value = 0.0; this.hg.connect(A.dry); this.ho = [c.createOscillator(), c.createOscillator()]; this.ho[0].type = this.ho[1].type = 'square'; this.ho[0].frequency.value = this.type === 'blindado' ? 220 : 392; this.ho[1].frequency.value = this.type === 'blindado' ? 277 : 494; this.ho.forEach(o => { o.connect(this.hg); o.start(); }); this.hg.gain.setTargetAtTime(0.07, c.currentTime, 0.02); }
    if(!on && this.hg){ const g = this.hg, os = this.ho; g.gain.setTargetAtTime(0, c.currentTime, 0.03); setTimeout(() => { os.forEach(o => { try { o.stop(); } catch(e){} }); g.disconnect(); }, 200); this.hg = null; }
  }
  skid(vol){
    const A = this.audio; if(!A || !A.ctx) return; const c = A.ctx;
    if(!this.sk){ const n = c.sampleRate, b = c.createBuffer(1, n, n), d = b.getChannelData(0); for(let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; const s = c.createBufferSource(); s.buffer = b; s.loop = true; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 6; const g = c.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(A.dry); s.start(); this.sk = { s, g }; }
    this.sk.g.gain.setTargetAtTime(vol * 0.12, c.currentTime, 0.05);
  }
  dispose(){ this.stop(); this.horn(false); if(this.sk){ try { this.sk.s.stop(); } catch(e){} this.sk = null; } }
}

// ---------------- simulação ----------------
const _v = new THREE.Vector3();
/** um passo de condução para o actor `a` no veículo `k` (a física de personagem trata da gravidade/colisões) */
export function vehicleStep(sys, a, k, dt, mi){
  const m = sys.m, b = a.body, ud = k.g.userData, S = ud.S, ph = m.physics;
  k.nitro = k.nitro ?? 1; k.vyaw = k.vyaw ?? k.yaw; k.roll = k.roll || 0; k.rollV = k.rollV || 0;
  const keys = m.keys || {};
  // capotado: não anda; E endireita (tratado em interact)
  if(k.flipped){ b.vel.x *= 0.9; b.vel.z *= 0.9; k.sp = 0; k.roll = THREE.MathUtils.damp(k.roll, k.flipped * 1.45, 4, dt); ud.body.rotation.z = k.roll; if(sys.eng) sys.eng.update(0, 0); return; }
  const actual = Math.hypot(b.vel.x, b.vel.z);
  // embate — mais estável: não perde toda a velocidade, desliza ao longo da parede
  if(Math.abs(k.sp) > 10 && b.grounded && (b.hitWall || actual < Math.abs(k.sp) * 0.35)){
    const imp = Math.abs(k.sp); k.sp *= -0.15; m.tps.addTrauma(Math.min(0.5, imp / 100)); m.audio.play('hit', b.pos, { vol: Math.min(1, imp / 70), rate: 0.5 }); m.audio.play('build', b.pos, { vol: 0.4, rate: 0.5 });
    if(imp > 35){ k.hp -= imp * 1.5; if(S.bike && imp > 50){ sys.eject(a, 'Caíste da mota'); return; } }
  }
  const nitro = keys.KeyF && k.nitro > 0.02 && mi.y > -0.1;
  const top = S.top * (a.boostT > 0 ? 1.2 : 1) + (nitro ? 22 : 0) + (k.turboT > 0 ? 14 : 0);
  const brake = mi.y < -0.1 && k.sp > 2;
  const acc = mi.y > 0.1 ? (k.sp < 20 ? S.acc : S.acc * 0.65) : mi.y < -0.1 ? (k.sp > 1 ? -S.acc * 1.6 : -S.acc * 0.5) : 0;
  if(b.grounded){ k.sp += (acc + (nitro ? 40 : 0) + (k.turboT > 0 ? 30 : 0)) * dt; if(!acc && !nitro) k.sp -= k.sp * Math.min(1, dt * 0.8); }
  if(nitro){ k.nitro = Math.max(0, k.nitro - dt / 3.2); if(Math.random() < 0.6) m.particles.emit('impact', b.pos.clone().add(_v.set(-Math.sin(k.yaw) * 3, 1.3, -Math.cos(k.yaw) * 3)), { color: 0x60a5fa, n: 2 }); }
  else k.nitro = Math.min(1, k.nitro + dt / 9);
  if(k.turboT > 0) k.turboT -= dt;
  k.sp = THREE.MathUtils.clamp(k.sp, -20, Math.max(top, Math.min(k.sp, top + 10) - dt * 20));
  // v23: limite de velocidade mais estável em curvas
  const spd = Math.abs(k.sp), dir = Math.sign(k.sp || 1);
  // travão de mão / derrapagem
  const hand = a.sprint || keys.ShiftLeft;
  const wantDrift = hand && b.grounded && spd > 24 && Math.abs(mi.x) > 0.2 && !S.bike;
  if(wantDrift && !k.drifting){ k.drifting = Math.sign(mi.x); k.drift = 0; }
  if(k.drifting && (!hand || spd < 16)){ if(k.drift > 0.8){ k.turboT = k.drift > 1.8 ? 1.4 : 0.8; m.audio.play('woosh', b.pos, { vol: 0.6 }); m.tps.kick(4); } k.drifting = 0; k.drift = 0; }
  let steerAmt = -mi.x * (S.steer - Math.min(1, spd / 80) * S.steer * 0.4) * dir * Math.min(1, spd / 5);
  // v23: direção mais responsável em baixa velocidade
  if(spd < 10) steerAmt *= 1.3;
  if(k.drifting){ steerAmt = (-k.drifting * 1.25 - mi.x * 0.75) * dir; k.drift += dt; const col = k.drift > 1.8 ? 0xf97316 : k.drift > 0.8 ? 0x38bdf8 : 0xe5e7eb; if(Math.random() < 0.7) m.particles.emit('impact', b.pos.clone().add(_v.set(-Math.sin(k.yaw) * 2, 0.3, -Math.cos(k.yaw) * 2)), { color: col, n: 2 }); }
  if(!b.grounded) steerAmt *= 0.4;
  k.yaw += steerAmt * dt;
  const grip = !b.grounded ? 0.6 : k.drifting ? 2.6 : S.grip;
  let dy = k.yaw - k.vyaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); k.vyaw += dy * Math.min(1, dt * grip);
  const slip = Math.abs(dy) * spd;   // derrapagem lateral (para som e capotamento)
  if(b.grounded || Math.abs(b.vel.x) + Math.abs(b.vel.z) < 1){ b.vel.x = Math.sin(k.vyaw) * k.sp; b.vel.z = Math.cos(k.vyaw) * k.sp; }
  if(a.jumpHeld && b.grounded && !k._kj){ b.vel.y = S.bike ? 18 : 22 - S.cog * 6; b.grounded = false; m.audio.play('jump', b.pos, { vol: 0.5, rate: 0.8 }); }
  k._kj = a.jumpHeld;
  // ---- raycast por roda + suspensão (mola-amortecedor por roda) ----
  const cy = Math.cos(k.yaw), sy = Math.sin(k.yaw), P = b.pos;
  let sumF = 0, sumB = 0, sumL = 0, sumR = 0, nF = 0, nB = 0, nL = 0, nR = 0;
  for(const piv of ud.pivots){
    const u = piv.userData, wx = P.x + u.x * cy + u.z * sy, wz = P.z - u.x * sy + u.z * cy;
    const gy = ph.groundAt(wx, wz, P.y + 2.5, 0);
    const target = THREE.MathUtils.clamp((gy - P.y), -S.susp, S.susp);       // altura do chão sob a roda relativa ao centro
    const kS = 160, cD = 18; const f = (target - u.comp) * kS - u.vel * cD; u.vel += f * dt; u.comp += u.vel * dt; u.comp = THREE.MathUtils.clamp(u.comp, -S.susp, S.susp);
    piv.position.y = u.base + u.comp;
    if(u.z > 0.3){ sumF += u.comp; nF++; } else if(u.z < -0.3){ sumB += u.comp; nB++; }
    if(u.x > 0.2){ sumL += u.comp; nL++; } else if(u.x < -0.2){ sumR += u.comp; nR++; }
  }
  const zl = Math.max(1, Math.abs(S.wheels[0][1] - S.wheels[S.wheels.length - 1][1])), xl = Math.max(1, Math.abs(S.wheels[0][0]) * 2);
  const pitchT = nF && nB ? Math.atan2(sumB / nB - sumF / nF, zl) : 0;
  let rollT = nL && nR ? Math.atan2(sumL / nL - sumR / nR, xl) : 0;
  // inclinação lateral por força centrífuga (mais para centro de gravidade alto); a mota inclina PARA DENTRO da curva
  const lat = steerAmt * spd;
  if(S.bike) rollT = THREE.MathUtils.clamp(-lat * 0.012, -0.7, 0.7);
  else rollT += THREE.MathUtils.clamp(lat * 0.0016 * (0.5 + S.cog), -0.35, 0.35);
  k.rollV += ((rollT - k.roll) * 40 - k.rollV * 7) * dt; k.roll += k.rollV * dt;
  ud.body.rotation.z = k.roll;
  k.g.rotation.x = THREE.MathUtils.damp(k.g.rotation.x, b.grounded ? pitchT : -b.vel.y * 0.008, 8, dt);
  k._acc = THREE.MathUtils.damp(k._acc || 0, (spd - (k._lsp || 0)) / Math.max(dt, 1e-3), 6, dt); k._lsp = spd;
  ud.body.rotation.x = THREE.MathUtils.damp(ud.body.rotation.x, THREE.MathUtils.clamp(-k._acc * 0.002, -0.06, 0.06), 6, dt);
  // capotamento: curva muito rápida com centro de gravidade alto, ou encosta muito inclinada
  if(!S.bike && b.grounded && (Math.abs(k.roll) > S.roll * 0.62 || (Math.abs(lat) * S.cog > 95 && spd > 40))){
    k.flipped = Math.sign(k.roll || -lat) || 1; k.sp = 0; m.tps.addTrauma(0.6); m.audio.play('hit', b.pos, { vol: 1, rate: 0.4 }); m.particles.emit('dust', b.pos, { n: 18, power: 2.2 });
    m.toast('Capotaste — prime E para endireitar'); setTimeout(() => { if(k.driver === a && k.flipped) sys.eject(a); }, 900); return;
  }
  // rodas e volante
  for(const w of ud.wheels) w.rotation.y -= k.sp * dt / S.wr;
  const steerVis = THREE.MathUtils.clamp(-mi.x * 0.5, -0.5, 0.5);
  for(const s of ud.steer) s.rotation.y = THREE.MathUtils.damp(s.rotation.y, steerVis, 12, dt);
  if(ud.wheelS) ud.wheelS.rotation.z = THREE.MathUtils.damp(ud.wheelS.rotation.z, -steerVis * 2.4, 10, dt);
  if(b.grounded && spd > 22 && Math.random() < 0.4) m.particles.emit('dust', b.pos, { n: 1, power: 1 });
  if(b.grounded && !k._wasG && (k._airT || 0) > 0.35){ m.tps.addTrauma(0.2); m.particles.emit('dust', b.pos, { n: 6, power: 2 }); if(k._airT > 1) m.toast('Salto de ' + k._airT.toFixed(1) + ' s'); }
  k._airT = b.grounded ? 0 : (k._airT || 0) + dt; k._wasG = b.grounded;
  // som
  if(sys.eng){ const rpm = Math.min(1, spd / S.top) ; sys.eng.update(rpm + (acc > 0 ? 0.05 : 0), acc > 0 || nitro ? 1 : 0); sys.eng.skid(b.grounded ? Math.min(1, (k.drifting ? 0.8 : 0) + (brake && spd > 25 ? 0.7 : 0) + Math.max(0, slip - 8) / 40) : 0); sys.eng.horn(!!(keys.KeyH)); }
  // atropelar
  if(spd > 26) for(const o of m.actors){ if(o === a || !o.alive || o.onBus || (m.isAlly && m.isAlly(a, o))) continue; if(o.root.position.distanceTo(b.pos) < S.radius + 1.6 && !(o._runCd > 0)){ o._runCd = 1; o.takeDamage(Math.round(20 + spd * 0.45 * (S.hp > 1000 ? 1.5 : 1)), a); if(o.body && !o.remote){ o.body.vel.x += b.vel.x * 0.7; o.body.vel.z += b.vel.z * 0.7; o.body.vel.y = 16; o.body.grounded = false; } k.sp *= 0.7; m.tps.addTrauma(0.3); m.audio.play('hit', b.pos, { vol: 0.8 }); } }
  if(k.hp <= 0) sys.destroyVehicle(k);
}
