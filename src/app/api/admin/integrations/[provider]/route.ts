import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { testMetricoolConnection, type MetricoolConfig } from "@/lib/metricool";
import { testMagnificConnection, type MagnificConfig } from "@/lib/magnific";
import { testReplicateConnection, type ReplicateConfig } from "@/lib/replicate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDERS = [
  "METRICOOL",
  "MAGNIFIC",
  "REPLICATE",
  "META_ADS",
  "GOOGLE_ADS",
  "LINKEDIN_ADS",
  "RESEND",
  "STRIPE",
] as const;

const Schema = z.object({
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") {
    return NextResponse.json({ error: "Solo CEO" }, { status: 403 });
  }

  const { provider } = await params;
  if (!PROVIDERS.includes(provider as never)) {
    return NextResponse.json({ error: "Provider inválido" }, { status: 400 });
  }

  const row = await prisma.integrationConfig.findUnique({
    where: { provider: provider as never },
  });
  return NextResponse.json({ ok: true, config: row });
}

export async function PUT(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") {
    return NextResponse.json({ error: "Solo CEO" }, { status: 403 });
  }

  const { provider } = await params;
  if (!PROVIDERS.includes(provider as never)) {
    return NextResponse.json({ error: "Provider inválido" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const updated = await prisma.integrationConfig.upsert({
    where: { provider: provider as never },
    update: {
      ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
      ...(parsed.data.config !== undefined
        ? { config: parsed.data.config as object }
        : {}),
      updatedBy: session.email,
    },
    create: {
      provider: provider as never,
      enabled: parsed.data.enabled ?? false,
      config: (parsed.data.config || {}) as object,
      updatedBy: session.email,
    },
  });

  return NextResponse.json({ ok: true, config: updated });
}

/**
 * POST /api/admin/integrations/[provider]?action=test
 * Prueba la conexión real con el provider con la config guardada.
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") {
    return NextResponse.json({ error: "Solo CEO" }, { status: 403 });
  }

  const { provider } = await params;
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (action !== "test") {
    return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
  }

  const row = await prisma.integrationConfig.findUnique({
    where: { provider: provider as never },
  });
  if (!row) return NextResponse.json({ error: "Config no encontrada" }, { status: 404 });

  let result: { ok: true; data?: unknown } | { ok: false; error: string };

  if (provider === "METRICOOL") {
    const cfg = row.config as Partial<MetricoolConfig>;
    if (!cfg.apiKey || !cfg.userId || !cfg.blogId) {
      result = { ok: false, error: "Faltan apiKey, userId o blogId" };
    } else {
      const test = await testMetricoolConnection({
        apiKey: cfg.apiKey,
        userId: cfg.userId,
        blogId: cfg.blogId,
        accounts: cfg.accounts || {},
      });
      result = test.ok ? { ok: true, data: { brands: test.brands } } : { ok: false, error: test.error };
    }
  } else if (provider === "MAGNIFIC") {
    const cfg = row.config as Partial<MagnificConfig>;
    if (!cfg.apiKey) {
      result = { ok: false, error: "Falta apiKey" };
    } else {
      const test = await testMagnificConnection({ apiKey: cfg.apiKey });
      result = test.ok ? { ok: true, data: { message: "Auth OK" } } : { ok: false, error: test.error };
    }
  } else if (provider === "REPLICATE") {
    const cfg = row.config as Partial<ReplicateConfig>;
    if (!cfg.apiToken) {
      result = { ok: false, error: "Falta apiToken" };
    } else {
      const test = await testReplicateConnection({ apiToken: cfg.apiToken });
      result = test.ok
        ? { ok: true, data: { message: "Auth OK", username: test.username } }
        : { ok: false, error: test.error };
    }
  } else {
    result = { ok: false, error: `Test no implementado para ${provider}` };
  }

  await prisma.integrationConfig.update({
    where: { provider: provider as never },
    data: {
      lastTestAt: new Date(),
      lastTestOk: result.ok,
      lastError: result.ok ? null : result.error.slice(0, 1000),
    },
  });

  return NextResponse.json(result);
}
