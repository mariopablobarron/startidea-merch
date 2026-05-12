import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resend, RESEND_FROM, RESEND_TO_INTERNAL } from "@/lib/resend";
import { autoresponseQuoteEmail, internalQuoteEmail, type QuoteEmailData } from "@/lib/email-templates";
import { notifyAdmins } from "@/lib/notify-admin";
import { getQuoteSettings } from "@/lib/quote-settings";

export const runtime = "nodejs";

const Schema = z.object({
  name: z.string().min(2).max(120),
  company: z.string().max(160).optional().or(z.literal("")),
  email: z.string().email(),
  phone: z.string().max(40).optional().or(z.literal("")),
  productHint: z.string().max(200).optional().or(z.literal("")),
  productRef: z.string().max(80).optional().or(z.literal("")),
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
      productRef: data.productRef || null,
      quantity: data.quantity ?? null,
      deadline: data.deadline || null,
      budget: data.budget || null,
      message: data.message,
      source: data.source || "landing",
    },
  });

  const settings = await getQuoteSettings();

  if (resend) {
    const emailData: QuoteEmailData = {
      id: created.id,
      name: data.name,
      company: data.company || null,
      email: data.email,
      phone: data.phone || null,
      productHint: data.productHint || null,
      quantity: data.quantity ?? null,
      deadline: data.deadline || null,
      budget: data.budget || null,
      message: data.message,
      source: data.source || null,
    };

    // Destinatarios internos: settings.internalNotifyEmails sobreescribe el default
    const internalTo =
      settings.internalNotifyEmails.length > 0
        ? settings.internalNotifyEmails
        : [RESEND_TO_INTERNAL];

    // Auto-reply: usar HTML custom si está; si no, plantilla por defecto
    const autoReplyHtml = settings.autoReplyHtml
      ? settings.autoReplyHtml
          .replace(/\{name\}/g, data.name)
          .replace(/\{firstName\}/g, data.name.split(" ")[0])
          .replace(/\{hours\}/g, String(settings.responseHours))
          .replace(/\{company\}/g, data.company || "")
      : autoresponseQuoteEmail(emailData);

    const autoReplySubject = settings.autoReplySubject || `${data.name.split(" ")[0]}, recibimos tu solicitud — respuesta en ${settings.responseHours}h`;

    try {
      const sends = [
        resend.emails.send({
          from: RESEND_FROM,
          to: internalTo,
          replyTo: data.email,
          subject: `[Cotización] ${data.name}${data.company ? " · " + data.company : ""}`,
          html: internalQuoteEmail(emailData),
        }),
      ];
      if (settings.autoReplyEnabled) {
        sends.push(
          resend.emails.send({
            from: RESEND_FROM,
            to: data.email,
            subject: autoReplySubject,
            html: autoReplyHtml,
          }),
        );
      }
      await Promise.all(sends);
    } catch (err) {
      console.error("[quote-request] resend error", err);
    }
  } else {
    console.warn("[quote-request] RESEND_API_KEY ausente — solo persistido en DB");
  }

  void notifyAdmins({
    title: `Nueva cotización · ${data.name}`,
    body: `${data.message.slice(0, 100)}${data.company ? ` — ${data.company}` : ""}`,
    url: `/admin/quotes/${created.id}`,
    tag: `quote-${created.id}`,
  }).catch((err) => console.error("[quote-request push]", err));

  return NextResponse.json({ ok: true, id: created.id });
}
