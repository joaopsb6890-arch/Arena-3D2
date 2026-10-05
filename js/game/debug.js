// ============================================================
// v22: DEBUG (F3) — colisões visíveis + painel de desempenho
//  • caixas de colisão perto do jogador (paredes = verde, rampas = amarelo,
//    cones = laranja, tocadas agora = vermelho), troncos/rochas (círculos azuis)
//    e a cápsula do jogador (ciano; vermelho quando encosta a uma parede)
//  • FPS, ms CPU (lógica + render), ms GPU (quando o browser suporta timer queries),
//    memória JS, geometrias/texturas na GPU, draws/triângulos, ping, entidades, tick de rede
// ============================================================
import * as THREE from 'three';

const COL = { box: new THREE.Color(0x22c55e), ramp: new THREE.Color(0xfacc15), cone: new THREE.Color(0xfb923c), hit: new THREE.Color(0xef4444), circle: new THREE.Color(0x38bdf8), me: new THREE.Color(0x22d3ee) };

export class DebugOverlay {
  constructor(m){
    this.m = m; this.on = false; this.t = 0;
    const MAX = 24000;
    this.pos = new Float32Array(MAX * 3); this.col = new Float32Array(MAX * 3); this.max = MAX;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.85 }));
    this.lines.frustumCulled = false; this.lines.renderOrder = 999; this.lines.visible = false;
    m.scene.add(this.lines);
    this.el = document.createElement('div'); this.el.id = 'debug-hud'; this.el.className = 'hide';
    (document.getElementById('hud') || document.body).appendChild(this.el);
  }
  toggle(){ this.on = !this.on; this.lines.visible = this.on; this.el.classList.toggle('hide', !this.on); this.m.toast(this.on ? 'Debug ligado (F3)' : 'Debug desligado'); }
  _seg(n, a, b, c){ if(n >= this.max) return n; const p = this.pos, q = this.col, i = n * 3; p[i] = a.x; p[i + 1] = a.y; p[i + 2] = a.z; q[i] = c.r; q[i + 1] = c.g; q[i + 2] = c.b; p[i + 3] = b.x; p[i + 4] = b.y; p[i + 5] = b.z; q[i + 3] = c.r; q[i + 4] = c.g; q[i + 5] = c.b; return n + 2; }
  _box(n, mn, mx, c){
    const V = [[mn.x, mn.y, mn.z], [mx.x, mn.y, mn.z], [mx.x, mn.y, mx.z], [mn.x, mn.y, mx.z], [mn.x, mx.y, mn.z], [mx.x, mx.y, mn.z], [mx.x, mx.y, mx.z], [mn.x, mx.y, mx.z]].map(v => ({ x: v[0], y: v[1], z: v[2] }));
    for(const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) n = this._seg(n, V[a], V[b], c);
    return n;
  }
  update(dt){
    if(!this.on) return;
    this.t -= dt; if(this.t > 0) return; this.t = 0.12;
    const m = this.m, P = m.player, ph = m.physics; if(!P) return;
    const p = P.body.pos, R = 45; let n = 0;
    const boxes = ph.nearBoxes(p.x - R, p.z - R, p.x + R, p.z + R).slice();
    for(const b of boxes){
      const touch = P.body.hitWall && p.x > b.min.x - 2 && p.x < b.max.x + 2 && p.z > b.min.z - 2 && p.z < b.max.z + 2 && p.y < b.max.y && p.y + P.body.height > b.min.y;
      const c = touch ? COL.hit : b.ramp ? COL.ramp : b.cone ? COL.cone : COL.box;
      n = this._box(n, b.min, b.max, c);
      if(b.ramp){ // diagonal da superfície
        const lo = { x: 0, y: b.min.y, z: 0 }, hi = { x: 0, y: b.max.y, z: 0 }, r = b.ramp;
        if(r.axis === 'x'){ lo.x = r.dir > 0 ? b.min.x : b.max.x; hi.x = r.dir > 0 ? b.max.x : b.min.x; lo.z = hi.z = (b.min.z + b.max.z) / 2; }
        else { lo.z = r.dir > 0 ? b.min.z : b.max.z; hi.z = r.dir > 0 ? b.max.z : b.min.z; lo.x = hi.x = (b.min.x + b.max.x) / 2; }
        n = this._seg(n, lo, hi, COL.ramp);
      }
    }
    for(const c of ph.nearCircles(p.x - R, p.z - R, p.x + R, p.z + R)){
      const y0 = m.world && m.world.heightAt ? ph.heightAt(c.x, c.z) : 0, y1 = Math.min(c.top, y0 + 14), K = 12;
      for(let k = 0; k < K; k++){ const a0 = k / K * 6.283, a1 = (k + 1) / K * 6.283;
        const A = { x: c.x + Math.cos(a0) * c.r, z: c.z + Math.sin(a0) * c.r }, B = { x: c.x + Math.cos(a1) * c.r, z: c.z + Math.sin(a1) * c.r };
        n = this._seg(n, { x: A.x, y: y0 + 0.2, z: A.z }, { x: B.x, y: y0 + 0.2, z: B.z }, COL.circle);
        n = this._seg(n, { x: A.x, y: y1, z: A.z }, { x: B.x, y: y1, z: B.z }, COL.circle);
        if(k % 3 === 0) n = this._seg(n, { x: A.x, y: y0 + 0.2, z: A.z }, { x: A.x, y: y1, z: A.z }, COL.circle);
      }
    }
    // cápsula do jogador
    const r = P.body.radius, h = P.body.height, cc = P.body.hitWall ? COL.hit : COL.me;
    for(let k = 0; k < 16; k++){ const a0 = k / 16 * 6.283, a1 = (k + 1) / 16 * 6.283;
      for(const yy of [0.05, h * 0.5, h]) n = this._seg(n, { x: p.x + Math.cos(a0) * r, y: p.y + yy, z: p.z + Math.sin(a0) * r }, { x: p.x + Math.cos(a1) * r, y: p.y + yy, z: p.z + Math.sin(a1) * r }, cc);
      if(k % 4 === 0) n = this._seg(n, { x: p.x + Math.cos(a0) * r, y: p.y, z: p.z + Math.sin(a0) * r }, { x: p.x + Math.cos(a0) * r, y: p.y + h, z: p.z + Math.sin(a0) * r }, cc);
    }
    // vetor velocidade
    n = this._seg(n, { x: p.x, y: p.y + 1, z: p.z }, { x: p.x + P.body.vel.x * 0.25, y: p.y + 1 + P.body.vel.y * 0.25, z: p.z + P.body.vel.z * 0.25 }, COL.hit);
    const g = this.lines.geometry; g.setDrawRange(0, n); g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    this._hud(boxes.length);
  }
  _hud(nBoxes){
    const m = this.m, app = m.app, R = app.renderer, pf = app.perf || {}, info = R.r.info, P = m.player;
    const mem = performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(0) + ' MB' : 'n/d';
    const ping = m.session && m.session.pingMs ? m.session.pingMs() : null;
    const ents = m.actors.length, alive = m.actors.filter(a => a.alive).length;
    const parts = m.particles ? m.particles.count : '-';
    const net = m.net ? Math.round(1 / (m.net.tickDt || 1 / 30)) + ' Hz' : 'offline';
    this.el.innerHTML = `<b>DEBUG · F3</b>
      <span>FPS <i>${R.fps.toFixed(0)}</i> (${R.frameMs.toFixed(1)} ms)</span>
      <span>CPU lógica <i>${(pf.upd || 0).toFixed(2)} ms</i> · render <i>${(pf.ren || 0).toFixed(2)} ms</i></span>
      <span>GPU <i>${pf.gpu != null ? pf.gpu.toFixed(2) + ' ms' : 'n/d'}</i> · escala ${R.r.getPixelRatio().toFixed(2)}x · ${app.qualityName}</span>
      <span>Draws <i>${info.render.calls}</i> · tris <i>${(info.render.triangles / 1000).toFixed(0)}k</i></span>
      <span>Memória JS <i>${mem}</i> · geo ${info.memory.geometries} · tex ${info.memory.textures} · shaders ${info.programs ? info.programs.length : '-'}</span>
      <span>Ping <i>${ping == null ? '--' : ping + ' ms'}</i> · rede ${net}</span>
      <span>Entidades <i>${ents}</i> (vivos ${alive}) · estruturas ${m.structures.length} · corpos ${m.physics.bodies.length} · partículas ${parts} · zonas ocultas ${m._zoneHidden || 0}/${m._zones ? m._zones.length : 0}</span>
      <span>Colisores perto <i>${nBoxes}</i> · pos ${P.body.pos.x.toFixed(1)}, ${P.body.pos.y.toFixed(1)}, ${P.body.pos.z.toFixed(1)} · ${P.body.grounded ? 'no chão' : 'no ar'}${P.body.hitWall ? ' · parede' : ''}</span>`;
  }
  dispose(){ this.m.scene.remove(this.lines); this.lines.geometry.dispose(); this.el.remove(); }
}
