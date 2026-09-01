import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { sendEmail } from "@/lib/resend";
import { escapeHtml } from "@/lib/email-templates";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

const PatchSchema = z.object({
  action: z.enum(["approve", "reject"]),
  rejectionReason: z.string().max(500).optional().nullable(),
  commissionPct: z.number().int().min(1).max(50).optional(),
});

/**
 * PATCH /api/admin/partners/applications/[id]
 *
 * action=approve → crea AffiliatePartner con slug aleatorio opaco
 *                  + email al aplicante con su link único + dashboard
 * action=reject  → guarda motivo + email educado al aplicante
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const app = await prisma.partnerApplication.findUnique({ where: { id } });
  if (!app) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
  if (app.status !== "PENDING")
    return NextResponse.json({ error: `Ya está en estado ${app.status}` }, { status: 409 });

  const firstName = app.name.split(" ")[0];

  if (parsed.data.action === "approve") {
    // Slug opaco: nombre-base + 4 chars random (anti-enum, no se puede guess)
    const baseSlug = slugify(app.company || app.name);
    const slug = `${baseSlug}-${randomBytes(2).toString("hex")}`;

    const partner = await prisma.affiliatePartner.create({
      data: {
        slug,
        name: app.name,
        email: app.email,
        company: app.company,
        commissionPct: parsed.data.commissionPct ?? 10,
      },
    });
    const updated = await prisma.partnerApplication.update({
      where: { id },
      data: {
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewedBy: session.email,
        approvedPartnerId: partner.id,
      },
    });

    const refLink = `${SITE_URL}/?ref=${partner.slug}`;
    const dashboardUrl = `${SITE_URL}/partners/${partner.slug}`;

    await sendEmail({
      to: app.email,
      subject: `¡Aprobado! Bienvenido al programa partners de TodoMerchandising`,
      context: `partner-approved · ${partner.id}`,
      html: `
      <div style="font-family:Helvetica,Arial,sans-serif;background:#FFFFFF;padding:32px 16px;">
        <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;color:#231F27;">
          <div style="padding:32px 32px 24px;">
            <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b;">— Solicitud aprobada</p>
            <h1 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15;color:#231F27;">
              ¡Bienvenido ${escapeHtml(firstName)}!<br>
              <span style="color:#C41D51;">Ya eres partner.</span>
            </h1>
            <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#444;">
              Estás dentro del programa con comisión del <strong>${partner.commissionPct}%</strong>
              sobre cada pedido cerrado por clientes que vengan a través de ti.
            </p>
          </div>
          <div style="padding:0 32px 16px;">
            <p style="margin:0;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#6b6b6b;">Tu link único de partner</p>
            <div style="background:#F8DCE6;border:2px dashed #C41D51;padding:18px;text-align:center;border-radius:12px;margin-top:8px;">
              <p style="margin:0;font-family:monospace;font-size:16px;color:#C41D51;word-break:break-all;">${refLink}</p>
            </div>
            <p style="margin:10px 0 0;font-size:13px;color:#6b6b6b;line-height:1.5;">
              Comparte este enlace. Cualquier cotización que cierre el cliente
              en los siguientes 30 días queda atribuida a ti.
            </p>
          </div>
          <div style="padding:8px 32px 32px;text-align:center;">
            <a href="${dashboardUrl}" style="display:inline-block;background:#C41D51;color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:999px;font-size:15px;font-weight:600;">Ver mi dashboard →</a>
            <p style="margin:12px 0 0;font-size:12px;color:#6b6b6b;">Guarda este link, es tu acceso permanente.</p>
          </div>
          <div style="background:#231F27;padding:20px 32px;color:rgba(255,255,255,0.7);font-size:11px;line-height:1.6;">
            <p style="margin:0;color:#FFFFFF;font-family:Georgia,'Times New Roman',serif;font-size:16px;">todo<span style="color:#C41D51;">merchandising</span></p>
            <p style="margin:6px 0 0;">STARTIDEA MALAGA SL · CIF B19583632 · Granada · pedidos@startidea.es</p>
          </div>
        </div>
      </div>`,
    });

    return NextResponse.json({ ok: true, application: updated, partner });
  }

  // REJECT
  const reason = parsed.data.rejectionReason?.trim() || null;
  const updated = await prisma.partnerApplication.update({
    where: { id },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
      reviewedBy: session.email,
      rejectionReason: reason,
    },
  });

  await sendEmail({
    to: app.email,
    subject: `Sobre tu solicitud al programa partners`,
    context: `partner-rejected · ${app.id}`,
    html: `
    <div style="font-family:Helvetica,Arial,sans-serif;background:#FFFFFF;padding:32px 16px;">
      <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;color:#231F27;">
        <div style="padding:32px 32px;">
          <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b;">— Sobre tu solicitud</p>
          <h1 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.2;color:#231F27;">
            Hola ${escapeHtml(firstName)},
          </h1>
          <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#444;">
            Gracias por el interés. De momento no encajamos en programa partners ${reason ? `por lo siguiente:` : "."}
          </p>
          ${reason ? `<div style="margin:12px 0 0;padding:14px 16px;background:#FFFFFF;border-radius:10px;font-size:14px;color:#231F27;">${escapeHtml(reason)}</div>` : ""}
          <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#444;">
            Si en el futuro cambia tu situación, vuelve a aplicar sin problema.
          </p>
        </div>
        <div style="background:#231F27;padding:20px 32px;color:rgba(255,255,255,0.7);font-size:11px;line-height:1.6;">
          <p style="margin:0;color:#FFFFFF;font-family:Georgia,'Times New Roman',serif;font-size:16px;">todo<span style="color:#C41D51;">merchandising</span></p>
          <p style="margin:6px 0 0;">STARTIDEA MALAGA SL · CIF B19583632 · Granada · pedidos@startidea.es</p>
        </div>
      </div>
    </div>`,
  });

  return NextResponse.json({ ok: true, application: updated });
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
}
