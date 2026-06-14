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
  docker compose -f docker-compose.yml -f docker-compose.prod.yml build app 2>&1 | tail -20
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
# --- Idempotencia del recreate (fix carrera <hash>_merch-app) ---
# Mecánica real de `compose up --force-recreate` con container_name FIJO
# (verificado con `docker events` 2026-06-14 en compose v5):
#   1. CREATE  contenedor nuevo con nombre temporal "<id-del-saliente>_merch-app"
#   2. KILL/STOP/DESTROY del contenedor viejo "merch-app"
#   3. RENAME  "<id>_merch-app" -> "merch-app"   4. START
# Si el paso 3 se interrumpe (timeout/OOM, o un conflicto previo), el contenedor
# nuevo queda Up y healthy PERO llamándose "<hash>_merch-app". Ese residuo:
#   - el siguiente recreate vuelve a chocar: "Conflict. The container name
#     <hash>_merch-app is already in use";
#   - el viejo cleanup (filtraba != "Up") NO lo borraba porque está "Up".
# Invariante que explotamos: el contenedor BUENO siempre se llama EXACTAMENTE
# "merch-app"; cualquier nombre que acabe en "_merch-app" es residuo del baile.

# Borra TODO residuo "<hash>_merch-app" (en CUALQUIER estado, Up incluido) +
# un "merch-app" pelado que no esté Up. Nunca toca el "merch-app" sano.
purge_merch_residue() {
  docker ps -a --format '{{.Names}}' \
    | grep -E '_merch-app$' \
    | xargs -r docker rm -f >/dev/null 2>&1 || true
  docker ps -a --format '{{.Names}} {{.Status}}' \
    | awk '$1 == "merch-app" && $2 != "Up" {print $1}' \
    | xargs -r docker rm -f >/dev/null 2>&1 || true
}

# Red de seguridad: si compose dejó el contenedor nuevo sin renombrar (queda
# "<hash>_merch-app" corriendo y no hay "merch-app" pelado), lo promovemos para
# restablecer el invariante "el que sirve se llama merch-app".
ensure_canonical_name() {
  docker ps --format '{{.Names}}' | grep -qx 'merch-app' && return 0
  local survivor
  survivor=$(docker ps --format '{{.Names}}' | grep -E '_merch-app$' | head -1)
  if [ -n "$survivor" ]; then
    log "compose dejó '$survivor' sin renombrar — lo promuevo a merch-app"
    docker rename "$survivor" merch-app 2>/dev/null || true
  fi
}

purge_merch_residue
# El exit code de compose NO es árbitro de éxito: emite "Conflict ..." y sale
# !=0 aunque el contenedor nuevo haya quedado Up y healthy sirviendo la imagen
# nueva. El ÚNICO juez es el healthcheck HTTP de abajo; aquí solo registramos.
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  up -d --force-recreate --remove-orphans app 2>&1 | tail -20
CRC=${PIPESTATUS[0]}
log "compose up RC=$CRC (informativo; árbitro real = healthcheck HTTP)"
ensure_canonical_name
purge_merch_residue   # limpia el saliente renombrado; "merch-app" queda intacto

# Healthcheck: ÚNICO criterio de éxito/fallo del deploy (NO el RC de compose).
# Hasta 6 intentos × 10s = 60s; Next.js + Prisma tardan 20-40s en estar listos
# en frío. El deploy solo se da por bueno si el contenedor nuevo sirve 200 en
# la home Y en /catalogo (la ruta crítica del negocio).
BASE="https://merchandising.hubstartidea.es"

log "healthcheck home + /catalogo (hasta 60s)"
SUCCESS=0
for i in 1 2 3 4 5 6; do
  sleep 10
  HOME_S=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE/" || echo "000")
  CAT_S=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE/catalogo" || echo "000")
  log "intento $i/6 → home $HOME_S · /catalogo $CAT_S"
  if [ "$HOME_S" = "200" ] && [ "$CAT_S" = "200" ]; then
    SUCCESS=1
    break
  fi
done

if [ "$SUCCESS" != "1" ]; then
  log "healthcheck falló tras 60s (home/catalogo no responden 200) — logs:"
  docker logs --tail 50 merch-app 2>&1 | sed "s/^/[logs] /"
  fail "container nuevo no responde 200 en / y /catalogo"
fi
log "deploy verificado: home 200 + /catalogo 200 (compose RC fue $CRC, irrelevante)"

# Verifica rutas críticas adicionales (sin retry — ya sabemos que el / responde).
# Aceptamos 200 (público), 302 (redirect login), 401 (necesita auth) como OK.
log "healthcheck rutas adicionales"
EXTRA_URLS=(
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
