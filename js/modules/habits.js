/* ============================================================
   SOPI · MÓDULO 4 · RASTREADOR DE HÁBITOS
   ------------------------------------------------------------
   Lo que se repite, con su racha. Tres frecuencias:
     · daily   — todos los días
     · days    — días concretos de la semana (L, M, X…)
     · weekly  — N veces por semana (da igual qué días)

   Datos: colecciones `habits` y `habitLogs` de store.js.
   Un registro existe = ese día está hecho.

   Contrato con App:  { id, label, icon, mount(root), unmount() }
   ============================================================ */
(function () {
  'use strict';

  const { el, clear, $, $$ } = U;

  const EMOJIS = ['✅', '💪', '🏃', '📖', '💧', '🧘', '🛏️', '🥗', '🚭', '📝',
                  '🎯', '🧹', '☎️', '💊', '🌱', '🎸', '🧠', '☀️', '🦷', '💰'];

  /* Adivina el icono por el nombre del hábito (se puede cambiar después). */
  const EMOJI_HINTS = [
    [/le(er|o)|libro|p[áa]gina|lectura/i, '📖'],
    [/gim|pesa|entren|ejercicio|fuerza/i, '💪'],
    [/camin|correr|corro|trotar|running|bici|nadar/i, '🏃'],
    [/agua|hidrat|tomar\s+\d/i, '💧'],
    [/medit|respir|yoga|calma/i, '🧘'],
    [/dorm|sue[ñn]o|acost|pantalla|celular/i, '🛏️'],
    [/comer|comida|dieta|verdura|fruta|ensalada|desayun/i, '🥗'],
    [/fum|vape|cigarr|alcohol/i, '🚭'],
    [/escrib|diario|apunt|nota|journal/i, '📝'],
    [/estudi|curso|clase|ingl[ée]s|aprend/i, '🧠'],
    [/limpi|orden|casa|lavar/i, '🧹'],
    [/llam|contact|familia|mam[áa]|pap[áa]/i, '☎️'],
    [/pastilla|medic|vitamin|suplement/i, '💊'],
    [/planta|jard|regar/i, '🌱'],
    [/guitarra|piano|m[úu]sica|tocar/i, '🎸'],
    [/ahorr|gasto|presupuesto|dinero|finanz/i, '💰'],
    [/diente|cepill|dental/i, '🦷'],
    [/sol|temprano|madrug|ma[ñn]ana/i, '☀️'],
  ];

  function guessEmoji(name, fallbackIndex) {
    for (const [re, e] of EMOJI_HINTS) if (re.test(name)) return e;
    return EMOJIS[fallbackIndex % EMOJIS.length];
  }
  const COLORS = ['#4772fa', '#e64545', '#f0a92a', '#35b98a', '#8a6cf0', '#00b8d9', '#ff7a59'];
  const DOW_MIN = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];   // índice = getDay()

  /* ---------------- Estado ---------------- */

  const S = {
    anchor: U.today(),      // cualquier día de la semana mostrada
    habits: [],
    logs: new Set(),        // claves "habitId|fecha"
    allLogs: [],            // registros crudos (para rachas e histórico)
    selected: null,
    root: null,
  };

  const key = (habitId, date) => habitId + '|' + date;
  const done = (habitId, date) => S.logs.has(key(habitId, date));

  /* ============================================================
     MONTAJE
     ============================================================ */

  async function mount(root) {
    S.root = root;
    clear(root);
    root.appendChild(el('section.hb', { id: 'hb' }));
    root.appendChild(el('aside.hb-detail', { id: 'hb-detail' }));
    document.addEventListener('keydown', onKey);
    await refresh();
  }

  function unmount() {
    document.removeEventListener('keydown', onKey);
    S.root = null;
  }

  async function refresh() {
    S.habits  = await Store.getHabits();
    S.allLogs = await Store.getHabitLogs({});
    S.logs = new Set(S.allLogs.map(l => key(l.habitId, l.date)));
    render();
    if (window.App && App.renderRail) App.renderRail();   // refresca la insignia del rail
  }

  /* ---------------- Semana mostrada ---------------- */

  function weekStart(dateStr) {
    const d = U.parseYmd(dateStr);
    return U.addDays(dateStr, -((d.getDay() + 6) % 7));   // lunes
  }
  const weekDays = () => Array.from({ length: 7 }, (_, i) => U.addDays(weekStart(S.anchor), i));

  /* ---------------- Reglas de frecuencia ---------------- */

  /** ¿Toca este hábito ese día? (en 'weekly' todos los días valen) */
  function scheduled(h, date) {
    const f = h.freq || { type: 'daily' };
    if (f.type === 'days') return (f.days || []).includes(U.parseYmd(date).getDay());
    return true;
  }

  function weekTarget(h) {
    const f = h.freq || {};
    if (f.type === 'weekly') return Math.max(1, f.times || 1);
    if (f.type === 'days')   return (f.days || []).length;
    return 7;
  }

  function freqLabel(h) {
    const f = h.freq || { type: 'daily' };
    if (f.type === 'daily')  return 'Todos los días';
    if (f.type === 'weekly') return `${f.times || 1}× por semana`;
    const days = (f.days || []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    return days.length ? days.map(d => DOW_MIN[d]).join(' ') : 'Sin días elegidos';
  }

  /* ---------------- Rachas y estadísticas ---------------- */

  /**
   * Día a partir del cual tiene sentido mirar hacia atrás:
   * el más antiguo entre la creación del hábito y su primer registro
   * (permite marcar días anteriores a la creación sin romper la racha).
   */
  function floorDate(h) {
    const created = (h.createdAt || '').slice(0, 10) || U.today();
    const logs = S.allLogs.filter(l => l.habitId === h.id).map(l => l.date).sort();
    return logs.length && logs[0] < created ? logs[0] : created;
  }

  function weekDoneCount(h, anyDateOfWeek) {
    const start = weekStart(anyDateOfWeek);
    let n = 0;
    for (let i = 0; i < 7; i++) if (done(h.id, U.addDays(start, i))) n++;
    return n;
  }

  /**
   * Racha actual.
   *  - daily / days : días programados consecutivos hechos hacia atrás.
   *                   El día de hoy sin marcar no rompe la racha (aún da tiempo).
   *  - weekly       : semanas consecutivas que cumplieron el objetivo.
   *                   La semana en curso no rompe si aún no llega.
   */
  function currentStreak(h) {
    const today = U.today();
    if ((h.freq || {}).type === 'weekly') {
      let streak = 0, cursor = weekStart(today);
      if (weekDoneCount(h, cursor) >= weekTarget(h)) streak++;
      cursor = U.addDays(cursor, -7);
      while (weekDoneCount(h, cursor) >= weekTarget(h)) { streak++; cursor = U.addDays(cursor, -7); }
      return streak;
    }

    const floor = floorDate(h);
    let streak = 0, date = today, guard = 0;
    while (guard++ < 3650 && date >= floor) {
      if (scheduled(h, date)) {
        if (done(h.id, date)) streak++;
        else if (date !== today) break;      // hoy sin marcar aún no rompe nada
      }
      date = U.addDays(date, -1);
    }
    return streak;
  }

  /** Mejor racha histórica, con las mismas reglas. */
  function bestStreak(h) {
    const dates = S.allLogs.filter(l => l.habitId === h.id).map(l => l.date).sort();
    if (!dates.length) return 0;

    if ((h.freq || {}).type === 'weekly') {
      let best = 0, run = 0, cursor = weekStart(dates[0]);
      const end = weekStart(U.today());
      while (cursor <= end) {
        if (weekDoneCount(h, cursor) >= weekTarget(h)) { run++; best = Math.max(best, run); }
        else run = 0;
        cursor = U.addDays(cursor, 7);
      }
      return best;
    }

    let best = 0, run = 0, date = dates[0];
    const today = U.today();
    while (date <= today) {
      if (scheduled(h, date)) {
        if (done(h.id, date)) { run++; best = Math.max(best, run); }
        else run = 0;
      }
      date = U.addDays(date, 1);
    }
    return best;
  }

  /** % de cumplimiento de los últimos `n` días programados. */
  function completion(h, n) {
    const floor = floorDate(h);
    let hechos = 0, tocaban = 0;
    for (let i = 0; i < n; i++) {
      const d = U.addDays(U.today(), -i);
      if (d < floor) break;
      if ((h.freq || {}).type === 'weekly') { tocaban++; if (done(h.id, d)) hechos++; continue; }
      if (!scheduled(h, d)) continue;
      tocaban++;
      if (done(h.id, d)) hechos++;
    }
    return tocaban ? Math.round((hechos / tocaban) * 100) : 0;
  }

  const totalDone = h => S.allLogs.filter(l => l.habitId === h.id).length;

  /* ============================================================
     RENDER
     ============================================================ */

  function render() {
    const box = clear($('#hb', S.root));
    box.appendChild(header());
    box.appendChild(todayBar());
    box.appendChild(S.habits.length ? table() : emptyState());
    renderDetail();
  }

  function header() {
    const a = U.parseYmd(weekStart(S.anchor));
    const b = U.parseYmd(U.addDays(weekStart(S.anchor), 6));
    const M = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const title = a.getMonth() === b.getMonth()
      ? `${a.getDate()} – ${b.getDate()} ${M[a.getMonth()]} ${a.getFullYear()}`
      : `${a.getDate()} ${M[a.getMonth()]} – ${b.getDate()} ${M[b.getMonth()]} ${b.getFullYear()}`;

    return el('header.hb__head', null, [
      el('div.hb__nav', null, [
        el('h1', { text: 'Hábitos' }),
        el('span.hb__week', { text: title }),
        el('button.btn--icon.cal__arrow', {
          title: 'Semana anterior',
          onclick: async () => { S.anchor = U.addDays(S.anchor, -7); await refresh(); },
        }, [Icons.svg('chevron')]),
        el('button.btn--icon', {
          title: 'Semana siguiente',
          onclick: async () => { S.anchor = U.addDays(S.anchor, 7); await refresh(); },
        }, [Icons.svg('chevron')]),
        el('button.btn.btn--outline.btn--sm', {
          text: 'Hoy', onclick: async () => { S.anchor = U.today(); await refresh(); },
        }),
      ]),
      el('button.btn.btn--sm.btn--primary', { text: '+ Nuevo hábito', onclick: newHabit }),
    ]);
  }

  /* ---------------- Resumen de hoy ---------------- */

  function todayBar() {
    const today = U.today();
    const hoy = S.habits.filter(h => scheduled(h, today));
    const hechos = hoy.filter(h => done(h.id, today)).length;
    const pct = hoy.length ? Math.round((hechos / hoy.length) * 100) : 0;

    return el('div.hb__today', null, [
      el('div.ring', { style: `--p:${pct}` }, [el('span', { text: pct + '%' })]),
      el('div.hb__today-t', null, [
        el('strong', { text: hoy.length ? `${hechos} de ${hoy.length} hábitos de hoy` : 'Sin hábitos para hoy' }),
        el('span', {
          text: !hoy.length ? 'Crea uno con el botón de arriba.'
            : hechos === hoy.length ? '¡Día completo! Mantén la racha mañana.'
            : `Te faltan ${hoy.length - hechos}. Marca el círculo de la columna de hoy.`,
        }),
      ]),
    ]);
  }

  /* ---------------- Tabla semanal ---------------- */

  function table() {
    const days = weekDays();
    const wrap = el('div.hb__table');

    /* Cabecera de días */
    const head = el('div.hb-row.hb-row--head');
    head.appendChild(el('div.hb-row__name', null, [el('span.hb__col-t', { text: 'Hábito' })]));
    days.forEach(d => {
      const dt = U.parseYmd(d);
      head.appendChild(el('div.hb-day' + (d === U.today() ? '.is-today' : ''), null, [
        el('span.hb-day__dow', { text: DOW_MIN[dt.getDay()] }),
        el('span.hb-day__n', { text: String(dt.getDate()) }),
      ]));
    });
    head.appendChild(el('div.hb-row__streak', null, [el('span.hb__col-t', { text: 'Racha' })]));
    wrap.appendChild(head);

    /* Filas */
    S.habits.forEach(h => wrap.appendChild(habitRow(h, days)));

    /* Alta rápida */
    const input = el('input.hb__add', { type: 'text', placeholder: '+ Nuevo hábito (ej. Leer 20 min)' });
    input.addEventListener('keydown', async ev => {
      if (ev.key !== 'Enter' || !input.value.trim()) return;
      const name = input.value.trim();
      input.value = '';
      const h = await Store.createHabit({
        name,
        emoji: guessEmoji(name, S.habits.length),
        color: COLORS[S.habits.length % COLORS.length],
      });
      S.selected = h.id;
      await refresh();
    });
    wrap.appendChild(input);
    return wrap;
  }

  function habitRow(h, days) {
    const row = el('div.hb-row', { dataset: { id: h.id } });
    if (S.selected === h.id) row.classList.add('is-selected');
    row.style.setProperty('--c', h.color);

    /* Nombre */
    row.appendChild(el('button.hb-row__name', {
      onclick: () => { S.selected = S.selected === h.id ? null : h.id; render(); },
    }, [
      el('span.hb-row__emoji', { text: h.emoji }),
      el('span.hb-row__t', null, [
        el('span.hb-row__title', { text: h.name }),
        el('span.hb-row__freq', { text: freqLabel(h) }),
      ]),
    ]));

    /* Círculos de la semana */
    days.forEach(d => {
      const toca   = scheduled(h, d);
      const hecho  = done(h.id, d);
      const futuro = d > U.today();

      const cell = el('div.hb-cell');
      const btn = el('button.dot', {
        title: `${h.name} · ${U.humanDate(d)}`,
        disabled: futuro ? 'disabled' : null,
        onclick: async () => {
          if (futuro) return;
          const ahora = await Store.toggleHabit(h.id, d);
          await refresh();
          if (ahora && d === U.today()) {
            const s = currentStreak(h);
            if (s >= 2) U.toast(`🔥 ${s} días seguidos con “${h.name}”`);
          }
        },
      }, [Icons.svg('check', { width: 3 })]);

      if (hecho)  btn.classList.add('is-on');
      if (!toca)  btn.classList.add('is-off');
      if (futuro) btn.classList.add('is-future');
      if (d === U.today()) btn.classList.add('is-today');

      cell.appendChild(btn);
      row.appendChild(cell);
    });

    /* Racha */
    const s = currentStreak(h);
    row.appendChild(el('div.hb-row__streak', null, [
      el('span.streak' + (s ? '.is-on' : ''), null, [
        el('span.streak__n', { text: String(s) }),
        el('span.streak__u', { text: (h.freq || {}).type === 'weekly' ? (s === 1 ? 'sem' : 'sems') : (s === 1 ? 'día' : 'días') }),
      ]),
    ]));

    return row;
  }

  function emptyState() {
    return el('div.hb__empty', null, [
      el('div.empty__icon', null, [Icons.svg('habits', { width: 1.5 })]),
      el('h3', { text: 'Todavía no hay hábitos' }),
      el('p', { text: 'Empieza con uno pequeño y concreto: “Caminar 20 min”, “Leer 10 páginas”, “Nada de pantallas después de las 23:00”.' }),
      el('button.btn.btn--primary', { text: 'Crear mi primer hábito', onclick: newHabit }),
    ]);
  }

  async function newHabit() {
    const h = await Store.createHabit({
      name: 'Nuevo hábito',
      emoji: EMOJIS[S.habits.length % EMOJIS.length],
      color: COLORS[S.habits.length % COLORS.length],
    });
    S.selected = h.id;
    await refresh();
    const input = $('.hbd__name', S.root);
    if (input) { input.focus(); input.select(); }
  }

  /* ============================================================
     PANEL DE DETALLE
     ============================================================ */

  function renderDetail() {
    const box = clear($('#hb-detail', S.root));
    const h = S.habits.find(x => x.id === S.selected);

    if (!h) {
      box.classList.remove('is-open');
      box.appendChild(el('div.detail__empty', null, [
        el('div.empty__icon', null, [Icons.svg('habits', { width: 1.5 })]),
        el('p', { text: 'Elige un hábito para ver su historial, su racha y ajustar la frecuencia.' }),
      ]));
      return;
    }
    box.classList.add('is-open');
    box.style.setProperty('--c', h.color);

    /* Cabecera */
    box.appendChild(el('header.detail__head', null, [
      el('span.detail__crumb', { text: 'Hábito' }),
      el('button.btn--icon', { title: 'Cerrar', onclick: () => { S.selected = null; render(); } }, [Icons.svg('close')]),
    ]));

    const body = el('div.detail__body.scroll');

    /* Nombre + emoji */
    const nameInput = el('input.hbd__name', { type: 'text', value: h.name });
    nameInput.addEventListener('change', async () => {
      const v = nameInput.value.trim();
      if (!v) { nameInput.value = h.name; return; }
      const patch = { name: v };
      // Si aún tiene el icono por defecto, lo adivinamos del nuevo nombre
      if (h.emoji === '✅' || h.name === 'Nuevo hábito') patch.emoji = guessEmoji(v, S.habits.length);
      await Store.updateHabit(h.id, patch);
      await refresh();
    });
    body.appendChild(el('div.hbd__top', null, [
      el('button.hbd__emoji', {
        text: h.emoji, title: 'Cambiar icono',
        onclick: ev => { ev.currentTarget.nextElementSibling; toggleEmoji(body, h); },
      }),
      nameInput,
    ]));

    const picker = el('div.hbd__emojis.is-hidden');
    EMOJIS.forEach(e => picker.appendChild(el('button', {
      text: e,
      onclick: async () => { await Store.updateHabit(h.id, { emoji: e }); await refresh(); },
    })));
    body.appendChild(picker);

    /* Estadísticas */
    const s = currentStreak(h), unit = (h.freq || {}).type === 'weekly' ? 'sem' : 'días';
    body.appendChild(el('div.hbd__stats', null, [
      stat('🔥', `${s} ${unit}`, 'Racha actual'),
      stat('🏆', `${bestStreak(h)} ${unit}`, 'Mejor racha'),
      stat('📈', completion(h, 30) + '%', 'Últimos 30 días'),
      stat('✔️', String(totalDone(h)), 'Veces en total'),
    ]));

    /* Mapa de calor */
    body.appendChild(el('h4.detail__label', { text: 'Últimas 12 semanas' }));
    body.appendChild(heatmap(h));

    /* Frecuencia */
    body.appendChild(el('h4.detail__label', { text: 'Frecuencia' }));
    const f = h.freq || { type: 'daily' };
    const seg = el('div.seg.hbd__seg');
    [['daily', 'Diario'], ['days', 'Días'], ['weekly', 'Semanal']].forEach(([type, label]) => {
      seg.appendChild(el('button.seg__btn' + (f.type === type ? '.is-on' : ''), {
        text: label,
        onclick: async () => { await Store.updateHabit(h.id, { freq: { type } }); await refresh(); },
      }));
    });
    body.appendChild(seg);

    if (f.type === 'days') {
      const picker2 = el('div.hbd__days');
      [1, 2, 3, 4, 5, 6, 0].forEach(d => {
        const on = (f.days || []).includes(d);
        picker2.appendChild(el('button.hbd__day' + (on ? '.is-on' : ''), {
          text: DOW_MIN[d],
          onclick: async () => {
            const days = on ? (f.days || []).filter(x => x !== d) : (f.days || []).concat([d]);
            await Store.updateHabit(h.id, { freq: { days } });
            await refresh();
          },
        }));
      });
      body.appendChild(picker2);
    }

    if (f.type === 'weekly') {
      const row = el('div.hbd__times');
      [1, 2, 3, 4, 5, 6].forEach(n => row.appendChild(el('button.pill' + (f.times === n ? '.is-on' : ''), {
        text: `${n}×`,
        onclick: async () => { await Store.updateHabit(h.id, { freq: { times: n } }); await refresh(); },
      })));
      body.appendChild(row);
      body.appendChild(el('p.hbd__note', {
        text: `Esta semana llevas ${weekDoneCount(h, S.anchor)} de ${weekTarget(h)}.`,
      }));
    }

    /* Color */
    body.appendChild(el('h4.detail__label', { text: 'Color' }));
    const colors = el('div.hbd__colors');
    COLORS.forEach(c => colors.appendChild(el('button.hbd__color' + (h.color === c ? '.is-on' : ''), {
      style: `background:${c}`,
      onclick: async () => { await Store.updateHabit(h.id, { color: c }); await refresh(); },
    })));
    body.appendChild(colors);

    box.appendChild(body);

    /* Pie */
    box.appendChild(el('footer.detail__foot', null, [
      el('small', { text: 'Desde el ' + new Date(h.createdAt).toLocaleDateString('es-PE') }),
      el('button.btn.btn--soft', {
        text: 'Eliminar',
        onclick: async () => {
          const ok = await UI.confirm({
            title: `¿Eliminar el hábito “${h.name}”?`,
            message: `Se borrará también su historial: ${totalDone(h)} marcas y una racha de ${currentStreak(h)}. Esto no se puede deshacer.`,
            confirmText: 'Eliminar hábito',
          });
          if (!ok) return;
          await Store.deleteHabit(h.id);
          S.selected = null;
          await refresh();
          U.toast('Hábito eliminado');
        },
      }),
    ]));
  }

  function toggleEmoji(body, h) {
    const picker = body.querySelector('.hbd__emojis');
    if (picker) picker.classList.toggle('is-hidden');
  }

  function stat(icon, value, label) {
    return el('div.hbd__stat', null, [
      el('span.hbd__stat-i', { text: icon }),
      el('strong', { text: value }),
      el('small', { text: label }),
    ]);
  }

  /** Mapa de calor: 12 columnas (semanas) × 7 filas (lun→dom). */
  function heatmap(h) {
    const grid = el('div.heat');
    const start = U.addDays(weekStart(U.today()), -7 * 11);

    for (let w = 0; w < 12; w++) {
      const col = el('div.heat__col');
      for (let d = 0; d < 7; d++) {
        const date = U.addDays(start, w * 7 + d);
        const cell = el('span.heat__c', { title: `${U.humanDate(date)}${done(h.id, date) ? ' · hecho' : ''}` });
        if (date > U.today())        cell.classList.add('is-future');
        else if (done(h.id, date))   cell.classList.add('is-on');
        else if (!scheduled(h, date))cell.classList.add('is-off');
        if (date === U.today())      cell.classList.add('is-today');
        col.appendChild(cell);
      }
      grid.appendChild(col);
    }
    return grid;
  }

  /* ============================================================
     TECLADO
     ============================================================ */

  function onKey(ev) {
    if (!S.root) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === 'ArrowLeft')  { S.anchor = U.addDays(S.anchor, -7); refresh(); }
    if (ev.key === 'ArrowRight') { S.anchor = U.addDays(S.anchor, 7);  refresh(); }
    if (ev.key === 't' || ev.key === 'T') { S.anchor = U.today(); refresh(); }
    if (ev.key === 'n' || ev.key === 'N') newHabit();
    if (ev.key === 'Escape') { S.selected = null; render(); }
  }

  /* ---------------- Export ---------------- */

  window.HabitsModule = {
    id: 'habits',
    label: 'Rastreador de hábitos',
    icon: 'habits',
    mount, unmount, refresh,
    /** Hábitos de hoy aún sin marcar (insignia del rail). */
    badge: () => S.habits.filter(h => scheduled(h, U.today()) && !done(h.id, U.today())).length,
  };
})();
