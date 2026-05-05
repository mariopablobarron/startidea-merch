import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ProofActions } from "@/components/ProofActions";

export const metadata: Metadata = {
  title: "Aprobar mockup",
  description: "Revisa el mockup de tu pedido y apruébalo, rechaza con un motivo o sube un artwork distinto.",
  robots: { index: false, follow: false },
};

export default async function ProofPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const proof = await prisma.orderProof.findUnique({
    where: { token },
    include: {
      cart: {
        select: {
          name: true,
          email: true,
          company: true,
          items: {
            select: { productName: true, productRef: true, quantity: true, primaryImageUrl: true, markingTechniqueName: true, markingPositionId: true },
            take: 5,
          },
        },
      },
    },
  });

  if (!proof) notFound();

  return (
    <main className="min-h-screen bg-bone-soft py-16">
      <div className="mx-auto max-w-3xl px-6">
        <div className="rounded-3xl border border-line bg-bone p-8 lg:p-10">
          <p className="text-sm font-medium uppercase tracking-wider text-accent">Aprobar mockup</p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-ink">
            Revisa cómo va a quedar tu pedido.
          </h1>
          <p className="mt-3 text-ink/70">
            Hola {proof.cart.name.split(" ")[0]}, este es el mockup que te enviamos para tu confirmación. Revisa los detalles abajo y elige una opción.
          </p>

          {proof.artworkUrl && (
            <div className="relative mt-8 aspect-[4/3] overflow-hidden rounded-2xl border border-line bg-bone-soft">
              <Image
                src={proof.artworkUrl}
                alt="Mockup del pedido"
                fill
                sizes="(max-width:768px) 100vw, 720px"
                className="object-contain p-4"
              />
            </div>
          )}

          {proof.notes && (
            <div className="mt-6 rounded-2xl bg-bone-soft p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-ink/50">Notas del equipo</p>
              <p className="mt-2 whitespace-pre-line text-sm text-ink/80">{proof.notes}</p>
            </div>
          )}

          {/* Items del pedido (resumen) */}
          {proof.cart.items.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-medium uppercase tracking-wider text-ink/50">Pedido</p>
              <ul className="mt-3 space-y-2 text-sm">
                {proof.cart.items.map((it, i) => (
                  <li key={i} className="flex items-start gap-3 rounded-xl bg-bone-soft p-3">
                    {it.primaryImageUrl && (
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-bone">
                        <Image src={it.primaryImageUrl} alt="" fill sizes="48px" className="object-contain p-1" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{it.productName}</p>
                      <p className="text-xs text-ink/60">
                        {it.quantity} uds
                        {it.markingTechniqueName ? ` · ${it.markingTechniqueName} en ${it.markingPositionId}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Acciones */}
          <div className="mt-8 border-t border-line pt-8">
            {proof.status === "PENDING" ? (
              <ProofActions token={token} clientEmail={proof.cart.email} />
            ) : (
              <div className={`rounded-2xl p-6 text-center ${
                proof.status === "APPROVED"
                  ? "bg-social/10"
                  : proof.status === "REJECTED" || proof.status === "EXPIRED"
                    ? "bg-accent-wash"
                    : "bg-bone-soft"
              }`}>
                <p className="font-display text-xl font-semibold text-ink">
                  {proof.status === "APPROVED" && "✓ Aprobado"}
                  {proof.status === "REJECTED" && "✗ Rechazado"}
                  {proof.status === "REVISION" && "Pendiente de revisión"}
                  {proof.status === "EXPIRED" && "Expirado"}
                </p>
                <p className="mt-2 text-sm text-ink/60">
                  Decisión tomada el{" "}
                  {proof.decidedAt
                    ? new Date(proof.decidedAt).toLocaleString("es-ES")
                    : "—"}
                  {proof.decidedBy ? ` por ${proof.decidedBy}` : ""}.
                </p>
                {proof.rejectionReason && (
                  <p className="mt-3 rounded-lg bg-bone p-3 text-left text-sm">
                    <strong>Motivo:</strong> {proof.rejectionReason}
                  </p>
                )}
              </div>
            )}
          </div>

          <p className="mt-8 text-center text-xs text-ink/40">
            STARTIDEA MALAGA SL · CIF B19583632 · {" "}
            <Link href="/aviso-legal" className="hover:text-accent">Aviso legal</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
