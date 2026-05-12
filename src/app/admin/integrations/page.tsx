"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Provider = "METRICOOL" | "META_ADS" | "GOOGLE_ADS" | "LINKEDIN_ADS" | "RESEND" | "STRIPE";

type IntegrationRow = {
  provider: Provider;
  enabled: boolean;
  config: Record<string, unknown>;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastError: string | null;
  updatedAt: string;
};

const PROVIDERS: Array<{
  id: Provider;
  label: string;
  fase: string;
  status: "active" | "soon" | "manual";
  description: string;
}> = [
  {
    id: "METRICOOL",
    label: "Metricool",
    fase: "Fase 2 — Publicación social automática",
    status: "active",
    description:
      "Publica piezas aprobadas en IG, FB, LinkedIn, X, TikTok, YouTube, Pinterest y Threads cuando llega su scheduledAt.",
  },
  {
    id: "META_ADS",
    label: "Meta Ads",
    fase: "Fase 3 — Anuncios Facebook + Instagram",
    status: "soon",
    description: "Crear y pausar campañas de Meta desde el admin, con audiencias lookalike del CRM.",
  },
  {
    id: "GOOGLE_ADS",
    label: "Google Ads",
    fase: "Fase 4 — Search Ads B2B",
    status: "soon",
    description: "Campañas de búsqueda B2B con keywords de alta intención.",
  },
  {
    id: "LINKEDIN_ADS",
    label: "LinkedIn Ads",
    fase: "Fase 5 — Targeting B2B premium",
    status: "soon",
    description: "Lead Gen Forms + Sponsored Content. Canal #1 B2B en España.",
  },
  {
    id: "RESEND",
    label: "Resend (email)",
    fase: "Activo · Broadcasts y drips",
    status: "manual",
    description: "Configurado vía .env. No editable aquí.",
  },
  {
    id: "STRIPE",
    label: "Stripe (pagos)",
    fase: "Activo · Checkout y webhooks",
    status: "manual",
    description: "Configurado vía .env. No editable aquí.",
  },
];

export default function IntegrationsPage() {
  const [rows, setRows] = useState<Record<Provider, IntegrationRow | null>>(
    {} as Record<Provider, IntegrationRow | null>,
  );
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const results: Record<string, IntegrationRow | null> = {};
    await Promise.all(
      PROVIDERS.filter((p) => p.status !== "manual").map(async (p) => {
        try {
          const res = await fetch(`/api/admin/integrations/${p.id}`, { credentials: "include" });
          const data = await res.json();
          if (res.ok) results[p.id] = data.config;
        } catch {
          results[p.id] = null;
        }
      }),
    );
    setRows(results as Record<Provider, IntegrationRow | null>);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">
            Marketing · Sistema
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
            Integraciones
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink/60">
            Conecta TodoMerchandising con plataformas externas para publicar
            automáticamente, lanzar anuncios y unificar métricas. Solo CEO accede.
          </p>
          <div className="mt-3 flex gap-3 text-xs">
            <Link href="/admin/marketing/content" className="text-ink/60 hover:text-accent">
              ← Content Studio
            </Link>
          </div>
        </header>

        {loading ? (
          <p className="text-sm text-ink/60">Cargando…</p>
        ) : (
          <ul className="space-y-3">
            {PROVIDERS.map((p) => {
              const row = rows[p.id];
              const isEnabled = row?.enabled === true;
              const lastTest = row?.lastTestAt;
              const lastOk = row?.lastTestOk;
              return (
                <li key={p.id} className="rounded-2xl border border-line bg-bone p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <h2 className="font-display text-lg font-semibold text-ink">
                          {p.label}
                        </h2>
                        {p.status === "active" && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                              isEnabled
                                ? "bg-social/15 text-social"
                                : "bg-bone-soft text-ink/50"
                            }`}
                          >
                            {isEnabled ? "Activa" : "Desconectada"}
                          </span>
                        )}
                        {p.status === "soon" && (
                          <span className="rounded-full bg-accent-mist px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-deep">
                            Próximamente
                          </span>
                        )}
                        {p.status === "manual" && (
                          <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink/40">
                            Vía .env
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] uppercase tracking-wider text-ink/40">
                        {p.fase}
                      </p>
                      <p className="mt-2 text-sm text-ink/70">{p.description}</p>
                      {lastTest && (
                        <p className="mt-2 text-[11px] text-ink/50">
                          Último test: {new Date(lastTest).toLocaleString("es-ES")} ·{" "}
                          {lastOk ? (
                            <span className="text-social">✓ OK</span>
                          ) : (
                            <span className="text-accent-deep">⚠ Falló</span>
                          )}
                          {row?.lastError && (
                            <span className="block text-[10px] text-accent-deep">
                              {row.lastError.slice(0, 150)}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    {p.status === "active" && (
                      <Link
                        href={`/admin/integrations/${p.id.toLowerCase()}`}
                        className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-bone hover:bg-accent-dark"
                      >
                        {isEnabled ? "Configurar" : "Conectar"} →
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <section className="mt-8 rounded-2xl border border-accent/30 bg-accent/5 p-5">
          <h2 className="font-display text-base font-semibold text-ink">
            ⚙️ Cron de publicación
          </h2>
          <p className="mt-1 text-xs text-ink/60">
            Para que las piezas SCHEDULED se publiquen automáticamente cuando llega
            su hora, configura en cron-job.org una tarea cada 5 minutos:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-bone px-3 py-2 font-mono text-[11px] text-ink">
{`POST https://merchandising.hubstartidea.es/api/cron/publish-scheduled
Header: X-Cron-Secret: <CRON_SECRET del .env>
Cadencia: */5 * * * *`}
          </pre>
          <p className="mt-2 text-[11px] text-ink/50">
            El endpoint procesa hasta 50 piezas por ejecución. Idempotente —
            marca cada una como PUBLISHED o FAILED para no reintentar.
          </p>
        </section>
      </div>
    </main>
  );
}
