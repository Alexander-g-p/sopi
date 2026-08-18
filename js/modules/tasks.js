/* ============================================================
   SOPI · MÓDULO 1 · TAREA (vista Hoy)
   ------------------------------------------------------------
   Responde a la pregunta central: ¿qué tengo que hacer hoy?
   Tres columnas: barra lateral (vistas + listas), lista de
   tareas agrupada, y panel de detalle.

   Contrato con App:  { id, label, icon, mount(root), unmount() }
   ============================================================ */
(function () {
  'use strict';

  const { el, clear, $, $$ } = U;

  /* ---------------- Estado del módulo ---------------- */

  const S = {
    view:     { type: 'smart', key: 'today' },   // smart | list | completed | trash
    selected: null,
    search:   '',
    sort:     'date',        // date | priority | title | created
    lists:    [],
    tasks:    [],
    counts:   {},
    showCompleted: false,
    root:     null,
  };

  const SMART = {
    today:    { label: 'Hoy',              icon: 'sun'     },
    tomorrow: { label: 'Mañana',           icon: 'sunrise' },
    next7:    { label: 'Próximos 7 días',  icon: 'stack'   },
    inbox:    { label: 'Todas las tareas', icon: 'inbox'   },
  };

  /* ============================================================
     MONTAJE
     ============================================================ */

  function mount(root) {
    S.root = root;
    clear(root);

    root.appendChild(el('aside.side', { id: 'side' }));
    root.appendChild(el('section.col', { id: 'col' }));
    root.appendChild(el('aside.detail', { id: 'detail' }));
    // Fondo oscuro que aparece detrás del cajón de listas en el móvil
    root.appendChild(el('div.scrim', { id: 'scrim', onclick: () => toggleSide(false) }));

    bindGlobalKeys();
    return refresh();
  }

  function unmount() {
    document.removeEventListener('keydown', onKey);
    toggleSide(false);
    S.root = null;
  }

  /** Abre o cierra el cajón lateral (solo tiene efecto en pantallas pequeñas). */
  function toggleSide(abrir) {
    const side = $('#side', S.root);
    if (!side) return;
    const ver = abrir === undefined ? !side.classList.contains('is-open') : abrir;
    side.classList.toggle('is-open', ver);
    document.body.classList.toggle('side-open', ver);
  }

  /** Recarga datos y repinta todo. */
  async function refresh() {
    S.lists  = await Store.getLists();
    S.counts = await Store.getCounts();
    S.tasks  = await loadTasks();
    S.detail = S.selected ? await Store.getTask(S.selected) : null;
    renderSide();
    renderColumn();
    renderDetail();
    if (window.App && App.renderRail) App.renderRail();   // refresca la insignia del rail
  }

  /* ============================================================
     CARGA DE TAREAS SEGÚN LA VISTA
     ============================================================ */

  async function loadTasks() {
    const t0 = U.today();
    const v  = S.view;

    if (S.search) return sortTasks(await Store.getTasks({ search: S.search }));

    /* Vistas por fecha: usan la AGENDA, así las semanales aparecen
       una vez por cada día que les toca. */
    if (v.type === 'smart' && v.key !== 'inbox') {
      let items = [];
      if (v.key === 'today') {
        const hoy = await Store.getAgenda({ from: t0, to: t0 });
        // Atrasadas: solo las de fecha fija (una clase de la semana pasada no es deuda)
        const atrasadas = (await Store.getTasks({ to: U.addDays(t0, -1), hasDate: true, completed: false }))
          .filter(t => t.kind !== 'weekly');
        items = atrasadas.concat(hoy);
      } else if (v.key === 'tomorrow') {
        const t1 = U.addDays(t0, 1);
        items = await Store.getAgenda({ from: t1, to: t1 });
      } else if (v.key === 'next7') {
        items = await Store.getAgenda({ from: t0, to: U.addDays(t0, 7) });
      }
      return sortTasks(items.filter(t => !t.completed));
    }

    /* Vistas por lista: tareas base (la semanal aparece una sola vez,
       con su regla “Lun y Mié” en lugar de una fecha). */
    let filter = {};
    if (v.type === 'trash')          filter = { trashed: true };
    else if (v.type === 'completed') filter = { completed: true };
    else if (v.type === 'list')      filter = { listId: v.key };

    return sortTasks(await Store.getTasks(filter));
  }

  function sortTasks(tasks) {
    const byDate = (a, b) => {
      const ad = a.dueDate || '9999-99-99', bd = b.dueDate || '9999-99-99';
      if (ad !== bd) return ad < bd ? -1 : 1;
      const at = a.dueTime || '99:99', bt = b.dueTime || '99:99';
      if (at !== bt) return at < bt ? -1 : 1;
      return b.priority - a.priority;
    };
    const cmp = {
      date:     byDate,
      priority: (a, b) => (b.priority - a.priority) || byDate(a, b),
      title:    (a, b) => a.title.localeCompare(b.title, 'es'),
      created:  (a, b) => (a.createdAt < b.createdAt ? 1 : -1),
    }[S.sort] || byDate;

    // Las completadas siempre al final
    return tasks.slice().sort((a, b) =>
      (a.completed === b.completed) ? cmp(a, b) : (a.completed ? 1 : -1));
  }

  /* ============================================================
     BARRA LATERAL
     ============================================================ */

  function renderSide() {
    const side = $('#side', S.root);
    clear(side);

    /* Buscador */
    const searchInput = el('input.search__input', {
      type: 'search', placeholder: 'Buscar tareas…', value: S.search,
      oninput: U.debounce(async ev => {
        S.search = ev.target.value.trim();
        S.tasks = await loadTasks();
        renderColumn();
      }, 180),
    });
    side.appendChild(el('div.search', null, [Icons.svg('search'), searchInput]));

    /* Vistas inteligentes */
    const smart = el('nav.side__nav');
    Object.keys(SMART).forEach(key => {
      const cfg   = SMART[key];
      const count = key === 'inbox'
        ? (S.counts.inbox || 0)
        : (S.counts[key] || 0);
      smart.appendChild(navItem({
        icon: cfg.icon, label: cfg.label, count,
        active: S.view.type === 'smart' && S.view.key === key,
        onclick: () => go({ type: 'smart', key }),
      }));
    });
    side.appendChild(smart);

    /* Listas */
    const head = el('div.side__head', null, [
      el('span.side__head-t', { text: 'Listas' }),
      el('button.btn--icon', {
        title: 'Nueva lista', onclick: createListPrompt,
      }, [Icons.svg('plus')]),
    ]);
    side.appendChild(head);

    const listNav = el('nav.side__nav');
    S.lists.forEach(list => {
      const item = navItem({
        dot: list.color,
        label: list.name,
        count: (S.counts.byList && S.counts.byList[list.id]) || 0,
        active: S.view.type === 'list' && S.view.key === list.id,
        onclick: () => go({ type: 'list', key: list.id }),
      });
      item.appendChild(el('button.nav__more', {
        title: 'Opciones', onclick: ev => { ev.stopPropagation(); listMenu(list, ev.currentTarget); },
      }, [Icons.svg('more')]));
      listNav.appendChild(item);
    });
    side.appendChild(listNav);

    /* Pie */
    const foot = el('nav.side__nav.side__nav--foot');
    foot.appendChild(navItem({
      icon: 'done', label: 'Completadas', count: S.counts.completed || 0,
      active: S.view.type === 'completed',
      onclick: () => go({ type: 'completed' }),
    }));
    foot.appendChild(navItem({
      icon: 'trash', label: 'Papelera', count: S.counts.trashed || 0,
      active: S.view.type === 'trash',
      onclick: () => go({ type: 'trash' }),
    }));
    side.appendChild(foot);
  }

  function navItem({ icon, dot, label, count, active, onclick }) {
    const node = el('button.nav__item', { onclick });
    if (active) node.classList.add('is-active');
    node.appendChild(dot
      ? el('span.nav__dot', { style: `background:${dot}` })
      : el('span.nav__icon', null, [Icons.svg(icon)]));
    node.appendChild(el('span.nav__label', { text: label }));
    if (count) node.appendChild(el('span.nav__count', { text: String(count) }));
    return node;
  }

  async function go(view) {
    S.view = view;
    S.search = '';
    S.selected = null;
    S.showCompleted = false;
    toggleSide(false);        // al elegir una vista, el cajón se cierra solo
    S.tasks = await loadTasks();
    S.counts = await Store.getCounts();
    renderSide();
    renderColumn();
    renderDetail();
  }

  /* ---------------- Listas: crear / renombrar / borrar ---------------- */

  const COLORS = ['#4772fa', '#e64545', '#f0a92a', '#35b98a', '#8a6cf0', '#00b8d9', '#ff7a59'];

  async function createListPrompt() {
    const name = await UI.prompt({
      title: 'Nueva lista',
      label: 'Nombre de la lista',
      placeholder: 'Ej. Universidad, Casa, Proyecto Muelle',
      confirmText: 'Crear lista',
    });
    if (!name) return;
    try {
      const color = COLORS[S.lists.length % COLORS.length];
      const list = await Store.createList({ name, color });
      await refresh();
      go({ type: 'list', key: list.id });
      U.toast('Lista creada');
    } catch (e) { U.toast(e.message, 'error'); }
  }

  function listMenu(list, anchor) {
    closeMenus();
    const rect = anchor.getBoundingClientRect();
    const menu = el('div.menu', { id: 'ctx-menu', style: `top:${rect.bottom + 6}px; left:${rect.left - 90}px` });

    menu.appendChild(el('button.menu__item', {
      text: 'Renombrar…',
      onclick: async () => {
        closeMenus();
        const name = await UI.prompt({
          title: 'Renombrar lista',
          label: 'Nuevo nombre',
          value: list.name,
        });
        if (!name) return;
        await Store.updateList(list.id, { name });
        await refresh();
      },
    }));

    const colors = el('div.menu__colors');
    COLORS.forEach(c => colors.appendChild(el('button.menu__color', {
      style: `background:${c}`, title: c,
      onclick: async () => { closeMenus(); await Store.updateList(list.id, { color: c }); await refresh(); },
    })));
    menu.appendChild(el('div.menu__label', { text: 'Color' }));
    menu.appendChild(colors);

    menu.appendChild(el('button.menu__item.menu__item--danger', {
      text: 'Eliminar lista',
      onclick: async () => {
        closeMenus();
        const ok = await UI.confirm({
          title: `¿Eliminar la lista “${list.name}”?`,
          message: 'La lista desaparece y sus tareas se mueven a la papelera, así que puedes recuperarlas.',
          confirmText: 'Eliminar lista',
        });
        if (!ok) return;
        try {
          await Store.deleteList(list.id);
          if (S.view.type === 'list' && S.view.key === list.id) S.view = { type: 'smart', key: 'today' };
          await refresh();
          U.toast('Lista eliminada');
        } catch (e) { U.toast(e.message, 'error'); }
      },
    }));

    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', closeMenus, { once: true }), 0);
  }

  function closeMenus() {
    $$('#ctx-menu').forEach(m => m.remove());
  }

  /* ============================================================
     COLUMNA CENTRAL
     ============================================================ */

  function viewTitle() {
    if (S.search) return `Resultados de “${S.search}”`;
    if (S.view.type === 'smart')     return SMART[S.view.key].label;
    if (S.view.type === 'completed') return 'Completadas';
    if (S.view.type === 'trash')     return 'Papelera';
    const l = S.lists.find(x => x.id === S.view.key);
    return l ? l.name : 'Lista';
  }

  function renderColumn() {
    const col = $('#col', S.root);
    clear(col);

    /* ---- Cabecera ---- */
    const pending = S.tasks.filter(t => !t.completed).length;
    const head = el('header.col__head', null, [
      el('div.col__title', null, [
        // Botón para abrir las listas en pantallas pequeñas
        el('button.col__menu', {
          title: 'Ver listas y vistas',
          onclick: ev => { ev.stopPropagation(); toggleSide(true); },
        }, [Icons.svg('menu', { width: 2 })]),
        el('h1', { text: viewTitle() }),
        pending ? el('span.col__count', { text: String(pending) }) : null,
      ]),
      el('div.col__actions', null, [
        S.view.type === 'trash' && S.tasks.length
          ? el('button.btn.btn--soft', {
              text: 'Vaciar papelera',
              onclick: async () => {
                const ok = await UI.confirm({
                  title: '¿Vaciar la papelera?',
                  message: 'Las tareas de la papelera se borrarán definitivamente. Esto no se puede deshacer.',
                  confirmText: 'Vaciar papelera',
                });
                if (!ok) return;
                await Store.emptyTrash(); await refresh(); U.toast('Papelera vacía');
              },
            })
          : null,
        el('button.btn--icon', { title: 'Ordenar', onclick: ev => sortMenu(ev.currentTarget) }, [Icons.svg('sort')]),
      ]),
    ]);
    col.appendChild(head);

    /* ---- Fecha de hoy en la vista Hoy ---- */
    if (S.view.type === 'smart' && S.view.key === 'today' && !S.search) {
      const d = new Date();
      const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio',
                     'agosto','septiembre','octubre','noviembre','diciembre'];
      const dow = U.DOW[d.getDay()];
      col.appendChild(el('p.col__sub', {
        text: `${dow.charAt(0).toUpperCase() + dow.slice(1)} ${d.getDate()} de ${MESES[d.getMonth()]}`,
      }));
    }

    /* ---- Quick add ---- */
    if (S.view.type !== 'trash' && S.view.type !== 'completed') col.appendChild(quickAdd());

    /* ---- Cuerpo ---- */
    const body = el('div.col__body.scroll');
    const groups = groupTasks(S.tasks);

    if (!S.tasks.length) {
      body.appendChild(emptyState());
    } else {
      groups.forEach(g => {
        if (!g.items.length) return;
        body.appendChild(el('h2.group__title', null, [
          el('span', { text: g.label }),
          el('span.group__count', { text: String(g.items.length) }),
        ]));
        const ul = el('ul.tasks');
        g.items.forEach(t => ul.appendChild(taskRow(t)));
        body.appendChild(ul);
      });
    }
    col.appendChild(body);

    // Tras agregar una tarea, el cursor vuelve al nombre para seguir escribiendo
    if (S.focusComposer) {
      S.focusComposer = false;
      const i = $('.qa__input', S.root);
      if (i) i.focus();
    }
  }

  function groupTasks(tasks) {
    const t0 = U.today();
    const pend = tasks.filter(t => !t.completed);
    const done = tasks.filter(t => t.completed);

    let groups = [];

    if (S.view.type === 'trash' || S.view.type === 'completed' || S.search) {
      groups = [{ label: viewTitle(), items: tasks }];
      return groups;
    }

    if (S.view.type === 'smart' && S.view.key === 'today') {
      groups = [
        { label: 'Atrasadas', items: pend.filter(t => t.dueDate && t.dueDate < t0) },
        { label: 'Hoy',       items: pend.filter(t => t.dueDate === t0) },
      ];
    } else if (S.view.type === 'smart' && S.view.key === 'next7') {
      const map = new Map();
      pend.forEach(t => {
        const k = t.dueDate || 'sin';
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(t);
      });
      groups = Array.from(map.keys()).sort().map(k => {
        if (k === 'sin') return { label: 'Sin fecha', items: map.get(k) };
        const diff = U.daysBetween(t0, k);
        // "Hoy" / "Mañana" ya se explican solos; del resto añadimos el "en N días"
        const label = diff <= 1 ? U.humanDate(k) : `${U.humanDate(k)}  ·  ${U.humanRelative(k)}`;
        return { label, items: map.get(k) };
      });
    } else {
      groups = [
        { label: 'Con fecha', items: pend.filter(t => t.dueDate) },
        { label: 'Sin fecha', items: pend.filter(t => !t.dueDate) },
      ];
      if (groups[0].items.length === 0 || groups[1].items.length === 0) {
        groups = [{ label: 'Pendientes', items: pend }];
      }
    }

    if (done.length) groups.push({ label: `Completadas (${done.length})`, items: done });
    return groups;
  }

  function emptyState() {
    const msgs = {
      today:    ['¡Nada pendiente para hoy!', 'Agrega una tarea arriba y empieza tu día con claridad.'],
      tomorrow: ['Mañana está libre', 'Planifica algo hoy y te lo encuentras listo mañana.'],
      next7:    ['Semana despejada', 'Sin tareas con fecha en los próximos 7 días.'],
      inbox:    ['Todo limpio', 'Aún no tienes tareas. Escribe la primera arriba.'],
    };
    const key = S.view.type === 'smart' ? S.view.key : S.view.type;
    const txt = msgs[key] || (
      S.view.type === 'trash'     ? ['Papelera vacía', 'Lo que elimines aparecerá aquí.'] :
      S.view.type === 'completed' ? ['Sin tareas completadas', 'Cuando termines algo, se guardará aquí.'] :
      S.search                    ? ['Sin resultados', 'Prueba con otras palabras.'] :
                                    ['Lista vacía', 'Agrega tu primera tarea arriba.']);
    return el('div.empty', null, [
      el('div.empty__icon', null, [Icons.svg(S.view.type === 'trash' ? 'trash' : 'tasks', { width: 1.5 })]),
      el('h3', { text: txt[0] }),
      el('p',  { text: txt[1] }),
    ]);
  }

  /* ============================================================
     FORMULARIO DE NUEVA TAREA
     ------------------------------------------------------------
     Campos separados: nombre · fecha · hora · lista · prioridad.
     Además sigue entendiendo el lenguaje natural: si escribes
     “mañana 15:30 !1 #Trabajo” en el nombre, los campos de abajo
     se rellenan solos y el nombre se queda limpio al guardar.
     ============================================================ */

  /** Valores por defecto según la vista en la que estás. */
  function composerDefaults() {
    const d = { dueDate: '', dueTime: '', priority: 0, listId: '' };
    if (S.view.type === 'smart') {
      if (S.view.key === 'today')    d.dueDate = U.today();
      if (S.view.key === 'tomorrow') d.dueDate = U.addDays(U.today(), 1);
    }
    if (S.view.type === 'list') d.listId = S.view.key;
    return d;
  }

  function quickAdd() {
    const def = composerDefaults();
    const kind = S.composerKind || 'normal';
    const K = U.KINDS[kind];

    /* --- Pestañas de tipo --- */
    const tabs = el('div.qa__kinds');
    ['normal', 'weekly', 'instant'].forEach(k => {
      const cfg = U.KINDS[k];
      const btn = el('button.qa__kind' + (k === kind ? '.is-on' : ''), {
        type: 'button',
        style: `--c:${cfg.color}`,
        title: cfg.hint,
        onclick: () => { S.composerKind = k; renderColumn(); },
      }, [Icons.svg(cfg.icon, { width: 2.2 }), el('span', { text: cfg.label })]);
      tabs.appendChild(btn);
    });

    /* --- Nombre --- */
    const title = el('input.qa__input', {
      type: 'text',
      placeholder: kind === 'weekly'  ? 'Ej. Clase de Estructuras II'
                 : kind === 'instant' ? '¿Qué hay que hacer ahora mismo?'
                 : '¿Qué tienes que hacer?',
      autocomplete: 'off',
    });

    /* --- Campos --- */
    const dateI = el('input.qa__c', { type: 'date', value: def.dueDate });
    const timeI = el('input.qa__c', { type: 'time', value: def.dueTime });

    /* --- Días de la semana (solo en semanal) --- */
    const days = new Set(S.composerDays || []);
    const daysBox = el('div.qa__days');
    [1, 2, 3, 4, 5, 6, 0].forEach(d => {
      const b = el('button.qa__day' + (days.has(d) ? '.is-on' : ''), {
        type: 'button',
        text: ['D', 'L', 'M', 'X', 'J', 'V', 'S'][d],
        title: U.DOW[d],
        onclick: ev => {
          ev.preventDefault();
          days.has(d) ? days.delete(d) : days.add(d);
          S.composerDays = Array.from(days);
          b.classList.toggle('is-on', days.has(d));
        },
      });
      daysBox.appendChild(b);
    });

    const listS = el('select.qa__c');
    function fillLists(selectedId) {
      clear(listS);
      listS.appendChild(el('option', { value: '', text: 'Bandeja de entrada' }));
      S.lists.forEach((l, i) => {
        if (i === 0) return;                    // la primera ES la bandeja
        listS.appendChild(el('option', { value: l.id, text: l.name }));
      });
      listS.appendChild(el('option', { value: '__new', text: '＋ Nueva lista…' }));
      listS.value = selectedId || '';
    }
    fillLists(def.listId);
    listS.addEventListener('change', async () => {
      if (listS.value !== '__new') return;
      const name = await UI.prompt({
        title: 'Nueva lista',
        label: 'Nombre de la lista',
        placeholder: 'Ej. Universidad, Casa, Proyecto Muelle',
        confirmText: 'Crear lista',
      });
      if (!name) { fillLists(''); return; }
      const l = await Store.createList({ name, color: COLORS[S.lists.length % COLORS.length] });
      S.lists = await Store.getLists();
      fillLists(l.id);
      renderSide();
    });

    const prioS = el('select.qa__c');
    [[0, 'Sin prioridad'], [3, 'Alta'], [2, 'Media'], [1, 'Baja']].forEach(([v, label]) =>
      prioS.appendChild(el('option', { value: String(v), text: label, selected: v === def.priority })));

    /* --- Lenguaje natural: rellena los campos mientras escribes --- */
    title.addEventListener('input', () => {
      const p = U.parseQuickAdd(title.value);
      if (p.dueDate)  dateI.value = p.dueDate;
      if (p.dueTime)  timeI.value = p.dueTime;
      if (p.priority) prioS.value = String(p.priority);
      if (p.listName) {
        const found = S.lists.find(l => l.name.toLowerCase() === p.listName.toLowerCase());
        if (found) listS.value = S.lists.indexOf(found) === 0 ? '' : found.id;
      }
    });

    /* --- Guardar --- */
    async function submit() {
      const raw = title.value.trim();
      if (!raw) { title.focus(); return; }
      if (kind === 'weekly' && !days.size) {
        U.toast('Elige al menos un día de la semana', 'error');
        return;
      }
      const p = U.parseQuickAdd(raw);          // limpia fecha/hora/!1/#lista del texto

      let listId = listS.value === '__new' ? '' : listS.value;
      if (!listId && p.listName) {             // lista escrita con # que aún no existe
        const found = S.lists.find(l => l.name.toLowerCase() === p.listName.toLowerCase());
        listId = found ? found.id : (await Store.createList({
          name: p.listName, color: COLORS[S.lists.length % COLORS.length],
        })).id;
      }

      const data = {
        title: p.title || raw,
        kind,
        dueTime: timeI.value || null,
        priority: parseInt(prioS.value, 10) || 0,
        listId: listId || undefined,
      };

      if (kind === 'weekly') {
        data.repeat = { days: Array.from(days) };
        data.dueDate = dateI.value || U.today();   // desde cuándo empieza a repetirse
      } else if (kind === 'instant') {
        data.dueDate = dateI.value || U.today();
      } else {
        data.dueDate = dateI.value || null;
      }

      try {
        const task = await Store.createTask(data);
        // En pantallas pequeñas el panel de detalle ocupa toda la pantalla:
        // si se abriera solo, taparía el formulario y no dejaría seguir.
        S.selected = window.innerWidth > 760 ? task.id : null;
        S.focusComposer = true;
        await refresh();
        U.toast(kind === 'weekly'
          ? `Se repetirá: ${U.repeatLabel(Array.from(days))}${data.dueTime ? ' · ' + data.dueTime : ''}`
          : kind === 'instant' ? 'Tarea instantánea creada' : 'Tarea agregada');
      } catch (e) { U.toast(e.message, 'error'); }
    }

    /* --- Armado del formulario según el tipo --- */
    const row = el('div.qa__row');
    if (kind === 'weekly') {
      row.appendChild(field('Días de la semana', daysBox, 'qa__f--days'));
      row.appendChild(field('Hora', timeI));
      row.appendChild(field('Desde', dateI));
    } else {
      row.appendChild(field('Fecha', dateI));
      row.appendChild(field('Hora', timeI));
    }
    row.appendChild(field('Lista', listS));
    row.appendChild(field('Prioridad', prioS));
    row.appendChild(el('button.btn.btn--primary.qa__go', {
      type: 'submit',
      text: kind === 'weekly' ? 'Crear repetición' : kind === 'instant' ? 'Anotar' : 'Agregar',
    }));

    const form = el('form.qa', {
      style: `--c:${K.color}`,
      dataset: { kind },
      onsubmit: ev => { ev.preventDefault(); submit(); },
    }, [
      tabs,
      el('div.qa__top', null, [
        el('span.qa__plus', null, [Icons.svg(K.icon, { width: 2 })]),
        title,
      ]),
      row,
      el('p.qa__tip', {
        text: kind === 'normal'
          ? 'Atajo: escribe todo junto y se reparte solo — “Llamar al banco mañana 15:30 !1 #Trabajo”.'
          : K.hint,
      }),
    ]);

    title.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') { title.value = ''; title.blur(); }
    });

    return form;
  }

  function field(label, control, extraClass) {
    const node = el('label.qa__f', null, [el('span.qa__l', { text: label }), control]);
    if (extraClass) node.classList.add(extraClass.replace(/^\./, ''));
    return node;
  }

  /* ============================================================
     COMPLETAR SEGÚN EL TIPO
     ------------------------------------------------------------
       normal   -> se marca y pasa a Completadas
       semanal  -> se marca SOLO ese día; la tarea sigue viva
       instant  -> se completa y se elimina (no deja rastro)
     ============================================================ */

  async function completeTask(t) {
    if (t.kind === 'weekly') {
      const date = t.dueDate || U.today();
      const hecho = await Store.toggleOccurrence(t.id, date);
      if (hecho) U.toast(`Hecho el ${U.humanDate(date).toLowerCase()} · vuelve la próxima semana`);
      return;
    }
    if (t.kind === 'instant' && !t.completed) {
      await Store.deleteTask(t.id);
      if (S.selected === t.id) S.selected = null;
      U.toast('Instantánea completada y eliminada');
      return;
    }
    await Store.toggleTask(t.id);
  }

  /* ---------------- Fila de tarea ---------------- */

  function taskRow(t) {
    const list = S.lists.find(l => l.id === t.listId);
    const K = U.kindOf(t);
    const li = el('li.task', { dataset: { id: t.id } });
    li.style.setProperty('--k', K.color);
    if (t.kind && t.kind !== 'normal') li.classList.add('is-' + t.kind);
    if (t.completed) li.classList.add('is-done');
    if (S.selected === t.id) li.classList.add('is-selected');

    /* Casilla: su forma y color dicen de qué tipo es la tarea */
    const box = el('button.task__box.box--' + K.key, {
      title: t.completed ? 'Marcar como pendiente' : 'Completar',
      onclick: async ev => {
        ev.stopPropagation();
        if (S.view.type === 'trash') return;
        li.classList.add('is-checking');
        await completeTask(t);
        setTimeout(refresh, 140);
      },
    }, [Icons.svg(t.completed ? 'check' : K.icon, { width: 2.6 })]);
    if (t.priority && !t.completed) {
      box.style.borderColor = U.PRIORITY[t.priority].color;
      box.style.setProperty('--hover', U.PRIORITY[t.priority].color);
    }

    /* Contenido */
    const meta = el('div.task__meta');

    /* Etiqueta del tipo (semanal / instantánea) */
    if (t.kind === 'weekly') {
      meta.appendChild(el('span.kind-tag.kind-tag--weekly', null, [
        Icons.svg('repeat'),
        el('span', { text: t.isOcc ? 'Cada semana' : U.repeatLabel((t.repeat || {}).days) }),
      ]));
    } else if (t.kind === 'instant') {
      meta.appendChild(el('span.kind-tag.kind-tag--instant', null, [
        Icons.svg('bolt'), el('span', { text: 'Una vez' }),
      ]));
    }

    if (t.dueDate && !(t.kind === 'weekly' && !t.isOcc)) {
      const overdue = !t.completed && t.dueDate < U.today();
      const isToday = t.dueDate === U.today();
      meta.appendChild(el('span.task__date' + (overdue ? '.is-overdue' : isToday ? '.is-today' : ''), {
        text: U.humanDate(t.dueDate) + (t.dueTime ? ' · ' + t.dueTime : ''),
      }));
    } else if (t.kind === 'weekly' && t.dueTime) {
      meta.appendChild(el('span.task__date', { text: t.dueTime }));
    }
    if (t.subtasks && t.subtasks.length) {
      meta.appendChild(el('span.task__tag', null, [
        Icons.svg('subtask'),
        el('span', { text: `${t.subtasks.filter(s => s.done).length}/${t.subtasks.length}` }),
      ]));
    }
    if (t.note) meta.appendChild(el('span.task__tag', null, [Icons.svg('note')]));
    if (list && S.view.type !== 'list') {
      meta.appendChild(el('span.task__list', null, [
        el('span.nav__dot', { style: `background:${list.color}` }),
        el('span', { text: list.name }),
      ]));
    }

    const main = el('div.task__main', null, [
      el('span.task__title', { text: t.title }),
      meta.childNodes.length ? meta : null,
    ]);

    /* Acciones rápidas */
    const actions = el('div.task__actions');
    if (S.view.type === 'trash') {
      actions.appendChild(el('button.btn--icon', {
        title: 'Restaurar',
        onclick: async ev => { ev.stopPropagation(); await Store.restoreTask(t.id); await refresh(); U.toast('Tarea restaurada'); },
      }, [Icons.svg('restore')]));
      actions.appendChild(el('button.btn--icon', {
        title: 'Borrar definitivamente',
        onclick: async ev => { ev.stopPropagation(); await Store.deleteTask(t.id); await refresh(); },
      }, [Icons.svg('close')]));
    } else {
      actions.appendChild(el('button.btn--icon', {
        title: 'Enviar a la papelera',
        onclick: async ev => {
          ev.stopPropagation();
          await Store.trashTask(t.id);
          if (S.selected === t.id) S.selected = null;
          await refresh();
          U.toast('Tarea enviada a la papelera');
        },
      }, [Icons.svg('trash')]));
    }

    li.appendChild(box);
    li.appendChild(main);
    li.appendChild(actions);
    li.addEventListener('click', async () => {
      S.selected = t.id;
      S.detail = await Store.getTask(t.id);
      $$('.task', S.root).forEach(n => n.classList.toggle('is-selected', n.dataset.id === t.id));
      renderDetail();
    });
    return li;
  }

  /* ---------------- Menú de orden ---------------- */

  function sortMenu(anchor) {
    closeMenus();
    const rect = anchor.getBoundingClientRect();
    const menu = el('div.menu', { id: 'ctx-menu', style: `top:${rect.bottom + 6}px; left:${rect.right - 190}px` });
    menu.appendChild(el('div.menu__label', { text: 'Ordenar por' }));
    [['date', 'Fecha'], ['priority', 'Prioridad'], ['title', 'Título'], ['created', 'Más reciente']]
      .forEach(([key, label]) => {
        const item = el('button.menu__item', { text: label, onclick: async () => {
          closeMenus(); S.sort = key; S.tasks = sortTasks(S.tasks); renderColumn();
        }});
        if (S.sort === key) item.classList.add('is-on');
        menu.appendChild(item);
      });
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', closeMenus, { once: true }), 0);
  }

  /* ============================================================
     PANEL DE DETALLE
     ============================================================ */

  function renderDetail() {
    const box = $('#detail', S.root);
    clear(box);
    // Preferimos la tarea base (con su regla completa) sobre la ocurrencia
    const t = S.detail && S.detail.id === S.selected
      ? S.detail
      : S.tasks.find(x => x.id === S.selected);

    if (!t) {
      box.classList.remove('is-open');
      box.appendChild(el('div.detail__empty', null, [
        el('div.empty__icon', null, [Icons.svg('note', { width: 1.5 })]),
        el('p', { text: 'Selecciona una tarea para ver y editar sus detalles.' }),
      ]));
      return;
    }
    box.classList.add('is-open');
    const K = U.kindOf(t);
    box.style.setProperty('--k', K.color);
    box.style.setProperty('--c', K.color);   // los controles del tipo usan --c

    const save = U.debounce(async patch => {
      await Store.updateTask(t.id, patch);
      S.tasks = await loadTasks();
      S.counts = await Store.getCounts();
      renderSide(); renderColumn();
    }, 380);

    /* Cabecera */
    box.appendChild(el('header.detail__head', null, [
      el('span.detail__crumb', null, [
        el('span.kind-chip', { style: `--c:${K.color}`, title: K.hint }, [
          Icons.svg(K.icon, { width: 2.2 }), el('span', { text: K.label }),
        ]),
        el('span', { text: (S.lists.find(l => l.id === t.listId) || {}).name || 'Sin lista' }),
      ]),
      el('button.btn--icon', { title: 'Cerrar', onclick: () => { S.selected = null; renderColumn(); renderDetail(); } }, [Icons.svg('close')]),
    ]));

    const body = el('div.detail__body.scroll');

    /* Título */
    const title = el('textarea.detail__title', { rows: 1 });
    title.value = t.title;   // en <textarea> el valor va por propiedad, no por atributo
    title.addEventListener('input', ev => {
      autoGrow(ev.target);
      const v = ev.target.value.trim();
      if (v) save({ title: v });
    });
    body.appendChild(title);
    setTimeout(() => autoGrow(title), 0);

    /* Completar */
    const hoyHecho = t.kind === 'weekly' && (t.doneDates || []).includes(U.today());
    body.appendChild(el('button.detail__done' + ((t.completed || hoyHecho) ? '.is-on' : ''), {
      onclick: async () => { await completeTask(t.kind === 'weekly' ? Object.assign({}, t, { dueDate: U.today() }) : t); await refresh(); },
    }, [
      Icons.svg('check', { width: 2.4 }),
      el('span', {
        text: t.kind === 'weekly'
          ? (hoyHecho ? 'Hecho hoy' : 'Marcar hecho hoy')
          : t.kind === 'instant'
            ? 'Completar y eliminar'
            : (t.completed ? 'Completada' : 'Marcar como completada'),
      }),
    ]));

    /* --- Semanal: días de repetición --- */
    if (t.kind === 'weekly') {
      body.appendChild(el('h4.detail__label', { text: 'Se repite los' }));
      const picker = el('div.qa__days');
      [1, 2, 3, 4, 5, 6, 0].forEach(d => {
        const on = ((t.repeat || {}).days || []).includes(d);
        picker.appendChild(el('button.qa__day' + (on ? '.is-on' : ''), {
          type: 'button', text: ['D', 'L', 'M', 'X', 'J', 'V', 'S'][d], title: U.DOW[d],
          onclick: async () => {
            const days = ((t.repeat || {}).days || []);
            const next = on ? days.filter(x => x !== d) : days.concat([d]);
            if (!next.length) { U.toast('Deja al menos un día', 'error'); return; }
            await Store.updateTask(t.id, { repeat: { days: next } });
            await refresh();
          },
        }));
      });
      body.appendChild(picker);
      body.appendChild(el('p.detail__hint', {
        text: `${U.repeatLabel((t.repeat || {}).days)}${t.dueTime ? ' · ' + t.dueTime : ''} · ${(t.doneDates || []).length} veces hechas`,
      }));

      body.appendChild(el('h4.detail__label', { text: 'Hora' }));
      const timeW = el('input', { type: 'time', class: 'detail__input', value: t.dueTime || '' });
      timeW.addEventListener('change', () => save({ dueTime: timeW.value || null }));
      body.appendChild(timeW);
    } else {
      /* Fecha y hora */
      body.appendChild(el('h4.detail__label', { text: 'Fecha' }));
      const dateInput = el('input', { type: 'date', class: 'detail__input', value: t.dueDate || '' });
      const timeInput = el('input', { type: 'time', class: 'detail__input', value: t.dueTime || '' });
      dateInput.addEventListener('change', () => save({ dueDate: dateInput.value || null }));
      timeInput.addEventListener('change', () => save({ dueTime: timeInput.value || null }));
      body.appendChild(el('div.detail__row', null, [dateInput, timeInput]));

      const quick = el('div.detail__quick');
      [['Hoy', U.today()], ['Mañana', U.addDays(U.today(), 1)], ['+1 semana', U.addDays(U.today(), 7)]]
        .forEach(([label, value]) => quick.appendChild(el('button.pill', {
          text: label,
          onclick: async () => { await Store.updateTask(t.id, { dueDate: value }); await refresh(); },
        })));
      if (t.dueDate) quick.appendChild(el('button.pill.pill--muted', {
        text: 'Quitar fecha',
        onclick: async () => { await Store.updateTask(t.id, { dueDate: null, dueTime: null }); await refresh(); },
      }));
      body.appendChild(quick);
    }

    /* Prioridad */
    body.appendChild(el('h4.detail__label', { text: 'Prioridad' }));
    const prio = el('div.detail__prio');
    [3, 2, 1, 0].forEach(p => {
      const b = el('button.prio' + (t.priority === p ? '.is-on' : ''), {
        title: U.PRIORITY[p].label,
        onclick: async () => { await Store.updateTask(t.id, { priority: p }); await refresh(); },
      }, [Icons.svg('flag'), el('span', { text: U.PRIORITY[p].label })]);
      b.style.setProperty('--c', U.PRIORITY[p].color);
      prio.appendChild(b);
    });
    body.appendChild(prio);

    /* Lista */
    body.appendChild(el('h4.detail__label', { text: 'Lista' }));
    const select = el('select.detail__input');
    S.lists.forEach(l => select.appendChild(el('option', { value: l.id, text: l.name, selected: l.id === t.listId })));
    select.addEventListener('change', async () => { await Store.updateTask(t.id, { listId: select.value }); await refresh(); });
    body.appendChild(select);

    /* Subtareas */
    body.appendChild(el('h4.detail__label', { text: `Subtareas (${(t.subtasks || []).filter(s => s.done).length}/${(t.subtasks || []).length})` }));
    const subs = el('ul.subs');
    (t.subtasks || []).forEach(s => {
      subs.appendChild(el('li.sub' + (s.done ? '.is-done' : ''), null, [
        el('button.sub__box', {
          onclick: async () => {
            const arr = (t.subtasks || []).map(x => x.id === s.id ? Object.assign({}, x, { done: !x.done }) : x);
            await Store.updateTask(t.id, { subtasks: arr }); await refresh();
          },
        }, [Icons.svg('check', { width: 2.6 })]),
        el('span.sub__title', { text: s.title }),
        el('button.btn--icon', {
          title: 'Quitar',
          onclick: async () => {
            const arr = (t.subtasks || []).filter(x => x.id !== s.id);
            await Store.updateTask(t.id, { subtasks: arr }); await refresh();
          },
        }, [Icons.svg('close')]),
      ]));
    });
    body.appendChild(subs);

    const subInput = el('input.detail__input', { type: 'text', placeholder: '+ Agregar subtarea' });
    subInput.addEventListener('keydown', async ev => {
      if (ev.key !== 'Enter' || !subInput.value.trim()) return;
      const arr = (t.subtasks || []).concat([{ id: U.uid('sub'), title: subInput.value.trim(), done: false }]);
      subInput.value = '';
      await Store.updateTask(t.id, { subtasks: arr });
      await refresh();
      setTimeout(() => { const i = $('#detail .detail__input[placeholder^="+ Agregar sub"]', S.root); if (i) i.focus(); }, 30);
    });
    body.appendChild(subInput);

    /* Notas */
    body.appendChild(el('h4.detail__label', { text: 'Notas' }));
    const note = el('textarea.detail__note', { rows: 4, placeholder: 'Descripción, enlaces, contexto…' });
    note.value = t.note || '';
    note.addEventListener('input', ev => save({ note: ev.target.value }));
    body.appendChild(note);

    box.appendChild(body);

    /* Pie */
    box.appendChild(el('footer.detail__foot', null, [
      el('small', { text: 'Creada el ' + new Date(t.createdAt).toLocaleDateString('es-PE') }),
      el('button.btn.btn--soft', {
        text: 'Eliminar',
        onclick: async () => {
          await Store.trashTask(t.id);
          S.selected = null;
          await refresh();
          U.toast('Tarea enviada a la papelera');
        },
      }),
    ]));
  }

  function autoGrow(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.max(ta.scrollHeight, 26) + 'px';
  }

  /* ============================================================
     ATAJOS DE TECLADO
     ============================================================ */

  function onKey(ev) {
    if (!S.root) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);

    // Ctrl/Cmd + K -> buscar
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault();
      const i = $('.search__input', S.root); if (i) i.focus();
      return;
    }
    if (typing) return;

    if (ev.key === 'n') { ev.preventDefault(); const i = $('.qa__input', S.root); if (i) i.focus(); }
    if (ev.key === 'Escape') { S.selected = null; renderColumn(); renderDetail(); }
  }

  function bindGlobalKeys() {
    document.removeEventListener('keydown', onKey);
    document.addEventListener('keydown', onKey);
  }

  /* ---------------- Export ---------------- */

  /**
   * Abre una tarea concreta desde otro módulo (p. ej. el Calendario).
   * Elige la vista que seguro la contiene y la deja seleccionada.
   */
  async function openTask(id) {
    const t = await Store.getTask(id);
    if (!t) { U.toast('Esa tarea ya no existe', 'error'); return; }

    if (t.trashed)        S.view = { type: 'trash' };
    else if (t.completed) S.view = { type: 'completed' };
    else                  S.view = { type: 'list', key: t.listId };

    S.search = '';
    S.selected = id;
    await refresh();

    const row = $(`.task[data-id="${id}"]`, S.root);
    if (row) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  window.TasksModule = {
    id: 'tasks',
    label: 'Tarea',
    icon: 'tasks',
    mount, unmount, refresh, openTask,
    badge: () => (S.counts.today || 0),
  };
})();
