import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import {
  getMagnificConfig,
  getTaskStatus,
  magnificEndpointForType,
  magnificStatusToDb,
} from "@/lib/magnific";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/marketing/magnific/tasks/[id]
 *
 * Si la task está "queued"/"processing", hace polling a Magnific
 * y actualiza el registro local. Devuelve task fresca.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!["CEO", "COMERCIAL"].includes(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await params;
  const task = await prisma.magnificTask.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "Task no encontrada" }, { status: 404 });

  // Si ya está terminada o no es async (no tiene remoteTaskId), devolvemos tal cual
  if (task.status === "ready" || task.status === "failed" || !task.remoteTaskId) {
    return NextResponse.json({ ok: true, task });
  }

  const endpoint = magnificEndpointForType(task.type);
  if (!endpoint) {
    return NextResponse.json({ ok: true, task });
  }

  const cfg = await getMagnificConfig();
  if (!cfg) {
    return NextResponse.json({ error: "Magnific no configurada" }, { status: 503 });
  }

  const remote = await getTaskStatus(cfg, endpoint, task.remoteTaskId);
  if (!remote.ok) {
    return NextResponse.json({ ok: true, task, pollError: remote.error });
  }

  const newStatus = magnificStatusToDb(remote.status);
  const outputUrl = remote.generated[0] ?? null;

  // Solo escribir si cambió algo (evita writes innecesarios)
  if (newStatus !== task.status || (outputUrl && outputUrl !== task.outputUrl)) {
    const updated = await prisma.magnificTask.update({
      where: { id },
      data: {
        status: newStatus,
        ...(outputUrl ? { outputUrl } : {}),
      },
    });
    return NextResponse.json({ ok: true, task: updated });
  }

  return NextResponse.json({ ok: true, task });
}
