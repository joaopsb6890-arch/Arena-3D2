import { attachBackBling } from './cosmetics22.js';
import { applyTransmission } from '../engine/materials.js';
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
import { createPickaxe, createWeapon, createGlider } from './weapons.js';
import { LobbyNPC } from './ai.js';
import { ParticleSystem } from '../engine/particles.js';
import { CinematicDirector, DEFAULT_SHOTS } from '../engine/camera.js';
import { Mat } from '../engine/materials.js';
import { Wind } from '../anim/secondary.js';
import { makeBattleBus } from './bus.js';
import { createPet, PetBrain } from './pets.js';

const SKINS_OK = (k) => typeof k === 'string' && k.length < 24;
const PARTY = [
  { skin: 'red', name: 'Raven_BR', pitch: 120, x: -4.8, z: -2.6, yaw: 0.3 },
  { skin: 'pink', name: 'SkyeTV', pitch: 230, x: 4.8, z: -2.6, yaw: -0.3 },
  { skin: 'shadow', name: 'Midas77', pitch: 105, x: 8.8, z: -10.5, yaw: -0.4 }
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
    // v15: céu de lobby estilo Fortnite — degradê vivo, sol suave, nuvens estilizadas,
    // silhuetas de ilhas no horizonte e feixes de luz. (4 oitavas de ruído, 1 draw call)
    const bgMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uT: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: `varying vec3 vP; uniform float uT;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<4;i++){ v+=a*n(p); p*=2.07; a*=.5; } return v; }
        void main(){
          float y = vP.y, az = atan(vP.x, vP.z);
          vec3 zen = vec3(0.02,0.01,0.08), mid = vec3(0.08,0.03,0.25), hor = vec3(0.15,0.08,0.40), warm = vec3(0.40,0.20,0.60);
          vec3 c = mix(hor, mid, smoothstep(0.0, 0.3, y)); c = mix(c, zen, smoothstep(0.3, 0.9, y));
          // sol atrás/à direita do palco
          vec3 sd = normalize(vec3(0.45, 0.22, -0.85)); float sdot = max(0., dot(vP, sd));
          c = mix(c, warm, pow(sdot, 14.) * 0.4 * (1. - smoothstep(0.1, 0.6, y)));
          c += vec3(0.6,0.4,0.9) * pow(sdot, 200.) * 1.5;
          // nuvens estilizadas (bordas nítidas, base mais escura)
          vec2 uv = vec2(az * 2.2 + uT * 0.004, y * 5.5);
          float f = fbm(uv * 1.3 + vec2(0., fbm(uv * 0.7) * 0.8));
          float band = smoothstep(-0.02, 0.12, y) * (1. - smoothstep(0.3, 0.55, y));
          float cl = smoothstep(0.6, 0.66, f) * band;
          vec3 cc = mix(vec3(0.35,0.25,0.55), vec3(0.60,0.45,0.85), smoothstep(0.56, 0.75, f));
          c = mix(c, cc, cl * 0.85);
          // silhuetas de ilhas no horizonte
          float isl = fbm(vec2(az * 3.5, 0.)) * 0.09 - 0.02 + n(vec2(az * 14., 1.)) * 0.015;
          float land = smoothstep(isl + 0.004, isl - 0.004, y) * smoothstep(-0.2, -0.02, y);
          c = mix(c, mix(vec3(0.20,0.12,0.40), vec3(0.30,0.20,0.55), smoothstep(-0.05, 0.06, y)), land * 0.85);
          // mar abaixo do horizonte
          if(y < -0.02) c = mix(vec3(0.10,0.06,0.25), vec3(0.05,0.02,0.15), smoothstep(-0.02, -0.4, y));
          // feixes de luz
          float rays = pow(max(0., sin(az * 9. + uT * 0.04)), 10.) * smoothstep(0.05, 0.5, y) * (1. - smoothstep(0.5, 0.95, y)) * 0.07;
          c += rays;
          gl_FragColor = vec4(c, 1.);
          #include <colorspace_fragment>
        }`
    });
    this.bg = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), bgMat); s.add(this.bg);
    s.fog = new THREE.Fog(0x1a1040, 90, 520);
    // palco em dois níveis com bordas luminosas
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(30, 31, 1.2, 96), Mat.plaster(0x2e1065)); stage.position.y = -0.6; stage.receiveShadow = true; s.add(stage);
    const base2 = new THREE.Mesh(new THREE.CylinderGeometry(33, 35, 2.4, 96), Mat.plaster(0x1e1b4b)); base2.position.y = -2.2; base2.receiveShadow = true; s.add(base2);
    const top = new THREE.Mesh(new THREE.CircleGeometry(29.5, 96), new THREE.MeshPhysicalMaterial({ color: 0x312e81, roughness: 0.22, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 }));
    top.rotation.x = -Math.PI / 2; top.position.y = 0.01; top.receiveShadow = true; s.add(top);
    // hexágonos subtis no chão do palco
    const hexM = new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false });
    for(let i = 0; i < 3; i++){ const hx = new THREE.Mesh(new THREE.RingGeometry(9 + i * 6.5, 9.15 + i * 6.5, 6), hexM); hx.rotation.x = -Math.PI / 2; hx.position.y = 0.02; s.add(hx); }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(30.2, 0.18, 8, 128), Mat.emissive(0xa855f7, 3)); ring.rotation.x = Math.PI / 2; s.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(34.6, 0.14, 8, 128), Mat.emissive(0x7c3aed, 2.4)); ring2.rotation.x = Math.PI / 2; ring2.position.y = -1.0; s.add(ring2);
    this.spots = [];
    // v17: pódios para cada membro do grupo (base metálica + anel luminoso + faixa)
    const podM = new THREE.MeshPhysicalMaterial({ color: 0x1e1b4b, metalness: 0.7, roughness: 0.28, clearcoat: 0.6 }), podTop = new THREE.MeshPhysicalMaterial({ color: 0x312e81, metalness: 0.3, roughness: 0.35, clearcoat: 1 });
    for(const p of [{ x: 0, z: 0, r: 4.2, c: 0xc084fc }, ...PARTY.map(p => ({ x: p.x, z: p.z, r: 3.4, c: 0xa855f7 }))]){
      const pd = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r + 0.35, 0.5, 48), podM); pd.position.set(p.x, 0.25 - 0.5, p.z); pd.receiveShadow = true; pd.castShadow = true; s.add(pd);
      const tp = new THREE.Mesh(new THREE.CircleGeometry(p.r - 0.1, 48), podTop); tp.rotation.x = -Math.PI / 2; tp.position.set(p.x, 0.005, p.z); tp.receiveShadow = true; s.add(tp);
      const rg = new THREE.Mesh(new THREE.TorusGeometry(p.r + 0.05, 0.07, 6, 64), Mat.emissive(p.c, 2.2)); rg.rotation.x = Math.PI / 2; rg.position.set(p.x, 0.02, p.z); s.add(rg);
    }
    for(const p of [{ x: 0, z: 0, r: 5 }, ...PARTY.map(p => ({ x: p.x, z: p.z, r: 4 }))]){
      const d = new THREE.Mesh(new THREE.RingGeometry(p.r - 0.2, p.r, 64), new THREE.MeshBasicMaterial({ color: 0xc4b5fd, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
      d.rotation.x = -Math.PI / 2; d.position.set(p.x, 0.03, p.z); s.add(d); this.spots.push(d);
    }
    // feixes de holofote volumétricos (cones aditivos com degradê)
    const beamMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uC: { value: new THREE.Color(0xa855f7) } },
      vertexShader: 'varying float vY; varying vec3 vN, vV; void main(){ vY = uv.y; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uC; varying float vY; varying vec3 vN, vV; void main(){ float e = pow(abs(dot(vN, vV)), 1.5); gl_FragColor = vec4(uC, vY * vY * e * 0.16); }' });
    this.beams = [];
    for(const [x, z, c] of [[-14, -12, 0xa855f7], [14, -12, 0x7c3aed], [0, -18, 0xc084fc]]){
      const m = beamMat.clone(); m.uniforms.uC.value = new THREE.Color(c);
      const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 6, 60, 24, 1, true), m); bm.geometry.translate(0, -30, 0);
      bm.position.set(x, 55, z); bm.userData.rz = x * 0.012; bm.rotation.set(-0.2, 0, bm.userData.rz); s.add(bm); this.beams.push(bm);
    }
    // ilhas flutuantes ao fundo (rocha + relva + árvores estilizadas), balançam devagar
    this.islands = [];
    const rockM = new THREE.MeshStandardMaterial({ color: 0x9a8a78, roughness: 0.95, flatShading: true }), grassM = Mat.cloth(0x5cc646, 'fabric'), leafM = Mat.cloth(0x2f9e44, 'fabric'), trunkM = Mat.wood(0x7c4a24);
    const mkIsland = (x, y, z, sc) => {
      const g = new THREE.Group();
      const rk = new THREE.ConeGeometry(6, 9, 9, 3); const rp = rk.attributes.position;
      for(let i = 0; i < rp.count; i++){ const k = 1 + Math.sin(i * 12.9898) * 0.12; rp.setXYZ(i, rp.getX(i) * k, rp.getY(i), rp.getZ(i) * k); }
      rk.computeVertexNormals(); const rock = new THREE.Mesh(rk, rockM); rock.rotation.x = Math.PI; rock.position.y = -4.5; g.add(rock);
      const gr = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.1, 1.2, 12), grassM); gr.position.y = 0.4; g.add(gr);
      for(let t = 0; t < 3; t++){
        const a = t * 2.1 + x, r = 2.5 + (t % 2) * 1.5;
        const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 3, 6), trunkM); tr.position.set(Math.cos(a) * r, 2.4, Math.sin(a) * r); g.add(tr);
        const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 0), leafM); lf.position.set(Math.cos(a) * r, 4.6, Math.sin(a) * r); lf.scale.set(1, 1.2, 1); g.add(lf);
      }
      g.position.set(x, y, z); g.scale.setScalar(sc); g.userData.y0 = y; g.userData.ph = x * 0.13; s.add(g); this.islands.push(g);
    };
    mkIsland(-62, 14, -150, 1.0); mkIsland(70, 22, -190, 1.2); mkIsland(-120, 30, -260, 1.5); mkIsland(125, 6, -240, 1.1);
    // ônibus de batalha a atravessar o céu com o balão azul
    // v17: o mesmo Ônibus de Batalha detalhado da partida
    const bus = this.bus = makeBattleBus(); bus.scale.setScalar(0.55); bus.rotation.y = Math.PI / 2;
    bus.position.set(-260, 48, -300); s.add(bus);
    // iluminação de estúdio: key + fill + rim — hemisférica mais baixa (rostos menos lavados, mais volume)
    s.add(new THREE.HemisphereLight(0xc4b5fd, 0x2e1065, 0.55));
    const key = new THREE.DirectionalLight(0xe9d5ff, 3.4); key.position.set(12, 22, 18); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -30; key.shadow.camera.right = 30; key.shadow.camera.top = 20; key.shadow.camera.bottom = -10; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03; key.shadow.radius = 4;
    s.add(key);
    const fill = new THREE.DirectionalLight(0x7c3aed, 0.6); fill.position.set(-16, 8, 10); s.add(fill);
    const rim = new THREE.DirectionalLight(0xa855f7, 2.8); rim.position.set(-4, 12, -20); s.add(rim);
    const rim2 = new THREE.DirectionalLight(0x6366f1, 2.0); rim2.position.set(10, 8, -16); s.add(rim2);
    this.particles = new ParticleSystem(s, app.qualityName);
    this.particles.addEmitter({ type: 'magic', rate: 5, pos: new THREE.Vector3(0, 0.5, 0), opt: { color: 0xa855f7, n: 1 } });
    this.members = []; this.bubbles = [];
    this.dragYaw = 0; this.dragVel = 0; this.mouse = new THREE.Vector2();
    this._bind();
  }
  _makeActor(skin, bodyType, pickStyle){
    const ch = createCharacter(skin, { bodyType });
    const anim = new Animator(ch);
    anim.setPickaxe(createPickaxe(pickStyle || 'padrao'));
    return { ch, anim, root: ch.root, lookTarget: null };
  }
  setPlayer(skin, bodyType, name, loadout){
    const changed = this.player && (this.player.skin !== skin || this.player.bodyType !== bodyType || JSON.stringify(this.loadout) !== JSON.stringify(loadout));
    // v23: não recriar o personagem se nada mudou (evita travas no armário)
    if(this.player && !changed){ this.playerName = name; if(this.app) this.app.lobby && (this.app.lobby.playerName = name); return; }
    if(this.player){ this.scene.remove(this.player.root); disposeCharacter(this.player.ch); }
    this.loadout = loadout || this.loadout || {};
    const a = this.player = this._makeActor(skin, bodyType, this.loadout.pickaxe);
    a.skin = skin; a.bodyType = bodyType; if(this.app && this.app.settings) attachBackBling(a.ch, this.app.settings.backbling);
    // v24: pet do jogador
    this._spawnPet();
    this.glider = null; this.previewGlide = false;
    a.root.position.set(0, 0, 0); this.scene.add(a.root);
    a.anim.face.setExpression('happy');
    a.anim.play('celebrate');
    this.particles.emit('digitize', a.root.position.clone(), { color: 0xa855f7 });
    this.playerName = name;
    // reação dos amigos à skin nova
    if(changed && this.members.length){
      const m = this.members[Math.floor(Math.random() * this.members.length)];
      setTimeout(() => { if(m.a.ch.root.parent){ m.npc.say(['Skin nova? Ficou top!', 'Uau, que visual!', 'Essa é rara, hein?', 'Combinou com você!'][Math.floor(Math.random() * 4)]); m.a.anim.play('clap'); } }, 700);
    }
  }
  /** pré-visualização de planador: pose de voo + planador sobre o personagem */
  previewGlider(style){
    const a = this.player; if(!a) return;
    if(this.glider){ a.root.remove(this.glider); this.glider = null; }
    if(!style){ this.previewGlide = false; return; }
    this.glider = createGlider(a.ch.S.accent || 0xfbbf24, style); this.glider.position.set(0, 7.6, -0.6); this.glider.rotation.x = 0.4; a.root.add(this.glider);
    this.previewGlide = true; this.particles.emit('digitize', a.root.position.clone().setY(7), { color: 0xa855f7 });
  }
  setPickaxeStyle(style){
    const a = this.player; if(!a) return;
    this.previewGlider(null);
    const old = a.anim.pickaxe; if(old && old.parent) old.parent.remove(old);
    a.anim.setPickaxe(createPickaxe(style)); a.anim.play('pickaxeSwing3');
  }
  /** v20: mostra no lobby os jogadores reais da sala (até 3) em vez do grupo fictício */
  setRoster(list){
    const key = list ? list.map(p => p.id + ':' + p.skin).join('|') : '';
    if(key === this._rosterKey) return; this._rosterKey = key;
    if(!list || !list.length){ this.setParty(this.app.settings.party); return; }
    this.setParty(true, list.slice(0, 3).map((p, i) => Object.assign({}, PARTY[i], { skin: p.skin && SKINS_OK(p.skin) ? p.skin : PARTY[i].skin, name: p.name })));
  }
  setParty(on, custom){
    if(!custom) this._rosterKey = '';
    this.members.forEach(m => { this.scene.remove(m.a.root); disposeCharacter(m.a.ch); });
    this.members = [];
    if(!on) return;
    (custom || PARTY).forEach((p, i) => {
      const a = this._makeActor(p.skin, undefined, ['machado', 'cristal', 'doce', 'martelo'][i % 4]);
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
  playEmote(id){
    if(!this.player) return;
    this.previewGlider(null);
    this.player.anim.stopEmotes(); this.player.anim.play(id);
    // os amigos entram na dança (com atraso humano, nem todos)
    this.members.forEach((m, i) => { if(Math.random() < 0.7) setTimeout(() => { if(m.a.ch.root.parent){ m.a.anim.stopEmotes(); m.a.anim.play(id); } }, 500 + i * 350 + Math.random() * 400); });
  }
  /** v24: cria o pet do jogador no lobby */
  _spawnPet(){
    if(this.pet){ this.petBrain.dispose(); this.pet = null; this.petBrain = null; }
    const petType = this.app && this.app.settings ? this.app.settings.pet : null;
    if(!petType || petType === 'nenhum') return;
    this.pet = createPet(petType);
    if(this.pet){ this.scene.add(this.pet); this.petBrain = new PetBrain(this.pet, this.player, this.scene); }
  }
  update(dt){
    this._ntT = (this._ntT || 0) - dt; if(this._ntT <= 0){ this._ntT = 3; const seen = new Set(); this.scene.traverse(o => { const mt = o.material; if(mt && !Array.isArray(mt) && mt.isMeshPhysicalMaterial && !seen.has(mt)){ seen.add(mt); applyTransmission(mt); } }); }
    this.t = (this.t || 0) + dt;
    Wind.time += dt; Wind.strength = 2.5;
    this.bg.material.uniforms.uT.value = this.t;
    for(const g of this.islands){ g.position.y = g.userData.y0 + Math.sin(this.t * 0.4 + g.userData.ph) * 1.2; g.rotation.y += dt * 0.02; }
    if(this.bus){ this.bus.position.x += dt * 9; this.bus.position.y = 48 + Math.sin(this.t * 0.5) * 2; if(this.bus.position.x > 280) this.bus.position.x = -280; }
    for(let i = 0; i < this.beams.length; i++) this.beams[i].rotation.z = this.beams[i].userData.rz + Math.sin(this.t * 0.3 + i * 2) * 0.12;
    if(this.player){
      const a = this.player;
      if(Math.abs(this.dragVel) > 0.0001){ this.dragVel *= Math.exp(-dt * 4); if(!this._down) this.dragYaw += this.dragVel * dt * 30; }
      a.root.rotation.y = this.dragYaw;
      const gl = this.previewGlide;
      if(gl && this.glider){ a.root.position.y = 2.2 + Math.sin(this.t * 1.5) * 0.35; this.glider.rotation.z = Math.sin(this.t * 1.2) * 0.08; this.glider.rotation.x = 0.4; const ud = this.glider.userData; if(ud.flap) ud.flap.forEach((w, i) => w.rotation.z = (i ? -1 : 1) * (Math.sin(this.t * 5) * 0.35 + 0.1)); }
      else a.root.position.y = THREE.MathUtils.damp(a.root.position.y, 0, 8, dt);
      a.anim.update(dt, { vel: new THREE.Vector3(0, gl ? -3 : 0, 0), grounded: !gl, mode: gl ? 'glide' : 'ground', weapon: gl ? 'none' : 'pickaxe', lookTarget: gl ? null : this.camera.position, dive: 0, bank: Math.sin(this.t * 1.2) * 0.3 });
    }
    // conversa entre os amigos (pergunta → resposta)
    this.chatT = (this.chatT ?? 9) - dt;
    if(this.chatT <= 0 && this.members.length >= 2){
      this.chatT = 14 + Math.random() * 10;
      const pairs = [['Vamos cair onde?', 'Na cidade, claro!'], ['Viu a loja hoje?', 'Vi! Quero aquela picareta.'], ['Quantos abates ontem?', 'Sete. E você?'], ['Pronto pro ônibus?', 'Nasci pronto!'], ['A tempestade tá rápida.', 'Então sem enrolar!']];
      const [q, r] = pairs[Math.floor(Math.random() * pairs.length)];
      const i = Math.floor(Math.random() * this.members.length), A = this.members[i], B = this.members[(i + 1) % this.members.length];
      const d = A.npc.say(q); A.npc.lookAtActor = B.a; B.npc.lookAtActor = A.a;
      setTimeout(() => { if(B.a.ch.root.parent){ B.npc.say(r); B.a.anim.play(Math.random() < 0.5 ? 'laugh' : 'point'); } }, d * 1000 + 300);
      setTimeout(() => { A.npc.lookAtActor = B.npc.lookAtActor = null; }, d * 1000 + 3500);
    }
    for(const m of this.members){ m.npc.update(dt, this.camera); m.a.anim.update(dt, { vel: new THREE.Vector3(), grounded: true, mode: 'ground', weapon: m.a.anim.weapon ? 'rifle' : 'pickaxe', lookTarget: m.a.lookTarget || this.camera.position }); }
    this.spots.forEach((s, i) => s.material.opacity = 0.25 + Math.sin(this.t * 2 + i) * 0.1);
    if(!this.director.update(dt)){
      const c = this.camera;
      const gl = this.previewGlide ? 1 : 0;
      this._gl = THREE.MathUtils.damp(this._gl || 0, gl, 3, dt);
      c.position.lerp(_tmp.set(this.camBase.x + this.mouse.x * 1.2, this.camBase.y - this.mouse.y * 0.5 + this._gl * 3.5, this.camBase.z + this._gl * 9), 1 - Math.exp(-dt * 3));
      c.lookAt(_tmp.copy(this.camLook).setY(this.camLook.y + this._gl * 4));
    }
    this.particles.update(dt);
    this._updateBubbles();
    // v24: atualizar pet
    if(this.petBrain) this.petBrain.update(dt);
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
