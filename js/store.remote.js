/* ============================================================
   SOPI · store.remote.js  —  ALMACÉN EN SUPABASE
   ------------------------------------------------------------
   Misma API que el almacén local: los 6 módulos NO cambian
   ni una línea. Aquí solo cambia dónde viven los datos.

   Cómo funciona
     · Al iniciar sesión se descarga TODO lo del usuario a memoria
       (una consulta por tabla). Las lecturas se resuelven al
       instante desde esa caché, con la misma lógica de query.js.
     · Cada cambio se escribe primero en la caché (para que la
       pantalla responda ya) y enseguida se envía a Supabase.
       Si la escritura falla, se avisa y se recarga desde el
       servidor para no quedarse con datos falsos.

   Seguridad: la clave pública (anon) solo sirve con las reglas
   RLS del esquema. Postgres filtra por usuario en cada consulta.
   ============================================================ */
(function () {
  'use strict';

  const ok   = v => Promise.resolve(v);
  const fail = msg => Promise.reject(new Error(msg));

  let sb = null;          // cliente de Supabase
  let CURRENT = null;     // { id, name, email }
  let DB = null;          // caché en memoria (misma forma que el modo local)

  /* ============================================================
     CONEXIÓN
     ============================================================ */

  function client() {
    if (sb) return sb;
    if (!window.supabase || !window.SOPI_CONFIG) return null;
    sb = window.supabase.createClient(
      window.SOPI_CONFIG.supabaseUrl,
      window.SOPI_CONFIG.supabaseAnonKey,
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }
    );
    return sb;
  }

  function requireUser() {
    if (!CURRENT || !DB) throw new Error('Sin sesión activa');
  }

  /** Traduce los errores de Supabase a algo legible en español. */
  function traducir(error) {
    const m = String((error && error.message) || error || '').toLowerCase();
    if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
    if (m.includes('email not confirmed'))       return 'Falta confirmar tu correo. Revisa tu bandeja (y el spam).';
    if (m.includes('user already registered') ||
        m.includes('already been registered'))   return 'Ese correo ya está registrado. Inicia sesión.';
    if (m.includes('password should be'))        return 'La contraseña es demasiado corta para el servidor.';
    if (m.includes('rate limit') ||
        m.includes('too many'))                  return 'Demasiados intentos. Espera un momento y vuelve a probar.';
    if (m.includes('failed to fetch') ||
        m.includes('networkerror'))              return 'No se pudo conectar con el servidor. Revisa tu conexión.';
    if (m.includes('jwt') || m.includes('expired')) return 'Tu sesión caducó. Vuelve a iniciar sesión.';
    if (m.includes('row-level security') ||
        m.includes('violates row-level'))        return 'El servidor rechazó la operación (permisos). Revisa el SQL del esquema.';
    if (m.includes('does not exist') ||
        m.includes('schema cache'))              return 'Faltan tablas en Supabase. Ejecuta supabase/schema.sql en el SQL Editor.';
    if (m.includes('invalid path') ||
        m.includes('no route matched'))          return 'La URL del proyecto en js/config.js está mal: debe ser https://xxxx.supabase.co, sin barra ni rutas al final.';
    if (m.includes('invalid api key') ||
        m.includes('no api key'))                return 'La clave anon de js/config.js no es válida. Cópiala de Settings → API → anon public.';
    if (m.includes('signups not allowed') ||
        m.includes('signup is disabled'))        return 'El registro está desactivado en Supabase (Authentication → Sign In / Providers).';
    return (error && error.message) || 'No se pudo completar la operación.';
  }

  /** Ejecuta una escritura y avisa si falla. */
  async function run(promise, contexto) {
    const { data, error } = await promise;
    if (error) {
      console.error('[SOPI/Supabase]', contexto, error);
      U.toast(traducir(error), 'error');
      throw new Error(traducir(error));
    }
    return data;
  }

  /* ============================================================
     TRADUCCIÓN entre columnas (snake_case) y objetos (camelCase)
     ============================================================ */

  const uid = () => CURRENT.id;

  const rowToTask = r => ({
    id: r.id, listId: r.list_id, title: r.title, kind: r.kind || 'normal',
    repeat: r.kind === 'weekly' ? { days: (r.repeat_days || []).map(Number) } : null,
    doneDates: r.kind === 'weekly' ? (r.done_dates || []) : null,
    note: r.note || '', dueDate: r.due_date, dueTime: r.due_time,
    priority: r.priority || 0,
    urgent: r.urgent, important: r.important,
    pomodoros: r.pomodoros || 0, estimate: r.estimate || 0, duration: r.duration || 60,
    subtasks: r.subtasks || [],
    completed: !!r.completed, completedAt: r.completed_at, trashed: !!r.trashed,
    order: r.position || 0, createdAt: r.created_at, updatedAt: r.updated_at,
  });

  const taskToRow = t => ({
    id: t.id, user_id: uid(), list_id: t.listId || null,
    title: t.title, kind: t.kind || 'normal', note: t.note || '',
    due_date: t.dueDate || null, due_time: t.dueTime || null,
    priority: t.priority || 0,
    repeat_days: (t.repeat && t.repeat.days) || [],
    done_dates: t.doneDates || [],
    urgent: t.urgent === undefined ? null : t.urgent,
    important: t.important === undefined ? null : t.important,
    pomodoros: t.pomodoros || 0, estimate: t.estimate || 0, duration: t.duration || 60,
    subtasks: t.subtasks || [],
    completed: !!t.completed, completed_at: t.completedAt || null, trashed: !!t.trashed,
    position: t.order || 0,
  });

  const rowToList = r => ({ id: r.id, name: r.name, color: r.color, order: r.position, createdAt: r.created_at });
  const listToRow = l => ({ id: l.id, user_id: uid(), name: l.name, color: l.color, position: l.order || 0 });

  const rowToHabit = r => ({ id: r.id, name: r.name, emoji: r.emoji, color: r.color, freq: r.freq, archived: r.archived, order: r.position, createdAt: r.created_at });
  const habitToRow = h => ({ id: h.id, user_id: uid(), name: h.name, emoji: h.emoji, color: h.color, freq: h.freq, archived: !!h.archived, position: h.order || 0 });

  const rowToLog = r => ({ id: r.id, habitId: r.habit_id, date: r.date, at: r.created_at });
  const rowToPom = r => ({ id: r.id, kind: r.kind, taskId: r.task_id, minutes: r.minutes, date: r.date, startedAt: r.started_at, endedAt: r.ended_at });
  const rowToCnt = r => ({ id: r.id, title: r.title, emoji: r.emoji, color: r.color, date: r.date, time: r.time, repeat: r.repeat, note: r.note, taskId: r.task_id, createdAt: r.created_at });
  const cntToRow = c => ({ id: c.id, user_id: uid(), title: c.title, emoji: c.emoji, color: c.color, date: c.date, time: c.time || null, repeat: c.repeat || 'none', note: c.note || '', task_id: c.taskId || null });

  /* ============================================================
     CARGA INICIAL
     ============================================================ */

  async function loadAll() {
    const s = client();
    const id = CURRENT.id;

    const [lists, tasks, habits, logs, poms, cnts, settings] = await Promise.all([
      s.from('lists').select('*').eq('user_id', id).order('position'),
      s.from('tasks').select('*').eq('user_id', id),
      s.from('habits').select('*').eq('user_id', id).order('position'),
      s.from('habit_logs').select('*').eq('user_id', id),
      s.from('pomodoro_sessions').select('*').eq('user_id', id),
      s.from('countdowns').select('*').eq('user_id', id),
      s.from('user_settings').select('data').eq('user_id', id).maybeSingle(),
    ]);

    const primerError = [lists, tasks, habits, logs, poms, cnts, settings].find(r => r.error);
    if (primerError) throw new Error(traducir(primerError.error));

    DB = {
      lists:      (lists.data || []).map(rowToList),
      tasks:      (tasks.data || []).map(rowToTask),
      habits:     (habits.data || []).map(rowToHabit),
      habitLogs:  (logs.data || []).map(rowToLog),
      pomodoros:  (poms.data || []).map(rowToPom),
      countdowns: (cnts.data || []).map(rowToCnt),
      settings:   Object.assign(Q.EMPTY_DB().settings, (settings.data && settings.data.data) || {}),
    };

    /* Si el disparador del SQL no creó las listas (cuenta antigua), las creamos */
    if (!DB.lists.length) {
      const base = [
        ['Bandeja de entrada', '#4772fa'], ['Trabajo', '#e64545'],
        ['Estudio', '#f0a92a'], ['Personal', '#35b98a'],
      ];
      for (let i = 0; i < base.length; i++) {
        const l = { id: U.uid('lst'), name: base[i][0], color: base[i][1], order: i, createdAt: new Date().toISOString() };
        DB.lists.push(l);
        await run(s.from('lists').insert(listToRow(l)), 'crear lista inicial');
      }
    }
  }

  /* ============================================================
     API PÚBLICA  (idéntica a la del modo local)
     ============================================================ */

  const Store = {

    mode: 'supabase',

    /* ---------------- Sesión ---------------- */

    passwordStrength: (p, extra) => window.StoreLocal.passwordStrength(p, extra),
    lockStatus: () => 0,        // el bloqueo lo aplica Supabase en el servidor

    async register({ name, email, password }) {
      const s = client();
      if (!s) return fail('Falta configurar Supabase en js/config.js.');

      name = String(name || '').trim();
      email = String(email || '').trim().toLowerCase();
      if (name.length < 2) return fail('Escribe tu nombre.');
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return fail('El correo no es válido.');

      const fuerza = this.passwordStrength(password, [name, email]);
      if (!fuerza.ok) return fail(fuerza.problemas[0]);

      const { data, error } = await s.auth.signUp({
        email, password,
        options: {
          data: { name },
          // El enlace del correo debe devolverte al MISMO sitio desde el que
          // te registraste (Vercel o tu servidor local), no al que Supabase
          // tenga por defecto. Esa dirección debe estar en Redirect URLs.
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) return fail(traducir(error));

      // Si el proyecto pide confirmar el correo, aún no hay sesión
      if (!data.session) {
        const e = new Error('Cuenta creada. Confirma tu correo desde el enlace que te enviamos y vuelve a entrar.');
        e.needsConfirmation = true;
        return Promise.reject(e);
      }

      return this._afterAuth(data.user, name);
    },

    async login({ email, password }) {
      const s = client();
      if (!s) return fail('Falta configurar Supabase en js/config.js.');

      const { data, error } = await s.auth.signInWithPassword({
        email: String(email || '').trim().toLowerCase(),
        password: String(password || ''),
      });
      if (error) return fail(traducir(error));
      return this._afterAuth(data.user);
    },

    /** Enviar correo para restablecer la contraseña. */
    async resetPassword(email) {
      const s = client();
      if (!s) return fail('Falta configurar Supabase en js/config.js.');
      const { error } = await s.auth.resetPasswordForEmail(
        String(email || '').trim().toLowerCase(),
        { redirectTo: location.origin }
      );
      if (error) return fail(traducir(error));
      return ok(true);
    },

    async _afterAuth(user, nombre) {
      const s = client();
      let name = nombre || (user.user_metadata && user.user_metadata.name) || '';

      const { data: perfil } = await s.from('profiles').select('name').eq('id', user.id).maybeSingle();
      if (perfil && perfil.name) name = perfil.name;
      else if (name) await s.from('profiles').upsert({ id: user.id, name });

      CURRENT = { id: user.id, name: name || user.email.split('@')[0], email: user.email };
      await loadAll();
      return ok(CURRENT);
    },

    /** Al abrir la app: ¿hay sesión guardada por Supabase? */
    async restore() {
      const s = client();
      if (!s) return ok(null);
      const { data, error } = await s.auth.getSession();
      if (error || !data.session) return ok(null);
      try {
        return await this._afterAuth(data.session.user);
      } catch (e) {
        console.error('[SOPI/Supabase] restore', e);
        return ok(null);
      }
    },

    touchSession() { /* Supabase renueva el token solo */ },

    async logout() {
      const s = client();
      if (s) await s.auth.signOut();
      CURRENT = null; DB = null;
      return ok(true);
    },

    async changePassword({ next }) {
      const s = client();
      const fuerza = this.passwordStrength(next, [CURRENT && CURRENT.name, CURRENT && CURRENT.email]);
      if (!fuerza.ok) return fail(fuerza.problemas[0]);
      const { error } = await s.auth.updateUser({ password: next });
      if (error) return fail(traducir(error));
      return ok(true);
    },

    currentUser() { return CURRENT; },

    /* ---------------- Ajustes ---------------- */

    async getSettings() { requireUser(); return ok(Q.copy(DB.settings)); },

    async updateSettings(patch) {
      requireUser();
      DB.settings = Object.assign({}, DB.settings, patch);
      await run(client().from('user_settings')
        .upsert({ user_id: uid(), data: DB.settings, updated_at: new Date().toISOString() }), 'ajustes');
      return ok(DB.settings);
    },

    /* ---------------- Listas ---------------- */

    async getLists() { requireUser(); return ok(Q.lists(DB)); },

    async createList({ name, color }) {
      requireUser();
      name = String(name || '').trim();
      if (!name) return fail('La lista necesita un nombre.');
      const list = { id: U.uid('lst'), name, color: color || '#4772fa', order: DB.lists.length, createdAt: new Date().toISOString() };
      DB.lists.push(list);
      await run(client().from('lists').insert(listToRow(list)), 'crear lista');
      return ok(Q.copy(list));
    },

    async updateList(id, patch) {
      requireUser();
      const l = DB.lists.find(x => x.id === id);
      if (!l) return fail('Lista no encontrada.');
      Object.assign(l, patch, { id: l.id });
      await run(client().from('lists').update(listToRow(l)).eq('id', id), 'actualizar lista');
      return ok(Q.copy(l));
    },

    async deleteList(id) {
      requireUser();
      if (DB.lists.length <= 1) return fail('Debe quedar al menos una lista.');
      DB.lists = DB.lists.filter(l => l.id !== id);
      const afectadas = DB.tasks.filter(t => t.listId === id).map(t => t.id);
      DB.tasks.forEach(t => { if (t.listId === id) t.trashed = true; });

      const s = client();
      if (afectadas.length) {
        await run(s.from('tasks').update({ trashed: true }).in('id', afectadas), 'papelera por lista');
      }
      await run(s.from('lists').delete().eq('id', id), 'borrar lista');
      return ok(true);
    },

    async inboxId() { requireUser(); const l = Q.lists(DB)[0]; return ok(l ? l.id : null); },

    /* ---------------- Tareas ---------------- */

    async getTasks(filter) { requireUser(); return ok(Q.filterTasks(DB, filter)); },

    async getTask(id) {
      requireUser();
      const t = DB.tasks.find(x => x.id === id);
      return ok(t ? Q.copy(t) : null);
    },

    async createTask(data) {
      requireUser();
      if (!String((data && data.title) || '').trim()) return fail('La tarea necesita un título.');
      const inbox = Q.lists(DB)[0];
      const task = Q.newTask(data, inbox && inbox.id, DB.tasks.length);
      DB.tasks.push(task);
      await run(client().from('tasks').insert(taskToRow(task)), 'crear tarea');
      return ok(Q.copy(task));
    },

    async updateTask(id, patch) {
      requireUser();
      const t = DB.tasks.find(x => x.id === id);
      if (!t) return fail('Tarea no encontrada.');
      Object.assign(t, patch, { id: t.id, updatedAt: new Date().toISOString() });
      if (patch && patch.completed !== undefined) {
        t.completedAt = patch.completed ? new Date().toISOString() : null;
      }
      await run(client().from('tasks').update(taskToRow(t)).eq('id', id), 'actualizar tarea');
      return ok(Q.copy(t));
    },

    async toggleTask(id) {
      requireUser();
      const t = DB.tasks.find(x => x.id === id);
      if (!t) return fail('Tarea no encontrada.');
      return this.updateTask(id, { completed: !t.completed });
    },

    async toggleOccurrence(id, date) {
      requireUser();
      const t = DB.tasks.find(x => x.id === id);
      if (!t) return fail('Tarea no encontrada.');
      t.doneDates = t.doneDates || [];
      const i = t.doneDates.indexOf(date);
      if (i >= 0) t.doneDates.splice(i, 1); else t.doneDates.push(date);
      await run(client().from('tasks').update({ done_dates: t.doneDates }).eq('id', id), 'marcar día');
      return ok(t.doneDates.indexOf(date) >= 0);
    },

    _weeklyHits(t, date) { return Q.weeklyHits(t, date); },

    async getAgenda(range) { requireUser(); return ok(Q.agenda(DB, range)); },

    async trashTask(id)   { return this.updateTask(id, { trashed: true  }); },
    async restoreTask(id) { return this.updateTask(id, { trashed: false }); },

    async deleteTask(id) {
      requireUser();
      DB.tasks = DB.tasks.filter(t => t.id !== id);
      await run(client().from('tasks').delete().eq('id', id), 'borrar tarea');
      return ok(true);
    },

    async emptyTrash() {
      requireUser();
      const ids = DB.tasks.filter(t => t.trashed).map(t => t.id);
      DB.tasks = DB.tasks.filter(t => !t.trashed);
      if (ids.length) await run(client().from('tasks').delete().in('id', ids), 'vaciar papelera');
      return ok(true);
    },

    async getCounts() { requireUser(); return ok(Q.counts(DB)); },

    /* ---------------- Hábitos ---------------- */

    async getHabits(opts) { requireUser(); return ok(Q.habits(DB, opts)); },

    async createHabit(data) {
      requireUser();
      if (!String((data && data.name) || '').trim()) return fail('El hábito necesita un nombre.');
      const h = Q.newHabit(data, DB.habits.length);
      DB.habits.push(h);
      await run(client().from('habits').insert(habitToRow(h)), 'crear hábito');
      return ok(Q.copy(h));
    },

    async updateHabit(id, patch) {
      requireUser();
      const h = DB.habits.find(x => x.id === id);
      if (!h) return fail('Hábito no encontrado.');
      const freq = (patch && patch.freq) ? Object.assign({}, h.freq, patch.freq) : null;
      Object.assign(h, patch, { id: h.id });
      if (freq) h.freq = freq;
      await run(client().from('habits').update(habitToRow(h)).eq('id', id), 'actualizar hábito');
      return ok(Q.copy(h));
    },

    async deleteHabit(id) {
      requireUser();
      DB.habits = DB.habits.filter(h => h.id !== id);
      DB.habitLogs = DB.habitLogs.filter(l => l.habitId !== id);
      await run(client().from('habits').delete().eq('id', id), 'borrar hábito');
      return ok(true);
    },

    async getHabitLogs(filter) { requireUser(); return ok(Q.habitLogs(DB, filter)); },

    async toggleHabit(habitId, date) {
      requireUser();
      const s = client();
      const i = DB.habitLogs.findIndex(l => l.habitId === habitId && l.date === date);
      if (i >= 0) {
        const log = DB.habitLogs[i];
        DB.habitLogs.splice(i, 1);
        await run(s.from('habit_logs').delete().eq('id', log.id), 'desmarcar hábito');
        return ok(false);
      }
      const log = { id: U.uid('hlg'), habitId, date, at: new Date().toISOString() };
      DB.habitLogs.push(log);
      await run(s.from('habit_logs').insert({
        id: log.id, user_id: uid(), habit_id: habitId, date,
      }), 'marcar hábito');
      return ok(true);
    },

    /* ---------------- Pomodoro ---------------- */

    async getPomodoros(filter) { requireUser(); return ok(Q.pomodoros(DB, filter)); },

    async addPomodoro(data) {
      requireUser();
      const s = client();
      const sesion = Q.newPomodoro(data);
      DB.pomodoros.push(sesion);
      await run(s.from('pomodoro_sessions').insert({
        id: sesion.id, user_id: uid(), task_id: sesion.taskId, kind: sesion.kind,
        minutes: sesion.minutes, date: sesion.date,
        started_at: sesion.startedAt, ended_at: sesion.endedAt,
      }), 'guardar sesión');

      if (sesion.kind === 'focus' && sesion.taskId) {
        const t = DB.tasks.find(x => x.id === sesion.taskId);
        if (t) {
          t.pomodoros = (t.pomodoros || 0) + 1;
          await run(s.from('tasks').update({ pomodoros: t.pomodoros }).eq('id', t.id), 'sumar pomodoro');
        }
      }
      return ok(Q.copy(sesion));
    },

    async deletePomodoro(id) {
      requireUser();
      DB.pomodoros = DB.pomodoros.filter(s => s.id !== id);
      await run(client().from('pomodoro_sessions').delete().eq('id', id), 'borrar sesión');
      return ok(true);
    },

    /* ---------------- Cuenta atrás ---------------- */

    async getCountdowns() { requireUser(); return ok(Q.copy(DB.countdowns)); },

    async createCountdown(data) {
      requireUser();
      if (!String((data && data.title) || '').trim()) return fail('La cuenta atrás necesita un nombre.');
      if (!data.date) return fail('Elige una fecha.');
      const c = Q.newCountdown(data);
      DB.countdowns.push(c);
      await run(client().from('countdowns').insert(cntToRow(c)), 'crear cuenta atrás');
      return ok(Q.copy(c));
    },

    async updateCountdown(id, patch) {
      requireUser();
      const c = DB.countdowns.find(x => x.id === id);
      if (!c) return fail('Cuenta atrás no encontrada.');
      Object.assign(c, patch, { id: c.id });
      await run(client().from('countdowns').update(cntToRow(c)).eq('id', id), 'actualizar cuenta atrás');
      return ok(Q.copy(c));
    },

    async deleteCountdown(id) {
      requireUser();
      DB.countdowns = DB.countdowns.filter(c => c.id !== id);
      await run(client().from('countdowns').delete().eq('id', id), 'borrar cuenta atrás');
      return ok(true);
    },

    /* ---------------- Utilidades ---------------- */

    async exportAll() {
      requireUser();
      return ok({ version: 1, mode: 'supabase', user: CURRENT, exportedAt: new Date().toISOString(), data: DB });
    },

    /** Vuelve a bajar todo del servidor (por si algo se desincronizó). */
    async reload() { requireUser(); await loadAll(); return ok(true); },

    /**
     * Sube de golpe una base local completa (la usa la migración).
     * Respeta los ids: si ya existen, los actualiza.
     */
    async importDb(local) {
      requireUser();
      const s = client();
      const resumen = { listas: 0, tareas: 0, habitos: 0, registros: 0, sesiones: 0, fechas: 0 };
      if (!local) return ok(resumen);

      /* Listas: las que ya existen por nombre se reutilizan */
      const porNombre = {};
      DB.lists.forEach(l => (porNombre[l.name.toLowerCase()] = l.id));
      const mapaListas = {};

      for (const l of (local.lists || [])) {
        const existente = porNombre[String(l.name || '').toLowerCase()];
        if (existente) { mapaListas[l.id] = existente; continue; }
        const nueva = { id: U.uid('lst'), name: l.name, color: l.color, order: DB.lists.length, createdAt: l.createdAt };
        DB.lists.push(nueva);
        await run(s.from('lists').insert(listToRow(nueva)), 'migrar lista');
        mapaListas[l.id] = nueva.id;
        resumen.listas++;
      }

      /* Tareas */
      const mapaTareas = {};
      const filasTareas = [];
      for (const t of (local.tasks || [])) {
        const nueva = Q.newTask(Object.assign({}, t, {
          id: U.uid('tsk'), listId: mapaListas[t.listId] || (Q.lists(DB)[0] || {}).id,
        }), null, DB.tasks.length + filasTareas.length);
        nueva.doneDates = t.doneDates || (t.kind === 'weekly' ? [] : null);
        mapaTareas[t.id] = nueva.id;
        DB.tasks.push(nueva);
        filasTareas.push(taskToRow(nueva));
      }
      for (let i = 0; i < filasTareas.length; i += 200) {
        await run(s.from('tasks').insert(filasTareas.slice(i, i + 200)), 'migrar tareas');
      }
      resumen.tareas = filasTareas.length;

      /* Hábitos y sus registros */
      const mapaHabitos = {};
      for (const h of (local.habits || [])) {
        const nuevo = Q.newHabit(Object.assign({}, h, { id: U.uid('hbt') }), DB.habits.length);
        mapaHabitos[h.id] = nuevo.id;
        DB.habits.push(nuevo);
        await run(s.from('habits').insert(habitToRow(nuevo)), 'migrar hábito');
        resumen.habitos++;
      }
      const filasLogs = (local.habitLogs || [])
        .filter(l => mapaHabitos[l.habitId])
        .map(l => {
          const nuevo = { id: U.uid('hlg'), habitId: mapaHabitos[l.habitId], date: l.date, at: l.at };
          DB.habitLogs.push(nuevo);
          return { id: nuevo.id, user_id: uid(), habit_id: nuevo.habitId, date: l.date };
        });
      for (let i = 0; i < filasLogs.length; i += 300) {
        await run(s.from('habit_logs').upsert(filasLogs.slice(i, i + 300), { onConflict: 'habit_id,date' }), 'migrar registros');
      }
      resumen.registros = filasLogs.length;

      /* Sesiones de pomodoro */
      const filasPom = (local.pomodoros || []).map(p => {
        const nuevo = Q.newPomodoro(Object.assign({}, p, { id: U.uid('pom'), taskId: mapaTareas[p.taskId] || null }));
        DB.pomodoros.push(nuevo);
        return {
          id: nuevo.id, user_id: uid(), task_id: nuevo.taskId, kind: nuevo.kind,
          minutes: nuevo.minutes, date: nuevo.date, started_at: nuevo.startedAt, ended_at: nuevo.endedAt,
        };
      });
      for (let i = 0; i < filasPom.length; i += 300) {
        await run(s.from('pomodoro_sessions').insert(filasPom.slice(i, i + 300)), 'migrar sesiones');
      }
      resumen.sesiones = filasPom.length;

      /* Cuentas atrás */
      for (const c of (local.countdowns || [])) {
        const nueva = Q.newCountdown(Object.assign({}, c, { id: U.uid('cnt'), taskId: mapaTareas[c.taskId] || null }));
        DB.countdowns.push(nueva);
        await run(s.from('countdowns').insert(cntToRow(nueva)), 'migrar cuenta atrás');
        resumen.fechas++;
      }

      /* Ajustes */
      if (local.settings) await this.updateSettings(local.settings);

      return ok(resumen);
    },
  };

  window.StoreRemote = Store;
})();
