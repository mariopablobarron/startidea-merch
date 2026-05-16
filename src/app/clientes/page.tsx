import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCustomerSession } from "@/lib/customer-auth";
import { OrderTimeline } from "@/components/OrderTimeline";
import { buildCartTimelineEvents } from "@/lib/cart-timeline";

export const metadata: Metadata = {
  title: "Portal cliente",
  robots: { index: false, follow: false },
};

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const STAGE_COLOR: Record<string, string> = {
  NEW: "bg-bone-soft text-ink/70",
  IN_PROGRESS: "bg-bone-soft text-ink/70",
  SENT: "bg-accent-mist text-accent-deep",
  CONFIRMED: "bg-accent/20 text-accent-deep",
  ORDERED: "bg-accent text-bone",
  ARCHIVED: "bg-line/40 text-ink/40",
};

export default async function CustomerPortalPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/clientes/login");

  const carts = await prisma.cartQuote.findMany({
    where: { email: session.email },
    orderBy: { createdAt: "desc" },
    include: {
      items: { select: { quantity: true, productName: true, productRef: true, primaryImageUrl: true } },
      payments: { where: { status: "PAID" }, select: { id: true, amountCents: true, paidAt: true, invoiceNumber: true } },
      proofs: {
        select: { token: true, artworkUrl: true, createdAt: true, status: true, decidedAt: true },
        orderBy: { createdAt: "desc" },
      },
      trackings: {
        select: { status: true, trackingCode: true, carrier: true, carrierUrl: true, fetchedAt: true },
        orderBy: { fetchedAt: "desc" },
        take: 1,
      },
    },
  });

  const ordered = carts.filter((c) => c.status === "ORDERED");
  const totalItems = ordered.reduce(
    (sum, c) => sum + c.items.reduce((s, it) => s + it.quantity, 0),
    0,
  );
  const totalPaid = carts.reduce(
    (sum, c) => sum + c.payments.reduce((s, p) => s + p.amountCents, 0),
    0,
  );
  const eurInvestedInCEE = Math.round(totalPaid * 0.4);
  const co2SavedKg = Math.round(totalItems * 1.2);
  const pendingPayments = carts.filter((c) => c.paymentLinkToken && c.payments.length === 0);
  const pendingProofs = carts.filter((c) => c.proofs.some((p) => p.status === "PENDING"));

  return (
    <main className="min-h-screen bg-bone-soft">
      {/* Header */}
      <header className="border-b border-line bg-bone py-10 lg:py-14">
        <div className="mx-auto max-w-6xl px-6 lg:px-10">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">Portal cliente</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <h1 className="font-display text-3xl font-semibold text-ink lg:text-4xl">
              Hola {session.name.split(" ")[0]}
            </h1>
            <div className="flex items-center gap-3 text-xs">
              <Link href="/catalogo" className="text-ink/60 hover:text-accent">
                Catálogo
              </Link>
              <form action="/api/clientes/auth/logout" method="POST">
                <button type="submit" className="rounded-full border border-line bg-bone-soft px-3 py-1 hover:border-accent">
                  Salir
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      {/* Tareas pendientes */}
      {(pendingProofs.length > 0 || pendingPayments.length > 0) && (
        <section className="border-b border-line bg-accent-wash py-6">
          <div className="mx-auto max-w-6xl px-6 lg:px-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60-deep">
              Tienes acciones pendientes
            </p>
            <ul className="mt-3 space-y-2">
              {pendingProofs.map((c) => {
                const pending = c.proofs.find((p) => p.status === "PENDING");
                return (
                  <li key={`p-${c.id}`}>
                    <Link
                      href={`/proof/${pending?.token}`}
                      className="flex items-center justify-between gap-3 rounded-xl bg-bone p-3 hover:bg-accent-mist"
                    >
                      <span className="text-sm">
                        🎨 <strong>Mockup esperando aprobación</strong> — pedido {c.id.slice(0, 6)}
                      </span>
                      <span className="text-xs text-accent-deep">Revisar →</span>
                    </Link>
                  </li>
                );
              })}
              {pendingPayments.map((c) => (
                <li key={`pay-${c.id}`}>
                  <Link
                    href={`/pay/${c.paymentLinkToken}`}
                    className="flex items-center justify-between gap-3 rounded-xl bg-bone p-3 hover:bg-accent-mist"
                  >
                    <span className="text-sm">
                      💳 <strong>Pago pendiente</strong> — {c.acceptedTotalCents ? EUR.format(c.acceptedTotalCents / 100) : "ver detalles"}
                    </span>
                    <span className="text-xs text-accent-deep">Pagar →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Impacto agregado */}
      <section className="bg-ink py-12 text-bone lg:py-16">
        <div className="mx-auto max-w-6xl px-6 lg:px-10">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60-light">
            Tu impacto acumulado
          </p>
          <div className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Pedidos cerrados" value={ordered.length.toString()} />
            <Stat label="Productos producidos" value={totalItems.toLocaleString("es-ES")} />
            <Stat
              label="Invertido en CEE"
              value={EUR.format(eurInvestedInCEE / 100)}
              sub="estimación 40%"
            />
            <Stat label="CO₂ ahorrado" value={`${co2SavedKg} kg`} sub="vs. Asia" />
          </div>
        </div>
      </section>

      {/* Histórico */}
      <section className="py-12 lg:py-16">
        <div className="mx-auto max-w-6xl px-6 lg:px-10">
          <h2 className="font-display text-2xl font-semibold text-ink">
            Tus cotizaciones y pedidos
          </h2>
          {carts.length === 0 ? (
            <p className="mt-4 text-sm text-ink/60">Aún no tienes ningún pedido.</p>
          ) : (
            <ul className="mt-6 space-y-3">
              {carts.map((c) => {
                const totalUnits = c.items.reduce((s, it) => s + it.quantity, 0);
                const paid = c.payments.reduce((s, p) => s + p.amountCents, 0);
                const tracking = c.trackings[0];
                return (
                  <li key={c.id} className="rounded-2xl border border-line bg-bone p-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <div>
                        <p className="font-display text-lg font-semibold text-ink">
                          {new Date(c.createdAt).toLocaleDateString("es-ES", {
                            day: "2-digit",
                            month: "long",
                            year: "numeric",
                          })}
                        </p>
                        <p className="text-xs text-ink/50">
                          {totalUnits.toLocaleString("es-ES")} unidades · {c.items.length} productos
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] uppercase tracking-wider ${
                          STAGE_COLOR[c.status] || "bg-bone-soft"
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>

                    <ul className="mt-3 space-y-1 text-xs text-ink/60">
                      {c.items.slice(0, 3).map((it, i) => (
                        <li key={i}>
                          {it.quantity} × {it.productName}{" "}
                          <span className="font-mono text-[10px]">({it.productRef})</span>
                        </li>
                      ))}
                      {c.items.length > 3 && <li>… y {c.items.length - 3} más</li>}
                    </ul>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-xs">
                      <div className="flex flex-wrap gap-3">
                        {c.acceptedTotalCents && (
                          <span className="text-ink/70">
                            Total: <strong className="text-ink">{EUR.format(c.acceptedTotalCents / 100)}</strong>
                          </span>
                        )}
                        {paid > 0 && (
                          <span className="text-social">✓ Pagado {EUR.format(paid / 100)}</span>
                        )}
                        {c.payments.map((p) => (
                          <a
                            key={p.id}
                            href={`/api/clientes/invoice/${p.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent underline-offset-4 hover:underline"
                            title={p.invoiceNumber ? `Factura ${p.invoiceNumber}` : "Generar factura"}
                          >
                            🧾 Factura PDF
                          </a>
                        ))}
                        {tracking?.trackingCode && (
                          <a
                            href={tracking.carrierUrl || "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent underline-offset-4 hover:underline"
                          >
                            📦 {tracking.carrier} {tracking.trackingCode}
                          </a>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {c.proofs.find((p) => p.status === "PENDING") && (
                          <Link
                            href={`/proof/${c.proofs.find((p) => p.status === "PENDING")?.token}`}
                            className="rounded-full bg-accent px-3 py-1 text-bone"
                          >
                            🎨 Aprobar mockup
                          </Link>
                        )}
                        {c.paymentLinkToken && c.payments.length === 0 && (
                          <Link
                            href={`/pay/${c.paymentLinkToken}`}
                            className="rounded-full bg-ink px-3 py-1 text-bone"
                          >
                            💳 Pagar
                          </Link>
                        )}
                      </div>
                    </div>

                    {/* Timeline visual del progreso */}
                    {(c.payments.length > 0 || c.status !== "NEW") && (
                      <details className="mt-4 border-t border-line pt-3">
                        <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-wider text-ink/50 hover:text-accent">
                          Ver progreso del pedido
                        </summary>
                        <div className="mt-3">
                          <OrderTimeline events={buildCartTimelineEvents(c)} />
                        </div>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-10 rounded-3xl border border-line bg-bone p-6 lg:p-8">
            <h3 className="font-display text-xl font-semibold text-ink">¿Necesitas algo?</h3>
            <p className="mt-2 text-[15px] text-ink/75">
              Volver a pedir, certificado RSC oficial firmado para tu memoria, ajuste de
              dirección de envío, factura duplicada — escríbenos y respondemos en horas.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/catalogo"
                className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bone hover:bg-accent"
              >
                Volver al catálogo
              </Link>
              <a
                href={`mailto:pedidos@startidea.es?subject=Soporte%20cliente`}
                className="rounded-full border border-line bg-bone-soft px-5 py-2.5 text-sm font-medium hover:border-accent"
              >
                Contactar soporte
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="font-display text-4xl font-semibold tabular-nums text-bone">{value}</p>
      <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60-light">{label}</p>
      {sub && <p className="mt-1 text-xs text-bone/50">{sub}</p>}
    </div>
  );
}
