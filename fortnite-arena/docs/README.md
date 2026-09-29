# Fortnite 3D Arena — v11 (arquitetura)

Projeto em Three.js r160 com ES modules, sem etapa de build. Basta abrir `index.html` num servidor estático.
Parâmetros de URL: `?q=baixa|media|alta|ultra` (qualidade) e `?manual=1` (desliga o rAF, para testes automatizados via `window.__simulate(n, dt)`). A tecla F8 mostra FPS, draw calls e triângulos.

## Estrutura

```
index.html            UI (lobby, armário, desafios, estúdio, carreira, config, HUD)
css/style.css         estilo inspirado no Fortnite (Anton + Barlow)
js/main.js            App: ecrãs, settings/carreira (localStorage), loop principal
js/engine/            motor (independente do jogo)
js/anim/              personagem, rig e animação
js/game/              regras do jogo (lobby, partida, estúdio, IA, mundo)
js/legacy/            personagem da v10, mantido só para o comparativo ANTES × DEPOIS
tests/rig-test.html   bancada de teste do rig (skins, armas, vistas)
```

## Motor (`js/engine`)

| Módulo | Responsabilidade |
|---|---|
| `renderer.js` | WebGLRenderer + EffectComposer. Pipeline: RenderPass → GTAO (ambient occlusion) → SSR (reflexos, no modo "ray-tracing") → Bokeh DOF → Bloom → OutputPass (ACES). Presets `baixa/media/alta/ultra` (pixel ratio, sombras PCFSoft de 1024 a 4096, passes ativos). Modos de visualização: material, sólido, wireframe, normais e ray-tracing (aproximado com SSR+GTAO). Resolução dinâmica: baixa o pixel ratio quando o frame passa de 16,6 ms. |
| `textures.js` | Texturas procedurais em canvas (512–2048 px) com mapas de albedo, normal, roughness e displacement: pele com poros, tecido (trama), jeans, couro, metal escovado, madeira, tijolo e relva. |
| `materials.js` | Biblioteca PBR em cache: pele (MeshPhysical com sheen e aproximação de SSS por transmissão/cor de dispersão), metais, polímero, tinta, vidro (transmission/IOR), tecidos com sheen. |
| `particles.js` | Sistema de partículas GPU (Points com shader próprio, pool): fogo, fumo, água/splash, magia, faíscas, detritos, confetti, poeira de passos, brilho de digitalização. |
| `audio.js` | Web Audio sintetizado (sem ficheiros): PannerNode HRTF para áudio 3D posicional, loops (chuva/vento), trovão com atraso pela distância, voz sintetizada para lip sync. |
| `weather.js` | `Environment`: céu atmosférico em shader, ciclo dia/noite, nuvens, chuva, neve, nevoeiro, relâmpagos, vento. IBL: HDRI procedural gerado por PMREM a partir do céu. GI: light probe (SH) capturado por CubeCamera, recapturado apenas quando o foco se desloca ou o céu muda, para evitar picos. |
| `camera.js` | `TPSCamera` (sobre o ombro, com colisão, ADS e shake baseado em trauma) e `CinematicDirector` (dolly, tracking, orbit, crane, zoom, com letterbox). |

## Animação (`js/anim`) — prioridade máxima

| Módulo | Responsabilidade |
|---|---|
| `skins.js` | Definição das skins (cores, cabelo, acessórios) e dos tipos de corpo (padrão, esguio, robusto, baixo) usados no retargeting. |
| `rig.js` | Personagem modelado por partes com geometria de alta densidade (LatheGeometry/Capsule com edge loops nas articulações) e esqueleto hierárquico de 22 ossos. Três níveis de LOD (THREE.LOD) com troca por distância. |
| `ik.js` | IK analítico de dois ossos (braços e pernas, com pole vector), foot-planting com raycast no terreno e ajuste da pélvis. |
| `clips.js` | Clips em keyframes (curvas cúbicas com ease): idle com respiração e micro-movimentos, walk, run, sprint, agachado, salto, queda livre, planador, recarga (por arma), troca de arma, golpe de picareta, construção, dano, morte e 10 emotes. |
| `animator.js` | Blend tree 2D (velocidade × direção) para locomoção com sincronização de fase, camadas (corpo inteiro, tronco superior com máscara, aditiva), crossfade entre estados, aim offset (pitch/yaw distribuído pela coluna), recoil com mola e mãos presas à arma por IK (grip e foregrip). |
| `face.js` | Blend shapes faciais por morph targets: piscar, sobrancelhas, sorriso, raiva, surpresa, tristeza; visemas (A, E, I, O, U, M/B/P, F/V) para lip sync gerado a partir do texto. Olhar segue o alvo (look-at com limites). |
| `secondary.js` | Física secundária com molas (Verlet): cabelo, capa, mochila, jiggle muscular e balanço de acessórios, sob a influência do vento global. |

Retargeting: os clips são definidos em rotações locais normalizadas e aplicados a qualquer skin/tipo de corpo. O IK corrige comprimentos de membro diferentes (os pés ficam no chão e as mãos na arma).

## Jogo (`js/game`)

| Módulo | Responsabilidade |
|---|---|
| `world.js` | Ilha com terreno em heightfield, lago com água em shader (reflexo e espuma), casas, árvores e relva instanciadas com vento, baús, pickups e tempestade. |
| `physics.js` | Corpos com gravidade, colisão contra caixas/estruturas e terreno, rigid bodies simples (caixas e detritos) e line-of-sight. |
| `weapons.js` | Modelos de armas detalhados (fuzil, espingarda, sniper, SMG, picareta) com peças móveis (ferrolho, pump, carregador) e marcadores (grip, foregrip, cano, mira, ejeção). |
| `actor.js` | Personagem jogável ou bot: inventário, vida/escudo, materiais, estados (autocarro, queda livre, planador, chão). |
| `ai.js` | IA por utilidade (fugir, curar, combater, saquear, investigar, vaguear), com tempo de reação, erro de mira, rajadas, strafe, salto e construção defensiva. `LobbyNPC`: emotes, falas com lip sync e balões. |
| `match.js` | Partida battle royale: autocarro, salto, construção (parede/rampa/chão/telhado, com dano e detritos), hitscan com queda de dano e headshots, tempestade, killfeed, HUD, minimapa e cinemática de vitória. O terreno é intersetado analiticamente (ray-march no heightfield) em vez de raycast em 28 mil triângulos. |
| `lobby.js` | Lobby ao estilo Fortnite: fundo em gradiente animado, palco, 3 luzes, squad de 4, arrastar para rodar e câmera cinematográfica. |
| `studio.js` | Estúdio/preview: OrbitControls (zoom, pan, rotação com damping), esferas PBR, passadeira de locomoção, ações, emotes, expressões, lip sync, overlay de esqueleto, física secundária, LOD, comparativo ANTES × DEPOIS, modos de visualização, qualidade, DOF, clima, hora, relâmpagos, caixas com física, partículas e câmera cinematográfica. |

## Performance (medida em CPU headless, SwiftShader)
- Lógica da partida com 12 atores: cerca de 2–4 ms por frame (animação 1,2–2,7 ms, raycasts 0,1–0,3 ms depois da otimização do terreno; antes eram 4,2 ms).
- A GPU fica com a renderização. A resolução dinâmica e os presets garantem margem para os 60 fps em hardware comum. No preset "ultra" (SSR + GTAO + DOF) é preciso uma GPU dedicada.

## Limitações honestas
- "Ray-tracing": aproximação em espaço de ecrã (SSR + GTAO), não path tracing real.
- Sem motion capture: keyframes à mão + procedural (IK, molas, respiração).
- Texturas procedurais de 512–2048 px (não 4K), para manter o carregamento instantâneo sem ficheiros externos.
- SSS da pele é uma aproximação (transmissão + sheen), não difusão real em subsuperfície.
- Multiplayer (Firebase) não está ligado; os adversários são bots.
