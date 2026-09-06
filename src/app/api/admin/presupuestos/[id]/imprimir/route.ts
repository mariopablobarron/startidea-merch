import { isAdmin } from "@/lib/admin-session";
import { requireAdminSecret } from "@/lib/auth";
import { obtenerPresupuesto, presupuestoARender } from "@/lib/presupuesto-repo";
import { renderPresupuestoHtml } from "@/lib/presupuesto-html";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * El documento listo para imprimir.
 *
 * Vive bajo /api/admin/ y no bajo /admin/ porque el middleware del panel
 * redirige TODO /admin/* a la pantalla de login mirando solo la cookie de
 * sesión: una ruta de documento ahí dentro no se puede pedir con
 * X-Admin-Secret desde un script.
 *
 * Devuelve el HTML del presupuesto tal cual, sin el layout del panel: es el
 * mismo que renderiza `generar-pdf.sh` con Chromium. Desde el navegador,
 * Imprimir → Guardar como PDF (A4, sin márgenes, con gráficos de fondo) da el
 * PDF del formato aprobado.
 *
 * No se genera el PDF en el servidor a propósito: haría falta un Chromium
 * dentro de la imagen Docker (hoy `node:22-alpine`), y son ~300 MB más en cada
 * despliegue para ahorrar un atajo de teclado. Si algún día hace falta el PDF
 * automático —para adjuntarlo a un correo, por ejemplo— este mismo HTML es la
 * entrada de ese render.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Sesión de panel o X-Admin-Secret, como el resto del admin: así el mismo
  // HTML se puede pedir desde un script para renderizar el PDF sin navegador.
  if (!(await isAdmin())) {
    const auth = requireAdminSecret(req);
    if (!auth.ok) return new Response(auth.reason, { status: auth.status });
  }

  const { id } = await params;
  const presupuesto = await obtenerPresupuesto(id);
  if (!presupuesto) return new Response("No existe", { status: 404 });

  try {
    const html = renderPresupuestoHtml(presupuestoARender(presupuesto));
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // Un presupuesto no se cachea: se está editando mientras se mira.
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    // Las reglas de contenido (no nombrar proveedores) revientan el render a
    // propósito. Mejor un mensaje claro en pantalla que un PDF con la fuga.
    const mensaje = e instanceof Error ? e.message : String(e);
    return new Response(
      `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>No se puede generar</title></head>` +
        `<body style="font-family:system-ui;max-width:34rem;margin:4rem auto;line-height:1.6">` +
        `<h1 style="font-size:1.2rem">Este presupuesto no se puede emitir todavía</h1>` +
        `<p>${mensaje.replace(/[<>&]/g, "")}</p></body></html>`,
      { status: 422, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}
