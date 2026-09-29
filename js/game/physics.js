// ============================================================
// PHYSICS — mundo de colisão leve e determinístico:
//  • terreno por função de altura (heightAt)
//  • colisores: círculos (árvores/rochas), AABB (casas, paredes,
//    pisos construídos) e rampas (superfície inclinada)
//  • controlador de personagem (gravidade, degrau, deslizamento
//    em paredes, pouso com impacto)
//  • corpos rígidos simples (cápsulas, carregadores, destroços)
//    com gravidade, quique, atrito e rotação
// ============================================================
import * as THREE from 'three';

export const GRAVITY = 80;
const STEP = 1.4;

export class PhysicsWorld {
  constructor(heightFn){
    this.heightAt = heightFn || (() => 0);
    this.circles = [];   // {x,z,r,top}
    this.boxes = [];     // {min:Vector3,max:Vector3, obj?, ramp?:{axis:'x'|'z',dir:±1}}
    this.bodies = [];
    this.debrisCap = 160;
  }
  addCircle(x, z, r, top){ const c = { x, z, r, top: top ?? 1e9 }; this.circles.push(c); return c; }
  addBox(min, max, extra){ const b = Object.assign({ min: min.clone(), max: max.clone() }, extra || {}); this.boxes.push(b); return b; }
  removeCircle(c){ const i = this.circles.indexOf(c); if(i >= 0) this.circles.splice(i, 1); }
  removeBox(b){ const i = this.boxes.indexOf(b); if(i >= 0) this.boxes.splice(i, 1); }

  /** altura da superfície de uma rampa em (x,z) */
  rampHeight(b, x, z){
    const r = b.ramp;
    const t = r.axis === 'x' ? (x - b.min.x) / (b.max.x - b.min.x) : (z - b.min.z) / (b.max.z - b.min.z);
    const u = r.dir > 0 ? t : 1 - t;
    return b.min.y + THREE.MathUtils.clamp(u, 0, 1) * (b.max.y - b.min.y);
  }
  /** chão sob um ponto (considera terreno, topo de caixas e rampas) */
  groundAt(x, z, feetY, radius){
    let g = this.heightAt(x, z);
    const rr = radius || 0;
    for(const b of this.boxes){
      if(x < b.min.x - rr * 0.3 || x > b.max.x + rr * 0.3 || z < b.min.z - rr * 0.3 || z > b.max.z + rr * 0.3) continue;
      const top = b.ramp ? this.rampHeight(b, x, z) : b.max.y;
      if(top <= feetY + STEP && top > g) g = top;
    }
    return g;
  }
  /** move um corpo tipo cápsula: body {pos, vel, radius, height, grounded} */
  moveCharacter(body, dt){
    const p = body.pos, v = body.vel;
    v.y -= GRAVITY * (body.gravityScale ?? 1) * dt;
    if(body.maxFall) v.y = Math.max(v.y, -body.maxFall);
    // horizontal com sub-passos
    const steps = Math.ceil(Math.hypot(v.x, v.z) * dt / 0.6) || 1;
    for(let s = 0; s < steps; s++){
      p.x += v.x * dt / steps; p.z += v.z * dt / steps;
      this._resolveHorizontal(body);
    }
    p.y += v.y * dt;
    // teto
    for(const b of this.boxes){
      if(b.ramp) continue;
      if(p.x > b.min.x && p.x < b.max.x && p.z > b.min.z && p.z < b.max.z){
        const head = p.y + body.height;
        if(v.y > 0 && head > b.min.y && p.y < b.min.y){ p.y = b.min.y - body.height; v.y = 0; }
      }
    }
    const g = this.groundAt(p.x, p.z, p.y, body.radius);
    const wasGrounded = body.grounded;
    body.landVy = 0;
    if(p.y <= g + 0.05 && v.y <= 0){
      if(!wasGrounded) body.landVy = v.y;
      // snap (inclui descer degraus/rampas suavemente)
      p.y = g; v.y = 0; body.grounded = true;
    } else if(wasGrounded && v.y <= 0 && p.y - g < STEP * 0.8){
      p.y = g; v.y = 0; body.grounded = true;
    } else body.grounded = false;
    return body;
  }
  _resolveHorizontal(body){
    const p = body.pos, r = body.radius;
    for(const c of this.circles){
      if(p.y > c.top) continue;
      const dx = p.x - c.x, dz = p.z - c.z, d2 = dx * dx + dz * dz, rr = r + c.r;
      if(d2 < rr * rr && d2 > 1e-6){ const d = Math.sqrt(d2), k = (rr - d) / d; p.x += dx * k; p.z += dz * k; }
    }
    for(const b of this.boxes){
      if(b.ramp) continue;
      if(p.y + body.height <= b.min.y || p.y >= b.max.y - STEP) continue; // acima/abaixo ou degrau
      const cx = THREE.MathUtils.clamp(p.x, b.min.x, b.max.x), cz = THREE.MathUtils.clamp(p.z, b.min.z, b.max.z);
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if(d2 < r * r){
        if(d2 > 1e-6){ const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
        else { // dentro: empurra pelo eixo de menor penetração
          const px = Math.min(p.x - b.min.x, b.max.x - p.x), pz = Math.min(p.z - b.min.z, b.max.z - p.z);
          if(px < pz) p.x = (p.x - b.min.x < b.max.x - p.x) ? b.min.x - r : b.max.x + r;
          else p.z = (p.z - b.min.z < b.max.z - p.z) ? b.min.z - r : b.max.z + r;
        }
      }
    }
  }
  /** linha de visão livre (para IA) */
  lineClear(a, b){
    const dir = new THREE.Vector3().subVectors(b, a); const len = dir.length(); dir.divideScalar(len);
    const ray = new THREE.Ray(a, dir), hit = new THREE.Vector3();
    for(const bx of this.boxes){
      const box = new THREE.Box3(bx.min, bx.max);
      if(ray.intersectBox(box, hit) && hit.distanceTo(a) < len) return false;
    }
    return true;
  }

  // ---------- corpos rígidos (destroços / cápsulas / carregadores) ----------
  addBody(mesh, vel, angVel, opts){
    opts = opts || {};
    const b = { mesh, vel: vel.clone(), ang: angVel ? angVel.clone() : new THREE.Vector3(), life: opts.life ?? 6, bounce: opts.bounce ?? 0.35, friction: opts.friction ?? 0.6, r: opts.r ?? 0.1, sound: opts.sound, onHit: opts.onHit, hits: 0 };
    this.bodies.push(b);
    if(this.bodies.length > this.debrisCap){ const o = this.bodies.shift(); o.mesh.parent && o.mesh.parent.remove(o.mesh); }
    return b;
  }
  updateBodies(dt){
    for(let i = this.bodies.length - 1; i >= 0; i--){
      const b = this.bodies[i], m = b.mesh;
      b.life -= dt;
      if(b.life <= 0){ m.parent && m.parent.remove(m); this.bodies.splice(i, 1); continue; }
      if(b.life < 1 && m.material && !m.material._fadeClone){ m.material = m.material.clone(); m.material._fadeClone = true; m.material.transparent = true; }
      if(b.life < 1 && m.material) m.material.opacity = b.life;
      if(b.sleep) continue;
      b.vel.y -= GRAVITY * 0.9 * dt;
      m.position.addScaledVector(b.vel, dt);
      m.rotation.x += b.ang.x * dt; m.rotation.y += b.ang.y * dt; m.rotation.z += b.ang.z * dt;
      const g = this.groundAt(m.position.x, m.position.z, m.position.y + 0.5, 0) + b.r;
      if(m.position.y < g){
        m.position.y = g;
        if(b.vel.y < -3){ b.hits++; if(b.onHit) b.onHit(b, -b.vel.y); }
        b.vel.y = -b.vel.y * b.bounce; b.vel.x *= b.friction; b.vel.z *= b.friction; b.ang.multiplyScalar(0.6);
        if(Math.abs(b.vel.y) < 1.2 && b.vel.lengthSq() < 2){ b.sleep = true; }
      }
    }
  }
}
