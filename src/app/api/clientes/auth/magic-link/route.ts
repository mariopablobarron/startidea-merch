import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { findOrCreateCustomerByEmail } from "@/lib/customer-auth";
import { resend, RESEND_FROM } from "@/lib/resend";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

const Schema = z.object({ email: z.string().email() });

/**
 * Pide un magic link al email del cliente. Solo si tiene CartQuotes
 * existentes (o ya es CustomerUser). No revela info del estado al
 * llamador (responde igual exista o no, anti-enum).
 */
export async function POST(req: Request) {
  // Anti-brute force / anti-enumeración: 5 intentos/15 min por IP.
  const rl = rateLimit(req, { key: "magic-link", max: 5, windowMs: 15 * 60_000 });
  if (!rl.ok) return rl.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // mismo silencio
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: true });

  const user = await findOrCreateCustomerByEmail(parsed.data.email);
  if (!user) return NextResponse.json({ ok: true }); // no carts → silent

  const token = `cmlt_${randomBytes(20).toString("base64url")}`;
  await prisma.customerUser.update({
    where: { id: user.id },
    data: {
      magicLinkToken: token,
      magicLinkExpiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min
    },
  });

  const url = `${SITE_URL}/api/clientes/auth/consume/${token}`;
  if (resend) {
    void resend.emails
      .send({
        from: RESEND_FROM,
        to: user.email,
        subject: "Tu enlace de acceso a TodoMerchandising",
        html: `<div style="font-family:-apple-system,sans-serif;max-width:560px;color:#0a0a0b;">
          <h2 style="font-family:Georgia,serif;">Tu enlace de acceso</h2>
          <p>Hola ${user.name.split(" ")[0]},</p>
          <p>Pulsa el botón para entrar a tu portal de cliente. El enlace expira en 30 minutos.</p>
          <p style="text-align:center;margin:32px 0;">
            <a href="${url}" style="background:#ff6b35;color:white;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:600;">Entrar →</a>
          </p>
          <p style="font-size:13px;color:#6b6b6b;">Si no pediste este enlace, puedes ignorar este email.</p>
          <p style="color:#6b6b6b;font-size:12px;margin-top:32px;">STARTIDEA MALAGA SL · CIF B19583632</p>
        </div>`,
      })
      .catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
