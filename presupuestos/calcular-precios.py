#!/usr/bin/env python3
"""
Calcula precios de venta y totales de un presupuesto de merchandising.

Parte de los COSTES REALES del portal de proveedor —nunca de estimaciones— y
aplica la regla de la casa: margen del 30 % sobre el precio de venta
(PVP = coste ÷ 0,70), redondeado a un precio unitario limpio SIN salirse del
tramo 30–31 %.

Uso:
    ./calcular-precios.py pedido.json
    ./calcular-precios.py pedido.json --html     # filas listas para la plantilla

Formato de pedido.json:

    {
      "asunto": "Vasos para la feria anual",
      "lineas": [
        {"concepto": "Vaso reutilizable 500 ml",
         "detalle":  "Cuerpo translúcido, apto para lavavajillas",
         "cantidad": 2500,
         "coste_unit": 0.612},

        {"concepto": "Marcaje · serigrafía a 2 tintas",
         "detalle":  "Una posición. Incluye manipulación y envasado",
         "cantidad": 2500,
         "coste_unit": 0.181},

        {"concepto": "Pantallas de serigrafía (2 uds.)",
         "cantidad": 2,
         "coste_unit": 18.50},

        {"concepto": "Photocall 2 × 2,5 m con estructura",
         "cantidad": 1,
         "pvp_unit": 268.00,
         "nota": "PVP recomendado del portal: ya lleva el 30 %"}
      ]
    }

Cada línea lleva `coste_unit` (y el PVP se calcula) o `pvp_unit` (y se usa tal
cual, para el gran formato que ya trae PVP recomendado). Nunca las dos.
"""

import argparse
import json
import sys
from decimal import Decimal, ROUND_HALF_UP

IVA = Decimal("0.21")
MARGEN_MIN = Decimal("0.30")   # margen objetivo, sobre precio de venta
MARGEN_MAX = Decimal("0.31")   # tope al redondear a un precio limpio

# De más limpio a menos. Se coge el primer escalón que dé un precio válido.
ESCALONES = [Decimal(s) for s in
             ("5.00", "1.00", "0.50", "0.25", "0.10", "0.05", "0.01")]


def cent(x: Decimal) -> Decimal:
    """Redondea a dos decimales, como se factura."""
    return x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def margen(pvp: Decimal, coste: Decimal) -> Decimal:
    """Margen sobre el PRECIO DE VENTA, que es como lo mide la casa."""
    return (pvp - coste) / pvp if pvp else Decimal(0)


def pvp_limpio(coste: Decimal):
    """
    Devuelve (pvp, margen) con el precio más limpio que mantiene el margen
    entre el 30 % y el 31 %. Si ningún escalón cabe en ese tramo —pasa con
    costes muy pequeños—, devuelve el mínimo exacto al 30 %.
    """
    if coste <= 0:
        return Decimal("0.00"), Decimal(0)

    minimo = coste / (Decimal(1) - MARGEN_MIN)   # margen exacto del 30 %
    maximo = coste / (Decimal(1) - MARGEN_MAX)   # margen exacto del 31 %

    for paso in ESCALONES:
        # primer múltiplo del escalón que llega al mínimo
        n = (minimo / paso).quantize(Decimal("1"), rounding="ROUND_CEILING")
        cand = cent(n * paso)
        if minimo <= cand <= maximo:
            return cand, margen(cand, coste)

    exacto = cent(minimo)
    if exacto < minimo:            # el redondeo a céntimo no puede bajar del 30 %
        exacto = cent(minimo + Decimal("0.005"))
    return exacto, margen(exacto, coste)


def eur(x: Decimal) -> str:
    """Formato español: 1.234,56 €"""
    s = f"{x:,.2f}"
    return s.replace(",", "\x00").replace(".", ",").replace("\x00", ".") + " €"


def num(x) -> str:
    return f"{x:,}".replace(",", ".")


def procesar(pedido: dict):
    filas, aviso = [], []
    for i, ln in enumerate(pedido.get("lineas", []), 1):
        if ("coste_unit" in ln) == ("pvp_unit" in ln):
            sys.exit(f"Línea {i} ({ln.get('concepto','?')}): indica "
                     f"`coste_unit` O `pvp_unit`, no las dos ni ninguna.")

        cant = Decimal(str(ln["cantidad"]))
        if "pvp_unit" in ln:
            pvp = cent(Decimal(str(ln["pvp_unit"])))
            coste, marg, origen = None, None, "PVP recomendado"
        else:
            coste = Decimal(str(ln["coste_unit"]))
            pvp, marg = pvp_limpio(coste)
            origen = "calculado"
            if not (MARGEN_MIN <= marg <= MARGEN_MAX):
                aviso.append(
                    f"Línea {i} «{ln['concepto']}»: margen {marg:.2%}, por "
                    f"encima del 31 %. Con un coste de {eur(coste)} la banda "
                    f"30–31 % mide menos de un céntimo, así que a dos decimales "
                    f"no hay precio que la cumpla (pasa por debajo de 0,48 €/ud). "
                    f"Se redondea al alza, nunca por debajo del 30 %. Si el "
                    f"margen extra desvirtúa la oferta, fusiona esta línea con "
                    f"la del producto o revisa el precio a mano.")

        filas.append({
            "n": i, "concepto": ln["concepto"], "detalle": ln.get("detalle", ""),
            "nota": ln.get("nota", ""), "cantidad": cant, "coste_unit": coste,
            "pvp_unit": pvp, "margen": marg, "origen": origen,
            "coste_total": cent(coste * cant) if coste is not None else None,
            "importe": cent(pvp * cant),
        })

    base = cent(sum(f["importe"] for f in filas))
    iva = cent(base * IVA)
    # El margen agregado solo se puede medir sobre las líneas de las que
    # conocemos el coste. Las de PVP recomendado no traen coste, y meterlas en
    # el mismo saco infla el margen como si fueran ingreso puro.
    con_coste = [f for f in filas if f["coste_total"] is not None]
    coste_total = cent(sum(f["coste_total"] for f in con_coste)) if con_coste else None
    base_con_coste = cent(sum(f["importe"] for f in con_coste)) if con_coste else None
    sin_coste = len(filas) - len(con_coste)
    return (filas, base, iva, cent(base + iva),
            coste_total, base_con_coste, sin_coste, aviso)


def informe(pedido, filas, base, iva, total, coste_total, base_con_coste,
            sin_coste, aviso):
    if pedido.get("asunto"):
        print(f"\n  {pedido['asunto']}")
    print(f"\n{'#':>2}  {'Concepto':38} {'Cant.':>7} {'Coste':>10} "
          f"{'P.unit.':>10} {'Margen':>7} {'Importe':>12}")
    print("─" * 92)
    for f in filas:
        c = eur(f["coste_unit"]) if f["coste_unit"] is not None else "—"
        m = f"{f['margen']:.2%}" if f["margen"] is not None else "—"
        print(f"{f['n']:02d}  {f['concepto'][:38]:38} {num(int(f['cantidad'])):>7} "
              f"{c:>10} {eur(f['pvp_unit']):>10} {m:>7} {eur(f['importe']):>12}")
    print("─" * 92)
    print(f"{'Base imponible':>77} {eur(base):>12}")
    print(f"{'IVA 21 %':>77} {eur(iva):>12}")
    print(f"{'TOTAL':>77} {eur(total):>12}")

    if coste_total is not None:
        m = margen(base_con_coste, coste_total)
        print(f"\n  Sobre las líneas con coste conocido:")
        print(f"    Coste         {eur(coste_total)}")
        print(f"    Venta         {eur(base_con_coste)}")
        print(f"    Margen bruto  {eur(base_con_coste - coste_total)}  "
              f"({m:.2%} sobre venta)")
        if sin_coste:
            print(f"\n  {sin_coste} línea(s) a PVP recomendado, sin coste declarado: "
                  f"{eur(base - base_con_coste)} de la base quedan fuera de ese\n"
                  f"  cálculo. Ese PVP ya lleva su 30 % de origen.")

    for a in aviso:
        print(f"\n  AVISO · {a}")
    print()


def filas_html(filas):
    print("\n<!-- Pegar en <tbody> de la tabla .partidas de la plantilla -->")
    for f in filas:
        det = f["detalle"] or f["nota"]
        print(f'''      <tr>
        <td class="num">{f['n']:02d}</td>
        <td class="img"><div class="ph mini">Foto</div></td>
        <td class="con">
          <div class="t">{f['concepto']}</div>
          <div class="s">{det}</div>
        </td>
        <td class="c">{num(int(f['cantidad']))}</td>
        <td class="d">{eur(f['pvp_unit'])}</td>
        <td class="d">{eur(f['importe'])}</td>
      </tr>''')


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pedido", help="JSON con las líneas y sus costes reales")
    ap.add_argument("--html", action="store_true",
                    help="imprime además las filas para la plantilla")
    args = ap.parse_args()

    with open(args.pedido, encoding="utf-8") as fh:
        pedido = json.load(fh)

    (filas, base, iva, total, coste_total,
     base_con_coste, sin_coste, aviso) = procesar(pedido)
    informe(pedido, filas, base, iva, total, coste_total, base_con_coste,
            sin_coste, aviso)
    if args.html:
        filas_html(filas)


if __name__ == "__main__":
    main()
