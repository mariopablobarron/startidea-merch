/**
 * /admin/insights/integrations
 *
 * Muestra la URL + secret del webhook genérico para que Mario pegue en
 * Zapier/Make/n8n/etc, y lista los últimos eventos recibidos.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { getOrCreateWebhookSecret } from "@/lib/incoming-webhook";
import { IntegrationsClient } from "./IntegrationsClient";

export const metadata: Metadata = {
  title: "Integraciones · Insights",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://merchandising.startidea.es";

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default async function IntegrationsPage() {
  if (!(await isAdmin())) redirect("/admin/login");

  const [secret, events, totalEvents] = await Promise.all([
    getOrCreateWebhookSecret(),
    prisma.incomingWebhookEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.incomingWebhookEvent.count(),
  ]);

  const webhookUrl = `${SITE_URL}/api/integrations/event`;
  const exampleCurl = `curl -X POST '${webhookUrl}' \\
  -H 'Content-Type: application/json' \\
  -H 'x-webhook-secret: ${secret}' \\
  -d '{"source":"zapier","type":"form_submitted","payload":{"name":"Juan","email":"juan@empresa.com"}}'`;

  return (
    <>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <nav className="mb-2 flex items-center gap-2 text-xs text-ink/50">
          <Link href="/admin" className="hover:text-accent">Panel</Link>
          <span>/</span>
          <Link href="/admin/insights" className="hover:text-accent">Insights</Link>
          <span>/</span>
          <span>Integraciones</span>
        </nav>
        <h1 className="font-display text-3xl font-semibold text-ink">
          Webhook de integraciones
        </h1>
        <p className="mt-1 text-sm text-ink/60">
          Endpoint genérico para que sistemas externos (Zapier, Make, n8n,
          Typeform, tu propio cron) registren eventos en TodoMerch. {totalEvents} evento{totalEvents === 1 ? "" : "s"} acumulado{totalEvents === 1 ? "" : "s"}.
        </p>

        <IntegrationsClient
          webhookUrl={webhookUrl}
          secret={secret}
          exampleCurl={exampleCurl}
        />

        <section className="mt-12">
          <h2 className="font-display text-lg font-semibold text-ink">
            Últimos eventos recibidos
          </h2>
          {events.length === 0 ? (
            <p className="mt-4 rounded-3xl border border-line bg-bone-soft p-10 text-center text-sm text-ink/55">
              Sin eventos aún. Manda un POST de prueba al endpoint para ver el log.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {events.map((e: { id: string; source: string; type: string; payload: unknown; createdAt: Date }) => {
                const preview = JSON.stringify(e.payload).slice(0, 200);
                return (
                  <li key={e.id} className="rounded-2xl border border-line bg-bone p-4">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="rounded-full bg-bone-soft px-2 py-0.5 font-mono text-[11px] text-ink/75">
                        {e.source}
                      </span>
                      <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-ink/60">
                        {e.type}
                      </span>
                      <span className="text-[11px] text-ink/45">{fmtDate(e.createdAt)}</span>
                    </div>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[10px] text-ink/70">
                      {preview}
                    </pre>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
