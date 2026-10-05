// ============================================================
// v22: MODOS NOVOS — cada um com regras, interface e fila de matchmaking próprias
//  br_duo / br_squad / zb_duo / zb_squad  Battle Royale e Zero Build em equipas de 2 ou 4
//  rumble   Team Rumble: 2 equipas grandes, renascimento, primeira a 60 abates
//  a1 / a2  Arena 1v1 e 2v2: rondas (melhor de 5), arena pequena
//  torneio  Torneio: BR com pontos (posição + abates) acumulados em sessões
//  zumbis   Zumbis: sobrevive a 5 ondas de zumbis corpo-a-corpo (cooperativo)
//  corrida  Corridas: percurso de checkpoints pelas estradas, de carro, contra o relógio
//  ltm      Modo Limitado rotativo: muda todos os dias (gravidade baixa, só snipers, …)
// ============================================================
import * as THREE from 'three';
import { heightAt } from './world.js';
import { ROADS } from './pois.js';

export const MODES22 = {
  br_duo:   { name: 'Battle Royale Duo', short: 'DUO', desc: 'Equipas de 2 · último esquadrão vivo', color: '#8b5cf6', bus: true, storm: true, build: true, respawn: 0, bots: 15, squad: 2, killTarget: 99 },
  br_squad: { name: 'Battle Royale Esquadrão', short: 'SQD', desc: 'Equipas de 4 · último esquadrão vivo', color: '#7c3aed', bus: true, storm: true, build: true, respawn: 0, bots: 15, squad: 4, killTarget: 99 },
  zb_duo:   { name: 'Zero Build Duo', short: 'ZB2', desc: 'Sem construção · equipas de 2', color: '#16a34a', bus: true, storm: true, build: false, respawn: 0, bots: 15, squad: 2, killTarget: 99 },
  zb_squad: { name: 'Zero Build Esquadrão', short: 'ZB4', desc: 'Sem construção · equipas de 4', color: '#15803d', bus: true, storm: true, build: false, respawn: 0, bots: 15, squad: 4, killTarget: 99 },
  rumble:   { name: 'Team Rumble', short: 'TR', desc: '2 equipas de 10 · renascimento · primeira a 60 abates', color: '#0ea5e9', bus: false, storm: false, build: true, respawn: 5, bots: 19, teams: 2, teamTarget: 60, timeLimit: 600, startLoadout: ['rifle'], mats: 250 },
  a1:       { name: 'Arena 1v1', short: '1v1', desc: 'Melhor de 5 rondas · arena pequena · construção', color: '#ef4444', bus: false, storm: false, build: true, respawn: 0, bots: 1, rounds: 5, startLoadout: ['rifle', 'shotgun'], mats: 300, arena: 70, skill: 0.8 },
  a2:       { name: 'Arena 2v2', short: '2v2', desc: '2 contra 2 · melhor de 5 rondas', color: '#dc2626', bus: false, storm: false, build: true, respawn: 0, bots: 3, teams: 2, rounds: 5, startLoadout: ['rifle', 'shotgun'], mats: 300, arena: 80, skill: 0.75 },
  torneio:  { name: 'Torneio', short: 'TOR', desc: 'BR competitivo · pontos por posição e abates · sessões de 3 partidas', color: '#f59e0b', bus: true, storm: true, build: true, respawn: 0, bots: 15, skill: 0.85, tourney: true, killTarget: 99 },
  zumbis:   { name: 'Zumbis', short: 'ZMB', desc: 'Cooperativo · sobrevive a 5 ondas de zumbis', color: '#65a30d', bus: false, storm: false, build: true, respawn: 0, bots: 14, zombies: true, waves: 5, startLoadout: ['rifle', 'shotgun'], mats: 400 },
  corrida:  { name: 'Corridas', short: 'RACE', desc: 'De carro pelas estradas · checkpoints · medalhas', color: '#f43f5e', bus: false, storm: false, build: false, respawn: 0, bots: 0, race: true },
  ltm:      { name: 'Modo Limitado', short: 'LTM', desc: 'Muda todos os dias', color: '#e879f9', bus: true, storm: true, build: true, respawn: 0, bots: 13, ltm: true, killTarget: 10 }
};
export const LTMS = [
  { n: 'Gravidade Baixa', d: 'Saltos enormes e quedas lentas', grav: 0.42 },
  { n: 'Só Snipers', d: 'Todos começam com sniper · sem outras armas no chão', startLoadout: ['sniper'], onlyGun: 'sniper' },
  { n: 'Tempestade Relâmpago', d: 'Tempestade 2,6× mais rápida · começa com fuzil', stormSpeed: 2.6, startLoadout: ['rifle'] },
  { n: 'Construtores', d: '999 de cada material · espingarda inicial', mats: 999, startLoadout: ['shotgun'] },
  { n: 'Velocidade Máxima', d: 'Toda a gente corre 35% mais depressa', speed: 1.35 },
  { n: 'Arsenal Lendário', d: 'Começa com fuzil, espingarda e sniper', startLoadout: ['rifle', 'shotgun', 'sniper'] }
];
export function ltmToday(){ const d = Math.floor(Date.now() / 86400000); return LTMS[d % LTMS.length]; }
export function ltmNextIn(){ const ms = 86400000 - (Date.now() % 86400000); return Math.floor(ms / 3600000) + ' h ' + Math.floor(ms / 60000 % 60) + ' min'; }

const store = { get(k, d){ try { const v = localStorage.getItem('fa_' + k); return v ? JSON.parse(v) : d; } catch(e){ return d; } }, set(k, v){ try { localStorage.setItem('fa_' + k, JSON.stringify(v)); } catch(e){} } };

/** extras de regras por modo (ganchos chamados pelo ModeRules) */
export class ModeExtras {
  constructor(rules){ this.R = rules; this.m = rules.m; this.M = rules.M; this.wave = 1; this.cp = 0; this.raceT = 0; }
  // ---------------- arranque ----------------
  setup(){
    const m = this.m, M = this.M;
    if(M.ltm){ const L = this.ltm = ltmToday(); if(L.grav) m.gravMul = L.grav; if(L.stormSpeed){ m.world.storm.timer = 20; m.world.stormSpeed = L.stormSpeed; } if(L.speed) m.actors.forEach(a => a.speedMul = L.speed);
      m.actors.forEach(a => { (L.startLoadout || []).forEach(w => a.give(w)); if(L.mats) a.mats.wood = a.mats.stone = a.mats.metal = L.mats; });
      setTimeout(() => m.toast('MODO LIMITADO: ' + L.n.toUpperCase() + ' — ' + L.d), 1500); }
    if(M.squad){
      // humanos primeiro (mesma equipa no multijogador), depois bots em grupos de M.squad
      const humans = m.actors.filter(a => !a.brain), bots = m.actors.filter(a => a.brain);
      // sem bots (matchmaking só com pessoas): as pessoas formam equipas entre si
      if(!bots.length){ humans.forEach((a, i) => a.team = humans.length <= M.squad ? i : Math.floor(i / M.squad)); }
      else humans.forEach(a => a.team = 0);
      let t = 0, n = humans.length; bots.forEach(b => { if(n >= M.squad){ t++; n = 0; } b.team = t; n++; });
      m.actors.filter(a => a !== m.player && a.team === m.player.team).forEach(a => this.R._teamMarker(a));
      setTimeout(() => m.toast('ESQUADRÃO: ' + m.actors.filter(a => a.team === m.player.team).map(a => a.name).join(' · ')), 1200);
    }
    if(M.zombies){
      m.actors.forEach(a => { a.team = a.brain ? 1 : 0; });
      m.bots.forEach((b, i) => { b.name = 'Zumbi ' + (i + 1); this._zombify(b); });
      setTimeout(() => m.toast('ONDA 1 de ' + M.waves + ' — sobrevive'), 1200);
    }
    if(M.race) this._raceSetup();
  }
  spawnPoint(a){
    const M = this.M;
    if(M.zombies){
      if(a.team === 0) return new THREE.Vector3((Math.random() - 0.5) * 16, 0, 60 + (Math.random() - 0.5) * 16);
      const ang = Math.random() * Math.PI * 2, r = 90 + Math.random() * 60; return new THREE.Vector3(Math.cos(ang) * r, 0, 60 + Math.sin(ang) * r);
    }
    if(M.race){ if(!this.path) this._racePath(); const p = this.path[0], q = this.path[1], d = new THREE.Vector3(q.x - p.x, 0, q.z - p.z).normalize(), i = Math.max(0, this.m.actors.indexOf(a)); return new THREE.Vector3(p.x + d.x * 4 + d.z * (i % 2 ? 5 : -5) - d.x * Math.floor(i / 2) * 9, 0, p.z + d.z * 4 - d.x * (i % 2 ? 5 : -5) - d.z * Math.floor(i / 2) * 9); }
    return null;
  }
  afterSpawn(a){ if(this.M.zombies && a.team === 1) this._zombify(a); if(this.ltm && this.ltm.speed) a.speedMul = this.ltm.speed; }
  _zombify(b){
    const w = this.wave;
    b.slots = ['pickaxe', null, null, null, null]; b._equipped = null; b.equip(0);
    b.hp = 60 + w * 25; b.shield = 0; b.speedMul = 0.82 + w * 0.05; b.mats.wood = b.mats.stone = b.mats.metal = 0;
    if(b.brain){ b.brain.skill = 0.5 + w * 0.06; b.brain.melee = true; }
  }
  // ---------------- abates ----------------
  onKill(killer, victim){
    const m = this.m, M = this.M;
    if(M.zombies){
      if(victim.team === 1){
        const left = m.actors.filter(a => a.team === 1 && a.alive).length;
        if(left === 0){
          if(this.wave >= M.waves){ m._finish(true, null, 'Sobreviveste às ' + M.waves + ' ondas'); return true; }
          this.wave++; m.toast('ONDA ' + this.wave + ' de ' + M.waves + ' a chegar…', 'kill'); m.audio.play('celebrate', null, { vol: 0.5 });
          m.actors.filter(a => a.team === 0 && a.alive).forEach(a => { a.hp = Math.min(100, a.hp + 50); a.shield = Math.min(100, (a.shield || 0) + 50); });
          setTimeout(() => { if(m.phase === 'over') return; m.actors.filter(a => a.team === 1 && !a.remote).forEach(a => this.R.spawn(a, false)); }, 5000);
        }
        return false;
      }
      if(!m.actors.some(a => a.team === 0 && a.alive && a !== victim)){ m._finish(false, killer, 'Os zumbis venceram na onda ' + this.wave); return true; }
      return false;
    }
    return undefined;
  }
  // ---------------- corrida ----------------
  _raceSetup(){
    const m = this.m;
    if(!this.path) this._racePath();
    this.rings = this.path.map((p, i) => {
      p.y = heightAt(p.x, p.z); const nx = this.path[Math.min(i + 1, this.path.length - 1)], pv = this.path[Math.max(0, i - 1)];
      const g = new THREE.Mesh(new THREE.TorusGeometry(9, 0.7, 8, 28), new THREE.MeshBasicMaterial({ color: i === this.path.length - 1 ? 0xfacc15 : 0x22d3ee, transparent: true, opacity: 0.85 }));
      g.position.set(p.x, p.y + 8, p.z); g.rotation.y = Math.atan2(nx.x - pv.x, nx.z - pv.z); g.visible = i <= 1; if(i === 0) g.visible = false; m.scene.add(g); return g;
    });
    this.raceT = -3; this.cp = 1;
    setTimeout(() => this._raceCar(), 300);
  }
  _racePath(){
    // v25: percurso que evita casas — desvia checkpoints para longe de edifícios
    const pts = [[0, -10]]; let cur = [0, -10]; const used = new Set();
    for(let k = 0; k < 14; k++){ const i = ROADS.findIndex((r, j) => !used.has(j) && Math.hypot(r[0] - cur[0], r[1] - cur[1]) < 2); if(i < 0) break; used.add(i); const r = ROADS[i]; pts.push([r[2], r[3]]); cur = [r[2], r[3]]; }
    const path = [];
    for(let i = 0; i < pts.length - 1; i++){
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 70));
      for(let j = 0; j < n; j++){
        const t = j / n;
        let px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
        // v25: desviar checkpoints que ficam dentro de edifícios
        const loc = this.m.world.locationAt ? this.m.world.locationAt(px, pz) : null;
        if(loc && loc.r < 80){
          const offX = (bz - az) / L * 20, offZ = -(bx - ax) / L * 20;
          px += offX; pz += offZ;
        }
        path.push(new THREE.Vector3(px, 0, pz));
      }
    }
    path.push(new THREE.Vector3(pts[pts.length - 1][0], 0, pts[pts.length - 1][1]));
    this.path = path.slice(1, 23);
    let len = 0; for(let i = 1; i < this.path.length; i++) len += this.path[i].distanceTo(this.path[i - 1]);
    this.len = len;
    // v25: medalhas mais alcançáveis
    this.medals = { ouro: len / 45, prata: len / 38, bronze: len / 30 };
  }
  _raceCar(){
    const m = this.m, P = m.player, v = m.v20; if(!v || !P) return;
    const p = P.body.pos, q = this.path[1], yaw = Math.atan2(q.x - p.x, q.z - p.z);
    v._kart(p.x, p.z, yaw, 'desportivo'); const k = v.karts[v.karts.length - 1]; k.race = true;
    v._enterKart(P, k); m.tps.yaw = yaw + Math.PI;
    m.toast('3… 2… 1…'); this._count = 3;
  }
  // ---------------- atualização + interface ----------------
  update(dt){
    const m = this.m, M = this.M, P = m.player;
    if(M.zombies && (this._zt = (this._zt || 0) - dt) <= 0){ this._zt = 1; for(const b of m.actors) if(b.team === 1 && b.brain && b.slots.some((s, i) => i > 0 && s)){ b.slots = ['pickaxe', null, null, null, null]; b._equipped = null; b.equip(0); } }
    if(M.race && this.path && P){
      if(this.raceT < 0){ this.raceT += dt; if(P.kart){ P.kart.sp = 0; P.body.vel.x = P.body.vel.z = 0; } const c = Math.ceil(-this.raceT); if(c !== this._count && c > 0){ this._count = c; m.toast(String(c)); m.audio.play('ui', null, { vol: 0.6 }); } if(this.raceT >= 0){ m.toast('PARTIDA', 'kill'); m.audio.play('woosh', null, { vol: 0.8 }); } }
      else if(!this.done){
        this.raceT += dt;
        const cp = this.path[this.cp]; this.rings.forEach((r, i) => { r.visible = i === this.cp || i === this.cp + 1; r.material.opacity = i === this.cp ? 0.9 : 0.35; r.rotation.z += dt * (i === this.cp ? 1.2 : 0); });
        if(Math.hypot(P.body.pos.x - cp.x, P.body.pos.z - cp.z) < 13){
          this.cp++; m.audio.play('pickup', null, { vol: 0.8, rate: 1 + this.cp * 0.03 }); m.particles.emit('confetti', cp.clone().setY(cp.y + 8), { n: 20 });
          if(this.cp >= this.path.length){ this.done = true; const t = this.raceT, md = t <= this.medals.ouro ? 'OURO' : t <= this.medals.prata ? 'PRATA' : t <= this.medals.bronze ? 'BRONZE' : null;
            const best = store.get('raceBest', 0); if(!best || t < best) store.set('raceBest', t);
            m._finish(!!md, null, 'Tempo ' + fmt(t) + (md ? ' · medalha de ' + md : ' · sem medalha') + (best ? ' · recorde ' + fmt(Math.min(best, t)) : ''));
          }
        }
        if(!P.kart && P.alive && !this._noCarT){ this._noCarT = 1; m.toast('Volta para o carro (E) ou o tempo continua a contar'); }
        if(P.kart) this._noCarT = 0;
      }
    }
  }
  hud(){
    const m = this.m, M = this.M, P = m.player;
    if(M.zombies) return `<span>ONDA <b>${this.wave}/${M.waves}</b><small>${m.actors.filter(a => a.team === 1 && a.alive).length} zumbis vivos</small></span>`;
    if(M.race && this.path) return `<span>CHECKPOINT <b>${Math.min(this.cp, this.path.length - 1)}/${this.path.length - 1}</b><small>${this.raceT < 0 ? 'prepara-te' : fmt(this.raceT)} · ouro ${fmt(this.medals.ouro)}</small></span>`;
    if(M.squad){ const al = m.actors.filter(a => a.team === P.team && a.alive).length, teams = new Set(m.actors.filter(a => a.alive).map(a => a.team)).size; return `<span>ESQUADRÃO <b>${al}/${m.actors.filter(a => a.team === P.team).length}</b><small>${teams} equipas vivas</small></span>`; }
    if(M.tourney){ const T = store.get('tourney', { pts: 0, games: 0 }); return `<span>TORNEIO <b>${T.pts} pts</b><small>partida ${(T.games % 3) + 1}/3 · abates ${P.kills}</small></span>`; }
    if(this.ltm) return `<span>${this.ltm.n.toUpperCase()}<small>Modo Limitado · ${P.kills} abates</small></span>`;
    return null;
  }
  /** fim de partida: devolve texto extra (pontos do torneio, etc.) */
  onEnd(win, place){
    const M = this.M, P = this.m.player;
    if(M.tourney){
      const pts = (win ? 25 : place <= 3 ? 15 : place <= 6 ? 8 : place <= 10 ? 3 : 0) + P.kills * 3;
      const T = store.get('tourney', { pts: 0, games: 0, best: 0 }); T.pts += pts; T.games++;
      let txt = ' · +' + pts + ' pts de torneio (' + T.pts + ' na sessão)';
      if(T.games % 3 === 0){ T.best = Math.max(T.best || 0, T.pts); txt += ' · SESSÃO TERMINADA: ' + T.pts + ' pts (melhor ' + T.best + ')'; T.pts = 0; }
      store.set('tourney', T); return txt;
    }
    return '';
  }
  dispose(){ if(this.rings) this.rings.forEach(r => { this.m.scene.remove(r); r.geometry.dispose(); }); }
}
function fmt(t){ t = Math.max(0, t); return Math.floor(t / 60) + ':' + (t % 60).toFixed(1).padStart(4, '0'); }
