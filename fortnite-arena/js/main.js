// ============================================================
// MAIN — orquestra telas (Lobby / Armário / Estúdio / Carreira /
// Config / Partida), loop de render, estatísticas, persistência.
// ============================================================
import * as THREE from 'three';
import { Renderer, QUALITY } from './engine/renderer.js';
import { setTextureResolution } from './engine/textures.js';
import { Audio3D } from './engine/audio.js';
import { Lobby } from './game/lobby.js';
import { Studio } from './game/studio.js';
import { Match } from './game/match.js';
import { SKINS, BODY_TYPES } from './anim/skins.js';
import { EMOTES } from './anim/clips.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d){ try { const v = localStorage.getItem('fa_' + k); return v === null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem('fa_' + k, JSON.stringify(v)); } catch(e){} }
};

class App {
  constructor(){
    this.settings = Object.assign({ name: 'Jogador', skin: 'default', body: 'padrao', quality: this._autoQuality(), weather: 'limpo', time: 15, sens: 1, vol: 0.8, party: true, showStats: true }, store.get('settings', {}));
    this.career = Object.assign({ matches: 0, wins: 0, kills: 0, xp: 0 }, store.get('career', {}));
    const qp = new URLSearchParams(location.search);
    this.manual = qp.get('manual') === '1';
    if(qp.get('q')) this.settings.quality = qp.get('q');
    this.qualityName = this.settings.quality;
    setTextureResolution(QUALITY[this.qualityName].tex);
    this.renderer = new Renderer($('stage'));
    this.renderer.setQuality(this.qualityName);
    this.audio = Audio3D;
    this.pointerFallback = false;
    this.screen = null;
    this.renderer.onStats = (s) => this._stats(s);
    const unlock = () => { this.audio.init(); this.audio.setVolume && this.audio.setVolume(this.settings.vol); removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); };
    addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
    document.addEventListener('pointerlockerror', () => { this.pointerFallback = true; });
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
    this.lobby.setPlayer(this.settings.skin, this.settings.body, this.settings.name);
    this.lobby.setParty(this.settings.party);
    this._progress(85, 'Compilando shaders…');
    await tick();
    this._ui();
    this.go('lobby');
    this.renderer.r.compile(this.lobby.scene, this.lobby.camera);
    this._progress(100, 'Pronto');
    setTimeout(() => { const l = $('loading'); if(l) l.classList.add('hide'); }, 250);
    this._last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this._last) / 1000); this._last = now;
      this.update(dt);
    };
    // modo manual (testes automatizados): avança N passos e renderiza uma vez
    window.__simulate = (n, dt) => { dt = dt || 1 / 30; for(let i = 0; i < n; i++){ if(this.screen === 'match' && this.match) this.match.update(dt); else if(this.screen === 'studio' && this.studio) this.studio.update(dt); else this.lobby.update(dt); } this.renderer.render(dt); };
    if(!this.manual) requestAnimationFrame(loop);
  }
  _progress(p, txt){ $('load-fill').style.width = p + '%'; $('load-txt').textContent = txt; }
  setQuality(name){
    this.qualityName = name; this.settings.quality = name; this.save();
    setTextureResolution(QUALITY[name].tex);
    this.renderer.setQuality(name);
    document.querySelectorAll('[data-set=quality]').forEach(s => s.value = name);
  }
  lockPointer(){
    if(this.pointerFallback) return;
    const el = this.renderer.r.domElement;
    try { const p = el.requestPointerLock(); if(p && p.catch) p.catch(() => { this.pointerFallback = true; }); } catch(e){ this.pointerFallback = true; }
  }
  go(screen){
    const prev = this.screen; this.screen = screen;
    document.body.dataset.screen = screen;
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.go === screen));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('show', p.id === 'panel-' + screen));
    if(prev === 'studio' && this.studio) this.studio.exit();
    this.lobby.active = screen === 'lobby' || screen === 'locker' || screen === 'career' || screen === 'challenges' || screen === 'settings';
    if(this.lobby.active){
      this.renderer.setScene(this.lobby.scene, this.lobby.camera);
      this.renderer.r.toneMappingExposure = 1.0; this.lobby.scene.fog = null;
      this.lobby.camBase.set(screen === 'locker' ? 3.6 : 0, screen === 'locker' ? 4.4 : 4.7, screen === 'locker' ? 19 : 27);
      this.lobby.camLook.set(screen === 'locker' ? 3.6 : 0, 4.0, 0);
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
  startMatch(){
    $('loading').classList.remove('hide'); this._progress(20, 'Gerando a ilha…');
    setTimeout(async () => {
      if(this.match){ this.match.dispose(); this.match = null; }
      this.match = new Match(this);
      this._progress(70, 'Posicionando 12 jogadores…'); await tick();
      this.match.start(this.settings.skin, this.settings.body);
      this.match.active = true;
      this.screen = 'match'; document.body.dataset.screen = 'match';
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('show'));
      this.lobby.active = false;
      this.renderer.setScene(this.match.scene, this.match.camera);
      this.renderer.r.compile(this.match.scene, this.match.camera);
      this._progress(100, 'Pronto'); setTimeout(() => $('loading').classList.add('hide'), 200);
      this.audio.play('woosh', null, { vol: 0.6 });
    }, 60);
  }
  leaveMatch(){
    if(this.match){ this.match.active = false; this.match.dispose(); this.match = null; }
    ['victory', 'defeat', 'pause-overlay'].forEach(id => $(id).classList.add('hide'));
    document.exitPointerLock && document.exitPointerLock();
    $('letterbox').classList.remove('on');
    this.go('lobby');
  }
  saveResult(r){
    this.career.matches++; if(r.win) this.career.wins++; this.career.kills += r.kills;
    this.career.xp += 120 + r.kills * 60 + (r.win ? 600 : 0);
    store.set('career', this.career);
  }
  update(dt){
    if(this.screen === 'match' && this.match){ this.match.update(dt); }
    else if(this.screen === 'studio' && this.studio){ this.studio.update(dt); }
    else if(this.lobby){ this.lobby.update(dt); }
    this.renderer.render(dt);
  }
  _stats(s){
    const el = $('stats'); if(!el) return;
    el.classList.toggle('hide', !this.settings.showStats);
    el.innerHTML = `<b class="${s.fps >= 55 ? 'ok' : s.fps >= 40 ? 'mid' : 'bad'}">${s.fps.toFixed(0)} FPS</b><span>${s.ms.toFixed(1)} ms</span><span>${s.calls} draws</span><span>${(s.tris / 1000).toFixed(0)}k tris</span><span>${QUALITY[this.qualityName].label} · ${s.pr.toFixed(2)}x</span>`;
  }
  _careerUI(){
    const c = this.career, lvl = 1 + Math.floor(c.xp / 1000), p = (c.xp % 1000) / 10;
    $('lvl-num').textContent = lvl; $('xp-fill').style.width = p + '%';
    const el = $('career-stats');
    if(el) el.innerHTML = [['Partidas', c.matches], ['Vitórias', c.wins], ['Abates', c.kills], ['Nível', lvl], ['Taxa de vitória', c.matches ? Math.round(c.wins / c.matches * 100) + '%' : '—'], ['XP total', c.xp]].map(([k, v]) => `<div class="cs"><b>${v}</b><span>${k}</span></div>`).join('');
  }
  _ui(){
    // navegação
    document.querySelectorAll('.nav-tab').forEach(t => t.addEventListener('click', () => { this.audio.play('ui', null, { vol: 0.3 }); this.go(t.dataset.go); }));
    $('play-btn').addEventListener('click', () => { this.audio.play('ui', null, { vol: 0.5, rate: 0.8 }); this.startMatch(); });
    $('cine-btn').addEventListener('click', () => { const on = !this.lobby.director.active; this.lobby.cinematic(on); $('cine-btn').classList.toggle('on', on); });
    $('player-name').textContent = this.settings.name;
    // armário
    const grid = $('skin-grid');
    grid.innerHTML = Object.entries(SKINS).map(([k, s]) => `<button class="skin-card ${k === this.settings.skin ? 'sel' : ''}" data-skin="${k}" style="--c:${s.hex}"><i></i><span>${s.name}</span></button>`).join('');
    grid.addEventListener('click', (e) => { const b = e.target.closest('[data-skin]'); if(!b) return; grid.querySelectorAll('.skin-card').forEach(x => x.classList.toggle('sel', x === b)); this.settings.skin = b.dataset.skin; this.save(); this.lobby.setPlayer(this.settings.skin, this.settings.body, this.settings.name); this.audio.play('ui', null, { vol: 0.4 }); });
    const bt = $('body-grid');
    bt.innerHTML = Object.entries(BODY_TYPES).map(([k, b]) => `<button class="chip ${k === this.settings.body ? 'sel' : ''}" data-body="${k}">${b.label}</button>`).join('');
    bt.addEventListener('click', (e) => { const b = e.target.closest('[data-body]'); if(!b) return; bt.querySelectorAll('.chip').forEach(x => x.classList.toggle('sel', x === b)); this.settings.body = b.dataset.body; this.save(); this.lobby.setPlayer(this.settings.skin, this.settings.body, this.settings.name); });
    const eg = $('emote-grid');
    eg.innerHTML = EMOTES.map(e => `<button class="chip" data-emote="${e.id}">${e.label}</button>`).join('');
    eg.addEventListener('click', (e) => { const b = e.target.closest('[data-emote]'); if(b) this.lobby.playEmote(b.dataset.emote); });
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
    $('btn-resume').addEventListener('click', () => { this.match && this.match.togglePause(); this.lockPointer(); });
    $('btn-leave').addEventListener('click', () => this.leaveMatch());
    document.querySelectorAll('.btn-lobby').forEach(b => b.addEventListener('click', () => this.leaveMatch()));
    document.querySelectorAll('.btn-again').forEach(b => b.addEventListener('click', () => { this.leaveMatch(); this.startMatch(); }));
    addEventListener('keydown', (e) => { if(e.code === 'F8'){ this.settings.showStats = !this.settings.showStats; this.save(); } });
  }
}
const tick = () => new Promise(r => setTimeout(r, 16));
window.__THREE = THREE;
const app = window.__app = new App();
app.boot().catch(e => { console.error(e); $('load-txt').textContent = 'Erro: ' + e.message; });
