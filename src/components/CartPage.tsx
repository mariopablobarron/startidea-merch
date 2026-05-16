"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { readCart, writeCart, removeItem, clearCart, cartTotalCents, type CartItem } from "@/lib/cart-storage";

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // form
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [deadline, setDeadline] = useState("");
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
    return () => window.removeEventListener("merch:cart-change", refresh);
  }, []);

  function updateQty(slug: string, techCode: string | null | undefined, qty: number) {
    const next = readCart().map((it) =>
      it.productSlug === slug && it.markingTechniqueCode === techCode
        ? { ...it, quantity: Math.max(1, qty), totalClientCents: it.unitPriceClientCents ? it.unitPriceClientCents * Math.max(1, qty) : it.totalClientCents }
        : it,
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
          couponCode: couponDiscount ? couponDiscount.code : undefined,
          items,
          directPay,
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
      // Si pidió pago directo y el backend nos devuelve URL, redirige a Stripe.
      if (directPay && data.payUrl) {
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

  const subtotal = cartTotalCents(items);
  const discount = couponDiscount?.discountCents || 0;
  const total = Math.max(0, subtotal - discount);

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
            key={`${it.productSlug}-${it.markingTechniqueCode || "_"}-${i}`}
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
                      updateQty(it.productSlug, it.markingTechniqueCode, parseInt(e.target.value) || 1)
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
                onClick={() => removeItem(it.productSlug, it.markingTechniqueCode)}
                className="mt-3 text-xs text-ink/50 hover:text-accent"
              >
                Quitar
              </button>
            </div>
          </article>
        ))}

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
            <span>Subtotal</span>
            <span className="tabular-nums">{EUR.format(subtotal / 100)}</span>
          </div>
          {discount > 0 && (
            <div className="mt-1 flex items-center justify-between text-sm text-social">
              <span>Descuento {couponDiscount?.code}</span>
              <span className="tabular-nums">−{EUR.format(discount / 100)}</span>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
            <p className="text-xs uppercase tracking-wider text-ink/50">Total estimado</p>
            <p className="font-display text-2xl font-semibold tabular-nums text-ink">
              {EUR.format(total / 100)}
            </p>
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
                        Pagar ahora · {EUR.format(total / 100)}
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
                </>
              )}
            </>
          );
        })()}
      </form>
    </div>
  );
}
