# Orbita: gestión de proyectos, tareas y equipos

Orbita es una aplicación web colaborativa (SaaS) para gestionar proyectos, tareas, equipos y documentos. Toma ideas de Asana y Notion, pero tiene identidad y diseño propios. Cada espacio de trabajo es independiente, con roles y permisos que se validan en el servidor.

## Funcionalidades implementadas

| Módulo | Qué incluye |
|---|---|
| **Autenticación** | Registro, inicio y cierre de sesión, recuperación de contraseña con token de un solo uso (1 h), cambio de contraseña, sesiones seguras y límite de intentos |
| **Espacios de trabajo** | Varios espacios por usuario, selector de espacio, datos aislados entre espacios |
| **Dashboard** | KPI (proyectos activos y finalizados; tareas pendientes, en progreso, en revisión, completadas, vencidas y por vencer), alertas, avance por proyecto, gráfico por estado, completadas por semana, próximos vencimientos, carga de trabajo por integrante y actividad reciente |
| **Proyectos** | Crear, editar y eliminar. Responsable, equipo, área o categoría, prioridad, estado, fechas, objetivos, visibilidad (espacio o privado) y color. Porcentaje de avance, participantes, archivos, documentos vinculados, comentarios e hitos |
| **Tareas** | Título, descripción, responsable, colaboradores, fechas de creación, inicio y límite, prioridad, 4 estados, subtareas, checklist, comentarios con @menciones, adjuntos e historial de cambios. Vistas **Lista**, **Kanban** (arrastrar y soltar, también en móvil) y **Calendario** |
| **Equipos** | Crear equipos, añadir integrantes, asignar líderes, proyectos del equipo, tareas por integrante, carga de trabajo, % de cumplimiento y actividad |
| **Documentos** | Páginas en Markdown (títulos, listas, listas de tareas, **tablas**), carpetas, categorías (base de conocimiento), vínculo con proyectos y tareas, autoguardado, detección de ediciones simultáneas, historial de versiones con restauración, comentarios, adjuntos y enlace público |
| **Calendario** | Vistas mes, semana y día, planificación por responsable (14 días), cronograma tipo Gantt, reuniones e hitos, fin de proyectos y alertas de vencimientos próximos |
| **Colaboración** | Comentarios, menciones, notificaciones internas (campana con contador), centro de actividad, búsqueda global y sincronización casi en tiempo real (sondeo cada 10 s) |
| **Compartir y accesos** | Invitar por correo al espacio o a un proyecto concreto, permisos de lectura, edición o administración por proyecto, revocar invitaciones y miembros, enlaces públicos de solo lectura (con caducidad opcional y revocables) |
| **Administración** | Roles, registro de auditoría, uso del espacio y exportación a CSV (Excel) de tareas y proyectos |

### Roles

| Rol | Permisos |
|---|---|
| Administrador | Control total del espacio: miembros, roles, equipos, todos los proyectos y auditoría |
| Líder de equipo | Crea equipos y proyectos. Administra los proyectos de los equipos que lidera. Invita colaboradores e invitados |
| Colaborador | Crea proyectos propios. Edita los proyectos de sus equipos o los que le compartieron. Lee los proyectos visibles del espacio. Edita las tareas que tiene asignadas |
| Invitado | Solo ve y edita lo que se le compartió explícitamente. No ve equipos, proyectos ajenos ni documentos generales |

La regla de acceso a proyectos está en una única función SQL, `project_access_level(usuario, proyecto)`, en `db/migrations/001_init.sql`. La usan tanto las acciones (escritura) como las consultas de listados (lectura), así que la interfaz y el backend no pueden desincronizarse. Los documentos usan `document_access_level`.

## Arquitectura

```
Navegador ──► Next.js 15 (App Router, React 19, Tailwind)
               ├─ Server Components: consultas con control de acceso
               ├─ Server Actions: mutaciones validadas (zod) + permisos + auditoría
               └─ Route Handlers: /api/attachments, /api/sync, /api/export
                         │
                         ▼
               PostgreSQL (cualquier proveedor: Supabase, Neon, Railway, RDS…)
```

**Sobre el stack.** El requisito proponía Supabase. Se mantiene **PostgreSQL** y **Next.js**, pero la autenticación y el control de acceso se implementan en el servidor de la propia app, en lugar de Supabase Auth con RLS. Motivos:

1. **Una sola dependencia externa** (`DATABASE_URL`). La app funciona igual sobre Supabase, Neon o un Postgres propio, y se pudo **probar de extremo a extremo** en este entorno.
2. **Las credenciales de la base de datos nunca llegan al navegador.** Toda consulta pasa por el servidor, que aplica `project_access_level` y `document_access_level`. Es el mismo modelo de defensa que RLS, pero centralizado en funciones SQL reutilizadas por todas las consultas.
3. Si más adelante se quiere usar Supabase Auth, Storage o Realtime, la capa de datos (`src/lib/access.ts`, `src/lib/queries.ts`) está aislada para reemplazarla.

**Archivos adjuntos.** Se guardan en PostgreSQL (`bytea`), hasta 4 MB por archivo (límite de las funciones de Vercel), y se sirven solo tras comprobar permisos. La columna `storage_driver` permite migrar a S3, R2 o Supabase Storage en el futuro.

**Sincronización.** El cliente consulta `/api/sync` cada 10 s, solo con la pestaña visible. Si cambió la actividad del espacio, refresca los datos sin recargar ni interrumpir a quien está escribiendo. Es un mecanismo casi en tiempo real compatible con hosting *serverless*. No es WebSocket.

### Estructura

```
db/migrations/        Esquema SQL + funciones de control de acceso
scripts/migrate.mjs   Aplica migraciones pendientes
src/actions/          Server Actions (auth, workspace, projects, tasks, teams, docs, collab)
src/lib/              db, auth, crypto, access (permisos), queries, events (actividad/notificaciones), mail, markdown
src/components/       UI: AppShell, Kanban, TaskDrawer, DocEditor, charts, formularios…
src/app/              Rutas: /login, /register, /w/[slug]/… , /share/[token], /invite/[token], /api/*
tests/e2e.mjs         Prueba funcional de extremo a extremo (Playwright)
```

## Instalación local

Requisitos: Node 20 o superior y PostgreSQL 14 o superior.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Edita `.env.local` y pon tu `DATABASE_URL`. Después:

```bash
npm run db:migrate
```

```bash
npm run dev
```

Abre http://localhost:3000, crea una cuenta y luego tu espacio de trabajo.

### Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Cadena de conexión de PostgreSQL |
| `DATABASE_SSL` | En la nube | `true` para proveedores gestionados (Supabase, Neon…) |
| `DATABASE_PREPARE` | No | `false` si usas un *pooler* en modo transacción (Supabase puerto 6543, PgBouncer) |
| `DATABASE_POOL_MAX` | No | Conexiones por instancia (por defecto 5; usa 1–3 en *serverless*) |
| `APP_URL` | Sí en producción | URL pública, p. ej. `https://orbita.tu-dominio.com` (se usa en invitaciones y enlaces) |
| `APP_TIMEZONE` | Recomendable | Zona horaria IANA para "hoy", vencimientos y horas (p. ej. `America/Mexico_City`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Opcional | Envío de invitaciones, recuperación de contraseña y avisos por correo |
| `EMAIL_NOTIFICATIONS` | No | `false` para no enviar por correo las notificaciones internas |
| `MAX_UPLOAD_MB` | No | Tamaño máximo de adjunto (por defecto 4) |

**Sin SMTP**, las invitaciones muestran un enlace para copiar y enviar a mano, pero **la recuperación de contraseña no puede enviar el correo**. En producción conviene configurar SMTP: Resend, SendGrid, Mailgun, Amazon SES o Gmail/Workspace con contraseña de aplicación sirven.

## Pruebas

Con la app corriendo (`npm run build && npm start`) y la base de datos accesible:

```bash
npm run test:e2e
```

La suite comprueba los criterios de aceptación con tres usuarios reales (administrador, colaborador e invitado): registro e inicio de sesión, creación del espacio, invitación y aceptación, proyectos y tareas, edición e historial, subtareas, checklist, menciones y notificaciones, Kanban con arrastrar y soltar persistido, calendario, dashboard contra la base de datos, proyecto privado inaccesible (404) e invisible en listados y exportaciones, rechazo de escrituras sin permiso (403), adjuntos con control de acceso, invitado limitado a un proyecto, enlace público (sin datos privados) y su revocación, revocación de miembros, equipos y líderes, documentos con tablas y versiones, recuperación de contraseña (token de un solo uso que cierra las sesiones previas), sincronización entre usuarios y diseño móvil sin desbordamiento. Las capturas quedan en `tests/output/`.

## Publicación en internet

Consulta **[DEPLOY.md](./DEPLOY.md)** para el paso a paso con Vercel + Supabase o Neon, y con Docker.

## Administración

- **Primer administrador:** quien crea el espacio. Puede nombrar otros desde *Miembros*.
- **Invitar:** *Miembros → Invitar por correo* (al espacio) o *Proyecto → Compartir* (solo a ese proyecto, como invitado o colaborador, con permiso de lectura, edición o administración).
- **Revocar accesos:** *Miembros → Revocar* elimina al usuario del espacio, sus participaciones en proyectos y en equipos. Las invitaciones pendientes también se pueden revocar. Los enlaces públicos se revocan desde el proyecto o el documento.
- **Auditoría:** *Configuración → Registro de auditoría* muestra invitaciones, cambios de rol, revocaciones, enlaces públicos y eliminaciones. Los inicios de sesión (correctos y fallidos) se registran en `activity_log` con `action like 'auth.%'`.
- **Copias de seguridad:** usa las del proveedor de PostgreSQL o `pg_dump`. Todo (incluidos los adjuntos) vive en la base de datos.
- **Exportación:** *Configuración → Exportar datos* genera CSV de tareas y proyectos (solo lo que el usuario puede ver).

## Seguridad

- Contraseñas con **scrypt** y sal aleatoria. Nunca se guardan en texto plano.
- Sesiones con token aleatorio de 256 bits en una cookie `httpOnly`, `SameSite=Lax` y `Secure` en producción. Solo se guarda el **hash** del token. Las sesiones se revocan al cerrar sesión o al restablecer la contraseña, y al cambiarla se cierran las demás.
- Límite de intentos en inicio de sesión, registro y recuperación.
- Todas las mutaciones validan la entrada (zod) **y** los permisos en el servidor. Las Server Actions de Next.js verifican el origen (CSRF) y la subida de archivos comprueba `Origin`.
- Consultas parametrizadas (sin inyección SQL). El Markdown se sanea (`sanitize-html`). Los adjuntos se sirven con `Content-Disposition`, CSP `sandbox` y `nosniff`. La exportación CSV neutraliza fórmulas.
- Aislamiento entre espacios: cada consulta filtra por `workspace_id` y por nivel de acceso. Los recursos ajenos responden 404, para no revelar su existencia.
- Cabeceras de seguridad (`X-Frame-Options`, `Referrer-Policy`, etc.).

## Hoja de ruta (etapa 3, aún no implementada)

Ya existe: exportación CSV/Excel, % de cumplimiento por equipo y carga de trabajo. **Pendiente:**

- Integraciones con Google Calendar y Google Drive (requieren un proyecto OAuth en Google Cloud: *client ID* y *secret*).
- Exportación a PDF y reportes de productividad avanzados.
- Automatizaciones (reglas "cuando X, entonces Y").
- IA para resumir proyectos y generar tareas (requiere una clave de API de un proveedor de modelos).
- Objetivos y KPI con metas.
- Tiempo real por WebSocket (p. ej. Supabase Realtime o Pusher) en lugar de sondeo.
- Almacenamiento de archivos en S3, R2 o Supabase Storage para archivos de más de 4 MB.
- Edición colaborativa simultánea del mismo documento (CRDT). Hoy se detectan los conflictos y se pregunta antes de sobrescribir.
