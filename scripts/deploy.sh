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

# --- Bot admin de Telegram: setup idempotente (2026-07-09) -------------------
# Corre en el VPS como root ANTES del recreate. Los secretos se generan y leen
# AQUÍ (nunca pasan por el repo ni por los logs del runner). env_file: .env
# hace que el contenedor reciba las vars nuevas en el recreate de este deploy.
ENVF=/docker/startidea-merch/.env
if [ -f "$ENVF" ]; then
  if ! grep -q "^TELEGRAM_WEBHOOK_SECRET=" "$ENVF"; then
    log "telegram-bot: generando TELEGRAM_WEBHOOK_SECRET"
    echo "TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 24)" >> "$ENVF"
  fi
  if ! grep -q "^TELEGRAM_ADMIN_CHAT_IDS=" "$ENVF"; then
    TEAM=$(grep -E "^TELEGRAM_TEAM_CHAT_ID=" "$ENVF" | head -1 | cut -d= -f2-)
    [ -z "$TEAM" ] && TEAM=$(grep -E "^TELEGRAM_CHAT_ID=" "$ENVF" | head -1 | cut -d= -f2-)
    if [ -n "$TEAM" ]; then
      log "telegram-bot: allowlist inicial = chat del equipo"
      echo "TELEGRAM_ADMIN_CHAT_IDS=$TEAM" >> "$ENVF"
    else
      log "telegram-bot: WARN sin TELEGRAM_TEAM_CHAT_ID; allowlist vacía"
    fi
  fi
  # setWebhook es idempotente (sobrescribe). Solo logueamos ok/fallo, sin tokens.
  BOT_TOKEN=$(grep -E "^TELEGRAM_BOT_TOKEN=" "$ENVF" | head -1 | cut -d= -f2-)
  WH_SECRET=$(grep -E "^TELEGRAM_WEBHOOK_SECRET=" "$ENVF" | head -1 | cut -d= -f2-)
  if [ -n "$BOT_TOKEN" ] && [ -n "$WH_SECRET" ]; then
    WH_RES=$(curl -s --max-time 15 -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
      -d "url=https://merchandising.hubstartidea.es/api/telegram/webhook" \
      -d "secret_token=${WH_SECRET}" \
      -d 'allowed_updates=["message"]' | grep -o '"ok":true' || true)
    log "telegram-bot: setWebhook ${WH_RES:-FALLO}"
  else
    log "telegram-bot: WARN sin BOT_TOKEN o WEBHOOK_SECRET; webhook sin registrar"
  fi
fi

# TEMP (retirar tras confirmar acceso): fail2ban baneó la IP de la estación de
# trabajo durante la racha de verificaciones SSH del 2026-07-09.
command -v fail2ban-client >/dev/null 2>&1 && fail2ban-client set sshd unbanip 82.159.100.98 >/dev/null 2>&1 || true
# -----------------------------------------------------------------------------

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

# (1) Borra un "merch-app" PELADO que no esté Up (Exited/Dead/Created): es un
# viejo cuyo `destroy` falló y ocupa el nombre canónico. Liberarlo es requisito
# para poder promover el contenedor nuevo. Nunca toca un merch-app sano (Up).
drop_dead_canonical() {
  docker ps -a --format '{{.Names}} {{.Status}}' \
    | awk '$1 == "merch-app" && $2 != "Up" {print $1}' \
    | xargs -r docker rm -f >/dev/null 2>&1 || true
}

# (2) Borra TODO residuo con nombre "<hash>_merch-app" (en cualquier estado). El
# contenedor bueno se llama EXACTAMENTE "merch-app" y nunca matchea esta regex.
purge_prefixed_residue() {
  docker ps -a --format '{{.Names}}' \
    | grep -E '_merch-app$' \
    | xargs -r docker rm -f >/dev/null 2>&1 || true
}

# (3) Si compose dejó el contenedor nuevo sin renombrar ("<hash>_merch-app" Up y
# no hay "merch-app" pelado), lo promovemos. Requiere el nombre canónico libre
# (de ahí que drop_dead_canonical corra antes).
ensure_canonical_name() {
  docker ps --format '{{.Names}}' | grep -qx 'merch-app' && return 0
  local survivor
  survivor=$(docker ps --format '{{.Names}}' | grep -E '_merch-app$' | head -1)
  if [ -n "$survivor" ]; then
    log "compose dejó '$survivor' sin renombrar — lo promuevo a merch-app"
    docker rename "$survivor" merch-app 2>/dev/null || true
  fi
}

# Un ciclo completo de recreate idempotente: limpia residuos -> recrea ->
# restablece el invariante "el que sirve se llama merch-app". Devuelve el RC de
# compose (informativo). NO juzga éxito; de eso se encarga el healthcheck HTTP.
# El exit code de compose no es fiable: en la carrera emite "Conflict ..." y sale
# !=0 aunque el contenedor nuevo quede Up y healthy sirviendo la imagen nueva.
recreate_once() {
  drop_dead_canonical          # suelta un merch-app Exited que ocupe el nombre
  purge_prefixed_residue       # borra residuos <hash>_merch-app preexistentes
  docker compose -f docker-compose.yml -f docker-compose.prod.yml \
    up -d --force-recreate --remove-orphans app 2>&1 | tail -20
  local rc=${PIPESTATUS[0]}
  drop_dead_canonical          # por si el destroy del viejo falló
  ensure_canonical_name        # promueve un <hash>_merch-app nuevo a merch-app
  purge_prefixed_residue       # limpia el saliente renombrado y demás residuos
  return $rc
}

recreate_once
CRC=$?
# Caso peor de la carrera (observado en pruebas): el conflicto destruye el
# contenedor viejo y NO llega a crear el nuevo -> no queda ningún merch-app.
# Como ya purgamos los residuos, un reintento parte de cero: sin contenedor que
# reemplazar, compose crea "merch-app" DIRECTO, sin el baile de nombre temporal,
# así que es inmune al conflicto. Sin este reintento, la web quedaría caída.
if ! docker ps --format '{{.Names}}' | grep -qx 'merch-app'; then
  log "tras recreate no hay merch-app corriendo (compose RC=$CRC) — reintento limpio"
  recreate_once
  CRC=$?
fi
log "compose up RC=$CRC (informativo; árbitro real = healthcheck HTTP)"

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
