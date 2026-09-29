// ============================================================
// ACTOR — entidade jogável (jogador ou bot): personagem riggado +
// animador + corpo físico + inventário + combate.
// O mesmo código serve para jogador e IA (retargeting: qualquer
// skin/tipo de corpo usa o mesmo esqueleto e as mesmas animações).
// ============================================================
import * as THREE from 'three';
import { createCharacter, setCharacterLOD } from '../anim/rig.js';
import { Animator } from '../anim/animator.js';
import { WEAPON_STATS, createWeapon, createPickaxe, createPotion, createMedkit, createGlider } from './weapons.js';
import { Mat } from '../engine/materials.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
let _uid = 0;

export class Actor {
  constructor(game, skin, opts){
    opts = opts || {};
    this.game = game; this.id = opts.id || ('a' + (++_uid)); this.name = opts.name || 'Jogador';
    this.isPlayer = !!opts.isPlayer; this.isBot = !opts.isPlayer;
    this.ch = createCharacter(skin, { bodyType: opts.bodyType, name: this.name });
    this.anim = new Animator(this.ch);
    this.anim.onEvent = (ev, clip) => this._onAnimEvent(ev, clip);
    this.root = this.ch.root;
    this.body = { pos: this.root.position, vel: new THREE.Vector3(), radius: 1.2, height: 7.2, grounded: true };
    this.yaw = 0; this.pitch = 0; this.moveYaw = 0;
    this.hp = 100; this.shield = 0; this.alive = true; this.kills = 0;
    this.mode = 'ground';        // ground | freefall | glide
    this.crouch = false; this.sprint = false; this.aiming = false;
    this.slots = ['pickaxe', null, null, null, null];
    this.slot = 0;
    this.mag = {}; this.reserve = { rifle: 60, shotgun: 10, sniper: 6 };
    this.mats = { wood: 60, stone: 30 }; this.potions = 1; this.medkits = 0;
    this.cooldown = 0; this.reloading = 0; this.using = 0; this.useKind = null;
    this.models = {};
    this.pickaxe = createPickaxe(); this.anim.setPickaxe(this.pickaxe);
    this.glider = createGlider(this.ch.S.accent || 0xfbbf24); this.glider.visible = false; this.root.add(this.glider);
    this.glider.position.set(0, 7.6, -0.6);
    this.lastHitBy = null; this.lastShotT = -99;
    this.stepPhase = 0; this.lastStepSide = 0;
    this.moveInput = new THREE.Vector2();
    this.hbList = [this.ch.hitboxes.head, ...this.ch.hitboxes.body];
    game.scene.add(this.root);
  }
  get weaponType(){ return this.slots[this.slot] || 'none'; }
  get stats(){ return WEAPON_STATS[this.weaponType]; }
  give(type){
    if(!WEAPON_STATS[type] || type === 'pickaxe') return false;
    let idx = this.slots.indexOf(type);
    if(idx < 0){ idx = this.slots.indexOf(null, 1); if(idx < 0) idx = this.slot || 1; this.slots[idx] = type; }
    if(this.mag[type] === undefined) this.mag[type] = WEAPON_STATS[type].mag;
    this.reserve[type] = (this.reserve[type] || 0) + Math.round(WEAPON_STATS[type].mag * 1.5);
    return idx;
  }
  equip(idx){
    if(idx === this.slot && this._equipped === this.slots[idx]) return;
    if(idx > 0 && !this.slots[idx]) return;
    this.slot = idx; this.reloading = 0; this.anim.stop('reloadRifle'); this.anim.stop('reloadShotgun'); this.anim.stop('boltSniper');
    const t = this.slots[idx];
    this._equipped = t;
    if(t === 'pickaxe' || !t){ this.anim.setWeapon(null); this.pickaxe.visible = true; }
    else {
      if(!this.models[t]) this.models[t] = createWeapon(t);
      this.anim.setWeapon(this.models[t]); this.pickaxe.visible = false;
    }
    this.anim.play('equip');
    this.cooldown = Math.max(this.cooldown, 0.3);
    if(this.isPlayer){ this.game.audio.play('ui', null, { vol: 0.3 }); this.game._updateSlotsUI && this.game._updateSlotsUI(); }
  }
  // ----- combate -----
  canFire(){ return this.alive && this.cooldown <= 0 && this.reloading <= 0 && this.using <= 0 && this.mode === 'ground'; }
  tryFire(origin, dir){
    const t = this.weaponType;
    if(!this.canFire()) return false;
    const st = WEAPON_STATS[t];
    if(t === 'pickaxe'){
      this.cooldown = st.cd;
      this.anim.play(Math.random() < 0.5 ? 'pickaxeSwing1' : 'pickaxeSwing2', { speed: 1.1 });
      this.game.audio.play('woosh', this.root.position, { vol: 0.5 });
      this._pendingSwing = { origin: origin.clone(), dir: dir.clone() };
      return true;
    }
    if((this.mag[t] || 0) <= 0){ this.game.audio.play('click', this.root.position, { vol: 0.6 }); this.cooldown = 0.25; this.reload(); return false; }
    this.mag[t]--; this.cooldown = st.cd; this.lastShotT = this.game.time;
    this.anim.fire(t);
    const model = this.models[t];
    const muzzle = model ? model.markers.muzzle.getWorldPosition(new THREE.Vector3()) : origin.clone();
    this.game.fireHitscan(this, origin, dir, st, muzzle);
    if(st.pump && this.mag[t] > 0){ setTimeout(() => { if(this.alive && this.weaponType === 'shotgun'){ this.anim.play('pumpShotgun'); } }, 180); }
    if(st.bolt && this.reserve[t] > 0){ setTimeout(() => { if(this.alive && this.weaponType === 'sniper') this.reload(); }, 250); }
    // cápsula ejetada (corpo rígido)
    if(model && this.game.physics && this.game.quality !== 'baixa') this._ejectShell(model);
    if(this.mag[t] <= 0 && this.reserve[t] > 0 && !st.bolt) setTimeout(() => this.reload(), 300);
    return true;
  }
  _ejectShell(model){
    const p = model.markers.eject.getWorldPosition(new THREE.Vector3());
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(-1);
    const shell = new THREE.Mesh(this.game.shellGeo, this.weaponType === 'shotgun' ? Mat.paint(0xb91c1c) : Mat.metal(0xd4a02a, 0.3));
    shell.position.copy(p); this.game.scene.add(shell);
    this.game.physics.addBody(shell, right.multiplyScalar(-8 - Math.random() * 4).add(new THREE.Vector3(0, 9 + Math.random() * 3, 0)), new THREE.Vector3(Math.random() * 30, Math.random() * 30, Math.random() * 30), { life: 3, r: 0.05, bounce: 0.4, onHit: (b, s) => { if(b.hits < 3) this.game.audio.play('click', b.mesh.position, { vol: 0.08, rate: 2.2 + Math.random() }); } });
  }
  reload(){
    const t = this.weaponType, st = WEAPON_STATS[t];
    if(!st || !st.mag || this.reloading > 0 || this.using > 0) return;
    if((this.mag[t] || 0) >= st.mag || (this.reserve[t] || 0) <= 0) return;
    this.reloading = st.reloadTime;
    this.anim.play(st.reloadClip, { speed: st.reloadClip === 'reloadShotgun' ? 1 : 1 });
    this._reloadType = t;
  }
  _finishReload(){
    const t = this._reloadType, st = WEAPON_STATS[t]; if(!st) return;
    const need = st.mag - (this.mag[t] || 0), take = Math.min(need, this.reserve[t] || 0);
    this.mag[t] = (this.mag[t] || 0) + take; this.reserve[t] -= take;
  }
  useItem(kind){
    if(!this.alive || this.using > 0 || this.reloading > 0 || this.mode !== 'ground') return false;
    if(kind === 'potion' && (this.potions <= 0 || this.shield >= 100)) return false;
    if(kind === 'medkit' && (this.medkits <= 0 || this.hp >= 100)) return false;
    this.useKind = kind; this.using = kind === 'potion' ? 2.0 : 3.2;
    this.anim.setWeapon(null); this.pickaxe.visible = false;
    const prop = kind === 'potion' ? createPotion() : createMedkit();
    this.anim.setProp(prop); this.anim.play(kind === 'potion' ? 'drink' : 'medkit');
    return true;
  }
  _finishUse(){
    const k = this.useKind; this.useKind = null; this.anim.setProp(null);
    if(k === 'potion'){ this.potions--; this.shield = Math.min(100, this.shield + 50); this.game.particles.emit('shield', this.root.position); }
    if(k === 'medkit'){ this.medkits--; this.hp = Math.min(100, this.hp + 50); this.game.particles.emit('heal', this.root.position); }
    this._equipped = null; this.equip(this.slot);
  }
  cancelUse(){ if(this.using > 0){ this.using = 0; this.useKind = null; this.anim.setProp(null); this.anim.stop('drink'); this.anim.stop('medkit'); this._equipped = null; this.equip(this.slot); } }
  _onAnimEvent(ev, clip){
    const g = this.game;
    if(ev === 'hit' && this._pendingSwing){ g.pickaxeHit(this, this._pendingSwing.origin, this._pendingSwing.dir); this._pendingSwing = null; }
    if(ev === 'magOut') g.audio.play('magOut', this.root.position, { vol: 0.5 });
    if(ev === 'magIn') g.audio.play('magIn', this.root.position, { vol: 0.5 });
    if(ev === 'magSwap' && this.models.rifle && g.quality !== 'baixa') this._dropMag();
    if(ev === 'charge' || ev === 'shell') g.audio.play(ev === 'shell' ? 'magIn' : 'bolt', this.root.position, { vol: 0.4 });
    if(ev === 'gulp') g.audio.play('gulp', this.root.position, { vol: 0.6 });
    if(clip === 'pumpShotgun' || ev === 'pump') g.audio.play('pump', this.root.position, { vol: 0.5 });
    if(clip === 'boltSniper' && ev === 'bolt') g.audio.play('bolt', this.root.position, { vol: 0.5 });
  }
  _dropMag(){
    const mag = this.models.rifle.parts.mag; if(!mag) return;
    const clone = mag.clone(); mag.getWorldPosition(clone.position); mag.getWorldQuaternion(clone.quaternion);
    this.game.scene.add(clone);
    this.game.physics.addBody(clone, new THREE.Vector3(0, -2, 0), new THREE.Vector3(3, 1, 2), { life: 4, r: 0.15, bounce: 0.25, onHit: (b) => { if(b.hits < 2) this.game.audio.play('click', b.mesh.position, { vol: 0.2, rate: 0.7 }); } });
  }
  takeDamage(amount, from, head){
    if(!this.alive) return 0;
    let dmg = amount;
    if(this.shield > 0){ const s = Math.min(this.shield, dmg); this.shield -= s; dmg -= s; }
    this.hp -= dmg; this.lastHitBy = from;
    if(this.using > 0) this.cancelUse();
    // reação física: direção do golpe no espaço local
    if(from){ const d = _v.subVectors(this.root.position, from.root.position).normalize(); const localX = d.x * Math.cos(this.yaw) - d.z * Math.sin(this.yaw); this.anim.hitReact(localX, head ? 1.2 : 0.7); }
    if(this.hp <= 0){ this.hp = 0; this.die(from); }
    return amount;
  }
  die(killer){
    this.alive = false;
    this.anim.stopEmotes(); this.anim.setWeapon(null); this.anim.play('death');
    this.game.onActorDeath(this, killer);
  }
  // ----- update -----
  update(dt){
    const g = this.game;
    this.cooldown -= dt;
    if(this.reloading > 0){ this.reloading -= dt; if(this.reloading <= 0) this._finishReload(); }
    if(this.using > 0){ this.using -= dt; if(this.using <= 0) this._finishUse(); }
    // física
    const b = this.body;
    if(this.alive){
      const speedBase = this.crouch ? 8 : this.sprint ? 23 : 17;
      const slow = (this.using > 0 ? 0.45 : 1) * (this.aiming ? 0.6 : 1);
      const mi = this.moveInput;
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      // input local (x = direita da câmera, y = frente)
      const fx = sy, fz = cy, rx = -cy, rz = sy;
      let wx = fx * mi.y + rx * mi.x, wz = fz * mi.y + rz * mi.x;
      const l = Math.hypot(wx, wz); if(l > 1){ wx /= l; wz /= l; }
      if(this.mode === 'ground'){
        const accel = b.grounded ? 12 : 3;
        b.vel.x += (wx * speedBase * slow - b.vel.x) * Math.min(1, accel * dt);
        b.vel.z += (wz * speedBase * slow - b.vel.z) * Math.min(1, accel * dt);
        b.gravityScale = 1; b.maxFall = 0;
      } else if(this.mode === 'freefall'){
        b.vel.x += (wx * 30 - b.vel.x) * Math.min(1, 2 * dt); b.vel.z += (wz * 30 - b.vel.z) * Math.min(1, 2 * dt);
        b.gravityScale = 0.5; b.maxFall = mi.y > 0.5 ? 80 : 55;
        const gh = g.physics.groundAt(b.pos.x, b.pos.z, b.pos.y, 0);
        if(b.pos.y - gh < 90) this.setMode('glide');
      } else if(this.mode === 'glide'){
        b.vel.x += (wx * 26 + fx * 8 - b.vel.x) * Math.min(1, 1.5 * dt); b.vel.z += (wz * 26 + fz * 8 - b.vel.z) * Math.min(1, 1.5 * dt);
        b.gravityScale = 0.25; b.maxFall = 14;
      }
      g.physics.moveCharacter(b, dt);
      if(b.landVy < -30 && this.mode === 'ground') this.anim.landImpact(b.landVy);
      if(b.grounded && this.mode !== 'ground') this.setMode('ground');
      if(b.landVy < -20){ g.particles.emit('dust', b.pos, { n: 10, power: 1.4 }); g.audio.play('land', b.pos, { vol: 0.6 }); }
      // passos (sincronizados com fase do ciclo)
      const sp = Math.hypot(b.vel.x, b.vel.z);
      if(b.grounded && sp > 3){
        const side = Math.sin(this.anim.phase * Math.PI * 2) > 0 ? 1 : -1;
        if(side !== this.lastStepSide){ this.lastStepSide = side; g.onFootstep(this, sp); }
      }
      // rotação do corpo = yaw de mira (estilo Fortnite)
      this.root.rotation.y = this.yaw;
    } else {
      b.vel.set(0, b.vel.y, 0); g.physics.moveCharacter(b, dt);
    }
    // estado da animação
    const st = {
      vel: b.vel, grounded: b.grounded, crouch: this.crouch, vy: b.vel.y, mode: this.mode,
      weapon: this.using > 0 ? 'none' : (this.weaponType === 'none' ? 'none' : this.weaponType),
      aimPitch: this.pitch, aiming: this.aiming, aimPoint: this.aimPoint || null, lookTarget: this.lookTarget || null
    };
    // LOD por distância
    if(g.camera){
      const d = g.camera.position.distanceTo(this.root.position);
      setCharacterLOD(this.ch, d < 45 ? 0 : d < 120 ? 1 : 2);
      this._animSkip = d > 160 ? 3 : d > 90 ? 2 : 1;
    }
    this._animAcc = (this._animAcc || 0) + dt; this._animFrame = ((this._animFrame || 0) + 1) % (this._animSkip || 1);
    if(this._animFrame === 0){ this.anim.update(this._animAcc, st); this._animAcc = 0; }
    this.glider.visible = this.mode === 'glide';
    if(this.glider.visible && this.glider.userData.wing){ this.glider.userData.wing.rotation.z = Math.sin(g.time * 2) * 0.03; }
  }
  setMode(m){
    if(this.mode === m) return;
    this.mode = m;
    if(m === 'glide') this.game.audio.play('woosh', this.root.position, { vol: 0.6 });
  }
  dispose(){ if(this.root.parent) this.root.parent.remove(this.root); }
}
