// ============================================================
// AUDIO — áudio posicional 3D (WebAudio PannerNode HRTF)
//  • todos os sons são SINTETIZADOS (sem arquivos): disparos,
//    passos por superfície, recarga, picareta, construção, baú,
//    UI, vento, chuva, trovão com atraso pela distância
//  • reverb por convolução (resposta ao impulso gerada)
//  • voz por síntese de formantes sincronizada com o lip sync
// ============================================================
import * as THREE from 'three';

const _p = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3();

export class AudioSystem {
  constructor(){
    this.ctx = null; this.buffers = {}; this.enabled = true; this.volume = 0.7;
    this.loops = {};
  }
  init(){
    if(this.ctx) { if(this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){ this.enabled = false; return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.volume; this.master.connect(c.destination);
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.connect(this.master);
    this.dry = c.createGain(); this.dry.connect(this.comp);
    this.reverb = c.createConvolver(); this.reverb.buffer = this._impulse(2.2, 2.5);
    this.wet = c.createGain(); this.wet.gain.value = 0.22; this.reverb.connect(this.wet); this.wet.connect(this.comp);
    this._makeBuffers();
  }
  setVolume(v){ this.volume = v; if(this.master) this.master.gain.value = v; }
  _impulse(dur, decay){
    const c = this.ctx, len = c.sampleRate * dur, b = c.createBuffer(2, len, c.sampleRate);
    for(let ch = 0; ch < 2; ch++){ const d = b.getChannelData(ch); for(let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }
  _buf(dur, fn){
    const c = this.ctx, sr = c.sampleRate, n = Math.floor(sr * dur), b = c.createBuffer(1, n, sr), d = b.getChannelData(0);
    let st = { lp: 0, lp2: 0, ph: 0 };
    for(let i = 0; i < n; i++) d[i] = fn(i / sr, i / n, st);
    return b;
  }
  _makeBuffers(){
    const N = () => Math.random() * 2 - 1;
    const B = this.buffers;
    const shot = (dur, body, crack, low) => this._buf(dur, (t, u, s) => {
      const env = Math.exp(-t * body); const n = N();
      s.lp += (n - s.lp) * 0.25; s.lp2 += (s.lp - s.lp2) * 0.08;
      const thump = Math.sin(2 * Math.PI * (low * Math.exp(-t * 20)) * t) * Math.exp(-t * 18);
      return (n * Math.exp(-t * crack) * 0.6 + s.lp2 * 2.4 * env + thump * 0.9) * 0.8;
    });
    B.rifle = shot(0.35, 14, 60, 120);
    B.shotgun = shot(0.7, 7, 30, 80);
    B.sniper = shot(1.1, 5, 45, 70);
    B.smg = shot(0.25, 20, 80, 150);
    B.click = this._buf(0.05, (t) => N() * Math.exp(-t * 200) * 0.6 + Math.sin(t * 2 * Math.PI * 3200) * Math.exp(-t * 150) * 0.4);
    B.magOut = this._buf(0.18, (t) => N() * Math.exp(-t * 60) * 0.5 + Math.sin(t * 2 * Math.PI * 900) * Math.exp(-t * 40) * 0.4);
    B.magIn = this._buf(0.14, (t) => N() * Math.exp(-t * 80) * 0.7 + Math.sin(t * 2 * Math.PI * 1400) * Math.exp(-t * 60) * 0.5);
    B.pump = this._buf(0.25, (t) => (t < 0.08 ? N() * Math.exp(-t * 50) : N() * Math.exp(-(t - 0.12) * 60) * (t > 0.12 ? 1 : 0)) * 0.7);
    B.bolt = this._buf(0.3, (t) => N() * (Math.exp(-t * 40) + (t > 0.15 ? Math.exp(-(t - 0.15) * 50) : 0)) * 0.5);
    B.pickHit = this._buf(0.35, (t, u, s) => { const n = N(); s.lp += (n - s.lp) * 0.3; return (s.lp * 2 * Math.exp(-t * 25) + Math.sin(t * 2 * Math.PI * 180) * Math.exp(-t * 18)) * 0.7; });
    B.woosh = this._buf(0.35, (t, u, s) => { const n = N(); const f = 0.02 + Math.sin(u * Math.PI) * 0.2; s.lp += (n - s.lp) * f; return s.lp * Math.sin(u * Math.PI) * 1.6; });
    B.step = this._buf(0.12, (t, u, s) => { const n = N(); s.lp += (n - s.lp) * 0.15; return (s.lp * 2.5 + Math.sin(t * 2 * Math.PI * 70) * 0.5) * Math.exp(-t * 45); });
    B.stepWood = this._buf(0.15, (t, u, s) => { const n = N(); s.lp += (n - s.lp) * 0.35; return (s.lp * 1.8 + Math.sin(t * 2 * Math.PI * 220) * 0.6) * Math.exp(-t * 40); });
    B.jump = this._buf(0.2, (t, u, s) => { const n = N(); s.lp += (n - s.lp) * 0.1; return s.lp * 2 * Math.exp(-t * 20); });
    B.land = this._buf(0.3, (t, u, s) => { const n = N(); s.lp += (n - s.lp) * 0.08; return (s.lp * 3 + Math.sin(t * 2 * Math.PI * 55) * 0.8) * Math.exp(-t * 18); });
    B.hit = this._buf(0.12, (t) => Math.sin(t * 2 * Math.PI * (1800 - t * 6000)) * Math.exp(-t * 40) * 0.5);
    B.headshot = this._buf(0.25, (t) => (Math.sin(t * 2 * Math.PI * 2400) + Math.sin(t * 2 * Math.PI * 3600) * 0.5) * Math.exp(-t * 18) * 0.4);
    B.build = this._buf(0.3, (t, u, s) => { const n = N(); s.lp += (n - s.lp) * 0.4; return (s.lp * 1.5 * Math.exp(-t * 20) + Math.sin(t * 2 * Math.PI * 160) * Math.exp(-t * 12) * 0.6); });
    B.chest = this._buf(1.2, (t) => { let v = 0; [523, 659, 784, 1047].forEach((f, i) => { const tt = t - i * 0.09; if(tt > 0) v += Math.sin(tt * 2 * Math.PI * f) * Math.exp(-tt * 4) * 0.25; }); return v; });
    B.ui = this._buf(0.08, (t) => Math.sin(t * 2 * Math.PI * 880) * Math.exp(-t * 50) * 0.4);
    B.elim = this._buf(0.9, (t) => { let v = 0; [880, 1320, 1760].forEach((f, i) => { const tt = t - i * 0.06; if(tt > 0) v += Math.sin(tt * 2 * Math.PI * f * (1 + tt * 0.5)) * Math.exp(-tt * 5) * 0.2; }); return v + N() * Math.exp(-t * 8) * 0.1; });
    B.thunder = this._buf(3.5, (t, u, s) => { const n = N(); s.lp += (n - s.lp) * 0.02; s.lp2 += (s.lp - s.lp2) * 0.05; return s.lp2 * 9 * (Math.exp(-t * 1.2) * (0.6 + 0.4 * Math.sin(t * 13) * Math.sin(t * 3.1))); });
    B.gulp = this._buf(0.25, (t) => Math.sin(t * 2 * Math.PI * (300 + Math.sin(t * 40) * 80)) * Math.exp(-t * 14) * 0.5);
    B.clap = this._buf(0.1, (t, u, s) => { const n = N(); s.lp += (n - s.lp) * 0.5; return (n - s.lp) * Math.exp(-t * 60) * 1.2; });
    // loops
    B.rain = this._buf(2.0, (t, u, s) => { const n = N(); s.lp += (n - s.lp) * 0.3; return (n - s.lp) * 0.35 + (Math.random() < 0.002 ? N() : 0); });
    B.wind = this._buf(3.0, (t, u, s) => { const n = N(); s.lp += (n - s.lp) * 0.015; return s.lp * 3 * (0.7 + 0.3 * Math.sin(u * Math.PI * 2)); });
    B.fire = this._buf(2.0, (t, u, s) => { const n = N(); s.lp += (n - s.lp) * 0.1; return s.lp * 1.2 + (Math.random() < 0.004 ? N() * 0.8 : 0); });
    B.water = this._buf(2.0, (t, u, s) => { const n = N(); s.lp += (n - s.lp) * 0.2; s.lp2 += (s.lp - s.lp2) * 0.3; return (s.lp - s.lp2) * 1.2; });
  }
  updateListener(camera){
    if(!this.ctx) return;
    const L = this.ctx.listener;
    camera.getWorldPosition(_p); camera.getWorldDirection(_f); _u.set(0, 1, 0).applyQuaternion(camera.quaternion);
    if(L.positionX){ const t = this.ctx.currentTime; L.positionX.setTargetAtTime(_p.x, t, 0.02); L.positionY.setTargetAtTime(_p.y, t, 0.02); L.positionZ.setTargetAtTime(_p.z, t, 0.02);
      L.forwardX.setTargetAtTime(_f.x, t, 0.02); L.forwardY.setTargetAtTime(_f.y, t, 0.02); L.forwardZ.setTargetAtTime(_f.z, t, 0.02);
      L.upX.setTargetAtTime(_u.x, t, 0.02); L.upY.setTargetAtTime(_u.y, t, 0.02); L.upZ.setTargetAtTime(_u.z, t, 0.02); }
    else { L.setPosition(_p.x, _p.y, _p.z); L.setOrientation(_f.x, _f.y, _f.z, _u.x, _u.y, _u.z); }
    this._camPos = _p.clone();
  }
  _panner(pos){
    const pn = this.ctx.createPanner();
    pn.panningModel = 'HRTF'; pn.distanceModel = 'inverse'; pn.refDistance = 6; pn.maxDistance = 600; pn.rolloffFactor = 1.1;
    if(pn.positionX){ pn.positionX.value = pos.x; pn.positionY.value = pos.y; pn.positionZ.value = pos.z; } else pn.setPosition(pos.x, pos.y, pos.z);
    return pn;
  }
  /** toca um som: pos = Vector3 (3D) ou null (2D) */
  play(name, pos, opt){
    if(!this.ctx || !this.enabled) return null;
    opt = opt || {};
    const b = this.buffers[name]; if(!b) return null;
    const c = this.ctx, src = c.createBufferSource(); src.buffer = b;
    src.playbackRate.value = (opt.rate || 1) * (1 + (Math.random() - 0.5) * (opt.jitter ?? 0.08));
    const g = c.createGain(); g.gain.value = opt.vol ?? 1;
    let node = src;
    if(opt.lowpass){ const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opt.lowpass; node.connect(f); node = f; }
    node.connect(g);
    let out = g;
    if(pos){ const pn = this._panner(pos); g.connect(pn); out = pn; }
    out.connect(this.dry);
    if(opt.reverb !== false){ const s = c.createGain(); s.gain.value = opt.reverb ?? (pos ? 0.6 : 0.2); out.connect(s); s.connect(this.reverb); }
    const delay = opt.delay || 0;
    if(opt.loop){ src.loop = true; }
    src.start(c.currentTime + delay);
    return { src, gain: g, stop: () => { try { src.stop(); } catch(e){} } };
  }
  /** som em loop posicional (fogueira, fonte) ou global (chuva/vento) */
  loop(id, name, pos, vol){
    if(!this.ctx) return;
    if(this.loops[id]) return this.loops[id];
    const h = this.play(name, pos, { loop: true, vol: vol ?? 0.5, jitter: 0, reverb: 0.1 });
    this.loops[id] = h; return h;
  }
  setLoopVolume(id, v){ const h = this.loops[id]; if(h) h.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.3); }
  thunder(pos){
    if(!this.ctx) return;
    const d = this._camPos ? this._camPos.distanceTo(pos) : 200;
    this.play('thunder', null, { delay: Math.min(4, d / 340 * 4 * 0.25), vol: Math.max(0.3, 1.4 - d / 800), rate: 0.8 + Math.random() * 0.3, lowpass: 900 + Math.max(0, 3000 - d * 4) });
  }
  /** Voz sintetizada por formantes; retorna duração. Sincroniza com FaceController.say */
  voice(visemeTimeline, pos, pitch){
    if(!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime + 0.02;
    const F = { A: [800, 1200], E: [500, 1900], I: [300, 2300], O: [500, 900], U: [320, 800], L: [400, 1400], S: [0, 0], M: [250, 1000], F: [0, 0], X: [0, 0] };
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = pitch || 150;
    const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 7;
    const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 9;
    const g = c.createGain(); g.gain.value = 0;
    osc.connect(f1); osc.connect(f2); f1.connect(g); f2.connect(g);
    const noise = c.createBufferSource(); noise.buffer = this.buffers.rain; noise.loop = true;
    const nf = c.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 3500;
    const ng = c.createGain(); ng.gain.value = 0; noise.connect(nf); nf.connect(ng);
    let out = c.createGain(); out.gain.value = 0.9; g.connect(out); ng.connect(out);
    if(pos){ const pn = this._panner(pos); out.connect(pn); pn.connect(this.dry); } else out.connect(this.dry);
    for(const e of visemeTimeline.seq){
      const t = t0 + e.t, fr = F[e.v] || F.X;
      const voiced = fr[0] > 0;
      g.gain.setTargetAtTime(voiced ? (e.vowel ? 0.5 : 0.22) : 0, t, 0.015);
      ng.gain.setTargetAtTime(e.v === 'S' || e.v === 'F' ? 0.12 : 0, t, 0.01);
      if(voiced){ f1.frequency.setTargetAtTime(fr[0], t, 0.02); f2.frequency.setTargetAtTime(fr[1], t, 0.02); }
      osc.frequency.setTargetAtTime((pitch || 150) * (1 + Math.sin(e.t * 5) * 0.06 + (e.vowel ? 0.04 : 0)), t, 0.03);
    }
    const end = t0 + visemeTimeline.duration + 0.1;
    g.gain.setTargetAtTime(0, end - 0.05, 0.02);
    osc.start(t0); noise.start(t0); osc.stop(end + 0.2); noise.stop(end + 0.2);
  }
}
export const Audio3D = new AudioSystem();
