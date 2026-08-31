import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { AutoRefresh } from "@/components/AutoRefresh";
import { summarizeSupplierRuns } from "@/lib/suppliers/sync-history";

export const metadata: Metadata = {
  title: "Centro de control",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}

export default async function ControlCenterPage() {
  if (!(await isAdmin())) redirect("/admin/login");

  const now = new Date();
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);

  const [
    cartsToday,
    cartsNew,
    paidToday,
    paidTodayAgg,
    subsToday,
    draftProposals,
    nlActive,
    outbound,
    suppression,
    productsActive,
    hotLeads,
    lastBroadcast,
    suppliers,
    recentCarts,
    supplierRuns,
  ] = await Promise.all([
    prisma.cartQuote.count({ where: { createdAt: { gte: startToday } } }),
    prisma.cartQuote.count({ where: { status: "NEW" } }),
    prisma.payment.count({ where: { status: "PAID", paidAt: { gte: startToday } } }),
    prisma.payment.aggregate({ _sum: { amountCents: true }, where: { status: "PAID", paidAt: { gte: startToday } } }),
    prisma.newsletterSubscriber.count({ where: { optedInAt: { gte: startToday } } }),
    prisma.proposal.count({ where: { status: "draft" } }),
    prisma.newsletterSubscriber.count({ where: { unsubscribedAt: null } }),
    prisma.outboundLead.count(),
    prisma.outboundSuppression.count(),
    prisma.product.count({ where: { active: true } }),
    prisma.newsletterSubscriber.findMany({
      where: { engagementScore: { gt: 0 }, unsubscribedAt: null },
      orderBy: { engagementScore: "desc" },
      take: 6,
      select: { email: true, name: true, engagementScore: true, lastOpenedAt: true },
    }),
    prisma.emailBroadcast.findFirst({
      where: { status: "SENT" },
      orderBy: { sentAt: "desc" },
      select: { id: true, subject: true, sentCount: true, sentAt: true },
    }),
    prisma.supplierSync.findMany({ select: { supplier: true, ok: true, finishedAt: true } }),
    prisma.cartQuote.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, name: true, company: true, estimatedTotalCents: true, status: true, createdAt: true },
    }),
    prisma.supplierSyncRun.findMany({
      // Solo ejecuciones correctas: la duración de una abortada no mide
      // tendencia (mismo filtro que la alerta de degradación).
      where: { ok: true },
      orderBy: { startedAt: "desc" },
      take: 40,
      select: { supplier: true, durationMs: true },
    }),
  ]);

  const supplierTrends = summarizeSupplierRuns(supplierRuns);

  const lastBroadcastOpens = lastBroadcast
    ? await prisma.broadcastDelivery.count({ where: { broadcastId: lastBroadcast.id, openedAt: { not: null } } })
    : 0;

  const Stat = ({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) => (
    <div className={`rounded-2xl border p-4 ${accent ? "border-accent/30 bg-accent/5" : "border-line bg-bone-soft"}`}>
      <p className="text-[11px] uppercase tracking-wider text-ink/55">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-ink/50">{sub}</p>}
    </div>
  );

  return (
    <>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold text-ink">Centro de control</h1>
            <p className="mt-1 text-sm text-ink/60">Lo que está pasando ahora mismo en tu negocio.</p>
          </div>
          <AutoRefresh seconds={30} />
        </div>

        {/* HOY */}
        <h2 className="mt-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/50">— Hoy</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Cotizaciones hoy" value={String(cartsToday)} sub={`${cartsNew} sin atender`} accent={cartsNew > 0} />
          <Stat label="Cobros hoy" value={String(paidToday)} sub={EUR.format((paidTodayAgg._sum.amountCents ?? 0) / 100)} accent={paidToday > 0} />
          <Stat label="Altas newsletter hoy" value={String(subsToday)} />
          <Stat label="Propuestas a enviar" value={String(draftProposals)} sub="borradores del agente" accent={draftProposals > 0} />
        </div>

        {/* CRM */}
        <h2 className="mt-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/50">— CRM</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Newsletter activos" value={nlActive.toLocaleString("es-ES")} />
          <Stat label="Leads outbound" value={outbound.toLocaleString("es-ES")} />
          <Stat label="Supresión (no contactar)" value={String(suppression)} />
          <Stat label="Catálogo activo" value={productsActive.toLocaleString("es-ES")} sub="productos" />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* Leads calientes */}
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/50">— 🔥 Leads más activos</h2>
            <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-bone-soft">
              {hotLeads.length === 0 ? (
                <p className="p-5 text-sm text-ink/50">Aún sin aperturas. Tras la primera campaña aparecerán aquí.</p>
              ) : (
                <ul className="divide-y divide-line/60">
                  {hotLeads.map((l) => (
                    <li key={l.email} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="font-medium text-ink">{l.name || l.email}</span>
                        {l.name && <span className="ml-2 text-[11px] text-ink/45">{l.email}</span>}
                      </span>
                      <span className="shrink-0 font-semibold text-accent-deep">🔥 {l.engagementScore}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Última campaña + proveedores */}
          <div className="space-y-6">
            <div>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/50">— Última campaña</h2>
              <div className="mt-3 rounded-2xl border border-line bg-bone-soft p-4 text-sm">
                {lastBroadcast ? (
                  <>
                    <p className="font-medium text-ink">{lastBroadcast.subject}</p>
                    <p className="mt-1 text-[12px] text-ink/60">
                      {lastBroadcast.sentCount} enviados · <span className="text-accent-deep">{lastBroadcastOpens} aperturas</span>
                      {lastBroadcast.sentCount > 0 && ` · ${Math.round((lastBroadcastOpens / lastBroadcast.sentCount) * 100)}%`}
                      {" · "}{fmtDate(lastBroadcast.sentAt)}
                    </p>
                  </>
                ) : (
                  <p className="text-ink/50">Aún no has enviado ninguna campaña. <Link href="/admin/marketing/broadcasts" className="text-accent hover:underline">Lanzar →</Link></p>
                )}
              </div>
            </div>
            <div>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/50">— Proveedores</h2>
              <div className="mt-3 rounded-2xl border border-line bg-bone-soft p-4 text-sm">
                {suppliers.map((s) => {
                  const t = supplierTrends[s.supplier];
                  return (
                    <div key={s.supplier} className="flex items-center justify-between py-1">
                      <span className="capitalize text-ink/80">
                        {s.supplier}
                        {t ? (
                          <span
                            className={`ml-2 text-[11px] ${t.degraded ? "text-accent-deep" : "text-ink/45"}`}
                            title={`última ${Math.round(t.lastMs / 1000)}s · mediana ${Math.round(t.medianMs / 1000)}s (${t.samples} runs)`}
                          >
                            {Math.round(t.lastMs / 1000)}s{t.degraded ? " ⚠️ lento" : ""}
                          </span>
                        ) : null}
                      </span>
                      <span className={s.ok ? "text-social" : "text-accent-deep"}>
                        {s.ok ? "✓" : "✕"} {fmtDate(s.finishedAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Últimas cotizaciones */}
        <h2 className="mt-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/50">— Últimas cotizaciones</h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-bone-soft">
          {recentCarts.length === 0 ? (
            <p className="p-5 text-sm text-ink/50">Sin cotizaciones todavía.</p>
          ) : (
            <ul className="divide-y divide-line/60">
              {recentCarts.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/cart-quotes/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-bone">
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-ink">{c.name}</span>
                      {c.company && <span className="ml-2 text-[11px] text-ink/45">{c.company}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="rounded-full bg-bone px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink/55">{c.status}</span>
                      <span className="tabular-nums text-ink/70">{c.estimatedTotalCents ? EUR.format(c.estimatedTotalCents / 100) : "—"}</span>
                      <span className="text-[11px] text-ink/40">{fmtDate(c.createdAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-8 flex flex-wrap gap-2 text-xs">
          <Link href="/admin" className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent">Ventas (/admin)</Link>
          <Link href="/admin/insights" className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent">Insights</Link>
          <Link href="/admin/marketing/newsletter" className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent">Newsletter</Link>
          <Link href="/admin/marketing/outbound" className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent">Outbound</Link>
          <Link href="/admin/propuestas" className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent">Propuestas</Link>
        </div>
      </div>
    </>
  );
}
