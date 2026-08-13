import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey, requireScope } from "@/lib/api-auth";
import { toPublicQuoteView } from "@/lib/public-quote-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/quotes/{id} — estado de una cotización creada por API. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth = await authenticateApiKey(req);
  auth = requireScope(auth, "read:quote");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const cart = await prisma.cartQuote.findUnique({
    where: { id },
    select: {
      id: true,
      createdAt: true,
      status: true,
      acceptedTotalCents: true,
      depositPercent: true,
      paymentLinkToken: true,
      midoceanOrderId: true,
      midoceanOrderStatus: true,
      orderedAt: true,
      confirmedAt: true,
      items: {
        select: {
          productRef: true,
          productName: true,
          quantity: true,
          markingTechniqueName: true,
          markingPositionId: true,
          markingColours: true,
          unitPriceClientCents: true,
          totalClientCents: true,
        },
      },
      payments: { where: { status: "PAID" }, select: { amountCents: true, paidAt: true } },
    },
  });
  if (!cart) return NextResponse.json({ error: "Quote no encontrada" }, { status: 404 });

  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

  return NextResponse.json(toPublicQuoteView(cart, SITE_URL));
}
