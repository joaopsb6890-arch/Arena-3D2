// ============================================================
// ESTÚDIO — preview interativo profissional:
//  câmera orbital suave (zoom/pan/rotação com amortecimento),
//  modos de visualização (material / sólido / wireframe / normais /
//  "ray-tracing" SSR+GTAO), qualidade, clima e hora do dia,
//  seleção de animação / emote / expressão / lip sync,
//  overlay do esqueleto, física secundária on/off, LOD,
//  sistemas de partículas e física, comparação ANTES × DEPOIS.
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCharacter, disposeCharacter, setCharacterLOD } from '../anim/rig.js';
import { Animator } from '../anim/animator.js';
import { CLIPS, EMOTES } from '../anim/clips.js';
import { EXPRESSIONS, EXPRESSION_LABELS } from '../anim/face.js';
import { SKINS, BODY_TYPES } from '../anim/skins.js';
import { Wind } from '../anim/secondary.js';
import { createWeapon, createPickaxe, createGlider } from './weapons.js';
import { legacyCreate, legacyAnimate } from '../legacy/legacy-character.js';
import { ParticleSystem } from '../engine/particles.js';
import { Environment, WEATHER } from '../engine/weather.js';
import { CinematicDirector, DEFAULT_SHOTS } from '../engine/camera.js';
import { PhysicsWorld } from './physics.js';
import { Mat } from '../engine/materials.js';
import { QUALITY } from '../engine/renderer.js';
import { PICKAXES, GLIDERS } from './cosmetics.js';

const LOCO = { idle: 'Idle (respiração)', walk: 'Caminhar', jog: 'Trotar', run: 'Correr', crouch: 'Agachado', crouchWalk: 'Andar agachado', strafe: 'Strafe lateral', back: 'Andar de costas', jump: 'No ar', freefall: 'Queda livre', glide: 'Planador' };
const SPEEDS = { idle: 0, walk: 9, jog: 16, run: 25, crouch: 0, crouchWalk: 7, strafe: 12, back: 9, jump: 0, freefall: 0, glide: 0 };
const ACTIONS = ['pickaxeSwing1', 'pickaxeSwing2', 'pickaxeSwing3', 'landHeavy', 'landGlide', 'deployGlider', 'busJump', 'launch', 'reloadRifle', 'pumpShotgun', 'reloadShotgun', 'boltSniper', 'equip', 'drink', 'medkit', 'openChest', 'death'];
const ACTION_LABELS = { pickaxeSwing1: 'Picareta golpe 1', pickaxeSwing2: 'Picareta golpe 2', pickaxeSwing3: 'Picareta golpe 3 (pesado)', landHeavy: 'Aterrissagem pesada', landGlide: 'Pouso do planador', deployGlider: 'Abrir planador', busJump: 'Salto do ônibus', launch: 'Plataforma de lançamento', reloadRifle: 'Recarregar fuzil', pumpShotgun: 'Bombear escopeta', reloadShotgun: 'Recarregar escopeta', boltSniper: 'Ferrolho sniper', equip: 'Sacar arma', drink: 'Beber poção', medkit: 'Kit médico', openChest: 'Abrir baú', death: 'Morte' };

export class Studio {
  constructor(app){
    this.app = app;
    const s = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 6000);
    this.camera.position.set(9, 7, 20);
    this.controls = new OrbitControls(this.camera, app.renderer.r.domElement);
    this.controls.target.set(0, 4, 0); this.controls.enableDamping = true; this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 3; this.controls.maxDistance = 90; this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.screenSpacePanning = true; this.controls.enabled = false;
    this.particles = new ParticleSystem(s, app.qualityName);
    this.env = new Environment(s, app.renderer, this.particles, app.audio, { time: 16, cloudArea: 900 });
    this.physics = new PhysicsWorld(() => 0);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 96), Mat.ground(0x7a9a55)); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; s.add(ground);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.4, 0.35, 64), Mat.plaster(0xd9d4ca)); pad.position.y = 0.17; pad.receiveShadow = true; pad.castShadow = true; s.add(pad);
    this.padH = 0.35;
    // grade de referência
    const grid = new THREE.PolarGridHelper(9, 16, 6, 64, 0x9a9486, 0xb8b2a4); grid.position.y = 0.36; grid.material.transparent = true; grid.material.opacity = 0.35; s.add(grid);
    // props de interação e PBR: esfera cromada, vidro, metal escovado
    const props = [[Mat.metal(0xe8e8ea, 0.05), -14, 2.2], [Mat.glass(0xbfe3ff), -18, 2.2], [Mat.metal(0xc07a3a, 0.35), -22, 2.2]];
    props.forEach(([m, x, r]) => { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), m); b.position.set(x, r, -6); b.castShadow = true; b.receiveShadow = true; s.add(b); });
    this.fireSpot = new THREE.Vector3(14, 0, -6);
    this.director = new CinematicDirector(this.camera, document.getElementById('letterbox'));
    this.state = { skin: 'default', body: 'padrao', loco: 'idle', weapon: 'rifle', expr: 'neutral', compare: false, skeleton: false, secondary: true, lod: 'auto', pickaxe: 'padrao', glider: 'classico', aim: 0.0, ads: false, timeSpeed: 0 };
    this.skel = null; this.emitters = [];
    this._buildCharacter();
  }
  _buildCharacter(){
    const st = this.state;
    if(this.ch){ this.scene.remove(this.ch.root); disposeCharacter(this.ch); }
    const ch = this.ch = createCharacter(st.skin, { bodyType: st.body });
    ch.root.position.set(st.compare ? 4.5 : 0, this.padH, 0); this.scene.add(ch.root);
    this.anim = new Animator(ch);
    this.anim.enabledSecondary = st.secondary;
    this._applyWeapon();
    this.anim.face.setExpression(st.expr);
    if(this.skel){ this.scene.remove(this.skel); this.skel = null; }
    if(st.skeleton) this._makeSkeleton();
    this._legacy(st.compare);
  }
  _applyWeapon(){
    const a = this.anim, w = this.state.weapon;
    a.setWeapon(null); a.setPickaxe(null); a.setProp(null);
    if(['rifle', 'shotgun', 'sniper'].includes(w)) a.setWeapon(createWeapon(w));
    if(w === 'pickaxe') a.setPickaxe(createPickaxe(this.state.pickaxe || 'padrao'));
    if(this.glider){ this.glider.parent && this.glider.parent.remove(this.glider); this.glider = null; }
  }
  _legacy(on){
    if(this.old){ this.scene.remove(this.old); this.old = null; }
    if(this.oldLabel){ this.oldLabel.remove(); this.oldLabel = null; }
    if(!on) return;
    const S = SKINS[this.state.skin];
    const g = this.old = legacyCreate({ torso: S.top, head: S.skin, hair: S.hair, pant: S.pant, accent: S.accent, hairStyle: S.hairStyle === 'long' ? 'long' : 'short', eyeColor: S.eye }, '');
    const bb = new THREE.Box3().setFromObject(g); const h = bb.max.y - bb.min.y;
    g.scale.multiplyScalar(7.2 / Math.max(0.1, h));
    g.position.set(-4.5, this.padH - bb.min.y * (7.2 / h), 0);
    this.scene.add(g);
  }
  _makeSkeleton(){
    const J = this.ch.J, names = Object.keys(J);
    const pairs = [];
    names.forEach(n => { const p = J[n].parent; const pn = names.find(k => J[k] === p); if(pn) pairs.push([pn, n]); });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pairs.length * 6), 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x22d3ee, depthTest: false, transparent: true }));
    lines.renderOrder = 999; lines.frustumCulled = false;
    const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfbbf24, depthTest: false }), names.length);
    dots.renderOrder = 1000; dots.frustumCulled = false;
    const g = new THREE.Group(); g.add(lines, dots); g.userData = { pairs, names, lines, dots };
    this.scene.add(g); this.skel = g;
  }
  _updateSkeleton(){
    const g = this.skel; if(!g) return;
    const { pairs, names, lines, dots } = g.userData, J = this.ch.J;
    const arr = lines.geometry.attributes.position.array, a = new THREE.Vector3(), b = new THREE.Vector3(), m = new THREE.Matrix4();
    pairs.forEach(([p, c], i) => { J[p].getWorldPosition(a); J[c].getWorldPosition(b); arr.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6); });
    lines.geometry.attributes.position.needsUpdate = true;
    names.forEach((n, i) => { J[n].getWorldPosition(a); m.makeTranslation(a.x, a.y, a.z); dots.setMatrixAt(i, m); });
    dots.instanceMatrix.needsUpdate = true;
  }
  // ---------- API usada pela UI ----------
  set(k, v){
    const st = this.state; st[k] = v;
    if(k === 'skin' || k === 'body' || k === 'compare') this._buildCharacter();
    if(k === 'weapon' || k === 'pickaxe') this._applyWeapon();
    if(k === 'glider' && st.loco === 'glide'){ if(this.glider) this.ch.root.remove(this.glider); this.glider = createGlider(SKINS[st.skin].top, v); this.ch.root.add(this.glider); this.glider.position.set(0, 7.6, 0); }
    if(k === 'dive') this.dive = +v;
    if(k === 'expr') this.anim.face.setExpression(v);
    if(k === 'skeleton'){ if(v) this._makeSkeleton(); else if(this.skel){ this.scene.remove(this.skel); this.skel = null; } }
    if(k === 'secondary') this.anim.enabledSecondary = v;
    if(k === 'loco' && v === 'glide'){ this.glider = createGlider(SKINS[st.skin].top, st.glider || 'classico'); this.ch.root.add(this.glider); this.glider.position.set(0, 7.6, 0); }
    else if(k === 'loco' && this.glider){ this.ch.root.remove(this.glider); this.glider = null; }
    if(k === 'weather') this.env.setWeather(v);
    if(k === 'time') this.env.setTime(+v);
    if(k === 'timeSpeed') this.env.timeSpeed = +v;
    if(k === 'lod' && v !== 'auto') setCharacterLOD(this.ch, +v);
  }
  play(clip){ this.anim.play(clip); }
  say(text){
    const dur = this.anim.face.say(text, (tl) => { if(this.app.audio.ctx) this.app.audio.voice(tl, this.ch.root.position.clone().setY(6.5), 150); });
    this.anim.play('talk'); clearTimeout(this._sayT); this._sayT = setTimeout(() => this.anim.stop('talk'), dur * 1000);
  }
  fx(type){
    const P = this.particles, f = this.fireSpot;
    const pos = { fire: f, smoke: f, water: new THREE.Vector3(-14, 0, 6), magic: this.ch.root.position, confetti: new THREE.Vector3(0, 9, 0), digitize: this.ch.root.position, heal: this.ch.root.position, shield: this.ch.root.position, dust: this.ch.root.position }[type] || f;
    if(type === 'fire' || type === 'smoke' || type === 'water' || type === 'magic'){
      const ex = this.emitters.find(e => e.type === type);
      if(ex){ P.removeEmitter(ex); this.emitters = this.emitters.filter(e => e !== ex); if(ex.light) this.scene.remove(ex.light); return false; }
      const opt = type === 'fire' ? { n: 2, size: 1.4, r: 1.2 } : type === 'water' ? { n: 3 } : type === 'magic' ? { color: 0xa855f7, n: 2 } : { n: 2, power: 0.5, color: 0x777777 };
      const e = P.addEmitter({ type: type === 'smoke' ? 'dust' : type, rate: type === 'fire' ? 30 : 16, pos: pos.clone ? pos.clone() : pos, target: type === 'magic' ? this.ch.root : undefined, offset: type === 'magic' ? new THREE.Vector3(0, 0.3, 0) : undefined, opt });
      if(type === 'fire'){ e.light = new THREE.PointLight(0xff8a3d, 40, 30, 2); e.light.position.copy(f).setY(2); this.scene.add(e.light); }
      this.emitters.push(e); return true;
    }
    P.emit(type, pos.clone(), { n: 60, color: 0x7dd3fc });
    return null;
  }
  dropCrates(){
    for(let i = 0; i < 8; i++){
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), Mat.wood(0xb07b47)); m.castShadow = true;
      m.position.set(12 + (Math.random() - 0.5) * 6, 14 + i * 2, 6 + (Math.random() - 0.5) * 6); this.scene.add(m);
      this.physics.addBody(m, new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6), new THREE.Vector3(Math.random() * 4, Math.random() * 4, Math.random() * 4), { life: 12, r: 0.7, bounce: 0.35, friction: 0.7, onHit: (b, v) => { if(v > 8) this.app.audio.play('stepWood', m.position, { vol: Math.min(1, v / 30) }); } });
    }
  }
  cinematic(on){ if(on){ this.controls.enabled = false; this.director.play(DEFAULT_SHOTS, this.ch.root, true); } else { this.director.stop(); this.controls.enabled = this.active; this.camera.fov = 38; this.camera.updateProjectionMatrix(); } }
  lightning(){ this.env.triggerLightning(); }
  enter(){ this.controls.enabled = true; this.active = true; this._offset(); }
  exit(){ this.controls.enabled = false; this.active = false; this.director.stop(); this.camera.clearViewOffset(); }
  /** desloca o centro óptico para a esquerda do painel lateral (desktop) */
  _offset(){
    const w = innerWidth, h = innerHeight;
    if(w > 900) this.camera.setViewOffset(w, h, Math.min(360, w * 0.3) / 2, 0, w, h); else this.camera.clearViewOffset();
    this._ow = w;
  }
  update(dt){
    const st = this.state, a = this.anim, ch = this.ch;
    this.t = (this.t || 0) + dt;
    const sp = SPEEDS[st.loco] || 0;
    // locomoção "em esteira": o personagem fica no palco, a velocidade alimenta o blend tree
    const yaw = ch.root.rotation.y;
    const dir = st.loco === 'strafe' ? new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)) : st.loco === 'back' ? new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)) : new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const air = ['jump', 'freefall', 'glide'].includes(st.loco);
    a.update(dt, {
      vel: dir.multiplyScalar(sp), grounded: !air, vy: st.loco === 'jump' ? Math.sin(this.t * 2) * 20 : -10,
      mode: st.loco === 'freefall' ? 'freefall' : st.loco === 'glide' ? 'glide' : 'ground',
      crouch: st.loco.startsWith('crouch'), weapon: st.weapon, aimPitch: st.aim, aiming: st.ads, lookTarget: st.lookCam ? this.camera.position : null, dive: this.dive || 0, bank: st.loco === 'glide' || st.loco === 'freefall' ? Math.sin((this.t || 0) * 0.8) * 0.4 : 0
    });
    ch.root.position.y = this.padH + (air ? 3 + Math.sin(this.t * 1.5) * 0.4 : 0);
    if(this.old){ legacyAnimate(this.old, dt, st.loco === 'idle' ? 'idle' : sp > 18 ? 'run' : sp > 0 ? 'walk' : 'idle', this.t); }
    if(st.lod === 'auto') setCharacterLOD(ch, this.camera.position.distanceTo(ch.root.position) > 60 ? 2 : this.camera.position.distanceTo(ch.root.position) > 30 ? 1 : 0);
    if(this.skel) this._updateSkeleton();
    const tags = document.getElementById('compare-tags');
    if(tags){
      tags.style.display = this.old ? 'block' : 'none';
      if(this.old){
        [[this.old, 0], [ch.root, 1]].forEach(([o, i]) => { const p = o.position.clone().setY(8.6).project(this.camera); const el = tags.children[i]; el.style.transform = `translate(${(p.x * 0.5 + 0.5) * innerWidth}px, ${(-p.y * 0.5 + 0.5) * innerHeight}px) translate(-50%,-100%)`; });
      }
    }
    if(this._ow !== innerWidth) this._offset();
    if(this.director.active) this.director.update(dt); else this.controls.update();
    this.physics.updateBodies(dt);
    this.env.focus && this.env.focus.copy(this.controls.target);
    this.env.update(dt, this.camera);
    this.particles.update(dt);
    this.app.audio.updateListener(this.camera);
  }
  buildUI(root){
    const sel = (id, label, opts, val) => `<label class="st-row"><span>${label}</span><select data-k="${id}">${Object.entries(opts).map(([k, v]) => `<option value="${k}" ${k === val ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`;
    const tog = (id, label, on) => `<label class="st-tog"><input type="checkbox" data-k="${id}" ${on ? 'checked' : ''}><i></i><span>${label}</span></label>`;
    const st = this.state;
    root.innerHTML = `
      <div class="st-sec"><h4>Personagem</h4>
        ${sel('skin', 'Skin', Object.fromEntries(Object.entries(SKINS).map(([k, v]) => [k, v.name])), st.skin)}
        ${sel('body', 'Tipo de corpo (retarget)', Object.fromEntries(Object.entries(BODY_TYPES).map(([k, v]) => [k, v.label])), st.body)}
        ${sel('weapon', 'Item na mão', { none: 'Mãos livres', pickaxe: 'Picareta', rifle: 'Fuzil', shotgun: 'Escopeta', sniper: 'Sniper' }, st.weapon)}
        ${sel('pickaxe', 'Estilo da picareta', Object.fromEntries(Object.entries(PICKAXES).map(([k, v]) => [k, v.name])), st.pickaxe)}
        ${sel('glider', 'Planador', Object.fromEntries(Object.entries(GLIDERS).map(([k, v]) => [k, v.name])), st.glider)}
        ${sel('lod', 'LOD', { auto: 'Automático', 0: 'LOD0 (alto)', 1: 'LOD1', 2: 'LOD2 (baixo)' }, st.lod)}
      </div>
      <div class="st-sec"><h4>Animação — blend tree</h4>
        ${sel('loco', 'Locomoção', LOCO, st.loco)}
        <label class="st-row"><span>Mira (pitch) <b data-v="aim">0°</b></span><input type="range" min="-0.9" max="0.9" step="0.01" value="0" data-k="aim"></label>
        ${tog('ads', 'Mirar (ADS)', st.ads)}
        <label class="st-row"><span>Queda: mergulho ↔ frear</span><input type="range" min="-1" max="1" step="0.01" value="0" data-k="dive"></label>
        <div class="st-grid">${ACTIONS.map(c => `<button class="st-btn" data-clip="${c}">${ACTION_LABELS[c]}</button>`).join('')}</div>
      </div>
      <div class="st-sec"><h4>Emotes</h4><div class="st-grid">${EMOTES.map(e => `<button class="st-btn" data-clip="${e.id}">${e.label}</button>`).join('')}<button class="st-btn" data-stop="1">Parar</button></div></div>
      <div class="st-sec"><h4>Rosto — blend shapes</h4>
        ${sel('expr', 'Expressão', EXPRESSION_LABELS, st.expr)}
        <label class="st-row"><span>Lip sync (texto)</span><div class="st-say"><input type="text" id="st-say-text" value="Olá! Bora jogar uma partida?"><button class="st-btn" id="st-say">Falar</button></div></label>
        ${tog('lookCam', 'Olhar para a câmera', false)}
      </div>
      <div class="st-sec"><h4>Rig & física secundária</h4>
        ${tog('skeleton', 'Mostrar esqueleto (IK/FK)', st.skeleton)}
        ${tog('secondary', 'Física secundária (cabelo, roupa, músculos)', st.secondary)}
        ${tog('compare', 'Comparar ANTES × DEPOIS', st.compare)}
      </div>
      <div class="st-sec"><h4>Render</h4>
        ${sel('view', 'Visualização', { material: 'Material (PBR)', solid: 'Sólido', wireframe: 'Wireframe', normals: 'Normais', raytrace: 'Ray-tracing (SSR + GTAO)' }, this.app.renderer.viewMode)}
        ${sel('quality', 'Qualidade', Object.fromEntries(Object.entries(QUALITY).map(([k, v]) => [k, v.label])), this.app.qualityName)}
        ${tog('dof', 'Profundidade de campo', false)}
      </div>
      <div class="st-sec"><h4>Ambiente</h4>
        ${sel('weather', 'Clima', Object.fromEntries(Object.entries(WEATHER).map(([k, v]) => [k, v.label])), this.env.weatherName)}
        <label class="st-row"><span>Hora <b data-v="time">16:00</b></span><input type="range" min="0" max="24" step="0.1" value="16" data-k="time"></label>
        ${tog('timeSpeedOn', 'Ciclo dia/noite acelerado', false)}
        <div class="st-grid"><button class="st-btn" data-act="lightning">Raio</button><button class="st-btn" data-act="crates">Soltar caixas (física)</button></div>
      </div>
      <div class="st-sec"><h4>Partículas</h4><div class="st-grid">
        <button class="st-btn" data-fx="fire">Fogo</button><button class="st-btn" data-fx="smoke">Fumaça</button><button class="st-btn" data-fx="water">Água</button><button class="st-btn" data-fx="magic">Magia</button>
        <button class="st-btn" data-fx="confetti">Confete</button><button class="st-btn" data-fx="digitize">Digitalizar</button><button class="st-btn" data-fx="heal">Cura</button><button class="st-btn" data-fx="shield">Escudo</button>
      </div></div>
      <div class="st-sec"><h4>Câmera</h4><div class="st-grid"><button class="st-btn" data-act="cine">Modo cinematográfico</button><button class="st-btn" data-act="reset">Reset câmera</button><button class="st-btn" data-act="face">Close no rosto</button></div>
      <p class="st-hint">Arrastar: orbitar · Scroll: zoom · Botão direito / Shift: pan</p></div>`;
    root.addEventListener('change', (e) => {
      const k = e.target.dataset.k; if(!k) return;
      const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      if(k === 'view') this.app.renderer.setViewMode(v);
      else if(k === 'quality') this.app.setQuality(v);
      else if(k === 'dof') this.app.renderer.setDOF(v, this.camera.position.distanceTo(this.controls.target));
      else if(k === 'timeSpeedOn') this.set('timeSpeed', v ? 0.6 : 0);
      else if(k === 'aim') this.set('aim', +v);
      else this.set(k, v);
      this.app.audio.play('ui', null, { vol: 0.25 });
    });
    root.addEventListener('input', (e) => {
      const k = e.target.dataset.k;
      if(k === 'aim'){ this.set('aim', +e.target.value); root.querySelector('[data-v=aim]').textContent = Math.round(+e.target.value * 57.3) + '°'; }
      if(k === 'dive') this.dive = +e.target.value;
      if(k === 'time'){ this.set('time', +e.target.value); const h = +e.target.value; root.querySelector('[data-v=time]').textContent = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`; }
    });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if(!b) return;
      this.app.audio.play('ui', null, { vol: 0.3 });
      if(b.dataset.clip) this.play(b.dataset.clip);
      if(b.dataset.stop) this.anim.stopEmotes();
      if(b.dataset.fx){ const r = this.fx(b.dataset.fx); if(r !== null) b.classList.toggle('on', r); }
      if(b.id === 'st-say') this.say(root.querySelector('#st-say-text').value);
      const act = b.dataset.act;
      if(act === 'lightning') this.lightning();
      if(act === 'crates') this.dropCrates();
      if(act === 'cine'){ const on = !this.director.active; this.cinematic(on); b.classList.toggle('on', on); }
      if(act === 'reset'){ this.cinematic(false); this.camera.position.set(9, 7, 20); this.controls.target.set(0, 4, 0); }
      if(act === 'face'){ this.cinematic(false); const p = this.ch.root.position; this.controls.target.set(p.x, 6.2, p.z); this.camera.position.set(p.x + 1.2, 6.6, p.z + 4.2); }
    });
  }
}
