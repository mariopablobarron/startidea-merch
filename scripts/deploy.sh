#!/usr/bin/env bash
# Script de deploy real, versionado en el repo.
# Lo invoca el wrapper /root/deploy-startidea-merch.sh tras hacer git pull.
#
# Cambios a este archivo se aplican en el SIGUIENTE deploy (el actual ya está
# corriendo con la versión que git acaba de pullear cuando el wrapper le llamó).
#
# v2 (2026-05-31): retries en build + healthcheck. Pasa por dos intentos.
set -uo pipefail

log() { printf "[%s] %s\n" "$(date +%H:%M:%S)" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

# El wrapper ya hizo cd + git reset, pero por si acaso ejecutamos directo:
cd /docker/startidea-merch || fail "directorio no encontrado"

SHA=$(git rev-parse --short HEAD)
log "deploying $SHA"

# Build con retry: si falla con exit 137 (OOM killer) reintentamos 1 vez tras 30s
build_attempt() {
  docker compose build app 2>&1 | tail -20
  return ${PIPESTATUS[0]}
}

log "build app (intento 1)"
if ! build_attempt; then
  RC=$?
  log "build falló (exit $RC). Esperando 30s antes de retry..."
  sleep 30
  log "build app (intento 2)"
  if ! build_attempt; then
    fail "build falló dos veces"
  fi
fi

log "recreate container"
docker compose up -d --force-recreate app || fail "docker compose up falló"

# Healthcheck con retry: hasta 6 intentos × 10s = 60s en la home.
# Next.js + Prisma a veces tarda 20-40s en estar listo en frío.
HOME_URL="https://merchandising.hubstartidea.es/"

log "healthcheck home (hasta 60s)"
SUCCESS=0
for i in 1 2 3 4 5 6; do
  sleep 10
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$HOME_URL" || echo "000")
  log "intento $i/6 → HTTP $STATUS"
  if [ "$STATUS" = "200" ]; then
    SUCCESS=1
    break
  fi
done

if [ "$SUCCESS" != "1" ]; then
  log "healthcheck home falló tras 60s — volcando logs del container:"
  docker logs --tail 50 merch-app 2>&1 | sed "s/^/[logs] /"
  fail "container no responde 200 en /"
fi

# Verifica rutas críticas adicionales (sin retry — ya sabemos que el / responde).
# Aceptamos 200 (público), 302 (redirect login), 401 (necesita auth) como OK.
log "healthcheck rutas adicionales"
EXTRA_URLS=(
  "https://merchandising.hubstartidea.es/catalogo"
  "https://merchandising.hubstartidea.es/admin/login"
  "https://merchandising.hubstartidea.es/recomendador"
)
FAILED=""
for url in "${EXTRA_URLS[@]}"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" || echo "000")
  log "  $STATUS  $url"
  case "$STATUS" in
    200|301|302|401) ;;
    *) FAILED="$FAILED $url($STATUS)" ;;
  esac
done

if [ -n "$FAILED" ]; then
  log "WARN: rutas con respuesta inesperada:$FAILED"
  log "Home responde 200, no abortamos — revisar manualmente"
fi

log "OK $SHA"
