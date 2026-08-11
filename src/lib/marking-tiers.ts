/**
 * Validación de coherencia de la tarifa de marcaje POR TRAMOS
 * (`SupplierMarkingRule.tier1..4`), introducida en `73f5518`.
 *
 * Por qué existe: los tramos se teclean a mano en /admin/suppliers/cifra/marking-rates
 * y el consumidor (`quoteMarkingForRule`) los aplica tal cual al precio que se COBRA.
 * Zod solo acotaba cada campo por separado, así que había cuatro formas de guardar
 * una tarifa que parece bien y se comporta mal:
 *
 *  1. €/ud a 0  → el marcaje se cotiza GRATIS (rompe el invariante de dinero del
 *     proyecto: un marcaje nunca vale 0 €).
 *  2. Tramo huérfano (cantidad sin precio o precio sin cantidad) → el consumidor lo
 *     filtra y lo ignora EN SILENCIO: el admin cree haber cargado un tramo que no existe.
 *  3. Cantidades desordenadas → el consumidor recorre tier4→tier1 asumiendo orden
 *     ascendente; desordenadas, una cantidad intermedia cae en el tramo equivocado.
 *  4. Tramos 2-4 rellenos con el 1 vacío → `quoteMarkingForRule` condiciona TODA la
 *     vía de tramos a `tier1UnitCents != null`, así que descarta los tres tramos
 *     cargados y cae al % aproximado sin avisar. Es el más traicionero de los cuatro.
 *
 * Función pura y sin dependencias: se puede testear sin Prisma y la usan POST y PATCH.
 */

export type MarkingTierInput = {
  tier1MinQty?: number | null;
  tier1UnitCents?: number | null;
  tier2MinQty?: number | null;
  tier2UnitCents?: number | null;
  tier3MinQty?: number | null;
  tier3UnitCents?: number | null;
  tier4MinQty?: number | null;
  tier4UnitCents?: number | null;
};

/**
 * Devuelve un mensaje de error legible para el admin, o `null` si los tramos son
 * coherentes. No lanza: el llamante decide el código de estado.
 */
export function validateMarkingTiers(t: MarkingTierInput): string | null {
  const tramos = [1, 2, 3, 4].map((n) => ({
    n,
    minQty: t[`tier${n}MinQty` as keyof MarkingTierInput] ?? null,
    cents: t[`tier${n}UnitCents` as keyof MarkingTierInput] ?? null,
  }));

  // (1) y (2): cada tramo, por separado.
  for (const tr of tramos) {
    const tieneCantidad = tr.minQty != null;
    const tienePrecio = tr.cents != null;
    if (tieneCantidad !== tienePrecio) {
      return `Tramo ${tr.n} incompleto: hay que rellenar la cantidad mínima Y el precio por unidad (si no, el tramo se ignora al cotizar).`;
    }
    if (tienePrecio && (tr.cents as number) <= 0) {
      return `Tramo ${tr.n}: el precio por unidad debe ser mayor que 0 — un marcaje nunca puede cotizarse a 0 €.`;
    }
  }

  const rellenos = tramos.filter((tr) => tr.minQty != null && tr.cents != null);
  if (rellenos.length === 0) return null; // sin tramos: la regla usa el % aproximado

  // (4): el tramo 1 manda; sin él, el resto no se aplica nunca.
  if (rellenos[0].n !== 1) {
    return "Hay que rellenar el tramo 1: sin él no se aplica ningún tramo y la cotización cae al porcentaje aproximado.";
  }

  // (3): cantidades estrictamente ascendentes.
  for (let i = 1; i < rellenos.length; i++) {
    const previo = rellenos[i - 1];
    const actual = rellenos[i];
    if ((actual.minQty as number) <= (previo.minQty as number)) {
      return `Las cantidades mínimas deben ir de menor a mayor: el tramo ${actual.n} (${actual.minQty}) no supera al tramo ${previo.n} (${previo.minQty}).`;
    }
  }

  return null;
}
