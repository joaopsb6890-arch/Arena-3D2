// ============================================================
// GRADE — um único passe de pós-processamento barato (1 amostra
// central + 4 vizinhas) aplicado depois do OutputPass em TODAS as
// qualidades: nitidez (compensa a resolução dinâmica), contraste,
// saturação, split-toning quente/frio e vinheta.
// Custo: ~0.3 ms a 1080p numa GPU integrada.
// ============================================================
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    uSharpen: { value: 0.25 },
    uContrast: { value: 1.06 },
    uSat: { value: 1.12 },
    uVignette: { value: 0.28 },
    uWarm: { value: 0.035 }
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uSharpen, uContrast, uSat, uVignette, uWarm;
    varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if(uSharpen > 0.0){
        vec3 n = texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb
               + texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, uTexel.y)).rgb;
        c = clamp(c + (c - n * 0.25) * uSharpen, 0.0, 1.0);
      }
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * uContrast + 0.5;
      // sombras levemente frias, luzes levemente quentes (look "cartoon ensolarado")
      c += mix(vec3(-0.25, 0.0, 0.35), vec3(0.4, 0.15, -0.3), smoothstep(0.15, 0.85, l)) * uWarm;
      vec2 d = vUv - 0.5; float v = 1.0 - dot(d, d) * uVignette * 2.2;
      gl_FragColor = vec4(clamp(c * v, 0.0, 1.0), 1.0);
    }`
};
export function makeGradePass(w, h, sharpen){
  const p = new ShaderPass(GradeShader);
  p.uniforms.uTexel.value.set(1 / Math.max(1, w), 1 / Math.max(1, h));
  p.uniforms.uSharpen.value = sharpen;
  return p;
}
