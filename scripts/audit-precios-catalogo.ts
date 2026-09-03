#!/usr/bin/env bun
/**
 * Auditoría del PRECIO PÚBLICO del catálogo, proveedor por proveedor.
 *
 * Contesta a una pregunta concreta: ¿el precio que ve el cliente sale de la
 * tarifa real del proveedor y lleva nuestro margen? Y si no, ¿en cuántos
 * productos y de cuáles.
 *
 * No cambia nada. Solo lee y cuenta. Hay que ejecutarlo contra la base de
 * datos de PRODUCCIÓN, porque la respuesta depende del dato, no del código:
 *
 *   DATABASE_URL="postgres://…producción…" bun scripts/audit-precios-catalogo.ts
 *
 * Qué mira, y por qué cada cosa importa:
 *
 *   A. ACTIVOS SIN PRECIO — activos con `fromPriceCents` nulo o ≤ 0. Debería
 *      ser 0: el sweep posterior a cada sync los desactiva. Si sale > 0, el
 *      sweep no está corriendo y hay fichas publicadas sin precio.
 *
 *   B. ACTIVOS SIN TARIFA — activos con precio pero sin NINGÚN tramo real de
 *      proveedor. En esos, la web inventa la curva de volumen
 *      (`defaultTiersFromBase`: −68 % a 250 uds) y el carrito cobra por ella.
 *      Con el margen ×1,6667 encima del coste, a 250 uds eso es vender al
 *      53 % del coste. Es el hallazgo más caro de los tres.
 *
 *   C. VARIANTES QUE NO CUESTAN LO MISMO — la ficha pública cotiza con la
 *      PRIMERA variante que tenga tramos (`variants.find(...)`), no con la que
 *      el cliente elige. En un textil por tallas donde la 3XL cuesta más, el
 *      precio que se enseña —y se cobra— es el de otra talla. Se reporta la
 *      horquilla en € y en % por producto.
 *
 *   D. ÁDIVIN — se publica al PVP recomendado del proveedor con
 *      `customFromPriceCents`, para no aplicarle el margen global encima
 *      (sería doble margen). Correcto, pero significa que el sistema NO sabe
 *      el coste de esos productos: no puede calcular ni avisar del margen
 *      real. Se cuentan para que quede dicho, no como error.
 *
 *   E. MARGEN EFECTIVO — sobre los que sí tienen tarifa real, compara el
 *      «desde» que se publica con el coste mínimo y saca el margen sobre venta
 *      que está aplicando la web de verdad. Debería dar el 40 % del
 *      multiplicador, salvo en los que tengan override del admin.
 */

import { PrismaClient } from "@prisma/client";
import { applyMargin, marginMultiplier } from "../src/lib/pricing";

const prisma = new PrismaClient();

const SUPPLIERS = ["midocean", "makito", "cifra", "adivin"] as const;
const EUR = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

/** Cuántos ejemplos se listan de cada problema. */
const EJEMPLOS = Number(process.env.EJEMPLOS ?? "8");

function titulo(t: string) {
  console.log(`\n${"─".repeat(78)}\n${t}\n${"─".repeat(78)}`);
}

async function main() {
  console.log("AUDITORÍA DEL PRECIO PÚBLICO DEL CATÁLOGO");
  console.log(`Margen global configurado: ×${marginMultiplier().toFixed(4)} — ` +
    `${((1 - 1 / marginMultiplier()) * 100).toFixed(1)} % sobre venta`);

  // ── A. Activos sin precio ────────────────────────────────────────────────
  titulo("A · ACTIVOS SIN PRECIO (debería ser 0: los desactiva el sweep)");
  let totalSinPrecio = 0;
  for (const supplier of SUPPLIERS) {
    const n = await prisma.product.count({
      where: { supplier, active: true, OR: [{ fromPriceCents: null }, { fromPriceCents: { lte: 0 } }] },
    });
    totalSinPrecio += n;
    console.log(`  ${supplier.padEnd(10)} ${String(n).padStart(6)}`);
  }
  console.log(`  ${"TOTAL".padEnd(10)} ${String(totalSinPrecio).padStart(6)}` +
    (totalSinPrecio > 0
      ? "   ⚠ publicados sin precio — el sweep no ha corrido tras el último sync"
      : "   ✓"));

  // ── B. Activos con precio pero sin tarifa real ───────────────────────────
  titulo("B · ACTIVOS SIN TARIFA REAL (la web inventa la curva de volumen)");
  console.log("  A 250 uds la curva inventada cobra el 32 % del «desde»:");
  console.log("  con el margen encima del coste, eso es vender bajo coste.\n");
  let totalSinTarifa = 0;
  for (const supplier of SUPPLIERS) {
    const sinTarifa = await prisma.product.findMany({
      where: {
        supplier,
        active: true,
        fromPriceCents: { gt: 0 },
        variants: { none: { priceTiers: { some: {} } } },
        // Se excluyen SOLO los que tienen el precio fijado a mano
        // (`customFromPriceCents`), que van con tarifa plana a propósito —
        // Ádivin—. Un override de otra cosa (etiquetas, por ejemplo) no
        // cambia el precio y no debe sacarlos de la cuenta.
        NOT: { override: { customFromPriceCents: { not: null } } },
      },
      select: { slug: true, name: true, fromPriceCents: true },
      take: EJEMPLOS,
    });
    const n = await prisma.product.count({
      where: {
        supplier,
        active: true,
        fromPriceCents: { gt: 0 },
        variants: { none: { priceTiers: { some: {} } } },
        NOT: { override: { customFromPriceCents: { not: null } } },
      },
    });
    totalSinTarifa += n;
    console.log(`  ${supplier.padEnd(10)} ${String(n).padStart(6)}`);
    for (const p of sinTarifa) {
      const desde = applyMargin(p.fromPriceCents ?? 0);
      const a250 = Math.round(desde * 0.32);
      console.log(
        `      ${p.slug.slice(0, 44).padEnd(44)} coste ${EUR(p.fromPriceCents ?? 0).padStart(9)}` +
          ` · desde ${EUR(desde).padStart(9)} · a 250 uds ${EUR(a250).padStart(9)}` +
          (a250 < (p.fromPriceCents ?? 0) ? "  ⚠ BAJO COSTE" : ""),
      );
    }
  }
  console.log(`  ${"TOTAL".padEnd(10)} ${String(totalSinTarifa).padStart(6)}` +
    (totalSinTarifa > 0 ? "   ⚠" : "   ✓"));

  // ── C. Variantes con precios distintos ───────────────────────────────────
  titulo("C · VARIANTES QUE NO CUESTAN LO MISMO (la ficha cotiza con la primera)");
  console.log("  La ficha usa `variants.find(v => v.priceTiers.length > 0)`, no la");
  console.log("  variante que elige el cliente. Si las tallas no cuestan igual, el");
  console.log("  precio que se enseña y se cobra es el de otra talla.\n");
  for (const supplier of SUPPLIERS) {
    // Horquilla del precio mínimo entre variantes del mismo producto.
    const filas = await prisma.$queryRaw<
      Array<{ slug: string; name: string; min_cents: number; max_cents: number; variantes: bigint }>
    >`
      SELECT p.slug, p.name,
             MIN(v.min_cents) AS min_cents,
             MAX(v.min_cents) AS max_cents,
             COUNT(*)         AS variantes
      FROM "Product" p
      JOIN (
        SELECT pv."productId" AS product_id, pv.id, MIN(pt."unitPriceCents") AS min_cents
        FROM "ProductVariant" pv
        JOIN "PriceTier" pt ON pt."variantId" = pv.id
        GROUP BY pv."productId", pv.id
      ) v ON v.product_id = p.id
      WHERE p.active = true AND p.supplier::text = ${supplier}
      GROUP BY p.slug, p.name
      HAVING MIN(v.min_cents) <> MAX(v.min_cents)
      ORDER BY (MAX(v.min_cents) - MIN(v.min_cents)) DESC
    `;
    console.log(`  ${supplier.padEnd(10)} ${String(filas.length).padStart(6)} productos con horquilla`);
    for (const f of filas.slice(0, EJEMPLOS)) {
      const salto = f.max_cents - f.min_cents;
      const pct = ((salto / f.min_cents) * 100).toFixed(0);
      console.log(
        `      ${f.slug.slice(0, 40).padEnd(40)} ${String(f.variantes).padStart(3)} var.` +
          ` · de ${EUR(f.min_cents)} a ${EUR(f.max_cents)}  (+${pct} %)`,
      );
    }
  }

  // ── D. Ádivin ────────────────────────────────────────────────────────────
  titulo("D · ÁDIVIN: precio fijado a mano, margen real desconocido");
  const conCustom = await prisma.productOverride.count({
    where: { customFromPriceCents: { not: null }, product: { supplier: "adivin" } },
  });
  const adivinActivos = await prisma.product.count({ where: { supplier: "adivin", active: true } });
  console.log(`  activos: ${adivinActivos} · con precio fijado (PVP del proveedor): ${conCustom}`);
  console.log("  Correcto: evita el doble margen. Pero el coste neto no está en");
  console.log("  la base de datos, así que el sistema no puede calcular ni avisar");
  console.log("  del margen real de estos productos.");

  // ── E. Margen efectivo ───────────────────────────────────────────────────
  titulo("E · MARGEN EFECTIVO sobre los que SÍ tienen tarifa real");
  for (const supplier of SUPPLIERS) {
    const muestra = await prisma.product.findMany({
      where: {
        supplier,
        active: true,
        fromPriceCents: { gt: 0 },
        variants: { some: { priceTiers: { some: {} } } },
      },
      select: { slug: true, fromPriceCents: true, override: { select: { customFromPriceCents: true, marginPct: true } } },
      take: 400,
    });
    if (muestra.length === 0) {
      console.log(`  ${supplier.padEnd(10)} sin productos con tarifa real`);
      continue;
    }
    const conOverride = muestra.filter(
      (p) => p.override?.customFromPriceCents != null || p.override?.marginPct != null,
    ).length;
    const margenes = muestra
      .filter((p) => p.override?.customFromPriceCents == null && p.override?.marginPct == null)
      .map((p) => {
        const coste = p.fromPriceCents ?? 0;
        const venta = applyMargin(coste);
        return venta > 0 ? ((venta - coste) / venta) * 100 : 0;
      });
    const media = margenes.reduce((a, b) => a + b, 0) / (margenes.length || 1);
    console.log(
      `  ${supplier.padEnd(10)} muestra ${String(muestra.length).padStart(4)}` +
        ` · margen medio sobre venta ${media.toFixed(1)} %` +
        ` · con precio fijado por admin: ${conOverride}`,
    );
  }

  console.log("\nFin de la auditoría. Nada se ha modificado.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
