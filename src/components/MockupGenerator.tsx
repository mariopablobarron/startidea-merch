"use client";

import { useState } from "react";
import { displayPositionId } from "@/lib/marking-position-display";

type Position = { id: string; positionId: string };

type MockupWarning = {
  code: string;
  level: "info" | "warn";
  text: string;
};

export function MockupGenerator({
  productSlug,
  positions,
}: {
  productSlug: string;
  positions: Position[];
}) {
  // Abierto por defecto — el visitante debe poder subir logo sin pasos extra
  const [open, setOpen] = useState(true);
  const [positionId, setPositionId] = useState(positions[0]?.positionId || "");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<MockupWarning[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("El logo pesa más de 5 MB. Súbelo más ligero.");
      return;
    }
    setLoading(true);
    setError(null);
    setWarnings([]);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      fd.append("productSlug", productSlug);
      if (positionId) fd.append("positionId", positionId);
      const res = await fetch("/api/mockup/generate", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || `Error ${res.status}`);
        return;
      }
      // Leer warnings del header (base64 JSON)
      const warningsB64 = res.headers.get("X-Mockup-Warnings");
      if (warningsB64) {
        try {
          const decoded = atob(warningsB64);
          const parsed = JSON.parse(decoded) as MockupWarning[];
          if (Array.isArray(parsed)) setWarnings(parsed);
        } catch {
          /* swallow */
        }
      }
      const blob = await res.blob();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  if (positions.length === 0) return null;

  return (
    <div className="mt-6 rounded-3xl border border-line bg-bone p-6 lg:p-8">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
            — Previsualización rápida
          </p>
          <p className="mt-1 font-display text-xl font-semibold text-ink">
            Sube tu logo y mira cómo encaja.
          </p>
          <p className="mt-1 text-sm text-ink/60">
            Es una <strong>simulación visual aproximada</strong> — el mockup técnico
            final lo prepara el fabricante con dimensiones exactas y se valida
            contigo antes de producir.
          </p>
        </div>
        <svg
          className={`h-5 w-5 text-ink/50 transition ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="mt-5 space-y-4">
          {positions.length > 1 && (
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wider text-ink/50">Zona</span>
              <select
                value={positionId}
                onChange={(e) => setPositionId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
              >
                {positions.map((p) => (
                  <option key={p.id} value={p.positionId}>
                    {displayPositionId(p.positionId)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-bone-soft px-6 py-8 text-center transition hover:border-accent">
            <svg className="h-8 w-8 text-ink/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="text-sm font-medium text-ink">Subir logo (PNG, JPG, SVG)</span>
            <span className="text-xs text-ink/50">Máx 5 MB · Recomendado fondo transparente</span>
            <input type="file" accept="image/*" onChange={onFile} className="hidden" />
          </label>

          {loading && (
            <div className="rounded-2xl bg-bone-soft p-5 text-center text-sm text-ink/60">
              Generando mockup…
            </div>
          )}

          {error && (
            <div className="rounded-2xl bg-accent-wash p-3 text-xs text-accent-deep">⚠ {error}</div>
          )}

          {previewUrl && !loading && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-ink/50">
                Resultado · previsualización
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Mockup generado"
                className="mt-2 w-full rounded-2xl border border-line bg-bone-soft"
              />

              {/* Warnings de validación geométrica (Capa B) */}
              {warnings.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {warnings.map((w) => (
                    <li
                      key={w.code}
                      className={`flex gap-2 rounded-xl border p-3 text-[13px] leading-relaxed ${
                        w.level === "warn"
                          ? "border-accent/30 bg-accent/5 text-ink/80"
                          : "border-line bg-bone-soft text-ink/70"
                      }`}
                    >
                      <span className="text-base leading-none">
                        {w.level === "warn" ? "⚠" : "ⓘ"}
                      </span>
                      <span className="flex-1">{w.text}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Disclaimer fuerte legal-friendly */}
              <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-4">
                <p className="font-display text-sm font-semibold text-ink">
                  ⚠ Esta no es la imagen final del producto
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink/75">
                  Es una simulación rápida para que veas cómo encaja tu logo en la
                  zona elegida. El <strong>mockup técnico real</strong> lo prepara
                  el fabricante con las medidas exactas del área de marcaje, la
                  técnica seleccionada y las proporciones correctas — y te lo
                  enviamos para que lo apruebes <strong>antes de producir nada</strong>.
                </p>
                <p className="mt-2 text-[12px] text-ink/55">
                  Sin tu aprobación expresa del mockup técnico final, no producimos.
                </p>
              </div>

              <a
                href={previewUrl}
                download="previsualizacion.png"
                className="mt-3 inline-block text-xs text-accent underline-offset-4 hover:underline"
              >
                Descargar previsualización →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
