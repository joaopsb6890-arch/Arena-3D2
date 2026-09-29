// ============================================================
// MAIN — orquestra telas (Lobby / Armário / Estúdio / Carreira /
// Config / Partida), loop de render, estatísticas, persistência.
// ============================================================
import * as THREE from 'three';
import { Renderer, QUALITY } from './engine/renderer.js';
import { setTextureResolution } from './engine/textures.js';
import { setMaterialQuality } from './engine/materials.js';
import { Audio3D } from './engine/audio.js';
import { Lobby } from './game/lobby.js';
import { Studio } from './game/studio.js';
import { Match } from './game/match.js';
import { MODES, MODE_ORDER } from './game/modes.js';
import { MapStore } from './game/creative.js';
import { MultiUI } from './net/multiui.js';
import { SKINS, BODY_TYPES } from './anim/skins.js';
import { EMOTES } from './anim/clips.js';
import { RARITY, CATS, DEFAULT_OWNED, itemInfo, dailyShop } from './game/cosmetics.js';
import { thumb, pumpThumbs } from './game/thumbs.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d){ try { const v = localStorage.getItem('fa_' + k); return v === null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem('fa_' + k, JSON.stringify(v)); } catch(e){} }
};

class App {
  constructor(){
    this.settings = Object.assign({ name: 'Jogador', skin: 'default', body: 'padrao', quality: this._autoQuality(), weather: 'limpo', time: 15, sens: 1, vol: 0.8, party: true, showStats: true, pickaxe: 'padrao', glider: 'classico', contrail: 'nuvem' }, store.get('settings', {}));
    this.career = Object.assign({ matches: 0, wins: 0, kills: 0, xp: 0, vbucks: 1500 }, store.get('career', {}));
    this.owned = new Set([...DEFAULT_OWNED, ...store.get('owned', [])]);
    this.owned.add('skin:' + this.settings.skin);
    const qp = new URLSearchParams(location.search);
    this.manual = qp.get('manual') === '1';
    if(qp.get('q')) this.settings.quality = qp.get('q');
    this.qualityName = this.settings.quality;
    setTextureResolution(QUALITY[this.qualityName].tex);
    setMaterialQuality(this.qualityName);
    this.renderer = new Renderer($('stage'));
    this.renderer.setQuality(this.qualityName);
    this.audio = Audio3D;
    this.pointerFallback = false;
    this.screen = null;
    this.renderer.onStats = (s) => this._stats(s);
    const unlock = () => { this.audio.init(); this.audio.setVolume && this.audio.setVolume(this.settings.vol); removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); };
    addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
    // falha ao bloquear o rato NÃO desativa o bloqueio para sempre (era a causa do rato "fugir" da página
    // depois de pausar): mostra "clique para continuar" e tenta de novo no próximo clique.
    document.addEventListener('pointerlockerror', () => this._lockFailed());
  }
  _autoQuality(){
    const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent) || innerWidth < 700;
    return mobile ? 'baixa' : (navigator.hardwareConcurrency || 4) >= 8 ? 'alta' : 'media';
  }
  save(){ store.set('settings', this.settings); }
  async boot(){
    this._progress(10, 'Gerando texturas PBR procedurais…');
    await tick();
    this.lobby = new Lobby(this);
    this._progress(55, 'Montando personagens e rig…');
    await tick();
    this.lobby.setPlayer(this.settings.skin, this.settings.body, this.settings.name, this.loadout());
    this.lobby.setParty(this.settings.party);
    this._progress(85, 'Compilando shaders…');
    await tick();
    this._ui();
    this.go('lobby');
    this.renderer.r.compile(this.lobby.scene, this.lobby.camera);
    this._progress(100, 'Pronto');
    setTimeout(() => { const l = $('loading'); if(l){ l.classList.add('hide'); setTimeout(() => l.style.display = 'none', 600); } }, 250);
    this._last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this._last) / 1000); this._last = now;
      this.update(dt);
    };
    // modo manual (testes automatizados): avança N passos e renderiza uma vez
    window.__simulate = (n, dt) => { dt = dt || 1 / 30; for(let i = 0; i < n; i++){ if(this.screen === 'match' && this.match) this.match.update(dt); else if(this.screen === 'studio' && this.studio) this.studio.update(dt); else this.lobby.update(dt); if(this.screen === 'shop' || this.screen === 'locker') pumpThumbs(); } this.renderer.render(dt); };
    if(!this.manual) requestAnimationFrame(loop);
  }
  _progress(p, txt){ $('load-fill').style.width = p + '%'; $('load-txt').textContent = txt; }
  setQuality(name){
    this.qualityName = name; this.settings.quality = name; this.save();
    setTextureResolution(QUALITY[name].tex);
    setMaterialQuality(name);
    this.renderer.setQuality(name);
    document.querySelectorAll('[data-set=quality]').forEach(s => s.value = name);
  }
  lockPointer(){
    const el = this.renderer.r.domElement;
    if(document.pointerLockElement === el) return;
    if(!el.requestPointerLock){ this.pointerFallback = true; return; }
    const plain = () => { try { const p2 = el.requestPointerLock(); if(p2 && p2.catch) p2.catch((e) => this._lockFailed(e)); } catch(e){ this._lockFailed(e); } };
    try {
      // unadjustedMovement: movimento cru (sem aceleração do SO) quando suportado
      const p = el.requestPointerLock({ unadjustedMovement: true });
      if(p && p.catch) p.catch((e) => { if(e && e.name === 'NotSupportedError') plain(); else this._lockFailed(e); });
    } catch(e){ plain(); }
  }
  _lockFailed(e){
    this.lockFails = (this.lockFails || 0) + 1;
    // só usa o modo sem bloqueio se o ambiente não permitir de todo (ex.: iframe sem allow-pointer-lock)
    if(this.lockFails >= 4 && e && (e.name === 'SecurityError' || e.name === 'NotSupportedError' || e.name === 'WrongDocumentError')) this.pointerFallback = true;
    this.updateLockPrompt();
  }
  onLockChange(locked){ if(locked){ this.lockFails = 0; this.pointerFallback = false; } this.updateLockPrompt(); }
  updateLockPrompt(){
    const el = $('lock-prompt'); if(!el) return;
    const m = this.match;
    const need = this.screen === 'match' && m && m.active && !m.paused && m.phase !== 'over' && !(m.creative && m.creative.menuOpen) && !this.pointerFallback && document.pointerLockElement !== this.renderer.r.domElement;
    el.classList.toggle('show', !!need);
  }
  go(screen){
    const prev = this.screen; this.screen = screen;
    document.body.dataset.screen = screen;
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.go === screen));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('show', p.id === 'panel-' + screen));
    if(prev === 'studio' && this.studio) this.studio.exit();
    if(prev === 'shop' && screen !== 'shop'){ document.body.classList.remove('trying'); $('shop-modal').classList.add('hide'); this._refreshPlayer(); }
    if(prev === 'locker' && screen !== 'locker' && this.lobby.previewGlide) this.lobby.previewGlider(null);
    if(screen === 'multi' && this.multi) this.multi.onShow();
    this.lobby.active = screen === 'multi' || screen === 'lobby' || screen === 'locker' || screen === 'shop' || screen === 'career' || screen === 'challenges' || screen === 'settings';
    if(this.lobby.active){
      this.renderer.setScene(this.lobby.scene, this.lobby.camera);
      this.renderer.r.toneMappingExposure = 1.0; this.lobby.scene.fog = null;
      this.lobby.camBase.set(screen === 'locker' ? 3.6 : screen === 'multi' ? -6 : 0, screen === 'locker' ? 4.4 : 4.7, screen === 'locker' ? 19 : screen === 'shop' ? 20 : 27);
      this.lobby.camLook.set(screen === 'locker' ? 3.6 : 0, 4.0, 0);
      if(screen === 'shop') this._shopUI();
      this.lobby.cinematic(false);
      this.lobby.setParty(screen === 'lobby' && this.settings.party);
    }
    if(screen === 'studio'){
      if(!this.studio){ this.studio = new Studio(this); this.studio.buildUI($('studio-ui')); this.studio.set('skin', this.settings.skin); }
      this.renderer.setScene(this.studio.scene, this.studio.camera);
      this.studio.enter();
    }
    this._careerUI();
  }
  startMatch(modeId, layout, session){
    modeId = modeId || this.settings.mode || 'br';
    session = session || null;
    if(!MODES[modeId]) modeId = 'br';
    this.lastStart = [modeId, layout ? JSON.parse(JSON.stringify(layout)) : null];
    $('loading').classList.remove('hide'); this._progress(20, modeId === 'creative' ? 'Preparando a ilha criativa…' : layout ? 'Montando o seu mapa…' : 'Gerando a ilha…');
    ['victory', 'defeat', 'pause-overlay'].forEach(id => $(id).classList.add('hide'));
    setTimeout(async () => {
      if(this.match){ this.match.active = false; this.match.dispose(); this.match = null; }
      if(modeId === 'creative' && !layout) layout = { name: 'Meu mapa', base: 'vazia', items: [] };
      this.match = new Match(this, modeId, layout, session);
      this._progress(70, `${MODES[modeId].name}: ${MODES[modeId].bots + 1} jogador(es)…`); await tick();
      this.match.start(this.settings.skin, this.settings.body);
      this.match.active = true;
      this.screen = 'match'; document.body.dataset.screen = 'match';
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('show'));
      this.lobby.active = false;
      this.renderer.setScene(this.match.scene, this.match.camera);
      this._progress(90, 'A preparar shaders (evita travadas)…');
      try { await this.match.warmup(this.renderer.r); } catch(e){ console.warn(e); this.renderer.r.compile(this.match.scene, this.match.camera); }
      if(this.match){ this.renderer.render(1 / 60); }
      this._progress(100, 'Pronto'); setTimeout(() => $('loading').classList.add('hide'), 200);
      this.audio.play('woosh', null, { vol: 0.6 });
    }, 60);
  }
  leaveMatch(){
    const net = this.match && this.match.session;
    if(this.match){ this.match.active = false; this.match.dispose(); this.match = null; }
    if(net && this.session){ this.session.endGame(); }
    ['victory', 'defeat', 'pause-overlay'].forEach(id => $(id).classList.add('hide'));
    document.exitPointerLock && document.exitPointerLock();
    $('letterbox').classList.remove('on');
    this.go(net && this.session ? 'multi' : 'lobby');
  }
  // ---------- seletor de modos ----------
  _modeUI(){
    const card = document.querySelector('.mode-card'), dlg = $('mode-picker');
    const paint = () => {
      const M = MODES[this.settings.mode] || MODES.br;
      card.querySelector('b').textContent = M.name.toUpperCase(); card.querySelector('.mode-txt span').textContent = M.desc;
      card.querySelector('.mode-img').style.setProperty('--mc', M.color); card.querySelector('.mode-img').dataset.short = M.short;
    };
    const list = () => {
      const maps = MapStore.all();
      $('mp-list').innerHTML = MODE_ORDER.map(k => { const M = MODES[k]; return `<button class="mp-card ${this.settings.mode === k ? 'sel' : ''}" data-mode="${k}" style="--mc:${M.color}"><div class="mp-img"><span>${M.short}</span></div><b>${M.name}</b><small>${M.desc}</small></button>`; }).join('')
        + Object.values(maps).sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 6).map(L => `<button class="mp-card map" data-map="${encodeURIComponent(L.name)}" style="--mc:#14b8a6"><div class="mp-img"><span>MAPA</span></div><b>${L.name.replace(/</g, '&lt;')}</b><small>Mapa criado · ${L.items.length} objetos · mata-mata livre</small></button>`).join('');
    };
    card.addEventListener('click', () => { list(); dlg.classList.remove('hide'); this.audio.play('ui', null, { vol: 0.4 }); });
    $('mp-close').addEventListener('click', () => dlg.classList.add('hide'));
    $('mp-list').addEventListener('click', (e) => {
      const b = e.target.closest('.mp-card'); if(!b) return;
      dlg.classList.add('hide'); this.audio.play('ui', null, { vol: 0.5 });
      if(b.dataset.map){ const L = MapStore.get(decodeURIComponent(b.dataset.map)); if(L) this.startMatch('custom', JSON.parse(JSON.stringify(L))); return; }
      this.settings.mode = b.dataset.mode; this.saveSettings && this.saveSettings(); try { localStorage.setItem('fa_mode', b.dataset.mode); } catch(err){}
      paint();
    });
    this.settings.mode = localStorage.getItem('fa_mode') || this.settings.mode || 'br';
    paint();
  }
  loadout(){ return { pickaxe: this.settings.pickaxe, glider: this.settings.glider, contrail: this.settings.contrail }; }
  saveResult(r){
    const vb = 50 + r.kills * 25 + (r.win ? 250 : 0);
    this.career.vbucks = (this.career.vbucks || 0) + vb; this.lastReward = vb;
    this.career.matches++; if(r.win) this.career.wins++; this.career.kills += r.kills;
    this.career.xp += 120 + r.kills * 60 + (r.win ? 600 : 0);
    store.set('career', this.career);
  }
  update(dt){
    if(this.screen === 'match' && this.match){ this.match.update(dt); }
    else if(this.screen === 'studio' && this.studio){ this.studio.update(dt); }
    else if(this.lobby){ this.lobby.update(dt); }
    this.renderer.render(dt);
    if(this.screen === 'shop' || this.screen === 'locker') pumpThumbs();
  }
  _stats(s){
    const el = $('stats'); if(!el) return;
    el.classList.toggle('hide', !this.settings.showStats);
    el.innerHTML = `<b class="${s.fps >= 55 ? 'ok' : s.fps >= 40 ? 'mid' : 'bad'}">${s.fps.toFixed(0)} FPS</b><span>${s.ms.toFixed(1)} ms</span><span>${s.calls} draws</span><span>${(s.tris / 1000).toFixed(0)}k tris</span><span>${QUALITY[this.qualityName].label} · ${s.pr.toFixed(2)}x</span>`;
  }
  _careerUI(){
    const c = this.career, lvl = 1 + Math.floor(c.xp / 1000), p = (c.xp % 1000) / 10;
    $('lvl-num').textContent = lvl; $('xp-fill').style.width = p + '%';
    $('vb-num').textContent = (c.vbucks || 0).toLocaleString('pt-PT');
    const el = $('career-stats');
    if(el) el.innerHTML = [['Partidas', c.matches], ['Vitórias', c.wins], ['Abates', c.kills], ['Nível', lvl], ['Taxa de vitória', c.matches ? Math.round(c.wins / c.matches * 100) + '%' : '—'], ['XP total', c.xp]].map(([k, v]) => `<div class="cs"><b>${v}</b><span>${k}</span></div>`).join('');
  }
  // ---------- cosméticos ----------
  _card(id, opts){
    const it = itemInfo(id); if(!it) return '';
    const owned = this.owned.has(id), eq = this._isEquipped(id);
    const sw = it.cat === 'contrail' ? `<div class="sw" style="background:${({ nenhum: 'transparent', nuvem: 'linear-gradient(90deg,#fff0,#fff)', arcoiris: 'linear-gradient(90deg,#ef4444,#f59e0b,#22c55e,#3b82f6,#a855f7)', fogo: 'linear-gradient(90deg,#fde04700,#f97316,#dc2626)', estrelas: 'radial-gradient(circle,#fde047 2px,transparent 3px) 0 0/14px 14px', raios: 'linear-gradient(90deg,#60a5fa00,#93c5fd,#1d4ed8)', coracoes: 'radial-gradient(circle,#f472b6 3px,transparent 4px) 0 0/14px 14px,#fce7f3', fumaca: 'linear-gradient(90deg,#33415500,#334155,#0f172a)', neve: 'radial-gradient(circle,#fff 2px,transparent 3px) 0 0/10px 10px,#bae6fd', toxico: 'linear-gradient(90deg,#84cc1600,#bef264,#3f6212)', galaxia: 'radial-gradient(circle,#fff 1px,transparent 2px) 0 0/9px 9px,linear-gradient(90deg,#1e1b4b,#a855f7,#ec4899)' })[it.key]}"></div>` : it.cat === 'emote' ? '<div class="ph">♪</div>' : '<div class="ph">…</div>';
    const price = opts && opts.shop ? `<span class="price">${owned ? '<b class="owned">ADQUIRIDO</b>' : `<i></i>${it.price.toLocaleString('pt-PT')}`}</span>` : '';
    return `<button class="item ${eq && !(opts && opts.shop) ? 'sel' : ''} ${!owned && !(opts && opts.shop) ? 'locked' : ''}" data-id="${id}" style="--r1:${it.r.color};--r2:${it.r.c2}">${sw}<img data-thumb="${id}" alt="" style="display:none"><span class="nm"><small>${it.r.label} · ${CATS[it.cat].label}</small>${it.name}${price}</span></button>`;
  }
  _fillThumbs(root){
    root.querySelectorAll('img[data-thumb]').forEach(img => { const id = img.dataset.thumb; if(!['skin', 'pickaxe', 'glider'].includes(id.split(':')[0])) return; thumb(id, (url) => { if(url){ img.src = url; img.style.display = 'block'; const ph = img.parentNode.querySelector('.ph'); if(ph) ph.remove(); } }); });
  }
  _isEquipped(id){
    const [cat, key] = id.split(':');
    return cat === 'emote' ? false : this.settings[cat] === key;
  }
  _lockerUI(){
    const cat = this.lockerCat, g = $('locker-grid');
    let ids;
    if(cat === 'emote') ids = EMOTES.map(e => e.shop ? 'emote:' + e.id : 'emote-base:' + e.id);
    else ids = Object.keys(CATS[cat].list()).map(k => cat + ':' + k);
    // itens possuídos primeiro
    ids.sort((a, b) => (this.owned.has(b) || b.startsWith('emote-base')) - (this.owned.has(a) || a.startsWith('emote-base')));
    g.innerHTML = ids.map(id => id.startsWith('emote-base:') ? `<button class="item" data-id="${id}" style="--r1:#8a94a6;--r2:#5b6474"><div class="ph">♪</div><span class="nm"><small>Comum · Emote</small>${EMOTES.find(e => e.id === id.split(':')[1]).label}</span></button>` : this._card(id)).join('');
    $('locker-extra').style.display = cat === 'skin' ? 'block' : 'none';
    this._fillThumbs(g);
  }
  _refreshPlayer(){ this.lobby.setPlayer(this.settings.skin, this.settings.body, this.settings.name, this.loadout()); }
  _equip(id){
    const [cat, key] = id.split(':');
    this.audio.play('ui', null, { vol: 0.4 });
    if(cat === 'emote-base'){ this.lobby.playEmote(key); this.settings.emote = key; this.save(); this.toastUI('Emote equipado — tecla B na partida'); return; }
    if(!this.owned.has(id)){ this._tryOn(id); this.toastUI(`${itemInfo(id).name} está na loja`); return; }
    if(cat === 'emote'){ this.lobby.playEmote(key); if(this.owned.has(id)){ this.settings.emote = key; this.save(); this.toastUI('Emote equipado — tecla B na partida'); } return; }
    this.settings[cat] = key; this.save();
    if(cat === 'skin'){ this._refreshPlayer(); }
    else if(cat === 'pickaxe'){ this.lobby.loadout = this.loadout(); this.lobby.setPickaxeStyle(key); }
    else if(cat === 'glider'){ this.lobby.previewGlider(key); }
    else if(cat === 'contrail'){ this.lobby.previewGlider(this.settings.glider); }
    this._lockerUI();
  }
  _tryOn(id){
    const [cat, key] = id.split(':');
    if(cat === 'skin') this.lobby.setPlayer(key, this.settings.body, this.settings.name, this.loadout());
    else if(cat === 'pickaxe') this.lobby.setPickaxeStyle(key);
    else if(cat === 'glider') this.lobby.previewGlider(key);
    else if(cat === 'emote') this.lobby.playEmote(key);
  }
  _shopUI(){
    const sh = dailyShop();
    $('shop-featured').innerHTML = sh.featured.map(id => this._card(id, { shop: true })).join('');
    $('shop-daily').innerHTML = sh.daily.map(id => this._card(id, { shop: true })).join('');
    this._fillThumbs($('shop-featured')); this._fillThumbs($('shop-daily'));
  }
  _shopModal(id){
    const it = itemInfo(id); this.shopSel = id;
    const m = $('shop-modal'); m.classList.remove('hide');
    m.querySelector('.sm-img').style.cssText = `--r1:${it.r.color};--r2:${it.r.c2}`; $('sm-rar').style.cssText = `--r1:${it.r.color}`;
    $('sm-rar').textContent = it.r.label; $('sm-name').textContent = it.name; $('sm-cat').textContent = CATS[it.cat].label;
    const img = $('sm-img'); img.removeAttribute('src'); img.style.display = 'none';
    if(['skin', 'pickaxe', 'glider'].includes(it.cat)) thumb(id, (u) => { if(u && this.shopSel === id){ img.src = u; img.style.display = 'block'; } });
    const owned = this.owned.has(id), vb = this.career.vbucks || 0;
    const btn = $('sm-buy');
    btn.textContent = owned ? 'ADQUIRIDO' : vb < it.price ? `FALTAM ${(it.price - vb).toLocaleString('pt-PT')} V-BUCKS` : `COMPRAR · ${it.price.toLocaleString('pt-PT')}`;
    btn.disabled = owned || vb < it.price;
    $('sm-try').style.display = it.cat === 'contrail' ? 'none' : '';
    this.audio.play('ui', null, { vol: 0.4, rate: 1.2 });
  }
  _buy(id){
    const it = itemInfo(id); if(!it || this.owned.has(id) || (this.career.vbucks || 0) < it.price) return;
    this.career.vbucks -= it.price; store.set('career', this.career);
    this.owned.add(id); store.set('owned', [...this.owned].filter(x => !DEFAULT_OWNED.includes(x)));
    if(it.cat !== 'emote'){ this.settings[it.cat] = it.key; this.save(); }
    this.audio.play('chest', null, { vol: 0.8 });
    $('shop-modal').classList.add('hide');
    this._refreshPlayer();
    if(it.cat === 'glider') this.lobby.previewGlider(it.key); else if(it.cat === 'emote') this.lobby.playEmote(it.key); else this.lobby.player.anim.play('celebrate');
    this.lobby.particles.emit('confetti', new THREE.Vector3(0, 8, 0), { n: 60 });
    this._careerUI(); this._shopUI(); this._lockerUI();
    this.toastUI(`${it.name} adquirido e equipado`);
  }
  toastUI(msg){ const t = $('ui-toast'); if(!t) return; t.textContent = msg; t.className = 'show'; clearTimeout(this._tt); this._tt = setTimeout(() => t.className = '', 2400); }
  _ui(){
    // navegação
    document.querySelectorAll('.nav-tab').forEach(t => t.addEventListener('click', () => { this.audio.play('ui', null, { vol: 0.3 }); this.go(t.dataset.go); }));
    $('play-btn').addEventListener('click', () => { this.audio.play('ui', null, { vol: 0.5, rate: 0.8 }); this.startMatch(); });
    $('cine-btn').addEventListener('click', () => { const on = !this.lobby.director.active; this.lobby.cinematic(on); $('cine-btn').classList.toggle('on', on); });
    $('player-name').textContent = this.settings.name;
    // armário (abas por categoria) + loja
    this.lockerCat = 'skin';
    $('locker-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if(!b) return; this.lockerCat = b.dataset.cat; $('locker-tabs').querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b)); this._lockerUI(); this.audio.play('ui', null, { vol: 0.3 }); });
    $('locker-grid').addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if(b) this._equip(b.dataset.id); });
    const bt = $('body-grid');
    bt.innerHTML = Object.entries(BODY_TYPES).map(([k, b]) => `<button class="chip ${k === this.settings.body ? 'sel' : ''}" data-body="${k}">${b.label}</button>`).join('');
    bt.addEventListener('click', (e) => { const b = e.target.closest('[data-body]'); if(!b) return; bt.querySelectorAll('.chip').forEach(x => x.classList.toggle('sel', x === b)); this.settings.body = b.dataset.body; this.save(); this._refreshPlayer(); });
    this._lockerUI();
    this._shopUI();
    $('shop-featured').addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if(b) this._shopModal(b.dataset.id); });
    $('shop-daily').addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if(b) this._shopModal(b.dataset.id); });
    $('sm-close').addEventListener('click', () => { $('shop-modal').classList.add('hide'); this._refreshPlayer(); });
    $('sm-try').addEventListener('click', () => { this._tryOn(this.shopSel); $('shop-modal').classList.add('hide'); document.body.classList.add('trying'); });
    $('shop-back').addEventListener('click', () => { document.body.classList.remove('trying'); this._refreshPlayer(); this._shopModal(this.shopSel); });
    $('sm-buy').addEventListener('click', () => this._buy(this.shopSel));
    setInterval(() => { if(this.screen === 'shop'){ const t = dailyShop().resetsIn / 1000; $('shop-reset').textContent = `Nova loja em ${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${String(Math.floor(t) % 60).padStart(2, '0')}`; } }, 1000);
    // configurações
    const qs = $('set-quality'); qs.innerHTML = Object.entries(QUALITY).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join(''); qs.value = this.qualityName;
    qs.addEventListener('change', () => this.setQuality(qs.value));
    const bind = (id, key, fn) => { const el = $(id); if(el.type === 'checkbox') el.checked = !!this.settings[key]; else el.value = this.settings[key]; el.addEventListener(el.type === 'text' ? 'change' : 'input', () => { this.settings[key] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value; this.save(); fn && fn(this.settings[key]); }); };
    bind('set-name', 'name', (v) => { $('player-name').textContent = v; this.lobby.playerName = v; });
    bind('set-sens', 'sens'); bind('set-vol', 'vol', (v) => this.audio.setVolume && this.audio.setVolume(v));
    bind('set-weather', 'weather'); bind('set-time', 'time');
    bind('set-party', 'party', (v) => this.lobby.setParty(v && this.screen === 'lobby'));
    bind('set-stats', 'showStats');
    // partida
    $('btn-resume').addEventListener('click', () => { if(this.match && this.match.paused) this.match.togglePause(); this.lockPointer(); });
    $('lock-prompt').addEventListener('click', () => this.lockPointer());
    $('btn-leave').addEventListener('click', () => this.leaveMatch());
    document.querySelectorAll('.btn-lobby').forEach(b => b.addEventListener('click', () => this.leaveMatch()));
    document.querySelectorAll('.btn-again').forEach(b => b.addEventListener('click', () => {
      if(this.match && this.match.session){ const s = this.session; this.leaveMatch(); if(s && s.isHost) setTimeout(() => s.start(), 300); return; }
      const ls = this.lastStart || []; this.leaveMatch(); this.startMatch(ls[0], ls[1]);
    }));
    this.multi = new MultiUI(this);
    this._modeUI();
    addEventListener('keydown', (e) => { if(e.code === 'F8'){ this.settings.showStats = !this.settings.showStats; this.save(); } });
  }
}
const tick = () => new Promise(r => setTimeout(r, 16));
window.__THREE = THREE;
const app = window.__app = new App();
app.boot().catch(e => { console.error(e); $('load-txt').textContent = 'Erro: ' + e.message; });
