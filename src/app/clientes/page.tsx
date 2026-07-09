import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCustomerSession } from "@/lib/customer-auth";
import { OrderTimeline } from "@/components/OrderTimeline";
import { buildCartTimelineEvents } from "@/lib/cart-timeline";
import { signProposalToken } from "@/lib/proposal-token";
import { clientFromPriceCents } from "@/lib/product-pricing";
import { ReorderButton } from "@/components/portal/ReorderButton";
import { QuickOrder } from "@/components/portal/QuickOrder";
import { ProfileForm } from "@/components/portal/ProfileForm";

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
      // Si el cart se dividió en N PurchaseOrders (multi-proveedor), los mostramos
      // como "envíos" en el dashboard. NO exponemos el supplier al cliente —
      // solo "envío 1, envío 2…" + plazo y tracking propios.
      purchaseOrders: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          status: true,
          estimatedDeliveryDate: true,
          shippedAt: true,
          deliveredAt: true,
          trackingCarrier: true,
          trackingNumber: true,
          trackingUrl: true,
          totalClientCents: true,
          items: { select: { quantity: true, productName: true } },
        },
      },
    },
  });

  // Propuestas comerciales, favoritos y perfil — en paralelo (mismo email).
  const [proposals, favorites, profile] = await Promise.all([
    prisma.proposal.findMany({
      where: { email: session.email },
      orderBy: { sentAt: "desc" },
      select: {
        id: true,
        proposalNumber: true,
        totalCents: true,
        status: true,
        sentAt: true,
      },
    }),
    prisma.customerFavorite.findMany({
      where: { email: session.email },
      orderBy: { createdAt: "desc" },
      include: {
        product: {
          select: {
            slug: true,
            name: true,
            primaryImageUrl: true,
            active: true,
            // fromPriceCents es COSTE NETO — solo se muestra tras pasar por
            // clientFromPriceCents (margen/override), nunca crudo.
            fromPriceCents: true,
            override: {
              select: { customFromPriceCents: true, marginPct: true, marketingTags: true },
            },
          },
        },
      },
    }),
    prisma.customerUser.findUnique({
      where: { email: session.email },
      select: {
        email: true,
        name: true,
        company: true,
        phone: true,
        taxId: true,
        billingAddress: true,
        shippingAddress: true,
      },
    }),
  ]);

  // Facturas: todos los pagos PAID de todos los carritos, más recientes primero.
  const invoices = carts
    .flatMap((c) => c.payments.map((p) => ({ ...p, cartId: c.id })))
    .sort((a, b) => (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0));

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
          {/* Navegación de secciones del portal */}
          <nav className="mt-6 flex flex-wrap gap-2 text-xs" aria-label="Secciones del portal">
            {[
              ["#pedidos", "Pedidos"],
              ["#presupuestos", "Presupuestos"],
              ["#facturas", "Facturas"],
              ["#favoritos", "Favoritos"],
              ["#datos", "Mis datos"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="rounded-full border border-line bg-bone-soft px-3.5 py-1.5 font-medium text-ink/70 hover:border-accent hover:text-accent"
              >
                {label}
              </a>
            ))}
          </nav>
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
      <section id="pedidos" className="scroll-mt-6 py-12 lg:py-16">
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
                      <div className="flex flex-wrap items-center gap-2">
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
                        <ReorderButton cartId={c.id} />
                      </div>
                    </div>

                    {/* Envíos: si el pedido se divide en 2+ POs (multi-proveedor),
                        mostramos cada envío con su plazo y tracking. Si hay 1 solo PO
                        o ninguno, omitimos esta sección (UX sin cambios). */}
                    {c.purchaseOrders.length > 1 && (
                      <div className="mt-4 rounded-xl border border-accent/20 bg-accent/5 p-3">
                        <p className="text-[11px] font-medium uppercase tracking-wider text-accent-deep">
                          Este pedido viene en {c.purchaseOrders.length} envíos
                        </p>
                        <ul className="mt-2 space-y-2">
                          {c.purchaseOrders.map((po, idx) => {
                            const poUnits = po.items.reduce((s, it) => s + it.quantity, 0);
                            return (
                              <li key={po.id} className="rounded-lg bg-white px-3 py-2 text-xs">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-semibold text-ink">
                                    Envío {idx + 1}
                                    <span className="ml-2 rounded-full bg-bone-soft px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink/60">
                                      {po.status === "PENDING" ? "preparando" :
                                       po.status === "PLACED" ? "en producción" :
                                       po.status === "IN_PRODUCTION" ? "en producción" :
                                       po.status === "SHIPPED" ? "enviado" :
                                       po.status === "DELIVERED" ? "entregado ✓" :
                                       po.status.toLowerCase()}
                                    </span>
                                  </span>
                                  {po.estimatedDeliveryDate && po.status !== "DELIVERED" && (
                                    <span className="text-ink/55">
                                      llegada estimada{" "}
                                      {new Date(po.estimatedDeliveryDate).toLocaleDateString("es-ES", { day: "2-digit", month: "long" })}
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1 text-ink/60">
                                  {poUnits} uds · {po.items.length} producto{po.items.length !== 1 ? "s" : ""}
                                  {po.totalClientCents > 0 ? ` · ${EUR.format(po.totalClientCents / 100)}` : ""}
                                </p>
                                {po.trackingNumber && (
                                  <a
                                    href={po.trackingUrl || "#"}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-1 inline-block text-accent underline-offset-2 hover:underline"
                                  >
                                    📦 {po.trackingCarrier || "Envío"} · {po.trackingNumber}
                                  </a>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                        <p className="mt-2 text-[10px] text-ink/45">
                          Cada envío llega independiente para no demorar los productos listos
                          esperando a los que tardan más.
                        </p>
                      </div>
                    )}

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

          {/* ── Presupuestos comerciales ─────────────────────────────────── */}
          <div id="presupuestos" className="mt-14 scroll-mt-6">
            <h2 className="font-display text-2xl font-semibold text-ink">Tus presupuestos</h2>
            {proposals.length === 0 ? (
              <p className="mt-3 text-sm text-ink/60">
                No tienes presupuestos formales. Pídelo desde el{" "}
                <Link href="/recomendador" className="text-accent hover:underline">
                  recomendador
                </Link>{" "}
                o desde tu carrito.
              </p>
            ) : (
              <ul className="mt-5 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-bone">
                {proposals.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-mono text-sm font-semibold text-ink">{p.proposalNumber}</p>
                      <p className="text-xs text-ink/50">
                        {new Date(p.sentAt).toLocaleDateString("es-ES", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })}
                        {" · "}
                        {EUR.format(p.totalCents / 100)} IVA incl.
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span
                        className={`rounded-full px-2.5 py-0.5 uppercase tracking-wider ${
                          p.status === "accepted"
                            ? "bg-social/15 text-social"
                            : p.status === "rejected"
                              ? "bg-bone-soft text-ink/40"
                              : "bg-accent-mist text-accent-deep"
                        }`}
                      >
                        {p.status === "accepted"
                          ? "Aceptado"
                          : p.status === "rejected"
                            ? "Rechazado"
                            : p.status === "opened"
                              ? "Abierto"
                              : "Enviado"}
                      </span>
                      <a
                        href={`/api/proposal/${p.proposalNumber}/pdf?token=${encodeURIComponent(signProposalToken(p.id))}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent underline-offset-4 hover:underline"
                      >
                        📄 PDF
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Facturas ─────────────────────────────────────────────────── */}
          <div id="facturas" className="mt-14 scroll-mt-6">
            <h2 className="font-display text-2xl font-semibold text-ink">Tus facturas</h2>
            {invoices.length === 0 ? (
              <p className="mt-3 text-sm text-ink/60">
                Aún no hay facturas — aparecerán aquí con cada pago confirmado.
              </p>
            ) : (
              <ul className="mt-5 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-bone">
                {invoices.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {p.invoiceNumber ? `Factura ${p.invoiceNumber}` : "Factura (se emite al descargar)"}
                      </p>
                      <p className="text-xs text-ink/50">
                        {p.paidAt
                          ? new Date(p.paidAt).toLocaleDateString("es-ES", {
                              day: "2-digit",
                              month: "long",
                              year: "numeric",
                            })
                          : "—"}
                        {" · "}
                        {EUR.format(p.amountCents / 100)}
                      </p>
                    </div>
                    <a
                      href={`/api/clientes/invoice/${p.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-accent underline-offset-4 hover:underline"
                    >
                      🧾 Descargar PDF
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Favoritos ────────────────────────────────────────────────── */}
          <div id="favoritos" className="mt-14 scroll-mt-6">
            <h2 className="font-display text-2xl font-semibold text-ink">Tus favoritos</h2>
            {favorites.length === 0 ? (
              <p className="mt-3 text-sm text-ink/60">
                Guarda productos con el corazón ♡ de cada ficha y los tendrás aquí para tu
                próximo pedido.
              </p>
            ) : (
              <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {favorites.map((f) => (
                  <li key={f.id}>
                    <Link
                      href={`/catalogo/${f.product.slug}`}
                      className="flex items-center gap-3 rounded-2xl border border-line bg-bone p-3 hover:border-accent"
                    >
                      {f.product.primaryImageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={f.product.primaryImageUrl}
                          alt=""
                          className="h-14 w-14 rounded-xl border border-line object-cover"
                          loading="lazy"
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {f.product.name}
                        </span>
                        {(() => {
                          if (!f.product.active) {
                            return <span className="text-[11px] text-ink/45">No disponible ahora</span>;
                          }
                          const client = clientFromPriceCents(
                            f.product.fromPriceCents,
                            f.product.override,
                          );
                          return client != null ? (
                            <span className="text-[11px] text-ink/55">
                              Desde {(client / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}
                            </span>
                          ) : null;
                        })()}
                      </span>
                      <span className="text-xs text-accent">Ver →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Pedido rápido + Mis datos ────────────────────────────────── */}
          <div id="datos" className="mt-14 grid scroll-mt-6 gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-line bg-bone p-6 lg:p-8">
              <h2 className="font-display text-xl font-semibold text-ink">Pedido rápido</h2>
              <p className="mt-1 text-sm text-ink/60">
                ¿Ya sabes qué quieres? Busca por referencia o nombre y ve directo a configurarlo.
              </p>
              <div className="mt-4">
                <QuickOrder />
              </div>
            </div>
            <div className="rounded-3xl border border-line bg-bone p-6 lg:p-8">
              <h2 className="font-display text-xl font-semibold text-ink">Mis datos</h2>
              <p className="mt-1 text-sm text-ink/60">
                Contacto, CIF y direcciones — los usamos para tus facturas y envíos.
              </p>
              <div className="mt-4">
                {profile ? (
                  <ProfileForm initial={profile} />
                ) : (
                  <p className="text-sm text-ink/50">No se pudo cargar el perfil.</p>
                )}
              </div>
            </div>
          </div>

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
