import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import {
  getReplicateConfig,
  createPrediction,
  replicateStatusToDb,
  extractFirstOutputUrl,
  REPLICATE_MODELS,
} from "@/lib/replicate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  prompt: z.string().min(3).max(2000),
  aspect_ratio: z
    .enum(["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "2:3", "3:2", "5:4", "4:5"])
    .optional(),
  num_outputs: z.number().min(1).max(4).optional(),
  output_format: z.enum(["webp", "jpg", "png"]).optional(),
});

/**
 * Generación con black-forest-labs/flux-schnell (Replicate).
 * Coste ~$0,003/imagen. Genera en 1-4 segundos.
 */
export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!["CEO", "COMERCIAL"].includes(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const cfg = await getReplicateConfig();
  if (!cfg) return NextResponse.json({ error: "Replicate no configurada" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", detail: parsed.error.flatten() }, { status: 400 });
  }

  const input: Record<string, unknown> = {
    prompt: parsed.data.prompt,
    aspect_ratio: parsed.data.aspect_ratio ?? "1:1",
    num_outputs: parsed.data.num_outputs ?? 1,
    output_format: parsed.data.output_format ?? "png",
  };

  const result = await createPrediction(cfg, REPLICATE_MODELS.generate, input);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  const p = result.prediction;
  const outputUrl = extractFirstOutputUrl(p.output);
  const task = await prisma.replicateTask.create({
    data: {
      type: "generate",
      status: replicateStatusToDb(p.status),
      model: REPLICATE_MODELS.generate,
      remotePredictionId: p.id,
      outputUrl,
      prompt: parsed.data.prompt,
      params: parsed.data as object,
      createdBy: session.email,
    },
  });

  return NextResponse.json({ ok: true, task });
}
