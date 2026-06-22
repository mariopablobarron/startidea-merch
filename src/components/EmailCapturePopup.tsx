"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { trackLead } from "@/lib/ads-events";

/**
 * Popup de captura de email con lead magnet (cupón WELCOME10 10% descuento).
 *
 * Trigger:
 *  - Exit-intent en desktop (mouseleave hacia top)
 *  - 25 seg de visita en móvil (no hay mouseleave fiable)
 *  - Solo si: pasaron >5 seg desde load + no se mostró antes
 *
 * Persistencia: localStorage `merch:lead-popup:v1` con value `"converted" | "dismissed" | "shown"`.
 * No volver a mostrar si converted/dismissed. Si solo "shown" sin acción,
 * se podría mostrar 7 días después (no implementado por ahora — keep simple).
 */

const STORAGE_KEY = "merch:lead-popup:v1";
const SHOW_AFTER_MS = 5000;
// Mobile: 60s (antes 25s) y solo si el usuario ha scrolleado al menos un 50%
// de la página. Disparar el popup mientras alguien toca el nav (común a 25s)
// bloquea el menú hamburguesa y mata la conversión.
const MOBILE_AUTO_SHOW_MS = 60000;
const MOBILE_MIN_SCROLL_PERCENT = 50;
const COOKIE_CONSENT_KEY = "merch:cookie-consent:v1"; // no mostrar antes de que decidan cookies

export function EmailCapturePopup({
  onShow,
  onConvert,
}: { onShow?: () => void; onConvert?: () => void } = {}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ ok: true; coupon: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // No molestar si ya se mostró
    try {
      const status = localStorage.getItem(STORAGE_KEY);
      if (status === "converted" || status === "dismissed") return;
    } catch {}

    let mounted = true;
    let exitListener: ((e: MouseEvent) => void) | null = null;
    let mobileTimer: NodeJS.Timeout | null = null;
    let initialDelay: NodeJS.Timeout | null = null;

    function trigger() {
      if (!mounted || open) return;
      // No interrumpir si todavía hay cookie banner visible
      try {
        if (!localStorage.getItem(COOKIE_CONSENT_KEY)) return;
      } catch {}
      // No interrumpir si hay otro modal/dialog abierto (menú, search, etc.)
      if (typeof document !== "undefined") {
        if (document.querySelector('[role="dialog"]:not([data-popup="lead"]),[aria-modal="true"]:not([data-popup="lead"])')) {
          return;
        }
        // Si el usuario está escribiendo en un input/textarea, no interrumpir
        const active = document.activeElement;
        if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) {
          return;
        }
      }
      setOpen(true);
      try {
        localStorage.setItem(STORAGE_KEY, "shown");
      } catch {}
      onShow?.();
    }

    function hasScrolledEnough(): boolean {
      if (typeof window === "undefined") return false;
      const scrolled = window.scrollY + window.innerHeight;
      const total = document.documentElement.scrollHeight;
      return total > 0 && (scrolled / total) * 100 >= MOBILE_MIN_SCROLL_PERCENT;
    }

    // Tras el delay mínimo, armamos los triggers reales
    initialDelay = setTimeout(() => {
      const isMobile =
        typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
      if (isMobile) {
        // Mobile: trigger solo si llegó al 50% de scroll AL menos a los 60s.
        // Si no, esperamos pero la siguiente comprobación tira.
        mobileTimer = setTimeout(() => {
          if (hasScrolledEnough()) trigger();
        }, MOBILE_AUTO_SHOW_MS - SHOW_AFTER_MS);
      } else {
        exitListener = (e: MouseEvent) => {
          if (e.clientY <= 0) trigger();
        };
        document.addEventListener("mouseleave", exitListener);
      }
    }, SHOW_AFTER_MS);

    return () => {
      mounted = false;
      if (initialDelay) clearTimeout(initialDelay);
      if (mobileTimer) clearTimeout(mobileTimer);
      if (exitListener) document.removeEventListener("mouseleave", exitListener);
    };
  }, [open]);

  function dismiss() {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, "dismissed");
    } catch {}
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) {
      setError("Email no válido");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name: name || undefined,
          source: "lead-popup",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error guardando");
        return;
      }
      try {
        localStorage.setItem(STORAGE_KEY, "converted");
      } catch {}
      // Lead event a Meta/Google/LinkedIn
      trackLead({ method: "email-popup-welcome10" });
      onConvert?.();
      setDone({ ok: true, coupon: data.couponCode || "WELCOME10" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Suscríbete y recibe 10% descuento"
      data-popup="lead"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-line bg-bone shadow-2xl">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Cerrar"
          className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-bone/80 text-ink/60 transition hover:bg-bone hover:text-ink"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="bg-accent px-6 py-5 text-bone">
          <p className="text-xs font-medium uppercase tracking-wider opacity-90">
            Cupón bienvenida
          </p>
          <p className="mt-1 font-display text-2xl font-semibold leading-tight">
            10% descuento en tu primer pedido
          </p>
        </div>

        <div className="px-6 py-5">
          {!done ? (
            <>
              <p className="text-sm text-ink/70">
                Suscríbete y te enviamos el cupón <strong>WELCOME10</strong> al momento, más un
                email mensual con casos reales y nuevos productos.
              </p>

              <form onSubmit={submit} className="mt-4 grid gap-3">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre (opcional)"
                  className="w-full rounded-xl border border-line bg-bone-soft px-4 py-2.5 text-sm outline-none focus:border-accent"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  required
                  className="w-full rounded-xl border border-line bg-bone-soft px-4 py-2.5 text-sm outline-none focus:border-accent"
                />

                {error && (
                  <p className="rounded-lg bg-accent-wash px-3 py-2 text-xs text-accent-deep">
                    ⚠ {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-full bg-ink px-6 py-3 text-sm font-semibold text-bone transition hover:bg-accent disabled:opacity-40"
                >
                  {submitting ? "Enviando…" : "Quiero el cupón"}
                </button>

                <p className="text-[10px] text-ink/50">
                  Al suscribirte aceptas recibir emails comerciales. Te puedes dar de baja en
                  cualquier momento. Lee nuestra{" "}
                  <Link href="/privacidad" className="text-accent underline-offset-2 hover:underline">
                    política de privacidad
                  </Link>
                  .
                </p>
              </form>

              <button
                type="button"
                onClick={dismiss}
                className="mt-3 w-full text-center text-xs text-ink/40 hover:text-ink/60"
              >
                No, gracias — paso del descuento
              </button>
            </>
          ) : (
            <div className="py-4 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-social/15 text-social">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="mt-4 font-display text-xl font-semibold text-ink">
                ¡Cupón enviado!
              </p>
              <p className="mt-2 text-sm text-ink/70">
                Revisa tu email{" "}
                <strong className="text-ink">{email}</strong>
                {" "}— encontrarás el código{" "}
                <code className="rounded bg-accent-wash px-2 py-0.5 font-mono text-xs text-accent-deep">
                  {done.coupon || "WELCOME10"}
                </code>
                {" "}listo para usar.
              </p>
              <Link
                href="/catalogo"
                onClick={() => setOpen(false)}
                className="mt-5 inline-block rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bone transition hover:bg-accent-dark"
              >
                Ver catálogo →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
