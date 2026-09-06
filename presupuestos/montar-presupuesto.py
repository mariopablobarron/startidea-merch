#!/usr/bin/env python3
"""
Monta el presupuesto completo: calcula los precios y rellena la plantilla.

Cierra el circuito coste → precio → documento sin teclear ningún importe dos
veces, que es donde se cuelan los errores.

    ./montar-presupuesto.py pedido.json -o presupuesto-acme.html
    ./generar-pdf.sh presupuesto-acme.html Presupuesto_Acme_Startidea.pdf

El JSON extiende el de `calcular-precios.py` con los datos del documento:

    {
      "numero": "2026-0147",
      "fecha":  "12 de septiembre de 2026",
      "asunto": "Vasos reutilizables para la feria anual",
      "cliente": {
        "nombre":    "Fundación para el Desarrollo Local, S.L.",
        "cif":       "CIF B00000000",
        "direccion": "Avenida de la Constitución, 128 · 41001 Sevilla",
        "contacto":  "A/A Departamento de Comunicación"
      },
      "plazo": {"min": 8, "max": 15},
      "lineas": [ ... igual que en calcular-precios.py ... ],
      "ficha": {
        "producto":   "Vaso reutilizable de polipropileno 500 ml",
        "ref":        "STM-0000",
        "medidas":    "Ø 85 × 140 mm",
        "materiales": "Polipropileno translúcido, libre de BPA",
        "capacidad":  "500 ml · 42 g",
        "incluye":    "Manipulación y envasado individual en bolsa",
        "foto":       "assets/producto.jpg",
        "zona":       "assets/zona-marcaje.png"
      },
      "marcaje": {
        "tecnica":  "Serigrafía",  "tintas":  "2 tintas planas",
        "posicion": "Frontal, centrada", "area": "150 × 70 mm",
        "formato":  "Vectorial .ai o .pdf"
      },
      "nota": "El vaso es translúcido, por lo que una tinta blanca no cubre…"
    }

Todo dato técnico (medidas, materiales, gramaje, área de marcaje) va a mano y
sale de la ficha del proveedor. Este script no lo inventa ni lo deduce: lo
copia tal cual del JSON. Si falta, para.
"""

import argparse
import html
import importlib.util
import json
import os
import re
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
PLANTILLA = AQUI / "plantilla-presupuesto-startidea.html"


def _calc():
    """Importa calcular-precios.py, cuyo nombre lleva guion."""
    spec = importlib.util.spec_from_file_location("calc", AQUI / "calcular-precios.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def esc(x) -> str:
    return html.escape(str(x), quote=True)


def exigir(dic, ruta, donde):
    """Saca dic[a][b]… o para con un mensaje que dice qué falta."""
    cur, recorrido = dic, []
    for k in ruta.split("."):
        recorrido.append(k)
        if not isinstance(cur, dict) or k not in cur or cur[k] in ("", None):
            sys.exit(f"Falta «{'.'.join(recorrido)}» en el pedido — hace falta para {donde}.")
        cur = cur[k]
    return cur


def celda_imagen(ruta, alt, clase, texto_ph):
    if ruta:
        return f'<img class="{clase}" src="{esc(ruta)}" alt="{esc(alt)}">'
    return f'<div class="ph {clase}">{texto_ph}</div>'


def filas(filas_calc, c, ficha):
    """Genera el <tbody> de partidas. Miniatura solo en la primera línea."""
    out = []
    for i, f in enumerate(filas_calc):
        detalle = f["detalle"] or f["nota"]
        # La miniatura identifica el producto: va solo en la primera línea.
        # Marcaje y cliché no la llevan, y su celda queda vacía en vez de con
        # un marco de muestra que en el PDF entregado parecería un fallo.
        img = (celda_imagen(ficha.get("foto"), ficha.get("producto", ""),
                            "mini", "Foto<br>producto") if i == 0 else "")
        out.append(f'''      <tr>
        <td class="num">{f['n']:02d}</td>
        <td class="img">{img}</td>
        <td class="con">
          <div class="t">{esc(f['concepto'])}</div>
          <div class="s">{esc(detalle)}</div>
        </td>
        <td class="c">{c.num(int(f['cantidad']))}</td>
        <td class="d">{c.eur(f['pvp_unit'])}</td>
        <td class="d">{c.eur(f['importe'])}</td>
      </tr>''')
    return "\n".join(out)


def reanclar_assets(s: str, destino: Path) -> str:
    """
    La plantilla referencia `assets/…` en relativo. Si el HTML montado se
    escribe en otra carpeta, se rompen el logotipo y —sin avisar, que es lo
    peligroso— las tipografías embebidas, y el PDF sale con otra letra.
    Reescribe esas rutas relativas al directorio de salida.
    """
    rel = os.path.relpath(AQUI, destino.resolve().parent)
    if rel == ".":
        return s
    prefijo = rel.replace(os.sep, "/") + "/"
    s = re.sub(r"""(src=["'])assets/""", r"\1" + prefijo + "assets/", s)
    s = re.sub(r"""(url\(['"]?)assets/""", r"\1" + prefijo + "assets/", s)
    return s


def montar(pedido: dict, plantilla: str):
    c = _calc()
    (fl, base, iva, total, coste_total,
     base_con_coste, sin_coste, avisos) = c.procesar(pedido)

    ficha = pedido.get("ficha", {})
    marcaje = pedido.get("marcaje", {})
    s = plantilla

    # 1) partidas: se sustituye el <tbody> entero, así admite N líneas
    s, n = re.subn(r"(<tbody>).*?(</tbody>)",
                   lambda m: m.group(1) + "\n" + filas(fl, c, ficha) + "\n    " + m.group(2),
                   s, count=1, flags=re.S)
    if n != 1:
        sys.exit("No encuentro el <tbody> de partidas en la plantilla.")

    # 2) fotos de la página 2
    if ficha.get("foto"):
        s = s.replace('<div class="ph foto">Foto<br>producto</div>',
                      celda_imagen(ficha["foto"], ficha.get("producto", ""), "foto", ""), 1)
    if ficha.get("zona"):
        s = s.replace('<div class="ph foto">Zona de marcaje<br>con cotas</div>',
                      celda_imagen(ficha["zona"], "Zona de marcaje", "foto", ""), 1)

    # 3) nota técnica: si no hay salvedad que contar, fuera el bloque entero
    if pedido.get("nota"):
        s = s.replace("{{NOTA_TECNICA}}", esc(pedido["nota"]))
    else:
        s = re.sub(r'\n  <div class="notas">.*?</div>\n', "\n", s, count=1, flags=re.S)

    valores = {
        "PRESUPUESTO_NUM": exigir(pedido, "numero", "la cabecera"),
        "FECHA": exigir(pedido, "fecha", "la cabecera"),
        "ASUNTO": exigir(pedido, "asunto", "la banda de asunto"),
        "CLIENTE_NOMBRE": exigir(pedido, "cliente.nombre", "el bloque de cliente"),
        "CLIENTE_CIF": exigir(pedido, "cliente.cif", "el bloque de cliente"),
        "CLIENTE_DIRECCION": exigir(pedido, "cliente.direccion", "el bloque de cliente"),
        "CLIENTE_CONTACTO": pedido.get("cliente", {}).get("contacto", ""),
        "PLAZO_MIN": exigir(pedido, "plazo.min", "el plazo de producción"),
        "PLAZO_MAX": exigir(pedido, "plazo.max", "el plazo de producción"),
        "BASE": c.eur(base), "IVA": c.eur(iva), "TOTAL": c.eur(total),
        "F1_PRODUCTO": exigir(pedido, "ficha.producto", "la ficha técnica"),
        "F1_REF": exigir(pedido, "ficha.ref", "la ficha técnica"),
        "F1_MEDIDAS": exigir(pedido, "ficha.medidas", "la ficha técnica"),
        "F1_MATERIALES": exigir(pedido, "ficha.materiales", "la ficha técnica"),
        "F1_CAPACIDAD": ficha.get("capacidad", "—"),
        "F1_INCLUYE": exigir(pedido, "ficha.incluye", "la ficha técnica"),
        "M_TECNICA": exigir(pedido, "marcaje.tecnica", "la ficha de marcaje"),
        "M_TINTAS": exigir(pedido, "marcaje.tintas", "la ficha de marcaje"),
        "M_POSICION": exigir(pedido, "marcaje.posicion", "la ficha de marcaje"),
        "M_AREA": exigir(pedido, "marcaje.area", "la ficha de marcaje"),
        "M_FORMATO": exigir(pedido, "marcaje.formato", "la ficha de marcaje"),
    }
    for k, v in valores.items():
        s = s.replace("{{%s}}" % k, esc(v))

    # 4) los marcadores ya no hacen falta: fuera el resaltado de aviso
    s = s.replace('<mark class="todo">', "").replace("</mark>", "")

    # 5) fuera los comentarios de la plantilla. Son notas internas —reglas de
    #    proveedor, margen, cómo duplicar bloques— y no tienen por qué viajar
    #    en un archivo que puede acabar en manos del cliente.
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r"\n{3,}", "\n\n", s)

    sobra = sorted(set(re.findall(r"\{\{[A-Z0-9_]+\}\}", s)))
    return s, base, iva, total, coste_total, base_con_coste, sin_coste, avisos, sobra, c


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pedido")
    ap.add_argument("-o", "--salida", required=True, help="HTML de salida")
    args = ap.parse_args()

    pedido = json.loads(Path(args.pedido).read_text(encoding="utf-8"))
    (s, base, iva, total, coste_total, base_con_coste,
     sin_coste, avisos, sobra, c) = montar(pedido, PLANTILLA.read_text(encoding="utf-8"))

    if sobra:
        sys.exit("Marcadores sin sustituir: " + " ".join(sobra))

    salida = Path(args.salida)
    s = reanclar_assets(s, salida)
    salida.write_text(s, encoding="utf-8")
    print(f"HTML montado: {args.salida}")
    print(f"  Base imponible {c.eur(base)} · IVA 21 % {c.eur(iva)} · Total {c.eur(total)}")
    if coste_total is not None:
        m = c.margen(base_con_coste, coste_total)
        print(f"  Margen sobre líneas con coste: {m:.2%}"
              + (f"  ({sin_coste} línea(s) a PVP recomendado aparte)" if sin_coste else ""))
    if not pedido.get("ficha", {}).get("foto"):
        print("  AVISO · sin foto de producto: quedan los marcos de muestra.")
    if not pedido.get("ficha", {}).get("zona"):
        print("  AVISO · sin imagen de zona de marcaje con cotas.")
    for a in avisos:
        print(f"  AVISO · {a}")


if __name__ == "__main__":
    main()
