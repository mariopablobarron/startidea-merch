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

const Schema = z.object({ imageUrl: z.string().url() });

/**
 * Quitar fondo con 851-labs/background-remover (Replicate).
 * Coste ~$0,005/imagen. Devuelve PNG con alfa transparente.
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
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const result = await createPrediction(cfg, REPLICATE_MODELS.removeBg, {
    image: parsed.data.imageUrl,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  const p = result.prediction;
  const outputUrl = extractFirstOutputUrl(p.output);
  const task = await prisma.replicateTask.create({
    data: {
      type: "remove-bg",
      status: replicateStatusToDb(p.status),
      model: REPLICATE_MODELS.removeBg,
      inputUrl: parsed.data.imageUrl,
      remotePredictionId: p.id,
      outputUrl,
      params: parsed.data as object,
      createdBy: session.email,
    },
  });

  return NextResponse.json({ ok: true, task });
}
