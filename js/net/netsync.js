// ============================================================
// SINCRONIZAÇÃO DA PARTIDA (P2P)
//  Autoridade distribuída:
//   • cada peer é dono do seu jogador; o anfitrião é dono dos bots
//     e da tempestade;
//   • estado (15 Hz): posição, velocidade, yaw/pitch, modo, arma,
//     flags, vida/escudo — só dos atores que o peer possui;
//   • bonecos remotos ("puppets") interpolam com ~100 ms de atraso
//     e extrapolam pela velocidade → movimento suave mesmo a 15 Hz;
//   • eventos confiáveis: tiro (traçador/som/anim), golpe de picareta,
//     acerto (enviado só ao dono do alvo), morte, renascimento,
//     construção, dano em construção, baú aberto, emote, tempestade.
//  Pacotes compactos (arrays + números arredondados): ~70 bytes por
//  ator por tick → 12 atores ≈ 13 KB/s por peer.
// ============================================================
import { VEH_IDS } from '../game/vehicles.js';
import * as THREE from 'three';

const MODE_C = { ground: 0, freefall: 1, glide: 2 }, MODE_N = ['ground', 'freefall', 'glide'];
const W_C = { pickaxe: 0, rifle: 1, shotgun: 2, sniper: 3, none: 4 }, W_N = ['pickaxe', 'rifle', 'shotgun', 'sniper', 'none'];
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
const TICK = 1 / 30;   // v21: 30 Hz (antes 15) → metade do atraso de envio e movimento remoto mais fiel

export class NetSync {
  constructor(match, session, start){
    this.m = match; this.s = session; this.start = start;
    this.isHost = session.isHost; this.me = session.id; this.hostId = session.hostId;
    this.byId = new Map(); this.structs = new Map(); this.sid = 0; this.acc = 0; this.stormAcc = 0; this.t = 0;
    this.left = new Set();
    session.match = this;
  }
  register(a, entry){
    a.netId = entry.id; this.byId.set(entry.id, a);
    const owner = entry.bot ? this.hostId : entry.id;
    a.owner = owner; a.local = owner === this.me;
    if(!a.local){ a.remote = true; a.net = { buf: [], hp: 100, shield: 0 }; a.jumpAt = 99; }
  }
  owns(a){ return !!a && a.local; }
  sendReady(){ this.s.ev({ k: 'ready' }); }
  readyCount(){ return 1 + (this.ready ? this.ready.size : 0); }
  humans(){ return this.start && this.start.roster ? this.start.roster.filter(e => !e.bot).length : 1; }
  // ---------------- envio ----------------
  update(dt){
    this.t += dt; this.acc += dt;
    // v22: taxa de envio adaptativa — 30 Hz normal; 20 Hz com muitos jogadores ou ping alto; 10 Hz com a aba escondida
    if((this._adT = (this._adT || 0) - dt) <= 0){ this._adT = 1; const n = this.m.actors.filter(a => a.remote).length, pg = this.s.pingMs ? this.s.pingMs() : null;
      this.tickDt = document.hidden ? 1 / 10 : (n > 5 || (pg && pg > 160)) ? 1 / 20 : TICK; }
    if(this.acc >= (this.tickDt || TICK)){
      this.acc = 0; this.tick = (this.tick || 0) + 1;
      const list = []; this._last = this._last || new Map(); let skipped = 0;
      for(const a of this.m.actors){
        if(!a.local) continue;
        if(!a.isPlayer && (this.tick & 1)) continue;   // bots do anfitrião a 15 Hz (poupa rede)
        const b = a.body, f = (a.crouch ? 1 : 0) | (a.aiming ? 2 : 0) | (a.alive ? 4 : 0) | (a.onBus ? 8 : 0) | (b.grounded ? 16 : 0) | (a.sprint ? 32 : 0) | (a.root.visible ? 64 : 0) | (a.climbing ? 128 : 0) | (a.rail ? 256 : 0) | (a.downed ? 1024 : 0) | (a.kart ? 512 : 0);
        const row = [a.netId, r1(b.pos.x), r2(b.pos.y), r1(b.pos.z), r2(a.yaw), r2(a.pitch), r1(b.vel.x), r1(b.vel.y), r1(b.vel.z), MODE_C[a.mode] || 0, W_C[a.using > 0 ? 'none' : a.weaponType] ?? 0, f, Math.round(a.hp), Math.round(a.shield), r2(a.fallInput.dive), r2(a.fallInput.bank), a.kart ? VEH_IDS.indexOf(a.kart.type) : -1];
        // v22: compressão delta — quem está parado e sem mudanças não é reenviado (estado-chave a cada 1 s)
        const L = this._last.get(a.netId), key = row.slice(1).join(',');
        if(L && L.key === key && this.t - L.t < 1){ skipped++; continue; }
        this._last.set(a.netId, { key, t: this.t });
        list.push(row);
      }
      if(list.length) this.s.sendState({ t: r2(this.t), a: list });
      this.sent = (this.sent || 0) + list.length; this.skipped = (this.skipped || 0) + skipped;
    }
    if(this.isHost && this.m.mode.storm){
      this.stormAcc += dt;
      if(this.stormAcc > 1){ this.stormAcc = 0; const S = this.m.world.storm; this.s.ev({ k: 'storm', s: [r1(S.r), r1(S.cx), r1(S.cz), r1(S.target), r1(S.tcx), r1(S.tcz), S.phase, r1(S.timer), S.shrinking ? 1 : 0, r1(S.shrinkT || 0), r1(S.from || S.r), r1(S.fcx || 0), r1(S.fcz || 0), S.dmg] }); }
    }
    // bonecos remotos
    const now = this.t;
    for(const a of this.m.actors) if(a.remote) this._interp(a, now, dt);
  }
  // ---------------- receção ----------------
  netState(d, peer){
    if(!d || !Array.isArray(d.a)) return;
    // v21: o mesmo estado pode chegar por 2 caminhos (direto + reencaminhado) → fica só o primeiro
    const lt = (this.lastT || (this.lastT = new Map())).get(peer); if(lt !== undefined && d.t <= lt) return; this.lastT.set(peer, d.t);
    for(const s of d.a){
      const a = this.byId.get(s[0]); if(!a || !a.remote || a.owner !== peer) continue;
      const n = a.net;
      // v21: relógio do peer → o nosso. Segue de perto o atraso MÍNIMO (os pacotes atrasados não empurram o offset)
      //  e mede a variação (jitter) para escolher o atraso de interpolação mais pequeno que continua suave.
      const off = this.t - d.t;
      if(n.offset === undefined){ n.offset = off; n.jit = 0.02; }
      if(off < n.offset) n.offset += (off - n.offset) * 0.5; else n.offset += (off - n.offset) * 0.02;
      n.jit += (Math.abs(off - n.offset) - n.jit) * 0.1;
      // v22: anti-batota básico — velocidade impossível (fora de veículos/saltos/autocarro) é ignorada e contada
      const L = n.buf[n.buf.length - 1];
      if(L && !(s[11] & (8 | 512)) && MODE_N[s[9]] === 'ground' && d.t > L.t - n.offset + 0.01){ const dtp = d.t - (L.t - n.offset), dx = s[1] - L.s[1], dz = s[3] - L.s[3], sp = Math.hypot(dx, dz) / dtp;
        if(sp > 140 && dtp < 1.5){ n.cheat = (n.cheat || 0) + 1; if(n.cheat === 10 && this.m.toast) this.m.toast('Anti-batota: movimento suspeito de ' + a.name); if(n.cheat > 3) return; } else if(n.cheat) n.cheat = Math.max(0, n.cheat - 0.05); }
      n.buf.push({ t: d.t + n.offset, s }); if(n.buf.length > 12) n.buf.shift();
      n.hp = s[12]; n.shield = s[13];
      a.hp = s[12]; a.shield = s[13];
      const alive = !!(s[11] & 4), onBus = !!(s[11] & 8);
      if(a.onBus && !onBus){ a.onBus = false; a.root.visible = true; a.body.pos.set(s[1], s[2], s[3]); if(a.mode === 'ground') a.mode = 'freefall'; a.anim.play('busJump'); }
      if(!a.alive && alive && a.netDead === false){ this._revive(a, s); }
      a.onBus = onBus;
    }
  }
  _interp(a, now, dt){
    const n = a.net, buf = n.buf; if(!buf.length) return;
    const rt = now - THREE.MathUtils.clamp(TICK * 1.6 + (n.jit || 0) * 2, 0.045, 0.14);   // v21: atraso adaptativo (antes fixo 100 ms)
    let A = buf[0], B = null;
    for(let i = 0; i < buf.length - 1; i++) if(buf[i].t <= rt && buf[i + 1].t >= rt){ A = buf[i]; B = buf[i + 1]; break; }
    if(!B){ A = buf[buf.length - 1]; }
    const s = A.s, tgt = n.tgt || (n.tgt = new THREE.Vector3());
    if(B){
      const u = THREE.MathUtils.clamp((rt - A.t) / Math.max(1e-3, B.t - A.t), 0, 1), q = B.s;
      tgt.set(s[1] + (q[1] - s[1]) * u, s[2] + (q[2] - s[2]) * u, s[3] + (q[3] - s[3]) * u);
      n.yaw = s[4] + wrap(q[4] - s[4]) * u; n.pitch = s[5] + (q[5] - s[5]) * u;
    } else {
      const ex = Math.min(0.25, Math.max(0, rt - A.t));   // extrapolação curta
      tgt.set(s[1] + s[6] * ex, s[2] + s[7] * ex, s[3] + s[8] * ex); n.yaw = s[4]; n.pitch = s[5];
    }
    const cur = B ? B.s : s;
    n.vel = n.vel || new THREE.Vector3(); n.vel.set(cur[6], cur[7], cur[8]);
    n.mode = MODE_N[cur[9]] || 'ground'; n.weapon = W_N[cur[10]] || 'pickaxe'; n.flags = cur[11]; n.dive = cur[14]; n.bank = cur[15]; n.veh = cur[16] >= 0 ? VEH_IDS[cur[16]] : null;
  }
  /** chamado pelo Actor.update de um boneco remoto (substitui a física) */
  step(a, dt){
    const n = a.net, b = a.body; if(!n.tgt) return;
    if(b.pos.distanceTo(n.tgt) > 25) b.pos.copy(n.tgt); else b.pos.lerp(n.tgt, 1 - Math.exp(-dt * 30));
    b.vel.copy(n.vel);
    b.grounded = !!(n.flags & 16);
    a.yaw += wrap(n.yaw - a.yaw) * (1 - Math.exp(-dt * 20)); a.pitch = n.pitch;
    a.downed = !!(n.flags & 1024); a.crouch = !!(n.flags & 1) || a.downed; a.aiming = !!(n.flags & 2); a.sprint = !!(n.flags & 32); a.climbing = !!(n.flags & 128); a.remoteRail = !!(n.flags & 256); a.remoteKart = !!(n.flags & 512); a.remoteVeh = n.veh || 'quad'; if(this.m.v20) this.m.v20.remoteKart(a);
    a.fallInput.dive = n.dive || 0; a.fallInput.bank = n.bank || 0;
    if(a.alive && n.mode !== a.mode){ const prev = a.mode; a.setMode(n.mode); if(n.mode === 'ground' && prev === 'glide') a.anim.play('landGlide'); }
    if(a.alive){
      const w = n.weapon;
      if(w !== 'none' && w !== a.weaponType){ let i = a.slots.indexOf(w); if(i < 0){ i = w === 'pickaxe' ? 0 : a.give(w); } if(i !== false && i >= 0) a.equip(i); }
      a.root.rotation.y = a.yaw;
      a.root.visible = !!(n.flags & 64) || !(n.flags & 8);
      // passos de bonecos remotos (som posicional)
      const sp = Math.hypot(b.vel.x, b.vel.z);
      if(b.grounded && sp > 3){ const side = Math.sin(a.anim.phase * Math.PI * 2) > 0 ? 1 : -1; if(side !== a.lastStepSide){ a.lastStepSide = side; this.m.onFootstep(a, sp); } }
    }
  }
  netEvent(d, peer){
    if(!d || !d.k) return;
    const m = this.m, A = (id) => this.byId.get(id);
    switch(d.k){
      case 'fire': {
        const a = A(d.id); if(!a || !a.remote || !a.alive) break;
        a.anim.fire(d.w);
        const model = a.models[d.w]; const muzzle = model ? model.markers.muzzle.getWorldPosition(new THREE.Vector3()) : a.root.position.clone().setY(a.root.position.y + 5);
        const end = new THREE.Vector3(d.e[0], d.e[1], d.e[2]);
        m._tracer(muzzle, end, 0.08);
        const dir = end.clone().sub(muzzle).normalize();
        m.particles.emit('muzzle', muzzle, { dir, scale: d.w === 'shotgun' ? 1.5 : 1 });
        if(d.h) m.particles.emit('impact', end, { n: 5 });
        m.audio.play(d.w, muzzle, { vol: 0.9, reverb: 0.5 });
        for(const b of m.bots) if(b.alive && b.brain && b.root.position.distanceTo(a.root.position) < 160) b.brain.hear(a.root.position);
        break;
      }
      case 'ping': { if(m.s22) m.s22.mark(new THREE.Vector3(d.x, d.y, d.z), !!d.map, true); break; }
      case 'spray': { if(m.s22) m.s22.spray(d); break; }
      case 'ready': { (this.ready = this.ready || new Set()).add(peer); break; }   // v22: ecrã de carregamento à espera de todos
      case 'swing': { const a = A(d.id); if(a && a.remote && a.alive){ a.anim.play(['pickaxeSwing1', 'pickaxeSwing2', 'pickaxeSwing3'][d.c] || 'pickaxeSwing1', { speed: 1.1 }); a.swingT = 0.4; m.audio.play('woosh', a.root.position, { vol: 0.5 }); } break; }
      case 'hit': {
        const t = A(d.t), by = A(d.by); if(!t || !t.local || !t.alive) break;
        // v22: anti-batota — dano limitado e taxa de acertos por peer
        const rl = (this._hitRate = this._hitRate || {}); const now = performance.now(); const R = rl[peer] = rl[peer] && now - rl[peer].t < 1000 ? rl[peer] : { t: now, n: 0 }; if(++R.n > 25) break;
        d.d = Math.max(0, Math.min(250, +d.d || 0));
        t.takeDamage(d.d, by || null, !!d.h, true);
        if(t.isPlayer) m._hurtFx(by || null);
        if(t.brain && by) t.brain.hear(by.root.position);
        break;
      }
      case 'death': {
        const a = A(d.id); if(!a || !a.remote) break;
        a.netDead = false;
        if(a.alive){ a.hp = 0; a.die(A(d.by) || null, true); }
        break;
      }
      case 'build': {
        if(this.structs.has(d.n)) break;
        const S = m.makeStructure(d.p, new THREE.Vector3(d.x, d.y, d.z), d.q, A(d.id) || null, false, d.m || 'wood');
        S.nid = d.n; this.structs.set(d.n, S);
        m.particles.emit('build', S.mesh.position); m.audio.play('build', S.mesh.position, { vol: 0.5 });
        break;
      }
      case 'edit': { const S = this.structs.get(d.n); if(S && S.alive && S.edit !== d.e) m.editStructure(S, true, d.e); break; }
      case 'sdmg': { const S = this.structs.get(d.n); if(S && S.alive) m.damageStructure(S, d.d, new THREE.Vector3(d.x, d.y, d.z), true); break; }
      case 'chest': { const c = m.world.chests[d.i]; if(c && !c.opened){ m.world.openChest(c); m.audio.play('chest', c.pos, { vol: 0.7 }); } break; }
      case 'emote': { const a = A(d.id); if(a && a.remote && a.alive) a.anim.play(d.n); break; }
      case 'storm': {
        if(peer !== this.hostId) break;
        const S = m.world.storm, s = d.s;
        [S.r, S.cx, S.cz, S.target, S.tcx, S.tcz, S.phase, S.timer] = s; S.shrinking = !!s[8]; S.shrinkT = s[9]; S.from = s[10]; S.fcx = s[11]; S.fcz = s[12]; S.dmg = s[13];
        m.world.setStormRadius(S.r);
        break;
      }
      case 'end': { if(peer === this.hostId && m.phase !== 'over'){ const win = d.team !== undefined ? m.player.team === d.team : d.w === this.me; m.endMatch(win, null, d.sub); } break; }
    }
  }
  netPeerLeft(peer){
    for(const a of this.m.actors) if(a.owner === peer && a.alive){ a.alive = false; a.root.visible = false; a.net.buf = []; this.m._killfeed(null, a); this.m.toast(a.name + ' saiu da partida'); }
    this.left.add(peer);
    // BR: se só sobrar o jogador local vivo, vitória
    if(this.m.mode.bus && this.m.player.alive && this.m.actors.filter(a => a.alive).length === 1) setTimeout(() => this.m.endMatch(true), 800);
  }
  _revive(a, s){
    a.alive = true; a.hp = s[12]; a.shield = s[13]; a.root.visible = true; a.anim.stop('death'); a.anim.stopEmotes();
    a.body.pos.set(s[1], s[2], s[3]); a.net.buf = []; a.netDead = undefined;
    this.m.particles.emit('digitize', a.root.position.clone(), { color: 0x7dd3fc });
  }
  // ---------------- ganchos chamados pela Match ----------------
  sendFire(a, w, end, hit){ if(a.local) this.s.ev({ k: 'fire', id: a.netId, w, e: [r1(end.x), r1(end.y), r1(end.z)], h: hit ? 1 : 0 }); }
  sendSwing(a, c){ if(a.local) this.s.ev({ k: 'swing', id: a.netId, c }); }
  sendHit(target, dmg, from, head){ if(!target.remote) return; this.s.ev({ k: 'hit', t: target.netId, d: Math.round(dmg), h: head ? 1 : 0, by: from ? from.netId : null }, target.owner); }
  sendDeath(a, killer){ if(a.local) this.s.ev({ k: 'death', id: a.netId, by: killer ? killer.netId : null }); }
  sendBuild(S, actor){
    if(!actor || !actor.local) return;
    S.nid = this.me.slice(0, 6) + ':' + (++this.sid); this.structs.set(S.nid, S);
    const p = S.mesh.position; this.s.ev({ k: 'build', n: S.nid, id: actor.netId, p: S.piece, x: r2(p.x), y: r2(p.y), z: r2(p.z), q: r2(S.q), m: S.matKind || 'wood' });
  }
  sendEdit(S){ if(S.nid) this.s.ev({ k: 'edit', n: S.nid, e: S.edit }); }
  sendStructDamage(S, dmg, point){ if(S.nid) this.s.ev({ k: 'sdmg', n: S.nid, d: Math.round(dmg), x: r1(point.x), y: r1(point.y), z: r1(point.z) }); }
  sendChest(c){ const i = this.m.world.chests.indexOf(c); if(i >= 0) this.s.ev({ k: 'chest', i }); }
  sendEmote(a, n){ if(a.local) this.s.ev({ k: 'emote', id: a.netId, n }); }
  sendEnd(win, sub){ if(!this.isHost) return; const P = this.m.player; this.s.ev({ k: 'end', team: this.m.mode.teams ? (win ? P.team : 1 - P.team) : undefined, w: win ? this.me : null, sub }); }
  dispose(){ this.s.match = null; }
}
function wrap(a){ while(a > Math.PI) a -= Math.PI * 2; while(a < -Math.PI) a += Math.PI * 2; return a; }
