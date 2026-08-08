import { NextResponse } from "next/server";
import { requireVoiceAgentToolSecret } from "@/lib/voice-agent-auth";
import { loadActivePromotions, getBadgeText } from "@/lib/promotions";
import { prisma } from "@/lib/prisma";
import { publicProductName } from "@/lib/product-name";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tool: list_promotions
 *
 * Carmen la usa cuando el cliente pregunta cosas como:
 *   - "¿tenéis ofertas ahora?"
 *   - "¿hay descuento si pido textil?"
 *   - "¿qué promociones hay activas?"
 *
 * También puede llamarla *al inicio* de la conversación si quiere mencionar
 * proactivamente una oferta vigente (ver instructions del agente).
 *
 * Devuelve formato optimizado para LECTURA POR VOZ:
 *   - "descuento": frase humana ("veinte por ciento", "cinco euros")
 *   - "aplica_a": frase humana ("toda la tienda", "categoría mochilas")
 *   - "termina": frase humana ("este domingo 26 de mayo")
 *   - "summary": frase completa preparada para que Carmen la lea tal cual
 *
 * Si no hay promociones vigentes, devuelve `{ promotions: [], summary: null }`
 * y Carmen contesta "ahora mismo no hay promociones activas, pero te puedo
 * preparar un presupuesto personalizado".
 */
export async function POST(req: Request) {
  const auth = requireVoiceAgentToolSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const promos = await loadActivePromotions();
  if (promos.length === 0) {
    return NextResponse.json({
      ok: true,
      promotions: [],
      summary: null,
      tts_hint:
        "No hay promociones activas en este momento. Ofrece un presupuesto personalizado.",
    });
  }

  // Cargar nombres legibles para CATEGORY y PRODUCT_LIST
  const categoryIds = promos.filter((p) => p.scope === "CATEGORY").flatMap((p) => p.targetIds);
  const productIds = promos.filter((p) => p.scope === "PRODUCT_LIST").flatMap((p) => p.targetIds);
  const [categories, products] = await Promise.all([
    categoryIds.length > 0
      ? prisma.category.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    productIds.length > 0
      ? prisma.product.findMany({
          where: { id: { in: productIds } },
          select: {
            id: true,
            name: true,
            slug: true,
            override: { select: { customName: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const prodMap = Object.fromEntries(
    products.map((p) => [p.id, publicProductName(p.name, p.override?.customName)]),
  );

  const items = promos.map((p) => {
    const descuento =
      p.kind === "PERCENT"
        ? spellOutPercent(p.value)
        : spellOutEuros(p.value / 100);
    const aplica_a = scopeToHuman(p, catMap, prodMap);
    const termina = p.endsAt ? humanizeDate(p.endsAt) : null;
    const summary =
      `${descuento} ${aplica_a}` +
      (termina ? `, válida hasta ${termina}` : "") +
      `. Promoción: ${p.name}.`;
    return {
      slug: p.slug,
      name: p.name,
      kind: p.kind,
      value: p.value,
      badge: getBadgeText(p),
      scope: p.scope,
      starts_at: p.startsAt.toISOString(),
      ends_at: p.endsAt?.toISOString() ?? null,
      descuento,
      aplica_a,
      termina,
      summary,
    };
  });

  // Línea ready-to-read para Carmen (concatenación de todas las promos)
  const summary =
    items.length === 1
      ? `Sí, ahora mismo tenemos esta promoción activa: ${items[0]!.summary}`
      : `Sí, tenemos ${items.length} promociones activas. ${items.map((i) => i.summary).join(" Y la siguiente: ")}`;

  return NextResponse.json({
    ok: true,
    promotions: items,
    summary,
    tts_hint:
      "Lee la frase 'summary' tal cual. Si el cliente pregunta detalles, expande con cada item.",
  });
}

// ─── Humanización para TTS ─────────────────────────────────────────────────

function spellOutPercent(v: number): string {
  // Voz se siente más natural con el porcentaje expresado como "X por ciento"
  // que el numeral solo ("20%"), que Eleven a veces lee como "veinte"
  return `un descuento del ${v} por ciento`;
}

function spellOutEuros(eur: number): string {
  if (eur === Math.floor(eur)) return `un descuento fijo de ${eur} euros`;
  return `un descuento de ${eur.toFixed(2).replace(".", " coma ")} euros`;
}

function scopeToHuman(
  p: { scope: string; targetIds: string[] },
  catMap: Record<string, string>,
  prodMap: Record<string, string>,
): string {
  switch (p.scope) {
    case "ALL":
      return "en todo el catálogo";
    case "CATEGORY": {
      const names = p.targetIds.map((id) => catMap[id]).filter(Boolean);
      if (names.length === 0) return "en una selección de categorías";
      if (names.length === 1) return `en la categoría ${names[0]}`;
      return `en las categorías ${joinHuman(names)}`;
    }
    case "BRAND": {
      if (p.targetIds.length === 1) return `en productos de la marca ${p.targetIds[0]}`;
      return `en productos de las marcas ${joinHuman(p.targetIds)}`;
    }
    case "TAG":
      if (p.targetIds.length === 1) return `en productos etiquetados como "${p.targetIds[0]}"`;
      return `en productos con las etiquetas ${joinHuman(p.targetIds)}`;
    case "PRODUCT_LIST": {
      const names = p.targetIds.map((id) => prodMap[id]).filter(Boolean);
      if (names.length === 0) return "en una selección de productos";
      if (names.length === 1) return `en el producto ${names[0]}`;
      if (names.length <= 3) return `en los productos ${joinHuman(names)}`;
      return `en una selección de ${names.length} productos destacados`;
    }
    default:
      return "en parte del catálogo";
  }
}

function joinHuman(arr: string[]): string {
  if (arr.length === 0) return "";
  if (arr.length === 1) return arr[0]!;
  if (arr.length === 2) return `${arr[0]} y ${arr[1]}`;
  return `${arr.slice(0, -1).join(", ")} y ${arr[arr.length - 1]}`;
}

function humanizeDate(d: Date): string {
  // "el domingo 26 de mayo" en lugar de ISO. Carmen lo lee fluido.
  const days = [
    "domingo",
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
  ];
  const months = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  const day = days[d.getDay()];
  const dnum = d.getDate();
  const month = months[d.getMonth()];
  return `el ${day} ${dnum} de ${month}`;
}
