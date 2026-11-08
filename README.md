# Tauros Barbería — Sistema de Agendamiento

Sitio web estático para agendar citas en una barbería y administrarlas desde un
panel privado. Construido **a mano con HTML5, CSS3 y JavaScript ES6+** (sin
React, sin Tailwind, sin TypeScript, sin bundler ni `npm`): el navegador habla
directamente con **Supabase** (PostgreSQL + Realtime) usando la anon key.

- **Sitio público (`/`)**: elige silla/barbero, fecha y hora, deja tus datos y
  recibe un código de confirmación (`#TB-XXXX`).
- **Panel privado (`/admin`)**: barberos y sillas, horarios por día, agenda de
  citas con filtros y cambio de estado en línea.

---

## Requisitos

- Node.js 18+ (solo para generar `js/config.js`; el sitio no usa dependencias).
- Un proyecto de [Supabase](https://supabase.com) (gratuito sirve).
- Un servidor estático cualquiera para desarrollo (Python, `npx serve`, etc.).

---

## Estructura del proyecto

```
index.html              Portada + flujo de reserva (3 pasos) + confirmación
admin/index.html        Login y panel de administración
css/styles.css          Base, portada, reserva y componentes compartidos
css/admin.css           Login, panel, tablas, filtros y modal de barbero
css/animations.css      Todas las animaciones (y sus reglas reduced-motion)
js/config.js            GENERADO por build.js (está en .gitignore)
js/config.example.js    Plantilla versionada de config.js
js/supabaseClient.js    Cliente Supabase, mensajes de error y Realtime
js/utils.js             esc(), fechas locales YYYY-MM-DD, avisos, avatares
js/slots.js             Calendario, generación de slots y disponibilidad
js/cliente.js           Flujo de reserva, tarjetas de sillas, realtime público
js/admin.js             Login real, pestañas, modal de barbero, citas
supabase/schema.sql     Esquema recreable (tablas, índice único, RLS, realtime)
build.js                Genera js/config.js a partir de variables de entorno
favicon.svg             Ícono de tijera
```

---

## Puesta en marcha local

### 1. Crear el esquema en Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Abre **SQL Editor**, pega el contenido de `supabase/schema.sql` y ejecútalo.
   El script es idempotente y crea las 4 tablas (`barberos`, `sillas`,
   `horarios`, `citas`), el índice único parcial que impide el doble
   agendamiento, las políticas RLS y la publicación Realtime.

### 2. Configurar las credenciales

Toma la **Project URL** y la **anon public key** de *Settings → API*.

```bash
export SUPABASE_URL="https://TU-PROYECTO.supabase.co"
export SUPABASE_ANON_KEY="eyJhbGciOi..."   # anon public key
export ADMIN_PASSWORD="una-contraseña-de-prueba"

node build.js     # genera js/config.js
```

`js/config.js` es un archivo **local** (va en `.gitignore`); la plantilla
versionada es `js/config.example.js`. También puedes copiarla a mano:

```bash
cp js/config.example.js js/config.js   # y editar los valores
```

### 3. Servir el sitio

```bash
python3 -m http.server 8080     # o cualquier servidor estático
# → http://localhost:8080       (sitio)
# → http://localhost:8080/admin (panel)
```

> `js/config.js` se carga como script clásico, así que hay que servir los
> archivos por HTTP (abrir `index.html` con `file://` no funciona con módulos).

---

## Variables de entorno

| Variable            | Qué es                              | Ejemplo                            |
| ------------------- | ----------------------------------- | ---------------------------------- |
| `SUPABASE_URL`      | URL del proyecto Supabase           | `https://abc.supabase.co`          |
| `SUPABASE_ANON_KEY` | Clave pública (anon)                | `eyJhbGciOiJIUzI1NiIsInR5...`      |
| `ADMIN_PASSWORD`    | Contraseña del panel `/admin`       | `secreta`                          |

Reglas de `build.js` (sin dependencias):

- Con las 3 variables completas: **siempre** regenera `js/config.js`.
- Sin variables y con `js/config.js` existente: **no** lo toca (desarrollo).
- Sin variables y sin `js/config.js`: crea uno con valores vacíos para que la
  página no falle con un 404.

Los datos de la barbería (dirección, teléfono, horario del hero, etc.) se
editan en la constante `BUSINESS` de `build.js` y se copian a `js/config.js`.

---

## Despliegue en Vercel

1. Sube el proyecto a un repositorio y connéctalo en [vercel.com](https://vercel.com).
2. En **Settings → Environment Variables** agrega:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `ADMIN_PASSWORD`
3. En **Settings → Build & Development**:
   - **Build Command:** `node build.js`
   - **Output Directory:** `.`

`build.js` corre durante el build y escribe `js/config.js` con las variables
del entorno; Vercel sirve la carpeta raíz tal cual. No hay `package.json` ni
paso de instalación.

---

## Seguridad (leer antes de publicar)

- **`ADMIN_PASSWORD` viaja en el front-end.** `build.js` la incrusta en
  `js/config.js`, que se descarga como cualquier otro archivo estático: cualquier
  persona puede verla con las herramientas del navegador. El login de `/admin`
  solo evita el paso casual, **no es autenticación real**.
- En producción se debe reemplazar por **Supabase Auth** (u otro proveedor),
  restringir las políticas RLS de `citas` y `horarios` y agregar rate limiting.
- Las políticas RLS incluidas en `schema.sql` están **abiertas** a propósito
  (el trabajo consume Supabase directamente desde el navegador sin back-end
  propio); documentado como limitación del alcance.

---

## Alcance

**Incluido:** reservas en 3 pasos con calendario real, disponibilidad en vivo
(Realtime), panel de administración (barberos, horarios, citas), estados de
carga, validaciones y animaciones.

**Fuera de alcance:** pagos, app móvil, cuentas de cliente, notificaciones y
reportes.

---

## Notas técnicas

- Fechas manejadas como strings locales `YYYY-MM-DD` (nunca `toISOString()`,
  para no correr el día por la zona horaria).
- El doble agendamiento se evita en dos capas: reconsulta antes de insertar y
  el índice único parcial `citas_slot_unico` (error `23505` → *«Este horario ya
  fue tomado, elige otro»*).
- Realtime (`postgres_changes`) sobre `citas`, `barberos`, `sillas` y
  `horarios`; si la conexión no está disponible, la app sigue funcionando y se
  actualiza al recargar.
- `referencia-figma/` es el mockup de diseño (solo lectura, React/Tailwind) y no
  forma parte de la entrega ejecutable.
