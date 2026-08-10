FROM node:26-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable

# node-linker=hoisted está fijado en .npmrc del proyecto (necesario para
# Next standalone con sharp). En pnpm 11 `pnpm config set node-linker`
# global no acepta esa key, así que NO se ejecuta aquí — basta con .npmrc.

# --- deps (full, para builder) ---
FROM base AS deps
COPY package.json pnpm-lock.yaml* .npmrc* ./
RUN pnpm install --frozen-lockfile || pnpm install

# --- builder ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
# Cache-bust por commit. BuildKit reutilizaba de forma INTERMITENTE la capa
# cacheada del `COPY . .` y desplegaba el bundle VIEJO aunque el checkout fuera
# nuevo (incidente 2026-07-21: marcador "deploy OK" con código viejo). Un `RUN`
# que depende de GIT_SHA falla la caché en cada commit → invalida el COPY y el
# build siguientes, forzando reconstruir el código con la fuente fresca. Las
# deps (stage `deps`, cacheadas por lockfile) NO se reinstalan → sigue rápido.
ARG GIT_SHA=dev
RUN echo "build for commit ${GIT_SHA}"
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Heap limit Node durante el build. Sin esto, en VPS con multiple containers
# (luciernaga + hub + mentor + merch + nextcrm + startidea-web) el build de
# Next.js puede consumir 3-4 GB y disparar OOM kill → corrupción Postgres
# (incidente 2026-05-16). 2 GB es suficiente y deja margen para el resto.
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN pnpm prisma generate && pnpm build

# --- prod-deps (solo producción, hoisted) ---
FROM base AS proddeps
COPY package.json pnpm-lock.yaml* .npmrc* ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Re-generar prisma client con sólo prod deps disponibles
COPY --from=builder /app/prisma ./prisma
RUN pnpm prisma generate

# --- runner ---
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# SHA del commit horneado en la imagen. deploy.sh lo lee (docker exec ...
# printenv GIT_SHA) para VERIFICAR que el contenedor vivo corre la imagen recién
# construida y no una vieja dejada por una carrera del recreate.
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA

# postgresql-client → pg_dump para el endpoint /api/cron/backup-db
RUN apk add --no-cache postgresql-client

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=proddeps --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=proddeps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000

CMD ["./docker-entrypoint.sh"]
