import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/auth";
import {
  getVerificationToken,
  insertWebResource,
  listWebResources,
} from "@/lib/google-site-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Site Verification API admin endpoint.
 *
 *   GET ?action=init       → solicita token a Google + devuelve el TXT que añadir al DNS
 *   GET ?action=confirm    → llama insertWebResource para que Google verifique el TXT
 *   GET ?action=list       → lista propiedades verificadas por esta SA
 *
 * Body por defecto: verificación de la Domain property merchandising.hubstartidea.es.
 */
const DEFAULT_SITE = {
  identifier: "merchandising.hubstartidea.es",
  type: "INET_DOMAIN" as const,
};

export async function GET(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const action = new URL(req.url).searchParams.get("action") || "init";

  try {
    if (action === "init") {
      const r = await getVerificationToken(DEFAULT_SITE, "DNS_TXT");
      return NextResponse.json({
        action,
        ok: r.ok,
        status: r.status,
        token: r.token,
        instructions: r.ok
          ? {
              dnsRecord: {
                host: DEFAULT_SITE.identifier,
                type: "TXT",
                value: r.token,
                ttl: 3600,
              },
              nextStep: "Una vez el TXT esté propagado, llamar ?action=confirm",
            }
          : undefined,
        raw: r.raw,
      });
    }

    if (action === "confirm") {
      const r = await insertWebResource(DEFAULT_SITE, "DNS_TXT");
      return NextResponse.json({
        action,
        ok: r.ok,
        status: r.status,
        raw: r.raw,
        nextStep: r.ok
          ? "Verificación confirmada. Reintentar POST /api/admin/indexing/notify"
          : "Verificación falló — comprobar TXT en DNS y propagación",
      });
    }

    if (action === "list") {
      const r = await listWebResources();
      return NextResponse.json({ action, ok: r.ok, status: r.status, raw: r.raw });
    }

    return NextResponse.json(
      { error: "action debe ser init, confirm, o list" },
      { status: 400 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
