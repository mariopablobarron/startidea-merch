"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/track";

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function PayButton({ token, amountCents }: { token: string; amountCents: number }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setLoading(true);
    setError(null);
    trackEvent({ type: "payClick", payload: { token, amountCents } });
    try {
      const res = await fetch(`/api/pay/${token}/checkout`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || "Error iniciando el pago.");
        setLoading(false);
        return;
      }
      // Redirect a Stripe Checkout (hosted)
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
      setLoading(false);
    }
  }

  return (
    <div className="text-center">
      <button
        type="button"
        onClick={startCheckout}
        disabled={loading}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-8 py-4 text-base font-semibold text-bone shadow-lg transition hover:bg-accent-dark disabled:opacity-40"
      >
        {loading ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-bone/40 border-t-bone" />
            <span>Redirigiendo a pasarela…</span>
          </>
        ) : (
          <>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
            <span>Pagar {EUR.format(amountCents / 100)} de forma segura</span>
          </>
        )}
      </button>
      {error && <p className="mt-3 text-xs text-accent-deep">⚠ {error}</p>}
      <p className="mt-4 text-[11px] text-ink/50">
        Te redirigimos a Stripe. No guardamos los datos de tu tarjeta.
      </p>
    </div>
  );
}
