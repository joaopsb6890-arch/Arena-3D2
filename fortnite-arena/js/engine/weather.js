// ============================================================
// ENVIRONMENT — céu físico (Sky/Preetham), ciclo dia/noite, sol
// com sombras suaves que seguem a câmera, IBL via PMREM (HDRI
// procedural), GI aproximada com LightProbe capturado da cena
// (CubeCamera → harmônicos esféricos), nuvens volumétricas
// instanciadas, CLIMA DINÂMICO (limpo, nublado, chuva, tempestade,
// neblina) com transições, chuva + respingos, raios + trovão,
// vento global e superfícies molhadas.
// ============================================================
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { LightProbeGenerator } from 'three/addons/lights/LightProbeGenerator.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Wind } from '../anim/secondary.js';
import { allMaterials } from './materials.js';

export const WEATHER = {
  limpo:      { label: 'Limpo',      cloud: 0.25, fog: 0.0009, rain: 0,   wind: 3,  light: 1.0, turb: 2.5, lightning: 0 },
  nublado:    { label: 'Nublado',    cloud: 0.8,  fog: 0.0016, rain: 0,   wind: 6,  light: 0.55, turb: 8, lightning: 0 },
  chuva:      { label: 'Chuva',      cloud: 1.0,  fog: 0.0026, rain: 0.7, wind: 9,  light: 0.35, turb: 12, lightning: 0.02 },
  tempestade: { label: 'Tempestade', cloud: 1.0,  fog: 0.0034, rain: 1.0, wind: 16, light: 0.22, turb: 16, lightning: 0.25 },
  neblina:    { label: 'Neblina',    cloud: 0.6,  fog: 0.0095, rain: 0,   wind: 1.5, light: 0.5, turb: 10, lightning: 0 }
};

export class Environment {
  constructor(scene, renderer, particles, audio, opts){
    opts = opts || {};
    this.scene = scene; this.renderer = renderer; this.particles = particles; this.audio = audio;
    this.time = opts.time ?? 15.5; this.timeSpeed = 0; // horas por segundo
    this.state = Object.assign({}, WEATHER.limpo); this.target = WEATHER.limpo; this.weatherName = 'limpo';
    this.wet = 0;
    // céu
    this.sky = new Sky(); this.sky.scale.setScalar(4500); scene.add(this.sky);
    this.skyScene = new THREE.Scene(); this.skyForEnv = new Sky(); this.skyForEnv.scale.setScalar(900); this.skyScene.add(this.skyForEnv);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 2.5; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.005; u.mieDirectionalG.value = 0.8;
    // luzes
    this.sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
    this.sun.castShadow = true;
    const s = this.sun.shadow; s.mapSize.set(2048, 2048); s.bias = -0.0004; s.normalBias = 0.04; s.radius = 3; s.blurSamples = 16;
    const sc = s.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 600;
    scene.add(this.sun); scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfdcff, 0x5a4a32, 0.35); scene.add(this.hemi);
    this.envScale = 0.32; this.probeScale = 0.22;
    this.probe = new THREE.LightProbe(); this.probe.intensity = this.probeScale; scene.add(this.probe);
    this.moonLight = new THREE.DirectionalLight(0x9fb4ff, 0); scene.add(this.moonLight);
    this.fog = new THREE.FogExp2(0xcfe3f5, this.state.fog); scene.fog = this.fog;
    this.sunDir = new THREE.Vector3();
    this.focus = new THREE.Vector3();
    // estrelas
    const sg = new THREE.BufferGeometry(); const sp = new Float32Array(1800 * 3);
    for(let i = 0; i < 1800; i++){ const v = new THREE.Vector3().randomDirection(); v.y = Math.abs(v.y) + 0.05; v.normalize().multiplyScalar(2000); sp.set([v.x, v.y, v.z], i * 3); }
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    scene.add(this.stars);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(40, 24, 16), new THREE.MeshBasicMaterial({ color: 0xe8ecff, fog: false, transparent: true, opacity: 0 }));
    scene.add(this.moon);
    // nuvens
    this._makeClouds(opts.cloudArea || 900);
    // chuva
    this._makeRain();
    // raio
    this.bolt = null; this.lightningT = 0; this.flashT = 0;
    this.envTimer = 0; this.probeTimer = 0; this._lastEnvKey = '';
    this.update(0, null, true);
  }
  _makeClouds(area){
    const puffs = [];
    for(let i = 0; i < 7; i++){ const g = new THREE.IcosahedronGeometry(1, 2); g.scale(1, 0.6, 1); g.translate((i - 3) * 0.9 + Math.random() * 0.4, Math.random() * 0.35, (Math.random() - 0.5) * 1.2); const sc = 0.8 + Math.random() * 0.8; g.scale(sc, sc, sc); puffs.push(g); }
    const geo = mergeGeometries(puffs.map(g => g.index ? g.toNonIndexed() : g));
    geo.computeVertexNormals();
    this.cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.92, flatShading: false, fog: true });
    const N = 70;
    this.clouds = new THREE.InstancedMesh(geo, this.cloudMat, N);
    this.cloudData = [];
    const m = new THREE.Matrix4();
    for(let i = 0; i < N; i++){
      const d = { x: (Math.random() - 0.5) * area * 2, y: 160 + Math.random() * 80, z: (Math.random() - 0.5) * area * 2, s: 18 + Math.random() * 26, rot: Math.random() * 6.28, thr: Math.random() };
      this.cloudData.push(d);
    }
    this.cloudArea = area;
    this.clouds.frustumCulled = false; this.clouds.castShadow = false;
    this.scene.add(this.clouds);
  }
  _makeRain(){
    const N = 5000;
    const g = new THREE.BufferGeometry();
    this.rainPos = new Float32Array(N * 6);
    this.rainVel = new Float32Array(N);
    for(let i = 0; i < N; i++){ this._resetDrop(i, true); }
    g.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaecbe8, transparent: true, opacity: 0.45, depthWrite: false }));
    this.rain.frustumCulled = false; this.rain.visible = false;
    this.scene.add(this.rain);
    this.rainN = N;
  }
  _resetDrop(i, init){
    const R = 60, x = (Math.random() - 0.5) * R * 2 + this.focus.x, z = (Math.random() - 0.5) * R * 2 + this.focus.z;
    const y = init ? Math.random() * 80 : 70 + Math.random() * 20;
    this.rainPos.set([x, y, z, x, y - 1.6, z], i * 6);
    this.rainVel[i] = 70 + Math.random() * 30;
  }
  setWeather(name){ if(WEATHER[name]){ this.target = WEATHER[name]; this.weatherName = name; } }
  setTime(h){ this.time = ((h % 24) + 24) % 24; this._forceEnv = true; }
  triggerLightning(){
    const p = new THREE.Vector3(this.focus.x + (Math.random() - 0.5) * 400, 0, this.focus.z + (Math.random() - 0.5) * 400);
    // raio ramificado
    const pts = []; let cur = new THREE.Vector3(p.x, 220, p.z);
    while(cur.y > 0){ const nx = cur.clone().add(new THREE.Vector3((Math.random() - 0.5) * 18, -12 - Math.random() * 10, (Math.random() - 0.5) * 18)); pts.push(cur.clone(), nx.clone()); if(Math.random() < 0.25){ pts.push(nx.clone(), nx.clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, -15, (Math.random() - 0.5) * 30))); } cur = nx; }
    if(this.bolt){ this.scene.remove(this.bolt); this.bolt.geometry.dispose(); }
    this.bolt = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xeef2ff, transparent: true, opacity: 1, fog: false }));
    this.scene.add(this.bolt);
    this.flashT = 0.35;
    this.boltPos = p;
    if(this.audio) this.audio.thunder(p);
  }
  update(dt, camera, force){
    const S = this.state, T = this.target, k = force ? 1 : 1 - Math.exp(-dt * 0.5);
    for(const key of ['cloud', 'fog', 'rain', 'wind', 'light', 'turb', 'lightning']) S[key] += (T[key] - S[key]) * k;
    this.time = (this.time + dt * this.timeSpeed) % 24;
    if(camera) this.focus.copy(camera.position);
    // sol
    const h = this.time;
    const elev = Math.sin((h - 6) / 12 * Math.PI) * 70;           // graus
    const azim = (h - 12) / 12 * 180 + (this.sunAzimuth || 0);
    const phi = THREE.MathUtils.degToRad(90 - elev), theta = THREE.MathUtils.degToRad(azim);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir); u.turbidity.value = S.turb; u.rayleigh.value = elev < 10 ? 3 : 1.6;
    u.mieCoefficient.value = 0.005 + S.cloud * 0.01;
    const day = THREE.MathUtils.smoothstep(elev, -8, 12);
    const golden = 1 - THREE.MathUtils.smoothstep(elev, 5, 30);
    this.sun.position.copy(this.focus).addScaledVector(this.sunDir, 300);
    this.sun.target.position.copy(this.focus);
    this.sun.intensity = 3.4 * day * S.light;
    this.sun.color.setRGB(1, 0.93 - golden * 0.3, 0.85 - golden * 0.5);
    this.sun.castShadow = day > 0.05;
    this.hemi.intensity = (0.15 + 0.35 * day) * (0.7 + S.cloud * 0.4);
    this.hemi.color.setRGB(0.55 + 0.2 * day, 0.65 + 0.2 * day, 0.9);
    this.moonLight.intensity = (1 - day) * 0.5;
    this.moonLight.position.copy(this.focus).addScaledVector(this.sunDir, -300);
    this.moon.position.copy(this.focus).addScaledVector(this.sunDir, -1800); this.moon.material.opacity = 1 - day;
    this.stars.position.copy(this.focus); this.stars.material.opacity = (1 - day) * (1 - S.cloud * 0.8);
    // neblina acompanha a cor do céu
    const fogDay = new THREE.Color(0xcfe3f5).lerp(new THREE.Color(0x8a96a3), S.cloud * 0.7).lerp(new THREE.Color(0xf2b27a), golden * day * 0.45);
    const fogNight = new THREE.Color(0x0b1220);
    this.fog.color.copy(fogNight).lerp(fogDay, day);
    this.fog.density = S.fog;
    this.renderer.r.toneMappingExposure = 0.55 + 0.5 * day * (0.6 + S.light * 0.4) + (1 - day) * 0.25;
    // vento global
    Wind.strength = S.wind; Wind.time += dt;
    Wind.gust = Math.max(0, Math.sin(Wind.time * 0.35) * Math.sin(Wind.time * 1.1)) * S.wind * 0.08;
    Wind.dir.set(Math.cos(Wind.time * 0.02), 0, Math.sin(Wind.time * 0.02) * 0.6 + 0.3).normalize();
    // nuvens
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const A = this.cloudArea;
    this.cloudData.forEach((d, i) => {
      d.x += Wind.dir.x * S.wind * 0.6 * dt; d.z += Wind.dir.z * S.wind * 0.6 * dt;
      if(d.x - this.focus.x > A) d.x -= A * 2; if(d.x - this.focus.x < -A) d.x += A * 2;
      if(d.z - this.focus.z > A) d.z -= A * 2; if(d.z - this.focus.z < -A) d.z += A * 2;
      const vis = d.thr < S.cloud ? 1 : 0;
      const s = d.s * vis;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.rot); sc.set(s, s * (0.8 + S.cloud * 0.4), s);
      m.compose(p.set(d.x, d.y - S.cloud * 30, d.z), q, sc);
      this.clouds.setMatrixAt(i, m);
    });
    this.clouds.instanceMatrix.needsUpdate = true;
    const cl = 0.25 + 0.75 * day * (1 - S.cloud * 0.55);
    this.cloudMat.color.setRGB(cl, cl, cl * 1.03).lerp(new THREE.Color(1, 0.7, 0.55), golden * day * 0.4);
    this.cloudMat.emissive = this.cloudMat.emissive || new THREE.Color();
    // chuva
    this.rain.visible = S.rain > 0.02;
    if(this.rain.visible){
      const P = this.rainPos, active = Math.floor(this.rainN * S.rain);
      const wx = Wind.dir.x * S.wind * 0.8, wz = Wind.dir.z * S.wind * 0.8;
      for(let i = 0; i < this.rainN; i++){
        const o = i * 6;
        if(i >= active){ P[o + 1] = P[o + 4] = -999; continue; }
        const v = this.rainVel[i] * dt;
        P[o] += wx * dt; P[o + 2] += wz * dt; P[o + 1] -= v;
        P[o + 3] = P[o] - wx * 0.03; P[o + 5] = P[o + 2] - wz * 0.03; P[o + 4] = P[o + 1] + 1.8;
        if(P[o + 1] < 0 || P[o + 1] < -900){
          if(P[o + 1] > -900 && this.particles && Math.random() < 0.08 && Math.abs(P[o] - this.focus.x) < 30) this.particles.emit('splash', new THREE.Vector3(P[o], 0.05, P[o + 2]), { n: 1 });
          this._resetDrop(i);
        }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rain.material.opacity = 0.25 + day * 0.25;
    }
    // superfícies molhadas
    const wetT = S.rain > 0.1 ? 1 : 0;
    this.wet += (wetT - this.wet) * (1 - Math.exp(-dt * (wetT ? 0.25 : 0.05)));
    if(Math.abs(this.wet - (this._lastWet || 0)) > 0.02){
      this._lastWet = this.wet;
      allMaterials().forEach(mt => { if(mt.userData.baseRough === undefined) mt.userData.baseRough = mt.roughness ?? 1; if(mt.roughness !== undefined && !mt.userData.noWet) mt.roughness = mt.userData.baseRough * (1 - this.wet * 0.55); if(mt.clearcoat !== undefined && mt.userData.baseKey && mt.userData.baseKey.startsWith('ground')) mt.clearcoat = this.wet * 0.6; });
    }
    // raios
    if(S.lightning > 0.01 && Math.random() < S.lightning * dt * 0.8) this.triggerLightning();
    if(this.flashT > 0){
      this.flashT -= dt;
      const f = Math.max(0, this.flashT / 0.35) * (Math.random() > 0.3 ? 1 : 0.2);
      this.hemi.intensity += f * 2.5;
      if(this.bolt) this.bolt.material.opacity = f;
      if(this.flashT <= 0 && this.bolt){ this.scene.remove(this.bolt); this.bolt.geometry.dispose(); this.bolt = null; }
    }
    // IBL (HDRI procedural) — re-gera quando o céu muda
    this.envTimer -= dt;
    const key = Math.round(this.time * 4) + '_' + Math.round(S.turb) + '_' + Math.round(S.cloud * 10);
    if(force || this._forceEnv || (this.envTimer <= 0 && key !== this._lastEnvKey)){
      this._forceEnv = false; this.envTimer = 1.5; this._lastEnvKey = key;
      const u2 = this.skyForEnv.material.uniforms;
      for(const n in u) if(u2[n]) u2[n].value = u[n].value.clone ? u[n].value.clone() : u[n].value;
      // RT próprio por ambiente (cada cena — estúdio/partida — mantém o seu HDRI)
      if(this._envRT) this._envRT.dispose();
      this._envRT = this.renderer.pmrem.fromScene(this.skyScene, 0, 0.1, 1000);
      this.scene.environment = this._envRT.texture;
      this.scene.environmentIntensity = 0.35 + 0.65 * day * (1 - S.cloud * 0.3);
      if('environmentIntensity' in this.scene === false){ /* r160 sem environmentIntensity — ajusta materiais */ }
    }
    const envI = this.envScale * (0.3 + 0.7 * day) * (1 - S.cloud * 0.3);
    const mats = allMaterials();
    if(force || Math.abs(envI - (this._envI || -1)) > 0.005 || mats.size !== this._matCount){
      this._envI = envI; this._matCount = mats.size;
      mats.forEach(mt => { if('envMapIntensity' in mt) mt.envMapIntensity = envI * (mt.userData.envBoost || 1); });
    }
    // GI: light probe da cena (capturado periodicamente)
    this.probeTimer -= dt;
    // só recaptura quando o foco se desloca ou o céu muda (evita picos de GPU que quebrariam os 60fps)
    if(this.giEnabled !== false && (force || this.probeTimer <= 0)){
      this.probeTimer = 3;
      const moved = !this._probePos || this._probePos.distanceTo(this.focus) > 45;
      if(force || moved || key !== this._probeKey){ this._probeKey = key; this._probePos = (this._probePos || new THREE.Vector3()).copy(this.focus); this.captureProbe(); }
    }
  }
  captureProbe(){
    try {
      if(!this.cubeRT){ this.cubeRT = new THREE.WebGLCubeRenderTarget(32); this.cubeCam = new THREE.CubeCamera(1, 800, this.cubeRT); }
      this.cubeCam.position.copy(this.focus).setY(this.focus.y + 4);
      const hidden = [];
      this.scene.traverse(o => { if(o.userData && o.userData.noProbe && o.visible){ o.visible = false; hidden.push(o); } });
      const pv = this.probe.intensity; this.probe.intensity = 0;
      this.cubeCam.update(this.renderer.r, this.scene);
      hidden.forEach(o => o.visible = true);
      const lp = LightProbeGenerator.fromCubeRenderTarget(this.renderer.r, this.cubeRT);
      this.probe.sh.copy(lp.sh); this.probe.intensity = this.probeScale;
    } catch(e){ this.giEnabled = false; }
  }
}
