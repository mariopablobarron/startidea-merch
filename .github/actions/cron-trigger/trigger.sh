#!/usr/bin/env bash
# Dispara un cron de merch por HTTP y decide si un fallo merece reintento.
#
# El reintento SOLO se hace cuando está probado que la petición nunca llegó al
# servidor. El discriminante (verificado con curl 8.x) es:
#
#   caso                          rc   http_code   time_connect
#   ------------------------------------------------------------
#   DNS no resuelve                6      000        0.000000
#   conexión rechazada             7      000        0.000000
#   timeout ANTES de conectar     28      000        0.000000
#   timeout DESPUÉS de conectar   28      000        > 0
#   el servidor respondió          0      2xx/5xx    > 0
#
# Reintentar el último caso duplicaría el trabajo del cron (un sync de proveedor
# puede estar corriendo en background mientras curl se cansa de esperar), y
# reintentar un 5xx tampoco: el servidor recibió la petición. Por eso la
# condición es estricta: http_code 000 Y sin conexión establecida.
set -uo pipefail

NAME="${INPUT_NAME:?falta name}"
URL="${INPUT_URL:?falta url}"
METHOD="${INPUT_METHOD:-POST}"
ACCEPT="${INPUT_ACCEPT:-200 202}"
SECRET="${INPUT_SECRET:-}"
RETRIES="${INPUT_RETRIES:-2}"
CONNECT_TIMEOUT="${INPUT_CONNECT_TIMEOUT:-20}"
MAX_TIME="${INPUT_MAX_TIME:-120}"
BACKOFF="${INPUT_BACKOFF:-15}"

if [ -z "$SECRET" ]; then
  echo "::error::$NAME: falta el secret MERCH_CRON_SECRET"
  exit 1
fi

attempt=0
while :; do
  attempt=$((attempt + 1))

  response=$(curl -sS -X "$METHOD" "$URL" \
    -H "x-cron-secret: $SECRET" \
    --connect-timeout "$CONNECT_TIMEOUT" \
    --max-time "$MAX_TIME" \
    -w $'\n%{http_code} %{time_connect}') || true

  meta=$(printf '%s' "$response" | tail -n1)
  body=$(printf '%s' "$response" | sed '$d')
  code="${meta%% *}"
  connect="${meta##* }"

  echo "HTTP $code (intento $attempt)"
  [ -n "$body" ] && echo "$body"

  for ok in $ACCEPT; do
    if [ "$code" = "$ok" ]; then
      exit 0
    fi
  done

  # ¿La petición llegó a salir? Si sí, no se reintenta bajo ningún concepto.
  # time_connect solo es "todo ceros" (0.000000) cuando no hubo conexión TCP.
  never_connected=0
  if [ "$code" = "000" ] && [ -n "$connect" ] && [ "${connect//[.0]/}" = "" ]; then
    never_connected=1
  fi

  if [ "$never_connected" = "0" ]; then
    echo "::error::$NAME devolvió $code (esperado: $ACCEPT) — el servidor recibió la petición, no se reintenta"
    exit 1
  fi

  if [ "$attempt" -gt "$RETRIES" ]; then
    echo "::error::$NAME: sin conexión con el servidor tras $attempt intentos"
    exit 1
  fi

  wait_s=$((BACKOFF * attempt))
  echo "::warning::$NAME: no se pudo conectar (la petición no llegó a salir). Reintento en ${wait_s}s"
  sleep "$wait_s"
done
