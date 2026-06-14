import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSuppressed } from "@/lib/outbound-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INGEST_SECRET = process.env.CRM_INGEST_SECRET;

/**
 * POST /api/crm/ingest  — ingesta de contactos desde sistemas externos
 * (hub coworking, formularios web, Zapier…) hacia el CRM central.
 *
 * Auth: header `X-CRM-Secret` = CRM_INGEST_SECRET (server-to-server).
 * Body: { email (req), name?, company?, phone?, source?, tags?: string[],
 *         kind?: "newsletter" | "outbound" }  (default "newsletter")
 *
 * - Respeta la lista de supresión (no reingresa a quien pidió baja).
 * - Newsletter: upsert por email, fusiona tags (sin duplicados).
 * - Outbound: crea OutboundLead si el email no existe ya.
 * Idempotente y deduplicado.
 */
const EMAIL = /^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/;

export async function POST(req: Request) {
  if (!INGEST_SECRET) {
    return NextResponse.json({ error: "CRM_INGEST_SECRET no configurado" }, { status: 503 });
  }
  if (req.headers.get("x-crm-secret") !== INGEST_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    name?: string;
    company?: string;
    phone?: string;
    source?: string;
    tags?: unknown;
    kind?: string;
  };

  const email = (body.email || "").toLowerCase().trim();
  if (!EMAIL.test(email)) {
    return NextResponse.json({ error: "email inválido" }, { status: 400 });
  }
  if (await isSuppressed(email)) {
    return NextResponse.json({ ok: true, action: "suppressed" });
  }

  const name = (body.name || "").trim().slice(0, 160) || null;
  const company = (body.company || "").trim().slice(0, 160) || null;
  const phone = (body.phone || "").trim().slice(0, 40) || null;
  const source = (body.source || "api").trim().slice(0, 80);
  const tags = Array.isArray(body.tags)
    ? body.tags.map((t) => String(t).trim().slice(0, 60)).filter(Boolean).slice(0, 20)
    : [];
  const kind = body.kind === "outbound" ? "outbound" : "newsletter";

  if (kind === "outbound") {
    const exists = await prisma.outboundLead.findFirst({ where: { email }, select: { id: true } });
    if (exists) return NextResponse.json({ ok: true, action: "exists", kind });
    await prisma.outboundLead.create({
      data: {
        name: name || company || "—",
        company,
        email,
        phone,
        segment: tags[0] || null,
        source,
        legalBasis: "interes-legitimo-b2b",
      },
    });
    return NextResponse.json({ ok: true, action: "created", kind });
  }

  // newsletter
  const sub = await prisma.newsletterSubscriber.findUnique({
    where: { email },
    select: { id: true, tags: true },
  });
  if (sub) {
    const merged = Array.from(new Set([...sub.tags, ...tags]));
    await prisma.newsletterSubscriber.update({
      where: { email },
      data: { tags: merged, ...(name ? { name } : {}), ...(company ? { company } : {}) },
    });
    return NextResponse.json({ ok: true, action: "merged", kind });
  }
  await prisma.newsletterSubscriber.create({
    data: {
      email,
      name,
      company,
      phone,
      source,
      tags,
      unsubscribeToken: `ub${randomBytes(16).toString("hex")}`,
    },
  });
  return NextResponse.json({ ok: true, action: "created", kind });
}
