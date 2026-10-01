// ============================================================
// RENDERER — pipeline físico:
//  WebGLRenderer (ACES Filmic, sRGB, sombras PCF suaves)
//  → EffectComposer: Render → GTAO (oclusão ambiente) →
//    SSR (reflexos em espaço de tela, modo "Ray-trace aprox.") →
//    Bokeh DOF (cinemático) → UnrealBloom → SMAA → Output
//  + presets de qualidade, resolução adaptativa p/ 60fps,
//    contador de FPS e iluminação baseada em imagem (PMREM).
// ============================================================
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { makeGradePass } from './grade.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { SSRPass } from 'three/addons/postprocessing/SSRPass.js';
import { setViewMode } from './materials.js';
import { setTextureResolution } from './textures.js';

export const QUALITY = {
  // v17: Baixa deixa de reduzir a resolução (era 0.75× e o modo adaptativo descia até 0.41× → imagem pixelizada).
  // Agora renderiza à resolução nativa (limitada a 1×) com FXAA barato e o piso adaptativo é alto (0.85).
  baixa:  { label: 'Baixa',  pr: 1.0, shadows: false, shadowMap: 1024, ao: false, bloom: false, smaa: false, fxaa: true, maxPR: 1, minDyn: 0.85, tex: 512 },
  media:  { label: 'Média',  pr: 1.0,  shadows: true,  shadowMap: 2048, ao: false, bloom: true,  smaa: true,  maxPR: 1.25, minDyn: 0.75, tex: 1024 },
  alta:   { label: 'Alta',   pr: 1.0,  shadows: true,  shadowMap: 2048, ao: true,  bloom: true,  smaa: true,  maxPR: 1.5, minDyn: 0.7, tex: 1024 },
  ultra:  { label: 'Ultra',  pr: 1.25, shadows: true,  shadowMap: 4096, ao: true,  bloom: true,  smaa: true,  maxPR: 2,   minDyn: 0.7, tex: 2048 }
};

export class Renderer {
  constructor(container){
    this.container = container;
    const r = this.r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.info.autoReset = false;
    container.appendChild(r.domElement);
    r.domElement.id = 'gl';
    this.pmrem = new THREE.PMREMGenerator(r);
    this.qualityName = 'alta';
    this.q = QUALITY.alta;
    this.adaptive = true;
    this.dynPR = 1;
    this.fps = 60; this.frameMs = 16; this._acc = 0; this._frames = 0; this._lowT = 0; this._highT = 0;
    this.viewMode = 'material';
    this.dof = { on: false, focus: 20, aperture: 0.0006, maxblur: 0.008 };
    this.scene = null; this.camera = null; this.composer = null;
    this.onStats = null;
    window.addEventListener('resize', () => this.resize());
  }
  get size(){ return { w: this.container.clientWidth || window.innerWidth, h: this.container.clientHeight || window.innerHeight }; }
  setScene(scene, camera){
    this.scene = scene; this.camera = camera;
    this._buildComposer();
  }
  setQuality(name){
    this.qualityName = name; this.q = QUALITY[name] || QUALITY.alta;
    this.r.shadowMap.enabled = this.q.shadows;
    // v15: PCF simples em Média (PCFSoft custa ~2× por pixel em sombra)
    this.r.shadowMap.type = name === 'media' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.dynPR = 1;
    if(this.scene) this.scene.traverse(o => { if(o.isDirectionalLight && o.shadow){ o.shadow.mapSize.set(this.q.shadowMap, this.q.shadowMap); if(o.shadow.map){ o.shadow.map.dispose(); o.shadow.map = null; } } });
    this.scene && this.scene.traverse(o => { if(o.material){ (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); } });
    this._buildComposer();
  }
  setViewMode(mode){
    this.viewMode = mode;
    setViewMode(this.scene, mode === 'raytrace' ? 'material' : mode);
    this._buildComposer();
  }
  setDOF(on, focus){ this.dof.on = on; if(focus) this.dof.focus = focus; if(this.bokeh){ this.bokeh.enabled = on; this.bokeh.uniforms.focus.value = this.dof.focus; } else if(on) this._buildComposer(); }
  _buildComposer(){
    if(!this.scene) return;
    const { w, h } = this.size;
    const pr = Math.min(window.devicePixelRatio || 1, this.q.maxPR) * this.q.pr * this.dynPR;
    this.r.setPixelRatio(pr);
    this.r.setSize(w, h, false);
    this.r.domElement.style.width = '100%'; this.r.domElement.style.height = '100%';
    if(this.composer){ this.composer.passes.forEach(p => p.dispose && p.dispose()); this.composer.dispose(); }
    const c = this.composer = new EffectComposer(this.r);
    c.setPixelRatio(pr); c.setSize(w, h);
    this.renderPass = new RenderPass(this.scene, this.camera); c.addPass(this.renderPass);
    const wantsFx = this.viewMode === 'material' || this.viewMode === 'raytrace';
    this.gtao = null; this.ssr = null; this.bokeh = null; this.bloom = null;
    if(wantsFx && (this.q.ao || this.viewMode === 'raytrace')){
      this.gtao = new GTAOPass(this.scene, this.camera, w, h);
      this.gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 1.5, scale: 1.1, samples: this.qualityName === 'ultra' ? 16 : 10 });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      this.gtao.blendIntensity = 0.9;
      c.addPass(this.gtao);
    }
    if(this.viewMode === 'raytrace'){
      this.ssr = new SSRPass({ renderer: this.r, scene: this.scene, camera: this.camera, width: w, height: h, groundReflector: null, selects: null });
      this.ssr.thickness = 0.02; this.ssr.infiniteThick = false; this.ssr.maxDistance = 40; this.ssr.opacity = 0.6;
      this.ssr.fresnel = true; this.ssr.distanceAttenuation = true; this.ssr.bouncing = false; this.ssr.blur = true;
      c.addPass(this.ssr);
    }
    if(wantsFx && this.dof.on){
      this.bokeh = new BokehPass(this.scene, this.camera, { focus: this.dof.focus, aperture: this.dof.aperture, maxblur: this.dof.maxblur });
      c.addPass(this.bokeh);
    }
    if(wantsFx && this.q.bloom){
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.55, 0.88);
      c.addPass(this.bloom);
    }
    c.addPass(new OutputPass());
    // v14: grading + nitidez leve em todas as qualidades (1 passe barato)
    if(this.qualityName !== 'baixa' && !/nograde/.test(location.search)){ this.grade = makeGradePass(w * pr, h * pr, this.qualityName === 'baixa' ? 0 : pr < 0.95 ? 0.45 : 0.22); c.addPass(this.grade); }
    if(this.q.smaa){ this.smaa = new SMAAPass(w * pr, h * pr); c.addPass(this.smaa); }
    this.fxaa = null;
    if(this.q.fxaa){ this.fxaa = new ShaderPass(FXAAShader); this.fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr)); c.addPass(this.fxaa); }
  }
  // v15: troca de resolução dinâmica SEM recriar passes/shaders (antes: _buildComposer = travada visível)
  _applyPR(){
    const { w, h } = this.size;
    const pr = Math.min(window.devicePixelRatio || 1, this.q.maxPR) * this.q.pr * this.dynPR;
    this.r.setPixelRatio(pr); this.r.setSize(w, h, false);
    this.r.domElement.style.width = '100%'; this.r.domElement.style.height = '100%';
    this.composer.setPixelRatio(pr); this.composer.setSize(w, h);
    if(this.grade) this.grade.uniforms.uTexel.value.set(1 / (w * pr), 1 / (h * pr));
    if(this.fxaa) this.fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
  }
  resize(){
    if(!this.composer) return;
    const { w, h } = this.size;
    if(this.camera){ this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    this._buildComposer();
  }
  /** Ambiente IBL a partir de uma cena de céu (HDRI procedural). */
  updateEnvironment(skyScene){
    if(this._envRT) this._envRT.dispose();
    this._envRT = this.pmrem.fromScene(skyScene, 0, 0.1, 1000);
    this.scene.environment = this._envRT.texture;
    return this._envRT.texture;
  }
  render(dt){
    if(!this.composer) return;
    if(this.camera !== this.renderPass.camera){ this.renderPass.camera = this.camera; if(this.gtao) this.gtao.camera = this.camera; }
    this.r.info.reset();
    // v15: em Média o mapa de sombras é redesenhado em frames alternados (metade do custo do passe de sombras)
    if(this.qualityName === 'media'){ this.r.shadowMap.autoUpdate = false; this._sf = (this._sf || 0) + 1; if(this._sf % 2 === 0) this.r.shadowMap.needsUpdate = true; }
    else this.r.shadowMap.autoUpdate = true;
    this.composer.render(dt);
    // estatísticas + resolução adaptativa (mantém ~60fps)
    this._acc += dt; this._frames++;
    if(this._acc >= 0.5){
      this.fps = this._frames / this._acc; this.frameMs = 1000 * this._acc / this._frames;
      this._acc = 0; this._frames = 0;
      if(this.adaptive){
        if(this.fps < 50){ this._lowT++; this._highT = 0; } else if(this.fps > 58){ this._highT++; this._lowT = 0; } else { this._lowT = this._highT = 0; }
        const mn = this.q.minDyn || 0.7; if(this._lowT >= 3 && this.dynPR > mn){ this.dynPR = Math.max(mn, this.dynPR - 0.08); this._lowT = 0; this._applyPR(); }
        if(this._highT >= 8 && this.dynPR < 1){ this.dynPR = Math.min(1, this.dynPR + 0.08); this._highT = 0; this._applyPR(); }
      }
      if(this.onStats) this.onStats({ fps: this.fps, ms: this.frameMs, calls: this.r.info.render.calls, tris: this.r.info.render.triangles, pr: this.r.getPixelRatio() });
    }
  }
}
export { setTextureResolution };
