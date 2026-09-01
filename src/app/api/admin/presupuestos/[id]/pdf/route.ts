import { isAdmin } from "@/lib/admin-session";
import { requireAdminSecret } from "@/lib/auth";
import { obtenerPresupuesto, presupuestoARender } from "@/lib/presupuesto-repo";
import { renderPresupuestoHtml } from "@/lib/presupuesto-html";
import {
  renderPresupuestoPdf,
  nombreArchivoPdf,
  ChromiumNoDisponible,
} from "@/lib/presupuesto-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Un render de cuatro páginas con las tipografías empotradas tarda un par de
// segundos; el margen es para que no lo corte la plataforma antes que nosotros.
export const maxDuration = 120;

/**
 * El presupuesto en PDF, de un clic.
 *
 * Mismo HTML que `…/imprimir` —el de la plantilla aprobada— pasado por Chromium
 * en el servidor. Si no hay Chromium, devuelve 503 diciendo qué falta: el panel
 * sigue teniendo «Ver documento» para imprimir desde el navegador.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    const auth = requireAdminSecret(req);
    if (!auth.ok) return new Response(auth.reason, { status: auth.status });
  }

  const { id } = await params;
  const presupuesto = await obtenerPresupuesto(id);
  if (!presupuesto) return new Response("No existe", { status: 404 });

  let html: string;
  try {
    html = renderPresupuestoHtml(presupuestoARender(presupuesto));
  } catch (e) {
    // Reglas de contenido (nombre de proveedor en una línea, por ejemplo).
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 422 },
    );
  }

  try {
    const pdf = await renderPresupuestoPdf(html);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nombreArchivoPdf(presupuesto.clienteNombre, presupuesto.numero)}"`,
        "Content-Length": String(pdf.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof ChromiumNoDisponible) {
      return Response.json({ error: e.message }, { status: 503 });
    }
    return Response.json(
      { error: `No se pudo generar el PDF: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }
}
