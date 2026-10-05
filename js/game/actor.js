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
import { Trail } from '../engine/trail.js';
import { PICKAXES, CONTRAILS } from './cosmetics.js';

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
    this.mag = {}; this.reserve = { rifle: 60, shotgun: 10, sniper: 6, smg: 60, pistol: 32 };
    this.mats = { wood: 60, stone: 30, metal: 0 }; this.potions = 1; this.medkits = 0; this.bandages = 0; this.minis = 0;
    this.rar = {}; this.tac = { granada: 0, impulso: 0, escudo: 0, fumo: 0, arbusto: 0 }; this.tacSel = 'granada'; this.bush = null; this.rifts = 0;      // v16: raridade por arma, granadas, fendas
    this.slideT = 0; this.mantleT = 0; this.climbing = false; this.stamina = 4; this.staminaMax = 4; this.jumpHeld = false; this.coyote = 0; this.jumpBuf = 0; this.inWater = false;
    this.cooldown = 0; this.reloading = 0; this.using = 0; this.useKind = null;
    this.models = {};
    // cosméticos (loadout)
    this.loadout = Object.assign({ pickaxe: 'padrao', glider: 'classico', contrail: 'nuvem' }, opts.loadout || {});
    this.pickaxe = createPickaxe(this.loadout.pickaxe); this.anim.setPickaxe(this.pickaxe);
    this.pkInfo = PICKAXES[this.loadout.pickaxe] || PICKAXES.padrao;
    this.glider = createGlider(this.ch.S.accent || 0xfbbf24, this.loadout.glider); this.glider.visible = false; this.root.add(this.glider);
    this.glider.position.set(0, 7.6, -0.6);
    this.deployT = 1;             // 0→1 animação de abertura do planador
    this.combo = 0; this.comboT = 0;
    this.fallInput = { dive: 0, bank: 0 };
    this.airTime = 0; this.launched = false;
    // rastros: picareta (golpe) e mãos (queda livre)
    if(game.scene){
      this.pickTrail = new Trail(game.scene, { color: this.pkInfo.trail, life: 0.16, segments: 16, opacity: 0.9 });
      const ct = CONTRAILS[this.loadout.contrail] || CONTRAILS.nenhum;
      if(ct.color !== null && ct.color !== undefined){
        this.handTrails = [0, 1].map(() => new Trail(game.scene, { color: ct.color === 'rainbow' ? 0xffffff : ct.color, rainbow: ct.color === 'rainbow', life: 0.45, segments: 24, opacity: 0.45 }));
        this.contrailKind = this.loadout.contrail;
      }
    }
    this.lastHitBy = null; this.lastShotT = -99;
    this.stepPhase = 0; this.lastStepSide = 0;
    this.moveInput = new THREE.Vector2();
    this.hbList = [this.ch.hitboxes.head, ...this.ch.hitboxes.body];
    game.scene.add(this.root);
  }
  get weaponType(){ return this.slots[this.slot] || 'none'; }
  get stats(){ return WEAPON_STATS[this.weaponType]; }
  give(type, rar){
    if(!WEAPON_STATS[type] || type === 'pickaxe') return false;
    let idx = this.slots.indexOf(type);
    if(idx < 0){ idx = this.slots.indexOf(null, 1); if(idx < 0) idx = this.slot || 1; this.slots[idx] = type; this.rar[type] = rar || 0; }
    else this.rar[type] = Math.max(this.rar[type] || 0, rar || 0);
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
      if(!this.models[t]){ this.models[t] = createWeapon(t); const wr = this.isPlayer ? (this.game.app && this.game.app.settings.wrap) : this.wrap; if(wr && this.game.applyWrap) this.game.applyWrap(this.models[t], wr); }
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
    if(this.downed || !this.canFire()) return false;
    const st = WEAPON_STATS[t];
    if(t === 'pickaxe'){
      // combo de 3 golpes: direita → esquerda → vertical pesado (reseta se parar de bater)
      if(this.comboT <= 0) this.combo = 0;
      const clip = ['pickaxeSwing1', 'pickaxeSwing2', 'pickaxeSwing3'][this.combo];
      this.cooldown = this.combo === 2 ? st.cd * 1.35 : st.cd;
      this.swingKind = this.combo; this.combo = (this.combo + 1) % 3; this.comboT = 1.1;
      this.anim.play(clip, { speed: 1.1 });
      this.swingT = clip === 'pickaxeSwing3' ? 0.5 : 0.4;
      this.game.audio.play('woosh', this.root.position, { vol: 0.5, rate: (this.pkInfo.pitch || 1) * (0.95 + Math.random() * 0.1) });
      this._pendingSwing = { origin: origin.clone(), dir: dir.clone() };
      if(this.game.net) this.game.net.sendSwing(this, this.swingKind);
      return true;
    }
    if((this.mag[t] || 0) <= 0){ this.game.audio.play('click', this.root.position, { vol: 0.6 }); this.cooldown = 0.25; this.reload(); return false; }
    this.mag[t]--; this.cooldown = st.cd; this.lastShotT = this.game.time;
    if(this.bush && this.game.fx2) this.game.fx2.dropBush(this);
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
    const cap = st.mag + (this.att && this.att[t] && this.att[t].includes('carregador') ? Math.ceil(st.mag * 0.4) : 0);
    const need = cap - (this.mag[t] || 0), take = Math.min(need, this.reserve[t] || 0);
    this.mag[t] = (this.mag[t] || 0) + take; this.reserve[t] -= take;
  }
  useItem(kind){
    if(!this.alive || this.using > 0 || this.reloading > 0 || this.mode !== 'ground') return false;
    if(kind === 'potion' && (this.potions <= 0 || this.shield >= 100)) return false;
    if(kind === 'medkit' && (this.medkits <= 0 || this.hp >= 100)) return false;
    if(this.downed) return false;
    // v22: bandagens (+15 vida até 75) e mini escudos (+25 escudo até 50)
    if(kind === 'bandage' && (this.bandages <= 0 || this.hp >= 75)) return false;
    if(kind === 'mini' && (this.minis <= 0 || this.shield >= 50)) return false;
    this.useKind = kind; this.using = kind === 'potion' ? 2.0 : kind === 'mini' ? 1.0 : kind === 'bandage' ? 2.2 : 3.2;
    this.anim.setWeapon(null); this.pickaxe.visible = false;
    const drink = kind === 'potion' || kind === 'mini';
    const prop = drink ? createPotion() : createMedkit(); if(kind === 'mini') prop.scale.setScalar(0.65); if(kind === 'bandage') prop.scale.set(0.7, 0.45, 0.7);
    this.anim.setProp(prop); this.anim.play(drink ? 'drink' : 'medkit', kind === 'mini' ? { speed: 1.8 } : undefined);
    return true;
  }
  _finishUse(){
    const k = this.useKind; this.useKind = null; this.anim.setProp(null);
    if(k === 'potion'){ this.potions--; this.shield = Math.min(100, this.shield + 50); this.game.particles.emit('shield', this.root.position); }
    if(k === 'medkit'){ this.medkits--; this.hp = Math.min(100, this.hp + 50); this.game.particles.emit('heal', this.root.position); }
    if(k === 'bandage'){ this.bandages--; this.hp = Math.min(75, this.hp + 15); this.game.particles.emit('heal', this.root.position); }
    if(k === 'mini'){ this.minis--; this.shield = Math.min(50, this.shield + 25); this.game.particles.emit('shield', this.root.position); }
    this._equipped = null; this.equip(this.slot);
  }
  cancelUse(){ if(this.using > 0){ this.using = 0; this.useKind = null; this.anim.setProp(null); this.anim.stop('drink'); this.anim.stop('medkit'); this._equipped = null; this.equip(this.slot); } }
  _onAnimEvent(ev, clip){
    const g = this.game;
    if(ev === 'hit' && this._pendingSwing){ g.pickaxeHit(this, this._pendingSwing.origin, this._pendingSwing.dir); this._pendingSwing = null; }
    if(ev === 'magOut') g.audio.play('magOut', this.root.position, { vol: 0.5 });
    if(ev === 'magIn') g.audio.play('magIn', this.root.position, { vol: 0.5 });
    if(ev === 'magSwap' && this.models[this.weaponType] && this.models[this.weaponType].parts.mag && g.quality !== 'baixa') this._dropMag();
    if(ev === 'charge' || ev === 'shell') g.audio.play(ev === 'shell' ? 'magIn' : 'bolt', this.root.position, { vol: 0.4 });
    if(ev === 'gulp') g.audio.play('gulp', this.root.position, { vol: 0.6 });
    if(clip === 'pumpShotgun' || ev === 'pump') g.audio.play('pump', this.root.position, { vol: 0.5 });
    if(clip === 'boltSniper' && ev === 'bolt') g.audio.play('bolt', this.root.position, { vol: 0.5 });
  }
  _dropMag(){
    const mag = this.models[this.weaponType] && this.models[this.weaponType].parts.mag; if(!mag) return;
    const clone = mag.clone(); mag.getWorldPosition(clone.position); mag.getWorldQuaternion(clone.quaternion);
    this.game.scene.add(clone);
    this.game.physics.addBody(clone, new THREE.Vector3(0, -2, 0), new THREE.Vector3(3, 1, 2), { life: 4, r: 0.15, bounce: 0.25, onHit: (b) => { if(b.hits < 2) this.game.audio.play('click', b.mesh.position, { vol: 0.2, rate: 0.7 }); } });
  }
  takeDamage(amount, from, head){
    if(!this.alive) return 0;
    if(this.bush && amount > 0 && this.game.fx2) this.game.fx2.dropBush(this);
    if(from && from !== this && this.game.isAlly && this.game.isAlly(from, this)) return 0;   // sem fogo amigo
    if(this.remote){
      // boneco de outro jogador: o dono aplica o dano (P2P); aqui só a reação visual
      if(this.game.net) this.game.net.sendHit(this, amount, from, head);
      if(from){ const d = _v.subVectors(this.root.position, from.root.position).normalize(); this.anim.hitReact(d.x * Math.cos(this.yaw) - d.z * Math.sin(this.yaw), head ? 1.2 : 0.7); }
      return amount;
    }
    let dmg = amount;
    if(this.shield > 0){ const s = Math.min(this.shield, dmg); this.shield -= s; dmg -= s; }
    this.hp -= dmg; this.lastHitBy = from;
    if(this.using > 0) this.cancelUse();
    // reação física: direção do golpe no espaço local
    if(from){ const d = _v.subVectors(this.root.position, from.root.position).normalize(); const localX = d.x * Math.cos(this.yaw) - d.z * Math.sin(this.yaw); this.anim.hitReact(localX, head ? 1.2 : 0.7); }
    if(this.hp <= 0){ this.hp = 0; if(this.game.s22 && this.game.s22.tryDown(this, from)) return amount; this.die(from); }
    return amount;
  }
  die(killer){
    if(this.downed){ this.downed = false; this.speedMul = this._sm0 || 1; }
    this.alive = false; this.climbing = false;
    if(this.local && this.game.net) this.game.net.sendDeath(this, killer);
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
    if(this.remote){ if(g.net) g.net.step(this, dt); }
    else if(this.alive){
      // v17: jogador mais rápido (andar 17→20, correr 23→28, agachado 8→10)
      const speedBase = (this.crouch ? 10 : this.sprint ? 28 : 20) * (this.boostT > 0 ? 1.55 : 1) * (this.speedMul || 1);   // v20: placas de velocidade
      // v16: água (lago/rio) abranda e salpica
      const wy = g.world && g.world.waterAt ? g.world.waterAt(b.pos.x, b.pos.z) : null;
      this.inWater = wy !== null && b.pos.y < wy + 0.4 && this.mode === 'ground';
      const slow = (this.using > 0 ? 0.45 : 1) * (this.aiming ? 0.6 : 1) * (this.inWater ? 0.62 : 1);
      const mi = this.moveInput;
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      // input local (x = direita da câmera, y = frente)
      const fx = sy, fz = cy, rx = -cy, rz = sy;
      let wx = fx * mi.y + rx * mi.x, wz = fz * mi.y + rz * mi.x;
      const l = Math.hypot(wx, wz); if(l > 1){ wx /= l; wz /= l; }
      if(this.kart && g.v20){
        g.v20.kartStep(this, dt, mi);   // v20: quadriciclo (a física normal trata da gravidade e colisões)
      } else if(this.rail && g.v19){
        g.v19.railStep(this, dt);   // v19: carril de deslize
      } else if(this.mode === 'zip'){
        if(g.fs) g.fs.zipStep(this, dt);
      } else if(this.mantleT > 0){
        // v16: escalar beirais — puxa o corpo para cima e para a frente numa curva curta
        this.mantleT -= dt; const M = this.mantle, u = 1 - Math.max(0, this.mantleT) / 0.32, e = u * u * (3 - 2 * u);
        b.pos.x = M.from.x + (M.to.x - M.from.x) * Math.min(1, Math.max(0, e * 1.4 - 0.4));
        b.pos.z = M.from.z + (M.to.z - M.from.z) * Math.min(1, Math.max(0, e * 1.4 - 0.4));
        b.pos.y = M.from.y + (M.to.y - M.from.y) * Math.min(1, e * 1.5);
        b.vel.set(0, 0, 0);
        if(this.mantleT <= 0){ b.pos.copy(M.to); b.grounded = true; b.vel.set(Math.sin(this.yaw) * 8, 0, Math.cos(this.yaw) * 8); }
      } else if(this.mode === 'ground'){
        // v16: deslizar (agachar a correr) — conserva o impulso e trava devagar
        if(this.slideT > 0){
          this.slideT -= dt; this.crouch = true;
          // v17: deslize mais rápido e mais longo, acelera nas descidas e permite curvar um pouco
          const fr = b.grounded ? 1.05 : 0.3; b.vel.x -= b.vel.x * Math.min(1, fr * dt); b.vel.z -= b.vel.z * Math.min(1, fr * dt);
          const dy = (this._slideY ?? b.pos.y) - b.pos.y; this._slideY = b.pos.y;
          const hs = Math.hypot(b.vel.x, b.vel.z);
          if(b.grounded && dy > 0.004 && hs > 0.1){ const ns = Math.min(50, hs + dy * 55); b.vel.x *= ns / hs; b.vel.z *= ns / hs; this.slideT = Math.min(1.6, this.slideT + dt * 0.9); }
          if(l > 0.2 && hs > 0.1){ const a0 = Math.atan2(b.vel.x, b.vel.z), a1 = Math.atan2(wx, wz); let da = a1 - a0; da = Math.atan2(Math.sin(da), Math.cos(da)); const a = a0 + THREE.MathUtils.clamp(da, -1, 1) * Math.min(1, dt * 2.2), sp2 = Math.hypot(b.vel.x, b.vel.z); b.vel.x = Math.sin(a) * sp2; b.vel.z = Math.cos(a) * sp2; }
          if(Math.random() < 0.5 && b.grounded) g.particles.emit('dust', b.pos, { n: 1, power: 0.7 });
          if(this.slideT <= 0 || Math.hypot(b.vel.x, b.vel.z) < 10){ this.slideT = 0; this._slideY = undefined; }
        } else {
        const accel = this.flying ? 6 : b.grounded ? 14 : 5, fm = this.flying ? 2.2 : 1;
        b.vel.x += (wx * speedBase * slow * fm - b.vel.x) * Math.min(1, accel * dt);
        b.vel.z += (wz * speedBase * slow * fm - b.vel.z) * Math.min(1, accel * dt);
        }
        // tempo de coyote + buffer de salto
        this.coyote = b.grounded ? 0.13 : this.coyote - dt; this.jumpBuf -= dt;
        if(this.jumpBuf > 0 && this.coyote > 0 && !this.flying && b.vel.y <= 1){ this.jumpBuf = 0; this.coyote = 0; this._doJump(); }
        // escalar: no ar, a empurrar para a frente contra um beiral baixo
        if(!b.grounded && !this.flying && mi.y > 0.5 && b.vel.y < 12 && this.airTime > 0.08) this._tryMantle();
        // v19: ESCALADA — segurar ESPAÇO + frente contra parede/rocha/árvore/falésia; gasta resistência
        if(this.climbing) this._climbStep(dt, mi);
        else if(this.jumpHeld && mi.y > 0.5 && !this.flying && this.slideT <= 0 && this.stamina > 0.4 && !(this.mantleT > 0) && (this.airTime > 0.12 || b.grounded) && this._climbTimer <= 0) this._tryClimb();
        if(!this.climbing){ this._climbTimer = Math.max(0, (this._climbTimer || 0) - dt); if(b.grounded) this.stamina = Math.min(this.staminaMax, this.stamina + dt * 1.1); }
        b.gravityScale = this.flying || this.climbing ? 0 : (g.gravMul || 1); b.maxFall = 0;
        if(this.flying) b.vel.y += ((this.flyUp || 0) * 28 - b.vel.y) * Math.min(1, 8 * dt);   // voo do Modo Criativo
      } else if(this.mode === 'freefall'){
        // mergulho (frente) acelera a queda, trás "trava" (planar de barriga); A/D inclina e curva
        const fi = this.fallInput; fi.dive = THREE.MathUtils.damp(fi.dive, mi.y > 0.3 ? 1 : mi.y < -0.3 ? -1 : 0, 3, dt); fi.bank = THREE.MathUtils.damp(fi.bank, mi.x, 4, dt);
        const hs = 22 + fi.dive * 14;
        b.vel.x += (wx * hs - b.vel.x) * Math.min(1, 1.8 * dt); b.vel.z += (wz * hs - b.vel.z) * Math.min(1, 1.8 * dt);
        b.gravityScale = 0.55; b.maxFall = 58 + fi.dive * 34;
        this.yaw += -fi.bank * 0.9 * dt * (this.isPlayer ? 0 : 1);   // bots curvam pelo bank; o jogador usa a câmera
        const gh = g.physics.groundAt(b.pos.x, b.pos.z, b.pos.y, 0);
        this.height = b.pos.y - gh;
        if(b.vel.y < 0 && (this.height < 70 || (this.wantDeploy && this.height < 240))) this.setMode('glide');
      } else if(this.mode === 'glide'){
        const fi = this.fallInput; fi.dive = THREE.MathUtils.damp(fi.dive, mi.y > 0.3 ? 1 : mi.y < -0.3 ? -0.6 : 0, 2.5, dt); fi.bank = THREE.MathUtils.damp(fi.bank, mi.x, 3, dt);
        this.deployT = Math.min(1, this.deployT + dt * 2.6);
        const fwd = 12 + fi.dive * 10;
        b.vel.x += (wx * 20 + fx * fwd - b.vel.x) * Math.min(1, 1.4 * dt); b.vel.z += (wz * 20 + fz * fwd - b.vel.z) * Math.min(1, 1.4 * dt);
        b.gravityScale = 0.25; b.maxFall = 12 + fi.dive * 10;
        // puxão ao abrir: sobe levemente
        if(this.deployT < 0.35) b.vel.y = Math.max(b.vel.y, -4 + (0.35 - this.deployT) * 20);
        this.height = b.pos.y - g.physics.groundAt(b.pos.x, b.pos.z, b.pos.y, 0);
      }
      const wasMode = this.mode, prevVy = b.vel.y;
      if(this.mode !== 'zip' && !(this.mantleT > 0) && !this.rail) g.physics.moveCharacter(b, dt);
      if(!b.grounded) this.airTime += dt; 
      if(b.landVy < -30 && this.mode === 'ground') this.anim.landImpact(b.landVy);
      if(b.grounded && this.mode !== 'ground'){ this.setMode('ground'); if(wasMode === 'glide'){ this.anim.play('landGlide'); g.particles.emit('dust', b.pos, { n: 16, power: 1.8 }); this._landFx(); } }
      if(b.grounded && this.airTime > 0){
        // queda alta (após salto de plataforma/construção): aterrissagem pesada com poeira em anel
        if(b.landVy < -38 && wasMode === 'ground'){ this.anim.play(Math.hypot(b.vel.x, b.vel.z) > 12 && !this.climbing ? 'rolar' : 'landHeavy'); g.particles.emit('dust', b.pos, { n: 22, power: 2.4 }); if(this.isPlayer && g.tps) g.tps.addTrauma(0.35); }
        this.airTime = 0; this.launched = false;
      }
      if(b.landVy < -20){ g.particles.emit('dust', b.pos, { n: 10, power: 1.4 }); g.audio.play('land', b.pos, { vol: 0.6 }); }
      // passos (sincronizados com fase do ciclo)
      const sp = Math.hypot(b.vel.x, b.vel.z);
      if(b.grounded && sp > 3){
        const side = Math.sin(this.anim.phase * Math.PI * 2) > 0 ? 1 : -1;
        if(side !== this.lastStepSide){ this.lastStepSide = side; if(this.slideT <= 0) g.onFootstep(this, sp); if(this.inWater){ g.particles.emit('splash', b.pos, { n: 4 }); } }
      }
      // rotação do corpo = yaw de mira (estilo Fortnite)
      this.root.rotation.y = this.yaw;
    } else {
      b.vel.set(0, b.vel.y, 0); g.physics.moveCharacter(b, dt);
    }
    // estado da animação
    const st = {
      vel: b.vel, grounded: b.grounded, crouch: this.crouch, vy: b.vel.y, mode: this.mode,
      weapon: this.using > 0 || this.climbing ? 'none' : (this.weaponType === 'none' ? 'none' : this.weaponType),
      aimPitch: this.pitch, aiming: this.aiming, aimPoint: this.aimPoint || null, lookTarget: this.lookTarget || null,
      dive: this.fallInput.dive, bank: this.fallInput.bank, slide: this.slideT > 0 || !!this.rail || !!this.remoteRail || !!this.kart || !!this.remoteKart, climb: this.climbing, climbRate: this.climbing ? Math.max(0, b.vel.y) : 0
    };
    if(this.mode === 'zip'){ st.mode = 'glide'; st.dive = 0; st.bank = 0; }
    // LOD por distância
    if(g.camera){
      const d = g.camera.position.distanceTo(this.root.position);
      setCharacterLOD(this.ch, d < 45 ? 0 : d < 120 ? 1 : 2);
      this._animSkip = d > 160 ? 3 : d > 90 ? 2 : 1;
    }
    this._animAcc = (this._animAcc || 0) + dt; this._animFrame = ((this._animFrame || 0) + 1) % (this._animSkip || 1);
    if(this._animFrame === 0){ this.anim.update(this._animAcc, st); this._animAcc = 0; }
    this.glider.visible = this.mode === 'glide';
    if(this.glider.visible){
      // abertura com mola (overshoot) + inclinação acompanhando o bank
      const u = this.deployT, e = u >= 1 ? 1 : 1 - Math.cos(u * Math.PI * 1.25) * Math.exp(-u * 4.5);
      this.glider.scale.set(Math.max(0.05, e), Math.max(0.05, Math.min(1.08, e * 1.02)), Math.max(0.05, e));
      this.glider.rotation.z = -this.fallInput.bank * 0.35 + Math.sin(g.time * 2) * 0.03;
      this.glider.rotation.x = this.fallInput.dive * 0.2;
      const ud = this.glider.userData;
      if(ud.wing) ud.wing.rotation.z = (ud.style === 'guardachuva' ? 0 : Math.sin(g.time * 2) * 0.03);
      if(ud.flap) ud.flap.forEach((w, i) => w.rotation.z = (i ? -1 : 1) * (Math.sin(g.time * 5) * 0.35 + 0.1));
      if(ud.balloons) ud.balloons.forEach((bm, i) => { bm.position.y += Math.sin(g.time * 2 + i * 1.7) * 0.004; bm.rotation.z = Math.sin(g.time * 1.3 + i) * 0.08; });
      if(ud.pulse) ud.pulse.emissiveIntensity = 2 + Math.sin(g.time * 8) * 1.2;
      // v16: animações dos planadores novos
      if(ud.spin) ud.spin.rotation.z += dt * 18;
      if(ud.tail) ud.tail.forEach((sg, i) => { sg.rotation.x = Math.sin(g.time * 4 - i * 0.8) * 0.35; sg.rotation.y = Math.sin(g.time * 3 - i) * 0.25; });
      if(ud.carpet && this._animSkip === 1){ const pa = ud.carpet.geometry.attributes.position, bs = ud.carpet.userData.base; for(let i = 0; i < pa.count; i++){ const x = bs[i * 3], z = bs[i * 3 + 2]; pa.array[i * 3 + 1] = Math.sin(z * 1.7 + g.time * 6) * 0.18 + Math.sin(x * 0.9 + g.time * 3) * 0.08; } pa.needsUpdate = true; }
      if(ud.fire && g.particles && g.quality !== 'baixa' && Math.random() < 0.6){ const tp = ud.fire[Math.floor(Math.random() * ud.fire.length)]; g.particles.emit('fire', this.glider.localToWorld(_v.copy(tp)), { n: 1, size: 0.7, r: 0.5 }); }
      if(ud.thrusters && g.particles && g.quality !== 'baixa' && Math.random() < 0.7) ud.thrusters.forEach(tp => { const wp = this.glider.localToWorld(tp.clone()); g.particles.emit('fire', wp, { n: 1, size: 0.4, r: 0.2 }); });
    }
    // rastro da picareta durante o golpe
    if(this.pickTrail){
      this.swingT = (this.swingT || 0) - dt; this.comboT -= dt;
      const tip = this.pickaxe.userData.tip;
      this.pickTrail.emitting = this.swingT > 0 && this.pickaxe.visible && this._animSkip === 1;
      if(this.pickTrail.emitting){ const a = tip.getWorldPosition(_v), bb = this.pickaxe.localToWorld(_v2.set(0, 0.9, 0)); this.pickTrail.update(dt, a, bb); }
      else this.pickTrail.update(dt);
      const gl = this.pickaxe.userData.glow; if(gl && gl.emissiveIntensity !== undefined) gl.emissiveIntensity = (gl.userData.base ?? (gl.userData.base = gl.emissiveIntensity)) * (1 + Math.sin(g.time * 4) * 0.25 + (this.swingT > 0 ? 1 : 0));
    }
    // rastro de queda (contrail) nas mãos
    if(this.handTrails){
      const on = this.mode === 'freefall' && this._animSkip === 1;
      ['handL', 'handR'].forEach((h, i) => {
        const tr = this.handTrails[i]; tr.emitting = on;
        if(on){ const j = this.ch.J[h]; const p = j.getWorldPosition(_v); const q = j.localToWorld(_v2.set(0, -0.35, 0.25)); tr.update(dt, p, q); } else tr.update(dt);
      });
      if(on && this.contrailKind === 'estrelas' && Math.random() < 0.5) g.particles.emit('magic', this.ch.J.handL.getWorldPosition(_v), { color: 0xfde047, n: 1 });
      if(on && this.contrailKind === 'fogo' && Math.random() < 0.5) g.particles.emit('fire', this.ch.J.handR.getWorldPosition(_v), { n: 1, size: 0.35, r: 0.2 });
      // v15: rastros novos com partículas próprias (também nos pés)
      const ctd = CONTRAILS[this.contrailKind];
      if(on && ctd && ctd.fx && Math.random() < (g.quality === 'baixa' ? 0.25 : 0.6)){
        const j = this.ch.J[Math.random() < 0.5 ? 'handL' : (Math.random() < 0.5 ? 'footL' : 'footR')];
        g.particles.emit(ctd.fx, j.getWorldPosition(_v), ctd.fx === 'dust' ? { n: 1, power: 0.3 } : { color: ctd.fxColor, n: 1 });
      }
    }
  }
  // v15: efeito de aterragem do rastro equipado (anel de partículas + clarão)
  _landFx(){
    const g = this.game, ct = CONTRAILS[this.contrailKind]; if(!ct || !g.particles) return;
    const col = ct.land || (typeof ct.color === 'number' ? ct.color : 0xffffff);
    const p = this.root.position;
    const n = g.quality === 'baixa' ? 8 : 18;
    for(let i = 0; i < n; i++){ const a = i / n * Math.PI * 2; _v.set(p.x + Math.cos(a) * 1.6, p.y + 0.4, p.z + Math.sin(a) * 1.6); g.particles.emit(ct.color === 'rainbow' ? 'confetti' : 'magic', _v, ct.color === 'rainbow' ? { n: 1 } : { color: col, n: 1 }); }
    if(this.contrailKind === 'fogo') g.particles.emit('fire', p, { n: 10, size: 0.6, r: 1.2 });
    if(g.quality !== 'baixa') g.particles.flash(_v.set(p.x, p.y + 1.5, p.z), col, 4, 0.25, 14);
  }
  // v17: 'grenades' passa a ser o contador de granadas normais dentro de tac
  get grenades(){ return this.tac ? this.tac.granada : 0; }
  set grenades(v){ if(this.tac) this.tac.granada = v; }
  // ----- v16: movimento -----
  requestJump(){ this.jumpBuf = 0.16; if(this.slideT > 0){ this.slideT = 0; } }
  _doJump(){
    const b = this.body; b.vel.y = this.inWater ? 22 : 27; b.grounded = false;
    if(this.anim && !this.anim.isPlaying('jumpUp')) this.anim.play('jumpUp');
    // salto a partir do deslize conserva velocidade horizontal (slide-jump)
    this.game.audio.play('jump', this.root.position, { vol: this.isPlayer ? 0.4 : 0.3 }); this.anim.stopEmotes();
    if(this.inWater) this.game.particles.emit('splash', b.pos, { n: 10 });
  }
  startSlide(){
    const b = this.body; if(!b.grounded || this.mode !== 'ground' || this.slideT > 0) return false;
    const sp = Math.hypot(b.vel.x, b.vel.z); if(sp < 14) return false;
    const k = 40 / sp; b.vel.x *= k; b.vel.z *= k; this._slideY = b.pos.y;
    this.slideT = 1.25; this.crouch = true;
    this.game.audio.play('woosh', this.root.position, { vol: 0.35, rate: 1.4 });
    this.game.particles.emit('dust', b.pos, { n: 6, power: 1.2 });
    if(this.isPlayer && this.game.quest) this.game.quest('slide');
    return true;
  }
  _tryClimb(){
    const b = this.body, fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const top = this.game.physics.wallAhead(b.pos, fx, fz, b.radius + 1.2, b.height);
    if(top === null || top < b.pos.y + 1.8) return false;   // v23: mais tolerante
    this.climbing = true; this.climbTop = top; this.climbT = 0; this.crouch = false;
    this.anim.stopEmotes();
    if(this.isPlayer && this.game.quest) this.game.quest('climb');
    return true;
  }
  _climbStep(dt, mi){
    const b = this.body, fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const top = this.game.physics.wallAhead(b.pos, fx, fz, b.radius + 1.2, b.height + 1);   // v23: mais tolerante
    this.climbT += dt; this.stamina -= dt;
    const stop = (jumpOff) => {
      this.climbing = false; this._climbTimer = 0.35;
      if(jumpOff){ b.vel.set(-fx * 14, 20, -fz * 14); this.game.audio.play('jump', this.root.position, { vol: 0.35 }); }
    };
    if(top === null){ // chegou ao topo: sobe o beiral
      this.climbing = false; b.vel.set(0, 0, 0);
      const px = b.pos.x + fx * (b.radius + 1.3), pz = b.pos.z + fz * (b.radius + 1.3);
      const g = this.game.physics.groundAt(px, pz, b.pos.y + 3.5, 0.4);
      if(g > b.pos.y - 0.5){ this.mantle = { from: b.pos.clone(), to: new THREE.Vector3(px, g + 0.05, pz) }; this.mantleT = 0.32; this.anim.play('mantle', { speed: 1.2 }); }
      else b.vel.set(fx * 6, 10, fz * 6);
      return;
    }
    if(top - b.pos.y < 2.6){ stop(false); this._tryMantle(true); return; }
    if(!this.jumpHeld || mi.y < 0.2 || this.stamina <= 0){ stop(mi.y < -0.3); return; }
    const sp = 10 + Math.min(1, this.climbT * 4) * 2;       // sobe ~12 u/s
    b.vel.set(fx * 3 + (mi.x ? -Math.cos(this.yaw) * mi.x * 5 : 0), sp, fz * 3 + (mi.x ? Math.sin(this.yaw) * mi.x * 5 : 0));
    if(Math.random() < dt * 6) this.game.particles.emit('dust', b.pos.clone().add(new THREE.Vector3(fx, 2.5, fz)), { n: 1, power: 0.5 });
    this._climbStepAcc = (this._climbStepAcc || 0) + dt; if(this._climbStepAcc > 0.28){ this._climbStepAcc = 0; this.game.onFootstep(this, 6); }
  }
  _tryMantle(force){
    const b = this.body, P = this.game.physics, fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const px = b.pos.x + fx * (b.radius + 1.3), pz = b.pos.z + fz * (b.radius + 1.3);
    const top = P.groundAt(px, pz, b.pos.y + 7.2, 0.4);
    if(top < b.pos.y + (force ? 0.3 : 1.8) || top > b.pos.y + 8.4) return;
    // espaço livre por cima do beiral
    for(const bx of P.nearBoxes(px - 1, pz - 1, px + 1, pz + 1)) if(!bx.ramp && bx.min.y > top + 0.2 && bx.min.y < top + b.height && px > bx.min.x - 1 && px < bx.max.x + 1 && pz > bx.min.z - 1 && pz < bx.max.z + 1) return;
    this.mantle = { from: b.pos.clone(), to: new THREE.Vector3(px, top + 0.05, pz) }; this.mantleT = 0.32; this.climbing = false;
    this.anim.play('mantle', { speed: 1.25 });
    this.game.audio.play('land', this.root.position, { vol: 0.25, rate: 1.4 });
  }
  setMode(m){
    if(this.mode === m) return;
    const prev = this.mode;
    this.mode = m; this.wantDeploy = false; this.climbing = false;
    if(m === 'glide'){
      this.deployT = 0; this.anim.play('deployGlider');
      this.game.audio.play('woosh', this.root.position, { vol: 0.7, rate: 0.8 });
      this.game.audio.play('build', this.root.position, { vol: 0.25, rate: 1.6 });
      if(this.isPlayer && this.game.tps) this.game.tps.addTrauma(0.25);
    }
    if(m === 'freefall' && prev === 'ground'){ this.fallInput.dive = 0; }
  }
  /** plataforma de lançamento / salto do ônibus: impulso vertical → queda livre com planador reutilizável */
  launch(power){
    this.body.vel.y = power || 95; this.body.grounded = false; this.launched = true; this._noFall = 4;
    this.mode = 'freefall'; this.anim.play('launch');
    this.game.audio.play('jump', this.root.position, { vol: 0.9, rate: 0.6 });
  }
  dispose(){ if(this.root.parent) this.root.parent.remove(this.root); if(this.pickTrail) this.pickTrail.dispose(); if(this.handTrails) this.handTrails.forEach(t => t.dispose()); }
}
