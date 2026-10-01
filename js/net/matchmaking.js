// ============================================================
// v20: LOBBY PÚBLICO + MATCHMAKING (sem servidor; tudo P2P via Trystero/Nostr)
//  • PublicHub: canal comum "praça" — quem está online (nome, skin, estado),
//    chat global e convites diretos para a tua sala.
//  • Matchmaker: filas por modo ("mm-<modo>"). Cada jogador anuncia a sua
//    entrada na fila; o mais antigo é o LÍDER. Quando há jogadores suficientes
//    (ou a contagem acaba), o líder cria uma sala privada SEM BOTS, manda o
//    código só a quem foi escolhido e inicia a partida quando todos entram.
// ============================================================
import { joinRoom, selfId } from 'trystero/nostr';
import { NET_APP, NET_VERSION } from './net.js';

const CFG = { appId: NET_APP, rtcConfig: { iceServers: [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' }
] } };

export const MM_MODES = {
  br:    { n: 'Battle Royale', min: 2, max: 8, wait: 20 },
  zb:    { n: 'Zero Build',    min: 2, max: 8, wait: 20 },
  tdm:   { n: 'Mata-mata em equipa', min: 2, max: 8, wait: 15 },
  gun:   { n: 'Corrida às Armas', min: 2, max: 8, wait: 15 },
  duel:  { n: 'Duelo 1x1',     min: 2, max: 2, wait: 0 }
};

/** Canal social: presença + chat global + convites */
export class PublicHub {
  constructor(){ this.room = null; this.peers = new Map(); this.chat = []; this.listeners = new Set(); this.me = null; this.onInvite = null; }
  open(me){
    this.me = Object.assign({}, this.me || {}, me || {});
    if(this.room) { this._pres(); return; }
    this.room = joinRoom(CFG, 'praca-v' + NET_VERSION);
    const pres = this.room.makeAction('pres'), chat = this.room.makeAction('gchat'), inv = this.room.makeAction('inv');
    this._sendPres = (d, t) => pres.send(d, t ? { target: t } : undefined).catch(() => {});
    this._sendChat = (d) => chat.send(d).catch(() => {});
    this._sendInv = (d, t) => inv.send(d, { target: t }).catch(() => {});
    pres.onMessage = (d, { peerId }) => { if(!d || d.v !== NET_VERSION) return; this.peers.set(peerId, { id: peerId, name: String(d.name || 'Jogador').slice(0, 16), skin: d.skin, st: String(d.st || '').slice(0, 30), seen: Date.now() }); this._emit(); };
    chat.onMessage = (d, { peerId }) => { if(!d || !d.text) return; const p = this.peers.get(peerId); this._push({ from: p ? p.name : String(d.name || '?').slice(0, 16), text: String(d.text).slice(0, 140) }); };
    inv.onMessage = (d, { peerId }) => { if(!d || typeof d.code !== 'string') return; const p = this.peers.get(peerId); if(this.onInvite) this.onInvite({ code: d.code.slice(0, 8), from: p ? p.name : 'Alguém', mode: d.mode }); };
    this.room.onPeerJoin = (p) => this._pres(p);
    this.room.onPeerLeave = (p) => { this.peers.delete(p); this._emit(); };
    this._t = setInterval(() => { this._pres(); const now = Date.now(); for(const [k, p] of this.peers) if(now - p.seen > 14000) this.peers.delete(k); this._emit(); }, 4000);
    this._pres();
  }
  setStatus(st){ if(!this.me) this.me = {}; if(this.me.st === st) return; this.me.st = st; this._pres(); }
  _pres(target){ if(this._sendPres && this.me) this._sendPres({ v: NET_VERSION, name: this.me.name, skin: this.me.skin, st: this.me.st || 'No lobby' }, target); }
  say(text){ text = String(text || '').trim().slice(0, 140); if(!text || !this._sendChat) return; this._sendChat({ text, name: this.me && this.me.name }); this._push({ from: (this.me && this.me.name) || 'Eu', text, me: true }); }
  invite(peerId, code, mode){ if(this._sendInv) this._sendInv({ code, mode }, peerId); }
  list(){ return [...this.peers.values()].sort((a, b) => a.name.localeCompare(b.name)); }
  _push(m){ this.chat.push(m); if(this.chat.length > 80) this.chat.shift(); this._emit(); }
  on(fn){ this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit(){ this.listeners.forEach(f => { try { f(); } catch(e){ console.warn(e); } }); }
}

/** Fila de matchmaking (sem bots) */
export class Matchmaker {
  constructor(app){ this.app = app; this.room = null; this.mode = null; this.peers = new Map(); this.onChange = null; this.onMatch = null; this.state = 'idle'; }
  join(mode, profile){
    this.leave();
    const M = MM_MODES[mode]; if(!M) return;
    this.mode = mode; this.M = M; this.profile = profile; this.t0 = Date.now() + Math.random(); this.state = 'queue'; this.startAt = 0;
    this.room = joinRoom(CFG, 'mm-' + mode + '-v' + NET_VERSION);
    const q = this.room.makeAction('q'), go = this.room.makeAction('go');
    this._q = (d, t) => q.send(d, t ? { target: t } : undefined).catch(() => {});
    this._go = (d, t) => go.send(d, { target: t }).catch(() => {});
    q.onMessage = (d, { peerId }) => { if(!d || d.v !== NET_VERSION) return; if(d.leave){ this.peers.delete(peerId); } else this.peers.set(peerId, { id: peerId, t: +d.t || 0, name: String(d.name || 'Jogador').slice(0, 16), startAt: +d.startAt || 0, seen: Date.now() }); this._changed(); };
    go.onMessage = (d, { peerId }) => {
      if(this.state !== 'queue' || !d || typeof d.code !== 'string') return;
      const leader = this._sorted()[0]; if(leader && leader.id !== peerId && this.peers.has(peerId) && this.peers.get(peerId).t > leader.t) return;
      if(!Array.isArray(d.members) || !d.members.includes(selfId)) return;
      this.state = 'found'; this._changed();
      if(this.onMatch) this.onMatch({ host: false, code: d.code, mode: this.mode });
      this.leave(true);
    };
    this.room.onPeerJoin = (p) => this._announce(p);
    this.room.onPeerLeave = (p) => { this.peers.delete(p); this._changed(); };
    this._tick = setInterval(() => this._step(), 1000);
    this._announce(); this._changed();
  }
  _announce(target){ if(this._q) this._q({ v: NET_VERSION, t: this.t0, name: this.profile.name, startAt: this.startAt }, target); }
  _sorted(){
    const now = Date.now(), list = [{ id: selfId, t: this.t0, name: this.profile.name, me: true }];
    for(const p of this.peers.values()) if(now - p.seen < 7000) list.push(p);
    return list.sort((a, b) => (a.t - b.t) || (a.id < b.id ? -1 : 1));
  }
  info(){
    const list = this._sorted(), leader = list[0];
    const startAt = leader.me ? this.startAt : (leader.startAt || 0);
    return { mode: this.mode, M: this.M, n: list.length, list, leader: leader.me, secs: startAt ? Math.max(0, Math.ceil((startAt - Date.now()) / 1000)) : null, state: this.state, waited: Math.floor((Date.now() - this.t0) / 1000) };
  }
  _step(){
    if(this.state !== 'queue') return;
    this._announce();
    const list = this._sorted(), M = this.M;
    if(list[0].me){
      if(list.length >= M.min){ if(!this.startAt) this.startAt = Date.now() + M.wait * 1000; }
      else this.startAt = 0;
      if(list.length >= M.min && (list.length >= M.max || Date.now() >= this.startAt)){
        const members = list.slice(0, M.max).map(p => p.id), code = 'Q' + Math.random().toString(36).slice(2, 6).toUpperCase();
        for(const id of members) if(id !== selfId) this._go({ code, members }, id);
        this.state = 'found'; this._changed();
        if(this.onMatch) this.onMatch({ host: true, code, mode: this.mode, expect: members.length, names: list.slice(0, M.max).map(p => p.name) });
        setTimeout(() => this.leave(true), 1500);
        return;
      }
    }
    this._changed();
  }
  _changed(){ if(this.onChange) this.onChange(this.room ? this.info() : null); }
  leave(quiet){
    clearInterval(this._tick); this._tick = null;
    if(this.room){ try { if(this._q) this._q({ v: NET_VERSION, leave: true }); } catch(e){} const r = this.room; this.room = null; setTimeout(() => { try { r.leave(); } catch(e){} }, 300); }
    this.peers.clear(); this._q = this._go = null;
    if(!quiet){ this.state = 'idle'; this.mode = null; }
    this._changed();
  }
}
