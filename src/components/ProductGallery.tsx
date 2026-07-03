"use client";

import Image from "next/image";
import { useProductColor } from "./product-color-context";
import type { ColorOption, SizeOption } from "@/lib/variant-grouping";

/** Talla por defecto al elegir un color: la de más stock. */
function defaultSize(opt: ColorOption): SizeOption | null {
  if (opt.sizes.length === 0) return null;
  return opt.sizes.reduce((best, s) => (s.stockQty > best.stockQty ? s : best), opt.sizes[0]);
}

/**
 * Imagen grande + selector de COLOR (deduplicado) y de TALLA.
 *
 * - Colores: un swatch por color único (no por variante color×talla). Clic →
 *   cambia la imagen principal, marca el color y preselecciona su talla de más
 *   stock. Clicar el color activo lo deselecciona.
 * - Tallas: aparecen bajo los colores para el color elegido (o el único color).
 *   Clic → fija la variante exacta (SKU con esa talla).
 *
 * La variante final (sku + colorName + size + imagen) se guarda en el Context
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

  // Color activo: si solo hay uno, ese; si hay varios, el que coincide con lo elegido.
  const activeColor =
    colorOptions.length === 1
      ? colorOptions[0]
      : colorOptions.find((o) => o.colorName === selected?.colorName) ?? null;

  const bigImage = selected?.imageUrl ?? primaryImageUrl;
  const bigAlt = selected?.colorName ? `${productName} — ${selected.colorName}` : productName;

  function selectColor(opt: ColorOption) {
    if (selected?.colorName === opt.colorName) {
      setSelected(null);
      return;
    }
    const ds = defaultSize(opt);
    setSelected({
      sku: ds ? ds.sku : opt.primarySku,
      colorName: opt.colorName,
      size: ds ? ds.size : null,
      imageUrl: opt.imageUrl,
    });
  }

  function selectSize(opt: ColorOption, s: SizeOption) {
    setSelected({ sku: s.sku, colorName: opt.colorName, size: s.size, imageUrl: opt.imageUrl });
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
        <div className="mt-6">
          <p className="text-xs font-medium uppercase tracking-wider text-ink/50">
            {colorOptions.length} colores
            {selected?.colorName && (
              <span className="ml-2 font-semibold normal-case tracking-normal text-ink/75">
                · {selected.colorName}
              </span>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {colorOptions.map((opt) => {
              const isSel = selected?.colorName === opt.colorName;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => selectColor(opt)}
                  title={opt.colorName ?? undefined}
                  aria-pressed={isSel}
                  aria-label={opt.colorName ? `Color ${opt.colorName}` : opt.primarySku}
                  className={`relative h-16 w-16 overflow-hidden rounded-xl border bg-bone transition ${
                    isSel ? "border-accent ring-2 ring-accent" : "border-line hover:border-accent/50"
                  }`}
                >
                  {opt.imageUrl ? (
                    <Image
                      src={opt.imageUrl}
                      alt={opt.colorName ?? opt.primarySku}
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
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Selector de TALLA (del color activo) */}
      {activeColor && activeColor.sizes.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-medium uppercase tracking-wider text-ink/50">
            Talla
            {selected?.size && selected?.colorName === activeColor.colorName && (
              <span className="ml-2 font-semibold normal-case tracking-normal text-ink/75">
                · {selected.size}
              </span>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(() => {
              // Solo bloqueamos tallas a 0 si el color opera con stock: si TODAS
              // están a 0 es un producto bajo pedido y todas siguen pedibles.
              const colorHasStock = activeColor.sizes.some((s) => s.stockQty > 0);
              return activeColor.sizes.map((s) => {
                const isSel =
                  selected?.size === s.size && selected?.colorName === activeColor.colorName;
                const outOfStock = colorHasStock && s.stockQty <= 0;
                return (
                  <button
                    key={s.sku}
                    type="button"
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
        </div>
      )}
    </div>
  );
}
