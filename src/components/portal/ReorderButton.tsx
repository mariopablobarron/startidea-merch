"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addItem, type CartItem } from "@/lib/cart-storage";

/**
 * "Repetir pedido" del portal cliente (repeat-order estilo portal B2B de
 * proveedor): pide las líneas del pedido pasado al servidor y las carga en el
 * carrito local — /cesta recotiza con las tarifas de hoy.
 */
export function ReorderButton({ cartId }: { cartId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reorder() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/clientes/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cartId }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        items?: CartItem[];
        unavailable?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.items) {
        setError(data.error || "No se pudo repetir el pedido");
        return;
      }
      if (data.items.length === 0) {
        setError("Ninguno de los productos sigue disponible — escríbenos y te proponemos alternativas.");
        return;
      }
      for (const item of data.items) addItem(item);
      if (data.unavailable && data.unavailable.length > 0) {
        // Aviso no bloqueante: seguimos a la cesta con lo disponible.
        sessionStorage.setItem(
          "merch:reorder-unavailable",
          JSON.stringify(data.unavailable),
        );
      }
      router.push("/cesta");
    } catch {
      setError("Error de conexión");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={reorder}
        disabled={busy}
        className="rounded-full border border-line bg-bone-soft px-3 py-1 text-xs font-medium hover:border-accent disabled:opacity-50"
      >
        {busy ? "Preparando…" : "🔄 Repetir pedido"}
      </button>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </span>
  );
}
