import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pago cancelado",
  robots: { index: false, follow: false },
};

export default async function PayCancelPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="min-h-screen bg-bone-soft py-16">
      <div className="mx-auto max-w-2xl px-6">
        <div className="rounded-3xl border border-line bg-bone p-10 text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-accent">Pago cancelado</p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-ink">
            No te preocupes, no se ha cobrado nada.
          </h1>
          <p className="mt-3 text-ink/70">
            Has cancelado el pago en la pasarela. Tu cotización sigue activa y puedes volver a
            intentarlo cuando quieras.
          </p>
          <Link
            href={`/pay/${token}`}
            className="mt-8 inline-block rounded-full bg-ink px-6 py-3 text-sm font-medium text-bone hover:bg-accent"
          >
            Volver al pago
          </Link>
        </div>
      </div>
    </main>
  );
}
