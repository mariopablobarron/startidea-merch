#!/usr/bin/env bash
# Compara CRON_CATALOG (src/lib/cron-catalog.ts) con el crontab REAL del VPS.
#
# Por qué existe: el catálogo dice de sí mismo que "si no coincide carácter a
# carácter con lo que dispara de verdad, este fichero miente" — pero nada lo
# contrastaba con la fuente. No puede ser un test de CI: el runner de GitHub no
# tiene acceso al VPS. Es una comprobación de operación, para correr a mano (o
# desde el agente autónomo) contra la máquina real.
#
#   ./scripts/audit-crons-vps.sh              # usa root@72.61.195.108
#   VPS=root@otra-ip ./scripts/audit-crons-vps.sh
#
# Sale 0 si todo cuadra, 1 si hay desajuste. SOLO LEE: nunca escribe en el VPS.
#
# ⚠️ Aquí el catálogo no es documentación: es PARTE DEL CAMINO. El runner del
# VPS no llama a /api/cron/<x>; llama a /api/admin/crons/trigger/<etiqueta>, y
# esa ruta resuelve endpoint y método con `findCron()` — devuelve 404 si la
# etiqueta no está. Por eso una etiqueta del crontab sin entrada no es un
# apunte desactualizado: es un cron que no corre. Y por eso el tercer argumento
# de la línea del crontab ("POST /api/cron/x") es decorativo: solo sale en el
# aviso de Telegram. Lo que se dispara de verdad es `endpointPath` del catálogo.
#
# ⚠️ El crontab del VPS es MIXTO y por eso el barrido hace las dos cosas:
#   - la mayoría de crons de merch van envueltos en `cron-global-guard <base64>`
#     (un `grep` normal NO los ve — hay que decodificar);
#   - pero al menos uno (`override-price-drift`) va EN CLARO y suelto bajo el
#     bloque de comentarios de OTRO proyecto, sin cabecera propia.
# Un barrido que solo mire una de las dos formas da un "no está en el crontab"
# que parece un hallazgo y es un fallo del barrido: eso ya pasó el 2026-08-11.
set -uo pipefail

VPS="${VPS:-root@72.61.195.108}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CATALOGO="$REPO_ROOT/src/lib/cron-catalog.ts"

[ -f "$CATALOGO" ] || { echo "ERROR: no encuentro $CATALOGO"; exit 1; }

# --- 0. ¿El catálogo que voy a leer es el que está DESPLEGADO? --------------
# Este barrido compara el VPS contra un fichero del repo, así que un repo que
# no está en `origin/main` produce desajustes que NO son del VPS: son míos.
# Pasó el 2026-08-27 — corrido desde el working tree principal (parado en una
# rama 83 commits atrás) dio 5 falsos "el catálogo miente", y los minutos que
# señalaba eran los del catálogo VIEJO. Aviso, pero no aborto: auditar una rama
# que cambia el catálogo a propósito es legítimo.
git -C "$REPO_ROOT" fetch -q origin main 2>/dev/null || true
if git -C "$REPO_ROOT" rev-parse --verify -q origin/main >/dev/null; then
  if ! git -C "$REPO_ROOT" diff --quiet origin/main -- src/lib/cron-catalog.ts 2>/dev/null; then
    echo "⚠️  AVISO: tu src/lib/cron-catalog.ts NO coincide con origin/main."
    echo "    Los desajustes de abajo pueden ser de ESTE REPO, no del VPS."
    echo "    Para auditar lo desplegado, corre esto en un worktree de origin/main."
    echo
  fi
else
  echo "⚠️  AVISO: no hay ref origin/main; no puedo comprobar contra qué comparo."
  echo
fi

# --- 1. Crontab real: líneas en claro Y líneas envueltas en base64 ----------
real="$(ssh -o ConnectTimeout=20 "$VPS" '
  crontab -l 2>/dev/null | grep -v "^\s*#" | grep -v "^\s*$" | while IFS= read -r l; do
    cmd="$l"
    b64=$(printf "%s" "$l" | grep -oE "[A-Za-z0-9+/=]{40,}" | head -1)
    if [ -n "$b64" ]; then
      dec=$(printf "%s" "$b64" | base64 -d 2>/dev/null)
      [ -n "$dec" ] && cmd="$dec"
    fi
    case "$cmd" in
      *merch-cron-runner.sh*)
        printf "%s\t%s\n" \
          "$(printf "%s" "$cmd" | grep -oE "merch-cron-runner\.sh [a-z0-9-]+" | awk "{print \$2}")" \
          "$(printf "%s" "$l" | awk "{print \$1,\$2,\$3,\$4,\$5}")"
        ;;
    esac
  done
')"

if [ -z "$real" ]; then
  echo "ERROR: no he podido leer el crontab del VPS (¿SSH caído?). No concluyo nada."
  exit 1
fi

# --- 2. Catálogo del repo ---------------------------------------------------
cat_entries="$(node -e '
  const fs = require("fs");
  const src = fs.readFileSync(process.argv[1], "utf8");
  const re = /name:\s*"([^"]+)"[\s\S]*?scheduleCron:\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(src))) console.log(m[1] + "\t" + m[2]);
' "$CATALOGO")"

# --- 3. Comparar ------------------------------------------------------------
fallos=0
echo "== crons del crontab del VPS contrastados con CRON_CATALOG =="
while IFS=$'\t' read -r nombre expr; do
  [ -z "$nombre" ] && continue
  esperado="$(printf "%s\n" "$cat_entries" | awk -F'\t' -v n="$nombre" '$1==n {print $2}')"
  if [ -z "$esperado" ]; then
    echo "  ✗ $nombre: dispara en el VPS ($expr) y NO está en CRON_CATALOG"
    echo "     └─ esto NO es un desajuste de papeles: merch-cron-runner.sh pega a"
    echo "        /api/admin/crons/trigger/$nombre, que responde 404 a lo que no"
    echo "        esté en el catálogo ⇒ ese cron NO CORRE NINGÚN DÍA."
    fallos=$((fallos + 1))
  elif [ "$esperado" != "$expr" ]; then
    echo "  ✗ $nombre: VPS «$expr» vs catálogo «$esperado»"
    fallos=$((fallos + 1))
  else
    echo "  ✓ $nombre  $expr"
  fi
done <<< "$real"

# El catálogo también registra crons que NO salen del crontab (GitHub Actions,
# scripts de root, o sin disparador). No son desajustes: se listan aparte para
# que se vea que su ausencia aquí está mirada, no pasada por alto.
echo "== entradas del catálogo sin línea en el crontab (esperable: GH Actions / root / manuales) =="
while IFS=$'\t' read -r nombre expr; do
  [ -z "$nombre" ] && continue
  printf "%s\n" "$real" | awk -F'\t' -v n="$nombre" '$1==n {found=1} END {exit !found}' || \
    echo "  · $nombre ($expr)"
done <<< "$cat_entries"

if [ "$fallos" -gt 0 ]; then
  echo "RESULTADO: $fallos desajuste(s). El catálogo miente sobre lo que dispara de verdad."
  exit 1
fi
echo "RESULTADO: catálogo y crontab coinciden."
