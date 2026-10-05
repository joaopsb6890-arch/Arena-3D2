// ============================================================
// Ônibus de Batalha (v23) — modelo detalhado com melhores proporções,
// luzes dinâmicas, balão com gomos e bandeirolas.
// ============================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Mat } from '../engine/materials.js';

export function makeBattleBus(){
    const g = new THREE.Group(), add = (geo, mat, x, y, z, rx, ry, rz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, rz || 0); g.add(m); return m; };
    const blue = Mat.paint(0x1e40af), white = Mat.paint(0xf8fafc), yel = Mat.paint(0xfbbf24), dark = Mat.polymer(0x111827), glass = Mat.glass(0x93c5fd), chrome = Mat.metal(0xd1d5db, 0.2), red = Mat.paint(0xdc2626);
    // carroçaria principal — mais comprida e aerodinâmica
    add(new RoundedBoxGeometry(9, 7.5, 24, 4, 1.4), blue, 0, 0, 0);
    // faixa branca no meio
    add(new RoundedBoxGeometry(9.1, 0.9, 24.1, 2, 0.4), white, 0, 3.8, 0);
    // faixa amarela inferior
    add(new THREE.BoxGeometry(9.1, 1, 24.2), yel, 0, -1.8, 0);
    // para-brisas frontal inclinado
    const windshield = add(new THREE.BoxGeometry(8.2, 3.5, 0.3), glass, 0, 1.2, 12.05);
    windshield.rotation.x = -0.15;
    // janelas laterais (6 de cada lado)
    for(let i = 0; i < 6; i++) for(const sx of [-1, 1]) add(new THREE.BoxGeometry(0.14, 2.3, 2.8), glass, sx * 4.55, 1.3, -9 + i * 3.4);
    // faróis dianteiros
    for(const sx of [-2.6, 2.6]){ add(new THREE.CylinderGeometry(0.7, 0.7, 0.25, 16), Mat.emissive(0xfff3c4, 3), sx, -1.5, 12.05, Math.PI / 2); }
    // luzes traseiras
    for(const sx of [-2.8, 2.8]){ add(new THREE.BoxGeometry(1.2, 0.5, 0.15), Mat.emissive(0xef4444, 2.5), sx, -1.5, -12.05); }
    // para-choques cromados
    add(new THREE.BoxGeometry(9.2, 1.2, 0.9), chrome, 0, -3.2, 12.1);
    add(new THREE.BoxGeometry(9.2, 1.2, 0.9), chrome, 0, -3.2, -12.1);
    // rodas (4) com jantes cromadas
    for(const sx of [-1, 1]) for(const sz of [-8, 8]){
      add(new THREE.CylinderGeometry(1.6, 1.6, 1, 20), dark, sx * 4.2, -4.1, sz, 0, 0, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.8, 0.8, 1.05, 14), chrome, sx * 4.25, -4.1, sz, 0, 0, Math.PI / 2);
      for(let i = 0; i < 5; i++){ const a = i / 5 * Math.PI * 2; add(new THREE.BoxGeometry(0.15, 1.3, 0.2), chrome, sx * 4.3, -4.1 + Math.cos(a) * 0.5, sz + Math.sin(a) * 0.5, 0, 0, a); }
    }
    // escada de acesso lateral
    for(let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.3, 0.15, 0.8), chrome, -4.65, -0.5 - i * 0.6, 10 - i * 0.8);
    // antena
    add(new THREE.CylinderGeometry(0.05, 0.05, 4, 6), chrome, 3, 5, 8);
    // letreiro "BATTLE BUS" na lateral
    const sign = add(new THREE.BoxGeometry(0.15, 1.5, 8), white, 4.6, 3.8, 0);
    // asa traseira
    add(new THREE.BoxGeometry(0.4, 3, 6), blue, 0, 5.5, -9);
    add(new THREE.BoxGeometry(3.5, 0.3, 3), yel, 0, 7, -10);
    // suporte do balão
    add(new THREE.BoxGeometry(0.5, 3.5, 6), blue, 0, 5.8, -8.5);
    add(new THREE.CylinderGeometry(1.4, 2.2, 1.8, 16), dark, 0, 7.8, 0);
    // balão com gomos coloridos (maior e mais redondo)
    const bg = new THREE.SphereGeometry(12, 36, 24), bp = bg.attributes.position, col = new Float32Array(bp.count * 3);
    const colors = [0x60a5fa, 0xf8fafc, 0x3b82f6, 0xfbbf24];
    for(let i = 0; i < bp.count; i++){
      const a = Math.atan2(bp.getZ(i), bp.getX(i));
      const v = Math.floor((a + Math.PI) / (Math.PI * 2) * 16) % 4;
      const c = new THREE.Color(colors[v]);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    bg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const bal = add(bg, Mat.vcolor('busballoon', { roughness: 0.45, metalness: 0.1 }), 0, 22, 0); bal.scale.set(1, 1.15, 1.35);
    // anel do balão
    add(new THREE.TorusGeometry(12.1, 0.4, 10, 48), yel, 0, 22, 0, Math.PI / 2).scale.set(1, 1.35, 1);
    // cordas do balão (4)
    for(let i = 0; i < 4; i++){
      const sx = i < 2 ? -3 : 3, sz = i % 2 ? -8 : 8;
      const top = new THREE.Vector3(sx * 1.6, 14, sz * 1.2), bot = new THREE.Vector3(sx, 4.5, sz);
      const d = top.clone().sub(bot);
      const r = add(new THREE.CylinderGeometry(0.1, 0.1, d.length(), 6), Mat.metal(0x555555), (top.x + bot.x) / 2, (top.y + bot.y) / 2, (top.z + bot.z) / 2);
      r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    }
    // bandeirolas decorativas penduradas no suporte
    const flagColors = [0xef4444, 0xfbbf24, 0x22c55e, 0x3b82f6, 0xa855f7];
    for(let i = 0; i < 8; i++){
      const fx = -3 + i * 0.86;
      add(new THREE.ConeGeometry(0.25, 0.7, 4), Mat.paint(flagColors[i % 5]), fx, 5.2, -10.5, Math.PI, 0, 0);
    }
    g.traverse(o => { if(o.isMesh) o.castShadow = true; });
    return g;
  }
