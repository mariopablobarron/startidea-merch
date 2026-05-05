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

type ApiResponse =
  | {
      ok: true;
      needsClarification: boolean;
      clarificationQuestion: string | null;
      recommendations: Recommendation[];
      summary: string;
    }
  | { error: string; hint?: string };

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
        <p className="text-xs font-medium uppercase tracking-wider text-accent">
          Asistente de selección
        </p>
        <h2 className="mt-3 font-display text-3xl font-semibold text-ink">
          Cuéntanos qué necesitas y te recomendamos productos del catálogo en segundos.
        </h2>

        <label className="mt-7 block">
          <span className="text-sm font-medium text-ink">¿Qué buscas?</span>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={5}
            minLength={20}
            maxLength={2000}
            placeholder="Ej: Necesito 250 regalos para clientes empresa, evento navidad, presupuesto 4€/ud, prefiero algo eco-friendly y que se pueda personalizar con nuestro logo en color."
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
          ⓘ El asistente revisa los 250 productos más relevantes del catálogo y elige 3-5 que
          encajan con tu brief. Es una recomendación inicial — la cotización final la prepara
          un humano en menos de 24 h.
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

        {result && "ok" in result && result.needsClarification && result.clarificationQuestion && (
          <div className="rounded-3xl border border-accent bg-accent-wash p-7">
            <p className="text-xs font-medium uppercase tracking-wider text-accent-deep">
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

        {result && "ok" in result && !result.needsClarification && result.recommendations.length > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-accent">
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
