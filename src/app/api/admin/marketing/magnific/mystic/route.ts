import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { getMagnificConfig, generateMystic, magnificStatusToDb } from "@/lib/magnific";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  prompt: z.string().min(3).max(2000),
  resolution: z.enum(["1K", "2K", "4K"]).optional(),
  aspect_ratio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"]).optional(),
  model: z.string().optional(),
  structure_reference: z.string().url().optional(),
  style_reference: z.string().url().optional(),
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

  const result = await generateMystic(cfg, parsed.data.prompt, {
    resolution: parsed.data.resolution,
    aspect_ratio: parsed.data.aspect_ratio,
    model: parsed.data.model,
    structure_reference: parsed.data.structure_reference,
    style_reference: parsed.data.style_reference,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, status: result.status }, { status: 502 });
  }

  const task = await prisma.magnificTask.create({
    data: {
      type: "mystic",
      status: magnificStatusToDb(result.status),
      remoteTaskId: result.taskId,
      prompt: parsed.data.prompt,
      params: parsed.data as object,
      createdBy: session.email,
    },
  });

  return NextResponse.json({ ok: true, task });
}
