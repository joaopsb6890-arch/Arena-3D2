// ============================================================
// LIVE EVENT SYSTEM (v23) — eventos ao vivo com timer,
// progressão e recompensas. Eventos rodam em ciclo automático.
// ============================================================
import { initFirebase, onAuthChange, loginWithGoogle, logout, isFirebaseReady } from '../firebase-auth.js';

const $ = (id) => document.getElementById(id);

const EVENTS = [
  { id: 'meteor', title: 'CHUVA DE METEOROS', desc: 'Meteóros estão a cair na ilha! Sobrevive e recolhe fragmentos estelares.', icon: 'M', duration: 180, reward: 500, color: 0xff6b35 },
  { id: 'goldrush', title: 'CORRIDA DO OURO', desc: 'Baús dourados apareceram pelo mapa. Encontra-os antes dos outros!', icon: '$', duration: 150, reward: 400, color: 0xfbbf24 },
  { id: 'night', title: 'NOITE DOS ZUMBIS', desc: 'Hordas de zumbis surgem à noite. Derrota o máximo que conseguires!', icon: 'Z', duration: 200, reward: 600, color: 0x6b21a8 },
  { id: 'race', title: 'GRANDE CORRIDA', desc: 'Corre pela ilha de veículo em veículo. Chega à meta primeiro!', icon: 'R', duration: 120, reward: 450, color: 0x22c55e },
  { id: 'storm', title: 'TEMPESTADE PERFEITA', desc: 'A tempestade fecha mais rápido que nunca. Sobrevive até ao fim!', icon: 'S', duration: 160, reward: 550, color: 0x3b82f6 }
];

let currentEvent = null, eventT = 0, eventPhase = 'waiting'; // waiting → active → ended
let nextEventTime = 0, uiBound = false;

function pickEvent(){
  return EVENTS[Math.floor(Math.random() * EVENTS.length)];
}

export function initLiveEvent(app){
  if(uiBound) return;
  uiBound = true;
  const stage = $('event-stage');
  const joinBtn = $('event-join-btn');
  let loginShown = false;

  // estado inicial
  nextEventTime = Date.now() + 60000 + Math.random() * 60000; // 1-2 min até o próximo evento

  function updateUI(){
    const now = Date.now();
    if(eventPhase === 'waiting'){
      const remaining = Math.max(0, nextEventTime - now);
      const pct = 100 - (remaining / 120000) * 100;
      if($('event-title')) $('event-title').textContent = 'PRÓXIMO EVENTO';
      if($('event-desc')) $('event-desc').textContent = 'Prepara-te! Um evento especial está a chegar.';
      if($('event-icon')) $('event-icon').textContent = '⏳';
      if($('event-timer')) $('event-timer').textContent = formatTime(remaining / 1000);
      if($('event-bar-fill')) $('event-bar-fill').style.width = Math.min(100, pct) + '%';
      if(joinBtn){ joinBtn.textContent = 'AGUARDAR'; joinBtn.disabled = true; }
      if(remaining <= 0){
        currentEvent = pickEvent();
        eventT = currentEvent.duration;
        eventPhase = 'active';
        if(stage){ stage.style.setProperty('--event-color', '#' + currentEvent.color.toString(16).padStart(6, '0')); }
      }
    } else if(eventPhase === 'active'){
      eventT -= 1;
      const pct = (currentEvent.duration - eventT) / currentEvent.duration * 100;
      if($('event-title')) $('event-title').textContent = currentEvent.title;
      if($('event-desc')) $('event-desc').textContent = currentEvent.desc;
      if($('event-icon')) $('event-icon').textContent = currentEvent.icon;
      if($('event-timer')) $('event-timer').textContent = formatTime(eventT);
      if($('event-bar-fill')) $('event-bar-fill').style.width = pct + '%';
      if(joinBtn){ joinBtn.textContent = 'PARTICIPAR'; joinBtn.disabled = false; }
      if(stage){ stage.style.setProperty('--event-color', '#' + currentEvent.color.toString(16).padStart(6, '0')); stage.classList.add('active'); }
      if(eventT <= 0){
        eventPhase = 'ended';
        if(stage) stage.classList.remove('active');
        // recompensa
        if(app && app.career){
          app.career.vbucks = (app.career.vbucks || 0) + currentEvent.reward;
          app.store && app.store.set('career', app.career);
          app.toastUI && app.toastUI('Evento terminado! +' + currentEvent.reward + ' V-Bucks');
        }
        nextEventTime = Date.now() + 90000 + Math.random() * 60000;
        setTimeout(() => { eventPhase = 'waiting'; }, 5000);
      }
    } else if(eventPhase === 'ended'){
      if($('event-title')) $('event-title').textContent = 'EVENTO TERMINADO';
      if($('event-desc')) $('event-desc').textContent = 'Recompensa entregue! Próximo evento em breve.';
      if($('event-icon')) $('event-icon').textContent = '✅';
      if($('event-timer')) $('event-timer').textContent = '';
      if(joinBtn){ joinBtn.textContent = 'AGUARDAR'; joinBtn.disabled = true; }
    }
  }

  if(joinBtn){
    joinBtn.addEventListener('click', async () => {
      if(eventPhase !== 'active') return;
      // tentar login Google primeiro
      if(!loginShown){
        loginShown = true;
        const overlay = $('login-overlay');
        if(overlay){ overlay.classList.remove('hide'); }
        return;
      }
    });
  }

  // login Google
  const loginBtn = $('google-login-btn');
  const skipBtn = $('skip-login-btn');
  const loginOverlay = $('login-overlay');
  if(loginBtn){
    loginBtn.addEventListener('click', async () => {
      loginBtn.textContent = 'A ligar...';
      const result = await loginWithGoogle();
      if(result.ok){
        if(loginOverlay) loginOverlay.classList.add('hide');
        if(app && app.settings && result.user){
          app.settings.name = result.user.name;
          app.save && app.save();
          if($('player-name')) $('player-name').textContent = result.user.name;
          app.lobby && (app.lobby.playerName = result.user.name);
        }
        app.toastUI && app.toastUI('Login efetuado: ' + (result.user?.name || 'Jogador'));
      } else {
        const err = $('login-error');
        if(err){ err.textContent = result.error || 'Erro no login'; err.classList.remove('hide'); }
        loginBtn.textContent = 'Entrar com Google';
      }
    });
  }
  if(skipBtn){
    skipBtn.addEventListener('click', () => {
      if(loginOverlay) loginOverlay.classList.add('hide');
    });
  }

  // verificar auth ao iniciar
  onAuthChange((user) => {
    if(user && app && app.settings){
      app.settings.name = user.name;
      app.save && app.save();
      if($('player-name')) $('player-name').textContent = user.name;
    }
  });

  setInterval(updateUI, 1000);
  updateUI();
}

function formatTime(s){
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60), ss = s % 60;
  return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
}
