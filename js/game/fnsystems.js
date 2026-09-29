// ============================================================
// FORT SYSTEMS (v16) — sistemas extra ao estilo Fortnite:
//   · Tirolesas (E para agarrar, ESPAÇO para saltar, anda nos 2 sentidos)
//   · Granadas (X) com ressalto e explosão que destrói construções e prédios
//   · Fenda Portátil (Z) — teletransporte para o céu (queda livre + planador)
//   · Lhamas de suprimentos (materiais, granadas, fenda, armas épicas)
//   · Caixas de munição
//   · Marcação/ping (botão do meio do rato)
//   · Nome do local ao entrar num POI
// ============================================================
import * as THREE from 'three';
import { Mat } from '../engine/materials.js';
import { locationAt } from './pois.js';
import { llamaGeo } from './pois.js';
import { GUNS, rollRarity } from './weapons.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const $ = (id) => document.getElementById(id);

export class FortSystems {
  constructor(m){
    this.m = m; const W = this.W = m.world;
    this.zips = []; this.grenades = []; this.pings = []; this.llamas = []; this.ammo = []; this.fx = [];
    this.loc = null; this._locT = 0;
    this.banks = W.poi ? ['torres', 'fabrica', 'posto', 'pico'].map(k => W.poi[k]).filter(Boolean) : [];
    W.onExplode = (pos, ex, owner) => this.explode(pos, ex.r, ex.dmg, owner);
    this.gMat = Mat.paint(0x4d7c0f); this.gPin = Mat.metal(0xd1d5db, 0.3); this.gLed = Mat.emissive(0xff3b3b, 3);
    this.gGeo = new THREE.SphereGeometry(0.5, 12, 10); this.ledGeo = new THREE.SphereGeometry(0.16, 8, 6);
    if(!W.poi || W.empty) return;
    this._buildZips(W.poi.zips);
    this._buildLlamas();
    this._buildAmmo(W.poi.loot.ammo);
  }
  // ---------------- tirolesas ----------------
  _buildZips(list){
    const cableM = Mat.metal(0x1f2937, 0.35), poleM = Mat.metal(0xf59e0b, 0.4), capM = Mat.paint(0x111827);
    for(const z of list){
      const len = z.a.distanceTo(z.b), sag = len * 0.035, pts = [];
      for(let i = 0; i <= 24; i++){ const t = i / 24; pts.push(z.a.clone().lerp(z.b, t).setY(z.a.y + (z.b.y - z.a.y) * t - sag * 4 * t * (1 - t))); }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.13, 6, false), cableM); tube.castShadow = true; tube.userData.noProbe = true;
      this.W.group.add(tube);
      for(const p of [z.a, z.b]){
        const gy = this.m.physics.groundAt(p.x, p.z, p.y - 1, 0), h = Math.max(2, p.y + 1.2 - gy);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, h, 10), poleM); pole.position.set(p.x, gy + h / 2, p.z); pole.castShadow = true;
        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 1.4), capM); cap.position.set(p.x, p.y + 0.6, p.z); cap.castShadow = true;
        this.W.group.add(pole, cap);
        this.m.physics.addCircle(p.x, p.z, 0.6, gy + h);
      }
      this.zips.push({ a: z.a, b: z.b, len, sag, curve, pts });
    }
  }
  _zipPoint(Z, t, out){ const p = out || new THREE.Vector3(); p.copy(Z.a).lerp(Z.b, t); p.y = Z.a.y + (Z.b.y - Z.a.y) * t - Z.sag * 4 * t * (1 - t); return p; }
  _nearZip(actor, maxD){
    const head = _c.copy(actor.root.position); head.y += 6.5;
    let best = null;
    for(const Z of this.zips){
      for(let i = 0; i <= 40; i++){ const t = i / 40, p = this._zipPoint(Z, t, _a), d = p.distanceTo(head); if(d < maxD && (!best || d < best.d)) best = { Z, t, d }; }
    }
    return best;
  }
  attachZip(actor){
    if(actor.mode !== 'ground' || !actor.alive) return false;
    const n = this._nearZip(actor, 7); if(!n) return false;
    const Z = n.Z, fwd = V(Math.sin(actor.yaw), 0, Math.cos(actor.yaw)), dir0 = _b.subVectors(Z.b, Z.a).setY(0).normalize();
    let dir = fwd.dot(dir0) >= 0 ? 1 : -1;
    if(n.t > 0.95) dir = -1; if(n.t < 0.05) dir = 1;
    actor.zip = { Z, t: THREE.MathUtils.clamp(n.t, 0.02, 0.98), dir, v: 8 };
    actor.mode = 'zip'; actor.body.grounded = false; actor.body.vel.set(0, 0, 0); actor.slideT = 0;
    actor.anim.play('deployGlider');
    this.m.audio.play('build', actor.root.position, { vol: 0.35, rate: 1.8 });
    if(actor.isPlayer) this.m.toast('Tirolesa — ESPAÇO para saltar');
    return true;
  }
  zipStep(actor, dt){
    const z = actor.zip; if(!z){ actor.mode = 'ground'; return; }
    const Z = z.Z;
    z.v = Math.min(34, z.v + dt * 40);
    z.t += z.dir * z.v / Z.len * dt;
    const p = this._zipPoint(Z, THREE.MathUtils.clamp(z.t, 0, 1), _a);
    const b = actor.body;
    b.pos.set(p.x, p.y - 8.2, p.z); b.vel.set(0, 0, 0); b.grounded = false;
    const d = _b.subVectors(Z.b, Z.a).multiplyScalar(z.dir); actor.yaw = actor.isPlayer ? actor.yaw : Math.atan2(d.x, d.z);
    if(Math.random() < 0.3) this.m.particles.emit('impact', p, { n: 1, color: 0xffd08a });
    if(z.t <= 0.015 || z.t >= 0.985) this.detachZip(actor, false);
  }
  detachZip(actor, jump){
    const z = actor.zip; if(!z) return;
    const d = _b.subVectors(z.Z.b, z.Z.a).normalize().multiplyScalar(z.dir * z.v * 0.7);
    actor.zip = null; actor.mode = 'ground'; actor.airTime = 0.01;
    actor.body.vel.set(d.x, jump ? 24 : 0, d.z); actor.body.grounded = false;
    if(jump) this.m.audio.play('jump', actor.root.position, { vol: 0.4 });
  }
  // ---------------- lhamas e caixas de munição ----------------
  _buildLlamas(){
    const spots = [[-330, 60], [300, -110], [-120, 330], [330, 60], [100, 300], [-170, -300]];
    const mat = Mat.vcolor('llama', { roughness: 0.6, emissive: new THREE.Color(0x2e1065), emissiveIntensity: 0.35 });
    for(let i = spots.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
    spots.slice(0, 3).forEach(([x, z]) => {
      if(!this.W._freeSpot(x, z, 4)) { x += 12; }
      const y = this.m.physics.groundAt(x, z, 999, 0);
      const mesh = new THREE.Mesh(llamaGeo(), mat); mesh.position.set(x, y, z); mesh.rotation.y = Math.random() * 6; mesh.castShadow = true; mesh.receiveShadow = true;
      this.W.group.add(mesh);
      const col = this.m.physics.addCircle(x, z, 2.2, y + 6);
      this.llamas.push({ mesh, pos: V(x, y, z), col, opened: false, t: Math.random() * 6, emitter: this.m.particles.addEmitter({ type: 'magic', rate: 3, pos: V(x, y + 9, z), opt: { color: 0xc084fc } }) });
    });
  }
  _buildAmmo(list){
    const boxM = Mat.paint(0x3f6212), trim = Mat.metal(0x1f2937, 0.4), lab = Mat.paint(0xfacc15);
    for(const [x, z] of list || []){
      if(!this.W._freeSpot(x, z, 0) && Math.abs(x) < 150 && Math.abs(z) < 150) continue;
      const y = this.m.physics.groundAt(x, z, 999, 0);
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = Math.random() * 6;
      const b = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 1.8), boxM); b.position.y = 0.8;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.35, 1.9), trim); lid.position.y = 1.75;
      const l = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.05), lab); l.position.set(0, 0.9, 0.92);
      g.add(b, lid, l); g.traverse(o => { if(o.isMesh){ o.castShadow = o.receiveShadow = true; } });
      this.W.group.add(g);
      this.ammo.push({ g, lid, pos: V(x, y, z), opened: false, col: this.m.physics.addCircle(x, z, 1.6, y + 1.9) });
    }
  }
  _openLlama(actor, L){
    if(L.opened) return; L.opened = true; L.openT = 0.001;
    const m = this.m, p = L.pos.clone().setY(L.pos.y + 5);
    m.particles.emit('confetti', p, { count: 60 }); m.particles.flash(p, 0xc084fc, 14, 0.6, 30); m.particles.emit('magic', p, { color: 0xe9d5ff, n: 30 });
    m.audio.play('chest', p, { vol: 1, rate: 0.8 }); m.particles.removeEmitter(L.emitter); m.physics.removeCircle(L.col);
    actor.mats.wood += 150; actor.mats.stone += 150; actor.mats.metal += 150; actor.grenades += 3; actor.rifts += 1; actor.potions += 1;
    GUNS.forEach(k => actor.reserve[k] = (actor.reserve[k] || 0) + 40);
    const spawnAt = (i) => L.pos.clone().add(V(Math.sin(i) * 4, 0, Math.cos(i) * 4));
    this.W.spawnPickup(GUNS[Math.floor(Math.random() * GUNS.length)], spawnAt(0.3), 1, { rar: 3 + (Math.random() < 0.4 ? 1 : 0) });
    this.W.spawnPickup(GUNS[Math.floor(Math.random() * GUNS.length)], spawnAt(2.4), 1, { rar: 2 + (Math.random() < 0.5 ? 1 : 0) });
    if(actor.isPlayer){ m.toast('LHAMA! +150 de cada material, 3 granadas, 1 fenda'); m._updateSlotsUI(); }
  }
  _openAmmo(actor, A){
    if(A.opened) return; A.opened = true; A.openT = 0.001;
    const m = this.m;
    GUNS.forEach(k => actor.reserve[k] = (actor.reserve[k] || 0) + ({ rifle: 30, shotgun: 8, sniper: 4, smg: 36, pistol: 16 })[k]);
    if(Math.random() < 0.35) actor.grenades += 1;
    m.audio.play('chest', A.pos, { vol: 0.5, rate: 1.4 }); m.particles.emit('impact', A.pos.clone().setY(A.pos.y + 2), { n: 10, color: 0xfacc15 });
    if(actor.isPlayer) m.toast('Munição reabastecida');
  }
  // ---------------- granadas / explosões ----------------
  throwGrenade(actor, dir, power){
    if(actor.grenades <= 0 || !actor.alive || actor.mode !== 'ground' || actor.using > 0) return false;
    if(this.m.time - (actor._gT || -9) < 0.8) return false;
    actor._gT = this.m.time;
    actor.grenades--;
    const o = actor.root.position.clone(); o.y += 6.8; o.x += Math.sin(actor.yaw) * 1.4; o.z += Math.cos(actor.yaw) * 1.4;
    const d = dir.clone().normalize();
    const vel = d.multiplyScalar(56 * (power || 1)).add(V(0, 13, 0));
    const mesh = new THREE.Mesh(this.gGeo, this.gMat); mesh.castShadow = true;
    const led = new THREE.Mesh(this.ledGeo, this.gLed); led.position.y = 0.45; mesh.add(led);
    mesh.position.copy(o); this.m.scene.add(mesh);
    this.grenades.push({ mesh, led, pos: o, vel, t: 2.1, owner: actor, spin: V(Math.random() * 10, Math.random() * 10, 0) });
    actor.anim.play('pickaxeSwing3', { speed: 1.4 });
    this.m.audio.play('woosh', o, { vol: 0.5, rate: 1.3 });
    if(actor.isPlayer) this.m._updateSlotsUI();
    return true;
  }
  _stepGrenade(g, dt){
    const P = this.m.physics, prev = _a.copy(g.pos);
    g.vel.y -= 55 * dt;
    g.pos.addScaledVector(g.vel, dt);
    // paredes / caixas
    for(const bx of P.nearBoxes(g.pos.x - 1, g.pos.z - 1, g.pos.x + 1, g.pos.z + 1)){
      if(bx.ramp) continue;
      if(g.pos.x > bx.min.x && g.pos.x < bx.max.x && g.pos.y > bx.min.y && g.pos.y < bx.max.y && g.pos.z > bx.min.z && g.pos.z < bx.max.z){
        if(prev.x <= bx.min.x || prev.x >= bx.max.x) g.vel.x *= -0.45;
        else if(prev.z <= bx.min.z || prev.z >= bx.max.z) g.vel.z *= -0.45;
        else g.vel.y *= -0.4;
        g.pos.copy(prev); this.m.audio.play('click', g.pos, { vol: 0.3, rate: 0.6 });
        break;
      }
    }
    const gy = P.groundAt(g.pos.x, g.pos.z, g.pos.y + 0.5, 0.3);
    if(g.pos.y < gy + 0.45){ g.pos.y = gy + 0.45; if(g.vel.y < -4) this.m.audio.play('click', g.pos, { vol: 0.35, rate: 0.5 }); g.vel.y = Math.abs(g.vel.y) * 0.32; g.vel.x *= 0.62; g.vel.z *= 0.62; }
    g.mesh.position.copy(g.pos); g.mesh.rotation.x += g.spin.x * dt; g.mesh.rotation.z += g.spin.y * dt;
    g.led.visible = Math.sin(this.m.time * (g.t < 0.8 ? 40 : 16)) > 0;
  }
  explode(pos, r, dmg, owner){
    const m = this.m, W = this.W;
    r = r || 14; dmg = dmg || 75;
    m.particles.emit('fire', pos, { n: m.quality === 'baixa' ? 16 : 36, size: 2.6, r: r * 0.25 });
    m.particles.emit('dust', pos, { n: 26, power: 3.2, color: 0x444444 });
    m.particles.emit('impact', pos, { n: 20, color: 0xffb347 });
    m.particles.emit('stone', pos, { count: 16 });
    m.particles.flash(pos.clone().setY(pos.y + 2), 0xff9a3c, 40, 0.45, r * 5);
    m.audio.play('shotgun', pos, { vol: 1.3, rate: 0.42, reverb: 0.8 }); m.audio.play('thunder', pos, { vol: 0.4, rate: 1.8 });
    const P = m.player;
    if(P && P.alive){ const d = P.root.position.distanceTo(pos); if(d < 90) m.tps.addTrauma(0.65 * (1 - d / 90)); }
    // atores
    for(const a of m.actors){
      if(!a.alive || a.onBus) continue;
      const c = _b.copy(a.root.position); c.y += 3.5;
      const d = c.distanceTo(pos); if(d > r) continue;
      if(!m.physics.lineClear(pos.clone().setY(pos.y + 0.5), c)) continue;
      let dd = Math.round(dmg * (1 - (d / r) * 0.7) * (a === owner ? 0.5 : 1));
      if(a !== owner && owner && m.isAlly(owner, a)) continue;
      a.takeDamage(dd, owner && owner !== a ? owner : null, false);
      const k = _c.subVectors(c, pos).setY(0).normalize().multiplyScalar(28 * (1 - d / r));
      if(!a.remote && a.mode === 'ground'){ a.body.vel.add(k); a.body.vel.y = Math.max(a.body.vel.y, 16 * (1 - d / r)); a.body.grounded = false; }
      if(owner && owner.isPlayer && a !== owner){ m.stats.dmg += dd; m._damageNumber(c, dd, false, a.shield > 0); m._hitmarker(false); }
      if(a.isPlayer) m._hurtFx(owner && owner !== a ? owner : null);
      if(a.brain) a.brain.hear(pos);
    }
    // construções dos jogadores
    for(const S of m.structures.slice()) if(S.alive && !S.editor){ const d = S.mesh.position.distanceTo(pos); if(d < r + 8) m.damageStructure(S, 420 * (1 - d / (r + 8)) + 40, S.mesh.position.clone()); }
    // prédios do mapa
    for(const B of this.banks) B.damageRadius(pos, r, 240);
    for(const b of m.bots) if(b.alive && b.root.position.distanceTo(pos) < 180) b.brain.hear(pos);
  }
  // ---------------- fenda portátil ----------------
  useRift(actor){
    if(actor.rifts <= 0 || !actor.alive || actor.mode !== 'ground') return false;
    actor.rifts--;
    const p = actor.root.position.clone();
    this._riftFx(p.clone().setY(p.y + 4));
    const gy = this.m.physics.groundAt(p.x, p.z, p.y + 1, 0);
    actor.body.pos.y = gy + 120; actor.body.vel.set(0, -6, 0); actor.body.grounded = false;
    actor.mode = 'freefall'; actor.fallInput.dive = 0; actor.launched = true; actor.anim.play('busJump');
    this._riftFx(actor.body.pos.clone().setY(actor.body.pos.y + 4));
    this.m.audio.play('woosh', p, { vol: 1, rate: 0.6 }); this.m.audio.play('build', p, { vol: 0.4, rate: 0.5 });
    if(actor.isPlayer){ this.m.tps.addTrauma(0.3); this.m.phase = this.m.phase === 'play' ? 'play' : this.m.phase; this.m._updateSlotsUI(); }
    return true;
  }
  _riftFx(p){
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.5, 10, 36), new THREE.MeshBasicMaterial({ color: 0xc084fc, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    const core = new THREE.Mesh(new THREE.CircleGeometry(3.3, 32), new THREE.MeshBasicMaterial({ color: 0x3b0764, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    const g = new THREE.Group(); g.add(ring, core); g.position.copy(p); g.userData.noProbe = true;
    this.m.scene.add(g); this.fx.push({ g, t: 1.6, life: 1.6, mats: [ring.material, core.material] });
    this.m.particles.emit('magic', p, { color: 0xd8b4fe, n: 30 });
    this.m.particles.flash(p, 0xa855f7, 20, 0.5, 40);
  }
  // ---------------- ping ----------------
  ping(P){
    const pos = P.aimPoint ? P.aimPoint.clone() : null; if(!pos) return;
    if(this.pings.length >= 3){ const o = this.pings.shift(); this.m.scene.remove(o.g); o.el.remove(); }
    const g = new THREE.Group(); g.position.copy(pos); g.userData.noProbe = true;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 40, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })); beam.position.y = 20;
    const dia = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), new THREE.MeshBasicMaterial({ color: 0xfde047 })); dia.position.y = 2.2;
    g.add(beam, dia); this.m.scene.add(g);
    const el = document.createElement('div'); el.className = 'ping-label'; (document.getElementById('nametag-layer') || document.body).appendChild(el);
    this.pings.push({ g, dia, el, pos, t: 12 });
    this.m.audio.play('ui', null, { vol: 0.6, rate: 1.9 });
  }
  // ---------------- interação / dicas ----------------
  interact(P){
    if(P.mode === 'zip'){ this.detachZip(P, false); return true; }
    const L = this.llamas.find(l => !l.opened && l.pos.distanceTo(P.root.position) < 7); if(L){ this._openLlama(P, L); return true; }
    const A = this.ammo.find(a => !a.opened && a.pos.distanceTo(P.root.position) < 5.5); if(A){ this._openAmmo(P, A); return true; }
    return false;
  }
  interactZip(P){ return this.attachZip(P); }
  hint(P){
    if(P.mode === 'zip') return '<kbd>ESPAÇO</kbd> Saltar da tirolesa';
    if(this.llamas.some(l => !l.opened && l.pos.distanceTo(P.root.position) < 7)) return '<kbd>E</kbd> Abrir lhama de suprimentos';
    if(this.ammo.some(a => !a.opened && a.pos.distanceTo(P.root.position) < 5.5)) return '<kbd>E</kbd> Abrir caixa de munição';
    this._zh = (this._zh || 0) - 1;
    if(this._zh <= 0){ this._zh = 6; this._zNear = P.mode === 'ground' && !!this._nearZip(P, 7); }
    if(this._zNear) return '<kbd>E</kbd> Agarrar tirolesa';
    return null;
  }
  minimapMarks(P){
    const out = [];
    for(const L of this.llamas) if(!L.opened && P && L.pos.distanceTo(P.root.position) < 90) out.push({ x: L.pos.x, z: L.pos.z, c: '#c084fc', s: 7, sq: true });
    for(const p of this.pings) out.push({ x: p.pos.x, z: p.pos.z, c: '#fde047', s: 7 });
    return out;
  }
  // ---------------- update ----------------
  update(dt){
    const m = this.m, P = m.player;
    for(let i = this.grenades.length - 1; i >= 0; i--){
      const g = this.grenades[i]; g.t -= dt; this._stepGrenade(g, dt);
      if(g.t <= 0){ m.scene.remove(g.mesh); this.grenades.splice(i, 1); this.explode(g.pos.clone(), 14, 78, g.owner); }
    }
    for(const L of this.llamas){
      L.t += dt;
      if(!L.opened){ L.mesh.position.y = L.pos.y + Math.abs(Math.sin(L.t * 2)) * 0.25; L.mesh.rotation.y += dt * 0.3; }
      else if(L.openT < 1){ L.openT = Math.min(1, L.openT + dt * 2); const s = 1 - L.openT; L.mesh.scale.setScalar(Math.max(0.001, s)); L.mesh.position.y = L.pos.y + L.openT * 4; if(L.openT >= 1) L.mesh.visible = false; }
    }
    for(const A of this.ammo) if(A.opened && A.openT < 1){ A.openT = Math.min(1, A.openT + dt * 4); A.lid.rotation.x = -1.6 * A.openT; A.lid.position.z = -0.8 * A.openT; }
    for(let i = this.fx.length - 1; i >= 0; i--){ const f = this.fx[i]; f.t -= dt; const u = f.t / f.life; f.g.rotation.z += dt * 4; f.g.scale.setScalar(0.3 + (1 - Math.abs(u - 0.5) * 2) * 1.0); f.g.lookAt(m.camera.position); f.mats.forEach(mt => mt.opacity = Math.min(0.9, u * 2)); if(f.t <= 0){ m.scene.remove(f.g); this.fx.splice(i, 1); } }
    // pings
    for(let i = this.pings.length - 1; i >= 0; i--){
      const p = this.pings[i]; p.t -= dt; p.dia.rotation.y += dt * 3;
      if(p.t <= 0){ m.scene.remove(p.g); p.el.remove(); this.pings.splice(i, 1); continue; }
      const s = _a.copy(p.pos); s.y += 4; const d = Math.round(s.distanceTo(P.root.position)); s.project(m.camera);
      const vis = s.z < 1 && Math.abs(s.x) < 1.05 && Math.abs(s.y) < 1.05;
      p.el.style.display = vis ? 'block' : 'none';
      if(vis){ p.el.style.transform = `translate3d(${((s.x * 0.5 + 0.5) * innerWidth) | 0}px, ${((-s.y * 0.5 + 0.5) * innerHeight) | 0}px, 0) translate(-50%,-100%)`; const t = d + ' m'; if(p.el._t !== t){ p.el._t = t; p.el.textContent = t; } }
    }
    // bots: granada ocasional contra alvo atrás de cobertura
    // (feito no ai.js) — aqui só o banner do local
    this._locT -= dt;
    if(this._locT <= 0 && P){
      this._locT = 0.5;
      const L = P.alive && !P.onBus ? locationAt(P.root.position.x, P.root.position.z) : null;
      if(L !== this.loc){ this.loc = L; if(L && (P.mode === 'ground' || P.mode === 'glide')) this._banner(L.n); }
    }
  }
  _banner(name){
    const el = $('loc-banner'); if(!el) return;
    el.textContent = name; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this._bt); this._bt = setTimeout(() => el.classList.remove('show'), 3200);
  }
  dispose(){ this.pings.forEach(p => p.el.remove()); }
}
