# SOPI en la nube — de cero a publicado

Guía completa: crear la base de datos en **Supabase**, conectar SOPI y
publicarlo en **Vercel**. Sin instalar nada raro y sin compilar código.

Al terminar tendrás una dirección tipo `https://sopi.vercel.app` donde
entras con tu correo y ves las mismas tareas desde la laptop, el celular
o cualquier computadora.

**Tiempo estimado:** 20–30 minutos la primera vez.

---

## Antes de empezar

Necesitas tres cuentas gratuitas (puedes crear las tres con el mismo correo):

| Servicio | Para qué | Costo |
|---|---|---|
| [supabase.com](https://supabase.com) | Base de datos y cuentas de usuario | Gratis |
| [github.com](https://github.com) | Guardar el código | Gratis |
| [vercel.com](https://vercel.com) | Publicar la web | Gratis |

Y la carpeta **SOPI** que ya tienes en `D:\VSC cursito\SOPI`.

---

## PARTE 1 · Crear la base de datos en Supabase

### Paso 1 — Crear el proyecto

1. Entra a [supabase.com](https://supabase.com) → **Start your project** → inicia sesión con GitHub o correo.
2. Botón **New project**.
3. Rellena:
   - **Name**: `sopi`
   - **Database Password**: pulsa *Generate a password* y **guárdala en un lugar seguro**
     (no la necesitarás para SOPI, pero sí para entrar a la base por otras vías).
   - **Region**: elige la más cercana. Desde Perú, `South America (São Paulo)`.
4. **Create new project** y espera 1–2 minutos a que termine de aprovisionar.

### Paso 2 — Crear las tablas (aquí va el SQL)

1. En el menú lateral izquierdo: **SQL Editor** (icono `</>`).
2. Botón **New query**.
3. Abre el archivo `supabase/schema.sql` de tu carpeta SOPI, **copia todo** y pégalo.
4. Pulsa **Run** (o `Ctrl + Enter`).

Al final verás una tabla de resultados con 8 filas, todas con `rls_activo = true`:

```
tabla                | rls_activo
---------------------+-----------
countdowns           | true
habit_logs           | true
habits               | true
lists                | true
pomodoro_sessions    | true
profiles             | true
tasks                | true
user_settings        | true
```

Si ves eso, la base quedó lista. **Puedes volver a ejecutar el SQL las veces que
quieras**: está escrito para no romper nada si ya existe.

> Ese `rls_activo = true` es lo más importante de todo: significa que cada
> usuario solo puede leer y escribir *sus propias filas*, aunque alguien
> conozca la clave pública de tu proyecto.

### Paso 3 — Configurar las cuentas de usuario

1. Menú lateral: **Authentication** → **Sign In / Providers**.
2. Comprueba que **Email** esté activado (viene activado por defecto).
3. Menú lateral: **Authentication** → **Emails** (o *Settings*, según la versión)
   y decide sobre **Confirm email**:

   | Opción | Qué pasa | Recomendación |
   |---|---|---|
   | **Desactivado** | Te registras y entras al instante | Actívalo así **mientras pruebas** |
   | **Activado** | Supabase envía un correo con un enlace antes de dejarte entrar | Déjalo así **cuando ya lo uses en serio** |

   Si lo dejas activado y no te llega el correo, revisa spam. El plan gratuito
   tiene un límite bajo de correos por hora.

### Paso 4 — Copiar tus dos claves

1. Menú lateral: **Settings** (⚙) → **API**.
2. Copia estos dos valores:
   - **Project URL** → algo como `https://abcdefghijklmnop.supabase.co`
   - **anon public** (en *Project API keys*) → un texto largo que empieza con `eyJ...`

> ⚠️ **Nunca copies la clave `service_role`.** Esa salta todas las reglas de
> seguridad. La que va en el navegador es siempre la **anon public**.

---

## PARTE 2 · Conectar SOPI con tu base

### Paso 5 — Pegar las claves en el proyecto

Abre `js/config.js` en tu editor y rellena los dos valores.
**Sin barra `/` al final de la URL** y con la clave *anon public* (nunca la secreta):

```js
window.SOPI_CONFIG = {
  supabaseUrl: 'https://abcdefghijklmnop.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
};
```

Guarda el archivo. **Eso es todo el cambio de código que tienes que hacer.**

### Paso 6 — Probar en tu computadora

Supabase necesita que la página se sirva por `http://`, no abriendo el archivo
directamente. Como ya usas **Live Server** en VS Code:

1. Clic derecho en `index.html` → **Open with Live Server**
   (se abre en `http://127.0.0.1:5500`).
2. Pulsa `F12` para abrir la consola del navegador. Debes ver:

   ```
   [SOPI] Modo de datos: nube (Supabase)
   ```

   Si dice *local (este navegador)*, revisa que `config.js` tenga bien las dos
   claves y que la URL empiece por `https://` y termine en `.supabase.co`.
3. Crea una cuenta desde la pantalla de registro.
4. Vuelve a Supabase → **Table Editor** → tabla `lists`: verás tus 4 listas
   creadas solas. En `profiles` estará tu nombre.
5. Crea una tarea en SOPI y míralas aparecer en la tabla `tasks`.

### Paso 7 — Subir tus datos anteriores (opcional)

Si ya venías usando SOPI en modo local y quieres conservar esas tareas:

1. Con la sesión de la nube abierta, clic en tu **avatar** (abajo a la izquierda).
2. **Subir mis datos de este navegador a la nube**.
3. Confirma. Te dirá cuántas tareas, hábitos, sesiones y fechas subió.

Lo local **no se borra**: queda como respaldo por si algo sale mal.

---

## PARTE 3 · Publicar en Vercel

### Paso 8 — Subir el código a GitHub

**Opción A · con GitHub Desktop** (la más simple si no usas comandos)

1. Instala [GitHub Desktop](https://desktop.github.com).
2. *File → Add local repository* → elige `D:\VSC cursito\SOPI` → *create a repository*.
3. Escribe un resumen (`Primera versión de SOPI`) → **Commit to main**.
4. **Publish repository**. Puedes dejarlo privado.

**Opción B · con comandos** (en la carpeta SOPI):

```bash
git init
git add .
git commit -m "SOPI con Supabase"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/sopi.git
git push -u origin main
```

> Cada comando explicado, con los errores típicos (token de acceso, `remote
> already exists`, repo creado con README…), está en **[GIT.md](GIT.md)**.
> Importante: crea el repositorio en GitHub **vacío**, sin marcar *Add a README*.

### Paso 9 — Publicar

1. Entra a [vercel.com](https://vercel.com) → **Add New…** → **Project**.
2. **Import Git Repository** → elige tu repositorio `sopi`.
3. Vercel detectará que es un sitio estático. Deja todo como está:
   - **Framework Preset**: `Other`
   - **Build Command**: *vacío*
   - **Output Directory**: *vacío* (o `.`)
   - **Install Command**: *vacío*
4. **Deploy** y espera unos 30 segundos.
5. Copia la dirección que te da, por ejemplo `https://sopi-miles.vercel.app`.

> El archivo `vercel.json` que va en la carpeta ya configura las cabeceras de
> seguridad y permite hablar con Supabase. No tienes que tocar nada más.

### Paso 10 — Decirle a Supabase cuál es tu dirección

Esto hace que los enlaces de confirmación y de recuperar contraseña lleven a tu sitio.

1. Supabase → **Authentication** → **URL Configuration**.
2. **Site URL**: `https://sopi-miles.vercel.app` (tu dirección de Vercel).
3. **Redirect URLs**: agrega estas dos, una por línea:
   ```
   https://sopi-miles.vercel.app/**
   http://127.0.0.1:5500/**
   ```
   (la segunda es para poder seguir probando en tu computadora)
4. **Save**.

### Paso 11 — Comprobar

1. Abre tu dirección de Vercel en el celular.
2. Inicia sesión con el mismo correo.
3. Deberías ver **las mismas tareas** que en la laptop. Crea una desde el celular
   y recarga en la laptop: aparece.

Cada vez que cambies algo del código y hagas *commit* + *push*, Vercel vuelve a
publicar solo, en unos segundos.

---

## Si algo no funciona

| Lo que ves | Qué pasa | Cómo se arregla |
|---|---|---|
| La consola dice *Modo de datos: local* | `config.js` vacío o mal | Revisa que la URL termine en `.supabase.co` y que la clave sea la **anon** |
| *Faltan tablas en Supabase* | El SQL no se ejecutó | Repite el Paso 2 y confirma que salieron las 8 filas |
| **Invalid path specified in request URL** | La URL de `config.js` tiene una barra `/` de más o una ruta al final | Debe ser exactamente `https://xxxx.supabase.co`. SOPI ahora la limpia sola, pero revisa que sea el *Project URL* de Settings → API |
| *La clave anon no es válida* | Pegaste otra cosa (o falta parte) | La clave empieza con `eyJ` (formato clásico) o con `sb_publishable_` (formato nuevo) |
| *Estás usando la clave SECRETA* | Pegaste `service_role` / `sb_secret_` | Cámbiala por la **anon public** y, si ya la subiste a GitHub, recréala en Supabase |
| *El servidor rechazó la operación (permisos)* | Faltan las reglas RLS | Vuelve a ejecutar `schema.sql` completo (incluye las políticas) |
| *Falta confirmar tu correo* | Tienes activada la confirmación | Abre el enlace del correo, o desactiva *Confirm email* mientras pruebas |
| *Correo o contraseña incorrectos* al registrarte | Ese correo ya existe | Usa **Iniciar sesión**, o *¿Olvidaste tu contraseña?* |
| Las tareas no se ven en otro dispositivo | Entraste con otra cuenta | Revisa el correo del menú de usuario: los datos van por cuenta |
| *No se pudo conectar con el servidor* | Sin internet o proyecto pausado | Supabase pausa los proyectos gratis sin uso por ~1 semana: entra al panel y pulsa **Restore** |
| Todo funciona pero lento la primera vez | El proyecto estaba dormido | Normal en el plan gratis; luego va rápido |

**Ver qué pasó por dentro:** en Supabase → **Logs** → *API* o *Postgres* se ve
cada consulta con su error exacto.

---

## Preguntas que te van a surgir

**¿Es seguro que la clave `anon` esté en el código publicado?**
Sí, está diseñada para eso. Por sí sola no da acceso a nada: quien decide qué
puede leer o escribir cada quien son las reglas RLS que creó el `schema.sql`.
Lo que jamás debe salir de Supabase es la clave `service_role`.

**¿Puedo volver al modo local?**
Sí. Vacía los dos valores de `js/config.js` y SOPI vuelve a guardar en el
navegador. El código de ambos modos convive sin estorbarse.

**¿Cuánto aguanta el plan gratuito?**
500 MB de base de datos y 50 000 usuarios activos al mes. Para uso personal
(o de un equipo pequeño) no lo vas a rozar: 10 000 tareas ocupan unos pocos MB.

**¿Y si quiero que otra persona use SOPI?**
Solo pásale la dirección de Vercel. Cada quien crea su cuenta y ve únicamente
sus propios datos: la separación la garantiza Postgres, no el navegador.

**¿Se puede seguir usando sin internet?**
En modo nube hace falta conexión para leer y guardar. Si se cae mientras
trabajas, SOPI avisa y no pierde lo que ya estaba en pantalla, pero los cambios
nuevos no llegan al servidor hasta que vuelva la conexión.

---

## Qué cambió en el proyecto

Los 6 módulos **no cambiaron ni una línea**. Todo pasa por la capa de datos:

```
js/config.js         ← tus dos claves de Supabase (lo único que editas)
js/query.js          ← filtros, agenda semanal y conteos (compartidos)
js/store.local.js    ← almacén en el navegador (modo sin conexión)
js/store.remote.js   ← almacén en Supabase (Postgres + Auth)
js/store.js          ← elige uno de los dos y ofrece la migración
supabase/schema.sql  ← el SQL que pegas en Supabase
vercel.json          ← cabeceras de seguridad al publicar
```

En modo nube, al entrar se descarga todo tu contenido de una vez y las lecturas
salen de memoria (por eso la app se siente igual de rápida); cada cambio se
guarda en pantalla al instante y se envía a Postgres enseguida.
