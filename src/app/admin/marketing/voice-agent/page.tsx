"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Session = {
  id: string;
  elevenLabsConversationId: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
  estimatedCostCents: number | null;
  productSlugsDiscussed: string[];
  toolsCalled: Array<{ tool: string; ok: boolean; at: string }> | null;
  sourceUrl: string | null;
  resultingCart: {
    id: string;
    name: string;
    email: string;
    status: string;
    estimatedTotalCents: number | null;
  } | null;
};

type Summary = {
  totalSessions: number;
  totalDurationSec: number;
  totalCostCents: number;
  conversionsLast100: number;
  conversionRateLast100: number;
};

const EUR = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

export default function VoiceAgentAdminPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/voice-agent", { credentials: "include" });
      const d = await r.json();
      if (r.ok) {
        setSessions(d.sessions);
        setSummary(d.summary);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">— Marketing</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Agente de voz (Carmen)</h1>
      <p className="mt-2 text-sm text-ink/65">
        Conversaciones del agente ElevenLabs Conversational AI integrado en el
        widget de la web. Coste estimado a ~7,4 cts/min (ElevenLabs tier inicial).
      </p>

      {summary && (
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <Stat label="Conversaciones" value={String(summary.totalSessions)} />
          <Stat
            label="Tiempo total"
            value={summary.totalDurationSec > 60 ? `${Math.floor(summary.totalDurationSec / 60)} min` : `${summary.totalDurationSec} s`}
          />
          <Stat label="Coste estimado" value={EUR.format(summary.totalCostCents / 100)} />
          <Stat
            label="Conversión (últ 100)"
            value={`${summary.conversionRateLast100}%`}
            hint={`${summary.conversionsLast100} → cotización`}
            accent
          />
        </div>
      )}

      <div className="mt-8 overflow-hidden rounded-2xl border border-line bg-white">
        {loading ? (
          <p className="p-8 text-center text-sm text-ink/50">Cargando…</p>
        ) : sessions.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink/50">
            Sin conversaciones todavía. Comparte la web para que la gente pruebe el agente.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-bone-soft text-[11px] uppercase tracking-wider text-ink/55">
              <tr>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-right">Duración</th>
                <th className="px-4 py-3 text-right">Coste</th>
                <th className="px-4 py-3 text-left">Productos discutidos</th>
                <th className="px-4 py-3 text-left">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 text-ink/70">
                    {new Date(s.startedAt).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-3 text-right text-ink/70">
                    {s.durationSec ? `${s.durationSec}s` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-ink/70">
                    {s.estimatedCostCents != null ? EUR.format(s.estimatedCostCents / 100) : "—"}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-ink/65">
                    {s.productSlugsDiscussed.length === 0 ? (
                      <span className="text-ink/30">—</span>
                    ) : (
                      s.productSlugsDiscussed.slice(0, 3).map((slug) => (
                        <Link key={slug} href={`/catalogo/${slug}`} className="mr-2 inline-block underline-offset-2 hover:underline" target="_blank">
                          {slug}
                        </Link>
                      ))
                    )}
                  </td>
                  <td className="px-4 py-3 text-[12px]">
                    {s.resultingCart ? (
                      <Link href={`/admin/cart-quotes/${s.resultingCart.id}`} className="text-social font-medium hover:underline">
                        ✓ Cotización {s.resultingCart.name}
                        {s.resultingCart.estimatedTotalCents
                          ? ` · ${EUR.format(s.resultingCart.estimatedTotalCents / 100)}`
                          : ""}
                      </Link>
                    ) : (
                      <span className="text-ink/40">sin conversión</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({
  label, value, hint, accent = false,
}: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${accent ? "border-accent/40 bg-accent/5" : "border-line bg-white"}`}>
      <p className="text-[11px] uppercase tracking-wider text-ink/55">{label}</p>
      <p
        className={`mt-2 font-display text-2xl font-semibold ${accent ? "text-accent" : "text-ink"}`}
        style={{ fontFamily: "Georgia, serif" }}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-ink/55">{hint}</p>}
    </div>
  );
}
