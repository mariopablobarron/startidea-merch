import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Tu impacto · TodoMerchandising",
  description: "Dashboard de impacto social de tu empresa con TodoMerchandising.",
  robots: { index: false, follow: false },
};

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export default async function CustomerDashboardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const seed = await prisma.cartQuote.findUnique({
    where: { customerToken: token },
    select: { email: true, name: true, company: true },
  });
  if (!seed) notFound();

  const carts = await prisma.cartQuote.findMany({
    where: { email: seed.email },
    orderBy: { createdAt: "desc" },
    include: {
      items: { select: { quantity: true, productName: true, productRef: true } },
      payments: { where: { status: "PAID" }, select: { amountCents: true } },
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

  return (
    <main className="min-h-screen bg-bone-soft">
      <section className="border-b border-line bg-bone py-14 lg:py-20">
        <div className="mx-auto max-w-5xl px-6 lg:px-10">
          <p className="text-sm font-medium uppercase tracking-wider text-accent">
            Dashboard de impacto · {seed.company || seed.name}
          </p>
          <h1 className="mt-3 font-display text-section font-semibold text-ink">
            Esto es lo que has generado, {seed.name.split(" ")[0]}.
          </h1>
          <p className="mt-3 max-w-2xl text-base text-ink/70 lg:text-lg">
            Datos verificables agregados de tus pedidos confirmados. Listos para tu memoria de
            sostenibilidad o reporte interno.
          </p>
        </div>
      </section>

      <section className="bg-ink py-16 text-bone lg:py-20">
        <div className="mx-auto max-w-5xl px-6 lg:px-10">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Pedidos cerrados"
              value={ordered.length.toString()}
              sub={`${carts.length} cotizaciones totales`}
            />
            <Stat label="Productos producidos" value={totalItems.toLocaleString("es-ES")} />
            <Stat
              label="Invertido en CEE"
              value={EUR.format(eurInvestedInCEE / 100)}
              sub="estimación 40% del total"
            />
            <Stat
              label="CO₂ ahorrado"
              value={`${co2SavedKg.toLocaleString("es-ES")} kg`}
              sub="vs. fabricación en Asia"
            />
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-20">
        <div className="mx-auto max-w-5xl px-6 lg:px-10">
          <h2 className="font-display text-2xl font-semibold text-ink">Histórico de pedidos</h2>
          {carts.length === 0 ? (
            <p className="mt-4 text-ink/60">Aún no hay actividad.</p>
          ) : (
            <ul className="mt-6 space-y-3">
              {carts.map((c) => (
                <li key={c.id} className="rounded-2xl border border-line bg-bone p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-display text-base font-semibold text-ink">
                      {new Date(c.createdAt).toLocaleDateString("es-ES", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] uppercase tracking-wider ${
                      c.status === "ORDERED"
                        ? "bg-social/15 text-social"
                        : c.status === "CONFIRMED"
                          ? "bg-accent-mist text-accent-deep"
                          : "bg-bone-soft text-ink/60"
                    }`}>
                      {c.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-ink/70">
                    {c.items.length} producto{c.items.length === 1 ? "" : "s"} · {c.items.reduce((s, it) => s + it.quantity, 0).toLocaleString("es-ES")} unidades
                  </p>
                  <ul className="mt-3 space-y-1 text-xs text-ink/60">
                    {c.items.slice(0, 5).map((it, i) => (
                      <li key={i}>
                        {it.quantity} × {it.productName} <span className="font-mono text-[10px]">({it.productRef})</span>
                      </li>
                    ))}
                    {c.items.length > 5 && <li>… y {c.items.length - 5} más</li>}
                  </ul>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-12 rounded-3xl border border-line bg-bone p-7 lg:p-8">
            <h3 className="font-display text-xl font-semibold text-ink">¿Necesitas un nuevo pedido?</h3>
            <p className="mt-2 text-[15px] text-ink/75">
              Vuelve al catálogo y configura otro carrito. Si quieres un certificado oficial
              para incluir en tu memoria GRI o EFRAG, escríbenos y lo emitimos en 48 h.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/catalogo"
                className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bone hover:bg-accent"
              >
                Volver al catálogo
              </Link>
              <a
                href={`mailto:pedidos@startidea.es?subject=Certificado%20RSC%20${encodeURIComponent(seed.company || seed.name)}`}
                className="rounded-full border border-line bg-bone-soft px-5 py-2.5 text-sm font-medium hover:border-accent"
              >
                Pedir certificado RSC
              </a>
            </div>
          </div>

          <p className="mt-8 text-center text-[11px] text-ink/40">
            STARTIDEA MALAGA SL · CIF B19583632 · Datos auditables a petición ·{" "}
            <Link href="/privacidad" className="hover:text-accent">Privacidad</Link>
          </p>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="font-display text-5xl font-semibold tabular-nums text-bone">{value}</p>
      <p className="mt-3 text-sm font-medium uppercase tracking-wider text-accent-light">{label}</p>
      {sub && <p className="mt-1 text-xs text-bone/50">{sub}</p>}
    </div>
  );
}
