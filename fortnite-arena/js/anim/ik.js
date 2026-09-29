// ============================================================
// IK — solver analítico de 2 ossos com vetor polar (joelhos /
// cotovelos), orientação de mão/pé em espaço do mundo e look-at
// com limites. Ossos apontam para -Y no espaço local.
// ============================================================
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _d = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _m = new THREE.Matrix4();
const NEG_Y = new THREE.Vector3(0, -1, 0);

/**
 * Orienta `bone` (cujo eixo -Y local aponta para o filho) para que
 * aponte na direção `dirWorld`, usando `poleWorld` para definir o
 * eixo +Z local (twist). Resultado em quaternion local.
 */
export function aimBone(bone, dirWorld, poleWorld){
  const y = _d.copy(dirWorld).normalize().negate();          // +Y local = oposto da direção
  let z = _e.copy(poleWorld).sub(_f.copy(y).multiplyScalar(poleWorld.dot(y)));
  if(z.lengthSq() < 1e-8) z.set(0, 0, 1).sub(_f.copy(y).multiplyScalar(y.z));
  z.normalize();
  const x = _f.crossVectors(y, z).normalize();
  _m.makeBasis(x, y, z);
  _q.setFromRotationMatrix(_m);                               // orientação desejada no mundo
  bone.parent.getWorldQuaternion(_qp).invert();
  bone.quaternion.copy(_qp.multiply(_q));
}

/**
 * IK de dois ossos.
 * @param upper, lower  joints (lower filho de upper; end = filho de lower)
 * @param lenA, lenB    comprimentos
 * @param target        posição alvo (mundo)
 * @param pole          direção do joelho/cotovelo (mundo, vetor)
 * @param twistRef      vetor de referência para o +Z dos ossos
 * @param weight        0..1 (mistura com a pose FK atual)
 */
export function solveTwoBone(upper, lower, lenA, lenB, target, pole, weight, twistSign){
  twistSign = twistSign || 1;
  if(weight <= 0) return;
  const qU0 = weight < 1 ? upper.quaternion.clone() : null;
  const qL0 = weight < 1 ? lower.quaternion.clone() : null;
  upper.updateWorldMatrix(true, false);
  const S = upper.getWorldPosition(_a);
  const toT = _b.copy(target).sub(S);
  let dist = toT.length();
  const maxR = (lenA + lenB) * 0.9995, minR = Math.abs(lenA - lenB) + 0.02;
  dist = THREE.MathUtils.clamp(dist, minR, maxR);
  const dir = toT.normalize();
  // ângulo no ombro/quadril pela lei dos cossenos
  const cosA = THREE.MathUtils.clamp((lenA * lenA + dist * dist - lenB * lenB) / (2 * lenA * dist), -1, 1);
  const angA = Math.acos(cosA);
  // plano de flexão definido pelo polo
  const poleDir = _c.copy(pole).sub(_d.copy(dir).multiplyScalar(pole.dot(dir)));
  if(poleDir.lengthSq() < 1e-8) poleDir.set(0, 0, 1);
  poleDir.normalize();
  // posição do cotovelo/joelho
  const E = _e.copy(S).addScaledVector(dir, Math.cos(angA) * lenA).addScaledVector(poleDir, Math.sin(angA) * lenA);
  const upperDir = new THREE.Vector3().subVectors(E, S);
  const T = new THREE.Vector3().copy(S).addScaledVector(dir, dist);
  const lowerDir = new THREE.Vector3().subVectors(T, E);
  const bendAxisPole = poleDir.clone().multiplyScalar(twistSign);
  aimBone(upper, upperDir, bendAxisPole);
  upper.updateWorldMatrix(false, true);
  aimBone(lower, lowerDir, bendAxisPole);
  if(qU0){ upper.quaternion.copy(qU0.slerp(upper.quaternion, weight)); lower.quaternion.copy(qL0.slerp(lower.quaternion, weight)); }
  lower.updateWorldMatrix(false, true);
}

/** Define a rotação de mundo de um joint (convertendo para local). */
export function setWorldQuaternion(bone, qWorld, weight){
  bone.parent.getWorldQuaternion(_qp).invert();
  const q = _qp.multiply(qWorld);
  if(weight === undefined || weight >= 1) bone.quaternion.copy(q);
  else bone.quaternion.slerp(q, weight);
}

/** Quaternion de mundo a partir de direção dos dedos (−Y local) e normal da palma (+Z local). */
export function basisQuat(fingerDir, palmDir, out){
  const y = _d.copy(fingerDir).normalize().negate();
  const z = _e.copy(palmDir).sub(_f.copy(y).multiplyScalar(palmDir.dot(y))).normalize();
  const x = _f.crossVectors(y, z).normalize();
  _m.makeBasis(x, y, z);
  return (out || new THREE.Quaternion()).setFromRotationMatrix(_m);
}

/**
 * Look-at com limites: gira `bone` para que seu +Z aponte ao alvo,
 * limitado por yaw/pitch máximos, com peso.
 */
export function lookAtLimited(bone, targetWorld, maxYaw, maxPitch, weight){
  bone.updateWorldMatrix(true, false);
  const p = bone.getWorldPosition(_a);
  const dirW = _b.copy(targetWorld).sub(p).normalize();
  bone.parent.getWorldQuaternion(_qp);
  const dirL = dirW.applyQuaternion(_qp.clone().invert());
  let yaw = Math.atan2(dirL.x, dirL.z);
  let pitch = Math.asin(THREE.MathUtils.clamp(-dirL.y, -1, 1));
  yaw = THREE.MathUtils.clamp(yaw, -maxYaw, maxYaw);
  pitch = THREE.MathUtils.clamp(pitch, -maxPitch, maxPitch);
  _q.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  bone.quaternion.slerp(_q.premultiply(new THREE.Quaternion()), weight);
  return { yaw, pitch };
}
