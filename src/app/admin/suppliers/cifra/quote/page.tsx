"use client";

/**
 * /admin/suppliers/cifra/quote
 *
 * Cotizador rápido para Cifra. Mario mete model/slug + qty, ve técnicas
 * disponibles + cotización detallada por técnica.
 *
 * Útil para responder "Pedir cotización" del cliente sin tener que abrir
 * el catálogo + hacer cuentas a mano.
 */

import { useState } from "react";

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

type TechniqueOpt = {
  techniqueCode: string;
  techniqueLabel: string;
  markupPct: number;
  setupCents: number | null;
};

type ProductInfo = {
  slug: string;
  ref: string;
  name: string;
  markingTechniqueHint: string | null;
  markingSizeHint: string | null;
  hasRealPricing: boolean;
};

type ListResp = {
  ok: true;
  product: ProductInfo;
  qty: number;
  productUnitPriceCents: number;
  productTotalCents: number;
  techniques: TechniqueOpt[];
};

type QuoteResp = {
  ok: true;
  product: { slug: string; ref: string; name: string };
  qty: number;
  productUnitPriceCents: number;
  productTotalCents: number;
  marking: {
    techniqueCode: string;
    techniqueLabel: string;
    markupPct: number;
    unitMarkupCents: number;
    setupCents: number;
    totalMarkingCents: number;
  };
  grandTotalCents: number;
  unitTotalCents: number;
};

export default function CifraQuotePage() {
  const [modelOrSlug, setModelOrSlug] = useState("");
  const [qty, setQty] = useState("500");
  const [techniqueCode, setTechniqueCode] = useState("");
  const [list, setList] = useState<ListResp | null>(null);
  const [quote, setQuote] = useState<QuoteResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function isSlug(v: string): boolean {
    return /[a-z-]/.test(v) && !/^\d/.test(v);
  }

  async function fetchInfo() {
    setLoading(true);
    setError(null);
    setQuote(null);
    try {
      const ref = modelOrSlug.trim();
      const payload: Record<string, unknown> = {
        qty: parseInt(qty, 10),
      };
      if (isSlug(ref)) payload.slug = ref;
      else payload.model = ref;

      const r = await fetch("/api/admin/suppliers/cifra/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || `Error ${r.status}`);
        setList(null);
        return;
      }
      setList(d);
      setTechniqueCode("");
    } finally {
      setLoading(false);
    }
  }

  async function fetchQuote() {
    if (!list || !techniqueCode) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/suppliers/cifra/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          model: list.product.ref,
          qty: parseInt(qty, 10),
          techniqueCode,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || `Error ${r.status}`);
        return;
      }
      setQuote(d);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
            Proveedores · Cifra
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
            Cotizador rápido
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink/65">
            Saca presupuesto al momento: model/slug + cantidad → técnicas disponibles +
            cotización detallada (producto + marcaje + setup + total).
          </p>
        </header>

        {/* Form principal */}
        <section className="rounded-3xl border border-line bg-bone p-5">
          <div className="grid gap-3 sm:grid-cols-[2fr,1fr,auto]">
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-ink/55">
                Modelo o slug
              </label>
              <input
                type="text"
                value={modelOrSlug}
                onChange={(e) => setModelOrSlug(e.target.value)}
                placeholder="10991 / neceser-kate"
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-sm outline-none focus:border-accent"
                onKeyDown={(e) => e.key === "Enter" && fetchInfo()}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-ink/55">
                Cantidad
              </label>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-right font-mono text-sm outline-none focus:border-accent"
                onKeyDown={(e) => e.key === "Enter" && fetchInfo()}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={fetchInfo}
                disabled={loading || !modelOrSlug.trim()}
                className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
              >
                {loading ? "..." : "Buscar"}
              </button>
            </div>
          </div>
          {error && (
            <p className="mt-3 rounded-xl bg-accent-wash p-3 text-sm text-accent-deep">⚠ {error}</p>
          )}
        </section>

        {/* Resultado producto + técnicas */}
        {list && (
          <section className="mt-6 rounded-3xl border border-line bg-bone p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-ink/55">
                  {list.product.ref} · <code className="font-mono">{list.product.slug}</code>
                </p>
                <h2 className="mt-1 font-display text-xl text-ink">{list.product.name}</h2>
                {list.product.markingTechniqueHint && (
                  <p className="mt-1 text-xs text-ink/65">
                    Técnicas catálogo: <code className="font-mono">{list.product.markingTechniqueHint}</code>
                    {list.product.markingSizeHint && (
                      <> · Tamaño: <code className="font-mono">{list.product.markingSizeHint}</code></>
                    )}
                  </p>
                )}
                <p className="mt-2 text-[11px] text-ink/55">
                  {list.product.hasRealPricing ? (
                    <span className="rounded-full bg-social/15 px-2 py-0.5 text-social">
                      ✓ Tarifa REAL del PDF disponible
                    </span>
                  ) : (
                    <span className="rounded-full bg-bone-soft px-2 py-0.5 text-ink/55">
                      Solo % aproximado configurado
                    </span>
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wider text-ink/55">
                  Producto unit @ {list.qty}u
                </p>
                <p className="mt-1 font-display text-xl font-semibold tabular-nums text-ink">
                  {EUR.format(list.productUnitPriceCents / 100)}
                </p>
                <p className="mt-0.5 text-[11px] text-ink/55">
                  Subtotal producto: {EUR.format(list.productTotalCents / 100)}
                </p>
              </div>
            </div>

            {/* Técnicas disponibles */}
            {list.techniques.length === 0 ? (
              <p className="rounded-xl bg-bone-soft p-3 text-sm text-ink/65">
                Este producto no tiene técnicas configuradas. Da de alta reglas en{" "}
                <a href="/admin/suppliers/cifra/marking-rates" className="text-accent underline">
                  marking-rates
                </a>
                .
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/55">
                  Técnicas disponibles ({list.techniques.length})
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {list.techniques.map((t) => (
                    <button
                      key={t.techniqueCode}
                      onClick={() => {
                        setTechniqueCode(t.techniqueCode);
                        setTimeout(fetchQuote, 0);
                      }}
                      className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                        techniqueCode === t.techniqueCode
                          ? "border-accent bg-accent-wash"
                          : "border-line bg-bone-soft hover:border-ink/30"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <code className="font-mono text-xs text-accent-deep">{t.techniqueCode}</code>
                        <span className="text-[11px] tabular-nums text-ink/60">
                          +{t.markupPct}%
                          {t.setupCents ? ` · setup ${EUR.format(t.setupCents / 100)}` : ""}
                        </span>
                      </div>
                      <p className="mt-1 text-ink/80">{t.techniqueLabel}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Cotización detallada */}
        {quote && (
          <section className="mt-6 rounded-3xl border border-accent bg-bone p-5 shadow-md">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
              Cotización detallada
            </p>
            <p className="mt-1 text-sm text-ink/65">
              {quote.product.name} · <code className="font-mono">{quote.product.ref}</code> ·{" "}
              {quote.qty} unidades · {quote.marking.techniqueLabel}{" "}
              <code className="font-mono text-xs">({quote.marking.techniqueCode})</code>
            </p>

            <table className="mt-4 w-full text-sm">
              <tbody className="divide-y divide-line">
                <tr>
                  <td className="py-2 text-ink/70">Producto base ({quote.qty} × {EUR.format(quote.productUnitPriceCents / 100)})</td>
                  <td className="py-2 text-right font-mono tabular-nums text-ink">{EUR.format(quote.productTotalCents / 100)}</td>
                </tr>
                <tr>
                  <td className="py-2 text-ink/70">
                    Marcaje unitario ({quote.qty} × {EUR.format(quote.marking.unitMarkupCents / 100)})
                    {quote.marking.markupPct > 0 && (
                      <span className="ml-2 text-[10px] text-ink/45">approx +{quote.marking.markupPct}%</span>
                    )}
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums text-ink">
                    {EUR.format((quote.marking.unitMarkupCents * quote.qty) / 100)}
                  </td>
                </tr>
                {quote.marking.setupCents > 0 && (
                  <tr>
                    <td className="py-2 text-ink/70">Setup (cliché/film/láser)</td>
                    <td className="py-2 text-right font-mono tabular-nums text-ink">
                      {EUR.format(quote.marking.setupCents / 100)}
                    </td>
                  </tr>
                )}
                <tr className="border-t-2 border-ink/30">
                  <td className="pt-3 text-sm font-semibold text-ink">TOTAL</td>
                  <td className="pt-3 text-right font-display text-xl font-semibold tabular-nums text-accent">
                    {EUR.format(quote.grandTotalCents / 100)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-[11px] text-ink/55">Precio unitario todo incluido</td>
                  <td className="py-2 text-right font-mono tabular-nums text-ink/70">
                    {EUR.format(quote.unitTotalCents / 100)}/u
                  </td>
                </tr>
              </tbody>
            </table>

            <p className="mt-4 text-[11px] text-ink/45">
              Esta cotización es aproximada — confirma con Cifra el coste real de marcaje antes de
              cerrar pedidos &gt; 1 000 €.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
