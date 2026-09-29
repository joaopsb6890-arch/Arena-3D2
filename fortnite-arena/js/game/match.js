// ============================================================
// MATCH — partida Battle Royale: ônibus, queda livre/planador,
// combate hitscan com traçantes, construção, baús, loot,
// tempestade em fases, 11 bots com IA, HUD completo.
// ============================================================
import * as THREE from 'three';
import { PhysicsWorld } from './physics.js';
import { World, heightAt, GRID, WALL_H, MAP_R } from './world.js';
import { Actor } from './actor.js';
import { BotBrain } from './ai.js';
import { WEAPON_STATS } from './weapons.js';
import { TPSCamera, CinematicDirector } from '../engine/camera.js';
import { ParticleSystem } from '../engine/particles.js';
import { Environment } from '../engine/weather.js';
import { Mat } from '../engine/materials.js';
import { SKINS } from '../anim/skins.js';
import { Wind } from '../anim/secondary.js';

const $ = (id) => document.getElementById(id);
const KILLS_TO_WIN = 10;
const BOT_NAMES = ['Raven', 'Jonesy', 'Peely', 'Midas', 'Skye', 'Drift', 'Lynx', 'Fishstick', 'Aura', 'Brutus', 'Calamity', 'Meowscles'];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _ray = new THREE.Raycaster();

export class Match {
  constructor(app){
    this.app = app; this.audio = app.audio; this.quality = app.qualityName;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.3, 6000);
    this.particles = new ParticleSystem(this.scene, this.quality);
    this.physics = new PhysicsWorld(heightAt);
    this.world = new World(this.scene, this.physics, this.particles, this.audio, this.quality);
    this.env = new Environment(this.scene, app.renderer, this.particles, this.audio, { time: app.settings.time ?? 15, cloudArea: 1400 });
    this.env.setWeather(app.settings.weather || 'limpo');
    this.tps = new TPSCamera(this.camera);
    this.tps.colliders = this.world.raycastTargets.filter(m => !m.isInstancedMesh && m.name !== 'ground');
    this.director = new CinematicDirector(this.camera, $('letterbox'));
    this.shellGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.16, 6); this.shellGeo.rotateZ(Math.PI / 2);
    this.actors = []; this.bots = []; this.structures = []; this.tracers = [];
    this.time = 0; this.phase = 'bus'; this.keys = {}; this.mouse = { l: false, r: false };
    this.build = { on: false, piece: 'wall', ghost: null, rot: 0 };
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe3a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracerGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 5, 1, true); this.tracerGeo.rotateX(Math.PI / 2); this.tracerGeo.translate(0, 0, 0.5);
    this._bindInput();
  }
  // ---------------- início ----------------
  start(skin, bodyType){
    const P = this.player = new Actor(this, skin, { isPlayer: true, name: this.app.settings.name || 'Você', bodyType });
    this.actors.push(P);
    const skinKeys = Object.keys(SKINS);
    for(let i = 0; i < 11; i++){
      const b = new Actor(this, skinKeys[(i + 3) % skinKeys.length], { name: BOT_NAMES[i], bodyType: ['padrao', 'atletico', 'robusto', 'esguio'][i % 4] });
      b.brain = new BotBrain(b, this);
      this.actors.push(b); this.bots.push(b);
    }
    // ônibus de batalha
    this.bus = this._makeBus();
    const a = Math.random() * Math.PI * 2;
    this.busFrom = new THREE.Vector3(Math.cos(a) * MAP_R * 0.85, 290, Math.sin(a) * MAP_R * 0.85);
    this.busTo = this.busFrom.clone().multiplyScalar(-1).setY(290);
    this.busT = 0;
    this.actors.forEach(ac => { ac.onBus = true; ac.root.visible = false; ac.body.pos.copy(this.busFrom); ac.jumpAt = ac.isPlayer ? 99 : 0.15 + Math.random() * 0.7; });
    P.equip(0);
    $('deploy-overlay').classList.remove('hide');
    this.phase = 'bus';
    this.tps.dist = 30; this.tps.yaw = Math.atan2(this.busTo.x - this.busFrom.x, this.busTo.z - this.busFrom.z);
    this.stats = { t0: performance.now(), dmg: 0 };
    this._hud(true);
    this.env.update(0.016, this.camera, true);
    this.world.soundSpots.forEach(s => this.audio.loop(s.id, s.name, s.pos, s.vol));
    this.audio.loop('wind', 'wind', null, 0.05); this.audio.loop('rain', 'rain', null, 0);
    this.toast('Clique ou aperte ESPAÇO para pular do ônibus');
  }
  _makeBus(){
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(8, 7, 22, 1, 1, 1), Mat.paint(0x2563eb)); body.position.y = 0;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.6, 22.2), Mat.paint(0xf1f5f9)); roof.position.y = 3.8;
    const bal = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 18), Mat.paint(0x60a5fa)); bal.position.y = 18; bal.scale.set(1, 1.1, 1.4);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(8.3, 1, 22.3), Mat.paint(0xfbbf24)); stripe.position.y = -1.5;
    for(let i = 0; i < 4; i++){ const r = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 12, 4), Mat.metal(0x444444)); r.position.set(i < 2 ? -3 : 3, 10, i % 2 ? -8 : 8); g.add(r); }
    const wins = new THREE.Mesh(new THREE.BoxGeometry(8.4, 2, 18), Mat.glass(0x93c5fd)); wins.position.y = 1.2;
    g.add(body, roof, bal, stripe, wins);
    g.traverse(o => { if(o.isMesh) o.castShadow = true; });
    this.scene.add(g); return g;
  }
  jumpFromBus(ac){
    ac.onBus = false; ac.root.visible = true;
    ac.body.pos.copy(this.bus.position).add(new THREE.Vector3((Math.random() - 0.5) * 4, -6, (Math.random() - 0.5) * 4));
    ac.body.vel.set(0, -10, 0); ac.mode = 'freefall'; ac.body.grounded = false;
    if(ac.isPlayer){ $('deploy-overlay').classList.add('hide'); this.phase = 'drop'; this.tps.dist = 16; this.audio.play('woosh', null, { vol: 0.7 }); }
    else { const ang = Math.random() * Math.PI * 2, r = Math.random() * MAP_R * 0.7; ac.dropTarget = new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r); }
  }
  // ---------------- entrada ----------------
  _bindInput(){
    const el = this.app.renderer.r.domElement;
    this._kd = (e) => {
      if(!this.active) return;
      this.keys[e.code] = true;
      const P = this.player; if(!P) return;
      if(['Space', 'Tab', 'KeyF'].includes(e.code)) e.preventDefault();
      if(e.code === 'Escape' || e.code === 'KeyP'){ this.togglePause(); return; }
      if(this.paused || this.phase === 'over') return;
      if(e.code === 'Space' && this.phase === 'bus'){ this.jumpFromBus(P); return; }
      if(e.code === 'Space' && P.body.grounded && P.alive && P.mode === 'ground'){ P.body.vel.y = 27; this.audio.play('jump', P.root.position, { vol: 0.4 }); P.anim.stopEmotes(); }
      if(e.code.startsWith('Digit')){ const n = +e.code.slice(5); if(n >= 1 && n <= 5){ if(this.build.on) this.setBuild(false); P.equip(n - 1); } }
      if(e.code === 'KeyQ' || e.code === 'KeyF') this.setBuild(!this.build.on);
      if(this.build.on){ const map = { KeyZ: 'wall', KeyX: 'floor', KeyC: 'ramp', KeyV: 'cone' }; if(map[e.code]) this.setBuildPiece(map[e.code]); if(e.code === 'KeyR') this.build.rot = (this.build.rot + 1) % 4; }
      else {
        if(e.code === 'KeyR') P.reload();
        if(e.code === 'KeyC' || e.code === 'ControlLeft') P.crouch = !P.crouch;
      }
      if(e.code === 'KeyE') this.interact();
      if(e.code === 'KeyH') P.useItem('potion');
      if(e.code === 'KeyG') P.useItem('medkit');
      if(e.code === 'KeyB'){ P.anim.play(['danceDefault', 'floss', 'celebrate', 'laugh'][Math.floor(Math.random() * 4)]); }
      if(e.code === 'KeyM') $('minimap').classList.toggle('big');
    };
    this._ku = (e) => { this.keys[e.code] = false; };
    this._md = (e) => {
      if(!this.active || this.paused) return;
      if(e.target.closest && e.target.closest('.ui-btn, button')) return;
      this.app.lockPointer();
      if(this.phase === 'bus'){ this.jumpFromBus(this.player); return; }
      if(e.button === 0) this.mouse.l = true;
      if(e.button === 2) this.mouse.r = true;
      if(e.button === 0 && this.build.on) this.placePiece();
      if(e.button === 0 && !this.build.on) this._fireOnce = true;
    };
    this._mu = (e) => { if(e.button === 0) this.mouse.l = false; if(e.button === 2) this.mouse.r = false; };
    this._mm = (e) => {
      if(!this.active || this.paused) return;
      const locked = document.pointerLockElement === el;
      if(!locked && !this.app.pointerFallback) return;
      const s = (this.app.settings.sens || 1) * 0.0022 * (this.player && this.player.aiming ? (this.player.weaponType === 'sniper' ? 0.35 : 0.65) : 1);
      this.tps.yaw -= e.movementX * s; this.tps.pitch = THREE.MathUtils.clamp(this.tps.pitch - e.movementY * s, -1.25, 1.2);
    };
    this._wh = (e) => { if(!this.active || !this.player) return; const P = this.player; let n = P.slot + (e.deltaY > 0 ? 1 : -1); for(let k = 0; k < 5; k++){ n = (n + 5) % 5; if(n === 0 || P.slots[n]) break; n += e.deltaY > 0 ? 1 : -1; } P.equip((n + 5) % 5); };
    this._cm = (e) => { if(this.active) e.preventDefault(); };
    addEventListener('keydown', this._kd); addEventListener('keyup', this._ku);
    el.addEventListener('mousedown', this._md); addEventListener('mouseup', this._mu); addEventListener('mousemove', this._mm);
    el.addEventListener('wheel', this._wh, { passive: true }); addEventListener('contextmenu', this._cm);
    this._plc = () => { if(this.active && document.pointerLockElement !== el && !this.app.pointerFallback && this.phase !== 'over' && !this.paused) this.togglePause(true); };
    document.addEventListener('pointerlockchange', this._plc);
  }
  dispose(){
    removeEventListener('keydown', this._kd); removeEventListener('keyup', this._ku); removeEventListener('mouseup', this._mu); removeEventListener('mousemove', this._mm); removeEventListener('contextmenu', this._cm);
    const el = this.app.renderer.r.domElement; el.removeEventListener('mousedown', this._md); el.removeEventListener('wheel', this._wh);
    document.removeEventListener('pointerlockchange', this._plc);
    this.world.soundSpots.forEach(s => { const h = this.audio.loops[s.id]; if(h){ h.stop(); delete this.audio.loops[s.id]; } });
    ['wind', 'rain'].forEach(id => { const h = this.audio.loops[id]; if(h){ h.stop(); delete this.audio.loops[id]; } });
    this.scene.traverse(o => { if(o.geometry) o.geometry.dispose(); });
    this._hud(false);
  }
  togglePause(force){
    if(this.phase === 'over') return;
    this.paused = force === true ? true : !this.paused;
    $('pause-overlay').classList.toggle('hide', !this.paused);
    if(this.paused) document.exitPointerLock && document.exitPointerLock();
  }
  // ---------------- construção ----------------
  setBuild(on){
    const P = this.player;
    this.build.on = on; $('build-bar').classList.toggle('on', on);
    if(on){ P.anim.setWeapon(null); P.pickaxe.visible = false; this._makeGhost(); }
    else { if(this.build.ghost){ this.scene.remove(this.build.ghost); this.build.ghost = null; } P._equipped = null; P.equip(P.slot); }
    this._updateSlotsUI();
  }
  setBuildPiece(p){ this.build.piece = p; this._makeGhost(); this._updateSlotsUI(); }
  _pieceGeo(p){
    if(p === 'wall') return new THREE.BoxGeometry(GRID, WALL_H, 0.6);
    if(p === 'floor') return new THREE.BoxGeometry(GRID, 0.6, GRID);
    if(p === 'ramp'){ const len = Math.hypot(GRID, WALL_H); const g = new THREE.BoxGeometry(GRID, 0.6, len); g.rotateX(-Math.atan2(WALL_H, GRID)); return g; }
    const g = new THREE.ConeGeometry(GRID * 0.71, WALL_H * 0.5, 4, 1); g.rotateY(Math.PI / 4); g.translate(0, WALL_H * 0.25, 0); return g;
  }
  _makeGhost(){
    if(this.build.ghost) this.scene.remove(this.build.ghost);
    const m = new THREE.Mesh(this._pieceGeo(this.build.piece), new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.35, depthWrite: false }));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0xbfdbfe }));
    m.add(edges); m.userData.noProbe = true;
    this.scene.add(m); this.build.ghost = m;
  }
  _placement(actor, piece, yaw){
    const p = actor.root.position;
    const q = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
    const fx = Math.round(Math.sin(q)), fz = Math.round(Math.cos(q));
    const cx = Math.floor(p.x / GRID) * GRID + GRID / 2, cz = Math.floor(p.z / GRID) * GRID + GRID / 2;
    const baseY = Math.max(0, Math.round((p.y - heightAt(p.x, p.z) > 2 ? p.y : heightAt(cx, cz)) / WALL_H) * WALL_H) + (p.y < 1 ? heightAt(cx, cz) * 0 : 0);
    const gy = Math.max(heightAt(cx + fx * GRID, cz + fz * GRID), 0);
    const y0 = Math.max(baseY, Math.floor(p.y / WALL_H) * WALL_H, p.y > gy + 1 ? Math.floor(p.y / WALL_H) * WALL_H : gy - 0.3);
    const pos = new THREE.Vector3(), rot = new THREE.Euler(0, q, 0);
    if(piece === 'wall'){ pos.set(cx + fx * GRID / 2, y0 + WALL_H / 2, cz + fz * GRID / 2); }
    else if(piece === 'floor'){ pos.set(cx + fx * GRID, y0 + (this.player.pitch > 0.25 ? WALL_H : 0) + 0.3, cz + fz * GRID); }
    else if(piece === 'ramp'){ pos.set(cx + fx * GRID, y0 + WALL_H / 2, cz + fz * GRID); }
    else { pos.set(cx, y0 + WALL_H, cz); }
    return { pos, rot, q, fx, fz, y0 };
  }
  placePiece(actor, piece, yaw){
    actor = actor || this.player; piece = piece || this.build.piece; yaw = yaw ?? actor.yaw;
    if(actor.mats.wood < 10) { if(actor.isPlayer) this.toast('Madeira insuficiente'); return null; }
    const pl = this._placement(actor, piece, yaw);
    // evita duplicar
    if(this.structures.some(s => s.alive && s.piece === piece && s.mesh.position.distanceTo(pl.pos) < 1 && Math.abs(s.q - pl.q) < 0.1)) return null;
    actor.mats.wood -= 10;
    const mat = Mat.wood(0xb07b47);
    const mesh = new THREE.Mesh(this._pieceGeo(piece), mat);
    mesh.position.copy(pl.pos); mesh.rotation.copy(pl.rot); mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.scale.setScalar(0.05);
    this.scene.add(mesh); this.world.raycastTargets.push(mesh); this.tps.colliders.push(mesh);
    const S = { mesh, piece, hp: 60, maxHp: 150, growT: 0, alive: true, q: pl.q, owner: actor };
    mesh.userData.structure = S;
    // colisão
    const bb = new THREE.Box3().setFromObject(new THREE.Mesh(mesh.geometry)).applyMatrix4(new THREE.Matrix4().compose(pl.pos, new THREE.Quaternion().setFromEuler(pl.rot), new THREE.Vector3(1, 1, 1)));
    if(piece === 'ramp'){
      const axis = Math.abs(pl.fx) > 0 ? 'x' : 'z', dir = axis === 'x' ? pl.fx : pl.fz;
      S.box = this.physics.addBox(bb.min, bb.max, { ramp: { axis, dir } });
    } else if(piece === 'cone'){ S.box = this.physics.addBox(bb.min, bb.min.clone().setY(bb.min.y + 0.6).add(new THREE.Vector3(GRID, 0, GRID))); }
    else S.box = this.physics.addBox(bb.min, bb.max);
    this.structures.push(S);
    this.particles.emit('build', pl.pos);
    this.audio.play('build', pl.pos, { vol: 0.6 });
    return S;
  }
  damageStructure(S, dmg, point){
    if(!S.alive) return;
    S.hp -= dmg;
    this.particles.emit('wood', point, {});
    if(S.hp <= 0){
      S.alive = false; this.scene.remove(S.mesh); this.physics.removeBox(S.box);
      this.world.raycastTargets.splice(this.world.raycastTargets.indexOf(S.mesh), 1);
      const ci = this.tps.colliders.indexOf(S.mesh); if(ci >= 0) this.tps.colliders.splice(ci, 1);
      // destroços físicos
      for(let i = 0; i < 10; i++){
        const d = new THREE.Mesh(new THREE.BoxGeometry(1.4 + Math.random() * 2, 0.4, 0.8 + Math.random()), S.mesh.material);
        d.position.copy(S.mesh.position).add(new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8));
        d.castShadow = true; this.scene.add(d);
        this.physics.addBody(d, new THREE.Vector3((Math.random() - 0.5) * 14, 6 + Math.random() * 10, (Math.random() - 0.5) * 14), new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), { life: 3.5, r: 0.25, bounce: 0.3 });
      }
      this.particles.emit('dust', S.mesh.position, { n: 14, power: 2 });
      this.audio.play('stepWood', S.mesh.position, { vol: 1, rate: 0.6 });
    }
  }
  botBuildWall(bot, enemy){
    const yaw = Math.atan2(enemy.root.position.x - bot.root.position.x, enemy.root.position.z - bot.root.position.z);
    this.placePiece(bot, Math.random() < 0.7 ? 'wall' : 'ramp', yaw);
  }
  // ---------------- combate ----------------
  _targets(shooter){
    // o terreno é tratado analiticamente (heightfield) — muito mais barato que raycast em 28k triângulos
    if(!this._staticTargets || this._staticN !== this.world.raycastTargets.length){ this._staticTargets = this.world.raycastTargets.filter(m => m.name !== 'ground'); this._staticN = this.world.raycastTargets.length; }
    const list = [];
    for(const a of this.actors) if(a !== shooter && a.alive && !a.onBus) list.push(...a.hbList);
    return list.concat(this._staticTargets);
  }
  /** raycast combinado: malhas + terreno por ray-marching no heightfield */
  _cast(origin, dir, near, far, targets){
    _ray.set(origin, dir); _ray.near = near; _ray.far = far;
    const h = _ray.intersectObjects(targets, false)[0];
    const lim = h ? h.distance : far;
    let prev = near, p = _v.copy(origin).addScaledVector(dir, near);
    if(p.y - heightAt(p.x, p.z) < 0) return h || null;
    for(let t = near + 2; t <= lim; t += 2){
      p.copy(origin).addScaledVector(dir, t);
      if(p.y < heightAt(p.x, p.z)){
        let a = prev, b = t;
        for(let k = 0; k < 6; k++){ const m = (a + b) / 2; p.copy(origin).addScaledVector(dir, m); if(p.y < heightAt(p.x, p.z)) b = m; else a = m; }
        const pt = origin.clone().addScaledVector(dir, b);
        return { point: pt, distance: b, object: this.world.ground, face: { normal: new THREE.Vector3(0, 1, 0) } };
      }
      prev = t;
    }
    return h || null;
  }
  fireHitscan(shooter, origin, dir, st, muzzle){
    const pellets = st.pellets || 1;
    const moving = Math.hypot(shooter.body.vel.x, shooter.body.vel.z) > 4;
    const spread = st.spread * (shooter.aiming ? 0.45 : 1) * (moving ? 1.6 : 1) * (shooter.body.grounded ? 1 : 2.2);
    const targets = this._targets(shooter);
    let anyHit = false, head = false;
    for(let i = 0; i < pellets; i++){
      const d = dir.clone();
      if(spread > 0){ d.x += (Math.random() - 0.5) * spread * 2; d.y += (Math.random() - 0.5) * spread * 2; d.z += (Math.random() - 0.5) * spread * 2; d.normalize(); }
      const h = this._cast(origin, d, shooter.isPlayer ? this.tps.curDist * 0.9 : 1.5, st.range, targets);
      const end = h ? h.point : origin.clone().addScaledVector(d, st.range);
      if(i < 3 || pellets < 3) this._tracer(muzzle, end, pellets > 1 ? 0.05 : 0.08);
      if(!h) continue;
      const obj = h.object;
      if(obj.userData.character){
        const victim = obj.userData.character.root.userData.actor;
        if(!victim || victim === shooter) continue;
        const isHead = !!obj.userData.isHead;
        const falloff = st.pellets ? THREE.MathUtils.clamp(1.3 - h.distance / 60, 0.35, 1) : 1;
        const dmg = Math.round(st.dmg * (isHead ? st.head || 2 : 1) * falloff);
        victim.takeDamage(dmg, shooter, isHead);
        anyHit = true; head = head || isHead;
        this.particles.emit('impact', h.point, { n: 5, color: 0xff5a5a, dust: 0xaa3333 });
        if(shooter.isPlayer){ this.stats.dmg += dmg; this._damageNumber(h.point, dmg, isHead, victim.shield > 0); }
        if(victim.isPlayer) this._hurtFx(shooter);
        if(victim.brain) victim.brain.hear(shooter.root.position);
      } else if(obj.userData.structure){ this.damageStructure(obj.userData.structure, st.dmg * 0.5, h.point); }
      else { this.particles.emit('impact', h.point, { dir: h.face ? h.face.normal.clone().transformDirection(obj.matrixWorld) : undefined, n: 6, color: obj === this.world.ground ? 0x7a6a4a : undefined }); }
    }
    const scale = shooter.weaponType === 'shotgun' ? 1.5 : shooter.weaponType === 'sniper' ? 1.4 : 1;
    this.particles.emit('muzzle', muzzle, { dir, scale });
    const snd = shooter.weaponType; this.audio.play(snd, muzzle, { vol: shooter.isPlayer ? 0.85 : 0.9, reverb: 0.5 });
    if(shooter.isPlayer){
      this.tps.addTrauma(snd === 'shotgun' ? 0.35 : snd === 'sniper' ? 0.45 : 0.12); this.tps.kick(snd === 'shotgun' ? 3 : 1.2);
      this.tps.pitch += (snd === 'sniper' ? 0.03 : snd === 'shotgun' ? 0.025 : 0.006) * (shooter.aiming ? 0.6 : 1);
      if(anyHit){ this._hitmarker(head); this.audio.play(head ? 'headshot' : 'hit', null, { vol: 0.5 }); }
      this._crossBloom = Math.min(1, (this._crossBloom || 0) + (snd === 'rifle' ? 0.18 : 0.6));
    }
    // bots ouvem tiros
    for(const b of this.bots) if(b.alive && b !== shooter && b.root.position.distanceTo(shooter.root.position) < 160) b.brain.hear(shooter.root.position);
  }
  pickaxeHit(actor, origin, dir){
    const o = actor.root.position.clone().setY(actor.root.position.y + 5);
    const d = actor.isPlayer ? dir.clone() : new THREE.Vector3(Math.sin(actor.yaw), 0, Math.cos(actor.yaw));
    const h = this._cast(o, d, 0, 9, this._targets(actor));
    if(!h) return;
    const obj = h.object;
    if(obj.userData.character){
      const v = obj.userData.character.root.userData.actor; if(v && v !== actor){ v.takeDamage(20, actor, false); if(actor.isPlayer){ this._hitmarker(false); this._damageNumber(h.point, 20, false, v.shield > 0); } if(v.isPlayer) this._hurtFx(actor); }
      this.audio.play('hit', h.point, { vol: 0.6 });
    } else if(obj.userData.structure){ this.damageStructure(obj.userData.structure, 50, h.point); this.audio.play('pickHit', h.point, { vol: 0.8 }); }
    else {
      const r = (obj.isInstancedMesh && h.instanceId !== undefined) ? this.world.hitResource(obj, h.instanceId, h.point) : null;
      this.audio.play('pickHit', h.point, { vol: 0.8, rate: r && r.kind === 'stone' ? 1.3 : 1 });
      if(r){ actor.mats[r.kind] += r.amount; if(actor.isPlayer){ this._floatText(h.point, '+' + r.amount + (r.kind === 'wood' ? ' madeira' : ' pedra')); this._hitmarker(false); } }
      else this.particles.emit('impact', h.point, { n: 5 });
    }
    if(actor.isPlayer) this.tps.addTrauma(0.1);
  }
  _tracer(from, to, life){
    const m = new THREE.Mesh(this.tracerGeo, this.tracerMat.clone());
    m.position.copy(from); m.lookAt(to); m.scale.set(1, 1, from.distanceTo(to));
    m.userData.noProbe = true;
    this.scene.add(m); this.tracers.push({ m, t: life, life });
  }
  onActorDeath(victim, killer){
    this.particles.emit('digitize', victim.root.position, { color: new THREE.Color(victim.ch.S.accent || 0x60a5fa).getHex() });
    this.audio.play('elim', victim.root.position, { vol: 0.8 });
    if(killer) killer.kills++;
    this._killfeed(killer, victim);
    // loot drop
    const wt = victim.slots.filter((s, i) => i > 0 && s);
    wt.forEach((w, i) => this.world.spawnPickup(w, victim.root.position.clone().add(new THREE.Vector3(i * 2.5 - 2, 0, 1.5))));
    this.world.spawnPickup('ammo', victim.root.position.clone().add(new THREE.Vector3(2, 0, -2)), 30);
    if(victim.mats.wood > 0) this.world.spawnPickup('wood', victim.root.position.clone().add(new THREE.Vector3(-2, 0, -2)), victim.mats.wood);
    setTimeout(() => { victim.root.visible = false; }, 1600);
    if(killer && killer.isPlayer){ this.toast('ELIMINOU ' + victim.name.toUpperCase(), 'kill'); this.tps.addTrauma(0.15); }
    if(victim.isPlayer) setTimeout(() => this.endMatch(false, killer), 1800);
    else if(this.player.alive && (this.player.kills >= KILLS_TO_WIN || this.actors.filter(a => a.alive).length === 1)) setTimeout(() => this.endMatch(true), 1200);
  }
  // ---------------- interação ----------------
  interact(){
    const P = this.player;
    const c = this.world.chests.find(c => !c.opened && c.pos.distanceTo(P.root.position) < 7);
    if(c){ this.openChestBy(P, c); return; }
    const pk = this.world.pickups.find(p => p.pos.distanceTo(P.root.position) < 5);
    if(pk) this.pickup(P, pk);
  }
  openChestBy(actor, c){
    if(!this.world.openChest(c)) return;
    this.audio.play('chest', c.pos, { vol: 0.9 });
    const weapons = ['rifle', 'shotgun', 'sniper'];
    const w = weapons[Math.floor(Math.random() * (actor.isPlayer ? 3 : 2.4))];
    const spawnAt = (i) => c.pos.clone().add(new THREE.Vector3(Math.sin(c.group.rotation.y + i) * 3.5, 0, Math.cos(c.group.rotation.y + i) * 3.5));
    if(actor.isPlayer){
      this.world.spawnPickup(w, spawnAt(-0.6)); this.world.spawnPickup('ammo', spawnAt(0), 30); this.world.spawnPickup(Math.random() < 0.5 ? 'potion' : 'medkit', spawnAt(0.6));
    } else { actor.give(w); actor.potions++; if(actor.slot === 0) actor.equip(actor.slots.indexOf(w)); }
  }
  pickup(actor, pk){
    const t = pk.type;
    if(WEAPON_STATS[t]){ const idx = actor.give(t); if(actor.isPlayer) { actor.equip(idx); this.toast(WEAPON_STATS[t].name + ' coletado'); } }
    else if(t === 'ammo'){ ['rifle', 'shotgun', 'sniper'].forEach(k => actor.reserve[k] = (actor.reserve[k] || 0) + (k === 'rifle' ? 30 : k === 'shotgun' ? 6 : 3)); if(actor.isPlayer) this.toast('Munição +'); }
    else if(t === 'potion' || t === 'shield'){ actor.potions++; if(actor.isPlayer) this.toast('Poção de escudo'); }
    else if(t === 'medkit'){ actor.medkits++; if(actor.isPlayer) this.toast('Kit médico'); }
    else if(t === 'wood' || t === 'stone'){ actor.mats[t] += pk.amount; }
    this.audio.play('ui', pk.pos, { vol: 0.5, rate: 1.4 });
    this.world.removePickup(pk);
    if(actor.isPlayer) this._updateSlotsUI();
  }
  onFootstep(actor, speed){
    if(actor.isPlayer || actor.root.position.distanceTo(this.camera.position) < 70){
      const onWood = this.structures.some(s => s.alive && s.box && Math.abs(actor.body.pos.y - s.box.max.y) < 0.5 && actor.body.pos.x > s.box.min.x && actor.body.pos.x < s.box.max.x && actor.body.pos.z > s.box.min.z && actor.body.pos.z < s.box.max.z);
      this.audio.play(onWood ? 'stepWood' : 'step', actor.root.position, { vol: (actor.isPlayer ? 0.18 : 0.35) * (speed > 20 ? 1.3 : 1) * (actor.crouch ? 0.4 : 1) });
      if(speed > 18 && this.quality !== 'baixa') this.particles.emit('dust', actor.root.position, { n: 2, power: 0.6 });
    }
    for(const b of this.bots) if(b !== actor && b.alive && !actor.crouch && b.root.position.distanceTo(actor.root.position) < 40) b.brain.hear(actor.root.position);
  }
  // ---------------- loop ----------------
  update(dt){
    if(this.paused) return;
    this.time += dt;
    const P = this.player, W = this.world;
    // ônibus
    if(this.bus){
      this.busT += dt / 26;
      this.bus.position.lerpVectors(this.busFrom, this.busTo, Math.min(1, this.busT));
      this.bus.rotation.y = Math.atan2(this.busTo.x - this.busFrom.x, this.busTo.z - this.busFrom.z);
      this.bus.position.y += Math.sin(this.time * 1.3) * 1.2;
      for(const a of this.actors) if(a.onBus){ a.body.pos.copy(this.bus.position); if(this.busT >= a.jumpAt || this.busT >= 0.98) this.jumpFromBus(a); }
      if(this.busT >= 1.05){ this.scene.remove(this.bus); this.bus = null; }
    }
    // entrada do jogador
    if(P.alive && !P.onBus){
      const k = this.keys;
      P.moveInput.set((k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0));
      if(P.moveInput.lengthSq() > 0 && P.anim.clips.some(c => c.def.emote && !c.stopping)) P.anim.stopEmotes();
      P.sprint = !!k.ShiftLeft && P.moveInput.y > 0 && !P.aiming;
      if(P.sprint) P.crouch = false;
      P.aiming = this.mouse.r && !this.build.on && P.weaponType !== 'pickaxe' && P.mode === 'ground';
      P.yaw = this.tps.yaw; P.pitch = this.tps.pitch;
      // tiro
      const st = P.stats;
      if(!this.build.on && st && (this._fireOnce || (this.mouse.l && st.auto))){ this._fireOnce = false; this._playerFire(); }
      else if(!this.build.on && this.mouse.l && P.weaponType === 'pickaxe') this._playerFire();
      this._fireOnce = false;
      // coleta automática de munição/materiais
      for(const pk of W.pickups.slice()) if(['ammo', 'wood', 'stone'].includes(pk.type) && pk.pos.distanceTo(P.root.position) < 3.5) this.pickup(P, pk);
    }
    // bots
    for(const b of this.bots){
      if(b.onBus) continue;
      if(b.alive && b.mode !== 'ground' && b.dropTarget){ _v.subVectors(b.dropTarget, b.root.position); b.yaw = Math.atan2(_v.x, _v.z); b.moveInput.set(0, Math.hypot(_v.x, _v.z) > 10 ? 1 : 0); }
      else if(b.alive) b.brain.update(dt);
    }
    // atores
    for(const a of this.actors){
      if(a.onBus) continue;
      a.root.userData.actor = a; a.update(dt);
      // limite da ilha: parede invisível na praia
      const bp = a.body.pos, rr = Math.hypot(bp.x, bp.z), lim = MAP_R - 28;
      if(rr > lim){ bp.x *= lim / rr; bp.z *= lim / rr; a.root.position.x = bp.x; a.root.position.z = bp.z; }
    }
    // mira: ponto sob a mira (raycast do centro da câmera) → o personagem aponta para lá, a mira nunca fica sobre ele
    const aimOrigin = this.camera.position.clone(), aimDir = new THREE.Vector3(); this.camera.getWorldDirection(aimDir);
    const ah = this._cast(aimOrigin, aimDir, this.tps.curDist + 1, 600, this._targets(P));
    P.aimPoint = ah ? ah.point : aimOrigin.clone().addScaledVector(aimDir, 300);
    this.aimOrigin = aimOrigin; this.aimDir = aimDir;
    // construção: fantasma
    if(this.build.on && this.build.ghost){ const pl = this._placement(P, this.build.piece, P.yaw); this.build.ghost.position.copy(pl.pos); this.build.ghost.rotation.copy(pl.rot); this.build.ghost.material.color.set(P.mats.wood >= 10 ? 0x60a5fa : 0xef4444); }
    // estruturas crescendo
    for(const s of this.structures) if(s.alive && s.growT < 1){ s.growT = Math.min(1, s.growT + dt * 2.2); const e = 1 - Math.pow(1 - s.growT, 3); s.mesh.scale.setScalar(0.05 + 0.95 * e); s.hp = Math.min(s.maxHp, s.hp + dt * 200); }
    // tempestade
    const ev = W.updateStorm(dt, this.phase === 'play');
    if(ev === 'shrink'){ $('storm-warning').classList.add('show'); setTimeout(() => $('storm-warning').classList.remove('show'), 3500); this.audio.play('thunder', null, { vol: 0.5 }); }
    this._stormTick = (this._stormTick || 0) - dt;
    if(this._stormTick <= 0){ this._stormTick = 1; for(const a of this.actors) if(a.alive && !a.onBus && W.inStorm(a.root.position)){ a.takeDamage(W.storm.dmg, null, false); if(a.isPlayer){ this._hurtFx(null); } } }
    if(P.alive && W.inStorm(P.root.position) && Math.random() < 0.5) this.particles.emit('storm', P.root.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8)));
    $('storm-vignette').style.opacity = P.alive && W.inStorm(P.root.position) ? 1 : 0;
    if(this.phase === 'drop' && P.mode === 'ground'){ this.phase = 'play'; this.toast('Encontre armas nos baús — E para abrir'); }
    // câmera
    const ads = P.aiming;
    const dist = P.mode === 'freefall' ? 20 : P.mode === 'glide' ? 17 : this.build.on ? 14 : 12.5;
    if(this.phase === 'bus' && this.bus){
      this.tps.update(dt, this.bus.position.clone().add(new THREE.Vector3(0, 4, 0)), { dist: 42 });
    } else if(this.director.active){ this.director.update(dt); }
    else this.tps.update(dt, P.root.position, { ads, sprint: P.sprint, crouch: P.crouch, scope: ads && P.weaponType === 'sniper', dist });
    $('sniper-scope').classList.toggle('on', ads && P.weaponType === 'sniper' && this.tps.ads > 0.8);
    P.root.visible = !(ads && P.weaponType === 'sniper' && this.tps.ads > 0.8) && !P.onBus;
    this.app.renderer.setDOF(false);
    // sistemas
    this.physics.updateBodies(dt);
    W.update(dt, this.camera);
    this.env.update(dt, this.camera);
    this.particles.update(dt);
    this.audio.updateListener(this.camera);
    if(this.audio.ctx){ this.audio.setLoopVolume('rain', (this.env.state.rain || 0) * 0.5); this.audio.setLoopVolume('wind', 0.03 + Wind.strength * 0.006 + (P.mode !== 'ground' ? 0.25 : 0)); }
    for(let i = this.tracers.length - 1; i >= 0; i--){ const t = this.tracers[i]; t.t -= dt; t.m.material.opacity = Math.max(0, t.t / t.life) * 0.9; if(t.t <= 0){ this.scene.remove(t.m); t.m.material.dispose(); this.tracers.splice(i, 1); } }
    this._hudUpdate(dt);
  }
  _playerFire(){
    const P = this.player;
    if(P.using > 0) return;
    P.anim.stopEmotes();
    const dir = this.aimDir ? this.aimDir.clone() : new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
    const origin = this.aimOrigin ? this.aimOrigin.clone() : P.root.position.clone().setY(P.root.position.y + 6);
    P.tryFire(origin, dir);
  }
  endMatch(win, killer){
    if(this.phase === 'over') return;
    this.phase = 'over';
    document.exitPointerLock && document.exitPointerLock();
    const P = this.player, alive = this.actors.filter(a => a.alive).length;
    const secs = Math.round((performance.now() - this.stats.t0) / 1000);
    const el = $(win ? 'victory' : 'defeat');
    el.querySelector('.res-stats').innerHTML = `<div><b>${P.kills}</b><span>Abates</span></div><div><b>${this.stats.dmg}</b><span>Dano</span></div><div><b>#${win ? 1 : alive + 1}</b><span>Colocação</span></div><div><b>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</b><span>Tempo</span></div>`;
    if(!win && killer) el.querySelector('.res-sub').textContent = 'Eliminado por ' + killer.name;
    el.classList.remove('hide');
    this.app.saveResult({ win, kills: P.kills });
    if(win){
      P.anim.setWeapon(null); P.pickaxe.visible = false; P.anim.play('celebrate');
      setTimeout(() => P.anim.play('danceDefault'), 2500);
      this.director.play([
        { type: 'orbit', label: 'Vitória', dur: 8, a0: P.yaw + 0.6, a1: P.yaw - 0.6, r: 13, h: 5, fov: 42, focusOffset: new THREE.Vector3(0, 5, 0) },
        { type: 'dolly', label: 'Close', dur: 6, from: new THREE.Vector3(Math.sin(P.yaw) * 16, 5, Math.cos(P.yaw) * 16), to: new THREE.Vector3(Math.sin(P.yaw) * 7, 6, Math.cos(P.yaw) * 7), fov: 38, focusOffset: new THREE.Vector3(0, 5.8, 0) }
      ], P.root, true);
      this.particles.emit('confetti', P.root.position.clone().add(new THREE.Vector3(0, 8, 0)), { n: 80 });
    }
  }
  // ---------------- HUD ----------------
  _hud(on){
    $('hud').classList.toggle('hide', !on); $('crosshair').classList.toggle('hide', !on);
    if(on){
      this._updateSlotsUI();
      const lab = { 0: 'N', 45: 'NE', 90: 'L', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };
      let h = '';
      for(let d = -180; d <= 540; d += 15){ const n = ((d % 360) + 360) % 360; h += `<span style="position:absolute;left:${d * 3}px;transform:translateX(-50%);${lab[n] ? (n === 0 ? 'color:#fde047' : '') : 'font-size:11px;opacity:.6;top:6px'}">${lab[n] || n}</span>`; }
      $('compass-strip').innerHTML = h;
    }
  }
  _updateSlotsUI(){
    const P = this.player; if(!P) return;
    for(let i = 0; i < 5; i++){
      const el = $('slot-' + (i + 1)); if(!el) continue;
      const t = P.slots[i], st = WEAPON_STATS[t];
      el.classList.toggle('active', i === P.slot && !this.build.on);
      el.classList.toggle('empty', !t);
      el.className = el.className.replace(/ rar-\w+/g, '') + (t ? ' rar-' + ({ pickaxe: 'common', rifle: 'rare', shotgun: 'epic', sniper: 'legendary' }[t]) : '');
      el.querySelector('.slot-name').textContent = st ? (st.short || 'PIC') : '';
      el.querySelector('.slot-ico').innerHTML = t ? SLOT_ICONS[t] : '';
    }
    ['wall', 'floor', 'ramp', 'cone'].forEach(p => { const e = $('bp-' + p); if(e) e.classList.toggle('active', this.build.on && this.build.piece === p); });
  }
  _hudUpdate(dt){
    const P = this.player, W = this.world;
    $('hp-fill').style.width = P.hp + '%'; $('hp-num').textContent = Math.ceil(P.hp);
    $('sh-fill').style.width = P.shield + '%'; $('sh-num').textContent = Math.ceil(P.shield);
    $('wood-count').textContent = P.mats.wood; $('stone-count').textContent = P.mats.stone;
    $('potion-count').textContent = P.potions; $('medkit-count').textContent = P.medkits;
    const st = P.stats;
    $('ammo').textContent = st && st.mag ? `${P.mag[P.weaponType] ?? 0} / ${P.reserve[P.weaponType] ?? 0}` : '∞';
    $('reload-bar').style.opacity = P.reloading > 0 || P.using > 0 ? 1 : 0;
    if(P.reloading > 0) $('reload-fill').style.width = (1 - P.reloading / st.reloadTime) * 100 + '%';
    if(P.using > 0) $('reload-fill').style.width = (1 - P.using / (P.useKind === 'potion' ? 2 : 3.2)) * 100 + '%';
    $('reload-label').textContent = P.using > 0 ? (P.useKind === 'potion' ? 'BEBENDO' : 'CURANDO') : 'RECARREGANDO';
    const alive = this.actors.filter(a => a.alive).length;
    $('player-count').textContent = alive; $('kill-count').textContent = P.kills;
    const S = W.storm;
    $('storm-timer').textContent = S.shrinking ? 'FECHANDO' : `${Math.max(0, Math.ceil(S.timer))}s`;
    // altímetro
    const alt = Math.max(0, Math.round(P.root.position.y - heightAt(P.root.position.x, P.root.position.z)));
    $('altimeter').classList.toggle('hide', P.mode === 'ground' || P.onBus);
    $('alt-num').textContent = alt + ' m';
    // mira dinâmica
    this._crossBloom = Math.max(0, (this._crossBloom || 0) - dt * 3);
    const moving = Math.hypot(P.body.vel.x, P.body.vel.z) > 3;
    const gap = 6 + (st && st.spread ? st.spread * 500 : 2) * (P.aiming ? 0.45 : 1) * (moving ? 1.5 : 1) + this._crossBloom * 10;
    $('crosshair').style.setProperty('--gap', gap + 'px');
    $('crosshair').classList.toggle('shotgun', P.weaponType === 'shotgun');
    $('crosshair').classList.toggle('hide', this.phase === 'bus' || this.phase === 'over' || (P.aiming && P.weaponType === 'sniper'));
    // interação
    const c = W.chests.find(c => !c.opened && c.pos.distanceTo(P.root.position) < 7);
    const pk = !c && W.pickups.find(p => p.pos.distanceTo(P.root.position) < 5 && !['ammo', 'wood', 'stone'].includes(p.type));
    const hint = $('interact-hint');
    hint.classList.toggle('show', !!(c || pk));
    if(c) hint.innerHTML = '<kbd>E</kbd> Abrir baú'; else if(pk) hint.innerHTML = `<kbd>E</kbd> Pegar ${WEAPON_STATS[pk.type] ? WEAPON_STATS[pk.type].name : pk.type === 'medkit' ? 'kit médico' : 'poção de escudo'}`;
    // bússola
    const deg = ((-this.tps.yaw * 180 / Math.PI) % 360 + 360 + 180) % 360;
    $('compass-strip').style.transform = `translateX(${-deg * 3}px)`;
    $('compass-deg').textContent = Math.round(deg) + '°';
    this._minimap();
    this._nametags();
    const hpLow = P.hp < 30 && P.alive; $('low-hp').style.opacity = hpLow ? 0.6 + Math.sin(this.time * 6) * 0.2 : 0;
  }
  _minimap(){
    const cv = $('minimap-canvas'); if(!cv) return;
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, P = this.player, w = this.world;
    const big = $('minimap').classList.contains('big');
    const scale = big ? W / (MAP_R * 2.2) : W / 260;
    const cx = big ? 0 : P.root.position.x, cz = big ? 0 : P.root.position.z;
    const tx = (x) => W / 2 - (x - cx) * scale, tz = (z) => H / 2 - (z - cz) * scale;
    ctx.fillStyle = '#1e5f7a'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#6a9a45'; ctx.beginPath(); ctx.arc(tx(0), tz(0), (MAP_R - 20) * scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d6c28f'; ctx.beginPath(); ctx.arc(tx(-60), tz(-40), 30 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a6f8f'; ctx.beginPath(); ctx.arc(tx(-60), tz(-40), 26 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8dcc4'; for(const h of w.houses){ ctx.fillRect(tx(h.x) - h.W * scale / 2, tz(h.z) - h.D * scale / 2, h.W * scale, h.D * scale); }
    ctx.fillStyle = '#fbbf24'; for(const c of w.chests) if(!c.opened){ ctx.fillRect(tx(c.pos.x) - 2, tz(c.pos.z) - 2, 4, 4); }
    // tempestade
    ctx.save(); ctx.fillStyle = 'rgba(124,58,237,0.45)'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(tx(w.storm.cx), tz(w.storm.cz), w.storm.r * scale, 0, Math.PI * 2, true); ctx.fill('evenodd'); ctx.restore();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(tx(w.storm.cx), tz(w.storm.cz), w.storm.r * scale, 0, Math.PI * 2); ctx.stroke();
    if(w.storm.shrinking || w.storm.timer < 35){ ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(tx(w.storm.tcx), tz(w.storm.tcz), w.storm.target * scale, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    if(this.bus){ ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.moveTo(tx(this.busFrom.x), tz(this.busFrom.z)); ctx.lineTo(tx(this.busTo.x), tz(this.busTo.z)); ctx.stroke(); }
    // jogador
    const px = tx(P.root.position.x), pz = tz(P.root.position.z);
    ctx.save(); ctx.translate(px, pz); ctx.rotate(-this.tps.yaw + Math.PI);
    ctx.fillStyle = '#fbbf24'; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  _nametags(){
    const layer = $('nametag-layer'); if(!layer) return;
    if(!this._tags){ this._tags = new Map(); }
    for(const b of this.bots){
      let el = this._tags.get(b);
      if(!el){ el = document.createElement('div'); el.className = 'nametag'; el.innerHTML = `<span>${b.name}</span><i><b></b></i>`; layer.appendChild(el); this._tags.set(b, el); }
      const p = b.root.position.clone().setY(b.root.position.y + 8.4);
      const d = p.distanceTo(this.camera.position);
      p.project(this.camera);
      const vis = b.alive && !b.onBus && p.z < 1 && d < 70 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1;
      el.style.display = vis ? 'block' : 'none';
      if(vis){ el.style.transform = `translate(${(p.x * 0.5 + 0.5) * innerWidth}px, ${(-p.y * 0.5 + 0.5) * innerHeight}px) translate(-50%,-100%)`; el.querySelector('b').style.width = b.hp + '%'; el.style.opacity = 1 - d / 80; }
    }
  }
  _damageNumber(point, dmg, head, shield){
    const el = document.createElement('div'); el.className = 'dmg-num' + (head ? ' head' : '') + (shield ? ' shield' : ''); el.textContent = dmg;
    const p = point.clone().project(this.camera);
    el.style.left = (p.x * 0.5 + 0.5) * innerWidth + (Math.random() - 0.5) * 30 + 'px'; el.style.top = (-p.y * 0.5 + 0.5) * innerHeight + 'px';
    $('damage-container').appendChild(el); setTimeout(() => el.remove(), 900);
  }
  _floatText(point, txt){ const el = document.createElement('div'); el.className = 'dmg-num mat'; el.textContent = txt; const p = point.clone().project(this.camera); el.style.left = (p.x * 0.5 + 0.5) * innerWidth + 'px'; el.style.top = (-p.y * 0.5 + 0.5) * innerHeight + 'px'; $('damage-container').appendChild(el); setTimeout(() => el.remove(), 900); }
  _hitmarker(head){ const h = $('hitmarker'); h.classList.remove('show', 'head'); void h.offsetWidth; h.classList.add('show'); if(head) h.classList.add('head'); }
  _hurtFx(from){
    const f = $('damage-flash'); f.classList.remove('show'); void f.offsetWidth; f.classList.add('show');
    this.tps.addTrauma(0.25);
    if(from){ const d = _v.subVectors(from.root.position, this.player.root.position); const ang = Math.atan2(d.x, d.z) - this.tps.yaw; const ind = $('dmg-dir'); ind.style.transform = `translate(-50%,-50%) rotate(${-ang + Math.PI}rad)`; ind.classList.remove('show'); void ind.offsetWidth; ind.classList.add('show'); }
  }
  _killfeed(k, v){
    const el = document.createElement('div'); el.className = 'kf-item';
    el.innerHTML = k ? `<b class="${k.isPlayer ? 'me' : ''}">${k.name}</b> <span>${SLOT_ICONS[k.weaponType] || '×'}</span> <b class="${v.isPlayer ? 'me' : ''}">${v.name}</b>` : `<b class="${v.isPlayer ? 'me' : ''}">${v.name}</b> <span>foi pega pela tempestade</span>`;
    $('killfeed').prepend(el); setTimeout(() => el.remove(), 6000);
  }
  toast(msg, kind){ const t = $('toast'); t.textContent = msg; t.className = 'show' + (kind ? ' ' + kind : ''); clearTimeout(this._tt); this._tt = setTimeout(() => t.className = '', 2600); }
}

export const SLOT_ICONS = {
  pickaxe: '<svg viewBox="0 0 48 48"><path d="M8 14c8-7 22-9 32-4-7 0-13 2-18 6l16 22-4 3-16-22c-4 3-7 7-8 12-3-6-3-12-2-17z" fill="currentColor"/></svg>',
  rifle: '<svg viewBox="0 0 64 32"><path d="M2 12h34l2-3h10l2 3h12v5H50l-2 2H38l-4 9h-7l2-9H14l-3 5H4l2-5H2z" fill="currentColor"/></svg>',
  shotgun: '<svg viewBox="0 0 64 32"><path d="M2 13h44v2h16v4H46v1H30l-3 3H16l-5 6H4l5-8H2z" fill="currentColor"/><rect x="30" y="17" width="12" height="3" fill="currentColor"/></svg>',
  sniper: '<svg viewBox="0 0 64 32"><path d="M2 15h40l2-2h18v3H44v3H26l-4 8h-6l3-8H10l-4 5H1l3-6z" fill="currentColor"/><rect x="20" y="7" width="16" height="5" rx="2" fill="currentColor"/></svg>'
};
