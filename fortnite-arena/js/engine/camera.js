// ============================================================
// CAMERA — câmera em 3ª pessoa estilo Fortnite (ombro direito,
// personagem à ESQUERDA da mira — a mira nunca fica em cima do
// jogador), colisão com geometria (pull-in), ADS com zoom,
// shake por "trauma" (ruído), FOV kick, e DIRETOR CINEMATOGRÁFICO
// (dolly, orbit, crane, tracking, handheld) com letterbox.
// ============================================================
import * as THREE from 'three';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _ray = new THREE.Raycaster();
const noise = (t, s) => Math.sin(t * 1.7 + s) * 0.5 + Math.sin(t * 3.9 + s * 2.1) * 0.3 + Math.sin(t * 7.3 + s * 3.7) * 0.2;

export class TPSCamera {
  constructor(camera){
    this.cam = camera;
    this.yaw = 0; this.pitch = -0.08;
    this.dist = 13; this.shoulder = 2.4; this.height = 6.3;
    this.curDist = 13; this.ads = 0; this.baseFov = 70; this.fovKick = 0;
    this.trauma = 0; this.t = 0;
    this.colliders = [];
    this.pivot = new THREE.Vector3();
    this.aimPoint = new THREE.Vector3();
    this.forward = new THREE.Vector3();
  }
  addTrauma(a){ this.trauma = Math.min(1, this.trauma + a); }
  kick(fov){ this.fovKick += fov; }
  update(dt, targetPos, opts){
    opts = opts || {};
    this.t += dt;
    this.ads += ((opts.ads ? 1 : 0) - this.ads) * (1 - Math.exp(-dt * 14));
    const sprint = opts.sprint ? 1 : 0;
    this._sp = (this._sp || 0) + (sprint - (this._sp || 0)) * (1 - Math.exp(-dt * 5));
    const dist = (opts.dist ?? this.dist) * (1 - this.ads * 0.55);
    const shoulder = this.shoulder * (1 - this.ads * 0.25);
    const fwd = this.forward.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const right = _v2.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));   // direita da tela
    // pivot suavizado (evita tremer com o bob da animação)
    const ph = targetPos.clone(); ph.y += this.height - (opts.crouch ? 1.2 : 0);
    if(this.pivot.lengthSq() === 0) this.pivot.copy(ph);
    this.pivot.lerp(ph, 1 - Math.exp(-dt * 22));
    const shoulderPt = this.pivot.clone().addScaledVector(right, shoulder);
    // colisão
    let d = dist;
    if(this.colliders.length){
      _ray.set(shoulderPt, fwd.clone().negate()); _ray.far = dist + 0.5;
      const hit = _ray.intersectObjects(this.colliders, false)[0];
      if(hit) d = Math.max(1.5, hit.distance - 0.6);
    }
    this.curDist += (d - this.curDist) * (d < this.curDist ? 1 - Math.exp(-dt * 30) : 1 - Math.exp(-dt * 4));
    const pos = shoulderPt.clone().addScaledVector(fwd, -this.curDist).add(new THREE.Vector3(0, 0.3, 0));
    // shake (trauma²)
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const sh = this.trauma * this.trauma;
    pos.x += noise(this.t * 9, 1) * sh * 0.6; pos.y += noise(this.t * 9, 7) * sh * 0.6;
    this.cam.position.copy(pos);
    const look = pos.clone().add(fwd);
    this.cam.lookAt(look);
    this.cam.rotateZ(noise(this.t * 7, 3) * sh * 0.05);
    this.fovKick *= Math.exp(-dt * 8);
    const fov = (this.baseFov + this._sp * 6 + this.fovKick) * (1 - this.ads * (opts.scope ? 0.72 : 0.22));
    if(Math.abs(this.cam.fov - fov) > 0.01){ this.cam.fov = fov; this.cam.updateProjectionMatrix(); }
    this.aimOrigin = pos; this.aimDir = fwd.clone();
  }
}

// ---------------- DIRETOR CINEMATOGRÁFICO ----------------
export class CinematicDirector {
  constructor(camera, letterboxEl){
    this.cam = camera; this.lb = letterboxEl; this.active = false; this.shots = []; this.idx = 0; this.t = 0; this.target = null;
  }
  /** shot: { type: 'dolly'|'orbit'|'crane'|'tracking'|'handheld', dur, ... } */
  play(shots, target, loop){
    this.shots = shots; this.idx = 0; this.t = 0; this.target = target; this.loop = loop !== false; this.active = true;
    if(this.lb) this.lb.classList.add('on');
  }
  stop(){ this.active = false; if(this.lb) this.lb.classList.remove('on'); }
  get shotName(){ return this.active ? (this.shots[this.idx].label || this.shots[this.idx].type) : ''; }
  update(dt){
    if(!this.active || !this.shots.length) return false;
    const s = this.shots[this.idx]; this.t += dt;
    const u = Math.min(1, this.t / s.dur), e = u * u * (3 - 2 * u);
    const tp = this.target ? (this.target.isVector3 ? this.target : this.target.getWorldPosition(_v)) : new THREE.Vector3();
    const focus = tp.clone().add(s.focusOffset || new THREE.Vector3(0, 4.5, 0));
    const c = this.cam;
    switch(s.type){
      case 'dolly': { c.position.copy(tp).add(s.from.clone().lerp(s.to, e)); c.lookAt(focus); break; }
      case 'orbit': { const a = s.a0 + (s.a1 - s.a0) * e; c.position.set(tp.x + Math.sin(a) * s.r, tp.y + s.h, tp.z + Math.cos(a) * s.r); c.lookAt(focus); break; }
      case 'crane': { const h = s.h0 + (s.h1 - s.h0) * e; const r = s.r0 + (s.r1 - s.r0) * e; c.position.set(tp.x + Math.sin(s.a) * r, tp.y + h, tp.z + Math.cos(s.a) * r); c.lookAt(focus); break; }
      case 'tracking': { c.position.copy(tp).add(s.offset); c.lookAt(focus); break; }
      case 'handheld': { c.position.copy(tp).add(s.offset); c.position.x += noise(this.t * 1.3, 2) * 0.25; c.position.y += noise(this.t * 1.1, 5) * 0.2; c.lookAt(focus); c.rotateZ(noise(this.t, 9) * 0.02); break; }
    }
    if(s.fov && c.fov !== s.fov){ c.fov = s.fov; c.updateProjectionMatrix(); }
    if(this.t >= s.dur){ this.t = 0; this.idx++; if(this.idx >= this.shots.length){ if(this.loop) this.idx = 0; else { this.stop(); } } }
    return true;
  }
}

export const DEFAULT_SHOTS = [
  { type: 'dolly', label: 'Dolly-in', dur: 5, from: new THREE.Vector3(0, 4, 26), to: new THREE.Vector3(0, 5, 10), fov: 40 },
  { type: 'orbit', label: 'Órbita', dur: 7, a0: -0.8, a1: 0.9, r: 14, h: 5.5, fov: 45 },
  { type: 'crane', label: 'Grua', dur: 6, a: 0.5, h0: 1.5, h1: 16, r0: 9, r1: 20, fov: 50 },
  { type: 'tracking', label: 'Close-up', dur: 4, offset: new THREE.Vector3(2.5, 6.4, 5.2), focusOffset: new THREE.Vector3(0, 6.3, 0), fov: 32 },
  { type: 'handheld', label: 'Câmera na mão', dur: 5, offset: new THREE.Vector3(-6, 5, 9), fov: 48 }
];
