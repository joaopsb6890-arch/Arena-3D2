// ============================================================
// SECONDARY MOTION — física secundária
//  • SpringChain: "spring bones" estilo VRM para cabelo, rabo de
//    cavalo, coque, mochila, bolsas (verlet + restrição de
//    comprimento + colisão com esferas do corpo)
//  • VerletCloth: tecido (capa, glider, bandeiras) com restrições
//    estruturais/cisalhamento, vento e colisão.
// ============================================================
import * as THREE from 'three';

// vento global (alimentado pelo sistema de clima)
export const Wind = { dir: new THREE.Vector3(1, 0, 0.3).normalize(), strength: 4, gust: 0, time: 0 };
export function windAt(p, t, out){
  const g = Math.sin(t * 1.3 + p.x * 0.05) * 0.5 + Math.sin(t * 2.7 + p.z * 0.08) * 0.3 + 0.6;
  return out.copy(Wind.dir).multiplyScalar(Wind.strength * (0.6 + g * 0.6 + Wind.gust));
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _wind = new THREE.Vector3(), _next = new THREE.Vector3();

export class SpringChain {
  /**
   * @param joints Object3D[] em ordem (raiz → ponta)
   * @param tailOffset Vector3 local do último joint (ponta)
   */
  constructor(joints, tailOffset, opts){
    opts = opts || {};
    this.stiffness = opts.stiffness ?? 6;
    this.drag = opts.drag ?? 0.35;
    this.gravity = opts.gravity ?? 10;
    this.windScale = opts.wind ?? 0.25;
    this.radius = opts.radius ?? 0.08;
    this.colliders = opts.colliders || [];   // [{obj, offset:Vector3, r}]
    this.enabled = true;
    this.nodes = joints.map((j, i) => {
      const next = joints[i + 1];
      const tail = next ? next.position.clone() : tailOffset.clone();
      return { j, rest: j.quaternion.clone(), tailLocal: tail, len: tail.length(),
        axis: tail.clone().normalize(), cur: new THREE.Vector3(), prev: new THREE.Vector3(), init: false };
    });
  }
  reset(){ this.nodes.forEach(n => n.init = false); }
  update(dt, t){
    if(!this.enabled){ this.nodes.forEach(n => n.j.quaternion.copy(n.rest)); return; }
    dt = Math.min(dt, 1 / 30);
    for(const n of this.nodes){
      const j = n.j;
      j.quaternion.copy(n.rest);
      j.updateMatrixWorld(true);
      const head = j.getWorldPosition(_v1);
      j.parent.getWorldQuaternion(_q1);
      _q1.multiply(n.rest);                       // orientação de repouso no mundo
      const restDir = _v2.copy(n.axis).applyQuaternion(_q1);
      if(!n.init || n.cur.distanceToSquared(head) > n.len * n.len * 16){
        n.cur.copy(head).addScaledVector(restDir, n.len); n.prev.copy(n.cur); n.init = true;
      }
      // integração verlet
      const next = _next.subVectors(n.cur, n.prev).multiplyScalar(1 - this.drag).add(n.cur);
      next.addScaledVector(restDir, this.stiffness * dt * n.len);
      next.y -= this.gravity * dt * dt * 4;
      windAt(head, t, _wind);
      next.addScaledVector(_wind, this.windScale * dt * dt * 4);
      // comprimento
      next.sub(head).normalize().multiplyScalar(n.len).add(head);
      // colisões
      for(const c of this.colliders){
        const cp = c.obj.localToWorld(_v2.copy(c.offset));
        const d = next.distanceTo(cp), rr = c.r + this.radius;
        if(d < rr){ next.sub(cp).normalize().multiplyScalar(rr).add(cp); next.sub(head).normalize().multiplyScalar(n.len).add(head); }
      }
      n.prev.copy(n.cur); n.cur.copy(next);
      // aplica rotação
      const dirLocal = _v2.subVectors(next, head).applyQuaternion(_q2.copy(_q1).invert()).normalize();
      _q2.setFromUnitVectors(n.axis, dirLocal);
      j.quaternion.copy(n.rest).multiply(_q2);
      j.updateMatrixWorld(true);
    }
  }
}

// ------------------------------------------------------------
export class VerletCloth {
  /**
   * @param anchor Object3D ao qual a borda superior está presa
   * @param pins Array<Vector3> posições locais (no anchor) da linha superior (cols+1)
   * @param rows número de segmentos verticais, segLen comprimento de cada
   * @param parent Object3D onde a malha é adicionada (root do personagem)
   */
  constructor(anchor, pins, rows, segLen, material, parent, opts){
    opts = opts || {};
    this.anchor = anchor; this.pins = pins; this.cols = pins.length - 1; this.rows = rows;
    this.segLen = segLen; this.parent = parent;
    this.gravity = opts.gravity ?? 34; this.damping = opts.damping ?? 0.985;
    this.windScale = opts.wind ?? 1; this.iterations = opts.iterations ?? 4;
    this.colliders = opts.colliders || [];
    this.enabled = true;
    const n = (this.cols + 1) * (rows + 1);
    this.p = new Float32Array(n * 3); this.o = new Float32Array(n * 3);
    this.geo = new THREE.PlaneGeometry(1, 1, this.cols, rows);
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.castShadow = true; this.mesh.frustumCulled = false;
    parent.add(this.mesh);
    this.constraints = [];
    const idx = (c, r) => r * (this.cols + 1) + c;
    this.idx = idx;
    const pw = pins[0].distanceTo(pins[1]);
    for(let r = 0; r <= rows; r++) for(let c = 0; c <= this.cols; c++){
      if(c < this.cols) this.constraints.push([idx(c, r), idx(c + 1, r), pw]);
      if(r < rows) this.constraints.push([idx(c, r), idx(c, r + 1), segLen]);
      if(c < this.cols && r < rows){ const d = Math.hypot(pw, segLen); this.constraints.push([idx(c, r), idx(c + 1, r + 1), d], [idx(c + 1, r), idx(c, r + 1), d]); }
    }
    this.init = false;
  }
  _pinWorld(c, out){ return this.anchor.localToWorld(out.copy(this.pins[c])); }
  reset(){ this.init = false; }
  update(dt, t){
    const P = this.p, O = this.o, C = this.cols, R = this.rows;
    this.anchor.updateMatrixWorld(true);
    if(!this.init){
      const down = _v3.set(0, -1, 0);
      for(let r = 0; r <= R; r++) for(let c = 0; c <= C; c++){
        this._pinWorld(c, _v1).addScaledVector(down, r * this.segLen);
        const i = this.idx(c, r) * 3; P[i] = O[i] = _v1.x; P[i + 1] = O[i + 1] = _v1.y; P[i + 2] = O[i + 2] = _v1.z;
      }
      this.init = true;
    }
    if(this.enabled){
      dt = Math.min(dt, 1 / 30);
      const dt2 = dt * dt;
      for(let k = 0; k < P.length; k += 3){
        _v1.set(P[k], P[k + 1], P[k + 2]);
        windAt(_v1, t + k * 0.01, _wind);
        const flutter = Math.sin(t * 9 + k * 0.7) * 0.5 + 0.5;
        const vx = (P[k] - O[k]) * this.damping, vy = (P[k + 1] - O[k + 1]) * this.damping, vz = (P[k + 2] - O[k + 2]) * this.damping;
        O[k] = P[k]; O[k + 1] = P[k + 1]; O[k + 2] = P[k + 2];
        P[k] += vx + _wind.x * this.windScale * dt2 * (0.6 + flutter);
        P[k + 1] += vy - this.gravity * dt2 + _wind.y * dt2;
        P[k + 2] += vz + _wind.z * this.windScale * dt2 * (0.6 + flutter);
      }
      for(let it = 0; it < this.iterations; it++){
        for(const [a, b, rest] of this.constraints){
          const ia = a * 3, ib = b * 3;
          const dx = P[ib] - P[ia], dy = P[ib + 1] - P[ia + 1], dz = P[ib + 2] - P[ia + 2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          const f = (d - rest) / d * 0.5;
          P[ia] += dx * f; P[ia + 1] += dy * f; P[ia + 2] += dz * f;
          P[ib] -= dx * f; P[ib + 1] -= dy * f; P[ib + 2] -= dz * f;
        }
        // pinos
        for(let c = 0; c <= C; c++){
          this._pinWorld(c, _v1); const i = this.idx(c, 0) * 3;
          P[i] = _v1.x; P[i + 1] = _v1.y; P[i + 2] = _v1.z;
        }
        // colisões com esferas do corpo
        for(const col of this.colliders){
          const cp = col.obj.localToWorld(_v2.copy(col.offset));
          for(let k = 0; k < P.length; k += 3){
            const dx = P[k] - cp.x, dy = P[k + 1] - cp.y, dz = P[k + 2] - cp.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if(d2 < col.r * col.r){ const d = Math.sqrt(d2) || 1e-6, s = col.r / d; P[k] = cp.x + dx * s; P[k + 1] = cp.y + dy * s; P[k + 2] = cp.z + dz * s; }
          }
        }
        // chão
        const gy = this.parent.getWorldPosition(_v3).y + 0.05;
        for(let k = 1; k < P.length; k += 3) if(P[k] < gy) P[k] = gy;
      }
    } else {
      for(let r = 0; r <= R; r++) for(let c = 0; c <= C; c++){
        this._pinWorld(c, _v1); _v1.y -= r * this.segLen;
        const i = this.idx(c, r) * 3; P[i] = O[i] = _v1.x; P[i + 1] = O[i + 1] = _v1.y; P[i + 2] = O[i + 2] = _v1.z;
      }
    }
    // escreve na geometria em espaço local do parent
    this.parent.updateMatrixWorld(true);
    const inv = _m.copy(this.parent.matrixWorld).invert();
    const pos = this.geo.attributes.position;
    for(let r = 0; r <= R; r++) for(let c = 0; c <= C; c++){
      const i = this.idx(c, r);
      _v1.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(inv);
      pos.setXYZ(i, _v1.x, _v1.y, _v1.z);
    }
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }
}
const _m = new THREE.Matrix4();
