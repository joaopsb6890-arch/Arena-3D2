// ============================================================
// MATERIALS — biblioteca PBR (MeshPhysicalMaterial) com cache.
// Pele com aproximação de subsuperfície (sheen avermelhado +
// wrap lighting via onBeforeCompile), tecidos com sheen, metais
// com clearcoat, vidro de luneta com transmissão.
// ============================================================
import * as THREE from 'three';
import { getSurface } from './textures.js';

const cache = new Map();
const all = new Set();      // para trocas globais (wireframe, qualidade)

// v15: em qualidade Baixa, sheen e clearcoat são desligados (o shader fica bem mais leve na GPU)
let MQ = 'alta';
function applyQ(m){
  if(!m || !m.isMeshPhysicalMaterial) return;
  const u = m.userData; if(u._sh === undefined){ u._sh = m.sheen; u._cc = m.clearcoat; }
  const low = MQ === 'baixa';
  m.sheen = low ? 0 : u._sh; m.clearcoat = low ? 0 : u._cc;
}
export function setMaterialQuality(q){ MQ = q; all.forEach(applyQ); }
function reg(m){ all.add(m); applyQ(m); return m; }
export function allMaterials(){ return all; }

function surf(kind, repeat){
  const s = getSurface(kind);
  const clone = (t) => { if(!repeat) return t; const c = t.clone(); c.repeat.set(repeat, repeat); c.needsUpdate = true; return c; };
  return { normalMap: clone(s.normalMap), roughnessMap: clone(s.roughnessMap), map: clone(s.detailMap) };
}

// wrap lighting + translucência vermelha barata para simular SSS
function addSubsurface(mat, scatter){
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uScatter = { value: new THREE.Color(scatter) };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uScatter;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        // SSS aproximado: luz "vaza" nas bordas/terminator com tom avermelhado
        float sssNdV = 1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0);
        reflectedLight.indirectDiffuse += uScatter * (0.10 + 0.22 * pow(sssNdV, 2.0)) * diffuseColor.rgb;`);
  };
  mat.customProgramCacheKey = () => 'sss_' + scatter;
}

export function M(key, factory){
  if(cache.has(key)) return cache.get(key);
  const m = reg(factory());
  m.userData.baseKey = key;
  cache.set(key, m);
  return m;
}

// ---------------- fábricas ----------------
export const Mat = {
  skin(color){
    return M('skin_' + color, () => {
      const s = surf('skin', 3);
      const m = new THREE.MeshPhysicalMaterial({
        color, roughness: 0.55, roughnessMap: s.roughnessMap, normalMap: s.normalMap,
        normalScale: new THREE.Vector2(0.35, 0.35), sheen: 0.35, sheenRoughness: 0.5,
        sheenColor: new THREE.Color(0xff6a4a), clearcoat: 0.08, clearcoatRoughness: 0.6
      });
      addSubsurface(m, 0xc0392b);
      return m;
    });
  },
  cloth(color, kind){
    kind = kind || 'fabric';
    return M('cloth_' + kind + '_' + color, () => {
      const s = surf(kind, kind === 'denim' ? 3 : 4);
      return new THREE.MeshPhysicalMaterial({
        color, map: s.map, roughnessMap: s.roughnessMap, roughness: 0.92, normalMap: s.normalMap,
        normalScale: new THREE.Vector2(0.9, 0.9), sheen: 0.25, sheenRoughness: 0.8,
        sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.15)
      });
    });
  },
  leather(color){
    return M('leather_' + color, () => {
      const s = surf('leather', 3);
      return new THREE.MeshPhysicalMaterial({
        color, map: s.map, roughnessMap: s.roughnessMap, roughness: 0.62, normalMap: s.normalMap,
        normalScale: new THREE.Vector2(0.8, 0.8), clearcoat: 0.25, clearcoatRoughness: 0.45
      });
    });
  },
  hair(color){
    return M('hair_' + color, () => {
      const s = surf('hair', 2);
      return new THREE.MeshPhysicalMaterial({
        color, roughness: 0.5, roughnessMap: s.roughnessMap, normalMap: s.normalMap,
        normalScale: new THREE.Vector2(0.45, 0.45), sheen: 0.45, sheenRoughness: 0.45,
        sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.25), map: s.map
      });
    });
  },
  metal(color, rough){
    rough = rough === undefined ? 0.32 : rough;
    return M('metal_' + color + '_' + rough, () => {
      const s = surf('brushed', 2);
      const m = new THREE.MeshPhysicalMaterial({
        color, metalness: 1, roughness: rough, roughnessMap: s.roughnessMap, normalMap: s.normalMap,
        normalScale: new THREE.Vector2(0.25, 0.25), clearcoat: 0.3, clearcoatRoughness: 0.25
      });
      m.userData.envBoost = 2.6; return m;
    });
  },
  paint(color){  // metal pintado / plástico duro
    return M('paint_' + color, () => new THREE.MeshPhysicalMaterial({
      color, metalness: 0.2, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.2
    }));
  },
  polymer(color){
    return M('poly_' + color, () => {
      const s = surf('polymer', 3);
      return new THREE.MeshPhysicalMaterial({
        color, roughness: 0.7, roughnessMap: s.roughnessMap, normalMap: s.normalMap,
        normalScale: new THREE.Vector2(0.6, 0.6), metalness: 0.05
      });
    });
  },
  wood(color){
    return M('wood_' + color, () => {
      const s = surf('wood', 1);
      return new THREE.MeshPhysicalMaterial({
        color, map: s.map, roughnessMap: s.roughnessMap, normalMap: s.normalMap,
        normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.75, clearcoat: 0.15, clearcoatRoughness: 0.6
      });
    });
  },
  glass(color){
    color = color === undefined ? 0xaadfff : color;
    return M('glass_' + color, () => new THREE.MeshPhysicalMaterial({
      color, metalness: 0, roughness: 0.05, transmission: 0.9, thickness: 0.3, ior: 1.5,
      transparent: true, opacity: 0.9, clearcoat: 1, emissive: color, emissiveIntensity: 0.15
    }));
  },
  emissive(color, intensity){
    intensity = intensity === undefined ? 2 : intensity;
    return M('emis_' + color + '_' + intensity, () => new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: intensity, roughness: 0.4, toneMapped: true
    }));
  },
  eyeWhite(){ return M('eyewhite', () => new THREE.MeshPhysicalMaterial({ color: 0xf8f5f0, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 })); },
  iris(color){ return M('iris_' + color, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.02, emissive: color, emissiveIntensity: 0.12 })); },
  pupil(){ return M('pupil', () => new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.1, clearcoat: 1 })); },
  lips(color){ return M('lips_' + color, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: 0.4, clearcoatRoughness: 0.3, sheen: 0.3, sheenColor: new THREE.Color(0xff8888) })); },
  mouthInner(){ return M('mouthIn', () => new THREE.MeshStandardMaterial({ color: 0x3a0d10, roughness: 0.6 })); },
  teeth(){ return M('teeth', () => new THREE.MeshPhysicalMaterial({ color: 0xf5f1e6, roughness: 0.25, clearcoat: 0.6 })); },
  ground(color){
    return M('ground_' + color, () => {
      const s = getSurface('ground');
      const rep = (t, r) => { const c = t.clone(); c.repeat.set(r, r); c.needsUpdate = true; return c; };
      return new THREE.MeshPhysicalMaterial({
        color, map: rep(s.detailMap, 220), normalMap: rep(s.normalMap, 220), roughnessMap: rep(s.roughnessMap, 220),
        normalScale: new THREE.Vector2(1.2, 1.2), roughness: 1, clearcoat: 0, clearcoatRoughness: 0.2
      });
    });
  },
  rock(color){
    return M('rock_' + color, () => {
      const s = surf('rock', 1);
      return new THREE.MeshStandardMaterial({ color, map: s.map, normalMap: s.normalMap, roughnessMap: s.roughnessMap, roughness: 1, normalScale: new THREE.Vector2(1.4, 1.4) });
    });
  },
  // v16: novos materiais de mundo (cidade, fábrica, construções)
  brick(color, rep){
    return M('brick_' + color + '_' + (rep || 2), () => { const s = surf('brick', rep || 2); return new THREE.MeshStandardMaterial({ color, map: s.map, normalMap: s.normalMap, roughnessMap: s.roughnessMap, roughness: 1, normalScale: new THREE.Vector2(1.3, 1.3) }); });
  },
  sheet(color, rep){
    return M('sheet_' + color + '_' + (rep || 1), () => { const s = surf('sheet', rep || 1); const m = new THREE.MeshStandardMaterial({ color, map: s.map, normalMap: s.normalMap, roughnessMap: s.roughnessMap, metalness: 0.55, roughness: 0.8, normalScale: new THREE.Vector2(1.1, 1.1) }); m.userData.envBoost = 1.5; return m; });
  },
  concrete(color, rep){
    return M('concrete_' + color + '_' + (rep || 2), () => { const s = surf('concrete', rep || 2); return new THREE.MeshStandardMaterial({ color, map: s.map, normalMap: s.normalMap, roughnessMap: s.roughnessMap, roughness: 1 }); });
  },
  vcolor(key, opts){  // material de cores por vértice (props instanciados de várias cores → 1 draw call)
    return M('vcol_' + key, () => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.7, metalness: 0.1 }, opts || {})));
  },
  plaster(color){
    return M('plaster_' + color, () => {
      const s = surf('plaster', 2);
      return new THREE.MeshStandardMaterial({ color, map: s.map, normalMap: s.normalMap, roughnessMap: s.roughnessMap, roughness: 1 });
    });
  }
};

// --------------- modos de visualização ---------------
let overrideMode = 'material';
const overrideMats = {
  solid: new THREE.MeshStandardMaterial({ color: 0xbfc3c9, roughness: 0.7, metalness: 0 }),
  wireframe: new THREE.MeshBasicMaterial({ color: 0x22d3ee, wireframe: true }),
  normals: new THREE.MeshNormalMaterial()
};
export function setViewMode(scene, mode){
  overrideMode = mode;
  scene.overrideMaterial = overrideMats[mode] || null;
}
export function getViewMode(){ return overrideMode; }
