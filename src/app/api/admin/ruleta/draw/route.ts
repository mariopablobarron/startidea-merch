import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { resend, RESEND_FROM } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";
const SETTING_KEY = "ruleta_sorteo_draws";
const SORTEO_TAG = "ruleta:sorteo";

interface SorteoDraw {
  month: string; // YYYY-MM
  winnerEmail: string;
  winnerName: string | null;
  drawnAt: string;
  eligibleCount: number;
  notified: boolean;
}

const PostSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  notify: z.boolean().optional(),
  force: z.boolean().optional(),
});

function guard(session: { role?: string } | null) {
  if (!session) return { error: "No autenticado", status: 401 as const };
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return { error: "Sin permiso", status: 403 as const };
  }
  return null;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

async function readDraws(): Promise<SorteoDraw[]> {
  const row = await prisma.adminSetting.findUnique({ where: { key: SETTING_KEY } });
  const val = row?.value as { draws?: SorteoDraw[] } | null;
  return Array.isArray(val?.draws) ? val!.draws : [];
}

/** Participantes elegibles: tag de sorteo, suscritos, no suprimidos, no ganadores previos. */
async function getEligible(pastWinners: Set<string>) {
  const subs = await prisma.newsletterSubscriber.findMany({
    where: { tags: { has: SORTEO_TAG }, unsubscribedAt: null },
    select: { email: true, name: true },
  });
  const suppressed = new Set(
    (await prisma.outboundSuppression.findMany({ select: { email: true } })).map((s) =>
      s.email.toLowerCase(),
    ),
  );
  return subs.filter(
    (s) => !suppressed.has(s.email.toLowerCase()) && !pastWinners.has(s.email.toLowerCase()),
  );
}

/** GET — nº de elegibles del mes en curso + historial de sorteos. */
export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  const g = guard(session);
  if (g) return NextResponse.json({ error: g.error }, { status: g.status });

  const draws = await readDraws();
  const pastWinners = new Set(draws.map((d) => d.winnerEmail.toLowerCase()));
  const eligible = await getEligible(pastWinners);
  return NextResponse.json({
    ok: true,
    month: currentMonth(),
    eligibleCount: eligible.length,
    alreadyDrawnThisMonth: draws.some((d) => d.month === currentMonth()),
    draws: draws.sort((a, b) => b.month.localeCompare(a.month)),
  });
}

/** POST — sortea un ganador del mes (idempotente salvo force). */
export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  const g = guard(session);
  if (g) return NextResponse.json({ error: g.error }, { status: g.status });

  const body = await req.json().catch(() => ({}));
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const month = parsed.data.month || currentMonth();

  const draws = await readDraws();
  const existing = draws.find((d) => d.month === month);
  if (existing && !parsed.data.force) {
    return NextResponse.json({ ok: true, alreadyDrawn: true, draw: existing });
  }

  const pastWinners = new Set(draws.filter((d) => d.month !== month).map((d) => d.winnerEmail.toLowerCase()));
  const eligible = await getEligible(pastWinners);
  if (eligible.length === 0) {
    return NextResponse.json({ error: "No hay participantes elegibles este mes" }, { status: 400 });
  }

  const winner = eligible[Math.floor(Math.random() * eligible.length)];
  const draw: SorteoDraw = {
    month,
    winnerEmail: winner.email,
    winnerName: winner.name ?? null,
    drawnAt: new Date().toISOString(),
    eligibleCount: eligible.length,
    notified: false,
  };

  // Email opcional al ganador (transaccional). Lo decide el admin con el toggle.
  if (parsed.data.notify && resend) {
    try {
      await resend.emails.send({
        from: RESEND_FROM,
        to: winner.email,
        subject: "🎉 ¡Has ganado el sorteo del mes de TodoMerchandising!",
        html: `<div style="font-family:-apple-system,sans-serif;max-width:560px;color:#0a0a0b;">
          <h2 style="font-family:Georgia,serif;">¡Enhorabuena${winner.name ? `, ${winner.name.split(" ")[0]}` : ""}!</h2>
          <p>Has ganado el <strong>sorteo del mes</strong> de TodoMerchandising. En breve te contactamos por este email para darte los detalles de tu premio.</p>
          <p style="text-align:center;margin:24px 0;"><a href="${SITE_URL}/catalogo" style="background:#E63E73;color:white;padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block;">Ver el catálogo →</a></p>
          <p style="color:#6b6b6b;font-size:12px;margin-top:32px;">STARTIDEA MALAGA SL · CIF B19583632 · pedidos@startidea.es</p>
        </div>`,
      });
      draw.notified = true;
    } catch (err) {
      console.error("[ruleta] email ganador sorteo falló", err);
    }
  }

  const newDraws = [...draws.filter((d) => d.month !== month), draw].sort((a, b) =>
    b.month.localeCompare(a.month),
  );
  await prisma.adminSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: { draws: newDraws } as unknown as Prisma.InputJsonValue },
    update: { value: { draws: newDraws } as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({ ok: true, draw });
}
