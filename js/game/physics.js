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
  /** v22: telhado em cone (pirâmide de 4 lados) */
  coneHeight(b, x, z){
    const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2, hw = (b.max.x - b.min.x) / 2;
    const d = Math.max(Math.abs(x - cx), Math.abs(z - cz)) / hw;
    return b.min.y + THREE.MathUtils.clamp(1 - d, 0, 1) * (b.max.y - b.min.y);
  }
  surfaceTop(b, x, z){ return b.ramp ? this.rampHeight(b, x, z) : b.cone ? this.coneHeight(b, x, z) : b.max.y; }
  /** chão sob um ponto (considera terreno, topo de caixas, rampas e cones) */
  groundAt(x, z, feetY, radius){
    let g = this.heightAt(x, z);
    const rr = radius || 0;
    const near = this.nearBoxes(x - rr, z - rr, x + rr, z + rr);
    for(let i = 0; i < near.length; i++){ const b = near[i];
      if(x < b.min.x - rr * 0.3 || x > b.max.x + rr * 0.3 || z < b.min.z - rr * 0.3 || z > b.max.z + rr * 0.3) continue;
      const top = this.surfaceTop(b, x, z);
      if(top <= feetY + STEP && top > g) g = top;
    }
    return g;
  }
  /**
   * v22: controlador de personagem com SEPARAÇÃO DE EIXOS (X → Z → Y) e varrimento em sub-passos:
   *  • cada sub-passo anda no máximo meio raio → não atravessa paredes finas mesmo a 100+ u/s;
   *  • em X e Z a cápsula é testada contra caixas expandidas pelo raio (soma de Minkowski); ao bater,
   *    encosta à face e anula SÓ essa componente da velocidade → desliza ao longo da parede, não pára;
   *  • degraus até STEP são subidos automaticamente (a caixa não bloqueia e o chão "salta" para o topo);
   *  • rampas e cones são superfícies (não bloqueiam de lado) e funcionam como teto por baixo.
   */
  moveCharacter(body, dt){
    const p = body.pos, v = body.vel, r = body.radius, H = body.height;
    v.y -= GRAVITY * (body.gravityScale ?? 1) * dt;
    if(body.maxFall) v.y = Math.max(v.y, -body.maxFall);
    this._unstick(body);
    const dist = Math.hypot(v.x, v.z) * dt, steps = Math.min(16, Math.max(1, Math.ceil(dist / Math.max(0.25, r * 0.5))));
    body.hitWall = false;
    for(let s = 0; s < steps; s++){
      const dx = v.x * dt / steps, dz = v.z * dt / steps;
      if(dx){ p.x += dx; this._sweepAxis(body, 'x', dx); }
      if(dz){ p.z += dz; this._sweepAxis(body, 'z', dz); }
      this._resolveCircles(body);
    }
    p.y += v.y * dt;
    // teto (caixas normais e parte de baixo de rampas/cones)
    if(v.y > 0){
      const nb = this.nearBoxes(p.x - r, p.z - r, p.x + r, p.z + r);
      for(let i = 0; i < nb.length; i++){ const b = nb[i];
        if(p.x < b.min.x || p.x > b.max.x || p.z < b.min.z || p.z > b.max.z) continue;
        const under = (b.ramp || b.cone) ? this.surfaceTop(b, p.x, p.z) - 0.7 : b.min.y;
        const head = p.y + H;
        if(head > under && p.y < under - 0.3 && p.y + STEP < this.surfaceTop(b, p.x, p.z)){ p.y = under - H; v.y = 0; }
      }
    }
    const lift = body.lift || 0;   // v22: veículos — o "assento" fica acima do chão
    const g = this.groundAt(p.x, p.z, p.y - lift, r) + lift;
    const wasGrounded = body.grounded;
    body.landVy = 0;
    if(p.y <= g + 0.05 && v.y <= 0){
      if(!wasGrounded) body.landVy = v.y;
      p.y = g; v.y = 0; body.grounded = true;
    } else if(wasGrounded && v.y <= 0 && p.y - g < STEP * 0.8){
      p.y = g; v.y = 0; body.grounded = true;   // colar ao descer degraus/rampas
    } else body.grounded = false;
    return body;
  }
  /** resolve um eixo: se a cápsula entrou numa caixa (expandida pelo raio), encosta-a à face de onde veio */
  _sweepAxis(body, ax, d){
    const p = body.pos, r = body.radius, H = body.height, v = body.vel;
    const nb = this.nearBoxes(p.x - r - 0.5, p.z - r - 0.5, p.x + r + 0.5, p.z + r + 0.5);
    for(let i = 0; i < nb.length; i++){ const b = nb[i];
      if(b.ramp || b.cone) continue;
      const feet = p.y - (body.lift || 0);
      if(p.y + H <= b.min.y + 0.05 || feet >= b.max.y - STEP) continue;          // por cima (degrau) ou por baixo
      if(p.x <= b.min.x - r || p.x >= b.max.x + r || p.z <= b.min.z - r || p.z >= b.max.z + r) continue;
      // cantos arredondados: fora da caixa nos 2 eixos → distância ao canto
      const cx = THREE.MathUtils.clamp(p.x, b.min.x, b.max.x), cz = THREE.MathUtils.clamp(p.z, b.min.z, b.max.z);
      const ex = p.x - cx, ez = p.z - cz;
      if(ex !== 0 && ez !== 0){ const d2 = ex * ex + ez * ez; if(d2 >= r * r) continue; const dd = Math.sqrt(d2), k = (r - dd) / dd; p.x += ex * k; p.z += ez * k; body.hitWall = true; continue; }
      if(!d) continue;
      if(ax === 'x'){ p.x = d > 0 ? b.min.x - r - 1e-3 : b.max.x + r + 1e-3; if(Math.sign(v.x) === Math.sign(d)) v.x = 0; }
      else { p.z = d > 0 ? b.min.z - r - 1e-3 : b.max.z + r + 1e-3; if(Math.sign(v.z) === Math.sign(d)) v.z = 0; }
      body.hitWall = true;
    }
  }
  _resolveCircles(body){
    const p = body.pos, r = body.radius;
    const nc = this.nearCircles(p.x - r - 1, p.z - r - 1, p.x + r + 1, p.z + r + 1);
    for(let i = 0; i < nc.length; i++){ const c = nc[i];
      if(p.y - (body.lift || 0) > c.top - 0.2) continue;
      const dx = p.x - c.x, dz = p.z - c.z, d2 = dx * dx + dz * dz, rr = r + c.r;
      if(d2 < rr * rr && d2 > 1e-6){ const d = Math.sqrt(d2), k = (rr - d) / d; p.x += dx * k; p.z += dz * k;
        // desliza: tira a componente da velocidade que aponta para o tronco
        const nx = dx / d, nz = dz / d, vn = body.vel.x * nx + body.vel.z * nz; if(vn < 0){ body.vel.x -= vn * nx; body.vel.z -= vn * nz; } }
    }
  }
  /** se ficou DENTRO de uma caixa (ex.: construíram uma parede em cima), sai pelo lado mais curto */
  _unstick(body){
    const p = body.pos, r = body.radius, H = body.height;
    const nb = this.nearBoxes(p.x - r, p.z - r, p.x + r, p.z + r);
    for(let i = 0; i < nb.length; i++){ const b = nb[i];
      if(b.ramp || b.cone || p.y + H <= b.min.y || p.y - (body.lift || 0) >= b.max.y - STEP) continue;
      if(p.x <= b.min.x || p.x >= b.max.x || p.z <= b.min.z || p.z >= b.max.z) continue;
      const px0 = p.x - b.min.x, px1 = b.max.x - p.x, pz0 = p.z - b.min.z, pz1 = b.max.z - p.z, m = Math.min(px0, px1, pz0, pz1);
      if(m === px0) p.x = b.min.x - r; else if(m === px1) p.x = b.max.x + r; else if(m === pz0) p.z = b.min.z - r; else p.z = b.max.z + r;
    }
  }
  _resolveHorizontal(body){ this._sweepAxis(body, 'x', 0); this._sweepAxis(body, 'z', 0); this._resolveCircles(body); }
  /** v19: obstáculo vertical à frente (para escalar) → topo da parede/rocha/falésia ou null */
  wallAhead(pos, fx, fz, dist, height){
    const px = pos.x + fx * dist, pz = pos.z + fz * dist, y = pos.y;
    let top = null;
    const nb = this.nearBoxes(px - 0.6, pz - 0.6, px + 0.6, pz + 0.6);
    for(let i = 0; i < nb.length; i++){ const b = nb[i];
      if(b.ramp || b.cone || b.noClimb) continue;
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
