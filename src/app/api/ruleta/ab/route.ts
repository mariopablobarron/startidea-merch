import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Slug del experimento que decide qué popup de entrada se muestra. */
export const ENTRY_POPUP_SLUG = "home.entry_popup";

/**
 * GET — devuelve el id del experimento del popup de entrada si está activo,
 * o null. El cliente (EntryPopupAB) lo usa para registrar view/conversion.
 * Si no hay experimento activo, no hay A/B → se muestra la ruleta por defecto.
 */
export async function GET() {
  try {
    const exp = await prisma.experiment.findUnique({ where: { slug: ENTRY_POPUP_SLUG } });
    if (!exp || !exp.active) return NextResponse.json({ experimentId: null });
    return NextResponse.json({ experimentId: exp.id });
  } catch {
    return NextResponse.json({ experimentId: null });
  }
}
