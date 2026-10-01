// ============================================================
// FORT EXTRAS (v17) — mais sistemas ao estilo Fortnite:
//   · Itens táticos com seleção (T troca, X usa):
//       Granada · Granada de Impulso (projeta sem dano) · Splash de Escudo (cura em área)
//       Granada de Fumo (bloqueia a visão dos bots) · Arbusto (disfarce até levar dano)
//   · Pesca em cardumes no lago e no rio (E) — peixes de escudo, vida e voador
//   · Missões com XP durante a partida (ligadas ao painel DESAFIOS do lobby)
// ============================================================
import * as THREE from 'three';
import { lavaAt } from './world.js';
import { Mat } from '../engine/materials.js';
import { bushGeo } from './pois.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

export const TACTICALS = {
  granada:  { n: 'Granada',            c: 0x4d7c0f, led: 0xff3b3b, icon: 'gren' },
  impulso:  { n: 'Granada de Impulso', c: 0x2563eb, led: 0x93c5fd, icon: 'shock' },
  escudo:   { n: 'Splash de Escudo',   c: 0x38bdf8, led: 0xe0f2fe, icon: 'splash' },
  fumo:     { n: 'Granada de Fumo',    c: 0x6b7280, led: 0xf5f5f4, icon: 'smoke' },
  arbusto:  { n: 'Arbusto',            c: 0x4d7c0f, led: 0x86efac, icon: 'bush', instant: true }
};
export const TAC_ORDER = Object.keys(TACTICALS);

export class FortExtras {
  constructor(m){
    this.m = m; this.smokes = []; this.splashes = []; this.spots = []; this.fishing = null;
    this.visited = new Set();
    this.mats = {};
    for(const k of TAC_ORDER) this.mats[k] = [Mat.paint(TACTICALS[k].c), Mat.emissive(TACTICALS[k].led, 3)];
    this.smokeMat = new THREE.MeshLambertMaterial({ color: 0xd6d3d1, transparent: true, opacity: 0.0, depthWrite: false });
    this.smokeGeo = new THREE.IcosahedronGeometry(1, 2);
    if(!m.world.empty) this._buildFishing();
  }
  // ---------------- táticos ----------------
  count(actor, k){ return (actor.tac && actor.tac[k]) || 0; }
  cycle(actor){
    const i0 = TAC_ORDER.indexOf(actor.tacSel || 'granada');
    for(let s = 1; s <= TAC_ORDER.length; s++){ const k = TAC_ORDER[(i0 + s) % TAC_ORDER.length]; if(this.count(actor, k) > 0){ actor.tacSel = k; return k; } }
    actor.tacSel = TAC_ORDER[(i0 + 1) % TAC_ORDER.length]; return actor.tacSel;
  }
  use(actor, dir, power, kind){
    kind = kind || actor.tacSel || 'granada';
    if(this.count(actor, kind) <= 0){ return false; }
    if(TACTICALS[kind].instant){
      if(kind === 'arbusto'){ if(actor.bush || actor.mode !== 'ground') return false; actor.tac.arbusto--; this.wearBush(actor); this.m.quest('tac'); return true; }
      return false;
    }
    const ok = this.m.fs.throwGrenade(actor, dir, power, kind);
    if(ok && actor.isPlayer) this.m.quest('tac');
    return ok;
  }
  /** chamado pelo FortSystems quando uma granada não explosiva rebenta */
  detonate(g){
    const k = g.kind;
    if(k === 'impulso') this.shock(g.pos.clone(), g.owner);
    else if(k === 'escudo') this.splash(g.pos.clone(), g.owner);
    else if(k === 'fumo') this.smoke(g.pos.clone());
  }
  shock(pos, owner){
    const m = this.m, r = 15;
    m.particles.emit('magic', pos, { color: 0x93c5fd, n: 40 }); m.particles.emit('dust', pos, { n: 20, power: 3 });
    m.particles.flash(pos.clone().setY(pos.y + 1.5), 0x60a5fa, 30, 0.35, 50);
    m.audio.play('woosh', pos, { vol: 1.2, rate: 0.5 }); m.audio.play('jump', pos, { vol: 0.8, rate: 0.5 });
    this._ring(pos, 0x60a5fa, r);
    for(const a of m.actors){
      if(!a.alive || a.onBus || a.remote) continue;
      const d = a.root.position.distanceTo(pos); if(d > r) continue;
      const k = _a.subVectors(a.root.position, pos).setY(0); if(k.lengthSq() < 0.01) k.set(Math.sin(a.yaw), 0, Math.cos(a.yaw)); k.normalize();
      if(a.mode === 'zip' && m.fs) m.fs.detachZip(a, false);
      if(a.mode === 'ground'){ a.slideT = 0; a.body.vel.x = k.x * 48; a.body.vel.z = k.z * 48; a.body.vel.y = 44; a.body.grounded = false; a.anim.play('launch'); }
      if(a.isPlayer) m.tps.addTrauma(0.35);
      if(a.brain) a.brain.hear(pos);
    }
    for(const S of m.structures.slice()) if(S.alive && S.mesh.position.distanceTo(pos) < r) m.damageStructure(S, 45, S.mesh.position.clone());
  }
  splash(pos, owner){
    const m = this.m, r = 9;
    m.particles.emit('splash', pos, { n: 30 }); m.particles.emit('magic', pos, { color: 0x7dd3fc, n: 30 });
    m.audio.play('water', pos, { vol: 0.9, rate: 1.6 }); m.audio.play('gulp', pos, { vol: 0.6 });
    this._ring(pos, 0x38bdf8, r);
    for(const a of m.actors){
      if(!a.alive || a.onBus) continue;
      if(owner && a !== owner && !(m.isAlly && m.isAlly(owner, a))) continue;
      if(a.root.position.distanceTo(pos) > r) continue;
      if(a.hp < 100) a.hp = Math.min(100, a.hp + 20); else a.shield = Math.min(100, a.shield + 20);
      if(a.isPlayer){ m.toast('Splash! +20'); m._floatText && m._floatText(a.root.position.clone().setY(a.root.position.y + 7), '+20'); }
    }
  }
  smoke(pos){
    const m = this.m, g = new THREE.Group(); g.position.copy(pos); g.userData.noProbe = true;
    const mat = this.smokeMat.clone(); const puffs = [];
    for(let i = 0; i < 14; i++){ const s = new THREE.Mesh(this.smokeGeo, mat); const a = i / 14 * Math.PI * 2, rr = 2 + (i % 3) * 2.4; s.position.set(Math.cos(a) * rr, 1.5 + (i % 4) * 1.6, Math.sin(a) * rr); s.userData.sc = 3 + (i % 3) * 1.3; s.scale.setScalar(0.1); g.add(s); puffs.push(s); }
    m.scene.add(g); m.audio.play('woosh', pos, { vol: 0.7, rate: 0.4 });
    this.smokes.push({ g, mat, puffs, pos, t: 14, life: 14, r: 10 });
  }
  /** a linha a→b atravessa uma nuvem de fumo? (usado pela IA) */
  smokeBlocks(a, b){
    for(const s of this.smokes){
      if(s.t < 0.6 || s.life - s.t < 0.5) continue;
      const c = _b.copy(s.pos).setY(s.pos.y + 4);
      const ab = _a.subVectors(b, a), L2 = ab.lengthSq(); if(L2 < 0.001) continue;
      const t = Math.max(0, Math.min(1, ((c.x - a.x) * ab.x + (c.y - a.y) * ab.y + (c.z - a.z) * ab.z) / L2));
      const px = a.x + ab.x * t - c.x, py = a.y + ab.y * t - c.y, pz = a.z + ab.z * t - c.z;
      if(px * px + py * py + pz * pz < s.r * s.r) return true;
    }
    return false;
  }
  wearBush(actor){
    const g = new THREE.Group();
    const geo = bushGeo(); const mat = new THREE.MeshStandardMaterial({ vertexColors: !!geo.attributes.color, color: geo.attributes.color ? 0xffffff : 0x3f7f2a, roughness: 0.85, flatShading: false });
    for(const [x, y, z, s] of [[0, 0, 0, 1.2], [0.2, 3.4, 0.1, 0.95], [-0.2, 5.6, -0.1, 0.62]]){ const b = new THREE.Mesh(geo, mat); b.position.set(x, y, z); b.scale.setScalar(s); b.castShadow = true; g.add(b); }
    actor.root.add(g); actor.bush = g;
    this.m.particles.emit('magic', actor.root.position.clone().setY(actor.root.position.y + 3), { n: 14, color: 0x4ade80 });
    this.m.audio.play('build', actor.root.position, { vol: 0.4, rate: 1.5 });
    if(actor.isPlayer) this.m.toast('Estás disfarçado de arbusto — os bots não te veem ao longe');
  }
  dropBush(actor){
    if(!actor.bush) return;
    actor.root.remove(actor.bush); actor.bush = null;
    this.m.particles.emit('magic', actor.root.position.clone().setY(actor.root.position.y + 3), { n: 18, color: 0x4ade80 });
    if(actor.isPlayer) this.m.toast('O arbusto caiu');
  }
  _ring(pos, color, r){
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.copy(pos).setY(pos.y + 0.3); ring.userData.noProbe = true; this.m.scene.add(ring);
    this.splashes.push({ ring, t: 0.6, r });
  }
  // ---------------- pesca ----------------
  _buildFishing(){
    const pts = [[-60, -40], [-48, -30], [-72, -50], [-120, -135], [-100, -115], [-78, -84]];
    const ringM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
    for(const [x, z] of pts){
      const g = new THREE.Group(); g.position.set(x, -1.25, z); g.userData.noProbe = true;
      const rings = [];
      for(let i = 0; i < 3; i++){ const r = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 28), ringM.clone()); r.rotation.x = -Math.PI / 2; g.add(r); rings.push(r); }
      const fish = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), Mat.paint(0xf59e0b)); fish.scale.set(1.8, 0.8, 0.6); fish.visible = false; g.add(fish);
      this.m.scene.add(g);
      this.spots.push({ g, rings, fish, pos: new THREE.Vector3(x, -1.25, z), cd: 0, t: Math.random() * 5 });
    }
  }
  _nearSpot(P){ return this.spots.find(s => s.cd <= 0 && Math.hypot(s.pos.x - P.root.position.x, s.pos.z - P.root.position.z) < 12); }
  interact(P){
    if(this.fishing) return true;
    if(P.mode !== 'ground') return false;
    const s = this._nearSpot(P); if(!s) return false;
    this.fishing = { a: P, s, t: 2.4, p0: P.root.position.clone() };
    P.anim.play('pickaxeSwing3', { speed: 0.6 });
    this.m.audio.play('woosh', P.root.position, { vol: 0.4, rate: 1.6 });
    this.m.toast('A pescar… não te mexas');
    return true;
  }
  hint(P){
    if(this.fishing) return 'A pescar… <b>' + Math.max(0, this.fishing.t).toFixed(1) + 's</b>';
    if(P.mode === 'ground' && this._nearSpot(P)) return '<kbd>E</kbd> Pescar no cardume';
    return null;
  }
  _catch(a, s){
    const m = this.m, r = Math.random();
    s.cd = 35; s.fish.visible = true; s.jump = 0;
    m.particles.emit('splash', s.pos, { n: 18 }); m.audio.play('water', s.pos, { vol: 0.8, rate: 1.8 });
    let msg;
    if(r < 0.4){ a.shield = Math.min(100, a.shield + 30); msg = 'Peixe-escudo! +30 escudo'; }
    else if(r < 0.75){ a.hp = Math.min(100, a.hp + 25); msg = 'Peixe-vida! +25 vida'; }
    else if(r < 0.92){ a.launch && a.launch(85); msg = 'Peixe-voador! Abre o planador'; }
    else { const t = ['impulso', 'escudo', 'fumo', 'arbusto'][Math.floor(Math.random() * 4)]; a.tac[t]++; msg = 'Pescaste: ' + TACTICALS[t].n; }
    if(a.isPlayer){ m.toast(msg); m.quest('fish'); }
  }
  // ---------------- missões (encaminha para o App) ----------------
  visit(name){ if(this.visited.has(name)) return; this.visited.add(name); this.m.quest('loc'); }
  // ---------------- update ----------------
  update(dt){
    const m = this.m;
    // v18: lava da cratera — queima e faz saltar (como no Fortnite)
    for(const a of m.actors){
      if(!a.alive || a.mode !== 'ground') continue;
      const p = a.body.pos, lv = lavaAt(p.x, p.z);
      if(lv === null || p.y > lv + 1.6) continue;
      a.body.vel.y = 30; a.body.grounded = false; p.y = lv + 1.7;
      if(m.time - (a._lavaT || -9) > 0.45){ a._lavaT = m.time; a.takeDamage(9, null, false); m.particles.emit('fire', p.clone().setY(p.y + 1), { n: 10 }); if(a.isPlayer){ m.audio.play('hurt', null, { vol: 0.6 }); m.toast('Lava! Sai da cratera'); } }
    }
    for(let i = this.smokes.length - 1; i >= 0; i--){
      const s = this.smokes[i]; s.t -= dt; const age = s.life - s.t;
      const k = Math.min(1, age / 1.2) * Math.min(1, s.t / 2);
      s.mat.opacity = 0.86 * k;
      s.puffs.forEach((p, j) => { p.scale.setScalar(p.userData.sc * (0.4 + 0.6 * Math.min(1, age / 1.2)) * (1 + Math.sin(m.time * 0.8 + j) * 0.06)); p.position.y += dt * 0.12; });
      if(s.t <= 0){ m.scene.remove(s.g); s.mat.dispose(); this.smokes.splice(i, 1); }
    }
    for(let i = this.splashes.length - 1; i >= 0; i--){ const s = this.splashes[i]; s.t -= dt; const u = 1 - s.t / 0.6; s.ring.scale.setScalar(1 + u * s.r); s.ring.material.opacity = 0.8 * (1 - u); if(s.t <= 0){ m.scene.remove(s.ring); s.ring.geometry.dispose(); s.ring.material.dispose(); this.splashes.splice(i, 1); } }
    for(const s of this.spots){
      s.t += dt; s.cd -= dt;
      const on = s.cd <= 0; s.g.visible = true;
      s.rings.forEach((r, i) => { const u = ((s.t * 0.6 + i / 3) % 1); r.scale.setScalar(on ? 1 + u * 3.5 : 0.001); r.material.opacity = 0.55 * (1 - u); });
      if(s.fish.visible){ s.jump += dt; const u = s.jump / 0.9; s.fish.position.set(0, Math.sin(Math.min(1, u) * Math.PI) * 4, 0); s.fish.rotation.z = -1.4 + u * 2.8; if(u >= 1) s.fish.visible = false; }
      else if(on && Math.random() < dt * 0.15){ s.fish.visible = true; s.jump = 0; }
    }
    const F = this.fishing;
    if(F){
      F.t -= dt;
      if(!F.a.alive || F.a.root.position.distanceTo(F.p0) > 1.5 || F.a.mode !== 'ground'){ this.fishing = null; if(F.a.isPlayer) m.toast('Pesca cancelada'); }
      else if(F.t <= 0){ this.fishing = null; this._catch(F.a, F.s); }
    }
  }
  dispose(){}
}
