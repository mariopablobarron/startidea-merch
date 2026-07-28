import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronSecret } from "@/lib/auth";
import { resend, RESEND_FROM } from "@/lib/resend";
import { withCronLock } from "@/lib/cron-lock";
import { wrapCronHandler } from "@/lib/cron-tracking";
import { abandonedCartDripEmail } from "@/lib/email-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

/**
 * Drip de carritos abandonados — 3 emails automáticos + auto-archivo.
 *
 *   D1  (24h):   recordatorio amistoso "te quedó esto"
 *   D3  (72h):   urgencia suave "todavía aquí" + posible asistencia humana
 *   D7  (168h):  último intento con incentivo (-10% sobre estimado)
 *   D30 (720h):  ARCHIVAR — no se envía email, se marca status=ARCHIVED
 *
 * Idempotente: usa EmailDripSent.step ∈ {1,3,7,30} para no duplicar.
 * Step 30 NO envía email — solo archiva.
 *
 * Solo procesa carritos:
 *   - status ∈ {NEW, IN_PROGRESS}
 *   - email no vacío
 *   - tiene al menos 1 item
 *   - no tiene ningún Payment.PAID asociado
 *
 * Llamar 1x/día desde el crontab del VPS (05:30, vía merch-cron-runner.sh):
 *   POST /api/cron/abandoned-cart-drip  con header X-Cron-Secret
 * Es el ÚNICO sistema de recordatorio de carritos (el antiguo abandoned-reminders
 * se consolidó aquí en 2026-07: este drip cubre todo lo que hacía y más).
 */

type DripStep = 1 | 3 | 7 | 30;

const STEPS: DripStep[] = [1, 3, 7, 30];

export const POST = wrapCronHandler("abandoned-cart-drip", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  return withCronLock("abandoned-cart-drip", async () => {
  const sent = { d1: 0, d3: 0, d7: 0, archived: 0 };
  const errors: string[] = [];
  const now = Date.now();

  for (const step of STEPS) {
    const ageMs = step * 24 * 60 * 60 * 1000;
    const cutoff = new Date(now - ageMs);

    const candidates = await prisma.cartQuote.findMany({
      where: {
        status: { in: ["NEW", "IN_PROGRESS"] },
        email: { not: "" },
        createdAt: { lte: cutoff },
        items: { some: {} },
        // No procesar si ya pagado (Payment con status PAID)
        payments: { none: { status: "PAID" } },
        // No procesar si ya hay drip de este step (idempotencia)
        // (filtro adicional con SQL crudo no posible vía Prisma where, lo
        // hacemos con NOT IN via subquery: usamos EmailDripSent unique).
      },
      select: {
        id: true,
        name: true,
        email: true,
        company: true,
        estimatedTotalCents: true,
        items: {
          select: { quantity: true, productName: true, totalClientCents: true },
          take: 6,
        },
      },
      take: 200,
    });

    for (const cart of candidates) {
      // step 30 solo archiva (sin email); el resto necesita resend para enviar.
      if (step !== 30 && !resend) {
        errors.push(`cart ${cart.id} step ${step}: Resend no configurado`);
        continue;
      }

      // Claim atómico ANTES de cualquier efecto externo: el create de EmailDripSent
      // reclama (cart, step); si otra ejecución ya lo hizo, lanza P2002 → saltamos.
      // Evita duplicar emails aunque dos ejecuciones se solapen o un run muera a
      // mitad. Si el envío falla luego, el claim queda puesto (no se reintenta):
      // preferimos perder un recordatorio antes que spamear. (claim-then-send,
      // bug-bounty 2026-06-17)
      try {
        await prisma.emailDripSent.create({ data: { cartId: cart.id, step } });
      } catch {
        continue; // ya reclamado por otra ejecución / día anterior
      }

      try {
        if (step === 30) {
          // Auto-archivar — sin email
          await prisma.cartQuote.update({
            where: { id: cart.id },
            data: { status: "ARCHIVED" },
          });
          sent.archived++;
        } else {
          await sendStep(cart, step);
          await prisma.cartQuote.update({
            where: { id: cart.id },
            data: {
              reminderSentAt: new Date(),
              reminderCount: { increment: 1 },
            },
          });
          if (step === 1) sent.d1++;
          else if (step === 3) sent.d3++;
          else if (step === 7) sent.d7++;
        }
      } catch (e) {
        errors.push(`cart ${cart.id} step ${step}: ${e instanceof Error ? e.message : "error"}`);
      }
    }
  }

  return NextResponse.json({ ok: true, sent, errors });
  }) as Promise<NextResponse>;
});

async function sendStep(
  cart: {
    id: string;
    name: string;
    email: string;
    company: string | null;
    estimatedTotalCents: number | null;
    items: Array<{ quantity: number; productName: string; totalClientCents: number | null }>;
  },
  // 30 excluido: ese paso solo archiva, jamás envía email (guard en el caller).
  step: Exclude<DripStep, 30>,
) {
  const firstName = cart.name.split(" ")[0] || "";
  const recoverUrl = `${SITE_URL}/cotizar?recover=${cart.id}`;

  const { subject, html, text } = abandonedCartDripEmail({
    step,
    firstName: firstName || null,
    fallbackName: cart.name,
    items: cart.items.map((it) => ({
      quantity: it.quantity,
      name: it.productName,
      amountFormatted: it.totalClientCents != null ? EUR.format(it.totalClientCents / 100) : null,
    })),
    totalFormatted: cart.estimatedTotalCents ? EUR.format(cart.estimatedTotalCents / 100) : null,
    discountedTotalFormatted:
      step === 7 && cart.estimatedTotalCents ? EUR.format((cart.estimatedTotalCents * 0.9) / 100) : null,
    recoverUrl,
  });

  await resend!.emails.send({
    from: RESEND_FROM,
    to: cart.email,
    subject,
    html,
    text,
  });
}
