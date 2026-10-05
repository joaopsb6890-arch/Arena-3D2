// ============================================================
// v22: SISTEMAS NOVOS (dentro da partida)
//  • consumíveis: bandagens (J) e mini escudos (O)
//  • DBNO: derrubado em modos de equipa, sangra, colega reanima (segurar E 4 s); bots também reanimam
//  • dano de queda, salto por cima de obstáculos baixos (vault), reabrir o planador em quedas altas
//  • marcadores: L / botão do meio marcam o local sob a mira; clique no mapa grande (M) marca no mapa
//  • sprays (U), acessórios de armas (mira, punho, carregador, silenciador) consoante a raridade
//  • inventário (I) com raridades e arrastar-e-largar (também na barra de armas)
//  • kill cam + replay (últimos 5 s), espectador (em match.js)
//  • anti-batota básico (velocidade e dano recebidos pela rede), legendas de som, oclusão de áudio,
//    reverb dinâmico (interior/exterior), música dinâmica, chat de voz (segurar K) no multijogador
//  • ranking Elo com divisões (no fim da partida)
// ============================================================
import * as THREE from 'three';
import { WEAPON_STATS, RARITY } from './weapons.js';
import { MAP_R } from './world.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
export const ATTACH = { mira: { n: 'Mira red dot', d: '-30% dispersão a apontar' }, punho: { n: 'Punho vertical', d: '-40% recuo' }, carregador: { n: 'Carregador estendido', d: '+40% munição' }, silenciador: { n: 'Silenciador', d: 'tiros discretos' } };
export const SPRAYS = { gg: { n: 'GG', c: '#facc15' }, coracao: { n: 'Coração', c: '#ef4444' }, caveira: { n: 'Caveira', c: '#e5e7eb' }, raio: { n: 'Raio', c: '#38bdf8' }, estrela: { n: 'Estrela', c: '#a855f7' }, lhama: { n: 'Lhama', c: '#f472b6' } };
export const DIVISIONS = [[0, 'Bronze'], [1100, 'Prata'], [1250, 'Ouro'], [1400, 'Platina'], [1550, 'Diamante'], [1700, 'Elite'], [1850, 'Campeão'], [2000, 'Unreal']];
export function division(elo){ let d = DIVISIONS[0], i = 0; DIVISIONS.forEach((x, k) => { if(elo >= x[0]){ d = x; i = k; } }); const next = DIVISIONS[i + 1]; if(d[1] === 'Unreal') return d[1]; const span = (next ? next[0] : d[0] + 150) - d[0]; return d[1] + ' ' + ['I', 'II', 'III'][Math.max(0, Math.min(2, Math.floor((elo - d[0]) / span * 3)))]; }

function sprayTexture(key){
  const S = SPRAYS[key] || SPRAYS.gg, c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.translate(64, 64); x.fillStyle = S.c; x.strokeStyle = 'rgba(0,0,0,.6)'; x.lineWidth = 6; x.lineJoin = 'round';
  const star = (r1, r2, n) => { x.beginPath(); for(let i = 0; i < n * 2; i++){ const a = i / (n * 2) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? r2 : r1; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); };
  if(key === 'coracao'){ x.beginPath(); x.moveTo(0, 40); x.bezierCurveTo(-70, -10, -30, -60, 0, -22); x.bezierCurveTo(30, -60, 70, -10, 0, 40); x.stroke(); x.fill(); }
  else if(key === 'caveira'){ x.beginPath(); x.arc(0, -8, 40, 0, Math.PI * 2); x.stroke(); x.fill(); x.fillRect(-22, 22, 44, 22); x.fillStyle = '#111'; x.beginPath(); x.arc(-15, -10, 11, 0, 7); x.arc(15, -10, 11, 0, 7); x.fill(); x.fillRect(-3, 6, 6, 10); }
  else if(key === 'raio'){ x.beginPath(); [[10, -56], [-26, 6], [-2, 6], [-14, 56], [28, -10], [4, -10], [18, -56]].forEach(([a, b], i) => i ? x.lineTo(a, b) : x.moveTo(a, b)); x.closePath(); x.stroke(); x.fill(); }
  else if(key === 'estrela'){ star(54, 24, 5); x.stroke(); x.fill(); }
  else if(key === 'lhama'){ x.beginPath(); x.ellipse(0, 18, 34, 24, 0, 0, 7); x.rect(16, -46, 16, 56); x.stroke(); x.fill(); x.fillStyle = '#111'; x.beginPath(); x.arc(26, -36, 4, 0, 7); x.fill(); }
  else { x.font = '900 66px Impact, system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.strokeText('GG', 0, 4); x.fillText('GG', 0, 4); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Sys22 {
  constructor(m){
    this.m = m; this.app = m.app; this.markers = []; this.sprays = []; this.rec = []; this.recT = 0; this.kc = null;
    this.combatT = 0; this.capT = 0; this.revT = 0; this.tips = new Set();
    this.st = this.app.settings || {};
    // captions
    this.cap = document.createElement('div'); this.cap.id = 'captions'; ($('hud') || document.body).appendChild(this.cap);
    // oclusão de áudio: som atrás de paredes fica abafado
    const A = m.audio; A.occlude = (pos) => { const cam = m.camera.position; if(cam.distanceToSquared(pos) > 160 * 160) return false; return !m.physics.lineClear(_v.copy(cam), _v2.copy(pos).setY(pos.y + 1.5)); };
    // mapa grande: clique marca
    const cv = $('minimap-canvas');
    if(cv){ this._mmClick = (e) => { if(!$('minimap').classList.contains('big')) return; const r = cv.getBoundingClientRect(), W = cv.width, MR = 1060; const px = (e.clientX - r.left) / r.width * W, py = (e.clientY - r.top) / r.height * W; const scale = W / (this._mapR() * 2.2); const x = (W / 2 - px) / scale, z = (W / 2 - py) / scale; this.mark(new THREE.Vector3(x, m.physics.heightAt(x, z), z), true); e.preventDefault(); }; cv.addEventListener('mousedown', this._mmClick); cv.style.pointerEvents = 'auto'; }
    this._inv = null;
    this._voice();
  }
  _mapR(){ return MAP_R; }
  get uiOpen(){ return !!((this._inv && this._inv.classList.contains('on')) || this._mapOpen); }
  mapToggled(big){ this._mapOpen = big; if(big){ document.exitPointerLock && document.exitPointerLock(); if(!this.tips.has('map')){ this.tips.add('map'); this.m.toast('Clica no mapa para colocar um marcador'); } } else if(!this.m.paused && this.app.lockPointer) this.app.lockPointer(); }
  // ---------------- teclas ----------------
  onKey(e){
    const m = this.m, P = m.player; if(!P) return false;
    if(this.kc){ if(e.code === 'Space' || e.code === 'Escape'){ this.endKillcam(); return true; } return true; }
    if(e.code === 'KeyI' && !e.repeat){ this.toggleInv(); return true; }
    if(this._inv && this._inv.classList.contains('on')){ if(e.code === 'Escape'){ this.toggleInv(false); return true; } return false; }
    if(this._mapOpen && e.code === 'Escape'){ $('minimap').classList.remove('big'); this.mapToggled(false); return true; }
    if(!P.alive) return false;
    if(e.code === 'KeyJ' && !e.repeat){ if(!P.useItem('bandage')) m.toast(P.bandages <= 0 ? 'Sem bandagens' : 'As bandagens só curam até 75'); return true; }
    if(e.code === 'KeyO' && !e.repeat){ if(!P.useItem('mini')) m.toast(P.minis <= 0 ? 'Sem mini escudos' : 'Os mini escudos só enchem até 50'); return true; }
    if(e.code === 'KeyL' && !e.repeat){ this.pingAim(); return true; }
    if(e.code === 'KeyU' && !e.repeat){ this.spray(); return true; }
    if(e.code === 'KeyK' && !e.repeat){ this.talk(true); return true; }
    // reabrir o planador numa queda alta (paraquedas)
    if(e.code === 'Space' && P.mode === 'ground' && !P.body.grounded && !P.kart && !P.climbing && this._height(P) > 28 && P.body.vel.y < -12){ P.setMode('glide'); m.toast('Planador aberto'); m.audio.play('woosh', P.root.position, { vol: 0.6 }); return true; }
    return false;
  }
  onKeyUp(e){ if(e.code === 'KeyK') this.talk(false); }
  _height(a){ return a.body.pos.y - this.m.physics.groundAt(a.body.pos.x, a.body.pos.z, a.body.pos.y, 0); }
  // ---------------- DBNO ----------------
  canDown(a){ const M = this.m.mode; return !!(M.squad || M.teams || M.zombies) && !a.downed && !a.remote && this.m.rules.alliesAlive(a) > 0 && this.m.actors.some(o => o !== a && o.alive && !o.downed && this.m.isAlly(a, o)); }
  tryDown(a, from){
    if(!this.canDown(a)) return false;
    a.downed = true; a.hp = 100; a.shield = 0; a.downBy = from; a._sm0 = a.speedMul || 1; a.speedMul = 0.32; a.crouch = true; a.sprint = false; a.cancelUse && a.cancelUse();
    a.anim.setWeapon(null); if(a.pickaxe) a.pickaxe.visible = false;
    if(a.isPlayer){ this.m.toast('DERRUBADO — um colega pode reanimar-te', 'kill'); this.m.tps.addTrauma(0.4); }
    else if(from && from.isPlayer) this.m.toast('DERRUBASTE ' + a.name.toUpperCase());
    this.m.audio.play('hit', a.root.position, { vol: 0.8, rate: 0.6 });
    // se toda a equipa estiver derrubada, morrem todos
    if(!this.m.actors.some(o => o.alive && !o.downed && (o === a || this.m.isAlly(a, o)) && o !== a)) { setTimeout(() => this.m.actors.filter(o => o.alive && o.downed && (o === a || this.m.isAlly(a, o))).forEach(o => { o.downed = false; o.die(o.downBy || null); }), 300); }
    return true;
  }
  revive(a, by){
    a.downed = false; a.hp = 30; a.speedMul = a._sm0 || 1; a.crouch = false; a._equipped = null; a.equip(a.slot);
    this.m.particles.emit('heal', a.root.position, { n: 20 }); this.m.audio.play('celebrate', a.root.position, { vol: 0.4 });
    if(a.isPlayer) this.m.toast('Reanimado por ' + (by ? by.name : 'um colega')); else if(by && by.isPlayer){ this.m.toast('Reanimaste ' + a.name); if(this.m.quest) this.m.quest('revive'); }
  }
  interact(P){ const d = this._downedNear(P); if(d){ this._revTarget = d; return true; } return false; }
  _downedNear(P){ return this.m.actors.find(o => o !== P && o.alive && o.downed && this.m.isAlly(P, o) && o.root.position.distanceTo(P.root.position) < 5.5); }
  hint(P){ if(P.downed) return 'DERRUBADO · rasteja até um colega'; const d = this._downedNear(P); if(d) return '<kbd>E</kbd> segurar para reanimar ' + d.name; return null; }
  // ---------------- acessórios ----------------
  rollAttachments(a, w, rar){
    if(w === 'pickaxe') return; a.att = a.att || {}; const pool = Object.keys(ATTACH).filter(k => !(k === 'silenciador' && w === 'shotgun')), n = Math.min(pool.length, rar || 0), got = [];
    while(got.length < n){ const k = pool[Math.floor(Math.random() * pool.length)]; if(!got.includes(k)) got.push(k); }
    a.att[w] = got; if(a.isPlayer && got.length) this.m.toast('Acessórios: ' + got.map(k => ATTACH[k].n).join(', '));
  }
  // ---------------- tiros (música, legendas, kill cam) ----------------
  onShot(shooter, pos){
    const P = this.m.player; if(!P) return;
    const d = pos.distanceTo(P.root.position);
    if(shooter === P || d < 70) this.combatT = 6;
    if(shooter !== P && d < 140) this.caption('Tiros', pos);
  }
  caption(txt, pos){
    if(this.st.captions === false || this.capT > 0) return; this.capT = 0.6;
    const m = this.m, cam = m.camera; let dir = '';
    if(pos){ cam.getWorldDirection(_v); const a = Math.atan2(pos.x - cam.position.x, pos.z - cam.position.z) - Math.atan2(_v.x, _v.z); const w = Math.atan2(Math.sin(a), Math.cos(a)); dir = Math.abs(w) < 0.5 ? '▲' : Math.abs(w) > 2.6 ? '▼' : w > 0 ? '◀' : '▶'; }
    const el = document.createElement('div'); el.innerHTML = `<b>${dir}</b> ${txt}`; this.cap.appendChild(el); setTimeout(() => el.remove(), 2400); while(this.cap.children.length > 4) this.cap.firstChild.remove();
  }
  // ---------------- marcadores ----------------
  pingAim(){
    const m = this.m, P = m.player, o = m.aimOrigin, d = m.aimDir; if(!o || !d) return;
    const h = m._cast(o, d, m.tps.curDist + 1, 500, m._targets(P));
    this.mark(h ? h.point.clone() : o.clone().addScaledVector(d, 120), false);
  }
  mark(pos, fromMap, remote){
    const m = this.m;
    const own = this.markers.filter(k => !k.remote); if(!remote && own.length >= 3){ const k = own[0]; this._rmMarker(k); }
    const col = remote ? 0x60a5fa : 0xfacc15;
    const g = new THREE.Group(); g.position.copy(pos);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 120, 8, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.position.y = 60; g.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.2, 24), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3; g.add(ring);
    g.traverse(c => { c.userData.noProbe = true; c.frustumCulled = false; }); m.scene.add(g);
    const lab = document.createElement('div'); lab.className = 'mk-lab' + (remote ? ' remote' : ''); ($('hud') || document.body).appendChild(lab);
    const k = { pos: pos.clone(), g, lab, t: fromMap ? 600 : 30, remote: !!remote }; this.markers.push(k);
    m.audio.play('ui', null, { vol: 0.5, rate: 1.3 });
    if(!remote && m.net) m.net.s.ev({ k: 'ping', x: Math.round(pos.x), y: Math.round(pos.y), z: Math.round(pos.z), map: fromMap ? 1 : 0 });
    if(!remote) m.toast(fromMap ? 'Marcador colocado no mapa' : 'Local marcado');
  }
  _rmMarker(k){ this.m.scene.remove(k.g); k.g.traverse(c => { if(c.geometry) c.geometry.dispose(); if(c.material) c.material.dispose(); }); k.lab.remove(); this.markers.splice(this.markers.indexOf(k), 1); }
  minimapMarks(){ return this.markers.map(k => ({ x: k.pos.x, z: k.pos.z, c: k.remote ? '#60a5fa' : '#facc15', s: 5 })); }
  // ---------------- sprays ----------------
  spray(remote){
    const m = this.m, P = m.player; let point, normal;
    if(remote){ point = new THREE.Vector3(remote.x, remote.y, remote.z); normal = new THREE.Vector3(remote.nx, remote.ny, remote.nz); }
    else {
      const o = m.aimOrigin, d = m.aimDir; if(!o) return;
      const h = m._cast(o, d, m.tps.curDist + 1, 40, m._targets(P));
      if(!h){ m.toast('Aponta para uma superfície próxima'); return; }
      point = h.point.clone(); normal = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : d.clone().negate();
      if(normal.dot(d) > 0) normal.negate();
    }
    const key = remote ? remote.s : (this.st.spray || 'gg');
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 4.5), new THREE.MeshBasicMaterial({ map: sprayTexture(key), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    mesh.position.copy(point).addScaledVector(normal, 0.06); mesh.lookAt(_v.copy(mesh.position).add(normal)); mesh.userData.noProbe = true; m.scene.add(mesh);
    this.sprays.push(mesh); if(this.sprays.length > 24){ const o = this.sprays.shift(); m.scene.remove(o); o.geometry.dispose(); o.material.map.dispose(); o.material.dispose(); }
    m.audio.play('build', point, { vol: 0.35, rate: 1.8 });
    if(!remote && m.net) m.net.s.ev({ k: 'spray', s: key, x: +point.x.toFixed(2), y: +point.y.toFixed(2), z: +point.z.toFixed(2), nx: +normal.x.toFixed(2), ny: +normal.y.toFixed(2), nz: +normal.z.toFixed(2) });
    if(!remote && m.quest) m.quest('spray');
  }
  // ---------------- inventário (arrastar e largar) ----------------
  toggleInv(on){
    const m = this.m, P = m.player;
    if(!this._inv){ this._inv = document.createElement('div'); this._inv.id = 'inv22'; ($('hud') || document.body).appendChild(this._inv); this._bindDnD(this._inv); }
    on = on ?? !this._inv.classList.contains('on');
    this._inv.classList.toggle('on', on);
    if(on){ this.renderInv(); document.exitPointerLock && document.exitPointerLock(); }
    else if(m.app.lockPointer && !m.paused) m.app.lockPointer();
  }
  renderInv(){
    const P = this.m.player, el = this._inv; if(!el || !P) return;
    const slot = (i) => { const t = P.slots[i], st = WEAPON_STATS[t], r = t === 'pickaxe' ? 0 : (P.rar[t] || 0), R = RARITY[r] || RARITY[0], at = (P.att && P.att[t]) || [];
      return `<div class="iv-slot rar-${t ? R.css : 'none'}" draggable="${i > 0 && !!t}" data-slot="${i}"><small>${i + 1}</small><b>${st ? st.name : t === 'pickaxe' ? 'Picareta' : 'vazio'}</b>${t && t !== 'pickaxe' ? `<em>${R.label}</em><span>${(P.mag[t] || 0)}/${P.reserve[t] || 0}</span>` : ''}${at.length ? `<div class="iv-att">${at.map(k => `<i title="${ATTACH[k].d}">${ATTACH[k].n}</i>`).join('')}</div>` : ''}</div>`; };
    el.innerHTML = `<div class="iv-head"><b>INVENTÁRIO</b><span>Arrasta armas para trocar de posição ou para LARGAR · I ou ESC fecha</span></div>
      <div class="iv-row">${[0, 1, 2, 3, 4].map(slot).join('')}<div class="iv-drop" data-drop="1">LARGAR</div></div>
      <div class="iv-row iv-cons">
        <div><b>${P.potions}</b><span>Poções de escudo (H)</span></div><div><b>${P.minis || 0}</b><span>Mini escudos (O)</span></div>
        <div><b>${P.medkits}</b><span>Kits médicos (G)</span></div><div><b>${P.bandages || 0}</b><span>Bandagens (J)</span></div>
        <div><b>${P.grenades || 0}</b><span>Granadas (X)</span></div>
        <div><b>${P.mats.wood}</b><span>Madeira</span></div><div><b>${P.mats.stone}</b><span>Pedra</span></div><div><b>${P.mats.metal}</b><span>Metal</span></div>
      </div>`;
  }
  _bindDnD(root){
    // inventário + barra de armas do HUD partilham a lógica (slots com data-slot / ids slot-N)
    const slotOf = (el) => { if(!el) return -1; const s = el.closest('[data-slot]'); if(s) return +s.dataset.slot; const h = el.closest('[id^="slot-"]'); return h ? +h.id.slice(5) - 1 : -1; };
    const onStart = (e) => { const i = slotOf(e.target); if(i <= 0 || !this.m.player.slots[i]) { e.preventDefault(); return; } this._drag = i; e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; };
    const onOver = (e) => { if(this._drag == null) return; e.preventDefault(); };
    const onDrop = (e) => { e.preventDefault(); const from = this._drag; this._drag = null; if(from == null) return; const P = this.m.player;
      if(e.target.closest('[data-drop]')){ this.dropSlot(from); return; }
      const to = slotOf(e.target); if(to <= 0 || to === from) return;
      const t = P.slots[to]; P.slots[to] = P.slots[from]; P.slots[from] = t; P._equipped = null; if(P.slot === from) P.equip(to); else if(P.slot === to) P.equip(from); else P.equip(P.slot);
      this.m._updateSlotsUI(); this.renderInv(); this.m.audio.play('ui', null, { vol: 0.4 }); };
    root.addEventListener('dragstart', onStart); root.addEventListener('dragover', onOver); root.addEventListener('drop', onDrop);
    if(!this._hotbar){ this._hotbar = true; for(let i = 1; i <= 5; i++){ const el = $('slot-' + i); if(!el) continue; el.draggable = i > 1; el.addEventListener('dragstart', onStart); el.addEventListener('dragover', onOver); el.addEventListener('drop', onDrop); } }
  }
  dropSlot(i){
    const m = this.m, P = m.player, t = P.slots[i]; if(i <= 0 || !t) return;
    m.world.spawnPickup(t, P.root.position.clone().add(_v.set(Math.sin(P.yaw) * 4, 0, Math.cos(P.yaw) * 4)), 1, { rar: P.rar[t] || 0 });
    P.slots[i] = null; if(P.slot === i) P.equip(0); m._updateSlotsUI(); this.renderInv(); m.toast('Largaste ' + WEAPON_STATS[t].name);
  }
  // ---------------- kill cam + replay ----------------
  _record(dt){
    this.recT -= dt; if(this.recT > 0) return; this.recT = 1 / 20;
    const fr = this.m.actors.map(a => [a.root.position.x, a.root.position.y, a.root.position.z, a.root.rotation.y, a.alive ? 1 : 0, a.root.visible ? 1 : 0]);
    this.rec.push(fr); if(this.rec.length > 110) this.rec.shift();
  }
  killcam(killer, done){
    const m = this.m; if(!killer || killer === m.player || this.rec.length < 20){ done(); return; }
    this.kc = { frames: this.rec.slice(-100), t: 0, killer: m.actors.indexOf(killer), victim: m.actors.indexOf(m.player), done, name: killer.name };
    let el = $('killcam'); if(!el){ el = document.createElement('div'); el.id = 'killcam'; document.body.appendChild(el); }
    el.innerHTML = `<b>KILL CAM</b><span>Eliminado por <i>${killer.name}</i>${killer.alive ? ` · ${Math.round(killer.hp)} vida · ${Math.round(killer.shield)} escudo` : ''}</span><small>ESPAÇO para saltar</small>`; el.classList.add('on');
    document.body.classList.add('kc-on');
  }
  replay(){ if(this.rec.length < 20) return false; const ov = ['victory', 'defeat'].map($).find(e => e && !e.classList.contains('hide')); if(ov) ov.classList.add('hide');
    const P = this.m.player, by = P.lastHitBy || this.m.actors.find(a => a !== P);
    this.kc = { frames: this.rec.slice(-100), t: 0, killer: Math.max(0, this.m.actors.indexOf(by)), victim: this.m.actors.indexOf(P), done: () => { if(ov) ov.classList.remove('hide'); }, name: by ? by.name : '' };
    let el = $('killcam'); if(!el){ el = document.createElement('div'); el.id = 'killcam'; document.body.appendChild(el); } el.innerHTML = '<b>REPLAY</b><span>Últimos 5 segundos</span><small>ESPAÇO para sair</small>'; el.classList.add('on'); return true; }
  updateKillcam(dt){
    const k = this.kc, m = this.m; k.t += dt * 20 * 0.75;   // 0,75× velocidade (câmara lenta ligeira)
    const i = Math.min(k.frames.length - 1, Math.floor(k.t)), f = k.frames[i], f2 = k.frames[Math.min(k.frames.length - 1, i + 1)], u = k.t - Math.floor(k.t);
    m.actors.forEach((a, j) => { const s = f[j], s2 = f2[j]; if(!s) return; a.root.position.set(s[0] + (s2[0] - s[0]) * u, s[1] + (s2[1] - s[1]) * u, s[2] + (s2[2] - s[2]) * u); a.root.rotation.y = s[3]; a.root.visible = !!s[5]; });
    const K = m.actors[k.killer], V = m.actors[k.victim];
    if(K && V){ const kp = K.root.position, vp = V.root.position; _v.subVectors(kp, vp).setY(0).normalize(); const cam = m.camera;
      // câmara por cima do ombro do atacante; aproxima-se se houver parede entre a câmara e o atacante
      const head = _v3.copy(kp).setY(kp.y + 5.5); let want = _v2.copy(kp).addScaledVector(_v, 8).setY(kp.y + 7);
      for(let d = 8; d > 1 && !m.physics.lineClear(head, want); d -= 1.5) want.copy(kp).addScaledVector(_v, d).setY(kp.y + 6.5);
      if(!k.init){ cam.position.copy(want); k.init = true; } else cam.position.lerp(want, 1 - Math.exp(-dt * 8)); cam.lookAt(vp.x, vp.y + 4, vp.z); }
    if(i >= k.frames.length - 1) this.endKillcam();
  }
  endKillcam(){
    const k = this.kc; if(!k) return; this.kc = null; const el = $('killcam'); if(el) el.classList.remove('on'); document.body.classList.remove('kc-on');
    this.m.actors.forEach(a => { a.root.position.copy(a.body.pos); if(!a.alive) a.root.visible = false; });
    if(k.done) k.done();
  }
  // ---------------- ranking Elo ----------------
  rank(win, place){
    const app = this.app, c = app.career; if(!c) return '';
    const M = this.m.mode, n = Math.max(2, this.m.actors.length);
    const score = M.bus ? (win ? 1 : 1 - (place - 1) / (n - 1)) : (win ? 1 : 0.25);
    const elo0 = c.elo || 1000, opp = 950 + (M.skill || 0.6) * 200 + (this.m.session ? 120 : 0);
    const exp = 1 / (1 + Math.pow(10, (opp - elo0) / 400)), K = 40;
    const d = Math.round(K * (score - exp) + this.m.player.kills * 2);
    c.elo = Math.max(0, elo0 + d); c.eloBest = Math.max(c.eloBest || 0, c.elo);
    try { if(app.store) app.store.set('career', c); } catch(e){}
    if(app.hub && app.hub.me){ app.hub.me.elo = c.elo; }
    return ' · Ranking ' + division(c.elo) + ' (' + c.elo + ', ' + (d >= 0 ? '+' : '') + d + ')';
  }
  // ---------------- chat de voz (segurar K) ----------------
  _voice(){
    const s = this.m.session; if(!s || !s.room) return;
    this.audioEls = new Map();
    s.room.onPeerStream = (stream, peerId) => { let a = this.audioEls.get(peerId); if(!a){ a = new Audio(); a.autoplay = true; this.audioEls.set(peerId, a); } a.srcObject = stream; a.play().catch(() => {}); };
  }
  async talk(on){
    const s = this.m.session; if(!s || !s.room){ if(on) this.m.toast('Chat de voz só no multijogador'); return; }
    if(on && !this.mic){
      try { this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); s.room.addStream(this.mic); }
      catch(e){ this.m.toast('Microfone bloqueado ou indisponível'); this.mic = null; return; }
    }
    if(this.mic) this.mic.getAudioTracks().forEach(t => t.enabled = !!on);
    let el = $('voice-ind'); if(!el){ el = document.createElement('div'); el.id = 'voice-ind'; el.textContent = 'A FALAR'; ($('hud') || document.body).appendChild(el); }
    el.classList.toggle('on', !!on && !!this.mic);
  }
  // ---------------- update ----------------
  update(dt){
    const m = this.m, P = m.player; if(!P) return;
    if(!this._bb){ this._bb = true; try { m._bb22 && m._bb22(); } catch(e){ console.warn(e); } }
    if(this.capT > 0) this.capT -= dt; if(this.combatT > 0) this.combatT -= dt;
    this._record(dt);
    // derrubados: sangram; bots reanimam colegas próximos
    for(const a of m.actors){
      if(!a.alive || !a.downed || a.remote) continue;
      a.crouch = true; a.sprint = false;
      a.hp -= dt * 5; if(a.hp <= 0){ a.hp = 0; a.downed = false; a.speedMul = a._sm0 || 1; a.die(a.downBy || null); continue; }
      const helper = m.actors.find(o => o !== a && o.alive && !o.downed && m.isAlly(a, o) && !o.isPlayer && !o.remote && o.root.position.distanceTo(a.root.position) < 6 && !this._busy(o));
      if(helper){ a._revBy = (a._revBy || 0) + dt; if(a._revBy > 4){ a._revBy = 0; this.revive(a, helper); } } else a._revBy = 0;
    }
    // jogador a reanimar (segurar E)
    const tgt = this._downedNear(P);
    if(tgt && m.keys.KeyE && P.alive && !P.downed){ this.revT += dt; this._revBar(this.revT / 4); if(this.revT >= 4){ this.revT = 0; this.revive(tgt, P); this._revBar(0); } }
    else if(this.revT){ this.revT = 0; this._revBar(0); }
    // dano de queda + vault (só atores locais)
    for(const a of m.actors){
      if(a.remote || !a.alive || a.onBus) continue;
      const b = a.body; if(a._noFall > 0) a._noFall -= dt;
      if(b.grounded && !a._wasG && (a._pvy || 0) < -60 && a.mode === 'ground' && !a.kart && !(a._noFall > 0) && !m.mode.creative && !a.inWater){
        const dmg = Math.round((-a._pvy - 60) * 1.8); if(dmg > 0){ a.takeDamage(dmg, null, false); if(a.isPlayer){ m.toast('Dano de queda -' + dmg); m.tps.addTrauma(0.35); } m.particles.emit('dust', a.root.position, { n: 10, power: 2 }); }
      }
      a._wasG = b.grounded; a._pvy = b.vel.y;
    }
    if(P.alive && !P.kart && P.mode === 'ground') this._vault(P, dt);
    // marcadores: etiqueta com distância no ecrã
    const cam = m.camera;
    for(const k of this.markers.slice()){
      k.t -= dt; if(k.t <= 0){ this._rmMarker(k); continue; }
      k.g.children[1].rotation.z += dt; const d = Math.round(k.pos.distanceTo(P.root.position));
      _v.copy(k.pos).setY(k.pos.y + 4).project(cam); const on = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
      k.lab.style.display = on ? 'block' : 'none'; if(on){ k.lab.style.transform = `translate(${(_v.x * 0.5 + 0.5) * innerWidth}px, ${(-_v.y * 0.5 + 0.5) * innerHeight}px)`; k.lab.textContent = d + ' m'; }
      if(d < 6 && !k.remote && k.t < 595) this._rmMarker(k);
    }
    // reverb dinâmico: teto por cima → interior (mais eco)
    if((this._rvT = (this._rvT || 0) - dt) <= 0 && m.audio.wet){ this._rvT = 0.5; const p = P.body.pos; const roof = m.physics.nearBoxes(p.x - 1, p.z - 1, p.x + 1, p.z + 1).some(b => b.min.y > p.y + 3 && b.min.y < p.y + 22 && p.x > b.min.x && p.x < b.max.x && p.z > b.min.z && p.z < b.max.z); m.audio.wet.gain.setTargetAtTime(roof ? 0.5 : 0.22, m.audio.ctx.currentTime, 0.4); this.indoor = roof; }
    // legendas de eventos
    const W = m.world; if(W.storm && W.storm.shrinking && !this._stCap){ this._stCap = true; this.caption('A tempestade está a fechar', null); } if(W.storm && !W.storm.shrinking) this._stCap = false;
    // música dinâmica
    const mu = this.app.music; if(mu){ const near = m.actors.some(o => o !== P && o.alive && !m.isAlly(P, o) && o.root.position.distanceTo(P.root.position) < 55);
      mu.setState(m.phase === 'over' ? 'calm' : this.combatT > 0 ? 'combat' : (near || (W.inStorm && W.inStorm(P.root.position)) || (W.storm && W.storm.shrinking)) ? 'tension' : m.phase === 'bus' || m.phase === 'drop' ? 'drop' : 'explore'); }
    if(this._inv && this._inv.classList.contains('on') && (this._ivT = (this._ivT || 0) - dt) <= 0){ this._ivT = 0.5; this.renderInv(); }
    // dicas de primeira vez
    if(!this.tips.has('bl') && P.alive && (P.bandages > 0 || P.minis > 0)){ this.tips.add('bl'); m.toast('J = bandagem · O = mini escudo · I = inventário'); }
  }
  _busy(o){ const t = o.brain && o.brain.target; return !!(t && t.alive && t.root && !this.m.isAlly(o, t) && t.root.position.distanceTo(o.root.position) < 50); }
  _revBar(f){ let el = $('rev-bar'); if(!el){ el = document.createElement('div'); el.id = 'rev-bar'; el.innerHTML = '<span>A REANIMAR</span><i></i>'; ($('hud') || document.body).appendChild(el); } el.classList.toggle('on', f > 0); el.querySelector('i').style.width = Math.round(f * 100) + '%'; }
  _vault(P, dt){
    if(this._vc > 0){ this._vc -= dt; return; }
    const b = P.body; if(!b.grounded || !P.sprint || P.moveInput.y < 0.5) return;
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw), ax = b.pos.x + fx * 2.6, az = b.pos.z + fz * 2.6;
    const feet = b.pos.y, boxes = this.m.physics.nearBoxes(ax - 0.6, az - 0.6, ax + 0.6, az + 0.6);
    for(const bx of boxes){
      if(bx.ramp || bx.cone || ax < bx.min.x || ax > bx.max.x || az < bx.min.z || az > bx.max.z) continue;
      const hgt = bx.max.y - feet; if(hgt < 1.5 || hgt > 4.8) continue;
      const thick = Math.abs(fx) > Math.abs(fz) ? bx.max.x - bx.min.x : bx.max.z - bx.min.z; if(thick > 7) continue;
      b.vel.y = 17 + hgt * 2.4; b.vel.x = fx * 26; b.vel.z = fz * 26; b.grounded = false; this._vc = 0.9;
      P.anim.play('jump'); this.m.audio.play('woosh', P.root.position, { vol: 0.4, rate: 1.3 });
      if(!this.tips.has('vault')){ this.tips.add('vault'); this.m.toast('Vault: a correr salta-se por cima de obstáculos baixos'); }
      return;
    }
  }
  dispose(){
    const m = this.m; this.markers.slice().forEach(k => this._rmMarker(k)); this.sprays.forEach(s => { m.scene.remove(s); s.geometry.dispose(); s.material.dispose(); });
    this.cap.remove(); if(this._inv) this._inv.remove(); const cv = $('minimap-canvas'); if(cv && this._mmClick) cv.removeEventListener('mousedown', this._mmClick);
    if(this.mic) this.mic.getTracks().forEach(t => t.stop()); if(this.audioEls) this.audioEls.forEach(a => { a.srcObject = null; });
    ['rev-bar', 'voice-ind'].forEach(id => { const e = $(id); if(e) e.remove(); }); const kc = $('killcam'); if(kc) kc.classList.remove('on'); document.body.classList.remove('kc-on');
    if(m.audio) m.audio.occlude = null; if(this.app.music) this.app.music.setState('lobby');
  }
}
