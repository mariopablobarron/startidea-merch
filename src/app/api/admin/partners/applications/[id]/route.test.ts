/**
 * Tests para PATCH /api/admin/partners/applications/[id].
 *
 * `name` (y `rejectionReason`, aportado por el admin al rechazar) acaban en
 * el HTML de los emails de aprobación/rechazo del programa partners.
 * `name` en particular lo escribe quien rellena el formulario público de
 * solicitud (/api/partners/apply) — dato de usuario sin confiar. Un nombre
 * con markup sin escapar podría inyectar un link o script suplantando la
 * marca de TodoMerchandising dentro de un email que el solicitante sí
 * espera recibir.
 *
 * Se comprueba el HTML real que le llega a `sendEmail`, con literales
 * fijos — nunca reconstruyendo el escapado con `escapeHtml` dentro del
 * test, porque eso pasaría en verde aunque se quitara el escape real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const affiliatePartnerCreate = vi.fn();
const partnerApplicationUpdate = vi.fn();
const sendEmail = vi.fn();
const authenticateAdminRequest = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    partnerApplication: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => partnerApplicationUpdate(...a),
    },
    affiliatePartner: {
      create: (...a: unknown[]) => affiliatePartnerCreate(...a),
    },
  },
}));

vi.mock("@/lib/admin-auth", () => ({
  authenticateAdminRequest: (...a: unknown[]) => authenticateAdminRequest(...a),
}));

vi.mock("@/lib/resend", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
}));

import { PATCH } from "./route";

function makeReq(body: unknown): Request {
  return new Request("https://test/api/admin/partners/applications/app_atk", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ATTACK_NAME = '<script>alert(1)</script>"onmouseover="x';
const ATTACK_REASON = '<img src=x onerror="alert(2)">no cumple"criterios"';

beforeEach(() => {
  findUnique.mockReset();
  affiliatePartnerCreate.mockReset();
  partnerApplicationUpdate.mockReset();
  sendEmail.mockReset();
  authenticateAdminRequest.mockReset();

  authenticateAdminRequest.mockResolvedValue({
    userId: "admin_1",
    email: "admin@startidea.es",
    name: "Admin",
    role: "CEO",
  });
  partnerApplicationUpdate.mockResolvedValue({ id: "app_atk" });
  sendEmail.mockResolvedValue({ ok: true });
});

describe("partners/applications · escapado HTML de datos de usuario", () => {
  it("approve: el nombre malicioso sale escapado en el saludo de bienvenida", async () => {
    findUnique.mockResolvedValue({
      id: "app_atk",
      name: ATTACK_NAME,
      email: "atacante@example.com",
      company: "Acme",
      status: "PENDING",
    });
    affiliatePartnerCreate.mockResolvedValue({
      id: "partner_1",
      slug: "acme-ab12",
      commissionPct: 10,
    });

    const res = await PATCH(makeReq({ action: "approve" }), {
      params: Promise.resolve({ id: "app_atk" }),
    });
    expect(res.status).toBe(200);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const html = (sendEmail.mock.calls[0][0] as { html: string }).html;
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;&quot;onmouseover=&quot;x");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain('onmouseover="x"');
  });

  it("reject: el nombre y el motivo maliciosos salen escapados en el email de rechazo", async () => {
    findUnique.mockResolvedValue({
      id: "app_atk",
      name: ATTACK_NAME,
      email: "atacante@example.com",
      company: "Acme",
      status: "PENDING",
    });

    const res = await PATCH(
      makeReq({ action: "reject", rejectionReason: ATTACK_REASON }),
      { params: Promise.resolve({ id: "app_atk" }) },
    );
    expect(res.status).toBe(200);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const html = (sendEmail.mock.calls[0][0] as { html: string }).html;

    // Saludo (nombre)
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;&quot;onmouseover=&quot;x");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain('onmouseover="x"');

    // Motivo del rechazo
    expect(html).toContain(
      "&lt;img src=x onerror=&quot;alert(2)&quot;&gt;no cumple&quot;criterios&quot;",
    );
    expect(html).not.toContain('<img src=x onerror="alert(2)">');
  });
});
