// ============================================================
// Ônibus de Batalha (v16/v17) — modelo partilhado pela partida e pelo lobby
// ============================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Mat } from '../engine/materials.js';

export function makeBattleBus(){
    // v16: Ônibus de Batalha mais detalhado — carroçaria arredondada, janelas, rodas, balão às riscas com cordas
    const g = new THREE.Group(), add = (geo, mat, x, y, z, rx, ry, rz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, rz || 0); g.add(m); return m; };
    const blue = Mat.paint(0x2563eb), white = Mat.paint(0xf1f5f9), yel = Mat.paint(0xfbbf24), dark = Mat.polymer(0x111827), glass = Mat.glass(0x93c5fd), chrome = Mat.metal(0xd1d5db, 0.2);
    add(new RoundedBoxGeometry(8, 7, 22, 3, 1.2), blue, 0, 0, 0);
    add(new RoundedBoxGeometry(8.2, 0.8, 22.2, 2, 0.35), white, 0, 3.6, 0);
    add(new THREE.BoxGeometry(8.25, 1, 22.3), yel, 0, -1.6, 0);
    for(let i = 0; i < 6; i++) for(const sx of [-1, 1]) add(new THREE.BoxGeometry(0.12, 2.1, 2.6), glass, sx * 4.05, 1.2, -8 + i * 3.1);
    add(new THREE.BoxGeometry(7, 2.6, 0.14), glass, 0, 1.2, 11.05);
    add(new THREE.BoxGeometry(8.4, 1, 0.8), chrome, 0, -3.1, 11.1); add(new THREE.BoxGeometry(8.4, 1, 0.8), chrome, 0, -3.1, -11.1);
    for(const sx of [-2.8, 2.8]) add(new THREE.CylinderGeometry(0.6, 0.6, 0.2, 16), Mat.emissive(0xfff3c4, 2), sx, -1.8, 11.1, Math.PI / 2);
    for(const sx of [-1, 1]) for(const sz of [-7, 7]){ add(new THREE.CylinderGeometry(1.5, 1.5, 1, 20), dark, sx * 3.8, -3.6, sz, 0, 0, Math.PI / 2); add(new THREE.CylinderGeometry(0.7, 0.7, 1.05, 12), chrome, sx * 3.85, -3.6, sz, 0, 0, Math.PI / 2); }
    add(new THREE.BoxGeometry(0.4, 3, 6), blue, 0, 5.4, -8.5); add(new THREE.BoxGeometry(3.4, 0.3, 3), yel, 0, 6.8, -9.5);
    // balão com gomos coloridos
    const bg = new THREE.SphereGeometry(10, 32, 20), bp = bg.attributes.position, col = new Float32Array(bp.count * 3), c1 = new THREE.Color(0x60a5fa), c2 = new THREE.Color(0xf8fafc);
    for(let i = 0; i < bp.count; i++){ const a = Math.atan2(bp.getZ(i), bp.getX(i)); const c = Math.floor((a + Math.PI) / (Math.PI * 2) * 12) % 2 ? c1 : c2; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    bg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const bal = add(bg, Mat.vcolor('busballoon', { roughness: 0.5 }), 0, 19, 0); bal.scale.set(1, 1.1, 1.4);
    add(new THREE.TorusGeometry(10.1, 0.35, 8, 40), yel, 0, 19, 0, Math.PI / 2).scale.set(1, 1.4, 1);
    add(new THREE.CylinderGeometry(1.2, 2, 1.6, 16), dark, 0, 7.4, 0);
    for(let i = 0; i < 4; i++){ const sx = i < 2 ? -3 : 3, sz = i % 2 ? -8 : 8, top = new THREE.Vector3(sx * 1.6, 12, sz * 1.2), bot = new THREE.Vector3(sx, 4, sz), d = top.clone().sub(bot); const r = add(new THREE.CylinderGeometry(0.08, 0.08, d.length(), 4), Mat.metal(0x444444), (top.x + bot.x) / 2, (top.y + bot.y) / 2, (top.z + bot.z) / 2); r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); }
    g.traverse(o => { if(o.isMesh) o.castShadow = true; });
    return g;
  }
