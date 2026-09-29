// ============================================================
// AI — IA comportamental por utilidade (utility AI) + FSM:
//  Bots de partida: vagar, saquear (baú/loot), enfrentar
//  (strafe + mira com tempo de reação e erro), construir cobertura,
//  curar, fugir da tempestade, investigar sons.
//  NPCs de lobby: idle, emotes, conversa com lip sync, acenar,
//  olhar para o jogador.
// ============================================================
import * as THREE from 'three';
import { WEAPON_STATS } from './weapons.js';
import { EMOTES } from '../anim/clips.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const wrapA = (a) => { while(a > Math.PI) a -= Math.PI * 2; while(a < -Math.PI) a += Math.PI * 2; return a; };

export class BotBrain {
  constructor(actor, game, skill){
    this.a = actor; this.g = game;
    this.skill = skill ?? (0.35 + Math.random() * 0.5);   // 0..1
    this.state = 'wander'; this.stateT = 0; this.target = null; this.goal = null;
    this.reaction = 0; this.strafeDir = Math.random() < 0.5 ? 1 : -1; this.strafeT = 0;
    this.thinkT = 0; this.heard = null; this.buildCd = 0; this.aimErr = new THREE.Vector3();
    this.jumpT = 2 + Math.random() * 3;
  }
  hear(pos){ if(!this.target) this.heard = pos.clone(); }
  _visibleEnemies(){
    const a = this.a, list = [];
    for(const o of this.g.actors){
      if(o === a || !o.alive || o.onBus || o.mode !== 'ground' && o.mode !== 'glide') continue;
      if(this.g.isAlly && this.g.isAlly(a, o)) continue;
      const d = o.root.position.distanceTo(a.root.position);
      if(d > 220) continue;
      // campo de visão 200°
      _v.subVectors(o.root.position, a.root.position); const ang = Math.abs(wrapA(Math.atan2(_v.x, _v.z) - a.yaw));
      if(ang > 1.75 && d > 25 && o !== a.lastHitBy) continue;
      if(!this.g.physics.lineClear(_v2.copy(a.root.position).setY(a.root.position.y + 6), _v.copy(o.root.position).setY(o.root.position.y + 5))) continue;
      list.push({ o, d });
    }
    list.sort((x, y) => x.d - y.d);
    return list;
  }
  think(){
    const a = this.a, g = this.g, W = g.world;
    const enemies = this._visibleEnemies();
    const inStorm = W.inStorm(a.root.position);
    const lowHp = a.hp + a.shield < 55;
    // utilidades
    const U = {
      flee: inStorm ? 1.2 : (Math.hypot(a.root.position.x - W.storm.cx, a.root.position.z - W.storm.cz) > W.storm.r * 0.85 && W.storm.shrinking ? 0.7 : 0),
      heal: lowHp && !enemies.length && (a.potions > 0 || a.medkits > 0) ? 0.9 : 0,
      engage: enemies.length ? 1.0 - enemies[0].d / 400 + (a.lastHitBy ? 0.2 : 0) : 0,
      loot: 0, investigate: this.heard ? 0.45 : 0, wander: 0.2
    };
    if(!a.slots[1] || a.reserve[a.slots[1]] < 5){
      const ch = W.chests.filter(c => !c.opened).sort((x, y) => x.pos.distanceTo(a.root.position) - y.pos.distanceTo(a.root.position))[0];
      if(ch && ch.pos.distanceTo(a.root.position) < 260){ U.loot = 0.6; this._lootTarget = ch; }
    }
    const hasGun = a.slots.some((t, i) => i > 0 && t);
    if(!hasGun){ U.engage *= enemies.length && enemies[0].d < 18 ? 1 : 0.35; if(U.loot) U.loot = 0.85; }
    if(enemies.length && lowHp && a.mats.wood >= 10) U.engage += 0.1;
    let best = 'wander', bv = -1; for(const k in U) if(U[k] > bv){ bv = U[k]; best = k; }
    if(best !== this.state){ this.state = best; this.stateT = 0; if(best === 'engage') this.reaction = 0.55 - this.skill * 0.35; }
    this.target = enemies.length ? enemies[0].o : null;
  }
  update(dt){
    const a = this.a, g = this.g, W = g.world;
    if(!a.alive) return;
    this.thinkT -= dt; if(this.thinkT <= 0){ this.thinkT = 0.35 + Math.random() * 0.2; this.think(); }
    this.stateT += dt; this.buildCd -= dt;
    const pos = a.root.position;
    let goal = null, faceDir = null, wantFire = false;
    a.sprint = false; a.aiming = false; a.crouch = false;
    switch(this.state){
      case 'flee': goal = _v.set(W.storm.cx, 0, W.storm.cz); a.sprint = true; break;
      case 'loot': {
        const c = this._lootTarget; if(!c || c.opened){ this.state = 'wander'; break; }
        goal = c.pos; if(pos.distanceTo(c.pos) < 6) g.openChestBy(a, c);
        break;
      }
      case 'heal':
        a.moveInput.set(0, 0);
        if(a.using <= 0){ if(!a.useItem(a.shield < 60 && a.potions > 0 ? 'potion' : 'medkit')) this.state = 'wander'; }
        return;
      case 'investigate':
        goal = this.heard; if(!goal || pos.distanceTo(goal) < 10){ this.heard = null; this.state = 'wander'; }
        break;
      case 'engage': {
        const t = this.target; if(!t || !t.alive){ this.state = 'wander'; break; }
        const d = t.root.position.distanceTo(pos);
        // arma adequada à distância
        const want = d < 22 && a.slots.includes('shotgun') ? 'shotgun' : d > 120 && a.slots.includes('sniper') ? 'sniper' : a.slots.includes('rifle') ? 'rifle' : a.slots.find((s, i) => i > 0 && s) || 'pickaxe';
        const idx = a.slots.indexOf(want); if(idx >= 0 && idx !== a.slot && a.cooldown <= 0) a.equip(idx);
        faceDir = _v2.subVectors(t.root.position, pos);
        // strafe
        this.strafeT -= dt; if(this.strafeT <= 0){ this.strafeT = 0.6 + Math.random() * 1.2; this.strafeDir *= -1; }
        const ideal = a.weaponType === 'shotgun' ? 10 : a.weaponType === 'pickaxe' ? 4 : 45;
        a.moveInput.set(this.strafeDir * 0.8, d > ideal * 1.4 ? 1 : d < ideal * 0.6 ? -0.6 : 0);
        this.reaction -= dt;
        // rajadas: alterna janelas de tiro/pausa (bots não são aimbots)
        this.burstT = (this.burstT || 0) - dt;
        if(this.burstT <= 0){ this.burstOn = !this.burstOn; this.burstT = this.burstOn ? 0.5 + Math.random() * 0.8 : 0.5 + Math.random() * (1.4 - this.skill); }
        if(this.reaction <= 0 && this.burstOn) wantFire = true;
        // cobertura: parede quando levou dano recentemente
        if(a.lastHitBy && this.buildCd <= 0 && a.mats.wood >= 10 && a.hp + a.shield < 80 && Math.random() < 0.02 + this.skill * 0.03){
          this.buildCd = 4; g.botBuildWall(a, t);
        }
        this.jumpT -= dt; if(this.jumpT <= 0 && a.body.grounded && d < 60){ this.jumpT = 1.5 + Math.random() * 3; a.body.vel.y = 26; }
        break;
      }
      default: { // wander
        // aliados (modos de equipa) acompanham o jogador em formação solta
        const P = g.player;
        if(P && P.alive && g.isAlly && g.isAlly(a, P) && pos.distanceTo(P.root.position) > 30){ goal = P.root.position; a.sprint = pos.distanceTo(P.root.position) > 60; break; }
        // modos de arena: patrulha em direção ao inimigo mais próximo (sem tempestade para guiar)
        if(g.mode && !g.mode.storm && (!this.goal || this.stateT > 6)){
          let best = null, bd = 1e9; for(const o of g.actors) if(o !== a && o.alive && !(g.isAlly && g.isAlly(a, o))){ const d = o.root.position.distanceTo(pos); if(d < bd){ bd = d; best = o; } }
          if(best){ this.stateT = 0; this.goal = best.root.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, 0, (Math.random() - 0.5) * 30)); }
        }
        if(!this.goal || pos.distanceTo(this.goal) < 8 || this.stateT > 12){
          this.stateT = 0;
          const ang = Math.random() * Math.PI * 2, r = Math.random() * W.storm.r * 0.8;
          this.goal = new THREE.Vector3(W.storm.cx + Math.cos(ang) * r, 0, W.storm.cz + Math.sin(ang) * r);
        }
        goal = this.goal;
      }
    }
    if(goal){
      _v.subVectors(goal, pos); _v.y = 0;
      const desired = Math.atan2(_v.x, _v.z);
      if(!faceDir){ a.yaw += wrapA(desired - a.yaw) * Math.min(1, dt * 4); a.moveInput.set(0, 1); }
      // desvio simples de obstáculos: se parado, gira
      const sp = Math.hypot(a.body.vel.x, a.body.vel.z);
      if(sp < 2 && this.stateT > 0.6){ a.yaw += 1.2; this.goal = null; if(a.body.grounded) a.body.vel.y = 24; }
    }
    if(faceDir){
      const desired = Math.atan2(faceDir.x, faceDir.z);
      a.yaw += wrapA(desired - a.yaw) * Math.min(1, dt * (4 + this.skill * 6));
      const dh = faceDir.y + 0.5, dist = Math.hypot(faceDir.x, faceDir.z);
      a.pitch = Math.atan2(dh, dist);
      a.aiming = true;
      if(wantFire && Math.abs(wrapA(desired - a.yaw)) < 0.15){
        const t = this.target;
        const origin = pos.clone().setY(pos.y + 6.2);
        const aimAt = t.root.position.clone().setY(t.root.position.y + (Math.random() < this.skill * 0.25 ? 6.6 : 4.2));
        // erro de mira decresce com skill, aumenta com distância e movimento do alvo
        const err = (1.35 - this.skill) * 0.07 * (1 + Math.hypot(t.body.vel.x, t.body.vel.z) / 25);
        const dir = aimAt.sub(origin).normalize().add(new THREE.Vector3((Math.random() - 0.5) * err * 2, (Math.random() - 0.5) * err, (Math.random() - 0.5) * err * 2)).normalize();
        if(a.weaponType === 'pickaxe' ? faceDir.length() < 7 : true) a.tryFire(origin, dir);
        if(WEAPON_STATS[a.weaponType] && WEAPON_STATS[a.weaponType].mag && a.mag[a.weaponType] <= 0) a.reload();
      }
      a.aimPoint = this.target ? this.target.root.position.clone().setY(this.target.root.position.y + 5) : null;
    } else { a.pitch *= 0.9; a.aimPoint = null; }
  }
}

// ---------------- NPCs de lobby ----------------
const LINES = [
  'Bora jogar uma partida?', 'Hoje eu pego a vitória!', 'Olha essa skin nova!', 'Quem vai no ônibus comigo?',
  'Cuidado com a tempestade.', 'Vamos cair na cidade?', 'Preparado?', 'Essa dança é a melhor!'
];
export class LobbyNPC {
  constructor(actor, audio, opts){
    this.a = actor; this.audio = audio; opts = opts || {};
    this.t = 2 + Math.random() * 4; this.lookAt = opts.lookAt || null; this.pitch = opts.pitch || 150;
    this.a.anim.face.setExpression('happy');
  }
  update(dt, cam){
    const a = this.a, an = a.anim;
    this.t -= dt;
    if(this.t <= 0 && !an.clips.some(c => !c.stopping && c.def.emote)){
      this.t = 4 + Math.random() * 6;
      const r = Math.random();
      if(r < 0.35){ const e = EMOTES[Math.floor(Math.random() * EMOTES.length)].id; an.play(e); }
      else if(r < 0.65){ this.say(LINES[Math.floor(Math.random() * LINES.length)]); }
      else if(r < 0.8){ an.play('wave'); }
      else { an.play(Math.random() < 0.5 ? 'lookAround' : 'shoulderRoll'); }
    }
    a.lookTarget = this.lookAtActor ? this.lookAtActor.root.position.clone().setY(6.3) : cam ? cam.position : null;
  }
  say(text){
    const an = this.a.anim;
    const dur = an.face.say(text, (tl) => { if(this.audio && this.audio.ctx) this.audio.voice(tl, this.a.root.position.clone().setY(6), this.pitch); });
    an.play('talk');
    setTimeout(() => an.stop('talk'), dur * 1000);
    this.bubble = { text, until: performance.now() + dur * 1000 + 800 };
    return dur;
  }
}
