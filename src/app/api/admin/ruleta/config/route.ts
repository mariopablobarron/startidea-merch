import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { getRuletaPrizes } from "@/lib/ruleta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PrizeSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
  short: z.string().min(1).max(40),
  kind: z.enum(["perk", "percent", "fixed"]),
  weight: z.number().int().min(0).max(1000),
  value: z.number().int().min(0).max(100_000_000).optional(),
  minTotalCents: z.number().int().min(0).max(100_000_000).optional(),
  perkNote: z.string().max(400).optional(),
});

const BodySchema = z.object({
  prizes: z.array(PrizeSchema).min(1).max(12),
});

function guard(session: { role?: string } | null) {
  if (!session) return { error: "No autenticado", status: 401 as const };
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return { error: "Sin permiso", status: 403 as const };
  }
  return null;
}

/** GET — devuelve los premios efectivos (config guardada o defaults). */
export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  const g = guard(session);
  if (g) return NextResponse.json({ error: g.error }, { status: g.status });

  const prizes = await getRuletaPrizes();
  return NextResponse.json({ ok: true, prizes });
}

/** PUT — guarda la config de premios en AdminSetting "ruleta_config". */
export async function PUT(req: Request) {
  const session = await authenticateAdminRequest(req);
  const g = guard(session);
  if (g) return NextResponse.json({ error: g.error }, { status: g.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", detail: parsed.error.flatten() }, { status: 400 });
  }

  // Validación de negocio: los premios con descuento necesitan valor.
  for (const p of parsed.data.prizes) {
    if (p.kind === "percent" && (!p.value || p.value < 1 || p.value > 100)) {
      return NextResponse.json({ error: `"${p.label}": un % debe ser 1-100` }, { status: 400 });
    }
    if (p.kind === "fixed" && (!p.value || p.value < 1)) {
      return NextResponse.json({ error: `"${p.label}": el importe fijo (céntimos) debe ser > 0` }, { status: 400 });
    }
  }
  if (parsed.data.prizes.reduce((s, p) => s + p.weight, 0) <= 0) {
    return NextResponse.json({ error: "Al menos un premio debe tener peso > 0" }, { status: 400 });
  }

  await prisma.adminSetting.upsert({
    where: { key: "ruleta_config" },
    create: { key: "ruleta_config", value: { prizes: parsed.data.prizes } as unknown as Prisma.InputJsonValue },
    update: { value: { prizes: parsed.data.prizes } as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({ ok: true, prizes: parsed.data.prizes });
}
