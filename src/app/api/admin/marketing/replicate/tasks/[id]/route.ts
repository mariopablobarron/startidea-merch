import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import {
  getReplicateConfig,
  getPredictionStatus,
  replicateStatusToDb,
  extractFirstOutputUrl,
} from "@/lib/replicate";
import { persistRemoteImage } from "@/lib/magnific-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Poll de Replicate prediction. Cuando completa, descarga la imagen al
 * volumen local y guarda outputUrl como URL local persistente.
 * Mismo helper que Magnific (magnific-storage), distinto subdirectorio.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!["CEO", "COMERCIAL"].includes(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await params;
  const task = await prisma.replicateTask.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "Task no encontrada" }, { status: 404 });

  if (task.status === "ready" || task.status === "failed" || !task.remotePredictionId) {
    return NextResponse.json({ ok: true, task });
  }

  const cfg = await getReplicateConfig();
  if (!cfg) return NextResponse.json({ error: "Replicate no configurada" }, { status: 503 });

  const remote = await getPredictionStatus(cfg, task.remotePredictionId);
  if (!remote.ok) return NextResponse.json({ ok: true, task, pollError: remote.error });

  const p = remote.prediction;
  const newStatus = replicateStatusToDb(p.status);
  const remoteImageUrl = extractFirstOutputUrl(p.output);

  // Persistencia local cuando ready (igual que Magnific): URLs Replicate
  // también caducan en ~24h.
  let finalOutputUrl = remoteImageUrl;
  if (newStatus === "ready" && remoteImageUrl && !task.outputUrl?.startsWith("/files/")) {
    const persisted = await persistRemoteImage(remoteImageUrl, task.id);
    if (persisted) finalOutputUrl = persisted.url;
  }

  if (newStatus !== task.status || (finalOutputUrl && finalOutputUrl !== task.outputUrl)) {
    const updated = await prisma.replicateTask.update({
      where: { id },
      data: {
        status: newStatus,
        ...(finalOutputUrl ? { outputUrl: finalOutputUrl } : {}),
        ...(p.error ? { error: String(p.error).slice(0, 1000) } : {}),
      },
    });
    return NextResponse.json({ ok: true, task: updated });
  }

  return NextResponse.json({ ok: true, task });
}
