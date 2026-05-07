"use client";

import { useEffect, useState } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  Elements,
  ExpressCheckoutElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { trackEvent } from "@/lib/track";
import { PayButton } from "./PayButton";

/**
 * Botón nativo Apple Pay / Google Pay / Link directamente en /pay/[token].
 * Si el navegador no soporta wallets, hace fallback al PayButton tradicional
 * (redirect a Stripe Checkout hosted).
 *
 * Flujo:
 *  1. Carga Stripe.js con la publishable key.
 *  2. Pide un PaymentIntent al backend (/api/pay/[token]/intent).
 *  3. Renderiza <ExpressCheckoutElement> que detecta el wallet del cliente.
 *  4. Al pagar, Stripe confirma in-page; el webhook payment_intent.succeeded
 *     marca el cart como PAID y dispara emails/Telegram.
 */

let stripePromise: Promise<StripeJs | null> | null = null;
function getStripe(pk: string) {
  if (!stripePromise) stripePromise = loadStripe(pk);
  return stripePromise;
}

type IntentResp = {
  ok: true;
  clientSecret: string;
  amountCents: number;
  publishableKey?: string;
};

export function ExpressCheckoutPay({
  token,
  amountCents,
}: {
  token: string;
  amountCents: number;
}) {
  const [intent, setIntent] = useState<IntentResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pk, setPk] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/pay/${token}/intent`, { method: "POST" });
        const data = await res.json();
        if (!alive) return;
        if (!res.ok || !data.clientSecret) {
          setError(data.error || "Error preparando pago");
          return;
        }
        setIntent(data);
        const key = data.publishableKey || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
        if (key) setPk(key);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Error de red");
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  // Si no hay publishable key configurada, fallback directo al checkout hosted
  if (!pk && !intent) {
    return <PayButton token={token} amountCents={amountCents} />;
  }

  if (error) {
    return (
      <div>
        <p className="mb-3 text-xs text-accent-deep">⚠ {error}</p>
        <PayButton token={token} amountCents={amountCents} />
      </div>
    );
  }

  if (!intent || !pk) {
    return (
      <div className="text-center text-sm text-ink/50">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink/20 border-t-accent" />
      </div>
    );
  }

  return (
    <Elements
      stripe={getStripe(pk)}
      options={{
        clientSecret: intent.clientSecret,
        appearance: { theme: "flat", variables: { colorPrimary: "#ff6b35" } },
      }}
    >
      <ExpressInner token={token} amountCents={amountCents} />
    </Elements>
  );
}

function ExpressInner({ token, amountCents }: { token: string; amountCents: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const [available, setAvailable] = useState<boolean | null>(null); // null = loading
  const [confirmError, setConfirmError] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className={available === false ? "hidden" : ""}>
        <ExpressCheckoutElement
          options={{
            paymentMethods: { applePay: "always", googlePay: "always", link: "auto" },
            buttonHeight: 48,
          }}
          onReady={({ availablePaymentMethods }) => {
            // Si el browser no soporta ningún wallet, ocultamos el contenedor
            // y mostramos solo el PayButton de redirect.
            const has =
              !!availablePaymentMethods &&
              Object.values(availablePaymentMethods).some(Boolean);
            setAvailable(has);
          }}
          onConfirm={async () => {
            if (!stripe || !elements) return;
            trackEvent({ type: "payClick", payload: { token, amountCents, via: "express" } });
            const { error } = await stripe.confirmPayment({
              elements,
              confirmParams: {
                return_url: `${window.location.origin}/pay/${token}/success`,
              },
              redirect: "if_required",
            });
            if (error) {
              setConfirmError(error.message || "El pago no se pudo completar.");
            } else {
              // Pago confirmado in-page (sin redirect). Recargamos para que la
              // página vea el Payment ya como PAID (vía webhook).
              window.location.href = `/pay/${token}/success`;
            }
          }}
        />
        {confirmError && (
          <p className="mt-2 text-xs text-accent-deep">⚠ {confirmError}</p>
        )}
      </div>

      {available !== false && (
        <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-ink/40">
          <div className="h-px flex-1 bg-line" />
          <span>o</span>
          <div className="h-px flex-1 bg-line" />
        </div>
      )}

      <PayButton token={token} amountCents={amountCents} />
    </div>
  );
}
