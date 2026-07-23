import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signCustomerSession, customerCookieValue } from "@/lib/customer-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

/** GET con token de magic link → setea cookie y redirige al portal. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await prisma.customerUser.findFirst({
    where: { magicLinkToken: token },
  });
  if (!user || !user.magicLinkExpiresAt || user.magicLinkExpiresAt < new Date()) {
    return NextResponse.redirect(`${SITE_URL}/clientes/login?error=expired`);
  }

  await prisma.customerUser.update({
    where: { id: user.id },
    data: {
      magicLinkToken: null,
      magicLinkExpiresAt: null,
      lastLoginAt: new Date(),
    },
  });

  const jwt = await signCustomerSession({
    userId: user.id,
    email: user.email,
    name: user.name,
  });

  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: `${SITE_URL}/clientes`,
      "Set-Cookie": customerCookieValue(jwt),
    },
  });
}
