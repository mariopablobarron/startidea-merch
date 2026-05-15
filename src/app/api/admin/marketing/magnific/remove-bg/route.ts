import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { getMagnificConfig, removeBackground } from "@/lib/magnific";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({ imageUrl: z.string().url() });

export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!["CEO", "COMERCIAL"].includes(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const cfg = await getMagnificConfig();
  if (!cfg) {
    return NextResponse.json({ error: "Magnific no configurada o desactivada" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const result = await removeBackground(cfg, parsed.data.imageUrl);

  if (!result.ok) {
    // Persistimos también los fallos para tener historial
    const failed = await prisma.magnificTask.create({
      data: {
        type: "remove-bg",
        status: "failed",
        inputUrl: parsed.data.imageUrl,
        error: result.error.slice(0, 1000),
        createdBy: session.email,
      },
    });
    return NextResponse.json({ error: result.error, status: result.status, task: failed }, { status: 502 });
  }

  // Remove-bg es síncrono — task creada ya como ready
  const task = await prisma.magnificTask.create({
    data: {
      type: "remove-bg",
      status: "ready",
      inputUrl: parsed.data.imageUrl,
      outputUrl: result.result.url,
      previewUrl: result.result.preview,
      createdBy: session.email,
    },
  });

  return NextResponse.json({ ok: true, task, urls: result.result });
}
