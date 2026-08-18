/* ============================================================
   SOPI · store.local.js  —  ALMACÉN LOCAL (este navegador)
   Se usa cuando NO hay Supabase configurado. Expone StoreLocal;
   js/store.js decide cuál de los dos almacenes se llama Store.
   ------------------------------------------------------------
   Toda la app habla SOLO con este módulo. La implementación
   actual guarda en localStorage, pero la API es asíncrona
   (Promesas) a propósito: el día que exista un backend real
   basta con reescribir los métodos de aquí usando fetch(),
   sin tocar ni una línea de los 6 módulos.

   Claves en localStorage
     sopi.v1.users        -> [ {id,name,email,salt,hash,createdAt} ]
     sopi.v1.session      -> { userId, at }
     sopi.v1.db.<userId>  -> { lists, tasks, habits, countdowns,
                               pomodoros, countdownItems, settings }

   Modelo de tarea (pensado para los 6 módulos):
     {
       id, listId, title, note,
       dueDate:'YYYY-MM-DD'|null, dueTime:'HH:MM'|null,
       priority: 0|1|2|3,                 // 3 = alta
       urgent: bool|null, important: bool|null,   // Matriz de Eisenhower
       pomodoros: 0, estimate: 0,                 // Cronómetro
       subtasks: [ {id,title,done} ],
       completed: bool, completedAt, trashed: bool,
       order, createdAt, updatedAt
     }
   ============================================================ */
(function () {
  'use strict';

  const K_USERS   = 'sopi.v1.users';
  const K_SESSION = 'sopi.v1.session';
  const K_DB      = uid => 'sopi.v1.db.' + uid;

  /* Caducidad de la sesión */
  const SESSION_MAX_IDLE = 8  * 60 * 60 * 1000;   // 8 horas sin usarla
  const SESSION_MAX_AGE  = 30 * 24 * 60 * 60 * 1000; // 30 días desde que entró

  /* ---------- Persistencia cruda ---------- */

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('[SOPI] No se pudo leer', key, e);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('[SOPI] No se pudo guardar', key, e);
      if (window.Err) Err.handle(e, 'guardar:' + key);
      else U.toast('No se pudo guardar (almacenamiento lleno)', 'error');
      return false;
    }
  }

  /** Simula latencia cero pero mantiene el contrato asíncrono. */
  const ok = value => Promise.resolve(value);
  const fail = msg => Promise.reject(new Error(msg));

  /* ============================================================
     SEGURIDAD DE LA CONTRASEÑA
     ------------------------------------------------------------
     · PBKDF2-SHA256 con 150 000 iteraciones y sal única por usuario
       (derivar la clave cuesta ~200 ms, así la fuerza bruta es lenta).
     · Formato guardado: "pbkdf2$150000$<sal>$<clave>"
     · Las cuentas viejas (sha256/fnv) se re-cifran solas al entrar.
     · Comparación en tiempo constante para no filtrar información.
     ============================================================ */

  const PBKDF2_ITER = 150000;
  const hasSubtle = () => !!(window.crypto && crypto.subtle && crypto.subtle.importKey);

  function randomBytes(n) {
    const a = new Uint8Array(n);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else for (let i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256);
    return a;
  }

  const toHex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  const randomSalt = (n) => toHex(randomBytes(n || 16));

  /** Deriva la clave con PBKDF2; si el navegador no puede, usa un respaldo. */
  async function derive(password, salt, iterations) {
    if (hasSubtle()) {
      try {
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits({
          name: 'PBKDF2',
          salt: enc.encode(salt),
          iterations: iterations || PBKDF2_ITER,
          hash: 'SHA-256',
        }, key, 256);
        return 'pbkdf2$' + (iterations || PBKDF2_ITER) + '$' + salt + '$' + toHex(new Uint8Array(bits));
      } catch (e) { /* seguimos al respaldo */ }
    }
    // Respaldo para navegadores sin Web Crypto: muchas rondas de un hash simple
    let h = 0x811c9dc5 ^ salt.length;
    const data = salt + '::' + password;
    for (let round = 0; round < 20000; round++) {
      for (let i = 0; i < data.length; i++) h = ((h ^ data.charCodeAt(i)) * 16777619) >>> 0;
      h = (h + round) >>> 0;
    }
    return 'weak$' + salt + '$' + h.toString(16);
  }

  /** Verifica una contraseña contra lo guardado, en cualquier formato. */
  async function verifyPassword(password, user) {
    const stored = user.hash || '';

    if (stored.startsWith('pbkdf2$')) {
      const [, iter, salt] = stored.split('$');
      const candidate = await derive(password, salt, parseInt(iter, 10));
      return { ok: timingSafeEqual(candidate, stored), legacy: false };
    }
    if (stored.startsWith('weak$')) {
      const salt = stored.split('$')[1];
      const candidate = await derive(password, salt, 0);
      return { ok: timingSafeEqual(candidate, stored), legacy: hasSubtle() };
    }
    // Formatos antiguos (sha256:… / fnv:…) — se aceptan una vez y se re-cifran
    const legacy = await legacyHash(password, user.salt || '');
    return { ok: timingSafeEqual(legacy, stored), legacy: true };
  }

  /** El esquema anterior, solo para poder migrar cuentas ya creadas. */
  async function legacyHash(password, salt) {
    const data = salt + '::' + password;
    if (window.crypto && crypto.subtle && crypto.subtle.digest) {
      try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
        return 'sha256:' + toHex(new Uint8Array(buf));
      } catch (e) { /* respaldo abajo */ }
    }
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < data.length; i++) {
      h1 = (h1 ^ data.charCodeAt(i)) * 16777619 >>> 0;
      h2 = (h2 + data.charCodeAt(i) * (i + 7)) >>> 0;
    }
    return 'fnv:' + h1.toString(16) + h2.toString(16);
  }

  /** Compara sin delatar en qué carácter falla. */
  function timingSafeEqual(a, b) {
    const A = String(a), B = String(b);
    let diff = A.length ^ B.length;
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
      diff |= (A.charCodeAt(i) || 0) ^ (B.charCodeAt(i) || 0);
    }
    return diff === 0;
  }

  /* ---------- Fuerza de la contraseña ---------- */

  const COMUNES = [
    '123456', '12345678', 'password', 'contrasena', 'contraseña', 'qwerty', 'abc123',
    '111111', '123456789', 'iloveyou', 'admin123', 'sopi1234', 'peru2024', 'peru2025',
    'sinpassword', 'letmein', 'welcome', 'monkey', 'dragon', '000000', '1234567890',
  ];

  /**
   * Evalúa una contraseña: { score 0-4, label, problemas[], ok }
   * Se usa en el registro (medidor) y como validación real al guardar.
   */
  function passwordStrength(password, extra) {
    const p = String(password || '');
    const problemas = [];

    if (p.length < 8) problemas.push('Debe tener al menos 8 caracteres.');
    if (!/[a-záéíóúñ]/i.test(p)) problemas.push('Agrega alguna letra.');
    if (!/\d/.test(p)) problemas.push('Agrega algún número.');
    if (/^(.)\1+$/.test(p)) problemas.push('No repitas el mismo carácter.');
    if (/^(?:0123|1234|2345|3456|4567|5678|6789|abcd|qwer)/i.test(p)) {
      problemas.push('Evita secuencias como 1234 o qwerty.');
    }
    if (COMUNES.includes(p.toLowerCase())) problemas.push('Esa contraseña es demasiado conocida.');
    (extra || []).forEach(dato => {
      const d = String(dato || '').toLowerCase().split('@')[0];
      if (d.length >= 4 && p.toLowerCase().includes(d)) {
        problemas.push('No uses tu nombre ni tu correo dentro de la contraseña.');
      }
    });

    let score = 0;
    if (p.length >= 8)  score++;
    if (p.length >= 12) score++;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++;
    if (/\d/.test(p) && /[^\w\s]/.test(p)) score++;
    if (problemas.length) score = Math.min(score, 1);

    const LABELS = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Muy buena'];
    return { score, label: LABELS[score], problemas, ok: problemas.length === 0 };
  }

  /* ---------- Bloqueo por intentos fallidos ---------- */

  const K_TRIES = 'sopi.v1.tries';
  const MAX_TRIES = 5;
  const LOCK_STEPS = [30, 60, 300, 900];   // segundos: 30s, 1min, 5min, 15min

  const triesAll = () => read(K_TRIES, {});

  function triesFor(email) {
    const t = triesAll()[email];
    return t || { count: 0, lockedUntil: 0, locks: 0 };
  }

  function saveTries(email, data) {
    const all = triesAll();
    if (!data) delete all[email]; else all[email] = data;
    write(K_TRIES, all);
  }

  /** Segundos que faltan de bloqueo (0 si está libre). */
  function lockedSeconds(email) {
    const t = triesFor(email);
    if (!t.lockedUntil) return 0;
    const left = Math.ceil((t.lockedUntil - Date.now()) / 1000);
    return left > 0 ? left : 0;
  }

  function registerFailure(email) {
    const t = triesFor(email);
    t.count = (t.count || 0) + 1;
    if (t.count >= MAX_TRIES) {
      const paso = Math.min(t.locks || 0, LOCK_STEPS.length - 1);
      t.lockedUntil = Date.now() + LOCK_STEPS[paso] * 1000;
      t.locks = (t.locks || 0) + 1;
      t.count = 0;
    }
    saveTries(email, t);
    return t;
  }

  const clearFailures = email => saveTries(email, null);

  /* ---------- Base de datos por usuario ---------- */

  const DEFAULT_DB = () => ({
    lists: [],
    tasks: [],
    habits: [],           // Módulo 4
    habitLogs: [],        // Módulo 4
    pomodoros: [],        // Módulo 5
    countdowns: [],       // Módulo 6
    settings: {
      pomodoro: { focus: 25, shortBreak: 5, longBreak: 15, cycles: 4 },
      startOfWeek: 1,
    },
  });

  let CURRENT = null;   // { id, name, email }
  let DB = null;        // caché en memoria de la BD del usuario activo

  function loadDb(userId) {
    const db = read(K_DB(userId), null) || DEFAULT_DB();
    const def = DEFAULT_DB();
    Object.keys(def).forEach(k => { if (db[k] === undefined) db[k] = def[k]; });
    db.settings = Object.assign({}, def.settings, db.settings || {});
    return db;
  }

  const saveDb = () => CURRENT && write(K_DB(CURRENT.id), DB);

  function requireUser() {
    if (!CURRENT || !DB) throw new Error('Sin sesión activa');
  }

  /* ---------- Listas de ejemplo al crear cuenta ---------- */

  function seed(db) {
    const now = new Date().toISOString();
    const mk = (name, color) => ({ id: U.uid('lst'), name, color, order: db.lists.length, createdAt: now });
    db.lists.push(mk('Bandeja de entrada', '#4772fa'));
    db.lists.push(mk('Trabajo', '#e64545'));
    db.lists.push(mk('Estudio', '#f0a92a'));
    db.lists.push(mk('Personal', '#35b98a'));
    return db;
  }

  /* ============================================================
     API PÚBLICA
     ============================================================ */

  const Store = {

    /* ---------------- Sesión ---------------- */

    /** Medidor de contraseña, para el formulario de registro. */
    passwordStrength,

    /** Segundos de bloqueo que le quedan a un correo (0 = libre). */
    lockStatus(email) {
      return lockedSeconds(String(email || '').trim().toLowerCase());
    },

    async register({ name, email, password }) {
      name = String(name || '').trim();
      email = String(email || '').trim().toLowerCase();

      if (name.length < 2)  return fail('Escribe tu nombre.');
      if (name.length > 60) return fail('Ese nombre es demasiado largo.');
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return fail('El correo no es válido.');
      if (email.length > 120) return fail('Ese correo es demasiado largo.');
      if (String(password).length > 200) return fail('La contraseña es demasiado larga.');

      const fuerza = passwordStrength(password, [name, email]);
      if (!fuerza.ok) return fail(fuerza.problemas[0]);

      const users = read(K_USERS, []);
      if (users.some(u => u.email === email)) return fail('Ese correo ya está registrado. Inicia sesión.');

      const salt = randomSalt(16);
      const hash = await derive(password, salt, PBKDF2_ITER);
      const user = {
        id: U.uid('usr'), name, email, salt, hash,
        createdAt: new Date().toISOString(),
        lastLogin: null,
      };
      users.push(user);
      if (!write(K_USERS, users)) return fail('No se pudo guardar la cuenta en este navegador.');

      write(K_DB(user.id), seed(DEFAULT_DB()));
      return this.login({ email, password });
    },

    async login({ email, password }) {
      email = String(email || '').trim().toLowerCase();

      /* 1. ¿Está bloqueado por intentos fallidos? */
      const espera = lockedSeconds(email);
      if (espera > 0) {
        const min = Math.ceil(espera / 60);
        return fail(espera > 60
          ? `Demasiados intentos. Vuelve a probar en ${min} minuto${min === 1 ? '' : 's'}.`
          : `Demasiados intentos. Espera ${espera} segundos.`);
      }

      const users = read(K_USERS, []);
      const user = users.find(u => u.email === email);

      /* 2. Mensaje idéntico exista o no la cuenta (no revelamos correos) */
      const GENERICO = 'Correo o contraseña incorrectos.';
      if (!user) {
        await derive(String(password || ''), 'inexistente', 1000);   // mismo coste aprox.
        registerFailure(email);
        return fail(GENERICO);
      }

      const check = await verifyPassword(String(password || ''), user);
      if (!check.ok) {
        const t = registerFailure(email);
        const restantes = MAX_TRIES - (t.count || 0);
        return fail(t.lockedUntil > Date.now()
          ? 'Demasiados intentos fallidos. La cuenta queda bloqueada un momento.'
          : restantes <= 2
            ? `${GENERICO} Te quedan ${restantes} intento${restantes === 1 ? '' : 's'}.`
            : GENERICO);
      }

      /* 3. Cuenta antigua: se vuelve a cifrar con el esquema fuerte */
      if (check.legacy) {
        const salt = randomSalt(16);
        user.salt = salt;
        user.hash = await derive(String(password), salt, PBKDF2_ITER);
        write(K_USERS, users);
      }

      clearFailures(email);
      user.lastLogin = new Date().toISOString();
      write(K_USERS, users);

      CURRENT = { id: user.id, name: user.name, email: user.email };
      DB = loadDb(user.id);
      write(K_SESSION, {
        userId: user.id,
        at: Date.now(),
        seen: Date.now(),
        token: randomSalt(24),                 // identifica esta sesión concreta
      });
      return ok(CURRENT);
    },

    /**
     * Restaura la sesión guardada. Caduca a las SESSION_MAX_IDLE de
     * inactividad, o a los SESSION_MAX_AGE desde que se abrió.
     */
    async restore() {
      const s = read(K_SESSION, null);
      if (!s || !s.userId) return ok(null);

      const idle = Date.now() - (s.seen || s.at || 0);
      const age  = Date.now() - (s.at || 0);
      if (idle > SESSION_MAX_IDLE || age > SESSION_MAX_AGE) {
        localStorage.removeItem(K_SESSION);
        return ok({ expired: true });
      }

      const user = read(K_USERS, []).find(u => u.id === s.userId);
      if (!user) { localStorage.removeItem(K_SESSION); return ok(null); }

      CURRENT = { id: user.id, name: user.name, email: user.email };
      DB = loadDb(user.id);
      this.touchSession();
      return ok(CURRENT);
    },

    /** Marca actividad para que la sesión no caduque mientras trabajas. */
    touchSession() {
      const s = read(K_SESSION, null);
      if (!s || !s.userId) return;
      if (Date.now() - (s.seen || 0) < 60000) return;    // como máximo una escritura por minuto
      s.seen = Date.now();
      write(K_SESSION, s);
    },

    async logout() {
      CURRENT = null; DB = null;
      localStorage.removeItem(K_SESSION);
      return ok(true);
    },

    /** Cambiar la contraseña estando dentro. */
    async changePassword({ current, next }) {
      requireUser();
      const users = read(K_USERS, []);
      const user = users.find(u => u.id === CURRENT.id);
      if (!user) return fail('No encontramos tu cuenta.');

      const check = await verifyPassword(String(current || ''), user);
      if (!check.ok) return fail('La contraseña actual no coincide.');

      const fuerza = passwordStrength(next, [user.name, user.email]);
      if (!fuerza.ok) return fail(fuerza.problemas[0]);

      const salt = randomSalt(16);
      user.salt = salt;
      user.hash = await derive(String(next), salt, PBKDF2_ITER);
      write(K_USERS, users);
      return ok(true);
    },

    currentUser() { return CURRENT; },

    /* ---------------- Ajustes ---------------- */

    async getSettings() { requireUser(); return ok(JSON.parse(JSON.stringify(DB.settings))); },

    async updateSettings(patch) {
      requireUser();
      DB.settings = Object.assign({}, DB.settings, patch);
      saveDb();
      return ok(DB.settings);
    },

    /* ---------------- Listas ---------------- */

    async getLists() {
      requireUser();
      return ok(Q.lists(DB));
    },

    async createList({ name, color }) {
      requireUser();
      name = String(name || '').trim();
      if (!name) return fail('La lista necesita un nombre.');
      const list = {
        id: U.uid('lst'), name,
        color: color || '#4772fa',
        order: DB.lists.length,
        createdAt: new Date().toISOString(),
      };
      DB.lists.push(list); saveDb();
      return ok(list);
    },

    async updateList(id, patch) {
      requireUser();
      const l = DB.lists.find(x => x.id === id);
      if (!l) return fail('Lista no encontrada.');
      Object.assign(l, patch, { id: l.id });
      saveDb();
      return ok(l);
    },

    /** Borra la lista y manda sus tareas a la papelera. */
    async deleteList(id) {
      requireUser();
      if (DB.lists.length <= 1) return fail('Debe quedar al menos una lista.');
      DB.lists = DB.lists.filter(l => l.id !== id);
      DB.tasks.forEach(t => { if (t.listId === id) { t.trashed = true; t.updatedAt = new Date().toISOString(); } });
      saveDb();
      return ok(true);
    },

    /** Primera lista = bandeja de entrada por defecto. */
    async inboxId() {
      requireUser();
      const sorted = DB.lists.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
      return ok(sorted[0] ? sorted[0].id : null);
    },

    /* ---------------- Tareas ---------------- */

    /**
     * getTasks({ listId, from, to, completed, trashed, search, hasDate })
     * Sin filtros devuelve las tareas activas (no papelera).
     */
    async getTasks(filter) {
      requireUser();
      return ok(Q.filterTasks(DB, filter));
    },

    async getTask(id) {
      requireUser();
      const t = DB.tasks.find(x => x.id === id);
      return ok(t ? JSON.parse(JSON.stringify(t)) : null);
    },

    async createTask(data) {
      requireUser();
      if (!String((data && data.title) || '').trim()) return fail('La tarea necesita un título.');
      const inbox = Q.lists(DB)[0];
      const task = Q.newTask(data, inbox && inbox.id, DB.tasks.length);
      DB.tasks.push(task); saveDb();
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
      saveDb();
      return ok(JSON.parse(JSON.stringify(t)));
    },

    async toggleTask(id) {
      requireUser();
      const t = DB.tasks.find(x => x.id === id);
      if (!t) return fail('Tarea no encontrada.');
      return this.updateTask(id, { completed: !t.completed });
    },

    /* ---------------- Tareas semanales ---------------- */

    /**
     * Marca o desmarca UNA ocurrencia de una tarea semanal.
     * La tarea sigue viva: solo se apunta ese día como hecho.
     */
    async toggleOccurrence(id, date) {
      requireUser();
      const t = DB.tasks.find(x => x.id === id);
      if (!t) return fail('Tarea no encontrada.');
      t.doneDates = t.doneDates || [];
      const i = t.doneDates.indexOf(date);
      if (i >= 0) t.doneDates.splice(i, 1);
      else t.doneDates.push(date);
      t.updatedAt = new Date().toISOString();
      saveDb();
      return ok(t.doneDates.indexOf(date) >= 0);
    },

    /** ¿Toca esta tarea semanal ese día? */
    _weeklyHits(t, date) { return Q.weeklyHits(t, date); },

    /** Agenda con las semanales ya expandidas (ver query.js). */
    async getAgenda(range) {
      requireUser();
      return ok(Q.agenda(DB, range));
    },

    /** Papelera (borrado suave). */
    async trashTask(id)   { return this.updateTask(id, { trashed: true  }); },
    async restoreTask(id) { return this.updateTask(id, { trashed: false }); },

    /** Borrado definitivo. */
    async deleteTask(id) {
      requireUser();
      DB.tasks = DB.tasks.filter(t => t.id !== id);
      saveDb();
      return ok(true);
    },

    async emptyTrash() {
      requireUser();
      DB.tasks = DB.tasks.filter(t => !t.trashed);
      saveDb();
      return ok(true);
    },

    /** Conteos para las insignias de la barra lateral. */
    async getCounts() {
      requireUser();
      return ok(Q.counts(DB));
    },

    /* ============================================================
       HÁBITOS  (Módulo 4)
       ------------------------------------------------------------
       habit = {
         id, name, emoji, color,
         freq: { type:'daily'|'days'|'weekly', days:[0..6], times:N },
         archived, order, createdAt
       }
       habitLog = { id, habitId, date:'YYYY-MM-DD' }   (existe = hecho)
       ============================================================ */

    async getHabits(opts) {
      requireUser();
      return ok(Q.habits(DB, opts));
    },

    async createHabit(data) {
      requireUser();
      const name = String((data && data.name) || '').trim();
      if (!name) return fail('El hábito necesita un nombre.');
      const habit = {
        id: U.uid('hbt'),
        name,
        emoji: (data && data.emoji) || '✅',
        color: (data && data.color) || '#4772fa',
        freq:  Object.assign({ type: 'daily', days: [1, 2, 3, 4, 5], times: 3 }, (data && data.freq) || {}),
        archived: false,
        order: DB.habits.length,
        createdAt: new Date().toISOString(),
      };
      DB.habits.push(habit); saveDb();
      return ok(JSON.parse(JSON.stringify(habit)));
    },

    async updateHabit(id, patch) {
      requireUser();
      const h = DB.habits.find(x => x.id === id);
      if (!h) return fail('Hábito no encontrado.');
      // La frecuencia se mezcla (no se reemplaza) para no perder días ni veces
      const freq = (patch && patch.freq) ? Object.assign({}, h.freq, patch.freq) : null;
      Object.assign(h, patch, { id: h.id });
      if (freq) h.freq = freq;
      saveDb();
      return ok(JSON.parse(JSON.stringify(h)));
    },

    /** Borra el hábito y todo su historial. */
    async deleteHabit(id) {
      requireUser();
      DB.habits = DB.habits.filter(h => h.id !== id);
      DB.habitLogs = DB.habitLogs.filter(l => l.habitId !== id);
      saveDb();
      return ok(true);
    },

    /** getHabitLogs({ habitId, from, to }) */
    async getHabitLogs(filter) {
      requireUser();
      return ok(Q.habitLogs(DB, filter));
    },

    /** Marca o desmarca un día. Devuelve true si quedó hecho. */
    async toggleHabit(habitId, date) {
      requireUser();
      const i = DB.habitLogs.findIndex(l => l.habitId === habitId && l.date === date);
      if (i >= 0) { DB.habitLogs.splice(i, 1); saveDb(); return ok(false); }
      DB.habitLogs.push({ id: U.uid('hlg'), habitId, date, at: new Date().toISOString() });
      saveDb();
      return ok(true);
    },

    /* ============================================================
       POMODORO  (Módulo 5)
       ------------------------------------------------------------
       session = { id, kind:'focus'|'short'|'long', taskId|null,
                   minutes, date:'YYYY-MM-DD', startedAt, endedAt }
       Solo se guardan las sesiones terminadas.
       ============================================================ */

    async getPomodoros(filter) {
      requireUser();
      return ok(Q.pomodoros(DB, filter));
    },

    /** Registra una sesión terminada y suma el pomodoro a su tarea. */
    async addPomodoro(data) {
      requireUser();
      const now = new Date();
      const session = {
        id: U.uid('pom'),
        kind: data.kind || 'focus',
        taskId: data.taskId || null,
        minutes: Math.max(0, Math.round(data.minutes || 0)),
        date: data.date || U.ymd(now),
        startedAt: data.startedAt || now.toISOString(),
        endedAt: data.endedAt || now.toISOString(),
      };
      DB.pomodoros.push(session);

      if (session.kind === 'focus' && session.taskId) {
        const t = DB.tasks.find(x => x.id === session.taskId);
        if (t) { t.pomodoros = (t.pomodoros || 0) + 1; t.updatedAt = now.toISOString(); }
      }
      saveDb();
      return ok(JSON.parse(JSON.stringify(session)));
    },

    async deletePomodoro(id) {
      requireUser();
      DB.pomodoros = DB.pomodoros.filter(s => s.id !== id);
      saveDb();
      return ok(true);
    },

    /* ============================================================
       CUENTA ATRÁS  (Módulo 6)
       ------------------------------------------------------------
       countdown = { id, title, emoji, color, date:'YYYY-MM-DD',
                     time:'HH:MM'|null, repeat:'none'|'yearly'|'monthly',
                     note, taskId|null, createdAt }
       ============================================================ */

    async getCountdowns() {
      requireUser();
      return ok(DB.countdowns.map(c => JSON.parse(JSON.stringify(c))));
    },

    async createCountdown(data) {
      requireUser();
      const title = String((data && data.title) || '').trim();
      if (!title) return fail('La cuenta atrás necesita un nombre.');
      if (!data.date) return fail('Elige una fecha.');
      const c = {
        id: U.uid('cnt'),
        title,
        emoji:  data.emoji  || '📅',
        color:  data.color  || '#4772fa',
        date:   data.date,
        time:   data.time   || null,
        repeat: data.repeat || 'none',
        note:   data.note   || '',
        taskId: data.taskId || null,
        createdAt: new Date().toISOString(),
      };
      DB.countdowns.push(c); saveDb();
      return ok(JSON.parse(JSON.stringify(c)));
    },

    async updateCountdown(id, patch) {
      requireUser();
      const c = DB.countdowns.find(x => x.id === id);
      if (!c) return fail('Cuenta atrás no encontrada.');
      Object.assign(c, patch, { id: c.id });
      saveDb();
      return ok(JSON.parse(JSON.stringify(c)));
    },

    async deleteCountdown(id) {
      requireUser();
      DB.countdowns = DB.countdowns.filter(c => c.id !== id);
      saveDb();
      return ok(true);
    },

    /* ---------------- Exportar / importar ---------------- */

    async exportAll() {
      requireUser();
      return ok({ version: 1, mode: 'local', user: CURRENT, exportedAt: new Date().toISOString(), data: DB });
    },

    /** Copia cruda de la base local (la usa la migración a Supabase). */
    rawDb() { return DB ? Q.copy(DB) : null; },

    /** ¿Hay datos guardados en este navegador de sesiones anteriores? */
    hasLocalData() {
      const users = read(K_USERS, []);
      return users.some(u => {
        const db = read(K_DB(u.id), null);
        return db && ((db.tasks || []).length || (db.habits || []).length || (db.countdowns || []).length);
      });
    },

    localUsers() { return read(K_USERS, []).map(u => ({ id: u.id, name: u.name, email: u.email })); },
    localDbOf(userId) { return read(K_DB(userId), null); },
  };

  window.StoreLocal = Store;
})();
