#!/usr/bin/env bun
/**
 * Auditoría del PRECIO PÚBLICO del catálogo, proveedor por proveedor.
 *
 * Esto es solo la salida por consola: los números los saca `auditarPrecios`
 * (src/lib/auditoria-precios.ts), que es la misma función que alimenta la
 * página del panel. Si se separaran, la consola y la pantalla contarían cosas
 * distintas y la auditoría dejaría de servir para decidir.
 *
 * No cambia nada. Solo lee y cuenta. Hay que ejecutarlo contra la base de
 * datos de PRODUCCIÓN, porque la respuesta depende del dato, no del código:
 *
 *   DATABASE_URL="postgres://…producción…" bun scripts/audit-precios-catalogo.ts
 *
 * Lo mismo, sin terminal ni credenciales, está en el panel:
 *   Panel → Proveedores → Auditoría de precios
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
 *   C. VARIANTES QUE NO CUESTAN LO MISMO — cuánto se separa la variante más
 *      cara de la más barata dentro del mismo producto. Con el arreglo de la
 *      variante elegida ya se cobra la que toca; esta sección dice en cuántos
 *      productos ese arreglo cambia el precio de verdad.
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
import { auditarPrecios, SUPPLIERS } from "../src/lib/auditoria-precios";

const prisma = new PrismaClient();

const EUR = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

/** Cuántos ejemplos se listan de cada problema. */
const EJEMPLOS = Number(process.env.EJEMPLOS ?? "8");

function titulo(t: string) {
  console.log(`\n${"─".repeat(78)}\n${t}\n${"─".repeat(78)}`);
}

async function main() {
  const a = await auditarPrecios(prisma, { ejemplos: EJEMPLOS });

  console.log("AUDITORÍA DEL PRECIO PÚBLICO DEL CATÁLOGO");
  console.log(
    `Margen global configurado: ×${a.margen.multiplicador.toFixed(4)} — ` +
      `${a.margen.sobreVentaPct.toFixed(1)} % sobre venta`,
  );

  titulo("A · ACTIVOS SIN PRECIO (debería ser 0: los desactiva el sweep)");
  for (const s of SUPPLIERS) {
    console.log(`  ${s.padEnd(10)} ${String(a.sinPrecio.porProveedor[s]).padStart(6)}`);
  }
  console.log(
    `  ${"TOTAL".padEnd(10)} ${String(a.sinPrecio.total).padStart(6)}` +
      (a.sinPrecio.total > 0
        ? "   ⚠ publicados sin precio — el sweep no ha corrido tras el último sync"
        : "   ✓"),
  );

  titulo("B · ACTIVOS SIN TARIFA REAL (la web inventa la curva de volumen)");
  console.log("  A 250 uds la curva inventada cobra el 32 % del «desde»:");
  console.log("  con el margen encima del coste, eso es vender bajo coste.\n");
  for (const s of SUPPLIERS) {
    console.log(`  ${s.padEnd(10)} ${String(a.sinTarifa.porProveedor[s]).padStart(6)}`);
    for (const p of a.sinTarifa.ejemplos[s]) {
      console.log(
        `      ${p.slug.slice(0, 44).padEnd(44)} coste ${EUR(p.costeCents).padStart(9)}` +
          ` · desde ${EUR(p.desdeCents).padStart(9)} · a 250 uds ${EUR(p.a250Cents).padStart(9)}` +
          (p.bajoCoste ? "  ⚠ BAJO COSTE" : ""),
      );
    }
  }
  console.log(
    `  ${"TOTAL".padEnd(10)} ${String(a.sinTarifa.total).padStart(6)}` +
      (a.sinTarifa.total > 0 ? "   ⚠" : "   ✓"),
  );

  titulo("C · VARIANTES QUE NO CUESTAN LO MISMO");
  console.log("  En estos productos la talla elegida cambia el precio de verdad.\n");
  for (const s of SUPPLIERS) {
    console.log(
      `  ${s.padEnd(10)} ${String(a.horquillaVariantes.porProveedor[s]).padStart(6)} productos con horquilla`,
    );
    for (const f of a.horquillaVariantes.ejemplos[s]) {
      console.log(
        `      ${f.slug.slice(0, 40).padEnd(40)} ${String(f.variantes).padStart(3)} var.` +
          ` · de ${EUR(f.minCents)} a ${EUR(f.maxCents)}  (+${f.saltoPct.toFixed(0)} %)`,
      );
    }
  }

  titulo("D · ÁDIVIN: precio fijado a mano, margen real desconocido");
  console.log(
    `  activos: ${a.adivin.activos} · con precio fijado (PVP del proveedor): ${a.adivin.conPrecioFijado}`,
  );
  console.log("  Correcto: evita el doble margen. Pero el coste neto no está en");
  console.log("  la base de datos, así que el sistema no puede calcular ni avisar");
  console.log("  del margen real de estos productos.");

  titulo("E · MARGEN EFECTIVO sobre los que SÍ tienen tarifa real");
  for (const s of SUPPLIERS) {
    const m = a.margenEfectivo[s];
    if (m.muestra === 0) {
      console.log(`  ${s.padEnd(10)} sin productos con tarifa real`);
      continue;
    }
    console.log(
      `  ${s.padEnd(10)} muestra ${String(m.muestra).padStart(4)}` +
        ` · margen medio sobre venta ${m.margenMedioPct?.toFixed(1) ?? "—"} %` +
        ` · con precio fijado por admin: ${m.conPrecioFijado}`,
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
