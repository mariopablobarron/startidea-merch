import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { prisma } from "@/lib/prisma";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `Dashboard partner · ${slug}`,
    robots: { index: false, follow: false }, // dashboard semipúblico, no indexable
  };
}

const EUR = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

export default async function PartnerDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const partner = await prisma.affiliatePartner.findUnique({
    where: { slug },
    include: {
      referrals: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          status: true,
          baseAmountCents: true,
          commissionCents: true,
          paidOutAt: true,
          createdAt: true,
        },
      },
    },
  });

  if (!partner || !partner.active) notFound();

  const referrals = partner.referrals;
  const counts = {
    LEAD: referrals.filter((r) => r.status === "LEAD").length,
    EARNED: referrals.filter((r) => r.status === "EARNED").length,
    PAID_OUT: referrals.filter((r) => r.status === "PAID_OUT").length,
  };
  const pendingEur = referrals.filter((r) => r.status === "EARNED").reduce((s, r) => s + r.commissionCents, 0) / 100;
  const paidEur = partner.totalPaidOutCents / 100;
  const earnedEur = partner.totalEarnedCents / 100;

  const refLink = `${SITE_URL}/?ref=${partner.slug}`;
  const firstName = partner.name.split(" ")[0];

  return (
    <>
      <Nav />
      <main className="bg-bone-soft">
        <section className="bg-bone">
          <div className="mx-auto max-w-5xl px-6 pt-14 pb-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">— Dashboard partner</p>
            <h1 className="mt-2 font-display text-4xl font-semibold text-ink leading-tight">
              Hola {firstName}.<br />
              <span className="text-accent">
                {EUR.format(earnedEur)} ganados con {counts.LEAD + counts.EARNED + counts.PAID_OUT} leads.
              </span>
            </h1>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-8">
          <div className="rounded-3xl border border-line bg-white p-6 md:p-8">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">— Tu link único</p>
            <p className="mt-2 text-sm text-ink/65">Compartir esta URL = atribuirte cualquier cotización que cierre.</p>
            <div className="mt-4 rounded-2xl border-2 border-dashed border-accent bg-accent/5 p-4 text-center">
              <p className="font-mono text-base text-accent break-all">{refLink}</p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6">
          <div className="grid gap-4 md:grid-cols-4">
            <Stat label="Leads" value={String(counts.LEAD)} hint="Cotizaciones en curso" />
            <Stat label="Cerrados" value={String(counts.EARNED + counts.PAID_OUT)} hint="Pedidos pagados" />
            <Stat label="Pendiente liquidar" value={EUR.format(pendingEur)} hint="Se paga día 15 mes siguiente" accent />
            <Stat label="Total liquidado" value={EUR.format(paidEur)} hint={`Comisión ${partner.commissionPct}%`} />
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-10">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">— Histórico referidos</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-ink">Tus últimos 50 referidos</h2>

          <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-white">
            {referrals.length === 0 ? (
              <p className="p-8 text-center text-sm text-ink/50">
                Aún no hay referidos. Comparte tu link y los primeros aparecerán aquí.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-bone-soft text-[11px] uppercase tracking-wider text-ink/55">
                  <tr>
                    <th className="px-4 py-3 text-left">Fecha</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Importe</th>
                    <th className="px-4 py-3 text-right">Comisión</th>
                    <th className="px-4 py-3 text-left">Liquidado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {referrals.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3 text-ink/70">
                        {new Date(r.createdAt).toLocaleDateString("es-ES")}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-right text-ink/70">
                        {r.baseAmountCents > 0 ? EUR.format(r.baseAmountCents / 100) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-accent-deep">
                        {r.commissionCents > 0 ? EUR.format(r.commissionCents / 100) : "—"}
                      </td>
                      <td className="px-4 py-3 text-ink/55 text-[12px]">
                        {r.paidOutAt
                          ? new Date(r.paidOutAt).toLocaleDateString("es-ES")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 pb-16">
          <details className="rounded-2xl border border-line bg-white p-5">
            <summary className="cursor-pointer text-sm font-semibold text-ink">Cómo se calcula la comisión</summary>
            <p className="mt-3 text-sm text-ink/70 leading-relaxed">
              {partner.commissionPct}% sobre el importe que cobramos del cliente (sin
              IVA). Se devenga (status EARNED) al confirmar el pago del pedido. La
              liquidación se hace el día 15 del mes siguiente al devengo por transferencia
              a la cuenta que nos indiques en respuesta al primer EARNED.
            </p>
          </details>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-5 ${accent ? "border-accent/40 bg-accent/5" : "border-line bg-white"}`}>
      <p className="text-[11px] uppercase tracking-wider text-ink/55">{label}</p>
      <p
        className={`mt-2 font-display text-2xl font-semibold ${accent ? "text-accent" : "text-ink"}`}
        style={{ fontFamily: "Georgia, serif" }}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-ink/55">{hint}</p>}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    LEAD: { label: "En curso", cls: "bg-accent-mist text-accent-deep" },
    EARNED: { label: "Devengada", cls: "bg-social/15 text-social" },
    PAID_OUT: { label: "Pagada", cls: "bg-line/30 text-ink/55" },
    CANCELED: { label: "Cancelada", cls: "bg-line/20 text-ink/40" },
  };
  const item = map[status] || { label: status, cls: "bg-line/30 text-ink/55" };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${item.cls}`}>
      {item.label}
    </span>
  );
}
