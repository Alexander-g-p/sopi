/* ============================================================
   SOPI · MÓDULO 3 · MATRIZ DE EISENHOWER
   ------------------------------------------------------------
   Las mismas tareas, ordenadas por urgencia e importancia:

        │  URGENTE            │  NO URGENTE
   ─────┼─────────────────────┼──────────────────────
   IMP. │  1. Hacer ahora     │  2. Programar
   NO   │  3. Delegar         │  4. Eliminar

   Usa los campos `urgent` e `important` que ya existen en el
   modelo de tarea (null = sin clasificar). Arrastrar una tarea
   a un cuadrante escribe ambos campos.

   Contrato con App:  { id, label, icon, mount(root), unmount() }
   ============================================================ */
(function () {
  'use strict';

  const { el, clear, $, $$ } = U;

  /* ---------------- Definición de los cuadrantes ---------------- */

  const QUADS = [
    { key: 'q1', urgent: true,  important: true,
      n: 1, title: 'Hacer ahora',  sub: 'Urgente e importante',
      color: 'var(--red)',    hint: 'Crisis y fechas que vencen. Atiéndelas hoy.' },
    { key: 'q2', urgent: false, important: true,
      n: 2, title: 'Programar',    sub: 'Importante, no urgente',
      color: 'var(--blue)',   hint: 'Aquí vive el trabajo que de verdad avanza. Dale fecha.' },
    { key: 'q3', urgent: true,  important: false,
      n: 3, title: 'Delegar',      sub: 'Urgente, no importante',
      color: 'var(--orange)', hint: 'Interrumpe pero no aporta. ¿Puede hacerlo otro?' },
    { key: 'q4', urgent: false, important: false,
      n: 4, title: 'Eliminar',     sub: 'Ni urgente ni importante',
      color: 'var(--text-3)', hint: 'Ruido. Bórralo sin culpa.' },
  ];

  /* ---------------- Estado ---------------- */

  const S = {
    tasks: [],
    lists: [],
    listById: {},
    showDone: false,
    root: null,
  };

  /* ============================================================
     MONTAJE
     ============================================================ */

  async function mount(root) {
    S.root = root;
    clear(root);
    root.appendChild(el('section.mx', { id: 'mx' }));
    root.appendChild(el('aside.tray', { id: 'tray' }));
    document.addEventListener('keydown', onKey);
    await refresh();
  }

  function unmount() {
    document.removeEventListener('keydown', onKey);
    S.root = null;
  }

  async function refresh() {
    S.lists = await Store.getLists();
    S.listById = {};
    S.lists.forEach(l => (S.listById[l.id] = l));
    S.tasks = await Store.getTasks({});           // activas (sin papelera)
    render();
    if (window.App && App.renderRail) App.renderRail();   // refresca la insignia del rail
  }

  /* ---------------- Selección de tareas por cuadrante ---------------- */

  const isClassified = t => t.urgent !== null && t.urgent !== undefined &&
                            t.important !== null && t.important !== undefined;

  function tasksOf(q) {
    return S.tasks
      .filter(t => (S.showDone || !t.completed))
      .filter(t => isClassified(t) && !!t.urgent === q.urgent && !!t.important === q.important)
      .sort(orderTasks);
  }

  function unclassified() {
    return S.tasks
      .filter(t => !t.completed && !isClassified(t))
      .sort(orderTasks);
  }

  function orderTasks(a, b) {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const ad = a.dueDate || '9999-99-99', bd = b.dueDate || '9999-99-99';
    if (ad !== bd) return ad < bd ? -1 : 1;
    return b.priority - a.priority;
  }

  /* ============================================================
     RENDER
     ============================================================ */

  function render() {
    const mx = clear($('#mx', S.root));
    mx.appendChild(header());

    const grid = el('div.mx__grid');
    QUADS.forEach(q => grid.appendChild(quadrant(q)));
    mx.appendChild(grid);

    mx.appendChild(summary());
    renderTray();
  }

  function header() {
    const pend = unclassified().length;
    return el('header.mx__head', null, [
      el('div.mx__titles', null, [
        el('h1', { text: 'Matriz de Eisenhower' }),
        el('p', { text: 'Arrastra cada tarea al cuadrante que le toca. Lo que decidas se guarda en la tarea.' }),
      ]),
      el('div.mx__tools', null, [
        pend ? el('button.btn.btn--sm.btn--primary', {
          text: `Clasificar ${pend} automáticamente`,
          title: 'Propone urgencia por la fecha e importancia por la prioridad',
          onclick: autoClassify,
        }) : null,
        el('button.btn.btn--sm' + (S.showDone ? '.btn--soft' : '.btn--outline'), {
          text: S.showDone ? 'Ocultar completadas' : 'Mostrar completadas',
          onclick: () => { S.showDone = !S.showDone; render(); },
        }),
      ]),
    ]);
  }

  /* ---------------- Un cuadrante ---------------- */

  function quadrant(q) {
    const items = tasksOf(q);
    const box = el('section.quad', { dataset: { q: q.key } });
    box.style.setProperty('--c', q.color);

    box.appendChild(el('header.quad__head', null, [
      el('span.quad__n', { text: String(q.n) }),
      el('div.quad__t', null, [
        el('h2', { text: q.title }),
        el('span.quad__sub', { text: q.sub }),
      ]),
      el('span.quad__count', { text: String(items.length) }),
    ]));

    const list = el('div.quad__list.scroll');
    if (!items.length) list.appendChild(el('p.quad__hint', { text: q.hint }));
    items.forEach(t => list.appendChild(card(t)));
    box.appendChild(list);

    const input = el('input.quad__add', { type: 'text', placeholder: '+ Nueva tarea aquí' });
    input.addEventListener('keydown', async ev => {
      if (ev.key !== 'Enter' || !input.value.trim()) return;
      const p = U.parseQuickAdd(input.value);
      input.value = '';
      await Store.createTask({
        title: p.title, dueDate: p.dueDate, dueTime: p.dueTime, priority: p.priority,
        urgent: q.urgent, important: q.important,
        listId: p.listName
          ? (S.lists.find(l => l.name.toLowerCase() === p.listName.toLowerCase()) || {}).id
          : undefined,
      });
      await refresh();
    });
    box.appendChild(input);

    makeDropTarget(box, () => ({ urgent: q.urgent, important: q.important }),
      t => `Movida a “${q.title}”`);
    return box;
  }

  /* ---------------- Tarjeta de tarea ---------------- */

  function card(t) {
    const list = S.listById[t.listId];
    const K = U.kindOf(t);
    const node = el('article.mcard', { draggable: 'true', dataset: { id: t.id } });
    node.style.setProperty('--k', K.hex);
    if (t.completed) node.classList.add('is-done');
    if (t.kind && t.kind !== 'normal') node.classList.add('is-' + t.kind);

    /* Completar (según el tipo) */
    node.appendChild(el('button.mcard__box.box--' + K.key, {
      title: t.kind === 'weekly' ? 'Marcar hecho hoy'
           : t.kind === 'instant' ? 'Completar y eliminar' : 'Completar',
      onclick: async ev => {
        ev.stopPropagation();
        if (t.kind === 'weekly') {
          await Store.toggleOccurrence(t.id, U.today());
          U.toast('Hecho hoy · vuelve la próxima semana');
        } else if (t.kind === 'instant' && !t.completed) {
          await Store.deleteTask(t.id);
          U.toast('Instantánea completada y eliminada');
        } else await Store.toggleTask(t.id);
        await refresh();
      },
    }, [Icons.svg(t.completed ? 'check' : K.icon, { width: 2.6 })]));

    /* Contenido */
    const meta = el('div.mcard__meta');
    if (t.kind === 'weekly') {
      meta.appendChild(el('span.kind-tag.kind-tag--weekly', null, [
        Icons.svg('repeat'),
        el('span', { text: U.repeatLabel((t.repeat || {}).days) + (t.dueTime ? ' · ' + t.dueTime : '') }),
      ]));
    } else if (t.kind === 'instant') {
      meta.appendChild(el('span.kind-tag.kind-tag--instant', null, [
        Icons.svg('bolt'), el('span', { text: 'Una vez' }),
      ]));
    }
    if (t.dueDate && t.kind !== 'weekly') {
      const overdue = !t.completed && t.dueDate < U.today();
      meta.appendChild(el('span.mcard__date' + (overdue ? '.is-overdue' : ''), {
        text: U.humanDate(t.dueDate) + (t.dueTime ? ' · ' + t.dueTime : ''),
      }));
    }
    if (t.priority) meta.appendChild(el('span.mcard__prio', {
      style: `color:${U.PRIORITY[t.priority].color}`,
    }, [Icons.svg('flag'), el('span', { text: U.PRIORITY[t.priority].label })]));
    if (list) meta.appendChild(el('span.mcard__list', null, [
      el('span.nav__dot', { style: `background:${list.color}` }),
      el('span', { text: list.name }),
    ]));

    node.appendChild(el('div.mcard__main', null, [
      el('span.mcard__title', { text: t.title }),
      meta.childNodes.length ? meta : null,
    ]));

    /* Acciones */
    node.appendChild(el('div.mcard__actions', null, [
      el('button.btn--icon', {
        title: 'Abrir en Tareas',
        onclick: async ev => {
          ev.stopPropagation();
          await App.openModule('tasks');
          if (window.TasksModule && TasksModule.openTask) TasksModule.openTask(t.id);
        },
      }, [Icons.svg('chevron')]),
      el('button.btn--icon', {
        title: 'Enviar a la papelera',
        onclick: async ev => { ev.stopPropagation(); await Store.trashTask(t.id); await refresh(); U.toast('Tarea enviada a la papelera'); },
      }, [Icons.svg('trash')]),
    ]));

    bindDrag(node, t.id);
    return node;
  }

  /* ---------------- Barra de resumen ---------------- */

  function summary() {
    const counts = QUADS.map(q => tasksOf(q).filter(t => !t.completed).length);
    const total = counts.reduce((a, b) => a + b, 0);

    const bar = el('div.mx__bar');
    QUADS.forEach((q, i) => {
      if (!counts[i]) return;
      bar.appendChild(el('span.mx__seg', {
        style: `flex:${counts[i]}; background:${q.color}`,
        title: `${q.title}: ${counts[i]}`,
      }));
    });

    const pct = n => (total ? Math.round((n / total) * 100) : 0);
    const legend = el('div.mx__legend');
    QUADS.forEach((q, i) => legend.appendChild(el('span.mx__lg', null, [
      el('i', { style: `background:${q.color}` }),
      el('span', { text: `${q.title} ${pct(counts[i])}%` }),
    ])));

    const note = total
      ? (pct(counts[1]) >= 40
          ? 'Buen reparto: la mayor parte de tu carga está en Programar, que es donde conviene vivir.'
          : pct(counts[0]) >= 50
            ? 'Demasiado en Hacer ahora. Al cerrar el día, mueve lo que puedas a Programar con fecha.'
            : 'Revisa Delegar y Eliminar: ahí suele esconderse tiempo recuperable.')
      : 'Aún no hay tareas clasificadas.';

    return el('footer.mx__foot', null, [
      total ? bar : null,
      legend,
      el('p.mx__note', { text: note }),
    ]);
  }

  /* ---------------- Bandeja de sin clasificar ---------------- */

  function renderTray() {
    const box = clear($('#tray', S.root));
    const items = unclassified();

    box.appendChild(el('header.tray__head', null, [
      el('h2', { text: 'Sin clasificar' }),
      el('span.tray__count', { text: String(items.length) }),
    ]));
    box.appendChild(el('p.tray__hint', {
      text: 'Arrástralas a un cuadrante. Suelta una tarea aquí para dejarla otra vez sin clasificar.',
    }));

    const list = el('div.tray__list.scroll');
    if (!items.length) list.appendChild(el('div.tray__empty', { text: 'Todo clasificado. 🎉' }));
    items.forEach(t => {
      const item = el('button.tr-item', { draggable: 'true', dataset: { id: t.id } }, [
        el('span.tr-item__dot', { style: `background:${(S.listById[t.listId] || {}).color || '#4772fa'}` }),
        el('span.tr-item__x', { text: t.title }),
        t.dueDate ? el('span.tr-item__d', { text: U.humanDate(t.dueDate) }) : null,
      ]);
      bindDrag(item, t.id);
      list.appendChild(item);
    });
    box.appendChild(list);

    makeDropTarget(box, () => ({ urgent: null, important: null }), () => 'Devuelta a sin clasificar');
  }

  /* ============================================================
     CLASIFICACIÓN AUTOMÁTICA
     ------------------------------------------------------------
     Urgente    = vence hoy, mañana o ya está atrasada
     Importante = prioridad alta o media
     Solo toca las tareas que aún no están clasificadas.
     ============================================================ */

  function suggest(t) {
    const limit = U.addDays(U.today(), 1);
    return {
      urgent: !!(t.dueDate && t.dueDate <= limit),
      important: t.priority >= 2,
    };
  }

  async function autoClassify() {
    const items = unclassified();
    if (!items.length) return;
    for (const t of items) await Store.updateTask(t.id, suggest(t));
    await refresh();
    U.toast(`${items.length} tarea${items.length === 1 ? '' : 's'} clasificada${items.length === 1 ? '' : 's'}`);
  }

  /* ============================================================
     ARRASTRAR Y SOLTAR
     ============================================================ */

  let dragId = null;

  function bindDrag(node, id) {
    node.addEventListener('dragstart', ev => {
      dragId = id;
      ev.dataTransfer.effectAllowed = 'move';
      try { ev.dataTransfer.setData('text/plain', id); } catch (e) { /* noop */ }
      node.classList.add('is-dragging');
      document.body.classList.add('is-dnd');
    });
    node.addEventListener('dragend', () => {
      dragId = null;
      node.classList.remove('is-dragging');
      document.body.classList.remove('is-dnd');
      $$('.is-dropping', S.root).forEach(n => n.classList.remove('is-dropping'));
    });
  }

  function makeDropTarget(node, patchFor, messageFor) {
    node.addEventListener('dragover', ev => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      node.classList.add('is-dropping');
    });
    node.addEventListener('dragleave', ev => {
      if (ev.target === node) node.classList.remove('is-dropping');
    });
    node.addEventListener('drop', async ev => {
      ev.preventDefault(); ev.stopPropagation();
      node.classList.remove('is-dropping');
      const id = dragId || (ev.dataTransfer && ev.dataTransfer.getData('text/plain'));
      if (!id) return;
      const patch = patchFor(ev);
      const task = await Store.updateTask(id, patch);
      dragId = null;
      await refresh();
      U.toast(messageFor ? messageFor(task) : 'Tarea movida');
    });
  }

  /* ============================================================
     TECLADO
     ============================================================ */

  function onKey(ev) {
    if (!S.root) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === 'a' || ev.key === 'A') autoClassify();
    if (ev.key === 'c' || ev.key === 'C') { S.showDone = !S.showDone; render(); }
  }

  /* ---------------- Export ---------------- */

  window.MatrixModule = {
    id: 'matrix',
    label: 'Matriz de Eisenhower',
    icon: 'matrix',
    mount, unmount, refresh,
    badge: () => unclassified().length,
  };
})();
