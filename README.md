# SOPI — Sistema Operativo Personal

Aplicación web multiusuario en **HTML + CSS + JavaScript puro** (sin frameworks, sin build).
Responde una sola pregunta cada día: **¿qué tengo que hacer hoy?**

## Dos formas de usarlo

| Modo | Cuándo | Cómo se activa |
|---|---|---|
| **Local** | Probar rápido, sin cuentas ni internet | Es el modo por defecto: doble clic en `index.html` |
| **Nube (Supabase)** | Ver tus tareas desde la laptop y el celular | Rellena `js/config.js` — guía completa en **[SUPABASE.md](SUPABASE.md)** |

Los 6 módulos son idénticos en ambos modos: solo cambia dónde viven los datos.
Al iniciar sesión se entra directo a la app con los 6 módulos activos.

## Estado del plan (6 módulos)

| # | Módulo | Estado |
|---|--------|--------|
| 1 | **Tarea** (vista Hoy) | ✅ Terminado |
| 2 | **Calendario** (mes + semana) | ✅ Terminado |
| 3 | **Matriz de Eisenhower** | ✅ Terminado |
| 4 | **Rastreador de hábitos** | ✅ Terminado |
| 5 | **Cronómetro (Pomodoro)** | ✅ Terminado |
| 6 | **Cuenta atrás** | ✅ Terminado |

**Los 6 módulos están completos** y aparecen siempre en el rail lateral.

## Publicar en internet

- **Con base de datos en la nube (recomendado):** sigue **[SUPABASE.md](SUPABASE.md)** —
  de crear la cuenta de Supabase, pegar el SQL y publicar en **Vercel**, paso a paso.
- **Sin base de datos (solo este navegador):** Netlify o Vercel sirven la carpeta tal cual.

### Netlify en modo local

Es un sitio estático, así que se sube tal cual — **sin compilar nada**:

1. Entra a [app.netlify.com](https://app.netlify.com) → *Add new site* → *Deploy manually*.
2. Arrastra la carpeta **SOPI** completa (con `index.html` en la raíz).
3. Listo. Netlify da una URL tipo `https://sopi-tuNombre.netlify.app`.

Si prefieres GitHub: conecta el repositorio y deja
**Build command** vacío y **Publish directory** en `.` (el `netlify.toml`
incluido ya lo configura, junto con las cabeceras de seguridad y el 404).

**Importante sobre los datos:** SOPI guarda todo en el navegador
(`localStorage`). Publicada en internet funciona igual, pero **cada navegador
tiene sus propios datos**: si entras desde el celular no verás las tareas de la
laptop, y la cuenta que creas en un dispositivo no existe en otro. Para
compartir datos entre dispositivos hace falta un backend — `store.js` ya está
preparado para eso (ver más abajo).

## Estructura

```
SOPI/
├── index.html              Las 2 pantallas: auth · app
├── 404.html                Página de error propia (Netlify la usa sola)
├── netlify.toml            Publicación + cabeceras de seguridad
├── css/
│   ├── styles.css          Variables de diseño, auth, rail
│   ├── tasks.css           Módulo 1
│   ├── calendar.css        Módulo 2
│   ├── matrix.css          Módulo 3
│   ├── habits.css          Módulo 4
│   ├── pomodoro.css        Módulo 5
│   ├── countdown.css       Módulo 6
│   └── mobile.css          Adaptación a celular y tablet
├── vercel.json             Publicación en Vercel + cabeceras
├── SUPABASE.md             Guía paso a paso: Supabase + Vercel
├── GIT.md                  Subir el proyecto a GitHub con comandos
├── .gitignore              Qué no se sube al repositorio
├── supabase/
│   └── schema.sql          ★ EL SQL QUE SE PEGA EN SUPABASE
└── js/
    ├── config.js           ★ Tus dos claves de Supabase (lo único que editas)
    ├── utils.js            DOM, fechas, tipos de tarea y parseo natural
    ├── query.js            Filtros, agenda semanal y conteos (compartidos)
    ├── icons.js            Iconos SVG
    ├── ui.js               Diálogos propios (confirmar / pedir texto / avisar)
    ├── errors.js           Control de errores, códigos HTTP y conexión
    ├── store.local.js      Almacén en este navegador
    ├── store.remote.js     Almacén en Supabase (Postgres + Auth)
    ├── store.js            ★ Elige almacén y ofrece la migración
    ├── auth.js             Registro / inicio de sesión
    ├── app.js              Rail, router de módulos, sesión
    └── modules/
        ├── tasks.js        MÓDULO 1 · Tarea
        ├── calendar.js     MÓDULO 2 · Calendario
        ├── matrix.js       MÓDULO 3 · Matriz de Eisenhower
        ├── habits.js       MÓDULO 4 · Rastreador de hábitos
        ├── pomodoro.js     MÓDULO 5 · Cronómetro
        └── countdown.js    MÓDULO 6 · Cuenta atrás
```

## En el celular

La app es responsiva de verdad, no solo "se encoge":

- **Cajón de listas**: en pantallas pequeñas la barra lateral se guarda y se abre
  con el botón ☰ de la cabecera, con fondo oscuro; al elegir una vista se cierra sola.
- **Formulario de tareas** en dos columnas (una sola en pantallas estrechas), con
  campos de 16 px para que iOS no haga zoom al escribir.
- **Calendario**: en el mes cada tarea es un punto de su color —como el calendario
  del teléfono— y al tocar un día se abre esa semana, donde sí se lee y se escribe.
  La vista semana se desplaza en horizontal.
- **Hábitos** con círculos más grandes para el dedo; la tabla se desplaza si hace falta.
- Los paneles de detalle entran como cajones desde el borde, nunca tapan sin salida.
- Nada se desborda: probado a 390 px de ancho en los 6 módulos, con 0 px de scroll horizontal.

## La pieza clave: la capa de datos

Todos los módulos hablan **solo** con `Store`, con una API asíncrona:

```js
const tareas = await Store.getTasks({ from: U.today(), to: U.today() });
await Store.createTask({ title: 'Enviar cotización', dueDate: U.today(), priority: 3 });
```

Esa promesa se cumplió: al mover los datos a Supabase **ningún módulo cambió**.
Hay dos implementaciones intercambiables de la misma API —`store.local.js` y
`store.remote.js`— y `store.js` elige una al cargar la página según haya o no
configuración en `js/config.js`. Los filtros, la expansión de las tareas
semanales y los conteos viven en `query.js`, compartidos por ambas, para que
los dos modos se comporten exactamente igual.

En modo nube, al entrar se descarga todo el contenido del usuario de una vez
(una consulta por tabla) y las lecturas se resuelven en memoria; cada cambio se
refleja en pantalla al instante y viaja a Postgres enseguida.

### Datos guardados en modo nube

| Tabla de Postgres | Contenido |
|---|---|
| `profiles` | nombre visible (las contraseñas las gestiona Supabase Auth) |
| `lists` · `tasks` | listas y tareas, con `kind`, `repeat_days` y `done_dates` |
| `habits` · `habit_logs` | hábitos y el día en que se marcó cada uno |
| `pomodoro_sessions` | sesiones de enfoque y descanso |
| `countdowns` | fechas clave |
| `user_settings` | ajustes en un JSON |

Todas con **RLS**: Postgres filtra por usuario en cada consulta.

### Datos guardados en modo local

| Clave de localStorage | Contenido |
|---|---|
| `sopi.v1.users` | usuarios: `{id, name, email, salt, hash}` — hash PBKDF2-SHA256 150 000 iteraciones |
| `sopi.v1.session` | sesión activa (con caducidad por inactividad) |
| `sopi.v1.db.<userId>` | datos privados de ese usuario |
| `sopi.v1.tries` | intentos fallidos de login y bloqueos temporales |
| `sopi.v1.errors` | últimas 25 incidencias, para diagnóstico |

El modelo de tarea comparte campos entre módulos: `kind` (`normal` / `weekly` /
`instant`), `repeat.days` y `doneDates` (semanales), `urgent` / `important`
(Eisenhower), `pomodoros` / `estimate` (Cronómetro) y `duration` (Calendario).
`Store.getAgenda({from,to})` devuelve la agenda ya expandida: las semanales
aparecen una vez por cada día que les toca, con `occId` y el `completed` de ese
día concreto. Las vistas por fecha (Hoy, Mañana, Próximos 7 días, Calendario)
usan esa agenda; las vistas por lista usan las tareas base.
La base guarda además `habits`, `habitLogs`, `pomodoros` y `countdowns`.

## Módulo 1 · Tarea — qué incluye

- **Vistas inteligentes**: Hoy (con atrasadas arriba), Mañana, Próximos 7 días, Todas.
- **Listas** propias con color, renombrar y eliminar (sus tareas van a la papelera).
- **Tres tipos de tarea**, cada uno con su color y su símbolo, iguales en todos
  los módulos:

  | Tipo | Símbolo | Color | Comportamiento |
  |---|---|---|---|
  | **Normal** | ✓ cuadrado | azul `#4772fa` | Fecha suelta. Al completarla pasa a *Completadas*. |
  | **Semanal** | ↻ círculo | violeta `#8a6cf0` | Se repite todas las semanas en los días elegidos (tu clase, la reunión fija). Marcas el día y la tarea sigue viva para la semana siguiente. |
  | **Instantánea** | ⚡ borde punteado | ámbar `#ff9f0a` | Una sola vez: al completarla **se elimina** y no deja rastro (ni papelera ni completadas). |

- **Formulario de nueva tarea con tres pestañas** (una por tipo):
  - *Normal*: nombre, fecha, hora, lista y prioridad.
  - *Semanal*: nombre, **días de la semana** (L M X J V S D), hora, desde cuándo,
    lista y prioridad.
  - *Instantánea*: nombre, fecha (hoy por defecto), hora, lista y prioridad.

  La fecha y la lista vienen ya rellenadas según la vista en la que estés (en
  "Mañana" propone mañana; en la lista Trabajo propone Trabajo). Se guarda con el
  botón o con Enter, y el cursor vuelve al nombre para encadenar varias.
- **Atajo de lenguaje natural**: si escribes todo junto en el nombre, los campos
  de abajo se rellenan solos y el título queda limpio al guardar:

  | Escribes | Resultado |
  |---|---|
  | `hoy`, `mañana`, `pasado mañana` | fecha |
  | `viernes`, `el lunes` | próxima ocurrencia de ese día |
  | `en 3 dias`, `próxima semana` | fecha relativa |
  | `28/08`, `28-08-2026` | fecha exacta |
  | `15:30` | hora |
  | `!1 !2 !3 !4` | prioridad alta / media / baja / ninguna |
  | `#Trabajo` | lista (la crea si no existe) |

- **Panel de detalle**: título, completar, fecha y hora, atajos (Hoy / Mañana / +1 semana / quitar), prioridad, lista, subtareas y notas. Guarda solo, sin botón.
- **Buscador** en todas las tareas, **orden** por fecha / prioridad / título / recientes.
- **Completadas** y **Papelera** (borrado suave, restaurar o vaciar).
- **Atajos**: `N` nueva tarea · `Ctrl/⌘ + K` buscar · `Esc` cerrar detalle.
- Menú de usuario: exportar todo a JSON y cerrar sesión.

## Módulo 2 · Calendario — qué incluye

Las mismas tareas del módulo 1, vistas en el tiempo. No hay datos nuevos:
el calendario lee y escribe `dueDate` / `dueTime` a través de `Store`.

- **Los tres tipos, a la vista**: leyenda arriba y cada tarea con su símbolo y
  color. Una **semanal** aparece en el calendario en *todos* los días que le
  tocan, semana tras semana, sin duplicar la tarea (se expande al mostrarla).
- **Vista Mes**: rejilla de 7 columnas, hoy resaltado, hasta 3 tareas por día
  y un "+N más" que salta a la semana de ese día.
- **Vista Semana**: rejilla horaria 00–23 con fila **Todo el día** arriba,
  línea roja de la hora actual (se mueve sola) y reparto automático en
  columnas cuando dos tareas se solapan.
- **Arrastrar y soltar**:
  | Arrastras… | …y sueltas en | Resultado |
  |---|---|---|
  | tarea del panel *Sin fecha* | un día | le asigna esa fecha |
  | tarea de un día | otro día | la reprograma |
  | ocurrencia **semanal** | otro día | cambia su **día de la semana** (de lunes a martes, p. ej.) |
  | tarea (vista semana) | una hora | fecha + hora (pasos de 15 min) |
  | cualquier tarea | el panel *Sin fecha* | le quita fecha y hora |
- **Panel "Sin fecha"**: bandeja de lo pendiente sin programar, con alta rápida.
- **Alta rápida en el calendario**: clic en un día (o en una hora) abre un campo
  ahí mismo; acepta el mismo lenguaje natural del módulo 1 (`!1`, `#Lista`, hora).
- **Popover de tarea**: cambiar hora, +1 día, completar, eliminar y
  **Abrir en Tareas** (salta al módulo 1 con esa tarea seleccionada).
- **Atajos**: `←` `→` periodo anterior/siguiente · `T` hoy · `M` mes · `W` semana · `Esc` cerrar.

## Módulo 3 · Matriz de Eisenhower — qué incluye

Decide *qué merece tu tiempo*. Escribe los campos `urgent` e `important`
de la tarea (`null` = sin clasificar), así que la decisión viaja con ella
a todos los demás módulos.

```
              URGENTE              NO URGENTE
IMPORTANTE    1 · Hacer ahora      2 · Programar
NO IMPORTANTE 3 · Delegar          4 · Eliminar
```

- **Arrastrar y soltar** entre cuadrantes; soltar en la bandeja lateral
  devuelve la tarea a *sin clasificar*.
- **Bandeja "Sin clasificar"**: todo lo que aún no has decidido, con su fecha.
- **Clasificar automáticamente**: propone una primera pasada y solo toca lo no
  clasificado — *urgente* = vence hoy, mañana o está atrasada; *importante* =
  prioridad alta o media. Luego corriges arrastrando lo que no cuadre.
- **Alta rápida por cuadrante**: la tarea nace ya clasificada (acepta el mismo
  lenguaje natural: fecha, hora, `!1`, `#Lista`).
- **Barra de reparto** con el porcentaje de cada cuadrante y una lectura corta
  (si vives en "Hacer ahora", te lo dice).
- Completar y eliminar sin salir de la matriz, y **Abrir en Tareas** en cada tarjeta.
- **Atajos**: `A` clasificar automáticamente · `C` mostrar/ocultar completadas.

## Módulo 4 · Rastreador de hábitos — qué incluye

Lo único de la app que **no** son tareas: usa las colecciones `habits` y
`habitLogs`. Un registro existe = ese día está hecho.

- **Tira semanal**: una fila por hábito, siete círculos, hoy resaltado.
  Los días futuros no se pueden marcar.
- **Tres frecuencias**: `Diario`, `Días` concretos de la semana (L M X J V S D)
  y `Semanal` (N veces por semana, da igual qué días).
- **Rachas de verdad**, respetando la frecuencia:
  - en diario y días concretos cuenta días programados seguidos, y **hoy sin
    marcar todavía no rompe la racha** (aún te queda el día);
  - en semanal cuenta semanas seguidas que llegaron al objetivo.
- **Panel de detalle** con racha actual, mejor racha, cumplimiento de los
  últimos 30 días, total histórico y un **mapa de calor de 12 semanas**.
- **Resumen de hoy** con anillo de progreso, y la insignia del rail muestra
  cuántos hábitos te faltan hoy.
- **Icono automático**: al escribir "Leer 20 páginas" propone 📖, "Gimnasio" 💪,
  "Caminar" 🏃… y siempre se puede cambiar a mano.
- **Atajos**: `←` `→` semana · `T` hoy · `N` nuevo hábito · `Esc` cerrar panel.

## Módulo 5 · Cronómetro (Pomodoro) — qué incluye

Bloques de enfoque separados por descansos, con la tarea del módulo 1 delante.

- **Reloj de anillo** con Enfoque / Descanso corto / Descanso largo, puntos de
  ciclo y controles Iniciar · Pausar · Reiniciar · Saltar.
- **No se detiene al cambiar de sección ni al recargar la página**: el estado
  vive en `settings.pomodoro.running` (una marca de tiempo de fin), así que al
  volver sigue exactamente donde iba. Mientras corre verás el tiempo en el
  título de la pestaña y en la insignia del rail.
- **Tarea asociada**: al terminar un enfoque se le suma un pomodoro a esa tarea
  (`task.pomodoros`) y queda registrada la sesión en la colección `pomodoros`.
- **Encadenado automático**: al acabar el enfoque arranca solo el descanso que
  toque (largo cada N ciclos); el siguiente enfoque lo decides tú. Se puede
  desactivar con "Encadenar descansos".
- **Aviso sonoro** generado por Web Audio (sin archivos externos), desactivable.
- **Estadísticas**: sesiones y minutos de hoy, total de 7 días, barras por día
  y el registro de las sesiones de la jornada.
- **Duraciones configurables** (enfoque, descansos y ciclos por ronda).
- **Atajos**: `Espacio` inicia/pausa · `R` reinicia · `S` salta de bloque.

## Módulo 6 · Cuenta atrás — qué incluye

Los días que faltan para lo que no se puede pasar.

- **Tarjeta destacada** con la fecha más próxima y conteo en vivo:
  días · horas · minutos · segundos, actualizándose cada segundo.
- **Tarjetas** para el resto, separadas en *Próximas* y *Ya pasaron*.
- **Repetición anual o mensual**: los cumpleaños y las renovaciones se
  reprograman solas a la siguiente ocurrencia; no hay que volver a crearlas.
- **Crear desde una tarea**: el panel lateral sugiere tus tareas con fecha
  futura y las convierte en cuenta atrás de un clic (quedan enlazadas, con
  botón para abrirlas en el módulo 1).
- **Icono automático** por el nombre: "Cumpleaños" 🎂, "Zarpe" 🚢, "Entrega" 🏁,
  "Pago" 💰, "Vuelo" ✈️… siempre editable.
- Hora opcional, nota, color y atajos rápidos (+1 semana, +1 mes, +3 meses, +1 año).
- Sin hora, la fecha vence al final de ese día, para que "faltan 3 días" y el
  conteo en vivo digan siempre lo mismo.
- **Atajos**: `N` nueva fecha · `Esc` cerrar el panel.

## Seguridad del inicio de sesión

- **Contraseñas con PBKDF2-SHA256, 150 000 iteraciones** y sal única de 16
  bytes por usuario. Formato guardado: `pbkdf2$150000$<sal>$<clave>`.
  Derivar la clave cuesta a propósito ~0,2 s, lo que hace lenta la fuerza bruta.
  Las cuentas creadas con el esquema anterior se re-cifran solas al entrar.
- **Bloqueo progresivo**: tras 5 intentos fallidos la cuenta se bloquea 30 s, y
  si insisten 1 min → 5 min → 15 min. El botón se desactiva y muestra la cuenta atrás.
- **Sin filtrar correos**: el mensaje es siempre "Correo o contraseña
  incorrectos", exista o no la cuenta (y se gasta el mismo tiempo en ambos casos).
- **Comparación en tiempo constante** del hash, para no delatar coincidencias parciales.
- **Contraseña mínima real**: 8 caracteres, con letras y números, sin secuencias
  (`1234`, `qwerty`), sin las más conocidas y sin tu nombre o correo dentro.
  El registro muestra un medidor en vivo.
- **Sesión que caduca**: 8 horas de inactividad o 30 días desde el inicio.
  Mientras trabajas se renueva sola; al volver tarde pide entrar de nuevo.
- **Ver/ocultar contraseña** y ningún dato sensible en la consola ni en la URL.
- Cabeceras del servidor (en `netlify.toml`): CSP estricta sin scripts inline,
  `X-Frame-Options: DENY`, `nosniff`, HSTS y `Permissions-Policy` cerrada.

Aun así, ten presente el límite honesto de una app sin servidor: todo vive en
el navegador, así que quien tenga acceso físico a la sesión de tu equipo puede
abrir las herramientas de desarrollo y leer el `localStorage`. El hash protege
tu **contraseña** (útil si la reutilizas en otros sitios), no oculta tus tareas
de alguien sentado frente a tu computadora desbloqueada.

## Control de errores

- **404 propia** (`404.html`) para direcciones que no existen.
- **Captura global** de errores de código y promesas rechazadas: aviso corto al
  usuario, detalle en consola y las últimas 25 incidencias guardadas
  (`Err.getLog()`) por si hay que revisarlas.
- **Códigos HTTP con mensaje en español** — 400, 401, 403, 404, 405, 408, 409,
  413, 422, 429, 500, 501, 502, 503, 504, 507 — listos para el día que haya
  backend, vía `Err.fetch(url)` (que además corta a los 12 s).
- **Falta un archivo** (`js/` o `css/` incompletos): pantalla que lo explica y
  dice qué archivo falta, en vez de una app a medias.
- **Sin almacenamiento** (modo privado): pantalla explicativa antes de arrancar.
- **Sin conexión / de vuelta**: aviso discreto arriba, sin interrumpir el trabajo.
- **Módulo que falla al abrir**: se aísla, con botones para reintentar o volver
  a Tareas; el resto de la app sigue funcionando.
- Guardar cuando el almacenamiento está lleno avisa con qué hacer (exportar y limpiar).

## Diálogos

No se usan `window.confirm`, `window.prompt` ni `window.alert`: todo pasa por
`UI.confirm()`, `UI.prompt()` y `UI.alert()`, con el diseño de SOPI, foco
accesible, `Esc` para cancelar y `Enter` para aceptar. Los textos explican la
consecuencia real ("Sus tareas se mueven a la papelera, así que puedes
recuperarlas") en lugar de un "¿Está seguro?".
