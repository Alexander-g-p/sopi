/* ============================================================
   SOPI · errors.js  —  CONTROL DE ERRORES
   ------------------------------------------------------------
   Un solo lugar para todo lo que puede fallar:

   1. Errores de código no capturados  -> aviso amable + registro
   2. Promesas rechazadas sin catch    -> lo mismo
   3. Códigos HTTP (404, 500, 501…)    -> mensaje en español
      (ya listo para cuando exista backend: usa Err.fetch())
   4. Sin conexión / conexión de vuelta -> banner
   5. localStorage bloqueado o lleno   -> pantalla explicativa
   6. Recursos que no cargan (CSS/JS)  -> pantalla de error

   Nada de esto muestra rutas internas ni volcados técnicos al
   usuario: el detalle queda en la consola y, resumido, en un
   bloque plegable por si hay que reportarlo.
   ============================================================ */
(function () {
  'use strict';

  const { el, $ } = U;

  /* ---------------- Mensajes por código HTTP ---------------- */

  const HTTP = {
    400: ['Petición incorrecta', 'Los datos enviados no tienen el formato esperado. Revisa lo que escribiste e inténtalo de nuevo.'],
    401: ['Sesión no válida', 'Tu sesión caducó o no tienes permiso. Vuelve a iniciar sesión.'],
    403: ['Sin permiso', 'Esta cuenta no puede realizar esa acción.'],
    404: ['No encontramos esa página', 'La dirección no existe o el elemento fue eliminado.'],
    405: ['Acción no permitida', 'El servidor no admite esa operación en esta dirección.'],
    408: ['Se agotó el tiempo de espera', 'El servidor tardó demasiado en responder. Revisa tu conexión e inténtalo otra vez.'],
    409: ['Hay un conflicto', 'Alguien más cambió esta información antes que tú. Recarga y vuelve a intentarlo.'],
    413: ['Demasiado grande', 'El contenido que intentas guardar supera el tamaño permitido.'],
    422: ['Datos incompletos', 'Falta información obligatoria o algún campo no es válido.'],
    429: ['Demasiados intentos', 'Espera un momento antes de volver a intentarlo.'],
    500: ['Error del servidor', 'Algo falló del otro lado. No es culpa tuya: inténtalo en unos minutos.'],
    501: ['Función no implementada', 'Esta parte todavía no está disponible en el servidor.'],
    502: ['Respuesta inválida del servidor', 'Un servicio intermedio devolvió algo inesperado. Reintenta en un momento.'],
    503: ['Servicio no disponible', 'El servidor está en mantenimiento o saturado. Vuelve a intentarlo pronto.'],
    504: ['El servidor no respondió', 'La espera fue demasiado larga. Comprueba tu conexión e inténtalo otra vez.'],
    507: ['Sin espacio', 'No queda espacio para guardar más información.'],
  };

  function httpMessage(status) {
    if (HTTP[status]) return { code: status, title: HTTP[status][0], message: HTTP[status][1] };
    if (status >= 500) return { code: status, title: 'Error del servidor', message: 'Algo falló del otro lado. Inténtalo en unos minutos.' };
    if (status >= 400) return { code: status, title: 'No se pudo completar', message: 'La petición no fue aceptada. Revisa los datos e inténtalo de nuevo.' };
    return { code: status, title: 'Respuesta inesperada', message: 'El servidor respondió algo que no esperábamos.' };
  }

  /* ---------------- Registro interno ---------------- */

  const LOG_KEY = 'sopi.v1.errors';
  const MAX_LOG = 25;

  function log(kind, detail) {
    try {
      const list = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
      list.unshift({
        at: new Date().toISOString(),
        kind,
        detail: String(detail).slice(0, 400),
        page: location.pathname,
      });
      localStorage.setItem(LOG_KEY, JSON.stringify(list.slice(0, MAX_LOG)));
    } catch (e) { /* si no hay almacenamiento, no insistimos */ }
  }

  const getLog = () => {
    try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch (e) { return []; }
  };
  const clearLog = () => { try { localStorage.removeItem(LOG_KEY); } catch (e) {} };

  /* ---------------- Banner (conexión, avisos) ---------------- */

  let bannerNode = null;

  function banner(text, kind, autoHide) {
    hideBanner();
    bannerNode = el('div.banner' + (kind ? '.banner--' + kind : ''), null, [
      Icons.svg(kind === 'ok' ? 'check' : 'note', { width: 2 }),
      el('span', { text }),
      el('button.banner__x', { title: 'Cerrar', onclick: hideBanner }, [Icons.svg('close', { width: 2.2 })]),
    ]);
    document.body.appendChild(bannerNode);
    if (autoHide) setTimeout(hideBanner, autoHide);
  }

  function hideBanner() {
    if (bannerNode) { bannerNode.remove(); bannerNode = null; }
  }

  /* ---------------- Pantalla de error ---------------- */

  /**
   * screen({ code, title, message, detail, actions:[{label,onClick,primary}] })
   * Se usa para 404, fallos al arrancar y almacenamiento no disponible.
   */
  function screen(o) {
    const opts = o || {};
    const prev = $('.err-screen');
    if (prev) prev.remove();

    const actions = el('div.err-card__actions');
    (opts.actions || [
      { label: 'Recargar', primary: true, onClick: () => location.reload() },
      { label: 'Ir al inicio', onClick: () => { location.href = './index.html'; } },
    ]).forEach(a => actions.appendChild(el('button.btn' + (a.primary ? '.btn--primary' : '.btn--outline'), {
      text: a.label, onclick: a.onClick,
    })));

    const card = el('div.err-card', null, [
      opts.code ? el('div.err-card__code', { text: String(opts.code) }) : null,
      el('h1', { text: opts.title || 'Algo no salió bien' }),
      el('p', { text: opts.message || 'Ocurrió un problema inesperado.' }),
      opts.detail ? el('div.err-card__detail', { text: String(opts.detail).slice(0, 300) }) : null,
      actions,
    ]);

    document.body.appendChild(el('div.err-screen', null, [card]));
  }

  /* ---------------- Manejador general ---------------- */

  /**
   * Traduce cualquier error a algo comprensible y lo muestra como aviso.
   * Devuelve el texto mostrado.
   */
  function handle(err, contexto) {
    const e = err || {};
    let texto;

    if (e.status || e.statusCode) {
      texto = httpMessage(e.status || e.statusCode).message;
    } else if (e.name === 'QuotaExceededError' || /quota|exceeded/i.test(e.message || '')) {
      texto = 'No queda espacio en este navegador. Exporta tus datos y borra lo que no uses.';
    } else if (e.name === 'SecurityError' || /storage|localStorage/i.test(e.message || '')) {
      texto = 'Este navegador está bloqueando el almacenamiento. Desactiva el modo privado para usar SOPI.';
    } else if (!navigator.onLine) {
      texto = 'Parece que no hay conexión. SOPI sigue funcionando: tus datos están en este navegador.';
    } else {
      texto = e.message || 'Ocurrió un problema inesperado.';
    }

    log(contexto || 'error', (e && e.stack) || texto);
    console.error('[SOPI]' + (contexto ? ' ' + contexto : ''), err);
    U.toast(texto, 'error');
    return texto;
  }

  /**
   * fetch con control de errores y tiempo límite. Hoy no se usa
   * (los datos son locales), pero deja el camino hecho para el backend:
   *   const datos = await Err.fetch('/api/tareas');
   */
  async function safeFetch(url, options) {
    const opts = Object.assign({ timeout: 12000 }, options || {});
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), opts.timeout) : null;

    try {
      if (!navigator.onLine) {
        const e = new Error('Sin conexión'); e.status = 0; throw e;
      }
      const res = await fetch(url, Object.assign({}, opts, { signal: ctl ? ctl.signal : undefined }));
      if (!res.ok) {
        const info = httpMessage(res.status);
        const e = new Error(info.message);
        e.status = res.status; e.title = info.title;
        throw e;
      }
      const tipo = res.headers.get('content-type') || '';
      return tipo.includes('application/json') ? await res.json() : await res.text();
    } catch (e) {
      if (e.name === 'AbortError') {
        const t = new Error(HTTP[408][1]); t.status = 408; throw t;
      }
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /* ---------------- Comprobaciones de arranque ---------------- */

  /** ¿Se puede escribir en este navegador? (modo privado, cookies bloqueadas) */
  function storageAvailable() {
    try {
      const k = '__sopi_test__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  }

  /** Se llama desde app.js antes de arrancar. Devuelve true si se puede seguir. */
  function preflight() {
    if (!storageAvailable()) {
      screen({
        code: 'Sin almacenamiento',
        title: 'Este navegador no permite guardar datos',
        message: 'SOPI guarda tus tareas en el propio navegador. Parece que estás en modo privado o el sitio tiene el almacenamiento bloqueado. Desactívalo y vuelve a entrar.',
        actions: [{ label: 'Reintentar', primary: true, onClick: () => location.reload() }],
      });
      return false;
    }
    if (!window.crypto || !crypto.subtle) {
      // Sin Web Crypto no hay hash fuerte: avisamos pero dejamos entrar
      banner('Este navegador no soporta cifrado moderno; el inicio de sesión usará una protección más básica.', 'warn', 9000);
    }
    return true;
  }

  /* ---------------- Captura global ---------------- */

  function install() {
    window.addEventListener('error', ev => {
      // Recurso que no cargó (una hoja de estilos, un script)
      if (ev.target && (ev.target.tagName === 'SCRIPT' || ev.target.tagName === 'LINK')) {
        const src = ev.target.src || ev.target.href || '';
        log('recurso', src);
        screen({
          code: 404,
          title: 'Falta un archivo de la aplicación',
          message: 'No se pudo cargar una parte de SOPI. Si acabas de copiar la carpeta, revisa que estén las carpetas css/ y js/ junto a index.html.',
          detail: src.split('/').slice(-2).join('/'),
        });
        return;
      }
      log('js', (ev.error && ev.error.stack) || ev.message);
      console.error('[SOPI] error no capturado', ev.error || ev.message);
      U.toast('Algo falló al procesar esa acción. Si se repite, recarga la página.', 'error');
    }, true);

    window.addEventListener('unhandledrejection', ev => {
      const r = ev.reason || {};
      log('promesa', (r && r.stack) || r.message || String(r));
      console.error('[SOPI] promesa rechazada', r);
      U.toast(r.status ? httpMessage(r.status).message
                       : (r.message || 'Una operación no se pudo completar.'), 'error');
    });

    window.addEventListener('offline', () =>
      banner('Sin conexión. Puedes seguir trabajando: SOPI guarda todo en este navegador.', 'warn'));
    window.addEventListener('online', () => {
      hideBanner();
      banner('Conexión restablecida.', 'ok', 2600);
    });
  }

  /* ---------------- Vigilancia temprana de recursos ----------------
     Se activa al cargar este archivo (no espera al arranque) para
     poder avisar si falta alguno de los .js/.css que vienen después.
  ------------------------------------------------------------------ */
  const faltantes = [];
  window.addEventListener('error', ev => {
    if (!ev.target || !ev.target.tagName) return;
    if (ev.target.tagName !== 'SCRIPT' && ev.target.tagName !== 'LINK') return;
    const src = ev.target.src || ev.target.href || '';

    // La librería de Supabase viene de un CDN y es opcional:
    // si no carga, SOPI sigue en modo local y solo lo avisamos.
    if (/cdn\.jsdelivr\.net|supabase/i.test(src)) {
      log('cdn', src);
      console.warn('[SOPI] No se pudo cargar Supabase desde el CDN; se usará el modo local.');
      return;
    }

    faltantes.push(src);
    log('recurso', src);
    // Esperamos un instante por si faltan varios, y avisamos una sola vez
    clearTimeout(window.__sopiFaltaTimer);
    window.__sopiFaltaTimer = setTimeout(() => {
      screen({
        code: 404,
        title: faltantes.length > 1 ? 'Faltan archivos de la aplicación' : 'Falta un archivo de la aplicación',
        message: 'No se pudo cargar una parte de SOPI, así que la app no puede funcionar completa. Si acabas de copiar la carpeta, revisa que estén css/ y js/ junto a index.html; si está publicada en internet, vuelve a subir la carpeta completa.',
        detail: faltantes.map(s => s.split('/').slice(-2).join('/')).join('\n'),
        actions: [{ label: 'Recargar', primary: true, onClick: () => location.reload() }],
      });
    }, 250);
  }, true);

  window.Err = {
    install, preflight, handle, screen, banner, hideBanner,
    httpMessage, fetch: safeFetch, storageAvailable,
    log, getLog, clearLog, HTTP,
    missing: () => faltantes.slice(),
  };
})();
