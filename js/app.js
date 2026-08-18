/* ============================================================
   SOPI · app.js
   Orquestador: pantallas, rail de módulos y sesión.
   Al iniciar sesión se entra directo a la app con los 6 módulos
   activos (no hay pantalla de selección de funciones).
   ------------------------------------------------------------
   Para agregar un módulo nuevo:
     1) crear js/modules/<mod>.js que exponga
        { id, label, icon, mount(root), unmount(), badge? }
     2) registrarlo en MODULES (abajo)
     3) incluir su <script> en index.html
   ============================================================ */
(function () {
  'use strict';

  const { $, $$, el, clear } = U;

  /* ---------- Catálogo de los 6 módulos ---------- */
  const MODULES = [
    { id: 'tasks',     label: 'Tarea',                icon: 'tasks',     impl: () => window.TasksModule, n: 1 },
    { id: 'calendar',  label: 'Calendario',           icon: 'calendar',  impl: () => window.CalendarModule,  n: 2 },
    { id: 'matrix',     label: 'Matriz de Eisenhower', icon: 'matrix',    impl: () => window.MatrixModule,    n: 3 },
    { id: 'habits',    label: 'Rastreador de hábitos',icon: 'habits',    impl: () => window.HabitsModule,    n: 4 },
    { id: 'pomodoro',  label: 'Cronómetro',           icon: 'pomodoro',  impl: () => window.PomodoroModule,  n: 5 },
    { id: 'countdown', label: 'Cuenta atrás',         icon: 'countdown', impl: () => window.CountdownModule, n: 6 },
  ];

  const state = {
    user: null,
    active: null,      // id del módulo montado
    current: null,     // instancia montada
  };

  /* ============================================================
     PANTALLAS
     ============================================================ */

  function show(which) {
    ['auth', 'app'].forEach(name =>
      $('#screen-' + name).classList.toggle('is-hidden', name !== which));
  }

  /* ============================================================
     RAIL
     ============================================================ */

  function renderRail() {
    const box = clear($('#rail-items'));

    MODULES.forEach(m => {
      const btn = el('button.rail__btn', {
        dataset: { tip: m.label, mod: m.id },
        onclick: () => openModule(m.id),
      }, [Icons.svg(m.icon)]);

      if (state.active === m.id) btn.classList.add('is-active');

      const impl = m.impl();
      if (impl && typeof impl.badge === 'function') {
        const n = impl.badge();
        if (n) btn.appendChild(el('span.rail__badge', { text: n > 99 ? '99+' : String(n) }));
      }
      box.appendChild(btn);
    });

    const u = state.user || {};
    $('#avatar').textContent = (u.name || '?').trim().charAt(0);
    $('#user-name').textContent  = u.name  || '—';
    $('#user-email').textContent = u.email || '—';
    const modo = $('#user-mode');
    if (modo) {
      modo.textContent = window.SOPI_MODE === 'supabase'
        ? '☁ Datos en la nube (Supabase)'
        : '💻 Datos solo en este navegador';
    }
  }

  /* ============================================================
     MÓDULOS
     ============================================================ */

  async function openModule(id) {
    const mod = MODULES.find(m => m.id === id);
    if (!mod) return;

    if (state.current && typeof state.current.unmount === 'function') {
      try { state.current.unmount(); } catch (e) { console.warn(e); }
    }

    state.active = id;
    const root = clear($('#view'));
    const impl = mod.impl();

    if (impl && typeof impl.mount === 'function') {
      state.current = impl;
      try {
        await impl.mount(root);
      } catch (e) {
        Err.log('modulo:' + id, (e && e.stack) || e);
        console.error('[SOPI] Error al montar', id, e);
        clear(root);
        root.appendChild(el('div.stub', null, [
          el('div.stub__icon', null, [Icons.svg(mod.icon, { width: 1.6 })]),
          el('h2', { text: 'No se pudo abrir ' + mod.label }),
          el('p', { text: 'Algo falló al preparar esta sección. Tus datos están a salvo.' }),
          el('div.err-card__actions', null, [
            el('button.btn.btn--primary', { text: 'Reintentar', onclick: () => openModule(id) }),
            el('button.btn.btn--outline', { text: 'Ir a Tareas', onclick: () => openModule('tasks') }),
          ]),
        ]));
      }
    } else {
      state.current = null;
      root.appendChild(stub(mod));
    }
    renderRail();
  }

  /** Placeholder para los módulos que aún no existen. */
  function stub(mod, msg) {
    return el('div.stub', null, [
      el('div.stub__icon', null, [Icons.svg(mod.icon, { width: 1.6 })]),
      el('h2', { text: mod.label }),
      el('p', { text: msg || 'Este módulo es el siguiente paso del plan. La base de datos y el rail ya están listos para conectarlo.' }),
      el('span.stub__tag', { text: `Módulo ${mod.n} de 6` }),
    ]);
  }

  /* ============================================================
     MENÚ DE USUARIO
     ============================================================ */

  function initUserMenu() {
    const menu = $('#user-menu');

    $('#btn-user').addEventListener('click', ev => {
      ev.stopPropagation();
      menu.classList.toggle('is-hidden');
      if (!menu.classList.contains('is-hidden')) {
        setTimeout(() => document.addEventListener('click', hide, { once: true }), 0);
      }
    });
    function hide() { menu.classList.add('is-hidden'); }

    $('#btn-logout').addEventListener('click', async () => {
      hide();
      if (state.current && state.current.unmount) state.current.unmount();
      await Store.logout();
      state.user = null; state.active = null; state.current = null;
      clear($('#view'));
      Auth.showTab('login');
      show('auth');
    });

    /* Subir los datos de este navegador a la nube (solo en modo Supabase) */
    const btnMigrar = $('#btn-migrate');
    if (btnMigrar) {
      btnMigrar.addEventListener('click', async () => {
        hide();
        const cuentas = SopiMigracion.cuentas();
        if (!cuentas.length) { U.toast('No hay datos locales para subir'); return; }

        const cuenta = cuentas[0];
        const ok = await UI.confirm({
          title: 'Subir tus datos a la nube',
          message: `Se copiarán a tu cuenta las tareas, hábitos, sesiones y fechas guardadas en este navegador (${cuenta.email}). Lo local no se borra: queda como respaldo.`,
          confirmText: 'Subir ahora',
          danger: false,
          icon: 'stack',
        });
        if (!ok) return;

        U.toast('Subiendo… puede tardar unos segundos');
        try {
          const r = await SopiMigracion.subir(cuenta.id);
          await UI.alert({
            title: 'Datos subidos',
            message: `Listo: ${r.tareas} tareas, ${r.habitos} hábitos (${r.registros} marcas), ${r.sesiones} sesiones y ${r.fechas} cuentas atrás. Ya los ves desde cualquier dispositivo.`,
            icon: 'check',
          });
          location.reload();
        } catch (e) {
          Err.handle(e, 'migracion');
        }
      });
    }

    $('#btn-export').addEventListener('click', async () => {
      hide();
      const dump = await Store.exportAll();
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const a = el('a', { href: URL.createObjectURL(blob), download: `sopi-${U.today()}.json` });
      document.body.appendChild(a); a.click(); a.remove();
      U.toast('Datos exportados');
    });
  }

  /* ============================================================
     ARRANQUE
     ============================================================ */

  async function enterApp() {
    show('app');
    renderRail();
    // Ofrecer la migración si hay datos locales y estamos en la nube
    const btnMigrar = $('#btn-migrate');
    if (btnMigrar && window.SopiMigracion && SopiMigracion.disponible()) {
      btnMigrar.classList.remove('is-hidden');
    }
    await openModule(state.active || 'tasks');
  }

  async function onAuthenticated(user) {
    state.user = user;
    await enterApp();
    watchActivity();
  }

  async function boot() {
    Err.install();                       // captura de errores globales
    if (!Err.preflight()) return;         // sin almacenamiento no se puede seguir

    try {
      Auth.init();
      initUserMenu();
      const user = await Store.restore();
      if (user && user.expired) {
        show('auth');
        Auth.showTab('login');
        U.toast('Tu sesión caducó por inactividad. Vuelve a entrar.');
      } else if (user) {
        state.user = user;
        await enterApp();
        watchActivity();
      } else show('auth');
    } catch (e) {
      Err.log('arranque', (e && e.stack) || e);
      Err.screen({
        code: 500,
        title: 'SOPI no pudo arrancar',
        message: 'Hubo un problema al leer tus datos guardados. Puedes reintentar; si el problema sigue, empieza una sesión limpia (tus datos se conservan en el navegador).',
        detail: e && e.message,
        actions: [
          { label: 'Reintentar', primary: true, onClick: () => location.reload() },
          { label: 'Cerrar sesión', onClick: async () => { await Store.logout(); location.reload(); } },
        ],
      });
    }
  }

  /** Mientras trabajas, la sesión se mantiene viva; si te vas, caduca. */
  function watchActivity() {
    const touch = U.debounce(() => Store.touchSession(), 4000);
    ['click', 'keydown', 'visibilitychange'].forEach(ev =>
      document.addEventListener(ev, touch, { passive: true }));
  }

  window.App = { boot, onAuthenticated, openModule, renderRail, MODULES, state };

  document.addEventListener('DOMContentLoaded', boot);
})();
