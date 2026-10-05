// ============================================================
// CRYSTAL SYSTEM — cristais flutuantes que dão buffs ao jogador
// Kill Streak System — feedback visual para sequências de abates
// ============================================================
import * as THREE from 'three';
import { Mat } from '../engine/materials.js';
import { heightAt } from './world.js';

const CRYSTAL_COLORS = [0xa855f7, 0x22d3ee, 0xfacc15, 0xf472b6, 0x84cc16];

export class CrystalSystem {
  constructor(match) {
    this.m = match;
    this.crystals = [];
    this.nextSpawn = 30;
    this.maxCrystals = 8;
  }

  update(dt) {
    this.nextSpawn -= dt;
    if (this.nextSpawn <= 0 && this.crystals.length < this.maxCrystals) {
      this._spawnCrystal();
      this.nextSpawn = 25 + Math.random() * 20;
    }
    for (let i = this.crystals.length - 1; i >= 0; i--) {
      const c = this.crystals[i];
      c.t += dt;
      // flutuar
      c.mesh.position.y = c.baseY + Math.sin(c.t * 2) * 1.5;
      c.mesh.rotation.y += dt * 1.5;
      c.glow.scale.setScalar(1 + Math.sin(c.t * 3) * 0.2);
      c.glow.material.opacity = 0.3 + Math.sin(c.t * 3) * 0.15;
      // verificar jogador perto
      const P = this.m.player;
      if (P && P.alive) {
        const d = Math.hypot(c.mesh.position.x - P.root.position.x, c.mesh.position.z - P.root.position.z);
        if (d < 4) {
          this._collect(c, P);
          this.m.scene.remove(c.mesh);
          c.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); });
          if (c.glow) { this.m.scene.remove(c.glow); c.glow.geometry.dispose(); c.glow.material.dispose(); }
          this.crystals.splice(i, 1);
        }
      }
    }
  }

  _spawnCrystal() {
    const angle = Math.random() * Math.PI * 2;
    const dist = 50 + Math.random() * 400;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const y = heightAt(x, z) + 3;
    const colorIdx = Math.floor(Math.random() * CRYSTAL_COLORS.length);
    const color = CRYSTAL_COLORS[colorIdx];

    const group = new THREE.Group();
    group.position.set(x, y, z);

    // cristal principal
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.8, 0),
      Mat.emissive(color, 1.5)
    );
    crystal.castShadow = true;
    group.add(crystal);

    // brilho
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 12, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false })
    );
    group.add(glow);

    this.m.scene.add(group);

    this.crystals.push({
      mesh: group, glow, baseY: y, t: 0, color, colorIdx
    });

    this.m.particles.emit('shield', new THREE.Vector3(x, y, z), { n: 8 });
  }

  _collect(c, P) {
    const buffs = [
      () => { P.shield = Math.min(100, P.shield + 25); if (this.m.toast) this.m.toast('+25 Escudo'); },
      () => { P.hp = Math.min(100, P.hp + 20); if (this.m.toast) this.m.toast('+20 Vida'); },
      () => { P.mats.wood = (P.mats.wood || 0) + 50; P.mats.stone = (P.mats.stone || 0) + 50; if (this.m.toast) this.m.toast('+50 Materiais'); },
      () => { P.potions = (P.potions || 0) + 1; if (this.m.toast) this.m.toast('+1 Poção'); },
      () => { P.boostT = 8; if (this.m.toast) this.m.toast('Velocidade X2'); }
    ];
    buffs[c.colorIdx]();
    this.m.particles.emit('shield', c.mesh.position, { n: 25 });
    this.m.audio.play('gulp', c.mesh.position, { vol: 0.5, rate: 1.5 });
  }

  dispose() {
    for (const c of this.crystals) {
      this.m.scene.remove(c.mesh);
      c.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      if (c.glow) { this.m.scene.remove(c.glow); c.glow.geometry.dispose(); c.glow.material.dispose(); }
    }
    this.crystals = [];
  }
}

export class KillStreakSystem {
  constructor(match) {
    this.m = match;
    this.streaks = new Map(); // actorId -> { count, timer }
  }

  onKill(killer, victim) {
    if (!killer) return;
    const id = killer.id;
    let s = this.streaks.get(id) || { count: 0, timer: 0 };
    s.count++;
    s.timer = 8;
    this.streaks.set(id, s);

    if (killer.isPlayer) {
      const msgs = ['', '', 'DUPLO ABATE!', 'TRIPLO ABATE!', 'QUÁDRUPLO ABATE!', 'PENTAKILL!', 'INCRÍVEL!', 'DEUS!'];
      const msg = msgs[Math.min(s.count, msgs.length - 1)];
      if (msg && this.m.toast) this.m.toast(msg);
      if (this.m.tps) this.m.tps.addTrauma(0.15 * Math.min(s.count, 5));
    }
  }

  update(dt) {
    for (const [id, s] of this.streaks) {
      s.timer -= dt;
      if (s.timer <= 0) this.streaks.delete(id);
    }
  }

  getStreak(actor) {
    const s = this.streaks.get(actor.id);
    return s ? s.count : 0;
  }

  dispose() {
    this.streaks.clear();
  }
}
