// ============================================================
// v22: sistemas da aplicação (fora da partida)
//  • música dinâmica procedural (lobby / exploração / queda / tensão / combate)
//  • acessibilidade: filtros para daltonismo, escala da interface, legendas, remapeamento de teclas
//  • idiomas: PT, EN, ES, FR, DE (interface principal)
//  • cosméticos extra: mochila (back bling), spray, wrap de arma
//  • ranking Elo com divisões + classificação na Carreira
// ============================================================
import { BACKBLINGS, WRAPS } from './game/cosmetics22.js';
import { SPRAYS, division, DIVISIONS } from './game/sys22.js';

const $ = (id) => document.getElementById(id);

// ---------------- música ----------------
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
const PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];   // Lá m – Fá – Dó – Sol
const MIX = {   //        pad   bass  arp   kick  hat   snare drone
  lobby:   [0.35, 0.5, 0.25, 0.55, 0.25, 0.25, 0],
  explore: [0.3, 0.18, 0.1, 0, 0.08, 0, 0],
  drop:    [0.35, 0.3, 0.3, 0.3, 0.2, 0, 0],
  tension: [0.12, 0.35, 0, 0.35, 0.2, 0, 0.35],
  combat:  [0.15, 0.55, 0.18, 0.7, 0.35, 0.45, 0.1],
  calm:    [0.25, 0, 0, 0, 0, 0, 0]
};
export class Music {
  constructor(app){ this.app = app; this.state = 'lobby'; this.step = 0; this.timer = null; this.lv = [0, 0, 0, 0, 0, 0, 0]; }
  _init(){
    const A = this.app.audio; if(this.ctx || !A.ctx) return !!this.ctx;
    const c = this.ctx = A.ctx; this.out = c.createGain(); this.out.gain.value = this.app.settings.music ?? 0.35; this.out.connect(A.master || c.destination);
    this.ch = MIX.lobby.map(() => { const g = c.createGain(); g.gain.value = 0; g.connect(this.out); return g; });
    const nb = this.noise = c.createBuffer(1, c.sampleRate * 0.3, c.sampleRate); const d = nb.getChannelData(0); for(let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.timer = setInterval(() => this._tick(), 125);
    return true;
  }
  setVolume(v){ if(this.out) this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2); }
  setState(s){ if(s === this.state) return; this.state = s; }
  _osc(type, f, t, dur, ch, vol, attack){ const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + (attack || 0.01)); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); o.connect(g); g.connect(this.ch[ch]); o.start(t); o.stop(t + dur + 0.05); }
  _noise(t, dur, ch, vol, hp){ const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noise; f.type = 'highpass'; f.frequency.value = hp; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f); f.connect(g); g.connect(this.ch[ch]); s.start(t); s.stop(t + dur); }
  _tick(){
    if(!this.ctx || this.ctx.state !== 'running' || document.hidden) return;
    const c = this.ctx, t = c.currentTime + 0.05, mx = MIX[this.state] || MIX.explore;
    mx.forEach((v, i) => { this.lv[i] += (v - this.lv[i]) * 0.08; this.ch[i].gain.setTargetAtTime(this.lv[i], c.currentTime, 0.1); });
    const s = this.step++ % 128, bar = Math.floor(s / 32) % 4, ch = PROG[bar], b = s % 32;
    if(b === 0) ch.forEach(n => this._osc('triangle', NOTE(n), t, 3.9, 0, 0.12, 0.6));
    if(s % 8 === 0) this._osc('triangle', NOTE(ch[0] - 24), t, 0.5, 1, 0.5);
    if(s % 8 === 6 && this.state === 'combat') this._osc('triangle', NOTE(ch[0] - 24), t, 0.25, 1, 0.4);
    if(s % 2 === 0) this._osc('square', NOTE(ch[(s / 2) % 3] + 12), t, 0.12, 2, 0.05);
    if(s % 8 === 0 || (this.state === 'tension' && s % 8 === 2)){ const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25); o.connect(g); g.connect(this.ch[3]); o.start(t); o.stop(t + 0.3); }
    if(s % 4 === 2) this._noise(t, 0.05, 4, 0.25, 7000);
    if(s % 16 === 8) this._noise(t, 0.18, 5, 0.5, 1500);
    if(b === 0) this._osc('sawtooth', NOTE(33), t, 4, 6, 0.06, 1.5);
  }
}

// ---------------- daltonismo (daltonize: M = I + E·(I − S)) ----------------
const SIM = { protan: [[0.567, 0.433, 0], [0.558, 0.442, 0], [0, 0.242, 0.758]], deutan: [[0.625, 0.375, 0], [0.7, 0.3, 0], [0, 0.3, 0.7]], tritan: [[0.95, 0.05, 0], [0, 0.433, 0.567], [0, 0.475, 0.525]] };
const E = [[0, 0, 0], [0.7, 1, 0], [0.7, 0, 1]];
function daltonize(S){ const IS = [0, 1, 2].map(i => [0, 1, 2].map(j => (i === j ? 1 : 0) - S[i][j])); return [0, 1, 2].map(i => [0, 1, 2].map(j => (i === j ? 1 : 0) + E[i].reduce((a, e, k) => a + e * IS[k][j], 0))); }
function cbFilters(){
  if($('cb-svg')) return; const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'); svg.id = 'cb-svg'; svg.setAttribute('width', 0); svg.setAttribute('height', 0); svg.style.position = 'absolute';
  svg.innerHTML = Object.entries(SIM).map(([k, S]) => { const M = daltonize(S); return `<filter id="cb-${k}" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="${M.map(r => r.map(v => v.toFixed(3)).join(' ') + ' 0 0').join(' ')} 0 0 0 1 0"/></filter>`; }).join('');
  document.body.appendChild(svg);
}

// ---------------- idiomas ----------------
const LANGS = { pt: 'Português', en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch' };
const T = {
  'LOBBY': ['LOBBY', 'VESTÍBULO', 'SALON', 'LOBBY'], 'MULTIJOGADOR': ['MULTIPLAYER', 'MULTIJUGADOR', 'MULTIJOUEUR', 'MEHRSPIELER'], 'ARMÁRIO': ['LOCKER', 'TAQUILLA', 'CASIER', 'SPIND'],
  'LOJA': ['SHOP', 'TIENDA', 'BOUTIQUE', 'SHOP'], 'DESAFIOS': ['CHALLENGES', 'DESAFÍOS', 'DÉFIS', 'HERAUSFORDERUNGEN'], 'ESTÚDIO': ['STUDIO', 'ESTUDIO', 'STUDIO', 'STUDIO'],
  'CARREIRA': ['CAREER', 'CARRERA', 'CARRIÈRE', 'KARRIERE'], 'CONFIG': ['SETTINGS', 'AJUSTES', 'OPTIONS', 'OPTIONEN'], 'JOGAR': ['PLAY', 'JUGAR', 'JOUER', 'SPIELEN'], 'TROCAR': ['CHANGE', 'CAMBIAR', 'CHANGER', 'WECHSELN'],
  'MISSÕES DIÁRIAS': ['DAILY QUESTS', 'MISIONES DIARIAS', 'QUÊTES DU JOUR', 'TÄGLICHE AUFTRÄGE'], 'Ver todos os desafios': ['See all challenges', 'Ver todos los desafíos', 'Voir tous les défis', 'Alle Herausforderungen'],
  'NOVIDADES': ["WHAT'S NEW", 'NOVEDADES', 'NOUVEAUTÉS', 'NEUIGKEITEN'], 'Arraste o personagem para girar': ['Drag the character to rotate', 'Arrastra el personaje para girar', 'Fais glisser le personnage pour le tourner', 'Figur ziehen zum Drehen'],
  'Trajes': ['Outfits', 'Trajes', 'Tenues', 'Outfits'], 'Picaretas': ['Pickaxes', 'Picos', 'Pioches', 'Spitzhacken'], 'Planadores': ['Gliders', 'Planeadores', 'Planeurs', 'Gleiter'], 'Rastros': ['Contrails', 'Estelas', 'Traînées', 'Kondensstreifen'], 'Emotes': ['Emotes', 'Gestos', 'Emotes', 'Emotes'], 'Tipo de corpo': ['Body type', 'Tipo de cuerpo', 'Morphologie', 'Körpertyp'],
  'LOJA DE ITENS': ['ITEM SHOP', 'TIENDA DE OBJETOS', "BOUTIQUE D'OBJETS", 'ARTIKELSHOP'], 'Destaques': ['Featured', 'Destacados', 'En vedette', 'Empfohlen'], 'Diário': ['Daily', 'Diario', 'Quotidien', 'Täglich'], 'Experimentar': ['Try on', 'Probar', 'Essayer', 'Anprobieren'], 'Fechar': ['Close', 'Cerrar', 'Fermer', 'Schließen'],
  'Solo': ['Solo', 'Solo', 'Solo', 'Solo'], 'Duo': ['Duos', 'Dúos', 'Duo', 'Duo'], 'Squad': ['Squads', 'Escuadrones', 'Section', 'Trupp'], 'Criativo': ['Creative', 'Creativo', 'Créatif', 'Kreativ'], 'Eventos': ['Events', 'Eventos', 'Événements', 'Events'],
  'Região': ['Region', 'Región', 'Région', 'Region'], 'Bots': ['Bots', 'Bots', 'Bots', 'Bots'], 'desligados': ['off', 'desactivados', 'désactivés', 'aus'], 'À PROCURA…': ['SEARCHING…', 'BUSCANDO…', 'RECHERCHE…', 'SUCHE…'],
  'AMIGOS': ['FRIENDS', 'AMIGOS', 'AMIS', 'FREUNDE'], 'ENVIAR': ['SEND', 'ENVIAR', 'ENVOYER', 'SENDEN'], 'SALAS PÚBLICAS': ['PUBLIC ROOMS', 'SALAS PÚBLICAS', 'SALONS PUBLICS', 'ÖFFENTLICHE RÄUME'], 'Atualizar': ['Refresh', 'Actualizar', 'Actualiser', 'Aktualisieren'],
  'ENTRAR': ['JOIN', 'ENTRAR', 'REJOINDRE', 'BEITRETEN'], 'CRIAR SALA': ['CREATE ROOM', 'CREAR SALA', 'CRÉER UN SALON', 'RAUM ERSTELLEN'], 'Nome da sala': ['Room name', 'Nombre de la sala', 'Nom du salon', 'Raumname'], 'Modo': ['Mode', 'Modo', 'Mode', 'Modus'],
  'JOGADORES': ['PLAYERS', 'JUGADORES', 'JOUEURS', 'SPIELER'], 'INICIAR PARTIDA': ['START MATCH', 'INICIAR PARTIDA', 'LANCER LA PARTIE', 'MATCH STARTEN'], 'SAIR DA SALA': ['LEAVE ROOM', 'SALIR DE LA SALA', 'QUITTER LE SALON', 'RAUM VERLASSEN'],
  'CONFIGURAÇÕES': ['SETTINGS', 'AJUSTES', 'PARAMÈTRES', 'EINSTELLUNGEN'], 'Nome': ['Name', 'Nombre', 'Nom', 'Name'], 'Qualidade gráfica': ['Graphics quality', 'Calidad gráfica', 'Qualité graphique', 'Grafikqualität'], 'Sensibilidade do mouse': ['Mouse sensitivity', 'Sensibilidad del ratón', 'Sensibilité de la souris', 'Mausempfindlichkeit'],
  'Volume': ['Volume', 'Volumen', 'Volume', 'Lautstärke'], 'Clima da partida': ['Match weather', 'Clima de la partida', 'Météo', 'Wetter'], 'Hora do dia': ['Time of day', 'Hora del día', 'Heure', 'Tageszeit'], 'Controles': ['Controls', 'Controles', 'Commandes', 'Steuerung'],
  'Mostrar grupo no lobby': ['Show party in lobby', 'Mostrar grupo en el vestíbulo', 'Afficher le groupe', 'Gruppe in der Lobby zeigen'], 'Mostrar FPS / estatísticas (F8)': ['Show FPS / stats (F8)', 'Mostrar FPS / estadísticas (F8)', 'Afficher FPS / stats (F8)', 'FPS / Statistiken (F8)'],
  'Qualidade automática (desce se o FPS cair)': ['Auto quality (drops if FPS falls)', 'Calidad automática', 'Qualité automatique', 'Automatische Qualität'],
  'PAUSADO': ['PAUSED', 'PAUSA', 'PAUSE', 'PAUSIERT'], 'CONTINUAR': ['RESUME', 'CONTINUAR', 'REPRENDRE', 'FORTSETZEN'], 'SAIR DA PARTIDA': ['LEAVE MATCH', 'SALIR DE LA PARTIDA', 'QUITTER LA PARTIE', 'MATCH VERLASSEN'],
  '#1 VITÓRIA ROYALE': ['#1 VICTORY ROYALE', '#1 VICTORIA MAGISTRAL', '#1 TOP 1', '#1 SIEGESKÖNIGSKRONE'], 'JOGAR NOVAMENTE': ['PLAY AGAIN', 'JUGAR DE NUEVO', 'REJOUER', 'NOCHMAL SPIELEN'], 'VOLTAR AO LOBBY': ['BACK TO LOBBY', 'VOLVER AL VESTÍBULO', 'RETOUR AU SALON', 'ZURÜCK ZUR LOBBY'],
  'ELIMINADO': ['ELIMINATED', 'ELIMINADO', 'ÉLIMINÉ', 'ELIMINIERT'], 'Mais sorte na próxima': ['Better luck next time', 'Más suerte la próxima', 'Plus de chance la prochaine fois', 'Mehr Glück beim nächsten Mal'], 'VER REPLAY': ['WATCH REPLAY', 'VER REPETICIÓN', 'VOIR LE REPLAY', 'REPLAY ANSEHEN'],
  'Cancelar': ['Cancel', 'Cancelar', 'Annuler', 'Abbrechen'], 'CLIQUE PARA CONTINUAR': ['CLICK TO CONTINUE', 'HAZ CLIC PARA CONTINUAR', 'CLIQUE POUR CONTINUER', 'KLICKEN ZUM FORTFAHREN'],
  'ÔNIBUS DE BATALHA': ['BATTLE BUS', 'AUTOBÚS DE BATALLA', 'BUS DE COMBAT', 'SCHLACHTENBUS'], 'para saltar': ['to jump', 'para saltar', 'pour sauter', 'zum Springen'], 'RECARREGANDO': ['RELOADING', 'RECARGANDO', 'RECHARGEMENT', 'NACHLADEN'],
  'Parede': ['Wall', 'Pared', 'Mur', 'Wand'], 'Piso': ['Floor', 'Suelo', 'Sol', 'Boden'], 'Rampa': ['Ramp', 'Rampa', 'Rampe', 'Rampe'], 'Telhado': ['Roof', 'Tejado', 'Toit', 'Dach'], 'Madeira': ['Wood', 'Madera', 'Bois', 'Holz'], 'Editar': ['Edit', 'Editar', 'Modifier', 'Bearbeiten'],
  'ACESSIBILIDADE E IDIOMA': ['ACCESSIBILITY & LANGUAGE', 'ACCESIBILIDAD E IDIOMA', 'ACCESSIBILITÉ ET LANGUE', 'BARRIEREFREIHEIT & SPRACHE'], 'Idioma': ['Language', 'Idioma', 'Langue', 'Sprache'], 'Modo daltónico': ['Colourblind mode', 'Modo daltónico', 'Mode daltonien', 'Farbenblind-Modus'],
  'Escala da interface': ['UI scale', 'Escala de la interfaz', "Échelle de l'interface", 'UI-Skalierung'], 'Legendas de som (direção dos tiros, tempestade)': ['Sound captions (shots, storm)', 'Subtítulos de sonido', 'Sous-titres sonores', 'Geräusch-Untertitel'], 'Música': ['Music', 'Música', 'Musique', 'Musik'],
  'COSMÉTICOS EXTRA': ['EXTRA COSMETICS', 'COSMÉTICOS EXTRA', 'COSMÉTIQUES', 'EXTRA-KOSMETIK'], 'Mochila (back bling)': ['Back bling', 'Accesorio mochilero', 'Accessoire de dos', 'Rücken-Accessoire'], 'Spray (tecla U)': ['Spray (U key)', 'Grafiti (tecla U)', 'Tag (touche U)', 'Spray (Taste U)'], 'Wrap de arma': ['Weapon wrap', 'Envoltorio de arma', "Revêtement d'arme", 'Waffenlackierung'],
  'CONTROLOS (clica para mudar)': ['CONTROLS (click to change)', 'CONTROLES (clic para cambiar)', 'COMMANDES (clique pour changer)', 'STEUERUNG (zum Ändern klicken)'], 'Repor teclas': ['Reset keys', 'Restablecer teclas', 'Réinitialiser', 'Tasten zurücksetzen'],
  'RANKING': ['RANKED', 'CLASIFICATORIA', 'CLASSÉ', 'RANGLISTE'], 'CLASSIFICAÇÃO DA TEMPORADA': ['SEASON LEADERBOARD', 'CLASIFICACIÓN DE TEMPORADA', 'CLASSEMENT DE LA SAISON', 'SAISON-BESTENLISTE'],
  'PASSE': ['PASS', 'PASE', 'PASS', 'PASS'], 'EVENTO': ['EVENT', 'EVENTO', 'ÉVÉNEMENT', 'EREIGNIS'], 'PASSE DE BATALHA': ['BATTLE PASS', 'PASE DE BATALLA', 'PASSE DE COMBAT', 'KAMPFPASS'], 'EVENTO AO VIVO': ['LIVE EVENT', 'EVENTO EN VIVO', 'ÉVÉNEMENT EN DIRECT', 'LIVE-EREIGNIS'],
  'Entrar com Google': ['Sign in with Google', 'Iniciar sesión con Google', 'Se connecter avec Google', 'Mit Google anmelden'], 'Jogar sem conta': ['Play without account', 'Jugar sin cuenta', 'Jouer sans compte', 'Ohne Konto spielen'], 'PARTICIPAR': ['JOIN', 'PARTICIPAR', 'PARTICIPER', 'TEILNEHMEN']
};
const LI = { en: 0, es: 1, fr: 2, de: 3 };
function translate(lang){
  const li = LI[lang];
  const walk = (root) => { const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; while((n = it.nextNode())){
    if(n.parentElement && n.parentElement.closest('#hud, script, style, #chat-log, .no-i18n')) continue;
    const raw = n.nodeValue, k = n._pt ?? raw.trim(); if(!k) continue;
    if(n._pt === undefined){ if(!T[k]) continue; n._pt = k; }
    const out = li === undefined ? n._pt : (T[n._pt] ? T[n._pt][li] : n._pt); if(raw.trim() !== out) n.nodeValue = raw.replace(raw.trim(), out); } };
  walk(document.body);
  document.documentElement.lang = lang;
}

// ---------------- teclas remapeáveis ----------------
const ACTIONS = [['KeyW', 'Frente'], ['KeyS', 'Trás'], ['KeyA', 'Esquerda'], ['KeyD', 'Direita'], ['Space', 'Saltar'], ['ShiftLeft', 'Correr'], ['KeyC', 'Agachar / deslizar'], ['KeyR', 'Recarregar'], ['KeyQ', 'Construir'], ['KeyE', 'Interagir / reanimar'], ['KeyF', 'Lanterna / nitro'], ['KeyH', 'Poção de escudo'], ['KeyG', 'Kit médico'], ['KeyJ', 'Bandagem'], ['KeyO', 'Mini escudo'], ['KeyX', 'Granada'], ['KeyB', 'Emote'], ['KeyU', 'Spray'], ['KeyL', 'Marcar local'], ['KeyK', 'Falar (voz)'], ['KeyI', 'Inventário'], ['KeyM', 'Mapa']];
const keyName = (c) => c.replace(/^Key/, '').replace(/^Digit/, '').replace('ShiftLeft', 'Shift').replace('Space', 'Espaço').replace('ControlLeft', 'Ctrl').replace('AltLeft', 'Alt');

export function initApp22(app, store){
  const S = app.settings; S.music = S.music ?? 0.35; S.lang = S.lang || 'pt'; S.cb = S.cb || 'nenhum'; S.uiScale = S.uiScale || 1; S.captions = S.captions ?? true; S.backbling = S.backbling || 'nenhuma'; S.spray = S.spray || 'gg'; S.wrap = S.wrap || 'nenhum'; S.keymap = S.keymap || {};
  app.keymap = S.keymap; app.store = store;
  app.music = new Music(app);
  const startMusic = () => { if(app.music._init()) { removeEventListener('pointerdown', startMusic); removeEventListener('keydown', startMusic); } };
  addEventListener('pointerdown', startMusic); addEventListener('keydown', startMusic);
  cbFilters();
  const applyA11y = () => {
    const f = S.cb !== 'nenhum' ? `url(#cb-${S.cb})` : ''; const st = $('stage'); if(st) st.style.filter = f; const mm = $('minimap'); if(mm) mm.style.filter = f;
    document.documentElement.style.setProperty('--ui-scale', S.uiScale);
  };
  applyA11y();
  // ---- UI nas configurações ----
  const card = document.querySelector('#panel-settings .card-panel'); if(!card) return;
  const opt = (o, v) => Object.entries(o).map(([k, x]) => `<option value="${k}"${k === v ? ' selected' : ''}>${typeof x === 'string' ? x : x.n}</option>`).join('');
  const box = document.createElement('div'); box.className = 'set22';
  box.innerHTML = `<h3>ACESSIBILIDADE E IDIOMA</h3>
    <label><span>Idioma</span><select id="set-lang">${opt(LANGS, S.lang)}</select></label>
    <label><span>Modo daltónico</span><select id="set-cb">${opt({ nenhum: 'Desligado', protan: 'Protanopia', deutan: 'Deuteranopia', tritan: 'Tritanopia' }, S.cb)}</select></label>
    <label><span>Escala da interface</span><input id="set-uiscale" type="range" min="0.75" max="1.35" step="0.05" value="${S.uiScale}"></label>
    <label><span>Música</span><input id="set-music" type="range" min="0" max="1" step="0.05" value="${S.music}"></label>
    <label class="chk"><input id="set-captions" type="checkbox"${S.captions ? ' checked' : ''}><span>Legendas de som (direção dos tiros, tempestade)</span></label>
    <h3>CONTA</h3>
    <div id="account-section" class="account-section"><button id="set-google-login" class="login-btn-small">Entrar com Google</button><span id="account-status" class="account-status">Sessão local</span></div>
    <h3>COSMÉTICOS EXTRA</h3>
    <label><span>Mochila (back bling)</span><select id="set-bb">${opt(BACKBLINGS, S.backbling)}</select></label>
    <label><span>Spray (tecla U)</span><select id="set-spray">${opt(SPRAYS, S.spray)}</select></label>
    <label><span>Wrap de arma</span><select id="set-wrap">${opt(WRAPS, S.wrap)}</select></label>
    <h3>CONTROLOS (clica para mudar)</h3><div id="remap" class="remap"></div><button class="ghost-btn" id="remap-reset">Repor teclas</button>`;
  const keys = card.querySelector('.keys'); card.insertBefore(box, keys || null);
  const save = () => { app.save(); };
  $('set-lang').onchange = (e) => { S.lang = e.target.value; save(); translate(S.lang); };
  $('set-cb').onchange = (e) => { S.cb = e.target.value; save(); applyA11y(); };
  $('set-uiscale').oninput = (e) => { S.uiScale = +e.target.value; save(); applyA11y(); };
  $('set-music').oninput = (e) => { S.music = +e.target.value; save(); app.music.setVolume(S.music); };
  $('set-captions').onchange = (e) => { S.captions = e.target.checked; save(); };
  // v23: login Google nas configurações
  const gBtn = $('set-google-login');
  if(gBtn){ gBtn.onclick = async () => {
    gBtn.textContent = 'A ligar...';
    const { loginWithGoogle } = await import('./firebase-auth.js');
    const result = await loginWithGoogle();
    if(result.ok){
      const status = $('account-status'); if(status) status.textContent = 'Ligado: ' + (result.user?.name || 'Jogador');
      gBtn.textContent = 'Terminar sessão';
      if(result.user && S){ S.name = result.user.name; save(); if($('player-name')) $('player-name').textContent = result.user.name; if(app.lobby) app.lobby.playerName = result.user.name; }
      app.toastUI && app.toastUI('Login efetuado: ' + (result.user?.name || 'Jogador'));
    } else {
      gBtn.textContent = 'Entrar com Google';
      const status = $('account-status'); if(status) status.textContent = result.error || 'Erro no login';
    }
  }; }
  $('set-bb').onchange = (e) => { S.backbling = e.target.value; save(); if(app.lobby && app.lobby.player){ import('./game/cosmetics22.js').then(M => M.attachBackBling(app.lobby.player.ch, S.backbling)); } };
  $('set-spray').onchange = (e) => { S.spray = e.target.value; save(); };
  $('set-wrap').onchange = (e) => { S.wrap = e.target.value; save(); };
  const renderRemap = () => {
    const rev = {}; Object.entries(S.keymap).forEach(([phys, log]) => rev[log] = phys);
    $('remap').innerHTML = ACTIONS.map(([code, n]) => `<button data-k="${code}"><span>${n}</span><b>${keyName(rev[code] || code)}</b></button>`).join('');
  };
  renderRemap();
  $('remap').onclick = (e) => {
    const b = e.target.closest('button'); if(!b) return; const log = b.dataset.k; b.querySelector('b').textContent = '…'; b.classList.add('wait');
    const cap = (ev) => { ev.preventDefault(); ev.stopPropagation(); removeEventListener('keydown', cap, true);
      if(ev.code !== 'Escape'){ for(const [p, l] of Object.entries(S.keymap)) if(l === log || p === ev.code) delete S.keymap[p]; if(ev.code !== log) S.keymap[ev.code] = log; save(); }
      renderRemap(); };
    addEventListener('keydown', cap, true);
  };
  $('remap-reset').onclick = () => { for(const k of Object.keys(S.keymap)) delete S.keymap[k]; save(); renderRemap(); };
  // ---- ranking na carreira ----
  const renderRank = () => {
    const pc = $('panel-career'); if(!pc || app.screen !== 'career') return;
    let el = $('rank22'); if(!el){ el = document.createElement('div'); el.id = 'rank22'; el.className = 'rank22'; (pc.querySelector('.card-panel') || pc).appendChild(el); }
    const c = app.career, elo = c.elo || 1000, wk = Math.floor(Date.now() / 6048e5);
    let seed = wk * 9301 + 49297; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const names = ['Raptor', 'Neblina', 'Zé_Pro', 'Tilted', 'Lusitano', 'Kuroi', 'Nova', 'Bacalhau', 'Faísca', 'Vortex', 'Mira', 'Trovão', 'Gaivota', 'Sardinha'];
    const rows = names.map(n => ({ n, e: Math.round(1150 + rnd() * 1000) })); rows.push({ n: app.settings.name || 'Tu', e: elo, me: true }); rows.sort((a, b) => b.e - a.e);
    const pos = rows.findIndex(r => r.me) + 1;
    el.innerHTML = `<h3>RANKING</h3><div class="rk-top"><b>${division(elo)}</b><span>${elo} pontos · melhor ${c.eloBest || elo}</span></div>
      <div class="rk-bar">${DIVISIONS.map(d => `<i class="${elo >= d[0] ? 'on' : ''}">${d[1]}</i>`).join('')}</div>
      <h3>CLASSIFICAÇÃO DA TEMPORADA</h3><ol class="rk-list">${rows.slice(0, 10).map((r, i) => `<li class="${r.me ? 'me' : ''}"><span>${i + 1}. ${r.n}</span><em>${division(r.e)}</em><b>${r.e}</b></li>`).join('')}${pos > 10 ? `<li class="me"><span>${pos}. ${app.settings.name || 'Tu'}</span><em>${division(elo)}</em><b>${elo}</b></li>` : ''}</ol><small>Classificação semanal com rivais simulados; o teu Elo sobe/desce com a colocação e os abates.</small>`;
  };
  setInterval(renderRank, 1500);
  // ---- idioma ----
  if(S.lang !== 'pt'){ translate(S.lang); }
  let pend = null; new MutationObserver(() => { if(S.lang === 'pt' || app.match || pend) return; pend = setTimeout(() => { pend = null; translate(S.lang); }, 400); }).observe(document.body, { childList: true, subtree: true });
  app._translate = () => translate(S.lang);
}
