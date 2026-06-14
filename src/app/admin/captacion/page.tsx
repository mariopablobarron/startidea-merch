import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { AdminChrome } from "@/components/AdminChrome";

export const metadata: Metadata = {
  title: "Captación",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}

export default async function CaptacionPage() {
  if (!(await isAdmin())) redirect("/admin/login");

  const now = Date.now();
  const d7 = new Date(now - 7 * DAY);
  const d30 = new Date(now - 30 * DAY);

  const [
    mockupTotal,
    mockup7d,
    mockupRecent,
    waOptInTotal,
    waOptIn7d,
    reviewsApproved,
    reviewsPending,
    cotiz7d,
    cotiz30d,
    waClicks,
    topSources,
  ] = await Promise.all([
    prisma.mockupRequest.count(),
    prisma.mockupRequest.count({ where: { createdAt: { gte: d7 } } }),
    prisma.mockupRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, name: true, company: true, email: true, productSlug: true, createdAt: true },
    }),
    prisma.cartQuote.count({ where: { whatsappOptIn: true } }),
    prisma.cartQuote.count({ where: { whatsappOptIn: true, createdAt: { gte: d7 } } }),
    prisma.review.count({ where: { approved: true, submittedAt: { not: null } } }),
    prisma.review.count({ where: { approved: false, submittedAt: { not: null } } }),
    prisma.cartQuote.count({ where: { createdAt: { gte: d7 } } }),
    prisma.cartQuote.count({ where: { createdAt: { gte: d30 } } }),
    prisma.analyticsEvent.groupBy({
      by: ["path"],
      where: { type: "wa_click", createdAt: { gte: d30 } },
      _count: { _all: true },
    }),
    prisma.cartQuote.groupBy({
      by: ["source"],
      where: { createdAt: { gte: d30 } },
      _count: { _all: true },
    }),
  ]);

  const waBySource = waClicks
    .map((w) => ({ source: w.path || "(sin origen)", count: w._count._all }))
    .sort((a, b) => b.count - a.count);
  const waClicksTotal = waBySource.reduce((a, w) => a + w.count, 0);
  const sources = topSources
    .map((s) => ({ source: s.source || "(directo)", count: s._count._all }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const Stat = ({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) => (
    <div className={`rounded-2xl border p-4 ${accent ? "border-accent/30 bg-accent/5" : "border-line bg-bone-soft"}`}>
      <p className="text-[11px] uppercase tracking-wider text-ink/55">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-ink/50">{sub}</p>}
    </div>
  );

  return (
    <AdminChrome>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">Captación</h1>
          <p className="mt-1 text-sm text-ink/60">
            Qué genera la web nueva: leads de mockup, opt-ins de WhatsApp, reseñas y cotizaciones.
          </p>
        </div>

        {/* Funnel de captación */}
        <h2 className="mt-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/50">— Últimos 7 / 30 días</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Mockups gratis pedidos" value={String(mockupTotal)} sub={`+${mockup7d} en 7 días`} accent={mockup7d > 0} />
          <Stat label="Opt-in WhatsApp" value={waOptInTotal.toLocaleString("es-ES")} sub={`+${waOptIn7d} en 7 días`} />
          <Stat label="Cotizaciones" value={String(cotiz7d)} sub={`${cotiz30d} en 30 días`} accent={cotiz7d > 0} />
          <Stat label="Clics WhatsApp (30d)" value={String(waClicksTotal)} sub="desde la web" />
        </div>

        {/* Reseñas — acción */}
        <h2 className="mt-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/50">— Reseñas (prueba social)</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Aprobadas (en la home)" value={String(reviewsApproved)} accent={reviewsApproved > 0} />
          <Stat label="Pendientes de aprobar" value={String(reviewsPending)} sub={reviewsPending > 0 ? "→ apruébalas para mostrarlas" : "nada en cola"} accent={reviewsPending > 0} />
          <a
            href="/admin/reviews"
            className="flex items-center justify-center rounded-2xl border border-line bg-bone-soft p-4 text-sm font-semibold text-accent transition hover:border-accent hover:underline"
          >
            {reviewsPending > 0
              ? `Aprobar ${reviewsPending} pendiente${reviewsPending === 1 ? "" : "s"} →`
              : "Gestionar reseñas →"}
          </a>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* WhatsApp por origen */}
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/50">— Clics de WhatsApp por origen (30d)</h2>
            <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-bone-soft">
              {waBySource.length === 0 ? (
                <p className="p-5 text-sm text-ink/50">Aún sin clics registrados. Aparecerán cuando alguien pulse un botón de WhatsApp.</p>
              ) : (
                <ul className="divide-y divide-line/60">
                  {waBySource.map((w) => (
                    <li key={w.source} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="text-ink/80">{w.source}</span>
                      <span className="font-semibold tabular-nums text-ink">{w.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Origen de cotizaciones (atribución) */}
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/50">— Origen de las cotizaciones (30d)</h2>
            <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-bone-soft">
              {sources.length === 0 ? (
                <p className="p-5 text-sm text-ink/50">Sin cotizaciones en 30 días.</p>
              ) : (
                <ul className="divide-y divide-line/60">
                  {sources.map((s) => (
                    <li key={s.source} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="text-ink/80">{s.source}</span>
                      <span className="font-semibold tabular-nums text-ink">{s.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Últimos leads de mockup */}
        <h2 className="mt-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/50">— Últimos mockups gratis pedidos</h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-bone-soft">
          {mockupRecent.length === 0 ? (
            <p className="p-5 text-sm text-ink/50">Aún sin peticiones de mockup desde la web.</p>
          ) : (
            <ul className="divide-y divide-line/60">
              {mockupRecent.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-medium text-ink">{m.name}</span>
                    {m.company && <span className="ml-2 text-[11px] text-ink/45">{m.company}</span>}
                    <span className="ml-2 text-[11px] text-ink/45">{m.email}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-ink/40">
                    {m.productSlug} · {fmtDate(m.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminChrome>
  );
}
