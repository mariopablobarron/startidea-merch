import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCustomerRequest } from "@/lib/customer-auth";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Mis datos" del portal cliente.
 *
 *   GET   /api/clientes/me → perfil actual
 *   PATCH /api/clientes/me → actualiza nombre/empresa/teléfono/CIF/direcciones
 *
 * El email NO es editable (es la identidad del portal y la llave del
 * histórico); para cambiarlo, soporte.
 */

const PatchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  company: z.string().max(160).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  taxId: z.string().max(20).nullable().optional(),
  billingAddress: z.string().max(600).nullable().optional(),
  shippingAddress: z.string().max(600).nullable().optional(),
});

export async function GET(req: Request) {
  const session = await authenticateCustomerRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const user = await prisma.customerUser.findUnique({
    where: { email: session.email },
    select: {
      email: true,
      name: true,
      company: true,
      phone: true,
      taxId: true,
      billingAddress: true,
      shippingAddress: true,
    },
  });
  if (!user) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true, profile: user });
}

export async function PATCH(req: Request) {
  const rl = rateLimit(req, { key: "customer-me", max: 20, windowMs: 60_000 });
  if (!rl.ok) return rl.response;
  const session = await authenticateCustomerRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Solo escribimos los campos presentes; "" se normaliza a null.
  const data: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    data[k] = typeof v === "string" && v.trim() === "" ? null : v;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }
  // name no puede quedar null (el schema ya exige min 2 si viene).
  if (data.name === null) delete data.name;

  const user = await prisma.customerUser.update({
    where: { email: session.email },
    data,
    select: {
      email: true,
      name: true,
      company: true,
      phone: true,
      taxId: true,
      billingAddress: true,
      shippingAddress: true,
    },
  });
  return NextResponse.json({ ok: true, profile: user });
}
