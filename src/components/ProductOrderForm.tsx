"use client";

import { useEffect, useMemo, useState } from "react";
import {
  defaultTiersFromBase,
  formatMoney,
  pickTier,
  type PriceTier,
} from "@/lib/pricing";
import { addItem } from "@/lib/cart-storage";
import { trackEvent } from "@/lib/track";

/**
 * Formulario unificado de pedido en ficha de producto.
 * Reemplaza la antigua trilogía PriceTierTable + QuantityConfigurator +
 * MarkingCalculator que mostraba precios contradictorios y duplicaba lógica.
 *
 * Flujo:
 *   1. Selector de cantidad (radio cards con badges Popular / Mejor precio)
 *   2. Toggle "¿Personalizar con tu logo?" Sí/No
 *      - Si Sí: selector técnica + posición + colores + complejidad → llama
 *        /api/quote/calculate (precio real con marcaje)
 *      - Si No: usa tiers locales (precio base sin marcaje)
 *   3. Total estimado en grande + desglose unidad
 *   4. Botones: "Añadir al pedido" + "Configurar y cotizar"
 *
 * Una sola fuente de verdad de precios. Sin contradicciones entre módulos.
 */

type Position = {
  id: string;
  positionId: string;
  maxWidthMm: number | null;
  maxHeightMm: number | null;
  techniques: {
    techniqueId: string;
    techniqueCode: string;
    techniqueName: string;
    maxColors: number | null;
  }[];
};

type CalcResponse =
  | {
      ok: true;
      quantity: number;
      product: { priceSource: "provider" | "estimate" };
      marking: { techniqueName: string; warning?: string } | null;
      pricing: {
        unitClient: { cents: number; formatted: string };
        totalClient: { cents: number; formatted: string };
      };
      disclaimer: string;
    }
  | { error: string };

const QTYS = [10, 25, 50, 100, 250, 500];
const MANIPULATIONS = [
  { code: "Z", label: "Muy sencillo (1 color)" },
  { code: "A", label: "Sencillo (1-2 colores)" },
  { code: "B", label: "Medio (3+ colores)" },
  { code: "C", label: "Complejo (degradados)" },
];

export function ProductOrderForm({
  productSlug,
  productRef,
  productName,
  primaryImageUrl,
  tiers,
  baseCentsForEstimate,
  positions,
}: {
  productSlug: string;
  productRef: string;
  productName: string;
  primaryImageUrl?: string | null;
  tiers?: PriceTier[];
  baseCentsForEstimate?: number;
  positions: Position[];
}) {
  // Fuente única de tramos locales (para el modo SIN marcaje)
  const localTiers: PriceTier[] = useMemo(() => {
    if (tiers && tiers.length > 0) return tiers;
    return baseCentsForEstimate ? defaultTiersFromBase(baseCentsForEstimate) : [];
  }, [tiers, baseCentsForEstimate]);

  const positionsAvailable = positions.filter((p) => p.techniques.length > 0);
  const canMark = positionsAvailable.length > 0;

  // Estado
  const [qty, setQty] = useState<number>(25);
  const [customQty, setCustomQty] = useState<string>("");
  const usingCustom = customQty.trim() !== "";
  const finalQty = usingCustom ? Math.max(1, parseInt(customQty, 10) || 0) : qty;

  const [withMarking, setWithMarking] = useState<boolean>(canMark);
  const [positionIdx, setPositionIdx] = useState(0);
  const [techIdx, setTechIdx] = useState(0);
  const [colours, setColours] = useState(1);
  const [manipulation, setManipulation] = useState("A");

  const position = positionsAvailable[positionIdx];
  const technique = position?.techniques[techIdx];
  const maxColors = technique?.maxColors ?? 1;
  const printAreaCm2 = useMemo(() => {
    if (!position?.maxWidthMm || !position?.maxHeightMm) return undefined;
    return (position.maxWidthMm / 10) * (position.maxHeightMm / 10);
  }, [position]);

  // Cálculo con API (solo si marcaje ON)
  const [calc, setCalc] = useState<CalcResponse | null>(null);
  const [loadingCalc, setLoadingCalc] = useState(false);

  useEffect(() => {
    if (!withMarking || !position || !technique) {
      setCalc(null);
      return;
    }
    const timer = setTimeout(async () => {
      setLoadingCalc(true);
      try {
        const res = await fetch("/api/quote/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productSlug,
            quantity: finalQty,
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
        setLoadingCalc(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [
    withMarking,
    productSlug,
    finalQty,
    technique?.techniqueCode,
    colours,
    manipulation,
    printAreaCm2,
    position,
    technique,
    maxColors,
  ]);

  // Precio calculado
  const localTier = pickTier(localTiers, finalQty);
  const apiOk = calc && "ok" in calc && calc.ok;

  const unitCents = withMarking
    ? apiOk
      ? calc.pricing.unitClient.cents
      : null
    : localTier?.unitPriceCents ?? null;
  const totalCents = withMarking
    ? apiOk
      ? calc.pricing.totalClient.cents
      : null
    : localTier
      ? localTier.unitPriceCents * finalQty
      : null;

  // Feedback "añadido al carrito"
  const [addedAt, setAddedAt] = useState<number | null>(null);
  useEffect(() => {
    if (!addedAt) return;
    const t = setTimeout(() => setAddedAt(null), 2500);
    return () => clearTimeout(t);
  }, [addedAt]);
  const recentlyAdded = addedAt != null && Date.now() - addedAt < 2500;

  function onAddToCart() {
    trackEvent({
      type: "addToCart",
      productSlug,
      payload: {
        qty: finalQty,
        technique: withMarking ? technique?.techniqueCode : null,
        totalCents,
      },
    });
    addItem({
      productSlug,
      productRef,
      productName,
      primaryImageUrl,
      quantity: finalQty,
      markingTechniqueCode: withMarking ? technique?.techniqueCode ?? null : null,
      markingTechniqueName: withMarking ? technique?.techniqueName ?? null : null,
      markingPositionId: withMarking ? position?.positionId ?? null : null,
      markingColours: withMarking ? Math.min(colours, maxColors) : null,
      markingComplexity: withMarking ? manipulation : null,
      unitPriceClientCents: unitCents,
      totalClientCents: totalCents,
    });
    setAddedAt(Date.now());
  }

  function onCotizar() {
    const markingTxt =
      withMarking && technique && position
        ? ` · ${technique.techniqueName} en ${position.positionId}${
            colours > 1 ? ` · ${colours} colores` : ""
          }`
        : " · sin marcaje";
    const detail = `${productName} (ref. ${productRef}) · ${finalQty} uds${markingTxt}`;
    try {
      sessionStorage.setItem("merch:prefill", detail);
      sessionStorage.setItem("merch:prefill-ref", productRef);
      sessionStorage.setItem("merch:prefill-slug", productSlug);
      sessionStorage.setItem("merch:prefill-qty", String(finalQty));
    } catch {}
    window.location.href = "/#cotizar";
  }

  return (
    <div className="mt-6 rounded-3xl border border-line bg-bone p-5 lg:p-6">
      <p className="text-xs font-medium uppercase tracking-wider text-accent">
        Pedir cotización
      </p>
      <h2 className="mt-1 font-display text-xl font-semibold text-ink">
        Configura tu pedido
      </h2>

      {/* 1. Cantidad */}
      <div className="mt-5">
        <p className="text-xs font-medium uppercase tracking-wider text-ink/50">
          ① Cantidad
        </p>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {QTYS.map((q) => {
            const t = pickTier(localTiers, q);
            if (!t) return null;
            const checked = !usingCustom && qty === q;
            return (
              <li key={q}>
                <button
                  type="button"
                  onClick={() => {
                    setCustomQty("");
                    setQty(q);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                    checked
                      ? "border-accent bg-accent/5"
                      : "border-line bg-bone-soft hover:border-accent"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Radio checked={checked} />
                    <span className="font-medium text-ink">{q} uds</span>
                    {t.badge === "POPULAR" && (
                      <Badge color="accent">Popular</Badge>
                    )}
                    {t.badge === "MAS_ECONOMICO" && (
                      <Badge color="social">Mejor precio</Badge>
                    )}
                  </span>
                  <span className="text-xs font-medium tabular-nums text-ink/60">
                    {formatMoney(t.unitPriceCents).formatted}
                    <span className="text-[10px] text-ink/40">/ud</span>
                  </span>
                </button>
              </li>
            );
          })}
          <li className="sm:col-span-2">
            <label
              className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${
                usingCustom
                  ? "border-accent bg-accent/5"
                  : "border-line bg-bone-soft hover:border-accent"
              }`}
            >
              <span className="flex items-center gap-2">
                <Radio checked={usingCustom} />
                <span className="font-medium text-ink">Otra cantidad</span>
              </span>
              <input
                type="number"
                min={1}
                max={1_000_000}
                placeholder="ej. 175"
                value={customQty}
                onChange={(e) => setCustomQty(e.target.value)}
                className="w-28 rounded-lg border border-line bg-bone px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-accent"
              />
            </label>
          </li>
        </ul>
      </div>

      {/* 2. Toggle marcaje */}
      {canMark && (
        <div className="mt-5">
          <p className="text-xs font-medium uppercase tracking-wider text-ink/50">
            ② ¿Personalizar con tu logo?
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setWithMarking(true)}
              className={`rounded-xl border px-4 py-2.5 text-sm transition ${
                withMarking
                  ? "border-accent bg-accent text-bone shadow"
                  : "border-line bg-bone-soft text-ink/70 hover:border-accent"
              }`}
            >
              <span className="block font-semibold">Sí, con marcaje</span>
              <span className="block text-[11px] opacity-80">
                Logo aplicado, técnica que elijas
              </span>
            </button>
            <button
              type="button"
              onClick={() => setWithMarking(false)}
              className={`rounded-xl border px-4 py-2.5 text-sm transition ${
                !withMarking
                  ? "border-ink bg-ink text-bone shadow"
                  : "border-line bg-bone-soft text-ink/70 hover:border-accent"
              }`}
            >
              <span className="block font-semibold">No, solo producto</span>
              <span className="block text-[11px] opacity-80">
                Producto base sin personalizar
              </span>
            </button>
          </div>
        </div>
      )}

      {/* 3. Opciones de marcaje (si SI) */}
      {canMark && withMarking && (
        <div className="mt-4 grid gap-3 rounded-2xl border border-line bg-bone-soft p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-ink/50">
            Opciones de marcaje
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Zona">
              <select
                value={positionIdx}
                onChange={(e) => {
                  setPositionIdx(parseInt(e.target.value, 10));
                  setTechIdx(0);
                }}
                className="w-full rounded-lg border border-line bg-bone px-2.5 py-1.5 text-sm outline-none focus:border-accent"
              >
                {positionsAvailable.map((p, i) => (
                  <option key={p.id} value={i}>
                    {p.positionId}
                    {p.maxWidthMm && p.maxHeightMm
                      ? ` · ${p.maxWidthMm}×${p.maxHeightMm}mm`
                      : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Técnica">
              <select
                value={techIdx}
                onChange={(e) => setTechIdx(parseInt(e.target.value, 10))}
                className="w-full rounded-lg border border-line bg-bone px-2.5 py-1.5 text-sm outline-none focus:border-accent"
              >
                {position?.techniques.map((t, i) => (
                  <option key={t.techniqueId} value={i}>
                    {t.techniqueName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nº de colores">
              <input
                type="number"
                min={1}
                max={maxColors}
                value={colours}
                onChange={(e) => setColours(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full rounded-lg border border-line bg-bone px-2.5 py-1.5 text-sm outline-none focus:border-accent"
              />
            </Field>
            <Field label="Complejidad del logo">
              <select
                value={manipulation}
                onChange={(e) => setManipulation(e.target.value)}
                className="w-full rounded-lg border border-line bg-bone px-2.5 py-1.5 text-sm outline-none focus:border-accent"
              >
                {MANIPULATIONS.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {calc && "error" in calc && (
            <p className="text-[11px] text-accent-deep">⚠ {calc.error}</p>
          )}
          {apiOk && calc.marking?.warning && (
            <p className="text-[11px] text-accent-deep">⚠ {calc.marking.warning}</p>
          )}
        </div>
      )}

      {/* 4. Total estimado */}
      <div className="mt-5 flex items-end justify-between border-t border-line pt-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink/50">
            Total · {finalQty.toLocaleString("es-ES")} uds
            {withMarking ? " · con marcaje" : " · sin marcaje"}
          </p>
          <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-ink">
            {loadingCalc
              ? "…"
              : totalCents != null
                ? formatMoney(totalCents).formatted
                : "—"}
          </p>
        </div>
        {unitCents != null && (
          <p className="text-xs text-ink/50">
            {formatMoney(unitCents).formatted}
            <span className="opacity-60"> /ud</span>
          </p>
        )}
      </div>

      {/* 5. Botones */}
      <div className="mt-5 grid gap-2">
        <button
          type="button"
          onClick={onCotizar}
          className="w-full rounded-full bg-ink px-6 py-3.5 text-base font-semibold text-bone shadow-lg transition hover:bg-accent"
        >
          Configurar y cotizar
        </button>
        <button
          type="button"
          onClick={onAddToCart}
          disabled={!totalCents}
          className={`w-full rounded-full border px-6 py-3 text-sm font-medium transition disabled:opacity-40 ${
            recentlyAdded
              ? "border-social bg-social/10 text-social"
              : "border-line bg-bone-soft text-ink hover:border-accent"
          }`}
        >
          {recentlyAdded ? "✓ Añadido al pedido" : "+ Añadir al pedido"}
        </button>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-ink/50">
        {withMarking
          ? "ⓘ "
          : "ⓘ "}
        {apiOk && calc.disclaimer
          ? calc.disclaimer
          : "Precios orientativos calculados a partir de tarifas medias del sector. La cotización final incluye marcaje, plazo y transporte, y se ajusta a tarifa oficial."}
      </p>
    </div>
  );
}

function Radio({ checked }: { checked: boolean }) {
  return (
    <span
      className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
        checked ? "border-accent" : "border-line-dark"
      }`}
    >
      {checked && <span className="h-2 w-2 rounded-full bg-accent" />}
    </span>
  );
}

function Badge({ color, children }: { color: "accent" | "social"; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
        color === "accent" ? "bg-accent/15 text-accent" : "bg-social/15 text-social"
      }`}
    >
      {children}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium uppercase tracking-wider text-ink/50">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
