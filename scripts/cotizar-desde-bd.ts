#!/usr/bin/env bun
/**
 * De una referencia y una cantidad al `pedido.json` de un presupuesto.
 *
 *   bun scripts/cotizar-desde-bd.ts --ref STM-000123 --cantidad 500 \
 *       --tecnica MK_P1 --tintas 1 --numero PRE-2026-0031 \
 *       --cliente "Ayuntamiento de Granada" --cif P1808700A \
 *       --direccion "Plaza del Carmen s/n, 18009 Granada" \
 *       -o presupuestos/pedido-granada.json
 *
 *   # sin --tecnica: lista las técnicas del producto tarificadas a esa cantidad
 *   bun scripts/cotizar-desde-bd.ts --ref STM-000123 --cantidad 500
 *
 * Luego, como siempre:
 *   cd presupuestos && ./montar-presupuesto.py pedido-granada.json -o presupuesto.html && ./generar-pdf.sh
 *
 * Necesita DATABASE_URL con el rol de SOLO LECTURA (`claude_lectura`). Antes
 * de leer un solo precio comprueba que ese rol no puede ver clientes ni
 * ajustes; si puede, se para. La lógica vive en `@/lib/cotizar-desde-bd` y
 * está probada sin base de datos; aquí solo hay entrada/salida.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { quoteMarkingNet } from "@/lib/marking-quote";
import { costeAlTramo } from "@/lib/presupuesto-catalogo";
import {
  comprobarRolDeLectura,
  construirPedido,
  hayBandera,
  leerArgumento,
  leerMargenesPorVista,
  posicionesPorTecnica,
  type DatosPedido,
  type MarcajeCotizado,
  type ProductoLeido,
} from "@/lib/cotizar-desde-bd";

// ── argv ─────────────────────────────────────────────────────────────────────

const arg = (nombre: string, porDefecto?: string) => leerArgumento(process.argv, nombre, porDefecto);
const flag = (nombre: string) => hayBandera(process.argv, nombre);

function exigir(nombre: string): string {
  const v = arg(nombre);
  if (!v) {
    console.error(`Falta --${nombre}.`);
    process.exit(2);
  }
  return v;
}

const hoy = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" }).format(new Date());

// ── foto: se descarga en local para que el HTML no apunte al CDN del proveedor ─

async function descargarFoto(url: string | null, ref: string): Promise<string | null> {
  if (!url || flag("sin-foto")) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const tipo = r.headers.get("content-type") ?? "";
    const ext = tipo.includes("png") ? "png" : tipo.includes("webp") ? "webp" : "jpg";
    const dir = path.resolve("presupuestos/fotos");
    mkdirSync(dir, { recursive: true });
    const destino = path.join(dir, `${ref}.${ext}`);
    writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
    // Ruta relativa a presupuestos/, que es desde donde corre montar-presupuesto.py
    return `fotos/${ref}.${ext}`;
  } catch {
    return null;
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("No hay DATABASE_URL. Hace falta la cadena del rol de solo lectura.");
    process.exit(2);
  }
  if (!/claude_lectura/.test(process.env.DATABASE_URL)) {
    console.error(
      "AVISO · DATABASE_URL no es el rol claude_lectura. Este script está pensado para el acceso de solo catálogo; con otro rol, la comprobación de abajo es la que manda.",
    );
  }

  // 0) Antes de leer nada: ¿el rol ve lo que no debe?
  //    La comprobación PROVOCA a propósito cuatro «permission denied», y Prisma
  //    los pinta en rojo aunque sean el resultado bueno. Se avisa antes para que
  //    nadie los lea como una avería: si el rol está bien puesto, salen los
  //    cuatro y el script sigue. Silenciar el log de Prisma taparía errores de
  //    verdad, así que se explica en vez de esconderlo.
  console.error("Comprobando el rol de lectura: los cuatro «permission denied» que siguen son lo ESPERADO.");
  const rol = await comprobarRolDeLectura(prisma);
  if (!rol.ok) {
    console.error(`PARADO · ${rol.motivo}`);
    process.exit(3);
  }

  const ref = exigir("ref");
  const cantidad = Math.max(1, Number(exigir("cantidad")) || 0);
  const tintas = Math.max(1, Number(arg("tintas", "1")) || 1);

  // 1) Producto: el MISMO select que el panel, más `supplier` e `id` para
  //    tarificar el marcaje. Ninguno de los dos sale en el pedido.
  const producto = await prisma.product.findFirst({
    where: { active: true, OR: [{ internalRef: ref }, { slug: ref }] },
    select: {
      id: true,
      supplier: true,
      name: true,
      internalRef: true,
      material: true,
      lengthMm: true,
      widthMm: true,
      heightMm: true,
      primaryImageUrl: true,
      category: {
        select: { name: true, parent: { select: { name: true, parent: { select: { name: true } } } } },
      },
      override: { select: { customName: true } },
      variants: {
        where: { priceTiers: { some: {} } },
        take: 1,
        orderBy: { sku: "asc" },
        select: { priceTiers: { select: { minQty: true, unitPriceCents: true } } },
      },
      positions: {
        select: {
          positionId: true,
          maxWidthMm: true,
          maxHeightMm: true,
          techniques: { select: { technique: { select: { code: true, name: true } } } },
        },
      },
    },
  });
  if (!producto) {
    console.error(`No encuentro ningún producto activo con referencia o slug «${ref}».`);
    process.exit(1);
  }

  const tiers = producto.variants[0]?.priceTiers ?? [];
  const coste = costeAlTramo(tiers, cantidad);
  const porTecnica = posicionesPorTecnica(producto.positions);

  // 2) Sin --tecnica: enseñar las que hay, tarificadas, y salir.
  const codigoTecnica = arg("tecnica");
  if (!codigoTecnica) {
    console.log(`\n${producto.name}  (${producto.internalRef ?? "sin STM"})`);
    console.log(
      coste
        ? `  coste producto al tramo de ${coste.tramoMinQty}: ${(coste.costeUnitCents / 100).toFixed(2)} €/ud`
        : "  SIN tarifa de proveedor en el catálogo",
    );
    console.log(`\n  Técnicas a ${cantidad} uds y ${tintas} tinta(s):`);
    for (const [codigo, t] of porTecnica) {
      const q = await quoteMarkingNet({
        productId: producto.id,
        supplier: producto.supplier,
        techniqueCode: codigo.toUpperCase(),
        quantity: cantidad,
        productNetUnitCents: coste?.costeUnitCents ?? 0,
        printAreaCm2: t.areaCm2,
        numberOfColours: tintas,
      }).catch(() => null);
      const linea = q?.ok
        ? `${((q.netTotalCents - q.setupCents) / cantidad / 100).toFixed(2)} €/ud + cliché ${(q.setupCents / 100).toFixed(2)} €`
        : `sin tarifa fiable${q?.warning ? ` — ${q.warning}` : ""}`;
      console.log(`    ${codigo.padEnd(10)} ${t.nombre.padEnd(28)} ${t.posicion.padEnd(14)} ${(t.areaMaxima ?? "—").padEnd(14)} ${linea}`);
    }
    console.log("\n  Repite con --tecnica CODIGO para montar el pedido.\n");
    return;
  }

  // 3) Tarificar la técnica elegida con la MISMA llamada que el panel.
  const elegida = porTecnica.get(codigoTecnica) ?? porTecnica.get(codigoTecnica.toUpperCase());
  if (!elegida) {
    console.error(`El producto no tiene la técnica «${codigoTecnica}». Lanza sin --tecnica para ver las que hay.`);
    process.exit(1);
  }
  let marcaje: MarcajeCotizado;
  try {
    const q = await quoteMarkingNet({
      productId: producto.id,
      supplier: producto.supplier,
      techniqueCode: codigoTecnica.toUpperCase(),
      quantity: cantidad,
      productNetUnitCents: coste?.costeUnitCents ?? 0,
      printAreaCm2: elegida.areaCm2,
      numberOfColours: tintas,
    });
    marcaje = {
      codigo: codigoTecnica,
      nombre: elegida.nombre,
      posicion: elegida.posicion,
      areaMaxima: elegida.areaMaxima,
      areaCm2: elegida.areaCm2,
      cotizacion: q.ok
        ? { ok: true, netTotalCents: q.netTotalCents, setupCents: q.setupCents }
        : { ok: false, warning: q.warning ?? "Sin tarifa fiable: pide el coste al proveedor." },
    };
  } catch (e) {
    marcaje = {
      codigo: codigoTecnica,
      nombre: elegida.nombre,
      posicion: elegida.posicion,
      areaMaxima: elegida.areaMaxima,
      areaCm2: elegida.areaCm2,
      cotizacion: { ok: false, warning: `La técnica no se pudo tarificar (${(e as Error).message}).` },
    };
  }

  // 4) Márgenes del panel, por la vista (el rol no ve AdminSetting).
  const margenes = await leerMargenesPorVista(prisma);

  // 5) Foto en local. Si la URL del catálogo delata al proveedor, se descarga
  //    igual (el fichero local no lleva nombre) pero nunca se emite la URL.
  const refPublica = producto.internalRef ?? producto.id;
  const foto = await descargarFoto(producto.primaryImageUrl, refPublica);
  if (producto.primaryImageUrl && !foto && !flag("sin-foto")) {
    console.error("AVISO · no se pudo descargar la foto: la ficha llevará los marcos de muestra.");
  }

  const datos: DatosPedido = {
    numero: exigir("numero"),
    fecha: arg("fecha", hoy)!,
    asunto: arg("asunto") ?? null,
    cliente: {
      nombre: exigir("cliente"),
      cif: exigir("cif"),
      direccion: exigir("direccion"),
      contacto: arg("contacto") ?? null,
    },
    plazo: { min: Number(arg("plazo-min", "8")), max: Number(arg("plazo-max", "15")) },
    cantidad,
    tecnica: codigoTecnica,
    tintas,
    formato: arg("formato", "Vectorial (.ai, .eps o .pdf) con los textos trazados")!,
    incluye: arg("incluye", "Producto y marcaje según la especificación de esta ficha")!,
    capacidad: arg("capacidad") ?? null,
    nota: arg("nota") ?? null,
    foto,
  };

  // `producto` lleva `supplier` porque hace falta para tarificar; ProductoLeido
  // no lo tiene a propósito, para que no pueda colarse en el pedido.
  const { supplier, ...productoSinProveedor } = producto;
  void supplier;
  const { pedido, avisos, margenFamiliaPct } = construirPedido({
    datos,
    producto: productoSinProveedor satisfies ProductoLeido,
    marcaje,
    margenes,
  });

  const salida = arg("o");
  const json = JSON.stringify(pedido, null, 2);
  if (salida) {
    writeFileSync(salida, json + "\n", "utf8");
    console.log(`Pedido escrito: ${salida}`);
  } else {
    console.log(json);
  }

  console.log(`\n  ${pedido.ficha.producto} · ${pedido.ficha.ref} · ${cantidad} uds`);
  for (const l of pedido.lineas) console.log(`    ${l.concepto.padEnd(44)} ${l.cantidad.toString().padStart(6)} × ${l.coste_unit.padStart(8)} € coste`);
  console.log(`  Margen por familia en el panel: ${margenFamiliaPct} % · el PDF saldrá al 30 % del encargo`);
  for (const a of avisos) console.log(`  AVISO · ${a}`);
  console.log(
    `\n  Siguiente: cd presupuestos && ./montar-presupuesto.py ${salida ? path.relative("presupuestos", salida) : "pedido.json"} -o presupuesto.html && ./generar-pdf.sh\n`,
  );
}

main()
  .catch((e) => {
    console.error(`PARADO · ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
