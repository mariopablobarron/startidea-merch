"use client";

import { useState } from "react";

export function ShareDashboardButton() {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"summary" | "full">("summary");
  const [days, setDays] = useState(30);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true);
    setUrl(null);
    setCopied(false);
    try {
      const res = await fetch("/api/admin/insights/share-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, expiresInDays: days }),
      });
      const data = await res.json();
      if (data.ok) setUrl(data.url);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-ink/20 bg-bone-soft px-3 py-1 text-[11px] font-medium text-ink/70 hover:bg-bone hover:text-ink"
      >
        🔗 Compartir
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(false)}
        className="rounded-full border border-ink/20 bg-bone-soft px-3 py-1 text-[11px] font-medium text-ink/70 hover:bg-bone"
      >
        ✕ Cerrar
      </button>
      <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-3xl border border-line bg-bone p-5 shadow-xl">
        <p className="font-display text-sm font-semibold text-ink">
          Generar enlace compartible
        </p>
        <p className="mt-1 text-xs text-ink/60">
          URL firmada con HMAC. Read-only, sin acciones, sin secrets.
        </p>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="text-[11px] font-medium text-ink/70">Alcance</span>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as "summary" | "full")}
              className="mt-1 w-full rounded-full border border-line bg-bone-soft px-3 py-1.5 text-xs"
            >
              <option value="summary">Resumido (solo KPIs)</option>
              <option value="full">Completo (+ top productos + categorías)</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-ink/70">
              Validez (días)
            </span>
            <input
              type="number"
              min={1}
              max={180}
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value) || 30)}
              className="mt-1 w-full rounded-full border border-line bg-bone-soft px-3 py-1.5 font-mono text-xs"
            />
          </label>
          <button
            onClick={generate}
            disabled={busy}
            className="w-full rounded-full bg-ink px-4 py-2 text-xs font-semibold text-bone hover:bg-accent disabled:opacity-50"
          >
            {busy ? "Generando…" : "Generar URL"}
          </button>
        </div>

        {url && (
          <div className="mt-4 space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-ink/55">
              URL lista
            </p>
            <input
              type="text"
              readOnly
              value={url}
              className="w-full rounded-full border border-line bg-bone-soft px-3 py-1.5 font-mono text-[10px]"
            />
            <button
              onClick={copy}
              className="w-full rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              {copied ? "✓ Copiado" : "Copiar al portapapeles"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
