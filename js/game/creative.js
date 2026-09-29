// ============================================================
// MODO CRIATIVO — editor de mapas dentro do próprio jogo.
//  • voar (F), subir/descer (Espaço / Ctrl)
//  • barra 1-9 com objetos; Tab abre o catálogo completo + menu
//  • clique esquerdo coloca (encaixe na grelha), X / botão direito apaga
//  • R gira 90°, Q/E muda o andar, M troca material (madeira/pedra/metal)
//  • Ctrl+Z desfaz · salvar/carregar (localStorage) · exportar/importar JSON
//  • "Testar mapa" abre uma partida (Mata-mata) com os spawns do mapa
// ============================================================
import * as THREE from 'three';
import { heightAt, GRID, WALL_H } from './world.js';
import { Mat } from '../engine/materials.js';

const $ = (id) => document.getElementById(id);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const MATS = ['wood', 'stone', 'metal'], MAT_LABEL = { wood: 'Madeira', stone: 'Pedra', metal: 'Metal' };

// catálogo: grid = passo de encaixe; size = caixa do fantasma
export const PREFABS = {
  wall:   { name: 'Parede', cat: 'Construção', piece: true, color: '#b07b47' },
  floor:  { name: 'Piso', cat: 'Construção', piece: true, color: '#b07b47' },
  ramp:   { name: 'Rampa', cat: 'Construção', piece: true, color: '#b07b47' },
  cone:   { name: 'Telhado', cat: 'Construção', piece: true, color: '#b07b47' },
  cabin:  { name: 'Casa', cat: 'Construção', grid: GRID, size: [2 * GRID, 20, 2 * GRID], color: '#e8dcc4', flatOnly: true },
  fence:  { name: 'Cerca', cat: 'Construção', grid: 2, size: [8, 3, 0.6], color: '#8b5a2b' },
  tree:   { name: 'Árvore', cat: 'Natureza', grid: 2, size: [8, 15, 8], color: '#4f8a35' },
  pine:   { name: 'Pinheiro', cat: 'Natureza', grid: 2, size: [8, 18, 8], color: '#2f6b3a' },
  rock:   { name: 'Rocha', cat: 'Natureza', grid: 2, size: [5, 3.5, 5], color: '#8d949c' },
  bush:   { name: 'Arbusto', cat: 'Natureza', grid: 2, size: [4, 2.6, 4], color: '#3f7d2c' },
  crate:  { name: 'Caixote', cat: 'Objetos', grid: 2, size: [4, 4, 4], color: '#a16207' },
  barrel: { name: 'Barril', cat: 'Objetos', grid: 2, size: [2.4, 3.4, 2.4], color: '#b91c1c' },
  lamp:   { name: 'Poste de luz', cat: 'Objetos', grid: 2, size: [1, 9, 1], color: '#fde047' },
  chest:  { name: 'Baú', cat: 'Jogabilidade', grid: 2, size: [3.4, 2.4, 2.2], color: '#f5c542' },
  pad:    { name: 'Plataforma de salto', cat: 'Jogabilidade', grid: 2, size: [7, 1, 7], color: '#22d3ee' },
  spawn:  { name: 'Ponto de spawn', cat: 'Jogabilidade', grid: 2, size: [3, 6, 3], color: '#e5e7eb' },
  spawnA: { name: 'Spawn equipa azul', cat: 'Jogabilidade', grid: 2, size: [3, 6, 3], color: '#3b82f6' },
  spawnB: { name: 'Spawn equipa vermelha', cat: 'Jogabilidade', grid: 2, size: [3, 6, 3], color: '#ef4444' },
  loot:   { name: 'Arma no chão', cat: 'Jogabilidade', grid: 2, size: [3, 1, 1], color: '#a855f7' }
};
const DEFAULT_BAR = ['wall', 'floor', 'ramp', 'cone', 'cabin', 'tree', 'rock', 'chest', 'spawn'];

// ---------------- instanciar um item do mapa ----------------
function spawnItem(m, it, editor){
  const W = m.world, e = { it, meshes: [] };
  const q = (it.r || 0) * Math.PI / 2;
  const addMesh = (mesh, box) => {
    mesh.traverse(o => { if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; o.userData.cEntry = e; } });
    m.scene.add(mesh); e.meshes.push(mesh);
    if(box){ e.boxes = e.boxes || []; e.boxes.push(m.physics.addBox(box[0], box[1])); }
    return mesh;
  };
  const P = PREFABS[it.t]; if(!P) return null;
  if(P.piece){
    e.S = m.makeStructure(it.t, V(it.x, it.y, it.z), q, null, true, it.m || 'wood');
    e.S.editor = !!editor; e.S.mesh.userData.cEntry = e;
    e.meshes.push(e.S.mesh);
  } else if(it.t === 'cabin'){
    e.house = W.addHouse(it.x, it.z, 2);
    e.house.group.traverse(o => { if(o.isMesh) o.userData.cEntry = e; });
    e.house.targets.forEach(t => t.userData.cEntry = e);
    e.meshes.push(e.house.group);
  } else if(it.t === 'tree' || it.t === 'pine'){
    e.tree = W.addTree(it.x, it.z, it.t === 'pine', 1.15, q);
    e.proxy = addMesh(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 14, 8), HIDDEN)); e.proxy.position.set(it.x, e.tree.y + 7, it.z);
  } else if(it.t === 'rock'){
    e.rock = W.addRock(it.x, it.z, 1.3, q);
    e.proxy = addMesh(new THREE.Mesh(new THREE.SphereGeometry(2.6, 8, 6), HIDDEN)); e.proxy.position.set(it.x, e.rock.y + 1, it.z);
  } else if(it.t === 'bush'){
    const g = new THREE.Group(); g.position.set(it.x, heightAt(it.x, it.z), it.z);
    for(let i = 0; i < 5; i++){ const b = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2 + (i % 2) * 0.4, 1), Mat.paint(i % 2 ? 0x3f7d2c : 0x4d8f37)); b.position.set(Math.cos(i * 1.3) * 1.1, 1 + (i % 3) * 0.35, Math.sin(i * 1.3) * 1.1); g.add(b); }
    addMesh(g);
  } else if(it.t === 'crate'){
    const y = it.y ?? heightAt(it.x, it.z), g = new THREE.Group(); g.position.set(it.x, y, it.z); g.rotation.y = q;
    const b = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), Mat.wood(0xa16207)); b.position.y = 2; g.add(b);
    for(const [sx, sz] of [[1, 0], [0, 1]]) for(const sd of [-1, 1]){ const t = new THREE.Mesh(new THREE.BoxGeometry(sx ? 0.3 : 4.1, 4.1, sz ? 0.3 : 4.1), Mat.wood(0x6b3a17)); t.position.set(sx ? sd * 1.9 : 0, 2, sz ? sd * 1.9 : 0); g.add(t); }
    const d1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.4, 0.3), Mat.wood(0x6b3a17)); d1.position.set(0, 2, 2.05); d1.rotation.z = 0.78; g.add(d1);
    addMesh(g, [V(it.x - 2, y, it.z - 2), V(it.x + 2, y + 4, it.z + 2)]);
    m.world.raycastTargets.push(b); e.targets = [b];
  } else if(it.t === 'barrel'){
    const y = it.y ?? heightAt(it.x, it.z), g = new THREE.Group(); g.position.set(it.x, y, it.z);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 3.2, 20), Mat.paint(0xb91c1c)); b.position.y = 1.6; g.add(b);
    [0.4, 1.6, 2.8].forEach(h => { const r = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.07, 6, 24), Mat.metal(0x52525b, 0.4)); r.rotation.x = Math.PI / 2; r.position.y = h; g.add(r); });
    addMesh(g, [V(it.x - 1.1, y, it.z - 1.1), V(it.x + 1.1, y + 3.2, it.z + 1.1)]);
    m.world.raycastTargets.push(b); e.targets = [b];
  } else if(it.t === 'fence'){
    const y = heightAt(it.x, it.z), g = new THREE.Group(); g.position.set(it.x, y, it.z); g.rotation.y = q;
    [-3.8, 0, 3.8].forEach(px => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.2, 0.4), Mat.wood(0x6b3a17)); p.position.set(px, 1.6, 0); g.add(p); });
    [1, 2.3].forEach(h => { const r = new THREE.Mesh(new THREE.BoxGeometry(8, 0.3, 0.2), Mat.wood(0x8b5a2b)); r.position.y = h; g.add(r); });
    const hx = Math.abs(Math.sin(q)) > 0.5 ? 0.4 : 4, hz = Math.abs(Math.sin(q)) > 0.5 ? 4 : 0.4;
    addMesh(g, [V(it.x - hx, y, it.z - hz), V(it.x + hx, y + 3, it.z + hz)]);
  } else if(it.t === 'lamp'){
    const y = it.y ?? heightAt(it.x, it.z), g = new THREE.Group(); g.position.set(it.x, y, it.z); g.rotation.y = q;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 9, 10), Mat.metal(0x27272a, 0.5)); pole.position.y = 4.5; g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 2), Mat.metal(0x27272a, 0.5)); arm.position.set(0, 8.8, 0.9); g.add(arm);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), Mat.emissive(0xfde68a, 4)); bulb.position.set(0, 8.4, 1.8); g.add(bulb);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })); halo.position.copy(bulb.position); halo.userData.noProbe = true; g.add(halo);
    addMesh(g); e.circle = m.physics.addCircle(it.x, it.z, 0.4, y + 9);
  } else if(it.t === 'chest'){
    e.chest = W.addChest(it.x, it.z, q);
    e.chest.group.traverse(o => { if(o.isMesh) o.userData.cEntry = e; });
    e.proxy = addMesh(new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.6, 2.6), HIDDEN)); e.proxy.position.set(it.x, e.chest.pos.y + 1.2, it.z);
  } else if(it.t === 'pad'){
    e.pad = m.sys.addPad(it.x, it.z, it.y);
    e.pad.g.traverse(o => { if(o.isMesh) o.userData.cEntry = e; });
    e.proxy = addMesh(new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 1.2, 12), HIDDEN)); e.proxy.position.copy(e.pad.pos).setY(e.pad.pos.y + 0.5);
  } else if(it.t.startsWith('spawn')){
    const col = it.t === 'spawnA' ? 0x3b82f6 : it.t === 'spawnB' ? 0xef4444 : 0xe5e7eb, y = it.y ?? heightAt(it.x, it.z);
    if(editor){
      const g = new THREE.Group(); g.position.set(it.x, y, it.z); g.rotation.y = q;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.4, 20), Mat.emissive(col, 1.5)); base.position.y = 0.2; g.add(base);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 6, 16, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })); beam.position.y = 3.2; beam.userData.noProbe = true; g.add(beam);
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.2, 4), Mat.emissive(col, 2)); arrow.rotation.x = Math.PI / 2; arrow.position.set(0, 1, 1.6); g.add(arrow);
      addMesh(g);
    }
    e.spawn = { x: it.x, y, z: it.z, team: it.t === 'spawnA' ? 0 : it.t === 'spawnB' ? 1 : undefined };
  } else if(it.t === 'loot'){
    e.pickup = W.spawnPickup(it.w || ['rifle', 'shotgun', 'sniper'][Math.floor(Math.random() * 3)], V(it.x, 0, it.z));
    e.proxy = addMesh(new THREE.Mesh(new THREE.BoxGeometry(3, 2, 2), HIDDEN)); e.proxy.position.copy(e.pickup.pos);
  }
  return e;
}
function removeEntry(m, e){
  const W = m.world;
  if(e.S) m.removeStructure(e.S);
  if(e.house) W.removeHouse(e.house);
  if(e.tree) W.removeTree(e.tree);
  if(e.rock) W.removeRock(e.rock);
  if(e.chest && W.chests.includes(e.chest)) W.removeChest(e.chest);
  if(e.pad && m.sys.pads.includes(e.pad)) m.sys.removePad(e.pad);
  if(e.pickup && W.pickups.includes(e.pickup)) W.removePickup(e.pickup);
  if(e.boxes) e.boxes.forEach(b => m.physics.removeBox(b));
  if(e.circle) m.physics.removeCircle(e.circle);
  if(e.targets) e.targets.forEach(t => { const i = W.raycastTargets.indexOf(t); if(i >= 0) W.raycastTargets.splice(i, 1); });
  e.meshes.forEach(o => { if(o.parent && !e.house && !e.S) o.parent.remove(o); });
}
const HIDDEN = new THREE.MeshBasicMaterial({ visible: false });

/** monta um layout salvo numa partida; devolve as entradas e preenche layout.spawns */
export function buildLayout(m, layout, editor){
  const entries = [];
  for(const it of layout.items || []){ const e = spawnItem(m, it, editor); if(e) entries.push(e); }
  layout.spawns = entries.filter(e => e.spawn).map(e => e.spawn);
  return entries;
}

// ---------------- armazenamento ----------------
export const MapStore = {
  all(){ try { return JSON.parse(localStorage.getItem('fa_maps') || '{}'); } catch(e){ return {}; } },
  save(layout){ const a = this.all(); a[layout.name] = { name: layout.name, base: layout.base, items: layout.items, t: Date.now() }; try { localStorage.setItem('fa_maps', JSON.stringify(a)); return true; } catch(e){ return false; } },
  remove(name){ const a = this.all(); delete a[name]; localStorage.setItem('fa_maps', JSON.stringify(a)); },
  get(name){ return this.all()[name] || null; }
};

// ---------------- ferramentas do editor ----------------
export class CreativeTools {
  constructor(m){
    this.m = m; this.palette = true; this.bar = DEFAULT_BAR.slice(); this.sel = 0; this.rot = 0; this.level = 0; this.mat = 'wood';
    this.fly = false; this.menuOpen = false; this.undo = [];
    this.layout = m.layout || { name: 'Meu mapa', base: 'vazia', items: [] };
    this.layout.items = this.layout.items || [];
    this.entries = m.layoutObjs || [];
    if(!m.layoutObjs){ this.entries = buildLayout(m, this.layout, true); }
    m.layout = null;   // no editor os spawns não são usados para renascer
  }
  start(){
    const P = this.m.player;
    P.mats.wood = 99999; P.hp = 100;
    this.m.world.stormWall.visible = false;
    // marcadores de spawn já existentes: recria em modo editor
    this._ui(); this._makeGhost();
    this.m.toast('MODO CRIATIVO — Tab abre o menu, F para voar');
  }
  // ---------- entrada ----------
  onKey(e){
    const m = this.m, P = m.player, c = e.code;
    if(c === 'Tab'){ e.preventDefault(); this.toggleMenu(); return true; }
    if(this.menuOpen) return true;
    if(c.startsWith('Digit')){ const n = +c.slice(5); if(n >= 1 && n <= 9){ this.sel = n - 1; this.palette = true; this._makeGhost(); this._barUI(); return true; } if(n === 0){ this.palette = !this.palette; this._makeGhost(); this._barUI(); return true; } }
    if(c === 'KeyF'){ this.fly = !this.fly; P.flying = this.fly; m.toast(this.fly ? 'Voo ligado (Espaço sobe · Ctrl desce)' : 'Voo desligado'); return true; }
    if(c === 'KeyR' && this.palette){ this.rot = (this.rot + 1) % 4; return true; }
    if(c === 'KeyE' && this.palette){ this.level++; return true; }
    if(c === 'KeyQ' && this.palette){ this.level--; return true; }
    if(c === 'KeyM' && this.palette){ this.mat = MATS[(MATS.indexOf(this.mat) + 1) % 3]; this._barUI(); m.toast('Material: ' + MAT_LABEL[this.mat]); return true; }
    if(c === 'KeyX'){ this.deleteAim(); return true; }
    if(c === 'KeyZ' && (e.ctrlKey || e.metaKey)){ this.doUndo(); e.preventDefault(); return true; }
    if(c === 'Space' && this.fly) return true;
    if(c === 'KeyC' || c === 'ControlLeft') return this.fly;
    return false;
  }
  onMouse(e){
    if(this.menuOpen) return true;
    if(!this.palette) return false;
    if(e.button === 0){ this.place(); return true; }
    if(e.button === 2){ this.deleteAim(); return true; }
    return false;
  }
  // ---------- colocação ----------
  _target(){
    const m = this.m, key = this.bar[this.sel], P = PREFABS[key], ap = m.player.aimPoint;
    if(!ap || !P) return null;
    const yaw = m.tps.yaw, q = (Math.round(yaw / (Math.PI / 2)) + this.rot) * Math.PI / 2;
    if(P.piece){
      const cx = Math.floor(ap.x / GRID) * GRID + GRID / 2, cz = Math.floor(ap.z / GRID) * GRID + GRID / 2;
      const g = heightAt(cx, cz) - 0.3;
      const auto = Math.max(0, Math.round((ap.y - g - 1) / WALL_H));
      const y0 = g + Math.max(0, auto + this.level) * WALL_H;
      const fx = Math.round(Math.sin(q)), fz = Math.round(Math.cos(q));
      let pos;
      if(key === 'wall') pos = V(cx - fx * GRID / 2, y0 + WALL_H / 2, cz - fz * GRID / 2);
      else if(key === 'floor') pos = V(cx, y0 + 0.3, cz);
      else if(key === 'ramp') pos = V(cx, y0 + WALL_H / 2, cz);
      else pos = V(cx, y0 + WALL_H, cz);
      return { key, pos, q, r: ((Math.round(q / (Math.PI / 2)) % 4) + 4) % 4 };
    }
    const gs = P.grid || 2;
    const x = Math.round(ap.x / gs) * gs, z = Math.round(ap.z / gs) * gs;
    const ground = heightAt(x, z);
    const y = ap.y > ground + 0.8 ? ap.y : ground;
    return { key, pos: V(x, y, z), q: this.rot * Math.PI / 2, r: this.rot };
  }
  place(){
    const t = this._target(); if(!t) return;
    const m = this.m, P = PREFABS[t.key];
    if(P.flatOnly && this.layout.base !== 'vazia'){ m.toast('Casas só no mapa plano (Novo mapa → plano)'); return; }
    if(this.layout.items.length >= 600){ m.toast('Limite de 600 objetos'); return; }
    const it = { t: t.key, x: +t.pos.x.toFixed(2), y: +t.pos.y.toFixed(2), z: +t.pos.z.toFixed(2), r: t.r };
    if(P.piece) it.m = this.mat;
    if(P.piece && this.entries.some(e => e.it.t === it.t && Math.abs(e.it.x - it.x) < 0.5 && Math.abs(e.it.y - it.y) < 0.5 && Math.abs(e.it.z - it.z) < 0.5 && e.it.r % 2 === it.r % 2)) return;
    const e = spawnItem(m, it, true); if(!e) return;
    this.layout.items.push(it); this.entries.push(e);
    this.undo.push({ type: 'add', e });
    m.particles.emit('build', t.pos); m.audio.play('build', t.pos, { vol: 0.5, rate: 1.1 });
    this._countUI();
  }
  _entryAt(){
    const m = this.m; const cam = m.camera, dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    const ray = new THREE.Raycaster(cam.position, dir, m.tps.curDist, 300);
    const objs = []; this.entries.forEach(e => e.meshes.forEach(o => o.traverse(c => { if(c.isMesh) objs.push(c); })));
    const h = ray.intersectObjects(objs, false)[0];
    return h ? h.object.userData.cEntry : null;
  }
  deleteAim(){
    const e = this._entryAt(); if(!e) return;
    this._remove(e); this.undo.push({ type: 'del', it: e.it });
    this.m.audio.play('pickHit', null, { vol: 0.4, rate: 0.7 });
  }
  _remove(e){
    removeEntry(this.m, e);
    this.entries.splice(this.entries.indexOf(e), 1);
    const i = this.layout.items.indexOf(e.it); if(i >= 0) this.layout.items.splice(i, 1);
    this._countUI();
  }
  doUndo(){
    const u = this.undo.pop(); if(!u) return;
    if(u.type === 'add' && this.entries.includes(u.e)) this._remove(u.e);
    if(u.type === 'del'){ const e = spawnItem(this.m, u.it, true); if(e){ this.layout.items.push(u.it); this.entries.push(e); } }
    this._countUI();
  }
  // ---------- fantasma ----------
  _makeGhost(){
    const m = this.m;
    if(this.ghost){ m.scene.remove(this.ghost); this.ghost = null; }
    if(!this.palette) return;
    const key = this.bar[this.sel], P = PREFABS[key];
    let geo;
    if(P.piece) geo = m._pieceGeo(key);
    else { geo = new THREE.BoxGeometry(...P.size); geo.translate(0, P.size[1] / 2, 0); }
    const g = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: P.color, transparent: true, opacity: 0.3, depthWrite: false }));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xffffff })));
    g.userData.noProbe = true; g.renderOrder = 3;
    m.scene.add(g); this.ghost = g;
  }
  // ---------- loop ----------
  update(dt){
    const m = this.m, P = m.player;
    P.mats.wood = 99999; if(P.hp < 100) P.hp = 100;
    // voo
    if(this.fly && !this.menuOpen){
      const k = m.keys, up = (k.Space ? 1 : 0) - (k.ControlLeft || k.KeyC ? 1 : 0);
      P.flyUp = up;
    }
    if(this.ghost){
      const t = this._target();
      this.ghost.visible = !!t && !this.menuOpen;
      if(t){ this.ghost.position.copy(t.pos); this.ghost.rotation.set(0, t.q, 0); }
    }
    const ms = $('mode-score');
    if(ms){ const h = `<span>MODO CRIATIVO · ${this.layout.name}<small>Tab menu · F voar · 1-9 objetos · 0 mãos · R girar · Q/E andar · M material · X apagar · Ctrl+Z desfazer</small></span>`; if(ms._h !== h){ ms.innerHTML = h; ms._h = h; } ms.style.display = 'flex'; }
  }
  // ---------- UI ----------
  _ui(){
    $('creative-bar').classList.add('on'); document.body.classList.add('creative');
    $('build-bar').classList.remove('on');
    this._barUI(); this._countUI();
    const cat = $('cr-catalog');
    const cats = {}; Object.entries(PREFABS).forEach(([k, p]) => (cats[p.cat] = cats[p.cat] || []).push([k, p]));
    cat.innerHTML = Object.entries(cats).map(([c, list]) => `<h5>${c}</h5><div class="cr-grid">${list.map(([k, p]) => `<button data-pf="${k}" style="--c:${p.color}"><i></i>${p.name}</button>`).join('')}</div>`).join('');
    cat.onclick = (e) => { const b = e.target.closest('[data-pf]'); if(!b) return; this.bar[this.sel] = b.dataset.pf; this.palette = true; this._barUI(); this._makeGhost(); this.m.audio.play('ui', null, { vol: 0.4 }); };
    $('cr-name').value = this.layout.name;
    $('cr-name').onchange = () => { this.layout.name = $('cr-name').value.trim() || 'Meu mapa'; };
    $('cr-save').onclick = () => { this.layout.name = $('cr-name').value.trim() || 'Meu mapa'; const ok = MapStore.save(this.layout); this.m.toast(ok ? 'Mapa salvo: ' + this.layout.name : 'Não foi possível salvar'); this._listUI(); };
    $('cr-new-flat').onclick = () => this.m.app.startMatch('creative', { name: 'Novo mapa', base: 'vazia', items: [] });
    $('cr-new-island').onclick = () => this.m.app.startMatch('creative', { name: 'Nova ilha', base: 'ilha', items: [] });
    $('cr-test').onclick = () => { this.layout.name = $('cr-name').value.trim() || 'Meu mapa'; MapStore.save(this.layout); this.m.app.startMatch('custom', JSON.parse(JSON.stringify(this.layout))); };
    $('cr-export').onclick = () => { const blob = new Blob([JSON.stringify({ name: this.layout.name, base: this.layout.base, items: this.layout.items }, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (this.layout.name || 'mapa').replace(/[^\w-]+/g, '_') + '.json'; a.click(); };
    $('cr-import').onchange = (ev) => { const f = ev.target.files[0]; if(!f) return; f.text().then(t => { try { const L = JSON.parse(t); if(!Array.isArray(L.items)) throw 0; this.m.app.startMatch('creative', { name: L.name || f.name, base: L.base || 'vazia', items: L.items.slice(0, 600) }); } catch(e){ this.m.toast('Ficheiro inválido'); } }); };
    $('cr-close').onclick = () => this.toggleMenu(false);
    $('cr-exit').onclick = () => this.m.app.leaveMatch();
    this._listUI();
  }
  _listUI(){
    const all = MapStore.all(), el = $('cr-maps');
    const names = Object.keys(all).sort((a, b) => (all[b].t || 0) - (all[a].t || 0));
    el.innerHTML = names.length ? names.map(n => `<div class="cr-map"><b>${n.replace(/</g, '&lt;')}</b><small>${all[n].items.length} objetos · ${all[n].base === 'vazia' ? 'plano' : 'ilha'}</small><button data-load="${encodeURIComponent(n)}">Editar</button><button data-play="${encodeURIComponent(n)}">Jogar</button><button data-del="${encodeURIComponent(n)}">×</button></div>`).join('') : '<p class="cr-empty">Nenhum mapa salvo ainda.</p>';
    el.onclick = (e) => {
      const b = e.target.closest('button'); if(!b) return;
      if(b.dataset.load){ const L = MapStore.get(decodeURIComponent(b.dataset.load)); this.m.app.startMatch('creative', JSON.parse(JSON.stringify(L))); }
      if(b.dataset.play){ const L = MapStore.get(decodeURIComponent(b.dataset.play)); this.m.app.startMatch('custom', JSON.parse(JSON.stringify(L))); }
      if(b.dataset.del){ MapStore.remove(decodeURIComponent(b.dataset.del)); this._listUI(); }
    };
  }
  _barUI(){
    const el = $('creative-bar'); document.body.classList.toggle('cr-hands', !this.palette);
    el.querySelector('.cr-slots').innerHTML = this.bar.map((k, i) => `<div class="cr-slot ${i === this.sel && this.palette ? 'active' : ''}" style="--c:${PREFABS[k].color}"><span>${i + 1}</span><i></i><b>${PREFABS[k].name}</b></div>`).join('');
    el.querySelector('.cr-mat').textContent = 'Material: ' + MAT_LABEL[this.mat] + (this.palette ? '' : ' · MÃOS (0)');
  }
  _countUI(){ const c = $('cr-count'); if(c) c.textContent = this.layout.items.length + ' / 600 objetos'; }
  toggleMenu(force){
    this.menuOpen = force === undefined ? !this.menuOpen : force;
    $('creative-menu').classList.toggle('hide', !this.menuOpen);
    this.m.keys = {};
    if(this.menuOpen){ this._listUI(); if(document.pointerLockElement) document.exitPointerLock(); }
    else this.m.app.lockPointer();
    this.m.app.updateLockPrompt();
  }
  dispose(){
    $('creative-bar').classList.remove('on'); $('creative-menu').classList.add('hide'); document.body.classList.remove('creative');
    if(this.ghost) this.m.scene.remove(this.ghost);
  }
}
