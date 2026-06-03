"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

type Coupon = {
  id: string;
  code: string;
  label: string;
  kind: "PERCENT" | "FIXED";
  percentValue: number | null;
  fixedCents: number | null;
  minTotalCents: number | null;
  maxUses: number | null;
  usedCount: number;
  validUntil: string | null;
  active: boolean;
  createdAt: string;
  affiliateId: string | null;
  affiliate: { id: string; name: string; slug: string } | null;
  commissionPctOverride: number | null;
  creditPctOverride: number | null;
};

type AffiliateOption = {
  id: string;
  name: string;
  slug: string;
  commissionPct: number;
  creditPct: number;
};

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [affiliates, setAffiliates] = useState<AffiliateOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Form
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"PERCENT" | "FIXED">("PERCENT");
  const [percent, setPercent] = useState(10);
  const [fixed, setFixed] = useState(50);
  const [minTotal, setMinTotal] = useState(0);
  const [maxUses, setMaxUses] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [affiliateId, setAffiliateId] = useState("");
  const [overrideComm, setOverrideComm] = useState("");
  const [overrideCred, setOverrideCred] = useState("");
  const [creating, setCreating] = useState(false);

  // Auth: cookie merch_admin via /api/admin/auth. El backend ya acepta
  // ambos (cookie y header legacy) — el header X-Admin-Secret es opcional.
  async function load() {
    const res = await fetch("/api/admin/coupons");
    const data = await res.json();
    if (!res.ok) setError(data.error || "Error");
    else {
      setCoupons(data.coupons || []);
      setAffiliates(data.affiliates || []);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const payload: Record<string, unknown> = {
        code,
        label,
        kind,
        ...(kind === "PERCENT" ? { percentValue: percent } : { fixedCents: fixed * 100 }),
        ...(minTotal > 0 ? { minTotalCents: minTotal * 100 } : {}),
        ...(maxUses ? { maxUses: parseInt(maxUses, 10) } : {}),
        ...(validUntil ? { validUntil: new Date(validUntil).toISOString() } : {}),
        ...(affiliateId ? { affiliateId } : {}),
        ...(affiliateId && overrideComm
          ? { commissionPctOverride: parseInt(overrideComm, 10) }
          : {}),
        ...(affiliateId && overrideCred
          ? { creditPctOverride: parseInt(overrideCred, 10) }
          : {}),
      };
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Error");
      else {
        setCode("");
        setLabel("");
        setMaxUses("");
        setValidUntil("");
        setAffiliateId("");
        setOverrideComm("");
        setOverrideCred("");
        await load();
      }
    } finally {
      setCreating(false);
    }
  }

  async function toggle(id: string, active: boolean) {
    await fetch("/api/admin/coupons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active: !active }),
    });
    await load();
  }

  return (
    <main className="min-h-screen bg-bone-soft p-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin" className="text-xs text-ink/60 hover:text-accent">← Panel</Link>
        <header className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-ink">Cupones de descuento</h1>
            <p className="mt-1 text-sm text-ink/60">{coupons.length} en total · {coupons.filter((c) => c.active).length} activos</p>
          </div>
        </header>

        {error && <p className="mt-4 rounded-lg bg-accent-wash p-3 text-sm text-accent-deep">⚠ {error}</p>}

        {/* Crear */}
        <form onSubmit={create} className="mt-8 rounded-3xl border border-line bg-bone p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-ink/50">Crear cupón</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="CÓDIGO"
              required
              maxLength={40}
              className="rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm uppercase outline-none focus:border-accent"
            />
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Descripción interna"
              required
              maxLength={120}
              className="rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent sm:col-span-2"
            />
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as "PERCENT" | "FIXED")}
              className="rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
            >
              <option value="PERCENT">% descuento</option>
              <option value="FIXED">€ fijo</option>
            </select>
            {kind === "PERCENT" ? (
              <input
                type="number"
                value={percent}
                onChange={(e) => setPercent(parseInt(e.target.value) || 1)}
                min={1}
                max={100}
                placeholder="% (1-100)"
                className="rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
            ) : (
              <input
                type="number"
                value={fixed}
                onChange={(e) => setFixed(parseInt(e.target.value) || 1)}
                min={1}
                placeholder="€ descuento"
                className="rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
            )}
            <input
              type="number"
              value={minTotal}
              onChange={(e) => setMinTotal(parseInt(e.target.value) || 0)}
              min={0}
              placeholder="Mínimo pedido (€)"
              className="rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            <input
              type="number"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              min={1}
              placeholder="Usos máx (vacío = ∞)"
              className="rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              placeholder="Válido hasta"
              className="rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
          </div>

          {/* Bloque vincular afiliado — opcional */}
          <div className="mt-6 rounded-2xl border border-line bg-bone-soft p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink/60">
              Vincular a afiliado (opcional)
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <select
                value={affiliateId}
                onChange={(e) => setAffiliateId(e.target.value)}
                className="rounded-xl border border-line bg-bone px-3 py-2.5 text-sm outline-none focus:border-accent"
              >
                <option value="">— Sin afiliado —</option>
                {affiliates.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.commissionPct}% com · {a.creditPct}% crédito)
                  </option>
                ))}
              </select>
              {affiliateId && (
                <>
                  <input
                    type="number"
                    value={overrideComm}
                    onChange={(e) => setOverrideComm(e.target.value)}
                    min={0}
                    max={50}
                    placeholder="Override % comisión (opcional)"
                    className="rounded-xl border border-line bg-bone px-3 py-2.5 text-sm outline-none focus:border-accent"
                  />
                  <input
                    type="number"
                    value={overrideCred}
                    onChange={(e) => setOverrideCred(e.target.value)}
                    min={0}
                    max={50}
                    placeholder="Override % crédito (opcional)"
                    className="rounded-xl border border-line bg-bone px-3 py-2.5 text-sm outline-none focus:border-accent"
                  />
                </>
              )}
            </div>
            {affiliateId && (
              <p className="mt-2 text-[11px] text-ink/55">
                Al canjearse este cupón se generarán <strong>2 entries</strong> en el ledger del afiliado:
                COMMISSION (que pagarás aparte) + CREDIT (que se acumula para sus pedidos). Si dejas los
                overrides vacíos, se usan los % por defecto del afiliado.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={creating}
            className="mt-4 rounded-full bg-ink px-5 py-2.5 text-xs font-medium text-bone hover:bg-accent disabled:opacity-40"
          >
            {creating ? "Creando…" : "Crear cupón"}
          </button>
        </form>

        {/* Lista */}
        <section className="mt-8 overflow-hidden rounded-3xl border border-line bg-bone">
          <table className="w-full text-sm">
            <thead className="bg-bone-soft">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-ink/50">Código</th>
                <th className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-ink/50">Descuento</th>
                <th className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-ink/50">Afiliado</th>
                <th className="px-4 py-3 text-center text-[10px] font-medium uppercase tracking-wider text-ink/50">Usos</th>
                <th className="px-4 py-3 text-center text-[10px] font-medium uppercase tracking-wider text-ink/50">Mínimo</th>
                <th className="px-4 py-3 text-center text-[10px] font-medium uppercase tracking-wider text-ink/50">Hasta</th>
                <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wider text-ink/50">Estado</th>
              </tr>
            </thead>
            <tbody>
              {coupons.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-ink/60">No hay cupones aún.</td>
                </tr>
              )}
              {coupons.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs font-semibold text-ink">{c.code}</p>
                    <p className="text-[11px] text-ink/60">{c.label}</p>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {c.kind === "PERCENT" ? `${c.percentValue}%` : EUR.format((c.fixedCents || 0) / 100)}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {c.affiliate ? (
                      <Link
                        href={`/admin/affiliates/${c.affiliate.id}`}
                        className="text-accent hover:underline"
                      >
                        {c.affiliate.name}
                        {(c.commissionPctOverride !== null || c.creditPctOverride !== null) && (
                          <span className="ml-1 text-[10px] text-ink/45">
                            ({c.commissionPctOverride ?? "·"}/{c.creditPctOverride ?? "·"})
                          </span>
                        )}
                      </Link>
                    ) : (
                      <span className="text-ink/30">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums">
                    {c.usedCount}{c.maxUses ? ` / ${c.maxUses}` : ""}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums">
                    {c.minTotalCents ? EUR.format(c.minTotalCents / 100) : "—"}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-ink/60">
                    {c.validUntil ? new Date(c.validUntil).toLocaleDateString("es-ES") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => toggle(c.id, c.active)}
                      className={`rounded-full px-3 py-1 text-[11px] font-medium ${
                        c.active ? "bg-social/15 text-social hover:bg-social/25" : "bg-bone-soft text-ink/50 hover:bg-line"
                      }`}
                    >
                      {c.active ? "Activo" : "Inactivo"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
