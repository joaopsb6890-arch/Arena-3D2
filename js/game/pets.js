// ============================================================
// PETS v25 — companheiros cosméticos que seguem o jogador.
//   Modelos detalhados, grandes, com efeitos visuais (brilho,
//   partículas, trail). Segue o jogador com interpolação suave.
// ============================================================
import * as THREE from 'three';
import { Mat } from '../engine/materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const PETS = {
  drone:      { name: 'Drone de Batalha',   rarity: 'raro',    color: 0x6366f1, size: 1.8, hover: 4.0, speed: 12 },
  lobinho:    { name: 'Lobinho',            rarity: 'epico',   color: 0x64748b, size: 2.0, hover: 0, speed: 10 },
  dragaozinho:{ name: 'Dragão Bebé',       rarity: 'lendario', color: 0xef4444, size: 2.2, hover: 3.0, speed: 11 },
  fantasma:   { name: 'Fantasma',           rarity: 'epico',   color: 0xc4b5fd, size: 2.0, hover: 2.5, speed: 9 },
  gato:       { name: 'Gato Cósmico',       rarity: 'raro',    color: 0xa855f7, size: 1.8, hover: 0, speed: 8 },
  passaro:    { name: 'Pássaro Elétrico',    rarity: 'epico',   color: 0xfbbf24, size: 1.6, hover: 5.0, speed: 14 },
  raposa:     { name: 'Raposa Sombria',      rarity: 'lendario', color: 0xf97316, size: 1.9, hover: 0, speed: 10 },
  slime:      { name: 'Slime',              rarity: 'comum',   color: 0x4ade80, size: 1.7, hover: 0, speed: 7 },
  corvo:      { name: 'Corvo Místico',      rarity: 'lendario', color: 0x1e1b4b, size: 2.0, hover: 4.0, speed: 12 },
  cubo:       { name: 'Cubo Glitch',        rarity: 'mitico',  color: 0xa855f7, size: 2.0, hover: 3.0, speed: 13 }
};

export function createPet(type){
  const def = PETS[type]; if(!def) return null;
  const g = new THREE.Group(); g.name = 'pet_' + type;
  g.userData.def = def; g.userData.type = type;
  const c = def.color;
  const mainMat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.4, emissive: c, emissiveIntensity: 0.2 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const glowMat = Mat.emissive(c, 1.0);
  const accentMat = Mat.emissive(c, 1.5);

  if(type === 'drone'){
    // Drone de Batalha — corpo detalhado com 4 hélices, luzes e antena
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.25, 4, 12), mainMat); body.castShadow = true; g.add(body);
    // anel de metal à volta do corpo
    const ringBody = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.04, 6, 20), Mat.metal(0x475569, 0.3)); ringBody.rotation.x = Math.PI / 2; g.add(ringBody);
    // detalhe frontal (câmera/sensor)
    const cam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10), Mat.metal(0x1e1b4b, 0.5)); cam.position.set(0, 0, 0.3); cam.rotation.x = Math.PI / 2; g.add(cam);
    const camLens = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), accentMat); camLens.position.set(0, 0, 0.34); g.add(camLens);
    // antena
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 6), Mat.metal(0x475569, 0.3)); ant.position.set(0, 0.35, 0); g.add(ant);
    const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), accentMat); antTip.position.set(0, 0.52, 0); g.add(antTip);
    // 4 braços com hélices
    const armM = Mat.metal(0x475569, 0.4);
    for(let i = 0; i < 4; i++){
      const a = i / 4 * Math.PI * 2;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), armM);
      arm.position.set(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4); arm.rotation.z = Math.PI / 2; arm.rotation.y = -a;
      g.add(arm);
      // hélice (2 lâminas)
      const rotorGroup = new THREE.Group(); rotorGroup.position.set(Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7);
      for(const r of [0, Math.PI / 2]){
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.01, 0.04), Mat.metal(0x9ca3af, 0.2));
        blade.rotation.y = r; rotorGroup.add(blade);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.08, 8), accentMat); hub.rotation.x = Math.PI / 2; rotorGroup.add(hub);
      g.add(rotorGroup);
      g.userData.rotors = g.userData.rotors || []; g.userData.rotors.push(rotorGroup);
    }
    // olho principal
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), accentMat); eye.position.set(0, -0.1, 0.28); g.add(eye);
    // luzes LED
    for(let i = 0; i < 4; i++){ const a = i / 4 * Math.PI * 2; const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), accentMat); led.position.set(Math.cos(a) * 0.25, -0.15, Math.sin(a) * 0.25); g.add(led); }
  } else if(type === 'lobinho' || type === 'raposa'){
    // Quadrúpede detalhado — corpo, cabeça, orelhas, patas, cauda peluda
    const isFox = type === 'raposa';
    const bodyMat = isFox ? new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, emissive: c, emissiveIntensity: 0.15 }) : mainMat;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.5, 6, 12), bodyMat); body.rotation.z = Math.PI / 2; body.castShadow = true; g.add(body);
    // peito
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), bodyMat); chest.position.set(0.35, 0, 0); g.add(chest);
    // cabeça maior
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), bodyMat); head.position.set(0.75, 0.25, 0); g.add(head);
    // focinho
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 8), bodyMat); snout.position.set(0.98, 0.2, 0); snout.rotation.z = -Math.PI / 2; g.add(snout);
    // nariz
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), Mat.emissive(0x1e1b4b, 0.5)); nose.position.set(1.1, 0.22, 0); g.add(nose);
    // orelhas grandes
    for(const sd of [-1, 1]){
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 6), bodyMat);
      ear.position.set(0.72 + sd * 0.1, 0.5, 0); ear.rotation.z = sd * 0.3;
      g.add(ear);
      const earInner = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 6), accentMat);
      earInner.position.set(0.72 + sd * 0.1, 0.48, 0); earInner.rotation.z = sd * 0.3;
      g.add(earInner);
    }
    // olhos brilhantes
    for(const sd of [-1, 1]){ const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), accentMat); eye.position.set(0.85, 0.3, sd * 0.12); g.add(eye); }
    // 4 patas
    for(const [x, z] of [[0.3, 0.2], [0.3, -0.2], [-0.3, 0.2], [-0.3, -0.2]]){
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.35, 8), bodyMat); leg.position.set(x, -0.3, z); g.add(leg);
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), bodyMat); paw.position.set(x, -0.5, z); g.add(paw);
    }
    // cauda longa e peluda
    const tailGroup = new THREE.Group();
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 6), bodyMat); tail.rotation.z = -Math.PI / 3; tailGroup.add(tail);
    const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), isFox ? Mat.emissive(0xffffff, 1.0) : accentMat); tailTip.position.set(-0.2, 0.15, 0); tailGroup.add(tailTip);
    tailGroup.position.set(-0.55, 0.15, 0);
    g.add(tailGroup); g.userData.tail = tailGroup;
    g.userData.bob = true;
  } else if(type === 'dragaozinho'){
    // Dragão Bebé — corpo, asas grandes, cauda, espinhos, brilho
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.4, 6, 12), mainMat); body.rotation.z = Math.PI / 2; body.castShadow = true; g.add(body);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), Mat.emissive(0xfbbf24, 0.8)); chest.position.set(0.3, 0, 0); g.add(chest);
    // cabeça
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), mainMat); head.position.set(0.65, 0.25, 0); g.add(head);
    // focinho
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 8), mainMat); snout.position.set(0.88, 0.22, 0); snout.rotation.z = -Math.PI / 2; g.add(snout);
    // cornos
    for(const sd of [-1, 1]){
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 6), Mat.metal(0xfbbf24, 0.3)); horn.position.set(0.6 + sd * 0.08, 0.48, 0); horn.rotation.z = sd * 0.5; g.add(horn);
    }
    // olhos brilhantes
    for(const sd of [-1, 1]){ const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), Mat.emissive(0xfbbf24, 2.0)); eye.position.set(0.78, 0.32, sd * 0.1); g.add(eye); }
    // asas grandes e detalhadas
    const wingM = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.25, transparent: true, opacity: 0.85, side: THREE.DoubleSide, emissive: c, emissiveIntensity: 0.3 });
    for(const sd of [-1, 1]){
      const wingGroup = new THREE.Group();
      // membrana da asa
      const membrane = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 4), wingM);
      membrane.rotation.z = 0.4;
      wingGroup.add(membrane);
      // dedos da asa
      for(let i = 0; i < 3; i++){
        const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 4), Mat.metal(0x1e1b4b, 0.3));
        finger.position.set(i * 0.08 - 0.08, 0.1, 0);
        finger.rotation.z = 0.5 - i * 0.2;
        wingGroup.add(finger);
      }
      wingGroup.position.set(0, 0.3, sd * 0.35);
      wingGroup.rotation.x = sd * 0.3;
      g.add(wingGroup); g.userData.wings = g.userData.wings || []; g.userData.wings.push(wingGroup);
    }
    // espinhos nas costas
    for(let i = 0; i < 4; i++){ const spine = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 5), Mat.metal(0xfbbf24, 0.2)); spine.position.set(0.1 - i * 0.15, 0.25, 0); spine.rotation.z = -0.2; g.add(spine); }
    // cauda longa
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.55, 6), mainMat); tail.position.set(-0.55, 0.05, 0); tail.rotation.z = -Math.PI / 2.5; g.add(tail);
    const tailTip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.15, 8), Mat.emissive(0xfbbf24, 1.5)); tailTip.position.set(-0.85, -0.1, 0); tailTip.rotation.z = -Math.PI / 2; g.add(tailTip);
    g.userData.flap = true;
  } else if(type === 'fantasma'){
    // Fantasma — corpo flutuante grande, cauda ondulante, olhos brilhantes
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 14, 0, Math.PI * 2, 0, Math.PI * 0.7), mainMat); body.castShadow = true; g.add(body);
    // cauda ondulante (várias camadas)
    for(let i = 0; i < 3; i++){
      const tailPart = new THREE.Mesh(new THREE.CylinderGeometry(0.4 - i * 0.1, 0.1 - i * 0.02, 0.2, 12, 1, true), mainMat);
      tailPart.position.y = -0.3 - i * 0.18; tailPart.rotation.y = i * 0.3;
      g.add(tailPart);
    }
    // olhos grandes e brilhantes
    for(const sd of [-1, 1]){ const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), Mat.emissive(0x1e1b4b, 1.0)); eye.position.set(sd * 0.15, 0.1, 0.32); g.add(eye); }
    // boca
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), Mat.emissive(0x1e1b4b, 0.8)); mouth.position.set(0, -0.05, 0.35); mouth.rotation.x = Math.PI; g.add(mouth);
    // aura
    const aura = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.2, depthWrite: false })); g.add(aura);
    g.userData.aura = aura;
    g.userData.material = mainMat; mainMat.transparent = true; mainMat.opacity = 0.85;
    g.userData.bob = true;
  } else if(type === 'gato'){
    // Gato Cósmico — corpo, cabeça, orelhas grandes, cauda longa, estrelas
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.4, 6, 12), mainMat); body.rotation.z = Math.PI / 2; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), mainMat); head.position.set(0.62, 0.2, 0); g.add(head);
    // orelhas grandes
    for(const sd of [-1, 1]){
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 6), mainMat); ear.position.set(0.6 + sd * 0.08, 0.42, 0); g.add(ear);
      const earIn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 6), accentMat); earIn.position.set(0.6 + sd * 0.08, 0.4, 0); g.add(earIn);
    }
    // olhos cósmicos
    for(const sd of [-1, 1]){ const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), Mat.emissive(0x22d3ee, 2.0)); eye.position.set(0.75, 0.22, sd * 0.1); g.add(eye); }
    // nariz
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), accentMat); nose.position.set(0.85, 0.1, 0); g.add(nose);
    // patas
    for(const [x, z] of [[0.25, 0.18], [0.25, -0.18], [-0.25, 0.18], [-0.25, -0.18]]){ const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), mainMat); leg.position.set(x, -0.25, z); g.add(leg); }
    // cauda longa e encurvada
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 12, Math.PI * 1.2), mainMat); tail.position.set(-0.4, 0.1, 0); tail.rotation.z = Math.PI; g.add(tail);
    const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), accentMat); tailTip.position.set(-0.62, 0.32, 0); g.add(tailTip);
    // estrelas orbitais
    const starRing = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.01, 4, 20), Mat.emissive(0x22d3ee, 1.5)); starRing.rotation.x = Math.PI / 2.5; g.add(starRing);
    g.userData.starRing = starRing;
    g.userData.bob = true;
  } else if(type === 'passaro'){
    // Pássaro Elétrico — corpo, asas grandes, penas, cauda, brilho
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), mainMat); body.castShadow = true; g.add(body);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), Mat.emissive(c, 1.0)); chest.position.set(0.1, 0, 0.15); g.add(chest);
    // cabeça
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), mainMat); head.position.set(0.3, 0.15, 0); g.add(head);
    // bico
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.15, 6), accentMat); beak.position.set(0.42, 0.12, 0); beak.rotation.z = -Math.PI / 2; g.add(beak);
    // olhos
    for(const sd of [-1, 1]){ const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), Mat.emissive(0xffffff, 1.5)); eye.position.set(0.36, 0.18, sd * 0.07); g.add(eye); }
    // crista
    for(let i = 0; i < 3; i++){ const crest = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 5), accentMat); crest.position.set(0.25 - i * 0.04, 0.3 + i * 0.02, 0); crest.rotation.z = -0.3 + i * 0.15; g.add(crest); }
    // asas grandes e detalhadas
    const wingM = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.25, side: THREE.DoubleSide, emissive: c, emissiveIntensity: 0.4 });
    for(const sd of [-1, 1]){
      const wingGroup = new THREE.Group();
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 5), wingM);
      wing.rotation.z = 0.3;
      wingGroup.add(wing);
      // penas
      for(let i = 0; i < 3; i++){ const feather = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 4), wingM); feather.position.set(0, -0.05 - i * 0.1, 0); feather.rotation.z = 0.4 + i * 0.15; wingGroup.add(feather); }
      wingGroup.position.set(0, 0.1, sd * 0.22); wingGroup.rotation.x = sd * 0.2;
      g.add(wingGroup); g.userData.wings = g.userData.wings || []; g.userData.wings.push(wingGroup);
    }
    // cauda em leque
    for(let i = 0; i < 3; i++){ const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 4), wingM); tail.position.set(-0.2, 0, 0); tail.rotation.z = -Math.PI / 2 + (i - 1) * 0.2; g.add(tail); }
    g.userData.flap = true;
  } else if(type === 'slime'){
    // Slime — corpo gelatinoso grande, transparente, com olhos e brilho interno
    const bodyMat = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.1, transparent: true, opacity: 0.7, emissive: c, emissiveIntensity: 0.15, clearcoat: 1, clearcoatRoughness: 0.1 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 14), bodyMat); body.castShadow = true; g.add(body);
    // brilho interno
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), Mat.emissive(c, 2.0)); core.position.y = 0.05; g.add(core);
    // olhos grandes
    for(const sd of [-1, 1]){ const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), eyeMat); eye.position.set(sd * 0.13, 0.1, 0.32); g.add(eye); }
    for(const sd of [-1, 1]){ const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), Mat.emissive(0x1e1b4b, 0.5)); pupil.position.set(sd * 0.13, 0.1, 0.36); g.add(pupil); }
    // bolhas
    for(let i = 0; i < 4; i++){ const bub = new THREE.Mesh(new THREE.SphereGeometry(0.04 + Math.random() * 0.03, 6, 5), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, roughness: 0.05 })); bub.position.set((Math.random() - 0.5) * 0.5, 0.15 + Math.random() * 0.2, (Math.random() - 0.5) * 0.5); g.add(bub); }
    g.userData.body = body; g.userData.core = core; g.userData.bob = true;
  } else if(type === 'corvo'){
    // Corvo Místico — corpo escuro, asas grandes, penas, brilho roxo
    const bodyM = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, emissive: 0x6366f1, emissiveIntensity: 0.2 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), bodyM); body.castShadow = true; g.add(body);
    // peito
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), Mat.emissive(0x6366f1, 0.8)); chest.position.set(0.08, 0, 0.15); g.add(chest);
    // cabeça
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), bodyM); head.position.set(0.28, 0.18, 0); g.add(head);
    // bico curvo
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 6), Mat.metal(0x6366f1, 0.3)); beak.position.set(0.4, 0.15, 0); beak.rotation.z = -Math.PI / 2; g.add(beak);
    // olhos brilhantes
    for(const sd of [-1, 1]){ const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), Mat.emissive(0xa855f7, 3.0)); eye.position.set(0.34, 0.22, sd * 0.07); g.add(eye); }
    // asas grandes e escuras
    const wingM = new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, side: THREE.DoubleSide, emissive: 0x6366f1, emissiveIntensity: 0.25 });
    for(const sd of [-1, 1]){
      const wingGroup = new THREE.Group();
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 5), wingM);
      wing.rotation.z = 0.4;
      wingGroup.add(wing);
      // penas detalhadas
      for(let i = 0; i < 4; i++){ const feather = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 4), wingM); feather.position.set(0, -0.08 - i * 0.08, 0); feather.rotation.z = 0.5 + i * 0.12; wingGroup.add(feather); }
      wingGroup.position.set(-0.02, 0.1, sd * 0.18); wingGroup.rotation.x = sd * 0.25;
      g.add(wingGroup); g.userData.wings = g.userData.wings || []; g.userData.wings.push(wingGroup);
    }
    // cauda em leque
    for(let i = 0; i < 3; i++){ const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 4), wingM); tail.position.set(-0.22, 0, 0); tail.rotation.z = -Math.PI / 2 + (i - 1) * 0.25; g.add(tail); }
    // aura mística
    const aura = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), new THREE.MeshBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.15, depthWrite: false })); g.add(aura);
    g.userData.aura = aura;
    g.userData.flap = true;
  } else if(type === 'cubo'){
    // Cubo Glitch — cubo grande, rotação, efeito glitch, anéis de energia
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.1, metalness: 0.8, emissive: c, emissiveIntensity: 0.4, clearcoat: 1 }));
    body.castShadow = true; g.add(body);
    // anéis de energia
    for(let i = 0; i < 3; i++){
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45 + i * 0.1, 0.025, 4, 20), accentMat);
      ring.rotation.x = i * 0.5; ring.rotation.y = i * 0.3;
      g.add(ring);
      g.userData.rings = g.userData.rings || []; g.userData.rings.push(ring);
    }
    // núcleo
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), Mat.emissive(c, 3.0)); g.add(core);
    // fragmentos orbitais
    for(let i = 0; i < 4; i++){
      const frag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), Mat.emissive(c, 2.0));
      const a = i / 4 * Math.PI * 2;
      frag.position.set(Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0);
      g.add(frag);
      g.userData.frags = g.userData.frags || []; g.userData.frags.push(frag);
    }
    g.userData.body = body; g.userData.core = core;
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
    this.t = 0; 
    // posição fixa ao lado do dono (não orbita)
    this.sideAngle = Math.PI / 2; // sempre à direita do jogador
    this.followDist = 2.5;
    this.lastPos = new THREE.Vector3();
    this.targetPos = new THREE.Vector3();
    this.curYaw = 0;
  }
  update(dt){
    const def = this.pet.userData.def; if(!def || !this.owner) return;
    this.t += dt;
    const ownerPos = this.owner.root ? this.owner.root.position : this.owner.position;
    const hover = def.hover || 0;

    // posição fixa ao lado do dono (usa o yaw do dono para posicionar atrás-direita)
    const ownerYaw = this.owner.yaw !== undefined ? this.owner.yaw : (this.owner.rotation ? this.owner.rotation.y : 0);
    const sideOffset = this.sideAngle + ownerYaw;
    const dist = this.followDist;
    this.targetPos.set(
      ownerPos.x + Math.sin(sideOffset) * dist,
      ownerPos.y + hover + Math.sin(this.t * 2) * 0.2,
      ownerPos.z + Math.cos(sideOffset) * dist
    );

    // interpolação suave
    this.pet.position.lerp(this.targetPos, Math.min(1, dt * (def.speed || 10) * 0.4));

    // olhar para a mesma direção do dono
    const targetYaw = ownerYaw + Math.PI; // olhar para a frente como o dono
    let yaw = this.pet.rotation.y;
    const diff = ((targetYaw - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.pet.rotation.y += diff * Math.min(1, dt * 6);
    this.lastPos.copy(this.pet.position);

    // animações
    if(this.pet.userData.wings){
      const flap = Math.sin(this.t * 6) * 0.5 + 0.3;
      this.pet.userData.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * flap + 0.4; });
    }
    if(this.pet.userData.rotors){
      this.pet.userData.rotors.forEach(r => { r.rotation.y += dt * 25; });
    }
    if(this.pet.userData.body && this.pet.userData.bob){
      const s = 1 + Math.sin(this.t * 3) * 0.08;
      this.pet.userData.body.scale.set(s, 2 - s, s);
      if(this.pet.userData.core) this.pet.userData.core.scale.setScalar(1 + Math.sin(this.t * 4) * 0.2);
    }
    if(this.pet.userData.rings){
      this.pet.userData.rings.forEach((r, i) => { r.rotation.x += dt * (1 + i * 0.5); r.rotation.y += dt * (1.5 + i * 0.3); });
    }
    if(this.pet.userData.frags){
      this.pet.userData.frags.forEach((f, i) => {
        const a = this.t * 1.5 + i / 4 * Math.PI * 2;
        f.position.x = Math.cos(a) * 0.7; f.position.y = Math.sin(a) * 0.7; f.position.z = Math.sin(a * 0.7) * 0.3;
        f.rotation.x += dt * 3; f.rotation.y += dt * 2;
      });
    }
    if(this.pet.userData.starRing){
      this.pet.userData.starRing.rotation.y += dt * 1.5;
      this.pet.userData.starRing.rotation.z = Math.sin(this.t * 0.5) * 0.2;
    }
    if(this.pet.userData.aura){
      const s = 1 + Math.sin(this.t * 2) * 0.15;
      this.pet.userData.aura.scale.setScalar(s);
      this.pet.userData.aura.material.opacity = 0.15 + Math.sin(this.t * 3) * 0.1;
    }
    if(this.pet.userData.tail){
      this.pet.userData.tail.rotation.y = Math.sin(this.t * 4) * 0.3;
    }
  }
  dispose(){
    if(this.pet.parent) this.pet.parent.remove(this.pet);
    this.pet.traverse(o => { if(o.isMesh && o.geometry) o.geometry.dispose(); });
  }
}
