import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PaySuccessClient } from "./PaySuccessClient";

export const metadata: Metadata = {
  title: "Pago confirmado",
  robots: { index: false, follow: false },
};

export default async function PaySuccessPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Cargamos el cart para pasarle valor + orderId al cliente para el
  // evento Purchase del pixel. Si el webhook ya marcó CONFIRMED, esto
  // ya estará up-to-date.
  const cart = await prisma.cartQuote.findUnique({
    where: { paymentLinkToken: token },
    include: {
      payments: { where: { status: "PAID" }, orderBy: { paidAt: "desc" }, take: 1 },
      items: { select: { quantity: true } },
    },
  });

  if (!cart) notFound();

  const payment = cart.payments[0];
  const totalEur = payment ? payment.amountCents / 100 : 0;
  const numItems = cart.items.reduce((s, it) => s + it.quantity, 0);

  return (
    <PaySuccessClient
      token={token}
      orderId={cart.id}
      totalEur={totalEur}
      numItems={numItems}
      customerName={cart.name}
    />
  );
}
