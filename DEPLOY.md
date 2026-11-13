# Publicar Orbita en internet

Orbita necesita dos cosas: **un PostgreSQL** y **un lugar donde ejecutar Next.js**. Abajo está la opción recomendada (gratuita para empezar) y una alternativa con Docker.

## Opción A: Vercel + Supabase (o Neon)

### 1. Base de datos

**Supabase:** crea un proyecto en https://supabase.com. En *Project Settings → Database → Connection string* copia la URI del **Session pooler** (puerto 5432). Si usas el *Transaction pooler* (puerto 6543), añade `DATABASE_PREPARE=false`.

**Neon:** crea un proyecto en https://neon.tech y copia la *connection string* con `?sslmode=require`.

### 2. Código en GitHub

Sube esta carpeta a un repositorio de GitHub (privado o público).

### 3. Proyecto en Vercel

1. En https://vercel.com elige *Add New → Project* e importa el repositorio. El framework se detecta solo como Next.js.
2. En *Environment Variables* añade:
   - `DATABASE_URL`: la cadena del paso 1.
   - `DATABASE_SSL=true`.
   - `DATABASE_POOL_MAX=2`.
   - `APP_URL`: la URL que te asigne Vercel (p. ej. `https://orbita-xxx.vercel.app`) o tu dominio.
   - `APP_TIMEZONE`, p. ej. `America/Mexico_City`.
   - Opcional: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
3. Pulsa *Deploy*. El script `vercel-build` **aplica las migraciones** y después compila.
4. Si `APP_URL` no coincidía con la URL final, corrígela en *Settings → Environment Variables* y vuelve a desplegar.

### Comprobar que funciona

Abre `https://TU-URL/api/health`. Debe responder `"status":"ok"` con las migraciones `001_init.sql` y `002_stage3.sql`. Si responde `"status":"error"`, el campo `hint` indica qué revisar (contraseña, host, variable faltante…), sin mostrar datos sensibles.

### 4. Dominio propio (opcional)

En *Vercel → Settings → Domains* añade tu dominio, configura el DNS que te indique y actualiza `APP_URL`.

### 5. Primer uso

Abre la URL, crea tu cuenta y tu espacio de trabajo. Serás el administrador. Invita a tu equipo desde *Miembros*.

## Opción B: Docker (Render, Railway, Fly.io o un VPS)

```bash
docker build -t orbita .
```

```bash
docker run -p 3000:3000 -e DATABASE_URL=postgres://usuario:clave@host:5432/orbita -e DATABASE_SSL=true -e APP_URL=https://orbita.tu-dominio.com -e APP_TIMEZONE=America/Mexico_City orbita
```

El contenedor aplica las migraciones al arrancar. Pon delante un proxy con HTTPS (Caddy, Nginx o el del proveedor). Las cookies de sesión son `Secure` cuando `APP_URL` empieza por `https://`.

## Opción C: servidor Node sin Docker

```bash
npm ci
```

```bash
npm run db:migrate
```

```bash
npm run build
```

```bash
npm start
```

## Qué debe proporcionar el administrador

| Necesario para | Qué hace falta |
|---|---|
| Publicar la app | Cuenta en Vercel (u otro hosting) y una base PostgreSQL |
| Correos de invitación, recuperación de contraseña y avisos | Credenciales SMTP de un proveedor de correo y un remitente verificado |
| Dominio propio | Acceso al DNS del dominio |
| Integraciones futuras (Google Calendar o Drive, IA) | Credenciales OAuth de Google Cloud o una clave de API del proveedor de IA (aún no implementado) |

## Actualizaciones

Cada `git push` a la rama principal redepliega en Vercel y aplica las migraciones nuevas de `db/migrations/` automáticamente. Las migraciones se registran en la tabla `schema_migrations` y solo se aplican una vez.
