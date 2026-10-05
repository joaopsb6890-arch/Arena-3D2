// ============================================================
// v22: MENU MULTIJOGADOR — separadores Solo / Duo / Squad / Criativo / Eventos,
// botão JOGAR animado, região + modo + bots (ligados = joga já com bots; desligados = fila só com pessoas),
// amigos (guardados no dispositivo) com convite, ping real, transições e comando (Gamepad API)
// ============================================================
import { MODES } from '../game/modes.js';
import { MM_MODES, REGIONS, autoRegion } from './matchmaking.js';
import { ltmToday, ltmNextIn } from '../game/modes22.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TABS = {
  solo:     ['br', 'zb', 'a1', 'gun', 'blitz', 'duel'],
  duo:      ['br_duo', 'zb_duo', 'a2'],
  squad:    ['br_squad', 'zb_squad', 'rumble', 'tdm', 'zumbis'],
  creative: ['creative', 'corrida', 'custom'],
  events:   ['ltm', 'torneio', 'zumbis', 'corrida']
};
const get = (k, d) => { try { const v = localStorage.getItem('fa_' + k); return v ? JSON.parse(v) : d; } catch(e){ return d; } };
const set = (k, v) => { try { localStorage.setItem('fa_' + k, JSON.stringify(v)); } catch(e){} };
export function myUid(){ let u = get('uid', null); if(!u){ u = 'u' + Math.random().toString(36).slice(2, 12); set('uid', u); } return u; }

export class MpMenu {
  constructor(ui){
    this.ui = ui; this.app = ui.app; this.hub = ui.hub;
    const st = get('mpx', {}); this.tab = st.tab || 'solo'; this.mode = st.mode || 'br'; this.region = st.region || 'auto'; this.bots = !!st.bots;
    this.friends = get('friends', []);
    this._build(); this._gamepad();
  }
  _save(){ set('mpx', { tab: this.tab, mode: this.mode, region: this.region, bots: this.bots }); }
  _build(){
    $('mpx-region').innerHTML = Object.entries(REGIONS).map(([k, n]) => `<option value="${k}">${n}${k === 'auto' ? ' (' + REGIONS[autoRegion()] + ')' : ''}</option>`).join('');
    $('mpx-region').value = this.region; $('mpx-region').onchange = (e) => { this.region = e.target.value; this._save(); this._paint(); };
    $('mpx-bots').checked = this.bots; $('mpx-bots').onchange = (e) => { this.bots = e.target.checked; this._save(); this._paint(); };
    $('mpx-tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if(b) this.setTab(b.dataset.tab); };
    $('mpx-modes').onclick = (e) => { const b = e.target.closest('[data-m]'); if(!b) return; this.mode = b.dataset.m; this._save(); this._paint(); this.app.audio.play('ui', null, { vol: 0.4 }); };
    $('mpx-modes').ondblclick = () => this.play();
    $('mpx-play').onclick = () => this.play();
    $('hub-tabs').onclick = (e) => { const b = e.target.closest('[data-ht]'); if(!b) return; [...$('hub-tabs').children].forEach(x => x.classList.toggle('on', x === b)); $('hub-list').classList.toggle('hide', b.dataset.ht !== 'online'); $('fr-list').classList.toggle('hide', b.dataset.ht !== 'friends'); this.friendsView(); };
    $('fr-list').onclick = (e) => {
      const inv = e.target.closest('[data-finv]'), rm = e.target.closest('[data-frm]');
      if(rm){ this.friends = this.friends.filter(f => f.uid !== rm.dataset.frm); set('friends', this.friends); this.friendsView(); return; }
      if(inv) this.inviteFriend(inv.dataset.finv, inv);
    };
    this.hub.on(() => this.friendsView());
    this.setTab(this.tab, true);
    // ping: mede de 3 em 3 s enquanto o painel está aberto
    setInterval(() => this._ping(), 3000);
  }
  setTab(t, quiet){
    if(!TABS[t]) t = 'solo'; this.tab = t;
    [...$('mpx-tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    if(!TABS[t].includes(this.mode)) this.mode = TABS[t][0];
    const box = $('mpx-modes'); box.classList.remove('in'); void box.offsetWidth; box.classList.add('in');
    this._save(); this._paint(); if(!quiet) this.app.audio.play('ui', null, { vol: 0.35 });
  }
  _desc(k){ if(k === 'ltm'){ const L = ltmToday(); return L.n + ' · ' + L.d + ' · muda em ' + ltmNextIn(); } if(k === 'custom') return 'Os teus mapas do Modo Criativo'; return (MODES[k] || {}).desc || ''; }
  _paint(){
    const list = TABS[this.tab];
    $('mpx-modes').innerHTML = list.map((k, i) => { const M = MODES[k] || { name: 'Mapa criado', short: 'MAPA', color: '#14b8a6' }; const mm = MM_MODES[k];
      return `<button data-m="${k}" class="${k === this.mode ? 'sel' : ''}" style="--mc:${M.color};--i:${i}"><i>${esc(M.short)}</i><b>${esc(M.name)}</b><small>${esc(this._desc(k))}</small>${mm ? `<em>${mm.min === mm.max ? mm.min : mm.min + '–' + mm.max} pessoas</em>` : '<em>local</em>'}</button>`; }).join('');
    const M = MODES[this.mode] || { name: 'Mapa criado' }, canMM = !!MM_MODES[this.mode];
    const bots = this.bots || !canMM;
    $('mpx-bots-lab').textContent = bots ? 'ligados' : 'desligados';
    $('mpx-bots').disabled = !canMM;
    $('mpx-play-sub').textContent = M.name + ' · ' + (this.ui.session ? 'com a tua sala' : bots ? (this.mode === 'corrida' ? 'contra o relógio' : 'com bots, já') : 'só pessoas · ' + REGIONS[this.region === 'auto' ? autoRegion() : this.region]);
    $('mpx-play').style.setProperty('--mc', M.color || '#facc15');
  }
  async _ping(){
    if(this.app.screen !== 'multi') return;
    let ms = null;
    if(this.ui.session && this.ui.session.pingMs) ms = this.ui.session.pingMs();
    if(ms == null && this.hub.measurePing) ms = await this.hub.measurePing();
    const el = $('mpx-ping'); if(!el) return;
    el.querySelector('span').textContent = ms == null ? (this.hub.list().length ? 'a medir…' : 'sem pares') : ms + ' ms';
    el.className = 'mpx-ping ' + (ms == null ? '' : ms < 70 ? 'good' : ms < 140 ? 'mid' : 'bad');
  }
  play(){
    const k = this.mode, app = this.app, ui = this.ui;
    const b = $('mpx-play'); b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
    app.audio.play('woosh', null, { vol: 0.6 });
    if(k === 'custom'){ app.go('lobby'); setTimeout(() => document.querySelector('.mode-card') && document.querySelector('.mode-card').click(), 300); return; }
    // dentro de uma sala com amigos: o anfitrião muda o modo e inicia
    if(ui.session){ if(ui.session.isHost){ if(MODES[k] && k !== 'custom'){ $('mr-set-mode').value = k; ui._hostSettings(); } setTimeout(() => ui.startGame(), 150); } else app.toastUI('Só o anfitrião da sala pode iniciar'); return; }
    if(this.bots || !MM_MODES[k]){ this._fadeTo(() => app.startMatch(k)); return; }
    ui.queue(k, this.region);
  }
  _fadeTo(fn){ const f = document.createElement('div'); f.className = 'mpx-fade'; document.body.appendChild(f); requestAnimationFrame(() => f.classList.add('on')); setTimeout(() => { fn(); setTimeout(() => { f.classList.remove('on'); setTimeout(() => f.remove(), 400); }, 200); }, 320); }
  // ---------------- amigos ----------------
  addFriend(p){ if(!p.uid || this.friends.some(f => f.uid === p.uid)) return; this.friends.push({ uid: p.uid, name: p.name, t: Date.now() }); set('friends', this.friends); this.app.toastUI(p.name + ' adicionado aos amigos'); this.friendsView(); }
  friendsView(){
    const L = $('fr-list'); if(!L) return; const online = this.hub.list();
    $('fr-count').textContent = String(this.friends.length);
    L.innerHTML = this.friends.length ? this.friends.map(f => { const p = online.find(o => o.uid === f.uid); if(p && p.name !== f.name){ f.name = p.name; }
      return `<li class="${p ? 'on' : 'off'}"><b>${esc(f.name)}</b><small>${p ? esc(p.st) + (p.ping ? ' · ' + p.ping + ' ms' : '') : 'offline'}</small>${p ? `<button data-finv="${esc(f.uid)}">CONVIDAR</button>` : ''}<button class="x" data-frm="${esc(f.uid)}" title="Remover">×</button></li>`; }).join('')
      : '<li class="empty">Ainda não tens amigos. No separador ONLINE carrega em + AMIGO ao lado de um jogador.</li>';
  }
  inviteFriend(uid, btn){
    const p = this.hub.list().find(o => o.uid === uid); if(!p) return;
    const send = () => { this.hub.invite(p.id, this.ui.session.code, this.ui.session.settings.mode); if(btn){ btn.textContent = 'ENVIADO'; btn.disabled = true; } this.app.toastUI('Convite enviado a ' + p.name); };
    if(this.ui.session) send();
    else { // cria uma sala privada com o modo escolhido e convida
      $('mp-mode').value = MODES[this.mode] && !MODES[this.mode].creative ? this.mode : 'br'; $('mp-public').checked = false; $('mp-bots').checked = this.bots; $('mp-name').value = 'Sala de ' + (this.app.settings.name || 'Jogador');
      this.ui.create(); setTimeout(() => { if(this.ui.session) send(); }, 900);
    }
  }
  // ---------------- comando (Gamepad API) ----------------
  _gamepad(){
    let prev = {}, rep = 0;
    const loop = () => {
      requestAnimationFrame(loop);
      const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []; if(!pads.length) return;
      const g = pads[0], btn = (i) => !!(g.buttons[i] && g.buttons[i].pressed);
      if(this.app.screen === 'match') return;   // durante o jogo o comando é tratado pelo match
      const ax = g.axes[0] || 0, ay = g.axes[1] || 0;
      const dir = btn(12) || ay < -0.6 ? 'up' : btn(13) || ay > 0.6 ? 'down' : btn(14) || ax < -0.6 ? 'left' : btn(15) || ax > 0.6 ? 'right' : null;
      const now = performance.now();
      if(dir && (dir !== prev.dir || now > rep)){ rep = now + (dir === prev.dir ? 140 : 380); this._move(dir); }
      prev.dir = dir;
      const edge = (i) => btn(i) && !prev['b' + i];
      if(edge(0)){ const a = document.activeElement; if(a && a !== document.body) a.click(); }
      if(edge(1)){ document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); const back = document.querySelector('.panel.show .back, .panel.show [data-go="lobby"]'); if(back) back.click(); }
      if(this.app.screen === 'multi'){ const T = Object.keys(TABS), i = T.indexOf(this.tab); if(edge(4)) this.setTab(T[(i + T.length - 1) % T.length]); if(edge(5)) this.setTab(T[(i + 1) % T.length]); if(edge(9)) this.play(); }
      for(let i = 0; i < 16; i++) prev['b' + i] = btn(i);
    };
    requestAnimationFrame(loop);
    window.addEventListener('gamepadconnected', () => this.app.toastUI && this.app.toastUI('Comando ligado'));
  }
  /** navegação espacial: escolhe o elemento focável mais próximo na direção pedida */
  _move(dir){
    const root = document.querySelector('.panel.show') || document.body;
    const els = [...root.querySelectorAll('button:not([disabled]), select, input, [tabindex="0"]')].filter(e => e.offsetParent !== null);
    if(!els.length) return;
    const cur = document.activeElement && els.includes(document.activeElement) ? document.activeElement : null;
    if(!cur){ els[0].focus(); return; }
    const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bd = 1e9;
    for(const e of els){ if(e === cur) continue; const q = e.getBoundingClientRect(), x = q.left + q.width / 2 - cx, y = q.top + q.height / 2 - cy;
      const ok = dir === 'up' ? y < -4 : dir === 'down' ? y > 4 : dir === 'left' ? x < -4 : x > 4; if(!ok) continue;
      const d = (dir === 'up' || dir === 'down') ? Math.abs(y) + Math.abs(x) * 2.5 : Math.abs(x) + Math.abs(y) * 2.5; if(d < bd){ bd = d; best = e; } }
    if(best){ best.focus(); best.scrollIntoView({ block: 'nearest' }); this.app.audio.play('ui', null, { vol: 0.2, rate: 1.4 }); }
  }
}
