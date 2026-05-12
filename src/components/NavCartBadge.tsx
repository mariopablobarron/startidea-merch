"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { readCart } from "@/lib/cart-storage";

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Badge del carrito en navbar — siempre visible (incluso vacío) para que
 * el usuario sepa que existe la opción de pedir cotización con varios
 * productos. Inspirado en patrón estándar de e-commerce (todomerch.com,
 * garrampa.es) que mantiene el icono y total visible para urgencia visual.
 */
export function NavCartBadge() {
  const [count, setCount] = useState(0);
  const [totalCents, setTotalCents] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const refresh = () => {
      const items = readCart();
      setCount(items.reduce((s, it) => s + it.quantity, 0));
      setTotalCents(items.reduce((s, it) => s + (it.totalClientCents || 0), 0));
    };
    refresh();

    // Listener storage cross-tab
    const onStorage = (e: StorageEvent) => {
      if (e.key === "merch:cart") refresh();
    };
    window.addEventListener("storage", onStorage);
    // Listener custom para cambios same-tab (componentes que llaman addItem)
    const onCustom = () => refresh();
    window.addEventListener("merch:cart-change", onCustom);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("merch:cart-change", onCustom);
    };
  }, []);

  // Render server-side hasta hidratación → evita hydration mismatch
  if (!mounted) {
    return (
      <Link
        href="/carrito"
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-bone-soft px-3 py-1.5 text-xs text-ink/60"
        aria-label="Cesta de cotización"
      >
        <CartIcon />
      </Link>
    );
  }

  const empty = count === 0;
  return (
    <Link
      href="/carrito"
      className={`relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
        empty
          ? "border border-line bg-bone-soft text-ink/60 hover:border-accent"
          : "bg-accent text-bone shadow hover:bg-accent-dark"
      }`}
      aria-label={empty ? "Cesta vacía" : `Cesta con ${count} unidades`}
    >
      <CartIcon />
      {empty ? (
        <span className="hidden sm:inline">Cesta</span>
      ) : (
        <>
          <span className="tabular-nums">{count} ud</span>
          {totalCents > 0 && (
            <span className="hidden sm:inline tabular-nums">· {EUR.format(totalCents / 100)}</span>
          )}
        </>
      )}
    </Link>
  );
}

function CartIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="21" r="1"/>
      <circle cx="20" cy="21" r="1"/>
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
    </svg>
  );
}
