// ============================================================
// PETS — v24: companheiros cosméticos que seguem o jogador.
//   Sistema leve: modelo low-poly, segue o jogador com interpolação,
//   animação simples (idle, seguir, saltar), LOD para PCs fracos.
//   Disponível no lobby e em partida. Não afeta o combate.
// ============================================================
import * as THREE from 'three';
import { Mat } from '../engine/materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const PETS = {
  drone:    { name: 'Drone de Batalha', rarity: 'raro',    color: 0x6366f1, size: 0.5, hover: 3.5, speed: 12 },
  lobinho:  { name: 'Lobinho',          rarity: 'epico',   color: 0x64748b, size: 0.7, hover: 0, speed: 10 },
  dragaozinho:{ name: 'Dragão Bebé',    rarity: 'lendario', color: 0xef4444, size: 0.6, hover: 2.5, speed: 11 },
  fantasma: { name: 'Fantasma',         rarity: 'epico',   color: 0xc4b5fd, size: 0.6, hover: 2.0, speed: 9 },
  gato:     { name: 'Gato Cósmico',     rarity: 'raro',    color: 0xa855f7, size: 0.5, hover: 0, speed: 8 },
  passaro:  { name: 'Pássaro Elétrico', rarity: 'epico',   color: 0xfbbf24, size: 0.4, hover: 4.0, speed: 14 },
  raposa:   { name: 'Raposa Sombria',   rarity: 'lendario', color: 0xf97316, size: 0.55, hover: 0, speed: 10 },
  slime:    { name: 'Slime',            rarity: 'comum',   color: 0x4ade80, size: 0.5, hover: 0, speed: 7 },
  corvo:    { name: 'Corvo Místico',    rarity: 'lendario', color: 0x1e1b4b, size: 0.5, hover: 3.0, speed: 12 },
  cubo:     { name: 'Cubo Glitch',      rarity: 'mitico',  color: 0xa855f7, size: 0.6, hover: 2.5, speed: 13 }
};

export function createPet(type){
  const def = PETS[type]; if(!def) return null;
  const g = new THREE.Group(); g.name = 'pet_' + type;
  g.userData.def = def; g.userData.type = type;
  const c = def.color;
  const mainMat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.3, emissive: c, emissiveIntensity: 0.15 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const glowMat = Mat.emissive(c, 0.8);

  if(type === 'drone'){
    // drone: corpo + 4 hélices
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.15, 4, 8), mainMat); g.add(body);
    const armM = Mat.metal(0x475569, 0.4);
    for(let i = 0; i < 4; i++){
      const a = i / 4 * Math.PI * 2;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 6), armM);
      arm.position.set(Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25); arm.rotation.z = Math.PI / 2; arm.rotation.y = -a;
      g.add(arm);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.015, 4, 12), glowMat);
      ring.position.set(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4); g.add(ring);
      g.userData.rotors = g.userData.rotors || []; g.userData.rotors.push(ring);
    }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), eyeMat); eye.position.set(0, -0.05, 0.18); g.add(eye);
  } else if(type === 'lobinho' || type === 'raposa'){
    // quadrúpede simples: corpo + cabeça + 4 patas + cauda
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.3, 4, 8), mainMat); body.rotation.z = Math.PI / 2; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), mainMat); head.position.set(0.45, 0.15, 0); g.add(head);
    // orelhas
    for(const sd of [-1, 1]){ const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 4), mainMat); ear.position.set(0.45 + sd * 0.05, 0.28, 0); ear.rotation.z = sd * 0.3; g.add(ear); }
    // olhos
    for(const sd of [-1, 1]){ const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), eyeMat); eye.position.set(0.55, 0.18, sd * 0.07); g.add(eye); }
    // patas
    for(const [x, z] of [[0.2, 0.12], [0.2, -0.12], [-0.2, 0.12], [-0.2, -0.12]]){ const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 6), mainMat); leg.position.set(x, -0.2, z); g.add(leg); }
    // cauda
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.25, 5), mainMat); tail.position.set(-0.4, 0.1, 0); tail.rotation.z = -Math.PI / 3; g.add(tail);
    g.userData.bob = true;
  } else if(type === 'dragaozinho'){
    // dragão bebé: corpo + asas + cauda
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.25, 4, 8), mainMat); body.rotation.z = Math.PI / 2; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), mainMat); head.position.set(0.4, 0.15, 0); g.add(head);
    // asas
    const wingM = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.3, transparent: true, opacity: 0.8, side: THREE.DoubleSide, emissive: c, emissiveIntensity: 0.2 });
    for(const sd of [-1, 1]){
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.35, 4), wingM);
      wing.position.set(0, 0.2, sd * 0.2); wing.rotation.x = sd * Math.PI / 2; wing.rotation.z = 0.5;
      g.add(wing); g.userData.wings = g.userData.wings || []; g.userData.wings.push(wing);
    }
    // cauda
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.35, 5), mainMat); tail.position.set(-0.35, 0, 0); tail.rotation.z = -Math.PI / 2.5; g.add(tail);
    // olhos
    for(const sd of [-1, 1]){ const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), eyeMat); eye.position.set(0.48, 0.2, sd * 0.06); g.add(eye); }
    g.userData.flap = true;
  } else if(type === 'fantasma'){
    // fantasma: corpo flutuante com cauda ondulante
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.7), mainMat); g.add(body);
    const tailGeo = new THREE.CylinderGeometry(0.22, 0.05, 0.4, 12, 1, true);
    const tail = new THREE.Mesh(tailGeo, mainMat); tail.position.y = -0.25; g.add(tail);
    // olhos
    for(const sd of [-1, 1]){ const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshBasicMaterial({ color: 0x1e1b4b })); eye.position.set(sd * 0.08, 0.05, 0.18); g.add(eye); }
    g.userData.material = mainMat; mainMat.transparent = true; mainMat.opacity = 0.8;
    g.userData.bob = true;
  } else if(type === 'gato'){
    // gato cósmico: corpo + cabeça + orelhas + cauda
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.25, 4, 8), mainMat); body.rotation.z = Math.PI / 2; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), mainMat); head.position.set(0.38, 0.12, 0); g.add(head);
    for(const sd of [-1, 1]){ const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 4), mainMat); ear.position.set(0.38 + sd * 0.04, 0.24, 0); g.add(ear); }
    for(const sd of [-1, 1]){ const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), eyeMat); eye.position.set(0.46, 0.14, sd * 0.06); g.add(eye); }
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 4, 8, Math.PI / 2), mainMat); tail.position.set(-0.3, 0.05, 0); tail.rotation.z = Math.PI; g.add(tail);
    g.userData.bob = true;
  } else if(type === 'passaro'){
    // pássaro elétrico: corpo + asas que batem
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), mainMat); g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mainMat); head.position.set(0.18, 0.08, 0); g.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 4), glowMat); beak.position.set(0.26, 0.06, 0); beak.rotation.z = -Math.PI / 2; g.add(beak);
    const wingM = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.3, side: THREE.DoubleSide, emissive: c, emissiveIntensity: 0.3 });
    for(const sd of [-1, 1]){
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.3, 4), wingM);
      wing.position.set(0, 0.05, sd * 0.12); wing.rotation.x = sd * Math.PI / 2; wing.rotation.z = 0.3;
      g.add(wing); g.userData.wings = g.userData.wings || []; g.userData.wings.push(wing);
    }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), eyeMat); eye.position.set(0.22, 0.1, 0.04); g.add(eye);
    g.userData.flap = true;
  } else if(type === 'slime'){
    // slime: corpo gelatinoso que deforma
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.1, transparent: true, opacity: 0.7, emissive: c, emissiveIntensity: 0.1 })); g.add(body);
    for(const sd of [-1, 1]){ const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), eyeMat); eye.position.set(sd * 0.07, 0.05, 0.16); g.add(eye); }
    g.userData.body = body; g.userData.bob = true;
  } else if(type === 'corvo'){
    // corvo místico: corpo escuro + asas que batem
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, emissive: 0x6366f1, emissiveIntensity: 0.1 })); g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mainMat); head.position.set(0.16, 0.1, 0); g.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 4), Mat.metal(0x6366f1, 0.3)); beak.position.set(0.24, 0.08, 0); beak.rotation.z = -Math.PI / 2; g.add(beak);
    const wingM = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, side: THREE.DoubleSide, emissive: 0x6366f1, emissiveIntensity: 0.15 });
    for(const sd of [-1, 1]){
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.35, 4), wingM);
      wing.position.set(-0.02, 0.05, sd * 0.1); wing.rotation.x = sd * Math.PI / 2; wing.rotation.z = 0.4;
      g.add(wing); g.userData.wings = g.userData.wings || []; g.userData.wings.push(wing);
    }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), glowMat); eye.position.set(0.2, 0.12, 0.04); g.add(eye);
    g.userData.flap = true;
  } else if(type === 'cubo'){
    // cubo glitch: cubo rotativo com efeito glitch
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.1, metalness: 0.8, emissive: c, emissiveIntensity: 0.3, clearcoat: 1 }));
    g.add(body);
    // anel de energia
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.02, 4, 16), glowMat); ring.rotation.x = Math.PI / 2; g.add(ring);
    g.userData.body = body; g.userData.ring = ring;
  }

  g.scale.setScalar(def.size);
  g.castShadow = true;
  g.traverse(o => { if(o.isMesh) o.castShadow = true; });
  return g;
}

/** PetBrain — IA simples do pet: segue o dono com interpolação suave */
export class PetBrain {
  constructor(pet, owner, scene){
    this.pet = pet; this.owner = owner; this.scene = scene;
    this.t = 0; this.offset = new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2);
    this.lastPos = new THREE.Vector3();
    this.targetPos = new THREE.Vector3();
  }
  update(dt){
    const def = this.pet.userData.def; if(!def || !this.owner) return;
    this.t += dt;
    const ownerPos = this.owner.root ? this.owner.root.position : this.owner.position;
    const hover = def.hover || 0;

    // posição alvo: ao lado do dono + hover
    const angle = this.t * 0.5;
    this.targetPos.set(
      ownerPos.x + Math.cos(angle) * 1.5 + this.offset.x,
      ownerPos.y + hover + Math.sin(this.t * 2) * 0.2,
      ownerPos.z + Math.sin(angle) * 1.5 + this.offset.z
    );

    // interpolação suave
    this.pet.position.lerp(this.targetPos, Math.min(1, dt * (def.speed || 10) * 0.3));

    // olhar para a direção do movimento
    const moveDir = this.pet.position.clone().sub(this.lastPos);
    if(moveDir.length() > 0.01){
      const targetYaw = Math.atan2(moveDir.x, moveDir.z);
      let yaw = this.pet.rotation.y;
      const diff = ((targetYaw - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.pet.rotation.y += diff * Math.min(1, dt * 5);
    }
    this.lastPos.copy(this.pet.position);

    // animações especiais
    if(this.pet.userData.wings){
      const flap = Math.sin(this.t * 8) * 0.4 + 0.3;
      this.pet.userData.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * flap + 0.3; });
    }
    if(this.pet.userData.rotors){
      this.pet.userData.rotors.forEach(r => { r.rotation.z += dt * 20; });
    }
    if(this.pet.userData.body && this.pet.userData.bob){
      const s = 1 + Math.sin(this.t * 4) * 0.05;
      this.pet.userData.body.scale.set(s, 2 - s, s);
    }
    if(this.pet.userData.ring){
      this.pet.userData.ring.rotation.y += dt * 2;
    }
  }
  dispose(){
    if(this.pet.parent) this.pet.parent.remove(this.pet);
    this.pet.traverse(o => { if(o.isMesh && o.geometry) o.geometry.dispose(); });
  }
}
