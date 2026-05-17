import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { notifyTelegram } from "@/lib/telegram";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(160),
  company: z.string().max(160).optional().nullable(),
  role: z.string().max(160).optional().nullable(),
  audience: z.string().max(240).optional().nullable(),
  message: z.string().max(4000).optional().nullable(),
});

export async function POST(req: Request) {
  // Anti-spam: 3 solicitudes / 1 h por IP (proceso humano, no necesita más)
  const rl = rateLimit(req, { key: "partner-apply", max: 3, windowMs: 60 * 60_000 });
  if (!rl.ok) return rl.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const created = await prisma.partnerApplication.create({
    data: {
      name: data.name,
      email: data.email,
      company: data.company ?? null,
      role: data.role ?? null,
      audience: data.audience ?? null,
      message: data.message ?? null,
    },
  });

  // Email confirmación al aplicante
  const firstName = data.name.split(" ")[0];
  await sendEmail({
    to: data.email,
    subject: `${firstName}, recibimos tu solicitud al programa partners`,
    context: `partner-application · ${created.id}`,
    html: `
    <div style="font-family:Helvetica,Arial,sans-serif;background:#F4EFE6;padding:32px 16px;">
      <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;color:#2A2A2A;">
        <div style="padding:32px 32px 24px;">
          <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b;">— Solicitud recibida</p>
          <h1 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15;color:#2A2A2A;">
            Hola ${firstName}.<br>
            <span style="color:#E63E73;">Tenemos tu solicitud al programa partners.</span>
          </h1>
          <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#444;">
            La revisamos manualmente — sí o sí te respondemos en menos de 48 horas
            laborables. Si encajamos, recibirás email con tu link único de partner
            y acceso a tu dashboard de seguimiento. Si no, también te
            respondemos con motivo claro.
          </p>
        </div>
        <div style="background:#2A2A2A;padding:20px 32px;color:rgba(244,239,230,0.7);font-size:11px;line-height:1.6;">
          <p style="margin:0;color:#FFFFFF;font-family:Georgia,'Times New Roman',serif;font-size:16px;">todo<span style="color:#E63E73;">merchandising</span></p>
          <p style="margin:6px 0 0;">STARTIDEA MALAGA SL · CIF B19583632 · Granada · pedidos@startidea.es</p>
        </div>
      </div>
    </div>`,
  });

  // Alerta interna Telegram
  await notifyTelegram(
    `<b>🤝 Nueva solicitud partner</b>\n` +
      `${data.name}${data.company ? ` · ${data.company}` : ""}\n` +
      `${data.email}\n` +
      `Rol: ${data.role || "—"}\n` +
      `Audiencia: ${data.audience || "—"}\n` +
      (data.message ? `Mensaje: ${data.message.slice(0, 300)}\n` : "") +
      `Admin: ${process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es"}/admin/marketing/partners`,
    { parseMode: "HTML" },
  ).catch(() => {});

  return NextResponse.json({ ok: true, id: created.id });
}
