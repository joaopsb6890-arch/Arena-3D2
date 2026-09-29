// ============================================================
// TEXTURES — geração procedural de mapas PBR (albedo-detail,
// normal, roughness) em canvas. Resolução ajustável pela
// qualidade (512 / 1024 / 2048). Nada é baixado da rede.
// ============================================================
import * as THREE from 'three';

let RES = 1024;
export function setTextureResolution(r){ RES = r; }
export function getTextureResolution(){ return RES; }

const cache = new Map();

// ---------- ruído de valor com tiling ----------
function makeNoise(seed){
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const P = 256, g = new Float32Array(P * P);
  for(let i = 0; i < g.length; i++) g[i] = rnd();
  const at = (x, y) => g[((y % P + P) % P) * P + ((x % P + P) % P)];
  // ruído com período "period" (tile perfeito)
  return function(x, y, period){
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const p = Math.max(1, Math.round(period || P));
    const x0 = xi % p, y0 = yi % p, x1 = (xi + 1) % p, y1 = (yi + 1) % p;
    const a = at(x0, y0), b = at(x1, y0), c = at(x0, y1), d = at(x1, y1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
function fbm(noise, x, y, oct, period){
  let a = 0.5, f = 1, s = 0, n = 0;
  for(let i = 0; i < oct; i++){ s += a * noise(x * f, y * f, period * f); n += a; a *= 0.5; f *= 2; }
  return s / n;
}

// ---------- normal map a partir de heightmap (Sobel) ----------
function heightToNormal(h, W, H, strength){
  const out = new Uint8ClampedArray(W * H * 4);
  const at = (x, y) => h[((y + H) % H) * W + ((x + W) % W)];
  for(let y = 0; y < H; y++){
    for(let x = 0; x < W; x++){
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * W + x) * 4;
      out[i] = (nx * 0.5 + 0.5) * 255; out[i + 1] = (ny * 0.5 + 0.5) * 255; out[i + 2] = nz * 255; out[i + 3] = 255;
    }
  }
  return out;
}
function toTexture(data, W, H, srgb, repeat){
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.putImageData(new ImageData(data, W, H), 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if(repeat) t.repeat.set(repeat, repeat);
  t.needsUpdate = true;
  return t;
}
function grayToRGBA(h, W, H, lo, hi){
  const out = new Uint8ClampedArray(W * H * 4);
  for(let i = 0; i < W * H; i++){
    const v = (lo + (hi - lo) * h[i]) * 255;
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v; out[i * 4 + 3] = 255;
  }
  return out;
}

// ---------- geradores de height por tipo de superfície ----------
const GEN = {
  // tecido: trama (weave) + fibras
  fabric(W, H, n){
    const h = new Float32Array(W * H), cell = W / 96;
    for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
      const u = x / cell, v = y / cell;
      const cu = Math.floor(u), cv = Math.floor(v);
      const fu = u - cu, fv = v - cv;
      const over = ((cu + cv) & 1) === 0;
      const warp = Math.sin(fu * Math.PI) * (over ? 1 : 0.55);
      const weft = Math.sin(fv * Math.PI) * (over ? 0.55 : 1);
      const fib = fbm(n, x / 3, y / 3, 2, W / 3) * 0.25;
      h[y * W + x] = Math.max(warp, weft) * 0.75 + fib;
    }
    return { h, strength: 2.2, rough: [0.72, 0.95] };
  },
  // jeans / sarja diagonal
  denim(W, H, n){
    const h = new Float32Array(W * H);
    for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
      const d = ((x + y) / (W / 64)) % 1;
      const tw = Math.sin(d * Math.PI * 2) * 0.5 + 0.5;
      h[y * W + x] = tw * 0.35 + fbm(n, x / 8, y / 8, 3, W / 8) * 0.65;
    }
    return { h, strength: 1.0, rough: [0.82, 0.96], detail: [0.9, 1.0] };
  },
  // couro: células de Voronoi aproximadas + ruído
  leather(W, H, n){
    const h = new Float32Array(W * H);
    for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
      const a = fbm(n, x / 18, y / 18, 4, W / 18);
      const b = Math.abs(fbm(n, x / 7 + 40, y / 7, 3, W / 7) - 0.5) * 2;
      h[y * W + x] = a * 0.6 + (1 - b) * 0.4;
    }
    return { h, strength: 3.2, rough: [0.45, 0.75] };
  },
  // pele: poros finos + variação suave
  skin(W, H, n){
    const h = new Float32Array(W * H);
    for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
      const pores = n(x / 2.2, y / 2.2, W / 2.2);
      const soft = fbm(n, x / 40, y / 40, 3, W / 40);
      h[y * W + x] = 1 - Math.pow(pores, 6) * 0.6 + soft * 0.25;
    }
    return { h, strength: 1.2, rough: [0.42, 0.62] };
  },
  // metal escovado
  brushed(W, H, n){
    const h = new Float32Array(W * H);
    for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
      h[y * W + x] = n(x / 60, y * 1.0, W / 60) * 0.7 + fbm(n, x / 20, y / 20, 2, W / 20) * 0.3;
    }
    return { h, strength: 0.8, rough: [0.22, 0.42] };
  },
  // polímero texturizado (grip de arma)
  polymer(W, H, n){
    const h = new Float32Array(W * H);
    for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
      const s = n(x / 3, y / 3, W / 3);
      const dia = (Math.sin((x + y) / (W / 180) * Math.PI) * Math.sin((x - y) / (W / 180) * Math.PI)) * 0.5 + 0.5;
      h[y * W + x] = s * 0.5 + dia * 0.5;
    }
    return { h, strength: 1.6, rough: [0.55, 0.8] };
  },
  // madeira (tábuas das construções)
  wood(W, H, n){
    const h = new Float32Array(W * H);
    const planks = 4;
    for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
      const pv = y / H * planks, pi = Math.floor(pv), pf = pv - pi;
      const seam = Math.min(1, Math.min(pf, 1 - pf) * 40);
      const grain = Math.sin((x / W * 30 + fbm(n, x / 50, y / 6 + pi * 17, 4, W / 50) * 8) * Math.PI) * 0.5 + 0.5;
      h[y * W + x] = (grain * 0.5 + 0.5) * seam;
    }
    return { h, strength: 2.6, rough: [0.62, 0.9] };
  },
  // grama/terreno
  ground(W, H, n){
    const h = new Float32Array(W * H);
    for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
      h[y * W + x] = fbm(n, x / 8, y / 8, 5, W / 8);
    }
    return { h, strength: 2.4, rough: [0.8, 1.0] };
  },
  // rocha
  rock(W, H, n){
    const h = new Float32Array(W * H);
    for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
      const r = fbm(n, x / 30, y / 30, 6, W / 30);
      const c = Math.abs(fbm(n, x / 12 + 9, y / 12, 3, W / 12) - 0.5);
      h[y * W + x] = r * 0.8 + (c < 0.04 ? -0.3 : 0);
    }
    return { h, strength: 3.6, rough: [0.7, 0.98] };
  },
  // v16: tijolo (fiadas desencontradas + argamassa funda)
  brick(W, H, n){
    const h = new Float32Array(W * H), rows = 8, cols = 4;
    for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
      const rv = y / H * rows, ri = Math.floor(rv), rf = rv - ri;
      const cv = x / W * cols + (ri % 2) * 0.5, cf = cv - Math.floor(cv);
      const mort = Math.min(1, Math.min(rf, 1 - rf) * 22, Math.min(cf, 1 - cf) * 44);
      const face = 0.75 + fbm(n, x / 10, y / 10, 4, W / 10) * 0.25 + n(Math.floor(cv) * 13.1, ri * 7.7, 256) * 0.1;
      h[y * W + x] = mort < 1 ? mort * 0.5 : face;
    }
    return { h, strength: 3.2, rough: [0.7, 0.95], detail: [0.72, 1.0] };
  },
  // v16: chapa metálica ondulada (contentores, armazéns, construção em metal)
  sheet(W, H, n){
    const h = new Float32Array(W * H);
    for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
      const wave = Math.sin(x / W * Math.PI * 2 * 12) * 0.5 + 0.5;
      const rust = fbm(n, x / 20, y / 20, 4, W / 20);
      const seam = Math.min(1, Math.abs((y / H * 2) % 1 - 0.5) * 60);
      h[y * W + x] = (wave * 0.8 + rust * 0.2) * (0.6 + seam * 0.4);
    }
    return { h, strength: 2.2, rough: [0.35, 0.75], detail: [0.8, 1.0] };
  },
  // v16: betão (poros + juntas de cofragem)
  concrete(W, H, n){
    const h = new Float32Array(W * H);
    for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
      const base = fbm(n, x / 6, y / 6, 5, W / 6);
      const pore = n(x / 1.5, y / 1.5, W / 1.5) > 0.93 ? -0.35 : 0;
      const joint = Math.min(1, Math.min(x % (W / 2), W / 2 - x % (W / 2)) * 0.8);
      h[y * W + x] = (base * 0.6 + 0.4 + pore) * (0.7 + joint * 0.3);
    }
    return { h, strength: 1.8, rough: [0.8, 0.98], detail: [0.84, 1.0] };
  },
  // reboco / parede
  plaster(W, H, n){
    const h = new Float32Array(W * H);
    for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
      h[y * W + x] = fbm(n, x / 14, y / 14, 5, W / 14);
    }
    return { h, strength: 1.5, rough: [0.8, 0.95] };
  },
  // cabelo: fios paralelos
  hair(W, H, n){
    const h = new Float32Array(W * H);
    for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
      h[y * W + x] = n(x / 4, y / 64, W / 4) * 0.7 + n(x / 16, y / 128 + 5, W / 16) * 0.3;
    }
    return { h, strength: 1.2, rough: [0.4, 0.6], detail: [0.85, 1.0] };
  }
};

/**
 * Retorna { normalMap, roughnessMap, detailMap } para um tipo de superfície.
 * Os mapas são compartilhados (cache) — as cores vêm do material.
 */
export function getSurface(kind, res){
  const W = Math.min(res || RES, kind === 'skin' || kind === 'hair' ? RES : RES);
  const key = kind + '_' + W;
  if(cache.has(key)) return cache.get(key);
  const n = makeNoise(kind.length * 7919 + 13);
  const { h, strength, rough, detail } = GEN[kind](W, W, n);
  // normaliza
  let mn = Infinity, mx = -Infinity;
  for(let i = 0; i < h.length; i++){ if(h[i] < mn) mn = h[i]; if(h[i] > mx) mx = h[i]; }
  const k = 1 / ((mx - mn) || 1);
  for(let i = 0; i < h.length; i++) h[i] = (h[i] - mn) * k;
  const normalMap = toTexture(heightToNormal(h, W, W, strength * (W / 512)), W, W, false);
  // roughness: inverso da altura (vales mais ásperos)
  const rh = new Float32Array(h.length);
  for(let i = 0; i < h.length; i++) rh[i] = 1 - h[i];
  const roughnessMap = toTexture(grayToRGBA(rh, W, W, rough[0], rough[1]), W, W, false);
  // detail/albedo: variação sutil de luminância (multiplica a cor)
  const detailMap = toTexture(grayToRGBA(h, W, W, detail ? detail[0] : 0.86, detail ? detail[1] : 1.0), W, W, true);
  const res2 = { normalMap, roughnessMap, detailMap, displacementMap: roughnessMap };
  cache.set(key, res2);
  return res2;
}

// ---------- atlas de partículas ----------
let atlas = null;
export function getParticleAtlas(){
  if(atlas) return atlas;
  const C = 128, cols = 4, rows = 2;
  const c = document.createElement('canvas'); c.width = C * cols; c.height = C * rows;
  const g = c.getContext('2d');
  const cell = (i, fn) => { g.save(); g.translate((i % cols) * C, Math.floor(i / cols) * C); fn(); g.restore(); };
  // 0 glow
  cell(0, () => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, C, C); });
  // 1 smoke (puffs)
  cell(1, () => { for(let i = 0; i < 26; i++){ const x = 64 + (Math.random() - .5) * 60, y = 64 + (Math.random() - .5) * 60, rr = 16 + Math.random() * 26; const r = g.createRadialGradient(x, y, 0, x, y, rr); r.addColorStop(0, 'rgba(255,255,255,.22)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, C, C); } });
  // 2 spark (linha brilhante)
  cell(2, () => { const r = g.createLinearGradient(0, 64, 128, 64); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(.5, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.beginPath(); g.ellipse(64, 64, 62, 7, 0, 0, Math.PI * 2); g.fill(); });
  // 3 flame
  cell(3, () => { const r = g.createRadialGradient(64, 80, 4, 64, 70, 60); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.4, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.beginPath(); g.moveTo(64, 4); g.bezierCurveTo(110, 60, 110, 124, 64, 124); g.bezierCurveTo(18, 124, 18, 60, 64, 4); g.fill(); });
  // 4 drop / rain streak
  cell(4, () => { const r = g.createLinearGradient(64, 0, 64, 128); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(1, 'rgba(255,255,255,.9)'); g.fillStyle = r; g.fillRect(58, 0, 12, 128); });
  // 5 star (magia)
  cell(5, () => { g.translate(64, 64); const r = g.createRadialGradient(0, 0, 0, 0, 0, 60); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; for(let k = 0; k < 4; k++){ g.rotate(Math.PI / 4); g.beginPath(); g.ellipse(0, 0, 60, 6, 0, 0, Math.PI * 2); g.fill(); } g.beginPath(); g.arc(0, 0, 14, 0, Math.PI * 2); g.fill(); });
  // 6 ring (shockwave)
  cell(6, () => { g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 8; g.shadowColor = '#fff'; g.shadowBlur = 16; g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); g.stroke(); });
  // 7 cube (digitalização)
  cell(7, () => { g.fillStyle = 'rgba(255,255,255,1)'; g.fillRect(34, 34, 60, 60); g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 6; g.strokeRect(22, 22, 84, 84); });
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  return atlas;
}
