/**
 * GET    /api/admin/errors?filter=unresolved|all
 * PATCH  /api/admin/errors  body: {id, resolved}
 * DELETE /api/admin/errors?id=
 */
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { unpinError, cleanupResolvedPins } from "@/lib/insights/pinned-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  let body: { id?: string; resolved?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });
  await prisma.errorEvent.update({
    where: { id: body.id },
    data: { resolved: !!body.resolved },
  });
  // Si lo marcamos resolved, des-pinnea automáticamente (no tiene sentido
  // tener un bug "resuelto" como sugerencia activa).
  if (body.resolved) {
    await unpinError(body.id).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const all = url.searchParams.get("all"); // ?all=resolved → borra todos los resueltos

  if (all === "resolved") {
    const r = await prisma.errorEvent.deleteMany({ where: { resolved: true } });
    // Limpia pins huérfanos (sus errorEvent ya no existen)
    await cleanupResolvedPins().catch(() => {});
    return NextResponse.json({ ok: true, deleted: r.count });
  }
  if (!id) return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });
  await prisma.errorEvent.delete({ where: { id } }).catch(() => {});
  await unpinError(id).catch(() => {});
  return NextResponse.json({ ok: true });
}
