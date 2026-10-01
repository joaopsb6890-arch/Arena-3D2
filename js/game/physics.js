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

// v16: grelha espacial (hash 2D) para caixas e círculos — antes cada personagem testava TODAS as caixas
// do mapa em cada sub-passo (O(atores × caixas)); agora só as das células vizinhas.
const CELL = 24, _ck = (i, j) => (i + 512) * 4096 + (j + 512);
const _box3 = new THREE.Box3(), _hitV = new THREE.Vector3(), _rayT = new THREE.Ray();
export class PhysicsWorld {
  constructor(heightFn){
    this.heightAt = heightFn || (() => 0);
    this.circles = [];   // {x,z,r,top}
    this.boxes = [];     // {min:Vector3,max:Vector3, obj?, ramp?:{axis:'x'|'z',dir:±1}}
    this.bodies = [];
    this.debrisCap = 160;
    this.gB = new Map(); this.gC = new Map(); this._stamp = 1; this._qb = []; this._qc = [];
  }
  _cells(minx, minz, maxx, maxz, fn){
    const i0 = Math.floor(minx / CELL), i1 = Math.floor(maxx / CELL), j0 = Math.floor(minz / CELL), j1 = Math.floor(maxz / CELL);
    for(let i = i0; i <= i1; i++) for(let j = j0; j <= j1; j++) fn(_ck(i, j));
  }
  _ins(grid, o, minx, minz, maxx, maxz){ o._cells = []; this._cells(minx, minz, maxx, maxz, (k) => { let a = grid.get(k); if(!a){ a = []; grid.set(k, a); } a.push(o); o._cells.push(k); }); }
  _del(grid, o){ if(!o._cells) return; for(const k of o._cells){ const a = grid.get(k); if(a){ const i = a.indexOf(o); if(i >= 0){ a[i] = a[a.length - 1]; a.pop(); } } } o._cells = null; }
  /** caixas perto do retângulo (sem duplicados) — devolve um array reutilizado */
  nearBoxes(minx, minz, maxx, maxz){
    const out = this._qb; out.length = 0; const st = ++this._stamp;
    this._cells(minx, minz, maxx, maxz, (k) => { const a = this.gB.get(k); if(a) for(const b of a) if(b._st !== st){ b._st = st; out.push(b); } });
    return out;
  }
  nearCircles(minx, minz, maxx, maxz){
    const out = this._qc; out.length = 0; const st = ++this._stamp;
    this._cells(minx, minz, maxx, maxz, (k) => { const a = this.gC.get(k); if(a) for(const c of a) if(c._st !== st){ c._st = st; out.push(c); } });
    return out;
  }
  addCircle(x, z, r, top){ const c = { x, z, r, top: top ?? 1e9 }; this.circles.push(c); this._ins(this.gC, c, x - r, z - r, x + r, z + r); return c; }
  addBox(min, max, extra){ const b = Object.assign({ min: min.clone(), max: max.clone() }, extra || {}); this.boxes.push(b); this._ins(this.gB, b, b.min.x, b.min.z, b.max.x, b.max.z); return b; }
  removeCircle(c){ const i = this.circles.indexOf(c); if(i >= 0) this.circles.splice(i, 1); this._del(this.gC, c); }
  removeBox(b){ const i = this.boxes.indexOf(b); if(i >= 0) this.boxes.splice(i, 1); this._del(this.gB, b); }

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
    const near = this.nearBoxes(x - rr, z - rr, x + rr, z + rr);
    for(let i = 0; i < near.length; i++){ const b = near[i];
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
    const nb = this.nearBoxes(p.x - 2, p.z - 2, p.x + 2, p.z + 2);
    for(let i = 0; i < nb.length; i++){ const b = nb[i];
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
    const nc = this.nearCircles(p.x - r - 1, p.z - r - 1, p.x + r + 1, p.z + r + 1);
    for(let i = 0; i < nc.length; i++){ const c = nc[i];
      if(p.y > c.top) continue;
      const dx = p.x - c.x, dz = p.z - c.z, d2 = dx * dx + dz * dz, rr = r + c.r;
      if(d2 < rr * rr && d2 > 1e-6){ const d = Math.sqrt(d2), k = (rr - d) / d; p.x += dx * k; p.z += dz * k; }
    }
    const nb = this.nearBoxes(p.x - r - 1, p.z - r - 1, p.x + r + 1, p.z + r + 1);
    for(let i = 0; i < nb.length; i++){ const b = nb[i];
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
  /** v19: obstáculo vertical à frente (para escalar) → topo da parede/rocha/falésia ou null */
  wallAhead(pos, fx, fz, dist, height){
    const px = pos.x + fx * dist, pz = pos.z + fz * dist, y = pos.y;
    let top = null;
    const nb = this.nearBoxes(px - 0.6, pz - 0.6, px + 0.6, pz + 0.6);
    for(let i = 0; i < nb.length; i++){ const b = nb[i];
      if(b.ramp || b.noClimb) continue;
      if(px < b.min.x - 0.5 || px > b.max.x + 0.5 || pz < b.min.z - 0.5 || pz > b.max.z + 0.5) continue;
      if(b.max.y <= y + STEP || b.min.y > y + height) continue;
      if(top === null || b.max.y > top) top = b.max.y;
    }
    const nc = this.nearCircles(px - 4, pz - 4, px + 4, pz + 4);
    for(let i = 0; i < nc.length; i++){ const c = nc[i];
      if(c.top > 1e8 || c.top <= y + STEP) continue;
      const d = Math.hypot(px - c.x, pz - c.z); if(d > c.r + 0.5) continue;
      if(top === null || c.top > top) top = c.top;
    }
    // falésias/encostas íngremes do terreno
    const h = this.heightAt(px, pz);
    if(h > y + 4 && (top === null || h > top)) top = h;
    return top;
  }
  /** linha de visão livre (para IA) */
  lineClear(a, b){
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dy, dz); if(len < 1e-4) return true;
    _rayT.origin.copy(a); _rayT.direction.set(dx / len, dy / len, dz / len);
    // percorre a linha em troços do tamanho de uma célula (só testa caixas por onde a linha passa)
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / CELL));
    for(let s = 0; s < n; s++){
      const x0 = a.x + dx * s / n, z0 = a.z + dz * s / n, x1 = a.x + dx * (s + 1) / n, z1 = a.z + dz * (s + 1) / n;
      const near = this.nearBoxes(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1));
      for(let i = 0; i < near.length; i++){ const bx = near[i]; _box3.min.copy(bx.min); _box3.max.copy(bx.max);
        if(_rayT.intersectBox(_box3, _hitV) && _hitV.distanceTo(a) < len) return false; }
    }
    return true;
  }
  /** v16: move uma caixa (estruturas animadas, portas) mantendo a grelha coerente */
  updateBox(b){ this._del(this.gB, b); this._ins(this.gB, b, b.min.x, b.min.z, b.max.x, b.max.z); }

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
