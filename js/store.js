/* ============================================================
   SOPI · store.js  —  SELECTOR DE ALMACÉN
   ------------------------------------------------------------
   Decide, al cargar la página, dónde viven los datos:

     · Con js/config.js relleno y la librería de Supabase cargada
       → modo NUBE  (StoreRemote): datos en Postgres, sesión de
         Supabase Auth, disponibles desde cualquier dispositivo.

     · Sin configurar → modo LOCAL (StoreLocal): todo en este
       navegador, como hasta ahora. Útil para probar sin cuenta.

   Los 6 módulos siempre llaman a `Store`: no saben ni les importa
   cuál de los dos está detrás.
   ============================================================ */
(function () {
  'use strict';

  const cfg = window.SOPI_CONFIG || {};

  /**
   * Limpia la URL que se pegó en config.js.
   * Acepta con o sin barra final, con espacios, e incluso si se pegó
   * la dirección del panel (https://supabase.com/dashboard/project/abc123):
   * de ahí saca el identificador y arma la URL correcta del API.
   */
  function normalizarUrl(valor) {
    let u = String(valor || '').trim().replace(/\s+/g, '');
    if (!u) return '';

    // Pegaron la dirección del panel en vez de la del API
    const panel = /supabase\.com\/(?:dashboard\/)?project\/([a-z0-9]{16,})/i.exec(u);
    if (panel) return 'https://' + panel[1] + '.supabase.co';

    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;      // faltaba el https://
    try {
      const url = new URL(u);
      return 'https://' + url.host;                        // sin barra ni ruta final
    } catch (e) {
      return u.replace(/\/+$/, '');
    }
  }

  const urlLimpia = normalizarUrl(cfg.supabaseUrl);
  const clave = String(cfg.supabaseAnonKey || '').trim();

  const urlValida = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(urlLimpia);

  /* La clave pública puede venir en dos formatos según la antigüedad del
     proyecto: el JWT clásico (eyJ...) o el nuevo sb_publishable_... */
  const esJwt        = clave.startsWith('eyJ') && clave.length > 60;
  const esPublicable = /^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(clave);

  /* Protección: si por error se pega la clave secreta, NO se usa.
     Esa clave salta todas las reglas de seguridad y jamás debe publicarse. */
  let esSecreta = clave.startsWith('sb_secret_');
  if (esJwt) {
    try {
      const carga = JSON.parse(atob(clave.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (carga && carga.role && carga.role !== 'anon') esSecreta = true;
    } catch (e) { /* si no se puede leer, seguimos con las otras comprobaciones */ }
  }

  const claveValida = (esJwt || esPublicable) && !esSecreta;
  const configurado = urlValida && claveValida;

  if (esSecreta) {
    console.error('[SOPI] ¡ALTO! La clave de js/config.js es SECRETA (service_role), no la pública.',
      '\n  Esa clave da acceso total a la base y nunca debe ir en el navegador ni subirse a GitHub.',
      '\n  1) Cámbiala por la "anon public" (Settings → API)',
      '\n  2) Si ya la publicaste, recréala desde el panel de Supabase');
    setTimeout(() => { if (window.U) U.toast('Estás usando la clave SECRETA de Supabase. Cámbiala por la anon public.', 'error'); }, 1200);
  }

  // Los avisos se muestran cuando la app ya cargó, para que se vean
  function avisar(texto) {
    setTimeout(() => { if (window.U) U.toast(texto, 'error'); }, 1200);
  }

  if (cfg.supabaseUrl && !urlValida) {
    console.error('[SOPI] La URL de Supabase no es válida:', cfg.supabaseUrl,
      '\n  Debe ser exactamente así, sin barra al final:  https://xxxxxxxx.supabase.co',
      '\n  Se encuentra en: Supabase → Settings → API → Project URL');
    avisar('La URL de Supabase en config.js no es válida. Revisa la consola (F12).');
  }
  if (cfg.supabaseAnonKey && !claveValida && !esSecreta) {
    console.error('[SOPI] La clave de Supabase no parece la correcta.',
      '\n  Debe empezar con "eyJ" (formato clásico) o con "sb_publishable_" (formato nuevo)',
      '\n  Se encuentra en: Supabase → Settings → API → Project API keys → anon public');
    avisar('La clave anon de Supabase en config.js no es válida. Revisa la consola (F12).');
  }

  // A partir de aquí siempre se usa la versión limpia
  if (configurado) {
    window.SOPI_CONFIG.supabaseUrl = urlLimpia;
    window.SOPI_CONFIG.supabaseAnonKey = clave;
  }

  const libreriaLista = !!window.supabase;

  let modo = 'local';

  if (configurado && libreriaLista && window.StoreRemote) {
    modo = 'supabase';
    window.Store = window.StoreRemote;
  } else {
    window.Store = window.StoreLocal;
    if (configurado && !libreriaLista) {
      console.warn('[SOPI] Supabase está configurado pero su librería no cargó. Se usa el modo local.');
      setTimeout(() => U.toast('No se pudo cargar Supabase; trabajando solo en este navegador.', 'error'), 1200);
    }
  }

  window.Store.mode = modo;
  window.SOPI_MODE = modo;
  console.info('[SOPI] Modo de datos: ' + (modo === 'supabase' ? 'nube (Supabase)' : 'local (este navegador)'));

  /* ============================================================
     MIGRACIÓN: subir los datos de este navegador a la nube
     ============================================================ */

  window.SopiMigracion = {

    /** ¿Hay datos locales de sesiones anteriores que valga la pena subir? */
    disponible() {
      return modo === 'supabase' &&
             window.StoreLocal &&
             typeof StoreLocal.hasLocalData === 'function' &&
             StoreLocal.hasLocalData();
    },

    /** Cuentas locales encontradas (para elegir cuál subir). */
    cuentas() {
      return window.StoreLocal ? StoreLocal.localUsers() : [];
    },

    /** Sube la base local de `userId` a la cuenta de Supabase abierta. */
    async subir(userId) {
      if (modo !== 'supabase') throw new Error('La migración solo aplica en modo nube.');
      const db = StoreLocal.localDbOf(userId);
      if (!db) throw new Error('No se encontró esa base local.');
      const resumen = await StoreRemote.importDb(db);
      try { localStorage.setItem('sopi.v1.migrado.' + userId, new Date().toISOString()); } catch (e) {}
      return resumen;
    },

    yaMigrada(userId) {
      try { return !!localStorage.getItem('sopi.v1.migrado.' + userId); } catch (e) { return false; }
    },
  };
})();
