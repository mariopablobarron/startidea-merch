#!/usr/bin/env bash
# Guard de deploy: no recrear el contenedor mientras un sync de proveedor está
# a medias.
#
# POR QUÉ EXISTE (medido el 2026-08-27, y llevaba meses pasando sin verse):
# makito arranca a las 04:02Z y trabaja hasta ~04:14Z. El autodeploy dispara
# cada 5 minutos, así que el push de la mañana caía dentro de esa ventana y el
# `up --force-recreate` MATABA el proceso a mitad. La fila de `SupplierSync`
# quedaba abierta con 0 productos y el dato del proveedor se quedaba a medias
# 24 h, hasta el cron del día siguiente. Seis deploys seguidos lo hicieron sin
# que se notara, porque ninguna comprobación de «deploy OK» mira los syncs.
#
# `withSyncFailureClosing` no puede cubrir esto y no es su culpa: cierra la fila
# cuando el sync LANZA, no cuando el proceso MUERE con el contenedor.
#
# FAIL-OPEN A PROPÓSITO: si la BD no se puede consultar, o si se agota la
# espera, este script sale 0 y el deploy continúa. Un guard de conveniencia
# nunca debe poder dejar la web sin desplegar.
set -uo pipefail

# El tope es corto a propósito. El wrapper corre bajo `deploy-lock`, que es un
# lock GLOBAL de la VPS: mientras esperamos, los deploys de los DEMÁS proyectos
# también esperan. La colisión real dura unos 2 minutos (el recreate cae sobre
# las 04:12Z y makito cierra ~04:14Z), así que 5 minutos la cubren de sobra sin
# retener el lock global más de lo justo. Pasado el tope se despliega igual.
POLL_SECONDS="${SYNC_POLL_SECONDS:-30}"
MAX_SECONDS="${SYNC_WAIT_MAX_SECONDS:-300}"

# Consulta por defecto. Inyectable con SYNC_QUERY_CMD para poder probar el bucle
# sin BD. El filtro de 30 minutos es lo que impide que una fila zombi —un sync
# que murió en un deploy anterior y que nadie cierra— bloquee los deploys para
# siempre: el watchdog detecta los colgados, pero no los cierra.
default_query() {
  docker exec merch-db psql -U merch -d merch -tAc \
    "SELECT count(*) FROM \"SupplierSync\" WHERE \"finishedAt\" IS NULL AND \"startedAt\" > now() - interval '30 minutes'" 2>/dev/null
}
QUERY_CMD="${SYNC_QUERY_CMD:-default_query}"

log() { printf "[%s] wait-supplier-sync: %s\n" "$(date +%H:%M:%S)" "$*"; }

# Devuelve el número de syncs abiertos, o -1 si la respuesta no es un entero.
# Cualquier cosa que no sea un número (psql caído, contenedor ausente, salida
# vacía) es «no sé», y «no sé» nunca frena un deploy.
open_syncs() {
  local out
  out=$($QUERY_CMD 2>/dev/null | tr -d '[:space:]')
  [[ "$out" =~ ^[0-9]+$ ]] || { echo "-1"; return; }
  echo "$out"
}

waited=0
while :; do
  n=$(open_syncs)
  if [ "$n" = "-1" ]; then
    log "no se pudo consultar la BD — sigo con el deploy (fail-open)"
    exit 0
  fi
  if [ "$n" = "0" ]; then
    [ "$waited" -gt 0 ] && log "sync terminado tras ${waited}s — sigo"
    exit 0
  fi
  if [ "$waited" -ge "$MAX_SECONDS" ]; then
    log "WARN $n sync(s) siguen abiertos tras ${waited}s — sigo igualmente (fail-open)"
    exit 0
  fi
  log "$n sync(s) de proveedor en curso — espero ${POLL_SECONDS}s (llevo ${waited}s)"
  sleep "$POLL_SECONDS"
  waited=$((waited + POLL_SECONDS))
done
