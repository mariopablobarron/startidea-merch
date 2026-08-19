import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { escapeHtml } from "@/lib/email-templates";
import { computeCotizacion } from "@/lib/cotizar-core";
import { createProposalFromCotizacion } from "@/lib/proposal-from-cotizacion";
import { sendEmail } from "@/lib/resend";
import { notifyAdmins } from "@/lib/notify-admin";
import { notifyTelegram, escapeTgHtml } from "@/lib/telegram";
import { publicProductName } from "@/lib/product-name";
import { resolveSupplierOrderVariants } from "@/lib/supplier-order-variant";
import {
  canonicalizeQuoteRequestVariantSelection,
  validateQuoteRequestVariantDistribution,
} from "@/lib/quote-request-variant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://merchandising.startidea.es";

/**
 * POST /api/quote-request-product (PÚBLICO)
 *
 * Un visitante pide presupuesto de UN producto desde su ficha. Si el producto
 * se puede tarificar, se crea un BORRADOR de propuesta formal (status "draft")
 * que el admin revisa y envía con 1 clic desde /admin/propuestas. El cliente
 * recibe una confirmación SIN precio (revisión humana antes de enviar precio).
 *
 * NO expone coste/proveedor: la propuesta usa publicRef (STM-XXX) y el PVP.
 */
const VariantLineSchema = z.object({
  variantId: z.string().min(1).max(160).optional(),
  sku: z.string().min(1).max(160).optional(), // clientes legacy
  colorName: z.string().max(160).optional().nullable(),
  size: z.string().min(1).max(80),
  quantity: z.number().int().min(1).max(100_000),
}).refine((line) => Boolean(line.variantId) !== Boolean(line.sku), {
  message: "La línea necesita una única identidad de variante",
});

const Schema = z.object({
  slug: z.string().min(1).max(160),
  qty: z.number().int().min(1).max(100_000),
  email: z.string().email().max(200),
  name: z.string().max(120).optional().nullable(),
  company: z.string().max(160).optional().nullable(),
  variantId: z.string().min(1).max(160).optional().nullable(),
  variantSku: z.string().min(1).max(160).optional().nullable(),
  colorName: z.string().max(160).optional().nullable(),
  size: z.string().max(80).optional().nullable(),
  variantLines: z
    .array(VariantLineSchema)
    .max(40)
    .optional(),
  // marcaje opcional (si el visitante lo configuró en la ficha)
  techniqueCode: z.string().min(1).max(20).optional(),
  numberOfColours: z.number().int().min(1).max(12).optional(),
  printAreaCm2: z.number().min(0).max(100_000).optional(),
  manipulationCode: z.string().min(1).max(2).optional(),
}).refine((data) => !(data.variantId && data.variantSku), {
  message: "Usa variantId o variantSku legacy, no ambos",
  path: ["variantId"],
});

export async function POST(req: Request) {
  const rl = rateLimit(req, { key: "quote-request-product", max: 5, windowMs: 10 * 60_000 });
  if (!rl.ok) return rl.response;

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const d = parsed.data;

  const distributionError = validateQuoteRequestVariantDistribution(
    d.qty,
    d.variantId,
    d.variantSku,
    d.variantLines,
  );
  if (distributionError) {
    return NextResponse.json(
      { error: distributionError },
      { status: 400 },
    );
  }

  const requestedReferences = d.variantLines?.length
    ? d.variantLines.map((line) => line.variantId ?? line.sku!)
    : d.variantId
      ? [d.variantId]
      : d.variantSku
        ? [d.variantSku]
      : [];
  let canonicalVariants: Array<{
    variantId: string;
    sku: string;
    colorName: string | null;
    size: string | null;
  }> = [];
  if (requestedReferences.length > 0) {
    const checked = await resolveSupplierOrderVariants(
      d.variantLines?.length
        ? d.variantLines.map((line) => ({
            productSlug: d.slug,
            variantId: line.variantId,
            variantSku: line.sku,
          }))
        : [{
            productSlug: d.slug,
            variantId: d.variantId,
            variantSku: d.variantSku,
          }],
    );
    if (!checked.ok || checked.items.some((item) => !item.variantId)) {
      return NextResponse.json(
        {
          error: "La variante solicitada no pertenece al producto.",
          ...(!checked.ok ? { code: checked.code, detail: checked.error } : {}),
        },
        { status: 422 },
      );
    }
    canonicalVariants = checked.items.map((item) => ({
      variantId: item.variantId!,
      sku: item.sku,
      colorName: item.colorName,
      size: item.size,
    }));
  }

  const variantSelection = canonicalizeQuoteRequestVariantSelection(
    d,
    canonicalVariants,
  );
  if (!variantSelection) {
    return NextResponse.json(
      { error: "No se pudo reconstruir la variante solicitada." },
      { status: 422 },
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const ua = req.headers.get("user-agent") || null;

  // Intentar tarificar y crear BORRADOR. Si no se puede, se avisa igual al
  // admin para gestión manual (no bloqueamos al cliente).
  const quote = await computeCotizacion({
    ref: d.slug,
    qty: d.qty,
    techniqueCode: d.techniqueCode,
    numberOfColours: d.numberOfColours,
    printAreaCm2: d.printAreaCm2,
    manipulationCode: d.manipulationCode,
  });

  let proposalNumber: string | null = null;
  let productName = d.slug;
  const variantSummary = variantSelection.summary;
  if (quote.ok && quote.pvp.baseTotal > 0) {
    productName = publicProductName(quote.product.name);
    const created = await createProposalFromCotizacion({
      quote,
      email: d.email,
      name: d.name ?? null,
      company: d.company ?? null,
      status: "draft", // revisión humana antes de enviar
      send: false,
      ip,
      ua,
      variantSelection,
    });
    if (created.ok) proposalNumber = created.proposalNumber;
  }

  // Confirmación al cliente (SIN precio — el precio se lo enviamos tras revisar)
  void sendEmail({
    to: d.email,
    subject: "Hemos recibido tu solicitud de presupuesto · TodoMerchandising",
    context: "quote-request-product · client confirm",
    html: `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#222;max-width:560px;">
      <p>Hola${d.name ? ` ${escapeHtml(d.name)}` : ""},</p>
      <p>Hemos recibido tu solicitud de presupuesto para <strong>${productName}</strong> (${d.qty} uds). Estamos preparándolo y te enviaremos el precio cerrado en menos de 24&nbsp;h laborables.</p>
      <p>Si quieres adelantar algo (logo, plazo, dudas), respóndenos a este correo.</p>
      <p style="margin-top:20px;color:#888;font-size:13px;">TodoMerchandising · Startidea Málaga SL<br>pedidos@startidea.es · +34 958 045 789</p>
    </div>`,
  });

  // Aviso al admin con el borrador (o para gestión manual si no se pudo tarificar)
  void notifyTelegram(
      `🧾 <b>Solicitud de presupuesto web</b>\n` +
      `Producto: ${escapeTgHtml(productName)} ×${d.qty}\n` +
      `Variante: ${escapeTgHtml(variantSummary)}\n` +
      `Cliente: ${escapeTgHtml(d.name || d.email)}${d.company ? ` (${escapeTgHtml(d.company)})` : ""}\n` +
      (proposalNumber
        ? `📄 Borrador ${proposalNumber} listo — revisa y envía en /admin/propuestas`
        : `⚠️ Sin precio automático — gestionar manualmente`),
  ).catch((e) =>
    console.error("[quote-request-product] notifyTelegram falló:", e instanceof Error ? e.message : e),
  );
  void notifyAdmins({
    title: "Nueva solicitud de presupuesto",
    body: `${productName} ×${d.qty} · ${variantSummary} · ${d.email}${proposalNumber ? ` · borrador ${proposalNumber}` : ""}`,
    url: `${SITE_URL}/admin/propuestas`,
  }).catch((e) =>
    console.error("[quote-request-product] notifyAdmins falló:", e instanceof Error ? e.message : e),
  );

  return NextResponse.json({ ok: true });
}
