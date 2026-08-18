/* ============================================================
   SOPI · icons.js
   Set de iconos SVG (trazo, 24x24) usados en toda la app.
   Uso:  Icons.svg('plus')  ->  elemento <svg>
   ============================================================ */
(function () {
  'use strict';

  const P = {
    /* Módulos */
    tasks:      ['M9 11.5l2.2 2.2L15.5 9', 'M20 12v6.5A2.5 2.5 0 0117.5 21h-11A2.5 2.5 0 014 18.5v-11A2.5 2.5 0 016.5 5H15'],
    calendar:   ['M7 3v3M17 3v3', 'M4.5 8.5h15', 'M5.5 5.5h13A1.5 1.5 0 0120 7v12a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 19V7a1.5 1.5 0 011.5-1.5z'],
    matrix:     ['M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z'],
    pomodoro:   ['M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17z', 'M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z'],
    habits:     ['M12 20.8c3.5 0 5.9-2.3 5.9-5.5 0-4.1-4.1-5.5-4.1-9.2-2.4 1-3.6 2.9-3.6 4.9 0 1.2-.7 2-1.5 2s-1.4-.7-1.4-1.8c-1.2 1.6-1.2 2.5-1.2 4.1 0 3.2 2.4 5.5 5.9 5.5z'],
    countdown:  ['M7 3.5h10M7 20.5h10', 'M8.2 3.5v3.1c0 2 3.8 3.6 3.8 5.4s-3.8 3.4-3.8 5.4v3.1', 'M15.8 3.5v3.1c0 2-3.8 3.6-3.8 5.4s3.8 3.4 3.8 5.4v3.1'],

    /* Vistas inteligentes */
    sun:        ['M12 6.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11z', 'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19'],
    sunrise:    ['M12 4v4M6.4 9.4L5 8M17.6 9.4L19 8', 'M7 15a5 5 0 0110 0', 'M3.5 19h17'],
    stack:      ['M4.5 7.5h15M4.5 12h15M4.5 16.5h15'],
    inbox:      ['M4 12.5l2.2-6A1.5 1.5 0 017.6 5.5h8.8a1.5 1.5 0 011.4 1l2.2 6', 'M4 12.5V18a1.5 1.5 0 001.5 1.5h13A1.5 1.5 0 0020 18v-5.5h-4.2a1 1 0 00-.95.7 3 3 0 01-5.7 0 1 1 0 00-.95-.7H4z'],
    list:       ['M8 7h11M8 12h11M8 17h11', 'M4.6 7h.01M4.6 12h.01M4.6 17h.01'],
    done:       ['M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17z', 'M8.6 12.2l2.4 2.4 4.4-4.8'],
    trash:      ['M5 7.5h14', 'M9.5 7.5V5.8A1.3 1.3 0 0110.8 4.5h2.4a1.3 1.3 0 011.3 1.3v1.7', 'M6.5 7.5l.8 11a1.5 1.5 0 001.5 1.4h6.4a1.5 1.5 0 001.5-1.4l.8-11'],

    /* Acciones */
    plus:       ['M12 5.5v13M5.5 12h13'],
    search:     ['M11 4.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13z', 'M15.8 15.8L20 20'],
    more:       ['M6 12h.01M12 12h.01M18 12h.01'],
    sort:       ['M4.5 7h9M4.5 12h6M4.5 17h3', 'M16 9.5l2.5-2.5L21 9.5', 'M18.5 7v10'],
    flag:       ['M6 4.5v15', 'M6 5.2h10.5l-1.6 3.4 1.6 3.4H6'],
    close:      ['M6.5 6.5l11 11M17.5 6.5l-11 11'],
    check:      ['M5 12.5l4.5 4.5L19 7.5'],
    chevron:    ['M9 6l6 6-6 6'],
    note:       ['M6 4.5h8.5L19 9v10.5A1 1 0 0118 20.5H7a1 1 0 01-1-1v-14a1 1 0 011-1z', 'M14 4.5V9h4.6', 'M9 13h6M9 16.5h4'],
    subtask:    ['M8 6h11M8 12h11M8 18h6', 'M4.4 6h.01M4.4 12h.01M4.4 18h.01'],
    clock:      ['M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17z', 'M12 7.8V12l3 1.8'],
    restore:    ['M4.5 10.5a7.5 7.5 0 1113 5', 'M4.5 5.5v5h5'],
    palette:    ['M12 3.5a8.5 8.5 0 000 17c1.2 0 1.7-.9 1.7-1.8 0-1.7 1-2.2 2.3-2.2H18a3 3 0 003-3.2C20.6 7.4 16.8 3.5 12 3.5z', 'M8 9.5h.01M7 13.5h.01M11 7.5h.01'],
    edit:       ['M4.5 19.5h4l10-10a2.1 2.1 0 00-3-3l-10 10v3z', 'M14 6.5l3 3'],
    pin:        ['M12 21v-6', 'M8 4.5h8l-1 6.5a3 3 0 01-3 2.5 3 3 0 01-3-2.5L8 4.5z'],

    /* Tipos de tarea */
    repeat:     ['M4.5 11.2a7.5 7.5 0 0112.6-4.2l2.4 2.2', 'M19.5 4.8v4.6h-4.6',
                 'M19.5 12.8a7.5 7.5 0 01-12.6 4.2L4.5 14.8', 'M4.5 19.2v-4.6h4.6'],
    bolt:       ['M13.2 3.5L6 13.4h4.6l-.8 7.1L17.6 10h-4.7l.3-6.5z'],

    /* Navegación móvil */
    menu:       ['M4 7h16M4 12h16M4 17h16'],

    /* Contraseña */
    eye:        ['M2.8 12S6.5 5.8 12 5.8 21.2 12 21.2 12 17.5 18.2 12 18.2 2.8 12 2.8 12z',
                 'M12 9.2a2.8 2.8 0 100 5.6 2.8 2.8 0 000-5.6z'],
    eyeOff:     ['M4 4l16 16', 'M9.7 5.2A8.7 8.7 0 0112 5c5.5 0 9.2 6.2 9.2 6.2a16 16 0 01-2.5 3',
                 'M6.5 7.3A15.6 15.6 0 002.8 12S6.5 18.2 12 18.2c1.4 0 2.6-.3 3.7-.9',
                 'M10.2 10.3a2.8 2.8 0 003.7 3.8'],
  };

  function svg(name, attrs) {
    const d = P[name] || P.list;
    const NS = 'http://www.w3.org/2000/svg';
    const node = document.createElementNS(NS, 'svg');
    node.setAttribute('viewBox', '0 0 24 24');
    node.setAttribute('fill', 'none');
    node.setAttribute('stroke', 'currentColor');
    node.setAttribute('stroke-width', (attrs && attrs.width) || '1.7');
    node.setAttribute('stroke-linecap', 'round');
    node.setAttribute('stroke-linejoin', 'round');
    node.setAttribute('aria-hidden', 'true');
    d.forEach(path => {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', path);
      node.appendChild(p);
    });
    return node;
  }

  window.Icons = { svg, names: Object.keys(P) };
})();
