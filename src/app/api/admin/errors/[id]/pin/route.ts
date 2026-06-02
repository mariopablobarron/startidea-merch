/**
 * POST   /api/admin/errors/[id]/pin    body: { note?: string }
 * DELETE /api/admin/errors/[id]/pin
 *
 * Convertir un ErrorEvent en sugerencia (pin) o quitarlo (unpin).
 * Pinned errors aparecen en /admin/insights#sugerencias hasta resolverlos.
 */
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { pinError, unpinError } from "@/lib/insights/pinned-errors";
import { messageSignature } from "@/lib/insights/error-signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  const { id } = await params;
  let body: { note?: string } = {};
  try {
    body = await req.json();
  } catch {
    // body opcional
  }
  const error = await prisma.errorEvent.findUnique({
    where: { id },
    select: { id: true, message: true, context: true, resolved: true },
  });
  if (!error) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (error.resolved) {
    return NextResponse.json(
      {
        error: "CANNOT_PIN_RESOLVED",
        message: "Reabre el error antes de convertirlo en sugerencia.",
      },
      { status: 400 },
    );
  }
  const pins = await pinError({
    errorId: error.id,
    signature: messageSignature(error.message),
    context: error.context,
    message: error.message.slice(0, 280),
    note: body.note?.slice(0, 280),
  });
  return NextResponse.json({ ok: true, pinned: true, total: pins.length });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  const { id } = await params;
  const pins = await unpinError(id);
  return NextResponse.json({ ok: true, pinned: false, total: pins.length });
}
