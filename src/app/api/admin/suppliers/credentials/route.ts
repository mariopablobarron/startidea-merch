import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { setSupplierConfig, recordCredentialTest } from "@/lib/supplier-credentials";
import { ping as pingCifra } from "@/lib/suppliers/cifra";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fase C del módulo Proveedores — credenciales cifradas en BD.
 *
 * GET  → SOLO metadatos (configKeys, lastTest*) — NUNCA los valores. Ver el
 *        secret ya guardado no es un caso de uso: se rota, no se relee.
 * PATCH → cifra y guarda el config completo (reemplaza el anterior entero,
 *          no hace merge parcial — evita dejar una key vieja huérfana).
 * POST /test → solo implementado para Cifra por ahora (proveedor de
 *          referencia de esta fase); Makito/MidOcean siguen en .env.
 */
const ALL_CODES = ["midocean", "makito", "cifra", "adivin"] as const;

export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const rows = await prisma.supplierCredential.findMany({
    select: { code: true, configKeys: true, lastTestAt: true, lastTestOk: true, lastTestError: true, updatedAt: true },
  });
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const items = ALL_CODES.map((code) => ({
    code,
    hasStoredCredential: byCode.has(code),
    configKeys: byCode.get(code)?.configKeys ?? [],
    lastTestAt: byCode.get(code)?.lastTestAt ?? null,
    lastTestOk: byCode.get(code)?.lastTestOk ?? null,
    lastTestError: byCode.get(code)?.lastTestError ?? null,
    updatedAt: byCode.get(code)?.updatedAt ?? null,
  }));
  return NextResponse.json({ ok: true, items });
}

const PatchSchema = z.object({
  code: z.enum(ALL_CODES),
  // Objeto plano key→value; las keys dependen del proveedor (ej. Cifra:
  // {token}). No se valida el shape aquí — cada cliente de proveedor decide
  // qué keys lee vía resolveCredentialField.
  config: z.record(z.string(), z.string().max(500)),
});

export async function PATCH(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const { code, config } = parsed.data;
  // Todas las keys vacías → equivale a "sin credencial en BD", cae a .env.
  const nonEmpty = Object.fromEntries(Object.entries(config).filter(([, v]) => v.trim().length > 0));
  if (Object.keys(nonEmpty).length === 0) {
    await prisma.supplierCredential.deleteMany({ where: { code } });
    return NextResponse.json({ ok: true, cleared: true });
  }
  await setSupplierConfig(code, nonEmpty, session.email);
  return NextResponse.json({ ok: true });
}

/** POST /api/admin/suppliers/credentials/test?code=cifra */
export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const code = new URL(req.url).searchParams.get("code");
  if (code !== "cifra") {
    return NextResponse.json(
      { error: "Test de credencial en BD solo implementado para Cifra por ahora." },
      { status: 400 },
    );
  }
  const result = await pingCifra();
  await recordCredentialTest("cifra", result.ok, result.ok ? null : result.reason);
  return NextResponse.json({ ok: result.ok, ...(result.ok ? {} : { reason: result.reason }) });
}
