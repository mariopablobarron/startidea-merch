"use client";

import { useEffect, useMemo, useState } from "react";
import { addItem } from "@/lib/cart-storage";

type Position = {
  id: string;
  positionId: string;
  maxWidthMm: number | null;
  maxHeightMm: number | null;
  techniques: { techniqueId: string; techniqueCode: string; techniqueName: string; maxColors: number | null }[];
};

type Props = {
  productSlug: string;
  productName: string;
  productRef: string;
  primaryImageUrl?: string | null;
  positions: Position[];
};

type CalcResponse =
  | {
      ok: true;
      quantity: number;
      product: { priceSource: "provider" | "estimate" };
      marking: { techniqueName: string; warning?: string } | null;
      pricing: { unitClient: { formatted: string }; totalClient: { formatted: string } };
      disclaimer: string;
    }
  | { error: string };

const MANIPULATIONS = [
  { code: "Z", label: "Muy sencillo (1 color, formas simples)" },
  { code: "A", label: "Sencillo (1-2 colores, sin detalles finos)" },
  { code: "B", label: "Medio (3+ colores o detalles)" },
  { code: "C", label: "Complejo (degradados, fotografía)" },
];

export function MarkingCalculator({ productSlug, productName, productRef, primaryImageUrl, positions }: Props) {
  const [open, setOpen] = useState(false);
  const positionsAvailable = positions.filter((p) => p.techniques.length > 0);
  const [positionIdx, setPositionIdx] = useState(0);
  const [techIdx, setTechIdx] = useState(0);
  const [qty, setQty] = useState(100);
  const [colours, setColours] = useState(1);
  const [manipulation, setManipulation] = useState("A");
  const [calc, setCalc] = useState<CalcResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const position = positionsAvailable[positionIdx];
  const technique = position?.techniques[techIdx];
  const maxColors = technique?.maxColors ?? 1;

  const printAreaCm2 = useMemo(() => {
    if (!position?.maxWidthMm || !position?.maxHeightMm) return undefined;
    return (position.maxWidthMm / 10) * (position.maxHeightMm / 10);
  }, [position]);

  // Recalcular en cambios (debounced)
  useEffect(() => {
    if (!open || !position || !technique) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/quote/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productSlug,
            quantity: qty,
            techniqueCode: technique.techniqueCode,
            numberOfColours: Math.min(colours, maxColors),
            printAreaCm2,
            manipulationCode: manipulation,
            positionCount: 1,
          }),
        });
        const data: CalcResponse = await res.json();
        setCalc(data);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [open, productSlug, qty, technique?.techniqueCode, colours, manipulation, printAreaCm2, position, technique, maxColors]);

  function onCotizar() {
    if (!technique) return;
    const detail = `${productName} (ref. ${productRef}) · ${qty} uds · ${technique.techniqueName} en ${position.positionId}${colours > 1 ? ` · ${colours} colores` : ""}`;
    try {
      sessionStorage.setItem("merch:prefill", detail);
      sessionStorage.setItem("merch:prefill-ref", productRef);
      sessionStorage.setItem("merch:prefill-slug", productSlug);
      sessionStorage.setItem("merch:prefill-qty", String(qty));
    } catch {}
    window.location.href = "/#cotizar";
  }

  function onAddToCart() {
    if (!technique || !position) return;
    const totalClientCents = parseTotalCents(calc);
    const unitClientCents = totalClientCents != null ? Math.round(totalClientCents / qty) : null;
    addItem({
      productSlug,
      productRef,
      productName,
      primaryImageUrl,
      quantity: qty,
      markingTechniqueCode: technique.techniqueCode,
      markingTechniqueName: technique.techniqueName,
      markingPositionId: position.positionId,
      markingColours: Math.min(colours, maxColors),
      markingComplexity: manipulation,
      unitPriceClientCents: unitClientCents,
      totalClientCents,
    });
    // feedback simple
    setAddedAt(Date.now());
  }

  const [addedAt, setAddedAt] = useState<number | null>(null);
  const recentlyAdded = addedAt != null && Date.now() - addedAt < 2500;
  useEffect(() => {
    if (!addedAt) return;
    const t = setTimeout(() => setAddedAt(null), 2500);
    return () => clearTimeout(t);
  }, [addedAt]);

  if (positionsAvailable.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 rounded-3xl border border-line bg-bone p-6 lg:p-8">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-accent">
            Calculadora de marcaje
          </p>
          <p className="mt-1 font-display text-xl font-semibold text-ink">
            ¿Cuánto cuesta personalizarlo con tu logo?
          </p>
          <p className="mt-1 text-sm text-ink/60">
            Selecciona zona, técnica y cantidad para ver precio orientativo.
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
        <div className="mt-6 grid gap-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wider text-ink/50">Zona de marcaje</span>
              <select
                value={positionIdx}
                onChange={(e) => {
                  setPositionIdx(parseInt(e.target.value));
                  setTechIdx(0);
                }}
                className="mt-1 w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
              >
                {positionsAvailable.map((p, i) => (
                  <option key={p.id} value={i}>
                    {p.positionId} ({p.maxWidthMm}×{p.maxHeightMm} mm)
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wider text-ink/50">Técnica</span>
              <select
                value={techIdx}
                onChange={(e) => setTechIdx(parseInt(e.target.value))}
                className="mt-1 w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
              >
                {position.techniques.map((t, i) => (
                  <option key={t.techniqueId} value={i}>
                    {t.techniqueName}
                    {t.maxColors ? ` · hasta ${t.maxColors} col.` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wider text-ink/50">Cantidad</span>
              <input
                type="number"
                value={qty}
                onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                min={1}
                max={1_000_000}
                className="mt-1 w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm tabular-nums outline-none focus:border-accent"
              />
            </label>

            {maxColors > 1 && (
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wider text-ink/50">Colores del logo</span>
                <select
                  value={colours}
                  onChange={(e) => setColours(parseInt(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
                >
                  {Array.from({ length: maxColors }).map((_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1} {i + 1 === 1 ? "color" : "colores"}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wider text-ink/50">Complejidad logo</span>
              <select
                value={manipulation}
                onChange={(e) => setManipulation(e.target.value)}
                className="mt-1 w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
              >
                {MANIPULATIONS.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Resultado */}
          <div className="mt-2 rounded-2xl bg-accent-wash p-5">
            {loading && (
              <p className="text-sm text-ink/60">Calculando…</p>
            )}
            {!loading && calc && "ok" in calc && (
              <>
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-accent-deep">
                      Total estimado · {qty.toLocaleString("es-ES")} uds
                    </p>
                    <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-ink">
                      {calc.pricing.totalClient.formatted}
                    </p>
                  </div>
                  <p className="text-right text-sm text-ink/60">
                    <span className="font-semibold tabular-nums text-ink">
                      {calc.pricing.unitClient.formatted}
                    </span>
                    <span className="block text-xs">/ud incl. marcaje</span>
                  </p>
                </div>
                {calc.marking?.warning && (
                  <p className="mt-3 rounded-lg bg-bone p-2.5 text-[11px] text-ink/60">
                    ⓘ {calc.marking.warning}
                  </p>
                )}
                <p className="mt-3 text-[11px] leading-relaxed text-ink/60">
                  {calc.disclaimer}
                </p>
              </>
            )}
            {!loading && calc && "error" in calc && (
              <p className="text-sm text-ink/70">⚠ {calc.error}</p>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onAddToCart}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-full border px-6 py-3 text-sm font-medium transition ${
                recentlyAdded
                  ? "border-social bg-social/10 text-social"
                  : "border-line bg-bone-soft text-ink hover:border-accent hover:text-accent"
              }`}
            >
              {recentlyAdded ? "✓ Añadido al carrito" : "Añadir al carrito de cotización"}
            </button>
            <button
              type="button"
              onClick={onCotizar}
              className="inline-flex w-full items-center justify-center rounded-full bg-ink px-6 py-3 text-sm font-medium text-bone transition hover:bg-accent"
            >
              Cotización cerrada en 24 h →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function parseTotalCents(calc: CalcResponse | null): number | null {
  if (!calc || !("ok" in calc)) return null;
  const formatted = calc.pricing.totalClient.formatted;
  // "485,60 €" → 48560
  const cleaned = formatted.replace(/[^0-9,]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
