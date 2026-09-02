import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { proxyImageUrl } from "@/lib/proxy-image";
import { sendEmail, RESEND_TO_INTERNAL } from "@/lib/resend";
import { notifyAdmins } from "@/lib/notify-admin";
import { validateCoupon, claimCouponUse, releaseCouponUse, recordCouponRedemption } from "@/lib/coupons";
import { notifyTelegram, escapeTgHtml } from "@/lib/telegram";
import { readPartnerSlug, attachReferral } from "@/lib/referral";
import { readAttribution } from "@/lib/attribution";
import { rateLimit } from "@/lib/rate-limit";
import { loadActivePromotions } from "@/lib/promotions";
import { computeServerLinePricing, type ServerMarkingInput } from "@/lib/quote-server-pricing";
import type { Prisma } from "@prisma/client";
import { normalizeProductName } from "@/lib/product-name";
import { resolveSupplierOrderVariants } from "@/lib/supplier-order-variant";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://merchandising.startidea.es";

export const runtime = "nodejs";

const MarkingSchema = z.object({
  positionId: z.string().min(1).max(60),
  positionLabel: z.string().max(120).optional().nullable(),
  techniqueCode: z.string().min(1).max(40),
  techniqueName: z.string().max(120).optional().nullable(),
  numberOfColors: z.number().int().min(1).max(20).default(1),
  manipulationCode: z.string().max(2).optional().nullable(),
  // Área de impresión (cm²) de la posición. El recálculo server-side la pasa a
  // calculateMarkingCost para elegir el MISMO tramo AreaRange que vio la ficha
  // (sin ella cogería el tramo más barato y cobraría de menos).
  printAreaCm2: z.number().positive().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

const ItemSchema = z.object({
  productSlug: z.string().min(1),
  productRef: z.string().min(1),
  productName: z.string().min(1).max(500),
  primaryImageUrl: z.string().nullable().optional(),
  quantity: z.number().int().positive().max(1_000_000),
  variantId: z.string().nullable().optional(),
  variantSku: z.string().nullable().optional(), // pestañas legacy
  colorName: z.string().nullable().optional(),
  // Shape plano (deprecated, mantenido por compat)
  markingTechniqueCode: z.string().nullable().optional(),
  markingTechniqueName: z.string().nullable().optional(),
  markingPositionId: z.string().nullable().optional(),
  markingColours: z.number().int().min(1).max(10).nullable().optional(),
  markingComplexity: z.string().max(2).nullable().optional(),
  // Nuevo: array completo multi-marca
  markings: z.array(MarkingSchema).max(10).optional(),
  unitPriceClientCents: z.number().int().nullable().optional(),
  totalClientCents: z.number().int().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  customerLogoUrl: z.string().max(500).nullable().optional(),
  customerLogoFilename: z.string().max(200).nullable().optional(),
  customerLogoSize: z.number().int().nullable().optional(),
}).refine((item) => !(item.variantId && item.variantSku), {
  message: "Usa variantId o variantSku legacy, no ambos",
  path: ["variantId"],
});

const Schema = z.object({
  name: z.string().min(2).max(120),
  company: z.string().max(160).optional().or(z.literal("")),
  email: z.string().email(),
  phone: z.string().max(40).optional().or(z.literal("")),
  message: z.string().max(4000).optional().or(z.literal("")),
  deadline: z.string().max(120).optional().or(z.literal("")),
  source: z.string().max(80).optional(),
  couponCode: z.string().max(40).optional().or(z.literal("")),
  items: z.array(ItemSchema).min(1).max(40),
  // Si true y todos los items tienen precio, generamos paymentLinkToken
  // y devolvemos payUrl para redirigir al checkout Stripe (Apple/Google Pay).
  directPay: z.boolean().optional(),
  // Consentimiento para recibir el presupuesto por WhatsApp (opt-in RGPD).
  whatsappOptIn: z.boolean().optional(),
  // Datos fiscales opcionales (los manda el perfil del portal cliente si hay
  // sesión) — van directos a la factura del Payment.
  vatNumber: z.string().max(40).optional().or(z.literal("")),
  shippingAddress: z.string().max(600).optional().or(z.literal("")),
});

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type CartItem = z.infer<typeof ItemSchema>;
type NormalizedMarking = {
  positionId: string;
  positionLabel: string | null;
  techniqueCode: string;
  techniqueName: string | null;
  numberOfColors: number;
  manipulationCode: string | null;
  printAreaCm2: number | null;
  notes: string | null;
};

/**
 * Resuelve el shape efectivo de marcajes de un item: el array `markings` prima;
 * si no viene, se reconstruye desde los campos planos (compat legacy 1-marca).
 * Fuente ÚNICA — la usan tanto el recálculo server-side como la persistencia.
 */
function normalizeMarkings(it: CartItem): NormalizedMarking[] {
  if (it.markings && it.markings.length > 0) {
    return it.markings.map((m) => ({
      positionId: m.positionId,
      positionLabel: m.positionLabel ?? null,
      techniqueCode: m.techniqueCode,
      techniqueName: m.techniqueName ?? null,
      numberOfColors: m.numberOfColors,
      manipulationCode: m.manipulationCode ?? null,
      printAreaCm2: m.printAreaCm2 ?? null,
      notes: m.notes ?? null,
    }));
  }
  if (it.markingPositionId && it.markingTechniqueCode) {
    return [
      {
        positionId: it.markingPositionId,
        positionLabel: null,
        techniqueCode: it.markingTechniqueCode,
        techniqueName: it.markingTechniqueName || null,
        numberOfColors: it.markingColours || 1,
        manipulationCode: it.markingComplexity || null,
        printAreaCm2: null, // el shape plano legacy nunca trajo área
        notes: null,
      },
    ];
  }
  return [];
}

export async function POST(req: Request) {
  // Anti-spam: 10 leads/5 min por IP (suficiente para un equipo legítimo
  // navegando entre productos, prohibitivo para un bot enviando masivamente).
  const rl = rateLimit(req, { key: "cart-quote", max: 10, windowMs: 5 * 60_000 });
  if (!rl.ok) return rl.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;
  // Frontera navegador → servidor: los IDs públicos se validan contra el
  // producto y se convierten a SKU internos antes de precio, cupón o escritura.
  const canonicalVariants = await resolveSupplierOrderVariants(
    data.items.map((item) => ({
      productSlug: item.productSlug,
      variantId: item.variantId,
      variantSku: item.variantSku,
    })),
  );
  if (!canonicalVariants.ok) {
    return NextResponse.json(
      {
        error: "Hay un producto cuya variante no es válida.",
        code: canonicalVariants.code,
      },
      { status: 422 },
    );
  }
  const items = data.items.map((item, index) => {
    const canonical = canonicalVariants.items[index];
    return {
      ...item,
      productSlug: canonical.canonicalSlug,
      variantSku: canonical.variantId ? canonical.sku : null,
      colorName: canonical.colorName,
    };
  });
  const clientTotal = items.reduce((sum, it) => sum + (it.totalClientCents || 0), 0);

  // Pago directo: SOLO si el cliente lo pide y todos los items traen precio.
  const allPriced = items.every(
    (it) => typeof it.totalClientCents === "number" && it.totalClientCents > 0,
  );
  const wantsDirectPay = Boolean(data.directPay && allPriced);

  // ── RECÁLCULO SERVER-SIDE (autoritativo) ─────────────────────────────────
  // El total que llega del navegador (totalClientCents) NO es de fiar: si vamos
  // a COBRAR en Stripe (directPay) hay que recalcular cada línea en servidor con
  // el mismo pipeline que la ficha. Ese total es el que se cobra; el del cliente
  // solo vale para un presupuesto no vinculante.
  let serverLineTotals: (number | null)[] | null = null;
  let serverTotal: number | null = null;
  if (wantsDirectPay) {
    const activePromos = await loadActivePromotions();
    const recalced = await Promise.all(
      items.map((it) => {
        const serverMarkings: ServerMarkingInput[] = normalizeMarkings(it).map((m) => ({
          techniqueCode: m.techniqueCode,
          positionId: m.positionId,
          numberOfColours: m.numberOfColors,
          manipulationCode: m.manipulationCode,
          // Sin el área, las técnicas AreaRange cogerían el tramo más barato
          // y el checkout cobraría MENOS que la ficha (revisión 2026-07-08).
          // (El servidor prioriza el área de la BD; esta es solo pista.)
          printAreaCm2: m.printAreaCm2,
        }));
        return computeServerLinePricing(
          { productSlug: it.productSlug, quantity: it.quantity, markings: serverMarkings },
          activePromos,
        );
      }),
    );
    if (recalced.every((r) => r.ok)) {
      serverLineTotals = recalced.map((r) => (r.ok ? r.totalClientCents : null));
      const computed = serverLineTotals.reduce<number>((s, v) => s + (v ?? 0), 0);
      serverTotal = computed;
      // Señal de fraude/bug: el navegador envió un total que no cuadra con el
      // servidor. No bloquea (cobramos el del servidor), pero deja rastro.
      if (Math.abs(computed - clientTotal) > Math.max(100, clientTotal * 0.02)) {
        console.warn(
          `[cart-quote] total cliente ${clientTotal} ≠ servidor ${computed} — se cobra el del servidor`,
        );
      }
    } else {
      // Alguna línea no se pudo recalcular → NO cobramos un importe no verificado.
      // Degradamos a presupuesto normal (sin payment link) y avisamos al admin.
      const reasons = recalced.filter((r) => !r.ok).map((r) => (r.ok ? "" : r.reason));
      console.error("[cart-quote] recálculo server-side falló, degrado directPay:", reasons);
      void notifyTelegram(
        `⚠️ <b>cart-quote: pago directo degradado a presupuesto</b>\n` +
          `No se pudo recalcular en servidor: ${reasons.join(" · ").slice(0, 300)}`,
      ).catch((e) =>
        console.error("[cart-quote] notifyTelegram (degradación) falló:", e instanceof Error ? e.message : e),
      );
    }
  }

  // Total autoritativo: servidor para pago directo verificado, cliente para
  // presupuesto normal (no vinculante, no se cobra).
  const total = serverTotal ?? clientTotal;

  const couponCode = (data.couponCode || "").trim();
  let coupon:
    | {
        id: string;
        code: string;
        label: string;
        discountCents: number;
      }
    | null = null;
  if (couponCode) {
    const validation = await validateCoupon(couponCode, total);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.reason }, { status: 400 });
    }
    // RESERVA el uso ANTES de restar nada. validateCoupon es una lectura, no un
    // cerrojo: dos peticiones concurrentes la pasan las dos. Si el descuento se
    // horneara en acceptedTotalCents antes de reservar, la perdedora de la
    // carrera se quedaría igualmente con un carrito rebajado y cobrable.
    if (await claimCouponUse(validation.coupon.id)) {
      coupon = {
        id: validation.coupon.id,
        code: validation.coupon.code,
        label: validation.coupon.label,
        discountCents: validation.discountCents,
      };
    } else {
      // Cupo agotado entre validar y reservar. El carrito sigue adelante SIN
      // descuento (y ahora es verdad, no sólo el comentario): mejor cobrar el
      // precio íntegro que regalar un uso que ya no existe.
      void notifyTelegram(
        `⚠️ Cupón agotado en carrera: ${escapeTgHtml(validation.coupon.code)} no se aplicó a un carrito nuevo — el cliente pagó sin descuento, revisar si procede compensar`,
      ).catch(() => {});
    }
  }
  const payableTotal = Math.max(0, total - (coupon?.discountCents || 0));

  // directPay real: además de pedirlo, el recálculo server-side tuvo que cuadrar
  // (serverTotal !== null). Si degradó, es un presupuesto, no un cobro.
  const directPay = Boolean(wantsDirectPay && serverTotal !== null && payableTotal > 0);
  const paymentLinkToken = directPay
    ? `pay_${randomBytes(20).toString("base64url")}`
    : null;

  // Atribución de primer toque (cookie merch_attrib) → de qué canal vino la venta.
  const attribution = readAttribution(req);

  const cart = await prisma.cartQuote.create({
    data: {
      name: data.name,
      company: data.company || null,
      email: data.email,
      phone: data.phone || null,
      whatsappOptIn: data.whatsappOptIn ?? false,
      message: data.message || null,
      deadline: data.deadline || null,
      vatNumber: data.vatNumber || null,
      shippingAddress: data.shippingAddress || null,
      source: data.source || (directPay ? "carrito-pago-directo" : "carrito"),
      estimatedTotalCents: payableTotal,
      internalNotes: coupon
        ? `Cupón aplicado: ${coupon.code} (${coupon.label}) · descuento ${(coupon.discountCents / 100).toFixed(2)} €`
        : undefined,
      // Pago directo: status SENT (admin verá que ya está en checkout),
      // depósito 100% por defecto, token presente. acceptedTotalCents
      // requerido por /api/pay/[token]/checkout para crear Stripe Session.
      status: directPay ? "SENT" : "NEW",
      utm: attribution
        ? (Object.fromEntries(
            Object.entries(attribution).filter(([, v]) => v != null),
          ) as unknown as Prisma.InputJsonValue)
        : undefined,
      paymentLinkToken,
      paymentLinkSentAt: directPay ? new Date() : null,
      depositPercent: directPay ? 100 : null,
      acceptedTotalCents: directPay ? payableTotal : null,
      items: {
        create: items.map((it, i) => {
          // Shape efectivo de marcajes (array prima; si no, campos planos).
          const markingsArr = normalizeMarkings(it);
          const first = markingsArr[0];
          // Cuando hubo recálculo server-side (pago directo verificado), persistimos
          // el precio AUTORITATIVO, no el que envió el navegador.
          const lineTotal =
            serverLineTotals != null ? serverLineTotals[i] : (it.totalClientCents ?? null);
          const lineUnit =
            serverLineTotals != null && lineTotal != null && it.quantity > 0
              ? Math.round(lineTotal / it.quantity)
              : (it.unitPriceClientCents ?? null);
          return {
            productSlug: it.productSlug,
            productRef: it.productRef,
            productName: normalizeProductName(it.productName),
            primaryImageUrl: proxyImageUrl(it.primaryImageUrl), // nunca URL cruda de proveedor
            quantity: it.quantity,
            variantSku: it.variantSku ?? null,
            colorName: it.colorName ?? null,
            // Shape plano: espejo del primer marcaje
            markingTechniqueCode: first?.techniqueCode ?? null,
            markingTechniqueName: first?.techniqueName ?? null,
            markingPositionId: first?.positionId ?? null,
            markingColours: first?.numberOfColors ?? null,
            markingComplexity: first?.manipulationCode ?? it.markingComplexity ?? null,
            unitPriceClientCents: lineUnit,
            totalClientCents: lineTotal,
            notes: it.notes ?? null,
            customerLogoUrl: it.customerLogoUrl ?? null,
            customerLogoFilename: it.customerLogoFilename ?? null,
            customerLogoSize: it.customerLogoSize ?? null,
            // Relación N marcas
            markings: markingsArr.length > 0 ? {
              create: markingsArr.map((m, idx) => ({
                positionId: m.positionId,
                positionLabel: m.positionLabel ?? null,
                techniqueCode: m.techniqueCode,
                techniqueName: m.techniqueName ?? null,
                numberOfColors: m.numberOfColors,
                manipulationCode: m.manipulationCode ?? null,
                printAreaCm2: m.printAreaCm2 ?? null,
                notes: m.notes ?? null,
                order: idx,
              })),
            } : undefined,
          };
        }),
      },
    },
    include: { items: { include: { markings: { orderBy: { order: "asc" } } } } },
  }).catch(async (e) => {
    // El uso del cupón ya está reservado: si el carrito no llega a existir hay
    // que devolverlo, o quemaríamos un uso que nadie disfrutó.
    if (coupon) await releaseCouponUse(coupon.id).catch(() => {});
    throw e;
  });

  // Si este email tenía un "carrito guardado" (captura temprana), archivarlo:
  // la cotización real lo sustituye y evita que el drip persiga dos veces.
  void prisma.cartQuote
    .updateMany({
      where: {
        email: data.email,
        source: "carrito-guardado",
        status: "IN_PROGRESS",
        id: { not: cart.id },
      },
      data: { status: "ARCHIVED" },
    })
    .catch((e) =>
      console.error("[cart-quote] archivar carrito-guardado falló:", e instanceof Error ? e.message : e),
    );

  // Notificar por email (best-effort, no bloquea respuesta).
  // sendEmail dispara alerta Telegram automática si Resend falla
  // (cobertura del bug 2026-05-16 donde el silencio dejó emails sin enviar).
  void Promise.all([
    sendEmail({
      to: RESEND_TO_INTERNAL,
      replyTo: data.email,
      subject: `[Carrito] ${data.name}${data.company ? " · " + data.company : ""} · ${EUR.format(payableTotal / 100)}`,
      html: internalCartHtml(cart),
      context: `cart-quote internal · ${cart.id}`,
    }),
    sendEmail({
      to: data.email,
      subject: `${data.name.split(" ")[0]}, recibimos tu cotización con ${cart.items.length} producto${cart.items.length === 1 ? "" : "s"}`,
      html: clientCartHtml(cart),
      context: `cart-quote client · ${cart.id}`,
    }),
  ]);

  // Si hay referral activo (cookie o querystring), asociar partner
  const refSlug = readPartnerSlug(req);
  if (refSlug) {
    void attachReferral(cart.id, refSlug).catch((e) =>
      console.error("[cart-quote] attachReferral falló:", e instanceof Error ? e.message : e),
    );
  }

  // Contabilidad de la redención. El uso YA se reservó antes de calcular el
  // importe (claimCouponUse), así que aquí no se consume nada más: sólo se deja
  // constancia de qué carrito gastó qué cupón y con cuánto descuento.
  if (coupon) {
    try {
      await recordCouponRedemption(cart.id, coupon.id, coupon.discountCents);
    } catch (e) {
      console.error("[cart-quote] recordCouponRedemption falló:", e instanceof Error ? e.message : e);
      void notifyTelegram(
        `⚠️ Redención de cupón sin registrar: carrito ${cart.id} se cobró con el descuento ${escapeTgHtml(coupon.code ?? coupon.id)} pero no quedó anotado — revisar contabilidad`,
      ).catch(() => {});
    }
  }

  // Notificación push al equipo (fire-and-forget)
  void notifyAdmins({
    title: `Nuevo carrito · ${data.name}`,
    body: `${cart.items.length} producto${cart.items.length === 1 ? "" : "s"} · ${EUR.format(payableTotal / 100)}${data.company ? ` · ${data.company}` : ""}`,
    url: `/admin/cart-quotes/${cart.id}`,
    tag: `cart-${cart.id}`,
    requireInteraction: true,
  }).catch((err) => console.error("[cart-quote push]", err));

  void notifyTelegram(
    `🛒 <b>Nuevo carrito</b>\n${escapeTgHtml(data.name)}${data.company ? ` · ${escapeTgHtml(data.company)}` : ""}\n${cart.items.length} productos · <b>${EUR.format(payableTotal / 100)}</b>\n📧 ${escapeTgHtml(data.email)}`,
  ).catch((e) =>
    console.error("[cart-quote] notifyTelegram falló:", e instanceof Error ? e.message : e),
  );

  return NextResponse.json({
    ok: true,
    id: cart.id,
    items: cart.items.length,
    payUrl: paymentLinkToken ? `${SITE_URL}/pay/${paymentLinkToken}` : null,
  });
}

// Helper inline para traducir códigos de zona en emails. No importamos
// el helper TS para mantener este archivo autocontenido (los emails se
// renderizan server-side y la lib funciona bien aquí, pero un fallback
// inline garantiza que no se rompa si hay un código no mapeado).
function humanZone(code: string | null): string {
  if (!code) return "";
  return code
    .toUpperCase()
    .replace(/\s+DO\s+[A-Z0-9]+/g, "")
    .replace(/\s+DA\s+[A-Z0-9]+/g, "")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderMarkings(it: {
  markingTechniqueName: string | null;
  markingPositionId: string | null;
  markingColours: number | null;
  markings?: Array<{ techniqueName: string | null; techniqueCode?: string; positionId: string; numberOfColors: number }>;
}): string {
  // Si hay array markings con más de 1, renderizamos lista. Si 1 o 0, usamos campos planos.
  // `techniqueName` (max 120) y `positionId` (max 60) llegan en el MISMO body
  // público que `name` o `message`, y esta celda acaba en el correo del buzón
  // interno: es exactamente el agujero que se cerró para el resto de campos,
  // sólo que con otro nombre (por eso el guard, que busca `\bname\b`, no lo ve).
  // `humanZone` recolora y capitaliza el código, pero no toca los `<`.
  const list = it.markings && it.markings.length > 1
    ? it.markings.map((m) => `${escapeHtml(m.techniqueName || m.techniqueCode || "—")} en ${escapeHtml(humanZone(m.positionId))}${m.numberOfColors > 1 ? ` · ${m.numberOfColors} col.` : ""}`)
    : it.markingTechniqueName
      ? [`${escapeHtml(it.markingTechniqueName)} en ${escapeHtml(humanZone(it.markingPositionId))}${it.markingColours && it.markingColours > 1 ? ` · ${it.markingColours} col.` : ""}`]
      : [];
  if (list.length === 0) return "—";
  if (list.length === 1) return list[0];
  return list.map((s, i) => `<span style="display:block;font-size:12px;color:#444;">${i + 1}. ${s}</span>`).join("");
}

type CartItemRow = {
  productName: string;
  productRef: string;
  quantity: number;
  markingTechniqueName: string | null;
  markingPositionId: string | null;
  markingColours: number | null;
  totalClientCents: number | null;
  markings?: Array<{
    techniqueName: string | null;
    techniqueCode?: string;
    positionId: string;
    numberOfColors: number;
  }>;
};

/**
 * Esta ruta es PÚBLICA (sin sesión ni secreto, sólo rate limit) y el HTML que
 * monta más abajo va al buzón interno del equipo (RESEND_TO_INTERNAL). Todo lo
 * que entra en él —`name`, `company`, `phone`, `deadline`, `message`, y el
 * `productName`/`productRef` de cada línea— lo escribe quien rellena el
 * formulario, y el schema sólo le mira la longitud. Sin escapar, un `<a
 * href="...">Ver pedido</a>` metido en el nombre sale como enlace real en el
 * correo que abre quien atiende los pedidos: phishing dirigido, con nuestro
 * remitente. La ruta hermana `save-for-later` ya escapaba así desde siempre.
 */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Dentro de un atributo no basta con `escapeHtml`: una comilla cierra el valor
 * y deja meter atributos nuevos (`" onclick="` o un `href` distinto) sin usar
 * ningún `<`. Por eso el email del `mailto:` pasa por aquí y no por `escapeHtml`.
 */
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * `phone` es texto libre de 40 caracteres: nada impide mandar
 * `x" href="https://banco-falso.example` y quedarse con el `<a>` del equipo.
 * Escapar no arregla un esquema de URL, así que sólo montamos el `tel:` cuando
 * el valor es reconociblemente un teléfono (dígitos, `+`, espacios, guiones,
 * puntos y paréntesis). Si no lo es, el texto sale igual pero sin enlace.
 */
function telHref(phone: string): string | null {
  return /^[0-9+\-.\s()]{3,40}$/.test(phone) ? `tel:${phone.replace(/[^0-9+]/g, "")}` : null;
}

function internalCartHtml(cart: { id: string; name: string; company: string | null; email: string; phone: string | null; message: string | null; deadline: string | null; estimatedTotalCents: number | null; items: CartItemRow[] }): string {
  const rows = cart.items
    .map(
      (it) => `
      <tr>
        <td style="padding:12px;border-bottom:1px solid #E8E2D5;">${escapeHtml(it.productName)}<br><small style="color:#6b6b6b">Ref. ${escapeHtml(it.productRef)}</small></td>
        <td style="padding:12px;border-bottom:1px solid #E8E2D5;text-align:center;font-weight:600;">${it.quantity}</td>
        <td style="padding:12px;border-bottom:1px solid #E8E2D5;font-size:13px;color:#444;">${renderMarkings(it)}</td>
        <td style="padding:12px;border-bottom:1px solid #E8E2D5;text-align:right;font-weight:600;">${it.totalClientCents != null ? EUR.format(it.totalClientCents / 100) : "—"}</td>
      </tr>`,
    )
    .join("");

  // El orden importa: escapamos PRIMERO y convertimos los saltos DESPUÉS. Al
  // revés, el escape convertiría en `&lt;br&gt;` los `<br>` recién metidos, y
  // habría que dejar el `<` crudo — justo el agujero que estamos cerrando.
  const mensajeHtml = cart.message ? escapeHtml(cart.message).replace(/\n/g, "<br>") : "";
  const tel = cart.phone ? telHref(cart.phone) : null;

  return `
    <div style="font-family:Helvetica,Arial,sans-serif;background:#F4EFE6;padding:24px 12px;">
      <div style="max-width:680px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;color:#2A2A2A;">
        <div style="background:#2A2A2A;padding:20px 24px;">
          <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(244,239,230,0.6);">— Admin · Cotización nueva</p>
          <h1 style="margin:6px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;color:#FFFFFF;">${escapeHtml(cart.name)}${cart.company ? ` · ${escapeHtml(cart.company)}` : ""}</h1>
        </div>
        <div style="padding:24px;">
          <p style="margin:0;font-size:14px;color:#444;">
            <a href="mailto:${escapeAttr(cart.email)}" style="color:#E63E73;text-decoration:none;">${escapeHtml(cart.email)}</a>${cart.phone ? ` · ${tel ? `<a href="${escapeAttr(tel)}" style="color:#E63E73;text-decoration:none;">${escapeHtml(cart.phone)}</a>` : escapeHtml(cart.phone)}` : ""}
          </p>
          ${cart.deadline ? `<p style="margin:8px 0 0;font-size:14px;color:#444;">⏰ Fecha límite cliente: <strong>${escapeHtml(cart.deadline)}</strong></p>` : ""}
          ${mensajeHtml ? `<div style="margin-top:16px;background:#F4EFE6;border-left:3px solid #E63E73;padding:14px 16px;border-radius:8px;font-size:14px;line-height:1.5;color:#2A2A2A;">${mensajeHtml}</div>` : ""}

          <table style="width:100%;border-collapse:collapse;margin-top:24px;">
            <thead>
              <tr style="background:#F4EFE6;">
                <th style="padding:10px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#6b6b6b;">Producto</th>
                <th style="padding:10px 12px;text-align:center;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#6b6b6b;">Cant.</th>
                <th style="padding:10px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#6b6b6b;">Marcaje</th>
                <th style="padding:10px 12px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#6b6b6b;">Total</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr><td colspan="3" style="padding:16px 12px;text-align:right;font-weight:600;font-size:13px;color:#6b6b6b;">Total estimado:</td>
              <td style="padding:16px 12px;text-align:right;font-weight:700;font-size:20px;color:#E63E73;">${cart.estimatedTotalCents != null ? EUR.format(cart.estimatedTotalCents / 100) : "—"}</td></tr>
            </tfoot>
          </table>

          <p style="margin:32px 0 0;text-align:center;">
            <a href="${SITE_URL}/admin/cart-quotes/${cart.id}" style="display:inline-block;background:#2A2A2A;color:#FFFFFF;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:14px;font-weight:600;">Abrir en admin →</a>
          </p>
          <p style="margin-top:24px;color:#a09e98;font-size:11px;">ID interno: <code style="background:#F4EFE6;padding:2px 6px;border-radius:4px;">${cart.id.slice(0, 12)}</code></p>
        </div>
      </div>
    </div>`;
}

function clientCartHtml(cart: { id: string; name: string; company: string | null; estimatedTotalCents: number | null; items: CartItemRow[] }): string {
  const firstName = cart.name.split(" ")[0] || cart.name;
  const itemsHtml = cart.items
    .map(
      (it) => {
        // Este correo lo lee el propio cliente, así que aquí no hay a quién
        // suplantar; pero `techniqueName` y `positionId` los escribe él en el
        // mismo body público (MarkingSchema: texto libre de 120 y 60), y sin
        // escapar un "&" o un "<" le rompen la maquetación de su propio email.
        // Va como comentario de JS, no HTML: dentro del template viajaría en el
        // correo enviado.
        const marksText = it.markings && it.markings.length > 1
          ? it.markings
              .map((m) => `${escapeHtml(m.techniqueName || "")} en ${escapeHtml(humanZone(m.positionId))}`)
              .join(" · ")
          : it.markingTechniqueName
            ? `${escapeHtml(it.markingTechniqueName)} en ${escapeHtml(humanZone(it.markingPositionId))}`
            : "sin marcaje";
        return `
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #E8E2D5;font-size:14px;line-height:1.4;">
          <strong style="color:#2A2A2A;">${escapeHtml(it.productName)}</strong><br>
          <span style="color:#6b6b6b;font-size:12px;">
            ${it.quantity} uds · ${marksText}
          </span>
        </td>
        <td style="padding:14px 0;border-bottom:1px solid #E8E2D5;text-align:right;font-size:14px;font-weight:600;color:#2A2A2A;white-space:nowrap;vertical-align:top;">
          ${it.totalClientCents != null ? EUR.format(it.totalClientCents / 100) : "—"}
        </td>
      </tr>`;
      },
    )
    .join("");

  return `
    <div style="font-family:Helvetica,Arial,sans-serif;background:#F4EFE6;padding:32px 16px;">
      <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;color:#2A2A2A;">

        <!-- Header con eyebrow + título grande -->
        <div style="padding:32px 32px 24px;">
          <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b;">— Cotización recibida</p>
          <h1 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15;color:#2A2A2A;">
            Gracias ${firstName}.<br>
            <span style="color:#a09e98;">La estamos revisando.</span>
          </h1>
          <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#444;">
            Un humano de TodoMerchandising tiene tu petición en pantalla ahora mismo.
            En menos de <strong>24 horas laborables</strong> recibirás precio cerrado,
            mockup técnico y plazo de entrega.
          </p>
        </div>

        <!-- Items -->
        <div style="padding:0 32px;">
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b;">— Tu cotización</p>
          <table style="width:100%;border-collapse:collapse;border-top:1px solid #E8E2D5;">
            ${itemsHtml}
            ${cart.estimatedTotalCents ? `
            <tr>
              <td style="padding:18px 0 0;font-size:13px;color:#6b6b6b;text-transform:uppercase;letter-spacing:0.1em;">Total orientativo</td>
              <td style="padding:18px 0 0;text-align:right;font-size:22px;font-weight:700;color:#E63E73;font-family:Georgia,serif;">
                ${EUR.format(cart.estimatedTotalCents / 100)}
              </td>
            </tr>
            <tr>
              <td colspan="2" style="padding:4px 0 0;font-size:11px;color:#a09e98;line-height:1.5;">
                Precio orientativo. El presupuesto cerrado incluirá marcaje, plazo y transporte definitivos.
              </td>
            </tr>
            ` : ""}
          </table>
        </div>

        <!-- Qué pasa ahora -->
        <div style="margin:32px;padding:24px;background:#F4EFE6;border-radius:12px;">
          <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b;">— Qué pasa ahora</p>
          <ol style="margin:12px 0 0;padding-left:20px;font-size:14px;line-height:1.7;color:#2A2A2A;">
            <li><strong>Revisamos tu brief</strong> y producto a producto contrastamos stock, técnica de marcaje y plazo viable.</li>
            <li><strong>Te enviamos cotización cerrada</strong> con mockup técnico del fabricante, precio final y plazo de entrega.</li>
            <li>Cuando das el OK, <strong>producimos y entregamos</strong> — todo en Centros Especiales de Empleo y talleres certificados.</li>
          </ol>
        </div>

        <!-- CTAs / contacto -->
        <div style="padding:0 32px 32px;text-align:center;">
          <p style="margin:0 0 16px;font-size:14px;color:#444;">
            ¿Quieres añadir algo? Simplemente <strong>responde a este email</strong>
            o escríbenos directo:
          </p>
          <p style="margin:0;font-size:14px;line-height:2;">
            <a href="https://wa.me/34627305162" style="color:#2A2A2A;text-decoration:none;border-bottom:1px solid #E63E73;padding-bottom:1px;">WhatsApp +34 627 305 162</a><br>
            <a href="mailto:pedidos@startidea.es" style="color:#2A2A2A;text-decoration:none;border-bottom:1px solid #E63E73;padding-bottom:1px;">pedidos@startidea.es</a>
          </p>
        </div>

        <!-- Footer -->
        <div style="background:#2A2A2A;padding:24px 32px;color:rgba(244,239,230,0.7);font-size:11px;line-height:1.6;">
          <p style="margin:0;color:#FFFFFF;font-family:Georgia,serif;font-size:16px;">
            todo<span style="color:#E63E73;">merchandising</span>
          </p>
          <p style="margin:8px 0 0;">
            Una iniciativa de Startidea · Agencia de Innovación Social<br>
            STARTIDEA MALAGA SL · CIF B19583632 · C/ Conde Cifuentes, 33 — 18005 Granada<br>
            Tu cotización: <code style="background:rgba(244,239,230,0.1);padding:1px 5px;border-radius:3px;color:rgba(244,239,230,0.85);">${cart.id.slice(0, 8)}</code>
          </p>
        </div>
      </div>
    </div>`;
}
