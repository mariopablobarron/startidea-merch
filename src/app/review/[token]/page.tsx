import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ReviewForm } from "@/components/ReviewForm";

export const metadata: Metadata = {
  title: "Tu opinión",
  robots: { index: false, follow: false },
};

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const review = await prisma.review.findUnique({
    where: { token },
    include: {
      cart: {
        select: {
          id: true,
          name: true,
          company: true,
          email: true,
          orderedAt: true,
          items: { select: { productName: true, quantity: true }, take: 5 },
        },
      },
    },
  });
  if (!review) notFound();

  const submitted = !!review.submittedAt;

  return (
    <main className="min-h-screen bg-bone-soft py-16">
      <div className="mx-auto max-w-2xl px-6">
        <div className="rounded-3xl border border-line bg-bone p-8 lg:p-10">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">Tu opinión</p>
          {submitted ? (
            <>
              <h1 className="mt-3 font-display text-3xl font-semibold text-ink">Gracias.</h1>
              <p className="mt-3 text-[15px] text-ink/75">
                Hemos recibido tu valoración. Si decidiste que sea pública y la aprobamos,
                aparecerá en la home de TodoMerchandising. Si surge algo más que comentar,
                respóndenos a este email cualquier día.
              </p>
              <Link
                href="/"
                className="mt-8 inline-block rounded-full bg-ink px-6 py-3 text-sm font-medium text-bone hover:bg-accent"
              >
                Volver a la web
              </Link>
            </>
          ) : (
            <>
              <h1 className="mt-3 font-display text-3xl font-semibold text-ink">
                {review.cart.name.split(" ")[0]}, ¿qué tal tu pedido?
              </h1>
              <p className="mt-3 text-[15px] text-ink/75">
                Pedido entregado el{" "}
                {review.cart.orderedAt
                  ? new Date(review.cart.orderedAt).toLocaleDateString("es-ES")
                  : "—"}
                . Tu valoración tarda 30 segundos y nos ayuda muchísimo.
              </p>

              {review.cart.items.length > 0 && (
                <div className="mt-6 rounded-2xl bg-bone-soft p-4">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-ink/50">Pedido</p>
                  <ul className="mt-2 text-sm text-ink/70">
                    {review.cart.items.map((it, i) => (
                      <li key={i}>
                        {it.quantity} × {it.productName}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <ReviewForm
                token={token}
                defaultName={review.cart.name}
                defaultCompany={review.cart.company || ""}
              />
            </>
          )}

          <p className="mt-8 text-center text-[11px] text-ink/40">
            STARTIDEA MALAGA SL · CIF B19583632 ·{" "}
            <Link href="/privacidad" className="hover:text-accent">Privacidad</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
