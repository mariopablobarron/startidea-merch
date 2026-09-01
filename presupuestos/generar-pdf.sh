#!/usr/bin/env bash
# Genera el PDF de un presupuesto a partir de su HTML.
#   ./generar-pdf.sh presupuesto-acme.html [Presupuesto_Acme_Startidea.pdf]
set -euo pipefail

HTML="${1:?uso: ./generar-pdf.sh <archivo.html> [salida.pdf]}"
[ -f "$HTML" ] || { echo "No existe: $HTML" >&2; exit 1; }
OUT="${2:-$(basename "${HTML%.html}").pdf}"

# Chromium: el del PATH o el que trae Playwright en el contenedor.
CHROME="$(command -v chromium || command -v chromium-browser || command -v google-chrome || true)"
if [ -z "$CHROME" ]; then
  for c in /opt/pw-browsers/chromium*/chrome-linux/chrome \
           /opt/pw-browsers/chromium*/chrome-linux/headless_shell; do
    [ -x "$c" ] && { CHROME="$c"; break; }
  done
fi
[ -n "$CHROME" ] || { echo "No encuentro Chromium." >&2; exit 1; }

ABS="$(cd "$(dirname "$HTML")" && pwd)/$(basename "$HTML")"

"$CHROME" --headless --no-sandbox --disable-gpu \
  --print-to-pdf="$OUT" --no-pdf-header-footer \
  "file://$ABS" 2>/dev/null

echo "PDF generado: $OUT"

# Aviso si queda algún marcador sin sustituir.
if grep -q '{{' "$HTML"; then
  echo "AVISO: quedan marcadores {{...}} sin sustituir en $HTML:" >&2
  grep -o '{{[A-Z0-9_]*}}' "$HTML" | sort -u | tr '\n' ' ' >&2; echo >&2
fi
