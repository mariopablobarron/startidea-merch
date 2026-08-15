"use client";

import Image from "next/image";
import { useProductColor } from "./product-color-context";
import {
  selectableSizesForOption,
  type ColorOption,
  type SizeOption,
} from "@/lib/variant-grouping";

/**
 * Imagen grande + selector de COLOR (deduplicado) y de TALLA.
 *
 * - Colores: un swatch por color único (no por variante color×talla). Clic →
 *   cambia la imagen principal y marca el color. Nunca elige una talla por
 *   stock: si hay más de una, la decisión sigue siendo del cliente.
 * - Tallas: aparecen bajo los colores para el color elegido (o el único color).
 *   Clic → fija la variante exacta mediante su identificador público opaco.
 *
 * La variante final (variantId + colorName + size + imagen) se guarda en el Context
 * para que el ProductOrderForm la meta en el carrito/pedido.
 */
export function ProductGallery({
  primaryImageUrl,
  productName,
  colorOptions,
}: {
  primaryImageUrl: string | null;
  productName: string;
  colorOptions: ColorOption[];
}) {
  const { selected, setSelected } = useProductColor();
  const productHasStock = colorOptions.some((option) => option.totalStock > 0);
  const eligibleOptions = productHasStock
    ? colorOptions.filter((option) => option.totalStock > 0)
    : colorOptions;

  const selectedOption = selected
    ? eligibleOptions.find(
        (option) =>
          option.key === selected.optionKey ||
          (selected.optionKey == null &&
            selected.colorName != null &&
            option.colorName === selected.colorName),
      )
    : undefined;
  const implicitOption = eligibleOptions.length === 1 ? eligibleOptions[0] : undefined;
  const displayedOption = selectedOption ?? implicitOption;
  // Si solo queda una opción elegible, coincide visualmente con la resolución
  // implícita del carrito; con varias, solo se activa la elegida.
  const activeColor =
    colorOptions.length === 1
      ? colorOptions[0]
      : displayedOption ?? null;
  const activeSelectableSizes = activeColor ? selectableSizesForOption(activeColor) : [];
  const canonicalSelectedSize =
    selectedOption && selected?.variantId
      ? activeSelectableSizes.find((size) => size.variantId === selected.variantId)
      : undefined;
  const displayedSize =
    canonicalSelectedSize
      ? canonicalSelectedSize.size
      : !activeColor?.ambiguous && activeSelectableSizes.length === 1
        ? activeSelectableSizes[0].size
        : null;

  const bigImage = displayedOption?.imageUrl ?? primaryImageUrl;
  const bigAlt = displayedOption?.colorName
    ? `${productName} — ${displayedOption.colorName}`
    : productName;
  const hasNeutralOption = colorOptions.some((option) => option.colorName == null);

  function selectColor(opt: ColorOption) {
    if (selectedOption?.key === opt.key) {
      setSelected(null);
      return;
    }
    const sizes = selectableSizesForOption(opt);
    const onlySize = !opt.ambiguous && sizes.length === 1 ? sizes[0] : null;
    setSelected({
      variantId: onlySize
        ? onlySize.variantId
        : !opt.ambiguous && opt.sizes.length === 0 && opt.variantCount === 1
          ? opt.primaryVariantId
          : null,
      optionKey: opt.key,
      colorName: opt.colorName,
      size: onlySize?.size ?? null,
      imageUrl: opt.imageUrl,
    });
  }

  function selectSize(opt: ColorOption, s: SizeOption) {
    setSelected({
      variantId: s.variantId,
      optionKey: opt.key,
      colorName: opt.colorName,
      size: s.size,
      imageUrl: opt.imageUrl,
    });
  }

  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-3xl border border-line bg-bone-soft">
        {bigImage ? (
          <Image
            src={bigImage}
            alt={bigAlt}
            fill
            sizes="(max-width:1024px) 100vw, 60vw"
            unoptimized
            className="object-contain p-8"
            priority
          />
        ) : (
          <div className="grid h-full place-items-center text-ink/30">Sin imagen</div>
        )}
      </div>

      {/* Selector de COLOR (solo si hay más de un color) */}
      {colorOptions.length > 1 && (
        <fieldset className="mt-6">
          <legend className="text-xs font-medium uppercase tracking-wider text-ink/50">
            {colorOptions.length} {hasNeutralOption ? "opciones" : "colores"}
            {displayedOption && (
              <span className="ml-2 font-semibold normal-case tracking-normal text-ink/75">
                · {displayedOption.colorName ?? "Estándar"}
              </span>
            )}
          </legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {colorOptions.map((opt) => {
              const isSel = displayedOption?.key === opt.key;
              const outOfStock = productHasStock && opt.totalStock <= 0;
              return (
                <button
                  key={opt.key}
                  type="button"
                  data-color-option
                  onClick={() => selectColor(opt)}
                  disabled={outOfStock}
                  title={outOfStock ? "Sin stock en esta opción" : opt.colorName ?? "Estándar"}
                  aria-pressed={isSel}
                  aria-label={opt.colorName ? `Color ${opt.colorName}` : "Opción estándar"}
                  className={`relative h-16 w-16 overflow-hidden rounded-xl border bg-bone transition ${
                    outOfStock
                      ? "cursor-not-allowed border-line/60 opacity-40"
                      : isSel
                        ? "border-accent ring-2 ring-accent"
                        : "border-line hover:border-accent/50"
                  }`}
                >
                  {opt.imageUrl ? (
                    <Image
                      src={opt.imageUrl}
                      alt={opt.colorName ?? "Opción estándar"}
                      fill
                      sizes="64px"
                      className="object-contain p-1"
                      unoptimized
                    />
                  ) : opt.colorHex ? (
                    // Sin foto de variante: círculo con el hex del proveedor
                    <span
                      aria-hidden
                      className="absolute inset-2 rounded-full border border-line/60"
                      style={{ background: opt.colorHex }}
                    />
                  ) : (
                    <span className="grid h-full place-items-center px-1 text-[10px] font-semibold text-ink/60">
                      Estándar
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {/* Selector de TALLA (del color activo) */}
      {activeColor && activeColor.sizes.length > 0 && (
        <fieldset className="mt-5">
          <legend className="text-xs font-medium uppercase tracking-wider text-ink/50">
            Talla
            {displayedSize && (
              <span className="ml-2 font-semibold normal-case tracking-normal text-ink/75">
                · {displayedSize}
              </span>
            )}
          </legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {(() => {
              // Solo bloqueamos tallas a 0 si el color opera con stock: si TODAS
              // están a 0 es un producto bajo pedido y todas siguen pedibles.
              const colorHasStock = activeColor.sizes.some((s) => s.stockQty > 0);
              return activeColor.sizes.map((s) => {
                const isSel =
                  (selected?.variantId === s.variantId && selectedOption?.key === activeColor.key) ||
                  (!activeColor.ambiguous &&
                    activeSelectableSizes.length === 1 &&
                    activeSelectableSizes[0].variantId === s.variantId);
                const outOfStock = colorHasStock && s.stockQty <= 0;
                return (
                  <button
                    key={s.variantId}
                    type="button"
                    data-size-option
                    onClick={() => selectSize(activeColor, s)}
                    disabled={outOfStock}
                    aria-pressed={isSel}
                    title={outOfStock ? "Sin stock en esta talla" : undefined}
                    className={`min-w-[2.75rem] rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      outOfStock
                        ? "cursor-not-allowed border-line/60 bg-bone-soft text-ink/30 line-through"
                        : isSel
                          ? "border-accent bg-accent text-white"
                          : "border-line bg-bone text-ink hover:border-accent/50"
                    }`}
                  >
                    {s.size}
                  </button>
                );
              });
            })()}
          </div>
        </fieldset>
      )}
    </div>
  );
}
