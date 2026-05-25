import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/newsletter/imports
 * Historial de batches de importación con stats.
 */
export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const imports = await prisma.newsletterImport.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      filename: true,
      importedBy: true,
      tag: true,
      totalRows: true,
      insertedRows: true,
      updatedRows: true,
      skippedRows: true,
      createdAt: true,
      errorsJson: true,
    },
  });

  return NextResponse.json({ ok: true, imports });
}
