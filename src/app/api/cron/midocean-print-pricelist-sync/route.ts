import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import {
  syncMidoceanPrintPricelist,
  syncMidoceanProductPricelist,
} from "@/lib/suppliers/midocean-pricelist-sync";
import { wrapCronHandler } from "@/lib/cron-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * Sync de tarifas MidOcean (marcaje + precio producto).
 *
 *   POST /api/cron/midocean-print-pricelist-sync   → ejecuta ambos
 *   POST ...?only=print | only=product             → uno u otro
 *   GET                                            → estado del último sync
 */
export const POST = wrapCronHandler(
  "midocean-print-pricelist-sync",
  async (req: Request) => {
    const auth = requireCronSecret(req);
    if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

    const url = new URL(req.url);
    const only = url.searchParams.get("only");

    // Async: dispara y responde 202 — puede tardar 1-3 min
    void (async () => {
      try {
        if (only !== "product") {
          const r1 = await syncMidoceanPrintPricelist();
          console.log("[midocean-print-pricelist-sync] print:", r1);
        }
        if (only !== "print") {
          const r2 = await syncMidoceanProductPricelist();
          console.log("[midocean-print-pricelist-sync] product:", r2);
        }
      } catch (e) {
        console.error("[midocean-print-pricelist-sync] failure:", e);
      }
    })();

    return NextResponse.json(
      { ok: true, status: "queued", message: "Sync iniciado en background. Consulta GET para el estado." },
      { status: 202 },
    );
  },
);

export async function GET(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { prisma } = await import("@/lib/prisma");
  const [printSync, manipulations, scaleCount, tiersCount] = await Promise.all([
    prisma.markingPricelistSync.findUnique({ where: { supplier: "midocean" } }),
    prisma.printManipulation.count(),
    prisma.markingPriceScale.count(),
    prisma.priceTier.count({ where: { source: "MIDOCEAN_PRICELIST" } }),
  ]);

  return NextResponse.json({
    ok: true,
    printSync,
    counts: {
      manipulations,
      markingScales: scaleCount,
      productTiers: tiersCount,
    },
  });
}
