import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  authenticateAdminRequest,
  hashPassword,
  verifyPassword,
} from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cambio de contraseña del usuario actualmente autenticado.
 * Cualquier rol puede cambiar la SUYA. Para cambiar la de otro usuario
 * (admin reset), usar PATCH /api/admin/users.
 *
 * Requiere current password como medida de seguridad básica
 * (evita que alguien con la cookie robada cambie pwd sin saber la actual).
 */

const Schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(10, "Mínimo 10 caracteres")
    .max(120)
    .refine(
      (s) => /[A-Z]/.test(s) && /[a-z]/.test(s) && /[0-9]/.test(s),
      "Debe contener mayúscula, minúscula y número",
    ),
});

export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // Sesión legacy (X-Admin-Secret) no permite cambiar pwd — no hay AdminUser asociado
  if (session.userId === "legacy-admin") {
    return NextResponse.json(
      {
        error:
          "Esta sesión usa X-Admin-Secret legacy. Inicia sesión con email/contraseña primero.",
      },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const user = await prisma.adminUser.findUnique({
    where: { id: session.userId },
    select: { id: true, passwordHash: true },
  });
  if (!user) return NextResponse.json({ error: "Usuario no existe" }, { status: 404 });

  const ok = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Contraseña actual incorrecta" }, { status: 401 });
  }

  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return NextResponse.json(
      { error: "La nueva contraseña debe ser distinta de la actual" },
      { status: 400 },
    );
  }

  await prisma.adminUser.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  });

  return NextResponse.json({ ok: true });
}
