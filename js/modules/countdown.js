/* ============================================================
   SOPI · MÓDULO 6 · CUENTA ATRÁS
   ------------------------------------------------------------
   Los días que faltan para las fechas que importan: entregas,
   viajes, cumpleaños, vencimientos. Con repetición anual o
   mensual para lo que vuelve cada año/mes.

   La más cercana se muestra en grande y cuenta en vivo
   (días · horas · minutos · segundos).

   Contrato con App:  { id, label, icon, mount(root), unmount() }
   ============================================================ */
(function () {
  'use strict';

  const { el, clear, $, $$ } = U;

  const EMOJIS = ['📅', '🎉', '✈️', '🎂', '🚢', '🏁', '📦', '💍', '🎓', '🏗️',
                  '💰', '📝', '🩺', '🎄', '⚓', '🔧', '🏝️', '📣', '⏰', '🥇'];
  const COLORS = ['#4772fa', '#e64545', '#f0a92a', '#35b98a', '#8a6cf0', '#00b8d9', '#ff7a59'];

  const EMOJI_HINTS = [
    [/cumple|nacim|birthday/i, '🎂'],
    [/viaje|vuelo|avi[óo]n|vacacion/i, '✈️'],
    [/boda|matrimonio|aniversario/i, '💍'],
    [/entrega|deadline|plazo|vence|vencimiento/i, '🏁'],
    [/embarque|zarpe|nave|barco|muelle|puerto/i, '🚢'],
    [/obra|construc|montaje|planta/i, '🏗️'],
    [/pago|factura|cobro|renta|impuesto|sunat/i, '💰'],
    [/examen|sustenta|tesis|grado|curso/i, '🎓'],
    [/m[ée]dico|cita|control|doctor|dentista/i, '🩺'],
    [/navidad|a[ñn]o nuevo|fiesta/i, '🎄'],
    [/mantenim|revisi[óo]n|calibra/i, '🔧'],
    [/reuni[óo]n|junta|comit[ée]|kom/i, '📣'],
  ];

  function guessEmoji(title, i) {
    for (const [re, e] of EMOJI_HINTS) if (re.test(title)) return e;
    return EMOJIS[i % EMOJIS.length];
  }

  /* ---------------- Estado ---------------- */

  const S = {
    items: [],
    tasks: [],
    selected: null,
    ticker: null,
    root: null,
  };

  /* ============================================================
     MONTAJE
     ============================================================ */

  async function mount(root) {
    S.root = root;
    clear(root);
    root.appendChild(el('section.cd', { id: 'cd' }));
    root.appendChild(el('aside.cd-side', { id: 'cd-side' }));
    document.addEventListener('keydown', onKey);
    await refresh();
    startTicker();
  }

  function unmount() {
    document.removeEventListener('keydown', onKey);
    if (S.ticker) clearInterval(S.ticker);
    S.ticker = null;
    S.root = null;
  }

  async function refresh() {
    S.items = await Store.getCountdowns();
    S.tasks = await Store.getTasks({ completed: false, hasDate: true });
    render();
    if (window.App && App.renderRail) App.renderRail();
  }

  /* ============================================================
     CÁLCULO DE FECHAS
     ============================================================ */

  /**
   * Próxima ocurrencia (respetando la repetición) como objeto Date.
   * Sin hora, la fecha "vence" al final de ese día: así “faltan 3 días”
   * y el conteo en vivo (3 d 18 h …) dicen siempre lo mismo.
   */
  function nextDate(c) {
    const base = U.parseYmd(c.date);
    if (!base) return null;
    if (c.time) {
      const [h, m] = c.time.split(':').map(Number);
      base.setHours(h || 0, m || 0, 0, 0);
    } else {
      base.setHours(23, 59, 59, 999);
    }

    if (c.repeat === 'none' || !c.repeat) return base;

    const now = new Date();
    const d = new Date(base);
    if (c.repeat === 'yearly') {
      while (d < now) d.setFullYear(d.getFullYear() + 1);
    } else if (c.repeat === 'monthly') {
      while (d < now) d.setMonth(d.getMonth() + 1);
    }
    return d;
  }

  /** Días completos que faltan (negativo si ya pasó), contando por fecha. */
  function daysLeft(c) {
    const d = nextDate(c);
    if (!d) return 0;
    return U.daysBetween(U.today(), U.ymd(d));
  }

  const isPast = c => (nextDate(c) ? nextDate(c).getTime() < Date.now() : false);

  /** Desglose en vivo para la tarjeta destacada (coincide con daysLeft). */
  function breakdown(c) {
    const target = nextDate(c);
    let ms = target ? target.getTime() - Date.now() : 0;
    const past = ms < 0;
    ms = Math.abs(ms);
    return {
      past,
      d: Math.abs(daysLeft(c)),
      h: Math.floor(ms / 3600000) % 24,
      m: Math.floor(ms / 60000) % 60,
      s: Math.floor(ms / 1000) % 60,
    };
  }

  function humanLeft(c) {
    const n = daysLeft(c);
    if (n === 0)  return '¡Es hoy!';
    if (n === 1)  return 'Mañana';
    if (n === -1) return 'Fue ayer';
    if (n > 0)    return `Faltan ${n} días`;
    return `Hace ${-n} días`;
  }

  function longDate(c) {
    const d = nextDate(c);
    if (!d) return '';
    const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                   'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const dow = U.DOW[d.getDay()];
    const base = `${dow} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
    return c.time ? `${base} · ${c.time}` : base;
  }

  const sorted = () => S.items.slice().sort((a, b) => {
    const ta = nextDate(a), tb = nextDate(b);
    return (ta ? ta.getTime() : 0) - (tb ? tb.getTime() : 0);
  });

  /* ============================================================
     RENDER
     ============================================================ */

  function startTicker() {
    if (S.ticker) clearInterval(S.ticker);
    S.ticker = setInterval(() => {
      if (!S.root) return;
      const hero = S.items.find(c => c.id === heroId());
      if (!hero) return;
      const b = breakdown(hero);
      const set = (sel, v) => { const n = $(sel, S.root); if (n) n.textContent = U.pad(v); };
      const dn = $('.cd-hero__d', S.root);
      if (dn) dn.textContent = String(b.d);
      set('.cd-hero__h', b.h); set('.cd-hero__m', b.m); set('.cd-hero__s', b.s);
    }, 1000);
  }

  /** La próxima que aún no pasó; si todas pasaron, la más reciente. */
  function heroId() {
    const futuras = sorted().filter(c => !isPast(c));
    const pick = futuras[0] || sorted()[sorted().length - 1];
    return pick ? pick.id : null;
  }

  function render() {
    if (!S.root) return;
    const box = clear($('#cd', S.root));

    box.appendChild(el('header.cd__head', null, [
      el('div', null, [
        el('h1', { text: 'Cuenta atrás' }),
        el('p', { text: 'Las fechas que no se te pueden pasar, con los días que faltan.' }),
      ]),
      el('button.btn.btn--sm.btn--primary', { text: '+ Nueva fecha', onclick: () => newCountdown() }),
    ]));

    if (!S.items.length) {
      box.appendChild(emptyState());
      renderSide();
      return;
    }

    const hero = S.items.find(c => c.id === heroId());
    if (hero) box.appendChild(heroCard(hero));

    const proximas = sorted().filter(c => !isPast(c) && c.id !== (hero || {}).id);
    const pasadas  = sorted().filter(c => isPast(c) && c.id !== (hero || {}).id).reverse();

    if (proximas.length) {
      box.appendChild(el('h2.cd__section', { text: 'Próximas' }));
      const grid = el('div.cd__grid');
      proximas.forEach(c => grid.appendChild(card(c)));
      box.appendChild(grid);
    }
    if (pasadas.length) {
      box.appendChild(el('h2.cd__section', { text: 'Ya pasaron' }));
      const grid = el('div.cd__grid');
      pasadas.forEach(c => grid.appendChild(card(c, true)));
      box.appendChild(grid);
    }

    renderSide();
  }

  /* ---------------- Tarjeta destacada ---------------- */

  function heroCard(c) {
    const b = breakdown(c);
    const unit = (cls, value, label) => el('div.cd-hero__u', null, [
      el('span', { class: cls, text: cls === 'cd-hero__d' ? String(value) : U.pad(value) }),
      el('small', { text: label }),
    ]);

    return el('article.cd-hero', {
      style: `--c:${c.color}`,
      onclick: () => { S.selected = c.id; render(); },
    }, [
      el('div.cd-hero__top', null, [
        el('span.cd-hero__emoji', { text: c.emoji }),
        el('div.cd-hero__t', null, [
          el('h2', { text: c.title }),
          el('span.cd-hero__date', { text: longDate(c) }),
        ]),
        c.repeat && c.repeat !== 'none'
          ? el('span.cd-tag', { text: c.repeat === 'yearly' ? 'Cada año' : 'Cada mes' })
          : null,
      ]),
      el('div.cd-hero__nums', null, [
        unit('cd-hero__d', b.d, b.past ? 'días atrás' : b.d === 1 ? 'día' : 'días'),
        unit('cd-hero__h', b.h, 'horas'),
        unit('cd-hero__m', b.m, 'min'),
        unit('cd-hero__s', b.s, 'seg'),
      ]),
      c.note ? el('p.cd-hero__note', { text: c.note }) : null,
    ]);
  }

  /* ---------------- Tarjeta normal ---------------- */

  function card(c, past) {
    const n = daysLeft(c);
    const node = el('article.cd-card' + (past ? '.is-past' : ''), {
      style: `--c:${c.color}`,
      onclick: () => { S.selected = c.id; render(); },
    }, [
      el('div.cd-card__head', null, [
        el('span.cd-card__emoji', { text: c.emoji }),
        c.repeat && c.repeat !== 'none' ? el('span.cd-tag', { text: c.repeat === 'yearly' ? 'Anual' : 'Mensual' }) : null,
      ]),
      el('div.cd-card__n', null, [
        el('strong', { text: String(Math.abs(n)) }),
        el('small', { text: Math.abs(n) === 1 ? 'día' : 'días' }),
      ]),
      el('h3.cd-card__t', { text: c.title }),
      el('span.cd-card__d', { text: longDate(c) }),
      el('span.cd-card__l' + (n === 0 ? '.is-today' : ''), { text: humanLeft(c) }),
    ]);
    if (S.selected === c.id) node.classList.add('is-selected');
    return node;
  }

  function emptyState() {
    return el('div.cd__empty', null, [
      el('div.empty__icon', null, [Icons.svg('countdown', { width: 1.5 })]),
      el('h3', { text: 'Sin fechas todavía' }),
      el('p', { text: 'Agrega la entrega de un proyecto, un viaje, un cumpleaños o el vencimiento de un contrato. Verás siempre cuántos días faltan.' }),
      el('button.btn.btn--primary', { text: 'Agregar la primera', onclick: () => newCountdown() }),
    ]);
  }

  async function newCountdown(preset) {
    const data = Object.assign({
      title: 'Nueva fecha',
      date: U.addDays(U.today(), 30),
      emoji: EMOJIS[S.items.length % EMOJIS.length],
      color: COLORS[S.items.length % COLORS.length],
    }, preset || {});
    const c = await Store.createCountdown(data);
    S.selected = c.id;
    await refresh();
    const input = $('.cds__name', S.root);
    if (input) { input.focus(); input.select(); }
  }

  /* ============================================================
     PANEL LATERAL (edición + sugerencias)
     ============================================================ */

  function renderSide() {
    const box = clear($('#cd-side', S.root));
    const c = S.items.find(x => x.id === S.selected);
    // En pantallas pequeñas el panel es un cajón: solo se abre al elegir una fecha
    box.classList.toggle('is-open', !!c);
    if (c) { editPanel(box, c); return; }

    /* Sin selección: sugerencias desde tareas con fecha */
    box.appendChild(el('header.cd-side__head', null, [el('h2', { text: 'Desde tus tareas' })]));
    box.appendChild(el('p.cd-side__hint', {
      text: 'Tareas con fecha que quizá merecen una cuenta atrás. Un clic la crea.',
    }));

    const yaCreadas = new Set(S.items.map(x => x.taskId).filter(Boolean));
    const cand = S.tasks
      .filter(t => t.dueDate >= U.today() && !yaCreadas.has(t.id))
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
      .slice(0, 12);

    const list = el('div.cd-sug.scroll');
    if (!cand.length) list.appendChild(el('p.cd-sug__empty', { text: 'No hay tareas futuras con fecha ahora mismo.' }));
    cand.forEach(t => list.appendChild(el('button.cd-sug__i', {
      onclick: () => newCountdown({
        title: t.title, date: t.dueDate, time: t.dueTime || null, taskId: t.id,
        emoji: guessEmoji(t.title, S.items.length),
      }),
    }, [
      el('span.cd-sug__x', { text: t.title }),
      el('span.cd-sug__d', { text: U.humanDate(t.dueDate) }),
    ])));
    box.appendChild(list);

    box.appendChild(el('p.cd-side__foot', {
      text: 'Consejo: usa la repetición anual para cumpleaños y renovaciones; así no hay que volver a crearlas.',
    }));
  }

  function editPanel(box, c) {
    box.appendChild(el('header.detail__head', null, [
      el('span.detail__crumb', { text: 'Editar fecha' }),
      el('button.btn--icon', { title: 'Cerrar', onclick: () => { S.selected = null; render(); } }, [Icons.svg('close')]),
    ]));

    const body = el('div.detail__body.scroll');

    /* Nombre + emoji */
    const name = el('input.cds__name', { type: 'text', value: c.title });
    name.addEventListener('change', async () => {
      const v = name.value.trim();
      if (!v) { name.value = c.title; return; }
      const patch = { title: v };
      if (c.emoji === '📅' || c.title === 'Nueva fecha') patch.emoji = guessEmoji(v, S.items.length);
      await Store.updateCountdown(c.id, patch);
      await refresh();
    });
    const emojiBtn = el('button.hbd__emoji', { text: c.emoji, title: 'Cambiar icono' });
    body.appendChild(el('div.hbd__top', null, [emojiBtn, name]));

    const picker = el('div.hbd__emojis.is-hidden');
    EMOJIS.forEach(e => picker.appendChild(el('button', {
      text: e,
      onclick: async () => { await Store.updateCountdown(c.id, { emoji: e }); await refresh(); },
    })));
    emojiBtn.addEventListener('click', () => picker.classList.toggle('is-hidden'));
    body.appendChild(picker);

    /* Fecha y hora */
    body.appendChild(el('h4.detail__label', { text: 'Fecha' }));
    const date = el('input.detail__input', { type: 'date', value: c.date });
    const time = el('input.detail__input', { type: 'time', value: c.time || '' });
    date.addEventListener('change', async () => {
      if (!date.value) { date.value = c.date; return; }
      await Store.updateCountdown(c.id, { date: date.value }); await refresh();
    });
    time.addEventListener('change', async () => {
      await Store.updateCountdown(c.id, { time: time.value || null }); await refresh();
    });
    body.appendChild(el('div.detail__row', null, [date, time]));

    const quick = el('div.detail__quick');
    [['+1 semana', 7], ['+1 mes', 30], ['+3 meses', 90], ['+1 año', 365]].forEach(([label, n]) =>
      quick.appendChild(el('button.pill', {
        text: label,
        onclick: async () => { await Store.updateCountdown(c.id, { date: U.addDays(U.today(), n) }); await refresh(); },
      })));
    body.appendChild(quick);

    /* Repetición */
    body.appendChild(el('h4.detail__label', { text: 'Se repite' }));
    const seg = el('div.seg.hbd__seg');
    [['none', 'Una vez'], ['yearly', 'Cada año'], ['monthly', 'Cada mes']].forEach(([v, label]) =>
      seg.appendChild(el('button.seg__btn' + ((c.repeat || 'none') === v ? '.is-on' : ''), {
        text: label,
        onclick: async () => { await Store.updateCountdown(c.id, { repeat: v }); await refresh(); },
      })));
    body.appendChild(seg);

    /* Color */
    body.appendChild(el('h4.detail__label', { text: 'Color' }));
    const colors = el('div.hbd__colors');
    COLORS.forEach(col => colors.appendChild(el('button.hbd__color' + (c.color === col ? '.is-on' : ''), {
      style: `background:${col}`,
      onclick: async () => { await Store.updateCountdown(c.id, { color: col }); await refresh(); },
    })));
    body.appendChild(colors);

    /* Nota */
    body.appendChild(el('h4.detail__label', { text: 'Nota' }));
    const note = el('textarea.detail__note', { rows: 3, placeholder: 'Detalles, lugar, con quién…' });
    note.value = c.note || '';
    note.addEventListener('input', U.debounce(async () => {
      await Store.updateCountdown(c.id, { note: note.value });
      S.items = await Store.getCountdowns();
    }, 400));
    body.appendChild(note);

    /* Tarea enlazada */
    if (c.taskId) {
      body.appendChild(el('h4.detail__label', { text: 'Tarea enlazada' }));
      body.appendChild(el('button.btn.btn--outline.btn--sm', {
        text: 'Abrir en Tareas',
        onclick: async () => {
          await App.openModule('tasks');
          if (window.TasksModule && TasksModule.openTask) TasksModule.openTask(c.taskId);
        },
      }));
    }

    box.appendChild(body);

    box.appendChild(el('footer.detail__foot', null, [
      el('small', { text: humanLeft(c) }),
      el('button.btn.btn--soft', {
        text: 'Eliminar',
        onclick: async () => {
          const ok = await UI.confirm({
            title: `¿Eliminar “${c.title}”?`,
            message: `Faltan ${Math.abs(daysLeft(c))} días. La cuenta atrás se borra definitivamente.`,
            confirmText: 'Eliminar fecha',
          });
          if (!ok) return;
          await Store.deleteCountdown(c.id);
          S.selected = null;
          await refresh();
          U.toast('Fecha eliminada');
        },
      }),
    ]));
  }

  /* ============================================================
     TECLADO
     ============================================================ */

  function onKey(ev) {
    if (!S.root) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === 'n' || ev.key === 'N') newCountdown();
    if (ev.key === 'Escape') { S.selected = null; render(); }
  }

  /* ---------------- Export ---------------- */

  window.CountdownModule = {
    id: 'countdown',
    label: 'Cuenta atrás',
    icon: 'countdown',
    mount, unmount, refresh,
    /** Cuántas fechas caen en los próximos 7 días. */
    badge: () => S.items.filter(c => {
      const n = daysLeft(c);
      return n >= 0 && n <= 7;
    }).length,
  };
})();
