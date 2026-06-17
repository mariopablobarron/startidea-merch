import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { proxyImageUrl } from "@/lib/proxy-image";
import { ExpressCheckoutPay } from "@/components/ExpressCheckoutPay";
import { withIva, ivaPart } from "@/lib/iva";

export const metadata: Metadata = {
  title: "Pago seguro · TodoMerchandising",
  description: "Pago online seguro de tu cotización. Procesado por Stripe.",
  robots: { index: false, follow: false },
};

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cart = await prisma.cartQuote.findUnique({
    where: { paymentLinkToken: token },
    include: {
      items: {
        select: {
          productName: true,
          productRef: true,
          quantity: true,
          primaryImageUrl: true,
          markingTechniqueName: true,
          markingPositionId: true,
          totalClientCents: true,
        },
      },
      payments: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!cart) notFound();
  if (!cart.acceptedTotalCents || !cart.depositPercent) notFound();

  const depositCents = Math.round((cart.acceptedTotalCents * cart.depositPercent) / 100);
  const successfulPayment = cart.payments.find((p) => p.status === "PAID");
  const expired =
    !successfulPayment &&
    cart.paymentLinkExpiresAt != null &&
    new Date(cart.paymentLinkExpiresAt) < new Date();
  const expiresLabel = cart.paymentLinkExpiresAt
    ? new Date(cart.paymentLinkExpiresAt).toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <main className="min-h-screen bg-bone-soft py-16">
      <div className="mx-auto max-w-3xl px-6">
        <div className="rounded-3xl border border-line bg-bone p-8 lg:p-10">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">Pago seguro</p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-ink">
            Hola {cart.name.split(" ")[0]}, tu cotización está lista.
          </h1>
          <p className="mt-3 text-ink/70">
            Hemos cerrado el presupuesto y estos son los importes.
          </p>

          {/* Totales — precios base + IVA 21% (decisión Mario 2026-06-17) */}
          <div className="mt-8 rounded-2xl border border-line bg-bone-soft p-6">
            <div className="flex items-baseline justify-between">
              <p className="text-sm text-ink/70">Subtotal (sin IVA)</p>
              <p className="tabular-nums text-ink/80">{EUR.format(cart.acceptedTotalCents / 100)}</p>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <p className="text-sm text-ink/70">IVA 21%</p>
              <p className="tabular-nums text-ink/80">{EUR.format(ivaPart(cart.acceptedTotalCents) / 100)}</p>
            </div>
            <div className="mt-2 flex items-baseline justify-between border-t border-line pt-2">
              <p className="text-sm font-medium text-ink">Total con IVA</p>
              <p className="font-display text-xl font-semibold tabular-nums text-ink">
                {EUR.format(withIva(cart.acceptedTotalCents) / 100)}
              </p>
            </div>
            <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
              <p className="text-sm text-ink/70">Depósito a pagar ahora ({cart.depositPercent}%, IVA incl.)</p>
              <p className="font-display text-3xl font-semibold tabular-nums text-accent">
                {EUR.format(withIva(depositCents) / 100)}
              </p>
            </div>
            {cart.depositPercent < 100 && (
              <p className="mt-3 text-xs text-ink/50">
                El {100 - cart.depositPercent}% restante ({EUR.format(withIva(cart.acceptedTotalCents - depositCents) / 100)}, IVA incl.) se cobrará antes del envío.
              </p>
            )}
          </div>

          {/* Items */}
          <div className="mt-8">
            <p className="text-xs font-medium uppercase tracking-wider text-ink/50">Productos del pedido</p>
            <ul className="mt-3 space-y-2">
              {cart.items.map((it, i) => (
                <li key={i} className="flex items-center gap-3 rounded-xl bg-bone-soft p-3 text-sm">
                  {proxyImageUrl(it.primaryImageUrl) && (
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-bone">
                      <Image src={proxyImageUrl(it.primaryImageUrl)!} alt="" fill sizes="48px" className="object-contain p-1" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{it.productName}</p>
                    <p className="text-xs text-ink/60">
                      {it.quantity} uds
                      {it.markingTechniqueName ? ` · ${it.markingTechniqueName} en ${it.markingPositionId}` : ""}
                    </p>
                  </div>
                  <p className="font-medium tabular-nums">
                    {it.totalClientCents != null ? EUR.format(it.totalClientCents / 100) : "—"}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          {/* Acción */}
          <div className="mt-10 border-t border-line pt-8">
            {successfulPayment ? (
              <div className="rounded-2xl bg-social/10 p-6 text-center">
                <p className="font-display text-xl font-semibold text-ink">✓ Pago recibido</p>
                <p className="mt-2 text-sm text-ink/70">
                  Hemos recibido tu pago de {EUR.format(successfulPayment.amountCents / 100)} el{" "}
                  {successfulPayment.paidAt
                    ? new Date(successfulPayment.paidAt).toLocaleString("es-ES")
                    : ""}
                  . Pasamos producción a marcha y te avisaremos por email.
                </p>
                {successfulPayment.stripeReceiptUrl && (
                  <a
                    href={successfulPayment.stripeReceiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-block text-xs text-accent underline-offset-4 hover:underline"
                  >
                    Descargar recibo →
                  </a>
                )}
              </div>
            ) : expired ? (
              <div className="rounded-2xl bg-accent-wash p-6 text-center">
                <p className="font-display text-xl font-semibold text-ink">Este enlace ha caducado</p>
                <p className="mt-2 text-sm text-ink/70">
                  El precio de esta cotización era válido hasta el {expiresLabel}. Escríbenos y te
                  renovamos el presupuesto en un momento.
                </p>
                <a
                  href="mailto:pedidos@startidea.es"
                  className="mt-4 inline-block rounded-full bg-ink px-5 py-2 text-xs font-semibold text-bone hover:bg-accent"
                >
                  Solicitar nuevo presupuesto
                </a>
              </div>
            ) : (
              <>
                <ExpressCheckoutPay token={token} amountCents={withIva(depositCents)} />
                {expiresLabel && (
                  <p className="mt-3 text-center text-[11px] text-ink/50">
                    Este precio es válido hasta el {expiresLabel}.
                  </p>
                )}
              </>
            )}
          </div>

          <p className="mt-8 text-center text-[11px] text-ink/40">
            Pago procesado por Stripe. SSL verificado. Puedes pagar con tarjeta, Apple Pay,
            Google Pay y Bizum.
            <br />
            STARTIDEA MALAGA SL · CIF B19583632 ·{" "}
            <Link href="/aviso-legal" className="hover:text-accent">Aviso legal</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
