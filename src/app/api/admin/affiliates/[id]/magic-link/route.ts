import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { signAffiliateMagicToken } from "@/lib/affiliate-magic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/affiliates/[id]/magic-link
 *
 * Genera URL absoluta `<SITE_URL>/afiliado/<token>` con JWT 30d.
 * Mario copia y manda el link al afiliado para que vea su saldo + ledger
 * en read-only.
 *
 * No persiste el token — al ser stateless (JWT) caduca solo. Si Mario
 * quiere revocar antes, rota AFFILIATE_JWT_SECRET (rompe TODOS los links).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const { id } = await params;
  const partner = await prisma.affiliatePartner.findUnique({
    where: { id },
    select: { id: true, name: true, active: true },
  });
  if (!partner) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (!partner.active) {
    return NextResponse.json(
      { error: "Afiliado pausado: actívalo antes de generar el link" },
      { status: 400 },
    );
  }

  let token: string;
  try {
    token = await signAffiliateMagicToken(partner.id, "30d");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Secret no configurado" },
      { status: 500 },
    );
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";
  const url = `${base.replace(/\/$/, "")}/afiliado/${token}`;
  return NextResponse.json({ ok: true, url, expiresInDays: 30 });
}
