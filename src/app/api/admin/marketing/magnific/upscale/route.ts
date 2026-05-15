import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { getMagnificConfig, upscaleImage, magnificStatusToDb } from "@/lib/magnific";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  imageUrl: z.string().url(),
  scale_factor: z.enum(["2x", "4x", "8x", "16x"]).optional(),
  creativity: z.number().min(0).max(10).optional(),
  hdr: z.number().min(0).max(10).optional(),
  resemblance: z.number().min(0).max(10).optional(),
  precision: z.boolean().optional(),
});

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
    return NextResponse.json({ error: "Datos inválidos", detail: parsed.error.flatten() }, { status: 400 });
  }

  const result = await upscaleImage(cfg, parsed.data.imageUrl, {
    scale_factor: parsed.data.scale_factor,
    creativity: parsed.data.creativity,
    hdr: parsed.data.hdr,
    resemblance: parsed.data.resemblance,
    precision: parsed.data.precision,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, status: result.status }, { status: 502 });
  }

  const task = await prisma.magnificTask.create({
    data: {
      type: "upscale",
      status: magnificStatusToDb(result.status),
      inputUrl: parsed.data.imageUrl,
      remoteTaskId: result.taskId,
      params: parsed.data as object,
      createdBy: session.email,
    },
  });

  return NextResponse.json({ ok: true, task });
}
