/* ============================================================
   SOPI · MÓDULO 2 · CALENDARIO
   ------------------------------------------------------------
   Dos vistas sobre las mismas tareas del módulo 1:
     · Mes    — rejilla 7 × N con las tareas de cada día
     · Semana — rejilla horaria (00–23) + fila "todo el día"

   Arrastrar y soltar:
     · del panel "Sin fecha" a cualquier día  -> asigna fecha
     · de un día a otro                       -> reprograma
     · a una hora concreta (vista semana)     -> fecha + hora
     · de vuelta al panel "Sin fecha"         -> quita fecha y hora

   Contrato con App:  { id, label, icon, mount(root), unmount() }
   ============================================================ */
(function () {
  'use strict';

  const { el, clear, $, $$ } = U;

  const HOUR_H  = 46;   // alto de una hora en la vista semana (px)
  const MIN_BLK = 24;   // alto mínimo de un bloque

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  /* ---------------- Estado ---------------- */

  const S = {
    mode:   'month',        // month | week
    anchor: U.today(),      // día de referencia del periodo mostrado
    tasks:  [],             // tareas con fecha dentro del periodo
    unscheduled: [],        // tareas sin fecha
    lists:  [],
    listById: {},
    showDone: true,
    root: null,
    clockTimer: null,
  };

  /* ============================================================
     MONTAJE
     ============================================================ */

  async function mount(root) {
    S.root = root;
    clear(root);
    root.appendChild(el('section.cal', { id: 'cal' }));
    root.appendChild(el('aside.backlog', { id: 'backlog' }));
    document.addEventListener('keydown', onKey);
    await refresh();
    startClock();
  }

  function unmount() {
    document.removeEventListener('keydown', onKey);
    if (S.clockTimer) clearInterval(S.clockTimer);
    S.clockTimer = null;
    closePop();
    S.root = null;
  }

  async function refresh() {
    S.lists = await Store.getLists();
    S.listById = {};
    S.lists.forEach(l => (S.listById[l.id] = l));

    const [from, to] = periodRange();
    // Agenda: las semanales vienen expandidas, una por cada día que les toca
    S.tasks = await Store.getAgenda({ from, to });
    S.unscheduled = (await Store.getTasks({ hasDate: false, completed: false }))
      .filter(t => t.kind !== 'weekly');

    render();
  }

  /* ---------------- Cálculo del periodo ---------------- */

  /** Lunes de la semana que contiene a `dateStr`. */
  function weekStart(dateStr) {
    const d = U.parseYmd(dateStr);
    const shift = (d.getDay() + 6) % 7;      // 0 = lunes
    return U.addDays(dateStr, -shift);
  }

  /** Rango visible: en mes incluye los días de relleno de la primera y última semana. */
  function periodRange() {
    if (S.mode === 'week') {
      const a = weekStart(S.anchor);
      return [a, U.addDays(a, 6)];
    }
    const d = U.parseYmd(S.anchor);
    const first = U.ymd(new Date(d.getFullYear(), d.getMonth(), 1));
    const last  = U.ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    return [weekStart(first), U.addDays(weekStart(last), 6)];
  }

  function periodTitle() {
    const d = U.parseYmd(S.anchor);
    if (S.mode === 'month') {
      return `${MESES[d.getMonth()][0].toUpperCase()}${MESES[d.getMonth()].slice(1)} ${d.getFullYear()}`;
    }
    const a = U.parseYmd(weekStart(S.anchor));
    const b = U.parseYmd(U.addDays(weekStart(S.anchor), 6));
    if (a.getMonth() === b.getMonth()) {
      return `${a.getDate()} – ${b.getDate()} de ${MESES[a.getMonth()]} ${a.getFullYear()}`;
    }
    return `${a.getDate()} ${MESES[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MESES[b.getMonth()].slice(0, 3)} ${b.getFullYear()}`;
  }

  async function move(step) {
    const d = U.parseYmd(S.anchor);
    if (S.mode === 'week') S.anchor = U.addDays(S.anchor, 7 * step);
    else S.anchor = U.ymd(new Date(d.getFullYear(), d.getMonth() + step, 1));
    await refresh();
  }

  async function setMode(mode) {
    S.mode = mode;
    await refresh();
  }

  /* ============================================================
     RENDER PRINCIPAL
     ============================================================ */

  function render() {
    const cal = clear($('#cal', S.root));
    cal.appendChild(header());
    cal.appendChild(S.mode === 'month' ? monthGrid() : weekGrid());
    renderBacklog();
  }

  function header() {
    const seg = el('div.seg', null, [
      el('button.seg__btn' + (S.mode === 'month' ? '.is-on' : ''), { text: 'Mes',    onclick: () => setMode('month') }),
      el('button.seg__btn' + (S.mode === 'week'  ? '.is-on' : ''), { text: 'Semana', onclick: () => setMode('week')  }),
    ]);

    return el('header.cal__head', null, [
      el('div.cal__nav', null, [
        el('h1.cal__title', { text: periodTitle() }),
        el('button.btn--icon.cal__arrow', { title: 'Anterior', onclick: () => move(-1) }, [Icons.svg('chevron')]),
        el('button.btn--icon', { title: 'Siguiente', onclick: () => move(1) }, [Icons.svg('chevron')]),
        el('button.btn.btn--outline.btn--sm', {
          text: 'Hoy',
          onclick: async () => { S.anchor = U.today(); await refresh(); },
        }),
      ]),
      el('div.cal__tools', null, [
        legend(),
        el('button.btn.btn--sm' + (S.showDone ? '.btn--soft' : '.btn--outline'), {
          text: S.showDone ? 'Ocultar completadas' : 'Mostrar completadas',
          onclick: () => { S.showDone = !S.showDone; render(); },
        }),
        seg,
      ]),
    ]);
  }

  /** Leyenda de los tres tipos, para leer el mes de un vistazo. */
  function legend() {
    const box = el('div.cal__legend');
    ['normal', 'weekly', 'instant'].forEach(k => {
      const K = U.KINDS[k];
      box.appendChild(el('span.cal__lg', { style: `--c:${K.hex}`, title: K.hint }, [
        Icons.svg(K.icon, { width: 2.4 }),
        el('span', { text: K.short }),
      ]));
    });
    return box;
  }

  /** Tareas de un día concreto, ya filtradas y ordenadas. */
  function tasksOf(dateStr) {
    return S.tasks
      .filter(t => t.dueDate === dateStr && (S.showDone || !t.completed))
      .sort((a, b) => {
        const at = a.dueTime || '99:99', bt = b.dueTime || '99:99';
        if (at !== bt) return at < bt ? -1 : 1;
        return b.priority - a.priority;
      });
  }

  /* ============================================================
     VISTA MES
     ============================================================ */

  function monthGrid() {
    const [from] = periodRange();
    const monthIdx = U.parseYmd(S.anchor).getMonth();
    const wrap = el('div.month');

    const dows = el('div.month__dows');
    ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
      .forEach(d => dows.appendChild(el('span', { text: d })));
    wrap.appendChild(dows);

    const grid = el('div.month__grid');
    const weeks = Math.round((U.daysBetween(from, periodRange()[1]) + 1) / 7);
    grid.style.gridTemplateRows = `repeat(${weeks}, minmax(0,1fr))`;

    for (let i = 0; i < weeks * 7; i++) {
      const date = U.addDays(from, i);
      grid.appendChild(dayCell(date, U.parseYmd(date).getMonth() === monthIdx));
    }
    wrap.appendChild(grid);
    return wrap;
  }

  function dayCell(date, inMonth) {
    const isToday = date === U.today();
    const items = tasksOf(date);

    const cell = el('div.day', { dataset: { date } });
    if (!inMonth) cell.classList.add('is-out');
    if (isToday)  cell.classList.add('is-today');

    /* Cabecera del día */
    const num = U.parseYmd(date).getDate();
    cell.appendChild(el('div.day__head', null, [
      el('button.day__num', {
        text: String(num),
        title: 'Ver esta semana',
        onclick: ev => { ev.stopPropagation(); S.anchor = date; setMode('week'); },
      }),
    ]));

    /* Tareas (se muestran las primeras; el resto tras "+N más") */
    const MAX = 3;
    const list = el('div.day__items');
    items.slice(0, MAX).forEach(t => list.appendChild(chip(t)));
    if (items.length > MAX) {
      list.appendChild(el('button.day__more', {
        text: `+${items.length - MAX} más`,
        title: 'Ver el día completo',
        onclick: ev => { ev.stopPropagation(); S.anchor = date; setMode('week'); },
      }));
    }
    cell.appendChild(list);

    /* Tocar el día: en el móvil abre esa semana (donde sí se lee y se escribe);
       en pantalla grande, agrega una tarea ahí mismo. */
    cell.addEventListener('click', ev => {
      if (ev.target.closest('.chip-task') || ev.target.closest('.day__num')) return;
      if (window.innerWidth <= 520) { S.anchor = date; setMode('week'); return; }
      inlineAdd(cell, date);
    });

    makeDropTarget(cell, () => ({ dueDate: date }));
    return cell;
  }

  /* ---------------- Chip de tarea (vista mes) ---------------- */

  function chip(t) {
    const list = S.listById[t.listId];
    const K = U.kindOf(t);
    const node = el('button.chip-task.chip--' + K.key, {
      draggable: 'true',
      dataset: { id: t.id, kind: K.key, date: t.dueDate || '' },
      title: `${K.label} · ${t.title}`,
      onclick: ev => { ev.stopPropagation(); openPop(t, ev.currentTarget); },
    }, [
      K.key === 'normal'
        ? (t.dueTime ? el('span.chip-task__t', { text: t.dueTime }) : el('span.chip-task__dot'))
        : el('span.chip-task__k', null, [Icons.svg(K.icon, { width: 2.4 })]),
      el('span.chip-task__x', { text: (K.key !== 'normal' && t.dueTime ? t.dueTime + ' ' : '') + t.title }),
      list ? el('span.chip-task__l', { style: `background:${list.color}` }) : null,
    ]);
    node.style.setProperty('--c', K.hex);
    if (t.priority === 3) node.classList.add('is-p1');
    if (t.completed) node.classList.add('is-done');
    bindDrag(node, t.id, t);
    return node;
  }

  /* ---------------- Alta rápida dentro de una celda ---------------- */

  function inlineAdd(cell, date, time) {
    $$('.day__add', S.root).forEach(n => n.remove());
    const input = el('input.day__add', {
      type: 'text',
      placeholder: time ? `Nueva tarea · ${time}` : 'Nueva tarea…',
    });
    input.addEventListener('click', ev => ev.stopPropagation());
    input.addEventListener('keydown', async ev => {
      if (ev.key === 'Escape') { input.remove(); return; }
      if (ev.key !== 'Enter' || !input.value.trim()) return;
      const p = U.parseQuickAdd(input.value);
      input.remove();
      await Store.createTask({
        title: p.title,
        dueDate: p.dueDate || date,
        dueTime: p.dueTime || time || null,
        priority: p.priority,
        listId: p.listName
          ? (S.lists.find(l => l.name.toLowerCase() === p.listName.toLowerCase()) || {}).id
          : undefined,
      });
      await refresh();
    });
    input.addEventListener('blur', () => setTimeout(() => input.remove(), 120));
    (cell.querySelector('.day__items') || cell).appendChild(input);
    input.focus();
  }

  /* ============================================================
     VISTA SEMANA
     ============================================================ */

  function weekGrid() {
    const from = weekStart(S.anchor);
    const days = Array.from({ length: 7 }, (_, i) => U.addDays(from, i));
    const wrap = el('div.week');

    /* --- Cabecera con los 7 días --- */
    const head = el('div.week__head');
    head.appendChild(el('div.week__gutter'));
    days.forEach(d => {
      const dt = U.parseYmd(d);
      const col = el('div.week__dayhead' + (d === U.today() ? '.is-today' : ''), null, [
        el('span.week__dow', { text: U.DOW_S[dt.getDay()] }),
        el('span.week__num', { text: String(dt.getDate()) }),
      ]);
      head.appendChild(col);
    });
    wrap.appendChild(head);

    /* --- Fila "todo el día" (tareas con fecha pero sin hora) --- */
    const allday = el('div.week__allday');
    allday.appendChild(el('div.week__gutter', null, [el('span', { text: 'Todo el día' })]));
    days.forEach(d => {
      const cell = el('div.week__adcell', { dataset: { date: d } });
      tasksOf(d).filter(t => !t.dueTime).forEach(t => cell.appendChild(chip(t)));
      cell.addEventListener('click', ev => {
        if (ev.target.closest('.chip-task')) return;
        inlineAdd(cell, d);
      });
      makeDropTarget(cell, () => ({ dueDate: d, dueTime: null }));
      allday.appendChild(cell);
    });
    wrap.appendChild(allday);

    /* --- Rejilla horaria --- */
    const body = el('div.week__body.scroll');
    const grid = el('div.week__grid');

    const gutter = el('div.week__gutter.week__hours');
    for (let h = 0; h < 24; h++) {
      gutter.appendChild(el('div.week__hour', { style: `height:${HOUR_H}px` },
        [el('span', { text: U.pad(h) + ':00' })]));
    }
    grid.appendChild(gutter);

    days.forEach(d => {
      const col = el('div.week__col', { dataset: { date: d } });
      col.style.height = HOUR_H * 24 + 'px';

      for (let h = 0; h < 24; h++) {
        col.appendChild(el('div.week__slot', { style: `top:${h * HOUR_H}px; height:${HOUR_H}px` }));
      }

      /* Bloques con hora */
      layoutDay(tasksOf(d).filter(t => t.dueTime)).forEach(b => col.appendChild(block(b)));

      /* Línea de "ahora" */
      if (d === U.today()) col.appendChild(nowLine());

      /* Clic en un hueco -> alta rápida a esa hora */
      col.addEventListener('click', ev => {
        if (ev.target.closest('.blk')) return;
        inlineAdd(col, d, hourAt(col, ev));
      });

      makeDropTarget(col, ev => ({ dueDate: d, dueTime: hourAt(col, ev) }));
      grid.appendChild(col);
    });

    body.appendChild(grid);
    wrap.appendChild(body);

    // Arranca mirando a las 7:00
    setTimeout(() => { body.scrollTop = Math.max(0, 7 * HOUR_H - 10); }, 0);
    return wrap;
  }

  /** Hora ('HH:MM', en pasos de 15 min) donde ocurrió el evento dentro de una columna. */
  function hourAt(col, ev) {
    const rect = col.getBoundingClientRect();
    const y = Math.max(0, Math.min(rect.height - 1, ev.clientY - rect.top));
    const mins = Math.round((y / HOUR_H) * 60 / 15) * 15;
    const h = Math.min(23, Math.floor(mins / 60));
    const m = mins % 60;
    return U.pad(h) + ':' + U.pad(m);
  }

  /** Reparte en columnas las tareas que se solapan en el tiempo. */
  function layoutDay(items) {
    const parsed = items.map(t => {
      const [h, m] = t.dueTime.split(':').map(Number);
      const start = h * 60 + m;
      const dur = Math.max(30, t.duration || t.estimate || 60);
      return { task: t, start, end: start + dur };
    }).sort((a, b) => a.start - b.start);

    const cols = [];       // hora final de cada columna
    parsed.forEach(p => {
      let i = cols.findIndex(end => end <= p.start);
      if (i === -1) { i = cols.length; cols.push(0); }
      cols[i] = p.end;
      p.col = i;
    });

    // Cuántas columnas simultáneas hay en el grupo de cada bloque
    parsed.forEach(p => {
      p.total = parsed.filter(q => q.start < p.end && q.end > p.start)
        .reduce((mx, q) => Math.max(mx, q.col + 1), 1);
    });
    return parsed;
  }

  function block(b) {
    const t = b.task;
    const K = U.kindOf(t);
    const top = (b.start / 60) * HOUR_H;
    const h   = Math.max(MIN_BLK, ((b.end - b.start) / 60) * HOUR_H - 2);
    const w   = 100 / b.total;

    const node = el('button.blk.blk--' + K.key, {
      draggable: 'true',
      dataset: { id: t.id, kind: K.key, date: t.dueDate || '' },
      title: `${K.label} · ${t.dueTime} · ${t.title}`,
      style: `top:${top}px; height:${h}px; left:calc(${b.col * w}% + 2px); width:calc(${w}% - 4px)`,
      onclick: ev => { ev.stopPropagation(); openPop(t, ev.currentTarget); },
    }, [
      el('span.blk__t', null, [
        K.key !== 'normal' ? Icons.svg(K.icon, { width: 2.4 }) : null,
        el('span', { text: t.dueTime }),
      ]),
      el('span.blk__x', { text: t.title }),
    ]);
    node.style.setProperty('--c', K.hex);
    if (t.completed) node.classList.add('is-done');
    bindDrag(node, t.id, t);
    return node;
  }

  function nowLine() {
    const now = new Date();
    const top = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_H;
    return el('div.week__now', { style: `top:${top}px` }, [el('span.week__now-dot')]);
  }

  function startClock() {
    if (S.clockTimer) clearInterval(S.clockTimer);
    S.clockTimer = setInterval(() => {
      const line = $('.week__now', S.root);
      if (!line) return;
      const now = new Date();
      line.style.top = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_H + 'px';
    }, 60000);
  }

  /* ============================================================
     PANEL "SIN FECHA"
     ============================================================ */

  function renderBacklog() {
    const box = clear($('#backlog', S.root));

    box.appendChild(el('header.backlog__head', null, [
      el('h2', { text: 'Sin fecha' }),
      el('span.backlog__count', { text: String(S.unscheduled.length) }),
    ]));
    box.appendChild(el('p.backlog__hint', {
      text: 'Arrastra una tarea al calendario para programarla. Suéltala aquí para quitarle la fecha.',
    }));

    const list = el('div.backlog__list.scroll');
    if (!S.unscheduled.length) {
      list.appendChild(el('div.backlog__empty', { text: 'Todo tiene fecha. 🎉' }));
    }
    S.unscheduled.forEach(t => {
      const item = el('button.bl-item', {
        draggable: 'true',
        dataset: { id: t.id },
        onclick: ev => openPop(t, ev.currentTarget),
      }, [
        el('span.bl-item__dot', { style: `background:${(S.listById[t.listId] || {}).color || '#4772fa'}` }),
        el('span.bl-item__x', { text: t.title }),
        t.priority ? el('span.bl-item__flag', { style: `color:${U.PRIORITY[t.priority].color}` },
          [Icons.svg('flag')]) : null,
      ]);
      bindDrag(item, t.id);
      list.appendChild(item);
    });
    box.appendChild(list);

    /* Alta rápida sin fecha */
    const input = el('input.backlog__add', { type: 'text', placeholder: '+ Nueva tarea sin fecha' });
    input.addEventListener('keydown', async ev => {
      if (ev.key !== 'Enter' || !input.value.trim()) return;
      const p = U.parseQuickAdd(input.value);
      input.value = '';
      await Store.createTask({ title: p.title, dueDate: p.dueDate, dueTime: p.dueTime, priority: p.priority });
      await refresh();
    });
    box.appendChild(input);

    /* Soltar aquí = quitar fecha */
    makeDropTarget(box, () => ({ dueDate: null, dueTime: null }));
  }

  /* ============================================================
     ARRASTRAR Y SOLTAR
     ============================================================ */

  let dragId = null, dragTask = null, dragDate = null;

  function bindDrag(node, id, task) {
    node.addEventListener('dragstart', ev => {
      dragId = id;
      dragTask = task || null;
      dragDate = (task && task.dueDate) || null;
      ev.dataTransfer.effectAllowed = 'move';
      try { ev.dataTransfer.setData('text/plain', id); } catch (e) { /* IE */ }
      node.classList.add('is-dragging');
      document.body.classList.add('is-dnd');
    });
    node.addEventListener('dragend', () => {
      dragId = null; dragTask = null; dragDate = null;
      node.classList.remove('is-dragging');
      document.body.classList.remove('is-dnd');
      $$('.is-dropping', S.root).forEach(n => n.classList.remove('is-dropping'));
    });
  }

  /**
   * Aplica el cambio según el tipo de tarea.
   * Una tarea SEMANAL no cambia de fecha: cambia su día de la semana.
   * Devuelve el mensaje a mostrar, o null si no se hizo nada.
   */
  async function applyDrop(id, patch) {
    const task = dragTask && dragTask.id === id ? dragTask : await Store.getTask(id);
    if (!task) return null;

    if (task.kind === 'weekly') {
      if (!patch.dueDate) {
        U.toast('Una tarea semanal siempre tiene día: arrástrala a otro día para cambiarlo', 'error');
        return null;
      }
      const days = ((task.repeat || {}).days || []).slice();
      const fromDow = dragDate ? U.parseYmd(dragDate).getDay() : null;
      const toDow   = U.parseYmd(patch.dueDate).getDay();
      if (fromDow !== toDow) {
        const i = days.indexOf(fromDow);
        if (i >= 0) days.splice(i, 1);
        if (!days.includes(toDow)) days.push(toDow);
      }
      const p = { repeat: { days } };
      if (patch.dueTime !== undefined) p.dueTime = patch.dueTime;
      await Store.updateTask(id, p);
      return `Ahora se repite: ${U.repeatLabel(days)}${p.dueTime ? ' · ' + p.dueTime : ''}`;
    }

    await Store.updateTask(id, patch);
    return patch.dueDate
      ? `Movida a ${U.humanDate(patch.dueDate)}${patch.dueTime ? ' · ' + patch.dueTime : ''}`
      : 'Fecha eliminada';
  }

  /**
   * Convierte un nodo en zona donde soltar tareas.
   * `patchFor(ev)` devuelve el parche que se aplicará a la tarea soltada.
   */
  function makeDropTarget(node, patchFor) {
    node.addEventListener('dragover', ev => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      node.classList.add('is-dropping');
    });
    node.addEventListener('dragleave', ev => {
      if (ev.target === node) node.classList.remove('is-dropping');
    });
    node.addEventListener('drop', async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      node.classList.remove('is-dropping');
      const id = dragId || (ev.dataTransfer && ev.dataTransfer.getData('text/plain'));
      if (!id) return;
      const msg = await applyDrop(id, patchFor(ev));
      dragId = null; dragTask = null; dragDate = null;
      await refresh();
      if (msg) U.toast(msg);
    });
  }

  /* ============================================================
     POPOVER DE DETALLE RÁPIDO
     ============================================================ */

  function closePop() { $$('#cal-pop').forEach(p => p.remove()); }

  function openPop(t, anchor) {
    closePop();
    const rect = anchor.getBoundingClientRect();
    const pop = el('div.cal-pop', { id: 'cal-pop' });
    const list = S.listById[t.listId];

    const K = U.kindOf(t);
    pop.appendChild(el('header.cal-pop__head', null, [
      el('span.cal-pop__list', null, [
        el('span.kind-chip', { style: `--c:${K.hex}` }, [
          Icons.svg(K.icon, { width: 2.2 }), el('span', { text: K.label }),
        ]),
        el('span.nav__dot', { style: `background:${(list || {}).color || '#4772fa'}` }),
        el('span', { text: (list || {}).name || 'Sin lista' }),
      ]),
      el('button.btn--icon', { title: 'Cerrar', onclick: closePop }, [Icons.svg('close')]),
    ]));

    pop.appendChild(el('h3.cal-pop__title' + (t.completed ? '.is-done' : ''), { text: t.title }));

    const meta = el('p.cal-pop__meta');
    if (t.dueDate) meta.appendChild(el('span', { text: U.humanDate(t.dueDate) + (t.dueTime ? ' · ' + t.dueTime : ' · todo el día') }));
    if (t.kind === 'weekly') meta.appendChild(el('span', {
      style: 'color:var(--purple)', text: U.repeatLabel((t.repeat || {}).days),
    }));
    if (t.priority) meta.appendChild(el('span', { style: `color:${U.PRIORITY[t.priority].color}`, text: 'Prioridad ' + U.PRIORITY[t.priority].label }));
    if (t.subtasks && t.subtasks.length) meta.appendChild(el('span', { text: `${t.subtasks.filter(s => s.done).length}/${t.subtasks.length} subtareas` }));
    if (meta.childNodes.length) pop.appendChild(meta);
    if (t.note) pop.appendChild(el('p.cal-pop__note', { text: t.note }));

    /* Hora rápida */
    const timeRow = el('div.cal-pop__row');
    const time = el('input.detail__input', { type: 'time', value: t.dueTime || '' });
    time.addEventListener('change', async () => {
      await Store.updateTask(t.id, { dueTime: time.value || null });
      closePop(); await refresh();
    });
    timeRow.appendChild(time);
    if (t.kind !== 'weekly') timeRow.appendChild(el('button.pill', {
      text: '+1 día',
      onclick: async () => {
        await Store.updateTask(t.id, { dueDate: U.addDays(t.dueDate || U.today(), 1) });
        closePop(); await refresh();
      },
    }));
    pop.appendChild(timeRow);

    /* Acciones */
    pop.appendChild(el('div.cal-pop__actions', null, [
      el('button.btn.btn--sm.btn--primary', {
        text: t.kind === 'weekly' ? (t.completed ? 'Desmarcar este día' : 'Hecho este día')
            : t.kind === 'instant' ? 'Completar y eliminar'
            : (t.completed ? 'Reabrir' : 'Completar'),
        onclick: async () => {
          if (t.kind === 'weekly')      await Store.toggleOccurrence(t.id, t.dueDate);
          else if (t.kind === 'instant' && !t.completed) {
            await Store.deleteTask(t.id);
            U.toast('Instantánea completada y eliminada');
          } else await Store.toggleTask(t.id);
          closePop(); await refresh();
        },
      }),
      el('button.btn.btn--sm.btn--outline', {
        text: 'Abrir en Tareas',
        onclick: async () => {
          closePop();
          await App.openModule('tasks');
          if (window.TasksModule && TasksModule.openTask) TasksModule.openTask(t.id);
        },
      }),
      el('button.btn.btn--sm.btn--outline', {
        text: 'Eliminar',
        onclick: async () => { await Store.trashTask(t.id); closePop(); await refresh(); U.toast('Tarea enviada a la papelera'); },
      }),
    ]));

    document.body.appendChild(pop);

    /* Posición: junto al elemento, sin salirse de la ventana */
    const w = pop.offsetWidth, h = pop.offsetHeight;
    let left = rect.left;
    let top  = rect.bottom + 8;
    if (left + w > window.innerWidth - 12)  left = window.innerWidth - w - 12;
    if (top + h > window.innerHeight - 12)  top = Math.max(12, rect.top - h - 8);
    pop.style.left = Math.max(12, left) + 'px';
    pop.style.top  = top + 'px';

    setTimeout(() => document.addEventListener('click', onDocClick), 0);
  }

  function onDocClick(ev) {
    if (ev.target.closest('#cal-pop')) {
      document.addEventListener('click', onDocClick, { once: true });
      return;
    }
    closePop();
  }

  /* ============================================================
     TECLADO
     ============================================================ */

  function onKey(ev) {
    if (!S.root) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;

    if (ev.key === 'ArrowLeft')  { ev.preventDefault(); move(-1); }
    if (ev.key === 'ArrowRight') { ev.preventDefault(); move(1); }
    if (ev.key === 't' || ev.key === 'T') { S.anchor = U.today(); refresh(); }
    if (ev.key === 'm' || ev.key === 'M') setMode('month');
    if (ev.key === 'w' || ev.key === 'W') setMode('week');
    if (ev.key === 'Escape') closePop();
  }

  /* ---------------- Export ---------------- */

  window.CalendarModule = {
    id: 'calendar',
    label: 'Calendario',
    icon: 'calendar',
    mount, unmount, refresh,
    /** Permite que otros módulos abran el calendario en una fecha. */
    goTo(date, mode) { S.anchor = date || U.today(); if (mode) S.mode = mode; return refresh(); },
  };
})();
