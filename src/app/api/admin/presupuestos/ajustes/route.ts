import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-session";
import { requireAdminSecret } from "@/lib/auth";
import { leerMargenes, guardarMargenes } from "@/lib/presupuesto-margenes";
import { margenesSchema } from "@/lib/presupuesto-schema";

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
  return NextResponse.json({ margenes: await leerMargenes() });
}

export async function PUT(req: Request) {
  const no = await autorizado(req);
  if (no) return no;

  const parsed = margenesSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", detalles: parsed.error.flatten() }, { status: 400 });
  }
  return NextResponse.json({ margenes: await guardarMargenes(parsed.data) });
}
