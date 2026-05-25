import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { verifyAffiliateMagicToken } from "@/lib/affiliate-magic";
import { getAffiliateBalance } from "@/lib/affiliates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tu cuenta de afiliado · TodoMerchandising",
  robots: { index: false, follow: false },
};

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

const KIND_LABEL: Record<string, string> = {
  COMMISSION: "Comisión devengada",
  CREDIT: "Crédito acumulado",
  PAYOUT: "Pago recibido",
  CREDIT_USED: "Crédito usado",
  ADJUSTMENT: "Ajuste",
};

const KIND_COLOR: Record<string, string> = {
  COMMISSION: "text-accent",
  CREDIT: "text-social",
  PAYOUT: "text-ink/65",
  CREDIT_USED: "text-ink/65",
  ADJUSTMENT: "text-amber-700",
};

export default async function AfiliadoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const payload = await verifyAffiliateMagicToken(token);
  if (!payload) {
    return (
      <main className="min-h-screen bg-bone-soft p-6 lg:p-10">
        <div className="mx-auto max-w-md rounded-3xl border border-line bg-bone p-8 text-center shadow-sm">
          <p className="text-3xl">🔒</p>
          <h1 className="mt-3 font-display text-xl text-ink">Enlace caducado</h1>
          <p className="mt-2 text-sm text-ink/65">
            El enlace ya no es válido. Pide a Mario uno nuevo escribiendo a{" "}
            <a className="text-accent underline" href="mailto:mario@startidea.es">
              mario@startidea.es
            </a>
            .
          </p>
        </div>
      </main>
    );
  }

  const partner = await prisma.affiliatePartner.findUnique({
    where: { id: payload.partnerId },
    include: {
      coupons: {
        where: { active: true },
        select: { code: true, label: true, usedCount: true },
      },
    },
  });
  if (!partner) notFound();
  if (!partner.active) {
    return (
      <main className="min-h-screen bg-bone-soft p-6 lg:p-10">
        <div className="mx-auto max-w-md rounded-3xl border border-line bg-bone p-8 text-center shadow-sm">
          <p className="text-3xl">⏸</p>
          <h1 className="mt-3 font-display text-xl text-ink">Cuenta pausada</h1>
          <p className="mt-2 text-sm text-ink/65">
            Tu cuenta de afiliado está temporalmente pausada. Contacta con Mario para reactivarla.
          </p>
        </div>
      </main>
    );
  }

  const balance = await getAffiliateBalance(partner.id);
  const ledger = await prisma.affiliateLedgerEntry.findMany({
    where: { partnerId: partner.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return (
    <main className="min-h-screen bg-bone-soft pb-16">
      <div className="mx-auto max-w-3xl px-5 py-8 lg:px-8 lg:py-12">
        {/* Header personal */}
        <header className="mb-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/55">
            Programa de afiliados · TodoMerchandising
          </p>
          <h1 className="mt-2 font-display text-3xl text-ink lg:text-4xl">
            Hola, {partner.name.split(" ")[0]} 👋
          </h1>
          <p className="mt-2 text-sm text-ink/70">
            Aquí tienes el resumen de lo que has generado con tus cupones.
          </p>
        </header>

        {/* 2 stats principales — lo que más le importa */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-3xl border border-line bg-bone p-6">
            <p className="text-[11px] uppercase tracking-wider text-ink/55">
              Comisión pendiente de pago
            </p>
            <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-accent">
              {EUR.format(balance.commissionPending / 100)}
            </p>
            <p className="mt-2 text-[11px] text-ink/55">
              Devengada total: {EUR.format(balance.commissionEarned / 100)} · Pagada:{" "}
              {EUR.format(balance.commissionPaid / 100)}
            </p>
          </div>
          <div className="rounded-3xl border border-line bg-bone p-6">
            <p className="text-[11px] uppercase tracking-wider text-ink/55">
              Crédito disponible (canjeable)
            </p>
            <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-social">
              {EUR.format(balance.creditAvailable / 100)}
            </p>
            <p className="mt-2 text-[11px] text-ink/55">
              Acumulado total: {EUR.format(balance.creditEarned / 100)} · Usado:{" "}
              {EUR.format(balance.creditUsed / 100)}
            </p>
          </div>
        </div>

        {/* Cómo funciona — recordatorio del programa */}
        <section className="mt-8 rounded-3xl border border-line bg-bone p-6">
          <h2 className="font-display text-base font-semibold text-ink">¿Cómo funciona?</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink/75">
            <li className="flex gap-2">
              <span aria-hidden>·</span>
              <span>
                Cada vez que un cliente paga con uno de tus cupones, generas dos cosas:
                <strong> comisión</strong> (te la pago aparte por transferencia) y{" "}
                <strong>crédito</strong> (descuento para tus propios pedidos de merch).
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden>·</span>
              <span>
                <strong>Para usar tu crédito en un pedido</strong>: escríbeme y lo aplico al
                pedido antes del pago.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden>·</span>
              <span>
                <strong>Para cobrar tu comisión</strong>: te paso transferencia cuando me digas
                (mínimo 30 €).
              </span>
            </li>
          </ul>
        </section>

        {/* Cupones activos */}
        {partner.coupons.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink/55">
              Tus cupones activos ({partner.coupons.length})
            </h2>
            <div className="overflow-hidden rounded-3xl border border-line bg-bone">
              <table className="w-full text-sm">
                <thead className="bg-bone-soft text-left text-[11px] uppercase tracking-wider text-ink/55">
                  <tr>
                    <th className="p-3">Código</th>
                    <th className="p-3">Descripción</th>
                    <th className="p-3 text-right">Usos</th>
                  </tr>
                </thead>
                <tbody>
                  {partner.coupons.map((c) => (
                    <tr key={c.code} className="border-t border-line">
                      <td className="p-3">
                        <code className="rounded-md bg-accent-wash px-2 py-0.5 font-mono text-xs text-accent-deep">
                          {c.code}
                        </code>
                      </td>
                      <td className="p-3 text-ink/75">{c.label}</td>
                      <td className="p-3 text-right tabular-nums text-ink/65">{c.usedCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Histórico */}
        <section className="mt-8">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink/55">
            Movimientos recientes
          </h2>
          {ledger.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-line bg-bone p-8 text-center text-sm text-ink/55">
              Aún no hay movimientos. Cuando se canjeen tus cupones aparecerán aquí.
            </div>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-line bg-bone">
              <table className="w-full text-sm">
                <thead className="bg-bone-soft text-left text-[11px] uppercase tracking-wider text-ink/55">
                  <tr>
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Concepto</th>
                    <th className="p-3 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((e) => (
                    <tr key={e.id} className="border-t border-line">
                      <td className="p-3 text-xs text-ink/65">
                        {new Date(e.createdAt).toLocaleDateString("es-ES", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="p-3">
                        <span className={`text-xs font-medium ${KIND_COLOR[e.kind]}`}>
                          {KIND_LABEL[e.kind] || e.kind}
                        </span>
                        {e.note && (
                          <p className="mt-0.5 text-[11px] text-ink/55">{e.note}</p>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums">
                        <span className={e.amountCents < 0 ? "text-ink/65" : "text-accent"}>
                          {e.amountCents >= 0 ? "+" : ""}
                          {EUR.format(e.amountCents / 100)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Footer contacto */}
        <footer className="mt-10 rounded-3xl border border-line bg-bone-soft p-6 text-center">
          <p className="text-sm text-ink/75">
            ¿Algo no cuadra o quieres cobrar / canjear?
          </p>
          <a
            href="mailto:mario@startidea.es?subject=Afiliado · "
            className="mt-3 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark"
          >
            Escribir a Mario
          </a>
          <p className="mt-3 text-[11px] text-ink/45">
            Este enlace es personal y caduca a los 30 días desde que te lo generaron.
          </p>
        </footer>
      </div>
    </main>
  );
}
