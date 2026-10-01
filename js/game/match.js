// ============================================================
// MATCH — partida Battle Royale: ônibus, queda livre/planador,
// combate hitscan com traçantes, construção, baús, loot,
// tempestade em fases, 11 bots com IA, HUD completo.
// ============================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PhysicsWorld } from './physics.js';
import { World, heightAt, GRID, WALL_H, MAP_R, DESERT, VOLCANO } from './world.js';
import { LOCATIONS, ROADS, ZONES } from './pois.js';
import { Actor } from './actor.js';
import { BotBrain } from './ai.js';
import { WEAPON_STATS, createWeapon, createPickaxe, createGlider, createPotion, createMedkit, RARITY, GUNS, rollRarity } from './weapons.js';
import { pieceGeometry, buildMaterials, BUILD_MATS, EDITS } from './buildpieces.js';
import { FortSystems } from './fnsystems.js';
import { FortExtras, TACTICALS } from './fnextra.js';
import { FortV19 } from './fnv19.js';
import { FortV20 } from './fnv20.js';
import { makeBattleBus } from './bus.js';
import { PICKAXES, GLIDERS } from './cosmetics.js';
import { TPSCamera, CinematicDirector } from '../engine/camera.js';
import { ParticleSystem } from '../engine/particles.js';
import { Environment } from '../engine/weather.js';
import { Mat } from '../engine/materials.js';
import { SKINS } from '../anim/skins.js';
import { Wind } from '../anim/secondary.js';
import { MatchSystems } from './systems.js';
import { ModeRules, MODES, TEAM_COLORS } from './modes.js';
import { CreativeTools, buildLayout } from './creative.js';
import { NetSync } from '../net/netsync.js';
// v15: escritas no DOM só quando o valor muda (o HUD escrevia ~30 propriedades por frame → recalculo de estilos)
const _domC = new Map();
const _tagV = new THREE.Vector3();
const _el = (id) => { let e = _domC.get(id); if(!e){ e = document.getElementById(id); if(e){ e._c = {}; _domC.set(id, e); } } return e; };
const _txt = (id, v) => { const e = _el(id); if(e && e._c.t !== v){ e._c.t = v; e.textContent = v; } };
const _sty = (id, k, v) => { const e = _el(id); if(e && e._c[k] !== v){ e._c[k] = v; e.style[k] = v; } };
const _tog = (id, c, on) => { const e = _el(id); on = !!on; if(e && e._c['c_' + c] !== on){ e._c['c_' + c] = on; e.classList.toggle(c, on); } };

const $ = (id) => document.getElementById(id);
const KILLS_TO_WIN = 10;
const BOT_NAMES = ['Raven', 'Jonesy', 'Peely', 'Midas', 'Skye', 'Drift', 'Lynx', 'Fishstick', 'Aura', 'Brutus', 'Calamity', 'Meowscles'];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _ray = new THREE.Raycaster();

export class Match {
  constructor(app, modeId, layout, session){
    _domC.clear();
    this.app = app; this.modeId = modeId || 'br'; this.layout = layout || null; this.session = session || null; this.audio = app.audio; this.quality = app.qualityName;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.3, 6000);
    this.particles = new ParticleSystem(this.scene, this.quality);
    this.physics = new PhysicsWorld(heightAt);
    this.world = new World(this.scene, this.physics, this.particles, this.audio, this.quality, { empty: (this.modeId === 'creative' || !!this.layout) && ((this.layout && this.layout.base) || 'vazia') === 'vazia', editable: this.modeId === 'creative' || !!this.layout });
    this.env = new Environment(this.scene, app.renderer, this.particles, this.audio, { time: app.settings.time ?? 15, cloudArea: 1400 });
    this.env.setWeather(app.settings.weather || 'limpo');
    this.tps = new TPSCamera(this.camera);
    this.tps.colliders = this.world.raycastTargets.filter(m => !m.isInstancedMesh && m.name !== 'ground');
    this.director = new CinematicDirector(this.camera, $('letterbox'));
    this.shellGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.16, 6); this.shellGeo.rotateZ(Math.PI / 2);
    this.actors = []; this.bots = []; this.structures = []; this.tracers = [];
    this.time = 0; this.phase = 'bus'; this.keys = {}; this.mouse = { l: false, r: false };
    this.build = { on: false, piece: 'wall', ghost: null, rot: 0, mat: 'wood' };
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe3a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracerGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 5, 1, true); this.tracerGeo.rotateX(Math.PI / 2); this.tracerGeo.translate(0, 0, 0.5);
    this.net = session ? new NetSync(this, session, session.startInfo) : null;
    this.sys = new MatchSystems(this);
    this.fs = new FortSystems(this);
    this.fx2 = new FortExtras(this);
    this.v19 = new FortV19(this);
    this.v20 = new FortV20(this);
    this.rules = new ModeRules(this, this.modeId); this.mode = this.rules.M;
    if(this.layout) this.layoutObjs = buildLayout(this, this.layout, false);
    if(this.mode.creative) this.creative = new CreativeTools(this);
    this._bindInput();
  }
  // ---------------- início ----------------
  start(skin, bodyType){
    const skinKeys = Object.keys(SKINS);
    const pks = ['padrao', 'machado', 'martelo', 'foice', 'cristal', 'lamina', 'doce'], gls = ['classico', 'guardachuva', 'asas', 'jato', 'folha', 'tapete', 'neon', 'pipa', 'dirigivel', 'fenix', 'nuvem'], cts = ['nenhum', 'nuvem', 'arcoiris', 'fogo', 'estrelas'];
    const mkBot = (i) => {
      const b = new Actor(this, skinKeys[(i + 3) % skinKeys.length], { name: BOT_NAMES[i % BOT_NAMES.length], bodyType: ['padrao', 'atletico', 'robusto', 'esguio'][i % 4], loadout: { pickaxe: pks[i % pks.length], glider: gls[(i * 3) % gls.length], contrail: this.quality === 'baixa' ? 'nenhum' : cts[(i * 2) % cts.length] } });
      b.brain = new BotBrain(b, this);
      this.actors.push(b); this.bots.push(b); return b;
    };
    let P;
    if(this.net){
      // multijogador: todos os peers criam os atores na MESMA ordem (equipas/spawns coerentes)
      let bi = 0;
      for(const e of this.net.start.roster){
        let a;
        if(e.id === this.net.me){ a = P = new Actor(this, skin, { isPlayer: true, name: this.app.settings.name || 'Você', bodyType, loadout: this.app.loadout ? this.app.loadout() : null }); this.actors.push(a); }
        else if(e.bot) a = mkBot(bi++);
        else { a = new Actor(this, SKINS[e.skin] ? e.skin : 'default', { name: String(e.name || 'Jogador').slice(0, 16), bodyType: e.body, loadout: e.loadout }); a.human = true; this.actors.push(a); }
        this.net.register(a, e);
      }
      this.player = P;
    } else {
      P = this.player = new Actor(this, skin, { isPlayer: true, name: this.app.settings.name || 'Você', bodyType, loadout: this.app.loadout ? this.app.loadout() : null });
      this.actors.push(P); P.local = true;
      for(let i = 0; i < this.mode.bots; i++) mkBot(i).local = true;
    }
    this.stats = { t0: performance.now(), dmg: 0 };
    if(!this.mode.bus){
      this.rules.setup();
      this.tps.dist = 12.5; this.tps.pitch = 0;
      this._hud(true);
      this.env.update(0.016, this.camera, true);
      this.world.soundSpots.forEach(s => this.audio.loop(s.id, s.name, s.pos, s.vol));
      this.audio.loop('wind', 'wind', null, 0.05); this.audio.loop('rain', 'rain', null, 0);
      this.toast(this.mode.name.toUpperCase() + ' — ' + this.mode.desc);
      if(this.creative) this.creative.start();
      return;
    }
    this.rules.setup();
    // ônibus de batalha
    this.bus = this._makeBus();
    const a = this.net ? this.net.start.busA : Math.random() * Math.PI * 2;
    this.busFrom = new THREE.Vector3(Math.cos(a) * MAP_R * 0.85, 290, Math.sin(a) * MAP_R * 0.85);
    this.busTo = this.busFrom.clone().multiplyScalar(-1).setY(290);
    this.busT = 0;
    this.actors.forEach(ac => { ac.onBus = true; ac.root.visible = false; ac.body.pos.copy(this.busFrom); ac.jumpAt = ac.isPlayer || ac.remote ? 99 : 0.15 + Math.random() * 0.7; });
    P.equip(0);
    $('deploy-overlay').classList.remove('hide');
    this.phase = 'bus';
    this.tps.dist = 30; this.tps.yaw = Math.atan2(this.busTo.x - this.busFrom.x, this.busTo.z - this.busFrom.z);
    this.stats = { t0: performance.now(), dmg: 0 };
    this._hud(true);
    this.env.update(0.016, this.camera, true);
    this.world.soundSpots.forEach(s => this.audio.loop(s.id, s.name, s.pos, s.vol));
    this.audio.loop('wind', 'wind', null, 0.05); this.audio.loop('rain', 'rain', null, 0);
    this.toast('Clique ou aperte ESPAÇO para pular do ônibus');
  }
  weaponStats(w){ return WEAPON_STATS[w]; }
  isAlly(a, b){ return this.rules ? this.rules.isAlly(a, b) : false; }
  _finish(win, killer, sub){ this.endMatch(win, killer, sub); }
  _makeBus(){ const g = makeBattleBus(); this.scene.add(g); return g; }
  jumpFromBus(ac){
    ac.onBus = false; ac.root.visible = true;
    ac.body.pos.copy(this.bus.position).add(new THREE.Vector3((Math.random() - 0.5) * 4, -6, (Math.random() - 0.5) * 4));
    ac.body.vel.set(0, -10, 0); ac.mode = 'freefall'; ac.body.grounded = false; ac.anim.play('busJump');
    if(ac.isPlayer){ $('deploy-overlay').classList.add('hide'); this.phase = 'drop'; this.tps.dist = 16; this.audio.play('woosh', null, { vol: 0.7 }); }
    else { const ang = Math.random() * Math.PI * 2, r = Math.random() * MAP_R * 0.7; ac.dropTarget = new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r); }
  }
  // ---------------- entrada ----------------
  _bindInput(){
    const el = this.app.renderer.r.domElement;
    this._kd = (e) => {
      if(!this.active) return;
      if(document.activeElement && document.activeElement.id === 'game-chat-in') return;
      if(this.session && e.code === 'Enter' && !this.paused){ e.preventDefault(); this.openChat(); return; }
      this.keys[e.code] = true;
      const P = this.player; if(!P) return;
      if(['Space', 'Tab', 'KeyF'].includes(e.code)) e.preventDefault();
      if(this.creative && e.code === 'Escape' && this.creative.menuOpen){ this.creative.toggleMenu(false); return; }
      if(this.creative && !this.paused && this.creative.onKey(e)) return;
      if(e.code === 'Escape' || e.code === 'KeyP'){ const wasPaused = this.paused; this.togglePause(); if(wasPaused && !this.paused) this.app.lockPointer(); return; }
      if(this.paused || this.phase === 'over') return;
      if(e.code === 'Space' && this.phase === 'bus'){ this.jumpFromBus(P); return; }
      if(e.code === 'Space' && P.mode === 'freefall' && P.alive){ P.wantDeploy = true; if((P.height || 999) >= 240) this.toast('Alto demais para abrir o planador'); return; }
      if(e.code === 'KeyT' && !e.repeat){ const v = this.sys && this.sys.vendor; if(v && P.root.position.distanceTo(v.pos) <= 9) this.sys.vendorBuy(P, 1); else if(this.fx2){ const k = this.fx2.cycle(P); this.toast(TACTICALS[k].n + ' (' + this.fx2.count(P, k) + ')'); this.audio.play('ui', null, { vol: 0.3, rate: 1.4 }); } }
      if(e.code === 'Space' && P.alive && P.mode === 'zip'){ this.fs.detachZip(P, true); return; }
      if(e.code === 'Space' && P.alive && P.mode === 'ground' && !e.repeat) P.requestJump();
      if(e.code.startsWith('Digit')){ const n = +e.code.slice(5); if(n >= 1 && n <= 5){ if(this.build.on) this.setBuild(false); P.equip(n - 1); } }
      if(e.code === 'KeyQ' || e.code === 'KeyF') this.setBuild(!this.build.on);
      if(this.build.on){ const map = { KeyZ: 'wall', KeyX: 'floor', KeyC: 'ramp', KeyV: 'cone' }; if(map[e.code]) this.setBuildPiece(map[e.code]); if(e.code === 'KeyR') this.build.rot = (this.build.rot + 1) % 4; if(e.code === 'KeyN') this.cycleBuildMat(); }
      else {
        if(e.code === 'KeyR') P.reload();
        if(e.code === 'KeyC' || e.code === 'ControlLeft'){ if(!(P.sprint && P.startSlide())) P.crouch = !P.crouch; }
        if(e.code === 'KeyX' && !e.repeat && P.alive){ const k = P.tacSel || 'granada'; if(!this.fx2.use(P, this.aimDir || new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw)))) { if(this.fx2.count(P, k) <= 0) this.toast('Sem ' + TACTICALS[k].n + ' — T para trocar'); } }
        if(e.code === 'KeyZ' && !e.repeat && P.alive){ if(!this.fs.useRift(P)) { if(P.rifts <= 0) this.toast('Sem Fenda Portátil'); } else this.toast('FENDA! Abre o planador para descer'); }
      }
      if(e.code === 'KeyY' && !e.repeat) this.editAim();
      if(e.code === 'KeyE') this.interact();
      if(e.code === 'KeyH') P.useItem('potion');
      if(e.code === 'KeyG') P.useItem('medkit');
      if(e.code === 'KeyB'){ const own = ['danceDefault', 'floss', 'celebrate', 'laugh', ...[...(this.app.owned || [])].filter(x => x.startsWith('emote:')).map(x => x.slice(6))]; const em = this.app.settings.emote && (own.includes(this.app.settings.emote) || ['wave', 'clap', 'think', 'point'].includes(this.app.settings.emote)) ? this.app.settings.emote : own[Math.floor(Math.random() * own.length)]; P.anim.play(em); if(this.net) this.net.sendEmote(P, em); }
      if(e.code === 'KeyM') $('minimap').classList.toggle('big');
    };
    this._ku = (e) => { this.keys[e.code] = false; };
    this._md = (e) => {
      if(!this.active || this.paused) return;
      if(e.target.closest && e.target.closest('.ui-btn, button')) return;
      if(this.creative && this.creative.menuOpen) return;
      this.app.lockPointer();
      if(this.creative && this.creative.onMouse(e)) return;
      if(this.phase === 'bus'){ this.jumpFromBus(this.player); return; }
      if(e.button === 0) this.mouse.l = true;
      if(e.button === 2) this.mouse.r = true;
      if(e.button === 0 && this.build.on){ this.placePiece(); this._lastPlace = this.time; }
      if(e.button === 2 && this.build.on) this.cycleBuildMat();
      if(e.button === 1){ e.preventDefault(); if(this.player && this.player.alive) this.fs.ping(this.player); }
      if(e.button === 0 && !this.build.on) this._fireOnce = true;
    };
    this._mu = (e) => { if(e.button === 0) this.mouse.l = false; if(e.button === 2) this.mouse.r = false; };
    this._mm = (e) => {
      if(!this.active || this.paused) return;
      const locked = document.pointerLockElement === el;
      if(!locked && !(this.app.pointerFallback && e.buttons)) return;   // sem bloqueio: só gira arrastando
      if(Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;   // pico espúrio ao re-bloquear
      const s = (this.app.settings.sens || 1) * 0.0022 * (this.player && this.player.aiming ? (this.player.weaponType === 'sniper' ? 0.35 : 0.65) : 1);
      this.tps.yaw -= e.movementX * s; this.tps.pitch = THREE.MathUtils.clamp(this.tps.pitch - e.movementY * s, -1.25, 1.2);
    };
    this._wh = (e) => { if(!this.active || !this.player) return; const P = this.player; let n = P.slot + (e.deltaY > 0 ? 1 : -1); for(let k = 0; k < 5; k++){ n = (n + 5) % 5; if(n === 0 || P.slots[n]) break; n += e.deltaY > 0 ? 1 : -1; } P.equip((n + 5) % 5); };
    this._cm = (e) => { if(this.active) e.preventDefault(); };
    addEventListener('keydown', this._kd); addEventListener('keyup', this._ku);
    el.addEventListener('mousedown', this._md); addEventListener('mouseup', this._mu); addEventListener('mousemove', this._mm);
    el.addEventListener('wheel', this._wh, { passive: true }); addEventListener('contextmenu', this._cm);
    // perdeu o bloqueio do rato (Esc / alt-tab) → pausa. Ao voltar, o bloqueio é pedido de novo (com
    // repetição no próximo clique se o navegador recusar — o Chrome recusa ~1s depois de um Esc).
    this._plc = () => {
      const locked = document.pointerLockElement === el;
      this.app.onLockChange(locked);
      if(this.active && !locked && !this.app.pointerFallback && this.phase !== 'over' && !this.paused && !(this.creative && this.creative.menuOpen)) this.togglePause(true);
    };
    this._blur = () => { if(this.active && this.phase !== 'over' && !this.paused) this.togglePause(true); this.keys = {}; this.mouse.l = this.mouse.r = false; };
    addEventListener('blur', this._blur);
    document.addEventListener('pointerlockchange', this._plc);
  }
  dispose(){
    removeEventListener('keydown', this._kd); removeEventListener('keyup', this._ku); removeEventListener('mouseup', this._mu); removeEventListener('mousemove', this._mm); removeEventListener('contextmenu', this._cm);
    const el = this.app.renderer.r.domElement; el.removeEventListener('mousedown', this._md); el.removeEventListener('wheel', this._wh);
    document.removeEventListener('pointerlockchange', this._plc); removeEventListener('blur', this._blur);
    if(this.creative) this.creative.dispose();
    const ms = document.getElementById('mode-score'); if(ms){ ms.style.display = 'none'; ms._h = ''; }
    this.world.soundSpots.forEach(s => { const h = this.audio.loops[s.id]; if(h){ h.stop(); delete this.audio.loops[s.id]; } });
    ['wind', 'rain'].forEach(id => { const h = this.audio.loops[id]; if(h){ h.stop(); delete this.audio.loops[id]; } });
    if(this.sys) this.sys.dispose();
    if(this.fs) this.fs.dispose();
    if(this.fx2) this.fx2.dispose();
    if(this.v19) this.v19.dispose();
    if(this.v20) this.v20.dispose();
    const qt = $('quest-tracker'); if(qt) qt.innerHTML = '';
    if(this.net) this.net.dispose();
    const gc = document.getElementById('game-chat'); if(gc){ gc.classList.remove('on', 'typing'); gc.querySelector('.log').innerHTML = ''; }
    this.scene.traverse(o => { if(o.geometry) o.geometry.dispose(); });
    this._hud(false);
  }
  // ---------- v14: sombras de contacto (1 InstancedMesh = 1 draw call para todos os personagens) ----------
  _blobs(){
    if(!this.blobMesh){
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(cv);
      const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: this.app.renderer.q.shadows ? 0.35 : 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
      this.blobMesh = new THREE.InstancedMesh(geo, mat, 64); this.blobMesh.frustumCulled = false; this.blobMesh.renderOrder = 1;
      this.scene.add(this.blobMesh); this._bm = new THREE.Matrix4(); this._bq = new THREE.Quaternion(); this._bs = new THREE.Vector3(); this._bp = new THREE.Vector3();
    }
    let n = 0; const cam = this.camera.position;
    for(const a of this.actors){
      if(n >= 64) break;
      if(!a.alive || a.onBus || !a.root.visible) continue;
      const p = a.root.position; if(p.distanceToSquared(cam) > 90 * 90) continue;
      const gy = this.physics.groundAt(p.x, p.z, p.y + 0.5, 0);
      const hgt = Math.max(0, p.y - gy); if(hgt > 12) continue;
      const sc = (1.5 + hgt * 0.06) * (a.crouch ? 1.15 : 1), op = 1 - hgt / 12;
      this._bp.set(p.x, gy + 0.04, p.z); this._bs.set(sc * op + 0.2, 1, sc * op + 0.2);
      this._bm.compose(this._bp, this._bq, this._bs); this.blobMesh.setMatrixAt(n++, this._bm);
    }
    this.blobMesh.count = n; this.blobMesh.instanceMatrix.needsUpdate = true;
  }
  // ---------- chat na partida (multijogador) ----------
  chatLine(m){
    const gc = $('game-chat'); if(!gc) return;
    const p = document.createElement('p'); p.className = m.sys ? 'sys' : '';
    p.textContent = m.sys ? m.text : `${m.from}: ${m.text}`;
    gc.querySelector('.log').appendChild(p); gc.classList.add('on');
    while(gc.querySelector('.log').children.length > 6) gc.querySelector('.log').firstChild.remove();
    setTimeout(() => p.classList.add('old'), 9000);
  }
  openChat(){
    const gc = $('game-chat'), inp = $('game-chat-in'); if(!gc || !inp) return;
    gc.classList.add('on', 'typing'); this.keys = {}; this.mouse.l = this.mouse.r = false;
    inp.value = ''; inp.focus();
    inp.onkeydown = (e) => {
      e.stopPropagation();
      if(e.key === 'Enter'){ const t = inp.value.trim(); if(t && this.session){ this.session.say(t); this.chatLine({ from: this.app.settings.name, text: t }); } close(); }
      if(e.key === 'Escape') close();
    };
    const close = () => { gc.classList.remove('typing'); inp.blur(); inp.onkeydown = null; this.app.lockPointer(); };
  }
  togglePause(force){
    if(this.phase === 'over') return;
    this.paused = force === true ? true : !this.paused;
    $('pause-overlay').classList.toggle('hide', !this.paused);
    const ph = document.querySelector('#pause-overlay h1, #pause-overlay h2'); if(ph) ph.textContent = this.session ? 'MENU · A PARTIDA CONTINUA' : 'PAUSADO';
    this.keys = {}; this.mouse.l = this.mouse.r = false;       // evita teclas "presas" ao voltar
    if(this.paused){ if(document.pointerLockElement) document.exitPointerLock(); }
    this.app.updateLockPrompt();
  }
  // ---------------- construção ----------------
  setBuild(on){
    const P = this.player;
    if(on && this.mode && !this.mode.build){ this.toast('Construção desativada neste modo'); return; }
    if(this.creative && this.creative.palette) return;
    this.build.on = on; $('build-bar').classList.toggle('on', on);
    if(on){ P.anim.setWeapon(null); P.pickaxe.visible = false; this._makeGhost(); }
    else { if(this.build.ghost){ this.scene.remove(this.build.ghost); this.build.ghost = null; } P._equipped = null; P.equip(P.slot); }
    this._updateSlotsUI();
  }
  // v15: aquecimento de shaders — põe na cena, por um frame, tudo o que só aparece a meio da partida
  // (armas de todos os tipos, picaretas/planadores, poções, peças de construção, fantasma, traçantes)
  // para o three.js compilar tudo no ecrã de carregamento e não durante o tiroteio.
  warmupGroup(){
    const g = new THREE.Group(); g.name = 'warmup';
    const put = (o, i) => { o.position.set((i % 8) * 3, 2 + Math.floor(i / 8) * 3, 0); o.traverse(c => { c.frustumCulled = false; }); g.add(o); };
    let i = 0;
    for(const t of Object.keys(WEAPON_STATS)){ try { put(createWeapon(t).group, i++); } catch(e){} }
    const pk = new Set(this.actors.map(a => a.loadout && a.loadout.pickaxe).filter(Boolean)), gl = new Set(this.actors.map(a => a.loadout && a.loadout.glider).filter(Boolean));
    for(const s of pk) if(PICKAXES[s]) put(createPickaxe(s), i++);
    for(const s of gl) if(GLIDERS[s]) put(createGlider(0xef4444, s), i++);
    put(createPotion(), i++); put(createMedkit(), i++);
    const gh = new THREE.Mesh(this._pieceGeo('wall'), new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.35, depthWrite: false }));
    gh.add(new THREE.LineSegments(new THREE.EdgesGeometry(gh.geometry), new THREE.LineBasicMaterial({ color: 0xbfdbfe }))); put(gh, i++);
    put(new THREE.Mesh(this.tracerGeo, this.tracerMat), i++);
    g.position.copy(this.camera.position).addScaledVector(this.camera.getWorldDirection(new THREE.Vector3()), 20);
    return g;
  }
  async warmup(renderer){
    const g = this.warmupGroup(); this.scene.add(g);
    const tmp = [];
    for(const kind of ['wood', 'stone', 'metal']){
      try { const S = this.makeStructure('wall', g.position.clone().add(new THREE.Vector3(tmp.length * 12, 0, 8)), 0, null, true, kind); if(S) tmp.push(S); } catch(e){}
    }
    tmp.forEach(S => S.mesh && S.mesh.traverse(c => c.frustumCulled = false));
    try { if(renderer.compileAsync) await renderer.compileAsync(this.scene, this.camera); else renderer.compile(this.scene, this.camera); } catch(e){ renderer.compile(this.scene, this.camera); }
    this.scene.remove(g);
    g.traverse(o => { if(o.geometry && o.geometry !== this.tracerGeo) o.geometry.dispose(); });
    tmp.forEach(S => { try { this.removeStructure(S); } catch(e){} });
  }
  setBuildPiece(p){ this.build.piece = p; this._makeGhost(); this._updateSlotsUI(); }
  _pieceGeo(p){ return pieceGeometry(p, 'wood', 'full').geo; }
  _makeGhost(){
    if(this.build.ghost) this.scene.remove(this.build.ghost);
    const kind = this.build.mat || 'wood', col = { wood: 0x60a5fa, stone: 0x93c5fd, metal: 0xa5b4fc }[kind];
    const m = new THREE.Mesh(pieceGeometry(this.build.piece, kind, 'full').geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.32, depthWrite: false }));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(this._pieceGeoSimple(this.build.piece)), new THREE.LineBasicMaterial({ color: 0xdbeafe }));
    m.add(edges); m.userData.noProbe = true; m.userData.kind = kind;
    this.scene.add(m); this.build.ghost = m;
  }
  _pieceGeoSimple(p){
    if(p === 'wall') return new THREE.BoxGeometry(GRID, WALL_H, 0.6);
    if(p === 'floor') return new THREE.BoxGeometry(GRID, 0.6, GRID);
    if(p === 'ramp'){ const len = Math.hypot(GRID, WALL_H); const g = new THREE.BoxGeometry(GRID, 0.6, len); g.rotateX(-Math.atan2(WALL_H, GRID)); return g; }
    const g = new THREE.ConeGeometry(GRID * 0.71, WALL_H * 0.5, 4, 1); g.rotateY(Math.PI / 4); g.translate(0, WALL_H * 0.25, 0); return g;
  }
  /** v16: troca o material de construção (botão direito no modo construção) */
  cycleBuildMat(){
    const order = ['wood', 'stone', 'metal'], i = order.indexOf(this.build.mat || 'wood');
    this.build.mat = order[(i + 1) % 3]; this._makeGhost(); this._updateSlotsUI();
    this.audio.play('ui', null, { vol: 0.4, rate: 1.2 + i * 0.15 });
    this.toast('Material: ' + BUILD_MATS[this.build.mat].label);
  }
  _placement(actor, piece, yaw){
    const p = actor.root.position;
    const q = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
    const fx = Math.round(Math.sin(q)), fz = Math.round(Math.cos(q));
    const cx = Math.floor(p.x / GRID) * GRID + GRID / 2, cz = Math.floor(p.z / GRID) * GRID + GRID / 2;
    const baseY = Math.max(0, Math.round((p.y - heightAt(p.x, p.z) > 2 ? p.y : heightAt(cx, cz)) / WALL_H) * WALL_H);
    const gy = Math.max(heightAt(cx + fx * GRID, cz + fz * GRID), 0);
    const y0 = Math.max(baseY, Math.floor(p.y / WALL_H) * WALL_H, p.y > gy + 1 ? Math.floor(p.y / WALL_H) * WALL_H : gy - 0.3);
    const pos = new THREE.Vector3(), rot = new THREE.Euler(0, q, 0);
    const pitch = actor.isPlayer ? this.player.pitch : 0;
    if(piece === 'wall'){ pos.set(cx + fx * GRID / 2, y0 + WALL_H / 2, cz + fz * GRID / 2); }
    else if(piece === 'floor'){ pos.set(cx + fx * GRID, y0 + (pitch > 0.25 ? WALL_H : 0) + 0.3, cz + fz * GRID); }
    else if(piece === 'ramp'){ pos.set(cx + fx * GRID, y0 + WALL_H / 2, cz + fz * GRID); }
    else { pos.set(cx, y0 + WALL_H, cz); }
    return { pos, rot, q, fx, fz, y0 };
  }
  placePiece(actor, piece, yaw, matKind){
    actor = actor || this.player; piece = piece || this.build.piece; yaw = yaw ?? actor.yaw;
    // v16: 3 materiais. Jogador usa o selecionado; bots usam o que têm mais
    let kind = matKind || (actor.isPlayer ? (this.build.mat || 'wood') : ['wood', 'stone', 'metal'].reduce((a, b) => (actor.mats[b] || 0) > (actor.mats[a] || 0) ? b : a, 'wood'));
    if((actor.mats[kind] || 0) < 10){ if(actor.isPlayer){ if(!this._noMatT || this.time - this._noMatT > 1.2){ this.toast(BUILD_MATS[kind].label + ' insuficiente'); this._noMatT = this.time; } } return null; }
    const pl = this._placement(actor, piece, yaw);
    if(this.structures.some(s => s.alive && s.piece === piece && s.mesh.position.distanceTo(pl.pos) < 1 && (piece !== 'wall' || Math.abs(Math.cos(s.q - pl.q)) > 0.9))) return null;
    actor.mats[kind] -= 10;
    if(actor.isPlayer) this.quest('build');
    const S = this.makeStructure(piece, pl.pos, pl.q, actor, false, kind);
    if(this.net) this.net.sendBuild(S, actor);
    this.particles.emit('build', pl.pos);
    this.audio.play('build', pl.pos, { vol: 0.6, rate: kind === 'metal' ? 0.8 : kind === 'stone' ? 0.9 : 1 });
    return S;
  }
  /** cria uma peça de construção (jogador, bot ou mapa criado) */
  makeStructure(piece, pos, q, owner, instant, matKind, edit){
    matKind = BUILD_MATS[matKind] ? matKind : 'wood'; edit = edit || 'full';
    const B = BUILD_MATS[matKind];
    const mesh = new THREE.Mesh(pieceGeometry(piece, matKind, edit).geo, buildMaterials(matKind));
    mesh.position.copy(pos); mesh.rotation.set(0, q + (piece === 'ramp' && edit === 'flip' ? Math.PI : 0), 0); mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.scale.setScalar(instant ? 1 : 0.05);
    this.scene.add(mesh); this.world.raycastTargets.push(mesh); this.tps.colliders.push(mesh);
    const S = { mesh, piece, hp: instant ? B.hp : B.hp * 0.3, maxHp: B.hp, growT: instant ? 1 : 0, grow: B.grow, alive: true, q, owner, matKind, edit, boxes: [] };
    mesh.userData.structure = S;
    this._structBoxes(S);
    this.structures.push(S);
    return S;
  }
  _structBoxes(S){
    S.boxes.forEach(b => this.physics.removeBox(b)); S.boxes = [];
    const q = S.mesh.rotation.y, cs = Math.cos(q), sn = Math.sin(q), p = S.mesh.position;
    const fx = Math.round(sn), fz = Math.round(cs);
    for(const b of pieceGeometry(S.piece, S.matKind, S.edit).boxes){
      let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
      for(const [lx, lz] of [[b[0], b[2]], [b[3], b[2]], [b[0], b[5]], [b[3], b[5]]]){ const wx = lx * cs + lz * sn, wz = -lx * sn + lz * cs; x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); z0 = Math.min(z0, wz); z1 = Math.max(z1, wz); }
      const extra = S.piece === 'ramp' ? { ramp: (() => { const axis = Math.abs(fx) > 0 ? 'x' : 'z'; return { axis, dir: axis === 'x' ? fx : fz }; })() } : undefined;
      S.boxes.push(this.physics.addBox(new THREE.Vector3(p.x + x0, p.y + b[1], p.z + z0), new THREE.Vector3(p.x + x1, p.y + b[4], p.z + z1), extra));
    }
    S.box = S.boxes[0];
    // AABB total (para a integridade estrutural)
    S.aabb = new THREE.Box3(); S.boxes.forEach(b => { S.aabb.expandByPoint(b.min); S.aabb.expandByPoint(b.max); });
  }
  /** v16: edição (tecla Y) — parede: janela/porta/arco; piso: buraco; rampa: inverte */
  editStructure(S, fromNet, to){
    if(!S || !S.alive || S.editor) return false;
    const list = EDITS[S.piece]; if(!list || list.length < 2) return false;
    S.edit = to && list.includes(to) ? to : list[(list.indexOf(S.edit || 'full') + 1) % list.length];
    S.mesh.geometry = pieceGeometry(S.piece, S.matKind, S.edit).geo;
    S.mesh.rotation.y = S.q + (S.piece === 'ramp' && S.edit === 'flip' ? Math.PI : 0);
    this._structBoxes(S);
    this.particles.emit('build', S.mesh.position, { n: 6 });
    if(!fromNet && S.owner && S.owner.isPlayer) this.quest('edit');
    this.audio.play('ui', S.mesh.position, { vol: 0.6, rate: 0.8 });
    if(this.net && !fromNet && this.net.sendEdit) this.net.sendEdit(S);
    return true;
  }
  editAim(){
    const P = this.player; if(!P || !P.alive) return;
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    _ray.set(this.camera.position, dir); _ray.near = 0; _ray.far = this.tps.curDist + 22;
    const hits = _ray.intersectObjects(this.structures.filter(s => s.alive).map(s => s.mesh), false);
    const S = hits[0] && hits[0].object.userData.structure;
    if(S && (!S.owner || S.owner === P || this.isAlly(S.owner, P))){ if(!this.editStructure(S)) this.toast('Esta peça não tem edições'); }
    else this.toast('Aponta para uma construção tua para editar');
  }
  removeStructure(S){
    if(!S.alive) return; S.alive = false; this.scene.remove(S.mesh); S.boxes.forEach(b => this.physics.removeBox(b)); S.boxes = [];
    const i = this.world.raycastTargets.indexOf(S.mesh); if(i >= 0) this.world.raycastTargets.splice(i, 1);
    const ci = this.tps.colliders.indexOf(S.mesh); if(ci >= 0) this.tps.colliders.splice(ci, 1);
  }
  damageStructure(S, dmg, point, fromNet){
    if(S.editor) return;
    if(!S.alive) return;
    if(this.net && !fromNet) this.net.sendStructDamage(S, dmg, point);
    S.hp -= dmg;
    this.particles.emit(S.matKind === 'wood' ? 'wood' : 'stone', point, {});
    // v16: peça danificada escurece (material partilhado → sem recompilar)
    if(!S.damaged && S.hp < S.maxHp * 0.45){ S.damaged = true; S.mesh.material = buildMaterials(S.matKind, true); }
    if(S.hp <= 0) this._breakStructure(S, true);
  }
  _breakStructure(S, checkSupport){
    if(!S.alive) return;
    this.removeStructure(S);
    const mats = buildMaterials(S.matKind);
    for(let i = 0; i < (this.quality === 'baixa' ? 5 : 10); i++){
      const d = new THREE.Mesh(this._debrisGeo || (this._debrisGeo = new THREE.BoxGeometry(1, 1, 1)), mats[i % 2]);
      d.scale.set(1.4 + Math.random() * 2, 0.4, 0.8 + Math.random());
      d.position.copy(S.mesh.position).add(new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8));
      d.castShadow = true; this.scene.add(d);
      this.physics.addBody(d, new THREE.Vector3((Math.random() - 0.5) * 14, 6 + Math.random() * 10, (Math.random() - 0.5) * 14), new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), { life: 3.5, r: 0.25, bounce: 0.3 });
    }
    this.particles.emit('dust', S.mesh.position, { n: 14, power: 2 });
    this.audio.play('stepWood', S.mesh.position, { vol: 1, rate: S.matKind === 'metal' ? 1.2 : 0.6 });
    if(checkSupport) this._checkSupport();
  }
  /** v16: integridade estrutural — peças que deixam de estar ligadas ao chão caem em cascata */
  _checkSupport(){
    const L = this.structures.filter(s => s.alive && !s.editor && s.aabb);
    if(!L.length) return;
    const own = new Set(); for(const t of this.structures) for(const b of t.boxes) own.add(b);
    const grounded = (s) => {
      const b = s.aabb, y = b.min.y;
      for(const [x, z] of [[b.min.x + 0.5, b.min.z + 0.5], [b.max.x - 0.5, b.min.z + 0.5], [b.min.x + 0.5, b.max.z - 0.5], [b.max.x - 0.5, b.max.z - 0.5], [(b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2]]) if(y <= heightAt(x, z) + 1.6) return true;
      // apoiado em geometria do mapa (prédios/rochas): caixa não-estrutura logo abaixo
      for(const bx of this.physics.nearBoxes(b.min.x, b.min.z, b.max.x, b.max.z)) if(!own.has(bx) && Math.abs(bx.max.y - y) < 1.2 && bx.max.x > b.min.x && bx.min.x < b.max.x && bx.max.z > b.min.z && bx.min.z < b.max.z) return true;
      return false;
    };
    const ok = new Set(), queue = [];
    for(const s of L) if(grounded(s)){ ok.add(s); queue.push(s); }
    const tmp = new THREE.Box3();
    while(queue.length){
      const s = queue.pop(); tmp.copy(s.aabb).expandByScalar(0.9);
      for(const t of L) if(!ok.has(t) && tmp.intersectsBox(t.aabb)){ ok.add(t); queue.push(t); }
    }
    const fall = L.filter(s => !ok.has(s)).sort((a, b) => a.aabb.min.y - b.aabb.min.y);
    fall.forEach((s, i) => setTimeout(() => { if(s.alive && this.active !== false) this._breakStructure(s, false); }, 60 + i * 55));
  }
  botBuildWall(bot, enemy){
    if(this.mode && !this.mode.build) return;
    const yaw = Math.atan2(enemy.root.position.x - bot.root.position.x, enemy.root.position.z - bot.root.position.z);
    this.placePiece(bot, Math.random() < 0.7 ? 'wall' : 'ramp', yaw);
  }
  // ---------------- combate ----------------
  _targets(shooter){
    // o terreno é tratado analiticamente (heightfield) — muito mais barato que raycast em 28k triângulos
    if(!this._staticTargets || this._staticN !== this.world.raycastTargets.length){ this._staticTargets = this.world.raycastTargets.filter(m => m.name !== 'ground'); this._staticN = this.world.raycastTargets.length; }
    const list = [];
    for(const a of this.actors) if(a !== shooter && a.alive && !a.onBus) list.push(...a.hbList);
    return list.concat(this._staticTargets);
  }
  /** raycast combinado: malhas + terreno por ray-marching no heightfield */
  _cast(origin, dir, near, far, targets){
    _ray.set(origin, dir); _ray.near = near; _ray.far = far;
    const h = _ray.intersectObjects(targets, false)[0];
    const lim = h ? h.distance : far;
    let prev = near, p = _v.copy(origin).addScaledVector(dir, near);
    if(p.y - heightAt(p.x, p.z) < 0) return h || null;
    for(let t = near + 2; t <= lim; t += 2){
      p.copy(origin).addScaledVector(dir, t);
      if(p.y < heightAt(p.x, p.z)){
        let a = prev, b = t;
        for(let k = 0; k < 6; k++){ const m = (a + b) / 2; p.copy(origin).addScaledVector(dir, m); if(p.y < heightAt(p.x, p.z)) b = m; else a = m; }
        const pt = origin.clone().addScaledVector(dir, b);
        return { point: pt, distance: b, object: this.world.ground, face: { normal: new THREE.Vector3(0, 1, 0) } };
      }
      prev = t;
    }
    return h || null;
  }
  fireHitscan(shooter, origin, dir, st, muzzle){
    const pellets = st.pellets || 1;
    const moving = Math.hypot(shooter.body.vel.x, shooter.body.vel.z) > 4;
    const spread = st.spread * (shooter.aiming ? 0.45 : 1) * (moving ? 1.6 : 1) * (shooter.body.grounded ? 1 : 2.2);
    const targets = this._targets(shooter);
    let anyHit = false, head = false, firstEnd = null;
    for(let i = 0; i < pellets; i++){
      const d = dir.clone();
      if(spread > 0){ d.x += (Math.random() - 0.5) * spread * 2; d.y += (Math.random() - 0.5) * spread * 2; d.z += (Math.random() - 0.5) * spread * 2; d.normalize(); }
      const h = this._cast(origin, d, shooter.isPlayer ? this.tps.curDist * 0.9 : 1.5, st.range, targets);
      const end = h ? h.point : origin.clone().addScaledVector(d, st.range);
      if(!firstEnd) firstEnd = end;
      if(i < 3 || pellets < 3) this._tracer(muzzle, end, pellets > 1 ? 0.05 : 0.08);
      if(!h) continue;
      const obj = h.object;
      if(obj.userData.character){
        const victim = obj.userData.character.root.userData.actor;
        if(!victim || victim === shooter) continue;
        if(this.isAlly(shooter, victim)){ this._tracer(muzzle, h.point, 0.04); continue; }
        const isHead = !!obj.userData.isHead;
        const falloff = st.pellets ? THREE.MathUtils.clamp(1.3 - h.distance / 60, 0.35, 1) : st.drop ? THREE.MathUtils.clamp(1.15 - h.distance / st.drop * 0.5, 0.55, 1) : 1;
        const rm = RARITY[(shooter.rar && shooter.rar[shooter.weaponType]) || 0].mult;
        const dmg = Math.round(st.dmg * rm * (isHead ? st.head || 2 : 1) * falloff);
        victim.takeDamage(dmg, shooter, isHead);
        anyHit = true; head = head || isHead;
        this.particles.emit('impact', h.point, { n: 5, color: 0xff5a5a, dust: 0xaa3333 });
        if(shooter.isPlayer){ this.stats.dmg += dmg; this._damageNumber(h.point, dmg, isHead, victim.shield > 0); this.quest('damage', dmg); }
        if(victim.isPlayer) this._hurtFx(shooter);
        if(victim.brain) victim.brain.hear(shooter.root.position);
      } else if(obj.userData.structure){ this.damageStructure(obj.userData.structure, st.dmg * 0.5, h.point); }
      else if(obj.userData.bank){ obj.userData.bank.hit(obj, h.instanceId, st.dmg * 0.4, h.point, false); this.particles.emit('impact', h.point, { n: 5 }); }
      else { this.particles.emit('impact', h.point, { dir: h.face ? h.face.normal.clone().transformDirection(obj.matrixWorld) : undefined, n: 6, color: obj === this.world.ground ? 0x7a6a4a : undefined }); }
    }
    if(this.net && firstEnd) this.net.sendFire(shooter, shooter.weaponType, firstEnd, anyHit);
    const scale = shooter.weaponType === 'shotgun' ? 1.5 : shooter.weaponType === 'sniper' ? 1.4 : 1;
    this.particles.emit('muzzle', muzzle, { dir, scale });
    const snd = shooter.weaponType; this.audio.play(snd, muzzle, { vol: shooter.isPlayer ? 0.85 : 0.9, reverb: 0.5 });
    if(shooter.isPlayer){
      this.tps.addTrauma(snd === 'shotgun' ? 0.35 : snd === 'sniper' ? 0.45 : 0.12); this.tps.kick(snd === 'shotgun' ? 3 : 1.2);
      this.tps.pitch += (snd === 'sniper' ? 0.03 : snd === 'shotgun' ? 0.025 : 0.006) * (shooter.aiming ? 0.6 : 1);
      if(anyHit){ this._hitmarker(head); this.audio.play(head ? 'headshot' : 'hit', null, { vol: 0.5 }); }
      this._crossBloom = Math.min(1, (this._crossBloom || 0) + (snd === 'rifle' ? 0.18 : 0.6));
    }
    // bots ouvem tiros
    for(const b of this.bots) if(b.alive && b !== shooter && b.root.position.distanceTo(shooter.root.position) < 160) b.brain.hear(shooter.root.position);
  }
  pickaxeHit(actor, origin, dir){
    const o = actor.root.position.clone().setY(actor.root.position.y + 5);
    const d = actor.isPlayer ? dir.clone() : new THREE.Vector3(Math.sin(actor.yaw), 0, Math.cos(actor.yaw));
    const h = this._cast(o, d, 0, 9, this._targets(actor));
    if(!h) return;
    const obj = h.object;
    const heavy = actor.swingKind === 2, mult = heavy ? 1.6 : 1;
    const pk = actor.pkInfo || {};
    this.particles.emit('impact', h.point, { n: heavy ? 16 : 8, color: pk.spark || 0xffc26b, dir: d.clone().negate() });
    if(pk.trail && pk.trail !== 0xffffff) this.particles.emit('magic', h.point, { color: pk.trail, n: heavy ? 8 : 4 });
    if(heavy){ this.particles.emit('dust', h.point, { n: 8, power: 1.2 }); if(actor.isPlayer) this.tps.addTrauma(0.18); }
    if(obj.userData.character){
      const v = obj.userData.character.root.userData.actor; const dm = Math.round(20 * mult); if(v && v !== actor && !this.isAlly(actor, v)){ v.takeDamage(dm, actor, false); if(actor.isPlayer){ this._hitmarker(false); this._damageNumber(h.point, dm, false, v.shield > 0); } if(v.isPlayer) this._hurtFx(actor); }
      this.audio.play('hit', h.point, { vol: 0.6 });
    } else if(obj.userData.structure){ this.damageStructure(obj.userData.structure, 50 * mult, h.point); this.audio.play('pickHit', h.point, { vol: 0.8 }); }
    else {
      const r = (obj.isInstancedMesh && h.instanceId !== undefined) ? this.world.hitResource(obj, h.instanceId, h.point) : null;
      if(r && heavy) r.amount = Math.round(r.amount * 1.5);
      if(r && this.sys && !r.destroyed){ r.amount *= this.sys.weakHit(actor, obj, h.instanceId, h.point, d); }
      else if(r && this.sys && this.sys.weak) this.sys.weak.sp.visible = false;
      this.audio.play('pickHit', h.point, { vol: 0.8, rate: r && r.kind === 'stone' ? 1.3 : 1 });
      if(r){ actor.mats[r.kind] = (actor.mats[r.kind] || 0) + r.amount; if(actor.isPlayer && r.amount > 0){ this.quest('harvest', r.amount); this._floatText(h.point, '+' + r.amount + ({ wood: ' madeira', stone: ' pedra', metal: ' metal' })[r.kind]); this._hitmarker(false); } }
      else this.particles.emit('impact', h.point, { n: 5 });
    }
    if(actor.isPlayer) this.tps.addTrauma(0.1);
  }
  _tracer(from, to, life){
    const m = new THREE.Mesh(this.tracerGeo, this.tracerMat.clone());
    m.position.copy(from); m.lookAt(to); m.scale.set(1, 1, from.distanceTo(to));
    m.userData.noProbe = true;
    this.scene.add(m); this.tracers.push({ m, t: life, life });
  }
  onActorDeath(victim, killer){
    this.particles.emit('digitize', victim.root.position, { color: new THREE.Color(victim.ch.S.accent || 0x60a5fa).getHex() });
    this.audio.play('elim', victim.root.position, { vol: 0.8 });
    if(killer){ killer.kills++; if(this.sys) this.sys.addGold(killer, 50 + Math.floor((victim.gold || 0) / 2), victim.root.position); }
    if(killer && killer.brain && Math.random() < 0.6) setTimeout(() => { if(killer.alive && !killer.brain.target) killer.anim.play(['danceDefault', 'celebrate', 'laugh', 'hype'][Math.floor(Math.random() * 4)]); }, 700);
    this._killfeed(killer, victim);
    if(killer && killer.isPlayer && !this.isAlly(killer, victim)){ this.toast('ELIMINOU ' + victim.name.toUpperCase(), 'kill'); this.tps.addTrauma(0.15); this.quest('kill'); }
    const M = this.mode;
    if(M.respawn || this.modeId === 'duel'){
      // modos com renascimento: sem loot de armas (evita acumular), só munição/escudo
      if(!M.gunList) this.world.spawnPickup(Math.random() < 0.5 ? 'ammo' : 'potion', victim.root.position.clone().add(new THREE.Vector3(2, 0, -2)), 30);
      const vis = victim; setTimeout(() => { if(!vis.alive) vis.root.visible = false; }, 1600);
      this.rules.onKill(killer, victim);
      return;
    }
    // loot drop
    const wt = victim.slots.filter((s, i) => i > 0 && s);
    const vy = { y: this.physics.groundAt(victim.root.position.x, victim.root.position.z, victim.root.position.y + 1, 0) + 1.5 };
    wt.forEach((w, i) => this.world.spawnPickup(w, victim.root.position.clone().add(new THREE.Vector3(i * 2.5 - 2, 0, 1.5)), 1, { ...vy, rar: victim.rar[w] || 0 }));
    this.world.spawnPickup('ammo', victim.root.position.clone().add(new THREE.Vector3(2, 0, -2)), 30, vy);
    ['wood', 'stone', 'metal'].forEach((k, i) => { if(victim.mats[k] > 0) this.world.spawnPickup(k, victim.root.position.clone().add(new THREE.Vector3(-2 - i * 1.6, 0, -2)), victim.mats[k], vy); });
    if(victim.grenades > 0) this.world.spawnPickup('grenade', victim.root.position.clone().add(new THREE.Vector3(0, 0, 3)), victim.grenades, vy);
    ['impulso', 'escudo', 'fumo', 'arbusto'].forEach((k, i) => { if(victim.tac && victim.tac[k] > 0) this.world.spawnPickup(k, victim.root.position.clone().add(new THREE.Vector3(-3 + i * 2, 0, 4)), victim.tac[k], vy); });
    setTimeout(() => { victim.root.visible = false; }, 1600);
    const target = M.killTarget || KILLS_TO_WIN;
    if(victim.isPlayer) setTimeout(() => this.endMatch(false, killer), 1800);
    else if(this.player.alive && (this.player.kills >= target || this.actors.filter(a => a.alive).length === 1)) setTimeout(() => this.endMatch(true), 1200);
  }
  // ---------------- interação ----------------
  interact(){
    const P = this.player;
    if(this.v20 && this.v20.interact(P)) return;
    if(this.v19 && this.v19.interact(P)) return;
    if(this.fx2 && this.fx2.interact(P)) return;
    if(this.fs && this.fs.interact(P)) return;
    if(this.sys && this.sys.interact(P)) return;
    const c = this.world.chests.find(c => !c.opened && c.pos.distanceTo(P.root.position) < 7);
    if(c){ this.openChestBy(P, c); return; }
    const pk = this.world.pickups.find(p => p.pos.distanceTo(P.root.position) < 5);
    if(pk){ this.pickup(P, pk); return; }
    if(this.fs) this.fs.attachZip(P);
  }
  openChestBy(actor, c){
    if(!this.world.openChest(c)) return;
    if(this.net) this.net.sendChest(c);
    if(actor.isPlayer) this.quest('chest');
    this.audio.play('chest', c.pos, { vol: 0.9 });
    if(this.sys) this.sys.addGold(actor, 30 + Math.floor(Math.random() * 4) * 10, c.pos);
    // v16: tabela de loot com raridades + granadas/fenda
    const pool = ['rifle', 'rifle', 'shotgun', 'shotgun', 'smg', 'smg', 'pistol', 'sniper'];
    const w = pool[Math.floor(Math.random() * pool.length)], rar = rollRarity(c.elev ? 0.06 : 0);
    const spawnAt = (i) => c.pos.clone().add(new THREE.Vector3(Math.sin(c.group.rotation.y + i) * 3.5, 0, Math.cos(c.group.rotation.y + i) * 3.5));
    const yy = { y: c.pos.y + 1.5 };
    if(actor.isPlayer){
      this.world.spawnPickup(w, spawnAt(-0.6), 1, { ...yy, rar }); this.world.spawnPickup('ammo', spawnAt(0), 30, yy);
      const r = Math.random(); this.world.spawnPickup(r < 0.32 ? 'potion' : r < 0.52 ? 'medkit' : r < 0.7 ? 'grenade' : r < 0.93 ? ['impulso', 'escudo', 'fumo', 'arbusto'][Math.floor(Math.random() * 4)] : 'rift', spawnAt(0.6), r >= 0.52 && r < 0.93 ? 2 : 1, yy);
      actor.mats.wood += 30;
    } else { actor.give(w, rar); actor.potions++; if(Math.random() < 0.4) actor.grenades++; if(actor.slot === 0) actor.equip(actor.slots.indexOf(w)); }
  }
  pickup(actor, pk){
    const t = pk.type;
    if(WEAPON_STATS[t]){ const idx = actor.give(t, pk.rar || 0); if(actor.isPlayer) { actor.equip(idx); this.toast(WEAPON_STATS[t].name + ' ' + RARITY[pk.rar || 0].label.toLowerCase() + ' coletado'); } }
    else if(t === 'ammo'){ GUNS.forEach(k => actor.reserve[k] = (actor.reserve[k] || 0) + ({ rifle: 30, shotgun: 6, sniper: 3, smg: 36, pistol: 16 })[k]); if(actor.isPlayer) this.toast('Munição +'); }
    else if(t === 'grenade'){ actor.grenades += pk.amount || 1; if(actor.isPlayer) this.toast('Granadas +' + (pk.amount || 1) + ' (X para lançar)'); }
    else if(TACTICALS[t] && actor.tac){ actor.tac[t] += pk.amount || 1; if(actor.isPlayer){ if(!(actor.tac[actor.tacSel] > 0)) actor.tacSel = t; this.toast(TACTICALS[t].n + ' +' + (pk.amount || 1) + ' (T troca, X usa)'); } }
    else if(t === 'rift'){ actor.rifts += 1; if(actor.isPlayer) this.toast('Fenda Portátil (Z para usar)'); }
    else if(t === 'metal'){ actor.mats.metal += pk.amount; }
    else if(t === 'potion' || t === 'shield'){ actor.potions++; if(actor.isPlayer) this.toast('Poção de escudo'); }
    else if(t === 'medkit'){ actor.medkits++; if(actor.isPlayer) this.toast('Kit médico'); }
    else if(t === 'wood' || t === 'stone'){ actor.mats[t] += pk.amount; }
    this.audio.play('ui', pk.pos, { vol: 0.5, rate: 1.4 });
    this.world.removePickup(pk);
    if(actor.isPlayer) this._updateSlotsUI();
  }
  onFootstep(actor, speed){
    if(actor.isPlayer || actor.root.position.distanceTo(this.camera.position) < 70){
      const bp = actor.body.pos, onWood = this.structures.some(s => s.alive && s.aabb && Math.abs(bp.y - s.aabb.max.y) < 0.6 && bp.x > s.aabb.min.x && bp.x < s.aabb.max.x && bp.z > s.aabb.min.z && bp.z < s.aabb.max.z);
      this.audio.play(onWood ? 'stepWood' : 'step', actor.root.position, { vol: (actor.isPlayer ? 0.18 : 0.35) * (speed > 20 ? 1.3 : 1) * (actor.crouch ? 0.4 : 1) });
      if(speed > 18 && this.quality !== 'baixa') this.particles.emit('dust', actor.root.position, { n: 2, power: 0.6 });
    }
    for(const b of this.bots) if(b !== actor && b.alive && !actor.crouch && b.root.position.distanceTo(actor.root.position) < 40) b.brain.hear(actor.root.position);
  }
  // ---------------- loop ----------------
  update(dt){
    if(this.paused && !this.net) return;
    this.time += dt;
    const P = this.player, W = this.world;
    // ônibus
    if(this.bus){
      this.busT += dt / 26;
      this.bus.position.lerpVectors(this.busFrom, this.busTo, Math.min(1, this.busT));
      this.bus.rotation.y = Math.atan2(this.busTo.x - this.busFrom.x, this.busTo.z - this.busFrom.z);
      this.bus.position.y += Math.sin(this.time * 1.3) * 1.2;
      for(const a of this.actors) if(a.onBus){ a.body.pos.copy(this.bus.position); if(!a.remote && (this.busT >= a.jumpAt || this.busT >= 0.98)) this.jumpFromBus(a); }
      if(this.busT >= 1.05){ this.scene.remove(this.bus); this.bus = null; }
    }
    // entrada do jogador
    if(this.paused){ P.moveInput.set(0, 0); P.sprint = false; P.jumpHeld = false; this.mouse.l = false; }
    else if(P.alive && !P.onBus){
      const k = this.keys;
      P.moveInput.set((k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0));
      if(P.moveInput.lengthSq() > 0 && P.anim.clips.some(c => c.def.emote && !c.stopping)) P.anim.stopEmotes();
      P.sprint = !!k.ShiftLeft && P.moveInput.y > 0 && !P.aiming;
      P.jumpHeld = !!k.Space;
      if(P.sprint) P.crouch = false;
      P.aiming = this.mouse.r && !this.build.on && P.weaponType !== 'pickaxe' && P.mode === 'ground';
      P.yaw = this.tps.yaw; P.pitch = this.tps.pitch;
      // tiro
      const st = P.stats;
      if(!this.build.on && st && (this._fireOnce || (this.mouse.l && st.auto))){ this._fireOnce = false; this._playerFire(); }
      else if(!this.build.on && this.mouse.l && P.weaponType === 'pickaxe') this._playerFire();
      this._fireOnce = false;
      // coleta automática de munição/materiais
      for(const pk of W.pickups.slice()) if(['ammo', 'wood', 'stone', 'metal'].includes(pk.type) && pk.pos.distanceTo(P.root.position) < 3.5) this.pickup(P, pk);
    }
    // bots
    for(const b of this.bots){
      if(b.onBus || b.remote) continue;
      if(b.alive && b.mode !== 'ground' && b.dropTarget){ _v.subVectors(b.dropTarget, b.root.position); b.yaw = Math.atan2(_v.x, _v.z); b.moveInput.set(0, Math.hypot(_v.x, _v.z) > 10 ? 1 : 0); }
      else if(b.alive) b.brain.update(dt);
    }
    // atores
    if(this.net) this.net.update(dt);
    for(const a of this.actors){
      if(a.onBus && !a.remote) continue;
      a.root.userData.actor = a; a.update(dt);
      // limite da ilha: parede invisível na praia
      const bp = a.body.pos, rr = Math.hypot(bp.x, bp.z), lim = MAP_R - 28;
      if(rr > lim){ bp.x *= lim / rr; bp.z *= lim / rr; a.root.position.x = bp.x; a.root.position.z = bp.z; }
    }
    if(this.sys) this.sys.update(dt);
    if(this.fs) this.fs.update(dt);
    if(this.fx2) this.fx2.update(dt);
    if(this.v19) this.v19.update(dt);
    if(this.v20) this.v20.update(dt);
    this.rules.update(dt);
    if(this.creative) this.creative.update(dt);
    // mira: ponto sob a mira (raycast do centro da câmera) → o personagem aponta para lá, a mira nunca fica sobre ele
    const aimOrigin = this.camera.position.clone(), aimDir = new THREE.Vector3(); this.camera.getWorldDirection(aimDir);
    const ah = this._cast(aimOrigin, aimDir, this.tps.curDist + 1, 600, this._targets(P));
    P.aimPoint = ah ? ah.point : aimOrigin.clone().addScaledVector(aimDir, 300);
    this.aimOrigin = aimOrigin; this.aimDir = aimDir;
    // construção: fantasma
    if(this.build.on && this.build.ghost){
      const pl = this._placement(P, this.build.piece, P.yaw); this.build.ghost.position.copy(pl.pos); this.build.ghost.rotation.copy(pl.rot);
      const kind = this.build.mat || 'wood', okM = (P.mats[kind] || 0) >= 10; this.build.ghost.material.color.set(okM ? ({ wood: 0x60a5fa, stone: 0x93c5fd, metal: 0xa5b4fc })[kind] : 0xef4444);
      // v16: construção turbo (segurar o botão)
      if(this.mouse.l && !this.paused && this.time - (this._lastPlace || 0) > 0.14){ this._lastPlace = this.time; this.placePiece(); }
    }
    // estruturas crescendo
    for(const s of this.structures) if(s.alive && s.growT < 1){ s.growT = Math.min(1, s.growT + dt * (s.grow || 2.2)); const e = 1 - Math.pow(1 - s.growT, 3); s.mesh.scale.setScalar(0.05 + 0.95 * e); s.hp = Math.min(s.maxHp, s.hp + dt * s.maxHp * 0.7 * (s.grow || 2.2) * 0.6); }
    // tempestade
    const ev = W.updateStorm(dt * (W.stormSpeed || 1), this.phase === 'play' && this.mode.storm);
    if(ev === 'shrink'){ $('storm-warning').classList.add('show'); setTimeout(() => $('storm-warning').classList.remove('show'), 3500); this.audio.play('thunder', null, { vol: 0.5 }); }
    this._stormTick = (this._stormTick || 0) - dt;
    if(this._stormTick <= 0 && this.mode.storm){ this._stormTick = 1; for(const a of this.actors) if(a.alive && !a.onBus && !a.remote && W.inStorm(a.root.position)){ a.takeDamage(W.storm.dmg, null, false); if(a.isPlayer){ this._hurtFx(null); } } }
    if(P.alive && W.inStorm(P.root.position) && Math.random() < 0.5) this.particles.emit('storm', P.root.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8)));
    $('storm-vignette').style.opacity = P.alive && W.inStorm(P.root.position) ? 1 : 0;
    if(this.phase === 'drop' && P.mode === 'ground'){ this.phase = 'play'; this.toast('Encontre armas nos baús — E para abrir'); }
    // câmera
    const ads = P.aiming;
    const dist = P.mode === 'freefall' ? 20 - P.fallInput.dive * 3 : P.mode === 'glide' ? 17 : this.build.on ? 14 : 12.5;
    this.tps.baseFov = THREE.MathUtils.damp(this.tps.baseFov, P.mode === 'freefall' ? 74 + Math.max(0, P.fallInput.dive) * 12 : P.mode === 'glide' ? 72 : 70, 3, dt);
    if(P.mode === 'freefall' && P.fallInput.dive > 0.5) this.tps.addTrauma(0.012 * P.fallInput.dive);
    const sl = $('speed-lines'); if(sl) sl.style.opacity = P.mode === 'freefall' ? 0.25 + Math.max(0, P.fallInput.dive) * 0.6 : P.mode === 'glide' ? 0.12 : 0;
    if(this.phase === 'bus' && this.bus){
      this.tps.update(dt, this.bus.position.clone().add(new THREE.Vector3(0, 4, 0)), { dist: 42 });
    } else if(this.director.active){ this.director.update(dt); }
    else this.tps.update(dt, P.root.position, { ads, sprint: P.sprint, crouch: P.crouch, scope: ads && P.weaponType === 'sniper', dist });
    $('sniper-scope').classList.toggle('on', ads && P.weaponType === 'sniper' && this.tps.ads > 0.8);
    P.root.visible = !(ads && P.weaponType === 'sniper' && this.tps.ads > 0.8) && !P.onBus;
    this.app.renderer.setDOF(false);
    // sistemas
    this.physics.updateBodies(dt);
    W.update(dt, this.camera);
    this.env.update(dt, this.camera);
    this.particles.update(dt);
    this.audio.updateListener(this.camera);
    if(this.audio.ctx){ this.audio.setLoopVolume('rain', (this.env.state.rain || 0) * 0.5); this.audio.setLoopVolume('wind', 0.03 + Wind.strength * 0.006 + (P.mode !== 'ground' ? 0.25 : 0)); }
    for(let i = this.tracers.length - 1; i >= 0; i--){ const t = this.tracers[i]; t.t -= dt; t.m.material.opacity = Math.max(0, t.t / t.life) * 0.9; if(t.t <= 0){ this.scene.remove(t.m); t.m.material.dispose(); this.tracers.splice(i, 1); } }
    this._hudUpdate(dt);
  }
  _playerFire(){
    const P = this.player;
    if(P.using > 0) return;
    P.anim.stopEmotes();
    const dir = this.aimDir ? this.aimDir.clone() : new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
    const origin = this.aimOrigin ? this.aimOrigin.clone() : P.root.position.clone().setY(P.root.position.y + 6);
    P.tryFire(origin, dir);
  }
  endMatch(win, killer, sub){
    if(this.phase === 'over') return;
    if(this.creative) return;
    this.phase = 'over';
    document.exitPointerLock && document.exitPointerLock();
    const P = this.player, alive = this.actors.filter(a => a.alive).length;
    const secs = Math.round((performance.now() - this.stats.t0) / 1000);
    const el = $(win ? 'victory' : 'defeat');
    el.querySelector('.res-stats').innerHTML = `<div><b>${P.kills}</b><span>Abates</span></div><div><b>${this.stats.dmg}</b><span>Dano</span></div><div><b>${this.mode.bus ? '#' + (win ? 1 : alive + 1) : this.mode.short}</b><span>${this.mode.bus ? 'Colocação' : 'Modo'}</span></div><div><b>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</b><span>Tempo</span></div>`;
    el.querySelector('h1').textContent = this.mode.bus ? (win ? '#1 VITÓRIA ROYALE' : 'ELIMINADO') : (win ? 'VITÓRIA' : 'DERROTA');
    el.querySelector('.res-sub').textContent = sub || (!win && killer ? 'Eliminado por ' + killer.name : win ? 'Vitória Royale' : '');
    const ms = $('mode-score'); if(ms) ms.style.display = 'none';
    el.classList.remove('hide');
    this.app.saveResult({ win, kills: P.kills, place: win ? 1 : alive + 1, mode: this.modeId });
    if(win){
      P.anim.setWeapon(null); P.pickaxe.visible = false; P.anim.play('celebrate');
      setTimeout(() => P.anim.play('danceDefault'), 2500);
      this.director.play([
        { type: 'orbit', label: 'Vitória', dur: 8, a0: P.yaw + 0.6, a1: P.yaw - 0.6, r: 13, h: 5, fov: 42, focusOffset: new THREE.Vector3(0, 5, 0) },
        { type: 'dolly', label: 'Close', dur: 6, from: new THREE.Vector3(Math.sin(P.yaw) * 16, 5, Math.cos(P.yaw) * 16), to: new THREE.Vector3(Math.sin(P.yaw) * 7, 6, Math.cos(P.yaw) * 7), fov: 38, focusOffset: new THREE.Vector3(0, 5.8, 0) }
      ], P.root, true);
      this.particles.emit('confetti', P.root.position.clone().add(new THREE.Vector3(0, 8, 0)), { n: 80 });
    }
  }
  // ---------------- HUD ----------------
  _hud(on){
    $('hud').classList.toggle('hide', !on); $('crosshair').classList.toggle('hide', !on);
    if(on){
      this._questHUD();
      this._updateSlotsUI();
      const lab = { 0: 'N', 45: 'NE', 90: 'L', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };
      let h = '';
      for(let d = -180; d <= 540; d += 15){ const n = ((d % 360) + 360) % 360; h += `<span style="position:absolute;left:${d * 3}px;transform:translateX(-50%);${lab[n] ? (n === 0 ? 'color:#fde047' : '') : 'font-size:11px;opacity:.6;top:6px'}">${lab[n] || n}</span>`; }
      $('compass-strip').innerHTML = h;
    }
  }
  _updateSlotsUI(){
    const P = this.player; if(!P) return;
    for(let i = 0; i < 5; i++){
      const el = $('slot-' + (i + 1)); if(!el) continue;
      const t = P.slots[i], st = WEAPON_STATS[t];
      el.classList.toggle('active', i === P.slot && !this.build.on);
      el.classList.toggle('empty', !t);
      el.className = el.className.replace(/ rar-\w+/g, '') + (t ? ' rar-' + (t === 'pickaxe' ? 'common' : RARITY[P.rar[t] || 0].css) : '');
      el.querySelector('.slot-name').textContent = st ? (st.short || 'PIC') : '';
      el.querySelector('.slot-ico').innerHTML = t ? SLOT_ICONS[t] : '';
    }
    ['wall', 'floor', 'ramp', 'cone'].forEach(p => { const e = $('bp-' + p); if(e) e.classList.toggle('active', this.build.on && this.build.piece === p); });
    ['wood', 'stone', 'metal'].forEach(k => { const e = $('mat-' + k); if(e) e.classList.toggle('sel', this.build.on && (this.build.mat || 'wood') === k); });
    const bm = $('bp-mat'); if(bm) bm.textContent = BUILD_MATS[this.build.mat || 'wood'].label;
  }
  _hudUpdate(dt){
    const P = this.player, W = this.world;
    _sty('hp-fill', 'width', P.hp + '%'); _txt('hp-num', Math.ceil(P.hp));
    _sty('sh-fill', 'width', P.shield + '%'); _txt('sh-num', Math.ceil(P.shield));
    _txt('wood-count', P.mats.wood); _txt('stone-count', P.mats.stone); _txt('metal-count', P.mats.metal || 0);
    const tk = P.tacSel || 'granada'; _txt('grenade-count', (this.fx2 ? this.fx2.count(P, tk) : P.grenades) || 0); _txt('rift-count', P.rifts || 0);
    const ge = $('tac-name'); if(ge && ge._k !== tk){ ge._k = tk; ge.textContent = TACTICALS[tk].n; const gi = document.querySelector('.m.gren'); if(gi) gi.dataset.k = tk; }
    if(this.app.quests && this.app.quests._dirty){ this.app.quests._dirty = false; this._questHUD(); }
    _txt('potion-count', P.potions); _txt('medkit-count', P.medkits);
    const st = P.stats;
    _txt('ammo', st && st.mag ? `${P.mag[P.weaponType] ?? 0} / ${P.reserve[P.weaponType] ?? 0}` : '∞');
    _sty('reload-bar', 'opacity', P.reloading > 0 || P.using > 0 ? 1 : 0);
    if(P.reloading > 0) _sty('reload-fill', 'width', (1 - P.reloading / st.reloadTime) * 100 + '%');
    if(P.using > 0) _sty('reload-fill', 'width', (1 - P.using / (P.useKind === 'potion' ? 2 : 3.2)) * 100 + '%');
    _txt('reload-label', P.using > 0 ? (P.useKind === 'potion' ? 'BEBENDO' : 'CURANDO') : 'RECARREGANDO');
    this._aliveT = (this._aliveT || 0) - dt; if(this._aliveT <= 0){ this._aliveT = 0.25; this._alive = this.actors.filter(a => a.alive).length; }
    const alive = this._alive;
    _txt('player-count', alive); _txt('kill-count', P.kills);
    const S = W.storm;
    _txt('storm-timer', !this.mode.storm ? '--' : S.shrinking ? 'FECHANDO' : `${Math.max(0, Math.ceil(S.timer))}s`);
    // altímetro
    const alt = Math.max(0, Math.round(P.root.position.y - heightAt(P.root.position.x, P.root.position.z)));
    _tog('altimeter', 'hide', P.mode === 'ground' || P.mode === 'zip' || P.onBus);
    _txt('alt-num', alt + ' m');
    const ah = $('alt-hint'); if(ah) ah.textContent = P.mode === 'freefall' ? (alt < 240 ? 'ESPAÇO: abrir planador · W mergulhar · S frear' : 'W mergulhar · S frear · A/D inclinar') : P.mode === 'glide' ? 'W acelerar · S planar · A/D curvar' : '';
    const gEl = $('gold-count'); if(gEl) gEl.textContent = P.gold || 0;
    // mira dinâmica
    this._crossBloom = Math.max(0, (this._crossBloom || 0) - dt * 3);
    const moving = Math.hypot(P.body.vel.x, P.body.vel.z) > 3;
    const gap = 6 + (st && st.spread ? st.spread * 500 : 2) * (P.aiming ? 0.45 : 1) * (moving ? 1.5 : 1) + this._crossBloom * 10;
    $('crosshair').style.setProperty('--gap', gap + 'px');
    _tog('crosshair', 'shotgun', P.weaponType === 'shotgun');
    _tog('crosshair', 'hide', this.phase === 'bus' || this.phase === 'over' || (P.aiming && P.weaponType === 'sniper'));
    // interação
    const c = W.chests.find(c => !c.opened && c.pos.distanceTo(P.root.position) < 7);
    const pk = !c && W.pickups.find(p => p.pos.distanceTo(P.root.position) < 5 && !['ammo', 'wood', 'stone', 'metal'].includes(p.type));
    const hint = $('interact-hint');
    const drop = this.sys && this.sys.drops.find(d => d.landed && !d.opened && d.pos.distanceTo(P.root.position) < 6);
    const fh = !c && !pk && !drop && this.fs ? ((this.v20 && this.v20.hint(P)) || (this.v19 && this.v19.hint(P)) || (this.fx2 && this.fx2.hint(P)) || this.fs.hint(P)) : null;
    hint.classList.toggle('show', !!(c || pk || drop || fh));
    const hh = fh ? fh : drop ? '<kbd>E</kbd> Abrir entrega aérea' : c ? '<kbd>E</kbd> Abrir baú' : pk ? `<kbd>E</kbd> Pegar ${WEAPON_STATS[pk.type] ? `<b style="color:#${RARITY[pk.rar || 0].color.toString(16).padStart(6, '0')}">${WEAPON_STATS[pk.type].name} (${RARITY[pk.rar || 0].label})</b>` : ({ medkit: 'kit médico', grenade: 'granadas', rift: 'Fenda Portátil', impulso: 'Granada de Impulso', escudo: 'Splash de Escudo', fumo: 'Granada de Fumo', arbusto: 'Arbusto' })[pk.type] || 'poção de escudo'}` : null;
    if(hh && hint._h !== hh){ hint._h = hh; hint.innerHTML = hh; }
    // bússola
    const deg = ((-this.tps.yaw * 180 / Math.PI) % 360 + 360 + 180) % 360;
    _sty('compass-strip', 'transform', `translateX(${-deg * 3}px)`);
    _txt('compass-deg', Math.round(deg) + '°');
    this._mmT = (this._mmT || 0) - dt; if(this._mmT <= 0){ this._mmT = 1 / 15; this._minimap(); }   // v15: minimapa a 15 Hz
    this._blobs();
    this._nametags();
    const hpLow = P.hp < 30 && P.alive; _sty('low-hp', 'opacity', hpLow ? 0.6 + Math.sin(this.time * 6) * 0.2 : 0);
  }
  _minimap(){
    const cv = $('minimap-canvas'); if(!cv) return;
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, P = this.player, w = this.world;
    const big = $('minimap').classList.contains('big');
    const scale = big ? W / (MAP_R * 2.2) : W / 260;
    const cx = big ? 0 : P.root.position.x, cz = big ? 0 : P.root.position.z;
    const tx = (x) => W / 2 - (x - cx) * scale, tz = (z) => H / 2 - (z - cz) * scale;
    // v16: terreno/biomas/estradas/prédios pré-desenhados uma vez (antes: redesenhado a cada frame)
    if(!this._mmBase) this._mmBase = this._minimapBase();
    const S0 = this._mmBase.width, sc0 = S0 / (MAP_R * 2.2);
    ctx.fillStyle = '#1e5f7a'; ctx.fillRect(0, 0, W, H);
    const dw = S0 * scale / sc0; ctx.drawImage(this._mmBase, W / 2 - (MAP_R * 1.1 - cx) * scale, H / 2 - (MAP_R * 1.1 - cz) * scale, dw, dw);
    if(this.world.empty){ ctx.fillStyle = '#e8dcc4'; for(const h of w.houses){ ctx.fillRect(tx(h.x) - h.W * scale / 2, tz(h.z) - h.D * scale / 2, h.W * scale, h.D * scale); } }
    if(big && !this.world.empty){ ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center'; for(const L of LOCATIONS){ if(L.r > 110) continue; ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillText(L.n.toUpperCase(), tx(L.x) + 1, tz(L.z) + 1); ctx.fillStyle = '#fff'; ctx.fillText(L.n.toUpperCase(), tx(L.x), tz(L.z)); } }
    ctx.fillStyle = '#fbbf24'; for(const c of w.chests) if(!c.opened){ ctx.fillRect(tx(c.pos.x) - 2, tz(c.pos.z) - 2, 4, 4); }
    // tempestade
    ctx.save(); ctx.fillStyle = 'rgba(124,58,237,0.45)'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(tx(w.storm.cx), tz(w.storm.cz), w.storm.r * scale, 0, Math.PI * 2, true); ctx.fill('evenodd'); ctx.restore();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(tx(w.storm.cx), tz(w.storm.cz), w.storm.r * scale, 0, Math.PI * 2); ctx.stroke();
    if(w.storm.shrinking || w.storm.timer < 35){ ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(tx(w.storm.tcx), tz(w.storm.tcz), w.storm.target * scale, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    if(this.bus){ ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.moveTo(tx(this.busFrom.x), tz(this.busFrom.z)); ctx.lineTo(tx(this.busTo.x), tz(this.busTo.z)); ctx.stroke(); }
    if(this.sys) for(const mk of this.sys.minimapMarks().concat(this.fs ? this.fs.minimapMarks(P) : [], this.v19 ? this.v19.minimapMarks(P) : [], this.v20 ? this.v20.minimapMarks(P) : [])){ ctx.fillStyle = mk.c; ctx.beginPath(); if(mk.sq) ctx.rect(tx(mk.x) - mk.s / 2, tz(mk.z) - mk.s / 2, mk.s, mk.s); else ctx.arc(tx(mk.x), tz(mk.z), mk.s / 2 + 0.5, 0, Math.PI * 2); ctx.fill(); if(mk.sq){ ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); } }
    if(this.mode.teams) for(const b of this.bots) if(b.alive && this.isAlly(P, b)){ ctx.fillStyle = '#60a5fa'; ctx.beginPath(); ctx.arc(tx(b.root.position.x), tz(b.root.position.z), 3.5, 0, Math.PI * 2); ctx.fill(); }
    // jogador
    const px = tx(P.root.position.x), pz = tz(P.root.position.z);
    ctx.save(); ctx.translate(px, pz); ctx.rotate(-this.tps.yaw + Math.PI);
    ctx.fillStyle = '#fbbf24'; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  // v17: missões — evento → progresso (App.quests) e rastreador no HUD
  quest(kind, n){ if(this.creative || !this.app.quests || this.phase === 'over') return; if(this.net && !this.player) return; this.app.quests.add(kind, n || 1, this); }
  questDone(q){
    this.toast('MISSÃO CONCLUÍDA: ' + q.t + ' · +' + q.xp + ' XP', 'kill');
    this.audio.play('chest', null, { vol: 0.7, rate: 1.3 });
    if(this.player) this.particles.emit('confetti', this.player.root.position.clone().setY(this.player.root.position.y + 8), { n: 30 });
    this._questHUD();
  }
  _questHUD(){
    const el = $('quest-tracker'); if(!el || !this.app.quests) return;
    const Q = this.app.quests;
    el.innerHTML = '<h6>MISSÕES</h6>' + Q.daily().map(q => { const p = Q.prog(q), d = Q.isDone(q); return `<div class="qt ${d ? 'done' : ''}"><span>${q.t}</span><b>${d ? '✓' : p + '/' + q.n}</b><i style="width:${Math.round(p / q.n * 100)}%"></i></div>`; }).join('');
  }
  _minimapBase(){
    const S = 640, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const ctx = cv.getContext('2d'), sc = S / (MAP_R * 2.2), w = this.world;
    const tx = (x) => S / 2 - x * sc, tz = (z) => S / 2 - z * sc;
    const img = ctx.createImageData(S, S), d = img.data;
    for(let j = 0; j < S; j++) for(let i = 0; i < S; i++){
      const x = (S / 2 - i) / sc, z = (S / 2 - j) / sc, r = Math.hypot(x, z), k = (j * S + i) * 4;
      let c;
      if(r > MAP_R - 12) c = [30, 95, 122];
      else {
        const h = heightAt(x, z), wa = w.waterAt ? w.waterAt(x, z) : null;
        if(wa !== null && h < wa) c = [42, 111, 143];
        else if(r > MAP_R - 38) c = [214, 194, 143];
        else if(!w.empty && Math.hypot(x - DESERT.x, z - DESERT.z) < DESERT.r) c = [222, 196, 140];
        else if(!w.empty && Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < VOLCANO.r){ const vd = Math.hypot(x - VOLCANO.x, z - VOLCANO.z); c = vd < VOLCANO.cr ? [255, 110, 30] : vd < VOLCANO.cr + 10 ? [60, 52, 48] : [96, 88, 80]; }
        else if(h > 34) c = [236, 240, 244];
        else { const g = Math.max(0, Math.min(1, h / 40)); c = [106 - g * 30, 154 - g * 40, 69 - g * 10]; }
        const sh = (heightAt(x + 3, z + 3) - h) * 6; c = c.map(v => Math.max(0, Math.min(255, v - sh)));
      }
      d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    if(!w.empty){
      ctx.strokeStyle = 'rgba(160,130,90,.9)'; ctx.lineWidth = 3; for(const r of ROADS){ ctx.beginPath(); ctx.moveTo(tx(r[0]), tz(r[1])); ctx.lineTo(tx(r[2]), tz(r[3])); ctx.stroke(); }
      ctx.fillStyle = '#7b7f86'; for(const Z of ZONES){ ctx.fillRect(tx(Z[2]), tz(Z[3]), (Z[2] - Z[0]) * sc, (Z[3] - Z[1]) * sc); }
      ctx.fillStyle = '#d9cbb0'; for(const Z of [[175, 155, 207, 187], [223, 155, 255, 187], [175, 205, 207, 237], [223, 205, 255, 237], [175, -245, 223, -213], [231, -250, 263, -218], [-300, 86, -268, 102]]) ctx.fillRect(tx(Z[2]), tz(Z[3]), (Z[2] - Z[0]) * sc, (Z[3] - Z[1]) * sc);
      if(this.fs){ ctx.strokeStyle = '#111827'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 2]); for(const Z of this.fs.zips){ ctx.beginPath(); ctx.moveTo(tx(Z.a.x), tz(Z.a.z)); ctx.lineTo(tx(Z.b.x), tz(Z.b.z)); ctx.stroke(); } ctx.setLineDash([]); }
    }
    if(!w.empty){ ctx.fillStyle = '#e8dcc4'; for(const h of w.houses){ ctx.fillRect(tx(h.x) - h.W * sc / 2, tz(h.z) - h.D * sc / 2, h.W * sc, h.D * sc); } }
    return cv;
  }
  _nametags(){
    const layer = $('nametag-layer'); if(!layer) return;
    if(!this._tags){ this._tags = new Map(); }
    for(const b of this.actors){
      if(b === this.player) continue;
      let el = this._tags.get(b);
      if(!el){ el = document.createElement('div'); el.className = 'nametag'; el.innerHTML = `<span>${b.human ? '● ' : ''}${b.name.replace(/</g, '&lt;')}</span><i><b></b></i>`; if(b.human) el.classList.add('human'); layer.appendChild(el); this._tags.set(b, el); }
      const p = _tagV.copy(b.root.position); p.y += 8.4;
      const d = p.distanceTo(this.camera.position);
      p.project(this.camera);
      const ally = this.isAlly(this.player, b);
      if(el._ally !== ally){ el._ally = ally; el.classList.toggle('ally', ally); el.classList.toggle('enemy', !!this.mode.teams && !ally); }
      const vis = b.alive && !b.onBus && p.z < 1 && d < (ally ? 400 : 70) && Math.abs(p.x) < 1 && Math.abs(p.y) < 1;
      if(el._vis !== vis){ el._vis = vis; el.style.display = vis ? 'block' : 'none'; }
      if(vis){
        el.style.transform = `translate3d(${((p.x * 0.5 + 0.5) * innerWidth) | 0}px, ${((-p.y * 0.5 + 0.5) * innerHeight) | 0}px, 0) translate(-50%,-100%)`;
        const hp = Math.ceil(b.hp); if(el._hp !== hp){ el._hp = hp; (el._bar || (el._bar = el.querySelector('b'))).style.width = hp + '%'; }
        const op = ally ? 1 : Math.round((1 - d / 80) * 10) / 10; if(el._op !== op){ el._op = op; el.style.opacity = op; }
      }
    }
  }
  _damageNumber(point, dmg, head, shield){
    const el = document.createElement('div'); el.className = 'dmg-num' + (head ? ' head' : '') + (shield ? ' shield' : ''); el.textContent = dmg;
    const p = point.clone().project(this.camera);
    el.style.left = (p.x * 0.5 + 0.5) * innerWidth + (Math.random() - 0.5) * 30 + 'px'; el.style.top = (-p.y * 0.5 + 0.5) * innerHeight + 'px';
    $('damage-container').appendChild(el); setTimeout(() => el.remove(), 900);
  }
  _floatText(point, txt, kind){ const el = document.createElement('div'); el.className = 'dmg-num mat' + (kind ? ' ' + kind : ''); el.textContent = txt; const p = point.clone().project(this.camera); el.style.left = (p.x * 0.5 + 0.5) * innerWidth + 'px'; el.style.top = (-p.y * 0.5 + 0.5) * innerHeight + 'px'; $('damage-container').appendChild(el); setTimeout(() => el.remove(), 900); }
  _hitmarker(head){ const h = $('hitmarker'); h.classList.remove('show', 'head'); void h.offsetWidth; h.classList.add('show'); if(head) h.classList.add('head'); }
  _hurtFx(from){
    const f = $('damage-flash'); f.classList.remove('show'); void f.offsetWidth; f.classList.add('show');
    this.tps.addTrauma(0.25);
    if(from){ const d = _v.subVectors(from.root.position, this.player.root.position); const ang = Math.atan2(d.x, d.z) - this.tps.yaw; const ind = $('dmg-dir'); ind.style.transform = `translate(-50%,-50%) rotate(${-ang + Math.PI}rad)`; ind.classList.remove('show'); void ind.offsetWidth; ind.classList.add('show'); }
  }
  _killfeed(k, v){
    const el = document.createElement('div'); el.className = 'kf-item';
    el.innerHTML = k ? `<b class="${k.isPlayer ? 'me' : ''}">${k.name}</b> <span>${SLOT_ICONS[k.weaponType] || '×'}</span> <b class="${v.isPlayer ? 'me' : ''}">${v.name}</b>` : `<b class="${v.isPlayer ? 'me' : ''}">${v.name}</b> <span>foi pega pela tempestade</span>`;
    $('killfeed').prepend(el); setTimeout(() => el.remove(), 6000);
  }
  toast(msg, kind){ const t = $('toast'); t.textContent = msg; t.className = 'show' + (kind ? ' ' + kind : ''); clearTimeout(this._tt); this._tt = setTimeout(() => t.className = '', 2600); }
}

export const SLOT_ICONS = {
  pickaxe: '<svg viewBox="0 0 48 48"><path d="M8 14c8-7 22-9 32-4-7 0-13 2-18 6l16 22-4 3-16-22c-4 3-7 7-8 12-3-6-3-12-2-17z" fill="currentColor"/></svg>',
  rifle: '<svg viewBox="0 0 64 32"><path d="M2 12h34l2-3h10l2 3h12v5H50l-2 2H38l-4 9h-7l2-9H14l-3 5H4l2-5H2z" fill="currentColor"/></svg>',
  shotgun: '<svg viewBox="0 0 64 32"><path d="M2 13h44v2h16v4H46v1H30l-3 3H16l-5 6H4l5-8H2z" fill="currentColor"/><rect x="30" y="17" width="12" height="3" fill="currentColor"/></svg>',
  sniper: '<svg viewBox="0 0 64 32"><path d="M2 15h40l2-2h18v3H44v3H26l-4 8h-6l3-8H10l-4 5H1l3-6z" fill="currentColor"/><rect x="20" y="7" width="16" height="5" rx="2" fill="currentColor"/></svg>',
  smg: '<svg viewBox="0 0 64 32"><path d="M8 10h30l2-2h6v3h8v6h-8v2H34l-2 3h-4l-2 8h-7l2-8h-5l-4 4H6l4-6H4v-6h4z" fill="currentColor"/><rect x="24" y="19" width="5" height="10" fill="currentColor"/></svg>',
  pistol: '<svg viewBox="0 0 64 32"><path d="M14 8h36v8H34l-3 3h-6l-4 11h-9l4-12h-2z" fill="currentColor"/><rect x="46" y="10" width="6" height="3" fill="currentColor"/></svg>'
};
