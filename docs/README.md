# Fortnite 3D Arena — v14 (arquitetura)

Projeto em Three.js r160 com ES modules.

- `index.html`: versão autónoma, com o JS e o CSS embutidos. Abre com duplo clique (file://). Precisa de internet para carregar o Three.js da CDN.
- `index-dev.html`: versão modular para desenvolvimento. Tem de ser servida por HTTP (`python -m http.server`), porque o browser bloqueia módulos em file://.
- Depois de editar `js/`, é preciso regenerar o `index.html` com `npm i esbuild && node tools/build.mjs`.
Parâmetros de URL: `?q=baixa|media|alta|ultra` (qualidade) e `?manual=1` (desliga o rAF, para testes automatizados via `window.__simulate(n, dt)`). A tecla F8 mostra FPS, draw calls e triângulos.

## Novidades v15 — Otimização, conteúdo e lobby

**Travadas corrigidas**
- Todos os shaders (armas, picaretas, planadores, construções, efeitos) são pré-compilados no ecrã de carregamento (`Match.warmup`), em vez de compilarem a meio da partida.
- As 4 luzes dinâmicas das explosões/tiros são criadas logo de início, por isso já não obrigam a recompilar todos os materiais.
- A resolução dinâmica já não reconstrói o compositor; o céu é pré-renderizado num cubemap e só é refeito quando muda (`?nobake` desliga).
- Menos lixo por frame: IK, armas e partículas reutilizam objetos (pool de partículas + cache de cores); HUD só toca no DOM quando o valor muda; minimapa a 15 Hz.
- Em Baixa, sheen/clearcoat e o grading são desligados; em Média, sombras PCF simples atualizadas em frames alternados.

**Modelos**
- Skinning suave nas articulações (ombro, cotovelo, pulso, anca, joelho, tornozelo, pescoço, tronco): acabou o aspeto de manequim quando os membros dobram.
- 6 trajes novos: Capitã Maré, Samurai Carmesim, Xerife, Arcano, Agente Sombra, Coelhinho, com acessórios novos (tricórnio, pala, kabuto, chapéu de cowboy, chapéu de mago, óculos de sol, gravata, orelhas com física).

**Cosméticos novos**
- Picaretas: Tridente dos Mares, Chave Inglesa, Guitarra-Machado, Pirulito Gigante.
- Planadores: Balões de Festa, Paraquedas Tático, Asas de Borboleta (batem), Disco Voador (luzes pulsantes).
- Rastros de queda: Relâmpago, Corações, Fumaça Ninja, Nevasca, Tóxico, Galáxia, com partículas próprias e um efeito de aterragem por rastro.
- Danças: Justiça Laranja, Passinho, Febre Disco, Galinha, Moinho, Toprock, Palmas no Alto. O emote equipado no armário é usado com a tecla B.

**Lobby**
- Céu novo com sol, nuvens estilizadas, ilhas no horizonte e mar; ilhas flutuantes com árvores; ônibus de batalha a atravessar o céu.
- Palco em dois níveis com anéis luminosos, hexágonos no chão e feixes de holofote; iluminação com menos luz ambiente (rostos com mais volume).

## Novidades v14 — Multijogador P2P
- **Aba MULTIJOGADOR** no lobby: lista de **salas públicas** (atualiza sozinha), **entrar por código** ou por link (`?sala=CODIGO`), **criar sala** (nome, modo, máx. 2–8, pública/privada, completar com bots). Na sala de espera aparecem os jogadores com ping, o chat e as definições do anfitrião, e só o anfitrião pode INICIAR.
- **Rede sem servidor de jogo** (`js/net/`), feita com WebRTC através do [Trystero](https://github.com/dmotz/trystero). A sinalização passa por relays Nostr públicos; depois disso os dados vão direto de navegador para navegador.
  - `net.js`:
    - `PublicLobby` é um canal público onde as salas se anunciam a cada 2,5 s. Uma sala que deixe de se anunciar sai da lista ao fim de 9 s.
    - `NetSession` gere a sala: roster, chat, ping e o arranque. O arranque envia modo, ordem dos atores, ângulo do ônibus, mapa e clima, para que todos os peers montem a mesma partida.
  - `netsync.js` (`NetSync`):
    - Envia instantâneos a 15 Hz (posição, velocidade, mira, modo de movimento, arma, estados), com interpolação de 100 ms.
    - Eventos: tiro, golpe de picareta, dano, morte, construção, dano em estrutura, baú, emote, tempestade e fim.
    - **Autoridade:** cada jogador manda no seu boneco e aplica o dano que recebe. O anfitrião manda nos bots e na tempestade.
  - `multiui.js` trata da interface.
  - Na partida, Enter abre o chat. O menu (Esc) não pausa o jogo online.
- **Gráficos leves**:
  - Um único passe de grading (contraste, saturação, tons quentes/frios, vinheta, nitidez que compensa a resolução dinâmica; sem nitidez em Baixa).
  - Oceano mais barato (Standard em vez de Physical/clearcoat), com cor por profundidade, ondulação e espuma animada na costa.
  - Variação macro e encostas terrosas no terreno, calculadas nas cores dos vértices, sem custo na GPU.
  - Relva com gradiente da raiz à ponta.
  - Sombras de contacto sob todos os personagens, num único InstancedMesh (1 draw call).
- **Limitações P2P honestas**:
  - O loot dos baús e do chão é gerado localmente em cada peer (o baú aberto fecha para todos, mas o conteúdo pode diferir).
  - Não há migração de anfitrião: se ele sair, a sala fecha.
  - Um separador em segundo plano é travado pelo navegador, o que atrasa os bots do anfitrião.
  - Algumas redes (CGNAT, empresa) precisam de TURN e podem não ligar.
  - Não há anti-batota: cada cliente é confiável.
  - A lista pública depende dos relays Nostr públicos estarem acessíveis.

## Novidades v13
- **7 modos de jogo** (cartão de modo no lobby → TROCAR): Battle Royale, Zero Construção, Blitz (tempestade 2,2× mais rápida, começa com fuzil), Mata-Mata em Equipa 6×6 (renascimento, 30 abates ou 6 min), Arsenal (cada abate troca a arma, termina com a picareta), Duelo 1×1 (melhor de 5 rondas) e Criativo. Regras em `js/game/modes.js` (`MODES` + `ModeRules`: equipas, spawn, renascimento, pontuação, fim de partida).
- **Equipas**: sem fogo amigo, bots aliados acompanham o jogador, anel colorido nos pés, nomes azuis/vermelhos, aliados no minimapa, placar no topo.
- **Modo Criativo / criador de mapas** (`js/game/creative.js`): ilha plana (ou ilha normal), 19 objetos (parede/piso/rampa/telhado em madeira, pedra ou metal, casa, cerca, árvore, pinheiro, rocha, arbusto, caixote, barril, poste de luz, baú, plataforma de salto, spawns neutro/azul/vermelho, arma no chão), barra 1-9, fantasma com encaixe na grelha, voo (F), girar (R), andar (Q/E), apagar (X/botão direito), desfazer (Ctrl+Z), até 600 objetos. Salvar/carregar (localStorage), exportar/importar JSON, **Testar mapa** e jogar mapas salvos a partir do seletor de modos.
- **Otimização**: personagens agora são 1 SkinnedMesh por material (47 draw calls por ator em vez de 109) e as casas são fundidas por material. Draw calls numa partida: ~982 → ~452. Correção de fuga: `FLATS` acumulava entradas a cada partida (heightAt ficava mais lento).
- **Modelos**: casas com caixilhos, portadas, floreiras, porta aberta com lanterna, degrau, cumeeira, telhas, chaminé e interior (mesa, cadeiras, tapete, estante); rochas com ruído fractal e musgo; árvores com galhos e 12 copas; pinheiros com 6 camadas serrilhadas.

## Novidades v12
- **Loja** (`game/cosmetics.js`, aba LOJA): rotação diária determinística (destaque + 8 itens), raridades, V-Bucks ganhos em partida (+50, +25/abate, +250 vitória), comprar/experimentar no personagem do lobby. Miniaturas 3D reais geradas por `game/thumbs.js` (renderizador próprio, 1 item por frame, cache).
- **Armário por categorias**: trajes (18, 6 novos: Astronauta, Ninja, Punk, DJ, Viking, Cyber), picaretas (7 modelos), planadores (5), rastros de queda (5), emotes (3 novos da loja).
- **Picaretas**: 7 estilos modelados, combo de 3 golpes (o 3º é pesado: 1,6× dano, +50% material), rastro do golpe (`engine/trail.js`), faíscas na cor da picareta, **pontos fracos** na coleta (acerto no círculo azul = crítico, dobro de material).
- **Queda**: queda livre com mergulho (W, até ~92/s) / frear (S) / inclinação (A/D); abrir planador manual com Espaço (abaixo de 240 m) ou automático a 70 m; abertura com mola; FOV, linhas de velocidade e tremor da câmera por velocidade; rastro nas mãos; pouso do planador e aterrissagem pesada; clipes busJump/deployGlider/launch/landGlide/landHeavy.
- **Sistemas de partida** (`game/systems.js`): plataformas de lançamento, entrega aérea com balão e sinalizador (bots também disputam), ouro (baús, abates, entregas) e **NPC Mercador** com fala + lip sync, cumprimento, olhar ao jogador, compra com E/T.
- **Bots**: loadouts cosméticos variados, emote após abate, usam plataformas e entregas.
- **NPCs do lobby**: conversam entre si (pergunta/resposta com olhar), copiam o emote do jogador, reagem à troca de skin.
- **Correção do rato**: o bloqueio já não cai para o "modo sem bloqueio" permanente após um erro; ao continuar, se o navegador recusar (Chrome recusa ~1 s depois de um Esc), aparece "CLIQUE PARA CONTINUAR" e o próximo clique volta a prender o rato. Sem bloqueio, a câmera só gira arrastando, nunca com o cursor solto.

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
