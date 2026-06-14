"use client";

import { useState } from "react";

type Candidate = { name: string; website?: string; reason?: string };
type Result = {
  icp?: string;
  pitch?: string;
  directories?: { name: string; url?: string }[];
  candidates?: Candidate[];
};

export function ProspectDiscover() {
  const [open, setOpen] = useState(false);
  const [niche, setNiche] = useState("");
  const [zone, setZone] = useState("Granada");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [added, setAdded] = useState<Record<string, boolean>>({});

  async function discover() {
    if (!niche.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setAdded({});
    try {
      const r = await fetch("/api/admin/outbound/discover", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche, zone }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setError(d.error || `Error ${r.status}`);
        return;
      }
      setResult(d.result || {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }

  async function addToCrm(c: Candidate) {
    const r = await fetch("/api/admin/outbound", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: c.name,
        company: c.name,
        source: "ia-sourcing",
        segment: niche.slice(0, 40),
        notes: [c.website, c.reason].filter(Boolean).join(" · ").slice(0, 1000),
      }),
    });
    if (r.ok) setAdded((a) => ({ ...a, [c.name]: true }));
  }

  const q = `${niche} ${zone}`.trim();
  const links = niche
    ? [
        { label: "Google Maps", url: `https://www.google.com/maps/search/${encodeURIComponent(q)}` },
        { label: "Google", url: `https://www.google.com/search?q=${encodeURIComponent(q + " contacto email")}` },
        { label: "LinkedIn empresas", url: `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(q)}` },
        { label: "LinkedIn personas", url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(q)}` },
      ]
    : [];

  return (
    <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="font-display text-base font-semibold text-ink">🔎 Encontrar nuevos prospectos (IA)</span>
        <span className="text-xs text-ink/50">{open ? "ocultar" : "abrir"}</span>
      </button>

      {open && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && discover()}
              placeholder="Nicho/sector (ej. clínicas dentales, hoteles, bufetes…)"
              className="min-w-[260px] flex-1 rounded-full border border-line bg-white px-4 py-2 text-sm focus:border-accent focus:outline-none"
            />
            <input
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              placeholder="Zona"
              className="w-32 rounded-full border border-line bg-white px-4 py-2 text-sm focus:border-accent focus:outline-none"
            />
            <button
              onClick={discover}
              disabled={loading || !niche.trim()}
              className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading ? "Buscando…" : "Buscar"}
            </button>
          </div>

          {error && <p className="mt-2 text-xs text-accent">{error}</p>}

          {result && (
            <div className="mt-4 space-y-4 text-sm">
              {result.icp && (
                <div className="rounded-xl bg-white p-3">
                  <p className="text-[10px] uppercase tracking-wider text-ink/50">Cliente ideal</p>
                  <p className="mt-1 text-ink/85">{result.icp}</p>
                  {result.pitch && <p className="mt-2 text-[13px] italic text-ink/70">Ángulo: {result.pitch}</p>}
                </div>
              )}

              {/* Búsquedas reales — fiables */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-ink/50">Búscalos aquí (resultados reales)</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {links.map((l) => (
                    <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-bone hover:bg-accent">
                      {l.label} ↗
                    </a>
                  ))}
                  {(result.directories || []).map((d, i) =>
                    d.url ? (
                      <a key={i} href={d.url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-line bg-white px-3 py-1.5 text-xs hover:border-accent">
                        {d.name} ↗
                      </a>
                    ) : (
                      <span key={i} className="rounded-full border border-line bg-white px-3 py-1.5 text-xs text-ink/60">{d.name}</span>
                    ),
                  )}
                </div>
              </div>

              {/* Candidatos IA — a verificar */}
              {(result.candidates || []).length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink/50">
                    Candidatos (ideas IA · <span className="text-accent-deep">verifica antes de contactar</span>)
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {(result.candidates || []).map((c, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
                        <span className="min-w-0">
                          <span className="font-medium text-ink">{c.name}</span>
                          {c.website && (
                            <a href={c.website.startsWith("http") ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer" className="ml-2 text-[11px] text-accent hover:underline">
                              {c.website}
                            </a>
                          )}
                          {c.reason && <span className="block text-[11px] text-ink/50">{c.reason}</span>}
                        </span>
                        {added[c.name] ? (
                          <span className="shrink-0 text-xs font-semibold text-social">✓ añadido</span>
                        ) : (
                          <button onClick={() => addToCrm(c)} className="shrink-0 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent-deep hover:bg-accent/20">
                            + CRM
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
