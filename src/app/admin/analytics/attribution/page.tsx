"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const EUR2 = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

type Row = {
  source: string;
  medium: string;
  campaign: string | null;
  revenueCents: number;
  spendCents: number;
  paidCount: number;
  uniqueCustomers: number;
  roas: number | null;
  cpaCents: number | null;
};

type AttributionData = {
  range: { days: number; since: string };
  totals: {
    revenueCents: number;
    spendCents: number;
    paidCount: number;
    roas: number | null;
    cpaCents: number | null;
  };
  rows: Row[];
};

const SOURCE_LABEL: Record<string, string> = {
  google: "Google",
  meta: "Meta (FB/IG)",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  twitter: "X / Twitter",
  email: "Email",
  metricool: "Metricool",
  organic: "Organic",
  direct: "Directo",
  referral: "Referral",
};

const SOURCE_COLOR: Record<string, string> = {
  google: "bg-[#4285F4]/10 text-[#1a73e8]",
  meta: "bg-[#1877F2]/10 text-[#1877F2]",
  facebook: "bg-[#1877F2]/10 text-[#1877F2]",
  instagram: "bg-[#E4405F]/10 text-[#E4405F]",
  linkedin: "bg-[#0A66C2]/10 text-[#0A66C2]",
  tiktok: "bg-ink/10 text-ink",
  twitter: "bg-ink/10 text-ink",
  email: "bg-accent/10 text-accent-deep",
  metricool: "bg-social/10 text-social",
  organic: "bg-social/10 text-social",
  direct: "bg-bone-soft text-ink/60",
  referral: "bg-accent-mist text-accent-deep",
};

export default function AttributionPage() {
  const [data, setData] = useState<AttributionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(90);
  const [showAddSpend, setShowAddSpend] = useState(false);

  // Form spend
  const [spendMonth, setSpendMonth] = useState("");
  const [spendSource, setSpendSource] = useState("");
  const [spendMedium, setSpendMedium] = useState("cpc");
  const [spendCampaign, setSpendCampaign] = useState("");
  const [spendAmount, setSpendAmount] = useState("");
  const [spendImpressions, setSpendImpressions] = useState("");
  const [spendClicks, setSpendClicks] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/analytics/attribution?days=${days}`, {
        credentials: "include",
      });
      const d = await res.json();
      if (res.ok) setData(d);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  async function addSpend() {
    setSaving(true);
    setFeedback(null);
    try {
      const monthDay = spendMonth ? `${spendMonth}-01` : "";
      const cents = Math.round(parseFloat(spendAmount.replace(",", ".") || "0") * 100);
      if (!monthDay || !spendSource || cents <= 0) {
        setFeedback({ ok: false, msg: "Mes, source y gasto > 0 son obligatorios" });
        return;
      }
      const res = await fetch("/api/admin/marketing/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          month: monthDay,
          source: spendSource,
          medium: spendMedium,
          campaign: spendCampaign.trim() || null,
          spendCents: cents,
          impressions: spendImpressions ? parseInt(spendImpressions, 10) : null,
          clicks: spendClicks ? parseInt(spendClicks, 10) : null,
        }),
      });
      const d = await res.json();
      if (!res.ok) setFeedback({ ok: false, msg: d.error || "Error" });
      else {
        setFeedback({ ok: true, msg: "Gasto registrado" });
        setSpendMonth("");
        setSpendSource("");
        setSpendCampaign("");
        setSpendAmount("");
        setSpendImpressions("");
        setSpendClicks("");
        setShowAddSpend(false);
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading || !data) {
    return (
      <main className="min-h-screen bg-bone-soft p-8">
        <p className="text-sm text-ink/60">Cargando…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Analytics · Atribución
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
              ROAS por canal y campaña
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-ink/60">
              Last-touch attribution: agrupa pedidos pagados por <code className="rounded bg-bone-soft px-1 py-0.5 text-[11px]">utm_source/medium/campaign</code> y los cruza
              con el gasto que registras manualmente. Cuando conectes Meta/Google/LinkedIn
              Ads APIs, el spend se sincronizará auto.
            </p>
            <nav className="mt-3 flex gap-1.5 text-xs">
              <Link
                href="/admin/analytics"
                className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent"
              >
                Web
              </Link>
              <Link
                href="/admin/analytics/business"
                className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent"
              >
                Negocio
              </Link>
              <span className="rounded-full bg-accent px-3 py-1.5 font-semibold text-bone">
                Atribución
              </span>
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value, 10))}
              className="rounded-full border border-line bg-bone px-3 py-1.5 text-xs"
            >
              <option value={30}>30 días</option>
              <option value={90}>90 días</option>
              <option value={180}>180 días</option>
              <option value={365}>365 días</option>
            </select>
            <button
              type="button"
              onClick={() => setShowAddSpend(!showAddSpend)}
              className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-bone hover:bg-accent-dark"
            >
              + Registrar gasto
            </button>
          </div>
        </header>

        {/* KPIs globales */}
        <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi
            label="Revenue atribuible"
            value={EUR.format(data.totals.revenueCents / 100)}
            color="text-social"
          />
          <Kpi
            label="Spend total"
            value={EUR.format(data.totals.spendCents / 100)}
            color="text-accent-deep"
          />
          <Kpi
            label="ROAS global"
            value={
              data.totals.roas != null
                ? `${data.totals.roas.toFixed(2)}x`
                : "—"
            }
            color={
              data.totals.roas != null
                ? data.totals.roas >= 3
                  ? "text-social"
                  : data.totals.roas >= 1
                    ? "text-accent"
                    : "text-accent-deep"
                : "text-ink"
            }
            sub={
              data.totals.roas != null
                ? data.totals.roas >= 3
                  ? "Excelente ≥3x"
                  : data.totals.roas >= 1
                    ? "Aceptable 1-3x"
                    : "Pérdida <1x"
                : "Sin spend registrado"
            }
          />
          <Kpi
            label="Pedidos pagados"
            value={data.totals.paidCount.toLocaleString("es-ES")}
          />
          <Kpi
            label="CPA medio"
            value={
              data.totals.cpaCents != null
                ? EUR.format(data.totals.cpaCents / 100)
                : "—"
            }
          />
        </section>

        {showAddSpend && (
          <section className="mb-6 rounded-2xl border border-accent/40 bg-bone p-5">
            <h2 className="mb-3 font-display text-base font-semibold text-ink">
              Registrar gasto mensual
            </h2>
            <p className="mb-3 text-[11px] text-ink/50">
              Introduce el gasto agregado por mes y combinación source/medium/campaign.
              El sistema cruza con los pedidos pagados que tengan ese UTM para calcular ROAS.
            </p>
            <div className="grid gap-3 lg:grid-cols-4">
              <Field label="Mes (YYYY-MM)">
                <input
                  type="month"
                  value={spendMonth}
                  onChange={(e) => setSpendMonth(e.target.value)}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </Field>
              <Field label="Source (utm_source)">
                <input
                  type="text"
                  value={spendSource}
                  onChange={(e) => setSpendSource(e.target.value.toLowerCase())}
                  placeholder="google, meta, linkedin…"
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </Field>
              <Field label="Medium (utm_medium)">
                <input
                  type="text"
                  value={spendMedium}
                  onChange={(e) => setSpendMedium(e.target.value.toLowerCase())}
                  placeholder="cpc, social, email"
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </Field>
              <Field label="Campaign (opcional)">
                <input
                  type="text"
                  value={spendCampaign}
                  onChange={(e) => setSpendCampaign(e.target.value)}
                  placeholder="black-friday-2026"
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </Field>
              <Field label="Gasto € (con decimales)">
                <input
                  type="text"
                  inputMode="decimal"
                  value={spendAmount}
                  onChange={(e) => setSpendAmount(e.target.value)}
                  placeholder="1234.56"
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </Field>
              <Field label="Impresiones (opc)">
                <input
                  type="number"
                  value={spendImpressions}
                  onChange={(e) => setSpendImpressions(e.target.value)}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </Field>
              <Field label="Clicks (opc)">
                <input
                  type="number"
                  value={spendClicks}
                  onChange={(e) => setSpendClicks(e.target.value)}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </Field>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={addSpend}
                disabled={saving}
                className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-bone hover:bg-accent-dark disabled:opacity-40"
              >
                {saving ? "Guardando…" : "Guardar gasto"}
              </button>
              <button
                type="button"
                onClick={() => setShowAddSpend(false)}
                className="text-xs text-ink/60 hover:text-accent"
              >
                Cancelar
              </button>
              {feedback && (
                <span
                  className={`text-xs ${
                    feedback.ok ? "text-social" : "text-accent-deep"
                  }`}
                >
                  {feedback.ok ? "✓" : "⚠"} {feedback.msg}
                </span>
              )}
            </div>
          </section>
        )}

        {/* Tabla atribución */}
        <section className="rounded-2xl border border-line bg-bone">
          {data.rows.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-3xl">📊</p>
              <p className="mt-3 font-display text-lg text-ink">Sin datos atribuibles</p>
              <p className="mt-1 text-sm text-ink/60">
                Necesitas pedidos pagados con UTMs en sus carritos. Si tienes Ads activos,
                añade UTM completo en cada destination URL.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-bone-soft text-left text-xs uppercase tracking-wider text-ink/60">
                  <tr>
                    <th className="p-3">Source</th>
                    <th className="p-3">Medium</th>
                    <th className="p-3">Campaign</th>
                    <th className="p-3 text-right">Revenue</th>
                    <th className="p-3 text-right">Spend</th>
                    <th className="p-3 text-right">ROAS</th>
                    <th className="p-3 text-right">Pedidos</th>
                    <th className="p-3 text-right">CPA</th>
                    <th className="p-3 text-right">Clientes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr key={i} className="border-t border-line align-middle hover:bg-bone-soft">
                      <td className="p-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                            SOURCE_COLOR[r.source] || "bg-bone-soft text-ink/60"
                          }`}
                        >
                          {SOURCE_LABEL[r.source] || r.source}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-ink/70">{r.medium}</td>
                      <td className="p-3 text-xs text-ink/60">
                        {r.campaign || <span className="text-ink/30">—</span>}
                      </td>
                      <td className="p-3 text-right">
                        {r.revenueCents > 0 ? (
                          <span className="font-medium tabular-nums text-social">
                            {EUR2.format(r.revenueCents / 100)}
                          </span>
                        ) : (
                          <span className="text-ink/30">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {r.spendCents > 0 ? (
                          <span className="tabular-nums text-accent-deep">
                            {EUR2.format(r.spendCents / 100)}
                          </span>
                        ) : (
                          <span className="text-ink/30">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {r.roas != null ? (
                          <span
                            className={`font-semibold tabular-nums ${
                              r.roas >= 3
                                ? "text-social"
                                : r.roas >= 1
                                  ? "text-accent"
                                  : "text-accent-deep"
                            }`}
                          >
                            {r.roas.toFixed(2)}x
                          </span>
                        ) : (
                          <span className="text-ink/30">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right tabular-nums text-xs">{r.paidCount}</td>
                      <td className="p-3 text-right">
                        {r.cpaCents != null ? (
                          <span className="tabular-nums text-xs text-ink/70">
                            {EUR2.format(r.cpaCents / 100)}
                          </span>
                        ) : (
                          <span className="text-ink/30">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right tabular-nums text-xs text-ink/60">
                        {r.uniqueCustomers}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="mt-4 text-[11px] text-ink/50">
          ⓘ Last-touch attribution: cuenta el último UTM del cliente antes de pagar. No
          considera touches anteriores (multi-touch coming en futura iteración).
        </p>
      </div>
    </main>
  );
}

function Kpi({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-bone p-4">
      <p className="text-[10px] uppercase tracking-wider text-ink/50">{label}</p>
      <p
        className={`mt-1 font-display text-2xl font-semibold tabular-nums ${color || "text-ink"}`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-ink/50">{sub}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-ink/60">
        {label}
      </label>
      {children}
    </div>
  );
}
