// ============================================================
// LOBBY — palco estilo Fortnite: fundo em degradê com nuvens,
// jogador ao centro + 3 membros do grupo (NPCs com IA de lobby,
// emotes, falas com lip sync), girar arrastando, câmera com
// parallax e modo cinematográfico.
// ============================================================
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createCharacter, disposeCharacter } from '../anim/rig.js';
import { Animator } from '../anim/animator.js';
import { createPickaxe, createWeapon } from './weapons.js';
import { LobbyNPC } from './ai.js';
import { ParticleSystem } from '../engine/particles.js';
import { CinematicDirector, DEFAULT_SHOTS } from '../engine/camera.js';
import { Mat } from '../engine/materials.js';
import { Wind } from '../anim/secondary.js';

const PARTY = [
  { skin: 'red', name: 'Raven_BR', pitch: 120, x: -7.2, z: -3.2, yaw: 0.3 },
  { skin: 'pink', name: 'SkyeTV', pitch: 230, x: 7.2, z: -3.2, yaw: -0.3 },
  { skin: 'shadow', name: 'Midas77', pitch: 105, x: -13.5, z: -8.5, yaw: 0.45 }
];

export class Lobby {
  constructor(app){
    this.app = app;
    const s = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 2000);
    this.camBase = new THREE.Vector3(0, 4.7, 27); this.camLook = new THREE.Vector3(0, 3.8, 0);
    this.director = new CinematicDirector(this.camera, document.getElementById('letterbox'));
    // ambiente PBR (reflexos) — sala neutra pré-filtrada
    const pm = new THREE.PMREMGenerator(app.renderer.r);
    s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    // fundo degradê estilo lobby (azul → roxo) com "nuvens" procedurais
    const bgMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: { uT: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: `varying vec3 vP; uniform float uT;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*n(p); p*=2.03; a*=.5; } return v; }
        void main(){
          float y = vP.y;
          vec3 top = vec3(0.10,0.22,0.72), mid = vec3(0.22,0.46,0.98), low = vec3(0.55,0.36,0.95);
          vec3 c = mix(low, mid, smoothstep(-0.15, 0.25, y)); c = mix(c, top, smoothstep(0.25, 0.8, y));
          vec2 uv = vec2(atan(vP.x, vP.z) * 1.6, y * 3.) + vec2(uT * 0.01, 0.);
          float cl = smoothstep(0.52, 0.8, fbm(uv * 1.4)) * smoothstep(-0.2, 0.15, y) * (1. - smoothstep(0.35, 0.7, y));
          c = mix(c, vec3(0.85,0.9,1.0), cl * 0.55);
          float rays = pow(max(0., sin(atan(vP.x, vP.y - 0.1) * 14. + uT * 0.05)), 8.) * smoothstep(0.1, 0.5, y) * 0.06;
          c += rays;
          gl_FragColor = vec4(c, 1.);
          #include <colorspace_fragment>
        }`
    });
    this.bg = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), bgMat); s.add(this.bg);
    // palco: disco + anel luminoso
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(30, 31, 1.2, 96), Mat.plaster(0x3b4a9a)); stage.position.y = -0.6; stage.receiveShadow = true; s.add(stage);
    const top = new THREE.Mesh(new THREE.CircleGeometry(29.5, 96), new THREE.MeshPhysicalMaterial({ color: 0x2b3a8a, roughness: 0.25, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.1 }));
    top.rotation.x = -Math.PI / 2; top.position.y = 0.01; top.receiveShadow = true; s.add(top);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(30.2, 0.18, 8, 128), Mat.emissive(0x7dd3fc, 3)); ring.rotation.x = Math.PI / 2; s.add(ring);
    this.spots = [];
    for(const p of [{ x: 0, z: 0, r: 5 }, ...PARTY.map(p => ({ x: p.x, z: p.z, r: 4 }))]){
      const d = new THREE.Mesh(new THREE.RingGeometry(p.r - 0.2, p.r, 64), new THREE.MeshBasicMaterial({ color: 0xa5f3fc, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
      d.rotation.x = -Math.PI / 2; d.position.set(p.x, 0.03, p.z); s.add(d); this.spots.push(d);
    }
    // iluminação de estúdio: key + fill + rim (três pontos) + hemisférica
    s.add(new THREE.HemisphereLight(0xbcd4ff, 0x40306a, 0.9));
    const key = new THREE.DirectionalLight(0xfff1dc, 3.2); key.position.set(12, 22, 18); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -30; key.shadow.camera.right = 30; key.shadow.camera.top = 20; key.shadow.camera.bottom = -10; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03; key.shadow.radius = 4;
    s.add(key);
    const fill = new THREE.DirectionalLight(0x9ab8ff, 0.9); fill.position.set(-16, 8, 10); s.add(fill);
    const rim = new THREE.DirectionalLight(0xc4b5fd, 2.6); rim.position.set(-4, 12, -20); s.add(rim);
    const rim2 = new THREE.DirectionalLight(0x7dd3fc, 1.8); rim2.position.set(10, 8, -16); s.add(rim2);
    this.particles = new ParticleSystem(s, app.qualityName);
    this.particles.addEmitter({ type: 'magic', rate: 5, pos: new THREE.Vector3(0, 0.5, 0), opt: { color: 0x93c5fd, n: 1 } });
    this.members = []; this.bubbles = [];
    this.dragYaw = 0; this.dragVel = 0; this.mouse = new THREE.Vector2();
    this._bind();
  }
  _makeActor(skin, bodyType){
    const ch = createCharacter(skin, { bodyType });
    const anim = new Animator(ch);
    anim.setPickaxe(createPickaxe(skin));
    return { ch, anim, root: ch.root, lookTarget: null };
  }
  setPlayer(skin, bodyType, name){
    if(this.player){ this.scene.remove(this.player.root); disposeCharacter(this.player.ch); }
    const a = this.player = this._makeActor(skin, bodyType);
    a.root.position.set(0, 0, 0); this.scene.add(a.root);
    a.anim.face.setExpression('happy');
    a.anim.play('celebrate');
    this.particles.emit('digitize', a.root.position.clone(), { color: 0x7dd3fc });
    this.playerName = name;
  }
  setParty(on){
    this.members.forEach(m => { this.scene.remove(m.a.root); disposeCharacter(m.a.ch); });
    this.members = [];
    if(!on) return;
    PARTY.forEach((p, i) => {
      const a = this._makeActor(p.skin);
      a.root.position.set(p.x, 0, p.z); a.root.rotation.y = p.yaw; this.scene.add(a.root);
      if(i === 1){ a.anim.setWeapon(createWeapon('rifle')); a.anim.pickaxe.visible = false; }
      const npc = new LobbyNPC(a, this.app.audio, { pitch: p.pitch });
      npc.name = p.name;
      this.members.push({ a, npc, p });
    });
  }
  _bind(){
    const el = this.app.renderer.r.domElement;
    let down = false, lx = 0;
    this._pd = (e) => { if(!this.active) return; down = true; this._down = true; lx = e.clientX; };
    this._pm = (e) => { if(!this.active) return; this.mouse.set(e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1); if(down){ const dx = e.clientX - lx; lx = e.clientX; this.dragVel = dx * 0.012; this.dragYaw += this.dragVel; } };
    this._pu = () => { down = false; this._down = false; };
    el.addEventListener('pointerdown', this._pd); addEventListener('pointermove', this._pm); addEventListener('pointerup', this._pu);
  }
  cinematic(on){
    if(on) this.director.play(DEFAULT_SHOTS, this.player.root, true);
    else { this.director.stop(); this.camera.fov = 30; this.camera.updateProjectionMatrix(); }
  }
  playEmote(id){ if(this.player){ this.player.anim.stopEmotes(); this.player.anim.play(id); } }
  update(dt){
    this.t = (this.t || 0) + dt;
    Wind.time += dt; Wind.strength = 2.5;
    this.bg.material.uniforms.uT.value = this.t;
    if(this.player){
      const a = this.player;
      if(Math.abs(this.dragVel) > 0.0001){ this.dragVel *= Math.exp(-dt * 4); if(!this._down) this.dragYaw += this.dragVel * dt * 30; }
      a.root.rotation.y = this.dragYaw;
      a.anim.update(dt, { vel: new THREE.Vector3(), grounded: true, mode: 'ground', weapon: 'pickaxe', lookTarget: this.camera.position });
    }
    for(const m of this.members){ m.npc.update(dt, this.camera); m.a.anim.update(dt, { vel: new THREE.Vector3(), grounded: true, mode: 'ground', weapon: m.a.anim.weapon ? 'rifle' : 'pickaxe', lookTarget: this.camera.position }); }
    this.spots.forEach((s, i) => s.material.opacity = 0.25 + Math.sin(this.t * 2 + i) * 0.1);
    if(!this.director.update(dt)){
      const c = this.camera;
      c.position.lerp(_tmp.set(this.camBase.x + this.mouse.x * 1.2, this.camBase.y - this.mouse.y * 0.5, this.camBase.z), 1 - Math.exp(-dt * 3));
      c.lookAt(this.camLook);
    }
    this.particles.update(dt);
    this._updateBubbles();
  }
  _updateBubbles(){
    const layer = document.getElementById('lobby-tags'); if(!layer) return;
    const all = [{ a: this.player, name: this.playerName || 'Você', me: true }, ...this.members.map(m => ({ a: m.a, name: m.npc.name, npc: m.npc }))];
    all.forEach((it, i) => {
      if(!it.a) return;
      let el = layer.children[i];
      if(!el){ el = document.createElement('div'); el.className = 'lobby-tag'; el.innerHTML = '<div class="bubble"></div><div class="ln"></div>'; layer.appendChild(el); }
      const p = it.a.root.position.clone().setY(8.4).project(this.camera);
      el.style.transform = `translate(${(p.x * 0.5 + 0.5) * innerWidth}px, ${(-p.y * 0.5 + 0.5) * innerHeight}px) translate(-50%,-100%)`;
      el.querySelector('.ln').textContent = it.name; el.classList.toggle('me', !!it.me);
      const b = el.querySelector('.bubble'), bub = it.npc && it.npc.bubble;
      const show = bub && performance.now() < bub.until;
      b.classList.toggle('show', !!show); if(show) b.textContent = bub.text;
      el.style.display = this.director.active ? 'none' : 'block';
    });
    while(layer.children.length > all.length) layer.lastChild.remove();
  }
}
const _tmp = new THREE.Vector3();
