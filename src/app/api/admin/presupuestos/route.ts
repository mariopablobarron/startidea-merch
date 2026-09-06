import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-session";
import { requireAdminSecret } from "@/lib/auth";
import { getAdminSession } from "@/lib/admin-auth";
import { crearPresupuesto, listarPresupuestos, resumenPresupuesto } from "@/lib/presupuesto-repo";
import { presupuestoSchema } from "@/lib/presupuesto-schema";
import type { PresupuestoEstado } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function autorizado(req: Request) {
  if (await isAdmin()) return null;
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  return null;
}

export async function GET(req: Request) {
  const no = await autorizado(req);
  if (no) return no;

  const estado = new URL(req.url).searchParams.get("estado") as PresupuestoEstado | null;
  const items = await listarPresupuestos(estado ?? undefined);
  return NextResponse.json({
    items: items.map((p) => ({
      id: p.id,
      numero: p.numero,
      estado: p.estado,
      asunto: p.asunto,
      cliente: p.clienteNombre,
      createdAt: p.createdAt,
      escenarios: resumenPresupuesto(p),
    })),
  });
}

export async function POST(req: Request) {
  const no = await autorizado(req);
  if (no) return no;

  const cuerpo = await req.json().catch(() => null);
  const parsed = presupuestoSchema.safeParse(cuerpo);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", detalles: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const sesion = await getAdminSession().catch(() => null);
  const creado = await crearPresupuesto(parsed.data, sesion?.email ?? null);
  return NextResponse.json({ id: creado.id, numero: creado.numero }, { status: 201 });
}
