import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCustomerRequest } from "@/lib/customer-auth";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
};

/**
 * Favoritos del portal cliente.
 *
 *   GET    /api/clientes/favorites            → { ids: productId[] }
 *   POST   /api/clientes/favorites { productId }  → añade
 *   DELETE /api/clientes/favorites { productId }  → quita
 *
 * Auth: cookie de sesión del portal (magic link). El corazón de la ficha
 * usa GET para pintar el estado y POST/DELETE para alternar.
 */
export async function GET(req: Request) {
  const session = await authenticateCustomerRequest(req);
  if (!session) {
    return NextResponse.json(
      { ok: true, authenticated: false, ids: [] },
      { headers: PRIVATE_NO_STORE },
    );
  }

  const favs = await prisma.customerFavorite.findMany({
    where: { email: session.email.toLowerCase() },
    select: { productId: true },
  });
  return NextResponse.json(
    { ok: true, authenticated: true, ids: favs.map((f) => f.productId) },
    { headers: PRIVATE_NO_STORE },
  );
}

async function parseProductId(req: Request): Promise<string | null> {
  try {
    const body = (await req.json()) as { productId?: unknown };
    return typeof body.productId === "string" && body.productId ? body.productId : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const rl = rateLimit(req, { key: "favorites", max: 60, windowMs: 60_000 });
  if (!rl.ok) return rl.response;
  const session = await authenticateCustomerRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const productId = await parseProductId(req);
  if (!productId) return NextResponse.json({ error: "productId requerido" }, { status: 400 });

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  // El favorito referencia CustomerUser.email (FK): el usuario existe siempre
  // que haya sesión, pero normalizamos a minúsculas igual que el login.
  await prisma.customerFavorite.upsert({
    where: { email_productId: { email: session.email.toLowerCase(), productId } },
    create: { email: session.email.toLowerCase(), productId },
    update: {},
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await authenticateCustomerRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const productId = await parseProductId(req);
  if (!productId) return NextResponse.json({ error: "productId requerido" }, { status: 400 });

  await prisma.customerFavorite.deleteMany({
    where: { email: session.email.toLowerCase(), productId },
  });
  return NextResponse.json({ ok: true });
}
