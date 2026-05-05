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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
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
          items,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; id?: string; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || "Algo falló enviando la cotización.");
      } else {
        setSuccess(
          `Cotización recibida (ref. ${data.id?.slice(0, 8) ?? "?"}). Te respondemos en menos de 24 horas a ${email}.`,
        );
        clearCart();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red.");
    } finally {
      setSubmitting(false);
    }
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

  const total = cartTotalCents(items);

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

        <div className="flex items-center justify-between rounded-2xl border border-line bg-bone-soft p-5">
          <p className="text-xs uppercase tracking-wider text-ink/50">Total estimado</p>
          <p className="font-display text-2xl font-semibold tabular-nums text-ink">
            {EUR.format(total / 100)}
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="self-start rounded-3xl border border-line bg-bone p-6 lg:sticky lg:top-24">
        <p className="text-xs font-medium uppercase tracking-wider text-accent">Tus datos</p>
        <p className="mt-1 font-display text-xl font-semibold text-ink">
          Solicita la cotización cerrada.
        </p>

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

        <button
          type="submit"
          disabled={submitting}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-bone transition hover:bg-accent disabled:opacity-40"
        >
          {submitting ? "Enviando…" : "Pedir cotización cerrada"}
        </button>
        <p className="mt-3 text-[11px] text-ink/50">
          Recibirás un email confirmando que la hemos recibido y otro en menos de 24 h con
          presupuesto cerrado, mockup y plazo. Sin compromiso.
        </p>
      </form>
    </div>
  );
}
