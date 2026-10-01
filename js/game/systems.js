// ============================================================
// SISTEMAS DE PARTIDA (novos):
//  • Plataformas de lançamento → queda livre + planador reutilizável
//  • Entregas aéreas (supply drop) com balão, sinalizador e loot raro
//  • Ouro + NPC Mercador (IA de diálogo, lip sync, olhar, gestos)
//  • Pontos fracos na coleta (acerto crítico = dobro de material)
// ============================================================
import * as THREE from 'three';
import { heightAt, MAP_R } from './world.js';
import { Mat } from '../engine/materials.js';
import { createCharacter } from '../anim/rig.js';
import { Animator } from '../anim/animator.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const $ = (id) => document.getElementById(id);

function ringTexture(color){
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 10, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, color); grd.addColorStop(0.55, 'rgba(0,0,0,0)'); grd.addColorStop(0.75, color); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const VENDOR_LINES = {
  greet: ['Ei, viajante! Tenho coisas boas aqui.', 'Ouro na mão? Negócio fechado!', 'Chegue mais, sem medo.'],
  buy: ['Ótima escolha!', 'Volte sempre!', 'Isso vai te salvar, pode confiar.'],
  poor: ['Sem ouro, sem negócio.', 'Traga mais ouro, amigo.'],
  bye: ['Boa sorte lá fora!', 'Cuidado com a tempestade!']
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class MatchSystems {
  constructor(match){
    this.m = match; this.scene = match.scene; this.world = match.world;
    this.pads = []; this.drops = []; this.dropTimer = 55; this.weak = null;
    const md = match.modeId || 'br', br = ['br', 'zb', 'blitz'].includes(md);
    this.dropsOn = br && !match.session;
    if(md !== 'creative' && !match.layout) this._pads();
    if(br && !match.session) this._vendor();
    this.weakTex = ringTexture('rgba(56,189,248,0.95)');
  }
  // ---------------- plataformas de lançamento ----------------
  _pads(){
    const W = this.world, spots = [[150, 20], [-170, 140], [40, 250], [-250, -150], [260, -60], [-20, -260], [100, 150], [-120, -10],
      [420, 110], [-420, 210], [200, 430], [-230, -470], [460, -250], [-10, -500], [262, 262], [-440, -200]];   // v18: anel exterior + sopé do vulcão
    const baseMat = Mat.metal(0x334155, 0.35), glow = Mat.emissive(0x22d3ee, 2.2), arrow = Mat.emissive(0xfde047, 2.0);
    for(const [x0, z0] of spots){
      let x = x0, z = z0; for(let k = 0; k < 12 && !W._freeSpot(x, z, 4); k++){ x += 9; z -= 7; }
      this.addPad(x, z);
    }
  }
  addPad(x, z, y){
    {
      const baseMat = Mat.metal(0x334155, 0.35), glow = Mat.emissive(0x22d3ee, 2.2), arrow = Mat.emissive(0xfde047, 2.0);
      y = y ?? heightAt(x, z);
      const g = new THREE.Group(); g.position.set(x, y, z);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 0.7, 24), baseMat); base.position.y = 0.35; base.castShadow = base.receiveShadow = true;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.18, 8, 32), glow); ring.rotation.x = Math.PI / 2; ring.position.y = 0.75;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.12, 24), Mat.polymer(0x0f172a)); top.position.y = 0.74;
      g.add(base, ring, top);
      const arrows = [];
      for(let i = 0; i < 3; i++){ const a = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.1, 4), arrow); a.position.y = 1.3 + i * 1.2; a.userData.i = i; g.add(a); arrows.push(a); }
      this.scene.add(g);
      const em = this.m.particles.addEmitter({ type: 'magic', rate: 6, pos: V(x, y + 1, z), opt: { color: 0x22d3ee, n: 1 } });
      const pad = { g, pos: V(x, y, z), arrows, cd: new Map(), em };
      this.pads.push(pad); return pad;
    }
  }
  removePad(pad){ this.scene.remove(pad.g); this.m.particles.removeEmitter(pad.em); this.pads.splice(this.pads.indexOf(pad), 1); }
  // ---------------- entrega aérea ----------------
  _spawnDrop(){
    const S = this.world.storm, a = Math.random() * Math.PI * 2, r = Math.random() * S.r * 0.6;
    const x = THREE.MathUtils.clamp(S.cx + Math.cos(a) * r, -MAP_R * 0.7, MAP_R * 0.7), z = THREE.MathUtils.clamp(S.cz + Math.sin(a) * r, -MAP_R * 0.7, MAP_R * 0.7);
    const g = new THREE.Group(); g.position.set(x, 230, z);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.2, 3.2), Mat.paint(0x2563eb)); crate.castShadow = true;
    const bands = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.5, 3.3), Mat.metal(0xfbbf24, 0.3)); const b2 = bands.clone(); bands.position.y = 1; b2.position.y = -1;
    const bal = new THREE.Mesh(new THREE.SphereGeometry(3.2, 20, 16), Mat.paint(0x60a5fa)); bal.position.y = 9; bal.scale.set(1, 1.2, 1);
    for(let i = 0; i < 4; i++){ const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6.5, 4), Mat.polymer(0xe5e7eb)); rope.position.set(i < 2 ? -1.2 : 1.2, 4.6, i % 2 ? -1.2 : 1.2); rope.rotation.set(i % 2 ? 0.2 : -0.2, 0, i < 2 ? -0.2 : 0.2); g.add(rope); }
    const glow = new THREE.Mesh(new THREE.SphereGeometry(3.4, 14, 10), new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false })); glow.userData.noProbe = true;
    g.add(crate, bands, b2, bal, glow);
    this.scene.add(g);
    const ground = heightAt(x, z);
    const drop = { g, crate, bal, glow, pos: V(x, ground, z), landed: false, opened: false, t: 0 };
    drop.flare = this.m.particles.addEmitter({ type: 'fire', rate: 18, pos: V(x, ground + 0.5, z), opt: { n: 1, size: 0.6 } });
    this.drops.push(drop);
    this.m.toast('ENTREGA AÉREA a caminho — veja o mapa');
    this.m.audio.play('woosh', null, { vol: 0.5, rate: 0.5 });
  }
  openDrop(actor, d){
    if(!d.landed || d.opened) return false;
    d.opened = true; this.m.audio.play('chest', d.pos, { vol: 1, rate: 0.8 });
    this.m.particles.emit('confetti', d.pos.clone().setY(d.pos.y + 3), { n: 50 });
    this.m.particles.removeEmitter(d.flare);
    d.crate.material = Mat.paint(0x1e3a8a); d.glow.visible = false;
    const at = (i) => d.pos.clone().add(V(Math.sin(i) * 4, 0, Math.cos(i) * 4));
    if(actor.isPlayer){ this.world.spawnPickup(Math.random() < 0.5 ? 'sniper' : 'rifle', at(0)); this.world.spawnPickup('medkit', at(2)); this.world.spawnPickup('potion', at(4)); this.world.spawnPickup('ammo', at(1), 60); }
    else { actor.give('sniper'); actor.give('rifle'); actor.medkits++; actor.potions++; }
    this.addGold(actor, 100, d.pos);
    return true;
  }
  // ---------------- ouro + mercador ----------------
  addGold(actor, n, pos){
    actor.gold = (actor.gold || 0) + n;
    if(actor.isPlayer){ this.m._floatText(pos ? pos.clone().setY(pos.y + 4) : actor.root.position.clone().setY(actor.root.position.y + 8), '+' + n + ' ouro', 'gold'); this.m.audio.play('ui', null, { vol: 0.4, rate: 1.8 }); }
  }
  _vendor(){
    const W = this.world; let x = 20, z = 30; for(let k = 0; k < 15 && !W._freeSpot(x, z, 5); k++){ x += 8; z += 5; }
    const y = heightAt(x, z);
    const ch = createCharacter({ name: 'Mercador', hex: '#b45309', top: 0x92400e, top2: 0x451a03, pant: 0x44403c, boots: 0x292524, accent: 0xfbbf24, skin: 0xc08a60, hair: 0x6b4a2f, hairStyle: 'bun', eye: 0x4b3621, outfit: 'vest', body: 'robusto', extras: ['pouches', 'beard', 'backpack'] }, { name: 'Mercador' });
    ch.root.position.set(x, y, z); this.scene.add(ch.root);
    const anim = new Animator(ch); anim.face.setExpression('happy');
    // barraca
    const stall = new THREE.Group(); stall.position.set(x, y, z + 3.2); stall.rotation.y = Math.PI;
    const table = new THREE.Mesh(new THREE.BoxGeometry(7, 2.6, 2.4), Mat.wood(0x8b5a2b)); table.position.y = 1.3; table.castShadow = table.receiveShadow = true;
    const roofM = Mat.cloth(0xdc2626, 'fabric').clone(); roofM.side = THREE.DoubleSide;
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 5, 8, 1), roofM); roof.rotation.x = -Math.PI / 2 + 0.35; roof.position.set(0, 8.2, 0.8); roof.castShadow = true;
    [-3.8, 3.8].forEach(px => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8.4, 8), Mat.wood(0x6b3a17)); p.position.set(px, 4.2, -1); stall.add(p); });
    const potion = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), Mat.emissive(0x3b82f6, 1.2)); potion.position.set(-1.8, 3.1, 0.2);
    const gold = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.6), Mat.metal(0xf5c542, 0.2)); gold.position.set(1.8, 2.85, 0.2);
    stall.add(table, roof, potion, gold); this.scene.add(stall);
    this.world.physics.addBox(V(x - 3.5, y, z + 2), V(x + 3.5, y + 2.6, z + 4.4));
    ch.root.rotation.y = 0;
    this.vendor = { ch, anim, pos: V(x, y, z), near: false, sayT: 0, bubbleUntil: 0, text: '', gestT: 3 };
    this.m.particles.addEmitter({ type: 'magic', rate: 3, pos: V(x, y + 3, z + 3.2), opt: { color: 0xfbbf24, n: 1 } });
  }
  vendorSay(text){
    const v = this.vendor; const dur = v.anim.face.say(text, (tl) => { const A = this.m.audio; if(A && A.ctx) A.voice(tl, v.pos.clone().setY(v.pos.y + 6), 95); });
    v.anim.play('talk'); setTimeout(() => v.anim.stop('talk'), dur * 1000);
    v.text = text; v.bubbleUntil = performance.now() + dur * 1000 + 900;
  }
  vendorBuy(actor, which){
    const v = this.vendor; if(!v || actor.root.position.distanceTo(v.pos) > 9) return false;
    const offer = which === 1 ? { cost: 300, give: () => { const i = actor.give('rifle'); actor.equip(i); actor.reserve.rifle += 60; }, label: 'Fuzil + munição' } : { cost: 100, give: () => { actor.potions++; }, label: 'Poção de escudo' };
    if((actor.gold || 0) < offer.cost){ this.vendorSay(pick(VENDOR_LINES.poor)); v.anim.play('think'); return false; }
    actor.gold -= offer.cost; offer.give();
    this.vendorSay(pick(VENDOR_LINES.buy)); v.anim.play(Math.random() < 0.5 ? 'clap' : 'wave');
    this.m.audio.play('chest', v.pos, { vol: 0.5, rate: 1.4 }); this.m.toast(offer.label + ' comprado');
    this.m._updateSlotsUI();
    return true;
  }
  // ---------------- pontos fracos ----------------
  /** chamado ao acertar recurso: devolve multiplicador (2 = crítico) e move o ponto fraco */
  weakHit(actor, obj, id, point, dir){
    if(!actor.isPlayer) return 1;
    let mult = 1;
    const same = this.weak && this.weak.obj === obj && this.weak.id === id;
    if(same && point.distanceTo(this.weak.pos) < 1.7){
      mult = 2; this.m.audio.play('headshot', point, { vol: 0.6, rate: 1.3 }); this.m.particles.emit('shield', point); this.m._floatText(point.clone().setY(point.y + 1.5), 'CRÍTICO', 'crit');
    }
    // novo ponto fraco no plano tangente ao golpe
    const n = dir.clone().negate().setY(0).normalize();
    const t = V(-n.z, 0, n.x);
    const off = t.multiplyScalar((Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 1.1)).add(V(0, (Math.random() - 0.3) * 2.2, 0));
    const pos = point.clone().add(off).addScaledVector(n, 0.25);
    if(!this.weak){ const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.weakTex, transparent: true, depthTest: false, blending: THREE.AdditiveBlending })); sp.scale.setScalar(1.6); sp.renderOrder = 10; sp.userData.noProbe = true; this.scene.add(sp); this.weak = { sp }; }
    Object.assign(this.weak, { obj, id, pos, t: 0, life: 2.5 }); this.weak.sp.position.copy(pos); this.weak.sp.visible = true;
    return mult;
  }
  // ---------------- update ----------------
  update(dt){
    const m = this.m, P = m.player, t = m.time;
    // plataformas
    for(const pad of this.pads){
      pad.arrows.forEach(a => { const u = ((t * 1.6 + a.userData.i / 3) % 1); a.position.y = 1 + u * 4; a.material.opacity = 1; a.scale.setScalar(1 - u * 0.5); });
      for(const a of m.actors){
        if(!a.alive || a.onBus || a.mode !== 'ground') continue;
        const dx = a.body.pos.x - pad.pos.x, dz = a.body.pos.z - pad.pos.z;
        if(dx * dx + dz * dz < 7.5 && Math.abs(a.body.pos.y - pad.pos.y - 0.75) < 1.6 && (pad.cd.get(a) || 0) < t){
          pad.cd.set(a, t + 3);
          a.launch(100);
          m.particles.emit('build', pad.pos.clone().setY(pad.pos.y + 1)); m.particles.flash(pad.pos.clone().setY(pad.pos.y + 3), 0x22d3ee, 8, 0.4, 25);
          if(a.isPlayer){ m.tps.addTrauma(0.3); m.toast('Espaço para abrir o planador'); }
          else { const S = m.world.storm, an = Math.random() * 6.28; a.dropTarget = V(S.cx + Math.cos(an) * S.r * 0.4, 0, S.cz + Math.sin(an) * S.r * 0.4); }
        }
      }
    }
    // entrega aérea
    if(m.phase === 'play' && this.dropsOn){ this.dropTimer -= dt; if(this.dropTimer <= 0){ this.dropTimer = 70; this._spawnDrop(); } }
    for(const d of this.drops){
      d.t += dt;
      if(!d.landed){
        d.g.position.y -= dt * 9; d.g.rotation.y += dt * 0.3; d.g.position.x = d.pos.x + Math.sin(d.t * 0.8) * 1.2;
        if(d.g.position.y - 1.6 <= d.pos.y){ d.g.position.set(d.pos.x, d.pos.y + 1.6, d.pos.z); d.landed = true; d.bal.visible = false; d.g.children.forEach(c => { if(c.geometry && c.geometry.type === 'CylinderGeometry') c.visible = false; }); m.particles.emit('dust', d.pos, { n: 20, power: 2 }); m.audio.play('land', d.pos, { vol: 0.8, rate: 0.6 }); }
      } else if(!d.opened) d.glow.material.opacity = 0.14 + Math.sin(t * 4) * 0.06;
    }
    // bots procuram a entrega
    for(const b of m.bots){ if(!b.alive || !b.brain) continue; const d = this.drops.find(x => x.landed && !x.opened && x.pos.distanceTo(b.root.position) < 180); b.brain.dropTarget = d || null; if(d && d.pos.distanceTo(b.root.position) < 5) this.openDrop(b, d); }
    // mercador: olha para o jogador, cumprimenta ao chegar, gestos ociosos
    const v = this.vendor;
    if(v){
      const dist = P.root.position.distanceTo(v.pos), near = dist < 16 && P.alive;
      if(near && !v.near){ this.vendorSay(pick(VENDOR_LINES.greet)); v.anim.play('wave'); }
      if(!near && v.near && dist < 30) this.vendorSay(pick(VENDOR_LINES.bye));
      v.near = near;
      const target = near ? P.root.position : null;
      if(target){ const want = Math.atan2(target.x - v.pos.x, target.z - v.pos.z); let dA = want - v.ch.root.rotation.y; while(dA > Math.PI) dA -= Math.PI * 2; while(dA < -Math.PI) dA += Math.PI * 2; v.ch.root.rotation.y += dA * Math.min(1, dt * 3); }
      v.gestT -= dt; if(v.gestT <= 0){ v.gestT = 5 + Math.random() * 5; if(!near) v.anim.play(['lookAround', 'shoulderRoll', 'think'][Math.floor(Math.random() * 3)]); }
      if(dist < 120) v.anim.update(dt, { vel: V(0, 0, 0), grounded: true, mode: 'ground', weapon: 'none', lookTarget: target ? m.camera.position : null });
      // prompt/bolha
      const tag = $('vendor-tag');
      if(tag){
        const show = dist < 60;
        tag.style.display = show ? 'block' : 'none';
        if(show){
          const p = v.pos.clone().setY(v.pos.y + 9).project(m.camera);
          tag.style.transform = `translate(${(p.x * 0.5 + 0.5) * innerWidth}px, ${(-p.y * 0.5 + 0.5) * innerHeight}px) translate(-50%,-100%)`;
          tag.querySelector('.bubble').textContent = v.text; tag.querySelector('.bubble').classList.toggle('show', performance.now() < v.bubbleUntil);
          tag.querySelector('.offers').style.display = dist < 9 ? 'block' : 'none';
        }
      }
    }
    // ponto fraco pulsa e expira
    if(this.weak && this.weak.sp.visible){ this.weak.t += dt; this.weak.sp.scale.setScalar(1.4 + Math.sin(this.weak.t * 10) * 0.15); if(this.weak.t > this.weak.life) this.weak.sp.visible = false; }
  }
  /** interação E: entrega aérea */
  interact(actor){
    const d = this.drops.find(x => x.landed && !x.opened && x.pos.distanceTo(actor.root.position) < 6);
    if(d){ this.openDrop(actor, d); return true; }
    if(this.vendor && actor.root.position.distanceTo(this.vendor.pos) < 9){ this.vendorBuy(actor, 0); return true; }
    return false;
  }
  minimapMarks(){
    const out = this.pads.map(p => ({ x: p.pos.x, z: p.pos.z, c: '#22d3ee', s: 3 }));
    this.drops.forEach(d => { if(!d.opened) out.push({ x: d.pos.x, z: d.pos.z, c: '#3b82f6', s: 6, sq: true }); });
    if(this.vendor) out.push({ x: this.vendor.pos.x, z: this.vendor.pos.z, c: '#fbbf24', s: 5 });
    return out;
  }
  dispose(){ const tag = $('vendor-tag'); if(tag) tag.style.display = 'none'; }
}
