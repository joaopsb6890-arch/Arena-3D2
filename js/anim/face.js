// ============================================================
// FACE — expressões (blend shapes da boca + pálpebras + sobran-
// celhas), piscar, sacadas oculares, olhar para alvo e LIP SYNC
// por visemas gerados a partir do texto (sincronizado com a voz
// sintetizada do sistema de áudio).
// ============================================================
import * as THREE from 'three';

// pesos de morph: open, smile, frown, O, wide, press, sneer
export const EXPRESSIONS = {
  neutral:   { m: [0, 0.08, 0, 0, 0, 0, 0], browY: 0, browIn: 0, lid: 0.0, lidL: 0 },
  happy:     { m: [0.25, 0.9, 0, 0, 0.2, 0, 0], browY: 0.03, browIn: -0.1, lid: 0.12, lidL: 0.35 },
  sad:       { m: [0, 0, 0.8, 0, 0, 0.1, 0], browY: 0.0, browIn: 0.35, lid: 0.3, lidL: 0 },
  angry:     { m: [0.1, 0, 0.5, 0, 0.3, 0.2, 0.4], browY: -0.04, browIn: -0.45, lid: 0.25, lidL: 0.2 },
  surprised: { m: [0.7, 0, 0, 0.6, 0, 0, 0], browY: 0.08, browIn: 0.15, lid: -0.25, lidL: 0 },
  focused:   { m: [0, 0, 0.15, 0, 0, 0.35, 0], browY: -0.02, browIn: -0.25, lid: 0.2, lidL: 0.15 },
  pain:      { m: [0.4, 0, 0.6, 0, 0.5, 0, 0.3], browY: 0.02, browIn: 0.4, lid: 0.55, lidL: 0.3 },
  determined:{ m: [0, 0.15, 0.1, 0, 0.15, 0.3, 0], browY: -0.03, browIn: -0.3, lid: 0.12, lidL: 0.1 },
  talk:      { m: [0, 0.2, 0, 0, 0, 0, 0], browY: 0.02, browIn: 0, lid: 0.05, lidL: 0.05 }
};
export const EXPRESSION_LABELS = { neutral: 'Neutro', happy: 'Feliz', sad: 'Triste', angry: 'Raiva', surprised: 'Surpresa', focused: 'Focado', pain: 'Dor', determined: 'Determinado' };

// visemas → pesos (open, smile, frown, O, wide, press, sneer)
const VIS = {
  A: [0.85, 0, 0, 0, 0.25, 0, 0], E: [0.35, 0.2, 0, 0, 0.7, 0, 0], I: [0.2, 0.3, 0, 0, 0.9, 0, 0],
  O: [0.45, 0, 0, 0.85, 0, 0, 0], U: [0.15, 0, 0, 1.0, 0, 0, 0], M: [0, 0, 0, 0, 0, 1, 0],
  F: [0.08, 0, 0, 0, 0.2, 0.5, 0.35], L: [0.35, 0, 0, 0, 0.3, 0, 0], S: [0.12, 0.1, 0, 0, 0.6, 0, 0],
  X: [0, 0, 0, 0, 0, 0, 0]
};
function charToVis(c){
  c = c.toLowerCase();
  if('aáàâã'.includes(c)) return 'A';
  if('eéê'.includes(c)) return 'E';
  if('ií'.includes(c)) return 'I';
  if('oóôõ'.includes(c)) return 'O';
  if('uú'.includes(c)) return 'U';
  if('mbp'.includes(c)) return 'M';
  if('fv'.includes(c)) return 'F';
  if('lnrtdh'.includes(c)) return 'L';
  if('szcçxjgqk'.includes(c)) return 'S';
  return 'X';
}
/** Gera a linha do tempo de visemas para um texto → [{t, dur, v, vowel}] */
export function textToVisemes(text, rate){
  rate = rate || 13; // caracteres por segundo
  const out = []; let t = 0;
  for(const ch of text){
    if(ch === ' '){ t += 0.6 / rate; out.push({ t, dur: 0.6 / rate, v: 'X' }); continue; }
    if(',.!?;'.includes(ch)){ out.push({ t, dur: 3 / rate, v: 'X' }); t += 3 / rate; continue; }
    const v = charToVis(ch), vowel = 'AEIOU'.includes(v);
    const d = (vowel ? 1.3 : 0.8) / rate;
    out.push({ t, dur: d, v, vowel, ch }); t += d;
  }
  return { seq: out, duration: t };
}

const _v = new THREE.Vector3();
export class FaceController {
  constructor(ch){
    this.ch = ch; this.f = ch.face;
    this.expr = 'neutral'; this.exprW = {}; Object.keys(EXPRESSIONS).forEach(k => this.exprW[k] = k === 'neutral' ? 1 : 0);
    this.blinkT = 1 + Math.random() * 3; this.blink = 0; this.blinkPhase = -1;
    this.sacT = 0.5; this.sac = new THREE.Vector2(); this.sacTarget = new THREE.Vector2();
    this.speech = null; this.visW = new Array(7).fill(0);
    this.lookTarget = null; this.lookW = 0;
    this.morph = new Array(7).fill(0);
    this.overrideExpr = null;
  }
  setExpression(name){ if(EXPRESSIONS[name]) this.expr = name; }
  say(text, onStart){
    const tl = textToVisemes(text);
    this.speech = { ...tl, t: 0, text };
    if(onStart) onStart(tl);
    return tl.duration;
  }
  get speaking(){ return !!this.speech; }
  update(dt, t, headBone){
    const F = this.f;
    const exprName = this.overrideExpr || this.expr;
    // blend de expressões (crossfade suave)
    for(const k in this.exprW){ const tgt = k === exprName ? 1 : 0; this.exprW[k] += (tgt - this.exprW[k]) * Math.min(1, dt * 8); }
    const acc = { m: new Array(7).fill(0), browY: 0, browIn: 0, lid: 0, lidL: 0 };
    for(const k in this.exprW){
      const w = this.exprW[k]; if(w < 0.001) continue; const e = EXPRESSIONS[k];
      for(let i = 0; i < 7; i++) acc.m[i] += e.m[i] * w;
      acc.browY += e.browY * w; acc.browIn += e.browIn * w; acc.lid += e.lid * w; acc.lidL += e.lidL * w;
    }
    // lip sync
    const tgtVis = VIS.X;
    let vis = tgtVis;
    if(this.speech){
      const s = this.speech; s.t += dt;
      if(s.t > s.duration + 0.2) this.speech = null;
      else {
        let cur = null;
        for(const e of s.seq){ if(s.t >= e.t && s.t < e.t + e.dur){ cur = e; break; } }
        if(cur) vis = VIS[cur.v];
      }
    }
    for(let i = 0; i < 7; i++) this.visW[i] += (vis[i] - this.visW[i]) * Math.min(1, dt * 22);
    const speakMix = this.speech ? 1 : 0;
    for(let i = 0; i < 7; i++){
      let v = acc.m[i] * (1 - speakMix * 0.6) + this.visW[i];
      this.morph[i] += (v - this.morph[i]) * Math.min(1, dt * 18);
    }
    if(F.mouth && F.mouth.morphTargetInfluences){
      for(let i = 0; i < 7; i++) F.mouth.morphTargetInfluences[i] = THREE.MathUtils.clamp(this.morph[i], 0, 1.2);
    }
    // piscar (fechamento rápido 70ms, abertura 110ms)
    this.blinkT -= dt;
    if(this.blinkT <= 0 && this.blinkPhase < 0){ this.blinkPhase = 0; this.blinkT = 1.8 + Math.random() * 3.8; if(Math.random() < 0.15) this.blinkT = 0.25; }
    if(this.blinkPhase >= 0){
      this.blinkPhase += dt;
      const p = this.blinkPhase;
      this.blink = p < 0.07 ? p / 0.07 : p < 0.18 ? 1 - (p - 0.07) / 0.11 : 0;
      if(p >= 0.18){ this.blinkPhase = -1; this.blink = 0; }
    }
    const lidClose = THREE.MathUtils.clamp(acc.lid + this.blink * (1 - acc.lid), -0.3, 1);
    F.lidsU.forEach(l => l.rotation.x = lidClose * 1.45 + 0.02);
    F.lidsL.forEach(l => l.rotation.x = -acc.lidL * 0.35 - this.blink * 0.12);
    // sobrancelhas
    F.brows.forEach(b => {
      b.position.y = b.userData.baseY ?? (b.userData.baseY = b.position.y);
      b.position.y = b.userData.baseY + acc.browY + this.visW[0] * 0.015;
      b.rotation.z = -b.userData.side * acc.browIn * 0.6;
    });
    // sacadas + olhar
    this.sacT -= dt;
    if(this.sacT <= 0){ this.sacT = 0.35 + Math.random() * 1.8; this.sacTarget.set((Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.18); }
    this.sac.lerp(this.sacTarget, Math.min(1, dt * 25));
    let ey = this.sac.x, ex = this.sac.y;
    if(this.lookTarget && headBone){
      F.eyes[0].getWorldPosition(_v);
      const dir = this.lookTarget.clone().sub(_v);
      headBone.worldToLocal(_v.copy(this.lookTarget));
      const loc = _v.sub(F.eyes[0].position);
      const yaw = Math.atan2(loc.x, loc.z), pitch = Math.atan2(-loc.y, Math.hypot(loc.x, loc.z));
      ey = THREE.MathUtils.clamp(yaw, -0.5, 0.5) + this.sac.x * 0.3;
      ex = THREE.MathUtils.clamp(pitch, -0.35, 0.35) + this.sac.y * 0.3;
    }
    F.eyes.forEach(e => { e.rotation.y = ey; e.rotation.x = ex; });
  }
}
