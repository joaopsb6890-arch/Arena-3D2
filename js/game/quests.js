// ============================================================
// MISSÕES (v17) — 3 missões diárias (mudam por dia) + desafios da temporada
// com progresso real guardado no navegador. Cada evento do jogo chama
// quests.add(tipo, n) e a missão concluída dá XP (sobe o nível da carreira).
// ============================================================
const KEY = 'fa_quests_v17';
export const QUEST_POOL = [
  { id: 'chest3',  k: 'chest',   n: 3,   xp: 300, t: 'Abre 3 baús' },
  { id: 'kill2',   k: 'kill',    n: 2,   xp: 400, t: 'Elimina 2 adversários' },
  { id: 'build25', k: 'build',   n: 25,  xp: 250, t: 'Constrói 25 peças' },
  { id: 'zip1',    k: 'zip',     n: 1,   xp: 200, t: 'Anda de tirolesa' },
  { id: 'dmg300',  k: 'damage',  n: 300, xp: 350, t: 'Causa 300 de dano' },
  { id: 'loc3',    k: 'loc',     n: 3,   xp: 300, t: 'Visita 3 locais com nome' },
  { id: 'fish2',   k: 'fish',    n: 2,   xp: 300, t: 'Pesca 2 peixes' },
  { id: 'harv300', k: 'harvest', n: 300, xp: 250, t: 'Recolhe 300 materiais' },
  { id: 'slide5',  k: 'slide',   n: 5,   xp: 200, t: 'Desliza 5 vezes' },
  { id: 'tac3',    k: 'tac',     n: 3,   xp: 250, t: 'Usa 3 itens táticos' },
  { id: 'llama1',  k: 'llama',   n: 1,   xp: 350, t: 'Abre uma lhama' },
  { id: 'edit5',   k: 'edit',    n: 5,   xp: 200, t: 'Edita 5 construções' },
  // v19
  { id: 'climb3',  k: 'climb',   n: 3,   xp: 250, t: 'Escala 3 vezes' },
  { id: 'rail2',   k: 'rail',    n: 2,   xp: 250, t: 'Desliza em 2 carris' },
  { id: 'forage5', k: 'forage',  n: 5,   xp: 200, t: 'Come 5 maçãs ou cogumelos' },
  { id: 'coin5',   k: 'coin',    n: 5,   xp: 300, t: 'Apanha 5 moedas de XP' },
  { id: 'upg1',    k: 'upgrade', n: 1,   xp: 300, t: 'Melhora uma arma na bancada' },
  // v20
  { id: 'drive3',  k: 'drive',   n: 3,   xp: 250, t: 'Conduz um quadriciclo (3 trechos)' },
  { id: 'cannon2', k: 'cannon',  n: 2,   xp: 250, t: 'Dispara-te de um canhão ou catapulta 2 vezes' },
  { id: 'portal2', k: 'portal',  n: 2,   xp: 200, t: 'Atravessa 2 portais' },
  { id: 'gnome1',  k: 'gnome',   n: 1,   xp: 300, t: 'Encontra um gnomo escondido' },
  { id: 'balloon1',k: 'balloon', n: 1,   xp: 200, t: 'Salta de um balão de ar quente' },
  { id: 'radar1',  k: 'radar',   n: 1,   xp: 150, t: 'Ativa uma torre de radar' }
];
export const SEASON = [
  { id: 's_kill25',  k: 'kill',    n: 25,   xp: 1500, t: 'Especialista', d: 'Elimina 25 adversários' },
  { id: 's_build300',k: 'build',   n: 300,  xp: 1200, t: 'Arquiteto',    d: 'Constrói 300 peças' },
  { id: 's_chest40', k: 'chest',   n: 40,   xp: 1200, t: 'Caça-tesouros', d: 'Abre 40 baús' },
  { id: 's_harv3k',  k: 'harvest', n: 3000, xp: 1000, t: 'Lenhador',     d: 'Recolhe 3000 materiais' },
  { id: 's_fish15',  k: 'fish',    n: 15,   xp: 1000, t: 'Pescador',     d: 'Pesca 15 peixes' },
  { id: 's_win1',    k: 'win',     n: 1,    xp: 2000, t: 'Vitória Royale', d: 'Ganha uma partida' },
  { id: 's_loc12',   k: 'loc',     n: 12,   xp: 1200, t: 'Explorador',   d: 'Visita 12 locais com nome' },
  { id: 's_climb30',  k: 'climb',   n: 30,   xp: 1200, t: 'Alpinista',    d: 'Escala 30 vezes' },
  { id: 's_coin40',   k: 'coin',    n: 40,   xp: 1500, t: 'Colecionador', d: 'Apanha 40 moedas de XP' }
];
function dayKey(){ const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function pickDaily(day){ let h = 0; for(const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0; const ids = QUEST_POOL.map(q => q.id), out = []; while(out.length < 3){ h = (h * 1103515245 + 12345) >>> 0; const id = ids[h % ids.length]; if(!out.includes(id)) out.push(id); } return out; }

export class Quests {
  constructor(app){
    this.app = app;
    let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch(e){}
    this.s = Object.assign({ day: '', daily: [], prog: {}, done: {} }, s);
    this._roll();
    this.onChange = null;
  }
  _roll(){ const d = dayKey(); if(this.s.day !== d){ this.s.day = d; this.s.daily = pickDaily(d); for(const q of QUEST_POOL){ delete this.s.prog[q.id]; delete this.s.done[q.id]; } this.save(); } }
  save(){ try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch(e){} }
  daily(){ this._roll(); return this.s.daily.map(id => QUEST_POOL.find(q => q.id === id)).filter(Boolean); }
  season(){ return SEASON; }
  prog(q){ return Math.min(q.n, this.s.prog[q.id] || 0); }
  isDone(q){ return !!this.s.done[q.id]; }
  /** evento do jogo → avança missões; devolve lista de missões concluídas agora */
  add(kind, n, match){
    n = n || 1; const done = [];
    for(const q of [...this.daily(), ...SEASON]){
      if(q.k !== kind || this.s.done[q.id]) continue;
      this.s.prog[q.id] = (this.s.prog[q.id] || 0) + n;
      if(this.s.prog[q.id] >= q.n){ this.s.done[q.id] = true; done.push(q); this.app.career.xp += q.xp; }
    }
    this._dirty = true;
    if(done.length){ this.save(); try { this.app.store && this.app.store.set('career', this.app.career); } catch(e){} if(match) done.forEach(q => match.questDone(q)); }
    else { clearTimeout(this._st); this._st = setTimeout(() => this.save(), 1500); }
    if(this.onChange) this.onChange();
    return done;
  }
}
