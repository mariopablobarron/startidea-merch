"use client";

import { useCallback, useEffect, useState } from "react";

type SupplierItem = {
  code: "midocean" | "makito" | "cifra" | "adivin";
  name: string;
  active: boolean;
  hasAutoSync: boolean;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  paymentTerms: string | null;
  minOrderNotes: string | null;
  leadTimeDays: number | null;
  defaultShippingCents: number | null;
  notes: string | null;
  hasProfile: boolean;
  productsActive: number;
  productsInactive: number;
  lastSyncAt: string | null;
  lastSyncOk: boolean | null;
};

const OPERATIONAL_LINKS: Record<SupplierItem["code"], { href: string; label: string }[]> = {
  midocean: [{ href: "/admin/suppliers/midocean", label: "Sync e integración →" }],
  makito: [{ href: "/admin/suppliers/makito", label: "Sync e integración →" }],
  cifra: [
    { href: "/admin/suppliers/cifra", label: "Sync e integración →" },
    { href: "/admin/suppliers/cifra/marking-rates", label: "Tarifa de marcaje →" },
    { href: "/admin/suppliers/cifra/quote", label: "Cotizador rápido →" },
  ],
  adivin: [],
};

const EUR = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(
    new Date(d),
  );
}

export function SuppliersClient() {
  const [items, setItems] = useState<SupplierItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/suppliers", { credentials: "include" });
      const d = await r.json();
      setItems(d.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openEdit(s: SupplierItem) {
    if (editingCode === s.code) {
      setEditingCode(null);
      return;
    }
    setDraft({
      name: s.name,
      contactName: s.contactName ?? "",
      contactEmail: s.contactEmail ?? "",
      contactPhone: s.contactPhone ?? "",
      paymentTerms: s.paymentTerms ?? "",
      minOrderNotes: s.minOrderNotes ?? "",
      leadTimeDays: s.leadTimeDays != null ? String(s.leadTimeDays) : "",
      defaultShippingCents: s.defaultShippingCents != null ? (s.defaultShippingCents / 100).toString().replace(".", ",") : "",
      notes: s.notes ?? "",
    });
    setEditingCode(s.code);
  }

  async function save(code: string) {
    setSaving(true);
    try {
      const leadTimeDays = draft.leadTimeDays.trim() ? parseInt(draft.leadTimeDays, 10) : null;
      const defaultShippingCents = draft.defaultShippingCents.trim()
        ? Math.round(parseFloat(draft.defaultShippingCents.replace(",", ".")) * 100)
        : null;
      await fetch("/api/admin/suppliers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          code,
          name: draft.name.trim() || undefined,
          contactName: draft.contactName.trim() || null,
          contactEmail: draft.contactEmail.trim() || null,
          contactPhone: draft.contactPhone.trim() || null,
          paymentTerms: draft.paymentTerms.trim() || null,
          minOrderNotes: draft.minOrderNotes.trim() || null,
          leadTimeDays,
          defaultShippingCents,
          notes: draft.notes.trim() || null,
        }),
      });
      setEditingCode(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-ink/55">Cargando…</p>;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map((s) => (
        <div key={s.code} className="rounded-2xl border border-line bg-bone p-5">
          <div className="mb-2 flex items-start justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">{s.name}</h2>
              <p className="text-[11px] text-ink/50">
                {s.hasAutoSync ? "Sync automático" : "Carga manual (sin API)"}
              </p>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                s.productsActive > 0 ? "bg-social/15 text-social" : "bg-accent-wash text-accent-deep"
              }`}
            >
              {s.productsActive} activos
            </span>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className="text-ink/50">Última sync</dt>
            <dd className="text-right font-mono">
              {s.hasAutoSync ? fmtDate(s.lastSyncAt) : "—"}
            </dd>
            <dt className="text-ink/50">Contacto</dt>
            <dd className="text-right">{s.contactName || s.contactEmail || "— sin rellenar"}</dd>
            <dt className="text-ink/50">Plazo entrega</dt>
            <dd className="text-right">{s.leadTimeDays != null ? `${s.leadTimeDays} días` : "—"}</dd>
            <dt className="text-ink/50">Portes por defecto</dt>
            <dd className="text-right">
              {s.defaultShippingCents != null ? EUR.format(s.defaultShippingCents / 100) : "—"}
            </dd>
          </dl>

          {OPERATIONAL_LINKS[s.code].length > 0 && (
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {OPERATIONAL_LINKS[s.code].map((l) => (
                <a key={l.href} href={l.href} className="text-accent hover:underline">
                  {l.label}
                </a>
              ))}
            </div>
          )}

          <button
            onClick={() => openEdit(s)}
            className="mt-4 w-full rounded-full border border-line px-4 py-1.5 text-xs font-medium hover:border-accent"
          >
            {editingCode === s.code ? "Cerrar" : s.hasProfile ? "Editar ficha" : "Rellenar ficha →"}
          </button>

          {editingCode === s.code && (
            <div className="mt-4 space-y-2 border-t border-line pt-4">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Nombre" value={draft.name} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} />
                <Field
                  label="Persona de contacto"
                  value={draft.contactName}
                  onChange={(v) => setDraft((d) => ({ ...d, contactName: v }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="Email"
                  value={draft.contactEmail}
                  onChange={(v) => setDraft((d) => ({ ...d, contactEmail: v }))}
                />
                <Field
                  label="Teléfono"
                  value={draft.contactPhone}
                  onChange={(v) => setDraft((d) => ({ ...d, contactPhone: v }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="Plazo entrega (días)"
                  value={draft.leadTimeDays}
                  onChange={(v) => setDraft((d) => ({ ...d, leadTimeDays: v }))}
                  numeric
                />
                <Field
                  label="Portes por defecto (€)"
                  value={draft.defaultShippingCents}
                  onChange={(v) => setDraft((d) => ({ ...d, defaultShippingCents: v }))}
                  numeric
                />
              </div>
              <Field
                label="Condiciones de pago"
                value={draft.paymentTerms}
                onChange={(v) => setDraft((d) => ({ ...d, paymentTerms: v }))}
              />
              <Field
                label="Mínimo de pedido"
                value={draft.minOrderNotes}
                onChange={(v) => setDraft((d) => ({ ...d, minOrderNotes: v }))}
              />
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-ink/55">
                  Notas
                </label>
                <textarea
                  value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                  rows={2}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-xs outline-none focus:border-accent"
                />
              </div>
              <button
                onClick={() => save(s.code)}
                disabled={saving}
                className="w-full rounded-full bg-accent px-4 py-2 text-xs font-semibold text-bone hover:bg-accent-dark disabled:opacity-40"
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  numeric,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-ink/55">{label}</label>
      <input
        type={numeric ? "text" : "text"}
        inputMode={numeric ? "decimal" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-xs outline-none focus:border-accent"
      />
    </div>
  );
}
