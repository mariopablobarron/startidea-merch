/**
 * GET  /api/admin/team             → listado (todos los roles)
 * POST /api/admin/team             → crear admin (solo CEO)
 *     body: { email, name, role }
 *     respuesta: { ok, user, tempPassword } — la password se muestra UNA vez
 *
 * Crear cuenta auto-genera una password temporal (16 chars hex) y la
 * devuelve en el response para que el CEO se la pase al nuevo admin.
 * No la enviamos por email para evitar dependencias en el flow inicial.
 */
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import type { AdminRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, hashPassword } from "@/lib/admin-auth";
import { isAdmin } from "@/lib/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  const users = await prisma.adminUser.findMany({
    orderBy: [{ active: "desc" }, { lastLoginAt: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ ok: true, users });
}

const CreateSchema = z.object({
  email: z.string().email().max(120),
  name: z.string().min(1).max(80),
  role: z.enum(["CEO", "COMERCIAL", "FACTURACION", "OPERACIONES"]),
});

export async function POST(req: Request) {
  const auth = await requireRole(req, "CEO");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const email = parsed.data.email.toLowerCase();

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "EMAIL_EN_USO", message: `${email} ya tiene cuenta admin` },
      { status: 409 },
    );
  }

  // Password temporal: 16 chars hex (8 bytes random). No bcrypt-friendly
  // si fuera muy larga, pero es para una sola vez.
  const tempPassword = crypto.randomBytes(8).toString("hex");
  const passwordHash = await hashPassword(tempPassword);

  const created = await prisma.adminUser.create({
    data: {
      email,
      name: parsed.data.name,
      role: parsed.data.role as AdminRole,
      passwordHash,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    ok: true,
    user: created,
    tempPassword,
    note:
      "Guárdala y compártesela al usuario por canal seguro. " +
      "Una vez logueado, debe cambiarla desde /admin/cuenta.",
  });
}
