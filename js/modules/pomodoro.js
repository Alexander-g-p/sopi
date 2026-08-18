/* ============================================================
   SOPI · MÓDULO 5 · CRONÓMETRO (POMODORO)
   ------------------------------------------------------------
   Bloques de enfoque separados por descansos. El temporizador
   NO se detiene al cambiar de sección ni al recargar la página:
   el estado vive en `settings.pomodoro.running` (una marca de
   tiempo de fin), así que al volver sigue donde iba.

   Al terminar un enfoque:
     · se guarda la sesión en `pomodoros`
     · si había una tarea asociada, le suma un pomodoro
     · encadena automáticamente el descanso que toque

   Contrato con App:  { id, label, icon, mount(root), unmount() }
   ============================================================ */
(function () {
  'use strict';

  const { el, clear, $, $$ } = U;

  const MODES = {
    focus: { label: 'Enfoque',         short: 'Enfoque',  color: 'var(--red)',   key: 'focus' },
    short: { label: 'Descanso corto',  short: 'Descanso', color: 'var(--green)', key: 'shortBreak' },
    long:  { label: 'Descanso largo',  short: 'Descanso', color: 'var(--blue)',  key: 'longBreak' },
  };

  /* ---------------- Estado ---------------- */

  const S = {
    cfg: { focus: 25, shortBreak: 5, longBreak: 15, cycles: 4, sound: true, autoStart: true },
    mode: 'focus',
    running: false,
    endsAt: 0,          // ms epoch en el que termina
    leftMs: 0,          // restante cuando está en pausa
    startedAt: null,
    cycle: 0,           // enfoques completados en la ronda actual
    taskId: null,
    tasks: [],
    sessions: [],
    ticker: null,
    root: null,
    baseTitle: document.title,
  };

  const minutesOf = mode => S.cfg[MODES[mode].key] || 25;
  const totalMs   = mode => minutesOf(mode) * 60000;

  function remainingMs() {
    if (S.running) return Math.max(0, S.endsAt - Date.now());
    return S.leftMs;
  }

  const mmss = ms => {
    const s = Math.ceil(ms / 1000);
    return U.pad(Math.floor(s / 60)) + ':' + U.pad(s % 60);
  };

  /* ============================================================
     MONTAJE
     ============================================================ */

  async function mount(root) {
    S.root = root;
    clear(root);
    root.appendChild(el('section.pm', { id: 'pm' }));
    root.appendChild(el('aside.pm-side', { id: 'pm-side' }));
    document.addEventListener('keydown', onKey);
    await refresh();
  }

  function unmount() {
    document.removeEventListener('keydown', onKey);
    S.root = null;      // el ticker sigue vivo: el temporizador no se detiene
  }

  async function refresh() {
    const settings = await Store.getSettings();
    S.cfg = Object.assign({ sound: true, autoStart: true }, S.cfg, settings.pomodoro || {});

    S.tasks = await Store.getTasks({ completed: false });
    S.sessions = await Store.getPomodoros({ from: U.addDays(U.today(), -6) });

    restoreRunning(settings);
    render();
    if (window.App && App.renderRail) App.renderRail();
  }

  /* ---------------- Retomar tras recargar ---------------- */

  function restoreRunning(settings) {
    if (S.running) return;                                   // ya está corriendo en memoria
    const r = (settings.pomodoro || {}).running;
    if (!r || !r.endsAt) {
      // Bloque sin empezar: refleja siempre la duración configurada.
      // Si hay uno en pausa a medias (startedAt), se respeta lo que quedaba.
      if (!S.startedAt) S.leftMs = totalMs(S.mode);
      return;
    }

    S.mode   = r.mode || 'focus';
    S.taskId = r.taskId || null;
    S.cycle  = r.cycle || 0;
    S.startedAt = r.startedAt || null;

    if (r.endsAt > Date.now()) {                             // seguía corriendo
      S.endsAt = r.endsAt;
      S.running = true;
      startTicker();
    } else {                                                 // terminó estando cerrada la app
      S.running = false;
      S.leftMs = 0;
      finish(true);
    }
  }

  async function persistRunning() {
    const running = S.running
      ? { mode: S.mode, endsAt: S.endsAt, taskId: S.taskId, cycle: S.cycle, startedAt: S.startedAt }
      : null;
    await Store.updateSettings({ pomodoro: Object.assign({}, S.cfg, { running }) });
  }

  /* ============================================================
     CONTROL DEL TEMPORIZADOR
     ============================================================ */

  function startTicker() {
    if (S.ticker) return;
    S.ticker = setInterval(() => {
      if (!S.running) return;
      const left = remainingMs();
      paintTime(left);
      if (left <= 0) finish(false);
    }, 250);
  }

  function stopTicker() {
    if (S.ticker) clearInterval(S.ticker);
    S.ticker = null;
  }

  async function start() {
    if (S.running) return;
    if (!S.leftMs) S.leftMs = totalMs(S.mode);
    S.endsAt = Date.now() + S.leftMs;
    S.running = true;
    if (!S.startedAt) S.startedAt = new Date().toISOString();
    startTicker();
    await persistRunning();
    render();
  }

  async function pause() {
    if (!S.running) return;
    S.leftMs = remainingMs();
    S.running = false;
    stopTicker();
    await persistRunning();
    render();
  }

  async function reset() {
    S.running = false;
    stopTicker();
    S.leftMs = totalMs(S.mode);
    S.startedAt = null;
    await persistRunning();
    setTitle(null);
    render();
  }

  /** Cambia de modo manualmente (pestañas). */
  async function setMode(mode) {
    S.mode = mode;
    S.running = false;
    stopTicker();
    S.leftMs = totalMs(mode);
    S.startedAt = null;
    await persistRunning();
    setTitle(null);
    render();
  }

  /** Salta al siguiente bloque sin registrar la sesión actual. */
  async function skip() {
    S.running = false;
    stopTicker();
    await advance(false);
  }

  /**
   * Bloque terminado.
   * @param {boolean} silent - true cuando se recupera tras una recarga
   */
  async function finish(silent) {
    S.running = false;
    stopTicker();

    const minutes = minutesOf(S.mode);
    await Store.addPomodoro({
      kind: S.mode, taskId: S.mode === 'focus' ? S.taskId : null,
      minutes, startedAt: S.startedAt || new Date().toISOString(),
    });

    if (!silent) {
      beep(S.mode === 'focus');
      const t = S.tasks.find(x => x.id === S.taskId);
      U.toast(S.mode === 'focus'
        ? `Enfoque completado${t ? ` · ${t.title}` : ''} · ${minutes} min`
        : 'Descanso terminado. ¿Seguimos?');
    }

    if (S.mode === 'focus') S.cycle++;
    await advance(true);
  }

  /** Decide y prepara el siguiente bloque. */
  async function advance(auto) {
    const wasFocus = S.mode === 'focus';
    if (wasFocus) {
      S.mode = (S.cycle % (S.cfg.cycles || 4) === 0) ? 'long' : 'short';
    } else {
      S.mode = 'focus';
    }
    S.leftMs = totalMs(S.mode);
    S.startedAt = null;

    // Los descansos arrancan solos; el siguiente enfoque lo decides tú
    if (auto && S.cfg.autoStart && S.mode !== 'focus') {
      await start();
    } else {
      await persistRunning();
      setTitle(null);
    }
    S.sessions = await Store.getPomodoros({ from: U.addDays(U.today(), -6) });
    S.tasks = await Store.getTasks({ completed: false });
    render();
    if (window.App && App.renderRail) App.renderRail();
  }

  /* ---------------- Aviso sonoro ---------------- */

  function beep(isFocusEnd) {
    if (!S.cfg.sound) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const notes = isFocusEnd ? [880, 660, 440] : [523, 659];
      notes.forEach((f, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.22);
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.22 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.22 + 0.2);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.22);
        osc.stop(ctx.currentTime + i * 0.22 + 0.22);
      });
      setTimeout(() => ctx.close && ctx.close(), 1500);
    } catch (e) { /* sin sonido, sin drama */ }
  }

  /* ============================================================
     PINTADO
     ============================================================ */

  function setTitle(text) {
    document.title = text ? `${text} · SOPI` : S.baseTitle;
  }

  /** Actualización ligera cada tick (sin repintar toda la vista). */
  function paintTime(left) {
    const total = totalMs(S.mode) || 1;
    const pct = Math.max(0, Math.min(100, ((total - left) / total) * 100));
    setTitle(`${mmss(left)} ${MODES[S.mode].short}`);

    // La insignia del rail solo se repinta cuando cambia el minuto
    const min = Math.max(1, Math.ceil(left / 60000));
    if (min !== S.lastBadge) {
      S.lastBadge = min;
      if (window.App && App.renderRail) App.renderRail();
    }

    if (!S.root) return;
    const clock = $('.pm-clock__t', S.root);
    if (clock) clock.textContent = mmss(left);
    const ring = $('.pm-clock', S.root);
    if (ring) ring.style.setProperty('--p', pct.toFixed(2));
  }

  function render() {
    if (!S.root) return;
    const box = clear($('#pm', S.root));
    const left = remainingMs();
    const total = totalMs(S.mode) || 1;
    const pct = ((total - left) / total) * 100;

    /* Pestañas de modo */
    const tabs = el('div.seg.pm__tabs');
    Object.keys(MODES).forEach(m => tabs.appendChild(el('button.seg__btn' + (S.mode === m ? '.is-on' : ''), {
      text: MODES[m].label, onclick: () => setMode(m),
    })));
    box.appendChild(tabs);

    /* Reloj */
    const clock = el('div.pm-clock', { style: `--p:${pct.toFixed(2)}; --c:${MODES[S.mode].color}` }, [
      el('div.pm-clock__in', null, [
        el('span.pm-clock__t', { text: mmss(left) }),
        el('span.pm-clock__m', { text: MODES[S.mode].label }),
      ]),
    ]);
    box.appendChild(clock);

    /* Puntos de ciclo */
    const dots = el('div.pm__cycles');
    const cyclesTarget = S.cfg.cycles || 4;
    // Enfoques hechos dentro de la ronda actual (4 de 4 se ven todos encendidos)
    const enRonda = S.cycle === 0 ? 0 : (S.cycle % cyclesTarget === 0 ? cyclesTarget : S.cycle % cyclesTarget);
    for (let i = 0; i < cyclesTarget; i++) {
      dots.appendChild(el('span.pm__dot' + (i < enRonda ? '.is-on' : '')));
    }
    box.appendChild(el('div.pm__cyclewrap', null, [
      dots,
      el('span.pm__cyclelabel', { text: `${S.cycle} enfoque${S.cycle === 1 ? '' : 's'} · descanso largo cada ${cyclesTarget}` }),
    ]));

    /* Controles */
    box.appendChild(el('div.pm__controls', null, [
      el('button.btn.btn--primary.pm__main', {
        text: S.running ? 'Pausar' : (left < total ? 'Continuar' : 'Iniciar'),
        onclick: () => (S.running ? pause() : start()),
      }),
      el('button.btn.btn--outline', { text: 'Reiniciar', onclick: reset }),
      el('button.btn.btn--outline', { text: 'Saltar', onclick: skip }),
    ]));

    /* Tarea asociada */
    box.appendChild(taskPicker());
    box.appendChild(el('p.pm__hint', {
      text: 'Espacio inicia o pausa · R reinicia · S salta al siguiente bloque',
    }));

    renderSide();
  }

  function taskPicker() {
    const t = S.tasks.find(x => x.id === S.taskId);
    const wrap = el('div.pm__task');

    const select = el('select.detail__input.pm__select');
    select.appendChild(el('option', { value: '', text: 'Sin tarea asociada' }));
    const today = U.today();
    const orden = S.tasks.slice().sort((a, b) => {
      const ad = a.dueDate || '9999', bd = b.dueDate || '9999';
      return ad === bd ? b.priority - a.priority : (ad < bd ? -1 : 1);
    });
    orden.forEach(task => select.appendChild(el('option', {
      value: task.id,
      text: (task.dueDate === today ? '· ' : '') + task.title +
            (task.pomodoros ? `  (${task.pomodoros})` : ''),
      selected: task.id === S.taskId,
    })));
    select.addEventListener('change', async () => {
      S.taskId = select.value || null;
      await persistRunning();
      render();
    });

    wrap.appendChild(el('label.pm__label', { text: 'Enfocado en' }));
    wrap.appendChild(select);
    if (t) {
      wrap.appendChild(el('div.pm__taskmeta', null, [
        t.dueDate ? el('span', { text: U.humanDate(t.dueDate) + (t.dueTime ? ' · ' + t.dueTime : '') }) : null,
        el('span', { text: `${t.pomodoros || 0} pomodoro${(t.pomodoros || 0) === 1 ? '' : 's'} acumulado${(t.pomodoros || 0) === 1 ? '' : 's'}` }),
        el('button.pm__open', {
          text: 'Abrir en Tareas',
          onclick: async () => {
            await App.openModule('tasks');
            if (window.TasksModule && TasksModule.openTask) TasksModule.openTask(t.id);
          },
        }),
      ]));
    }
    return wrap;
  }

  /* ============================================================
     PANEL LATERAL · estadísticas y ajustes
     ============================================================ */

  function renderSide() {
    const box = clear($('#pm-side', S.root));
    const today = U.today();
    const focos = S.sessions.filter(s => s.kind === 'focus');
    const hoy = focos.filter(s => s.date === today);
    const minHoy = hoy.reduce((a, s) => a + s.minutes, 0);
    const minSemana = focos.reduce((a, s) => a + s.minutes, 0);

    box.appendChild(el('header.pm-side__head', null, [el('h2', { text: 'Tu enfoque' })]));

    box.appendChild(el('div.pm-stats', null, [
      el('div.pm-stat', null, [
        el('strong', { text: String(hoy.length) }),
        el('small', { text: hoy.length === 1 ? 'sesión hoy' : 'sesiones hoy' }),
      ]),
      el('div.pm-stat', null, [
        el('strong', { text: fmtMin(minHoy) }),
        el('small', { text: 'enfoque hoy' }),
      ]),
      el('div.pm-stat', null, [
        el('strong', { text: fmtMin(minSemana) }),
        el('small', { text: 'últimos 7 días' }),
      ]),
    ]));

    /* Barras de los últimos 7 días */
    box.appendChild(el('h4.detail__label', { text: 'Últimos 7 días' }));
    const max = Math.max(25, ...Array.from({ length: 7 }, (_, i) =>
      focos.filter(s => s.date === U.addDays(today, -6 + i)).reduce((a, s) => a + s.minutes, 0)));
    const chart = el('div.pm-chart');
    for (let i = 0; i < 7; i++) {
      const d = U.addDays(today, -6 + i);
      const min = focos.filter(s => s.date === d).reduce((a, s) => a + s.minutes, 0);
      const col = el('div.pm-chart__col' + (d === today ? '.is-today' : ''), {
        title: `${U.humanDate(d)}: ${fmtMin(min)}`,
      }, [
        el('span.pm-chart__bar', { style: `height:${Math.max(3, (min / max) * 100)}%` }),
        el('span.pm-chart__d', { text: ['D', 'L', 'M', 'X', 'J', 'V', 'S'][U.parseYmd(d).getDay()] }),
      ]);
      chart.appendChild(col);
    }
    box.appendChild(chart);

    /* Sesiones de hoy */
    box.appendChild(el('h4.detail__label', { text: 'Sesiones de hoy' }));
    const list = el('div.pm-log.scroll');
    const hoyTodas = S.sessions.filter(s => s.date === today).slice().reverse();
    if (!hoyTodas.length) list.appendChild(el('p.pm-log__empty', { text: 'Aún no hay sesiones. Inicia la primera.' }));
    hoyTodas.forEach(s => {
      const task = S.tasks.find(x => x.id === s.taskId);
      list.appendChild(el('div.pm-log__i' + (s.kind === 'focus' ? '.is-focus' : ''), null, [
        el('span.pm-log__dot', { style: `background:${MODES[s.kind] ? MODES[s.kind].color : 'var(--text-3)'}` }),
        el('span.pm-log__t', { text: task ? task.title : MODES[s.kind].label }),
        el('span.pm-log__m', { text: fmtMin(s.minutes) }),
        el('span.pm-log__h', { text: new Date(s.endedAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) }),
      ]));
    });
    box.appendChild(list);

    /* Ajustes */
    box.appendChild(el('h4.detail__label', { text: 'Duraciones (minutos)' }));
    const grid = el('div.pm-cfg');
    [['focus', 'Enfoque'], ['shortBreak', 'Descanso corto'], ['longBreak', 'Descanso largo'], ['cycles', 'Ciclos']]
      .forEach(([k, label]) => {
        const input = el('input.detail__input', {
          type: 'number', min: 1, max: k === 'cycles' ? 8 : 120, value: String(S.cfg[k]),
        });
        input.addEventListener('change', async () => {
          const v = Math.max(1, Math.min(k === 'cycles' ? 8 : 120, parseInt(input.value, 10) || S.cfg[k]));
          S.cfg[k] = v;
          input.value = String(v);
          await Store.updateSettings({ pomodoro: Object.assign({}, S.cfg, { running: null }) });
          if (!S.running) { S.leftMs = totalMs(S.mode); }
          render();
        });
        grid.appendChild(el('label.pm-cfg__f', null, [el('span', { text: label }), input]));
      });
    box.appendChild(grid);

    const opts = el('div.pm-opts');
    opts.appendChild(toggle('Aviso sonoro', S.cfg.sound, async v => {
      S.cfg.sound = v;
      await Store.updateSettings({ pomodoro: Object.assign({}, S.cfg) });
      if (v) beep(false);
    }));
    opts.appendChild(toggle('Encadenar descansos', S.cfg.autoStart, async v => {
      S.cfg.autoStart = v;
      await Store.updateSettings({ pomodoro: Object.assign({}, S.cfg) });
    }));
    box.appendChild(opts);
  }

  function toggle(label, on, onChange) {
    const sw = el('button.sw' + (on ? '.is-on' : ''), { role: 'switch' }, [el('span.sw__k')]);
    sw.addEventListener('click', async () => {
      const next = !sw.classList.contains('is-on');
      sw.classList.toggle('is-on', next);
      await onChange(next);
    });
    return el('label.pm-opt', null, [el('span', { text: label }), sw]);
  }

  function fmtMin(m) {
    if (m < 60) return m + ' min';
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h} h ${r} min` : `${h} h`;
  }

  /* ============================================================
     TECLADO
     ============================================================ */

  function onKey(ev) {
    if (!S.root) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.code === 'Space') { ev.preventDefault(); S.running ? pause() : start(); }
    if (ev.key === 'r' || ev.key === 'R') reset();
    if (ev.key === 's' || ev.key === 'S') skip();
  }

  /* ---------------- Export ---------------- */

  window.PomodoroModule = {
    id: 'pomodoro',
    label: 'Cronómetro',
    icon: 'pomodoro',
    mount, unmount, refresh,
    /** Minutos que faltan, para la insignia del rail. */
    badge: () => (S.running ? Math.max(1, Math.ceil(remainingMs() / 60000)) : 0),
  };
})();
