// ============================================================
// THUMBS — miniaturas 3D reais dos cosméticos (loja/armário).
// Renderizador próprio pequeno; gera 1 miniatura por frame para
// não travar a UI, e guarda em cache (dataURL).
// ============================================================
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createCharacter, disposeCharacter } from '../anim/rig.js';
import { Animator } from '../anim/animator.js';
import { createPickaxe, createGlider } from './weapons.js';

const cache = new Map(), queue = [], waiting = new Map();
let R = null, scene = null, cam = null;

function init(){
  const c = document.createElement('canvas'); c.width = 240; c.height = 300;
  R = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
  R.setPixelRatio(1); R.setSize(240, 300, false);
  R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.1;
  scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(R); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(3, 6, 8); scene.add(key);
  const rim = new THREE.DirectionalLight(0xbcd4ff, 2.0); rim.position.set(-6, 5, -6); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a6, 1.1));
  const fill = new THREE.DirectionalLight(0xffffff, 1.6); fill.position.set(0, -5, 6); scene.add(fill);
  cam = new THREE.PerspectiveCamera(30, 240 / 300, 0.1, 100);
}

function renderItem(id){
  const [cat, key] = id.split(':');
  const holder = new THREE.Group(); scene.add(holder);
  let ch = null;
  if(cat === 'skin'){
    ch = createCharacter(key, {});
    const an = new Animator(ch); an.enabledSecondary = false;
    for(let i = 0; i < 4; i++) an.update(1 / 30, { vel: new THREE.Vector3(), grounded: true, mode: 'ground', weapon: 'none' });
    an.face.setExpression && an.face.setExpression('happy');
    ch.root.rotation.y = 0.35; holder.add(ch.root);
    cam.position.set(0, 5.9, 12.5); cam.lookAt(0, 5.3, 0);
  } else if(cat === 'pickaxe' || cat === 'glider'){
    const o = cat === 'pickaxe' ? createPickaxe(key) : createGlider(0xef4444, key);
    if(cat === 'pickaxe') o.rotation.set(0, Math.PI / 2 + 0.5, -0.6); else o.rotation.set(0, 0.5, 0);
    holder.add(o);
    // enquadra pelo bounding box
    const box = new THREE.Box3().setFromObject(holder), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    const r = Math.max(sz.x, sz.y * 1.25, sz.z) * 0.5;
    const d = r / Math.tan(THREE.MathUtils.degToRad(15)) * 1.15;
    if(cat === 'glider') cam.position.set(c.x + d * 0.25, c.y + d * 0.55, c.z + d * 0.8); else cam.position.set(c.x, c.y + r * 0.25, c.z + d);
    cam.lookAt(c);
  } else { scene.remove(holder); return null; }
  cam.aspect = 240 / 300; cam.updateProjectionMatrix();
  R.setClearColor(0x000000, 0); R.render(scene, cam);
  const url = R.domElement.toDataURL('image/png');
  scene.remove(holder);
  if(ch) disposeCharacter(ch);
  holder.traverse(o => { if(o.geometry) o.geometry.dispose(); });
  return url;
}

/** pede miniatura; cb(url) chamado quando pronta (imediato se em cache) */
export function thumb(id, cb){
  if(cache.has(id)){ cb(cache.get(id)); return; }
  if(!waiting.has(id)){ waiting.set(id, []); queue.push(id); }
  waiting.get(id).push(cb);
}
/** processa um item da fila (chamar no loop) — v23: throttle para não travar */
let _pumpAcc = 0;
export function pumpThumbs(){
  if(!queue.length) return;
  _pumpAcc++;
  if(_pumpAcc % 3 !== 0) return; // processa 1 a cada 3 frames
  try {
    if(!R) init();
    const id = queue.pop();   // LIFO: o que foi pedido por último (tela visível) primeiro
    const url = renderItem(id);
    cache.set(id, url);
    (waiting.get(id) || []).forEach(cb => cb(url)); waiting.delete(id);
  } catch(e){ queue.length = 0; console.warn('thumbs', e); }
}
