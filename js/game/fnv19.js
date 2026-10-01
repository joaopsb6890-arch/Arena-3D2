// ============================================================
// FORT V19 — muitos sistemas novos:
//   · Resistência (barra) para a ESCALADA (segurar ESPAÇO + frente contra paredes, rochas, árvores)
//   · Carris de deslize (grind rails) — salta para cima de um carril e desliza a alta velocidade
//   · Forrageio: maçãs (+5 vida) debaixo das árvores e cogumelos de escudo (+5 escudo)
//   · Fogueiras aquecem e curam (+3 vida/s) quando estás perto
//   · Moedas de XP espalhadas (verdes, roxas no alto, douradas no topo do que se escala)
//   · Cogumelos saltitões no Pântano Sombrio
//   · Chuva de meteoros com aviso no chão
//   · Quadros de recompensa: aceita um alvo e elimina-o a tempo → ouro + XP
//   · Chefe Trovão (bot reforçado com coroa) → larga Medalhão (regenera escudo) e Cartão do Cofre
//   · Cofre da Base Científica (abre com o cartão → armas lendárias)
//   · Bancadas de melhoria (sobe a raridade da arma por ouro)
//   · Zona quente (local sorteado com loot e ouro extra)
//   · Sequências de abates (dupla, tripla…) com bónus
// ============================================================
import * as THREE from 'three';
import { heightAt, MAP_R } from './world.js';
import { Mat } from '../engine/materials.js';
import { LOCATIONS, locationAt } from './pois.js';
import { RARITY, GUNS } from './weapons.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const $ = (id) => document.getElementById(id);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
let _seed = 98765; const rnd = () => ((_seed = (_seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const STREAK = ['', '', 'ABATE DUPLO', 'ABATE TRIPLO', 'ABATE QUÁDRUPLO', 'MASSACRE'];

export class FortV19 {
  constructor(m){
    this.m = m; this.W = m.world; const W = this.W, poi = W.poi || {};
    _seed = 98765;
    const md = m.modeId || 'br';
    this.br = ['br', 'zb', 'blitz'].includes(md) && !m.layout;
    this.solo = !m.session;                      // eventos que dependem dos bots só fora do multijogador
    this.full = md !== 'creative' && !m.layout && !W.empty;
    this.rails = []; this.food = []; this.coins = []; this.meteors = []; this.drops = []; this.benches = []; this.boards = [];
    this.bounce = poi.bounce || []; this.streak = { n: 0, t: 0 };
    this.bounty = null; this.boss = null; this.medal = false; this.card = false; this.hot = null;
    this.meteorT = 75 + Math.random() * 30;
    this.group = new THREE.Group(); m.scene.add(this.group);
    if(this.full){
      this._rails(); this._food(); this._coins(); this._benches(poi.benches || []); this._boards(poi.boards || []);
      if(poi.vault) this._vault(poi.vault);
      if(this.br && this.solo) this._hotZone();
    }
    // ganchos: baús e mortes
    const oc = m.openChestBy.bind(m); m.openChestBy = (a, c) => { const was = c.opened; oc(a, c); if(!was && c.opened) this._onChest(a, c); };
    const od = m.onActorDeath.bind(m); m.onActorDeath = (v, k) => { od(v, k); this._onDeath(v, k); };
    this._hud();
  }
  // ---------------- HUD (resistência + medalhão) ----------------
  _hud(){
    let el = $('stamina'); if(!el){ el = document.createElement('div'); el.id = 'stamina'; el.innerHTML = '<i></i><span>RESISTÊNCIA</span>'; const v = $('vitals'); (v ? v.parentNode : document.body).insertBefore(el, v ? v.nextSibling : null); }
    this.stEl = el; this.stFill = el.querySelector('i');
    let md = $('medal-tag'); if(!md){ md = document.createElement('div'); md.id = 'medal-tag'; md.innerHTML = '<b>MEDALHÃO</b><span>Escudo regenera</span>'; document.body.appendChild(md); }
    md.style.display = 'none'; this.medEl = md;
  }
  // ---------------- carris de deslize ----------------
  _rails(){
    const defs = [
      [[30, 40], [60, 70], [100, 80], [140, 60], [170, 30]],                   // Praça → Recanto Leste
      [[-200, 600], [-160, 560], [-120, 540], [-80, 520], [-30, 505]],         // Ruínas → Templo
      [[600, 160], [630, 130], [660, 110], [700, 100]],                        // Cidade Fantasma
      [[-430, -440], [-400, -420], [-360, -380], [-330, -330], [-310, -290]],  // Estância → Pico
      [[-560, 220], [-520, 190], [-490, 140], [-480, 90]],                     // Pântano → Moinhos
      [[380, -330], [420, -290], [450, -240], [470, -190]]                     // Base → Porto
    ];
    for(const d of defs) this.addRail(d.map(([x, z], i) => V(x, heightAt(x, z) + 3.2 + Math.sin(i * 1.3) * 1.2, z)));
  }
  /** v20: carril genérico (também usado pela montanha-russa do Parque Radical) */
  addRail(pts, opts){
    opts = opts || {};
    const railM = Mat.metal(opts.color || 0xe2e8f0, 0.25), postM = Mat.metal(0x475569, 0.5), glowM = Mat.emissive(opts.glow || 0x38bdf8, 1.6);
    {
      const curve = new THREE.CatmullRomCurve3(pts, !!opts.closed); const len = curve.getLength();
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.ceil(len / 3), 0.32, 8, !!opts.closed), railM); tube.castShadow = true;
      const glow = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.ceil(len / 3), 0.12, 5, !!opts.closed), glowM); glow.position.y = 0.3;
      this.group.add(tube, glow);
      const samples = []; const n = Math.ceil(len / 2);
      for(let i = 0; i <= n; i++){ const t = i / n, p = curve.getPointAt(t); samples.push({ t, p });
        if(i % 6 === 0){ const g = heightAt(p.x, p.z); const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, p.y - g, 6), postM); post.position.set(p.x, (p.y + g) / 2 - 0.2, p.z); this.group.add(post); } }
      const R = { curve, len, samples, closed: !!opts.closed, maxSp: opts.maxSp }; this.rails.push(R); return R;
    }
  }
  _nearRail(pos, r){
    let best = null, bd = r;
    for(const R of this.rails) for(const s of R.samples){ const dx = s.p.x - pos.x, dz = s.p.z - pos.z, dy = pos.y - s.p.y; if(dy < -1.2 || dy > 3.5) continue; const d = Math.hypot(dx, dz); if(d < bd){ bd = d; best = { R, t: s.t }; } }
    return best;
  }
  railStep(a, dt){
    const r = a.rail, R = r.R, b = a.body;
    r.sp = Math.min(R.maxSp || 46, r.sp + dt * 8);
    r.t += r.dir * r.sp * dt / R.len;
    if(R.closed){ r.t = (r.t + 1) % 1; r.laps = (r.laps || 0) + dt; }
    if((!R.closed && (r.t <= 0 || r.t >= 1)) || !a.alive){ this.leaveRail(a, true); return; }
    const p = R.curve.getPointAt(r.t), tan = R.curve.getTangentAt(r.t).multiplyScalar(r.dir);
    b.pos.set(p.x, p.y + 0.35, p.z); b.vel.copy(tan).multiplyScalar(r.sp); b.grounded = true;
    a.root.position.copy(b.pos);
    if(Math.random() < 0.6) this.m.particles.emit('impact', b.pos, { n: 1, color: 0x7dd3fc });
    this._sparkT = (this._sparkT || 0) - dt; if(this._sparkT <= 0){ this._sparkT = 0.16; this.m.audio.play('woosh', b.pos, { vol: 0.12, rate: 2.2 }); }
  }
  leaveRail(a, launch){
    if(!a.rail) return;
    const b = a.body, sp = a.rail.sp; a.rail = null; a._railCd = 0.5;
    if(launch){ b.vel.y = Math.max(b.vel.y, 18); } b.grounded = false; a.slideT = 0;
    if(a.isPlayer) this.m.audio.play('jump', b.pos, { vol: 0.4 });
    return sp;
  }
  _tryRail(a){
    if(a.rail || (a._railCd || 0) > 0 || a.mode !== 'ground' || a.climbing) return;
    const b = a.body; if(b.grounded && Math.hypot(b.vel.x, b.vel.z) < 2) return;
    const n = this._nearRail(b.pos, 1.8); if(!n) return;
    const tan = n.R.curve.getTangentAt(n.t), dir = tan.x * b.vel.x + tan.z * b.vel.z >= 0 ? 1 : -1;
    a.rail = { R: n.R, t: n.t, dir, sp: Math.max(26, Math.hypot(b.vel.x, b.vel.z)) };
    if(a.isPlayer){ this.m.toast('Carril! ESPAÇO para saltar'); if(this.m.quest) this.m.quest('rail'); }
  }
  // ---------------- forrageio ----------------
  _food(){
    const W = this.W, apples = [], shrooms = [];
    const round = (W.trees || []).filter(t => !t.pine && !t.ed); const pines = (W.trees || []).filter(t => t.pine && !t.ed);
    for(let i = 0; i < 160 && round.length; i++){ const t = round[Math.floor(rnd() * round.length)]; const a = rnd() * 6.28, x = t.x + Math.cos(a) * 3.2, z = t.z + Math.sin(a) * 3.2; apples.push({ x, z, y: heightAt(x, z) + 0.35 }); }
    for(let i = 0; i < 90 && pines.length; i++){ const t = pines[Math.floor(rnd() * pines.length)]; const a = rnd() * 6.28, x = t.x + Math.cos(a) * 2.8, z = t.z + Math.sin(a) * 2.8; shrooms.push({ x, z, y: heightAt(x, z) }); }
    for(let i = 0; i < 24; i++){ const a = rnd() * 6.28, r = 64 + rnd() * 22, x = -640 + Math.cos(a) * r, z = 240 + Math.sin(a) * r; shrooms.push({ x, z, y: heightAt(x, z) }); }
    const aGeo = new THREE.SphereGeometry(0.55, 12, 8), aMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35, emissive: 0x3f0000, emissiveIntensity: 0.4 });
    const sGeo = (() => { const cap = new THREE.SphereGeometry(0.7, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); cap.translate(0, 0.8, 0); const st = new THREE.CylinderGeometry(0.2, 0.25, 0.9, 6); st.translate(0, 0.45, 0); const g = mergeGeo([cap, st]); return g; })();
    const sMat = new THREE.MeshStandardMaterial({ color: 0x60a5fa, roughness: 0.4, emissive: 0x1d4ed8, emissiveIntensity: 0.9 });
    const mk = (geo, mat, list, kind) => { const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((o, i) => { _m.compose(_a.set(o.x, o.y, o.z), _q.identity(), _s.set(1, 1, 1)); im.setMatrixAt(i, _m); this.food.push({ kind, x: o.x, y: o.y, z: o.z, im, i, alive: true }); }); im.castShadow = true; im.userData.noProbe = true; this.group.add(im); };
    if(apples.length) mk(aGeo, aMat, apples, 'apple'); if(shrooms.length) mk(sGeo, sMat, shrooms, 'shroom');
  }
  // ---------------- moedas de XP ----------------
  _coins(){
    const W = this.W, spots = [];
    for(const L of LOCATIONS){ for(let k = 0; k < 2; k++){ const a = rnd() * 6.28, r = L.r * (0.3 + rnd() * 0.5), x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r; spots.push([x, W.physics.groundAt(x, z, 999, 0) + 2.4, z, 0]); } }
    for(const [x, z, y] of (W.poi && W.poi.climbTops) || []) spots.push([x, y + 2.4, z, 2]);
    for(let i = 0; i < 26; i++){ const a = rnd() * 6.28, d = 60 + Math.sqrt(rnd()) * (MAP_R - 110), x = Math.cos(a) * d, z = Math.sin(a) * d; spots.push([x, W.physics.groundAt(x, z, 999, 0) + 2.4, z, rnd() < 0.25 ? 1 : 0]); }
    const geo = new THREE.CylinderGeometry(1.1, 1.1, 0.25, 20); geo.rotateX(Math.PI / 2);
    const mats = [Mat.emissive(0x4ade80, 1.8), Mat.emissive(0xc084fc, 2.0), Mat.emissive(0xfbbf24, 2.2)];
    for(let t = 0; t < 3; t++){
      const list = spots.filter(s => s[3] === t); if(!list.length) continue;
      const im = new THREE.InstancedMesh(geo, mats[t], list.length); im.userData.noProbe = true; im.frustumCulled = false;
      list.forEach((s, i) => this.coins.push({ x: s[0], y: s[1], z: s[2], xp: [50, 100, 250][t], tier: t, im, i, alive: true }));
      this.group.add(im);
    }
  }
  // ---------------- bancadas de melhoria ----------------
  _benches(list){
    const top = Mat.wood(0x8b5a2b), metal = Mat.metal(0x64748b, 0.4), glow = Mat.emissive(0x22d3ee, 1.8);
    for(const [x, z, r] of list){
      const y = this.W.physics.groundAt(x, z, 999, 0);
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = r || 0;
      const t = new THREE.Mesh(new THREE.BoxGeometry(5, 0.4, 2.4), top); t.position.y = 2.6;
      for(const sx of [-1, 1]) for(const sz of [-1, 1]){ const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, 0.3), metal); l.position.set(sx * 2.2, 1.3, sz * 0.9); g.add(l); }
      const vise = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), metal); vise.position.set(-1.6, 3.2, 0);
      const holo = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), glow); holo.position.set(0.6, 3.8, 0);
      g.add(t, vise, holo); g.traverse(o => { if(o.isMesh){ o.castShadow = true; } });
      this.group.add(g); this.W.physics.addBox(V(x - 2.6, y, z - 2.6), V(x + 2.6, y + 2.8, z + 2.6));
      this.benches.push({ pos: V(x, y, z), holo });
    }
  }
  _benchCost(rar){ return [150, 250, 350, 450][rar] ?? null; }
  // ---------------- quadros de recompensa ----------------
  _boards(list){
    const wood = Mat.wood(0x6b4a2f), paper = Mat.paint(0xfef3c7), red = Mat.emissive(0xef4444, 1.4);
    for(const [x, z, r] of list){
      const y = this.W.physics.groundAt(x, z, 999, 0);
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = r || 0;
      for(const sx of [-1, 1]){ const p = new THREE.Mesh(new THREE.BoxGeometry(0.35, 6, 0.35), wood); p.position.set(sx * 2.4, 3, 0); g.add(p); }
      const bd = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.2, 0.3), wood); bd.position.y = 4.2;
      const pp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 0.05), paper); pp.position.set(-1.2, 4.2, 0.18);
      const pp2 = pp.clone(); pp2.position.x = 1.0; pp2.rotation.z = 0.1;
      const sk = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), red); sk.position.set(-1.2, 4.5, 0.25);
      g.add(bd, pp, pp2, sk); g.traverse(o => { if(o.isMesh) o.castShadow = true; });
      this.group.add(g); this.W.physics.addCircle(x, z, 1.2, y + 6);
      this.boards.push({ pos: V(x, y, z) });
    }
  }
  // ---------------- cofre ----------------
  _vault([x, z, r]){
    const y = this.W.physics.groundAt(x, z, 999, 0), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = r;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(10, 9, 3), Mat.concrete(0x4b5563)); frame.position.y = 4.5;
    const door = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.8, 28), Mat.metal(0x9ca3af, 0.25)); door.rotation.x = Math.PI / 2; door.position.set(0, 4.2, 1.6);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.16, 8, 20), Mat.metal(0xfbbf24, 0.2)); wheel.position.set(0, 4.2, 2.1);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), Mat.emissive(0xef4444, 3).clone()); lamp.position.set(3.8, 7.6, 1.6);
    g.add(frame, door, wheel, lamp); g.traverse(o => { if(o.isMesh) o.castShadow = true; });
    this.group.add(g); this.W.physics.addBox(V(x - 5, y, z - 1.6), V(x + 5, y + 9, z + 1.6));
    this.vault = { pos: V(x, y, z).add(V(Math.sin(r) * 3, 0, Math.cos(r) * 3)), door, wheel, lamp, opened: false, t: 0, r };
  }
  // ---------------- zona quente ----------------
  _hotZone(){
    const pool = LOCATIONS.filter(L => !['Deserto Seco', 'Rio Serpente', 'Lago Sereno', 'Cratera Vulcânica'].includes(L.n));
    const L = pool[Math.floor(Math.random() * pool.length)]; this.hot = L;
    for(let i = 0; i < 3; i++){ const a = Math.random() * 6.28, r = L.r * 0.4 * Math.random(), x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r;
      this.W.spawnPickup(GUNS[Math.floor(Math.random() * GUNS.length)], V(x, this.W.physics.groundAt(x, z, 999, 0) + 0.4, z), 1, { rar: 3 }); }
    const ring = new THREE.Mesh(new THREE.RingGeometry(L.r - 2, L.r, 64), new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(L.x, heightAt(L.x, L.z) + 0.6, L.z); ring.userData.noProbe = true; this.group.add(ring); this.hotRing = ring;
    setTimeout(() => this.m.toast && this.m.toast('ZONA QUENTE: ' + L.n.toUpperCase() + ' (loot e ouro a dobrar)'), 2500);
  }
  // ---------------- chefe ----------------
  _boss(){
    const bots = this.m.bots.filter(b => !b.remote && !b.isPlayer); if(!bots.length) return;
    const b = bots[Math.floor(Math.random() * bots.length)];
    b.boss = true; b.name = 'Chefe Trovão'; b.hp = 100; b.shield = 100; b.bossArmor = 150;
    // coroa dourada
    const J = b.ch.J || {}, head = J.head || b.root;
    const crown = new THREE.Group(); const gold = Mat.metal(0xfbbf24, 0.2);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.4, 14, 1, true), gold); crown.add(band);
    for(let i = 0; i < 6; i++){ const sp = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), gold); const a = i / 6 * 6.28; sp.position.set(Math.cos(a) * 0.75, 0.42, Math.sin(a) * 0.75); crown.add(sp); }
    crown.position.set(0, 1.25, 0); head.add(crown);
    b.dropTarget = V(330, 0, -400);   // salta para a Base Científica
    this.boss = b;
  }
  // ---------------- eventos ----------------
  _onChest(a, c){
    if(!a || !a.isPlayer) return;
    if(this.hot && Math.hypot(c.pos.x - this.hot.x, c.pos.z - this.hot.z) < this.hot.r && this.m.sys) this.m.sys.addGold(a, 50, c.pos);
  }
  _onDeath(v, k){
    const m = this.m, P = m.player;
    if(v === this.boss){
      const p = v.root.position.clone();
      this._drop('medal', p.clone().add(V(2, 0, 0))); this._drop('card', p.clone().add(V(-2, 0, 1)));
      if(k && k.isPlayer) m.toast('CHEFE ELIMINADO! Apanha o Medalhão e o Cartão', 'kill');
      this.boss = null;
    }
    if(this.bounty && v === this.bounty.target){
      if(k && k.isPlayer){ if(m.sys) m.sys.addGold(k, 300, v.root.position); this._xp(200, 'Recompensa'); m.toast('RECOMPENSA CUMPRIDA +300 ouro', 'kill'); }
      else m.toast('Alvo da recompensa eliminado por outro');
      this._clearBounty();
    }
    if(k && k.isPlayer && v !== k){
      const t = m.time || 0; this.streak.n = t - this.streak.t < 12 ? this.streak.n + 1 : 1; this.streak.t = t;
      if(this.streak.n >= 2){ const lbl = STREAK[Math.min(5, this.streak.n)]; setTimeout(() => m.toast(lbl + ' +' + this.streak.n * 40 + ' ouro', 'kill'), 900); if(m.sys) m.sys.addGold(k, this.streak.n * 40, v.root.position); }
    }
    if(v === P && P.medal){ P.medal = false; this.medEl.style.display = 'none'; }
  }
  _drop(kind, pos){
    pos.y = this.W.physics.groundAt(pos.x, pos.z, pos.y + 4, 0) + 1.4;
    const mesh = kind === 'medal'
      ? new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.28, 10, 24), Mat.emissive(0xfbbf24, 2.4))
      : new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.12), Mat.emissive(0x22d3ee, 2.2));
    mesh.position.copy(pos); this.group.add(mesh);
    this.drops.push({ kind, mesh, pos, t: 0 });
  }
  _xp(n, why){
    const app = this.m.app || window.__app; if(app && app.career){ app.career.xp = (app.career.xp || 0) + n; try { app.store && app.store.set('career', app.career); } catch(e){} }
    const P = this.m.player; this.m._floatText(P.root.position.clone().setY(P.root.position.y + 8), '+' + n + ' XP' + (why ? ' · ' + why : ''), 'xp');
  }
  _clearBounty(){ if(this.bounty && this.bounty.mark) this.bounty.mark.parent && this.bounty.mark.parent.remove(this.bounty.mark); this.bounty = null; }
  _acceptBounty(P){
    const cand = this.m.bots.filter(b => b.alive && !b.remote && !b.onBus && b !== this.boss && !this.m.isAlly(P, b));
    if(!cand.length){ this.m.toast('Sem alvos disponíveis'); return; }
    cand.sort((a, b) => a.root.position.distanceTo(P.root.position) - b.root.position.distanceTo(P.root.position));
    const t = cand[Math.min(cand.length - 1, 1 + Math.floor(Math.random() * 3))];
    const mark = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), Mat.emissive(0xef4444, 3)); mark.position.y = 12; t.root.add(mark);
    this.bounty = { target: t, t: 150, mark };
    this.m.toast('RECOMPENSA: elimina ' + t.name + ' em 150 s'); this.m.audio.play('ui', null, { vol: 0.6, rate: 0.8 });
  }
  // ---------------- interação ----------------
  interact(P){
    if(P.rail){ this.leaveRail(P, true); return true; }
    const near = (list, d) => list.find(o => o.pos.distanceTo(P.root.position) < d);
    const bn = near(this.benches, 6.5);
    if(bn){
      const w = P.weaponType; if(!w || w === 'pickaxe' || w === 'none'){ this.m.toast('Equipa uma arma para melhorar'); return true; }
      const rar = P.rar[w] || 0, cost = this._benchCost(rar);
      if(cost === null){ this.m.toast('Esta arma já é Lendária'); return true; }
      if((P.gold || 0) < cost){ this.m.toast('Precisas de ' + cost + ' ouro'); return true; }
      P.gold -= cost; P.rar[w] = rar + 1; this.m.audio.play('build', bn.pos, { vol: 0.8, rate: 1.4 });
      this.m.particles.emit('magic', bn.pos.clone().setY(bn.pos.y + 4), { n: 24, color: RARITY[rar + 1].color });
      this.m.toast('Arma melhorada para ' + RARITY[rar + 1].label.toUpperCase()); this.m._updateSlotsUI && this.m._updateSlotsUI();
      if(this.m.quest) this.m.quest('upgrade');
      return true;
    }
    const bd = near(this.boards, 6);
    if(bd){ if(!this.solo){ this.m.toast('Recompensas só no modo individual'); return true; } if(this.bounty){ this.m.toast('Já tens uma recompensa ativa'); return true; } this._acceptBounty(P); return true; }
    const v = this.vault;
    if(v && !v.opened && v.pos.distanceTo(P.root.position) < 7){
      if(!P.vaultCard){ this.m.toast('Precisas do Cartão do Cofre (o Chefe Trovão tem um)'); return true; }
      P.vaultCard = false; v.opened = true; v.lamp.material.color.set(0x22c55e); v.lamp.material.emissive && v.lamp.material.emissive.set(0x22c55e);
      for(let i = 0; i < 3; i++) this.W.spawnPickup(GUNS[Math.floor(Math.random() * GUNS.length)], v.pos.clone().add(V(-3 + i * 3, 0.4, 2)), 1, { rar: i === 1 ? 3 : 4 });
      if(this.m.sys) this.m.sys.addGold(P, 400, v.pos);
      this.m.toast('COFRE ABERTO'); this.m.audio.play('chest', v.pos, { vol: 1, rate: 0.7 });
      return true;
    }
    return false;
  }
  hint(P){
    if(P.rail) return '<kbd>ESPAÇO</kbd> Saltar do carril';
    if(P.climbing) return 'A escalar · solta <kbd>ESPAÇO</kbd> para largar';
    const pp = P.root.position;
    const bn = this.benches.find(o => o.pos.distanceTo(pp) < 6.5);
    if(bn){ const w = P.weaponType, rar = (P.rar && P.rar[w]) || 0, c = this._benchCost(rar); return w && w !== 'pickaxe' && c !== null ? '<kbd>E</kbd> Melhorar para ' + RARITY[rar + 1].label + ' · ' + c + ' ouro' : '<kbd>E</kbd> Bancada de melhoria'; }
    if(this.boards.some(o => o.pos.distanceTo(pp) < 6)) return this.bounty ? 'Recompensa ativa: <b>' + this.bounty.target.name + '</b> · ' + Math.ceil(this.bounty.t) + ' s' : '<kbd>E</kbd> Aceitar recompensa (+300 ouro)';
    if(this.vault && !this.vault.opened && this.vault.pos.distanceTo(pp) < 7) return P.vaultCard ? '<kbd>E</kbd> Abrir o cofre' : 'Cofre trancado · precisa de cartão';
    if(this._fireNear) return 'Fogueira · a recuperar vida';
    return null;
  }
  minimapMarks(P){
    const out = [];
    for(const b of this.benches) out.push({ x: b.pos.x, z: b.pos.z, c: '#22d3ee', s: 4, sq: true });
    for(const b of this.boards) out.push({ x: b.pos.x, z: b.pos.z, c: '#ef4444', s: 4, sq: true });
    if(this.vault && !this.vault.opened) out.push({ x: this.vault.pos.x, z: this.vault.pos.z, c: '#94a3b8', s: 5, sq: true });
    if(this.bounty && this.bounty.target.alive){ const p = this.bounty.target.root.position; out.push({ x: p.x, z: p.z, c: '#ef4444', s: 8 }); }
    if(this.boss && this.boss.alive && P && this.boss.root.position.distanceTo(P.root.position) < 220){ const p = this.boss.root.position; out.push({ x: p.x, z: p.z, c: '#fbbf24', s: 8 }); }
    if(this.hot) out.push({ x: this.hot.x, z: this.hot.z, c: '#f97316', s: 9 });
    for(const mt of this.meteors) out.push({ x: mt.pos.x, z: mt.pos.z, c: '#fb7185', s: 7 });
    return out;
  }
  // ---------------- update ----------------
  update(dt){
    const m = this.m, P = m.player, W = this.W; if(!P) return;
    const t = (this._t = (this._t || 0) + dt), pp = P.body.pos;
    if(this.full && this.br && this.solo && !this._bossDone && m.bots.length){ this._bossDone = true; this._boss(); }
    // carris: todos os atores locais
    for(const a of m.actors){ if(a.remote || !a.alive) continue; a._railCd = Math.max(0, (a._railCd || 0) - dt); if(!a.rail && a.isPlayer) this._tryRail(a); }
    if(P.rail && P.jumpHeld && !this._jw){ this.leaveRail(P, true); }
    this._jw = P.jumpHeld;
    // resistência (HUD)
    if(this.stEl){ const f = P.stamina / P.staminaMax, show = P.climbing || f < 0.99; this.stEl.classList.toggle('on', show); this.stFill.style.width = (f * 100).toFixed(1) + '%'; this.stEl.classList.toggle('low', f < 0.25); }
    // cogumelos saltitões
    if(P.alive && P.mode === 'ground') for(const B of this.bounce){ const dx = pp.x - B.x, dz = pp.z - B.z; if(dx * dx + dz * dz < B.r * B.r && Math.abs(pp.y - B.top) < 0.6 && (P.body.grounded || P.body.vel.y <= 0)){ P.body.vel.y = 58; P.body.grounded = false; P.launched = true; P.anim.play('launch', { speed: 1.4 }); m.audio.play('jump', pp, { vol: 0.8, rate: 0.7 }); m.particles.emit('magic', pp, { n: 16, color: 0x22d3ee }); } }
    // forrageio (perto e só se precisares)
    if(P.alive && (this._fq = (this._fq || 0) + 1) % 3 === 0){
      for(const f of this.food){ if(!f.alive) continue; const dx = f.x - pp.x, dz = f.z - pp.z; if(dx * dx + dz * dz > 6.5 || Math.abs(f.y - pp.y) > 3) continue;
        if(f.kind === 'apple' && P.hp >= 100) continue; if(f.kind === 'shroom' && P.shield >= 100) continue;
        f.alive = false; f.im.setMatrixAt(f.i, ZERO); f.im.instanceMatrix.needsUpdate = true;
        if(f.kind === 'apple'){ P.hp = Math.min(100, P.hp + 5); m._floatText(V(f.x, f.y + 2, f.z), '+5 vida', 'heal'); }
        else { P.shield = Math.min(100, P.shield + 5); m._floatText(V(f.x, f.y + 2, f.z), '+5 escudo', 'shield'); }
        m.audio.play('ui', null, { vol: 0.35, rate: 1.5 }); if(m.quest) m.quest('forage');
      }
    }
    // fogueiras curam
    this._fireNear = false;
    if(P.alive && P.hp < 100) for(const F of W.fires || []){ if(F.pos && F.pos.distanceTo(pp) < 9){ this._fireNear = true; this._fh = (this._fh || 0) + dt * 3; if(this._fh >= 1){ const n = Math.floor(this._fh); this._fh -= n; P.hp = Math.min(100, P.hp + n); } break; } }
    // moedas de XP (giram; apanham-se a tocar)
    for(const c of this.coins){
      if(!c.alive) continue;
      _q.setFromEuler(_e.set(0, t * 2.4 + c.i, 0)); _m.compose(_a.set(c.x, c.y + Math.sin(t * 2 + c.i) * 0.35, c.z), _q, _s.set(1, 1, 1)); c.im.setMatrixAt(c.i, _m);
      if(P.alive && Math.abs(c.x - pp.x) < 2.6 && Math.abs(c.z - pp.z) < 2.6 && Math.abs(c.y - pp.y - 2) < 3.4){ c.alive = false; c.im.setMatrixAt(c.i, ZERO); this._xp(c.xp, 'moeda'); m.audio.play('ui', null, { vol: 0.5, rate: 2 }); m.particles.emit('magic', V(c.x, c.y, c.z), { n: 14, color: [0x4ade80, 0xc084fc, 0xfbbf24][c.tier] }); if(m.quest) m.quest('coin'); }
    }
    for(const im of new Set(this.coins.map(c => c.im))) im.instanceMatrix.needsUpdate = true;
    // bancadas: holograma a girar
    for(const b of this.benches){ b.holo.rotation.y += dt * 1.5; b.holo.position.y = 3.8 + Math.sin(t * 2) * 0.15; }
    // cofre a abrir
    if(this.vault && this.vault.opened && this.vault.t < 1){ const v = this.vault; v.t = Math.min(1, v.t + dt * 0.6); v.door.position.x = -v.t * 6; v.wheel.position.x = -v.t * 6; v.wheel.rotation.z += dt * 6; }
    // itens largados pelo chefe
    for(let i = this.drops.length - 1; i >= 0; i--){ const d = this.drops[i]; d.t += dt; d.mesh.rotation.y += dt * 2; d.mesh.position.y = d.pos.y + Math.sin(d.t * 2) * 0.3;
      if(P.alive && d.pos.distanceTo(pp) < 3.6){ this.group.remove(d.mesh); this.drops.splice(i, 1);
        if(d.kind === 'medal'){ P.medal = true; this.medEl.style.display = ''; m.toast('MEDALHÃO: o escudo regenera sozinho'); }
        else { P.vaultCard = true; m.toast('CARTÃO DO COFRE: abre o cofre da Base Científica'); }
        m.audio.play('chest', pp, { vol: 0.7, rate: 1.3 }); } }
    // medalhão: escudo regenera (até 50) se não levares dano há 3 s
    if(P.medal && P.alive){ const hs = P.hp + P.shield; if(hs < (this._lastHS ?? hs)) this._medCd = 3; this._lastHS = hs; this._medCd = Math.max(0, (this._medCd || 0) - dt); if(this._medCd <= 0 && P.shield < 50){ P.shield = Math.min(50, P.shield + dt * 4); this._lastHS = P.hp + P.shield; } }
    // armadura extra do chefe (absorve dano antes do escudo)
    if(this.boss && this.boss.alive){ const b = this.boss; const hs = b.hp + b.shield; if(b._lastHS !== undefined && hs < b._lastHS && b.bossArmor > 0){ const d = Math.min(b.bossArmor, b._lastHS - hs); b.bossArmor -= d; const back = d; const sh = Math.min(100 - b.shield, back); b.shield += sh; b.hp = Math.min(100, b.hp + (back - sh)); } b._lastHS = b.hp + b.shield; }
    // recompensa: tempo
    if(this.bounty){ this.bounty.t -= dt; this.bounty.mark.rotation.y += dt * 3; if(this.bounty.t <= 0){ m.toast('A recompensa expirou'); this._clearBounty(); } }
    // zona quente: anel pulsa
    if(this.hotRing) this.hotRing.material.opacity = 0.22 + Math.sin(t * 3) * 0.12;
    // chuva de meteoros
    if(this.br && this.solo && m.phase === 'play' && P.mode === 'ground' && !P.onBus){
      this.meteorT -= dt;
      if(this.meteorT <= 0){ this.meteorT = 80 + Math.random() * 40; for(let k = 0; k < 3; k++) setTimeout(() => this._meteor(), k * 1400); m.toast('CHUVA DE METEOROS! Fica atento aos círculos vermelhos'); }
    }
    for(let i = this.meteors.length - 1; i >= 0; i--){
      const mt = this.meteors[i]; mt.t -= dt;
      const u = 1 - mt.t / mt.T; mt.ring.material.opacity = 0.35 + Math.sin(this._t * 12) * 0.25; mt.ring.scale.setScalar(0.4 + u * 0.6);
      mt.rock.position.lerpVectors(mt.from, mt.pos, Math.pow(u, 2)); mt.rock.rotation.x += dt * 4; mt.rock.rotation.z += dt * 3;
      if(Math.random() < 0.8) m.particles.emit('fire', mt.rock.position, { n: 2, size: 2.2 });
      if(mt.t <= 0){ this.group.remove(mt.ring); this.group.remove(mt.rock); this.meteors.splice(i, 1);
        if(m.fs) m.fs.explode(mt.pos.clone().setY(mt.pos.y + 1), 18, 70, null);
        m.particles.emit('dust', mt.pos, { n: 40, power: 4, color: 0x57534e });
        // meteorito fica no chão (brilha) e larga materiais
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2, 1), Mat.emissive(0x7c2d12, 0.8)); rock.position.copy(mt.pos).setY(mt.pos.y + 0.8); rock.castShadow = true; this.group.add(rock);
        W.spawnPickup('metal', mt.pos.clone().add(V(3, 0.4, 0)), 30); W.spawnPickup('stone', mt.pos.clone().add(V(-3, 0.4, 0)), 30);
      }
    }
  }
  _meteor(){
    const P = this.m.player; if(!P || !P.alive) return;
    const a = Math.random() * 6.28, d = 25 + Math.random() * 90;
    const x = P.body.pos.x + Math.cos(a) * d, z = P.body.pos.z + Math.sin(a) * d; if(Math.hypot(x, z) > MAP_R - 40) return;
    const y = this.W.physics.groundAt(x, z, 999, 0), pos = V(x, y, z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(14, 18, 48), new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, y + 0.5, z); ring.userData.noProbe = true;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.6, 1), Mat.emissive(0xf97316, 2.5));
    const from = V(x + 80, y + 260, z - 60); rock.position.copy(from);
    this.group.add(ring, rock); this.meteors.push({ pos, ring, rock, from, t: 4.2, T: 4.2 });
    this.m.audio.play('thunder', pos, { vol: 0.3, rate: 0.6 });
  }
  dispose(){
    this.m.scene.remove(this.group);
    if(this.stEl) this.stEl.classList.remove('on'); if(this.medEl) this.medEl.style.display = 'none';
  }
}

function mergeGeo(list){
  // junção simples (posições + normais) sem dependências extra
  let n = 0; for(const g of list) n += (g.index ? g.toNonIndexed() : g).attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  for(let g of list){ g = g.index ? g.toNonIndexed() : g; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); return out;
}
