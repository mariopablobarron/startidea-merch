"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

type Recommendation = {
  slug: string;
  name: string;
  ref: string;
  category?: string;
  primaryImageUrl?: string | null;
  url: string;
  rationale: string;
};

type QuoteItem = {
  description: string;
  notFound: boolean;
  searchedAs?: string;
  quantity: number;
  sizes?: Record<string, number> | null;
  technique: string | null;
  colorRequested: string | null;
  rationale: string;
  product: {
    slug: string;
    name: string;
    ref: string;
    url: string;
    primaryImageUrl: string | null;
  } | null;
  unitPriceCents: number | null;
  markingPerUnitCents: number;
  markingSetupCents: number;
  totalCents: number | null;
  priceSource: "tier" | "estimate" | null;
};

type ApiResponse =
  | {
      ok: true;
      mode?: "recommend" | "quote";
      needsClarification: boolean;
      clarificationQuestion: string | null;
      recommendations: Recommendation[];
      quoteItems?: QuoteItem[];
      quoteTotalCents?: number | null;
      summary: string;
    }
  | {
      ok: true;
      fallback: true;
      summary: string;
      redirectUrl: string;
      recommendations: never[];
    }
  | { error: string; hint?: string };

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

const TECHNIQUE_LABEL: Record<string, string> = {
  serigrafia: "Serigrafía",
  bordado: "Bordado",
  laser: "Grabado láser",
  dtf: "DTF",
  tampografia: "Tampografía",
};

export function Recommender() {
  const [brief, setBrief] = useState("");
  const [budget, setBudget] = useState("");
  const [quantity, setQuantity] = useState("");
  const [ecoOnly, setEcoOnly] = useState(false);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (brief.trim().length < 20) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: brief.trim(),
          budget: budget ? Number(budget) : undefined,
          quantity: quantity ? Number(quantity) : undefined,
          ecoOnly: ecoOnly || undefined,
        }),
      });
      const data: ApiResponse = await res.json();
      // Si el modelo devolvió algo no parseable, el endpoint envía fallback
      // con redirectUrl al catálogo filtrado. Llevamos al cliente directamente.
      if ("ok" in data && "fallback" in data && data.fallback && data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      setResult(data);
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Error desconocido" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr,1.2fr]">
      <form onSubmit={onSubmit} className="rounded-3xl border border-line bg-bone p-7 lg:p-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
          Asistente de selección
        </p>
        <h2 className="mt-3 font-display text-3xl font-semibold text-ink">
          Cuéntanos qué necesitas y te damos catálogo + precio en segundos.
        </h2>
        <p className="mt-3 text-sm text-ink/65">
          Acepta brief exploratorio (ej. «regalo de evento, 250&nbsp;ud, presupuesto 4&nbsp;€/ud»)
          o lista de cotización detallada con cantidades, tallas y técnicas de marcaje.
        </p>

        <label className="mt-7 block">
          <span className="text-sm font-medium text-ink">¿Qué buscas?</span>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={7}
            minLength={20}
            maxLength={2000}
            placeholder={`Ejemplo cotización multi-item:\n\nToallas de microfibra serigrafiadas: 100 ud\nPolo hombre negro con logo bordado a 1 color: 20 talla M, 20 L, 20 XL\nPolo mujer negro con logo bordado a 1 color: 15 S, 15 M, 15 L`}
            className="mt-2 w-full rounded-2xl border border-line bg-bone-soft px-4 py-3 text-base outline-none transition focus:border-accent"
            required
          />
          <span className="mt-1 block text-xs text-ink/50">
            {brief.trim().length} / 2000 — mínimo 20 caracteres.
          </span>
        </label>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-ink/50">Cantidad</span>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              min={1}
              placeholder="ej. 250"
              className="mt-1 w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-ink/50">Presupuesto total (€)</span>
            <input
              type="number"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              min={1}
              placeholder="ej. 1000"
              className="mt-1 w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
        </div>

        <label className="mt-5 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ecoOnly}
            onChange={(e) => setEcoOnly(e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          <span>Solo productos eco / sostenibles (bambú, RPET, orgánico, reciclado)</span>
        </label>

        <button
          type="submit"
          disabled={loading || brief.trim().length < 20}
          className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-3.5 text-base font-medium text-bone transition hover:bg-accent disabled:opacity-40"
        >
          {loading ? "Analizando catálogo…" : "Recomendar productos"}
        </button>

        <p className="mt-4 text-[11px] leading-relaxed text-ink/50">
          ⓘ El asistente revisa hasta 500 productos del catálogo. Si pegas una lista detallada,
          detecta cada item con cantidad/talla/técnica y te calcula precio orientativo + total.
          La cotización formal la cierra un humano en menos de 24 h.
        </p>
      </form>

      <div>
        {!result && !loading && (
          <div className="rounded-3xl border border-dashed border-line bg-bone-soft p-10 text-center">
            <svg
              className="mx-auto h-10 w-10 text-ink/30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m12.728 0-.707.707M6.343 17.657l-.707.707M16 21h-2m-4 0H8" />
              <path d="M12 19a7 7 0 1 0-7-7c0 2.5 1.5 5 3.5 6.5V19z" />
            </svg>
            <p className="mt-4 font-display text-lg font-semibold text-ink">
              Tus recomendaciones aparecerán aquí.
            </p>
            <p className="mt-2 max-w-md text-sm text-ink/60">
              Cuanto más concreto sea tu brief, mejor la recomendación. Ejemplo: público,
              cantidad, fecha límite, presupuesto, sector, valores que quieres comunicar.
            </p>
          </div>
        )}

        {loading && (
          <div className="rounded-3xl border border-line bg-bone-soft p-10 text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-line border-t-accent" />
            <p className="mt-4 font-display text-lg font-semibold text-ink">
              Leyendo el catálogo…
            </p>
            <p className="mt-2 text-sm text-ink/60">Tarda 5-15 segundos.</p>
          </div>
        )}

        {result && "error" in result && (
          <div className="rounded-3xl border border-line bg-accent-wash p-7">
            <p className="font-display text-lg font-semibold text-accent-deep">
              {result.error}
            </p>
            {result.hint && <p className="mt-2 text-sm text-ink/70">{result.hint}</p>}
            <p className="mt-4 text-sm text-ink/60">
              Mientras tanto, puedes buscar tú mismo en{" "}
              <Link href="/catalogo" className="font-medium text-accent underline-offset-4 hover:underline">
                el catálogo
              </Link>{" "}
              o pedir cotización con tu brief en{" "}
              <Link href="/#cotizar" className="font-medium text-accent underline-offset-4 hover:underline">
                el formulario
              </Link>.
            </p>
          </div>
        )}

        {result && "ok" in result && "needsClarification" in result && result.needsClarification && result.clarificationQuestion && (
          <div className="rounded-3xl border border-accent bg-accent-wash p-7">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60-deep">
              Necesito un detalle más
            </p>
            <p className="mt-3 font-display text-xl font-semibold text-ink">
              {result.clarificationQuestion}
            </p>
            <p className="mt-3 text-sm text-ink/70">
              Añádelo a tu brief y vuelve a pedir recomendación.
            </p>
          </div>
        )}

        {/* Modo COTIZACIÓN MULTI-ITEM — cuando el LLM detectó N items con cantidades */}
        {result && "ok" in result && "quoteItems" in result && result.quoteItems && result.quoteItems.length > 0 && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              {result.quoteItems.length} {result.quoteItems.length === 1 ? "item detectado" : "items detectados"} en tu brief
            </p>
            <h3 className="mt-2 font-display text-2xl font-semibold text-ink">
              Cotización orientativa
            </h3>
            <ul className="mt-6 space-y-4">
              {result.quoteItems.map((it, idx) => (
                <li
                  key={idx}
                  className={`overflow-hidden rounded-3xl border ${
                    it.notFound ? "border-accent-deep/40 bg-accent-wash/40" : "border-line bg-bone"
                  } p-5 transition hover:shadow-md`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row">
                    {it.product?.primaryImageUrl ? (
                      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-bone-soft">
                        <Image
                          src={it.product.primaryImageUrl}
                          alt={it.product.name}
                          fill
                          sizes="96px"
                          className="object-contain p-2"
                        />
                      </div>
                    ) : (
                      <div className="grid h-24 w-24 shrink-0 place-items-center rounded-2xl bg-bone-soft text-3xl">
                        {it.notFound ? "❓" : "📦"}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] uppercase tracking-wider text-ink/50">
                        Item {idx + 1}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm font-medium text-ink">{it.description}</p>
                      {it.product ? (
                        <Link href={it.product.url} className="mt-2 inline-block font-display text-lg font-semibold text-ink hover:text-accent">
                          {it.product.name} <span className="text-xs text-ink/40">· Ref. {it.product.ref}</span>
                        </Link>
                      ) : (
                        <p className="mt-2 text-sm text-accent-deep">
                          ⚠ No encontrado en catálogo. Buscamos como: <em>{it.searchedAs || "—"}</em>
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="rounded-full bg-bone-soft px-2 py-0.5 text-ink/70">
                          Cantidad: <strong>{it.quantity} ud</strong>
                        </span>
                        {it.technique && (
                          <span className="rounded-full bg-accent-wash px-2 py-0.5 text-accent-deep">
                            {TECHNIQUE_LABEL[it.technique] || it.technique}
                          </span>
                        )}
                        {it.colorRequested && (
                          <span className="rounded-full bg-bone-soft px-2 py-0.5 text-ink/70">
                            Color: {it.colorRequested}
                          </span>
                        )}
                      </div>
                      {it.sizes && Object.keys(it.sizes).length > 0 && (
                        <p className="mt-2 text-xs text-ink/60">
                          Tallas:{" "}
                          {Object.entries(it.sizes)
                            .map(([s, q]) => `${s}×${q}`)
                            .join(" · ")}
                        </p>
                      )}
                      {it.rationale && (
                        <p className="mt-2 text-xs italic text-ink/55">{it.rationale}</p>
                      )}
                    </div>
                    {/* Precio */}
                    <div className="text-right sm:min-w-[140px]">
                      {it.unitPriceCents != null ? (
                        <>
                          <p className="text-[10px] uppercase tracking-wider text-ink/50">
                            Estimado total
                          </p>
                          <p className="font-display text-2xl font-semibold tabular-nums text-ink">
                            {EUR.format((it.totalCents || 0) / 100)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-ink/55">
                            {EUR.format(it.unitPriceCents / 100)}/ud
                            {it.markingPerUnitCents > 0 && (
                              <>
                                {" + "}
                                {EUR.format(it.markingPerUnitCents / 100)} marcaje
                              </>
                            )}
                          </p>
                          {it.markingSetupCents > 0 && (
                            <p className="text-[10px] text-ink/45">
                              + {EUR.format(it.markingSetupCents / 100)} setup técnica
                            </p>
                          )}
                          {it.priceSource === "estimate" && (
                            <p className="mt-1 text-[10px] text-accent-deep">≈ estimado</p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-ink/50">Precio bajo cotización formal</p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {result.quoteTotalCents != null && result.quoteTotalCents > 0 && (
              <div className="mt-6 flex items-center justify-between rounded-3xl border-2 border-ink bg-bone p-5">
                <span className="font-display text-lg font-semibold text-ink">Total estimado</span>
                <span className="font-display text-3xl font-bold tabular-nums text-ink">
                  {EUR.format(result.quoteTotalCents / 100)}
                </span>
              </div>
            )}

            <p className="mt-4 rounded-2xl bg-bone-soft p-4 text-xs italic text-ink/70">
              ⓘ <strong>Precios orientativos</strong>: incluyen producto + marcaje (técnica + setup) según
              tarifa estándar 2026. Cotización formal cerrada (con muestras y plazo cerrado) en
              menos de 24 h laborables.
            </p>

            {result.summary && (
              <p className="mt-3 rounded-2xl bg-accent-wash p-4 text-sm italic text-ink/80">
                {result.summary}
              </p>
            )}

            <Link
              href="/#cotizar"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-bone transition hover:bg-accent-dark"
            >
              Pedir cotización formal ahora →
            </Link>
          </div>
        )}

        {/* Modo RECOMMEND — cuando el LLM detectó brief exploratorio */}
        {result && "ok" in result && (!("needsClarification" in result) || !result.needsClarification) && (!("quoteItems" in result) || !result.quoteItems || result.quoteItems.length === 0) && result.recommendations.length > 0 && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              {result.recommendations.length} recomendaciones para ti
            </p>
            <ul className="mt-4 space-y-4">
              {result.recommendations.map((r) => (
                <li
                  key={r.slug}
                  className="overflow-hidden rounded-3xl border border-line bg-bone transition hover:border-accent/40 hover:shadow-lg"
                >
                  <Link href={r.url} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                    <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-2xl bg-bone-soft sm:h-28 sm:w-28">
                      {r.primaryImageUrl ? (
                        <Image
                          src={r.primaryImageUrl}
                          alt={r.name}
                          fill
                          sizes="128px"
                          className="object-contain p-3"
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-xs text-ink/40">Sin imagen</div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] uppercase tracking-wider text-ink/50">
                        {r.category || "—"}
                      </p>
                      <p className="mt-1 font-display text-lg font-semibold text-ink">
                        {r.name}
                      </p>
                      <p className="text-xs text-ink/40">Ref. {r.ref}</p>
                      <p className="mt-2 text-sm text-ink/70">{r.rationale}</p>
                      <span className="mt-3 inline-block text-xs font-medium text-accent">
                        Ver ficha y cotizar →
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {result.summary && (
              <p className="mt-6 rounded-2xl bg-accent-wash p-4 text-sm italic text-ink/80">
                {result.summary}
              </p>
            )}
            <Link
              href="/#cotizar"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-medium text-bone transition hover:bg-accent"
            >
              Cotizar con detalle ahora →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
