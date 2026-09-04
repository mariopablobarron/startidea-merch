/**
 * POST /api/cron/supplier-ref-en-descripcion
 *
 * Vigila que ninguna ficha ACTIVA publique una referencia de catálogo del
 * proveedor dentro de su descripción — el texto que va al `<meta description>`,
 * a `og:description` y al cuerpo de `/catalogo/[slug]`.
 *
 * POR QUÉ HACE FALTA UNA VIGILANCIA NUEVA. El 2026-09-04 el barrido vivo cazó
 * `/catalogo/basics` de casualidad: el patrón `supplier-sku` conoce cuatro
 * prefijos y uno de ellos casó. Las referencias del proveedor que más aparece
 * no empiezan por ninguno, así que estaban invisibles — medido el 2026-09-05:
 * **139 fichas activas** publicaban una, y llevaban ahí desde el sync que las
 * trajo. Las otras dos vigilancias tampoco podían verlo: el dato no viaja por
 * el campo `supplierRef` (que sí está blindado), sino dentro de la prosa
 * comercial que redacta el proveedor.
 *
 * Desde FUERA esto no se puede comprobar: para saber si «10101» es una
 * referencia hay que conocer el catálogo del proveedor, y justamente por eso no
 * debe salir. De ahí que la vigilancia viva aquí, del lado de la BD, y no en el
 * barrido vivo que corre desde los runners.
 *
 * NO ARREGLA NADA POR SU CUENTA. Reescribir la descripción cambia texto
 * comercial y de SEO de fichas vivas, y en la mitad de los casos la referencia
 * citada es la de OTRO artículo dentro de una frase que compara modelos: cómo
 * recortarla es decisión de Mario. Esto cuenta, avisa y deja la lista.
 *
 * Anti-spam: avisa solo en flanco de subida (hoy hay más fichas afectadas que
 * en el último recuento), como `tariff-coverage-watchdog`. Un problema que ya
 * estaba ayer no vuelve a despertar a nadie.
 *
 * Ver [[rule_no_supplier_exposure]].
 */
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyAdmins } from "@/lib/notify-admin";
import { wrapCronHandler } from "@/lib/cron-tracking";
import { refsDeProveedorEnTexto } from "@/lib/supplier-ref-en-descripcion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_KEY = "supplier_ref_en_descripcion_ultimo";

/** Cuántos slugs se devuelven en el JSON: esto avisa, no inventaria. */
const MUESTRA = 20;

export const POST = wrapCronHandler("supplier-ref-en-descripcion", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const productos = await prisma.product.findMany({
    where: { active: true },
    select: {
      slug: true,
      supplier: true,
      supplierRef: true,
      shortDescription: true,
      enhancedShortDescription: true,
    },
  });

  // El cruce es POR PROVEEDOR: una referencia solo delata a quien la usa, y
  // mezclarlos produciría coincidencias entre catálogos distintos.
  const refsPorProveedor = new Map<string, Set<string>>();
  for (const p of productos) {
    if (!p.supplierRef) continue;
    const set = refsPorProveedor.get(p.supplier) ?? new Set<string>();
    set.add(p.supplierRef.toUpperCase().trim());
    refsPorProveedor.set(p.supplier, set);
  }

  const porProveedor: Record<string, number> = {};
  const muestra: { slug: string; supplier: string; propia: boolean }[] = [];
  let afectadas = 0;

  for (const p of productos) {
    const refs = refsPorProveedor.get(p.supplier);
    if (!refs) continue;
    // Lo que se publica es la mejorada cuando existe; si no, la del proveedor.
    const texto = p.enhancedShortDescription ?? p.shortDescription;
    const hits = refsDeProveedorEnTexto(texto, refs, p.supplierRef);
    if (hits.length === 0) continue;
    afectadas++;
    porProveedor[p.supplier] = (porProveedor[p.supplier] ?? 0) + 1;
    // El token NO se escribe: el JSON lo lee el runner y acabaría en un log.
    if (muestra.length < MUESTRA) {
      muestra.push({ slug: p.slug, supplier: p.supplier, propia: hits.some((h) => h.propia) });
    }
  }

  let previo: number | null = null;
  try {
    const row = await prisma.adminSetting.findUnique({ where: { key: STATE_KEY }, select: { value: true } });
    if (typeof row?.value === "number") previo = row.value;
  } catch {
    // Sin estado previo se trata como primera medición: avisa si hay algo.
  }

  const avisar = afectadas > 0 && (previo === null || afectadas > previo);

  if (avisar) {
    await notifyAdmins({
      title: `🔒 ${afectadas} fichas publican una referencia de proveedor`,
      body:
        `La descripción visible de ${afectadas} productos activos contiene una referencia del catálogo del proveedor ` +
        `(${Object.entries(porProveedor).map(([s, n]) => `${s}: ${n}`).join(" · ")}). ` +
        `Regla nº2: el cliente nunca debe saber de dónde compramos. Arreglarlo cambia texto comercial, así que lo decide Mario.`,
      url: "/admin/products",
      tag: "supplier-ref-en-descripcion",
    });
  }

  await prisma.adminSetting.upsert({
    where: { key: STATE_KEY },
    create: { key: STATE_KEY, value: afectadas as unknown as object },
    update: { value: afectadas as unknown as object },
  });

  return NextResponse.json({
    ok: true,
    revisadas: productos.length,
    afectadas,
    porProveedor,
    previo,
    avisado: avisar,
    muestra,
    nota: avisar
      ? "Aviso enviado (flanco de subida)"
      : afectadas > 0
        ? "Sigue habiendo fichas afectadas, pero no más que en el último recuento (anti-spam)"
        : "Ninguna ficha activa publica una referencia de proveedor",
  });
});

// GET para comprobarlo a mano, con el mismo cerrojo.
export const GET = POST;
