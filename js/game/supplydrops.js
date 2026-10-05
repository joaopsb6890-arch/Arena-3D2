// ============================================================
// SUPPLY DROP SYSTEM — pacotes que caem do céu com loot raro
// ============================================================
import * as THREE from 'three';
import { Mat } from '../engine/materials.js';
import { heightAt } from './world.js';

export class SupplyDropSystem {
  constructor(match) {
    this.m = match;
    this.drops = [];
    this.nextDrop = 60; // primeiro drop aos 60s
    this.maxDrops = 3;
  }

  update(dt) {
    this.nextDrop -= dt;
    if (this.nextDrop <= 0 && this.drops.length < this.maxDrops) {
      this._spawnDrop();
      this.nextDrop = 45 + Math.random() * 30;
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (d.falling) {
        d.vel -= 30 * dt;
        d.group.position.y += d.vel * dt;
        d.groundY = heightAt(d.group.position.x, d.group.position.z) + 1.5;
        if (d.group.position.y <= d.groundY) {
          d.group.position.y = d.groundY;
          d.falling = false;
          d.parachute.visible = false;
          this.m.audio.play('land', d.group.position, { vol: 0.6 });
          this.m.particles.emit('dust', d.group.position, { n: 20, power: 2 });
          if (this.m.toast) this.m.toast('Supply Drop aterrou');
        }
      }
      // rotação suave do pacote no chão
      if (!d.falling) d.group.rotation.y += dt * 0.3;
      // hover beam
      d.beam.material.opacity = 0.3 + Math.sin(this.m.time * 3) * 0.1;
    }
  }

  _spawnDrop() {
    const angle = Math.random() * Math.PI * 2;
    const dist = 100 + Math.random() * 300;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;

    const group = new THREE.Group();
    group.position.set(x, 250, z);

    // caixa
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(3, 3, 3),
      Mat.paint(0x7c3aed)
    );
    box.castShadow = true; box.receiveShadow = true;
    box.position.y = 0;
    group.add(box);

    // bordas douradas
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(box.geometry),
      new THREE.LineBasicMaterial({ color: 0xfacc15 })
    );
    box.add(edges);

    // paraquedas
    const chute = new THREE.Mesh(
      new THREE.SphereGeometry(5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      Mat.paint(0xa855f7)
    );
    chute.position.y = 6;
    chute.visible = true;
    group.add(chute);

    // feixe de luz
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 2.5, 80, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
    );
    beam.position.y = 40;
    group.add(beam);

    this.m.scene.add(group);

    // loot: arma rara + escudo
    const loot = this._rollLoot();

    this.drops.push({
      group, box, parachute: chute, beam,
      falling: true, vel: -5,
      x, z, groundY: 0,
      loot, opened: false
    });

    if (this.m.toast) this.m.toast('Supply Drop a caminho');
    this.m.audio.play('thunder', group.position, { vol: 0.3 });
  }

  _rollLoot() {
    const weapons = ['rifle', 'shotgun', 'sniper', 'smg', 'lmg', 'dmr', 'rocket', 'minigun'];
    const w = weapons[Math.floor(Math.random() * weapons.length)];
    return { weapon: w, rarity: 4 + Math.floor(Math.random() * 2), mats: 100, potions: 2, medkits: 1 };
  }

  // Verifica se o jogador está perto de um drop e interage
  interact(player) {
    for (const d of this.drops) {
      if (d.opened || d.falling) continue;
      const dist = Math.hypot(d.group.position.x - player.root.position.x, d.group.position.z - player.root.position.z);
      if (dist < 5) {
        d.opened = true;
        // dá loot ao jogador
        const loot = d.loot;
        player.give(loot.weapon, loot.rarity);
        player.mats.wood = (player.mats.wood || 0) + loot.mats;
        player.mats.stone = (player.mats.stone || 0) + loot.mats;
        player.potions = (player.potions || 0) + loot.potions;
        player.medkits = (player.medkits || 0) + loot.medkits;
        player.shield = Math.min(100, player.shield + 50);

        // efeito visual
        this.m.particles.emit('shield', d.group.position, { n: 30 });
        this.m.audio.play('build', d.group.position, { vol: 0.6 });

        // remove o drop
        this.m.scene.remove(d.group);
        d.group.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
        const idx = this.drops.indexOf(d);
        if (idx >= 0) this.drops.splice(idx, 1);

        if (this.m.toast) this.m.toast('Supply Drop saqueado');
        return true;
      }
    }
    return false;
  }

  dispose() {
    for (const d of this.drops) {
      this.m.scene.remove(d.group);
      d.group.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    }
    this.drops = [];
  }
}
