// ============================================================
// TRAIL — rastro em fita (ribbon) entre dois pontos que se movem
// (base e ponta de uma picareta, pontas de asa, mãos na queda).
// Cada frame empurra um par de vértices; a fita desvanece pela idade.
// ============================================================
import * as THREE from 'three';

export class Trail {
  constructor(scene, opts){
    opts = opts || {};
    this.n = opts.segments || 24;
    this.life = opts.life || 0.22;
    this.color = new THREE.Color(opts.color ?? 0xffffff);
    this.rainbow = !!opts.rainbow;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.n * 2 * 3);
    this.col = new Float32Array(this.n * 2 * 4);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for(let i = 0; i < this.n - 1; i++){ const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
    g.setIndex(idx);
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.userData.noProbe = true; this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.pts = [];         // { a: Vector3, b: Vector3, age }
    this.emitting = false;
    this.opacity = opts.opacity ?? 0.8;
  }
  push(a, b){ this.pts.unshift({ a: a.clone(), b: b.clone(), age: 0 }); if(this.pts.length > this.n) this.pts.length = this.n; }
  update(dt, a, b){
    for(const p of this.pts) p.age += dt;
    while(this.pts.length && this.pts[this.pts.length - 1].age > this.life) this.pts.pop();
    if(this.emitting && a && b) this.push(a, b);
    const P = this.pos, C = this.col, n = this.pts.length;
    for(let i = 0; i < this.n; i++){
      const p = this.pts[Math.min(i, Math.max(0, n - 1))];
      const k = i * 6, c = i * 8;
      if(!p){ P.fill(0, k, k + 6); C.fill(0, c, c + 8); continue; }
      P[k] = p.a.x; P[k + 1] = p.a.y; P[k + 2] = p.a.z; P[k + 3] = p.b.x; P[k + 4] = p.b.y; P[k + 5] = p.b.z;
      const f = i < n ? Math.max(0, 1 - p.age / this.life) * (1 - i / this.n) : 0;
      let col = this.color;
      if(this.rainbow){ col = _c.setHSL((i / this.n + performance.now() * 0.0003) % 1, 0.9, 0.6); }
      C[c] = col.r; C[c + 1] = col.g; C[c + 2] = col.b; C[c + 3] = f * this.opacity * 0.25;   // borda interna mais suave
      C[c + 4] = col.r; C[c + 5] = col.g; C[c + 6] = col.b; C[c + 7] = f * this.opacity;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
    this.mesh.visible = n > 1;
  }
  dispose(){ this.mesh.parent && this.mesh.parent.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
}
const _c = new THREE.Color();
