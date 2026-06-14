"use client";

import { useCallback, useEffect, useState } from "react";
import { OutboundEmailButton } from "@/components/OutboundEmailButton";
import { LinkedInMessageButton } from "@/components/LinkedInMessageButton";

type Lead = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  segment: string | null;
  source: string | null;
  linkedinUrl: string | null;
};

export default function ProspectCockpitPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pending, setPending] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [sources, setSources] = useState<{ source: string; count: number }[]>([]);
  const [source, setSource] = useState("");
  const [size, setSize] = useState(20);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ size: String(size) });
      if (source) params.set("source", source);
      const r = await fetch(`/api/admin/outbound/prospect-queue?${params}`, { credentials: "include" });
      const d = await r.json();
      if (r.ok) {
        setLeads(d.leads || []);
        setPending(d.pending || 0);
        setTodayCount(d.todayCount || 0);
        if (d.sources) setSources(d.sources);
      }
    } finally {
      setLoading(false);
    }
  }, [source, size]);

  useEffect(() => {
    load();
  }, [load]);

  async function discard(id: string) {
    await fetch(`/api/admin/outbound/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "LOST" }),
    });
    setLeads((ls) => ls.filter((l) => l.id !== id));
  }

  const DAILY_GOAL = 20;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">— Marketing</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">Prospección del día</h1>
          <p className="mt-1 text-sm text-ink/65">
            Trabaja tu cola sin contactar. Hoy:{" "}
            <span className="font-semibold text-social">{todayCount} prospectados</span> ·{" "}
            <span className="text-ink/70">{pending.toLocaleString("es-ES")} en cola</span>
          </p>
        </div>
        <button onClick={load} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark">
          ↻ Cargar lote
        </button>
      </div>

      {/* Progreso hacia el objetivo del día */}
      <div className="mt-4 rounded-2xl border border-line bg-bone-soft p-4">
        <div className="flex items-center justify-between text-xs text-ink/60">
          <span>Objetivo de hoy: {DAILY_GOAL} contactos (warm-up sano)</span>
          <span className="font-semibold text-ink">{Math.min(todayCount, DAILY_GOAL)}/{DAILY_GOAL}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-line/40">
          <div className="h-full rounded-full bg-social transition-all" style={{ width: `${Math.min(100, (todayCount / DAILY_GOAL) * 100)}%` }} />
        </div>
      </div>

      {/* Filtros */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="rounded-full border border-line bg-white px-4 py-2 text-sm focus:border-accent focus:outline-none"
        >
          <option value="">Todos los orígenes ({sources.reduce((a, s) => a + s.count, 0).toLocaleString("es-ES")})</option>
          {sources.map((s) => (
            <option key={s.source} value={s.source}>
              {s.source} ({s.count})
            </option>
          ))}
        </select>
        <select
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          className="rounded-full border border-line bg-white px-4 py-2 text-sm focus:border-accent focus:outline-none"
        >
          {[10, 20, 30, 50].map((n) => (
            <option key={n} value={n}>Lote de {n}</option>
          ))}
        </select>
      </div>

      {/* Cola */}
      <div className="mt-6 space-y-3">
        {loading ? (
          <p className="p-8 text-center text-sm text-ink/50">Cargando cola…</p>
        ) : leads.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-bone p-10 text-center">
            <p className="font-display text-lg text-ink">🎉 Cola vacía</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink/60">
              No quedan leads sin contactar {source ? "en este origen" : ""}. Cambia de origen o vuelve mañana.
            </p>
          </div>
        ) : (
          leads.map((l) => (
            <div key={l.id} className="rounded-2xl border border-line bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {l.segment && (
                      <span className="rounded-full bg-bone-soft px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink/55">{l.segment}</span>
                    )}
                    {l.source && <span className="text-[10px] text-ink/40">{l.source}</span>}
                  </div>
                  <p className="mt-1 font-display text-base font-semibold text-ink">
                    {l.company || l.name}
                  </p>
                  <div className="mt-0.5 flex flex-wrap gap-3 text-[12px] text-ink/60">
                    {l.email && <a href={`mailto:${l.email}`} className="hover:underline">{l.email}</a>}
                    {l.phone && <span>{l.phone}</span>}
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <OutboundEmailButton leadId={l.id} hasEmail={!!l.email} />
                    <LinkedInMessageButton leadId={l.id} />
                  </div>
                </div>
                <button
                  onClick={() => discard(l.id)}
                  className="rounded-full bg-line/20 px-3 py-1.5 text-xs text-ink/50 hover:bg-line/40"
                  title="No me interesa — descartar"
                >
                  Descartar
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
