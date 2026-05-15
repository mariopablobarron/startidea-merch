import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { getMagnificConfig, relightImage, magnificStatusToDb } from "@/lib/magnific";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  imageUrl: z.string().url(),
  prompt: z.string().max(2000).optional(),
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

  const result = await relightImage(cfg, parsed.data.imageUrl, {
    prompt: parsed.data.prompt,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, status: result.status }, { status: 502 });
  }

  const task = await prisma.magnificTask.create({
    data: {
      type: "relight",
      status: magnificStatusToDb(result.status),
      inputUrl: parsed.data.imageUrl,
      remoteTaskId: result.taskId,
      prompt: parsed.data.prompt,
      params: parsed.data as object,
      createdBy: session.email,
    },
  });

  return NextResponse.json({ ok: true, task });
}
