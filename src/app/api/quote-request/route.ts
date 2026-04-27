import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resend, RESEND_FROM, RESEND_TO_INTERNAL } from "@/lib/resend";

export const runtime = "nodejs";

const Schema = z.object({
  name: z.string().min(2).max(120),
  company: z.string().max(160).optional().or(z.literal("")),
  email: z.string().email(),
  phone: z.string().max(40).optional().or(z.literal("")),
  productHint: z.string().max(200).optional().or(z.literal("")),
  quantity: z.coerce.number().int().positive().max(1_000_000).optional(),
  deadline: z.string().max(120).optional().or(z.literal("")),
  budget: z.string().max(120).optional().or(z.literal("")),
  message: z.string().min(10).max(4000),
  source: z.string().max(80).optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  const created = await prisma.quoteRequest.create({
    data: {
      name: data.name,
      company: data.company || null,
      email: data.email,
      phone: data.phone || null,
      productHint: data.productHint || null,
      quantity: data.quantity ?? null,
      deadline: data.deadline || null,
      budget: data.budget || null,
      message: data.message,
      source: data.source || "landing",
    },
  });

  if (resend) {
    const lines = [
      ["Nombre", data.name],
      ["Empresa", data.company],
      ["Email", data.email],
      ["Teléfono", data.phone],
      ["Producto", data.productHint],
      ["Cantidad", data.quantity?.toString()],
      ["Plazo", data.deadline],
      ["Presupuesto", data.budget],
    ]
      .filter(([, v]) => v)
      .map(([k, v]) => `<tr><td style="padding:6px 12px;color:#666">${k}</td><td style="padding:6px 12px"><strong>${v}</strong></td></tr>`)
      .join("");

    try {
      await Promise.all([
        resend.emails.send({
          from: RESEND_FROM,
          to: RESEND_TO_INTERNAL,
          replyTo: data.email,
          subject: `[Cotización] ${data.name}${data.company ? " · " + data.company : ""}`,
          html: `
            <h2>Nueva solicitud de cotización</h2>
            <table style="border-collapse:collapse;font-family:system-ui">${lines}</table>
            <h3 style="margin-top:24px">Mensaje</h3>
            <p style="white-space:pre-wrap">${escapeHtml(data.message)}</p>
            <p style="margin-top:24px;color:#888;font-size:12px">ID: ${created.id}</p>
          `,
        }),
        resend.emails.send({
          from: RESEND_FROM,
          to: data.email,
          subject: "Hemos recibido tu cotización · todomerchandising",
          html: `
            <p>Hola ${escapeHtml(data.name.split(" ")[0])},</p>
            <p>Recibimos tu solicitud. Te enviamos cotización cerrada en menos de <strong>24 horas laborables</strong>.</p>
            <p>Mientras tanto, si tienes referencias visuales o briefing extra, contesta a este email.</p>
            <p style="margin-top:32px">— El equipo de todomerchandising<br/><span style="color:#888">una iniciativa de Startidea</span></p>
          `,
        }),
      ]);
    } catch (err) {
      console.error("[quote-request] resend error", err);
    }
  } else {
    console.warn("[quote-request] RESEND_API_KEY ausente — solo persistido en DB");
  }

  return NextResponse.json({ ok: true, id: created.id });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
