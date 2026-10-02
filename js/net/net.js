// ============================================================
// MULTIJOGADOR P2P (WebRTC) — sem servidor próprio.
//  • Sinalização: Trystero (estratégia Nostr → relays públicos), depois
//    tudo passa por canais de dados WebRTC diretos entre navegadores.
//  • Salas: código de 5 letras; o criador é o ANFITRIÃO (simula os bots,
//    a tempestade e decide o início). Cada jogador é dono do seu boneco
//    (movimento/tiros calculados localmente → sem atraso para quem joga).
//  • Salas públicas: o anfitrião anuncia a sala num canal comum
//    ("public-lobby") a cada 2,5 s; quem abre o navegador de salas ouve.
//  • Dano: quem acerta envia "hit" ao dono do alvo; o dono aplica e
//    anuncia a morte. Construções, baús, emotes e tiros são eventos.
// ============================================================
import { joinRoom, selfId } from 'trystero/nostr';

export const NET_APP = 'arena3d-p2p-v14';
export const NET_VERSION = 2;   // v19: estrela + reencaminhamento pelo anfitrião
export { selfId };
// v19: STUN + TURN públicos → ligações entre redes diferentes (NAT) funcionam com 3+ jogadores
const CFG = { appId: NET_APP, rtcConfig: { iceServers: [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' }
] } };
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const genCode = () => Array.from({ length: 5 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
export const NET_MODES = ['tdm', 'br', 'zb', 'blitz', 'gun', 'duel'];

/** Canal público: anúncios de salas abertas */
export class PublicLobby {
  constructor(){
    this.rooms = new Map(); this.listeners = new Set(); this.room = null; this.ad = null; this.adTimer = null; this.peers = 0;
  }
  open(){
    if(this.room) return;
    this.room = joinRoom(CFG, 'public-lobby');
    const act = this.room.makeAction('ad');
    this.sendAd = (d, t) => act.send(d, t ? { target: t } : undefined).catch(() => {});
    act.onMessage = (d, ctx) => {
      if(!d || d.v !== NET_VERSION || typeof d.code !== 'string') return;
      if(d.closed){ this.rooms.delete(d.code); }
      else this.rooms.set(d.code, Object.assign({}, d, { seen: Date.now(), peer: ctx.peerId }));
      this._emit();
    };
    this.room.onPeerJoin = (p) => { this.peers++; if(this.ad) this.sendAd(this.ad, p); this._emit(); };
    this.room.onPeerLeave = (p) => { this.peers = Math.max(0, this.peers - 1); for(const [k, r] of this.rooms) if(r.peer === p) this.rooms.delete(k); this._emit(); };
    this._gc = setInterval(() => { const now = Date.now(); let ch = false; for(const [k, r] of this.rooms) if(now - r.seen > 9000){ this.rooms.delete(k); ch = true; } if(ch) this._emit(); }, 2000);
  }
  list(){ return [...this.rooms.values()].sort((a, b) => (a.inGame - b.inGame) || (b.n - a.n)); }
  on(fn){ this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit(){ this.listeners.forEach(f => { try { f(this.list()); } catch(e){ console.warn(e); } }); }
  advertise(ad){
    this.open(); this.ad = ad;
    if(!this.adTimer){ this.adTimer = setInterval(() => { if(this.ad) this.sendAd(this.ad); }, 2500); }
    this.sendAd(ad);
  }
  stopAdvertise(){
    if(this.ad && this.sendAd) this.sendAd(Object.assign({}, this.ad, { closed: true }));
    this.ad = null; clearInterval(this.adTimer); this.adTimer = null;
  }
}

/** Sessão numa sala (antes e durante a partida) */
export class NetSession {
  constructor(app, opts){
    this.app = app; this.id = selfId; this.code = opts.code; this.isHost = !!opts.host;
    this.hostId = this.isHost ? selfId : null;
    this.settings = Object.assign({ name: 'Sala', mode: 'tdm', public: true, max: 8, bots: true, layout: null }, opts.settings || {});
    this.roster = new Map(); this.order = [selfId]; this.inGame = false; this.match = null; this.chat = [];
    this.me = opts.profile; this.roster.set(selfId, Object.assign({ id: selfId, host: this.isHost }, this.me));
    this.onChange = null; this.onChat = null; this.onStart = null; this.onClosed = null;
    this.stats = { up: 0, down: 0, pings: {} };
    this.room = joinRoom(CFG, 'room-' + this.code);
    const mk = (name) => { const a = this.room.makeAction(name); return a; };
    this.aHello = mk('hello'); this.aRoster = mk('roster'); this.aChat = mk('chat'); this.aStart = mk('start'); this.aState = mk('st'); this.aEv = mk('ev');
    this.aHello.onMessage = (d, { peerId }) => this._onHello(d, peerId);
    this.aRoster.onMessage = (d, { peerId }) => this._onRoster(d, peerId);
    // v19: topologia em estrela — os convidados só falam com o anfitrião, que reencaminha para os outros.
    //  Antes cada convidado precisava de uma ligação WebRTC direta com TODOS os outros (malha completa);
    //  quando uma dessas ligações falhava (NAT/rede), o 3.º jogador não via/ouvia o 2.º → só entravam 2.
    this.aChat.onMessage = this._relayed(this.aChat, (d, from) => { const p = this.roster.get(from); this._pushChat({ from: p ? p.name : '?', text: String(d.text || '').slice(0, 140) }); });
    this.aStart.onMessage = (d, { peerId }) => { if(peerId === this.hostId) this._onStart(d); };
    const relState = this._relayed(this.aState, (d, from) => { this.stats.down++; if(this.match) this.match.netState(d, from); });
    // v21: estado também por ligação DIRETA entre convidados (quando existe) → evita o salto extra pelo anfitrião.
    //  O mesmo pacote chega também reencaminhado; o NetSync descarta o duplicado pelo carimbo de tempo.
    this.aState.onMessage = (d, meta) => { if(!this.isHost && d && d.dir && meta.peerId !== this.hostId && this.roster.has(meta.peerId)){ this.stats.down++; if(this.match) this.match.netState(d, meta.peerId); return; } relState(d, meta); };
    this.aEv.onMessage = this._relayed(this.aEv, (d, from) => { this.stats.down++; if(this.match) this.match.netEvent(d, from); });
    this.room.onPeerJoin = (p) => { this.aHello.send(this._helloData(), { target: p }).catch(() => {}); if(this.isHost) this._broadcastRoster(p); };
    this.room.onPeerLeave = (p) => this._onLeave(p);
    this._pingT = setInterval(() => this._ping(), 2000);
    if(this.isHost) this._advertise();
  }
  /** recebe mensagens com envelope de reencaminhamento ({_r: origem} / {_to: destino}) */
  _relayed(action, deliver){
    return (d, { peerId }) => {
      if(!d) return;
      if(this.isHost){
        if(!this.roster.has(peerId)) return;
        if(d._to){                                   // mensagem dirigida a outro convidado
          if(d._to === selfId) deliver(d.d, peerId);
          else if(this.roster.has(d._to)) action.send({ _r: peerId, d: d.d }, { target: d._to }).catch(() => {});
          return;
        }
        deliver(d, peerId);
        const others = this._guests().filter(id => id !== peerId);
        if(others.length) action.send({ _r: peerId, d }, { target: others }).catch(() => {});
        return;
      }
      // convidado: só aceita o que vem do anfitrião (evita duplicados se houver ligação direta)
      if(this.hostId && peerId !== this.hostId) return;
      if(d._r){ if(d._r !== selfId) deliver(d.d, d._r); } else deliver(d, peerId);
    };
  }
  _guests(){ const peers = this.room.getPeers(); return this.order.filter(id => id !== selfId && peers[id]); }
  /** envia: anfitrião → todos (ou alvo); convidado → só ao anfitrião (com _to se for para outro) */
  _send(action, d, target){
    if(this.isHost || !this.hostId){ return action.send(d, target ? { target } : undefined).catch(() => {}); }
    if(target && target !== this.hostId) return action.send({ _to: target, d }, { target: this.hostId }).catch(() => {});
    return action.send(d, { target: this.hostId }).catch(() => {});
  }
  _helloData(){ return { v: NET_VERSION, profile: this.me, host: this.isHost }; }
  _onHello(d, peer){
    if(!d || d.v !== NET_VERSION) return;
    if(d.host){ this.hostId = peer; }
    if(this.isHost){
      if(this.roster.size >= this.settings.max && !this.roster.has(peer)){ this.aRoster.send({ full: true }, { target: peer }).catch(() => {}); return; }
      const p = d.profile || {};
      this.roster.set(peer, { id: peer, name: String(p.name || 'Jogador').slice(0, 16), skin: p.skin, body: p.body, loadout: p.loadout, host: false });
      if(!this.order.includes(peer)) this.order.push(peer);
      this._pushChat({ sys: true, text: `${this.roster.get(peer).name} entrou na sala` });
      this._broadcastRoster(); this._advertise();
    }
  }
  _broadcastRoster(target){
    const d = { settings: Object.assign({}, this.settings, { layout: this.settings.layout ? { name: this.settings.layout.name, n: this.settings.layout.items.length } : null }), roster: this.order.map(id => this.roster.get(id)).filter(Boolean), inGame: this.inGame, code: this.code };
    this.aRoster.send(d, target ? { target } : undefined).catch(() => {});
    this._changed();
  }
  _onRoster(d, peer){
    if(this.isHost) return;
    if(d.full){ this._close('A sala está cheia'); return; }
    this.hostId = peer;
    this.settings = Object.assign(this.settings, d.settings);
    const prev = this.roster, next = new Map(d.roster.map(p => [p.id, p]));
    for(const [id, p] of prev) if(id !== selfId && !next.has(id)){ if(this.match) this.match.netPeerLeft(id); if(prev.size > 1) this._pushChat({ sys: true, text: `${p.name} saiu` }); }
    for(const [id, p] of next) if(id !== selfId && !prev.has(id) && prev.size > 1) this._pushChat({ sys: true, text: `${p.name} entrou na sala` });
    this.roster = next; this.order = d.roster.map(p => p.id);
    if(!this.roster.has(selfId)){ this.roster.set(selfId, Object.assign({ id: selfId }, this.me)); this.order.push(selfId); }
    this.inGame = d.inGame;
    this._changed();
  }
  _onLeave(peer){
    const p = this.roster.get(peer);
    if(peer === this.hostId){ this._close('O anfitrião saiu da sala'); return; }
    if(!this.isHost) return;      // v19: no convidado, quem saiu é decidido pelo anfitrião (lista de jogadores)
    if(this.match) this.match.netPeerLeft(peer);
    if(p){ this.roster.delete(peer); this.order = this.order.filter(x => x !== peer); this._pushChat({ sys: true, text: `${p.name} saiu` }); }
    if(this.isHost){ this._broadcastRoster(); this._advertise(); }
    this._changed();
  }
  _pushChat(m){ this.chat.push(m); if(this.chat.length > 60) this.chat.shift(); if(this.onChat) this.onChat(m); }
  say(text){ text = String(text || '').trim().slice(0, 140); if(!text) return; this._send(this.aChat, { text }); this._pushChat({ from: this.me.name, text, me: true }); }
  setSettings(s){ if(!this.isHost) return; Object.assign(this.settings, s); this._broadcastRoster(); this._advertise(); }
  _advertise(){
    const lob = this.app.publicLobby;
    if(!this.settings.public){ lob.stopAdvertise(); return; }
    lob.advertise({ v: NET_VERSION, code: this.code, name: this.settings.name, host: this.me.name, mode: this.settings.mode, n: this.roster.size, max: this.settings.max, inGame: this.inGame });
  }
  async _ping(){
    for(const id of Object.keys(this.room.getPeers())){ try { this.stats.pings[id] = Math.round(await this.room.ping(id)); } catch(e){} }
    this._changed(true);
  }
  _changed(quiet){ if(this.onChange) this.onChange(quiet); }
  // ---------- partida ----------
  /** anfitrião: monta a lista de jogadores (humanos + bots) e manda todos começarem */
  start(){
    if(!this.isHost) return;
    const M = this.app.MODES[this.settings.mode] || this.app.MODES.tdm;
    const humans = this.order.map(id => this.roster.get(id)).filter(Boolean);
    const total = this.settings.mode === 'duel' ? 2 : M.bots + 1;
    const nb = this.settings.bots ? Math.max(0, total - humans.length) : 0;
    const roster = humans.map(p => ({ id: p.id, name: p.name, skin: p.skin, body: p.body, loadout: p.loadout }));
    for(let i = 0; i < nb; i++) roster.push({ id: 'b' + i, bot: true });
    const d = { mode: this.settings.mode, roster, busA: Math.random() * Math.PI * 2, layout: this.settings.layout || null, weather: this.app.settings.weather, time: this.app.settings.time, t: Date.now() };
    this.inGame = true; this._broadcastRoster(); this._advertise();
    this.aStart.send(d).catch(() => {});
    this._onStart(d);
  }
  _onStart(d){ this.inGame = true; this.startInfo = d; if(this.onStart) this.onStart(d); }
  endGame(){ if(this.isHost){ this.inGame = false; this._broadcastRoster(); this._advertise(); } }
  sendState(d){
    this.stats.up++; this._send(this.aState, d);
    if(!this.isHost && this.hostId){ const peers = this.room.getPeers(), direct = this.order.filter(id => id !== selfId && id !== this.hostId && peers[id]); if(direct.length){ d.dir = 1; this.aState.send(d, { target: direct }).catch(() => {}); } }
  }
  /** ping médio ao anfitrião (ou o pior convidado se fores o anfitrião) */
  pingMs(){ const v = Object.values(this.stats.pings); if(!v.length) return null; return this.isHost ? Math.max(...v) : (this.stats.pings[this.hostId] ?? Math.min(...v)); }
  ev(d, target){ this.stats.up++; this._send(this.aEv, d, target); }
  peerCount(){ return Object.keys(this.room.getPeers()).length; }
  _close(reason){ const cb = this.onClosed; this.leave(); if(cb) cb(reason); }
  leave(){
    clearInterval(this._pingT);
    if(this.isHost) this.app.publicLobby.stopAdvertise();
    try { this.room.leave(); } catch(e){}
    this.onChange = this.onChat = this.onStart = this.onClosed = null;
  }
}
