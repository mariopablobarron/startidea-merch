import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resend, RESEND_FROM } from "@/lib/resend";
import { rateLimit } from "@/lib/rate-limit";
import {
  getRuletaPrizes,
  pickPrize,
  generateCouponCode,
  type RuletaPrize,
} from "@/lib/ruleta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

const Schema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
  consent: z.literal(true), // casilla RGPD obligatoria
});

interface RuletaMeta {
  prizeId: string;
  label: string;
  code: string | null;
  kind: RuletaPrize["kind"];
  wonAt: string;
  consentAt: string;
}

const COUPON_DAYS = 30;

/** Construye el HTML del email de bienvenida según el premio. */
function welcomeHtml(opts: {
  name?: string;
  prize: RuletaPrize;
  code: string | null;
  unsubUrl: string;
}): string {
  const { name, prize, code, unsubUrl } = opts;
  const firstName = name ? ` ${name.split(" ")[0]}` : "";

  const rewardBlock = code
    ? `<div style="margin:24px 0;padding:20px;border:2px dashed #E63E73;border-radius:16px;text-align:center;background:#FBE9F0;">
        <p style="margin:0;font-size:11px;font-weight:600;color:#A02049;text-transform:uppercase;letter-spacing:1px;">Tu premio — ${prize.label}</p>
        <p style="margin:12px 0 4px;font-family:Georgia,serif;font-size:28px;font-weight:700;color:#E63E73;letter-spacing:2px;">${code}</p>
        <p style="margin:0;font-size:12px;color:#666;">Aplícalo en tu primer pedido. Un solo uso · válido ${COUPON_DAYS} días.</p>
      </div>
      <p style="text-align:center;margin:20px 0;">
        <a href="${SITE_URL}/catalogo" style="background:#E63E73;color:white;padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block;">Empezar a configurar mi pedido →</a>
      </p>`
    : `<div style="margin:24px 0;padding:20px;border:2px dashed #E63E73;border-radius:16px;background:#FBE9F0;">
        <p style="margin:0;font-size:11px;font-weight:600;color:#A02049;text-transform:uppercase;letter-spacing:1px;">Tu premio</p>
        <p style="margin:8px 0 6px;font-family:Georgia,serif;font-size:22px;font-weight:700;color:#E63E73;">${prize.label}</p>
        <p style="margin:0;font-size:13px;color:#555;">${prize.perkNote ?? "Menciona este email al hacer tu pedido y te lo aplicamos."}</p>
      </div>
      <p style="text-align:center;margin:20px 0;">
        <a href="${SITE_URL}/catalogo" style="background:#E63E73;color:white;padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block;">Ver el catálogo →</a>
      </p>`;

  return `<div style="font-family:-apple-system,sans-serif;max-width:560px;color:#0a0a0b;">
    <h2 style="font-family:Georgia,serif;">¡Has ganado, ${firstName || "hola"}!</h2>
    <p>Gracias por girar la ruleta de TodoMerchandising. Este es tu premio:</p>
    ${rewardBlock}
    <p>Una vez al mes te mandamos un email corto con casos reales y novedades. Sin spam.</p>
    <p style="font-size:13px;color:#6b6b6b;">¿Prefieres no recibirlos? Te das de baja con un click <a href="${unsubUrl}" style="color:#E63E73;">aquí</a>.</p>
    <p style="color:#6b6b6b;font-size:12px;margin-top:32px;">STARTIDEA MALAGA SL · CIF B19583632 · pedidos@startidea.es</p>
  </div>`;
}

export async function POST(req: Request) {
  // Anti-abuso: cada giro puede crear un cupón real + mandar email. Limita por
  // IP para que nadie scripte miles de emails distintos (coste + reputación).
  const rl = rateLimit(req, { key: "ruleta-spin", max: 10, windowMs: 10 * 60_000 });
  if (!rl.ok) return rl.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Email y consentimiento obligatorios" }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();
  const name = parsed.data.name?.trim() || undefined;

  // Anti-carrera: corta peticiones casi-simultáneas del MISMO email. El limiter
  // es síncrono en memoria → la 2ª request concurrente se rechaza, evitando
  // crear dos cupones a la vez. Ventana corta para no estorbar al dedup.
  const rlEmail = rateLimit(req, {
    key: "ruleta-spin-email",
    max: 1,
    windowMs: 30_000,
    identifier: email,
  });
  if (!rlEmail.ok) return rlEmail.response;

  // ── Dedup: si este email ya tiró, devolvemos SU premio (no re-giramos) ──
  const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });
  const existingMeta = (existing?.meta as { ruleta?: RuletaMeta } | null) ?? null;
  if (existingMeta?.ruleta) {
    return NextResponse.json({
      ok: true,
      alreadySpun: true,
      prize: { id: existingMeta.ruleta.prizeId, label: existingMeta.ruleta.label },
      code: existingMeta.ruleta.code,
    });
  }

  // ── Elegir premio en el servidor ──────────────────────────────
  const prizes = await getRuletaPrizes();
  const prize = pickPrize(prizes);

  // ── Crear cupón real si el premio es descuento ────────────────
  let code: string | null = null;
  if (prize.kind === "percent" || prize.kind === "fixed") {
    const validUntil = new Date(Date.now() + COUPON_DAYS * 24 * 60 * 60 * 1000);
    // Reintenta si colisiona el código (muy improbable)
    for (let attempt = 0; attempt < 4 && !code; attempt++) {
      const candidate = generateCouponCode(prize.id);
      try {
        await prisma.coupon.create({
          data: {
            code: candidate,
            label: `Ruleta: ${prize.label}`,
            kind: prize.kind === "percent" ? "PERCENT" : "FIXED",
            percentValue: prize.kind === "percent" ? prize.value ?? null : null,
            fixedCents: prize.kind === "fixed" ? prize.value ?? null : null,
            minTotalCents: prize.minTotalCents ?? null,
            maxUses: 1,
            validUntil,
            active: true,
          },
        });
        code = candidate;
      } catch (e) {
        // colisión de code único → reintenta
        console.error("[ruleta] create cupón (colisión, reintenta):", e instanceof Error ? e.message : e);
      }
    }
    if (!code) {
      return NextResponse.json({ error: "No se pudo generar el premio, reinténtalo" }, { status: 500 });
    }
  }

  const now = new Date();
  const ruletaMeta: RuletaMeta = {
    prizeId: prize.id,
    label: prize.label,
    code,
    kind: prize.kind,
    wonAt: now.toISOString(),
    consentAt: now.toISOString(),
  };

  // ── RGPD: respeta la supresión. Si está suprimido (baja/queja/bounce),
  // guardamos el lead pero NI lo reactivamos NI le mandamos email. ──
  const suppressed = await prisma.outboundSuppression.findUnique({ where: { email } });
  const isSuppressed = !!suppressed;

  const baseMeta =
    existing?.meta && typeof existing.meta === "object" && !Array.isArray(existing.meta)
      ? (existing.meta as Record<string, unknown>)
      : {};
  const mergedMeta = { ...baseMeta, ruleta: ruletaMeta } as unknown as Prisma.InputJsonValue;
  const newTags = Array.from(
    new Set([...(existing?.tags ?? []), "ruleta", `ruleta:${prize.id}`]),
  );

  let sub: Awaited<ReturnType<typeof prisma.newsletterSubscriber.upsert>>;
  try {
    sub = await prisma.newsletterSubscriber.upsert({
      where: { email },
      create: {
        email,
        name,
        source: "ruleta",
        tags: newTags,
        meta: mergedMeta,
        // si está suprimido al crear, lo dejamos como dado de baja
        unsubscribedAt: isSuppressed ? now : null,
      },
      update: {
        name: name ?? undefined,
        source: existing?.source ?? "ruleta",
        tags: newTags,
        meta: mergedMeta,
        // solo reactivamos a quien NO está suprimido
        ...(isSuppressed ? {} : { unsubscribedAt: null }),
      },
    });
  } catch (e) {
    // Compensación: si ya habíamos creado el cupón, bórralo para no dejar un
    // cupón huérfano usable que el dedup no vería en un reintento.
    if (code) {
      await prisma.coupon.delete({ where: { code } }).catch((delErr) =>
        console.error("[ruleta] delete cupón compensación falló:", delErr instanceof Error ? delErr.message : delErr),
      );
    }
    console.error("[ruleta] upsert subscriber falló", e);
    return NextResponse.json({ error: "No se pudo registrar, reinténtalo" }, { status: 500 });
  }

  // ── Email transaccional de bienvenida (mejor entrega que el marketing) ──
  if (resend && !isSuppressed) {
    const unsubUrl = `${SITE_URL}/newsletter/unsubscribe/${sub.unsubscribeToken}`;
    void resend.emails
      .send({
        from: RESEND_FROM,
        to: email,
        subject: `Tu premio de la ruleta: ${prize.label}`,
        html: welcomeHtml({ name, prize, code, unsubUrl }),
      })
      .catch((err) => console.error("[ruleta] envío de email falló", err));
  }

  return NextResponse.json({
    ok: true,
    prize: { id: prize.id, label: prize.label },
    code,
  });
}
