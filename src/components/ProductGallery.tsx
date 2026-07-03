"use client";

import Image from "next/image";
import { useProductColor } from "./product-color-context";

export type GalleryColorVariant = {
  id: string;
  sku: string;
  colorName: string | null;
  imageUrl: string | null; // ya pasada por proxyImageUrl en el servidor
};

/**
 * Imagen grande del producto + swatches de color SELECCIONABLES.
 *
 * Al clicar un color: cambia la imagen principal a la de esa variante y marca
 * el swatch. El color elegido se guarda en el Context (product-color-context)
 * para que el ProductOrderForm lo incluya en el carrito/cotización. Clicar el
 * color ya activo lo deselecciona (vuelve a la imagen base del producto).
 */
export function ProductGallery({
  primaryImageUrl,
  productName,
  colorVariants,
}: {
  primaryImageUrl: string | null;
  productName: string;
  colorVariants: GalleryColorVariant[];
}) {
  const { selected, setSelected } = useProductColor();
  const bigImage = selected?.imageUrl ?? primaryImageUrl;
  const bigAlt = selected?.colorName
    ? `${productName} — ${selected.colorName}`
    : productName;

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

      {colorVariants.length > 1 && (
        <div className="mt-6">
          <p className="text-xs font-medium uppercase tracking-wider text-ink/50">
            {colorVariants.length} variantes de color
            {selected?.colorName && (
              <span className="ml-2 font-semibold normal-case tracking-normal text-ink/75">
                · {selected.colorName}
              </span>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {colorVariants.map((v) => {
              const isSel = selected?.sku === v.sku;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() =>
                    setSelected(
                      isSel
                        ? null
                        : { sku: v.sku, colorName: v.colorName, imageUrl: v.imageUrl },
                    )
                  }
                  title={v.colorName ?? undefined}
                  aria-pressed={isSel}
                  aria-label={v.colorName ? `Color ${v.colorName}` : v.sku}
                  className={`relative h-16 w-16 overflow-hidden rounded-xl border bg-bone transition ${
                    isSel
                      ? "border-accent ring-2 ring-accent"
                      : "border-line hover:border-accent/50"
                  }`}
                >
                  {v.imageUrl && (
                    <Image
                      src={v.imageUrl}
                      alt={v.colorName ?? v.sku}
                      fill
                      sizes="64px"
                      className="object-contain p-1"
                      unoptimized
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
