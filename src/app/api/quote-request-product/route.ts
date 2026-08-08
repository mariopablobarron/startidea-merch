import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { computeCotizacion } from "@/lib/cotizar-core";
import { createProposalFromCotizacion } from "@/lib/proposal-from-cotizacion";
import { sendEmail } from "@/lib/resend";
import { notifyAdmins } from "@/lib/notify-admin";
import { notifyTelegram, escapeTgHtml } from "@/lib/telegram";
import { publicProductName } from "@/lib/product-name";

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
const Schema = z.object({
  slug: z.string().min(1).max(160),
  qty: z.number().int().min(1).max(100_000),
  email: z.string().email().max(200),
  name: z.string().max(120).optional().nullable(),
  company: z.string().max(160).optional().nullable(),
  // marcaje opcional (si el visitante lo configuró en la ficha)
  techniqueCode: z.string().min(1).max(20).optional(),
  numberOfColours: z.number().int().min(1).max(12).optional(),
  printAreaCm2: z.number().min(0).max(100_000).optional(),
  manipulationCode: z.string().min(1).max(2).optional(),
});

export async function POST(req: Request) {
  const rl = rateLimit(req, { key: "quote-request-product", max: 5, windowMs: 10 * 60_000 });
  if (!rl.ok) return rl.response;

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const d = parsed.data;

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
    });
    if (created.ok) proposalNumber = created.proposalNumber;
  }

  // Confirmación al cliente (SIN precio — el precio se lo enviamos tras revisar)
  void sendEmail({
    to: d.email,
    subject: "Hemos recibido tu solicitud de presupuesto · TodoMerchandising",
    context: "quote-request-product · client confirm",
    html: `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#222;max-width:560px;">
      <p>Hola${d.name ? ` ${d.name}` : ""},</p>
      <p>Hemos recibido tu solicitud de presupuesto para <strong>${productName}</strong> (${d.qty} uds). Estamos preparándolo y te enviaremos el precio cerrado en menos de 24&nbsp;h laborables.</p>
      <p>Si quieres adelantar algo (logo, plazo, dudas), respóndenos a este correo.</p>
      <p style="margin-top:20px;color:#888;font-size:13px;">TodoMerchandising · Startidea Málaga SL<br>pedidos@startidea.es · +34 958 045 789</p>
    </div>`,
  });

  // Aviso al admin con el borrador (o para gestión manual si no se pudo tarificar)
  void notifyTelegram(
    `🧾 <b>Solicitud de presupuesto web</b>\n` +
      `Producto: ${escapeTgHtml(productName)} ×${d.qty}\n` +
      `Cliente: ${escapeTgHtml(d.name || d.email)}${d.company ? ` (${escapeTgHtml(d.company)})` : ""}\n` +
      (proposalNumber
        ? `📄 Borrador ${proposalNumber} listo — revisa y envía en /admin/propuestas`
        : `⚠️ Sin precio automático — gestionar manualmente`),
  ).catch((e) =>
    console.error("[quote-request-product] notifyTelegram falló:", e instanceof Error ? e.message : e),
  );
  void notifyAdmins({
    title: "Nueva solicitud de presupuesto",
    body: `${productName} ×${d.qty} · ${d.email}${proposalNumber ? ` · borrador ${proposalNumber}` : ""}`,
    url: `${SITE_URL}/admin/propuestas`,
  }).catch((e) =>
    console.error("[quote-request-product] notifyAdmins falló:", e instanceof Error ? e.message : e),
  );

  return NextResponse.json({ ok: true });
}
