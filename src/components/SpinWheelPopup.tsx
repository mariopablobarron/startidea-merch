"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { trackLead } from "@/lib/ads-events";

/**
 * Popup de captación con ruleta de premios (lead magnet gamificado).
 *
 * - El premio lo decide el SERVIDOR (`POST /api/ruleta/spin`); la rueda solo
 *   anima hasta el gajo que ha tocado. No se puede "trampear" girando.
 * - Una tirada por persona (localStorage) y por email (dedup en servidor).
 * - Mismos triggers y anti-colisión que el popup de email anterior.
 *
 * Persistencia: localStorage `merch:ruleta:v1` = "converted" | "dismissed" | "shown".
 */

const STORAGE_KEY = "merch:ruleta:v1";
const COOKIE_CONSENT_KEY = "merch:cookie-consent:v1";
const SHOW_AFTER_MS = 5000;
const MOBILE_AUTO_SHOW_MS = 60000;
const MOBILE_MIN_SCROLL_PERCENT = 50;
const SPIN_MS = 4300;

// Disposición visual de los gajos (debe coincidir con el SVG de abajo).
// `deg` = centro del gajo medido desde arriba en sentido horario.
const SEGMENTS: { id: string; deg: number }[] = [
  { id: "mockup", deg: 30 },
  { id: "p5", deg: 90 },
  { id: "sorteo", deg: 150 },
  { id: "regalo", deg: 210 },
  { id: "envio", deg: 270 },
  { id: "p10", deg: 330 },
];

type Result = { label: string; code: string | null };

export function SpinWheelPopup({
  onShow,
  onConvert,
}: { onShow?: () => void; onConvert?: () => void } = {}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const turnsRef = useRef(0);

  useEffect(() => {
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
      try {
        if (!localStorage.getItem(COOKIE_CONSENT_KEY)) return;
      } catch {}
      if (typeof document !== "undefined") {
        if (
          document.querySelector(
            '[role="dialog"]:not([data-popup="ruleta"]),[aria-modal="true"]:not([data-popup="ruleta"])',
          )
        ) {
          return;
        }
        const active = document.activeElement;
        if (
          active &&
          (active.tagName === "INPUT" ||
            active.tagName === "TEXTAREA" ||
            active.tagName === "SELECT")
        ) {
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

    initialDelay = setTimeout(() => {
      const isMobile =
        typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
      if (isMobile) {
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
    if (spinning) return;
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, "dismissed");
    } catch {}
  }

  async function spin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.includes("@")) {
      setError("Introduce un email válido");
      return;
    }
    if (!consent) {
      setError("Necesitas aceptar para participar");
      return;
    }
    setSpinning(true);
    try {
      const res = await fetch("/api/ruleta/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, consent: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo girar, reinténtalo");
        setSpinning(false);
        return;
      }

      const seg = SEGMENTS.find((s) => s.id === data.prize?.id) ?? SEGMENTS[0];
      turnsRef.current += 5;
      setRotation(360 * turnsRef.current - seg.deg);

      try {
        localStorage.setItem(STORAGE_KEY, "converted");
      } catch {}
      trackLead({ method: "ruleta" });
      onConvert?.();

      window.setTimeout(() => {
        setResult({ label: data.prize?.label ?? "tu premio", code: data.code ?? null });
        setSpinning(false);
      }, SPIN_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
      setSpinning(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Gira la ruleta y gana un premio"
      data-popup="ruleta"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-line bg-bone-soft shadow-2xl">
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

        <div className="grid gap-5 p-6 sm:grid-cols-[230px_1fr] sm:items-center">
          <div className="relative mx-auto w-[210px] sm:w-[230px]">
            <svg viewBox="0 0 260 270" className="w-full" role="img" aria-label="Ruleta de premios">
              <polygon points="130,4 120,28 140,28" fill="#A02049" stroke="#FAF7F1" strokeWidth="1.5" />
              <g
                style={{
                  transformOrigin: "130px 134px",
                  transform: `rotate(${rotation}deg)`,
                  transition: `transform ${SPIN_MS}ms cubic-bezier(0.16,0.68,0.2,1)`,
                }}
              >
                <g transform="translate(0,4)">
                  <path d="M130 130 L130 10 A120 120 0 0 1 233.92 70 Z" fill="#E63E73" />
                  <path d="M130 130 L233.92 70 A120 120 0 0 1 233.92 190 Z" fill="#2A2A2A" />
                  <path d="M130 130 L233.92 190 A120 120 0 0 1 130 250 Z" fill="#E63E73" />
                  <path d="M130 130 L130 250 A120 120 0 0 1 26.08 190 Z" fill="#2A2A2A" />
                  <path d="M130 130 L26.08 190 A120 120 0 0 1 26.08 70 Z" fill="#E63E73" />
                  <path d="M130 130 L26.08 70 A120 120 0 0 1 130 10 Z" fill="#2A2A2A" />
                  <text x="167.5" y="62" fill="#fff" fontSize="11.5" fontWeight="500" textAnchor="middle">Mockup</text>
                  <text x="167.5" y="76" fill="#fff" fontSize="11.5" fontWeight="500" textAnchor="middle">gratis</text>
                  <text x="201" y="134" fill="#fff" fontSize="13" fontWeight="500" textAnchor="middle">5% dto.</text>
                  <text x="167.5" y="194" fill="#fff" fontSize="13" fontWeight="500" textAnchor="middle">Sorteo</text>
                  <text x="92.5" y="194" fill="#fff" fontSize="12.5" fontWeight="500" textAnchor="middle">Regalo</text>
                  <text x="59" y="127" fill="#fff" fontSize="11.5" fontWeight="500" textAnchor="middle">Envío</text>
                  <text x="59" y="141" fill="#fff" fontSize="11.5" fontWeight="500" textAnchor="middle">gratis</text>
                  <text x="92.5" y="69" fill="#fff" fontSize="13" fontWeight="500" textAnchor="middle">10% dto.</text>
                </g>
              </g>
              <circle cx="130" cy="134" r="27" fill="#FAF7F1" stroke="#E63E73" strokeWidth="2.5" />
              <text x="130" y="139" fill="#A02049" fontSize="13" fontWeight="500" textAnchor="middle">GIRA</text>
            </svg>
          </div>

          <div>
            {!result ? (
              <form onSubmit={spin} className="grid gap-2.5">
                <p className="font-display text-xl font-semibold leading-tight text-ink">
                  Gira y gana tu recompensa
                </p>
                <p className="text-sm text-ink/70">
                  Premios para tu primer pedido de merch. Una tirada por persona.
                </p>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                  disabled={spinning}
                  className="w-full rounded-xl border border-line bg-bone px-4 py-2.5 text-sm outline-none focus:border-accent disabled:opacity-60"
                />
                <label className="flex cursor-pointer items-start gap-2 text-xs text-ink/60">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    disabled={spinning}
                    className="mt-0.5"
                  />
                  <span>
                    Acepto recibir novedades y la{" "}
                    <Link href="/privacidad" className="text-accent-deep underline-offset-2 hover:underline">
                      política de privacidad
                    </Link>
                    . Baja cuando quieras.
                  </span>
                </label>
                {error && (
                  <p className="rounded-lg bg-accent-wash px-3 py-2 text-xs text-accent-deep">⚠ {error}</p>
                )}
                <button
                  type="submit"
                  disabled={spinning}
                  className="mt-1 w-full rounded-full bg-accent px-6 py-3 text-sm font-semibold text-bone transition hover:bg-accent-dark disabled:opacity-50"
                >
                  {spinning ? "Girando…" : "¡Girar la ruleta!"}
                </button>
                <p className="text-center text-[10px] text-ink/40">100% gratis · sin spam</p>
              </form>
            ) : (
              <div className="py-2 text-center sm:text-left">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-social/15 text-social sm:mx-0">
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="mt-3 text-sm text-ink/70">¡Enhorabuena, has ganado!</p>
                <p className="mt-1 font-display text-xl font-semibold text-ink">{result.label}</p>
                {result.code && (
                  <div className="mt-3 rounded-xl bg-accent-mist px-4 py-3">
                    <p className="text-[10px] uppercase tracking-wider text-accent-deep">Tu código</p>
                    <code className="font-mono text-base font-semibold tracking-wide text-accent-deep">
                      {result.code}
                    </code>
                  </div>
                )}
                <Link
                  href="/catalogo"
                  onClick={() => setOpen(false)}
                  className="mt-4 inline-block w-full rounded-full bg-accent px-6 py-3 text-center text-sm font-semibold text-bone transition hover:bg-accent-dark"
                >
                  Usar mi premio →
                </Link>
                <p className="mt-2 text-center text-[10px] text-ink/40">
                  Te lo enviamos también por email · caduca en 30 días
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
