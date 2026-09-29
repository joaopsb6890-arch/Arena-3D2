// ============================================================
// PARTICLES — sistema de partículas GPU-instanciado
//  • 2 pools (aditivo p/ fogo, faíscas, magia | alfa p/ fumaça,
//    poeira, água), cada um 1 draw call com billboards instanciados
//  • atlas procedural 4x2 (glow, fumaça, faísca, chama, gota,
//    estrela, anel, cubo) com animação de cor/tamanho/rotação
//  • física: gravidade, arrasto, vento, colisão com o chão (quique)
//  • presets + emissores contínuos (fogueira, fonte, aura, tempestade)
// ============================================================
import * as THREE from 'three';
const _zero = new THREE.Vector3();
import { getParticleAtlas } from './textures.js';
import { Wind } from '../anim/secondary.js';

const VS = `
attribute vec3 iPos; attribute vec4 iColor; attribute vec3 iData; // size, rot, frame
varying vec2 vUv; varying vec4 vColor;
void main(){
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iData.y), s = sin(iData.y);
  vec2 p = mat2(c, -s, s, c) * position.xy * iData.x;
  mv.xy += p;
  gl_Position = projectionMatrix * mv;
  float f = iData.z; vec2 cell = vec2(mod(f, 4.0), floor(f / 4.0));
  vUv = vec2((uv.x + cell.x) * 0.25, (uv.y + (1.0 - cell.y)) * 0.5);
  vColor = iColor;
}`;
const FS = `
uniform sampler2D uAtlas; varying vec2 vUv; varying vec4 vColor;
void main(){ vec4 t = texture2D(uAtlas, vUv); gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a); if(gl_FragColor.a < 0.004) discard; }`;

class Pool {
  constructor(scene, cap, additive){
    this.cap = cap; this.n = 0;
    const g = new THREE.InstancedBufferGeometry();
    const q = new THREE.PlaneGeometry(1, 1);
    g.index = q.index; g.attributes.position = q.attributes.position; g.attributes.uv = q.attributes.uv;
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 4); this.dat = new Float32Array(cap * 3);
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iColor', new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iData', new THREE.InstancedBufferAttribute(this.dat, 3).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    this.geo = g;
    const m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { uAtlas: { value: getParticleAtlas() } },
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 11 : 10;
    scene.add(this.mesh);
    // estado CPU
    this.p = []; this.free = []; this._o = 0;
  }
  // v15: sem shift() O(n) quando cheio — substitui a partícula mais antiga em rotação
  spawn(o){ if(this.p.length >= this.cap){ this._o = (this._o + 1) % this.cap; const old = this.p[this._o]; if(old) this.free.push(old); this.p[this._o] = o; } else this.p.push(o); }
  update(dt, t){
    const P = this.p; let w = 0;
    for(let i = 0; i < P.length; i++){
      const a = P[i]; a.age += dt;
      if(a.age >= a.life){ if(this.free.length < this.cap) this.free.push(a); continue; }
      const u = a.age / a.life;
      a.vy -= a.grav * dt;
      const dr = Math.exp(-a.drag * dt); a.vx *= dr; a.vy *= dr; a.vz *= dr;
      if(a.wind){ a.vx += Wind.dir.x * Wind.strength * a.wind * dt; a.vz += Wind.dir.z * Wind.strength * a.wind * dt; }
      a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
      if(a.bounce && a.y < a.floor){ a.y = a.floor; a.vy = -a.vy * a.bounce; a.vx *= 0.6; a.vz *= 0.6; }
      a.rot += a.spin * dt;
      P[w++] = a;
    }
    P.length = w;
    const n = Math.min(w, this.cap);
    for(let i = 0; i < n; i++){
      const a = P[i], u = a.age / a.life;
      this.pos[i * 3] = a.x; this.pos[i * 3 + 1] = a.y; this.pos[i * 3 + 2] = a.z;
      const c0 = a.c0, c1 = a.c1;
      const fadeIn = Math.min(1, a.age / (a.fadeIn || 0.0001));
      const alpha = (a.a0 + (a.a1 - a.a0) * u) * fadeIn;
      this.col[i * 4] = c0.r + (c1.r - c0.r) * u; this.col[i * 4 + 1] = c0.g + (c1.g - c0.g) * u; this.col[i * 4 + 2] = c0.b + (c1.b - c0.b) * u; this.col[i * 4 + 3] = alpha;
      this.dat[i * 3] = a.s0 + (a.s1 - a.s0) * Math.pow(u, a.sPow || 1); this.dat[i * 3 + 1] = a.rot; this.dat[i * 3 + 2] = a.frame;
    }
    this.geo.instanceCount = n;
    this.geo.attributes.iPos.needsUpdate = this.geo.attributes.iColor.needsUpdate = this.geo.attributes.iData.needsUpdate = true;
  }
}

// v15: cores em cache (antes: 2 THREE.Color novos por partícula)
const _cc = new Map();
const C = (h) => { if(typeof h !== 'number') return h && h.isColor ? h : new THREE.Color(h); let c = _cc.get(h); if(!c){ c = new THREE.Color(h); if(_cc.size < 512) _cc.set(h, c); } return c; };
const P_DEF = { age: 0, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grav: 0, drag: 0, wind: 0, bounce: 0, floor: 0, rot: 0, spin: 0, s0: 1, s1: 1, a0: 1, a1: 0, c0: null, c1: null, frame: 0, fadeIn: 0, sPow: 1 };
const R = (a, b) => a + Math.random() * (b - a);

export class ParticleSystem {
  constructor(scene, quality){
    this.scene = scene;
    const cap = quality === 'baixa' ? 1500 : 4000;
    this.add = new Pool(scene, cap, true);
    this.alpha = new Pool(scene, cap, false);
    this.emitters = [];
    this.lights = [];
    // v15: pool de 4 luzes criado já (intensidade 0). Criar luzes durante o jogo muda o nº de luzes
    // e obriga o three.js a recompilar todos os materiais — era uma das travadas nos primeiros tiros.
    for(let i = 0; i < 4; i++){ const pl = new THREE.PointLight(0xffffff, 0, 15, 2); pl.castShadow = false; scene.add(pl); this.lights.push({ light: pl, t: 0, dur: 0, i: 0 }); }
    this.t = 0;
  }
  _p(pool, o){
    // v15: reutiliza objetos de partículas mortas (menos lixo para o GC)
    const a = Object.assign(pool.free.pop() || {}, P_DEF, o);
    if(o.rot === undefined) a.rot = Math.random() * 6.28;
    if(!a.c0) a.c0 = C(0xffffff); if(!a.c1) a.c1 = C(0xffffff);
    pool.spawn(a);
  }
  /** Efeitos prontos */
  emit(type, pos, opt){
    opt = opt || {};
    const x = pos.x, y = pos.y, z = pos.z;
    const dir = opt.dir || new THREE.Vector3(0, 1, 0);
    switch(type){
      case 'muzzle': {
        for(let i = 0; i < 3; i++) this._p(this.add, { x, y, z, life: 0.06, s0: R(0.5, 0.9) * (opt.scale || 1), s1: 0.2, frame: 3, c0: C(0xfff2c0), c1: C(0xff7a1a), a0: 1, a1: 0 });
        this._p(this.add, { x, y, z, life: 0.08, s0: 1.8 * (opt.scale || 1), s1: 0.6, frame: 0, c0: C(0xffd27a), c1: C(0xff6a00), a0: 0.8, a1: 0 });
        for(let i = 0; i < 5; i++) this._p(this.add, { x, y, z, vx: dir.x * R(20, 40) + R(-4, 4), vy: dir.y * R(20, 40) + R(-4, 4), vz: dir.z * R(20, 40) + R(-4, 4), drag: 4, life: R(0.05, 0.14), s0: 0.12, s1: 0.05, frame: 2, c0: C(0xffe9a8), c1: C(0xff8a2a) });
        for(let i = 0; i < 2; i++) this._p(this.alpha, { x, y, z, vx: dir.x * 3 + R(-0.5, 0.5), vy: dir.y * 3 + R(0.5, 1.5), vz: dir.z * 3, drag: 2, wind: 0.2, life: R(0.5, 0.9), s0: 0.4, s1: 1.6, frame: 1, c0: C(0xb8b8b8), c1: C(0x8a8a8a), a0: 0.35, a1: 0, fadeIn: 0.04, spin: R(-1, 1) });
        this.flash(pos, 0xffb866, 8, 0.07, 18);
        break;
      }
      case 'impact': {  // faíscas + poeira no ponto de impacto
        const n = opt.n || 10, c = opt.color || 0xffc26b;
        for(let i = 0; i < n; i++){
          const v = new THREE.Vector3(R(-1, 1), R(-0.2, 1), R(-1, 1)).add(dir).normalize().multiplyScalar(R(8, 22));
          this._p(this.add, { x, y, z, vx: v.x, vy: v.y, vz: v.z, grav: 40, drag: 1.5, bounce: 0.4, floor: opt.floor ?? -999, life: R(0.2, 0.5), s0: R(0.08, 0.16), s1: 0.02, frame: 2, c0: C(0xfff4c8), c1: C(c) });
        }
        for(let i = 0; i < 4; i++) this._p(this.alpha, { x, y, z, vx: dir.x * R(1, 3) + R(-1, 1), vy: R(0.5, 2), vz: dir.z * R(1, 3) + R(-1, 1), drag: 2.5, wind: 0.3, life: R(0.6, 1.2), s0: 0.3, s1: R(1.2, 2), frame: 1, c0: C(opt.dust || 0x9c8b73), c1: C(opt.dust || 0x9c8b73), a0: 0.45, a1: 0, fadeIn: 0.05, spin: R(-1, 1) });
        break;
      }
      case 'wood': case 'stone': {
        const col = type === 'wood' ? 0x9a6a3a : 0x9aa0a8;
        for(let i = 0; i < 12; i++) this._p(this.alpha, { x, y, z, vx: R(-6, 6), vy: R(3, 10), vz: R(-6, 6), grav: 35, drag: 0.6, bounce: 0.3, floor: opt.floor ?? 0, life: R(0.6, 1.2), s0: R(0.12, 0.25), s1: 0.1, frame: 7, c0: C(col), c1: C(col), a0: 1, a1: 0.6, spin: R(-10, 10) });
        for(let i = 0; i < 4; i++) this._p(this.alpha, { x, y, z, vx: R(-1, 1), vy: R(0.5, 2), vz: R(-1, 1), drag: 2, life: R(0.6, 1), s0: 0.5, s1: 2.2, frame: 1, c0: C(col), c1: C(col), a0: 0.4, a1: 0, fadeIn: 0.05 });
        break;
      }
      case 'dust': {  // passos / aterrissagem
        const n = opt.n || 6;
        for(let i = 0; i < n; i++){ const a = Math.random() * 6.28, sp = R(1, 4) * (opt.power || 1);
          this._p(this.alpha, { x: x + Math.cos(a) * 0.3, y: y + 0.1, z: z + Math.sin(a) * 0.3, vx: Math.cos(a) * sp, vy: R(0.3, 1.2), vz: Math.sin(a) * sp, drag: 3, wind: 0.3, life: R(0.5, 1.1), s0: 0.35, s1: R(1.2, 2.2) * (opt.power || 1), frame: 1, c0: C(opt.color || 0xb9a888), c1: C(opt.color || 0xb9a888), a0: 0.35, a1: 0, fadeIn: 0.05, spin: R(-0.8, 0.8) }); }
        break;
      }
      case 'splash': {
        for(let i = 0; i < (opt.n || 3); i++) this._p(this.alpha, { x, y: y + 0.05, z, vx: R(-2, 2), vy: R(2, 5), vz: R(-2, 2), grav: 30, life: R(0.2, 0.4), s0: 0.12, s1: 0.05, frame: 4, c0: C(0xcfe6ff), c1: C(0xcfe6ff), a0: 0.7, a1: 0 });
        if(Math.random() < 0.5) this._p(this.alpha, { x, y: y + 0.03, z, life: 0.35, s0: 0.1, s1: 0.8, frame: 6, c0: C(0xdbeafe), c1: C(0xdbeafe), a0: 0.5, a1: 0 });
        break;
      }
      case 'digitize': {  // eliminação estilo Fortnite
        const n = opt.n || 60, c = opt.color || 0x60a5fa;
        for(let i = 0; i < n; i++) this._p(this.add, { x: x + R(-0.9, 0.9), y: y + R(0, 7), z: z + R(-0.9, 0.9), vx: R(-1, 1), vy: R(2, 7), vz: R(-1, 1), drag: 1, life: R(0.8, 1.8), s0: R(0.15, 0.35), s1: 0.02, frame: 7, c0: C(0xffffff), c1: C(c), a0: 1, a1: 0, spin: R(-4, 4) });
        for(let i = 0; i < 8; i++) this._p(this.add, { x, y: y + R(0, 7), z, life: R(0.4, 0.8), s0: 1, s1: 4, frame: 6, c0: C(c), c1: C(c), a0: 0.6, a1: 0 });
        this.flash(pos.clone().setY(y + 3.5), c, 6, 0.5, 20);
        break;
      }
      case 'heal': case 'shield': {
        const c = type === 'heal' ? 0x4ade80 : 0x60a5fa;
        for(let i = 0; i < 14; i++){ const a = Math.random() * 6.28, r = R(0.6, 1.2);
          this._p(this.add, { x: x + Math.cos(a) * r, y: y + R(0, 2), z: z + Math.sin(a) * r, vy: R(2, 4), drag: 0.5, life: R(0.8, 1.4), s0: R(0.2, 0.4), s1: 0.05, frame: 5, c0: C(0xffffff), c1: C(c), a0: 1, a1: 0, spin: R(-2, 2) }); }
        break;
      }
      case 'magic': {
        const c = opt.color || 0xa855f7;
        for(let i = 0; i < (opt.n || 2); i++){ const a = Math.random() * 6.28;
          this._p(this.add, { x: x + Math.cos(a) * R(0.3, 1.1), y: y + R(0, 1), z: z + Math.sin(a) * R(0.3, 1.1), vx: -Math.sin(a) * 1.5, vy: R(0.8, 2.5), vz: Math.cos(a) * 1.5, drag: 0.8, life: R(0.8, 1.6), s0: R(0.12, 0.28), s1: 0.02, frame: Math.random() < 0.5 ? 5 : 0, c0: C(0xffffff), c1: C(c), a0: 0.9, a1: 0, spin: R(-3, 3) }); }
        break;
      }
      case 'fire': {
        for(let i = 0; i < (opt.n || 3); i++) this._p(this.add, { x: x + R(-0.4, 0.4) * (opt.r || 1), y, z: z + R(-0.4, 0.4) * (opt.r || 1), vx: R(-0.3, 0.3), vy: R(2.5, 5), vz: R(-0.3, 0.3), wind: 0.25, drag: 0.8, life: R(0.5, 1.0), s0: R(0.8, 1.4) * (opt.size || 1), s1: 0.2, frame: 3, c0: C(0xffe08a), c1: C(0xff3b0a), a0: 0.9, a1: 0, spin: R(-1, 1), fadeIn: 0.08 });
        if(Math.random() < 0.3) this._p(this.add, { x, y: y + 0.5, z, vx: R(-1, 1), vy: R(4, 8), vz: R(-1, 1), wind: 0.4, drag: 0.5, life: R(0.8, 1.6), s0: 0.08, s1: 0.02, frame: 2, c0: C(0xffd27a), c1: C(0xff5a1a) });
        if(Math.random() < 0.4) this._p(this.alpha, { x, y: y + 2, z, vx: R(-0.3, 0.3), vy: R(2, 3.5), vz: R(-0.3, 0.3), wind: 0.6, drag: 0.4, life: R(1.5, 2.8), s0: 1, s1: 3.5, frame: 1, c0: C(0x3a3a3a), c1: C(0x777777), a0: 0.28, a1: 0, fadeIn: 0.3, spin: R(-0.5, 0.5) });
        break;
      }
      case 'water': {  // jato de fonte
        for(let i = 0; i < (opt.n || 4); i++){ const a = Math.random() * 6.28, sp = R(1.5, 3);
          this._p(this.alpha, { x, y, z, vx: Math.cos(a) * sp, vy: R(9, 12), vz: Math.sin(a) * sp, grav: 22, drag: 0.1, bounce: 0, floor: y - 3, life: R(1.0, 1.3), s0: R(0.18, 0.3), s1: 0.12, frame: 4, c0: C(0xe0f2fe), c1: C(0x93c5fd), a0: 0.75, a1: 0.1 }); }
        if(Math.random() < 0.5) this._p(this.alpha, { x: x + R(-1.2, 1.2), y: y - 0.5, z: z + R(-1.2, 1.2), vy: 0.5, life: 0.9, s0: 0.5, s1: 1.8, frame: 1, c0: C(0xffffff), c1: C(0xdbeafe), a0: 0.25, a1: 0, fadeIn: 0.1 });
        break;
      }
      case 'build': {
        for(let i = 0; i < 16; i++) this._p(this.add, { x: x + R(-4, 4), y: y + R(0, 8), z: z + R(-4, 4), vy: R(0.5, 2), drag: 1, life: R(0.3, 0.6), s0: 0.2, s1: 0.02, frame: 7, c0: C(0xbfe9ff), c1: C(0x3b82f6), a0: 1, a1: 0, spin: R(-5, 5) });
        break;
      }
      case 'storm': {
        this._p(this.add, { x, y, z, vx: R(-1, 1), vy: R(2, 6), vz: R(-1, 1), drag: 0.5, life: R(0.6, 1.4), s0: R(0.2, 0.5), s1: 0, frame: Math.random() < 0.5 ? 2 : 0, c0: C(0xe9d5ff), c1: C(0x7c3aed), a0: 0.9, a1: 0 });
        break;
      }
      case 'confetti': {
        const cols = [0xef4444, 0xfbbf24, 0x22c55e, 0x3b82f6, 0xa855f7, 0xec4899];
        for(let i = 0; i < (opt.n || 40); i++){ const c = cols[i % cols.length];
          this._p(this.alpha, { x: x + R(-2, 2), y: y + R(0, 2), z: z + R(-2, 2), vx: R(-6, 6), vy: R(8, 16), vz: R(-6, 6), grav: 14, drag: 1.2, wind: 0.2, life: R(2, 3.5), s0: 0.18, s1: 0.18, frame: 7, c0: C(c), c1: C(c), a0: 1, a1: 0.8, spin: R(-8, 8) }); }
        break;
      }
    }
  }
  /** luz pontual temporária (pool) para flashes */
  flash(pos, color, intensity, dur, dist){
    let L = this.lights.find(l => l.t <= 0);
    if(!L){
      if(this.lights.length >= 4){ L = this.lights[0]; }
      else { const pl = new THREE.PointLight(color, 0, dist || 15, 2); pl.castShadow = false; this.scene.add(pl); L = { light: pl, t: 0, dur: 0, i: 0 }; this.lights.push(L); }
    }
    L.light.color.set(color); L.light.position.copy(pos); L.light.distance = dist || 15; L.t = dur; L.dur = dur; L.i = intensity * 20;
  }
  addEmitter(e){ e.acc = 0; this.emitters.push(e); return e; }
  removeEmitter(e){ this.emitters = this.emitters.filter(x => x !== e); }
  update(dt){
    this.t += dt;
    for(const e of this.emitters){
      if(e.enabled === false) continue;
      e.acc += dt * e.rate;
      const pos = e.target ? e.target.getWorldPosition(e._wp || (e._wp = new THREE.Vector3())).add(e.offset || _zero) : e.pos;
      while(e.acc >= 1){ e.acc -= 1; this.emit(e.type, pos, e.opt); }
    }
    for(const L of this.lights){ if(L.t > 0){ L.t -= dt; L.light.intensity = Math.max(0, L.t / L.dur) * L.i; } else L.light.intensity = 0; }
    this.add.update(dt, this.t); this.alpha.update(dt, this.t);
  }
  get count(){ return this.add.p.length + this.alpha.p.length; }
}
