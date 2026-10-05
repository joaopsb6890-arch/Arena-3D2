// ============================================================
// MOBILE CONTROLS v25 — controlos táteis para telemóvel/tablet
// Joystick virtual + botões de ação. Ativa-se automaticamente
// em dispositivos táteis ou ecrãs < 700px.
// ============================================================

export class MobileControls {
  constructor(match) {
    this.m = match;
    this.active = this._detect();
    if (!this.active) return;
    this._create();
    this._bind();
  }

  _detect() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (innerWidth < 700);
  }

  _create() {
    const css = document.createElement('style');
    css.textContent = `
      #mobile-controls{position:fixed;inset:0;z-index:20;pointer-events:none;display:none}
      #mobile-controls.on{display:block}
      #mc-joy{position:absolute;left:24px;bottom:120px;width:140px;height:140px;pointer-events:auto;touch-action:none}
      #mc-joy-ring{width:100%;height:100%;border-radius:50%;background:rgba(168,85,247,.12);border:2px solid rgba(168,85,247,.3)}
      #mc-joy-knob{position:absolute;left:50%;top:50%;width:56px;height:56px;border-radius:50%;background:rgba(168,85,247,.4);border:2px solid rgba(168,85,247,.6);transform:translate(-50%,-50%);transition:transform .05s}
      .mc-btn{position:absolute;width:64px;height:64px;border-radius:50%;background:rgba(15,10,35,.6);border:2px solid rgba(168,85,247,.4);color:#fff;font-size:24px;display:flex;align-items:center;justify-content:center;pointer-events:auto;touch-action:none;user-select:none;font-weight:800}
      .mc-btn:active{background:rgba(168,85,247,.5);transform:scale(.9)}
      #mc-jump{right:24px;bottom:120px;width:72px;height:72px;font-size:28px}
      #mc-fire{right:96px;bottom:90px;width:72px;height:72px;background:rgba(220,38,38,.5);border-color:rgba(248,113,113,.6);font-size:22px}
      #mc-aim{right:24px;bottom:200px;width:60px;height:60px;font-size:20px}
      #mc-build{right:96px;bottom:200px;width:56px;height:56px;font-size:22px}
      #mc-reload{right:160px;bottom:120px;width:56px;height:56px;font-size:20px}
      #mc-interact{right:24px;bottom:280px;width:56px;height:56px;font-size:18px}
      #mc-slots{position:absolute;left:50%;bottom:24px;transform:translateX(-50%);display:flex;gap:8px;pointer-events:auto}
      #mc-slots .mc-slot{width:48px;height:48px;border-radius:8px;background:rgba(15,10,35,.6);border:2px solid rgba(168,85,247,.3);color:#fff;font-size:18px;display:flex;align-items:center;justify-content:center;font-weight:800;touch-action:none}
      #mc-slots .mc-slot.active{border-color:rgba(168,85,247,.8);background:rgba(168,85,247,.3)}
      #mc-look{position:absolute;right:0;top:0;width:50%;height:60%;pointer-events:auto;touch-action:none}
    `;
    document.head.appendChild(css);

    const div = document.createElement('div');
    div.id = 'mobile-controls';
    div.innerHTML = `
      <div id="mc-joy"><div id="mc-joy-ring"></div><div id="mc-joy-knob"></div></div>
      <div id="mc-look"></div>
      <div class="mc-btn" id="mc-jump">⬆</div>
      <div class="mc-btn" id="mc-fire">🔫</div>
      <div class="mc-btn" id="mc-aim">🎯</div>
      <div class="mc-btn" id="mc-build">🔧</div>
      <div class="mc-btn" id="mc-reload">🔄</div>
      <div class="mc-btn" id="mc-interact">E</div>
      <div id="mc-slots"></div>
    `;
    document.body.appendChild(div);
    this.el = div;
  }

  _bind() {
    const m = this.m;
    // Joystick
    const joy = document.getElementById('mc-joy');
    const knob = document.getElementById('mc-joy-knob');
    let joyActive = false, joyCx = 0, joyCy = 0, joyX = 0, joyY = 0;
    const joyStart = (e) => {
      e.preventDefault(); joyActive = true;
      const r = joy.getBoundingClientRect();
      joyCx = r.left + r.width / 2; joyCy = r.top + r.height / 2;
    };
    const joyMove = (e) => {
      if (!joyActive) return;
      e.preventDefault();
      const t = e.touches ? e.touches[0] : e;
      const dx = t.clientX - joyCx, dy = t.clientY - joyCy;
      const max = 60, d = Math.hypot(dx, dy);
      const cl = d > max ? max / d : 1;
      const nx = dx * cl / max, ny = dy * cl / max;
      knob.style.transform = `translate(calc(-50% + ${nx * max}px), calc(-50% + ${ny * max}px))`;
      joyX = nx; joyY = -ny; // inverter Y para frente = positivo
      // aplicar ao match
      if (m && m.player && m.player.alive) {
        m.player.moveInput.set(joyX, joyY);
        m.player.sprint = joyY > 0.6 && !m.player.aiming;
      }
    };
    const joyEnd = (e) => {
      e.preventDefault(); joyActive = false;
      knob.style.transform = 'translate(-50%,-50%)';
      joyX = 0; joyY = 0;
      if (m && m.player) m.player.moveInput.set(0, 0);
    };
    joy.addEventListener('touchstart', joyStart, { passive: false });
    joy.addEventListener('touchmove', joyMove, { passive: false });
    joy.addEventListener('touchend', joyEnd, { passive: false });
    joy.addEventListener('mousedown', joyStart);
    joy.addEventListener('mousemove', joyMove);
    joy.addEventListener('mouseup', joyEnd);

    // Look (lado direito)
    const look = document.getElementById('mc-look');
    let lookLast = null;
    const lookMove = (e) => {
      e.preventDefault();
      const t = e.touches ? e.touches[0] : e;
      if (lookLast) {
        const dx = t.clientX - lookLast.clientX;
        const dy = t.clientY - lookLast.clientY;
        if (m && m.tps) {
          m.tps.yaw -= dx * 0.005 * (m.app.settings.sens || 1);
          m.tps.pitch -= dy * 0.005 * (m.app.settings.sens || 1);
          m.tps.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, m.tps.pitch));
        }
      }
      lookLast = { clientX: t.clientX, clientY: t.clientY };
    };
    const lookEnd = (e) => { e.preventDefault(); lookLast = null; };
    look.addEventListener('touchstart', (e) => { e.preventDefault(); lookLast = null; }, { passive: false });
    look.addEventListener('touchmove', lookMove, { passive: false });
    look.addEventListener('touchend', lookEnd, { passive: false });

    // Botões
    const btn = (id, action) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); action(true); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); action(false); }, { passive: false });
    };
    btn('mc-jump', (down) => { if (m && m.player) { m.player.jumpHeld = down; if (down) m.player.requestJump(); } });
    btn('mc-fire', (down) => { if (m) m.mouse.l = down; });
    btn('mc-aim', (down) => { if (m && m.player) m.player.aiming = down && m.player.weaponType !== 'pickaxe'; });
    btn('mc-build', () => { if (m) { m.build.on = !m.build.on; m.toast(m.build.on ? 'Construção' : 'Combate'); } });
    btn('mc-reload', () => { if (m && m.player) m.player.reload(); });
    btn('mc-interact', () => { if (m) m.interact(); });

    // Slots
    const slots = document.getElementById('mc-slots');
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('div');
      s.className = 'mc-slot';
      s.textContent = i + 1;
      s.addEventListener('touchstart', (e) => { e.preventDefault(); if (m && m.player) m.player.equip(i); }, { passive: false });
      slots.appendChild(s);
    }
  }

  show(on) {
    if (!this.active || !this.el) return;
    this.el.classList.toggle('on', on);
  }

  update() {
    // Atualizar slots visuais
    if (!this.active || !this.m || !this.m.player) return;
    const slots = document.getElementById('mc-slots');
    if (!slots) return;
    const P = this.m.player;
    for (let i = 0; i < 5; i++) {
      const el = slots.children[i];
      if (el) el.classList.toggle('active', i === P.slot);
    }
  }
}
