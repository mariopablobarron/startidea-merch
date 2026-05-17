"use client";

import { useState } from "react";

type PurchaseOrderStatus = "PENDING" | "PLACED" | "IN_PRODUCTION" | "SHIPPED" | "DELIVERED" | "CANCELED" | "FAILED";

type Item = { id: string; quantity: number; productName: string; productRef: string };
type PO = {
  id: string;
  supplier: string;
  supplierOrderRef: string | null;
  status: PurchaseOrderStatus;
  totalClientCents: number;
  estimatedDeliveryDate: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  trackingCarrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  errorMessage: string | null;
  internalNotes: string | null;
  items: Item[];
};

const EUR = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

const STATUS_COLOR: Record<PurchaseOrderStatus, string> = {
  PENDING: "bg-bone-soft text-ink/60",
  PLACED: "bg-blue-100 text-blue-700",
  IN_PRODUCTION: "bg-purple-100 text-purple-700",
  SHIPPED: "bg-accent-mist text-accent-deep",
  DELIVERED: "bg-social/15 text-social",
  CANCELED: "bg-line/30 text-ink/40",
  FAILED: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  PENDING: "Pendiente",
  PLACED: "Enviado al proveedor",
  IN_PRODUCTION: "En producción",
  SHIPPED: "Enviado al cliente",
  DELIVERED: "Entregado",
  CANCELED: "Cancelado",
  FAILED: "Falló",
};

const NEXT_STATUS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  PENDING: ["PLACED", "CANCELED"],
  PLACED: ["IN_PRODUCTION", "SHIPPED", "FAILED", "CANCELED"],
  IN_PRODUCTION: ["SHIPPED", "FAILED", "CANCELED"],
  SHIPPED: ["DELIVERED", "FAILED"],
  DELIVERED: [],
  CANCELED: ["PENDING"],
  FAILED: ["PENDING", "PLACED", "CANCELED"],
};

/**
 * Bloque admin para gestionar los PurchaseOrders de un CartQuote.
 *
 * Si el cart se dividió en N POs (multi-proveedor), aquí los gestionas:
 * cambiar status, añadir tracking, supplierOrderRef, notas.
 *
 * Para POs MidOcean placed automáticamente, normalmente solo añades
 * tracking cuando el proveedor te lo manda por email.
 */
export function PurchaseOrdersBlock({ purchaseOrders }: { purchaseOrders: PO[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [pos, setPos] = useState<PO[]>(purchaseOrders);

  async function patchPO(id: string, patch: Partial<PO> & { status?: PurchaseOrderStatus }) {
    setBusy(id);
    try {
      const r = await fetch(`/api/admin/purchase-orders/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await r.json();
      if (r.ok && data.purchaseOrder) {
        setPos((cur) => cur.map((p) => (p.id === id ? { ...p, ...data.purchaseOrder } : p)));
      }
    } finally {
      setBusy(null);
    }
  }

  if (pos.length === 0) return null;

  return (
    <section className="mt-6 rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-lg font-semibold text-ink">
          PurchaseOrders ({pos.length})
        </p>
        <p className="text-[11px] text-ink/55">
          Cada PO se procesa con su proveedor de forma independiente. MidOcean → auto via API. Otros → admin manual.
        </p>
      </div>

      <ul className="mt-4 space-y-3">
        {pos.map((po, idx) => {
          const nextOptions = NEXT_STATUS[po.status];
          const isEditing = editing === po.id;
          return (
            <li key={po.id} className="rounded-xl border border-line bg-bone-soft p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-ink px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-bone">
                      PO #{idx + 1}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_COLOR[po.status]}`}>
                      {STATUS_LABEL[po.status]}
                    </span>
                    <span className="rounded-full bg-bone px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink/55">
                      {po.supplier}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {po.items.length} producto{po.items.length !== 1 ? "s" : ""} ·{" "}
                    {po.items.reduce((s, i) => s + i.quantity, 0)} uds · {EUR.format(po.totalClientCents / 100)}
                  </p>
                  <ul className="mt-1 text-[12px] text-ink/65 space-y-0.5">
                    {po.items.slice(0, 4).map((it) => (
                      <li key={it.id}>· {it.quantity} × {it.productName} <span className="text-ink/40">({it.productRef})</span></li>
                    ))}
                    {po.items.length > 4 && <li className="text-ink/45">… y {po.items.length - 4} más</li>}
                  </ul>
                  <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-ink/60">
                    {po.supplierOrderRef && (
                      <span>
                        Ref proveedor: <code className="rounded bg-bone px-1.5 py-0.5">{po.supplierOrderRef}</code>
                      </span>
                    )}
                    {po.estimatedDeliveryDate && (
                      <span>Llegada estimada: {new Date(po.estimatedDeliveryDate).toLocaleDateString("es-ES")}</span>
                    )}
                    {po.trackingNumber && (
                      <a href={po.trackingUrl || "#"} target="_blank" rel="noopener" className="text-accent hover:underline">
                        📦 {po.trackingCarrier} {po.trackingNumber}
                      </a>
                    )}
                  </div>
                  {po.errorMessage && (
                    <p className="mt-2 rounded-lg bg-red-50 px-2 py-1 text-[11px] text-red-700">
                      ⚠ {po.errorMessage}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  {nextOptions.length > 0 && (
                    <div className="flex flex-wrap justify-end gap-1">
                      {nextOptions.slice(0, 3).map((s) => (
                        <button
                          key={s}
                          onClick={() => patchPO(po.id, { status: s })}
                          disabled={busy === po.id}
                          className="rounded-full bg-ink px-3 py-1 text-[11px] text-bone hover:bg-accent disabled:opacity-50"
                        >
                          → {STATUS_LABEL[s]}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setEditing(isEditing ? null : po.id)}
                    className="text-[11px] text-ink/55 hover:text-ink"
                  >
                    {isEditing ? "Ocultar" : "Editar tracking / ref / notas"}
                  </button>
                </div>
              </div>

              {isEditing && (
                <EditInline po={po} onSave={(patch) => { patchPO(po.id, patch); setEditing(null); }} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function EditInline({
  po,
  onSave,
}: {
  po: PO;
  onSave: (patch: Partial<PO>) => void;
}) {
  const [supplierOrderRef, setSupplierOrderRef] = useState(po.supplierOrderRef || "");
  const [trackingCarrier, setTrackingCarrier] = useState(po.trackingCarrier || "");
  const [trackingNumber, setTrackingNumber] = useState(po.trackingNumber || "");
  const [trackingUrl, setTrackingUrl] = useState(po.trackingUrl || "");
  const [internalNotes, setInternalNotes] = useState(po.internalNotes || "");

  return (
    <div className="mt-4 grid gap-2 rounded-lg bg-bone p-3">
      <div className="grid gap-2 md:grid-cols-2">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-ink/55">Ref proveedor</span>
          <input
            type="text"
            value={supplierOrderRef}
            onChange={(e) => setSupplierOrderRef(e.target.value)}
            className="mt-0.5 w-full rounded border border-line bg-white px-2 py-1 text-xs"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-ink/55">Transportista</span>
          <input
            type="text"
            placeholder="ej. SEUR, MRW, Correos Express"
            value={trackingCarrier}
            onChange={(e) => setTrackingCarrier(e.target.value)}
            className="mt-0.5 w-full rounded border border-line bg-white px-2 py-1 text-xs"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-ink/55">Nº tracking</span>
          <input
            type="text"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            className="mt-0.5 w-full rounded border border-line bg-white px-2 py-1 text-xs"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-ink/55">URL tracking</span>
          <input
            type="text"
            value={trackingUrl}
            onChange={(e) => setTrackingUrl(e.target.value)}
            className="mt-0.5 w-full rounded border border-line bg-white px-2 py-1 text-xs"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-ink/55">Notas internas</span>
        <textarea
          rows={2}
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          className="mt-0.5 w-full rounded border border-line bg-white px-2 py-1 text-xs"
        />
      </label>
      <button
        onClick={() => onSave({
          supplierOrderRef: supplierOrderRef || null,
          trackingCarrier: trackingCarrier || null,
          trackingNumber: trackingNumber || null,
          trackingUrl: trackingUrl || null,
          internalNotes: internalNotes || null,
        })}
        className="self-end rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white"
      >
        Guardar
      </button>
    </div>
  );
}
