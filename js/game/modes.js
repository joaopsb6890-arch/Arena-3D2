// ============================================================
// MODOS DE JOGO — regras plugáveis sobre a mesma partida:
//  br     Battle Royale (ônibus, tempestade, construção)
//  zb     Zero Construção (BR sem construir)
//  blitz  Blitz (BR rápido: tempestade acelerada, loot inicial)
//  tdm    Mata-Mata em Equipa 6x6 (renascimento, 30 abates)
//  gun    Arsenal (cada abate troca a arma; termina com a picareta)
//  duel   Duelo 1x1 (melhor de 5 rondas, arena central)
//  creative  Modo Criativo → abre o editor de mapas (game/creative.js)
//  custom Jogar mapa criado (mata-mata livre com os spawns do mapa)
// ============================================================
import * as THREE from 'three';
import { heightAt } from './world.js';
import { MODES22, ModeExtras } from './modes22.js';

export const MODES = {
  br:    { name: 'Battle Royale', short: 'BR', desc: 'Solo · 12 jogadores · último vivo ou 10 abates', color: '#a855f7', bus: true, storm: true, build: true, respawn: 0, bots: 11, killTarget: 10 },
  zb:    { name: 'Zero Construção', short: 'ZC', desc: 'Battle Royale sem construir · mais cobertura natural', color: '#22c55e', bus: true, storm: true, build: false, respawn: 0, bots: 11, killTarget: 10 },
  blitz: { name: 'Blitz', short: 'BZ', desc: 'BR rápido · tempestade 2× mais rápida · começa com fuzil', color: '#f97316', bus: true, storm: true, build: true, respawn: 0, bots: 11, killTarget: 8, stormSpeed: 2.2, startLoadout: ['rifle'] },
  tdm:   { name: 'Mata-Mata em Equipa', short: 'MM', desc: '6 contra 6 · renascimento · primeira equipa a 30 abates', color: '#3b82f6', bus: false, storm: false, build: true, respawn: 3, bots: 11, teams: 2, teamTarget: 30, timeLimit: 360, startLoadout: ['rifle', 'shotgun'], mats: 150 },
  gun:   { name: 'Arsenal', short: 'AR', desc: 'Cada abate troca a sua arma · vence quem terminar com a picareta', color: '#eab308', bus: false, storm: false, build: false, respawn: 2, bots: 7, gunList: ['rifle', 'shotgun', 'sniper', 'rifle', 'shotgun', 'pickaxe'], arena: 150 },
  duel:  { name: 'Duelo', short: '1v1', desc: '1 contra 1 · melhor de 5 rondas · arena central', color: '#ef4444', bus: false, storm: false, build: true, respawn: 0, bots: 1, rounds: 5, startLoadout: ['rifle', 'shotgun'], mats: 200, arena: 70, skill: 0.75 },
  custom:{ name: 'Mapa Criado', short: 'MC', desc: 'Mata-mata livre no seu mapa do Modo Criativo', color: '#14b8a6', bus: false, storm: false, build: true, respawn: 3, bots: 5, killTarget: 15, startLoadout: ['rifle'] },
  creative: { name: 'Criativo', short: 'CR', desc: 'Crie o seu mapa: construa, voe, salve e jogue', color: '#ec4899', bus: false, storm: false, build: true, respawn: 1, bots: 0, creative: true }
};
Object.assign(MODES, MODES22);
MODES.gun.name = 'Gun Game (Arsenal)';
export const MODE_ORDER = ['br', 'br_duo', 'br_squad', 'zb', 'zb_squad', 'blitz', 'rumble', 'tdm', 'gun', 'a1', 'a2', 'duel', 'torneio', 'zumbis', 'corrida', 'ltm', 'creative'];
export const TEAM_COLORS = [0x3b82f6, 0xef4444];
export const TEAM_NAMES = ['AZUL', 'VERMELHA'];

export class ModeRules {
  constructor(match, id){
    this.m = match; this.id = MODES[id] ? id : 'br'; this.M = MODES[this.id];
    this.score = [0, 0]; this.round = 1; this.roundWins = [0, 0]; this.timeLeft = this.M.timeLimit || 0;
    this.respawnQueue = [];
    this.X = new ModeExtras(this);
  }
  /** v22: inimigos / aliados vivos de um ator */
  enemiesAlive(a){ return this.m.actors.filter(o => o !== a && o.alive && !this.isAlly(a, o)).length; }
  alliesAlive(a){ return this.m.actors.filter(o => o !== a && o.alive && this.isAlly(a, o)).length; }
  get respawns(){ return this.M.respawn > 0; }
  isAlly(a, b){ return !!(this.M.teams || this.M.squad || this.M.zombies) && a && b && a !== b && a.team === b.team; }
  /** distribui equipas e posiciona todos (modos sem ônibus) */
  setup(){
    const m = this.m, M = this.M;
    if(M.teams) m.actors.forEach((a, i) => { a.team = i % 2; });
    else m.actors.forEach((a, i) => { a.team = i; });
    if(M.teams) m.actors.forEach(a => this._teamMarker(a));
    if(M.gunList) m.actors.forEach(a => { a.gunLevel = 0; });
    if(M.storm === false){ m.world.stormWall.visible = false; }
    if(M.stormSpeed){ m.world.storm.timer = 20; m.world.stormSpeed = M.stormSpeed; }
    if(!M.bus){
      m.actors.forEach(a => { a.onBus = false; a.root.visible = true; this.spawn(a, true); });
      m.phase = 'play';
    } else if(M.startLoadout){
      m.actors.forEach(a => M.startLoadout.forEach(w => a.give(w)));
    }
    if(M.skill) m.bots.forEach(b => { b.brain.skill = M.skill; });
    this.X.setup();
  }
  _teamMarker(a){
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.8, 32), new THREE.MeshBasicMaterial({ color: TEAM_COLORS[a.team], transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; ring.userData.noProbe = true; a.root.add(ring); a.teamRing = ring;
  }
  spawnPoint(a){
    const m = this.m, M = this.M;
    { const xp = this.X.spawnPoint(a); if(xp) return xp; }
    if(M.rounds){ const side = this._side(a), mates = m.actors.filter(o => this._side(o) === side), k = mates.indexOf(a); return new THREE.Vector3(150 + (side ? 35 : -35), 0, 20 + k * 8); }
    const custom = m.layout && m.layout.spawns && m.layout.spawns.length ? m.layout.spawns : null;
    if(custom){
      let list = custom.filter(s => !M.teams || s.team === undefined || s.team === a.team); if(!list.length) list = custom;
      // escolhe o spawn mais longe dos inimigos vivos
      let best = list[0], bd = -1;
      for(const s of list){ let dmin = 1e9; for(const o of m.actors) if(o !== a && o.alive && !this.isAlly(a, o)) dmin = Math.min(dmin, Math.hypot(o.body.pos.x - s.x, o.body.pos.z - s.z)); dmin += Math.random() * 20; if(dmin > bd){ bd = dmin; best = s; } }
      return new THREE.Vector3(best.x + (Math.random() - 0.5) * 3, (best.y ?? heightAt(best.x, best.z)) + 1, best.z + (Math.random() - 0.5) * 3);
    }
    if(M.teams){
      const bx = a.team === 0 ? -150 : 150;
      for(let k = 0; k < 20; k++){ const p = new THREE.Vector3(bx + (Math.random() - 0.5) * 36, 0, (Math.random() - 0.5) * 70 + 60); if(this.m.world._freeSpot(p.x, p.z, 4)) return p; }
      return new THREE.Vector3(bx, 0, 60);
    }
    const R = M.arena || 240;
    if(this.id === 'duel'){ const s = a.isPlayer ? -1 : 1; return new THREE.Vector3(150 + s * 35, 0, 20); }
    for(let k = 0; k < 20; k++){
      const ang = Math.random() * Math.PI * 2, r = 20 + Math.random() * R;
      const p = new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r);
      if(m.world._freeSpot(p.x, p.z, 4) && m.actors.every(o => o === a || !o.alive || o.body.pos.distanceTo(p) > 35)) return p;
    }
    return new THREE.Vector3(0, 0, 40);
  }
  /** (re)coloca um ator em jogo com o equipamento do modo */
  spawn(a, first){
    if(a.remote) return;   // bonecos de outros peers: o dono decide o renascimento
    const M = this.M, p = this.spawnPoint(a);
    p.y = Math.max(p.y, heightAt(p.x, p.z) + 1);
    a.body.pos.copy(p); a.body.vel.set(0, 0, 0); a.mode = 'ground'; a.body.grounded = false;
    if(!first){
      a.alive = true; a.hp = 100; a.root.visible = true; a.using = 0; a.reloading = 0;
      a.anim.stop('death'); a.anim.stopEmotes();
      a.lastHitBy = null; if(a.brain){ a.brain.target = null; a.brain.state = 'wander'; }
      this.m.particles.emit('digitize', a.root.position.clone(), { color: M.teams ? TEAM_COLORS[a.team] : 0x7dd3fc });
    }
    a.shield = M.gunList ? 0 : 50;
    a.slots = ['pickaxe', null, null, null, null]; a._equipped = null; a.mag = {};
    if(M.gunList){ const w = M.gunList[Math.min(a.gunLevel || 0, M.gunList.length - 1)]; if(w !== 'pickaxe') a.give(w); }
    else (M.startLoadout || []).forEach(w => a.give(w));
    for(const w of a.slots) if(w && w !== 'pickaxe'){ const st = this.m.weaponStats(w); a.mag[w] = st.mag; a.reserve[w] = Math.max(a.reserve[w] || 0, st.mag * 4); }
    if(M.mats) a.mats.wood = Math.max(a.mats.wood, M.mats);
    a.equip(a.slots[1] ? 1 : 0);
    if(a.isPlayer){ this.m.tps.yaw = Math.atan2(-p.x, -p.z); this.m._updateSlotsUI(); }
    else a.yaw = Math.atan2(-p.x, -p.z);
    this.X.afterSpawn(a);
  }
  _side(a){ return this.M.teams ? a.team : (a === this.m.player ? 0 : 1); }
  /** chamado em cada abate; devolve true se a partida acabou */
  onKill(killer, victim){
    const m = this.m, M = this.M;
    { const r = this.X.onKill(killer, victim); if(r !== undefined) return r; }
    if(killer && M.teams && !this.isAlly(killer, victim)) this.score[killer.team]++;
    if(killer && M.gunList && killer !== victim){
      killer.gunLevel = (killer.gunLevel || 0) + 1;
      if(killer.gunLevel >= M.gunList.length){ m._finish(killer.isPlayer, killer, `${killer.name} completou o arsenal`); return true; }
      const w = M.gunList[killer.gunLevel];
      killer.slots = ['pickaxe', null, null, null, null]; killer._equipped = null;
      if(w !== 'pickaxe'){ const i = killer.give(w); const st = m.weaponStats(w); killer.mag[w] = st.mag; killer.reserve[w] = st.mag * 4; killer.equip(i); } else killer.equip(0);
      if(killer.isPlayer){ m.toast(`NOVA ARMA: ${w === 'pickaxe' ? 'PICARETA (última!)' : m.weaponStats(w).name.toUpperCase()}`, 'kill'); m._updateSlotsUI(); }
      m.particles.emit('magic', killer.root.position.clone().setY(killer.root.position.y + 6), { color: 0xfde047, n: 14 });
    }
    if(M.teams && this.score[killer ? killer.team : 0] >= M.teamTarget){ m._finish(killer.team === m.player.team, null, `Equipa ${TEAM_NAMES[killer.team]} ${this.score[killer.team]} × ${this.score[1 - killer.team]}`); return true; }
    if(M.killTarget && M.respawn && killer && killer.kills >= M.killTarget){ m._finish(killer.isPlayer, killer, `${killer.name} chegou a ${M.killTarget} abates`); return true; }
    if(M.rounds){
      // v22: rondas por lado (1v1 ou 2v2): a ronda acaba quando um lado fica sem ninguém vivo
      const vs = this._side(victim); if(m.actors.some(a => a !== victim && a.alive && this._side(a) === vs)) return false;
      const ps = this._side(m.player), ws = 1 - vs, mine = ws === ps;
      this.roundWins[mine ? 0 : 1]++;
      const need = Math.ceil(M.rounds / 2);
      if(this.roundWins[0] >= need || this.roundWins[1] >= need){ m._finish(this.roundWins[0] >= need, null, `${M.name} ${this.roundWins[0]} × ${this.roundWins[1]}`); return true; }
      m.toast(`RONDA ${this.round} — ${mine ? 'GANHASTE' : 'PERDESTE'} (${this.roundWins[0]} × ${this.roundWins[1]})`, mine ? 'kill' : '');
      this.round++;
      setTimeout(() => { if(m.phase === 'over') return; m.actors.forEach(a => this.spawn(a, false)); m.structures.slice().forEach(s => { if(s.alive){ s.hp = 0; m.damageStructure(s, 1, s.mesh.position); } }); }, 2500);
      return false;
    }
    if(this.respawns && !victim.remote) this.respawnQueue.push({ a: victim, t: M.respawn });
    return false;
  }
  update(dt){
    const m = this.m, M = this.M;
    for(const r of this.respawnQueue.slice()){ r.t -= dt; if(r.t <= 0){ this.respawnQueue.splice(this.respawnQueue.indexOf(r), 1); if(m.phase !== 'over') this.spawn(r.a, false); } }
    if(M.timeLimit && m.phase === 'play'){
      this.timeLeft -= dt;
      if(this.timeLeft <= 0){ this.timeLeft = 0; const t = m.player.team; m._finish(this.score[t] > this.score[1 - t], null, `Tempo esgotado · ${TEAM_NAMES[0]} ${this.score[0]} × ${this.score[1]} ${TEAM_NAMES[1]}`); }
    }
    const el = document.getElementById('mode-score'); if(!el) return;
    this.X.update(dt);
    const P = m.player; let h = this.X.hud() || '';
    if(h){}
    else if(M.teams && !M.rounds){
      const mm = Math.floor(this.timeLeft / 60), ss = String(Math.floor(this.timeLeft % 60)).padStart(2, '0');
      h = `<b class="t0">${this.score[0]}</b><span>${mm}:${ss}<small>meta ${M.teamTarget}</small></span><b class="t1">${this.score[1]}</b>`;
    } else if(M.gunList){
      const lead = m.actors.slice().sort((a, b) => (b.gunLevel || 0) - (a.gunLevel || 0))[0];
      h = `<span>ARMA <b>${(P.gunLevel || 0) + 1}/${M.gunList.length}</b><small>Líder: ${lead.name} ${(lead.gunLevel || 0) + 1}/${M.gunList.length}</small></span>`;
    } else if(M.rounds) h = `<b class="t0">${this.roundWins[0]}</b><span>RONDA ${this.round}<small>melhor de ${M.rounds}</small></span><b class="t1">${this.roundWins[1]}</b>`;
    else if(M.respawn) h = `<span>ABATES <b>${P.kills}/${M.killTarget}</b><small>renascimento ativo</small></span>`;
    else h = `<span>${M.name.toUpperCase()}</span>`;
    const wait = this.respawnQueue.find(r => r.a === P);
    if(wait) h += `<div class="respawn">RENASCENDO EM ${Math.ceil(wait.t)}</div>`;
    if(el._h !== h){ el.innerHTML = h; el._h = h; }
    el.style.display = 'flex';
  }
}
