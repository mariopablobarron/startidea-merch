import Stripe from "stripe";

/**
 * Cliente Stripe singleton.
 *
 * Modo: STRIPE_MODE = "test" | "live" (default test).
 * Si STRIPE_SECRET_KEY no está configurada, las rutas que lo usen devolverán 503.
 *
 * Webhook: STRIPE_WEBHOOK_SECRET para validar firma del POST.
 */

const SECRET = process.env.STRIPE_SECRET_KEY;
export const STRIPE_MODE: "test" | "live" = process.env.STRIPE_MODE === "live" ? "live" : "test";
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

export const stripe = SECRET
  ? new Stripe(SECRET, {
      typescript: true,
    })
  : null;

export function requireStripe() {
  if (!stripe) {
    throw new Error("Stripe no configurado: falta STRIPE_SECRET_KEY");
  }
  return stripe;
}
