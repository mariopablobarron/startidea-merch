import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";
import { sendPush, isPushConfigured } from "@/lib/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Manda una push de prueba a todas las suscripciones activas. */
export async function POST(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  if (!isPushConfigured()) {
    return NextResponse.json(
      { error: "VAPID no configurado. Setea VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY." },
      { status: 503 },
    );
  }
  const subs = await prisma.pushSubscription.findMany();
  const results = await Promise.all(
    subs.map(async (s) => {
      const r = await sendPush(s, {
        title: "TodoMerchandising · Test",
        body: "Notificaciones funcionando correctamente.",
        url: "/admin",
        tag: "test",
      });
      if (r.gone) {
        await prisma.pushSubscription.delete({ where: { id: s.id } });
      } else if (r.ok) {
        await prisma.pushSubscription.update({
          where: { id: s.id },
          data: { lastUsedAt: new Date() },
        });
      }
      return { id: s.id, label: s.label, ...r };
    }),
  );
  return NextResponse.json({ ok: true, sent: results.filter((r) => r.ok).length, results });
}
