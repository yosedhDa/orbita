# Imagen de producción de Orbita (Render, Railway, Fly.io, VPS con Docker…)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# Migraciones: se ejecutan al arrancar el contenedor
COPY --from=build /app/db ./db
COPY --from=build /app/scripts ./scripts
COPY --from=deps /app/node_modules/postgres ./node_modules/postgres
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.mjs && node server.js"]
