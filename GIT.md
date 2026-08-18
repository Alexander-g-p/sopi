# Subir SOPI a GitHub con comandos — paso a paso

Guía detallada de la **Opción B**. Cada comando explicado, con los errores
típicos y cómo salir de ellos. Pensado para Windows con VS Code.

---

## PASO 0 · Comprobar que Git está instalado

Abre VS Code, y arriba: **Terminal → Nuevo terminal**. Escribe:

```bash
git --version
```

- Si responde algo como `git version 2.46.0.windows.1` → sigue al Paso 1.
- Si dice `'git' no se reconoce como un comando` → instálalo:
  1. Descarga [git-scm.com/download/win](https://git-scm.com/download/win)
  2. Instálalo dando **Next** a todo (las opciones por defecto están bien)
  3. **Cierra y vuelve a abrir VS Code** (si no, el terminal sigue sin verlo)
  4. Repite `git --version`

---

## PASO 1 · Presentarte ante Git (solo la primera vez en tu vida)

Git firma cada cambio con un nombre y un correo:

```bash
git config --global user.name "Miles"
git config --global user.email "innovacion.desarrollo01@iflutech.com"
```

Para comprobar que quedó:

```bash
git config --global --list
```

---

## PASO 2 · Situarte en la carpeta SOPI

El terminal tiene que estar **dentro** de la carpeta del proyecto. Escribe:

```bash
cd "D:\VSC cursito\SOPI"
```

> Las comillas son necesarias porque la ruta tiene un espacio (`VSC cursito`).

Comprueba que estás donde toca:

```bash
dir
```

Debes ver `index.html`, `css`, `js`, `supabase`, `vercel.json`… Si no los ves,
no estás en la carpeta correcta.

> **Atajo:** en VS Code, si abriste la carpeta SOPI con *Archivo → Abrir carpeta*,
> el terminal ya arranca ahí y te puedes saltar este paso.

---

## PASO 3 · Crear el repositorio vacío en GitHub

Esto se hace en la web, **antes** de subir nada:

1. Entra a [github.com](https://github.com) e inicia sesión.
2. Botón verde **New** (o [github.com/new](https://github.com/new)).
3. Rellena:
   - **Repository name**: `sopi`
   - **Description**: `Sistema Operativo Personal` (opcional)
   - **Public** o **Private**: como prefieras. Vercel funciona con ambos.
   - ⚠️ **NO marques** *Add a README file*, ni *.gitignore*, ni *license*.
     Debe quedar **completamente vacío**, o el primer `push` chocará.
4. **Create repository**.
5. Copia la dirección que aparece, del tipo:
   `https://github.com/TU-USUARIO/sopi.git`

---

## PASO 4 · Los seis comandos, uno por uno

Ejecútalos **en orden**, dentro de la carpeta SOPI.

### 4.1 · Preparar la carpeta

```bash
git init
```

Crea una carpeta oculta `.git` donde Git guardará el historial.
Respuesta esperada: `Initialized empty Git repository in D:/VSC cursito/SOPI/.git/`

---

### 4.2 · Seleccionar qué se sube

```bash
git add .
```

El punto significa "todo lo que hay en esta carpeta". Git respeta el
`.gitignore` incluido, así que se saltará `.vscode/`, `Thumbs.db` y demás.

Para ver qué va a subir antes de continuar:

```bash
git status
```

Deberías ver en verde `index.html`, `css/`, `js/`, `supabase/schema.sql`, etc.

---

### 4.3 · Guardar la primera versión

```bash
git commit -m "SOPI con Supabase"
```

El texto entre comillas es el resumen del cambio; se ve luego en el historial.
Respuesta esperada: algo como `28 files changed, 5000 insertions(+)`.

> Si sale `Author identity unknown`, te saltaste el Paso 1: hazlo y repite el commit.

---

### 4.4 · Nombrar la rama principal

```bash
git branch -M main
```

Renombra la rama a `main`, que es el nombre que GitHub espera hoy en día
(antes era `master`). No devuelve ningún mensaje: eso significa que salió bien.

---

### 4.5 · Enlazar con tu repositorio de GitHub

```bash
git remote add origin https://github.com/TU-USUARIO/sopi.git
```

**Cambia `TU-USUARIO` por tu usuario real de GitHub.** `origin` es solo un
apodo para esa dirección.

Comprueba que quedó bien enlazado:

```bash
git remote -v
```

Debe listar tu dirección dos veces (`fetch` y `push`).

---

### 4.6 · Subir

```bash
git push -u origin main
```

La primera vez te pedirá identificarte:

- **Se abre una ventana del navegador** → *Sign in with your browser* → autoriza.
  Es lo normal con Git para Windows (usa el Credential Manager) y solo pasa una vez.
- **Si te pide usuario y contraseña en el terminal**: la contraseña de GitHub
  **ya no sirve**. Necesitas un token:
  1. GitHub → foto de perfil → **Settings**
  2. Abajo del todo: **Developer settings**
  3. **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)**
  4. *Note*: `sopi`, *Expiration*: 90 días, y marca la casilla **repo**
  5. **Generate token** y **copia el texto** (empieza con `ghp_`; solo se muestra una vez)
  6. En el terminal, pega ese token donde pide *Password*

Cuando termine verás algo como:

```
Writing objects: 100% (32/32), done.
branch 'main' set up to track 'origin/main'.
```

Recarga tu repositorio en GitHub: ahí están todos tus archivos. ✅

---

## PASO 5 · Cada vez que cambies algo (el ciclo de siempre)

Después de la primera vez, subir cambios son tres comandos:

```bash
git add .
git commit -m "Describe aquí lo que cambiaste"
git push
```

Ejemplo real: cambiaste las claves de Supabase en `js/config.js`

```bash
git add .
git commit -m "Conectar con mi proyecto de Supabase"
git push
```

Y si ya conectaste Vercel, en ~30 segundos tu web queda actualizada sola.

---

## Errores frecuentes y cómo salir

| Mensaje | Qué significa | Solución |
|---|---|---|
| `'git' no se reconoce...` | Git no instalado, o VS Code abierto desde antes | Instálalo y **reinicia VS Code** |
| `Author identity unknown` | Falta el Paso 1 | Ejecuta los dos `git config --global` |
| `remote origin already exists` | Ya enlazaste antes | `git remote set-url origin https://github.com/TU-USUARIO/sopi.git` |
| `Updates were rejected... fetch first` | Creaste el repo **con** README | `git pull origin main --allow-unrelated-histories` y luego `git push` |
| `Support for password authentication was removed` | Metiste tu contraseña normal | Usa un token (ver Paso 4.6) |
| `fatal: not a git repository` | El terminal no está en la carpeta SOPI | `cd "D:\VSC cursito\SOPI"` |
| `nothing to commit, working tree clean` | No hay cambios nuevos | Todo ya estaba subido; no es un error |
| `error: failed to push some refs` | Hay cambios en GitHub que no tienes | `git pull --rebase` y luego `git push` |
| Pide usuario/contraseña **cada vez** | No se guardaron las credenciales | `git config --global credential.helper manager` |

---

## Comandos útiles para el día a día

```bash
git status          # ¿Qué cambió desde el último guardado?
git log --oneline   # Historial de versiones, una por línea
git diff            # Ver exactamente qué líneas cambiaron
git remote -v       # ¿A qué repositorio estoy conectado?
```

**Deshacer sin drama:**

```bash
git checkout -- js/config.js   # Descarta los cambios de UN archivo
git reset --soft HEAD~1        # Deshace el último commit, conservando los cambios
```

---

## Un aviso sobre el repositorio público

Si eliges **Public**, cualquiera puede ver tu código, incluida la clave `anon`
de Supabase en `js/config.js`. **Eso es correcto y seguro**: esa clave está
diseñada para vivir en el navegador y no da acceso a nada por sí sola — quien
protege los datos son las reglas RLS que creaste con `schema.sql`.

Lo que **jamás** debe entrar al repositorio es la clave `service_role` de
Supabase, ni la contraseña de la base de datos. Si alguna vez las pegas por
error, bórralas del código, haz commit, y **rótalas** desde el panel de
Supabase (Settings → API → *Reset*): una clave que estuvo publicada un minuto
ya se considera comprometida.
