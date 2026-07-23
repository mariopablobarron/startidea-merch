import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Unsubscribe sin auth — el link viene en el footer de cada broadcast.
 * Acepta dos modos:
 *   - ?token=…   (NewsletterSubscriber.unsubscribeToken)
 *   - ?email=… (fallback para audiencias sin token, ej Customers)
 *
 * Devuelve HTML simple de confirmación. Soporta también HEAD/POST para
 * el header List-Unsubscribe one-click (RFC 8058) que algunos clientes
 * email envían como POST.
 */

async function unsubscribe(req: Request): Promise<{ ok: boolean; email?: string; reason?: string }> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const email = url.searchParams.get("email");

  if (token) {
    if (token === "test") return { ok: true, email: "test" };
    const sub = await prisma.newsletterSubscriber.findUnique({
      where: { unsubscribeToken: token },
    });
    if (!sub) return { ok: false, reason: "Token no válido" };
    await prisma.newsletterSubscriber.update({
      where: { id: sub.id },
      data: { unsubscribedAt: new Date() },
    });
    return { ok: true, email: sub.email };
  }

  if (email) {
    const sub = await prisma.newsletterSubscriber.findUnique({ where: { email } });
    if (sub) {
      await prisma.newsletterSubscriber.update({
        where: { id: sub.id },
        data: { unsubscribedAt: new Date() },
      });
    }
    // No revelamos si el email existía o no (privacidad)
    return { ok: true, email };
  }

  return { ok: false, reason: "Falta token o email" };
}

function html(message: string, ok: boolean): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Baja de newsletter · TodoMerchandising</title>
  <meta name="robots" content="noindex,nofollow">
  <style>
    body{font-family:-apple-system,sans-serif;background:#faf8f4;color:#0a0a0b;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;}
    .card{max-width:480px;background:#fff;border:1px solid #e6e1d6;border-radius:24px;padding:40px;text-align:center;}
    h1{font-family:Georgia,serif;font-size:28px;margin:0 0 12px;}
    p{color:#666;line-height:1.5;margin:0 0 16px;}
    a{color:#ff6b35;}
  </style>
</head>
<body>
  <div class="card">
    <p style="font-size:48px;margin:0 0 12px;">${ok ? "✓" : "⚠"}</p>
    <h1>${ok ? "Te hemos dado de baja" : "No hemos podido procesar tu baja"}</h1>
    <p>${message}</p>
    <p><a href="https://merchandising.startidea.es/">Volver a TodoMerchandising</a></p>
  </div>
</body>
</html>`;
}

export async function GET(req: Request) {
  const r = await unsubscribe(req);
  const message = r.ok
    ? `Tu email${r.email ? ` <b>${r.email}</b>` : ""} ya no recibirá más emails de marketing. Sigues pudiendo pedir cotización con normalidad.`
    : `${r.reason || "Error procesando la baja"}. Si el problema persiste, escríbenos a hola@startidea.es y te damos de baja manualmente.`;
  return new Response(html(message, r.ok), {
    status: r.ok ? 200 : 400,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function POST(req: Request) {
  const r = await unsubscribe(req);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
