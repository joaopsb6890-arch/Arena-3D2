// ============================================================
// FORT V20 — mais sistemas:
//   · Quadriciclos (E entra/sai, W/S acelera, A/D vira, ESPAÇO salta) — atropelam inimigos
//   · Canhões do navio pirata e catapulta do castelo (E = disparar-te pelo ar)
//   · Balões de ar quente (E = subir e saltar em queda livre)
//   · Montanha-russa no Parque Radical (carril em circuito)
//   · Placas de velocidade nas estradas (corres +55% durante 3 s)
//   · Máquinas de venda (a raridade roda a cada 8 s, paga com ouro)
//   · Barris de escudo (ficar perto dá escudo; esvaziam)
//   · Torres de radar (revela inimigos no minimapa durante 20 s)
//   · Portais entre locais distantes (atravessa e aparece do outro lado)
//   · Gnomos escondidos (colecionáveis guardados na carreira)
// ============================================================
import * as THREE from 'three';
import { heightAt, MAP_R } from './world.js';
import { Mat } from '../engine/materials.js';
import { LOCATIONS, ROADS } from './pois.js';
import { RARITY, GUNS } from './weapons.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
let _seed = 4242; const rnd = () => ((_seed = (_seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const VEND_PRICE = [0, 120, 220, 340, 520];
const GNOMES = 12;

export function kartMesh(color){
  const g = new THREE.Group();
  const paint = Mat.paint(color || 0xf97316), dark = Mat.polymer(0x1f2937), metal = Mat.metal(0x9ca3af, 0.3), tire = Mat.polymer(0x111111);
  const add = (geo, mat, x, y, z, rx, ry, rz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, rz || 0); m.castShadow = true; g.add(m); return m; };
  add(new THREE.BoxGeometry(3.4, 0.7, 5.2), paint, 0, 1.1, 0);
  add(new THREE.BoxGeometry(2.8, 0.6, 1.6), paint, 0, 1.7, 1.9, -0.3);            // capô
  add(new THREE.BoxGeometry(3.6, 0.35, 1.0), dark, 0, 0.95, 2.9);                 // para-choques
  add(new THREE.BoxGeometry(1.6, 0.5, 1.6), dark, 0, 1.6, -0.5);                  // banco
  add(new THREE.BoxGeometry(1.6, 1.4, 0.3), dark, 0, 2.2, -1.3, -0.15);
  add(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 6), metal, 0, 2.2, 0.9, 0.9);   // coluna do volante
  add(new THREE.TorusGeometry(0.42, 0.07, 6, 16), dark, 0, 2.55, 0.55, 0.9);
  for(const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6), metal, sx * 1.3, 2.4, -1.5);
  add(new THREE.CylinderGeometry(0.08, 0.08, 2.7, 6), metal, 0, 3.7, -1.5, 0, 0, Math.PI / 2);
  const wheels = [];
  for(const [x, z] of [[-1.9, 1.8], [1.9, 1.8], [-1.9, -1.7], [1.9, -1.7]]){ const w = add(new THREE.CylinderGeometry(0.85, 0.85, 0.75, 16), tire, x, 0.85, z, 0, 0, Math.PI / 2); add(new THREE.CylinderGeometry(0.4, 0.4, 0.78, 10), metal, x, 0.85, z, 0, 0, Math.PI / 2); wheels.push(w); }
  for(const sx of [-0.9, 0.9]) add(new THREE.SphereGeometry(0.22, 8, 6), Mat.emissive(0xfff7d6, 2.2), sx, 1.25, 2.62);
  g.userData.wheels = wheels;
  return g;
}

export class FortV20 {
  constructor(m){
    this.m = m; this.W = m.world; const W = this.W, poi = W.poi || {};
    _seed = 4242;
    const md = m.modeId || 'br';
    this.full = md !== 'creative' && !m.layout && !W.empty;
    this.solo = !m.session;
    this.group = new THREE.Group(); m.scene.add(this.group);
    this.karts = []; this.cannons = []; this.catapults = []; this.balloons = []; this.pads = []; this.vending = []; this.barrels = []; this.radars = []; this.portals = []; this.gnomes = [];
    this.reveal = 0; this.ride = null; this._padCd = 0; this._portCd = 0;
    if(!this.full) return;
    (poi.karts || []).forEach(k => this._kart(...k));
    (poi.cannons || []).forEach(c => this.cannons.push({ pos: V(c.x, c.y, c.z), dx: c.dx, dz: c.dz }));
    (poi.catapults || []).forEach(c => this._catapult(c));
    (poi.balloons || []).forEach(([x, z]) => this._balloon(x, z));
    (poi.vending || []).forEach(v => this._vending(...v));
    (poi.barrels || []).forEach(([x, z]) => this._barrel(x, z));
    (poi.radars || []).forEach(([x, z]) => this._radar(x, z));
    (poi.portals || []).forEach(([a, b]) => this._portal(a, b));
    this._speedPads(); this._gnomes();
    if(poi.coaster && m.v19){ const pts = poi.coaster.map(([x, z, h]) => V(x, heightAt(x, z) + h, z)); this.coaster = m.v19.addRail(pts, { closed: true, maxSp: 58, color: 0xef4444, glow: 0xfacc15 }); }
  }
  _ground(x, z){ return this.W.physics.groundAt(x, z, 999, 0); }
  // ---------------- construção dos objetos ----------------
  _kart(x, z, yaw){
    const cols = [0xf97316, 0x22c55e, 0x3b82f6, 0xe11d48, 0xfacc15, 0xa855f7];
    const g = kartMesh(cols[this.karts.length % cols.length]); const y = this._ground(x, z);
    g.position.set(x, y, z); g.rotation.y = yaw || 0; this.group.add(g);
    this.karts.push({ g, pos: g.position, yaw: yaw || 0, sp: 0, driver: null, wheels: g.userData.wheels });
  }
  _catapult(c){
    const y = this._ground(c.x, c.z), g = new THREE.Group(); g.position.set(c.x, y, c.z); g.rotation.y = c.ry || 0;
    const wood = Mat.wood(0x6b4a2f), dark = Mat.wood(0x3f2a1a), rope = Mat.polymer(0xd6d3d1);
    const add = (geo, mat, x, yy, z, rx, ry, rz, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, yy, z); m.rotation.set(rx || 0, ry || 0, rz || 0); m.castShadow = true; (parent || g).add(m); return m; };
    for(const sx of [-1, 1]){ add(new THREE.BoxGeometry(0.6, 0.6, 9), wood, sx * 2, 0.6, 0); add(new THREE.BoxGeometry(0.5, 5, 0.5), wood, sx * 2, 3, 1.2, 0.25); add(new THREE.BoxGeometry(0.5, 5, 0.5), wood, sx * 2, 3, -1.2, -0.25); add(new THREE.CylinderGeometry(1, 1, 0.5, 12), dark, sx * 2.4, 1, 3.4, 0, 0, Math.PI / 2); add(new THREE.CylinderGeometry(1, 1, 0.5, 12), dark, sx * 2.4, 1, -3.4, 0, 0, Math.PI / 2); }
    add(new THREE.CylinderGeometry(0.3, 0.3, 4.6, 8), dark, 0, 5.2, 0, 0, 0, Math.PI / 2);
    const arm = new THREE.Group(); arm.position.set(0, 5.2, 0); g.add(arm);
    add(new THREE.BoxGeometry(0.6, 0.6, 9), wood, 0, 0, -1.5, 0, 0, 0, arm);
    add(new THREE.CylinderGeometry(1.2, 0.9, 0.8, 12, 1, true), dark, 0, 0.4, -5.8, 0, 0, 0, arm);
    add(new THREE.BoxGeometry(2, 2, 2), Mat.rock(0x6b7280), 0, -0.6, 2.8, 0, 0, 0, arm);
    arm.rotation.x = -0.55;
    this.group.add(g); this.W.physics.addBox(V(c.x - 2.6, y, c.z - 4.6), V(c.x + 2.6, y + 1.2, c.z + 4.6));
    this.catapults.push({ g, arm, pos: V(c.x, y, c.z), t: 0, cd: 0, target: V(c.x * 0.15, 0, c.z * 0.15) });
  }
  _balloon(x, z){
    const y = this._ground(x, z), g = new THREE.Group(); g.position.set(x, y, z);
    const cols = [0xef4444, 0xfacc15, 0x3b82f6, 0x22c55e, 0xa855f7, 0xf97316][this.balloons.length % 6], c2 = 0xf8fafc;
    // envelope em gomos (cores alternadas por vértice)
    const env = new THREE.SphereGeometry(6, 24, 18); env.scale(1, 1.2, 1); { const p = env.attributes.position, col = new Float32Array(p.count * 3), A = new THREE.Color(cols), B = new THREE.Color(c2); for(let i = 0; i < p.count; i++){ const a = Math.atan2(p.getZ(i), p.getX(i)); const k = Math.floor((a + Math.PI) / (Math.PI * 2) * 12) % 2 ? A : B; col.set([k.r, k.g, k.b], i * 3); } env.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
    const em = new THREE.Mesh(env, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })); em.position.y = 14; em.castShadow = true;
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 1.6, 2.6, 16, 1, true), Mat.cloth(cols, 'fabric')); skirt.position.y = 7.4;
    const basket = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), Mat.wood(0x8b5a2b)); basket.position.y = 1; basket.castShadow = true;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 8), Mat.emissive(0xff8a1f, 3)); flame.position.y = 5.2;
    g.add(em, skirt, basket, flame);
    for(const sx of [-1, 1]) for(const sz of [-1, 1]){ const r = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 6, 4), Mat.polymer(0x44403c)); r.position.set(sx * 1.8, 5, sz * 1.8); r.rotation.set(sz * 0.08, 0, -sx * 0.08); g.add(r); }
    this.group.add(g);
    this.balloons.push({ g, flame, base: V(x, y, z), pos: V(x, y, z), state: 'idle', t: 0 });
  }
  _vending(x, z, ry){
    const y = this._ground(x, z), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry || 0;
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 6.4, 2.4), Mat.paint(0x1f2937)); body.position.y = 3.2; body.castShadow = true;
    const screen = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.2, 0.1), new THREE.MeshStandardMaterial({ color: 0x111827, emissive: 0x60a5fa, emissiveIntensity: 1.6 })); screen.position.set(0, 4, 1.22);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, 0.1), Mat.polymer(0x0b0f19)); slot.position.set(0, 1.2, 1.22);
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.6, 2.6), Mat.paint(0xfacc15)); top.position.y = 6.6;
    g.add(body, screen, slot, top); this.group.add(g);
    this.W.physics.addBox(V(x - 1.8, y, z - 1.8), V(x + 1.8, y + 6.4, z + 1.8));
    this.vending.push({ g, screen, pos: V(x, y, z).add(V(Math.sin(ry || 0) * 3, 0, Math.cos(ry || 0) * 3)), rar: 1 + (this.vending.length % 3) });
  }
  _barrel(x, z){
    const y = this._ground(x, z), g = new THREE.Group(); g.position.set(x, y, z);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 3.2, 18), Mat.paint(0x1d4ed8)); b.position.y = 1.6; b.castShadow = true;
    const liquid = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.1, 18), Mat.emissive(0x38bdf8, 2.4)); liquid.position.y = 3.22;
    for(const yy of [0.5, 2.7]){ const r = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.1, 6, 24), Mat.metal(0x9ca3af, 0.3)); r.rotation.x = Math.PI / 2; r.position.y = yy; g.add(r); }
    g.add(b, liquid); this.group.add(g); this.W.physics.addCircle(x, z, 1.5, y + 3.2);
    this.barrels.push({ g, liquid, pos: V(x, y, z), left: 100 });
  }
  _radar(x, z){
    const y = this._ground(x, z), g = new THREE.Group(); g.position.set(x, y, z);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 9, 8), Mat.metal(0x6b7280, 0.4)); mast.position.y = 4.5;
    const dish = new THREE.Group(); dish.position.y = 9.4;
    const d = new THREE.Mesh(new THREE.SphereGeometry(2.4, 18, 8, 0, Math.PI * 2, 0, Math.PI / 3), Mat.metal(0xe5e7eb, 0.3)); d.rotation.x = -Math.PI / 2 - 0.3; d.position.z = 0.6; d.material = d.material.clone(); d.material.side = THREE.DoubleSide;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), Mat.emissive(0xef4444, 3).clone()); tip.position.set(0, 0.6, 2);
    dish.add(d, tip); g.add(mast, dish); g.traverse(o => { if(o.isMesh) o.castShadow = true; }); this.group.add(g);
    this.W.physics.addCircle(x, z, 0.8, y + 9);
    this.radars.push({ g, dish, tip, pos: V(x, y, z), cd: 0 });
  }
  _portal(a, b){
    const mk = (x, z, col) => {
      const y = this._ground(x, z), g = new THREE.Group(); g.position.set(x, y, z);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.35, 10, 40), Mat.emissive(col, 2.6)); ring.position.y = 4;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(3.3, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.45, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })); disc.position.y = 4; disc.userData.noProbe = true;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.4, 0.6, 24), Mat.rock(0x57534e)); base.position.y = 0.3;
      g.add(ring, disc, base); this.group.add(g);
      return { g, ring, disc, pos: V(x, y, z) };
    };
    const A = mk(a[0], a[1], 0xa855f7), B = mk(b[0], b[1], 0xa855f7);
    A.to = B; B.to = A; this.portals.push(A, B);
    this.m.particles && this.m.particles.addEmitter && this.m.particles.addEmitter({ type: 'magic', rate: 4, pos: A.pos.clone().setY(A.pos.y + 4), opt: { color: 0xc084fc, n: 1 } });
  }
  _speedPads(){
    const mat = Mat.emissive(0x22d3ee, 2.0), base = Mat.polymer(0x0f172a);
    const list = ROADS.filter((_, i) => i % 2 === 0).slice(0, 16);
    for(const [x0, z0, x1, z1] of list){
      const t = 0.5, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, yaw = Math.atan2(x1 - x0, z1 - z0), y = heightAt(x, z);
      const g = new THREE.Group(); g.position.set(x, y + 0.08, z); g.rotation.y = yaw;
      const p = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 7), base); g.add(p);
      for(let i = 0; i < 3; i++){ const ch = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.6, 3), mat); ch.rotation.x = Math.PI / 2; ch.scale.set(1, 1, 0.12); ch.position.set(0, 0.2, -2 + i * 2); g.add(ch); }
      this.group.add(g); this.pads.push({ g, pos: V(x, y, z), dir: V(Math.sin(yaw), 0, Math.cos(yaw)) });
    }
  }
  _gnomes(){
    const app = this.m.app; const found = new Set((app && app.career && app.career.gnomes) || []);
    const hat = Mat.paint(0xdc2626), beard = Mat.cloth(0xf8fafc, 'fabric'), body = Mat.paint(0x2563eb), skin = Mat.skin ? Mat.skin(0xf1c27d) : Mat.paint(0xf1c27d);
    const locs = LOCATIONS.filter(L => !['Lago Sereno', 'Rio Serpente'].includes(L.n));
    for(let i = 0; i < GNOMES; i++){
      const L = locs[(i * 5 + 3) % locs.length], a = rnd() * 6.28, r = L.r * (0.5 + rnd() * 0.45), x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r;
      if(found.has(i)) continue;
      const y = this._ground(x, z), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rnd() * 6.28;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), body); b.scale.set(1, 1.1, 1); b.position.y = 0.6;
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), skin); h.position.y = 1.4;
      const bd = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 8), beard); bd.position.set(0, 1.1, 0.25); bd.rotation.x = Math.PI;
      const ht = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.1, 10), hat); ht.position.y = 2.1;
      g.add(b, h, bd, ht); g.traverse(o => { if(o.isMesh) o.castShadow = true; }); this.group.add(g);
      this.gnomes.push({ g, pos: V(x, y, z), id: i });
    }
  }
  // ---------------- quadriciclo ----------------
  _enterKart(P, k){
    k.driver = P; P.kart = k; P.slideT = 0; P.crouch = false;
    P.body.pos.set(k.pos.x, k.pos.y + 0.6, k.pos.z); P.root.position.copy(P.body.pos);
    this.group.remove(k.g); P.root.add(k.g); k.g.position.set(0, -0.6, 0); k.g.rotation.set(0, 0, 0);
    k.sp = 0; this.m.toast('W/S acelerar · A/D virar · ESPAÇO saltar · E sair'); this.m.audio.play('build', P.body.pos, { vol: 0.5, rate: 0.6 });
    if(this.m.quest) this.m.quest('drive');
  }
  exitKart(P){
    const k = P.kart; if(!k) return; P.kart = null; k.driver = null;
    P.root.remove(k.g); this.group.add(k.g);
    k.g.position.copy(P.body.pos).setY(this._ground(P.body.pos.x, P.body.pos.z)); k.g.rotation.set(0, k.yaw, 0); k.pos = k.g.position;
    P.body.pos.x += Math.cos(k.yaw) * 3.4; P.body.pos.z -= Math.sin(k.yaw) * 3.4; P.body.pos.y += 1; P.body.vel.set(0, 0, 0);
  }
  kartStep(a, dt, mi){
    const k = a.kart, b = a.body;
    const actual = Math.hypot(b.vel.x, b.vel.z); if(Math.abs(k.sp) > 12 && actual < Math.abs(k.sp) * 0.35) k.sp *= 0.4;   // bateu
    const acc = mi.y > 0.1 ? 34 : mi.y < -0.1 ? (k.sp > 0 ? -60 : -22) : 0;
    k.sp += acc * dt; if(!acc) k.sp -= k.sp * Math.min(1, dt * 0.9);
    k.sp = THREE.MathUtils.clamp(k.sp, -16, a.boostT > 0 ? 72 : 58);
    const steer = -mi.x * (1.9 - Math.min(1, Math.abs(k.sp) / 60) * 0.9) * Math.sign(k.sp || 1) * Math.min(1, Math.abs(k.sp) / 6);
    k.yaw += steer * dt;
    b.vel.x = Math.sin(k.yaw) * k.sp; b.vel.z = Math.cos(k.yaw) * k.sp;
    if(a.jumpHeld && b.grounded && !this._kj){ b.vel.y = 20; b.grounded = false; this.m.audio.play('jump', b.pos, { vol: 0.5, rate: 0.8 }); }
    this._kj = a.jumpHeld;
    for(const w of k.wheels) w.rotation.x += k.sp * dt / 0.85;
    if(b.grounded && Math.abs(k.sp) > 25 && Math.random() < 0.5) this.m.particles.emit('dust', b.pos, { n: 1, power: 1 });
    k._dist = (k._dist || 0) + Math.abs(k.sp) * dt; if(k._dist > 400){ k._dist = 0; if(this.m.quest) this.m.quest('drive'); }
    // atropelar
    if(Math.abs(k.sp) > 26) for(const o of this.m.actors){ if(o === a || !o.alive || o.onBus || (this.m.isAlly && this.m.isAlly(a, o))) continue; if(o.root.position.distanceTo(b.pos) < 3.6 && !(o._runCd > 0)){ o._runCd = 1; o.takeDamage(35, a); if(o.body && !o.remote){ o.body.vel.x += b.vel.x * 0.7; o.body.vel.z += b.vel.z * 0.7; o.body.vel.y = 16; o.body.grounded = false; } k.sp *= 0.6; this.m.audio.play('hit', b.pos, { vol: 0.8 }); } }
  }
  // ---------------- interação ----------------
  interact(P){
    if(P.kart){ this.exitKart(P); return true; }
    const pp = P.root.position, near = (list, d) => list.find(o => o.pos.distanceTo(pp) < d);
    const k = this.karts.find(k => !k.driver && k.pos.distanceTo(pp) < 5.5); if(k){ this._enterKart(P, k); return true; }
    const c = near(this.cannons, 3.6); if(c){ this._fire(P, c.dx, c.dz, 68, 52, c.pos); if(this.m.quest) this.m.quest('cannon'); return true; }
    const cp = near(this.catapults, 7);
    if(cp){ if(cp.cd > 0){ this.m.toast('A catapulta está a recarregar'); return true; } cp.cd = 6; cp.t = 0.001; const d = _a.subVectors(cp.target, cp.pos).setY(0).normalize(); P.body.pos.set(cp.pos.x, cp.pos.y + 6, cp.pos.z); this._fire(P, d.x, d.z, 90, 70, cp.pos); if(this.m.quest) this.m.quest('cannon'); return true; }
    const bl = this.balloons.find(b => b.state === 'idle' && b.pos.distanceTo(pp) < 5); if(bl){ bl.state = 'up'; bl.t = 0; this.ride = bl; this.m.toast('Balão a subir · ESPAÇO para saltar'); this.m.audio.play('woosh', pp, { vol: 0.5, rate: 0.6 }); return true; }
    const v = near(this.vending, 4.5);
    if(v){ const cost = VEND_PRICE[v.rar]; if((P.gold || 0) < cost){ this.m.toast('Precisas de ' + cost + ' ouro'); return true; } P.gold -= cost; this.W.spawnPickup(GUNS[Math.floor(Math.random() * GUNS.length)], v.pos.clone().setY(v.pos.y + 0.6), 1, { rar: v.rar }); this.m.audio.play('chest', v.pos, { vol: 0.7, rate: 1.4 }); this.m.toast('Compraste uma arma ' + RARITY[v.rar].label); return true; }
    const r = near(this.radars, 5);
    if(r){ if(r.cd > 0){ this.m.toast('Radar a recarregar · ' + Math.ceil(r.cd) + ' s'); return true; } r.cd = 60; this.reveal = 20; this.m.toast('RADAR: inimigos revelados no minimapa durante 20 s'); this.m.audio.play('ui', null, { vol: 0.7, rate: 0.6 }); if(this.m.quest) this.m.quest('radar'); return true; }
    return false;
  }
  _fire(P, dx, dz, h, v, pos){
    if(P.kart) this.exitKart(P);
    P.climbing = false; P.rail = null;
    P.launch(v); P.body.vel.x = dx * h; P.body.vel.z = dz * h;
    this.m.particles.emit('dust', pos.clone().setY(pos.y + 2), { n: 30, power: 3, color: 0x9ca3af }); this.m.particles.emit('fire', pos.clone().setY(pos.y + 2), { n: 10, size: 1.6 });
    this.m.audio.play('launch', pos, { vol: 1, rate: 0.7 }); this.m.audio.play('thunder', pos, { vol: 0.25, rate: 1.6 });
  }
  hint(P){
    if(P.kart) return '<kbd>E</kbd> Sair do quadriciclo · ' + Math.round(Math.abs(P.kart.sp) * 3.6 / 2) + ' km/h';
    if(this.ride) return '<kbd>ESPAÇO</kbd> Saltar do balão';
    const pp = P.root.position, near = (list, d) => list.find(o => o.pos.distanceTo(pp) < d);
    if(this.karts.some(k => !k.driver && k.pos.distanceTo(pp) < 5.5)) return '<kbd>E</kbd> Conduzir quadriciclo';
    if(near(this.cannons, 3.6)) return '<kbd>E</kbd> Disparar-te do canhão';
    if(near(this.catapults, 7)) return '<kbd>E</kbd> Catapulta (voa para o centro)';
    if(this.balloons.some(b => b.state === 'idle' && b.pos.distanceTo(pp) < 5)) return '<kbd>E</kbd> Subir no balão';
    const v = near(this.vending, 4.5); if(v) return '<kbd>E</kbd> Comprar arma <b style="color:' + RARITY[v.rar].css + '">' + RARITY[v.rar].label + '</b> · ' + VEND_PRICE[v.rar] + ' ouro';
    const r = near(this.radars, 5); if(r) return r.cd > 0 ? 'Radar a recarregar · ' + Math.ceil(r.cd) + ' s' : '<kbd>E</kbd> Ativar radar';
    const br = near(this.barrels, 5); if(br) return br.left > 0 ? 'Barril de escudo · ' + Math.ceil(br.left) + ' restante' : 'Barril vazio';
    return null;
  }
  minimapMarks(P){
    const out = [];
    for(const k of this.karts) if(!k.driver) out.push({ x: k.pos.x, z: k.pos.z, c: '#f97316', s: 3, sq: true });
    for(const p of this.portals) out.push({ x: p.pos.x, z: p.pos.z, c: '#a855f7', s: 4 });
    for(const b of this.balloons) if(b.state === 'idle') out.push({ x: b.pos.x, z: b.pos.z, c: '#facc15', s: 3 });
    for(const v of this.vending) out.push({ x: v.pos.x, z: v.pos.z, c: '#60a5fa', s: 3, sq: true });
    if(this.reveal > 0) for(const a of this.m.actors){ if(a === P || !a.alive || a.onBus || (this.m.isAlly && this.m.isAlly(P, a))) continue; out.push({ x: a.root.position.x, z: a.root.position.z, c: '#ef4444', s: 5 }); }
    return out;
  }
  // ---------------- update ----------------
  update(dt){
    const m = this.m, P = m.player; if(!P || !this.full) return;
    const t = (this._t = (this._t || 0) + dt), pp = P.body.pos;
    if(P.kart){ P.root.rotation.y = P.kart.yaw; if(!P.alive) this.exitKart(P); }
    for(const a of m.actors) if(a._runCd > 0) a._runCd -= dt;
    if(P.boostT > 0) P.boostT -= dt;
    // placas de velocidade
    this._padCd -= dt;
    if(this._padCd <= 0 && P.alive && P.mode === 'ground') for(const p of this.pads){ if(Math.abs(p.pos.x - pp.x) < 3 && Math.abs(p.pos.z - pp.z) < 4 && Math.abs(p.pos.y - pp.y) < 2){ P.boostT = 3; this._padCd = 1; const h = Math.hypot(P.body.vel.x, P.body.vel.z); P.body.vel.x += p.dir.x * 18 * Math.sign(P.body.vel.x * p.dir.x + P.body.vel.z * p.dir.z || 1); P.body.vel.z += p.dir.z * 18 * Math.sign(P.body.vel.x * p.dir.x + P.body.vel.z * p.dir.z || 1); m.audio.play('woosh', pp, { vol: 0.6, rate: 1.4 }); m.particles.emit('magic', pp, { n: 12, color: 0x22d3ee }); if(P.kart) P.kart.sp = Math.min(72, P.kart.sp + 20); break; } }
    for(const p of this.pads){ const s = 1.6 + Math.sin(t * 6) * 0.6; p.g.children.forEach((c, i) => { if(i) c.material.emissiveIntensity = s; }); break; }
    // portais
    this._portCd -= dt;
    for(const p of this.portals){ p.ring.rotation.z += dt * 0.8; p.disc.rotation.z -= dt * 1.4; p.disc.material.opacity = 0.35 + Math.sin(t * 3) * 0.1;
      if(this._portCd <= 0 && P.alive && !P.kart && Math.abs(pp.x - p.pos.x) < 2.6 && Math.abs(pp.z - p.pos.z) < 2.6 && pp.y - p.pos.y < 8){ this._portCd = 2.5; const to = p.to.pos; const yaw = P.yaw; pp.set(to.x + Math.sin(yaw) * 6, this._ground(to.x + Math.sin(yaw) * 6, to.z + Math.cos(yaw) * 6) + 0.5, to.z + Math.cos(yaw) * 6); P.root.position.copy(pp); P.body.vel.set(0, 0, 0); m.particles.emit('magic', pp, { n: 30, color: 0xc084fc }); m.audio.play('woosh', pp, { vol: 0.8, rate: 0.5 }); if(m.quest) m.quest('portal'); break; } }
    // barris de escudo
    for(const b of this.barrels){ if(b.left <= 0) continue; if(P.alive && b.pos.distanceTo(pp) < 5 && (P.shield < 100 || P.hp < 100)){ const n = Math.min(b.left, dt * 12); b.left -= n; if(P.hp < 100) P.hp = Math.min(100, P.hp + n); else P.shield = Math.min(100, P.shield + n); if(Math.random() < 0.3) m.particles.emit('magic', pp, { n: 1, color: 0x38bdf8 }); b.liquid.scale.setScalar(0.3 + b.left / 140); if(b.left <= 0){ b.liquid.material = Mat.polymer(0x1e293b); } } }
    // radares
    for(const r of this.radars){ r.dish.rotation.y += dt * (r.cd > 0 ? 0.4 : 1.6); r.cd = Math.max(0, r.cd - dt); r.tip.material.emissive && r.tip.material.emissive.set(r.cd > 0 ? 0x64748b : 0xef4444); }
    if(this.reveal > 0) this.reveal -= dt;
    // máquinas de venda: raridade roda
    this._vt = (this._vt || 0) + dt; if(this._vt > 8){ this._vt = 0; for(const v of this.vending){ v.rar = 1 + ((v.rar) % 4); v.screen.material.emissive.set(RARITY[v.rar].color); } }
    // catapultas: animação do braço
    for(const c of this.catapults){ c.cd = Math.max(0, c.cd - dt); if(c.t > 0){ c.t += dt; const u = Math.min(1, c.t * 5); c.arm.rotation.x = -0.55 + u * 1.9; if(c.t > 2){ c.t = 0; } } else if(c.arm.rotation.x > -0.55) c.arm.rotation.x = Math.max(-0.55, c.arm.rotation.x - dt * 0.6); }
    // balões
    for(const b of this.balloons){
      b.flame.scale.setScalar(0.9 + Math.sin(t * 20 + b.base.x) * 0.15 + (b.state === 'up' ? 0.5 : 0));
      if(b.state === 'idle'){ b.g.position.y = b.base.y + Math.sin(t + b.base.x) * 0.15; }
      else if(b.state === 'up'){ b.t += dt; b.g.position.y += dt * 22; if(this.ride === b && P.alive){ pp.set(b.g.position.x, b.g.position.y + 2.2, b.g.position.z); P.root.position.copy(pp); P.body.vel.set(0, 0, 0); P.body.grounded = true; if((P.jumpHeld && b.t > 0.6) || b.t > 7){ this.ride = null; P.launch(18); P.body.vel.x = Math.sin(P.yaw) * 20; P.body.vel.z = Math.cos(P.yaw) * 20; if(m.quest) m.quest('balloon'); } } else if(this.ride === b) this.ride = null; if(b.t > 12){ b.state = 'gone'; b.g.visible = false; b.t = 0; } }
      else if(b.state === 'gone'){ b.t += dt; if(b.t > 35){ b.state = 'idle'; b.g.visible = true; b.g.position.copy(b.base); } }
    }
    // karts parados: assentam
    for(const k of this.karts) if(!k.driver && ((this._kf = (this._kf || 0) + 1) % 30 === 0)) k.g.position.y = this._ground(k.pos.x, k.pos.z);
    // gnomos
    for(let i = this.gnomes.length - 1; i >= 0; i--){ const gn = this.gnomes[i]; gn.g.rotation.y += dt * 0.6;
      if(P.alive && gn.pos.distanceTo(pp) < 3.2){ this.group.remove(gn.g); this.gnomes.splice(i, 1); const app = m.app; if(app && app.career){ app.career.gnomes = Array.from(new Set([...(app.career.gnomes || []), gn.id])); app.career.xp = (app.career.xp || 0) + 150; try { app.store && app.store.set('career', app.career); } catch(e){} }
        const n = (app && app.career && app.career.gnomes) ? app.career.gnomes.length : 0; m.toast('GNOMO ENCONTRADO ' + n + '/' + GNOMES + ' · +150 XP'); m.audio.play('celebrate', pp, { vol: 0.6 }); m.particles.emit('magic', pp, { n: 24, color: 0xfacc15 }); if(m.quest) m.quest('gnome'); } }
  }
  /** jogador remoto: mostra o quadriciclo por baixo dele */
  remoteKart(a){
    if(a.remoteKart && !a._kartG){ a._kartG = kartMesh(0x64748b); a._kartG.position.y = -0.6; a.root.add(a._kartG); }
    if(a._kartG) a._kartG.visible = !!a.remoteKart;
  }
  dispose(){ const P = this.m.player; if(P && P.kart) this.exitKart(P); this.m.scene.remove(this.group); }
}
