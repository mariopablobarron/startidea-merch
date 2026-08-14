"use client";

import { useState } from "react";
import { positionOptionLabel } from "@/lib/marking-position-label";
import { decideMockupPanelMode, mockupPanelHeading } from "@/lib/mockup-panel-mode";

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
  // Capa D: petición de mockup técnico real al equipo (4h laborables)
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [requestSending, setRequestSending] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [reqName, setReqName] = useState("");
  const [reqEmail, setReqEmail] = useState("");
  const [reqCompany, setReqCompany] = useState("");
  const [reqPhone, setReqPhone] = useState("");
  const [reqBrief, setReqBrief] = useState("");

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (requestSending) return;
    setRequestSending(true);
    setRequestError(null);
    try {
      const res = await fetch("/api/mockup-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productSlug,
          positionId: positionId || null,
          name: reqName,
          email: reqEmail,
          company: reqCompany || null,
          phone: reqPhone || null,
          brief: reqBrief || null,
          sourceUrl: typeof window !== "undefined" ? window.location.href : null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setRequestError(j.error || `Error ${res.status}`);
        return;
      }
      setRequestSent(true);
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setRequestSending(false);
    }
  }

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

  // Sin zonas de marcaje NO se devuelve null: la ficha promete «boceto con tu
  // logo gratis» sin condición, así que quedarse en blanco deja la promesa sin
  // ningún sitio donde cumplirse (613 fichas activas el 14-ago-2026). Lo que se
  // cae es la simulación automática, no la petición al equipo.
  const modo = decideMockupPanelMode(positions.length);
  const soloPeticion = modo === "solo-peticion";
  const cabecera = mockupPanelHeading(modo);

  return (
    <div className="mt-6 rounded-3xl border border-line bg-bone p-6 lg:p-8">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
            {cabecera.kicker}
          </p>
          <p className="mt-1 font-display text-xl font-semibold text-ink">
            {cabecera.title}
          </p>
          <p className="mt-1 text-sm text-ink/60">{cabecera.body}</p>
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
                {positions.map((p, i) => (
                  <option key={p.id} value={p.positionId}>
                    {positionOptionLabel(p, i)}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Sin zonas de marcaje no hay dónde colocar el logo: el subidor se cae
              (y con él, por construcción, el loading, el error y la preview, que
              solo pueden existir tras un archivo). La Capa D de abajo se queda. */}
          {!soloPeticion && (
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
          )}

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

          {/* ── Capa D — mockup técnico hecho por el equipo en 4h ─────── */}
          <div className="mt-6 rounded-2xl border border-line bg-bone-soft p-5">
            {!requestOpen && !requestSent && (
              <button
                type="button"
                onClick={() => setRequestOpen(true)}
                className="flex w-full flex-col items-start gap-1 text-left"
              >
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
                  {soloPeticion ? "— Mockup técnico real" : "— Mejor con mockup técnico real"}
                </p>
                <p className="font-display text-base font-semibold text-ink">
                  {soloPeticion
                    ? "Pídenos el boceto: te lo mandamos en 4h laborables."
                    : "¿Prefieres que te lo hagamos nosotros? Te lo mandamos en 4h laborables."}
                </p>
                <p className="text-[13px] text-ink/65 leading-relaxed">
                  Mockup técnico con medidas exactas, técnica correcta y validación
                  del fabricante. Gratis, sin compromiso.
                </p>
                <span className="mt-1 text-xs font-medium text-accent">
                  Pedirlo →
                </span>
              </button>
            )}

            {requestOpen && !requestSent && (
              <form onSubmit={submitRequest} className="space-y-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
                    — Mockup técnico en 4h
                  </p>
                  <p className="mt-1 text-sm text-ink/70 leading-relaxed">
                    Te lo prepara el equipo con dimensiones exactas y técnica
                    recomendada. Respuesta en menos de 4h laborables.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-medium uppercase tracking-wider text-ink/50">Nombre*</span>
                    <input
                      type="text"
                      required
                      value={reqName}
                      onChange={(e) => setReqName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-accent"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium uppercase tracking-wider text-ink/50">Email*</span>
                    <input
                      type="email"
                      required
                      value={reqEmail}
                      onChange={(e) => setReqEmail(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-accent"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium uppercase tracking-wider text-ink/50">Empresa</span>
                    <input
                      type="text"
                      value={reqCompany}
                      onChange={(e) => setReqCompany(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-accent"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium uppercase tracking-wider text-ink/50">Teléfono</span>
                    <input
                      type="tel"
                      value={reqPhone}
                      onChange={(e) => setReqPhone(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-accent"
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="text-xs font-medium uppercase tracking-wider text-ink/50">
                    Brief breve (opcional)
                  </span>
                  <textarea
                    rows={3}
                    value={reqBrief}
                    onChange={(e) => setReqBrief(e.target.value)}
                    placeholder="Colores corporativos, plazo aproximado, cantidades, técnica que prefieres…"
                    className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-accent"
                  />
                </label>
                {requestError && (
                  <div className="rounded-xl bg-accent/10 p-3 text-xs text-accent-deep">
                    ⚠ {requestError}
                  </div>
                )}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button
                    type="submit"
                    disabled={requestSending || !reqName.trim() || !reqEmail.trim()}
                    className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
                  >
                    {requestSending ? "Enviando…" : "Pedir mockup técnico →"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequestOpen(false)}
                    className="text-xs text-ink/60 hover:text-ink"
                  >
                    Cancelar
                  </button>
                </div>
                <p className="text-[11px] text-ink/45">
                  Tus datos sólo se usan para enviarte el mockup técnico. Sin compromiso,
                  sin spam.
                </p>
              </form>
            )}

            {requestSent && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
                  — Recibido
                </p>
                <p className="mt-1 font-display text-base font-semibold text-ink">
                  Estamos en ello. Te llega mockup técnico en menos de 4h laborables.
                </p>
                <p className="mt-2 text-[13px] text-ink/65 leading-relaxed">
                  Te confirmamos por email. Si necesitas algo antes, responde a esa
                  confirmación o escríbenos por WhatsApp +34 958 045 789.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
