"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { OrderTimeline, type TimelineEvent } from "@/components/OrderTimeline";
import { PurchaseOrdersBlock } from "@/components/admin/PurchaseOrdersBlock";

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
  customerLogoUrl: string | null;
  customerLogoFilename: string | null;
  customerLogoSize: number | null;
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
  paymentLinkSentAt?: string | null;
  paymentLinkExpiresAt?: string | null;
  lostReason?: string | null;
  lostAt?: string | null;
  autoProposalId?: string | null;
  autoProposal?: {
    id: string;
    proposalNumber: string;
    status: string;
    sentAt: string | null;
    openedAt: string | null;
    acceptedAt: string | null;
  } | null;
  confirmedAt?: string | null;
  orderedAt?: string | null;
  items: CartItem[];
  proofs?: { status: string; decidedAt: string | null; createdAt: string }[];
  payments?: { paidAt: string | null; amountCents: number }[];
  trackings?: { status: string | null; fetchedAt: string; trackingCode: string | null; carrier: string | null }[];
  purchaseOrders?: Array<{
    id: string;
    supplier: string;
    supplierOrderRef: string | null;
    status: "PENDING" | "PLACED" | "IN_PRODUCTION" | "SHIPPED" | "DELIVERED" | "CANCELED" | "FAILED";
    totalClientCents: number;
    estimatedDeliveryDate: string | null;
    shippedAt: string | null;
    deliveredAt: string | null;
    trackingCarrier: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
    errorMessage: string | null;
    internalNotes: string | null;
    items: Array<{ id: string; quantity: number; productName: string; productRef: string }>;
  }>;
};

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const STATUSES = ["NEW", "IN_PROGRESS", "SENT", "CONFIRMED", "ORDERED", "ARCHIVED", "LOST"];

export default function AdminCartQuoteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  // Edición de líneas
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [itemBusy, setItemBusy] = useState(false);
  const [itemErr, setItemErr] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addRef, setAddRef] = useState("");
  const [addQty, setAddQty] = useState("");
  const [addMargin, setAddMargin] = useState("60");

  // Auth: cookie merch_admin (sesión nueva). El backend acepta también
  // el header legacy X-Admin-Secret pero no lo enviamos — la cookie
  // basta. Antes esto esperaba a un sessionStorage que normalmente está
  // vacío en sesiones cookie-based, y la página se quedaba en "Cargando…".
  useEffect(() => {
    fetch(`/api/admin/cart-quotes/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else {
          setCart(d);
          setNotes(d.internalNotes || "");
        }
      });
  }, [id]);

  async function patch(payload: { status?: string; internalNotes?: string; lostReason?: string }) {
    const res = await fetch(`/api/admin/cart-quotes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.cart) setCart((prev) => (prev ? { ...prev, ...data.cart } : null));
  }

  // ─── Edición de líneas del presupuesto ────────────────────────────────────
  async function reload() {
    const r = await fetch(`/api/admin/cart-quotes/${id}`);
    const d = await r.json();
    if (!d.error) setCart(d);
  }

  function startEdit(it: CartItem) {
    setEditingId(it.id);
    setEditQty(String(it.quantity));
    setEditUnit(it.unitPriceClientCents != null ? (it.unitPriceClientCents / 100).toFixed(2) : "");
    setItemErr(null);
  }

  async function saveItem(itemId: string) {
    setItemBusy(true);
    setItemErr(null);
    try {
      const quantity = parseInt(editQty, 10);
      const unit = editUnit.trim()
        ? Math.round((parseFloat(editUnit.replace(",", ".")) || 0) * 100)
        : undefined;
      const payload: { quantity?: number; unitPriceClientCents?: number } = {};
      if (Number.isFinite(quantity) && quantity > 0) payload.quantity = quantity;
      if (unit != null && Number.isFinite(unit) && unit >= 0) payload.unitPriceClientCents = unit;
      const r = await fetch(`/api/admin/cart-quotes/${id}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setItemErr(d.error || `Error ${r.status}`);
        return;
      }
      setEditingId(null);
      await reload();
    } catch {
      setItemErr("Error de red");
    } finally {
      setItemBusy(false);
    }
  }

  async function deleteItem(itemId: string) {
    if (!confirm("¿Quitar esta línea del presupuesto?")) return;
    setItemBusy(true);
    setItemErr(null);
    try {
      const r = await fetch(`/api/admin/cart-quotes/${id}/items/${itemId}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setItemErr(d.error || `Error ${r.status}`);
        return;
      }
      await reload();
    } catch {
      setItemErr("Error de red");
    } finally {
      setItemBusy(false);
    }
  }

  async function addItem() {
    const qty = parseInt(addQty, 10);
    if (!addRef.trim() || !Number.isFinite(qty) || qty < 1) return;
    setItemBusy(true);
    setItemErr(null);
    try {
      const r = await fetch(`/api/admin/cart-quotes/${id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ref: addRef.trim(),
          qty,
          marginPct: addMargin ? Number(addMargin) : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setItemErr(d.error || `Error ${r.status}`);
        return;
      }
      setAddRef("");
      setAddQty("");
      setShowAdd(false);
      await reload();
    } catch {
      setItemErr("Error de red");
    } finally {
      setItemBusy(false);
    }
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

  // Líneas no editables si el pedido ya se cursó al proveedor o está archivado.
  const locked = cart.status === "ORDERED" || cart.status === "ARCHIVED";

  return (
    <main className="min-h-screen bg-bone-soft p-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin/cart-quotes" className="text-xs text-ink/60 hover:text-accent">
          ← Carritos
        </Link>

        <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              — Cotización <code className="font-mono">{cart.id.slice(0, 8)}</code>
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
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
              onChange={(e) => {
                const v = e.target.value;
                if (v === "LOST") {
                  const reason = window.prompt("Motivo de la pérdida (opcional):") ?? "";
                  patch({ status: "LOST", lostReason: reason || undefined });
                } else {
                  patch({ status: v });
                }
              }}
              className="mt-3 rounded-full border border-line bg-bone px-4 py-1.5 text-xs"
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {cart.status === "LOST" && cart.lostReason && (
              <p className="mt-1 text-[11px] text-accent-deep">Perdida: {cart.lostReason}</p>
            )}
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
                  {it.customerLogoUrl && (
                    <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-social/30 bg-social/5 px-2 py-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={it.customerLogoUrl}
                        alt={it.customerLogoFilename || "Logo"}
                        className="h-8 w-8 rounded object-contain"
                      />
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider text-social">
                          Logo cliente
                        </p>
                        <a
                          href={it.customerLogoUrl}
                          download={it.customerLogoFilename || "logo"}
                          className="text-[11px] font-medium text-social hover:underline"
                        >
                          {it.customerLogoFilename || "Descargar"} ↓
                        </a>
                      </div>
                    </div>
                  )}
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
              {!locked &&
                (editingId === it.id ? (
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line/60 pt-3">
                    <label className="text-[10px] uppercase tracking-wider text-ink/55">
                      Cantidad
                      <input
                        value={editQty}
                        onChange={(e) => setEditQty(e.target.value)}
                        inputMode="numeric"
                        className="mt-1 block w-24 rounded-lg border border-line bg-bone-soft px-2 py-1 text-right font-mono text-sm outline-none focus:border-accent"
                      />
                    </label>
                    <label className="text-[10px] uppercase tracking-wider text-ink/55">
                      PVP unit. € (sin IVA)
                      <input
                        value={editUnit}
                        onChange={(e) => setEditUnit(e.target.value)}
                        inputMode="decimal"
                        className="mt-1 block w-28 rounded-lg border border-line bg-bone-soft px-2 py-1 text-right font-mono text-sm outline-none focus:border-accent"
                      />
                    </label>
                    <button
                      onClick={() => saveItem(it.id)}
                      disabled={itemBusy}
                      className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-bone hover:bg-accent-deep disabled:opacity-50"
                    >
                      {itemBusy ? "Guardando…" : "Guardar"}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="rounded-full border border-line px-3 py-1.5 text-xs text-ink/60 hover:text-ink"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-3 border-t border-line/60 pt-3">
                    <button
                      onClick={() => startEdit(it)}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      ✎ Editar
                    </button>
                    <button
                      onClick={() => deleteItem(it.id)}
                      disabled={itemBusy}
                      className="text-xs text-ink/40 hover:text-accent-deep disabled:opacity-50"
                    >
                      ✕ Quitar
                    </button>
                  </div>
                ))}
            </div>
          ))}
        </div>

        {/* Subtotal + edición/añadir de líneas */}
        {itemErr && (
          <p className="mt-3 rounded-xl bg-accent-wash p-2 text-xs text-accent-deep">⚠ {itemErr}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink/70">
            Base estimada (sin IVA):{" "}
            <strong className="tabular-nums text-ink">
              {EUR.format((cart.estimatedTotalCents ?? 0) / 100)}
            </strong>
          </p>
          {!locked && !showAdd && (
            <button
              onClick={() => setShowAdd(true)}
              className="rounded-full border-2 border-social px-4 py-1.5 text-xs font-semibold text-social transition hover:bg-social hover:text-bone"
            >
              ➕ Añadir línea
            </button>
          )}
          {locked && (
            <span className="text-[11px] text-ink/45">
              Pedido en producción — líneas bloqueadas
            </span>
          )}
        </div>
        {!locked && showAdd && (
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-2xl border border-social/40 bg-bone p-4">
            <label className="text-[10px] uppercase tracking-wider text-ink/55">
              Referencia
              <input
                value={addRef}
                onChange={(e) => setAddRef(e.target.value)}
                placeholder="STM-… o ref proveedor"
                className="mt-1 block w-52 rounded-lg border border-line bg-bone-soft px-2 py-1 font-mono text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="text-[10px] uppercase tracking-wider text-ink/55">
              Cantidad
              <input
                value={addQty}
                onChange={(e) => setAddQty(e.target.value)}
                inputMode="numeric"
                placeholder="250"
                className="mt-1 block w-24 rounded-lg border border-line bg-bone-soft px-2 py-1 text-right font-mono text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="text-[10px] uppercase tracking-wider text-ink/55">
              Margen %
              <input
                value={addMargin}
                onChange={(e) => setAddMargin(e.target.value)}
                inputMode="numeric"
                className="mt-1 block w-20 rounded-lg border border-line bg-bone-soft px-2 py-1 text-right font-mono text-sm outline-none focus:border-accent"
              />
            </label>
            <button
              onClick={addItem}
              disabled={itemBusy || !addRef.trim() || !addQty.trim()}
              className="rounded-full bg-social px-4 py-1.5 text-xs font-semibold text-bone transition hover:opacity-90 disabled:opacity-50"
            >
              {itemBusy ? "Añadiendo…" : "Añadir"}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="rounded-full border border-line px-3 py-1.5 text-xs text-ink/60 hover:text-ink"
            >
              Cancelar
            </button>
          </div>
        )}

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

        {/* PurchaseOrders (split por proveedor) — tracking + status + ref */}
        {cart.purchaseOrders && cart.purchaseOrders.length > 0 && (
          <PurchaseOrdersBlock purchaseOrders={cart.purchaseOrders} />
        )}

        {/* PDF de propuesta */}
        <ProposalPdfButton cartId={id} />

        {/* Enviar propuesta del agente al cliente (1 clic) */}
        <ProposalSendPanel cart={cart} onUpdate={(c) => setCart((prev) => (prev ? { ...prev, ...c } : null))} />

        {/* Pago Stripe */}
        <PaymentLinkPanel cartId={id} cart={cart} onUpdate={(c) => setCart((prev) => (prev ? { ...prev, ...c } : null))} />

        {/* Acciones MidOcean */}
        <OrderActions cartId={id} />
      </div>
    </main>
  );
}

function ProposalPdfButton({ cartId }: { cartId: string }) {
  const [busy, setBusy] = useState(false);
  async function open(forceDownload: boolean) {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/cart-quotes/${cartId}/proposal${forceDownload ? "?download=1" : ""}`,
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

function proposalStatusLabel(s: string): string {
  return s === "sent"
    ? "enviada"
    : s === "opened"
      ? "abierta por el cliente"
      : s === "accepted"
        ? "✓ aceptada"
        : s === "rejected"
          ? "rechazada"
          : s;
}

function ProposalSendPanel({
  cart,
  onUpdate,
}: {
  cart: Cart;
  onUpdate: (next: Partial<Cart>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const p = cart.autoProposal;

  async function generateDraft() {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/cart-quotes/${cart.id}/draft-proposal`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        onUpdate({ autoProposalId: data.autoProposal.id, autoProposal: data.autoProposal });
      } else {
        setFeedback({ ok: false, msg: data.error || "Error" });
      }
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!p) return;
    if (!confirm(`¿Enviar la propuesta ${p.proposalNumber} por email a ${cart.email}?`)) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/proposals/${p.id}/send-to-client`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setFeedback({ ok: true, msg: `Enviada a ${data.sentTo}` });
        onUpdate({
          status: cart.status === "NEW" ? "SENT" : cart.status,
          autoProposal: { ...p, status: "sent", sentAt: new Date().toISOString() },
        });
      } else {
        setFeedback({ ok: false, msg: data.error || "Error" });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-line bg-bone p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-ink/50">Propuesta al cliente</p>
      {!p ? (
        <>
          <p className="mt-1 text-sm text-ink/60">
            El agente genera un borrador automáticamente para cotizaciones nuevas con precio. Aún no
            hay una vinculada — puedes generarla ahora (carritos antiguos o sin procesar).
          </p>
          <button
            type="button"
            onClick={generateDraft}
            disabled={busy}
            className="mt-3 rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white hover:bg-accent disabled:opacity-40"
          >
            {busy ? "Generando…" : "📝 Generar borrador ahora"}
          </button>
        </>
      ) : p.status === "draft" ? (
        <>
          <p className="mt-1 font-display text-lg font-semibold text-ink">
            {p.proposalNumber} · borrador listo
          </p>
          <p className="mt-1 text-xs text-ink/60">
            Envía el PDF al cliente por email en 1 clic. El carrito pasará a SENT.
          </p>
          <button
            type="button"
            onClick={send}
            disabled={busy}
            className="mt-3 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-dark disabled:opacity-40"
          >
            {busy ? "Enviando…" : "📤 Enviar propuesta al cliente"}
          </button>
        </>
      ) : (
        <p className="mt-1 text-sm text-ink/80">
          {p.proposalNumber} · <strong>{proposalStatusLabel(p.status)}</strong>
          {p.sentAt && p.status !== "accepted" && (
            <span className="text-ink/50"> · {new Date(p.sentAt).toLocaleDateString("es-ES")}</span>
          )}
        </p>
      )}
      {feedback && (
        <p className={`mt-2 text-xs ${feedback.ok ? "text-social" : "text-accent-deep"}`}>
          {feedback.ok ? "✓" : "⚠"} {feedback.msg}
        </p>
      )}
    </div>
  );
}

function PaymentLinkPanel({
  cartId,
  cart,
  onUpdate,
}: {
  cartId: string;
  cart: Cart;
  onUpdate: (next: Partial<Cart>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [acceptedTotal, setAcceptedTotal] = useState(
    cart.estimatedTotalCents != null ? Math.round(cart.estimatedTotalCents / 100) : 0,
  );
  const [depositPercent, setDepositPercent] = useState(50);
  const [validityDays, setValidityDays] = useState(14);
  const [sendEmail, setSendEmail] = useState(true);
  const [result, setResult] = useState<{ url?: string; depositCents?: number; expiresAt?: string } | null>(null);

  async function createLink() {
    if (acceptedTotal < 1) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/cart-quotes/${cartId}/payment-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acceptedTotalCents: Math.round(acceptedTotal * 100),
          depositPercent,
          validityDays,
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

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
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
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink/50">Validez (días)</span>
          <select
            value={validityDays}
            onChange={(e) => setValidityDays(parseInt(e.target.value))}
            className="mt-1 w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {[7, 14, 21, 30, 60].map((d) => (
              <option key={d} value={d}>{d} días</option>
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

      {/* Enlace persistente (visible al recargar) + estado de pago */}
      {cart.paymentLinkToken && !result?.url && (
        <div className="mt-3 rounded-lg bg-bone-soft p-3 text-xs">
          {(cart.payments?.length ?? 0) > 0 ? (
            <span className="font-semibold text-social">✅ Pagado</span>
          ) : (
            <>
              <a
                href={`/pay/${cart.paymentLinkToken}`}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline-offset-4 hover:underline"
              >
                Abrir enlace de pago activo ↗
              </a>
              {cart.paymentLinkSentAt && (
                <span className="ml-2 text-ink/50">
                  enviado {new Date(cart.paymentLinkSentAt).toLocaleDateString("es-ES")}
                </span>
              )}
              {cart.paymentLinkExpiresAt && (
                <span
                  className={`ml-2 ${new Date(cart.paymentLinkExpiresAt) < new Date() ? "font-semibold text-accent-deep" : "text-ink/50"}`}
                >
                  ·{" "}
                  {new Date(cart.paymentLinkExpiresAt) < new Date()
                    ? "⚠ caducado"
                    : `válido hasta ${new Date(cart.paymentLinkExpiresAt).toLocaleDateString("es-ES")}`}
                </span>
              )}
            </>
          )}
        </div>
      )}

      {result?.url && (
        <p className="mt-3 rounded-lg bg-bone-soft p-3 text-xs">
          Link: <a href={result.url} target="_blank" rel="noreferrer" className="text-accent underline-offset-4 hover:underline">{result.url}</a>
          <br />
          Importe a cobrar: <strong>{EUR.format((result.depositCents || 0) / 100)}</strong>
          {result.expiresAt && (
            <>
              <br />
              Válido hasta: <strong>{new Date(result.expiresAt).toLocaleDateString("es-ES")}</strong>
            </>
          )}
        </p>
      )}
    </div>
  );
}

function OrderActions({ cartId }: { cartId: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [proofUrl, setProofUrl] = useState("");

  async function placeOrder() {
    if (!confirm("¿Crear pedido en MidOcean? Si MIDOCEAN_LIVE_ORDERS=true se enviará de verdad.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/cart-quotes/${cartId}/place-order`, {
        method: "POST",
      });
      setResult(await res.json());
    } finally {
      setBusy(false);
    }
  }

  async function simulatePayment() {
    if (!confirm(
      "¿Simular pago confirmado para este cart?\n\n" +
      "Esto NO cobra dinero. NO toca Stripe. NO envía pedido a MidOcean.\n" +
      "Sí marca el cart como ORDERED, crea Payment fake, dispara split en POs y envía email [TEST] al cliente."
    )) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/cart-quotes/${cartId}/simulate-payment`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      setResult(data);
      if (res.ok && data.ok) {
        setTimeout(() => window.location.reload(), 1500);
      }
    } finally {
      setBusy(false);
    }
  }

  async function loadTracking() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/cart-quotes/${cartId}/tracking`);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artworkUrl: proofUrl }),
      });
      setResult(await res.json());
      setProofUrl("");
    } finally {
      setBusy(false);
    }
  }

  async function onProofFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/uploads/proof", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json();
      if (res.ok && data.url) {
        // Devolvemos URL relativa; el endpoint create-proof acepta cualquier URL válida
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        setProofUrl(`${origin}${data.url}`);
      } else {
        setResult({ error: data.error || "Error al subir" });
      }
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

      <div className="rounded-2xl border border-accent/30 bg-accent/5 p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-accent-deep">🧪 Simulación (gratis)</p>
        <p className="mt-1 text-xs text-ink/65">
          Dispara TODO el flow post-pago (split en POs · email cliente · alerta TG)
          SIN cobrar nada y SIN mandar pedido a MidOcean. Idempotente: si el cart ya
          tiene Payment PAID, no vuelve a simular.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={simulatePayment}
          className="mt-3 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-dark disabled:opacity-40"
        >
          🧪 Simular pago confirmado
        </button>
      </div>

      <div className="rounded-2xl border border-line bg-bone p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-ink/50">Crear proof para el cliente</p>
        <p className="mt-1 text-xs text-ink/60">
          Sube el mockup directamente o pega URL pública (Drive/Dropbox). Tras &quot;Enviar al cliente&quot;
          el cliente recibe email con link único para aprobar/rechazar.
        </p>
        <div className="mt-3 grid gap-2">
          <div className="flex gap-2">
            <input
              value={proofUrl}
              onChange={(e) => setProofUrl(e.target.value)}
              placeholder="https://…/mockup.png o URL devuelta tras subir abajo"
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
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-bone-soft px-3 py-3 text-center transition hover:border-accent">
            <svg className="h-4 w-4 text-ink/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="text-xs font-medium text-ink/70">
              {busy ? "Subiendo…" : "Subir mockup (PNG/JPG/SVG/PDF · máx 20MB)"}
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp,application/pdf"
              onChange={onProofFile}
              disabled={busy}
              className="hidden"
            />
          </label>
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
