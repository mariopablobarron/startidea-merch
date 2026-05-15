import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { getMagnificConfig, generateMystic, magnificStatusToDb } from "@/lib/magnific";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  prompt: z.string().min(3).max(2000),
  resolution: z.enum(["1k", "2k", "4k"]).optional(),
  aspect_ratio: z
    .enum([
      "square_1_1",
      "classic_4_3",
      "traditional_3_4",
      "widescreen_16_9",
      "social_story_9_16",
      "smartphone_horizontal_20_9",
      "smartphone_vertical_9_20",
      "film_horizontal_21_9",
      "film_vertical_9_21",
      "standard_3_2",
      "portrait_2_3",
      "horizontal_2_1",
      "vertical_1_2",
      "social_5_4",
      "social_post_4_5",
    ])
    .optional(),
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
