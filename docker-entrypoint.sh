#!/bin/sh
set -e

echo "[entrypoint] Ejecutando prisma db push para sincronizar schema…"
node node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss

echo "[entrypoint] Schema OK. Arrancando Next.js standalone…"
exec node server.js
