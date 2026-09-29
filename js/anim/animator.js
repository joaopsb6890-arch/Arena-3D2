// ============================================================
// ANIMATOR — sistema de animação completo por personagem
//  1. Blend tree paramétrico de locomoção (idle/walk/run/sprint/
//     crouch × direção 2D) com ciclo de passada por fase, duty
//     factor variável e FOOT PLANTING via IK de 2 ossos.
//  2. Camadas de clips por keyframe (override/aditivo, máscaras,
//     crossfade com fade-in/out, eventos).
//  3. Camada de arma: frame de mira no peito → arma no mundo,
//     IK das duas mãos nos marcadores (grip/foregrip), recoil
//     por mola, sway, recarga com IK de mão em espaço da arma.
//  4. Estados aéreos: pulo, queda livre, planador; mola de aterrissagem.
//  5. Idle vivo: respiração, transferência de peso, micro-movimentos,
//     fidgets aleatórios, giro no lugar com passos.
//  6. Rosto (FaceController), física secundária, músculos.
// ============================================================
import * as THREE from 'three';
import { CLIPS, MASKS, sampleTrack, PICKAXE_CARRY, CLIP_EXPRESSION } from './clips.js';
import { solveTwoBone, setWorldQuaternion, basisQuat } from './ik.js';
import { FaceController } from './face.js';

const JOINTS = ['hips', 'spine', 'chest', 'neck', 'head', 'clavL', 'clavR', 'uArmL', 'uArmR', 'fArmL', 'fArmR', 'handL', 'handR', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'toeL', 'toeR'];
const TAU = Math.PI * 2;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const damp = (cur, tgt, lambda, dt) => cur + (tgt - cur) * (1 - Math.exp(-lambda * dt));
const wrapA = a => { while(a > Math.PI) a -= TAU; while(a < -Math.PI) a += TAU; return a; };
const lerp = (a, b, t) => a + (b - a) * t;
function interpTable(tbl, x){
  if(x <= tbl[0][0]) return tbl[0][1];
  for(let i = 1; i < tbl.length; i++) if(x <= tbl[i][0]){ const [x0, y0] = tbl[i - 1], [x1, y1] = tbl[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  return tbl[tbl.length - 1][1];
}
const CYCLE_T = [[0, 1.15], [6, 1.0], [12, 0.78], [17, 0.66], [23, 0.56]];
const DUTY = [[0, 0.64], [6, 0.62], [12, 0.42], [17, 0.34], [23, 0.29]];

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _e = new THREE.Euler(), _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
// v15: temporários do bloco de armas (antes ~15 alocações por ator por frame)
const _gz = new THREE.Vector3(), _gx = new THREE.Vector3(), _gy = new THREE.Vector3(), _gq = new THREE.Quaternion(), _gp = new THREE.Vector3(), _gp2 = new THREE.Vector3();
const _gR = new THREE.Vector3(), _gqR = new THREE.Quaternion(), _gwR = new THREE.Vector3(), _gt = new THREE.Vector3(), _gL = new THREE.Vector3(), _gqL = new THREE.Quaternion(), _gwL = new THREE.Vector3(), _gb = new THREE.Vector3(), _gc = new THREE.Vector3(), _gpo = new THREE.Vector3();

// orientações de mão em espaço da arma
const Q_GRIP_R = basisQuat(new THREE.Vector3(0, -0.12, 1), new THREE.Vector3(1, 0, 0));
const Q_FORE_L = basisQuat(new THREE.Vector3(-1, 0.15, 0.25), new THREE.Vector3(0, 1, 0));
const PALM_OFF = new THREE.Vector3(0, -0.3, 0.1);
// picareta: modelo Y → mão -X, modelo Z → mão -Y
const PICKAXE_MOUNT = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0)));

export class Animator {
  constructor(ch){
    this.ch = ch;
    this.J = ch.J;
    this.face = new FaceController(ch);
    this.off = {}; JOINTS.forEach(j => this.off[j] = [0, 0, 0]);
    this.rootOff = [0, 0, 0];
    // parâmetros suavizados do blend tree
    this.p = { speed: 0, moveW: 0, runF: 0, crouch: 0, air: 0, freefall: 0, glide: 0, legIK: 1, gunW: 0, pickW: 0, buildW: 0, ads: 0, emote: 0 };
    this.md = new THREE.Vector2(0, 1);           // direção de movimento local (x,z)
    this.phase = 0; this.lastYaw = null; this.yawRate = 0;
    this.feetYaw = null; this.turnStep = null;
    this.land = { x: 0, v: 0 }; this.hitR = { x: 0, y: 0, vx: 0, vy: 0 };
    this.recoil = { z: 0, vz: 0, p: 0, vp: 0 };
    this.clips = [];                              // instâncias ativas
    this.onEvent = null;
    this.weapon = null; this.pickaxe = null; this.prop = null;
    this.fidgetT = 6 + Math.random() * 6;
    this.wasGrounded = true; this.lastVy = 0; this.lastSpeed = 0; this.accel = 0;
    this.st = { vel: new THREE.Vector3(), grounded: true, crouch: false, vy: 0, mode: 'ground', weapon: 'none', aimPitch: 0, aiming: false, aimPoint: null, lookTarget: null };
    this.curl = { L: 0.3, R: 0.3 };
    this.t = Math.random() * 100;
    this.enabledSecondary = true;
    this.showSkeleton = false;
  }

  // ---------------- API ----------------
  setWeapon(model){
    // model: { group, type, markers:{grip,fore,muzzle,mag,sight}, parts:{mag,pump,bolt} } ou null
    if(this.weapon && this.weapon.group.parent) this.weapon.group.parent.remove(this.weapon.group);
    this.weapon = model;
    if(model){ this.ch.weaponHolder.add(model.group); if(model.parts && model.parts.mag) model.parts.mag.userData.base = model.parts.mag.position.clone(); }
  }
  setPickaxe(model){
    if(this.pickaxe && this.pickaxe.parent) this.pickaxe.parent.remove(this.pickaxe);
    this.pickaxe = model;
    if(model){ model.quaternion.copy(PICKAXE_MOUNT); model.position.set(0, 0, 0); this.ch.handSocketR.add(model); }
  }
  setProp(obj){
    if(this.prop && this.prop.parent) this.prop.parent.remove(this.prop);
    this.prop = obj;
    if(obj) this.ch.handSocketR.add(obj);
  }
  play(name, opts){
    const def = CLIPS[name]; if(!def) return null;
    opts = opts || {};
    // clips do mesmo grupo substituem
    this.clips.forEach(c => { if(c.def.mode === def.mode || def.mask === 'full' || opts.exclusive){ c.stopping = true; } });
    const inst = { name, def, t: 0, w: def.fadeIn ? 0 : 1, speed: opts.speed || 1, stopping: false, firedEvents: new Set(), loop: !!def.loop };
    this.clips.push(inst);
    const ex = CLIP_EXPRESSION[name]; if(ex) this.face.overrideExpr = ex === 'talk' ? null : ex;
    return inst;
  }
  stop(name){ this.clips.forEach(c => { if(!name || c.name === name) c.stopping = true; }); }
  stopEmotes(){ this.clips.forEach(c => { if(c.def.emote || c.def.loop) c.stopping = true; }); }
  isPlaying(name){ return this.clips.some(c => c.name === name && !c.stopping); }
  get busy(){ return this.clips.some(c => !c.stopping && (c.def.mode === 'weapon' || c.name.startsWith('pickaxe') || c.name === 'drink' || c.name === 'medkit')); }
  fire(kind){
    const k = { rifle: [0.28, 0.1], smg: [0.16, 0.06], shotgun: [0.6, 0.35], sniper: [0.75, 0.4], pistol: [0.22, 0.12] }[kind] || [0.25, 0.1];
    this.recoil.vz -= k[0] * 16; this.recoil.vp += k[1] * 14;
    this.hitR.vx -= k[1] * 2;
  }
  hitReact(dirLocalX, amount){
    this.hitR.vx -= amount * 4; this.hitR.vy += dirLocalX * amount * 4;
    this.face.overrideExpr = 'pain'; clearTimeout(this._painT); this._painT = setTimeout(() => { if(this.face.overrideExpr === 'pain') this.face.overrideExpr = null; }, 500);
  }
  landImpact(vy){ this.land.v -= Math.min(Math.abs(vy) * 0.035, 1.4); }

  // ---------------- update ----------------
  update(dt, st){
    if(st) Object.assign(this.st, st);
    st = this.st;
    dt = Math.min(dt, 1 / 20);
    this.t += dt;
    const t = this.t, ch = this.ch, J = this.J, P = ch.P, p = this.p, off = this.off;
    for(const k in off){ off[k][0] = 0; off[k][1] = 0; off[k][2] = 0; }
    this.rootOff[0] = this.rootOff[1] = this.rootOff[2] = 0;
    const root = ch.root;
    const yaw = root.rotation.y;
    if(this.lastYaw === null){ this.lastYaw = yaw; this.feetYaw = yaw; }
    this.yawRate = damp(this.yawRate, wrapA(yaw - this.lastYaw) / Math.max(dt, 1e-4), 10, dt);
    this.lastYaw = yaw;

    // ---- entradas → parâmetros ----
    const cy = Math.cos(-yaw), sy = Math.sin(-yaw);
    const lx = st.vel.x * cy + st.vel.z * sy, lz = -st.vel.x * sy + st.vel.z * cy;
    let s = Math.hypot(lx, lz);
    const grounded = st.grounded && st.mode === 'ground';
    if(!grounded) s = 0;
    p.speed = damp(p.speed, s, 9, dt);
    this.accel = damp(this.accel, (p.speed - this.lastSpeed) / Math.max(dt, 1e-4), 6, dt); this.lastSpeed = p.speed;
    if(s > 0.4){ this.md.x = damp(this.md.x, lx / s, 10, dt); this.md.y = damp(this.md.y, lz / s, 10, dt); this.md.normalize(); }
    const sp = p.speed;
    p.moveW = damp(p.moveW, sstep(0.3, 2.5, s), 8, dt);
    p.runF = damp(p.runF, sstep(7, 17, s), 5, dt);
    p.crouch = damp(p.crouch, st.crouch && grounded ? 1 : 0, 10, dt);
    p.air = damp(p.air, !st.grounded && st.mode === 'ground' ? 1 : 0, 10, dt);
    p.freefall = damp(p.freefall, st.mode === 'freefall' ? 1 : 0, 5, dt);
    p.glide = damp(p.glide, st.mode === 'glide' ? 1 : 0, 6, dt);
    const gun = this.weapon && ['rifle', 'smg', 'shotgun', 'sniper', 'pistol'].includes(st.weapon) && st.mode === 'ground';
    p.gunW = damp(p.gunW, gun ? 1 : 0, 14, dt);
    p.pickW = damp(p.pickW, st.weapon === 'pickaxe' && st.mode === 'ground' ? 1 : 0, 12, dt);
    p.buildW = damp(p.buildW, st.weapon === 'build' && st.mode === 'ground' ? 1 : 0, 12, dt);
    p.ads = damp(p.ads, st.aiming && gun ? 1 : 0, 14, dt);

    // aterrissagem
    if(st.grounded && !this.wasGrounded) this.landImpact(this.lastVy);
    this.wasGrounded = st.grounded; this.lastVy = st.vy || 0;
    this.land.v += (-90 * this.land.x - 11 * this.land.v) * dt; this.land.x += this.land.v * dt;
    this.hitR.vx += (-120 * this.hitR.x - 14 * this.hitR.vx) * dt; this.hitR.x += this.hitR.vx * dt;
    this.hitR.vy += (-120 * this.hitR.y - 14 * this.hitR.vy) * dt; this.hitR.y += this.hitR.vy * dt;
    this.recoil.vz += (-260 * this.recoil.z - 26 * this.recoil.vz) * dt; this.recoil.z += this.recoil.vz * dt;
    this.recoil.vp += (-220 * this.recoil.p - 22 * this.recoil.vp) * dt; this.recoil.p += this.recoil.vp * dt;

    // ---- ciclo de passada ----
    const T = interpTable(CYCLE_T, sp) * (1 + p.crouch * 0.25);
    const D = lerp(interpTable(DUTY, sp), 0.66, p.crouch * 0.6);
    this.phase = (this.phase + dt / T * Math.max(p.moveW, 0.001)) % 1;
    const legScale = P.legLen / 3.34;
    const stride = sp * D * T;
    const mdx = this.md.x, mdz = this.md.y;

    // ---- giro no lugar (pés plantados) ----
    let feetDiff = wrapA(this.feetYaw - yaw);
    let turnLift = [0, 0];
    if(p.moveW > 0.35 || !grounded){ this.feetYaw = yaw; feetDiff = 0; this.turnStep = null; }
    else if(!this.turnStep && Math.abs(feetDiff) > 0.7){ this.turnStep = { t: 0, from: this.feetYaw, to: yaw + Math.sign(feetDiff) * 0.1 }; }
    if(this.turnStep){
      const ts = this.turnStep; ts.t += dt / 0.42;
      const u = Math.min(1, ts.t);
      this.feetYaw = ts.from + wrapA(ts.to - ts.from) * sstep(0, 1, u);
      feetDiff = wrapA(this.feetYaw - yaw);
      turnLift = [Math.sin(Math.min(1, u * 2) * Math.PI) * 0.35, Math.sin(Math.max(0, u * 2 - 1) * Math.PI) * 0.35];
      if(u >= 1) this.turnStep = null;
    }

    // ---- quadril (bob, sway, twist, crouch, aterrissagem) ----
    const bobA = lerp(0.07, 0.16, p.runF) * p.moveW;
    const bob = -bobA * Math.cos(this.phase * TAU * 2 + p.runF * 1.2);
    const breath = Math.sin(t * 1.55);
    const idleShift = Math.sin(t * 0.37) * 0.07 * (1 - p.moveW);
    const hipX = Math.sin(this.phase * TAU) * 0.08 * (1 - p.runF) * p.moveW + idleShift;
    const hipDrop = 0.06 + p.runF * 0.32 * p.moveW + p.crouch * 1.15 + (1 - p.moveW) * 0.03;
    const hipY = bob - hipDrop + this.land.x;
    const hipZ = -p.crouch * 0.25;
    // direção do quadril acompanha o movimento (strafe/backpedal)
    const mAng = Math.atan2(mdx, mdz);
    let hipYawT = 0;
    if(Math.abs(mAng) <= Math.PI / 2 + 0.2) hipYawT = THREE.MathUtils.clamp(mAng, -0.9, 0.9) * 0.55;
    else hipYawT = THREE.MathUtils.clamp(wrapA(mAng - Math.PI), -0.9, 0.9) * 0.55;
    hipYawT *= p.moveW;
    this._hipYaw = damp(this._hipYaw || 0, hipYawT, 8, dt);
    const twist = Math.sin(this.phase * TAU) * lerp(0.16, 0.22, p.runF) * p.moveW;
    off.hips[1] += this._hipYaw + twist + feetDiff * 0.55;
    off.hips[2] += -Math.sin(this.phase * TAU) * 0.05 * p.moveW - hipX * 0.35 + THREE.MathUtils.clamp(-this.yawRate * 0.035 * p.runF, -0.25, 0.25);
    off.hips[0] += p.crouch * 0.28 + p.runF * 0.08 * p.moveW + THREE.MathUtils.clamp(this.accel * 0.012, -0.15, 0.2) * p.moveW;
    off.spine[1] += -this._hipYaw * 0.5 - twist * 0.7 - feetDiff * 0.3;
    off.chest[1] += -this._hipYaw * 0.5 - twist * 0.5 - feetDiff * 0.25;
    off.spine[0] += p.crouch * 0.22 + p.runF * 0.1 * p.moveW + breath * 0.008 + this.hitR.x * 0.5;
    off.chest[0] += -breath * 0.018 + p.crouch * 0.05 + this.hitR.x * 0.4;
    off.spine[2] += this.hitR.y * 0.5 + idleShift * 0.5;
    off.chest[2] += -idleShift * 0.4;
    off.clavL[2] += breath * 0.02; off.clavR[2] -= breath * 0.02;
    // micro-movimento de cabeça (ruído)
    off.head[0] += (Math.sin(t * 0.71) * 0.02 + Math.sin(t * 1.93) * 0.01) * (1 - p.moveW * 0.5) + bob * 0.3;
    off.head[1] += Math.sin(t * 0.43) * 0.04 * (1 - p.moveW) - feetDiff * 0.1 + twist * 0.3;
    off.neck[0] += -p.runF * 0.12 * p.moveW - p.crouch * 0.2;

    // ---- pés (IK targets em espaço local do root) ----
    const feet = {};
    for(const sd of ['L', 'R']){
      const sx = sd === 'L' ? 1 : -1;
      const ph = (this.phase + (sd === 'L' ? 0 : 0.5)) % 1;
      let along = 0, lift = 0, pitch = 0;
      if(ph < D){
        const u = ph / D;
        along = stride * (0.42 - u);
        pitch = u < 0.18 ? lerp(-0.3 * (1 - p.runF * 0.6), 0, u / 0.18) : u > 0.62 ? Math.pow((u - 0.62) / 0.38, 2) * lerp(0.75, 1.0, p.runF) : 0;
        lift = u > 0.62 ? Math.pow((u - 0.62) / 0.38, 2) * lerp(0.55, 0.9, p.runF) * legScale : 0;
      } else {
        const u = (ph - D) / (1 - D);
        along = stride * (-0.58 + sstep(0, 1, u));
        const liftH = lerp(0.42, 1.05, p.runF) * sstep(0, 3, sp) * legScale * (1 - p.crouch * 0.4);
        lift = Math.sin(Math.PI * Math.pow(u, 0.8)) * liftH + (1 - u) * lerp(0.55, 0.9, p.runF) * legScale * (u < 0.3 ? 1 - u / 0.3 : 0);
        // calcanhar sobe atrás na corrida (heel kick) → trata no joelho pelo polo + pitch
        pitch = lerp(lerp(0.75, 1.0, p.runF), -0.3, sstep(0.1, 0.95, u));
        along -= Math.sin(Math.PI * u) * p.runF * 0.35 * stride * 0.2;
      }
      along *= p.moveW; lift *= p.moveW; pitch *= p.moveW;
      lift += turnLift[sd === 'L' ? 0 : 1];
      const wBase = P.hipW * lerp(0.95, 0.7, p.runF * p.moveW) + p.crouch * 0.18;
      // posição idle rotacionada pelo giro dos pés
      const ix = sx * wBase, iz = sd === 'L' ? 0.1 : -0.05;
      const cf = Math.cos(feetDiff), sf = Math.sin(feetDiff);
      const bx = ix * cf + iz * sf, bz = -ix * sf + iz * cf;
      feet[sd] = { x: bx + mdx * along, y: P.ankle + lift, z: bz + mdz * along + hipZ * 0.3, pitch };
    }

    // ---- braços base (sem arma) ----
    const swing = lerp(0.28, 0.85, p.runF) * p.moveW;
    const cph = Math.cos(this.phase * TAU);
    off.uArmL[0] += swing * cph * (mdz >= 0 ? 1 : -1); off.uArmR[0] += -swing * cph * (mdz >= 0 ? 1 : -1);
    off.uArmL[2] += 0.1 + breath * 0.01 + p.runF * 0.1; off.uArmR[2] += -0.1 - breath * 0.01 - p.runF * 0.1;
    off.fArmL[0] += -(0.22 + p.runF * 1.25 * p.moveW + Math.max(0, -cph) * 0.3 * swing);
    off.fArmR[0] += -(0.22 + p.runF * 1.25 * p.moveW + Math.max(0, cph) * 0.3 * swing);
    off.handL[2] += -0.08; off.handR[2] += 0.08;

    // picareta carry
    if(p.pickW > 0.01){
      const w = p.pickW;
      for(const j of ['uArmR', 'fArmR', 'handR', 'uArmL', 'fArmL']){
        const c = PICKAXE_CARRY[j];
        off[j][0] = lerp(off[j][0], c[0] + (j === 'uArmR' ? -swing * cph * 0.3 : 0), w);
        off[j][1] = lerp(off[j][1], c[1], w); off[j][2] = lerp(off[j][2], c[2], w);
      }
    }
    // modo construção: braços à frente segurando a planta
    if(p.buildW > 0.01){
      const w = p.buildW;
      off.uArmL[0] = lerp(off.uArmL[0], -0.75, w); off.uArmL[1] = lerp(off.uArmL[1], -0.35, w);
      off.uArmR[0] = lerp(off.uArmR[0], -0.75, w); off.uArmR[1] = lerp(off.uArmR[1], 0.35, w);
      off.fArmL[0] = lerp(off.fArmL[0], -1.1, w); off.fArmR[0] = lerp(off.fArmR[0], -1.1, w);
    }

    // ---- ar: pulo ----
    if(p.air > 0.01){
      const w = p.air, rising = THREE.MathUtils.clamp((st.vy || 0) / 20, -1, 1);
      off.thighL[0] = lerp(off.thighL[0], -0.75 + rising * 0.2, w); off.shinL[0] = lerp(off.shinL[0], 1.25, w);
      off.thighR[0] = lerp(off.thighR[0], -0.15 - rising * 0.1, w); off.shinR[0] = lerp(off.shinR[0], 0.75 - rising * 0.2, w);
      off.footL[0] = lerp(off.footL[0], 0.3, w); off.footR[0] = lerp(off.footR[0], 0.45, w);
      if(p.gunW < 0.5 && p.pickW < 0.5){
        off.uArmL[0] = lerp(off.uArmL[0], -0.5 - rising * 0.3, w); off.uArmL[2] = lerp(off.uArmL[2], 0.55, w);
        off.uArmR[0] = lerp(off.uArmR[0], -0.3 - rising * 0.3, w); off.uArmR[2] = lerp(off.uArmR[2], -0.55, w);
      }
      off.spine[0] += (-0.1 * rising) * w;
    }
    // ---- queda livre: blend espalhado ↔ mergulho ↔ travado + inclinação lateral ----
    this.dive = damp(this.dive || 0, st.dive || 0, 3, dt);
    this.bank = damp(this.bank || 0, st.bank || 0, 4, dt);
    if(p.freefall > 0.01){
      const w = p.freefall, dv = this.dive, bk = this.bank;
      const turb = 1 + Math.max(0, dv) * 1.5;
      const wob = (Math.sin(t * 5.1) * 0.06 + Math.sin(t * 11.3) * 0.025) * turb, wob2 = (Math.sin(t * 3.7) * 0.08 + Math.sin(t * 9.1) * 0.02) * turb;
      const spread = { hips: [1.25 + wob * 0.3, 0, wob2 * 0.3], spine: [-0.25, 0, 0], chest: [-0.2, 0, 0], neck: [-0.4, 0, 0], head: [-0.55, 0, 0],
        uArmL: [-0.45 + wob, 0, 1.45], uArmR: [-0.45 - wob, 0, -1.45], fArmL: [-0.8, 0, 0], fArmR: [-0.8, 0, 0], handL: [0, 0, -0.3], handR: [0, 0, 0.3],
        thighL: [0.35, 0, 0.3], thighR: [0.35 + wob, 0, -0.3], shinL: [1.05 + wob2, 0, 0], shinR: [1.05 - wob2, 0, 0], footL: [0.6, 0, 0], footR: [0.6, 0, 0] };
      const dive = { hips: [2.25 + wob * 0.15, 0, wob2 * 0.1], spine: [0.05, 0, 0], chest: [0.05, 0, 0], neck: [-0.55, 0, 0], head: [-0.7, 0, 0],
        uArmL: [0.35, 0, 0.32 + wob * 0.5], uArmR: [0.35, 0, -0.32 - wob * 0.5], fArmL: [-0.05, 0, 0], fArmR: [-0.05, 0, 0], handL: [0.3, 0, 0], handR: [0.3, 0, 0],
        thighL: [0.05, 0, 0.06], thighR: [0.05, 0, -0.06], shinL: [0.12 + wob2 * 0.3, 0, 0], shinR: [0.12 - wob2 * 0.3, 0, 0], footL: [0.9, 0, 0], footR: [0.9, 0, 0] };
      const stall = { hips: [0.75, 0, wob2 * 0.2], spine: [-0.35, 0, 0], chest: [-0.25, 0, 0], neck: [-0.2, 0, 0], head: [-0.3, 0, 0],
        uArmL: [-1.2, 0, 1.2], uArmR: [-1.2, 0, -1.2], fArmL: [-0.5, 0, 0], fArmR: [-0.5, 0, 0], handL: [0, 0, 0], handR: [0, 0, 0],
        thighL: [-0.35, 0, 0.45], thighR: [-0.35, 0, -0.45], shinL: [1.3, 0, 0], shinR: [1.3, 0, 0], footL: [0.4, 0, 0], footR: [0.4, 0, 0] };
      const other = dv >= 0 ? dive : stall, u = Math.abs(dv);
      for(const j in spread) for(let a = 0; a < 3; a++) off[j][a] = lerp(off[j][a], lerp(spread[j][a], other[j][a], u), w);
      // inclinação lateral (bank): rola o corpo e abre o braço externo
      off.hips[2] += -bk * 0.55 * w; off.spine[2] += -bk * 0.15 * w; off.hips[1] += -bk * 0.2 * w;
      off.uArmL[2] += (bk > 0 ? -bk * 0.6 : -bk * 0.2) * w * (1 - u * (dv > 0 ? 1 : 0));
      off.uArmR[2] += (bk < 0 ? -bk * 0.6 : -bk * 0.2) * w * (1 - u * (dv > 0 ? 1 : 0));
    }
    // ---- planador: pernas soltas + inclinação ----
    if(p.glide > 0.01){
      const w = p.glide, sw = Math.sin(t * 2.2) * 0.12, bk = this.bank, dv = this.dive;
      const G = { hips: [0.15 + dv * 0.25, 0, sw * 0.2 - bk * 0.25], spine: [0.05 + dv * 0.1, 0, -bk * 0.1], thighL: [-0.25 + sw + bk * 0.2, 0, 0.08 + Math.max(0, bk) * 0.15], thighR: [-0.1 - sw - bk * 0.2, 0, -0.08 - Math.max(0, -bk) * 0.15],
        shinL: [0.45 + Math.sin(t * 2.2 + 1) * 0.1, 0, 0], shinR: [0.3 - Math.sin(t * 2.2 + 1) * 0.1, 0, 0], footL: [0.5, 0, 0], footR: [0.5, 0, 0], head: [-0.1 - dv * 0.2, bk * 0.2, 0] };
      for(const j in G) for(let a = 0; a < 3; a++) off[j][a] = lerp(off[j][a], G[j][a], w);
    }

    // ---- camada de mira (arma) na coluna ----
    const pitchA = st.aimPitch || 0;
    if(p.gunW > 0.01){
      const w = p.gunW;
      off.spine[0] += -pitchA * 0.22 * w; off.chest[0] += -pitchA * 0.3 * w;
      off.neck[0] += -pitchA * 0.15 * w; off.head[0] += -pitchA * 0.28 * w;
      off.chest[1] += -0.28 * w; off.spine[1] += -0.08 * w; off.head[1] += 0.3 * w; off.neck[1] += 0.06 * w;
      off.clavR[2] += 0.1 * w; off.clavL[1] += 0.12 * w;
    } else {
      off.head[0] += -pitchA * 0.35; off.neck[0] += -pitchA * 0.15;
    }

    // ---- clips ----
    let clipLegFK = 0, clipWpn = null, clipIkL = null, clipIkR = null, clipMag = 0, clipPump = 0, clipBolt = 0, armOverride = 0;
    const tmp = [0, 0, 0];
    for(const c of this.clips){
      const d = c.def;
      const prevT = c.t;
      c.t += dt * c.speed;
      if(c.loop && c.t > d.dur){ c.t %= d.dur; c.firedEvents.clear(); }
      if(!c.loop && c.t >= d.dur){ if(d.hold) c.t = d.dur; else c.stopping = true; }
      c.w = c.stopping ? c.w - dt / Math.max(0.01, d.fadeOut || 0.01) : Math.min(1, c.w + dt / Math.max(0.01, d.fadeIn || 0.01));
      if(d.hold && !c.stopping) c.w = Math.min(1, c.w);
      const w = sstep(0, 1, Math.max(0, c.w));
      if(d.events) for(const ev of d.events){ if(c.t >= ev.t && !c.firedEvents.has(ev.t)){ c.firedEvents.add(ev.t); if(this.onEvent) this.onEvent(ev.name, c.name, this); } }
      const mask = MASKS[d.mask];
      for(const jn in d.tracks){
        const tr = d.tracks[jn];
        if(jn === '_rootY'){ this.rootOff[1] += sampleTrack(tr, c.t, c.loop, d.dur, tmp)[0] * w; continue; }
        if(jn === '_rootX'){ this.rootOff[0] += sampleTrack(tr, c.t, c.loop, d.dur, tmp)[0] * w; continue; }
        if(jn === 'wpn'){ clipWpn = sampleTrack(tr, c.t, false, d.dur, new Array(6)).map(v => v * w); continue; }
        if(jn === 'ikL'){ clipIkL = { v: sampleTrack(tr, c.t, false, d.dur, new Array(3)), w }; continue; }
        if(jn === 'ikR'){ clipIkR = { v: sampleTrack(tr, c.t, false, d.dur, new Array(3)), w }; continue; }
        if(jn === 'mag'){ clipMag = sampleTrack(tr, c.t, false, d.dur, tmp)[0] * (w > 0.5 ? 1 : 0); continue; }
        if(jn === 'pump'){ clipPump = sampleTrack(tr, c.t, false, d.dur, tmp)[0] * w; continue; }
        if(jn === 'bolt'){ clipBolt = sampleTrack(tr, c.t, false, d.dur, tmp)[0] * w; continue; }
        if(mask && !mask.includes(jn)) continue;
        if(!off[jn]) continue;
        const v = sampleTrack(tr, c.t, c.loop, d.dur, tmp);
        if(d.mode === 'additive'){ off[jn][0] += v[0] * w; off[jn][1] += v[1] * w; off[jn][2] += v[2] * w; }
        else { off[jn][0] = lerp(off[jn][0], v[0], w); off[jn][1] = lerp(off[jn][1], v[1], w); off[jn][2] = lerp(off[jn][2], v[2], w); }
      }
      if(d.legsFK) clipLegFK = Math.max(clipLegFK, w);
      if(d.mode === 'override' && (d.mask === 'upper' || d.mask === 'full' || d.mask === 'arms')) armOverride = Math.max(armOverride, w);
      c._prevT = prevT;
    }
    this.clips = this.clips.filter(c => c.w > 0 || !c.stopping);
    if(!this.clips.some(c => CLIP_EXPRESSION[c.name] && !c.stopping) && this.face.overrideExpr && this.face.overrideExpr !== 'pain') this.face.overrideExpr = null;
    p.emote = damp(p.emote, this.clips.some(c => c.def.emote && !c.stopping) ? 1 : 0, 8, dt);

    // fidgets aleatórios em idle
    if(p.moveW < 0.1 && p.gunW < 0.5 && grounded && this.clips.length === 0){
      this.fidgetT -= dt;
      if(this.fidgetT <= 0){ this.fidgetT = 7 + Math.random() * 9; this.play(Math.random() < 0.6 ? 'lookAround' : 'shoulderRoll'); }
    }

    // v16: deslize (perna da frente esticada, de trás dobrada, tronco para trás)
    p.slide = damp(p.slide || 0, st.slide && grounded ? 1 : 0, 14, dt);
    if(p.slide > 0.01){
      const w = p.slide, L = (jn, x, y, z) => { if(!off[jn]) return; off[jn][0] = lerp(off[jn][0], x, w); off[jn][1] = lerp(off[jn][1], y, w); off[jn][2] = lerp(off[jn][2], z, w); };
      L('hips', -0.42, 0.5, 0); L('spine', 0.1, -0.2, 0); L('chest', 0.12, -0.18, 0); L('thighL', -1.35, 0, 0.05); L('shinL', 0.25, 0, 0); L('thighR', -0.45, 0, -0.1); L('shinR', 1.9, 0, 0); L('footL', 0.4, 0, 0); L('footR', -0.3, 0, 0);
      clipLegFK = Math.max(clipLegFK, w);
    }
    // ---- aplica FK ----
    J.hips.position.set(hipX + this.rootOff[0], P.hipH + 0.06 + hipY * (1 - clipLegFK) + this.rootOff[1], hipZ);
    if(p.slide > 0.01) J.hips.position.y = lerp(J.hips.position.y, P.hipH * 0.5, p.slide);
    if(p.freefall > 0.01){ J.hips.position.y = lerp(J.hips.position.y, P.hipH * 0.7, p.freefall); }
    for(const jn of JOINTS){
      const o = off[jn];
      _e.set(o[0], o[1], o[2], 'XYZ');
      J[jn].quaternion.copy(ch.restQ[jn]).multiply(_q1.setFromEuler(_e));
    }
    root.updateMatrixWorld(true);

    // ---- IK das pernas (foot planting) ----
    p.legIK = damp(p.legIK, (grounded ? 1 : 0) * (1 - clipLegFK) * (1 - p.freefall) * (1 - p.glide), 14, dt);
    if(p.legIK > 0.01){
      root.getWorldQuaternion(_q2);
      for(const sd of ['L', 'R']){
        const sx = sd === 'L' ? 1 : -1, f = feet[sd];
        const target = root.localToWorld(_v1.set(f.x, f.y, f.z));
        const pole = _v2.set(sx * 0.18 + Math.sin(feetDiff) * 1, 0, Math.cos(feetDiff) + 0.15 * p.crouch).applyQuaternion(_q2);
        solveTwoBone(J['thigh' + sd], J['shin' + sd], P.thigh, P.shin, target, pole, p.legIK, 1);
        // orientação do pé no mundo: yaw dos pés + pitch da passada
        _e.set(f.pitch, feetDiff + sx * 0.07 + this._hipYaw * 0.3, 0, 'YXZ');
        _q3.setFromEuler(_e); _q1.copy(_q2).multiply(_q3);
        setWorldQuaternion(J['foot' + sd], _q1, p.legIK);
        J['toe' + sd].quaternion.copy(ch.restQ['toe' + sd]).multiply(_q3.setFromEuler(_e.set(-Math.max(0, f.pitch) * 0.85 * p.legIK + off['toe' + sd][0], 0, 0)));
      }
    }

    // ---- arma: frame de mira + IK das mãos ----
    const wpn = this.weapon;
    if(wpn){ wpn.group.visible = p.gunW > 0.02 && !this.clips.some(c => c.def.prop && !c.stopping); }
    if(this.pickaxe) this.pickaxe.visible = p.pickW > 0.05 && !this.clips.some(c => c.def.prop && !c.stopping);
    if(wpn && p.gunW > 0.01){
      root.updateMatrixWorld(true);
      const shR = J.uArmR.getWorldPosition(_v1);
      const headP = J.head.getWorldPosition(_v4);
      let dir;
      if(st.aimPoint){ dir = _v2.copy(st.aimPoint).sub(headP).normalize(); }
      else { dir = _v2.set(Math.sin(yaw) * Math.cos(pitchA), Math.sin(pitchA), Math.cos(yaw) * Math.cos(pitchA)); }
      // down-ready quando correndo sem mirar
      const lowReady = p.runF * p.moveW * (1 - p.ads) * 0.55 + (1 - p.gunW) * 1.2;
      const z = _gz.copy(dir);
      const x = _gx.crossVectors(UP, z).normalize();
      const y = _gy.crossVectors(z, x).normalize();
      _m.makeBasis(x, y, z); const qW = _gq.setFromRotationMatrix(_m);
      const sway = Math.sin(t * 1.3) * 0.012 + Math.sin(this.phase * TAU * 2) * 0.025 * p.moveW;
      const pos = _gp.copy(shR)
        .addScaledVector(z, lerp(1.25, 1.1, p.ads) + this.recoil.z * 0.35)
        .addScaledVector(y, lerp(-0.42, -0.02, p.ads) + sway + Math.cos(this.phase * TAU * 2) * 0.03 * p.moveW)
        .addScaledVector(x, lerp(-0.04, 0.68, p.ads));
      qW.multiply(_q1.setFromEuler(_e.set(-this.recoil.p * 0.5 + lowReady, lowReady * 0.5, 0)));
      if(clipWpn){
        pos.addScaledVector(x, clipWpn[0]).addScaledVector(y, clipWpn[1]).addScaledVector(z, clipWpn[2]);
        qW.multiply(_q1.setFromEuler(_e.set(clipWpn[3], clipWpn[4], clipWpn[5])));
      }
      // escreve no holder (espaço do root)
      const holder = ch.weaponHolder;
      holder.position.copy(root.worldToLocal(_gp2.copy(pos)));
      root.getWorldQuaternion(_q2);
      holder.quaternion.copy(_q2).invert().multiply(qW);
      holder.updateMatrixWorld(true);
      // peças móveis
      if(wpn.parts){
        if(wpn.parts.pump) wpn.parts.pump.position.z = (wpn.parts.pump.userData.z0 ?? (wpn.parts.pump.userData.z0 = wpn.parts.pump.position.z)) + clipPump;
        if(wpn.parts.bolt) wpn.parts.bolt.position.z = (wpn.parts.bolt.userData.z0 ?? (wpn.parts.bolt.userData.z0 = wpn.parts.bolt.position.z)) + clipBolt;
      }
      const w = p.gunW * (1 - armOverride);
      // mão direita no grip
      const gripW = wpn.markers.grip.getWorldPosition(_gR);
      const qHR = _gqR.copy(qW).multiply(Q_GRIP_R);
      if(clipIkR && clipIkR.w > 0.01){ gripW.add(_gt.fromArray(clipIkR.v).applyQuaternion(qW).multiplyScalar(clipIkR.w)); }
      const wristR = _gwR.copy(gripW).sub(_gpo.copy(PALM_OFF).applyQuaternion(qHR));
      root.getWorldQuaternion(_q2);
      solveTwoBone(J.uArmR, J.fArmR, P.uArm, P.fArm, wristR, _v3.set(-1, -1.3, -0.4).applyQuaternion(_q2), w, -1);
      setWorldQuaternion(J.handR, qHR, w);
      // mão esquerda no foregrip (ou trilha de recarga)
      let foreW;
      if(clipIkL && clipIkL.w > 0.01){
        const baseLocal = _gb.copy(wpn.markers.fore.position);
        const clipLocal = _gc.fromArray(clipIkL.v);
        foreW = wpn.group.localToWorld(baseLocal.lerp(clipLocal, clipIkL.w));
      } else foreW = wpn.markers.fore.getWorldPosition(_gL);
      const qHL = _gqL.copy(qW).multiply(Q_FORE_L);
      const wristL = _gwL.copy(foreW).sub(_gpo.copy(PALM_OFF).applyQuaternion(qHL));
      solveTwoBone(J.uArmL, J.fArmL, P.uArm, P.fArm, wristL, _v3.set(1.2, -1.5, -0.3).applyQuaternion(_q2), w, -1);
      setWorldQuaternion(J.handL, qHL, w);
      // carregador segue a mão durante a recarga
      if(wpn.parts && wpn.parts.mag){
        const mag = wpn.parts.mag;
        if(clipMag > 0.5){
          J.handL.updateMatrixWorld(true);
          const palm = J.handL.localToWorld(_gt.set(0, -0.3, 0.14));
          mag.position.copy(mag.parent.worldToLocal(palm));
        } else mag.position.copy(mag.userData.base);
      }
    }

    // ---- planador: mãos na barra ----
    if(p.glide > 0.01){
      root.getWorldQuaternion(_q2); root.updateMatrixWorld(true);
      for(const sd of ['L', 'R']){
        const sx = sd === 'L' ? 1 : -1;
        const tgt = root.localToWorld(_v1.set(sx * 0.75, P.hipH + P.spine + P.chestH + 1.6, 0.25));
        solveTwoBone(J['uArm' + sd], J['fArm' + sd], P.uArm, P.fArm, tgt, _v3.set(sx * 1, 0, -0.5).applyQuaternion(_q2), p.glide, -1);
      }
    }

    // ---- dedos ----
    const curlT = { L: 0.3, R: 0.3 };
    if(p.gunW > 0.5 && armOverride < 0.5){ curlT.L = 1.1; curlT.R = 1.25; }
    if(p.pickW > 0.5 || this.pickaxe && this.isPlaying('pickaxeSwing1')){ curlT.R = 1.45; }
    if(p.glide > 0.5){ curlT.L = curlT.R = 1.4; }
    if(p.freefall > 0.5){ curlT.L = curlT.R = 0.1; }
    if(this.clips.some(c => c.def.prop && !c.stopping)) curlT.R = 1.2;
    if(p.runF > 0.5 && p.gunW < 0.5 && p.pickW < 0.5) { curlT.L = curlT.R = 0.9; }
    for(const sd of ['L', 'R']){
      this.curl[sd] = damp(this.curl[sd], curlT[sd], 12, dt);
      const fingers = J['hand' + sd].userData.fingers;
      const c = this.curl[sd];
      fingers.forEach(([a, b], i) => {
        const trig = sd === 'R' && i === 0 && p.gunW > 0.5 ? 0.45 : 1; // indicador no gatilho
        a.rotation.x = -c * 0.95 * trig - i * 0.02; b.rotation.x = -c * 1.1 * trig;
      });
      const th = J['hand' + sd].userData.thumb;
      th[1].rotation.x = -c * 0.5;
    }

    // ---- look-at da cabeça (lobby / NPCs) ----
    if(st.lookTarget && p.gunW < 0.5){
      root.updateMatrixWorld(true);
      const hp = J.head.getWorldPosition(_v1);
      const d = _v2.copy(st.lookTarget).sub(hp);
      J.head.parent.getWorldQuaternion(_q1).invert();
      d.applyQuaternion(_q1);
      const yawH = THREE.MathUtils.clamp(Math.atan2(d.x, d.z), -1.0, 1.0), pitchH = THREE.MathUtils.clamp(Math.atan2(-d.y, Math.hypot(d.x, d.z)), -0.5, 0.5);
      this._look = this._look || { y: 0, x: 0 };
      this._look.y = damp(this._look.y, yawH, 5, dt); this._look.x = damp(this._look.x, pitchH, 5, dt);
      const lw = 1 - armOverride * 0.7;
      J.head.quaternion.premultiply(_q3.setFromEuler(_e.set(this._look.x * 0.7 * lw, this._look.y * 0.75 * lw, 0, 'YXZ')));
      J.neck.quaternion.multiply(_q3.setFromEuler(_e.set(this._look.x * 0.3 * lw, this._look.y * 0.25 * lw, 0, 'YXZ')));
      this.face.lookTarget = st.lookTarget;
    } else this.face.lookTarget = null;

    // ---- rosto ----
    if(ch.lod < 2) this.face.update(dt, t, J.head);

    // ---- músculos (bíceps incha ao flexionar) ----
    ch.muscles.forEach(m => {
      const q = m.elbow.quaternion; const ang = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
      const b = sstep(0.2, 2.2, ang);
      m.mesh.scale.set(1 + b * 0.22, 1 - b * 0.12, 1 + b * 0.3);
    });

    // ---- física secundária ----
    root.updateMatrixWorld(true);
    if(ch.lod === 0 && this.enabledSecondary){
      ch.springs.forEach(s => s.update(dt, t));
      if(ch.clothSim){ ch.clothSim.enabled = true; ch.clothSim.update(dt, t); }
    } else if(ch.clothSim && ch.lod < 2){ ch.clothSim.enabled = false; ch.clothSim.update(dt, t); }
  }
}
