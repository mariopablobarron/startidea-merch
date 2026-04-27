FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable

# --- deps (full, para builder) ---
FROM base AS deps
COPY package.json pnpm-lock.yaml* .npmrc* ./
RUN pnpm config set node-linker hoisted && \
    (pnpm install --frozen-lockfile || pnpm install)

# --- builder ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm config set node-linker hoisted && \
    pnpm prisma generate && \
    pnpm build

# --- prod-deps (solo producción, hoisted) ---
FROM base AS proddeps
COPY package.json pnpm-lock.yaml* .npmrc* ./
RUN pnpm config set node-linker hoisted && \
    pnpm install --frozen-lockfile --prod --ignore-scripts

# Re-generar prisma client con sólo prod deps disponibles
COPY --from=builder /app/prisma ./prisma
RUN pnpm prisma generate

# --- runner ---
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

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
