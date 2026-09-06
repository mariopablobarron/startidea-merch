import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession, requireRole } from "@/lib/admin-auth";
import { crearPresupuesto } from "@/lib/presupuesto-repo";
import { leerMargenes } from "@/lib/presupuesto-margenes";
import { entradaDesdeSolicitud } from "@/lib/presupuesto-desde-carrito";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Crea un presupuesto en borrador a partir de una solicitud de cotización.
 *
 * A diferencia del carrito, aquí no hay productos elegidos: hay un texto libre
 * y, con suerte, una cantidad y una pista de producto. Así que esto no cotiza
 * nada — deja el cliente puesto y una partida abierta con el título que el
 * cliente dio, para rellenarla con el buscador del catálogo. Que es
 * exactamente el trabajo que se ahorraba a mano.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, "COMERCIAL");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await ctx.params;
  const solicitud = await prisma.quoteRequest.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      company: true,
      email: true,
      productHint: true,
      quantity: true,
    },
  });
  if (!solicitud) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });

  const margenes = await leerMargenes();
  const sesion = await getAdminSession().catch(() => null);
  const creado = await crearPresupuesto(
    entradaDesdeSolicitud(solicitud, margenes.pordefecto),
    sesion?.email ?? null,
  );

  // Rastro en la solicitud, no en el documento. Si la nota falla, el
  // presupuesto ya está creado y devolverlo es más útil que reventar.
  await prisma.quoteNote
    .create({
      data: {
        requestId: solicitud.id,
        author: sesion?.email ?? "sistema",
        body: `Presupuesto ${creado.numero} creado desde esta solicitud.`,
      },
    })
    .catch(() => undefined);

  return NextResponse.json({ id: creado.id, numero: creado.numero }, { status: 201 });
}
