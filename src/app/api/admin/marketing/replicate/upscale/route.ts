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
  imageUrl: z.string().url(),
  scale_factor: z.number().min(2).max(10).optional(),
  prompt: z.string().max(500).optional(),
});

/**
 * Upscale con philz1337x/clarity-upscaler (Replicate).
 * Coste ~$0,005/imagen, calidad superior a real-esrgan.
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
    image: parsed.data.imageUrl,
    scale_factor: parsed.data.scale_factor ?? 2,
  };
  if (parsed.data.prompt) input.prompt = parsed.data.prompt;

  const result = await createPrediction(cfg, REPLICATE_MODELS.upscale, input);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  const p = result.prediction;
  const outputUrl = extractFirstOutputUrl(p.output);
  const task = await prisma.replicateTask.create({
    data: {
      type: "upscale",
      status: replicateStatusToDb(p.status),
      model: REPLICATE_MODELS.upscale,
      inputUrl: parsed.data.imageUrl,
      remotePredictionId: p.id,
      outputUrl,
      params: parsed.data as object,
      createdBy: session.email,
    },
  });

  return NextResponse.json({ ok: true, task });
}
