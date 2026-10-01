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
      // v17: nós na madeira, tom diferente por tábua e pregos nas pontas
      let kx = 0; const kc = ((pi * 0.37 + 0.2) % 1) * W, ky = (pi + 0.5) * H / planks, kd = Math.hypot((x - kc) * 0.6, y - ky);
      if(kd < W / 26) kx = (1 - kd / (W / 26)) * Math.sin(kd * 0.9) * 0.35;
      const grain = Math.sin((x / W * 30 + fbm(n, x / 50, y / 6 + pi * 17, 4, W / 50) * 8 + kx * 6) * Math.PI) * 0.5 + 0.5;
      const tone = 0.82 + ((pi * 7919) % 13) / 13 * 0.18;
      const nail = (Math.abs(x - W * 0.04) < W / 180 || Math.abs(x - W * 0.96) < W / 180) && Math.abs(pf - 0.5) < 0.06 ? -0.4 : 0;
      h[y * W + x] = ((grain * 0.5 + 0.5) * tone + nail) * seam;
    }
    return { h, strength: 2.6, rough: [0.62, 0.9], detail: [0.66, 1.0] };
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
      h[y * W + x] = r * 0.8 + (c < 0.04 ? -0.3 : 0) + n(x / 2, y / 2, W / 2) * 0.06;
    }
    return { h, strength: 3.6, rough: [0.7, 0.98], detail: [0.68, 1.0] };
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
      // v17: reboco com salpicado fino + manchas de humidade
      h[y * W + x] = fbm(n, x / 14, y / 14, 5, W / 14) * 0.8 + n(x / 1.6, y / 1.6, W / 1.6) * 0.14 + fbm(n, x / 90 + 40, y / 90, 2, W / 90) * 0.12;
    }
    return { h, strength: 1.5, rough: [0.8, 0.95], detail: [0.8, 1.0] };
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
  const detailMap = toTexture(grayToRGBA(h, W, W, detail ? detail[0] : 0.8, detail ? detail[1] : 1.0), W, W, true);
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

// ============================================================
// v17: camadas de textura do terreno (albedo colorido, média ~0.5 → o shader multiplica por 2).
// Relva com folhas pintadas, areia com ondulações, rocha com fendas e estratos, neve com brilho
// e terra com seixos. Todas repetem sem costura (as pinceladas são desenhadas também "do outro lado").
// ============================================================
const terrainCache = {};
function _cv(W){ const c = document.createElement('canvas'); c.width = c.height = W; return [c, c.getContext('2d')]; }
function _baseNoise(ctx, W, n, scale, oct, lo, hi, tint){
  const img = ctx.createImageData(W, W), d = img.data;
  for(let y = 0; y < W; y++) for(let x = 0; x < W; x++){
    const v = lo + (hi - lo) * fbm(n, x / scale, y / scale, oct, W / scale), i = (y * W + x) * 4;
    const t2 = fbm(n, x / (scale * 3) + 50, y / (scale * 3) + 50, 3, W / (scale * 3));
    d[i] = Math.min(255, v * tint[0] * (0.92 + t2 * 0.16) * 255); d[i + 1] = Math.min(255, v * tint[1] * 255); d[i + 2] = Math.min(255, v * tint[2] * (1.08 - t2 * 0.16) * 255); d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
function _wrap(ctx, W, fn){ for(const ox of [-W, 0, W]) for(const oy of [-W, 0, W]) { ctx.save(); ctx.translate(ox, oy); fn(); ctx.restore(); } }
function _tex(c, rep){ const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true; return t; }
export function getTerrainLayers(res){
  const W = Math.min(512, res || 512);
  if(terrainCache[W]) return terrainCache[W];
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out = {};
  // relva
  { const [c, g] = _cv(W), n = makeNoise(101); _baseNoise(g, W, n, W / 10, 4, 0.40, 0.56, [0.96, 1.02, 0.9]);
    const cols = ['rgba(150,190,90,.5)', 'rgba(60,95,40,.45)', 'rgba(185,200,110,.4)', 'rgba(90,130,55,.5)', 'rgba(40,70,30,.35)'];
    for(let i = 0; i < W * 9; i++){ const x = rnd() * W, y = rnd() * W, L = 3 + rnd() * W / 40, a = -Math.PI / 2 + (rnd() - 0.5) * 1.1, col = cols[Math.floor(rnd() * cols.length)], w = 0.8 + rnd() * 1.4;
      const draw = () => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * L * 0.5 + (rnd() - 0.5) * 2, y + Math.sin(a) * L * 0.5, x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke(); };
      if(x < 20 || y < 20 || x > W - 20 || y > W - 20) _wrap(g, W, draw); else draw(); }
    for(let i = 0; i < W / 6; i++){ const x = rnd() * W, y = rnd() * W; g.fillStyle = rnd() < 0.5 ? 'rgba(235,225,120,.45)' : 'rgba(250,250,250,.35)'; g.beginPath(); g.arc(x, y, 0.8 + rnd() * 1.2, 0, 7); g.fill(); }
    out.grass = _tex(c); }
  // areia
  { const [c, g] = _cv(W), n = makeNoise(202); const img = g.createImageData(W, W), d = img.data;
    for(let y = 0; y < W; y++) for(let x = 0; x < W; x++){ const w = fbm(n, x / 40, y / 40, 3, W / 40); const rip = Math.sin((y / W * 22 + w * 5) * Math.PI * 2) * 0.5 + 0.5; const gr = n(x * 1.3, y * 1.3, W * 1.3); const v = 0.44 + rip * 0.07 + (gr - 0.5) * 0.1, i = (y * W + x) * 4; d[i] = v * 1.04 * 255; d[i + 1] = v * 255; d[i + 2] = v * 0.9 * 255; d[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    for(let i = 0; i < W * 2; i++){ const x = rnd() * W, y = rnd() * W; g.fillStyle = rnd() < 0.5 ? 'rgba(90,70,50,.35)' : 'rgba(255,250,235,.4)'; g.fillRect(x, y, 1, 1); }
    out.sand = _tex(c); }
  // rocha
  { const [c, g] = _cv(W), n = makeNoise(303); const img = g.createImageData(W, W), d = img.data;
    for(let y = 0; y < W; y++) for(let x = 0; x < W; x++){ const b = fbm(n, x / 26, y / 26, 5, W / 26), st = Math.sin((y / W * 9 + fbm(n, x / 60, y / 60, 2, W / 60) * 2.2) * Math.PI * 2) * 0.5 + 0.5; const cr = Math.abs(fbm(n, x / 18 + 30, y / 18, 3, W / 18) - 0.5); let v = 0.36 + b * 0.22 + st * 0.05; if(cr < 0.025) v *= 0.55 + cr * 14; const i = (y * W + x) * 4; d[i] = v * 1.02 * 255; d[i + 1] = v * 0.99 * 255; d[i + 2] = v * 0.95 * 255; d[i + 3] = 255; }
    g.putImageData(img, 0, 0); out.rock = _tex(c); }
  // neve
  { const [c, g] = _cv(W), n = makeNoise(404); _baseNoise(g, W, n, W / 8, 4, 0.47, 0.54, [0.97, 0.99, 1.04]);
    for(let i = 0; i < W * 1.5; i++){ const x = rnd() * W, y = rnd() * W; g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(x, y, 1, 1); }
    out.snow = _tex(c); }
  // terra / caminho
  { const [c, g] = _cv(W), n = makeNoise(505); _baseNoise(g, W, n, W / 16, 5, 0.38, 0.56, [1.05, 0.98, 0.9]);
    for(let i = 0; i < W * 0.9; i++){ const x = rnd() * W, y = rnd() * W, r = 1 + rnd() * W / 130, t = 90 + rnd() * 80;
      const draw = () => { g.fillStyle = `rgba(${t + 10},${t},${t - 12},.85)`; g.beginPath(); g.ellipse(x, y, r * (1 + rnd() * 0.6), r, rnd() * 3, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, 7); g.fill(); g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.arc(x + r * 0.2, y + r * 0.5, r * 0.6, 0, 3.14); g.fill(); };
      if(x < 8 || y < 8 || x > W - 8 || y > W - 8) _wrap(g, W, draw); else draw(); }
    out.dirt = _tex(c); }
  terrainCache[W] = out;
  return out;
}
