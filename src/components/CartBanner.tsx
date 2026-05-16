"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { readCart, cartTotalCents, type CartItem } from "@/lib/cart-storage";

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

  // No mostrar en páginas donde el carrito YA es contexto principal:
  // /carrito (estás ahí), /pay/* (estás pagando), /clientes/* (portal cliente)
  // En mobile además el banner se solapaba con la imagen del producto.
  const HIDDEN_ON = ["/carrito", "/pay", "/clientes"];
  if (pathname && HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

  if (items.length === 0) return null;

  const total = cartTotalCents(items);

  return (
    <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 transform">
      <Link
        href="/carrito"
        className="flex items-center gap-3 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-bone shadow-2xl transition hover:bg-accent-dark"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
        <span>
          {items.length} producto{items.length === 1 ? "" : "s"} · {EUR.format(total / 100)}
        </span>
        <span className="text-bone/70">·</span>
        <span className="font-semibold">Cotizar →</span>
      </Link>
    </div>
  );
}
