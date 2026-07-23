import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";
import { resend, RESEND_FROM } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

/**
 * Genera (si no existe) el token público del dashboard cliente y manda email
 * al cliente con el link "Ver tu impacto".
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const cart = await prisma.cartQuote.findUnique({
    where: { id },
    select: { name: true, email: true, company: true, customerToken: true },
  });
  if (!cart) return NextResponse.json({ error: "Carrito no encontrado" }, { status: 404 });

  const token = cart.customerToken || `cust_${randomBytes(20).toString("base64url")}`;
  if (!cart.customerToken) {
    await prisma.cartQuote.update({ where: { id }, data: { customerToken: token } });
  }

  const url = `${SITE_URL}/clientes/${token}`;

  if (resend) {
    void resend.emails
      .send({
        from: RESEND_FROM,
        to: cart.email,
        subject: `${cart.name.split(" ")[0]}, tu dashboard de impacto está listo`,
        html: `
          <div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#0a0a0b;">
            <h2 style="font-family:Georgia,serif;">Tu impacto, en directo</h2>
            <p>Hola ${cart.name.split(" ")[0]},</p>
            <p>Hemos preparado un dashboard privado donde ves todos tus pedidos con TodoMerchandising
            y el impacto agregado: productos producidos, € invertidos en Centros Especiales de Empleo,
            kg de CO₂ ahorrados.</p>
            <p>Útil para tu memoria de sostenibilidad, intranet o presentación interna.</p>
            <p style="text-align:center;margin:32px 0;">
              <a href="${url}" style="background:#ff6b35;color:white;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:600;">Ver mi dashboard →</a>
            </p>
            <p style="font-size:13px;color:#6b6b6b;">Link privado y único. Si quieres un certificado oficial firmado para reporte GRI/EFRAG, respóndenos a este email.</p>
            <p style="color:#6b6b6b;font-size:12px;margin-top:32px;">STARTIDEA MALAGA SL · CIF B19583632</p>
          </div>`,
      })
      .catch((err) => console.error("[customer-link]", err));
  }

  return NextResponse.json({ ok: true, token, url });
}
