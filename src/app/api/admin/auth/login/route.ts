import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  findAdminUserByEmail,
  verifyPassword,
  signSession,
  sessionCookieValue,
  recordLoginEvent,
} from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(120),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  // Bootstrap: si no hay AdminUser todavía y el password coincide con
  // ADMIN_SECRET, creamos el primer CEO con esos datos.
  const userCount = await prisma.adminUser.count();
  if (userCount === 0 && parsed.data.password === process.env.ADMIN_SECRET) {
    const { hashPassword } = await import("@/lib/admin-auth");
    const created = await prisma.adminUser.create({
      data: {
        email: parsed.data.email.toLowerCase(),
        name: "CEO",
        passwordHash: await hashPassword(parsed.data.password),
        role: "CEO",
      },
    });
    const token = await signSession({
      userId: created.id,
      email: created.email,
      name: created.name,
      role: created.role,
    });
    return new NextResponse(JSON.stringify({ ok: true, role: created.role, name: created.name }), {
      status: 200,
      headers: { "Set-Cookie": sessionCookieValue(token), "Content-Type": "application/json" },
    });
  }

  const user = await findAdminUserByEmail(parsed.data.email);
  if (!user || !user.active) {
    recordLoginEvent({
      email: parsed.data.email,
      method: "password",
      ok: false,
      reason: user ? "inactive" : "unknown_user",
      req,
    });
    return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
  }
  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    recordLoginEvent({ email: user.email, method: "password", ok: false, reason: "bad_password", req });
    return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
  }

  recordLoginEvent({ email: user.email, method: "password", ok: true, req });
  await prisma.adminUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const token = await signSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
  return new NextResponse(JSON.stringify({ ok: true, role: user.role, name: user.name }), {
    status: 200,
    headers: { "Set-Cookie": sessionCookieValue(token), "Content-Type": "application/json" },
  });
}
