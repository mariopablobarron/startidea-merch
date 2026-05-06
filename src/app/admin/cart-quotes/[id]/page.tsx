"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { OrderTimeline, type TimelineEvent } from "@/components/OrderTimeline";

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
  acceptedTotalCents?: number | null;
  depositPercent?: number | null;
  paymentLinkToken?: string | null;
  confirmedAt?: string | null;
  orderedAt?: string | null;
  items: CartItem[];
  proofs?: { status: string; decidedAt: string | null; createdAt: string }[];
  payments?: { paidAt: string | null; amountCents: number }[];
  trackings?: { status: string | null; fetchedAt: string; trackingCode: string | null; carrier: string | null }[];
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

        {/* Timeline */}
        <CartTimeline cart={cart} />

        {/* PDF de propuesta */}
        <ProposalPdfButton cartId={id} secret={secret} />

        {/* Pago Stripe */}
        <PaymentLinkPanel cartId={id} secret={secret} cart={cart} onUpdate={(c) => setCart((prev) => (prev ? { ...prev, ...c } : null))} />

        {/* Acciones MidOcean */}
        <OrderActions cartId={id} secret={secret} />
      </div>
    </main>
  );
}

function ProposalPdfButton({ cartId, secret }: { cartId: string; secret: string }) {
  const [busy, setBusy] = useState(false);
  async function open(forceDownload: boolean) {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/cart-quotes/${cartId}/proposal${forceDownload ? "?download=1" : ""}`,
        { headers: { "X-Admin-Secret": secret } },
      );
      if (!res.ok) {
        alert("Error generando PDF");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-6 rounded-2xl border border-line bg-bone p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-ink/50">Propuesta comercial</p>
      <p className="mt-1 font-display text-lg font-semibold text-ink">PDF de cotización con marca</p>
      <p className="mt-1 text-xs text-ink/60">
        Genera un PDF profesional con razón social, items, totales con IVA y términos.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => open(false)}
          disabled={busy}
          className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-bone hover:bg-accent disabled:opacity-40"
        >
          {busy ? "Generando…" : "Ver PDF en navegador"}
        </button>
        <button
          type="button"
          onClick={() => open(true)}
          disabled={busy}
          className="rounded-full border border-line bg-bone-soft px-4 py-2 text-xs font-medium hover:border-accent disabled:opacity-40"
        >
          Descargar PDF
        </button>
      </div>
    </div>
  );
}

function PaymentLinkPanel({
  cartId,
  secret,
  cart,
  onUpdate,
}: {
  cartId: string;
  secret: string;
  cart: Cart;
  onUpdate: (next: Partial<Cart>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [acceptedTotal, setAcceptedTotal] = useState(
    cart.estimatedTotalCents != null ? Math.round(cart.estimatedTotalCents / 100) : 0,
  );
  const [depositPercent, setDepositPercent] = useState(50);
  const [sendEmail, setSendEmail] = useState(true);
  const [result, setResult] = useState<{ url?: string; depositCents?: number } | null>(null);

  async function createLink() {
    if (acceptedTotal < 1) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/cart-quotes/${cartId}/payment-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Secret": secret },
        body: JSON.stringify({
          acceptedTotalCents: Math.round(acceptedTotal * 100),
          depositPercent,
          sendEmail,
        }),
      });
      const data = await res.json();
      setResult(data);
      onUpdate({
        acceptedTotalCents: Math.round(acceptedTotal * 100),
        depositPercent,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-line bg-bone p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink/50">Pago online</p>
          <p className="mt-1 font-display text-lg font-semibold text-ink">Crear enlace de pago Stripe</p>
        </div>
        {cart.acceptedTotalCents != null && (
          <p className="text-right text-xs text-ink/60">
            Aceptado: <strong>{EUR.format(cart.acceptedTotalCents / 100)}</strong>
            <br />Depósito: {cart.depositPercent ?? 0}%
          </p>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink/50">Total aceptado (€)</span>
          <input
            type="number"
            value={acceptedTotal}
            onChange={(e) => setAcceptedTotal(parseFloat(e.target.value) || 0)}
            min={1}
            step={0.01}
            className="mt-1 w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm tabular-nums outline-none focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink/50">Depósito (%)</span>
          <select
            value={depositPercent}
            onChange={(e) => setDepositPercent(parseInt(e.target.value))}
            className="mt-1 w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {[25, 30, 50, 70, 100].map((p) => (
              <option key={p} value={p}>{p}%</option>
            ))}
          </select>
        </label>
        <label className="flex items-end gap-2 pb-2 text-xs text-ink/70">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          Enviar email al cliente
        </label>
      </div>

      <button
        type="button"
        disabled={busy || acceptedTotal < 1}
        onClick={createLink}
        className="mt-4 rounded-full bg-ink px-4 py-2 text-xs font-medium text-bone hover:bg-accent disabled:opacity-40"
      >
        {busy ? "Creando…" : cart.paymentLinkToken ? "Regenerar enlace" : "Crear enlace y enviar"}
      </button>

      {result?.url && (
        <p className="mt-3 rounded-lg bg-bone-soft p-3 text-xs">
          Link: <a href={result.url} target="_blank" rel="noreferrer" className="text-accent underline-offset-4 hover:underline">{result.url}</a>
          <br />
          Importe a cobrar: <strong>{EUR.format((result.depositCents || 0) / 100)}</strong>
        </p>
      )}
    </div>
  );
}

function OrderActions({ cartId, secret }: { cartId: string; secret: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [proofUrl, setProofUrl] = useState("");

  async function placeOrder() {
    if (!confirm("¿Crear pedido en MidOcean? Si MIDOCEAN_LIVE_ORDERS=true se enviará de verdad.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/cart-quotes/${cartId}/place-order`, {
        method: "POST",
        headers: { "X-Admin-Secret": secret },
      });
      setResult(await res.json());
    } finally {
      setBusy(false);
    }
  }

  async function loadTracking() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/cart-quotes/${cartId}/tracking`, {
        headers: { "X-Admin-Secret": secret },
      });
      setResult(await res.json());
    } finally {
      setBusy(false);
    }
  }

  async function createProof() {
    if (!proofUrl) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/cart-quotes/${cartId}/proofs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Secret": secret },
        body: JSON.stringify({ artworkUrl: proofUrl }),
      });
      setResult(await res.json());
      setProofUrl("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-2xl border border-line bg-bone p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-ink/50">Acciones MidOcean</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={placeOrder}
            className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-bone hover:bg-accent disabled:opacity-40"
          >
            Crear pedido (place order)
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={loadTracking}
            className="rounded-full border border-line bg-bone-soft px-4 py-2 text-xs font-medium hover:border-accent disabled:opacity-40"
          >
            Consultar tracking
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-bone p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-ink/50">Crear proof para el cliente</p>
        <p className="mt-1 text-xs text-ink/60">
          URL del mockup (Drive/S3/Dropbox público). Se enviará un email al cliente con un link único para aprobar/rechazar.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={proofUrl}
            onChange={(e) => setProofUrl(e.target.value)}
            placeholder="https://…/mockup.png"
            className="flex-1 rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="button"
            disabled={busy || !/^https?:\/\//.test(proofUrl)}
            onClick={createProof}
            className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-bone hover:bg-accent disabled:opacity-40"
          >
            Enviar al cliente
          </button>
        </div>
      </div>

      {result != null && (
        <pre className="overflow-x-auto rounded-2xl border border-line bg-ink p-4 text-[11px] text-bone/80">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

function CartTimeline({ cart }: { cart: Cart }) {
  const events: TimelineEvent[] = [];
  events.push({ stage: "RECEIVED", at: cart.createdAt });
  if (cart.status === "IN_PROGRESS" || cart.status === "SENT" || cart.status === "CONFIRMED" || cart.status === "ORDERED") {
    events.push({ stage: "REVIEWING", at: cart.createdAt });
  }
  if (cart.status === "SENT" || cart.status === "CONFIRMED" || cart.status === "ORDERED") {
    events.push({ stage: "QUOTE_SENT", at: cart.createdAt });
  }
  const firstPayment = cart.payments?.[cart.payments.length - 1];
  if (firstPayment?.paidAt) {
    events.push({
      stage: "PAID",
      at: firstPayment.paidAt,
      details: `${(firstPayment.amountCents / 100).toFixed(2)} €`,
    });
  }
  const approvedProof = cart.proofs?.find((p) => p.status === "APPROVED");
  if (approvedProof?.decidedAt) {
    events.push({ stage: "PROOF_APPROVED", at: approvedProof.decidedAt });
  }
  if (cart.orderedAt) {
    events.push({ stage: "IN_PRODUCTION", at: cart.orderedAt });
  }
  const lastTracking = cart.trackings?.[0];
  if (lastTracking?.status) {
    if (lastTracking.status.match(/deliver|entreg/i)) {
      events.push({ stage: "DELIVERED", at: lastTracking.fetchedAt, details: lastTracking.trackingCode || undefined });
    } else if (lastTracking.status.match(/ship|env[ií]/i) || lastTracking.trackingCode) {
      events.push({ stage: "SHIPPED", at: lastTracking.fetchedAt, details: lastTracking.trackingCode ? `${lastTracking.carrier || "Tracking"} ${lastTracking.trackingCode}` : undefined });
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-line bg-bone p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-ink/50">Timeline del pedido</p>
      <div className="mt-4">
        <OrderTimeline events={events} />
      </div>
    </div>
  );
}
