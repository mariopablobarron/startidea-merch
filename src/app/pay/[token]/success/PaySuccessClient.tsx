"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { trackPurchase } from "@/lib/ads-events";

/**
 * Página de confirmación de pago. Renderiza un mensaje de éxito y dispara
 * el evento Purchase a Meta/Google/LinkedIn pixels.
 *
 * Idempotente: usa sessionStorage para no disparar el evento dos veces
 * si el cliente recarga la página.
 */
export function PaySuccessClient({
  token,
  orderId,
  totalEur,
  numItems,
  customerName,
}: {
  token: string;
  orderId: string;
  totalEur: number;
  numItems: number;
  customerName: string;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    const key = `merch:purchase-tracked:${orderId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    fired.current = true;
    if (totalEur > 0) {
      trackPurchase({
        value: totalEur,
        currency: "EUR",
        orderId,
        numItems,
      });
    }
  }, [orderId, totalEur, numItems]);

  const firstName = customerName.split(" ")[0];

  return (
    <main className="min-h-screen bg-bone-soft px-6 py-20">
      <div className="mx-auto max-w-xl rounded-3xl border border-line bg-bone p-10 text-center shadow-sm">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-social/15 text-social">
          <svg
            className="h-8 w-8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="mt-6 font-display text-3xl font-semibold text-ink">
          ¡Pago confirmado, {firstName}!
        </h1>
        <p className="mt-3 text-ink/70">
          Hemos recibido tu pago. Pasamos producción a marcha y te enviamos un email con los
          detalles + link al portal para que veas el estado en cualquier momento.
        </p>

        {totalEur > 0 && (
          <p className="mt-6 inline-block rounded-full bg-bone-soft px-4 py-2 text-sm font-medium text-ink">
            Importe pagado:{" "}
            <strong className="text-accent">
              {new Intl.NumberFormat("es-ES", {
                style: "currency",
                currency: "EUR",
              }).format(totalEur)}
            </strong>
          </p>
        )}

        <p className="mt-2 text-xs text-ink/50">
          Referencia: <code className="font-mono">{orderId.slice(0, 8)}</code>
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={`/pay/${token}`}
            className="rounded-full border border-line bg-bone px-5 py-2.5 text-sm font-medium text-ink/80 hover:border-accent"
          >
            Ver detalles del pago
          </Link>
          <Link
            href="/clientes/login"
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bone shadow-sm transition hover:bg-accent-dark"
          >
            Ir a mi portal →
          </Link>
        </div>

        <p className="mt-10 text-xs text-ink/40">
          STARTIDEA MALAGA SL · CIF B19583632 · pedidos@startidea.es
        </p>
      </div>
    </main>
  );
}
