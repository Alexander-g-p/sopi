/* ============================================================
   SOPI · query.js
   Lógica de consulta PURA, compartida por los dos almacenes
   (localStorage y Supabase). No toca red ni disco: recibe un
   objeto `db` en memoria y devuelve resultados.

   db = { lists, tasks, habits, habitLogs, pomodoros, countdowns, settings }

   Tenerlo aquí evita que el modo local y el modo nube se
   comporten distinto: los filtros, la agenda semanal y los
   conteos son exactamente el mismo código.
   ============================================================ */
(function () {
  'use strict';

  const copy = v => JSON.parse(JSON.stringify(v));

  /* ---------------- Tareas ---------------- */

  function filterTasks(db, filter) {
    const f = filter || {};
    let out = (db.tasks || []).filter(t => !!t.trashed === !!f.trashed);

    if (f.listId)                  out = out.filter(t => t.listId === f.listId);
    if (f.completed !== undefined) out = out.filter(t => !!t.completed === !!f.completed);
    if (f.kind)                    out = out.filter(t => (t.kind || 'normal') === f.kind);
    if (f.hasDate === true)        out = out.filter(t => !!t.dueDate);
    if (f.hasDate === false)       out = out.filter(t => !t.dueDate);
    if (f.from)                    out = out.filter(t => t.dueDate && t.dueDate >= f.from);
    if (f.to)                      out = out.filter(t => t.dueDate && t.dueDate <= f.to);
    if (f.search) {
      const q = f.search.toLowerCase();
      out = out.filter(t =>
        (t.title || '').toLowerCase().includes(q) ||
        (t.note || '').toLowerCase().includes(q));
    }
    return copy(out);
  }

  /** ¿Le toca a esta tarea semanal ese día? */
  function weeklyHits(t, date) {
    if (t.kind !== 'weekly') return false;
    const days = (t.repeat && t.repeat.days) || [];
    if (!days.length) return false;
    if (t.dueDate && date < t.dueDate) return false;   // aún no empieza
    return days.includes(U.parseYmd(date).getDay());
  }

  /**
   * Agenda entre dos fechas, con las semanales ya expandidas.
   * Cada elemento lleva dueDate del día concreto, occId e isOcc.
   */
  function agenda(db, range) {
    const from = range.from, to = range.to;
    const out = [];

    (db.tasks || []).filter(t => !t.trashed).forEach(t => {
      if (t.kind === 'weekly') {
        let d = from, guard = 0;
        while (d <= to && guard++ < 800) {
          if (weeklyHits(t, d)) {
            const occ = copy(t);
            occ.dueDate = d;
            occ.occId = t.id + '@' + d;
            occ.isOcc = true;
            occ.completed = (t.doneDates || []).includes(d);
            out.push(occ);
          }
          d = U.addDays(d, 1);
        }
      } else if (t.dueDate && t.dueDate >= from && t.dueDate <= to) {
        const occ = copy(t);
        occ.occId = t.id + '@' + t.dueDate;
        occ.isOcc = false;
        out.push(occ);
      }
    });

    return out;
  }

  /** Conteos de la barra lateral. */
  function counts(db) {
    const t0 = U.today(), t1 = U.addDays(t0, 1), t7 = U.addDays(t0, 7);
    const tasks = db.tasks || [];
    const active = tasks.filter(t => !t.trashed && !t.completed);

    const byList = {};
    active.forEach(t => { byList[t.listId] = (byList[t.listId] || 0) + 1; });

    const weekly = tasks.filter(t => !t.trashed && t.kind === 'weekly');
    const weeklyPend = (from, to) => {
      let n = 0, d = from, guard = 0;
      while (d <= to && guard++ < 400) {
        weekly.forEach(t => {
          if (weeklyHits(t, d) && !(t.doneDates || []).includes(d)) n++;
        });
        d = U.addDays(d, 1);
      }
      return n;
    };
    const fixed = active.filter(t => t.kind !== 'weekly');

    return {
      today:     fixed.filter(t => t.dueDate && t.dueDate <= t0).length + weeklyPend(t0, t0),
      tomorrow:  fixed.filter(t => t.dueDate === t1).length + weeklyPend(t1, t1),
      next7:     fixed.filter(t => t.dueDate && t.dueDate >= t0 && t.dueDate <= t7).length + weeklyPend(t0, t7),
      inbox:     active.length,
      completed: tasks.filter(t => !t.trashed && t.completed).length,
      trashed:   tasks.filter(t => t.trashed).length,
      byList,
    };
  }

  /* ---------------- Resto de colecciones ---------------- */

  const lists = db => copy((db.lists || []).slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0)));

  const habits = (db, opts) => copy((db.habits || [])
    .filter(h => (opts && opts.all) || !h.archived)
    .sort((a, b) => (a.order || 0) - (b.order || 0)));

  function habitLogs(db, filter) {
    const f = filter || {};
    let out = db.habitLogs || [];
    if (f.habitId) out = out.filter(l => l.habitId === f.habitId);
    if (f.from)    out = out.filter(l => l.date >= f.from);
    if (f.to)      out = out.filter(l => l.date <= f.to);
    return copy(out);
  }

  function pomodoros(db, filter) {
    const f = filter || {};
    let out = db.pomodoros || [];
    if (f.from)   out = out.filter(s => s.date >= f.from);
    if (f.to)     out = out.filter(s => s.date <= f.to);
    if (f.kind)   out = out.filter(s => s.kind === f.kind);
    if (f.taskId) out = out.filter(s => s.taskId === f.taskId);
    return copy(out);
  }

  /* ---------------- Plantillas de registros nuevos ---------------- */

  /** Tarea nueva con todos sus campos por defecto. */
  function newTask(data, inboxId, order) {
    const d = data || {};
    const kind = ['normal', 'weekly', 'instant'].includes(d.kind) ? d.kind : 'normal';
    const now = new Date().toISOString();
    return {
      id: d.id || U.uid('tsk'),
      listId: d.listId || inboxId || null,
      title: String(d.title || '').trim(),
      kind,
      repeat: kind === 'weekly' ? { days: ((d.repeat || {}).days || []).slice() } : null,
      doneDates: kind === 'weekly' ? (d.doneDates || []) : null,
      note: d.note || '',
      dueDate: d.dueDate || null,
      dueTime: d.dueTime || null,
      priority: Number.isInteger(d.priority) ? d.priority : 0,
      urgent:    d.urgent    !== undefined ? d.urgent    : null,
      important: d.important !== undefined ? d.important : null,
      pomodoros: d.pomodoros || 0,
      estimate:  d.estimate  || 0,
      duration:  d.duration  || 60,
      subtasks:  Array.isArray(d.subtasks) ? d.subtasks : [],
      completed: !!d.completed,
      completedAt: d.completedAt || null,
      trashed: !!d.trashed,
      order: order || 0,
      createdAt: d.createdAt || now,
      updatedAt: now,
    };
  }

  function newHabit(data, order) {
    const d = data || {};
    return {
      id: d.id || U.uid('hbt'),
      name: String(d.name || '').trim(),
      emoji: d.emoji || '✅',
      color: d.color || '#4772fa',
      freq: Object.assign({ type: 'daily', days: [1, 2, 3, 4, 5], times: 3 }, d.freq || {}),
      archived: !!d.archived,
      order: order || 0,
      createdAt: d.createdAt || new Date().toISOString(),
    };
  }

  function newCountdown(data) {
    const d = data || {};
    return {
      id: d.id || U.uid('cnt'),
      title: String(d.title || '').trim(),
      emoji: d.emoji || '📅',
      color: d.color || '#4772fa',
      date: d.date,
      time: d.time || null,
      repeat: d.repeat || 'none',
      note: d.note || '',
      taskId: d.taskId || null,
      createdAt: d.createdAt || new Date().toISOString(),
    };
  }

  function newPomodoro(data) {
    const d = data || {};
    const now = new Date();
    return {
      id: d.id || U.uid('pom'),
      kind: d.kind || 'focus',
      taskId: d.taskId || null,
      minutes: Math.max(0, Math.round(d.minutes || 0)),
      date: d.date || U.ymd(now),
      startedAt: d.startedAt || now.toISOString(),
      endedAt: d.endedAt || now.toISOString(),
    };
  }

  const EMPTY_DB = () => ({
    lists: [], tasks: [], habits: [], habitLogs: [],
    pomodoros: [], countdowns: [],
    settings: {
      pomodoro: { focus: 25, shortBreak: 5, longBreak: 15, cycles: 4 },
      startOfWeek: 1,
    },
  });

  window.Q = {
    copy, filterTasks, weeklyHits, agenda, counts,
    lists, habits, habitLogs, pomodoros,
    newTask, newHabit, newCountdown, newPomodoro, EMPTY_DB,
  };
})();
