#!/usr/bin/env bash
# Mueve los backups acumulados de .env y docker-compose.yml al directorio
# /root/.backups/startidea-merch/ con permisos restrictivos (700/600).
#
# Por defecto corre en DRY-RUN: solo lista qué movería sin tocar nada.
# Para ejecutar de verdad: ./scripts/cleanup-vps-backups.sh --apply
#
# Retención: 30 días en /root/.backups/. Más antiguos se borran.
#
# Idempotente: si ya está limpio, no hace nada y devuelve 0.
#
# IMPORTANTE: ejecutar SOLO en el VPS, no en local.
set -uo pipefail

WORKDIR="/docker/startidea-merch"
BACKUP_ROOT="/root/.backups/startidea-merch"
RETENTION_DAYS=30
APPLY=0

for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --help|-h)
      echo "Uso: $0 [--apply]"
      echo "  Sin --apply: dry-run (default)"
      echo "  Con --apply: mueve archivos de verdad"
      exit 0
      ;;
    *)
      echo "Argumento desconocido: $arg"
      exit 1
      ;;
  esac
done

log() { printf "[%s] %s\n" "$(date +%H:%M:%S)" "$*"; }

if [ ! -d "$WORKDIR" ]; then
  log "ERROR: $WORKDIR no existe. ¿Estás ejecutando en el VPS correcto?"
  exit 1
fi

cd "$WORKDIR" || exit 1

# Patrones de archivos basura. Cuidado: shell globbing puede expandir
# en orden distinto al esperado — usamos un set para deduplicar matches.
PATTERNS=(
  ".env.bak"
  ".env.bak.*"
  ".env.*.bak"
  "docker-compose.yml.bak"
  "docker-compose.yml.bak.*"
  "docker-compose.*.bak"
)

# Set para evitar contar dos veces el mismo archivo si varios patrones
# lo matchean (ej. docker-compose.yml.bak matchea 2 patrones).
declare -A SEEN
add_unique() {
  local f="$1"
  if [ -z "${SEEN[$f]:-}" ]; then
    SEEN[$f]=1
    echo "$f"
  fi
}

# Crear destino con permisos seguros
if [ "$APPLY" = "1" ]; then
  mkdir -p "$BACKUP_ROOT"
  chmod 700 "$BACKUP_ROOT"
fi

TOTAL=0
SIZE_BYTES=0

# Recolectar candidatos únicos
UNIQUE_FILES=()
for pattern in "${PATTERNS[@]}"; do
  # shellcheck disable=SC2086
  for f in $pattern; do
    [ -e "$f" ] || continue
    if [ -z "${SEEN[$f]:-}" ]; then
      SEEN[$f]=1
      UNIQUE_FILES+=("$f")
    fi
  done
done

for f in "${UNIQUE_FILES[@]}"; do
  SIZE=$(stat -c%s "$f" 2>/dev/null || echo 0)
  SIZE_BYTES=$((SIZE_BYTES + SIZE))
  TOTAL=$((TOTAL + 1))
  if [ "$APPLY" = "1" ]; then
    mv -f "$f" "$BACKUP_ROOT/$f"
    chmod 600 "$BACKUP_ROOT/$f"
    log "MOVIDO: $f → $BACKUP_ROOT/$f ($SIZE bytes)"
  else
    log "[dry-run] movería: $f ($SIZE bytes)"
  fi
done

if [ "$TOTAL" = "0" ]; then
  log "Nada que limpiar — WORKDIR ya está limpio. ✅"
  exit 0
fi

SIZE_KB=$((SIZE_BYTES / 1024))
log "Total: $TOTAL archivos, $SIZE_KB KB"

# Aplicar retención sobre lo ya guardado en BACKUP_ROOT
if [ "$APPLY" = "1" ] && [ -d "$BACKUP_ROOT" ]; then
  log "Aplicando retención $RETENTION_DAYS días en $BACKUP_ROOT"
  REMOVED=$(find "$BACKUP_ROOT" -maxdepth 1 -type f -mtime +$RETENTION_DAYS -print -delete 2>/dev/null | wc -l)
  log "Borrados por retención: $REMOVED archivos antiguos"
fi

if [ "$APPLY" = "0" ]; then
  echo ""
  echo "Para aplicar, ejecuta: $0 --apply"
fi

log "Hecho."
