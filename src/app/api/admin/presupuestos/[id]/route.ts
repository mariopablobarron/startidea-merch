import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-session";
import { requireAdminSecret } from "@/lib/auth";
import { actualizarPresupuesto, obtenerPresupuesto, resumenPresupuesto } from "@/lib/presupuesto-repo";
import { presupuestoSchema } from "@/lib/presupuesto-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function autorizado(req: Request) {
  if (await isAdmin()) return null;
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  return null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const no = await autorizado(req);
  if (no) return no;

  const { id } = await params;
  const p = await obtenerPresupuesto(id);
  if (!p) return NextResponse.json({ error: "No existe" }, { status: 404 });
  return NextResponse.json({ presupuesto: p, escenarios: resumenPresupuesto(p) });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const no = await autorizado(req);
  if (no) return no;

  const { id } = await params;
  const cuerpo = await req.json().catch(() => null);
  const parsed = presupuestoSchema.safeParse(cuerpo);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", detalles: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existe = await prisma.presupuesto.findUnique({ where: { id }, select: { id: true } });
  if (!existe) return NextResponse.json({ error: "No existe" }, { status: 404 });

  const actualizado = await actualizarPresupuesto(id, parsed.data);
  return NextResponse.json({
    id: actualizado.id,
    numero: actualizado.numero,
    escenarios: resumenPresupuesto(actualizado),
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const no = await autorizado(req);
  if (no) return no;

  const { id } = await params;
  // Solo se borran borradores: un presupuesto ya enviado es un documento que
  // el cliente tiene en su correo, y su número no puede desaparecer de la serie.
  const p = await prisma.presupuesto.findUnique({ where: { id }, select: { estado: true } });
  if (!p) return NextResponse.json({ error: "No existe" }, { status: 404 });
  if (p.estado !== "BORRADOR") {
    return NextResponse.json(
      { error: "Solo se puede borrar un borrador. Un presupuesto enviado se marca como caducado." },
      { status: 409 },
    );
  }

  await prisma.presupuesto.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
