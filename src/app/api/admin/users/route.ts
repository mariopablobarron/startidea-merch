import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword, requireRole } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase()),
  name: z.string().min(2).max(120),
  password: z.string().min(8).max(120),
  role: z.enum(["CEO", "COMERCIAL", "FACTURACION", "OPERACIONES"]),
});

const PatchSchema = z.object({
  id: z.string(),
  active: z.boolean().optional(),
  role: z.enum(["CEO", "COMERCIAL", "FACTURACION", "OPERACIONES"]).optional(),
  password: z.string().min(8).max(120).optional(),
});

export async function GET(req: Request) {
  const auth = await requireRole(req); // solo CEO
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const users = await prisma.adminUser.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });
  return NextResponse.json({ ok: true, users });
}

export async function POST(req: Request) {
  const auth = await requireRole(req); // solo CEO
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });

  try {
    const user = await prisma.adminUser.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash: await hashPassword(parsed.data.password),
        role: parsed.data.role,
      },
      select: { id: true, email: true, name: true, role: true, active: true },
    });
    return NextResponse.json({ ok: true, user });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "Email ya existe" }, { status: 409 });
    }
    throw e;
  }
}

export async function PATCH(req: Request) {
  const auth = await requireRole(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const { id, password, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (password) data.passwordHash = await hashPassword(password);

  await prisma.adminUser.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}
