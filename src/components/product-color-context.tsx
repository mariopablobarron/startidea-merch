"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Estado compartido de la variante de color elegida en la ficha de producto.
 *
 * La galería (columna izquierda) y el ProductOrderForm (columna derecha) son
 * HERMANOS en el Server Component de la ficha, así que no pueden compartir
 * estado por props. Este Context los conecta: la galería lo escribe al clicar
 * un swatch; el formulario lo lee para meter el color en el carrito/cotización.
 */
export type SelectedColorVariant = {
  sku: string;
  colorName: string | null;
  size: string | null; // talla elegida (null si el color no tiene tallas)
  imageUrl: string | null; // ya pasada por proxyImageUrl en el servidor
};

type ColorContextValue = {
  selected: SelectedColorVariant | null;
  setSelected: (v: SelectedColorVariant | null) => void;
};

const ColorContext = createContext<ColorContextValue | null>(null);

export function ProductColorProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<SelectedColorVariant | null>(null);
  return (
    <ColorContext.Provider value={{ selected, setSelected }}>
      {children}
    </ColorContext.Provider>
  );
}

/**
 * Devuelve el color seleccionado y su setter. Fuera del provider degrada a un
 * no-op seguro (para que el ProductOrderForm no reviente si se usa suelto).
 */
export function useProductColor(): ColorContextValue {
  return useContext(ColorContext) ?? { selected: null, setSelected: () => {} };
}
