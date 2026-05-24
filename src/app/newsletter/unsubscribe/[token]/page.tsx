import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Baja de newsletter",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sub = await prisma.newsletterSubscriber.findUnique({ where: { unsubscribeToken: token } });
  if (!sub) notFound();

  if (!sub.unsubscribedAt) {
    await prisma.newsletterSubscriber.update({
      where: { id: sub.id },
      data: { unsubscribedAt: new Date() },
    });
  }

  return (
    <main className="min-h-screen bg-bone-soft py-16">
      <div className="mx-auto max-w-xl px-6 text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">Baja confirmada</p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-ink">
          {sub.email} ya no recibirá emails.
        </h1>
        <p className="mt-3 text-ink/70">
          Si fue un error, vuelve a suscribirte desde la home cuando quieras. Sin rencores.
        </p>
        <Link href="/" className="mt-6 inline-block rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bone hover:bg-accent">
          Volver a la web
        </Link>
      </div>
    </main>
  );
}
