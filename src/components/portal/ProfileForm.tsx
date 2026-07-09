"use client";

import { useState } from "react";

type Profile = {
  email: string;
  name: string;
  company: string | null;
  phone: string | null;
  taxId: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
};

/**
 * "Mis datos" del portal cliente: contacto + fiscal + direcciones. Se guardan
 * en CustomerUser y sirven para facturar/enviar sin repreguntar en cada pedido.
 */
export function ProfileForm({ initial }: { initial: Profile }) {
  const [form, setForm] = useState({
    name: initial.name ?? "",
    company: initial.company ?? "",
    phone: initial.phone ?? "",
    taxId: initial.taxId ?? "",
    billingAddress: initial.billingAddress ?? "",
    shippingAddress: initial.shippingAddress ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/clientes/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error || "No se pudo guardar");
        return;
      }
      setSaved(true);
    } catch {
      setError("Error de conexión");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent";

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="pf-name" className="text-xs font-medium text-ink/60">Nombre *</label>
        <input id="pf-name" required minLength={2} value={form.name} onChange={(e) => set("name", e.target.value)} className={`mt-1 ${inputCls}`} />
      </div>
      <div>
        <label htmlFor="pf-company" className="text-xs font-medium text-ink/60">Empresa</label>
        <input id="pf-company" value={form.company} onChange={(e) => set("company", e.target.value)} className={`mt-1 ${inputCls}`} />
      </div>
      <div>
        <label htmlFor="pf-phone" className="text-xs font-medium text-ink/60">Teléfono</label>
        <input id="pf-phone" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={`mt-1 ${inputCls}`} />
      </div>
      <div>
        <label htmlFor="pf-taxid" className="text-xs font-medium text-ink/60">CIF / NIF (para factura)</label>
        <input id="pf-taxid" value={form.taxId} onChange={(e) => set("taxId", e.target.value)} className={`mt-1 ${inputCls}`} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="pf-billing" className="text-xs font-medium text-ink/60">Dirección de facturación</label>
        <textarea id="pf-billing" rows={2} value={form.billingAddress} onChange={(e) => set("billingAddress", e.target.value)} className={`mt-1 ${inputCls}`} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="pf-shipping" className="text-xs font-medium text-ink/60">Dirección de envío habitual</label>
        <textarea id="pf-shipping" rows={2} value={form.shippingAddress} onChange={(e) => set("shippingAddress", e.target.value)} className={`mt-1 ${inputCls}`} />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bone hover:bg-accent disabled:opacity-50"
        >
          {busy ? "Guardando…" : "Guardar datos"}
        </button>
        {saved && <span className="text-sm text-social">✓ Guardado</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
        <span className="text-xs text-ink/40">
          Email: {initial.email} (para cambiarlo, contacta soporte)
        </span>
      </div>
    </form>
  );
}
