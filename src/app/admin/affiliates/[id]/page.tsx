"use client";

import { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

const KIND_LABEL: Record<string, string> = {
  COMMISSION: "Comisión devengada",
  CREDIT: "Crédito acumulado",
  PAYOUT: "Pago a afiliado",
  CREDIT_USED: "Crédito usado",
  ADJUSTMENT: "Ajuste manual",
};

const KIND_COLOR: Record<string, string> = {
  COMMISSION: "text-accent",
  CREDIT: "text-social",
  PAYOUT: "text-ink/70",
  CREDIT_USED: "text-ink/70",
  ADJUSTMENT: "text-amber-700",
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
  coupons: Array<{ id: string; code: string; label: string; active: boolean; usedCount: number }>;
  _count: { referrals: number };
};

type Balance = {
  commissionEarned: number;
  commissionPaid: number;
  commissionPending: number;
  creditEarned: number;
  creditUsed: number;
  creditAvailable: number;
};

type LedgerEntry = {
  id: string;
  kind: keyof typeof KIND_LABEL;
  amountCents: number;
  cartId: string | null;
  couponId: string | null;
  createdBy: string | null;
  note: string | null;
  createdAt: string;
};

export default function AffiliateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [payoutOpen, setPayoutOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/affiliates/${id}`, { credentials: "include" });
      const d = await r.json();
      setPartner(d.partner);
      setBalance(d.balance);
      setLedger(d.ledger || []);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !partner || !balance) {
    return <main className="min-h-screen bg-bone-soft p-8"><p className="text-sm text-ink/55">Cargando…</p></main>;
  }

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin/affiliates" className="text-xs text-ink/55 hover:text-accent">
          ← Lista de afiliados
        </Link>
        <header className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Afiliado
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink">{partner.name}</h1>
            <p className="mt-1 text-sm text-ink/60">
              {partner.email}
              {partner.company && ` · ${partner.company}`} ·{" "}
              <code className="font-mono text-xs">/{partner.slug}</code>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPayoutOpen(true)}
            disabled={balance.commissionPending <= 0}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
          >
            💰 Registrar pago de comisión
          </button>
        </header>

        {/* 4 stats clave */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Comisión devengada (total)" value={balance.commissionEarned} />
          <Stat label="Comisión pendiente de pago" value={balance.commissionPending} accent />
          <Stat label="Crédito acumulado (total)" value={balance.creditEarned} />
          <Stat label="Crédito disponible" value={balance.creditAvailable} ok />
        </div>

        {/* Config + cupones */}
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr,2fr]">
          <div className="rounded-2xl border border-line bg-bone p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/55">
              Configuración
            </p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink/60">Estado</dt>
                <dd>
                  {partner.active ? (
                    <span className="rounded-full bg-social/15 px-2 py-0.5 text-[10px] text-social">Activo</span>
                  ) : (
                    <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[10px] text-ink/55">Pausado</span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/60">% Comisión por defecto</dt>
                <dd className="font-mono">{partner.commissionPct}%</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/60">% Crédito por defecto</dt>
                <dd className="font-mono">{partner.creditPct}%</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/60">Cupones vinculados</dt>
                <dd className="font-mono">{partner.coupons.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/60">Referrals históricos</dt>
                <dd className="font-mono">{partner._count.referrals}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/60">Alta</dt>
                <dd className="text-xs text-ink/55">{new Date(partner.createdAt).toLocaleDateString("es-ES")}</dd>
              </div>
            </dl>
            {partner.notes && (
              <div className="mt-4 rounded-xl bg-bone-soft p-3 text-xs text-ink/70">
                <p className="mb-1 font-semibold uppercase tracking-wider text-ink/50">Notas</p>
                <p>{partner.notes}</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-bone p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/55">
              Cupones vinculados ({partner.coupons.length})
            </p>
            {partner.coupons.length === 0 ? (
              <p className="mt-3 text-xs text-ink/55">
                Aún no hay cupones para este afiliado. Crea uno en{" "}
                <Link href="/admin/coupons" className="text-accent underline">
                  /admin/coupons
                </Link>{" "}
                y vincúlalo a este afiliado.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {partner.coupons.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <code className="font-mono text-xs text-accent-deep">{c.code}</code>{" "}
                      <span className="text-ink/70">— {c.label}</span>
                    </div>
                    <div className="text-xs text-ink/55">
                      {c.usedCount} usos
                      {!c.active && <span className="ml-2 rounded-full bg-ink/10 px-1.5 py-0.5 text-[9px] text-ink/55">Pausado</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Ledger */}
        <section className="mt-6">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink/55">
            Histórico (últimos 100 movimientos)
          </p>
          {ledger.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line bg-bone p-6 text-center text-sm text-ink/55">
              Sin movimientos aún. Cuando se canjeen sus cupones aparecerán aquí.
            </p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-line bg-bone">
              <table className="w-full text-sm">
                <thead className="bg-bone-soft text-left text-xs uppercase tracking-wider text-ink/55">
                  <tr>
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">Nota</th>
                    <th className="p-3 text-right">Importe</th>
                    <th className="p-3 text-right">Por</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((e) => (
                    <tr key={e.id} className="border-t border-line">
                      <td className="p-3 text-xs text-ink/65">
                        {new Date(e.createdAt).toLocaleString("es-ES")}
                      </td>
                      <td className="p-3">
                        <span className={`font-medium text-xs ${KIND_COLOR[e.kind]}`}>
                          {KIND_LABEL[e.kind]}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-ink/70">{e.note || "—"}</td>
                      <td className="p-3 text-right font-mono tabular-nums">
                        <span className={e.amountCents < 0 ? "text-ink/70" : "text-accent"}>
                          {e.amountCents >= 0 ? "+" : ""}
                          {EUR.format(e.amountCents / 100)}
                        </span>
                      </td>
                      <td className="p-3 text-right text-[11px] text-ink/45">
                        {e.createdBy || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {payoutOpen && (
        <PayoutModal
          partnerId={id}
          maxPayoutCents={balance.commissionPending}
          onClose={() => setPayoutOpen(false)}
          onDone={() => {
            setPayoutOpen(false);
            load();
          }}
        />
      )}
    </main>
  );
}

function Stat({ label, value, accent, ok }: { label: string; value: number; accent?: boolean; ok?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-bone p-4">
      <p className="text-[11px] uppercase tracking-wider text-ink/55">{label}</p>
      <p
        className={`mt-1 font-display text-2xl font-semibold tabular-nums ${
          accent ? "text-accent" : ok ? "text-social" : "text-ink"
        }`}
      >
        {EUR.format(value / 100)}
      </p>
    </div>
  );
}

function PayoutModal({
  partnerId,
  maxPayoutCents,
  onClose,
  onDone,
}: {
  partnerId: string;
  maxPayoutCents: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amountEur, setAmountEur] = useState((maxPayoutCents / 100).toFixed(2));
  const [note, setNote] = useState(`Pago vía transferencia · ${new Date().toLocaleDateString("es-ES")}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const amountCents = Math.round(parseFloat(amountEur.replace(",", ".")) * 100);
      if (!Number.isFinite(amountCents) || amountCents <= 0) {
        setError("Importe inválido");
        return;
      }
      const r = await fetch(`/api/admin/affiliates/${partnerId}/ledger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ kind: "PAYOUT", amountCents, note }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || `Error ${r.status}`);
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-4 pt-16 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-line bg-bone shadow-2xl">
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-semibold text-ink">Registrar pago</h2>
          <button onClick={onClose} className="rounded-full p-1 text-ink/50 hover:bg-bone-soft">✕</button>
        </header>
        <div className="space-y-4 px-6 py-5">
          <p className="text-sm text-ink/70">
            Registra que has pagado al afiliado esta cantidad. Se restará del saldo de comisión
            pendiente.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-ink/60">
              Importe pagado (€)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={amountEur}
              onChange={(e) => setAmountEur(e.target.value)}
              className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-right font-display text-xl outline-none focus:border-accent"
            />
            <p className="mt-1 text-[11px] text-ink/55">
              Saldo pendiente actual: <strong>{(maxPayoutCents / 100).toFixed(2)} €</strong>
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-ink/60">
              Nota
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <p className="mt-1 text-[11px] text-ink/55">
              Sugerencia: incluir referencia de transferencia / nº factura
            </p>
          </div>
          {error && <p className="rounded-xl bg-accent-wash p-3 text-sm text-accent-deep">⚠ {error}</p>}
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-line bg-bone-soft px-6 py-4">
          <button onClick={onClose} className="text-xs text-ink/60 hover:text-ink">Cancelar</button>
          <button
            onClick={save}
            disabled={busy}
            className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
          >
            {busy ? "Guardando…" : "Registrar pago"}
          </button>
        </footer>
      </div>
    </div>
  );
}
