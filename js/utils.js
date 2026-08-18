/* ============================================================
   SOPI · utils.js
   Helpers de DOM, fechas y parseo de texto rápido.
   Todo global bajo el namespace `U`.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- DOM ---------------- */

  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /**
   * Crea un elemento.
   * el('div.clase#id', { attrs }, [hijos | texto])
   */
  function el(tag, attrs, children) {
    const parts  = String(tag).split(/(?=[.#])/);
    const node   = document.createElement(parts.shift() || 'div');
    parts.forEach(p => {
      if (p[0] === '.') node.classList.add(p.slice(1));
      else if (p[0] === '#') node.id = p.slice(1);
    });

    if (attrs) {
      Object.keys(attrs).forEach(k => {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'class') node.className += (node.className ? ' ' : '') + v;
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else node.setAttribute(k, v);
      });
    }

    (Array.isArray(children) ? children : children != null ? [children] : [])
      .forEach(c => {
        if (c === null || c === undefined || c === false) return;
        node.appendChild(typeof c === 'string' || typeof c === 'number'
          ? document.createTextNode(String(c)) : c);
      });

    return node;
  }

  const clear = node => { while (node && node.firstChild) node.removeChild(node.firstChild); return node; };

  function toast(msg, kind) {
    const box = $('#toasts');
    if (!box) return;
    const t = el('div.toast', { text: msg });
    if (kind === 'error') t.classList.add('toast--error');
    box.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  /* ---------------- IDs ---------------- */

  function uid(prefix) {
    const rnd = Math.random().toString(36).slice(2, 8);
    return (prefix || 'id') + '_' + Date.now().toString(36) + rnd;
  }

  /* ---------------- Fechas ----------------
     Convención: las fechas de tarea se guardan como 'YYYY-MM-DD'
     (fecha local, sin zona horaria) y la hora aparte como 'HH:MM'.
  --------------------------------------------- */

  const pad = n => String(n).padStart(2, '0');

  /** Date -> 'YYYY-MM-DD' en hora local */
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  /** 'YYYY-MM-DD' -> Date local a medianoche */
  function parseYmd(s) {
    if (!s) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]);
  }

  const today    = () => ymd(new Date());
  const addDays  = (dateStr, n) => {
    const d = parseYmd(dateStr) || new Date();
    d.setDate(d.getDate() + n);
    return ymd(d);
  };
  /** Diferencia en días entre dos 'YYYY-MM-DD' (b - a) */
  function daysBetween(a, b) {
    const da = parseYmd(a), db = parseYmd(b);
    if (!da || !db) return 0;
    return Math.round((db - da) / 86400000);
  }

  const DOW   = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const DOW_S = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const MON   = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  /** Etiqueta amable: Hoy · Mañana · Ayer · mié 13 ago */
  function humanDate(dateStr, opts) {
    const d = parseYmd(dateStr);
    if (!d) return '';
    const diff = daysBetween(today(), dateStr);
    if (diff === 0)  return 'Hoy';
    if (diff === 1)  return 'Mañana';
    if (diff === -1) return 'Ayer';
    if (diff > 1 && diff < 7) return DOW[d.getDay()].replace(/^./, c => c.toUpperCase());
    const sameYear = d.getFullYear() === new Date().getFullYear();
    const base = `${DOW_S[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
    return sameYear || (opts && opts.short) ? base : `${base} ${d.getFullYear()}`;
  }

  function humanRelative(dateStr) {
    const diff = daysBetween(today(), dateStr);
    if (diff === 0) return 'hoy';
    if (diff > 0)   return `en ${diff} día${diff === 1 ? '' : 's'}`;
    return `hace ${-diff} día${diff === -1 ? '' : 's'}`;
  }

  /* ---------------- Parseo del quick-add ----------------
     Ejemplos:
       "Llamar al banco mañana 15:30 !1 #Trabajo"
       "Comprar pan hoy"
       "Pagar recibo 25/08 !2"
     Devuelve { title, dueDate, dueTime, priority, listName }
  --------------------------------------------------------- */
  function parseQuickAdd(raw) {
    let text = ' ' + String(raw || '').trim() + ' ';
    const out = { title: '', dueDate: null, dueTime: null, priority: 0, listName: null };

    // Prioridad  !1 (alta) .. !4 (ninguna)
    text = text.replace(/\s![1-4]\s/g, m => {
      const n = +m.trim().slice(1);
      out.priority = n === 1 ? 3 : n === 2 ? 2 : n === 3 ? 1 : 0;
      return ' ';
    });

    // Lista  #Nombre  o  ~Nombre  (una sola palabra)
    text = text.replace(/\s[#~]([\p{L}\p{N}_-]+)\s/u, (m, name) => {
      out.listName = name;
      return ' ';
    });

    // Hora  15:30 / 9:05
    text = text.replace(/\s([01]?\d|2[0-3]):([0-5]\d)\s/, (m, h, mi) => {
      out.dueTime = pad(+h) + ':' + mi;
      return ' ';
    });

    // Fecha explícita  dd/mm  dd-mm  dd/mm/yyyy
    text = text.replace(/\s(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\s/, (m, d, mo, y) => {
      let year = y ? (+y < 100 ? 2000 + +y : +y) : new Date().getFullYear();
      const cand = new Date(year, +mo - 1, +d);
      if (isNaN(cand)) return m;
      // Sin año explícito y ya pasó hace más de 6 meses -> asumimos el año próximo
      if (!y && daysBetween(today(), ymd(cand)) < -180) cand.setFullYear(year + 1);
      out.dueDate = ymd(cand);
      return ' ';
    });

    // Palabras clave
    const KEY = [
      [/\shoy\s/i,             () => today()],
      [/\smañana\s/i,          () => addDays(today(), 1)],
      [/\spasado\s+mañana\s/i, () => addDays(today(), 2)],
      [/\sen\s+(\d{1,3})\s+d[ií]as?\s/i, m => addDays(today(), +m[1])],
      [/\spr[oó]xima\s+semana\s/i, () => addDays(today(), 7)],
    ];
    for (const [re, fn] of KEY) {
      const m = re.exec(text);
      if (m && !out.dueDate) {
        out.dueDate = fn(m);
        text = text.replace(re, ' ');
        break;
      }
    }

    // Día de la semana ("viernes", "el lunes") -> próxima ocurrencia
    if (!out.dueDate) {
      const re = /\s(?:el\s+)?(domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado)\s/i;
      const m = re.exec(text);
      if (m) {
        const norm = m[1].toLowerCase()
          .replace('é', 'e').replace('á', 'a');
        const idx = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'].indexOf(norm);
        if (idx >= 0) {
          const now = new Date();
          let delta = (idx - now.getDay() + 7) % 7;
          if (delta === 0) delta = 7;              // "viernes" en viernes = el próximo
          out.dueDate = addDays(today(), delta);
          text = text.replace(re, ' ');
        }
      }
    }

    out.title = text.replace(/\s+/g, ' ').trim();
    return out;
  }

  /* ---------------- Varios ---------------- */

  const escapeHtml = s => String(s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      const args = arguments, self = this;
      t = setTimeout(() => fn.apply(self, args), ms || 200);
    };
  }

  const PRIORITY = {
    3: { label: 'Alta',    color: 'var(--red)'    },
    2: { label: 'Media',   color: 'var(--orange)' },
    1: { label: 'Baja',    color: 'var(--blue)'   },
    0: { label: 'Ninguna', color: 'var(--text-3)' },
  };

  /* ---------------- Los tres tipos de tarea ----------------
     Cada tipo tiene su color y su símbolo, iguales en TODOS los
     módulos: así una clase semanal se reconoce igual en la lista,
     en el calendario y en la matriz.
  ------------------------------------------------------------ */
  const KINDS = {
    normal: {
      key: 'normal',  label: 'Normal',       short: 'Normal',
      icon: 'check',  color: 'var(--blue)',  hex: '#4772fa',
      hint: 'Una tarea con su fecha. Al completarla queda en Completadas.',
    },
    weekly: {
      key: 'weekly',  label: 'Semanal',      short: 'Cada semana',
      icon: 'repeat', color: 'var(--purple)', hex: '#8a6cf0',
      hint: 'Se repite todas las semanas en los días que elijas (tu clase, la reunión fija).',
    },
    instant: {
      key: 'instant', label: 'Instantánea',  short: 'Una sola vez',
      icon: 'bolt',   color: '#ff9f0a',      hex: '#ff9f0a',
      hint: 'Se hace una sola vez: al completarla se elimina y no deja rastro.',
    },
  };

  const kindOf = t => KINDS[(t && t.kind) || 'normal'] || KINDS.normal;

  /** Días de una tarea semanal: [1,3] -> "Lun y Mié" */
  function repeatLabel(days) {
    const d = (days || []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    if (!d.length) return 'Sin días elegidos';
    if (d.length === 7) return 'Todos los días';
    const NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const names = d.map(x => NAMES[x]);
    if (names.length === 1) return names[0];
    return names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1];
  }

  window.U = {
    $, $$, el, clear, toast, uid, pad,
    ymd, parseYmd, today, addDays, daysBetween,
    humanDate, humanRelative, parseQuickAdd,
    escapeHtml, debounce, PRIORITY, DOW, DOW_S, MON,
    KINDS, kindOf, repeatLabel,
  };
})();
