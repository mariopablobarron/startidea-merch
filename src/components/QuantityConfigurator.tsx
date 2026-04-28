"use client";

import { useMemo, useState } from "react";
import {
  defaultTiersFromBase,
  formatMoney,
  pickTier,
  totalForQty,
  type PriceTier,
} from "@/lib/pricing";

type Props = {
  productSlug: string;
  productRef: string;
  productName: string;
  tiers?: PriceTier[]; // si vienen del proveedor, ignora estimate
  baseCentsForEstimate?: number; // se usa si no llegan tiers
};

const DEFAULT_QTYS = [10, 25, 50, 100, 250];

export function QuantityConfigurator({
  productSlug,
  productRef,
  productName,
  tiers,
  baseCentsForEstimate,
}: Props) {
  const finalTiers: PriceTier[] = useMemo(() => {
    if (tiers && tiers.length) return tiers;
    return baseCentsForEstimate ? defaultTiersFromBase(baseCentsForEstimate) : [];
  }, [tiers, baseCentsForEstimate]);

  const isEstimate = !tiers?.length;

  const [selectedQty, setSelectedQty] = useState<number>(25);
  const [customQty, setCustomQty] = useState<string>("");
  const usingCustom = customQty.trim() !== "";
  const qty = usingCustom ? Math.max(1, parseInt(customQty, 10) || 0) : selectedQty;

  const tier = pickTier(finalTiers, qty);
  const total = totalForQty(finalTiers, qty);

  function onCotizar() {
    const detail = `${productName} (ref. ${productRef}) · ${qty} uds`;
    try {
      sessionStorage.setItem("merch:prefill", detail);
      sessionStorage.setItem("merch:prefill-ref", productRef);
      sessionStorage.setItem("merch:prefill-slug", productSlug);
      sessionStorage.setItem("merch:prefill-qty", String(qty));
    } catch {}
    window.location.href = "/#cotizar";
  }

  if (!finalTiers.length) {
    // No hay datos para calcular — solo CTA cotización
    return (
      <button
        type="button"
        onClick={onCotizar}
        className="mt-8 inline-flex w-full items-center justify-center rounded-full bg-ink px-8 py-4 text-base font-medium text-bone transition hover:bg-accent"
      >
        Pedir cotización personalizada
      </button>
    );
  }

  return (
    <div className="mt-8 rounded-3xl border border-ink/10 bg-bone-soft p-6">
      <p className="text-xs font-medium uppercase tracking-wider text-ink/50">
        Selecciona cantidad
      </p>

      <ul className="mt-4 space-y-2.5">
        {DEFAULT_QTYS.map((q) => {
          const t = pickTier(finalTiers, q);
          if (!t) return null;
          const checked = !usingCustom && selectedQty === q;
          return (
            <li key={q}>
              <button
                type="button"
                onClick={() => {
                  setCustomQty("");
                  setSelectedQty(q);
                }}
                className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition ${
                  checked
                    ? "border-accent bg-accent/5"
                    : "border-ink/10 bg-bone hover:border-ink/30"
                }`}
              >
                <span className="flex items-center gap-3">
                  <span
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                      checked ? "border-accent" : "border-ink/30"
                    }`}
                  >
                    {checked && <span className="h-2 w-2 rounded-full bg-accent" />}
                  </span>
                  <span className="font-medium text-ink">{q} uds</span>
                  {t.badge === "POPULAR" && (
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                      Popular
                    </span>
                  )}
                  {t.badge === "MAS_ECONOMICO" && (
                    <span className="rounded-full bg-social/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-social">
                      ¡Más económico!
                    </span>
                  )}
                </span>
                <span className="font-display text-base font-semibold tabular-nums text-ink">
                  {formatMoney(t.unitPriceCents).formatted}
                  <span className="ml-1 text-xs font-normal text-ink/50">/ud</span>
                </span>
              </button>
            </li>
          );
        })}

        <li>
          <label
            className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
              usingCustom ? "border-accent bg-accent/5" : "border-ink/10 bg-bone hover:border-ink/30"
            }`}
          >
            <span className="flex items-center gap-3">
              <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${usingCustom ? "border-accent" : "border-ink/30"}`}>
                {usingCustom && <span className="h-2 w-2 rounded-full bg-accent" />}
              </span>
              <span className="font-medium text-ink">Otra cantidad</span>
            </span>
            <input
              type="number"
              min={1}
              max={1_000_000}
              placeholder="ej. 175"
              value={customQty}
              onChange={(e) => setCustomQty(e.target.value)}
              className="w-28 rounded-xl border border-ink/15 bg-bone px-3 py-1.5 text-right tabular-nums outline-none focus:border-accent"
            />
          </label>
        </li>
      </ul>

      {tier && (
        <div className="mt-6 flex items-end justify-between border-t border-ink/10 pt-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-ink/50">
              Total estimado · {qty.toLocaleString("es-ES")} uds
            </p>
            <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-ink">
              {total?.formatted}
            </p>
          </div>
          <p className="text-xs text-ink/50">
            {formatMoney(tier.unitPriceCents).formatted}
            <span className="opacity-60"> /ud</span>
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={onCotizar}
        className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-ink px-8 py-4 text-base font-medium text-bone transition hover:bg-accent"
      >
        Configurar y cotizar
      </button>

      {isEstimate && (
        <p className="mt-4 text-[11px] leading-relaxed text-ink/50">
          ⓘ Precios orientativos calculados a partir de tarifas medias del sector. La
          cotización final incluye marcaje, plazo, transporte y se ajusta a tarifa
          oficial del proveedor.
        </p>
      )}
    </div>
  );
}
