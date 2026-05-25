import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/newsletter/export?tag=lista-X&status=subscribed
 *
 * Export CSV de subscribers filtrados (mismos filtros que el listado).
 * Devuelve `text/csv` con cabeceras email,name,company,phone,tags,source,
 * optedInAt,unsubscribedAt,totalSent. UTF-8 BOM para que Excel detecte
 * acentos correctamente.
 */
export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const tag = (url.searchParams.get("tag") || "").trim();
  const status = url.searchParams.get("status") || "subscribed";

  const where: Record<string, unknown> = {};
  if (status === "subscribed") where.unsubscribedAt = null;
  else if (status === "unsubscribed") where.unsubscribedAt = { not: null };
  if (tag) where.tags = { has: tag };
  if (q) {
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { company: { contains: q, mode: "insensitive" } },
    ];
  }

  const subs = await prisma.newsletterSubscriber.findMany({
    where,
    orderBy: { optedInAt: "desc" },
    select: {
      email: true,
      name: true,
      company: true,
      phone: true,
      tags: true,
      source: true,
      optedInAt: true,
      unsubscribedAt: true,
      totalSent: true,
    },
  });

  // CSV: BOM + cabecera + filas con escape de comas, comillas y saltos de línea
  const escape = (v: unknown): string => {
    if (v == null) return "";
    const s = Array.isArray(v) ? v.join("|") : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const rows = [
    "email,name,company,phone,tags,source,optedInAt,unsubscribedAt,totalSent",
    ...subs.map((s) =>
      [
        s.email,
        s.name,
        s.company,
        s.phone,
        s.tags,
        s.source,
        s.optedInAt.toISOString(),
        s.unsubscribedAt?.toISOString() || "",
        s.totalSent,
      ]
        .map(escape)
        .join(","),
    ),
  ];
  const csv = "﻿" + rows.join("\n");

  // Filename con timestamp + tag si hay
  const filename = `subscribers${tag ? `-${tag}` : ""}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
