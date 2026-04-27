import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { runMidoceanSync } from "@/lib/suppliers/midocean-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600; // 10 min — sync entero puede tardar 5–8 min

/**
 * Sync MidOcean. Disparado por cron-job.org cada noche.
 *   POST https://merchandising.startidea.es/api/cron/midocean-sync
 *   Header: X-Cron-Secret: <CRON_SECRET>
 */
export async function POST(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  try {
    const result = await runMidoceanSync();
    return NextResponse.json(result, { status: result.ok ? 200 : 207 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
