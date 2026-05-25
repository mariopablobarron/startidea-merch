"use client";

/**
 * /admin/affiliates — Listado de afiliados con saldos.
 *
 * Cada partner muestra: nombre, empresa, % comisión, % crédito, cupones,
 * saldo comisión pendiente (que hay que pagar), crédito disponible
 * (que el afiliado podrá descontar en su próximo pedido).
 *
 * Acciones: crear partner, abrir detalle (ver ledger + registrar pago).
 *
 * NO toca aún el checkout — la creación de entries COMMISSION/CREDIT
 * vendrá del helper `recordCouponRedemption()` cuando se enganche al
 * webhook de pago Stripe (F2).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

type Balance = {
  commissionEarned: number;
  commissionPaid: number;
  commissionPending: number;
  creditEarned: number;
  creditUsed: number;
  creditAvailable: number;
};

type Partner = {
  id: string;
  slug: string;
  name: string;
  email: string;
  company: string | null;
  commissionPct: number;
  creditPct: number;
  active: boolean;
  notes: string | null;
  createdAt: string;
  _count: { coupons: number; referrals: number };
  balance: Balance;
};

export default function AffiliatesPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/affiliates", { credentials: "include" });
      const d = await r.json();
      setPartners(d.partners || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Totales agregados arriba
  const totals = partners.reduce(
    (acc, p) => ({
      pendingCommission: acc.pendingCommission + p.balance.commissionPending,
      availableCredit: acc.availableCredit + p.balance.creditAvailable,
      activePartners: acc.activePartners + (p.active ? 1 : 0),
    }),
    { pendingCommission: 0, availableCredit: 0, activePartners: 0 },
  );

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Marketing · Afiliados
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink">Programa de afiliados</h1>
            <p className="mt-2 max-w-2xl text-sm text-ink/60">
              Cada cupón vinculado a un afiliado genera <strong>comisión</strong> (pagas tú) +{" "}
              <strong>crédito</strong> (descuento para sus propios pedidos) al canjearse. Sistema dual.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark"
          >
            + Nuevo afiliado
          </button>
        </header>

        {/* Totales agregados */}
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Stat
            label="Comisión pendiente de pago"
            value={EUR.format(totals.pendingCommission / 100)}
            accent
          />
          <Stat
            label="Crédito disponible (descontable)"
            value={EUR.format(totals.availableCredit / 100)}
          />
          <Stat label="Afiliados activos" value={String(totals.activePartners)} />
        </div>

        {loading ? (
          <p className="text-sm text-ink/60">Cargando…</p>
        ) : partners.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-bone p-10 text-center">
            <p className="font-display text-lg text-ink">Aún no hay afiliados</p>
            <p className="mt-2 text-sm text-ink/60">
              Crea uno para empezar a generar cupones con comisión + crédito.
            </p>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-4 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-bone hover:bg-accent-dark"
            >
              Crear primer afiliado
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line bg-bone">
            <table className="w-full text-sm">
              <thead className="bg-bone-soft text-left text-xs uppercase tracking-wider text-ink/60">
                <tr>
                  <th className="p-3">Afiliado</th>
                  <th className="p-3 text-center">% Com.</th>
                  <th className="p-3 text-center">% Crédito</th>
                  <th className="p-3 text-center">Cupones</th>
                  <th className="p-3 text-right">Comisión pendiente</th>
                  <th className="p-3 text-right">Crédito disponible</th>
                  <th className="p-3 text-center">Activo</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {partners.map((p) => (
                  <tr key={p.id} className="border-t border-line align-middle hover:bg-bone-soft">
                    <td className="p-3">
                      <div className="font-medium text-ink">{p.name}</div>
                      <div className="text-[11px] text-ink/55">
                        {p.email}
                        {p.company && ` · ${p.company}`}
                      </div>
                    </td>
                    <td className="p-3 text-center font-mono text-xs">{p.commissionPct}%</td>
                    <td className="p-3 text-center font-mono text-xs">{p.creditPct}%</td>
                    <td className="p-3 text-center text-xs tabular-nums">{p._count.coupons}</td>
                    <td className="p-3 text-right font-medium tabular-nums">
                      <span className={p.balance.commissionPending > 0 ? "text-accent" : "text-ink/40"}>
                        {EUR.format(p.balance.commissionPending / 100)}
                      </span>
                    </td>
                    <td className="p-3 text-right font-medium tabular-nums">
                      <span className={p.balance.creditAvailable > 0 ? "text-social" : "text-ink/40"}>
                        {EUR.format(p.balance.creditAvailable / 100)}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {p.active ? (
                        <span className="rounded-full bg-social/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-social">
                          Sí
                        </span>
                      ) : (
                        <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink/50">
                          No
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <Link
                        href={`/admin/affiliates/${p.id}`}
                        className="text-xs font-medium text-accent hover:underline"
                      >
                        Detalle →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && <CreateModal onClose={() => setCreating(false)} onCreated={load} />}
    </main>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-bone p-4">
      <p className="text-[11px] uppercase tracking-wider text-ink/55">{label}</p>
      <p
        className={`mt-1 font-display text-2xl font-semibold tabular-nums ${
          accent ? "text-accent" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [commissionPct, setCommissionPct] = useState(10);
  const [creditPct, setCreditPct] = useState(5);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/affiliates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          email,
          company: company.trim() || null,
          commissionPct,
          creditPct,
          notes: notes.trim() || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || `Error ${r.status}`);
        return;
      }
      onCreated();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-8 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-line bg-bone shadow-2xl">
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-semibold text-ink">Nuevo afiliado</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-ink/50 hover:bg-bone-soft hover:text-ink"
          >
            ✕
          </button>
        </header>

        <div className="space-y-4 px-6 py-5">
          <Field label="Nombre*">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </Field>
          <Field label="Email*">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={180}
              className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </Field>
          <Field label="Empresa">
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              maxLength={180}
              className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="% Comisión (lo que cobra el afiliado)"
              help="Se paga aparte vía transferencia/factura"
            >
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={commissionPct}
                  onChange={(e) => setCommissionPct(Number(e.target.value))}
                  min={0}
                  max={50}
                  className="w-20 rounded-xl border border-line bg-bone-soft px-3 py-2 text-right text-sm outline-none focus:border-accent"
                />
                <span className="text-sm text-ink/60">%</span>
              </div>
            </Field>
            <Field
              label="% Crédito (descuento sus pedidos)"
              help="Se acumula en su wallet, descontable de futuras compras"
            >
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={creditPct}
                  onChange={(e) => setCreditPct(Number(e.target.value))}
                  min={0}
                  max={50}
                  className="w-20 rounded-xl border border-line bg-bone-soft px-3 py-2 text-right text-sm outline-none focus:border-accent"
                />
                <span className="text-sm text-ink/60">%</span>
              </div>
            </Field>
          </div>
          <Field label="Notas internas">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </Field>
          {error && (
            <p className="rounded-xl bg-accent-wash p-3 text-sm text-accent-deep">⚠ {error}</p>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line bg-bone-soft px-6 py-4">
          <button type="button" onClick={onClose} className="text-xs text-ink/60 hover:text-ink">
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || !name.trim() || !email.trim()}
            className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
          >
            {busy ? "Creando…" : "Crear afiliado"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-ink/60">
        {label}
      </label>
      {children}
      {help && <p className="mt-1 text-[11px] text-ink/50">{help}</p>}
    </div>
  );
}
