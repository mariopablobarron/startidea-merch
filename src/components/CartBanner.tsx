"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { readCart, cartTotalCents, type CartItem } from "@/lib/cart-storage";
import { cn } from "@/lib/cn";
import {
  FLOATING_SURFACES,
  isFloatingSurfaceAllowedOnPath,
  mobileFloatingOwner,
} from "@/lib/floating-surfaces";

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function CartBanner() {
  const [items, setItems] = useState<CartItem[]>([]);
  const pathname = usePathname();

  useEffect(() => {
    function refresh() {
      setItems(readCart());
    }
    refresh();
    window.addEventListener("merch:cart-change", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("merch:cart-change", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // El contrato central excluye funnels y rutas privadas. En portada y ficha
  // se conserva solo en escritorio; el CTA transaccional posee el móvil.
  if (
    !isFloatingSurfaceAllowedOnPath(
      FLOATING_SURFACES.cart,
      pathname || "",
    )
  ) {
    return null;
  }

  if (items.length === 0) return null;

  const total = cartTotalCents(items);
  const mobileOwner = mobileFloatingOwner({
    pathname: pathname || "",
    cartCount: items.length,
    compareCount: 0,
  });

  return (
    <div
      data-floating-surface={FLOATING_SURFACES.cart}
      className={cn(
        "fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)_+_0.75rem)] z-40 flex justify-center md:inset-x-auto md:bottom-24 md:left-1/2 md:-translate-x-1/2 md:transform",
        mobileOwner !== FLOATING_SURFACES.cart && "hidden md:flex",
      )}
    >
      <Link
        href="/carrito"
        className="flex min-h-11 max-w-full items-center gap-3 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-bone shadow-2xl transition-colors duration-200 motion-reduce:transition-none hover:bg-accent-dark"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
        <span className="truncate">
          {items.length} producto{items.length === 1 ? "" : "s"} · {EUR.format(total / 100)}
        </span>
        <span className="text-bone/70">·</span>
        <span className="font-semibold">Cotizar →</span>
      </Link>
    </div>
  );
}
