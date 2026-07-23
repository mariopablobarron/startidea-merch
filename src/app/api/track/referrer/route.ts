/**
 * POST /api/track/referrer
 *
 * Captura document.referrer cuando es externo (no es nuestro dominio).
 * Llamado por componente client tras window.load (1 vez por sesión).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  referrer: z.string().url().max(500),
  landingPath: z.string().max(200).optional(),
});

const OWN_HOSTS = ["merchandising.startidea.es", "localhost"];

export async function POST(req: Request) {
  let body;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  let host: string;
  try {
    host = new URL(body.referrer).host.toLowerCase().replace(/^www\./, "");
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (OWN_HOSTS.includes(host)) {
    return NextResponse.json({ ok: true, skipped: "own_host" });
  }

  try {
    await prisma.referrerLog.upsert({
      where: { host },
      create: {
        host,
        path: body.landingPath?.slice(0, 200) ?? null,
        visits: 1,
      },
      update: { visits: { increment: 1 } },
    });
  } catch {
    // silencio
  }

  return NextResponse.json({ ok: true });
}
