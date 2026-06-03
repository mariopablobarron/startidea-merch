import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { runMakitoMarkingEnrich } from "@/lib/suppliers/makito-marking-enrich";
import { wrapCronHandler } from "@/lib/cron-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

/**
 * Enriquece MarkingPositions Makito con datos REALES del API
 * (reemplaza las DEFAULT virtuales).
 *
 *   POST /api/cron/makito-marking-enrich?limit=10  → modo test
 *   POST /api/cron/makito-marking-enrich            → todos
 */
export const POST = wrapCronHandler("makito-marking-enrich", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const url = new URL(req.url);
  const limitStr = url.searchParams.get("limit");
  const limit = limitStr ? parseInt(limitStr, 10) : undefined;
  const concurrencyStr = url.searchParams.get("concurrency");
  const concurrency = concurrencyStr ? parseInt(concurrencyStr, 10) : undefined;

  // fire-and-forget · response inmediato
  const promise = runMakitoMarkingEnrich({ limit, concurrency });

  // Si hay limit pequeño (<=20) esperamos sincrono para devolver stats
  if (limit && limit <= 20) {
    const result = await promise;
    return NextResponse.json({ ok: true, result });
  }

  void promise.catch((e) => console.error("[makito-marking-enrich]", e));
  return NextResponse.json(
    {
      ok: true,
      status: "queued",
      message: "Enrich corriendo en background. Tarda ~5-10 min para 4 432 prods.",
    },
    { status: 202 },
  );
});
