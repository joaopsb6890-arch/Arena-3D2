// ============================================================
// v21: OTIMIZADOR DE CENA — junta malhas estáticas irmãs que usam o mesmo material numa só.
//  Cada grupo (baú, casa de POI, barraca, navio, personagem…) era feito de dezenas de peças
//  separadas → uma chamada de desenho por peça. Aqui juntamos as peças FILHAS DIRETAS de cada
//  grupo por (material, sombras), no espaço local do grupo, por isso tudo continua a mexer-se
//  com o pai. Nunca toca em malhas referenciadas pelo código (animadas, destrutíveis, raycast…).
// ============================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Recolhe todos os Object3D referenciados diretamente por propriedades de objetos JS (até `depth`). */
export function collectRefs(roots, opts){
  opts = opts || {};
  const skip = new Set(['app', 'parent', 'children', 'renderer', 'audio', ...(opts.skip || [])]);
  const refs = new Set(), seen = new Set(), depth = opts.depth || 6;
  const walk = (o, d) => {
    if(!o || typeof o !== 'object' || seen.has(o) || d > depth) return; seen.add(o);
    if(o.isObject3D){ refs.add(o); return; }
    if(o.isMaterial || o.isBufferGeometry || o.isTexture || o.isVector3 || o.isQuaternion || o.isColor || o.isMatrix4 || ArrayBuffer.isView(o)) return;
    if(typeof HTMLElement !== 'undefined' && o instanceof HTMLElement) return;
    if(Array.isArray(o)){ for(let i = 0; i < o.length; i++) walk(o[i], d + 1); return; }
    if(o instanceof Map || o instanceof Set){ for(const x of o.values()) walk(x, d + 1); return; }
    for(const k of Object.keys(o)){ if(!skip.has(k)) walk(o[k], d + 1); }
  };
  for(const r of roots) if(r) { if(r.isObject3D){ for(const k of Object.keys(r)) if(!skip.has(k) && k !== 'userData') walk(r[k], 1); walk(r.userData, 1); } else walk(r, 0); }
  return refs;
}


// ---- materiais "recoloríveis": iguais exceto na cor → um só material com cores por vértice ----
const MAPS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'bumpMap', 'alphaMap', 'clearcoatNormalMap', 'sheenColorMap'];
const _sigCache = new WeakMap(), _vcMats = new Map();
function matSig(m){
  if(_sigCache.has(m)) return _sigCache.get(m);
  let sig = null;
  if((m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshBasicMaterial) && !m.transparent && !m.userData.noMerge && !m.onBeforeCompile.__x){
    const e = m.emissive ? m.emissive.getHexString() + ':' + (m.emissiveIntensity || 0) : '';
    sig = [m.type, m.roughness, m.metalness, e, m.side, m.flatShading, m.envMapIntensity, m.sheen || 0, m.clearcoat || 0, m.clearcoatRoughness || 0, m.transmission || 0, m.alphaTest, m.wireframe, m.vertexColors,
      m.defines ? JSON.stringify(m.defines) : '', m.customProgramCacheKey ? m.customProgramCacheKey() : '', ...MAPS.map(k => m[k] ? m[k].uuid : '')].join('|');
  }
  _sigCache.set(m, sig); return sig;
}
function vcMaterial(m, sig){
  let v = _vcMats.get(sig);
  if(!v){ v = m.clone(); v.color.set(0xffffff); v.vertexColors = true; v.name = (m.name || m.type) + '_vc'; v.userData = Object.assign({}, m.userData, { vcMerged: true }); _vcMats.set(sig, v); }
  return v;
}
function bakeColor(ge, m){
  const n = ge.attributes.position.count, c = m.color || new THREE.Color(1, 1, 1), old = m.vertexColors ? ge.attributes.color : null;
  const a = new Float32Array(n * 3);
  for(let i = 0; i < n; i++){ const r = old ? old.getX(i) : 1, g = old ? old.getY(i) : 1, b = old ? old.getZ(i) : 1; a[i * 3] = c.r * r; a[i * 3 + 1] = c.g * g; a[i * 3 + 2] = c.b * b; }
  ge.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
}

const _m = new THREE.Matrix4();
function okMesh(o, protect){
  return o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.visible && !protect.has(o) && !o.children.length
    && !Array.isArray(o.material) && o.material && !o.material.isShaderMaterial && !o.onBeforeRender.__custom
    && o.geometry && o.geometry.isBufferGeometry && !o.geometry.morphAttributes.position && !(o.geometry.groups && o.geometry.groups.length > 1)
    && !o.userData.noMerge && o.renderOrder === 0 && o.layers.mask === 1;
}
/** Junta malhas filhas diretas por material em todos os grupos de `root`. Devolve quantas malhas poupou. */
export function mergeStatic(root, protect, opts){
  opts = opts || {}; const min = opts.min || 2; let saved = 0;
  const groups = [];
  root.traverse(o => { if(o.children.length >= min) groups.push(o); });
  for(const g of groups){
    if(g.userData && g.userData.noMerge) continue;
    const buckets = new Map();
    for(const c of g.children){
      if(!okMesh(c, protect)) continue;
      const sg = opts.recolor === false ? null : matSig(c.material);
      const key = (sg ? 'S' + sg : c.material.uuid + '|' + !!c.material.vertexColors) + '|' + (c.castShadow ? 1 : 0) + (c.receiveShadow ? 1 : 0) + (c.frustumCulled ? 1 : 0);
      if(!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(c);
    }
    for(const list of buckets.values()){
      if(list.length < min) continue;
      const sg = opts.recolor === false ? null : matSig(list[0].material);
      const multi = sg && list.some(c => c.material !== list[0].material);
      const mat = multi ? vcMaterial(list[0].material, sg) : list[0].material, vc = !!mat.vertexColors;
      const geos = [];
      let ok = true;
      for(const c of list){
        c.updateMatrix();
        let ge = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
        for(const k of Object.keys(ge.attributes)) if(!['position', 'normal', 'uv', ...(vc ? ['color'] : [])].includes(k)) ge.deleteAttribute(k);
        if(!ge.attributes.normal) ge.computeVertexNormals();
        if(!ge.attributes.uv) ge.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(ge.attributes.position.count * 2), 2));
        if(ge.attributes.color && ge.attributes.color.itemSize !== 3){ ok = false; break; }
        if(multi) bakeColor(ge, c.material);
        else if(vc && !ge.attributes.color){ const a = new Float32Array(ge.attributes.position.count * 3).fill(1); ge.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); }
        ge.clearGroups();
        ge.applyMatrix4(_m.copy(c.matrix));
        if(c.matrix.determinant() < 0){ ok = false; break; }   // espelhadas invertem as faces — deixa como está
        geos.push(ge);
      }
      if(!ok || geos.length < min) { geos.forEach(x => x.dispose()); continue; }
      const merged = mergeGeometries(geos, false); geos.forEach(x => x.dispose());
      if(!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = list[0].castShadow; mesh.receiveShadow = list[0].receiveShadow; mesh.frustumCulled = list[0].frustumCulled;
      mesh.name = (list[0].name || 'merged') + '+';
      g.add(mesh);
      for(const c of list){ g.remove(c); }
      saved += list.length - 1;
    }
  }
  return saved;
}

/**
 * v21: ACHATAR — junta TODAS as malhas estáticas de um contentor (através de grupos diferentes) por
 * material e por célula do mapa (`cell` unidades). Cada célula fica num Group próprio para o culling
 * por distância continuar a funcionar. Só entra uma malha se nem ela nem nenhum antepassado (até ao
 * contentor) for referenciado pelo código.
 */
export function flattenStatic(container, protect, opts){
  opts = opts || {}; const cell = opts.cell || 96;
  container.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(container.matrixWorld).invert();
  const cand = [];
  const visit = (o, blocked) => {
    for(const c of o.children){
      const b = blocked || protect.has(c) || !c.visible || (c.userData && c.userData.noMerge);
      if(c.isMesh){ if(!b && okMesh(c, protect)) cand.push(c); }
      else if(c.children.length) visit(c, b || c.isLOD || c.isBone);
    }
  };
  visit(container, false);
  const buckets = new Map(), box = new THREE.Box3(), ctr = new THREE.Vector3();
  for(const c of cand){
    if(!c.geometry.boundingBox) c.geometry.computeBoundingBox();
    box.copy(c.geometry.boundingBox).applyMatrix4(c.matrixWorld).getCenter(ctr);
    const sz = box.getSize(new THREE.Vector3()); if(Math.max(sz.x, sz.z) > cell * 1.5) continue;   // peças enormes ficam como estão
    const sg = matSig(c.material);
    const key = Math.floor(ctr.x / cell) + ',' + Math.floor(ctr.z / cell) + '|' + (sg ? 'S' + sg : c.material.uuid + '|' + !!c.material.vertexColors) + '|' + (c.castShadow ? 1 : 0) + (c.receiveShadow ? 1 : 0);
    if(!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(c);
  }
  const cells = new Map(); let saved = 0;
  for(const [key, list] of buckets){
    if(list.length < 2) continue;
    const sg = matSig(list[0].material), multi = sg && list.some(c => c.material !== list[0].material);
    const mat = multi ? vcMaterial(list[0].material, sg) : list[0].material, vc = !!mat.vertexColors, geos = [];
    for(const c of list){
      const M = new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld);
      if(M.determinant() < 0) continue;
      let ge = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
      for(const k of Object.keys(ge.attributes)) if(!['position', 'normal', 'uv', ...(vc ? ['color'] : [])].includes(k)) ge.deleteAttribute(k);
      if(!ge.attributes.normal) ge.computeVertexNormals();
      if(!ge.attributes.uv) ge.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(ge.attributes.position.count * 2), 2));
      if(ge.attributes.color && ge.attributes.color.itemSize !== 3){ ge.dispose(); continue; }
      if(multi) bakeColor(ge, c.material);
      else if(vc && !ge.attributes.color) ge.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(ge.attributes.position.count * 3).fill(1), 3));
      ge.clearGroups(); ge.applyMatrix4(M); ge.userData.src = c; geos.push(ge);
    }
    if(geos.length < 2){ geos.forEach(g => g.dispose()); continue; }
    const merged = mergeGeometries(geos, false);
    if(!merged){ geos.forEach(g => g.dispose()); continue; }
    const ck = key.split('|')[0];
    let cg = cells.get(ck); if(!cg){ cg = new THREE.Group(); cg.name = 'cell_' + ck; cells.set(ck, cg); container.add(cg); }
    const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = list[0].castShadow; mesh.receiveShadow = list[0].receiveShadow; mesh.name = 'flat'; mesh.userData.zone = true;
    cg.add(mesh);
    for(const ge of geos){ const c = ge.userData.src; if(c.parent) c.parent.remove(c); ge.dispose(); }
    saved += geos.length - 1;
  }
  return saved;
}
