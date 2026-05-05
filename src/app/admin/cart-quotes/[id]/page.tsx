"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

type CartItem = {
  id: string;
  productSlug: string;
  productRef: string;
  productName: string;
  primaryImageUrl: string | null;
  quantity: number;
  variantSku: string | null;
  colorName: string | null;
  markingTechniqueName: string | null;
  markingPositionId: string | null;
  markingColours: number | null;
  markingComplexity: string | null;
  unitPriceClientCents: number | null;
  totalClientCents: number | null;
  notes: string | null;
};

type Cart = {
  id: string;
  createdAt: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  message: string | null;
  deadline: string | null;
  status: string;
  internalNotes: string | null;
  estimatedTotalCents: number | null;
  items: CartItem[];
};

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const STATUSES = ["NEW", "IN_PROGRESS", "SENT", "CONFIRMED", "ORDERED", "ARCHIVED"];

export default function AdminCartQuoteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [secret, setSecret] = useState("");
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem("merch:admin");
      if (s) setSecret(s);
    } catch {}
  }, []);

  useEffect(() => {
    if (!secret) return;
    fetch(`/api/admin/cart-quotes/${id}`, { headers: { "X-Admin-Secret": secret } })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else {
          setCart(d);
          setNotes(d.internalNotes || "");
        }
      });
  }, [secret, id]);

  async function patch(payload: { status?: string; internalNotes?: string }) {
    const res = await fetch(`/api/admin/cart-quotes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-Admin-Secret": secret },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.cart) setCart((prev) => (prev ? { ...prev, ...data.cart } : null));
  }

  if (error) {
    return (
      <main className="p-12">
        <p className="text-accent">⚠ {error}</p>
        <Link href="/admin/cart-quotes" className="mt-4 inline-block text-sm text-accent">← Volver</Link>
      </main>
    );
  }
  if (!cart) {
    return <main className="p-12 text-ink/60">Cargando…</main>;
  }

  return (
    <main className="min-h-screen bg-bone-soft p-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin/cart-quotes" className="text-xs text-ink/60 hover:text-accent">
          ← Carritos
        </Link>

        <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-ink">
              {cart.name}{cart.company && <span className="text-ink/60"> · {cart.company}</span>}
            </h1>
            <p className="mt-1 text-sm text-ink/70">
              <a href={`mailto:${cart.email}`} className="hover:text-accent">{cart.email}</a>
              {cart.phone && <span> · <a href={`tel:${cart.phone}`} className="hover:text-accent">{cart.phone}</a></span>}
            </p>
            <p className="mt-1 text-xs text-ink/50">
              {new Date(cart.createdAt).toLocaleString("es-ES")} · ID <code>{cart.id}</code>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-ink/50">Total estimado</p>
            <p className="font-display text-2xl font-semibold tabular-nums text-ink">
              {cart.estimatedTotalCents != null ? EUR.format(cart.estimatedTotalCents / 100) : "—"}
            </p>
            <select
              value={cart.status}
              onChange={(e) => patch({ status: e.target.value })}
              className="mt-3 rounded-full border border-line bg-bone px-4 py-1.5 text-xs"
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </header>

        {cart.message && (
          <div className="mt-6 rounded-2xl border border-line bg-bone p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-ink/50">Brief del cliente</p>
            <p className="mt-2 whitespace-pre-line text-[15px] text-ink/80">{cart.message}</p>
            {cart.deadline && (
              <p className="mt-3 text-xs text-ink/60">
                Fecha límite: <strong>{cart.deadline}</strong>
              </p>
            )}
          </div>
        )}

        {/* Items */}
        <div className="mt-6 space-y-3">
          {cart.items.map((it) => (
            <div key={it.id} className="rounded-2xl border border-line bg-bone p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/catalogo/${it.productSlug}`} className="font-display text-lg font-semibold text-ink hover:text-accent">
                    {it.productName}
                  </Link>
                  <p className="text-xs text-ink/50">Ref. {it.productRef}</p>
                  <p className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="rounded-full bg-bone-soft px-2 py-0.5">Cant: {it.quantity}</span>
                    {it.colorName && <span className="rounded-full bg-bone-soft px-2 py-0.5">{it.colorName}</span>}
                    {it.markingTechniqueName && (
                      <span className="rounded-full bg-accent-wash px-2 py-0.5 text-accent-deep">
                        {it.markingTechniqueName} en {it.markingPositionId}{it.markingColours && it.markingColours > 1 ? ` · ${it.markingColours} col.` : ""}
                      </span>
                    )}
                    {it.markingComplexity && <span className="rounded-full bg-bone-soft px-2 py-0.5">Compl. {it.markingComplexity}</span>}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums text-ink">
                    {it.totalClientCents != null ? EUR.format(it.totalClientCents / 100) : "—"}
                  </p>
                  {it.unitPriceClientCents != null && (
                    <p className="text-xs text-ink/50">{EUR.format(it.unitPriceClientCents / 100)}/ud</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Notas internas */}
        <div className="mt-6 rounded-2xl border border-line bg-bone p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-ink/50">Notas internas</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="mt-2 w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={async () => {
              setSavingNotes(true);
              await patch({ internalNotes: notes });
              setSavingNotes(false);
            }}
            className="mt-3 rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-bone hover:bg-accent"
          >
            {savingNotes ? "Guardando…" : "Guardar notas"}
          </button>
        </div>
      </div>
    </main>
  );
}
