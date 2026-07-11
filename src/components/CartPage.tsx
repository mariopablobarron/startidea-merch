"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { readCart, writeCart, removeItemAt, clearCart, cartTotalCents, type CartItem } from "@/lib/cart-storage";
import { DeliveryEstimate } from "@/components/DeliveryEstimate";
import { trackLead, trackInitiateCheckout } from "@/lib/ads-events";
import { waLink, waCartQuoteMessage, trackWaClick } from "@/lib/whatsapp";
import { withIva, ivaPart } from "@/lib/iva";
import { AskDiego } from "@/components/AskDiego";

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Quita ?recover de la URL tras procesarlo, sin recargar ni re-fetch (history
 * API, no useRouter), para que un refresh o un enlace compartido no vuelva a
 * disparar la recuperación.
 */
function stripRecoverParam() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (url.searchParams.has("recover")) {
    url.searchParams.delete("recover");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }
}

export function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Recuperación cross-device en curso (rehidratando la cesta desde el servidor).
  const [recovering, setRecovering] = useState(false);
  // "Repetir pedido" del portal: productos del pedido original ya retirados.
  const [reorderUnavailable, setReorderUnavailable] = useState<string[]>([]);
  // CIF y dirección del perfil del portal (si hay sesión): viajan con la
  // cotización para que la factura salga completa sin repreguntar.
  const [profileExtras, setProfileExtras] = useState<{
    taxId: string | null;
    shippingAddress: string | null;
  } | null>(null);
  // Guardar carrito con email (captura temprana → entra al drip de recordatorios)
  const [saveEmail, setSaveEmail] = useState("");
  const [savingCart, setSavingCart] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedCart, setSavedCart] = useState<{ email: string; cartId: string } | null>(null);

  // form
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [deadline, setDeadline] = useState("");
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  // cupón
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState<{ code: string; label: string; discountCents: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);

  useEffect(() => {
    function refresh() {
      setItems(readCart());
    }
    refresh();
    window.addEventListener("merch:cart-change", refresh);

    // Restaurar el estado "carrito ya guardado" (no volver a pedir email).
    try {
      const rawSaved = localStorage.getItem("merch:cart-saved");
      if (rawSaved) {
        const s = JSON.parse(rawSaved) as { email?: string; cartId?: string };
        if (s.email && s.cartId) setSavedCart({ email: s.email, cartId: s.cartId });
      }
    } catch {}

    // Aviso de "Repetir pedido" (portal cliente): productos que ya no están.
    try {
      const raw = sessionStorage.getItem("merch:reorder-unavailable");
      if (raw) {
        sessionStorage.removeItem("merch:reorder-unavailable");
        const names = JSON.parse(raw) as string[];
        if (Array.isArray(names) && names.length > 0) setReorderUnavailable(names);
      }
    } catch {}

    // Prefill desde "Mis datos" del portal (si hay sesión de cliente). Solo
    // rellena campos VACÍOS — nunca pisa lo que el usuario ya escribió.
    void fetch("/api/clientes/me")
      .then(async (r) => {
        if (!r.ok) return; // 401 = anónimo, flujo normal
        const j = (await r.json()) as {
          profile?: {
            name: string;
            company: string | null;
            email: string;
            phone: string | null;
            taxId: string | null;
            shippingAddress: string | null;
          };
        };
        const p = j.profile;
        if (!p) return;
        setName((v) => v || p.name || "");
        setCompany((v) => v || p.company || "");
        setEmail((v) => v || p.email || "");
        setPhone((v) => v || p.phone || "");
        setProfileExtras({ taxId: p.taxId, shippingAddress: p.shippingAddress });
      })
      .catch(() => {});

    // Recuperación de carrito abandonado. Los emails de recordatorio enlazan a
    // /cotizar?recover={cartId} → /carrito?recover={cartId}. Al llegar aquí:
    //  1. Marcamos el carrito como recuperado (métrica recovery del dashboard),
    //     siempre — venga del mismo dispositivo o de otro.
    //  2. Si la cesta local está vacía (otro dispositivo / navegador), la
    //     rehidratamos con los items que el CartQuote guarda en servidor.
    const recoverId = new URLSearchParams(window.location.search).get("recover");
    if (recoverId) {
      const path = `/api/cart-quote/${encodeURIComponent(recoverId)}`;
      // (1) marca recoveredAt (idempotente en el servidor), fire-and-forget.
      void fetch(path, { method: "POST" }).catch(() => {});
      // (2) rehidratación sólo si no hay nada local que perder.
      if (readCart().length === 0) {
        setRecovering(true);
        fetch(path)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data && Array.isArray(data.items) && data.items.length > 0) {
              // writeCart emite "merch:cart-change" → refresh() → setItems.
              writeCart(data.items as CartItem[]);
            }
          })
          .catch(() => {})
          .finally(() => {
            setRecovering(false);
            stripRecoverParam();
          });
      } else {
        stripRecoverParam();
      }
    }

    return () => window.removeEventListener("merch:cart-change", refresh);
  }, []);

  // Cupón pendiente ganado en la ruleta: se autoaplica en cuanto el carrito
  // tiene importe. Acepta ?cupon= en la URL o localStorage "merch:pending-coupon".
  useEffect(() => {
    if (couponDiscount) return;
    const sub = cartTotalCents(items);
    if (sub <= 0) return;
    let code: string | null = null;
    try {
      code = new URLSearchParams(window.location.search).get("cupon");
      if (!code) code = localStorage.getItem("merch:pending-coupon");
    } catch {}
    if (!code) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/coupons/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, totalCents: sub }),
        });
        const data = await res.json();
        if (!cancelled && data.ok) {
          setCouponCode(data.code);
          setCouponDiscount({ code: data.code, label: data.label, discountCents: data.discountCents });
          try {
            localStorage.removeItem("merch:pending-coupon");
          } catch {}
        } else if (!cancelled && data && data.ok === false) {
          // Inválido permanente (no existe/caducado/sin usos): deja de reintentar.
          // Si es por pedido mínimo, lo conservamos para cuando el carrito suba.
          const transient = typeof data.reason === "string" && data.reason.startsWith("Mínimo");
          if (!transient) {
            try {
              localStorage.removeItem("merch:pending-coupon");
            } catch {}
          }
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [items, couponDiscount]);

  function updateQty(index: number, qty: number) {
    const next = readCart().map((it, idx) =>
      idx === index
        ? { ...it, quantity: Math.max(1, qty), totalClientCents: it.unitPriceClientCents ? it.unitPriceClientCents * Math.max(1, qty) : it.totalClientCents }
        : it,
    );
    writeCart(next);
  }

  const subtotal = cartTotalCents(items);
  const discount = couponDiscount?.discountCents || 0;
  const total = Math.max(0, subtotal - discount);
  const iva = ivaPart(total);
  const totalWithIva = withIva(total);

  useEffect(() => {
    const code = couponDiscount?.code;
    if (!code || subtotal <= 0) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/coupons/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, totalCents: subtotal }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!data.ok) {
          setCouponDiscount(null);
          setCouponError(data.reason || "Código no válido para el nuevo total");
          return;
        }
        setCouponDiscount({
          code: data.code,
          label: data.label,
          discountCents: data.discountCents,
        });
        setCouponError(null);
      } catch {
        if (!cancelled) setCouponError("No se pudo recalcular el cupón.");
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [couponDiscount?.code, subtotal]);

  /** Quita del carrito todos los items que no tienen precio calculado. */
  function removeUnpricedItems() {
    const next = readCart().filter(
      (it) => typeof it.totalClientCents === "number" && it.totalClientCents > 0,
    );
    writeCart(next);
  }

  async function submitCart(directPay: boolean) {
    setError(null);
    setSuccess(null);
    if (items.length === 0) {
      setError("Tu carrito está vacío.");
      return;
    }
    if (name.trim().length < 2 || !email.includes("@")) {
      setError("Faltan datos de contacto válidos.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/cart-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          company,
          email,
          phone,
          message,
          deadline,
          whatsappOptIn,
          couponCode: couponDiscount ? couponDiscount.code : undefined,
          items,
          directPay,
          // Datos fiscales del perfil del portal (si hay sesión): la factura
          // sale con CIF y dirección sin repreguntar al cliente.
          vatNumber: profileExtras?.taxId || undefined,
          shippingAddress: profileExtras?.shippingAddress || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        id?: string;
        error?: string;
        payUrl?: string | null;
      };
      if (!res.ok || !data.ok) {
        setError(data.error || "Algo falló enviando la cotización.");
        return;
      }
      // Evento de conversión Lead a los pixels (GA4 ahora; Meta/Google/LinkedIn
      // en cuanto se configuren sus IDs). El valor es el total del carrito.
      const valueEur = Math.round(totalWithIva) / 100;
      trackLead({ method: directPay ? "cotizacion-pago-directo" : "cotizacion", value: valueEur });
      // Si pidió pago directo y el backend nos devuelve URL, redirige a Stripe.
      if (directPay && data.payUrl) {
        trackInitiateCheckout({ value: valueEur, numItems: items.length });
        clearCart();
        window.location.href = data.payUrl;
        return;
      }
      // Cotización tradicional: mensaje de éxito + vacía carrito.
      setSuccess(
        `Cotización recibida (ref. ${data.id?.slice(0, 8) ?? "?"}). Te respondemos en menos de 24 horas a ${email}.`,
      );
      clearCart();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red.");
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Por defecto el form submit (Enter) usa cotización tradicional.
    submitCart(false);
  }

  if (items.length === 0 && recovering && !success) {
    return (
      <div className="rounded-3xl border border-line bg-bone p-16 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
        <p className="mt-5 font-display text-2xl font-semibold text-ink">
          Restaurando tu cotización…
        </p>
        <p className="mx-auto mt-3 max-w-md text-ink/60">
          Recuperamos los productos que habías configurado. Un momento.
        </p>
      </div>
    );
  }

  if (items.length === 0 && !success) {
    return (
      <div className="rounded-3xl border border-dashed border-line bg-bone p-16 text-center">
        <p className="font-display text-2xl font-semibold text-ink">
          Tu carrito está vacío.
        </p>
        <p className="mx-auto mt-3 max-w-md text-ink/60">
          Abre cualquier ficha del catálogo, configura tu marcaje y pulsa &quot;Añadir al carrito&quot;.
        </p>
        <Link
          href="/catalogo"
          className="mt-8 inline-block rounded-full bg-ink px-6 py-3 text-sm font-medium text-bone transition hover:bg-accent"
        >
          Ver catálogo
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="rounded-3xl border border-social bg-social/10 p-12 text-center">
        <svg className="mx-auto h-12 w-12 text-social" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <p className="mt-5 font-display text-2xl font-semibold text-ink">¡Cotización enviada!</p>
        <p className="mx-auto mt-3 max-w-md text-ink/70">{success}</p>
        <Link
          href="/catalogo"
          className="mt-8 inline-block rounded-full bg-ink px-6 py-3 text-sm font-medium text-bone transition hover:bg-accent"
        >
          Volver al catálogo
        </Link>
      </div>
    );
  }

  async function saveForLater(e: React.FormEvent) {
    e.preventDefault();
    const mail = saveEmail.trim();
    if (!mail || items.length === 0) return;
    setSavingCart(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/cart-quote/save-for-later", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: mail, items }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; cartId?: string; error?: string };
      if (!res.ok || !j.ok || !j.cartId) {
        setSaveError(j.error || "No se pudo guardar — inténtalo de nuevo");
        return;
      }
      const saved = { email: mail, cartId: j.cartId };
      setSavedCart(saved);
      try {
        localStorage.setItem("merch:cart-saved", JSON.stringify(saved));
      } catch {}
      trackLead({ method: "save-cart" });
    } catch {
      setSaveError("Error de conexión");
    } finally {
      setSavingCart(false);
    }
  }

  async function applyCouponCode() {
    setCouponError(null);
    if (!couponCode.trim()) return;
    setCouponBusy(true);
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponCode, totalCents: subtotal }),
      });
      const data = await res.json();
      if (!data.ok) {
        setCouponError(data.reason || "Código no válido");
        setCouponDiscount(null);
      } else {
        setCouponDiscount({ code: data.code, label: data.label, discountCents: data.discountCents });
      }
    } finally {
      setCouponBusy(false);
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1.4fr,1fr]">
      {reorderUnavailable.length > 0 && (
        <div className="rounded-2xl border border-accent/30 bg-accent-mist p-4 text-sm text-ink/80 lg:col-span-2">
          <p className="font-medium text-accent-deep">
            Hemos cargado tu pedido anterior, pero {reorderUnavailable.length === 1 ? "este producto ya no está disponible" : "estos productos ya no están disponibles"}:
          </p>
          <ul className="mt-1 list-inside list-disc text-xs text-ink/60">
            {reorderUnavailable.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-ink/55">
            Cuéntanoslo en el mensaje del pedido y te proponemos alternativas equivalentes.
          </p>
        </div>
      )}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink/60">
            {items.length} producto{items.length === 1 ? "" : "s"}
          </p>
          <button
            type="button"
            onClick={() => clearCart()}
            className="text-xs text-ink/50 hover:text-accent"
          >
            Vaciar carrito
          </button>
        </div>

        {items.map((it, i) => (
          <article
            key={`${it.productSlug}-${it.variantSku || "_"}-${it.markingTechniqueCode || "_"}-${i}`}
            className="grid gap-5 rounded-3xl border border-line bg-bone p-5 sm:grid-cols-[120px,1fr]"
          >
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-bone-soft">
              {it.primaryImageUrl ? (
                <Image
                  src={it.primaryImageUrl}
                  alt={it.productName}
                  fill
                  sizes="120px"
                  className="object-contain p-3"
                />
              ) : (
                <div className="grid h-full place-items-center text-xs text-ink/40">Sin imagen</div>
              )}
            </div>
            <div>
              <Link
                href={`/catalogo/${it.productSlug}`}
                className="font-display text-lg font-semibold text-ink hover:text-accent"
              >
                {it.productName}
              </Link>
              <p className="text-xs text-ink/50">Ref. {it.productRef}</p>

              {(it.colorName || it.size) && (
                <p className="mt-1.5 flex flex-wrap gap-1.5">
                  {it.colorName && (
                    <span className="rounded-full bg-bone-soft px-2.5 py-0.5 text-[11px] font-medium text-ink/70">
                      {it.colorName}
                    </span>
                  )}
                  {it.size && (
                    <span className="rounded-full bg-bone-soft px-2.5 py-0.5 text-[11px] font-medium text-ink/70">
                      Talla {it.size}
                    </span>
                  )}
                </p>
              )}

              {it.customerLogoUrl && (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-bone-soft p-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={it.customerLogoUrl}
                    alt={it.customerLogoFilename || "Logo"}
                    className="h-8 w-8 flex-shrink-0 rounded object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-social">
                      ✓ Logo subido
                    </p>
                    <p className="truncate text-[11px] text-ink/60">
                      {it.customerLogoFilename}
                    </p>
                  </div>
                </div>
              )}

              {it.markingTechniqueCode && (
                <p className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-accent-wash px-2.5 py-0.5 text-[11px] font-medium text-accent-deep">
                    {it.markingTechniqueName} en {it.markingPositionId}
                  </span>
                  {it.markingColours && it.markingColours > 1 && (
                    <span className="rounded-full bg-accent-wash px-2.5 py-0.5 text-[11px] font-medium text-accent-deep">
                      {it.markingColours} colores
                    </span>
                  )}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-ink/60">Cantidad</span>
                  <input
                    type="number"
                    value={it.quantity}
                    onChange={(e) =>
                      updateQty(i, parseInt(e.target.value) || 1)
                    }
                    min={1}
                    max={1_000_000}
                    className="w-24 rounded-lg border border-line bg-bone-soft px-2 py-1 text-right tabular-nums outline-none focus:border-accent"
                  />
                </label>

                <p className="text-right">
                  <span className="font-display text-lg font-semibold tabular-nums text-ink">
                    {it.totalClientCents != null ? EUR.format(it.totalClientCents / 100) : "—"}
                  </span>
                  {it.unitPriceClientCents != null && (
                    <span className="ml-2 text-xs text-ink/50">
                      ({EUR.format(it.unitPriceClientCents / 100)}/ud)
                    </span>
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={() => removeItemAt(i)}
                className="mt-3 text-xs text-ink/50 hover:text-accent"
              >
                Quitar
              </button>
            </div>
          </article>
        ))}

        {/* Guardar carrito con email (captura temprana). Cubre el agujero de
            los recordatorios: sin esto, quien se va sin cotizar es invisible.
            Se oculta si ya escribió su email en el formulario (va a cotizar). */}
        {!savedCart && !email.trim() && (
          <form
            onSubmit={saveForLater}
            className="rounded-2xl border border-dashed border-line bg-bone p-4"
          >
            <p className="text-sm font-medium text-ink/80">
              ¿Te guardamos el carrito? Te lo enviamos por email para retomarlo donde quieras.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="email"
                value={saveEmail}
                onChange={(e) => setSaveEmail(e.target.value)}
                placeholder="tu@empresa.com"
                required
                aria-label="Email para guardar el carrito"
                className="min-w-0 flex-1 rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={savingCart || !saveEmail.trim()}
                className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-bone hover:bg-accent disabled:opacity-40"
              >
                {savingCart ? "Guardando…" : "Guardar carrito"}
              </button>
            </div>
            {saveError && <p className="mt-2 text-xs text-accent-deep">⚠ {saveError}</p>}
            <p className="mt-2 text-[10px] text-ink/45">
              Solo para enviarte tu carrito y recordártelo — nada de listas de marketing.
            </p>
          </form>
        )}
        {savedCart && (
          <p className="rounded-2xl bg-social/10 px-4 py-3 text-sm text-social">
            ✓ Carrito guardado — te lo hemos enviado a <strong>{savedCart.email}</strong>. Puedes
            retomarlo desde ese email en cualquier dispositivo.
          </p>
        )}

        {/* Cupón */}
        <div className="rounded-2xl border border-line bg-bone p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-ink/50">¿Tienes código de descuento?</p>
          {couponDiscount ? (
            <div className="mt-2 flex items-center justify-between rounded-xl bg-social/10 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-social">✓ {couponDiscount.code}</p>
                <p className="text-[11px] text-ink/60">{couponDiscount.label}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCouponDiscount(null);
                  setCouponCode("");
                }}
                className="text-xs text-ink/50 hover:text-accent"
              >
                Quitar
              </button>
            </div>
          ) : (
            <div className="mt-2 flex gap-2">
              <input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="EJ. WELCOME10"
                maxLength={40}
                className="flex-1 rounded-lg border border-line bg-bone-soft px-3 py-1.5 text-sm uppercase outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={applyCouponCode}
                disabled={couponBusy || !couponCode.trim()}
                className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-bone hover:bg-accent disabled:opacity-40"
              >
                {couponBusy ? "…" : "Aplicar"}
              </button>
            </div>
          )}
          {couponError && <p className="mt-1 text-xs text-accent-deep">⚠ {couponError}</p>}
        </div>

        <div className="rounded-2xl border border-line bg-bone-soft p-5">
          <div className="flex items-center justify-between text-sm text-ink/70">
            <span>Subtotal (sin IVA)</span>
            <span className="tabular-nums">{EUR.format(subtotal / 100)}</span>
          </div>
          {discount > 0 && (
            <div className="mt-1 flex items-center justify-between text-sm text-social">
              <span>Descuento {couponDiscount?.code}</span>
              <span className="tabular-nums">−{EUR.format(discount / 100)}</span>
            </div>
          )}
          <div className="mt-1 flex items-center justify-between text-sm text-ink/70">
            <span>Base imponible</span>
            <span className="tabular-nums">{EUR.format(total / 100)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm text-ink/70">
            <span>IVA 21%</span>
            <span className="tabular-nums">{EUR.format(iva / 100)}</span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
            <p className="text-xs uppercase tracking-wider text-ink/50">Total con IVA</p>
            <p className="font-display text-2xl font-semibold tabular-nums text-ink">
              {EUR.format(totalWithIva / 100)}
            </p>
          </div>
          <div className="mt-3 border-t border-line pt-3">
            <DeliveryEstimate variant="inline" />
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} className="self-start rounded-3xl border border-line bg-bone p-6 lg:sticky lg:top-24">
        {(() => {
          // Detectamos si TODOS los items tienen precio calculado para
          // ofrecer pago directo. Si falta alguno, solo cotización.
          const allPriced =
            items.length > 0 &&
            items.every(
              (it) =>
                typeof it.totalClientCents === "number" && it.totalClientCents > 0,
            );
          const unpricedItems = items.filter(
            (it) =>
              !(typeof it.totalClientCents === "number" && it.totalClientCents > 0),
          );
          return (
            <>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
                {allPriced ? "Finalizar pedido" : "Tus datos"}
              </p>
              <p className="mt-1 font-display text-xl font-semibold text-ink">
                {allPriced
                  ? "Paga ahora o pide cotización cerrada."
                  : "Solicita la cotización cerrada."}
              </p>
              {allPriced && (
                <p className="mt-2 text-xs text-ink/60">
                  Todos tus productos tienen precio configurado. Puedes pagar
                  directamente con tarjeta, Apple Pay o Google Pay, o pedir
                  presupuesto cerrado para tu equipo si necesitas factura
                  pro-forma o aprobación interna.
                </p>
              )}
              {!allPriced && unpricedItems.length > 0 && items.length > 0 && (
                <div className="mt-3 rounded-xl border border-accent/30 bg-accent-wash/40 p-3 text-xs">
                  <p className="font-medium text-accent-deep">
                    Pago con tarjeta no disponible
                  </p>
                  <p className="mt-1 text-ink/70">
                    {unpricedItems.length === 1
                      ? "Hay 1 producto en tu carrito sin precio cerrado."
                      : `Hay ${unpricedItems.length} productos en tu carrito sin precio cerrado.`}{" "}
                    Suele pasar con productos con marcaje muy custom o agotados.
                    Pide cotización cerrada y te respondemos en &lt;24 h.
                  </p>
                  <ul className="mt-2 space-y-0.5 text-[11px] text-ink/55">
                    {unpricedItems.slice(0, 3).map((it, i) => (
                      <li key={i}>· {it.productName}</li>
                    ))}
                    {unpricedItems.length > 3 && (
                      <li>· y {unpricedItems.length - 3} más…</li>
                    )}
                  </ul>
                  {items.length > unpricedItems.length && (
                    <button
                      type="button"
                      onClick={removeUnpricedItems}
                      className="mt-2 text-[11px] font-medium text-accent underline-offset-2 hover:underline"
                    >
                      Quitar estos productos y pagar el resto con tarjeta →
                    </button>
                  )}
                </div>
              )}
            </>
          );
        })()}

        <div className="mt-5 grid gap-3">
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre y apellidos"
            required
            className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          <input
            name="company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Empresa (opcional)"
            className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          <input
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          <input
            name="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Teléfono (opcional)"
            className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          <input
            name="deadline"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            placeholder="Fecha límite (opcional)"
            className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          <textarea
            name="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Detalles del brief: público, valores de marca, tipo de logo (vector/imagen), envío…"
            rows={4}
            className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          <label className="flex items-start gap-2 text-xs text-ink/65">
            <input
              type="checkbox"
              checked={whatsappOptIn}
              onChange={(e) => setWhatsappOptIn(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#25D366]"
            />
            <span>
              Quiero recibir el presupuesto por <strong>WhatsApp</strong> (más rápido). Acepto que me
              escribáis al teléfono que he indicado.
            </span>
          </label>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-accent-wash p-2.5 text-xs text-accent-deep">
            ⚠ {error}
          </p>
        )}

        {(() => {
          const allPriced =
            items.length > 0 &&
            items.every(
              (it) =>
                typeof it.totalClientCents === "number" && it.totalClientCents > 0,
            );
          return (
            <>
              {allPriced ? (
                <>
                  <button
                    type="button"
                    onClick={() => submitCart(true)}
                    disabled={submitting}
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-6 py-3.5 text-sm font-semibold text-bone shadow-sm transition hover:bg-accent-dark disabled:opacity-40"
                  >
                    {submitting ? (
                      "Redirigiendo a Stripe…"
                    ) : (
                      <>
                        <svg
                          viewBox="0 0 24 24"
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <rect x="2" y="5" width="20" height="14" rx="2" />
                          <path d="M2 10h20" />
                        </svg>
                        Pagar ahora · {EUR.format(totalWithIva / 100)}
                      </>
                    )}
                  </button>
                  <p className="mt-2 text-center text-[11px] text-ink/50">
                    💳 Tarjeta · 🍎 Apple Pay · ⓖ Google Pay · 🔗 Link · pago seguro Stripe
                  </p>
                  <div className="mt-4 flex items-center gap-3 text-[10px] uppercase tracking-wider text-ink/30">
                    <div className="h-px flex-1 bg-line" />
                    <span>o</span>
                    <div className="h-px flex-1 bg-line" />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-line bg-bone-soft px-6 py-3 text-sm font-medium text-ink/80 transition hover:border-ink hover:text-ink disabled:opacity-40"
                  >
                    {submitting ? "Enviando…" : "Solo cotización para mi equipo"}
                  </button>
                  <p className="mt-3 text-[11px] text-ink/50">
                    Si necesitas factura pro-forma, aprobación interna o
                    plazo de pago, te enviamos presupuesto cerrado por email
                    en menos de 24 h laborables.
                  </p>
                  <p className="mt-3 text-xs text-ink/60">
                    ¿Alguna duda antes de pedir?{" "}
                    <AskDiego
                      label="Diego te la resuelve al momento"
                      context={`El cliente está en el carrito, a punto de pedir cotización, con: ${items
                        .slice(0, 5)
                        .map((it) => `${it.quantity}× ${it.productName}`)
                        .join(", ")}${items.length > 5 ? ` y ${items.length - 5} líneas más` : ""}. Resuélvele dudas para que complete el pedido; no le hagas repetir lo que ya tiene en el carrito.`}
                    />
                  </p>
                </>
              ) : (
                <>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-bone transition hover:bg-accent disabled:opacity-40"
                  >
                    {submitting ? "Enviando…" : "Pedir cotización cerrada"}
                  </button>
                  <p className="mt-3 text-[11px] text-ink/50">
                    Algunos productos requieren configuración personalizada.
                    Te enviamos cotización cerrada con precio, mockup y plazo
                    en menos de 24 h. Sin compromiso.
                  </p>
                  <p className="mt-3 text-xs text-ink/60">
                    ¿Alguna duda antes de pedir?{" "}
                    <AskDiego
                      label="Diego te la resuelve al momento"
                      context={`El cliente está en el carrito, a punto de pedir cotización, con: ${items
                        .slice(0, 5)
                        .map((it) => `${it.quantity}× ${it.productName}`)
                        .join(", ")}${items.length > 5 ? ` y ${items.length - 5} líneas más` : ""}. Resuélvele dudas para que complete el pedido; no le hagas repetir lo que ya tiene en el carrito.`}
                    />
                  </p>
                </>
              )}
            </>
          );
        })()}

        {/* Canal WhatsApp — cotización con el carrito completo en 1 toque. */}
        <div className="mt-4 border-t border-line pt-4">
          <a
            href={waLink(
              waCartQuoteMessage(
                items.map((it) => ({
                  productName: it.productName,
                  productRef: it.productRef,
                  quantity: it.quantity,
                  markingTechniqueName: it.markingTechniqueName,
                  markingPositionId: it.markingPositionId,
                })),
                EUR.format(totalWithIva / 100),
              ),
            )}
            target="_blank"
            rel="noopener"
            onClick={() => {
              trackLead({ method: "whatsapp-carrito", value: totalWithIva / 100 });
              trackWaClick("carrito");
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#25D366] bg-[#25D366]/5 px-6 py-3 text-sm font-semibold text-[#0e6b3a] transition hover:bg-[#25D366]/10"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.51 5.26l-.999 3.648 3.978-1.607zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.371-.025-.52-.075-.149-.669-1.611-.916-2.206-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
            </svg>
            Pedir cotización por WhatsApp
          </a>
          <p className="mt-2 text-center text-[11px] text-ink/50">
            Te llega tu carrito a nuestro WhatsApp y cerramos precio por ahí.
          </p>
        </div>
      </form>
    </div>
  );
}
