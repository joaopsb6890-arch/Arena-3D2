// ============================================================
// UI DO MULTIJOGADOR — aba "MULTIJOGADOR" do lobby:
//  navegador de salas públicas, entrar por código/link, criar sala,
//  sala de espera (jogadores, ping, chat, definições do anfitrião).
// ============================================================
import { PublicLobby, NetSession, genCode, NET_MODES, selfId } from './net.js';
import { MODES } from '../game/modes.js';
import { MapStore } from '../game/creative.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class MultiUI {
  constructor(app){
    this.app = app; this.session = null;
    app.publicLobby = new PublicLobby();
    app.MODES = MODES;
    this._build();
    // link direto: ?sala=CODIGO
    const code = new URLSearchParams(location.search).get('sala');
    if(code) setTimeout(() => { this.app.go('multi'); this.join(code); }, 400);
  }
  profile(){ const s = this.app.settings; return { name: s.name || 'Jogador', skin: s.skin, body: s.body, loadout: this.app.loadout() }; }
  _build(){
    $('mp-mode').innerHTML = NET_MODES.map(k => `<option value="${k}">${MODES[k].name}</option>`).join('') + `<option value="custom">Mapa criado (Criativo)</option>`;
    $('mp-create').onclick = () => this.create();
    $('mp-join').onclick = () => this.join($('mp-code').value);
    $('mp-code').onkeydown = (e) => { if(e.key === 'Enter') this.join($('mp-code').value); };
    $('mp-refresh').onclick = () => { this.app.publicLobby.open(); this._list(); };
    $('mp-rooms').onclick = (e) => { const b = e.target.closest('[data-code]'); if(b) this.join(b.dataset.code); };
    $('mr-leave').onclick = () => this.leave();
    $('mr-start').onclick = () => this.startGame();
    $('mr-copy').onclick = () => { const url = location.href.split('?')[0].split('#')[0] + '?sala=' + this.session.code; navigator.clipboard && navigator.clipboard.writeText(url).then(() => this.app.toastUI('Link da sala copiado'), () => this.app.toastUI('Código: ' + this.session.code)); };
    $('mr-chat-form').onsubmit = (e) => { e.preventDefault(); const i = $('mr-chat-in'); if(this.session){ this.session.say(i.value); i.value = ''; } };
    ['mr-set-mode', 'mr-set-bots', 'mr-set-public', 'mr-set-max'].forEach(id => $(id).onchange = () => this._hostSettings());
    $('mr-set-mode').innerHTML = $('mp-mode').innerHTML;
    this.app.publicLobby.on(() => this._list());
    this._list();
    this._view();
  }
  onShow(){ this.app.publicLobby.open(); this._list(); this._view(); }
  _list(){
    const el = $('mp-rooms'); if(!el) return;
    const rooms = this.app.publicLobby.list();
    const st = $('mp-status');
    if(st) st.textContent = this.app.publicLobby.room ? `Canal público ativo · ${this.app.publicLobby.peers} navegador(es) ligado(s) · ${rooms.length} sala(s)` : 'A ligar ao canal público…';
    el.innerHTML = rooms.length ? rooms.map(r => `<div class="mp-room ${r.inGame ? 'busy' : ''}"><div><b>${esc(r.name)}</b><small>${esc(MODES[r.mode] ? MODES[r.mode].name : r.mode)} · anfitrião ${esc(r.host)}</small></div><span class="mp-n">${r.n}/${r.max}</span>${r.inGame ? '<em>EM JOGO</em>' : `<button data-code="${esc(r.code)}" ${r.n >= r.max ? 'disabled' : ''}>ENTRAR</button>`}</div>`).join('')
      : '<p class="mp-empty">Nenhuma sala pública aberta agora. Crie uma e partilhe o link com os seus amigos — as salas aparecem aqui em poucos segundos.</p>';
  }
  create(){
    if(this.session) return;
    const mode = $('mp-mode').value;
    let layout = null;
    if(mode === 'custom'){
      const maps = Object.values(MapStore.all()).sort((a, b) => (b.t || 0) - (a.t || 0));
      if(!maps.length){ this.app.toastUI('Crie e salve um mapa no Modo Criativo primeiro'); return; }
      layout = { name: maps[0].name, base: maps[0].base, items: maps[0].items };
    }
    const settings = { name: ($('mp-name').value.trim() || `Sala de ${this.app.settings.name}`).slice(0, 28), mode, public: $('mp-public').checked, max: Math.min(8, Math.max(2, +$('mp-max').value || 8)), bots: $('mp-bots').checked, layout };
    if(mode === 'duel') settings.max = 2;
    this._attach(new NetSession(this.app, { code: genCode(), host: true, settings, profile: this.profile() }));
    this.session._pushChat({ sys: true, text: `Sala criada. Código ${this.session.code} — partilhe o link para os seus amigos entrarem.` });
  }
  join(code){
    code = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if(!code){ this.app.toastUI('Escreva o código da sala'); return; }
    if(this.session){ if(this.session.code === code) return; this.leave(); }
    this._attach(new NetSession(this.app, { code, host: false, profile: this.profile() }));
    this.session._pushChat({ sys: true, text: `A procurar a sala ${code}… (a ligação P2P pode levar alguns segundos)` });
    clearTimeout(this._joinT);
    this._joinT = setTimeout(() => { if(this.session && this.session.code === code && !this.session.hostId){ this.session._pushChat({ sys: true, text: 'Ainda sem resposta do anfitrião. Confirme o código ou peça-lhe para manter a sala aberta.' }); } }, 15000);
  }
  _attach(s){
    this.session = s; this.app.session = s;
    s.onChange = () => this._view();
    s.onChat = (m) => { this._chat(); const mt = this.app.match; if(mt && mt.session && m && !m.me) mt.chatLine(m); };
    s.onStart = (d) => this._onStart(d);
    s.onClosed = (reason) => { this.session = null; this.app.session = null; this.app.toastUI(reason); if(this.app.match && this.app.match.session){ this.app.match.toast(reason); setTimeout(() => this.app.leaveMatch(), 1500); } this._view(); };
    this._view(); this._chat();
  }
  leave(){
    if(!this.session) return;
    this.session.leave(); this.session = null; this.app.session = null;
    this._view();
  }
  startGame(){
    const s = this.session; if(!s || !s.isHost) return;
    if(s.settings.mode === 'custom' && !s.settings.layout){ this.app.toastUI('Sem mapa'); return; }
    s.start();
  }
  _onStart(d){
    const layout = d.mode === 'custom' ? d.layout : null;
    this.app.startMatch(d.mode, layout, this.session);
  }
  _hostSettings(){
    const s = this.session; if(!s || !s.isHost) return;
    const mode = $('mr-set-mode').value; let layout = s.settings.layout;
    if(mode === 'custom' && !layout){ const maps = Object.values(MapStore.all()); if(maps[0]) layout = { name: maps[0].name, base: maps[0].base, items: maps[0].items }; }
    s.setSettings({ mode, bots: $('mr-set-bots').checked, public: $('mr-set-public').checked, max: mode === 'duel' ? 2 : +$('mr-set-max').value, layout });
  }
  _view(){
    const s = this.session;
    $('mp-browse').classList.toggle('hide', !!s); $('mp-room').classList.toggle('hide', !s);
    if(!s) return;
    $('mr-code').textContent = s.code;
    $('mr-title').textContent = s.settings.name || 'Sala';
    const M = MODES[s.settings.mode] || MODES.tdm;
    $('mr-mode').textContent = M.name + (s.settings.layout ? ` · ${s.settings.layout.name}` : '');
    const ready = s.isHost || !!s.hostId;
    $('mr-state').textContent = !ready ? 'A LIGAR…' : s.inGame ? 'PARTIDA EM ANDAMENTO' : s.isHost ? 'VOCÊ É O ANFITRIÃO' : 'À ESPERA DO ANFITRIÃO';
    const players = s.order.map(id => s.roster.get(id)).filter(Boolean);
    $('mr-players').innerHTML = players.map(p => `<li class="${p.id === selfId ? 'me' : ''}"><i style="--c:${colorOf(p.id)}"></i><b>${esc(p.name)}</b>${p.host ? '<em>ANFITRIÃO</em>' : ''}<span>${p.id === selfId ? 'você' : (s.stats.pings[p.id] !== undefined ? s.stats.pings[p.id] + ' ms' : '…')}</span></li>`).join('')
      + Array.from({ length: Math.max(0, s.settings.max - players.length) }, () => `<li class="empty"><i></i><b>${s.settings.bots ? 'bot' : 'vago'}</b></li>`).join('');
    $('mr-count').textContent = `${players.length}/${s.settings.max}`;
    const host = s.isHost;
    $('mr-host').classList.toggle('hide', !host);
    $('mr-start').classList.toggle('hide', !host);
    $('mr-start').disabled = s.inGame;
    $('mr-wait').classList.toggle('hide', host);
    if(host){ $('mr-set-mode').value = s.settings.mode; $('mr-set-bots').checked = !!s.settings.bots; $('mr-set-public').checked = !!s.settings.public; $('mr-set-max').value = String(s.settings.max); }
  }
  _chat(){
    const s = this.session, el = $('mr-chat'); if(!el) return;
    el.innerHTML = s ? s.chat.map(m => m.sys ? `<p class="sys">${esc(m.text)}</p>` : `<p class="${m.me ? 'me' : ''}"><b>${esc(m.from)}:</b> ${esc(m.text)}</p>`).join('') : '';
    el.scrollTop = el.scrollHeight;
  }
}
function colorOf(id){ let h = 0; for(const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 80% 60%)`; }
