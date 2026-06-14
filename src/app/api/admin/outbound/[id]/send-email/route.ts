import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { sendColdEmail, type ColdEmailDraft } from "@/lib/outbound-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/outbound/[id]/send-email
 *
 * Genera (IA) y opcionalmente envía un email frío B2B compliant a un lead.
 *   body { preview: true }            → devuelve el borrador (subject+body+unsubUrl) SIN enviar
 *   body { draft: {subject, body} }   → envía exactamente ese texto (revisado por admin)
 *   body {}                           → genera con IA y envía
 *
 * Guardas de compliance dentro de sendColdEmail: supresión, email presente,
 * pie legal LSSI + link de baja.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    preview?: boolean;
    draft?: { subject?: unknown; body?: unknown };
  };

  const preview = body.preview === true;
  const draft: ColdEmailDraft | undefined =
    body.draft && typeof body.draft.subject === "string" && typeof body.draft.body === "string"
      ? { subject: body.draft.subject, body: body.draft.body }
      : undefined;

  const result = await sendColdEmail(id, { preview, draft });
  if (!result.ok) {
    const status = result.code === "SUPPRESSED" ? 409 : result.code === "NO_EMAIL" ? 422 : 400;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }
  return NextResponse.json(result);
}
