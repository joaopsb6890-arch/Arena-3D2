// ============================================================
// LEGACY v9/v10 — personagem e animação ANTIGOS (apenas para o
// comparativo "antes/depois" no Estúdio). Não usado no jogo.
// ============================================================
import * as THREE from 'three';
let activeSlot = 1, phase = 'studio', player = null;
const camOrbit = { yaw: 0, pitch: 0 };
function createCharacter(opts, name){
  const o = Object.assign({ torso:0x2563eb, head:0xfde68a, hair:0x1e293b, pant:0x0f172a, accent:0xef4444, hairStyle:'short', eyeColor:0x3b82f6 }, opts);
  const g = new THREE.Group();
  g.userData = { name: name || 'Player', hp: 100, shield: 0, walkPhase: 0, kick: 0, aiming: false, building: false, crouching: false };

  const torsoMat = new THREE.MeshStandardMaterial({ color: o.torso, roughness: 0.45, metalness: 0.08 });
  const pantMat = new THREE.MeshStandardMaterial({ color: o.pant, roughness: 0.85 });
  const skinMat = new THREE.MeshStandardMaterial({ color: o.head, roughness: 0.55 });
  const hairMat = new THREE.MeshStandardMaterial({ color: o.hair, roughness: 0.85 });
  const accMat = new THREE.MeshStandardMaterial({ color: o.accent, roughness: 0.3, metalness: 0.25 });
  const metalChar = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.3, metalness: 0.75 });
  const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.2 });
  const eyeIrisMat = new THREE.MeshStandardMaterial({ color: o.eyeColor, roughness: 0.3 });
  const eyePupilMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.1 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x5c0a0a });
  const teethMat = new THREE.MeshStandardMaterial({ color: 0xfef9c3, roughness: 0.4 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.7 });
  const gloveMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 });

  // Torso (com cinto, fivela e bolsos)
  const chest = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.1, 1.0), torsoMat);
  chest.position.y = 4.85; chest.castShadow = true; g.add(chest);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.22, 1.02), accMat);
  stripe.position.y = 5.15; g.add(stripe);
  const abs = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.9, 0.9), torsoMat);
  abs.position.y = 3.9; abs.castShadow = true; g.add(abs);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.85, 0.35, 12), new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 0.9 }));
  belt.position.y = 3.3; belt.scale.z = 0.62; g.add(belt);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.1), metalChar);
  buckle.position.set(0, 3.3, 0.56); g.add(buckle);
  [-1, 1].forEach(s => {
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.28), new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.9 }));
    pouch.position.set(s * 0.62, 3.28, 0.42); g.add(pouch);
  });

  // Armadura de peito
  const plate = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.85, 0.18), accMat);
  plate.position.set(0, 4.85, 0.55); g.add(plate);
  const plateV = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.38, 4), accMat);
  plateV.position.set(0, 4.42, 0.6); plateV.rotation.y = Math.PI/4; g.add(plateV);

  // Pescoço
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.5, 10), skinMat);
  neck.position.y = 5.55; g.add(neck);

  // Cabeça
  const headGroup = new THREE.Group();
  headGroup.position.y = 6.5;
  g.add(headGroup);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 18), skinMat);
  skull.scale.set(1, 1.15, 1);
  skull.castShadow = true; headGroup.add(skull);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.5, 0.95), skinMat);
  jaw.position.y = -0.35; headGroup.add(jaw);
  const chin = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.7), skinMat);
  chin.position.set(0, -0.6, 0.05); headGroup.add(chin);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.28, 6), skinMat);
  nose.rotation.x = Math.PI/2; nose.position.set(0, -0.05, 0.6); headGroup.add(nose);
  [-1,1].forEach(side => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), skinMat);
    ear.scale.set(0.7, 1, 0.5);
    ear.position.set(side * 0.58, -0.1, 0); headGroup.add(ear);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), new THREE.MeshStandardMaterial({ color: 0xf9a8d4, roughness: 0.8 }));
    inner.scale.set(0.5, 1, 0.3);
    inner.position.set(side * 0.6, -0.1, 0); headGroup.add(inner);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.1), hairMat);
    brow.position.set(side * 0.25, 0.2, 0.52); headGroup.add(brow);
    // Olho em grupo (branco + íris + pupila) -> move junto na animação de mira
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(side * 0.25, 0.02, 0.5);
    headGroup.add(eyeGroup);
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), eyeWhiteMat);
    white.scale.set(1.1, 0.7, 0.6);
    white.position.z = 0;
    eyeGroup.add(white);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.075, 12), eyeIrisMat);
    iris.position.set(0, 0, 0.1);
    eyeGroup.add(iris);
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.04, 10), eyePupilMat);
    pupil.position.set(0, 0, 0.105);
    eyeGroup.add(pupil);
    // Blush
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.07, 8), new THREE.MeshStandardMaterial({ color: 0xfda4af, roughness: 1, transparent: true, opacity: 0.55 }));
    blush.position.set(side * 0.42, -0.22, 0.44); blush.rotation.y = side * 0.5; headGroup.add(blush);
    // Guardar refs pra animação de mira
    if(side === -1){ g.userData._eyeL = eyeGroup; g.userData._eyeBaseL = eyeGroup.position.clone(); }
    else           { g.userData._eyeR = eyeGroup; g.userData._eyeBaseR = eyeGroup.position.clone(); }
  });
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.1), mouthMat);
  mouth.position.set(0, -0.4, 0.5); headGroup.add(mouth);
  const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.05), teethMat);
  teeth.position.set(0, -0.36, 0.52); headGroup.add(teeth);

  // Cabelo (estilos melhorados)
  const hairGroup = new THREE.Group();
  headGroup.add(hairGroup);
  if(o.hairStyle === 'short'){
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.68, 16, 8, 0, Math.PI*2, 0, Math.PI/2.2), hairMat);
    top.position.y = 0.35; hairGroup.add(top);
    const bangs = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.22, 0.15), hairMat);
    bangs.position.set(0, 0.42, 0.5); hairGroup.add(bangs);
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.5), hairMat);
    sideL.position.set(-0.6, 0.1, 0.1); hairGroup.add(sideL);
    const sideR = sideL.clone(); sideR.position.x = 0.6; hairGroup.add(sideR);
  } else if(o.hairStyle === 'long'){
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 8, 0, Math.PI*2, 0, Math.PI/2), hairMat);
    top.position.y = 0.35; hairGroup.add(top);
    const backLong = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.9, 0.35), hairMat);
    backLong.position.set(0, -0.65, -0.5); hairGroup.add(backLong);
    [-1,1].forEach(s => {
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.2, 0.3), hairMat);
      lock.position.set(s * 0.6, -0.2, 0.15); hairGroup.add(lock);
    });
  } else if(o.hairStyle === 'spiky'){
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.64, 12, 8, 0, Math.PI*2, 0, Math.PI/2.8), hairMat);
    top.position.y = 0.33; hairGroup.add(top);
    for(let i = 0; i < 12; i++){
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 5), hairMat);
      const a = (i/12) * Math.PI * 2;
      const r = 0.3 + Math.random() * 0.22;
      spike.position.set(Math.cos(a)*r, 0.82 + Math.random()*0.25, Math.sin(a)*r - 0.08);
      spike.rotation.set((Math.random()-.5)*0.5, 0, (Math.random()-.5)*0.5);
      hairGroup.add(spike);
    }
  } else if(o.hairStyle === 'bun'){
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.66, 12, 8, 0, Math.PI*2, 0, Math.PI/2.2), hairMat);
    top.position.y = 0.35; hairGroup.add(top);
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), hairMat);
    bun.position.set(0, 0.88, -0.25); hairGroup.add(bun);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.06, 6, 14), accMat);
    tie.position.set(0, 0.62, -0.2); tie.rotation.x = 0.5; hairGroup.add(tie);
  }

  // Braços (com ombreiras e munhequeiras)
  const arms = {};
  [-1,1].forEach(side => {
    const armGroup = new THREE.Group();
    armGroup.position.set(side * 1.0, 4.9, 0);
    g.add(armGroup);
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10, 0, Math.PI*2, 0, Math.PI/1.8), accMat);
    pad.position.y = 0.15; pad.castShadow = true; armGroup.add(pad);
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.33, 12, 10), torsoMat);
    shoulder.castShadow = true; armGroup.add(shoulder);
    const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.22, 1.0, 10), torsoMat);
    upperArm.position.y = -0.65; upperArm.castShadow = true; armGroup.add(upperArm);
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skinMat);
    elbow.position.y = -1.25; armGroup.add(elbow);
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.19, 1.0, 10), skinMat);
    forearm.position.y = -1.85; forearm.castShadow = true; armGroup.add(forearm);
    const wristband = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.18, 10), accMat);
    wristband.position.y = -2.28; armGroup.add(wristband);
    const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), skinMat);
    wrist.position.y = -2.4; armGroup.add(wrist);

    const hand = new THREE.Group();
    hand.position.y = -2.65;
    armGroup.add(hand);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.22), gloveMat);
    palm.castShadow = true; hand.add(palm);
    for(let i = 0; i < 4; i++){
      const finger = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.25, 0.1), gloveMat);
      finger.position.set(-0.15 + i * 0.1, -0.32, 0.03);
      hand.add(finger);
    }
    if(side === -1){ arms.left = armGroup; arms.leftHand = hand; }
    else { arms.right = armGroup; arms.rightHand = hand; }
  });

  // Pernas (com caneleiras)
  const legs = {};
  [-1,1].forEach(side => {
    const legGroup = new THREE.Group();
    legGroup.position.set(side * 0.42, 3.1, 0);
    g.add(legGroup);
    const hip = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), pantMat);
    legGroup.add(hip);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.27, 1.2, 10), pantMat);
    thigh.position.y = -0.7; thigh.castShadow = true; legGroup.add(thigh);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), pantMat);
    knee.position.y = -1.35; legGroup.add(knee);
    const kneePad = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.25), accMat);
    kneePad.position.set(0, -1.35, 0.22); legGroup.add(kneePad);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.22, 1.2, 10), pantMat);
    shin.position.y = -2.05; shin.castShadow = true; legGroup.add(shin);
    const shinGuard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.14), accMat);
    shinGuard.position.set(0, -2.05, 0.24); legGroup.add(shinGuard);

    const boot = new THREE.Group();
    boot.position.y = -2.85;
    legGroup.add(boot);
    const bootMain = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.9), bootMat);
    bootMain.position.set(0, 0.15, 0.15); bootMain.castShadow = true; boot.add(bootMain);
    const toe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.35), accMat);
    toe.position.set(0, 0.05, 0.62); boot.add(toe);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 1.0), new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.9 }));
    sole.position.set(0, -0.15, 0.2); boot.add(sole);

    if(side === -1) legs.left = legGroup;
    else legs.right = legGroup;
  });

  // Mochila com bedroll
  const backpack = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.45, 0.55), new THREE.MeshStandardMaterial({ color: o.accent, roughness: 0.6 }));
  backpack.position.set(0, 4.65, -0.72); backpack.castShadow = true; g.add(backpack);
  const bpTop = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.45), new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.85 }));
  bpTop.position.set(0, 5.55, -0.72); g.add(bpTop);
  const bedroll = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 10), new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.8 }));
  bedroll.rotation.z = Math.PI/2;
  bedroll.position.set(0, 5.85, -0.72); g.add(bedroll);

  // Picareta nas costas
  const pickaxeBack = new THREE.Group();
  const pHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.7), new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 }));
  const pHead = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.22, 0.22), metalChar);
  pHead.position.y = 0.8;
  const pTipL = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 4), metalChar);
  pTipL.rotation.z = Math.PI/2; pTipL.position.set(-0.6, 0.8, 0);
  const pTipR = pTipL.clone(); pTipR.rotation.z = -Math.PI/2; pTipR.position.x = 0.6;
  pickaxeBack.add(pHandle, pHead, pTipL, pTipR);
  pickaxeBack.position.set(0.68, 4.5, -0.95);
  pickaxeBack.rotation.set(0.2, 0.3, -0.5);
  g.add(pickaxeBack);

  // Glider
  const glider = new THREE.Group();
  glider.visible = false;
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(2.9, 1.5, 12, 1, true),
    new THREE.MeshStandardMaterial({ color: o.accent, roughness: 0.7, side: THREE.DoubleSide }));
  canopy.position.y = 1.9; glider.add(canopy);
  const canopyTip = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), accMat);
  canopyTip.position.y = 2.6; glider.add(canopyTip);
  for(let i = 0; i < 4; i++){
    const a = i / 4 * Math.PI * 2 + Math.PI/4;
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.4), metalChar);
    strut.position.set(Math.cos(a) * 1.1, 0.2, Math.sin(a) * 1.1);
    strut.rotation.set(Math.sin(a) * 0.6, 0, Math.cos(a) * -0.6);
    glider.add(strut);
  }
  glider.position.y = 3.5; g.add(glider);

  // Arma em punho
  const heldWeapon = new THREE.Group();
  heldWeapon.visible = false;
  arms.rightHand.add(heldWeapon);

  // Flash de disparo melhorado
  const muzzle = new THREE.PointLight(0xffaa00, 0, 12);
  muzzle.position.set(0, -1.2, 0.2);
  arms.rightHand.add(muzzle);
  // Flash 3D (esfera brilhante)
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27d, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false });
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), flashMat);
  flash.position.set(0, -1.35, 0.2);
  flash.visible = false;
  arms.rightHand.add(flash);
  // Flash secundário (cone de luz)
  const flashCone = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
  flashCone.position.set(0, -1.5, 0.2);
  flashCone.rotation.x = -Math.PI/2;
  flashCone.visible = false;
  arms.rightHand.add(flashCone);
  // Fumaça do cano
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0, depthWrite: false });
  const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 4), smokeMat);
  smoke.position.set(0, -1.35, 0.2);
  smoke.visible = false;
  arms.rightHand.add(smoke);

  g.userData.parts = {
    torso: chest, abs, head: skull, headGroup, hairGroup,
    armL: arms.left, armR: arms.right,
    handL: arms.leftHand, handR: arms.rightHand,
    legL: legs.left, legR: legs.right,
    belt, backpack, pickaxeBack, glider, heldWeapon, muzzle, flash, chestPlate: plate,
    flashCone: flashCone,
    smoke: smoke,
    eyeL: g.userData._eyeL, eyeR: g.userData._eyeR,
    eyeBaseL: g.userData._eyeBaseL, eyeBaseR: g.userData._eyeBaseR
  };
  return g;
}

function animateCharacter(g, dt, moving, running, falling){
  const p = g.userData.parts, u = g.userData;
  if(!p || !p.legL) return;
  const ph = u.walkPhase += dt * (running ? 16 : 9) * (moving ? 1 : 0);
  const swing = moving ? (running ? 1.1 : 0.7) : 0;
  if(u.kick > 0) u.kick = Math.max(0, u.kick - dt * 5);
  const kick = u.kick;

  // -------- Diferença angular entre a camera (yaw) e a rotação do corpo --------
  // camOrbit.yaw é a posição da camera ao redor do player; corpo = yaw + PI.
  // Os braços devem girar em Y para compensar a diferença camera↔corpo,
  // de modo que a arma aponte EXATAMENTE para onde o crosshair está.
  let bodyYaw = g.rotation.y;
  let camYawLocal = 0;
  if(g === player && (phase === 'game' || phase === 'drop')){
    // Direção que a camera olha (horizontal, no espaço do mundo)
    // A camera está em (yaw, pitch); o que ela olha é oposto a ela:
    // lookDir.x = -sin(yaw), lookDir.z = -cos(yaw)
    // ângulo local do alvo = atan2(-sin(yaw), -cos(yaw)) = yaw + PI
    camYawLocal = shortestAngle(bodyYaw, camOrbit.yaw + Math.PI);
  } else if(g.userData.isBot){
    // Bots olham para o player -> alvo já está no rotation.y
    camYawLocal = 0;
  }
  // suavizar o aim dos braços
  if(typeof u.aimYaw !== 'number'){ u.aimYaw = 0; u.aimPitch = -0.15; }
  u.aimYaw   += (camYawLocal   - u.aimYaw)   * Math.min(1, dt * 18);
  u.aimPitch += ((u._targetPitch ?? -0.18) - u.aimPitch) * Math.min(1, dt * 18);

  // pitch "alvo" — para player, usa o pitch da camera; bots miram levemente pra baixo
  if(g === player) u._targetPitch = -0.15 + camOrbit.pitch * 0.45;
  else             u._targetPitch = -0.25;

  if(u.building && !falling){
    p.armL.rotation.set(-1.4, 0, 0.5);
    p.armR.rotation.set(-1.4, 0, -0.5);
  } else if(u.aiming && !falling){
    // Braço direito (cano da arma): gira em Y para apontar para a mira
    // e em X para cima/baixo de acordo com o pitch. Compensa o recoil (kick).
    const ay = u.aimYaw;
    const ap = u.aimPitch;
    // Sway da arma (movimento subtil ao mover-se)
    const swayX = moving ? Math.sin(ph) * 0.03 : Math.sin(performance.now() * 0.002) * 0.015;
    const swayY = moving ? Math.abs(Math.sin(ph)) * 0.02 : Math.sin(performance.now() * 0.0015) * 0.01;
    p.armR.rotation.set(-Math.PI/2 - ap * 0.6 + kick * 0.45 + swayY, ay * 0.55, swayX);
    // Braço esquerdo: suporte dois-mãos, do outro lado, ligeiramente à frente
    p.armL.rotation.set(-Math.PI/2 - ap * 0.5 + 0.25 + kick * 0.3, ay * 0.55, 0.55 + swayX * 0.5);
    // Sway da arma na mão
    if(p.heldWeapon && p.heldWeapon.visible){
      const targetSwayX = swayX * 0.5;
      const targetSwayY = swayY * 0.3;
      p.heldWeapon.rotation.z += (0.1 + targetSwayX - p.heldWeapon.rotation.z) * Math.min(1, dt * 8);
      p.heldWeapon.rotation.x += (-Math.PI/2 + 0.15 + kick * 0.3 + targetSwayY - p.heldWeapon.rotation.x) * Math.min(1, dt * 10);
    }
  } else if(u.buildPiece === 1 || (u.isBot && kick > 0.4)){
    p.armR.rotation.set(-1.4 - Math.sin(kick * Math.PI) * 0.9, 0, 0);
    p.armL.rotation.set(Math.sin(ph) * swing * 0.7, 0, 0);
  } else {
    // Picareta: swing mais natural
    p.armL.rotation.set(Math.sin(ph) * swing * 0.7, 0, 0);
    p.armR.rotation.set(-Math.sin(ph) * swing * 0.7 - kick * 1.8, 0, 0);
    // Swing da picareta na mao
    if(p.heldWeapon && p.heldWeapon.visible && activeSlot === 1){
      p.heldWeapon.rotation.x += (kick * 1.5 - p.heldWeapon.rotation.x) * Math.min(1, dt * 12);
      p.heldWeapon.rotation.z += (0.2 + kick * 0.8 - p.heldWeapon.rotation.z) * Math.min(1, dt * 10);
    }
  }
  p.legL.rotation.x = Math.sin(ph) * swing;
  p.legR.rotation.x = -Math.sin(ph) * swing;
  const targetScale = u.crouching ? 0.82 : 1;
  g.scale.y += (targetScale - g.scale.y) * Math.min(1, dt * 10);
  g.scale.x += (1 - g.scale.x) * Math.min(1, dt * 8);
  g.scale.z += (1 - g.scale.z) * Math.min(1, dt * 8);
  p.torso.position.y = 4.85 + Math.abs(Math.sin(ph * 2)) * swing * 0.05;
  p.headGroup.position.y = 6.5 + Math.abs(Math.sin(ph * 2)) * swing * 0.04;
  if(!moving){
    p.torso.position.y = 4.85 + Math.sin(performance.now() * 0.002) * 0.02;
    p.headGroup.position.y = 6.5 + Math.sin(performance.now() * 0.002) * 0.015;
  }
  // Respiração sutil do tronco (idle)
  if(!moving && !u.aiming && p.torso && !falling){
    const br = Math.sin(performance.now() * 0.0014) * 0.025;
    p.torso.scale.z = 1 + br;
    p.torso.scale.y = 1 - br * 0.4;
  } else if(p.torso){
    p.torso.scale.z = THREE.MathUtils.lerp(p.torso.scale.z, 1, Math.min(1, dt * 8));
    p.torso.scale.y = THREE.MathUtils.lerp(p.torso.scale.y, 1, Math.min(1, dt * 8));
  }
  // Postura de tiro: leve inclinação frontal do tronco
  if(u.aiming && !falling && p.torso){
    p.torso.rotation.x = THREE.MathUtils.lerp(p.torso.rotation.x, -0.18, Math.min(1, dt * 10));
    if(p.chestPlate) p.chestPlate.rotation.x = p.torso.rotation.x;
  } else if(p.torso){
    p.torso.rotation.x = THREE.MathUtils.lerp(p.torso.rotation.x, 0, Math.min(1, dt * 10));
    if(p.chestPlate) p.chestPlate.rotation.x = p.torso.rotation.x;
  }

  // Olhos e sobrancelhas seguem a mira (limitado ao pescoço)
  if(p.eyeL && p.eyeR && p.eyeBaseL && p.eyeBaseR){
    const eyeYaw   = THREE.MathUtils.clamp(u.aimYaw * 0.55, -0.5, 0.5);
    const eyePitch = THREE.MathUtils.clamp(-u.aimPitch * 0.5, -0.3, 0.3);
    p.eyeL.position.y   += (p.eyeBaseL.y   + eyePitch * 0.05 - p.eyeL.position.y)   * Math.min(1, dt * 12);
    p.eyeR.position.y   += (p.eyeBaseR.y   + eyePitch * 0.05 - p.eyeR.position.y)   * Math.min(1, dt * 12);
    p.eyeL.position.x   += (p.eyeBaseL.x   + eyeYaw   * 0.05 - p.eyeL.position.x)   * Math.min(1, dt * 12);
    p.eyeR.position.x   += (p.eyeBaseR.x   + eyeYaw   * 0.05 - p.eyeR.position.x)   * Math.min(1, dt * 12);
  }
  if(p.headGroup){
    const headYaw   = THREE.MathUtils.clamp(u.aimYaw * 0.4, -0.8, 0.8);
    const headPitch = THREE.MathUtils.clamp(-u.aimPitch * 0.35, -0.4, 0.4);
    p.headGroup.rotation.y = THREE.MathUtils.lerp(p.headGroup.rotation.y || 0, headYaw,   Math.min(1, dt * 12));
    p.headGroup.rotation.x = THREE.MathUtils.lerp(p.headGroup.rotation.x || 0, headPitch, Math.min(1, dt * 12));
  }
  if(falling){
    p.armL.rotation.set(-2.5, 0, 0.8);
    p.armR.rotation.set(-2.5, 0, -0.8);
    p.legL.rotation.x = 0.3;
    p.legR.rotation.x = -0.3;
  }
}
function danceAnim(g, t){
  const p = g.userData.parts;
  if(!p || !p.armL) return;
  const off = g.userData.danceOffset || 0;
  const s = Math.sin((t + off) * 6);
  const c = Math.cos((t + off) * 3);
  p.armL.rotation.set(-2.6 + s * 0.5, 0, 0.55);
  p.armR.rotation.set(-2.6 - s * 0.5, 0, -0.55);
  p.legL.rotation.x = s * 0.15;
  p.legR.rotation.x = -s * 0.15;
  p.torso.rotation.z = c * 0.09;
  p.headGroup.rotation.z = c * 0.12;
  g.position.y = Math.abs(Math.sin((t + off) * 6)) * 0.35;
}
export function legacyCreate(skin, name){ return createCharacter(skin, name); }
export function legacyAnimate(g, dt, mode, t){
  player = null;
  if(mode === 'dance') return danceAnim(g, t);
  const moving = mode === 'walk' || mode === 'run';
  animateCharacter(g, dt, moving, mode === 'run', false);
}
