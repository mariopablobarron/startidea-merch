import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { getAllAffiliateBalances } from "@/lib/affiliates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Export CSV con las comisiones pendientes de pago a afiliados.
 *
 * Caso de uso: tras un mes con cobros, Mario abre /admin/affiliates,
 * pulsa "Exportar pendientes (CSV)" y obtiene una lista con los importes
 * a transferir y los `notes` del partner (donde guarda IBAN libremente,
 * el schema no tiene campo IBAN propio aún).
 *
 * Incluye también `creditAvailable` (no es deuda en €, pero útil para
 * recordar el saldo del afiliado en sus propias compras).
 *
 * Solo CEO puede descargar — contiene info financiera + nombre/email
 * de partners externos.
 */
export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const partners = await prisma.affiliatePartner.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  const balances = await getAllAffiliateBalances();

  // Filtra a los que tienen algo pendiente (comisión > 0). Crédito
  // disponible se incluye también para los que tienen pending=0 pero
  // creditAvailable>0 (Mario quiere verlo aunque no transfiera nada).
  const rows: string[] = [];
  rows.push(
    [
      "slug",
      "name",
      "email",
      "company",
      "active",
      "commissionPct",
      "creditPct",
      "commissionPendingEUR",
      "creditAvailableEUR",
      "notes",
    ].join(","),
  );

  let included = 0;
  for (const p of partners) {
    const b = balances.get(p.id) || {
      commissionPending: 0,
      creditAvailable: 0,
    };
    if (b.commissionPending <= 0 && b.creditAvailable <= 0) continue;
    included++;
    rows.push(
      [
        csvCell(p.slug),
        csvCell(p.name),
        csvCell(p.email),
        csvCell(p.company || ""),
        p.active ? "1" : "0",
        String(p.commissionPct),
        String(p.creditPct),
        (b.commissionPending / 100).toFixed(2).replace(".", ","),
        (b.creditAvailable / 100).toFixed(2).replace(".", ","),
        csvCell((p.notes || "").replace(/\s+/g, " ").slice(0, 500)),
      ].join(","),
    );
  }

  const filename = `payouts-afiliados-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(rows.join("\n") + "\n", {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Rows-Included": String(included),
    },
  });
}

/**
 * Escapa una celda CSV según RFC 4180:
 *   - Si contiene comma, comillas o salto de línea, envuelve en "..."
 *   - Las comillas internas se duplican
 */
function csvCell(s: string): string {
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
